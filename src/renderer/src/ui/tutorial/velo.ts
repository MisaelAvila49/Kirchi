import type { Rect } from './colocacion'

const seTocan = (a: Rect, b: Rect): boolean => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h

/** Junta los focos que se encilman o se tocan en uno solo (su caja envolvente): con la regla par-impar un hueco encimado volvería a oscurecerse. */
export function unirFocos(focos: readonly Rect[]): Rect[] {
  const out = focos.filter((r) => r.w > 0 && r.h > 0).map((r) => ({ ...r }))
  let cambio = true
  while (cambio) {
    cambio = false
    for (let i = 0; i < out.length && !cambio; i++)
      for (let j = i + 1; j < out.length && !cambio; j++) {
        if (!seTocan(out[i], out[j])) continue
        const x = Math.min(out[i].x, out[j].x), y = Math.min(out[i].y, out[j].y)
        const x2 = Math.max(out[i].x + out[i].w, out[j].x + out[j].w), y2 = Math.max(out[i].y + out[i].h, out[j].y + out[j].h)
        out[i] = { x, y, w: x2 - x, h: y2 - y }
        out.splice(j, 1)
        cambio = true
      }
  }
  return out
}

const num = (n: number): string => String(Math.round(n * 100) / 100)

/** El trazo de un rectángulo de esquinas redondeadas (radio acotado a la mitad del lado menor). */
export function trazoRect(r: Rect, radio: number): string {
  const k = Math.max(0, Math.min(radio, r.w / 2, r.h / 2))
  const x2 = r.x + r.w, y2 = r.y + r.h
  return `M${num(r.x + k)} ${num(r.y)}H${num(x2 - k)}A${num(k)} ${num(k)} 0 0 1 ${num(x2)} ${num(r.y + k)}V${num(y2 - k)}A${num(k)} ${num(k)} 0 0 1 ${num(x2 - k)} ${num(y2)}H${num(r.x + k)}A${num(k)} ${num(k)} 0 0 1 ${num(r.x)} ${num(y2 - k)}V${num(r.y + k)}A${num(k)} ${num(k)} 0 0 1 ${num(r.x + k)} ${num(r.y)}Z`
}

/**
 * Velo: toda la ventana con un hueco por foco (regla par-impar). Los focos se juntan si se encilman. Sin focos, cadena vacía.
 */
export function trazoVelo(ventana: { w: number; h: number }, focos: readonly Rect[], radio = 8): string {
  const huecos = unirFocos(focos)
  if (huecos.length === 0) return ''
  return `M0 0H${num(ventana.w)}V${num(ventana.h)}H0Z` + huecos.map((r) => trazoRect(r, radio)).join('')
}
