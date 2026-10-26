// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio } from '../doc/tipos'
import { conEtiquetas, divisor, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { armarContexto } from './contexto'

const lib = libreriaDePrueba().piezas
const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const DC = (ref: string, voltaje: string, mas: string): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje }, pines: { '+': mas, '-': '0' } })

describe('contexto de análisis', () => {
  it('el divisor: una fuente, dos resistencias barribles, redes y corrientes por pieza', () => {
    const d = divisor()
    const r = armarContexto(d, lib, calcularConexiones(d, lib))
    if (!r.ok) throw new Error(r.error)
    const c = r.ctx
    expect(c.fuentes.map((f) => f.ref)).toEqual(['V1'])
    expect(c.barribles.map((b) => [b.ref, b.unidad, b.valor])).toEqual([['R1', 'Ω', 1000], ['R2', 'Ω', 1000], ['V1', 'V', 5]])
    expect(c.corrientes.map((x) => x.ref)).toEqual(['R1', 'R2', 'V1'])
    expect(c.redes.length).toBeGreaterThanOrEqual(2)
    expect(c.redes.every((x) => x.nodo > 0)).toBe(true)
    expect(c.nombres.elementos.filter(Boolean).sort()).toEqual(['R1', 'R2', 'V1'])
  })

  it('las redes con etiqueta van primero y con su nombre; el resto con el nombre automático', () => {
    const d = conEtiquetas(lib, [DC('V1', '5', 'entrada'), R('R1', '1k', 'entrada', 'salida'), R('R2', '1k', 'salida', '0')])
    const r = armarContexto(d, lib, calcularConexiones(d, lib))
    if (!r.ok) throw new Error(r.error)
    expect(r.ctx.redes.filter((x) => x.conNombre).map((x) => x.nombre).sort()).toEqual(['entrada', 'salida'])
    expect(r.ctx.redes[0].conNombre).toBe(true)
    expect([...r.ctx.nombres.redes.values()].sort()).toEqual(['entrada', 'salida'])
  })

  it('un circuito vacío o sin tierra dice por qué no se puede analizar', () => {
    const vacio = documentoVacio()
    const a = armarContexto(vacio, lib, calcularConexiones(vacio, lib))
    expect(a.ok).toBe(false)
    const d = conEtiquetas(lib, [R('R1', '1k', 'a', 'b'), R('R2', '1k', 'b', 'a')])
    const b = armarContexto(d, lib, calcularConexiones(d, lib))
    expect(b.ok).toBe(false)
    if (!b.ok) expect(b.error).toMatch(/tierra/)
  })

  it('clasifica las fuentes (generador, señal, CD, riel) y marca las redes de alimentación', () => {
    const C = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'capacitor', ref, props: { valor }, pines: { '1': a, '2': b } })
    const d = conEtiquetas(lib, [
      { tipo: 'alimentacion', ref: 'PWR1', props: { nombre: '+15V' }, pines: { '1': '+15V' } },
      { tipo: 'generador', ref: 'XFG1', props: { frecuencia: '1k', amplitud: '2' }, pines: { '+': 'in', COM: '0' } },
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'cc', '-': '0' } },
      R('R1', '1k', 'in', 'out'),
      C('C1', '100n', 'out', '0'),
      R('R2', '1k', 'cc', '0'),
      R('R3', '1k', '+15V', '0')
    ])
    const r = armarContexto(d, lib, calcularConexiones(d, lib))
    if (!r.ok) throw new Error(r.error)
    expect(r.ctx.fuentes.map((f) => [f.ref, f.clase])).toEqual([['PWR1', 'riel'], ['V1', 'continua'], ['XFG1', 'generador']])
    const riel = r.ctx.redes.find((x) => x.nombre === '+15V')!
    expect(riel.riel).toBe(true)
    expect(r.ctx.redes.filter((x) => x.riel).map((x) => x.nombre)).toEqual(['+15V'])
    expect(r.ctx.nombres.rieles?.has(riel.nodo)).toBe(true)
    expect(r.ctx.redes.find((x) => x.nombre === 'out')!.riel).toBe(false)
  })
})
