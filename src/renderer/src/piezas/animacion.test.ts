// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { leerCarpeta, libreriaDePrueba, RAIZ_COMPONENTES } from '../prueba/libreria'
import { TOKEN_DE_LED } from '../lienzo/capaSim'
import { cargarLibreria } from './libreria'
import { COLORES_DE_LUZ, validarPieza } from './validar'

/** Un motor de prueba, con la animación que se le pase. */
const motor = (animacion: unknown) => ({
  id: 'motor-x',
  nombre: { es: 'Motor', en: 'Motor' },
  categoria: 'electromecanicos',
  prefijo: 'M',
  buscar: ['motor'],
  pines: [
    { id: '1', nombre: '1', x: -4, y: 0 },
    { id: '2', nombre: '2', x: 4, y: 0 }
  ],
  props: [{ id: 'voltaje', nombre: 'Voltaje nominal', unidad: 'V', defecto: '12' }],
  modelo: { tipo: 'motor', a: '1', b: '2', voltaje: 'voltaje', referencia: { v: 6, r: 3, l: 1.5e-3, ke: 6.05e-3, j: 2.4e-7, bm: 6.4e-7 } },
  animacion
})
const txt = (o: unknown) => JSON.stringify(o, null, 2)
const errores = (o: unknown) => {
  const v = validarPieza(txt(o), 'x/pieza.json')
  return v.ok ? [] : v.errores
}
const SVG_MOTOR = (capas: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 10 10" fill="none" stroke="currentColor"><circle cx="0" cy="0" r="2"/><path d="M-4 0 H-2 M2 0 H4"/>${capas}</svg>`
const ROTOR = '<g data-capa="rotor"><path d="M0 -1.85 V-1.35"/></g>'

describe('animación de las piezas', () => {
  it('las piezas de la Librería traen su animación con las capas que pide', () => {
    const lib = libreriaDePrueba()
    expect(lib.errores).toEqual([])
    const tipos = Object.fromEntries([...lib.piezas.values()].filter((d) => d.animacion).map((d) => [d.id, d.animacion!.tipo]))
    expect(tipos).toEqual({ 'motor-dc': 'giro', 'motor-pasos-bipolar': 'giro', 'motor-pasos-unipolar': 'giro', rele: 'contacto', potenciometro: 'cursor', reostato: 'cursor', led: 'brillo', 'display-7seg': 'brillo', foco: 'filamento', zumbador: 'sonido', 'punta-logica': 'luces' })
    expect(Object.keys(lib.piezas.get('rele')!.geometria.capas!).sort()).toEqual(['estado-operado', 'estado-reposo'])
  })

  it('un tipo desconocido, una clave con errata o un parámetro fuera de rango se rechazan con el renglón de la animación', () => {
    const malo = errores(motor({ tipo: 'brincar' }))
    expect(malo).toHaveLength(1)
    expect(malo[0]).toMatch(/^x\/pieza\.json: animacion\.tipo \(renglón \d+\) debe ser uno de brillo, filamento, giro, contacto, cursor, sonido, luces$/)
    const renglon = Number(/renglón (\d+)/.exec(malo[0])![1])
    expect(txt(motor({ tipo: 'brincar' })).split('\n')[renglon - 1]).toContain('"animacion"')
    expect(errores(motor({ tipo: 'giro', vueltasMaxx: 2 })).join()).toContain('clave desconocida en una animación «giro», ¿quisiste decir «vueltasMax»?')
    expect(errores(motor({ tipo: 'giro', vueltasMax: 50 })).join()).toContain('debe estar entre 0 y 10 vueltas por segundo')
    expect(errores(motor({ tipo: 'brillo' })).join()).toContain('«brillo» no aplica a un modelo «motor»')
    expect(errores(motor({ tipo: 'giro', vueltasMax: 2 }))).toEqual([])
  })

  it('al cargar la Librería se rechaza una capa que falta, una que nadie usa y un contacto cuyos estados no tienen la misma forma', () => {
    const cargar = (anim: unknown, svg: string) => cargarLibreria({ 'p/motor-x/pieza.json': txt(motor(anim)), 'p/motor-x/simbolo.svg': svg }).errores
    expect(cargar({ tipo: 'giro', vueltasMax: 2 }, SVG_MOTOR(ROTOR))).toEqual([])
    expect(cargar({ tipo: 'giro', vueltasMax: 2 }, SVG_MOTOR(''))).toEqual(['p/motor-x/simbolo.svg: falta la capa «rotor» que pide su animación «giro»'])
    expect(cargar(undefined, SVG_MOTOR(ROTOR))).toEqual(['p/motor-x/simbolo.svg: tiene la capa «rotor» y ninguna animación la usa'])
  })

  it('el contacto es solo del relé, y el brillo pide colores que el lienzo sabe pintar', () => {
    const interruptor = { ...motor({ tipo: 'contacto', manda: 'cerrado' }), modelo: { tipo: 'interruptor', a: '1', b: '2', prop: 'estado', cerrado: 'cerrado' }, props: [{ id: 'estado', nombre: 'Estado', opciones: ['abierto', 'cerrado'], defecto: 'abierto' }] }
    expect(errores(interruptor).join()).toContain('«contacto» no aplica a un modelo «interruptor»')
    const led = (opciones: string[]) => ({
      ...motor({ tipo: 'brillo', color: 'color' }),
      modelo: { tipo: 'D', a: '1', b: '2', is: 1e-18, n: 2 },
      props: [{ id: 'color', nombre: 'Color', opciones, defecto: opciones[0] }]
    })
    expect(errores(led(['rojo', 'verde']))).toEqual([])
    expect(errores(led(['rojo', 'magenta'])).join()).toContain('«magenta»')
  })

  it('el renglón de la animación es el de su clave, no el de un texto que la nombra', () => {
    const o = { ...motor({ tipo: 'brincar' }), buscar: ['motor', 'animacion'] }
    // La palabra entre comillas aparece antes como valor en «buscar».
    const t = JSON.stringify(o, null, 2).replace('"motor",', '"motor", "animacion",')
    const v = validarPieza(t, 'x/pieza.json')
    const renglon = Number(/renglón (\d+)/.exec(v.ok ? '' : v.errores.join())![1])
    expect(t.split(String.fromCharCode(10))[renglon - 1]).toMatch(/"animacion"\s*:/)
  })

  it('las capas van solo en grupos del símbolo; un límite por modelo debe ser un objeto; el cursor queda dentro del dibujo', () => {
    const cargar = (archivos: Record<string, string>) => cargarLibreria(archivos).errores
    const conCapaSuelta = SVG_MOTOR('<path data-capa="rotor" d="M0 -1.85 V-1.35"/>')
    expect(cargar({ 'p/motor-x/pieza.json': txt(motor({ tipo: 'giro', vueltasMax: 2 })), 'p/motor-x/simbolo.svg': conCapaSuelta }).join()).toContain('data-capa va solo en un <g>')
    const transistor = {
      id: 'npn-x', nombre: { es: 'NPN', en: 'NPN' }, categoria: 'semiconductores', prefijo: 'Q', buscar: ['npn'],
      pines: [{ id: 'C', nombre: 'C', x: 0, y: -4 }, { id: 'B', nombre: 'B', x: -4, y: 0 }, { id: 'E', nombre: 'E', x: 0, y: 4 }],
      props: [{ id: 'modelo', nombre: 'Modelo', opciones: ['A'], defecto: 'A' }],
      modelo: { tipo: 'bjt', c: 'C', b: 'B', e: 'E', pnp: false, prop: 'modelo', modelos: { A: { is: 1e-14, bf: 100 } } },
      limites: { por: { prop: 'modelo', valores: { A: 5 } } }
    }
    expect(errores(transistor).join()).toContain('limites.por.valores.A')
    // El cursor del potenciómetro de la Librería, corrido más allá de su dibujo.
    const archivos = Object.fromEntries(Object.entries(leerCarpeta(RAIZ_COMPONENTES)).filter(([k]) => k.includes('/potenciometro/')))
    const ruta = Object.keys(archivos).find((k) => k.endsWith('pieza.json'))!
    expect(cargar(archivos)).toEqual([])
    const j = JSON.parse(archivos[ruta])
    j.animacion.hasta = 40
    expect(cargar({ ...archivos, [ruta]: JSON.stringify(j, null, 2) }).join()).toContain('deben quedar dentro del dibujo')
    expect([...Object.keys(TOKEN_DE_LED)].sort()).toEqual([...COLORES_DE_LUZ].sort())
  })

  it('limites.voltaje: el motor y el capacitor tienen voltaje nominal; lo demás, no; el capacitor pide su inverso', () => {
    const conLimites = (limites: unknown) => errores({ ...motor(undefined), animacion: undefined, limites }).join()
    expect(conLimites({ voltaje: { prop: 'voltaje', aviso: 1.5 }, quema: { factor: 2, durante: 0.5 } })).toBe('')
    expect(conLimites({ voltaje: { prop: 'voltaje', aviso: 1.5, inverso: 1 } })).toContain('limites.voltaje.inverso')
    expect(conLimites({ voltaje: { prop: 'nada', aviso: 1.5 } })).toContain('limites.voltaje.prop')
    expect(conLimites({ voltaje: { prop: 'voltaje', aviso: 0.5 } })).toContain('limites.voltaje.aviso')
    expect(conLimites({ quema: { factor: 1, durante: 0.5 } })).toContain('factor mayor que 1')
    const capacitor = (limites: unknown) => errores({
      id: 'c-x', nombre: { es: 'C', en: 'C' }, categoria: 'pasivos', prefijo: 'C', buscar: ['c'],
      pines: [{ id: '+', nombre: '+', x: -4, y: 0 }, { id: '-', nombre: '-', x: 4, y: 0 }],
      props: [{ id: 'valor', nombre: 'C', unidad: 'F', defecto: '1u' }, { id: 'voltaje', nombre: 'Voltaje nominal', defecto: '25 V', opciones: ['25 V', '50 V'] }],
      modelo: { tipo: 'C', a: '+', b: '-', prop: 'valor' },
      limites
    }).join()
    expect(capacitor({ voltaje: { prop: 'voltaje', aviso: 1, inverso: 1 }, quema: { factor: 1, durante: 0.5 } })).toBe('')
    expect(capacitor({ voltaje: { prop: 'voltaje', aviso: 1 } })).toContain('limites.voltaje.inverso')
    expect(capacitor({ voltaje: { prop: 'voltaje', aviso: 1, inverso: 1 }, quema: { factor: 0.5, durante: 0.5 } })).toContain('factor de 1 o más')
  })

  it('limites.compuesto: solo una pieza compuesta, con índices de sus elementos, sentido, máximo, consejo y fuente', () => {
    const compuesto = (limites: unknown) => errores({
      id: 'u-x', nombre: { es: 'U', en: 'U' }, categoria: 'integrados', prefijo: 'U', buscar: ['u'],
      pines: [{ id: 'A', nombre: 'A', x: -4, y: 0 }, { id: 'B', nombre: 'B', x: 4, y: 0 }],
      props: [],
      modelo: { tipo: 'compuesto', medida: { mas: 'A', menos: 'B', i: 0 }, elementos: [{ t: 'R', a: 'A', b: 'B', ohms: 100 }, { t: 'R', a: 'A', b: 'B', ohms: 200 }] },
      limites
    }).join()
    const bueno = { nombre: 'canal 1', elementos: [0, 1], sentido: 'positiva', max: 0.5, consejo: 'baja la carga.', fuente: 'Criterio de Kirchi.' }
    expect(compuesto({ compuesto: [bueno, { ...bueno, medida: 'voltaje', sentido: 'negativa' }] })).toBe('')
    expect(compuesto({ compuesto: [{ ...bueno, elementos: [0, 2] }] })).toContain('limites.compuesto.0.elementos')
    expect(compuesto({ compuesto: [{ ...bueno, sentido: 'directa' }] })).toContain('limites.compuesto.0.sentido')
    expect(compuesto({ compuesto: [{ ...bueno, max: 0 }] })).toContain('limites.compuesto.0.max')
    expect(compuesto({ compuesto: [{ ...bueno, medida: 'potencia' }] })).toContain('limites.compuesto.0.medida')
    expect(compuesto({ compuesto: [{ ...bueno, fuente: '' }] })).toContain('limites.compuesto.0.fuente')
    expect(compuesto({ compuesto: [{ ...bueno, consejo: undefined }] })).toContain('limites.compuesto.0.consejo')
    expect(compuesto({ compuesto: [] })).toContain('limites.compuesto')
    expect(errores({ ...motor(undefined), animacion: undefined, limites: { compuesto: [bueno] } }).join()).toContain('solo una pieza compuesta')
  })

  it('un interruptor con accionado.svg no lleva además la animación «contacto»: dibujarían lo mismo', () => {
    const lib = libreriaDePrueba()
    const boton = lib.piezas.get('boton')!
    expect(boton.geometriaAccionada).toBeDefined()
    expect(boton.animacion).toBeUndefined()
  })
})
