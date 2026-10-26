// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio, type Cable, type Documento, type Figura, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { FLOTANTES_TRAZO } from './buffers'
import { construirEscena } from './escena'
import { MAX_TRAMOS_FIGURAS } from './figuras'
import { mezclar, PALETA_CLARA } from './paleta'

const lib = libreriaDePrueba().piezas
const R = (id: string, x: number, y: number, rot: Pieza['rot'] = 0, tipo = 'resistencia'): Pieza => ({ id, tipo, ref: id.toUpperCase(), x, y, rot, espejo: false, props: {} })
const C = (id: string, ...pts: [number, number][]): Cable => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })
function doc(piezas: Pieza[] = [], cables: Cable[] = []): Documento {
  const d = documentoVacio()
  for (const p of piezas) d.piezas[p.id] = p
  for (const c of cables) d.cables[c.id] = c
  return d
}
const escena = (d: Documento) => construirEscena(d, lib, calcularConexiones(d, lib), PALETA_CLARA)
const cerca = (a: { minX: number; minY: number; maxX: number; maxY: number }, b: typeof a) => {
  for (const k of ['minX', 'minY', 'maxX', 'maxY'] as const) expect(a[k], k).toBeCloseTo(b[k], 9)
}
const segmento = (e: ReturnType<typeof escena>, i: number) => Array.from(e.trazos.subarray(i * FLOTANTES_TRAZO, (i + 1) * FLOTANTES_TRAZO))

