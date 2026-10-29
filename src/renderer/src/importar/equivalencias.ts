import type { PiezaDef } from '../piezas/tipos'
import type { FormatoAjeno, PiezaAjena } from './ajeno'
import { claseDe, FAMILIAS } from './familias'

export type Equivalencia =
  | { tipo: 'exacta'; pieza: string; props: Record<string, string> }
  | { tipo: 'aproximada'; pieza: string; props: Record<string, string>; motivo: string }
  | { tipo: 'ninguna' }

interface Entrada {
  pieza: string
  props: Record<string, string>
  /** Viene de la fila de un modelo concreto, no de la pieza en general. */
  especifica: boolean
}

export interface IndiceEquivalencias {
  /** `formato\0tipo normalizado` → piezas que lo declaran. */
  porTipo: Map<string, Entrada[]>
  /** Nombre de modelo normalizado → piezas que lo ofrecen como opción de `modelo`. */
  modelos: Map<string, { pieza: string; opcion: string }[]>
}

const FORMATOS = ['kicad', 'ltspice', 'falstad', 'proteus'] as const
const GENERICOS = new Set(['IDEAL', 'GENERICO'])

/** Falstad distingue mayúsculas en sus códigos; los demás formatos no. */
function llave(formato: string, tipo: string): string {
  const t = tipo.trim().replace(/\\/g, '/')
  return `${formato}\0${formato === 'falstad' ? t : t.toLowerCase()}`
}

function lista(v: string | string[] | undefined): string[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v]
}

