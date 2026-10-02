{
    // Register Layout:
    // R4: (GroupElement) lender's public key
    // R5: (Coll[Byte], Long) - (collateral token ID, required amount)
    // R6: (Coll[Byte], Long) - (loan token ID, loan amount)
    // R7: (Long, Int) - (fee percent, loan duration in blocks)
    // R8: Long - lending fee in nanoERG
    // R9: Int - state (1=created, 2=borrowed)

    val lender      = SELF.R4[GroupElement].get
    val lenderProp  = proveDlog(lender)

    // Access collateral information using tuple
    val collateralInfo      = SELF.R5[(Coll[Byte], Long)].get
    val collateralTokenId   = collateralInfo._1
    val collateralAmount    = collateralInfo._2

    // Get loan token information from registers
    val loanTokenInfo   = SELF.R6[(Coll[Byte], Long)].get
    val loanTokenId     = loanTokenInfo._1
    val loanAmount      = loanTokenInfo._2

    val isErgLoan       = loanTokenId.size == 0
    val isErgCollateral = collateralTokenId.size == 0

    // Unpack time information using tuple
    val setupInfo       = SELF.R7[(Int, (Long, Long))].get
    val duration        = setupInfo._1
    val feePercent      = if (setupInfo._2._1 > 3000L) setupInfo._2._1 else 3000L
    val lendingFee      = setupInfo._2._2

    val state           = SELF.R8[Int].get

    val feeDenom        = 100000L
    val devFee          = (lendingFee * feePercent) / feeDenom
    val activationFee   = lendingFee - devFee
    val devProp         = PK("9hMRoSfXZJs83S2hLqxZZ8ivw1L8FFgSk7RJB7eq2qXyxU2paED")

    val creationHeight  = SELF.creationInfo._1
    val isExpired = HEIGHT > (creationHeight + duration)

    val thisScBoxes = INPUTS.filter { (input: Box) =>
        input.propositionBytes == SELF.propositionBytes
    }

    val validSingleSc: Boolean = {
        thisScBoxes.size == 1
    }

    // Helper to verify correct loan token repayment
    def validateLoanRepayment(box: Box) = {
        if (isErgLoan) {
            box.value >= loanAmount
        } else {
            // Safe check: Only access index 0 if size > 0
            if (box.tokens.size > 0) {
                val token = box.tokens(0)
                allOf(Coll(
                    token._1 == loanTokenId,
                    token._2 >= loanAmount
                ))
            } else {
                false
            }
        }
    }

    // Helper to verify collateral is in contract box
    def hasCorrectCollateral(box: Box) = {
        if (isErgCollateral) {
            // ERG collateral
            box.value >= collateralAmount
        } else {
            // Token collateral - check if collateral tokens exist
            box.tokens.exists { (token: (Coll[Byte], Long)) =>
                allOf(Coll(
                    (token._1 == collateralTokenId),
                    (token._2 >= collateralAmount)
                ))
            }
        }
    }

    // NEW: Check if loan tokens are locked in contract (using same pattern as hasCorrectCollateral)
    val hasLoanTokensLocked = {
        if (isErgLoan) {
            SELF.value >= loanAmount
        } else {
            SELF.tokens.exists { (token: (Coll[Byte], Long)) =>
                allOf(Coll(
                    (token._1 == loanTokenId),
                    (token._2 >= loanAmount)
                ))
            }
        }
    }

      // Borrowing operation
      val borrow = {
        // First check we have enough outputs
        val hasRequiredOutputs = OUTPUTS.size >= 4
        
        if (hasRequiredOutputs) {
            val borrowerBox = OUTPUTS(0) // Box with borrowed assets
            val lenderBox = OUTPUTS(1) // Fee payment to lender
            val devBox = OUTPUTS(2) // Dev fee box
            val newContractBox = OUTPUTS(3) // Updated contract box with collateral
            
            // Check if all required registers exist first
            val registersExist = allOf(Coll(
                newContractBox.R4[GroupElement].isDefined,
                newContractBox.R5[(Coll[Byte], Long)].isDefined,
                newContractBox.R6[(Coll[Byte], Long)].isDefined,
                newContractBox.R7[(Int, (Long, Long))].isDefined,
                newContractBox.R8[Int].isDefined,
                newContractBox.R9[GroupElement].isDefined
            ))
            
            if (registersExist) {
            val correctActivationFeePayment = allOf(Coll(
                (lenderBox.value >= activationFee),
                (lenderBox.propositionBytes == lenderProp.propBytes)
            ))
            
            val correctDevFeePayment = allOf(Coll(
                (devBox.value >= devFee),
                (devBox.propositionBytes == devProp.propBytes)
            ))
            
            // Verify loan token transfer to borrower
            val validLoanTransfer = validateLoanRepayment(borrowerBox)
            val validCollateral = hasCorrectCollateral(newContractBox)
            
            val correctNewContractBoxData = allOf(Coll(
                (newContractBox.propositionBytes == SELF.propositionBytes),
                (newContractBox.R4[GroupElement].get == lender),
                (newContractBox.R5[(Coll[Byte], Long)].get == collateralInfo),
                (newContractBox.R6[(Coll[Byte], Long)].get == loanTokenInfo),
                (newContractBox.R7[(Int, (Long, Long))].get == setupInfo),
                (newContractBox.R8[Int].get == 2),
                (newContractBox.R9[GroupElement].isDefined)
            ))
            
            allOf(Coll(
                (state == 1),
                hasLoanTokensLocked, // NEW: Ensure tokens are locked before borrowing
                correctActivationFeePayment,
                correctDevFeePayment,
                validLoanTransfer,
                validCollateral,
                correctNewContractBoxData
            ))
            } else {
            false
            }
        } else {
            false
        }
      }

      // No SC in outputs
    val validScBoxSpent: Boolean = {
        OUTPUTS.forall{(output: Box) => {
            (output.propositionBytes != SELF.propositionBytes)
        }}
    }

      // Repayment by borrower
    val repay = {
        val lenderBox = OUTPUTS(0) // Return loan tokens to lender
        
        if (SELF.R9[GroupElement].isDefined) {
            val borrower = SELF.R9[GroupElement].get
            val borrowerProp = proveDlog(borrower)
            
            // Explicitly verify loan token return
            val validLoanReturn = validateLoanRepayment(lenderBox)
            
            val repayConditions = allOf(Coll(
                validSingleSc,
                validScBoxSpent,
                (state == 2),
                (!isExpired),
                (validLoanReturn),
                (lenderBox.propositionBytes == lenderProp.propBytes)
            ))
            
            sigmaProp(repayConditions) && borrowerProp
        } else {
            sigmaProp(false)
        }
    }

    // Cancellation by lender (if not borrowed)
    val lenderCancel = allOf(Coll(
        validScBoxSpent,
        lenderProp,
        (state == 1)
    ))

    // Liquidation by lender after expiry
    val liquidate = {
        allOf(Coll(
            validScBoxSpent,
            lenderProp,
            (state == 2),
            isExpired
        ))
    }

    // SigmaProp
    sigmaProp(allOf(Coll(
            validSingleSc,
            (lenderCancel || borrow || liquidate)
    ))) || repay
}