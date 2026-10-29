import type { Conexiones } from '../conexiones/conexiones'
import type { Documento, Id } from '../doc/tipos'
import { compilarNetlist, type ElementoMotor, type NetlistMotor, type ResultadoNetlist } from '../netlist/netlist'
import type { PiezaDef } from '../piezas/tipos'
import { referenciasCortas } from '../ui/proyecto'
import { formatearMedida, formatearValor } from '../valores/valores'
import type { CrucesSim, MotorSimulacion } from './client'
import { armarReparto, type Reparto } from '../conexiones/corrientes'
import { limitesDelCircuito, VigiaDeAvisos, VigiaDeReinicio, type LimitePieza } from './avisos'
import { VigiaDeQuemado } from './quemado'
import { MAX_ELEMENTS, MAX_NODES, MAX_REDES_DIGITALES, type CambioEnCaliente, type EventoFundido, type SimReading, type TopesDePaso } from './protocol'
import { textoEnVivo } from '../valores/enVivo'
import { basesDeTiempo, escalaDeVoltaje, leerResultados, PASO_VISTA, pasoDeSimulacion, pasoDeVistaPrevia, topesDeVistaPrevia, type Lectura, type MedicionPieza } from './lectura'
import { Histeresis } from '../ui/histeresis'
import { VigiaDeSobrecorriente } from './sobrecorriente'
import { ajustesMultimetro, estructuraMultimetro, MODOS_MULTIMETRO, RANGO_CONTINUIDAD } from '../instrumentos/ajustes'
import { CIFRAS_MULTIMETRO, textoMultimetro } from '../instrumentos/multimetro'
import type { InstrumentosNetlist } from '../netlist/instrumentos'
import { configDeInstrumentos, type InstrumentosCargados } from './instrumentosWorker'
import { MAX_MEDIDORES_AC, MAX_MULTIMETROS, MAX_OSCILOSCOPIOS, type LecturaMultimetroSab, type PantallaSab, type RegistroFino } from './protocoloInstrumentos'
import { medirOhmiosDetenido } from './ohmios'

/** Tiempo real que corre una vista previa en pausa tras recargarse, para que muestre valores y no ceros. */
const RAFAGA_EN_PAUSA_MS = 60

/** Los topes de instrumentos de una vista previa (los de la memoria compartida); null si caben. */
export function limitesDeInstrumentos(inst: InstrumentosNetlist): string | null {
  const n = inst.osciloscopios.size
  if (n > MAX_OSCILOSCOPIOS) return `La vista previa admite hasta ${MAX_OSCILOSCOPIOS} osciloscopios y este circuito tiene ${n}.`
  const m = inst.multimetros.size
  if (m > MAX_MULTIMETROS) return `La vista previa admite hasta ${MAX_MULTIMETROS} multímetros y este circuito tiene ${m}.`
  const a = inst.medidores.size
  if (a > MAX_MEDIDORES_AC) return `La vista previa admite hasta ${MAX_MEDIDORES_AC} medidores rápidos en AC y este circuito tiene ${a}.`
  return null
}

/** La lectura de un multímetro con su cifra en palabras. */
export interface LecturaDeMultimetro extends LecturaMultimetroSab {
  texto: string
}

export interface LecturaInstrumentos {
  multimetros: Map<Id, LecturaDeMultimetro>
  /** La pantalla del osciloscopio pedido. */
  pantalla?: PantallaSab
  /** Es la copia que quedó al detener. */
  capturada: boolean
}

/** detenida: se edita; arrancando: el motor carga la netlist; corriendo o en pausa: no se edita. */
export type FaseSim = 'detenida' | 'arrancando' | 'corriendo' | 'pausada'

export interface Circuito {
  doc: Documento
  lib: Map<string, PiezaDef>
  con: Conexiones
}

export interface DependenciasSim {
  /** Se llama la primera vez que se simula: el worker y el WASM no ocupan memoria mientras solo se edita. */
  crearMotor(): MotorSimulacion
  circuito(): Circuito
  /** Mensaje para el Registro; los errores abren la franja en él. */
  registrar(texto: string, tipo: 'aviso' | 'error' | 'info'): void
  /** La fase cambió (la interfaz bloquea el editor y muestra los controles). */
  fase(f: FaseSim): void
  /** Cambios de estado que se oyen (zumbadores y relés) con la pieza de cada elemento; el sonido los programa. Sin la
   * función no se oyen. */
  cruces?(c: CrucesSim, pieza: (elemento: number) => Id | undefined): void
  /** El avance en curso cambió o terminó (null); la interfaz lee mientras dura y la barra dice cuánto va. */
  avance?(a: AvanceSim | null): void
  /** Retroceder: cuántos avances guarda el motor para volver a ellos (cambió, o se agotó). */
  retrocesos?(n: number): void
  /** Si «Las piezas se queman» está encendida (Configuración › Simulación). */
  quemar?(): boolean
  /** El reloj en ms (el segundo de permanencia de los avisos); las pruebas lo cambian. */
  reloj?(): number
  /** El motor rechazó el último valor de una perilla: el editor vuelve a `texto` (`Editor.revertirEnCaliente`). */
  revertirPerilla?(id: Id, propId: string, texto: string): void
}

/** Cambios de perilla por segundo que se mandan al motor; si llegan más, el último gana. */
export const PERILLA_POR_SEGUNDO = 60

/** Retroceder: los últimos avances que guarda el motor (el mismo número que `ESTADOS_MAX` del motor). */
export const RETROCESOS_MAX = 200

/** Un avance en curso: F6 (un intervalo o un paso del motor) o «Avanzar hasta t», con su meta (null en un paso). */
export interface AvanceSim {
  tipo: 'avanzar' | 'paso' | 'hasta'
  desde: number
  meta: number | null
}

/** Lo que dejó un avance: el instante al que llegó y lo que avanzó; `interrumpido` si F5 o Esc lo pararon antes. */
export interface LlegadaSim {
  t: number
  dt: number
  interrumpido: boolean
}

/** Qué hace un clic sobre la pieza corriendo la vista previa: un interruptor o estado lógico conmuta, un botón cierra
 * mientras se sostiene, un fusible fundido se repone; null si no se acciona (el clic la selecciona). */
export function accionDeClic(def: PiezaDef | undefined): 'conmutar' | 'sostener' | 'reponer' | null {
  const m = def?.modelo
  if (m?.tipo === 'fusible') return 'reponer'
  if (m?.tipo === 'estado-logico') return 'conmutar'
  if (m?.tipo !== 'interruptor') return null
  return m.momentaneo ? 'sostener' : 'conmutar'
}

/** La otra opción de un interruptor, un botón o un estado lógico (sus propiedades tienen dos). */
export function otraOpcion(def: PiezaDef, actual: string): string | undefined {
  const m = def.modelo
  if (m?.tipo !== 'interruptor' && m?.tipo !== 'estado-logico') return undefined
  return def.props.find((p) => p.id === m.prop)?.opciones?.find((o) => o !== actual)
}

/** Si la netlist no cabe en la memoria compartida de la vista previa, lo dice en una oración; si cabe, null. */
export function limitesExcedidos(n: { nodes: number; digital_nets?: number; elements: unknown[] }): string | null {
  if (n.nodes > MAX_NODES) return `La vista previa admite hasta ${MAX_NODES} redes y este circuito tiene ${n.nodes}.`
  if ((n.digital_nets ?? 0) > MAX_REDES_DIGITALES) return `La vista previa admite hasta ${MAX_REDES_DIGITALES} redes digitales y este circuito tiene ${n.digital_nets}.`
  if (n.elements.length > MAX_ELEMENTS) return `La vista previa admite hasta ${MAX_ELEMENTS} piezas simuladas y este circuito tiene ${n.elements.length}.`
  return null
}

/** Antes de compilar: cada pieza con modelo (salvo tierra y terminales de alimentación) da al menos un elemento, así que
 * con más que el tope no cabe. Se dice sin compilar: un `.kir` manipulado con cien mil compuertas en una red tardaría en
 * armar su netlist solo para rechazarla. */
export function piezasDeMas(doc: Documento, lib: Map<string, PiezaDef>): string | null {
  let n = 0
  for (const p of Object.values(doc.piezas)) {
    const m = lib.get(p.tipo)?.modelo
    if (m && m.tipo !== 'tierra' && m.tipo !== 'alimentacion') n++
  }
  return n > MAX_ELEMENTS ? `La vista previa admite hasta ${MAX_ELEMENTS} piezas simuladas y este circuito tiene ${n}.` : null
}

