// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { documentoVacio, type Cable, type Documento, type Pieza } from '../doc/tipos'
import { etiquetasSinChoquesReferencia } from '../prueba/apartarReferencia'
import { circuitoAlAzar } from '../prueba/circuitoAlAzar'
import { libreriaDePrueba } from '../prueba/libreria'
import { cuerpoEnMundo } from '../editor/colision'
import type { Caja } from '../piezas/tipos'
import { bloquesApilados, cajasSeCruzan, cajaTexto, candidatosDeTexto, ESPACIO_TEXTOS, etiquetasSinChoques, ladoDePunto, SEPARACION_LINEAS } from './apartar'
import { etiquetasDePieza, rotulosDePieza, textosLocales, type Texto } from './etiquetas'
import { LUGARES_TEXTO, textosManuales } from './textosManuales'

const lib = libreriaDePrueba().piezas
const R = (id: string, ref: string, x: number, y: number, rot: Pieza['rot'] = 0): Pieza => ({ id, tipo: 'resistencia', ref, x, y, rot, espejo: false, props: {} })
const C = (id: string, ...pts: [number, number][]): Cable => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })
function doc(piezas: Pieza[], cables: Cable[] = []): Documento {
  const d = documentoVacio()
  for (const p of piezas) d.piezas[p.id] = p
  for (const c of cables) d.cables[c.id] = c
  return d
}
const donde = (d: Documento, id: string) => etiquetasSinChoques(d, lib).get(id)!.map(({ texto, x, y, alinear }) => ({ texto, x, y, alinear }))

describe('etiquetasSinChoques', () => {
  it('sin nada cerca, cada texto queda donde dice la definición', () => {
    const d = doc([R('a', 'R1', 10, 20)])
    expect(etiquetasSinChoques(d, lib).get('a')).toEqual(etiquetasDePieza(d.piezas.a, lib.get('resistencia')!))
  })

  it('un cable que pasa sobre la referencia la aleja del cuerpo un paso', () => {
    // «R1» va centrado en (0, −3) con 1.6 de alto: el cable en y = −3 lo cruza; en (0, −5) queda libre.
    const d = doc([R('a', 'R1', 0, 0)], [C('w', [-10, -3], [10, -3])])
    expect(donde(d, 'a')).toEqual([
      { texto: 'R1', x: 0, y: -5, alinear: 'centro' },
      { texto: '1 kΩ', x: 0, y: 3, alinear: 'centro' }
    ])
  })

  it('en una pieza girada se aleja sobre el eje girado', () => {
    // A 90° la referencia va en (3, 0) y empieza ahí; el cable vertical en x = 4 la cruza y pasa a (5, 0).
    const d = doc([R('a', 'R1', 0, 0, 90)], [C('w', [4, -10], [4, 10])])
    expect(donde(d, 'a')[0]).toEqual({ texto: 'R1', x: 5, y: 0, alinear: 'izq' })
  })

  it('no se encima con el texto de otra pieza: el que se coloca primero deja libre el lugar del otro', () => {
    // R2 en (0, 7): su referencia iría en (0, 4) sobre el valor de R1 (y de 2 a 4). Los textos de la definición de una
    // pieza que aún no se coloca ya cuentan: R1 se coloca antes y corre su valor a 4 de lado; R2 se queda donde va.
    const d = doc([R('a', 'R1', 0, 0), R('b', 'R2', 0, 7)])
    expect(donde(d, 'a')).toEqual([
      { texto: 'R1', x: 0, y: -3, alinear: 'centro' },
      { texto: '1 kΩ', x: 4, y: 3, alinear: 'izq' }
    ])
    expect(donde(d, 'b')[0]).toEqual({ texto: 'R2', x: 0, y: 4, alinear: 'centro' })
  })

  it('el resultado no depende del orden de las piezas en el documento', () => {
    const d1 = doc([R('a', 'R1', 0, 0), R('b', 'R2', 0, 7)])
    const d2 = doc([R('b', 'R2', 0, 7), R('a', 'R1', 0, 0)])
    expect(etiquetasSinChoques(d2, lib)).toEqual(etiquetasSinChoques(d1, lib))
  })

  it('si no hay lugar libre, el texto queda donde va', () => {
    // Un cable horizontal en cada unidad de y = −15 a 15: todo lugar candidato cruza alguno.
    const cables = Array.from({ length: 31 }, (_, i) => C(`w${i}`, [-30, i - 15], [30, i - 15]))
    const d = doc([R('a', 'R1', 0, 0)], cables)
    expect(etiquetasSinChoques(d, lib).get('a')).toEqual(etiquetasDePieza(d.piezas.a, lib.get('resistencia')!))
  })

  it('cajaTexto mide el texto con su aire según la alineación', () => {
    // «R1»: 2 caracteres × 1.6 × 0.6 = 1.92 de ancho, 1.6 de alto, 0.2 de aire.
    const c = cajaTexto({ texto: 'R1', x: 5, y: 0, alinear: 'izq', tamaño: 1.6, color: 'trazo', fuente: 'cifras' })
    expect([c.minX, c.minY, c.maxX, c.maxY].map((v) => Math.round(v * 1000) / 1000)).toEqual([4.8, -1, 7.12, 1])
  })
})

