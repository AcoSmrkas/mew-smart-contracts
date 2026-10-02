// Proves that the sources in this repo are the contracts on chain.
//
//   npm run verify          recompile every contract in deployed.json and
//                           compare it, byte for byte, with the pinned ErgoTree
//   npm run verify:chain    also check each Lithos Lock genesis and NFT on
//                           mainnet, and count the boxes at every other contract
//
// Exit code 1 when any check fails.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '@fleet-sdk/compiler';
import { ErgoAddress } from '@fleet-sdk/core';
import { hex } from '@fleet-sdk/crypto';
import { SByte, SColl, SInt, SLong } from '@fleet-sdk/serializer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));
const withChain = process.argv.includes('--chain');
const EXPLORER = 'https://api.ergoplatform.com/api/v1';

let failed = 0;
function check(ok, what, detail = '') {
	if (!ok) failed++;
	console.log(`  ${ok ? '✓' : '✗'} ${what}${detail ? `: ${detail}` : ''}`);
}

async function getJson(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
	return res.json();
}

/** How many boxes the explorer has ever seen at this ErgoTree. */
async function boxCount(tree) {
	return (await getJson(`${EXPLORER}/boxes/byErgoTree/${tree}?limit=1`)).total;
}

// --- Plain contracts: the source compiles straight to the pinned tree. -------

function compileSource(entry) {
	return compile(read(entry.source), {
		version: entry.treeVersion,
		segregateConstants: entry.segregateConstants ?? true,
		includeSize: entry.includeSize ?? entry.treeVersion > 0,
		network: 'mainnet'
	}).toHex();
}

async function verifyPlain(entry) {
	const tree = compileSource(entry);
	const pinned = ErgoAddress.fromBase58(entry.address).ergoTree;
	check(tree === pinned, 'source compiles to the pinned address', entry.address);
	// Information only: a contract nobody has used yet is not a failure.
	if (withChain) console.log(`  · ${await boxCount(pinned)} box(es) on mainnet so far`);
}

// --- Lithos Lock: every parameter is a compile-time constant. ----------------
// Mirrors compileCampaign in mew-lock (src/lib/lithos/compile.ts).

const LITHOS_SOURCES = {
	2: 'contracts/lithos-lock/campaign-v2.es',
	3: 'contracts/lithos-lock/campaign.es'
};
const assetBytes = (id) => SColl(SByte, id ? hex.decode(id) : new Uint8Array());

function compileLithosCampaign(d, positionTree) {
	const p = d.params;
	return compile(read(LITHOS_SOURCES[d.contract ?? 2]), {
		version: 1,
		network: 'mainnet',
		map: {
			_stakeId: assetBytes(p.stakeId),
			_rewardId: assetBytes(p.rewardId),
			_positionTree: SColl(SByte, hex.decode(positionTree)),
			_feeTree: SColl(SByte, hex.decode(ErgoAddress.fromBase58(p.feeAddress).ergoTree)),
			_start: SInt(p.start),
			_end: SInt(p.end),
			_grace: SInt(p.grace),
			_slack: SInt(p.slack),
			_tierBlocks: SColl(SInt, p.tiers.map((t) => t.blocks)),
			_tierBoost: SColl(SLong, p.tiers.map((t) => BigInt(t.boostBps))),
			_minLock: SLong(BigInt(p.minLock)),
			_deposit: SLong(BigInt(p.deposit)),
			_reserve: SLong(BigInt(p.reserve))
		}
	}).toHex();
}

async function verifyLithos(entry) {
	const d = readJson(entry.deployment);
	const positionTree = compile(read('contracts/lithos-lock/position.es'), {
		version: 1,
		network: 'mainnet'
	}).toHex();
	check(positionTree === d.positionTree, 'position.es compiles to the pinned position tree');
	const campaignTree = compileLithosCampaign(d, d.positionTree);
	check(campaignTree === d.campaignTree, `campaign v${d.contract ?? 2} + params compile to the pinned campaign tree`);
	if (!withChain) return;
	const genesis = await getJson(`${EXPLORER}/transactions/${d.genesisTxId}`);
	const box = genesis.outputs.find((o) => o.ergoTree === d.campaignTree);
	check(!!box, 'the genesis transaction created the campaign box', d.genesisTxId);
	check(box?.assets?.[0]?.tokenId === d.campaignNftId, 'and it holds the campaign NFT');
	const nft = await getJson(`${EXPLORER}/tokens/${d.campaignNftId}`);
	check(BigInt(nft.emissionAmount) === 1n, 'the campaign NFT supply is exactly 1');
}

// -----------------------------------------------------------------------------

const verifiers = { plain: verifyPlain, 'lithos-campaign': verifyLithos };

for (const entry of readJson('deployed.json').contracts) {
	console.log(`${entry.name}${entry.status === 'live' ? '' : ` (${entry.status})`}`);
	try {
		await verifiers[entry.kind ?? 'plain'](entry);
	} catch (e) {
		check(false, 'verification ran', e.message);
	}
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
