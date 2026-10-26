// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio } from '../doc/tipos'
import { seleccionDe, seleccionVacia } from '../editor/seleccion'
import { construirEscena } from '../lienzo/escena'
import { PALETA_CLARA } from '../lienzo/paleta'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { cajaDeArea, documentoDeArea, documentoDeSeleccion, documentoSinInstrumentos } from './seleccion'
import { cajaLamina, MARGEN_EXPORTAR } from './svg'

const lib = libreriaDePrueba().piezas

describe('documentoDeSeleccion', () => {
  it('sin selección no hay documento', () => {
    expect(documentoDeSeleccion(divisor(), seleccionVacia())).toBeNull()
  })

  it('las figuras seleccionadas van en el documento; sin figuras seleccionadas, la colección no aparece', () => {
    const d = divisor()
    d.figuras = { f: { id: 'f', tipo: 'rectangulo', x1: 0, y1: 0, x2: 10, y2: 10, orden: 0 }, g: { id: 'g', tipo: 'linea', x1: 0, y1: 20, x2: 9, y2: 20, orden: 1 } }
    const s = seleccionDe('figuras', 'f')
    expect(documentoDeSeleccion(d, s)?.figuras).toEqual({ f: d.figuras.f })
    expect(documentoDeSeleccion(d, seleccionDe('piezas', 'p_r1'))).not.toHaveProperty('figuras')
    // Una figura que ya no está no deja un documento vacío con colección.
    expect(documentoDeSeleccion(documentoVacio(), seleccionDe('figuras', 'f'))).toBeNull()
  })

  it('solo trae lo seleccionado y no toca el original', () => {
    const d = divisor()
    d.notas.n = { id: 'n', x: 40, y: 40, ancho: 20, texto: 'hola' }
    const copia = JSON.stringify(d)
    const s = seleccionDe('piezas', 'p_r1')
    s.notas.add('n')
    const sub = documentoDeSeleccion(d, s)!
    expect(Object.keys(sub.piezas)).toEqual(['p_r1'])
    expect(Object.keys(sub.notas)).toEqual(['n'])
    expect(sub.cables).toEqual({})
    expect(JSON.stringify(d)).toBe(copia)
  })

  it('conserva la tabla de alimentaciones: un VCC exportado solo dice el voltaje de su riel', () => {
    const d = divisor()
    d.piezas.t = { id: 't', tipo: 'alimentacion', ref: 'PWR1', x: 60, y: 0, rot: 0, espejo: false, props: { nombre: 'VCC' } }
    d.alimentaciones = { a_1: { id: 'a_1', nombre: 'VCC', voltaje: '15' } }
    expect(documentoDeSeleccion(d, seleccionDe('piezas', 't'))!.alimentaciones).toEqual(d.alimentaciones)
    expect(documentoDeSeleccion(divisor(), seleccionDe('piezas', 'p_r1'))).not.toHaveProperty('alimentaciones')
  })

  it('un id que ya no existe o que viene de un prototipo se ignora', () => {
    const d = divisor()
    const s = seleccionDe('piezas', 'fantasma')
    s.piezas.add('__proto__')
    s.piezas.add('constructor')
    expect(documentoDeSeleccion(d, s)).toBeNull()
    s.cables.add('c_a')
    expect(Object.keys(documentoDeSeleccion(d, s)!.cables)).toEqual(['c_a'])
  })

  it('la lámina de la selección es la de su caja con 5 mm de margen, más chica que la del dibujo completo', () => {
    const d = divisor()
    const caja = (doc: typeof d) => construirEscena(doc, lib, calcularConexiones(doc, lib), PALETA_CLARA).caja!
    const sola = documentoDeSeleccion(d, seleccionDe('piezas', 'p_r1'))!
    const completa = cajaLamina(caja(d)), parcial = cajaLamina(caja(sola))
    expect(parcial.anchoMm).toBeLessThan(completa.anchoMm)
    expect(parcial.altoMm).toBeLessThanOrEqual(completa.altoMm)
    // Margen de 5 mm por lado alrededor de lo seleccionado.
    const c = caja(sola)
    expect(parcial.caja.minX).toBe(Math.floor(c.minX - MARGEN_EXPORTAR))
    expect(parcial.caja.maxY).toBe(Math.ceil(c.maxY + MARGEN_EXPORTAR))
    expect(documentoVacio().piezas).toEqual({})
  })
})

