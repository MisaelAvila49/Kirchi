import { describe, expect, it } from 'vitest'
import { figuraPorOmision } from '../../../../compartido/ajustes'
import { ASPECTO_INFORME as ASPECTO_ANALISIS } from '../../../../compartido/grafica/aspecto'
import { ContextoSvg } from '../../exportar/contextoSvg'
import { anotacionesVacias } from '../../../../compartido/grafica/anotaciones'
import { COLORES_CLAROS, COLORES_OSCUROS } from '../colores'
import { conTamañoGeneral, csvDeGrafica, figuraDeGrafica, filasDeGrafica, modeloConTrazas } from './figura'
import { VISTA_COMPLETA, type ModeloGrafica } from './modelo'

const x = Float64Array.from([10, 100, 1000])
const bode: ModeloGrafica = {
  tipo: 'lineas',
  ejeX: { nombre: 'Frecuencia', unidad: 'Hz', escala: 'log', datos: { min: 10, max: 1000 } },
  paneles: [{ titulo: 'Magnitud' }, { titulo: 'Fase' }],
  trazas: [
    { clave: 'V(s)', etiqueta: 'V(s)', unidad: 'dB', x, y: Float64Array.from([0, -3, -20]), panel: 0, tono: 'canal-a', lado: 'izquierda' },
    { clave: 'V(s)', etiqueta: 'V(s)', unidad: '°', x, y: Float64Array.from([-5, -45, -85]), panel: 1, tono: 'canal-a', lado: 'izquierda' }
  ]
}
const e = { titulo: 'Bode del RC', subtitulo: 'CA de 10 Hz a 1 kHz', modelo: bode, vista: VISTA_COMPLETA, aspecto: ASPECTO_ANALISIS }

function svgDe(op = figuraPorOmision(), actual: 'claro' | 'oscuro' = 'claro', entrada = e) {
  const f = figuraDeGrafica(entrada, op, actual)
  const ctx = new ContextoSvg(f.ancho, f.alto)
  f.dibujar(ctx, 1)
  return { svg: ctx.svg({ titulo: 'x' }), f }
}

describe('tamaño general de la letra', () => {
  it('llega a los ejes que no traen tamaño propio y no pisa uno propio', () => {
    expect(conTamañoGeneral(ASPECTO_ANALISIS, 14).textoTam).toBe(14)
    expect(conTamañoGeneral({ ...ASPECTO_ANALISIS, textoTam: 18 }, 14).textoTam).toBe(18)
    expect(conTamañoGeneral(ASPECTO_ANALISIS, 11).textoTam).toBeNull()
    const op = { ...figuraPorOmision(), tamañoLetra: 14 }
    expect(svgDe(op).svg).toContain('font-size="14"')
    const chico = svgDe({ ...figuraPorOmision(), tamañoLetra: 9 })
    expect(chico.svg).toContain('font-size="9"')
  })
})

describe('subtítulo en blanco', () => {
  it('un subtítulo vacío no se reemplaza por el automático y cierra su renglón', () => {
    const anotaciones = { ...anotacionesVacias(), estilos: { subtitulo: { texto: '' } } }
    const base = svgDe()
    const sin = svgDe(figuraPorOmision(), 'claro', { ...e, anotaciones } as typeof e)
    expect(base.svg).toContain('CA de 10 Hz a 1 kHz')
    expect(sin.svg).not.toContain('CA de 10 Hz a 1 kHz')
    expect(sin.f.alto).toBeLessThan(base.f.alto)
    expect(sin.f.geometria?.().objetos.some((o) => o.id === 'subtitulo')).toBe(false)
  })
})

