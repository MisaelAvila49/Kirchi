import type { ElementoMotor, NucleoMsi } from '../../../compartido/netlistMotor'
import { compilarTabla, type TablaDef } from '../piezas/tablaVerdad'
import type { ModeloDef } from '../piezas/tipos'
import type { TerminalPuente } from './puenteH'

/** El ADC0804 y el DAC0808 con elementos del motor: puentes de entrada y salida, el `DACM`, el núcleo de aproximaciones y,
 * para el reloj, la lectura de la R y la C que el estudiante conecta. Lo que `compilarNetlist` le da está en `ArmadoConvertidor`. */

export type ModeloAd = Extract<ModeloDef, { tipo: 'convertidor-ad' }>
export type ModeloDa = Extract<ModeloDef, { tipo: 'convertidor-da' }>

export interface ArmadoBase {
  /** Referencia de la pieza («U1»), para los avisos. */
  ref: string
  red: (pin: string) => number
  /** La oración «El pin X de U1»; cada pin la dice una sola vez para que «no está conectado a nada» siga viendo la red. */
  etiqueta: (pin: string) => string
  nuevaDigital: () => number
  /** Una red analógica interna de la pieza (ningún pin la toca). */
  interna: () => number
  analogico: (terminales: TerminalPuente[], el: (nodos: number[]) => ElementoMotor, grupos: { pines: number[]; tierra: boolean }[]) => void
  digital: (el: ElementoMotor) => void
  manejo: (red: number, digital: number) => void
}

export interface ArmadoConvertidor extends ArmadoBase {
  /** Valores (Ω) de las resistencias que unen directo las dos redes. */
  resistenciasEntre: (a: number, b: number) => number[]
  /** Valores (F) de los capacitores que unen directo la red con la tierra. */
  capacitoresATierra: (red: number) => number[]
  /** Algo más que la R y la C toca la red de CLK IN (un oscilador, un generador, una salida lógica). */
  relojExterno: (red: number) => boolean
  /** El voltaje de una red unida a tierra por una fuente de continua, si es el caso (da el medio LSB de la primera transición). */
  voltajeFijo: (red: number) => number | undefined
}

/** El reloj del ADC: el RC de la hoja o uno externo. */
export type RelojAdc = { tipo: 'rc'; hz: number; r: number; c: number } | { tipo: 'externo' }

/** La alimentación de la figura de la hoja con la que se da la frecuencia del oscilador RC. */
const VCC_RELOJ = 5
/** Tiempo de subida y de bajada de las salidas del ADC y del DAC, que la hoja no da: el de una familia CMOS rápida. */
const T_TRANSICION = 20e-9
/** Retardo de los bits de prueba hacia el `DACM`: el convertidor interno no tiene tiempo de propagación propio. */
const RETARDO_PRUEBA = 1e-9
/** Histéresis del comparador (V): mucho menor que 1 LSB (19.5 mV a 5 V) para que decida con el voltaje de su instante. */
/** Resistencia de una entrada que no toma corriente (el 1 GΩ de un contacto abierto). */
const R_ENTRADA_ALTA = 1e9
const HISTERESIS_COMPARADOR = 0.1e-3
/** VREF/2 con el pin al aire: la mitad de VCC, y 5 V si VCC tampoco viene de una fuente de continua. */
const VCC_NOMINAL = 5

/** Frecuencia del oscilador de la hoja TI SNOSBI1C, f = 1/(R C ln[((VCC - VT-)/(VCC - VT+)) (VT+/VT-)]), con R y C conectadas. */
export function frecuenciaDelReloj(r: number, c: number, vtp: number, vtn: number): number {
  return 1 / (r * c * Math.log(((VCC_RELOJ - vtn) / (VCC_RELOJ - vtp)) * (vtp / vtn)))
}

const paralelo = (ohms: number[]) => 1 / ohms.reduce((acc, r) => acc + 1 / r, 0)

