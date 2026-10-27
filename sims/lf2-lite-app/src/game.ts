import { aiInput } from './ai'
import { Fighter } from './fighter'
import type { InputState } from './input'
import type { Sheet } from './sprites'
import type { Projectile } from './types'

const W = 960
const H = 540
const GROUND = 460

function aabb(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export type GameResult = 'playing' | 'win' | 'lose'

export class Game {
  player: Fighter
  enemies: Fighter[] = []
  projectiles: Projectile[] = []
  result: GameResult = 'playing'
  time = 0
  sheets: Map<string, Sheet>
  playerSheetId: string

  constructor(sheets: Map<string, Sheet>, playerId: string) {
    this.sheets = sheets
    this.playerSheetId = playerId
    const pSheet = sheets.get(playerId)!
    this.player = new Fighter(pSheet, 180, GROUND, 'player')

    const enemyIds = [...sheets.keys()].filter((id) => id !== playerId)
    const picks = [enemyIds[0] ?? playerId, enemyIds[1] ?? playerId, enemyIds[0] ?? playerId]
    const xs = [620, 760, 880]
    picks.forEach((id, i) => {
      const f = new Fighter(sheets.get(id)!, xs[i], GROUND, 'enemy')
      // slightly weaker AI fodder
      f.maxHp = Math.round(f.maxHp * 0.75)
      f.hp = f.maxHp
      this.enemies.push(f)
    })
  }

  update(dt: number, input: InputState) {
    if (this.result !== 'playing') return
    this.time += dt

    this.player.update(dt, input, GROUND, this.projectiles)
    for (const e of this.enemies) {
      const ai = aiInput(e, this.player.alive ? this.player : null, this.time)
      e.update(dt, ai, GROUND, this.projectiles)
    }

    // clamp X
    const clamp = (f: Fighter) => {
      f.x = Math.max(40, Math.min(W - 40, f.x))
    }
    clamp(this.player)
    this.enemies.forEach(clamp)

    this.resolveCombat()
    this.updateProjectiles(dt)

    if (!this.player.alive) this.result = 'lose'
    else if (this.enemies.every((e) => !e.alive)) this.result = 'win'
  }

  resolveCombat() {
    const fighters = [this.player, ...this.enemies]
    for (const atk of fighters) {
      if (!atk.alive) continue
      const box = atk.attackBox
      if (!box || atk.attackHit) continue
      for (const def of fighters) {
        if (def.id === atk.id || !def.alive || def.team === atk.team) continue
        if (aabb(box, def.hitbox)) {
          const dmg =
            atk.state === 'special' ? atk.sheet.def.specialDmg : atk.sheet.def.attack
          if (def.takeHit(dmg, atk.x)) atk.attackHit = true
        }
      }
    }
  }

  updateProjectiles(dt: number) {
    const next: Projectile[] = []
    for (const p of this.projectiles) {
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.life <= 0 || p.x < -20 || p.x > W + 20) continue

      let hit = false
      const targets = [this.player, ...this.enemies]
      for (const t of targets) {
        if (!t.alive || t.id === p.ownerId) continue
        const owner = targets.find((f) => f.id === p.ownerId)
        if (owner && owner.team === t.team) continue
        const hb = t.hitbox
        if (p.x > hb.x && p.x < hb.x + hb.w && p.y > hb.y && p.y < hb.y + hb.h) {
          t.takeHit(p.dmg, p.x - p.vx)
          hit = true
          break
        }
      }
      if (!hit) next.push(p)
    }
    this.projectiles = next
  }

  draw(ctx: CanvasRenderingContext2D) {
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#1a2a48')
    g.addColorStop(0.55, '#243656')
    g.addColorStop(1, '#1a3040')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)

    // far hills
    ctx.fillStyle = '#1b3a3a'
    ctx.beginPath()
    ctx.moveTo(0, 340)
    ctx.quadraticCurveTo(200, 280, 400, 330)
    ctx.quadraticCurveTo(600, 380, 960, 300)
    ctx.lineTo(960, GROUND)
    ctx.lineTo(0, GROUND)
    ctx.fill()

    // ground
    ctx.fillStyle = '#2d4a3e'
    ctx.fillRect(0, GROUND, W, H - GROUND)
    ctx.fillStyle = '#3ecf8e33'
    ctx.fillRect(0, GROUND, W, 4)
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = i % 2 ? '#355848' : '#2f5040'
      ctx.fillRect(i * 50, GROUND + 8, 48, 10)
    }

    // stage props
    ctx.fillStyle = '#4a5568'
    ctx.fillRect(80, GROUND - 70, 18, 70)
    ctx.fillRect(860, GROUND - 90, 22, 90)
    ctx.fillStyle = '#f0b429'
    ctx.beginPath()
    ctx.arc(120, 120, 28, 0, Math.PI * 2)
    ctx.fill()

    // sort draw by y
    const list = [this.player, ...this.enemies].sort((a, b) => a.y - b.y)
    for (const f of list) f.draw(ctx)

    for (const p of this.projectiles) {
      ctx.beginPath()
      ctx.fillStyle = p.color
      ctx.shadowColor = p.color
      ctx.shadowBlur = 12
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }
  }

  enemyHpSummary() {
    const alive = this.enemies.filter((e) => e.alive)
    const hp = this.enemies.reduce((s, e) => s + e.hp, 0)
    const max = this.enemies.reduce((s, e) => s + e.maxHp, 0)
    return { alive: alive.length, total: this.enemies.length, hp, max }
  }
}

export { W, H, GROUND }
