// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMANDOS, type IdComando } from '../cinta/comandos'
import { ACCESO_RAPIDO, FIJOS, PESTAÑAS, pestañaDe } from '../cinta/modelo'

/**
 * Los pasos señalan botones por `data-comando` y por la pestaña que los trae. Este examen lee el código de los capítulos y comprueba que cada botón existe en su pestaña.
 */
const carpeta = join(import.meta.dirname)
const capitulos = readdirSync(carpeta).filter((f) => /^capitulo\d\.ts$/.test(f))
const TITULO = new Set<string>([...ACCESO_RAPIDO, ...FIJOS])

interface Mencion { archivo: string; id: string; pestana?: string; grupo?: string }

function menciones(): Mencion[] {
  const out: Mencion[] = []
  for (const f of capitulos) {
    const src = readFileSync(join(carpeta, f), 'utf8')
    // Constantes de selector (SIMULAR = '[data-comando="simular"]') y llamadas directas control('[data-comando="x"]', 'pestaña').
    for (const m of src.matchAll(/\[data-comando="([a-z-]+)"\]'(?:\s*,\s*'([a-z]+)')?/g)) out.push({ archivo: f, id: m[1], pestana: m[2] })
    for (const m of src.matchAll(/control\(\s*([A-Z_]+)\s*,\s*'([a-z]+)'/g)) {
      const k = src.match(new RegExp(`const ${m[1]} = '\\[data-comando="([a-z-]+)"\\]'`))
      if (k) out.push({ archivo: f, id: k[1], pestana: m[2] })
    }
    for (const m of src.matchAll(/\[data-grupo="([a-z-]+)"\]/g)) out.push({ archivo: f, id: '', grupo: m[1] })
  }
  return out
}

describe('objetivos de los pasos del tutorial en la cinta', () => {
  const todas = menciones()

  it('hay menciones que revisar', () => {
    expect(todas.length).toBeGreaterThan(5)
    expect(todas.some((x) => x.id === 'simular')).toBe(true)
  })

  it('cada botón señalado es un comando de la tabla', () => {
    for (const m of todas) if (m.id) expect(COMANDOS[m.id as IdComando], `${m.archivo}: ${m.id}`).toBeDefined()
  })

  it('un botón que no está en la fila de título se señala con su pestaña, y es la que lo trae', () => {
    for (const m of todas) {
      if (!m.id || TITULO.has(m.id) || m.id.startsWith('panel-') && !pestañaDe(m.id as IdComando)) continue
      const real = pestañaDe(m.id as IdComando)
      // Con la pestaña declarada debe coincidir; un control que solo vive en la selección o en paneles no entra aquí.
      if (m.pestana) expect(real, `${m.archivo}: ${m.id}`).toBe(m.pestana)
    }
  })

  it('Simular y Detener están en la fila de título y en Inicio; el tutorial abre Inicio y deja el botón de su grupo como respaldo', () => {
    expect(TITULO.has('simular')).toBe(true)
    expect(TITULO.has('detener')).toBe(true)
    expect(pestañaDe('simular')).toBe('inicio')
    for (const f of ['capitulo1.ts', 'capitulo2.ts', 'capitulo3.ts']) {
      const src = readFileSync(join(carpeta, f), 'utf8')
      expect(src, f).toContain("'inicio', GRUPO_SIMULAR")
      expect(src, f).not.toMatch(/control\(\s*(?:SIMULAR|DETENER)\s*\)/)
      expect(src, f).not.toMatch(/control\('\[data-comando="(?:simular|detener)"\]'\)/)
    }
  })

  it('los grupos señalados existen', () => {
    const ids = new Set(PESTAÑAS.flatMap((p) => p.grupos.map((g) => g.id)))
    for (const m of todas) if (m.grupo) expect(ids.has(m.grupo), `${m.archivo}: ${m.grupo}`).toBe(true)
  })
})
