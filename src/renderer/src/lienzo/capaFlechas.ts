import type { Camera } from '../canvas/camera'
import { program, subirAlBufer } from '../canvas/gl'
import { FLOTANTES_FLECHA, SEPARACION_FLECHAS } from './flechas'
import { ANCHO_CABLE } from './medidas'
import type { RGBA } from './paleta'

/** Medio ancho de la base de una punta (unidades de rejilla fina): un poco más ancha que el cable. */
export const MEDIO_ANCHO_FLECHA = 1.6 * ANCHO_CABLE
/** Largo de una punta, de su base a su vértice. */
export const LARGO_FLECHA = 1.1

/** Las puntas se dibujan en el fragmento: cada tramo es un cuadrilátero a lo largo de su cable y el fragmento ve en qué
 * parte de la separación cae (`u`, largo desde el inicio). Por cuadro solo cambia `u_dt` (segundos de reloj desde la
 * última lectura): la CPU no trabaja por punta. */
const VS = `#version 300 es
layout(location=0) in vec2 a_esquina;
layout(location=1) in vec2 a_p0;
layout(location=2) in vec2 a_p1;
layout(location=3) in float a_inicio;
layout(location=4) in float a_fase;
layout(location=5) in float a_vel;
layout(location=6) in float a_tipo;
uniform vec2 u_origen;
uniform float u_escala;
uniform vec2 u_res;
uniform float u_medio;
out vec2 v_local;
flat out float v_largo;
flat out float v_inicio;
flat out float v_pos;
flat out float v_signo;
flat out float v_tipo;
uniform float u_dt;
uniform float u_sep;
void main() {
  vec2 d = a_p1 - a_p0;
  float l = length(d);
  vec2 dir = l > 1e-6 ? d / l : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  // Un poco más allá de cada punta para que el borde suave no se corte.
  float m = u_medio + 1.0 / u_escala;
  float u = mix(-m, l + m, a_esquina.x);
  float w = a_esquina.y * m;
  vec2 p = a_p0 + dir * u + n * w;
  v_local = vec2(u, w);
  v_largo = l;
  v_inicio = a_inicio;
  v_pos = mod(a_fase + a_vel * u_dt, u_sep);
  v_signo = a_vel < 0.0 ? -1.0 : 1.0;
  v_tipo = a_tipo;
  vec2 s = (p - u_origen) * u_escala;
  gl_Position = vec4(s.x / u_res.x * 2.0 - 1.0, 1.0 - s.y / u_res.y * 2.0, 0.0, 1.0);
}`

const FS = `#version 300 es
precision highp float;
in vec2 v_local;
flat in float v_largo;
flat in float v_inicio;
flat in float v_pos;
flat in float v_signo;
flat in float v_tipo;
uniform float u_sep;
uniform float u_medio;
uniform float u_largoPunta;
uniform float u_escala;
uniform vec4 u_color;
out vec4 o;
// Cobertura de una punta cuyo vértice está a 'a' unidades adelante (a lo largo del sentido) del punto, con el borde suave
// también a lo largo (en el vértice y en la base), no solo a los lados.
float punta(float a, float w) {
  float px = 1.0 / u_escala;
  if (a < -px || a > u_largoPunta + px) return 0.0;
  float medio = u_medio * clamp(a / u_largoPunta, 0.0, 1.0);
  float lados = clamp((medio - abs(w)) * u_escala + 0.5, 0.0, 1.0);
  float largo = clamp(a * u_escala + 0.5, 0.0, 1.0) * clamp((u_largoPunta - a) * u_escala + 0.5, 0.0, 1.0);
  return lados * largo;
}
void main() {
  if (v_local.x < 0.0 || v_local.x > v_largo) discard;
  // El largo a lo largo del cable: las puntas siguen continuas de un tramo al siguiente.
  float s = v_local.x + v_inicio;
  float adelante = mod(v_signo * (v_pos - s), u_sep);
  float c = punta(adelante, v_local.y);
  // Puntas dobles quietas: otra punta hacia atrás, con su base frente a la de la primera y medio largo de hueco.
  if (v_tipo > 1.5) c = max(c, punta(mod(s - v_pos + 2.5 * u_largoPunta, u_sep), v_local.y));
  if (c <= 0.0) discard;
  o = vec4(u_color.rgb, u_color.a * c);
}`

/** Las flechas de la corriente animada, por encima de los cables y debajo de los textos. */
export class CapaFlechas {
  private prog: WebGLProgram
  private vao: WebGLVertexArrayObject
  private inst: WebGLBuffer
  private cuenta = 0
  /** Bytes reservados en el búfer. */
  private capacidad = 0
  private u: Record<'origen' | 'escala' | 'res' | 'medio' | 'dt' | 'sep' | 'largoPunta' | 'color', WebGLUniformLocation>

  constructor(private gl: WebGL2RenderingContext) {
    this.prog = program(gl, VS, FS)
    const loc = (n: string) => gl.getUniformLocation(this.prog, n)!
    this.u = { origen: loc('u_origen'), escala: loc('u_escala'), res: loc('u_res'), medio: loc('u_medio'), dt: loc('u_dt'), sep: loc('u_sep'), largoPunta: loc('u_largoPunta'), color: loc('u_color') }
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    const esquinas = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, esquinas)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.inst = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst)
    const paso = FLOTANTES_FLECHA * 4
    const attr = (l: number, tam: number, desde: number) => {
      gl.enableVertexAttribArray(l)
      gl.vertexAttribPointer(l, tam, gl.FLOAT, false, paso, desde * 4)
      gl.vertexAttribDivisor(l, 1)
    }
    attr(1, 2, 0)
    attr(2, 2, 2)
    attr(3, 1, 4)
    attr(4, 1, 5)
    attr(5, 1, 6)
    attr(6, 1, 7)
    gl.bindVertexArray(null)
  }

  get vacia(): boolean {
    return this.cuenta === 0
  }

  subir(datos: Float32Array, cuenta: number): void {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst)
    this.capacidad = subirAlBufer(gl, datos, this.capacidad)
    this.cuenta = cuenta
  }

  /** `dt`: segundos de reloj desde la lectura que dio las fases (0 con las animaciones en pausa). */
  dibujar(cam: Camera, anchoDisp: number, altoDisp: number, dpr: number, dt: number, color: RGBA): void {
    if (this.cuenta === 0) return
    const gl = this.gl
    gl.useProgram(this.prog)
    gl.uniform2f(this.u.origen, cam.x, cam.y)
    gl.uniform1f(this.u.escala, cam.zoom * dpr)
    gl.uniform2f(this.u.res, anchoDisp, altoDisp)
    gl.uniform1f(this.u.medio, MEDIO_ANCHO_FLECHA)
    gl.uniform1f(this.u.dt, dt)
    gl.uniform1f(this.u.sep, SEPARACION_FLECHAS)
    gl.uniform1f(this.u.largoPunta, LARGO_FLECHA)
    gl.uniform4f(this.u.color, color[0], color[1], color[2], color[3])
    gl.bindVertexArray(this.vao)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.cuenta)
    gl.bindVertexArray(null)
  }
}
