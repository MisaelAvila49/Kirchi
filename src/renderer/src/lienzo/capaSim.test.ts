// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { documentoVacio, type Documento } from '../doc/tipos'
import { divisor, ledConBateria } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import type { Lectura, LecturaDigital } from '../sim/lectura'
import { EscritorTrazos, FLOTANTES_TRAZO, FLOTANTES_VERTICE } from './buffers'
import { brilloDeLed, construirCapaSim, CORRIENTE_BRILLO_PLENO, FACTOR_ANCHO_Z, GUION_X, HUECO_X, RADIO_CORTE_FUSIBLE, TrazosConPatron } from './capaSim'
import { ANCHO_CABLE } from './medidas'
import { contraste, PALETA_CLARA, PALETA_OSCURA } from './paleta'
import { colorDeVoltaje } from './voltajes'
import { construirEscena } from './escena'

const lib = libreriaDePrueba().piezas

/** Colores (r, g, b) distintos de los trazos de la capa, como texto. */
const coloresDeTrazos = (datos: Float32Array) => {
  const out = new Set<string>()
  for (let o = 0; o < datos.length; o += FLOTANTES_TRAZO) out.add([datos[o + 5], datos[o + 6], datos[o + 7]].map((v) => v.toFixed(3)).join(','))
  return out
}
const clave = (c: readonly number[]) => [c[0], c[1], c[2]].map((v) => Math.fround(v).toFixed(3)).join(',')

function lectura(d: Documento, v: (red: number) => number | undefined, piezas: Lectura['piezas'] = new Map()): { l: Lectura; con: ReturnType<typeof calcularConexiones> } {
  const con = calcularConexiones(d, lib)
  const redes = new Map<number, number>()
  for (const r of con.redes) {
    const x = v(r.id)
    if (x !== undefined) redes.set(r.id, x)
  }
  return { l: { t: 0, ratio: 1, redes, piezas }, con }
}

describe('fusible fundido en la vista previa', () => {
  it('se dibuja en rojo y abierto: un corte del color del lienzo en su centro y el símbolo sin ese tramo', () => {
    const d = divisor()
    d.piezas.p_f = { id: 'p_f', tipo: 'fusible', ref: 'F1', x: 40, y: 0, rot: 0, espejo: false, props: {} }
    const fundido = (si: boolean) => lectura(d, () => undefined, new Map([['p_f', { v: 5, i: 0, p: 0, extra: { tipo: 'fusible', fundido: si } as const }]])).l
    const con = calcularConexiones(d, lib)
    const entero = construirCapaSim(d, lib, con, fundido(false), 5, PALETA_CLARA)
    expect(entero.nTrazos + entero.nTriangulos).toBe(0)
    const capa = construirCapaSim(d, lib, con, fundido(true), 5, PALETA_CLARA)
    expect(coloresDeTrazos(capa.trazos)).toEqual(new Set([clave(PALETA_CLARA.invalido)]))
    expect(capa.nTriangulos).toBeGreaterThan(0)
    // Ningún tramo rojo pasa por el centro del símbolo.
    for (let o = 0; o < capa.trazos.length; o += FLOTANTES_TRAZO) {
      const mx = (capa.trazos[o] + capa.trazos[o + 2]) / 2, my = (capa.trazos[o + 1] + capa.trazos[o + 3]) / 2
      expect(Math.hypot(mx - 40, my - 0)).toBeGreaterThanOrEqual(RADIO_CORTE_FUSIBLE - 1e-6)
    }
  })
})

