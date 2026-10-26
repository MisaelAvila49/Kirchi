// @vitest-environment happy-dom
import { render } from 'solid-js/web'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { exportarPorOmision, type OpcionesExportar } from '../../../compartido/ajustes'
import type { AreaMm } from '../exportar/seleccion'
import { COLORES_OSCUROS } from './colores'
import DialogoExportar, { MS_VISTA_ESQUEMA, type LecturaEsquema, type VistaEsquema } from './DialogoExportar'
import { crearLlamada, type Notas } from './exportar/marco/notasEsquema'

const DIBUJO: AreaMm = { x: 0, y: 0, ancho: 100, alto: 50 }
const VISTA: VistaEsquema = { svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', anchoMm: 110, altoMm: 60, transparente: false, origenXMm: -5, origenYMm: -5 }
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

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
  HTMLElement.prototype.setPointerCapture ??= () => {}
  HTMLElement.prototype.releasePointerCapture ??= () => {}
  HTMLElement.prototype.hasPointerCapture ??= () => false
})

describe('las herramientas de anotación del exportar del esquema', () => {
  let quitar = () => {}
  afterEach(() => {
    quitar()
    document.body.replaceChildren()
  })
  const montar = async (extra: { simulando?: boolean; lectura?: LecturaEsquema; notasIniciales?: Notas; magnitudInicial?: 'voltaje' | 'corriente'; onMagnitud?(m: 'voltaje' | 'corriente'): void; opciones?: Partial<OpcionesExportar> } = {}) => {
    const notas: Notas[] = []
    quitar = render(
      () => (
        <DialogoExportar
          formato="svg"
          onFormato={() => {}}
          opciones={{ ...exportarPorOmision(), ...extra.opciones }}
          tema="claro"
          alcance="todo"
          onAlcance={() => {}}
          haySeleccion={false}
          area={null}
          dibujoMm={DIBUJO}
          onArea={() => {}}
          onCambiar={() => {}}
          onExportar={() => {}}
          onCerrar={() => {}}
          simulando={extra.simulando}
          lectura={extra.lectura}
          notasIniciales={extra.notasIniciales}
          magnitudInicial={extra.magnitudInicial}
          onMagnitud={extra.onMagnitud}
          onNotas={(n) => notas.push(n)}
          vista={async () => VISTA}
        />
      ),
      document.body
    )
    await espera(MS_VISTA_ESQUEMA + 50)
    return { notas, ultima: () => notas.at(-1) ?? [] }
  }
  const herr = (nombre: string) => document.querySelector<HTMLButtonElement>(`.editor-herramientas button[aria-label^="${nombre}"]`)!
  const vista = () => document.querySelector<HTMLElement>('.editor-vista')!
  const clic = (x: number, y: number) => vista().dispatchEvent(Object.assign(new MouseEvent('pointerdown', { clientX: x, clientY: y, button: 0, bubbles: true }), { pointerId: 1 }))
  const suelta = (x: number, y: number) => vista().dispatchEvent(Object.assign(new MouseEvent('pointerup', { clientX: x, clientY: y, button: 0, bubbles: true }), { pointerId: 1 }))
  const mueve = (x: number, y: number) => vista().dispatchEvent(Object.assign(new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }), { pointerId: 1 }))
  const tecla = (key: string, init: KeyboardEventInit = {}) => vista().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
  const capa = () => document.querySelector('.marco-notas')?.innerHTML ?? ''

  it('las herramientas de color llevan su tono R1 y Seleccionar queda en tinta', async () => {
    await montar()
    const tonos = Array.from(document.querySelectorAll('.editor-herramientas svg')).map((s) => s.getAttribute('data-h'))
    expect(tonos).toEqual([null, 'azul', 'violeta', 'cian', 'magenta', 'naranja'])
  })

  it('cada llamada queda elegida al ponerla, con su barra, y la herramienta vuelve a Seleccionar; se borra con Supr y el botón', async () => {
    const t = await montar()
    herr('Llamada').click()
    clic(300, 200)
    expect(herr('Seleccionar').getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.editor-barra[data-tipo="llamada"]')).not.toBeNull()
    expect(document.querySelector('.editor-barra [aria-label="Borrar"]')).not.toBeNull()
    herr('Llamada').click()
    clic(400, 250)
    expect(t.ultima()).toHaveLength(2)
    expect(Array.from(capa().matchAll(/>(\d)<\/text>/g)).map((m) => m[1])).toEqual(['1', '2'])
    // Se elige la primera con Seleccionar y se borra con Supr: la otra se renumera.
    clic(300, 200)
    tecla('Delete')
    expect(t.ultima()).toHaveLength(1)
    expect(Array.from(capa().matchAll(/>(\d)<\/text>/g)).map((m) => m[1])).toEqual(['1'])
    clic(400, 250)
    document.querySelector<HTMLButtonElement>('.editor-barra [aria-label="Borrar"]')!.click()
    expect(t.ultima()).toHaveLength(0)
  })

  it('cada herramienta muestra su fantasma siguiendo al puntero y Esc lo quita', async () => {
    await montar()
    const fantasma = () => document.querySelector('.marco-fantasma')?.innerHTML ?? ''
    expect(fantasma()).toBe('')
    herr('Texto').click()
    mueve(300, 200)
    expect(fantasma()).toContain('>Texto</text>')
    herr('Llamada').click()
    mueve(310, 210)
    expect(fantasma()).toMatch(/>1<\/text>/)
    herr('Flecha').click()
    mueve(320, 220)
    expect(fantasma()).toBe('')
    clic(320, 220)
    mueve(380, 260)
    expect(fantasma()).toContain('<line')
    tecla('Escape')
    herr('Resalte').click()
    mueve(320, 220)
    expect(fantasma()).toBe('')
    clic(320, 220)
    mueve(380, 260)
    expect(fantasma()).toMatch(/<rect/)
    tecla('Escape')
    expect(fantasma()).toBe('')
  })

  it('el fantasma de la etiqueta muestra el valor solo sobre un cable', async () => {
    const lectura: LecturaEsquema = {
      objetivoEn: (x) => (x > 100 ? { x: 10, y: 10, cable: 'c1', pin: null } : null),
      texto: () => '2.5 V',
      nota: () => 'punto de operación'
    }
    await montar({ lectura })
    const fantasma = () => document.querySelector('.marco-fantasma')?.innerHTML ?? ''
    herr('Etiqueta').click()
    mueve(50, 50)
    expect(fantasma()).toBe('')
    mueve(400, 250)
    expect(fantasma()).toContain('2.5 V')
    expect(fantasma()).toContain('punto de operación')
  })

  it('al reabrir conserva las anotaciones y lo que mide la etiqueta, y elegirlo se avisa', async () => {
    const elegidas: string[] = []
    await montar({ notasIniciales: crearLlamada([], 20, 20)!.notas, magnitudInicial: 'corriente', onMagnitud: (m) => elegidas.push(m) })
    expect(capa()).toContain('>1</text>')
    herr('Etiqueta').click()
    const pastilla = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter((i) => i.closest('[aria-label="Qué mide la etiqueta"]'))
    expect(pastilla.find((i) => i.checked)?.parentElement?.textContent).toBe('Corriente')
    pastilla.find((i) => i.parentElement?.textContent === 'Voltaje')!.click()
    expect(elegidas).toEqual(['voltaje'])
  })

  it('deshacer y rehacer del diálogo cubren las anotaciones', async () => {
    const t = await montar()
    herr('Llamada').click()
    clic(300, 200)
    expect(t.ultima()).toHaveLength(1)
    tecla('z', { ctrlKey: true })
    expect(t.ultima()).toHaveLength(0)
    expect(capa()).toBe('')
    tecla('y', { ctrlKey: true })
    expect(t.ultima()).toHaveLength(1)
  })

  it('el texto libre se pone con un clic, vuelve a Seleccionar y Esc suelta la herramienta', async () => {
    const t = await montar()
    herr('Texto').click()
    expect(herr('Texto').getAttribute('aria-pressed')).toBe('true')
    clic(300, 200)
    expect(t.ultima()[0]).toMatchObject({ tipo: 'texto', texto: 'Texto' })
    expect(herr('Seleccionar').getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.editor-barra[data-tipo="texto"]')).not.toBeNull()
    expect((document.querySelector('.editor-propiedades input[type="text"]') as HTMLInputElement).value).toBe('Texto')
    herr('Flecha').click()
    tecla('Escape')
    expect(herr('Seleccionar').getAttribute('aria-pressed')).toBe('true')
  })

  it('la flecha y el resalte se dibujan arrastrando; un clic suelto no deja nada', async () => {
    const t = await montar()
    herr('Flecha').click()
    clic(300, 200)
    mueve(400, 260)
    suelta(400, 260)
    expect(t.ultima()[0]).toMatchObject({ tipo: 'flecha', punta: 'cerrada' })
    herr('Resalte').click()
    clic(450, 250)
    suelta(450, 250)
    expect(t.ultima()).toHaveLength(1)
    clic(450, 250)
    mueve(520, 300)
    suelta(520, 300)
    expect(t.ultima()[1]).toMatchObject({ tipo: 'resalte', forma: 'rectangulo', relleno: false })
    expect(document.querySelector('.editor-barra[data-tipo="resalte"]')).not.toBeNull()
    // Un resalte elegido enseña sus cuatro esquinas.
    expect(document.querySelectorAll('.editor-asa-mueve')).toHaveLength(4)
  })

  it('el panel cambia la forma, el relleno y la punta', async () => {
    const t = await montar()
    herr('Resalte').click()
    clic(450, 250)
    mueve(520, 300)
    suelta(520, 300)
    const pastilla = (grupo: string, texto: string) =>
      Array.from(document.querySelectorAll(`[aria-label="${grupo}"] input`)).find((i) => i.parentElement?.textContent === texto) as HTMLInputElement
    pastilla('Forma del resalte', 'Círculo').click()
    expect(t.ultima()[0]).toMatchObject({ forma: 'elipse' })
    expect(capa()).toContain('<ellipse')
    const relleno = Array.from(document.querySelectorAll('.editor-interruptor')).find((l) => l.textContent?.startsWith('Relleno claro'))!.querySelector('input') as HTMLInputElement
    relleno.click()
    expect(t.ultima()[0]).toMatchObject({ relleno: true })
  })

  it('la etiqueta de lectura pide un cable o un pin, lee al momento y queda elegida', async () => {
    let pedido: unknown = null
    const lectura: LecturaEsquema = {
      objetivoEn: (x, y, _tol, m) => (pedido = { x, y, m }, x > 0 ? { x: 10, y: 10, cable: 'c1', pin: null } : null),
      texto: (n) => `${n.magnitud === 'voltaje' ? '3.333 V' : '1.2 mA'}`
    }
    const t = await montar({ lectura, simulando: false })
    herr('Etiqueta').click()
    clic(5, 5)
    expect(document.body.textContent).toContain('Haz clic sobre un cable o un pin')
    clic(400, 250)
    expect(pedido).toMatchObject({ m: 'voltaje' })
    expect(t.ultima()[0]).toMatchObject({ tipo: 'lectura', magnitud: 'voltaje', cable: 'c1' })
    expect(capa()).toContain('3.333 V')
    expect(herr('Seleccionar').getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.editor-barra[data-tipo="lectura"]')).not.toBeNull()
    // Sin el circuito detrás, la etiqueta dice que no hay lectura.
  })

  it('sin circuito que leer la etiqueta avisa y no pone nada', async () => {
    const t = await montar()
    herr('Etiqueta').click()
    clic(400, 250)
    expect(t.notas).toHaveLength(0)
    expect(document.body.textContent).toContain('Haz clic sobre un cable o un pin')
  })

  it('las anotaciones salen en el tema oscuro de la lámina cuando el fondo es oscuro', async () => {
    await montar({ opciones: { fondo: 'oscuro' } })
    herr('Texto').click()
    clic(300, 200)
    expect(capa()).toContain(COLORES_OSCUROS.negro)
  })

  it('avisa de las anotaciones que quedan fuera de la imagen', async () => {
    await montar()
    herr('Llamada').click()
    clic(300, 200)
    tecla('Escape')
    clic(300, 200)
    expect(document.body.textContent).not.toMatch(/fuera de la imagen/)
    // Con las flechas se saca de la lámina (5 mm por pulsación con Mayús).
    for (let i = 0; i < 30; i++) tecla('ArrowLeft', { shiftKey: true })
    expect(document.body.textContent).toContain('Una anotación queda fuera de la imagen y no saldrá.')
  })
})
