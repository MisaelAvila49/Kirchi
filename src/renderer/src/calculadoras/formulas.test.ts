import { describe, expect, it } from 'vitest'
import { amplificador, astable555, type Calculo, divisor, filtroRC, led, monoestable555, potenciaNominal, vfLed, VT } from './formulas'
import { redondeoDe } from './redondeo'

const E12 = redondeoDe('E12')
const LED_ROJO = { is: 1.5e-17, n: 2 }
const LED_AZUL = { is: 1.83e-28, n: 2 }
const LM741 = { dhi: 1, dlo: 1, gbw: 1e6 }

function ok<T extends object>(r: Calculo<T>): { ok: true } & T {
  if (!r.ok) throw new Error(r.error)
  return r
}
const error = (r: Calculo<object>) => (r.ok ? '' : r.error)

describe('redondeo', () => {
  it('E12 y E6 llevan al comercial más cercano por razón y «libre» no toca nada', () => {
    expect(E12.r(5555.6)).toBe(5600)
    expect(E12.r(4444.4)).toBe(4700)
    expect(E12.c(159.15e-9)).toBeCloseTo(150e-9, 15)
    expect(redondeoDe('E24').r(4444.4)).toBe(4300)
    expect(redondeoDe('libre').r(4444.4)).toBe(4444.4)
  })
  it('un capacitor desde 1 µF se redondea a la E6 (es electrolítico)', () => {
    expect(redondeoDe('E24').c(1.3e-6)).toBeCloseTo(1.5e-6, 12)
    expect(redondeoDe('E24').c(910e-9)).toBeCloseTo(910e-9, 15)
  })
})

describe('potencia nominal', () => {
  it('1/4 W no necesita cambio, lo que pasa pide la siguiente y más de 5 W no tiene resistencia', () => {
    expect(potenciaNominal(0.25)).toBeNull()
    expect(potenciaNominal(0.26)).toBe('0.5 W')
    expect(potenciaNominal(0.9)).toBe('1 W')
    expect(potenciaNominal(5)).toBe('5 W')
    expect(potenciaNominal(5.1)).toBeNull()
  })
})