/** Resistencias, fuentes y estados lógicos que cambian entre dos netlists iguales en todo lo demás (mismos nodos,
 * elementos y conexiones): se cambian en caliente sin reiniciar (el paso máximo nuevo viaja aparte con `setValues`). null
 * si difieren en algo más: hay que cargar la netlist nueva. */
export function cambiosEnCaliente(antes: NetlistMotor, despues: NetlistMotor): CambioEnCaliente[] | null {
  if (antes.nodes !== despues.nodes || antes.elements.length !== despues.elements.length || (antes.digital_nets ?? 0) !== (despues.digital_nets ?? 0)) return null
  const cambios: CambioEnCaliente[] = []
  for (let i = 0; i < antes.elements.length; i++) {
    const a = antes.elements[i], b = despues.elements[i]
    if (JSON.stringify(a) === JSON.stringify(b)) continue
    const caliente =
      // El fusible (el multímetro al pasar a ideal) y la fuente variable también cambian en caliente.
      // El zumbador también: su voltaje nominal da su resistencia y su umbral.
      ((a.type === 'R' || a.type === 'V' || a.type === 'I' || a.type === 'FUSE' || a.type === 'PSU' || a.type === 'BUZZER') && a.type === b.type && a.a === b.a && a.b === (b as typeof a).b) ||
      (a.type === 'LOGIC' && b.type === 'LOGIC' && a.out === b.out)
    if (!caliente) return null
    cambios.push({ indice: i, elemento: b })
  }
  return cambios
}

/** Un cambio en caliente que dejaría el circuito sin netlist y sin un error que lo explique (no debería pasar). */
export const MENSAJE_CAMBIO_SIN_SIMULAR = 'Con ese valor el circuito no se puede simular.'

/** Qué revisar cuando una pieza no encuentra su punto de trabajo, según su modelo. */
const CONSEJO: Partial<Record<string, string>> = {
  bjt: 'revisa la polarización de su base',
  mosfet: 'revisa el voltaje de su compuerta',
  ampop: 'revisa su alimentación y su realimentación',
  D: 'revisa que tenga una resistencia en serie',
  zener: 'revisa que tenga una resistencia en serie'
}

/** Lo que el motor dice de un valor rechazado («el valor debe ser positivo») dicho de la pieza («tiene un valor que debe ser positivo»). */
function enPalabras(texto: string): string {
  const conocidos: Record<string, string> = {
    'el valor debe ser positivo': 'tiene un valor que debe ser positivo',
    'un valor está fuera del rango admitido': 'tiene un valor fuera del rango admitido',
    'un parámetro del modelo está fuera de rango': 'tiene un parámetro del modelo fuera de rango',
    'un valor no es finito': 'tiene un valor que no es un número'
  }
  return conocidos[texto] ?? `no es válida: ${texto}`
}

/** Una pieza no lineal "no encontró un punto de trabajo" y se dice qué revisar; en una lineal (una resistencia) solo se dice cerca de cuál. */
function sinPuntoDeTrabajo(p: { ref: string; tipo: string }, consejoLineal: string): string {
  const consejo = CONSEJO[p.tipo]
  return consejo ? `${p.ref} no encontró un punto de trabajo: ${consejo}.` : `No se encontró un punto de trabajo cerca de ${p.ref}: ${consejoLineal}.`
}

/** Mensaje del motor en una oración para el Registro. Si no convergió y nombró un elemento, `pieza` dice de qué pieza es y
 * la oración la nombra: «Q1 no encontró un punto de trabajo: revisa la polarización de su base.». */
export function mensajeDelMotor(m: string, pieza?: (elemento: number) => { ref: string; tipo: string } | undefined): string {
  // El motor rechaza un valor con «elemento N: …»: se dice de qué pieza es.
  const rechazo = /^elemento (\d+): (.*)$/.exec(m)
  const rechazada = rechazo ? pieza?.(Number(rechazo[1])) : undefined
  if (rechazo && rechazada) return `La vista previa se detuvo: ${rechazada.ref} ${enPalabras(rechazo[2])}.`
  // El motor agrega « (elemento N)» a la matriz singular y a la unión sin límite cuando sabe quién es.
  const dueno = pieza?.(Number(/\(elemento (\d+)\)\s*$/.exec(m)?.[1] ?? NaN))
  if (m.startsWith('una unión queda en directo')) {
    if (dueno) return sinPuntoDeTrabajo(dueno, 'revisa que tenga una resistencia en serie')
    return 'La vista previa se detuvo: una unión queda en directo sin nada que limite su corriente; agrega una resistencia en serie.'
  }
  if (m.startsWith('matriz singular')) {
    const donde = dueno ? ` cerca de ${dueno.ref}` : ''
    // Una fuente controlada en lazo es la causa habitual: se sugiere lo que la deshace.
    if (dueno?.tipo === 'controlada') return `La vista previa se detuvo: el circuito no tiene solución${donde}; cambia su ganancia o agrega una resistencia en el lazo.`
    return `La vista previa se detuvo: el circuito no tiene solución${donde}; revisa que cada red llegue a tierra y que no haya fuentes de voltaje en paralelo.`
  }
  const t = /^no convergió en t = (\S+) s(?: \(elemento (\d+)\))?$/.exec(m)
  const culpable = t?.[2] === undefined ? undefined : pieza?.(Number(t[2]))
  if (culpable) return sinPuntoDeTrabajo(culpable, 'revisa sus conexiones')
  if (t) return `La vista previa se detuvo: el motor no convergió en t = ${formatearValor(Number(t[1]), 's')}.`
  const texto = m.trim()
  return /^La vista previa/.test(texto) ? texto : `La vista previa se detuvo: ${texto.replace(/\.$/, '')}.`
}

/** La vista previa: arma la netlist, la entrega al motor y lee sus resultados. El documento nunca cambia:
 * los interruptores y botones accionados viven aquí y accionar uno recarga la netlist desde t = 0. */
export const COLUMNAS_CAPTURA_AMPLIA = 2000

