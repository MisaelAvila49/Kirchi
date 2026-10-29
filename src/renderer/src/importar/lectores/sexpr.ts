/** Lector tolerante de S-expressions (el formato de los archivos de KiCad): listas, átomos y cadenas. */

/** Un átomo o cadena es un `string`; una lista es un arreglo cuyo primer elemento suele ser su nombre. */
export type Nodo = string | Nodo[]

export const TOPE_TAMANO = 20 * 1024 * 1024
export const TOPE_PROFUNDIDAD = 64

export class ErrorSexpr extends Error {}

/** Lee un texto y devuelve la lista de expresiones de nivel superior. Lanza `ErrorSexpr` si pasa un tope o falta cerrar. */
export function leerSexpr(texto: string): Nodo[] {
  if (texto.length > TOPE_TAMANO) throw new ErrorSexpr('El archivo pasa del tamaño máximo que se lee (20 MB).')
  const raiz: Nodo[] = []
  const pila: Nodo[][] = [raiz]
  const n = texto.length
  let i = 0
  while (i < n) {
    const c = texto[i] as string
    if (c === '(') {
      if (pila.length > TOPE_PROFUNDIDAD) throw new ErrorSexpr('El archivo anida más niveles de los que se leen.')
      const l: Nodo[] = []
      ;(pila[pila.length - 1] as Nodo[]).push(l)
      pila.push(l)
      i++
    } else if (c === ')') {
      // Un paréntesis de sobra se ignora.
      if (pila.length > 1) pila.pop()
      i++
    } else if (c === '"') {
      let s = ''
      i++
      while (i < n && texto[i] !== '"') {
        if (texto[i] === '\\' && i + 1 < n) {
          const e = texto[i + 1] as string
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e
          i += 2
        } else s += texto[i++]
      }
      i++
      ;(pila[pila.length - 1] as Nodo[]).push(s)
    } else if (c <= ' ') i++
    else {
      const ini = i
      while (i < n && (texto[i] as string) > ' ' && texto[i] !== '(' && texto[i] !== ')' && texto[i] !== '"') i++
      ;(pila[pila.length - 1] as Nodo[]).push(texto.slice(ini, i))
    }
  }
  if (pila.length > 1) throw new ErrorSexpr('Al archivo le faltan paréntesis de cierre.')
  return raiz
}

export const esLista = (n: Nodo | undefined): n is Nodo[] => Array.isArray(n)
export const nombreDe = (l: Nodo[]): string => (typeof l[0] === 'string' ? l[0] : '')

/** Los hijos que son listas con ese nombre. */
export function hijos(l: Nodo[], nombre: string): Nodo[][] {
  return l.filter((h): h is Nodo[] => esLista(h) && h[0] === nombre)
}

export function hijo(l: Nodo[], nombre: string): Nodo[] | undefined {
  return l.find((h): h is Nodo[] => esLista(h) && h[0] === nombre)
}

/** El segundo elemento del hijo `(nombre valor ...)` como texto. */
export function texto(l: Nodo[], nombre: string): string | undefined {
  const h = hijo(l, nombre)
  return h && typeof h[1] === 'string' ? h[1] : undefined
}

/** Los números que siguen al nombre en `(nombre a b c)`; los que no son número salen como NaN. */
export function numeros(l: Nodo[], nombre: string): number[] | undefined {
  const h = hijo(l, nombre)
  return h ? h.slice(1).map((v) => (typeof v === 'string' ? Number(v) : NaN)) : undefined
}
