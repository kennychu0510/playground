import './style.css'
import { BOTS, type ShotType } from './game/bots'
import { TARGET_SCORE } from './game/court'
import { SHOT_KEYS } from './game/shots'
import { createSim, deuce, setBot, showMenu, startMatch, stepSim, turnText } from './game/sim'
import { createAudio } from './game/audio'
import { createView, type CameraMode, type CourtTheme, type Quality } from './game/view'

type Settings = {
  theme: CourtTheme
  camera: CameraMode
  quality: Quality
  sound: boolean
  botId: string
  tutDone: boolean
}

const SETTINGS_KEY = 'squash-3d-settings'

const defaults: Settings = {
  theme: 'classic',
  camera: 'follow',
  quality: 'high',
  sound: true,
  botId: 'farag',
  tutDone: false,
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...defaults, ...JSON.parse(raw) }
  } catch {
    /* keep defaults */
  }
  const coarse = matchMedia('(pointer: coarse)').matches
  return { ...defaults, quality: coarse ? 'low' : 'high' }
}

function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

const settings = loadSettings()
const sim = createSim()
setBot(sim, settings.botId)
const audio = createAudio()
audio.muted = !settings.sound

const canvas = document.querySelector<HTMLCanvasElement>('#c')!
const view = createView(canvas)
view.setTheme(settings.theme)
view.setQuality(settings.quality)

const hud = document.querySelector<HTMLDivElement>('#hud')!
const scoreMe = document.querySelector<HTMLSpanElement>('#score-me')!
const scoreOp = document.querySelector<HTMLSpanElement>('#score-op')!
const opName = document.querySelector<HTMLSpanElement>('#op-name')!
const sideMe = document.querySelector<HTMLDivElement>('#side-me')!
const sideOp = document.querySelector<HTMLDivElement>('#side-op')!
const serveMe = document.querySelector<HTMLSpanElement>('#serve-me')!
const serveOp = document.querySelector<HTMLSpanElement>('#serve-op')!
const rallyLabel = document.querySelector<HTMLSpanElement>('#rally-label')!
const turnLabel = document.querySelector<HTMLSpanElement>('#turn-label')!
const message = document.querySelector<HTMLDivElement>('#message')!
const feedback = document.querySelector<HTMLDivElement>('#feedback')!
const tutorial = document.querySelector<HTMLDivElement>('#tutorial')!
const tutStepEl = document.querySelector<HTMLSpanElement>('#tut-step')!
const tutText = document.querySelector<HTMLSpanElement>('#tut-text')!
const serveBtn = document.querySelector<HTMLButtonElement>('#serve-btn')!
const menu = document.querySelector<HTMLDivElement>('#overlay-menu')!
const opponents = document.querySelector<HTMLDivElement>('#overlay-opponents')!
const settingsEl = document.querySelector<HTMLDivElement>('#overlay-settings')!
const result = document.querySelector<HTMLDivElement>('#overlay-result')!
const opponentCurrent = document.querySelector<HTMLParagraphElement>('#opponent-current')!
const grid = document.querySelector<HTMLDivElement>('#opponent-grid')!
const shotPad = document.querySelector<HTMLDivElement>('#shot-pad')!
const muteBtn = document.querySelector<HTMLButtonElement>('#btn-mute')!

const TIPS = [
  'Press Space to serve from the highlighted box.',
  'Press K for a drive as the ball arrives. A and D aim it.',
  'J cross, U drop, L lob, I boast. WASD runs the court. Sideways alignment is automatic.',
]
let tutStep = 0
const tutShots = new Set<string>()
let feedbackToken = ''
let resultShown = false

const down = new Set<string>()
let shotEdge: ShotType | null = null
let serveEdge = false
let joyActive = false
let joyX = 0
let joyY = 0

if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch-mode')
window.addEventListener('touchstart', () => document.body.classList.add('touch-mode'), { passive: true })

function botName() {
  return BOTS.find((b) => b.id === settings.botId)?.name ?? 'Farag'
}

