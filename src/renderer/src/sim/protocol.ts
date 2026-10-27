import type { PantallaSab, RegistroFino } from './protocoloInstrumentos'
import type { ElementoMotor } from '../netlist/netlist'
import type { ConfigInstrumentos } from './instrumentosWorker'

/** Redes que admite la vista previa. Medido (Ryzen 7 5700X, WASM en Node): una cadena de emisor común de 907 redes y 2,036
 * elementos tarda 0.6 ms por paso (1.8 ms en el peor) y una de 3,619 redes y 8,138 elementos 2.9 ms (7.4 ms), dentro del
 * presupuesto de 8 ms por tick. Sube de 256 a 1,024, con margen de cuatro veces. */
export const MAX_NODES = 1024
/** Elementos de la netlist: cada uno deja su corriente, su segunda lectura y su estado en la memoria compartida. */
export const MAX_ELEMENTS = 4096
/** Redes digitales: cada una deja su nivel y tres medidas (frecuencia, ciclo y cambios) en la memoria compartida. Es el
 * tope del motor (`LIMITE_REDES_DIGITALES` en `engine/src/netlist.rs`), que una prueba confirma midiendo. */
export const MAX_REDES_DIGITALES = 4096

/** Posiciones dentro del Float64Array sobre el SharedArrayBuffer. `seq` se lee y escribe como entero de 32 bits
 * (`Atomics`, palabra `seq * 2`): es el contador de un seqlock, impar mientras el worker escribe y par al terminar, así
 * una lectura no mezcla dos pasos. */
export const SLOT = {
  time: 0,
  ratio: 1,
  capacity: 2,
  seq: 3,
  voltages: 4,
  currents: 4 + MAX_NODES,
  aux: 4 + MAX_NODES + MAX_ELEMENTS,
  estado: 4 + MAX_NODES + 2 * MAX_ELEMENTS,
  niveles: 4 + MAX_NODES + 3 * MAX_ELEMENTS,
  medidas: 4 + MAX_NODES + 3 * MAX_ELEMENTS + MAX_REDES_DIGITALES,
  /** La duración del último intervalo promediado (0 si no hay) y los promedios de nodos y corrientes. */
  promedio: 4 + MAX_NODES + 3 * MAX_ELEMENTS + 4 * MAX_REDES_DIGITALES,
  promedioV: 5 + MAX_NODES + 3 * MAX_ELEMENTS + 4 * MAX_REDES_DIGITALES,
  promedioI: 5 + 2 * MAX_NODES + 3 * MAX_ELEMENTS + 4 * MAX_REDES_DIGITALES,
  /** La potencia media de cada elemento del mismo intervalo (cero en los que no avisan de su potencia). */
  promedioP: 5 + 2 * MAX_NODES + 4 * MAX_ELEMENTS + 4 * MAX_REDES_DIGITALES,
  /** Los segundos simulados por segundo de reloj que se alcanzan («14× el tiempo real» con «Sin límite de tiempo real»). */
  rapidez: 5 + 2 * MAX_NODES + 5 * MAX_ELEMENTS + 4 * MAX_REDES_DIGITALES,
  /** Instante simulado en que se cerró el promedio. Una lectura que repite el mismo promedio (lecturas por cuadro, una al
   * pausar) no debe contarlo otra vez como tiempo nuevo (quemado, destellos). */
  promedioFin: 6 + 2 * MAX_NODES + 5 * MAX_ELEMENTS + 4 * MAX_REDES_DIGITALES
} as const
export const SAB_LENGTH = SLOT.promedioFin + 1
/** Cada cuánto (reloj) el worker publica el promedio de lo simulado desde la anterior. */
export const VENTANA_PROMEDIO_MS = 100

/** El promedio de un intervalo: su duración simulada (s) y el promedio de cada nodo y de la corriente de cada elemento. */
export interface PromedioSim {
  duracion: number
  /** El instante simulado en que se cerró (0 si no se dice). */
  fin?: number
  voltajes: ArrayLike<number>
  corrientes: ArrayLike<number>
  /** La potencia media de cada elemento (cero en los que no la integran). */
  potencias?: ArrayLike<number>
}

/** Memoria de las corrientes por terminal (corriente animada), aparte de la principal y del tamaño de la netlist: duración
 * del intervalo y, por casilla, corriente media y media del valor absoluto. Se escribe y lee dentro del mismo seqlock que
 * la principal. */
export const largoSabTerminales = (casillas: number): number => 1 + 2 * casillas

