import { describe, expect, it } from 'vitest'
import type { AjustesOsciloscopio } from '../../instrumentos/ajustes'
import { CANALES_PANTALLA, CIFRAS_COLUMNA, type PantallaSab } from '../../sim/protocoloInstrumentos'
import { colorDeCanal, COLORES_CLAROS, COLORES_OSCUROS } from '../colores'
import { coloresPantalla, dibujarPantalla, dibujosDePantalla, type Lienzo2D } from './dibujar'
import { MARCO, marcoDePantalla } from './marco'

/** Un contexto que anota lo que se le pide. */
function contexto() {
  const ops: { op: string; args: number[]; estilo: string; guiones: number[] }[] = []
  let guiones: number[] = []
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
    fillRect: (...a: number[]) => ops.push({ op: 'fillRect', args: a, estilo: String(ctx.fillStyle), guiones }),
    beginPath: () => ops.push({ op: 'beginPath', args: [], estilo: String(ctx.strokeStyle), guiones }),
    moveTo: (...a: number[]) => ops.push({ op: 'moveTo', args: a, estilo: String(ctx.strokeStyle), guiones }),
    lineTo: (...a: number[]) => ops.push({ op: 'lineTo', args: a, estilo: String(ctx.strokeStyle), guiones }),
    stroke: () => ops.push({ op: 'stroke', args: [], estilo: String(ctx.strokeStyle), guiones }),
    fill: () => ops.push({ op: 'fill', args: [], estilo: String(ctx.fillStyle), guiones }),
    closePath: () => {},
    rect: () => {},
    clip: () => {},
    save: () => {},
    restore: () => {},
    setLineDash: (g: number[]) => void (guiones = g),
    translate: (...a: number[]) => ops.push({ op: 'translate', args: a, estilo: '', guiones }),
    measureText: (t: string) => ({ width: t.length * 7 }),
    fillText: (t: string, ...a: number[]) => ops.push({ op: `texto ${t}`, args: a, estilo: String(ctx.fillStyle), guiones })
  }
  return { ctx: ctx as unknown as Lienzo2D, ops }
}
/** Lo que se dibuja antes de las marcas (hasta el último trazo antes de la primera figura rellena): la retícula y las trazas. */
function trazas<T extends { op: string }>(ops: T[]): T[] {
  const f = ops.findIndex((o) => o.op === 'fill')
  let s = (f < 0 ? ops.length : f) - 1
  while (s >= 0 && ops[s].op !== 'stroke') s--
  return ops.slice(0, s + 1)
}

const ajustes = (o: Partial<AjustesOsciloscopio> = {}): AjustesOsciloscopio => ({
  canales: (['A', 'B', 'C', 'D'] as const).map((canal, k) => ({ canal, on: k === 0, vdiv: 1, pos: 0, acople: 'DC' as const })),
  matematico: false, base: 1e-3, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0.5, modo: 'auto' }, medidas: [], ideal: false, ...o
})

/** Una pantalla de `n` columnas con el canal A constante en `v` (y B en 0); `vacias` deja esas columnas sin datos. */
function pantalla(n: number, v: number, vacias: number[] = []): PantallaSab {
  const columnas = new Float32Array(CANALES_PANTALLA * n * CIFRAS_COLUMNA)
  for (let c = 0; c < CANALES_PANTALLA; c++)
    for (let j = 0; j < n; j++) {
      const o = (c * n + j) * CIFRAS_COLUMNA
      const x = c === 0 ? v : 0
      columnas.set([x, x, x, x, c === 0 && vacias.includes(j) ? 8 : 0], o)
    }
  return {
    version: 1, t0: 0, dt: 1e-2 / n, ncol: n, tDisparo: 1e-3, estado: 'disparado', tCaptura: 1e-2, csv: { t0: 0, dt: 0, n: 0 },
    completoHasta: Array(CANALES_PANTALLA).fill(1e-2), medidas: [], columnas, muestras: new Float32Array(0)
  }
}