describe('construirEscena', () => {
  it('un documento vacío no dibuja nada y no tiene caja', () => {
    const e = escena(documentoVacio())
    expect(e.nTrazos).toBe(0)
    expect(e.nTriangulos).toBe(0)
    expect(e.textos).toEqual([])
    expect(e.caja).toBeNull()
  })

  it('una resistencia son sus 10 tramos desplazados, sus dos textos y su caja con los textos', () => {
    const e = escena(doc([R('r1', 10, -8)]))
    expect(e.nTrazos).toBe(10)
    expect(segmento(e, 0).slice(0, 5)).toEqual([6, -8, 7.5, -8, 0.25])
    expect(e.textos.map((t) => t.texto)).toEqual(['R1', '1 kΩ'])
    // Símbolo x 6..14, y −9..−7; «R1» centrado en (10, −11) y «1 kΩ» en (10, −5), 1.6 de alto: la caja llega de −11.8 a −4.2.
    cerca(e.caja!, { minX: 6, minY: -11.8, maxX: 14, maxY: -4.2 })
  })

  it('el nombre de una etiqueta vertical va dentro de su bandera, girado para leerse de arriba abajo', () => {
    const d = doc([R('r1', 0, 0)])
    d.etiquetas.e = { id: 'e', nombre: 'ALIMENTACION', x: 20, y: 0, rot: 90 }
    const e = escena(d)
    const t = e.textos.find((x) => x.texto === 'ALIMENTACION')!
    expect(t).toMatchObject({ x: 20, giro: 90, alinear: 'izq' })
    expect(t.y).toBeCloseTo(1.4, 9)
    // La caja no se ensancha con el texto: 2 de ancho, el de la bandera.
    expect(e.caja!.maxX).toBeCloseTo(21, 9)
  })

  it('la referencia que choca con un cable se aparta (etiquetasSinChoques)', () => {
    const e = escena(doc([R('r1', 0, 0)], [C('w', [-10, -3], [10, -3])]))
    expect(e.textos.find((t) => t.texto === 'R1')).toMatchObject({ x: 0, y: -5 })
  })

  it('entrega los arcos de salto que dibujó, para que la superposición los siga', () => {
    const e = escena(doc([], [C('h', [0, 0], [10, 0]), C('v', [5, -5], [5, 5])]))
    expect([...e.saltos]).toEqual([['h#0', [5]]])
  })

  it('la pieza girada gira sus trazos', () => {
    const e = escena(doc([R('r1', 0, 0, 90)]))
    expect(segmento(e, 0).slice(0, 4)).toEqual([0, -4, 0, -2.5])
  })

  it('cada tramo de cable es una cápsula del color de cable', () => {
    const e = escena(doc([], [C('c', [0, 0], [10, 0], [10, 10])]))
    expect(e.nTrazos).toBe(2)
    const s = segmento(e, 1)
    expect(s.slice(0, 4)).toEqual([10, 0, 10, 10])
    for (let k = 0; k < 4; k++) expect(s[5 + k]).toBeCloseTo(PALETA_CLARA.cable[k], 6)
  })

  it('un cruce sin unión dibuja el arco en el horizontal', () => {
    const e = escena(doc([], [C('h', [0, 0], [10, 0]), C('v', [5, -5], [5, 5])]))
    expect(e.nTrazos).toBe(11)
    const ys = Array.from({ length: e.nTrazos }, (_, i) => segmento(e, i)[1])
    expect(ys.some((y) => Math.abs(y + 0.8) < 1e-6)).toBe(true)
  })

  it('una T dibuja un punto de unión y ningún arco', () => {
    const e = escena(doc([], [C('h', [0, 0], [10, 0]), C('v', [5, 0], [5, 5])]))
    expect(e.nTrazos).toBe(3)
    const u = segmento(e, 2)
    expect(u.slice(0, 4)).toEqual([5, 0, 5, 0])
    expect(u[4]).toBeCloseTo(0.8, 6)
  })

  it('la etiqueta de red es una bandera de 5 tramos con su nombre y su punto de conexión (hueco suelta: 16 tramos)', () => {
    const d = doc()
    d.etiquetas.e = { id: 'e', nombre: 'VCC', x: 0, y: 0, rot: 0 }
    const e = escena(d)
    expect(e.nTrazos).toBe(5 + 16)
    expect(e.textos).toMatchObject([{ texto: 'VCC', x: 1.4, y: 0, alinear: 'izq' }])
  })

  it('contorno de la etiqueta: el de siempre sin el campo, el de una tinta, o ninguno', () => {
    const d = doc()
    d.etiquetas.e = { id: 'e', nombre: 'VCC', x: 0, y: 0, rot: 0 }
    const color = (e: ReturnType<typeof escena>) => Array.from(e.trazos.subarray(5, 9))
    const igual = (a: number[], b: readonly number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 5))
    igual(color(escena(d)), PALETA_CLARA.pieza)
    d.etiquetas.e = { ...d.etiquetas.e, formato: { contorno: 'azul' } }
    igual(color(escena(d)), PALETA_CLARA.textoAzul)
    d.etiquetas.e = { ...d.etiquetas.e, formato: { contorno: 'ninguno' } }
    const sin = escena(d)
    // Sin contorno queda solo su punto de conexión: dice dónde se le pega un cable.
    expect(sin.nTrazos).toBe(16)
    // El texto sigue ahí y su tinta no depende del contorno.
    expect(sin.textos).toMatchObject([{ texto: 'VCC', color: 'textoTinta' }])
  })

  it('contorno de la nota: gris sin el campo, el de una tinta, o ninguno (la caja y el texto siguen)', () => {
    const d = doc()
    d.notas.n = { id: 'n', x: 0, y: 0, ancho: 20, texto: 'hola' }
    const color = (e: ReturnType<typeof escena>) => Array.from(e.trazos.subarray(5, 9))
    const igual = (a: number[], b: readonly number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 5))
    const base = escena(d)
    expect(base.nTrazos).toBe(4)
    igual(color(base), PALETA_CLARA.valor)
    d.notas.n = { ...d.notas.n, formato: { contorno: 'rojo' } }
    igual(color(escena(d)), PALETA_CLARA.textoRojo)
    d.notas.n = { ...d.notas.n, formato: { contorno: 'ninguno' } }
    const sin = escena(d)
    expect(sin.nTrazos).toBe(0)
    expect(sin.caja).toEqual(base.caja)
    expect(sin.textos).toHaveLength(1)
  })

  it('la nota es una caja con un texto por renglón', () => {
    const d = doc()
    d.notas.n = { id: 'n', x: 0, y: 0, ancho: 8, texto: 'hola\nmundo' }
    const e = escena(d)
    expect(e.nTrazos).toBe(4)
    expect(e.textos).toMatchObject([
      { texto: 'hola', x: 0.8, y: expect.closeTo(1.6, 9), alinear: 'izq', fuente: 'interfaz', tamaño: 1.6, color: 'textoTinta' },
      { texto: 'mundo', x: 0.8, y: expect.closeTo(3.6, 9), alinear: 'izq' }
    ])
  })

  it('una nota con formato: fuente, tinta, negrita y cursiva, centrada y subrayada', () => {
    const d = doc()
    d.notas.n = { id: 'n', x: 0, y: 0, ancho: 20, texto: 'hola', formato: { fuente: 'serif', tinta: 'rojo', negrita: true, cursiva: true, alinear: 'centro', subrayado: true } }
    const [t] = escena(d).textos
    expect(t).toMatchObject({ texto: 'hola', fuente: 'serif', color: 'textoRojo', negrita: true, cursiva: true, alinear: 'izq' })
    expect(t.x).toBeCloseTo(0.8 + (20 - 1.6 - t.ancho!) / 2, 9)
    expect(t.subrayado).toBeCloseTo(t.ancho!, 9)
  })

  it('justificada: una palabra por trozo, el renglón llega al borde y el último queda a la izquierda', () => {
    const d = doc()
    d.notas.n = { id: 'n', x: 0, y: 0, ancho: 12, texto: 'uno dos tres cuatro cinco seis', anchoFijo: true, formato: { alinear: 'just', fuente: 'mono' } }
    const ts = escena(d).textos
    const primero = ts.filter((t) => t.y === ts[0].y)
    expect(primero.length).toBeGreaterThan(1)
    const ultimo = primero[primero.length - 1]
    expect(ultimo.x + ultimo.ancho!).toBeCloseTo(12 - 0.8, 9)
    const final = ts.filter((t) => t.y === ts[ts.length - 1].y)
    expect(final).toHaveLength(1)
    expect(final[0].x).toBeCloseTo(0.8, 9)
  })

  it('una nota con alto fijado dibuja su caja más alta y deja el texto arriba (y lo mismo la exporta)', () => {
    const d = doc()
    d.notas.n = { id: 'n', x: 0, y: 0, ancho: 20, texto: 'hola', anchoFijo: true }
    const sin = escena(d)
    d.notas.n = { ...d.notas.n, alto: 30 }
    const con = escena(d)
    expect(sin.caja!.maxY).toBeLessThan(30)
    expect(con.caja!.maxY).toBe(30)
    expect(con.textos.map((t) => t.y)).toEqual(sin.textos.map((t) => t.y))
  })

  it('una etiqueta con formato lleva su fuente, tinta y tamaño, y su caja crece', () => {
    const d = doc()
    d.etiquetas.e = { id: 'e', nombre: 'VCC', x: 0, y: 0, rot: 0, formato: { tam: 5, tinta: 'azul', fuente: 'sans' } }
    const e = escena(d)
    expect(e.textos[0]).toMatchObject({ texto: 'VCC', fuente: 'interfaz', color: 'textoAzul', tamaño: 4 })
    expect(e.caja!.maxY).toBeCloseTo(2.5, 9)
  })

  it('un botón presionado y un interruptor cerrado se dibujan con su símbolo accionado (accionado.svg)', () => {
    for (const [tipo, prop, abierto, cerrado] of [['boton', 'presionado', 'no', 'sí'], ['interruptor', 'estado', 'abierto', 'cerrado']]) {
      expect(lib.get(tipo)!.geometriaAccionada, tipo).toBeDefined()
      const con = (v: string) => escena(doc([{ ...R('s', 0, 0, 0, tipo), props: { [prop]: v } }]))
      const trazos = (e: ReturnType<typeof escena>) => Array.from(e.trazos.subarray(0, e.nTrazos * FLOTANTES_TRAZO)).join()
      expect(trazos(con(cerrado)), tipo).not.toBe(trazos(con(abierto)))
      // Sin la propiedad, la opción por omisión (suelto o abierto).
      expect(trazos(escena(doc([R('s', 0, 0, 0, tipo)]))), tipo).toBe(trazos(con(abierto)))
    }
  })

  it('una pieza desconocida es un cuadro rotulado', () => {
    const e = escena(doc([R('x', 0, 0, 0, 'zzz')]))
    expect(e.nTrazos).toBe(4)
    expect(e.textos.map((t) => t.texto)).toEqual(['desconocida: zzz'])
    // El rótulo (16 caracteres, 15.36 de ancho) es más ancho que el cuadro.
    cerca(e.caja!, { minX: -7.68, minY: -2, maxX: 7.68, maxY: 2 })
  })

  it('el triángulo del diodo va en los rellenos', () => {
    expect(escena(doc([R('d1', 0, 0, 0, 'diodo')])).nTriangulos).toBe(1)
  })

  it('una etiqueta de red sin nombre no emite texto', () => {
    const d = doc()
    d.etiquetas.e = { id: 'e', nombre: '', x: 0, y: 0, rot: 0 }
    const e = escena(d)
    expect(e.nTrazos).toBe(5 + 16)
    expect(e.textos).toEqual([])
  })
})

