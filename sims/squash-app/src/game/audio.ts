/** Short synthesized hits, bounces, and faults. No audio files. */

export type AudioBus = {
  muted: boolean
  resume: () => void
  hit: (shot?: string) => void
  bounce: () => void
  fault: () => void
  score: () => void
}

export function createAudio(): AudioBus {
  let ctx: AudioContext | null = null
  const bus: AudioBus = {
    muted: false,
    resume() {
      if (bus.muted) return
      const c = context()
      if (c.state === 'suspended') void c.resume()
    },
    hit(shot) {
      const f = shot === 'drop' ? 220 : shot === 'lob' ? 280 : shot === 'boast' ? 180 : shot === 'serve' ? 260 : 340
      tone(f, 0.09, 'triangle', 0.08)
      noise(0.04, 0.05)
    },
    bounce() {
      noise(0.03, 0.04)
    },
    fault() {
      tone(140, 0.18, 'sawtooth', 0.05)
    },
    score() {
      tone(523, 0.12, 'triangle', 0.07)
      window.setTimeout(() => tone(659, 0.14, 'triangle', 0.07), 110)
      window.setTimeout(() => tone(784, 0.18, 'triangle', 0.07), 220)
    },
  }

  function context() {
    if (!ctx) ctx = new AudioContext()
    return ctx
  }

  function tone(freq: number, dur: number, type: OscillatorType, gain: number) {
    if (bus.muted) return
    const c = context()
    if (c.state === 'suspended') return
    const t = c.currentTime
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.7), t + dur)
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g)
    g.connect(c.destination)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  function noise(dur: number, gain: number) {
    if (bus.muted) return
    const c = context()
    if (c.state === 'suspended') return
    const n = Math.floor(c.sampleRate * dur)
    const buf = c.createBuffer(1, n, c.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = c.createBufferSource()
    src.buffer = buf
    const g = c.createGain()
    const filter = c.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 400
    g.gain.value = gain
    src.connect(filter)
    filter.connect(g)
    g.connect(c.destination)
    src.start()
  }

  return bus
}
