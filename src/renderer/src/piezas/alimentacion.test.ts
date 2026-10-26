// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { buscar } from '../buscador/buscar'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { cambiarProp, nuevaPieza, propNumerica } from '../editor/colocar'
import { cajaTexto, etiquetasSinChoques } from '../lienzo/apartar'
import { etiquetasDePieza, rotulosDePieza, textoDeValor } from '../lienzo/etiquetas'
import { formatearValor } from '../valores/valores'
import { compilarNetlist, diodosDirectos } from '../netlist/netlist'
import { conEtiquetas, divisor, ledConBateria } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { avisosDelCircuito, vistaProyecto } from '../ui/proyecto'
import { MAX_TEXTO_PROP } from './tipos'
import { validarPieza } from './validar'

const lib = libreriaDePrueba().piezas
const def = lib.get('alimentacion')!

beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })
})

const terminal = (id: string, x: number, y: number, props: Record<string, string> = {}, rot: Pieza['rot'] = 0, espejo = false): Pieza => ({ id, tipo: 'alimentacion', ref: id.toUpperCase(), x, y, rot, espejo, props })

/** El divisor alimentado por un terminal «+5V» en lugar de la fuente: el terminal queda sobre el extremo de c_a. */
function divisorConTerminal(props: Record<string, string> = { nombre: '+5V' }, rieles: Record<string, string> = {}): Documento {
  const d = divisor()
  delete d.piezas.p_v1
  d.piezas.p_pwr = terminal('p_pwr', 0, -4, props)
  if (Object.keys(rieles).length) d.alimentaciones = Object.fromEntries(Object.entries(rieles).map(([nombre, voltaje], i) => [`a_${i}`, { id: `a_${i}`, nombre, voltaje }]))
  return d
}
const compilar = (d: Documento) => compilarNetlist(d, lib, calcularConexiones(d, lib))
const avisos = (d: Documento) => avisosDelCircuito(d, calcularConexiones(d, lib), lib).map((a) => a.texto)