describe('etiquetasSinChoques con cajas enormes (el documento admite coordenadas de ±2^20)', () => {
  const LIM = 2 ** 20

  it('un cable de punta a punta del mundo y 100 piezas terminan en menos de 50 ms', () => {
    const piezas = Array.from({ length: 100 }, (_, i) => R(`p${String(i).padStart(3, '0')}`, `R${i}`, (i % 10) * 30, Math.floor(i / 10) * 30))
    const d = doc(piezas, [C('largo', [-LIM, 0], [LIM, 0])])
    etiquetasSinChoques(d, lib) // calentar
    const t0 = performance.now()
    const r = etiquetasSinChoques(d, lib)
    const ms = performance.now() - t0
    console.log(`etiquetasSinChoques, cable de ±2^20 y 100 piezas: ${ms.toFixed(1)} ms`)
    expect(r.size).toBe(100)
    expect(ms).toBeLessThan(50)
  })

  it('una caja enorme también se respeta: la referencia se aparta del cable largo', () => {
    // Mismo caso que el del cable corto, pero el cable llega a ±2^20: debe dar el mismo resultado.
    const corto = doc([R('a', 'R1', 0, 0)], [C('w', [-10, -3], [10, -3])])
    const largo = doc([R('a', 'R1', 0, 0)], [C('w', [-LIM, -3], [LIM, -3])])
    expect(donde(largo, 'a')).toEqual(donde(corto, 'a'))
  })

  it('una diagonal enorme no congela y su caja cuenta como obstáculo', () => {
    const d = doc([R('a', 'R1', 0, 0)], [C('w', [-LIM, -LIM], [LIM, LIM])])
    const t0 = performance.now()
    const r = etiquetasSinChoques(d, lib)
    expect(performance.now() - t0).toBeLessThan(50)
    expect(r.get('a')).toHaveLength(2)
  })
})

/** Distancia entre dos cajas (0 si se tocan o se cruzan). */
const distancia = (a: Caja, b: Caja) => Math.hypot(Math.max(0, a.minX - b.maxX, b.minX - a.maxX), Math.max(0, a.minY - b.maxY, b.minY - a.maxY))

const cruzan = (a: Caja, b: Caja) => a.minX < b.maxX - 1e-6 && b.minX < a.maxX - 1e-6 && a.minY < b.maxY - 1e-6 && b.minY < a.maxY - 1e-6

/** Pares de textos de rótulos que se encima. */
function textosEncimados(d: Documento): string[] {
  const todos = [...etiquetasSinChoques(d, lib).values()].flat()
  const mal: string[] = []
  for (let i = 0; i < todos.length; i++)
    for (let j = i + 1; j < todos.length; j++) if (cruzan(cajaTexto(todos[i], 0), cajaTexto(todos[j], 0))) mal.push(`«${todos[i].texto}» y «${todos[j].texto}»`)
  return mal
}

