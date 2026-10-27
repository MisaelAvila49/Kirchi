import type { GraficoResultado, VectorResultado } from '../ngspice'

/** Dos frecuencias a menos de esta razón relativa son la misma: la exacta pedida reemplaza a la de la rejilla. */
const TOLERANCIA = 1e-9

/** Une en un solo gráfico los `grupo` gráficos consecutivos de un barrido de CA con frecuencias incluidas (el primero es la
 * rejilla y los demás, un punto exacto cada uno), ordenados por frecuencia. Si la rejilla ya tiene un punto en la misma
 * frecuencia, queda el exacto. Un gráfico que no concuerda con los demás (otros vectores) deja el grupo sin unir. */
export function unirBarridosAc(graficos: GraficoResultado[], grupo: number): GraficoResultado[] {
  if (grupo <= 1) return graficos
  const salida: GraficoResultado[] = []
  for (let i = 0; i < graficos.length; i += grupo) {
    const g = graficos.slice(i, i + grupo)
    salida.push(g.length === grupo ? (unir(g) ?? g[0]) : g[0])
  }
  return salida
}

function unir(g: GraficoResultado[]): GraficoResultado | null {
  const base = g[0]
  const escala = base.vectores.findIndex((v) => v.referencia.tipo === 'escala')
  if (escala < 0) return null
  for (const otro of g) {
    if (otro.vectores.length !== base.vectores.length || otro.vectores[escala]?.referencia.tipo !== 'escala') return null
    if (otro.vectores.some((v, k) => v.nombre !== base.vectores[k].nombre)) return null
  }
  // (gráfico, índice) de cada punto, ordenados por frecuencia.
  const puntos: { f: number; g: number; k: number }[] = []
  g.forEach((x, gi) => {
    const f = x.vectores[escala].re
    for (let k = 0; k < x.puntos; k++) puntos.push({ f: f[k], g: gi, k })
  })
  puntos.sort((a, b) => a.f - b.f || a.g - b.g)
  const elegidos: typeof puntos = []
  for (const p of puntos) {
    const ultimo = elegidos[elegidos.length - 1]
    if (ultimo && Math.abs(p.f - ultimo.f) <= TOLERANCIA * Math.abs(ultimo.f)) elegidos[elegidos.length - 1] = p.g > ultimo.g ? p : ultimo
    else elegidos.push(p)
  }
  const n = elegidos.length
  const vectores = base.vectores.map((v, j): VectorResultado => {
    const re = new Float64Array(n)
    const im = v.im ? new Float64Array(n) : null
    elegidos.forEach((p, t) => {
      const o = g[p.g].vectores[j]
      re[t] = o.re[p.k]
      if (im && o.im) im[t] = o.im[p.k]
    })
    return { ...v, re, im }
  })
  return { ...base, puntos: n, vectores }
}
