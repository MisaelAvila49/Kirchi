import type { Alinear, FormatoTexto, Fuente, Tinta } from './tipos'

/** Formato de notas y etiquetas de red. El documento guarda solo lo que difiere del valor por omisión. */

export type TipoTexto = 'nota' | 'etiqueta'
/** Alineación de una nota, con «izq» explícito (en el documento se omite). */
export type Alineacion = 'izq' | Alinear

export const FUENTES: readonly Fuente[] = ['sans', 'serif', 'mono']
export const TINTAS: readonly Tinta[] = ['tinta', 'gris', 'rojo', 'azul', 'verde']
/** Contorno con todos los valores: «auto» es el de siempre y no se guarda. */
export type Contorno = Tinta | 'ninguno' | 'auto'
export const CONTORNOS: readonly Contorno[] = ['auto', ...TINTAS, 'ninguno']
export const NOMBRE_CONTORNO: Record<Contorno, string> = { auto: 'Predeterminado', ninguno: 'Sin contorno', tinta: 'Negro', gris: 'Gris', rojo: 'Rojo', azul: 'Azul', verde: 'Verde' }
/** Rótulo de un contorno. «auto» (nota gris, etiqueta del color del cable) con ambas seleccionadas queda «Predeterminado»;
 * el documento no guarda «auto». */
export function nombreContorno(c: Contorno, notas: number, etiquetas: number): string {
  if (c !== 'auto') return NOMBRE_CONTORNO[c]
  if (notas > 0 && etiquetas > 0) return 'Predeterminado'
  return etiquetas > 0 ? 'Predeterminado (color del cable)' : 'Predeterminado (gris)'
}
export const ALINEACIONES: readonly Alineacion[] = ['izq', 'centro', 'der', 'just']

export const NOMBRE_FUENTE: Record<Fuente, string> = { sans: 'Mona Sans', serif: 'Source Serif', mono: 'Geist Mono' }
export const NOMBRE_TINTA: Record<Tinta, string> = { tinta: 'Negro', gris: 'Gris', rojo: 'Rojo', azul: 'Azul', verde: 'Verde' }
export const NOMBRE_ALINEACION: Record<Alineacion, string> = { izq: 'Izquierda', centro: 'Centro', der: 'Derecha', just: 'Justificado' }

/** Alturas de rotulado de la norma ISO 3098, en mm: una letra de 2.5 mm ocupa una celda de la rejilla. */
export const SERIE_TAM: readonly number[] = [1.8, 2.5, 3.5, 5, 7, 10]
/** El tamaño de antes del formato: los archivos ya guardados se ven idénticos. */
export const TAM_POR_OMISION = 2
export const TAM_MIN = 1
export const TAM_MAX = 20
/** Ancho de una nota: de 5 mm a 400 mm (4 a 320 unidades de la rejilla fina de 1.25 mm). */
export const ANCHO_NOTA_MIN = 4
export const ANCHO_NOTA_MAX = 320
/** Alto mínimo fijado que admite una nota: 400 mm, igual que el ancho. */
export const ALTO_NOTA_MAX = 320
/** Fuente de cada texto sin formato: las notas en Mona Sans y las etiquetas de red en Geist Mono, como se dibujaban antes. */
export const FUENTE_POR_OMISION: Record<TipoTexto, Fuente> = { nota: 'sans', etiqueta: 'mono' }

/** Formato con todos sus valores, como lo dibuja el lienzo. */
export interface FormatoCompleto {
  fuente: Fuente
  tam: number
  negrita: boolean
  cursiva: boolean
  subrayado: boolean
  tinta: Tinta
  /** En una etiqueta siempre «izq»: las etiquetas no se alinean. */
  alinear: Alineacion
  contorno: Contorno
}

export type ParcheFormato = Partial<FormatoCompleto>

export function formatoCompleto(f: FormatoTexto | undefined, tipo: TipoTexto): FormatoCompleto {
  return {
    fuente: f?.fuente ?? FUENTE_POR_OMISION[tipo],
    tam: f?.tam ?? TAM_POR_OMISION,
    negrita: f?.negrita === true,
    cursiva: f?.cursiva === true,
    subrayado: f?.subrayado === true,
    tinta: f?.tinta ?? 'tinta',
    alinear: tipo === 'nota' ? (f?.alinear ?? 'izq') : 'izq',
    contorno: f?.contorno ?? 'auto'
  }
}

/** Solo lo que difiere del valor por omisión; `undefined` si todo está por omisión (el JSON canónico omite el campo). */
export function formatoMinimo(c: FormatoCompleto, tipo: TipoTexto): FormatoTexto | undefined {
  const f: FormatoTexto = {}
  if (c.fuente !== FUENTE_POR_OMISION[tipo]) f.fuente = c.fuente
  if (c.tam !== TAM_POR_OMISION) f.tam = c.tam
  if (c.negrita) f.negrita = true
  if (c.cursiva) f.cursiva = true
  if (c.subrayado) f.subrayado = true
  if (c.tinta !== 'tinta') f.tinta = c.tinta
  if (tipo === 'nota' && c.alinear !== 'izq') f.alinear = c.alinear
  if (c.contorno !== 'auto') f.contorno = c.contorno
  return Object.keys(f).length ? f : undefined
}

/** El formato de un texto con un cambio aplicado; las etiquetas ignoran la alineación. */
export function formatoConCambio(f: FormatoTexto | undefined, parche: ParcheFormato, tipo: TipoTexto): FormatoTexto | undefined {
  const antes = formatoCompleto(f, tipo)
  const c = { ...antes, ...parche }
  // El tamaño siempre queda entre 1 y 20 mm con un decimal; un valor que no es número se ignora.
  if (parche.tam !== undefined) c.tam = Number.isFinite(parche.tam) ? Math.min(TAM_MAX, Math.max(TAM_MIN, redondearTam(parche.tam))) : antes.tam
  return formatoMinimo(c, tipo)
}

