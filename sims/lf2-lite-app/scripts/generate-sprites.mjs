/**
 * Generates original pixel-art character sheets (not LF2 assets).
 * Soft silhouette fighters inspired by classic beat-em-up roles.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '../public/assets/characters')

const FRAME_W = 48
const FRAME_H = 64
const FRAMES = ['idle0', 'idle1', 'walk0', 'walk1', 'jump', 'attack0', 'attack1', 'special0', 'special1', 'hurt', 'ko']

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const t = Buffer.from(type)
  const crcBuf = Buffer.concat([t, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcBuf))
  return Buffer.concat([len, t, data, crc])
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function setPx(rgba, w, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= w || y >= FRAME_H) return
  const i = (y * w + x) * 4
  rgba[i] = r
  rgba[i + 1] = g
  rgba[i + 2] = b
  rgba[i + 3] = a
}

function fillRect(rgba, w, x, y, rw, rh, r, g, b, a = 255) {
  for (let yy = y; yy < y + rh; yy++)
    for (let xx = x; xx < x + rw; xx++) setPx(rgba, w, xx, yy, r, g, b, a)
}

function fillEllipse(rgba, w, cx, cy, rx, ry, r, g, b, a = 255) {
  for (let yy = -ry; yy <= ry; yy++)
    for (let xx = -rx; xx <= rx; xx++)
      if ((xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) <= 1) setPx(rgba, w, cx + xx, cy + yy, r, g, b, a)
}

/** Draw a simple chibi fighter into one frame slot */
function drawFighter(rgba, sheetW, ox, frame, palette, style) {
  const { skin, shirt, pants, accent, hair, outline } = palette
  const bob = frame === 'idle1' || frame === 'walk1' ? 1 : 0
  const walkLeg = frame.startsWith('walk') ? (frame === 'walk0' ? -3 : 3) : 0
  const jumping = frame === 'jump'
  const attacking = frame.startsWith('attack')
  const special = frame.startsWith('special')
  const hurt = frame === 'hurt'
  const ko = frame === 'ko'

  const baseY = ko ? 10 : jumping ? -6 : 0
  const lean = hurt ? -4 : attacking ? 4 : special ? 2 : 0

  // shadow
  if (!ko) fillEllipse(rgba, sheetW, ox + 24, 58 + bob, 12, 3, 0, 0, 0, 60)

  const hy = 14 + bob + baseY
  const hx = ox + 24 + lean

  if (ko) {
    // lying down
    fillEllipse(rgba, sheetW, ox + 28, 48, 14, 8, skin[0], skin[1], skin[2])
    fillRect(rgba, sheetW, ox + 10, 44, 20, 10, shirt[0], shirt[1], shirt[2])
    fillRect(rgba, sheetW, ox + 4, 46, 10, 8, pants[0], pants[1], pants[2])
    return
  }

  // legs
  const ly = 42 + bob + baseY
  fillRect(rgba, sheetW, hx - 8 + walkLeg, ly, 6, 14, pants[0], pants[1], pants[2])
  fillRect(rgba, sheetW, hx + 2 - walkLeg, ly, 6, 14, pants[0], pants[1], pants[2])
  fillRect(rgba, sheetW, hx - 8 + walkLeg, ly + 12, 6, 3, outline[0], outline[1], outline[2])
  fillRect(rgba, sheetW, hx + 2 - walkLeg, ly + 12, 6, 3, outline[0], outline[1], outline[2])

  // torso
  const ty = 26 + bob + baseY
  fillRect(rgba, sheetW, hx - 9, ty, 18, 16, shirt[0], shirt[1], shirt[2])
  fillRect(rgba, sheetW, hx - 9, ty + 14, 18, 3, accent[0], accent[1], accent[2])

  // arms
  const ay = 28 + bob + baseY
  if (attacking || special) {
    const reach = attacking ? (frame === 'attack1' ? 18 : 10) : frame === 'special1' ? 20 : 12
    fillRect(rgba, sheetW, hx + 8, ay + 2, reach, 5, skin[0], skin[1], skin[2])
    fillRect(rgba, sheetW, hx - 12, ay + 4, 6, 10, skin[0], skin[1], skin[2])
    if (style === 'sword') {
      fillRect(rgba, sheetW, hx + 8 + reach - 2, ay - 8, 3, 18, 200, 210, 230)
      fillRect(rgba, sheetW, hx + 8 + reach - 4, ay + 2, 7, 3, accent[0], accent[1], accent[2])
    } else if (style === 'mage' && special) {
      fillEllipse(rgba, sheetW, hx + 8 + reach + 2, ay + 4, 6, 6, accent[0], accent[1], accent[2], 200)
    } else if (style === 'melee' && special) {
      fillEllipse(rgba, sheetW, hx + 8 + reach, ay + 4, 5, 5, 120, 200, 255, 180)
    }
  } else if (jumping) {
    fillRect(rgba, sheetW, hx - 14, ay, 6, 8, skin[0], skin[1], skin[2])
    fillRect(rgba, sheetW, hx + 8, ay, 6, 8, skin[0], skin[1], skin[2])
  } else {
    fillRect(rgba, sheetW, hx - 12, ay, 5, 12, skin[0], skin[1], skin[2])
    fillRect(rgba, sheetW, hx + 7, ay, 5, 12, skin[0], skin[1], skin[2])
  }

  // head
  fillEllipse(rgba, sheetW, hx, hy, 9, 9, skin[0], skin[1], skin[2])
  // hair
  fillEllipse(rgba, sheetW, hx, hy - 5, 9, 5, hair[0], hair[1], hair[2])
  if (style === 'mage') fillRect(rgba, sheetW, hx - 3, hy - 14, 6, 6, accent[0], accent[1], accent[2])
  // eyes
  setPx(rgba, sheetW, hx - 3, hy, 20, 20, 30)
  setPx(rgba, sheetW, hx + 3, hy, 20, 20, 30)
  if (hurt) {
    setPx(rgba, sheetW, hx - 3, hy, 180, 40, 40)
    setPx(rgba, sheetW, hx + 3, hy, 180, 40, 40)
  }

  // weapon idle for sword
  if (style === 'sword' && !attacking && !special) {
    fillRect(rgba, sheetW, hx + 10, ay - 2, 3, 16, 200, 210, 230)
  }
}

