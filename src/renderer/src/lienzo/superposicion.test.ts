// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { seleccionVacia } from '../editor/seleccion'
import { libreriaDePrueba } from '../prueba/libreria'
import type { Muestra } from './animaciones'
import { EscritorTrazos, EscritorTriangulos, FLOTANTES_TRAZO } from './buffers'
import { ANCHO_CABLE } from './medidas'
import { mezclar, PALETA_CLARA } from './paleta'
import { cruces } from './saltos'
import { calcularConexiones } from '../conexiones/conexiones'
import { construirEscena, dibujarPieza } from './escena'
import { ALFA_FANTASMA, ALFA_HOVER, ALFA_SOMBRA_TUTORIAL, construirSuperposicion, type EstadoVisual } from './superposicion'

const lib = libreriaDePrueba().piezas
const R = (id: string, x: number, y: number): Pieza => ({ id, tipo: 'resistencia', ref: 'R1', x, y, rot: 0, espejo: false, props: {} })
function ejemplo(): Documento {
  const d = documentoVacio()
  d.piezas.r1 = R('r1', 0, 0)
  d.cables.c1 = { id: 'c1', puntos: [{ x: 4, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }] }
  d.etiquetas.e1 = { id: 'e1', nombre: 'VCC', x: 12, y: 8, rot: 0 }
  d.notas.n1 = { id: 'n1', x: -20, y: -20, ancho: 8, texto: 'hola' }
  d.figuras = { f1: { id: 'f1', tipo: 'rectangulo', x1: 30, y1: -10, x2: 50, y2: 10, orden: 0, trazo: 'guiones' } }
  return d
}
const nada = (): EstadoVisual => ({ seleccion: seleccionVacia(), hover: null, fantasma: null, cableEnCurso: null, rectangulo: null })
const sup = (ev: Partial<EstadoVisual>) => construirSuperposicion(ejemplo(), lib, { ...nada(), ...ev }, PALETA_CLARA)

