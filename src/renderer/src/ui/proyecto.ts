import { instrumentoDe, nombreDeSonda } from '../doc/sondas'
import { normalizar } from '../buscador/buscar'
import { clavePin, porId, type Conexiones } from '../conexiones/conexiones'
import type { Documento, Id, Pieza } from '../doc/tipos'
import { textoDeValor } from '../lienzo/etiquetas'
import { rielesUsados } from '../netlist/alimentaciones'
import { formatearValor } from '../valores/valores'
import { UnionFind } from '../conexiones/unionFind'
import { anotarFuente, diodosDirectos, esTransformador, gruposDelModelo, leerPropiedad, numericasDelModelo, PISTA_TRANSFORMADOR, pinesQueDebenConectarse, terminalesDeAlimentacion, terminalesDelModelo, type PiezasDeFuentes } from '../netlist/netlist'
import { entradasAlAire, entradasTrasContactos, esModeloDigital, familiaDe, hayLogica, salidasATierra, salidasUnidas, textoEntradasTrasContactos } from '../netlist/digital'
import type { PiezaDef } from '../piezas/tipos'
import { CATEGORIAS, nombreCategoria } from './catalogo'
import { tonoDeCategoria, type TonoCategoria } from './colores'
import { avisosDeLosMultimetros } from '../netlist/multimetros'
import { avisosAbsolutosEstaticos } from '../sim/absolutos'
import { conexionesDeRed, ordenRef } from './redes'

export interface EntradaPieza {
  id: Id
  ref: string
  nombre: string
  valor: string
  /** El tipo de la pieza (su símbolo en la ficha). */
  tipo: string
  /** El tono de su categoría (el tinte de la ficha); sin categoría conocida, ninguno. */
  tono?: TonoCategoria
  /** El id de su categoría en la Librería («pasivos»); vacío si la pieza no se conoce (el panel la agrupa en «Otras»). */
  categoria: string
}

export interface EntradaRed {
  red: number
  nombre: string
  conexiones: number
}

/** Algo que impediría simular; `piezas` son las que menciona, para seleccionarlas y centrarlas. */
export interface Aviso {
  texto: string
  piezas: Id[]
  /** No impide simular: una entrada CMOS al aire, una familia que no existe y se simula con la de omisión. */
  leve?: boolean
}

/** Un riel (o nombre con voltaje) que usan los terminales del documento: la sección «Alimentaciones» del panel. */
export interface EntradaAlimentacion {
  nombre: string
  /** El voltaje tal como se escribió («12», «-15»). */
  texto: string
  /** El voltaje leído («12 V»); null si no se lee. */
  lectura: string | null
  /** El voltaje sale del nombre («+15V»): no se edita. */
  deNombre: boolean
  terminales: number
}

export interface VistaProyecto {
  piezas: EntradaPieza[]
  redes: EntradaRed[]
  alimentaciones: EntradaAlimentacion[]
  /** Totales sin filtro, para el encabezado del panel. */
  total: { piezas: number; redes: number }
}

/** Filas que cada lista del panel Proyecto pinta como máximo: acota el DOM y las paradas de tabulador. */
export const MAX_FILAS = 200

/** Las primeras `max` filas y cuántas quedaron fuera. */
export function recortar<T>(filas: T[], max = MAX_FILAS): { filas: T[]; resto: number } {
  return filas.length <= max ? { filas, resto: 0 } : { filas: filas.slice(0, max), resto: filas.length - max }
}

/**
 * Identidad estable para las filas de una lista: si la entrada nueva de una clave es igual a la anterior (`igual`), devuelve el MISMO objeto para que `For` conserve su elemento y su foco.
 */
export function reutilizar<K, T>(previas: Map<K, T>, nuevas: T[], clave: (t: T) => K, igual: (a: T, b: T) => boolean): T[] {
  const sig = new Map<K, T>()
  const salida = nuevas.map((n) => {
    const k = clave(n)
    const p = previas.get(k)
    const t = p !== undefined && igual(p, n) ? p : n
    sig.set(k, t)
    return t
  })
  previas.clear()
  for (const [k, t] of sig) previas.set(k, t)
  return salida
}

/** «1 pieza», «4 piezas», con separador de miles. */
export const plural = (n: number, uno: string, varios: string): string => `${n.toLocaleString('es-MX')} ${n === 1 ? uno : varios}`

