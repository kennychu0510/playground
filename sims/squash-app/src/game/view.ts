import * as THREE from 'three'
import { COURT } from './court'
import type { Sim } from './sim'
import type { Actor } from './sim'

export type CourtTheme = 'classic' | 'glass'
export type CameraMode = 'classic' | 'follow'
export type Quality = 'high' | 'low'

type Athlete = {
  group: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  arm: THREE.Group
  racquet: THREE.Group
  shirt: THREE.MeshStandardMaterial
  lastX: number
  lastZ: number
}

export type View = {
  setTheme: (theme: CourtTheme) => void
  setQuality: (quality: Quality) => void
  resize: () => void
  render: (sim: Sim, cameraMode: CameraMode, dt: number, menu: boolean) => void
}

export function createView(canvas: HTMLCanvasElement): View {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08
  renderer.shadowMap.enabled = true
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(66, 1, 0.08, 60)
  const look = new THREE.Vector3(0, 1.2, 4)
  const camDesired = new THREE.Vector3()
  const lookDesired = new THREE.Vector3()

  const hemi = new THREE.HemisphereLight(0xd7ecff, 0x3a2a1c, 0.85)
  scene.add(hemi)
  const key = new THREE.DirectionalLight(0xfff6e8, 1.35)
  key.position.set(3.5, 9.5, 8)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.near = 0.5
  key.shadow.camera.far = 28
  key.shadow.camera.left = -8
  key.shadow.camera.right = 8
  key.shadow.camera.top = 8
  key.shadow.camera.bottom = -8
  key.shadow.bias = -0.0004
  scene.add(key)
  key.target.position.set(0, 0, 4.5)
  scene.add(key.target)

  const fill = new THREE.DirectionalLight(0xbfd6ff, 0.35)
  fill.position.set(-4, 4, -2)
  scene.add(fill)

  let courtGroup = new THREE.Group()
  scene.add(courtGroup)
  let theme: CourtTheme = 'classic'
  let quality: Quality = 'high'
  let menuAng = 0.4

  const player = makeAthlete(0xc7f25b)
  const opponent = makeAthlete(0x3aa0ff)
  scene.add(player.group, opponent.group)

  const ballMat = new THREE.MeshStandardMaterial({
    color: 0xd6e23a,
    roughness: 0.35,
    emissive: 0x8a9a14,
    emissiveIntensity: 0.35,
  })
  const ball = new THREE.Mesh(new THREE.SphereGeometry(COURT.ballRadius, 24, 18), ballMat)
  ball.scale.setScalar(2.4)
  ball.castShadow = true
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(COURT.ballRadius * 0.28, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }),
  )
  dot.position.z = COURT.ballRadius * 0.86
  ball.add(dot)
  scene.add(ball)

  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.09, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  )
  blob.rotation.x = -Math.PI / 2
  blob.position.y = 0.025
  scene.add(blob)

  const trailGeom = new THREE.BufferGeometry()
  const trail = new THREE.Line(trailGeom, new THREE.LineBasicMaterial({ color: 0xf8b95e, transparent: true, opacity: 0.7 }))
  scene.add(trail)
  const trailPts: THREE.Vector3[] = []

  const rightBox = boxHighlight(1)
  const leftBox = boxHighlight(-1)
  scene.add(rightBox, leftBox)

  function rebuildCourt() {
    scene.remove(courtGroup)
    courtGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = mesh.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else if (mat) mat.dispose()
    })
    courtGroup = buildCourt(theme)
    scene.add(courtGroup)
    const night = theme === 'glass'
    scene.background = new THREE.Color(night ? 0x07131c : 0xc5d7e4)
    scene.fog = new THREE.Fog(night ? 0x07131c : 0xd5e4ef, 18, 40)
    hemi.color.set(night ? 0x8fb4d8 : 0xe7f3ff)
    hemi.groundColor.set(night ? 0x102028 : 0x6a4a32)
    hemi.intensity = night ? 0.55 : 0.9
    key.intensity = night ? 0.85 : 1.35
    key.color.set(night ? 0xd0e4ff : 0xfff6e8)
  }

  rebuildCourt()
  resize()

  function resize() {
    const w = canvas.clientWidth || innerWidth
    const h = canvas.clientHeight || innerHeight
    camera.aspect = w / Math.max(1, h)
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
  }

  function render(sim: Sim, cameraMode: CameraMode, dt: number, menu: boolean) {
    const k = 1 - Math.exp(-4.2 * dt)
    if (menu) {
      menuAng += dt * 0.12
      camDesired.set(Math.sin(menuAng) * 1.2, 6.3, COURT.length + 4.8)
      lookDesired.set(0, 0.6, 3.3)
    } else if (cameraMode === 'classic') {
      camDesired.set(sim.player.x * 0.1, 6.5, COURT.length + 5.2)
      lookDesired.set(0, 0.75, 2.6)
    } else {
      const cz = sim.player.z + 3.15
      if (cz > COURT.length - 0.2) {
        camDesired.set(sim.player.x * 0.16, 5.85, COURT.length + 4.3)
        lookDesired.set(sim.player.x * 0.08, 0.8, 2.8)
      } else {
        camDesired.set(sim.player.x + 0.8, 2.85, cz)
        lookDesired.set(sim.player.x * 0.4, 1.0, Math.max(0.4, sim.player.z - 3.2))
      }
    }
    camera.position.lerp(camDesired, k)
    look.lerp(lookDesired, k)
    camera.lookAt(look)

    pose(player, sim.player, sim.time, dt)
    pose(opponent, sim.opponent, sim.time, dt)
    opponent.shirt.color.setHex(sim.bot.color)

    ball.position.set(sim.ball.x, sim.ball.y, sim.ball.z)
    ball.rotation.x += sim.ball.vz * dt * 1.4
    ball.rotation.z -= sim.ball.vx * dt * 1.4
    const lift = Math.min(1, sim.ball.y / 2.2)
    blob.position.x = sim.ball.x
    blob.position.z = sim.ball.z
    blob.scale.setScalar(1 + lift * 0.8)
    ;(blob.material as THREE.MeshBasicMaterial).opacity = 0.32 - lift * 0.18

    const showTrail = quality === 'high' && sim.ball.live && sim.phase === 'rally'
    if (showTrail) {
      const last = trailPts[trailPts.length - 1]
      if (!last || last.distanceToSquared(ball.position) > 0.02) {
        trailPts.push(ball.position.clone())
        if (trailPts.length > 18) trailPts.shift()
      }
    } else trailPts.length = 0
    if (trailPts.length > 1) {
      trailGeom.setFromPoints(trailPts)
      trail.visible = true
    } else trail.visible = false

    const showBox = menu || sim.phase === 'serve'
    rightBox.visible = showBox && sim.serveSide === 'right'
    leftBox.visible = showBox && sim.serveSide === 'left'

    renderer.render(scene, camera)
  }

  return {
    resize,
    setTheme(next) {
      if (theme === next) return
      theme = next
      rebuildCourt()
    },
    setQuality(next) {
      quality = next
      const shadows = next === 'high'
      renderer.shadowMap.enabled = shadows
      key.castShadow = shadows
      renderer.setPixelRatio(shadows ? Math.min(devicePixelRatio, 2) : 1)
      if (!shadows) trailPts.length = 0
    },
    render,
  }
}