/** Las corrientes por terminal de un intervalo: su duración (0 si no hay) y las dos medias de cada casilla. */
export interface TerminalesSim {
  duracion: number
  medias: Float64Array
  absolutas: Float64Array
}
/** Intentos de una lectura antes de rendirse con la última copia (el worker escribe unas 250 veces por segundo). */
const INTENTOS = 4

const enteros = new WeakMap<ArrayBufferLike, Int32Array>()
/** Vista entera sobre el mismo búfer: `Atomics` solo opera sobre enteros. */
function secuencia(view: Float64Array): Int32Array {
  let v = enteros.get(view.buffer)
  if (!v) {
    v = new Int32Array(view.buffer)
    enteros.set(view.buffer, v)
  }
  return v
}
const PALABRA_SEQ = SLOT.seq * 2

/** El elemento `indice` de la netlist cargada con otro valor (una resistencia, una fuente), con los mismos nodos. */
export interface CambioEnCaliente {
  indice: number
  elemento: ElementoMotor
}

/** Un fusible que se fundió: el elemento, el instante, la corriente que lo fundió y cuánto duró la sobrecarga (s). */
export interface EventoFundido {
  indice: number
  t: number
  amps: number
  segundos: number
}

export type ToWorker =
  /** `id` crece con cada carga: el cliente descarta las respuestas de una carga que ya fue reemplazada. */
  | {
      type: 'load'
      id: number
      netlist: string
      h: number
      sab: SharedArrayBuffer
      instrumentos?: { sab: SharedArrayBuffer; config: ConfigInstrumentos }
      /** La memoria de las corrientes por terminal, si la corriente animada empieza encendida, y los elementos cuya potencia media se integra. */
      terminales?: { sab: SharedArrayBuffer; activa: boolean }
      potencias?: number[]
      /** La velocidad con que empieza (0 en pausa) y si es «Sin límite de tiempo real»; sin ella, 1×. */
      velocidad?: number
      sinTope?: boolean
    }
  /** Ajustes nuevos de los instrumentos sin recargar (base de tiempo, acoplamiento, disparo, modo del multímetro). */
  | { type: 'instrumentos'; config: ConfigInstrumentos }
  /** Cuántas columnas dibuja la pantalla de un osciloscopio (su ancho en píxeles de dispositivo). */
  | { type: 'pantalla'; osciloscopio: number; columnas: number }
  /** «Rearmar» del modo Único. */
  | { type: 'rearmar'; osciloscopio: number }
  /** Escribe ya las pantallas con sus muestras de exportación (al pausar la del osciloscopio mientras se simula). */
  | { type: 'forzar-pantallas' }
  /** Exportar: la captura entera del osciloscopio `osciloscopio` (todo lo que conservan sus sondas) en `columnas` columnas, hasta `hasta` si se da; se responde con `captura-amplia` y el mismo `seq`. */
  | { type: 'captura-amplia'; osciloscopio: number; columnas: number; hasta?: number; seq: number }
  /** Desplazarse por lo capturado: todo lo que conservan las sondas del osciloscopio `osciloscopio` como columnas finas, hasta `hasta` si se da; se responde con `captura-fina` y el mismo `seq`. */
  | { type: 'captura-fina'; osciloscopio: number; hasta?: number; seq: number }
  /** 0 pausa: el reloj sigue, el tiempo simulado no avanza. `sinTope`: «Sin límite de tiempo real». */
  | { type: 'speed'; value: number; sinTope?: boolean }
  /** Desde la pausa, corre lo más rápido posible `dt` segundos simulados (o un paso del motor) y vuelve a la pausa en la
   * meta; responde con `llegada` y el mismo `seq`. */
  | { type: 'avanzar'; dt: number | 'paso'; seq: number }
  /** Lo mismo hasta el instante `t` («Avanzar hasta t»). */
  | { type: 'hasta'; t: number; seq: number }
  /** Deja el avance en curso donde va y queda en pausa (F5 o Esc). */
  | { type: 'interrumpir' }
  /** Retroceder: desde la pausa, el motor vuelve al estado guardado antes del último avance y los instrumentos recortan a
   * ese instante; responde con `retrocedio` y el mismo `seq`. */
  | { type: 'retroceder'; seq: number }
  /** La corriente animada se encendió o se apagó (el motor integra las corrientes por terminal solo encendida). */
  | { type: 'corrientes'; activa: boolean }
  /** Quema o repone el elemento `indice` en caliente. */
  | { type: 'quemar'; indice: number; si: boolean; seq: number }
  /** Cambia en caliente elementos de la netlist cargada (cursor de potenciómetro, interruptor, valor de resistencia o
   * fuente) sin reiniciar el tiempo ni la carga de capacitores e inductores. */
  | { type: 'valores'; cambios: CambioEnCaliente[]; h?: number; seq: number }
  /** Escribe `valor` en el canal de una perilla en vivo a la hora de la isla; un rechazo vuelve como `rechazado` con `indice = -1 - canal`. */
  | { type: 'perilla'; canal: number; valor: number; seq: number }
  /** Repone el elemento `indice` (un fusible fundido). */
  | { type: 'reponer'; indice: number }
  /** Un solo paso corto, aunque el reloj esté en pausa: calcula las lecturas con un valor recién cambiado. */
  | { type: 'paso' }
  | { type: 'stop' }