/** Cada referencia y valor queda más cerca del cuerpo de SU pieza que del de cualquier otra. */
function cadaTextoCercaDeSuPieza(d: Documento): string[] {
  const textos = etiquetasSinChoques(d, lib)
  const cuerpos = Object.values(d.piezas).map((p) => ({ p, caja: cuerpoEnMundo(p, lib.get(p.tipo)) }))
  const mal: string[] = []
  for (const { p, caja } of cuerpos)
    for (const t of textos.get(p.id)!) {
      const propia = distancia(cajaTexto(t, 0), caja)
      for (const o of cuerpos)
        if (o.p.id !== p.id && distancia(cajaTexto(t, 0), o.caja) <= propia) mal.push(`«${t.texto}» de ${p.ref} está tan cerca de ${o.p.ref} (${distancia(cajaTexto(t, 0), o.caja).toFixed(2)}) como de su pieza (${propia.toFixed(2)})`)
    }
  return mal
}

describe('etiquetasSinChoques: cada texto junto a su pieza', () => {
  it('circuito de la prueba de exportación (V1, R1 de 4.7 kΩ, C1 de 10 µF): ningún valor se lee con otra pieza', () => {
    const d = doc([], [C('a', [0, -4], [0, -8], [6, -8]), C('b', [14, 0], [14, 8], [0, 8], [0, 4])])
    d.piezas.v1 = { id: 'v1', tipo: 'fuente-dc', ref: 'V1', x: 0, y: 0, rot: 0, espejo: false, props: { voltaje: '5' } }
    d.piezas.r1 = { id: 'r1', tipo: 'resistencia', ref: 'R1', x: 10, y: -8, rot: 0, espejo: false, props: { valor: '4k7' } }
    d.piezas.c1 = { id: 'c1', tipo: 'capacitor', ref: 'C1', x: 14, y: -4, rot: 90, espejo: false, props: { valor: '10u' } }
    d.piezas.g = { id: 'g', tipo: 'tierra', ref: 'GND1', x: 0, y: 8, rot: 0, espejo: false, props: {} }
    expect(cadaTextoCercaDeSuPieza(d)).toEqual([])
    expect(textosEncimados(d)).toEqual([])
  })

  it('divisor apretado (V1, R1 en (10, -6) y R2 en (10, 2), girados 90°): «5 V» no baja al valor de R2', () => {
    const d = doc([])
    d.piezas.v1 = { id: 'v1', tipo: 'fuente-dc', ref: 'V1', x: 0, y: 0, rot: 0, espejo: false, props: { voltaje: '5' } }
    d.piezas.r1 = { id: 'r1', tipo: 'resistencia', ref: 'R1', x: 10, y: -6, rot: 90, espejo: false, props: { valor: '1k' } }
    d.piezas.r2 = { id: 'r2', tipo: 'resistencia', ref: 'R2', x: 10, y: 2, rot: 90, espejo: false, props: { valor: '1k' } }
    expect(cadaTextoCercaDeSuPieza(d)).toEqual([])
    expect(textosEncimados(d)).toEqual([])
  })

  it('si ningún lugar queda más cerca de su pieza, se usa el más cercano aunque se encime', () => {
    // Dos resistencias pegadas: ningún candidato de R2 puede quedar más cerca de R2 que de R1 sin tocarla.
    const d = doc([R('a', 'R1', 0, 0), R('b', 'R2', 0, 6)])
    const t = etiquetasSinChoques(d, lib)
    expect(t.get('a')!.length).toBe(2)
    expect(t.get('b')!.length).toBe(2)
  })
})

