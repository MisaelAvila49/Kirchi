// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { idSecuencial } from '../doc/ids'
import type { Documento, Pieza } from '../doc/tipos'
import { Editor } from '../editor/Editor'
import { etiquetasSinChoques } from '../lienzo/apartar'
import { textosLocales } from '../lienzo/etiquetas'
import { centroDeTexto } from '../lienzo/textosManuales'
import { armar, type DefCircuito } from '../plantillas/armar'
import { fragmentoDeDocumento } from '../plantillas/plantilla'
import { conTextosFijos } from '../plantillas/textosFijos'
import { libreriaDePrueba } from '../prueba/libreria'
import { DEFINICIONES } from '../prueba/plantillasIncluidas'
import { CALCULADORAS, estadoInicial } from './catalogo'
import fixture from './disposicion.fixture.json'

/** Acomodo de cada calculadora contra la geometría del fixture sacado de `Calculadora.kir`; las plantillas equivalentes y
 * el circuito pegado con el editor se comparan igual. */
const lib = libreriaDePrueba().piezas

interface PiezaFx {
  ref: string
  tipo: string
  x: number
  y: number
  rot: number
  props: Record<string, string>
  textos: { cual: 'ref' | 'valor'; c: [number, number] }[]
}
interface CircuitoFx {
  piezas: PiezaFx[]
  cables: [number, number][][]
  /** Nombre, x, y y giro de cada etiqueta de red. */
  etiquetas: [string, number, number, number][]
}
const FX = fixture.circuitos as unknown as Record<string, CircuitoFx>

const CASOS: { fx: string; calc?: string; campos: Record<string, string>; plantilla: string }[] = [
  { fx: 'divisor', calc: 'divisor', campos: {}, plantilla: 'divisor-de-voltaje' },
  { fx: 'led', calc: 'led', campos: {}, plantilla: 'led-con-resistencia' },
  { fx: 'bajas', calc: 'filtro', campos: { tipo: 'bajas' }, plantilla: 'filtro-rc-paso-bajas' },
  { fx: 'altas', calc: 'filtro', campos: { tipo: 'altas' }, plantilla: 'filtro-rc-paso-altas' },
  { fx: 'astable', calc: 'astable', campos: {}, plantilla: '555-astable' },
  { fx: 'monoestable', calc: 'monoestable', campos: {}, plantilla: '555-monoestable' },
  { fx: 'inversor', calc: 'amplificador', campos: { tipo: 'inversor' }, plantilla: 'amplificador-inversor' },
  { fx: 'noinversor', calc: 'amplificador', campos: { tipo: 'no-inversor' }, plantilla: 'amplificador-no-inversor' },
  { fx: 'pasabanda', calc: 'filtro', campos: { tipo: 'pasabanda' }, plantilla: 'filtro-pasa-banda' },
  { fx: 'rechazabanda', calc: 'filtro', campos: { tipo: 'rechazabanda' }, plantilla: 'filtro-rechaza-banda' },
  { fx: 'notch', calc: 'filtro', campos: { tipo: 'notch' }, plantilla: 'filtro-notch-doble-t' },
  { fx: 'emisor', campos: {}, plantilla: 'emisor-comun' },
  { fx: 'puente', campos: {}, plantilla: 'puente-rectificador' }
]

/** El circuito de un caso: el de la calculadora (con su acomodo) o, sin calculadora, el de la plantilla incluida. */
const armadoDeCaso = (c: (typeof CASOS)[number]): { def: DefCircuito } => {
  if (c.calc) return armadoDe(c.calc, c.campos)
  return { def: DEFINICIONES.find((x) => x.id === c.plantilla)! }
}
const familia = (t: string) => t.replace('-electrolitico', '')
const armadoDe = (calc: string, campos: Record<string, string>) => {
  const d = CALCULADORAS.find((x) => x.id === calc)!
  return d.evaluar({ ...estadoInicial(d), ...campos }, { serie: 'E12', lib }).salida!.armado
}
/** El camino de la app: armar con el enrutador (o con los cables dados) y fijar los textos (App.fragmentoDeCalculadora). */
const comoLaApp = (c: (typeof CASOS)[number]): Documento => {
  const a = armadoDeCaso(c)
  return conTextosFijos(armar(a.def, lib, c.fx), lib)
}

