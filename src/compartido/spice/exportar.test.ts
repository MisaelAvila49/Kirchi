import { describe, expect, it } from 'vitest'
import type { NetlistMotor } from '../netlistMotor'
import { ErrorExportacion, estadosContador, exportarSpice, numero, tablaDecodificador } from './exportar'
import { armarMazo, validarPeticion } from './mazo'

const nl = (elements: unknown[], extra: Partial<NetlistMotor> = {}): NetlistMotor => ({ nodes: 4, elements, ...extra }) as NetlistMotor
const cuerpo = (elements: unknown[], extra: Partial<NetlistMotor> = {}): string => exportarSpice(nl(elements, extra)).cuerpo

/** Todo lo que la netlist puede contener: letras minúsculas, cifras y la puntuación de SPICE; nada de mayúsculas ni de saltos escondidos. */
const LINEA_SEGURA = /^[a-z0-9_ .+\-*/()[\]{}=,%:^"<>!#@$]*$/
const DIRECTIVAS_PROHIBIDAS = /^\s*\.(include|inc|lib|control|endc|end|csparam|osdi|temp|global|ic|nodeset|plot|print|save|write|measure|meas|option|options|tran|ac|dc|op|func|if|else|endif|else)\b/i

describe('números', () => {
  it('se escriben sin configuración regional', () => {
    expect(numero(0.001)).toBe('0.001')
    expect(numero(1e-12)).toBe('1e-12')
    expect(numero(2.5e21)).toBe('2.5e+21')
    expect(numero(-0)).toBe('0')
  })
  it.each([NaN, Infinity, -Infinity])('rechaza %s', (v) => {
    expect(() => numero(v)).toThrow(ErrorExportacion)
  })
})

describe('condiciones iniciales y corriente variable', () => {
  it('el capacitor y el inductor llevan ic= solo si traen condición inicial', () => {
    const c = cuerpo([
      { type: 'C', a: 1, b: 0, farads: 1e-5, ic: 5 },
      { type: 'C', a: 2, b: 0, farads: 1e-5 },
      { type: 'L', a: 3, b: 0, henries: 0.01, ic: -0.002 }
    ])
    expect(c).toContain('c0 n1 0 0.00001 ic=5')
    expect(c).toMatch(/^c1 n2 0 0.00001$/m)
    expect(c).toContain('l2 n3 0 0.01 ic=-0.002')
  })
  it('la fuente de corriente con onda sale como seno o pulso y sin onda como continua', () => {
    const c = cuerpo([
      { type: 'I', a: 0, b: 1, amps: 0, wave: { kind: 'sine', offset: 0, amp: 0.001, freq: 1000 } },
      { type: 'I', a: 0, b: 2, amps: 0.002 }
    ])
    expect(c).toContain('i0 0 n1 sin(0 0.001 1000 0 0 0)')
    expect(c).toContain('i1 0 n2 dc 0.002')
  })
})

describe('elementos básicos', () => {
  it('traduce resistencias, capacitores, inductores y fuentes con nombres generados', () => {
    const t = cuerpo([
      { type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 12 } },
      { type: 'R', a: 1, b: 2, ohms: 4700 },
      { type: 'C', a: 2, b: 0, farads: 1e-7 },
      { type: 'L', a: 2, b: 3, henries: 0.01 },
      { type: 'I', a: 3, b: 0, amps: 0.002 }
    ])
    expect(t).toBe('v0 n1 0 dc 12\nr1 n1 n2 4700\nc2 n2 0 1e-7\nl3 n2 n3 0.01\ni4 n3 0 dc 0.002\n')
  })

  it('traduce las ondas como las referencias: seno con fase, cuadrada con flancos de 1 ps y pulso con retardo', () => {
    const t = cuerpo([
      { type: 'V', a: 1, b: 0, wave: { kind: 'sine', offset: 1, amp: 2, freq: 1000, phase: 0.25 } },
      { type: 'V', a: 2, b: 0, wave: { kind: 'square', low: 0, high: 5, freq: 1e6, duty: 0.5 } },
      { type: 'V', a: 3, b: 0, wave: { kind: 'pulse', low: 0, high: 1, freq: 1000, rise: 1e-5, fall: 2e-5, width: 3e-4, phase: 0.5 } }
    ])
    expect(t).toContain('v0 n1 0 sin(1 2 1000 0 0 90)')
    expect(t).toContain('v1 n2 0 pulse(0 5 0 1p 1p 4.99999e-7 0.000001)')
    expect(t).toMatch(/v2 n3 0 pulse\(0 1 0\.0005 0\.00001 0\.00002 0\.0003 0\.001\)/)
  })

  it('la escalera sale como PWL repetido con saltos de 1 ps', () => {
    const t = cuerpo([{ type: 'V', a: 1, b: 0, wave: { kind: 'stair', low: 0, high: 3, freq: 1000, steps: 4 } }])
    // 4 niveles (0, 1, 2 y 3) y un salto de 1 ps en cada límite de escalón.
    expect(t).toBe('v0 n1 0 pwl(0 0 0.000249999999 0 0.00025 1 0.000499999999 1 0.0005 2 0.000749999999 2 0.00075 3 0.001 3) r=0\n')
  })

  it('la CA agrega la excitación a la fuente pedida', () => {
    const e = exportarSpice(nl([{ type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 0 } }]), { fuenteAc: 0 })
    expect(e.cuerpo).toBe('v0 n1 0 dc 0 ac 1\n')
  })
})

