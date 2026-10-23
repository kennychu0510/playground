import './style.css'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { HOOP_HOME, SCORE, STAGES, hoopOffset, type StageDef } from './game/stages'

await RAPIER.init()

const canvas = document.querySelector<HTMLCanvasElement>('#c')!
const bannerEl = document.querySelector<HTMLDivElement>('#banner')!
const stageLabelEl = document.querySelector<HTMLSpanElement>('#stage-label')!
const stageScoreEl = document.querySelector<HTMLSpanElement>('#stage-score')!
const timerEl = document.querySelector<HTMLSpanElement>('#timer')!
const streakEl = document.querySelector<HTMLSpanElement>('#streak')!
const totalScoreEl = document.querySelector<HTMLSpanElement>('#total-score')!
const overlayEl = document.querySelector<HTMLDivElement>('#overlay')!
const overlayEyebrow = document.querySelector<HTMLParagraphElement>('#overlay-eyebrow')!
const overlayTitle = document.querySelector<HTMLHeadingElement>('#overlay-title')!
const overlayBody = document.querySelector<HTMLParagraphElement>('#overlay-body')!
const overlayRules = document.querySelector<HTMLUListElement>('#overlay-rules')!
const btnPrimary = document.querySelector<HTMLButtonElement>('#btn-primary')!

/** Compact arcade cabinet scale (metres). */
const BALL_R = 0.105
/** Total balls in circulation — typical arcade machine feel. */
const BALL_COUNT = 9
const GRAVITY = -12.5
/** Ready-ball rest on the front trough / shelf (must stay in camera frame). */
const SHOOT_POS = new THREE.Vector3(0, 0.88, 1.12)
/** Fixed arcade POV: tip down + pulled back so trough ball and hoop share the frame. */
const CAM_POS = new THREE.Vector3(0, 1.5, 2.55)
const CAM_LOOK = new THREE.Vector3(0, 1.12, -1.25)
/**
 * Middle-ground launches (~3.1 m trough→rim, g=-12.5):
 * normal flick ~8.5–9.5 m/s reaches/banks; max ~10.5 still trackable.
 * Between prior blur (0.42/820 uncapped) and underpowered (0.12/360/6.2).
 */
const IMPULSE_SCALE = 0.25
const MIN_FLICK = 180
const MAX_FLICK = 560
const UP_BIAS = 0.56
const FORWARD_BIAS = 0.84
/** Power-scaled launch speed (m/s); absolute ceiling for readability. */
const MIN_LAUNCH_SPEED = 7.5
const MAX_LAUNCH_SPEED = 10.5

/** Interior half-width / depth / height for closed cabinet. */
const CAB_HALF_W = 1.05
const CAB_BACK_Z = -2.55
const CAB_FRONT_Z = 1.38
const CAB_CEIL_Y = 2.35
const CAB_FLOOR_Y = 0.02

const COL_RIM = 0x0001
const COL_BOARD = 0x0002
const COL_SENSOR = 0x0004
const COL_BALL = 0x0008
const COL_WORLD = 0x0010

type Phase = 'title' | 'playing' | 'cleared' | 'failed' | 'won'

type GameState = {
  phase: Phase
  stageIndex: number
  stageScore: number
  totalScore: number
  streak: number
  timeLeft: number
  banner: string
  bannerKind: '' | 'make' | 'miss' | 'clear'
}

const state: GameState = {
  phase: 'title',
  stageIndex: 0,
  stageScore: 0,
  totalScore: 0,
  streak: 0,
  timeLeft: STAGES[0]!.duration,
  banner: 'Flick up to shoot · balls return on the ramp',
  bannerKind: '',
}

function currentStage(): StageDef {
  return STAGES[state.stageIndex]!
}

function formatTime(s: number) {
  const t = Math.max(0, Math.ceil(s))
  const m = Math.floor(t / 60)
  const sec = t % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function syncHud() {
  const st = currentStage()
  stageLabelEl.textContent = `${st.id} · ${st.name}`
  stageScoreEl.textContent = `${state.stageScore} / ${st.goal}`
  timerEl.textContent = formatTime(state.timeLeft)
  timerEl.classList.toggle('urgent', state.phase === 'playing' && state.timeLeft <= 10)
  streakEl.textContent = String(state.streak)
  streakEl.classList.toggle('hot', state.streak >= 3)
  totalScoreEl.textContent = `Σ ${state.totalScore}`
  bannerEl.textContent = state.banner
  bannerEl.classList.toggle('hidden', !state.banner)
  bannerEl.classList.toggle('make', state.bannerKind === 'make')
  bannerEl.classList.toggle('miss', state.bannerKind === 'miss')
  bannerEl.classList.toggle('clear', state.bannerKind === 'clear')
}

let bannerClearAt = 0
function flashBanner(text: string, kind: GameState['bannerKind'], ms = 1100) {
  state.banner = text
  state.bannerKind = kind
  syncHud()
  bannerClearAt = performance.now() + ms
}

function showOverlay(opts: {
  eyebrow: string
  title: string
  body: string
  button: string
  rules?: boolean
}) {
  overlayEyebrow.textContent = opts.eyebrow
  overlayTitle.textContent = opts.title
  overlayBody.textContent = opts.body
  btnPrimary.textContent = opts.button
  overlayRules.style.display = opts.rules === false ? 'none' : ''
  overlayEl.classList.remove('hidden')
}

function hideOverlay() {
  overlayEl.classList.add('hidden')
}

// --- Three ---
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0a1020)
scene.fog = new THREE.Fog(0x0a1020, 9, 18)