function paintOpponents() {
  opponentCurrent.textContent = `Current opponent: ${botName()}`
  grid.innerHTML = ''
  for (const bot of BOTS) {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'opponent-card' + (bot.id === settings.botId ? ' on' : '')
    const swatch = document.createElement('i')
    swatch.className = 'swatch'
    swatch.style.background = '#' + bot.color.toString(16).padStart(6, '0')
    const name = document.createElement('strong')
    name.textContent = bot.name
    const blurb = document.createElement('span')
    blurb.textContent = bot.blurb
    card.append(swatch, name, blurb)
    card.addEventListener('click', () => {
      settings.botId = bot.id
      setBot(sim, bot.id)
      saveSettings(settings)
      paintOpponents()
      opName.textContent = bot.name
    })
    grid.append(card)
  }
}

function paintSegments() {
  bindSeg('seg-court', settings.theme, (v) => {
    settings.theme = v as CourtTheme
    view.setTheme(settings.theme)
    saveSettings(settings)
  })
  bindSeg('seg-camera', settings.camera, (v) => {
    settings.camera = v as CameraMode
    saveSettings(settings)
  })
  bindSeg('seg-quality', settings.quality, (v) => {
    settings.quality = v as Quality
    view.setQuality(settings.quality)
    saveSettings(settings)
  })
  bindSeg('seg-sound', settings.sound ? 'on' : 'off', (v) => {
    settings.sound = v === 'on'
    audio.muted = !settings.sound
    muteBtn.textContent = settings.sound ? '🔊' : '🔇'
    saveSettings(settings)
  })
}

function bindSeg(id: string, current: string, onPick: (v: string) => void) {
  const root = document.getElementById(id)!
  const buttons = [...root.querySelectorAll('button')]
  const paint = (value: string) => {
    for (const b of buttons) b.classList.toggle('on', b.dataset.value === value)
  }
  paint(current)
  for (const b of buttons) {
    b.addEventListener('click', () => {
      const value = b.dataset.value ?? ''
      paint(value)
      onPick(value)
    })
  }
}

for (const shot of SHOT_KEYS) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = `shot-btn shot-${shot.type}`
  btn.dataset.shot = shot.type
  const title = document.createElement('b')
  title.textContent = shot.label
  const sub = document.createElement('span')
  sub.textContent = shot.sub
  btn.append(title, sub)
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    audio.resume()
    shotEdge = shot.type
    btn.classList.add('active')
    window.setTimeout(() => btn.classList.remove('active'), 160)
  })
  shotPad.append(btn)
}

const joy = document.querySelector<HTMLDivElement>('#joystick')!
const knob = document.querySelector<HTMLDivElement>('#knob')!
let joyId: number | null = null
let joyOriginX = 0
let joyOriginY = 0
joy.addEventListener('pointerdown', (e) => {
  joyId = e.pointerId
  joyActive = true
  const rect = joy.getBoundingClientRect()
  joyOriginX = rect.left + rect.width / 2
  joyOriginY = rect.top + rect.height / 2
  joy.setPointerCapture(e.pointerId)
  moveJoy(e)
})
function moveJoy(e: PointerEvent) {
  const max = 46
  const dx = e.clientX - joyOriginX
  const dy = e.clientY - joyOriginY
  const mag = Math.hypot(dx, dy) || 1
  const cl = Math.min(mag, max)
  const nx = dx / mag
  const ny = dy / mag
  knob.style.transform = `translate(${nx * cl}px, ${ny * cl}px)`
  joyX = (nx * cl) / max
  joyY = (ny * cl) / max
}
joy.addEventListener('pointermove', (e) => {
  if (e.pointerId === joyId) moveJoy(e)
})
function endJoy(e: PointerEvent) {
  if (e.pointerId !== joyId) return
  joyId = null
  joyActive = false
  joyX = 0
  joyY = 0
  knob.style.transform = 'translate(0, 0)'
}
joy.addEventListener('pointerup', endJoy)
joy.addEventListener('pointercancel', endJoy)

const shotByCode = new Map(SHOT_KEYS.map((s) => [s.code, s.type]))

window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  if (e.code === 'Space' || e.code.startsWith('Arrow') || shotByCode.has(e.code) || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
    e.preventDefault()
  }
  if (!menu.hidden) {
    if (e.code === 'Enter' || e.code === 'Space') beginPlaying()
    return
  }
  if (!result.hidden) {
    if (e.code === 'Enter' || e.code === 'Space') rematch()
    return
  }
  if (!settingsEl.hidden || !opponents.hidden) return
  audio.resume()
  down.add(e.code)
  const shot = shotByCode.get(e.code)
  if (shot) {
    shotEdge = shot
    shotPad.querySelector<HTMLButtonElement>(`[data-shot="${shot}"]`)?.classList.add('active')
  }
  if (e.code === 'Space') serveEdge = true
})
window.addEventListener('keyup', (e) => {
  down.delete(e.code)
  const shot = shotByCode.get(e.code)
  if (shot) shotPad.querySelector<HTMLButtonElement>(`[data-shot="${shot}"]`)?.classList.remove('active')
})