describe('modelos', () => {
  it('un diodo lleva su modelo con nombre generado y se reutiliza', () => {
    const d = { type: 'D', a: 1, b: 0, is: 1e-14, n: 1.2 }
    const t = cuerpo([d, { ...d, a: 2 }, { ...d, n: 2 }])
    expect(t.match(/^\.model /gm)).toHaveLength(2)
    expect(t).toContain('.model dm1 d(is=1e-14 n=1.2 rs=0 cjo=0 vj=1 m=0.5 tt=0 fc=0.5)')
    expect(t).toContain('d0 n1 0 dm1\nd1 n2 0 dm1\nd2 n1 0 dm2')
  })

  it('un zener lleva su ruptura', () => {
    const t = cuerpo([{ type: 'D', a: 0, b: 1, is: 1e-14, n: 1, bv: 5.1, ibv: 0.05 }])
    expect(t).toContain('bv=5.1 ibv=0.05 nbv=1')
  })

  it('el transistor y el MOSFET usan los nombres de ngspice y W y L de la instancia', () => {
    const t = cuerpo([
      { type: 'Q', c: 1, b: 2, e: 0, pnp: true, model: { is: 1e-14, bf: 200 } },
      { type: 'M', d: 1, g: 2, s: 0, pmos: false, model: { vto: 2, kp: 0.1, w: 0.001, l: 0.001 } }
    ])
    expect(t).toContain('.model qm1 pnp(is=1e-14 bf=200)')
    expect(t).toContain('q0 n1 n2 0 qm1')
    expect(t).toContain('.model mm2 nmos(level=1 vto=2 kp=0.1)')
    expect(t).toContain('m1 n1 n2 0 0 mm2 w=0.001 l=0.001')
  })

  it('un parámetro de modelo que no existe se rechaza y el mensaje nombra la pieza', () => {
    expect(() => exportarSpice(nl([{ type: 'Q', c: 1, b: 2, e: 0, pnp: false, model: { bf: 100, ".include": 1 } }]), { nombresElementos: ['Q7'] })).toThrow(/Q7.*no existe/)
  })

  it('el amplificador usa el subcircuito del motor con sus parámetros', () => {
    const t = cuerpo([{ type: 'OA', p: 1, n: 2, out: 3, vp: 0, vn: 0, model: { a0: 1e5 } }])
    expect(t).toContain('.subckt ampop mas menos sal vp vn')
    expect(t).toMatch(/x0 n1 n2 n3 0 0 ampop a0=100000 gbw=1000000 sr=500000 rin=2000000 rout=75 ilim=0.025 dhi=1 dlo=1 rq=17600/)
  })
})

