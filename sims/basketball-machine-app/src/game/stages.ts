/** Stage definitions + scoring constants for Basketball Machine. */

export const SCORE = {
  make: 2,
  swish: 3,
  /** Extra point starting at the 3rd consecutive make. */
  streakBonusFrom: 3,
  streakBonusPoints: 1,
} as const

export type HoopMotion =
  | { kind: 'static' }
  | { kind: 'slide'; ampX: number; speed: number }
  | { kind: 'wave'; ampX: number; ampZ: number; speed: number }
  | { kind: 'figure8'; ampX: number; ampZ: number; speed: number }

export type StageDef = {
  id: number
  name: string
  blurb: string
  /** Seconds on the clock */
  duration: number
  /** Points needed to clear */
  goal: number
  /** Rim inner radius (metres). Default ~0.22 */
  rimRadius: number
  motion: HoopMotion
}

export const STAGES: StageDef[] = [
  {
    id: 1,
    name: 'Steady Shot',
    blurb: 'Static hoop. Find your flick.',
    duration: 45,
    goal: 20,
    rimRadius: 0.22,
    motion: { kind: 'static' },
  },
  {
    id: 2,
    name: 'Side Slide',
    blurb: 'Hoop drifts left and right.',
    duration: 50,
    goal: 24,
    rimRadius: 0.22,
    motion: { kind: 'slide', ampX: 0.32, speed: 0.85 },
  },
  {
    id: 3,
    name: 'Wave',
    blurb: 'Faster slide with a little depth sway.',
    duration: 55,
    goal: 28,
    rimRadius: 0.21,
    motion: { kind: 'wave', ampX: 0.38, ampZ: 0.14, speed: 1.2 },
  },
  {
    id: 4,
    name: 'Tight Orbit',
    blurb: 'Smaller rim on a figure-eight path.',
    duration: 60,
    goal: 32,
    rimRadius: 0.18,
    motion: { kind: 'figure8', ampX: 0.34, ampZ: 0.16, speed: 1.05 },
  },
]

/**
 * Resting hoop centre (metres) for a compact arcade cabinet.
 * Short throw: rim ~2.1 m ahead of the trough, chest-high in frame.
 */
export const HOOP_HOME = { x: 0, y: 1.72, z: -1.95 } as const

export function hoopOffset(motion: HoopMotion, t: number): { x: number; z: number } {
  switch (motion.kind) {
    case 'static':
      return { x: 0, z: 0 }
    case 'slide':
      return { x: Math.sin(t * motion.speed) * motion.ampX, z: 0 }
    case 'wave':
      return {
        x: Math.sin(t * motion.speed) * motion.ampX,
        z: Math.sin(t * motion.speed * 0.85 + 0.6) * motion.ampZ,
      }
    case 'figure8':
      return {
        x: Math.sin(t * motion.speed) * motion.ampX,
        z: Math.sin(t * motion.speed * 2) * motion.ampZ,
      }
  }
}
