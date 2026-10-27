import { describe, expect, it } from 'vitest'
import type { ElementoMotor, NetlistMotor } from '../netlistMotor'
import { ErrorExportacion, exportarSpice } from './exportar'

const LINEA_SEGURA = /^[a-z0-9_ .+\-*/()[\]{}=,%:^"<>!#@$?]*$/

function exportar(elements: ElementoMotor[], extra: Partial<NetlistMotor> = {}, opciones = {}) {
  const e = exportarSpice({ nodes: 4, digital_nets: 12, elements, ...extra } as NetlistMotor, opciones)
  for (const l of e.cuerpo.split('\n')) {
    expect(l).toMatch(LINEA_SEGURA)
    if (l.startsWith('.')) expect(l).toMatch(/^\.model /)
  }
  return e
}

const nand: ElementoMotor = { type: 'LUT', comunes: [], rebanadas: [{ entradas: [0, 1], salidas: [2] }], tabla: 0, retardos: [[1e-8, 1.2e-8]], z_como: 'x' }

describe('LUT', () => {
  it('se exporta a una d_genlut con las entradas en orden inverso y el retardo inercial de cada salida', () => {
    const e = exportar([nand], { tablas: [[0, 1, 0, 0]] })
    expect(e.cuerpo).toContain('table_values "0100"')
    expect(e.cuerpo).toMatch(/^au0c0 \[d1 d0\] \[u0n0\] u0m0$/m)
    expect(e.cuerpo).toMatch(/d_buffer\(rise_delay=9\.998e-9 fall_delay=1\.1998e-8 inertial_delay=true\)/)
    expect(e.cuerpo).toMatch(/^au0c1 u0n0 d2 u0m1$/m)
    expect(e.opciones).toContain('xtrtol=7')
    expect([...e.tabla.digitales.keys()].sort()).toEqual(['d0', 'd1', 'd2'])
  })

  it('en 74LS una entrada que nadie maneja lee 1 con un pull-up y en CMOS queda al aire', () => {
    const uno = exportar([{ ...nand, z_como: 'uno' }], { tablas: [[0, 1, 0, 0]] })
    expect(uno.cuerpo).toMatch(/^apu0 d0 /m)
    expect(uno.cuerpo).toMatch(/^apu1 d1 /m)
    const x = exportar([nand], { tablas: [[0, 1, 0, 0]] })
    expect(x.cuerpo).not.toMatch(/^apu/m)
  })

  it('una tabla con Z lleva un d_tristate y una abierta un d_open_c', () => {
    const z = exportar([{ ...nand, comunes: [], rebanadas: [{ entradas: [0, 1], salidas: [2] }] }], { tablas: [[0, 1, 2, 2]] })
    expect(z.cuerpo).toContain('d_tristate(delay=1e-12)')
    const abierta = exportar([{ ...nand, abierta: [true] }], { tablas: [[1, 1, 1, 0]] })
    expect(abierta.cuerpo).toContain('d_open_c(open_delay=1e-12 fall_delay=1e-12)')
  })

  it.each([
    ['una tabla que no existe', { tablas: [[0, 1, 0, 0]] }, { ...nand, tabla: 3 }, /su tabla no existe/],
    ['una tabla de otro tamaño', { tablas: [[0, 1, 0]] }, nand, /4 filas/],
    ['una red digital fuera de rango', { tablas: [[0, 1, 0, 0]] }, { ...nand, comunes: [99] }, /red digital/],
    ['un retardo no positivo', { tablas: [[0, 1, 0, 0]] }, { ...nand, retardos: [[0, 1e-8]] }, /retardo/]
  ])('rechaza %s con el mensaje de la pieza', (_, extra, e, mensaje) => {
    expect(() => exportarSpice({ nodes: 1, digital_nets: 3, elements: [e as ElementoMotor], ...extra } as NetlistMotor, { nombresElementos: ['U7'] })).toThrow(ErrorExportacion)
    expect(() => exportarSpice({ nodes: 1, digital_nets: 3, elements: [e as ElementoMotor], ...extra } as NetlistMotor, { nombresElementos: ['U7'] })).toThrow(new RegExp(`U7.*${mensaje.source}`))
  })
})

const contador: ElementoMotor = {
  type: 'MSI',
  entradas: [0, 1],
  salidas: [2, 3],
  nucleo: { tipo: 'contador', bits: 2, modulo: 4, reloj: { senales: [{ entrada: 0 }] }, borra: { senal: { entrada: 1, bajo: true }, sincrona: false } },
  de: [{ tipo: 'directa', fuente: { bit: 0 } }, { tipo: 'directa', fuente: { bit: 1 } }],
  retardos: [[2e-8, 2e-8], [2e-8, 2e-8]],
  z_como: 'x'
}

describe('MSI', () => {
  it('un contador se exporta como biestables con reloj efectivo, siguiente estado y borrado asíncrono', () => {
    const e = exportar([contador])
    const modelo = /\.model (u0m\d+) d_dff\(/.exec(e.cuerpo)![1]
    expect(e.cuerpo.match(new RegExp(` ${modelo}$`, 'gm'))).toHaveLength(2)
    expect(e.opciones).toContain('xtrtol=7')
    expect(e.avisos).toEqual([])
  })

  it('un convertidor de aproximaciones se exporta con salidas fijas en el código vigente y avisa', () => {
    const adc: ElementoMotor = {
      type: 'MSI',
      entradas: [0, 1, 2, 3],
      salidas: [4, 5],
      nucleo: { tipo: 'aproximaciones', bits: 2, cs: { entrada: 0, bajo: true }, wr: { entrada: 1, bajo: true }, rd: { entrada: 2, bajo: true }, comparador: 3, reloj: { tipo: 'interno', periodo: 1e-6 }, ciclos_inicio: 4, ciclos_bit: 8 },
      de: [{ tipo: 'tabla', columna: 0 }, { tipo: 'tabla', columna: 1 }],
      fuentes: [{ entrada: 0 }, { entrada: 2 }, { bit: 1 }, { bit: 0 }],
      tabla: 0,
      retardos: [[1e-7, 1e-7], [1e-7, 1e-7]],
      z_como: 'x'
    }
    // CS y RD en bajo: DB0 y DB1 siguen al código y fuera de eso quedan en Z.
    const filas = Array.from({ length: 16 }, (_, i) => {
      const [cs, rd, q1, q0] = [(i >> 3) & 1, (i >> 2) & 1, (i >> 1) & 1, i & 1]
      return cs || rd ? 2 + 2 * 4 : q0 + 4 * q1
    })
    const e = exportar([adc], { tablas: [filas] }, { nombresElementos: ['U1'], codigoMsi: new Map([[0, 2]]) })
    expect(e.avisos).toEqual(['El convertidor U1 se exporta con el código del instante actual: ngspice no simula su conversión.'])
    expect(e.cuerpo).not.toContain('d_dff')
    expect(e.cuerpo).toContain('d_tristate')
    // Con el código 2 el bit 1 es una red a 1 y el bit 0 una red a 0.
    expect(e.cuerpo).toContain('d_pullup')
    expect(e.cuerpo).toContain('d_pulldown')
  })
})

describe('DACM', () => {
  const base: Extract<ElementoMotor, { type: 'DACM' }> = { type: 'DACM', modo: 'voltaje', out: 1, ret: 0, ref_p: 2, ref_n: 0, bits: [0, 1], t_asentamiento: 1e-7 }

  it('en voltaje saca k por la referencia con una fuente B y un puente con rampa por bit', () => {
    const e = exportar([base])
    expect(e.cuerpo).toContain('.model da1 dac_bridge(out_low=0 out_high=1 out_undef=0.5 t_rise=1e-7 t_fall=1e-7)')
    expect(e.cuerpo).toContain('a0d0 [d0] [kb0x0] da1')
    expect(e.cuerpo).toContain('a0d1 [d1] [kb0x1] da1')
    expect(e.cuerpo).toContain('bz0 n1 0 v=(v(kb0x0)*0.5+v(kb0x1)*0.25)*(v(n2)-0)')
    expect(e.opciones).toContain('xtrtol=7')
  })

  it('en voltaje con resistencia de salida la pone en serie', () => {
    const e = exportar([{ ...base, r_out: 1000 }])
    expect(e.cuerpo).toContain('bz0 xz0 0 v=')
    expect(e.cuerpo).toContain('rz0 n1 xz0 1000')
  })

  it('en corriente mide la corriente de referencia con una fuente de 0 V y la reparte por la salida', () => {
    const e = exportar([{ ...base, modo: 'corriente', ref_n: 3, r_out: 1e6 }])
    expect(e.cuerpo).toContain('vz0 n2 n3 dc 0')
    expect(e.cuerpo).toContain('bz0 n1 0 i=(v(kb0x0)*0.5+v(kb0x1)*0.25)*i(vz0)')
    expect(e.cuerpo).toContain('rz0 n1 0 1000000')
  })

  it.each([
    ['referencias en el mismo nodo', { ref_n: 2 }],
    ['un modo que no existe', { modo: 'otro' }],
    ['una rampa no positiva', { t_asentamiento: 0 }],
    ['más de 16 bits', { bits: Array.from({ length: 17 }, (_, i) => i % 12) }],
    ['una resistencia de salida negativa', { r_out: -1 }]
  ])('rechaza %s', (_, cambio) => {
    expect(() => exportarSpice({ nodes: 4, digital_nets: 12, elements: [{ ...base, ...cambio } as ElementoMotor] })).toThrow(ErrorExportacion)
  })
})

describe('INTC', () => {
  const intc: ElementoMotor = { type: 'INTC', a: 1, b: 2, canal: 0, r_on: 0.1, r_off: 1e9 }

  it('es una resistencia del estado que el canal tiene en el documento y expone su corriente', () => {
    const cerrado = exportar([intc], { canales: [{ inicial: 1 }] })
    expect(cerrado.cuerpo).toBe('rm0 n1 n2 0.1\n')
    expect(cerrado.corrienteDeElemento.get(0)).toBe('@rm0[i]')
    expect(cerrado.tabla.elementos.get('rm0')).toEqual({ indice: 0 })
    expect(exportar([intc], { canales: [{ inicial: 0 }] }).cuerpo).toBe('rm0 n1 n2 1000000000\n')
  })

  it('rechaza un canal que no existe', () => {
    expect(() => exportarSpice({ nodes: 4, elements: [intc] })).toThrow(/canal/)
  })
})

describe('ADC con histéresis', () => {
  it('compara contra el nodo n y no solo contra la tierra', () => {
    const e = exportar([{ type: 'ADC', p: 1, n: 2, out: 0, in_low: -5e-5, in_high: 5e-5, histeresis: true }])
    expect(e.cuerpo).toMatch(/^s0 xs0 xh0 n1 n2 sw1$/m)
  })
})

describe('el texto del usuario no llega a la síntesis', () => {
  it('una referencia con órdenes de SPICE no pasa al texto', () => {
    const feo = 'U1\n.control\nshell calc\n.endc'
    expect(() => exportarSpice({ nodes: 1, digital_nets: 3, elements: [{ ...nand, tabla: 7 }], tablas: [] } as NetlistMotor, { nombresElementos: [feo] })).toThrow(ErrorExportacion)
    const e = exportar([nand], { tablas: [[0, 1, 0, 0]] }, { nombresElementos: [feo] })
    for (const prohibido of ['control', 'shell', 'calc']) expect(e.cuerpo).not.toContain(prohibido)
  })
})
