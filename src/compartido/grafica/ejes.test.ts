import { describe, expect, it } from 'vitest'
import { formatoConDecimales, decimalesAjustados, decimalesDePaso, decimalesPorOmision, textoCifraEje, etiquetaEnPrefijo, indiceMasCercano, ladoPorArrastre, posicionXPorArrastre, prefijoParaRango, rotuloDeEje, unidadConPrefijo, valorEnPrefijo } from './ejes'

describe('dónde queda un eje al arrastrarlo', () => {
  it('el vertical se pega al tercio donde se suelta: izquierda, en medio o derecha', () => {
    expect(ladoPorArrastre(0.05, 'izquierda')).toBe('izquierda')
    expect(ladoPorArrastre(0.5, 'izquierda')).toBe('centro')
    expect(ladoPorArrastre(0.95, 'izquierda')).toBe('derecha')
  })
  it('con histéresis: en medio se queda hasta pasar un quinto de cada lado', () => {
    expect(ladoPorArrastre(0.3, 'centro')).toBe('centro')
    expect(ladoPorArrastre(0.15, 'centro')).toBe('izquierda')
    expect(ladoPorArrastre(0.7, 'centro')).toBe('centro')
    expect(ladoPorArrastre(0.85, 'centro')).toBe('derecha')
    // Viniendo de un borde, entrar al centro exige pasar de 0.3 (o 0.7): no basta rozarlo.
    expect(ladoPorArrastre(0.22, 'izquierda')).toBe('izquierda')
    expect(ladoPorArrastre(0.35, 'izquierda')).toBe('centro')
    expect(ladoPorArrastre(0.78, 'derecha')).toBe('derecha')
    expect(ladoPorArrastre(0.65, 'derecha')).toBe('centro')
  })
  it('una fracción fuera de [0, 1] se acota', () => {
    expect(ladoPorArrastre(-3, 'centro')).toBe('izquierda')
    expect(ladoPorArrastre(9, 'centro')).toBe('derecha')
    expect(ladoPorArrastre(Number.NaN, 'derecha')).toBe('derecha')
  })
  it('el del tiempo o la frecuencia se pega arriba, en medio o abajo', () => {
    expect(posicionXPorArrastre(0.05, 'abajo')).toBe('arriba')
    expect(posicionXPorArrastre(0.5, 'abajo')).toBe('centro')
    expect(posicionXPorArrastre(0.97, 'arriba')).toBe('abajo')
    expect(posicionXPorArrastre(0.3, 'centro')).toBe('centro')
  })
})

