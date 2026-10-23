import { strokeToWheelPolygon, type Pt } from './wheelShape'

export type DrawPad = {
  canvas: HTMLCanvasElement
  getStroke: () => Pt[]
  clear: () => void
  hasStroke: () => boolean
  toWheel: (radius: number) => Pt[] | null
}

export function createDrawPad(canvas: HTMLCanvasElement): DrawPad {
  const ctx = canvas.getContext('2d')!
  let stroke: Pt[] = []
  let drawing = false

  const cssToLocal = (clientX: number, clientY: number): Pt => {
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width / rect.width
    const sy = canvas.height / rect.height
    return {
      x: (clientX - rect.left) * sx,
      y: (clientY - rect.top) * sy,
    }
  }

  const redraw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // Guide circle
    ctx.save()
    ctx.strokeStyle = 'rgba(139, 155, 184, 0.35)'
    ctx.setLineDash([6, 6])
    ctx.beginPath()
    ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width * 0.36, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(139, 155, 184, 0.2)'
    ctx.beginPath()
    ctx.arc(canvas.width / 2, canvas.height / 2, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    if (stroke.length < 2) return
    ctx.strokeStyle = '#3ecf8e'
    ctx.lineWidth = 4
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(stroke[0]!.x, stroke[0]!.y)
    for (let i = 1; i < stroke.length; i++) {
      ctx.lineTo(stroke[i]!.x, stroke[i]!.y)
    }
    ctx.stroke()
  }

  const onDown = (e: PointerEvent) => {
    e.preventDefault()
    canvas.setPointerCapture(e.pointerId)
    drawing = true
    stroke = [cssToLocal(e.clientX, e.clientY)]
    redraw()
  }
  const onMove = (e: PointerEvent) => {
    if (!drawing) return
    e.preventDefault()
    const p = cssToLocal(e.clientX, e.clientY)
    const last = stroke[stroke.length - 1]
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 2) {
      stroke.push(p)
      redraw()
    }
  }
  const onUp = (e: PointerEvent) => {
    if (!drawing) return
    drawing = false
    try {
      canvas.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    redraw()
  }

  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)

  redraw()

  return {
    canvas,
    getStroke: () => stroke.slice(),
    clear: () => {
      stroke = []
      redraw()
    },
    hasStroke: () => stroke.length >= 8,
    toWheel: (radius: number) => {
      if (stroke.length < 8) return null
      return strokeToWheelPolygon(stroke, radius)
    },
  }
}
