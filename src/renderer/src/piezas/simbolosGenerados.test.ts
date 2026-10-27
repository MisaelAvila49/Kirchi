// @vitest-environment happy-dom
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error módulo .mjs de scripts, sin tipos
import { carpetasConCaja, generar, generarCarpeta } from '../../../../scripts/generar-simbolo-ci.mjs'
import { cuerpoLocal } from '../editor/colision'
import { leerCarpeta, RAIZ_COMPONENTES } from '../prueba/libreria'
import { cargarLibreria } from './libreria'

const pines = (ids: string[]) => ids.map((id) => ({ id, nombre: id, x: 0, y: 0 }))
const base = (id: string, ids: string[], caja: object, extra: object = {}) =>
  JSON.stringify(
    {
      id,
      nombre: { es: id, en: id },
      categoria: 'digitales',
      prefijo: 'U',
      buscar: ['u', id],
      pines: pines(ids),
      props: [
        { id: 'familia', nombre: 'Familia', defecto: '74HC', opciones: ['74HC', '74LS'] },
        { id: 'alimentacion', nombre: 'Alimentación', defecto: '5 V', opciones: ['5 V', '3.3 V'] }
      ],
      modelo: { tipo: 'compuerta', funcion: 'and', entradas: [ids[0], ids[1]], salida: ids[2], familia: 'familia', alimentacion: 'alimentacion' },
      etiquetas: { ref: { x: 0, y: 0 }, valor: { x: 0, y: 0 } },
      caja,
      ...extra
    },
    null,
    2
  ) + '\n'

// Un contador en caja funcional (reloj dinámico, borrado activo en bajo, salidas de tres estados) y un DIP-8.
const FUNCIONAL = base('fx-funcional', ['CLK', 'CLR', 'EN', 'Q0', 'Q1', 'CO', 'OE', 'GND'], {
  titulo: 'CTR2',
  forma: 'funcional',
  izquierda: ['CLK', '!CLR', null, 'EN'],
  derecha: ['Q0', 'Q1', null, 'CO'],
  arriba: ['OE'],
  abajo: ['GND'],
  marcas: { CLK: ['dinamico'], Q0: ['z'], Q1: ['z'], CO: ['oc'] }
})
const DIP = base(
  'fx-dip',
  ['A', 'B', 'Y', 'ENN'],
  { titulo: '&', forma: 'dip', marcas: { ENN: ['bajo'] } },
  {
    datos: {
      por: 'modelo',
      valores: { x: { presentaciones: [{ encapsulado: 'DIP-8', patillas: { A: '1', B: '2', ENN: '3', Y: '7' } }] } }
    }
  }
)

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
function carpeta(nombre: string, pieza: string): string {
  const raiz = mkdtempSync(join(tmpdir(), 'kirchi-ci-'))
  dirs.push(raiz)
  const dir = join(raiz, 'digitales', nombre)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'pieza.json'), pieza)
  return dir
}
const posiciones = (texto: string) =>
  Object.fromEntries((JSON.parse(texto).pines as { id: string; x: number; y: number }[]).map((p) => [p.id, [p.x, p.y]]))

