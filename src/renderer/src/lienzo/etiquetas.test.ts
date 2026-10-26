// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { Pieza, Rotacion } from '../doc/tipos'
import { cajaEnMundo, cajaTransformada } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'
import { cajaDePuntos } from './medidas'
import { cajasSeCruzan, cajaTexto } from './apartar'
import { libreriaDePrueba } from '../prueba/libreria'
import { formatearValor, leerValor } from '../valores/valores'
import { etiquetasDePieza, textoDeValor } from './etiquetas'

const lib = libreriaDePrueba().piezas
const pieza = (tipo: string, ref: string, rot: Rotacion, espejo = false, props: Record<string, string> = {}, x = 10, y = 20): Pieza => ({
  id: 'p', tipo, ref, x, y, rot, espejo, props
})
/** Caja de los trazos del símbolo en el mundo, sin la reserva de sus rótulos. */
const cajaDeTrazos = (p: Pieza, def: PiezaDef) => cajaTransformada(cajaDePuntos(def.geometria.trazos.flat()), p)
const etq = (p: Pieza) => etiquetasDePieza(p, lib.get(p.tipo)!).map(({ texto, x, y, alinear }) => ({ texto, x, y, alinear }))

describe('etiquetasDePieza', () => {
  // Resistencia en (10, 20): ref en (0, -3) y valor en (0, 3) de la definición.
  it.each([
    [0, [10, 17, 'centro'], [10, 23, 'centro']],
    [90, [13, 20, 'izq'], [7, 20, 'der']],
    [180, [10, 23, 'centro'], [10, 17, 'centro']],
    [270, [7, 20, 'der'], [13, 20, 'izq']]
  ] as const)('resistencia a %d°', (rot, [rx, ry, ra], [vx, vy, va]) => {
    expect(etq(pieza('resistencia', 'R1', rot))).toEqual([
      { texto: 'R1', x: rx, y: ry, alinear: ra },
      { texto: '1 kΩ', x: vx, y: vy, alinear: va }
    ])
  })

  it('la batería reflejada pone sus textos a la izquierda', () => {
    expect(etq(pieza('bateria', 'B1', 0, true, {}, 0, 0))).toEqual([
      { texto: 'B1', x: -3, y: -1, alinear: 'der' },
      { texto: '9 V', x: -3, y: 1, alinear: 'der' }
    ])
  })

  it('la batería girada 90° separa referencia y valor a cada lado', () => {
    expect(etq(pieza('bateria', 'B1', 90, false, {}, 0, 0))).toEqual([
      { texto: 'B1', x: 1, y: 3, alinear: 'izq' },
      { texto: '9 V', x: -1, y: 3, alinear: 'der' }
    ])
  })

  it('la tierra no muestra texto y las propiedades con opciones no salen', () => {
    expect(etq(pieza('tierra', 'GND1', 0))).toEqual([])
    expect(etq(pieza('interruptor', 'S1', 0)).map((t) => t.texto)).toEqual(['S1'])
    expect(etq(pieza('led', 'D1', 0)).map((t) => t.texto)).toEqual(['D1'])
  })

  it('el valor se formatea con la unidad de la propiedad', () => {
    const valor = (tipo: string, props: Record<string, string> = {}) => etq(pieza(tipo, 'X1', 0, false, props))[1].texto
    expect(valor('resistencia', { valor: '4k7' })).toBe('4.7 kΩ')
    expect(valor('resistencia', { valor: 'abc' })).toBe('abc')
    expect(valor('capacitor')).toBe('100 nF')
    expect(valor('inductor')).toBe('10 mH')
    expect(valor('fuente-dc')).toBe('5 V')
  })

  it('usa cifras, tinta para la referencia y gris para el valor', () => {
    const [ref, valor] = etiquetasDePieza(pieza('resistencia', 'R1', 0), lib.get('resistencia')!)
    expect(ref).toMatchObject({ fuente: 'cifras', color: 'pieza', tamaño: 1.6 })
    expect(valor).toMatchObject({ fuente: 'cifras', color: 'valor' })
  })

  it('ningún texto cae dentro de su símbolo en las 8 orientaciones', () => {
    for (const def of lib.values())
      for (const rot of [0, 90, 180, 270] as const)
        for (const espejo of [false, true]) {
          const p = pieza(def.id, 'X1', rot, espejo)
          const c = cajaEnMundo(p, def, 0.5)
          const tras = def.etiquetas.valor.trasRotulo !== undefined
          for (const t of etiquetasDePieza(p, def)) {
            // Un valor que sigue a un rótulo va en el renglón de ese rótulo, dentro de la caja que lo reserva en cualquier
            // orientación: basta con que no toque el dibujo (sus trazos, girados con la pieza).
            const k = tras && t.color === 'valor' ? cajaDeTrazos(p, def) : c
            const fuera = tras && t.color === 'valor' ? !cajasSeCruzan(cajaTexto(t, 0), k) : t.x < k.minX || t.x > k.maxX || t.y < k.minY || t.y > k.maxY
            expect(fuera, `${def.id} ${rot}° ${espejo} «${t.texto}»`).toBe(true)
          }
        }
  })
})

describe('textos vacíos', () => {
  it('no emite texto para un valor o una referencia vacíos', () => {
    expect(etq(pieza('resistencia', 'R1', 0, false, { valor: '' })).map((t) => t.texto)).toEqual(['R1'])
    expect(etq(pieza('resistencia', '', 0)).map((t) => t.texto)).toEqual(['1 kΩ'])
  })
})

describe('textoDeValor guarda los valores ya formateados', () => {
  it('da lo mismo que leer y formatear cada vez, sin mezclar unidades ni textos', () => {
    const textos = ['1k', '4k7', '4.7k', '10u', '2M2', '4R7', '100 nF', '-5 V', '5', 'abc', '', '0', '1e3', 'NaN']
    const tipos = ['resistencia', 'capacitor', 'inductor', 'fuente-dc', 'fuente-corriente']
    for (let vuelta = 0; vuelta < 3; vuelta++)
      for (const tipo of tipos) {
        const def = lib.get(tipo)!
        const prop = def.props.find((d) => !d.opciones && !d.texto)!
        for (const t of textos) {
          const v = leerValor(t)
          const esperado = v ? formatearValor(v.valor, prop.unidad ?? v.unidad) : t
          expect(textoDeValor(pieza(tipo, 'X1', 0, false, { [prop.id]: t }), def), `${tipo} «${t}»`).toBe(esperado)
        }
      }
  })
})
