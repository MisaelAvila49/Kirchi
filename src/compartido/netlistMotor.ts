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
  /** Valor por tramos: pares `[t, valor]` con tiempos crecientes desde 0 (hasta 1,000); con `repetir`, el periodo es el último tiempo. */
  | { kind: 'pwl'; puntos: [number, number][]; repetir?: boolean }

/** Una señal de control de un `MSI`: la entrada `entrada` (índice en las `entradas` del elemento), activa en bajo si `bajo`. */
export interface SenalMsi {
  entrada: number
  bajo?: boolean
}

/** Reloj efectivo: la Y (por omisión) o la O de sus señales y el flanco (de subida por omisión) del resultado que dispara. */
export interface RelojMsi {
  senales: SenalMsi[]
  combina?: 'Y' | 'O'
  flanco?: 'subida' | 'bajada'
}

export interface AccionMsi {
  senal: SenalMsi
  sincrona?: boolean
}

/** Carga paralela: `datos` son índices en las `entradas`, el bit 0 primero. */
export interface CargaMsi {
  senal: SenalMsi
  sincrona?: boolean
  datos: number[]
}

/** El núcleo de estado de un `MSI` (`Nucleo` en `engine/src/netlist.rs`). */
export type NucleoMsi =
  | { tipo: 'contador'; bits: number; modulo: number; reloj: RelojMsi; abajo?: RelojMsi; sentido?: SenalMsi; habilita?: SenalMsi[]; borra?: AccionMsi; carga?: CargaMsi }
  | { tipo: 'desplazamiento'; bits: number; reloj: RelojMsi; serie?: SenalMsi[]; borra?: AccionMsi; carga?: CargaMsi; almacen?: RelojMsi }
  | {
      tipo: 'aproximaciones'
      bits: number
      cs: SenalMsi
      wr: SenalMsi
      rd: SenalMsi
      /** Índice en las `entradas` de la que da el resultado de cada comparación. */
      comparador: number
      reloj: { tipo: 'interno'; periodo: number } | ({ tipo: 'externo' } & RelojMsi)
      ciclos_inicio: number
      ciclos_bit: number
    }

/** De dónde toma un valor la etapa de salida: una entrada, un bit del registro principal, uno del auxiliar o una bandera. */
export type FuenteMsi = { entrada: number } | { bit: number } | { aux: number } | { bandera: number }

export type SalidaMsi = { tipo: 'directa'; fuente: FuenteMsi; negada?: boolean } | { tipo: 'tabla'; columna: number }