/** Lo que se muestra junto a la referencia: el valor numérico, si no la primera opción (abierto, rojo), si no el nombre. */
export function resumenValor(p: Pieza, def: PiezaDef | undefined, doc?: Pick<Documento, 'alimentaciones'>): string {
  if (!def) return 'desconocida'
  const v = textoDeValor(p, def, doc)
  // Con una propiedad de texto (el nombre de un terminal) se antepone: «VCC, 5 V».
  const nombre = def.props.find((d) => d.texto)
  const texto = nombre ? (p.props[nombre.id] ?? nombre.defecto).trim() : ''
  if (v) return texto ? `${texto}, ${v}` : v
  // Un terminal con un nombre que ya es un voltaje («+15V») no repite el voltaje.
  if (texto) return texto
  const op = def.props.find((d) => d.opciones)
  return op ? (p.props[op.id] ?? op.defecto) : def.nombre.es
}

export { ordenRef }

/** «a», «a y b», «a, b y c». */
export function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes.join('')
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/** Referencias que un aviso lista antes de resumir el resto como «y N más». */
export const REFS_EN_AVISO = 3

/**
 * Referencias de una isla en orden natural, con tope: «R1, R2, R3 y 4,997 más». Con una más que el tope se listan todas. Elige las menores en un recorrido, sin ordenar toda la lista.
 */
export function referenciasCortas(refs: string[]): string {
  if (refs.length <= REFS_EN_AVISO + 1) return enumerar([...refs].sort(ordenRef))
  const menores: string[] = []
  for (const r of refs) {
    let i = menores.length
    while (i > 0 && ordenRef(menores[i - 1], r) > 0) i--
    if (i < REFS_EN_AVISO) {
      menores.splice(i, 0, r)
      if (menores.length > REFS_EN_AVISO) menores.pop()
    }
  }
  return `${menores.join(', ')} y ${(refs.length - REFS_EN_AVISO).toLocaleString('es-MX')} más`
}

/**
 * Lo que impediría simular, cada clase por su cuenta para que una no oculte a las otras (no pasa por `compilarNetlist`, que se detiene en el primer problema). Se calcula aparte de `vistaProyecto` y la ventana la memoiza por conexiones, solo mientras algo la muestra.
 */