describe('piezas con varias partes', () => {
  it('foco, motor, relé, fusible y fuente de laboratorio dan sus ecuaciones', () => {
    const t = cuerpo([
      { type: 'LAMP', a: 1, b: 0, rfrio: 2.88, k: 9, pnom: 5, tau: 0.05 },
      { type: 'MOTOR', a: 1, b: 0, r: 3, l: 1.5e-3, ke: 6.05e-3, j: 2.4e-7, bm: 6.4e-7 },
      { type: 'RELAY', a1: 1, a2: 0, com: 2, na: 3, nc: 0, r: 69.4, l: 0.2, ion: 0.054, ioff: 0.0072 },
      { type: 'FUSE', a: 1, b: 2, ohms: 0.1, inom: 1, ifusion: 2, tau: 0.125 },
      { type: 'PSU', a: 1, b: 0, v: 12, ilim: 0.1, vk: 5e-3, encendida: true },
      { type: 'XFMR', a1: 1, b1: 0, a2: 2, b2: 0, l1: 0.5, l2: 12.5, k: 0.9 }
    ])
    expect(t).toContain('bl0 n1 0 i=(v(n1)-0)/(2.88*(1+9*v(th0)))')
    expect(t).toContain('bq0 th0 0 i=0.9*pwr(v(th0),3.333333333)')
    expect(t).toContain('cth0 th0 0 0.155')
    expect(t).toContain('be1 xm1c 0 v=0.00605*v(w1)')
    expect(t).toContain('.model wa1 csw(it=0.0306 ih=0.0234 ron=1m roff=1e9)')
    expect(t).toContain('.model sf3 sw(vt=1.5 vh=2.5 ron=1e9 roff=1u)')
    expect(t).toContain('bp4 0 n1 i=0.1*tanh((12-(v(n1)-0))/0.005)')
    expect(t).toContain('k5 l5a l5b 0.9')
    expect(exportarSpice(nl([{ type: 'RELAY', a1: 1, a2: 0, com: 2, na: 3, nc: 0, r: 69.4, l: 0.2, ion: 0.054, ioff: 0.0072 }])).opciones).toContain('method=gear')
  })

  it('el multímetro sin carga no estampa nada pero deja el nodo', () => {
    expect(cuerpo([{ type: 'FUSE', a: 1, b: 0, ohms: 1e7, inom: 10, ifusion: 20, tau: 0.125, sin_carga: true }])).toBe('rf0 n1 0 1e15\n')
  })

  it('el multímetro con fuente de prueba la pone en serie con el fusible', () => {
    const t = cuerpo([{ type: 'FUSE', a: 1, b: 2, ohms: 0.01, inom: 10, ifusion: 20, tau: 0.125, v: 1 }])
    expect(t).toContain('v0s n1 xf0a dc 1')
  })
})

