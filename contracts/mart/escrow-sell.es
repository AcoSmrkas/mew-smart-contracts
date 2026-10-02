{
  // Mart Escrow Sell v2: a Sell listing (contracts/mart/sell.es) that only the buyer
  // named in R8 may buy. The buyer pays the seller (R5) at OUTPUTS(0) and dev at
  // OUTPUTS(1) and takes the listing; the seller can always cancel.
  //
  // Rules:
  // - every input other than this listing must be a plain wallet (P2PK) box, so the
  //   outputs this listing checks can't also be claimed by another contract in the same transaction.
  // - cancel reads only R5, so a seller can always take a listing back; a missing R9
  //   means no royalty;
  // - a token payment is found by token id, and a fee that rounds to zero needs no token.
  // The previous version is legacy/mart/escrow-sell-2026-06.es; the apps still serve its listings.
  // Register and output layout are unchanged, so v1 transaction builders work as-is.
  //
  // R4 BigInt      price, in raw units of the payment asset
  // R5 SigmaProp   seller
  // R6 Long        fee numerator over 100000 (at least 2000)
  // R7 Coll[Byte]  payment token id; empty = ERG
  // R8 SigmaProp   buyer, the only one who may buy
  // R9 Long        royalty numerator over 100000: lowers the seller payout; the app pays it
  val seller: SigmaProp = SELF.R5[SigmaProp].get
  val action: Byte      = getVar[Byte](0).get

  // A P2PK ErgoTree is exactly 0x00 0x08 0xcd followed by a 33-byte public key.
  val p2pkPrefix: Coll[Byte] = fromBase16("0008cd")
  val onlyWalletInputs: Boolean = INPUTS.forall { (input: Box) =>
    input.id == SELF.id || (
      input.propositionBytes.size == 36 &&
      input.propositionBytes.slice(0, 3) == p2pkPrefix
    )
  }
  val noOutputHere: Boolean = OUTPUTS.forall { (output: Box) =>
    output.propositionBytes != SELF.propositionBytes
  }

  if (action == 1.toByte) {
    val price: BigInt           = SELF.R4[BigInt].get
    val feeNum: Long            = if (SELF.R6[Long].get > 2000L) SELF.R6[Long].get else 2000L
    val payToken: Coll[Byte]    = SELF.R7[Coll[Byte]].get
    val royalty: Long           = SELF.R9[Long].getOrElse(0L)
    val feeDenom: BigInt        = 100000L.toBigInt
    val devSigmaProp: SigmaProp = PK("9hMRoSfXZJs83S2hLqxZZ8ivw1L8FFgSk7RJB7eq2qXyxU2paED")
    val isErgPayment: Boolean   = payToken.size == 0
    val devFee: BigInt          = (price * feeNum.toBigInt) / feeDenom
    val sellerPayout: BigInt    = price - (price * (feeNum + royalty).toBigInt) / feeDenom
    val buyer: SigmaProp        = SELF.R8[SigmaProp].get
    val payee: Box              = OUTPUTS(0)
    val dev: Box                = OUTPUTS(1)

    val sellerPaid: Boolean = payee.propositionBytes == seller.propBytes && (
      if (isErgPayment) payee.value.toBigInt >= sellerPayout
      else sellerPayout <= 0.toBigInt || payee.tokens.exists { (t: (Coll[Byte], Long)) =>
        t._1 == payToken && t._2.toBigInt >= sellerPayout
      }
    )
    val devPaid: Boolean = dev.propositionBytes == devSigmaProp.propBytes && (
      if (isErgPayment) dev.value.toBigInt >= devFee
      else devFee == 0.toBigInt || dev.tokens.exists { (t: (Coll[Byte], Long)) =>
        t._1 == payToken && t._2.toBigInt >= devFee
      }
    )

    sigmaProp(onlyWalletInputs && noOutputHere && sellerPaid && devPaid) && buyer
  } else if (action == 2.toByte) {
    // Cancel: the seller signs and gets the listing back untouched.
    val refund: Box = OUTPUTS(0)
    seller && sigmaProp(allOf(Coll(
      onlyWalletInputs,
      noOutputHere,
      refund.propositionBytes == seller.propBytes,
      refund.value == SELF.value,
      refund.tokens == SELF.tokens
    )))
  } else {
    sigmaProp(false)
  }
}
