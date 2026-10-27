// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lectorDeAjustes, leerUnaVez } from './ajustes'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kirchi-ajustes-asistente-'))
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

const poner = (x: unknown) => writeFileSync(join(dir, 'settings.json'), typeof x === 'string' ? x : JSON.stringify(x))

describe('ajustes del asistente en el puente', () => {
  it('sin settings.json está apagado y no es un fallo transitorio', () => {
    expect(leerUnaVez(dir)).toMatchObject({ ok: false, transitorio: false })
    expect(lectorDeAjustes(dir)()).toEqual({ activo: false, carpeta: null })
  })

  it('un JSON a medias se reintenta y, si sigue así, vale la última lectura buena y no «apagado»', () => {
    const fallas: string[] = []
    const leer = lectorDeAjustes(dir, { esperar: () => {}, alFallar: (m) => void fallas.push(m) })
    poner({ asistente: { activo: true } })
    expect(leer().activo).toBe(true)
    poner('{"asistente": {"act')
    expect(leer().activo).toBe(true)
    expect(fallas).toEqual(['settings.json no es JSON válido'])
    poner({ asistente: { activo: false } })
    expect(leer().activo).toBe(false)
  })

  it('un archivo que reaparece entre reintentos se lee bien', () => {
    let n = 0
    const leer = lectorDeAjustes(dir, { esperar: () => void (n++ === 0 && poner({ asistente: { activo: true } })) })
    poner('{')
    expect(leer().activo).toBe(true)
  })
})