export function avisosDelCircuito(doc: Documento, con: Conexiones, lib: Map<string, PiezaDef>): Aviso[] {
  const piezas = Object.values(doc.piezas).sort(porId)
  if (piezas.length === 0) return []
  const avisos: Aviso[] = []
  // Un solo recorrido separa las piezas con modelo y anota las que importan al diagnóstico de fuentes.
  const fuentes: PiezasDeFuentes = { diodos: [], fuentes: [], terminales: [] }
  const modeladas: Pieza[] = []
  const multimetros: Pieza[] = []
  for (const p of piezas) {
    const m = lib.get(p.tipo)?.modelo
    if (!m) continue
    modeladas.push(p)
    if (m.tipo === 'multimetro') multimetros.push(p)
    anotarFuente(fuentes, p, m)
  }

  for (const p of piezas) if (!lib.get(p.tipo)?.modelo) avisos.push({ texto: `${p.ref} todavía no tiene modelo eléctrico.`, piezas: [p.id] })

  // Las piezas digitales: su familia y su alimentación (las mismas oraciones que la netlist).
  for (const p of modeladas) {
    const def = lib.get(p.tipo)!
    const m = def.modelo
    if (!esModeloDigital(m)) continue
    const f = familiaDe(p, def, m)
    if (!f.ok) avisos.push({ texto: f.error, piezas: [p.id] })
    else if (f.aviso) avisos.push({ texto: f.aviso, piezas: [p.id], leve: true })
  }

  // Las mismas oraciones que da el netlist al compilar: la primera propiedad que falla de cada pieza.
  for (const p of modeladas) {
    const def = lib.get(p.tipo)!
    for (const q of numericasDelModelo(def.modelo!)) {
      const r = leerPropiedad(p, def, q.prop, q.positiva)
      if (!r.ok) {
        avisos.push({ texto: r.error, piezas: [p.id] })
        break
      }
    }
  }

  // Un circuito solo digital no necesita tierra.
  const soloDigital = piezas.every((p) => esModeloDigital(lib.get(p.tipo)?.modelo))
  if (!soloDigital && !con.redes.some((r) => r.tierra)) avisos.push({ texto: 'Falta una tierra.', piezas: [] })

  for (const p of modeladas) {
    const def = lib.get(p.tipo)!
    const m = def.modelo!
    for (const id of pinesQueDebenConectarse(m)) {
      const red = con.redes[con.redDePin.get(clavePin(p.id, id)) ?? -1]
      if (red && red.pines.length === 1 && !red.tierra) avisos.push({ texto: `El pin ${def.pines.find((x) => x.id === id)?.nombre ?? id} de ${p.ref} no está conectado a nada.`, piezas: [p.id] })
    }
  }

  avisos.push(...terminalesDeAlimentacion(doc, lib, con, fuentes).conflictos, ...diodosDirectos(doc, lib, con, fuentes))
  // Los máximos de la hoja de datos que los voltajes fijos del circuito ya pasan (un amp-op con 50 V de alimentación).
  avisos.push(...avisosAbsolutosEstaticos(doc, lib, con, modeladas))
  // Sin piezas digitales ni 555 no se busca nada digital: los avisos de un circuito analógico no pagan por el motor.
  const logica = hayLogica(piezas, lib)
  if (logica) avisos.push(...salidasUnidas(doc, lib, con), ...salidasATierra(doc, lib, con))

  // Islas: piezas con modelo cuyas redes no llegan a la tierra a través de otras piezas.
  if (con.redes.some((r) => r.tierra)) {
    const uf = new UnionFind<number>()
    const tierra = -1
    for (const r of con.redes) if (r.tierra) uf.unir(r.id, tierra)
    const extremos: { p: Pieza; red: number }[] = []
    for (const p of modeladas) {
      const m = lib.get(p.tipo)!.modelo!
      const redes = terminalesDelModelo(m).map((id) => con.redDePin.get(clavePin(p.id, id)))
      if (redes.length === 0 || redes.some((r) => r === undefined)) continue
      // Un terminal de alimentación es una fuente contra tierra: su red llega a ella.
      if (m.tipo === 'alimentacion') {
        uf.unir(redes[0]!, tierra)
        continue
      }
      // Los pines unidos por dentro de la pieza (un amplificador no une sus entradas con sus alimentaciones).
      for (const g of gruposDelModelo(m)) {
        // Sin arreglos nuevos por pieza: con 5,000 resistencias cada uno cuesta cerca de 1 ms por recorrido.
        const r0 = redes[g.pines[0]]!
        for (const k of g.pines) uf.unir(r0, redes[k]!)
        if (g.tierra) uf.unir(r0, tierra)
        extremos.push({ p, red: r0 })
      }
    }
    const islas = new Map<number, Pieza[]>()
    for (const { p, red } of extremos) {
      const raiz = uf.buscar(red)
      if (raiz === uf.buscar(tierra)) continue
      const isla = islas.get(raiz)
      // Los extremos de una pieza van seguidos: si ya entró a esta isla, es la última (sin buscarla en toda la isla).
      if (!isla) islas.set(raiz, [p])
      else if (isla[isla.length - 1] !== p) isla.push(p)
    }
    for (const ps of islas.values()) {
      const refs = referenciasCortas(ps.map((p) => p.ref))
      const pista = ps.some((p) => esTransformador(lib.get(p.tipo))) ? ` ${PISTA_TRANSFORMADOR}` : ''
      avisos.push({ texto: (ps.length === 1 ? `${refs} no tiene camino a tierra.` : `${refs} no tienen camino a tierra.`) + pista, piezas: ps.map((p) => p.id) })
    }
  }
  // Lo que no impide simular va al final.
  if (logica) for (const { texto, piezas } of entradasAlAire(doc, lib, con)) avisos.push({ texto, piezas, leve: true })
  if (logica) for (const t of entradasTrasContactos(doc, lib, con)) avisos.push({ texto: textoEntradasTrasContactos([t])!, piezas: t.piezas, leve: true })
  avisos.push(...avisosDeSondas(doc, con))
  for (const a of avisosDeLosMultimetros(multimetros, doc, lib, con)) avisos.push({ ...a, leve: true })
  return avisos
}

/** Las sondas que no miden: las que no tocan nada y las de una entrada que además tiene un cable. No impiden simular. */
function avisosDeSondas(doc: Documento, con: Conexiones): Aviso[] {
  const out: Aviso[] = []
  for (const s of Object.values(doc.sondas ?? {}).sort(porId)) {
    const inst = instrumentoDe(doc, s)
    const n = nombreDeSonda(s, inst?.ref)
    const sujeto = n.charAt(0).toUpperCase() + n.slice(1)
    const piezas = inst ? [inst.id] : []
    if (!con.redDeSonda.has(s.id)) out.push({ texto: `${sujeto} no toca ningún cable ni pin: no mide nada.`, piezas, leve: true })
    else if (con.sondasSinUnir.includes(s.id)) out.push({ texto: `${sujeto} no mide: su entrada también tiene un cable.`, piezas, leve: true })
  }
  return out
}

