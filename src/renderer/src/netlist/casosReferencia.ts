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
const JF = (tipo: 'jfet-n' | 'jfet-p', modelo: string, d: string, g: string, s: string): Parte => ({ tipo, ref: 'J1', props: { modelo }, pines: { D: d, G: g, S: s } })
/** Fuente controlada: `+`, `-`, `C+` y `C-`. */
const CTL = (tipo: string, ref: string, valor: string, p: string, n: string, cp: string, cn: string): Parte => ({ tipo, ref, props: { [tipo === 'fuente-vccs' ? 'gm' : tipo === 'fuente-ccvs' ? 'r' : 'ganancia']: valor }, pines: { '+': p, '-': n, 'C+': cp, 'C-': cn } })
/** El 555 con VCC y RESET en «vcc» y GND en la tierra. */
const TIMER = (modelo: string, trig: string, out: string, cv: string, thr: string, dis: string): Parte => ({ tipo: 'temporizador-555', ref: 'X1', props: { modelo }, pines: { '1': '0', '2': trig, '3': out, '4': 'vcc', '5': cv, '6': thr, '7': dis, '8': 'vcc' } })
/** El comparador con V− en la tierra: entrada no inversora, inversora, salida y V+. */
const CMP = (modelo: string, mas: string, menos: string, sal: string, vmas: string): Parte => ({ tipo: 'comparador', ref: 'U1', props: { modelo }, pines: { '+': mas, '-': menos, OUT: sal, 'V+': vmas, 'V-': '0' } })
const AO = (modelo: string, mas: string, menos: string, sal: string, vmas: string, vmenos: string): Parte => ({ tipo: 'amp-op', ref: 'U1', props: { modelo }, pines: { '+': mas, '-': menos, OUT: sal, 'V+': vmas, 'V-': vmenos } })

/** Un regulador de tres pines (entrada, salida y el tercero: tierra o ajuste). */
const REG = (tipo: string, modelo: string, entrada: string, salida: string, tercero: string): Parte => ({ tipo, ref: 'U1', props: { modelo }, pines: { IN: entrada, OUT: salida, GND: tercero } })

/** La referencia TL431: cátodo, ánodo y referencia. */
const TL431 = (k: string, a: string, ref: string): Parte => ({ tipo: 'tl431', ref: 'U1', props: { modelo: 'TL431' }, pines: { K: k, A: a, REF: ref } })

/** La referencia LM4040 del voltaje dado: cátodo y ánodo. */
const LM4040 = (voltaje: string, k: string, a: string): Parte => ({ tipo: 'lm4040', ref: 'U1', props: { modelo: voltaje }, pines: { K: k, A: a } })
/** Una LM4040 alimentada con `vin` por `r1` desde un nodo «vcc»: punto de operación asentado. */
const lm4040 = (voltaje: string, vin: string, r1: string): Caso => ({ partes: [DC('V1', vin, 'vcc'), R('R1', r1, 'vcc', 'k'), LM4040(voltaje, 'k', '0')], fin: 0.2, hmax: 1e-4, corrientes: { 'i(v1)': 'V1' } })

/** El INA128 con V+ en «vp», V− en «vm», REF a tierra, salida «out» con 10 kΩ y RG entre «rg1» y «rg2» (sin RG, esos pines al aire). */
const INA128 = (rg: string | null): Parte => ({ tipo: 'ina128', ref: 'U1', props: { modelo: 'INA128' }, pines: { 'IN-': 'inm', 'IN+': 'inp', RG1: rg ? 'rg1' : 'aire_rg1', RG2: rg ? 'rg2' : 'aire_rg2', REF: '0', OUT: 'out', 'V+': 'vp', 'V-': 'vm' } })
const INA_FUENTES: Parte[] = [DC('V1', '15', 'vp'), DC('V2', '-15', 'vm'), R('RL', '10k', 'out', '0')]

/** El LM386 con VS en «vs», GND y IN− en tierra, la salida «out» y las patillas 1 y 8 en «g1» y «g8» (al aire sin el capacitor). */
const LM386 = (entrada: string, byp: string, ganancia200 = false): Parte => ({ tipo: 'lm386', ref: 'U1', props: { modelo: 'LM386' }, pines: { 'IN-': '0', 'IN+': entrada, GAIN1: ganancia200 ? 'g1' : 'aire_g1', GAIN8: ganancia200 ? 'g8' : 'aire_g8', BYP: byp, OUT: 'out', VS: 'vs', GND: '0' } })

/** La punta lógica de la familia dada con la pinza + en «vcc» (5 V) y la − en tierra. Con `rampa`, la punta en «p» sigue una rampa de 0 a 5 V en 4 ms; sin ella es un punto de operación asentado. */
const punta = (familia: string, red: string, rampa = false): Caso => ({
  partes: [DC('V1', '5', 'vcc'), ...(rampa ? [{ tipo: 'fuente-pulso', ref: 'V2', props: { alto: '5', frecuencia: '100', ciclo: '50 %', ancho: '1m', subida: '4m', bajada: '4m' }, pines: { '+': 'p', '-': '0' } } as Parte] : []), { tipo: 'punta-logica', ref: 'LP1', props: { familia }, pines: { PUNTA: red, '+': 'vcc', '-': '0' } }],
  fin: rampa ? 10e-3 : 0.1,
  hmax: rampa ? 5e-7 : 1e-4,
  ...(rampa ? { tolT: 5e-6 } : {}),
  corrientes: { 'i(v1)': 'V1' }
})

