import type { CanalMotor, ElementoMotor, NetlistMotor, Onda, Parametros } from '../../../compartido/netlistMotor'
import { clavePin, nombreDeTerminal, partirClavePin, porId, type Conexiones } from '../conexiones/conexiones'
import { rielDeTerminal } from './alimentaciones'
import { corrienteNominal } from '../sim/sobrecorriente'
import type { Documento, Id, Pieza } from '../doc/tipos'
import type { ExtrasDiodo, ModeloDef, PiezaDef } from '../piezas/tipos'
import { UnionFind } from '../conexiones/unionFind'
import { PASO_MIN, PASOS_MINIMOS } from '../sim/lectura'
import { problemaDeSpice } from '../doc/spice'
import { elementoDelMotor, elementosPodados, gruposDeCompuesto, gruposDeElemento, nodosDe as nodosDeElementoCompuesto, propiedadesDeCompuesto, resolverValor } from './compuesto'
import { fraccionConLey } from '../valores/leyPot'
import { errorDeRango, PARAMETROS } from './rangos'
import { formatearMedida, formatearValor, leerCiclo, leerPosicion, leerValor } from '../valores/valores'
import { entradasAlAire, entradasTrasContactos, esModeloDigital, textoEntradasAlAire, textoEntradasTrasContactos, familiaDe, hayLogica, pinesDigitales, redesDigitalesPuras, salidasATierra, salidasUnidas, type ModeloDigital } from './digital'
import type { ParametrosLogicos } from './familias'
import { avisosDeMultimetros } from './multimetros'
import { esModeloInstrumento } from '../piezas/validarInstrumentos'
import { repartirMemoria } from '../instrumentos/memoria'
import { armarInstrumento, COLUMNA_MULTIMETRO, RANGO_OHM_INICIAL, sinInstrumentos, sinRejilla, type ArmadoInstrumento, type InstrumentosNetlist, type ModeloInstrumento, type SondaMotor, type SondaPorArmar } from './instrumentos'
import { medidoresDe } from '../doc/sondas'
import { esOptoacoplador, fuentesPrevias, PISTA_OPTOACOPLADOR } from './fuentesPrevias'
import { armarAdc0804, armarDac0808, type RelojAdc } from './convertidores'
import { elementoMsi, type ContextoMsi } from './msi'
import { armarPuenteH } from './puenteH'
import { aplicarUniones, unirCompartidas } from './paquetes'
import { armarInterruptores, armarTeclado, PROP_TECLA } from './teclado'
import { pinesDelModeloMsi } from '../piezas/validarMsi'
import { leerPuntosPwl } from '../valores/pwl'
import type { Puerto } from '../conexiones/corrientes'

/** Interruptor cerrado y abierto; 1 GΩ respeta la tolerancia relativa de pivote de la LU densa. */
export const R_CERRADO = 1e-3

/** Resistencia mínima de cada tramo de un potenciómetro, en Ω: 10 Ω o el 1 % de su valor, la menor. Uno real nunca llega a
 * cero, y con el cursor en un extremo un LED sin resistencia en serie lleva una corriente grande pero resoluble, en vez
 * de detener la vista previa. */
export const tramoMinimoPot = (ohms: number): number => Math.max(R_CERRADO, Math.min(10, 0.01 * ohms))
export const R_ABIERTO = 1e9
/** Fuga a tierra de una red que solo une contactos con entradas CMOS (`entradasTrasContactos`): con el contacto abierto la
 * deja en unos 15 mV de 15 V y con el contacto cerrado toma 15 µA, imperceptibles. */
export const R_FUGA = 1e6
/** Canales de valor por netlist (el tope de `engine/src/netlist.rs`). */
export const CANALES_MAX = 256

export type { Onda, ElementoMotor, NetlistMotor } from '../../../compartido/netlistMotor'

/** Los elementos del motor que no son de dos terminales analógicos: no tienen voltaje ni corriente de pieza propios. */
export const ELEMENTOS_DIGITALES = new Set<ElementoMotor['type']>(['GATE', 'LOGIC', 'DFF', 'JKFF', 'COUNTER', 'DECODER', 'LATCH555', 'LUT', 'MSI', 'ADC', 'DAC', 'OUT555'])

/** Nodos de los terminales de un elemento en el orden del motor (`Element::nodes` de `engine/src/netlist.rs`); vacío en
 * digitales. Cada elemento analógico tiene en el motor una casilla de corriente por terminal y una más, la de la tierra
 * interna. */
export function nodosDeElemento(e: ElementoMotor): number[] {
  switch (e.type) {
    case 'XFMR':
      return [e.a1, e.b1, e.a2, e.b2]
    case 'RELAY':
      return [e.a1, e.a2, e.com, e.na, e.nc]
    case 'Q':
      return [e.c, e.b, e.e]
    case 'M':
      return [e.d, e.g, e.s]
    case 'J':
      return [e.d, e.g, e.s]
    case 'E':
    case 'G':
    case 'H':
    case 'F':
      return [e.p, e.n, e.cp, e.cn]
    case 'PASOS':
      return [...e.nodos]
    case 'OA':
      return [e.p, e.n, e.out, e.vp, e.vn]
    case 'ADC':
      return [e.p, e.n]
    case 'DACM':
      return [e.out, e.ret, e.ref_p, e.ref_n]
    case 'DAC':
      // Como `Element::nodes` del motor: la salida y las alimentaciones explícitas que tenga.
      return [e.out, ...(e.lo !== undefined ? [e.lo] : []), ...(e.hi !== undefined ? [e.hi] : [])]
    case 'OUT555':
      return [e.out, e.dis, e.vcc, e.gnd]
    case 'GATE':
    case 'LOGIC':
    case 'DFF':
    case 'JKFF':
    case 'COUNTER':
    case 'DECODER':
    case 'LATCH555':
    case 'LUT':
    case 'MSI':
      return []
    default:
      return [e.a, e.b]
  }
}

/** Voltaje térmico a 27 °C, el del motor y de ngspice. */
export const VT = (1.38064852e-23 / 1.6021766208e-19) * 300.15

/** Lo que la vista previa le pasa a la netlist además del documento: el estado de la sesión que cambia elementos. */
export interface OpcionesNetlist {
  /** El rango vigente del óhmetro de cada multímetro. */
  rangosOhm?: ReadonlyMap<Id, number>
}

/** Una pieza digital al simular: su familia y alimentación, y la red digital de cada pin (la de su puente si su red es analógica). */
export interface PiezaDigitalNetlist {
  familia: string
  alimentacion: number
  /** El elemento de su modelo en la netlist. */
  elemento: number
  /** `red` es la red digital del pin (la de su puente si su red es analógica) y `redDoc`, la red del esquema. */
  pines: { id: string; nombre: string; red: number; redDoc: number; salida: boolean }[]
}

export interface ResultadoNetlist {
  netlist: NetlistMotor | null
  /** id de red → nodo del motor (0 = tierra). */
  nodoDeRed: Map<number, number>
  /** Pieza de cada elemento de la netlist, en el mismo orden (el motor da las corrientes así); un potenciómetro aparece en sus dos tramos. */
  piezaDeElemento: Id[]
  /** Redes de los extremos (pin 1 y pin 2) y del cursor de cada potenciómetro simulado: su medición junta los dos tramos. */
  potenciometros: Map<Id, { a: number; c: number; b: number }>
  /** Tipo de modelo de la pieza de cada elemento, en el mismo orden (para leer lo propio de cada uno). */
  tipoDeElemento: ModeloDef['tipo'][]
  /** Voltaje a partir del cual suena cada zumbador. */
  umbrales: Map<Id, number>
  /** Red del documento → red digital, solo de las redes digitales puras (las demás están en `nodoDeRed`). */
  redDigital: Map<number, number>
  /** Las piezas digitales al simular. */
  digitales: Map<Id, PiezaDigitalNetlist>
  /** Por 555: la red digital de su biestable (frecuencia y ciclo) y el elemento de su salida. */
  temporizadores: Map<Id, { q: number; salida: number; thr: number; trig: number; vcc: number; gnd: number; modelo: string; vmin: number; vmax: number }>
  /** Por display: el elemento de cada segmento (a a g y el punto), o -1 si ese segmento no está conectado. */
  displays: Map<Id, number[]>
  /** Red analógica del documento → la red digital que la maneja por un puente de salida (para dibujarla cuando conmuta). */
  manejoDeRed: Map<number, number>
  /** Canal del motor de cada perilla en vivo, por `idPieza:propId`: a él escribe la interfaz al moverla. */
  canalDe: Map<string, number>
  /** Reloj de cada ADC0804: el RC que encontró (con su frecuencia) o externo. */
  relojesAdc: Map<Id, RelojAdc>
  /** Por convertidor: su elemento en la netlist (el `MSI` del ADC0804, el `DACM` del DAC0808) y, en el ADC, la red del documento
   * de VREF/2 y la red digital de INTR, para leer el código, el voltaje que representa y si terminó. */
  convertidores: Map<Id, { elemento: number; vref2?: number; intr?: number }>
  /** Los instrumentos armados, con sus elementos y sus sondas. */
  instrumentos: InstrumentosNetlist
  /** Por dónde entra a las redes del documento la corriente de cada casilla de terminal del motor (por elemento analógico:
   * nodos y tierra interna, en orden de netlist): su red (−1 si es interna de la pieza) y su pin. */
  puertos: Puerto[]
  /** Los elementos cuya potencia media se integra para los avisos (resistencias, transistores y fusibles). */
  potencias: number[]
  /** Piezas de varios elementos: sus elementos en la netlist, el elemento cuya corriente es la de la pieza y las redes de
   * las que sale su voltaje. La lectura de la pieza es esa y la suma de las potencias de sus elementos, no la del último. */
  compuestos: Map<Id, { elementos: number[]; i: number; mas: number; menos: number; region?: number }>
  sinModelo: string[]
  errores: string[]
  avisos: string[]
}

/** `is` y `n` del diodo (y, si la opción los trae, resistencia en serie, ruptura y capacitancias): los de la opción
 * elegida si el modelo los da `por` una propiedad (color de un LED, modelo de un diodo). */
export function parametrosDiodo(m: { is: number; n: number; por?: Extract<ModeloDef, { tipo: 'D' }>['por'] }, p: Pieza, def: PiezaDef): { is: number; n: number } & ExtrasDiodo {
  if (!m.por) return { is: m.is, n: m.n }
  // De un LED solo van al motor is y n: la corriente nominal (`inom`) es de la interfaz.
  const propDef = def.props.find((d) => d.id === m.por!.prop)
  const guardada = p.props[m.por.prop]
  // Una opción que no está en la lista de la propiedad (un archivo editado a mano) cuenta como la opción por omisión.
  const opcion = guardada !== undefined && (!propDef?.opciones || propDef.opciones.includes(guardada)) ? guardada : (propDef?.defecto ?? '')
  if (!Object.hasOwn(m.por.valores, opcion)) return { is: m.is, n: m.n }
  const { inom: _inom, ...resto } = m.por.valores[opcion]
  return resto
}

/** Propiedades numéricas que lee el modelo, en orden, con la oración que se da si debe ser mayor que cero y no lo es
 * (null: un voltaje puede ser cero o negativo). */
export function numericasDelModelo(m: ModeloDef): { prop: string; positiva: ((ref: string) => string) | null }[] {
  const valor = (ref: string) => `El valor de ${ref} debe ser positivo.`
  const frecuencia = (ref: string) => `La frecuencia de ${ref} debe ser mayor que cero.`
  switch (m.tipo) {
    case 'R':
    case 'C':
    case 'L':
      return [{ prop: m.prop, positiva: valor }, ...(m.rserie ? [{ prop: m.rserie, positiva: null }] : [])]
    case 'pot':
    case 'zener':
    case 'fusible':
      return [{ prop: m.prop, positiva: valor }]
    case 'foco':
      return [{ prop: m.voltaje, positiva: valor }, { prop: m.potencia, positiva: valor }]
    case 'motor':
    case 'rele':
    case 'zumbador':
      return [{ prop: m.voltaje, positiva: valor }]
    case 'V':
    case 'I':
      return [{ prop: m.prop, positiva: null }, ...(m.tipo === 'V' && m.rserie ? [{ prop: m.rserie, positiva: null }] : [])]
    case 'compuesto':
      return propiedadesDeCompuesto(m).map((prop) => ({ prop, positiva: null }))
    case 'alimentacion':
      // Su voltaje no es una propiedad: sale del nombre o de la tabla de rieles (`terminalesDeAlimentacion`).
      return []
    case 'senoidal':
      return [{ prop: m.amplitud, positiva: null }, { prop: m.frecuencia, positiva: frecuencia }]
    case 'pulso':
      return [{ prop: m.alto, positiva: null }, { prop: m.frecuencia, positiva: frecuencia }]
    default:
      return []
  }
}

/** Tiempos de una fuente de pulso: null si ninguno se tocó (la cuadrada de siempre); si no, subida, bajada, ancho de
 * meseta (propiedad o ciclo) y fase del retardo; o el error con la referencia como sujeto. */
