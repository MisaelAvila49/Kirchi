/**
 * El proceso principal no tiene DOM, y los símbolos de las piezas se leen con `DOMParser`. Este analizador cubre solo el
 * subconjunto de SVG que admite `svgAGeometria` (elementos con atributos, sin texto ni entidades fuera de los atributos)
 * y expone lo que ese lector toca de un `Element`. Un SVG fuera de ese subconjunto produce un `parsererror`, como el
 * del navegador.
 */
const NS_SVG = 'http://www.w3.org/2000/svg'

class Nodo {
  readonly children: Nodo[] = []
  parentElement: Nodo | null = null
  readonly namespaceURI = NS_SVG
  constructor(
    readonly tagName: string,
    private readonly atributos: Map<string, string>
  ) {}
  get nodeName(): string {
    return this.tagName
  }
  hasAttribute(n: string): boolean {
    return this.atributos.has(n)
  }
  getAttribute(n: string): string | null {
    return this.atributos.get(n) ?? null
  }
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decodificar = (v: string): string => v.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTIDADES[e.toLowerCase()]))

const RE_ATRIBUTO = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y

interface Documento {
  documentElement: Nodo | null
  getElementsByTagName(n: string): Nodo[]
}

function analizar(fuente: string): Documento {
  const error = (): Documento => ({ documentElement: null, getElementsByTagName: (n) => (n === 'parsererror' ? [new Nodo('parsererror', new Map())] : []) })
  const texto = fuente.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '')
  const pila: Nodo[] = []
  let raiz: Nodo | null = null
  const RE_ETIQUETA = /<(\/?)([^\s/>]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g
  let ultimo = 0
  for (let m = RE_ETIQUETA.exec(texto); m; m = RE_ETIQUETA.exec(texto)) {
    if (texto.slice(ultimo, m.index).trim() !== '' && pila.length === 0) return error()
    ultimo = m.index + m[0].length
    const [, cierra, nombre, resto, autocierra] = m
    if (cierra) {
      const abierto = pila.pop()
      if (!abierto || abierto.tagName !== nombre) return error()
      continue
    }
    const atributos = new Map<string, string>()
    const re = new RegExp(RE_ATRIBUTO.source, 'y')
    let i = 0
    while (i < resto.length) {
      while (i < resto.length && /\s/.test(resto[i])) i++
      if (i >= resto.length) break
      re.lastIndex = i
      const a = re.exec(resto)
      if (!a) return error()
      atributos.set(a[1], decodificar(a[2] ?? a[3] ?? ''))
      i = re.lastIndex
    }
    const nodo = new Nodo(nombre, atributos)
    const padre = pila[pila.length - 1]
    if (padre) {
      nodo.parentElement = padre
      padre.children.push(nodo)
    } else if (raiz) return error()
    else raiz = nodo
    if (!autocierra) pila.push(nodo)
  }
  if (pila.length > 0 || !raiz) return error()
  return { documentElement: raiz, getElementsByTagName: () => [] }
}

/** Con la forma mínima de `DOMParser` que usa el lector de símbolos. */
export class AnalizadorSvg {
  parseFromString(fuente: string, _tipo: string): Documento {
    return analizar(fuente)
  }
}
