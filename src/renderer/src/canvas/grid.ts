import type { Camera } from './camera'
import { program } from './gl'
import type { RGBA } from '../lienzo/paleta'
import { CELDAS_POR_PUNTO_OSCURO, PASO_REJILLA_MAYOR, PASO_REJILLA_MENOR } from '../lienzo/medidas'

const VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }`

const glf = (n: number): string => n.toFixed(1)

export const FS_REJILLA = `#version 300 es
precision highp float;
uniform vec2 u_origin;
uniform float u_zoom;
uniform vec2 u_res;
uniform float u_dpr;
uniform vec4 u_menor;
uniform vec4 u_mayor;
out vec4 o;
float punto(vec2 w, float paso, float radio) {
  vec2 g = abs(w - paso * floor(w / paso + 0.5)) * u_zoom;
  return 1.0 - smoothstep(radio - 0.5, radio + 0.5, length(g));
}
void main() {
  vec2 sp = vec2(gl_FragCoord.x, u_res.y * u_dpr - gl_FragCoord.y) / u_dpr;
  vec2 w = u_origin + sp / u_zoom;
  float menor = punto(w, ${glf(PASO_REJILLA_MENOR)}, 1.0) * smoothstep(6.0, 9.0, ${glf(PASO_REJILLA_MENOR)} * u_zoom);
  float paso = ${glf(PASO_REJILLA_MAYOR)};
  if (paso * u_zoom < 6.0) paso *= ${glf(CELDAS_POR_PUNTO_OSCURO)};
  if (paso * u_zoom < 6.0) paso *= ${glf(CELDAS_POR_PUNTO_OSCURO)};
  // Fundido entre el nivel actual y el siguiente más grueso: sin salto al cambiar de nivel.
  float s = smoothstep(6.0, 12.0, paso * u_zoom);
  float mayor = punto(w, paso, 1.6) * s + punto(w, paso * ${glf(CELDAS_POR_PUNTO_OSCURO)}, 1.6) * (1.0 - s);
  o = mayor >= menor ? vec4(u_mayor.rgb, u_mayor.a * mayor) : vec4(u_menor.rgb, u_menor.a * menor);
}`

/** Rejilla de puntos: menor cada celda (2 unidades) y mayor cada 6 celdas (12 unidades, 15 mm), con los colores de la paleta. */
export class GridLayer {
  private prog: WebGLProgram
  private vao: WebGLVertexArrayObject
  private u: Record<'origin' | 'zoom' | 'res' | 'dpr' | 'menor' | 'mayor', WebGLUniformLocation>

  constructor(private gl: WebGL2RenderingContext) {
    this.prog = program(gl, VS, FS_REJILLA)
    this.vao = gl.createVertexArray()!
    const loc = (n: string) => gl.getUniformLocation(this.prog, n)!
    this.u = { origin: loc('u_origin'), zoom: loc('u_zoom'), res: loc('u_res'), dpr: loc('u_dpr'), menor: loc('u_menor'), mayor: loc('u_mayor') }
  }

  /** `width`/`height` en píxeles CSS; `scale`: píxeles de dispositivo por píxel CSS. */
  draw(cam: Camera, width: number, height: number, scale: number, menor: RGBA, mayor: RGBA): void {
    const gl = this.gl
    gl.useProgram(this.prog)
    gl.uniform2f(this.u.origin, cam.x, cam.y)
    gl.uniform1f(this.u.zoom, cam.zoom)
    gl.uniform2f(this.u.res, width, height)
    gl.uniform1f(this.u.dpr, scale)
    gl.uniform4f(this.u.menor, menor[0], menor[1], menor[2], menor[3])
    gl.uniform4f(this.u.mayor, mayor[0], mayor[1], mayor[2], mayor[3])
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  }
}