function boxHighlight(side: 1 | -1) {
  const w = COURT.width / 2 - 0.16
  const d = COURT.length - COURT.shortLineZ - 0.16
  const x = (side * COURT.width) / 4
  const z = COURT.shortLineZ + 0.08 + d / 2
  const group = new THREE.Group()
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ color: 0xc6ff3a, transparent: true, opacity: 0.58, depthWrite: false }),
  )
  fill.rotation.x = -Math.PI / 2
  fill.position.set(x, 0.045, z)
  fill.renderOrder = 2
  group.add(fill)
  const edge = new THREE.MeshBasicMaterial({ color: 0xe8ff6a })
  const t = 0.07
  const y = 0.06
  const bar = (bw: number, bd: number, px: number, pz: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.025, bd), edge)
    mesh.position.set(px, y, pz)
    mesh.renderOrder = 3
    group.add(mesh)
  }
  bar(w, t, x, z - d / 2)
  bar(w, t, x, z + d / 2)
  bar(t, d, x - w / 2, z)
  bar(t, d, x + w / 2, z)
  return group
}

function buildCourt(theme: CourtTheme) {
  const g = new THREE.Group()
  const night = theme === 'glass'
  const floorColor = night ? 0x143848 : 0xc49262
  const wallColor = night ? 0xb7e4ff : 0xf7f8fb
  const tinColor = night ? 0x8a3048 : 0xd64545
  const lineColor = 0xff2a2a
  const wallOpacity = night ? 0.28 : 1

  const apron = box(18, 0.18, 22, 0, -0.16, 8, night ? 0x0c1a22 : 0x8aa0b3, 0.95)
  apron.receiveShadow = true
  g.add(apron)

  const floor = box(COURT.width + 0.4, 0.2, COURT.length + 0.2, 0, -0.1, COURT.length / 2, floorColor, 0.86)
  floor.receiveShadow = true
  g.add(floor)

  const wallMat = (color: number) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: night ? 0.12 : 0.78,
      metalness: night ? 0.05 : 0.02,
      transparent: night,
      opacity: wallOpacity,
      depthWrite: !night,
    })

  const tin = new THREE.Mesh(new THREE.BoxGeometry(COURT.width, COURT.tin, 0.12), new THREE.MeshStandardMaterial({ color: tinColor, roughness: 0.55 }))
  tin.position.set(0, COURT.tin / 2, -0.06)
  tin.receiveShadow = true
  g.add(tin)

  const upperH = COURT.frontHeight - COURT.tin
  const upper = new THREE.Mesh(new THREE.BoxGeometry(COURT.width, upperH, 0.1), wallMat(wallColor))
  upper.position.set(0, COURT.tin + upperH / 2, -0.05)
  upper.receiveShadow = true
  g.add(upper)

  const sideGeo = new THREE.BoxGeometry(0.1, COURT.sideHeight, COURT.length)
  const left = new THREE.Mesh(sideGeo, wallMat(wallColor))
  left.position.set(-COURT.width / 2 - 0.05, COURT.sideHeight / 2, COURT.length / 2)
  left.receiveShadow = true
  const right = new THREE.Mesh(sideGeo, wallMat(wallColor))
  right.position.set(COURT.width / 2 + 0.05, COURT.sideHeight / 2, COURT.length / 2)
  right.receiveShadow = true
  g.add(left, right)

  // The back wall stays in the rules, but it is not drawn, so the camera can see the court.
  const outFront = box(COURT.width, 0.05, 0.04, 0, COURT.frontHeight, 0.01, lineColor, 0.4)
  g.add(outFront)
  const service = box(COURT.width, 0.035, 0.025, 0, COURT.serviceLineY, 0.02, lineColor, 0.4)
  g.add(service)

  const lineMat = new THREE.MeshStandardMaterial({ color: lineColor, roughness: 0.45 })
  const strip = (w: number, d: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), lineMat)
    m.position.set(x, 0.028, z)
    g.add(m)
  }
  const halfW = COURT.width / 2
  const boxDepth = COURT.length - COURT.shortLineZ
  strip(COURT.width, 0.08, 0, COURT.shortLineZ)
  strip(0.08, boxDepth, 0, COURT.shortLineZ + boxDepth / 2)
  strip(0.05, COURT.length, -halfW + 0.03, COURT.length / 2)
  strip(0.05, COURT.length, halfW - 0.03, COURT.length / 2)
  strip(COURT.width, 0.05, 0, 0.04)
  strip(COURT.width, 0.08, 0, COURT.length - 0.05)

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff6dd,
    emissive: 0xfff1c4,
    emissiveIntensity: night ? 0.4 : 0.85,
    roughness: 0.4,
  })
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, COURT.length * 0.62), lampMat)
  lamp.position.set(0, 5.05, COURT.length * 0.48)
  g.add(lamp)

  return g
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, roughness: number) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 }),
  )
  mesh.position.set(x, y, z)
  return mesh
}

