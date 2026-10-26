import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename as nombreDe, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { agregarReciente, carpetaDeRespaldos, claveRuta, leerKirDelDisco, Permisos, quitarReciente, respaldar, RESPALDOS_POR_ARCHIVO, rutaDeInterfaz, rutaValida, sello, esRutaDeRed } from './archivos'

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kirchi-archivos-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('leerKirDelDisco', () => {
  it('lee un .kir y devuelve sus bytes', () => {
    const ruta = join(dir, 'p.kir')
    writeFileSync(ruta, new Uint8Array([1, 2, 3]))
    expect(leerKirDelDisco(ruta)).toEqual({ ok: true, bytes: new Uint8Array([1, 2, 3]) })
  })

  it('rechaza antes de leer: ruta relativa, otra extensión, carpeta, inexistente o demasiado grande', () => {
    writeFileSync(join(dir, 'grande.kir'), new Uint8Array(2048))
    mkdirSync(join(dir, 'carpeta.kir'))
    writeFileSync(join(dir, 'nota.txt'), 'x')
    expect(leerKirDelDisco('p.kir')).toEqual({ ok: false, error: 'La ruta del archivo no es válida.' })
    expect(leerKirDelDisco(42)).toEqual({ ok: false, error: 'La ruta del archivo no es válida.' })
    expect(leerKirDelDisco(join(dir, 'nota.txt'))).toEqual({ ok: false, error: 'Solo se abren circuitos .kir; nota.txt no lo es.' })
    expect(leerKirDelDisco(join(dir, 'no.kir'))).toEqual({ ok: false, error: 'No se encontró no.kir.' })
    expect(leerKirDelDisco(join(dir, 'carpeta.kir'))).toEqual({ ok: false, error: 'carpeta.kir no es un archivo.' })
    expect(leerKirDelDisco(join(dir, 'grande.kir'), 1024)).toEqual({ ok: false, error: 'grande.kir es demasiado grande para ser un circuito (0.0 MB; el máximo es 0.0 MB).' })
  })

  it('rutaValida no acepta caracteres nulos ni rutas larguísimas', () => {
    expect(rutaValida(join(dir, 'a\0.kir'))).toBe(false)
    expect(rutaValida(join(dir, 'a'.repeat(5000)))).toBe(false)
    expect(rutaValida(join(dir, 'a.kir'))).toBe(true)
  })

  it('en Windows, los nombres de dispositivo (CON, NUL, COM1…) no son rutas válidas ni se abren', () => {
    for (const n of ['NUL.kir', 'con.kir', 'Com1.kir', 'LPT9.kir', 'aux .kir', 'nul.tar.kir', 'CONIN$.kir', 'COM¹.kir'])
      expect([n, rutaValida(`C:\\Users\\ana\\${n}`, 'win32')]).toEqual([n, false])
    expect(rutaValida('C:\\Users\\ana\\consola.kir', 'win32')).toBe(true)
    expect(rutaValida('C:\\Users\\ana\\com10.kir', 'win32')).toBe(true)
    expect(rutaValida('/home/ana/con.kir', 'linux')).toBe(true)
    if (process.platform === 'win32') expect(leerKirDelDisco(join(dir, 'NUL.kir'))).toEqual({ ok: false, error: 'La ruta del archivo no es válida.' })
  })

  it.skipIf(process.platform === 'win32')('una FIFO con extensión .kir no bloquea el proceso principal', () => {
    const fifo = join(dir, 'tubo.kir')
    execFileSync('mkfifo', [fifo])
    expect(leerKirDelDisco(fifo)).toEqual({ ok: false, error: 'tubo.kir no es un archivo.' })
  })

  it('rutaDeInterfaz rechaza rutas de red y de dispositivo (NTLM por SMB o WebDAV)', () => {
    for (const r of ['\\\\atacante@80\\s\\x.kir', '\\\\atacante\\s\\x.kir', '//atacante/s/x.kir', '\\/atacante/s/x.kir', '/\\atacante\\s\\x.kir', '\\\\?\\C:\\x.kir', '\\\\?\\UNC\\atacante\\s\\x.kir', '\\\\.\\C:\\x.kir', '\\??\\UNC\\atacante\\s\\x.kir', '/??/UNC/atacante/s/x.kir']) {
      expect(esRutaDeRed(r)).toBe(true)
      expect(rutaDeInterfaz(r)).toBe(false)
    }
    expect(rutaDeInterfaz(join(dir, 'a.kir'))).toBe(true)
    expect(rutaDeInterfaz('C:\\Users\\ana\\a.kir')).toBe(true)
    expect(rutaDeInterfaz('/home/ana/a.kir')).toBe(true)
    expect(rutaDeInterfaz('relativa.kir')).toBe(false)
  })
})

describe('permisos de escritura', () => {
  it('solo las rutas permitidas; en Windows sin distinguir mayúsculas', () => {
    const p = new Permisos('win32')
    p.permitir('C:\\Users\\Ana\\P.kir')
    expect(p.puede('C:\\Users\\ana\\p.KIR')).toBe(true)
    expect(p.puede('C:\\Users\\ana\\otra.kir')).toBe(false)
    expect(p.puede('p.kir')).toBe(false)
    expect(p.puede(undefined)).toBe(false)
    const l = new Permisos('linux')
    l.permitir('/home/ana/P.kir')
    expect(l.puede('/home/ana/p.kir')).toBe(false)
  })

  it('claveRuta normaliza los segmentos', () => {
    expect(claveRuta('/home/ana/./x/../p.kir', 'linux')).toBe(claveRuta('/home/ana/p.kir', 'linux'))
  })
})

