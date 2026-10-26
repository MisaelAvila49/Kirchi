import { describe, expect, it } from 'vitest'
import { ajusteAutomatico, canalDeReferencia, textoDeNumero, textoDeSerie } from './ajusteAutomatico'
import { leerValor } from '../valores/valores'
import { CIFRAS_COLUMNA_MOTOR, medidasDeCanal, medidasDeColumnas } from './medidas'

/** Columnas de 7 cifras de `f` muestreada en `n` columnas de `dt`, con sus integrales por el trapecio fino. */
function columnas(f: (t: number) => number, n: number, dt: number): Float64Array {
  const c = new Float64Array(n * CIFRAS_COLUMNA_MOTOR)
  for (let i = 0; i < n; i++) {
    const pasos = 50
    let [mn, mx, iv, iv2] = [Infinity, -Infinity, 0, 0]
    for (let k = 0; k <= pasos; k++) {
      const v = f((i + k / pasos) * dt)
      mn = Math.min(mn, v)
      mx = Math.max(mx, v)
      if (k > 0) {
        const u = f((i + (k - 1) / pasos) * dt)
        iv += ((u + v) / 2) * (dt / pasos)
        iv2 += ((u * u + u * v + v * v) / 3) * (dt / pasos)
      }
    }
    c.set([mn, mx, f(i * dt), f((i + 1) * dt), iv, iv2, 0], i * CIFRAS_COLUMNA_MOTOR)
  }
  return c
}
const valor = (m: ReturnType<typeof medidasDeCanal>, k: number) => m[k].valor

describe('medidas automáticas', () => {
  it('con la ventana del motor: Vpp, máximo y mínimo de las columnas; lo demás de los periodos completos', () => {
    const c = columnas((t) => 0.5 + Math.sin(2 * Math.PI * 1000 * t), 1000, 5e-6)
    // Ventana sobre 5 ms: cinco periodos, promedio 0.5, eficaz total √(0.25 + 0.5), ciclo de 50 %.
    const w = [0, 5e-3, 2.5e-3, 3.75e-3, -0.5, 1.5, 4, 0.1e-3, 4.1e-3, 2e-3, 3e-3, 2e-3]
    const m = medidasDeCanal(c, w)
    expect(valor(m, 0)).toBeCloseTo(2, 3)
    expect(valor(m, 1)).toBeCloseTo(1.5, 3)
    expect(valor(m, 2)).toBeCloseTo(-0.5, 3)
    expect(valor(m, 3)).toBeCloseTo(0.5, 9)
    expect(valor(m, 4)).toBeCloseTo(Math.sqrt(0.75), 9)
    expect(valor(m, 5)).toBeCloseTo(1000, 6)
    expect(valor(m, 6)).toBeCloseTo(1e-3, 12)
    expect(valor(m, 7)).toBeCloseTo(0.5, 9)
    expect(m.every((x) => x.razon === '')).toBe(true)
  })

  it('con las columnas de la pantalla (cinco cifras en f32) da las mismas medidas que con las del motor', () => {
    const c = columnas((t) => 0.5 + Math.sin(2 * Math.PI * 1000 * t), 1000, 5e-6)
    const w = [0, 5e-3, 2.5e-3, 3.75e-3, -0.5, 1.5, 4, 0.1e-3, 4.1e-3, 2e-3, 3e-3, 2e-3]
    // Mínimo, máximo, primero, último y banderas, como las escribe el worker en la memoria compartida.
    const p = new Float32Array(1000 * 5)
    for (let i = 0; i < 1000; i++) p.set([c[i * 7], c[i * 7 + 1], c[i * 7 + 2], c[i * 7 + 3], c[i * 7 + 6]], i * 5)
    const [m7, m5] = [medidasDeCanal(c, w), medidasDeCanal(p, w, 5)]
    for (let k = 0; k < 8; k++) expect(valor(m5, k), `medida ${k}`).toBeCloseTo(valor(m7, k), 6)
    // Sin ventana no hay integrales en cinco cifras: sin datos, no ceros.
    expect(medidasDeCanal(p, null, 5).every((x) => x.razon === 'sin-datos')).toBe(true)
  })

  it('sin periodos, el promedio y el eficaz dividen por el tiempo medido sin X ni Z', () => {
    const c = columnas(() => 5, 100, 1e-4)
    // 10 ms de pantalla con 5 ms en X: ∫v = 25 mV·s sobre 5 ms medidos.
    const m = medidasDeCanal(c, [0, 1e-2, 2.5e-2, 12.5e-2, 5, 5, 0, Number.NaN, Number.NaN, 0, 0, 0, 5e-3])
    expect(valor(m, 3)).toBeCloseTo(5, 12)
    expect(valor(m, 4)).toBeCloseTo(5, 12)
  })

  it('una continua no tiene periodo, y menos de un ciclo tampoco: lo dicen sin cifra', () => {
    const c = columnas(() => 2.5, 100, 1e-4)
    const m = medidasDeCanal(c, [0, 1e-2, 2.5e-2, 6.25e-2, 2.5, 2.5, 0, Number.NaN, Number.NaN, 0, 0, 0])
    expect(valor(m, 3)).toBeCloseTo(2.5, 12)
    expect(m.slice(5).map((x) => x.razon)).toEqual(['sin-periodos', 'sin-periodos', 'sin-periodos'])
    const lenta = columnas((t) => Math.sin(2 * Math.PI * 10 * t), 100, 1e-4)
    expect(medidasDeCanal(lenta, [0, 1e-2, 0, 0, -0.5, 0.5, 0, Number.NaN, Number.NaN, 0, 0, 0])[5].razon).toBe('menos-de-un-ciclo')
    expect(medidasDeCanal(lenta, null)[0].razon).toBe('')
  })

  it('sin ventana (el canal A − B), de las columnas: frecuencia y ciclo con los cruces entre columnas', () => {
    const c = columnas((t) => ((t * 1000) % 1 < 0.25 ? 1 : -1), 2000, 2.5e-6)
    const m = medidasDeColumnas(c, 2.5e-6)
    expect(valor(m, 0)).toBeCloseTo(2, 9)
    expect(Math.abs(valor(m, 5) - 1000) / 1000).toBeLessThan(5e-3)
    expect(Math.abs(valor(m, 7) - 0.25)).toBeLessThan(0.25 * 2e-2)
  })

  it('una pantalla sin datos dice «sin datos»', () => {
    const c = new Float64Array(10 * CIFRAS_COLUMNA_MOTOR)
    for (let i = 0; i < 10; i++) c[i * CIFRAS_COLUMNA_MOTOR + 6] = 8
    expect(medidasDeCanal(c, null).every((x) => x.razon === 'sin-datos')).toBe(true)
  })
})