describe('pantalla del osciloscopio', () => {
  it('el cursor resaltado (puntero encima, arrastrado o con el foco) se repasa con una línea más gruesa', () => {
    const cursores = { canal: 'A' as const, t: [3e-3, 7e-3] as const, v: [-1, 1] as const }
    const anchos = (resaltado: 't1' | 'v2' | null) => {
      const { ctx, ops } = contexto()
      const anchoDe: number[] = []
      const original = ctx.stroke.bind(ctx)
      ctx.stroke = () => (anchoDe.push(ctx.lineWidth), original())
      dibujarPantalla(ctx, pantalla(100, 1), ajustes(), 800, 480, coloresPantalla('claro'), { dpr: 1, ejes: true, cursores, resaltado })
      return { anchoDe, ops }
    }
    const sin = anchos(null)
    const con = anchos('t1')
    expect(con.anchoDe.length).toBe(sin.anchoDe.length + 1)
    expect(Math.max(...con.anchoDe)).toBeGreaterThanOrEqual(2.5)
    expect(Math.max(...sin.anchoDe)).toBeLessThan(2.5)
    // Un cursor de voltaje resaltado también se repasa.
    expect(anchos('v2').anchoDe.length).toBe(sin.anchoDe.length + 1)
  })

  it('sigue el tema y exporta en blanco con los colores del claro', () => {
    expect(coloresPantalla('claro').fondo).toBe('#F7F6F2')
    expect(coloresPantalla('oscuro').fondo).toBe('#17181B')
    const e = coloresPantalla('oscuro', true)
    expect(e.fondo).toBe('#FFFFFF')
    expect(e.canal.A).toBe(colorDeCanal('claro', 'A'))
  })

  it('el canal A en 1 V con 1 V/div queda una división arriba del centro, en su color', () => {
    const { ctx, ops } = contexto()
    const antes = dibujosDePantalla()
    dibujarPantalla(ctx, pantalla(100, 1), ajustes(), 1000, 800, coloresPantalla('claro'), { dpr: 1 })
    expect(dibujosDePantalla()).toBe(antes + 1)
    const traza = trazas(ops).filter((o) => (o.op === 'moveTo' || o.op === 'lineTo') && o.estilo === colorDeCanal('claro', 'A'))
    expect(traza.length).toBeGreaterThan(100)
    for (const o of traza) expect(o.args[1]).toBeCloseTo(300, 6)
    // La traza empieza en el borde izquierdo de la primera columna.
    expect(traza[0].args[0]).toBeCloseTo(0, 6)
    // La marca de tierra del canal lleva su letra.
    expect(ops.some((o) => o.op === 'texto A')).toBe(true)
  })

  it('las marcas de tierra de dos canales en la misma posición van una junto a la otra, no encimadas', () => {
    const { ctx, ops } = contexto()
    const dos = ajustes({ canales: (['A', 'B', 'C', 'D'] as const).map((canal, k) => ({ canal, on: k < 2, vdiv: 1, pos: 0, acople: 'DC' as const })) })
    dibujarPantalla(ctx, pantalla(100, 1), dos, 1000, 800, coloresPantalla('claro'), { dpr: 1 })
    const [a, b] = ['texto A', 'texto B'].map((t) => ops.find((o) => o.op === t)!)
    // Las dos en el nivel de su tierra (y = 400), con las letras separadas a lo ancho por más que una letra.
    expect(a.args[1]).toBeCloseTo(400, 6)
    expect(b.args[1]).toBeCloseTo(400, 6)
    expect(Math.abs(b.args[0] - a.args[0])).toBeGreaterThan(12)
    // Con otra posición cada una queda en su lugar, sin correrse.
    const { ctx: ctx2, ops: ops2 } = contexto()
    const separadas = ajustes({ canales: (['A', 'B', 'C', 'D'] as const).map((canal, k) => ({ canal, on: k < 2, vdiv: 1, pos: k === 1 ? 2 : 0, acople: 'DC' as const })) })
    dibujarPantalla(ctx2, pantalla(100, 1), separadas, 1000, 800, coloresPantalla('claro'), { dpr: 1 })
    expect(ops2.find((o) => o.op === 'texto A')!.args[0]).toBe(ops2.find((o) => o.op === 'texto B')!.args[0])
  })

  it('la marca de tierra dice el acoplamiento cuando no es DC', () => {
    const { ctx, ops } = contexto()
    const a = ajustes({ canales: (['A', 'B', 'C', 'D'] as const).map((canal, k) => ({ canal, on: k < 3, vdiv: 1, pos: k, acople: (['AC', 'DC', 'GND', 'DC'] as const)[k] })) })
    dibujarPantalla(ctx, pantalla(100, 1), a, 1000, 800, coloresPantalla('claro'), { dpr: 1 })
    const textos = ops.filter((o) => o.op.startsWith('texto ')).map((o) => o.op.slice(6))
    expect(textos).toEqual(expect.arrayContaining(['A AC', 'B', 'C GND']))
    expect(ops.find((o) => o.op === 'texto A AC')!.estilo).toBe(colorDeCanal('claro', 'A'))
  })

  it('una columna vacía corta la traza; un canal apagado no se dibuja', () => {
    const { ctx, ops } = contexto()
    dibujarPantalla(ctx, pantalla(100, 1, [50]), ajustes(), 1000, 800, coloresPantalla('claro'), { dpr: 1 })
    expect(trazas(ops).filter((o) => o.op === 'moveTo' && o.estilo === colorDeCanal('claro', 'A'))).toHaveLength(2)
    expect(ops.some((o) => o.estilo === colorDeCanal('claro', 'B') && o.op === 'lineTo')).toBe(false)
  })

  it('A − B va discontinuo y en gris; la posición sube la traza', () => {
    const { ctx, ops } = contexto()
    const a = ajustes({ matematico: true })
    a.canales[0].pos = 1
    dibujarPantalla(ctx, pantalla(100, 1), a, 1000, 800, coloresPantalla('claro'), { dpr: 1 })
    const m = ops.filter((o) => o.op === 'lineTo' && o.estilo === colorDeCanal('claro', 'M'))
    expect(m.length).toBeGreaterThan(0)
    expect(m[0].guiones.length).toBeGreaterThan(0)
    expect(ops.find((o) => o.op === 'lineTo' && o.estilo === colorDeCanal('claro', 'A'))!.args[1]).toBeCloseTo(200, 6)
    // A − B se lee contra la escala de A, con su posición: su 0 V (la pantalla de prueba no la llena) queda en el 0 V de A.
    expect(m.find((o) => o.args[0] > 10)!.args[1]).toBeCloseTo(300, 6)
  })

  it('sin pantalla dibuja solo el fondo y la retícula', () => {
    const { ctx, ops } = contexto()
    dibujarPantalla(ctx, null, ajustes(), 1000, 800, coloresPantalla('oscuro'), { dpr: 2 })
    expect(ops[0]).toMatchObject({ op: 'fillRect', estilo: '#17181B' })
    expect(ops.some((o) => o.estilo === colorDeCanal('oscuro', 'A'))).toBe(false)
  })
})

