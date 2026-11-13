// Rules of the contract that the self-check has to notice when they are broken (used by mutations.mjs).
export const MUTATIONS = [
  { name: "a retraction burns a quarter instead of a fifth", from: "RETRACT_BURN_DIV = 5", to: "RETRACT_BURN_DIV = 4" },
  { name: "a retraction is possible after the deadline", from: 'if _now() >= int(v.deadline):\n            raise gl.vm.UserError("The deadline has passed. A vow can only be retracted before it.")', to: "pass" },
  { name: "a keeper can back their own vow", from: 'if who == v.keeper:\n            raise gl.vm.UserError("A keeper cannot back their own vow.")', to: "pass" },
  { name: "faith is no longer capped", from: "if int(v.faith) + amount > int(v.stake) // FAITH_CAP_DIV:", to: "if False:" },
  { name: "a kept vow pays doubters nothing extra to faith backers", from: "out += f + doubt * f // faith", to: "out += f" },
  { name: "a broken vow burns the whole stake", from: "    if state == BROKEN and doubt > 0 and d > 0:\n        pot = (stake - stake // 2) + faith", to: "    if state == BROKEN and doubt > 0 and d > 0:\n        pot = faith" },
  { name: "a claim can be made twice", from: 'if self.claimed.get(key, False):\n            raise gl.vm.UserError("Already claimed.")', to: "pass" },
  { name: "the activity feed forgets updates", from: 'self._log(vow_id, "update")', to: "pass" },
  { name: "a claim is possible during the review window", from: "if int(v.state) in (OPEN, REVIEW):\n            raise gl.vm.UserError(\"This vow has no final verdict yet.\")", to: "pass" },
];
