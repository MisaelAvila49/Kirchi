import { zipSync, strToU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { decodificarTexto, detectarFormato } from './detectar'

const b = (s: string): Uint8Array => new TextEncoder().encode(s)
function utf16le(s: string, bom: boolean): Uint8Array {
  const o = new Uint8Array((s.length + (bom ? 1 : 0)) * 2)
  let p = 0
  if (bom) {
    o[0] = 0xff
    o[1] = 0xfe
    p = 2
  }
  for (const c of s) {
    o[p] = c.charCodeAt(0) & 255
    o[p + 1] = c.charCodeAt(0) >> 8
    p += 2
  }
  return o
}

describe('detectarFormato', () => {
  it('reconoce Falstad por su primera línea', () => {
    expect(detectarFormato('x.txt', b('$ 1 0.000005 10.2 50 5 50 5e-11\nr 176 80 176 144 0 1000\n'))).toEqual({ formato: 'falstad' })
  })
  it('reconoce LTspice en ASCII', () => {
    expect(detectarFormato('x.asc', b('Version 4\nSHEET 1 880 680\nWIRE 0 0 16 0\n'))).toEqual({ formato: 'ltspice' })
  })
  it('reconoce LTspice en UTF-16 con y sin BOM', () => {
    const s = 'Version 4\r\nSHEET 1 880 680\r\n'
    expect(detectarFormato('x.asc', utf16le(s, true))).toEqual({ formato: 'ltspice' })
    expect(detectarFormato('x.asc', utf16le(s, false))).toEqual({ formato: 'ltspice' })
  })
  it('reconoce un esquema de KiCad', () => {
    expect(detectarFormato('x.kicad_sch', b('(kicad_sch\n  (version 20231120)\n'))).toEqual({ formato: 'kicad' })
  })
  it('pide el esquema cuando recibe una netlist de KiCad', () => {
    const r = detectarFormato('x.net', b('(export (version "E")\n  (components\n'))
    expect(r).toHaveProperty('motivo')
    expect((r as { motivo: string }).motivo).toContain('.kicad_sch')
  })
  it('reconoce Proteus por el ROOT.DSN dentro del zip', () => {
    const z = zipSync({ 'ROOT.DSN': strToU8('datos'), 'otro.bin': strToU8('x') })
    expect(detectarFormato('x.pdsprj', z)).toEqual({ formato: 'proteus' })
  })
  it('un .kir (zip con manifest.json) no es de otro programa', () => {
    expect(detectarFormato('x.kir', zipSync({ 'manifest.json': strToU8('{}'), 'documento.json': strToU8('{}') }))).toBeNull()
  })
  it('un zip sin ROOT.DSN no es de otro programa', () => {
    expect(detectarFormato('x.zip', zipSync({ 'a.txt': strToU8('hola') }))).toBeNull()
  })
  it('reconoce un netlist SPICE por sus elementos', () => {
    expect(detectarFormato('x.cir', b('Divisor\nV1 in 0 DC 5\nR1 in out 1k\nR2 out 0 1k\n.end\n'))).toEqual({ formato: 'spice' })
  })
  it('reconoce un netlist SPICE por una directiva', () => {
    expect(detectarFormato('x.sp', b('* titulo\n.tran 1u 1m\n.end\n'))).toEqual({ formato: 'spice' })
  })
  it('un texto cualquiera y un archivo vacío dan null', () => {
    expect(detectarFormato('x.txt', b('Hola mundo\nesto es una carta\n'))).toBeNull()
    expect(detectarFormato('x.txt', new Uint8Array())).toBeNull()
  })
})

describe('decodificarTexto', () => {
  it('decodifica UTF-8 con BOM, UTF-16 LE con BOM y UTF-16 sin BOM', () => {
    expect(decodificarTexto(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe('A')
    expect(decodificarTexto(utf16le('Aé', true))).toBe('Aé')
    expect(decodificarTexto(utf16le('ABC', false))).toBe('ABC')
  })
  it('decodifica UTF-16 BE por BOM', () => {
    expect(decodificarTexto(new Uint8Array([0xfe, 0xff, 0, 0x41, 0, 0x42]))).toBe('AB')
  })
})
