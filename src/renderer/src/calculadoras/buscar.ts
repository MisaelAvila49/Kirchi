import { normalizar } from '../buscador/buscar'
import { CALCULADORAS, type IdCalculadora } from './catalogo'

/** Una calculadora que Ctrl+K encuentra (o el panel entero, con `id` nulo). */
export interface HalladoCalculadora {
  id: IdCalculadora | null
  texto: string
}

const PANEL: HalladoCalculadora & { palabras: string } = { id: null, texto: 'Calculadoras', palabras: 'calculadoras panel calculos' }

/** Calculadoras que encuentra una consulta. Como con las plantillas, solo cuentan palabras de 3 letras o más: con «r»
 * saldría todo. */
export function buscarCalculadoras(consulta: string, max = 4): HalladoCalculadora[] {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean)
  if (palabras.length === 0 || palabras.some((p) => p.length < 3)) return []
  const todas = [PANEL, ...CALCULADORAS.map((d) => ({ id: d.id as IdCalculadora | null, texto: `Calculadora de ${d.nombre[0].toLowerCase()}${d.nombre.slice(1)}`, palabras: `calculadora calculadoras ${d.palabras} ${d.nombre}` }))]
  return todas
    .filter((c) => {
      const t = normalizar(`${c.texto} ${c.palabras}`)
      return palabras.every((p) => t.includes(p))
    })
    .slice(0, max)
    .map(({ id, texto }) => ({ id, texto }))
}
