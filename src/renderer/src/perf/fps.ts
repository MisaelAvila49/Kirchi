export interface FrameStats {
  fps: number
  p95ms: number
}

/** Cuadros por segundo y percentil 95 del tiempo entre cuadros, en una ventana de 1 s. */
export class FpsMeter {
  private times: number[] = []

  frame(t: number): void {
    this.times.push(t)
    const cutoff = t - 1000
    while (this.times.length > 0 && this.times[0] < cutoff) this.times.shift()
  }

  stats(): FrameStats {
    const n = this.times.length
    if (n < 2) return { fps: 0, p95ms: 0 }
    const span = this.times[n - 1] - this.times[0]
    const gaps: number[] = []
    for (let i = 1; i < n; i++) gaps.push(this.times[i] - this.times[i - 1])
    gaps.sort((a, b) => a - b)
    const p95ms = gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.95))]
    return { fps: ((n - 1) * 1000) / span, p95ms }
  }
}
