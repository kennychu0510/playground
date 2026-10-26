import { getBot, pickShot, type BotProfile, type ShotType } from './bots'
import {
  COURT,
  bounceInReceiverBox,
  clampToCourt,
  clampToServiceBox,
  serveSideForScore,
  serviceBoxAnchor,
  type ServeSide,
} from './court'
import {
  gradeOf,
  inReach,
  serveVelocity,
  shotVelocity,
  timingError,
  type Grade,
} from './shots'

export type Side = 'player' | 'opponent'
export type Phase = 'serve' | 'rally' | 'pointOver'
export type MatchState = 'menu' | 'playing' | 'gameover'
export type Fault =
  | 'tin'
  | 'out'
  | 'not_up'
  | 'double'
  | 'serve_line'
  | 'serve_box'
  | 'serve_front'

export const FAULT_TEXT: Record<Fault, string> = {
  tin: 'Tin',
  out: 'Out',
  not_up: 'Not up',
  double: 'Double bounce',
  serve_line: 'Serve below the service line',
  serve_box: 'Serve missed the box',
  serve_front: 'Serve must hit the front wall first',
}

export type Actor = {
  x: number
  z: number
  swing: number
  swingType: ShotType | 'serve'
  charging: boolean
  charge: number
}

export type Ball = {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  bounces: number
  frontWall: boolean
  live: boolean
}

export type SoundEvent = { type: 'hit' | 'bounce' | 'fault' | 'score'; shot?: ShotType | 'serve' }

export type SimInput = {
  moveX: number
  moveZ: number
  chargeShot: ShotType | null
  releaseShot: ShotType | null
  serve: boolean
}

export type Sim = {
  matchState: MatchState
  paused: boolean
  phase: Phase
  server: Side
  serveSide: ServeSide
  serveLive: boolean
  player: Actor
  opponent: Actor
  ball: Ball
  bot: BotProfile
  aiEnabled: boolean
  score: { player: number; opponent: number }
  winner: Side | null
  lastHitter: Side | null
  rallyHits: number
  fault: Fault | null
  faultBy: Side | null
  message: string
  messageTtl: number
  deadTimer: number
  sinceHit: number
  stillTime: number
  aiServeTimer: number
  aiSpot: { x: number; z: number }
  aiSpotAge: number
  playerSpot: { x: number; z: number }
  playerSpotAge: number
  acc: number
  time: number
  lastHit: { by: Side; shot: ShotType | 'serve'; grade: Grade | null; age: number } | null
  stats: { rallies: number; longest: number; hits: number; perfects: number }
  sounds: SoundEvent[]
}

const STEP = 1 / 120
const SWING = 0.32
const R = COURT.ballRadius
const MOVE = 4.35
const IDLE: SimInput = { moveX: 0, moveZ: 0, chargeShot: null, releaseShot: null, serve: false }

function actor(): Actor {
  return { x: 0, z: 7.4, swing: 0, swingType: 'drive', charging: false, charge: 0 }
}

function ball(): Ball {
  return { x: 0, y: 1, z: 7, vx: 0, vy: 0, vz: 0, bounces: 0, frontWall: false, live: false }
}

export function createSim(): Sim {
  const sim: Sim = {
    matchState: 'menu',
    paused: false,
    phase: 'serve',
    server: 'player',
    serveSide: 'right',
    serveLive: false,
    player: actor(),
    opponent: actor(),
    ball: ball(),
    bot: getBot('farag'),
    aiEnabled: true,
    score: { player: 0, opponent: 0 },
    winner: null,
    lastHitter: null,
    rallyHits: 0,
    fault: null,
    faultBy: null,
    message: '',
    messageTtl: 0,
    deadTimer: 0,
    sinceHit: 0,
    stillTime: 0,
    aiServeTimer: 0,
    aiSpot: { x: 0, z: 6 },
    aiSpotAge: 1,
    playerSpot: { x: 0, z: 7 },
    playerSpotAge: 1,
    acc: 0,
    time: 0,
    lastHit: null,
    stats: { rallies: 0, longest: 0, hits: 0, perfects: 0 },
    sounds: [],
  }
  showMenu(sim)
  return sim
}