describe('divisor', () => {
  it('9 V a 5 V con 10 kΩ en total: 4.444 k y 5.556 k exactos', () => {
    const r = ok(divisor({ vin: 9, vout: 5, modo: 'resistencia', valor: 10e3 }))
    expect(r.r1).toBeCloseTo(4444.44, 1)
    expect(r.r2).toBeCloseTo(5555.56, 1)
    expect(r.voutReal).toBeCloseTo(5, 9)
    expect(r.desvio).toBeCloseTo(0, 9)
  })
  it('con E12 la pareja conserva la suma pedida (±10 %) y no empeora el Vout del redondeo por separado: 4.7 k y 5.6 k dan 4.89 V', () => {
    const entrada = { vin: 9, vout: 5, modo: 'resistencia' as const, valor: 10e3 }
    const r = ok(divisor(entrada, E12))
    expect([r.r1c, r.r2c]).toEqual([4700, 5600])
    expect(Math.abs(r.r1c + r.r2c) / 10e3 - 1).toBeLessThanOrEqual(0.1)
    const ingenuo = (9 * E12.r(r.r2)) / (E12.r(r.r1) + E12.r(r.r2))
    expect(Math.abs(r.voutReal - 5)).toBeLessThanOrEqual(Math.abs(ingenuo - 5) + 1e-12)
  })
  it('con corriente como dato, la corriente resultante queda dentro del paso de la serie', () => {
    for (const serie of ['E6', 'E12', 'E24'] as const) {
      const red = redondeoDe(serie)
      const r = ok(divisor({ vin: 12, vout: 3.3, modo: 'corriente', valor: 1e-3 }, red))
      expect(Math.abs(r.corriente / 1e-3 - 1)).toBeLessThanOrEqual(red.tol! + 1e-9)
    }
  })
  it('la búsqueda nunca queda peor que redondear por separado y desempata por la resistencia total pedida', () => {
    for (const [vin, vout] of [[5, 3.3], [12, 5], [9, 1.8], [24, 12.1], [3.3, 1]]) {
      const r = ok(divisor({ vin, vout, modo: 'resistencia', valor: 10e3 }, E12))
      const ingenuo = (vin * E12.r(r.r2)) / (E12.r(r.r1) + E12.r(r.r2))
      expect(Math.abs(r.voutReal - vout)).toBeLessThanOrEqual(Math.abs(ingenuo - vout) + 1e-12)
      expect(Math.abs((r.r1c + r.r2c) / 10e3 - 1)).toBeLessThanOrEqual(0.1 + 1e-9)
    }
    // 1 k y 1 k, 10 k y 10 k dan el mismo Vout: gana la suma más cercana a los 10 k pedidos.
    const mitad = ok(divisor({ vin: 10, vout: 5, modo: 'resistencia', valor: 10e3 }, E12))
    expect([mitad.r1c, mitad.r2c]).toEqual([4700, 4700])
  })
  it('por corriente: 12 V a 3.3 V con 1 mA pide 8.7 k y 3.3 k', () => {
    const r = ok(divisor({ vin: 12, vout: 3.3, modo: 'corriente', valor: 1e-3 }))
    expect(r.r1).toBeCloseTo(8700, 6)
    expect(r.r2).toBeCloseTo(3300, 6)
  })
  it('avisa si una resistencia pasa de 1/4 W y siempre recuerda la carga', () => {
    const r = ok(divisor({ vin: 12, vout: 6, modo: 'resistencia', valor: 100 }))
    expect(r.avisos.some((a) => a.includes('1/4 W'))).toBe(true)
    const tranquilo = ok(divisor({ vin: 9, vout: 5, modo: 'resistencia', valor: 10e3 }))
    expect(tranquilo.avisos.some((a) => a.includes('1/4 W'))).toBe(false)
    expect(tranquilo.nota).toMatch(/sin carga/)
  })
  it('casos borde: Vout ≥ Vin, ceros, negativos y NaN dan un error con explicación', () => {
    expect(error(divisor({ vin: 5, vout: 5, modo: 'resistencia', valor: 1e3 }))).toMatch(/menor que Vin/)
    expect(error(divisor({ vin: 5, vout: 9, modo: 'resistencia', valor: 1e3 }))).toMatch(/menor que Vin/)
    expect(error(divisor({ vin: 0, vout: 1, modo: 'resistencia', valor: 1e3 }))).toMatch(/Vin/)
    expect(error(divisor({ vin: 5, vout: -1, modo: 'resistencia', valor: 1e3 }))).toMatch(/Vout/)
    expect(error(divisor({ vin: 5, vout: 2, modo: 'corriente', valor: 0 }))).toMatch(/corriente/)
    expect(error(divisor({ vin: 5, vout: 2, modo: 'resistencia', valor: -3 }))).toMatch(/resistencia/)
    expect(error(divisor({ vin: NaN, vout: 2, modo: 'resistencia', valor: 3 }))).toMatch(/Vin/)
  })
})

describe('LED con resistencia', () => {
  it('el voltaje del LED sigue al modelo del motor: rojo cerca de 1.77 V a 10 mA y azul cerca de 3.06 V', () => {
    expect(vfLed(LED_ROJO, 0.01)).toBeCloseTo(1.77, 1)
    expect(vfLed(LED_AZUL, 0.01)).toBeCloseTo(3.06, 1)
    expect(VT).toBeCloseTo(0.025865, 6)
  })
  it('rojo a 5 V y 10 mA: R ≈ 323 Ω exacta, 330 Ω comercial y unos 9.8 mA reales', () => {
    const r = ok(led({ vs: 5, i: 0.01, modelo: LED_ROJO }, E12))
    expect(r.r).toBeCloseTo((5 - r.vf) / 0.01, 9)
    expect(r.r).toBeGreaterThan(320)
    expect(r.r).toBeLessThan(327)
    expect(r.rc).toBe(330)
    expect(r.iReal).toBeGreaterThan(0.0095)
    expect(r.iReal).toBeLessThan(0.01)
    // La corriente real cumple la ecuación del circuito.
    expect(r.vfReal + r.iReal * 330).toBeCloseTo(5, 6)
    expect(r.avisos).toEqual([])
  })
  it('una fuente que no alcanza da error: azul con 3 V', () => {
    expect(error(led({ vs: 3, i: 0.01, modelo: LED_AZUL }))).toMatch(/no alcanza/)
    expect(error(led({ vs: 1.5, i: 0.01, modelo: LED_ROJO }))).toMatch(/no alcanza/)
    // Con 3.3 V sí enciende, pero la resistencia recibe poco y la corriente es muy sensible.
    const justo = ok(led({ vs: 3.3, i: 0.01, modelo: LED_AZUL }))
    expect(justo.avisos.some((a) => a.includes('solo le quedan'))).toBe(true)
  })
  it('avisa si la corriente real pasa de 20 mA y si la resistencia pasa de 1/4 W', () => {
    const r = ok(led({ vs: 5, i: 0.03, modelo: LED_ROJO }))
    expect(r.avisos.some((a) => a.includes('nominales'))).toBe(true)
    const p = ok(led({ vs: 48, i: 0.02, modelo: LED_ROJO }))
    expect(p.avisos.some((a) => a.includes('1/4 W'))).toBe(true)
  })
  it('casos borde: corriente y fuente no positivas', () => {
    expect(error(led({ vs: 5, i: 0, modelo: LED_ROJO }))).toMatch(/corriente/)
    expect(error(led({ vs: -5, i: 0.01, modelo: LED_ROJO }))).toMatch(/fuente/)
    expect(error(led({ vs: 5, i: Infinity, modelo: LED_ROJO }))).toMatch(/corriente/)
  })
})

