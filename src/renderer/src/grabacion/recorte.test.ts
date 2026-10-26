import { describe, expect, it } from 'vitest'
import { crearRecorte, rectEnVideo, tamañoSalida, type LienzoLike, type Medidas } from './recorte'

describe('tamañoSalida', () => {
  it('baja el lado corto a 720 o 1080 y conserva la proporción', () => {
    expect(tamañoSalida(2560, 1440, '720p')).toEqual({ ancho: 1280, alto: 720 })
    expect(tamañoSalida(2560, 1440, '1080p')).toEqual({ ancho: 1920, alto: 1080 })
  })
  it('nunca supera el tamaño real', () => {
    expect(tamañoSalida(1280, 600, '1080p')).toEqual({ ancho: 1280, alto: 600 })
    expect(tamañoSalida(1000, 500, '720p')).toEqual({ ancho: 1000, alto: 500 })
  })
  it('real deja el tamaño, siempre par', () => {
    expect(tamañoSalida(2561, 1441, 'real')).toEqual({ ancho: 2560, alto: 1440 })
  })
})

describe('rectEnVideo', () => {
  const sinMarco: Medidas = { videoAncho: 3000, videoAlto: 2000, interiorAncho: 1500, interiorAlto: 1000, exteriorAncho: 1516, exteriorAlto: 1039 }
  it('escala por la proporción cuando el cuadro es solo el contenido', () => {
    expect(rectEnVideo({ x: 100, y: 50, ancho: 600, alto: 400 }, sinMarco)).toEqual({ x: 200, y: 100, ancho: 1200, alto: 800 })
  })
  it('suma el marco cuando el cuadro trae la ventana entera', () => {
    const m: Medidas = { videoAncho: 1516, videoAlto: 1039, interiorAncho: 1500, interiorAlto: 1000, exteriorAncho: 1516, exteriorAlto: 1039 }
    // borde lateral 8, barra de título 39 - 8 = 31
    expect(rectEnVideo({ x: 100, y: 50, ancho: 600, alto: 400 }, m)).toEqual({ x: 108, y: 81, ancho: 600, alto: 400 })
  })
  it('se queda dentro del cuadro', () => {
    const r = rectEnVideo({ x: 1400, y: 900, ancho: 600, alto: 400 }, { ...sinMarco, videoAncho: 1500, videoAlto: 1000 })
    expect(r.x + r.ancho).toBeLessThanOrEqual(1500)
    expect(r.y + r.alto).toBeLessThanOrEqual(1000)
  })
})

describe('crearRecorte', () => {
  function montar() {
    const dibujos: number[][] = []
    const lienzo: LienzoLike = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: (_f, sx, sy, sa, sh, dx, dy, da, dh) => void dibujos.push([sx, sy, sa, sh, dx, dy, da, dh]) }),
      captureStream: () => ({ getVideoTracks: () => [] })
    }
    let tic: (() => void) | null = null
    let ms = 0
    let parado = false
    let rect = { x: 10, y: 20, ancho: 400, alto: 300 }
    const r = crearRecorte({
      video: {},
      rect: () => rect,
      salida: { ancho: 200, alto: 150 },
      fps: 30,
      crearLienzo: (a, h) => ((lienzo.width = a), (lienzo.height = h), lienzo),
      cada: (f, t) => ((tic = f), (ms = t), 1),
      dejarDe: () => void (parado = true),
      flujo: (l, fps) => ({ l, fps })
    })
    return { r, lienzo, dibujos, tic: () => tic!(), ms: () => ms, parado: () => parado, mover: (n: typeof rect) => (rect = n) }
  }
  it('crea el lienzo del tamaño de salida y pide el flujo a 30 fps', () => {
    const m = montar()
    expect(m.lienzo.width).toBe(200)
    expect(m.lienzo.height).toBe(150)
    expect(m.r.stream).toEqual({ l: m.lienzo, fps: 30 })
    expect(m.ms()).toBeCloseTo(33.33, 1)
  })
  it('si el lienzo cambia de tamaño conserva la salida y escala', () => {
    const m = montar()
    m.mover({ x: 0, y: 0, ancho: 800, alto: 600 })
    m.tic()
    expect(m.dibujos.at(-1)).toEqual([0, 0, 800, 600, 0, 0, 200, 150])
    expect(m.lienzo.width).toBe(200)
  })
  it('parar detiene el reloj', () => {
    const m = montar()
    m.r.parar()
    expect(m.parado()).toBe(true)
  })
})