describe('recientes', () => {
  it('la ruta pasa al frente sin repetirse y quedan diez', () => {
    const lista = Array.from({ length: 10 }, (_, i) => `C:\\c\\${i}.kir`)
    expect(agregarReciente(lista, 'C:\\C\\3.KIR', 'win32')).toEqual(['C:\\C\\3.KIR', ...lista.filter((_, i) => i !== 3)])
    expect(agregarReciente(lista, 'C:\\c\\nuevo.kir', 'win32')).toEqual(['C:\\c\\nuevo.kir', ...lista.slice(0, 9)])
    expect(quitarReciente(lista, 'c:\\c\\0.kir', 'win32')).toEqual(lista.slice(1))
  })
})

describe('respaldos', () => {
  it('copia lo que había antes de guardar y deja solo los tres más nuevos de cada archivo', () => {
    const ruta = join(dir, 'trabajo', 'practica-3.kir')
    mkdirSync(join(dir, 'trabajo'))
    const datos = join(dir, 'datos')
    for (let i = 0; i < 5; i++) {
      writeFileSync(ruta, `version ${i}`)
      respaldar(ruta, datos, new Date(2026, 9, 13, 14, 32, i))
    }
    const carpeta = carpetaDeRespaldos(datos, ruta)
    const kir = readdirSync(carpeta).filter((n) => n.endsWith('.kir')).sort()
    expect(kir).toHaveLength(RESPALDOS_POR_ARCHIVO)
    expect(kir[0]).toBe(`practica-3 ${sello(new Date(2026, 9, 13, 14, 32, 2))}.kir`)
    expect(readFileSync(join(carpeta, kir[2]), 'utf8')).toBe('version 4')
    expect(readFileSync(join(carpeta, 'origen.txt'), 'utf8')).toBe(`${ruta}\n`)
    // La carpeta de trabajo del usuario no se llena.
    expect(readdirSync(join(dir, 'trabajo'))).toEqual(['practica-3.kir'])
  })

  it('sin archivo previo no hace nada', () => {
    expect(respaldar(join(dir, 'nuevo.kir'), join(dir, 'datos'))).toEqual({ destino: null, aviso: null })
    expect(existsSync(join(dir, 'datos'))).toBe(false)
  })

  it('un nombre larguísimo no rompe el guardado: el del respaldo se recorta y origen.txt conserva la ruta', () => {
    // 230 + 28 del sello pasaba de los 255 de NTFS (ENAMETOOLONG); con acentos, de los 255 bytes de ext4.
    for (const nombre of [`${'a'.repeat(230)}.kir`, `${'á'.repeat(150)}.kir`]) {
      const ruta = join(dir, nombre)
      writeFileSync(ruta, 'v0')
      const datos = join(dir, 'datos')
      const r = respaldar(ruta, datos, new Date(2026, 9, 13, 14, 32, 0))
      expect(r.destino).not.toBeNull()
      const n = nombreDe(r.destino!)
      expect(Buffer.byteLength(n)).toBeLessThanOrEqual(160)
      expect(n.startsWith(nombre.slice(0, 10))).toBe(true)
      expect(readFileSync(join(carpetaDeRespaldos(datos, ruta), 'origen.txt'), 'utf8')).toBe(`${ruta}\n`)
    }
  })

  it('los tres que quedan son los más nuevos por fecha, aunque el nombre cambie de mayúsculas', () => {
    const datos = join(dir, 'datos')
    const minus = join(dir, 'practica.kir'), mayus = join(dir, 'Practica.kir')
    const fechas = [0, 1, 2, 3, 4].map((i) => new Date(2026, 9, 13, 14, 32, i))
    for (const [i, f] of fechas.entries()) {
      // Las viejas con minúscula, las nuevas con mayúscula: por nombre, «P…» iría antes que «p…».
      const ruta = i < 3 ? minus : mayus
      writeFileSync(ruta, `version ${i}`)
      respaldar(ruta, datos, f, 'win32')
    }
    const quedan = readdirSync(carpetaDeRespaldos(datos, minus, 'win32')).filter((x) => x.endsWith('.kir'))
    expect(quedan.map((x) => x.slice(-27, -4)).sort()).toEqual(fechas.slice(2).map(sello))
  })

  it('un archivo más grande que un circuito no se respalda: se dice y el guardado sigue', () => {
    const ruta = join(dir, 'enorme.kir')
    writeFileSync(ruta, new Uint8Array(10))
    const r = respaldar(ruta, join(dir, 'datos'), new Date(), process.platform, 4)
    expect(r.destino).toBeNull()
    expect(r.aviso).toMatch(/enorme\.kir/)
    expect(existsSync(join(dir, 'datos'))).toBe(false)
  })

  it('cada archivo tiene su carpeta', () => {
    expect(carpetaDeRespaldos(dir, 'C:\\a\\p.kir', 'win32')).toBe(carpetaDeRespaldos(dir, 'c:\\A\\P.kir', 'win32'))
    expect(carpetaDeRespaldos(dir, 'C:\\a\\p.kir', 'win32')).not.toBe(carpetaDeRespaldos(dir, 'C:\\b\\p.kir', 'win32'))
  })

  it('sello se ordena por fecha', () => {
    expect(sello(new Date(2026, 0, 2, 3, 4, 5, 6))).toBe('2026-01-02_03-04-05-006')
  })
})
