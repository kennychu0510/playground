import './style.css'
import Matter from 'matter-js'
import decomp from 'poly-decomp'
import { buildTerrain, heightAt, terrainPolyline, TERRAIN_LEN } from './game/terrain'
import { createBike, driveBike, resetBike, swapWheels, WHEEL_R, type Bike } from './game/bike'
import { createDrawPad } from './game/drawPad'
import type { Pt } from './game/wheelShape'

// Matter needs poly-decomp for concave fromVertices
Matter.Common.setDecomp(decomp)

const canvas = document.getElementById('world') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const distEl = document.getElementById('dist')!
const bannerEl = document.getElementById('banner')!
const drawPanel = document.getElementById('draw-panel')!
const btnDraw = document.getElementById('btn-draw') as HTMLButtonElement
const btnGas = document.getElementById('btn-gas') as HTMLButtonElement
const btnBrake = document.getElementById('btn-brake') as HTMLButtonElement
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement
const btnCancel = document.getElementById('btn-cancel') as HTMLButtonElement
const btnApply = document.getElementById('btn-apply') as HTMLButtonElement
const drawCanvas = document.getElementById('draw-pad') as HTMLCanvasElement

const drawPad = createDrawPad(drawCanvas)

const engine = Matter.Engine.create({
  gravity: { x: 0, y: 1.05 },
})
const world = engine.world

buildTerrain(world)
let bike: Bike = createBike(world, 100)

let camX = 0
let camY = 0
let gas = 0
let brake = 0
let started = false
let dpr = 1

function showBanner(text: string, sticky = false) {
  bannerEl.textContent = text
  bannerEl.classList.remove('fade')
  if (!sticky) {
    window.setTimeout(() => bannerEl.classList.add('fade'), 2200)
  }
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.floor(window.innerWidth * dpr)
  canvas.height = Math.floor(window.innerHeight * dpr)
  canvas.style.width = `${window.innerWidth}px`
  canvas.style.height = `${window.innerHeight}px`
}
window.addEventListener('resize', resize)
resize()

function bindHold(btn: HTMLButtonElement, set: (v: number) => void) {
  const down = (e: Event) => {
    e.preventDefault()
    btn.classList.add('held')
    set(1)
  }
  const up = () => {
    btn.classList.remove('held')
    set(0)
  }
  btn.addEventListener('pointerdown', down)
  btn.addEventListener('pointerup', up)
  btn.addEventListener('pointerleave', up)
  btn.addEventListener('pointercancel', up)
}
bindHold(btnGas, (v) => {
  gas = v
})
bindHold(btnBrake, (v) => {
  brake = v
})

window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    gas = 1
    btnGas.classList.add('held')
  }
  if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'Space') {
    brake = 1
    btnBrake.classList.add('held')
  }
  if (e.code === 'KeyR') {
    resetBike(world, bike, 100)
    showBanner('Reset')
  }
})
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    gas = 0
    btnGas.classList.remove('held')
  }
  if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'Space') {
    brake = 0
    btnBrake.classList.remove('held')
  }
})

function openDraw() {
  drawPanel.classList.remove('hidden')
  drawPad.clear()
  showBanner('Draw a closed shape, then Apply', true)
}
function closeDraw() {
  drawPanel.classList.add('hidden')
  bannerEl.classList.add('fade')
}

btnDraw.addEventListener('click', () => {
  if (drawPanel.classList.contains('hidden')) openDraw()
  else closeDraw()
})
btnClear.addEventListener('click', () => drawPad.clear())
btnCancel.addEventListener('click', () => closeDraw())
btnApply.addEventListener('click', () => {
  const verts = drawPad.toWheel(WHEEL_R)
  if (!verts) {
    showBanner('Draw a bigger shape first', true)
    return
  }
  applyWheel(verts)
  closeDraw()
  if (!started) {
    started = true
    showBanner('Gas to ride · redraw anytime')
  } else {
    showBanner('New wheel fitted')
  }
})

function applyWheel(verts: Pt[]) {
  swapWheels(world, bike, verts)
}

// First launch: open draw pad with default circle already riding
showBanner('Draw a wheel (or just Gas to ride the circle)', true)
openDraw()

function drawWheelVisual(body: Matter.Body, verts: Pt[]) {
  const custom = (body as Matter.Body & { customVerts?: Pt[] }).customVerts ?? verts
  ctx.save()
  ctx.translate(body.position.x, body.position.y)
  ctx.rotate(body.angle)
  ctx.beginPath()
  if (custom.length) {
    ctx.moveTo(custom[0]!.x, custom[0]!.y)
    for (let i = 1; i < custom.length; i++) ctx.lineTo(custom[i]!.x, custom[i]!.y)
    ctx.closePath()
  } else {
    ctx.arc(0, 0, WHEEL_R, 0, Math.PI * 2)
  }
  ctx.fillStyle = 'rgba(232, 238, 252, 0.92)'
  ctx.fill()
  ctx.strokeStyle = '#3ecf8e'
  ctx.lineWidth = 2.5
  ctx.stroke()
  // Hub + spoke mark so spin reads
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(WHEEL_R * 0.75, 0)
  ctx.strokeStyle = '#0b1220'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, 4, 0, Math.PI * 2)
  ctx.fillStyle = '#f0b429'
  ctx.fill()
  ctx.restore()
}

