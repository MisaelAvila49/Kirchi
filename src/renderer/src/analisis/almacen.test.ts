// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import type { AnalisisDoc } from '../../../compartido/analisis/config'
import type { ApiNgspice, ResultadoAnalisis } from '../../../compartido/ngspice'
import { calcularConexiones } from '../conexiones/conexiones'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { AlmacenAnalisis, MAX_CORRIDAS_GUARDADAS } from './almacen'
import { armarContexto } from './contexto'
import { SIN_TRAZAS } from './ejecucion'

const lib = libreriaDePrueba().piezas
const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const DC = (ref: string, voltaje: string, mas: string): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje }, pines: { '+': mas, '-': '0' } })
const d = conEtiquetas(lib, [DC('V1', '5', 'entrada'), R('R1', '1k', 'entrada', 'salida'), R('R2', '1k', 'salida', '0')])
const r = armarContexto(d, lib, calcularConexiones(d, lib))
if (!r.ok) throw new Error(r.error)
const ctx = r.ctx
const OP: AnalisisDoc = { id: 'a1', nombre: 'Punto de operación 1', config: { tipo: 'op' } }

type Api = Pick<ApiNgspice, 'ejecutar' | 'cancelar'>
function armar(api: Api | undefined) {
  const registro: [string, string][] = []
  const almacen = new AlmacenAnalisis({ api: () => api, registrar: (t, n) => registro.push([t, n]), esperaMaximaMs: 200, esperaCancelarMs: 30 })
  return { almacen, registro }
}
const graficoVacio = (): ResultadoAnalisis => ({ ok: true, graficos: [], avisos: [], duracionMs: 5 })

describe('almacén de corridas', () => {
  it('una corrida con error queda en la lista con su mensaje, llega al Registro y libera el almacén', async () => {
    const { almacen, registro } = armar({ ejecutar: async () => ({ ok: false, error: 'ngspice no está instalado con Kirchi: los análisis no están disponibles.' }), cancelar: async () => {} })
    const c = await almacen.ejecutar(OP, ctx, SIN_TRAZAS)
    expect(c?.estado).toBe('error')
    expect(c?.clase).toBe('ausente')
    expect(almacen.corriendo).toBe(false)
    expect(registro.at(-1)).toEqual(['Punto de operación 1: ngspice no está instalado con Kirchi: los análisis no están disponibles.', 'error'])
  })

  it('sin API dice que ngspice no está y no se cuelga', async () => {
    const { almacen } = armar(undefined)
    const c = await almacen.ejecutar(OP, ctx, SIN_TRAZAS)
    expect(c?.estado).toBe('error')
    expect(almacen.corriendo).toBe(false)
  })

  it('un IPC que nunca contesta se da por perdido pasado el tiempo y deja ejecutar de nuevo', async () => {
    const { almacen } = armar({ ejecutar: () => new Promise(() => {}), cancelar: async () => {} })
    const c = await almacen.ejecutar(OP, ctx, SIN_TRAZAS)
    expect(c?.estado).toBe('error')
    expect(c?.clase).toBe('tiempo')
    expect(almacen.corriendo).toBe(false)
  })

  it('cancelar mientras corre avisa al servicio y deja la corrida cancelada, no con error', async () => {
    let soltar!: (r: ResultadoAnalisis) => void
    const cancelar = vi.fn(async () => soltar({ ok: false, error: 'Análisis cancelado.', cancelado: true }))
    const { almacen, registro } = armar({ ejecutar: () => new Promise((res) => (soltar = res)), cancelar })
    const p = almacen.ejecutar(OP, ctx, SIN_TRAZAS)
    expect(almacen.corriendo).toBe(true)
    expect(almacen.corridas()[0].estado).toBe('corriendo')
    almacen.cancelar()
    const c = await p
    expect(cancelar).toHaveBeenCalledOnce()
    expect(c?.estado).toBe('cancelado')
    expect(registro.at(-1)).toEqual(['Análisis cancelado.', 'info'])
    expect(almacen.corriendo).toBe(false)
  })

  it('si el servicio no contesta a la cancelación, la corrida se da por cancelada sin esperar al tiempo máximo', async () => {
    const cancelar = vi.fn(async () => {})
    const { almacen } = armar({ ejecutar: () => new Promise(() => {}), cancelar })
    const p = almacen.ejecutar(OP, ctx, SIN_TRAZAS)
    almacen.cancelar()
    const c = await p
    expect(c?.estado).toBe('cancelado')
    expect(almacen.corriendo).toBe(false)
  })

  it('una segunda corrida mientras hay una en curso se rechaza con un aviso', async () => {
    let soltar!: (r: ResultadoAnalisis) => void
    const { almacen, registro } = armar({ ejecutar: () => new Promise((res) => (soltar = res)), cancelar: async () => {} })
    const primera = almacen.ejecutar(OP, ctx, SIN_TRAZAS)
    expect(await almacen.ejecutar(OP, ctx, SIN_TRAZAS)).toBeNull()
    expect(registro.at(-1)?.[1]).toBe('aviso')
    soltar(graficoVacio())
    await primera
    expect(almacen.corridas()).toHaveLength(1)
  })

  it('el punto de operación vigente se descarta al editar y las corridas se conservan', async () => {
    const { almacen } = armar({
      ejecutar: async () => ({
        ok: true,
        duracionMs: 3,
        avisos: [],
        graficos: [{ nombre: 'op', complejo: false, puntos: 1, vectores: ctx.redes.map((x) => ({ nombre: `v(n${x.nodo})`, unidad: 'voltage', referencia: { tipo: 'nodo' as const, nodo: x.nodo }, re: Float64Array.of(x.nodo), im: null })) }]
      }),
      cancelar: async () => {}
    })
    const c = await almacen.ejecutar(OP, ctx, SIN_TRAZAS)
    expect(c?.estado).toBe('listo')
    expect(almacen.opVigente?.redes.length).toBe(ctx.redes.length)
    const v0 = almacen.version
    almacen.descartarOp()
    expect(almacen.opVigente).toBeNull()
    expect(almacen.version).toBeGreaterThan(v0)
    expect(almacen.corridas()).toHaveLength(1)
  })

  it('conserva las últimas corridas, las más recientes primero, y avisa a quien se suscribe', async () => {
    const { almacen } = armar({ ejecutar: async () => graficoVacio(), cancelar: async () => {} })
    let avisos = 0
    almacen.suscribir(() => avisos++)
    for (let i = 0; i < MAX_CORRIDAS_GUARDADAS + 3; i++) await almacen.ejecutar(OP, ctx, SIN_TRAZAS)
    expect(almacen.corridas()).toHaveLength(MAX_CORRIDAS_GUARDADAS)
    expect(almacen.corridas()[0].n).toBeGreaterThan(almacen.corridas()[1].n)
    expect(avisos).toBeGreaterThanOrEqual(2 * (MAX_CORRIDAS_GUARDADAS + 3))
    almacen.limpiar()
    expect(almacen.corridas()).toHaveLength(0)
  })
})
