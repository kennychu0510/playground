import Matter from 'matter-js'

/** World units: 1 unit ≈ 1 px at default zoom. */
export const TERRAIN_LEN = 9000
export const GROUND_THICK = 80

export function heightAt(x: number): number {
  const t = x / 180
  // Mix of hills, dips, flats, and high-frequency bumps
  const hills = Math.sin(t * 0.55) * 90 + Math.sin(t * 0.21 + 1.2) * 55
  const dips = Math.sin(t * 1.1 + 0.4) * 28
  const bumps = Math.sin(t * 4.2) * 8 + Math.sin(t * 7.5 + 2) * 4
  // Flat-ish stretches every ~1200u
  const stretch = Math.sin(x / 600) * 0.5 + 0.5
  const flatMask = stretch > 0.72 ? 0.25 : 1
  return 420 + (hills + dips) * flatMask + bumps
}

export function buildTerrain(world: Matter.World): Matter.Body[] {
  const step = 28
  const bodies: Matter.Body[] = []
  const vertsTop: { x: number; y: number }[] = []

  for (let x = -200; x <= TERRAIN_LEN + 400; x += step) {
    vertsTop.push({ x, y: heightAt(x) })
  }

  // Segmented static boxes along surface (robust for Matter)
  for (let i = 0; i < vertsTop.length - 1; i++) {
    const a = vertsTop[i]!
    const b = vertsTop[i + 1]!
    const midX = (a.x + b.x) / 2
    const midY = (a.y + b.y) / 2
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)
    const seg = Matter.Bodies.rectangle(midX, midY + GROUND_THICK / 2, len + 2, GROUND_THICK, {
      isStatic: true,
      angle,
      friction: 0.95,
      frictionStatic: 1.2,
      restitution: 0.05,
      label: 'ground',
      render: { fillStyle: '#2d6a4f' },
    })
    bodies.push(seg)
  }

  // Start platform ledge cue
  const ramp = Matter.Bodies.rectangle(40, heightAt(40) + 10, 160, 20, {
    isStatic: true,
    friction: 1,
    label: 'ramp',
    render: { fillStyle: '#40916c' },
  })
  bodies.push(ramp)

  Matter.World.add(world, bodies)
  return bodies
}

/** Sampled polyline for drawing the ground surface. */
export function terrainPolyline(fromX: number, toX: number, step = 16): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  for (let x = fromX; x <= toX; x += step) {
    pts.push({ x, y: heightAt(x) })
  }
  return pts
}
