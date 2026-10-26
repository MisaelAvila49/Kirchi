/** Los gestos del ratón que el texto dibuja como un icono junto a su nombre. */
export const GESTOS = {
  clic: 'clic',
  'doble-clic': 'doble clic',
  'clic-derecho': 'clic derecho',
  'doble-clic-derecho': 'doble clic derecho',
  arrastrar: 'arrastrar',
  'mayus-clic': 'Mayús y clic',
  rueda: 'rueda del ratón'
} as const
export type IdGesto = keyof typeof GESTOS

/** Un trozo del texto de un paso: texto llano, una tecla (ya resuelta, o `null` si el comando no tiene tecla) o un gesto con su palabra. */
export type Parte = { tipo: 'texto'; texto: string } | { tipo: 'tecla'; id: string; tecla: string | null } | { tipo: 'gesto'; id: IdGesto; texto: string }

const RE_MARCA = /\{(tecla|gesto):([a-z0-9-]+)(?:\|([^}]+))?\}/g

/** Parte el texto de un paso en trozos; cada `{tecla:id}` pregunta por la tecla vigente de ese comando. */
export function partirTexto(texto: string, teclaDe: (id: string) => string | undefined): Parte[] {
  const out: Parte[] = []
  let i = 0
  for (const m of texto.matchAll(RE_MARCA)) {
    if (m.index > i) out.push({ tipo: 'texto', texto: texto.slice(i, m.index) })
    if (m[1] === 'tecla') out.push({ tipo: 'tecla', id: m[2], tecla: teclaDe(m[2]) ?? null })
    else if (Object.hasOwn(GESTOS, m[2])) out.push({ tipo: 'gesto', id: m[2] as IdGesto, texto: m[3] ?? GESTOS[m[2] as IdGesto] })
    else out.push({ tipo: 'texto', texto: m[0] })
    i = m.index + m[0].length
  }
  if (i < texto.length) out.push({ tipo: 'texto', texto: texto.slice(i) })
  return out
}

/** El texto sin marcas, para anunciarlo: la tecla en palabras, o el nombre del comando si no tiene tecla. */
export function textoLlano(texto: string, teclaDe: (id: string) => string | undefined, nombreDe: (id: string) => string): string {
  return partirTexto(texto, teclaDe)
    .map((p) => (p.tipo === 'texto' ? p.texto : p.tipo === 'gesto' ? p.texto : (p.tecla ?? nombreDe(p.id))))
    .join('')
}
