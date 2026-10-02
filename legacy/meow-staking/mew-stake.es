{
  // Define the depositor's public key
  val depositorPubKey = SELF.R4[GroupElement].get

  // Define the required token ID
  val requiredTokenId = fromBase16("6c35aa395c7c75b0f67f7804d6930f0e11ef93c3387dc1faa86498d54af7962c")

  // Check if the first token in the box is the required token
  val hasRequiredToken = SELF.tokens(0)._1 == requiredTokenId

  // The contract allows spending only if the transaction is signed by the depositor
  // and the first token is the required token
  proveDlog(depositorPubKey) && hasRequiredToken
}