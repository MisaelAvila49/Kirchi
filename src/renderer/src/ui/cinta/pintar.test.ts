import { describe, expect, it } from 'vitest'
import { COLORES_CLAROS } from '../colores'
import { PLANOS, type Plano } from './planos'
import { estiloCapa, PAPEL_CSS, pinturaDe } from './pintar'

describe('cómo se pinta cada icono de la cinta', () => {
  it('grande y en la fila de arriba: el plano completo con el color de su orden', () => {
    expect(pinturaDe('guardar', 'grande')).toEqual({ variante: 'plano', capas: PLANOS.guardar.capas, h: 'azul', h2: 'azul' })
    expect(pinturaDe('configuracion', 'solo-icono')).toMatchObject({ variante: 'plano', h: 'gris' })
    expect(pinturaDe('tierra', 'chico')).toMatchObject({ variante: 'plano', h: 'gris', h2: 'verdeazul' })
  })

  it('a 14 px, la versión sin detalles; si no tiene, la misma', () => {
    expect(pinturaDe('cortar', 'chico').capas).toBe(PLANOS.cortar.chico)
    expect(pinturaDe('cortar', 'grande').capas).toBe(PLANOS.cortar.capas)
    expect(pinturaDe('pegar', 'chico').capas).toBe(PLANOS.pegar.capas)
    expect(pinturaDe('detener', 'secundaria')).toMatchObject({ variante: 'plano', h: 'rojo' })
    expect(pinturaDe('multimetro', 'franja').capas).toBe(PLANOS.multimetro.chico)
  })

  it('con iconosChicos en «linea», los de 14 px son trazos en el color de su orden y los grandes siguen planos', () => {
    expect(pinturaDe('cortar', 'chico', 'linea')).toEqual({ variante: 'linea', capas: null, h: 'magenta', h2: 'magenta' })
    expect(pinturaDe('cortar', 'grande', 'linea').variante).toBe('plano')
  })

  it('Simular de la fila de arriba y los iconos sin tono quedan en trazo', () => {
    expect(pinturaDe('simular', 'principal')).toEqual({ variante: 'trazo', capas: null })
    expect(pinturaDe('arriba', 'solo-icono')).toEqual({ variante: 'trazo', capas: null })
    expect(pinturaDe('abajo', 'grande')).toEqual({ variante: 'trazo', capas: null })
  })

  it('cada capa se pinta con variables, nunca con un color escrito', () => {
    for (const p of Object.values(PLANOS) as Plano[])
      for (const c of [...p.capas, ...(p.chico ?? [])])
        for (const v of Object.values(estiloCapa(c))) expect(v).toMatch(/^(var\(--[a-z0-9-]+\)|none|\d+(\.\d+)?)$/)
    expect(estiloCapa({ d: 'M0 0', relleno: 'h' })).toEqual({ fill: 'var(--h)', stroke: 'none' })
    expect(estiloCapa({ d: 'M0 0', trazo: 'gris', grosor: 1.6 })).toEqual({ fill: 'none', stroke: 'var(--ic-gris)', 'stroke-width': '1.6' })
  })

  it('los papeles fijos usan tokens que existen en colores.ts', () => {
    expect(PAPEL_CSS).toEqual({ h: 'var(--h)', h2: 'var(--h2)', tenue: 'var(--h-tenue)', borde: 'var(--h-borde)', contra: 'var(--ic-contra)', gris: 'var(--ic-gris)' })
    for (const n of ['ic-contra', 'ic-gris']) expect(COLORES_CLAROS).toHaveProperty([n])
  })
})