function makeAthlete(shirtColor: number): Athlete {
  const group = new THREE.Group()
  const skin = new THREE.MeshStandardMaterial({ color: 0xf0c7a6, roughness: 0.72 })
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.52 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.62 })
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf5f7fb, roughness: 0.4 })

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.32, 4, 8), shirt)
  torso.position.y = 1.02
  torso.castShadow = true
  group.add(torso)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), skin)
  head.position.y = 1.48
  head.castShadow = true
  group.add(head)
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.152, 14, 10), dark)
  hair.scale.set(1.02, 0.55, 1.02)
  hair.position.y = 1.58
  group.add(hair)

  const leg = (x: number) => {
    const pivot = new THREE.Group()
    pivot.position.set(x, 0.72, 0)
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.26, 3, 6), dark)
    m.position.y = -0.22
    m.castShadow = true
    pivot.add(m)
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.18), shoeMat)
    shoe.position.set(0, -0.42, 0.03)
    pivot.add(shoe)
    group.add(pivot)
    return pivot
  }

  const arm = new THREE.Group()
  arm.position.set(0.18, 1.34, 0.02)
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.2, 3, 6), skin)
  upper.rotation.z = 0.55
  upper.rotation.x = 0.7
  upper.position.set(0.06, -0.12, -0.1)
  arm.add(upper)
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin)
  hand.position.set(0.1, -0.18, -0.22)
  arm.add(hand)
  const racquet = makeRacquet()
  racquet.position.set(0.1, -0.18, -0.22)
  arm.add(racquet)
  group.add(arm)

  return { group, legL: leg(-0.09), legR: leg(0.09), arm, racquet, shirt, lastX: 0, lastZ: 0 }
}

