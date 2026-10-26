import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AjustesOsciloscopio } from './ajustes'
import { anuncioDeDisparo, Barrido, configuracionDeSondas, HISTERESIS_DISPARO_DIV, vaciarAntesDe, type FuenteBarrido } from './barrido'

const ajustes = (o: Partial<AjustesOsciloscopio> = {}, disparo: Partial<AjustesOsciloscopio['disparo']> = {}): AjustesOsciloscopio => ({
  canales: (['A', 'B', 'C', 'D'] as const).map((canal, k) => ({ canal, on: k < 2, vdiv: 1, pos: 0, acople: 'DC' as const })),
  matematico: false, base: 1e-3, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0, modo: 'auto', ...disparo }, medidas: [], ideal: false, ...o
})
/** Disparos cada `periodo` desde `fase`, y datos hasta `hasta`. */
const fuente = (hasta: number, periodo = 1e-3, fase = 0.2e-3): FuenteBarrido => ({
  hasta,
  disparo: (tMax) => (tMax < fase ? Number.NaN : fase + Math.floor((tMax - fase) / periodo) * periodo)
})
const DT = 1e-5

describe('barrido del osciloscopio', () => {
  it('cambiar el nivel de disparo descarta el fin del barrido anterior: un disparo dentro de él ya vale', () => {
    const b = new Barrido(ajustes())
    expect(b.siguiente(fuente(25e-3), DT)).toMatchObject({ tDisparo: expect.closeTo(15.2e-3, 12) })
    // El barrido anterior terminaba en 24.2 ms; con el nivel nuevo la señal cruza en 20 ms y debe tomarse.
    b.configurar(ajustes({}, { nivel: 0.5 }))
    expect(b.siguiente(fuente(30e-3, 1, 20e-3), DT)).toMatchObject({ tDisparo: expect.closeTo(20e-3, 12), estado: 'disparado' })
  })

  it('retroceder olvida el barrido, el fin y lo visto del futuro deshecho: el disparo de antes vuelve a valer', () => {
    const b = new Barrido(ajustes())
    expect(b.siguiente(fuente(25e-3), DT)).toMatchObject({ tDisparo: expect.closeTo(15.2e-3, 12) })
    // Sin retroceder, con los datos recortados a 20 ms no hay barrido nuevo: el disparo de 15.2 ms ya se tomó.
    expect(b.siguiente(fuente(20e-3), DT)).toBeNull()
    // Volvió a 20 ms: el barrido empieza de nuevo con lo que quedó y toma otra vez el disparo de 10.2 ms.
    b.retroceder(20e-3)
    expect(b.siguiente(fuente(20e-3), DT)).toMatchObject({ tDisparo: expect.closeTo(10.2e-3, 12), estado: 'disparado' })
  })

  it('con el mismo nivel, flanco y acople no se descarta nada', () => {
    const b = new Barrido(ajustes())
    b.siguiente(fuente(25e-3), DT)
    b.configurar(ajustes())
    expect(b.siguiente(fuente(30e-3, 1, 20e-3), DT)).not.toMatchObject({ tDisparo: expect.closeTo(20e-3, 12) })
  })

  it('muestra el último barrido completo: el disparo cuya pantalla ya está simulada, con una división antes', () => {
    const b = new Barrido(ajustes())
    // Pantalla de 10 ms: con datos hasta 25 ms, el último disparo con 9 ms simulados después es el de 15.2 ms.
    expect(b.siguiente(fuente(25e-3), DT)).toEqual({ t0: expect.closeTo(14.2e-3, 12), tDisparo: expect.closeTo(15.2e-3, 12), estado: 'disparado', span: 10e-3 })
    // Sin un barrido completo nuevo, la misma pantalla: no se redibuja.
    expect(b.siguiente(fuente(25.1e-3), DT)).toBeNull()
    // Los barridos van uno tras otro: el disparo siguiente se toma cuando el de 15.2 ms termina (24.2 ms) y su pantalla se simuló.
    expect(b.siguiente(fuente(26.3e-3), DT)).toBeNull()
    expect(b.siguiente(fuente(34.3e-3), DT)).toMatchObject({ tDisparo: expect.closeTo(25.2e-3, 12) })
  })

  it('Rodante ignora el disparo: la traza sigue al tiempo simulado, sin tiempo relativo al disparo', () => {
    const b = new Barrido(ajustes({}, { modo: 'rodante' }))
    const a = b.siguiente(fuente(25e-3), DT)!
    expect(a).toMatchObject({ estado: 'rodillo', span: 10e-3 })
    expect(Number.isNaN(a.tDisparo)).toBe(true)
    expect(a.t0).toBeCloseTo(15e-3, 6)
    // Cada avance de los datos corre la ventana: la imagen no queda quieta.
    const c = b.siguiente(fuente(26e-3), DT)!
    expect(c.t0).toBeGreaterThan(a.t0)
    expect(b.siguiente(fuente(26e-3), DT)).toBeNull()
  })

  it('con el disparo al centro, media pantalla antes', () => {
    const b = new Barrido(ajustes({ disparoCentro: true }))
    expect(b.siguiente(fuente(25e-3), DT)).toMatchObject({ t0: expect.closeTo(14.2e-3, 12), tDisparo: expect.closeTo(19.2e-3, 12) })
  })

  it('Automático barre libre si en dos pantallas no hubo disparo; Normal espera', () => {
    const sin: FuenteBarrido = { hasta: 30e-3, disparo: () => Number.NaN }
    // Dos pantallas son 20 ms, pero no se barre libre antes de 100 ms sin disparo (histéresis).
    expect(new Barrido(ajustes()).siguiente(sin, DT)).toMatchObject({ estado: 'esperando' })
    expect(new Barrido(ajustes()).siguiente({ ...sin, hasta: 120e-3 }, DT)).toEqual({ t0: expect.closeTo(110e-3, 12), tDisparo: Number.NaN, estado: 'libre', span: 10e-3 })
    const n = new Barrido(ajustes({}, { modo: 'normal' }))
    expect(n.siguiente(sin, DT)).toMatchObject({ estado: 'esperando' })
    expect(n.siguiente({ ...sin, hasta: 45e-3 }, DT)).toBeNull()
    // Dos pantallas (20 ms) sin disparo desde que empezó a esperar: el aviso, una sola vez.
    expect(n.siguiente({ ...sin, hasta: 60e-3 }, DT)).toMatchObject({ estado: 'sin-disparo' })
    expect(n.siguiente({ ...sin, hasta: 90e-3 }, DT)).toBeNull()
    // Con 15 ms simulados y sin disparo todavía no pasan dos pantallas: espera.
    expect(new Barrido(ajustes()).siguiente({ hasta: 15e-3, disparo: () => Number.NaN }, DT)).toMatchObject({ estado: 'esperando' })
  })

  it('en Normal, tras el aviso de que no hay disparo, un disparo vuelve a mostrar la señal', () => {
    const n = new Barrido(ajustes({}, { modo: 'normal' }))
    const sin: FuenteBarrido = { hasta: 5e-3, disparo: () => Number.NaN }
    n.siguiente(sin, DT)
    expect(n.siguiente({ ...sin, hasta: 30e-3 }, DT)).toMatchObject({ estado: 'sin-disparo' })
    expect(n.siguiente(fuente(50e-3), DT)).toMatchObject({ estado: 'disparado' })
  })

  it('un osciloscopio nuevo abre en modo Rodante por omisión', () => {
    const pieza = JSON.parse(readFileSync('componentes/instrumentos/osciloscopio/pieza.json', 'utf8')) as { props: { id: string; defecto: string }[] }
    expect(pieza.props.find((q) => q.id === 'disp_modo')?.defecto).toBe('Rodante')
  })

  it('al cambiar Tiempo/div la traza nueva entra por la derecha y solo cuenta lo posterior al cambio', () => {
    const b = new Barrido(ajustes())
    expect(b.siguiente(fuente(25e-3), DT)).toMatchObject({ estado: 'disparado' })
    // Otra base (5 ms/div: pantalla de 50 ms) con datos hasta 100 ms: se vacía y entra desde la derecha.
    b.configurar(ajustes({ base: 5e-3 }))
    const entra = b.siguiente(fuente(100e-3), DT)
    expect(entra).toMatchObject({ estado: 'rodillo', desde: 100e-3 })
    expect(entra!.t0).toBeCloseTo(50e-3, 4)
    // Mientras no llena la pantalla sigue entrando: la ventana se recorre y el origen no cambia.
    const sigue = b.siguiente(fuente(120e-3), DT)
    expect(sigue).toMatchObject({ estado: 'rodillo', desde: 100e-3 })
    expect(sigue!.t0).toBeCloseTo(70e-3, 4)
    // Llena la pantalla (50 ms después): vuelve al disparo, y nunca con datos de antes del cambio.
    const lleno = b.siguiente(fuente(170e-3, 10e-3, 0.2e-3), DT)
    expect(lleno).toMatchObject({ estado: 'disparado' })
    expect(lleno!.t0).toBeGreaterThanOrEqual(100e-3 - 1e-12)
    expect(lleno!.desde).toBeUndefined()
  })

  it('si la pantalla nueva es más larga que lo simulado, la traza termina en el borde derecho (t0 negativo)', () => {
    const b = new Barrido(ajustes({ base: 1e-3 }))
    b.siguiente(fuente(5e-3), DT)
    // 1 s/div: pantalla de 10 s con datos hasta 3 s. La ventana acaba en 3 s, no empieza en 0.
    b.configurar(ajustes({ base: 1 }))
    const p = b.siguiente(fuente(3, 1, 0.2), 1e-2)
    expect(p).toMatchObject({ estado: 'rodillo', desde: 3 })
    expect(p!.t0).toBeCloseTo(3 - 10, 6)
    expect(p!.t0 + p!.span).toBeCloseTo(3, 6)
  })

  it('cambiar Voltios/div también vacía la pantalla, y cambiar el nivel o el modo no', () => {
    const b = new Barrido(ajustes())
    b.siguiente(fuente(25e-3), DT)
    const a = ajustes()
    b.configurar({ ...a, canales: a.canales.map((c) => (c.canal === 'A' ? { ...c, vdiv: 2 } : c)) })
    expect(b.siguiente(fuente(30e-3), DT)).toMatchObject({ estado: 'rodillo', desde: 30e-3 })
    const c = new Barrido(ajustes())
    c.siguiente(fuente(25e-3), DT)
    c.configurar(ajustes({}, { nivel: 0.5 }))
    expect(c.siguiente(fuente(40e-3), DT)).not.toHaveProperty('desde')
  })

  it('la primera pantalla de un osciloscopio recién abierto no es una entrada', () => {
    const b = new Barrido(ajustes())
    b.configurar(ajustes({ base: 2e-3 }))
    expect(b.siguiente(fuente(25e-3), DT)).toMatchObject({ estado: 'disparado' })
  })

  it('vaciarAntesDe deja vacías las columnas anteriores al cambio y conserva las demás', () => {
    const n = 10, dt = 1e-3
    const cols = new Float32Array(2 * n * 5).fill(7)
    // El canal 1 (segundo): las columnas que empiezan antes de t = 4.5 ms desde t0 = 0 (la 4 contiene al instante y se queda).
    expect(vaciarAntesDe(cols, 1, n, 0, dt, 4.5e-3)).toBe(4)
    for (let i = 0; i < n; i++) {
      const o = (n + i) * 5
      expect(cols[o + 4], `columna ${i}`).toBe(i < 4 ? 8 : 7)
      expect(cols[o]).toBe(i < 4 ? 0 : 7)
    }
    // El otro canal no se toca.
    expect([...cols.subarray(0, n * 5)].every((v) => v === 7)).toBe(true)
    expect(vaciarAntesDe(cols, 0, n, 0, dt, -1)).toBe(0)
    expect(vaciarAntesDe(cols, 0, n, 0, dt, 1)).toBe(n)
  })

  it('Único congela el primer barrido disparado hasta rearmar', () => {
    const b = new Barrido(ajustes({}, { modo: 'unico' }))
    expect(b.siguiente(fuente(25e-3), DT)).toMatchObject({ estado: 'congelado', tDisparo: expect.closeTo(15.2e-3, 12) })
    expect(b.siguiente(fuente(50e-3), DT)).toBeNull()
    b.rearmar()
    expect(b.siguiente(fuente(50e-3), DT)).toMatchObject({ estado: 'congelado', tDisparo: expect.closeTo(40.2e-3, 12) })
  })

  it('con 1 s por división el rodillo sigue al tiempo simulado más allá de la primera pantalla', () => {
    const b = new Barrido(ajustes({ base: 1 }))
    const sin = (hasta: number): FuenteBarrido => ({ hasta, disparo: () => Number.NaN })
    expect(b.siguiente(sin(12), 1e-2)).toMatchObject({ estado: 'rodillo', t0: expect.closeTo(2, 1) })
    expect(b.siguiente(sin(25), 1e-2)).toMatchObject({ estado: 'rodillo', t0: expect.closeTo(15, 1) })
  })

  it('desde 50 ms/div es rodillo: termina en lo último simulado, sin huecos ni columnas repetidas', () => {
    const b = new Barrido(ajustes({ base: 0.05 }))
    const dt = 0.5 / 1000
    let anterior = Number.NaN
    for (const hasta of [0.731, 0.7334, 0.7391, 0.7392, 0.8007, 1.2345]) {
      const p = b.siguiente({ hasta, disparo: () => Number.NaN }, dt)
      if (!p) continue
      expect(p.estado).toBe('rodillo')
      // El inicio cae en un múltiplo del ancho de columna (a menos de un nanosegundo).
      expect(Math.abs(p.t0 / dt - Math.round(p.t0 / dt))).toBeLessThan(1e-6)
      expect(hasta - p.t0).toBeLessThanOrEqual(0.5 + dt + 1e-12)
      if (Number.isFinite(anterior)) expect(p.t0).toBeGreaterThanOrEqual(anterior)
      anterior = p.t0
    }
  })

  it('cambiar la base de tiempo o el modo empieza de nuevo', () => {
    const b = new Barrido(ajustes({}, { modo: 'unico' }))
    b.siguiente(fuente(25e-3), DT)
    b.configurar(ajustes({}, { modo: 'auto' }))
    expect(b.siguiente(fuente(50e-3), DT)).toMatchObject({ estado: 'disparado', span: 10e-3 })
    // Con otra base la pantalla se vacía (span nuevo) y la traza entra por la derecha.
    b.configurar(ajustes({ base: 2e-3 }, { modo: 'auto' }))
    expect(b.siguiente(fuente(60e-3), DT)).toMatchObject({ estado: 'rodillo', span: 20e-3, desde: 60e-3 })
  })

  it('el disparo va en la sonda de su canal, con su nivel, flanco e histéresis; el acoplamiento AC en cada sonda', () => {
    const a = ajustes({ canales: (['A', 'B', 'C', 'D'] as const).map((canal) => ({ canal, on: true, vdiv: 2, pos: 0, acople: canal === 'B' ? 'AC' : 'DC' })) }, { fuente: 'B', nivel: 1.5, subida: false })
    const c = configuracionDeSondas(a, [10, 11, null, 13])
    expect(c).toEqual([
      { sonda: 10, config: { columna: 1e-2 / 2048, acople: 'dc', disparo: null } },
      { sonda: 11, config: { columna: 1e-2 / 2048, acople: 'ac', disparo: { nivel: 1.5, subida: false, histeresis: HISTERESIS_DISPARO_DIV * 2 } } },
      { sonda: 13, config: { columna: 1e-2 / 2048, acople: 'dc', disparo: null } }
    ])
  })

  it('el estado del disparo en palabras', () => {
    expect(anuncioDeDisparo('disparado')).toBe('Disparado')
    expect(anuncioDeDisparo('esperando')).toBe('Esperando disparo')
    expect(anuncioDeDisparo('congelado')).toBe('Captura única congelada')
    expect(anuncioDeDisparo('sin-disparo')).toBe('Sin disparo: ajusta el nivel o usa Auto')
  })
})