export class ControlSimulacion {
  private motor: MotorSimulacion | null = null
  private quitarError: (() => void) | null = null
  /** Lo que dejó armar el último arranque (instrumentos de la netlist y avisos de conexión pasados al Registro): la franja
   * decide con esto qué pestaña abrir, y el resultado vigente aún no existe cuando la fase pasa a «arrancando». */
  arranque: { instrumentos: ResultadoNetlist['instrumentos']; problemas: number } | null = null
  private quitarFundido: (() => void) | null = null
  private quitarRechazo: (() => void) | null = null
  /** Paso máximo con que corre el motor. */
  private hMotor = 0
  /** Lo que dura hoy un paso del motor (el paso máximo de la vista previa); sin simular, el máximo de omisión. */
  get pasoMaximo(): number {
    return this.hMotor > 0 ? this.hMotor : PASO_VISTA
  }
  /** Lo que el motor tiene de cada elemento cambiado en caliente: el original y cada valor mandado con su secuencia.
   * Si el motor rechaza uno, el elemento vuelve al último aceptado, sin pisar uno posterior que ya llegó. */
  private vigia = new VigiaDeSobrecorriente()
  /** La cifra que se ve de cada red y de cada pieza; se vacía al detener. */
  private histeresis = new Histeresis(3)
  private enCaliente = new Map<number, { seq: number; elemento: ElementoMotor }[]>()
  /** Por canal de perilla: la pieza, lo mandado con su secuencia (el primero es el texto del documento al cargar) y el limitador de 60 por segundo. */
  private perillas = new Map<number, { id: Id; propId: string; texto: { seq: number; texto: string }[]; ultimo: number; pendiente: number | null; timer: ReturnType<typeof setTimeout> | null }>()
  private perillaSeq = new Map<number, number>()
  /** El paso máximo que tenía el motor antes de cada mensaje con un paso nuevo, por su número de secuencia. */
  private pasoAntes = new Map<number, number>()
  private ultimaSecuenciaDePaso = 0
  private resultado: ResultadoNetlist | null = null
  private accionados = new Map<Id, string>()
  private _fase: FaseSim = 'detenida'
  /** Sube con cada carga: una carga vieja que termina tarde no pisa a la nueva. */
  private carga = 0
  /** Se accionó algo estando en pausa: al terminar de cargar (aunque lleguen más acciones) se queda en pausa. */
  private quedarPausada = false
  /** El lazo de compuertas que oscila solo, hasta que el Registro dice su frecuencia. */
  private lazo: { refs: string[]; red: number } | null = null
  /** Ya se dijo la frecuencia del lazo en esta vista previa: una recarga no la repite. */
  private lazoDicho = false
  private quitarRango: (() => void) | null = null
  /** El paso máximo cuando lo fija la base de tiempo de un osciloscopio (más corto que el del circuito); null si no. */
  pasoDeLaBase: number | null = null
  /** El rango del óhmetro de cada multímetro en esta vista previa: las recargas lo conservan. */
  private rangosOhm = new Map<Id, number>()
  /** Los instrumentos que corren (su orden en la memoria compartida) y lo último que se le mandó al worker. */
  private instrumentos: InstrumentosCargados | null = null
  private configEnviada = ''
  /** Los topes de paso por isla que tiene el motor (en JSON, para mandar solo los que cambian). */
  private topesEnviados = ''
  /** El último aviso de tope del óhmetro detenido (no se repite en cada edición). */
  private ultimoLimiteOhmios: string | null = null
  /** El ancho que pidió el panel de cada osciloscopio (0 con su pestaña cerrada): se manda otra vez al cargar cada vista previa. */
  private readonly columnasPedidas = new Map<Id, number>()
  private histeresisMm = new Histeresis(CIFRAS_MULTIMETRO)
  /** Lo que quedó en los instrumentos al detener, hasta la vista previa siguiente. */
  private captura: {
    multimetros: Map<Id, LecturaDeMultimetro>
    pantallas: Map<Id, PantallaSab>
    /** La captura entera de cada osciloscopio (todo lo que conservaban sus sondas), pedida al worker justo antes de soltarlo. */
    amplias: Map<Id, PantallaSab>
    /** Lo mismo en columnas finas, para desplazarse por la captura. */
    finos: Map<Id, RegistroFino>
    /** Se cumple cuando el worker ya contestó todo lo que se le pidió al detener (y se soltó). */
    listo: Promise<void>
  } | null = null
  /** Velocidad del tiempo de la sesión y «Lo más rápido posible»; corriente animada; reparto de corrientes entre tramos
   * (se arma una vez por carga); avisos, quemado y límites de cada pieza; avance en curso. */
  private velocidad = 1
  private sinTope = false
  private corrientesActivas = false
  private reparto: Reparto | null = null
  private media = new Float64Array(0)
  private absoluta = new Float64Array(0)
  private vigiaAvisos = new VigiaDeAvisos()
  private vigiaReinicio = new VigiaDeReinicio()
  private quemado = new VigiaDeQuemado()
  private limites = new Map<Id, LimitePieza>()
  private _avance: AvanceSim | null = null
  private quitarCruces: (() => void) | null = null
  private quitarConflictos: (() => void) | null = null
  private quitarIndefinidos: (() => void) | null = null
  /** Los convertidores D/A de los que el Registro ya dijo que tienen entradas sin nivel, para decirlo una vez por vista previa. */
  private indefinidosDichos = new Set<number>()
  /** Las redes digitales cuyo conflicto de bus ya se dijo en esta vista previa (una vez cada una). */
  private conflictosDichos = new Set<number>()
  private quitarPerdidos: (() => void) | null = null
  /** Retroceder: cuántos avances guarda el motor (a lo más 200) y si ya se dijo que olvidó los más viejos por la memoria. */
  private _retrocesos = 0
  private perdidosDichos = false

  constructor(private d: DependenciasSim) {}

  get fase(): FaseSim {
    return this._fase
  }

  /** Retroceder: a cuántos avances anteriores se puede volver. */
  get retrocesos(): number {
    return this._retrocesos
  }

  /** Retroceder solo desde la pausa, sin un avance en curso y con algo guardado. */
  get puedeRetroceder(): boolean {
    return this._fase === 'pausada' && !this._avance && this._retrocesos > 0
  }

  private fijarRetrocesos(n: number): void {
    if (n === this._retrocesos) return
    this._retrocesos = n
    this.d.retrocesos?.(n)
  }

  /** Corre o está en pausa: el editor no edita. */
  get activa(): boolean {
    return this._fase !== 'detenida'
  }

  private ponerFase(f: FaseSim): void {
    if (f === this._fase) return
    this._fase = f
    this.d.fase(f)
  }

  /** Voltaje del color pleno de la escala de los cables (la fuente de mayor magnitud); 1 V si no corre. */
  get escala(): number {
    const r = this.resultado
    return r?.netlist ? escalaDeVoltaje(r.netlist, [...r.digitales.values()].map((p) => p.alimentacion)) : 1
  }

  /** Opción vigente de la propiedad del modelo de un interruptor, botón o estado lógico (la accionada o la del documento). */
  opcionDe(id: Id): string | undefined {
    const { doc, lib } = this.d.circuito()
    const p = doc.piezas[id]
    const m = p ? lib.get(p.tipo)?.modelo : undefined
    if (!p || (m?.tipo !== 'interruptor' && m?.tipo !== 'estado-logico')) return undefined
    return this.accionados.get(id) ?? p.props[m.prop] ?? lib.get(p.tipo)!.props.find((x) => x.id === m.prop)?.defecto
  }

  /** Documento como se ve al simular: con los estados lógicos e interruptores en la opción accionada, para que el rótulo
   * de un estado lógico diga el nivel que sale. Sin nada accionado es el documento mismo. Nunca se guarda. */
  documentoVisible(): Documento {
    return this.documento()
  }

  /** El documento (el del circuito u otro) con las opciones accionadas en lugar de las guardadas. */
  private documento(doc: Documento = this.d.circuito().doc): Documento {
    const { lib } = this.d.circuito()
    if (this.accionados.size === 0) return doc
    const piezas = { ...doc.piezas }
    for (const [id, opcion] of this.accionados) {
      const p = piezas[id]
      const m = p ? lib.get(p.tipo)?.modelo : undefined
      if (p && (m?.tipo === 'interruptor' || m?.tipo === 'estado-logico')) piezas[id] = { ...p, props: { ...p.props, [m.prop]: opcion } }
    }
    return { ...doc, piezas }
  }

  /** Lo que pasaría al llevar a la vista previa el documento `doc` (un valor o riel cambiado en caliente): el primer error
   * de su netlist con las opciones accionadas como en la recarga, o null. Como el circuito ya se podía simular al
   * arrancar, cualquier error es del cambio. */
  probarCambio(doc: Documento): string | null {
    const { lib, con } = this.d.circuito()
    const deMas = piezasDeMas(doc, lib)
    if (deMas) return deMas
    const r = compilarNetlist(this.documento(doc), lib, con, { rangosOhm: this.rangosOhm })
    if (!r.netlist) return r.errores[0] ?? MENSAJE_CAMBIO_SIN_SIMULAR
    return limitesExcedidos(r.netlist)
  }

  /** Óhmetros con la simulación detenida (B12): cada uno resuelve un punto de operación con fuentes apagadas. Vacío con
   * una vista previa en curso (ahí el óhmetro es el de siempre), sin netlist o sin óhmetros. */
  async ohmiosDetenido(medir: typeof medirOhmiosDetenido = medirOhmiosDetenido, senal?: AbortSignal): Promise<Map<Id, LecturaDeMultimetro>> {
    const salida = new Map<Id, LecturaDeMultimetro>()
    if (this._fase !== 'detenida') return salida
    const { doc, lib, con } = this.d.circuito()
    if (!Object.values(doc.piezas).some((p) => lib.get(p.tipo)?.modelo?.tipo === 'multimetro')) return salida
    const r = compilarNetlist(this.documento(doc), lib, con, { rangosOhm: this.rangosOhm })
    const pedido = [...r.instrumentos.multimetros].filter(([, mm]) => mm.ajustes.modo === 'Ω' || mm.ajustes.modo === 'Continuidad')
    for (const id of r.instrumentos.sueltos) {
      const p = doc.piezas[id]
      const modo = p && lib.get(p.tipo)?.modelo?.tipo === 'multimetro' ? ajustesMultimetro(p, lib.get(p.tipo)!).modo : null
      if (modo === 'Ω' || modo === 'Continuidad') {
        salida.set(id, { lecturas: 0, t: 0, ventana: 0, valor: Number.NaN, frecuencia: Number.NaN, rango: 0, estado: 'sin-conectar', modo: MODOS_MULTIMETRO.indexOf(modo), fundido: false, periodos: 0, texto: 'sin conectar' })
      }
    }
    if (!r.netlist || pedido.length === 0) return salida
    // Los mismos topes que al iniciar: un circuito que no cabe en la vista previa tampoco se resuelve aquí.
    const demasiado = limitesExcedidos(r.netlist)
    if (demasiado) {
      if (demasiado !== this.ultimoLimiteOhmios) this.d.registrar(demasiado, 'aviso')
      this.ultimoLimiteOhmios = demasiado
      return salida
    }
    this.ultimoLimiteOhmios = null
    const h = pasoDeSimulacion(r.netlist)
    const lecturas = await medir({ netlist: r.netlist, h, multimetros: pedido.slice(0, MAX_MULTIMETROS).map(([id, mm]) => ({ id, elemento: mm.elemento, ...(mm.ajustes.modo === 'Continuidad' ? { rango: RANGO_CONTINUIDAD, continuidad: true } : { rango: mm.rangoOhm }) })) }, senal)
    for (const [id, l] of lecturas) salida.set(id, l)
    return salida
  }