describe('con ejes (A1)', () => {
  const dosCanales = () => ajustes({ canales: (['A', 'B', 'C', 'D'] as const).map((canal, k) => ({ canal, on: k < 2, vdiv: k ? 5 : 2, pos: k ? 1 : -3, acople: 'DC' as const })) })
  it('escribe el eje del tiempo arriba y una columna de cifras por canal encendido', () => {
    const { ctx, ops } = contexto()
    const a = dosCanales()
    dibujarPantalla(ctx, pantalla(100, 1), a, 1000, 400, coloresPantalla('claro'), { dpr: 1, ejes: true })
    const textos = ops.filter((o) => o.op.startsWith('texto '))
    const titulo = textos.find((o) => o.op.startsWith('texto Tiempo '))!
    expect(titulo.args[1]).toBeLessThan(MARCO.ejeTiempo)
    expect(textos.some((o) => o.op === 'texto 1 ms por división')).toBe(true)
    const m = marcoDePantalla(a, 1000, 400, 1)
    for (const col of m.columnas) {
      const cifras = textos.filter((o) => o.args[0] > col.x0 && o.args[0] <= col.x1 && o.args[1] >= m.y - 1)
      expect(cifras).toHaveLength(9)
    }
    // La columna de A en el color de texto de su canal, de 14 a −2 (2 V/div, 3 divisiones abajo).
    const cifrasA = textos.filter((o) => o.args[0] > m.columnas[0].x0 && o.args[0] <= m.columnas[0].x1 && o.args[1] >= m.y - 1)
    expect(cifrasA[0].op).toBe('texto 14')
    expect(cifrasA[8].op).toBe('texto −2')
    expect(cifrasA[0].estilo).toBe(coloresPantalla('claro').canalTexto.A)
    // La retícula y las trazas se dibujan dentro del marco.
    expect(ops.some((o) => o.op === 'translate' && o.args[0] === m.x && o.args[1] === m.y)).toBe(true)
  })

  it('las marcas de 0 V van a la izquierda de la retícula, con su letra', () => {
    const { ctx, ops } = contexto()
    const a = dosCanales()
    dibujarPantalla(ctx, pantalla(100, 1), a, 1000, 400, coloresPantalla('claro'), { dpr: 1, ejes: true })
    const m = marcoDePantalla(a, 1000, 400, 1)
    const letraA = ops.filter((o) => o.op === 'texto A' && o.args[0] < m.x)
    expect(letraA).toHaveLength(1)
    expect(letraA[0].args[1]).toBeCloseTo(m.y + m.h / 2 + 3 * (m.h / 8), 6)
  })

  it('sin pantalla también escribe los ejes, y nada sale del lienzo', () => {
    for (const p of [null, pantalla(100, 1)]) {
      const { ctx, ops } = contexto()
      dibujarPantalla(ctx, p, dosCanales(), 640, 240, coloresPantalla('oscuro'), { dpr: 1, ejes: true })
      const textos = ops.filter((o) => o.op.startsWith('texto '))
      expect(textos.length).toBeGreaterThan(20)
      for (const o of textos) {
        expect(o.args[0]).toBeGreaterThanOrEqual(0)
        expect(o.args[0]).toBeLessThanOrEqual(640)
        expect(o.args[1]).toBeGreaterThanOrEqual(0)
        expect(o.args[1]).toBeLessThanOrEqual(240)
      }
    }
  })

  it('el acoplamiento que no es DC se ve arriba de la columna de su canal', () => {
    const { ctx, ops } = contexto()
    const a = dosCanales()
    a.canales[0].acople = 'AC'
    a.canales[1].acople = 'GND'
    dibujarPantalla(ctx, pantalla(100, 1), a, 1000, 400, coloresPantalla('claro'), { dpr: 1, ejes: true })
    const m = marcoDePantalla(a, 1000, 400, 1)
    const ac = ops.find((o) => o.op === 'texto AC')!
    expect(ac.args[0]).toBeLessThanOrEqual(m.columnas[0].x1)
    expect(ac.args[1]).toBeLessThan(m.y - 16)
    expect(ops.find((o) => o.op === 'texto GND')!.args[0]).toBeGreaterThan(m.columnas[1].x0)
  })
})

