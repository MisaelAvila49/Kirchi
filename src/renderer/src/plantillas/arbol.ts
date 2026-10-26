import { esCategoriaDeKirchi } from '../../../compartido/plantillas'
import { porCategoria, type ItemPlantilla } from './almacen'

/** Una fila visible del panel Plantillas: el encabezado de una categoría o una plantilla de una categoría abierta. */
export type FilaArbol =
  | { tipo: 'categoria'; id: string; nombre: string; abierta: boolean; total: number; incluida: boolean }
  | { tipo: 'plantilla'; id: string; padre: string; item: ItemPlantilla }

/** Filas visibles de arriba abajo: cada categoría seguida de sus plantillas si está abierta. Al buscar se abren todas (lo
 * que no coincide ya se filtró) y las categorías vacías no se listan. */
export function filasDelArbol(items: readonly ItemPlantilla[], categoriasVacias: readonly string[], plegadas: ReadonlySet<string>, buscando: boolean): FilaArbol[] {
  const filas: FilaArbol[] = []
  for (const g of porCategoria(items, buscando ? [] : categoriasVacias)) {
    const abierta = buscando || !plegadas.has(g.nombre)
    filas.push({ tipo: 'categoria', id: g.nombre, nombre: g.nombre, abierta, total: g.items.length, incluida: esCategoriaDeKirchi(g.nombre) })
    if (abierta) for (const item of g.items) filas.push({ tipo: 'plantilla', id: item.clave, padre: g.nombre, item })
  }
  return filas
}

/** La lista de categorías plegadas después de alternar una (la que se guarda en los ajustes). */
export function alternarPlegada(plegadas: readonly string[], nombre: string): string[] {
  return plegadas.includes(nombre) ? plegadas.filter((n) => n !== nombre) : [...plegadas, nombre]
}

export interface MovimientoArbol {
  /** Fila que queda con el foco. */
  indice: number
  /** Categoría que se pliega o se abre. */
  alternar?: string
  /** Colocar la plantilla de la fila. */
  colocar?: boolean
}

/** Teclado del árbol (patrón WAI-ARIA de TreeView): flechas, Inicio, Fin, derecha e izquierda para abrir y plegar, Enter y espacio. */
export function teclaArbol(filas: readonly FilaArbol[], indice: number, tecla: string): MovimientoArbol | null {
  if (filas.length === 0) return { indice: 0 }
  const i = Math.min(Math.max(indice, 0), filas.length - 1)
  const f = filas[i]
  switch (tecla) {
    case 'ArrowDown':
      return { indice: Math.min(i + 1, filas.length - 1) }
    case 'ArrowUp':
      return { indice: Math.max(i - 1, 0) }
    case 'Home':
      return { indice: 0 }
    case 'End':
      return { indice: filas.length - 1 }
    case 'ArrowRight':
      if (f.tipo !== 'categoria') return { indice: i }
      return f.abierta ? { indice: f.total > 0 ? i + 1 : i } : { indice: i, alternar: f.id }
    case 'ArrowLeft':
      if (f.tipo === 'categoria') return f.abierta ? { indice: i, alternar: f.id } : { indice: i }
      return { indice: filas.findIndex((x) => x.tipo === 'categoria' && x.id === f.padre) }
    case 'Enter':
    case ' ':
      return f.tipo === 'categoria' ? { indice: i, alternar: f.id } : { indice: i, colocar: true }
    default:
      return null
  }
}

/** F2 y Supr sobre una plantilla propia: renombrar y borrar (las incluidas son de solo lectura). */
export function acelerador(fila: FilaArbol | undefined, tecla: string): 'renombrar' | 'borrar' | null {
  if (!fila || fila.tipo !== 'plantilla' || fila.item.incluida) return null
  return tecla === 'F2' ? 'renombrar' : tecla === 'Delete' ? 'borrar' : null
}

/** Supr sobre una categoría propia: borrarla (las de Kirchi no son carpetas y no se tocan). */
export function aceleradorCategoria(fila: FilaArbol | undefined, tecla: string): 'borrar' | null {
  return fila && fila.tipo === 'categoria' && !fila.incluida && tecla === 'Delete' ? 'borrar' : null
}