export const redondearTam = (mm: number): number => Math.round(mm * 10) / 10

/** «3.5», «3.5 mm» o «12» → el tamaño en mm, o por qué no vale. El separador decimal es el punto. */
export function leerTam(texto: string): { tam: number } | { error: string } {
  const m = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*(mm)?\s*$/.exec(texto)
  if (!m) return { error: 'Escribe el tamaño en mm, por ejemplo 3.5.' }
  const tam = redondearTam(Number(m[1]))
  if (tam < TAM_MIN) return { error: `El tamaño mínimo es ${TAM_MIN} mm.` }
  if (tam > TAM_MAX) return { error: `El tamaño máximo es ${TAM_MAX} mm.` }
  return { tam }
}

/** El tamaño siguiente de la serie ISO, mayor (`dir` 1) o menor (−1); si no hay, el mismo. */
export function siguienteTam(actual: number, dir: 1 | -1): number {
  if (dir > 0) return SERIE_TAM.find((t) => t > actual + 1e-9) ?? actual
  return [...SERIE_TAM].reverse().find((t) => t < actual - 1e-9) ?? actual
}

/** Tamaño de letra en pt (1 pt = 25.4/72 mm), como en el diálogo de exportar. El documento sigue guardando mm. */
const MM_POR_PT = 25.4 / 72
const unDecimal = (n: number): number => Math.round(n * 10) / 10
/** De mm a pt con un decimal (2 mm, el tamaño por omisión, son 5.7 pt). */
export const mmAPt = (mm: number): number => unDecimal(mm / MM_POR_PT)
/** De pt a mm con el decimal que guarda el documento. */
export const ptAMm = (pt: number): number => redondearTam(pt * MM_POR_PT)
export const PT_MIN = mmAPt(TAM_MIN)
export const PT_MAX = mmAPt(TAM_MAX)
/** «5.7 pt» (el decimal solo si lo hay). */
export const textoPt = (mm: number): string => `${mmAPt(mm)} pt`

/** «9.5» o «9.5 pt» → el tamaño en pt (un decimal como máximo), o por qué no vale. */
export function leerPt(texto: string): { pt: number } | { error: string } {
  const m = /^\s*(\d+(?:\.\d)?)\s*(pt)?\s*$/.exec(texto)
  if (!m) return { error: 'Escribe el tamaño en pt con un decimal como máximo, por ejemplo 9.5.' }
  const pt = Number(m[1])
  if (pt < PT_MIN) return { error: `El tamaño mínimo es ${PT_MIN} pt.` }
  if (pt > PT_MAX) return { error: `El tamaño máximo es ${PT_MAX} pt.` }
  return { pt }
}

/** «12.5 mm» con el decimal solo si lo tiene. */
export const textoTam = (mm: number): string => `${redondearTam(mm)} mm`

/** Lee el formato de un texto de un .kir: lo desconocido o fuera de rango se descarta con aviso y el texto conserva lo
 * demás. `sujeto` completa el aviso. */
export function leerFormato(datos: unknown, tipo: TipoTexto, sujeto: string): { formato?: FormatoTexto; avisos: string[] } {
  const avisos: string[] = []
  if (datos === undefined) return { avisos }
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) return { avisos: [`Se descartó el formato ${sujeto}: no es una lista de propiedades.`] }
  const d = datos as Record<string, unknown>
  const c = formatoCompleto(undefined, tipo)
  for (const [k, v] of Object.entries(d)) {
    switch (k) {
      case 'fuente':
        if (FUENTES.includes(v as Fuente)) c.fuente = v as Fuente
        else avisos.push(`Se descartó la fuente «${String(v)}» ${sujeto}.`)
        break
      case 'tam':
        if (typeof v !== 'number' || !Number.isFinite(v)) avisos.push(`Se descartó el tamaño «${String(v)}» ${sujeto}: no es un número.`)
        else if (v < TAM_MIN) avisos.push(`Se descartó el tamaño ${textoPt(v)} ${sujeto}: el mínimo es ${PT_MIN} pt.`)
        else if (v > TAM_MAX) avisos.push(`Se descartó el tamaño ${textoPt(v)} ${sujeto}: el máximo es ${PT_MAX} pt.`)
        else if (Math.abs(redondearTam(v) - v) > 1e-9) avisos.push(`Se descartó el tamaño ${textoPt(v)} ${sujeto}: no es un tamaño válido.`)
        else c.tam = v
        break
      case 'negrita':
      case 'cursiva':
      case 'subrayado':
        if (v === true) c[k] = true
        else avisos.push(`Se descartó «${k}» ${sujeto}: solo admite true.`)
        break
      case 'tinta':
        if (TINTAS.includes(v as Tinta)) c.tinta = v as Tinta
        else avisos.push(`Se descartó la tinta «${String(v)}» ${sujeto}.`)
        break
      case 'contorno':
        if (v === 'ninguno' || TINTAS.includes(v as Tinta)) c.contorno = v as Contorno
        else avisos.push(`Se descartó el contorno «${String(v)}» ${sujeto}.`)
        break
      case 'alinear':
        if (tipo !== 'nota') avisos.push(`Se descartó la alineación ${sujeto}: solo las notas se alinean.`)
        else if (v === 'centro' || v === 'der' || v === 'just') c.alinear = v
        else avisos.push(`Se descartó la alineación «${String(v)}» ${sujeto}.`)
        break
      default:
        avisos.push(`Se descartó «${k}» del formato ${sujeto}: no es una propiedad de formato.`)
    }
  }
  return { formato: formatoMinimo(c, tipo), avisos }
}