describe('filtro RC', () => {
  it('fc = 1 kHz con R = 1 kΩ pide C = 159.15 nF; con E12 queda 150 nF y fc real 1.061 kHz', () => {
    const exacto = ok(filtroRC({ tipo: 'bajas', fc: 1000, dado: 'R', valor: 1000 }))
    expect(exacto.c).toBeCloseTo(159.155e-9, 12)
    const r = ok(filtroRC({ tipo: 'bajas', fc: 1000, dado: 'R', valor: 1000 }, E12))
    expect([r.rc, r.cc]).toEqual([1000, 150e-9])
    expect(r.fcReal).toBeCloseTo(1 / (2 * Math.PI * 1000 * 150e-9), 6)
    expect(r.fcReal).toBeCloseTo(1061, 0)
    expect(r.tau).toBeCloseTo(150e-6, 12)
  })
  it('eligiendo C = 100 nF a 1 kHz pide R = 1.592 kΩ (comercial 1.5 k, fc real 1.061 kHz); da lo mismo en paso altas', () => {
    for (const tipo of ['bajas', 'altas'] as const) {
      const r = ok(filtroRC({ tipo, fc: 1000, dado: 'C', valor: 100e-9 }, E12))
      expect(r.r).toBeCloseTo(1591.55, 1)
      expect(r.rc).toBe(1500)
      expect(r.fcReal).toBeCloseTo(1061, 0)
    }
  })
  it('el otro valor se calcula con el comercial del elegido: R = 1.05 k (1 k en E12) pide C para 1 kHz con 1 k', () => {
    const r = ok(filtroRC({ tipo: 'bajas', fc: 1000, dado: 'R', valor: 1050 }, E12))
    expect(r.rc).toBe(1000)
    expect(r.c).toBeCloseTo(159.155e-9, 12)
  })
  it('avisa de R muy baja o muy alta y su nota dice cuándo vale fc', () => {
    expect(ok(filtroRC({ tipo: 'bajas', fc: 1000, dado: 'C', valor: 10e-6 })).avisos.some((a) => a.includes('carga mucho'))).toBe(true)
    expect(ok(filtroRC({ tipo: 'bajas', fc: 10, dado: 'C', valor: 1e-9 })).avisos.some((a) => a.includes('muy alta'))).toBe(true)
    expect(ok(filtroRC({ tipo: 'bajas', fc: 1000, dado: 'R', valor: 1000 })).nota).toMatch(/no carga al filtro/)
  })
  it('casos borde', () => {
    expect(error(filtroRC({ tipo: 'bajas', fc: 0, dado: 'R', valor: 1000 }))).toMatch(/corte/)
    expect(error(filtroRC({ tipo: 'bajas', fc: 1000, dado: 'R', valor: -1 }))).toMatch(/resistencia/)
    expect(error(filtroRC({ tipo: 'bajas', fc: 1000, dado: 'C', valor: NaN }))).toMatch(/capacitancia/)
  })
})

