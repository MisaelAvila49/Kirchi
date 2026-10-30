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

describe('validarPieza, condición inicial y corriente variable', () => {
  const dos = () => [{ id: 'A', nombre: 'A', x: -4, y: 0 }, { id: 'B', nombre: 'B', x: 4, y: 0 }]
  const pieza = (props: unknown[], modelo: unknown) => ({ id: 'c', nombre: { es: 'C', en: 'C' }, categoria: 'pasivos', prefijo: 'C', buscar: ['c'], pines: dos(), props, modelo })
  const errs = (o: unknown) => { const r = validarPieza(JSON.stringify(o), 'c.json'); return r.ok ? [] : r.errores }
  const valor = { id: 'valor', nombre: 'Valor', unidad: 'F', defecto: '1u' }
  const vi = { id: 'vi', nombre: 'Voltaje inicial', unidad: 'V', defecto: '', opcional: true }

  it('una propiedad opcional parte vacía y sirve de condición inicial', () => {
    expect(errs(pieza([valor, vi], { tipo: 'C', a: 'A', b: 'B', prop: 'valor', ic: 'vi' }))).toEqual([])
  })
  it('una propiedad numérica sin opcional no puede partir vacía ni ser la condición inicial', () => {
    expect(errs(pieza([valor, { ...vi, opcional: undefined }], { tipo: 'C', a: 'A', b: 'B', prop: 'valor' })).join(' ')).toMatch(/defecto no es un valor válido/)
    expect(errs(pieza([valor, { ...vi, defecto: '0', opcional: undefined }], { tipo: 'C', a: 'A', b: 'B', prop: 'valor', ic: 'vi' })).join(' ')).toMatch(/modelo\.ic debe ser una propiedad opcional/)
  })
  it('ic solo lo llevan el capacitor y la bobina', () => {
    expect(errs(pieza([valor, vi], { tipo: 'R', a: 'A', b: 'B', prop: 'valor', ic: 'vi' })).join(' ')).toMatch(/clave desconocida en un modelo «R»/)
  })
  it('la onda de una fuente de corriente pide propiedades que existan', () => {
    const f = { id: 'f', nombre: 'Frecuencia', unidad: 'Hz', defecto: '1k' }
    const a = { id: 'a', nombre: 'Amplitud', unidad: 'A', defecto: '1m' }
    expect(errs(pieza([a, f], { tipo: 'I', a: 'A', b: 'B', prop: 'a', onda: { forma: 'senoidal', frecuencia: 'f' } }))).toEqual([])
    expect(errs(pieza([a, f], { tipo: 'I', a: 'A', b: 'B', prop: 'a', onda: { forma: 'senoidal', frecuencia: 'nada' } })).join(' ')).toMatch(/modelo\.onda\.frecuencia no es una propiedad/)
    expect(errs(pieza([a, f], { tipo: 'I', a: 'A', b: 'B', prop: 'a', onda: { forma: 'triangular', frecuencia: 'f' } })).join(' ')).toMatch(/modelo\.onda\.forma/)
  })
})

