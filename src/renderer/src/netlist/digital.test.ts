// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { avisosDelCircuito } from '../ui/proyecto'
import { compilarNetlist, type ElementoMotor } from './netlist'

const lib = libreriaDePrueba().piezas
const compilar = (d: Documento) => compilarNetlist(d, lib, calcularConexiones(d, lib))
const armar = (partes: Parte[]) => conEtiquetas(lib, partes)
const tipos = (els: ElementoMotor[]) => els.map((e) => e.type).sort()
const estado = (ref: string, valor: '0' | '1', red: string, props: Record<string, string> = {}): Parte => ({ tipo: 'estado-logico', ref, props: { estado: valor, ...props }, pines: { S: red } })
const nand = (ref: string, a: string, b: string, y: string, props: Record<string, string> = {}): Parte => ({ tipo: 'nand', ref, props, pines: { A: a, B: b, Y: y } })
const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const LED = (ref: string, a: string, k: string): Parte => ({ tipo: 'led', ref, props: { color: 'rojo' }, pines: { A: a, K: k } })

describe('la netlist digital', () => {
  it('dos estados lógicos, una NAND y un LED: las redes de las entradas son digitales puras y la salida lleva un puente', () => {
    const d = armar([estado('E1', '1', 'a'), estado('E2', '1', 'b'), nand('U1', 'a', 'b', 'y'), R('R1', '330', 'y', 'led'), LED('D1', 'led', '0')])
    const r = compilar(d)
    expect(r.errores).toEqual([])
    expect(r.avisos).toEqual([])
    const n = r.netlist!
    expect(tipos(n.elements)).toEqual(['D', 'DAC', 'GATE', 'LOGIC', 'LOGIC', 'R'])
    expect(n.digital_nets).toBe(3)
    const con = calcularConexiones(d, lib)
    const redDe = (nombre: string) => con.redes.find((x) => x.nombre === nombre)!.id
    expect(r.redDigital.has(redDe('a')) && r.redDigital.has(redDe('b'))).toBe(true)
    expect(r.redDigital.has(redDe('y'))).toBe(false)
    expect(r.nodoDeRed.has(redDe('y'))).toBe(true)
    const gate = n.elements.find((e) => e.type === 'GATE') as Extract<ElementoMotor, { type: 'GATE' }>
    const dac = n.elements.find((e) => e.type === 'DAC') as Extract<ElementoMotor, { type: 'DAC' }>
    expect(gate).toMatchObject({ fn: 'nand', z_como: 'x' })
    expect(gate.output).toBe(dac.input)
    expect(dac.out).toBe(r.nodoDeRed.get(redDe('y')))
    // 74HC a 5 V, los mismos parámetros de las referencias.
    expect(dac.v_hi).toBe(5)
    expect(Math.abs(dac.r_lo - 55)).toBeLessThan(1e-9)
    expect(Math.abs(gate.rise_delay - 5e-9)).toBeLessThan(1e-18)
    const u1 = r.digitales.get('p_2')!
    expect(u1).toMatchObject({ familia: '74HC', alimentacion: 5 })
    expect(n.elements[u1.elemento].type).toBe('GATE')
    expect(r.manejoDeRed.get(redDe('y'))).toBe(dac.input)
    // El LED y su resistencia no cambian.
    expect(n.elements.find((e) => e.type === 'D')).toMatchObject({ is: 1.5e-17, n: 2 })
  })

  it('una NAND de tres entradas y una XNOR de cuatro llegan al motor con todas sus entradas', () => {
    const d = armar([
      estado('E1', '1', 'a'), estado('E2', '1', 'b'), estado('E3', '0', 'c'),
      { tipo: 'nand-3', ref: 'U1', props: {}, pines: { A: 'a', B: 'b', C: 'c', Y: 'y' } },
      { tipo: 'xnor-4', ref: 'U2', props: {}, pines: { A: 'a', B: 'b', C: 'c', D: 'a', Y: 'z' } },
      R('R1', '1k', 'y', '0'), R('R2', '1k', 'z', '0')
    ])
    const r = compilar(d)
    expect(r.errores).toEqual([])
    const compuertas = r.netlist!.elements.filter((e) => e.type === 'GATE') as Extract<ElementoMotor, { type: 'GATE' }>[]
    expect(compuertas.map((g) => [g.fn, g.inputs.length])).toEqual([['nand', 3], ['xnor', 4]])
  })

  it('un inversor Schmitt sobre una red analógica lleva un puente con histéresis y los umbrales de disparo de su familia', () => {
    const d = armar([
      { tipo: 'fuente-ac', ref: 'V1', props: {}, pines: { '+': 'a', '-': '0' } },
      { tipo: 'not-schmitt', ref: 'U1', props: {}, pines: { A: 'a', Y: 'y' } },
      R('R1', '1k', 'y', '0')
    ])
    const r = compilar(d)
    expect(r.errores).toEqual([])
    const adc = r.netlist!.elements.find((e) => e.type === 'ADC') as Extract<ElementoMotor, { type: 'ADC' }>
    expect(adc.histeresis).toBe(true)
    expect([adc.in_low, adc.in_high].map((v) => Math.round(v * 100) / 100)).toEqual([1.73, 2.77])
  })

  it('una entrada común no lleva histéresis', () => {
    const d = armar([{ tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } }, { tipo: 'not', ref: 'U1', props: {}, pines: { A: 'a', Y: 'y' } }, R('R1', '1k', 'y', '0')])
    const adc = compilar(d).netlist!.elements.find((e) => e.type === 'ADC') as Extract<ElementoMotor, { type: 'ADC' }>
    expect(adc.histeresis).toBeUndefined()
  })

  it('dos búferes de tres estados en una red solo digital comparten una red del motor, sin puente de salida', () => {
    const bufer = (ref: string, a: string, oe: string): Parte => ({ tipo: 'buffer-3-estados', ref, props: {}, pines: { A: a, OE: oe, Y: 'bus' } })
    const d = armar([estado('E1', '1', 'a'), estado('E2', '0', 'b'), estado('E3', '0', 'oe1'), estado('E4', '1', 'oe2'), bufer('U1', 'a', 'oe1'), bufer('U2', 'b', 'oe2'), nand('U3', 'bus', 'bus', 'y'), R('R1', '1k', 'y', '0')])
    const r = compilar(d)
    expect(r.errores).toEqual([])
    const n = r.netlist!
    const compuertas = n.elements.filter((e) => e.type === 'GATE' && e.fn === 'buf') as Extract<ElementoMotor, { type: 'GATE' }>[]
    expect(compuertas).toHaveLength(2)
    expect(compuertas[0].output).toBe(compuertas[1].output)
    expect(compuertas.map((g) => [g.enable_bajo, g.enable !== undefined])).toEqual([[true, true], [true, true]])
    // El único puente de salida es el de la NAND.
    expect(n.elements.filter((e) => e.type === 'DAC')).toHaveLength(1)
  })

  it('dos búferes de tres estados sobre una red analógica llevan cada uno su puente de salida en alta impedancia', () => {
    const bufer = (ref: string, a: string, oe: string): Parte => ({ tipo: 'buffer-3-estados', ref, props: {}, pines: { A: a, OE: oe, Y: 'bus' } })
    const d = armar([estado('E1', '1', 'a'), estado('E2', '0', 'b'), estado('E3', '0', 'oe1'), estado('E4', '1', 'oe2'), bufer('U1', 'a', 'oe1'), bufer('U2', 'b', 'oe2'), R('R1', '1k', 'bus', '0')])
    const r = compilar(d)
    expect(r.errores).toEqual([])
    const dacs = r.netlist!.elements.filter((e) => e.type === 'DAC') as Extract<ElementoMotor, { type: 'DAC' }>[]
    expect(dacs.map((x) => x.z)).toEqual([true, true])
    expect(dacs[0].out).toBe(dacs[1].out)
  })

  it('un búfer de tres estados y una compuerta común en la misma red se aceptan: una salida fija más las de tres estados', () => {
    const d = armar([estado('E1', '1', 'a'), estado('E2', '0', 'oe'), { tipo: 'buffer-3-estados', ref: 'U1', props: {}, pines: { A: 'a', OE: 'oe', Y: 'y' } }, nand('U2', 'a', 'a', 'y'), R('R1', '1k', 'y', '0')])
    expect(compilar(d).errores).toEqual([])
    expect(avisosDelCircuito(d, calcularConexiones(d, lib), lib).map((a) => a.texto).filter((t) => t.includes('manejan la misma red'))).toEqual([])
  })

  it('dos compuertas comunes y un búfer de tres estados en la misma red siguen sin simular y el aviso nombra solo las comunes', () => {
    const d = armar([
      estado('E1', '1', 'a'), estado('E2', '0', 'oe'),
      { tipo: 'buffer-3-estados', ref: 'U1', props: {}, pines: { A: 'a', OE: 'oe', Y: 'y' } },
      nand('U2', 'a', 'a', 'y'), nand('U3', 'a', 'a', 'y'), R('R1', '1k', 'y', '0')
    ])
    expect(compilar(d).errores).toContain('U2 y U3 manejan la misma red: une sus salidas con una compuerta, no con un cable.')
  })

  it('una salida común no lleva la marca de alta impedancia', () => {
    const d = armar([estado('E1', '1', 'a'), nand('U1', 'a', 'a', 'y'), R('R1', '1k', 'y', '0')])
    expect((compilar(d).netlist!.elements.find((e) => e.type === 'DAC') as Extract<ElementoMotor, { type: 'DAC' }>).z).toBeUndefined()
  })

  it('una entrada en la tierra lee 0 sin puente y una sobre una fuente lleva un puente con los umbrales de su familia', () => {
    const d = armar([
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
      nand('U1', '0', 'vcc', 'y', { familia: '74LS' }),
      R('R1', '1k', 'y', '0')
    ])
    const r = compilar(d)
    expect(r.errores).toEqual([])
    const n = r.netlist!
    expect(n.elements.filter((e) => e.type === 'LOGIC')).toEqual([{ type: 'LOGIC', out: expect.any(Number), value: 0 }])
    const adc = n.elements.find((e) => e.type === 'ADC') as Extract<ElementoMotor, { type: 'ADC' }>
    expect(adc).toMatchObject({ in_low: 0.8, in_high: 2.0, r_in: 5500, v_in: 2.6, n: 0 })
    expect((n.elements.find((e) => e.type === 'GATE') as Extract<ElementoMotor, { type: 'GATE' }>).z_como).toBe('uno')
  })

  it('dos salidas en la misma red impiden simular y el aviso nombra las dos', () => {
    const d = armar([estado('E1', '1', 'a'), nand('U1', 'a', 'a', 'y'), nand('U3', 'a', 'a', 'y'), R('R1', '1k', 'y', '0')])
    const r = compilar(d)
    expect(r.netlist).toBeNull()
    expect(r.errores).toContain('U1 y U3 manejan la misma red: une sus salidas con una compuerta, no con un cable.')
    expect(avisosDelCircuito(d, calcularConexiones(d, lib), lib).map((a) => a.texto)).toContain('U1 y U3 manejan la misma red: une sus salidas con una compuerta, no con un cable.')
  })

  it('una entrada CMOS que solo llega a un botón lleva una fuga a tierra y avisa; con resistencia a tierra o en 74LS, no', () => {
    const V = { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } }
    const SW = { tipo: 'boton', ref: 'SW1', pines: { '1': 'vcc', '2': 'a' } }
    const NOT = (familia: string) => ({ tipo: 'not', ref: 'U1', props: { familia }, pines: { A: 'a', Y: 'y' } })
    const sola = armar([V, SW, NOT('74HC'), R('R1', '10k', 'y', '0')])
    const r = compilar(sola)
    const texto = 'La entrada A de U1 solo llega a SW1: con el contacto abierto queda al aire y se toma como 0 V. Agrega una resistencia a tierra para fijar su nivel.'
    expect(r.avisos).toEqual([texto])
    const fugas = r.netlist!.elements.filter((e) => e.type === 'R' && e.ohms === 1e6)
    expect(fugas).toHaveLength(1)
    // La fuga va después de los elementos de las piezas y no tiene pieza: no le quita su lectura al botón.
    const k = r.netlist!.elements.indexOf(fugas[0])
    expect(r.piezaDeElemento[k]).toBe('')
    expect(r.piezaDeElemento.slice(0, k)).toContain('p_1')
    expect(avisosDelCircuito(sola, calcularConexiones(sola, lib), lib)).toContainEqual({ texto, piezas: ['p_1', 'p_2'], leve: true })
    for (const d of [armar([V, SW, NOT('74HC'), R('R1', '10k', 'y', '0'), R('R2', '10k', 'a', '0')]), armar([V, SW, NOT('74LS'), R('R1', '10k', 'y', '0')])]) {
      const q = compilar(d)
      expect(q.avisos).toEqual([])
      expect(q.netlist!.elements.filter((e) => e.type === 'R' && e.ohms === 1e6)).toHaveLength(0)
    }
  })

  it('una entrada CMOS al aire avisa sin impedir simular; en 74LS no avisa', () => {
    const d = armar([estado('E1', '1', 'a'), nand('U2', 'a', 'suelta', 'y'), R('R1', '1k', 'y', '0')])
    const r = compilar(d)
    expect(r.netlist).not.toBeNull()
    expect(r.avisos).toEqual(['La entrada B de U2 está al aire: en CMOS su nivel no está definido.'])
    const avisos = avisosDelCircuito(d, calcularConexiones(d, lib), lib)
    expect(avisos).toContainEqual({ texto: 'La entrada B de U2 está al aire: en CMOS su nivel no está definido.', piezas: ['p_1'], leve: true })
    const ls = armar([estado('E1', '1', 'a'), nand('U2', 'a', 'suelta', 'y', { familia: '74LS' }), R('R1', '1k', 'y', '0')])
    expect(compilar(ls).avisos).toEqual([])
  })

  it('PRE y CLR al aire dicen que se lleven a VCC', () => {
    const ff: Parte = { tipo: 'biestable-d', ref: 'U1', props: {}, pines: { D: 'a', CLK: 'a', PRE: 'suelta', CLR: 'suelta2', Q: 'y', QN: 'qn' } }
    const d = armar([estado('E1', '1', 'a'), ff, R('R1', '1k', 'y', '0'), R('R2', '1k', 'qn', '0')])
    const avisos = avisosDelCircuito(d, calcularConexiones(d, lib), lib).filter((a) => a.leve)
    expect(avisos.map((a) => a.texto)).toContain('La entrada PRE de U1 está al aire: en CMOS su nivel no está definido. Llévala a VCC si no la usas.')
    expect(compilar(d).avisos[0]).toContain('Llévalos a VCC si no usas PRE y CLR.')
  })

  it('un reloj que no cruza los umbrales de su familia avisa con los dos voltajes', () => {
    const circuito = (alto: string) =>
      armar([
        { tipo: 'fuente-pulso', ref: 'V1', props: { alto, frecuencia: '1k' }, pines: { '+': 'clk', '-': '0' } },
        { tipo: 'fuente-dc', ref: 'V2', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
        { tipo: 'biestable-d', ref: 'U1', props: {}, pines: { D: 'qn', CLK: 'clk', PRE: 'vcc', CLR: 'vcc', Q: 'y', QN: 'qn' } },
        R('R1', '1k', 'y', '0')
      ])
    const aviso = compilar(circuito('1')).avisos.find((t) => t.includes('no llega a conmutar'))
    expect(aviso).toBe('La entrada reloj (CLK) de U1 no llega a conmutar: su señal va de 0.00 V a 1.00 V y el 74HC necesita bajar de 1.50 V y subir de 3.50 V.')
    expect(compilar(circuito('5')).avisos.some((t) => t.includes('no llega a conmutar'))).toBe(false)
  })

  it('muchas entradas sobre el mismo reloj bajo el umbral avisan una por una sin costo cuadrático', () => {
    const N = 1500
    const partes: Parte[] = [
      { tipo: 'fuente-pulso', ref: 'V1', props: { alto: '1', frecuencia: '1k' }, pines: { '+': 'clk', '-': '0' } },
      { tipo: 'fuente-dc', ref: 'V2', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } }
    ]
    for (let i = 0; i < N; i++) partes.push({ tipo: 'biestable-d', ref: `U${i + 1}`, props: {}, pines: { D: `q${i}`, CLK: 'clk', PRE: 'vcc', CLR: 'vcc', Q: `q${i}`, QN: `n${i}` } })
    const d = armar(partes)
    const t0 = performance.now()
    const r = compilar(d)
    const ms = performance.now() - t0
    expect(r.avisos.filter((t) => t.includes('no llega a conmutar'))).toHaveLength(N)
    expect(ms).toBeLessThan(5000)
  })

  it('varias entradas al aire se dicen en una sola línea del Registro al simular; el inspector las lista una por una', () => {
    const d = armar([estado('E1', '1', 'a'), nand('U2', 'a', 'suelta', 'y'), nand('U3', 'suelta2', 'a', 'z'), R('R1', '1k', 'y', '0'), R('R2', '1k', 'z', '0')])
    expect(compilar(d).avisos).toEqual(['Las entradas B de U2 y A de U3 están al aire: en CMOS su nivel no está definido.'])
    expect(avisosDelCircuito(d, calcularConexiones(d, lib), lib).filter((a) => a.leve)).toHaveLength(2)
  })

  it('una alimentación fuera de la familia impide simular con el intervalo en el texto', () => {
    const d = armar([estado('E1', '1', 'a', { alimentacion: '12 V' }), nand('U1', 'a', 'a', 'y', { alimentacion: '12 V' }), R('R1', '1k', 'y', '0')])
    const r = compilar(d)
    expect(r.netlist).toBeNull()
    expect(r.errores).toContain('La alimentación de 12 V de U1 está fuera del intervalo de 74HC (2 V a 6 V).')
    const ls = armar([estado('E1', '1', 'a', { familia: '74LS', alimentacion: '9 V' }), R('R1', '1k', 'a', '0')])
    expect(compilar(ls).errores).toContain('La alimentación de 9 V de E1 está fuera del intervalo de 74LS (5 V).')
  })

  it('una familia que no existe (un .kir manipulado) simula con la de omisión y lo avisa', () => {
    const d = armar([estado('E1', '1', 'a'), nand('U1', 'a', 'a', 'y', { familia: '74XX' }), R('R1', '1k', 'y', '0')])
    const r = compilar(d)
    expect(r.netlist).not.toBeNull()
    expect(r.avisos).toContain('U1 trae la familia «74XX», que no existe: se simula como 74HC.')
  })

  it('un circuito solo digital, sin tierra, compila sin nodos analógicos', () => {
    const d = armar([estado('E1', '1', 'a'), { tipo: 'not', ref: 'U1', pines: { A: 'a', Y: 'y' } }, { tipo: 'not', ref: 'U2', pines: { A: 'y', Y: 'z' } }])
    delete d.piezas.p_tierra
    for (const id of Object.keys(d.etiquetas)) if (d.etiquetas[id].nombre === '0') delete d.etiquetas[id]
    const r = compilar(d)
    expect(r.errores).toEqual([])
    expect(r.netlist).toMatchObject({ nodes: 1, digital_nets: 3 })
    expect(avisosDelCircuito(d, calcularConexiones(d, lib), lib).filter((a) => !a.leve)).toEqual([])
  })

  it('un anillo de tres inversores compila: el lazo lo dice el motor al arrancar (lazo_de_arranque)', () => {
    const not = (ref: string, a: string, y: string): Parte => ({ tipo: 'not', ref, pines: { A: a, Y: y } })
    const r = compilar(armar([not('U1', 'c', 'a'), not('U2', 'a', 'b'), not('U3', 'b', 'c')]))
    expect(r.errores).toEqual([])
    expect(r.netlist!.elements.filter((e) => e.type === 'GATE')).toHaveLength(3)
  })

  it('el 555 se arma con su divisor, sus tres comparadores, su biestable y su salida con la descarga', () => {
    const d = armar([
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
      R('R1', '1k', 'vcc', 'dis'),
      R('R2', '10k', 'dis', 'thr'),
      { tipo: 'capacitor', ref: 'C1', props: { valor: '100n' }, pines: { '1': 'thr', '2': '0' } },
      R('RL', '10k', 'out', '0'),
      { tipo: 'temporizador-555', ref: 'U1', props: { modelo: 'NE555' }, pines: { '1': '0', '2': 'thr', '3': 'out', '4': 'vcc', '5': 'cv', '6': 'thr', '7': 'dis', '8': 'vcc' } }
    ])
    const r = compilar(d)
    expect(r.errores).toEqual([])
    const n = r.netlist!
    const del555 = n.elements.filter((_, k) => r.piezaDeElemento[k] === 'p_5')
    expect(tipos(del555)).toEqual(['ADC', 'ADC', 'ADC', 'LATCH555', 'OUT555', 'R', 'R', 'R', 'R'])
    const t = r.temporizadores.get('p_5')!
    expect(n.elements[t.salida]).toMatchObject({ type: 'OUT555', q: t.q, v_hi: -1.4, r_hi: 3, g_off: 1e-9 })
    expect((n.elements[t.salida] as Extract<ElementoMotor, { type: 'OUT555' }>).g_on).toBeCloseTo(1 / 15, 12)
    expect(del555.filter((e) => e.type === 'R').map((e) => (e as Extract<ElementoMotor, { type: 'R' }>).ohms).sort((a, b) => a - b)).toEqual([1800, 5000, 5000, 5000])
    expect(n.digital_nets).toBe(4)
  })

  it('el display arma un LED por segmento conectado, del segmento al común o del común al segmento', () => {
    const segmentos = (conectados: string[]) => Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'].map((s) => [s, conectados.includes(s) ? `s_${s}` : `suelto_${s}`]))
    const parte = (tipo: string, conectados: string[]): Parte => ({ tipo: 'display-7seg', ref: 'DS1', props: { tipo }, pines: { ...segmentos(conectados), COM: '0' } })
    const resistencias = (conectados: string[]) => conectados.map((s, k) => R(`R${k + 1}`, '330', 'vcc', `s_${s}`))
    const fuente: Parte = { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } }
    const r = compilar(armar([fuente, ...resistencias(['a', 'b', 'c']), parte('cátodo común', ['a', 'b', 'c'])]))
    expect(r.errores).toEqual([])
    const indices = r.displays.get('p_4')!
    expect(indices.filter((k) => k >= 0)).toHaveLength(3)
    expect(indices.slice(3)).toEqual([-1, -1, -1, -1, -1])
    const led = r.netlist!.elements[indices[0]] as Extract<ElementoMotor, { type: 'D' }>
    expect(led.b).toBe(0)
    const anodo = compilar(armar([fuente, ...resistencias(['a']), parte('ánodo común', ['a'])]))
    expect((anodo.netlist!.elements[anodo.displays.get('p_2')![0]] as Extract<ElementoMotor, { type: 'D' }>).a).toBe(0)
  })
})
