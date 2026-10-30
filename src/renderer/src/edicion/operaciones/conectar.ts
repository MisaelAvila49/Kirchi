import { anclaDeSonda } from '../../conexiones/anclas'
import { calcularConexiones, clavePin, partirClavePin, type Red } from '../../conexiones/conexiones'
import { aplicar, crear, juntar, type Comando } from '../../doc/comandos'
import type { Documento, Etiqueta, Punto, Rotacion } from '../../doc/tipos'
import { cuerpoEnMundo } from '../../editor/colision'
import { conflictoDeTocados, piezaCruzada } from '../../editor/conflictos'
import { enrutar, rutaLibre } from '../../editor/enrutar'
import { giroDeEtiqueta, LARGO_TRAMO_ETIQUETA } from '../../editor/etiquetaEnTramo'
import { cajasSeCruzan } from '../../lienzo/apartar'
import { cajaEtiqueta } from '../../lienzo/medidas'
import { pinesEnMundo } from '../../piezas/transformar'
import { motivoDeChoque } from '../motivos'
import type { Orden } from '../ordenes'
import { rechazo, type Estado, type Plan, type Rechazo } from '../plan'
import { resolverPatilla, type Patilla } from '../referencias'

type Conectar = Extract<Orden, { orden: 'conectar' }>

/** Uno de los dos lados de una conexión: una patilla o una red con nombre, con los puntos donde se puede empalmar. */
export interface Extremo {
  texto: string
  red: Red
  patilla?: Patilla
  puntos: Punto[]
}

const distancia = (a: Punto, b: Punto): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
const mismo = (a: Punto, b: Punto): boolean => a.x === b.x && a.y === b.y

/** Los puntos de una red donde se puede empalmar un cable: patillas, etiquetas y vértices de sus cables. */
export function puntosDeRed(est: Estado, red: Red): Punto[] {
  const { doc, lib, con } = est
  const salida: Punto[] = []
  const nuevo = (p: Punto) => {
    if (!salida.some((q) => mismo(q, p))) salida.push({ x: p.x, y: p.y })
  }
  for (const clave of red.pines) {
    const { piezaId, pinId } = partirClavePin(clave)
    const pieza = doc.piezas[piezaId]
    const def = pieza ? lib.get(pieza.tipo) : undefined
    const pin = pieza && def ? pinesEnMundo(pieza, def).find((q) => q.id === pinId) : undefined
    if (pin) nuevo(pin)
  }
  for (const e of Object.values(doc.etiquetas)) if (con.redDeEtiqueta.get(e.id) === red.id) nuevo(e)
  for (const id of red.cables) for (const p of doc.cables[id]?.puntos ?? []) nuevo(p)
  return salida
}

/** Resuelve «R1.2», «red de R1.2» o el nombre de una red. */
export function resolverExtremo(est: Estado, texto: string): Extremo | { motivo: string } {
  const t = texto.trim().replace(/^red de /i, '')
  const pat = resolverPatilla(est.doc, est.lib, t)
  if (pat) {
    if ('motivo' in pat) return pat
    const i = est.con.redDePin.get(clavePin(pat.pieza.id, pat.pin))
    const red = i === undefined ? undefined : est.con.redes.find((r) => r.id === i)
    return red ? { texto, red, patilla: pat, puntos: [pat.punto] } : { motivo: `El pin ${t} no está en ninguna red.` }
  }
  const k = t.toLowerCase()
  const red = est.con.redes.find((r) => r.nombre === t) ?? est.con.redes.find((r) => r.nombre?.toLowerCase() === k)
  if (!red) return { motivo: `No hay ninguna red llamada «${t}».` }
  const puntos = puntosDeRed(est, red)
  return puntos.length ? { texto, red, puntos } : { motivo: `La red «${t}» no tiene dónde empalmar un cable.` }
}

