import { describe, expect, it } from 'vitest'
import type { CrucesSim } from './client'
import { Altavoz, epocaALocal, CLICS_POR_SEGUNDO, LATENCIA_MS, PlanDeSonido, type ContextoAudio, type FuenteSonora, type OrdenSonido } from './sonido'

const ZUMBADOR: FuenteSonora = { tipo: 'zumbador', frecuencia: 2700, onda: 'triangular' }
const tanda = (cruces: [number, number, number][], ancla = { t: 0, reloj: 1000 }, velocidad = 1): CrucesSim => ({ cruces: cruces.map(([elemento, t, nivel]) => ({ elemento, t, nivel })), perdidos: 0, ancla, velocidad })
const piezaDe = (k: number) => (k === 1 ? 'bz' : k === 2 ? 'k1' : undefined)
const fuente = (id: string): FuenteSonora => (id === 'bz' ? ZUMBADOR : id === 'k1' ? { tipo: 'rele' } : null)

describe('el plan del sonido', () => {
  it('cada cruce del zumbador se pasa a reloj con el ancla y la velocidad y se programa con 60 ms de latencia', () => {
    const p = new PlanDeSonido()
    const o = p.cruces(tanda([[1, 0.05, 1], [1, 0.08, 0]]), piezaDe, fuente)
    expect(o).toEqual([
      { tipo: 'tono', id: 'bz', en: 1000 + 50 + LATENCIA_MS, frecuencia: 2700, onda: 'triangular', ganancia: 1 },
      { tipo: 'calla', id: 'bz', en: 1000 + 80 + LATENCIA_MS }
    ])
    // En cámara lenta los encendidos siguen al tiempo simulado: a 0.01×, 1 ms simulado son 100 ms de reloj.
    expect(PlanDeSonido.aReloj(0.001, { ancla: { t: 0, reloj: 0 }, velocidad: 0.01 })).toBeCloseTo(100 + LATENCIA_MS, 9)
  })

  it('un zumbador con una cuadrada de 1 kHz suena continuo con el volumen por su fracción encendida', () => {
    const p = new PlanDeSonido()
    const cruces: [number, number, number][] = []
    // 25 % encendido: sube en cada milisegundo y baja un cuarto después.
    for (let k = 0; k < 60; k++) cruces.push([1, k * 1e-3, 1], [1, k * 1e-3 + 0.25e-3, 0])
    const o = p.cruces(tanda(cruces), piezaDe, fuente)
    const ultimo = o.at(-1)!
    expect(ultimo.tipo).toBe('tono')
    if (ultimo.tipo === 'tono') expect(ultimo.ganancia).toBeCloseTo(0.25, 1)
    // Ya continuo, ningún «calla» desde que pasó de 20 cambios.
    expect(o.slice(22).every((x) => x.tipo === 'tono')).toBe(true)
    // Si deja de cambiar apagado, calla en la siguiente revisión.
    expect(p.revisar(1000 + 60 + LATENCIA_MS + 200)).toEqual([{ tipo: 'calla', id: 'bz', en: 1000 + 60 + LATENCIA_MS + 200 }])
  })

  it('los clics del relé no pasan de 20 por segundo', () => {
    const p = new PlanDeSonido()
    const cruces: [number, number, number][] = Array.from({ length: 100 }, (_, k) => [2, k * 0.005, k % 2])
    const clics = p.cruces(tanda(cruces), piezaDe, fuente).filter((x) => x.tipo === 'clic')
    expect(clics).toHaveLength(CLICS_POR_SEGUNDO)
  })

  it('el pitido de continuidad sigue a la lectura, y callarlo todo calla lo que sonaba', () => {
    const p = new PlanDeSonido()
    expect(p.continuidadEs(true, 5)).toEqual([{ tipo: 'tono', id: 'continuidad', en: 5, frecuencia: 2000, onda: 'senoidal', ganancia: 1 }])
    expect(p.continuidadEs(true, 6)).toEqual([])
    p.cruces(tanda([[1, 0, 1]]), piezaDe, fuente)
    expect(p.callarTodo(9).map((x) => (x.tipo === 'calla' ? x.id : '')).sort()).toEqual(['bz', 'continuidad'])
    expect(p.callarTodo(10)).toEqual([])
  })
})

