import type { ColeccionDoc, Documento, Id } from './tipos'

/** Un elemento antes y después; sin `antes` es alta, sin `despues` es baja. */
export interface Cambio {
  col: ColeccionDoc
  id: Id
  antes?: unknown
  despues?: unknown
}

/** `grupo` une comandos consecutivos del mismo gesto (un arrastre) en un solo paso de deshacer. */
export interface Comando {
  nombre: string
  cambios: Cambio[]
  grupo?: string
}

/** Tipo de los elementos de una colección. */
export type Item<C extends ColeccionDoc> = NonNullable<Documento[C]>[Id]

export function aplicar(doc: Documento, cmd: Comando): Documento {
  const nuevo: Documento = { ...doc }
  const copiadas = new Set<ColeccionDoc>()
  for (const c of cmd.cambios) {
    if (!copiadas.has(c.col)) {
      ;(nuevo as unknown as Record<ColeccionDoc, Record<Id, unknown>>)[c.col] = { ...doc[c.col] }
      copiadas.add(c.col)
    }
    const col = nuevo[c.col] as Record<Id, unknown>
    if (c.despues === undefined) delete col[c.id]
    else col[c.id] = c.despues
  }
  return nuevo
}

export function invertir(cmd: Comando): Comando {
  return {
    nombre: cmd.nombre,
    grupo: cmd.grupo,
    cambios: [...cmd.cambios].reverse().map((c) => ({ col: c.col, id: c.id, antes: c.despues, despues: c.antes }))
  }
}

export function fusionar(a: Comando, b: Comando): Comando {
  const cambios = a.cambios.map((c) => ({ ...c }))
  const pos = new Map<string, number>()
  cambios.forEach((c, i) => pos.set(`${c.col}\0${c.id}`, i))
  for (const c of b.cambios) {
    const k = `${c.col}\0${c.id}`
    const i = pos.get(k)
    if (i === undefined) {
      pos.set(k, cambios.length)
      cambios.push({ ...c })
    } else cambios[i] = { ...cambios[i], despues: c.despues }
  }
  return { nombre: a.nombre, grupo: a.grupo, cambios: cambios.filter((c) => c.antes !== undefined || c.despues !== undefined) }
}

export const crear = <C extends ColeccionDoc>(nombre: string, col: C, item: Item<C>, grupo?: string): Comando => ({
  nombre,
  grupo,
  cambios: [{ col, id: item.id, despues: item }]
})

export const borrar = <C extends ColeccionDoc>(nombre: string, col: C, item: Item<C>, grupo?: string): Comando => ({
  nombre,
  grupo,
  cambios: [{ col, id: item.id, antes: item }]
})

export const modificar = <C extends ColeccionDoc>(nombre: string, col: C, antes: Item<C>, despues: Item<C>, grupo?: string): Comando => ({
  nombre,
  grupo,
  cambios: [{ col, id: antes.id, antes, despues }]
})

export const juntar = (nombre: string, cmds: Comando[], grupo?: string): Comando => ({
  nombre,
  grupo,
  cambios: cmds.flatMap((c) => c.cambios)
})
