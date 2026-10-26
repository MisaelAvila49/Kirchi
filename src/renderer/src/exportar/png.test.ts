import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { AREA_MAXIMA_PNG, conPpp, crc32, LADO_MAXIMO_PNG, pintarEncima, svgEnPixeles, tamañoPng } from './png'

/** Un PNG mínimo de 1×1 (firma, IHDR, IDAT, IEND), con un pHYs opcional. */
function png(conPhys = false): Uint8Array {
  const bloque = (t: string, d: Uint8Array) => {
    const td = new Uint8Array([...Buffer.from(t, 'latin1'), ...d])
    const b = Buffer.alloc(12 + d.length)
    b.writeUInt32BE(d.length, 0)
    b.set(td, 4)
    b.writeUInt32BE(crc32(td), 8 + d.length)
    return b
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const phys = Buffer.alloc(9)
  phys.writeUInt32BE(1, 0)
  phys.writeUInt32BE(1, 4)
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      bloque('IHDR', ihdr),
      ...(conPhys ? [bloque('pHYs', phys)] : []),
      bloque('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 0]))),
      bloque('IEND', new Uint8Array(0))
    ])
  )
}
/** Tipos de los bloques de un PNG, en orden. */
const bloques = (b: Uint8Array) => {
  const out: string[] = []
  for (let i = 8; i < b.length; ) {
    const n = Buffer.from(b.subarray(i, i + 4)).readUInt32BE(0)
    out.push(Buffer.from(b.subarray(i + 4, i + 8)).toString('latin1'))
    i += 12 + n
  }
  return out
}

describe('PNG', () => {
  it('crc32 de referencia', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082)
  })

  it('agrega pHYs después de IHDR con los píxeles por metro y un CRC válido', () => {
    const r = conPpp(png(), 192)
    expect(bloques(r)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND'])
    const b = Buffer.from(r)
    expect(b.readUInt32BE(33)).toBe(9)
    expect(b.readUInt32BE(41)).toBe(7559)
    expect(b.readUInt32BE(45)).toBe(7559)
    expect(b[49]).toBe(1)
    expect(b.readUInt32BE(50)).toBe(crc32(r.subarray(37, 50)))
  })

  it('un pHYs que ya traía se reemplaza; lo que no es PNG queda igual', () => {
    expect(bloques(conPpp(png(true), 96))).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND'])
    const x = new Uint8Array([1, 2, 3])
    expect(conPpp(x, 96)).toBe(x)
  })

  it('tamaño a la escala pedida: 2× de 96 ppp son 7.56 px por mm', () => {
    expect(tamañoPng(100, 50, 2)).toEqual({ ancho: 755, alto: 377, escala: 2, reducida: false })
  })

  it('un dibujo enorme se reduce para no pasar del lado ni del área máximos', () => {
    const largo = tamañoPng(5000, 100, 4)
    expect(largo.reducida).toBe(true)
    expect(largo.ancho).toBeLessThanOrEqual(LADO_MAXIMO_PNG)
    const grande = tamañoPng(1000, 1000, 4)
    expect(grande.ancho * grande.alto).toBeLessThanOrEqual(AREA_MAXIMA_PNG)
    expect(grande.escala).toBeLessThan(4)
  })

  it('el SVG pasa de mm a píxeles para dibujarse a la resolución del PNG', () => {
    expect(svgEnPixeles('<svg xmlns="x" width="12.5mm" height="5mm" viewBox="0 0 10 4">', 300, 120)).toBe('<svg xmlns="x" width="300" height="120" viewBox="0 0 10 4">')
  })
})

describe('PNG: tamaño de un A3', () => {
  it('un A3 (297 × 420 mm) a 4× cabe en los límites sin reducirse', () => {
    const t = tamañoPng(297, 420, 4)
    expect(t.reducida).toBe(false)
    expect(t.escala).toBe(4)
    expect(t.ancho).toBeLessThanOrEqual(LADO_MAXIMO_PNG)
    expect(t.alto).toBeLessThanOrEqual(LADO_MAXIMO_PNG)
    expect(t.ancho * t.alto).toBeLessThanOrEqual(AREA_MAXIMA_PNG)
  })
})

describe('pintarEncima', () => {
  it('dibuja sobre el mismo lienzo con save/restore, sin que un clearRect del dibujo borre lo de abajo', () => {
    const llamadas: string[] = []
    const ctx = {
      save: () => llamadas.push('save'),
      restore: () => llamadas.push('restore'),
      clearRect: () => llamadas.push('clearRect')
    } as unknown as CanvasRenderingContext2D
    pintarEncima(ctx, (c) => {
      c.clearRect(0, 0, 10, 10)
      llamadas.push('texto')
    })
    expect(llamadas).toEqual(['save', 'texto', 'restore'])
    // Pasado el dibujo, el lienzo vuelve a limpiar normalmente.
    ctx.clearRect(0, 0, 1, 1)
    expect(llamadas.at(-1)).toBe('clearRect')
  })

  it('restaura el lienzo aunque el dibujo falle', () => {
    const llamadas: string[] = []
    const ctx = { save: () => llamadas.push('save'), restore: () => llamadas.push('restore'), clearRect: () => {} } as unknown as CanvasRenderingContext2D
    expect(() => pintarEncima(ctx, () => { throw new Error('x') })).toThrow('x')
    expect(llamadas).toEqual(['save', 'restore'])
  })
})