const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 30)
camera.position.copy(CAM_POS)
camera.lookAt(CAM_LOOK)

scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x1a2030, 0.85))
const key = new THREE.DirectionalLight(0xffffff, 1.05)
key.position.set(1.6, 5.5, 2.8)
key.castShadow = true
key.shadow.mapSize.set(1024, 1024)
scene.add(key)
const fill = new THREE.PointLight(0xff8a3d, 0.5, 12)
fill.position.set(-1.3, 1.7, 0.5)
scene.add(fill)
const hoopLight = new THREE.PointLight(0xfff2c8, 0.75, 7)
hoopLight.position.set(0, 2.2, -1.5)
scene.add(hoopLight)
const troughLight = new THREE.PointLight(0xffc978, 0.45, 4)
troughLight.position.set(0, 1.25, 1.2)
scene.add(troughLight)

const root = new THREE.Group()
scene.add(root)

const woodDark = new THREE.MeshStandardMaterial({ color: 0x6e1524, roughness: 0.55, metalness: 0.12 })
const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.65, metalness: 0.1 })
const deckMat = new THREE.MeshStandardMaterial({ color: 0x1a2740, roughness: 0.85, metalness: 0.05 })
const rampMat = new THREE.MeshStandardMaterial({ color: 0x243552, roughness: 0.7 })
const glassMat = new THREE.MeshStandardMaterial({
  color: 0xa8c4e8,
  roughness: 0.12,
  metalness: 0.15,
  transparent: true,
  opacity: 0.18,
  side: THREE.DoubleSide,
  depthWrite: false,
})
const railMat = new THREE.MeshStandardMaterial({ color: 0xf0b429, metalness: 0.55, roughness: 0.35 })

// --- Visual cabinet ---
// Base deck under play volume
const floor = new THREE.Mesh(new THREE.BoxGeometry(CAB_HALF_W * 2 + 0.2, 0.08, 4.0), deckMat)
floor.position.set(0, -0.04, -0.55)
floor.receiveShadow = true
root.add(floor)

/**
 * Return ramp: higher at the back (under hoop), lower toward the front trough
 * so balls roll back to the player. Three.js +X rotation lowers +Z.
 */
const RAMP_ANGLE = 0.14
const RAMP_LEN = 3.15
const RAMP_Y = 0.22
const RAMP_Z = -0.55
const ramp = new THREE.Mesh(new THREE.BoxGeometry(CAB_HALF_W * 2 - 0.12, 0.05, RAMP_LEN), rampMat)
ramp.position.set(0, RAMP_Y, RAMP_Z)
ramp.rotation.x = RAMP_ANGLE
ramp.receiveShadow = true
root.add(ramp)

// Front trough / ball shelf (collection bin)
const trough = new THREE.Mesh(
  new THREE.BoxGeometry(1.7, 0.1, 0.5),
  new THREE.MeshStandardMaterial({ color: 0x8b1e2d, roughness: 0.5, metalness: 0.2 }),
)
trough.position.set(0, 0.62, 1.12)
trough.castShadow = true
trough.receiveShadow = true
root.add(trough)

const troughLip = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.06, 0.07), railMat)
troughLip.position.set(0, 0.74, 1.34)
root.add(troughLip)

// Side lips on trough so balls stay in the bin
for (const x of [-0.82, 0.82]) {
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.5), railMat)
  lip.position.set(x, 0.76, 1.12)
  root.add(lip)
}

// Cabinet front body under trough
const cabinet = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.65), woodDark)
cabinet.position.set(0, 0.3, 1.22)
cabinet.castShadow = true
root.add(cabinet)

// Side walls (visual)
for (const x of [-CAB_HALF_W - 0.05, CAB_HALF_W + 0.05]) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.1, CAB_CEIL_Y + 0.1, CAB_FRONT_Z - CAB_BACK_Z + 0.1), wallMat)
  wall.position.set(x, CAB_CEIL_Y / 2, (CAB_FRONT_Z + CAB_BACK_Z) / 2)
  wall.castShadow = true
  root.add(wall)
}

// Back panel
const backPanel = new THREE.Mesh(
  new THREE.BoxGeometry(CAB_HALF_W * 2 + 0.2, CAB_CEIL_Y + 0.1, 0.1),
  new THREE.MeshStandardMaterial({ color: 0x121a2c, roughness: 0.8 }),
)
backPanel.position.set(0, CAB_CEIL_Y / 2, CAB_BACK_Z - 0.05)
root.add(backPanel)

// Ceiling / top glass
const ceiling = new THREE.Mesh(
  new THREE.BoxGeometry(CAB_HALF_W * 2, 0.04, CAB_FRONT_Z - CAB_BACK_Z),
  glassMat.clone(),
)
ceiling.position.set(0, CAB_CEIL_Y, (CAB_FRONT_Z + CAB_BACK_Z) / 2)
root.add(ceiling)

