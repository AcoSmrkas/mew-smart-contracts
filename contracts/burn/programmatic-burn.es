{
  // Programmatic burn v2: tokens held until a block height, then destroyed.
  // From the height in R4 on, anyone may spend this box, but no output may carry any
  // of its tokens, so spending it burns them. Its ERG goes to whoever triggers the burn.
  //
  // The previous version is legacy/burn/programmatic-burn-2025-12.es.
  //
  // R4 Int  height from which the burn may be triggered
  val burnHeight: Int = SELF.R4[Int].get

  val burned: Boolean = SELF.tokens.forall { (t: (Coll[Byte], Long)) =>
    OUTPUTS.forall { (output: Box) =>
      output.tokens.forall { (u: (Coll[Byte], Long)) => u._1 != t._1 }
    }
  }

  sigmaProp(HEIGHT >= burnHeight && burned)
}