describe('redes y piezas digitales en la vista previa', () => {
  const d = divisor()
  const con = calcularConexiones(d, lib)
  const alta = con.redDePin.get(clavePin('p_v1', '+'))!
  const digital = (x: Partial<LecturaDigital>): LecturaDigital => ({ nivel: '1', nominal: 5, f: 0, ciclo: 0, vcc: 5, cambios: 1, conmuta: false, ...x })
  const capaCon = (x: LecturaDigital, doc: Documento = d, piezas: Lectura['piezas'] = new Map()) =>
    construirCapaSim(doc, lib, calcularConexiones(doc, lib), { t: 0, ratio: 1, redes: new Map(), piezas, digitales: new Map([[alta, x]]) }, 5, PALETA_CLARA)
  const anchos = (datos: Float32Array) => {
    const out = new Set<string>()
    for (let o = 0; o < datos.length; o += FLOTANTES_TRAZO) out.add(datos[o + 4].toFixed(3))
    return out
  }

  it('el patrón sigue de un tramo al siguiente, alterna sus colores y termina con tramos que no caben en un número entero de guiones', () => {
    const t = new EscritorTrazos()
    const rojo = PALETA_CLARA.invalido, gris = PALETA_CLARA.valor
    const p = new TrazosConPatron(t, 1, 1, [rojo, gris], 0.3)
    p.segmento(0, 0, 3, 0)
    p.segmento(3, 0, 3, 2.5)
    // Guiones de 0 a 1 y de 2 a 3 en el primer tramo; el hueco cruza la esquina y el tercero va de 1 a 2 en el segundo.
    const d = t.resultado()
    const tramos = []
    for (let o = 0; o < d.length; o += FLOTANTES_TRAZO) tramos.push([d[o], d[o + 1], d[o + 2], d[o + 3]].map((v) => +v.toFixed(3)))
    expect(tramos).toEqual([[0, 0, 1, 0], [2, 0, 3, 0], [3, 1, 3, 2]])
    const colores = []
    for (let o = 0; o < d.length; o += FLOTANTES_TRAZO) colores.push(clave([d[o + 5], d[o + 6], d[o + 7]]))
    expect(colores).toEqual([clave(rojo), clave(gris), clave(rojo)])
    // 0.1 no cabe un número entero de veces en 1: el ciclo termina igual.
    const q = new TrazosConPatron(new EscritorTrazos(), 0.1, 0.2, [rojo], 0.3)
    for (let k = 0; k < 1000; k++) q.segmento(0, k * 0.7, 0, (k + 1) * 0.7)
  })

  it('un cable larguísimo de un .kir manipulado no cuelga el patrón: va liso y en un solo trazo', () => {
    const t = new EscritorTrazos()
    const inicio = performance.now()
    new TrazosConPatron(t, GUION_X, HUECO_X, [PALETA_CLARA.invalido], 0.3).segmento(0, 0, 1e15, 0)
    expect(performance.now() - inicio).toBeLessThan(50)
    expect(t.resultado().length / FLOTANTES_TRAZO).toBe(1)
  })

  it('el patrón tiene un tope de piezas por cuadro: lo que se pasa va liso', () => {
    const t = new EscritorTrazos()
    const presupuesto = { restantes: 1000 }
    // Cada tramo da 500 guiones (por debajo del tope por tramo); los diez juntos pasan el tope del cuadro.
    for (let k = 0; k < 10; k++) new TrazosConPatron(t, 1, 1, [PALETA_CLARA.invalido], 0.3, presupuesto).segmento(0, k, 1000, k)
    const n = t.resultado().length / FLOTANTES_TRAZO
    expect(n).toBeLessThanOrEqual(1000 + 10)
    expect(n).toBeGreaterThan(8)
    expect(presupuesto.restantes).toBe(0)
  })

  it('una red digital pura en 1 se dibuja lisa con el color de su voltaje nominal', () => {
    const capa = capaCon(digital({}))
    expect(capa.nTrazos).toBeGreaterThan(0)
    expect(coloresDeTrazos(capa.trazos)).toEqual(new Set([clave(PALETA_CLARA.voltajeAlto)]))
    expect(anchos(capa.trazos)).toEqual(new Set([ANCHO_CABLE.toFixed(3)]))
  })

  it('X va en guiones, Z punteada, más delgada y en gris, y una red que conmuta alterna sus dos colores', () => {
    const lisa = capaCon(digital({})).nTrazos
    const x = capaCon(digital({ nivel: 'X', nominal: null }))
    // Debajo de los guiones, el color del lienzo tapa el cable de edición.
    expect(x.nTrazos).toBeGreaterThan(2 * lisa)
    expect(coloresDeTrazos(x.trazos)).toEqual(new Set([clave(PALETA_CLARA.lienzo), clave(colorDeVoltaje(2.5, 5, PALETA_CLARA))]))
    const z = capaCon(digital({ nivel: 'Z', nominal: null }))
    expect(coloresDeTrazos(z.trazos)).toEqual(new Set([clave(PALETA_CLARA.lienzo), clave(PALETA_CLARA.valor)]))
    expect(anchos(z.trazos)).toContain((ANCHO_CABLE * FACTOR_ANCHO_Z).toFixed(3))
    const conmuta = capaCon(digital({ f: 1000, conmuta: true }))
    expect(coloresDeTrazos(conmuta.trazos)).toEqual(new Set([clave(PALETA_CLARA.lienzo), clave(PALETA_CLARA.voltajeCero), clave(PALETA_CLARA.voltajeAlto)]))
  })

  it('cada pin de una pieza digital lleva la marca de su nivel en el color de las piezas, con 3:1 o más contra el lienzo', () => {
    const conNot: Documento = { ...d, piezas: { ...d.piezas, p_u: { id: 'p_u', tipo: 'not', ref: 'U1', x: 60, y: 0, rot: 0, espejo: false, props: {} } } }
    const lecturaDe = (a: '0' | '1' | 'X' | 'Z', y: '0' | '1' | 'X' | 'Z'): Lectura['piezas'] =>
      new Map([['p_u', { v: 0, i: 0, p: 0, extra: { tipo: 'digital', modelo: 'compuerta', pines: [{ id: 'A', nivel: a, salida: false }, { id: 'Y', nivel: y, salida: true }] } }]])
    const base = capaCon(digital({}))
    const unos = capaCon(digital({}), conNot, lecturaDe('1', '1'))
    expect(unos.nTrazos).toBeGreaterThan(base.nTrazos)
    expect(coloresDeTrazos(unos.trazos)).toContain(clave(PALETA_CLARA.pieza))
    const ceros = capaCon(digital({}), conNot, lecturaDe('0', '0'))
    expect(coloresDeTrazos(ceros.trazos)).toContain(clave(PALETA_CLARA.lienzo))
    const letras = capaCon(digital({}), conNot, lecturaDe('X', 'Z')).textos.filter((t) => t.texto === 'X' || t.texto === 'Z')
    expect(letras.map((t) => [t.texto, t.fuente, t.color])).toEqual([['X', 'cifras', 'pieza'], ['Z', 'cifras', 'pieza']])
    for (const p of [PALETA_CLARA, PALETA_OSCURA]) expect(contraste(p.pieza, p.lienzo)).toBeGreaterThanOrEqual(3)
  })

  it('cada segmento del display brilla con su propia corriente; uno apagado no se dibuja', () => {
    const conDisplay: Documento = { ...d, piezas: { ...d.piezas, p_ds: { id: 'p_ds', tipo: 'display-7seg', ref: 'DS1', x: 100, y: 0, rot: 0, espejo: false, props: { color: 'rojo' } } } }
    const conCorrientes = (corrientes: (number | null)[]) => capaCon(digital({}), conDisplay, new Map([['p_ds', { v: 0, i: 0, p: 0, extra: { tipo: 'display', corrientes, muestra: '' } }]]))
    const rojos = (datos: Float32Array) => {
      let n = 0
      for (let o = 0; o < datos.length; o += FLOTANTES_TRAZO) if ([datos[o + 5], datos[o + 6], datos[o + 7]].map((v) => v.toFixed(3)).join(',') === clave(PALETA_CLARA.ledRojo)) n++
      return n
    }
    expect(rojos(conCorrientes([0.02, 0.02, 0.02, 0, 0, 0, 0, 0]).trazos)).toBe(3)
    expect(rojos(conCorrientes([0, 0, 0, 0, 0, 0, 0, 0]).trazos)).toBe(0)
    expect(conCorrientes([0, 0, 0, 0, 0, 0, 0, 0.02]).nTriangulos).toBeGreaterThan(0)
  })
})