// Front glass pane (camera looks through; collider seals the cabinet)
const frontGlass = new THREE.Mesh(
  new THREE.BoxGeometry(CAB_HALF_W * 2 - 0.08, CAB_CEIL_Y - 0.75, 0.04),
  glassMat,
)
frontGlass.position.set(0, (CAB_CEIL_Y + 0.75) / 2, CAB_FRONT_Z - 0.02)
root.add(frontGlass)

// Neon side rails
for (const x of [-CAB_HALF_W + 0.02, CAB_HALF_W - 0.02]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, CAB_FRONT_Z - CAB_BACK_Z - 0.2), railMat)
  rail.position.set(x, CAB_CEIL_Y - 0.08, (CAB_FRONT_Z + CAB_BACK_Z) / 2)
  root.add(rail)
}

const hoopGroup = new THREE.Group()
root.add(hoopGroup)

const backboard = new THREE.Mesh(
  new THREE.BoxGeometry(1.15, 0.78, 0.05),
  new THREE.MeshStandardMaterial({
    color: 0xf4f7ff,
    roughness: 0.3,
    metalness: 0.05,
    transparent: true,
    opacity: 0.94,
  }),
)
backboard.position.set(0, 0.32, 0.1)
backboard.castShadow = true
hoopGroup.add(backboard)

const square = new THREE.Mesh(
  new THREE.PlaneGeometry(0.38, 0.3),
  new THREE.MeshBasicMaterial({ color: 0xff3b4a }),
)
square.position.set(0, 0.16, 0.128)
hoopGroup.add(square)

const rimMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, metalness: 0.75, roughness: 0.28 })
let rimMesh = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 10, 36), rimMat)
rimMesh.rotation.x = Math.PI / 2
rimMesh.position.set(0, 0, -0.16)
rimMesh.castShadow = true
hoopGroup.add(rimMesh)

const netGroup = new THREE.Group()
hoopGroup.add(netGroup)

function rebuildNet(rimR: number) {
  while (netGroup.children.length) {
    const c = netGroup.children.pop()!
    if (c instanceof THREE.Line) c.geometry.dispose()
    netGroup.remove(c)
  }
  const netMat = new THREE.LineBasicMaterial({ color: 0xe8eefc, transparent: true, opacity: 0.6 })
  const strands = 12
  for (let i = 0; i < strands; i++) {
    const a = (i / strands) * Math.PI * 2
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= 5; k++) {
      const t = k / 5
      const rr = rimR * (1 - t * 0.55)
      const y = -t * 0.38
      const swirl = a + t * 0.55
      pts.push(new THREE.Vector3(Math.cos(swirl) * rr, y, -0.16 + Math.sin(swirl) * rr * 0.12))
    }
    netGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), netMat))
  }
}
rebuildNet(0.22)

const pole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.05, 0.065, 1.55, 12),
  new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: 0.55, roughness: 0.38 }),
)
pole.position.set(0, 0.85, HOOP_HOME.z + 0.42)
pole.castShadow = true
root.add(pole)

const arm = new THREE.Mesh(
  new THREE.BoxGeometry(0.08, 0.08, 0.5),
  new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: 0.55, roughness: 0.38 }),
)
arm.position.set(0, HOOP_HOME.y + 0.3, HOOP_HOME.z + 0.22)
root.add(arm)

hoopGroup.position.set(HOOP_HOME.x, HOOP_HOME.y, HOOP_HOME.z)

const ballGeo = new THREE.SphereGeometry(BALL_R, 28, 20)
const ballMat = new THREE.MeshStandardMaterial({ color: 0xe4572e, roughness: 0.55, metalness: 0.05 })
const seamMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a })

function makeBallMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(ballGeo, ballMat)
  mesh.castShadow = true
  for (const rot of [
    [0, 0, 0],
    [Math.PI / 2, 0, 0],
    [0, Math.PI / 2, Math.PI / 4],
  ] as const) {
    const curve = new THREE.EllipseCurve(0, 0, BALL_R * 1.01, BALL_R * 1.01, 0, Math.PI * 2, false, 0)
    const pts3 = curve.getPoints(40).map((p) => new THREE.Vector3(p.x, p.y, 0))
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts3), seamMat)
    line.rotation.set(rot[0], rot[1], rot[2])
    mesh.add(line)
  }
  return mesh
}

const trailMat = new THREE.LineBasicMaterial({ color: 0x3ecf8e, transparent: true, opacity: 0 })
const trailGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
const trailLine = new THREE.Line(trailGeo, trailMat)
root.add(trailLine)

// --- Rapier ---
const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 })
const eventQueue = new RAPIER.EventQueue(true)

function addFixedCuboid(
  tx: number,
  ty: number,
  tz: number,
  hx: number,
  hy: number,
  hz: number,
  opts: { restitution?: number; friction?: number; rotX?: number } = {},
) {
  const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(tx, ty, tz)
  if (opts.rotX) {
    const half = opts.rotX / 2
    desc.setRotation({ x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) })
  }
  const body = world.createRigidBody(desc)
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setRestitution(opts.restitution ?? 0.35)
      .setFriction(opts.friction ?? 0.6)
      .setCollisionGroups((COL_WORLD << 16) | COL_BALL),
    body,
  )
  return body
}