/** V1 a la izquierda, RV1 girado 90° a su derecha con el cursor hacia la derecha y una carga de 1 GΩ (el circuito del reporte). */
function circuitoPotApretado(): Documento {
  const d = doc([])
  const pts = (a: [number, number][]) => a.map(([x, y]) => ({ x, y }))
  d.piezas.p_v1 = { id: 'p_v1', tipo: 'fuente-dc', ref: 'V1', x: 0, y: 0, rot: 0, espejo: false, props: { voltaje: '5' } }
  d.piezas.p_g = { id: 'p_g', tipo: 'tierra', ref: 'GND1', x: 0, y: 8, rot: 0, espejo: false, props: {} }
  d.piezas.p_rv = { id: 'p_rv', tipo: 'potenciometro', ref: 'RV1', x: 14, y: 0, rot: 90, espejo: false, props: { valor: '10k', posicion: '25 %' } }
  d.piezas.p_rc = { id: 'p_rc', tipo: 'resistencia', ref: 'R9', x: 24, y: 0, rot: 0, espejo: false, props: { valor: '1G' } }
  d.cables.a = { id: 'a', puntos: pts([[0, -4], [0, -8], [14, -8], [14, -4]]) }
  d.cables.b = { id: 'b', puntos: pts([[14, 4], [14, 8], [0, 8], [0, 4]]) }
  d.cables.c = { id: 'c', puntos: pts([[18, 0], [20, 0]]) }
  d.cables.d = { id: 'd', puntos: pts([[28, 0], [28, 8], [14, 8]]) }
  return d
}

/** Pares de textos de piezas distintas a menos de ESPACIO_TEXTOS: uno se lee como vecino del otro. */
function textosApretados(d: Documento): string[] {
  const por = etiquetasSinChoques(d, lib)
  const ids = [...por.keys()].sort()
  const mal: string[] = []
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      for (const a of por.get(ids[i])!)
        for (const b of por.get(ids[j])!) if (distancia(cajaTexto(a, 0), cajaTexto(b, 0)) < ESPACIO_TEXTOS - 1e-9) mal.push(`«${a.texto}» de ${ids[i]} y «${b.texto}» de ${ids[j]}`)
  return mal
}

describe('etiquetasSinChoques: referencia y valor de una pieza van juntos y lejos del texto de otra', () => {
  it('el «10 kΩ» de RV1 ya no queda entre V1 y su «5 V»: el par se apila del mismo lado, sin textos vecinos', () => {
    const d = circuitoPotApretado()
    const t = etiquetasSinChoques(d, lib)
    const [ref, valor] = t.get('p_rv')!
    expect([ref.texto, valor.texto]).toEqual(['RV1', '10 kΩ'])
    // Apilados: misma alineación y misma columna, un renglón uno bajo el otro.
    expect(valor.alinear).toBe(ref.alinear)
    expect(valor.x).toBeCloseTo(ref.x, 9)
    expect(valor.y - ref.y).toBeCloseTo(SEPARACION_LINEAS, 9)
    // No en el hueco entre V1 y RV1: a partir del borde izquierdo del cuerpo de RV1.
    const cuerpo = cuerpoEnMundo(d.piezas.p_rv, lib.get('potenciometro'))
    expect(cajaTexto(valor, 0).minX).toBeGreaterThanOrEqual(cuerpo.minX)
    expect(cajaTexto(ref, 0).minX).toBeGreaterThanOrEqual(cuerpo.minX)
    expect(textosApretados(d)).toEqual([])
    expect(textosEncimados(d)).toEqual([])
    expect(cadaTextoCercaDeSuPieza(d)).toEqual([])
  })

  it('con el circuito apretado, el texto más cercano a cada texto es el de su propia pieza o está a más de ESPACIO_TEXTOS', () => {
    const d = circuitoPotApretado()
    const por = etiquetasSinChoques(d, lib)
    for (const [id, textos] of por)
      for (const a of textos) {
        for (const [otro, ts] of por) {
          if (otro === id) continue
          for (const b of ts) expect(distancia(cajaTexto(a, 0), cajaTexto(b, 0))).toBeGreaterThanOrEqual(ESPACIO_TEXTOS - 1e-9)
        }
      }
  })

  it('sin nada cerca se queda donde dice la definición, aunque referencia y valor queden en lados opuestos', () => {
    const d = circuitoPotApretado()
    delete d.piezas.p_v1
    delete d.piezas.p_g
    delete d.piezas.p_rc
    for (const id of ['p_rv']) expect(etiquetasSinChoques(d, lib).get(id)).toEqual(etiquetasDePieza(d.piezas[id], lib.get('potenciometro')!))
  })

  it('el resultado no depende del orden de las piezas en el documento', () => {
    const d = circuitoPotApretado()
    const al_reves: Documento = { ...d, piezas: Object.fromEntries(Object.entries(d.piezas).reverse()) }
    expect(etiquetasSinChoques(al_reves, lib)).toEqual(etiquetasSinChoques(d, lib))
  })

  it('el circuito del reporte da lo mismo que la versión de referencia', () => {
    const d = circuitoPotApretado()
    expect(etiquetasSinChoques(d, lib)).toStrictEqual(etiquetasSinChoquesReferencia(d, lib))
  })

  it('dos resistencias en fila cuyos textos de definición se leerían juntos: no quedan vecinos', () => {
    // R1 y R2 a 9 unidades de distancia: «R1» y «R2» (y sus valores) caen a menos de un espacio unos de otros.
    const d = doc([R('a', 'R1', 0, 0), R('b', 'R2', 8.6, 0)])
    expect(textosApretados(d)).toEqual([])
    expect(textosEncimados(d)).toEqual([])
  })
})

