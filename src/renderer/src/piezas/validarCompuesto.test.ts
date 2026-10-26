import { describe, expect, it } from 'vitest'
import { validarPieza } from './validar'

// Piezas `compuesto`: el modelo arma la pieza con resistencias, capacitores, bobinas, fuentes, diodos, transistores y
// amplificadores de una etapa. Los errores dicen dónde están, y una errata se rechaza en lugar de ignorarse.

const base = () => ({
  id: 'divisor',
  nombre: { es: 'Divisor', en: 'Divider' },
  categoria: 'integrados',
  prefijo: 'U',
  buscar: ['u'],
  pines: [
    { id: 'A', nombre: 'A', x: -4, y: 0 },
    { id: 'M', nombre: 'M', x: 0, y: 4 },
    { id: 'B', nombre: 'B', x: 4, y: 0 }
  ],
  props: [{ id: 'modelo', nombre: 'Modelo', defecto: 'X', opciones: ['X', 'Y'] }, { id: 'rx', nombre: 'Rx', unidad: 'Ω', defecto: '1k' }, { id: 'tipo', nombre: 'Tipo', defecto: 'a', opciones: ['a', 'b'] }],
  modelo: {
    tipo: 'compuesto',
    prop: 'modelo',
    modelos: { X: { r1: 1000 }, Y: { r1: 2200 } },
    medida: { mas: 'A', menos: 'B', i: 0 },
    elementos: [
      { t: 'R', a: 'A', b: 'M', ohms: 'r1' },
      { t: 'R', a: 'M', b: 'B', ohms: 'rx' }
    ]
  }
})
const errores = (o: unknown) => {
  const v = validarPieza(JSON.stringify(o, null, 2), 'x/pieza.json')
  return v.ok ? [] : v.errores
}

describe('validarPieza, modelo compuesto', () => {
  it('acepta una pieza válida y le agrega sus terminales', () => {
    const v = validarPieza(JSON.stringify(base()), 'x/pieza.json')
    expect(v.ok).toBe(true)
    if (v.ok && v.def.modelo?.tipo === 'compuesto') expect(v.def.modelo.terminales).toEqual(['A', 'M', 'B'])
  })

  it('rechaza un nodo que no es un pin ni una red interna', () => {
    const o = base()
    o.modelo.elementos[0] = { t: 'R', a: 'A', b: 'Z', ohms: 'r1' }
    expect(errores(o).join('\n')).toMatch(/elementos\[0\]\.b debe ser un pin de la pieza o una de las redes internas/)
  })

  it('rechaza un valor que no es parámetro del modelo ni propiedad numérica', () => {
    const o = base()
    o.modelo.elementos[1] = { t: 'R', a: 'M', b: 'B', ohms: 'nada' }
    expect(errores(o).join('\n')).toMatch(/«nada» no es un parámetro del modelo ni una propiedad de la pieza/)
    o.modelo.elementos[1] = { t: 'R', a: 'M', b: 'B', ohms: 'tipo' }
    expect(errores(o).join('\n')).toMatch(/«tipo» debe ser una propiedad numérica/)
  })

  it('rechaza un parámetro que falta en alguna opción del modelo', () => {
    const o = base()
    o.modelo.modelos.Y = {} as never
    expect(errores(o).join('\n')).toMatch(/«r1» falta en la opción «Y» del modelo/)
  })

  it('pide la medida y un pin que algún elemento use', () => {
    const o = base()
    delete (o.modelo as { medida?: unknown }).medida
    expect(errores(o).join('\n')).toMatch(/modelo\.medida es obligatoria/)
    const p = base()
    p.modelo.elementos = [{ t: 'R', a: 'A', b: 'B', ohms: 'r1' }]
    expect(errores(p).join('\n')).toMatch(/ningún elemento usa el pin «M»/)
  })

  it('una errata en una clave o en un parámetro de SPICE se rechaza con la sugerencia', () => {
    const o = base()
    ;(o.modelo.elementos[0] as Record<string, unknown>).ohm = 'r1'
    expect(errores(o).join('\n')).toMatch(/clave desconocida en un elemento «R», ¿quisiste decir «ohms»\?/)
    const q = base()
    q.modelo.elementos.push({ t: 'Q', c: 'A', b: 'M', e: 'B', params: { Bf: 100 } } as never)
    expect(errores(q).join('\n')).toMatch(/params\.Bf parámetro desconocido, ¿quisiste decir «bf»\?/)
  })

  it('la resistencia en serie de un capacitor y la ley de un potenciómetro se validan', () => {
    const c = { ...base(), props: [{ id: 'valor', nombre: 'Valor', unidad: 'F', defecto: '1u' }, { id: 'esr', nombre: 'ESR', unidad: 'Ω', defecto: '0' }], modelo: { tipo: 'C', a: 'A', b: 'B', prop: 'valor', rserie: 'esr' } }
    c.pines = [c.pines[0], c.pines[2]]
    expect(errores(c)).toEqual([])
    expect(errores({ ...c, modelo: { ...c.modelo, rserie: 'no' } }).join('\n')).toMatch(/modelo\.rserie no es una propiedad de la pieza/)
    expect(errores({ ...c, modelo: { tipo: 'R', a: 'A', b: 'B', prop: 'valor', rserie: 'esr' } }).join('\n')).toMatch(/clave desconocida en un modelo «R»/)
  })
})
