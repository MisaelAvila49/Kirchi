// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Punto } from '../doc/tipos'
import { pinesEnMundo } from '../piezas/transformar'
import { libreriaDePrueba } from '../prueba/libreria'
import { cuerpoEnMundo } from './colision'
import { violaciones } from './conflictos'
import { Editor, type Modificadores } from './Editor'

/** Prueba de propiedad: secuencias pseudoaleatorias (con semilla) de acciones de usuario, comprobando tras cada una el
 * invariante del esquema. */

const lib = libreriaDePrueba().piezas
const TIPOS = ['resistencia', 'capacitor', 'inductor', 'diodo', 'led', 'tierra', 'bateria', 'fuente-dc', 'boton', 'interruptor']

/** mulberry32: generador pequeño y reproducible. */
function generador(semilla: number) {
  let a = semilla >>> 0
  const azar = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const entero = (lo: number, hi: number) => lo + Math.floor(azar() * (hi - lo + 1))
  const elegir = <T,>(xs: T[]): T => xs[Math.floor(azar() * xs.length)]
  return { azar, entero, elegir }
}

const clic = (ed: Editor, p: Punto, m: Modificadores = {}) => {
  ed.abajo(p, m)
  ed.arriba(p, m)
}
const centro = (ed: Editor, id: string): Punto => {
  const p = ed.doc.piezas[id]
  const c = cuerpoEnMundo(p, lib.get(p.tipo))
  return { x: (c.minX + c.maxX) / 2, y: (c.minY + c.maxY) / 2 }
}
const pines = (ed: Editor): Punto[] => Object.values(ed.doc.piezas).flatMap((p) => pinesEnMundo(p, lib.get(p.tipo)!))