describe('terminal de alimentación: la pieza', () => {
  it('un pin en el pie de la flecha, el nombre como única propiedad (con nombres comunes) y dibujado como rótulo', () => {
    expect(def.categoria).toBe('fuentes')
    expect(def.pines).toEqual([{ id: '1', nombre: 'alimentación', x: 0, y: 0 }])
    expect(def.props.map((p) => [p.id, p.texto === true])).toEqual([['nombre', true]])
    expect(def.props[0].comunes).toEqual(['+15V', '-15V', '+5V', 'VCC', 'VEE'])
    expect(def.modelo).toEqual({ tipo: 'alimentacion', pin: '1', nombre: 'nombre' })
    expect(def.rotulos).toHaveLength(1)
    expect(def.rotulos![0]).toMatchObject({ prop: 'nombre', texto: 'VCC', alinear: 'arriba' })
  })

  it('la flecha apunta hacia arriba: un tallo desde el pin y una punta en V de dos trazos en su extremo', () => {
    const t = def.geometria.trazos
    const tallo = t.find((s) => s.length === 4 && s[0] === 0 && s[1] === 0)!
    expect(tallo).toEqual([0, 0, 0, -3])
    const punta = t.find((s) => s.length === 6)!
    expect(punta).toEqual([-0.9, -1.8, 0, -3, 0.9, -1.8])
  })

  it('el símbolo es compacto: tallo de 3 unidades (3.75 mm), punta de 1.8 de ancho, nombre de 1.8 mm pegado a la punta', () => {
    const r = def.rotulos![0]
    expect(r.tam).toBeGreaterThanOrEqual(1.6)
    expect(r.tam).toBeLessThanOrEqual(2)
    // El texto (alto = tam / 1.25 unidades) queda justo arriba de la punta, a menos de una unidad.
    const bajo = r.y + r.tam / 1.25 / 2
    expect(-3 - bajo).toBeLessThan(1)
    expect(-3 - bajo).toBeGreaterThanOrEqual(0.3)
    // El voltaje sigue al nombre en su renglón (ver la prueba de las ocho orientaciones).
    expect(def.etiquetas.valor.trasRotulo).toBe(0)
  })

  it('el voltaje va en el renglón del nombre, justo después de él, en las ocho orientaciones y con un cable en el pin', () => {
    for (const cable of [false, true])
      for (const rot of [0, 90, 180, 270] as const)
        for (const espejo of [false, true])
          for (const voltaje of ['5', '-15']) {
            const d = documentoVacio()
            const p = terminal('t1', 0, 0, {}, rot, espejo)
            d.piezas.t1 = p
            d.alimentaciones = { a_1: { id: 'a_1', nombre: 'VCC', voltaje } }
            // El cable sale del pin hacia el lado contrario de la flecha.
            const [dx, dy] = { 0: [0, 1], 90: [-1, 0], 180: [0, -1], 270: [1, 0] }[rot]
            if (cable) d.cables.c = { id: 'c', puntos: [{ x: 0, y: 0 }, { x: dx * 6, y: dy * 6 }] }
            const [nombre] = rotulosDePieza(p, def)
            const [valor] = etiquetasSinChoques(d, lib).get('t1')!
            const caso = `${cable ? 'con cable' : 'solo'}, ${rot}°${espejo ? ' reflejado' : ''}, ${voltaje} V`
            expect(valor.texto, caso).toBe(formatearValor(Number(voltaje), 'V'))
            expect(valor.y, caso).toBeCloseTo(nombre.y, 9)
            const n = cajaTexto(nombre, 0), v = cajaTexto(valor, 0)
            // Del lado en que crece el nombre (afuera de la flecha): a la derecha, salvo cuando el nombre crece a la izquierda.
            const hueco = nombre.alinear === 'der' ? n.minX - v.maxX : v.minX - n.maxX
            expect(hueco, caso).toBeGreaterThanOrEqual(0.5)
            expect(hueco, caso).toBeLessThanOrEqual(1.5)
          }
  })

  it('«valor» es el voltaje del riel, no el nombre, y no se rotula la referencia', () => {
    const d = divisorConTerminal({ nombre: 'VDD' }, { VDD: '3.3' })
    const p = d.piezas.p_pwr
    expect(textoDeValor(p, def, d)).toBe('3.3 V')
    expect(textoDeValor(p, def)).toBe('5 V')
    expect(propNumerica(def)).toBeUndefined()
    expect(etiquetasDePieza(p, def, d).map((t) => t.texto)).toEqual(['3.3 V'])
    expect(textoDeValor(terminal('t', 0, 0, { nombre: 'VEE' }), def)).toBe('-5 V')
  })

  it('un nombre que ya es un voltaje («+15V») no repite el voltaje junto a él', () => {
    const p = terminal('t1', 0, 0, { nombre: '+15V' })
    expect(textoDeValor(p, def)).toBeNull()
    expect(etiquetasDePieza(p, def)).toEqual([])
  })

  it('el rótulo dice el nombre de la pieza, derecho en las ocho orientaciones, y recorta lo que se pasa del largo máximo', () => {
    for (const rot of [0, 90, 180, 270] as const)
      for (const espejo of [false, true]) {
        const [r] = rotulosDePieza(terminal('t1', 10, 20, { nombre: '+5V' }, rot, espejo), def)
        expect(r.texto).toBe('+5V')
      }
    expect(rotulosDePieza(terminal('t1', 0, 0, {}), def)[0].texto).toBe('VCC')
    expect(rotulosDePieza(terminal('t1', 0, 0, { nombre: '  ' }), def)[0].texto).toBe('VCC')
    expect(rotulosDePieza(terminal('t1', 0, 0, { nombre: 'x'.repeat(100) }), def)[0].texto).toHaveLength(MAX_TEXTO_PROP)
  })

  it('el nombre crece lejos de la flecha en cualquier orientación', () => {
    // Sin girar el texto va centrado sobre la punta; de lado crece hacia afuera, nunca hacia la flecha.
    const alinear = (rot: Pieza['rot'], espejo = false) => rotulosDePieza(terminal('t1', 0, 0, {}, rot, espejo), def)[0].alinear
    expect(alinear(0)).toBe('centro')
    expect(alinear(180)).toBe('centro')
    const lados = [alinear(90), alinear(270)].sort()
    expect(lados).toEqual(['der', 'izq'])
  })

  it('se encuentra por vcc, vdd, vee, +5v, alimentación, power y terminal', () => {
    for (const q of ['vcc', 'vdd', 'vee', '+5v', 'alimentacion', 'alimentación', 'power', 'terminal']) expect(buscar(q, lib).map((r) => r.def.id), q).toContain('alimentacion')
    expect(buscar('vcc', lib)[0].def.id).toBe('alimentacion')
  })

  it('el buscador propone el nombre: «+15V», «-15V», «−15V», «vee» o «alimentación 12» dan el terminal con ese nombre', () => {
    const nombre = (q: string) => buscar(q, lib).find((x) => x.def.id === 'alimentacion')?.valor
    expect(buscar('+15V', lib)[0].def.id).toBe('alimentacion')
    expect(nombre('+15V')).toBe('+15V')
    expect(nombre('-15v')).toBe('-15V')
    expect(nombre('−15V')).toBe('-15V')
    expect(nombre('3.3V')).toBe('+3.3V')
    expect(nombre('vee')).toBe('VEE')
    expect(nombre('vcc')).toBe('VCC')
    expect(nombre('alimentación 12')).toBe('+12V')
    expect(nombre('alimentación -5 V')).toBe('-5V')
    expect(nombre('alimentación')).toBeUndefined()
    // Un valor con prefijo («r 4k7») no es un voltaje de alimentación: el terminal sale sin nombre propuesto.
    expect(nombre('r 4k7')).toBeUndefined()
    expect(nombre('alimentación 1k')).toBeUndefined()
    const p = nuevaPieza(documentoVacio(), def, { x: 0, y: 0 }, 0, false, () => 'p1', '+15V')
    expect(p.props).toEqual({ nombre: '+15V' })
    expect(p.ref).toBe('PWR1')
    expect(nuevaPieza(documentoVacio(), def, { x: 0, y: 0 }, 0, false, () => 'p1').props).toEqual({ nombre: 'VCC' })
  })
})

