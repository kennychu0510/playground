export interface InputState {
  left: boolean
  right: boolean
  jump: boolean
  attack: boolean
  special: boolean
  jumpPressed: boolean
  attackPressed: boolean
  specialPressed: boolean
}

const keys: Record<string, boolean> = {}
let jumpEdge = false
let attackEdge = false
let specialEdge = false

const KEYMAP: Record<string, keyof Omit<InputState, 'jumpPressed' | 'attackPressed' | 'specialPressed'>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  a: 'left',
  d: 'right',
  A: 'left',
  D: 'right',
  ' ': 'jump',
  Space: 'jump',
  ArrowUp: 'jump',
  w: 'jump',
  W: 'jump',
  z: 'attack',
  Z: 'attack',
  j: 'attack',
  J: 'attack',
  x: 'special',
  X: 'special',
  k: 'special',
  K: 'special',
}

export function bindInput(root: HTMLElement = document.body) {
  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.key] ?? KEYMAP[e.code]
    if (!k) return
    if (e.repeat) return
    e.preventDefault()
    keys[k] = true
    if (k === 'jump') jumpEdge = true
    if (k === 'attack') attackEdge = true
    if (k === 'special') specialEdge = true
  })
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.key] ?? KEYMAP[e.code]
    if (!k) return
    keys[k] = false
  })

  root.querySelectorAll<HTMLButtonElement>('#touch button[data-key]').forEach((btn) => {
    const key = btn.dataset.key as keyof typeof keys
    const set = (v: boolean) => {
      keys[key] = v
      btn.classList.toggle('active', v)
      if (v) {
        if (key === 'jump') jumpEdge = true
        if (key === 'attack') attackEdge = true
        if (key === 'special') specialEdge = true
      }
    }
    const down = (e: Event) => {
      e.preventDefault()
      set(true)
    }
    const up = (e: Event) => {
      e.preventDefault()
      set(false)
    }
    btn.addEventListener('pointerdown', down)
    btn.addEventListener('pointerup', up)
    btn.addEventListener('pointercancel', up)
    btn.addEventListener('pointerleave', up)
  })
}

export function pollInput(): InputState {
  const state: InputState = {
    left: !!keys.left,
    right: !!keys.right,
    jump: !!keys.jump,
    attack: !!keys.attack,
    special: !!keys.special,
    jumpPressed: jumpEdge,
    attackPressed: attackEdge,
    specialPressed: specialEdge,
  }
  jumpEdge = false
  attackEdge = false
  specialEdge = false
  return state
}