  /** Arma la netlist y arranca. Devuelve false (y lo dice en el Registro) si el circuito no se puede simular. */
  async iniciar(): Promise<boolean> {
    if (this.activa) return true
    this.arranque = null
    const { doc, lib, con } = this.d.circuito()
    if (Object.keys(doc.piezas).length === 0) {
      this.d.registrar('El circuito está vacío: no hay nada que simular.', 'aviso')
      return false
    }
    const deMas = piezasDeMas(doc, lib)
    if (deMas) {
      this.d.registrar(deMas, 'error')
      return false
    }
    const r = compilarNetlist(this.documento(), lib, con, { rangosOhm: this.rangosOhm })
    if (r.sinModelo.length) {
      const n = r.sinModelo.length
      this.d.registrar(`No se puede simular: ${referenciasCortas(r.sinModelo)} ${n === 1 ? 'no tiene' : 'no tienen'} modelo eléctrico.`, 'error')
      return false
    }
    if (!r.netlist) {
      for (const e of r.errores) this.d.registrar(e, 'error')
      return false
    }
    const limite = limitesDeInstrumentos(r.instrumentos)
    if (limite) {
      this.d.registrar(limite, 'error')
      return false
    }
    for (const a of r.avisos) this.d.registrar(a, 'aviso')
    this.arranque = { instrumentos: r.instrumentos, problemas: r.avisos.length }
    return this.cargar(r)
  }

  private async cargar(r: ResultadoNetlist, rafagaEnPausa = false): Promise<boolean> {
    const mia = ++this.carga
    const demasiado = limitesExcedidos(r.netlist!)
    if (demasiado) {
      this.d.registrar(demasiado, 'error')
      this.detener()
      return false
    }
    this.ponerFase('arrancando')
    try {
      if (!this.motor) {
        this.motor = this.d.crearMotor()
        this.quitarError = this.motor.alError((m) => {
          this.d.registrar(mensajeDelMotor(m, (k) => this.piezaDeElemento(k)), 'error')
          this.detener()
        })
        this.quitarFundido = this.motor.alFundido((e) => this.fundido(e))
        this.quitarRechazo = this.motor.alRechazo((i, m, seq) => this.rechazado(i, m, seq))
        this.quitarRango = this.motor.alRango((k, rango) => this.cambioDeRango(k, rango))
        this.quitarCruces = this.motor.alCruces((c) => this.d.cruces?.(c, (k) => this.resultado?.piezaDeElemento[k]))
        this.quitarConflictos = this.motor.alConflictos?.((redes) => this.conflictosDeBus(redes)) ?? null
        this.quitarIndefinidos = this.motor.alIndefinidos?.((elementos) => this.entradasIndefinidas(elementos)) ?? null
        this.quitarPerdidos = this.motor.alEstadosPerdidos((perdidos, guardados) => this.estadosPerdidos(perdidos, guardados))
      }
      this.hMotor = pasoDeVistaPrevia(r.netlist!, basesDeTiempo(r))
      this.pasoDeLaBase = this.hMotor < pasoDeVistaPrevia(r.netlist!) ? this.hMotor : null
      const topes = topesDeVistaPrevia(r.netlist!, basesDeTiempo(r))
      this.topesEnviados = JSON.stringify(topes)
      this.enCaliente.clear()
      this.pasoAntes.clear()
      const ci = configDeInstrumentos(r.instrumentos)
      this.instrumentos = ci
      this.configEnviada = JSON.stringify(ci.config)
      this.captura = null
      const hay = ci.multimetros.length + ci.osciloscopios.length > 0
      // La memoria de las corrientes por terminal (del tamaño de la netlist) y las potencias que integran los avisos.
      this.reparto = null
      // La velocidad con que empieza va con la carga: una que queda en pausa no corre unos milisegundos a 1× antes de la pausa.
      const carga = await this.motor.load(r.netlist!, this.hMotor, hay ? ci.config : undefined, { casillas: r.puertos.length, corrientes: this.corrientesActivas, potencias: r.potencias, velocidad: this.quedarPausada ? 0 : this.velocidad, sinTope: !this.quedarPausada && this.sinTope, topes })
      if (mia === this.carga && !this.lazoDicho) this.lazo = this.lazoDe(r, carga.lazo)
    } catch (e) {
      if (mia !== this.carga) return false
      // El motor rechaza al cargar con «elemento N: …»: la pieza se busca en la netlist que se cargaba.
      this.d.registrar(mensajeDelMotor(e instanceof Error ? e.message : String(e), (k) => this.piezaDe(r, k)), 'error')
      this.detener()
      return false
    }
    if (mia !== this.carga) return false
    this.resultado = r
    this.reiniciarPerillas(r)
    this.limites = limitesDelCircuito(this.d.circuito().doc, this.d.circuito().lib, r, this.d.circuito().con)
    // Una recarga desde t = 0 trae un motor con todo sano; lo que estaba quemado se vuelve a quemar (con su
    // elemento de la netlist nueva), o se olvida si la pieza ya no se quema.
    for (const id of [...this.quemado.todas]) {
      const q = this.limites.get(id)?.quema
      if (q) this.motor.quemar(q.elemento, true)
      else this.quemado.reponer(id)
    }
    // Cada pantalla con el ancho que pidió su panel; la que nadie mira (pestaña cerrada), con 0: no se arma.
    this.instrumentos?.osciloscopios.forEach((id, k) => this.motor!.columnasDePantalla(k, this.columnasPedidas.get(id) ?? 0))
    const pausa = this.quedarPausada
    this.quedarPausada = false
    this.motor.setSpeed(pausa ? 0 : this.velocidad, !pausa && this.sinTope)
    if (pausa && rafagaEnPausa) {
      // Recién cargado está en t = 0, con todo en cero: una ráfaga corta de tiempo real da la lectura que se queda en pantalla.
      if (!(await this.rafaga(mia))) return false
    }
    this.ponerFase(pausa ? 'pausada' : 'corriendo')
    return true
  }

  /** Las piezas de los elementos de un lazo que oscila solo y la red de la salida de su primera compuerta; null si no hay lazo. */
  private lazoDe(r: ResultadoNetlist, elementos: number[]): { refs: string[]; red: number } | null {
    const salida = elementos.map((k) => r.netlist!.elements[k]).find((e) => e?.type === 'GATE')
    if (salida?.type !== 'GATE') return null
    const refs = [...new Set(elementos.map((k) => this.piezaDe(r, k)?.ref).filter((x): x is string => x !== undefined))]
    return refs.length ? { refs, red: salida.output } : null
  }

  /** Dos salidas de tres estados manejan una red a niveles distintos: el Registro lo dice una vez por red. */
  private conflictosDeBus(redes: number[]): void {
    const r = this.resultado
    if (!r) return
    for (const digital of redes) {
      if (this.conflictosDichos.has(digital)) continue
      this.conflictosDichos.add(digital)
      const doc = [...r.redDigital].find(([, d]) => d === digital)?.[0]
      const nombre = doc === undefined ? undefined : this.d.circuito().con.redes.find((x) => x.id === doc)?.nombre
      this.d.registrar(`Conflicto en el bus: dos salidas manejan la red ${nombre ?? digital} a niveles distintos.`, 'aviso')
    }
  }

  /** Un convertidor D/A lleva más de un microsegundo con una entrada sin nivel (al aire, en alta impedancia o entre los umbrales): conserva el último código y el Registro lo dice una vez. */
  private entradasIndefinidas(elementos: number[]): void {
    for (const k of elementos) {
      if (this.indefinidosDichos.has(k)) continue
      this.indefinidosDichos.add(k)
      const pieza = this.piezaDeElemento(k)
      if (pieza) this.d.registrar(`${pieza.ref} tiene una entrada digital sin nivel definido (al aire, en alta impedancia o entre los umbrales): conserva el último código.`, 'aviso')
    }
  }

  /** La primera lectura en que el lazo ya tiene frecuencia la dice en el Registro, una sola vez por vista previa. */
  private anunciarLazo(s: SimReading): void {
    const f = this.lazo ? s.medidas[3 * this.lazo.red] : 0
    if (!this.lazo || !(f > 0)) return
    const { refs } = this.lazo
    this.lazo = null
    this.lazoDicho = true
    const hz = formatearMedida(f, 'Hz')
    this.d.registrar(refs.length === 1 ? `${refs[0]} se realimenta y oscila a ${hz}.` : `${referenciasCortas(refs)} forman un lazo que oscila a ${hz}.`, 'aviso')
  }