export type FromWorker =
  /** `lazo`: los elementos de un lazo de compuertas que no se asentó al arrancar (oscila solo); vacío si no hay. */
  | { type: 'ready'; id: number; nodes: number; elements: number; digitales: number; lazo: number[] }
  | { type: 'error'; id: number; message: string }
  /** El motor rechazó un cambio en caliente (`indice` -1 es el paso; menor que -1 es la perilla del canal `-1 - indice`): no es fatal, el elemento conserva su valor anterior. */
  | { type: 'rechazado'; id: number; indice: number; message: string; seq: number }
  /** La captura entera pedida con `captura-amplia` (null si no hay nada que dar). */
  | { type: 'captura-amplia'; id: number; seq: number; pantalla: PantallaSab | null }
  /** Las columnas finas pedidas con `captura-fina` (null si no hay nada que dar). */
  | { type: 'captura-fina'; id: number; seq: number; registro: RegistroFino | null }
  | ({ type: 'fundido'; id: number } & EventoFundido)
  /** El óhmetro `multimetro` (su orden en la memoria de los instrumentos) pasó al rango `rango`. */
  | { type: 'rango'; id: number; multimetro: number; rango: number }
  /** El avance `seq` terminó en `t` (`dt` simulados después de donde empezó), o se interrumpió antes. */
  | { type: 'llegada'; id: number; seq: number; t: number; dt: number; interrumpida: boolean; guardados?: number }
  /** Retroceder: el motor volvió a `t` (NaN si no había a qué volver, o corría, o había un avance en curso) y quedan
   * `guardados` estados a que volver. */
  | { type: 'retrocedio'; id: number; seq: number; t: number; guardados: number }
  /** Retroceder: el motor olvidó `perdidos` estados para no pasar de su memoria máxima; quedan `guardados`. */
  | { type: 'estados-perdidos'; id: number; perdidos: number; guardados: number }
  /** Cambios de estado que se oyen desde la publicación anterior (zumbadores y relés): elemento, instante simulado y nivel
   * por cada uno, cuántos no cupieron y el ancla para pasarlos a reloj (`performance.timeOrigin + performance.now()`,
   * igual en worker y ventana). `velocidad` 0: no corrían al ritmo del reloj. */
  | { type: 'cruces'; id: number; datos: number[]; perdidos: number; ancla: { t: number; reloj: number }; velocidad: number }
  /** Redes digitales donde dos salidas de tres estados empezaron a manejar un 0 y un 1 a la vez. */
  | { type: 'conflictos'; id: number; redes: number[] }

/** `ratio`: fracción del tiempo real alcanzada (1 = al ritmo del reloj). `capacity`: segundos simulados por segundo de
 * cálculo. `currents`: corriente de cada elemento, de `a` hacia `b`. `aux` y `estado`: segunda lectura y estado de cada
 * elemento (los de `Reading` en el motor). */
export interface SimReading {
  /** false si ni tras reintentar se obtuvo una copia sin escritura de por medio (se usa la última). */
  consistente: boolean
  time: number
  ratio: number
  capacity: number
  seq: number
  voltages: Float64Array
  currents: Float64Array
  aux: Float64Array
  estado: Float64Array
  /** Nivel de cada red digital: 0, 1, 2 (X) o 3 (Z). */
  niveles: Float64Array
  /** Tres por red digital: frecuencia (Hz, 0 si no conmuta), ciclo de trabajo (0 a 1) y cuántas veces cambió. */
  medidas: Float64Array
  /** El promedio del último intervalo de 100 ms; null si no hay (en pausa, tras un cambio en caliente). */
  promedio?: { duracion: number; fin?: number; voltages: Float64Array; currents: Float64Array; potencias?: Float64Array } | null
  /** Segundos simulados por segundo de reloj (lo que dice la barra con «Sin límite de tiempo real»). */
  rapidez?: number
  /** Las corrientes por terminal del último intervalo; null o sin el campo con la corriente animada apagada. */
  terminales?: TerminalesSim | null
}

