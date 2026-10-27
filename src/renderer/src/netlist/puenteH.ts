import type { ElementoMotor } from '../../../compartido/netlistMotor'
import type { ModeloDef } from '../piezas/tipos'

/** Parámetros del L298 (ST DS0218, VS 42 V, VSS 5 V, 25 °C) que una opción de `modelos` puede cambiar. */
export const PARAMETROS_PUENTE_H = ['umbral', 'r_in', 'v0_alto', 'r_alto', 'v0_bajo', 'r_bajo', 'retardo_sube', 'retardo_baja', 't_sube', 't_baja', 'r_vss'] as const
type Parametro = (typeof PARAMETROS_PUENTE_H)[number]

/** Valores de la hoja cuando la opción no los trae. `umbral` es el punto medio de ViL 1.5 V y ViH 2.3 V; la caída de cada
 * transistor es la recta por sus dos puntos típicos (1 A y 2 A); `r_in` sale de IiH = 30 µA a VSS − 0.6 V y `r_vss`, de ISS = 24 mA típicos a 5 V (con la entrada en bajo). */
export const L298_POR_OMISION: Record<Parametro, number> = {
  umbral: 1.9, r_in: 150e3, v0_alto: 0.7, r_alto: 0.65, v0_bajo: 0.7, r_bajo: 0.5, retardo_sube: 2e-6, retardo_baja: 1.5e-6, t_sube: 0.7e-6, t_baja: 0.25e-6, r_vss: 5 / 24e-3
}

/** Un terminal de un elemento: su red del documento y cómo se llama el pin en los avisos (vacío: no cuenta como conexión). */
export interface TerminalPuente {
  red: number
  etiqueta: string
  pin?: string
  /** Cuenta como conexión de su red sin que se reporte suelto (una salida que puede quedar libre). */
  mudo?: true
}

/** Lo que `compilarNetlist` le da al armado del puente H. */
export interface ArmadoPuenteH {
  red: (pin: string) => number
  /** La oración «El pin X de U1»; cada pin la dice una sola vez para que «no está conectado a nada» siga viendo la red. */
  etiqueta: (pin: string) => string
  nuevaDigital: () => number
  /** Elemento analógico con sus terminales y los grupos de pines unidos por dentro. */
  analogico: (terminales: TerminalPuente[], el: (nodos: number[]) => ElementoMotor, grupos: { pines: number[]; tierra: boolean }[]) => void
  /** Elemento digital (va después de los analógicos). */
  digital: (el: ElementoMotor) => void
  /** La red del documento que maneja una red digital (para dibujarla cuando conmuta). */
  manejo: (red: number, digital: number) => void
}

/** El L298 con elementos que el motor ya tiene: por canal, una entrada `ADC` por habilitación y por IN, un `Gate` `buf` con
 * `enable` por semipuente y un `Dac` con `lo` en SENSE, `hi` en VS y salida en Z (EN en bajo). No lleva diodos, como el real. */
export function armarPuenteH(m: Extract<ModeloDef, { tipo: 'puente-h' }>, opcion: Record<string, number> | undefined, a: ArmadoPuenteH): void {
  const x = { ...L298_POR_OMISION, ...opcion }
  const dicho = new Set<string>()
  const terminal = (pin: string): TerminalPuente => {
    const primera = !dicho.has(pin)
    dicho.add(pin)
    return { red: a.red(pin), etiqueta: primera ? a.etiqueta(pin) : '', pin }
  }
  const unidos = [{ pines: [0, 1], tierra: false }]
  /** Una entrada referida a GND que lee un nivel con el umbral de la hoja. */
  const entrada = (pin: string): number => {
    const red = a.nuevaDigital()
    // Una entrada atada a GND lee 0 sin puente (el motor no admite un puente con sus dos extremos en el mismo nodo).
    if (a.red(pin) === a.red(m.gnd)) {
      a.digital({ type: 'LOGIC', out: red, value: 0 })
      return red
    }
    a.analogico([terminal(pin), terminal(m.gnd)], ([p, n]) => ({ type: 'ADC', p, n, out: red, in_low: x.umbral, in_high: x.umbral, r_in: x.r_in, v_in: 0 }), unidos)
    return red
  }
  // La alimentación lógica: sin consumo la red de VSS no tendría a nadie más y se vería como un pin al aire.
  a.analogico([terminal(m.vss), terminal(m.gnd)], ([vss, gnd]) => ({ type: 'R', a: vss, b: gnd, ohms: x.r_vss }), unidos)
  for (const c of [0, 1]) {
    const habilita = entrada(m.habilita[c])
    for (const j of [0, 1]) {
      const k = 2 * c + j
      const dentro = entrada(m.entradas[k])
      const fuera = a.nuevaDigital()
      a.digital({ type: 'GATE', fn: 'buf', inputs: [dentro], output: fuera, enable: habilita, enable_bajo: false, rise_delay: x.retardo_sube, fall_delay: x.retardo_baja, z_como: 'x' })
      // Con la salida alta sale `hi` menos la caída; con la baja, `lo` más la suya (la recta de la hoja).
      a.analogico(
        [terminal(m.salidas[k]), terminal(c === 0 ? m.sensa : m.sensb), terminal(m.vs)],
        ([out, lo, hi]) => ({ type: 'DAC', input: fuera, out, lo, hi, v_lo: x.v0_bajo, v_hi: -x.v0_alto, r_lo: x.r_bajo, r_hi: x.r_alto, t_rise: x.t_sube, t_fall: x.t_baja, z: true }),
        [{ pines: [0, 1, 2], tierra: false }]
      )
      a.manejo(a.red(m.salidas[k]), fuera)
    }
  }
}