/** Grip at the origin, head up along +Y, face toward ±Z (the front wall). */
function makeRacquet() {
  const g = new THREE.Group()
  const frame = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.35, metalness: 0.25 })
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.02, 0.14, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b3a22, roughness: 0.7 }),
  )
  grip.position.y = 0.07
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.18, 8), frame)
  shaft.position.y = 0.2
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.016, 8, 20), frame)
  hoop.position.y = 0.4
  const strings = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 16),
    new THREE.MeshStandardMaterial({ color: 0xf4f0e4, side: THREE.DoubleSide, roughness: 0.55 }),
  )
  strings.position.y = 0.4
  g.add(grip, shaft, hoop, strings)
  return g
}

function pose(body: Athlete, actor: Actor, time: number, dt: number) {
  const dx = actor.x - body.lastX
  const dz = actor.z - body.lastZ
  const moving = dx * dx + dz * dz > 0.00001 * Math.max(0.016, dt)
  body.lastX = actor.x
  body.lastZ = actor.z
  body.group.position.set(actor.x, moving ? Math.sin(time * 12) * 0.035 : 0, actor.z)
  const swing = moving ? Math.sin(time * 10) * 0.55 : 0
  body.legL.rotation.x = swing
  body.legR.rotation.x = -swing
  const racquet = body.racquet
  if (actor.swing > 0) {
    const u = 1 - actor.swing / 0.32
    body.arm.rotation.set(0.15 - u * 0.85, 0.2 - u * 0.15, -0.45 + u * 0.25)
    racquet.rotation.set(-0.25 - u * 0.7, 0.1, -0.55 + u * 0.7)
  } else {
    // Ready: grip at chest height, head up in front of the right shoulder, face toward the front wall.
    body.arm.rotation.set(-0.55, 0.05, -0.1)
    racquet.rotation.set(-0.35, 0, -0.15)
  }
}
