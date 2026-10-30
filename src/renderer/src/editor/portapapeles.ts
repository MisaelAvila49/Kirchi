import { crear, juntar, modificar, type Comando } from '../doc/comandos'
import { ordenesAlFrente, porOrden } from '../doc/figuras'
import type { GeneradorId } from '../doc/ids'
import type { Cable, Documento, Etiqueta, Figura, Nota, Pieza, Punto, Sonda } from '../doc/tipos'
import { paqueteDe, refDe } from '../doc/paquetes'
import { siguienteReferenciaMedidor } from '../doc/referencias'
import { esDeInstrumento, sondaDeEntrada } from '../doc/sondas'
import { enTramo } from '../conexiones/anclas'
import { pinesEnMundo } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'
import { claveDeNombre, voltajeDeNombre } from '../conexiones/nombres'
import { PASO_REJILLA } from './rutas'
import { seleccionVacia, type Seleccion } from './seleccion'

export interface Fragmento {
  origen: Punto
  piezas: Pieza[]
  cables: Cable[]
  etiquetas: Etiqueta[]
  notas: Nota[]
  figuras: Figura[]
  /** Sondas que viajan: las de un instrumento (en la selección o no) y las de voltaje, corriente o medidor, si lo que
   * tocan va también. Opcional: un fragmento viejo no las trae. */
  sondas?: Sonda[]
}

const abajo = (v: number) => Math.floor(v / PASO_REJILLA) * PASO_REJILLA + 0

/** Sondas que van con lo seleccionado: la elegida misma, o la que cae sobre un cable o pin (con `lib`) que también va.
 * Una etiqueta sola no se lleva la sonda de su punto. Una de instrumento cuyo instrumento no va también viaja: al pegar
 * se intenta unirla al original. */
function sondasQueViajan(doc: Documento, sel: Seleccion, piezas: Pieza[], cables: Cable[], lib?: Map<string, PiezaDef>): Sonda[] {
  const todas = Object.values(doc.sondas ?? {})
  if (todas.length === 0) return []
  const pines = new Set<string>()
  if (lib) for (const p of piezas) { const def = lib.get(p.tipo); if (def) for (const q of pinesEnMundo(p, def)) pines.add(`${q.x},${q.y}`) }
  const toca = (s: Sonda) =>
    pines.has(`${s.x},${s.y}`) || cables.some((c) => c.puntos.some((q, i) => i > 0 && enTramo(c.puntos[i - 1], q, s.x, s.y)))
  return todas.filter((s) => (!esDeInstrumento(s) || doc.piezas[s.instrumento] !== undefined) && (sel.sondas.has(s.id) || toca(s)))
}

export function copiar(doc: Documento, sel: Seleccion, lib?: Map<string, PiezaDef>): Fragmento | null {
  const piezas = [...sel.piezas].map((id) => doc.piezas[id]).filter(Boolean)
  const cables = [...sel.cables].map((id) => doc.cables[id]).filter(Boolean)
  const etiquetas = [...sel.etiquetas].map((id) => doc.etiquetas[id]).filter(Boolean)
  const notas = [...sel.notas].map((id) => doc.notas[id]).filter(Boolean)
  const figuras = [...sel.figuras].map((id) => doc.figuras?.[id]).filter((f): f is Figura => !!f)
  const elegidas = [...sel.sondas].map((id) => doc.sondas?.[id]).filter((x): x is Sonda => !!x)
  const anclas: Punto[] = [...piezas, ...etiquetas, ...notas, ...elegidas, ...cables.flatMap((c) => c.puntos), ...figuras.flatMap((f) => [{ x: f.x1, y: f.y1 }, { x: f.x2, y: f.y2 }])]
  if (anclas.length === 0) return null
  let minX = Infinity, minY = Infinity
  for (const p of anclas) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
  }
  const ox = abajo(minX)
  const oy = abajo(minY)
  const sondas = sondasQueViajan(doc, sel, piezas, cables, lib)
  return {
    origen: { x: ox, y: oy },
    piezas: piezas.map((p) => ({ ...p, x: p.x - ox, y: p.y - oy, props: { ...p.props } })),
    cables: cables.map((c) => ({ ...c, puntos: c.puntos.map((pt) => ({ x: pt.x - ox, y: pt.y - oy })) })),
    etiquetas: etiquetas.map((e) => ({ ...e, x: e.x - ox, y: e.y - oy })),
    notas: notas.map((n) => ({ ...n, x: n.x - ox, y: n.y - oy })),
    figuras: figuras.map((f) => ({ ...f, x1: f.x1 - ox, y1: f.y1 - oy, x2: f.x2 - ox, y2: f.y2 - oy })),
    ...(sondas.length ? { sondas: sondas.map((s) => ({ ...s, x: s.x - ox, y: s.y - oy })) } : {})
  }
}

