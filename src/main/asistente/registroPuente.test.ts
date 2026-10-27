// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { crearRegistroPuente } from './registroPuente'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kirchi-registro-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('registro del puente', () => {
  it('anota en una línea por evento, con la pila de un error, y se rota al pasar el tope', () => {
    const r = crearRegistroPuente(dir, { tope: 300 })
    r.anotar('arranque')
    r.error('colocar', new Error('falló\ncon dos líneas'))
    const texto = readFileSync(r.ruta, 'utf8')
    expect(texto.trim().split('\n')).toHaveLength(2)
    expect(texto).toMatch(/ info arranque\n/)
    expect(texto).toMatch(/ error colocar: falló \| con dos líneas \| at /)
    for (let i = 0; i < 10; i++) r.anotar(`renglón ${i}`)
    expect(existsSync(`${r.ruta}.1`)).toBe(true)
    expect(readFileSync(r.ruta, 'utf8').length).toBeLessThan(600)
  })

  it('una carpeta que no se puede escribir no lanza', () => {
    const r = crearRegistroPuente(join(dir, 'archivo-no-carpeta', '\0'))
    expect(() => r.anotar('x')).not.toThrow()
  })
})
