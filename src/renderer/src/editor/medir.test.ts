// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { aplicar } from '../doc/comandos'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Documento } from '../doc/tipos'
import { pantallaLibre } from './sondas'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { comandoMedir, type PedidoMedir } from './medir'
import { Editor } from './Editor'
import { seleccionDe } from './seleccion'
import { copiar, pegar } from './portapapeles'

const lib = libreriaDePrueba().piezas
const piezasDe = (d: Documento, tipo: string) => Object.values(d.piezas).filter((p) => p.tipo === tipo)
const sondas = (d: Documento) => Object.values(d.sondas ?? {})

/** Mide en el cable `cable` del documento, en el punto `en`; da el documento nuevo o el error. */
function medir(d: Documento, cable: string, en: { x: number; y: number }, pedido: PedidoMedir, gen = idSecuencial()): Documento | string {
  const con = calcularConexiones(d, lib)
  const r = comandoMedir(d, lib, con, con.redDeCable.get(cable)!, en, pedido, gen, cable)
  return 'error' in r ? r.error : aplicar(d, r.cmd)
}

describe('medir con el clic derecho pone sondas', () => {
  it('con el osciloscopio: coloca XSC1 y pone la sonda A en el punto, sin etiquetas, en un solo paso', () => {
    const d = divisor()
    const con = calcularConexiones(d, lib)
    const r = comandoMedir(d, lib, con, con.redDeCable.get('c_a')!, { x: 0, y: -8 }, { con: 'osciloscopio', canal: 'A' }, idSecuencial(), 'c_a')
    if ('error' in r) throw new Error(r.error)
    const d2 = aplicar(d, r.cmd)
    const [osc] = piezasDe(d2, 'osciloscopio')
    expect(osc.ref).toBe('XSC1')
    expect(r.instrumento).toBe(osc.id)
    expect(Object.keys(d2.etiquetas)).toEqual([])
    expect(sondas(d2)).toEqual([{ id: r.sonda, tipo: 'osciloscopio', x: 0, y: -8, instrumento: osc.id, entrada: 'A' }])
    const con2 = calcularConexiones(d2, lib)
    expect(con2.redDePin.get(clavePin(osc.id, 'A'))).toBe(con2.redDeCable.get('c_a'))
    expect(r.cmd.cambios.map((c) => c.col)).toEqual(['piezas', 'sondas'])
  })

  it('con un osciloscopio que ya existe usa el mismo, otra entrada, enciende el canal y mueve la sonda de una entrada ya usada', () => {
    const gen = idSecuencial()
    let d = medir(divisor(), 'c_a', { x: 0, y: -8 }, { con: 'osciloscopio', canal: 'A' }, gen) as Documento
    const [osc] = piezasDe(d, 'osciloscopio')
    d = medir(d, 'c_b', { x: 14, y: 8 }, { con: 'osciloscopio', osc: osc.id, canal: 'C' }, gen) as Documento
    expect(piezasDe(d, 'osciloscopio')).toHaveLength(1)
    expect(d.piezas[osc.id].props.c_on).toBe('encendido')
    expect(medir(d, 'c_a', { x: 4, y: -8 }, { con: 'osciloscopio', osc: osc.id, canal: 'A' }, gen)).toBe('La entrada A de XSC1 ya mide esa red.')
    // A pasa a la red de la tierra: la misma sonda se mueve, no se agrega otra.
    d = medir(d, 'c_b', { x: 6, y: 8 }, { con: 'osciloscopio', osc: osc.id, canal: 'A' }, gen) as Documento
    expect(sondas(d)).toHaveLength(2)
    expect(sondas(d).find((s) => s.entrada === 'A')).toMatchObject({ x: 6, y: 8 })
  })

  it('una entrada cableada no se mide con sonda', () => {
    const d = medir(divisor(), 'c_a', { x: 0, y: -8 }, { con: 'osciloscopio', canal: 'A' }) as Documento
    const [osc] = piezasDe(d, 'osciloscopio')
    // La entrada B se cablea a mano a un punto suelto.
    const conCable = { ...d, cables: { ...d.cables, x: { id: 'x', puntos: [{ x: osc.x - 8, y: osc.y - 2 }, { x: osc.x - 20, y: osc.y - 2 }] } } }
    expect(medir(conCable, 'c_b', { x: 14, y: 8 }, { con: 'osciloscopio', osc: osc.id, canal: 'B' })).toBe('La entrada B de XSC1 ya está conectada con un cable: elige otra entrada.')
  })

  it('con el multímetro nuevo: «+» con sonda en el punto y COM a una tierra; la tierra no se mide', () => {
    const d = medir(divisor(), 'c_a', { x: 0, y: -8 }, { con: 'multimetro-nuevo' }) as Documento
    const [mm] = piezasDe(d, 'multimetro')
    expect(mm.ref).toBe('XMM1')
    expect(sondas(d)).toEqual([expect.objectContaining({ tipo: 'multimetro', instrumento: mm.id, entrada: '+', x: 0, y: -8 })])
    expect(Object.keys(d.etiquetas)).toEqual([])
    const con = calcularConexiones(d, lib)
    expect(con.redDePin.get(clavePin(mm.id, '+'))).toBe(con.redDeCable.get('c_a'))
    expect(con.redes[con.redDePin.get(clavePin(mm.id, 'COM'))!].tierra).toBe(true)
    expect(medir(divisor(), 'c_b', { x: 14, y: 8 }, { con: 'multimetro-nuevo' })).toBe('Esa red es la tierra: el multímetro mediría 0 V.')
  })

  it('con un multímetro que ya existe pone la sonda en la terminal pedida', () => {
    let d = medir(divisor(), 'c_a', { x: 0, y: -8 }, { con: 'multimetro-nuevo' }) as Documento
    const [mm] = piezasDe(d, 'multimetro')
    expect(medir(d, 'c_a', { x: 4, y: -8 }, { con: 'multimetro', mm: mm.id, terminal: '+' })).toBe('La terminal + de XMM1 ya mide esa red.')
    d = medir(d, 'c_b', { x: 14, y: 8 }, { con: 'multimetro', mm: mm.id, terminal: '+' }) as Documento
    expect(sondas(d)).toEqual([expect.objectContaining({ entrada: '+', x: 14, y: 8 })])
    // COM ya va a la tierra (la que se puso al medir).
    expect(medir(d, 'c_a', { x: 4, y: -8 }, { con: 'multimetro', mm: mm.id, terminal: 'COM' })).toBe('La terminal COM de XMM1 ya está conectada: elige otra terminal.')
  })

  it('las sondas de voltaje y de corriente', () => {
    const d = medir(divisor(), 'c_a', { x: 0, y: -6 }, { con: 'voltaje' }) as Documento
    expect(sondas(d)).toEqual([expect.objectContaining({ tipo: 'voltaje', x: 0, y: -6 })])
    expect(medir(d, 'c_a', { x: 0, y: -6 }, { con: 'voltaje' })).toBe('Ya hay una sonda de voltaje en ese punto.')
    const i = medir(divisor(), 'c_a', { x: 0, y: -6 }, { con: 'corriente' }) as Documento
    expect(sondas(i)).toEqual([expect.objectContaining({ tipo: 'corriente', x: 0, y: -6, sentido: 'abajo' })])
    const h = medir(divisor(), 'c_a', { x: 2, y: -8 }, { con: 'corriente' }) as Documento
    expect(sondas(h)[0]).toMatchObject({ sentido: 'derecha' })
    // En la esquina del cable no: la corriente necesita un tramo.
    expect(medir(divisor(), 'c_a', { x: 0, y: -8 }, { con: 'corriente' })).toBe('La sonda de corriente va en un tramo recto de cable, lejos de sus puntas y de las uniones.')
  })

  it('en un cruce con otra red no pone la sonda', () => {
    const d = divisor()
    const cruce = { ...d, cables: { ...d.cables, a0: { id: 'a0', puntos: [{ x: 3, y: -12 }, { x: 3, y: -4 }] } } }
    expect(medir(cruce, 'c_a', { x: 3, y: -8 }, { con: 'voltaje' })).toBe('Ahí se cruzan dos cables: haz clic en otro punto del cable.')
  })

  it('desde el editor: en una etiqueta se mide en su ancla, y «Seleccionar su red» de una sonda elige sus cables', () => {
    const d = divisor()
    d.etiquetas.e = { id: 'e', nombre: 'VIN', x: 0, y: -6, rot: 0 }
    const ed = new Editor(lib, d, idSecuencial())
    expect(ed.medirCon({ tipo: 'etiqueta', id: 'e', en: { x: 3.3, y: -7.1 } }, { con: 'voltaje' })).toBeNull()
    const [s] = sondas(ed.doc)
    expect(s).toMatchObject({ x: 0, y: -6 })
    ed.seleccionarRed({ tipo: 'sonda', id: s.id, en: { x: 0, y: -6 } })
    expect([...ed.seleccion.cables]).toEqual(['c_a'])
  })
})

