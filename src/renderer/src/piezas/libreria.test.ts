// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { ERRORES_FAMILIAS } from '../netlist/familias'
import { libreriaDePrueba } from '../prueba/libreria'
import { cargarLibreria } from './libreria'

const LINEA = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor"><line x1="-4" y1="0" x2="4" y2="0"/></svg>'
const JSON_OK = JSON.stringify({ id: 'x', nombre: { es: 'X', en: 'X' }, categoria: 'c', prefijo: 'X', buscar: ['x'], pines: [{ id: '1', nombre: '1', x: 0, y: 0 }], props: [] })

describe('librería', () => {
  it('carga sin errores las 58 piezas (las 33 de la v1, el terminal de alimentación, las cinco digitales de la 2B, los cuatro instrumentos de la 2C, el comparador, los tres reguladores, el triac y el transformador)', () => {
    const lib = libreriaDePrueba()
    expect(lib.errores).toEqual([])
    expect(ERRORES_FAMILIAS).toEqual([])
    expect([...lib.piezas.keys()].sort()).toEqual([
      'alimentacion', 'amp-op', 'and', 'bateria', 'biestable-d', 'biestable-jk', 'boton', 'capacitor', 'capacitor-electrolitico', 'comparador',
      'conmutador', 'contador', 'cristal', 'decodificador-7seg', 'diac', 'diodo', 'display-7seg', 'estado-logico', 'foco', 'fuente-ac',
      'fuente-corriente', 'fuente-dc', 'fuente-pulso', 'fuente-trifasica', 'fuente-variable', 'fusible', 'generador', 'inductor', 'interruptor',
      'led', 'mosfet-n', 'mosfet-p', 'motor-dc', 'multimetro', 'nand', 'nor', 'not', 'npn', 'or', 'osciloscopio', 'pnp', 'potenciometro',
      'puente-rectificador', 'regulador-ajustable', 'regulador-negativo', 'regulador-positivo', 'rele', 'reostato', 'resistencia', 'scr',
      'temporizador-555', 'tierra', 'transformador', 'triac', 'uln2003', 'xor', 'zener', 'zumbador'
    ])
  })

  it('al cerrar la 2B toda pieza de la Librería tiene modelo eléctrico', () => {
    expect([...libreriaDePrueba().piezas.values()].filter((d) => !d.modelo).map((d) => d.id)).toEqual([])
  })

  it('la resistencia mide 8 de largo y sus pines caen en la rejilla principal', () => {
    const r = libreriaDePrueba().piezas.get('resistencia')!
    expect(r.geometria.caja).toEqual({ minX: -4, minY: -1, maxX: 4, maxY: 1 })
    for (const lib of libreriaDePrueba().piezas.values()) for (const p of lib.pines) expect(p.x % 2 === 0 && p.y % 2 === 0).toBe(true)
  })

  it('cada pin coincide con el extremo de algún trazo', () => {
    for (const def of libreriaDePrueba().piezas.values())
      for (const pin of def.pines) {
        // El terminal del cursor del potenciómetro sale de su capa «cursor».
        const todos = [...def.geometria.trazos, ...Object.values(def.geometria.capas ?? {}).flatMap((c) => c.trazos)]
        const toca = todos.some((t) =>
          [[t[0], t[1]], [t[t.length - 2], t[t.length - 1]]].some(([x, y]) => Math.abs(x - pin.x) < 1e-9 && Math.abs(y - pin.y) < 1e-9)
        )
        expect(toca, `${def.id} pin ${pin.id}`).toBe(true)
      }
  })

  it('el diodo trae su triángulo relleno', () => {
    expect(libreriaDePrueba().piezas.get('diodo')!.geometria.rellenos.length).toBeGreaterThan(0)
  })

  it('informa carpeta sin símbolo, id distinto y SVG inválido', () => {
    const lib = cargarLibreria({
      'a/x/pieza.json': JSON_OK,
      'a/y/pieza.json': JSON_OK,
      'a/y/simbolo.svg': LINEA,
      'a/z/pieza.json': JSON_OK.replace('"id":"x"', '"id":"z"'),
      'a/z/simbolo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><image/></svg>'
    })
    expect(lib.piezas.size).toBe(0)
    expect(lib.errores).toEqual([
      'a/x: falta simbolo.svg',
      'a/y/pieza.json: id «x» no coincide con la carpeta «y»',
      'a/z/simbolo.svg: elemento SVG no soportado: <image>'
    ])
  })
})
