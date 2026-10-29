/** Archivos de hoja que un esquema de KiCad cita en sus bloques `(sheet ...)`, en el orden en que aparecen y sin repetir. */
export function archivosDeHojasKicad(texto: string): string[] {
  const vistos = new Set<string>()
  for (const m of texto.matchAll(/\(property\s+"Sheet ?file"\s+"((?:[^"\\]|\\.)*)"/gi)) {
    const archivo = m[1].replace(/\\(.)/g, '$1').trim()
    if (archivo) vistos.add(archivo)
  }
  return [...vistos]
}