/** Lo que se escribe además en la memoria compartida. */
export interface ExtraEscritura {
  rapidez?: number
  /** La memoria de las corrientes por terminal y lo que se escribe en ella: [duración, medias…, absolutas…]. */
  terminales?: { vista: Float64Array; datos: ArrayLike<number> }
}

export function writeSim(
  view: Float64Array,
  time: number,
  ratio: number,
  capacity: number,
  voltages: ArrayLike<number>,
  currents: ArrayLike<number> = [],
  aux: ArrayLike<number> = [],
  estado: ArrayLike<number> = [],
  niveles: ArrayLike<number> = [],
  medidas: ArrayLike<number> = [],
  /** El promedio de un intervalo; sin él se conserva el anterior y con null se anula. */
  promedio?: PromedioSim | null,
  extra?: ExtraEscritura
): void {
  const seq = secuencia(view)
  Atomics.add(seq, PALABRA_SEQ, 1) // impar: escribiendo
  view[SLOT.time] = time
  view[SLOT.ratio] = ratio
  view[SLOT.capacity] = capacity
  view.set(voltages, SLOT.voltages)
  view.set(currents, SLOT.currents)
  view.set(aux, SLOT.aux)
  view.set(estado, SLOT.estado)
  view.set(niveles, SLOT.niveles)
  view.set(medidas, SLOT.medidas)
  if (promedio === null) view[SLOT.promedio] = 0
  else if (promedio) {
    view[SLOT.promedio] = promedio.duracion
    view[SLOT.promedioFin] = promedio.fin ?? 0
    view.set(promedio.voltajes, SLOT.promedioV)
    view.set(promedio.corrientes, SLOT.promedioI)
    if (promedio.potencias) view.set(promedio.potencias, SLOT.promedioP)
  }
  if (extra?.rapidez !== undefined) view[SLOT.rapidez] = extra.rapidez
  if (extra?.terminales) extra.terminales.vista.set(extra.terminales.datos)
  Atomics.add(seq, PALABRA_SEQ, 1) // par: completa
}

export function readSim(view: Float64Array, nodes: number, elements = 0, digitales = 0, terminales?: { vista: Float64Array; casillas: number }): SimReading {
  const seq = secuencia(view)
  let r: SimReading | null = null
  for (let k = 0; k < INTENTOS; k++) {
    const antes = Atomics.load(seq, PALABRA_SEQ)
    r = {
      consistente: false,
      time: view[SLOT.time],
      ratio: view[SLOT.ratio],
      capacity: view[SLOT.capacity],
      seq: antes >> 1,
      voltages: view.slice(SLOT.voltages, SLOT.voltages + nodes),
      currents: view.slice(SLOT.currents, SLOT.currents + elements),
      aux: view.slice(SLOT.aux, SLOT.aux + elements),
      estado: view.slice(SLOT.estado, SLOT.estado + elements),
      niveles: view.slice(SLOT.niveles, SLOT.niveles + digitales),
      medidas: view.slice(SLOT.medidas, SLOT.medidas + 3 * digitales),
      promedio:
        view[SLOT.promedio] > 0
          ? {
              duracion: view[SLOT.promedio],
              fin: view[SLOT.promedioFin],
              voltages: view.slice(SLOT.promedioV, SLOT.promedioV + nodes),
              currents: view.slice(SLOT.promedioI, SLOT.promedioI + elements),
              potencias: view.slice(SLOT.promedioP, SLOT.promedioP + elements)
            }
          : null,
      rapidez: view[SLOT.rapidez],
      terminales: terminales && terminales.vista[0] > 0
        ? { duracion: terminales.vista[0], medias: terminales.vista.slice(1, 1 + terminales.casillas), absolutas: terminales.vista.slice(1 + terminales.casillas, 1 + 2 * terminales.casillas) }
        : null
    }
    if (antes % 2 === 0 && Atomics.load(seq, PALABRA_SEQ) === antes) {
      r.consistente = true
      break
    }
  }
  return r!
}
