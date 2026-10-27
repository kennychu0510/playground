import './style.css'
import { Game } from './game'
import { bindInput, pollInput } from './input'
import { loadRoster, previewIdle, type Sheet } from './sprites'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

const overlay = document.getElementById('overlay')!
const panelSelect = document.getElementById('panel-select')!
const panelEnd = document.getElementById('panel-end')!
const rosterEl = document.getElementById('roster')!
const btnStart = document.getElementById('btn-start') as HTMLButtonElement
const btnRestart = document.getElementById('btn-restart') as HTMLButtonElement
const hud = document.getElementById('hud')!
const touch = document.getElementById('touch')!
const playerHp = document.getElementById('player-hp') as HTMLDivElement
const playerMp = document.getElementById('player-mp') as HTMLDivElement
const playerName = document.getElementById('player-name')!
const enemyHp = document.getElementById('enemy-hp') as HTMLDivElement
const enemyName = document.getElementById('enemy-name')!
const waveLabel = document.getElementById('wave-label')!
const endTitle = document.getElementById('end-title')!
const endBody = document.getElementById('end-body')!
const endEyebrow = document.getElementById('end-eyebrow')!

let sheets: Map<string, Sheet>
let selectedId: string | null = null
let game: Game | null = null
let raf = 0
let last = 0

function isTouchDevice() {
  return matchMedia('(hover: none), (pointer: coarse)').matches || 'ontouchstart' in window
}

async function boot() {
  const loaded = await loadRoster()
  sheets = loaded.sheets
  bindInput(document.getElementById('app')!)

  rosterEl.innerHTML = ''
  for (const def of loaded.meta.characters) {
    const sheet = sheets.get(def.id)!
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'char-card'
    btn.dataset.id = def.id
    const cv = document.createElement('canvas')
    previewIdle(cv, sheet)
    const meta = document.createElement('div')
    meta.className = 'meta'
    meta.innerHTML = `<strong>${def.name}</strong><span>${def.role}</span>`
    const stats = document.createElement('div')
    stats.className = 'stats'
    stats.innerHTML = `HP ${def.hp}<br>MP ${def.mp}<br>SP cost ${def.specialCost}`
    btn.append(cv, meta, stats)
    btn.addEventListener('click', () => {
      selectedId = def.id
      rosterEl.querySelectorAll('.char-card').forEach((el) => el.classList.toggle('selected', el === btn))
      btnStart.disabled = false
    })
    rosterEl.append(btn)
  }

  // default select first
  const first = rosterEl.querySelector('.char-card') as HTMLButtonElement | null
  first?.click()

  btnStart.addEventListener('click', () => {
    if (!selectedId) return
    startMatch(selectedId)
  })
  btnRestart.addEventListener('click', () => {
    panelEnd.classList.add('hidden')
    panelSelect.classList.remove('hidden')
    overlay.classList.remove('hidden')
    hud.classList.add('hidden')
    touch.classList.add('hidden')
    game = null
  })
}

function startMatch(id: string) {
  game = new Game(sheets, id)
  overlay.classList.add('hidden')
  panelSelect.classList.add('hidden')
  panelEnd.classList.add('hidden')
  hud.classList.remove('hidden')
  if (isTouchDevice()) touch.classList.remove('hidden')
  playerName.textContent = sheets.get(id)!.def.name
  waveLabel.textContent = 'Stage 1 · Dojo Yard'
  last = performance.now()
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(loop)
}

function syncHud() {
  if (!game) return
  const p = game.player
  playerHp.style.width = `${(100 * p.hp) / p.maxHp}%`
  playerMp.style.width = `${(100 * p.mp) / p.maxMp}%`
  const e = game.enemyHpSummary()
  enemyHp.style.width = `${e.max ? (100 * e.hp) / e.max : 0}%`
  enemyName.textContent = `Enemies ${e.alive}/${e.total}`
}

function showEnd(win: boolean) {
  overlay.classList.remove('hidden')
  panelSelect.classList.add('hidden')
  panelEnd.classList.remove('hidden')
  endEyebrow.textContent = win ? 'Stage clear' : 'Defeated'
  endTitle.textContent = win ? 'Victory!' : 'KO…'
  endBody.textContent = win
    ? 'All enemies are down. Specials cost MP — it regenerates over time.'
    : 'Your HP hit zero. Pick a fighter and try again.'
  touch.classList.add('hidden')
}

function loop(now: number) {
  const dt = Math.min(0.033, (now - last) / 1000)
  last = now
  if (game) {
    game.update(dt, pollInput())
    // letterbox clear
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    game.draw(ctx)
    syncHud()
    if (game.result === 'win') {
      showEnd(true)
      game = null
    } else if (game.result === 'lose') {
      showEnd(false)
      game = null
    }
  }
  raf = requestAnimationFrame(loop)
}

boot().catch((err) => {
  console.error(err)
  overlay.classList.remove('hidden')
  panelSelect.querySelector('h2')!.textContent = 'Failed to load'
  panelSelect.querySelector('.body')!.textContent = String(err)
})