  /** Referencia y tipo de modelo de la pieza del elemento `k` de la netlist cargada. */
  private piezaDeElemento(k: number): { ref: string; tipo: string } | undefined {
    return this.resultado ? this.piezaDe(this.resultado, k) : undefined
  }

  /** Lo mismo para una netlist armada (la que se carga aún no es la vigente). */
  private piezaDe(r: ResultadoNetlist, k: number): { ref: string; tipo: string } | undefined {
    const id = r.piezaDeElemento[k]
    const ref = id === undefined ? undefined : this.d.circuito().doc.piezas[id]?.ref
    const tipo = r.tipoDeElemento[k]
    return ref === undefined || tipo === undefined ? undefined : { ref, tipo }
  }

  /** El motor rechazó el cambio en caliente `seq` (valor fuera de rango, paso inadmisible): la vista previa sigue con lo
   * último aceptado y el Registro lo dice con el nombre de la pieza. Con varios en camino solo vuelve atrás si era el
   * último de ese elemento. El documento conserva el valor (el campo ya lo validó: esto es la red de seguridad). */
  private rechazado(indice: number, mensaje: string, seq: number): void {
    const canal = this.perillaSeq.get(seq)
    if (indice < 0 && canal !== undefined) {
      this.perillaRechazada(canal, mensaje, seq)
      return
    }
    const pieza = indice >= 0 ? this.piezaDeElemento(indice) : undefined
    const que = mensaje.replace(/^elemento \d+: /, '')
    this.d.registrar(
      pieza ? `${pieza.ref} ${enPalabras(que)}: la vista previa sigue con el valor de antes.` : `El motor no aceptó el cambio (${que}): la vista previa sigue con el valor de antes.`,
      'error'
    )
    if (indice >= 0) {
      const lista = this.enCaliente.get(indice)
      const k = lista?.findIndex((e) => e.seq === seq) ?? -1
      if (lista && k >= 0) {
        const eraElUltimo = k === lista.length - 1
        lista.splice(k, 1)
        if (eraElUltimo && this.resultado?.netlist) {
          const vigente = lista[lista.length - 1].elemento
          const elements = this.resultado.netlist.elements.map((e, i) => (i === indice ? vigente : e))
          this.resultado = { ...this.resultado, netlist: { ...this.resultado.netlist, elements } }
        }
      }
    } else if (seq === this.ultimaSecuenciaDePaso) {
      this.hMotor = this.pasoAntes.get(seq) ?? this.hMotor
    }
  }

  /** Mueve la perilla `propId` de la pieza `id` a `valor`: va al canal del motor (a lo más 60 veces por segundo, el último gana) en
   * lugar de rearmar la netlist. false si esa propiedad no tiene canal en la vista previa que corre. */
  moverPerilla(id: Id, propId: string, valor: number): boolean {
    const canal = this.resultado?.canalDe.get(`${id}:${propId}`)
    if (canal === undefined || !this.motor || this._fase === 'arrancando') return false
    const e = this.perillas.get(canal)
    if (!e) return false
    const ahora = this.d.reloj?.() ?? performance.now()
    const espera = e.ultimo + 1000 / PERILLA_POR_SEGUNDO - ahora
    e.pendiente = valor
    if (espera <= 0) this.enviarPerilla(canal)
    else if (!e.timer) e.timer = setTimeout(() => this.enviarPerilla(canal), Math.ceil(espera))
    return true
  }

  private textoDelDocumento(id: Id, propId: string): string {
    const { doc, lib } = this.d.circuito()
    const p = doc.piezas[id]
    return p?.props[propId] ?? lib.get(p?.tipo ?? '')?.props.find((d) => d.id === propId)?.defecto ?? ''
  }

  /** Una entrada por canal con el texto que el documento tiene al cargar: a él vuelve la perilla si el motor rechaza todo. */
  private reiniciarPerillas(r: ResultadoNetlist | null): void {
    for (const e of this.perillas.values()) if (e.timer) clearTimeout(e.timer)
    this.perillas.clear()
    this.perillaSeq.clear()
    for (const [clave, canal] of r?.canalDe ?? []) {
      const i = clave.indexOf(':')
      const id = clave.slice(0, i), propId = clave.slice(i + 1)
      this.perillas.set(canal, { id, propId, texto: [{ seq: 0, texto: this.textoDelDocumento(id, propId) }], ultimo: Number.NEGATIVE_INFINITY, pendiente: null, timer: null })
    }
  }

  private enviarPerilla(canal: number): void {
    const e = this.perillas.get(canal)
    if (!e) return
    e.timer = null
    if (e.pendiente === null || !this.motor) return
    const valor = e.pendiente
    e.pendiente = null
    e.ultimo = this.d.reloj?.() ?? performance.now()
    const seq = this.motor.perilla(canal, valor)
    this.perillaSeq.set(seq, canal)
    const { lib, doc } = this.d.circuito()
    const prop = lib.get(doc.piezas[e.id]?.tipo ?? '')?.props.find((d) => d.id === e.propId)
    e.texto.push({ seq, texto: prop ? textoEnVivo(prop, valor) : String(valor) })
    // Acotado: lo viejo ya fue aceptado (el motor rechaza de inmediato) y solo importa el último aceptado.
    if (e.texto.length > 64) e.texto.splice(1, e.texto.length - 64)
    if (this._fase === 'pausada') this.motor.paso()
  }

  /** El motor no aceptó un valor de perilla: el Registro lo dice con la pieza y el editor vuelve al último aceptado. */
  private perillaRechazada(canal: number, mensaje: string, seq: number): void {
    this.perillaSeq.delete(seq)
    const e = this.perillas.get(canal)
    if (!e) return
    const k = e.texto.findIndex((x) => x.seq === seq)
    if (k < 0) return
    const eraElUltimo = k === e.texto.length - 1
    e.texto.splice(k, 1)
    const vigente = e.texto[e.texto.length - 1].texto
    const ref = this.d.circuito().doc.piezas[e.id]?.ref
    const que = /finitos/.test(mensaje) ? 'tiene un valor que no es un número' : /llena/.test(mensaje) ? 'recibió cambios más rápido de lo que el motor los aplica' : `no es válida: ${mensaje.replace(/^canal \d+: /, '')}`
    this.d.registrar(`${ref ?? 'La pieza'} ${que}: volvió a ${vigente}.`, 'error')
    if (eraElUltimo) this.d.revertirPerilla?.(e.id, e.propId, vigente)
  }

  /** Un fusible o un foco se fundió: el Registro lo explica (el fusible, con la corriente y lo que duró la sobrecarga). */
  private fundido(e: EventoFundido): void {
    const ref = this.piezaDeElemento(e.indice)?.ref
    if (ref && this.esFusibleDeMultimetro(e.indice)) {
      this.d.registrar(`${ref} fundió su fusible: en modo de corriente va en serie, no en paralelo.`, 'aviso')
      return
    }
    if (ref && this.resultado?.netlist?.elements[e.indice]?.type === 'LAMP') {
      this.d.registrar(`${ref} se fundió: el filamento pasó de su temperatura máxima.`, 'aviso')
      return
    }
    if (ref) this.d.registrar(`${ref} se fundió: pasaron ${formatearMedida(e.amps, 'A')} durante ${formatearMedida(e.segundos, 's')}.`, 'aviso')
  }

  /** Repone el fusible o foco `id` fundido (clic corriendo la vista previa): queda entero y frío, sin tocar el documento.
   * false si no es uno del circuito que corre. */
  reponer(id: Id): boolean {
    const r = this.resultado
    const k = r?.netlist?.elements.findIndex((e, i) => (e.type === 'FUSE' || e.type === 'LAMP') && r.piezaDeElemento[i] === id) ?? -1
    if (!this.motor || k < 0 || this._fase === 'arrancando') return false
    // Solo se repone lo fundido: una pieza entera no tiene nada que reponer.
    const extra = this.leer()?.piezas.get(id)?.extra
    // El fusible de un multímetro se repone igual (su lectura dice si está fundido).
    const fundido = extra?.tipo === 'fusible' || extra?.tipo === 'foco' ? extra.fundido : this.leerInstrumentos()?.multimetros.get(id)?.fundido === true
    if (!fundido) return false
    this.motor.reponer(k)
    // Reponer cambia el circuito: el motor olvida los estados guardados (ya no son de este circuito).
    this.fijarRetrocesos(0)
    if (this._fase === 'pausada') this.motor.paso()
    const ref = this.piezaDeElemento(k)?.ref
    if (ref) this.d.registrar(`${ref} repuesto.`, 'info')
    return true
  }

