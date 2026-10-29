// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { libreriaDePrueba } from '../prueba/libreria'
import type { FormatoAjeno, PiezaAjena } from './ajeno'
import { claseDe, entradasDe, FAMILIAS } from './familias'

const pz = (tipo: string, extra: Partial<PiezaAjena> = {}): PiezaAjena => ({ ref: 'X1', tipo, props: {}, pines: [], ...extra })
const clase = (f: FormatoAjeno, tipo: string, extra: Partial<PiezaAjena> = {}) => claseDe(f, pz(tipo, extra))

describe('familias de piezas ajenas', () => {
  it('cada pieza de la tabla existe en la librería y sus props son de esa pieza', () => {
    const { piezas } = libreriaDePrueba()
    for (const [c, f] of Object.entries(FAMILIAS)) {
      const def = piezas.get(f.pieza)
      expect(def, c).toBeDefined()
      for (const id of Object.keys(f.props ?? {})) expect(def!.props.some((p) => p.id === id), `${c}.${id}`).toBe(true)
      if (f.entradas) expect(def!.props.some((p) => p.id === f.entradas), `${c}.entradas`).toBe(true)
    }
  })

  it('SPICE reconoce la clase por la letra de la referencia y el tipo de su modelo', () => {
    expect(clase('spice', 'R', { ref: 'R1' })).toBe('resistencia')
    expect(clase('spice', 'V', { ref: 'V1' })).toBe('fuente-voltaje')
    expect(clase('spice', 'Q', { ref: 'Q1', props: { tipoModelo: 'pnp' } })).toBe('pnp')
    expect(clase('spice', 'Q', { ref: 'Q1', props: { tipoModelo: 'npn' } })).toBe('npn')
    expect(clase('spice', 'M', { ref: 'M1', props: { tipoModelo: 'pmos' } })).toBe('pmos')
    expect(clase('spice', 'J', { ref: 'J1', props: { tipoModelo: 'njf' } })).toBe('njf')
    expect(clase('spice', 'Q', { ref: 'Q1' })).toBeNull()
  })

  it('LTspice reconoce la clase por el nombre del símbolo', () => {
    expect(clase('ltspice', 'res')).toBe('resistencia')
    expect(clase('ltspice', 'polcap')).toBe('capacitor-electrolitico')
    expect(clase('ltspice', 'Opamps\\UniversalOpamp2')).toBe('amp-op')
    expect(clase('ltspice', 'OpAmps/opamp')).toBe('amp-op')
    expect(clase('ltspice', 'LED')).toBe('led')
    expect(clase('ltspice', 'pnp')).toBe('pnp')
  })

  it('Falstad distingue el transistor PNP por su bandera y no confunde r con R', () => {
    expect(clase('falstad', 't', { props: { pnp: '-1' } })).toBe('pnp')
    expect(clase('falstad', 't', { props: { pnp: '1' } })).toBe('npn')
    expect(clase('falstad', 'r')).toBe('resistencia')
    expect(clase('falstad', 'R')).toBeNull()
    expect(clase('falstad', '162')).toBe('led')
    expect(clase('falstad', '174')).toBe('potenciometro')
  })

  it('KiCad reconoce la clase por el lib_id', () => {
    expect(clase('kicad', 'Device:R')).toBe('resistencia')
    expect(clase('kicad', 'Device:C_Polarized')).toBe('capacitor-electrolitico')
    expect(clase('kicad', 'Device:Q_PNP_BCE')).toBe('pnp')
    expect(clase('kicad', 'Device:Q_NMOS_GDS')).toBe('nmos')
    expect(clase('kicad', 'Amplifier_Operational:LM358')).toBe('amp-op')
    expect(clase('kicad', 'Regulator_Linear:L7805')).toBe('regulador-positivo')
    expect(clase('kicad', 'Simulation_SPICE:VDC')).toBe('fuente-voltaje')
    expect(clase('kicad', 'Device:Foo')).toBeNull()
  })

  it('Proteus reconoce la clase por el nombre del dispositivo', () => {
    expect(clase('proteus', 'RES')).toBe('resistencia')
    expect(clase('proteus', 'CAP-ELEC')).toBe('capacitor-electrolitico')
    expect(clase('proteus', 'LED-RED')).toBe('led')
    expect(clase('proteus', 'NMOSFET')).toBe('nmos')
    expect(clase('proteus', 'POT-HG')).toBe('potenciometro')
    expect(clase('proteus', 'SW-SPST')).toBe('interruptor')
    expect(clase('proteus', 'LM13700')).toBeNull()
  })

  it('Falstad reconoce compuertas, inversor, entradas y salidas lógicas', () => {
    expect(['150', '151', '152', '153', '154', 'I', 'L', 'M'].map((t) => clase('falstad', t))).toEqual([
      'compuerta-and', 'nand', 'or', 'nor', 'xor', 'not', 'entrada-logica', 'salida-logica'
    ])
    expect(entradasDe('falstad', pz('150', { props: { entradas: '3' } }))).toBe(3)
  })

  it('LTspice reconoce las compuertas de Digital y el NE555 de Misc', () => {
    expect(['Digital\\and', 'Digital/nand', 'Digital\\or', 'Digital\\nor', 'Digital\\xor', 'Digital\\xnor', 'Digital\\inv'].map((t) => clase('ltspice', t))).toEqual([
      'compuerta-and', 'nand', 'or', 'nor', 'xor', 'xnor', 'not'
    ])
    expect(clase('ltspice', 'Misc\\NE555')).toBe('temporizador-555')
    expect(clase('ltspice', 'NE555')).toBe('temporizador-555')
    expect(clase('ltspice', 'and')).toBeNull()
  })

  it('KiCad reconoce compuertas 74xx por su número y el 555 de Timer', () => {
    expect(['74xx:74HC00', '74xx:74LS08', '74xx:7432', '74xx:74HC86', '74xx:74HC02', '74xx:74HC04', '74xx:74HC266', '74xx:74HC4002'].map((t) => clase('kicad', t))).toEqual([
      'nand', 'compuerta-and', 'or', 'xor', 'nor', 'not', 'xnor', 'nor'
    ])
    expect(clase('kicad', '74xx:74HC595')).toBeNull()
    expect(clase('kicad', 'Timer:NE555P')).toBe('temporizador-555')
    expect(clase('kicad', 'Timer:LM556')).toBeNull()
    expect(entradasDe('kicad', pz('74xx:74HC10'))).toBe(3)
    expect(entradasDe('kicad', pz('74xx:74HC30'))).toBe(8)
  })

  it('Proteus reconoce compuertas, 74xx y el 555', () => {
    expect(['7400', '74HC00', 'AND', 'NAND', 'OR', 'NOR', 'XOR', 'XNOR', 'NOT', 'NE555', '555'].map((t) => clase('proteus', t))).toEqual([
      'nand', 'nand', 'compuerta-and', 'nand', 'or', 'nor', 'xor', 'xnor', 'not', 'temporizador-555', 'temporizador-555'
    ])
    expect(entradasDe('proteus', pz('AND-3'))).toBe(3)
    expect(entradasDe('proteus', pz('AND'))).toBeNull()
  })
})

