import type { Documento, Id } from '../doc/tipos'
import { pinesEnMundo } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'
import { clavePin, porId, type Conexiones } from './conexiones'

/** Corriente de cada tramo: el motor da la de cada terminal y ve la red como un nodo, así que se reparte suponiendo
 * resistencia proporcional al largo. Un árbol de expansión da las aristas por subárbol y los lazos salen de la ley de
 * voltajes (laplaciano del tamaño del número de lazos). */

/** Un tramo de cable entre dos puntos de su red: lleva una sola corriente, de (x0, y0) hacia (x1, y1) si es positiva. */
export interface Tramo {
  cable: Id
  /** El segmento del cable (el de `claveTramo` de `lienzo/saltos.ts`). */
  segmento: number
  x0: number
  y0: number
  x1: number
  y1: number
  /** Largo en unidades de rejilla fina. */
  largo: number
  red: number
}

/** Dónde entra la corriente de una casilla de terminal de la netlist: su red del documento y su pin («pieza:pin»), si tiene. */
export interface Puerto {
  red: number
  pin: string | null
  /** Elemento del motor del terminal y su orientación (1 el primero, −1 los demás). Con alterna pura la media es casi cero
   * y su signo no sirve:
   * se usa el signo de la corriente instantánea por esta orientación, que en cada instante cumple la ley de corrientes. */
  elemento?: number
  signo?: number
}

/** Resistencia de la unión de un punto con nombre al vértice virtual de su red, en unidades de largo. */
export const R_VIRTUAL = 1e-3
/** Lazos de cable por red: con más, la red va sin flechas (`sinFlechas`) en lugar de armar un sistema grande. */
export const MAX_LAZOS = 32

/** Una arista: de `a` a `b`, con su resistencia y el tramo que dibuja (−1 la unión de un punto con nombre a su virtual). */
interface Arista {
  a: number
  b: number
  r: number
  tramo: number
}

/** Lo que el reparto guarda de cada red. */
interface RedReparto {
  /** Vértices de la red en orden de recorrido (el primero es la raíz) y la arista de cada uno hacia su padre (con signo). */
  orden: Int32Array
  padre: Int32Array
  /** +1 si la arista hacia el padre va del padre al hijo (de `a` a `b`), −1 al revés. */
  sentido: Int8Array
  /** Las aristas que cierran lazos, sus lazos (arista y sentido) y la inversa de la matriz de resistencias de los lazos. */
  cuerdas: number[]
  lazos: { arista: number; signo: number }[][]
  rInv: Float64Array
  /** Lo que la corriente del árbol suma de voltaje en cada lazo (de trabajo, para no reservar en cada lectura). */
  e: Float64Array
}

export interface Reparto {
  tramos: readonly Tramo[]
  /** Redes que no llevan flechas y por qué. */
  sinFlechas: ReadonlyMap<number, 'lazos'>
  /** Corriente media de cada tramo (punto 0 a 1) y su media absoluta, con las medias por terminal (`medias`, `absolutas`) en el orden de los puertos. */
  /** `instantaneas`: corriente del último paso de cada elemento, para el signo de las casillas de media casi cero. */
  repartir(medias: ArrayLike<number>, absolutas: ArrayLike<number>, media: Float64Array, absoluta: Float64Array, instantaneas?: ArrayLike<number>): void
  /** Pruebas: la mayor suma de corrientes en un vértice (lo que entra por tramos, uniones y terminales) con estas medias. */
  residuo(medias: ArrayLike<number>): number
}

const DESPLAZO = 2 ** 20
/** Clave numérica de un punto de coordenadas enteras hasta ±2^20 (las que admite un `.kir`). */
const clave = (x: number, y: number) => (x + DESPLAZO) * 2 ** 21 + (y + DESPLAZO)

