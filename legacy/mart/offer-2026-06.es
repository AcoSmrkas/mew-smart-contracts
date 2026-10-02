{
  val priceInTokens: BigInt       = SELF.R4[BigInt].get
  val sellerSigmaProp: SigmaProp  = SELF.R5[SigmaProp].get
  val feeNum: Long                = if (SELF.R6[Long].get > 2000L) SELF.R6[Long].get else 2000L
  val assetTokenId: Coll[Byte]    = SELF.R7[Coll[Byte]].get
  val royaltyFee: Long            = SELF.R9[Long].get
  val devSigmaProp: SigmaProp     = PK("9hMRoSfXZJs83S2hLqxZZ8ivw1L8FFgSk7RJB7eq2qXyxU2paED")
  val feeDenom: Long              = 100000L
  val totalFee: Long              = (royaltyFee + feeNum)
  val _action: Byte               = getVar[Byte](0).get
  val isSellOrder: Boolean        = (_action == 1.toByte)
  val isCancelOrder: Boolean      = (_action == 2.toByte)
  val hasErgOffer: Boolean        = SELF.value > 1000000L

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
      val seller: Box           = OUTPUTS(0)
      val dev: Box              = OUTPUTS(1)
      val sellerTokens: Tokens  = OUTPUTS(0).tokens
      val devTokens: Tokens     = OUTPUTS(1).tokens
      val inTokens: Tokens      = SELF.tokens

      val filteredInputs: Box = INPUTS.filter { (input: Box) =>
        input.propositionBytes != SELF.propositionBytes
      }

      val validTokenPaid: Boolean = filteredInputs.exists { (input: Box) =>
        input.tokens.exists { (token: (Coll[Byte], Long)) =>
            token._1 == assetTokenId && token._2 >= priceInTokens
        }
      } && sellerTokens.exists { (sellerToken: (Coll[Byte], Long)) =>
        sellerToken._1 == assetTokenId && sellerToken._2 == priceInTokens
      }

      val validDevPaid: Boolean = {
        inTokens.forall { (inToken: (Coll[Byte], Long)) => 
          devTokens.exists { (devToken: (Coll[Byte], Long)) =>
            inToken._1 == devToken._1 && devToken._2 >= (inToken._2.toBigInt * feeNum.toBigInt) / feeDenom.toBigInt
          }
        }
      } && ((hasErgOffer && dev.value >= ((SELF.value.toBigInt - 1000000L) * feeNum.toBigInt) / feeDenom.toBigInt) || !hasErgOffer)

      val validDevBox: Boolean = dev.propositionBytes == devSigmaProp.propBytes

      allOf(Coll(
        validTokenPaid,
        validDevPaid,
        validDevBox,
        validTransfer,
        validSingleSc
      ))
    }

    sigmaProp(validSellOrderTx)
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
        validTransfer,
        validSingleSc
      ))
    }

    sigmaProp(validCancelOrderTx) && sellerSigmaProp
  } else {
    sigmaProp(false)
  }
}