describe('lógica', () => {
  it('compuertas, puentes y estados con XSPICE', () => {
    const t = cuerpo(
      [
        { type: 'ADC', p: 1, n: 0, out: 0, in_low: 1.5, in_high: 3.5 },
        { type: 'GATE', fn: 'not', inputs: [0], output: 1, rise_delay: 5e-9, fall_delay: 5e-9, z_como: 'x' },
        { type: 'DAC', input: 1, out: 2, v_lo: 0, v_hi: 5, r_lo: 55, r_hi: 55, t_rise: 6.7e-9, t_fall: 6.7e-9 },
        { type: 'LOGIC', out: 2, value: 1 }
      ],
      { digital_nets: 3 }
    )
    expect(t).toContain('.model ad1 adc_bridge(in_low=1.5 in_high=3.5 rise_delay=1e-12 fall_delay=1e-12)')
    expect(t).toContain('a0 [n1] [d0] ad1')
    expect(t).toContain('.model gt2 d_inverter(rise_delay=5e-9 fall_delay=5e-9 inertial_delay=true)')
    expect(t).toContain('a1 d0 d1 gt2')
    expect(t).toContain('a2 [d1] [oc2] da3')
    expect(t).toContain('a3 d2 lg4')
    expect(exportarSpice(nl([{ type: 'LOGIC', out: 0, value: 1 }], { digital_nets: 1 })).opciones).toContain('xtrtol=7')
  })

  it('una compuerta de una entrada que no es NOT repite la entrada y una XOR exige dos', () => {
    const t = cuerpo([{ type: 'GATE', fn: 'and', inputs: [0], output: 1, rise_delay: 5e-9, fall_delay: 5e-9, z_como: 'x' }], { digital_nets: 2 })
    expect(t).toContain('a0 [d0 d0] d1')
    expect(() => cuerpo([{ type: 'GATE', fn: 'xor', inputs: [0], output: 1, rise_delay: 5e-9, fall_delay: 5e-9, z_como: 'x' }], { digital_nets: 2 })).toThrow(/XOR/)
  })

  it('una compuerta con habilitación se exporta con un d_tristate y, activa en bajo, un inversor de 1 ps', () => {
    const t = cuerpo([{ type: 'GATE', fn: 'buf', inputs: [0], output: 2, enable: 1, enable_bajo: true, rise_delay: 5e-9, fall_delay: 5e-9, z_como: 'x' }], { digital_nets: 3 })
    expect(t).toContain('d_tristate(delay=5e-9)')
    expect(t).toMatch(/a0e d1 da0 /)
    expect(t).toMatch(/a0t d0 da0 d2 /)
    const n = cuerpo([{ type: 'GATE', fn: 'nand', inputs: [0, 1], output: 3, enable: 2, enable_bajo: false, rise_delay: 5e-9, fall_delay: 7e-9, z_como: 'x' }], { digital_nets: 4 })
    expect(n).toContain('d_nand(rise_delay=1e-12 fall_delay=1e-12')
    expect(n).toContain('d_tristate(delay=6e-9)')
    expect(n).not.toContain('d_inverter')
  })

  it('un puente de entrada con histéresis se exporta con un interruptor SW de SPICE', () => {
    const t = cuerpo([{ type: 'ADC', p: 1, n: 0, out: 0, in_low: 1.6, in_high: 2.7, histeresis: true }], { digital_nets: 1 })
    expect(t).toContain('sw(vt=2.15 vh=0.55 ron=1 roff=1e9)')
  })

  it('una XNOR de tres entradas se exporta como una cadena de XOR cuya última etapa lleva los retardos de la compuerta', () => {
    const t = cuerpo([{ type: 'GATE', fn: 'xnor', inputs: [0, 1, 2], output: 3, rise_delay: 5e-9, fall_delay: 6e-9, z_como: 'x' }], { digital_nets: 4 })
    expect(t).toContain('d_xor(rise_delay=1e-12 fall_delay=1e-12)')
    expect(t).toContain('d_xnor(rise_delay=5e-9 fall_delay=6e-9 inertial_delay=true)')
    expect(t).toContain('a0x0 [d0 d1] da0 xr')
    expect(t).toContain('a0 [da0 d2] d3 gt')
  })

  it('la tabla del decodificador y los estados del contador salen de las del motor', () => {
    // La del archivo de referencia (activo en alto, a primero): el 6 sin la barra de arriba y el 9 sin la de abajo.
    expect(tablaDecodificador(true).slice(0, 16)).toBe('1011010111000000')
    expect(tablaDecodificador(false).slice(0, 16)).toBe('0100101000111111')
    expect(estadosContador(10)).toContain('9 1s 0s 0s 1s 1s 0 -> 0')
    expect(estadosContador(16)).toContain('15 1s 1s 1s 1s 1s 1 -> 0')
  })

  it('el contador lleva su archivo de estados con nombre generado', () => {
    const e = exportarSpice(nl([{ type: 'COUNTER', clk: 0, rst: 1, q: [2, 3, 4, 5], co: 6, modulo: 10, rise_delay: 5e-9, fall_delay: 5e-9, z_como: 'x' }], { digital_nets: 7 }))
    expect(Object.keys(e.archivos)).toEqual(['contador0.in'])
    expect(e.cuerpo).toContain('state_file="contador0.in"')
  })

  it('una entrada 74LS sin nadie que la maneje lee 1', () => {
    const t = cuerpo([{ type: 'GATE', fn: 'not', inputs: [0], output: 1, rise_delay: 3e-9, fall_delay: 7e-9, z_como: 'uno' }], { digital_nets: 2 })
    expect(t).toMatch(/apu0 d0 lg\d/)
  })
})

