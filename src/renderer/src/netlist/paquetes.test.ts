// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { avisosDelCircuito } from '../conexiones/avisos'
import type { Documento } from '../doc/tipos'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { compilarNetlist, type ElementoMotor } from './netlist'
import { aplicarUniones, unirCompartidas } from './paquetes'

const lib = libreriaDePrueba().piezas
const armar = (partes: Parte[]) => conEtiquetas(lib, partes)
const fuente: Parte = { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } }
const unidad = (ref: string, paquete: string | null, u: string, pines: Record<string, string>): Parte => ({
  tipo: 'amp-op', ref, props: { modelo: 'LM358', ...(paquete ? { paquete, unidad: u } : {}) }, pines
})
/** Seguidor con la unidad A alimentada y la B con cada patilla compartida en `b`. */
const dos = (b: Record<string, string>, paquete: string | null = 'U1'): Documento =>
  armar([
    fuente,
    unidad('U1A', paquete, 'A', { '+': 'ent', '-': 'sal', OUT: 'sal', 'V+': 'vcc', 'V-': '0' }),
    unidad('U1B', paquete, 'B', { '+': 'ent', '-': 'sal2', OUT: 'sal2', ...b }),
    { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'ent', '2': '0' } }
  ])
const compilar = (d: Documento) => compilarNetlist(d, lib, calcularConexiones(d, lib))
const sueltas = { 'V+': 'b_vp', 'V-': 'b_vm' }

describe('patillas compartidas de un encapsulado', () => {
  it('las sueltas de una unidad se unen a las conectadas de otra', () => {
    const d = dos(sueltas)
    const r = unirCompartidas(d, lib, calcularConexiones(d, lib))
    expect(r.errores).toEqual([])
    expect(r.uniones.map((u) => [u[1], u[3]])).toEqual([['V+', 'V+'], ['V-', 'V-']])
  })

  it('un LM358 con V+ y V- en U1A y sueltos en U1B simula con la unión', () => {
    const r = compilar(dos(sueltas))
    expect(r.errores).toEqual([])
    const ops = r.netlist!.elements.filter((e) => e.type === 'OA') as Extract<ElementoMotor, { type: 'OA' }>[]
    expect(ops).toHaveLength(2)
    expect(ops[1].vp).toBe(ops[0].vp)
    expect(ops[1].vn).toBe(ops[0].vn)
  })

  it('el mismo circuito sin paquete sigue dando el error de pin sin conectar', () => {
    const r = compilar(dos(sueltas, null))
    expect(r.errores.some((e) => e.includes('no está conectado a nada'))).toBe(true)
  })

  it('en redes distintas es un error con las dos unidades y la patilla', () => {
    const e = armar([
      fuente,
      { tipo: 'fuente-dc', ref: 'V2', props: { voltaje: '9' }, pines: { '+': 'otro', '-': '0' } },
      unidad('U1A', 'U1', 'A', { '+': 'ent', '-': 'sal', OUT: 'sal', 'V+': 'vcc', 'V-': '0' }),
      unidad('U1B', 'U1', 'B', { '+': 'ent', '-': 'sal2', OUT: 'sal2', 'V+': 'otro', 'V-': '0' }),
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'ent', '2': '0' } }
    ])
    const u = unirCompartidas(e, lib, calcularConexiones(e, lib))
    expect(u.errores.map((x) => x.texto)).toEqual(['U1A y U1B comparten el pin 8 (V+) y están en redes distintas.'])
    expect(u.errores[0].piezas).toHaveLength(2)
    const r = compilar(e)
    expect(r.netlist).toBeNull()
    expect(r.errores).toContain('U1A y U1B comparten el pin 8 (V+) y están en redes distintas.')
  })

  it('el editor no avisa de pin suelto en la unidad que comparte y sí del conflicto', () => {
    const d = dos(sueltas)
    expect(avisosDelCircuito(d, calcularConexiones(d, lib), lib).map((a) => a.texto)).toEqual([])
  })

  it('sin propiedades de paquete no hay uniones ni errores', () => {
    const d = dos(sueltas, null)
    expect(unirCompartidas(d, lib, calcularConexiones(d, lib))).toEqual({ uniones: [], errores: [] })
  })

  it('aplicar las uniones deja ambas patillas en la misma red sin tocar las conexiones de origen', () => {
    const d = dos(sueltas)
    const con = calcularConexiones(d, lib)
    const antes = [...con.redDePin.entries()].join()
    const u = unirCompartidas(d, lib, con)
    const nueva = aplicarUniones(con, u.uniones)
    for (const [a, pa, b, pb] of u.uniones) expect(nueva.redDePin.get(`${b}:${pb}`)).toBe(nueva.redDePin.get(`${a}:${pa}`))
    expect([...con.redDePin.entries()].join()).toBe(antes)
  })
})