/** Arma el reparto de las redes con cables del documento para la netlist cuyos terminales entran por `puertos`. */
export function armarReparto(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, puertos: readonly Puerto[]): Reparto {
  const tramos: Tramo[] = []
  const aristas: Arista[] = []
  /** Vértice de cada punto, por red; los vértices de todas las redes comparten numeración. */
  const verticeDe: Map<number, number>[] = con.redes.map(() => new Map())
  /** Las coordenadas de cada vértice (el virtual no tiene). */
  const vx: number[] = [], vy: number[] = []
  let nVertices = 0
  const vertice = (red: number, x: number, y: number) => {
    const m = verticeDe[red]
    const k = clave(x, y)
    let v = m.get(k)
    if (v === undefined) {
      m.set(k, (v = nVertices++))
      vx.push(x)
      vy.push(y)
    }
    return v
  }
  /** Vértice virtual de cada red con puntos con nombre (−1 si no tiene). */
  const virtual = new Int32Array(con.redes.length).fill(-1)
  const nombrados: number[][] = con.redes.map(() => [])
  const pinVertice = new Map<string, number>()
  /** Pines de tierras y terminales de alimentación: lo que entra «por» ellos entra por el virtual de su red. */
  const pinDeNombre = new Set<string>()

  // Pines y puntos con nombre (tierras, terminales con nombre y etiquetas con nombre).
  for (const p of Object.values(doc.piezas).sort(porId)) {
    const def = lib.get(p.tipo)
    if (!def) continue
    const m = def.modelo
    for (const pin of pinesEnMundo(p, def)) {
      const k = clavePin(p.id, pin.id)
      const red = con.redDePin.get(k)
      if (red === undefined) continue
      const v = vertice(red, pin.x, pin.y)
      pinVertice.set(k, v)
      const conNombre = (m?.tipo === 'tierra' && m.pin === pin.id) || (m?.tipo === 'alimentacion' && m.pin === pin.id && (p.props[m.nombre] ?? def.props.find((d) => d.id === m.nombre)?.defecto ?? '').trim() !== '')
      if (conNombre) {
        nombrados[red].push(v)
        pinDeNombre.add(k)
      }
    }
  }
  // Un instrumento unido por sonda entra a su red en el punto de la sonda, no en la posición de su pin (que no toca ningún cable).
  for (const s of Object.values(doc.sondas ?? {}).sort(porId)) {
    if (!s.instrumento || !s.entrada) continue
    const k = clavePin(s.instrumento, s.entrada)
    const red = con.redDePin.get(k)
    if (red === undefined || con.redDeSonda.get(s.id) !== red) continue
    pinVertice.set(k, vertice(red, s.x, s.y))
  }
  for (const e of Object.values(doc.etiquetas).sort(porId)) {
    const red = con.redDeEtiqueta.get(e.id)
    if (red === undefined) continue
    const v = vertice(red, e.x, e.y)
    if (e.nombre.trim() !== '') nombrados[red].push(v)
  }

  // Los puntos de cada red que parten un tramo: pines, etiquetas y puntas de cable (como en `calcularConexiones`).
  const cables = Object.values(doc.cables).sort(porId)
  const interes: Map<number, { xs: Map<number, number[]>; ys: Map<number, number[]> }> = new Map()
  const anotar = (red: number, x: number, y: number) => {
    let i = interes.get(red)
    if (!i) interes.set(red, (i = { xs: new Map(), ys: new Map() }))
    const f = i.xs.get(y)
    if (f) f.push(x)
    else i.xs.set(y, [x])
    const c = i.ys.get(x)
    if (c) c.push(y)
    else i.ys.set(x, [y])
  }
  for (const [k, v] of pinVertice) anotar(con.redDePin.get(k)!, vx[v], vy[v])
  for (const e of Object.values(doc.etiquetas)) {
    const red = con.redDeEtiqueta.get(e.id)
    if (red !== undefined) anotar(red, e.x, e.y)
  }
  for (const c of cables) {
    const red = con.redDeCable.get(c.id)
    if (red === undefined || c.puntos.length < 2) continue
    anotar(red, c.puntos[0].x, c.puntos[0].y)
    anotar(red, c.puntos[c.puntos.length - 1].x, c.puntos[c.puntos.length - 1].y)
  }
  for (const i of interes.values()) {
    for (const l of i.xs.values()) l.sort((a, b) => a - b)
    for (const l of i.ys.values()) l.sort((a, b) => a - b)
  }

  // Los tramos: cada segmento de cable partido en los puntos de interés de su red que caen dentro de él.
  for (const c of cables) {
    const red = con.redDeCable.get(c.id)
    if (red === undefined) continue
    const it = interes.get(red)
    for (let s = 1; s < c.puntos.length; s++) {
      const a = c.puntos[s - 1], b = c.puntos[s]
      if (a.x === b.x && a.y === b.y) continue
      const cortes: number[] = []
      if (it && a.y === b.y) for (const x of it.xs.get(a.y) ?? []) if (x > Math.min(a.x, b.x) && x < Math.max(a.x, b.x)) cortes.push(x)
      if (it && a.x === b.x) for (const y of it.ys.get(a.x) ?? []) if (y > Math.min(a.y, b.y) && y < Math.max(a.y, b.y)) cortes.push(y)
      // Los cortes en el sentido del segmento, sin repetir.
      const horizontal = a.y === b.y
      const desde = horizontal ? a.x : a.y, hasta = horizontal ? b.x : b.y
      const unicos = [...new Set(cortes)].sort((p, q) => (hasta > desde ? p - q : q - p))
      let px = a.x, py = a.y
      for (const corte of [...unicos, null]) {
        const qx = corte === null ? b.x : horizontal ? corte : a.x
        const qy = corte === null ? b.y : horizontal ? a.y : corte
        const largo = Math.hypot(qx - px, qy - py)
        if (largo > 0) {
          const t = tramos.length
          tramos.push({ cable: c.id, segmento: s - 1, x0: px, y0: py, x1: qx, y1: qy, largo, red })
          aristas.push({ a: vertice(red, px, py), b: vertice(red, qx, qy), r: largo, tramo: t })
        }
        px = qx
        py = qy
      }
    }
  }
  // El vértice virtual de cada red con puntos con nombre.
  for (let red = 0; red < con.redes.length; red++) {
    const ns = [...new Set(nombrados[red])]
    if (ns.length === 0) continue
    virtual[red] = nVertices++
    for (const v of ns) aristas.push({ a: v, b: virtual[red], r: R_VIRTUAL, tramo: -1 })
  }

  // Dónde entra cada casilla.
  const raizDe = new Int32Array(con.redes.length).fill(-1)
  for (let red = 0; red < con.redes.length; red++) {
    if (virtual[red] >= 0) raizDe[red] = virtual[red]
    else {
      const pin = con.redes[red].pines.find((k) => pinVertice.has(k))
      raizDe[red] = pin !== undefined ? pinVertice.get(pin)! : (verticeDe[red].values().next().value ?? -1)
    }
  }
  const entrada = new Int32Array(puertos.length).fill(-1)
  puertos.forEach((p, j) => {
    if (p.red < 0 || p.red >= con.redes.length) return
    const porPin = p.pin !== null && !pinDeNombre.has(p.pin) ? pinVertice.get(p.pin) : undefined
    entrada[j] = porPin ?? raizDe[p.red]
  })

  // Las aristas de cada vértice y la red de cada vértice.
  const redDeVertice = new Int32Array(nVertices).fill(-1)
  for (let red = 0; red < con.redes.length; red++) {
    for (const v of verticeDe[red].values()) redDeVertice[v] = red
    if (virtual[red] >= 0) redDeVertice[virtual[red]] = red
  }
  const grado = new Int32Array(nVertices + 1)
  for (const e of aristas) {
    grado[e.a + 1]++
    grado[e.b + 1]++
  }
  for (let v = 0; v < nVertices; v++) grado[v + 1] += grado[v]
  const vecinos = new Int32Array(2 * aristas.length)
  const lleno = grado.slice(0, nVertices)
  aristas.forEach((e, i) => {
    vecinos[lleno[e.a]++] = i
    vecinos[lleno[e.b]++] = i
  })

  // El árbol de expansión de cada red desde su raíz (a lo ancho) y sus lazos.
  const redes: (RedReparto | null)[] = con.redes.map(() => null)
  const sinFlechas = new Map<number, 'lazos'>()
  const visto = new Uint8Array(nVertices)
  const enArbol = new Uint8Array(aristas.length)
  const padreDe = new Int32Array(nVertices).fill(-1)
  const sentidoDe = new Int8Array(nVertices)
  const profundidad = new Int32Array(nVertices)
  for (let red = 0; red < con.redes.length; red++) {
    const raiz = raizDe[red]
    if (raiz < 0) continue
    const orden: number[] = [raiz]
    visto[raiz] = 1
    for (let i = 0; i < orden.length; i++) {
      const v = orden[i]
      for (let k = grado[v]; k < grado[v + 1]; k++) {
        const ei = vecinos[k], e = aristas[ei]
        const w = e.a === v ? e.b : e.a
        if (visto[w]) continue
        visto[w] = 1
        enArbol[ei] = 1
        padreDe[w] = ei
        sentidoDe[w] = e.a === v ? 1 : -1
        profundidad[w] = profundidad[v] + 1
        orden.push(w)
      }
    }
    // Las cuerdas: aristas de la red con sus dos puntas en el árbol que no son del árbol.
    const cuerdas: number[] = []
    for (const v of orden)
      for (let k = grado[v]; k < grado[v + 1]; k++) {
        const ei = vecinos[k]
        if (!enArbol[ei] && aristas[ei].a === v) cuerdas.push(ei)
      }
    if (cuerdas.length > MAX_LAZOS) {
      sinFlechas.set(red, 'lazos')
      continue
    }
    // Cada lazo: la cuerda de a a b y el camino del árbol de b de vuelta a a.
    const lazos = cuerdas.map((ci) => {
      const lazo: { arista: number; signo: number }[] = [{ arista: ci, signo: 1 }]
      let x = aristas[ci].b, y = aristas[ci].a
      const deY: { arista: number; signo: number }[] = []
      while (x !== y) {
        if (profundidad[x] >= profundidad[y]) {
          // Subir de x hacia su padre: el lazo recorre la arista del hijo al padre.
          lazo.push({ arista: padreDe[x], signo: -sentidoDe[x] })
          x = otraPunta(aristas[padreDe[x]], x)
        } else {
          // El tramo de y se recorre al revés (de su padre hacia y), al final del lazo.
          deY.push({ arista: padreDe[y], signo: sentidoDe[y] })
          y = otraPunta(aristas[padreDe[y]], y)
        }
      }
      return [...lazo, ...deY.reverse()]
    })
    const c = lazos.length
    const R = new Float64Array(c * c)
    for (let i = 0; i < c; i++) {
      const pi = new Map(lazos[i].map((x) => [x.arista, x.signo]))
      for (let j = 0; j < c; j++) {
        let s = 0
        for (const x of lazos[j]) {
          const si = pi.get(x.arista)
          if (si !== undefined) s += aristas[x.arista].r * si * x.signo
        }
        R[i * c + j] = s
      }
    }
    redes[red] = { orden: Int32Array.from(orden), padre: Int32Array.from(orden, (v) => padreDe[v]), sentido: Int8Array.from(orden, (v) => sentidoDe[v]), cuerdas, lazos, rInv: invertir(R, c), e: new Float64Array(c) }
  }

  // Lo que se usa en cada lectura (reservado una vez).
  const flujo = new Float64Array(aristas.length)
  const inyeccion = new Float64Array(nVertices)
  const sub = new Float64Array(nVertices)

  /** Las corrientes de todas las aristas con lo que entra a cada vértice (`inyeccion`), red por red. */
  const resolver = () => {
    flujo.fill(0)
    sub.set(inyeccion)
    for (let red = 0; red < redes.length; red++) {
      const R = redes[red]
      if (!R) continue
      const { orden, padre, sentido } = R
      // De las hojas hacia la raíz: lo que entra a un subárbol sale por la arista hacia su padre (de b hacia a si la arista va
      // del padre al hijo).
      for (let i = orden.length - 1; i > 0; i--) {
        const v = orden[i]
        flujo[padre[i]] = -sentido[i] * sub[v]
        sub[otraPunta(aristas[padre[i]], v)] += sub[v]
      }
      const c = R.cuerdas.length
      if (c === 0) continue
      // Los lazos: lo que la corriente del árbol suma de voltaje en cada uno, y su corriente para que la suma sea cero.
      const e = R.e
      e.fill(0)
      for (let k = 0; k < c; k++) for (const x of R.lazos[k]) e[k] += aristas[x.arista].r * x.signo * flujo[x.arista]
      for (let k = 0; k < c; k++) {
        let ik = 0
        for (let j = 0; j < c; j++) ik -= R.rInv[k * c + j] * e[j]
        for (const x of R.lazos[k]) flujo[x.arista] += x.signo * ik
      }
    }
  }

  /** Signo de la casilla `j` para la media absoluta: el de su media o, si es casi cero frente a la absoluta (alterna
   * pura), el de la corriente instantánea por la orientación. */
  const signoDe = (j: number, medias: ArrayLike<number>) => {
    const m = medias[j]
    if (Math.abs(m) > 1e-6 * Math.abs(absolutasActuales[j] ?? 0)) return m < 0 ? -1 : 1
    const p = puertos[j]
    const i = p.elemento !== undefined ? (instantaneasActuales?.[p.elemento] ?? 0) : 0
    const s = (p.signo ?? 1) * i
    return s < 0 ? -1 : s > 0 ? 1 : m < 0 ? -1 : 1
  }
  let absolutasActuales: ArrayLike<number> = []
  let instantaneasActuales: ArrayLike<number> | undefined
  /** Lo que entra a cada vértice con las medias de las casillas; en una red sin virtual, lo que sobra se reparte. */
  const inyectar = (valores: ArrayLike<number>, signos?: ArrayLike<number>) => {
    inyeccion.fill(0)
    for (let j = 0; j < entrada.length; j++) {
      const v = entrada[j]
      if (v < 0) continue
      const x = signos ? Math.abs(valores[j]) * signoDe(j, signos) : valores[j]
      // La corriente entra al elemento: sale de la red.
      inyeccion[v] -= x
    }
    // La convergencia de Newton deja un residuo en cada red: en una con virtual lo toma el virtual; en las demás se reparte
    // entre sus vértices en proporción a lo que entra por cada uno, así ningún punto dibujado deja de cumplir la ley.
    for (let red = 0; red < redes.length; red++) {
      const R = redes[red]
      if (!R || virtual[red] >= 0) continue
      let suma = 0, total = 0
      for (const v of R.orden) {
        suma += inyeccion[v]
        total += Math.abs(inyeccion[v])
      }
      if (total > 0 && suma !== 0) for (const v of R.orden) inyeccion[v] -= (suma * Math.abs(inyeccion[v])) / total
    }
    for (let red = 0; red < redes.length; red++) {
      const R = redes[red]
      if (!R || virtual[red] < 0) continue
      let suma = 0
      for (const v of R.orden) if (v !== virtual[red]) suma += inyeccion[v]
      inyeccion[virtual[red]] = -suma
    }
  }

  return {
    tramos,
    sinFlechas,
    repartir(medias, absolutas, media, absoluta, instantaneas) {
      inyectar(medias)
      resolver()
      for (let i = 0; i < aristas.length; i++) if (aristas[i].tramo >= 0) media[aristas[i].tramo] = flujo[i]
      // La media absoluta de un tramo: el mismo reparto con la media absoluta de cada casilla y el signo de su media (exacta en
      // serie, una estimación donde se juntan corrientes desfasadas).
      absolutasActuales = absolutas
      instantaneasActuales = instantaneas
      inyectar(absolutas, medias)
      resolver()
      for (let i = 0; i < aristas.length; i++) if (aristas[i].tramo >= 0) absoluta[aristas[i].tramo] = Math.abs(flujo[i])
      for (let t = 0; t < tramos.length; t++) {
        const red = tramos[t].red
        if (!redes[red]) {
          media[t] = 0
          absoluta[t] = 0
        }
      }
    },
    residuo(medias) {
      inyectar(medias)
      resolver()
      const suma = new Float64Array(nVertices)
      for (let v = 0; v < nVertices; v++) suma[v] = inyeccion[v]
      aristas.forEach((e, i) => {
        suma[e.a] -= flujo[i]
        suma[e.b] += flujo[i]
      })
      let peor = 0
      for (let v = 0; v < nVertices; v++) {
        const red = redDeVertice[v]
        if (red < 0 || !redes[red] || v === virtual[red]) continue
        peor = Math.max(peor, Math.abs(suma[v]))
      }
      return peor
    }
  }
}

const otraPunta = (e: Arista, v: number) => (e.a === v ? e.b : e.a)

/** La inversa de una matriz simétrica definida positiva de `n` × `n` (Gauss-Jordan con pivote parcial: `n` ≤ `MAX_LAZOS`). */
function invertir(m: Float64Array, n: number): Float64Array {
  const a = Float64Array.from(m)
  const inv = new Float64Array(n * n)
  for (let i = 0; i < n; i++) inv[i * n + i] = 1
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r * n + c]) > Math.abs(a[p * n + c])) p = r
    if (p !== c)
      for (let k = 0; k < n; k++) {
        ;[a[c * n + k], a[p * n + k]] = [a[p * n + k], a[c * n + k]]
        ;[inv[c * n + k], inv[p * n + k]] = [inv[p * n + k], inv[c * n + k]]
      }
    const d = a[c * n + c]
    if (d === 0) continue
    for (let k = 0; k < n; k++) {
      a[c * n + k] /= d
      inv[c * n + k] /= d
    }
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = a[r * n + c]
      if (f === 0) continue
      for (let k = 0; k < n; k++) {
        a[r * n + k] -= f * a[c * n + k]
        inv[r * n + k] -= f * inv[c * n + k]
      }
    }
  }
  return inv
}