describe('sondas', () => {
  it('una sonda de voltaje es una expresión sobre nodos con nombre', () => {
    const e = exportarSpice(nl([{ type: 'R', a: 1, b: 2, ohms: 1000 }], { sondas: [{ kind: 'v', p: 1, n: 2, muestras: 256, columna: 1e-3 }, { kind: 'v', p: 1, n: 0, muestras: 256, columna: 1e-3 }, { kind: 'i', element: 0, signo: -1, muestras: 256, columna: 1e-3 }] }))
    expect(e.sondas.map((s) => s.expresion)).toEqual(['(v(n1)-v(n2))', 'v(n1)', '(0-@r0[i])'])
    expect(e.sondas[2].guardar).toEqual(['@r0[i]'])
  })

  it('una sonda sobre un nodo que no existe se rechaza', () => {
    expect(() => exportarSpice(nl([{ type: 'R', a: 1, b: 0, ohms: 1 }], { sondas: [{ kind: 'v', p: 9, n: 0, muestras: 1, columna: 1 }] }))).toThrow(/sonda/i)
  })
})

describe('entradas hostiles', () => {
  it.each([
    ['un valor NaN', [{ type: 'R', a: 1, b: 0, ohms: NaN }]],
    ['un valor infinito', [{ type: 'C', a: 1, b: 0, farads: Infinity }]],
    ['un texto donde va un número', [{ type: 'R', a: 1, b: 0, ohms: '1k\n.include x' }]],
    ['un nodo fuera de rango', [{ type: 'R', a: 1, b: 99, ohms: 1 }]],
    ['un nodo con texto', [{ type: 'R', a: '1; shell', b: 0, ohms: 1 }]],
    ['un nodo fraccionario', [{ type: 'R', a: 1.5, b: 0, ohms: 1 }]],
    ['un tipo que no existe', [{ type: 'SHELL', a: 1, b: 0 }]],
    ['un elemento que no es objeto', ['R1 1 0 1k']],
    ['una resistencia negativa', [{ type: 'R', a: 1, b: 0, ohms: -5 }]],
    ['una onda desconocida', [{ type: 'V', a: 1, b: 0, wave: { kind: 'include' } }]]
  ])('%s', (_c, elementos) => {
    expect(() => cuerpo(elementos as unknown[])).toThrow(ErrorExportacion)
  })

  it('una netlist que no es una netlist', () => {
    expect(() => exportarSpice(null as unknown as NetlistMotor)).toThrow(ErrorExportacion)
    expect(() => exportarSpice({ nodes: 1e9, elements: [] } as NetlistMotor)).toThrow(ErrorExportacion)
    expect(() => exportarSpice({ nodes: 2, elements: 'R1 1 0 1k' } as unknown as NetlistMotor)).toThrow(ErrorExportacion)
  })

  it('los nombres del usuario nunca llegan a la netlist: solo a la tabla de vuelta', () => {
    const feo = ['R1\n.include C:\\Windows\\win.ini', 'X"; .control\nshell calc\n.endc', '.end', "' $(rm -rf)", 'v(n1) .param x=1']
    const e = exportarSpice(nl([{ type: 'R', a: 1, b: 2, ohms: 1000 }, { type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 5 } }]), {
      nombresElementos: feo,
      nombresNodos: new Map([[1, feo[1]], [2, feo[2]]])
    })
    for (const n of feo) expect(e.cuerpo).not.toContain(n)
    for (const l of e.cuerpo.split('\n')) {
      expect(l).toMatch(LINEA_SEGURA)
      expect(l).not.toMatch(DIRECTIVAS_PROHIBIDAS)
    }
    // La tabla de vuelta sí conserva el nombre para mostrarlo.
    expect(e.tabla.nodos.get('n1')).toEqual({ nodo: 1, nombre: feo[1] })
    expect(e.tabla.elementos.get('r0')).toEqual({ indice: 0, nombre: feo[0] })
  })

  it('el mazo completo solo tiene las directivas que Kirchi escribe', () => {
    const p = validarPeticion({ netlist: nl([{ type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 1 } }, { type: 'R', a: 1, b: 0, ohms: 100 }]), analisis: { tipo: 'tran', paso: 1e-6, fin: 1e-3, uic: true } })
    const m = armarMazo(p)
    const directivas = m.texto.split('\n').filter((l) => l.startsWith('.'))
    expect(directivas).toEqual(['.options reltol=0.0001 abstol=1e-12 vntol=1e-7', '.control', '.endc', '.end'])
    expect(m.texto).toContain('tran 0.000001 0.001 0 0.000001 uic')
    expect(m.texto).toContain('write salida.raw')
  })
})

