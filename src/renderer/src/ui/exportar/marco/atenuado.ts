/** Un rectángulo en px de pantalla. */
export interface RectPantalla {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Hasta cuatro rectángulos que cubren la lámina menos el área, para atenuar lo que queda fuera. Sin área, ninguno.
 */
export function fueraDelArea(hoja: RectPantalla, area: RectPantalla | null): RectPantalla[] {
  if (!area) return []
  const x0 = Math.max(hoja.x, area.x)
  const y0 = Math.max(hoja.y, area.y)
  const x1 = Math.min(hoja.x + hoja.w, area.x + area.w)
  const y1 = Math.min(hoja.y + hoja.h, area.y + area.h)
  if (x1 <= x0 || y1 <= y0) return [{ ...hoja }]
  const piezas: RectPantalla[] = [
    { x: hoja.x, y: hoja.y, w: hoja.w, h: y0 - hoja.y },
    { x: hoja.x, y: y1, w: hoja.w, h: hoja.y + hoja.h - y1 },
    { x: hoja.x, y: y0, w: x0 - hoja.x, h: y1 - y0 },
    { x: x1, y: y0, w: hoja.x + hoja.w - x1, h: y1 - y0 }
  ]
  return piezas.filter((p) => p.w > 0 && p.h > 0)
}