/** Un termistor NTC con la temperatura de su perilla, entre las redes dadas. */
const NTC = (modelo: string, temperatura: string, a: string, b: string): Parte => ({ tipo: 'ntc', ref: 'TH1', props: { modelo, temperatura }, pines: { '1': a, '2': b } })
/** La PTC B59339A1202P020 con la temperatura de su perilla, entre las redes dadas. */
const PTC = (temperatura: string, a: string, b: string): Parte => ({ tipo: 'ptc', ref: 'TH1', props: { temperatura }, pines: { '1': a, '2': b } })
/** Una fotorresistencia con la luz de su perilla, entre las redes dadas. */
const LDR = (modelo: string, luz: string, a: string, b: string): Parte => ({ tipo: 'ldr', ref: 'LDR1', props: { modelo, luz }, pines: { '1': a, '2': b } })
/** Un sensor de temperatura integrado (LM35 o TMP36) con +VS en «vcc», VOUT en «out» y GND en la tierra. */
const SENS = (tipo: string, temperatura: string): Parte => ({ tipo, ref: 'U1', props: { temperatura }, pines: { '+VS': 'vcc', VOUT: 'out', GND: '0' } })
/** El 4N25 con el LED entre `a` y `k`, el colector en `c`, el emisor en `e` y la base al aire. */
const OPTO4 = (a: string, k: string, c: string, e = '0'): Parte => ({ tipo: 'optoacoplador-4n25', ref: 'U1', props: { modelo: '4N25' }, pines: { A: a, K: k, C: c, E: e, B: 'aire_B' } })
/** Un PC817 del rango dado (A a D) con el LED entre `a` y `k` y el transistor entre `c` y `e`. */
const OPTO8 = (rango: string, a: string, k: string, c: string, e = '0'): Parte => ({ tipo: 'optoacoplador-pc817', ref: 'U1', props: { modelo: `PC817${rango}` }, pines: { A: a, K: k, C: c, E: e } })
/** El IGBT del modelo dado con el colector en `c`, la compuerta en `g` y el emisor en la tierra. */
const IGBT = (modelo: string, c: string, g: string): Parte => ({ tipo: 'igbt', ref: 'Q1', props: { modelo }, pines: { C: c, G: g, E: '0' } })
/** El UJT 2N2646 con el emisor en `e`, la base 1 en `b1` y la base 2 en `b2`. */
const UJT = (e: string, b1: string, b2: string): Parte => ({ tipo: 'ujt', ref: 'Q1', props: { modelo: '2N2646' }, pines: { E: e, B1: b1, B2: b2 } })
const IE = (corriente: string): Parte => ({ tipo: 'fuente-corriente', ref: 'I1', props: { corriente }, pines: { entrada: '0', salida: 'e' } })
const SCR = (anodo: string, catodo: string, compuerta: string): Parte => ({ tipo: 'scr', ref: 'Q1', props: { modelo: '2N5060' }, pines: { A: anodo, K: catodo, G: compuerta } })
/** El ULN2003A con E en tierra; los canales y pines que no se nombran quedan en una red propia (al aire). */
const ULN = (pines: Record<string, string>): Parte => ({ tipo: 'uln2003', ref: 'U1', props: { modelo: 'ULN2003A' }, pines: { E: '0', ...Object.fromEntries(['1B', '2B', '3B', '4B', '5B', '6B', '7B', '1C', '2C', '3C', '4C', '5C', '6C', '7C', 'COM'].map((p) => [p, `aire_${p}`])), ...pines } })
/** Pulso de compuerta que empieza a 1 ms (con la fuente ya asentada) y dura 5 ms, cada 10 ms. */
const PULSO_G = (ref: string, alto: string, mas: string): Parte => ({ tipo: 'fuente-pulso', ref, props: { alto, frecuencia: '100', ciclo: '50 %', retardo: '1m' }, pines: { '+': mas, '-': '0' } })
const TRIAC = (mt2: string, compuerta: string): Parte => ({ tipo: 'triac', ref: 'Q1', props: { modelo: 'BT136' }, pines: { MT2: mt2, MT1: '0', G: compuerta } })
const DIAC = (modelo: string, a1: string, a2: string): Parte => ({ tipo: 'diac', ref: 'D1', props: { modelo }, pines: { A1: a1, A2: a2 } })

/** El 17HS4401 con cada fase detrás de 6 Ω y una fuente por tramos (`a` y `b`, pares «tiempo voltaje»); `carga` es el par de la perilla en N·m. */
const PASOS_BI = (a: string, b: string, carga: string): Parte[] => [
  { tipo: 'fuente-pwl', ref: 'V1', props: { puntos: a }, pines: { '+': 'na', '-': '0' } },
  R('R1', '6', 'na', 'ma'),
  { tipo: 'fuente-pwl', ref: 'V2', props: { puntos: b }, pines: { '+': 'nb', '-': '0' } },
  R('R2', '6', 'nb', 'mb'),
  { tipo: 'motor-pasos-bipolar', ref: 'M1', props: { modelo: '17HS4401', carga }, pines: { 'A+': 'ma', 'A-': '0', 'B+': 'mb', 'B-': '0' } }
]