/** Un contexto de audio falso que anota cada inicio y fin de oscilador en su tiempo. */
class ContextoFalso implements ContextoAudio {
  currentTime = 0
  state = 'running'
  destination = {}
  inicios: { tipo: string; t: number; f: number }[] = []
  fines: number[] = []
  resume = async () => {}
  close = async () => {}
  createOscillator() {
    const o = {
      type: '',
      frequency: { value: 0 },
      connect: () => o,
      start: (t = 0) => void this.inicios.push({ tipo: o.type, t, f: o.frequency.value }),
      stop: (t = 0) => void this.fines.push(t)
    }
    return o
  }
  createGain() {
    const g = { gain: { value: 0, setValueAtTime: () => g, linearRampToValueAtTime: () => g, cancelScheduledValues: () => g }, connect: () => g }
    return g
  }
}

describe('el altavoz (WebAudio)', () => {
  it('no crea su contexto hasta la primera orden que suena; callar sin haber sonado no lo crea', () => {
    let creados = 0
    const a = new Altavoz(() => (creados++, new ContextoFalso()), () => 0)
    a.aplicar([])
    a.aplicar([{ tipo: 'calla', id: 'bz', en: 0 }])
    a.callar()
    expect(creados).toBe(0)
    a.aplicar([{ tipo: 'clic', en: 0 }])
    expect(creados).toBe(1)
  })

  it('el tono empieza en el instante de reloj de su cruce convertido al tiempo del contexto, y se apaga con su rampa', () => {
    const ctx = new ContextoFalso()
    let reloj = 1000
    const a = new Altavoz(() => ctx, () => reloj)
    ctx.currentTime = 3
    const orden: OrdenSonido = { tipo: 'tono', id: 'bz', en: 1000 + 50 + LATENCIA_MS, frecuencia: 2700, onda: 'triangular', ganancia: 1 }
    a.aplicar([orden])
    expect(ctx.inicios).toEqual([{ tipo: 'triangle', t: 3 + 0.11, f: 2700 }])
    reloj = 1500
    ctx.currentTime = 3.5
    a.callar()
    expect(ctx.fines[0]).toBeCloseTo(3.51, 9)
  })

  it('un sistema que no deja sonar marca el bloqueo; un clic lo reanuda', async () => {
    const ctx = new ContextoFalso()
    ctx.state = 'suspended'
    const avisos: boolean[] = []
    const a = new Altavoz(() => ctx, () => 0, (si) => avisos.push(si))
    a.aplicar([{ tipo: 'clic', en: 0 }])
    expect(a.bloqueado).toBe(true)
    ctx.state = 'running'
    a.reanudar()
    await Promise.resolve()
    await Promise.resolve()
    expect(a.bloqueado).toBe(false)
    expect(avisos).toEqual([true, false])
  })
})

describe('reloj del ancla', () => {
  it('un ancla de época del worker se programa a menos de 50 ms de performance.now() de la ventana', () => {
    const origenVentana = 1_000_000
    const origenWorker = 1_000_300
    const ahoraVentana = 5000
    // El worker corre 300 ms después que la ventana: su now() es menor para el mismo instante.
    const ahoraWorker = ahoraVentana - (origenWorker - origenVentana)
    const reloj = origenWorker + ahoraWorker
    const local = epocaALocal(reloj, origenVentana)
    const en = PlanDeSonido.aReloj(0, { ancla: { t: 0, reloj: local }, velocidad: 1 })
    expect(Math.abs(en - ahoraVentana)).toBeLessThan(50 + LATENCIA_MS)
    expect(Math.abs(en - ahoraVentana - LATENCIA_MS)).toBeLessThan(1e-9)
  })
})