export type ElementoMotor =
  | { type: 'R'; a: number; b: number; ohms: number }
  /** `ic`: voltaje inicial de `a` a `b`; sin él, parte descargado. */
  | { type: 'C'; a: number; b: number; farads: number; ic?: number }
  /** `ic`: corriente inicial de `a` a `b`; sin ella, parte en 0. */
  | { type: 'L'; a: number; b: number; henries: number; ic?: number }
  | { type: 'V'; a: number; b: number; wave: Onda }
  /** Diodo; el zener lleva además su resistencia en serie, su ruptura y su capacitancia. */
  | { type: 'D'; a: number; b: number; is: number; n: number; rs?: number; bv?: number; ibv?: number; nbv?: number; cjo?: number; vj?: number; m?: number; tt?: number; fc?: number }
  /** Con `wave`, la corriente sigue la onda (en amperes) y `amps` no cuenta. */
  | { type: 'I'; a: number; b: number; amps: number; wave?: Onda }
  | { type: 'Q'; c: number; b: number; e: number; pnp: boolean; model: Parametros; euler?: boolean }
  | { type: 'M'; d: number; g: number; s: number; pmos: boolean; model: Parametros }
  | { type: 'OA'; p: number; n: number; out: number; vp: number; vn: number; model: Parametros; euler?: boolean }
  /** JFET de nivel 1; `pjf` es el de canal P. */
  | { type: 'J'; d: number; g: number; s: number; pjf: boolean; model: Parametros }
  /** Fuentes controladas: voltaje por voltaje (`E`), corriente por voltaje (`G`, `gm` en S), voltaje por corriente (`H`, `r` en Ω) y corriente por corriente (`F`). El control es `cp` y `cn`. */
  | { type: 'E'; p: number; n: number; cp: number; cn: number; ganancia: number }
  | { type: 'G'; p: number; n: number; cp: number; cn: number; gm: number }
  | { type: 'H'; p: number; n: number; cp: number; cn: number; r: number }
  | { type: 'F'; p: number; n: number; cp: number; cn: number; ganancia: number }
  /** Termistor: `r25` a 25 °C con `beta` (K) o con la tabla `rt` de pares `[°C, Ω]`, disipación `delta` (W/K), constante térmica `tau` (s), ambiente del `canal` y quema a `tmax` (°C). */
  | { type: 'TERM'; a: number; b: number; tipo: 'ntc' | 'ptc'; r25: number; beta: number; rt?: [number, number][]; delta: number; tau: number; canal: number; tmax: number }
  /** Fotorresistencia: `r10` (Ω) a 10 lx con pendiente `gamma`, tope `roscuro` y constantes `tau_sube` y `tau_baja` (s); la luz sale del `canal`. */
  | { type: 'LDR'; a: number; b: number; r10: number; gamma: number; roscuro: number; tau_sube: number; tau_baja: number; canal: number }
  /** Motor a pasos de dos fases: 4 `nodos` (bipolar) o 6 (unipolar). Sin `k_mutua` vale 0.99 y sin `reduccion`, 1. */
  | { type: 'PASOS'; nodos: number[]; unipolar?: boolean; r: number; l: number; k_mutua?: number; km: number; dientes: number; td: number; j: number; bm: number; canal_carga?: number; reduccion?: number }
  /** Fuente de valor externo: `k` por el valor del `canal` más `c`, como voltaje o corriente, con resistencia `r` en serie opcional. */
  | { type: 'EXT'; a: number; b: number; modo: 'v' | 'i'; canal: number; k: number; c: number; r?: number }
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
  | { type: 'GATE'; fn: 'not' | 'and' | 'or' | 'nand' | 'nor' | 'xor' | 'xnor' | 'buf'; inputs: number[]; output: number; enable?: number; enable_bajo?: boolean; rise_delay: number; fall_delay: number; z_como: 'x' | 'uno' }
  | { type: 'LOGIC'; out: number; value: 0 | 1 }
  | { type: 'DFF'; d: number; clk: number; pre: number; clr: number; q: number; qn: number; rise_delay: number; fall_delay: number; z_como: 'x' | 'uno' }
  | { type: 'JKFF'; j: number; k: number; clk: number; pre: number; clr: number; q: number; qn: number; rise_delay: number; fall_delay: number; z_como: 'x' | 'uno' }
  | { type: 'COUNTER'; clk: number; rst: number; q: number[]; co: number; modulo: 10 | 16; rise_delay: number; fall_delay: number; z_como: 'x' | 'uno' }
  | { type: 'DECODER'; inputs: number[]; outputs: number[]; activo_alto: boolean; rise_delay: number; fall_delay: number; z_como: 'x' | 'uno' }
  | { type: 'LATCH555'; trig: number; thr: number; res: number; q: number; delay: number }
  /** Combinacional por tabla de verdad: `comunes` más las entradas de cada rebanada eligen la fila de `NetlistMotor.tablas[tabla]`. `retardos` y `abierta` van por salida de rebanada. */
  | { type: 'LUT'; comunes: number[]; rebanadas: { entradas: number[]; salidas: number[] }[]; tabla: number; retardos: [number, number][]; abierta?: boolean[]; z_como: 'x' | 'uno' }
  /** Núcleo de estado con etapa de salida: un pin bidireccional va en `entradas` y en `salidas`; `fuentes` son las entradas de la tabla de salida `tabla`. */
  | { type: 'MSI'; entradas: number[]; salidas: number[]; nucleo: NucleoMsi; de: SalidaMsi[]; fuentes?: FuenteMsi[]; tabla?: number; retardos: [number, number][]; abierta?: boolean[]; z_como: 'x' | 'uno' }
  /** Convertidor multiplicador: `bits` (el más significativo primero) escalan `ref_p` - `ref_n`; la salida va de `out` a `ret`. */
  | { type: 'DACM'; modo: 'voltaje' | 'corriente'; out: number; ret: number; ref_p: number; ref_n: number; bits: number[]; t_asentamiento: number; r_out?: number }
  /** Interruptor que sigue a su `canal`: `r_on` con el valor mayor que 0.5 y `r_off` con el resto. */
  | { type: 'INTC'; a: number; b: number; canal: number; r_on: number; r_off: number }
  /** Puentes: un nodo analógico y una red digital. */
  | { type: 'ADC'; p: number; n: number; out: number; in_low: number; in_high: number; r_in?: number; v_in?: number; histeresis?: boolean }
  /** `lo` y `hi`: las alimentaciones explícitas del puente (sin ellas, la implícita por pieza). */
  | { type: 'DAC'; input: number; out: number; lo?: number; hi?: number; v_lo: number; v_hi: number; r_lo: number; r_hi: number; t_rise: number; t_fall: number; z?: boolean }
  | { type: 'OUT555'; q: number; out: number; dis: number; vcc: number; gnd: number; v_lo: number; r_lo: number; v_hi: number; r_hi: number; g_on: number; g_off: number; t_rise: number; t_fall: number }

