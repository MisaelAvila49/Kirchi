// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { libreriaDePrueba } from '../prueba/libreria'
import type { PiezaDef } from '../piezas/tipos'
import type { PiezaAjena } from './ajeno'
import { buscarEquivalencia, indiceDeEquivalencias } from './equivalencias'

const lib = libreriaDePrueba().piezas
const indice = indiceDeEquivalencias(lib)
const pz = (tipo: string, extra: Partial<PiezaAjena> = {}): PiezaAjena => ({ ref: 'X1', tipo, props: {}, pines: [], ...extra })

describe('equivalencias de piezas ajenas', () => {
  it('Device:R de KiCad es la resistencia, exacta, y el valor no decide modelo', () => {
    expect(buscarEquivalencia(indice, lib, 'kicad', pz('Device:R', { valor: '1k' }))).toEqual({ tipo: 'exacta', pieza: 'resistencia', props: {} })
  })

  it('TL081 como dispositivo de Proteus es el amp-op con ese modelo', () => {
    expect(buscarEquivalencia(indice, lib, 'proteus', pz('TL081'))).toEqual({ tipo: 'exacta', pieza: 'amp-op', props: { modelo: 'TL081' } })
  })

  it('TL081CP con sufijo de encapsulado también coincide', () => {
    expect(buscarEquivalencia(indice, lib, 'proteus', pz('TL081CP'))).toEqual({ tipo: 'exacta', pieza: 'amp-op', props: { modelo: 'TL081' } })
  })

  it('TL081 como valor de un opamp de LTspice elige ese modelo', () => {
    expect(buscarEquivalencia(indice, lib, 'ltspice', pz('OpAmps\\opamp', { valor: 'TL081' }))).toEqual({ tipo: 'exacta', pieza: 'amp-op', props: { modelo: 'TL081' } })
  })

  it('un modelo ausente de Kirchi con símbolo npn de LTspice es aproximado y dice cuál se usa', () => {
    const r = buscarEquivalencia(indice, lib, 'ltspice', pz('npn', { valor: 'BC548' }))
    expect(r).toMatchObject({ tipo: 'aproximada', pieza: 'npn', props: { modelo: '2N2222' } })
    expect((r as { motivo: string }).motivo).toBe('BC548 no está en Kirchi: se usa el 2N2222.')
  })

  it('un modelo que sí está en Kirchi con símbolo npn es exacto', () => {
    expect(buscarEquivalencia(indice, lib, 'ltspice', pz('npn', { valor: 'BC547' }))).toEqual({ tipo: 'exacta', pieza: 'npn', props: { modelo: 'BC547' } })
  })

  it('un dispositivo desconocido de Proteus no tiene equivalencia', () => {
    expect(buscarEquivalencia(indice, lib, 'proteus', pz('LM13700'))).toEqual({ tipo: 'ninguna' })
  })

  it('SPICE Q1 con modelo 2N3904 de tipo npn es exacta', () => {
    expect(buscarEquivalencia(indice, lib, 'spice', pz('Q', { ref: 'Q1', modelo: '2N3904', props: { tipoModelo: 'npn' } }))).toEqual({ tipo: 'exacta', pieza: 'npn', props: { modelo: '2N3904' } })
  })

  it('SPICE con modelo pnp desconocido cae en la familia pnp como aproximada', () => {
    const r = buscarEquivalencia(indice, lib, 'spice', pz('Q', { ref: 'Q2', modelo: 'QX', props: { tipoModelo: 'pnp' } }))
    expect(r).toMatchObject({ tipo: 'aproximada', pieza: 'pnp' })
  })

  it('Falstad t se resuelve a npn o pnp según su bandera', () => {
    expect(buscarEquivalencia(indice, lib, 'falstad', pz('t', { props: { pnp: '-1' } }))).toMatchObject({ pieza: 'pnp' })
    expect(buscarEquivalencia(indice, lib, 'falstad', pz('t', { props: { pnp: '1' } }))).toMatchObject({ pieza: 'npn' })
  })

  it('la fila de un modelo concreto da sus propiedades', () => {
    expect(buscarEquivalencia(indice, lib, 'kicad', pz('Amplifier_Operational:LM358'))).toEqual({ tipo: 'exacta', pieza: 'amp-op', props: { modelo: 'LM358' } })
  })

  it('una equivalencia en lista se indexa entera y sin distinguir mayúsculas', () => {
    const def = {
      id: 'fantasma', prefijo: 'U', pines: [], props: [{ id: 'valor', defecto: '1' }],
      datos: { equivalencias: { kicad: ['Dev:A', 'Dev:B'] }, valores: { '*': {} } },
    } as unknown as PiezaDef
    const m = new Map([['fantasma', def]])
    const ix = indiceDeEquivalencias(m)
    expect(buscarEquivalencia(ix, m, 'kicad', pz('dev:a'))).toMatchObject({ tipo: 'exacta', pieza: 'fantasma' })
    expect(buscarEquivalencia(ix, m, 'kicad', pz('DEV:B'))).toMatchObject({ tipo: 'exacta', pieza: 'fantasma' })
  })
})
