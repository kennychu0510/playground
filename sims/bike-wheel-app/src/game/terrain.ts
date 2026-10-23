import Matter from 'matter-js'

/** World units: 1 unit ≈ 1 px at default zoom. */
export const TERRAIN_LEN = 9000
export const GROUND_THICK = 80

/**
 * Smooth rolling hills only — no cliffs, spikes, or gaps.
 * Layered low-frequency sines keep max grade ≈ 0.16 (~9°) so odd drawn
 * wheels can still climb. Continuous ground for the full course.
 */
export function heightAt(x: number): number {
  const h1 = Math.sin(x / 1200) * 48 // max |dy/dx| ≈ 0.040
  const h2 = Math.sin(x / 780 + 0.9) * 36 // ≈ 0.046
  const h3 = Math.sin(x / 520 + 1.8) * 16 // ≈ 0.031
  const h4 = Math.sin(x / 2000 + 0.3) * 55 // ≈ 0.028
  const micro = Math.sin(x / 280 + 2.2) * 4 // ≈ 0.014
  return 420 + h1 + h2 + h3 + h4 + micro
}

export function buildTerrain(world: Matter.World): Matter.Body[] {
  const step = 24
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
