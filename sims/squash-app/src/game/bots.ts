/** Data-driven opponent profiles inspired by PSA playing styles (toy weights). */

export type ShotKind = 'drive' | 'cross' | 'lob' | 'drop' | 'boast'

export type BotProfile = {
  id: string
  name: string
  blurb: string
  /** Reaction delay before return (s) */
  reaction: number
  /** 0–1 miss / tin risk */
  error: number
  /** Bias toward attacking short (drop/boast) */
  aggression: number
  /** Prefer length / T control */
  lengthBias: number
  /** Power multiplier on returns */
  power: number
  weights: Record<ShotKind, number>
}

export const BOTS: BotProfile[] = [
  {
    id: 'farag',
    name: 'Farag',
    blurb: 'Tight length, early takes, low errors — PSA control style.',
    reaction: 0.22,
    error: 0.06,
    aggression: 0.35,
    lengthBias: 0.85,
    power: 0.88,
    weights: { drive: 0.42, cross: 0.28, lob: 0.12, drop: 0.12, boast: 0.06 },
  },
  {
    id: 'coll',
    name: 'Coll',
    blurb: 'Height & lobs, fitness rallies, builds from deep.',
    reaction: 0.28,
    error: 0.08,
    aggression: 0.3,
    lengthBias: 0.75,
    power: 0.9,
    weights: { drive: 0.3, cross: 0.18, lob: 0.32, drop: 0.12, boast: 0.08 },
  },
  {
    id: 'elshorbagy',
    name: 'ElShorbagy',
    blurb: 'Explosive pace and attack — presses when loose.',
    reaction: 0.18,
    error: 0.1,
    aggression: 0.72,
    lengthBias: 0.45,
    power: 1.05,
    weights: { drive: 0.34, cross: 0.22, lob: 0.06, drop: 0.24, boast: 0.14 },
  },
  {
    id: 'asal',
    name: 'Asal',
    blurb: 'Front-court pressure and trickling boasts.',
    reaction: 0.2,
    error: 0.11,
    aggression: 0.8,
    lengthBias: 0.35,
    power: 0.95,
    weights: { drive: 0.22, cross: 0.18, lob: 0.08, drop: 0.28, boast: 0.24 },
  },
]

export function getBot(id: string): BotProfile {
  return BOTS.find((b) => b.id === id) ?? BOTS[0]
}

function pickWeighted(weights: Record<ShotKind, number>): ShotKind {
  const entries = Object.entries(weights) as [ShotKind, number][]
  const sum = entries.reduce((a, [, w]) => a + w, 0)
  let r = Math.random() * sum
  for (const [k, w] of entries) {
    r -= w
    if (r <= 0) return k
  }
  return 'drive'
}

export type ReturnPlan = {
  kind: ShotKind
  /** Aim point on / near front wall plane (world) */
  target: { x: number; y: number; z: number }
  power: number
}

/** Choose where the bot hits next from ball position + profile. */
export function planReturn(
  bot: BotProfile,
  ball: { x: number; y: number; z: number },
  court: { width: number; length: number; frontHeight: number; tin: number },
): ReturnPlan {
  let kind = pickWeighted(bot.weights)
  if (Math.random() < bot.lengthBias * 0.35 && (kind === 'drop' || kind === 'boast')) {
    kind = Math.random() < 0.55 ? 'drive' : 'cross'
  }
  if (Math.random() < bot.aggression * 0.25 && (kind === 'drive' || kind === 'lob')) {
    kind = Math.random() < 0.5 ? 'drop' : 'boast'
  }

  const halfW = court.width / 2 - 0.35
  const side = ball.x >= 0 ? 1 : -1
  let x = 0
  let y = 1.4
  let z = 0.05 // front wall plane

  switch (kind) {
    case 'drive':
      x = side * (halfW * (0.55 + Math.random() * 0.35))
      y = 0.9 + Math.random() * 0.7
      break
    case 'cross':
      x = -side * (halfW * (0.5 + Math.random() * 0.4))
      y = 1.0 + Math.random() * 0.8
      break
    case 'lob':
      x = side * (halfW * (0.4 + Math.random() * 0.4))
      y = 2.6 + Math.random() * 1.2
      break
    case 'drop':
      x = side * (0.4 + Math.random() * 1.2)
      y = bot.error > 0.1 && Math.random() < bot.error ? court.tin * 0.7 : court.tin + 0.25 + Math.random() * 0.45
      break
    case 'boast':
      // Aim near side wall → front (simplified as front corner)
      x = side * (halfW * 0.95)
      y = 0.7 + Math.random() * 0.5
      break
  }

  // Tin / out errors
  if (Math.random() < bot.error) {
    if (Math.random() < 0.5) y = court.tin * (0.4 + Math.random() * 0.5)
    else y = court.frontHeight + 0.2 + Math.random() * 0.4
  }

  const power = (0.55 + Math.random() * 0.4) * bot.power
  return { kind, target: { x, y, z }, power }
}