/** Quaternion half-angle for Rapier from full rotation about X. */
function quatX(fullRad: number) {
  const half = fullRad / 2
  return { x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) }
}

// Return ramp collider (slope toward front / +Z)
{
  const rampBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, RAMP_Y, RAMP_Z).setRotation(quatX(RAMP_ANGLE)),
  )
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(CAB_HALF_W - 0.08, 0.025, RAMP_LEN / 2)
      .setRestitution(0.22)
      .setFriction(0.55)
      .setCollisionGroups((COL_WORLD << 16) | COL_BALL),
    rampBody,
  )
}

// Trough shelf
addFixedCuboid(0, 0.62, 1.12, 0.85, 0.05, 0.26, { restitution: 0.12, friction: 0.95 })
// Front lip (stops balls rolling out of cabinet toward camera)
addFixedCuboid(0, 0.78, 1.34, 0.86, 0.1, 0.035, { restitution: 0.2, friction: 0.8 })
// Trough side lips
addFixedCuboid(-0.82, 0.78, 1.12, 0.03, 0.11, 0.25, { restitution: 0.2, friction: 0.7 })
addFixedCuboid(0.82, 0.78, 1.12, 0.03, 0.11, 0.25, { restitution: 0.2, friction: 0.7 })
// Ramp → trough transition step (gentle catch)
addFixedCuboid(0, 0.42, 0.72, 0.95, 0.04, 0.18, { restitution: 0.15, friction: 0.7, rotX: 0.2 })

// Side walls — full height enclosure
for (const x of [-CAB_HALF_W, CAB_HALF_W]) {
  addFixedCuboid(
    x,
    CAB_CEIL_Y / 2,
    (CAB_FRONT_Z + CAB_BACK_Z) / 2,
    0.05,
    CAB_CEIL_Y / 2 + 0.05,
    (CAB_FRONT_Z - CAB_BACK_Z) / 2 + 0.05,
    { restitution: 0.5, friction: 0.25 },
  )
}

// Back wall
addFixedCuboid(0, CAB_CEIL_Y / 2, CAB_BACK_Z, CAB_HALF_W + 0.05, CAB_CEIL_Y / 2 + 0.05, 0.05, {
  restitution: 0.55,
  friction: 0.3,
})

// Ceiling — balls cannot fly out the top
addFixedCuboid(0, CAB_CEIL_Y, (CAB_FRONT_Z + CAB_BACK_Z) / 2, CAB_HALF_W, 0.04, (CAB_FRONT_Z - CAB_BACK_Z) / 2, {
  restitution: 0.4,
  friction: 0.2,
})

// Full front glass collider — seals cabinet; shots go -Z from inside so no aperture needed
addFixedCuboid(0, (CAB_CEIL_Y + 0.72) / 2, CAB_FRONT_Z, CAB_HALF_W - 0.02, (CAB_CEIL_Y - 0.72) / 2, 0.03, {
  restitution: 0.4,
  friction: 0.2,
})

// Front lower barrier under trough (cabinet face)
addFixedCuboid(0, 0.28, CAB_FRONT_Z - 0.05, CAB_HALF_W, 0.3, 0.04, { restitution: 0.3, friction: 0.5 })

// Safety floor under everything (last resort)
addFixedCuboid(0, CAB_FLOOR_Y - 0.05, -0.6, CAB_HALF_W + 0.1, 0.05, 2.1, { restitution: 0.2, friction: 0.9 })

const hoopBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(HOOP_HOME.x, HOOP_HOME.y, HOOP_HOME.z),
)

let rimHandles: number[] = []
let boardHandle = -1
let sensorHandle = -1

function quatAlignYTo(dir: THREE.Vector3): { x: number; y: number; z: number; w: number } {
  const t = dir.clone().normalize()
  if (t.lengthSq() < 1e-8) return { x: 0, y: 0, z: 0, w: 1 }
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), t)
  return { x: q.x, y: q.y, z: q.z, w: q.w }
}

