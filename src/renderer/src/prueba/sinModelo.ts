import type { PiezaDef } from '../piezas/tipos'

/** La librería con una pieza más, «sin-modelo» (la resistencia sin `modelo`), para probar el aviso «todavía no tiene
 * modelo eléctrico» ahora que todas las piezas simulan. */
export function conPiezaSinModelo(lib: Map<string, PiezaDef>): Map<string, PiezaDef> {
  const r = lib.get('resistencia')!
  const { modelo: _, ...sin } = r
  return new Map([...lib, ['sin-modelo', { ...sin, id: 'sin-modelo', nombre: { es: 'Pieza sin modelo', en: 'Part without model' } }]])
}
