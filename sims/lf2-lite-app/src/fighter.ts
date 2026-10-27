import type { InputState } from './input'
import type { Sheet } from './sprites'
import { drawFrame } from './sprites'
import type { ActionState, Facing, FrameName, Projectile } from './types'

let nextId = 1

export class Fighter {
  id = nextId++
  x: number
  y: number
  vx = 0
  vy = 0
  facing: Facing = 1
  onGround = true
  hp: number
  mp: number
  maxHp: number
  maxMp: number
  state: ActionState = 'idle'
  frameTimer = 0
  animFrame: FrameName = 'idle0'
  attackHit = false
  invuln = 0
  team: 'player' | 'enemy'
  sheet: Sheet
  alive = true

  constructor(
    sheet: Sheet,
    x: number,
    y: number,
    team: 'player' | 'enemy',
  ) {
    this.sheet = sheet
    this.x = x
    this.y = y
    this.team = team
    this.maxHp = sheet.def.hp
    this.maxMp = sheet.def.mp
    this.hp = this.maxHp
    this.mp = this.maxMp * 0.6
  }

  get hitbox() {
    return { x: this.x - 18, y: this.y - 56, w: 36, h: 56 }
  }

  get attackBox(): { x: number; y: number; w: number; h: number } | null {
    if (this.state !== 'attack' && this.state !== 'special') return null
    if (this.state === 'attack' && this.frameTimer < 0.08) return null
    if (this.state === 'special' && this.sheet.def.style === 'mage') return null
    const reach = this.state === 'special' ? 52 : 38
    const w = this.state === 'special' ? 36 : 28
    const x = this.facing === 1 ? this.x + 8 : this.x - 8 - w
    return { x, y: this.y - 48, w: Math.min(reach, w + 10), h: 36 }
  }

  update(dt: number, input: InputState | null, groundY: number, projectiles: Projectile[]) {
    if (!this.alive) return

    if (this.invuln > 0) this.invuln -= dt
    this.mp = Math.min(this.maxMp, this.mp + 8 * dt)

    if (this.state === 'ko') {
      this.animFrame = 'ko'
      this.vy += 1400 * dt
      this.y += this.vy * dt
      if (this.y >= groundY) {
        this.y = groundY
        this.vy = 0
      }
      return
    }

    if (this.state === 'hurt') {
      this.frameTimer -= dt
      this.animFrame = 'hurt'
      this.vx *= 0.9
      this.x += this.vx * dt
      this.vy += 1400 * dt
      this.y += this.vy * dt
      if (this.y >= groundY) {
        this.y = groundY
        this.vy = 0
        this.onGround = true
      }
      if (this.frameTimer <= 0) this.state = 'idle'
      return
    }

    if (this.state === 'attack' || this.state === 'special') {
      this.frameTimer -= dt
      const special = this.state === 'special'
      this.animFrame = special
        ? this.frameTimer > 0.18
          ? 'special0'
          : 'special1'
        : this.frameTimer > 0.12
          ? 'attack0'
          : 'attack1'

      if (special && this.sheet.def.style === 'mage' && !this.attackHit && this.frameTimer < 0.22) {
        this.attackHit = true
        projectiles.push({
          x: this.x + this.facing * 28,
          y: this.y - 36,
          vx: this.facing * 320,
          vy: 0,
          life: 1.4,
          dmg: this.sheet.def.specialDmg,
          ownerId: this.id,
          color: '#64b4ff',
          r: 10,
        })
      }

      this.x += this.vx * dt
      this.vx *= 0.85
      this.vy += 1400 * dt
      this.y += this.vy * dt
      if (this.y >= groundY) {
        this.y = groundY
        this.vy = 0
        this.onGround = true
      }
      if (this.frameTimer <= 0) {
        this.state = 'idle'
        this.vx = 0
      }
      return
    }

    // free movement
    let moving = false
    if (input) {
      if (input.left) {
        this.vx = -this.sheet.def.speed * 60
        this.facing = -1
        moving = true
      } else if (input.right) {
        this.vx = this.sheet.def.speed * 60
        this.facing = 1
        moving = true
      } else {
        this.vx = 0
      }

      if (input.jumpPressed && this.onGround) {
        this.vy = -420
        this.onGround = false
        this.state = 'jump'
      }

      if (input.attackPressed && this.onGround) {
        this.state = 'attack'
        this.frameTimer = 0.28
        this.attackHit = false
        this.vx = this.facing * 40
        return
      }

      if (input.specialPressed && this.onGround && this.mp >= this.sheet.def.specialCost) {
        this.mp -= this.sheet.def.specialCost
        this.state = 'special'
        this.frameTimer = 0.42
        this.attackHit = false
        this.vx = this.facing * (this.sheet.def.style === 'melee' ? 160 : 60)
        if (this.sheet.def.style === 'melee') {
          // energy fist burst as short projectile too
          projectiles.push({
            x: this.x + this.facing * 30,
            y: this.y - 34,
            vx: this.facing * 280,
            vy: -40,
            life: 0.45,
            dmg: this.sheet.def.specialDmg * 0.5,
            ownerId: this.id,
            color: '#7ad7ff',
            r: 8,
          })
        }
        return
      }
    }

    this.vy += 1400 * dt
    this.x += this.vx * dt
    this.y += this.vy * dt
    if (this.y >= groundY) {
      this.y = groundY
      this.vy = 0
      this.onGround = true
      if (this.state === 'jump') this.state = moving ? 'walk' : 'idle'
    } else {
      this.onGround = false
      this.state = 'jump'
    }

    if (this.onGround) {
      this.state = moving ? 'walk' : 'idle'
    }

    this.frameTimer += dt
    if (this.state === 'jump') this.animFrame = 'jump'
    else if (this.state === 'walk') this.animFrame = Math.floor(this.frameTimer * 8) % 2 === 0 ? 'walk0' : 'walk1'
    else this.animFrame = Math.floor(this.frameTimer * 3) % 2 === 0 ? 'idle0' : 'idle1'
  }

  takeHit(dmg: number, fromX: number) {
    if (!this.alive || this.invuln > 0 || this.state === 'ko') return false
    this.hp = Math.max(0, this.hp - dmg)
    this.invuln = 0.35
    this.facing = fromX < this.x ? -1 : 1
    this.vx = this.facing * -180
    this.vy = -120
    this.onGround = false
    if (this.hp <= 0) {
      this.alive = false
      this.state = 'ko'
      this.animFrame = 'ko'
      this.hp = 0
    } else {
      this.state = 'hurt'
      this.frameTimer = 0.28
    }
    return true
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0 && this.alive) {
      ctx.globalAlpha = 0.45
    }
    drawFrame(ctx, this.sheet, this.animFrame, this.x, this.y, this.facing, 2)
    ctx.globalAlpha = 1

    // small HP pip above enemies
    if (this.team === 'enemy' && this.alive) {
      const w = 36
      const pct = this.hp / this.maxHp
      ctx.fillStyle = '#1a2438'
      ctx.fillRect(this.x - w / 2, this.y - 72, w, 5)
      ctx.fillStyle = '#e4572e'
      ctx.fillRect(this.x - w / 2, this.y - 72, w * pct, 5)
    }
  }
}