function rebuildHoopColliders(rimR: number) {
  for (const h of rimHandles) {
    const c = world.getCollider(h)
    if (c) world.removeCollider(c, true)
  }
  rimHandles = []
  if (boardHandle >= 0) {
    const c = world.getCollider(boardHandle)
    if (c) world.removeCollider(c, true)
    boardHandle = -1
  }
  if (sensorHandle >= 0) {
    const c = world.getCollider(sensorHandle)
    if (c) world.removeCollider(c, true)
    sensorHandle = -1
  }

  const board = world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.575, 0.39, 0.025)
      .setTranslation(0, 0.32, 0.1)
      .setRestitution(0.55)
      .setFriction(0.4)
      .setCollisionGroups((COL_BOARD << 16) | COL_BALL)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    hoopBody,
  )
  boardHandle = board.handle

  const segs = 16
  const tube = 0.016
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2
    const a1 = ((i + 1) / segs) * Math.PI * 2
    const x0 = Math.cos(a0) * rimR
    const z0 = -0.16 + Math.sin(a0) * rimR
    const x1 = Math.cos(a1) * rimR
    const z1 = -0.16 + Math.sin(a1) * rimR
    const mx = (x0 + x1) / 2
    const mz = (z0 + z1) / 2
    const dx = x1 - x0
    const dz = z1 - z0
    const len = Math.hypot(dx, dz)
    const col = world.createCollider(
      RAPIER.ColliderDesc.capsule(Math.max(0.01, len / 2), tube)
        .setTranslation(mx, 0, mz)
        .setRotation(quatAlignYTo(new THREE.Vector3(dx, 0, dz)))
        .setRestitution(0.5)
        .setFriction(0.35)
        .setCollisionGroups((COL_RIM << 16) | COL_BALL)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      hoopBody,
    )
    rimHandles.push(col.handle)
  }

  const sensor = world.createCollider(
    RAPIER.ColliderDesc.cylinder(0.11, rimR * 0.7)
      .setTranslation(0, -0.13, -0.16)
      .setSensor(true)
      .setCollisionGroups((COL_SENSOR << 16) | COL_BALL)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    hoopBody,
  )
  sensorHandle = sensor.handle

  hoopGroup.remove(rimMesh)
  rimMesh.geometry.dispose()
  rimMesh = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.018, 10, 36), rimMat)
  rimMesh.rotation.x = Math.PI / 2
  rimMesh.position.set(0, 0, -0.16)
  rimMesh.castShadow = true
  hoopGroup.add(rimMesh)
  rebuildNet(rimR)
}

rebuildHoopColliders(STAGES[0]!.rimRadius)

type BallEntity = {
  mesh: THREE.Mesh
  body: RAPIER.RigidBody
  collider: RAPIER.Collider
  /** Currently the held/flickable ball on the shoot spot. */
  ready: boolean
  /** Was launched and has not yet settled back in the trough. */
  inFlight: boolean
  scored: boolean
  touchedRim: boolean
  /** Already counted a miss for this flight. */
  missCounted: boolean
  spawnAt: number
  /** Cooldown before this ball can score again after a make. */
  scoreLockUntil: number
}

const balls: BallEntity[] = []
const ballByCollider = new Map<number, BallEntity>()

function createBallEntity(x: number, y: number, z: number): BallEntity {
  const mesh = makeBallMesh()
  root.add(mesh)
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinearDamping(0.12)
      .setAngularDamping(0.28)
      .setCcdEnabled(true)
      .setCanSleep(true),
  )
  const collider = world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_R)
      .setRestitution(0.68)
      .setFriction(0.55)
      .setDensity(2.5)
      .setCollisionGroups((COL_BALL << 16) | (COL_WORLD | COL_RIM | COL_BOARD | COL_SENSOR | COL_BALL))
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    body,
  )
  const ent: BallEntity = {
    mesh,
    body,
    collider,
    ready: false,
    inFlight: false,
    scored: false,
    touchedRim: false,
    missCounted: false,
    spawnAt: performance.now(),
    scoreLockUntil: 0,
  }
  balls.push(ent)
  ballByCollider.set(collider.handle, ent)
  mesh.position.set(x, y, z)
  return ent
}

function destroyBall(ent: BallEntity) {
  ballByCollider.delete(ent.collider.handle)
  world.removeCollider(ent.collider, true)
  world.removeRigidBody(ent.body)
  root.remove(ent.mesh)
  const idx = balls.indexOf(ent)
  if (idx >= 0) balls.splice(idx, 1)
}

function clearAllBalls() {
  while (balls.length) destroyBall(balls[0]!)
}

/** Spawn the full arcade pool: one ready on trough, rest on ramp rolling forward. */
function spawnBallPool() {
  clearAllBalls()
  // Ready ball on shoot spot
  const ready = createBallEntity(SHOOT_POS.x, SHOOT_POS.y, SHOOT_POS.z)
  ready.ready = true
  ready.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  ready.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  ready.body.sleep()

  // Remaining balls staggered on the return ramp (will roll toward trough)
  const rest = BALL_COUNT - 1
  for (let i = 0; i < rest; i++) {
    const t = (i + 0.5) / rest
    // Place along ramp surface in world space
    const localZ = -RAMP_LEN / 2 + 0.35 + t * (RAMP_LEN - 0.9)
    const worldZ = RAMP_Z + localZ * Math.cos(RAMP_ANGLE)
    const worldY = RAMP_Y - localZ * Math.sin(RAMP_ANGLE) + BALL_R + 0.03
    const x = ((i % 3) - 1) * 0.28 + (Math.random() - 0.5) * 0.06
    const ent = createBallEntity(x, worldY, worldZ)
    ent.inFlight = false
    // Nudge slightly forward so they settle into trough
    ent.body.setLinvel({ x: 0, y: 0, z: 0.15 + Math.random() * 0.1 }, true)
  }
}

function getReadyBall(): BallEntity | null {
  return balls.find((b) => b.ready) ?? null
}

function isInTroughZone(p: { x: number; y: number; z: number }) {
  return p.z > 0.82 && p.z < 1.42 && p.y < 1.15 && Math.abs(p.x) < 0.9
}

function speedOf(ent: BallEntity) {
  const v = ent.body.linvel()
  return Math.hypot(v.x, v.y, v.z)
}