/** El 28BYJ-48 con la toma a 5 V y un extremo por mitad que baja a 0 V como lo haría un ULN2003: `e` son las cuatro fuentes por tramos (A, A', B, B'). */
const PASOS_UNI = (e: [string, string, string, string], carga: string): Parte[] => [
  DC('V5', '5', 'com'),
  ...e.map((puntos, k): Parte => ({ tipo: 'fuente-pwl', ref: `V${k + 1}`, props: { puntos }, pines: { '+': `e${k + 1}`, '-': '0' } })),
  { tipo: 'motor-pasos-unipolar', ref: 'M1', props: { modelo: '28BYJ-48', carga }, pines: { A: 'e1', A2: 'e2', B: 'e3', B2: 'e4', COM: 'com' } }
]

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
  /** Perillas en vivo que cambian durante la simulación: sus puntos (segundos, valor) se unen con rampas, como un pwl de ngspice. Las referencias de ngspice las llevan escritas a mano: el exportador solo escribe el valor inicial. */
  perillas?: { ref: string; prop: string; puntos: [number, number][] }[]
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
  jfet_2n5457_autopolarizacion: { partes: [DC('V1', '15', '1'), R('RG', '1M', '2', '0'), R('RS', '1k', '3', '0'), R('RD', '2.2k', '1', '4'), JF('jfet-n', '2N5457', '4', '2', '3')], fin: 0.02, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  jfet_j201_autopolarizacion: { partes: [DC('V1', '15', '1'), R('RG', '1M', '2', '0'), R('RS', '2.2k', '3', '0'), R('RD', '10k', '1', '4'), JF('jfet-n', 'J201', '4', '2', '3')], fin: 0.02, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  jfet_2n3819_autopolarizacion: { partes: [DC('V1', '15', '1'), R('RG', '1M', '2', '0'), R('RS', '470', '3', '0'), R('RD', '1k', '1', '4'), JF('jfet-n', '2N3819', '4', '2', '3')], fin: 0.02, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  jfet_2n5460_autopolarizacion: { partes: [DC('V1', '15', '1'), R('RG', '1M', '2', '0'), R('RS', '1k', '1', '3'), R('RD', '2.2k', '4', '0'), JF('jfet-p', '2N5460', '4', '2', '3')], fin: 0.02, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  jfet_j175_autopolarizacion: { partes: [DC('V1', '15', '1'), R('RG', '1M', '2', '0'), R('RS', '100', '1', '3'), R('RD', '220', '4', '0'), JF('jfet-p', 'J175', '4', '2', '3')], fin: 0.02, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  jfet_2n3819_triodo: { partes: [DC('V1', '0.5', '1'), DC('VG', '-1', '2'), JF('jfet-n', '2N3819', '1', '2', '0')], fin: 0.02, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  jfet_2n3819_saturacion: { partes: [DC('V1', '10', '1'), DC('VG', '-1', '2'), JF('jfet-n', '2N3819', '1', '2', '0')], fin: 0.02, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  jfet_j201_inverso: { partes: [DC('V1', '-1', '1'), DC('VG', '-0.2', '2'), JF('jfet-n', 'J201', '1', '2', '0')], fin: 0.02, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  jfet_2n5457_fuente_comun: {
    partes: [DC('V1', '15', '1'), AC('V2', '100m', '1k', '5'), C('C1', '1u', '5', '2'), R('RG', '1M', '2', '0'), R('RS', '1k', '3', '0'), C('C2', '2.2u', '3', '0'), R('RD', '2.2k', '1', '4'), C('C3', '1u', '4', '6'), R('RL', '10k', '6', '0'), JF('jfet-n', '2N5457', '4', '2', '3')],
    fin: 0.02,
    hmax: 2e-6,
    tolT: 2e-6,
    corrientes: { 'i(v1)': 'V1' }
  },
  jfet_2n3819_fuente_corriente: { partes: [DC('V1', '12', '1'), R('RL', '1k', '1', '2'), R('RS', '220', '3', '0'), JF('jfet-n', '2N3819', '2', '0', '3')], fin: 0.02, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  jfet_j175_interruptor: {
    partes: [DC('V1', '-12', '1'), { tipo: 'fuente-pulso', ref: 'V2', props: { alto: '6', frecuencia: '10k', ciclo: '50 %', retardo: '20u', subida: '1n', bajada: '1n', ancho: '49.998u' }, pines: { '+': '4', '-': '0' } }, R('RG', '1k', '4', '2'), R('RL', '100', '1', '3'), JF('jfet-p', 'J175', '3', '2', '0')],
    fin: 300e-6,
    hmax: 20e-9,
    tolT: 20e-9,
    corrientes: { 'i(v1)': 'V1' }
  },
  vcvs_amplificador: { partes: [DC('V1', '0.5', '1'), R('R1', '1k', '1', '0'), CTL('fuente-vcvs', 'E1', '4', '2', '0', '1', '0'), R('R2', '1k', '2', '3'), R('R3', '2k', '3', '0')], fin: 0.02, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  vcvs_lazo: { partes: [DC('V1', '1', '1'), R('R1', '1k', '1', '2'), R('R2', '10k', '2', '3'), CTL('fuente-vcvs', 'E1', '100k', '3', '0', '0', '2')], fin: 0.02, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  vccs_transconductancia: { partes: [DC('V1', '2', '1'), DC('V2', '5', '3'), R('RL', '1k', '3', '2'), CTL('fuente-vccs', 'G1', '3m', '2', '0', '1', '0')], fin: 0.02, hmax: 1e-5, corrientes: { 'i(v2)': 'V2' } },
  ccvs_transresistencia: { partes: [DC('V1', '1', '1'), R('R1', '1k', '1', '2'), CTL('fuente-ccvs', 'H1', '2k', '3', '0', '2', '0'), R('RL', '10k', '3', '0')], fin: 0.02, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  cccs_espejo: { partes: [DC('V1', '5', '1'), R('R1', '1k', '1', '2'), CTL('fuente-cccs', 'F1', '0.5', '4', '0', '2', '0'), DC('V2', '5', '3'), R('RL', '1k', '3', '4')], fin: 0.02, hmax: 1e-5, corrientes: { 'i(v1)': 'V1', 'i(v2)': 'V2' } },
  vcvs_filtro_rc: { partes: [AC('VIN', '1', '1k', '1'), CTL('fuente-vcvs', 'E1', '3', '2', '0', '1', '0'), R('R1', '1k', '2', '3'), C('C1', '100n', '3', '0')], fin: 5e-3, hmax: 2e-6, tolT: 2e-6, corrientes: { 'i(vin)': 'VIN' } },
  pwl_rampa: { partes: [{ tipo: 'fuente-pwl', ref: 'V1', props: { puntos: '0 0, 2m 5, 4m 5' }, pines: { '+': '1', '-': '0' } }, R('R1', '1k', '1', '2'), C('C1', '100n', '2', '0')], fin: 4e-3, hmax: 2e-6, tolT: 2e-6, corrientes: { 'i(v1)': 'V1' } },
  pwl_escalones: { partes: [{ tipo: 'fuente-pwl', ref: 'V1', props: { puntos: '0 0, 1m 0, 1.001m 2, 2m 2, 2.001m 4, 3m 4, 3.001m 1, 4m 1' }, pines: { '+': '1', '-': '0' } }, R('R1', '1k', '1', '2'), C('C1', '100n', '2', '0')], fin: 4e-3, hmax: 2e-6, tolT: 2e-6, corrientes: { 'i(v1)': 'V1' } },
  pwl_repeticion: { partes: [{ tipo: 'fuente-pwl', ref: 'V1', props: { puntos: '0 0, 1m 5, 2m 0, 3m 0', repetir: 'Sí' }, pines: { '+': '1', '-': '0' } }, R('R1', '1k', '1', '2'), C('C1', '100n', '2', '0')], fin: 10e-3, hmax: 2e-6, tolT: 2e-6, corrientes: { 'i(v1)': 'V1' } },
  ntc_10k_divisor_25: { partes: [DC('V1', '5', '1'), R('R1', '10k', '1', '2'), NTC('10 kΩ', '25', '2', '0')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  ntc_10k_divisor_100c: { partes: [DC('V1', '5', '1'), R('R1', '10k', '1', '2'), NTC('10 kΩ', '100', '2', '0')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  ntc_100k_divisor_60c: { partes: [DC('V1', '5', '1'), R('R1', '100k', '1', '2'), NTC('100 kΩ', '60', '2', '0')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  ntc_10k_autocalentamiento: { partes: [DC('V1', '30', '1'), R('R1', '1k', '1', '2'), NTC('10 kΩ', '25', '2', '0')], fin: 60, hmax: 0.05, tolT: 0.1, corrientes: { 'i(v1)': 'V1' } },
  ntc_arranque_limitador: { partes: [DC('V1', '3', '1'), R('R1', '1', '1', '2'), NTC('Arranque 5 Ω', '25', '2', '0')], fin: 200, hmax: 0.2, tolT: 0.5, corrientes: { 'i(v1)': 'V1' } },
  ntc_10k_cambio_temperatura: {
    partes: [DC('V1', '5', '1'), R('R1', '10k', '1', '2'), NTC('10 kΩ', '25', '2', '0')],
    fin: 10e-3,
    hmax: 5e-6,
    tolT: 5e-6,
    corrientes: { 'i(v1)': 'V1' },
    perillas: [{ ref: 'TH1', prop: 'temperatura', puntos: [[2e-3, 25], [4e-3, 85], [6e-3, 85], [8e-3, -10], [10e-3, -10]] }]
  },
  ptc_divisor_25: { partes: [DC('V1', '5', '1'), R('R1', '1k', '1', '2'), PTC('25', '2', '0')], fin: 0.2, hmax: 1e-3, tolT: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  ptc_divisor_80c: { partes: [DC('V1', '5', '1'), R('R1', '1k', '1', '2'), PTC('80', '2', '0')], fin: 0.2, hmax: 1e-3, tolT: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  ptc_divisor_125c: { partes: [DC('V1', '5', '1'), R('R1', '1k', '1', '2'), PTC('125', '2', '0')], fin: 0.2, hmax: 1e-3, tolT: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  ptc_conmutacion_230v: { partes: [DC('V1', '230', '1'), PTC('25', '1', '0')], fin: 30, hmax: 5e-3, tolT: 0.01, corrientes: { 'i(v1)': 'V1' } },
  ptc_cambio_temperatura: {
    partes: [DC('V1', '5', '1'), R('R1', '1k', '1', '2'), PTC('25', '2', '0')],
    fin: 10e-3,
    hmax: 5e-6,
    tolT: 5e-6,
    corrientes: { 'i(v1)': 'V1' },
    perillas: [{ ref: 'TH1', prop: 'temperatura', puntos: [[2e-3, 25], [4e-3, 125], [6e-3, 125], [8e-3, -20], [10e-3, -20]] }]
  },
  ldr_gl5528_10lx: { partes: [DC('V1', '5', '1'), R('R1', '10k', '1', '2'), LDR('GL5528', '10', '2', '0')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  ldr_gl5528_1000lx: { partes: [DC('V1', '5', '1'), R('R1', '10k', '1', '2'), LDR('GL5528', '1000', '2', '0')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  ldr_gl5539_0p1lx: { partes: [DC('V1', '5', '1'), R('R1', '10k', '1', '2'), LDR('GL5539', '0.1', '2', '0')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  ldr_gl5516_300lx: { partes: [DC('V1', '5', '1'), R('R1', '10k', '1', '2'), LDR('GL5516', '300', '2', '0')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  ldr_gl5528_escalon_luz: {
    partes: [DC('V1', '5', '1'), R('R1', '10k', '1', '2'), LDR('GL5528', '10', '2', '0')],
    fin: 0.6,
    hmax: 1e-4,
    tolT: 1e-4,
    corrientes: { 'i(v1)': 'V1' },
    perillas: [{ ref: 'LDR1', prop: 'luz', puntos: [[0.05, 10], [0.0501, 1000], [0.3, 1000], [0.3001, 10], [0.6, 10]] }]
  },
  lm35_25c: { partes: [DC('V1', '5', 'vcc'), R('RL', '10k', 'out', '0'), SENS('lm35', '25')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  lm35_100c: { partes: [DC('V1', '5', 'vcc'), R('RL', '10k', 'out', '0'), SENS('lm35', '100')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  lm35_0c: { partes: [DC('V1', '5', 'vcc'), R('RL', '10k', 'out', '0'), SENS('lm35', '0')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  lm35_rampa: {
    partes: [DC('V1', '5', 'vcc'), R('RL', '10k', 'out', '0'), SENS('lm35', '0')],
    fin: 10e-3,
    hmax: 5e-6,
    tolT: 5e-6,
    corrientes: { 'i(v1)': 'V1' },
    perillas: [{ ref: 'U1', prop: 'temperatura', puntos: [[2e-3, 100], [8e-3, 100], [10e-3, 0]] }]
  },
  tmp36_25c: { partes: [DC('V1', '5', 'vcc'), R('RL', '10k', 'out', '0'), SENS('tmp36', '25')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  tmp36_m40c: { partes: [DC('V1', '5', 'vcc'), R('RL', '10k', 'out', '0'), SENS('tmp36', '-40')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  tmp36_125c: { partes: [DC('V1', '5', 'vcc'), R('RL', '10k', 'out', '0'), SENS('tmp36', '125')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  tmp36_rampa: {
    partes: [DC('V1', '5', 'vcc'), R('RL', '10k', 'out', '0'), SENS('tmp36', '-40')],
    fin: 10e-3,
    hmax: 5e-6,
    tolT: 5e-6,
    corrientes: { 'i(v1)': 'V1' },
    perillas: [{ ref: 'U1', prop: 'temperatura', puntos: [[2e-3, 125], [8e-3, 125], [10e-3, -40]] }]
  },
  opto_4n25_ctr: { partes: [DC('V1', '5', 'vin'), R('R1', '330', 'vin', 'a'), DC('V2', '10', 'vcc'), R('RL', '1k', 'vcc', 'c'), OPTO4('a', '0', 'c')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1', 'i(v2)': 'V2' } },
  opto_4n25_saturado: { partes: [DC('V1', '12', 'vin'), R('R1', '220', 'vin', 'a'), DC('V2', '10', 'vcc'), R('RL', '4.7k', 'vcc', 'c'), OPTO4('a', '0', 'c')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1', 'i(v2)': 'V2' } },
  opto_4n25_conmutacion: { partes: [PULSO('V1', '5', '25k', 'vin'), R('R1', '330', 'vin', 'a'), DC('V2', '10', 'vcc'), R('RL', '1k', 'vcc', 'c'), OPTO4('a', '0', 'c')], fin: 100e-6, hmax: 20e-9, tolT: 20e-9, corrientes: { 'i(v1)': 'V1', 'i(v2)': 'V2' } },
  opto_pc817a_ctr: { partes: [DC('V1', '5', 'vin'), R('R1', '1k', 'vin', 'a'), DC('V2', '5', 'vcc'), R('RL', '100', 'vcc', 'c'), OPTO8('A', 'a', '0', 'c')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1', 'i(v2)': 'V2' } },
  opto_pc817b_ctr: { partes: [DC('V1', '5', 'vin'), R('R1', '1k', 'vin', 'a'), DC('V2', '5', 'vcc'), R('RL', '100', 'vcc', 'c'), OPTO8('B', 'a', '0', 'c')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1', 'i(v2)': 'V2' } },
  opto_pc817c_ctr: { partes: [DC('V1', '5', 'vin'), R('R1', '1k', 'vin', 'a'), DC('V2', '5', 'vcc'), R('RL', '100', 'vcc', 'c'), OPTO8('C', 'a', '0', 'c')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1', 'i(v2)': 'V2' } },
  opto_pc817d_ctr: { partes: [DC('V1', '5', 'vin'), R('R1', '1k', 'vin', 'a'), DC('V2', '5', 'vcc'), R('RL', '100', 'vcc', 'c'), OPTO8('D', 'a', '0', 'c')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1', 'i(v2)': 'V2' } },
  opto_pc817a_conmutacion: { partes: [PULSO('V1', '5', '25k', 'vin'), R('R1', '1k', 'vin', 'a'), DC('V2', '5', 'vcc'), R('RL', '470', 'vcc', 'c'), OPTO8('A', 'a', '0', 'c')], fin: 100e-6, hmax: 20e-9, tolT: 20e-9, corrientes: { 'i(v1)': 'V1', 'i(v2)': 'V2' } },
  igbt_irg4bc30ud_conduccion: { partes: [DC('V1', '30', 'vin'), R('R1', '2.3', 'vin', 'c'), DC('V2', '15', 'g'), IGBT('IRG4BC30UD', 'c', 'g')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  igbt_irg4bc30ud_activa: { partes: [DC('V1', '100', 'vin'), R('R1', '5', 'vin', 'c'), DC('V2', '7.3', 'g'), IGBT('IRG4BC30UD', 'c', 'g')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  igbt_irg4bc30ud_diodo: { partes: [DC('V1', '-5', 'vin'), R('R1', '0.5', 'vin', 'c'), DC('V2', '0', 'g'), IGBT('IRG4BC30UD', 'c', 'g')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  igbt_irg4bc30ud_conmutacion: { partes: [DC('V1', '100', 'vin'), R('R1', '8.3', 'vin', 'c'), { tipo: 'fuente-pulso', ref: 'V2', props: { alto: '15', frecuencia: '20k', ciclo: '50 %', retardo: '2u' }, pines: { '+': 'gin', '-': '0' } }, R('RG', '10', 'gin', 'g'), IGBT('IRG4BC30UD', 'c', 'g')], fin: 100e-6, hmax: 10e-9, tolT: 10e-9, corrientes: { 'i(v1)': 'V1' } },
  igbt_fga25n120antd_conduccion: { partes: [DC('V1', '60', 'vin'), R('R1', '2.3', 'vin', 'c'), DC('V2', '15', 'g'), IGBT('FGA25N120ANTD', 'c', 'g')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  igbt_fga25n120antd_activa: { partes: [DC('V1', '200', 'vin'), R('R1', '6', 'vin', 'c'), DC('V2', '8.4', 'g'), IGBT('FGA25N120ANTD', 'c', 'g')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  igbt_fga25n120antd_conmutacion: { partes: [DC('V1', '200', 'vin'), R('R1', '8', 'vin', 'c'), { tipo: 'fuente-pulso', ref: 'V2', props: { alto: '15', frecuencia: '20k', ciclo: '50 %', retardo: '2u' }, pines: { '+': 'gin', '-': '0' } }, R('RG', '10', 'gin', 'g'), IGBT('FGA25N120ANTD', 'c', 'g')], fin: 100e-6, hmax: 10e-9, tolT: 10e-9, corrientes: { 'i(v1)': 'V1' } },
  ujt_2n2646_bajo: { partes: [DC('V1', '10', 'b2'), IE('1u'), UJT('e', '0', 'b2')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  ujt_2n2646_conduccion: { partes: [DC('V1', '10', 'b2'), IE('50m'), UJT('e', '0', 'b2')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  ujt_2n2646_valle: { partes: [DC('V1', '10', 'b2'), IE('6m'), UJT('e', '0', 'b2')], fin: 0.2, hmax: 1e-3, corrientes: { 'i(v1)': 'V1' } },
  ujt_2n2646_relajacion: { partes: [DC('V1', '10', 'vcc'), R('R2', '100', 'vcc', 'b2'), R('R1', '47', 'b1', '0'), UJT('e', 'b1', 'b2'), R('R3', '100k', 'vcc', 'e'), C('C1', '10n', 'e', '0')], fin: 5e-3, hmax: 0.5e-6, tolT: 1e-6, corrientes: { 'i(vcc)': 'V1' } },
  pasos_17hs4401_paso: { partes: PASOS_BI('0 12, 0.03 12, 0.03001 0, 0.08 0', '0 0, 0.03 0, 0.03001 12, 0.08 12', '0'), fin: 0.08, hmax: 2e-5, tolT: 5e-5, corrientes: { 'i(v1)': 'V1', 'i(v2)': 'V2' } },
  pasos_17hs4401_medios_pasos: { partes: PASOS_BI('0 12, 0.02 12, 0.02001 12, 0.025 12, 0.02501 0, 0.03 0, 0.03001 -12, 0.035 -12, 0.03501 -12, 0.04 -12, 0.04001 -12, 0.045 -12, 0.04501 0, 0.05 0, 0.05001 12, 0.055 12, 0.05501 12, 0.08 12', '0 0, 0.02 0, 0.02001 12, 0.025 12, 0.02501 12, 0.03 12, 0.03001 12, 0.035 12, 0.03501 0, 0.04 0, 0.04001 -12, 0.045 -12, 0.04501 -12, 0.05 -12, 0.05001 -12, 0.055 -12, 0.05501 0, 0.08 0', '0'), fin: 0.08, hmax: 2e-5, tolT: 5e-5, corrientes: { 'i(v1)': 'V1', 'i(v2)': 'V2' } },
  pasos_17hs4401_carga: { partes: PASOS_BI('0 12, 0.02 12, 0.02001 12, 0.0225 12, 0.02251 0, 0.025 0, 0.02501 -12, 0.0275 -12, 0.02751 -12, 0.03 -12, 0.03001 -12, 0.0325 -12, 0.03251 0, 0.035 0, 0.03501 12, 0.0375 12, 0.03751 12, 0.06 12', '0 0, 0.02 0, 0.02001 12, 0.0225 12, 0.02251 12, 0.025 12, 0.02501 12, 0.0275 12, 0.02751 0, 0.03 0, 0.03001 -12, 0.0325 -12, 0.03251 -12, 0.035 -12, 0.03501 -12, 0.0375 -12, 0.03751 0, 0.06 0', '0.1'), fin: 0.06, hmax: 2e-5, tolT: 5e-5, corrientes: { 'i(v1)': 'V1', 'i(v2)': 'V2' } },
  pasos_28byj48_paso: { partes: PASOS_UNI(['0 5, 0.01 5, 0.01001 5, 0.04 5', '0 0, 0.01 0, 0.01001 5, 0.04 5', '0 5, 0.01 5, 0.01001 5, 0.04 5', '0 5, 0.01 5, 0.01001 0, 0.04 0'], '0'), fin: 0.04, hmax: 2e-5, tolT: 5e-5, corrientes: { 'i(v5)': 'V5', 'i(v1)': 'V1', 'i(v2)': 'V2', 'i(v3)': 'V3', 'i(v4)': 'V4' } },
  pasos_28byj48_medios_pasos: { partes: PASOS_UNI(['0 5, 0.01 5, 0.01001 5, 0.012 5, 0.01201 5, 0.014 5, 0.01401 0, 0.016 0, 0.01601 0, 0.018 0, 0.01801 0, 0.02 0, 0.02001 5, 0.022 5, 0.02201 5, 0.024 5, 0.02401 5, 0.04 5', '0 0, 0.01 0, 0.01001 0, 0.012 0, 0.01201 5, 0.014 5, 0.01401 5, 0.016 5, 0.01601 5, 0.018 5, 0.01801 5, 0.02 5, 0.02001 5, 0.022 5, 0.02201 0, 0.024 0, 0.02401 0, 0.04 0', '0 5, 0.01 5, 0.01001 5, 0.012 5, 0.01201 5, 0.014 5, 0.01401 5, 0.016 5, 0.01601 5, 0.018 5, 0.01801 0, 0.02 0, 0.02001 0, 0.022 0, 0.02201 0, 0.024 0, 0.02401 5, 0.04 5', '0 5, 0.01 5, 0.01001 0, 0.012 0, 0.01201 0, 0.014 0, 0.01401 0, 0.016 0, 0.01601 5, 0.018 5, 0.01801 5, 0.02 5, 0.02001 5, 0.022 5, 0.02201 5, 0.024 5, 0.02401 5, 0.04 5'], '0'), fin: 0.04, hmax: 2e-5, tolT: 5e-5, corrientes: { 'i(v5)': 'V5', 'i(v1)': 'V1', 'i(v2)': 'V2', 'i(v3)': 'V3', 'i(v4)': 'V4' } },
  pasos_28byj48_carga: { partes: PASOS_UNI(['0 5, 0.01 5, 0.01001 5, 0.0133333 5, 0.0133433 5, 0.0166666 5, 0.0166766 0, 0.0199999 0, 0.0200099 0, 0.0233332 0, 0.0233432 0, 0.0266665 0, 0.0266765 5, 0.0299998 5, 0.0300098 5, 0.0333331 5, 0.0333431 5, 0.05 5', '0 0, 0.01 0, 0.01001 0, 0.0133333 0, 0.0133433 5, 0.0166666 5, 0.0166766 5, 0.0199999 5, 0.0200099 5, 0.0233332 5, 0.0233432 5, 0.0266665 5, 0.0266765 5, 0.0299998 5, 0.0300098 0, 0.0333331 0, 0.0333431 0, 0.05 0', '0 5, 0.01 5, 0.01001 5, 0.0133333 5, 0.0133433 5, 0.0166666 5, 0.0166766 5, 0.0199999 5, 0.0200099 5, 0.0233332 5, 0.0233432 0, 0.0266665 0, 0.0266765 0, 0.0299998 0, 0.0300098 0, 0.0333331 0, 0.0333431 5, 0.05 5', '0 5, 0.01 5, 0.01001 0, 0.0133333 0, 0.0133433 0, 0.0166666 0, 0.0166766 0, 0.0199999 0, 0.0200099 5, 0.0233332 5, 0.0233432 5, 0.0266665 5, 0.0266765 5, 0.0299998 5, 0.0300098 5, 0.0333331 5, 0.0333431 5, 0.05 5'], '0.01'), fin: 0.05, hmax: 2e-5, tolT: 5e-5, corrientes: { 'i(v5)': 'V5', 'i(v1)': 'V1', 'i(v2)': 'V2', 'i(v3)': 'V3', 'i(v4)': 'V4' } },
  // el L298 a 9 V con un motor DC de 6 V, cuatro 1N4007 de rueda libre y la habilitación A en alto: frena, gira, frena, gira al revés y frena.
  l298_motor_dc: {
    partes: [
      DC('V1', '9', 'vs'), DC('V2', '5', 'vss'), DC('V3', '5', 'ena'),
      { tipo: 'fuente-pwl', ref: 'V4', props: { puntos: '0 0, 2m 0, 2.001m 5, 6m 5, 6.001m 0, 13m 0, 13.001m 5, 15m 5, 15.001m 0, 18m 0' }, pines: { '+': 'in1', '-': '0' } },
      { tipo: 'fuente-pwl', ref: 'V5', props: { puntos: '0 0, 9m 0, 9.001m 5, 15m 5, 15.001m 0, 18m 0' }, pines: { '+': 'in2', '-': '0' } },
      { tipo: 'l298', ref: 'U1', props: { modelo: 'L298N' }, pines: { IN1: 'in1', IN2: 'in2', IN3: '0', IN4: '0', ENA: 'ena', ENB: '0', OUT1: 'o1', OUT2: 'o2', OUT3: 'o3', OUT4: 'o4', SENSA: '0', SENSB: '0', VS: 'vs', VSS: 'vss', GND: '0' } },
      R('R3', '1k', 'o3', 'o4'),
      { tipo: 'motor-dc', ref: 'M1', props: { voltaje: '6' }, pines: { '+': 'o1', '-': 'o2' } },
      { tipo: 'diodo', ref: 'D1', props: { modelo: '1N4007' }, pines: { A: 'o1', K: 'vs' } },
      { tipo: 'diodo', ref: 'D2', props: { modelo: '1N4007' }, pines: { A: 'o2', K: 'vs' } },
      { tipo: 'diodo', ref: 'D3', props: { modelo: '1N4007' }, pines: { A: '0', K: 'o1' } },
      { tipo: 'diodo', ref: 'D4', props: { modelo: '1N4007' }, pines: { A: '0', K: 'o2' } }
    ],
    fin: 18e-3,
    hmax: 1e-6,
    tolT: 1e-6,
    corrientes: { 'i(vm)': 'M1' }
  },
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
  bjt_bc337: { partes: [DC('V1', '12', '1'), R('RB', '22k', '1', '2'), R('RC', '47', '1', '3'), Q('npn', 'BC337', '3', '2', '0')], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  bjt_bc327: { partes: [DC('V1', '12', '1'), R('RB', '22k', '2', '0'), R('RC', '47', '3', '0'), Q('pnp', 'BC327', '3', '2', '1')], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  bjt_2n5551: { partes: [DC('V1', '12', '1'), R('RB', '160k', '1', '2'), R('RC', '470', '1', '3'), Q('npn', '2N5551', '3', '2', '0')], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  bjt_2n5401: { partes: [DC('V1', '12', '1'), R('RB', '160k', '2', '0'), R('RC', '470', '3', '0'), Q('pnp', '2N5401', '3', '2', '1')], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  bjt_2n3055: { partes: [DC('V1', '12', '1'), R('RB', '270', '1', '2'), R('RC', '5', '1', '3'), Q('npn', '2N3055', '3', '2', '0')], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
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
  ic_rc_descarga: { partes: [R('R1', '1k', '1', '0'), { tipo: 'capacitor', ref: 'C1', props: { valor: '10u', vinicial: '5' }, pines: { '1': '1', '2': '0' } }], fin: 0.02, hmax: 2e-5 },
  ic_lc_oscila: {
    partes: [R('R1', '5', '1', '2'), { tipo: 'inductor', ref: 'L1', props: { valor: '10m', iinicial: '10m' }, pines: { '1': '2', '2': '0' } }, C('C1', '1u', '1', '0')],
    fin: 0.003,
    hmax: 2e-6
  },
  ic_wien_arranca: {
    partes: [
      CTL('fuente-vcvs', 'E1', '100k', 'o', '0', 'p', 'n'),
      R('R1', '10k', 'o', 'a'),
      C('C1', '16n', 'a', 'p'),
      R('R2', '10k', 'p', '0'),
      { tipo: 'capacitor', ref: 'C2', props: { valor: '16n', vinicial: '10m' }, pines: { '1': 'p', '2': '0' } },
      R('RF1', '15k', 'o', 'm'),
      R('RF2', '10k', 'm', 'n'),
      { tipo: 'diodo', ref: 'D1', pines: { A: 'm', K: 'n' } },
      { tipo: 'diodo', ref: 'D2', pines: { A: 'n', K: 'm' } },
      R('RG', '10k', 'n', '0')
    ],
    fin: 0.02,
    hmax: 2e-6
  },
  isenoidal_rc: {
    partes: [{ tipo: 'fuente-corriente-ac', ref: 'I1', props: { amplitud: '1m', frecuencia: '1k' }, pines: { entrada: '0', salida: '1' } }, R('R1', '1k', '1', '0'), C('C1', '1u', '1', '0')],
    fin: 0.005,
    hmax: 2e-6
  },
  ipulso_capacitor: {
    partes: [{ tipo: 'fuente-corriente-pulso', ref: 'I1', props: { alto: '1m', frecuencia: '1k', ciclo: '50 %', ancho: '400u', subida: '10u', bajada: '10u' }, pines: { entrada: '0', salida: '1' } }, R('R1', '1k', '1', '0'), C('C1', '1u', '1', '0')],
    fin: 0.005,
    hmax: 2e-6,
    tolT: 2e-6
  },
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
  ao_mcp6002_ac: { partes: [DC('V1', '2.5', '1'), DC('V2', '-2.5', '2'), AC('V3', '0.03', '100000', '3'), R('R1', '1k', '3', '4'), R('R2', '10k', '4', '5'), R('R3', '10k', '5', '0'), AO('MCP6002', '0', '4', '5', '1', '2')], fin: 3e-05, hmax: 1.25e-08, tolT: 1.25e-08 },
  ao_mcp6002_pulso: { partes: [DC('V1', '2.5', '1'), DC('V2', '-2.5', '2'), PULSO('V3', '2', '50000', '3'), R('R1', '10k', '4', '0'), AO('MCP6002', '3', '4', '4', '1', '2')], fin: 4e-05, hmax: 4e-09, tolT: 4e-09 },
  ao_op27_ac: { partes: [DC('V1', '15', '1'), DC('V2', '-15', '2'), AC('V3', '0.05', '800k', '3'), R('R1', '1k', '3', '4'), R('R2', '10k', '4', '5'), R('R3', '10k', '5', '0'), AO('OP27', '0', '4', '5', '1', '2')], fin: 3.75e-06, hmax: 1.5625e-09, tolT: 1.5625e-09 },
  ao_op27_pulso: { partes: [DC('V1', '15', '1'), DC('V2', '-15', '2'), PULSO('V3', '5', '100000', '3'), R('R1', '10k', '4', '0'), AO('OP27', '3', '4', '4', '1', '2')], fin: 2e-05, hmax: 2e-09, tolT: 2e-09 },
  comp_lm339_seno: { partes: [DC('V1', '5', '1'), AC('V3', '10m', '10k', '4'), DC('V8', '5', '8'), R('RL', '5.1k', '8', '5'), CMP('LM339', '4', '0', '5', '1')], fin: 150e-6, hmax: 5e-8, tolT: 5e-8 },
  comp_lm339_pulso: { partes: [DC('V1', '5', '1'), DC('V4', '2.5', '4'), PULSO('V3', '5', '50k', '3'), DC('V8', '5', '8'), R('RL', '5.1k', '8', '5'), CMP('LM339', '4', '3', '5', '1')], fin: 40e-6, hmax: 1e-8, tolT: 2e-8 },
  diodo_1n4001: { partes: [DC('V1', '5', '1'), R('R1', '4.1', '1', '2'), { tipo: 'diodo', ref: 'D1', props: { modelo: '1N4001' }, pines: { A: '2', K: '0' } }], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  diodo_1n4001_ruptura: { partes: [DC('V1', '60', '1'), R('R1', '1k', '1', '2'), { tipo: 'diodo', ref: 'D1', props: { modelo: '1N4001' }, pines: { A: '0', K: '2' } }], fin: 1e-3, hmax: 1e-5, corrientes: { 'i(v1)': 'V1' } },
  reg_7809_arranque: { partes: [DC('V1', '15', 'in'), R('RL', '18', 'out', '0'), C('C1', '10u', 'out', '0'), REG('regulador-positivo', '7809', 'in', 'out', '0')], fin: 12e-3, hmax: 5e-6, tolT: 5e-6, corrientes: { 'i(v1)': 'V1' } },
  reg_7815_arranque: { partes: [DC('V1', '23', 'in'), R('RL', '30', 'out', '0'), C('C1', '10u', 'out', '0'), REG('regulador-positivo', '7815', 'in', 'out', '0')], fin: 12e-3, hmax: 5e-6, tolT: 5e-6, corrientes: { 'i(v1)': 'V1' } },
  reg_7912_arranque: { partes: [DC('V1', '-19', 'in'), R('RL', '24', 'out', '0'), C('C1', '10u', 'out', '0'), REG('regulador-negativo', '7912', 'in', 'out', '0')], fin: 12e-3, hmax: 5e-6, tolT: 5e-6, corrientes: { 'i(v1)': 'V1' } },
  reg_7915_arranque: { partes: [DC('V1', '-23', 'in'), R('RL', '30', 'out', '0'), C('C1', '10u', 'out', '0'), REG('regulador-negativo', '7915', 'in', 'out', '0')], fin: 12e-3, hmax: 5e-6, tolT: 5e-6, corrientes: { 'i(v1)': 'V1' } },
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
  },
  // La TL431 con K unido a REF con 10 mA y con 1 mA (los puntos de la hoja), y como regulador de 5 V con divisor de 10 k, en punto de
  // operación y con una alimentación de pulsos.
  tl431_vref: { partes: [DC('V1', '12', 'vcc'), R('R1', '950', 'vcc', 'k'), TL431('k', '0', 'k')], fin: 0.2, hmax: 1e-4, corrientes: { 'i(v1)': 'V1' } },
  tl431_1ma: { partes: [DC('V1', '12', 'vcc'), R('R1', '9.5k', 'vcc', 'k'), TL431('k', '0', 'k')], fin: 0.2, hmax: 1e-4, corrientes: { 'i(v1)': 'V1' } },
  tl431_regulador: { partes: [DC('V1', '12', 'vcc'), R('R1', '470', 'vcc', 'k'), R('R2', '10k', 'k', 'ref'), R('R3', '10k', 'ref', '0'), R('RL', '1k', 'k', '0'), TL431('k', '0', 'ref')], fin: 0.2, hmax: 1e-4, corrientes: { 'i(v1)': 'V1' } },
  tl431_pulso: {
    partes: [{ tipo: 'fuente-pulso', ref: 'V1', props: { alto: '12', frecuencia: '1k', ciclo: '50 %' }, pines: { '+': 'vcc', '-': '0' } }, R('R1', '470', 'vcc', 'k'), R('R2', '10k', 'k', 'ref'), R('R3', '10k', 'ref', '0'), R('RL', '1k', 'k', '0'), TL431('k', '0', 'ref')],
    fin: 3e-3,
    hmax: 2e-7,
    tolT: 2e-6,
    corrientes: { 'i(v1)': 'V1' }
  },
  // La LM4040 de cada voltaje con la corriente de prueba de la hoja (100 µA, 150 µA con 10 V), con 1 mA y con una alimentación de pulsos.
  lm4040_2v048: lm4040('2.048 V', '12', '99k'),
  lm4040_2v5: lm4040('2.5 V', '12', '95k'),
  lm4040_2v5_1ma: lm4040('2.5 V', '12', '9.5k'),
  lm4040_3v: lm4040('3 V', '12', '90k'),
  lm4040_4v096: lm4040('4.096 V', '12', '79.04k'),
  lm4040_5v: lm4040('5 V', '12', '70k'),
  lm4040_10v: lm4040('10 V', '15', '33.33k'),
  lm4040_pulso: {
    partes: [{ tipo: 'fuente-pulso', ref: 'V1', props: { alto: '12', frecuencia: '1k', ciclo: '50 %' }, pines: { '+': 'vcc', '-': '0' } }, R('R1', '1k', 'vcc', 'k'), LM4040('2.5 V', 'k', '0')],
    fin: 3e-3,
    hmax: 2e-7,
    tolT: 2e-6,
    corrientes: { 'i(v1)': 'V1' }
  },
  // El INA128 con ganancia 1, 10 y 100, el rechazo de modo común, el ancho de banda y la velocidad de subida.
  ina128_g1: { partes: [...INA_FUENTES, DC('V3', '1', 'inm'), DC('V4', '2', 'inp'), INA128(null)], fin: 0.2, hmax: 1e-4, corrientes: { 'i(v1)': 'V1' } },
  ina128_g10: { partes: [...INA_FUENTES, DC('V3', '0.25', 'inm'), DC('V4', '0.75', 'inp'), R('RG', '5.556k', 'rg1', 'rg2'), INA128('rg')], fin: 0.2, hmax: 1e-4, corrientes: { 'i(v1)': 'V1' } },
  ina128_g100: { partes: [...INA_FUENTES, DC('V3', '0.075', 'inm'), DC('V4', '0.125', 'inp'), R('RG', '505.1', 'rg1', 'rg2'), INA128('rg')], fin: 0.2, hmax: 1e-4, corrientes: { 'i(v1)': 'V1' } },
  ina128_modo_comun: { partes: [...INA_FUENTES, DC('V3', '10', 'inm'), DC('V4', '10', 'inp'), INA128(null)], fin: 0.2, hmax: 1e-4, corrientes: { 'i(v1)': 'V1' } },
  ina128_g100_senoidal: {
    partes: [...INA_FUENTES, DC('V3', '0', 'inm'), AC('V4', '20m', '200k', 'inp'), R('RG', '505.1', 'rg1', 'rg2'), INA128('rg')],
    fin: 20e-6,
    hmax: 20e-9,
    tolT: 20e-9,
    corrientes: { 'i(v1)': 'V1' }
  },
  ina128_g10_pulso: {
    partes: [...INA_FUENTES, DC('V3', '0', 'inm'), { tipo: 'fuente-pulso', ref: 'V4', props: { alto: '1', frecuencia: '20k', ciclo: '50 %', retardo: '1u' }, pines: { '+': 'inp', '-': '0' } }, R('RG', '5.556k', 'rg1', 'rg2'), INA128('rg')],
    fin: 50e-6,
    hmax: 10e-9,
    tolT: 20e-9,
    corrientes: { 'i(v1)': 'V1' }
  },
  // El LM386 en reposo (salida en la mitad de la alimentación y corriente en reposo), con ganancia 20 y con 10 µF entre las
  // patillas 1 y 8 sobre una bocina de 8 Ω con 250 µF, y recortando.
  lm386_reposo: { partes: [DC('V1', '6', 'vs'), R('RX', '1G', 'out', '0'), LM386('0', 'byp')], fin: 0.1, hmax: 1e-4, corrientes: { 'i(v1)': 'V1' } },
  lm386_g20: { partes: [DC('V1', '6', 'vs'), AC('V3', '10m', '1k', 'inp'), C('CO', '250u', 'out', 'rl'), R('RL', '8', 'rl', '0'), LM386('inp', 'byp')], fin: 6e-3, hmax: 2e-6, tolT: 2e-6, corrientes: { 'i(v1)': 'V1' } },
  lm386_g200: { partes: [DC('V1', '6', 'vs'), AC('V3', '1m', '1k', 'inp'), C('CG', '10u', 'g1', 'g8'), C('CO', '250u', 'out', 'rl'), R('RL', '8', 'rl', '0'), LM386('inp', 'byp', true)], fin: 0.1, hmax: 5e-6, tolT: 5e-6, corrientes: { 'i(v1)': 'V1' } },
  lm386_recorte: { partes: [DC('V1', '6', 'vs'), AC('V3', '0.3', '1k', 'inp'), C('CO', '250u', 'out', 'rl'), R('RL', '8', 'rl', '0'), LM386('inp', 'byp')], fin: 6e-3, hmax: 2e-6, tolT: 2e-6, corrientes: { 'i(v1)': 'V1' } },
  // La punta lógica de cada familia con la punta sobre la pinza +, en tierra y al aire (la corriente de la fuente suma las luces), y con una rampa que cruza los dos umbrales.
  punta_cmos_alto: punta('CMOS', 'vcc'),
  punta_cmos_bajo: punta('CMOS', '0'),
  punta_cmos_aire: punta('CMOS', 'p'),
  punta_ttl_alto: punta('TTL', 'vcc'),
  punta_ttl_bajo: punta('TTL', '0'),
  punta_ttl_aire: punta('TTL', 'p'),
  punta_cmos_rampa: punta('CMOS', 'p', true),
  punta_ttl_rampa: punta('TTL', 'p', true)
}
