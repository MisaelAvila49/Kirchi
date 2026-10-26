/** Ecuación como árbol para dibujarla con fracciones y subíndices. El texto sigue siendo la fuente; lo que no se entiende
 * da `null` y la ficha lo escribe tal cual. */

export type Nodo =
  | { t: 'num'; cifra: string; unidad?: string; negativo?: boolean }
  | { t: 'var'; base: string; sub?: string }
  | { t: 'pi' }
  | { t: 'op'; op: '+' | '−' | '·' | '='; unario?: boolean }
  | { t: 'frac'; num: Nodo[]; den: Nodo[] }
  | { t: 'raiz'; hijos: Nodo[] }
  | { t: 'par'; hijos: Nodo[] }
  | { t: 'fn'; nombre: 'ln'; arg: Nodo }

/** Palabras que se escriben enteras (en cursiva) y no como letra con subíndice. */
const PALABRAS = new Set(['Ganancia'])
const UNIDAD = /^\s?((?:[TGMkmµnpf]?(?:Ω|Hz|F|V|A|s|W))|%)(?![A-Za-zΩµ])/

type Ficha = { k: 'num'; cifra: string; unidad?: string } | { k: 'nombre'; texto: string } | { k: 'sim'; s: string }

function fichas(texto: string): Ficha[] | null {
  const out: Ficha[] = []
  let i = 0
  while (i < texto.length) {
    const c = texto[i]
    if (c === ' ') {
      i++
      continue
    }
    const num = /^\d+(?:\.\d+)?/.exec(texto.slice(i))
    if (num) {
      i += num[0].length
      const u = UNIDAD.exec(texto.slice(i))
      if (u) i += u[0].length
      out.push({ k: 'num', cifra: num[0], ...(u ? { unidad: u[1] } : {}) })
      continue
    }
    const nombre = /^[A-Za-z][A-Za-z0-9]*/.exec(texto.slice(i))
    if (nombre) {
      out.push({ k: 'nombre', texto: nombre[0] })
      i += nombre[0].length
      continue
    }
    if ('()+·/=√π'.includes(c)) out.push({ k: 'sim', s: c })
    else if (c === '−' || c === '-') out.push({ k: 'sim', s: '−' })
    else return null
    i++
  }
  return out
}

class Lector {
  i = 0
  constructor(private f: Ficha[]) {}
  mirar = (): Ficha | undefined => this.f[this.i]
  esSim = (s: string): boolean => {
    const x = this.f[this.i]
    return !!x && x.k === 'sim' && x.s === s
  }
  fin = (): boolean => this.i >= this.f.length
}

const variable = (texto: string): Nodo => (PALABRAS.has(texto) || texto.length === 1 ? { t: 'var', base: texto } : { t: 'var', base: texto[0], sub: texto.slice(1) })

/** Lo que empieza un factor: una cifra, un nombre, π, «(» o «√». */
const empiezaFactor = (x: Ficha | undefined): boolean => !!x && (x.k !== 'sim' || x.s === '(' || x.s === 'π' || x.s === '√')

function factor(l: Lector): Nodo {
  const x = l.mirar()
  if (!x) throw new Error('falta algo')
  if (x.k === 'num') {
    l.i++
    return { t: 'num', cifra: x.cifra, ...(x.unidad ? { unidad: x.unidad } : {}) }
  }
  if (x.k === 'nombre') {
    l.i++
    if (x.texto === 'ln') return { t: 'fn', nombre: 'ln', arg: factor(l) }
    return variable(x.texto)
  }
  if (x.s === 'π') {
    l.i++
    return { t: 'pi' }
  }
  if (x.s === '(') {
    l.i++
    const hijos = suma(l)
    if (!l.esSim(')')) throw new Error('falta )')
    l.i++
    return { t: 'par', hijos }
  }
  if (x.s === '√') {
    l.i++
    const p = factor(l)
    return { t: 'raiz', hijos: p.t === 'par' ? p.hijos : [p] }
  }
  throw new Error(`no se espera ${x.s}`)
}

/** Un solo paréntesis que lo envuelve todo se quita: la fracción ya agrupa. */
const sinPar = (n: Nodo[]): Nodo[] => (n.length === 1 && n[0].t === 'par' ? n[0].hijos : n)