/** La tabla de salida del núcleo: DB0 a DB7 y INTR. Con CS y RD en bajo los datos salen y INTR sube; si no, los datos
 * quedan en Z e INTR baja mientras haya un dato sin leer (bandera). Columnas: cs, rd, bandera y q0 a q7. */
function tablaDeSalida(): { tabla: TablaDef; filas: number[] } {
  const bits = Array.from({ length: 8 }, (_, k) => `q${k}`)
  const equis = 'X X X X X X X X'
  const z = 'Z Z Z Z Z Z Z Z'
  const tabla: TablaDef = {
    columnas: ['cs', 'rd', 'bandera', ...bits],
    salidas: ['DB0', 'DB1', 'DB2', 'DB3', 'DB4', 'DB5', 'DB6', 'DB7', 'INTR'],
    filas: [`0 0 X ${equis} > ${bits.join(' ')} 1`, `1 X 0 ${equis} > ${z} 1`, `1 X 1 ${equis} > ${z} 0`, `X 1 0 ${equis} > ${z} 1`, `X 1 1 ${equis} > ${z} 0`]
  }
  const r = compilarTabla(tabla, [...tabla.columnas, ...tabla.salidas], {})
  if (r.errores.length) throw new Error(`tabla del ADC0804: ${r.errores.join('; ')}`)
  return { tabla, filas: (r.filas as (number | bigint)[]).map((f) => Number(f)) }
}

const tablaSalida = tablaDeSalida()