/**
 * Promote a settled trough ball to ready when the shoot spot is empty.
 * Snaps it to SHOOT_POS so the player always has a flickable ball.
 */
function tryPromoteReadyBall() {
  if (getReadyBall()) return
  // Prefer slowest ball already in trough
  let best: BallEntity | null = null
  let bestScore = Infinity
  for (const ent of balls) {
    if (ent.ready || ent.inFlight) continue
    const p = ent.body.translation()
    if (!isInTroughZone(p)) continue
    const spd = speedOf(ent)
    if (spd > 0.85) continue
    const score = spd * 2 + Math.abs(p.x) * 0.5 + Math.abs(p.z - SHOOT_POS.z)
    if (score < bestScore) {
      bestScore = score
      best = ent
    }
  }
  if (!best) return
  best.ready = true
  best.inFlight = false
  best.scored = false
  best.touchedRim = false
  best.missCounted = false
  best.body.wakeUp()
  best.body.setTranslation({ x: SHOOT_POS.x, y: SHOOT_POS.y, z: SHOOT_POS.z }, true)
  best.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  best.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  best.body.sleep()
}

function applyHoopPose(tSec: number) {
  const st = currentStage()
  const off = hoopOffset(st.motion, tSec)
  const x = HOOP_HOME.x + off.x
  const y = HOOP_HOME.y
  const z = HOOP_HOME.z + off.z
  hoopGroup.position.set(x, y, z)
  hoopBody.setNextKinematicTranslation({ x, y, z })
}

function launchBall(dx: number, dy: number, speedPx: number) {
  if (state.phase !== 'playing') return
  let ready = getReadyBall()
  if (!ready) {
    tryPromoteReadyBall()
    ready = getReadyBall()
  }
  if (!ready) return // no ball available yet — wait for return

  // Gesture → power; direction from impulse biases, speed power-scaled to rim reach
  const speed = THREE.MathUtils.clamp(speedPx * 0.55, MIN_FLICK, MAX_FLICK)
  const power = Math.pow((speed - MIN_FLICK) / (MAX_FLICK - MIN_FLICK), 0.95)
  const lateral = THREE.MathUtils.clamp(dx / 300, -1.0, 1.0)
  const lift = THREE.MathUtils.clamp(dy / 450, -0.05, 1.1)

  const impulseY = UP_BIAS + lift * 0.55 + power * 0.32
  const impulseZ = -(FORWARD_BIAS + power * 0.65 + Math.max(0, lift) * 0.14)
  const impulseX = lateral * (0.32 + power * 0.18)
  const scale = IMPULSE_SCALE * (0.92 + power * 0.3)

  ready.ready = false
  ready.inFlight = true
  ready.scored = false
  ready.touchedRim = false
  ready.missCounted = false
  ready.spawnAt = performance.now()
  ready.scoreLockUntil = 0

  ready.body.wakeUp()
  ready.body.setTranslation({ x: SHOOT_POS.x, y: SHOOT_POS.y, z: SHOOT_POS.z }, true)
  ready.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  ready.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  ready.body.applyImpulse({ x: impulseX * scale, y: impulseY * scale, z: impulseZ * scale }, true)
  // Map to arcade launch speed: weak still reaches (~7.5), max trackable (~10.5)
  {
    const v = ready.body.linvel()
    const spd = Math.hypot(v.x, v.y, v.z)
    if (spd > 1e-4) {
      const target = THREE.MathUtils.lerp(MIN_LAUNCH_SPEED, MAX_LAUNCH_SPEED, power)
      const s = target / spd
      ready.body.setLinvel({ x: v.x * s, y: v.y * s, z: v.z * s }, true)
    }
  }
  ready.body.applyTorqueImpulse(
    { x: (Math.random() - 0.5) * 0.01, y: (Math.random() - 0.5) * 0.01, z: (Math.random() - 0.5) * 0.01 },
    true,
  )

  // Pull next ball onto the trough ASAP if one is already waiting
  tryPromoteReadyBall()

  state.banner = ''
  state.bannerKind = ''
  syncHud()
}

function registerMake(ent: BallEntity, swish: boolean) {
  if (ent.scored) return
  if (performance.now() < ent.scoreLockUntil) return
  ent.scored = true
  ent.scoreLockUntil = performance.now() + 1800
  state.streak += 1
  let pts = swish ? SCORE.swish : SCORE.make
  if (state.streak >= SCORE.streakBonusFrom) pts += SCORE.streakBonusPoints
  state.stageScore += pts
  state.totalScore += pts
  const label = swish ? `SWISH +${pts}` : `MAKE +${pts}`
  const extra = state.streak > 1 ? ` · streak ${state.streak}` : ''
  flashBanner(label + extra, 'make')
  syncHud()
  // Ball keeps falling through net → ramp → trough (no destroy)
  if (state.stageScore >= currentStage().goal) onStageClear()
}

function registerMiss(ent: BallEntity) {
  if (ent.scored || ent.missCounted) return
  ent.missCounted = true
  state.streak = 0
  flashBanner('Miss', 'miss', 700)
  syncHud()
}