  /** Un momento de tiempo real en una vista previa recién cargada y en pausa, para que muestre valores y no ceros. */
  private async rafaga(mia = this.carga): Promise<boolean> {
    this.motor?.setSpeed(1)
    await new Promise((resolver) => setTimeout(resolver, RAFAGA_EN_PAUSA_MS))
    if (mia !== this.carga || !this.motor) return false
    // Si mientras tanto se reanudó (F5), el reloj se queda corriendo.
    if (this._fase !== 'corriendo') this.motor.setSpeed(0)
    return true
  }

  pausar(): void {
    if (this._fase !== 'corriendo') return
    this.motor?.setSpeed(0)
    this.ponerFase('pausada')
  }

  reanudar(): void {
    if (this._fase !== 'pausada' || this._avance) return
    this.motor?.setSpeed(this.velocidad, this.sinTope)
    // Corriendo ya no hay un avance al que volver: el motor olvida lo guardado.
    this.fijarRetrocesos(0)
    this.ponerFase('corriendo')
  }

  /** La velocidad del tiempo: un número de la serie o `Infinity`, «Sin límite de tiempo real». */
  get velocidadVigente(): number {
    return this.sinTope ? Number.POSITIVE_INFINITY : this.velocidad
  }

  /** Cambia la velocidad sin reiniciar nada: el ciclo siguiente del worker ya usa la nueva. */
  ponerVelocidad(v: number): void {
    if (!(v > 0)) return
    this.sinTope = !Number.isFinite(v)
    if (!this.sinTope) this.velocidad = v
    if (this._fase === 'corriendo') this.motor?.setSpeed(this.velocidad, this.sinTope)
  }

  /** El avance en curso (F6 o «Avanzar hasta t»), o null. */
  get avance(): AvanceSim | null {
    return this._avance
  }

  /** Detenida, arranca en pausa y avanza `dt` desde t = 0; corriendo, pausa; en pausa, avanza `dt` (o un paso del motor) y
   * vuelve a la pausa. Un avance a la vez: sostener F6 no acumula. Resuelve con la llegada, o null si solo pausó o no
   * pudo. */
  async avanzar(dt: number | 'paso'): Promise<LlegadaSim | null> {
    if (this._avance || this._fase === 'arrancando') return null
    if (this._fase === 'corriendo') {
      this.pausar()
      return null
    }
    if (this._fase === 'detenida') {
      this.quedarPausada = true
      // `fase` y no `_fase`: tras el `await` la fase ya es otra.
      if (!(await this.iniciar()) || this.fase !== 'pausada') return null
    }
    return this.correrAvance(dt === 'paso' ? 'paso' : 'avanzar', dt)
  }

  /** Lo más rápido posible hasta `t` y pausa ahí. Un instante pasado devuelve 'pasado' (el diálogo ofrece «Reiniciar y
   * avanzar hasta t», que llama con `reiniciar` y vuelve a t = 0). */
  async avanzarHasta(t: number, reiniciar = false): Promise<LlegadaSim | 'pasado' | null> {
    if (this._avance || this._fase === 'arrancando' || !(t > 0) || !Number.isFinite(t)) return null
    if (reiniciar && this.activa) this.detener()
    if (this._fase === 'detenida') {
      this.quedarPausada = true
      // `fase` y no `_fase`: tras el `await` la fase ya es otra.
      if (!(await this.iniciar()) || this.fase !== 'pausada') return null
    } else if (this._fase === 'corriendo') this.pausar()
    if (t <= this.tiempo()) return 'pasado'
    return this.correrAvance('hasta', t)
  }

  /** F5 o Esc durante un avance lo dejan en pausa donde va. */
  interrumpir(): void {
    if (this._avance) this.motor?.interrumpir()
  }

  /** El tiempo simulado de la última lectura del motor (0 si no corre). */
  private tiempo(): number {
    return this.motor && this.resultado && this._fase !== 'arrancando' ? this.motor.read().time : 0
  }

  private async correrAvance(tipo: AvanceSim['tipo'], valor: number | 'paso'): Promise<LlegadaSim | null> {
    const motor = this.motor
    if (!motor) return null
    const desde = this.tiempo()
    const mia = this.carga
    this._avance = { tipo, desde, meta: valor === 'paso' ? null : tipo === 'hasta' ? valor : desde + valor }
    this.d.avance?.(this._avance)
    const r = tipo === 'hasta' ? await motor.avanzarHasta(valor as number) : await motor.avanzar(valor)
    if (mia !== this.carga) return null
    this._avance = null
    // El motor guardó el estado de antes de este avance (hasta 200); sin decirlo, se cuenta uno más.
    // Un avance rechazado o con error (t = NaN) no guardó nada: sin el dato del motor no se cuenta uno más.
    this.fijarRetrocesos(r.guardados ?? (Number.isNaN(r.t) ? this._retrocesos : Math.min(this._retrocesos + 1, RETROCESOS_MAX)))
    this.d.avance?.(null)
    return { t: r.t, dt: r.dt, interrumpido: r.interrumpida }
  }

  /** Retroceder: desde la pausa, el motor vuelve al estado previo al último avance y los instrumentos recortan lo
   * capturado a ese instante. Resuelve con el instante al que volvió, o null si no había a qué volver. */
  async retroceder(): Promise<{ t: number } | null> {
    if (!this.puedeRetroceder || !this.motor) return null
    const mia = this.carga
    const r = await this.motor.retroceder()
    if (mia !== this.carga) return null
    this.fijarRetrocesos(r.guardados)
    if (Number.isNaN(r.t)) return null
    // El tiempo regresó: los avisos ya dichos, la sobrecorriente vista y las rachas de quemado se vuelven a evaluar desde ahí.
    this.vigiaAvisos.reiniciar()
    this.vigia.reiniciar()
    this.quemado.reiniciarRachas()
    return { t: r.t }
  }

  /** El motor olvidó avances viejos por su tope de memoria: se dice una vez por vista previa, con a cuántos se puede volver. */
  private estadosPerdidos(_perdidos: number, guardados: number): void {
    this.fijarRetrocesos(guardados)
    if (this.perdidosDichos) return
    this.perdidosDichos = true
    this.d.registrar(`Retroceder guarda los avances recientes hasta un tope de memoria (64 MB): se olvidaron los más viejos y ahora se puede volver ${guardados === 1 ? 'a 1 avance' : `a ${guardados} avances`}.`, 'info')
  }

  /** La corriente animada. Encendida, el motor integra las corrientes por terminal; apagada no cuesta nada. */
  ponerCorrientes(si: boolean): void {
    if (si === this.corrientesActivas) return
    this.corrientesActivas = si
    if (this.motor && this.resultado && this._fase !== 'arrancando') {
      this.motor.activarCorrientes(si)
      this.fijarRetrocesos(0)
    }
  }

  /** Si la pieza está quemada («Las piezas se queman»): un clic la repone. */
  quemada(id: Id): boolean {
    return this.quemado.esQuemada(id)
  }

  /** Repone una pieza quemada (un clic sobre ella), como un fusible fundido. false si no estaba quemada. */
  reponerQuemada(id: Id): boolean {
    const lim = this.limites.get(id)
    if (!this.motor || !lim?.quema || !this.quemado.esQuemada(id)) return false
    this.motor.quemar(lim.quema.elemento, false)
    this.fijarRetrocesos(0)
    this.quemado.reponer(id)
    if (this._fase === 'pausada') this.motor.paso()
    const ref = this.d.circuito().doc.piezas[id]?.ref
    if (ref) this.d.registrar(`${ref} repuesto.`, 'info')
    return true
  }

