// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Pieza } from '../doc/tipos'
import { estaAccionada } from '../lienzo/escena'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { accionDeClic, otraOpcion } from '../sim/control'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { avisosDelCircuito } from '../ui/proyecto'
import { compilarNetlist } from './netlist'

const lib = libreriaDePrueba().piezas
beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })
})

/** 5 V al común; cada tiro a tierra por 1 kΩ (el 2 puede quedar libre). */
const circuito = (posicion: string, tiro2: string | null): Parte[] => [
  { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } },
  { tipo: 'conmutador', ref: 'S1', props: { posicion }, pines: { COM: 'a', '1': 'x1', '2': tiro2 ?? 'libre' } },
  { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'x1', '2': '0' } },
  ...(tiro2 ? [{ tipo: 'resistencia', ref: 'R2', props: { valor: '1k' }, pines: { '1': tiro2, '2': '0' } }] : [])
]

function voltajes(posicion: string, tiro2: string | null): { x1: number; x2: number | null } {
  const d = conEtiquetas(lib, circuito(posicion, tiro2))
  const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
  if (!r.netlist) throw new Error(r.errores.join(' '))
  const sim = new Simulator(JSON.stringify(r.netlist), 1e-5)
  sim.advance_to(1e-3, 1e9)
  const v = sim.voltages()
  const nodo = (pieza: string) => {
    const k = r.piezaDeElemento.findIndex((id) => id === pieza)
    return (r.netlist!.elements[k] as { a: number }).a
  }
  const out = { x1: v[nodo('p_2')], x2: tiro2 ? v[nodo('p_3')] : null }
  sim.free()
  return out
}

describe('conmutador SPDT', () => {
  it('en la posición 1 el común va al tiro 1 y en la 2 al tiro 2', () => {
    const a = voltajes('1', 'x2')
    expect(a.x1).toBeCloseTo(5, 3)
    expect(a.x2!).toBeCloseTo(0, 3)
    const b = voltajes('2', 'x2')
    expect(b.x1).toBeCloseTo(0, 3)
    expect(b.x2!).toBeCloseTo(5, 3)
  })

  it('un tiro libre no impide simular ni avisa que le falta conexión; la posición vacía abre el otro', () => {
    expect(voltajes('1', null).x1).toBeCloseTo(5, 3)
    expect(voltajes('2', null).x1).toBeCloseTo(0, 3)
    const d = conEtiquetas(lib, circuito('1', null))
    const con = calcularConexiones(d, lib)
    expect(avisosDelCircuito(d, con, lib).filter((a) => a.texto.includes('no está conectado a nada'))).toEqual([])
  })

  it('un clic simulando lo conmuta (también Enter y Espacio, que usan el mismo camino) y su dibujo sigue la posición', () => {
    const def = lib.get('conmutador')!
    expect(accionDeClic(def)).toBe('conmutar')
    expect(otraOpcion(def, '1')).toBe('2')
    expect(otraOpcion(def, '2')).toBe('1')
    const pieza = (posicion?: string): Pieza => ({ id: 'p', tipo: 'conmutador', ref: 'S1', x: 0, y: 0, rot: 0, espejo: false, props: posicion ? { posicion } : {} })
    expect(def.geometriaAccionada).toBeDefined()
    expect(estaAccionada(pieza(), def)).toBe(false)
    expect(estaAccionada(pieza('2'), def)).toBe(true)
  })
})
