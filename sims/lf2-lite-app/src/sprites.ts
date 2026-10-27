import type { CharDef, FrameName, RosterMeta } from './types'

export interface Sheet {
  def: CharDef
  image: HTMLImageElement
  frameW: number
  frameH: number
  frames: FrameName[]
}

export async function loadRoster(base = import.meta.env.BASE_URL): Promise<{ meta: RosterMeta; sheets: Map<string, Sheet> }> {
  const url = `${base}assets/characters/roster.json`
  const meta = (await fetch(url).then((r) => r.json())) as RosterMeta
  const sheets = new Map<string, Sheet>()
  await Promise.all(
    meta.characters.map(async (def) => {
      const img = new Image()
      img.src = `${base}assets/characters/${def.sheet}`
      await img.decode()
      sheets.set(def.id, {
        def,
        image: img,
        frameW: meta.frameWidth,
        frameH: meta.frameHeight,
        frames: meta.frames,
      })
    }),
  )
  return { meta, sheets }
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  sheet: Sheet,
  frame: FrameName,
  x: number,
  y: number,
  facing: 1 | -1,
  scale = 2,
) {
  const idx = sheet.frames.indexOf(frame)
  if (idx < 0) return
  const fw = sheet.frameW
  const fh = sheet.frameH
  const dw = fw * scale
  const dh = fh * scale
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(facing, 1)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(sheet.image, idx * fw, 0, fw, fh, -dw / 2, -dh, dw, dh)
  ctx.restore()
}

export function previewIdle(canvas: HTMLCanvasElement, sheet: Sheet) {
  const ctx = canvas.getContext('2d')!
  canvas.width = sheet.frameW
  canvas.height = sheet.frameH
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(sheet.image, 0, 0, sheet.frameW, sheet.frameH, 0, 0, sheet.frameW, sheet.frameH)
}
