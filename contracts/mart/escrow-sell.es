{
  val priceInTokens: BigInt       = SELF.R4[BigInt].get
  val sellerSigmaProp: SigmaProp  = SELF.R5[SigmaProp].get
  val feeNum: Long                = if (SELF.R6[Long].get > 2000L) SELF.R6[Long].get else 2000L
  val assetTokenId: Coll[Byte]    = SELF.R7[Coll[Byte]].get
  val buyerSigmaProp: SigmaProp   = SELF.R8[SigmaProp].get
  val royaltyFee: Long            = SELF.R9[Long].get
  val devSigmaProp: SigmaProp     = PK("9hMRoSfXZJs83S2hLqxZZ8ivw1L8FFgSk7RJB7eq2qXyxU2paED")
  val feeDenom: Long              = 100000L
  val totalFee: Long              = (royaltyFee + feeNum)
  val feeInTokensDev: BigInt      = (priceInTokens.toBigInt * feeNum.toBigInt) / feeDenom.toBigInt
  val feeInTokens: BigInt         = (priceInTokens.toBigInt * totalFee.toBigInt) / feeDenom.toBigInt
  val _action: Byte               = getVar[Byte](0).get
  val isSellOrder: Boolean        = (_action == 1.toByte)
  val isCancelOrder: Boolean      = (_action == 2.toByte)
  val isErgPayment: Boolean       = (assetTokenId.size == 0)

  val validTransfer: Boolean = {
    OUTPUTS.forall{(output: Box) => {
      (output.propositionBytes != SELF.propositionBytes)
    }}
  }

  val thisScBoxes: Box = INPUTS.filter { (input: Box) =>
    input.propositionBytes == SELF.propositionBytes
  }

  val validSingleSc: Boolean = {
    thisScBoxes.size == 1
  }

  if (isSellOrder) {
    val validSellOrderTx: Boolean = {
      val seller: Box  = OUTPUTS(0)
      val dev: Box     = OUTPUTS(1)

      val validSellerPaid: Boolean = {
        if (isErgPayment) {
          allOf(Coll(
            (seller.value.toBigInt >= priceInTokens - feeInTokens),
            (seller.propositionBytes == sellerSigmaProp.propBytes)
          ))
        } else {
          allOf(Coll(
            (seller.tokens(0)._1 == assetTokenId),
            (seller.tokens(0)._2.toBigInt >= priceInTokens - feeInTokens),
            (seller.propositionBytes == sellerSigmaProp.propBytes)
          ))
        }
      }

      val validDevFee: Boolean = {
        if (isErgPayment) {
          allOf(Coll(
            (dev.value.toBigInt >= feeInTokensDev),
            (dev.propositionBytes == devSigmaProp.propBytes)
          ))
        } else {
          allOf(Coll(
            (dev.propositionBytes == devSigmaProp.propBytes),
            (dev.tokens(0)._1 == assetTokenId),
            (dev.tokens(0)._2.toBigInt >= feeInTokensDev),
          ))
        }
      }

      allOf(Coll(
        validSellerPaid,
        validDevFee,
        validSingleSc,
        validTransfer
      ))
    }

    sigmaProp(validSellOrderTx) && buyerSigmaProp
  } else if (isCancelOrder) {
    val validCancelOrderTx: Boolean = {
      val seller: Box = OUTPUTS(0)
      val dev: Box    = OUTPUTS(1)

      val validRefund: Boolean = {
        allOf(Coll(
          (seller.value == SELF.value),
          (seller.propositionBytes == sellerSigmaProp.propBytes),
          (seller.tokens == SELF.tokens)
        ))
      }

      allOf(Coll(
        validRefund,
        validSingleSc,
        validTransfer
      ))
    }

    sigmaProp(validCancelOrderTx) && sellerSigmaProp
  } else {
    sigmaProp(false)
  }
}