function tiemposDePulso(p: Pieza, def: PiezaDef, m: Extract<ModeloDef, { tipo: 'pulso' }>, freq: number, duty: number): { subida: number; bajada: number; ancho: number; fase: number } | string | null {
  const leidos: Record<'ancho' | 'subida' | 'bajada' | 'retardo', number> = { ancho: 0, subida: 0, bajada: 0, retardo: 0 }
  const nombres = { ancho: 'El ancho', subida: 'La subida', bajada: 'La bajada', retardo: 'El retardo' }
  for (const k of ['ancho', 'subida', 'bajada', 'retardo'] as const) {
    const id = m[k]
    if (!id) continue
    const r = leerPropiedad(p, def, id, null)
    if (!r.ok) return r.error
    if (r.valor < 0) return `${nombres[k]} de ${p.ref} no puede ser negativ${k === 'ancho' || k === 'retardo' ? 'o' : 'a'}.`
    leidos[k] = r.valor
  }
  if (leidos.ancho === 0 && leidos.subida === 0 && leidos.bajada === 0 && leidos.retardo === 0) return null
  const periodo = 1 / freq
  const ancho = leidos.ancho > 0 ? leidos.ancho : duty * periodo
  const total = leidos.subida + ancho + leidos.bajada
  const t = (x: number) => formatearValor(x, 's')
  if (total > periodo * (1 + 1e-9)) return `La subida, el ancho y la bajada de ${p.ref} suman ${t(total)} y no caben en su periodo de ${t(periodo)}.`
  // Con la fase, el retardo es el tiempo en bajo antes del primer pulso: tiene que caber en lo que sobra del periodo.
  if (leidos.retardo + total > periodo * (1 + 1e-9)) return `El retardo de ${p.ref} (${t(leidos.retardo)}) más su pulso (${t(total)}) no caben en su periodo de ${t(periodo)}.`
  return { subida: leidos.subida, bajada: leidos.bajada, ancho, fase: leidos.retardo > 0 ? 1 - leidos.retardo / periodo : 0 }
}

/** Lee una propiedad numérica con su unidad; el error es una oración con la referencia como sujeto. */
export function leerPropiedad(p: Pieza, def: PiezaDef, prop: string, positiva: ((ref: string) => string) | null): { ok: true; valor: number } | { ok: false; error: string } {
  const propDef = def.props.find((d) => d.id === prop)
  const texto = p.props[prop] ?? propDef?.defecto ?? ''
  const v = leerValor(texto)
  if (!v || !Number.isFinite(v.valor)) return { ok: false, error: `El valor «${texto}» de ${p.ref} no es válido.` }
  if (v.unidad && propDef?.unidad && v.unidad !== propDef.unidad) return { ok: false, error: `La unidad «${texto}» de ${p.ref} no es compatible: se esperaba ${propDef.unidad}.` }
  if (positiva && !(v.valor > 0)) return { ok: false, error: positiva(p.ref) }
  return { ok: true, valor: v.valor }
}

const terminalesHechos = new WeakMap<ModeloDef, string[]>()
/** Pines del modelo que entran a la netlist (el cursor del potenciómetro también), en el orden de sus terminales en el motor. */
export function terminalesDelModelo(m: ModeloDef): string[] {
  let t = terminalesHechos.get(m)
  if (!t) {
    switch (m.tipo) {
      case 'tierra':
        t = []
        break
      case 'alimentacion':
        t = [m.pin]
        break
      case 'pot':
        t = m.b === undefined ? [m.a, m.c] : [m.a, m.b, m.c]
        break
      case 'compuesto':
        t = m.terminales
        break
      case 'interruptor':
        t = m.c !== undefined ? [m.a, m.b, m.c] : [m.a, m.b]
        break
      case 'bjt':
        t = [m.c, m.b, m.e]
        break
      case 'mosfet':
        t = [m.d, m.g, m.s]
        break
      case 'ampop':
      case 'comparador':
        t = [m.mas, m.menos, m.sal, m.vmas, m.vmenos]
        break
      case 'rele':
        t = [m.a1, m.a2, m.com, m.na, m.nc]
        break
      case '555':
        t = [m.gnd, m.trig, m.out, m.reset, m.cv, m.thr, m.dis, m.vcc]
        break
      case 'display':
        t = [...m.segmentos, m.comun]
        break
      case 'compuerta':
      case 'biestable-d':
      case 'biestable-jk':
      case 'contador':
      case 'decodificador':
      case 'estado-logico':
        t = pinesDigitales(m).map((x) => x.id)
        break
      case 'lut':
      case 'msi': {
        const { entradas, salidas } = pinesDelModeloMsi(m)
        t = [...new Set([...entradas, ...salidas])]
        break
      }
      case 'convertidor-ad':
        t = [m.cs, m.rd, m.wr, m.clkin, m.clkr, m.intr, m.vinp, m.vinn, m.agnd, m.vref2, m.dgnd, m.vcc, ...m.db]
        break
      case 'convertidor-da':
        t = [...m.a, m.io, m.gnd, m.vee, m.vcc, m.vrefp, m.vrefn, m.comp]
        break
      case 'interruptores':
        t = m.contactos.flat()
        break
      case 'teclado':
        t = [...m.filas, ...m.columnas]
        break
      case 'multimetro':
        t = [m.mas, m.com]
        break
      case 'osciloscopio':
        t = [...m.entradas]
        break
      case 'generador':
        t = [m.sal, m.com]
        break
      case 'fuente-variable':
        t = [m.mas, m.menos]
        break
      case 'jfet':
        t = [m.d, m.g, m.s]
        break
      case 'controlada':
        t = [m.p, m.n, m.cp, m.cn]
        break
      // El común de un unipolar se repite en `nodos`, pero es un solo pin.
      case 'pasos':
        t = [...new Set(m.nodos)]
        break
      case 'puente-h':
        t = [...m.entradas, ...m.habilita, ...m.salidas, m.sensa, m.sensb, m.vs, m.vss, m.gnd]
        break
      default:
        t = [m.a, m.b]
    }
    terminalesHechos.set(m, t)
  }
  return t
}

/** Pines unidos en continua por dentro de la pieza (índices de `terminalesDelModelo`), para buscar islas sin camino a
 * tierra. `tierra`: grupos que llegan a tierra por la pieza. Un transformador aísla sus devanados y sin referencia la
 * matriz queda singular: se avisa y no se agrega una fuga, para no cambiar las cifras contra ngspice. */
export const PISTA_TRANSFORMADOR = 'El transformador aísla sus devanados: une a tierra el extremo común de la carga (S2 en el secundario, P2 en el primario).'

/** Si la pieza es un transformador (un compuesto con un elemento de inductancias acopladas). */
export const esTransformador = (def: PiezaDef | undefined): boolean => def?.modelo?.tipo === 'compuesto' && def.modelo.elementos.some((e) => e.t === 'T')

export function gruposDelModelo(m: ModeloDef): { pines: number[]; tierra: boolean }[] {
  // Se calcula una vez por modelo: con 5,000 resistencias, rehacer los arreglos de cada una costaba cerca de 2 ms por recorrido.
  let g = gruposHechos.get(m)
  if (!g) {
    g = calcularGrupos(m)
    gruposHechos.set(m, g)
  }
  return g
}

const gruposHechos = new WeakMap<ModeloDef, { pines: number[]; tierra: boolean }[]>()

function calcularGrupos(m: ModeloDef): { pines: number[]; tierra: boolean }[] {
  switch (m.tipo) {
    case 'tierra':
      return []
    case 'alimentacion':
      return [{ pines: [0], tierra: true }]
    case 'compuesto':
      return gruposDeCompuesto(m)
    case 'ampop':
      return [{ pines: [0, 1], tierra: false }, { pines: [3, 4], tierra: false }, { pines: [2], tierra: true }]
    case 'comparador':
      // Las entradas y las alimentaciones como en el amplificador; la salida es el colector de un transistor que baja a V−.
      return [{ pines: [0, 1], tierra: false }, { pines: [2, 3, 4], tierra: false }]
    case 'rele':
      return [{ pines: [0, 1], tierra: false }, { pines: [2, 3, 4], tierra: false }]
    case '555':
      // GND, OUT, CV, DIS y VCC se unen por dentro (divisor, consumo, salida y descarga); TRIG, RESET y THR son comparadores.
      return [{ pines: [0, 2, 4, 6, 7], tierra: false }]
    case 'display':
      return [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ pines: [k, 8], tierra: false }))
    // La salida de una fuente controlada es una fuente; H y F además unen los dos pines de su control (la rama de 0 V).
    case 'controlada':
      return m.forma === 'E' || m.forma === 'G' ? [{ pines: [0, 1], tierra: false }] : [{ pines: [0, 1], tierra: false }, { pines: [2, 3], tierra: false }]
    // Un devanado por fase; en el unipolar la toma central ata las mitades, así que todos los pines cuentan como unidos.
    case 'pasos':
      return m.unipolar ? [{ pines: [...new Set(m.nodos)].map((_, k) => k), tierra: false }] : [{ pines: [0, 1], tierra: false }, { pines: [2, 3], tierra: false }]
    case 'compuerta':
    case 'biestable-d':
    case 'biestable-jk':
    case 'contador':
    case 'decodificador':
    case 'estado-logico':
    case 'lut':
    case 'msi':
      // Cada salida es una fuente contra tierra (su puente); una entrada CMOS no toma corriente.
      return pinesDigitales(m).flatMap((x, k) => (x.salida ? [{ pines: [k], tierra: true }] : []))
    default:
      return [{ pines: terminalesDelModelo(m).map((_, i) => i), tierra: false }]
  }
}

/** Pines que deben estar conectados: terminales del modelo, salvo en piezas digitales (entrada al aire es aviso, salida
 * sin usar es normal), el 555 (OUT, DIS y CV pueden quedar libres) y el display (un segmento sin conectar queda apagado). */
export function pinesQueDebenConectarse(m: ModeloDef): string[] {
  // Un instrumento al aire no impide simular (su lectura dice «sin conectar»).
  if (esModeloDigital(m) || esModeloInstrumento(m)) return []
  if (m.tipo === '555') return [m.gnd, m.trig, m.reset, m.thr, m.vcc]
  // Las salidas del ADC, las entradas del DAC, la compensación, el DIP y el teclado pueden quedar libres.
  if (m.tipo === 'convertidor-ad') return [m.cs, m.rd, m.wr, m.vcc, m.agnd, m.dgnd, m.vinp, m.vinn]
  if (m.tipo === 'convertidor-da') return [m.io, m.gnd, m.vee, m.vcc, m.vrefp, m.vrefn]
  if (m.tipo === 'interruptores' || m.tipo === 'teclado') return []
  if (m.tipo === 'display') return [m.comun]
  if (m.tipo === 'compuesto') return m.terminales.filter((t) => !m.opcionales?.includes(t))
  // Un conmutador puede dejar un tiro libre: solo el común debe ir a algo.
  if (m.tipo === 'interruptor' && m.c !== undefined) return [m.a]
  return terminalesDelModelo(m)
}

/** La opción de una propiedad de lista: la guardada si es una de las opciones; si no, la de omisión. */
export function opcionDe(p: Pieza, def: PiezaDef, prop: string): string {
  const d = def.props.find((x) => x.id === prop)
  const guardada = p.props[prop]
  return guardada !== undefined && (!d?.opciones || d.opciones.includes(guardada)) ? guardada : (d?.defecto ?? '')
}

/** Diodo de SPICE de un zener de `voltaje` volts: corriente de prueba e impedancia de la hoja de la serie más cercana, con
 * `rs` = zzt - VT/izt (impedancia dinámica en izt) y `bv` = voltaje - izt rs (el voltaje entre terminales en izt es el
 * nominal). */
export function diodoZener(m: Extract<ModeloDef, { tipo: 'zener' }>, voltaje: number, familia?: string, sinFamilia = false): Parametros {
  // Las llaves son voltajes en volts en decimal («5.1»); `validarPieza` rechaza cualquier otra forma, así que `Number` las lee igual.
  const serie = familia !== undefined && m.por && Object.hasOwn(m.por.valores, familia) ? m.por.valores[familia] : m.serie
  // Un .kir de antes de la propiedad Familia (la tabla llegaba a `sinFamiliaHasta` V) sigue saliendo igual: un voltaje mayor toma la última fila.
  const tope = sinFamilia && m.sinFamiliaHasta !== undefined ? m.sinFamiliaHasta : Infinity
  const filas = Object.entries(serie).filter((e) => Number(e[0]) <= tope)
  let mejor = filas[0]
  for (const e of filas) if (Math.abs(Math.log(Number(e[0]) / voltaje)) < Math.abs(Math.log(Number(mejor[0]) / voltaje))) mejor = e
  const { izt, zzt } = mejor[1]
  const rs = Math.max(zzt - VT / izt, 0.1)
  return { is: m.is, n: m.n, rs, bv: voltaje - izt * rs, ibv: izt, cjo: m.cjo, vj: m.vj, m: m.m }
}

/** Las piezas del documento que importan al diagnóstico de fuentes, halladas en un solo recorrido sin ordenar. */
export interface PiezasDeFuentes {
  diodos: Pieza[]
  /** Fuentes de voltaje con pines `a` y `b`: continuas, senoidales y de pulso. */
  fuentes: Pieza[]
  terminales: Pieza[]
}
/** Anota una pieza con su modelo en las listas de `r` (quien ya recorre las piezas con su modelo evita un segundo recorrido). */
export function anotarFuente(r: PiezasDeFuentes, p: Pieza, modelo: ModeloDef | undefined): void {
  const t = modelo?.tipo
  if (t === 'D') r.diodos.push(p)
  else if (t === 'V' || t === 'senoidal' || t === 'pulso') r.fuentes.push(p)
  else if (t === 'alimentacion') r.terminales.push(p)
}
export function clasificarFuentes(doc: Documento, lib: Map<string, PiezaDef>): PiezasDeFuentes {
  const r: PiezasDeFuentes = { diodos: [], fuentes: [], terminales: [] }
  for (const p of Object.values(doc.piezas)) anotarFuente(r, p, lib.get(p.tipo)?.modelo)
  return r
}

export interface TerminalAlimentacion {
  pieza: Pieza
  /** Nombre de la red a la que el terminal se une (el de su propiedad, sin espacios en los extremos). */
  nombre: string
  voltaje: number
}

