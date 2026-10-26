/** Plantillas de usuario: `.kir` en `Documentos/Kirchi/Plantillas/<categoría>/<nombre>.kir`. La interfaz manda categoría y nombre, no rutas, y el proceso principal los valida con estas reglas. */

export const CARPETA_PLANTILLAS = ['Kirchi', 'Plantillas'] as const
/** Largo máximo de un nombre de plantilla o de categoría (sin la extensión). */
export const LARGO_MAXIMO_NOMBRE = 80
/** Topes de lo que se lista: una carpeta ajena con miles de archivos no congela la interfaz. */
export const MAX_CATEGORIAS = 100
export const MAX_POR_CATEGORIA = 500
/** Categoría que propone el diálogo de guardar. */
export const CATEGORIA_POR_OMISION = 'Mis plantillas'
/** Categoría de las plantillas que trae Kirchi (solo lectura, no es una carpeta). */
export const CATEGORIA_INCLUIDAS = 'Incluidas'
export const CATEGORIAS_DE_KIRCHI: readonly string[] = [CATEGORIA_INCLUIDAS]
/** La categoría es una de las que trae Kirchi (sin importar mayúsculas): no es una carpeta y no se puede crear, borrar ni escribir. */
export const esCategoriaDeKirchi = (n: string): boolean => CATEGORIAS_DE_KIRCHI.some((c) => c.toLowerCase() === n.toLowerCase())
/** Una plantilla dentro de una carpeta de 64 MB es un `.kir` ajeno: la lista las trae por nombre, la lectura aplica el tope del `.kir`. */
export const EXTENSION_PLANTILLA = '.kir'

const RESERVADOS_WINDOWS = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i
// eslint-disable-next-line no-control-regex
const PROHIBIDOS = /[<>:"/\\|?*\u0000-\u001f\u007f]/

/** Motivo por el que `n` no sirve como nombre de plantilla o de categoría, o null si sirve. */
export function motivoNombreInvalido(n: unknown, que: 'nombre' | 'categoría' = 'nombre'): string | null {
  if (typeof n !== 'string') return `El ${que} no es válido.`
  if (n.trim() === '') return `Escribe un ${que}.`
  if (n !== n.trim()) return `El ${que} no puede empezar ni terminar con espacios.`
  if ([...n].length > LARGO_MAXIMO_NOMBRE) return `El ${que} es demasiado largo (máximo ${LARGO_MAXIMO_NOMBRE} caracteres).`
  if (PROHIBIDOS.test(n)) return `El ${que} no puede llevar \\ / : * ? " < > | ni caracteres de control.`
  if (/^\.+$/.test(n) || n.endsWith('.')) return `El ${que} no puede ser un punto ni terminar en punto.`
  // Windows reserva el nombre aunque lleve extensión («con.txt»).
  if (RESERVADOS_WINDOWS.test(n.split('.')[0].trimEnd())) return `«${n}» es un nombre reservado del sistema.`
  if (que === 'categoría' && esCategoriaDeKirchi(n)) return `«${CATEGORIAS_DE_KIRCHI.find((c) => c.toLowerCase() === n.toLowerCase())}» es una categoría de las plantillas que trae Kirchi.`
  return null
}

/** Una plantilla de la lista: la lectura trae sus bytes aparte. */
export interface EntradaPlantilla {
  categoria: string
  nombre: string
  /** Tamaño del archivo en bytes. */
  bytes: number
}

export interface ListaPlantillas {
  /** Categorías (carpetas) en orden alfabético, con sus plantillas; las vacías también salen. */
  categorias: { nombre: string; plantillas: EntradaPlantilla[] }[]
  /** Se omitió algo por pasar un tope o por no ser un `.kir` normal. */
  omitidas: number
}

export type ResultadoPlantilla = { ok: true } | { ok: false; error: string; /** El nombre ya existe en esa categoría (el diálogo pregunta si reemplaza). */ existe?: boolean }
/** Borrar una categoría. Con plantillas dentro no se borra hasta que `confirmada` es `true`: contesta `noVacia` con cuántas se irían. */
export type ResultadoBorrarCategoria = { ok: true; borradas: number } | { ok: false; error: string; noVacia?: number }
export type ResultadoLeerPlantilla = { ok: true; bytes: Uint8Array } | { ok: false; error: string }

export const CANALES_PLANTILLAS = {
  listar: 'plantillas:listar',
  leer: 'plantillas:leer',
  guardar: 'plantillas:guardar',
  renombrar: 'plantillas:renombrar',
  mover: 'plantillas:mover',
  borrar: 'plantillas:borrar',
  borrarCategoria: 'plantillas:borrar-categoria',
  mostrar: 'plantillas:mostrar'
} as const

/** Lo que el preload expone como `window.kirchi.plantillas`. */
export interface ApiPlantillas {
  listar(): Promise<ListaPlantillas>
  leer(categoria: string, nombre: string): Promise<ResultadoLeerPlantilla>
  guardar(categoria: string, nombre: string, bytes: Uint8Array, reemplazar: boolean): Promise<ResultadoPlantilla>
  renombrar(categoria: string, nombre: string, nuevo: string): Promise<ResultadoPlantilla>
  mover(categoria: string, nombre: string, nuevaCategoria: string): Promise<ResultadoPlantilla>
  borrar(categoria: string, nombre: string): Promise<ResultadoPlantilla>
  /** Borra una categoría propia; si trae plantillas pide `confirmada` (la interfaz ya preguntó). Nunca borra lo que no es una plantilla. */
  borrarCategoria(categoria: string, confirmada: boolean): Promise<ResultadoBorrarCategoria>
  /** Abre la carpeta de la plantilla (o la raíz si no se nombra categoría) en el explorador del sistema. */
  mostrar(categoria?: string): Promise<void>
}