describe('construirSuperposicion', () => {
  it('la figura seleccionada se vuelve a trazar en color de selección con su patrón y, sola, lleva sus ocho asas', () => {
    const s = seleccionVacia()
    s.figuras.add('f1')
    const o = sup({ seleccion: s })
    expect(o.nTrazos).toBeGreaterThan(20)
    const colores = new Set<string>()
    for (let i = 0; i < o.nTrazos; i++) colores.add(Array.from(o.trazos.subarray(i * FLOTANTES_TRAZO + 5, i * FLOTANTES_TRAZO + 9)).join(','))
    expect([...colores]).toEqual([Array.from(new Float32Array(PALETA_CLARA.seleccion)).join(',')])
    expect(o.nTriangulos).toBe(16)
    expect(o.conAsas).toBe(true)
    // Con otra cosa seleccionada, sin asas.
    s.notas.add('n1')
    expect(sup({ seleccion: s }).nTriangulos).toBe(0)
  })

  it('el asa bajo el puntero se dibuja más grande', () => {
    const s = seleccionVacia()
    s.figuras.add('f1')
    const normal = sup({ seleccion: s, zoom: 100 })
    const grande = sup({ seleccion: s, zoom: 100, asaFigura: { figura: 'f1', asa: 'se' } })
    const ancho = (o: typeof normal, k: number) => Math.abs(o.triangulos[k * 18 + 6] - o.triangulos[k * 18])
    // La quinta asa es «se» (dos triángulos por asa).
    expect(ancho(grande, 8)).toBeCloseTo(ancho(normal, 8) * 1.5)
  })

  it('la figura bajo el puntero lleva el trazo tenue, y la que se dibuja va con su estilo', () => {
    const hover = sup({ hover: { tipo: 'figura', id: 'f1' } })
    const tenue = Array.from(new Float32Array(mezclar(PALETA_CLARA.seleccion, PALETA_CLARA.lienzo, ALFA_HOVER)))
    expect(Array.from(hover.trazos.subarray(5, 9))).toEqual(tenue)
    const curso = sup({ figuraEnCurso: { id: '', tipo: 'elipse', x1: 0, y1: 0, x2: 8, y2: 6, orden: 0 } })
    expect(curso.nTrazos).toBeGreaterThan(20)
    expect(Array.from(curso.trazos.subarray(5, 9))).toEqual(Array.from(new Float32Array(PALETA_CLARA.textoGris)))
  })

  it('el texto de pieza bajo el puntero lleva un contorno tenue, y el que se arrastra uno en color de selección', () => {
    const caja = { minX: -2, minY: -4, maxX: 2, maxY: -2 }
    const tenue = sup({ textoResaltado: { caja, arrastrando: false } })
    const fuerte = sup({ textoResaltado: { caja, arrastrando: true } })
    expect(tenue.nTrazos).toBeGreaterThan(0)
    expect(fuerte.nTrazos).toBe(tenue.nTrazos)
    // El color va en los últimos cuatro flotantes de cada trazo.
    const color = (s: typeof tenue) => [...s.trazos.slice(FLOTANTES_TRAZO - 4, FLOTANTES_TRAZO)].map((v) => Math.round(v * 255))
    expect(color(fuerte)).toEqual(PALETA_CLARA.seleccion.map((v) => Math.round(v * 255)))
    expect(color(tenue)).toEqual(mezclar(PALETA_CLARA.seleccion, PALETA_CLARA.lienzo, ALFA_HOVER).map((v) => Math.round(v * 255)))
  })

  it('sin estado no dibuja nada', () => {
    const s = sup({})
    expect(s.nTrazos).toBe(0)
    expect(s.nTriangulos).toBe(0)
  })

  it('la pieza seleccionada se vuelve a trazar en color de selección', () => {
    const seleccion = seleccionVacia()
    seleccion.piezas.add('r1')
    const s = sup({ seleccion })
    expect(s.nTrazos).toBe(10)
    for (let k = 0; k < 4; k++) expect(s.trazos[5 + k]).toBeCloseTo(PALETA_CLARA.seleccion[k], 6)
  })

  it('cables, etiquetas y notas seleccionados', () => {
    const seleccion = seleccionVacia()
    seleccion.cables.add('c1')
    seleccion.etiquetas.add('e1')
    seleccion.notas.add('n1')
    expect(sup({ seleccion }).nTrazos).toBe(2 + 5 + 4)
  })

  it('el pin bajo el cursor lleva anillo y su pieza un contorno tenue', () => {
    const s = sup({ hover: { tipo: 'pin', piezaId: 'r1', pinId: '2', x: 4, y: 0 } })
    expect(s.nTrazos).toBe(16 + 4)
    // el contorno de la pieza es opaco y de color mezclado, no translúcido
    const o = 16 * FLOTANTES_TRAZO
    const m = mezclar(PALETA_CLARA.seleccion, PALETA_CLARA.lienzo, ALFA_HOVER)
    for (let k = 0; k < 4; k++) expect(s.trazos[o + 5 + k]).toBeCloseTo(m[k], 6)
    expect(s.trazos[o + 8]).toBe(1)
  })

  it('hover sobre pieza y sobre cable', () => {
    expect(sup({ hover: { tipo: 'pieza', id: 'r1' } }).nTrazos).toBe(4)
    expect(sup({ hover: { tipo: 'cable', id: 'c1', tramo: 0 } }).nTrazos).toBe(2)
  })

  it('el fantasma es la pieza semitransparente', () => {
    const s = sup({ fantasma: R('fantasma', 20, 0) })
    expect(s.nTrazos).toBe(10)
    expect(s.trazos[0]).toBe(16)
    const m = mezclar(PALETA_CLARA.trazo, PALETA_CLARA.lienzo, ALFA_FANTASMA)
    for (let k = 0; k < 4; k++) expect(s.trazos[5 + k]).toBeCloseTo(m[k], 6)
    expect(s.trazos[8]).toBe(1)
  })

  it('la guía del tutorial dibuja la sombra en su giro y los cables punteados, en el token de sombra', () => {
    const sola = sup({ guiaTutorial: { piezas: [{ tipo: 'resistencia', x: 20, y: 0, rot: 0 }], cables: [] } })
    const girada = sup({ guiaTutorial: { piezas: [{ tipo: 'resistencia', x: 20, y: 0, rot: 90 }], cables: [] } })
    expect(sola.nTrazos).toBeGreaterThan(4)
    expect(Array.from(girada.trazos.subarray(0, sola.nTrazos * FLOTANTES_TRAZO))).not.toEqual(Array.from(sola.trazos.subarray(0, sola.nTrazos * FLOTANTES_TRAZO)))
    const m = Array.from(new Float32Array(mezclar(PALETA_CLARA.sombraTutorial, PALETA_CLARA.lienzo, ALFA_SOMBRA_TUTORIAL)))
    expect(Array.from(sola.trazos.subarray(5, 9))).toEqual(m)
    const cable = sup({ guiaTutorial: { piezas: [], cables: [[{ x: 0, y: 0 }, { x: 12, y: 0 }]] } })
    expect(cable.nTrazos).toBe(5)
    expect(sup({ guiaTutorial: null }).nTrazos).toBe(sup({}).nTrazos)
  })

  it('la sombra del tutorial es el mismo símbolo que la pieza colocada, sin trazos añadidos', () => {
    for (const tipo of ['resistencia', 'led']) {
      for (const rot of [0, 90, 180, 270] as const) {
        const real = new EscritorTrazos(), tri = new EscritorTriangulos()
        dibujarPieza(real, tri, { id: 'x', tipo, ref: '', x: 20, y: 5, rot, espejo: false, props: {} }, lib.get(tipo), PALETA_CLARA.pieza)
        const sombra = sup({ guiaTutorial: { piezas: [{ tipo, x: 20, y: 5, rot }], cables: [] } })
        const base = sup({}).nTrazos
        expect(sombra.nTrazos - base, `${tipo} ${rot}`).toBe(real.cuenta)
        const geom = (a: Float32Array, desde: number, n: number) => Array.from({ length: n }, (_, i) => Array.from(a.subarray((desde + i) * FLOTANTES_TRAZO, (desde + i) * FLOTANTES_TRAZO + 5)))
        expect(geom(sombra.trazos, base, real.cuenta)).toEqual(geom(real.resultado(), 0, real.cuenta))
      }
    }
  })

  it('el cable en curso usa el color de cable', () => {
    const s = sup({ cableEnCurso: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }] })
    expect(s.nTrazos).toBe(2)
    expect(s.trazos[5]).toBeCloseTo(PALETA_CLARA.cable[0], 6)
  })

  it('el rectángulo de selección es relleno tenue y contorno', () => {
    const s = sup({ rectangulo: { a: { x: 10, y: 5 }, b: { x: 0, y: 0 } } })
    expect(s.nTrazos).toBe(4)
    expect(s.nTriangulos).toBe(2)
    expect(s.triangulos[5]).toBeCloseTo(0.08, 6)
  })

  describe('arcos de salto', () => {
    /** c1 horizontal de (0, 0) a (10, 0) y c2 vertical en x = 5 que la cruza sin unión. */
    function cruce(): Documento {
      const d = documentoVacio()
      d.cables.c1 = { id: 'c1', puntos: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }
      d.cables.c2 = { id: 'c2', puntos: [{ x: 5, y: -5 }, { x: 5, y: 5 }] }
      return d
    }
    const saltos = cruces(Object.values(cruce().cables), [])

    it('el cable seleccionado sigue el arco: 10 trazos en lugar de 1', () => {
      const seleccion = seleccionVacia()
      seleccion.cables.add('c1')
      expect(construirSuperposicion(cruce(), lib, { ...nada(), seleccion }, PALETA_CLARA, undefined, saltos).nTrazos).toBe(10)
      expect(construirSuperposicion(cruce(), lib, { ...nada(), seleccion }, PALETA_CLARA).nTrazos).toBe(1)
    })

    it('también el cable bajo el cursor y el brillo de un cable recién terminado', () => {
      expect(construirSuperposicion(cruce(), lib, { ...nada(), hover: { tipo: 'cable', id: 'c1', tramo: 0 } }, PALETA_CLARA, undefined, saltos).nTrazos).toBe(10)
      const anim: Muestra = { pulsos: [], brillos: [{ cables: ['c1'], ancho: 1.5, alfa: 1 }], sacudidas: new Map() }
      const s = construirSuperposicion(cruce(), lib, nada(), PALETA_CLARA, anim, saltos)
      expect(s.nTrazos).toBe(10)
      expect(s.trazos[4]).toBeCloseTo(ANCHO_CABLE * 1.5, 6)
    })
  })

  describe('choques y animaciones', () => {
    const vacia = (): Muestra => ({ pulsos: [], brillos: [], sacudidas: new Map() })
    const color = (s: { trazos: Float32Array }, i: number) => Array.from(s.trazos.subarray(i * FLOTANTES_TRAZO + 5, i * FLOTANTES_TRAZO + 9))
    const igual = (a: number[], b: readonly number[]) => a.forEach((v, k) => expect(v).toBeCloseTo(b[k], 6))

    it('el fantasma encimado se dibuja opaco en color inválido', () => {
      const s = sup({ fantasma: R('fantasma', 4, 0), choque: { con: 'r1', ref: 'R1' } })
      expect(s.nTrazos).toBe(10)
      igual(color(s, 0), PALETA_CLARA.invalido)
    })

    it('lo seleccionado se dibuja en color inválido mientras un arrastre se encima', () => {
      const seleccion = seleccionVacia()
      seleccion.piezas.add('r1')
      const s = sup({ seleccion, choque: { con: 'otra', ref: 'R2' } })
      igual(color(s, 0), PALETA_CLARA.invalido)
    })

    it('la sacudida desplaza el fantasma en x', () => {
      const anim = vacia()
      anim.sacudidas.set('fantasma', 0.6)
      const s = construirSuperposicion(ejemplo(), lib, { ...nada(), fantasma: R('fantasma', 20, 0) }, PALETA_CLARA, anim)
      expect(s.trazos[0]).toBeCloseTo(16.6, 6)
    })

    it('la sacudida de una pieza del documento la redibuja desplazada en color inválido', () => {
      const anim = vacia()
      anim.sacudidas.set('r1', -0.6)
      const s = construirSuperposicion(ejemplo(), lib, nada(), PALETA_CLARA, anim)
      expect(s.nTrazos).toBe(10)
      expect(s.trazos[0]).toBeCloseTo(-4.6, 6)
      igual(color(s, 0), PALETA_CLARA.invalido)
    })

    it('el pulso es un rectángulo redondeado escalado desde el centro, en color de selección mezclado con el lienzo', () => {
      const anim = vacia()
      anim.pulsos.push({ caja: { minX: 0, minY: 0, maxX: 4, maxY: 2 }, escala: 1.5, alfa: 0.5 })
      const s = construirSuperposicion(ejemplo(), lib, nada(), PALETA_CLARA, anim)
      expect(s.nTrazos).toBeGreaterThan(4)
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (let i = 0; i < s.nTrazos; i++) {
        const o = i * FLOTANTES_TRAZO
        minX = Math.min(minX, s.trazos[o], s.trazos[o + 2])
        maxX = Math.max(maxX, s.trazos[o], s.trazos[o + 2])
        minY = Math.min(minY, s.trazos[o + 1], s.trazos[o + 3])
        maxY = Math.max(maxY, s.trazos[o + 1], s.trazos[o + 3])
      }
      // Centro (2, 1), mitades 3 y 1.5.
      expect([minX, maxX, minY, maxY].map((v) => Math.round(v * 1000) / 1000)).toEqual([-1, 5, -0.5, 2.5])
      igual(color(s, 0), mezclar(PALETA_CLARA.seleccion, PALETA_CLARA.lienzo, 0.5))
    })

    it('el brillo redibuja el cable más ancho en color de selección', () => {
      const anim = vacia()
      anim.brillos.push({ cables: ['c1', 'no-existe'], ancho: 1.5, alfa: 1 })
      const s = construirSuperposicion(ejemplo(), lib, nada(), PALETA_CLARA, anim)
      expect(s.nTrazos).toBe(2)
      expect(s.trazos[4]).toBeCloseTo(ANCHO_CABLE * 1.5, 6)
      igual(color(s, 0), PALETA_CLARA.seleccion)
    })
  })
})