function onStageClear() {
  state.phase = 'cleared'
  state.bannerKind = 'clear'
  state.banner = `Stage ${currentStage().id} cleared!`
  syncHud()
  const next = state.stageIndex + 1
  if (next >= STAGES.length) {
    state.phase = 'won'
    showOverlay({
      eyebrow: 'Champion',
      title: 'Machine beaten!',
      body: `You cleared all ${STAGES.length} stages. Total score Σ ${state.totalScore}.`,
      button: 'Play again',
      rules: false,
    })
  } else {
    const n = STAGES[next]!
    showOverlay({
      eyebrow: `Stage ${currentStage().id} clear`,
      title: n.name,
      body: `Nice. Next up: ${n.blurb} Goal ${n.goal} in ${n.duration}s.`,
      button: 'Next stage',
      rules: false,
    })
  }
}

function onStageFail() {
  state.phase = 'failed'
  state.streak = 0
  showOverlay({
    eyebrow: 'Time up',
    title: currentStage().name,
    body: `Needed ${currentStage().goal}, scored ${state.stageScore}. Total Σ ${state.totalScore} carries over.`,
    button: 'Retry stage',
    rules: false,
  })
  syncHud()
}

function startStage(index: number, keepTotal: boolean) {
  state.stageIndex = index
  state.stageScore = 0
  state.streak = 0
  state.timeLeft = STAGES[index]!.duration
  state.phase = 'playing'
  state.banner = STAGES[index]!.blurb
  state.bannerKind = ''
  if (!keepTotal) state.totalScore = 0
  rebuildHoopColliders(STAGES[index]!.rimRadius)
  spawnBallPool()
  hideOverlay()
  syncHud()
}

btnPrimary.addEventListener('click', () => {
  if (state.phase === 'title' || state.phase === 'won') startStage(0, false)
  else if (state.phase === 'cleared') startStage(state.stageIndex + 1, true)
  else if (state.phase === 'failed') startStage(state.stageIndex, true)
})

type PointerTrack = { id: number; x: number; y: number; samples: { x: number; y: number; t: number }[] }
let track: PointerTrack | null = null

function onPointerDown(e: PointerEvent) {
  if (state.phase !== 'playing') return
  if (!overlayEl.classList.contains('hidden')) return
  canvas.setPointerCapture(e.pointerId)
  track = { id: e.pointerId, x: e.clientX, y: e.clientY, samples: [] }
  track.samples.push({ x: e.clientX, y: e.clientY, t: performance.now() })
}

function onPointerMove(e: PointerEvent) {
  if (!track || e.pointerId !== track.id) return
  const now = performance.now()
  track.samples.push({ x: e.clientX, y: e.clientY, t: now })
  while (track.samples.length > 2 && now - track.samples[0]!.t > 120) track.samples.shift()

  const dx = e.clientX - track.x
  const dy = track.y - e.clientY
  const len = Math.hypot(dx, dy)
  if (len > 8) {
    const tip = SHOOT_POS.clone().add(new THREE.Vector3(dx * 0.0035, dy * 0.0035, -len * 0.0025))
    trailGeo.setFromPoints([SHOOT_POS.clone(), tip])
    trailMat.opacity = 0.55
  }
}

function onPointerUp(e: PointerEvent) {
  if (!track || e.pointerId !== track.id) return
  const samples = track.samples
  track = null
  trailMat.opacity = 0
  if (samples.length < 2) return
  const a = samples[0]!
  const b = samples[samples.length - 1]!
  const dt = Math.max(16, b.t - a.t)
  const dx = b.x - a.x
  const dy = a.y - b.y
  const dist = Math.hypot(dx, dy)
  const speed = (dist / dt) * 1000
  if (dist < 28 || speed < MIN_FLICK * 0.55) return
  if (dy < -40 && Math.abs(dy) > Math.abs(dx) * 1.2) return
  launchBall(dx, Math.max(dy, dist * 0.35), speed)
}

canvas.addEventListener('pointerdown', onPointerDown)
canvas.addEventListener('pointermove', onPointerMove)
canvas.addEventListener('pointerup', onPointerUp)
canvas.addEventListener('pointercancel', () => {
  track = null
  trailMat.opacity = 0
})

/**
 * Size to the canvas layout box (already padded above Safari safe-area),
 * not the full visualViewport — otherwise the trough is drawn under the navbar.
 */
function fitRenderer() {
  const w = Math.max(1, Math.round(canvas.clientWidth))
  const h = Math.max(1, Math.round(canvas.clientHeight))
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
  camera.position.copy(CAM_POS)
  camera.lookAt(CAM_LOOK)
}

addEventListener('resize', fitRenderer)
window.visualViewport?.addEventListener('resize', fitRenderer)
window.visualViewport?.addEventListener('scroll', fitRenderer)
fitRenderer()

function processEvents() {
  eventQueue.drainCollisionEvents((h1, h2, started) => {
    if (!started) return
    const b1 = ballByCollider.get(h1)
    const b2 = ballByCollider.get(h2)
    const ent = b1 ?? b2
    if (!ent || !ent.inFlight || ent.scored || ent.ready) return
    const other = b1 ? h2 : h1
    if (rimHandles.includes(other)) ent.touchedRim = true
    if (other === sensorHandle) {
      const v = ent.body.linvel()
      if (v.y < 0.55) registerMake(ent, !ent.touchedRim)
    }
  })
}

