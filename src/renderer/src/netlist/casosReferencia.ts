import type { Parte } from '../prueba/circuitos'

// Los circuitos de `engine/referencias/` armados con las piezas de la librería (sus pieza.json): los usan las pruebas del motor
// contra los CSV de ngspice (`referencias.test.ts`) y las del exportador a SPICE (`ngspiceReferencias.test.ts`).

const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const C = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'capacitor', ref, props: { valor }, pines: { '1': a, '2': b } })
const DC = (ref: string, voltaje: string, mas: string, menos = '0'): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje }, pines: { '+': mas, '-': menos } })
const AC = (ref: string, amplitud: string, frecuencia: string, mas: string, menos = '0'): Parte => ({ tipo: 'fuente-ac', ref, props: { amplitud, frecuencia }, pines: { '+': mas, '-': menos } })
const PULSO = (ref: string, alto: string, frecuencia: string, mas: string): Parte => ({ tipo: 'fuente-pulso', ref, props: { alto, frecuencia, ciclo: '50 %' }, pines: { '+': mas, '-': '0' } })
const Q = (tipo: 'npn' | 'pnp', modelo: string, c: string, b: string, e: string): Parte => ({ tipo, ref: 'Q1', props: { modelo }, pines: { C: c, B: b, E: e } })
const M = (tipo: 'mosfet-n' | 'mosfet-p', modelo: string, d: string, g: string, s: string): Parte => ({ tipo, ref: 'Q1', props: { modelo }, pines: { D: d, G: g, S: s } })
/** El 555 con VCC y RESET en «vcc» y GND en la tierra. */
const TIMER = (modelo: string, trig: string, out: string, cv: string, thr: string, dis: string): Parte => ({ tipo: 'temporizador-555', ref: 'X1', props: { modelo }, pines: { '1': '0', '2': trig, '3': out, '4': 'vcc', '5': cv, '6': thr, '7': dis, '8': 'vcc' } })
/** El comparador con V− en la tierra: entrada no inversora, inversora, salida y V+. */
const CMP = (modelo: string, mas: string, menos: string, sal: string, vmas: string): Parte => ({ tipo: 'comparador', ref: 'U1', props: { modelo }, pines: { '+': mas, '-': menos, OUT: sal, 'V+': vmas, 'V-': '0' } })
const AO = (modelo: string, mas: string, menos: string, sal: string, vmas: string, vmenos: string): Parte => ({ tipo: 'amp-op', ref: 'U1', props: { modelo }, pines: { '+': mas, '-': menos, OUT: sal, 'V+': vmas, 'V-': vmenos } })

/** Un regulador de tres pines (entrada, salida y el tercero: tierra o ajuste). */
const REG = (tipo: string, modelo: string, entrada: string, salida: string, tercero: string): Parte => ({ tipo, ref: 'U1', props: { modelo }, pines: { IN: entrada, OUT: salida, GND: tercero } })

const SCR = (anodo: string, catodo: string, compuerta: string): Parte => ({ tipo: 'scr', ref: 'Q1', props: { modelo: '2N5060' }, pines: { A: anodo, K: catodo, G: compuerta } })
/** El ULN2003A con E en tierra; los canales y pines que no se nombran quedan en una red propia (al aire). */
const ULN = (pines: Record<string, string>): Parte => ({ tipo: 'uln2003', ref: 'U1', props: { modelo: 'ULN2003A' }, pines: { E: '0', ...Object.fromEntries(['1B', '2B', '3B', '4B', '5B', '6B', '7B', '1C', '2C', '3C', '4C', '5C', '6C', '7C', 'COM'].map((p) => [p, `aire_${p}`])), ...pines } })
/** Pulso de compuerta que empieza a 1 ms (con la fuente ya asentada) y dura 5 ms, cada 10 ms. */
const PULSO_G = (ref: string, alto: string, mas: string): Parte => ({ tipo: 'fuente-pulso', ref, props: { alto, frecuencia: '100', ciclo: '50 %', retardo: '1m' }, pines: { '+': mas, '-': '0' } })
const TRIAC = (mt2: string, compuerta: string): Parte => ({ tipo: 'triac', ref: 'Q1', props: { modelo: 'BT136' }, pines: { MT2: mt2, MT1: '0', G: compuerta } })
const DIAC = (modelo: string, a1: string, a2: string): Parte => ({ tipo: 'diac', ref: 'D1', props: { modelo }, pines: { A1: a1, A2: a2 } })