describe('etiquetasSinChoques: el voltaje de un terminal no deja el renglón de su nombre', () => {
  /** El amplificador inversor del usuario (LM741, R2 de entrada, R1 de realimentación, VCC y VCC−, terminal «Vin» de 5 V
   * arriba a la izquierda de R2). Con R2 de pie, el «5 V» chocaba en su lugar y subía 2 unidades; con R2 acostada pasaba
   * al otro lado del nombre. */
  const inversor = (vin: [number, number], r2rot: Pieza['rot']) => {
    const P = (id: string, tipo: string, ref: string, x: number, y: number, rot: Pieza['rot'] = 0, props: Record<string, string> = {}): Pieza => ({ id, tipo, ref, x, y, rot, espejo: false, props })
    const d = doc([
      P('u1', 'amp-op', 'U1', 0, 0),
      P('r2', 'resistencia', 'R2', -14, -2, r2rot, { valor: '10k' }),
      P('r1', 'resistencia', 'R1', -2, -10, 0, { valor: '100k' }),
      P('vin', 'alimentacion', 'PWR1', vin[0], vin[1], 0, { nombre: 'Vin' }),
      P('vcc', 'alimentacion', 'PWR2', 0, -6, 0, { nombre: 'VCC' }),
      P('vee', 'alimentacion', 'PWR3', 0, 6, 180, { nombre: 'VCC-' }),
      P('g', 'tierra', 'GND1', -8, 8)
    ])
    d.alimentaciones = { a1: { id: 'a1', nombre: 'Vin', voltaje: '5' }, a2: { id: 'a2', nombre: 'VCC', voltaje: '15' }, a3: { id: 'a3', nombre: 'VCC-', voltaje: '-15' } }
    return d
  }
  const casos: [string, [number, number], Pieza['rot']][] = [
    ['R2 de pie junto a Vin: el «5 V» se subía', [-20, -2], 90],
    ['R2 acostada a la derecha de Vin: el «5 V» pasaba antes del nombre', [-22, 0], 0],
    ['Vin más cerca de R2 acostada', [-20, 2], 0]
  ]
  it.each(casos)('%s', (_, vin, r2rot) => {
    const d = inversor(vin, r2rot)
    const nombre = rotulosDePieza(d.piezas.vin, lib.get('alimentacion')!)[0]
    const [voltaje] = etiquetasSinChoques(d, lib).get('vin')!
    expect(voltaje.texto).toBe('5 V')
    // En el renglón del nombre, después de él (crece a la derecha) y a lo más 4 unidades más allá de su lugar.
    expect(voltaje.y).toBeCloseTo(nombre.y, 9)
    expect(voltaje.alinear).toBe('izq')
    const finNombre = nombre.x + nombre.ancho! / 2
    expect(voltaje.x).toBeGreaterThanOrEqual(finNombre)
    expect(voltaje.x - finNombre).toBeLessThanOrEqual(1 + 4 + 1e-9)
    expect(etiquetasSinChoques(d, lib)).toEqual(etiquetasSinChoquesReferencia(d, lib))
  })

  it('en las ocho orientaciones, con un cable encima de su lugar, el voltaje sigue en el renglón del nombre', () => {
    for (const rot of [0, 90, 180, 270] as const)
      for (const espejo of [false, true]) {
        const t: Pieza = { id: 't', tipo: 'alimentacion', ref: 'PWR1', x: 0, y: 0, rot, espejo, props: { nombre: 'VEE' } }
        const nombre = rotulosDePieza(t, lib.get('alimentacion')!)[0]
        const [libre] = etiquetasSinChoques(doc([t]), lib).get('t')!
        // Un cable horizontal sobre el lugar del voltaje: se corre a lo largo del renglón, nunca arriba ni abajo.
        const d = doc([t], [C('w', [libre.x - 1, Math.round(libre.y)], [libre.x + 1, Math.round(libre.y)])])
        const [v] = etiquetasSinChoques(d, lib).get('t')!
        expect(v.y, `${rot} ${espejo}`).toBeCloseTo(nombre.y, 9)
        expect(v.alinear, `${rot} ${espejo}`).toBe(libre.alinear)
        expect(etiquetasSinChoques(d, lib)).toEqual(etiquetasSinChoquesReferencia(d, lib))
      }
  })
})

