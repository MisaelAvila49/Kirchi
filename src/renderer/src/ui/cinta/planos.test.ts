import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TONOS } from '../colores'
import { COMANDOS } from './comandos'
import { PESTAÑAS } from './modelo'
import { PLANOS, TONO_ICONO, type Capa, type Papel, type Plano, type TonoIcono } from './planos'
import { TRAZOS, type NombreIcono } from './trazos'

const planos = Object.entries(PLANOS) as [NombreIcono, Plano][]
const tonos = TONO_ICONO as Partial<Record<NombreIcono, TonoIcono>>
const PAPELES: readonly Papel[] = ['h', 'h2', 'tenue', 'borde', 'contra', 'gris']
const primero = (t: TonoIcono | undefined) => (typeof t === 'string' ? t : t?.[0])

describe('iconos planos R1', () => {
  it('son los 59, las 5 figuras, los 21 de la hoja y los menús y los 4 de la 2D y los 6 de la barra del instrumento, cada uno con el nombre de un icono de trazo', () => {
    expect(planos).toHaveLength(108)
    for (const [n] of planos) expect(TRAZOS, n).toHaveProperty([n])
  })

  it('cada capa es un trayecto con relleno, con trazo o con los dos, y nombra un papel, nunca un color', () => {
    const revisar = (n: string, c: Capa) => {
      expect(c.d, n).toMatch(/^M[\d.\s,hvlmzaHVLMZAcCsSqQtT-]+$/)
      expect(c.relleno ?? c.trazo, n).toBeDefined()
      for (const p of [c.relleno, c.trazo]) if (p) expect(PAPELES, n).toContain(p)
      if (c.trazo) expect(c.grosor, n).toBeGreaterThan(0.3)
      if (c.trazo) expect(c.grosor, n).toBeLessThanOrEqual(2.4)
    }
    for (const [n, p] of planos) for (const c of [...p.capas, ...(p.chico ?? [])]) revisar(n, c)
    expect(readFileSync(join(import.meta.dirname, 'planos.ts'), 'utf8')).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
  })

  it('la versión de 14 px solo quita capas: Guardar como, Cortar, Copiar, Borrar, Multímetro y Calculadoras', () => {
    const conChico = planos.filter(([, p]) => p.chico).map(([n]) => n).sort()
    expect(conChico).toEqual(['borrar', 'calculadoras', 'copiar', 'cortar', 'guardarComo', 'multimetro'])
    for (const [n, p] of planos) {
      if (!p.chico) continue
      expect(p.chico.length, n).toBeLessThan(p.capas.length)
      for (const c of p.chico) expect(p.capas.map((x) => x.d), n).toContain(c.d)
    }
  })

  it('cada icono plano tiene el color de su orden, y cada tono es uno de los de colores.ts', () => {
    for (const [n] of planos) expect(tonos[n], n).toBeDefined()
    for (const [n, t] of Object.entries(tonos)) for (const x of typeof t === 'string' ? [t] : t!) expect(TONOS, n).toContain(x)
  })

  it('el color sale de lo que hace la orden', () => {
    const tabla: Record<string, NombreIcono[]> = {
      azul: ['guardar', 'copiar', 'deshacer', 'rehacer', 'encuadrar', 'acercar', 'alejar', 'tamañoReal', 'inspector', 'paneles', 'pantallaCompleta', 'simular', 'pausa'],
      ocre: ['abrir', 'pegar', 'nota'],
      magenta: ['cortar'],
      rojo: ['borrar', 'detener', 'grabar'],
      cian: ['girar', 'girarIzq'],
      violeta: ['espejoX', 'espejoY'],
      naranja: ['alimentacion', 'voltajes'],
      ambar: ['corriente', 'aviso', 'multimetro'],
      gris: ['tierra', 'atajos', 'configuracion'],
      // El oliva de Circuitos integrados, usado para las figuras.
      oliva: ['linea', 'rectangulo', 'elipse', 'flecha', 'figura']
    }
    for (const [tono, iconos] of Object.entries(tabla)) for (const i of iconos) expect(primero(tonos[i]), i).toBe(tono)
  })

  it('Tierra y Alimentación conservan su forma de esquema, con el tallo en el verde azulado del cable', () => {
    expect(tonos.tierra).toEqual(['gris', 'verdeazul'])
    expect(tonos.alimentacion).toEqual(['naranja', 'verdeazul'])
    expect(PLANOS.tierra.capas[0]).toMatchObject({ trazo: 'h2' })
    expect(PLANOS.tierra.capas[1]).toMatchObject({ trazo: 'gris' })
    expect(PLANOS.alimentacion.capas[0]).toMatchObject({ trazo: 'h2' })
  })

  it('todo icono que puede mostrar un botón de la cinta tiene su plano, salvo las flechas de plegar', () => {
    const usados = new Set<NombreIcono>(['pausa', 'luna'])
    for (const c of Object.values(COMANDOS)) usados.add(c.icono)
    for (const p of PESTAÑAS) for (const g of p.grupos) usados.add(g.icono)
    const sin = [...usados].filter((n) => !(n in PLANOS)).sort()
    expect(sin).toEqual(['arriba'])
  })
})

describe('planos.ts se regenera desde el repositorio', () => {
  it('scripts/gen-planos.mjs con scripts/datos/iconos-color.js da el mismo archivo', () => {
    const raiz = join(import.meta.dirname, '../../../../..')
    const generado = execFileSync(process.execPath, [join(raiz, 'scripts/gen-planos.mjs'), '--salida', '-'], { cwd: raiz, encoding: 'utf8' })
    const actual = readFileSync(join(import.meta.dirname, 'planos.ts'), 'utf8')
    expect(generado.replace(/\r\n/g, '\n')).toBe(actual.replace(/\r\n/g, '\n'))
  })
})