const textoDeVoltajes = (vs: number[]) => {
  const t = vs.map((v) => formatearValor(v, 'V'))
  return t.length < 2 ? t.join('') : `${t.slice(0, -1).join(', ')} y ${t[t.length - 1]}`
}

/** Terminales de alimentación por red, con el voltaje de su nombre o riel. Una red con terminales de un solo voltaje es
 * una fuente de ese voltaje contra tierra (`grupos`). Dos nombres distintos unidos por cable, un voltaje distinto de cero
 * sobre la tierra o un riel ilegible se explican en `conflictos` (una vez). */
export function terminalesDeAlimentacion(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, hallazgos: PiezasDeFuentes = clasificarFuentes(doc, lib)): { grupos: Map<number, TerminalAlimentacion[]>; conflictos: { texto: string; piezas: Id[] }[] } {
  const todos = new Map<number, TerminalAlimentacion[]>()
  const conflictos: { texto: string; piezas: Id[] }[] = []
  const malos = new Map<string, { texto: string; piezas: Id[] }>()
  // `hallazgos` evita ordenar miles de piezas de las que casi ninguna es terminal: solo se ordena lo hallado.
  for (const p of [...hallazgos.terminales].sort(porId)) {
    const def = lib.get(p.tipo)
    const m = def?.modelo
    if (!def || m?.tipo !== 'alimentacion') continue
    const red = con.redDePin.get(clavePin(p.id, m.pin))
    const riel = rielDeTerminal(doc, p, def)!
    if (riel.valor === null) {
      const malo = malos.get(riel.nombre)
      if (malo) malo.piezas.push(p.id)
      else malos.set(riel.nombre, { texto: `El voltaje «${riel.texto}» de ${riel.nombre} no es válido.`, piezas: [p.id] })
      continue
    }
    if (red === undefined) continue
    const lista = todos.get(red) ?? []
    lista.push({ pieza: p, nombre: nombreDeTerminal(p, def), voltaje: riel.valor })
    todos.set(red, lista)
  }
  conflictos.push(...malos.values())
  const grupos = new Map<number, TerminalAlimentacion[]>()
  for (const [red, ts] of todos) {
    const voltajes = [...new Set(ts.map((t) => t.voltaje))].sort((x, y) => x - y)
    const nombre = con.redes[red]?.nombre || ts[0].nombre || ts[0].pieza.ref
    const piezas = ts.map((t) => t.pieza.id)
    if (con.redes[red]?.tierra) {
      if (voltajes.some((v) => v !== 0)) conflictos.push({ texto: `${nombre} está conectado a tierra con ${textoDeVoltajes(voltajes.filter((v) => v !== 0))}: es un corto.`, piezas })
      continue
    }
    if (voltajes.length > 1) conflictos.push({ texto: `${nombre} tiene ${voltajes.length === 2 ? 'dos' : voltajes.length} voltajes distintos: ${textoDeVoltajes(voltajes)}.`, piezas })
    else grupos.set(red, ts)
  }
  return { grupos, conflictos }
}

const esFuente = (m: ModeloDef) => m.tipo === 'V' || m.tipo === 'senoidal' || m.tipo === 'pulso'

/** Voltaje directo (V) a partir del cual un diodo sin resistencia en serie lleva una corriente que no se puede resolver. */
export const VOLTAJE_DIODO_DIRECTO = 0.5

/** Fuente de voltaje del modelo: sus pines y la propiedad que da su nivel (valor, amplitud de pico o nivel alto). */
function fuenteDeVoltaje(m: ModeloDef): { tipo: 'V' | 'senoidal' | 'pulso'; a: string; b: string; prop: string } | null {
  if (m.tipo === 'V') return { tipo: 'V', a: m.a, b: m.b, prop: m.prop }
  if (m.tipo === 'senoidal') return { tipo: 'senoidal', a: m.a, b: m.b, prop: m.amplitud }
  if (m.tipo === 'pulso') return { tipo: 'pulso', a: m.a, b: m.b, prop: m.alto }
  return null
}

const enumerarRefs = (refs: string[]) => (refs.length < 2 ? refs.join('') : `${refs.slice(0, -1).join(', ')} y ${refs[refs.length - 1]}`)

/** Diodos y LED directo a las redes de una fuente de voltaje (o varias en serie) y polarizados en directo por encima de
 * 0.5 V: en un circuito real se quemarían y el motor no tiene solución. Los intervalos de las fuentes se suman a lo largo
 * de la cadena. Alimenta el aviso de «Listo para simular» y el error del netlist. */
export function diodosDirectos(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, hallazgos: PiezasDeFuentes = clasificarFuentes(doc, lib)): { texto: string; piezas: Id[] }[] {
  const red = (id: Id, pin: string) => con.redDePin.get(clavePin(id, pin))
  /** Fuentes como aristas entre redes: v(mas) − v(menos) está en [lo, hi]. */
  interface Arista { pieza: Pieza; mas: number; menos: number; lo: number; hi: number }
  const aristas = new Map<number, Arista[]>()
  const diodos = hallazgos.diodos
  if (diodos.length === 0) return []
  for (const p of [...hallazgos.fuentes].sort(porId)) {
    const def = lib.get(p.tipo)
    const m = def?.modelo
    if (!def || !m) continue
    const f = fuenteDeVoltaje(m)
    if (!f) continue
    const v = leerPropiedad(p, def, f.prop, null)
    if (!v.ok) continue
    const mas = red(p.id, f.a), menos = red(p.id, f.b)
    if (mas === undefined || menos === undefined || mas === menos) continue
    const a: Arista =
      f.tipo === 'V' ? { pieza: p, mas, menos, lo: v.valor, hi: v.valor }
      : f.tipo === 'senoidal' ? { pieza: p, mas, menos, lo: -Math.abs(v.valor), hi: Math.abs(v.valor) }
      : { pieza: p, mas, menos, lo: Math.min(0, v.valor), hi: Math.max(0, v.valor) }
    for (const r of [mas, menos]) aristas.set(r, [...(aristas.get(r) ?? []), a])
  }
  // Un terminal de alimentación es una fuente entre su red y la tierra.
  const tierra = con.redes.find((r) => r.tierra)?.id
  if (tierra !== undefined) {
    for (const ts of terminalesDeAlimentacion(doc, lib, con, hallazgos).grupos.values())
      for (const t of ts) {
        const red = con.redDePin.get(clavePin(t.pieza.id, (lib.get(t.pieza.tipo)!.modelo as { pin: string }).pin))
        if (red === undefined || red === tierra) continue
        const a: Arista = { pieza: t.pieza, mas: red, menos: tierra, lo: t.voltaje, hi: t.voltaje }
        for (const r of [red, tierra]) aristas.set(r, [...(aristas.get(r) ?? []), a])
      }
  }
  if (aristas.size === 0) return []
  const salida: { texto: string; piezas: Id[] }[] = []
  for (const p of [...diodos].sort(porId)) {
    const m = lib.get(p.tipo)?.modelo
    if (m?.tipo !== 'D') continue
    const ra = red(p.id, m.a), rk = red(p.id, m.b)
    if (ra === undefined || rk === undefined || ra === rk || !aristas.has(rk)) continue
    // Desde el cátodo por las fuentes: u(x) − u(cátodo) está en [lo, hi] y el camino recuerda sus fuentes.
    const vistos = new Map<number, { lo: number; hi: number; fuentes: Pieza[] }>([[rk, { lo: 0, hi: 0, fuentes: [] }]])
    const cola = [rk]
    for (let i = 0; i < cola.length && !vistos.has(ra); i++) {
      const y = cola[i], dy = vistos.get(y)!
      for (const e of aristas.get(y) ?? []) {
        const z = e.mas === y ? e.menos : e.mas
        if (vistos.has(z)) continue
        // Hacia el negativo se resta el intervalo de la fuente; hacia el positivo se suma.
        const d = e.menos === y ? { lo: dy.lo + e.lo, hi: dy.hi + e.hi } : { lo: dy.lo - e.hi, hi: dy.hi - e.lo }
        vistos.set(z, { ...d, fuentes: [...dy.fuentes, e.pieza] })
        cola.push(z)
      }
    }
    const llegada = vistos.get(ra)
    if (!llegada || !(llegada.hi > VOLTAJE_DIODO_DIRECTO)) continue
    const fuentes = [...new Map(llegada.fuentes.map((f) => [f.id, f])).values()].sort((x, y) => x.ref.localeCompare(y.ref, 'es', { numeric: true }))
    // De un terminal de alimentación se da su nombre (VCC), que es lo que se ve en el esquema; su referencia va oculta.
    const nombres = fuentes.map((f) => nombreDeTerminal(f, lib.get(f.tipo)!) || f.ref)
    salida.push({ texto: `${p.ref} está conectado directo a ${enumerarRefs(nombres)}, sin resistencia: agrega una en serie.`, piezas: [p.id, ...fuentes.map((f) => f.id)] })
  }
  return salida
}

/** La etiqueta de un terminal `mudo`: cuenta como conexión y nunca se reporta. */
const MUDO = '(conexión muda)'

/** Un elemento por armar: sus terminales (red y cómo se llama el pin en los avisos) y cómo hacerlo con sus nodos. */
export interface Pendiente {
  pieza: Pieza
  /** Etiqueta vacía: el terminal no cuenta para «no está conectado a nada» (el segundo tramo de un potenciómetro). */
  /** `mudo`: cuenta como conexión de su red pero no se reporta suelto (la salida de un 555, un segmento de un display). */
  /** `pin`: el pin de la pieza por el que entra la corriente de ese terminal; sin él se busca por la red. */
  terminales: { red: number; etiqueta: string; mudo?: true; pin?: string }[]
  el: (nodos: number[]) => ElementoMotor
  tipo: ModeloDef['tipo']
  /** Más pines de la misma red que solo cuentan como conexiones (los terminales de alimentación repetidos). */
  extra?: string[]
  /** Elemento propio de la netlist (la fuga de una entrada tras un contacto): sin lectura de pieza. */
  sinLectura?: true
  grupos: { pines: number[]; tierra: boolean }[]
}

