// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor, type PedidoCampos, type PedidoTexto } from './Editor'
import { pantallaDeMedidor } from '../lienzo/medidores'

const lib = libreriaDePrueba().piezas

function abrir(en: { x: number; y: number }) {
  const d = divisor()
  d.etiquetas.e = { id: 'e', nombre: 'VIN', x: 0, y: -6, rot: 0 }
  const pedidos: (PedidoTexto | PedidoCampos)[] = []
  const ed = new Editor(lib, d, idSecuencial(), { editarTexto: (p) => pedidos.push(p), registrar: () => {} })
  ed.tolerancia = 0.5
  ed.medirCon({ tipo: 'cable', id: 'c_a', en }, { con: 'medidor' })
  const m = Object.values(ed.doc.sondas!).find((s) => s.tipo === 'medidor')!
  return { ed, pedidos, m }
}
const campos = (p: PedidoTexto | PedidoCampos | undefined): PedidoCampos => {
  expect(p?.tipo).toBe('pieza')
  return p as PedidoCampos
}
const centro = (m: Parameters<typeof pantallaDeMedidor>[0]) => {
  const c = pantallaDeMedidor(m).caja
  return { x: (c.minX + c.maxX) / 2, y: (c.minY + c.maxY) / 2 }
}

describe('doble clic en el medidor rápido', () => {
  it('abre Referencia, Mide (Voltaje | Corriente) y Modo (DC | AC (RMS)) con lo que ya mide', () => {
    const { ed, pedidos, m } = abrir({ x: 0, y: -6 })
    ed.dobleClic(centro(m))
    const p = campos(pedidos[0])
    expect(p.campos.map((c) => [c.id, c.titulo, c.inicial, c.opciones])).toEqual([
      ['ref', 'Referencia', 'M1', undefined],
      ['prop:mide', 'Mide', 'Voltaje', ['Voltaje', 'Corriente']],
      ['prop:modo', 'Modo', 'DC', ['DC', 'AC (RMS)']]
    ])
  })

  it('cambia el modo a AC (RMS) y la referencia en un solo paso de deshacer', () => {
    const { ed, pedidos, m } = abrir({ x: 0, y: -6 })
    ed.dobleClic(centro(m))
    expect(campos(pedidos[0]).aceptar(['m5', 'Voltaje', 'AC (RMS)'])).toBeNull()
    expect(ed.doc.sondas![m.id]).toMatchObject({ ref: 'M5', magnitud: 'voltaje', modo: 'ac' })
    ed.deshacer()
    expect(ed.doc.sondas![m.id]).toMatchObject({ ref: 'M1', modo: 'dc' })
  })

  it('Corriente fuera del interior de un cable dice por qué no; sobre un tramo de cable se puede', () => {
    const { ed, pedidos, m } = abrir({ x: 0, y: -4 })
    ed.dobleClic(centro(m))
    const p = campos(pedidos[0])
    expect(p.revisar(['M1', 'Corriente', 'DC'])[1].error).toBe('Pon el medidor sobre un cable para medir corriente.')
    expect(p.aceptar(['M1', 'Corriente', 'DC'])).toEqual({ campo: 1, error: 'Pon el medidor sobre un cable para medir corriente.' })
    const b = abrir({ x: 0, y: -6 })
    b.ed.dobleClic(centro(b.m))
    expect(campos(b.pedidos[0]).aceptar(['M1', 'Corriente', 'DC'])).toBeNull()
    expect(b.ed.doc.sondas![b.m.id]).toMatchObject({ magnitud: 'corriente', modo: 'dc' })
  })

  it('pasar a corriente un medidor en AC lo vuelve DC en el mismo paso; pedir AC en corriente se rechaza', () => {
    const { ed, pedidos, m } = abrir({ x: 0, y: -6 })
    ed.cambiarMedidor(m.id, { modo: 'ac' })
    ed.dobleClic(centro(ed.doc.sondas![m.id]))
    const p = campos(pedidos[0])
    expect(p.revisar(['M1', 'Corriente', 'AC (RMS)'])[2]).toEqual({ sigue: 'DC' })
    expect(p.aceptar(['M1', 'Corriente', 'DC'])).toBeNull()
    expect(ed.doc.sondas![m.id]).toMatchObject({ magnitud: 'corriente', modo: 'dc' })
    ed.deshacer()
    expect(ed.doc.sondas![m.id]).toMatchObject({ magnitud: 'voltaje', modo: 'ac' })
    expect(p.aceptar(['M1', 'Corriente', 'AC (RMS)'])).toBeNull()
    expect(ed.doc.sondas![m.id]).toMatchObject({ magnitud: 'corriente', modo: 'dc' })
  })

  it('con otra referencia repetida rechaza en el campo 0 y simulando no abre', () => {
    const { ed, pedidos, m } = abrir({ x: 0, y: -4 })
    ed.dobleClic(centro(m))
    expect(campos(pedidos[0]).aceptar(['R1', 'Voltaje', 'DC'])?.campo).toBe(0)
    ed.simulando = true
    ed.dobleClic(centro(m))
    expect(pedidos).toHaveLength(1)
  })
})