/** Un producto con su posible división: «a · b / c» es la fracción de «a · b» entre «c». */
function termino(l: Lector): Nodo[] {
  let nodos: Nodo[] = []
  if (l.esSim('−')) {
    l.i++
    nodos.push({ t: 'op', op: '−', unario: true })
  }
  nodos.push(factor(l))
  for (;;) {
    if (l.esSim('·')) {
      l.i++
      nodos.push({ t: 'op', op: '·' }, factor(l))
    } else if (empiezaFactor(l.mirar())) {
      nodos.push(factor(l))
    } else if (l.esSim('/')) {
      l.i++
      nodos = [{ t: 'frac', num: sinPar(nodos), den: sinPar([factor(l)]) }]
    } else break
  }
  return nodos
}

function suma(l: Lector): Nodo[] {
  const nodos = termino(l)
  while (l.esSim('+') || l.esSim('−')) {
    nodos.push({ t: 'op', op: (l.mirar() as { s: '+' | '−' }).s })
    l.i++
    nodos.push(...termino(l))
  }
  return nodos
}

/** El texto de una ecuación como árbol, o null si no se entiende (la ficha lo escribe tal cual). */
export function leerFormula(texto: string): Nodo[] | null {
  const f = fichas(texto)
  if (!f || f.length === 0) return null
  try {
    const l = new Lector(f)
    const nodos = suma(l)
    while (l.esSim('=')) {
      l.i++
      nodos.push({ t: 'op', op: '=' }, ...suma(l))
    }
    return l.fin() ? nodos : null
  } catch {
    return null
  }
}

/** El texto plano de un árbol, con las mismas reglas con que se escribe una ecuación (paréntesis donde la fracción los pide). */
export function textoDeFormula(nodos: readonly Nodo[]): string {
  const lista = (n: readonly Nodo[]) => textoDeFormula(n)
  const lleva = (n: readonly Nodo[]) => n.some((x) => x.t === 'op' && !x.unario && (x.op === '+' || x.op === '−'))
  return nodos
    .map((n): string => {
      switch (n.t) {
        case 'num':
          return `${n.negativo ? '−' : ''}${n.cifra}${n.unidad ? ` ${n.unidad}` : ''}`
        case 'var':
          return `${n.base}${n.sub ?? ''}`
        case 'pi':
          return 'π'
        case 'op':
          return n.unario ? n.op : ` ${n.op} `
        case 'frac': {
          const arriba = lista(n.num), abajo = lista(n.den)
          return `${lleva(n.num) ? `(${arriba})` : arriba} / ${n.den.length > 1 ? `(${abajo})` : abajo}`
        }
        case 'raiz':
          return `√(${lista(n.hijos)})`
        case 'par':
          return `(${lista(n.hijos)})`
        case 'fn':
          return `${n.nombre} ${lista([n.arg])}`
      }
    })
    .join('')
}

export interface PartesSustitucion {
  /** Lo que se calcula: «Vsalida». */
  lado: Nodo[]
  /** La cuenta con los valores. */
  cuenta: Nodo[]
  /** Lo que da, con su unidad. */
  resultado: Extract<Nodo, { t: 'num' }>
}

/** Parte «lado = cuenta = resultado» donde las igualdades no están entre paréntesis; null si no tiene las tres o no se lee. */
export function partesDeSustitucion(texto: string): PartesSustitucion | null {
  const partes: string[] = []
  let nivel = 0, desde = 0
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] === '(') nivel++
    else if (texto[i] === ')') nivel--
    else if (texto[i] === '=' && nivel === 0) {
      partes.push(texto.slice(desde, i).trim())
      desde = i + 1
    }
  }
  partes.push(texto.slice(desde).trim())
  if (partes.length !== 3) return null
  const lado = leerFormula(partes[0]), cuenta = leerFormula(partes[1])
  const m = /^([−-])?(\d+(?:\.\d+)?)(?:\s?([TGMkmµnpf]?(?:Ω|Hz|F|V|A|s|W)|%))?$/.exec(partes[2])
  if (!lado || !cuenta || !m) return null
  return { lado, cuenta, resultado: { t: 'num', cifra: m[2], ...(m[3] ? { unidad: m[3] } : {}), ...(m[1] ? { negativo: true } : {}) } }
}
