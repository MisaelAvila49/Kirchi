import { describe, expect, it } from 'vitest'
import type { ResultadoMapeado, Serie } from '../../../compartido/analisis/resultados'
import { candidatosXY, modeloDeResultado, modeloXY } from './modeloGrafica'

const f = (...v: number[]) => Float64Array.from(v)
const serie = (etiqueta: string, unidad: string, valores: Float64Array, fase?: Float64Array): Serie => ({ id: etiqueta, etiqueta, unidad, magnitud: unidad === 'A' ? 'A' : 'V', valores, fase })
const base = (o: Partial<ResultadoMapeado>): ResultadoMapeado => ({ tipo: 'tran', ejeNombre: 'Tiempo', ejeUnidad: 's', logX: false, corridas: [], avisos: [], ...o })

describe('modelo de la gráfica de un análisis', () => {
  it('un Bode son dos paneles, magnitud y fase, con la misma traza y el eje x logarítmico', () => {
    const r = base({ tipo: 'ac', ejeNombre: 'Frecuencia', ejeUnidad: 'Hz', logX: true, corridas: [{ etiqueta: '', eje: f(10, 100, 1000), series: [serie('V(salida)', 'dB', f(0, -3, -20), f(-5, -45, -85))] }] })
    const m = modeloDeResultado(r)!
    expect(m.paneles.map((p) => p.titulo)).toEqual(['Ganancia (dB)', 'Fase'])
    expect(m.trazas.map((t) => [t.panel, t.unidad])).toEqual([[0, 'dB'], [1, '°']])
    expect(m.ejeX).toMatchObject({ escala: 'log', datos: { min: 10, max: 1000 } })
  })
  it('la misma red lleva el mismo tono en magnitud y fase en los dos estilos; en Instrumento la fase va junto a la magnitud y discontinua', () => {
    const r = base({ tipo: 'ac', ejeNombre: 'Frecuencia', ejeUnidad: 'Hz', logX: true, corridas: [{ etiqueta: '', eje: f(10, 100, 1000), series: [serie('V(salida)', 'dB', f(0, -3, -20), f(-5, -45, -85))] }] })
    const inst = modeloDeResultado(r)!
    expect(inst.trazas.map((t) => t.lado)).toEqual(['izquierda', 'izquierda'])
    expect(inst.trazas[0].tono).toBe(inst.trazas[1].tono)
    expect(inst.trazas.map((t) => t.discontinua === true)).toEqual([false, true])
    const inf = modeloDeResultado(r, {}, { informe: true })!
    expect(inf.trazas.map((t) => t.lado)).toEqual(['izquierda', 'izquierda'])
    expect(inf.trazas[0].tono).toBe(inf.trazas[1].tono)
    expect(inf.trazas.some((t) => t.discontinua)).toBe(false)
  })
  it('un transitorio con voltaje y corriente pone la segunda unidad a la derecha', () => {
    const r = base({ corridas: [{ etiqueta: '', eje: f(0, 1, 2), series: [serie('V(a)', 'V', f(0, 1, 2)), serie('I(R1)', 'A', f(0, 0.1, 0.2))] }] })
    const m = modeloDeResultado(r)!
    expect(m.trazas.map((t) => t.lado)).toEqual(['izquierda', 'derecha'])
    expect(new Set(m.trazas.map((t) => t.tono)).size).toBe(2)
  })
  it('lo que el lector eligió por nombre gana a lo de omisión', () => {
    const r = base({ corridas: [{ etiqueta: '', eje: f(0, 1), series: [serie('V(a)', 'V', f(0, 1)), serie('V(b)', 'V', f(1, 2))] }] })
    const m = modeloDeResultado(r, { 'V(b)': { lado: 'centro', color: 'negro' } })!
    expect(m.trazas[1]).toMatchObject({ lado: 'centro', tono: 'negro' })
    expect(m.trazas[0].lado).toBe('izquierda')
  })
  it('varias corridas de un barrido se distinguen por su etiqueta', () => {
    const r = base({ corridas: [{ etiqueta: 'R1 = 1 kΩ', eje: f(0, 1), series: [serie('V(a)', 'V', f(0, 1))] }, { etiqueta: 'R1 = 2 kΩ', eje: f(0, 1), series: [serie('V(a)', 'V', f(0, 2))] }] })
    expect(modeloDeResultado(r)!.trazas.map((t) => t.clave)).toEqual(['R1 = 1 kΩ · V(a)', 'R1 = 2 kΩ · V(a)'])
  })
  it('un punto de operación sin barrido no tiene curva', () => {
    expect(modeloDeResultado(base({ tipo: 'op', corridas: [{ etiqueta: '', eje: f(0), series: [serie('V(a)', 'V', f(5))] }] }))).toBeNull()
  })
  it('un Fourier son barras con su THD', () => {
    const arm = (n: number, magnitud: number) => ({ n, frecuencia: 1000 * n, magnitud, fase: 0 })
    const r = base({ tipo: 'fourier', corridas: [{ etiqueta: '', eje: f(0, 1), series: [], fourier: [{ id: 'v:1', etiqueta: 'V(a)', unidad: 'V', continua: 0, armonicos: [arm(1, 1), arm(2, 0), arm(3, 0.33)], thd: 33 }] }] })
    const m = modeloDeResultado(r)!
    expect(m.tipo).toBe('barras')
    expect(Array.from(m.barras!.series[0].valores)).toEqual([1, 0, 0.33])
    expect(m.barras!.nota).toContain('THD 33 %')
    expect(m.barras!.categorias).toEqual(['1', '2', '3'])
  })
  it('las barras de armónicos llevan la unidad de cada serie y no la de la primera', () => {
    const arm = (n: number, magnitud: number) => ({ n, frecuencia: 1000 * n, magnitud, fase: 0 })
    const fourier = [
      { id: 'v:1', etiqueta: 'V(a)', unidad: 'V', continua: 0, armonicos: [arm(1, 1)], thd: null },
      { id: 'i:1', etiqueta: 'I(R1)', unidad: 'A', continua: 0, armonicos: [arm(1, 0.001)], thd: null }
    ]
    const b = modeloDeResultado(base({ tipo: 'fourier', corridas: [{ etiqueta: '', eje: f(0, 1), series: [], fourier }] }))!.barras!
    expect(b.series.map((s) => s.unidad)).toEqual(['V', 'A'])
    expect(b.unidad).toBe('V y A')
    expect(b.nota).toContain('unidades distintas')
  })
  it('la ganancia de un Bode es relativa a la fuente de CA, y los dBV absolutos son una opción', () => {
    const r = base({ tipo: 'ac', magnitudAc: 0.1, ejeNombre: 'Frecuencia', ejeUnidad: 'Hz', logX: true, corridas: [{ etiqueta: '', eje: f(10, 1000), series: [serie('V(salida)', 'dB', f(-20, -23.01), f(0, -45))] }] })
    // 0.1 V de entrada son -20 dBV: una salida de -20 dBV es ganancia 0 dB y la de -23.01 dBV es -3.01 dB.
    const rel = modeloDeResultado(r)!
    expect(rel.paneles[0].titulo).toBe('Ganancia (dB)')
    expect(Array.from(rel.trazas[0].y).map((v) => Number(v.toFixed(2)))).toEqual([0, -3.01])
    const abs = modeloDeResultado(r, {}, { dbAbsoluto: true })!
    expect(abs.paneles[0].titulo).toBe('Magnitud (dBV)')
    expect(Array.from(abs.trazas[0].y)).toEqual([-20, -23.01])
    // La fase no cambia.
    expect(Array.from(rel.trazas[1].y)).toEqual([0, -45])
  })
})

