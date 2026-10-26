import { normalizar } from '../buscador/buscar'
import type { Atajos } from '../editor/teclado'
import { MAX_TECLAS_POR_COMANDO } from '../../../compartido/ajustes'
import { hojaDeAtajos } from './hojaDeAtajos'

export interface FilaConfig {
  id: string
  nombre: string
  teclas: string[]
  /** Se aparta de las teclas de fábrica: la fila ofrece «Restaurar». */
  propio: boolean
}

export interface GrupoConfig {
  nombre: string
  filas: FilaConfig[]
}

/** «ctrl + d» y «Ctrl+D» se buscan igual. */
const sinEspacios = (t: string) => normalizar(t).replace(/\s+/g, '')

/** Configuración › Atajos: comandos agrupados con sus teclas vigentes. El filtro busca en nombre y teclas. */
export function gruposDeConfig(a: Atajos, filtro = ''): GrupoConfig[] {
  const f = sinEspacios(filtro)
  return hojaDeAtajos(a)
    .map((g) => ({
      nombre: g.nombre,
      filas: g.filas
        .map((fila) => ({ id: fila.id, nombre: fila.nombre, teclas: a.teclasDe(fila.id), propio: a.esPropio(fila.id) }))
        .filter((fila) => !f || sinEspacios(fila.nombre).includes(f) || fila.teclas.some((t) => sinEspacios(t).includes(f)))
    }))
    .filter((g) => g.filas.length > 0)
}

export type Asignacion =
  | { tipo: 'hecho' }
  /** La combinación ya es de otro comando: se pregunta antes de quitársela. */
  | { tipo: 'conflicto'; con: string; nombre: string; texto: string }
  | { tipo: 'repetida' }
  | { tipo: 'llena'; texto: string }

/**
 * Agrega `comb` a las teclas de `id`. Ante un conflicto devuelve el otro comando, salvo con `reemplazar`. Máximo cuatro por comando.
 */
export function agregarTecla(a: Atajos, id: string, comb: string, reemplazar = false): Asignacion {
  const actuales = a.teclasDe(id)
  if (actuales.includes(comb)) return { tipo: 'repetida' }
  if (actuales.length >= MAX_TECLAS_POR_COMANDO) return { tipo: 'llena', texto: `Un comando lleva como mucho ${MAX_TECLAS_POR_COMANDO} combinaciones: quita una antes.` }
  const otro = a.dueño(comb, id)
  if (otro && !reemplazar) {
    const nombre = a.nombreDe(otro) ?? otro
    return { tipo: 'conflicto', con: otro, nombre, texto: `${comb} ya es ${nombre}.` }
  }
  if (otro) a.ponerTeclas(otro, a.teclasDe(otro).filter((t) => t !== comb))
  a.ponerTeclas(id, [...actuales, comb])
  return { tipo: 'hecho' }
}

/**
 * Devuelve un comando a sus teclas de fábrica. Ante un conflicto no cambia nada, salvo con `reemplazar`: nunca queda una tecla en dos comandos.
 */
export function restaurarComando(a: Atajos, id: string, reemplazar = false): Asignacion {
  const choques = a.teclasDeFabrica(id).flatMap((t) => {
    const otro = a.dueño(t, id)
    return otro ? [{ t, otro }] : []
  })
  if (choques.length > 0 && !reemplazar) {
    const { t, otro } = choques[0]
    const nombre = a.nombreDe(otro) ?? otro
    return { tipo: 'conflicto', con: otro, nombre, texto: `${t} ya es ${nombre}.` }
  }
  for (const { t, otro } of choques) a.ponerTeclas(otro, a.teclasDe(otro).filter((x) => x !== t))
  a.restaurarUno(id)
  return { tipo: 'hecho' }
}

/** Quita una combinación de un comando (puede quedar sin ninguna). */
export function quitarTecla(a: Atajos, id: string, comb: string): void {
  a.ponerTeclas(id, a.teclasDe(id).filter((t) => t !== comb))
}
