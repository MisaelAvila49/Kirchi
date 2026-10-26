// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { escribirKir, leerKir } from '../../archivo/kir'
import { calcularConexiones, clavePin } from '../../conexiones/conexiones'
import { avisosDeMultimetros } from '../../netlist/multimetros'
import { compilarNetlist } from '../../netlist/netlist'
import { libreriaDePrueba } from '../../prueba/libreria'
import { arranqueDeCapitulo } from './arranques'
import { CAPITULOS } from './capitulos'
import { circuitoCerrado, medidorConSonda, medidorEnSerie, piezasDe, tierraEnLaFuente } from './condiciones'
import type { CtxTutorial } from './tipos'

const lib = libreriaDePrueba().piezas
const ctxDe = (id: string): CtxTutorial => {
  const doc = arranqueDeCapitulo(id)!
  return { doc, con: calcularConexiones(doc, lib), lib, fase: 'detenida', centro: { x: 0, y: 0 } }
}

describe('circuitos de arranque de los capítulos 2 a 5', () => {
  it('cada capítulo con arranque tiene el suyo y el capítulo 1 no', () => {
    expect(CAPITULOS.filter((c) => c.arranque).map((c) => c.id)).toEqual(['medir', 'senales', 'archivo', 'trucos'])
    for (const c of CAPITULOS) expect(arranqueDeCapitulo(c.id) !== undefined, c.id).toBe(!!c.arranque)
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
      // Ni un multímetro conectado al revés de lo que mide: el tutorial no arranca con un aviso en el inspector.
      expect(avisosDeMultimetros(ctx.doc, lib, ctx.con), c.id).toEqual([])
    }
  })

  it('el capítulo 2 arranca con el circuito cerrado y su tierra, y con nada medido todavía', () => {
    const ctx = ctxDe('medir')
    expect(circuitoCerrado(ctx)).toBe(true)
    expect(tierraEnLaFuente(ctx)).toBe(true)
    expect(piezasDe(ctx, 'multimetro')).toEqual([])
    expect(CAPITULOS[1].pasos[0].hecho(ctx)).toBe(false)
  })

  it('el capítulo 3 arranca con un multímetro de voltaje con sonda y otro en serie en A DC', () => {
    const ctx = ctxDe('senales')
    const [m1, m2] = [ctx.doc.piezas.m1, ctx.doc.piezas.m2]
    expect(medidorConSonda(ctx)?.id).toBe('m1')
    expect(medidorEnSerie(ctx, m1)).toBe(false)
    expect(medidorEnSerie(ctx, m2)).toBe(true)
    expect(m2.props.modo).toBe('A DC')
    expect(circuitoCerrado(ctx)).toBe(false)
  })

  it('los capítulos 4 y 5 arrancan con el circuito del 3 terminado y sus pasos de entrada por hacer', () => {
    for (const id of ['archivo', 'trucos']) {
      const ctx = ctxDe(id)
      const g = piezasDe(ctx, 'generador')[0]
      expect(g.props).toMatchObject({ forma: 'Cuadrada', frecuencia: '1' })
      expect(piezasDe(ctx, 'fuente-dc')).toEqual([])
      expect(CAPITULOS.find((c) => c.id === 'senales')!.pasos.filter((p) => !['simular', 'tiempo', 'disparo', 'cursores'].includes(p.id)).every((p) => p.hecho(ctx)), id).toBe(true)
      expect(ctx.con.redDePin.get(clavePin('xsc', 'A'))).toBeDefined()
      expect(ctx.con.redDePin.get(clavePin('xsc', 'B'))).toBeDefined()
    }
  })

  it('el capítulo 5 trae la nota para mover con Alt, dentro de la rejilla de 2.5 mm', () => {
    const doc = arranqueDeCapitulo('trucos')!
    const n = Object.values(doc.notas)
    expect(n).toHaveLength(1)
    expect(n[0].x % 2 === 0).toBe(true)
    expect(n[0].y % 2 === 0).toBe(true)
    expect(Object.keys(arranqueDeCapitulo('archivo')!.notas)).toEqual([])
  })
})
