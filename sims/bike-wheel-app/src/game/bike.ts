import Matter from 'matter-js'
import { circlePoly, polyRadius, type Pt } from './wheelShape'
import { heightAt } from './terrain'

export const WHEEL_R = 28

export type Bike = {
  chassis: Matter.Body
  front: Matter.Body
  rear: Matter.Body
  constrFront: Matter.Constraint
  constrRear: Matter.Constraint
  wheelVerts: Pt[]
}

function makeWheelBody(x: number, y: number, verts: Pt[], label: string): Matter.Body {
  // Offset verts to world position via Bodies.fromVertices
  const placed = verts.map((v) => ({ x: v.x + x, y: v.y + y }))
  let body: Matter.Body | undefined
  try {
    const parts = Matter.Bodies.fromVertices(x, y, [placed], {
      friction: 0.95,
      frictionStatic: 1.4,
      restitution: 0.15,
      density: 0.004,
      label,
      render: { fillStyle: '#e8eefc', strokeStyle: '#3ecf8e', lineWidth: 2 },
    }, true)
    if (parts) body = parts
  } catch {
    /* fall through */
  }
  if (!body) {
    body = Matter.Bodies.circle(x, y, polyRadius(verts) || WHEEL_R, {
      friction: 0.95,
      frictionStatic: 1.4,
      restitution: 0.15,
      density: 0.004,
      label,
      render: { fillStyle: '#e8eefc' },
    })
  }
  // Keep custom verts for drawing (local space)
  ;(body as Matter.Body & { customVerts?: Pt[] }).customVerts = verts.map((v) => ({ ...v }))
  return body
}

function axle(chassis: Matter.Body, wheel: Matter.Body, localX: number): Matter.Constraint {
  return Matter.Constraint.create({
    bodyA: chassis,
    bodyB: wheel,
    pointA: { x: localX, y: 22 },
    pointB: { x: 0, y: 0 },
    stiffness: 0.85,
    damping: 0.08,
    length: 0,
    render: { visible: false },
  })
}

export function createBike(world: Matter.World, startX = 80): Bike {
  const y = heightAt(startX) - 70
  const verts = circlePoly(WHEEL_R)

  const chassis = Matter.Bodies.rectangle(startX, y, 70, 18, {
    chamfer: { radius: 4 },
    density: 0.0025,
    friction: 0.4,
    label: 'chassis',
    render: { fillStyle: '#f0b429' },
  })

  // Simple seat / head tube visual helpers as compound would be overkill —
  // we draw frame in canvas from chassis transform.

  const rear = makeWheelBody(startX - 28, y + 26, verts, 'wheel-rear')
  const front = makeWheelBody(startX + 28, y + 26, verts, 'wheel-front')

  const constrRear = axle(chassis, rear, -28)
  const constrFront = axle(chassis, front, 28)

  Matter.World.add(world, [chassis, rear, front, constrRear, constrFront])

  return { chassis, front, rear, constrFront, constrRear, wheelVerts: verts }
}

/** Replace both wheels with a new polygon, preserving pose & velocity. */
export function swapWheels(world: Matter.World, bike: Bike, verts: Pt[]): void {
  const { front, rear, chassis, constrFront, constrRear } = bike

  const fPos = { ...front.position }
  const rPos = { ...rear.position }
  const fVel = { ...front.velocity }
  const rVel = { ...rear.velocity }
  const fAng = front.angle
  const rAng = rear.angle
  const fAv = front.angularVelocity
  const rAv = rear.angularVelocity

  Matter.World.remove(world, constrFront)
  Matter.World.remove(world, constrRear)
  Matter.World.remove(world, front)
  Matter.World.remove(world, rear)

  const newRear = makeWheelBody(rPos.x, rPos.y, verts, 'wheel-rear')
  const newFront = makeWheelBody(fPos.x, fPos.y, verts, 'wheel-front')

  Matter.Body.setAngle(newRear, rAng)
  Matter.Body.setAngle(newFront, fAng)
  Matter.Body.setVelocity(newRear, rVel)
  Matter.Body.setVelocity(newFront, fVel)
  Matter.Body.setAngularVelocity(newRear, rAv)
  Matter.Body.setAngularVelocity(newFront, fAv)

  const newConstrRear = axle(chassis, newRear, -28)
  const newConstrFront = axle(chassis, newFront, 28)

  Matter.World.add(world, [newRear, newFront, newConstrRear, newConstrFront])

  bike.rear = newRear
  bike.front = newFront
  bike.constrRear = newConstrRear
  bike.constrFront = newConstrFront
  bike.wheelVerts = verts.map((v) => ({ ...v }))
}

export function driveBike(bike: Bike, gas: number, brake: number): void {
  // gas/brake in [0,1]
  const rear = bike.rear
  const maxSpin = 0.55
  if (gas > 0) {
    const target = gas * maxSpin
    const next = rear.angularVelocity + (target - rear.angularVelocity) * 0.12
    Matter.Body.setAngularVelocity(rear, next)
    // Forward nudge along chassis facing
    const thrust = gas * 0.0028
    Matter.Body.applyForce(bike.chassis, bike.chassis.position, {
      x: Math.cos(bike.chassis.angle) * thrust,
      y: Math.sin(bike.chassis.angle) * thrust,
    })
  }
  if (brake > 0) {
    Matter.Body.setAngularVelocity(rear, rear.angularVelocity * (1 - 0.18 * brake))
    Matter.Body.setAngularVelocity(bike.front, bike.front.angularVelocity * (1 - 0.12 * brake))
    Matter.Body.setVelocity(bike.chassis, {
      x: bike.chassis.velocity.x * (1 - 0.06 * brake),
      y: bike.chassis.velocity.y,
    })
  }
}

export function resetBike(world: Matter.World, bike: Bike, startX = 80): void {
  const y = heightAt(startX) - 70
  Matter.Body.setPosition(bike.chassis, { x: startX, y })
  Matter.Body.setVelocity(bike.chassis, { x: 0, y: 0 })
  Matter.Body.setAngle(bike.chassis, 0)
  Matter.Body.setAngularVelocity(bike.chassis, 0)

  Matter.Body.setPosition(bike.rear, { x: startX - 28, y: y + 26 })
  Matter.Body.setPosition(bike.front, { x: startX + 28, y: y + 26 })
  for (const w of [bike.rear, bike.front]) {
    Matter.Body.setVelocity(w, { x: 0, y: 0 })
    Matter.Body.setAngle(w, 0)
    Matter.Body.setAngularVelocity(w, 0)
  }
  // Ensure constraints still in world (no-op if already)
  void world
}