/** Compara un documento con el circuito del fixture; las referencias y propiedades del archivo se ponen para que los textos midan igual. */
function comparar(doc: Documento, fx: CircuitoFx, etiqueta: string): void {
  const piezas = Object.values(doc.piezas)
  expect(piezas, `${etiqueta}: cuántas piezas`).toHaveLength(fx.piezas.length)
  // Las coordenadas del fixture son relativas a la primera pieza del circuito: se alinean por la esquina de las piezas.
  const dx = Math.min(...piezas.map((p) => p.x)) - Math.min(...fx.piezas.map((p) => p.x))
  const dy = Math.min(...piezas.map((p) => p.y)) - Math.min(...fx.piezas.map((p) => p.y))
  const con: Record<string, Pieza> = {}
  const clave = new Map<string, PiezaFx>()
  for (const f of fx.piezas) {
    const p = piezas.find((q) => !clave.has(q.id) && familia(q.tipo) === familia(f.tipo) && q.x - dx === f.x && q.y - dy === f.y && q.rot === f.rot)
    expect(p, `${etiqueta}: ${f.ref} (${f.tipo}) en ${f.x},${f.y} con giro ${f.rot}`).toBeDefined()
    clave.set(p!.id, f)
    con[p!.id] = { ...p!, ref: f.ref, props: { ...p!.props, ...f.props } }
  }
  const d2: Documento = { ...doc, piezas: con }
  const vistos = etiquetasSinChoques(d2, lib)
  for (const [id, f] of clave) {
    const p = con[id]
    expect(textosLocales(p, lib.get(p.tipo)!, d2).map((l) => l.cual), `${etiqueta}: textos de ${f.ref}`).toEqual(f.textos.map((t) => t.cual))
    f.textos.forEach((t, i) => {
      const c = centroDeTexto(vistos.get(id)![i])
      expect(c.x - dx, `${etiqueta}: ${f.ref} ${t.cual} x`).toBeCloseTo(t.c[0], 1)
      expect(c.y - dy, `${etiqueta}: ${f.ref} ${t.cual} y`).toBeCloseTo(t.c[1], 1)
    })
  }
  const dibujados = Object.values(doc.cables).map((c) => c.puntos.map((q) => `${q.x - dx},${q.y - dy}`).join(' '))
  const rotuladas = Object.values(doc.etiquetas).map((e) => `${e.nombre},${e.x - dx},${e.y - dy},${e.rot}`)
  expect(rotuladas.sort(), `${etiqueta}: etiquetas`).toEqual(fx.etiquetas.map((e) => e.join(',')).sort())
  expect(dibujados.sort(), `${etiqueta}: cables`).toEqual(fx.cables.map((c) => c.map(([x, y]) => `${x},${y}`).join(' ')).sort())
}

describe('acomodo de las calculadoras contra Calculadora.kir', () => {
  it.each(CASOS)('$fx: piezas, giros, cables y textos como en el archivo', (c) => {
    comparar(comoLaApp(c), FX[c.fx], c.fx)
  })

  it.each(CASOS)('$fx: la plantilla incluida $plantilla tiene el mismo acomodo', ({ fx, plantilla }) => {
    const def = DEFINICIONES.find((x) => x.id === plantilla)!
    comparar(conTextosFijos(armar(def, lib, def.id), lib), FX[fx], `plantilla ${plantilla}`)
  })

  it.each(CASOS)('$fx: colocado con el editor (el pegar de la app) conserva posiciones, giros, textos y cables', (c) => {
    const antes = comoLaApp(c)
    const ed = new Editor(lib, undefined, idSecuencial(), { registrar: () => {} })
    ed.tolerancia = 0.5
    expect(ed.empezarColocarFragmento(fragmentoDeDocumento(antes)!, { x: 200, y: 100 })).toBe(true)
    ed.abajo({ x: 200, y: 100 })
    ed.arriba({ x: 200, y: 100 })
    const a = Object.values(antes.piezas), b = Object.values(ed.doc.piezas)
    expect(b).toHaveLength(a.length)
    const ox = Math.min(...b.map((p) => p.x)) - Math.min(...a.map((p) => p.x))
    const oy = Math.min(...b.map((p) => p.y)) - Math.min(...a.map((p) => p.y))
    const ficha = (p: Pieza, x: number, y: number) => `${p.tipo}|${p.x - x},${p.y - y}|${p.rot}|${p.espejo}|${JSON.stringify(p.textos ?? null)}`
    expect(b.map((p) => ficha(p, ox, oy)).sort()).toEqual(a.map((p) => ficha(p, 0, 0)).sort())
    const cable = (c: { puntos: { x: number; y: number }[] }, x: number, y: number) => c.puntos.map((q) => `${q.x - x},${q.y - y}`).join(' ')
    expect(Object.values(ed.doc.cables).map((c) => cable(c, ox, oy)).sort()).toEqual(Object.values(antes.cables).map((c) => cable(c, 0, 0)).sort())
  })

  it('los cables dados unen las mismas redes que las conexiones pedidas (nada unido de más, nada suelto)', () => {
    for (const c of CASOS) {
      const { fx } = c
      const a = armadoDeCaso(c)
      const redes = (doc: Documento) => {
        const con = calcularConexiones(doc, lib)
        const grupos = new Map<number, string[]>()
        for (const [pin, red] of con.redDePin) grupos.set(red, [...(grupos.get(red) ?? []), pin.replace(/^p_/, '')])
        return [...grupos.values()].map((g) => g.sort().join(',')).sort()
      }
      expect(redes(armar(a.def, lib, fx)), fx).toEqual(redes(armar({ ...a.def, cables: undefined }, lib, fx)))
    }
  })
})
