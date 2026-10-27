import type { ElementoMotor } from '../../../compartido/netlistMotor'
import { UnionFind } from '../conexiones/unionFind'
import type { PiezaDef } from '../piezas/tipos'
import { nodosDeElemento } from './netlist'

/** Lo que se dice cuando un lado de un optoacoplador queda sin tierra. */
export const PISTA_OPTOACOPLADOR = 'El optoacoplador aísla su LED de su transistor: cada lado necesita su tierra o su referencia.'

/** Si la pieza aísla dos lados con una fuente de corriente controlada por una rama de 0 V (el optoacoplador). */
export const esOptoacoplador = (def: PiezaDef | undefined): boolean => def?.modelo?.tipo === 'compuesto' && def.modelo.elementos.some((e) => e.t === 'F')

const enumerar = (refs: string[]) => (refs.length < 2 ? refs.join('') : `${refs.slice(0, -1).join(', ')} y ${refs[refs.length - 1]}`)
const ordenadas = (refs: Iterable<string>) => [...new Set(refs)].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))

/** Las ramas cuyo voltaje queda fijado: fuentes V, la salida de E y H, la rama de 0 V de control de H y F y una `EXT` en
 * voltaje sin resistencia. Los inductores y el transformador no cuentan: el motor los integra desde reposo y una fuente
 * directo sobre ellos (el primario de un transformador) se simula. */
function ramasDeVoltaje(e: ElementoMotor): [number, number][] {
  switch (e.type) {
    case 'V':
      return [[e.a, e.b]]
    case 'E':
      return [[e.p, e.n]]
    case 'H':
      return [[e.p, e.n], [e.cp, e.cn]]
    case 'F':
      return [[e.cp, e.cn]]
    case 'EXT':
      return e.modo === 'v' && !e.r ? [[e.a, e.b]] : []
    default:
      return []
  }
}

/** Lazos formados solo por ramas de voltaje definido: la matriz queda singular. Cada lazo se dice una vez, con
 * las piezas de su camino. */
function lazosDeVoltaje(elementos: readonly ElementoMotor[], ref: (k: number) => string): string[] {
  const salida = new Set<string>()
  const uf = new UnionFind<number>()
  const vecinos = new Map<number, { a: number; ref: string }[]>()
  elementos.forEach((e, k) => {
    const nombre = ref(k)
    if (!nombre) return
    for (const [a, b] of ramasDeVoltaje(e)) {
      if (uf.buscar(a) === uf.buscar(b)) {
        const refs = new Set([nombre, ...caminoEntre(vecinos, a, b)])
        const lista = ordenadas(refs)
        salida.add(`${lista.length === 1 ? `${lista[0]} forma` : `${enumerar(lista)} forman`} un lazo de fuentes de voltaje: agrega una resistencia en el lazo.`)
        continue
      }
      uf.unir(a, b)
      for (const [desde, hacia] of [[a, b], [b, a]]) vecinos.set(desde, [...(vecinos.get(desde) ?? []), { a: hacia, ref: nombre }])
    }
  })
  return [...salida]
}

/** Las piezas de las ramas que van de `a` a `b` por lo ya unido (búsqueda en anchura). */
function caminoEntre(vecinos: Map<number, { a: number; ref: string }[]>, a: number, b: number): string[] {
  const previo = new Map<number, { de: number; ref: string }>()
  const cola = [a]
  const visto = new Set([a])
  for (let i = 0; i < cola.length && !visto.has(b); i++) {
    for (const v of vecinos.get(cola[i]) ?? []) {
      if (visto.has(v.a)) continue
      visto.add(v.a)
      previo.set(v.a, { de: cola[i], ref: v.ref })
      cola.push(v.a)
    }
  }
  const refs: string[] = []
  for (let n = b; n !== a && previo.has(n); n = previo.get(n)!.de) refs.push(previo.get(n)!.ref)
  return refs
}

/** Las ramas de corriente: lo que una fuente de corriente impone y no deja pasar el voltaje (I, la salida de G y F, una
 * `EXT` en corriente). El capacitor también corta en continua, pero se integra desde reposo: se anota para no culparlo. */
