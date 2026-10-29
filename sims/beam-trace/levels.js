/** Six stages — coords in normalized map space (0..1), origin top-left of playfield. */

export const STAGE_COUNT = 6;

/**
 * @typedef {{x:number,y:number,w:number,h:number}} Pad
 * @typedef {{x:number,y:number,w:number,h:number}} Obstacle
 * @typedef {{
 *   id:number,
 *   alt:number,
 *   label:string,
 *   start:Pad,
 *   goal:Pad,
 *   hintBeam:boolean,
 *   obstacles:Obstacle[],
 *   mapSeed:number
 * }} Stage
 */

/** @type {Stage[]} */
export const STAGES = [
  {
    id: 1,
    alt: 120,
    label: "120m",
    start: { x: 0.36, y: 0.72, w: 0.28, h: 0.12 },
    goal:  { x: 0.36, y: 0.14, w: 0.28, h: 0.12 },
    hintBeam: true,
    obstacles: [],
    mapSeed: 11,
  },
  {
    id: 2,
    alt: 200,
    label: "200m",
    start: { x: 0.18, y: 0.70, w: 0.26, h: 0.12 },
    goal:  { x: 0.56, y: 0.16, w: 0.26, h: 0.12 },
    hintBeam: false,
    obstacles: [{ x: 0.40, y: 0.40, w: 0.20, h: 0.18 }],
    mapSeed: 22,
  },
  {
    id: 3,
    alt: 320,
    label: "320m",
    start: { x: 0.12, y: 0.62, w: 0.24, h: 0.12 },
    goal:  { x: 0.64, y: 0.18, w: 0.24, h: 0.12 },
    hintBeam: false,
    obstacles: [
      { x: 0.38, y: 0.34, w: 0.22, h: 0.22 },
      { x: 0.10, y: 0.28, w: 0.16, h: 0.14 },
    ],
    mapSeed: 33,
  },
  {
    id: 4,
    alt: 420,
    label: "420m",
    start: { x: 0.58, y: 0.72, w: 0.26, h: 0.12 },
    goal:  { x: 0.14, y: 0.16, w: 0.26, h: 0.12 },
    hintBeam: false,
    obstacles: [
      { x: 0.34, y: 0.36, w: 0.28, h: 0.16 },
      { x: 0.62, y: 0.42, w: 0.18, h: 0.18 },
    ],
    mapSeed: 44,
  },
  {
    id: 5,
    alt: 520,
    label: "520m",
    start: { x: 0.10, y: 0.74, w: 0.24, h: 0.11 },
    goal:  { x: 0.66, y: 0.12, w: 0.24, h: 0.11 },
    hintBeam: false,
    obstacles: [
      { x: 0.30, y: 0.28, w: 0.18, h: 0.28 },
      { x: 0.52, y: 0.46, w: 0.22, h: 0.16 },
    ],
    mapSeed: 55,
  },
  {
    id: 6,
    alt: 634,
    label: "634m",
    start: { x: 0.38, y: 0.76, w: 0.24, h: 0.11 },
    goal:  { x: 0.38, y: 0.10, w: 0.24, h: 0.11 },
    hintBeam: false,
    obstacles: [
      { x: 0.22, y: 0.34, w: 0.16, h: 0.22 },
      { x: 0.62, y: 0.34, w: 0.16, h: 0.22 },
      { x: 0.38, y: 0.48, w: 0.24, h: 0.12 },
    ],
    mapSeed: 66,
  },
];

export function padCenter(pad) {
  return { x: pad.x + pad.w / 2, y: pad.y + pad.h / 2 };
}

export function pointInPad(px, py, pad, slack = 0.02) {
  return (
    px >= pad.x - slack &&
    px <= pad.x + pad.w + slack &&
    py >= pad.y - slack &&
    py <= pad.y + pad.h + slack
  );
}