export interface Caso {
  partes: Parte[]
  fin: number
  hmax: number
  tolT?: number
  /** Cómo leer cada columna del CSV: `v(n)` es la red «n» (si existe); las demás, la corriente de la pieza con esa referencia. */
  corrientes?: Record<string, string>
  /** Con lógica cada isla analógica avanza con su propio paso y `time()` es el de la más atrasada: se lee en los instantes
   * del CSV, donde todas llegaron. */
  enLosInstantesDelCsv?: true
  /** Las tolerancias por omisión del motor (las de la vista previa) en lugar de las de ngspice con reltol 1e-4: para las piezas con un lazo lento y un amplificador de ganancia alta, que con las ajustadas no convergen. */
  holgada?: true
}

const npn = (modelo: string): Caso => ({ partes: [DC('V1', '12', '1'), R('R1', '47k', '1', '2'), R('R2', '10k', '2', '0'), R('R3', '2.2k', '1', '3'), R('R4', '470', '4', '0'), Q('npn', modelo, '3', '2', '4')], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } })
const pnp = (modelo: string): Caso => ({ partes: [DC('V1', '12', '1'), R('R1', '10k', '1', '2'), R('R2', '47k', '2', '0'), R('R3', '470', '1', '4'), R('R4', '2.2k', '3', '0'), Q('pnp', modelo, '3', '2', '4')], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } })
const mos = (tipo: 'mosfet-n' | 'mosfet-p', modelo: string, r1: string, r2: string, rd: string): Caso => ({
  partes: [DC('V1', '12', '1'), R('R1', r1, '1', '2'), R('R2', r2, '2', '0'), tipo === 'mosfet-n' ? R('R3', rd, '1', '3') : R('R3', rd, '3', '0'), tipo === 'mosfet-n' ? M(tipo, modelo, '3', '2', '0') : M(tipo, modelo, '3', '2', '1')],
  fin: 20e-3,
  hmax: 1e-5,
  corrientes: { 'i(v1)': 'V1' }
})

