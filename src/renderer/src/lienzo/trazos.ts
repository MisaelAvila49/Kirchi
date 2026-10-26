import type { Camera } from '../canvas/camera'
import { program, subirAlBufer } from '../canvas/gl'
import { FLOTANTES_TRAZO } from './buffers'

const VS = `#version 300 es
layout(location=0) in vec2 a_esquina;
layout(location=1) in vec2 a_p0;
layout(location=2) in vec2 a_p1;
layout(location=3) in float a_ancho;
layout(location=4) in vec4 a_color;
uniform vec2 u_origen;
uniform float u_escala;
uniform vec2 u_res;
uniform float u_minimo;
out vec2 v_p;
flat out vec2 v_a;
flat out vec2 v_b;
flat out float v_r;
out vec4 v_color;
void main() {
  vec2 a = (a_p0 - u_origen) * u_escala;
  vec2 b = (a_p1 - u_origen) * u_escala;
  float r = max(a_ancho * u_escala, u_minimo) * 0.5;
  vec2 d = b - a;
  float l = length(d);
  vec2 dir = l > 1e-6 ? d / l : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  float m = r + 1.0;
  vec2 p = mix(a - dir * m, b + dir * m, a_esquina.x) + n * m * a_esquina.y;
  v_p = p;
  v_a = a;
  v_b = b;
  v_r = r;
  v_color = a_color;
  gl_Position = vec4(p.x / u_res.x * 2.0 - 1.0, 1.0 - p.y / u_res.y * 2.0, 0.0, 1.0);
}`

const FS = `#version 300 es
precision highp float;
in vec2 v_p;
flat in vec2 v_a;
flat in vec2 v_b;
flat in float v_r;
in vec4 v_color;
out vec4 o;
void main() {
  vec2 pa = v_p - v_a;
  vec2 ba = v_b - v_a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  float d = length(pa - ba * h);
  float a = clamp(v_r + 0.5 - d, 0.0, 1.0);
  if (a <= 0.0) discard;
  o = vec4(v_color.rgb, v_color.a * a);
}`

/** Segmentos con extremos redondos (cápsulas) instanciados; trabaja en píxeles de dispositivo. */
export class CapaTrazos {
  private prog: WebGLProgram
  private vao: WebGLVertexArrayObject
  private inst: WebGLBuffer
  private cuenta = 0
  /** Bytes reservados en el búfer. */
  private capacidad = 0
  private u: Record<'origen' | 'escala' | 'res' | 'minimo', WebGLUniformLocation>

  constructor(private gl: WebGL2RenderingContext) {
    this.prog = program(gl, VS, FS)
    const loc = (n: string) => gl.getUniformLocation(this.prog, n)!
    this.u = { origen: loc('u_origen'), escala: loc('u_escala'), res: loc('u_res'), minimo: loc('u_minimo') }
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    const esquinas = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, esquinas)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.inst = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst)
    const paso = FLOTANTES_TRAZO * 4
    const attr = (l: number, tam: number, desde: number) => {
      gl.enableVertexAttribArray(l)
      gl.vertexAttribPointer(l, tam, gl.FLOAT, false, paso, desde * 4)
      gl.vertexAttribDivisor(l, 1)
    }
    attr(1, 2, 0)
    attr(2, 2, 2)
    attr(3, 1, 4)
    attr(4, 4, 5)
    gl.bindVertexArray(null)
  }

  subir(datos: Float32Array, cuenta: number): void {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst)
    this.capacidad = subirAlBufer(gl, datos, this.capacidad)
    this.cuenta = cuenta
  }

  /** `anchoDisp`/`altoDisp`: tamaño del lienzo en píxeles de dispositivo; `dpr`: píxeles de dispositivo por píxel CSS. */
  dibujar(cam: Camera, anchoDisp: number, altoDisp: number, dpr: number): void {
    if (this.cuenta === 0) return
    const gl = this.gl
    gl.useProgram(this.prog)
    gl.uniform2f(this.u.origen, cam.x, cam.y)
    gl.uniform1f(this.u.escala, cam.zoom * dpr)
    gl.uniform2f(this.u.res, anchoDisp, altoDisp)
    gl.uniform1f(this.u.minimo, dpr)
    gl.bindVertexArray(this.vao)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.cuenta)
    gl.bindVertexArray(null)
  }
}
