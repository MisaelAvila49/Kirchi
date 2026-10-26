import { describe, expect, it } from 'vitest'
import { escribirDuracion, leerDuracionMs } from './cabeceraWebm'

const u = (...n: number[]) => new Uint8Array(n)
const cat = (...p: Uint8Array[]) => {
  const o = new Uint8Array(p.reduce((s, x) => s + x.length, 0))
  let i = 0
  for (const x of p) {
    o.set(x, i)
    i += x.length
  }
  return o
}
/** Elemento con tamaño de 1 byte (datos menores de 127). */
const el = (id: number[], datos: Uint8Array) => cat(u(...id), u(0x80 | datos.length), datos)
const texto = (s: string) => new TextEncoder().encode(s)

const CLUSTER = cat(u(0x1f, 0x43, 0xb6, 0x75), u(0x88), u(0xe7, 0x81, 0x00, 0xa3, 0x82, 0x81, 0x00, 0xff))
const ESCALA = el([0x2a, 0xd7, 0xb1], u(0x0f, 0x42, 0x40))

function webm(opts: { duracion?: number; segmentoConocido?: boolean; seekHead?: boolean } = {}) {
  const ebml = el([0x1a, 0x45, 0xdf, 0xa3], el([0x42, 0x82], texto('webm')))
  let dur = u()
  if (opts.duracion !== undefined) {
    const v = new Uint8Array(8)
    new DataView(v.buffer).setFloat64(0, opts.duracion)
    dur = el([0x44, 0x89], v)
  }
  const info = el([0x15, 0x49, 0xa9, 0x66], cat(ESCALA, dur, el([0x4d, 0x80], texto('Chrome'))))
  const tracks = el([0x16, 0x54, 0xae, 0x6b], el([0xae], el([0xd7], u(1))))
  const seek = opts.seekHead ? el([0x11, 0x4d, 0x9b, 0x74], el([0x4d, 0xbb], el([0x53, 0xab], u(0x15, 0x49, 0xa9, 0x66)))) : u()
  const cuerpo = cat(seek, info, tracks, CLUSTER)
  const tam = opts.segmentoConocido ? u(0x01, 0, 0, 0, 0, 0, 0, cuerpo.length) : u(0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff)
  return cat(ebml, u(0x18, 0x53, 0x80, 0x67), tam, cuerpo)
}

const final = (a: Uint8Array, n: number) => Array.from(a.slice(a.length - n))

describe('cabecera WebM', () => {
  it('sin Duration devuelve null', () => {
    expect(leerDuracionMs(webm())).toBeNull()
  })

  it('escribe la duración en milisegundos y deja el cluster intacto', () => {
    const fuente = webm()
    const fija = escribirDuracion(fuente, 12345.5)
    expect(leerDuracionMs(fija)).toBe(12345.5)
    expect(final(fija, CLUSTER.length)).toEqual(Array.from(CLUSTER))
    expect(Array.from(fija.slice(0, 4))).toEqual([0x1a, 0x45, 0xdf, 0xa3])
    expect(leerDuracionMs(fuente)).toBeNull()
  })

  it('reemplaza una duración que ya existía', () => {
    const fuente = webm({ duracion: 100 })
    const fija = escribirDuracion(fuente, 2000)
    expect(leerDuracionMs(fija)).toBe(2000)
    expect(fija.length).toBe(fuente.length)
  })

  it('con segmento de tamaño conocido lo corrige', () => {
    const fija = escribirDuracion(webm({ segmentoConocido: true }), 500)
    expect(leerDuracionMs(fija)).toBe(500)
    const pos = fija.indexOf(0x18, 10) + 4
    expect(fija[pos]).toBe(0x01)
    expect(fija[pos + 7]).toBe(fija.length - (pos + 8))
  })

  it('un SeekHead queda como Void del mismo largo', () => {
    const fija = escribirDuracion(webm({ seekHead: true }), 800)
    expect(leerDuracionMs(fija)).toBe(800)
    expect(fija.includes(0x11)).toBe(false)
    expect(final(fija, CLUSTER.length)).toEqual(Array.from(CLUSTER))
  })

  it('rechaza lo que no es WebM y duraciones inválidas', () => {
    expect(() => escribirDuracion(u(1, 2, 3, 4), 10)).toThrow()
    expect(() => escribirDuracion(webm(), -1)).toThrow()
  })
})