describe('la unidad mostrada de un eje, independiente de la escala', () => {
  it('500 mV por división mostrado en V se rotula 0, 0.5, 1.0', () => {
    expect([0, 0.5, 1].map((v) => etiquetaEnPrefijo(v, 'base', 0.5))).toEqual(['0', '0.5', '1.0'])
  })
  it('los mismos valores en mV no llevan decimales', () => {
    expect([0, 0.5, 1].map((v) => etiquetaEnPrefijo(v, 'm', 0.5))).toEqual(['0', '500', '1000'])
  })
  it('los negativos usan el menos tipográfico y un paso fino abre decimales', () => {
    expect(etiquetaEnPrefijo(-0.25, 'base', 0.25)).toBe('−0.25')
    expect(etiquetaEnPrefijo(2e-6, 'm', 5e-7)).toBe('0.0020')
    expect(etiquetaEnPrefijo(1e-3, 'u', 5e-4)).toBe('1000')
  })
  it('los decimales salen del paso, no del valor', () => {
    expect(decimalesDePaso(0.5)).toBe(1)
    expect(decimalesDePaso(2)).toBe(0)
    expect(decimalesDePaso(0.025)).toBe(3)
    expect(decimalesDePaso(0)).toBe(0)
  })
  it('la unidad lleva el prefijo una sola vez: mV, µs, kHz', () => {
    expect(unidadConPrefijo('V', 'm')).toBe('mV')
    expect(unidadConPrefijo('s', 'u')).toBe('µs')
    expect(unidadConPrefijo('Hz', 'k')).toBe('kHz')
    expect(unidadConPrefijo('V', 'base')).toBe('V')
    expect(unidadConPrefijo('dB', 'm')).toBe('dB')
    expect(unidadConPrefijo('°', 'k')).toBe('°')
  })
  it('el prefijo automático es el que deja cifras de uno a tres dígitos enteros', () => {
    expect(prefijoParaRango(0.002, 'V')).toBe('m')
    expect(prefijoParaRango(2, 'V')).toBe('base')
    expect(prefijoParaRango(5e-6, 's')).toBe('u')
    expect(prefijoParaRango(12000, 'Hz')).toBe('k')
    expect(prefijoParaRango(40, 'dB')).toBe('base')
    expect(prefijoParaRango(0, 'V')).toBe('base')
  })
  it('el prefijo automático baja hasta p y f cuando el rango es muy chico', () => {
    expect(prefijoParaRango(3e-9, 's')).toBe('n')
    expect(prefijoParaRango(4e-12, 'F')).toBe('p')
    expect(prefijoParaRango(2e-15, 'F')).toBe('f')
  })
  it('valorEnPrefijo escribe en notación fija, sin exponente', () => {
    expect(valorEnPrefijo(1e-7, 'u')).toBe('0.1')
    expect(valorEnPrefijo(1e-13, 'u')).toBe('0.0000001')
    expect(valorEnPrefijo(-2.5e-8, 'u')).toBe('−0.025')
    expect(valorEnPrefijo(1500, 'k')).toBe('1.5')
    expect(valorEnPrefijo(100, 'base')).toBe('100')
    expect(valorEnPrefijo(0, 'base')).toBe('0')
  })
  it('el rótulo de un eje usa el prefijo elegido o, sin él, el automático', () => {
    expect(rotuloDeEje('V', 0.002, null)).toEqual({ prefijo: 'm', unidad: 'mV' })
    expect(rotuloDeEje('V', 0.002, 'base')).toEqual({ prefijo: 'base', unidad: 'V' })
    expect(rotuloDeEje('dB', 40, 'k')).toEqual({ prefijo: 'base', unidad: 'dB' })
  })
})

describe('el punto de datos más cercano al puntero', () => {
  const x = Float64Array.from([0, 1, 2, 4, 8])
  it('elige el índice con el valor más cercano en un eje lineal', () => {
    expect(indiceMasCercano(x, 0.4, 'lin')).toBe(0)
    expect(indiceMasCercano(x, 0.6, 'lin')).toBe(1)
    expect(indiceMasCercano(x, 3.1, 'lin')).toBe(3)
    expect(indiceMasCercano(x, 7, 'lin')).toBe(4)
  })
  it('en un eje logarítmico mide la cercanía en décadas', () => {
    const f = Float64Array.from([10, 100, 1000])
    expect(indiceMasCercano(f, 20, 'log')).toBe(0)
    expect(indiceMasCercano(f, 400, 'log')).toBe(2)
  })
  it('funciona con un barrido decreciente y con lo que queda fuera de los datos', () => {
    const d = Float64Array.from([8, 4, 2, 1, 0])
    expect(indiceMasCercano(d, 1.4, 'lin')).toBe(3)
    expect(indiceMasCercano(x, -5, 'lin')).toBe(0)
    expect(indiceMasCercano(x, 99, 'lin')).toBe(4)
    expect(indiceMasCercano(new Float64Array(0), 1, 'lin')).toBe(-1)
  })
})