export const CASOS: Record<string, Caso> = {
  npn_2n2222: npn('2N2222'),
  npn_2n3904: npn('2N3904'),
  npn_bc547: npn('BC547'),
  pnp_2n2907: pnp('2N2907'),
  pnp_2n3906: pnp('2N3906'),
  pnp_bc557: pnp('BC557'),
  nmos_2n7000: mos('mosfet-n', '2N7000', '100k', '33k', '100'),
  nmos_irfz44n: mos('mosfet-n', 'IRFZ44N', '100k', '38k', '10'),
  pmos_bs250: mos('mosfet-p', 'BS250', '33k', '68k', '220'),
  pmos_irf9540: mos('mosfet-p', 'IRF9540', '27k', '68k', '22'),
  zener_regulador: { partes: [DC('V1', '12', '1'), R('R1', '470', '1', '2'), { tipo: 'zener', ref: 'D1', props: { voltaje: '5.1' }, pines: { A: '0', K: '2' } }, R('R2', '1k', '2', '0')], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  led_rojo: { partes: [DC('V1', '9', '1'), R('R1', '1k', '1', '2'), { tipo: 'led', ref: 'D1', props: { color: 'rojo' }, pines: { A: '2', K: '0' } }], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  rectificador: { partes: [PULSO('V1', '5', '50', '1'), R('R1', '100', '1', '2'), { tipo: 'diodo', ref: 'D1', pines: { A: '2', K: '3' } }, C('C1', '100u', '3', '0'), R('R2', '1k', '3', '0')], fin: 0.1, hmax: 5e-6, tolT: 2e-6, corrientes: { 'i(v1)': 'V1' } },
  ec_amplificador: {
    partes: [DC('V1', '12', '1'), AC('V2', '20m', '1k', '5'), C('C1', '1u', '5', '2'), R('R1', '47k', '1', '2'), R('R2', '10k', '2', '0'), R('R3', '2.2k', '1', '3'), R('R4', '470', '4', '0'), C('C2', '10u', '4', '0'), C('C3', '1u', '3', '6'), R('R5', '10k', '6', '0'), Q('npn', '2N2222', '3', '2', '4')],
    fin: 0.02,
    hmax: 2e-6,
    tolT: 2e-6
  },
  par_diferencial: {
    partes: [DC('V1', '12', '1'), DC('V2', '-12', '7'), AC('V3', '10m', '1k', '2'), R('R1', '10k', '1', '3'), R('R2', '10k', '1', '4'), { ...Q('npn', '2N3904', '3', '2', '5'), ref: 'Q1' }, { ...Q('npn', '2N3904', '4', '0', '5'), ref: 'Q2' }, R('R3', '11k', '5', '7')],
    fin: 3e-3,
    hmax: 1e-6,
    tolT: 1e-6
  },
  opamp_inversor: { partes: [DC('V1', '15', '1'), DC('V2', '-15', '2'), AC('V3', '1.5', '500', '3'), R('R1', '1k', '3', '4'), R('R2', '10k', '4', '5'), R('R3', '10k', '5', '0'), AO('LM741', '0', '4', '5', '1', '2')], fin: 4e-3, hmax: 1e-6, tolT: 1e-6, corrientes: { 'i(v1)': 'V1' } },
  opamp_seguidor: { partes: [DC('V1', '15', '1'), DC('V2', '-15', '2'), PULSO('V3', '5', '50k', '3'), R('R1', '10k', '4', '0'), AO('TL081', '3', '4', '4', '1', '2')], fin: 60e-6, hmax: 5e-9, tolT: 5e-9, corrientes: { 'i(v1)': 'V1' } },
  opamp_comparador: { partes: [DC('V1', '5', '1'), DC('V2', '2.5', 'm'), AC('V3', '1', '1k', '3', 'm'), DC('V4', '2.5', '4'), R('R1', '10k', '5', '0'), AO('LM358', '3', '4', '5', '1', '0')], fin: 3e-3, hmax: 0.2e-6 },
  mosfet_conmutacion: { partes: [DC('V1', '12', '1'), PULSO('V2', '5', '10k', '4'), R('R1', '1k', '4', '2'), R('R2', '100', '1', '3'), M('mosfet-n', '2N7000', '3', '2', '0')], fin: 300e-6, hmax: 20e-9, tolT: 20e-9, corrientes: { 'i(v1)': 'V1' } },
  zener_recortador: { partes: [AC('V1', '10', '50', '1'), R('R1', '1k', '1', '2'), { tipo: 'zener', ref: 'D1', props: { voltaje: '5.1' }, pines: { A: '0', K: '2' } }], fin: 0.04, hmax: 5e-6, tolT: 2e-6, corrientes: { 'i(v1)': 'V1' } },
  foco_encendido: { partes: [DC('V1', '12', '1'), { tipo: 'foco', ref: 'LP1', props: { voltaje: '12', potencia: '5' }, pines: { '1': '1', '2': '0' } }], fin: 0.3, hmax: 2e-5, tolT: 2e-5, corrientes: { 'i(v1)': 'V1' } },
  motor_arranque: { partes: [DC('V1', '6', '1'), { tipo: 'motor-dc', ref: 'M1', props: { voltaje: '6' }, pines: { '+': '1', '-': '0' } }], fin: 0.15, hmax: 1e-5, tolT: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  fusible_fundido: { partes: [DC('V1', '5', '1'), { tipo: 'fusible', ref: 'F1', props: { corriente: '1' }, pines: { '1': '1', '2': '2' } }, R('R1', '1', '2', '0')], fin: 0.06, hmax: 5e-6, tolT: 10e-6, corrientes: { 'i(v1)': 'V1' } },
  rele_proteccion: {
    partes: [
      DC('V1', '5', '1'),
      PULSO('V2', '5', '25', '4'),
      R('R1', '4.7k', '4', '2'),
      Q('npn', '2N2222', '3', '2', '0'),
      { tipo: 'rele', ref: 'K1', props: { voltaje: '5' }, pines: { A1: '1', A2: '3', COM: '1', NA: '5', NC: '6' } },
      { tipo: 'diodo', ref: 'D1', pines: { A: '3', K: '1' } },
      R('R2', '100', '5', '0'),
      R('R3', '100', '6', '0')
    ],
    fin: 0.1,
    hmax: 5e-6,
    tolT: 2e-6,
    corrientes: { 'i(vs)': 'K1' }
  },
  // Bloque 2 de la serie: los modelos discretos con sus parámetros de la hoja de datos.
  diodo_1n4148: { partes: [DC('V1', '5', '1'), R('R1', '430', '1', '2'), { tipo: 'diodo', ref: 'D1', props: { modelo: '1N4148' }, pines: { A: '2', K: '0' } }], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  diodo_1n4007: { partes: [DC('V1', '5', '1'), R('R1', '4.1', '1', '2'), { tipo: 'diodo', ref: 'D1', props: { modelo: '1N4007' }, pines: { A: '2', K: '0' } }], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  diodo_1n5819: { partes: [DC('V1', '5', '1'), R('R1', '4.3', '1', '2'), { tipo: 'diodo', ref: 'D1', props: { modelo: '1N5819' }, pines: { A: '2', K: '0' } }], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  diodo_1n4007_senoidal: { partes: [AC('V1', '10', '1k', '1'), { tipo: 'diodo', ref: 'D1', props: { modelo: '1N4007' }, pines: { A: '1', K: '2' } }, R('R1', '1k', '2', '0')], fin: 3e-3, hmax: 5e-7, tolT: 2e-6, corrientes: { 'i(v1)': 'V1' } },
  zener_1n4747a: { partes: [DC('V1', '30', '1'), R('R1', '470', '1', '2'), { tipo: 'zener', ref: 'D1', props: { familia: '1N47xxA', voltaje: '20' }, pines: { A: '0', K: '2' } }, R('RL', '2.2k', '2', '0')], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  zener_1n4761a: { partes: [DC('V1', '100', '1'), R('R1', '2.2k', '1', '2'), { tipo: 'zener', ref: 'D1', props: { familia: '1N47xxA', voltaje: '75' }, pines: { A: '0', K: '2' } }, R('RL', '10k', '2', '0')], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  zener_bzx55c6v2: { partes: [DC('V1', '12', '1'), R('R1', '470', '1', '2'), { tipo: 'zener', ref: 'D1', props: { familia: 'BZX55C', voltaje: '6.2' }, pines: { A: '0', K: '2' } }, R('RL', '1k', '2', '0')], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  bjt_tip31: { partes: [DC('V1', '12', '1'), R('RB', '680', '1', '2'), R('RC', '10', '1', '3'), Q('npn', 'TIP31', '3', '2', '0')], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  bjt_tip32: { partes: [DC('V1', '12', '1'), R('RB', '680', '2', '0'), R('RC', '10', '3', '0'), Q('pnp', 'TIP32', '3', '2', '1')], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  bjt_tip120: { partes: [DC('V1', '12', '1'), R('RB', '27k', '1', '2'), R('RC', '10', '1', '3'), Q('npn', 'TIP120', '3', '2', '0')], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  bjt_tip125: { partes: [DC('V1', '12', '1'), R('RB', '27k', '2', '0'), R('RC', '10', '3', '0'), Q('pnp', 'TIP125', '3', '2', '1')], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  bjt_bd139: { partes: [DC('V1', '12', '1'), R('RB', '5.6k', '1', '2'), R('RC', '47', '1', '3'), Q('npn', 'BD139', '3', '2', '0')], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  bjt_bd140: { partes: [DC('V1', '12', '1'), R('RB', '5.6k', '2', '0'), R('RC', '47', '3', '0'), Q('pnp', 'BD140', '3', '2', '1')], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  nmos_irf540n: mos('mosfet-n', 'IRF540N', '100k', '38k', '4.7'),
  nmos_irlz44n: mos('mosfet-n', 'IRLZ44N', '100k', '17k', '4.7'),
  nmos_irf520: mos('mosfet-n', 'IRF520', '100k', '50k', '10'),
  pmos_irf4905: mos('mosfet-p', 'IRF4905', '27k', '72k', '4.7'),
  ao_lm324_ac: { partes: [DC('V1', '15', '1'), DC('V2', '-15', '2'), AC('V3', '0.03', '120000', '3'), R('R1', '1k', '3', '4'), R('R2', '10k', '4', '5'), R('R3', '10k', '5', '0'), AO('LM324', '0', '4', '5', '1', '2')], fin: 2.5e-05, hmax: 1.042e-08, tolT: 1.042e-08 },
  ao_lm324_pulso: { partes: [DC('V1', '15', '1'), DC('V2', '-15', '2'), PULSO('V3', '5', '20000', '3'), R('R1', '10k', '4', '0'), AO('LM324', '3', '4', '4', '1', '2')], fin: 0.0001, hmax: 1e-08, tolT: 1e-08 },
  ao_op07_ac: { partes: [DC('V1', '15', '1'), DC('V2', '-15', '2'), AC('V3', '0.05', '60000', '3'), R('R1', '1k', '3', '4'), R('R2', '10k', '4', '5'), R('R3', '10k', '5', '0'), AO('OP07', '0', '4', '5', '1', '2')], fin: 5e-05, hmax: 2.083e-08, tolT: 2.083e-08 },
  ao_op07_pulso: { partes: [DC('V1', '15', '1'), DC('V2', '-15', '2'), PULSO('V3', '5', '10000', '3'), R('R1', '10k', '4', '0'), AO('OP07', '3', '4', '4', '1', '2')], fin: 0.0002, hmax: 2e-08, tolT: 2e-08 },
  ao_ne5532_ac: { partes: [DC('V1', '15', '1'), DC('V2', '-15', '2'), AC('V3', '0.05', '1.2M', '3'), R('R1', '1k', '3', '4'), R('R2', '10k', '4', '5'), R('R3', '10k', '5', '0'), AO('NE5532', '0', '4', '5', '1', '2')], fin: 2.5e-06, hmax: 1.042e-09, tolT: 1.042e-09 },
  ao_ne5532_pulso: { partes: [DC('V1', '15', '1'), DC('V2', '-15', '2'), PULSO('V3', '5', '100000', '3'), R('R1', '10k', '4', '0'), AO('NE5532', '3', '4', '4', '1', '2')], fin: 2e-05, hmax: 2e-09, tolT: 2e-09 },
  ao_tlv9002_ac: { partes: [DC('V1', '2.5', '1'), DC('V2', '-2.5', '2'), AC('V3', '0.03', '100000', '3'), R('R1', '1k', '3', '4'), R('R2', '10k', '4', '5'), R('R3', '10k', '5', '0'), AO('TLV9002', '0', '4', '5', '1', '2')], fin: 3e-05, hmax: 1.25e-08, tolT: 1.25e-08 },
  ao_tlv9002_pulso: { partes: [DC('V1', '2.5', '1'), DC('V2', '-2.5', '2'), PULSO('V3', '2', '100000', '3'), R('R1', '10k', '4', '0'), AO('TLV9002', '3', '4', '4', '1', '2')], fin: 2e-05, hmax: 2e-09, tolT: 2e-09 },
  comp_lm393_seno: { partes: [DC('V1', '5', '1'), AC('V3', '10m', '10k', '4'), DC('V8', '5', '8'), R('RL', '5.1k', '8', '5'), CMP('LM393', '4', '0', '5', '1')], fin: 150e-6, hmax: 5e-8, tolT: 5e-8 },
  comp_lm393_pulso: { partes: [DC('V1', '5', '1'), DC('V4', '2.5', '4'), PULSO('V3', '5', '50k', '3'), DC('V8', '5', '8'), R('RL', '5.1k', '8', '5'), CMP('LM393', '4', '3', '5', '1')], fin: 40e-6, hmax: 1e-8, tolT: 2e-8 },
  comp_lm311_pulso: { partes: [DC('V1', '15', '1'), DC('V4', '2.5', '4'), PULSO('V3', '5', '500k', '3'), DC('V8', '5', '8'), R('RL', '500', '8', '5'), C('CL', '5p', '5', '0'), CMP('LM311', '4', '3', '5', '1')], fin: 3e-6, hmax: 5e-10, tolT: 2e-9 },
  // Puente de cuatro diodos con la fuente de 12 V flotante: la matriz tiene 2e4 S del capacitor frente a 1e-12 S de los diodos en inversa.
  puente_1000u: {
    partes: [AC('V1', '12', '50', '1', '2'), { tipo: 'diodo', ref: 'D1', pines: { A: '1', K: '3' } }, { tipo: 'diodo', ref: 'D2', pines: { A: '2', K: '3' } }, { tipo: 'diodo', ref: 'D3', pines: { A: '0', K: '1' } }, { tipo: 'diodo', ref: 'D4', pines: { A: '0', K: '2' } }, C('C1', '1000u', '3', '0'), R('R1', '1k', '3', '0')],
    fin: 0.1,
    hmax: 2e-6,
    corrientes: { 'i(v1)': 'V1' }
  },
  puente_100u: {
    partes: [AC('V1', '12', '50', '1', '2'), { tipo: 'diodo', ref: 'D1', pines: { A: '1', K: '3' } }, { tipo: 'diodo', ref: 'D2', pines: { A: '2', K: '3' } }, { tipo: 'diodo', ref: 'D3', pines: { A: '0', K: '1' } }, { tipo: 'diodo', ref: 'D4', pines: { A: '0', K: '2' } }, C('C1', '100u', '3', '0'), R('R1', '1k', '3', '0')],
    fin: 0.1,
    hmax: 2e-6,
    corrientes: { 'i(v1)': 'V1' }
  },
  // Bloque 3: la pieza puente rectificador con sus cuatro 1N4007 contra los cuatro diodos de la referencia.
  puente_pieza_1n4007: {
    partes: [AC('V1', '12', '50', '1', '2'), { tipo: 'puente-rectificador', ref: 'BR1', props: { modelo: '1N4007' }, pines: { AC1: '1', AC2: '2', '+': '3', '-': '0' } }, C('C1', '100u', '3', '0'), R('R1', '1k', '3', '0')],
    fin: 0.1,
    hmax: 2e-6,
    corrientes: { 'i(v1)': 'V1' }
  },
  // Bloque 3: el SCR (pulso de compuerta de 5 ms con 10 k) que se queda encendido o se apaga, y el diac que se dispara y cae a su voltaje de conducción.
  scr_mantiene: { partes: [DC('VS', '7', 'vs'), R('RL', '100', 'vs', 'a'), SCR('a', '0', 'g'), PULSO('VP', '5', '100', 'p'), R('RD', '10k', 'p', 'g')], fin: 14e-3, hmax: 5e-6, tolT: 8e-6, corrientes: { 'i(vs)': 'VS' } },
  scr_se_apaga: { partes: [DC('VS', '7', 'vs'), R('RL', '5k', 'vs', 'a'), SCR('a', '0', 'g'), PULSO('VP', '5', '100', 'p'), R('RD', '10k', 'p', 'g')], fin: 14e-3, hmax: 5e-6, tolT: 8e-6, corrientes: { 'i(vs)': 'VS' } },
  // El triac (cada cuadrante con su pulso de compuerta de 5 mA, y el apagado por mantenimiento) y el transformador de la pieza.
  triac_q1_mantiene: { partes: [DC('VS', '12', 'vs'), R('RL', '100', 'vs', 'a'), TRIAC('a', 'g'), PULSO_G('VP', '30', 'p'), R('RD', '5.8k', 'p', 'g')], fin: 14e-3, hmax: 5e-6, tolT: 8e-6, corrientes: { 'i(vs)': 'VS' } },
  triac_q2_mantiene: { partes: [DC('VS', '12', 'vs'), R('RL', '100', 'vs', 'a'), TRIAC('a', 'g'), PULSO_G('VP', '-30', 'p'), R('RD', '5.8k', 'p', 'g')], fin: 14e-3, hmax: 5e-6, tolT: 8e-6, corrientes: { 'i(vs)': 'VS' } },
  triac_q3_mantiene: { partes: [DC('VS', '-12', 'vs'), R('RL', '100', 'vs', 'a'), TRIAC('a', 'g'), PULSO_G('VP', '-30', 'p'), R('RD', '5.8k', 'p', 'g')], fin: 14e-3, hmax: 5e-6, tolT: 8e-6, corrientes: { 'i(vs)': 'VS' } },
  triac_se_apaga: { partes: [DC('VS', '12', 'vs'), R('RL', '6k', 'vs', 'a'), TRIAC('a', 'g'), PULSO_G('VP', '30', 'p'), R('RD', '5.8k', 'p', 'g')], fin: 14e-3, hmax: 5e-6, tolT: 8e-6, corrientes: { 'i(vs)': 'VS' } },
  xfmr_pieza_4a1: {
    partes: [AC('V1', '10', '60', '1'), R('R1', '10', '1', '2'), { tipo: 'transformador', ref: 'T1', props: { relacion: '4:1', l1: '1', k: '0.98', dcr1: '0.5', dcr2: '0.2' }, pines: { P1: '2', P2: '0', S1: '4', S2: '0' } }, R('R2', '100', '4', '0')],
    fin: 0.05,
    hmax: 2e-5,
    corrientes: { 'i(v1)': 'V1' }
  },
  diac_db3_38v: { partes: [PULSO('VS', '38', '100', 'vs'), R('RL', '1k', 'vs', 'a'), DIAC('DB3', 'a', '0')], fin: 12e-3, hmax: 5e-6, tolT: 8e-6, corrientes: { 'i(vs)': 'VS' } },
  diac_db4_45v: { partes: [PULSO('VS', '45', '100', 'vs'), R('RL', '1k', 'vs', 'a'), DIAC('DB4', 'a', '0')], fin: 12e-3, hmax: 5e-6, tolT: 8e-6, corrientes: { 'i(vs)': 'VS' } },
  // Bloque 3: un canal del ULN2003A con un relevador (10 mH y 47 ohm a 12 V) y su diodo de bloqueo al común.
  uln_rele: {
    partes: [DC('VCC', '12', 'vcc'), PULSO('VIN', '5', '1000', 'b'), { tipo: 'inductor', ref: 'L1', props: { valor: '10m' }, pines: { '1': 'vcc', '2': 'x' } }, R('RL', '47', 'x', '1c'), ULN({ '1B': 'b', '1C': '1c', COM: 'vcc' })],
    fin: 3e-3,
    hmax: 2e-6,
    tolT: 6e-6,
    corrientes: { 'i(vcc)': 'VCC' }
  },
  // Bloque 3: el cristal de 8 MHz excitado por un escalón: la rama motional suena a su frecuencia de resonancia serie. Con hmax de 1 ns la corriente queda en 0.64 de la tolerancia (con 2 ns daba 0.997, con 0.5 ns 0.87 y con 0.25 ns 1.24: el error de la referencia misma, con reltol 1e-4 sobre un pico de 8 MHz, domina y no baja con el paso).
  cristal_8mhz_escalon: { partes: [DC('V1', '1', 's'), R('R1', '50', 's', 'a'), { tipo: 'cristal', ref: 'Y1', props: { modelo: '8 MHz' }, pines: { '1': 'a', '2': '0' } }], fin: 2e-6, hmax: 1e-9, tolT: 4e-9, corrientes: { 'i(v1)': 'V1' } },
  // Bloque 3: la fuente trifásica de 180 V de pico a 60 Hz contra tres fuentes senoidales con fase de ngspice.
  trifasica_60hz: { partes: [{ tipo: 'fuente-trifasica', ref: 'VT1', props: { amplitud: '180', frecuencia: '60' }, pines: { A: 'a', B: 'b', C: 'c', N: '0' } }, R('RA', '1k', 'a', '0'), R('RB', '1k', 'b', '0'), R('RC', '1k', 'c', '0')], fin: 34e-3, hmax: 1e-5, tolT: 2e-6 },
  // Dos diodos en inversa en serie frente a un escalón de 10 V, con un filtro RC de 47 uF.
  diodos_serie_rc: {
    partes: [DC('V1', '10', '1'), { tipo: 'diodo', ref: 'D1', pines: { A: '2', K: '1' } }, { tipo: 'diodo', ref: 'D2', pines: { A: '3', K: '2' } }, R('R1', '100', '3', '4'), C('C1', '47u', '4', '0'), R('R2', '10k', '4', '0')],
    fin: 0.02,
    hmax: 2e-5,
    corrientes: { 'i(v1)': 'V1' }
  },
  // Bloque 3 de la serie: los reguladores armados con un amplificador, una referencia, un lazo proporcional-integral y un
  // transistor de paso. Arranque con 10 uF y una carga de unos 0.5 A.
  reg_7805_arranque: { partes: [DC('V1', '10', 'in'), R('RL', '10', 'out', '0'), C('C1', '10u', 'out', '0'), REG('regulador-positivo', '7805', 'in', 'out', '0')], fin: 12e-3, hmax: 5e-6, tolT: 5e-6, corrientes: { 'i(v1)': 'V1' } },
  reg_7812_arranque: { partes: [DC('V1', '19', 'in'), R('RL', '24', 'out', '0'), C('C1', '10u', 'out', '0'), REG('regulador-positivo', '7812', 'in', 'out', '0')], fin: 12e-3, hmax: 5e-6, tolT: 5e-6, corrientes: { 'i(v1)': 'V1' } },
  reg_7905_arranque: { partes: [DC('V1', '-10', 'in'), R('RL', '10', 'out', '0'), C('C1', '10u', 'out', '0'), REG('regulador-negativo', '7905', 'in', 'out', '0')], fin: 12e-3, hmax: 5e-6, tolT: 5e-6, corrientes: { 'i(v1)': 'V1' } },
  reg_lm317_arranque: {
    partes: [DC('V1', '12', 'in'), R('RA1', '240', 'out', 'adj'), R('RA2', '720', 'adj', '0'), R('RL', '100', 'out', '0'), C('C1', '10u', 'out', '0'), { tipo: 'regulador-ajustable', ref: 'U1', props: { modelo: 'LM317' }, pines: { IN: 'in', OUT: 'out', ADJ: 'adj' } }],
    fin: 12e-3, hmax: 5e-6, tolT: 5e-6, corrientes: { 'i(v1)': 'V1' }
  },
  // Los casos de `engine/referencias/` con piezas digitales, armados con las de la librería.
  hc_inversor_rc: { partes: [PULSO('V1', '5', '1M', 'in'), { tipo: 'not', ref: 'U1', pines: { A: 'in', Y: 'out' } }, R('R1', '1k', 'out', 'c'), C('C1', '100p', 'c', '0')], fin: 3e-6, hmax: 1e-10, tolT: 5e-10, enLosInstantesDelCsv: true },
  cd4000_12v: {
    partes: [PULSO('VA', '12', '250k', 'a'), PULSO('VB', '12', '125k', 'b'), { tipo: 'nor', ref: 'U1', props: { familia: 'CD4000B', alimentacion: '12 V' }, pines: { A: 'a', B: 'b', Y: 'out' } }, R('R1', '10k', 'out', 'c'), C('C1', '50p', 'c', '0')],
    fin: 12e-6,
    hmax: 1e-9,
    tolT: 2e-9,
    enLosInstantesDelCsv: true
  },
  // Cinco entradas 74LS sobre la salida (las de cinco inversores, cada una con su carga de entrada). Una red solo de pines
  // digitales no tiene voltaje: los 1 GΩ a tierra la hacen analógica, como en la referencia, y cambian el voltaje en nanovoltios.
  ls_abanico: {
    partes: [
      PULSO('V1', '5', '1M', 'in'),
      { tipo: 'nand', ref: 'U1', props: { familia: '74LS' }, pines: { A: 'in', B: 'in', Y: 'out' } },
      ...[2, 3, 4, 5, 6].map((k): Parte => ({ tipo: 'not', ref: `U${k}`, props: { familia: '74LS' }, pines: { A: 'out', Y: `y${k}` } })),
      R('RX', '1G', 'out', '0')
    ],
    fin: 3e-6,
    hmax: 1e-10,
    tolT: 5e-10,
    enLosInstantesDelCsv: true
  },
  hc_decodificador_display: {
    partes: [
      PULSO('VCK', '5', '1M', 'ck'),
      { tipo: 'contador', ref: 'U1', pines: { CLK: 'ck', RST: '0', Q0: 'q0', Q1: 'q1', Q2: 'q2', Q3: 'q3', CO: 'co' } },
      { tipo: 'decodificador-7seg', ref: 'U2', pines: { A: 'q0', B: 'q1', C: 'q2', D: 'q3', a: 'pa', b: 'pb', c: 'pc', d: 'pd', e: 'pe', f: 'pf', g: 'pg' } },
      ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s, k) => R(`R${k + 1}`, '330', `p${s}`, `an_${s}`)),
      { tipo: 'display-7seg', ref: 'DS1', pines: { a: 'an_a', b: 'an_b', c: 'an_c', d: 'an_d', e: 'an_e', f: 'an_f', g: 'an_g', dp: 'suelto', COM: '0' } }
    ],
    fin: 11e-6,
    hmax: 1e-10,
    tolT: 5e-10,
    enLosInstantesDelCsv: true
  },
  // El 555 y lo que maneja son una sola isla: se lee después de cada paso.
  ne555_astable: {
    partes: [DC('V1', '5', 'vcc'), R('R1', '1k', 'vcc', 'dis'), R('R2', '10k', 'dis', 'thr'), C('C1', '100n', 'thr', '0'), C('C2', '10n', 'cv', '0'), R('RL', '10k', 'out', '0'), TIMER('NE555', 'thr', 'out', 'cv', 'thr', 'dis')],
    fin: 0.01,
    hmax: 5e-7,
    tolT: 2e-6,
    corrientes: { 'i(v1)': 'V1' }
  },
  tlc555_astable: {
    partes: [DC('V1', '5', 'vcc'), R('R1', '10k', 'vcc', 'dis'), R('R2', '47k', 'dis', 'thr'), C('C1', '10n', 'thr', '0'), R('RL', '10k', 'out', '0'), TIMER('TLC555', 'thr', 'out', 'cv', 'thr', 'dis')],
    fin: 0.005,
    hmax: 5e-8,
    tolT: 1e-6,
    corrientes: { 'i(v1)': 'V1' }
  }
}