/** El ADC0804. Devuelve el reloj que encontró o el error que impide simular. */
export function armarAdc0804(m: ModeloAd, a: ArmadoConvertidor, tabla: (filas: (number | string)[]) => number): { reloj: RelojAdc } | { error: string } {
  const dicho = new Set<string>()
  /** `mudo`: un pin que puede quedar libre (las salidas) y no se reporta suelto. */
  const terminal = (pin: string, mudo = false): TerminalPuente => {
    const primera = !dicho.has(pin)
    dicho.add(pin)
    return { red: a.red(pin), etiqueta: primera && !mudo ? a.etiqueta(pin) : '', pin, ...(mudo ? { mudo: true as const } : {}) }
  }
  const unidos = [{ pines: [0, 1], tierra: false }]

  // Reloj: externo si algo más que la R y la C toca CLK IN; si no, el RC; si no, no se puede simular.
  const redIn = a.red(m.clkin)
  const rs = a.resistenciasEntre(a.red(m.clkr), redIn)
  const caps = a.capacitoresATierra(redIn)
  let reloj: RelojAdc
  if (a.relojExterno(redIn)) reloj = { tipo: 'externo' }
  else if (rs.length && caps.length) {
    const r = paralelo(rs), c = caps.reduce((x, y) => x + y, 0)
    reloj = { tipo: 'rc', hz: frecuenciaDelReloj(r, c, m.vtp, m.vtn), r, c }
  } else return { error: `${a.ref} no tiene reloj: une una resistencia entre CLK R y CLK IN y un capacitor de CLK IN a tierra, o lleva un reloj a CLK IN.` }

  /** Una entrada referida a DGND que lee un nivel con los umbrales dados. */
  const entrada = (pin: string, bajo: number, alto: number, histeresis = false): number => {
    const red = a.nuevaDigital()
    // Una entrada atada a DGND lee 0 sin puente (el motor no admite un puente con sus dos extremos en el mismo nodo).
    if (a.red(pin) === a.red(m.dgnd)) {
      a.digital({ type: 'LOGIC', out: red, value: 0 })
      return red
    }
    a.analogico([terminal(pin), terminal(m.dgnd)], ([p, n]) => ({ type: 'ADC', p, n, out: red, in_low: bajo, in_high: alto, ...(histeresis ? { histeresis: true } : {}) }), unidos)
    return red
  }
  const [cs_, rd, wr] = [m.cs, m.rd, m.wr].map((p) => entrada(p, m.vil, m.vih))
  const clk = reloj.tipo === 'externo' ? entrada(m.clkin, m.vtn, m.vtp, true) : null
  // CLK R (y CLK IN con el RC) son entradas de alta impedancia: un 1 GΩ a DGND las deja como conexión sin cargar la R y la C.
  a.analogico([terminal(m.clkr, true), terminal(m.dgnd)], ([x, y]) => ({ type: 'R', a: x, b: y, ohms: R_ENTRADA_ALTA }), unidos)
  if (reloj.tipo === 'rc') a.analogico([terminal(m.clkin, true), terminal(m.dgnd)], ([x, y]) => ({ type: 'R', a: x, b: y, ohms: R_ENTRADA_ALTA }), unidos)

  // VREF/2: dos resistencias iguales de VCC a VREF/2 y de VREF/2 a AGND (abierta da VCC/2; una fuente la reemplaza).
  a.analogico([terminal(m.vcc), terminal(m.vref2, true)], ([x, y]) => ({ type: 'R', a: x, b: y, ohms: m.rref }), unidos)
  a.analogico([terminal(m.vref2, true), terminal(m.agnd)], ([x, y]) => ({ type: 'R', a: x, b: y, ohms: m.rref }), unidos)

  // Convertidor interno: referencia 2 V(VREF/2), DACM en voltaje respecto de VIN- y comparador contra VIN+.
  const ref = a.interna(), salidaDac = a.interna()
  a.analogico([{ red: ref, etiqueta: '' }, terminal(m.agnd, true), terminal(m.vref2, true), terminal(m.agnd, true)], ([p, n, cp, cn]) => ({ type: 'E', p, n, cp, cn, ganancia: 2 }), unidos)
  const prueba = Array.from({ length: 8 }, () => a.nuevaDigital())
  a.analogico(
    [{ red: salidaDac, etiqueta: '' }, terminal(m.vinn), { red: ref, etiqueta: '' }, terminal(m.agnd, true)],
    ([out, ret, ref_p, ref_n]) => ({ type: 'DACM', modo: 'voltaje', out, ret, ref_p, ref_n, bits: prueba, t_asentamiento: T_TRANSICION }),
    unidos
  )
  // El código n empieza en (n - 1/2) LSB: el umbral del comparador baja medio LSB, que sale del VREF/2 que tenga el circuito al compilar.
  const vref2 = a.voltajeFijo(a.red(m.vref2)) ?? (a.voltajeFijo(a.red(m.vcc)) ?? VCC_NOMINAL) / 2
  const medioLsb = Math.abs(vref2) / 256
  const comparador = a.nuevaDigital()
  a.analogico([terminal(m.vinp), { red: salidaDac, etiqueta: '' }], ([p, n]) => ({ type: 'ADC', p, n, out: comparador, in_low: -medioLsb - HISTERESIS_COMPARADOR / 2, in_high: -medioLsb + HISTERESIS_COMPARADOR / 2, histeresis: true }), [])

  // Control: el núcleo de aproximaciones y su tabla de salida.
  const senal = (entrada: number, bajo = false) => ({ entrada, ...(bajo ? { bajo: true } : {}) })
  const entradas = [cs_, wr, rd, comparador, ...(clk !== null ? [clk] : [])]
  const nucleo: NucleoMsi = {
    tipo: 'aproximaciones', bits: 8, cs: senal(0, true), wr: senal(1, true), rd: senal(2, true), comparador: 3,
    reloj: reloj.tipo === 'rc' ? { tipo: 'interno', periodo: 1 / reloj.hz } : { tipo: 'externo', senales: [senal(4)], flanco: 'subida' },
    ciclos_inicio: m.ciclos_inicio, ciclos_bit: m.ciclos_bit
  }
  const datos = m.db.map(() => a.nuevaDigital())
  const intr = a.nuevaDigital()
  const { filas } = tablaSalida
  a.digital({
    type: 'MSI', entradas, salidas: [...prueba, ...datos, intr], nucleo,
    de: [
      ...Array.from({ length: 8 }, (_, k): { tipo: 'directa'; fuente: { aux: number } } => ({ tipo: 'directa', fuente: { aux: 7 - k } })),
      ...Array.from({ length: 9 }, (_, k): { tipo: 'tabla'; columna: number } => ({ tipo: 'tabla', columna: k }))
    ],
    // Columnas de la tabla: CS, RD, la bandera de fin de conversión y los ocho bits del resultado (q0 a q7).
    fuentes: [{ entrada: 0 }, { entrada: 2 }, { bandera: 0 }, ...Array.from({ length: 8 }, (_, k) => ({ bit: k }))],
    tabla: tabla(filas),
    retardos: [...prueba.map((): [number, number] => [RETARDO_PRUEBA, RETARDO_PRUEBA]), ...datos.map((): [number, number] => [m.t_acceso, m.t_acceso]), [m.t_intr, m.t_intr]],
    z_como: 'x'
  })

  // Salidas DB0 a DB7 (Z sin CS y RD) e INTR: puentes con los niveles de la hoja y sus resistencias derivadas.
  const salida = (pin: string, interna: number, z: boolean) => {
    a.analogico(
      [terminal(pin, true), terminal(m.dgnd)],
      ([out, lo]) => ({ type: 'DAC', input: interna, out, lo, v_lo: m.vol, v_hi: m.voh, r_lo: m.r_lo, r_hi: m.r_hi, t_rise: T_TRANSICION, t_fall: T_TRANSICION, ...(z ? { z: true } : {}) }),
      unidos
    )
    a.manejo(a.red(pin), interna)
  }
  m.db.forEach((pin, k) => salida(pin, datos[k], true))
  salida(m.intr, intr, false)
  return { reloj }
}

