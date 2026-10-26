// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { idSecuencial } from '../doc/ids'
import type { Documento } from '../doc/tipos'
import { compilarNetlist } from '../netlist/netlist'
import { conEtiquetas } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { Editor } from './Editor'
import { copiar, type Fragmento } from './portapapeles'
import { todo } from './seleccion'

const lib = libreriaDePrueba().piezas
beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })
})

/** Fuente de 5 V entre «Entrada» y tierra, y un divisor 1k/1k hacia «Salida», más un riel VCC con una resistencia. */
const base = (): Documento =>
  conEtiquetas(lib, [
    { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'Entrada', '-': '0' } },
    { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'Entrada', '2': 'Salida' } },
    { tipo: 'resistencia', ref: 'R2', props: { valor: '1k' }, pines: { '1': 'Salida', '2': '0' } },
    { tipo: 'resistencia', ref: 'R3', props: { valor: '1k' }, pines: { '1': 'VCC', '2': '+15V' } },
    { tipo: 'resistencia', ref: 'R4', props: { valor: '2k' }, pines: { '1': '+15V', '2': '0' } }
  ])

function armar() {
  const registro: string[] = []
  const ed = new Editor(lib, undefined, idSecuencial(), { registrar: (t) => registro.push(t) })
  ed.tolerancia = 0.5
  ed.cargar(base())
  const f = copiar(base(), todo(base())) as Fragmento
  return { ed, registro, f }
}
const nombres = (ed: Editor) => Object.values(ed.doc.etiquetas).map((e) => e.nombre)
const cuenta = (ed: Editor, n: string) => nombres(ed).filter((x) => x === n).length

describe('plantillas y circuitos generados no unen sus redes con las que ya hay', () => {
  it('colocar renombra Entrada y Salida (Entrada2, Salida2), deja alimentaciones y tierra, y deshace de una vez', () => {
    const { ed, registro, f } = armar()
    const antes = ed.doc
    ed.empezarColocarFragmento(f, { x: 400, y: 300 })
    ed.abajo({ x: 400, y: 300 })
    ed.arriba({ x: 400, y: 300 })
    expect(cuenta(ed, 'Entrada')).toBe(2)
    expect(cuenta(ed, 'Entrada2')).toBe(2)
    expect(cuenta(ed, 'Salida2')).toBe(2)
    expect(cuenta(ed, 'VCC')).toBe(2)
    expect(cuenta(ed, '+15V')).toBe(4)
    expect(cuenta(ed, '0')).toBe(8)
    expect(registro.some((t) => t.includes('Entrada a Entrada2') && t.includes('Salida a Salida2'))).toBe(true)
    ed.deshacer()
    expect(ed.doc).toEqual(antes)
  })

  it('una tercera copia usa Entrada3', () => {
    const { ed, f } = armar()
    for (const x of [400, 800]) {
      ed.empezarColocarFragmento(f, { x, y: 300 })
      ed.abajo({ x, y: 300 })
      ed.arriba({ x, y: 300 })
    }
    expect(cuenta(ed, 'Entrada3')).toBe(2)
    expect(cuenta(ed, 'Salida3')).toBe(2)
  })

  it('dos copias simulan por separado y comparten los rieles', () => {
    const { ed, f } = armar()
    ed.empezarColocarFragmento(f, { x: 400, y: 300 })
    ed.abajo({ x: 400, y: 300 })
    ed.arriba({ x: 400, y: 300 })
    const d = structuredClone(ed.doc)
    const fuentes = Object.values(d.piezas).filter((p) => p.tipo === 'fuente-dc')
    expect(fuentes).toHaveLength(2)
    fuentes[1].props.voltaje = '10'
    const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
    if (!r.netlist) throw new Error(r.errores.join(' '))
    const sim = new Simulator(JSON.stringify(r.netlist), 1e-5)
    sim.advance_to(1e-3, 1e9)
    const v = sim.voltages()
    const nodoA = (id: string) => (r.netlist!.elements[r.piezaDeElemento.findIndex((x) => x === id)] as { a: number }).a
    const rs = Object.values(d.piezas).filter((p) => p.tipo === 'resistencia' && p.props.valor === '1k')
    const entradas = fuentes.map((p) => v[nodoA(p.id)])
    sim.free()
    expect(entradas.map((x) => Math.round(x * 100) / 100).sort((a, b) => a - b)).toEqual([5, 10])
    expect(rs.length).toBeGreaterThan(0)
  })

  it('copiar y pegar a mano conserva los nombres de las etiquetas', () => {
    const { ed } = armar()
    ed.seleccion = todo(ed.doc)
    ed.copiar()
    ed.cursor = { x: 400, y: 300 }
    ed.pegar()
    expect(cuenta(ed, 'Entrada')).toBe(4)
    expect(cuenta(ed, 'Salida')).toBe(4)
    expect(nombres(ed).some((n) => n.endsWith('2'))).toBe(false)
  })
})