/** Panel Proyecto: piezas con su valor y redes con sus conexiones (los avisos, aparte); `filtro` acota piezas y redes. */
export function vistaProyecto(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, nombres: Map<number, string>, filtro = ''): VistaProyecto {
  const f = normalizar(filtro)
  const pasa = (...textos: string[]) => !f || normalizar(textos.join(' ')).includes(f)
  const todas = Object.values(doc.piezas)
    .map((p) => {
      const def = lib.get(p.tipo)
      const tono = def ? tonoDeCategoria(def.categoria) : undefined
      return { id: p.id, ref: p.ref, nombre: def?.nombre.es ?? p.tipo, valor: resumenValor(p, def, doc), tipo: p.tipo, categoria: def?.categoria ?? '', ...(tono ? { tono } : {}) }
    })
    .sort((a, b) => ordenRef(a.ref, b.ref))
  // `nombres` está en el orden de listado: tierra, con etiqueta y luego las numeradas.
  const visibles = [...nombres].map(([id, nombre]) => ({ red: id, nombre, conexiones: conexionesDeRed(con.redes[id]) }))
  const alimentaciones = rielesUsados(doc, lib).map((r) => ({
    nombre: r.nombre, texto: r.texto, lectura: r.valor === null ? null : formatearValor(r.valor, 'V'), deNombre: r.deNombre, terminales: r.terminales.length
  }))
  return {
    alimentaciones,
    piezas: todas.filter((p) => pasa(p.ref, p.nombre, p.valor)),
    redes: visibles.filter((r) => pasa(r.nombre)),
    total: { piezas: todas.length, redes: visibles.length }
  }
}

/** Si la lista de piezas del panel Proyecto se muestra: abierta, o plegada pero con un filtro escrito, porque quien filtra quiere ver lo que coincide. */
export const piezasVisibles = (plegadas: boolean, filtro: string): boolean => !plegadas || filtro.trim() !== ''

/** Un grupo de piezas del panel Proyecto: una categoría de la Librería con sus filas y cuántas piezas la forman. */
export interface GrupoPiezas {
  id: string
  nombre: string
  tono?: TonoCategoria
  /** Las filas que se pintan (pueden estar recortadas). */
  piezas: EntradaPieza[]
  /** Cuántas piezas coinciden con el filtro en esa categoría, recortadas o no. */
  total: number
}

/** Id del grupo de las piezas cuyo tipo la Librería no conoce. */
export const CATEGORIA_OTRAS = 'otras'

/**
 * Piezas agrupadas por categoría en el orden de la Librería; las desconocidas en «Otras». `filas` son las que se pintan y `todas` las que coinciden con el filtro, para la cuenta del grupo.
 */
export function agruparPiezas(filas: readonly EntradaPieza[], todas: readonly EntradaPieza[]): GrupoPiezas[] {
  const id = (p: EntradaPieza) => (CATEGORIAS.some(([c]) => c === p.categoria) || p.categoria ? p.categoria : CATEGORIA_OTRAS)
  const totales = new Map<string, number>()
  for (const p of todas) totales.set(id(p), (totales.get(id(p)) ?? 0) + 1)
  const grupos = new Map<string, GrupoPiezas>()
  for (const p of filas) {
    const g = id(p)
    let x = grupos.get(g)
    if (!x) grupos.set(g, (x = { id: g, nombre: g === CATEGORIA_OTRAS ? 'Otras' : nombreCategoria(g), ...(p.tono ? { tono: p.tono } : {}), piezas: [], total: totales.get(g) ?? 0 }))
    x.piezas.push(p)
  }
  const rango = (g: string) => {
    if (g === CATEGORIA_OTRAS) return CATEGORIAS.length + 1
    const i = CATEGORIAS.findIndex(([c]) => c === g)
    return i < 0 ? CATEGORIAS.length : i
  }
  return [...grupos.values()].sort((a, b) => rango(a.id) - rango(b.id) || a.nombre.localeCompare(b.nombre, 'es'))
}