export function compilarNetlist(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, opciones: OpcionesNetlist = {}): ResultadoNetlist {
  const piezas = Object.values(doc.piezas).sort(porId)
  const sinModelo = piezas.filter((p) => !lib.get(p.tipo)?.modelo).map((p) => p.ref).sort()
  const instrumentos = sinInstrumentos()
  const sondasPorArmar: SondaPorArmar[] = []
  const nodoDeRed = new Map<number, number>()
  const errores: string[] = []
  const avisos: string[] = []
  const umbrales = new Map<Id, number>()
  const redDigital = new Map<number, number>()
  const digitales = new Map<Id, PiezaDigitalNetlist>()
  const temporizadores: ResultadoNetlist['temporizadores'] = new Map()
  const displays = new Map<Id, number[]>()
  const manejoDeRed = new Map<number, number>()
  const compuestos: ResultadoNetlist['compuestos'] = new Map()
  const canalDe = new Map<string, number>()
  const relojesAdc = new Map<Id, RelojAdc>()
  const convertidores: ResultadoNetlist['convertidores'] = new Map()
  const nulo = (): ResultadoNetlist => ({
    netlist: null, nodoDeRed, piezaDeElemento: [], potenciometros: new Map(), tipoDeElemento: [], umbrales, redDigital, digitales, temporizadores, displays, manejoDeRed, canalDe, relojesAdc, convertidores, instrumentos, puertos: [], potencias: [], compuestos, sinModelo, errores, avisos
  })
  if (sinModelo.length) return nulo()
  // Un canal por perilla en vivo, con el valor del documento: moverla escribe al canal y no reconstruye la netlist.
  const canales: CanalMotor[] = []
  for (const p of piezas) {
    const def = lib.get(p.tipo)!
    for (const d of def.props) {
      if (!d.enVivo) continue
      const r = leerPropiedad(p, def, d.id, null)
      if (!r.ok) errores.push(r.error)
      else if (r.valor < d.enVivo.min || r.valor > d.enVivo.max) errores.push(`El valor de ${d.nombre} de ${p.ref} debe estar entre ${d.enVivo.min} y ${d.enVivo.max}${d.unidad ? ` ${d.unidad}` : ''}.`)
      else {
        canalDe.set(`${p.id}:${d.id}`, canales.length)
        canales.push({ inicial: r.valor })
      }
    }
  }
  if (canales.length > CANALES_MAX) errores.push(`Hay ${canales.length} perillas en vivo y el motor admite ${CANALES_MAX}.`)

  // Las patillas compartidas de un encapsulado son una sola: la unidad que las deja sueltas toma la red de la que las conecta.
  const compartidas = unirCompartidas(doc, lib, con)
  for (const c of compartidas.errores) errores.push(c.texto)
  con = aplicarUniones(con, compartidas.uniones)

  // Un circuito solo de piezas digitales no necesita tierra: no tiene nodos analógicos.
  const soloDigital = piezas.every((p) => esModeloDigital(lib.get(p.tipo)?.modelo))
  for (const r of con.redes) if (r.tierra) nodoDeRed.set(r.id, 0)
  if (nodoDeRed.size === 0 && !soloDigital) {
    errores.push('Falta una tierra: agrega una con G.')
    return nulo()
  }
  // Sin piezas digitales ni 555 no se busca nada digital: un circuito analógico no paga por el motor.
  const logica = hayLogica(piezas, lib)
  for (const a of avisosDeMultimetros(doc, lib, con)) avisos.push(a.texto)
  if (logica) {
    for (const c of [...salidasUnidas(doc, lib, con), ...salidasATierra(doc, lib, con)]) errores.push(c.texto)
    const alAire = textoEntradasAlAire(entradasAlAire(doc, lib, con))
    if (alAire) avisos.push(alAire)
  }
  const trasContactos = logica ? entradasTrasContactos(doc, lib, con) : []
  const textoContactos = textoEntradasTrasContactos(trasContactos)
  if (textoContactos) avisos.push(textoContactos)
  // Redes digitales: las puras primero (por id de red) y luego las de cada puente, que se reparten al armar las piezas.
  const puras = logica ? redesDigitalesPuras(doc, lib, con) : new Set<number>()
  let siguienteDigital = 0
  for (const r of [...puras].sort((a, b) => a - b)) redDigital.set(r, siguienteDigital++)
  const nuevaDigital = () => siguienteDigital++
  /** Elementos digitales, que van después de los analógicos y los puentes. */
  /** Tablas de verdad de los `LUT` y los `MSI`, una por contenido distinto. */
  const tablasMotor: (number | string)[][] = []
  const indiceDeTabla = new Map<string, number>()
  /** El índice de la tabla en `Netlist.tablas`: una sola por contenido. */
  const indiceTabla = (filas: (number | string)[]): number => {
    const llave = filas.join(',')
    let i = indiceDeTabla.get(llave)
    if (i === undefined) {
      i = tablasMotor.length
      tablasMotor.push(filas)
      indiceDeTabla.set(llave, i)
    }
    return i
  }
  const elementosDigitales: { pieza: Pieza; tipo: ModeloDef['tipo']; el: ElementoMotor; modelo?: true }[] = []
  /** Pendientes cuyo índice en la netlist hace falta después de numerar (la salida de un 555, los segmentos de un display). */
  const marcados = new Map<Pendiente, (indice: number) => void>()
  let siguienteInterna = -1
  /** Una red interna de una pieza (la toma del divisor de un 555): ids negativos, que ninguna red del documento usa. */
  const nuevaInterna = () => siguienteInterna--
  const tierraDoc = con.redes.find((r) => r.tierra)?.id
  /** Las entradas digitales sobre una red analógica, con los umbrales de su familia (para avisar de un reloj que no los cruza). */
  const entradasAnalogicas: { pieza: Pieza; pin: string; red: number; bajo: number; alto: number; familia: string }[] = []

  /** Elementos con sus redes; los nodos se numeran después, solo para redes que tocan algún elemento. */
  const pendientes: Pendiente[] = []
  const potenciometros = new Map<Id, { a: number; c: number; b: number }>()
  for (const p of piezas) {
    const def = lib.get(p.tipo)!
    const m = def.modelo!
    if (m.tipo === 'tierra') continue
    // Los terminales se agrupan por red después del recorrido, con el voltaje de su nombre o de su riel.
    if (m.tipo === 'alimentacion') continue
    const nombrePin = (id: string) => def.pines.find((x) => x.id === id)!.nombre
    const etiqueta = (id: string) => `El pin ${nombrePin(id)} de ${p.ref}`
    const ids = terminalesDelModelo(m)
    const redes = ids.map((id) => con.redDePin.get(clavePin(p.id, id))!)
    if (m.tipo === 'lut' || m.tipo === 'msi') {
      armarMsi(p, def, m)
      continue
    }
    if (m.tipo === 'convertidor-ad' || m.tipo === 'convertidor-da' || m.tipo === 'interruptores' || m.tipo === 'teclado') {
      armarMixto(p, def, m)
      continue
    }
    if (esModeloDigital(m)) {
      armarDigital(p, def, m)
      continue
    }
    if (m.tipo === '555') {
      armar555(p, def, m)
      continue
    }
    if (m.tipo === 'comparador') {
      armarComparador(p, def, m, redes, ids, etiqueta)
      continue
    }
    if (m.tipo === 'compuesto') {
      armarCompuesto(p, def, m, redes, ids, etiqueta)
      continue
    }
    if (m.tipo === 'jfet' || m.tipo === 'termistor' || m.tipo === 'ldr' || m.tipo === 'pasos' || m.tipo === 'controlada' || m.tipo === 'pwl') {
      armarNuevo(p, def, m, redes, ids, etiqueta)
      continue
    }
    if (m.tipo === 'puente-h') {
      armarPuente(p, def, m)
      continue
    }
    if (m.tipo === 'display') {
      armarDisplay(p, def, m)
      continue
    }
    if (esModeloInstrumento(m)) {
      armarInstrumento(p, def, m as ModeloInstrumento, armadoDe(p, def), instrumentos, opciones.rangosOhm?.get(p.id) ?? RANGO_OHM_INICIAL)
      continue
    }
    const lecturas = numericasDelModelo(m).map((q) => leerPropiedad(p, def, q.prop, q.positiva))
    const error = lecturas.find((l) => !l.ok)
    const valores = lecturas.map((l) => (l.ok ? l.valor : NaN))
    /** Agrega el elemento con todos los terminales del modelo. */
    const poner = (el: (n: number[]) => ElementoMotor) => pendientes.push({ pieza: p, terminales: redes.map((red, k) => ({ red, etiqueta: etiqueta(ids[k]), pin: ids[k] })), el, tipo: m.tipo, grupos: gruposDelModelo(m) })
    // Los de más de dos terminales admiten pines en la misma red (un transistor conectado como diodo).
    if (m.tipo === 'bjt' || m.tipo === 'mosfet' || m.tipo === 'ampop' || m.tipo === 'rele') {
      if (error && !error.ok) {
        errores.push(error.error)
        continue
      }
      // Modelo «Personalizado»: los parámetros propios de la pieza van en lugar de los de su lista de modelos.
      let propio: Parametros | null = null
      if (m.tipo !== 'rele' && p.spice && Object.keys(p.spice).length > 0) {
        const problema = Object.entries(p.spice).map(([k, v]) => [k, problemaDeSpice(m.tipo, k, v)] as const).find((x) => x[1] !== null)
        if (problema) {
          errores.push(`El modelo propio de ${p.ref} no es válido: «${problema[0]}», ${problema[1]}.`)
          continue
        }
        propio = { ...p.spice }
      }
      if (m.tipo === 'bjt') {
        const model = propio ?? m.modelos[opcionDe(p, def, m.prop)]
        poner(([c, b, e]) => ({ type: 'Q', c, b, e, pnp: m.pnp, model }))
      } else if (m.tipo === 'mosfet') {
        const model = propio ?? m.modelos[opcionDe(p, def, m.prop)]
        poner(([d, g, s]) => ({ type: 'M', d, g, s, pmos: m.pmos, model }))
      } else if (m.tipo === 'ampop') {
        const model = propio ?? m.modelos[opcionDe(p, def, m.prop)]
        poner(([mas, menos, out, vp, vn]) => ({ type: 'OA', p: mas, n: menos, out, vp, vn, model }))
      } else {
        const v = valores[0], r = (v * v) / m.potencia
        poner(([a1, a2, com, na, nc]) => ({ type: 'RELAY', a1, a2, com, na, nc, r, l: r * m.tau, ion: (m.operar * v) / r, ioff: (m.liberar * v) / r }))
      }
      continue
    }
    const [redA, redB] = redes
    if (m.tipo === 'interruptor' && m.c !== undefined) {
      // Conmutador (SPDT): el común cierra con un tiro y abre con el otro. Un tiro en la red del común no es un elemento.
      const texto = p.props[m.prop] ?? def.props.find((d) => d.id === m.prop)?.defecto ?? ''
      const conB = texto === m.cerrado
      const grupos = [{ pines: [0, 1, 2], tierra: false }]
      // Un tiro al aire es normal (terminal mudo: cuenta como conexión y no se reporta suelto); el común dice su etiqueta una vez.
      let comunDicho = false
      const tiro = (red: number, pin: string, cerrado: boolean) => {
        if (redA === red) return
        pendientes.push({ pieza: p, terminales: [{ red: redA, etiqueta: comunDicho ? '' : etiqueta(m.a), pin: m.a }, { red, etiqueta: '', mudo: true, pin }], el: ([a, b]) => ({ type: 'R', a, b, ohms: cerrado ? R_CERRADO : R_ABIERTO }), tipo: 'interruptor', grupos })
        comunDicho = true
      }
      tiro(redB, m.b, conB)
      tiro(redes[2], m.c, !conB)
      if (redA === redB && redB === redes[2]) avisos.push(`${p.ref} tiene sus tres terminales en la misma red y se omite.`)
      continue
    }
    if (redA === redB && m.tipo !== 'pot') {
      // Una fuente en corto con voltaje es un error; sin voltaje, o cualquier otra pieza, se omite.
      if (esFuente(m) && error && !error.ok) errores.push(error.error)
      else if (esFuente(m) && valores[0] !== 0) errores.push(`${p.ref} está en corto: sus dos terminales están en la misma red.`)
      else avisos.push(`${p.ref} tiene sus dos terminales en la misma red y se omite.`)
      continue
    }
    if (error && !error.ok) {
      errores.push(error.error)
      continue
    }
    if ('rserie' in m && m.rserie && valores[1] < 0) {
      errores.push(`La resistencia en serie de ${p.ref} no puede ser negativa.`)
      continue
    }
    const dos = (el: (a: number, b: number) => ElementoMotor) => poner(([a, b]) => el(a, b))
    if (m.tipo === 'pot') {
      const texto = p.props[m.posicion] ?? def.props.find((d) => d.id === m.posicion)?.defecto ?? ''
      const giro = leerPosicion(texto)
      if (giro === null) {
        errores.push(`La posición «${texto}» del cursor de ${p.ref} no es válida.`)
        continue
      }
      // La ley de variación: del giro del eje a la fracción del valor entre el pin 1 y el cursor.
      const x = fraccionConLey(giro, m.ley ? opcionDe(p, def, m.ley) : undefined)
      if (m.reostato) {
        if (redA === redB) {
          avisos.push(`${p.ref} tiene sus dos terminales en la misma red y se omite.`)
          continue
        }
        // Reóstato: una sola resistencia del extremo al cursor, con el mismo mínimo que cada tramo de un potenciómetro.
        const ohms = Math.max(tramoMinimoPot(valores[0]), valores[0] * x)
        dos((a, b) => ({ type: 'R', a, b, ohms }))
        continue
      }
      const redC = redes[2]
      // Ningún tramo baja de su mínimo (`tramoMinimoPot`): como en uno real, el cursor en un extremo no es un corto.
      const rMin = tramoMinimoPot(valores[0])
      const r1 = Math.max(rMin, valores[0] * x), r2 = Math.max(rMin, valores[0] * (1 - x))
      // Los dos tramos son de la pieza: su medición junta extremos, cursor, corriente del primer tramo y potencia de ambos.
      potenciometros.set(p.id, { a: redA, c: redC, b: redB })
      const grupos = [{ pines: [0, 1], tierra: false }]
      if (redA !== redC) pendientes.push({ pieza: p, terminales: [{ red: redA, etiqueta: etiqueta(m.a), pin: m.a }, { red: redC, etiqueta: etiqueta(m.c), pin: m.c }], el: ([a, b]) => ({ type: 'R', a, b, ohms: r1 }), tipo: 'pot', grupos })
      if (redC !== redB) pendientes.push({ pieza: p, terminales: [{ red: redC, etiqueta: '', pin: m.c }, { red: redB, etiqueta: etiqueta(m.b!), pin: m.b }], el: ([a, b]) => ({ type: 'R', a, b, ohms: r2 }), tipo: 'pot', grupos })
      if (redA === redC && redC === redB) avisos.push(`${p.ref} tiene sus tres terminales en la misma red y se omite.`)
      continue
    }
    const avisarFrecuencia = (hz: number) => avisarFrecuenciaDe(p, hz)
    switch (m.tipo) {
      case 'D': {
        const pd = parametrosDiodo(m, p, def)
        dos((a, b) => ({ type: 'D', a, b, ...pd }))
        // La corriente nominal de un LED viaja como su umbral: la lectura la compara con la corriente de cada cuadro.
        const inom = corrienteNominal(p, def)
        if (inom !== null) umbrales.set(p.id, inom)
        break
      }
      case 'zener': {
        const d = diodoZener(m, valores[0], m.por ? opcionDe(p, def, m.por.prop) : undefined, m.por !== undefined && p.props[m.por.prop] === undefined)
        dos((a, b) => ({ type: 'D', a, b, is: d.is, n: d.n, rs: d.rs, bv: d.bv, ibv: d.ibv, cjo: d.cjo, vj: d.vj, m: d.m }))
        break
      }
      case 'interruptor': {
        const texto = p.props[m.prop] ?? def.props.find((d) => d.id === m.prop)?.defecto ?? ''
        const ohms = texto === m.cerrado ? R_CERRADO : R_ABIERTO
        dos((a, b) => ({ type: 'R', a, b, ohms }))
        break
      }
      case 'R':
        dos((a, b) => ({ type: 'R', a, b, ohms: valores[0] }))
        break
      case 'C':
        if (m.rserie && valores[1] > 0) enSerie(p, m.tipo, ids, redes, valores[1], 'ultima', (a, b) => ({ type: 'C', a, b, farads: valores[0] }))
        else dos((a, b) => ({ type: 'C', a, b, farads: valores[0] }))
        break
      case 'L':
        if (m.rserie && valores[1] > 0) enSerie(p, m.tipo, ids, redes, valores[1], 'ultima', (a, b) => ({ type: 'L', a, b, henries: valores[0] }))
        else dos((a, b) => ({ type: 'L', a, b, henries: valores[0] }))
        break
      case 'V':
        if (m.rserie && valores[1] > 0) enSerie(p, m.tipo, ids, redes, valores[1], 'primera', (a, b) => ({ type: 'V', a, b, wave: { kind: 'dc', v: valores[0] } }))
        else dos((a, b) => ({ type: 'V', a, b, wave: { kind: 'dc', v: valores[0] } }))
        break
      case 'I':
        dos((a, b) => ({ type: 'I', a, b, amps: valores[0] }))
        break
      case 'foco': {
        const [v, w] = valores
        dos((a, b) => ({ type: 'LAMP', a, b, rfrio: (v * v) / w / (1 + m.k), k: m.k, pnom: w, tau: m.tau }))
        break
      }
      case 'fusible': {
        const inom = valores[0]
        dos((a, b) => ({ type: 'FUSE', a, b, ohms: m.rPorA / inom, inom, ifusion: m.fusion * inom, tau: m.tau }))
        break
      }
      case 'motor': {
        const r = m.referencia, k = valores[0] / r.v
        dos((a, b) => ({ type: 'MOTOR', a, b, r: r.r * k * k, l: r.l * k * k, ke: r.ke * k, j: r.j, bm: r.bm }))
        break
      }
      case 'zumbador': {
        const v = valores[0]
        umbrales.set(p.id, m.umbral * v)
        // El motor registra el instante de cada cruce de su umbral (el sonido se programa desde ahí).
        dos((a, b) => ({ type: 'BUZZER', a, b, ohms: (v * v) / m.potencia, umbral: m.umbral * v }))
        break
      }
      case 'senoidal':
        avisarFrecuencia(valores[1])
        dos((a, b) => ({ type: 'V', a, b, wave: { kind: 'sine', offset: 0, amp: valores[0], freq: valores[1] } }))
        break
      case 'pulso': {
        const texto = p.props[m.ciclo] ?? def.props.find((d) => d.id === m.ciclo)?.defecto ?? ''
        const duty = leerCiclo(texto)
        if (duty === null) errores.push(`El ciclo de trabajo «${texto}» de ${p.ref} no es válido.`)
        else {
          const t = tiemposDePulso(p, def, m, valores[1], duty)
          if (typeof t === 'string') errores.push(t)
          else {
            avisarFrecuencia(valores[1])
            // Sin tiempos propios (un .kir de antes) es la cuadrada de siempre; con ellos, un pulso de SPICE.
            if (t === null) dos((a, b) => ({ type: 'V', a, b, wave: { kind: 'square', low: 0, high: valores[0], freq: valores[1], duty } }))
            else dos((a, b) => ({ type: 'V', a, b, wave: { kind: 'pulse', low: 0, high: valores[0], freq: valores[1], rise: t.subida, fall: t.bajada, width: t.ancho, phase: t.fase, continua: true } }))
          }
        }
        break
      }
    }
  }

  /** Pieza digital: su modelo con las redes digitales de sus pines y, por pin sobre una red analógica, un puente (entrada
   * lee el voltaje con los umbrales de la familia; salida es un Thévenin). Una entrada en la tierra lee 0 sin puente. */
  function armarDigital(p: Pieza, def: PiezaDef, m: Exclude<ModeloDigital, { tipo: 'lut' | 'msi' }>): void {
    const f = familiaDe(p, def, m)
    if (!f.ok) {
      errores.push(f.error)
      return
    }
    if (f.aviso) avisos.push(f.aviso)
    const k: ParametrosLogicos = f.params
    const schmitt = m.tipo === 'compuerta' && m.histeresis === true
    const tresEstados = m.tipo === 'compuerta' && m.habilitacion !== undefined
    if (schmitt && k.vt_pos === undefined) {
      errores.push(`${f.nombre} no tiene umbrales de disparador Schmitt para ${p.ref}.`)
      return
    }
    // Una entrada con histéresis cambia en sus dos umbrales de disparo, no en los de la familia.
    const [bajo, alto] = schmitt ? [k.vt_neg!, k.vt_pos!] : [k.in_low, k.in_high]
    const pines: PiezaDigitalNetlist['pines'] = []
    const red = (pin: string) => con.redDePin.get(clavePin(p.id, pin))!
    const nombre = (pin: string) => `El pin ${def.pines.find((x) => x.id === pin)!.nombre} de ${p.ref}`
    for (const pin of pinesDigitales(m)) {
      const r = red(pin.id)
      let d = redDigital.get(r)
      if (d === undefined) {
        d = nuevaDigital()
        if (pin.salida) {
          const dn = d
          pendientes.push({
            pieza: p, terminales: [{ red: r, etiqueta: nombre(pin.id) }], tipo: m.tipo, grupos: [{ pines: [0], tierra: true }],
            el: ([out]) => ({ type: 'DAC', input: dn, out, v_lo: k.v_lo, v_hi: k.v_hi, r_lo: k.r_lo, r_hi: k.r_hi, t_rise: k.t_rise, t_fall: k.t_fall, ...(tresEstados ? { z: true } : {}) })
          })
          manejoDeRed.set(r, dn)
        } else if (r === tierraDoc) {
          elementosDigitales.push({ pieza: p, tipo: m.tipo, el: { type: 'LOGIC', out: d, value: 0 } })
        } else {
          const dn = d
          entradasAnalogicas.push({ pieza: p, pin: def.pines.find((x) => x.id === pin.id)?.nombre ?? pin.id, red: r, bajo, alto, familia: opcionDe(p, def, 'familia') })
          const carga = k.r_in !== undefined ? { r_in: k.r_in, v_in: k.v_in ?? 0 } : {}
          pendientes.push({
            pieza: p, terminales: [{ red: r, etiqueta: nombre(pin.id) }], tipo: m.tipo, grupos: k.r_in !== undefined ? [{ pines: [0], tierra: true }] : [],
            el: ([nodo]) => ({ type: 'ADC', p: nodo, n: 0, out: dn, in_low: bajo, in_high: alto, ...(schmitt ? { histeresis: true } : {}), ...carga })
          })
        }
      }
      pines.push({ id: pin.id, nombre: def.pines.find((x) => x.id === pin.id)?.nombre ?? pin.id, red: d, redDoc: r, salida: pin.salida })
    }
    const de = (id: string) => pines.find((x) => x.id === id)!.red
    const r = { rise_delay: k.rise_delay, fall_delay: k.fall_delay, z_como: k.z_como }
    const opcion = (prop: string) => opcionDe(p, def, prop)
    let el: ElementoMotor
    switch (m.tipo) {
      case 'compuerta':
        el = { type: 'GATE', fn: m.funcion, inputs: m.entradas.map(de), output: de(m.salida), ...(m.habilitacion !== undefined ? { enable: de(m.habilitacion), enable_bajo: m.activo !== 'alto' } : {}), ...r }
        break
      case 'biestable-d':
        el = { type: 'DFF', d: de(m.d), clk: de(m.clk), pre: de(m.pre), clr: de(m.clr), q: de(m.q), qn: de(m.qn), ...r }
        break
      case 'biestable-jk':
        el = { type: 'JKFF', j: de(m.j), k: de(m.k), clk: de(m.clk), pre: de(m.pre), clr: de(m.clr), q: de(m.q), qn: de(m.qn), ...r }
        break
      case 'contador':
        el = { type: 'COUNTER', clk: de(m.clk), rst: de(m.rst), q: m.q.map(de), co: de(m.co), modulo: opcion(m.hasta) === '15' ? 16 : 10, ...r }
        break
      case 'decodificador':
        el = { type: 'DECODER', inputs: m.entradas.map(de), outputs: m.salidas.map(de), activo_alto: opcion(m.polaridad) !== m.bajo, ...r }
        break
      case 'estado-logico':
        el = { type: 'LOGIC', out: de(m.salida), value: opcion(m.prop) === '1' ? 1 : 0 }
        break
    }
    digitales.set(p.id, { familia: f.nombre, alimentacion: f.vcc, elemento: -1, pines })
    elementosDigitales.push({ pieza: p, tipo: m.tipo, el, modelo: true })
  }

  /** Pieza `lut` o `msi`: como una pieza digital, pero un pin bidireccional lleva un puente de entrada y otro de salida
   * sobre el mismo nodo cuando su red es analógica, y las tablas se comparten por contenido. */
  function armarMsi(p: Pieza, def: PiezaDef, m: Extract<ModeloDigital, { tipo: 'lut' | 'msi' }>): void {
    const f = familiaDe(p, def, m)
    if (!f.ok) {
      errores.push(f.error)
      return
    }
    if (f.aviso) avisos.push(f.aviso)
    const k = f.params
    const red = (pin: string) => con.redDePin.get(clavePin(p.id, pin))!
    const nombre = (pin: string) => `El pin ${def.pines.find((x) => x.id === pin)!.nombre} de ${p.ref}`
    const leidas = new Map<string, number>()
    const manejadas = new Map<string, number>()
    const contexto: ContextoMsi = {
      leer(pin) {
        const antes = leidas.get(pin)
        if (antes !== undefined) return antes
        const r = red(pin)
        let d = redDigital.get(r)
        if (d === undefined) {
          d = nuevaDigital()
          if (r === tierraDoc) elementosDigitales.push({ pieza: p, tipo: m.tipo, el: { type: 'LOGIC', out: d, value: 0 } })
          else {
            const dn = d
            entradasAnalogicas.push({ pieza: p, pin: def.pines.find((x) => x.id === pin)?.nombre ?? pin, red: r, bajo: k.in_low, alto: k.in_high, familia: opcionDe(p, def, 'familia') })
            const carga = k.r_in !== undefined ? { r_in: k.r_in, v_in: k.v_in ?? 0 } : {}
            pendientes.push({
              pieza: p, terminales: [{ red: r, etiqueta: nombre(pin) }], tipo: m.tipo, grupos: k.r_in !== undefined ? [{ pines: [0], tierra: true }] : [],
              el: ([nodo]) => ({ type: 'ADC', p: nodo, n: 0, out: dn, in_low: k.in_low, in_high: k.in_high, ...carga })
            })
          }
        }
        leidas.set(pin, d)
        return d
      },
      manejar(pin, tres) {
        const antes = manejadas.get(pin)
        if (antes !== undefined) return antes
        const r = red(pin)
        let d = redDigital.get(r)
        if (d === undefined) {
          d = nuevaDigital()
          const dn = d
          pendientes.push({
            pieza: p, terminales: [{ red: r, etiqueta: nombre(pin) }], tipo: m.tipo, grupos: [{ pines: [0], tierra: true }],
            el: ([out]) => ({ type: 'DAC', input: dn, out, v_lo: k.v_lo, v_hi: k.v_hi, r_lo: k.r_lo, r_hi: k.r_hi, t_rise: k.t_rise, t_fall: k.t_fall, ...(tres ? { z: true } : {}) })
          })
          manejoDeRed.set(r, dn)
        }
        manejadas.set(pin, d)
        return d
      },
      tabla: indiceTabla
    }
    const el = elementoMsi(m, k, opcionDe(p, def, m.familia), f.vcc, contexto)
    if ('error' in el) {
      errores.push(`${p.ref}: ${el.error}`)
      return
    }
    const pines: PiezaDigitalNetlist['pines'] = pinesDigitales(m).map((pin) => ({
      id: pin.id, nombre: def.pines.find((x) => x.id === pin.id)?.nombre ?? pin.id, red: (pin.salida ? manejadas.get(pin.id) : leidas.get(pin.id)) ?? -1, redDoc: red(pin.id), salida: pin.salida
    }))
    digitales.set(p.id, { familia: f.nombre, alimentacion: f.vcc, elemento: -1, pines })
    elementosDigitales.push({ pieza: p, tipo: m.tipo, el, modelo: true })
  }

  /** Convertidores, DIP y teclado: lo arman `convertidores.ts` y `teclado.ts`; aquí solo se les dan las redes, lo que hay conectado alrededor y dónde poner los elementos. */
  function armarMixto(p: Pieza, def: PiezaDef, m: Extract<ModeloDef, { tipo: 'convertidor-ad' | 'convertidor-da' | 'interruptores' | 'teclado' }>): void {
    const red = (pin: string) => con.redDePin.get(clavePin(p.id, pin))!
    const etiqueta = (pin: string) => `El pin ${def.pines.find((y) => y.id === pin)!.nombre} de ${p.ref}`
    const analogico = (terminales: { red: number; etiqueta: string; mudo?: true; pin?: string }[], el: (nodos: number[]) => ElementoMotor, grupos: { pines: number[]; tierra: boolean }[]) =>
      pendientes.push({ pieza: p, terminales, el, tipo: m.tipo, grupos })
    if (m.tipo === 'interruptores' || m.tipo === 'teclado') {
      const canal = (propId: string, k: number, inicial: 0 | 1) => {
        canalDe.set(`${p.id}:${propId}:${k}`, canales.length)
        canales.push({ inicial })
        return canales.length - 1
      }
      if (m.tipo === 'teclado') armarTeclado(m, { red, etiqueta, canal, analogico })
      else armarInterruptores(m, p.props[m.estado] ?? def.props.find((d) => d.id === m.estado)?.defecto ?? '', { red, etiqueta, canal, analogico })
      return
    }
    const comun = { ref: p.ref, red, etiqueta, nuevaDigital, interna: nuevaInterna, analogico, digital: (el: ElementoMotor) => elementosDigitales.push({ pieza: p, tipo: m.tipo, el }), manejo: (r: number, d: number) => manejoDeRed.set(r, d) }
    if (m.tipo === 'convertidor-da') return armarDac0808(m, comun)
    /** Los valores (Ω o F) de las piezas de un tipo cuyos dos pines están en las redes `a` y `b`, en cualquier orden. */
    const valoresEntre = (tipo: 'R' | 'C', a: number, b: number): number[] =>
      piezas.flatMap((q) => {
        const d = lib.get(q.tipo)
        const mq = d?.modelo
        if (!d || mq?.tipo !== tipo) return []
        const [x, y] = [con.redDePin.get(clavePin(q.id, mq.a)), con.redDePin.get(clavePin(q.id, mq.b))]
        if (!((x === a && y === b) || (x === b && y === a))) return []
        const v = leerPropiedad(q, d, mq.prop, null)
        return v.ok && v.valor > 0 ? [v.valor] : []
      })
    /** El voltaje de una red unida a tierra por una fuente de continua (con su signo); undefined si no es el caso. */
    const voltajeFijoDeRed = (a: number): number | undefined => {
      for (const q of piezas) {
        const d = lib.get(q.tipo)
        const mq = d?.modelo
        if (!d || mq?.tipo !== 'V') continue
        const [x, y] = [con.redDePin.get(clavePin(q.id, mq.a)), con.redDePin.get(clavePin(q.id, mq.b))]
        if (tierraDoc === undefined || !((x === a && y === tierraDoc) || (x === tierraDoc && y === a))) continue
        const v = leerPropiedad(q, d, mq.prop, null)
        if (v.ok) return x === a ? v.valor : -v.valor
      }
      return undefined
    }
    const r = armarAdc0804(m, {
      ...comun,
      resistenciasEntre: (a, b) => valoresEntre('R', a, b),
      capacitoresATierra: (a) => (tierraDoc === undefined ? [] : valoresEntre('C', a, tierraDoc)),
      voltajeFijo: (a) => voltajeFijoDeRed(a),
      // Algo más que la R de CLK R y la C a tierra toca la red de CLK IN.
      relojExterno: (rIn) =>
        (con.redes.find((x) => x.id === rIn)?.pines ?? []).some((clave) => {
          const { piezaId, pinId } = partirClavePin(clave)
          if (piezaId === p.id) return false
          const q = doc.piezas[piezaId]
          const mq = q ? lib.get(q.tipo)?.modelo : undefined
          if (mq?.tipo !== 'R' && mq?.tipo !== 'C') return true
          const otro = con.redDePin.get(clavePin(piezaId, pinId === mq.a ? mq.b : mq.a))
          return mq.tipo === 'R' ? otro !== red(m.clkr) : otro !== tierraDoc
        })
    }, indiceTabla)
    if ('error' in r) errores.push(r.error)
    else relojesAdc.set(p.id, r.reloj)
  }

  /** El 555 como lo arma el motor: divisor de tres resistencias con la toma de abajo en una red interna, consumo,
   * comparadores de umbral, disparo y reinicio, biestable y salida con la descarga. */
  function armar555(p: Pieza, def: PiezaDef, m: Extract<ModeloDef, { tipo: '555' }>): void {
    const modelo = opcionDe(p, def, m.prop)
    const x = m.modelos[modelo]
    const red = (pin: string) => con.redDePin.get(clavePin(p.id, pin))!
    const nombre = (pin: string) => `El pin ${def.pines.find((y) => y.id === pin)!.nombre} de ${p.ref}`
    const [gnd, trig, out, reset, cv, thr, dis, vcc] = [m.gnd, m.trig, m.out, m.reset, m.cv, m.thr, m.dis, m.vcc].map(red)
    const tref = nuevaInterna()
    const [sobre, bajo, resok, q] = [nuevaDigital(), nuevaDigital(), nuevaDigital(), nuevaDigital()]
    const g = [{ pines: [0, 1], tierra: false }]
    // CV, OUT y DIS cuentan como conexión de su red sin que el 555 pida conectarlos (`mudo`).
    const resistencia = (a: number, ea: string, b: number, eb: string, ohms: number, bMudo = false) =>
      pendientes.push({ pieza: p, terminales: [{ red: a, etiqueta: ea }, { red: b, etiqueta: eb, ...(bMudo ? { mudo: true as const } : {}) }], tipo: '555', grupos: g, el: ([na, nb]) => ({ type: 'R', a: na, b: nb, ohms }) })
    resistencia(vcc, nombre(m.vcc), cv, '', x.rdiv, true)
    resistencia(cv, '', tref, '', x.rdiv)
    resistencia(tref, '', gnd, nombre(m.gnd), x.rdiv)
    resistencia(vcc, '', gnd, '', x.rq)
    /** Un comparador; si sus dos redes son la misma, su nivel no cambia y va como un estado lógico. */
    const comparador = (a: number, ea: string, b: number, eb: string, salida: number, umbral: number) => {
      if (a === b) elementosDigitales.push({ pieza: p, tipo: '555', el: { type: 'LOGIC', out: salida, value: 0 >= umbral ? 1 : 0 } })
      else pendientes.push({ pieza: p, terminales: [{ red: a, etiqueta: ea }, { red: b, etiqueta: eb }], tipo: '555', grupos: [], el: ([na, nb]) => ({ type: 'ADC', p: na, n: nb, out: salida, in_low: umbral, in_high: umbral }) })
    }
    comparador(thr, nombre(m.thr), cv, '', sobre, 0)
    comparador(tref, '', trig, nombre(m.trig), bajo, 0)
    comparador(reset, nombre(m.reset), gnd, '', resok, x.vres)
    elementosDigitales.push({ pieza: p, tipo: '555', el: { type: 'LATCH555', trig: bajo, thr: sobre, res: resok, q, delay: x.td } })
    const salida: Pendiente = {
      pieza: p, terminales: [{ red: out, etiqueta: '', mudo: true }, { red: dis, etiqueta: '', mudo: true }, { red: vcc, etiqueta: '' }, { red: gnd, etiqueta: '' }], tipo: '555', grupos: [{ pines: [0, 1, 2, 3], tierra: false }],
      el: ([no, nd, nv, ng]) => ({ type: 'OUT555', q, out: no, dis: nd, vcc: nv, gnd: ng, v_lo: x.vlo, r_lo: x.rlo, v_hi: x.vhi, r_hi: x.rhi, g_on: 1 / x.rdis, g_off: 1e-9, t_rise: x.tr, t_fall: x.tf })
    }
    pendientes.push(salida)
    manejoDeRed.set(out, q)
    marcados.set(salida, (i) => temporizadores.set(p.id, { q, salida: i, thr, trig, vcc, gnd, modelo, vmin: x.vmin, vmax: x.vmax }))
  }

  /** Pieza de dos terminales con resistencia en serie (ESR, alambre de bobina, resistencia interna): elemento principal y
   * resistencia unidos por una red interna. Con `ultima` el principal va de `a` a la red interna; con `primera`, al
   * revés. El principal va primero: de él salen la corriente y los límites de la pieza. */
  function enSerie(p: Pieza, tipo: ModeloDef['tipo'], ids: string[], redes: number[], ohms: number, lugar: 'primera' | 'ultima', principal: (a: number, b: number) => ElementoMotor): void {
    const x = nuevaInterna()
    const def = lib.get(p.tipo)!
    const pin = (k: number) => ({ red: redes[k], etiqueta: `El pin ${def.pines.find((y) => y.id === ids[k])!.nombre} de ${p.ref}`, pin: ids[k] })
    const interna = { red: x, etiqueta: '', mudo: true as const }
    const grupos = [{ pines: [0, 1], tierra: false }]
    const hacerR = ([n0, n1]: number[]): ElementoMotor => ({ type: 'R', a: n0, b: n1, ohms })
    const cabeza: Pendiente = { pieza: p, terminales: lugar === 'ultima' ? [pin(0), interna] : [interna, pin(1)], tipo, grupos, el: ([n0, n1]) => principal(n0, n1) }
    const resto: Pendiente = { pieza: p, terminales: lugar === 'ultima' ? [interna, pin(1)] : [pin(0), interna], tipo, grupos, el: hacerR }
    pendientes.push(cabeza, resto)
    const c = { elementos: [-1, -1], i: -1, mas: redes[0], menos: redes[1] }
    compuestos.set(p.id, c)
    marcados.set(cabeza, (i) => {
      c.elementos[0] = i
      c.i = i
    })
    marcados.set(resto, (i) => (c.elementos[1] = i))
  }

  /** Pieza `compuesto`: elementos con nodos del documento y redes internas, y valores de la opción elegida o de las propiedades.
   * Un pin que aparece por primera vez lleva su etiqueta de «no está conectado»; los opcionales (ULN2003 sin usar) cuentan como conexión muda. */
  // Con menos de PASOS_MINIMOS pasos por periodo aun con el paso más corto, la fuente se simula pero la onda no se sigue.
  function avisarFrecuenciaDe(p: Pieza, hz: number): void {
    if (1 / (hz * PASO_MIN) < PASOS_MINIMOS) avisos.push(`La fuente ${p.ref} de ${formatearValor(hz, 'Hz')} es más rápida de lo que la vista previa puede seguir.`)
  }

  type ModeloNuevo = Extract<ModeloDef, { tipo: 'jfet' | 'termistor' | 'ldr' | 'pasos' | 'controlada' | 'pwl' }>

  /** JFET, termistor, fotorresistencia, motor a pasos, fuentes controladas y PWL: un elemento del motor cada uno. La perilla
   * de un sensor es su canal. */
  function armarNuevo(p: Pieza, def: PiezaDef, m: ModeloNuevo, redes: number[], ids: string[], etiqueta: (id: string) => string): void {
    const opcion = 'modelos' in m ? opcionDe(p, def, m.prop) : ''
    const x = 'modelos' in m ? m.modelos[opcion] : {}
    const canal = (prop: string): number | null => {
      const c = canalDe.get(`${p.id}:${prop}`)
      if (c === undefined) errores.push(`La perilla «${prop}» de ${p.ref} no existe o no se pudo leer.`)
      return c ?? null
    }
    /** Los pines en el orden dado; un pin repetido (la toma central) dice su etiqueta una sola vez. */
    const poner = (lista: string[], grupos: Pendiente['grupos'], el: Pendiente['el']) =>
      pendientes.push({ pieza: p, terminales: lista.map((id, k) => ({ red: redes[ids.indexOf(id)], etiqueta: lista.indexOf(id) === k ? etiqueta(id) : '', pin: id })), el, tipo: m.tipo, grupos })
    const mismaRed = () => void avisos.push(`${p.ref} tiene sus dos terminales en la misma red y se omite.`)
    switch (m.tipo) {
      case 'jfet':
        poner([m.d, m.g, m.s], gruposDelModelo(m), ([d, g, s]) => ({ type: 'J', d, g, s, pjf: m.pjf, model: x }))
        break
      case 'termistor': {
        if (redes[0] === redes[1]) return mismaRed()
        const c = canal(m.temperatura)
        if (c === null) return
        const rt = m.tablas?.[opcion]
        poner([m.a, m.b], gruposDelModelo(m), ([a, b]) => ({ type: 'TERM', a, b, tipo: m.ptc ? 'ptc' : 'ntc', r25: x.r25, beta: x.beta, ...(rt ? { rt } : {}), delta: x.delta, tau: x.tau, canal: c, tmax: x.tmax }))
        break
      }
      case 'ldr': {
        if (redes[0] === redes[1]) return mismaRed()
        const c = canal(m.luz)
        if (c === null) return
        poner([m.a, m.b], gruposDelModelo(m), ([a, b]) => ({ type: 'LDR', a, b, r10: x.r10, gamma: x.gamma, roscuro: x.roscuro, tau_sube: x.tau_sube, tau_baja: x.tau_baja, canal: c }))
        break
      }
      case 'pasos': {
        const c = m.carga !== undefined ? canal(m.carga) : undefined
        if (c === null) return
        const opcionales = { ...(x.k_mutua !== undefined ? { k_mutua: x.k_mutua } : {}), ...(x.reduccion !== undefined ? { reduccion: x.reduccion } : {}), ...(c !== undefined ? { canal_carga: c } : {}) }
        // Los índices de los grupos son de `nodos` (con la toma central repetida), no de los pines únicos.
        const grupos = m.unipolar ? [{ pines: m.nodos.map((_, k) => k), tierra: false }] : gruposDelModelo(m)
        poner(m.nodos, grupos, (nodos) => ({ type: 'PASOS', nodos, ...(m.unipolar ? { unipolar: true } : {}), r: x.r, l: x.l, km: x.km, dientes: x.dientes, td: x.td, j: x.j, bm: x.bm, ...opcionales }))
        break
      }
      case 'controlada': {
        const v = leerPropiedad(p, def, m.prop, null)
        if (!v.ok) return void errores.push(v.error)
        const valor = v.valor
        poner([m.p, m.n, m.cp, m.cn], gruposDelModelo(m), ([pp, nn, cp, cn]) => {
          const base = { p: pp, n: nn, cp, cn }
          return m.forma === 'E' ? { type: 'E', ...base, ganancia: valor } : m.forma === 'G' ? { type: 'G', ...base, gm: valor } : m.forma === 'H' ? { type: 'H', ...base, r: valor } : { type: 'F', ...base, ganancia: valor }
        })
        break
      }
      case 'pwl': {
        if (redes[0] === redes[1]) return mismaRed()
        const texto = p.props[m.puntos] ?? def.props.find((d) => d.id === m.puntos)?.defecto ?? ''
        const r = leerPuntosPwl(texto)
        if (!r.ok) return void errores.push(`Los puntos de ${p.ref} no son válidos: ${r.error}`)
        const opciones = (id: string) => def.props.find((d) => d.id === id)?.opciones ?? []
        // El motor solo tiene PWL en fuentes de voltaje (`Element::I` no lleva onda).
        if (/corr|^i$|amper/i.test(opcionDe(p, def, m.modo))) return void errores.push(`${p.ref} en modo corriente aún no se simula.`)
        const repetir = opcionDe(p, def, m.repetir) === opciones(m.repetir)[1]
        poner([m.a, m.b], gruposDelModelo(m), ([a, b]) => ({ type: 'V', a, b, wave: { kind: 'pwl', puntos: r.puntos, ...(repetir ? { repetir: true } : {}) } }))
        break
      }
    }
  }

  /** El L298: lo arma `puenteH.ts`; aquí solo se le dan las redes, las etiquetas y dónde poner los elementos. */
  function armarPuente(p: Pieza, def: PiezaDef, m: Extract<ModeloDef, { tipo: 'puente-h' }>): void {
    const nombre = (pin: string) => `El pin ${def.pines.find((y) => y.id === pin)!.nombre} de ${p.ref}`
    armarPuenteH(m, m.modelos[opcionDe(p, def, m.prop)], {
      red: (pin) => con.redDePin.get(clavePin(p.id, pin))!,
      etiqueta: nombre,
      nuevaDigital,
      analogico: (terminales, el, grupos) => pendientes.push({ pieza: p, terminales, el, tipo: m.tipo, grupos }),
      digital: (el) => elementosDigitales.push({ pieza: p, tipo: m.tipo, el }),
      manejo: (red, digital) => manejoDeRed.set(red, digital)
    })
  }

  function armarCompuesto(p: Pieza, def: PiezaDef, m: Extract<ModeloDef, { tipo: 'compuesto' }>, redes: number[], ids: string[], etiqueta: (id: string) => string): void {
    const modelo = m.modelos && m.prop ? m.modelos[opcionDe(p, def, m.prop)] : undefined
    const props = new Map<string, number>()
    for (const prop of propiedadesDeCompuesto(m)) {
      const r = leerPropiedad(p, def, prop, null)
      if (!r.ok) {
        errores.push(r.error)
        return
      }
      props.set(prop, r.valor)
    }
    const valor = (v: Parameters<typeof resolverValor>[0]) => resolverValor(v, modelo, (id) => props.get(id)!)
    for (const e of m.elementos) {
      if (e.t === 'EXT' && !canalDe.has(`${p.id}:${e.canal}`)) {
        errores.push(`La perilla «${e.canal}» de ${p.ref} no existe o no se pudo leer.`)
        return
      }
    }
    const canal = (prop: string) => canalDe.get(`${p.id}:${prop}`)!
    // Las fuentes senoidales internas (la trifásica) piden lo mismo que la fuente senoidal: frecuencia mayor que cero y, si pasa de lo
    // que la vista previa sigue, un aviso (uno por frecuencia distinta, no uno por fase).
    const frecuencias = new Set<number>()
    for (const e of m.elementos) {
      if (e.t !== 'senoidal') continue
      const hz = valor(e.freq)
      if (!(hz > 0)) {
        errores.push(`La frecuencia de ${p.ref} debe ser mayor que cero.`)
        return
      }
      frecuencias.add(hz)
    }
    for (const hz of frecuencias) avisarFrecuenciaDe(p, hz)
    const redDe = new Map<string, number>(ids.map((id, k) => [id, redes[k]]))
    for (const interna of m.internas ?? []) redDe.set(interna, nuevaInterna())
    const dicho = new Set<string>()
    const podados = elementosPodados(m, (pin) => (con.redes[redDe.get(pin)!]?.pines.length ?? 0) <= 1)
    const c = { elementos: m.elementos.map(() => -1), i: -1, mas: redDe.get(m.medida.mas)!, menos: redDe.get(m.medida.menos)!, ...(m.medida.region !== undefined ? { region: m.medida.region } : {}) }
    compuestos.set(p.id, c)
    m.elementos.forEach((e, k) => {
      // Un elemento de dos terminales con los dos en la misma red (la punta lógica sobre su pinza +, la entrada del LM386 a tierra)
      // no hace nada y el motor lo rechaza: se omite y su casilla queda en -1.
      if ((e.t === 'R' || e.t === 'C' || e.t === 'L' || e.t === 'D' || e.t === 'I') && redDe.get(e.a) === redDe.get(e.b)) return
      if (podados.has(k)) return
      const terminales = nodosDeElementoCompuesto(e).map((n) => {
        const red = redDe.get(n)!
        if (!ids.includes(n)) return { red, etiqueta: '', mudo: true as const }
        if (m.opcionales?.includes(n)) return { red, etiqueta: '', mudo: true as const, pin: n }
        const primera = !dicho.has(n)
        dicho.add(n)
        return { red, etiqueta: primera ? etiqueta(n) : '', pin: n }
      })
      const q: Pendiente = { pieza: p, terminales, tipo: 'compuesto', grupos: gruposDeElemento(e), el: (ns) => elementoDelMotor(e, ns, valor, canal) }
      pendientes.push(q)
      marcados.set(q, (i) => {
        c.elementos[k] = i
        if (k === m.medida.i) c.i = i
      })
    })
  }

  /** Comparador de colector abierto con lo que el motor ya tiene: un amplificador de una etapa maneja por `rbase` la base
   * de un NPN cuyo colector es la salida y cuyo emisor es V−. Con `menos` sobre `mas` conduce y la salida baja; al revés
   * queda al aire y la sube la carga. El transistor va al final: la medición de la pieza es su VCE y su corriente. */
  function armarComparador(p: Pieza, def: PiezaDef, m: Extract<ModeloDef, { tipo: 'comparador' }>, redes: number[], ids: string[], etiqueta: (id: string) => string): void {
    const x = m.modelos[opcionDe(p, def, m.prop)]
    const [mas, menos, sal, vmas, vmenos] = redes
    const salidaAmp = nuevaInterna()
    const base = nuevaInterna()
    const model: Parametros = {}
    for (const k of PARAMETROS.ampop.nombres) model[k] = x[k]
    const q: Parametros = { is: x.is, bf: x.bf, rc: x.rc, cje: x.cje, cjc: x.cjc, tf: x.tf, tr: x.tr }
    const t = (red: number, k: number) => ({ red, etiqueta: etiqueta(ids[k]), pin: ids[k] })
    const interna = (red: number) => ({ red, etiqueta: '', mudo: true as const })
    pendientes.push({ pieza: p, terminales: [t(menos, 1), t(mas, 0), interna(salidaAmp), t(vmas, 3), t(vmenos, 4)], tipo: 'comparador', grupos: [{ pines: [0, 1], tierra: false }, { pines: [3, 4], tierra: false }, { pines: [2], tierra: true }], el: ([pp, nn, out, vp, vn]) => ({ type: 'OA', p: pp, n: nn, out, vp, vn, model }) })
    pendientes.push({ pieza: p, terminales: [interna(salidaAmp), interna(base)], tipo: 'comparador', grupos: [{ pines: [0, 1], tierra: false }], el: ([a, b]) => ({ type: 'R', a, b, ohms: x.rbase }) })
    // Su carga almacenada se vacía dentro de un solo paso de la vista previa: con el trapecio la salida saltaba sobre el riel.
    pendientes.push({ pieza: p, terminales: [t(sal, 2), interna(base), t(vmenos, 4)], tipo: 'comparador', grupos: [{ pines: [0, 1, 2], tierra: false }], el: ([c, b, e]) => ({ type: 'Q', c, b, e, pnp: false, model: q, euler: true }) })
  }

  /** Lo que el armado de un instrumento (`netlist/instrumentos.ts`) necesita de esta netlist. */
  function armadoDe(p: Pieza, def: PiezaDef): ArmadoInstrumento {
    return {
      red: (pin) => con.redDePin.get(clavePin(p.id, pin))!,
      conectada: (red) => (con.redes[red]?.pines.length ?? 0) >= 2,
      etiqueta: (pin) => `El pin ${def.pines.find((x) => x.id === pin)!.nombre} de ${p.ref}`,
      tierra: tierraDoc ?? -1,
      esDigitalPura: (red) => puras.has(red),
      nuevaInterna,
      elemento: (terminales, el, alNumerar) => {
        const q: Pendiente = { pieza: p, terminales, el, tipo: def.modelo!.tipo, grupos: [{ pines: [0, 1], tierra: false }] }
        pendientes.push(q)
        if (alNumerar) marcados.set(q, alNumerar)
      },
      sonda: (s) => sondasPorArmar.push(s) - 1,
      error: (t) => errores.push(t)
    }
  }

  /** El display: un LED por segmento conectado, del segmento al común (cátodo común) o del común al segmento (ánodo común). */
  function armarDisplay(p: Pieza, def: PiezaDef, m: Extract<ModeloDef, { tipo: 'display' }>): void {
    const { is, n } = parametrosDiodo(m, p, def)
    const anodo = opcionDe(p, def, m.conexion) === m.anodo
    const red = (pin: string) => con.redDePin.get(clavePin(p.id, pin))!
    const nombre = (pin: string) => `El pin ${def.pines.find((y) => y.id === pin)!.nombre} de ${p.ref}`
    const com = red(m.comun)
    const indices = m.segmentos.map(() => -1)
    let primero = true
    m.segmentos.forEach((s, k) => {
      const r = red(s)
      // Un segmento sin conectar se queda apagado: su LED no se arma.
      if ((con.redes[r]?.pines.length ?? 0) < 2 || r === com) return
      const eCom = primero ? nombre(m.comun) : ''
      primero = false
      const seg = { red: r, etiqueta: '', mudo: true as const }
      const terminales = anodo ? [{ red: com, etiqueta: eCom }, seg] : [seg, { red: com, etiqueta: eCom }]
      const led: Pendiente = { pieza: p, terminales, tipo: 'display', grupos: [{ pines: [0, 1], tierra: false }], el: ([a, b]) => ({ type: 'D', a, b, is, n }) }
      pendientes.push(led)
      marcados.set(led, (i) => (indices[k] = i))
    })
    displays.set(p.id, indices)
  }

  const alimentacion = terminalesDeAlimentacion(doc, lib, con)
  for (const c of alimentacion.conflictos) errores.push(c.texto)
  // Sin tierra solo llega aquí un circuito solo digital, que no tiene terminales de alimentación.
  const redTierra = con.redes.find((r) => r.tierra)?.id ?? -1
  for (const [red, ts] of alimentacion.grupos) {
    const etiqueta = (t: TerminalAlimentacion) => {
      const def = lib.get(t.pieza.tipo)!
      const pin = (def.modelo as { pin: string }).pin
      return `El pin ${def.pines.find((x) => x.id === pin)!.nombre} de ${t.pieza.ref}`
    }
    // Una sola fuente por red aunque haya varios terminales con el mismo nombre; los demás solo cuentan como conexiones del pin.
    pendientes.push({
      pieza: ts[0].pieza,
      terminales: [{ red, etiqueta: etiqueta(ts[0]) }, { red: redTierra, etiqueta: '' }],
      extra: ts.slice(1).map(etiqueta),
      el: ([a, b]) => ({ type: 'V', a, b, wave: { kind: 'dc', v: ts[0].voltaje } }),
      tipo: 'alimentacion',
      grupos: [{ pines: [0, 1], tierra: false }]
    })
  }

  // Con un valor que no se lee, una pieza omitida dejaría pines «sin conectar» que no lo están: solo se dan los errores de valor.
  if (errores.length) return nulo()
  // Las fugas van al final (no corren los índices de las piezas) y siempre, abierto o cerrado el contacto: accionarlo sigue
  // siendo un cambio en caliente. No tienen pieza: no dan lectura ni nombre en los avisos.
  for (const t of trasContactos) {
    const dueño = doc.piezas[partirClavePin(con.redes.find((x) => x.id === t.red)!.pines[0]).piezaId]
    pendientes.push({ pieza: dueño, sinLectura: true, terminales: [{ red: t.red, etiqueta: '' }], tipo: 'R', grupos: [{ pines: [0], tierra: true }], el: ([a]) => ({ type: 'R', a, b: 0, ohms: R_FUGA }) })
  }

  let siguiente = 1
  const terminales = new Map<number, string[]>()
  const nodo = (red: number, etiqueta: string) => {
    const lista = terminales.get(red) ?? []
    if (etiqueta) lista.push(etiqueta)
    terminales.set(red, lista)
    let n = nodoDeRed.get(red)
    if (n === undefined) {
      n = siguiente++
      nodoDeRed.set(red, n)
    }
    return n
  }
  if (canales.length > CANALES_MAX) errores.push(`Hay ${canales.length} canales (perillas, interruptores y teclas) y el motor admite ${CANALES_MAX}.`)
  const elementos: ElementoMotor[] = []
  const piezaDeElemento: Id[] = []
  const tipoDeElemento: ModeloDef['tipo'][] = []
  const nodosDe: number[][] = []
  for (const q of pendientes) {
    const nodos = q.terminales.map((t) => nodo(t.red, t.mudo ? MUDO : t.etiqueta))
    for (const e of q.extra ?? []) nodo(q.terminales[0].red, e)
    marcados.get(q)?.(elementos.length)
    elementos.push(q.el(nodos))
    piezaDeElemento.push(q.sinLectura ? '' : q.pieza.id)
    tipoDeElemento.push(q.tipo)
    nodosDe.push(nodos)
  }
  for (const d of elementosDigitales) {
    if (d.modelo) digitales.get(d.pieza.id)!.elemento = elementos.length
    elementos.push(d.el)
    piezaDeElemento.push(d.pieza.id)
    tipoDeElemento.push(d.tipo)
  }
  // Los convertidores se leen por su elemento propio: el MSI del ADC0804 (INTR es su última salida) y el DACM del DAC0808.
  elementos.forEach((e, k) => {
    const id = piezaDeElemento[k]
    if (tipoDeElemento[k] === 'convertidor-ad' && e.type === 'MSI') {
      const m = lib.get(doc.piezas[id]?.tipo ?? '')?.modelo
      convertidores.set(id, { elemento: k, intr: e.salidas[e.salidas.length - 1], ...(m?.tipo === 'convertidor-ad' ? { vref2: con.redDePin.get(clavePin(id, m.vref2)) } : {}) })
    } else if (tipoDeElemento[k] === 'convertidor-da' && e.type === 'DACM') convertidores.set(id, { elemento: k })
  })
  // Por dónde entra la corriente de cada casilla de terminal (el reparto entre los tramos de cable).
  const puertos = puertosDeElementos(pendientes, elementos, nodoDeRed, con, lib, tierraDoc ?? -1)
  // Las fugas de las entradas tras un contacto (sin pieza) no avisan.
  const potencias = elementos.flatMap((e, k) => piezaDeElemento[k] === '' || compuestos.has(piezaDeElemento[k]) ? [] : ((e.type === 'R' && POTENCIA_DE_PIEZA.has(tipoDeElemento[k])) || e.type === 'Q' || e.type === 'M' || (e.type === 'D' && tipoDeElemento[k] === 'zener') || (e.type === 'FUSE' && tipoDeElemento[k] === 'fusible') ? [k] : []))

  // Un valor que el motor rechazaría por su rango se dice aquí con el nombre de la pieza (un potenciómetro da dos elementos).
  const dichos = new Set<string>()
  elementos.forEach((e, k) => {
    const ref = doc.piezas[piezaDeElemento[k]]?.ref
    const texto = ref ? errorDeRango(e, ref) : null
    if (texto && !dichos.has(texto)) {
      dichos.add(texto)
      errores.push(texto)
    }
  })

  for (const [red, ts] of terminales) if (ts.length === 1 && ts[0] !== MUDO && nodoDeRed.get(red) !== 0) errores.push(`${ts[0]} no está conectado a nada.`)

  // Islas sin camino a tierra: componentes conexas de nodos (unidos por dentro de cada pieza) que no contienen el 0.
  const uf = new UnionFind<number>()
  pendientes.forEach((q, i) => {
    for (const g of q.grupos) {
      const ns = g.pines.map((k) => nodosDe[i][k])
      for (const n of ns) uf.unir(ns[0], n)
      if (g.tierra) uf.unir(ns[0], 0)
    }
  })
  const raizTierra = uf.buscar(0)
  const islas = new Map<number, Set<string>>()
  const conTransformador = new Set<number>()
  const conOptoacoplador = new Set<number>()
  pendientes.forEach((q, i) => {
    for (const g of q.grupos) {
      const raiz = uf.buscar(nodosDe[i][g.pines[0]])
      if (raiz === raizTierra) continue
      const refs = islas.get(raiz) ?? new Set<string>()
      refs.add(q.pieza.ref)
      islas.set(raiz, refs)
      if (esTransformador(lib.get(q.pieza.tipo))) conTransformador.add(raiz)
      if (esOptoacoplador(lib.get(q.pieza.tipo))) conOptoacoplador.add(raiz)
    }
  })
  for (const [raiz, refs] of islas) {
    const lista = [...refs].sort()
    const pista = (conTransformador.has(raiz) ? ` ${PISTA_TRANSFORMADOR}` : '') + (conOptoacoplador.has(raiz) ? ` ${PISTA_OPTOACOPLADOR}` : '')
    errores.push((lista.length === 1 ? `${lista[0]} no tiene camino a tierra.` : `${lista.join(', ')} no tienen camino a tierra.`) + pista)
  }

  errores.push(...fuentesPrevias(elementos, (k) => doc.piezas[piezaDeElemento[k]]?.ref ?? ''))
  for (const d of diodosDirectos(doc, lib, con)) errores.push(d.texto)
  if (siguiente < 2 && siguienteDigital === 0 && !errores.length) errores.push('El circuito no tiene nodos fuera de tierra.')
  // Las sondas de los instrumentos, con los nodos y los elementos ya numerados y la memoria repartida.
  // Los medidores rápidos en AC con voltaje: una sonda de su red a tierra, con la ventana que lleva el motor como la de un multímetro.
  if (tierraDoc !== undefined) {
    for (const m of medidoresDe(doc)) {
      const red = con.redDeSonda.get(m.id)
      if (m.modo !== 'ac' || m.magnitud === 'corriente' || red === undefined || red === tierraDoc || !nodoDeRed.has(red)) continue
      instrumentos.medidores.set(m.id, { sonda: sondasPorArmar.push({ kind: 'v', redP: red, redN: tierraDoc, uso: 'multimetro', columna: COLUMNA_MULTIMETRO }) - 1 })
    }
  }
  const muestras = repartirMemoria(sondasPorArmar.map((s) => s.uso))
  if (typeof muestras === 'string') errores.push(muestras)
  if (errores.length) return nulo()
  avisos.push(...avisosDeUmbral(entradasAnalogicas, elementos, nodoDeRed, instrumentos))
  avisos.push(...avisosDeCarga(piezas, lib, con, tierraDoc))
  /** El nivel alto de una red digital pura: la alimentación de quien la maneja (5 V si nadie). */
  const altoDe = (redDoc: number) => {
    for (const d of digitales.values()) for (const q of d.pines) if (q.salida && q.redDoc === redDoc) return d.alimentacion
    return 5
  }
  const sondas: SondaMotor[] = sondasPorArmar.map((s, k) => {
    const n = (muestras as number[])[k]
    const rejilla = sinRejilla(s.uso) ? { sin_rejilla: true } : {}
    if (s.kind === 'v') return { kind: 'v', p: nodoDeRed.get(s.redP) ?? 0, n: nodoDeRed.get(s.redN) ?? 0, muestras: n, columna: s.columna, ...rejilla }
    if (s.kind === 'i') return { kind: 'i', element: s.elemento(), signo: s.signo, muestras: n, columna: s.columna, ...rejilla }
    return { kind: 'd', red: redDigital.get(s.redDoc)!, bajo: 0, alto: altoDe(s.redDoc), muestras: n, columna: s.columna }
  })
  return {
    netlist: { nodes: siguiente, digital_nets: siguienteDigital, elements: elementos, ...(sondas.length ? { sondas } : {}), ...(canales.length ? { canales } : {}), ...(tablasMotor.length ? { tablas: tablasMotor } : {}) },
    nodoDeRed, piezaDeElemento, potenciometros, tipoDeElemento, umbrales, redDigital, digitales, temporizadores, displays, manejoDeRed, canalDe, relojesAdc, convertidores, instrumentos, puertos, potencias, compuestos, sinModelo, errores, avisos
  }
}