export function showMenu(sim: Sim) {
  sim.matchState = 'menu'
  sim.paused = false
  sim.phase = 'serve'
  sim.server = 'player'
  sim.winner = null
  sim.fault = null
  sim.message = ''
  sim.messageTtl = 0
  sim.serveSide = 'right'
  sim.serveLive = false
  sim.lastHitter = null
  placeForServe(sim)
  holdBall(sim)
}

export function setBot(sim: Sim, id: string) {
  sim.bot = getBot(id)
}

export function startMatch(sim: Sim, botId: string) {
  sim.bot = getBot(botId)
  sim.score.player = 0
  sim.score.opponent = 0
  sim.winner = null
  sim.stats = { rallies: 0, longest: 0, hits: 0, perfects: 0 }
  sim.matchState = 'playing'
  sim.paused = false
  sim.message = ''
  beginPoint(sim)
}

function other(side: Side): Side {
  return side === 'player' ? 'opponent' : 'player'
}

function won(sim: Sim, side: Side) {
  const s = sim.score[side]
  const o = sim.score[other(side)]
  return s >= 11 && s - o >= 2
}

function placeForServe(sim: Sim) {
  const serverSide = serveSideForScore(sim.score[sim.server])
  sim.serveSide = serverSide
  const recvSide: ServeSide = serverSide === 'right' ? 'left' : 'right'
  const s = serviceBoxAnchor(serverSide)
  const r = serviceBoxAnchor(recvSide)
  const server = sim.server === 'player' ? sim.player : sim.opponent
  const receiver = sim.server === 'player' ? sim.opponent : sim.player
  server.x = s.x
  server.z = s.z
  receiver.x = r.x
  receiver.z = r.z - 0.15
  server.swing = 0
  receiver.swing = 0
  server.charging = false
  receiver.charging = false
  server.charge = 0
  receiver.charge = 0
}

function holdBall(sim: Sim) {
  const server = sim.server === 'player' ? sim.player : sim.opponent
  const b = sim.ball
  b.x = server.x + 0.34
  b.y = 0.95
  b.z = server.z - 0.24
  b.vx = b.vy = b.vz = 0
  b.bounces = 0
  b.frontWall = false
  b.live = false
}

function beginPoint(sim: Sim) {
  sim.phase = 'serve'
  sim.serveLive = false
  sim.lastHitter = null
  sim.rallyHits = 0
  sim.fault = null
  sim.faultBy = null
  sim.deadTimer = 0
  sim.sinceHit = 0
  sim.stillTime = 0
  sim.aiSpotAge = 1
  sim.playerSpotAge = 1
  placeForServe(sim)
  holdBall(sim)
  sim.aiServeTimer = sim.server === 'opponent' ? 1.05 : 0
  if (sim.server === 'player') {
    sim.message = 'Your serve'
    sim.messageTtl = 1.2
  } else {
    sim.message = 'Opponent serve'
    sim.messageTtl = 1.2
  }
}

function endPoint(sim: Sim, fault: Fault, by: Side) {
  if (sim.phase === 'pointOver' || sim.matchState !== 'playing') return
  sim.phase = 'pointOver'
  sim.fault = fault
  sim.faultBy = by
  sim.message = FAULT_TEXT[fault]
  sim.messageTtl = 1.45
  sim.deadTimer = 1.25
  sim.serveLive = false
  const winner = other(by)
  sim.score[winner] += 1
  sim.server = winner
  sim.stats.rallies += 1
  sim.stats.longest = Math.max(sim.stats.longest, sim.rallyHits)
  sim.ball.vx = sim.ball.vy = sim.ball.vz = 0
  sim.sounds.push({ type: 'fault' })
  if (won(sim, winner)) {
    sim.matchState = 'gameover'
    sim.winner = winner
    sim.sounds.push({ type: 'score' })
    sim.message = winner === 'player' ? 'You win' : `${sim.bot.name} wins`
    sim.messageTtl = 3
  }
}

type BallEvent =
  | { type: 'floor'; x: number; z: number; count: number }
  | { type: 'front'; x: number; y: number; first: boolean }
  | { type: 'side' }
  | { type: 'back' }
  | { type: 'tin' }
  | { type: 'out' }

