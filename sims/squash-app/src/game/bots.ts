/** Solo opponents. Weights are tuned like the old PSA-style profiles. */

export type ShotType = 'drive' | 'cross' | 'drop' | 'lob' | 'boast'

export type BotProfile = {
  id: string
  name: string
  blurb: string
  color: number
  /** Delay before the return, seconds. */
  reaction: number
  /** Chance of a mistimed shot. */
  error: number
  aggression: number
  lengthBias: number
  power: number
  weights: Record<ShotType, number>
}

export const BOTS: BotProfile[] = [
  {
    id: 'farag',
    name: 'Farag',
    blurb: 'Tight length, early takes, few errors.',
    color: 0x3aa0ff,
    reaction: 0.18,
    error: 0.06,
    aggression: 0.35,
    lengthBias: 0.85,
    power: 0.9,
    weights: { drive: 0.4, cross: 0.28, lob: 0.14, drop: 0.12, boast: 0.06 },
  },
  {
    id: 'coll',
    name: 'Coll',
    blurb: 'High lobs and long fitness rallies.',
    color: 0xf0b429,
    reaction: 0.22,
    error: 0.08,
    aggression: 0.3,
    lengthBias: 0.75,
    power: 0.92,
    weights: { drive: 0.28, cross: 0.16, lob: 0.34, drop: 0.12, boast: 0.1 },
  },
  {
    id: 'elshorbagy',
    name: 'ElShorbagy',
    blurb: 'Explosive pace. Attacks anything loose.',
    color: 0xef5b5b,
    reaction: 0.15,
    error: 0.1,
    aggression: 0.72,
    lengthBias: 0.45,
    power: 1.05,
    weights: { drive: 0.32, cross: 0.22, lob: 0.06, drop: 0.24, boast: 0.16 },
  },
  {
    id: 'asal',
    name: 'Asal',
    blurb: 'Front-court pressure and boasts.',
    color: 0xb07cff,
    reaction: 0.16,
    error: 0.11,
    aggression: 0.8,
    lengthBias: 0.35,
    power: 0.98,
    weights: { drive: 0.2, cross: 0.16, lob: 0.08, drop: 0.28, boast: 0.28 },
  },
]

export function getBot(id: string): BotProfile {
  return BOTS.find((b) => b.id === id) ?? BOTS[0]
}

export function pickShot(bot: BotProfile): ShotType {
  const entries = Object.entries(bot.weights) as [ShotType, number][]
  const sum = entries.reduce((a, [, w]) => a + w, 0)
  let r = Math.random() * sum
  let kind: ShotType = 'drive'
  for (const [k, w] of entries) {
    r -= w
    if (r <= 0) {
      kind = k
      break
    }
  }
  if (Math.random() < bot.lengthBias * 0.35 && (kind === 'drop' || kind === 'boast')) {
    kind = Math.random() < 0.6 ? 'drive' : 'lob'
  }
  if (Math.random() < bot.aggression * 0.28 && (kind === 'drive' || kind === 'lob')) {
    kind = Math.random() < 0.5 ? 'drop' : 'boast'
  }
  return kind
}
