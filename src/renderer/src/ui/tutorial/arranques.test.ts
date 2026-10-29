// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { escribirKir, leerKir } from '../../archivo/kir'
import { calcularConexiones } from '../../conexiones/conexiones'
import { compilarNetlist } from '../../netlist/netlist'
import { avisosDeMultimetros } from '../../netlist/multimetros'
import { libreriaDePrueba } from '../../prueba/libreria'
import { arranqueDeCapitulo } from './arranques'
import { CAPITULOS } from './capitulos'
import { circuitoCerrado, medidorConSonda, piezasDe, tierraEnLaFuente } from './condiciones'
import type { CtxTutorial } from './tipos'

const lib = libreriaDePrueba().piezas
const ctxDe = (id: string): CtxTutorial => {
  const doc = arranqueDeCapitulo(id)!
  return { doc, con: calcularConexiones(doc, lib), lib, fase: 'detenida', centro: { x: 0, y: 0 } }
}

describe('circuitos de arranque: cada capítulo se puede hacer solo', () => {
  it('Conoce Kirchi y Medir traen el suyo; Tu primer circuito y Analizar parten de un lienzo vacío', () => {
    expect(CAPITULOS.filter((c) => c.arranque).map((c) => c.id)).toEqual(['conoce', 'medir-senales'])
    expect(CAPITULOS.filter((c) => c.documentoNuevo).map((c) => c.id)).toEqual(['circuito', 'analizar'])
    for (const c of CAPITULOS) expect(arranqueDeCapitulo(c.id) !== undefined, c.id).toBe(!!c.arranque)
    // Ningún capítulo necesita lo que dejó otro: cada uno trae su circuito o empieza vacío.
    for (const c of CAPITULOS) expect(!!c.arranque || !!c.documentoNuevo, c.id).toBe(true)
  })

  it('se escriben y se leen como un .kir sin perder nada ni dar avisos', () => {
    for (const c of CAPITULOS.filter((x) => x.arranque)) {
      const doc = arranqueDeCapitulo(c.id)!
      const leido = leerKir(escribirKir(doc, '0.0.1'))
      expect(leido.ok, c.id).toBe(true)
      if (leido.ok) {
        expect(leido.avisos, c.id).toEqual([])
        expect(leido.soloLectura, c.id).toBe(false)
        expect(leido.doc, c.id).toEqual(doc)
      }
    }
  })

  it('compilan la netlist sin errores ni avisos', () => {
    for (const c of CAPITULOS.filter((x) => x.arranque)) {
      const ctx = ctxDe(c.id)
      const r = compilarNetlist(ctx.doc, lib, ctx.con)
      expect(r.errores, c.id).toEqual([])
      expect(r.avisos, c.id).toEqual([])
      expect(r.netlist, c.id).not.toBeNull()
      expect(avisosDeMultimetros(ctx.doc, lib, ctx.con), c.id).toEqual([])
    }
  })

  it('el circuito de arranque es la fuente, la resistencia de 1 kΩ, el LED girado y la tierra, ya cerrado, sin instrumentos', () => {
    for (const id of ['conoce', 'medir-senales']) {
      const ctx = ctxDe(id)
      expect(circuitoCerrado(ctx), id).toBe(true)
      expect(tierraEnLaFuente(ctx), id).toBe(true)
      expect(piezasDe(ctx, 'multimetro'), id).toEqual([])
      expect(piezasDe(ctx, 'osciloscopio'), id).toEqual([])
      expect(medidorConSonda(ctx), id).toBeUndefined()
      expect(ctx.doc.sondas ?? {}, id).toEqual({})
    }
  })

  it('Medir arranca con sus tres primeros pasos por hacer', () => {
    const ctx = ctxDe('medir-senales')
    const cap = CAPITULOS.find((c) => c.id === 'medir-senales')!
    for (const id of ['medidor-rapido', 'multimetro', 'sonda']) expect(cap.pasos.find((p) => p.id === id)!.hecho(ctx), id).toBe(false)
  })
})
