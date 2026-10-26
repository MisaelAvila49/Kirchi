// @vitest-environment happy-dom
import { render } from 'solid-js/web'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { exportarPorOmision, type OpcionesExportar } from '../../../compartido/ajustes'
import type { AlcanceExportar, AreaMm } from '../exportar/seleccion'
import DialogoExportar, { areaInicial, MS_VISTA_ESQUEMA, type VistaEsquema } from './DialogoExportar'

const DIBUJO: AreaMm = { x: 0, y: 0, ancho: 100, alto: 50 }
const VISTA: VistaEsquema = { svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', anchoMm: 110, altoMm: 60, transparente: false, origenXMm: -5, origenYMm: -5 }
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeAll(() => {
  // happy-dom no trae ResizeObserver ni object URLs: el diálogo solo necesita que existan.
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

describe('el diálogo de exportar el esquema', () => {
  let quitar = () => {}
  afterEach(() => {
    quitar()
    document.body.replaceChildren()
  })
  const montar = (extra: { haySeleccion?: boolean; simulando?: boolean; hayMedidores?: boolean; formato?: 'png' | 'svg' | 'pdf'; opciones?: Partial<OpcionesExportar> } = {}) => {
    const cambios: Partial<OpcionesExportar>[] = []
    const alcances: AlcanceExportar[] = []
    const areas: AreaMm[] = []
    let exportado = 0
    let cerrado = 0
    let pedidos = 0
    quitar = render(
      () => (
        <DialogoExportar
          formato={extra.formato ?? 'png'}
          onFormato={() => {}}
          opciones={{ ...exportarPorOmision(), ...extra.opciones }}
          tema="claro"
          alcance="todo"
          onAlcance={(a) => alcances.push(a)}
          haySeleccion={extra.haySeleccion ?? false}
          area={null}
          dibujoMm={DIBUJO}
          onArea={(a) => areas.push(a)}
          onCambiar={(p) => cambios.push(p)}
          onExportar={() => exportado++}
          onCerrar={() => cerrado++}
          hayInstrumentos
          hayMedidores={extra.hayMedidores ?? true}
          simulando={extra.simulando}
          vista={async () => (pedidos++, VISTA)}
        />
      ),
      document.body
    )
    return { cambios, alcances, areas, cuenta: () => ({ exportado, cerrado, pedidos }) }
  }
  const radio = (nombre: string, texto: string) => Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${nombre}"]`)).find((i) => i.parentElement?.textContent?.startsWith(texto))!
  const interruptor = (rotulo: string) => Array.from(document.querySelectorAll('label.editor-interruptor')).find((l) => l.textContent?.startsWith(rotulo))!.querySelector('input') as HTMLInputElement

  it('el fondo ofrece Tema claro y Tema oscuro con sol y luna, y elegir el oscuro lo guarda explícito', () => {
    const t = montar()
    const temas = Array.from(document.querySelectorAll<HTMLInputElement>('[role="radiogroup"][aria-label="Tema"] input'))
    expect(temas.map((i) => i.getAttribute('aria-label'))).toEqual(['Tema claro', 'Tema oscuro'])
    expect(document.querySelectorAll('[aria-label="Tema"] svg[data-icono]').length).toBe(2)
    expect(Array.from(document.querySelectorAll('[aria-label="Tema"] label')).map((l) => l.textContent?.trim())).toEqual(['', ''])
    temas[1].click()
    expect(t.cambios.at(-1)).toMatchObject({ fondo: 'oscuro' })
  })

  it('tiene las zonas del marco: vista al centro, propiedades a la derecha, preajustes y deshacer arriba, formato y Exportar… abajo', () => {
    montar()
    expect(document.querySelector('.dialogo.exportar-editor .editor-centro .editor-vista')).not.toBeNull()
    expect(document.querySelector('.editor-panel .editor-propiedades')).not.toBeNull()
    expect(Array.from(document.querySelectorAll('.selector-estilo input')).map((i) => i.parentElement?.textContent)).toEqual(['Pantalla', 'Informe'])
    expect(document.querySelector('[aria-label="Deshacer"]')).not.toBeNull()
    expect(Array.from(document.querySelectorAll('.editor-pie .casilla-formato b')).map((b) => b.textContent)).toEqual(['PNG', 'SVG', 'PDF'])
    expect(Array.from(document.querySelectorAll('.editor-pie button')).map((b) => b.textContent)).toEqual(expect.arrayContaining(['Cancelar', 'Exportar…']))
    // A la izquierda, Seleccionar y las cinco herramientas de anotación.
    expect(Array.from(document.querySelectorAll('.editor-herramientas button')).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Seleccionar (V)',
      'Texto (T)',
      'Flecha (F)',
      'Resalte (R)',
      'Llamada numerada (N)',
      'Etiqueta de lectura (E)'
    ])
    expect(Array.from(document.querySelectorAll('.editor-zoom button')).map((b) => b.getAttribute('aria-label'))).toEqual(['Alejar', 'Acercar', 'Ajustar la figura a la vista'])
  })

  it('«Selección» está deshabilitada sin selección y avisa; con selección se puede elegir', () => {
    montar()
    expect(radio('alcance', 'Selección').disabled).toBe(true)
    expect(document.body.textContent).toContain('Selecciona algo en el lienzo')
    quitar()
    document.body.replaceChildren()
    const t = montar({ haySeleccion: true })
    expect(radio('alcance', 'Selección').disabled).toBe(false)
    radio('alcance', 'Selección').click()
    expect(t.alcances).toEqual(['seleccion'])
  })

  it('al elegir «Área» la vista atenúa lo de fuera desde el principio, rotula la medida y no rehace la imagen', async () => {
    const t = montar()
    await espera(MS_VISTA_ESQUEMA + 50)
    const antes = t.cuenta().pedidos
    expect(document.querySelectorAll('.editor-atenuado')).toHaveLength(0)
    radio('alcance', 'Área').click()
    await espera(MS_VISTA_ESQUEMA + 50)
    expect(document.querySelectorAll('.editor-atenuado')).toHaveLength(4)
    expect(document.querySelector('.editor-medida-area')?.textContent).toMatch(/^\d+ mm × \d+ mm$/)
    expect(t.cuenta().pedidos).toBe(antes)
  })

  it('«Área» propone un recuadro del 60 % central, lo avisa y muestra sus cuatro campos', async () => {
    const t = montar()
    radio('alcance', 'Área').click()
    expect(t.alcances).toEqual(['area'])
    expect(t.areas).toEqual([areaInicial(DIBUJO)])
    await espera(MS_VISTA_ESQUEMA + 50)
    expect(document.querySelectorAll('.editor-numero input')).toHaveLength(4)
    expect(document.querySelectorAll('.editor-asa-mueve')).toHaveLength(4)
    expect(document.querySelector('.editor-recuadro')).not.toBeNull()
    // El tamaño es el del área más el margen de 5 mm.
    expect(document.querySelector('.editor-pie-tamano output')?.textContent).toMatch(/px$/)
  })

  it('los colores de voltaje y las lecturas dependen de la vista previa; la rejilla, el fondo y el margen se recuerdan', () => {
    const t = montar({ simulando: false })
    expect(interruptor('Colores de voltaje').disabled).toBe(true)
    interruptor('Mostrar la rejilla').click()
    document.querySelector<HTMLInputElement>('[aria-label="Tema claro"]')!.click()
    ;(document.querySelector('.editor-deslizador input[type="range"]') as HTMLInputElement).value = '12'
    document.querySelector('.editor-deslizador input[type="range"]')!.dispatchEvent(new Event('input', { bubbles: true }))
    expect(t.cambios).toEqual([{ rejilla: true }, { fondo: 'papel' }, { margenMm: 12 }])
  })

  it('con la vista previa en marcha se pueden pedir los colores de voltaje', () => {
    const t = montar({ simulando: true })
    expect(interruptor('Colores de voltaje').disabled).toBe(false)
    interruptor('Colores de voltaje').click()
    expect(t.cambios).toEqual([{ coloresVoltaje: true }])
  })

  it('el preajuste Informe pone fondo blanco, sin rejilla, tinta negra y sin colores de voltaje; deshacer lo revierte', () => {
    const t = montar({ opciones: { fondo: 'oscuro', rejilla: true, coloresVoltaje: true } })
    radio('estilo-figura', 'Informe').click()
    expect(t.cambios.at(-1)).toEqual({ fondo: 'blanco', rejilla: false, coloresVoltaje: false, tintaNegra: true })
    ;(document.querySelector('[aria-label="Deshacer"]') as HTMLButtonElement).click()
    expect(t.cambios.at(-1)).toMatchObject({ fondo: 'oscuro', rejilla: true, coloresVoltaje: true, tintaNegra: false })
    ;(document.querySelector('[aria-label="Rehacer"]') as HTMLButtonElement).click()
    expect(t.cambios.at(-1)).toMatchObject({ fondo: 'blanco', tintaNegra: true })
  })

  it('PNG pide la resolución de 1× a 4×; PDF pide la hoja y no ofrece fondo transparente', () => {
    montar()
    expect(Array.from(document.querySelectorAll('.editor-pie select option')).map((o) => o.textContent?.[0])).toEqual(['1', '2', '3', '4'])
    quitar()
    document.body.replaceChildren()
    montar({ formato: 'pdf' })
    expect(Array.from(document.querySelectorAll('.editor-pie select option')).map((o) => o.textContent)).toEqual(['Del dibujo', 'A4', 'Carta'])
    expect(radio('fondo', 'Transparente')).toBeUndefined()
  })

  it('Exportar… y Cancelar llaman a quien corresponde, y la vista se arma una vez', async () => {
    const t = montar()
    await espera(MS_VISTA_ESQUEMA + 50)
    expect(t.cuenta().pedidos).toBe(1)
    const botones = Array.from(document.querySelectorAll<HTMLButtonElement>('.editor-pie button'))
    botones.find((b) => b.textContent === 'Exportar…')!.click()
    botones.find((b) => b.textContent === 'Cancelar')!.click()
    expect(t.cuenta()).toMatchObject({ exportado: 1, cerrado: 1 })
  })
})