function propsDeClave(def: PiezaDef, clave: string): Record<string, string> {
  const por = def.datos?.por
  if (por === undefined || clave === '*') return {}
  if (typeof por === 'string') return { [por]: clave }
  const partes = clave.split('|')
  return { [por[0]]: partes[0], [por[1]]: partes[1] }
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Opciones del prop `modelo` de una pieza, si lo tiene. */
function opcionesDeModelo(def: PiezaDef): string[] | undefined {
  return def.props.find((p) => p.id === 'modelo')?.opciones
}

export function indiceDeEquivalencias(lib: ReadonlyMap<string, PiezaDef>): IndiceEquivalencias {
  const porTipo = new Map<string, Entrada[]>()
  const modelos = new Map<string, { pieza: string; opcion: string }[]>()
  const anota = (formato: string, nombre: string, e: Entrada) => {
    const k = llave(formato, nombre)
    const a = porTipo.get(k)
    if (a) a.push(e)
    else porTipo.set(k, [e])
  }
  for (const [id, def] of lib) {
    const d = def.datos
    if (d) {
      for (const f of FORMATOS) for (const n of lista(d.equivalencias?.[f])) anota(f, n, { pieza: id, props: {}, especifica: false })
      for (const [clave, fila] of Object.entries(d.valores)) {
        const props = propsDeClave(def, clave)
        for (const f of FORMATOS) for (const n of lista(fila.equivalencias?.[f])) anota(f, n, { pieza: id, props, especifica: true })
      }
    }
    for (const opcion of opcionesDeModelo(def) ?? []) {
      const k = sinAcentos(opcion).toUpperCase()
      if (GENERICOS.has(k)) continue
      const a = modelos.get(k)
      if (a) a.push({ pieza: id, opcion })
      else modelos.set(k, [{ pieza: id, opcion }])
    }
  }
  return { porTipo, modelos }
}

/** Variantes de un nombre de modelo ajeno: tal cual, sin encapsulado (TL081CP → TL081) y sin prefijo de fabricante (LM7805 → 7805). */
function variantes(modelo: string): string[] {
  const base = sinAcentos(modelo).toUpperCase().replace(/\s+/g, '').split('/')[0].replace(/#.*$/, '')
  const sinSufijo = base.replace(/(?<=\d)[A-Z]{1,3}$/, '')
  return [...new Set([base, sinSufijo])].filter(Boolean)
}

const sinPrefijo = (s: string) => s.replace(/^(LM|MC|UA|KA|L)(?=\d)/, '')

/** La opción de `opciones` que nombra el modelo ajeno, si hay una; primero por nombre completo y luego sin prefijo de fabricante. */
function opcionQueCoincide(modelo: string, opciones: string[]): string | undefined {
  const vs = variantes(modelo)
  const norm = (o: string) => sinAcentos(o).toUpperCase().replace(/\s+/g, '')
  for (const v of vs) {
    const o = opciones.find((x) => norm(x) === v)
    if (o) return o
  }
  for (const v of vs) {
    const o = opciones.find((x) => sinPrefijo(norm(x)) === sinPrefijo(v))
    if (o) return o
  }
  return undefined
}

/** Resuelve la pieza elegida contra el modelo que trae el origen: exacta si lo ofrece o si la pieza no tiene modelos. */
function conModelo(lib: ReadonlyMap<string, PiezaDef>, pieza: string, base: Record<string, string>, ajeno: string | undefined): Equivalencia {
  const def = lib.get(pieza)
  const opciones = def ? opcionesDeModelo(def) : undefined
  if (!def || !opciones || !ajeno?.trim()) return { tipo: 'exacta', pieza, props: base }
  const opcion = opcionQueCoincide(ajeno, opciones)
  if (opcion) return { tipo: 'exacta', pieza, props: { ...base, modelo: opcion } }
  const usado = base.modelo ?? def.props.find((p) => p.id === 'modelo')?.defecto ?? opciones[0]
  return { tipo: 'aproximada', pieza, props: { ...base, modelo: usado }, motivo: `${ajeno.trim()} no está en Kirchi: se usa el ${usado}.` }
}

/** Familia lógica que dice el nombre de un circuito integrado (`74HC595` es 74HC; `74595` y `74LS595` son 74LS). */
function familiaLogica(tipo: string): string | null {
  const m = /74(HCT?|LS|ALS|F|S)?\d/i.exec(tipo)
  if (!m) return null
  return /^HC/i.test(m[1] ?? '') ? '74HC' : '74LS'
}

export function buscarEquivalencia(indice: IndiceEquivalencias, lib: ReadonlyMap<string, PiezaDef>, formato: FormatoAjeno, p: PiezaAjena): Equivalencia {
  const clase = claseDe(formato, p)
  const modeloAjeno = p.modelo ?? p.valor

  // 1. Lo que cada pieza declara para este formato (SPICE no tiene columna).
  if (formato !== 'spice') {
    let entradas = indice.porTipo.get(llave(formato, p.tipo))
    if (entradas && clase) {
      const deLaClase = entradas.filter((e) => e.pieza === FAMILIAS[clase].pieza)
      if (deLaClase.length) entradas = deLaClase
    }
    if (entradas?.length) {
      const e = entradas.find((x) => x.especifica) ?? entradas[0]
      return e.especifica ? { tipo: 'exacta', pieza: e.pieza, props: e.props } : conModelo(lib, e.pieza, e.props, modeloAjeno)
    }
  }

  // 2. El tipo o el modelo ajeno es el nombre de un modelo que Kirchi ofrece (TL081, 7805).
  for (const nombre of [p.tipo.split(':').pop() ?? p.tipo, p.modelo]) {
    if (!nombre) continue
    const hallados = new Map<string, { pieza: string; opcion: string }>()
    for (const v of variantes(nombre)) for (const h of indice.modelos.get(v) ?? []) hallados.set(h.pieza, h)
    if (hallados.size === 1) {
      const h = [...hallados.values()][0]
      return { tipo: 'exacta', pieza: h.pieza, props: { modelo: h.opcion } }
    }
  }

  // 3. Familia de la clase, con el modelo más cercano.
  if (clase) {
    const f = FAMILIAS[clase]
    const def = lib.get(f.pieza)
    if (def) {
      const props = { ...f.props }
      const logica = f.props?.familia === undefined ? familiaLogica(p.tipo) : null
      if (logica && def.props.find((d) => d.id === 'familia')?.opciones?.includes(logica)) props.familia = logica
      const e = conModelo(lib, f.pieza, props, modeloAjeno)
      return f.aproximada && e.tipo === 'exacta' ? { tipo: 'aproximada', pieza: e.pieza, props: e.props, motivo: f.aproximada } : e
    }
  }
  return { tipo: 'ninguna' }
}
