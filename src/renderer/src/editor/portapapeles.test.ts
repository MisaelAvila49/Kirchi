// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { aplicar } from '../doc/comandos'
import { idSecuencial } from '../doc/ids'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { documentoVacio, type Documento } from '../doc/tipos'
import { copiar, duplicar, pegar } from './portapapeles'
import { todo } from './seleccion'
import { seleccionVacia } from './seleccion'

const lib = libreriaDePrueba().piezas
// divisor(): R1 (p_r1) en (10, -8) y R2 (p_r2) en (14, -4); c_a = (0, -4) (0, -8) (6, -8).
const sel = (piezas: string[], cables: string[] = []) => {
  const s = seleccionVacia()
  piezas.forEach((id) => s.piezas.add(id))
  cables.forEach((id) => s.cables.add(id))
  return s
}

/** El divisor con un osciloscopio lejos y una sonda A sobre el cable c_a. */
function divisorConOsciloscopio(): Documento {
  const d = { ...divisor(), sondas: {} } as Documento
  d.piezas.p_o = { id: 'p_o', tipo: 'osciloscopio', ref: 'XSC1', x: 60, y: -8, rot: 0, espejo: false, props: {} }
  d.sondas = { s_1: { id: 's_1', tipo: 'osciloscopio', x: 0, y: -6, instrumento: 'p_o', entrada: 'A' } }
  return d
}

describe('las sondas viajan con su instrumento', () => {
  it('copiar lleva la sonda cuando su instrumento y el cable que toca van en la selección, relativa al origen', () => {
    const d = divisorConOsciloscopio()
    const f = copiar(d, todo(d), lib)!
    expect(f.sondas).toHaveLength(1)
    expect(f.sondas![0]).toMatchObject({ tipo: 'osciloscopio', instrumento: 'p_o', entrada: 'A', x: 0 - f.origen.x, y: -6 - f.origen.y })
  })

  it('sin el cable que toca, o sin su instrumento, la sonda se queda', () => {
    const d = divisorConOsciloscopio()
    const s = sel(['p_o'])
    expect(copiar(d, s, lib)!.sondas ?? []).toEqual([])
    // El cable sin el osciloscopio: la sonda de un instrumento ausente tampoco va.
    expect(copiar(d, sel(['p_r1'], ['c_a']), lib)!.sondas ?? []).toEqual([])
  })

  it('pegar crea la sonda nueva sobre el instrumento nuevo, en el cable nuevo y la deja seleccionada', () => {
    const d = divisorConOsciloscopio()
    const f = copiar(d, todo(d), lib)!
    const r = pegar(d, lib, f, { x: 100, y: 100 }, idSecuencial())
    const d2 = aplicar(d, r.cmd)
    const nuevas = Object.values(d2.sondas ?? {}).filter((s) => s.id !== 's_1')
    expect(nuevas).toHaveLength(1)
    const osc = Object.values(d2.piezas).find((p) => p.tipo === 'osciloscopio' && p.id !== 'p_o')!
    expect(nuevas[0]).toMatchObject({ tipo: 'osciloscopio', entrada: 'A', instrumento: osc.id, x: 100 + (0 - f.origen.x), y: 100 + (-6 - f.origen.y) })
    expect([...r.seleccion.sondas]).toEqual([nuevas[0].id])
    // La original sigue donde estaba y con su instrumento.
    expect(d2.sondas!.s_1).toMatchObject({ instrumento: 'p_o', x: 0, y: -6 })
  })

  it('un fragmento de antes (sin sondas) se pega igual', () => {
    const d = divisor()
    const f = copiar(d, sel(['p_r1']), lib)!
    delete (f as { sondas?: unknown }).sondas
    expect(() => pegar(d, lib, f, { x: 50, y: 50 }, idSecuencial())).not.toThrow()
  })
})

describe('portapapeles', () => {
  it('sin selección no copia', () => {
    expect(copiar(divisor(), seleccionVacia())).toBeNull()
  })

  it('copia relativo a la esquina de la selección', () => {
    const f = copiar(divisor(), sel(['p_r1', 'p_r2']))!
    expect(f.origen).toEqual({ x: 10, y: -8 })
    expect(f.piezas.map((p) => [p.x, p.y])).toEqual([[0, 0], [4, 4]])
  })

  it('pega con identificadores nuevos, referencias siguientes y la selección de lo pegado', () => {
    const d = divisor()
    const r = pegar(d, lib, copiar(d, sel(['p_r1', 'p_r2']))!, { x: 100, y: 100 }, idSecuencial())
    const d2 = aplicar(d, r.cmd)
    expect(d2.piezas.p_0001).toMatchObject({ ref: 'R3', x: 100, y: 100, props: { valor: '1k' } })
    expect(d2.piezas.p_0002).toMatchObject({ ref: 'R4', x: 104, y: 104, rot: 90 })
    expect([...r.seleccion.piezas]).toEqual(['p_0001', 'p_0002'])
    expect(Object.keys(d2.piezas)).toHaveLength(6)
    expect(d.piezas.p_r1.x).toBe(10)
  })

  it('numera las referencias a partir del mayor usado, sin repetir, aunque haya huecos', () => {
    const d = divisor()
    d.piezas.p_r1 = { ...d.piezas.p_r1, ref: 'R7' }
    const f = copiar(d, sel(['p_r1', 'p_r2']))!
    const d2 = aplicar(d, pegar(d, lib, f, { x: 0, y: 0 }, idSecuencial()).cmd)
    const refs = Object.values(d2.piezas).map((p) => p.ref)
    expect(refs.filter((r) => r.startsWith('R')).sort()).toEqual(['R2', 'R7', 'R8', 'R9'])
    expect(new Set(refs).size).toBe(refs.length)
  })

  it('copia y pega cables junto con piezas', () => {
    const d = divisor()
    const f = copiar(d, sel(['p_r1'], ['c_a']))!
    expect(f.origen).toEqual({ x: 0, y: -8 })
    const d2 = aplicar(d, pegar(d, lib, f, { x: 0, y: 0 }, idSecuencial()).cmd)
    expect(d2.piezas.p_0001).toMatchObject({ x: 10, y: 0 })
    expect(d2.cables.c_0002.puntos).toEqual([{ x: 0, y: 4 }, { x: 0, y: 0 }, { x: 6, y: 0 }])
  })

  it('duplicar desplaza un punto de rejilla', () => {
    const d = divisor()
    const r = duplicar(d, lib, sel(['p_r1']), idSecuencial())!
    expect(aplicar(d, r.cmd).piezas.p_0001).toMatchObject({ ref: 'R3', x: 12, y: -6 })
  })
})

describe('renombrar redes al pegar una plantilla', () => {
  it('no renombra a un nombre que el propio fragmento ya trae (Entrada con Entrada2)', () => {
    const et = (id: string, nombre: string) => ({ id, nombre, x: 0, y: 0 })
    const doc = { ...documentoVacio(), etiquetas: { e0: et('e0', 'Entrada') } } as unknown as Documento
    const f = { origen: { x: 0, y: 0 }, piezas: [], cables: [], etiquetas: [et('a', 'Entrada'), et('b', 'Entrada2')], notas: [], figuras: [] } as never
    const r = pegar(doc, lib, f, { x: 0, y: 0 }, idSecuencial(), true)
    const por = Object.fromEntries(r.renombradas)
    expect(por['Entrada']).toBe('Entrada3')
    expect(r.renombradas).toHaveLength(1)
  })
})
