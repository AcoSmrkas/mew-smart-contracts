{
  // Mew Lock v2: ERG and tokens locked until a block height. Only the owner (R4) can
  // withdraw, from the unlock height (R5) on, paying a 3% fee to dev.
  //
  // Rules:
  // - fees are computed in BigInt, so any token amount can be withdrawn;
  // - every input other than this lock must be a plain wallet (P2PK) box, so its dev
  //   output can't also count as another contract's fee.
  // The previous version is legacy/mew-lock/lock-2026-06.es; the apps still serve its locks.
  // The fees, register layout and outputs are otherwise the same as v1:
  // - 3% of the ERG when the box holds more than 100000 nanoERG;
  // - 3% of each token amount above 34 raw units;
  // - the owner gets the rest, dev gets the fee, each in any output.
  //
  // R4 GroupElement  owner
  // R5 Int           unlock height
  // R6..R8           app metadata (lock time, name, description), not read here
  val owner: GroupElement = SELF.R4[GroupElement].get
  val unlockHeight: Int   = SELF.R5[Int].get
  val ownerProp: SigmaProp = proveDlog(owner)

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

  val feeNum: BigInt          = 3000L.toBigInt
  val feeDenom: BigInt        = 100000L.toBigInt
  val zero: BigInt            = 0.toBigInt
  val devSigmaProp: SigmaProp = PK("9hMRoSfXZJs83S2hLqxZZ8ivw1L8FFgSk7RJB7eq2qXyxU2paED")

  val ergFee: BigInt = if (SELF.value > 100000L) (SELF.value.toBigInt * feeNum) / feeDenom else zero
  val tokenFee = { (amount: Long) =>
    if (amount > 34L) (amount.toBigInt * feeNum) / feeDenom else zero
  }
  val anyFee: Boolean = ergFee > zero || SELF.tokens.exists { (t: (Coll[Byte], Long)) => tokenFee(t._2) > zero }

  val devPaid: Boolean = !anyFee || OUTPUTS.exists { (output: Box) =>
    output.propositionBytes == devSigmaProp.propBytes &&
    output.value.toBigInt >= ergFee &&
    SELF.tokens.forall { (t: (Coll[Byte], Long)) =>
      val fee: BigInt = tokenFee(t._2)
      fee == zero || output.tokens.exists { (d: (Coll[Byte], Long)) => d._1 == t._1 && d._2.toBigInt >= fee }
    }
  }

  val ownerPaid: Boolean = OUTPUTS.exists { (output: Box) =>
    output.propositionBytes == ownerProp.propBytes &&
    output.value.toBigInt >= SELF.value.toBigInt - ergFee &&
    SELF.tokens.forall { (t: (Coll[Byte], Long)) =>
      val rest: BigInt = t._2.toBigInt - tokenFee(t._2)
      rest == zero || output.tokens.exists { (d: (Coll[Byte], Long)) => d._1 == t._1 && d._2.toBigInt >= rest }
    }
  }

  ownerProp && sigmaProp(
    HEIGHT >= unlockHeight && onlyWalletInputs && noOutputHere && devPaid && ownerPaid
  )
}
