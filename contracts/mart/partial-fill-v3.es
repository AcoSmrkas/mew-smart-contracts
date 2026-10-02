{
  // Mart Partial Fill V3: one fungible token position that can be bought in parts.
  //
  // V3 replaces V2 (crc32 618078225), which could be double-satisfied. V2 checked
  // only that OUTPUTS(0) paid the seller "at least" its price, so one payment box
  // satisfied several listing inputs of the same seller at once (two V2 listings,
  // or a V2 plus a V1 sell listing) and the buyer paid once for all of them.
  // A V3 buy therefore requires every other input to be a plain P2PK wallet box:
  // this listing is the only contract input, so nothing else can claim its payouts.
  //
  // SELF.R4 is the price still due for the quantity currently in the box. A partial
  // fill carries the remaining quantity and remaining price into exactly one
  // successor box using this same ErgoTree.
  //
  // Everything a buy reads is declared inside the buy branch. Top-level vals are
  // evaluated eagerly, and V2 required a well-formed position even to cancel, which
  // locked a listing priced at 0 or priced in its own token forever. Here the
  // seller can always take a listing back.
  val sellerSigmaProp: SigmaProp = SELF.R5[SigmaProp].get
  val action: Byte               = getVar[Byte](0).get
  val sameScriptOutputs: Coll[Box] = OUTPUTS.filter { (output: Box) =>
    output.propositionBytes == SELF.propositionBytes
  }

  if (action == 1.toByte) {
    val remainingPrice: BigInt     = SELF.R4[BigInt].get
    val feeNum: Long               = if (SELF.R6[Long].get > 2000L) SELF.R6[Long].get else 2000L
    val paymentTokenId: Coll[Byte] = SELF.R7[Coll[Byte]].get
    val metadata: Coll[Byte]       = SELF.R8[Coll[Byte]].get
    val royaltyFee: Long           = SELF.R9[Long].get
    val devSigmaProp: SigmaProp    = PK("9hMRoSfXZJs83S2hLqxZZ8ivw1L8FFgSk7RJB7eq2qXyxU2paED")
    val feeDenom: BigInt           = 100000L.toBigInt
    val minBoxValue: Long          = 1000000L
    val isErgPayment: Boolean      = paymentTokenId.size == 0
    val saleTokens: Coll[(Coll[Byte], Long)] = SELF.tokens

    // A P2PK ErgoTree is exactly 0x00 0x08 0xcd followed by a 33-byte public key.
    // Every input other than this listing must be one, which also rules out a
    // second listing box of this contract in the same transaction.
    val p2pkPrefix: Coll[Byte] = fromBase16("0008cd")
    val onlyWalletInputs: Boolean = INPUTS.forall { (input: Box) =>
      input.id == SELF.id || (
        input.propositionBytes.size == 36 &&
        input.propositionBytes.slice(0, 3) == p2pkPrefix
      )
    }

    // V3 supports a single non-ERG fungible position only. Bundles keep using the
    // full-fill contract. Royalties keep V1's payout semantics on every fill.
    val validPosition: Boolean = allOf(Coll(
      SELF.value == minBoxValue,
      saleTokens.size == 1,
      saleTokens(0)._1 != paymentTokenId,
      saleTokens(0)._2 > 0L,
      remainingPrice > 0,
      royaltyFee >= 0L,
      feeNum + royaltyFee < 100000L
    ))

    val currentQty: BigInt = saleTokens(0)._2.toBigInt

    // With a successor box, infer how much was bought from the inventory reduction.
    // If no successor exists, this is the final fill and the remaining price is paid
    // in full.
    val successorQty: BigInt = if (sameScriptOutputs.size == 1) {
      sameScriptOutputs(0).tokens(0)._2.toBigInt
    } else {
      0.toBigInt
    }
    val filledQty: BigInt = currentQty - successorQty
    val fillPrice: BigInt = if (sameScriptOutputs.size == 1) {
      // Ceiling rounding charges any indivisible payment atom to this fill and
      // preserves an exact remaining price for subsequent fills.
      (remainingPrice * filledQty + currentQty - 1) / currentQty
    } else {
      remainingPrice
    }

    // Keep V1's fee semantics: royalties reduce the seller payout and are emitted by
    // the transaction builder, while this script enforces the seller and dev payouts.
    val totalFee: BigInt     = feeNum.toBigInt + royaltyFee.toBigInt
    val devFee: BigInt       = (fillPrice * feeNum.toBigInt) / feeDenom
    val sellerPayout: BigInt = fillPrice - (fillPrice * totalFee) / feeDenom

    val seller: Box = OUTPUTS(0)
    val dev: Box    = OUTPUTS(1)

    val validSellerPaid: Boolean = if (isErgPayment) {
      allOf(Coll(
        seller.value.toBigInt >= sellerPayout,
        seller.propositionBytes == sellerSigmaProp.propBytes
      ))
    } else {
      allOf(Coll(
        seller.propositionBytes == sellerSigmaProp.propBytes,
        seller.tokens.exists { (token: (Coll[Byte], Long)) =>
          token._1 == paymentTokenId && token._2.toBigInt >= sellerPayout
        }
      ))
    }

    val validDevPaid: Boolean = if (isErgPayment) {
      allOf(Coll(
        dev.value.toBigInt >= devFee,
        dev.propositionBytes == devSigmaProp.propBytes
      ))
    } else {
      allOf(Coll(
        dev.propositionBytes == devSigmaProp.propBytes,
        dev.tokens.exists { (token: (Coll[Byte], Long)) =>
          token._1 == paymentTokenId && token._2.toBigInt >= devFee
        }
      ))
    }

    val validSuccessor: Boolean = if (sameScriptOutputs.size == 1) {
      val successor: Box = sameScriptOutputs(0)
      allOf(Coll(
        successor.value == SELF.value,
        successor.tokens.size == 1,
        successor.tokens(0)._1 == saleTokens(0)._1,
        successorQty > 0,
        successorQty < currentQty,
        successor.R4[BigInt].get == remainingPrice - fillPrice,
        successor.R4[BigInt].get > 0,
        successor.R5[SigmaProp].get.propBytes == sellerSigmaProp.propBytes,
        successor.R6[Long].get == SELF.R6[Long].get,
        successor.R7[Coll[Byte]].get == paymentTokenId,
        successor.R8[Coll[Byte]].get == metadata,
        successor.R9[Long].get == royaltyFee
      ))
    } else {
      sameScriptOutputs.size == 0
    }

    sigmaProp(allOf(Coll(
      onlyWalletInputs,
      validPosition,
      OUTPUTS.size >= 2,
      validSellerPaid,
      validDevPaid,
      validSuccessor
    )))
  } else if (action == 2.toByte) {
    // Cancel: the seller signs, and the listing goes back to them untouched.
    val refund: Box = OUTPUTS(0)
    sellerSigmaProp && sigmaProp(allOf(Coll(
      sameScriptOutputs.size == 0,
      refund.propositionBytes == sellerSigmaProp.propBytes,
      refund.value == SELF.value,
      refund.tokens == SELF.tokens
    )))
  } else {
    sigmaProp(false)
  }
}
