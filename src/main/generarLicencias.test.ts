import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Las reglas de scripts/generar-licencias.mjs: cada paquete lleva su propio texto de licencia, nunca uno prestado de otro paquete.
const raiz = join(__dirname, '..', '..')
type Paquete = { nombre: string; version: string; licencia: string; origen: string; texto: string; principal: boolean; extra: string | null; procedencia: string | null; commit: string | null }
const g = (await import(pathToFileURL(join(raiz, 'scripts/generar-licencias.mjs')).href)) as {
  textosDePaquete(carpeta: string, extra: string): Pick<Paquete, 'texto' | 'principal' | 'extra' | 'procedencia'>
  problemas(paquetes: Paquete[], carpetas: string[]): string[]
  carpetasExtra(): string[]
  LICENCIAS: string
  licenciaPermitida(expresion: string): boolean
  paquetesDelProcesoPrincipal(): Promise<string[]>
}

const MIT = 'MIT License\n\nCopyright (c) 2024 Autora\n\nPermission is hereby granted'
const COMMIT = 'd5f1cd77f0af31fb90aa0d128a76e2366c5dabc7'
let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'kirchi-lic-'))
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

function carpeta(nombre: string, archivos: Record<string, string>): string {
  const c = join(tmp, nombre)
  mkdirSync(c, { recursive: true })
  for (const [n, t] of Object.entries(archivos)) writeFileSync(join(c, n), t)
  return c
}

const paquete = (resto: Partial<Paquete>): Paquete => ({ nombre: 'crate', version: '1.0.0', licencia: 'MIT', origen: 'cargo', texto: MIT, principal: true, extra: null, procedencia: null, commit: COMMIT, ...resto })

describe('textosDePaquete', () => {
  it('usa el archivo del paquete y no mira la carpeta extra', () => {
    const c = carpeta('pkg', { LICENSE: MIT, 'Cargo.toml': '' })
    const extra = carpeta('extra', { LICENSE: 'otro' })
    const t = g.textosDePaquete(c, extra)
    expect(t).toMatchObject({ texto: MIT, principal: true, extra: null })
  })

  it('sin archivo propio toma el de licencias/ con su ORIGEN y conserva los avisos del paquete', () => {
    const c = carpeta('pkg', { 'COPYING.EIGEN.MPL2': 'Mozilla Public License', 'lib.rs': '' })
    const extra = carpeta('extra', { LICENSE: MIT, 'ORIGEN.txt': `https://ejemplo/${COMMIT}/LICENSE\n` })
    const t = g.textosDePaquete(c, extra)
    expect(t.principal).toBe(true)
    expect(t.extra).toBe(extra)
    expect(t.procedencia).toContain(COMMIT)
    expect(t.texto.startsWith(MIT)).toBe(true)
    expect(t.texto).toContain('Mozilla Public License')
    expect(t.texto).not.toContain('ejemplo')
  })

  it('un aviso de código portado (COPYING.*) no cuenta como la licencia del paquete', () => {
    const c = carpeta('pkg', { 'COPYING.LAPACK.BSD': 'BSD' })
    expect(g.textosDePaquete(c, join(tmp, 'no-existe')).principal).toBe(false)
  })
})

describe('problemas', () => {
  it('sin problemas con texto propio', () => {
    expect(g.problemas([paquete({})], [])).toEqual([])
  })

  it('un paquete sin su licencia es un problema que dice dónde agregarla', () => {
    expect(g.problemas([paquete({ principal: false, texto: '' })], []).join()).toMatch(/licencias\/cargo\/crate-1\.0\.0\/LICENSE/)
  })

  it('un texto de licencias/ que no es del commit de esa versión se rechaza como prestado', () => {
    const extra = join(tmp, 'crate-1.0.0')
    const r = g.problemas([paquete({ extra, procedencia: 'https://ejemplo/otro-commit/LICENSE' })], [extra])
    expect(r.join()).toMatch(/prestado/)
  })

  it('falta ORIGEN.txt o el crate no dice su commit', () => {
    const extra = join(tmp, 'crate-1.0.0')
    expect(g.problemas([paquete({ extra })], [extra]).join()).toMatch(/falta ORIGEN/)
    expect(g.problemas([paquete({ extra, procedencia: COMMIT, commit: null })], [extra]).join()).toMatch(/no dice de qué commit/)
  })

  it('una MIT sin aviso de derechos de autor y una carpeta de licencias/ sin uso son problemas', () => {
    expect(g.problemas([paquete({ texto: 'Permission is hereby granted' })], []).join()).toMatch(/derechos de autor/)
    expect(g.problemas([], [join(tmp, 'viejo-0.1.0')]).join()).toMatch(/ningún paquete usa/)
  })
})

