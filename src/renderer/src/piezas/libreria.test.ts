// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { ERRORES_FAMILIAS } from '../netlist/familias'
import { libreriaDePrueba } from '../prueba/libreria'
import { cargarLibreria } from './libreria'

const LINEA = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor"><line x1="-4" y1="0" x2="4" y2="0"/></svg>'
const JSON_OK = JSON.stringify({ id: 'x', nombre: { es: 'X', en: 'X' }, categoria: 'c', prefijo: 'X', buscar: ['x'], pines: [{ id: '1', nombre: '1', x: 0, y: 0 }], props: [] })

describe('librería', () => {
  it('carga sin errores las piezas de la Librería', () => {
    const lib = libreriaDePrueba()
    expect(lib.errores).toEqual([])
    expect(ERRORES_FAMILIAS).toEqual([])
    expect([...lib.piezas.values()].filter((d) => !d.oculta).map((d) => d.id).sort()).toEqual([
      'adc0804', 'alimentacion', 'amp-op', 'and', 'bateria', 'biestable-d', 'biestable-jk', 'boton', 'bufer-244', 'buffer-3-estados', 'capacitor', 'capacitor-electrolitico', 'codificador-148', 'comparador',
      'comparador-magnitud-85', 'conmutador', 'contador', 'contador-161', 'contador-163', 'contador-190', 'contador-193', 'contador-4017', 'cristal', 'dac0808', 'decodificador-138', 'decodificador-139',
      'decodificador-4028', 'decodificador-7447', 'decodificador-7seg', 'diac', 'diodo', 'display-7seg', 'estado-logico', 'foco', 'fuente-ac', 'fuente-cccs', 'fuente-ccvs', 'fuente-corriente', 'fuente-corriente-ac', 'fuente-corriente-pulso',
      'fuente-dc', 'fuente-pulso', 'fuente-pwl', 'fuente-trifasica', 'fuente-variable', 'fuente-vccs', 'fuente-vcvs', 'fusible', 'generador', 'igbt', 'ina128', 'inductor', 'interruptor', 'interruptor-dip-4', 'interruptor-dip-8', 'jfet-n',
      'jfet-p', 'l298', 'ldr', 'led', 'lm35', 'lm386', 'lm4040', 'mosfet-n', 'mosfet-p', 'motor-dc', 'motor-pasos-bipolar', 'motor-pasos-unipolar', 'multimetro', 'multiplexor-151', 'multiplexor-153',
      'multiplexor-157', 'nand', 'nor', 'not', 'not-schmitt', 'npn', 'ntc', 'optoacoplador-4n25', 'optoacoplador-pc817', 'or', 'osciloscopio', 'pnp', 'potenciometro', 'ptc', 'puente-rectificador',
      'punta-logica', 'registro-164', 'registro-165', 'registro-595', 'regulador-ajustable', 'regulador-negativo', 'regulador-positivo', 'rele', 'reostato', 'resistencia', 'scr', 'sumador-283', 'teclado-4x3', 'teclado-4x4', 'temporizador-555', 'tierra', 'tl431', 'tmp36',
      'transceptor-245', 'transformador', 'triac', 'ujt', 'uln2003', 'xnor', 'xor', 'zener', 'zumbador'
    ])
  })

  // La caja gris de una importación no se simula a propósito.
  it('toda pieza de la Librería tiene modelo eléctrico', () => {
    expect([...libreriaDePrueba().piezas.values()].filter((d) => !d.modelo && d.id !== 'sin-equivalencia').map((d) => d.id)).toEqual([])
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

  it('la fila «familia|n» de una compuerta de entradas variables debe cubrir los pines de n entradas', () => {
    const svg = (n: number) => `<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor"><line x1="-4" y1="0" x2="4" y2="${n}"/></svg>`
    const pieza = (patillas: Record<string, string>) => {
      const usadas = [...Object.values(patillas), '7', '14']
      const nc = Object.fromEntries(Array.from({ length: 14 }, (_, k) => String(k + 1)).filter((k) => !usadas.includes(k)).map((k) => [k, 'NC']))
      return       JSON.stringify({
        id: 'and', nombre: { es: 'AND', en: 'AND' }, categoria: 'digitales', prefijo: 'U', buscar: ['and'],
        pines: [{ id: 'A', nombre: 'A', x: -6, y: -2 }, { id: 'B', nombre: 'B', x: -6, y: 2 }, { id: 'Y', nombre: 'Y', x: 6, y: 0 }],
        entradas: { max: 3 },
        props: [
          { id: 'entradas', nombre: 'Entradas', defecto: '2', opciones: ['2', '3'] },
          { id: 'familia', nombre: 'Familia', defecto: '74HC', opciones: ['74HC'] },
          { id: 'alimentacion', nombre: 'Alimentación', defecto: '5 V', opciones: ['5 V'] }
        ],
        modelo: { tipo: 'compuerta', funcion: 'and', entradas: ['A', 'B'], salida: 'Y', familia: 'familia', alimentacion: 'alimentacion' },
        datos: { por: ['familia', 'entradas'], valores: { '74HC|3': { presentaciones: [{ encapsulado: 'DIP-14', patillas, alimentacion: { VCC: '14', GND: '7' }, sinModelo: nc }] } } }
      })
    }
    const archivos = (j: string) => ({ 'a/and/pieza.json': j, 'a/and/simbolo.svg': svg(2), 'a/and/simbolo-3.svg': svg(3) })
    expect(cargarLibreria(archivos(pieza({ A: '1', B: '2', C: '3', Y: '4' }))).errores).toEqual([])
    const sin = cargarLibreria(archivos(pieza({ A: '1', B: '2', Y: '4' }))).errores
    expect(sin).toEqual(['a/and/pieza.json: datos.valores.74HC|3.presentaciones[0].patillas no cubre el pin C'])
  })
})