describe('construirCapaSim', () => {
  it('cada cable toma el color del voltaje de su red', () => {
    const d = divisor()
    const con0 = calcularConexiones(d, lib)
    const alta = con0.redDePin.get(clavePin('p_v1', '+'))!
    const { l, con } = lectura(d, (r) => (r === alta ? 5 : 0))
    const capa = construirCapaSim(d, lib, con, l, 5, PALETA_CLARA)
    expect(capa.nTrazos).toBeGreaterThan(0)
    const colores = coloresDeTrazos(capa.trazos)
    expect(colores).toEqual(new Set([clave(colorDeVoltaje(5, 5, PALETA_CLARA)), clave(colorDeVoltaje(0, 5, PALETA_CLARA))]))
    expect(capa.textos.map((x) => x.texto).sort()).toEqual(['0.00 V', '5.00 V'])
    expect(construirCapaSim(d, lib, con, l, 5, PALETA_CLARA, undefined, null).textos).toEqual([])
  })

  it('una red que no entra a la simulación no se dibuja', () => {
    const d = divisor()
    const { l, con } = lectura(d, () => undefined)
    expect(construirCapaSim(d, lib, con, l, 5, PALETA_CLARA).nTrazos).toBe(0)
  })

  it('el LED brilla con la raíz de su corriente entre la nominal: apagado en inversa, pleno desde 20 mA, con resplandor', () => {
    expect(brilloDeLed(-1e-3)).toBe(0)
    expect(brilloDeLed(CORRIENTE_BRILLO_PLENO / 2)).toBeCloseTo(Math.SQRT1_2, 12)
    expect(brilloDeLed(1)).toBe(1)
    const d = ledConBateria()
    const conLuz = lectura(d, () => undefined, new Map([['p_d1', { v: 1.9, i: 0.0215, p: 0.04 }]]))
    const capa = construirCapaSim(d, lib, conLuz.con, conLuz.l, 9, PALETA_CLARA)
    // 24 triángulos del disco y 48 del resplandor (dos por cada uno de sus 24 lados).
    expect(capa.nTriangulos).toBe(72)
    // El disco usa el token del color del LED con la opacidad del brillo.
    expect(capa.triangulos[2]).toBeCloseTo(PALETA_CLARA.ledRojo[0], 5)
    expect(capa.triangulos[FLOTANTES_VERTICE - 1]).toBeCloseTo(0.45, 5)
    // El resplandor se desvanece: su vértice exterior es transparente.
    expect(capa.triangulos[24 * 3 * FLOTANTES_VERTICE + 2 * FLOTANTES_VERTICE - 1]).toBe(0)
    const apagado = lectura(d, () => undefined, new Map([['p_d1', { v: -1, i: -1e-12, p: 0 }]]))
    expect(construirCapaSim(d, lib, apagado.con, apagado.l, 9, PALETA_CLARA).nTriangulos).toBe(0)
  })

  it('un color de LED que no es una opción (constructor, toString, __proto__) se dibuja con el de defecto y no falla', () => {
    for (const color of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const d = ledConBateria()
      d.piezas.p_d1 = { ...d.piezas.p_d1, props: { ...d.piezas.p_d1.props, color } }
      const r = lectura(d, () => undefined, new Map([['p_d1', { v: 1.9, i: 0.02, p: 0.04 }]]))
      const capa = construirCapaSim(d, lib, r.con, r.l, 9, PALETA_CLARA)
      expect(capa.nTriangulos).toBe(72)
      expect(capa.triangulos[2]).toBeCloseTo(PALETA_CLARA.ledRojo[0], 5)
    }
  })
})