/** Los extremos de una onda periódica; null si es continua. */
function extremosDeOnda(w: Onda): [number, number] | null {
  switch (w.kind) {
    case 'sine':
      return [w.offset - Math.abs(w.amp), w.offset + Math.abs(w.amp)]
    case 'square':
    case 'pulse':
    case 'stair':
      return [Math.min(w.low, w.high), Math.max(w.low, w.high)]
    default:
      return null
  }
}

/** Reloj o señal periódica que llega directo a una entrada digital sin cruzar los umbrales de su familia (máximo bajo el
 * alto o mínimo sobre el bajo): la entrada nunca conmuta. Mira fuentes de pulso y senoidales en la red y el generador (su
 * fuente tras su resistencia de salida). Dice los dos voltajes de la señal y los de la entrada. */
function avisosDeUmbral(
  entradas: readonly { pieza: Pieza; pin: string; red: number; bajo: number; alto: number; familia: string }[],
  elementos: readonly ElementoMotor[],
  nodoDeRed: ReadonlyMap<number, number>,
  instrumentos: InstrumentosNetlist
): string[] {
  const out: string[] = []
  const resistenciasDeGenerador = new Set([...instrumentos.generadores.values()].map((g) => g.resistencia))
  // Una sola pasada: de cada nodo, los extremos de la primera señal periódica que lo alimenta (en el orden de los elementos).
  // Con entradas que no son de confianza (un .kir ajeno) buscar por entrada sería O(entradas × elementos²).
  const fuenteDeNodo = new Map<number, [number, number] | null>()
  for (const el of elementos) if (el.type === 'V' && el.b === 0 && !fuenteDeNodo.has(el.a)) fuenteDeNodo.set(el.a, extremosDeOnda(el.wave))
  const extremos = new Map<number, [number, number]>()
  const poner = (nodo: number, x: [number, number] | null | undefined) => {
    if (x && !extremos.has(nodo)) extremos.set(nodo, x)
  }
  elementos.forEach((el, k) => {
    if (el.type === 'V' && el.b === 0) poner(el.a, extremosDeOnda(el.wave))
    // El generador: su fuente (de un nodo interno a tierra) detrás de su resistencia de salida; sin carga, el nodo lee la onda.
    else if (el.type === 'R' && resistenciasDeGenerador.has(k)) {
      poner(el.a, fuenteDeNodo.get(el.b))
      poner(el.b, fuenteDeNodo.get(el.a))
    }
  })
  for (const e of entradas) {
    const nodo = nodoDeRed.get(e.red)
    if (nodo === undefined) continue
    const ext = extremos.get(nodo)
    if (!ext) continue
    const [bajo, alto] = ext
    if (alto < e.alto || bajo > e.bajo) {
      out.push(
        `La entrada ${e.pin} de ${e.pieza.ref} no llega a conmutar: su señal va de ${formatearMedida(bajo, 'V')} a ${formatearMedida(alto, 'V')} y el ${e.familia} necesita bajar de ${formatearMedida(e.bajo, 'V')} y subir de ${formatearMedida(e.alto, 'V')}.`
      )
    }
  }
  return out
}