function integrate(ball: Ball, dt: number, events: BallEvent[] | null) {
  if (!ball.live) return
  ball.vy -= 9.81 * dt
  const drag = Math.exp(-0.2 * dt)
  ball.vx *= drag
  ball.vy *= drag
  ball.vz *= drag
  ball.x += ball.vx * dt
  ball.y += ball.vy * dt
  ball.z += ball.vz * dt

  for (let n = 0; n < 4; n++) {
    let hit = false
    // Front plane before the floor so a ball arriving at the tin is not called a bounce.
    if (ball.z < R) {
      ball.z = R
      hit = true
      if (ball.y > COURT.frontHeight) {
        events?.push({ type: 'out' })
        ball.vz = Math.abs(ball.vz) * 0.2
        return
      }
      if (ball.y < COURT.tin) {
        events?.push({ type: 'tin' })
        ball.vz = Math.abs(ball.vz) * 0.15
        ball.vy *= 0.3
        return
      }
      const first = !ball.frontWall
      ball.frontWall = true
      ball.vz = Math.abs(ball.vz) * 0.84
      ball.vx *= 0.97
      events?.push({ type: 'front', x: ball.x, y: ball.y, first })
    }
    if (ball.y < R && ball.vy < 0) {
      const impact = -ball.vy
      ball.y = R
      hit = true
      if (impact < 0.42) {
        ball.vy = 0
        ball.vx *= 0.8
        ball.vz *= 0.8
      } else {
        ball.vy = impact * 0.5
        ball.vx *= 0.84
        ball.vz *= 0.84
        ball.bounces += 1
        events?.push({ type: 'floor', x: ball.x, z: ball.z, count: ball.bounces })
      }
    }
    if (ball.x < -COURT.width / 2 + R || ball.x > COURT.width / 2 - R) {
      ball.x = ball.x < 0 ? -COURT.width / 2 + R : COURT.width / 2 - R
      hit = true
      if (ball.y > COURT.sideHeight) {
        events?.push({ type: 'out' })
        return
      }
      ball.vx = -ball.vx * 0.8
      events?.push({ type: 'side' })
    }
    if (ball.z > COURT.length - R) {
      hit = true
      if (ball.y > COURT.backHeight) {
        events?.push({ type: 'out' })
        return
      }
      ball.z = COURT.length - R
      ball.vz = -Math.abs(ball.vz) * 0.72
      events?.push({ type: 'back' })
    }
    if (!hit) break
  }
}

function resolve(sim: Sim, events: BallEvent[]) {
  for (const ev of events) {
    if (sim.phase !== 'rally') return
    if (ev.type === 'floor') {
      sim.sounds.push({ type: 'bounce' })
      if (!sim.ball.frontWall) {
        endPoint(sim, 'not_up', sim.lastHitter ?? sim.server)
        return
      }
      if (sim.serveLive && ev.count === 1) {
        if (!bounceInReceiverBox(ev.x, ev.z, sim.serveSide)) {
          endPoint(sim, 'serve_box', sim.server)
          return
        }
        sim.serveLive = false
      }
      if (ev.count >= 2) {
        const recv = sim.lastHitter ? other(sim.lastHitter) : sim.server
        endPoint(sim, 'double', recv)
        return
      }
    } else if (ev.type === 'front') {
      if (sim.serveLive && ev.first && ev.y < COURT.serviceLineY) {
        endPoint(sim, 'serve_line', sim.server)
        return
      }
    } else if (ev.type === 'tin') {
      endPoint(sim, 'tin', sim.lastHitter ?? sim.server)
      return
    } else if (ev.type === 'out') {
      endPoint(sim, 'out', sim.lastHitter ?? sim.server)
      return
    } else if (ev.type === 'side' || ev.type === 'back') {
      if (sim.serveLive && !sim.ball.frontWall) {
        endPoint(sim, 'serve_front', sim.server)
        return
      }
      if (ev.type === 'back' && sim.serveLive && sim.ball.bounces === 0) {
        endPoint(sim, 'serve_box', sim.server)
        return
      }
    }
  }
}

