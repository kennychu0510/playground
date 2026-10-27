import type { InputState } from './input'
import type { Fighter } from './fighter'

export function aiInput(self: Fighter, target: Fighter | null, now: number): InputState {
  const blank: InputState = {
    left: false,
    right: false,
    jump: false,
    attack: false,
    special: false,
    jumpPressed: false,
    attackPressed: false,
    specialPressed: false,
  }
  if (!target || !target.alive || !self.alive) return blank

  const dx = target.x - self.x
  const dist = Math.abs(dx)
  const dir = dx > 0 ? 1 : -1

  // approach
  if (dist > 46) {
    if (dir > 0) blank.right = true
    else blank.left = true
  } else if (dist < 28) {
    // back off slightly
    if (dir > 0) blank.left = true
    else blank.right = true
  }

  // occasional jump if player is above
  if (target.y < self.y - 40 && self.onGround && Math.random() < 0.02) {
    blank.jumpPressed = true
  }

  // attack cadence
  const phase = Math.floor(now * 2 + self.id) % 7
  if (dist < 55 && phase === 0 && self.onGround) {
    blank.attackPressed = true
  }
  if (dist < 90 && dist > 40 && self.mp >= self.sheet.def.specialCost && phase === 3 && Math.random() < 0.35) {
    blank.specialPressed = true
  }

  return blank
}