/** Todos los tipos de `ElementoMotor`. El objeto exige una llave por tipo (si falta o sobra una no compila), y de ahí las pruebas exigen que el exportador a ngspice y `nodosDeElemento` conozcan cada elemento. */
const TIPOS: Record<ElementoMotor['type'], true> = {
  R: true, C: true, L: true, V: true, D: true, I: true, Q: true, M: true, OA: true, LAMP: true, MOTOR: true, FUSE: true, PSU: true,
  J: true, E: true, G: true, H: true, F: true, TERM: true, LDR: true, PASOS: true, EXT: true,
  XFMR: true, RELAY: true, BUZZER: true, GATE: true, LOGIC: true, DFF: true, JKFF: true, COUNTER: true, DECODER: true, LATCH555: true,
  LUT: true, MSI: true, DACM: true, INTC: true,
  ADC: true, DAC: true, OUT555: true
}
export const TIPOS_ELEMENTO = Object.keys(TIPOS) as ElementoMotor['type'][]

/** Lo que una sonda pide al motor (el JSON de `SondaDef` en `engine/src/netlist.rs`). */
export type SondaMotor =
  | { kind: 'v'; p: number; n: number; muestras: number; columna: number; sin_rejilla?: boolean }
  | { kind: 'i'; element: number; signo: number; muestras: number; columna: number; sin_rejilla?: boolean }
  | { kind: 'd'; red: number; bajo: number; alto: number; muestras: number; columna: number }

/** Un canal de valor que mueve el exterior: salta (`escalon`, por omisión) o va en línea recta (`rampa`) al valor nuevo. */
export interface CanalMotor {
  inicial: number
  forma?: 'escalon' | 'rampa'
}

/** Una lectura en instantes exactos: el voltaje de `p` respecto de `n` o la corriente del elemento `elemento`. */
export type LectorMotor = { kind: 'v'; p: number; n: number } | { kind: 'i'; elemento: number }

export interface NetlistMotor {
  nodes: number
  /** Redes digitales; sin lógica, 0. */
  digital_nets?: number
  elements: ElementoMotor[]
  /** Sondas de los instrumentos; sin instrumentos, el campo no va. */
  sondas?: SondaMotor[]
  /** Canales de valor; sin ellos, el campo no va. */
  canales?: CanalMotor[]
  /** Lectores del puente de valores; sin ellos, el campo no va. */
  lectores?: LectorMotor[]
  /** Tablas de verdad de los `LUT` y los `MSI`: una fila por combinación de entradas, dos bits por salida (0, 1, Z = 2, X = 3). Una fila que no cabe en 53 bits va como texto decimal. Sin tablas, el campo no va. */
  tablas?: (number | string)[][]
}
