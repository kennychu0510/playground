/** WSF singles court (metres), toy-friendly. */
export const COURT = {
  length: 9.75,
  width: 6.4,
  frontHeight: 4.57,
  sideHeight: 4.57,
  backHeight: 2.13,
  tin: 0.48,
  serviceLineY: 1.78,
  shortLineZ: 5.49,
  ballRadius: 0.02,
} as const

export type CourtDims = typeof COURT
