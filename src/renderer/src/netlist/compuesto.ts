import type { ElementoCompuesto, ModeloDef, ValorCompuesto } from '../piezas/tipos'
import type { ElementoMotor } from './netlist'

// Piezas `compuesto`: elementos con nodos que son pines o redes internas. Este módulo no conoce la netlist: traduce un
// elemento y sus valores al del motor y dice qué nodos une por dentro; `netlist.ts` pone las redes y numera.

export type Compuesto = Extract<ModeloDef, { tipo: 'compuesto' }>

/** Los nodos de un elemento, en el orden en que entran al elemento del motor. */
export function nodosDe(e: ElementoCompuesto): string[] {
  switch (e.t) {
    case 'Q':
      return [e.c, e.b, e.e]
    case 'T':
      return [e.a1, e.b1, e.a2, e.b2]
    case 'OA':
      return [e.mas, e.menos, e.sal, e.vmas, e.vmenos]
    default:
      return [e.a, e.b]
  }
}

/** Los nombres de valor de un elemento (los que no son números). */
export function valoresDe(e: ElementoCompuesto): ValorCompuesto[] {
  switch (e.t) {
    case 'R':
      return [e.ohms]
    case 'C':
      return [e.farads]
    case 'L':
      return [e.henries]
    case 'V':
      return [e.volts]
    case 'I':
      return [e.amps]
    case 'senoidal':
      return [e.amp, e.freq, ...(e.fase !== undefined ? [e.fase] : [])]
    case 'D':
      return Object.values(e.params ?? {})
    case 'T':
      return [e.l1, e.n, e.k]
    default:
      return Object.values(e.params)
  }
}

/** El nombre sin el signo «-» de un valor que es un nombre; null si es un número. */
export const nombreDeValor = (v: ValorCompuesto): string | null => (typeof v === 'string' ? (v.startsWith('-') ? v.slice(1) : v) : null)

/** Las propiedades numéricas que lee la pieza: los nombres de valor que no son parámetros de ningún modelo. */
export function propiedadesDeCompuesto(m: Compuesto): string[] {
  const claves = new Set(Object.values(m.modelos ?? {}).flatMap((x) => Object.keys(x)))
  const out = new Set<string>()
  for (const e of m.elementos) for (const v of valoresDe(e)) {
    const n = nombreDeValor(v)
    if (n !== null && !claves.has(n)) out.add(n)
  }
  return [...out]
}

/** Los pares de pines o redes que cada elemento une por dentro (índices de `nodosDe`), como en `gruposDelModelo` de la netlist. */
export function gruposDeElemento(e: ElementoCompuesto): { pines: number[]; tierra: boolean }[] {
  switch (e.t) {
    case 'Q':
      return [{ pines: [0, 1, 2], tierra: false }]
    case 'OA':
      return [{ pines: [0, 1], tierra: false }, { pines: [3, 4], tierra: false }, { pines: [2], tierra: true }]
    // Los dos devanados están aislados: cada uno une sus dos terminales y ninguno une al otro.
    case 'T':
      return [{ pines: [0, 1], tierra: false }, { pines: [2, 3], tierra: false }]
    default:
      return [{ pines: [0, 1], tierra: false }]
  }
}

/** Los pines (índices de `terminales`) unidos por dentro de la pieza, para buscar islas sin camino a tierra. */
export function gruposDeCompuesto(m: Compuesto): { pines: number[]; tierra: boolean }[] {
  const padre = new Map<string, string>()
  const raiz = (x: string): string => {
    const p = padre.get(x) ?? x
    if (p === x) return x
    const r = raiz(p)
    padre.set(x, r)
    return r
  }
  const unir = (a: string, b: string) => padre.set(raiz(a), raiz(b))
  const tierra = new Set<string>()
  for (const e of m.elementos) {
    const nodos = nodosDe(e)
    for (const g of gruposDeElemento(e)) {
      for (const k of g.pines) unir(nodos[g.pines[0]], nodos[k])
      if (g.tierra) tierra.add(nodos[g.pines[0]])
    }
  }
  const tierraRaices = new Set([...tierra].map(raiz))
  const porRaiz = new Map<string, number[]>()
  m.terminales.forEach((t, k) => {
    const r = raiz(t)
    porRaiz.set(r, [...(porRaiz.get(r) ?? []), k])
  })
  return [...porRaiz].map(([r, pines]) => ({ pines, tierra: tierraRaices.has(r) }))
}

/** Un valor: el número, o el parámetro del modelo, o la propiedad de la pieza (con el signo si lo trae). */
export function resolverValor(v: ValorCompuesto, modelo: Record<string, number> | undefined, propiedad: (id: string) => number): number {
  if (typeof v === 'number') return v
  const neg = v.startsWith('-')
  const n = neg ? v.slice(1) : v
  const x = modelo && Object.hasOwn(modelo, n) ? modelo[n] : propiedad(n)
  return neg ? -x : x
}

/** El elemento del motor, con sus nodos (en el orden de `nodosDe`) y sus valores ya resueltos. */
export function elementoDelMotor(e: ElementoCompuesto, n: number[], valor: (v: ValorCompuesto) => number): ElementoMotor {
  const num = (p: Record<string, ValorCompuesto>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, valor(v)]))
  switch (e.t) {
    case 'R':
      return { type: 'R', a: n[0], b: n[1], ohms: valor(e.ohms) }
    case 'C':
      return { type: 'C', a: n[0], b: n[1], farads: valor(e.farads) }
    case 'L':
      return { type: 'L', a: n[0], b: n[1], henries: valor(e.henries) }
    case 'V':
      return { type: 'V', a: n[0], b: n[1], wave: { kind: 'dc', v: valor(e.volts) } }
    case 'I':
      return { type: 'I', a: n[0], b: n[1], amps: valor(e.amps) }
    case 'senoidal': {
      // La fase se escribe en grados y el motor la quiere como fracción del ciclo entre 0 y 1.
      const grados = e.fase === undefined ? 0 : valor(e.fase)
      const fraccion = (((grados / 360) % 1) + 1) % 1
      return { type: 'V', a: n[0], b: n[1], wave: { kind: 'sine', offset: 0, amp: valor(e.amp), freq: valor(e.freq), phase: fraccion } }
    }
    case 'D': {
      const p = num(e.params ?? {})
      return { type: 'D', a: n[0], b: n[1], ...p, is: p.is ?? 1e-14, n: p.n ?? 1 }
    }
    case 'Q':
      return { type: 'Q', c: n[0], b: n[1], e: n[2], pnp: e.pnp === true, model: num(e.params) }
    case 'OA':
      return { type: 'OA', p: n[0], n: n[1], out: n[2], vp: n[3], vn: n[4], model: num(e.params) }
    case 'T': {
      const l1 = valor(e.l1), relacion = valor(e.n)
      return { type: 'XFMR', a1: n[0], b1: n[1], a2: n[2], b2: n[3], l1, l2: l1 / (relacion * relacion), k: valor(e.k) }
    }
  }
}