describe('construirEscena: figuras', () => {
  const marco = (extra: Partial<Figura> = {}): Figura => ({ id: 'f1', tipo: 'rectangulo', x1: -40, y1: -30, x2: 40, y2: 30, orden: 0, ...extra })

  it('van en su propia capa (normal y atenuada), no en la del circuito, y cuentan en la caja', () => {
    const d = doc([R('r1', 0, 0)])
    const sin = escena(d)
    d.figuras = { f1: marco() }
    const con = escena(d)
    expect(con.nTrazos).toBe(sin.nTrazos)
    expect(con.nTriangulos).toBe(sin.nTriangulos)
    expect(con.figuras.nTrazos).toBeGreaterThan(0)
    expect(con.figurasAtenuadas.nTrazos).toBe(con.figuras.nTrazos)
    // La atenuada se arma la primera vez que se pide (al simular) y queda guardada en la escena.
    expect(Object.getOwnPropertyDescriptor(con, 'figurasAtenuadas')?.get).toBeTypeOf('function')
    expect(con.figurasAtenuadas).toBe(con.figurasAtenuadas)
    expect(con.figurasSimplificadas).toBe(false)
    expect(con.caja!.minX).toBeLessThan(-40)
    expect(con.caja!.maxY).toBeGreaterThan(30)
    expect(sin.figuras.nTrazos).toBe(0)
  })

  it('se dibujan del fondo al frente: la de menor orden primero', () => {
    const d = documentoVacio()
    d.figuras = { a: marco({ id: 'a', orden: 5, tinta: 'rojo' }), b: marco({ id: 'b', orden: -2, tinta: 'azul' }) }
    const e = escena(d)
    const rojo = PALETA_CLARA.textoRojo, azul = PALETA_CLARA.textoAzul
    const color = (i: number) => Array.from(e.figuras.trazos.subarray(i * FLOTANTES_TRAZO + 5, i * FLOTANTES_TRAZO + 9))
    const cerca4 = (a: number[], b: readonly number[]) => a.every((v, k) => Math.abs(v - b[k]) < 1e-5)
    expect(cerca4(color(0), azul)).toBe(true)
    expect(cerca4(color(e.figuras.nTrazos - 1), rojo)).toBe(true)
  })

  it('la opacidad de una figura llega a la escena (y con ella a la exportación); con sinOpacidad va opaca', () => {
    const d = documentoVacio()
    d.figuras = { f1: marco({ tinta: 'rojo', opacidad: 25 }) }
    const color = (e: ReturnType<typeof escena>) => Array.from(e.figuras.trazos.subarray(5, 9))
    const esperado = mezclar(PALETA_CLARA.textoRojo, PALETA_CLARA.lienzo, 0.25)
    color(escena(d)).forEach((v, k) => expect(v).toBeCloseTo(esperado[k], 5))
    const opaca = construirEscena(d, lib, calcularConexiones(d, lib), PALETA_CLARA, { sinOpacidad: true })
    color(opaca).forEach((v, k) => expect(v).toBeCloseTo(PALETA_CLARA.textoRojo[k], 5))
  })

  it('un documento con solo figuras tiene caja (se puede encuadrar y exportar)', () => {
    const d = documentoVacio()
    d.figuras = { f1: marco() }
    cerca(escena(d).caja!, { minX: -40.1, minY: -30.1, maxX: 40.1, maxY: 30.1 })
  })
})