describe('ajuste automático', () => {
  const dc = (vmin: number, vmax: number, frecuencia: number | null, base = 0.1) => ajusteAutomatico({ vmin, vmax, frecuencia, acople: 'DC', base })

  it('la señal a unas seis divisiones, al menos dos periodos y el nivel a la mitad', () => {
    expect(dc(-1, 1, 1000)).toEqual({ vdiv: 0.5, base: 0.2e-3, nivel: 0, pos: 0, acople: 'DC', nota: null })
    // La frecuencia medida de 1 kHz puede salir en 999.6 Hz: sigue en 200 µs/div (no salta a 500 µs/div por una milésima).
    expect(dc(-1, 1, 999.6).base).toBe(0.2e-3)
    // Una cuadrada de 0 a 10 V: 2 V/div, centrada (su tierra dos divisiones y media abajo) y el disparo en 5 V.
    expect(dc(0, 10, 60)).toEqual({ vdiv: 2, base: 5e-3, nivel: 5, pos: -2.4, acople: 'DC', nota: null })
    // Una continua: la base de tiempo no cambia, el nivel en su valor y la traza cerca del centro.
    expect(dc(3.3, 3.3, null, 1e-3)).toEqual({ vdiv: 1, base: 1e-3, nivel: 3.3, pos: -3.2, acople: 'DC', nota: null })
    // Nada (la entrada en cero o con unos microvoltios): 1 V/div y centrada, no 1 mV/div.
    expect(dc(0, 0, null)).toMatchObject({ vdiv: 1, pos: 0, nivel: 0, acople: 'DC' })
    expect(dc(4e-6, 6e-6, null)).toMatchObject({ vdiv: 1, pos: 0, nivel: 0, acople: 'DC' })
  })

  it('un escalón (el botón de 5 V sobre R1): en DC, de 0 a 5 V a la vista; nunca pasa a AC', () => {
    const r = dc(0, 5, null, 0.1)
    // La base de tiempo se queda en la que deja ver el escalón.
    expect(r).toMatchObject({ vdiv: 1, base: 0.1, nivel: 2.5, pos: -2.4, acople: 'DC', nota: null })
    // La traza completa cabe en las ocho divisiones.
    expect(r.pos + 5 / r.vdiv).toBeLessThanOrEqual(4)
    expect(r.pos).toBeGreaterThanOrEqual(-4)
  })

  it('una senoidal con desplazamiento: en DC si se distingue en la pantalla, centrada', () => {
    // 2 Vpp sobre 2.5 V: de 1.5 a 3.5 V.
    const r = dc(1.5, 3.5, 1000)
    expect(r).toMatchObject({ vdiv: 1, nivel: 2.5, acople: 'DC', nota: null })
    expect(r.pos + 3.5 / r.vdiv).toBeLessThanOrEqual(4)
    expect(r.pos + 1.5 / r.vdiv).toBeGreaterThanOrEqual(-4)
  })

  it('poca variación sobre mucha continua y rápida: pasa a AC y lo dice; lenta se queda en DC', () => {
    // 200 mVpp sobre 5 V a 1 kHz: en DC serían 2 V/div y la variación una décima de división.
    const r = dc(4.9, 5.1, 1000)
    expect(r).toMatchObject({ vdiv: 0.05, pos: 0, nivel: 0, acople: 'AC' })
    expect(r.nota).toBe('Ajuste automático puso A en AC: la señal varía 200.0 mV sobre 5.000 V de continua, que en DC no se distinguiría.')
    // A 20 Hz el filtro de 10 Hz del acoplamiento AC la deformaría: sigue en DC.
    expect(dc(4.9, 5.1, 20)).toMatchObject({ acople: 'DC', vdiv: 2, nota: null })
  })

  it('en AC o en GND no cambia el acoplamiento', () => {
    expect(ajusteAutomatico({ vmin: -0.1, vmax: 0.1, frecuencia: 1000, acople: 'AC', base: 1e-3 })).toMatchObject({ vdiv: 0.05, pos: 0, acople: 'AC', nota: null })
    expect(ajusteAutomatico({ vmin: 0, vmax: 0, frecuencia: null, acople: 'GND', base: 1e-3 })).toMatchObject({ vdiv: 1, pos: 0, acople: 'GND' })
  })

  it('escribe un número como una propiedad que se vuelve a leer, sin potencias de diez', () => {
    // «2.38e-7» no se lee como valor: el nivel del ajuste automático de una señal en AC daba «no es un valor válido».
    expect([2.5, -2.4, 1.2345678, 2.38e-7, -5.551115123125783e-17, 0, 1000].map((v) => textoDeNumero(v))).toEqual(['2.5', '-2.4', '1.235', '238n', '0', '0', '1000'])
    for (const v of [2.38e-7, 4.2e-8, 3.3e-4, 12.5]) expect(leerValor(textoDeNumero(v))!.valor).toBeCloseTo(v, 12)
  })

  it('escribe los valores de la serie como una propiedad', () => {
    expect([0.2, 1e-6, 2e-3, 10, 0.5, 5e-5].map(textoDeSerie)).toEqual(['200m', '1u', '2m', '10', '500m', '50u'])
  })
})

