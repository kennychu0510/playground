import { createStore } from 'zustand/vanilla'
import { getBot, type BotProfile } from './bots'
import type { ServeSide } from './court'

export type Phase =
  | 'idle'
  | 'serveAim'
  | 'rally'
  | 'playerAim'
  | 'botTelegraph'
  | 'pointOver'

export type GameStore = {
  phase: Phase
  botId: string
  bot: BotProfile
  power: number
  banner: string
  serveSide: ServeSide
  scorePlayer: number
  scoreBot: number
  setPhase: (p: Phase) => void
  setBot: (id: string) => void
  setPower: (n: number) => void
  setBanner: (s: string) => void
  setServeSide: (s: ServeSide) => void
  addPointPlayer: () => void
  addPointBot: () => void
  resetScore: () => void
}

export const store = createStore<GameStore>((set) => ({
  phase: 'idle',
  botId: 'farag',
  bot: getBot('farag'),
  power: 0,
  banner: 'Pick opponent · tap Serve',
  serveSide: 'right',
  scorePlayer: 0,
  scoreBot: 0,
  setPhase: (phase) => set({ phase }),
  setBot: (botId) => set({ botId, bot: getBot(botId) }),
  setPower: (power) => set({ power }),
  setBanner: (banner) => set({ banner }),
  setServeSide: (serveSide) => set({ serveSide }),
  addPointPlayer: () => set((s) => ({ scorePlayer: s.scorePlayer + 1 })),
  addPointBot: () => set((s) => ({ scoreBot: s.scoreBot + 1 })),
  resetScore: () => set({ scorePlayer: 0, scoreBot: 0 }),
}))