describe('las sondas al simular', () => {
  // El divisor con una sonda de voltaje en su cable de arriba (c_a, a 5 V) y una de corriente en el tramo horizontal de c_a.
  const conSondas = (sentido: 'derecha' | 'izquierda'): Documento => ({
    ...divisor(),
    sondas: { v: { id: 'v', tipo: 'voltaje', x: 0, y: -6 }, i: { id: 'i', tipo: 'corriente', x: 2, y: -8, sentido } }
  })
  const capa = (d: Documento, media: number) => {
    const con = calcularConexiones(d, lib)
    const redes = new Map(con.redes.map((r) => [r.id, r.id === con.redDeCable.get('c_a') ? 5 : 0]))
    // Un tramo de c_a de (0,−8) a (6,−8) con 2 mA del punto 1 al 0 (hacia la izquierda).
    const tramos = [{ cable: 'c_a', segmento: 1, x0: 0, y0: -8, x1: 6, y1: -8, largo: 6, red: con.redDeCable.get('c_a')! }]
    const l: Lectura = { t: 0, ratio: 1, redes, piezas: new Map(), corrientes: { tramos, media: new Float64Array([media]), absoluta: new Float64Array([Math.abs(media)]), sinFlechas: new Map() } }
    const banderas = construirEscena(d, lib, con, PALETA_CLARA).banderas
    return { c: construirCapaSim(d, lib, con, l, 5, PALETA_CLARA, undefined, null, [], null, { banderas }), banderas }
  }
  it('la de voltaje dice el voltaje de su red junto a su bandera', () => {
    const { c, banderas } = capa(conSondas('derecha'), -2e-3)
    const t = c.textos.find((x) => x.texto === '5.00 V')!
    expect(t).toMatchObject({ chip: true, x: banderas.get('v')!.cifra.x, y: banderas.get('v')!.cifra.y })
  })
  it('la de corriente dice la corriente con el signo de su sentido', () => {
    expect(capa(conSondas('derecha'), -2e-3).c.textos.some((x) => x.texto === '−2.00 mA')).toBe(true)
    expect(capa(conSondas('izquierda'), -2e-3).c.textos.some((x) => x.texto === '2.00 mA')).toBe(true)
  })
  it('sin el reparto de corrientes, la de corriente espera', () => {
    const d = conSondas('derecha')
    const con = calcularConexiones(d, lib)
    const banderas = construirEscena(d, lib, con, PALETA_CLARA).banderas
    const l: Lectura = { t: 0, ratio: 1, redes: new Map(), piezas: new Map() }
    expect(construirCapaSim(d, lib, con, l, 5, PALETA_CLARA, undefined, null, [], null, { banderas }).textos.map((x) => x.texto)).toContain('…')
  })
})