describe('555 astable', () => {
  it('1 kHz al 60 % con 100 nF: R1 = 2.886 k y R2 = 5.771 k, y las fórmulas de libro dan 1 kHz y 60 %', () => {
    const r = ok(astable555({ f: 1000, d: 0.6, c: 100e-9 }))
    expect(r.r1).toBeCloseTo(2885.4, 0)
    expect(r.r2).toBeCloseTo(5770.8, 0)
    // f = 1.44 / ((R1 + 2 R2) C) y D = (R1 + R2) / (R1 + 2 R2), con el 1.44 redondeado del libro.
    expect((1.44 / ((r.r1 + 2 * r.r2) * 100e-9)) / 1000).toBeCloseTo(1, 2)
    expect((r.r1 + r.r2) / (r.r1 + 2 * r.r2)).toBeCloseTo(0.6, 9)
    expect(r.fReal).toBeCloseTo(1000, 6)
    expect(r.dReal).toBeCloseTo(0.6, 9)
  })
  it('con E12 busca la pareja que mejor da frecuencia y ciclo, y los reales se calculan con ella', () => {
    const r = ok(astable555({ f: 1000, d: 0.6, c: 100e-9 }, E12))
    expect([r.r1c, r.r2c]).toEqual([3300, 5600])
    expect(r.fReal).toBeCloseTo(1 / (Math.LN2 * (3300 + 2 * 5600) * 100e-9), 6)
    expect(r.dReal).toBeCloseTo(8900 / 14500, 9)
    expect(r.tAlto + r.tBajo).toBeCloseTo(1 / r.fReal, 12)
    const ingenuo = Math.hypot(1 / (Math.LN2 * (2700 + 2 * 5600) * 100e-9) / 1000 - 1, 8300 / 13900 - 0.6)
    expect(Math.hypot(r.fReal / 1000 - 1, r.dReal - 0.6)).toBeLessThan(ingenuo)
  })
  it('calcula R con el capacitor ya comercial: 150 nF en E6 queda a menos de 5 % de la frecuencia pedida', () => {
    const E6 = redondeoDe('E6')
    const r = ok(astable555({ f: 1000, d: 0.6, c: 130e-9 }, E6))
    expect(r.cc).toBeCloseTo(150e-9, 15)
    expect(Math.abs(r.fReal / 1000 - 1)).toBeLessThan(0.05)
    expect(r.r2).toBeCloseTo((0.4 * 1e-3) / (Math.LN2 * 150e-9), 3)
  })
  it('el ejemplo de la plantilla: R1 = 1 k, R2 = 10 k, 100 nF da 686 Hz', () => {
    // Al revés: con f = 686 Hz y D = 11/21 el cálculo devuelve esas resistencias.
    const r = ok(astable555({ f: 1 / (Math.LN2 * 21e3 * 100e-9), d: 11 / 21, c: 100e-9 }))
    expect(r.r1).toBeCloseTo(1000, 3)
    expect(r.r2).toBeCloseTo(10000, 3)
  })
  it('menos de 50 % da un error que explica el diodo; 50 % exacto y los ciclos que dejan R1 diminuta, también', () => {
    expect(error(astable555({ f: 1000, d: 0.3, c: 100e-9 }))).toMatch(/diodo/)
    expect(error(astable555({ f: 1000, d: 0.5, c: 100e-9 }))).toMatch(/R1 = 0.*diodo/)
    expect(error(astable555({ f: 1000, d: 0.501, c: 100e-9 }))).toMatch(/R1 sale/)
  })
  it('casos borde: 0, 100 %, NaN, frecuencia y capacitor no positivos', () => {
    expect(error(astable555({ f: 1000, d: 0, c: 1e-7 }))).toMatch(/entre 0 y 100/)
    expect(error(astable555({ f: 1000, d: 1, c: 1e-7 }))).toMatch(/entre 0 y 100/)
    expect(error(astable555({ f: 1000, d: NaN, c: 1e-7 }))).toMatch(/entre 0 y 100/)
    expect(error(astable555({ f: -1, d: 0.6, c: 1e-7 }))).toMatch(/frecuencia/)
    expect(error(astable555({ f: 1000, d: 0.6, c: 0 }))).toMatch(/capacitancia/)
  })
  it('avisa de resistencias muy bajas y de frecuencias que el NE555 no sigue', () => {
    expect(ok(astable555({ f: 1000, d: 0.7, c: 1e-6 })).avisos.some((a) => a.includes('corriente'))).toBe(true)
    expect(ok(astable555({ f: 300e3, d: 0.7, c: 1e-9 })).avisos.some((a) => a.includes('200 kHz'))).toBe(true)
  })
})

