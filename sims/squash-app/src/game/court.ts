/** WSF singles court (metres), toy-friendly. */
export const COURT = {
  length: 9.75,
  width: 6.4,
  frontHeight: 4.57,
  sideHeight: 4.57,
  backHeight: 2.13,
  tin: 0.48,
  serviceLineY: 1.78,
  /** Distance from front wall to short line */
  shortLineZ: 5.49,
  ballRadius: 0.02,
} as const

export type ServeSide = 'left' | 'right'

/**
 * Service boxes sit behind the short line (toward the back wall),
 * either side of the half-court line.
 */
export function serviceBoxCenter(side: ServeSide) {
  const halfW = COURT.width / 2
  const boxFront = COURT.shortLineZ
  const boxBack = COURT.length
  const z = (boxFront + boxBack) / 2 - 0.35
  // Right box = positive x (as viewed from back looking forward)
  const x = side === 'right' ? halfW * 0.42 : -halfW * 0.42
  return { x, y: 1.32, z }
}

export function playerEyeForServe(side: ServeSide) {
  const c = serviceBoxCenter(side)
  return {
    x: c.x * 0.92,
    y: 1.55,
    z: Math.min(COURT.length - 0.55, c.z + 0.85),
  }
}

export type CourtDims = typeof COURT