describe('terminal de alimentación: validación', () => {
  const base = JSON.parse(readFileSync(join(import.meta.dirname, '../../../../componentes/fuentes/alimentacion/pieza.json'), 'utf8'))
  const errores = (o: unknown) => {
    const v = validarPieza(JSON.stringify(o), 'x/pieza.json')
    return v.ok ? [] : v.errores
  }

  it('la pieza del repositorio es válida', () => {
    expect(errores(base)).toEqual([])
  })

  it('una propiedad de texto no se mezcla con unidades ni listas, y su texto de omisión tiene largo', () => {
    const props = (p: object) => [{ ...base.props[0], ...p }]
    expect(errores({ ...base, props: props({ unidad: 'V' }) })).toContain('x/pieza.json: props[0].texto no puede combinarse con opciones, unidad ni mostrar')
    expect(errores({ ...base, props: props({ defecto: '' }) })).toContain('x/pieza.json: props[0].defecto debe ser un texto de 1 a 24 caracteres')
    expect(errores({ ...base, props: props({ defecto: 'x'.repeat(25) }) })).toContain('x/pieza.json: props[0].defecto debe ser un texto de 1 a 24 caracteres')
    expect(errores({ ...base, props: props({ texto: 'sí' }) })).toContain('x/pieza.json: props[0].texto debe ser verdadero o falso')
  })

  it('el modelo pide un pin y una propiedad de texto para el nombre; el voltaje ya no es una propiedad', () => {
    expect(errores({ ...base, modelo: { ...base.modelo, pin: '9' } })).toContain('x/pieza.json: modelo.pin no es un pin de la pieza')
    expect(errores({ ...base, modelo: { ...base.modelo, nombre: 'nada' } })).toContain('x/pieza.json: modelo.nombre no es una propiedad de la pieza')
    const conVoltaje = { ...base, props: [...base.props, { id: 'voltaje', nombre: 'Voltaje', unidad: 'V', defecto: '5' }] }
    expect(errores({ ...conVoltaje, modelo: { ...base.modelo, nombre: 'voltaje' } })).toContain('x/pieza.json: modelo.nombre debe ser una propiedad de texto (con "texto": true)')
    expect(errores({ ...base, modelo: { ...base.modelo, voltaje: 'voltaje' } }).join(' ')).toMatch(/modelo\.voltaje/)
  })

  it('una propiedad de texto acepta nombres comunes, cada uno de 1 a 24 caracteres', () => {
    const props = (comunes: unknown) => [{ ...base.props[0], comunes }]
    expect(errores({ ...base, props: props(['+15V', 'VEE']) })).toEqual([])
    expect(errores({ ...base, props: props(['']) })).toContain('x/pieza.json: props[0].comunes debe ser una lista de textos de 1 a 24 caracteres')
    expect(errores({ ...base, props: props(['x'.repeat(25)]) })).toContain('x/pieza.json: props[0].comunes debe ser una lista de textos de 1 a 24 caracteres')
  })

  it('un rótulo ligado a una propiedad exige que sea de texto; sin prop, el texto es obligatorio', () => {
    expect(errores({ ...base, rotulos: [{ prop: 'nada', x: 0, y: -5 }] })).toContain('x/pieza.json: rotulos[0].prop debe ser una propiedad de texto (con "texto": true) o de lista de la pieza')
    expect(errores({ ...base, rotulos: [{ x: 0, y: -5 }] })).toContain('x/pieza.json: rotulos[0].texto es obligatorio')
  })

  it('«trasRotulo» del valor es el índice de uno de sus rótulos', () => {
    const tras = (t: unknown, rotulos = base.rotulos) => errores({ ...base, rotulos, etiquetas: { ...base.etiquetas, valor: { trasRotulo: t } } })
    const error = 'x/pieza.json: etiquetas.valor.trasRotulo debe ser el índice de uno de los rótulos de la pieza (desde 0)'
    expect(tras(0)).toEqual([])
    for (const t of [1, -1, 0.5, '0']) expect(tras(t), String(t)).toContain(error)
    expect(errores({ ...base, rotulos: undefined, etiquetas: { ...base.etiquetas, valor: { trasRotulo: 0 } } })).toContain(error)
  })
})