describe('bloques apilados', () => {
  const cuerpo = { minX: 10, minY: -2, maxX: 18, maxY: 2 }
  const lineas = [{ texto: 'RV1', color: 'pieza' as const }, { texto: '10 kΩ', color: 'valor' as const }]

  it('el lado de un punto es el eje dominante de su separación del centro', () => {
    expect(ladoDePunto(cuerpo, 25, 0)).toBe('derecha')
    expect(ladoDePunto(cuerpo, 0, 1)).toBe('izquierda')
    expect(ladoDePunto(cuerpo, 14, 9)).toBe('abajo')
    expect(ladoDePunto(cuerpo, 14, -9)).toBe('arriba')
  })

  it('son doce lugares, cuatro lados centrados y corridos a cada lado, empezando por el preferido', () => {
    const b = bloquesApilados(cuerpo, lineas, 'izquierda')
    expect(b).toHaveLength(12)
    expect(b[0][0].alinear).toBe('der')
    expect(b[0][0].x).toBe(9)
    expect(b[0][1].y - b[0][0].y).toBeCloseTo(SEPARACION_LINEAS, 9)
    expect(b[0][0].y + b[0][1].y).toBeCloseTo(0, 9)
    expect(b[3][0].alinear).toBe('izq')
    expect(b[3][0].x).toBe(19)
    expect(b.slice(6, 9)[0][0].alinear).toBe('centro')
  })

  it('arriba el valor queda cerca del cuerpo y abajo la referencia', () => {
    const b = bloquesApilados(cuerpo, lineas, 'arriba')
    const [ref, valor] = b[0]
    expect(valor.y).toBeLessThan(cuerpo.minY)
    expect(ref.y).toBeLessThan(valor.y)
    const abajo = bloquesApilados(cuerpo, lineas, 'abajo')[0]
    expect(abajo[0].y).toBeGreaterThan(cuerpo.maxY)
    expect(abajo[1].y).toBeGreaterThan(abajo[0].y)
  })
})