/** Los pares de puntos a probar, del más corto al más largo (a lo más 6). */
function pares(a: Extremo, b: Extremo): [Punto, Punto][] {
  const cerca = (de: Punto[], hacia: Punto[]) => [...de].sort((p, q) => Math.min(...hacia.map((h) => distancia(p, h))) - Math.min(...hacia.map((h) => distancia(q, h)))).slice(0, 8)
  const lista: [Punto, Punto][] = []
  for (const p of cerca(a.puntos, b.puntos)) for (const q of cerca(b.puntos, a.puntos)) if (!mismo(p, q)) lista.push([p, q])
  return lista.sort((x, y) => distancia(x[0], x[1]) - distancia(y[0], y[1])).slice(0, 6)
}

interface Intento {
  cmd?: Comando
  motivo?: string
}

/** Un cable de `a` a `b` solo si el A* da una ruta que no atraviesa piezas ni corre sobre otra red. */
function cableEntre(est: Estado, a: Punto, b: Punto): Intento {
  const { doc, lib } = est
  let motivo: string | undefined
  const vistas = new Set<string>()
  for (const horizontalPrimero of [undefined, true, false]) {
    const ruta = enrutar(doc, lib, a, b, { horizontalPrimero, indice: est.indice })
    const huella = JSON.stringify(ruta)
    if (vistas.has(huella) || ruta.length < 2) continue
    vistas.add(huella)
    const id = est.gen('c')
    const cmd = crear('conectar', 'cables', { id, puntos: ruta })
    const despues = aplicar(doc, cmd)
    const choque = conflictoDeTocados(despues, lib, { cables: [id] })
    if (!choque && rutaLibre(doc, lib, ruta, { indice: est.indice })) return { cmd }
    const pieza = piezaCruzada(doc, lib, ruta, est.indice)
    motivo ??= motivoDeChoque(despues, null, choque ?? (pieza ? { con: pieza, col: 'piezas' } : null))
  }
  return { motivo: motivo ?? 'no hay por dónde pasar un cable' }
}

const nombreLibre = (doc: Documento, nombres: Set<string>): string => {
  const en = new Set([...nombres, ...Object.values(doc.etiquetas).map((e) => e.nombre.toLowerCase())])
  for (let k = 1; ; k++) if (!en.has(`n${k}`)) return `N${k}`
}

/** Etiqueta en la punta de un tramo corto que sale de la patilla hacia afuera del cuerpo; si no cabe, directo sobre ella. */
export function etiquetaEn(est: Estado, doc: Documento, p: Punto, patilla: Patilla | undefined, nombre: string): { cmd: Comando; etiqueta: Etiqueta } {
  const { lib } = est
  const id = est.gen('e')
  const directa = (): { cmd: Comando; etiqueta: Etiqueta } => {
    const etiqueta: Etiqueta = { id, nombre, x: p.x, y: p.y, rot: giroDeEtiqueta(doc, lib, p, nombre) }
    return { cmd: crear('conectar', 'etiquetas', etiqueta), etiqueta }
  }
  if (!patilla) return directa()
  const c = cuerpoEnMundo(patilla.pieza, patilla.def)
  const dx = p.x - (c.minX + c.maxX) / 2, dy = p.y - (c.minY + c.maxY) / 2
  const L = LARGO_TRAMO_ETIQUETA
  const sale: [number, number, Rotacion] = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx || 1) * L, 0, dx < 0 ? 180 : 0] : [0, Math.sign(dy || 1) * L, 0]
  const fin = { x: p.x + sale[0], y: p.y + sale[1] }
  if (anclaDeSonda(doc, lib, fin.x, fin.y)) return directa()
  const etiqueta: Etiqueta = { id, nombre, x: fin.x, y: fin.y, rot: sale[2] }
  const caja = cajaEtiqueta(etiqueta)
  const pisa = Object.values(doc.piezas).some((q) => cajasSeCruzan(cuerpoEnMundo(q, lib.get(q.tipo)), caja)) || Object.values(doc.etiquetas).some((q) => cajasSeCruzan(cajaEtiqueta(q), caja))
  if (pisa) return directa()
  const tramo = { id: est.gen('c'), puntos: [{ x: p.x, y: p.y }, fin] }
  const cmd = juntar('conectar', [crear('conectar', 'cables', tramo), crear('conectar', 'etiquetas', etiqueta)])
  if (conflictoDeTocados(aplicar(doc, cmd), lib, { cables: [tramo.id] })) return directa()
  return { cmd, etiqueta }
}