  /** Detiene, libera el worker (su memoria vuelve al sistema) y olvida lo accionado. */
  detener(): void {
    this.carga++
    this.quitarError?.()
    this.quitarError = null
    this.quitarFundido?.()
    this.quitarFundido = null
    this.quitarRechazo?.()
    this.quitarRechazo = null
    this.quitarRango?.()
    this.quitarRango = null
    this.quitarCruces?.()
    this.quitarCruces = null
    this.quitarConflictos?.()
    this.quitarConflictos = null
    this.conflictosDichos.clear()
    this.quitarIndefinidos?.()
    this.quitarIndefinidos = null
    this.indefinidosDichos.clear()
    this.quitarPerdidos?.()
    this.quitarPerdidos = null
    this.fijarRetrocesos(0)
    this.perdidosDichos = false
    const captura = this.capturar()
    const motorViejo = this.motor
    const osciloscopios = this.instrumentos?.osciloscopios ?? []
    // Lo de esta vista previa (la velocidad y la corriente animada se conservan: son de la sesión y de los ajustes).
    this.reparto = null
    this.vigiaAvisos.reiniciar()
    this.vigiaReinicio.reiniciar()
    this.quemado.reiniciar()
    this.limites = new Map()
    if (this._avance) {
      this._avance = null
      this.d.avance?.(null)
    }
    this.guardarYSoltar(motorViejo, captura, osciloscopios)
    this.motor = null
    this.resultado = null
    this.reiniciarPerillas(null)
    this.accionados.clear()
    this.vigia.reiniciar()
    this.histeresis.reiniciar()
    this.histeresisMm.reiniciar()
    this.rangosOhm.clear()
    this.instrumentos = null
    this.quedarPausada = false
    this.lazo = null
    this.lazoDicho = false
    this.ponerFase('detenida')
  }

  /** Pone la opción de un interruptor o botón (pieza → opción de su propiedad): su resistencia cambia en caliente, sin
   * volver a t = 0 (un primer paso de Euler arranca tras el cambio). false si la pieza no se acciona o la vista previa no
   * corre. */
  async accionar(id: Id, opcion: string): Promise<boolean> {
    if (!this.activa || this.opcionDe(id) === undefined) return false
    if (this.opcionDe(id) === opcion) return true
    this.accionados.set(id, opcion)
    return this.actualizar()
  }

  private recarga: Promise<boolean> | null = null
  /** Se baja dentro de `recargar`, sin esperar a un microtarea: un cambio en caliente termina sin esperas. */
  private recargando = false
  private recargaPendiente = false

  /** El documento cambió corriendo o se accionó un interruptor: rearma la netlist. Si solo cambiaron resistencias y
   * fuentes van al motor en caliente (tiempo, carga y lecturas siguen); si cambió algo más, recarga desde t = 0. Sigue en
   * pausa si estaba en pausa. Los cambios que llegan mientras carga se juntan en una carga con el último valor. */
  actualizar(): Promise<boolean> {
    if (!this.activa) return Promise.resolve(false)
    if (this.recargando) {
      this.recargaPendiente = true
      return this.recarga!
    }
    this.recargando = true
    this.recarga = this.recargar()
    return this.recarga
  }

  private async recargar(): Promise<boolean> {
    // `recargando` baja en el mismo turno en que el ciclo termina (nada de `await` ni `finally` de promesa entre medio).
    let ok = true
    try {
      do {
        this.recargaPendiente = false
        const { lib, con } = this.d.circuito()
        const r = compilarNetlist(this.documento(), lib, con, { rangosOhm: this.rangosOhm })
        if (!r.netlist) {
          for (const e of r.errores) this.d.registrar(e, 'error')
          this.detener()
          return false
        }
        const previo = this.resultado?.netlist
        const cambios = this._fase !== 'arrancando' && this.motor && previo ? cambiosEnCaliente(previo, r.netlist) : null
        if (cambios) {
          this.resultado = r
          // Una frecuencia nueva pide otro paso máximo: el motor lo cambia sin perder el tiempo ni el estado.
          const hNuevo = pasoDeVistaPrevia(r.netlist, basesDeTiempo(r))
          const h = hNuevo !== this.hMotor ? hNuevo : undefined
          this.pasoDeLaBase = hNuevo < pasoDeVistaPrevia(r.netlist) ? hNuevo : null
          // Los topes por isla van con cada paso nuevo (`set_max_step` los iguala) y cuando cambia el de una fuente que no es la más rápida.
          const topesNuevos: TopesDePaso = topesDeVistaPrevia(r.netlist, basesDeTiempo(r))
          const textoTopes = JSON.stringify(topesNuevos)
          const topes = h !== undefined || textoTopes !== this.topesEnviados ? topesNuevos : undefined
          this.topesEnviados = textoTopes
          const ci = configDeInstrumentos(r.instrumentos)
          const texto = JSON.stringify(ci.config)
          const otraConfig = texto !== this.configEnviada
          if (cambios.length === 0 && h === undefined && !topes && !otraConfig) continue
          const hAntes = this.hMotor
          if (h !== undefined) this.hMotor = h
          const seq = this.motor!.setValues(cambios, h, topes)
          // Editar el circuito en caliente invalida lo guardado: el motor lo descarta.
          if (cambios.length > 0 || h !== undefined || topes) this.fijarRetrocesos(0)
          if (seq > 0) {
            for (const c of cambios) {
              const lista = this.enCaliente.get(c.indice) ?? [{ seq: 0, elemento: previo!.elements[c.indice] }]
              lista.push({ seq, elemento: c.elemento })
              this.enCaliente.set(c.indice, lista)
            }
            if (h !== undefined) {
              this.pasoAntes.set(seq, hAntes)
              this.ultimaSecuenciaDePaso = seq
            }
          }
          if (otraConfig) {
            // Después de los elementos: el modo nuevo de un multímetro ya está en el motor cuando su lectura empieza de nuevo.
            this.motor!.configurarInstrumentos(ci.config)
            this.configEnviada = texto
            this.instrumentos = ci
          }
          // En pausa el motor no da pasos: un solo paso corto del worker calcula las lecturas con el valor nuevo.
          if (this._fase === 'pausada') this.motor!.paso()
          continue
        }
        if (this._fase === 'pausada') this.quedarPausada = true
        ok = await this.cargar(r, true)
      } while (this.recargaPendiente && ok && this.activa)
      return ok
    } finally {
      this.recargando = false
    }
  }

  /** El worker cambió el rango del óhmetro `k`: la sesión lo recuerda y la netlist de referencia lo toma, sin mandarlo otra vez. */
  private cambioDeRango(k: number, rango: number): void {
    const ci = this.instrumentos
    const id = ci?.multimetros[k]
    const mm = id ? this.resultado?.instrumentos.multimetros.get(id) : undefined
    if (!ci || !id || !mm) return
    this.rangosOhm.set(id, rango)
    mm.rangoOhm = rango
    const elementos = this.resultado!.netlist?.elements
    const el = elementos?.[mm.elemento]
    if (elementos && el?.type === 'FUSE') elementos[mm.elemento] = { ...el, ohms: estructuraMultimetro(mm.ajustes.modo, mm.ajustes.ideal, rango).ohms }
    ci.config.multimetros[k].rango = rango
    this.configEnviada = JSON.stringify(ci.config)
  }

  private esFusibleDeMultimetro(indice: number): boolean {
    for (const mm of this.resultado?.instrumentos.multimetros.values() ?? []) if (mm.elemento === indice) return true
    return false
  }

  /** Multímetros y, si se pide, la pantalla del osciloscopio `osc`; con la vista previa detenida, la copia guardada al
   * detener. null si no hay nada que leer. */
  leerInstrumentos(osc?: Id): LecturaInstrumentos | null {
    const c = this.captura
    if (c) return { multimetros: c.multimetros, pantalla: osc ? c.pantallas.get(osc) : undefined, capturada: true }
    const ci = this.instrumentos
    const r = this.resultado
    if (!this.motor || !ci || !r || this._fase === 'arrancando') return null
    const k = osc ? ci.osciloscopios.indexOf(osc) : -1
    const sab = this.motor.leerInstrumentos(k >= 0 ? { osciloscopio: k } : {})
    const multimetros = new Map<Id, LecturaDeMultimetro>()
    sab?.multimetros.forEach((l, j) => {
      const id = ci.multimetros[j]
      const modo = MODOS_MULTIMETRO[l.modo] ?? 'V DC'
      const estado = l.lecturas === 0 ? 'sin-medida' : l.estado
      const valor = estado === 'ok' ? this.histeresisMm.valor(id, l.valor) : l.valor
      multimetros.set(id, { ...l, estado, valor, texto: textoMultimetro(modo, { ...l, estado, valor }) })
    })
    // Un multímetro con una terminal al aire no se arma: dice «sin conectar».
    const { doc, lib } = this.d.circuito()
    for (const id of r.instrumentos.sueltos) {
      const p = doc.piezas[id]
      if (p && lib.get(p.tipo)?.modelo?.tipo === 'multimetro') {
        multimetros.set(id, { lecturas: 0, t: 0, ventana: 0, valor: Number.NaN, frecuencia: Number.NaN, rango: 0, estado: 'sin-conectar', modo: 0, fundido: false, periodos: 0, texto: 'sin conectar' })
      }
    }
    return { multimetros, pantalla: sab?.pantalla, capturada: false }
  }

