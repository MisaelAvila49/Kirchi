import type { MuestreoCsv, SeparadorCsv } from '../../../../compartido/ajustes'
import { celdasDeRenglon } from './csvTabla'

/** El carácter de cada separador y su nombre para decirlo en el comentario del archivo. */
export const CARACTER_SEPARADOR: Readonly<Record<SeparadorCsv, string>> = { coma: ',', 'punto-y-coma': ';', tab: '\t' }
export const NOMBRE_SEPARADOR: Readonly<Record<SeparadorCsv, string>> = { coma: 'Coma', 'punto-y-coma': 'Punto y coma', tab: 'Tabulador' }
export const NOMBRE_MUESTREO: Readonly<Record<MuestreoCsv, string>> = { 1: 'Todas', 10: 'Una de cada 10', 100: 'Una de cada 100' }

export interface FormatoCsv {
  separadorCsv: SeparadorCsv
  muestreoCsv: MuestreoCsv
}

const esComentario = (l: string) => l.startsWith('#') || l.startsWith('"#')

/** Una celda lista para escribirse con el separador `sep`: entre comillas si lleva el separador, comillas o saltos. */
const celda = (c: string, sep: string): string => (c.includes(sep) || c.includes('"') || c.includes('\n') ? `"${c.replace(/"/g, '""')}"` : c)

/**
 * Da al CSV el separador y el muestreo elegidos. El punto decimal no cambia. De cada bloque se conserva un renglón de cada `muestreoCsv`, y siempre el primero y el último.
 */
export function aplicarFormatoCsv(texto: string, f: FormatoCsv): string {
  if (f.separadorCsv === 'coma' && f.muestreoCsv === 1) return texto
  const sep = CARACTER_SEPARADOR[f.separadorCsv]
  const lineas = texto.split(/\r?\n/)
  if (lineas.at(-1) === '') lineas.pop()
  const salida: string[] = []
  let bloque: string[][] | null = null
  let esperandoTitulos = true
  const cerrar = () => {
    if (!bloque) return
    const datos = bloque
    bloque = null
    datos.forEach((c, i) => {
      if (i === datos.length - 1 || i % f.muestreoCsv === 0) salida.push(c.map((x) => celda(x, sep)).join(sep))
    })
  }
  let notas = false
  const nota = () => {
    if (notas) return
    notas = true
    if (f.separadorCsv !== 'coma') salida.push(`# Separador: ${NOMBRE_SEPARADOR[f.separadorCsv].toLowerCase()}; decimal: punto.`)
    if (f.muestreoCsv > 1) salida.push(`# Muestreo: una de cada ${f.muestreoCsv} (se conservan la primera y la última de cada bloque).`)
  }
  for (const l of lineas) {
    if (l === '') {
      cerrar()
      salida.push('')
      esperandoTitulos = true
    } else if (esComentario(l)) {
      cerrar()
      const c = celdasDeRenglon(l)[0]
      salida.push(celda(c, sep) === c ? c : celda(c, sep))
    } else if (esperandoTitulos) {
      nota()
      salida.push(celdasDeRenglon(l).map((x) => celda(x, sep)).join(sep))
      esperandoTitulos = false
      bloque = []
    } else bloque?.push(celdasDeRenglon(l))
  }
  cerrar()
  return `${salida.join('\n')}\n`
}