describe('figura de una gráfica de análisis', () => {
  it('lleva el título, el subtítulo, los ejes y la leyenda, y el dibujo de dos paneles es más alto', () => {
    const { svg, f } = svgDe()
    for (const t of ['Bode del RC', 'CA de 10 Hz a 1 kHz', 'Frecuencia', '>Hz<', 'Magnitud', 'Fase', 'V(s)']) expect(svg).toContain(t.replace(/[<>]/g, ''))
    const uno = figuraDeGrafica({ ...e, modelo: { ...bode, paneles: [{ titulo: '' }], trazas: [bode.trazas[0]] } }, figuraPorOmision(), 'claro')
    expect(f.alto).toBeGreaterThan(uno.alto)
  })
  it('el tema del aspecto manda sobre fondo, rejilla y escalas: claro es blanco y oscuro, el lienzo oscuro', () => {
    const op = figuraPorOmision()
    const blanco = svgDe({ ...op, tema: 'claro' }, 'oscuro', { ...e, aspecto: { ...ASPECTO_ANALISIS, tema: 'claro' } })
    expect(blanco.f.fondo).not.toBe(COLORES_OSCUROS.negro)
    const tema = svgDe(op, 'claro', { ...e, aspecto: { ...ASPECTO_ANALISIS, tema: 'oscuro' } })
    expect(tema.f.fondo).toBe('#17181B')
  })
  it('el preajuste Informe pinta igual el texto de los ejes con la leyenda arriba o sin ella', () => {
    const negro = COLORES_CLAROS['negro-texto'].toLowerCase()
    const cuenta = (leyenda: boolean) => {
      const { svg } = svgDe(figuraPorOmision(), 'claro', { ...e, adornos: { titulo: true, leyenda, marco: false, resplandor: false } } as never)
      return svg.toLowerCase().split(negro).length - 1
    }
    expect(cuenta(false)).toBeGreaterThan(0)
    expect(cuenta(false)).toBe(cuenta(true))
  })
  it('sin rejilla ni ejes en las opciones, el dibujo sale sin sus escalas', () => {
    const { svg } = svgDe({ ...figuraPorOmision(), ejes: false })
    expect(svg).not.toContain('Frecuencia (Hz)')
  })
  it('los colores que guardaron versiones viejas del diálogo (t0, t1) ya no pisan el tono de la traza', () => {
    const op = { ...figuraPorOmision(), colores: { t0: 'negro' as const } }
    const svg = svgDe(op).svg.toLowerCase()
    expect(svg).not.toContain(`stroke="${COLORES_CLAROS.negro.toLowerCase()}"`)
    expect(svg).toContain(`stroke="${COLORES_CLAROS['canal-a'].toLowerCase()}"`)
  })
})

describe('la figura exportada es el aspecto configurado (N8b)', () => {
  const tiempo = Float64Array.from([0, 0.001, 0.002, 0.003])
  const mv: ModeloGrafica = {
    tipo: 'lineas',
    ejeX: { nombre: 'Tiempo', unidad: 's', escala: 'lin', datos: { min: 0, max: 0.003 } },
    paneles: [{ titulo: '' }],
    trazas: [{ clave: 'V(a)', etiqueta: 'V(a)', unidad: 'V', x: tiempo, y: Float64Array.from([0, 0.0005, 0.001, 0.0015]), panel: 0, tono: 'canal-a', lado: 'izquierda' }]
  }
  const entrada = { ...e, modelo: mv }
  it('la unidad, el peso y el tono del texto y el grosor de la traza llegan al SVG', () => {
    const base = svgDe(figuraPorOmision(), 'claro', entrada).svg
    expect(base).toContain('>mV<')
    expect(base).toContain('>ms<')
    const aspecto = { ...ASPECTO_ANALISIS, textoPeso: 'negrita' as const, grosor: 3, prefijoX: 'u' as const }
    const cambiado = svgDe(figuraPorOmision(), 'claro', { ...entrada, aspecto }).svg
    expect(cambiado).toContain('>µs<')
    expect(cambiado).toContain('font-weight="700"')
    expect(cambiado).toContain('stroke-width="3"')
  })
  it('la rejilla del aspecto manda: apagada no hay líneas de rejilla aunque la opción compartida esté encendida', () => {
    const con = svgDe(figuraPorOmision(), 'claro', entrada).svg
    const sin = svgDe(figuraPorOmision(), 'claro', { ...entrada, aspecto: { ...ASPECTO_ANALISIS, rejilla: false } }).svg
    expect(sin.length).toBeLessThan(con.length)
  })
  it('lo que cambió el diálogo en una traza (eje, tono, grosor y unidad) se aplica a todas las de su nombre', () => {
    const m = modeloConTrazas(bode, { 'V(s)': { lado: 'derecha', color: 'naranja', grosor: 3, prefijo: 'base' } })
    expect(m.trazas.every((t) => t.lado === 'derecha' && t.tono === 'naranja' && t.grosor === 3 && t.prefijo === 'base')).toBe(true)
    expect(modeloConTrazas(bode, {})).toEqual(bode)
    expect(bode.trazas[0].lado).toBe('izquierda')
  })
})

