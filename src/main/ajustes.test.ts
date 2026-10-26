import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ajustesPorOmision } from '../compartido/ajustes'
import { ARCHIVO_AJUSTES, guardarAjustes, leerAjustes, REINTENTOS_RENOMBRAR, TAMAÑO_MAXIMO_AJUSTES, type FsGuardado } from './ajustes'

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kirchi-ajustes-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('settings.json', () => {
  it('sin archivo, los ajustes por omisión (tema claro)', () => {
    expect(leerAjustes(dir)).toEqual(ajustesPorOmision())
    expect(leerAjustes(join(dir, 'no-existe')).tema).toBe('claro')
  })

  it('guardar y volver a leer da lo mismo, sin dejar el temporal', () => {
    const a = { ...ajustesPorOmision(), tema: 'oscuro' as const, inspector: false, recientes: ['led', 'r'] }
    guardarAjustes(join(dir, 'nueva'), a)
    expect(leerAjustes(join(dir, 'nueva'))).toEqual(a)
    expect(existsSync(join(dir, 'nueva', `${ARCHIVO_AJUSTES}.tmp`))).toBe(false)
    expect(readFileSync(join(dir, 'nueva', ARCHIVO_AJUSTES), 'utf8')).toContain('"tema": "oscuro"')
  })

  it('un archivo dañado o enorme se ignora', () => {
    writeFileSync(join(dir, ARCHIVO_AJUSTES), '{"tema": "oscuro"')
    expect(leerAjustes(dir)).toEqual(ajustesPorOmision())
    writeFileSync(join(dir, ARCHIVO_AJUSTES), JSON.stringify({ tema: 'oscuro', relleno: 'x'.repeat(TAMAÑO_MAXIMO_AJUSTES) }))
    expect(leerAjustes(dir)).toEqual(ajustesPorOmision())
  })

  it('las claves inválidas del disco toman su valor por omisión', () => {
    writeFileSync(join(dir, ARCHIVO_AJUSTES), JSON.stringify({ tema: 'oscuro', colorCables: 'morado' }))
    expect(leerAjustes(dir)).toEqual({ ...ajustesPorOmision(), tema: 'oscuro' })
  })
})

describe('guardado con reintentos', () => {
  const fsFalso = (fallos: number, codigo = 'EPERM') => {
    const llamadas = { renombrar: 0, esperas: [] as number[], tmp: '' }
    const fs: FsGuardado = {
      mkdirSync: () => undefined,
      statSync: () => ({ mode: 0o100644 }),
      openSync: (ruta) => {
        llamadas.tmp = ruta
        return 3
      },
      writeSync: (_fd, datos) => datos.length,
      fsyncSync: () => undefined,
      fchmodSync: () => undefined,
      closeSync: () => undefined,
      renameSync: () => {
        if (++llamadas.renombrar <= fallos) throw Object.assign(new Error('bloqueado'), { code: codigo })
      },
      rmSync: () => undefined,
      esperar: (ms) => llamadas.esperas.push(ms)
    }
    return { fs, llamadas }
  }

  it('el temporal lleva un sufijo aleatorio y se reintenta si el renombrado falla dos veces', () => {
    const { fs, llamadas } = fsFalso(2)
    guardarAjustes(dir, ajustesPorOmision(), fs)
    expect(llamadas.renombrar).toBe(3)
    expect(llamadas.esperas).toEqual([50, 50])
    expect(llamadas.tmp).toMatch(/settings\.json\.[0-9a-f]{12}\.tmp$/)
  })

  it('tras agotar los reintentos propaga el error', () => {
    const { fs, llamadas } = fsFalso(99, 'EBUSY')
    expect(() => guardarAjustes(dir, ajustesPorOmision(), fs)).toThrow('bloqueado')
    expect(llamadas.renombrar).toBe(REINTENTOS_RENOMBRAR)
  })

  it('un error que no es de bloqueo no se reintenta', () => {
    const { fs, llamadas } = fsFalso(99, 'ENOSPC')
    expect(() => guardarAjustes(dir, ajustesPorOmision(), fs)).toThrow()
    expect(llamadas.renombrar).toBe(1)
  })
})
