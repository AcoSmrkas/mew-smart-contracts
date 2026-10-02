{
  // MewLock: one lock position, shared by every campaign.
  //
  // Holds the owner's locked asset (A) plus the reward (B) the campaign set
  // aside for it at lock time, each a token or ERG (tokens(0) is the
  // campaign's position marker). Only the owner can spend it, and only once
  // the unlock height is reached. The marker is not checked here: the app
  // burns it at unlock, but only a box the campaign's lock created is a
  // genuine position, whatever it holds.
  //
  // Deliberately arithmetic-free: nothing here can overflow or fail on a
  // well-formed box, so a position can never get stuck. The campaign's lock
  // path checks R4 and R5 are present before it creates one.
  //
  // R4: GroupElement  owner
  // R5: Int           unlock height
  // R6..R8 (principal, reward, tier) are informational here; the campaign
  // validates them when the position is created.
  proveDlog(SELF.R4[GroupElement].get) && sigmaProp(HEIGHT >= SELF.R5[Int].get)
}
