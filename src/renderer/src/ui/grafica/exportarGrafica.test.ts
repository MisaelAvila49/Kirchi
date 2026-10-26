import { describe, expect, it } from 'vitest'
import { figuraPorOmision } from '../../../../compartido/ajustes'
import { ASPECTO_ANALISIS } from '../../../../compartido/grafica/aspecto'
import { exportarGrafica, type DependenciasExportar } from './exportarGrafica'
import { VISTA_COMPLETA, type ModeloGrafica } from './modelo'
import { PILAS_POR_OMISION } from '../osciloscopio/figura'

const x = Float64Array.from([1, 2, 3])
const modelo: ModeloGrafica = {
  tipo: 'lineas',
  ejeX: { nombre: 'Tiempo', unidad: 's', escala: 'lin', datos: { min: 1, max: 3 } },
  paneles: [{ titulo: '' }],
  trazas: [{ clave: 'V(a)', etiqueta: 'V(a)', unidad: 'V', x, y: Float64Array.from([0, 1, 2]), panel: 0, tono: 'canal-a', lado: 'izquierda' }]
}
const entrada = { titulo: 'Transitorio', subtitulo: 'prueba', modelo, vista: VISTA_COMPLETA, aspecto: ASPECTO_ANALISIS }

function deps(ruta: string | null = 'C:/x/salida') {
  const escritos: { ruta: string; bytes: Uint8Array }[] = []
  const pdfs: { ruta: string; svg: string }[] = []
  const pedidas: string[] = []
  const d: DependenciasExportar = {
    api: {
      rutaExportar: async (_f, nombre) => (pedidas.push(nombre), ruta),
      escribirExportacion: async (r, bytes) => (escritos.push({ ruta: r, bytes }), { ok: true } as never),
      pdf: async (r, svg) => (pdfs.push({ ruta: r, svg }), { ok: true } as never)
    },
    rasterizar: async () => Uint8Array.from([137, 80, 78, 71]),
    ppp: 96,
    css: async () => '',
    pilas: PILAS_POR_OMISION
  }
  return { d, escritos, pdfs, pedidas }
}

describe('exportar una gráfica', () => {
  it('el CSV lleva los datos y el nombre sugerido toma la extensión', async () => {
    const { d, escritos, pedidas } = deps()
    const r = await exportarGrafica(entrada, { ...figuraPorOmision(), formato: 'csv' }, 'claro', 'RC Bode', d)
    expect(r).toEqual({ ok: true, ruta: 'C:/x/salida' })
    expect(pedidas[0]).toBe('RC Bode.csv')
    expect(new TextDecoder().decode(escritos[0].bytes)).toContain('Tiempo (s),V(a) (V)')
  })
  it('el PNG pasa por el rasterizador y el SVG sale como texto vectorial con la gráfica', async () => {
    const a = deps()
    await exportarGrafica(entrada, { ...figuraPorOmision(), formato: 'png' }, 'claro', 'g', a.d)
    expect(Array.from(a.escritos[0].bytes)).toEqual([137, 80, 78, 71])
    const b = deps()
    await exportarGrafica(entrada, { ...figuraPorOmision(), formato: 'svg' }, 'claro', 'g', b.d)
    const svg = new TextDecoder().decode(b.escritos[0].bytes)
    expect(svg).toContain('<svg')
    expect(svg).toContain('Transitorio')
  })
  it('el PDF manda el SVG y el tamaño de la lámina a la impresión', async () => {
    const { d, pdfs } = deps()
    await exportarGrafica(entrada, { ...figuraPorOmision(), formato: 'pdf' }, 'oscuro', 'g', d)
    expect(pdfs[0].svg).toContain('<svg')
  })
  it('cancelar el diálogo de archivo no escribe nada', async () => {
    const { d, escritos } = deps(null)
    expect(await exportarGrafica(entrada, figuraPorOmision(), 'claro', 'g', d)).toEqual({ ok: false, cancelado: true })
    expect(escritos).toHaveLength(0)
  })
  it('un error del disco llega como mensaje', async () => {
    const { d } = deps()
    d.api.escribirExportacion = async () => ({ ok: false, error: 'Disco lleno.' }) as never
    expect(await exportarGrafica(entrada, { ...figuraPorOmision(), formato: 'csv' }, 'claro', 'g', d)).toEqual({ ok: false, error: 'Disco lleno.' })
  })
})
