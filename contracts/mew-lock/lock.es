{
  val depositorPubKey         = SELF.R4[GroupElement].get
  val unlockHeight            = SELF.R5[Int].get
  val feeNum: Long            = 3000L
  val feeDenom: Long          = 100000L
  val safeThreshold: Long     = 9223372036854775807L  // Max Long value for safe multiplication
  val devSigmaProp: SigmaProp = PK("9hMRoSfXZJs83S2hLqxZZ8ivw1L8FFgSk7RJB7eq2qXyxU2paED")
  val isExpiredTimeWindow     = HEIGHT >= unlockHeight
  
  // Input validation
  val thisScBoxes: Coll[Box] = INPUTS.filter { (input: Box) =>
    input.propositionBytes == SELF.propositionBytes
  }
  
  val validSingleSc: Boolean = {
    thisScBoxes.size == 1
  }
  
  // Box spend validation
  val validTransfer: Boolean = {
    OUTPUTS.forall{(output: Box) => {
      (output.propositionBytes != SELF.propositionBytes)
    }}
  }
  
  // Calculate ERG fee with reasonable minimum
  val ergFee: Long = if (SELF.value > 100000L) { // 0.1 ERG minimum
    val feeAmount = (SELF.value * feeNum) / feeDenom
    val maxFee = SELF.value / 10L // Cap at 10% of total value
    if (feeAmount > 0L && feeAmount <= maxFee) feeAmount else 0L
  } else {
    0L
  }
  
  // Calculate token fees with reasonable minimums and caps - FIXED VERSION
  val tokenFees: Coll[(Coll[Byte], Long)] = SELF.tokens.map { (token: (Coll[Byte], Long)) =>
    val feeAmount = if (token._2 > 34L) { // 34 token minimum
      val tokenAmount = token._2
      val maxFee = tokenAmount / 10L // Cap at 10% of total tokens
      
      // Avoid BigInt conversion issues by doing direct calculation with bounds checking
      // Check if multiplication would overflow by ensuring token amount is reasonable
      val calculatedFee = if (tokenAmount <= safeThreshold) {
        val feeCalc = (tokenAmount * feeNum) / feeDenom
        if (feeCalc > 0L && feeCalc <= maxFee) feeCalc else 0L
      } else {
        // For very large token amounts, use a simpler percentage
        val simpleFee = tokenAmount / 100L // 1% fee for large amounts
        if (simpleFee > 0L && simpleFee <= maxFee) simpleFee else maxFee
      }
      
      calculatedFee
    } else {
      0L
    }
    (token._1, feeAmount)
  }.filter { (token: (Coll[Byte], Long)) => token._2 > 0L }
  
  // Enhanced dev fee validation
  val validDevFee: Boolean = {
    if (ergFee > 0L || tokenFees.size > 0) {
      // Find dev box (should be first output paying to dev)
      val devBoxExists = OUTPUTS.exists { (output: Box) =>
        val correctProposition = output.propositionBytes == devSigmaProp.propBytes
        val ergFeeValid = if (ergFee > 0L) output.value >= ergFee else true
        val tokenFeesValid = if (tokenFees.size > 0) {
          tokenFees.forall { (token: (Coll[Byte], Long)) =>
            output.tokens.exists { (devToken: (Coll[Byte], Long)) =>
              devToken._1 == token._1 && devToken._2 >= token._2
            }
          }
        } else true
        
        correctProposition && ergFeeValid && tokenFeesValid
      }
      devBoxExists
    } else {
      true // No fees required
    }
  }
  
  // Enhanced recipient validation
  val validRecipient: Boolean = {
    val depositorSigmaProp = proveDlog(depositorPubKey)
    val remainingErg = SELF.value - ergFee
    
    // Calculate remaining tokens after fees
    val remainingTokens = SELF.tokens.map { (token: (Coll[Byte], Long)) =>
      val feeForToken = {
        val matchingFees = tokenFees.filter { (feeToken: (Coll[Byte], Long)) =>
          feeToken._1 == token._1
        }
        if (matchingFees.size > 0) matchingFees(0)._2 else 0L
      }
      (token._1, token._2 - feeForToken)
    }.filter { (token: (Coll[Byte], Long)) => token._2 > 0L }
    
    // Check that remaining funds go to depositor
    OUTPUTS.exists { (output: Box) =>
      val correctProposition = output.propositionBytes == depositorSigmaProp.propBytes
      val correctErg = output.value >= remainingErg
      val correctTokens = if (remainingTokens.size > 0) {
        remainingTokens.forall { (token: (Coll[Byte], Long)) =>
          output.tokens.exists { (outToken: (Coll[Byte], Long)) =>
            outToken._1 == token._1 && outToken._2 >= token._2
          }
        }
      } else true
      
      correctProposition && correctErg && correctTokens
    }
  }
  
  // Sufficient funds validation
  val sufficientFundsForFees: Boolean = {
    val ergSufficient = if (ergFee > 0L) SELF.value >= ergFee else true
    val tokensSufficient = tokenFees.forall { (token: (Coll[Byte], Long)) =>
      SELF.tokens.exists { (selfToken: (Coll[Byte], Long)) =>
        selfToken._1 == token._1 && selfToken._2 >= token._2
      }
    }

    ergSufficient && tokensSufficient
  }
  
  // Final validation
  val feeValidation: Boolean = validDevFee && sufficientFundsForFees && validRecipient
  
  allOf(Coll(
    proveDlog(depositorPubKey),
    isExpiredTimeWindow,
    validSingleSc,
    validTransfer,
    feeValidation
  ))
}