import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Revisa lo que dejó `npm run build`; sin él no hay nada que mirar.
const salida = join(import.meta.dirname, '..', '..', '..', 'out', 'main')
const hayBuild = existsSync(join(salida, 'index.js'))

describe.skipIf(!hayBuild)('proceso principal empaquetado', () => {
  it('lleva el motor al lado y ningún require de node_modules', () => {
    expect(existsSync(join(salida, 'kirchi_engine_bg.wasm'))).toBe(true)
    const permitidos = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`), 'electron'])
    const externos = new Set<string>()
    for (const f of readdirSync(salida).filter((n) => n.endsWith('.js'))) {
      const codigo = readFileSync(join(salida, f), 'utf8')
      // Los `require` dentro de comillas o plantillas son texto que el generador de validadores de ajv escribe, no cargas reales.
      for (const m of codigo.matchAll(/(?<![\w'"`.])require\("([^"]+)"\)/g)) if (!m[1].startsWith('.') && !permitidos.has(m[1])) externos.add(m[1])
    }
    expect([...externos]).toEqual([])
  })
})
