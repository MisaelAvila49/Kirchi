/**
 * Color `#rrggbb` con transparencia como `rgba()`, porque el lienzo de la figura y el SVG no tienen `globalAlpha`.
 */
export function conAlfa(color: string, alfa: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color)
  if (!m) return color
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, alfa))})`
}