describe('las sondas en la superposición', () => {
  // XSC1 en (80,0) (entrada A en 72,−6) y su sonda A sobre el cable c1 de R1.
  const conSonda = (): Documento => ({
    ...ejemplo(),
    piezas: { ...ejemplo().piezas, o: { id: 'o', tipo: 'osciloscopio', ref: 'XSC1', x: 80, y: 0, rot: 0, espejo: false, props: {} } },
    sondas: { s: { id: 's', tipo: 'osciloscopio', x: 8, y: 0, instrumento: 'o', entrada: 'A' } }
  })
  const visual = (ev: Partial<EstadoVisual>) => {
    const d = conSonda()
    const con = calcularConexiones(d, lib)
    const banderas = construirEscena(d, lib, con, PALETA_CLARA).banderas
    return construirSuperposicion(d, lib, { ...nada(), con, banderas, ...ev }, PALETA_CLARA)
  }
  /** Algún trazo pasa a menos de `r` de (x, y). */
  const cerca = (o: ReturnType<typeof visual>, x: number, y: number, r: number) => {
    for (let i = 0; i < o.nTrazos; i++) {
      const [ax, ay, bx, by] = Array.from(o.trazos.subarray(i * FLOTANTES_TRAZO, i * FLOTANTES_TRAZO + 4))
      if (Math.hypot(ax - x, ay - y) < r || Math.hypot(bx - x, by - y) < r) return true
    }
    return false
  }
  it('con el ratón sobre la sonda se iluminan su red, su bandera y la entrada de su instrumento', () => {
    const o = visual({ hover: { tipo: 'sonda', id: 's' } })
    expect(o.nTrazos).toBeGreaterThan(visual({}).nTrazos + 10)
    expect(cerca(o, 72, -6, 1.5)).toBe(true)
  })
  it('con el ratón sobre la entrada del instrumento se ilumina su sonda', () => {
    const o = visual({ hover: { tipo: 'pin', piezaId: 'o', pinId: 'A', x: 72, y: -6 } })
    expect(cerca(o, 8, 0, 3.5)).toBe(true)
  })
  it('la sonda seleccionada lleva su contorno y la arrastrada su destino, en rojo si no vale', () => {
    const s = seleccionVacia()
    s.sondas.add('s')
    expect(visual({ seleccion: s }).nTrazos).toBeGreaterThan(visual({}).nTrazos)
    const mal = visual({ sondaArrastrada: { id: 's', x: 30, y: 30, valida: false } })
    expect(cerca(mal, 30, 30, 1.2)).toBe(true)
  })
})

describe('las etiquetas del mismo nombre (B1)', () => {
  it('con el ratón sobre una, se resaltan las demás de su nombre con una línea punteada hasta cada una', () => {
    const d = { ...ejemplo(), etiquetas: { ...ejemplo().etiquetas, e2: { id: 'e2', nombre: 'VCC', x: 60, y: 30, rot: 0 as const } } }
    const o = construirSuperposicion(d, lib, { ...nada(), hover: { tipo: 'etiqueta', id: 'e1' } }, PALETA_CLARA)
    const tramos = Array.from({ length: o.nTrazos }, (_, i) => Array.from(o.trazos.subarray(i * FLOTANTES_TRAZO, i * FLOTANTES_TRAZO + 4)))
    // La bandera de e2 (cerca de su ancla) y guiones entre (12, 8) y (60, 30).
    expect(tramos.some(([x, y]) => Math.hypot(x - 60, y - 30) < 3)).toBe(true)
    const enMedio = tramos.filter(([x, y]) => x > 20 && x < 52 && Math.abs(y - (8 + ((x - 12) * 22) / 48)) < 0.5)
    expect(enMedio.length).toBeGreaterThan(5)
  })
})
