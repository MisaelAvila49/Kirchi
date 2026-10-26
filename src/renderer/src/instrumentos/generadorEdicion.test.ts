// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { ajustesGenerador } from './ajustes'
import { AJUSTES_POR_OMISION, ajustesDeTextos, camposDeGenerador, resolverCamposGenerador } from './generadorEdicion'

const lib = libreriaDePrueba().piezas
const pieza = (props: Record<string, string> = {}): Pieza => ({ id: 'p', tipo: 'generador', ref: 'XFG1', x: 0, y: 0, rot: 0, espejo: false, props })

describe('los campos del generador en el doble clic', () => {
  it('traen el periodo, el mínimo y el máximo calculados de lo guardado', () => {
    const c = Object.fromEntries(camposDeGenerador(pieza({ frecuencia: '250', amplitud: '4', desplazamiento: '1' }), lib.get('generador')!).map((x) => [x.clave, x.inicial]))
    expect(c).toEqual({ periodo: '0.004', amplitud: '4', desplazamiento: '1', minimo: '-1', maximo: '3', desfase: '0', retardo: '0', pasos: '4' })
  })

  const ini = { frecuencia: '250', periodo: '0.004', amplitud: '4', desplazamiento: '1', minimo: '-1', maximo: '3', desfase: '0', retardo: '0', pasos: '4' }
  it('sin cambios no toca nada; el periodo se vuelve frecuencia', () => {
    expect(resolverCamposGenerador(ini, { ...ini })).toEqual({ ok: true, cambios: {} })
    expect(resolverCamposGenerador(ini, { ...ini, periodo: '2m' })).toEqual({ ok: true, cambios: { frecuencia: '500' } })
    expect(resolverCamposGenerador(ini, { ...ini, periodo: '0' })).toMatchObject({ ok: false, clave: 'periodo' })
    // La frecuencia gana si cambian las dos.
    expect(resolverCamposGenerador(ini, { ...ini, periodo: '2m', frecuencia: '1k' })).toEqual({ ok: true, cambios: { frecuencia: '1k' } })
  })
  it('el mínimo y el máximo se vuelven amplitud y desplazamiento, y la amplitud gana si también cambió', () => {
    expect(resolverCamposGenerador(ini, { ...ini, minimo: '0', maximo: '5' })).toEqual({ ok: true, cambios: { amplitud: '5', desplazamiento: '2.5' } })
    expect(resolverCamposGenerador(ini, { ...ini, maximo: '1' })).toEqual({ ok: true, cambios: { amplitud: '2', desplazamiento: '0' } })
    expect(resolverCamposGenerador(ini, { ...ini, minimo: '5' })).toMatchObject({ ok: false, clave: 'minimo' })
    expect(resolverCamposGenerador(ini, { ...ini, amplitud: '2', maximo: '9' })).toEqual({ ok: true, cambios: { amplitud: '2' } })
  })
  it('el desfase, el retardo y los pasos pasan tal cual', () => {
    expect(resolverCamposGenerador(ini, { ...ini, desfase: '90', pasos: '8', retardo: '1m' })).toEqual({ ok: true, cambios: { desfase: '90', retardo: '1m', pasos: '8' } })
  })
})

describe('una sola representación guardada', () => {
  const def = lib.get('generador')!
  const ids = new Set(def.props.map((d) => d.id))
  const ini = { frecuencia: '250', periodo: '0.004', amplitud: '4', desplazamiento: '1', minimo: '-1', maximo: '3', desfase: '0', retardo: '0', pasos: '4' }

  it('escribir el periodo o los extremos solo cambia propiedades de siempre: frecuencia, amplitud y desplazamiento', () => {
    const r = resolverCamposGenerador(ini, { ...ini, periodo: '2m', minimo: '0', maximo: '5' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Object.keys(r.cambios).sort()).toEqual(['amplitud', 'desplazamiento', 'frecuencia'])
    for (const k of Object.keys(r.cambios)) expect(ids.has(k)).toBe(true)
  })

  it('un documento viejo se lee igual: los mismos ids y los mismos números en Vpp y Offset', () => {
    expect(['frecuencia', 'amplitud', 'desplazamiento', 'desfase', 'retardo', 'pasos', 'forma', 'simetria', 'ciclo', 'salida', 'ideal'].every((k) => ids.has(k))).toBe(true)
    expect(ids.has('periodo') || ids.has('minimo') || ids.has('maximo') || ids.has('offset')).toBe(false)
    const r = ajustesGenerador(pieza({ frecuencia: '2k', forma: 'Pulso', amplitud: '3', desplazamiento: '1.5', ciclo: '40 %' }), def)
    expect(r).toMatchObject({ ok: true, a: { forma: 'Pulso', frecuencia: 2000, vpp: 3, desplazamiento: 1.5, ciclo: 0.4 } })
  })

  it('«Desplazamiento» se llama «Offset» solo en lo que se ve', () => {
    expect(def.props.find((d) => d.id === 'desplazamiento')?.nombre).toBe('Offset')
    expect(camposDeGenerador(pieza(), def).find((c) => c.clave === 'desplazamiento')?.titulo).toBe('Offset (V)')
  })
})

describe('los ajustes del editor a partir de sus textos', () => {
  it('lee los textos y conserva lo anterior donde el texto no se lee', () => {
    const a = ajustesDeTextos({ forma: 'Pulso', frecuencia: '2k', amplitud: '3', desplazamiento: '1.5', ciclo: '40 %', salida: 'apagada', ideal: 'sí', pasos: '8' })
    expect(a).toMatchObject({ forma: 'Pulso', frecuencia: 2000, vpp: 3, desplazamiento: 1.5, ciclo: 0.4, salida: false, ideal: true, pasos: 8 })
    const b = ajustesDeTextos({ frecuencia: '2 ', amplitud: 'abc', ciclo: 'x' }, a)
    expect(b).toMatchObject({ frecuencia: 2, vpp: 3, ciclo: 0.4, forma: 'Pulso' })
    expect(ajustesDeTextos({}).forma).toBe(AJUSTES_POR_OMISION.forma)
  })
})