describe('familias nuevas de Proteus, LTspice y KiCad', () => {
  it('Proteus reconoce pull-up y pull-down, el estado lógico, el LED bicolor, la bocina y el motor a pasos', () => {
    expect(['PULLDOWN', 'PULLUP', 'LOGICTOGGLE', 'LED-BIBY', 'LED-BIRG', 'LED-RED', 'SPEAKER', 'MOTOR-STEPPER'].map((t) => clase('proteus', t))).toEqual([
      'resistencia-pull', 'resistencia-pull', 'entrada-logica', 'led-bicolor', 'led-bicolor', 'led', 'zumbador', 'motor-pasos'
    ])
  })

  it('Proteus reconoce el búfer 244, los registros y los decodificadores de 7 segmentos por su número', () => {
    expect(['74LS244', '74244', '74HC244', '74LS164', '74HC595', 'SN74HC595N', '74595', '74LS165', '4511', '74LS248'].map((t) => clase('proteus', t))).toEqual([
      'bufer-244', 'bufer-244', 'bufer-244', 'registro-164', 'registro-595', 'registro-595', 'registro-595', 'registro-165', 'decodificador-4511', 'decodificador-248'
    ])
    expect(clase('proteus', 'SHIFTREG_4')).toBeNull()
    expect(clase('proteus', 'BUFFER_8')).toBeNull()
  })

  it('LTspice reconoce como amplificador los operacionales fuera de su carpeta OpAmps', () => {
    expect(['OpAmps/AD820', 'OpAmps\LT1211', 'AD712', 'LM308'].map((t) => clase('ltspice', t))).toEqual(['amp-op', 'amp-op', 'amp-op', 'amp-op'])
  })

  it('KiCad clasifica un símbolo de librería de proyecto por el nombre tras los dos puntos', () => {
    const tipos = ['pic_programmer:R', 'video_schlib:C', 'ecc83-pp:R', 'complex_hierarchy:CP', 'complex_hierarchy:D_Small', 'pic_programmer:D_Schottky', 'pic_programmer:LED', 'multichannel_mixer:POT',
      'multichannel_mixer:R1206_10K_1%_0.25W_100PPM', 'multichannel_mixer:CC1206_100NF_50V_10%_X7R', 'easyeda2kicad:RC0603FR-070RL', 'sallen_key_schlib:VDC']
    expect(tipos.map((t) => clase('kicad', t))).toEqual([
      'resistencia', 'capacitor', 'resistencia', 'capacitor-electrolitico', 'diodo', 'schottky', 'led', 'potenciometro', 'resistencia', 'capacitor', 'resistencia', 'fuente-voltaje'
    ])
    expect(clase('kicad', 'complex_hierarchy:MPSA92')).toBeNull()
    expect(clase('kicad', 'Device:Foo')).toBeNull()
  })
})