/** Mayor número de referencia por prefijo (R12 → R: 12), igual que `siguienteReferencia` pero en un solo recorrido. */
function mayoresPorPrefijo(doc: Documento): Map<string, number> {
  const max = new Map<string, number>()
  for (const p of Object.values(doc.piezas)) {
    // El paquete de una unidad (U1 de U1B) también ocupa su número.
    for (const t of [p.ref, p.props.paquete]) {
      const m = t === undefined ? null : /^(.*?)(\d+)$/.exec(t)
      if (m) max.set(m[1], Math.max(max.get(m[1]) ?? 0, Number(m[2])))
    }
  }
  return max
}

/** Nombres de red que nunca se renombran: alimentación (VCC, VDD, VEE, GND, 0, voltajes como +15V). */
const NOMBRES_COMPARTIDOS = new Set(['VCC', 'VDD', 'VEE', 'GND', '0'])
const esCompartido = (nombre: string): boolean => voltajeDeNombre(nombre) !== null || NOMBRES_COMPARTIDOS.has(claveDeNombre(nombre).toUpperCase())

/** Nombres nuevos para las etiquetas del fragmento cuyo nombre ya existe (Entrada → Entrada2). Las de un mismo nombre
 * reciben el mismo nuevo. Mapa de llave vieja a nombre nuevo. */
function renombresDeRedes(doc: Documento, f: Fragmento): Map<string, string> {
  const usadas = new Set(Object.values(doc.etiquetas).map((e) => claveDeNombre(e.nombre)))
  // Los nombres del propio fragmento también están ocupados: Entrada no puede pasar a Entrada2 si el fragmento ya trae Entrada2.
  const reservadas = new Set(usadas)
  for (const e of f.etiquetas) reservadas.add(claveDeNombre(e.nombre))
  const mapa = new Map<string, string>()
  for (const e of f.etiquetas) {
    const k = claveDeNombre(e.nombre)
    if (mapa.has(k) || esCompartido(e.nombre) || !usadas.has(k)) continue
    const base = e.nombre.trim().replace(/\d+$/, '')
    let n = 2
    while (reservadas.has(claveDeNombre(`${base}${n}`))) n++
    const nuevo = `${base}${n}`
    reservadas.add(claveDeNombre(nuevo))
    mapa.set(k, nuevo)
  }
  return mapa
}

/** `renombrarRedes`: plantillas y circuitos generados traen redes con nombre (Entrada, Salida) que no deben unirse al
 * colocarlos dos veces. Copiar y pegar a mano conserva los nombres (unir redes a propósito). */
