import { describe, expect, it } from 'vitest'
import type { AnalisisDoc } from '../../../compartido/analisis/config'
import { analisisNuevo, BASES_DE_PARAMETRO, conBase, configInicial, errorDeBorrador, nombreNuevo, NOMBRE_FICHA, parametroInicial, tipoDeFicha, TIPOS_FICHA } from './fichas'

const ctx = { fuentes: [{ id: 'p_v1', ref: 'V1' }], barribles: [{ id: 'p_r1', ref: 'R1', unidad: 'Ω' as const, valor: 1000 }] }
const sinNada = { fuentes: [], barribles: [] }

describe('fichas de análisis', () => {
  it('los seis tipos traen un análisis nuevo válido con los valores de arranque', () => {
    for (const t of TIPOS_FICHA) {
      const r = analisisNuevo(t, ctx, `a_${t}`, [])
      if (!r.ok) throw new Error(`${t}: ${r.error}`)
      expect(errorDeBorrador(r.analisis)).toBeNull()
      expect(tipoDeFicha(r.analisis)).toBe(t)
      expect(r.analisis.nombre).toBe(`${NOMBRE_FICHA[t]} 1`)
    }
  })

  it('el barrido de CD y el de CA piden una fuente, y el de parámetro una pieza que barrer', () => {
    for (const t of ['dc', 'ac'] as const) {
      const r = analisisNuevo(t, sinNada, 'a', [])
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(/fuente de voltaje/)
    }
    const p = analisisNuevo('param', { fuentes: [], barribles: [] }, 'a', [])
    expect(p.ok).toBe(false)
    if (!p.ok) expect(p.error).toMatch(/resistencia/)
    expect(analisisNuevo('op', sinNada, 'a', []).ok).toBe(true)
    expect(analisisNuevo('tran', sinNada, 'a', []).ok).toBe(true)
    expect(analisisNuevo('fourier', sinNada, 'a', []).ok).toBe(true)
  })

  it('el nombre es el primero libre del tipo', () => {
    const a = analisisNuevo('ac', ctx, 'a1', [])
    const b = analisisNuevo('ac', ctx, 'a2', a.ok ? [a.analisis] : [])
    expect(b.ok && b.analisis.nombre).toBe('CA / Bode 2')
    expect(nombreNuevo('op', [{ id: 'x', nombre: 'Punto de operación 1', config: { tipo: 'op' } }])).toBe('Punto de operación 2')
  })

  it('el barrido de arranque de una pieza va de la mitad al doble, logarítmico si el valor es positivo', () => {
    expect(parametroInicial({ id: 'p', valor: 1000 })).toEqual({ pieza: 'p', modo: 'log', desde: 500, hasta: 2000, puntos: 5 })
    expect(parametroInicial({ id: 'p', valor: 0 })).toEqual({ pieza: 'p', modo: 'lineal', desde: -1, hasta: 1, puntos: 5 })
  })

  it('cambiar la base de un barrido conserva su parámetro y su nombre', () => {
    const n = analisisNuevo('param', ctx, 'a', [])
    if (!n.ok) throw new Error(n.error)
    for (const t of BASES_DE_PARAMETRO) {
      const r = conBase(n.analisis, t, ctx)
      if (!r.ok) throw new Error(r.error)
      expect(r.analisis.config.tipo).toBe(t)
      expect(r.analisis.parametro).toEqual(n.analisis.parametro)
      expect(r.analisis.nombre).toBe(n.analisis.nombre)
      expect(errorDeBorrador(r.analisis)).toBeNull()
    }
  })

  it('un borrador inválido dice por qué con el mensaje del modelo', () => {
    const a: AnalisisDoc = { id: 'a', nombre: 'T', config: { tipo: 'tran', fin: -1 } }
    expect(errorDeBorrador(a)).toMatch(/mayor que cero/)
    const ac: AnalisisDoc = { id: 'a', nombre: 'AC', config: { tipo: 'ac', barrido: 'dec', puntos: 10, desde: 1e6, hasta: 10, fuente: 'p_v1', magnitud: 1 } }
    expect(errorDeBorrador(ac)).toMatch(/mayor que la inicial/)
  })
})

describe('entrada por omisión de un barrido', () => {
  const riel = { id: 'p_pwr1', ref: 'PWR1', clase: 'riel' as const }
  const gen = { id: 'p_xfg1', ref: 'XFG1', clase: 'generador' as const }
  const dc = { id: 'p_v1', ref: 'V1', clase: 'continua' as const }
  const senal = { id: 'p_v2', ref: 'V2', clase: 'senal' as const }
  const barribles: [] = []

  it('CA: el generador gana aunque un riel de alimentación le gane en el orden de las referencias', () => {
    const r = configInicial('ac', { fuentes: [riel, gen] })
    expect(r).toMatchObject({ tipo: 'ac', fuente: 'p_xfg1', magnitud: 1 })
    expect(configInicial('ac', { fuentes: [riel, dc, senal, gen] })).toMatchObject({ fuente: 'p_xfg1' })
  })

  it('CA: sin generador, cualquier fuente que no sea de CD; luego una de CD, y nunca un riel', () => {
    expect(configInicial('ac', { fuentes: [riel, dc, senal] })).toMatchObject({ fuente: 'p_v2' })
    expect(configInicial('ac', { fuentes: [riel, dc] })).toMatchObject({ fuente: 'p_v1' })
    const solo = configInicial('ac', { fuentes: [riel] })
    expect(solo).toHaveProperty('error')
    expect(analisisNuevo('ac', { fuentes: [riel], barribles }, 'a', []).ok).toBe(false)
  })

  it('CD: prefiere una fuente de CD y deja un riel para el final', () => {
    expect(configInicial('dc', { fuentes: [riel, gen, dc] })).toMatchObject({ fuente: 'p_v1' })
    expect(configInicial('dc', { fuentes: [riel, gen] })).toMatchObject({ fuente: 'p_xfg1' })
    expect(configInicial('dc', { fuentes: [riel] })).toMatchObject({ fuente: 'p_pwr1' })
  })

  it('sin clase (contexto de antes) una fuente cuenta como de CD y la primera se conserva', () => {
    expect(configInicial('ac', { fuentes: [{ id: 'a', ref: 'V1' }, { id: 'b', ref: 'V2' }] })).toMatchObject({ fuente: 'a' })
  })
})