function secuencia(semilla: number, n: number): { log: string[]; problemas: string[]; resumen: string } {
  const r = generador(semilla)
  const ed = new Editor(lib, documentoVacio(), idSecuencial())
  ed.tolerancia = 0.5
  const par = (lo = -16, hi = 16) => 2 * r.entero(lo, hi)
  const punto = (): Punto => ({ x: par(), y: par() })
  const log: string[] = []
  const piezaAlAzar = () => {
    const ids = Object.keys(ed.doc.piezas)
    return ids.length ? r.elegir(ids) : null
  }
  const ops: [string, number, () => string | null][] = [
    ['colocar', 6, () => {
      const tipo = r.elegir(TIPOS), en = punto(), giros = r.entero(0, 3), shift = r.azar() < 0.2
      ed.empezarColocar(tipo, undefined, en)
      for (let k = 0; k < giros; k++) ed.transformar('girar')
      clic(ed, en, { shift })
      return `colocar ${tipo} en (${en.x}, ${en.y}) girada ${giros * 90}°`
    }],
    ['cablear con clics', 4, () => {
      const ps = pines(ed)
      if (ps.length < 2) return null
      const a = r.elegir(ps), b = r.elegir(ps), esquina = punto()
      clic(ed, a)
      ed.mover(esquina)
      if (r.azar() < 0.5) clic(ed, esquina)
      ed.mover(b)
      clic(ed, b)
      return `cablear con clics de (${a.x}, ${a.y}) por (${esquina.x}, ${esquina.y}) a (${b.x}, ${b.y})`
    }],
    ['cablear arrastrando', 3, () => {
      const ps = pines(ed)
      if (ps.length < 2) return null
      const a = r.elegir(ps), b = r.elegir(ps), medio = punto()
      ed.abajo(a)
      ed.mover(medio)
      ed.mover(b)
      ed.arriba(b)
      return `cablear arrastrando de (${a.x}, ${a.y}) por (${medio.x}, ${medio.y}) a (${b.x}, ${b.y})`
    }],
    ['arrastrar pieza', 4, () => {
      const id = piezaAlAzar()
      if (!id) return null
      const c = centro(ed, id), d = { x: par(-6, 6), y: par(-6, 6) }
      ed.abajo(c)
      ed.mover({ x: c.x + d.x / 2, y: c.y + d.y / 2 })
      ed.mover({ x: c.x + d.x, y: c.y + d.y })
      ed.arriba({ x: c.x + d.x, y: c.y + d.y })
      return `arrastrar ${ed.doc.piezas[id]?.ref ?? id} desde (${c.x}, ${c.y}) por (${d.x}, ${d.y})`
    }],
    ['arrastrar tramo', 3, () => {
      const cs = Object.values(ed.doc.cables)
      if (!cs.length) return null
      const c = r.elegir(cs), i = r.entero(1, c.puntos.length - 1)
      const a = c.puntos[i - 1], b = c.puntos[i]
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d = par(-5, 5)
      const hasta = a.y === b.y ? { x: m.x, y: m.y + d } : { x: m.x + d, y: m.y }
      ed.abajo(m)
      ed.mover(hasta)
      ed.arriba(hasta)
      return `arrastrar el tramo ${i - 1} de ${c.id} desde (${m.x}, ${m.y}) a (${hasta.x}, ${hasta.y})`
    }],
    ['girar', 3, () => {
      const id = piezaAlAzar()
      if (!id) return null
      clic(ed, centro(ed, id))
      ed.transformar(r.elegir(['girar', 'espejoX', 'espejoY'] as const))
      return `girar o reflejar ${ed.doc.piezas[id]?.ref ?? id}`
    }],
    ['pegar', 2, () => {
      const id = piezaAlAzar()
      if (!id) return null
      clic(ed, centro(ed, id))
      ed.copiar()
      const en = punto()
      ed.mover(en)
      if (r.azar() < 0.5) ed.pegar()
      else ed.duplicar()
      return `copiar ${ed.doc.piezas[id]?.ref ?? id} y pegar o duplicar cerca de (${en.x}, ${en.y})`
    }],
    ['insertar en cable', 2, () => {
      const tramos = Object.values(ed.doc.cables).flatMap((c) =>
        c.puntos.slice(1).map((b, i) => ({ a: c.puntos[i], b })).filter(({ a, b }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) >= 12)
      )
      if (!tramos.length) return null
      const { a, b } = r.elegir(tramos)
      const en = { x: Math.round((a.x + b.x) / 4) * 2, y: Math.round((a.y + b.y) / 4) * 2 }
      ed.empezarColocar('resistencia', undefined, en)
      if (a.x === b.x) ed.transformar('girar')
      clic(ed, en)
      return `colocar una resistencia sobre el tramo (${a.x}, ${a.y})-(${b.x}, ${b.y}) en (${en.x}, ${en.y})`
    }],
    ['borrar', 1, () => {
      const id = piezaAlAzar()
      if (!id) return null
      clic(ed, centro(ed, id))
      ed.borrar()
      return `borrar ${id}`
    }],
    ['deshacer', 2, () => (ed.deshacer(), 'deshacer')],
    ['rehacer', 1, () => (ed.rehacer(), 'rehacer')]
  ]
  const bolsa = ops.flatMap((o) => Array<typeof o>(o[1]).fill(o))
  for (let k = 0; k < n; k++) {
    const [, , hacer] = r.elegir(bolsa)
    const texto = hacer()
    ed.escape()
    ed.escape()
    if (!texto) continue
    log.push(texto)
    const problemas = violaciones(ed.doc, lib)
    if (problemas.length) return { log, problemas, resumen: '' }
  }
  const resumen = `${Object.keys(ed.doc.piezas).length} piezas, ${Object.keys(ed.doc.cables).length} cables, ${ed.historial.puedeDeshacer ? 'con' : 'sin'} historial`
  return { log, problemas: [], resumen }
}

describe('invariantes del esquema bajo operaciones al azar', () => {
  for (const semilla of [1, 2, 3, 4, 5, 6]) {
    it(`semilla ${semilla}: 60 operaciones sin cables a través de piezas ni redes encimadas`, () => {
      const { log, problemas, resumen } = secuencia(semilla, 60)
      if (process.env.INVARIANTES_LOG && !problemas.length) console.log(`semilla ${semilla}: ${log.length} operaciones, al final ${resumen}`)
      // INVARIANTES_LOG=1 imprime las últimas operaciones antes de la primera violación.
      if (process.env.INVARIANTES_LOG && problemas.length) console.log(`semilla ${semilla}:\n${log.slice(-4).join('\n')}\n=> ${problemas.join('\n=> ')}`)
      expect(problemas, `después de:\n${log.slice(-6).join('\n')}`).toEqual([])
      expect(log.length).toBeGreaterThan(30)
    })
  }
})