describe('una entrada ya conectada se sustituye al medir en otro cable', () => {
  const nuevo = () => {
    const ed = new Editor(lib, divisor(), idSecuencial())
    ed.tolerancia = 0.5
    return ed
  }
  const deEntrada = (d: Documento, entrada: string) => sondas(d).filter((s) => s.entrada === entrada)

  it('Entrada A en un cable y luego en otro: la sonda vieja se quita y la nueva queda en el cable elegido, en un paso de deshacer', () => {
    const ed = nuevo()
    expect(ed.medirCon({ tipo: 'cable', id: 'c_a', en: { x: 0, y: -8 } }, { con: 'osciloscopio', canal: 'A' })).toBeNull()
    const [osc] = piezasDe(ed.doc, 'osciloscopio')
    const [vieja] = deEntrada(ed.doc, 'A')
    expect(ed.medirCon({ tipo: 'cable', id: 'c_b', en: { x: 6, y: 8 } }, { con: 'osciloscopio', osc: osc.id, canal: 'A' })).toBeNull()
    const enA = deEntrada(ed.doc, 'A')
    expect(enA).toHaveLength(1)
    expect(enA[0]).toMatchObject({ x: 6, y: 8, instrumento: osc.id })
    expect(enA[0].id).not.toBe(vieja.id)
    expect(ed.doc.sondas![vieja.id]).toBeUndefined()
    const con = calcularConexiones(ed.doc, lib)
    expect(con.redDePin.get(clavePin(osc.id, 'A'))).toBe(con.redDeCable.get('c_b'))
    ed.deshacer()
    expect(deEntrada(ed.doc, 'A')).toEqual([vieja])
  })

  it('un terminal de multímetro ya usado también se sustituye', () => {
    const ed = nuevo()
    expect(ed.medirCon({ tipo: 'cable', id: 'c_a', en: { x: 0, y: -8 } }, { con: 'multimetro-nuevo' })).toBeNull()
    const [mm] = piezasDe(ed.doc, 'multimetro')
    const [vieja] = deEntrada(ed.doc, '+')
    expect(ed.medirCon({ tipo: 'cable', id: 'c_b', en: { x: 6, y: 8 } }, { con: 'multimetro', mm: mm.id, terminal: '+' })).toBeNull()
    const nuevaS = deEntrada(ed.doc, '+')
    expect(nuevaS).toHaveLength(1)
    expect(nuevaS[0]).toMatchObject({ x: 6, y: 8, instrumento: mm.id })
    expect(ed.doc.sondas![vieja.id]).toBeUndefined()
    ed.deshacer()
    expect(deEntrada(ed.doc, '+')).toEqual([vieja])
  })
})

