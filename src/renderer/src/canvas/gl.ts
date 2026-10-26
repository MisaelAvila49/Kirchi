function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s)
    gl.deleteShader(s)
    throw new Error(`shader: ${log}`)
  }
  return s
}

export function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`programa: ${gl.getProgramInfoLog(p)}`)
  return p
}

/** Sube `datos` a `buf` sin reservar de nuevo si cabe en `capacidad` (bytes): la capa de movimiento y las flechas suben
 * cada cuadro casi el mismo tamaño. Devuelve la capacidad nueva. */
export function subirAlBufer(gl: WebGL2RenderingContext, datos: Float32Array, capacidad: number): number {
  // Si lo nuevo cabe y no es mucho más chico (una escena grande cambiada por una chica libera su memoria de video).
  if (datos.byteLength <= capacidad && datos.byteLength * 4 >= capacidad && capacidad > 0) {
    if (datos.byteLength > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, datos)
    return capacidad
  }
  gl.bufferData(gl.ARRAY_BUFFER, datos, gl.DYNAMIC_DRAW)
  return datos.byteLength
}
