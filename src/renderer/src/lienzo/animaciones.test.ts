import { describe, expect, it } from 'vitest'
import { AMPLITUD_SACUDIDA, brillo, DURACION, DURACION_REDUCIDA, muestrear, pulso, sacudida, salida, type Animacion } from './animaciones'

describe('curvas de las animaciones', () => {
  it('salida es una curva que arranca rápido y frena: 0 → 0, 0.5 → 0.875, 1 → 1', () => {
    expect(salida(0)).toBe(0)
    expect(salida(0.5)).toBeCloseTo(0.875, 9)
    expect(salida(1)).toBe(1)
    expect(salida(-1)).toBe(0)
    expect(salida(2)).toBe(1)
  })

  it('duraciones: pulso 220 ms, brillo 250 ms, sacudida 180 ms; con movimiento reducido 200 ms', () => {
    expect(DURACION).toEqual({ pulso: 220, brillo: 250, sacudida: 180 })
    expect(DURACION_REDUCIDA).toBe(200)
  })

  it('pulso crece de 1.0× a 1.6× y se desvanece en 220 ms', () => {
    expect(pulso(0, false)).toEqual({ escala: 1, alfa: 1 })
    const m = pulso(110, false)!
    expect(m.escala).toBeCloseTo(1 + 0.6 * 0.875, 9)
    expect(m.alfa).toBeCloseTo(0.125, 9)
    expect(pulso(220, false)).toBeNull()
    expect(pulso(500, false)).toBeNull()
  })

  it('brillo empieza 1.5× más ancho y opaco, y vuelve a 1× transparente en 250 ms', () => {
    expect(brillo(0, false)).toEqual({ ancho: 1.5, alfa: 1 })
    const m = brillo(125, false)!
    expect(m.ancho).toBeCloseTo(1.5 - 0.5 * 0.875, 9)
    expect(m.alfa).toBeCloseTo(0.125, 9)
    expect(brillo(250, false)).toBeNull()
  })

  it('sacudida oscila ±0.6 unidades en x durante 180 ms y termina en su sitio', () => {
    expect(AMPLITUD_SACUDIDA).toBe(0.6)
    expect(sacudida(0, false)).toEqual({ dx: 0 })
    expect(sacudida(15, false)!.dx).toBeCloseTo(0.6, 9) // 1/12 del tiempo: primer máximo
    expect(sacudida(45, false)!.dx).toBeCloseTo(-0.6, 9)
    expect(sacudida(90, false)!.dx).toBeCloseTo(0, 9)
    for (let ms = 0; ms < 180; ms += 7) expect(Math.abs(sacudida(ms, false)!.dx)).toBeLessThanOrEqual(0.6 + 1e-12)
    expect(sacudida(180, false)).toBeNull()
  })

  it('con movimiento reducido no hay movimiento: resalte fijo 200 ms', () => {
    for (const ms of [0, 100, 199]) {
      expect(pulso(ms, true)).toEqual({ escala: 1, alfa: 1 })
      expect(brillo(ms, true)).toEqual({ ancho: 1.5, alfa: 1 })
      expect(sacudida(ms, true)).toEqual({ dx: 0 })
    }
    expect(pulso(200, true)).toBeNull()
    expect(brillo(200, true)).toBeNull()
    expect(sacudida(200, true)).toBeNull()
  })

  it('un tiempo negativo (cuadro que empezó antes de pedir la animación) cuenta como 0', () => {
    expect(pulso(-5, false)).toEqual({ escala: 1, alfa: 1 })
  })
})

describe('muestrear', () => {
  const caja = { minX: 0, minY: 0, maxX: 4, maxY: 2 }
  const anims: Animacion[] = [
    { efecto: { tipo: 'pulso', caja }, inicio: 1000, reducido: false },
    { efecto: { tipo: 'brillo', cables: ['c1'] }, inicio: 1000, reducido: false },
    { efecto: { tipo: 'sacudida', piezas: ['fantasma', 'a'] }, inicio: 1000, reducido: false }
  ]

  it('da el estado de cada efecto vivo y descarta los terminados', () => {
    const { muestra, vivas } = muestrear(anims, 1015)
    expect(vivas).toHaveLength(3)
    expect(muestra.pulsos).toHaveLength(1)
    expect(muestra.pulsos[0].caja).toBe(caja)
    expect(muestra.brillos[0].cables).toEqual(['c1'])
    expect(muestra.sacudidas.get('fantasma')).toBeCloseTo(0.6, 9)
    expect(muestra.sacudidas.get('a')).toBeCloseTo(0.6, 9)

    const tarde = muestrear(anims, 1200)
    expect(tarde.vivas.map((a) => a.efecto.tipo)).toEqual(['pulso', 'brillo'])
    expect(tarde.muestra.sacudidas.size).toBe(0)
    expect(muestrear(anims, 1300).vivas).toEqual([])
  })
})