describe('documentoSinInstrumentos', () => {
  it('quita los instrumentos, las etiquetas de sus terminales y las que puso «Medir con…»; lo demás queda', () => {
    const d = divisor()
    d.piezas.osc = { id: 'osc', tipo: 'osciloscopio', ref: 'XSC1', x: 60, y: 0, rot: 0, espejo: false, props: {} }
    d.piezas.mm = { id: 'mm', tipo: 'multimetro', ref: 'XMM1', x: 90, y: 0, rot: 0, espejo: false, props: {} }
    d.etiquetas.e1 = { id: 'e1', nombre: 'XSC1·A', x: 0, y: -8, rot: 0 }
    d.etiquetas.e2 = { id: 'e2', nombre: 'XSC1·A', x: 52, y: -6, rot: 0 }
    d.etiquetas.e3 = { id: 'e3', nombre: 'VSAL', x: 14, y: 8, rot: 0 }
    const s = documentoSinInstrumentos(d, lib)
    expect(Object.keys(s.piezas).sort()).toEqual(['p_g', 'p_r1', 'p_r2', 'p_v1'])
    expect(Object.keys(s.etiquetas)).toEqual(['e3'])
    expect(Object.keys(s.cables)).toEqual(Object.keys(d.cables))
    expect(d.piezas.osc).toBeDefined()
  })

  it('sin instrumentos también quita sus sondas; las de voltaje y corriente quedan', () => {
    const d = divisor()
    d.piezas.osc = { id: 'osc', tipo: 'osciloscopio', ref: 'XSC1', x: 60, y: 0, rot: 0, espejo: false, props: {} }
    d.sondas = { a: { id: 'a', tipo: 'osciloscopio', x: 0, y: -8, instrumento: 'osc', entrada: 'A' }, v: { id: 'v', tipo: 'voltaje', x: 0, y: -6 } }
    expect(Object.keys(documentoSinInstrumentos(d, lib).sondas ?? {})).toEqual(['v'])
  })
})

describe('documentoDeArea', () => {
  it('solo entra lo que cruza el área; un área vacía da null y el original no cambia', () => {
    const d = divisor()
    d.cables.c1 = { id: 'c1', puntos: [{ x: 40, y: 40 }, { x: 60, y: 40 }] }
    const r1 = d.piezas.p_r1
    const area = { minX: r1.x - 2, minY: r1.y - 6, maxX: r1.x + 2, maxY: r1.y + 6 }
    const sub = documentoDeArea(d, lib, area)!
    expect(Object.keys(sub.piezas)).toContain('p_r1')
    expect(Object.keys(sub.piezas)).not.toContain('p_v1')
    expect(sub.cables).toEqual({})
    expect(documentoDeArea(d, lib, { minX: 500, minY: 500, maxX: 510, maxY: 510 })).toBeNull()
    expect(Object.keys(d.piezas)).toHaveLength(4)
  })

  it('un cable que cruza el área entra entero; un medidor entra por su cuerpo o su punto', () => {
    const d = divisor()
    d.cables.c1 = { id: 'c1', puntos: [{ x: 40, y: 40 }, { x: 80, y: 40 }] }
    d.sondas = { m: { id: 'm', tipo: 'medidor', x: 200, y: 40, magnitud: 'voltaje', modo: 'dc', pantalla: { dx: 0, dy: 0 }, ref: 'M1' } }
    const sub = documentoDeArea(d, lib, { minX: 55, minY: 35, maxX: 65, maxY: 45 })!
    expect(sub.cables.c1.puntos).toHaveLength(2)
    expect(sub.sondas).toBeUndefined()
    expect(Object.keys(documentoDeArea(d, lib, { minX: 195, minY: 35, maxX: 199, maxY: 45 })!.sondas ?? {})).toEqual(['m'])
  })

  it('la selección de un medidor lo lleva en el documento', () => {
    const d = divisor()
    d.sondas = { m: { id: 'm', tipo: 'medidor', x: 5, y: 5, magnitud: 'voltaje', modo: 'dc', pantalla: { dx: 0, dy: 0 }, ref: 'M1' } }
    expect(Object.keys(documentoDeSeleccion(d, seleccionDe('sondas', 'm'))!.sondas ?? {})).toEqual(['m'])
  })

  it('el área en milímetros pasa a unidades de mundo (1.25 mm cada una)', () => {
    expect(cajaDeArea({ x: 12.5, y: -25, ancho: 25, alto: 50 })).toEqual({ minX: 10, minY: -20, maxX: 30, maxY: 20 })
  })
})