function makeSheet(palette, style) {
  const cols = FRAMES.length
  const w = FRAME_W * cols
  const h = FRAME_H
  const rgba = Buffer.alloc(w * h * 4)
  FRAMES.forEach((name, i) => drawFighter(rgba, w, i * FRAME_W, name, palette, style))
  return encodePng(w, h, rgba)
}

const characters = [
  {
    id: 'blaze',
    name: 'Blaze',
    role: 'Melee fighter (Davis-inspired)',
    style: 'melee',
    palette: {
      skin: [245, 200, 170],
      shirt: [50, 110, 220],
      pants: [35, 50, 90],
      accent: [255, 200, 60],
      hair: [40, 30, 25],
      outline: [20, 20, 30],
    },
    stats: { hp: 120, mp: 80, speed: 2.4, attack: 12, specialCost: 22, specialDmg: 28 },
  },
  {
    id: 'edge',
    name: 'Edge',
    role: 'Swordsman (Deep-inspired)',
    style: 'sword',
    palette: {
      skin: [235, 190, 160],
      shirt: [70, 70, 85],
      pants: [40, 40, 50],
      accent: [180, 50, 50],
      hair: [30, 30, 40],
      outline: [20, 20, 30],
    },
    stats: { hp: 110, mp: 70, speed: 2.2, attack: 14, specialCost: 20, specialDmg: 32 },
  },
  {
    id: 'prism',
    name: 'Prism',
    role: 'Energy mage (John-inspired)',
    style: 'mage',
    palette: {
      skin: [250, 210, 185],
      shirt: [240, 240, 250],
      pants: [90, 100, 140],
      accent: [100, 180, 255],
      hair: [80, 60, 50],
      outline: [20, 20, 30],
    },
    stats: { hp: 95, mp: 110, speed: 2.0, attack: 10, specialCost: 18, specialDmg: 26 },
  },
]

fs.mkdirSync(OUT, { recursive: true })

const meta = {
  frameWidth: FRAME_W,
  frameHeight: FRAME_H,
  frames: FRAMES,
  note: 'Original pixel art for LF2 Lite fan demo. Not Little Fighter 2 assets.',
  characters: [],
}

for (const c of characters) {
  const png = makeSheet(c.palette, c.style)
  const file = `${c.id}.png`
  fs.writeFileSync(path.join(OUT, file), png)
  meta.characters.push({
    id: c.id,
    name: c.name,
    role: c.role,
    sheet: file,
    style: c.style,
    ...c.stats,
  })
  console.log('wrote', file, png.length, 'bytes')
}

fs.writeFileSync(path.join(OUT, 'roster.json'), JSON.stringify(meta, null, 2))
console.log('roster.json ready —', characters.length, 'fighters')