describe('etiquetasSinChoques: sin textos encimados si hay arreglo', () => {
  /** Hay una asignación de lugares aceptables y libres de obstáculos fijos sin textos encimados (búsqueda exhaustiva). */
  function hayArreglo(d: Documento): boolean {
    const piezas = Object.values(d.piezas)
    const cuerpos = piezas.map((p) => cuerpoEnMundo(p, lib.get(p.tipo)))
    const rotulos: Texto[][] = []
    piezas.forEach((p, ip) => {
      for (const t of textosLocales(p, lib.get(p.tipo)!)) {
        const suyo = cuerpos[ip]
        rotulos.push(
          candidatosDeTexto(p, t).filter((q) => {
            const caja = cajaTexto(q, 0)
            const propia = distancia(caja, suyo)
            const cerca = cuerpos.some((c, k) => k !== ip && distancia(caja, c) <= propia + 1e-6)
            return !cerca && !cuerpos.some((c, k) => k !== ip && cruzan(cajaTexto(q), c))
          })
        )
      }
    })
    const puestos: Texto[] = []
    const buscar = (i: number): boolean => {
      if (i === rotulos.length) return true
      for (const q of rotulos[i]) {
        if (puestos.some((o) => cruzan(cajaTexto(o), cajaTexto(q)))) continue
        puestos.push(q)
        if (buscar(i + 1)) return true
        puestos.pop()
      }
      return false
    }
    return buscar(0)
  }

  it('circuitos pequeños al azar (semilla fija): sin textos encimados siempre que exista un arreglo', () => {
    let con = 0, sin = 0
    for (let semilla = 1; semilla <= 60; semilla++) {
      let s = semilla
      const azar = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
      const d = documentoVacio()
      const n = 3 + Math.floor(azar() * 3)
      for (let i = 0; i < n; i++) {
        for (let intento = 0; intento < 20; intento++) {
          const x = Math.floor(azar() * 10) * 2, y = Math.floor(azar() * 8) * 2
          const p: Pieza = { id: `p${i}`, tipo: 'resistencia', ref: `R${i + 1}`, x, y, rot: azar() < 0.5 ? 0 : 90, espejo: false, props: {} }
          const caja = cuerpoEnMundo(p, lib.get('resistencia'))
          if (Object.values(d.piezas).some((o) => cruzan({ minX: caja.minX - 0.5, minY: caja.minY - 0.5, maxX: caja.maxX + 0.5, maxY: caja.maxY + 0.5 }, cuerpoEnMundo(o, lib.get('resistencia'))))) continue
          d.piezas[p.id] = p
          break
        }
      }
      if (hayArreglo(d)) {
        con++
        expect(textosEncimados(d), `semilla ${semilla}`).toEqual([])
      } else sin++
    }
    console.log(`circuitos al azar: ${con} con arreglo (sin encimados), ${sin} sin arreglo`)
    expect(con).toBeGreaterThan(5)
  })
})