function drawFrame(b: Bike) {
  const c = b.chassis
  const fx = b.front.position.x
  const fy = b.front.position.y
  const rx = b.rear.position.x
  const ry = b.rear.position.y

  ctx.save()
  ctx.strokeStyle = '#f0b429'
  ctx.fillStyle = '#f0b429'
  ctx.lineWidth = 4
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Diamond frame
  const seat = {
    x: c.position.x - Math.cos(c.angle) * 8,
    y: c.position.y - 22,
  }
  const head = {
    x: c.position.x + Math.cos(c.angle) * 18,
    y: c.position.y - 16,
  }
  ctx.beginPath()
  ctx.moveTo(rx, ry)
  ctx.lineTo(seat.x, seat.y)
  ctx.lineTo(head.x, head.y)
  ctx.lineTo(fx, fy)
  ctx.moveTo(seat.x, seat.y)
  ctx.lineTo(fx, fy)
  ctx.moveTo(rx, ry)
  ctx.lineTo(head.x, head.y)
  ctx.stroke()

  // Seat
  ctx.beginPath()
  ctx.ellipse(seat.x, seat.y - 4, 10, 3.5, c.angle, 0, Math.PI * 2)
  ctx.fill()

  // Handlebar
  ctx.beginPath()
  ctx.moveTo(head.x, head.y)
  ctx.lineTo(head.x + Math.cos(c.angle - 0.4) * 12, head.y + Math.sin(c.angle - 0.4) * 12)
  ctx.stroke()

  // Rider blob
  ctx.beginPath()
  ctx.arc(c.position.x, c.position.y - 34, 9, 0, Math.PI * 2)
  ctx.fillStyle = '#e8eefc'
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(c.position.x, c.position.y - 26)
  ctx.lineTo(seat.x, seat.y)
  ctx.lineTo(c.position.x + 6, c.position.y - 8)
  ctx.strokeStyle = '#e8eefc'
  ctx.lineWidth = 3
  ctx.stroke()

  ctx.restore()
}

function render() {
  const w = canvas.width / dpr
  const h = canvas.height / dpr

  // Soft camera follow
  const targetX = bike.chassis.position.x
  const targetY = bike.chassis.position.y
  camX += (targetX - camX) * 0.12
  camY += (targetY - 40 - camY) * 0.1

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  // Sky gradient already in CSS; add distant hills
  ctx.save()
  ctx.translate(w / 2 - camX * 0.3, h * 0.35 - camY * 0.05)
  ctx.fillStyle = 'rgba(30, 58, 90, 0.45)'
  ctx.beginPath()
  ctx.moveTo(-800, 200)
  for (let x = -800; x <= 800; x += 40) {
    const y = Math.sin(x * 0.01 + camX * 0.001) * 30 + Math.sin(x * 0.004) * 50
    ctx.lineTo(x, y)
  }
  ctx.lineTo(800, 400)
  ctx.lineTo(-800, 400)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.translate(w / 2 - camX, h / 2 - camY)

  // Ground fill + surface
  const viewL = camX - w
  const viewR = camX + w
  const poly = terrainPolyline(viewL - 50, viewR + 50, 12)
  ctx.beginPath()
  ctx.moveTo(poly[0]!.x, poly[0]!.y)
  for (const p of poly) ctx.lineTo(p.x, p.y)
  ctx.lineTo(viewR + 50, camY + h)
  ctx.lineTo(viewL - 50, camY + h)
  ctx.closePath()
  ctx.fillStyle = '#1b4332'
  ctx.fill()
  ctx.strokeStyle = '#52b788'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(poly[0]!.x, poly[0]!.y)
  for (const p of poly) ctx.lineTo(p.x, p.y)
  ctx.stroke()

  // Distance markers
  ctx.fillStyle = 'rgba(232, 238, 252, 0.35)'
  ctx.font = '12px system-ui'
  const start = Math.floor(viewL / 200) * 200
  for (let x = start; x < viewR; x += 200) {
    const y = heightAt(x)
    ctx.fillRect(x, y, 2, 12)
    ctx.fillText(`${Math.max(0, Math.round(x / 40))}m`, x + 4, y + 24)
  }

  drawWheelVisual(bike.rear, bike.wheelVerts)
  drawWheelVisual(bike.front, bike.wheelVerts)
  drawFrame(bike)

  // Finish flag
  const finX = TERRAIN_LEN - 200
  const finY = heightAt(finX)
  ctx.strokeStyle = '#e8eefc'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(finX, finY)
  ctx.lineTo(finX, finY - 70)
  ctx.stroke()
  ctx.fillStyle = '#3ecf8e'
  ctx.fillRect(finX, finY - 70, 28, 18)

  ctx.restore()
}

let last = performance.now()
function loop(now: number) {
  const dt = Math.min(32, now - last)
  last = now

  driveBike(bike, gas, brake)
  Matter.Engine.update(engine, dt)

  // Soft upright assist so odd wheels don't instantly tip forever
  const ang = bike.chassis.angle
  if (Math.abs(ang) < 1.1) {
    Matter.Body.setAngularVelocity(
      bike.chassis,
      bike.chassis.angularVelocity - ang * 0.04,
    )
  }

  // Fell off / tumbled hard → soft reset
  if (bike.chassis.position.y > heightAt(bike.chassis.position.x) + 220 || Math.abs(ang) > 2.4) {
    resetBike(world, bike, Math.max(100, bike.chassis.position.x - 80))
    showBanner('Ouch — try again')
  }

  if (bike.chassis.position.x > TERRAIN_LEN - 200) {
    showBanner('Finish! Press R or keep riding')
  }

  const meters = Math.max(0, (bike.chassis.position.x - 100) / 40)
  distEl.textContent = `${meters.toFixed(1)} m`

  render()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
