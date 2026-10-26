// Tipos de la netlist del motor (el JSON de `engine/src/netlist.rs`), compartidos por la interfaz y el proceso principal
// (el exportador a SPICE corre en los dos). Solo tipos, salvo la lista de tipos de elemento.

/** Parámetros de un modelo de SPICE tal como los lee el motor (nombres de ngspice). */
export type Parametros = Record<string, number>

export type Onda =
  | { kind: 'dc'; v: number }
  /** `phase`: fracción del ciclo en t = 0; `continua`: el generador, que conserva la fase en un cambio en caliente. */
  | { kind: 'sine'; offset: number; amp: number; freq: number; phase?: number; continua?: boolean }
  | { kind: 'square'; low: number; high: number; freq: number; duty: number }
  /** Pulso de SPICE: la cuadrada con flancos, la triangular y el diente de sierra del generador. */
  | { kind: 'pulse'; low: number; high: number; freq: number; rise: number; fall: number; width: number; phase?: number; continua?: boolean }
  /** Escalera del generador: `steps` niveles iguales de `low` a `high` por periodo. */
  | { kind: 'stair'; low: number; high: number; freq: number; steps: number; phase?: number; continua?: boolean }

export type ElementoMotor =
  | { type: 'R'; a: number; b: number; ohms: number }
  | { type: 'C'; a: number; b: number; farads: number }
  | { type: 'L'; a: number; b: number; henries: number }
  | { type: 'V'; a: number; b: number; wave: Onda }
  /** Diodo; el zener lleva además su resistencia en serie, su ruptura y su capacitancia. */
  | { type: 'D'; a: number; b: number; is: number; n: number; rs?: number; bv?: number; ibv?: number; nbv?: number; cjo?: number; vj?: number; m?: number; tt?: number; fc?: number }
  | { type: 'I'; a: number; b: number; amps: number }
  | { type: 'Q'; c: number; b: number; e: number; pnp: boolean; model: Parametros }
  | { type: 'M'; d: number; g: number; s: number; pmos: boolean; model: Parametros }
  | { type: 'OA'; p: number; n: number; out: number; vp: number; vn: number; model: Parametros }
  | { type: 'LAMP'; a: number; b: number; rfrio: number; k: number; pnom: number; tau: number }
  | { type: 'MOTOR'; a: number; b: number; r: number; l: number; ke: number; j: number; bm: number }
  /** `v`: la fuente en serie (el multímetro); sin ella, un fusible. */
  | { type: 'FUSE'; a: number; b: number; ohms: number; inom: number; ifusion: number; tau: number; v?: number; sin_carga?: boolean }
  /** La fuente de laboratorio de dos tramos (`engine/src/devices/fuente_lab.rs`). */
  | { type: 'PSU'; a: number; b: number; v: number; ilim: number; vk: number; encendida: boolean }
  /** Dos inductores acoplados (el transformador): `l1` y `l2` en H y `k` el coeficiente de acoplamiento; el punto es `a1` y `a2`. */
  | { type: 'XFMR'; a1: number; b1: number; a2: number; b2: number; l1: number; l2: number; k: number }
  | { type: 'RELAY'; a1: number; a2: number; com: number; na: number; nc: number; r: number; l: number; ion: number; ioff: number }
  /** El zumbador, una resistencia que suena desde `umbral` volts (el motor registra cada cruce). */
  | { type: 'BUZZER'; a: number; b: number; ohms: number; umbral: number }
  /** Los elementos digitales leen y manejan redes digitales (de 0 a `digital_nets` - 1), que no son nodos. */
  | { type: 'GATE'; fn: 'not' | 'and' | 'or' | 'nand' | 'nor' | 'xor'; inputs: number[]; output: number; rise_delay: number; fall_delay: number; z_como: 'x' | 'uno' }
  | { type: 'LOGIC'; out: number; value: 0 | 1 }
  | { type: 'DFF'; d: number; clk: number; pre: number; clr: number; q: number; qn: number; rise_delay: number; fall_delay: number; z_como: 'x' | 'uno' }
  | { type: 'JKFF'; j: number; k: number; clk: number; pre: number; clr: number; q: number; qn: number; rise_delay: number; fall_delay: number; z_como: 'x' | 'uno' }
  | { type: 'COUNTER'; clk: number; rst: number; q: number[]; co: number; modulo: 10 | 16; rise_delay: number; fall_delay: number; z_como: 'x' | 'uno' }
  | { type: 'DECODER'; inputs: number[]; outputs: number[]; activo_alto: boolean; rise_delay: number; fall_delay: number; z_como: 'x' | 'uno' }
  | { type: 'LATCH555'; trig: number; thr: number; res: number; q: number; delay: number }
  /** Puentes: un nodo analógico y una red digital. */
  | { type: 'ADC'; p: number; n: number; out: number; in_low: number; in_high: number; r_in?: number; v_in?: number }
  /** `lo` y `hi`: las alimentaciones explícitas del puente (sin ellas, la implícita por pieza). */
  | { type: 'DAC'; input: number; out: number; lo?: number; hi?: number; v_lo: number; v_hi: number; r_lo: number; r_hi: number; t_rise: number; t_fall: number }
  | { type: 'OUT555'; q: number; out: number; dis: number; vcc: number; gnd: number; v_lo: number; r_lo: number; v_hi: number; r_hi: number; g_on: number; g_off: number; t_rise: number; t_fall: number }

/** Todos los tipos de `ElementoMotor`. El objeto exige una llave por tipo (si falta o sobra una no compila), y de ahí las pruebas exigen que el exportador a ngspice y `nodosDeElemento` conozcan cada elemento. */
const TIPOS: Record<ElementoMotor['type'], true> = {
  R: true, C: true, L: true, V: true, D: true, I: true, Q: true, M: true, OA: true, LAMP: true, MOTOR: true, FUSE: true, PSU: true,
  XFMR: true, RELAY: true, BUZZER: true, GATE: true, LOGIC: true, DFF: true, JKFF: true, COUNTER: true, DECODER: true, LATCH555: true,
  ADC: true, DAC: true, OUT555: true
}
export const TIPOS_ELEMENTO = Object.keys(TIPOS) as ElementoMotor['type'][]

/** Lo que una sonda pide al motor (el JSON de `SondaDef` en `engine/src/netlist.rs`). */
export type SondaMotor =
  | { kind: 'v'; p: number; n: number; muestras: number; columna: number; sin_rejilla?: boolean }
  | { kind: 'i'; element: number; signo: number; muestras: number; columna: number; sin_rejilla?: boolean }
  | { kind: 'd'; red: number; bajo: number; alto: number; muestras: number; columna: number }

export interface NetlistMotor {
  nodes: number
  /** Redes digitales; sin lógica, 0. */
  digital_nets?: number
  elements: ElementoMotor[]
  /** Sondas de los instrumentos; sin instrumentos, el campo no va. */
  sondas?: SondaMotor[]
}