/** El DAC0808: ocho entradas con los umbrales de la hoja y un `DACM` en corriente de IO a VEE. */
export function armarDac0808(m: ModeloDa, a: ArmadoBase): void {
  const dicho = new Set<string>()
  const terminal = (pin: string, mudo = false): TerminalPuente => {
    const primera = !dicho.has(pin)
    dicho.add(pin)
    return { red: a.red(pin), etiqueta: primera && !mudo ? a.etiqueta(pin) : '', pin, ...(mudo ? { mudo: true as const } : {}) }
  }
  const bits = m.a.map((pin) => {
    const red = a.nuevaDigital()
    if (a.red(pin) === a.red(m.gnd)) {
      a.digital({ type: 'LOGIC', out: red, value: 0 })
      return red
    }
    // Una entrada sin conectar lee 0 por la fuga del nodo: no se reporta suelta.
    a.analogico([terminal(pin, true), terminal(m.gnd)], ([p, n]) => ({ type: 'ADC', p, n, out: red, in_low: m.vil, in_high: m.vih }), [])
    return red
  })
  // La corriente entra por IO y sale por VEE, k veces la de la rama de referencia (de VREF+ a una red interna que un seguidor mantiene
  // al voltaje de VREF-): VREF- solo se mide, como en el chip, así que una R15 hacia tierra no resta corriente a la referencia.
  const refN = a.interna()
  a.analogico(
    [terminal(m.io), terminal(m.vee), terminal(m.vrefp), { red: refN, etiqueta: '' }, terminal(m.vcc)],
    ([out, ret, ref_p, ref_n]) => ({ type: 'DACM', modo: 'corriente', out, ret, ref_p, ref_n, bits, t_asentamiento: m.t_asentamiento }),
    [{ pines: [2, 3], tierra: false }]
  )
  a.analogico([{ red: refN, etiqueta: '' }, terminal(m.vee), terminal(m.vrefn), terminal(m.vee)], ([p, n, cp, cn]) => ({ type: 'E', p, n, cp, cn, ganancia: 1 }), [{ pines: [0, 1], tierra: false }])
  // COMPENSACIÓN es una patilla de alta impedancia (1 GΩ a tierra, que deja conectado el capacitor de la hoja): no cambia la simulación.
  a.analogico([terminal(m.comp, true), terminal(m.gnd, true)], ([x, y]) => ({ type: 'R', a: x, b: y, ohms: R_ENTRADA_ALTA }), [{ pines: [0, 1], tierra: false }])
}