describe('decimales de los ejes', () => {
  it('un número elegido se respeta con cualquier prefijo', () => {
    expect(etiquetaEnPrefijo(2.5e-3, 'm', 5e-4, 2, 2)).toBe('2.50')
    expect(etiquetaEnPrefijo(1, 'base', 0.5, 1, 1)).toBe('1.0')
    expect(etiquetaEnPrefijo(2e-6, 'm', 5e-7, 0, 1)).toBe('0')
    expect(etiquetaEnPrefijo(1234.5678, 'base', 0.0001, 4, 1)).toBe('1234.5678')
    expect(etiquetaEnPrefijo(2000, 'base', 500, 4, 1)).toBe('2000.0000')
    expect(etiquetaEnPrefijo(0.15, 'm', 0.05, 3, 1)).toBe('150.000')
    expect(etiquetaEnPrefijo(-0.005, 'm', 0.005, 3, 1)).toBe('−5.000')
    expect(etiquetaEnPrefijo(-0.25, 'base', 0.25, 1, 1)).toBe('−0.3')
  })
  it('sin elección siguen al paso, sin ceros de más', () => {
    expect(decimalesPorOmision('s')).toBe(2)
    expect(decimalesPorOmision('V')).toBe(1)
    expect(etiquetaEnPrefijo(1, 'base', 1, undefined, 1)).toBe('1')
    expect(etiquetaEnPrefijo(1.5, 'base', 0.5, undefined, 1)).toBe('1.5')
    expect(etiquetaEnPrefijo(0.05, 'base', 0.05, undefined, 1)).toBe('0.05')
    expect(etiquetaEnPrefijo(0.0125, 'base', 0.0125, undefined, 2)).toBe('0.0125')
    expect(etiquetaEnPrefijo(2e-6, 'm', 5e-7, undefined, 2)).toBe('0.0020')
    expect(etiquetaEnPrefijo(1e-3, 'u', 5e-4, undefined, 2)).toBe('1000')
  })
  it('«auto» da los decimales que pide el paso', () => {
    expect(etiquetaEnPrefijo(0.5, 'base', 0.5, 'auto', 1)).toBe('0.5')
    expect(etiquetaEnPrefijo(2e-6, 'm', 5e-7, 'auto', 1)).toBe('0.0020')
    expect(etiquetaEnPrefijo(1, 'base', 2, 'auto', 1)).toBe('1')
  })
  it('el cero se escribe sin decimales y un redondeo a cero no lleva signo', () => {
    expect(etiquetaEnPrefijo(0, 'base', 0.5, 2, 2)).toBe('0')
    expect(textoCifraEje(-0.004, 0.01, 2)).toBe('0.00')
  })
})

describe('decimales que se ajustan al tramo', () => {
  it('sin elección no se guarda nada: las cifras ya siguen al paso', () => {
    expect(decimalesAjustados(0.05, undefined, 2)).toBeNull()
    expect(decimalesAjustados(0.005, undefined, 2)).toBeNull()
  })
  it('un número elegido se respeta mientras las marcas se distingan y sube solo si no', () => {
    expect(decimalesAjustados(0.05, 2, 2)).toBeNull()
    expect(decimalesAjustados(0.02, 2, 2)).toBeNull()
    expect(decimalesAjustados(0.005, 2, 2)).toBe(3)
    expect(decimalesAjustados(0.5, 3, 2)).toBeNull()
  })
  it('«auto» sigue en «auto»', () => {
    expect(decimalesAjustados(0.0005, 'auto', 2)).toBeNull()
  })
  it('lo que pide más de cuatro se queda en cuatro', () => {
    expect(decimalesAjustados(0.000005, 2, 2)).toBe(4)
    expect(decimalesAjustados(0.000005, 4, 2)).toBeNull()
  })
})


describe('formato de las etiquetas de valor', () => {
  it('los decimales propios mandan sobre los del eje', () => {
    const f = { prefijo: 'm' as const, decimales: 4 as const, omision: 2 }
    expect(formatoConDecimales(f, 1)?.decimales).toBe(1)
    expect(formatoConDecimales(f)?.decimales).toBe(4)
    expect(formatoConDecimales(undefined, 1)).toBeUndefined()
  })
})