const COLORES_TEMA = { claro: COLORES_CLAROS, oscuro: COLORES_OSCUROS }

describe('opciones de aspecto de la pantalla', () => {
  const dib = (a: AjustesOsciloscopio, o: Partial<Parameters<typeof dibujarPantalla>[6]>, c = coloresPantalla('claro')) => {
    const { ctx, ops } = contexto()
    dibujarPantalla(ctx, pantalla(100, 1), a, 1000, 480, c, { dpr: 1, ejes: true, ...o })
    return ops
  }
  const dos = () => ajustes({ canales: (['A', 'B', 'C', 'D'] as const).map((canal, k) => ({ canal, on: k < 2, vdiv: 1, pos: 0, acople: 'DC' as const })) })
  const lineas = (ops: ReturnType<typeof dib>) => ops.filter((o) => o.op === 'moveTo' || o.op === 'lineTo').length

  it('por omisión no cambia nada: sin marcas ni opciones el dibujo es el de siempre', () => {
    const a = dib(dos(), {})
    const b = dib(dos(), { marcas: false, grosor: 1.5, marco: { ejeX: 'arriba', lados: { A: 'izquierda', B: 'izquierda' } } })
    expect(b).toEqual(a)
  })
  it('las marcas agregan rayitas en el borde de la retícula y en el eje del tiempo', () => {
    expect(lineas(dib(dos(), { marcas: true }))).toBeGreaterThan(lineas(dib(dos(), {})) + 9 + 11)
  })
  it('una escala a la derecha pone sus cifras a la derecha de la retícula; en medio, sobre su centro', () => {
    const a = dos()
    const m = marcoDePantalla(a, 1000, 480, 1, { lados: { A: 'derecha', B: 'centro' } })
    const ops = dib(a, { marco: { lados: { A: 'derecha', B: 'centro' } } })
    const cifraA = ops.find((o) => o.op === 'texto A V')!
    expect(cifraA.args[0]).toBeGreaterThan(m.x + m.w)
    const cifraB = ops.find((o) => o.op === 'texto B V')!
    expect(cifraB.args[0]).toBeLessThanOrEqual(m.x + m.w / 2)
    expect(cifraB.args[0]).toBeGreaterThan(m.x)
  })
  it('el eje del tiempo abajo lleva sus cifras bajo la retícula; en medio, bajo la línea central', () => {
    const a = dos()
    const abajo = marcoDePantalla(a, 1000, 480, 1, { ejeX: 'abajo' })
    const op1 = dib(a, { marco: { ejeX: 'abajo' } })
    const t = op1.find((o) => o.op.startsWith('texto Tiempo'))!
    expect(t.args[1]).toBeGreaterThan(abajo.y + abajo.h)
    const medio = marcoDePantalla(a, 1000, 480, 1, { ejeX: 'centro' })
    const op2 = dib(a, { marco: { ejeX: 'centro' } })
    const cifra = op2.find((o) => o.op === 'texto 0' && o.args[1] > medio.lineaEje)!
    expect(cifra.args[1]).toBeLessThan(medio.lineaEje + 20)
  })
  it('un canal negro se dibuja con el token negro del tema de la gráfica, claro u oscuro', () => {
    for (const tema of ['claro', 'oscuro'] as const) {
      const c = coloresPantalla(tema, false, { A: 'negro' })
      expect(c.canal.A).toBe(COLORES_TEMA[tema].negro)
      const ops = dib(dos(), {}, c)
      expect(ops.some((o) => o.op === 'lineTo' && o.estilo === COLORES_TEMA[tema].negro)).toBe(true)
    }
  })
  it('el grosor de la línea y la rejilla apagada llegan al dibujo', () => {
    const { ctx } = contexto()
    const anchos: number[] = []
    const original = ctx.stroke.bind(ctx)
    ctx.stroke = () => (anchos.push(ctx.lineWidth), original())
    dibujarPantalla(ctx, pantalla(100, 1), dos(), 1000, 480, coloresPantalla('claro'), { dpr: 1, ejes: true, grosor: 3 })
    expect(Math.max(...anchos)).toBe(3)
    expect(lineas(dib(dos(), { sinReticula: true }))).toBeLessThan(lineas(dib(dos(), {})))
  })
})