function predictBounce(ball: Ball) {
  const b: Ball = { ...ball }
  let t = 0
  const dt = 1 / 40
  while (t < 1.7) {
    const events: BallEvent[] = []
    integrate(b, dt, events)
    t += dt
    if (events.some((e) => e.type === 'tin' || e.type === 'out')) break
    if (b.frontWall && b.bounces >= 1) return { x: b.x, z: b.z }
  }
  return { x: b.x, z: Math.max(1, Math.min(COURT.length - 0.5, b.z)) }
}

function moveToward(actor: Actor, x: number, z: number, speed: number, dt: number) {
  const dx = x - actor.x
  const dz = z - actor.z
  const d = Math.hypot(dx, dz)
  if (d < 0.02) return
  const step = Math.min(d, speed * dt)
  actor.x += (dx / d) * step
  actor.z += (dz / d) * step
}

function separate(a: Actor, b: Actor) {
  let dx = b.x - a.x
  let dz = b.z - a.z
  const d = Math.hypot(dx, dz)
  if (d >= 0.78 || d < 1e-4) return
  const push = (0.78 - d) / 2
  dx /= d
  dz /= d
  a.x -= dx * push
  a.z -= dz * push
  b.x += dx * push
  b.z += dz * push
}

function strike(sim: Sim, side: Side, shot: ShotType | 'serve', power: number, aimX: number, grade: Grade | null) {
  const actor = side === 'player' ? sim.player : sim.opponent
  const from = { x: sim.ball.x, y: sim.ball.y, z: sim.ball.z }
  const vel =
    shot === 'serve'
      ? serveVelocity(from, sim.serveSide, power, aimX)
      : shotVelocity({ shot, from, aimX, power, grade })
  sim.ball.vx = vel.x
  sim.ball.vy = vel.y
  sim.ball.vz = vel.z
  sim.ball.bounces = 0
  sim.ball.frontWall = false
  sim.ball.live = true
  sim.phase = 'rally'
  sim.lastHitter = side
  sim.rallyHits += 1
  sim.sinceHit = 0
  sim.stillTime = 0
  sim.serveLive = shot === 'serve'
  actor.swing = SWING
  actor.swingType = shot
  actor.charging = false
  actor.charge = 0
  sim.lastHit = { by: side, shot, grade, age: 0 }
  if (side === 'player') {
    sim.message = ''
    sim.messageTtl = 0
  }
  sim.sounds.push({ type: 'hit', shot })
  if (side === 'player') {
    sim.stats.hits += 1
    if (grade === 'perfect') sim.stats.perfects += 1
  }
  sim.aiSpotAge = 1
  sim.playerSpotAge = 1
}

function canStrike(sim: Sim, side: Side) {
  if (sim.phase === 'serve') return sim.server === side
  if (sim.phase !== 'rally') return false
  if (sim.lastHitter === side) return false
  if (!sim.ball.frontWall) return false
  return true
}

function tryPlayer(sim: Sim, input: SimInput) {
  const a = sim.player
  if (a.swing > 0) return
  const serveNow = sim.phase === 'serve' && sim.server === 'player' && (input.serve || input.releaseShot !== null)
  if (serveNow) {
    strike(sim, 'player', 'serve', Math.max(0.62, a.charge || 0.7), input.moveX, null)
    return
  }
  if (!input.releaseShot) return
  if (!canStrike(sim, 'player')) return
  const shot = input.releaseShot
  const err = timingError(a.x, a.z, sim.ball)
  if (!inReach(a.x, a.z, sim.ball) || Math.abs(err) > 0.3) {
    a.swing = SWING
    a.swingType = shot
    a.charging = false
    a.charge = 0
    sim.message = 'Whiff'
    sim.messageTtl = 0.65
    return
  }
  strike(sim, 'player', shot, Math.max(0.35, a.charge), input.moveX, gradeOf(err))
}

