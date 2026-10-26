import { COURT, clamp } from './court'
import type { ShotType } from './bots'

export type { ShotType }

export type Grade = 'perfect' | 'good' | 'early' | 'late'

export type ShotKey = {
  type: ShotType
  code: string
  key: string
  label: string
  sub: string
}

/** Same hold-to-charge layout as a five-button shot pad: cross, drive, drop, lob, boast. */
export const SHOT_KEYS: ShotKey[] = [
  { type: 'cross', code: 'KeyJ', key: 'J', label: 'Cross', sub: 'Angle' },
  { type: 'drive', code: 'KeyK', key: 'K', label: 'Drive', sub: 'Length' },
  { type: 'drop', code: 'KeyU', key: 'U', label: 'Drop', sub: 'Short' },
  { type: 'lob', code: 'KeyL', key: 'L', label: 'Lob', sub: 'High' },
  { type: 'boast', code: 'KeyI', key: 'I', label: 'Boast', sub: 'Side wall' },
]

/** Vertical pace as the ball arrives on the front wall. Negative means it is dropping in. */
const ARRIVE: Record<ShotType, number> = {
  drive: -1.1,
  cross: -0.7,
  drop: -3.4,
  lob: -0.25,
  boast: -1.4,
}

export function gradeOf(timingError: number): Grade {
  const a = Math.abs(timingError)
  if (a < 0.05) return 'perfect'
  if (a < 0.12) return 'good'
  return timingError > 0 ? 'early' : 'late'
}

export function timingError(actorX: number, actorZ: number, ball: { x: number; z: number; vx: number; vz: number }) {
  const dx = actorX - ball.x
  const dz = actorZ - ball.z
  const dist = Math.hypot(dx, dz)
  const ideal = 0.72
  const closing = (dx * ball.vx + dz * ball.vz) / Math.max(dist, 0.08)
  if (closing < 1) {
    if (dist < 1.2) return (dist - ideal) / 4
    return closing < 0 ? -0.4 : 0.45
  }
  return (dist - ideal) / closing
}

export function inReach(actorX: number, actorZ: number, ball: { x: number; y: number; z: number }) {
  return Math.hypot(actorX - ball.x, actorZ - ball.z) < 1.4 && ball.y < 2.45 && ball.y > 0.03
}

type Aim = {
  shot: ShotType
  from: { x: number; y: number; z: number }
  aimX: number
  power: number
  grade: Grade | null
}

/**
 * Ballistic velocity that arrives at `to` with the given horizontal speed.
 * Used for the serve, where the landing is tuned by hand.
 */
export function launchTo(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, horizSpeed: number) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const horiz = Math.max(0.35, Math.hypot(dx, dz))
  const t = Math.max(0.28, horiz / Math.max(4.5, horizSpeed))
  let vy = dy / t + 0.5 * 9.81 * t
  vy = clamp(vy, -1, 8.2)
  return { x: dx / t, y: vy, z: dz / t }
}

/** Time of flight so the ball reaches `dy` with `arriveVy` (negative = dropping). */
function flightTime(dy: number, arriveVy: number) {
  const A = 0.5 * 9.81
  const disc = arriveVy * arriveVy + 2 * 9.81 * dy
  if (disc < 0) return 0.42
  const t = (-arriveVy + Math.sqrt(disc)) / (2 * A)
  return clamp(t, 0.22, 1.05)
}

function velocityThrough(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  arriveVy: number,
) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const t = flightTime(dy, arriveVy)
  const v = {
    x: dx / t,
    y: dy / t + 0.5 * 9.81 * t,
    z: dz / t,
  }
  const speed = Math.hypot(v.x, v.y, v.z)
  if (speed > 23) {
    const s = 23 / speed
    v.x *= s
    v.y *= s
    v.z *= s
  }
  if (v.z > -2.4) v.z = -Math.abs(v.z) - 2.4
  return v
}

/** Aim a squash shot at the front wall, or at the side wall for a boast. */
export function shotVelocity(aim: Aim) {
  const { shot, from, power } = aim
  const grade = aim.grade
  const half = COURT.width / 2 - 0.45
  const aimX = clamp(aim.aimX, -1.25, 1.25)
  let yBump = (power - 0.5) * 0.18
  let arrive = ARRIVE[shot]
  if (grade === 'early') {
    yBump += 0.28
    arrive += 0.45
  }
  if (grade === 'late') {
    yBump -= 0.34
    arrive -= 0.35
  }
  if (grade === 'perfect') arrive += 0.05

  if (shot === 'boast') {
    const side = Math.abs(aimX) > 0.18 ? Math.sign(aimX) : Math.sign(from.x || 1)
    const target = {
      x: side * (COURT.width / 2 - 0.02),
      y: clamp(1.15 + power * 0.25 + yBump, 0.32, 2.4),
      z: clamp(Math.min(from.z - 0.85, 2.1), 0.55, Math.max(0.75, from.z - 0.4)),
    }
    return velocityThrough(from, target, arrive)
  }

  let x = 0
  let y = 1.1
  switch (shot) {
    case 'drive':
      x = from.x * 0.28 + aimX * half * 0.55
      y = 1.05 + power * 0.22
      break
    case 'cross':
      x = -Math.sign(from.x || 1) * half * (0.62 + Math.abs(aimX) * 0.28)
      if (Math.abs(aimX) > 0.35) x = Math.sign(aimX) * half * 0.82
      y = 1.3 + power * 0.2
      break
    case 'drop':
      x = from.x * 0.2 + aimX * 1.15
      y = COURT.tin + 0.26 + power * 0.12
      break
    case 'lob':
      x = from.x * 0.35 + aimX * half * 0.35
      y = 3.05 + power * 0.45
      break
    default:
      break
  }
  y = clamp(y + yBump, 0.2, COURT.frontHeight - 0.18)
  x = clamp(x, -half - 0.1, half + 0.1)
  return velocityThrough(from, { x, y, z: 0.02 }, arrive)
}

/** Serve aimed above the service line, toward the opposite box. */
export function serveVelocity(
  from: { x: number; y: number; z: number },
  serverSide: 'left' | 'right',
  power: number,
  aimX: number,
) {
  const landingX = serverSide === 'right' ? -COURT.width * 0.2 : COURT.width * 0.2
  const wallX = clamp(landingX * 0.15 + aimX * 0.85, -COURT.width / 2 + 0.4, COURT.width / 2 - 0.4)
  const wallY = clamp(2.42 + power * 0.4, COURT.serviceLineY + 0.25, 3.15)
  const speed = 12.8 + power * 2.4
  return launchTo(from, { x: wallX, y: wallY, z: 0.02 }, speed)
}