// Elementos nuevos en un compuesto: M, J, E, G, H, F y EXT, y los valores lineales en una propiedad.
describe('validarPieza, compuesto con elementos nuevos', () => {
  const pieza = () => ({
    id: 'sensor', nombre: { es: 'Sensor', en: 'Sensor' }, categoria: 'sensores', prefijo: 'U', buscar: ['s'],
    pines: ['P', 'N', 'CP', 'CN'].map((id, i) => ({ id, nombre: id, x: 4 * i - 8, y: 0 })),
    props: [
      { id: 'temp', nombre: 'Temperatura', unidad: '°C', defecto: '25', enVivo: { magnitud: 'temperatura', min: -40, max: 150, paso: 5, pasoFino: 1 } },
      { id: 'k', nombre: 'Ganancia', defecto: '2' }
    ],
    modelo: {
      tipo: 'compuesto',
      medida: { mas: 'P', menos: 'N', i: 0 } as Record<string, unknown>,
      elementos: [
        { t: 'E', p: 'P', n: 'N', cp: 'CP', cn: 'CN', ganancia: 'k' },
        { t: 'R', a: 'P', b: 'N', ohms: 1000 }
      ] as object[]
    }
  })
  const juntos = (o: unknown) => errores(o).join('\n')

  it('acepta E, G, H y F con un nodo de control compartido', () => {
    const o = pieza()
    o.modelo.elementos = [
      { t: 'E', p: 'P', n: 'N', cp: 'CP', cn: 'N', ganancia: 'k' },
      { t: 'G', p: 'P', n: 'N', cp: 'CP', cn: 'CN', gm: 0.01 },
      { t: 'H', p: 'P', n: 'N', cp: 'CP', cn: 'CN', r: 'k' },
      { t: 'F', p: 'P', n: 'N', cp: 'CP', cn: 'CN', ganancia: -2 }
    ]
    expect(errores(o)).toEqual([])
  })

  it('rechaza una fuente controlada sin su ganancia, con una errata o con la salida en un solo nodo', () => {
    const o = pieza()
    o.modelo.elementos = [{ t: 'G', p: 'P', n: 'N', cp: 'CP', cn: 'CN', gm: 0.01 }, { t: 'F', p: 'P', n: 'P', cp: 'CP', cn: 'CN' }]
    expect(juntos(o)).toMatch(/elementos\[1\]\.ganancia debe ser un número o el nombre/)
    expect(juntos(o)).toMatch(/elementos\[1\] su salida y su control deben ser dos nodos distintos/)
    o.modelo.elementos[0] = { t: 'E', p: 'P', n: 'N', cp: 'CP', cn: 'CN', ganacia: 1 }
    expect(juntos(o)).toMatch(/clave desconocida en un elemento «E», ¿quisiste decir «ganancia»\?/)
  })

  it('acepta M y J con parámetros de su familia y rechaza la errata con la sugerencia', () => {
    const o = pieza()
    o.modelo.elementos = [{ t: 'M', d: 'P', g: 'CP', s: 'N', params: { vto: 2, kp: 0.1 } }, { t: 'J', d: 'CP', g: 'CN', s: 'N', pjf: true, params: { vto: -2 } }]
    expect(errores(o)).toEqual([])
    ;(o.modelo.elementos[1] as { params: object }).params = { vtp: -2 }
    expect(juntos(o)).toMatch(/elementos\[1\]\.params\.vtp parámetro desconocido, ¿quisiste decir «vto»\?/)
    ;(o.modelo.elementos[0] as Record<string, unknown>).pmos = 'si'
    expect(juntos(o)).toMatch(/elementos\[0\]\.pmos debe ser verdadero o falso/)
  })

  it('EXT lee una perilla: modo, canal con enVivo y valores', () => {
    const o = pieza()
    o.modelo.elementos = [{ t: 'EXT', a: 'P', b: 'N', modo: 'v', canal: 'temp', k: 0.01, c: 0.5, r: 'k' }, { t: 'R', a: 'CP', b: 'CN', ohms: 1000 }]
    expect(errores(o)).toEqual([])
    ;(o.modelo.elementos[0] as Record<string, unknown>).canal = 'k'
    expect(juntos(o)).toMatch(/elementos\[0\]\.canal debe ser una propiedad con perilla/)
    ;(o.modelo.elementos[0] as Record<string, unknown>).modo = 'x'
    expect(juntos(o)).toMatch(/elementos\[0\]\.modo debe ser «v» o «i»/)
  })

  it('un valor lineal en una propiedad cierra sus claves y exige una propiedad numérica', () => {
    const o = pieza()
    o.modelo.elementos = [{ t: 'R', a: 'P', b: 'N', ohms: { prop: 'temp', por: 10, mas: 500 } }, { t: 'R', a: 'CP', b: 'CN', ohms: 1 }]
    expect(errores(o)).toEqual([])
    o.modelo.elementos[0] = { t: 'R', a: 'P', b: 'N', ohms: { prop: 'temp', pr: 10, mas: 500 } }
    expect(juntos(o)).toMatch(/elementos\[0\]\.ohms\.pr clave desconocida, ¿quisiste decir «por»\?/)
    o.modelo.elementos[0] = { t: 'R', a: 'P', b: 'N', ohms: { prop: 'nada', por: 10, mas: 500 } }
    expect(juntos(o)).toMatch(/elementos\[0\]\.ohms\.prop «nada» no es una propiedad de la pieza/)
    o.modelo.elementos[0] = { t: 'R', a: 'P', b: 'N', ohms: { prop: 'temp', por: 'x', mas: 500 } }
    expect(juntos(o)).toMatch(/elementos\[0\]\.ohms\.por debe ser un número/)
  })

  it('medida.region apunta a un transistor', () => {
    const o = pieza()
    o.modelo.elementos = [{ t: 'J', d: 'P', g: 'CP', s: 'N', params: {} }, { t: 'R', a: 'CN', b: 'N', ohms: 1 }]
    o.modelo.medida = { mas: 'P', menos: 'N', i: 0, region: 0 }
    expect(errores(o)).toEqual([])
    o.modelo.medida = { mas: 'P', menos: 'N', i: 0, region: 1 }
    expect(juntos(o)).toMatch(/modelo\.medida\.region debe ser el índice de un transistor \(Q, M o J\)/)
  })
})