describe('CSV de una gráfica', () => {
  it('un Bode: la frecuencia y la magnitud y la fase de cada traza en un solo bloque', () => {
    const csv = csvDeGrafica('Bode', 'CA', bode, VISTA_COMPLETA).split('\n')
    expect(csv).toContain('Frecuencia (Hz),V(s) (dB),V(s) (°)')
    expect(csv).toContain('100,-3,-45')
    expect(filasDeGrafica(bode, VISTA_COMPLETA)).toBe(3)
  })
  it('ejes distintos (corridas de un barrido) van en bloques separados', () => {
    const otro = { ...bode.trazas[0], clave: 'otra', etiqueta: 'otra', x: Float64Array.from([1, 2, 3, 4]), y: Float64Array.from([1, 2, 3, 4]) }
    const csv = csvDeGrafica('x', 'y', { ...bode, trazas: [bode.trazas[0], otro] }, VISTA_COMPLETA)
    expect(csv.split('\n\n')).toHaveLength(2)
  })
  it('las trazas apagadas no se exportan y las comillas de un título se duplican', () => {
    const csv = csvDeGrafica('=HYPERLINK("x")', 'y', bode, { ...VISTA_COMPLETA, ocultas: new Set(['V(s)']) })
    expect(csv).toContain('"# Kirchi · =HYPERLINK(""x"")"')
    expect(csv).toContain('Sin trazas visibles')
  })
})

describe('recortar la gráfica a un tramo del eje horizontal', () => {
  const t = Float64Array.from([0, 0.001, 0.002, 0.003, 0.004, 0.005])
  const m: ModeloGrafica = {
    tipo: 'lineas',
    ejeX: { nombre: 'Tiempo', unidad: 's', escala: 'lin', datos: { min: 0, max: 0.005 } },
    paneles: [{ titulo: '' }],
    trazas: [{ clave: 'V(a)', etiqueta: 'V(a)', unidad: 'V', x: t, y: Float64Array.from([0, 1, 2, 3, 4, 5]), panel: 0, tono: 'canal-a', lado: 'izquierda' }]
  }
  const entrada = { ...e, modelo: m }
  it('el CSV solo trae los puntos del tramo y lo dice; sin rango trae todos', () => {
    const csv = csvDeGrafica('T', 'S', m, VISTA_COMPLETA, { desde: 0.0015, hasta: 0.0045 }).trimEnd().split('\n')
    expect(csv.filter((l) => !l.startsWith('#') && !l.startsWith('Tiempo'))).toEqual(['0.002,2', '0.003,3', '0.004,4'])
    expect(csv.some((l) => l.startsWith('# Tramo exportado: de 0.0015 a 0.0045 s'))).toBe(true)
    expect(csvDeGrafica('T', 'S', m, VISTA_COMPLETA).trimEnd().split('\n').filter((l) => !l.startsWith('#') && !l.startsWith('Tiempo'))).toHaveLength(6)
    expect(filasDeGrafica(m, VISTA_COMPLETA, { desde: 0.0015, hasta: 0.0045 })).toBe(3)
    expect(filasDeGrafica(m, VISTA_COMPLETA)).toBe(6)
  })
  it('la figura del tramo dibuja ese tramo y deja el eje completo para ampliarlo', () => {
    const completa = figuraDeGrafica(entrada, figuraPorOmision(), 'claro')
    const tramo = figuraDeGrafica({ ...entrada, rango: { desde: 0.001, hasta: 0.003 } }, figuraPorOmision(), 'claro')
    expect(completa.eje!.mapa.dom).toEqual({ min: 0, max: 0.005 })
    expect(tramo.eje!.mapa.dom).toEqual({ min: 0.001, max: 0.003 })
    expect(tramo.eje!.total).toEqual({ min: 0, max: 0.005 })
    expect(tramo.eje!.mapa.px1).toBeGreaterThan(tramo.eje!.mapa.px0)
    // Un rango que no recorta nada deja la vista como estaba.
    expect(figuraDeGrafica({ ...entrada, rango: { desde: -1, hasta: 1 } }, figuraPorOmision(), 'claro').eje!.mapa.dom).toEqual({ min: 0, max: 0.005 })
  })
  it('las barras de armónicos no tienen eje que recortar', () => {
    const barras: ModeloGrafica = { tipo: 'barras', ejeX: { nombre: 'n', unidad: '', escala: 'lin', datos: { min: 0, max: 1 } }, paneles: [{ titulo: '' }], trazas: [], barras: { categorias: ['1'], series: [{ clave: 'V', etiqueta: 'V', tono: 'canal-a', unidad: 'V', valores: Float64Array.from([1]) }], unidad: 'V', frecuencias: Float64Array.from([50]), nota: '' } }
    expect(figuraDeGrafica({ ...e, modelo: barras }, figuraPorOmision(), 'claro').eje).toBeUndefined()
  })
})

describe('grosor general de los ejes', () => {
  const trazos = (svg: string, g: string) => (svg.match(new RegExp(`stroke-width="${g}"`, 'g')) ?? []).length
  it('cambia las líneas de los ejes en la figura exportada', () => {
    const base = svgDe().svg
    const grueso = svgDe(figuraPorOmision(), 'claro', { ...e, aspecto: { ...ASPECTO_ANALISIS, grosorEjes: 3 } }).svg
    expect(trazos(grueso, '3')).toBeGreaterThan(trazos(base, '3'))
  })
})
