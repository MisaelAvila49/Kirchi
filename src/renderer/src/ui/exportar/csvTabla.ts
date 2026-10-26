/**
 * Vista previa del CSV como tabla (comentarios, títulos, primeras filas). Las cuentas no tocan el DOM para probarlas con textos.
 */
export interface TablaCsv {
  /** Los renglones que empiezan con # (sin las comillas con que los protege `celdaDeTexto`). */
  comentarios: string[]
  columnas: string[]
  filas: string[][]
  /** Filas de datos que no caben en la vista. */
  restantes: number
  /** Filas de datos en total (sin contar los títulos). */
  total: number
}

/** Un renglón de CSV (RFC 4180, con coma): las comillas protegen comas y saltos, y «""» es una comilla. */
export function celdasDeRenglon(linea: string, separador = ','): string[] {
  const celdas: string[] = []
  let actual = ''
  let entre = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (entre) {
      if (c === '"' && linea[i + 1] === '"') {
        actual += '"'
        i++
      } else if (c === '"') entre = false
      else actual += c
    } else if (c === '"') entre = true
    else if (c === separador) {
      celdas.push(actual)
      actual = ''
    } else actual += c
  }
  celdas.push(actual)
  return celdas
}

const esComentario = (l: string) => l.startsWith('#') || l.startsWith('"#')

/** El texto del CSV hecho tabla: hasta `maxFilas` de datos tras la primera fila que no es comentario (los títulos). */
export function tablaDeCsv(texto: string, maxFilas = 12, separador = ','): TablaCsv {
  const lineas = texto.split(/\r?\n/).filter((l) => l !== '')
  const comentarios = lineas.filter(esComentario).map((l) => celdasDeRenglon(l, separador)[0])
  const resto = lineas.filter((l) => !esComentario(l))
  const [titulos, ...datos] = resto
  return {
    comentarios,
    columnas: titulos ? celdasDeRenglon(titulos, separador) : [],
    filas: datos.slice(0, maxFilas).map((d) => celdasDeRenglon(d, separador)),
    restantes: Math.max(0, datos.length - maxFilas),
    total: datos.length
  }
}

/** Tamaño aproximado de un archivo de texto: «37 kB», «1.2 MB» (los bytes que tendría en UTF-8). */
export function tamañoDeTexto(texto: string): string {
  const b = new TextEncoder().encode(texto).length
  if (b < 1000) return `${b} B`
  if (b < 1_000_000) return `${Math.round(b / 1000)} kB`
  return `${(b / 1_000_000).toFixed(1)} MB`
}
