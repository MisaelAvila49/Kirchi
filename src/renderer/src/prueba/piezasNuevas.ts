import type { ModeloDef, PiezaDef, PropDef } from '../piezas/tipos'
import { libreriaDePrueba } from './libreria'

/** Una pieza de prueba con la geometría de la resistencia y los pines en columna, a 2 unidades. */
export function piezaDePrueba(id: string, pines: string[], props: PropDef[], modelo: ModeloDef, prefijo = 'U'): PiezaDef {
  const base = libreriaDePrueba().piezas.get('resistencia')!
  return { ...base, id, prefijo, pines: pines.map((p, k) => ({ id: p, nombre: p, x: 0, y: 2 * k })), props, modelo }
}

/** La librería de prueba con las piezas dadas añadidas. */
export const conPiezas = (...defs: PiezaDef[]): Map<string, PiezaDef> => {
  const lib = new Map(libreriaDePrueba().piezas)
  for (const d of defs) lib.set(d.id, d)
  return lib
}

export const perilla = (id: string, nombre: string, unidad: string, defecto: string, min: number, max: number, escala?: 'log'): PropDef => ({
  id, nombre, unidad, defecto, enVivo: { magnitud: unidad === 'lx' ? 'luz' : unidad === 'N·m' ? 'carga' : 'temperatura', min, max, paso: 1, pasoFino: 0.1, ...(escala ? { escala } : {}) }
})