/** Los modelos que, conectados a la salida de un comparador, pueden subirla (una carga hacia un voltaje, o una fuente). */
const PUEDEN_SUBIR_LA_SALIDA = new Set<ModeloDef['tipo']>(['R', 'pot', 'L', 'fusible', 'foco', 'motor', 'rele', 'zumbador', 'D', 'I', 'V', 'senoidal', 'pulso', 'alimentacion'])

/** La salida de un comparador es colector abierto: solo baja. Si nada de lo que toca esa red puede subirla (resistencia o
 * carga a otra red que no sea tierra ni V−, fuente, terminal de alimentación), el aviso lo dice. */
export function avisosDeCarga(piezas: readonly Pieza[], lib: Map<string, PiezaDef>, con: Conexiones, tierra: number | undefined): string[] {
  const out: string[] = []
  for (const p of piezas) {
    const def = lib.get(p.tipo)
    const m = def?.modelo
    if (!def || m?.tipo !== 'comparador') continue
    const redSal = con.redDePin.get(clavePin(p.id, m.sal))
    const redV = con.redDePin.get(clavePin(p.id, m.vmenos))
    if (redSal === undefined) continue
    let hay = false
    for (const q of piezas) {
      if (q === p || hay) continue
      const mq = lib.get(q.tipo)?.modelo
      if (!mq || !PUEDEN_SUBIR_LA_SALIDA.has(mq.tipo)) continue
      const reds = terminalesDelModelo(mq).map((id) => con.redDePin.get(clavePin(q.id, id)))
      if (!reds.includes(redSal)) continue
      // Una fuente o un terminal de alimentación en la salida la fuerzan; una carga debe llegar a una red que no sea tierra ni V−.
      if (mq.tipo === 'V' || mq.tipo === 'senoidal' || mq.tipo === 'pulso' || mq.tipo === 'alimentacion' || mq.tipo === 'I') hay = true
      else if (reds.some((r) => r !== undefined && r !== redSal && r !== tierra && r !== redV)) hay = true
    }
    if (!hay) out.push(`${p.ref} es de colector abierto y su salida no tiene resistencia de carga a un voltaje: solo baja, nunca sube.`)
  }
  return out
}