describe('etiquetasSinChoques: textos movidos a mano', () => {
  const manual = (d: Documento, id: string) => {
    const p = d.piezas[id]
    const def = lib.get(p.tipo)!
    return textosManuales(p, def, textosLocales(p, def, d))
  }

  it('un texto movido a mano queda donde se puso aunque choque, y el otro de la pieza se aparta de él', () => {
    // La referencia de R1 movida abajo, donde va su valor: el valor deja ese lugar.
    const d = doc([{ ...R('a', 'R1', 0, 0), textos: { ref: { lugar: 'abajo' } } }], [C('w', [-10, -6], [10, -6])])
    const [ref, valor] = etiquetasSinChoques(d, lib).get('a')!
    expect(ref).toEqual(manual(d, 'a').get(0))
    expect(cajasSeCruzan(cajaTexto(ref), cajaTexto(valor))).toBe(false)
    expect(etiquetasSinChoques(d, lib)).toStrictEqual(etiquetasSinChoquesReferencia(d, lib))
  })

  it('es un obstáculo fijo para los textos de las demás piezas', () => {
    // El valor de R1, a mano a la derecha, cae sobre el lugar de la referencia de R2 (girada, a su derecha arriba).
    const libre = doc([R('a', 'R1', 0, 0), R('b', 'R2', 12, 0)])
    const [refB] = etiquetasSinChoques(libre, lib).get('b')!
    const d = doc([{ ...R('a', 'R1', 0, 0), textos: { valor: { x: (refB.x - 0) + 0, y: refB.y } } }, R('b', 'R2', 12, 0)])
    const [, valorA] = etiquetasSinChoques(d, lib).get('a')!
    const [refB2] = etiquetasSinChoques(d, lib).get('b')!
    expect(cajasSeCruzan(cajaTexto(valorA), cajaTexto(refB2))).toBe(false)
    expect(etiquetasSinChoques(d, lib)).toStrictEqual(etiquetasSinChoquesReferencia(d, lib))
  })

  it('el voltaje de un terminal movido a mano deja el renglón del nombre', () => {
    const t: Pieza = { id: 't', tipo: 'alimentacion', ref: 'PWR1', x: 0, y: 0, rot: 0, espejo: false, props: { nombre: 'VEE' }, textos: { valor: { lugar: 'abajo' } } }
    const d = doc([t])
    expect(etiquetasSinChoques(d, lib).get('t')).toEqual([manual(d, 't').get(0)])
  })

  it('las piezas sin textos a mano dan lo mismo que antes, y con ellos la versión rápida y la de referencia coinciden', () => {
    for (let s = 1; s <= 120; s++) {
      const d = circuitoAlAzar(s, lib)
      const ids = Object.keys(d.piezas).sort()
      // Una de cada tres piezas con algún texto a mano: lugares y posiciones libres.
      ids.forEach((id, i) => {
        if (i % 3 !== 0) return
        const lugar = LUGARES_TEXTO[(s + i) % 8]
        d.piezas[id] = { ...d.piezas[id], textos: i % 2 ? { ref: { lugar } } : { valor: { lugar }, ref: { x: 3 - (i % 7), y: -4 + (i % 5) } } }
      })
      expect(etiquetasSinChoques(d, lib), `semilla ${s}`).toStrictEqual(etiquetasSinChoquesReferencia(d, lib))
      for (const id of ids) {
        const p = d.piezas[id]
        const def = lib.get(p.tipo)
        if (!def) continue
        const m = manual(d, id)
        const puestos = etiquetasSinChoques(d, lib).get(id)!
        for (const [i, t] of m) expect(puestos[i], `semilla ${s} ${id}`).toEqual(t)
      }
    }
  })
})

describe('etiquetasSinChoques da exactamente lo mismo que su versión de referencia (prueba/apartarReferencia.ts)', () => {
  it('300 circuitos al azar con todas las piezas (semilla fija), algunos con cables de ±2^20 o una pieza muy lejos', () => {
    for (let s = 1; s <= 300; s++) {
      const d = circuitoAlAzar(s, lib)
      expect(etiquetasSinChoques(d, lib), `semilla ${s}`).toStrictEqual(etiquetasSinChoquesReferencia(d, lib))
    }
  })

  it('30 circuitos al azar apretados en un cuarto del lugar: textos que se enciman y lugares de menor área', () => {
    for (let s = 1; s <= 30; s++) {
      const d = circuitoAlAzar(1000 + s, lib)
      for (const p of Object.values(d.piezas)) {
        p.x = Math.round(p.x / 4)
        p.y = Math.round(p.y / 4)
      }
      expect(etiquetasSinChoques(d, lib), `semilla ${1000 + s}`).toStrictEqual(etiquetasSinChoquesReferencia(d, lib))
    }
  })

  it('5,000 resistencias con cables en L (la escena de la prueba de tiempo)', () => {
    const d = documentoVacio()
    for (let i = 0; i < 5000; i++) {
      const x = (i % 100) * 20, y = Math.floor(i / 100) * 20
      d.piezas[`r${i}`] = R(`r${i}`, `R${i + 1}`, x, y)
      d.cables[`c${i}`] = C(`c${i}`, [x + 4, y], [x + 8, y], [x + 8, y + 8], [x + 12, y + 8])
    }
    expect(etiquetasSinChoques(d, lib)).toStrictEqual(etiquetasSinChoquesReferencia(d, lib))
  })
})
