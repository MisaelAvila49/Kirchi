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

const modelo = (y: number[]): ModeloGrafica => ({
  tipo: 'lineas',
  ejeX: { nombre: 'Frecuencia', unidad: 'Hz', escala: 'log', datos: { min: 10, max: 1000 } },
  paneles: [{ titulo: '' }],
  trazas: [{ clave: 'a', etiqueta: 'a', unidad: 'dB', x: Float64Array.from([10, 100, 1000]), y: Float64Array.from(y), panel: 0, tono: 'canal-a', lado: 'izquierda' }]
})
const entrada = (y: number[]): EntradaFigura => ({ titulo: 'Bode', subtitulo: 's', modelo: modelo(y), vista: VISTA_COMPLETA, aspecto: ASPECTO_INFORME })

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

describe('el diálogo de exportar una gráfica recuerda lo ajustado', () => {
  let quitar = () => {}
  beforeEach(olvidarTodo)
  afterEach(() => {
    quitar()
    document.body.replaceChildren()
  })
  const abrir = (e: EntradaFigura) => {
    quitar = render(() => <DialogoGrafica entrada={e} tema="claro" opciones={figuraPorOmision()} pilas={PILAS_POR_OMISION} onCambiar={() => {}} onExportar={() => {}} onCerrar={() => {}} />, document.body)
  }
  const cerrar = () => {
    quitar()
    document.body.replaceChildren()
  }
  const ejes = () => Array.from(document.querySelectorAll('label.asp-rango')).find((l) => l.textContent?.startsWith('Grosor de los ejes'))!.querySelector('input') as HTMLInputElement
  const poner = (v: string) => {
    const i = ejes()
    i.value = v
    i.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const restablecer = () => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Restablecer'))!.click()

  it('reabrir con los mismos datos conserva el ajuste; Restablecer y datos nuevos lo reinician', () => {
    abrir(entrada([0, -3, -20]))
    poner('3')
    expect(ejes().value).toBe('3')
    cerrar()
    abrir(entrada([0, -3, -20]))
    expect(ejes().value).toBe('3')
    restablecer()
    expect(ejes().value).toBe('1')
    poner('2')
    cerrar()
    abrir(entrada([0, -3, -25]))
    expect(ejes().value).toBe('1')
  })
})
