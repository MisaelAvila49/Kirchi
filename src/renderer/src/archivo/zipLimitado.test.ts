import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { leerKirCon, leerKir } from './kir'
import { leerPlantilla, LIMITE_PLANTILLA } from '../plantillas/plantilla'
import { descomprimirLimitado } from './zipLimitado'

/** Falsea el tamaño declarado (cabeceras local y central) de la primera entrada: la bomba que miente. */
function mentir(zip: Uint8Array, declarado: number): Uint8Array {
  const z = zip.slice()
  const v = new DataView(z.buffer)
  for (let i = 0; i + 4 < z.length; i++) {
    if (v.getUint32(i, true) === 0x04034b50) v.setUint32(i + 22, declarado, true)
    if (v.getUint32(i, true) === 0x02014b50) v.setUint32(i + 24, declarado, true)
  }
  return z
}

describe('descomprimirLimitado', () => {
  it('devuelve las entradas pedidas y omite las demás', () => {
    const z = zipSync({ 'a.txt': strToU8('hola'), 'b.txt': strToU8('x') })
    const r = descomprimirLimitado(z, (n) => (n === 'a.txt' ? 100 : null))
    expect(r.ok && Object.keys(r.archivos)).toEqual(['a.txt'])
  })
  it('aborta por los bytes reales aunque la cabecera diga que es pequeño', () => {
    const bomba = mentir(zipSync({ 'circuito.json': new Uint8Array(40 * 2 ** 20) }), 10)
    expect(bomba.length).toBeLessThan(100_000)
    expect(descomprimirLimitado(bomba, () => 1000)).toEqual({ ok: false, motivo: 'grande' })
  })
  it('un .kir con cabecera mentirosa no se abre; una plantilla tampoco pasa de 2 MB', () => {
    const bomba = mentir(zipSync({ 'manifest.json': strToU8('{}'), 'circuito.json': new Uint8Array(3 * 2 ** 20) }), 5)
    expect(leerKirCon(bomba, {}, 5, 2 ** 20)).toMatchObject({ ok: false })
    const l = leerPlantilla(bomba, 'x')
    expect(l.ok).toBe(false)
    expect(LIMITE_PLANTILLA).toBe(2 * 2 ** 20)
    expect(leerKir(strToU8('no es zip'))).toMatchObject({ ok: false })
  })
})
