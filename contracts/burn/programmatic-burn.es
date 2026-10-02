{
  // Programmatic burn: anyone may spend the box once HEIGHT reaches R4.
  // Reconstructed from the deployed ErgoTree; it compiles back to it byte for byte.
  sigmaProp(HEIGHT >= SELF.R4[Int].get)
}