describe('555 monoestable', () => {
  it('R = 10 k y C = 100 µF dan 1.1 s: el cálculo inverso devuelve 10 k', () => {
    const r = ok(monoestable555({ t: 1.0986, c: 100e-6 }))
    expect(r.r).toBeCloseTo(10000, -1)
    expect(r.tReal).toBeCloseTo(1.0986, 3)
    // El libro redondea 1.0986 a 1.1.
    expect(1.1 * 10e3 * 100e-6).toBeCloseTo(r.tReal, 1)
  })
  it('con E12: 0.5 s con 10 µF pide 45.5 k y queda 47 k (E6 para 10 µF), duración real 0.5164 s', () => {
    const r = ok(monoestable555({ t: 0.5, c: 10e-6 }, E12))
    expect(r.r).toBeCloseTo(45510, -1)
    expect(r.rc).toBe(47000)
    expect(r.cc).toBeCloseTo(10e-6, 12)
    expect(r.tReal).toBeCloseTo(Math.log(3) * 47000 * 10e-6, 9)
  })
  it('avisa del electrolítico y siempre del ancho del disparo; casos borde', () => {
    const r = ok(monoestable555({ t: 0.5, c: 10e-6 }))
    expect(r.avisos.some((a) => a.includes('electrolítico'))).toBe(true)
    expect(r.nota).toMatch(/disparo/)
    expect(ok(monoestable555({ t: 1e-4, c: 1e-6 })).avisos.some((a) => a.includes('muy baja'))).toBe(true)
    expect(error(monoestable555({ t: 0, c: 1e-6 }))).toMatch(/duración/)
    expect(error(monoestable555({ t: 1, c: -1 }))).toMatch(/capacitancia/)
  })
})

describe('amplificador', () => {
  it('inversor de ganancia 10 con Rin = 1 k pide Rf = 10 k y da −10', () => {
    const r = ok(amplificador({ tipo: 'inversor', g: 10, rin: 1000, vs: 15, vin: 0.5, modelo: LM741 }, E12))
    expect([r.rfc, r.rinc]).toEqual([10000, 1000])
    expect(r.gReal).toBeCloseTo(-10, 9)
    expect(r.vout).toBeCloseTo(-5, 9)
    expect(r.satura).toBe(false)
    expect(r.vinMax).toBeCloseTo(1.4, 9)
    expect(r.ancho).toBeCloseTo(1e6 / 11, 3)
  })
  it('no inversor de ganancia 11 con Rin = 1 k pide Rf = 10 k; ganancia 5 pide 4 k (E12 3.9 k, real 4.9)', () => {
    expect(ok(amplificador({ tipo: 'no-inversor', g: 11, rin: 1000, vs: 15, vin: 0.5, modelo: LM741 })).rf).toBeCloseTo(10000, 6)
    const r = ok(amplificador({ tipo: 'no-inversor', g: 5, rin: 1000, vs: 15, vin: 0.5, modelo: LM741 }, E12))
    expect(r.rfc).toBe(3900)
    expect(r.gReal).toBeCloseTo(4.9, 9)
    expect(r.ancho).toBeCloseTo(1e6 / 4.9, 3)
  })
  it('avisa si la salida satura con la fuente dada, con la entrada máxima', () => {
    const r = ok(amplificador({ tipo: 'inversor', g: 10, rin: 1000, vs: 5, vin: 1, modelo: LM741 }, E12))
    expect(r.satura).toBe(true)
    expect(r.vsatMas).toBeCloseTo(4, 9)
    expect(r.avisos[0]).toMatch(/se recorta/)
    expect(r.avisos[0]).toMatch(/400 mV/)
    // Un LM358 de una caída baja en el riel negativo cambia el límite de abajo.
    const lm358 = ok(amplificador({ tipo: 'inversor', g: 10, rin: 1000, vs: 5, vin: 0.3, modelo: { dhi: 1.5, dlo: 0.005, gbw: 1e6 } }))
    expect(lm358.vsatMas).toBeCloseTo(3.5, 9)
    expect(lm358.vsatMenos).toBeCloseTo(4.995, 9)
    expect(lm358.satura).toBe(false)
  })
  it('casos borde: ganancia 0 o negativa, no inversor menor que 1 o igual a 1, Rin y fuente no positivas', () => {
    const base = { tipo: 'inversor', g: 10, rin: 1000, vs: 15, vin: 0.5, modelo: LM741 } as const
    expect(error(amplificador({ ...base, g: 0 }))).toMatch(/ganancia/)
    expect(error(amplificador({ ...base, g: -3 }))).toMatch(/ganancia/)
    expect(error(amplificador({ ...base, tipo: 'no-inversor', g: 0.5 }))).toMatch(/no baja/)
    expect(error(amplificador({ ...base, tipo: 'no-inversor', g: 1 }))).toMatch(/seguidor/)
    expect(error(amplificador({ ...base, rin: 0 }))).toMatch(/Rin/)
    expect(error(amplificador({ ...base, vs: 0 }))).toMatch(/fuente/)
    expect(error(amplificador({ ...base, vin: -1 }))).toMatch(/negativa/)
    expect(ok(amplificador({ ...base, g: 0.5 })).gReal).toBeCloseTo(-0.5, 9)
  })
})