  /** Copia lo último de los instrumentos antes de soltar el worker. */
  private capturar(): ControlSimulacion['captura'] {
    const ci = this.instrumentos
    if (!this.motor || !ci || this._fase === 'arrancando' || ci.multimetros.length + ci.osciloscopios.length === 0) return null
    const pantallas = new Map<Id, PantallaSab>()
    let multimetros = this.leerInstrumentos()?.multimetros ?? new Map<Id, LecturaDeMultimetro>()
    for (const id of ci.osciloscopios) {
      const l = this.leerInstrumentos(id)
      if (!l) continue
      multimetros = l.multimetros
      if (l.pantalla && l.pantalla.version > 0) pantallas.set(id, l.pantalla)
    }
    this.captura = { multimetros, pantallas, amplias: new Map(), finos: new Map(), listo: Promise.resolve() }
    return this.captura
  }

  /** Suelta el worker de la vista previa detenida. Con osciloscopios, antes le pide la captura entera de cada uno (solo el
   * worker guarda las muestras): si no, exportar tras detener daría la última pantalla. Se suelta en cuanto contesta,
   * pase lo que pase. */
  private guardarYSoltar(motor: MotorSimulacion | null, captura: ControlSimulacion['captura'], osciloscopios: readonly Id[]): void {
    if (!motor) return
    if (!captura || osciloscopios.length === 0) return motor.dispose()
    const pedidas = osciloscopios.flatMap((id, k) => [
      motor.capturaAmplia(k, COLUMNAS_CAPTURA_AMPLIA).then(
        (p) => void (p && captura.amplias.set(id, p)),
        () => undefined
      ),
      motor.capturaFina(k).then(
        (r) => void (r && captura.finos.set(id, r)),
        () => undefined
      )
    ])
    captura.listo = Promise.all(pedidas).then(() => undefined).finally(() => motor.dispose())
  }

  /** La netlist con que corre la vista previa (la línea de carga del inspector la usa); null detenida. */
  get resultadoActual(): ResultadoNetlist | null {
    return this.resultado
  }

  /** La versión de la pantalla de `osc` (la de la captura si se detuvo); cambia cuando hay una pantalla nueva que dibujar. */
  versionPantalla(osc: Id): number {
    if (this.captura) return this.captura.pantallas.get(osc)?.version ?? 0
    const k = this.instrumentos?.osciloscopios.indexOf(osc) ?? -1
    return k >= 0 && this.motor && this._fase !== 'arrancando' ? this.motor.versionDePantalla(k) : 0
  }

  /** «Rearmar» del modo Único del osciloscopio `osc`. */
  rearmar(osc: Id): void {
    const k = this.instrumentos?.osciloscopios.indexOf(osc) ?? -1
    if (k >= 0) this.motor?.rearmar(k)
  }

  /** Escribe ya las pantallas con sus muestras de exportación (pausar la pantalla del osciloscopio). */
  forzarPantallas(): void {
    this.motor?.forzarPantallas()
  }

  /** Captura entera de `osc` para exportar (todo lo que conservan sus sondas, hasta `hasta` si se exporta una pantalla
   * congelada). Con la vista previa detenida, la guardada al detener hasta que empiece otra; null si no hay nada. */
  async capturaAmplia(osc: Id, hasta?: number): Promise<PantallaSab | null> {
    // Detenida: la que se guardó al detener (hasta la vista previa siguiente).
    if (this.captura) {
      await this.captura.listo
      return this.captura.amplias.get(osc) ?? null
    }
    if (!this.motor || this._fase === 'arrancando') return null
    const k = this.instrumentos?.osciloscopios.indexOf(osc) ?? -1
    return k >= 0 ? this.motor.capturaAmplia(k, COLUMNAS_CAPTURA_AMPLIA, hasta) : null
  }

  /** Columnas finas de todo lo que conservan las sondas de `osc`, para desplazarse por la captura. Detenida, las guardadas
   * al detener; en pausa, las del worker hasta `hasta`. Null si no hay. */
  async registroFino(osc: Id, hasta?: number): Promise<RegistroFino | null> {
    if (this.captura) {
      await this.captura.listo
      return this.captura.finos.get(osc) ?? null
    }
    if (!this.motor || this._fase === 'arrancando') return null
    const k = this.instrumentos?.osciloscopios.indexOf(osc) ?? -1
    return k >= 0 ? this.motor.capturaFina(k, hasta) : null
  }

  /** La pantalla de `osc` mide `n` píxeles de dispositivo: el worker arma ese número de columnas. */
  columnasDePantalla(osc: Id, n: number): void {
    this.columnasPedidas.set(osc, n)
    const k = this.instrumentos?.osciloscopios.indexOf(osc) ?? -1
    if (k >= 0) this.motor?.columnasDePantalla(k, n)
  }

  /** Lo último que dejó el motor, por red y por pieza; null si no corre. */
  leer(): Lectura | null {
    if (!this.motor || !this.resultado || this._fase === 'arrancando') return null
    const s = this.motor.read()
    this.anunciarLazo(s)
    const r = this.resultado
    const l = leerResultados(r, s)
    const ref = (id: Id) => this.d.circuito().doc.piezas[id]?.ref
    // La media del último intervalo: la de los avisos, el quemado y las cifras.
    const base = s.promedio ? leerResultados(r, { ...s, voltages: s.promedio.voltages, currents: s.promedio.currents }) : l
    const potencias = new Map<Id, number>()
    if (s.promedio?.potencias)
      for (const k of r.potencias) {
        const id = r.piezaDeElemento[k]
        const m = id ? base.piezas.get(id) : undefined
        if (!id || !m) continue
        potencias.set(id, s.promedio.potencias[k])
        m.p = s.promedio.potencias[k]
      }
    // Un LED que pasa de su corriente nominal se dice una vez por vista previa, sin detener nada.
    for (const t of this.vigia.revisar(base, ref)) this.d.registrar(t, 'aviso')
    const avisos = this.vigiaAvisos.revisar(base, this.limites, potencias, this.d.reloj?.() ?? performance.now(), ref, l)
    for (const t of avisos.registro) this.d.registrar(t, 'aviso')
    for (const t of this.vigiaReinicio.revisar(base, ref)) this.d.registrar(t, 'aviso')
    l.avisos = avisos.visibles
    if (this.d.quemar?.() && s.promedio)
      for (const id of this.quemado.revisar(base, s.promedio.duracion, s.promedio.fin ?? s.time, this.limites, potencias, l)) {
        const lim = this.limites.get(id)!
        this.motor.quemar(lim.quema!.elemento, true)
        this.fijarRetrocesos(0)
        this.d.registrar(`${ref(id) ?? id} se quemó: pasó del doble de lo que admite durante ${formatearMedida(lim.quema!.durante, 's')}. Haz clic sobre la pieza para reponerla.`, 'error')
      }
    l.quemadas = this.quemado.todas
    if (this.corrientesActivas && s.terminales) l.corrientes = this.repartir(s.terminales.medias, s.terminales.absolutas, s.currents)
    l.estable = this.estable(base)
    return l
  }

  /** La corriente de cada tramo de cable con las corrientes por terminal del intervalo (el reparto se arma una vez). */
  private repartir(medias: Float64Array, absolutas: Float64Array, instantaneas: Float64Array): NonNullable<Lectura['corrientes']> {
    if (!this.reparto) {
      const { doc, lib, con } = this.d.circuito()
      this.reparto = armarReparto(doc, lib, con, this.resultado!.puertos)
      this.media = new Float64Array(this.reparto.tramos.length)
      this.absoluta = new Float64Array(this.reparto.tramos.length)
    }
    this.reparto.repartir(medias, absolutas, this.media, this.absoluta, instantaneas)
    return { tramos: this.reparto.tramos, media: this.media, absoluta: this.absoluta, sinFlechas: this.reparto.sinFlechas }
  }

  /** Las redes y las piezas de `base` (el promedio o el último paso) con la histéresis de la última cifra. */
  private estable(base: Lectura): NonNullable<Lectura['estable']> {
    const h = this.histeresis
    const redes = new Map<number, number>()
    for (const [id, v] of base.redes) redes.set(id, h.valor(`r${id}`, v))
    const piezas = new Map<Id, MedicionPieza>()
    for (const [id, m] of base.piezas) {
      const q: MedicionPieza = { ...m, v: h.valor(`v${id}`, m.v), i: h.valor(`i${id}`, m.i), p: h.valor(`p${id}`, m.p) }
      if (m.cursor !== undefined) q.cursor = h.valor(`c${id}`, m.cursor)
      piezas.set(id, q)
    }
    return { redes, piezas }
  }
}
