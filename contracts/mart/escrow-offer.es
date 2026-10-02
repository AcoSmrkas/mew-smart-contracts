{
  // Mart Escrow Offer v2: an Offer (contracts/mart/offer.es) that only the
  // counterparty named in R8 may fill. The offerer (R5) receives the wanted amount at
  // OUTPUTS(0), dev receives the fee at OUTPUTS(1), and the counterparty takes what
  // the offer holds.
  //
  // Rules:
  // - the offerer (R5) receives exactly the wanted amount at OUTPUTS(0);
  // - every input other than this offer must be a plain wallet (P2PK) box, so the
  //   outputs this offer checks can't also be claimed by another contract in the same transaction.
  // - a token whose fee rounds to zero needs no dev payment;
  // - each path reads only the registers it needs.
  // The previous version is legacy/mart/escrow-offer-2026-06.es; the apps still serve its orders.
  // Register and output layout are unchanged, so v1 transaction builders work as-is.
  //
  // R4 BigInt      amount of the wanted token
  // R5 SigmaProp   offerer
  // R6 Long        fee numerator over 100000 (at least 2000)
  // R7 Coll[Byte]  wanted token id
  // R8 SigmaProp   counterparty, the only one who may fill
  // R9             app metadata, not read here
  val offerer: SigmaProp = SELF.R5[SigmaProp].get
  val action: Byte       = getVar[Byte](0).get

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
    val wanted: Coll[Byte]      = SELF.R7[Coll[Byte]].get
    val feeDenom: BigInt        = 100000L.toBigInt
    val minBoxValue: Long       = 1000000L
    val devSigmaProp: SigmaProp = PK("9hMRoSfXZJs83S2hLqxZZ8ivw1L8FFgSk7RJB7eq2qXyxU2paED")
    val counterparty: SigmaProp = SELF.R8[SigmaProp].get
    val payee: Box              = OUTPUTS(0)
    val dev: Box                = OUTPUTS(1)

    val offererPaid: Boolean = allOf(Coll(
      payee.propositionBytes == offerer.propBytes,
      payee.tokens.exists { (t: (Coll[Byte], Long)) => t._1 == wanted && t._2.toBigInt == price }
    ))

    // The wanted token comes from the deliverer's wallet, not from this offer box.
    val delivered: Boolean = INPUTS.exists { (input: Box) =>
      input.id != SELF.id && input.tokens.exists { (t: (Coll[Byte], Long)) =>
        t._1 == wanted && t._2.toBigInt >= price
      }
    }

    val devPaid: Boolean = allOf(Coll(
      dev.propositionBytes == devSigmaProp.propBytes,
      SELF.tokens.forall { (t: (Coll[Byte], Long)) =>
        val fee: BigInt = (t._2.toBigInt * feeNum.toBigInt) / feeDenom
        fee == 0.toBigInt || dev.tokens.exists { (d: (Coll[Byte], Long)) =>
          d._1 == t._1 && d._2.toBigInt >= fee
        }
      },
      SELF.value <= minBoxValue ||
        dev.value.toBigInt >= ((SELF.value - minBoxValue).toBigInt * feeNum.toBigInt) / feeDenom
    ))

    sigmaProp(onlyWalletInputs && noOutputHere && offererPaid && delivered && devPaid) && counterparty
  } else if (action == 2.toByte) {
    // Cancel: the offerer signs and gets the offer back untouched.
    val refund: Box = OUTPUTS(0)
    offerer && sigmaProp(allOf(Coll(
      onlyWalletInputs,
      noOutputHere,
      refund.propositionBytes == offerer.propBytes,
      refund.value == SELF.value,
      refund.tokens == SELF.tokens
    )))
  } else {
    sigmaProp(false)
  }
}