describe('terminal de alimentación: editar el nombre', () => {
  const p = terminal('t1', 0, 0, { nombre: 'VCC' })
  it('acepta cualquier texto de 1 a 24 caracteres, sin espacios en los extremos, y no lo lee como número', () => {
    expect(cambiarProp(p, def, 'nombre', ' +5V ')).toEqual({ pieza: { ...p, props: { ...p.props, nombre: '+5V' } } })
    expect(cambiarProp(p, def, 'nombre', '5V')).toEqual({ pieza: { ...p, props: { ...p.props, nombre: '5V' } } })
    expect(cambiarProp(p, def, 'nombre', '')).toEqual({ error: 'Nombre no puede quedar vacío.' })
    expect(cambiarProp(p, def, 'nombre', 'x'.repeat(25))).toEqual({ error: 'Nombre admite 24 caracteres como máximo.' })
    expect(cambiarProp(p, def, 'nombre', 'a\u0000b')).toEqual({ error: 'Nombre no admite caracteres de control.' })
    // El voltaje no es de la pieza: el inspector lo cambia en su riel (`Editor.cambiarPropiedad`).
    expect(cambiarProp(p, def, 'voltaje', '12')).toEqual({ error: 'T1 no tiene la propiedad «voltaje».' })
  })
})

describe('terminal de alimentación: redes', () => {
  /** Dos resistencias sueltas con un terminal cada una, sin cables entre los terminales. */
  const dosTerminales = (a: string, b: string) => {
    const d = documentoVacio()
    d.piezas.t1 = terminal('t1', 0, 0, { nombre: a })
    d.piezas.t2 = terminal('t2', 40, 0, { nombre: b })
    return calcularConexiones(d, lib)
  }

  it('dos terminales con el mismo nombre quedan en la misma red, y con otro nombre no', () => {
    const iguales = dosTerminales('VCC', 'VCC')
    expect(iguales.redDePin.get(clavePin('t1', '1'))).toBe(iguales.redDePin.get(clavePin('t2', '1')))
    const distintos = dosTerminales('VCC', 'VDD')
    expect(distintos.redDePin.get(clavePin('t1', '1'))).not.toBe(distintos.redDePin.get(clavePin('t2', '1')))
  })

  it('el nombre no distingue espacios en los extremos pero sí mayúsculas, como una etiqueta de red', () => {
    const a = dosTerminales('VCC', ' VCC ')
    expect(a.redDePin.get(clavePin('t1', '1'))).toBe(a.redDePin.get(clavePin('t2', '1')))
    const b = dosTerminales('VCC', 'vcc')
    expect(b.redDePin.get(clavePin('t1', '1'))).not.toBe(b.redDePin.get(clavePin('t2', '1')))
  })

  it('una etiqueta de red con ese nombre se une al terminal y la red toma el nombre', () => {
    const d = divisor()
    delete d.piezas.p_v1
    d.piezas.p_pwr = terminal('p_pwr', 40, -20, { nombre: 'VCC' })
    d.etiquetas.e1 = { id: 'e1', nombre: 'VCC', x: 6, y: -8, rot: 0 }
    const con = calcularConexiones(d, lib)
    const red = con.redDePin.get(clavePin('p_r1', '1'))!
    expect(con.redDePin.get(clavePin('p_pwr', '1'))).toBe(red)
    expect(con.redes[red].nombre).toBe('VCC')
  })

  it('un terminal sin nombre no se une a nada y no nombra su red', () => {
    const con = dosTerminales('', '  ')
    expect(con.redDePin.get(clavePin('t1', '1'))).not.toBe(con.redDePin.get(clavePin('t2', '1')))
    expect(con.redes[con.redDePin.get(clavePin('t1', '1'))!].nombre).toBeUndefined()
  })
})