describe('canal de referencia del ajuste automático', () => {
  const con = (vpp: number | null, on = true, acople: 'DC' | 'AC' | 'GND' = 'DC') => ({
    on,
    acople,
    medidas: Array.from({ length: 8 }, () => (vpp === null ? { valor: Number.NaN, razon: 'sin-datos' as const } : { valor: vpp, razon: '' as const }))
  })
  it('A si tiene señal; si A está sin conexión, apagado o en GND, el primer canal con señal', () => {
    expect(canalDeReferencia([con(2), con(1), con(null), con(null)])).toBe(0)
    expect(canalDeReferencia([con(null), con(1.5), con(null), con(null)])).toBe(1)
    expect(canalDeReferencia([con(2, false), con(null), con(0.3), con(1)])).toBe(2)
    expect(canalDeReferencia([con(0, true, 'GND'), con(1), con(null), con(null)])).toBe(1)
  })
  it('un canal plano (0 V) cede ante uno con señal, y si ninguno tiene datos se queda A', () => {
    expect(canalDeReferencia([con(0), con(1), con(null), con(null)])).toBe(1)
    expect(canalDeReferencia([con(0), con(0), con(null), con(null)])).toBe(0)
    expect(canalDeReferencia([con(null), con(null), con(null), con(null)])).toBe(0)
  })
  it('la nota dice el canal que se pasó a AC', () => {
    expect(ajusteAutomatico({ vmin: 4.9, vmax: 5.1, frecuencia: 1000, acople: 'DC', base: 1e-3, canal: 'B' }).nota).toContain('puso B en AC')
  })
})
