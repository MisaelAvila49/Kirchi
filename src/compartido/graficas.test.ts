import { describe, expect, it } from 'vitest'
import { esRutaGraficas, MAX_CORRIDAS_TRANSFERIDAS, RUTA_GRAFICAS, urlDeGraficas, validarDatosGraficas, validarPedidoExportar } from './graficas'

const mapeado = () => ({ tipo: 'ac', ejeNombre: 'Frecuencia', ejeUnidad: 'Hz', logX: true, avisos: [], corridas: [{ etiqueta: '', eje: Float64Array.from([1, 10]), series: [{ id: 'v:1', etiqueta: 'V(a)', unidad: 'dB', magnitud: 'V', valores: Float64Array.from([0, -3]), fase: Float64Array.from([0, -45]) }] }] })
const corrida = (n = 1) => ({ n, nombre: 'Bode', analisis: { id: 'a1', nombre: 'Bode', config: { tipo: 'op' } }, mapeado: mapeado() })
const datos = (o: Record<string, unknown> = {}) => ({ corridas: [corrida()], elegida: 1, tema: 'claro', archivo: 'rc.kir', ...o })

describe('ruta y datos de la ventana de gráficas', () => {
  it('la ventana nueva carga la misma página con la ruta #graficas', () => {
    expect(urlDeGraficas('app://kirchi/index.html')).toBe(`app://kirchi/index.html${RUTA_GRAFICAS}`)
    expect(urlDeGraficas('http://localhost:5173/#otra')).toBe('http://localhost:5173/#graficas')
    expect(esRutaGraficas('#graficas')).toBe(true)
    expect(esRutaGraficas('')).toBe(false)
    expect(esRutaGraficas(undefined)).toBe(false)
  })
  it('acepta datos bien formados y los devuelve limpios', () => {
    const d = validarDatosGraficas(datos())!
    expect(d.corridas).toHaveLength(1)
    expect(d.corridas[0].mapeado.corridas[0].eje).toBeInstanceOf(Float64Array)
    expect(d.tema).toBe('claro')
    expect(d.elegida).toBe(1)
  })
  it('rechaza formas equivocadas, temas raros, análisis inválidos y arreglos que no son Float64Array', () => {
    expect(validarDatosGraficas(null)).toBeNull()
    expect(validarDatosGraficas(datos({ tema: 'rosa' }))).toBeNull()
    expect(validarDatosGraficas(datos({ corridas: 'x' }))).toBeNull()
    expect(validarDatosGraficas(datos({ corridas: [{ ...corrida(), analisis: { id: '__proto__', nombre: 'x', config: { tipo: 'op' } } }] }))).toBeNull()
    const mal = corrida()
    ;(mal.mapeado.corridas[0] as { eje: unknown }).eje = [1, 2]
    expect(validarDatosGraficas(datos({ corridas: [mal] }))).toBeNull()
  })
  it('rechaza demasiadas corridas', () => {
    const muchas = Array.from({ length: MAX_CORRIDAS_TRANSFERIDAS + 1 }, (_, i) => corrida(i + 1))
    expect(validarDatosGraficas(datos({ corridas: muchas }))).toBeNull()
  })
  it('rechaza series con otra longitud que su eje, demasiadas series y un n negativo', () => {
    const corta = corrida()
    corta.mapeado.corridas[0].series[0].valores = Float64Array.from([1])
    expect(validarDatosGraficas(datos({ corridas: [corta] }))).toBeNull()
    const fase = corrida()
    fase.mapeado.corridas[0].series[0].fase = Float64Array.from([1, 2, 3])
    expect(validarDatosGraficas(datos({ corridas: [fase] }))).toBeNull()
    const series = corrida()
    const una = series.mapeado.corridas[0].series[0]
    series.mapeado.corridas[0].series = Array.from({ length: 513 }, () => ({ ...una }))
    expect(validarDatosGraficas(datos({ corridas: [series] }))).toBeNull()
    expect(validarDatosGraficas(datos({ corridas: [corrida(-1)] }))).toBeNull()
  })
  it('el pedido de exportar lleva la corrida y las trazas apagadas', () => {
    expect(validarPedidoExportar({ n: 3, ocultas: ['V(a)', 7] })).toEqual({ n: 3, ocultas: ['V(a)'] })
    expect(validarPedidoExportar({ n: 'x' })).toBeNull()
    expect(validarPedidoExportar(null)).toBeNull()
  })
})
