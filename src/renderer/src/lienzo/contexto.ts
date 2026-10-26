/** Contexto WebGL del lienzo. Sincronizado va sin `desynchronized` (que presentaba un cuadro estirado por cambio de
 * tamaño) y con `alpha: true`, que gastó 40 a 80 MB menos de video que `alpha: false` sin la bandera.
 * Apagado («Dibujo del lienzo sincronizado») vuelve al contexto anterior, que ahorra copias en el compositor. */
export function opcionesDeContexto(sincronizado: boolean): WebGLContextAttributes {
  return sincronizado
    ? { antialias: false, alpha: true, depth: false, stencil: false, desynchronized: false }
    : { antialias: false, alpha: false, depth: false, stencil: false, desynchronized: true }
}

/** El contexto WebGL2 del lienzo con las opciones del modo pedido; null si el equipo no tiene WebGL2. */
export function crearContexto(canvas: HTMLCanvasElement, sincronizado: boolean): WebGL2RenderingContext | null {
  return canvas.getContext('webgl2', opcionesDeContexto(sincronizado)) as WebGL2RenderingContext | null
}

/** Mezcla de cada cuadro: color con su alfa sobre lo de abajo y alfa del lienzo sumado con ONE, así queda en 1 y un lienzo
 * con `alpha: true` no deja ver la página detrás de trazos translúcidos. */
export function ponerMezcla(gl: WebGL2RenderingContext): void {
  gl.enable(gl.BLEND)
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
}