describe('gráfica X-Y de un análisis', () => {
  const r = base({ corridas: [{ etiqueta: '', eje: f(0, 1, 2, 3), series: [serie('V(in)', 'V', f(0, 1, 2, 3)), serie('V(out)', 'V', f(0, 2, 4, 6))] }] })
  it('una traza hace de eje horizontal y las demás se dibujan contra ella', () => {
    const m = modeloDeResultado(r)!
    expect(candidatosXY(m).map((c) => c.clave)).toEqual(['V(in)', 'V(out)'])
    const xy = modeloXY(m, 'V(in)')!
    expect(xy.xy).toBe(true)
    expect(xy.ejeX).toMatchObject({ nombre: 'V(in)', unidad: 'V', escala: 'lin', datos: { min: 0, max: 3 } })
    expect(xy.trazas.map((t) => t.clave)).toEqual(['V(out)'])
    expect(Array.from(xy.trazas[0].x)).toEqual([0, 1, 2, 3])
    expect(Array.from(xy.trazas[0].y)).toEqual([0, 2, 4, 6])
  })
  it('si las muestras no coinciden interpola, y un Bode o una clave inexistente no tienen X-Y', () => {
    const dos = base({ corridas: [{ etiqueta: 'a', eje: f(0, 2), series: [serie('V(in)', 'V', f(0, 4))] }, { etiqueta: 'b', eje: f(0, 1, 2), series: [serie('V(out)', 'V', f(1, 2, 3))] }] })
    const xy = modeloXY(modeloDeResultado(dos)!, 'a · V(in)')!
    expect(Array.from(xy.trazas[0].x)).toEqual([0, 2, 4])
    expect(modeloXY(modeloDeResultado(r)!, 'nada')).toBeNull()
    const bode = base({ tipo: 'ac', ejeNombre: 'Frecuencia', ejeUnidad: 'Hz', logX: true, corridas: [{ etiqueta: '', eje: f(10, 100), series: [serie('V(a)', 'dB', f(0, -3), f(-5, -45)), serie('V(b)', 'dB', f(0, -3), f(-5, -45))] }] })
    expect(candidatosXY(modeloDeResultado(bode)!)).toEqual([])
  })
})
