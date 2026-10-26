import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { escribirAtomico, REINTENTOS_RENOMBRAR, type FsEscritura } from './escritura'

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kirchi-escritura-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** Sistema de archivos falso que anota cada llamada; `falla` hace lanzar a la operación nombrada. */
function fsFalso(o: { falla?: 'open' | 'write' | 'fsync' | 'close' | 'rename'; codigo?: string; modo?: number } = {}) {
  const llamadas: string[] = []
  const abiertos: { ruta: string; flags: string; modo?: number }[] = []
  const lanzar = (op: string) => {
    if (o.falla === op) throw Object.assign(new Error(`falla ${op}`), { code: o.codigo ?? 'EIO' })
  }
  let fd = 10
  const fs: FsEscritura = {
    mkdirSync: (d) => void llamadas.push(`mkdir ${d}`),
    statSync: (r) => {
      if (o.modo === undefined) throw Object.assign(new Error('no existe'), { code: 'ENOENT' })
      llamadas.push(`stat ${r}`)
      return { mode: o.modo }
    },
    openSync: (r, flags, modo) => {
      lanzar('open')
      abiertos.push({ ruta: r, flags, modo })
      llamadas.push(`open ${flags}`)
      return ++fd
    },
    writeSync: (_fd, datos) => {
      lanzar('write')
      llamadas.push('write')
      return datos.length
    },
    fsyncSync: () => {
      lanzar('fsync')
      llamadas.push('fsync')
    },
    fchmodSync: (_fd, modo) => void llamadas.push(`fchmod ${modo.toString(8)}`),
    closeSync: () => {
      llamadas.push('close')
      lanzar('close')
    },
    renameSync: () => {
      llamadas.push('rename')
      lanzar('rename')
    },
    rmSync: (r) => void llamadas.push(`rm ${r}`),
    esperar: () => undefined
  }
  return { fs, llamadas, abiertos }
}

describe('escribirAtomico', () => {
  it('escribe texto y bytes en carpetas nuevas de la aplicación sin dejar el temporal', () => {
    escribirAtomico(join(dir, 'a', 'b', 'x.kir'), new Uint8Array([7, 8]), { crearCarpeta: true })
    escribirAtomico(join(dir, 'y.txt'), 'hola')
    expect([...readFileSync(join(dir, 'a', 'b', 'x.kir'))]).toEqual([7, 8])
    expect(readFileSync(join(dir, 'y.txt'), 'utf8')).toBe('hola')
    expect(readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })

  it('una carpeta del usuario que ya no existe no se vuelve a crear', () => {
    const ruta = join(dir, 'borrada', 'p.kir')
    expect(() => escribirAtomico(ruta, 'x')).toThrow(expect.objectContaining({ code: 'ENOENT' }))
    expect(existsSync(dirname(ruta))).toBe(false)
  })

  it('el temporal lleva un sufijo aleatorio, se abre sin pisar nada (wx) y se sincroniza antes de renombrar', () => {
    const { fs, llamadas, abiertos } = fsFalso()
    escribirAtomico(join(dir, 'z.kir'), 'x', { fs, plataforma: 'win32' })
    escribirAtomico(join(dir, 'z.kir'), 'x', { fs, plataforma: 'win32' })
    expect(abiertos.map((a) => a.flags)).toEqual(['wx', 'wx'])
    expect(abiertos[0].ruta).toMatch(/z\.kir\.[0-9a-f]{12}\.tmp$/)
    expect(abiertos[0].ruta).not.toBe(abiertos[1].ruta)
    expect(llamadas.slice(0, 5)).toEqual(['open wx', 'write', 'fsync', 'close', 'rename'])
    expect(llamadas.some((l) => l.startsWith('mkdir'))).toBe(false)
  })

  for (const falla of ['write', 'fsync', 'close', 'rename'] as const)
    it(`si falla ${falla}, el temporal se borra y el error sale`, () => {
      const { fs, llamadas, abiertos } = fsFalso({ falla })
      expect(() => escribirAtomico(join(dir, 'z.kir'), 'x', { fs, plataforma: 'win32' })).toThrow(`falla ${falla}`)
      expect(llamadas).toContain(`rm ${abiertos[0].ruta}`)
      expect(llamadas.filter((l) => l === 'close').length).toBeGreaterThanOrEqual(1)
    })

  it('al rendirse con el renombrado bloqueado borra el temporal y propaga el error', () => {
    const { fs, llamadas, abiertos } = fsFalso({ falla: 'rename', codigo: 'EBUSY' })
    expect(() => escribirAtomico(join(dir, 'z.kir'), 'x', { fs, plataforma: 'win32' })).toThrow('falla rename')
    expect(llamadas.filter((l) => l === 'rename')).toHaveLength(REINTENTOS_RENOMBRAR)
    expect(llamadas.at(-1)).toBe(`rm ${abiertos[0].ruta}`)
    expect(REINTENTOS_RENOMBRAR).toBe(5)
  })

  it('en POSIX conserva el modo del archivo que reemplaza y sincroniza la carpeta', () => {
    const { fs, llamadas, abiertos } = fsFalso({ modo: 0o100640 })
    escribirAtomico('/home/ana/p.kir', 'x', { fs, plataforma: 'linux' })
    expect(abiertos[0].modo).toBe(0o640)
    expect(llamadas).toContain('fchmod 640')
    // Después de renombrar: la carpeta se abre de lectura y se sincroniza.
    const i = llamadas.indexOf('rename')
    expect(llamadas.slice(i + 1)).toEqual(['open r', 'fsync', 'close'])
    expect(abiertos[1].ruta).toBe('/home/ana')
  })
})