describe('la traza sigue a la base de tiempo aunque la pantalla sea de otra', () => {
  /** La mayor x de la traza del canal A (por su color) al dibujar `p` con `base`, en una pantalla de 800 px sin ejes. */
  const xMaxima = (base: number): number => {
    const { ctx, ops } = contexto()
    const c = coloresPantalla('claro')
    dibujarPantalla(ctx, pantalla(100, 1), ajustes({ base }), 800, 480, c, { dpr: 1, ejes: false })
    const xs = trazas(ops).filter((o) => (o.op === 'lineTo' || o.op === 'moveTo') && o.estilo === c.canal.A).map((o) => o.args[0])
    return Math.max(...xs)
  }
  it('con la base de la captura, la traza llena la pantalla', () => {
    expect(xMaxima(1e-3)).toBeCloseTo(800, 3)
  })
  it('al acercar (base a la mitad) la misma captura se estira al doble y se recorta en el borde, sin esperar otra pantalla', () => {
    expect(xMaxima(5e-4)).toBeCloseTo(1600, 3)
  })
  it('al alejar (base al doble) la captura ocupa solo la mitad de la pantalla', () => {
    expect(xMaxima(2e-3)).toBeCloseTo(400, 3)
  })
})

describe('la pantalla X-Y', () => {
  /** A constante en 1 V y B constante en 2 V, ambos con 1 V por división, sin retícula ni ejes. */
  const puntosDe = (modoXY: 'yt' | 'ba' | 'ab') => {
    const n = 4
    const p = pantalla(n, 1)
    for (let j = 0; j < n; j++) p.columnas.set([2, 2, 2, 2, 0], (n + j) * CIFRAS_COLUMNA)
    const { ctx, ops } = contexto()
    dibujarPantalla(ctx, p, ajustes({ modoXY, canales: (['A', 'B', 'C', 'D'] as const).map((canal, k) => ({ canal, on: k < 2, vdiv: 1, pos: 0, acople: 'DC' as const })) }), 800, 480, coloresPantalla('claro'), { dpr: 1, sinReticula: true })
    return ops.filter((o) => o.op === 'moveTo' || o.op === 'lineTo').map((o) => o.args)
  }
  it('B/A lleva A en horizontal y B en vertical, cada uno con su escala', () => {
    const q = puntosDe('ba')
    expect(q).toContainEqual([480, 120])
    expect(q).not.toContainEqual([400 + 2 * 80, 240 - 1 * 60])
  })
  it('A/B los intercambia', () => {
    const q = puntosDe('ab')
    expect(q).toContainEqual([400 + 2 * 80, 240 - 1 * 60])
  })
  it('Y/T no cambia: la traza corre a lo ancho', () => {
    const xs = puntosDe('yt').map((x) => x[0])
    expect(new Set(xs).size).toBeGreaterThan(1)
  })
})
