export type FrameName =
  | 'idle0'
  | 'idle1'
  | 'walk0'
  | 'walk1'
  | 'jump'
  | 'attack0'
  | 'attack1'
  | 'special0'
  | 'special1'
  | 'hurt'
  | 'ko'

export interface CharDef {
  id: string
  name: string
  role: string
  sheet: string
  style: 'melee' | 'sword' | 'mage'
  hp: number
  mp: number
  speed: number
  attack: number
  specialCost: number
  specialDmg: number
}

export interface RosterMeta {
  frameWidth: number
  frameHeight: number
  frames: FrameName[]
  characters: CharDef[]
}

export type Facing = 1 | -1

export type ActionState =
  | 'idle'
  | 'walk'
  | 'jump'
  | 'attack'
  | 'special'
  | 'hurt'
  | 'ko'

export interface Projectile {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  dmg: number
  ownerId: number
  color: string
  r: number
}