function ramasDeCorriente(e: ElementoMotor): [number, number][] {
  switch (e.type) {
    case 'I':
      return [[e.a, e.b]]
    case 'G':
    case 'F':
      return [[e.p, e.n]]
    case 'EXT':
      return e.modo === 'i' ? [[e.a, e.b]] : []
    default:
      return []
  }
}

/** Los pares de nodos que cada elemento deja en contacto de voltaje. Por omisión, todos sus nodos; los que solo miran
 * (control de E y G, entrada de un puente sin carga) o solo inyectan corriente (I, G, F, capacitor) no unen nada. */
function unidos(e: ElementoMotor): number[][] {
  switch (e.type) {
    case 'I':
    case 'C':
      return []
    case 'G':
      return []
    case 'F':
      return [[e.cp, e.cn]]
    case 'EXT':
      return e.modo === 'v' ? [[e.a, e.b]] : []
    case 'E':
      return [[e.p, e.n]]
    case 'ADC':
      return e.r_in !== undefined ? [[e.p, e.n]] : []
    case 'OA':
      // Las entradas se ven por `rin`, las alimentaciones van juntas y la salida es una fuente contra tierra.
      return [[e.p, e.n], [e.vp, e.vn], [e.out, 0]]
    case 'DAC':
      return [[e.out, e.lo ?? 0, e.hi ?? 0]]
    default: {
      const n = nodosDeElemento(e)
      return n.length ? [n] : []
    }
  }
}

/** Un nodo o grupo de nodos al que solo llegan fuentes de corriente: sin otra rama, su voltaje no está definido.
 * Si un capacitor lo toca se deja pasar, porque el motor lo integra desde reposo (una rampa con fuente de corriente). */
function cortesDeCorriente(elementos: readonly ElementoMotor[], ref: (k: number) => string): string[] {
  const uf = new UnionFind<number>()
  uf.buscar(0)
  for (const e of elementos) for (const g of unidos(e)) for (const n of g) uf.unir(g[0], n)
  const conCapacitor = new Set<number>()
  for (const e of elementos) if (e.type === 'C') for (const n of [e.a, e.b]) conCapacitor.add(uf.buscar(n))
  const porRaiz = new Map<number, Set<string>>()
  const tierra = uf.buscar(0)
  elementos.forEach((e, k) => {
    const nombre = ref(k)
    if (!nombre) return
    for (const [a, b] of ramasDeCorriente(e)) {
      // Una fuente con sus dos extremos en la misma parte no inyecta corriente neta a ninguna.
      if (uf.buscar(a) === uf.buscar(b)) continue
      for (const n of [a, b]) {
        const raiz = uf.buscar(n)
        if (raiz === tierra || conCapacitor.has(raiz)) continue
        const refs = porRaiz.get(raiz) ?? new Set<string>()
        refs.add(nombre)
        porRaiz.set(raiz, refs)
      }
    }
  })
  return [...porRaiz.values()].map((refs) => `El nodo de ${enumerar(ordenadas(refs))} solo recibe fuentes de corriente: agrega una resistencia a tierra.`)
}

/** Una E controlada por su propia salida con ganancia 1 (o 1 con los polos cruzados): V = V sin solución. Los
 * lazos de varias fuentes controladas no se buscan: el motor dice cuál elemento es singular. */
function autolazos(elementos: readonly ElementoMotor[], ref: (k: number) => string): string[] {
  const salida = new Set<string>()
  elementos.forEach((e, k) => {
    if (e.type !== 'E' || !ref(k)) return
    const directo = e.cp === e.p && e.cn === e.n && e.ganancia === 1
    const cruzado = e.cp === e.n && e.cn === e.p && e.ganancia === -1
    if (directo || cruzado) salida.add(`${ref(k)} está controlada por su propia salida con ganancia 1: cambia la ganancia o agrega una resistencia.`)
  })
  return [...salida]
}

/** Lo que se sabe sin simular de las fuentes; la pista del optoacoplador la agrega la netlist a
 * «no tiene camino a tierra». `ref(k)` es la referencia de la pieza del elemento `k` (vacía si no la tiene). */
export function fuentesPrevias(elementos: readonly ElementoMotor[], ref: (k: number) => string): string[] {
  return [...lazosDeVoltaje(elementos, ref), ...cortesDeCorriente(elementos, ref), ...autolazos(elementos, ref)]
}
