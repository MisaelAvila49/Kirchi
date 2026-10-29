/** Largo máximo de una línea de texto ajeno: lo que pase de aquí es ruido o un archivo hostil. */
export const TOPE_LINEA = 4000

/** Divide en líneas y recorta las que pasan del tope, avisando una vez por línea recortada. */
export function dividirLineas(texto: string, aviso: (n: number, m: string) => void): string[] {
  const lineas = texto.split(/\r\n|\r|\n/)
  for (let i = 0; i < lineas.length; i++) {
    if ((lineas[i] as string).length > TOPE_LINEA) {
      lineas[i] = (lineas[i] as string).slice(0, TOPE_LINEA)
      aviso(i + 1, `la línea pasa de ${TOPE_LINEA} caracteres y se recortó.`)
    }
  }
  return lineas
}