describe('licencias/ del repositorio', () => {
  it('cada carpeta de crate trae LICENSE con aviso de derechos y ORIGEN.txt con la dirección de un commit', () => {
    const carpetas = g.carpetasExtra()
    expect(carpetas.length).toBeGreaterThanOrEqual(12)
    for (const c of carpetas) {
      expect(readdirSync(c).sort(), c).toEqual(['LICENSE', 'ORIGEN.txt'])
      expect(readFileSync(join(c, 'LICENSE'), 'utf8'), c).toMatch(/Copyright \(c\) 20\d\d /)
      expect(readFileSync(join(c, 'ORIGEN.txt'), 'utf8'), c).toMatch(/^https:\/\/\S+\/[0-9a-f]{40}\/LICENSE\s*$/)
    }
  })

  it('ngspice trae su COPYING, la GPL 2 de table.cm y los textos del tiempo de ejecución de MinGW (Windows)', () => {
    expect(readFileSync(join(g.LICENCIAS, 'ngspice', 'COPYING'), 'utf8')).toContain('Modified BSD')
    expect(readFileSync(join(g.LICENCIAS, 'ngspice', 'GPL-2.0.txt'), 'utf8').replace(/\r\n/g, '\n')).toContain('GNU GENERAL PUBLIC LICENSE\n                       Version 2, June 1991')
    const win = readdirSync(join(g.LICENCIAS, 'ngspice-windows')).sort()
    expect(win).toEqual(['GPL-3.0.txt', 'gcc-runtime-exception.txt', 'winpthreads.txt'])
  })
})

describe('código fuente que acompaña a los instaladores (scripts/preparar-fuentes.mjs)', () => {
  it('toma la versión y la suma de faer de Cargo.lock y dice qué es cada archivo', async () => {
    const f = (await import(pathToFileURL(join(raiz, 'scripts/preparar-fuentes.mjs')).href)) as {
      crateDelLock(lock: string, nombre: string): { nombre: string; url: string; sha256: string }
      leeme(a: { nombre: string; url: string }[]): string
    }
    const lock = readFileSync(join(raiz, 'engine', 'Cargo.lock'), 'utf8')
    const faer = f.crateDelLock(lock, 'faer')
    expect(faer.nombre).toMatch(/^faer-\d+\.\d+\.\d+\.crate$/)
    expect(faer.url).toBe(`https://static.crates.io/crates/faer/${faer.nombre}`)
    expect(faer.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(() => f.crateDelLock(lock, 'no-existe')).toThrow(/no está/)
    const texto = f.leeme([faer])
    expect(texto).toContain('ngspice-47.tar.gz')
    expect(texto).toContain(faer.nombre)
    expect(texto).toContain('MPL 2.0')
  })
})

describe('licencias de lo que se empaqueta', () => {
  it('solo admite MIT, BSD, ISC, 0BSD, Apache-2.0 y OFL-1.1, con alternativas OR y términos AND', () => {
    for (const l of ['MIT', 'ISC', 'BSD-3-Clause', 'BSD-2-Clause', '0BSD', 'Apache-2.0', 'OFL-1.1', 'MIT OR GPL-3.0', '(MIT OR Apache-2.0) AND ISC']) expect(g.licenciaPermitida(l), l).toBe(true)
    for (const l of ['GPL-3.0', 'LGPL-2.1', 'MPL-2.0', 'desconocida', 'MIT AND GPL-3.0', 'CC-BY-4.0']) expect(g.licenciaPermitida(l), l).toBe(false)
  })

  it('un paquete de npm con licencia fuera de la lista es un problema', () => {
    expect(g.problemas([paquete({ origen: 'npm', licencia: 'GPL-3.0' })], []).join()).toMatch(/fuera de la lista permitida/)
    expect(g.problemas([paquete({ origen: 'npm', licencia: 'MIT' })], [])).toEqual([])
  })

  it('el proceso principal empaqueta el SDK de MCP, zod y ajv, y cada uno aparece con su texto en el JSON generado', async () => {
    const nombres = await g.paquetesDelProcesoPrincipal()
    for (const n of ['@modelcontextprotocol/sdk', 'zod', 'ajv', 'fflate', 'rbush']) expect(nombres, n).toContain(n)
    expect(nombres).not.toContain('electron')
    const json = JSON.parse(readFileSync(join(raiz, 'src', 'renderer', 'src', 'ui', 'licenciasTerceros.json'), 'utf8')) as { textos: string[]; paquetes: { nombre: string; licencia: string; origen: string; texto: number }[] }
    for (const n of nombres) {
      const p = json.paquetes.find((q) => q.origen === 'npm' && q.nombre === n)
      expect(p, n).toBeDefined()
      expect(json.textos[p!.texto].length, n).toBeGreaterThan(100)
    }
    expect(json.paquetes.find((p) => p.nombre === '@modelcontextprotocol/sdk')!.licencia).toBe('MIT')
  })
})