describe('el medidor rápido en el editor', () => {
  const nuevo = () => {
    const d = divisor()
    d.etiquetas.e = { id: 'e', nombre: 'VIN', x: 0, y: -6, rot: 0 }
    const ed = new Editor(lib, d, idSecuencial())
    ed.tolerancia = 0.5
    return ed
  }
  const medidores = (d: Documento) => sondas(d).filter((s) => s.tipo === 'medidor')

  it('«Medidor rápido» en un cable o una etiqueta pone un medidor de voltaje DC con referencia libre, queda seleccionado y es un solo paso', () => {
    const ed = nuevo()
    expect(ed.medirCon({ tipo: 'cable', id: 'c_a', en: { x: 0, y: -6 } }, { con: 'medidor' })).toBeNull()
    const [m] = medidores(ed.doc)
    expect(m).toMatchObject({ tipo: 'medidor', magnitud: 'voltaje', modo: 'dc', ref: 'M1', x: 0, y: -6 })
    expect(Math.abs(m.pantalla!.dx)).toBeLessThanOrEqual(8)
    expect(Math.abs(m.pantalla!.dy)).toBeLessThanOrEqual(8)
    // Por omisión arriba a la derecha cuando hay lugar; si algo lo ocupa, otro lugar libre que no lo pisa.
    expect(pantallaLibre(documentoVacio(), lib, { x: 0, y: 0 }, 'dc')).toEqual({ dx: 7, dy: -6 })
    expect([...ed.seleccion.sondas]).toEqual([m.id])
    ed.deshacer()
    expect(medidores(ed.doc)).toHaveLength(0)
    ed.rehacer()
    expect(ed.medirCon({ tipo: 'etiqueta', id: 'e', en: { x: 3, y: -7 } }, { con: 'medidor' })).toBeNull()
    expect(medidores(ed.doc).map((x) => x.ref).sort()).toEqual(['M1', 'M2'])
  })

  it('arrastrar la pantalla cambia `pantalla` sin pasar de 8 unidades, en un solo paso de deshacer', () => {
    const ed = nuevo()
    ed.medirCon({ tipo: 'cable', id: 'c_a', en: { x: 0, y: -6 } }, { con: 'medidor' })
    const [m] = medidores(ed.doc)
    const c = { x: m.x + m.pantalla!.dx, y: m.y + m.pantalla!.dy }
    ed.abajo(c)
    ed.mover({ x: c.x - 3, y: c.y + 2 })
    ed.mover({ x: c.x - 40, y: c.y + 40 })
    ed.arriba({ x: c.x - 40, y: c.y + 40 })
    expect(ed.doc.sondas![m.id].pantalla).toEqual({ dx: -8, dy: 8 })
    ed.deshacer()
    expect(ed.doc.sondas![m.id].pantalla).toEqual(m.pantalla)
  })

  it('al mover el punto con las flechas la pantalla se va con él', () => {
    const ed = nuevo()
    ed.medirCon({ tipo: 'cable', id: 'c_a', en: { x: 0, y: -6 } }, { con: 'medidor' })
    const [m] = medidores(ed.doc)
    ed.seleccionar(seleccionDe('sondas', m.id))
    expect(ed.desplazar(0, 2)).toBe(true)
    const despues = ed.doc.sondas![m.id]
    expect(despues.y).not.toBe(m.y)
    expect(despues.pantalla).toEqual(m.pantalla)
  })

  it('«Convertir en multímetro» borra el medidor y pone un multímetro con su sonda en el mismo punto y función, en un solo paso', () => {
    for (const [magnitud, modo, texto] of [['voltaje', 'dc', 'V DC'], ['voltaje', 'ac', 'V AC']] as const) {
      const ed = nuevo()
      ed.medirCon({ tipo: 'cable', id: 'c_a', en: { x: 0, y: -6 } }, { con: 'medidor' })
      const [m] = medidores(ed.doc)
      ed.doc.sondas![m.id] = { ...m, magnitud, modo }
      expect(ed.convertirEnMultimetro(m.id)).toBeNull()
      expect(medidores(ed.doc)).toHaveLength(0)
      const [mm] = piezasDe(ed.doc, 'multimetro')
      expect(mm.props.modo).toBe(texto)
      expect(sondas(ed.doc)).toEqual([expect.objectContaining({ tipo: 'multimetro', x: 0, y: -6, instrumento: mm.id, entrada: '+' })])
      ed.deshacer()
      expect(piezasDe(ed.doc, 'multimetro')).toHaveLength(0)
      expect(medidores(ed.doc)).toHaveLength(1)
    }
  })

  it('un medidor de corriente no se convierte en multímetro: iría en paralelo y pondría el cable en corto', () => {
    const ed = nuevo()
    ed.medirCon({ tipo: 'cable', id: 'c_a', en: { x: 0, y: -6 } }, { con: 'medidor' })
    const [m] = medidores(ed.doc)
    ed.doc.sondas![m.id] = { ...m, magnitud: 'corriente' }
    const antes = JSON.stringify(ed.doc)
    expect(ed.convertirEnMultimetro(m.id)).toBe('Para medir corriente con el multímetro completo, intercálalo en serie: pon el multímetro en el cable.')
    expect(JSON.stringify(ed.doc)).toBe(antes)
  })

  it('con la vista previa corriendo no coloca, ni mueve, ni convierte', () => {
    const ed = nuevo()
    ed.medirCon({ tipo: 'cable', id: 'c_a', en: { x: 0, y: -6 } }, { con: 'medidor' })
    const [m] = medidores(ed.doc)
    ed.simulando = true
    expect(ed.medirCon({ tipo: 'cable', id: 'c_a', en: { x: 0, y: -4 } }, { con: 'medidor' })).toMatch(/vista previa/)
    expect(ed.convertirEnMultimetro(m.id)).toMatch(/vista previa/)
    const c = { x: m.x + m.pantalla!.dx, y: m.y + m.pantalla!.dy }
    ed.abajo(c)
    ed.mover({ x: c.x - 3, y: c.y })
    ed.arriba({ x: c.x - 3, y: c.y })
    expect(ed.doc.sondas![m.id].pantalla).toEqual(m.pantalla)
    expect(medidores(ed.doc)).toHaveLength(1)
  })

  it('el inspector cambia lo que mide y su referencia, cada cosa en un paso, con las mismas reglas', () => {
    const ed = nuevo()
    ed.medirCon({ tipo: 'cable', id: 'c_a', en: { x: 0, y: -6 } }, { con: 'medidor' })
    const [m] = medidores(ed.doc)
    expect(ed.cambiarMedidor(m.id, { modo: 'ac' })).toBeNull()
    expect(ed.doc.sondas![m.id].modo).toBe('ac')
    // En el interior de un tramo se puede medir corriente; sobre una etiqueta (en la punta del cable) no.
    expect(ed.cambiarMedidor(m.id, { magnitud: 'corriente' })).toBeNull()
    ed.deshacer()
    ed.deshacer()
    expect(ed.doc.sondas![m.id]).toMatchObject({ magnitud: 'voltaje', modo: 'dc' })
    expect(ed.cambiarReferencia(m.id, 'XX')).toMatch(/una M y un número/)
    expect(ed.cambiarReferencia(m.id, 'R1')).toMatch(/una M y un número/)
    expect(ed.cambiarReferencia(m.id, 'M7')).toBeNull()
    expect(ed.doc.sondas![m.id].ref).toBe('M7')
    ed.medirCon({ tipo: 'cable', id: 'c_a', en: { x: 0, y: -4 } }, { con: 'medidor' })
    const otro = medidores(ed.doc).find((x) => x.id !== m.id)!
    expect(ed.cambiarReferencia(otro.id, 'm7')).toMatch(/Ya hay otro medidor/)
    ed.simulando = true
    expect(ed.cambiarMedidor(m.id, { modo: 'ac' })).toMatch(/vista previa/)
  })

  it('la corriente AC no se ofrece: pasar a corriente un medidor en AC lo vuelve DC en el mismo paso y pedir AC en corriente se rechaza', () => {
    const ed = nuevo()
    ed.medirCon({ tipo: 'cable', id: 'c_a', en: { x: 0, y: -6 } }, { con: 'medidor' })
    const [m] = medidores(ed.doc)
    expect(ed.cambiarMedidor(m.id, { modo: 'ac' })).toBeNull()
    expect(ed.cambiarMedidor(m.id, { magnitud: 'corriente' })).toBeNull()
    expect(ed.doc.sondas![m.id]).toMatchObject({ magnitud: 'corriente', modo: 'dc' })
    ed.deshacer()
    expect(ed.doc.sondas![m.id]).toMatchObject({ magnitud: 'voltaje', modo: 'ac' })
    ed.rehacer()
    expect(ed.cambiarMedidor(m.id, { modo: 'ac' })).toBe('La corriente AC se mide con el multímetro completo en serie.')
    expect(ed.doc.sondas![m.id].modo).toBe('dc')
  })

  it('copiar, pegar y borrar lo tratan como a las demás sondas, y la copia toma otra referencia', () => {
    const ed = nuevo()
    ed.medirCon({ tipo: 'cable', id: 'c_a', en: { x: 0, y: -6 } }, { con: 'medidor' })
    ed.seleccionar(seleccionDe('cables', 'c_a'))
    ed.seleccionar({ ...ed.seleccion, sondas: new Set([medidores(ed.doc)[0].id]) })
    const f = copiar(ed.doc, ed.seleccion, lib)!
    expect(f.sondas?.map((x) => x.tipo)).toEqual(['medidor'])
    const r = pegar(ed.doc, lib, f, { x: 0, y: 20 }, (prefijo) => `${prefijo}_pegado`)
    const pegado = Object.values(aplicar(ed.doc, r.cmd).sondas!).filter((x) => x.tipo === 'medidor')
    expect(pegado.map((x) => x.ref).sort()).toEqual(['M1', 'M2'])
    ed.seleccionar(seleccionDe('sondas', medidores(ed.doc)[0].id))
    ed.borrar()
    expect(medidores(ed.doc)).toHaveLength(0)
    ed.deshacer()
    expect(medidores(ed.doc)).toHaveLength(1)
  })
})
