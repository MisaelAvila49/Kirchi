import { describe, expect, it } from 'vitest'
import { RANGOS_DE_UNIDAD, rangoDeValor, valoresDeRango, vistaCatalogo, vistaSerie } from './vistaSerie'

describe('vistaSerie', () => {
  it('4.8 kΩ en E24: avisa, ofrece 4.3, 4.7 y 5.1 k y propone 4.7 k', () => {
    const v = vistaSerie('4.8k', 'Ω', 'E24')!
    expect(v.nota.tipo).toBe('aviso')
    expect(v.nota.texto).toBe('4.8 kΩ no es comercial, el más cercano en E24 es 4.7 kΩ.')
    expect(v.nota.usar).toEqual({ texto: '4.7k', etiqueta: 'Usar 4.7 kΩ' })
    expect(v.vecinos.map((c) => c.etiqueta)).toEqual(['4.3 kΩ', '4.7 kΩ', '5.1 kΩ'])
    expect(v.vecinos.map((c) => c.texto)).toEqual(['4.3k', '4.7k', '5.1k'])
    expect(v.vecinos.map((c) => c.activo)).toEqual([false, false, false])
  })
  it('un valor de la serie dice que es comercial, con su tolerancia, y marca su botón', () => {
    const v = vistaSerie('4k7', 'Ω', 'E12')!
    expect(v.nota).toEqual({ tipo: 'ok', texto: '4.7 kΩ es comercial en E12 (tolerancia 10 %).' })
    expect(v.vecinos.map((c) => c.activo)).toEqual([false, true, false])
  })
  it('5.1 kΩ es comercial en E24 y no en E12', () => {
    expect(vistaSerie('5.1k', 'Ω', 'E24')!.nota.tipo).toBe('ok')
    expect(vistaSerie('5.1k', 'Ω', 'E12')!.nota.tipo).toBe('aviso')
  })
  it('libre: sin botones y sin aviso', () => {
    const v = vistaSerie('4.8k', 'Ω', 'libre')!
    expect(v.vecinos).toEqual([])
    expect(v.nota).toEqual({ tipo: 'ok', texto: 'Valor libre. Cualquier número sirve en la simulación, aunque no se consiga en tienda.' })
  })
  it('capacitores con µ y nF', () => {
    const v = vistaSerie('4.8u', 'F', 'E6')!
    expect(v.nota.texto).toBe('4.8 µF no es comercial, el más cercano en E6 es 4.7 µF.')
    expect(v.vecinos.map((c) => c.etiqueta)).toEqual(['3.3 µF', '4.7 µF', '6.8 µF'])
  })
  it('un texto que no se lee, cero o negativo no tiene vista (el campo ya dice su error)', () => {
    expect(vistaSerie('abc', 'Ω', 'E24')).toBeNull()
    expect(vistaSerie('0', 'Ω', 'E24')).toBeNull()
    expect(vistaSerie('-5', 'Ω', 'E24')).toBeNull()
  })
})

describe('vistaCatalogo', () => {
  const comunes = ['3.3', '4.7', '5.1', '12']
  it('un valor del catálogo marca su botón y no es personalizado', () => {
    const v = vistaCatalogo('5.1', 'V', comunes)
    expect(v.personalizado).toBe(false)
    expect(v.opciones.map((o) => [o.etiqueta, o.activo])).toEqual([['3.3 V', false], ['4.7 V', false], ['5.1 V', true], ['12 V', false]])
  })
  it('lo mismo escrito de otra forma sigue siendo del catálogo', () => {
    expect(vistaCatalogo('5.10', 'V', comunes).personalizado).toBe(false)
    expect(vistaCatalogo('5.1 V', 'V', comunes).opciones[2].activo).toBe(true)
  })
  it('un valor libre de un .kir viejo abre como Personalizado con el mismo texto', () => {
    const v = vistaCatalogo('5.6', 'V', comunes)
    expect(v.personalizado).toBe(true)
    expect(v.opciones.some((o) => o.activo)).toBe(false)
  })
  it('un texto que no se lee también es personalizado', () => {
    expect(vistaCatalogo('x', 'V', comunes).personalizado).toBe(true)
  })
})

describe('rangos de la lista de valores comerciales', () => {
  it('los valores menores de 1 Ω (0.1, 0.22, 0.47) salen en el rango mΩ y con su nombre en miliohmios', () => {
    const v = valoresDeRango('E12', 'Ω', 'mΩ', '0.22')
    const textos = v.map((x) => x.etiqueta)
    expect(textos).toContain('220 mΩ')
    expect(textos).toContain('100 mΩ')
    expect(textos).toContain('470 mΩ')
    expect(v.find((x) => x.activo)?.etiqueta).toBe('220 mΩ')
    expect(v.length).toBeGreaterThan(30)
    expect(valoresDeRango('E12', 'Ω', 'Ω', '').map((x) => x.etiqueta)[0]).toBe('1 Ω')
  })

  it('cada unidad con serie ofrece sus rangos: mΩ, Ω, kΩ y MΩ; pF, nF, µF y mF; nH, µH, mH y H', () => {
    expect(RANGOS_DE_UNIDAD.Ω!.map((r) => r.etiqueta)).toEqual(['mΩ', 'Ω', 'kΩ', 'MΩ'])
    expect(RANGOS_DE_UNIDAD.F!.map((r) => r.etiqueta)).toEqual(['pF', 'nF', 'µF', 'mF'])
    expect(RANGOS_DE_UNIDAD.H!.map((r) => r.etiqueta)).toEqual(['nH', 'µH', 'mH', 'H'])
    expect(RANGOS_DE_UNIDAD.V).toBeUndefined()
  })
  it('el rango de un valor es el de su unidad de ingeniería, y uno fuera de todos cae en el más cercano', () => {
    expect(rangoDeValor(15e3, 'Ω')).toBe('kΩ')
    expect(rangoDeValor(470, 'Ω')).toBe('Ω')
    expect(rangoDeValor(1e6, 'Ω')).toBe('MΩ')
    expect(rangoDeValor(2.2e-6, 'F')).toBe('µF')
    expect(rangoDeValor(0.47, 'Ω')).toBe('mΩ')
    expect(rangoDeValor(1, 'Ω')).toBe('Ω')
    expect(rangoDeValor(0.01, 'Ω')).toBe('mΩ')
    expect(rangoDeValor(5e9, 'Ω')).toBe('MΩ')
    expect(rangoDeValor(1, 'V')).toBeNull()
  })
  it('solo trae los valores de la serie de ese rango, con el texto que se escribe y el que se lee', () => {
    const k = valoresDeRango('E12', 'Ω', 'kΩ', '15k')
    expect(k).toHaveLength(36)
    expect(k[0]).toEqual({ texto: '1k', etiqueta: '1 kΩ', activo: false })
    expect(k.find((o) => o.activo)).toEqual({ texto: '15k', etiqueta: '15 kΩ', activo: true })
    expect(k.every((o) => /kΩ$/.test(o.etiqueta))).toBe(true)
    const o = valoresDeRango('E24', 'Ω', 'Ω', '')
    expect(o).toHaveLength(72)
    expect(valoresDeRango('E12', 'F', 'nF', '100n').find((x) => x.activo)?.etiqueta).toBe('100 nF')
    expect(valoresDeRango('E6', 'F', 'mF', '').map((x) => x.etiqueta)).toEqual(['1 mF', '1.5 mF', '2.2 mF', '3.3 mF', '4.7 mF', '6.8 mF', '10 mF', '15 mF', '22 mF', '33 mF', '47 mF', '68 mF'])
  })
})
