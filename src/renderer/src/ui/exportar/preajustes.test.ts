import { describe, expect, it } from 'vitest'
import { ASPECTO_ANALISIS, ASPECTO_INFORME, ASPECTO_OSCILOSCOPIO } from '../../../../compartido/grafica/aspecto'
import { exportarPorOmision } from '../../../../compartido/ajustes'
import { ADORNOS_PREAJUSTE, aplicarPreajuste, OPCIONES_PREAJUSTE_ESQUEMA, preajusteDe, preajusteEsquemaDe } from './preajustes'

describe('preajustes Instrumento e Informe de la exportación', () => {
  it('Instrumento lleva marco, franja de escalas y resplandor; Informe, título y leyenda', () => {
    expect(ADORNOS_PREAJUSTE.instrumento).toEqual({ titulo: false, leyenda: false, marco: true, resplandor: true })
    expect(ADORNOS_PREAJUSTE.informe).toEqual({ titulo: true, leyenda: true, marco: false, resplandor: false })
  })

  it('se reconoce el preajuste por sus adornos y uno cambiado a mano queda a medida', () => {
    expect(preajusteDe(ADORNOS_PREAJUSTE.instrumento)).toBe('instrumento')
    expect(preajusteDe(ADORNOS_PREAJUSTE.informe)).toBe('informe')
    expect(preajusteDe({ ...ADORNOS_PREAJUSTE.informe, resplandor: true })).toBeNull()
  })

  it('Informe de una pantalla pone el eje abajo y las letras en negro, con sus adornos', () => {
    const e = aplicarPreajuste('pantalla', 'informe', ASPECTO_OSCILOSCOPIO)
    expect(e.aspecto).toMatchObject({ ejeX: 'abajo', textoTono: 'negro', grosor: ASPECTO_OSCILOSCOPIO.grosor, rejilla: true })
    expect(e.aspecto.informe).toBeUndefined()
    expect(e.adornos).toEqual(ADORNOS_PREAJUSTE.informe)
    expect(aplicarPreajuste('pantalla', 'instrumento', e.aspecto)).toEqual({ aspecto: ASPECTO_OSCILOSCOPIO, adornos: ADORNOS_PREAJUSTE.instrumento })
  })

  it('Informe de una gráfica es el anterior y vuelve a Instrumento', () => {
    const i = aplicarPreajuste('grafica', 'informe', ASPECTO_ANALISIS)
    expect(i.aspecto).toMatchObject({ informe: true, ejeX: 'abajo', textoTono: 'negro' })
    expect(aplicarPreajuste('grafica', 'instrumento', i.aspecto).aspecto).toEqual(ASPECTO_ANALISIS)
    expect(ASPECTO_INFORME.informe).toBe(true)
  })

  it('elegir un preajuste conserva el tema de la figura y los dBV absolutos', () => {
    const a = aplicarPreajuste('grafica', 'informe', { ...ASPECTO_ANALISIS, tema: 'oscuro', dbAbsoluto: true }).aspecto
    expect(a.tema).toBe('oscuro')
    expect(a.dbAbsoluto).toBe(true)
    expect(aplicarPreajuste('grafica', 'instrumento', ASPECTO_ANALISIS).aspecto.dbAbsoluto).toBeUndefined()
  })
})

describe('los preajustes del esquema', () => {
  it('Informe y Pantalla se reconocen y un cambio a mano los deja «a medida»', () => {
    const base = exportarPorOmision()
    const informe = { ...base, ...OPCIONES_PREAJUSTE_ESQUEMA.informe }
    expect(preajusteEsquemaDe(informe)).toBe('informe')
    expect(preajusteEsquemaDe({ ...base, ...OPCIONES_PREAJUSTE_ESQUEMA.pantalla })).toBe('pantalla')
    expect(preajusteEsquemaDe({ ...informe, rejilla: true })).toBeNull()
    expect(OPCIONES_PREAJUSTE_ESQUEMA.informe).toEqual({ fondo: 'blanco', rejilla: false, coloresVoltaje: false, tintaNegra: true })
  })
})