describe('convertir un medidor de corriente', () => {
  it('no cambia el documento y da el aviso del lienzo con el motivo (y devuelve el mismo motivo)', () => {
    const avisos: string[] = []
    const d = divisor()
    d.etiquetas.e = { id: 'e', nombre: 'VIN', x: 0, y: -6, rot: 0 }
    const ed = new Editor(lib, d, idSecuencial(), { editarTexto: () => {}, registrar: () => {}, avisoLienzo: (t) => avisos.push(t) })
    ed.tolerancia = 0.5
    ed.medirCon({ tipo: 'cable', id: 'c_a', en: { x: 0, y: -6 } }, { con: 'medidor' })
    const m = Object.values(ed.doc.sondas!).find((s) => s.tipo === 'medidor')!
    expect(ed.cambiarMedidor(m.id, { magnitud: 'corriente' })).toBeNull()
    const antes = ed.doc
    const motivo = 'Para medir corriente con el multímetro completo, intercálalo en serie: pon el multímetro en el cable.'
    expect(ed.convertirEnMultimetro(m.id)).toBe(motivo)
    expect(avisos).toEqual([motivo])
    expect(ed.doc).toBe(antes)
    expect(ed.doc.sondas![m.id].tipo).toBe('medidor')
  })
})

describe('mover la pantalla del medidor rápido', () => {
  const arrastrarPantalla = (alt: boolean) => {
    const { ed, m } = abrir({ x: 0, y: -6 })
    const c = centro(m)
    ed.abajo(c, { alt })
    ed.mover({ x: c.x + 1.37, y: c.y + 0.62 }, { alt })
    ed.arriba({ x: c.x + 1.37, y: c.y + 0.62 }, { alt })
    return { antes: m.pantalla!, despues: (ed.doc.sondas![m.id] as typeof m).pantalla! }
  }
  it('sin Alt va en unidades enteras', () => {
    const { antes, despues } = arrastrarPantalla(false)
    expect(Number.isInteger(despues.dx) && Number.isInteger(despues.dy)).toBe(true)
    expect(despues).not.toEqual(antes)
  })
  it('con Alt va libre, a centésimas, y sigue acotada a 8 unidades', () => {
    const { antes, despues } = arrastrarPantalla(true)
    expect(despues.dx).toBeCloseTo(antes.dx + 1.37, 2)
    expect(despues.dy).toBeCloseTo(antes.dy + 0.62, 2)
    const { ed, m } = abrir({ x: 0, y: -6 })
    const c = centro(m)
    ed.abajo(c, { alt: true })
    ed.mover({ x: c.x + 30.123, y: c.y }, { alt: true })
    ed.arriba({ x: c.x + 30.123, y: c.y }, { alt: true })
    expect((ed.doc.sondas![m.id] as typeof m).pantalla!.dx).toBe(8)
  })
})
