import { isAbsolute, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { leerBanderas } from './banderas'

describe('leerBanderas', () => {
  it('sin banderas: ni sonda, ni herramientas, ni carpeta propia', () => {
    expect(leerBanderas(['electron.exe', '.'])).toEqual({ pruebas: false, devtools: false, datos: null, mcp: false })
  })

  it('lee --pruebas, --devtools y --datos', () => {
    expect(leerBanderas(['electron.exe', '.', '--pruebas', '--datos=C:\\tmp\\k 1', '--devtools'])).toEqual({ pruebas: true, devtools: true, datos: resolve('C:\\tmp\\k 1'), mcp: false })
  })

  it('--datos relativo se vuelve absoluto', () => {
    const d = leerBanderas(['--datos=datos-prueba']).datos
    expect(d && isAbsolute(d)).toBe(true)
    expect(d).toBe(resolve('datos-prueba'))
  })

  it('--datos vacío no cambia la carpeta', () => {
    expect(leerBanderas(['--datos=']).datos).toBeNull()
  })

  describe('ejecutable empaquetado (el que abren las asociaciones)', () => {
    const inyectadas = ['Kirchi.exe', '--datos=C:\\tmp\\x', '--pruebas', '--devtools', '--inspect=9229', 'C:\\a.kir']
    const apagadas = { pruebas: false, devtools: false, datos: null, mcp: false }

    it('ignora --datos, --pruebas y --devtools aunque lleguen por la línea de órdenes', () => {
      expect(leerBanderas(inyectadas, { empaquetado: true, env: {} })).toEqual(apagadas)
    })
    it('KIRCHI_BANDERAS=1 enciende solo --pruebas, y exactamente ese valor', () => {
      expect(leerBanderas(inyectadas, { empaquetado: true, env: { KIRCHI_BANDERAS: '1' } })).toEqual({ pruebas: true, devtools: false, datos: null, mcp: false })
      expect(leerBanderas(['Kirchi.exe', '--devtools', '--datos=/tmp/x'], { empaquetado: true, env: { KIRCHI_BANDERAS: '1' } })).toEqual(apagadas)
      for (const v of ['0', 'true', '', undefined, '11']) expect(leerBanderas(inyectadas, { empaquetado: true, env: { KIRCHI_BANDERAS: v } })).toEqual(apagadas)
    })
    it('--mcp sí vale empaquetado y no arrastra a las demás', () => {
      expect(leerBanderas(['Kirchi.exe', '--mcp', '--datos=C:\\tmp\\x', '--pruebas'], { empaquetado: true, env: {} })).toEqual({ ...apagadas, mcp: true })
    })
    it('sin empaquetar (desarrollo y e2e) siguen funcionando', () => {
      expect(leerBanderas(inyectadas, { empaquetado: false, env: {} }).devtools).toBe(true)
    })
  })
})
