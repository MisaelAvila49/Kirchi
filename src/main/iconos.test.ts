import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const raiz = join(__dirname, '..', '..')
const leer = (r: string) => readFileSync(join(raiz, r))
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const formatos = (await import(pathToFileURL(join(raiz, 'scripts/formatos-icono.mjs')).href)) as {
  construirIco: (l: { lado: number; png: Buffer }[]) => Buffer
  construirIcns: (m: Map<number, Buffer>) => Buffer
}

describe('contenedores de icono', () => {
  const falso = (n: number) => Buffer.concat([PNG, Buffer.alloc(n)])

  it('.ico: cabecera, renglones ordenados por lado y desplazamientos que apuntan a cada PNG', () => {
    const ico = formatos.construirIco([{ lado: 256, png: falso(30) }, { lado: 16, png: falso(10) }])
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(2)
    expect(ico[6]).toBe(16)
    expect(ico[6 + 16]).toBe(0) // 256 se escribe como 0
    for (let i = 0; i < 2; i++) {
      const largo = ico.readUInt32LE(6 + 16 * i + 8)
      const desde = ico.readUInt32LE(6 + 16 * i + 12)
      expect(ico.subarray(desde, desde + 8).equals(PNG)).toBe(true)
      expect(largo).toBe(i === 0 ? 18 : 38)
    }
    expect(() => formatos.construirIco([{ lado: 512, png: falso(1) }])).toThrow()
  })

  it('.icns: largo total en big endian y bloques con su tipo', () => {
    const icns = formatos.construirIcns(new Map([[16, falso(4)], [128, falso(8)]]))
    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns')
    expect(icns.readUInt32BE(4)).toBe(icns.length)
    expect(icns.subarray(8, 12).toString('ascii')).toBe('icp4')
    expect(icns.readUInt32BE(12)).toBe(8 + 12)
  })
})

describe('iconos generados (build/)', () => {
  for (const [prefijo, ladosIco] of [['icon', [16, 24, 32, 48, 64, 128, 256]], ['kir', [16, 24, 32, 48, 64, 128, 256]]] as const) {
    it(`${prefijo}.ico lleva ${ladosIco.length} tamaños y todos son PNG`, () => {
      const ico = leer(`build/${prefijo}.ico`)
      expect(ico.readUInt16LE(4)).toBe(ladosIco.length)
      const lados: number[] = []
      for (let i = 0; i < ladosIco.length; i++) {
        const w = ico[6 + 16 * i] || 256
        lados.push(w)
        const desde = ico.readUInt32LE(6 + 16 * i + 12)
        expect(ico.subarray(desde, desde + 8).equals(PNG)).toBe(true)
        expect(ico.readUInt32BE(desde + 16)).toBe(w) // ancho del IHDR
      }
      expect(lados).toEqual(ladosIco)
    })
    it(`${prefijo}.icns declara su largo y trae el bloque de 1024 px`, () => {
      const icns = leer(`build/${prefijo}.icns`)
      expect(icns.readUInt32BE(4)).toBe(icns.length)
      expect(icns.includes('ic10', 0, 'ascii')).toBe(true)
    })
  }
  it('los PNG de Linux y el de 1024 px existen con su tamaño', () => {
    for (const l of [16, 32, 48, 64, 128, 256, 512]) {
      const png = leer(`build/icons/${l}x${l}.png`)
      expect(png.readUInt32BE(16)).toBe(l)
      expect(png.readUInt32BE(20)).toBe(l)
    }
    expect(leer('build/icon.png').readUInt32BE(16)).toBe(1024)
  })
})

describe('colores de los SVG del icono', () => {
  it('solo usan colores de ui/colores.css, del cable de lienzo/paleta.ts (o blanco)', () => {
    const css = (readFileSync(join(raiz, 'src/renderer/src/ui/colores.css'), 'utf8') + readFileSync(join(raiz, 'src/renderer/src/lienzo/paleta.ts'), 'utf8')).toUpperCase()
    for (const svg of ['icono', 'icono-chico', 'icono-kir', 'icono-kir-chico']) {
      const texto = readFileSync(join(raiz, `build/${svg}.svg`), 'utf8')
      const colores = [...texto.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0].toUpperCase())
      expect(colores.length).toBeGreaterThan(0)
      for (const c of colores) if (c !== '#FFFFFF') expect(css, `${svg}: ${c}`).toContain(c)
    }
  })
})
