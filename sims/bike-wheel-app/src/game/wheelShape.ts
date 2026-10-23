export type Pt = { x: number; y: number }

const TAU = Math.PI * 2

/** Resample a freehand stroke into a closed, centered wheel polygon. */
export function strokeToWheelPolygon(
  stroke: Pt[],
  targetRadius: number,
  samples = 36,
): Pt[] {
  if (stroke.length < 3) {
    return circlePoly(targetRadius, samples)
  }

  // Close path
  const pts = [...stroke]
  const first = pts[0]!
  const last = pts[pts.length - 1]!
  if (Math.hypot(first.x - last.x, first.y - last.y) > 2) {
    pts.push({ ...first })
  }

  // Centroid (of polyline points)
  let cx = 0
  let cy = 0
  for (const p of pts) {
    cx += p.x
    cy += p.y
  }
  cx /= pts.length
  cy /= pts.length

  // Radial max distance per angle bucket → silhouette outline
  const bins = new Array<number>(samples).fill(0)
  for (const p of pts) {
    const dx = p.x - cx
    const dy = p.y - cy
    const r = Math.hypot(dx, dy)
    if (r < 1e-6) continue
    let ang = Math.atan2(dy, dx)
    if (ang < 0) ang += TAU
    const i = Math.min(samples - 1, Math.floor((ang / TAU) * samples))
    if (r > bins[i]!) bins[i] = r
  }

  // Fill empty bins by interpolating neighbors
  for (let i = 0; i < samples; i++) {
    if (bins[i]! > 0) continue
    let prev = 0
    let next = 0
    for (let d = 1; d < samples; d++) {
      if (bins[(i - d + samples) % samples]! > 0) {
        prev = bins[(i - d + samples) % samples]!
        break
      }
    }
    for (let d = 1; d < samples; d++) {
      if (bins[(i + d) % samples]! > 0) {
        next = bins[(i + d) % samples]!
        break
      }
    }
    bins[i] = (prev + next) / 2 || targetRadius
  }

  // Smooth lightly
  const smooth = bins.map((_, i) => {
    const a = bins[(i - 1 + samples) % samples]!
    const b = bins[i]!
    const c = bins[(i + 1) % samples]!
    return (a + b * 2 + c) / 4
  })

  const avg = smooth.reduce((s, v) => s + v, 0) / samples
  const scale = avg > 1e-6 ? targetRadius / avg : 1

  const out: Pt[] = []
  for (let i = 0; i < samples; i++) {
    const ang = (i / samples) * TAU
    const r = smooth[i]! * scale
    out.push({ x: Math.cos(ang) * r, y: Math.sin(ang) * r })
  }
  return out
}

export function circlePoly(radius: number, samples = 28): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < samples; i++) {
    const ang = (i / samples) * TAU
    out.push({ x: Math.cos(ang) * radius, y: Math.sin(ang) * radius })
  }
  return out
}

/** Approximate radius for camera / UI (rms of verts). */
export function polyRadius(verts: Pt[]): number {
  if (!verts.length) return 1
  const m = verts.reduce((s, p) => s + p.x * p.x + p.y * p.y, 0) / verts.length
  return Math.sqrt(m)
}
