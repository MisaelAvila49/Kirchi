import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PiezaDef } from '../renderer/src/piezas/tipos'
import { enlaceDeLcsc } from '../compartido/enlaces'
import { abrirEnlace } from './enlaces'

const HOJA = 'https://www.onsemi.com/pdf/datasheet/2n3904-d.pdf'
const def = {
  id: 'npn',
  datos: { valores: { '*': { hoja: HOJA, presentaciones: [{ encapsulado: 'TO-92', patillas: {}, lcsc: { numero: 'C20526', sinVerificar: true } }] } } }
} as unknown as PiezaDef
const lib = new Map([['npn', def]])

const probar = async (url: unknown) => {
  const abiertas: string[] = []
  const notas: string[] = []
  const r = await abrirEnlace(url, lib, async (u) => void abiertas.push(u), (m) => void notas.push(m))
  return { r, abiertas, notas }
}

describe('enlaces externos', () => {
  it('abre la hoja de datos y el producto de LCSC que están en la librería', async () => {
    expect((await probar(HOJA)).abiertas).toEqual([HOJA])
    expect((await probar(enlaceDeLcsc('C20526'))).r).toBe(true)
  })

  it('rechaza lo que no es https, lo ajeno a la librería y lo que no es texto, y lo anota', async () => {
    for (const url of ['http://www.onsemi.com/pdf/datasheet/2n3904-d.pdf', 'file:///C:/Windows/notepad.exe', 'javascript:alert(1)', 'https://ejemplo.com/hoja.pdf', enlaceDeLcsc('C1'), HOJA + '?x=1', 42, null]) {
      const { r, abiertas, notas } = await probar(url)
      expect(r, String(url)).toBe(false)
      expect(abiertas).toEqual([])
      expect(notas).toHaveLength(1)
    }
  })

  it('un fallo al abrir devuelve false y se anota', async () => {
    const notas: string[] = []
    const r = await abrirEnlace(HOJA, lib, async () => Promise.reject(new Error('sin navegador')), (m) => void notas.push(m))
    expect(r).toBe(false)
    expect(notas[0]).toContain('sin navegador')
  })

  it('openExternal aparece solo en main/enlaces.ts', () => {
    const raiz = join(__dirname, '..')
    const hallados: string[] = []
    const recorrer = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const ruta = join(dir, n)
        if (statSync(ruta).isDirectory()) recorrer(ruta)
        else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) && readFileSync(ruta, 'utf8').includes('openExternal')) hallados.push(ruta.slice(raiz.length + 1).replace(/\\/g, '/'))
      }
    }
    recorrer(raiz)
    expect(hallados).toEqual(['main/enlaces.ts'])
  })
})
