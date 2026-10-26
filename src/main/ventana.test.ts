import { describe, expect, it } from 'vitest'
import { CANAL_ORDEN_VENTANA } from '../compartido/ventana'
import { aplicarOrdenVentana, controlDeTamaño, estadoDeVentanaViva, registrarVentana, ventanaDeOrden, type VentanaOrdenable } from './ventana'

function falsa() {
  let completa = false
  const tamaños: string[] = []
  const w: VentanaOrdenable = { isFullScreen: () => completa, setFullScreen: (v) => (completa = v) }
  const tamaño = (o: string) => tamaños.push(o)
  return { w, tamaño, tamaños, completa: () => completa }
}

describe('aplicar una orden a la ventana', () => {
  it('acercar, alejar y tamaño real van al control del tamaño de la interfaz (el mismo de las teclas y del ajuste)', () => {
    const f = falsa()
    expect(aplicarOrdenVentana(f.w, 'acercar', f.tamaño)).toBe(true)
    aplicarOrdenVentana(f.w, 'alejar', f.tamaño)
    aplicarOrdenVentana(f.w, 'tamaño-real', f.tamaño)
    expect(f.tamaños).toEqual(['acercar', 'alejar', 'tamaño-real'])
    expect(f.completa()).toBe(false)
  })

  it('pantalla completa se alterna', () => {
    const f = falsa()
    aplicarOrdenVentana(f.w, 'pantalla-completa', f.tamaño)
    expect(f.completa()).toBe(true)
    aplicarOrdenVentana(f.w, 'pantalla-completa', f.tamaño)
    expect(f.completa()).toBe(false)
  })

  it('lo que no es una orden no hace nada', () => {
    const f = falsa()
    for (const v of ['cerrar', 3, null, { orden: 'acercar' }]) expect(aplicarOrdenVentana(f.w, v, f.tamaño)).toBe(false)
    expect(f.tamaños).toEqual([])
    expect(f.completa()).toBe(false)
  })
})

describe('quién puede pedirle algo a una ventana', () => {
  const marco = { url: 'app://kirchi/index.html' }
  const propia = (u: string | undefined) => u?.startsWith('app://kirchi/') === true
  const editor = falsa()
  const ventanaDe = (id: number) => (id === 1 ? editor.w : undefined)

  it('solo el marco principal de una página propia de una ventana del editor', () => {
    expect(ventanaDeOrden({ sender: { id: 1, mainFrame: marco }, senderFrame: marco }, ventanaDe, propia)).toBe(editor.w)
    // Un marco interno, una página ajena, una ventana que no es del editor (la del PDF) y un marco ya destruido no.
    expect(ventanaDeOrden({ sender: { id: 1, mainFrame: marco }, senderFrame: { url: marco.url } }, ventanaDe, propia)).toBeUndefined()
    const ajeno = { url: 'https://ejemplo.com/' }
    expect(ventanaDeOrden({ sender: { id: 1, mainFrame: ajeno }, senderFrame: ajeno }, ventanaDe, propia)).toBeUndefined()
    expect(ventanaDeOrden({ sender: { id: 2, mainFrame: marco }, senderFrame: marco }, ventanaDe, propia)).toBeUndefined()
    expect(ventanaDeOrden({ sender: { id: 1, mainFrame: marco }, senderFrame: null }, ventanaDe, propia)).toBeUndefined()
  })

  it('registrarVentana escucha el canal y aplica solo lo que pasa la revisión', () => {
    let oyente: ((e: unknown, orden: unknown) => void) | undefined
    let canal = ''
    const f = falsa()
    registrarVentana({ on: (c, o) => ((canal = c), (oyente = o as typeof oyente)) }, (id) => (id === 1 ? f.w : undefined), propia, f.tamaño)
    expect(canal).toBe(CANAL_ORDEN_VENTANA)
    oyente!({ sender: { id: 1, mainFrame: marco }, senderFrame: marco }, 'pantalla-completa')
    oyente!({ sender: { id: 1, mainFrame: marco }, senderFrame: { url: marco.url } }, 'acercar')
    expect([f.completa(), f.tamaños]).toEqual([true, []])
  })
})

describe('tamaño de la interfaz en las ventanas', () => {
  it('pone el factor en cada ventana viva y les avisa el valor; guarda solo si cambió', () => {
    const factores: number[] = [], avisos: unknown[] = []
    const viva = { isDestroyed: () => false, webContents: { setZoomFactor: (z: number) => factores.push(z), send: (_c: string, t: unknown) => avisos.push(t) } }
    const muerta = { isDestroyed: () => true, webContents: { setZoomFactor: () => factores.push(-1), send: () => avisos.push(-1) } }
    const guardados: number[] = []
    const control = controlDeTamaño({ actual: () => 100, poner: (t) => guardados.push(t), ventanas: () => [viva, muerta] })
    control('acercar')
    expect(guardados).toEqual([110])
    expect(factores).toEqual([1.1])
    expect(avisos).toEqual([110])
    const quieto = controlDeTamaño({ actual: () => 150, poner: (t) => guardados.push(t), ventanas: () => [viva] })
    quieto('acercar')
    expect(guardados).toEqual([110])
  })
})

describe('estado de la ventana viva', () => {
  it('toma el rectángulo normal y los dos modos', () => {
    const w = { isMaximized: () => true, isFullScreen: () => false, isMinimized: () => false, getNormalBounds: () => ({ x: 10, y: 20, width: 1000, height: 700 }) }
    expect(estadoDeVentanaViva(w)).toEqual({ x: 10, y: 20, ancho: 1000, alto: 700, maximizada: true, pantallaCompleta: false })
  })
})
