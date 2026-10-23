declare module 'poly-decomp' {
  const decomp: {
    makeCCW: (vertices: { x: number; y: number }[]) => void
    removeCollinearPoints: (vertices: { x: number; y: number }[], threshold: number) => void
    quickDecomp: (vertices: { x: number; y: number }[]) => { x: number; y: number }[][]
    isSimple: (vertices: { x: number; y: number }[]) => boolean
  }
  export default decomp
}