document.querySelector('#btn-play')!.addEventListener('click', beginPlaying)
document.querySelector('#btn-opponent')!.addEventListener('click', () => {
  menu.hidden = true
  opponents.hidden = false
  paintOpponents()
})
document.querySelector('#btn-opponent-done')!.addEventListener('click', () => {
  opponents.hidden = true
  if (sim.matchState === 'menu') menu.hidden = false
})
document.querySelector('#btn-menu-settings')!.addEventListener('click', () => openSettings(false))
document.querySelector('#btn-settings')!.addEventListener('click', () => openSettings(sim.matchState === 'playing'))
document.querySelector('#btn-settings-done')!.addEventListener('click', closeSettings)
document.querySelector('#btn-leave')!.addEventListener('click', leave)
document.querySelector('#btn-rematch')!.addEventListener('click', rematch)
document.querySelector('#btn-home')!.addEventListener('click', leave)
document.querySelector('#btn-replay-tut')!.addEventListener('click', () => {
  settings.tutDone = false
  tutStep = 0
  tutShots.clear()
  saveSettings(settings)
})
document.querySelector('#tut-skip')!.addEventListener('click', () => {
  settings.tutDone = true
  saveSettings(settings)
  tutorial.hidden = true
})
muteBtn.addEventListener('click', () => {
  settings.sound = !settings.sound
  audio.muted = !settings.sound
  muteBtn.textContent = settings.sound ? '🔊' : '🔇'
  saveSettings(settings)
  const root = document.getElementById('seg-sound')!
  for (const b of root.querySelectorAll('button')) {
    b.classList.toggle('on', b.dataset.value === (settings.sound ? 'on' : 'off'))
  }
})
serveBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  audio.resume()
  serveEdge = true
})

function openSettings(pause: boolean) {
  if (pause) sim.paused = true
  settingsEl.dataset.pause = pause ? '1' : '0'
  if (!pause) menu.hidden = true
  settingsEl.hidden = false
}
function closeSettings() {
  settingsEl.hidden = true
  if (settingsEl.dataset.pause === '1') sim.paused = false
  else if (sim.matchState === 'menu') menu.hidden = false
}

function beginPlaying() {
  audio.resume()
  menu.hidden = true
  opponents.hidden = true
  settingsEl.hidden = true
  result.hidden = true
  resultShown = false
  tutStep = settings.tutDone ? 3 : 0
  tutShots.clear()
  startMatch(sim, settings.botId)
}

function rematch() {
  result.hidden = true
  resultShown = false
  startMatch(sim, settings.botId)
}

function leave() {
  showMenu(sim)
  result.hidden = true
  resultShown = false
  settingsEl.hidden = true
  opponents.hidden = true
  menu.hidden = false
  sim.paused = false
}

function readInput() {
  let moveX = 0
  let moveZ = 0
  if (down.has('KeyA') || down.has('ArrowLeft')) moveX -= 1
  if (down.has('KeyD') || down.has('ArrowRight')) moveX += 1
  if (down.has('KeyW') || down.has('ArrowUp')) moveZ -= 1
  if (down.has('KeyS') || down.has('ArrowDown')) moveZ += 1
  if (joyActive) {
    moveX = joyX
    moveZ = joyY
  }
  const input = {
    moveX,
    moveZ,
    shot: shotEdge,
    serve: serveEdge,
  }
  return input
}

function syncTutorial() {
  if (settings.tutDone || sim.matchState !== 'playing') {
    tutorial.hidden = true
    return
  }
  const hit = sim.lastHit
  if (tutStep === 0 && hit && hit.by === 'player' && hit.shot === 'serve' && hit.age < 0.2) tutStep = 1
  else if (tutStep === 1 && hit && hit.by === 'player' && hit.shot !== 'serve' && hit.age < 0.2) {
    tutShots.add(hit.shot)
    tutStep = 2
  } else if (tutStep === 2 && hit && hit.by === 'player' && hit.shot !== 'serve') {
    tutShots.add(hit.shot)
    if (tutShots.size >= 2) {
      settings.tutDone = true
      saveSettings(settings)
    }
  }
  if (settings.tutDone || tutStep > 2) {
    tutorial.hidden = true
    return
  }
  const touch = document.body.classList.contains('touch-mode')
  const tips = touch
    ? [
        'Tap Serve from the highlighted box.',
        'Tap Drive as the ball arrives. The stick aims it.',
        'Cross, Drop, Lob, and Boast are on the right. The stick runs the court.',
      ]
    : TIPS
  tutorial.hidden = false
  tutStepEl.textContent = `${tutStep + 1} / 3`
  tutText.textContent = tips[tutStep] ?? ''
}