export function pegar(doc: Documento, lib: Map<string, PiezaDef>, f: Fragmento, en: Punto, gen: GeneradorId, renombrarRedes = false): { cmd: Comando; seleccion: Seleccion; renombradas: [string, string][]; sinCanal: number } {
  const renombres = renombrarRedes ? renombresDeRedes(doc, f) : new Map<string, string>()
  const cmds: Comando[] = []
  const seleccion = seleccionVacia()
  // Un solo recorrido del documento: el mayor número usado por prefijo; luego se cuenta hacia arriba.
  const siguiente = mayoresPorPrefijo(doc)
  const nuevoId = new Map<string, string>()
  // Las unidades de un mismo paquete van juntas a un paquete nuevo y conservan sus letras.
  const paquetes = new Map<string, string>()
  for (const p of f.piezas) {
    // Como Proteus: la referencia sigue con su propio prefijo (una cambiada a mano, RL1, da RL2); sin número, el de la pieza.
    const prefijo = /^(\D+)\d+$/.exec(p.ref)?.[1] ?? lib.get(p.tipo)?.prefijo
    let ref = p.ref
    const pq = paqueteDe(p)
    if (pq) {
      let nuevo = paquetes.get(pq.paquete)
      if (!nuevo) {
        const pref = /^(\D+)\d+$/.exec(pq.paquete)?.[1] ?? lib.get(p.tipo)?.prefijo ?? 'U'
        const n = (siguiente.get(pref) ?? 0) + 1
        siguiente.set(pref, n)
        nuevo = `${pref}${n}`
        paquetes.set(pq.paquete, nuevo)
      }
      ref = refDe(nuevo, pq.unidad)
    } else if (prefijo) {
      const n = (siguiente.get(prefijo) ?? 0) + 1
      siguiente.set(prefijo, n)
      ref = `${prefijo}${n}`
    }
    const nueva: Pieza = { ...p, id: gen('p'), x: p.x + en.x, y: p.y + en.y, props: { ...p.props, ...(pq ? { paquete: paquetes.get(pq.paquete)! } : {}) }, ref }
    nuevoId.set(p.id, nueva.id)
    cmds.push(crear('pegar', 'piezas', nueva))
    seleccion.piezas.add(nueva.id)
  }
  for (const c of f.cables) {
    const nuevo: Cable = { id: gen('c'), puntos: c.puntos.map((pt) => ({ x: pt.x + en.x, y: pt.y + en.y })) }
    cmds.push(crear('pegar', 'cables', nuevo))
    seleccion.cables.add(nuevo.id)
  }
  for (const e of f.etiquetas) {
    const nueva: Etiqueta = { ...e, id: gen('e'), x: e.x + en.x, y: e.y + en.y, nombre: renombres.get(claveDeNombre(e.nombre)) ?? e.nombre }
    cmds.push(crear('pegar', 'etiquetas', nueva))
    seleccion.etiquetas.add(nueva.id)
  }
  for (const n of f.notas) {
    const nueva: Nota = { ...n, id: gen('n'), x: n.x + en.x, y: n.y + en.y }
    cmds.push(crear('pegar', 'notas', nueva))
    seleccion.notas.add(nueva.id)
  }
  // Las sondas de un instrumento pegado miden en la copia. Si el instrumento no se pegó, la copia se une al original solo
  // si su canal está libre; si no, se descarta y se cuenta.
  const pegadas: Record<string, Sonda> = {}
  let sinCanal = 0
  for (const s of f.sondas ?? []) {
    let instrumento = s.instrumento === undefined ? undefined : nuevoId.get(s.instrumento)
    if (esDeInstrumento(s) && instrumento === undefined) {
      const libre = doc.piezas[s.instrumento] !== undefined && !sondaDeEntrada(doc, s.instrumento, s.entrada) && !Object.values(pegadas).some((q) => q.instrumento === s.instrumento && q.entrada === s.entrada)
      if (!libre) { sinCanal++; continue }
      instrumento = s.instrumento
    }
    const nueva: Sonda = { ...s, id: gen('s'), x: s.x + en.x, y: s.y + en.y, ...(instrumento !== undefined ? { instrumento } : {}) }
    // La referencia de un medidor no se repite: la copia toma la siguiente libre (contando las que ya se pegaron).
    if (nueva.tipo === 'medidor') nueva.ref = siguienteReferenciaMedidor({ ...doc, sondas: { ...doc.sondas, ...pegadas } })
    pegadas[nueva.id] = nueva
    cmds.push(crear('pegar', 'sondas', nueva))
    seleccion.sondas.add(nueva.id)
  }
  // Las figuras pegadas van al frente de las que hay, en el orden que tenían entre ellas (si se pasaría del límite del
  // archivo, las que hay se renumeran en el mismo paso).
  const alFrente = ordenesAlFrente(doc, f.figuras.length)
  for (const r of alFrente.renumeradas) cmds.push(modificar('pegar', 'figuras', doc.figuras![r.id], r))
  let orden = alFrente.primero
  for (const fig of [...f.figuras].sort(porOrden)) {
    const nueva: Figura = { ...fig, id: gen('f'), x1: fig.x1 + en.x, y1: fig.y1 + en.y, x2: fig.x2 + en.x, y2: fig.y2 + en.y, orden: orden++ }
    cmds.push(crear('pegar', 'figuras', nueva))
    seleccion.figuras.add(nueva.id)
  }
  return { sinCanal, cmd: juntar('pegar', cmds), seleccion, renombradas: [...renombres].map(([k, nuevo]) => [f.etiquetas.find((e) => claveDeNombre(e.nombre) === k)!.nombre, nuevo] as [string, string]) }
}

export function duplicar(doc: Documento, lib: Map<string, PiezaDef>, sel: Seleccion, gen: GeneradorId): { cmd: Comando; seleccion: Seleccion } | null {
  const f = copiar(doc, sel, lib)
  if (!f) return null
  return pegar(doc, lib, f, { x: f.origen.x + PASO_REJILLA, y: f.origen.y + PASO_REJILLA }, gen)
}
