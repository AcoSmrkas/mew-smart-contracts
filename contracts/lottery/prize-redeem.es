{
    val ticketTokenId: Coll[Byte] = SELF.R4[Coll[Byte]].get

    val validPrizeRedeemTx: Boolean = {
        // Ticket
        val validTicket: Boolean = INPUTS.exists { (input: Box) =>
            input.tokens.exists { (token: (Coll[Byte], Long)) =>
                token._1 == ticketTokenId
            }
        }

        // No mumbo jumbo
        val validTransfer: Boolean = {
            OUTPUTS.forall{(output: Box) => {
                (output.propositionBytes != SELF.propositionBytes)
            }}
        }

        allOf(Coll(
            validTicket,
            validTransfer
        ))
    }

    sigmaProp(validPrizeRedeemTx)
}