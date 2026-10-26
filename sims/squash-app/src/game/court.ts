/** WSF singles court, metres. Inner faces sit on these planes. */
export const COURT = {
  length: 9.75,
  width: 6.4,
  frontHeight: 4.57,
  sideHeight: 4.57,
  backHeight: 2.13,
  tin: 0.48,
  serviceLineY: 1.78,
  /** Distance from the front wall to the short line. */
  shortLineZ: 5.49,
  ballRadius: 0.055,
} as const

export const TARGET_SCORE = 11

export type ServeSide = 'left' | 'right'

export function serveSideForScore(score: number): ServeSide {
  return score % 2 === 0 ? 'right' : 'left'
}

/** Even scores serve from the right box, looking at the front wall. */
export function serviceBoxAnchor(side: ServeSide) {
  const span = COURT.length - COURT.shortLineZ
  return {
    x: side === 'right' ? COURT.width * 0.22 : -COURT.width * 0.22,
    z: COURT.shortLineZ + span * 0.62,
  }
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function clampToCourt(x: number, z: number) {
  const m = 0.32
  return {
    x: clamp(x, -COURT.width / 2 + m, COURT.width / 2 - m),
    z: clamp(z, 0.48, COURT.length - 0.38),
  }
}

export function clampToServiceBox(x: number, z: number, side: ServeSide) {
  const inset = 0.38
  const minZ = COURT.shortLineZ + 0.28
  const maxZ = COURT.length - 0.42
  const zc = clamp(z, minZ, maxZ)
  const xc =
    side === 'right'
      ? clamp(x, inset, COURT.width / 2 - inset)
      : clamp(x, -COURT.width / 2 + inset, -inset)
  return { x: xc, z: zc }
}

/**
 * A serve is good if the first bounce is in the receiver's box.
 * The half-court line is included so a nick on the middle still counts.
 */
export function bounceInReceiverBox(x: number, z: number, serverSide: ServeSide) {
  const zOk = z >= COURT.shortLineZ - 0.18 && z <= COURT.length + 0.02
  const xOk = serverSide === 'right' ? x < 0.2 : x > -0.2
  const inCourt = Math.abs(x) < COURT.width / 2 - 0.02
  return zOk && xOk && inCourt
}
