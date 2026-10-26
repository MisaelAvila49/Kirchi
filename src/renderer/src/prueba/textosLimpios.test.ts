// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { cuerpoEnMundo } from '../editor/colision'
import { tramoCruzaCaja } from '../editor/conflictos'
import { cajaTexto, etiquetasSinChoques } from '../lienzo/apartar'
import { libreriaDePrueba } from './libreria'
import { construir, DEFINICIONES } from './plantillasIncluidas'

const lib = libreriaDePrueba().piezas

/** Lo que se ve en una plantilla nueva: cada referencia y valor junto a su pieza, sin pisar texto, cuerpo ni cable. Los
 * textos ya están fijos (`construir` los fija donde los puso el reparto). */
const NUEVAS = ['filtro-pasa-banda', 'filtro-rechaza-banda', 'filtro-notch-doble-t']

function choques(id: string): string[] {
  const def = DEFINICIONES.find((d) => d.id === id)!
  const d = construir(def, lib)
  const textos = etiquetasSinChoques(d, lib)
  const cajas: { de: string; caja: ReturnType<typeof cajaTexto> }[] = []
  for (const [pid, ts] of textos) ts.forEach((t, i) => t && cajas.push({ de: `${d.piezas[pid].ref}#${i}`, caja: cajaTexto(t) }))
  const fallas: string[] = []
  const cruzan = (a: ReturnType<typeof cajaTexto>, b: ReturnType<typeof cajaTexto>) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY
  cajas.forEach((a, i) => {
    // La referencia y el valor de una misma pieza van apilados a propósito (renglones pegados): solo cuentan textos de piezas distintas.
    for (const b of cajas.slice(i + 1)) if (a.de.split('#')[0] !== b.de.split('#')[0] && cruzan(a.caja, b.caja)) fallas.push(`${a.de} pisa a ${b.de}`)
    for (const p of Object.values(d.piezas)) {
      if (a.de.startsWith(`${p.ref}#`)) continue
      const q = cuerpoEnMundo(p, lib.get(p.tipo), 0)
      if (cruzan(a.caja, q)) fallas.push(`${a.de} pisa el cuerpo de ${p.ref}`)
    }
    // Y queda cerca de su pieza (a lo más 5 unidades entre el texto y el cuerpo), para que se lea de quién es.
    const propia = Object.values(d.piezas).find((p) => a.de.startsWith(`${p.ref}#`))!
    const cp = cuerpoEnMundo(propia, lib.get(propia.tipo), 0)
    const dx = Math.max(0, a.caja.minX - cp.maxX, cp.minX - a.caja.maxX), dy = Math.max(0, a.caja.minY - cp.maxY, cp.minY - a.caja.maxY)
    if (Math.hypot(dx, dy) > 5) fallas.push(`${a.de} queda lejos de su pieza (${Math.hypot(dx, dy).toFixed(1)})`)
    for (const c of Object.values(d.cables)) for (let k = 1; k < c.puntos.length; k++) if (tramoCruzaCaja(c.puntos[k - 1], c.puntos[k], a.caja)) fallas.push(`${a.de} pisa un cable`)
  })
  return [...new Set(fallas)]
}

describe('plantillas nuevas: textos sin encimarse', () => {
  it.each(NUEVAS)('%s', (id) => {
    expect(choques(id)).toEqual([])
  })
})
