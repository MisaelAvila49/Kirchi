import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { VERSION } from '../version'
import { licenciaPermitida, type LicenciasTerceros } from './licencias'

const raiz = join(__dirname, '..', '..', '..', '..')
const paquete = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')) as { version: string; dependencies: Record<string, string> }
const datos = JSON.parse(readFileSync(join(__dirname, 'licenciasTerceros.json'), 'utf8')) as LicenciasTerceros

describe('licencias de terceros', () => {
  it('Acerca de muestra la versión de package.json', () => {
    expect(VERSION).toBe(paquete.version)
    expect(datos.kirchi).toBe(paquete.version)
  })

  it('cada dependencia de package.json y cada paquete de Cargo.lock del wasm está en la lista', () => {
    const npm = datos.paquetes.filter((p) => p.origen === 'npm').map((p) => p.nombre)
    for (const d of Object.keys(paquete.dependencies)) expect(npm, d).toContain(d)
    const lock = readFileSync(join(raiz, 'engine', 'Cargo.lock'), 'utf8')
    const cargo = new Set(datos.paquetes.filter((p) => p.origen === 'cargo').map((p) => p.nombre))
    for (const n of ['serde', 'serde_json', 'thiserror', 'wasm-bindgen', 'faer']) {
      expect(lock, n).toContain(`name = "${n}"`)
      expect(cargo.has(n), n).toBe(true)
    }
    expect(cargo.has('kirchi-engine')).toBe(false)
  })

  it('todas tienen licencia conocida y compatible con MIT, y cada apuntador de texto existe', () => {
    for (const p of datos.paquetes) {
      expect(p.licencia, p.nombre).not.toBe('desconocida')
      expect(licenciaPermitida(p.licencia), `${p.nombre}: ${p.licencia}`).toBe(true)
      expect(datos.textos[p.texto], p.nombre).toBeTypeOf('string')
    }
  })

  it('licenciaPermitida: copyleft solo si no hay alternativa permisiva', () => {
    expect(licenciaPermitida('MIT OR Apache-2.0')).toBe(true)
    expect(licenciaPermitida('MIT/Apache-2.0')).toBe(true)
    expect(licenciaPermitida('GPL-3.0-only')).toBe(false)
    expect(licenciaPermitida('LGPL-2.1 OR GPL-3.0')).toBe(false)
    expect(licenciaPermitida('GPL-2.0 OR MIT')).toBe(true)
  })

  it('la licencia de Kirchi es la MIT con el nombre del autor y el año', () => {
    expect(datos.licenciaKirchi).toMatch(/^MIT License\n\nCopyright \(c\) 2026 Misael Saúl Avila López\n/)
  })

  it('lo que viaja aparte trae Electron, Chromium, ngspice con la GPL de table.cm y la suma del código fuente', () => {
    const nombres = datos.aparte.map((p) => p.nombre)
    for (const n of ['Electron', 'ngspice']) expect(nombres, n).toContain(n)
    expect(nombres.some((n) => n.startsWith('Chromium'))).toBe(true)
    const texto = (n: string) => datos.textos[datos.aparte.find((p) => p.nombre.startsWith(n))!.texto]
    expect(texto('ngspice')).toContain('Modified BSD')
    expect(texto('ngspice, modelo')).toContain('GNU GENERAL PUBLIC LICENSE')
    expect(texto('Electron')).toMatch(/Copyright \(c\) Electron contributors/)
    expect(datos.ngspice.fuente.sha256).toMatch(/^[0-9a-f]{64}$/)
    for (const p of datos.aparte) expect(datos.textos[p.texto], p.nombre).toBeTruthy()
  })

  it('los crates sin archivo de licencia llevan el de su propio repositorio, con su aviso de derechos', () => {
    const texto = (n: string) => datos.textos[datos.paquetes.find((p) => p.nombre === n)!.texto]
    expect(texto('nano-gemm')).toContain('Copyright (c) 2024 sarah el kazdadi')
    expect(texto('faer-traits')).toContain('Copyright (c) 2026 sarah quiñones el kazdadi')
    // faer publica los avisos del código portado (Eigen, LAPACK, SuiteSparse) pero no su MIT: van los dos.
    expect(texto('faer')).toMatch(/^MIT License/)
    expect(texto('faer')).toContain('Mozilla Public License Version 2.0')
  })

  it('el archivo está al día con node_modules, Cargo.lock y licencias/, sin problemas (node scripts/generar-licencias.mjs)', async () => {
    const { generar } = (await import(pathToFileURL(join(raiz, 'scripts', 'generar-licencias.mjs')).href)) as { generar(): { datos: LicenciasTerceros; errores: string[] } }
    const r = generar()
    expect(r.errores).toEqual([])
    expect(r.datos).toEqual(datos)
  }, 60_000)
})