describe('generador de símbolos de circuito integrado', () => {
  it('dos corridas dan los mismos bytes y --comprobar no ve cambios', () => {
    const dir = carpeta('fx-funcional', FUNCIONAL)
    expect(generarCarpeta(dir, false)).toEqual({ cambia: true, errores: [] })
    const [json, svg] = [readFileSync(join(dir, 'pieza.json'), 'utf8'), readFileSync(join(dir, 'simbolo.svg'), 'utf8')]
    expect(generarCarpeta(dir, false)).toEqual({ cambia: false, errores: [] })
    expect(readFileSync(join(dir, 'pieza.json'), 'utf8')).toBe(json)
    expect(readFileSync(join(dir, 'simbolo.svg'), 'utf8')).toBe(svg)
    expect(generarCarpeta(dir, true).cambia).toBe(false)
  })

  it('--comprobar no escribe y avisa de lo que cambiaría', () => {
    const dir = carpeta('fx-dip', DIP)
    expect(generarCarpeta(dir, true).cambia).toBe(true)
    expect(readFileSync(join(dir, 'pieza.json'), 'utf8')).toBe(DIP)
  })

  it('las dos formas cargan en la Librería y cumplen las reglas de los símbolos', () => {
    const archivos: Record<string, string> = leerCarpeta(RAIZ_COMPONENTES)
    for (const [id, texto] of [['fx-funcional', FUNCIONAL], ['fx-dip', DIP]]) {
      const dir = carpeta(id, texto)
      generarCarpeta(dir, false)
      // La clave «caja» se carga tal cual; el «datos» de prueba no describe una pieza real y se quita.
      const { datos: _d, ...pieza } = JSON.parse(readFileSync(join(dir, 'pieza.json'), 'utf8'))
      void _d
      archivos[`digitales/${id}/pieza.json`] = JSON.stringify(pieza)
      archivos[`digitales/${id}/simbolo.svg`] = readFileSync(join(dir, 'simbolo.svg'), 'utf8')
    }
    const lib = cargarLibreria(archivos)
    expect(lib.errores).toEqual([])
    for (const id of ['fx-funcional', 'fx-dip']) {
      const def = lib.piezas.get(id)!
      expect(def.caja?.forma, id).toBe(id === 'fx-dip' ? 'dip' : 'funcional')
      const c = cuerpoLocal(def)
      for (const p of def.pines) expect(p.x > c.minX && p.x < c.maxX && p.y > c.minY && p.y < c.maxY, `${id}.${p.id}`).toBe(false)
      expect(def.pines.every((p) => p.x % 2 === 0 && p.y % 2 === 0)).toBe(true)
    }
  })

  it('funcional: entradas a la izquierda, salidas a la derecha, alimentación arriba y abajo', () => {
    const r = generar(FUNCIONAL)
    expect(r.errores).toEqual([])
    const pos = posiciones(r.pieza)
    expect(pos.CLK[0]).toBeLessThan(0)
    expect(pos.Q0[0]).toBeGreaterThan(0)
    expect(pos.OE[1]).toBeLessThan(pos.CLK[1])
    expect(pos.GND[1]).toBeGreaterThan(pos.CO[1])
    // Paso de 2 unidades y un hueco en la tercera fila.
    expect(pos.EN[1] - pos.CLK[1]).toBe(6)
    expect(pos.CLR[1] - pos.CLK[1]).toBe(2)
  })

  it('dibuja círculo de negación, indicador dinámico, tres estados y colector abierto', () => {
    const svg = generar(FUNCIONAL).svg as string
    expect(svg.match(/<circle/g)).toHaveLength(1)
    // Dos triángulos de tres estados y un rombo, cerrados con Z.
    expect((/<path d="([^"]*)"/.exec(svg)![1].match(/Z/g) ?? []).length).toBe(3)
  })

  it('dip: patillas 1 a N/2 por la izquierda bajando y el resto por la derecha', () => {
    const pos = posiciones(generar(DIP).pieza)
    expect(pos.A[0]).toBeLessThan(0)
    expect(pos.B[1]).toBeGreaterThan(pos.A[1])
    expect(pos.ENN[1]).toBeGreaterThan(pos.B[1])
    expect(pos.Y[0]).toBeGreaterThan(0)
  })

  it('rechaza un pin repetido, uno ausente, una clave desconocida y un ancho que no cabe', () => {
    const con = (caja: object) => generar(base('x', ['A', 'B', 'Y'], caja)).errores.join('|')
    expect(con({ forma: 'funcional', izquierda: ['A', 'A'], derecha: ['B', 'Y'] })).toContain('aparece 2 veces')
    expect(con({ forma: 'funcional', izquierda: ['A', 'Y'] })).toContain('el pin B no está en ningún lado')
    expect(con({ forma: 'funcional', izquierda: ['A'], derecha: ['B', 'Y'], rara: 1 })).toContain('caja.rara')
    expect(con({ forma: 'funcional', izquierda: ['A'], derecha: ['B', 'Y'], ancho: 6 })).toContain('caja.ancho')
  })

  it('un valor «!ID» del modelo marca el pin activo en bajo', () => {
    const r = generar(base('x', ['A', 'B', 'CLR'], { forma: 'funcional', izquierda: ['A', 'B', 'CLR'] }, { modelo: { tipo: 'x', clr: '!CLR' } }))
    expect((r.svg as string).match(/<circle/g)).toHaveLength(1)
  })

  it('todas las piezas de componentes/ con «caja» tienen su símbolo al día', () => {
    for (const d of carpetasConCaja(RAIZ_COMPONENTES) as string[]) expect(generarCarpeta(d, true), d).toEqual({ cambia: false, errores: [] })
  })
})
