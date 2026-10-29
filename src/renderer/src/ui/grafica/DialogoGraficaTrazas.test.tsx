// @vitest-environment happy-dom
import { render } from 'solid-js/web'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { figuraPorOmision } from '../../../../compartido/ajustes'
import { ASPECTO_INFORME } from '../../../../compartido/grafica/aspecto'
import { olvidarTodo } from '../exportar/editor/memoria'
import DialogoGrafica from './DialogoGrafica'
import { VISTA_COMPLETA, type ModeloGrafica } from './modelo'
import type { EntradaFigura } from './figura'
import { PILAS_POR_OMISION } from '../osciloscopio/figura'

const f = Float64Array.from([10, 100, 1000])
// La forma del Bode real: cada red es una clave con su magnitud (panel 0) y su fase discontinua (panel 1).
const bode = (): ModeloGrafica => ({
  tipo: 'lineas',
  ejeX: { nombre: 'Frecuencia', unidad: 'Hz', escala: 'log', datos: { min: 10, max: 1000 } },
  paneles: [{ titulo: 'Ganancia (dB)' }, { titulo: 'Fase' }],
  trazas: [
    { clave: 'V(Salida)', etiqueta: 'V(Salida)', unidad: 'dB', x: f, y: Float64Array.from([0, -3, -20]), panel: 0, tono: 'canal-a', lado: 'izquierda' },
    { clave: 'V(Salida)', etiqueta: 'V(Salida)', unidad: '°', x: f, y: Float64Array.from([0, -45, -80]), panel: 1, tono: 'canal-a', lado: 'izquierda', discontinua: true },
    { clave: 'V(Entrada)', etiqueta: 'V(Entrada)', unidad: 'dB', x: f, y: Float64Array.from([0, 0, 0]), panel: 0, tono: 'canal-b', lado: 'izquierda' },
    { clave: 'V(Entrada)', etiqueta: 'V(Entrada)', unidad: '°', x: f, y: Float64Array.from([0, 0, 0]), panel: 1, tono: 'canal-b', lado: 'izquierda', discontinua: true }
  ]
})
const entrada = (): EntradaFigura => ({ titulo: 'Bode', subtitulo: 's', modelo: bode(), vista: VISTA_COMPLETA, aspecto: ASPECTO_INFORME })

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    constructor(private cb: (e: unknown[]) => void) {}
    observe() {
      this.cb([{ contentRect: { width: 800, height: 500 } }])
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  URL.createObjectURL ??= () => 'blob:prueba'
  URL.revokeObjectURL ??= () => {}
})

describe('cambiar las trazas de un Bode en el diálogo de exportar', () => {
  let quitar = () => {}
  let salida: EntradaFigura | null = null
  beforeEach(() => {
    olvidarTodo()
    salida = null
    quitar = render(() => <DialogoGrafica entrada={entrada()} tema="claro" opciones={figuraPorOmision()} pilas={PILAS_POR_OMISION} onCambiar={() => {}} onExportar={(e) => (salida = e)} onCerrar={() => {}} />, document.body)
  })
  afterEach(() => {
    quitar()
    document.body.replaceChildren()
  })
  const elegir = (v: string) => {
    const l = document.querySelector('select[aria-label="Objeto de la figura que se edita"]') as HTMLSelectElement
    l.value = v
    l.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const panel = () => document.querySelector('.editor-propiedades') as HTMLElement
  const campo = (rotulo: string) => Array.from(panel().querySelectorAll('label.editor-campo')).find((l) => l.textContent?.startsWith(rotulo))!.querySelector('select') as HTMLSelectElement
  it.each(['traza:V(Salida)', 'traza:V(Salida)#°', 'traza:V(Entrada)'])('de una sola traza (%s) cambian el color, el grosor y el eje', (v) => {
    elegir(v)
    const naranja = panel().querySelector('button[aria-label="Naranja"]') as HTMLButtonElement
    naranja.click()
    expect(naranja.getAttribute('aria-pressed')).toBe('true')
    const g = campo('Grosor')
    g.value = '3'
    g.dispatchEvent(new Event('change', { bubbles: true }))
    expect(campo('Grosor').value).toBe('3')
    const e = campo('Eje vertical')
    e.value = 'derecha'
    e.dispatchEvent(new Event('change', { bubbles: true }))
    expect(campo('Eje vertical').value).toBe('derecha')
    // La magnitud y la fase de una misma red comparten lo elegido.
    elegir(v.includes('Salida') ? 'traza:V(Salida)' : 'traza:V(Entrada)')
    expect(panel().querySelector('button[aria-label="Naranja"]')!.getAttribute('aria-pressed')).toBe('true')
  })
})
