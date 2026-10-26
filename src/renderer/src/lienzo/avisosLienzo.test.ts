// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { Pieza } from '../doc/tipos'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { cajaTexto } from './apartar'
import { EscritorTrazos, FLOTANTES_TRAZO } from './buffers'
import { arcosDeZumbador, flechaDeSentido } from './avisosLienzo'
import { construirEscena } from './escena'
import { PALETA_CLARA } from './paleta'

const lib = libreriaDePrueba().piezas
const pieza = (id: string, tipo: string, ref: string): Pieza => ({ id, tipo, ref, x: 0, y: 0, rot: 0, espejo: false, props: {} })

/** Los segmentos que dibujó un escritor, como cajas de sus puntas. */
function puntos(t: EscritorTrazos): [number, number][] {
  const d = t.resultado()
  const out: [number, number][] = []
  for (let k = 0; k < t.cuenta; k++) out.push([d[k * FLOTANTES_TRAZO], d[k * FLOTANTES_TRAZO + 1]], [d[k * FLOTANTES_TRAZO + 2], d[k * FLOTANTES_TRAZO + 3]])
  return out
}

describe('las marcas de la vista previa no tapan los textos de su pieza', () => {
  for (const [tipo, ref, marcar] of [
    ['motor-dc', 'M1', (t: EscritorTrazos, p: Pieza, cajas: ReturnType<typeof cajaTexto>[]) => flechaDeSentido(t, p, 1, PALETA_CLARA, cajas)],
    ['zumbador', 'BZ1', (t: EscritorTrazos, p: Pieza, cajas: ReturnType<typeof cajaTexto>[]) => arcosDeZumbador(t, p, PALETA_CLARA, cajas)]
  ] as const) {
    it(`${tipo}: la marca va del lado del cuerpo que no tiene la referencia ni el valor`, () => {
      const d = documentoVacio()
      const p = pieza('p', tipo, ref)
      d.piezas.p = p
      const esc = construirEscena(d, lib, calcularConexiones(d, lib), PALETA_CLARA)
      const cajas = esc.textos.map((x) => cajaTexto(x, 0))
      expect(cajas.length).toBeGreaterThan(0)
      const t = new EscritorTrazos()
      marcar(t, p, cajas)
      const dentro = puntos(t).filter(([x, y]) => cajas.some((c) => x > c.minX && x < c.maxX && y > c.minY && y < c.maxY))
      expect(dentro).toEqual([])
    })
  }
})
