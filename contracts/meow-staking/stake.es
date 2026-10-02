{
  // Define the depositor's public key
  val depositorPubKey = SELF.R4[GroupElement].get

  // Define the required token ID
  val requiredTokenId = fromBase16("d4f0192622b440afc09711aa0545eacd04d78ad3f8a063523f451e10d3d0e6ef")

  // Check if the first token in the box is the required token
  val hasRequiredToken = SELF.tokens(0)._1 == requiredTokenId

  // The contract allows spending only if the transaction is signed by the depositor
  // and the first token is the required token
  proveDlog(depositorPubKey) && hasRequiredToken
}