/** Containment + return-to-trough + miss detection. Balls are never destroyed in play. */
function updateBallLifecycle(now: number) {
  if (state.phase !== 'playing' && state.phase !== 'cleared' && state.phase !== 'failed') return
  const rimR = currentStage().rimRadius
  const hx = hoopGroup.position.x
  const hy = hoopGroup.position.y
  const hz = hoopGroup.position.z - 0.16

  for (const ent of balls) {
    if (ent.ready) continue
    const p = ent.body.translation()
    const v = ent.body.linvel()
    const age = now - ent.spawnAt

    // Soft containment: if somehow outside, push back in
    if (Math.abs(p.x) > CAB_HALF_W + 0.15 || p.z < CAB_BACK_Z - 0.2 || p.z > CAB_FRONT_Z + 0.35 || p.y > CAB_CEIL_Y + 0.3 || p.y < -0.5) {
      ent.body.setTranslation(
        {
          x: THREE.MathUtils.clamp(p.x, -CAB_HALF_W + BALL_R, CAB_HALF_W - BALL_R),
          y: THREE.MathUtils.clamp(p.y, BALL_R + 0.05, CAB_CEIL_Y - BALL_R - 0.05),
          z: THREE.MathUtils.clamp(p.z, CAB_BACK_Z + BALL_R + 0.05, CAB_FRONT_Z - BALL_R - 0.05),
        },
        true,
      )
      ent.body.setLinvel({ x: v.x * 0.2, y: Math.min(v.y, 0), z: Math.abs(v.z) * 0.3 }, true)
    }

    // Sensor fallback for makes
    if (ent.inFlight && !ent.scored && age > 180) {
      const radial = Math.hypot(p.x - hx, p.z - hz)
      if (v.y < 0 && p.y < hy - 0.02 && p.y > hy - 0.32 && radial < rimR * 0.75) {
        registerMake(ent, !ent.touchedRim)
      }
    }

    // Settled back in trough → no longer in flight; eligible for ready promotion
    if (ent.inFlight && age > 700) {
      const spd = Math.hypot(v.x, v.y, v.z)
      if (isInTroughZone(p) && spd < 0.55 && p.y < 1.05) {
        if (!ent.scored && !ent.missCounted && age > 900) registerMiss(ent)
        ent.inFlight = false
        ent.scored = false
        ent.touchedRim = false
      } else if (!ent.scored && !ent.missCounted && age > 900 && spd < 0.35 && p.y < 0.55 && p.z < 0.7) {
        // Settled on ramp without scoring
        registerMiss(ent)
        ent.inFlight = false
      }
    }

    // Clear score lock once ball has left the hoop area
    if (ent.scored && age > 400) {
      const radial = Math.hypot(p.x - hx, p.z - hz)
      if (p.y < hy - 0.4 || radial > rimR * 1.5) {
        // keep scored until trough; scoreLockUntil already set
      }
    }
  }

  tryPromoteReadyBall()
}

// Title screen: show pool idle
spawnBallPool()

let last = performance.now()
let accum = 0
const FIXED = 1 / 60

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now

  if (state.phase === 'playing') {
    state.timeLeft -= dt
    if (state.timeLeft <= 0) {
      state.timeLeft = 0
      const anyRecent = balls.some((b) => b.inFlight && now - b.spawnAt < 2000)
      if (!anyRecent) onStageFail()
    }
    syncHud()
  }

  if (bannerClearAt && now > bannerClearAt && state.phase === 'playing') {
    bannerClearAt = 0
    if (state.bannerKind === 'make' || state.bannerKind === 'miss') {
      state.banner = ''
      state.bannerKind = ''
      syncHud()
    }
  }

  if (state.phase === 'playing' || state.phase === 'cleared' || state.phase === 'failed' || state.phase === 'title') {
    if (state.phase !== 'title') applyHoopPose(now / 1000)
  }

  // Keep ready ball glued to trough shoot spot
  const ready = getReadyBall()
  if (ready) {
    ready.body.setTranslation({ x: SHOOT_POS.x, y: SHOOT_POS.y, z: SHOOT_POS.z }, true)
    ready.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    ready.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    if (!ready.body.isSleeping()) ready.body.sleep()
  }

  accum += dt
  while (accum >= FIXED) {
    world.step(eventQueue)
    processEvents()
    accum -= FIXED
  }
  updateBallLifecycle(now)

  for (const ent of balls) {
    const bp = ent.body.translation()
    const br = ent.body.rotation()
    if (ent.ready) {
      ent.mesh.position.copy(SHOOT_POS)
      ent.mesh.quaternion.identity()
    } else {
      ent.mesh.position.set(bp.x, bp.y, bp.z)
      ent.mesh.quaternion.set(br.x, br.y, br.z, br.w)
    }
  }

  camera.position.copy(CAM_POS)
  camera.lookAt(CAM_LOOK)

  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

syncHud()
showOverlay({
  eyebrow: 'Arcade',
  title: 'Basketball Machine',
  body: `Flick to launch. ${BALL_COUNT} balls bounce off each other and roll back down the ramp — they never leave the cabinet. Clear each stage before time runs out.`,
  button: 'Start',
  rules: true,
})
requestAnimationFrame(frame)
