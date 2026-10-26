import { describe, expect, it } from 'vitest'
import { crearContexto, opcionesDeContexto, ponerMezcla } from './contexto'

/** Parpadeo: con `desynchronized: true` el WebGL se presenta fuera de paso con el compositor y cada cambio de tamaño
 * mostraba un cuadro viejo y estirado. Sincronizado (por omisión) va sin esa bandera y con `alpha: true`, alfa final 1
 * (`blendFuncSeparate`) y el mismo dibujo píxel por píxel. */

/** Un lienzo de mentira que anota con qué opciones se le pidió el contexto. */
function lienzoFalso() {
  const pedidos: { tipo: string; opciones: WebGLContextAttributes | undefined }[] = []
  const contexto = { falso: true }
  const canvas = {
    getContext: (tipo: string, opciones?: WebGLContextAttributes) => {
      pedidos.push({ tipo, opciones })
      return contexto
    }
  } as unknown as HTMLCanvasElement
  return { canvas, pedidos, contexto }
}

describe('contexto WebGL del lienzo', () => {
  it('sincronizado (por omisión): sin desynchronized y con alfa, sin antialias, profundidad ni plantilla', () => {
    expect(opcionesDeContexto(true)).toEqual({ antialias: false, alpha: true, depth: false, stencil: false, desynchronized: false })
    const { canvas, pedidos, contexto } = lienzoFalso()
    expect(crearContexto(canvas, true)).toBe(contexto)
    expect(pedidos).toEqual([{ tipo: 'webgl2', opciones: opcionesDeContexto(true) }])
  })

  it('sin sincronizar: el contexto de antes (desynchronized y sin alfa), por si en algún equipo va mejor', () => {
    expect(opcionesDeContexto(false)).toEqual({ antialias: false, alpha: false, depth: false, stencil: false, desynchronized: true })
    const { canvas, pedidos } = lienzoFalso()
    crearContexto(canvas, false)
    expect(pedidos[0].opciones).toEqual(opcionesDeContexto(false))
  })

  it('la mezcla deja el alfa del lienzo en 1: color con SRC_ALPHA, alfa con ONE (blendFuncSeparate, no blendFunc)', () => {
    const llamadas: unknown[][] = []
    const gl = {
      SRC_ALPHA: 0x302, ONE_MINUS_SRC_ALPHA: 0x303, ONE: 1, BLEND: 0xbe2,
      enable: (...a: unknown[]) => llamadas.push(['enable', ...a]),
      blendFunc: (...a: unknown[]) => llamadas.push(['blendFunc', ...a]),
      blendFuncSeparate: (...a: unknown[]) => llamadas.push(['blendFuncSeparate', ...a])
    } as unknown as WebGL2RenderingContext
    ponerMezcla(gl)
    expect(llamadas).toEqual([['enable', 0xbe2], ['blendFuncSeparate', 0x302, 0x303, 1, 0x303]])
  })
})