function tryAi(sim: Sim, dt: number) {
  if (!sim.aiEnabled) return
  const a = sim.opponent
  if (sim.phase === 'serve' && sim.server === 'opponent') {
    sim.aiServeTimer -= dt
    if (sim.aiServeTimer <= 0 && a.swing <= 0) {
      const aim = (Math.random() - 0.5) * sim.bot.error * 4
      strike(sim, 'opponent', 'serve', 0.72, aim, null)
    }
    return
  }
  if (!canStrike(sim, 'opponent') || a.swing > 0) return
  if (sim.sinceHit < sim.bot.reaction) return
  if (!sim.ball.frontWall) return
  if (!inReach(a.x, a.z, sim.ball)) return
  const err = timingError(a.x, a.z, sim.ball)
  if (err > 0.06 || err < -0.1) return
  const shot = pickShot(sim.bot)
  let grade: Grade = 'good'
  const roll = Math.random()
  if (roll < sim.bot.error * 0.55) grade = 'late'
  else if (roll < sim.bot.error * 1.15) grade = 'early'
  const away = -Math.sign(sim.player.x || 1)
  let aim = away * (0.35 + Math.random() * 0.55)
  if (Math.random() < sim.bot.error) aim = Math.random() * 2.4 - 1.2
  const power = Math.max(0.4, Math.min(1, (0.62 + Math.random() * 0.3) * sim.bot.power))
  strike(sim, 'opponent', shot, power, aim, grade)
  sim.message = `${sim.bot.name} · ${shot}`
  sim.messageTtl = 0.7
}

function movePlayer(sim: Sim, input: SimInput, dt: number) {
  const a = sim.player
  const serving = sim.phase === 'serve' && sim.server === 'player'
  const speed = serving ? MOVE * 0.65 : MOVE
  const yourShot = sim.phase === 'rally' && sim.lastHitter === 'opponent' && sim.ball.frontWall
  if (yourShot && Math.abs(input.moveX) < 0.18) {
    sim.playerSpotAge += dt
    if (sim.playerSpotAge > 0.07) {
      sim.playerSpot = predictBounce(sim.ball)
      sim.playerSpotAge = 0
    }
    const targetX = sim.playerSpot.x - 0.42
    const dx = targetX - a.x
    const max = speed * dt
    a.x += Math.max(-max, Math.min(max, dx))
  } else {
    a.x += input.moveX * speed * dt
  }
  a.z += input.moveZ * speed * dt
  if (serving) {
    const c = clampToServiceBox(a.x, a.z, sim.serveSide)
    a.x = c.x
    a.z = c.z
  } else {
    const c = clampToCourt(a.x, a.z)
    a.x = c.x
    a.z = c.z
  }
}

function moveOpponent(sim: Sim, dt: number) {
  const a = sim.opponent
  const serving = sim.phase === 'serve' && sim.server === 'opponent'
  if (serving) {
    const c = clampToServiceBox(a.x, a.z, sim.serveSide)
    a.x = c.x
    a.z = c.z
    return
  }
  if (!sim.aiEnabled) {
    const c = clampToCourt(a.x, a.z)
    a.x = c.x
    a.z = c.z
    return
  }
  const speed = 5.15 + (1 - sim.bot.error) * 0.7
  if (sim.phase === 'serve') {
    const c = clampToCourt(a.x, a.z)
    a.x = c.x
    a.z = c.z
    return
  }
  const theirShot = sim.phase === 'rally' && sim.lastHitter === 'player'
  if (theirShot && sim.ball.live) {
    sim.aiSpotAge += dt
    if (sim.aiSpotAge > 0.06) {
      sim.aiSpot = predictBounce(sim.ball)
      sim.aiSpotAge = 0
    }
    moveToward(a, sim.aiSpot.x - 0.42, Math.min(COURT.length - 0.6, sim.aiSpot.z + 0.2), speed, dt)
  } else {
    moveToward(a, sim.player.x * 0.15, COURT.shortLineZ + 0.35, speed * 0.8, dt)
  }
  const c = clampToCourt(a.x, a.z)
  a.x = c.x
  a.z = c.z
}

