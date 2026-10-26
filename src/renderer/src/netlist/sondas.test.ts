// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Documento, Sonda } from '../doc/tipos'
import { pinesEnMundo } from '../piezas/transformar'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { compilarNetlist } from './netlist'

const lib = libreriaDePrueba().piezas
const compilar = (d: Documento) => compilarNetlist(d, lib, calcularConexiones(d, lib))

/** 5 V sobre un divisor de 1 kΩ y 1 kΩ, con el osciloscopio p_3; `entradaA` es la red de su entrada A (o nada). */
const partes = (entradaA?: string): Parte[] => [
  { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
  { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'vcc', '2': 'medio' } },
  { tipo: 'resistencia', ref: 'R2', props: { valor: '1k' }, pines: { '1': 'medio', '2': '0' } },
  { tipo: 'osciloscopio', ref: 'XSC1', pines: { A: entradaA ?? 'na', B: 'nb', C: 'nc', D: 'nd' } }
]
/** El pin 2 de R1 (p_1), donde se pone la sonda. */
function puntoMedio(d: Documento) {
  const q = pinesEnMundo(d.piezas.p_1, lib.get('resistencia')!).find((x) => x.id === '2')!
  return { x: q.x, y: q.y }
}

/** Sin la etiqueta que `conEtiquetas` pone en la entrada A del osciloscopio: a una entrada con sonda no le llega nada más. */
function sinEtiquetaEnA(d: Documento): Documento {
  const a = pinesEnMundo(d.piezas.p_3, lib.get('osciloscopio')!).find((q) => q.id === 'A')!
  return { ...d, etiquetas: Object.fromEntries(Object.entries(d.etiquetas).filter(([, e]) => e.x !== a.x || e.y !== a.y)) }
}

describe('las sondas en la netlist', () => {
  it('la sonda de osciloscopio da a la entrada el mismo nodo que una etiqueta (como un cable)', () => {
    const conEtiqueta = compilar(conEtiquetas(lib, partes('medio')))
    const d = sinEtiquetaEnA(conEtiquetas(lib, partes()))
    const s: Sonda = { id: 's', tipo: 'osciloscopio', ...puntoMedio(d), instrumento: 'p_3', entrada: 'A' }
    const conSonda = compilar({ ...d, sondas: { s } })
    expect(conSonda.errores).toEqual([])
    expect(conSonda.netlist!.sondas).toEqual(conEtiqueta.netlist!.sondas)
    expect(conSonda.netlist!.elements).toEqual(conEtiqueta.netlist!.elements)
  })

  it('las de voltaje y de corriente no agregan nada a la netlist', () => {
    const d = conEtiquetas(lib, partes())
    const p = puntoMedio(d)
    const sondas: Record<string, Sonda> = { v: { id: 'v', tipo: 'voltaje', ...p }, i: { id: 'i', tipo: 'corriente', ...p, sentido: 'derecha' } }
    expect(JSON.stringify(compilar({ ...d, sondas }).netlist)).toBe(JSON.stringify(compilar(d).netlist))
  })
})