/** Dos patillas o redes quedan en la misma red: un cable que el A* aprueba, o etiquetas con el mismo nombre. */
export function conectarOrden(est: Estado, o: Conectar): Plan | Rechazo {
  const { doc, lib } = est
  const a = resolverExtremo(est, o.desde)
  if ('motivo' in a) return rechazo(a.motivo)
  const b = resolverExtremo(est, o.hasta)
  if ('motivo' in b) return rechazo(b.motivo)
  const verbo = `No se conectó ${o.desde} con ${o.hasta}`
  if (a.red.id === b.red.id) return { cmd: { nombre: 'conectar', cambios: [] }, creados: {}, avisos: [], yaUnidas: true }
  if (a.red.nombre && b.red.nombre && a.red.nombre.toLowerCase() !== b.red.nombre.toLowerCase())
    return rechazo(`${verbo}: las redes «${a.red.nombre}» y «${b.red.nombre}» quedarían unidas y tienen nombres distintos.`)
  const via = o.via ?? 'auto'

  let cmd: Comando | null = null
  let tipo: 'cable' | 'etiquetas' = 'cable'
  const avisos: string[] = []
  let motivo = ''
  if (via !== 'etiqueta') {
    const mejor: Intento[] = []
    for (const [p, q] of pares(a, b)) {
      const r = cableEntre(est, p, q)
      if (r.cmd) {
        cmd = r.cmd
        break
      }
      mejor.push(r)
    }
    motivo = mejor[0]?.motivo ?? 'no hay por dónde pasar un cable'
    if (!cmd && via === 'cable') return rechazo(`${verbo}: ${motivo}.`)
  }
  if (!cmd) {
    tipo = 'etiquetas'
    const nombre = a.red.nombre ?? b.red.nombre ?? nombreLibre(doc, new Set(est.con.redes.flatMap((r) => (r.nombre ? [r.nombre.toLowerCase()] : []))))
    let trabajo = doc
    const partes: Comando[] = []
    for (const e of [a, b]) {
      if (e.red.nombre?.toLowerCase() === nombre.toLowerCase()) continue
      const r = etiquetaEn(est, trabajo, e.puntos[0], e.patilla, nombre)
      partes.push(r.cmd)
      trabajo = aplicar(trabajo, r.cmd)
    }
    cmd = juntar('conectar', partes)
    if (via === 'auto') avisos.push(`Se unieron por etiquetas «${nombre}»: ${motivo}.`)
  }

  // Lo único que importa: que el resultado una de verdad las dos redes.
  const final = aplicar(doc, cmd)
  const con = calcularConexiones(final, lib)
  const enRed = (e: Extremo): number | undefined => {
    if (e.patilla) return con.redDePin.get(clavePin(e.patilla.pieza.id, e.patilla.pin))
    const pin = e.red.pines[0]
    if (pin) return con.redDePin.get(pin)
    const cable = e.red.cables[0]
    if (cable) return con.redDeCable.get(cable)
    return undefined
  }
  const ra = enRed(a), rb = enRed(b)
  if (ra !== undefined && rb !== undefined && ra !== rb) return rechazo(`${verbo}: no se pudo unir sin tocar otra red.`)
  return { cmd: { ...cmd, nombre: 'conectar' }, creados: {}, avisos, verbo, via: tipo }
}
