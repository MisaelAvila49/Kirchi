// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { compilarNetlist } from '../netlist/netlist'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { cargaDeCanal, cargaDeMultimetro, resistenciaVista, UMBRAL_CARGA } from './carga'

const lib = libreriaDePrueba().piezas
const compilar = (partes: Parte[]) => {
  const d = conEtiquetas(lib, partes)
  return compilarNetlist(d, lib, calcularConexiones(d, lib))
}
const divisor = (extra: Parte[]): Parte[] => [
  { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
  { tipo: 'resistencia', ref: 'R1', props: { valor: '1M' }, pines: { '1': 'vcc', '2': 'm' } },
  { tipo: 'resistencia', ref: 'R2', props: { valor: '1M' }, pines: { '1': 'm', '2': '0' } },
  ...extra
]

describe('la carga de un instrumento', () => {
  it('la resistencia que ve el voltímetro sobre el divisor de 1 MΩ y 1 MΩ es 500 kΩ', () => {
    const r = compilar(divisor([{ tipo: 'multimetro', ref: 'XMM1', props: { modo: 'V DC' }, pines: { '+': 'm', COM: '0' } }]))
    const mm = r.instrumentos.multimetros.get('p_3')!
    const el = r.netlist!.elements
    const f = el[mm.elemento] as { a: number; b: number }
    expect(resistenciaVista(r.netlist!, f.a, f.b, new Set([mm.elemento]))).toBeCloseTo(5e5, 0)
  })

  it('el voltímetro de 10 MΩ lee 4.8 % menos; el ideal no carga', () => {
    const mm = (ideal: string): Parte => ({ tipo: 'multimetro', ref: 'XMM1', props: { modo: 'V DC', ideal }, pines: { '+': 'm', COM: '0' } })
    const r = compilar(divisor([mm('no')]))
    expect(cargaDeMultimetro(r, 'p_3')).toBe('Carga el circuito: lee 4.8 % menos que un instrumento ideal, por su entrada de 10 MΩ (estimado en continua).')
    expect(cargaDeMultimetro(compilar(divisor([mm('sí')])), 'p_3')).toBeNull()
  })

  it('el amperímetro de 0.1 Ω en serie con 1 Ω lee 9.1 % menos; con 100 Ω, menos de 1 %, nada', () => {
    const serie = (r: string): Parte[] => [
      { tipo: 'bateria', ref: 'B1', props: { voltaje: '9' }, pines: { '+': 'x', '-': '0' } },
      { tipo: 'multimetro', ref: 'XMM1', props: { modo: 'A DC' }, pines: { '+': 'x', COM: 'y' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: r }, pines: { '1': 'y', '2': '0' } }
    ]
    expect(cargaDeMultimetro(compilar(serie('1')), 'p_1')).toBe('Carga el circuito: lee 9.1 % menos que un instrumento ideal, por su resistencia de 100 mΩ (estimado en continua).')
    expect(cargaDeMultimetro(compilar(serie('100')), 'p_1')).toBeNull()
    expect(UMBRAL_CARGA).toBe(0.01)
  })

  it('el canal A del osciloscopio (1 MΩ) sobre el divisor lee 33.3 % menos', () => {
    const r = compilar(divisor([{ tipo: 'osciloscopio', ref: 'XSC1', props: {}, pines: { A: 'm', B: '0', C: '0', D: '0' } }]))
    expect(cargaDeCanal(r, 'p_3', 'A')).toBe('El canal A carga el circuito: lee 33.3 % menos que un instrumento ideal, por su entrada de 1 MΩ (estimado en continua).')
    expect(cargaDeCanal(r, 'p_3', 'B')).toBeNull()
  })
})