describe('luces sueltas de una pieza compuesta (la punta lógica)', () => {
  const doc = (rot: 0 | 90 | 180 | 270 = 0, x = 0, y = 0): Documento => ({ ...documentoVacio(), piezas: { p1: { id: 'p1', tipo: 'punta-logica', ref: 'LP1', x, y, rot, espejo: false, props: {} } } })
  /** Una lectura con las corrientes de los 12 elementos de la pieza: solo importan el diodo 9 (la luz roja) y el 11 (la verde). */
  const capa = (d: Documento, roja: number, verde: number) => {
    const corrientes = Array.from({ length: 12 }, () => 0)
    corrientes[9] = roja
    corrientes[11] = verde
    const con = calcularConexiones(d, lib)
    const l: Lectura = { t: 0, ratio: 1, redes: new Map(), piezas: new Map([['p1', { v: 0, i: 0, p: 0, extra: { tipo: 'compuesto', corrientes, voltajes: corrientes.map(() => 0) } }]]) }
    return construirCapaSim(d, lib, con, l, 5, PALETA_CLARA)
  }
  /** El centro (primer vértice) y el color (rojo, verde, azul) del primer triángulo de cada disco de 24 triángulos. */
  const discos = (c: ReturnType<typeof capa>) => {
    const out: { x: number; y: number; color: string }[] = []
    for (let t = 0; t < c.nTriangulos; t += 72) {
      const o = t * 3 * FLOTANTES_VERTICE
      out.push({ x: c.triangulos[o], y: c.triangulos[o + 1], color: [2, 3, 4].map((k) => c.triangulos[o + k].toFixed(3)).join(',') })
    }
    return out
  }
  const color = (c: readonly number[]) => [c[0], c[1], c[2]].map((v) => Math.fround(v).toFixed(3)).join(',')

  it('sin corriente en los diodos no dibuja nada', () => {
    expect(capa(doc(), 0, 0).nTriangulos).toBe(0)
  })

  it('cada luz brilla con la corriente de su diodo y el color de su LED, en el punto de su símbolo', () => {
    const roja = discos(capa(doc(), 0.02, 0)), verde = discos(capa(doc(), 0, 0.02)), ambas = discos(capa(doc(), 0.02, 0.02))
    expect(roja).toHaveLength(1)
    expect(roja[0]).toMatchObject({ x: 2, y: -2, color: color(PALETA_CLARA.ledRojo) })
    expect(verde).toHaveLength(1)
    expect(verde[0]).toMatchObject({ x: 2, y: 2, color: color(PALETA_CLARA.ledVerde) })
    expect(ambas).toHaveLength(2)
  })

  it('sigue la posición y el giro de la pieza', () => {
    const [giro] = discos(capa(doc(90, 10, 20), 0.02, 0))
    // (2, −2) girado 90° es (2, 2) y se suma a la posición de la pieza.
    expect(giro).toMatchObject({ x: 12, y: 22 })
  })

  it('con menos corriente brilla menos: la opacidad del disco sale de la raíz de la fracción de 20 mA', () => {
    const a = capa(doc(), 0.005, 0)
    expect(a.triangulos[FLOTANTES_VERTICE - 1]).toBeCloseTo(0.45 * Math.sqrt(0.25), 5)
  })
})