function syncHud() {
  const playing = sim.matchState === 'playing' || sim.matchState === 'gameover'
  const overlayOpen = !menu.hidden || !settingsEl.hidden || !opponents.hidden || !result.hidden
  hud.classList.toggle('on-menu', !playing || overlayOpen)
  scoreMe.textContent = String(sim.score.player)
  scoreOp.textContent = String(sim.score.opponent)
  opName.textContent = sim.bot.name
  const youServe = sim.server === 'player' && sim.phase !== 'pointOver'
  const theyServe = sim.server === 'opponent' && sim.phase !== 'pointOver'
  serveMe.classList.toggle('off', !youServe)
  serveOp.classList.toggle('off', !theyServe)
  sideMe.classList.toggle('serving', youServe)
  sideOp.classList.toggle('serving', theyServe)
  rallyLabel.textContent = deuce(sim) ? 'Deuce · win by 2' : `First to ${TARGET_SCORE}`
  rallyLabel.classList.toggle('deuce', deuce(sim))
  turnLabel.textContent = turnText(sim)
  message.textContent = sim.message
  message.classList.toggle('fault', sim.phase === 'pointOver' && sim.matchState === 'playing')
  serveBtn.hidden = !(sim.matchState === 'playing' && sim.phase === 'serve' && sim.server === 'player')

  const hit = sim.lastHit
  if (hit && hit.by === 'player' && hit.grade) {
    const token = `${sim.stats.hits}:${hit.shot}:${hit.grade}`
    if (token !== feedbackToken) {
      feedbackToken = token
      const label = SHOT_KEYS.find((s) => s.type === hit.shot)?.label ?? hit.shot
      feedback.hidden = true
      feedback.className = 'feedback'
      feedback.innerHTML = `<div class="grade">${hit.grade.toUpperCase()}</div><div class="shot">${label}</div>`
      void feedback.offsetWidth
      feedback.hidden = false
      feedback.className = `feedback ${hit.grade}`
    }
  }

  if (sim.matchState === 'gameover' && !resultShown) {
    resultShown = true
    result.hidden = false
    const title = document.querySelector<HTMLHeadingElement>('#result-title')!
    const youWon = sim.winner === 'player'
    title.textContent = youWon ? 'You win' : `${sim.bot.name} wins`
    title.className = youWon ? 'win' : 'lose'
    document.querySelector('#final-me')!.textContent = String(sim.score.player)
    document.querySelector('#final-op')!.textContent = String(sim.score.opponent)
    document.querySelector('#stat-rallies')!.textContent = String(sim.stats.rallies)
    document.querySelector('#stat-long')!.textContent = String(sim.stats.longest)
    document.querySelector('#stat-hits')!.textContent = String(sim.stats.hits)
    document.querySelector('#stat-perfect')!.textContent = String(sim.stats.perfects)
  }
  syncTutorial()
}

paintOpponents()
paintSegments()
opName.textContent = botName()
muteBtn.textContent = settings.sound ? '🔊' : '🔇'
addEventListener('resize', () => view.resize())

let last = performance.now()
/** Wall-clock scale. Ball, running, swings, and the AI all use this. */
const PACE = 0.58

function frame(now: number) {
  const dt = Math.min(0.05, ((now - last) / 1000) * PACE)
  last = now
  const input = readInput()
  stepSim(sim, input, dt)
  shotEdge = null
  serveEdge = false
  if (!audio.muted) {
    for (const sound of sim.sounds) {
      if (sound.type === 'hit') audio.hit(sound.shot)
      else if (sound.type === 'bounce') audio.bounce()
      else if (sound.type === 'fault') audio.fault()
      else audio.score()
    }
  }
  syncHud()
  view.render(sim, settings.camera, dt, sim.matchState === 'menu')
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
