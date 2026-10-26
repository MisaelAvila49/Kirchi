import { CATEGORIA_INCLUIDAS, esCategoriaDeKirchi, type ApiPlantillas } from '../../../compartido/plantillas'
import { documentoDeDatos } from '../archivo/kir'
import { normalizar } from '../buscador/buscar'
import type { Fragmento } from '../editor/portapapeles'
import type { PiezaDef } from '../piezas/tipos'
import { fragmentoDeDocumento, LIMITE_PLANTILLA, leerPlantilla, metaLimpia, vistaDeFragmento, type VistaPlantilla } from './plantilla'

/** Una plantilla lista para mostrar y colocar: las incluidas (solo lectura) y las del usuario. */
export interface ItemPlantilla {
  /** `categoria/nombre`: única entre las dos listas porque «Incluidas» no se puede usar como categoría propia. */
  clave: string
  categoria: string
  nombre: string
  descripcion: string
  fragmento: Fragmento
  vista: VistaPlantilla
  incluida: boolean
}

export const claveDe = (categoria: string, nombre: string): string => `${categoria}/${nombre}`

// Las incluidas viven como JSON en `componentes/plantillas/` (las arma `prueba/plantillasIncluidas.ts`): la ficha y el circuito
// con el mismo formato que el `circuito.json` de un `.kir`, validado con las mismas reglas.
const archivos = import.meta.glob('../../../../componentes/plantillas/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** Las plantillas que trae Kirchi, por nombre. Un archivo que no se lee se omite y se dice en `errores`. */
export function plantillasIncluidas(lib: Map<string, PiezaDef>, crudos: Record<string, string> = archivos): { items: ItemPlantilla[]; errores: string[] } {
  const items: ItemPlantilla[] = []
  const errores: string[] = []
  for (const [ruta, texto] of Object.entries(crudos)) {
    try {
      const j = JSON.parse(texto) as { nombre?: unknown; descripcion?: unknown; circuito?: unknown }
      const d = documentoDeDatos(j.circuito)
      const f = d && fragmentoDeDocumento(d.doc)
      const meta = metaLimpia(j)
      if (!f || !meta.nombre) throw new Error('incompleta')
      items.push({ clave: claveDe(CATEGORIA_INCLUIDAS, meta.nombre), categoria: CATEGORIA_INCLUIDAS, nombre: meta.nombre, descripcion: meta.descripcion, fragmento: f, vista: vistaDeFragmento(f, lib), incluida: true })
    } catch {
      errores.push(`La plantilla incluida ${ruta.split('/').pop()} no se pudo leer.`)
    }
  }
  items.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return { items, errores }
}

/** Cuántas plantillas propias se leen como máximo y cuántas lecturas van a la vez por el IPC. */
export const MAX_PROPIAS = 500
export const LECTURAS_A_LA_VEZ = 4

export interface ResultadoCarga {
  items: ItemPlantilla[]
  /** Categorías (carpetas) de las propias, también las vacías: el diálogo de guardar las ofrece. */
  categorias: string[]
  /** Lo que no se pudo leer, con el motivo (va al Registro). */
  errores: string[]
  /** La carpeta traía más de lo que se lista o cosas que no son plantillas. */
  omitidas: number
}

/** Las plantillas de la carpeta del usuario: cada una se lee y se valida como un `.kir`; las que fallan quedan fuera con su motivo. */
export async function cargarPropias(api: ApiPlantillas, lib: Map<string, PiezaDef>): Promise<ResultadoCarga> {
  const lista = await api.listar()
  const errores: string[] = []
  const items: ItemPlantilla[] = []
  const todas = lista.categorias.flatMap((c) => c.plantillas)
  // Tope global: una carpeta enorme no dispara miles de lecturas; lo que sobra se cuenta como omitido.
  const lecturas = todas.slice(0, MAX_PROPIAS)
  const sobran = todas.length - lecturas.length
  const hechas: { e: (typeof lecturas)[number]; r: Awaited<ReturnType<ApiPlantillas['leer']>> | null }[] = new Array(lecturas.length)
  let siguiente = 0
  const trabajador = async () => {
    for (let k = siguiente++; k < lecturas.length; k = siguiente++) {
      const e = lecturas[k]
      // Por el tamaño de la lista se descarta sin leer: un archivo grande no cruza el IPC ni se descomprime.
      if (e.bytes > LIMITE_PLANTILLA) {
        hechas[k] = { e, r: null }
        continue
      }
      const r = await api.leer(e.categoria, e.nombre).catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : 'error del sistema' }))
      hechas[k] = { e, r }
    }
  }
  await Promise.all(Array.from({ length: Math.min(LECTURAS_A_LA_VEZ, lecturas.length) }, trabajador))
  for (const { e, r } of hechas) {
    if (r === null) {
      errores.push(`${e.nombre}: pesa más de ${LIMITE_PLANTILLA / 2 ** 20} MB y no se lee.`)
      continue
    }
    if (!r.ok) {
      errores.push(`${e.nombre}: ${r.error}`)
      continue
    }
    const l = leerPlantilla(r.bytes, e.nombre)
    if (!l.ok) {
      errores.push(`${e.nombre}: ${l.error}`)
      continue
    }
    items.push({
      clave: claveDe(e.categoria, e.nombre),
      categoria: e.categoria,
      nombre: e.nombre,
      // La ficha del archivo puede traer otro nombre; en la lista manda el del archivo (con él se renombra y se borra).
      descripcion: l.meta.descripcion,
      fragmento: l.fragmento,
      vista: vistaDeFragmento(l.fragmento, lib),
      incluida: false
    })
  }
  return { items, categorias: lista.categorias.map((c) => c.nombre), errores, omitidas: lista.omitidas + sobran }
}

/** Plantillas cuyo nombre, categoría o descripción contienen todas las palabras de la consulta (sin acentos ni mayúsculas). */
export function filtrarPlantillas(items: readonly ItemPlantilla[], consulta: string): ItemPlantilla[] {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return [...items]
  return items.filter((i) => {
    const t = normalizar(`${i.nombre} ${i.categoria} ${i.descripcion}`)
    return palabras.every((p) => t.includes(p))
  })
}

/** Las plantillas por categoría: las incluidas al final, las propias en orden alfabético. */
export function porCategoria(items: readonly ItemPlantilla[], categoriasVacias: readonly string[] = []): { nombre: string; incluida: boolean; items: ItemPlantilla[] }[] {
  const mapa = new Map<string, ItemPlantilla[]>()
  for (const c of categoriasVacias) mapa.set(c, [])
  for (const i of items) mapa.set(i.categoria, [...(mapa.get(i.categoria) ?? []), i])
  return [...mapa.entries()]
    .map(([nombre, its]) => ({ nombre, incluida: esCategoriaDeKirchi(nombre), items: its.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) }))
    .sort((a, b) => Number(a.incluida) - Number(b.incluida) || a.nombre.localeCompare(b.nombre, 'es'))
}