/** Las resistencias que avisan de su potencia: las de las piezas resistencia, no las internas ni los interruptores. */
const POTENCIA_DE_PIEZA = new Set<ModeloDef['tipo']>(['R'])

/** Por cada casilla de terminal de los elementos analógicos (orden de netlist), la red del documento a que llega y el pin
 * por el que entra: el que dijo el armado (`pin`) o el único (o primero) de la pieza en esa red. Un nodo que ningún
 * terminal toca (el «−» de un puente de entrada, tierra) y la tierra interna entran sin pin; una red interna es −1. */
function puertosDeElementos(pendientes: readonly Pendiente[], elementos: readonly ElementoMotor[], nodoDeRed: ReadonlyMap<number, number>, con: Conexiones, lib: Map<string, PiezaDef>, tierra: number): Puerto[] {
  const redDeNodo = new Map<number, number>()
  for (const [red, n] of nodoDeRed) if (!redDeNodo.has(n)) redDeNodo.set(n, red)
  const redDe = (n: number) => (n === 0 ? tierra : (redDeNodo.get(n) ?? -1))
  const out: Puerto[] = []
  pendientes.forEach((q, i) => {
    const e = elementos[i]
    const nodos = nodosDeElemento(e)
    const usados = new Set<number>()
    const def = lib.get(q.pieza.tipo)
    const inicio = out.length
    for (const n of nodos) {
      const red = redDe(n)
      let pin: string | null = null
      const k = q.terminales.findIndex((t, j) => !usados.has(j) && t.red === red)
      if (k >= 0 && red >= 0) {
        usados.add(k)
        const t = q.terminales[k]
        const propio = t.pin ?? def?.pines.find((x) => con.redDePin.get(clavePin(q.pieza.id, x.id)) === red)?.id
        pin = propio === undefined ? null : clavePin(q.pieza.id, propio)
      }
      out.push({ red: red < 0 ? -1 : red, pin, elemento: i, signo: out.length === inicio ? 1 : -1 })
    }
    out.push({ red: tierra, pin: null })
  })
  return out
}