describe('petición de análisis', () => {
  const base = nl([{ type: 'R', a: 1, b: 0, ohms: 1 }])
  it.each([
    ['sin netlist', { analisis: { tipo: 'op' } }],
    ['sin análisis', { netlist: base }],
    ['un análisis que no existe', { netlist: base, analisis: { tipo: 'shell' } }],
    ['un paso de texto', { netlist: base, analisis: { tipo: 'tran', paso: '1u', fin: 1 } }],
    ['un paso NaN', { netlist: base, analisis: { tipo: 'tran', paso: NaN, fin: 1 } }],
    ['un final infinito', { netlist: base, analisis: { tipo: 'tran', paso: 1, fin: Infinity } }],
    ['un tiempo inicial mayor que el final', { netlist: base, analisis: { tipo: 'tran', paso: 1, fin: 1, inicio: 2 } }],
    ['demasiados puntos', { netlist: base, analisis: { tipo: 'tran', paso: 1e-12, fin: 1 } }],
    ['un barrido de CA que no existe', { netlist: base, analisis: { tipo: 'ac', barrido: 'x\n.include', puntos: 10, desde: 1, hasta: 10 } }],
    ['una CA con el rango al revés', { netlist: base, analisis: { tipo: 'ac', barrido: 'dec', puntos: 10, desde: 100, hasta: 10 } }],
    ['una opción del solucionador de texto', { netlist: base, analisis: { tipo: 'op' }, solver: { reltol: '1\n.include x' } }],
    ['una opción desconocida se ignora, pero una negativa no', { netlist: base, analisis: { tipo: 'op' }, solver: { reltol: -1 } }]
  ])('rechaza %s', (_c, p) => {
    expect(() => validarPeticion(p)).toThrow(ErrorExportacion)
  })

  it('el barrido de CD exige una fuente de voltaje', () => {
    const p = validarPeticion({ netlist: base, analisis: { tipo: 'dc', fuente: 0, desde: 0, hasta: 5, paso: 1 } })
    expect(() => armarMazo(p)).toThrow(/fuente de voltaje/)
  })

  it('la CA excita la primera fuente si no se dice cuál', () => {
    const p = validarPeticion({ netlist: nl([{ type: 'R', a: 1, b: 0, ohms: 1 }, { type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 0 } }]), analisis: { tipo: 'ac', barrido: 'dec', puntos: 10, desde: 1, hasta: 1e6 } })
    const m = armarMazo(p)
    expect(m.texto).toContain('v1 n1 0 dc 0 ac 1')
    expect(m.texto).toContain('ac dec 10 1 1000000')
  })
})
