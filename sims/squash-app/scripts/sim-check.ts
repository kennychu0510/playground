import { createSim, startMatch, stepSim, type Sim, type SimInput } from '../src/game/sim.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const idle: SimInput = { moveX: 0, moveZ: 0, shot: null, serve: false }

function run(sim: Sim, input: SimInput, seconds: number) {
  const frames = Math.round(seconds * 60)
  for (let i = 0; i < frames; i++) stepSim(sim, input, 1 / 60)
}

function serveAndWatch() {
  const sim = createSim()
  sim.aiEnabled = false
  startMatch(sim, 'farag')
  stepSim(sim, { ...idle, serve: true }, 1 / 60)
  assert(sim.phase === 'rally', 'serve should start a rally, got ' + sim.phase)
  assert(sim.ball.live, 'ball should be live')
  let bounce: { x: number; z: number; y: number } | null = null
  let frontY = 0
  for (let i = 0; i < 240 && !bounce && sim.phase === 'rally'; i++) {
    const before = sim.ball.frontWall
    stepSim(sim, idle, 1 / 60)
    if (!before && sim.ball.frontWall) frontY = sim.ball.y
    if (sim.ball.bounces >= 1) bounce = { x: sim.ball.x, z: sim.ball.z, y: sim.ball.y }
  }
  console.log('serve', {
    phase: sim.phase,
    fault: sim.fault,
    frontY: Number(frontY.toFixed(2)),
    bounce,
  })
  assert(sim.fault == null, 'serve fault before the box bounce: ' + sim.fault)
  assert(frontY > 1.78 && frontY < 4.57, 'front contact ' + frontY)
  assert(bounce !== null, 'serve produced no bounce')
  assert(bounce.z > 5.3 && bounce.x < 0, 'bounce missed the left box ' + JSON.stringify(bounce))
}

function aiReturnsServe() {
  const sim = createSim()
  startMatch(sim, 'farag')
  stepSim(sim, { ...idle, serve: true }, 1 / 60)
  for (let i = 0; i < 360 && sim.rallyHits < 2 && sim.phase === 'rally'; i++) stepSim(sim, idle, 1 / 60)
  console.log('ai return', { hits: sim.rallyHits, phase: sim.phase, fault: sim.fault, score: sim.score, last: sim.lastHit })
  assert(sim.rallyHits >= 2, 'opponent should return the serve, fault ' + sim.fault)
}

function doubleBounceAwardsPoint() {
  const sim = createSim()
  sim.aiEnabled = false
  startMatch(sim, 'farag')
  sim.phase = 'rally'
  sim.lastHitter = 'player'
  sim.serveLive = false
  sim.ball.live = true
  sim.ball.frontWall = true
  sim.ball.bounces = 0
  sim.ball.x = 0
  sim.ball.y = 0.4
  sim.ball.z = 6
  sim.ball.vx = 0
  sim.ball.vy = 0
  sim.ball.vz = 0.2
  run(sim, idle, 1.6)
  console.log('double', sim.phase, sim.fault, sim.score)
  assert(sim.score.player === 1, 'player should win when the opponent lets the ball die')
}

function driveHitsFront() {
  const sim = createSim()
  sim.aiEnabled = false
  startMatch(sim, 'farag')
  sim.phase = 'rally'
  sim.server = 'opponent'
  sim.lastHitter = 'opponent'
  sim.serveLive = false
  sim.ball.live = true
  sim.ball.frontWall = true
  sim.ball.bounces = 1
  sim.ball.x = sim.player.x + 0.3
  sim.ball.y = 1
  sim.ball.z = sim.player.z - 0.7
  sim.ball.vx = 0
  sim.ball.vy = 0
  sim.ball.vz = 0.4
  stepSim(sim, { ...idle, shot: 'drive', moveX: 0 }, 1 / 60)
  assert(sim.lastHitter === 'player', 'drive should connect, message ' + sim.message + ' phase ' + sim.phase)
  assert(sim.lastHit?.grade === 'perfect' || sim.lastHit?.grade === 'good', 'grade ' + sim.lastHit?.grade)
  let sawFront = false
  for (let i = 0; i < 180 && sim.phase === 'rally'; i++) {
    const was = sim.ball.frontWall
    stepSim(sim, idle, 1 / 60)
    if (!was && sim.ball.frontWall) sawFront = true
  }
  console.log('drive', { sawFront, phase: sim.phase, fault: sim.fault, hit: sim.lastHit })
  assert(sawFront || sim.ball.frontWall, 'drive should reach the front wall')
  assert(sim.fault !== 'tin', 'drive should clear the tin')
}

serveAndWatch()
aiReturnsServe()
doubleBounceAwardsPoint()
driveHitsFront()
console.log('sim-check ok')
