import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TRAZOS, type Trazo } from './trazos'

const todos = Object.entries(TRAZOS) as [string, Trazo][]

describe('iconos de la cinta', () => {
  it('son los 72, las 5 figuras, los 21 de la hoja y los menús los 4 de la 2D, Calculadoras y Grabar, cada uno con un trayecto que empieza con M', () => {
    expect(todos).toHaveLength(121)
    for (const [n, t] of todos) expect(t.d, n).toMatch(/^M[\d.\s,hvlmzaHVLMZAcCsSqQtT-]+$/)
  })

  it('solo Simular, Pausar y Detener van rellenos', () => {
    expect(todos.filter(([, t]) => t.relleno).map(([n]) => n).sort()).toEqual(['detener', 'pausa', 'simular'])
  })

  it('los que ya tenía la aplicación son los mismos trazos de ui/iconos.tsx', () => {
    const iconos = readFileSync(join(import.meta.dirname, '../iconos.tsx'), 'utf8')
    for (const n of ['archivo', 'deshacer', 'rehacer', 'simular', 'pausa', 'detener', 'luna', 'libreria', 'proyecto', 'arriba', 'abajo', 'paneles'])
      expect(iconos, n).toContain(`d="${(TRAZOS as Record<string, Trazo>)[n].d}"`)
  })

  it('trae los que usa la cinta: girar y reflejar, el engrane, el teclado y el buscador', () => {
    for (const n of ['girar', 'girarIzq', 'espejoX', 'espejoY', 'configuracion', 'atajos', 'buscar', 'tamañoReal', 'lienzoLimpio']) expect(TRAZOS, n).toHaveProperty([n])
  })
})

describe('trazos.ts se regenera desde el repositorio', () => {
  it('scripts/gen-trazos.mjs con scripts/datos/iconos-trazo.js da el mismo archivo', () => {
    const raiz = join(import.meta.dirname, '../../../../..')
    const generado = execFileSync(process.execPath, [join(raiz, 'scripts/gen-trazos.mjs'), '--salida', '-'], { cwd: raiz, encoding: 'utf8' })
    const actual = readFileSync(join(import.meta.dirname, 'trazos.ts'), 'utf8')
    expect(generado.replace(/\r\n/g, '\n')).toBe(actual.replace(/\r\n/g, '\n'))
  })
})
