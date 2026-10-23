import { createStore } from 'zustand/vanilla'
import { getBot, type BotProfile } from './bots'

export type Phase =
  | 'boot'
  | 'idle'
  | 'serveReady'
  | 'rally'
  | 'playerAim'
  | 'playerSwing'
  | 'botThink'
  | 'botSwing'
  | 'pointOver'

export type GameStore = {
  phase: Phase
  botId: string
  bot: BotProfile
  power: number
  banner: string
  lastPoint: string
  setPhase: (p: Phase) => void
  setBot: (id: string) => void
  setPower: (n: number) => void
  setBanner: (s: string) => void
  setLastPoint: (s: string) => void
}

export const store = createStore<GameStore>((set) => ({
  phase: 'boot',
  botId: 'farag',
  bot: getBot('farag'),
  power: 0,
  banner: 'Tap Serve to start',
  lastPoint: '',
  setPhase: (phase) => set({ phase }),
  setBot: (botId) => set({ botId, bot: getBot(botId) }),
  setPower: (power) => set({ power }),
  setBanner: (banner) => set({ banner }),
  setLastPoint: (lastPoint) => set({ lastPoint }),
}))