function substep(sim: Sim, input: SimInput, dt: number, edges: boolean) {
  if (sim.player.swing > 0) sim.player.swing = Math.max(0, sim.player.swing - dt)
  if (sim.opponent.swing > 0) sim.opponent.swing = Math.max(0, sim.opponent.swing - dt)
  if (sim.lastHit) sim.lastHit.age += dt

  if (sim.phase === 'serve') {
    holdBall(sim)
    movePlayer(sim, input, dt)
    moveOpponent(sim, dt)
    separate(sim.player, sim.opponent)
    if (sim.phase === 'serve' && sim.server === 'player') {
      const c = clampToServiceBox(sim.player.x, sim.player.z, sim.serveSide)
      sim.player.x = c.x
      sim.player.z = c.z
      holdBall(sim)
    }
    if (edges) tryPlayer(sim, input)
    if (sim.phase === 'serve' && input.chargeShot && sim.player.swing <= 0) {
      sim.player.charging = true
      sim.player.charge = Math.min(1, sim.player.charge + dt / 0.48)
      sim.player.swingType = input.chargeShot
    } else if (sim.phase === 'serve' && !input.chargeShot) {
      sim.player.charging = false
    }
    tryAi(sim, dt)
    return
  }

  if (sim.phase === 'rally') {
    const events: BallEvent[] = []
    integrate(sim.ball, dt, events)
    resolve(sim, events)
    if (sim.phase !== 'rally') return
    const speed = Math.hypot(sim.ball.vx, sim.ball.vy, sim.ball.vz)
    if (sim.ball.frontWall && sim.ball.bounces >= 1 && speed < 0.38 && sim.ball.y <= R + 0.03) {
      sim.stillTime += dt
      if (sim.stillTime > 0.42 && sim.lastHitter) {
        endPoint(sim, 'double', other(sim.lastHitter))
        return
      }
    } else sim.stillTime = 0

    movePlayer(sim, input, dt)
    moveOpponent(sim, dt)
    separate(sim.player, sim.opponent)
    const pc = clampToCourt(sim.player.x, sim.player.z)
    sim.player.x = pc.x
    sim.player.z = pc.z
    const oc = clampToCourt(sim.opponent.x, sim.opponent.z)
    sim.opponent.x = oc.x
    sim.opponent.z = oc.z

    if (edges && input.releaseShot) tryPlayer(sim, input)
    else if (input.chargeShot && sim.player.swing <= 0) {
      sim.player.charging = true
      sim.player.charge = Math.min(1, sim.player.charge + dt / 0.48)
      sim.player.swingType = input.chargeShot
    } else if (!input.chargeShot) {
      sim.player.charging = false
    }
    sim.sinceHit += dt
    tryAi(sim, dt)
    return
  }
}

export function stepSim(sim: Sim, input: SimInput, dt: number) {
  sim.sounds.length = 0
  if (sim.messageTtl > 0) {
    sim.messageTtl -= dt
    if (sim.messageTtl <= 0) sim.message = ''
  }
  sim.time += dt
  if (sim.matchState !== 'playing' || sim.paused) return
  if (sim.phase === 'pointOver') {
    sim.deadTimer -= dt
    if (sim.deadTimer <= 0 && sim.matchState === 'playing') beginPoint(sim)
    return
  }

  dt = Math.min(0.05, dt)
  sim.acc += dt
  let edges = true
  let n = 0
  while (sim.acc >= STEP && n++ < 6) {
    sim.acc -= STEP
    const frameInput: SimInput = {
      moveX: input.moveX,
      moveZ: input.moveZ,
      chargeShot: input.chargeShot,
      releaseShot: edges ? input.releaseShot : null,
      serve: edges ? input.serve : false,
    }
    if (frameInput.releaseShot || frameInput.serve) frameInput.chargeShot = null
    substep(sim, frameInput, STEP, edges)
    edges = false
    const phase = sim.phase as Phase
    if (phase === 'pointOver') {
      sim.acc = 0
      break
    }
  }
}

export function turnText(sim: Sim) {
  if (sim.matchState !== 'playing') return ''
  if (sim.phase === 'serve') return sim.server === 'player' ? 'Your serve' : 'Opponent serve'
  if (sim.phase === 'rally') return sim.lastHitter === 'player' ? 'Opponent' : 'Your shot'
  return ''
}

export function deuce(sim: Sim) {
  return sim.score.player >= 10 && sim.score.opponent >= 10 && sim.matchState === 'playing'
}

export { IDLE }