describe('terminal de alimentación: netlist y simulación', () => {
  it('el divisor alimentado por un terminal «+5V» y una tierra da 2.50 V', () => {
    const d = divisorConTerminal()
    const con = calcularConexiones(d, lib)
    const r = compilarNetlist(d, lib, con)
    expect(r.errores).toEqual([])
    expect(r.netlist!.elements.filter((e) => e.type === 'V')).toEqual([{ type: 'V', a: expect.any(Number), b: 0, wave: { kind: 'dc', v: 5 } }])
    const sim = new Simulator(JSON.stringify(r.netlist), 1e-6)
    sim.advance_to(1e-5, 100)
    const medio = r.nodoDeRed.get(con.redDePin.get(clavePin('p_r1', '2'))!)!
    expect(sim.voltages()[medio]).toBeCloseTo(2.5, 6)
    sim.free()
  })

  it('el voltaje de un riel es el de la tabla del documento, o el de omisión (VCC y VDD 5 V, VEE −5 V)', () => {
    const v = (d: Documento) => compilar(d).netlist!.elements.find((e) => e.type === 'V')
    expect(v(divisorConTerminal({ nombre: 'VDD' }, { VDD: '3.3' }))).toMatchObject({ wave: { kind: 'dc', v: 3.3 } })
    expect(v(divisorConTerminal({ nombre: 'VCC' }))).toMatchObject({ wave: { kind: 'dc', v: 5 } })
    expect(v(divisorConTerminal({ nombre: 'VEE' }))).toMatchObject({ wave: { kind: 'dc', v: -5 } })
    expect(v(divisorConTerminal({ nombre: '-15V' }, { '-15V': '3' }))).toMatchObject({ wave: { kind: 'dc', v: -15 } })
  })

  it('varios terminales con el mismo nombre son una sola fuente', () => {
    const d = divisorConTerminal()
    d.piezas.p_pwr2 = terminal('p_pwr2', 60, -20, { nombre: '+5V' })
    const r = compilar(d)
    expect(r.errores).toEqual([])
    expect(r.netlist!.elements.filter((e) => e.type === 'V')).toHaveLength(1)
  })

  it('una fuente simétrica: +15V, −15V y VCC son tres fuentes de 15 V, −15 V y 5 V', () => {
    const d = conEtiquetas(lib, [
      { tipo: 'alimentacion', ref: 'PWR1', props: { nombre: 'VCC' }, pines: { '1': 'a' } },
      { tipo: 'alimentacion', ref: 'PWR2', props: { nombre: '+15V' }, pines: { '1': 'b' } },
      { tipo: 'alimentacion', ref: 'PWR3', props: { nombre: '−15V' }, pines: { '1': 'c' } },
      ...['a', 'b', 'c'].map((r, i) => ({ tipo: 'resistencia', ref: `R${i + 1}`, pines: { '1': r, '2': '0' } }))
    ])
    const r = compilar(d)
    expect(r.errores).toEqual([])
    expect(r.netlist!.elements.filter((e) => e.type === 'V').map((e) => (e as { wave: { v: number } }).wave.v).sort((a, b) => a - b)).toEqual([-15, 5, 15])
  })

  it('dos nombres distintos unidos por un cable no pueden tener dos voltajes, y se explica', () => {
    const d = divisorConTerminal({ nombre: 'VCC' })
    d.piezas.p_pwr2 = terminal('p_pwr2', 0, -4, { nombre: '+12V' })
    const r = compilar(d)
    expect(r.netlist).toBeNull()
    expect(r.errores).toEqual([expect.stringMatching(/^(VCC|\+12V) tiene dos voltajes distintos: 5 V y 12 V\.$/)])
    const a = avisosDelCircuito(d, calcularConexiones(d, lib), lib)
    expect(a.find((x) => /dos voltajes/.test(x.texto))!.piezas).toEqual(['p_pwr', 'p_pwr2'])
  })

  it('un terminal que da voltaje a la red de tierra es un corto, y con 0 V no hace nada', () => {
    const corto = (nombre: string) => {
      const d = divisorConTerminal({ nombre: 'VCC' })
      d.piezas.p_pwr2 = terminal('p_pwr2', 0, 8, { nombre })
      return compilar(d)
    }
    expect(corto('X').errores).toEqual(['X está conectado a tierra con 5 V: es un corto.'])
    expect(corto('0V').errores).toEqual([])
  })

  it('se llama «Alimentación» y el buscador la encuentra por los nombres de siempre', () => {
    expect(def.nombre.es).toBe('Alimentación')
    for (const q of ['alimentación', 'terminal', 'terminal de alimentación', 'vcc', '+5v']) {
      expect(buscar(q, lib).some((r) => r.def.id === 'alimentacion'), q).toBe(true)
    }
  })

  it('un terminal sin conectar a nada da el aviso de un pin suelto, y no «sin camino a tierra»', () => {
    const d = documentoVacio()
    d.piezas.t1 = terminal('t1', 0, 0)
    d.piezas.g = { id: 'g', tipo: 'tierra', ref: 'GND1', x: 20, y: 0, rot: 0, espejo: false, props: {} }
    expect(avisos(d)).toEqual(['El pin alimentación de T1 no está conectado a nada.'])
    expect(compilarNetlist(d, lib, calcularConexiones(d, lib)).errores).toEqual(['El pin alimentación de T1 no está conectado a nada.'])
  })

  it('un riel con un voltaje que no se lee (un archivo mal formado) impide simular y dice cuál', () => {
    const d = divisorConTerminal({ nombre: 'VCC' }, { VCC: 'mucho' })
    expect(compilar(d).errores).toEqual(['El voltaje «mucho» de VCC no es válido.'])
    expect(avisos(d)).toContain('El voltaje «mucho» de VCC no es válido.')
  })

  it('el panel Proyecto lista el terminal con su nombre y el voltaje de su riel', () => {
    const d = divisorConTerminal({ nombre: 'VDD' }, { VDD: '3.3' })
    const v = vistaProyecto(d, lib, calcularConexiones(d, lib), new Map())
    expect(v.piezas.find((x) => x.id === 'p_pwr')).toMatchObject({ nombre: 'Alimentación', valor: 'VDD, 3.3 V' })
    d.piezas.p_pwr = { ...d.piezas.p_pwr, props: { nombre: '+15V' } }
    expect(vistaProyecto(d, lib, calcularConexiones(d, lib), new Map()).piezas.find((x) => x.id === 'p_pwr')).toMatchObject({ valor: '+15V' })
  })

  it('no hay avisos de isla: el terminal lleva su red a tierra', () => {
    expect(avisos(divisorConTerminal())).toEqual([])
  })

  it('un LED directo entre el terminal y tierra da el aviso con el nombre del terminal; con resistencia no', () => {
    const d = ledConBateria()
    delete d.piezas.p_b1
    d.piezas.p_pwr = terminal('p_pwr', 0, -4, { nombre: 'VCC' })
    expect(diodosDirectos(d, lib, calcularConexiones(d, lib))).toEqual([])
    delete d.piezas.p_r1
    d.cables.c_a = { id: 'c_a', puntos: [{ x: 0, y: -4 }, { x: 0, y: -8 }, { x: 14, y: -8 }] }
    expect(compilar(d).errores).toEqual(['D1 está conectado directo a VCC, sin resistencia: agrega una en serie.'])
  })
})
