import { describe, expect, it } from 'vitest'
import { alternarMedida, medidaDePantalla, textoDeMedidas, textoMedida } from './medidasVista'

describe('medidas a la vista', () => {
  it('cuatro cifras con su unidad; el ciclo en por ciento', () => {
    expect(textoMedida('vpp', { valor: 1.9048, razon: '' })).toEqual({ texto: '1.905 V', razon: null })
    expect(textoMedida('f', { valor: 999.7, razon: '' })).toEqual({ texto: '999.7 Hz', razon: null })
    expect(textoMedida('ciclo', { valor: 0.25, razon: '' })).toEqual({ texto: '25.0 %', razon: null })
  })

  it('sin sentido: la razón corta a la vista y la oración en el globo', () => {
    expect(textoMedida('f', { valor: Number.NaN, razon: 'sin-periodos' })).toEqual({ texto: 'sin periodo', razon: 'La señal no se repite en la pantalla: no tiene periodo.' })
    expect(textoMedida('ciclo', { valor: Number.NaN, razon: 'menos-de-un-ciclo' }).texto).toBe('menos de un ciclo')
    expect(textoMedida('vpp', { valor: Number.NaN, razon: 'apagado' }).texto).toBe('canal apagado')
    expect(textoMedida('periodo', undefined)).toEqual({ texto: 'sin datos', razon: 'Todavía no hay datos.' })
  })

  it('se agregan y se quitan; a lo más cuatro', () => {
    expect(alternarMedida([{ canal: 'A', medida: 'vpp' }], { canal: 'B', medida: 'f' })).toBe('Ap Bf')
    expect(alternarMedida([{ canal: 'A', medida: 'vpp' }, { canal: 'B', medida: 'f' }], { canal: 'A', medida: 'vpp' })).toBe('Bf')
    const cuatro = [{ canal: 'A', medida: 'vpp' }, { canal: 'A', medida: 'f' }, { canal: 'B', medida: 'rms' }, { canal: 'M', medida: 'vmax' }] as const
    expect(alternarMedida([...cuatro], { canal: 'C', medida: 'vpp' })).toBeNull()
    expect(textoDeMedidas([...cuatro])).toBe('Ap Af Be MM')
  })

  it('la medida de un canal en la pantalla, A − B incluido', () => {
    const medidas = Array.from({ length: 5 }, (_, c) => Array.from({ length: 8 }, (_, m) => ({ valor: c * 10 + m, razon: '' as const })))
    const p = { medidas } as never
    expect(medidaDePantalla(p, { canal: 'B', medida: 'f' })!.valor).toBe(15)
    expect(medidaDePantalla(p, { canal: 'M', medida: 'vpp' })!.valor).toBe(40)
    expect(medidaDePantalla(null, { canal: 'A', medida: 'vpp' })).toBeUndefined()
  })
})