describe('construirEscena: muchas figuras', () => {
  it('5,000 elipses punteadas enormes: la capa queda acotada y la escena dice que simplificó', () => {
    const d = documentoVacio()
    d.figuras = {}
    for (let i = 0; i < 5000; i++) d.figuras[`f${i}`] = { id: `f${i}`, tipo: 'elipse', x1: -i, y1: -i, x2: 4000 + i, y2: 3000 + i, orden: i, trazo: 'puntos' }
    const t0 = performance.now()
    const e = escena(d)
    expect(performance.now() - t0).toBeLessThan(5000)
    expect(e.figurasSimplificadas).toBe(true)
    expect(e.figuras.nTrazos).toBeLessThanOrEqual(MAX_TRAMOS_FIGURAS + 5000 * 24)
  })
})

describe('las sondas en la escena', () => {
  const conSondas = (): Documento => ({
    ...doc([R('r1', 0, 0)], [C('c', [4, 0], [20, 0])]),
    piezas: { r1: R('r1', 0, 0), o: { id: 'o', tipo: 'osciloscopio', ref: 'XSC1', x: 80, y: 0, rot: 0, espejo: false, props: {} } },
    sondas: {
      a: { id: 'a', tipo: 'osciloscopio', x: 12, y: 0, instrumento: 'o', entrada: 'A' },
      v: { id: 'v', tipo: 'voltaje', x: 16, y: 0 }
    }
  })
  it('dibuja cada bandera con su letra, y su caja entra en la del dibujo', () => {
    const d = conSondas()
    const e = escena(d)
    expect(e.banderas.size).toBe(2)
    const letras = e.textos.filter((t) => t.texto === 'A' || t.texto === 'V').map((t) => [t.texto, t.color])
    expect(letras).toEqual(expect.arrayContaining([['A', 'lienzo'], ['V', 'pieza']]))
    // El rótulo de la entrada A del osciloscopio dice de dónde mide.
    expect(e.textos.some((t) => t.texto === 'A ← R1:2' && t.color === 'sondaA')).toBe(true)
    for (const b of e.banderas.values()) {
      expect(e.caja!.minY).toBeLessThanOrEqual(b.caja.minY)
      expect(e.caja!.maxX).toBeGreaterThanOrEqual(b.caja.maxX)
    }
  })
  it('sin sondas dibuja lo mismo que antes, y una lista vacía no cambia nada', () => {
    const d = conSondas()
    const sin = { ...d, sondas: undefined }
    const vacia = { ...d, sondas: {} }
    expect(Array.from(escena(vacia).trazos)).toEqual(Array.from(escena(sin).trazos))
    expect(escena(sin).banderas.size).toBe(0)
  })
})

describe('el punto de conexión de las etiquetas (B1)', () => {
  const conEtiqueta = (x: number, y: number): Documento => ({ ...doc([R('r1', 0, 0)], [C('c', [4, 0], [20, 0])]), etiquetas: { e: { id: 'e', nombre: 'VIN', x, y, rot: 0 } } })
  /** Los tramos de la escena que empiezan a menos de `r` del punto. */
  const cerca = (e: ReturnType<typeof escena>, x: number, y: number, r: number) =>
    Array.from({ length: e.nTrazos }, (_, i) => segmento(e, i)).filter((s) => Math.hypot(s[0] - x, s[1] - y) <= r)
  it('lleno con un cable en su punto, hueco suelto', () => {
    const conectada = cerca(escena(conEtiqueta(20, 0)), 20, 0, 0.01)
    expect(conectada.some((s) => s[0] === s[2] && s[1] === s[3] && s[4] >= 1)).toBe(true)
    const suelta = cerca(escena(conEtiqueta(40, 10)), 40, 10, 0.6)
    expect(suelta.filter((s) => Math.abs(Math.hypot(s[0] - 40, s[1] - 10) - 0.55) < 1e-6).length).toBeGreaterThanOrEqual(12)
  })
})
