import type { Camera } from '../canvas/camera'
import { program, subirAlBufer } from '../canvas/gl'
import { FLOTANTES_VERTICE } from './buffers'

const VS = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_color;
uniform vec2 u_origen;
uniform float u_escala;
uniform vec2 u_res;
out vec4 v_color;
void main() {
  vec2 p = (a_pos - u_origen) * u_escala;
  gl_Position = vec4(p.x / u_res.x * 2.0 - 1.0, 1.0 - p.y / u_res.y * 2.0, 0.0, 1.0);
  v_color = a_color;
}`

const FS = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 o;
void main() { o = v_color; }`

/** Rellenos de símbolos (triángulos de earcut); el contorno de cápsulas les da el borde suave. */
export class CapaTriangulos {
  private prog: WebGLProgram
  private vao: WebGLVertexArrayObject
  private buf: WebGLBuffer
  private cuenta = 0
  /** Bytes reservados en el búfer. */
  private capacidad = 0
  private u: Record<'origen' | 'escala' | 'res', WebGLUniformLocation>

  constructor(private gl: WebGL2RenderingContext) {
    this.prog = program(gl, VS, FS)
    const loc = (n: string) => gl.getUniformLocation(this.prog, n)!
    this.u = { origen: loc('u_origen'), escala: loc('u_escala'), res: loc('u_res') }
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    this.buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    const paso = FLOTANTES_VERTICE * 4
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, paso, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, paso, 8)
    gl.bindVertexArray(null)
  }

  /** `cuenta`: número de triángulos. */
  subir(datos: Float32Array, cuenta: number): void {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    this.capacidad = subirAlBufer(gl, datos, this.capacidad)
    this.cuenta = cuenta
  }

  dibujar(cam: Camera, anchoDisp: number, altoDisp: number, dpr: number): void {
    if (this.cuenta === 0) return
    const gl = this.gl
    gl.useProgram(this.prog)
    gl.uniform2f(this.u.origen, cam.x, cam.y)
    gl.uniform1f(this.u.escala, cam.zoom * dpr)
    gl.uniform2f(this.u.res, anchoDisp, altoDisp)
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLES, 0, this.cuenta * 3)
    gl.bindVertexArray(null)
  }
}
