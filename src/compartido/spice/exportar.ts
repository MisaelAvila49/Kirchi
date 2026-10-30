/**
 * Exporta la `NetlistMotor` a una netlist de SPICE para ngspice 47, con los mismos parámetros y ecuaciones que `engine/referencias/*.cir`, que es contra lo que se mide.
 * Seguridad: lo que entra es no confiable (llega por IPC). Ningún nombre del usuario pasa al texto de SPICE (nodos `n<número>`, redes digitales `d<número>`), los números se escriben sin configuración regional y se rechaza lo no finito.
 */

import type { ElementoMotor, FuenteMsi, NetlistMotor, NucleoMsi, Onda, SalidaMsi } from '../netlistMotor'
import { sintetizarLut, sintetizarMsi } from './sintesis'
import { subcircuitoLdr, subcircuitoPasos, subcircuitoTermistor } from './subcircuitos'

/** Una pieza que no se puede exportar: el mensaje la nombra (con su referencia si quien llama la dio). */
export class ErrorExportacion extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorExportacion'
  }
}

export interface OpcionesExportar {
  /** Nombre del documento de cada red (nodo del motor → nombre) y referencia de cada elemento: solo para la tabla de vuelta y los mensajes. */
  nombresNodos?: ReadonlyMap<number, string>
  nombresElementos?: readonly string[]
  /** Índice del elemento `V` que lleva la excitación de un análisis AC (`AC 1`). */
  fuenteAc?: number
  /** Amplitud de esa excitación en volts (por omisión 1: el resultado queda en ganancia). */
  magnitudAc?: number
  /** Código vigente de cada convertidor de aproximaciones (índice en la netlist → código): sus salidas se exportan fijas en él. Sin entrada, 0. */
  codigoMsi?: ReadonlyMap<number, number>
}

export interface SondaExportada {
  /** Índice en `netlist.sondas`. */
  indice: number
  /** Nombre del vector en ngspice (`sonda<indice>`). */
  nombre: string
  /** Expresión de ngspice que la define (`let nombre = expresion`), o null si no se puede exportar (con su aviso). */
  expresion: string | null
  /** Vectores que ngspice debe guardar además de los nodos para evaluar la expresión (`@r1[i]`). */
  guardar: string[]
}

export interface Exportacion {
  /** Cuerpo de la netlist: modelos, subcircuitos y elementos, uno por renglón, sin título, control ni `.end`. */
  cuerpo: string
  /** Archivos que el cuerpo lee del directorio de trabajo (los estados de los contadores). Nombres generados, nunca del usuario. */
  archivos: Record<string, string>
  /** Opciones de `.options` que los elementos piden (`method=gear` con relé, `xtrtol=7` con lógica). */
  opciones: string[]
  sondas: SondaExportada[]
  /** Vector de ngspice que lleva la corriente de cada elemento que lo expone (`@r3[i]`, `i(v1)`), por índice en la netlist. */
  corrienteDeElemento: ReadonlyMap<number, string>
  avisos: string[]
  /** Tabla de vuelta: nombre en SPICE → qué es. */
  tabla: TablaVuelta
}

export interface TablaVuelta {
  /** `n3` → nodo 3 del motor (y su nombre en el documento, si se dio). */
  nodos: Map<string, { nodo: number; nombre?: string }>
  /** Nombre del elemento de SPICE que lleva su corriente (`v5`, `r3`...) → índice en la netlist (y referencia). */
  elementos: Map<string, { indice: number; nombre?: string }>
  /** `d2` → red digital 2. */
  digitales: Map<string, number>
}

/** Nombre SPICE de un nodo del motor: `0` es la tierra. */
export const nombreDeNodo = (n: number): string => (n === 0 ? '0' : `n${n}`)
export const nombreDeRed = (n: number): string => `d${n}`

/** Un número para SPICE: sin configuración regional, finito y sin «-0». */
export function numero(v: number, que = 'un valor'): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ErrorExportacion(`${que} no es un número finito.`)
  return Object.is(v, -0) ? '0' : String(v)
}

const R_UNO_PS = 1e-12

const PARAMETROS_BJT = new Set(['is', 'bf', 'nf', 'vaf', 'ikf', 'ise', 'ne', 'br', 'nr', 'var', 'ikr', 'isc', 'nc', 'rb', 'irb', 'rbm', 're', 'rc', 'cje', 'vje', 'mje', 'tf', 'xtf', 'vtf', 'itf', 'cjc', 'vjc', 'mjc', 'xcjc', 'tr', 'fc'])
/** Los de `JfetModel` del motor que ngspice reconoce con el mismo nombre. */
const PARAMETROS_JFET = new Set(['vto', 'beta', 'lambda', 'is', 'n', 'cgs', 'cgd', 'pb', 'fc', 'rd', 'rs', 'b'])
const PARAMETROS_MOS = new Set(['vto', 'kp', 'lambda', 'rd', 'rs', 'cbd', 'cbs', 'is', 'pb', 'mj', 'fc', 'cgso', 'cgdo'])
/** Los de `OpampModel::default` del motor. */
const OA_POR_OMISION: Record<string, number> = { a0: 2e5, gbw: 1e6, sr: 0.5e6, rin: 2e6, rout: 75, ilim: 25e-3, dhi: 1, dlo: 1, rq: 17.6e3 }
const MOS_W_L_POR_OMISION = 1e-4
const DIODO_POR_OMISION: Record<string, number> = { is: 1e-14, n: 1, rs: 0, cjo: 0, vj: 1, m: 0.5, tt: 0, fc: 0.5, ibv: 1e-3, nbv: 1 }

/** Amplificador operacional de una etapa: el mismo de `engine/referencias/modelos.lib` y del motor. */
const SUBCKT_AMPOP = [
  '.subckt ampop mas menos sal vp vn params: a0=2e5 gbw=1e6 sr=0.5e6 rin=2e6 rout=75 ilim=25m dhi=1 dlo=1 rq=17.6k',
  '.param r1=1e6',
  '.param gm={a0/r1}',
  '.param c1={a0/(2*3.141592653589793*gbw*r1)}',
  '.param imax={sr*c1}',
  '.param gc={1000*imax}',
  'rin mas menos {rin}',
  'rq vp vn {rq}',
  'bg 0 x i={imax}*tanh({gm}*v(mas,menos)/{imax})',
  'r1 x 0 {r1}',
  'c1 x 0 {c1}',
  'bcl x 0 i={gc}*(max(v(x)-v(vp)+{dhi},0)+min(v(x)-v(vn)-{dlo},0))',
  'bop vp sal i=0.5*({ilim}*tanh((v(x)-v(sal))/({rout}*{ilim}))+sqrt(({ilim}*tanh((v(x)-v(sal))/({rout}*{ilim})))^2+1e-12))',
  'bon vn sal i=0.5*({ilim}*tanh((v(x)-v(sal))/({rout}*{ilim}))-sqrt(({ilim}*tanh((v(x)-v(sal))/({rout}*{ilim})))^2+1e-12))',
  '.ends'
]

/** Segmentos a a g de cada dígito (`SEGMENTOS` de `engine/src/digital/modelos.rs`): el 6 sin la barra de arriba y el 9 sin la de abajo. */
const SEGMENTOS: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1, 1, 0],
  [0, 1, 1, 0, 0, 0, 0],
  [1, 1, 0, 1, 1, 0, 1],
  [1, 1, 1, 1, 0, 0, 1],
  [0, 1, 1, 0, 0, 1, 1],
  [1, 0, 1, 1, 0, 1, 1],
  [0, 0, 1, 1, 1, 1, 1],
  [1, 1, 1, 0, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 0, 0, 1, 1]
]

/** La tabla de verdad del decodificador como la pide `d_genlut`: una cadena por salida con las 16 combinaciones (A es el bit menos significativo). */
export function tablaDecodificador(activoAlto: boolean): string {
  let t = ''
  for (let s = 0; s < 7; s++) {
    for (let codigo = 0; codigo < 16; codigo++) {
      const enciende = codigo < 10 && SEGMENTOS[codigo][s] === 1
      t += enciende === activoAlto ? '1' : '0'
    }
  }
  return t
}

/** El archivo de estados de `d_state` de un contador de 4 bits: salidas q3 q2 q1 q0 co y una entrada sin uso. */
export function estadosContador(modulo: number): string {
  const lineas = ['* contador: salidas q3 q2 q1 q0 co, entrada sin uso']
  for (let s = 0; s < modulo; s++) {
    const bits = [3, 2, 1, 0].map((b) => `${(s >> b) & 1}s`).join(' ')
    const co = s === modulo - 1 ? '1s' : '0s'
    for (const entrada of [0, 1]) lineas.push(`${s} ${bits} ${co} ${entrada} -> ${(s + 1) % modulo}`)
  }
  return lineas.join('\n') + '\n'
}

type Campos = Record<string, unknown>

export function exportarSpice(netlist: NetlistMotor, opciones: OpcionesExportar = {}): Exportacion {
  if (typeof netlist !== 'object' || netlist === null || !Array.isArray(netlist.elements)) throw new ErrorExportacion('La netlist no tiene la forma esperada.')
  const nodos = netlist.nodes
  const redes = netlist.digital_nets ?? 0
  if (!Number.isInteger(nodos) || nodos < 1 || nodos > 100_000) throw new ErrorExportacion('El número de nodos de la netlist no es válido.')
  if (!Number.isInteger(redes) || redes < 0 || redes > 100_000) throw new ErrorExportacion('El número de redes digitales de la netlist no es válido.')
  if (netlist.elements.length > 200_000) throw new ErrorExportacion('La netlist tiene demasiados elementos.')

  const cuerpo: string[] = []
  const modelos: string[] = []
  const archivos: Record<string, string> = {}
  const opcionesSolver = new Set<string>()
  const avisos: string[] = []
  const tabla: TablaVuelta = { nodos: new Map(), elementos: new Map(), digitales: new Map() }
  const modelosHechos = new Map<string, string>()
  let usaAmpop = false
  let k = 0

  const etiqueta = (): string => {
    const e = netlist.elements[k] as unknown as Campos
    const ref = opciones.nombresElementos?.[k]
    return ref ? `${ref}` : `el elemento ${k + 1} (${typeof e?.type === 'string' ? e.type.slice(0, 12) : '?'})`
  }
  const falla = (texto: string): never => {
    throw new ErrorExportacion(`No se puede exportar ${etiqueta()} a SPICE: ${texto}`)
  }

  // Un modelo con un nombre generado; el mismo texto reutiliza el nombre.
  const modelo = (prefijo: string, definicion: (nombre: string) => string): string => {
    const probe = definicion('@')
    const clave = `${prefijo}:${probe}`
    let nombre = modelosHechos.get(clave)
    if (!nombre) {
      nombre = `${prefijo}${modelosHechos.size + 1}`
      modelosHechos.set(clave, nombre)
      modelos.push(definicion(nombre))
    }
    return nombre
  }

  const nodo = (e: Campos, c: string): string => {
    const v = e[c]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= nodos) return falla(`el nodo «${c}» no es válido.`)
    registrarNodo(v)
    return nombreDeNodo(v)
  }
  const registrarNodo = (v: number): void => {
    if (v === 0) return
    const id = nombreDeNodo(v)
    if (!tabla.nodos.has(id)) tabla.nodos.set(id, { nodo: v, ...(opciones.nombresNodos?.get(v) !== undefined ? { nombre: opciones.nombresNodos.get(v) } : {}) })
  }
  const nodoOpc = (e: Campos, c: string): string | null => (e[c] === undefined ? null : nodo(e, c))
  const red = (e: Campos, c: string): string => redDe(e[c], c)
  const redDe = (v: unknown, c: string): string => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= redes) return falla(`la red digital «${c}» no es válida.`)
    const id = nombreDeRed(v)
    tabla.digitales.set(id, v)
    return id
  }
  const num = (e: Campos, c: string): number => {
    const v = e[c]
    if (typeof v !== 'number' || !Number.isFinite(v)) return falla(`«${c}» no es un número finito.`)
    return v
  }
  const positivo = (e: Campos, c: string): number => {
    const v = num(e, c)
    if (!(v > 0)) return falla(`«${c}» debe ser mayor que cero.`)
    return v
  }
  const f = (v: number): string => numero(v)
  /** Un número dentro de una expresión de una fuente B: los negativos entre paréntesis. */
  const fp = (v: number): string => (v < 0 ? `(${f(v)})` : f(v))
  const valorDe = (e: Campos, c: string, porOmision?: number): number => {
    if (e[c] === undefined) {
      if (porOmision === undefined) return falla(`falta «${c}».`)
      return porOmision
    }
    return num(e, c)
  }
  /** Un voltaje de nodo dentro de una expresión: la tierra es 0. */
  const vn = (n: string): string => (n === '0' ? '0' : `v(${n})`)
  /** Valor inicial del canal que nombra el campo `campo` (el que la perilla tiene en el documento). */
  const valorDeCanal = (e: Campos, campo = 'canal'): number => {
    const c = e[campo]
    const canal = typeof c === 'number' && Number.isInteger(c) ? netlist.canales?.[c] : undefined
    if (!canal || typeof canal.inicial !== 'number') return falla(`su canal «${campo}» no existe.`)
    return canal.inicial
  }
  /** La tabla R/T del termistor: al menos dos pares con temperatura ascendente y resistencia positiva. */
  const tablaTermistor = (t: unknown): [number, number][] | undefined => {
    if (t === undefined) return undefined
    const ok = Array.isArray(t) && t.length >= 2 && t.length <= 1000 && t.every((p, i) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] > 0 && (i === 0 || p[0] > t[i - 1][0]))
    if (!ok) return falla('su tabla R/T debe tener pares [°C, Ω] con la temperatura ascendente y R positiva.')
    return t as [number, number][]
  }
  const retardo = (e: Campos, c: string): number => Math.max(R_UNO_PS, num(e, c))
  /** Las redes digitales de una lista del elemento. */
  const redesDe = (v: unknown, c: string): string[] => {
    if (!Array.isArray(v) || v.length > 1024) return falla(`«${c}» debe ser una lista de redes digitales.`)
    return v.map((x) => redDe(x, c))
  }
  /** Una tabla de `NetlistMotor.tablas` por su índice. */
  const tablaDe = (indice: unknown): (number | string)[] => {
    const t = typeof indice === 'number' && Number.isInteger(indice) ? netlist.tablas?.[indice] : undefined
    if (!Array.isArray(t)) return falla('su tabla no existe en la netlist.')
    return t
  }
  /** La síntesis de un elemento genérico; un parámetro que no cabe se informa con el nombre de la pieza. */
  const sintesis = (hacer: () => { modelos: string[]; lineas: string[] }): { modelos: string[]; lineas: string[] } => {
    try {
      return hacer()
    } catch (err) {
      return falla(err instanceof Error ? err.message : 'no se puede sintetizar.')
    }
  }

  /** Parámetros de un modelo: solo los nombres de la lista, con su valor finito. */
  const parametros = (m: unknown, permitidos: ReadonlySet<string>, aparte: readonly string[] = []): string => {
    if (m === undefined) return ''
    if (typeof m !== 'object' || m === null) return falla('su modelo no tiene la forma esperada.')
    for (const c of Object.keys(m)) if (!permitidos.has(c) && !aparte.includes(c)) falla(`el parámetro «${c.slice(0, 8)}» de su modelo no existe.`)
    return Object.entries(m as Campos)
      .filter(([c]) => permitidos.has(c))
      .map(([c, v]) => {
        if (typeof v !== 'number' || !Number.isFinite(v)) return falla(`el parámetro «${c.slice(0, 8)}» de su modelo no es un número finito.`)
        return `${c}=${f(v)}`
      })
      .join(' ')
  }
  for (const [i, el] of netlist.elements.entries()) {
    if (typeof el !== 'object' || el === null || typeof (el as Campos).type !== 'string') {
      k = i
      falla('no tiene la forma esperada.')
    }
  }

  // Redes digitales que alguien lee y nadie maneja: con 74LS una entrada al aire lee 1.
  const manejadas = new Set<number>()
  const leidas = new Map<number, 'x' | 'uno'>()
  const lee = (v: unknown, z: unknown): void => {
    if (typeof v === 'number' && !leidas.has(v)) leidas.set(v, z === 'uno' ? 'uno' : 'x')
  }
  const maneja = (...vs: unknown[]): void => {
    for (const v of vs) if (typeof v === 'number') manejadas.add(v)
  }

  // Una red digital cualquiera necesita un nombre propio para los nodos auxiliares.
  let auxiliar = 0
  const redAuxiliar = (): string => `da${auxiliar++}`

  const onda = (w: Onda): string => {
    const o = w as unknown as Campos
    switch (o.kind) {
      case 'dc':
        return `dc ${f(num(o, 'v'))}`
      case 'sine': {
        const fase = o.phase === undefined ? 0 : num(o, 'phase')
        return `sin(${f(num(o, 'offset'))} ${f(num(o, 'amp'))} ${f(num(o, 'freq'))} 0 0 ${f(fase * 360)})`
      }
      case 'square': {
        const freq = positivo(o, 'freq')
        const duty = valorDe(o, 'duty', 0.5)
        const periodo = 1 / freq
        // Flancos de 1 ps, como las referencias; el ancho se acorta lo mismo para que el nivel alto termine donde termina el del motor.
        return `pulse(${f(num(o, 'low'))} ${f(num(o, 'high'))} 0 1p 1p ${f(Math.max(0, duty * periodo - R_UNO_PS))} ${f(periodo)})`
      }
      case 'pulse': {
        const freq = positivo(o, 'freq')
        const fase = o.phase === undefined ? 0 : num(o, 'phase')
        const periodo = 1 / freq
        const subida = Math.max(R_UNO_PS, num(o, 'rise'))
        const bajada = Math.max(R_UNO_PS, num(o, 'fall'))
        const ancho = num(o, 'width')
        if (ancho < 0) return falla('el ancho del pulso es negativo.')
        // La fase reemplaza al retardo de SPICE: td = (1 - fase)/freq.
        const td = fase > 0 ? (1 - fase) * periodo : 0
        return `pulse(${f(num(o, 'low'))} ${f(num(o, 'high'))} ${f(td)} ${f(subida)} ${f(bajada)} ${f(ancho)} ${f(periodo)})`
      }
      case 'stair': {
        const freq = positivo(o, 'freq')
        const pasos = num(o, 'steps')
        if (!Number.isInteger(pasos) || pasos < 2 || pasos > 256) return falla('la escalera debe tener de 2 a 256 pasos.')
        const fase = o.phase === undefined ? 0 : num(o, 'phase')
        if (!(fase >= 0 && fase < 1)) return falla('la fase de la escalera debe estar en [0, 1).')
        const bajo = num(o, 'low')
        const alto = num(o, 'high')
        const periodo = 1 / freq
        const nivel = (j: number): number => bajo + ((alto - bajo) * (j % pasos)) / (pasos - 1)
        // Un periodo que empieza en la fase: los cambios de nivel caen en los límites de escalón y cada uno es un salto de 1 ps.
        const j0 = Math.min(Math.floor(fase * pasos), pasos - 1)
        const cambios: [number, number][] = []
        for (let m = 1; m <= pasos; m++) {
          const t = ((j0 + m) / pasos - fase) * periodo
          if (t > 1e-9 * periodo && t < periodo * (1 - 1e-9)) cambios.push([t, j0 + m])
        }
        const puntos: string[] = [`0 ${f(nivel(j0))}`]
        let actual = j0
        for (const [t, j] of cambios) {
          puntos.push(`${f(t - R_UNO_PS)} ${f(nivel(actual))}`, `${f(t)} ${f(nivel(j))}`)
          actual = j
        }
        puntos.push(`${f(periodo)} ${f(nivel(actual))}`)
        return `pwl(${puntos.join(' ')}) r=0`
      }
      case 'pwl': {
        const pts = o.puntos
        if (!Array.isArray(pts) || pts.length < 1 || pts.length > 1000 || pts.some((p) => !Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) {
          return falla('sus puntos por tramos no son válidos.')
        }
        if (pts[0][0] !== 0 || pts.some((p, i) => i > 0 && !(p[0] > pts[i - 1][0]))) return falla('los tiempos de sus puntos deben crecer desde 0.')
        // Un solo punto no tiene tramos: SPICE lo pide como continua.
        if (pts.length === 1) return `dc ${f(pts[0][1])}`
        return `pwl(${pts.map(([t, v]) => `${f(t)} ${f(v)}`).join(' ')})${o.repetir === true ? ' r=0' : ''}`
      }
      default:
        return falla('su forma de onda no se puede exportar.')
    }
  }

  /** El `IC=` de un capacitor o un inductor (solo vale con `uic` en el transitorio). */
  const condicionInicial = (e: Campos): string => (e.ic === undefined ? '' : ` ic=${f(num(e, 'ic'))}`)

  const sondaDeElemento = new Map<number, string>()

  for (k = 0; k < netlist.elements.length; k++) {
    const e = netlist.elements[k] as unknown as Campos
    const tipo = e.type as string
    const nombreDeElemento = (id: string): void => {
      tabla.elementos.set(id, { indice: k, ...(opciones.nombresElementos?.[k] !== undefined ? { nombre: opciones.nombresElementos[k] } : {}) })
    }
    switch (tipo as ElementoMotor['type']) {
      case 'R': {
        const [a, b] = [nodo(e, 'a'), nodo(e, 'b')]
        cuerpo.push(`r${k} ${a} ${b} ${f(positivo(e, 'ohms'))}`)
        sondaDeElemento.set(k, `@r${k}[i]`)
        nombreDeElemento(`r${k}`)
        break
      }
      case 'C': {
        const [a, b] = [nodo(e, 'a'), nodo(e, 'b')]
        cuerpo.push(`c${k} ${a} ${b} ${f(positivo(e, 'farads'))}${condicionInicial(e)}`)
        sondaDeElemento.set(k, `@c${k}[i]`)
        nombreDeElemento(`c${k}`)
        break
      }
      case 'L': {
        const [a, b] = [nodo(e, 'a'), nodo(e, 'b')]
        cuerpo.push(`l${k} ${a} ${b} ${f(positivo(e, 'henries'))}${condicionInicial(e)}`)
        sondaDeElemento.set(k, `@l${k}[i]`)
        nombreDeElemento(`l${k}`)
        break
      }
      case 'V': {
        const [a, b] = [nodo(e, 'a'), nodo(e, 'b')]
        if (typeof e.wave !== 'object' || e.wave === null) falla('no tiene forma de onda.')
        cuerpo.push(`v${k} ${a} ${b} ${onda(e.wave as Onda)}${opciones.fuenteAc === k ? ` ac ${f(opciones.magnitudAc ?? 1)}` : ''}`)
        sondaDeElemento.set(k, `i(v${k})`)
        nombreDeElemento(`v${k}`)
        break
      }
      case 'I': {
        const [a, b] = [nodo(e, 'a'), nodo(e, 'b')]
        cuerpo.push(`i${k} ${a} ${b} ${typeof e.wave === 'object' && e.wave !== null ? onda(e.wave as Onda) : `dc ${f(num(e, 'amps'))}`}`)
        break
      }
      case 'D': {
        const [a, b] = [nodo(e, 'a'), nodo(e, 'b')]
        const p = (c: string): number => valorDe(e, c, DIODO_POR_OMISION[c])
        const base = `is=${f(p('is'))} n=${f(p('n'))} rs=${f(p('rs'))} cjo=${f(p('cjo'))} vj=${f(p('vj'))} m=${f(p('m'))} tt=${f(p('tt'))} fc=${f(p('fc'))}`
        const ruptura = e.bv === undefined ? '' : ` bv=${f(num(e, 'bv'))} ibv=${f(p('ibv'))} nbv=${f(p('nbv'))}`
        const m = modelo('dm', (n) => `.model ${n} d(${base}${ruptura})`)
        cuerpo.push(`d${k} ${a} ${b} ${m}`)
        sondaDeElemento.set(k, `@d${k}[id]`)
        nombreDeElemento(`d${k}`)
        break
      }
      case 'Q': {
        const [c, b, em] = [nodo(e, 'c'), nodo(e, 'b'), nodo(e, 'e')]
        const pnp = e.pnp === true
        const ps = parametros(e.model, PARAMETROS_BJT)
        const m = modelo('qm', (n) => `.model ${n} ${pnp ? 'pnp' : 'npn'}(${ps})`)
        cuerpo.push(`q${k} ${c} ${b} ${em} ${m}`)
        if (e.euler === true) opcionesSolver.add('method=gear')
        break
      }
      case 'M': {
        const [d, g, s] = [nodo(e, 'd'), nodo(e, 'g'), nodo(e, 's')]
        const pmos = e.pmos === true
        const ps = parametros(e.model, PARAMETROS_MOS, ['w', 'l'])
        const mod = (e.model ?? {}) as Campos
        const w = mod.w === undefined ? MOS_W_L_POR_OMISION : positivo(mod, 'w')
        const l = mod.l === undefined ? MOS_W_L_POR_OMISION : positivo(mod, 'l')
        const m = modelo('mm', (n) => `.model ${n} ${pmos ? 'pmos' : 'nmos'}(level=1 ${ps})`)
        cuerpo.push(`m${k} ${d} ${g} ${s} ${s} ${m} w=${f(w)} l=${f(l)}`)
        break
      }
      case 'OA': {
        const ns = [nodo(e, 'p'), nodo(e, 'n'), nodo(e, 'out'), nodo(e, 'vp'), nodo(e, 'vn')]
        const mod = (e.model ?? {}) as Campos
        if (typeof mod !== 'object' || mod === null) falla('su modelo no tiene la forma esperada.')
        for (const c of Object.keys(mod)) if (!(c in OA_POR_OMISION)) falla(`el parámetro «${c.slice(0, 8)}» de su modelo no existe.`)
        const ps = Object.keys(OA_POR_OMISION).map((c) => {
          const v = mod[c] === undefined ? OA_POR_OMISION[c] : num(mod, c)
          return v < 0 ? falla(`el parámetro «${c}» no puede ser negativo.`) : `${c}=${f(v)}`
        })
        usaAmpop = true
        cuerpo.push(`x${k} ${ns.join(' ')} ampop ${ps.join(' ')}`)
        // Lo que el motor integra con Euler (un lazo interno mucho más rápido que el paso) con el trapecio oscila: Gear lo amortigua.
        if (e.euler === true) opcionesSolver.add('method=gear')
        break
      }
      case 'LAMP': {
        const [a, b] = [nodo(e, 'a'), nodo(e, 'b')]
        const [rf, kk, pnom, tau] = [positivo(e, 'rfrio'), num(e, 'k'), positivo(e, 'pnom'), positivo(e, 'tau')]
        // La resistencia crece con la temperatura relativa th (0 frío, 1 la nominal): rfrio (1 + k th). Pierde 0.1 th por
        // conducción y 0.9 th^(10/3) por radiación (I ∝ V^0.55), con la capacidad tau p'(1) = 3.1 tau.
        const r = `(${f(rf)}*(1+${fp(kk)}*v(th${k})))`
        cuerpo.push(`bl${k} ${a} ${b} i=(${vn(a)}-${vn(b)})/${r}`)
        cuerpo.push(`bp${k} 0 th${k} i=(${vn(a)}-${vn(b)})*(${vn(a)}-${vn(b)})/${r}/${f(pnom)}`)
        cuerpo.push(`rth${k} th${k} 0 10`)
        cuerpo.push(`bq${k} th${k} 0 i=0.9*pwr(v(th${k}),3.333333333)`)
        cuerpo.push(`cth${k} th${k} 0 ${f(3.1 * tau)}`)
        break
      }
      case 'MOTOR': {
        const [a, b] = [nodo(e, 'a'), nodo(e, 'b')]
        const [r, l, ke, j, bm] = [positivo(e, 'r'), positivo(e, 'l'), positivo(e, 'ke'), positivo(e, 'j'), positivo(e, 'bm')]
        cuerpo.push(`rm${k} ${a} xm${k}a ${f(r)}`)
        cuerpo.push(`lm${k} xm${k}a xm${k}b ${f(l)}`)
        cuerpo.push(`v${k}s xm${k}b xm${k}c dc 0`)
        // Fuerza contraelectromotriz ke w y par ke i sobre una inercia j con fricción viscosa bm (w es el voltaje de w${k}).
        cuerpo.push(`be${k} xm${k}c ${b} v=${f(ke)}*v(w${k})`)
        cuerpo.push(`bt${k} 0 w${k} i=${f(ke)}*i(v${k}s)`)
        cuerpo.push(`cj${k} w${k} 0 ${f(j)}`)
        cuerpo.push(`rb${k} w${k} 0 ${f(1 / bm)}`)
        sondaDeElemento.set(k, `i(v${k}s)`)
        nombreDeElemento(`v${k}s`)
        break
      }
      case 'FUSE': {
        const [a, b] = [nodo(e, 'a'), nodo(e, 'b')]
        if (e.sin_carga === true) {
          // No estampa nada en el motor: 1 PΩ lo deja en el circuito sin tocarlo.
          cuerpo.push(`rf${k} ${a} ${b} 1e15`)
          break
        }
        const [ohms, ifusion, tau] = [positivo(e, 'ohms'), positivo(e, 'ifusion'), positivo(e, 'tau')]
        const emf = e.v === undefined ? 0 : num(e, 'v')
        if (ohms * ifusion > 1e8) {
          // Como el motor: una resistencia así de grande no se funde nunca.
          cuerpo.push(`v${k}s ${a} xf${k}a dc ${f(emf)}`)
          cuerpo.push(`rf${k} xf${k}a ${b} ${f(ohms)}`)
        } else {
          const i2 = ifusion * ifusion
          // El calentamiento s (A²) sigue a i² con la constante tau (RS = 1, CS = tau) y el interruptor se abre (ron = 1 GΩ) al llegar a ifusion².
          cuerpo.push(`v${k}s ${a} xf${k}a dc ${f(emf)}`)
          cuerpo.push(`rf${k} xf${k}a xf${k}b ${f(ohms)}`)
          cuerpo.push(`s${k} xf${k}b ${b} s${k} 0 ${modelo('sf', (n) => `.model ${n} sw(vt=${f(0.375 * i2)} vh=${f(0.625 * i2)} ron=1e9 roff=1u)`)}`)
          cuerpo.push(`bs${k} 0 s${k} i=i(v${k}s)*i(v${k}s)`)
          cuerpo.push(`rs${k} s${k} 0 1`)
          cuerpo.push(`cs${k} s${k} 0 ${f(tau)}`)
        }
        sondaDeElemento.set(k, `i(v${k}s)`)
        nombreDeElemento(`v${k}s`)
        break
      }
      case 'PSU': {
        const [a, b] = [nodo(e, 'a'), nodo(e, 'b')]
        if (e.encendida === false) {
          cuerpo.push(`rp${k} ${a} ${b} 1e9`)
          break
        }
        const [v, ilim, vk] = [num(e, 'v'), positivo(e, 'ilim'), positivo(e, 'vk')]
        // i = ilim tanh((v - V(a, b))/vk) entregada por a.
        cuerpo.push(`bp${k} ${b} ${a} i=${f(ilim)}*tanh((${fp(v)}-(${vn(a)}-${vn(b)}))/${f(vk)})`)
        break
      }
      case 'XFMR': {
        const [a1, b1, a2, b2] = [nodo(e, 'a1'), nodo(e, 'b1'), nodo(e, 'a2'), nodo(e, 'b2')]
        const kk = num(e, 'k')
        if (!(kk >= 0 && kk < 1)) falla('su coeficiente de acoplamiento debe estar entre 0 y 1.')
        cuerpo.push(`l${k}a ${a1} ${b1} ${f(positivo(e, 'l1'))}`)
        cuerpo.push(`l${k}b ${a2} ${b2} ${f(positivo(e, 'l2'))}`)
        cuerpo.push(`k${k} l${k}a l${k}b ${f(kk)}`)
        break
      }
      case 'RELAY': {
        const [a1, a2, com, na, nc] = [nodo(e, 'a1'), nodo(e, 'a2'), nodo(e, 'com'), nodo(e, 'na'), nodo(e, 'nc')]
        const [r, l, ion, ioff] = [positivo(e, 'r'), positivo(e, 'l'), positivo(e, 'ion'), num(e, 'ioff')]
        if (!(ioff >= 0 && ioff < ion)) falla('su corriente de liberación debe estar entre 0 y la de operación.')
        const it = f((ion + ioff) / 2)
        const ih = f((ion - ioff) / 2)
        cuerpo.push(`v${k}s ${a1} xr${k}a dc 0`)
        cuerpo.push(`rk${k} xr${k}a xr${k}b ${f(r)}`)
        cuerpo.push(`lk${k} xr${k}b ${a2} ${f(l)}`)
        cuerpo.push(`w${k}a ${com} ${na} v${k}s ${modelo('wa', (n) => `.model ${n} csw(it=${it} ih=${ih} ron=1m roff=1e9)`)}`)
        cuerpo.push(`w${k}b ${com} ${nc} v${k}s ${modelo('wb', (n) => `.model ${n} csw(it=${it} ih=${ih} ron=1e9 roff=1m)`)}`)
        // Con la integración trapezoidal ngspice oscila al soltarse la bobina; Gear sigue la curva física.
        opcionesSolver.add('method=gear')
        sondaDeElemento.set(k, `i(v${k}s)`)
        nombreDeElemento(`v${k}s`)
        break
      }
      case 'BUZZER': {
        const [a, b] = [nodo(e, 'a'), nodo(e, 'b')]
        cuerpo.push(`r${k} ${a} ${b} ${f(positivo(e, 'ohms'))}`)
        sondaDeElemento.set(k, `@r${k}[i]`)
        nombreDeElemento(`r${k}`)
        break
      }
      case 'GATE': {
        const fn = e.fn
        const entradas = Array.isArray(e.inputs) ? e.inputs : falla('sus entradas no son una lista.')
        if (entradas.length < 1 || entradas.length > 64) falla('debe tener de 1 a 64 entradas.')
        const ins = (entradas as unknown[]).map((v) => redDe(v, 'inputs'))
        const salida = red(e, 'output')
        const ds = ['not', 'buf', 'and', 'or', 'nand', 'nor', 'xor', 'xnor']
        if (typeof fn !== 'string' || !ds.includes(fn)) falla('su función lógica no se puede exportar.')
        // Con habilitación, la función va a una red propia con 1 ps y un d_tristate la lleva a la salida con el retardo de la compuerta.
        const tri = e.enable !== undefined
        const sal = tri && fn !== 'buf' ? redAuxiliar() : salida
        const codigo = fn === 'not' ? 'd_inverter' : fn === 'buf' ? 'd_buffer' : `d_${fn as string}`
        const [rd, fd] = tri ? [R_UNO_PS, R_UNO_PS] : [retardo(e, 'rise_delay'), retardo(e, 'fall_delay')]
        const m = modelo('gt', (n) => `.model ${n} ${codigo}(rise_delay=${f(rd)} fall_delay=${f(fd)} inertial_delay=true)`)
        if (fn === 'not' || fn === 'buf') {
          if (ins.length !== 1) falla('una compuerta NOT o búfer lleva una entrada.')
          if (!(tri && fn === 'buf')) cuerpo.push(`a${k} ${ins[0]} ${sal} ${m}`)
        } else if (fn === 'xor' || fn === 'xnor') {
          if (ins.length < 2) falla('una compuerta XOR o XNOR lleva al menos dos entradas.')
          // d_xor y d_xnor tienen dos entradas: con más, una cadena de XOR de 1 ps y la última etapa con los retardos de la compuerta.
          const cadena = modelo('xr', (n) => `.model ${n} d_xor(rise_delay=1e-12 fall_delay=1e-12)`)
          let parcial = ins[0]
          ins.slice(1, -1).forEach((entrada, j) => {
            const siguiente = redAuxiliar()
            cuerpo.push(`a${k}x${j} [${parcial} ${entrada}] ${siguiente} ${cadena}`)
            parcial = siguiente
          })
          cuerpo.push(`a${k} [${parcial} ${ins[ins.length - 1]}] ${sal} ${m}`)
        } else {
          // XSPICE pide al menos dos entradas: una sola se repite, que lógicamente es lo mismo.
          cuerpo.push(`a${k} [${(ins.length === 1 ? [ins[0], ins[0]] : ins).join(' ')}] ${sal} ${m}`)
        }
        ;(entradas as unknown[]).forEach((v) => lee(v, e.z_como))
        if (tri) {
          const hab = redDe(e.enable, 'enable')
          // d_tristate habilita en alto: una habilitación activa en bajo pasa por un inversor de 1 ps.
          let en = hab
          if (e.enable_bajo === true) {
            en = redAuxiliar()
            cuerpo.push(`a${k}e ${hab} ${en} ${modelo('iv', (n) => `.model ${n} d_inverter(rise_delay=1e-12 fall_delay=1e-12)`)}`)
          }
          // Un solo retardo para dato y habilitación: el medio de los dos de la compuerta (iguales en 74HC y CD4000B).
          const retardoTres = (retardo(e, 'rise_delay') + retardo(e, 'fall_delay')) / 2
          const ts = modelo('ts', (n) => `.model ${n} d_tristate(delay=${f(retardoTres)})`)
          cuerpo.push(`a${k}t ${fn === 'buf' ? ins[0] : sal} ${en} ${salida} ${ts}`)
          lee(e.enable, e.z_como)
        }
        maneja(e.output)
        break
      }

      case 'LOGIC': {
        const o = red(e, 'out')
        const valor = e.value
        if (valor !== 0 && valor !== 1) falla('su valor lógico debe ser 0 o 1.')
        const m = modelo('lg', (n) => `.model ${n} ${valor === 1 ? 'd_pullup' : 'd_pulldown'}(load=1e-12)`)
        cuerpo.push(`a${k} ${o} ${m}`)
        maneja(e.out)
        break
      }
      case 'DFF': {
        const [d, clk, pre, clr, q, qn] = ['d', 'clk', 'pre', 'clr', 'q', 'qn'].map((c) => red(e, c))
        const [rd, fd] = [retardo(e, 'rise_delay'), retardo(e, 'fall_delay')]
        const inv = modelo('iv', (n) => `.model ${n} d_inverter(rise_delay=1e-12 fall_delay=1e-12)`)
        // PRE y CLR del 74HC74 son activos en bajo y los de XSPICE en alto: dos inversores de 1 ps.
        const [set, rst] = [redAuxiliar(), redAuxiliar()]
        cuerpo.push(`a${k}p ${pre} ${set} ${inv}`)
        cuerpo.push(`a${k}c ${clr} ${rst} ${inv}`)
        const m = modelo('ff', (n) => `.model ${n} d_dff(clk_delay=1e-12 set_delay=1e-12 reset_delay=1e-12 rise_delay=${f(Math.max(0, rd - R_UNO_PS))} fall_delay=${f(Math.max(0, fd - R_UNO_PS))} ic=0)`)
        cuerpo.push(`a${k} ${d} ${clk} ${set} ${rst} ${q} ${qn} ${m}`)
        for (const c of ['d', 'clk', 'pre', 'clr']) lee(e[c], e.z_como)
        maneja(e.q, e.qn)
        break
      }
      case 'JKFF': {
        const [j, kk, clk, pre, clr, q, qn] = ['j', 'k', 'clk', 'pre', 'clr', 'q', 'qn'].map((c) => red(e, c))
        const [rd, fd] = [retardo(e, 'rise_delay'), retardo(e, 'fall_delay')]
        const inv = modelo('iv', (n) => `.model ${n} d_inverter(rise_delay=1e-12 fall_delay=1e-12)`)
        // El 74HC112 dispara en el flanco de bajada y XSPICE en el de subida: el reloj entra negado, con 1 ps.
        const [set, rst, nclk] = [redAuxiliar(), redAuxiliar(), redAuxiliar()]
        cuerpo.push(`a${k}p ${pre} ${set} ${inv}`)
        cuerpo.push(`a${k}c ${clr} ${rst} ${inv}`)
        cuerpo.push(`a${k}k ${clk} ${nclk} ${inv}`)
        const m = modelo('jk', (n) => `.model ${n} d_jkff(clk_delay=1e-12 set_delay=1e-12 reset_delay=1e-12 rise_delay=${f(Math.max(0, rd - R_UNO_PS))} fall_delay=${f(Math.max(0, fd - R_UNO_PS))} ic=0)`)
        cuerpo.push(`a${k} ${j} ${kk} ${nclk} ${set} ${rst} ${q} ${qn} ${m}`)
        for (const c of ['j', 'k', 'clk', 'pre', 'clr']) lee(e[c], e.z_como)
        maneja(e.q, e.qn)
        break
      }
      case 'COUNTER': {
        const clk = red(e, 'clk')
        const rst = red(e, 'rst')
        const co = red(e, 'co')
        const qs = Array.isArray(e.q) && e.q.length === 4 ? (e.q as unknown[]).map((v) => redDe(v, 'q')) : falla('debe tener cuatro salidas.')
        const modulo = e.modulo
        if (modulo !== 10 && modulo !== 16) falla('su módulo debe ser 10 o 16.')
        const [rd, fd] = [retardo(e, 'rise_delay'), retardo(e, 'fall_delay')]
        const archivo = `contador${k}.in`
        archivos[archivo] = estadosContador(modulo as number)
        const cero = redAuxiliar()
        cuerpo.push(`a${k}z ${cero} ${modelo('lg', (n) => `.model ${n} d_pulldown(load=1e-12)`)}`)
        const m = modelo('ct', (n) => `.model ${n} d_state(clk_delay=${f(rd)} reset_delay=${f(Math.max(rd, fd))} state_file="${archivo}" reset_state=0)`)
        // Salidas en el orden del archivo de estados: q3 q2 q1 q0 co.
        cuerpo.push(`a${k} [${cero}] ${clk} ${rst} [${[qs[3], qs[2], qs[1], qs[0], co].join(' ')}] ${m}`)
        lee(e.clk, e.z_como)
        lee(e.rst, e.z_como)
        maneja(...(e.q as unknown[]), e.co)
        break
      }
      case 'DECODER': {
        const ent = Array.isArray(e.inputs) && e.inputs.length === 4 ? (e.inputs as unknown[]).map((v) => redDe(v, 'inputs')) : falla('debe tener cuatro entradas.')
        const sal = Array.isArray(e.outputs) && e.outputs.length === 7 ? (e.outputs as unknown[]).map((v) => redDe(v, 'outputs')) : falla('debe tener siete salidas.')
        const [rd, fd] = [retardo(e, 'rise_delay'), retardo(e, 'fall_delay')]
        const siete = (v: number): string => Array(7).fill(f(v)).join(' ')
        const tabla7 = tablaDecodificador(e.activo_alto === true)
        const m = modelo('dc', (n) => `.model ${n} d_genlut(rise_delay=[${siete(rd)}] fall_delay=[${siete(fd)}] input_delay=[1e-12 1e-12 1e-12 1e-12] table_values "${tabla7}")`)
        cuerpo.push(`a${k} [${ent.join(' ')}] [${sal.join(' ')}] ${m}`)
        ;(e.inputs as unknown[]).forEach((v) => lee(v, e.z_como))
        maneja(...(e.outputs as unknown[]))
        break
      }
      case 'LATCH555': {
        const [bajo, sobre, resok, q] = ['trig', 'thr', 'res', 'q'].map((c) => red(e, c))
        const retraso = Math.max(R_UNO_PS, positivo(e, 'delay'))
        const inv = modelo('iv', (n) => `.model ${n} d_inverter(rise_delay=1e-12 fall_delay=1e-12)`)
        const y = modelo('an', (n) => `.model ${n} d_and(rise_delay=1e-12 fall_delay=1e-12)`)
        const o = modelo('or', (n) => `.model ${n} d_or(rise_delay=1e-12 fall_delay=1e-12)`)
        const yq = modelo('aq', (n) => `.model ${n} d_and(rise_delay=${f(retraso)} fall_delay=${f(retraso)} inertial_delay=true)`)
        // q = resok y (bajo o (q y no sobre)): el reinicio manda y el disparo gana al umbral.
        const [nsobre, n1, n2] = [redAuxiliar(), redAuxiliar(), redAuxiliar()]
        cuerpo.push(`a${k}a ${sobre} ${nsobre} ${inv}`)
        cuerpo.push(`a${k}b [${q} ${nsobre}] ${n1} ${y}`)
        cuerpo.push(`a${k}c [${bajo} ${n1}] ${n2} ${o}`)
        cuerpo.push(`a${k}d [${n2} ${resok}] ${q} ${yq}`)
        maneja(e.q)
        break
      }
      case 'ADC': {
        const [p, n] = [nodo(e, 'p'), nodo(e, 'n')]
        const o = red(e, 'out')
        if (e.histeresis) {
          // Un interruptor con histéresis (SW de SPICE) cierra en el centro más vh y abre en el centro menos vh: pone 1 V en xh cuando
          // la entrada pasó el umbral de subida y 0 V cuando bajó del de bajada; un puente que corta en 0.5 V lo pasa a nivel lógico.
          const [bajo, alto] = [num(e, 'in_low'), num(e, 'in_high')]
          const [centro, medio_ancho] = [(bajo + alto) / 2, (alto - bajo) / 2].map((v) => Math.round(v * 1e9) / 1e9)
          const sw = modelo('sw', (nm) => `.model ${nm} sw(vt=${f(centro)} vh=${f(medio_ancho)} ron=1 roff=1e9)`)
          const puente = modelo('ad', (nm) => `.model ${nm} adc_bridge(in_low=0.5 in_high=0.5 rise_delay=1e-12 fall_delay=1e-12)`)
          cuerpo.push(`v${k}s xs${k} 0 dc 1`)
          cuerpo.push(`s${k} xs${k} xh${k} ${p} ${n} ${sw}`)
          cuerpo.push(`r${k}h xh${k} 0 1k`)
          cuerpo.push(`a${k} [xh${k}] [${o}] ${puente}`)
        } else {
          const m = modelo('ad', (nm) => `.model ${nm} adc_bridge(in_low=${f(num(e, 'in_low'))} in_high=${f(num(e, 'in_high'))} rise_delay=1e-12 fall_delay=1e-12)`)
          cuerpo.push(`a${k} ${n === '0' ? `[${p}]` : `[%vd ${p} ${n}]`} [${o}] ${m}`)
        }
        if (e.r_in !== undefined) {
          // Una entrada 74LS toma corriente: r_in a un voltaje interno v_in respecto de n.
          cuerpo.push(`v${k}i xa${k} ${n} dc ${f(valorDe(e, 'v_in', 0))}`)
          cuerpo.push(`r${k} ${p} xa${k} ${f(positivo(e, 'r_in'))}`)
        }
        maneja(e.out)
        break
      }
      case 'DAC': {
        const [entrada, o] = [red(e, 'input'), nodo(e, 'out')]
        const lo = nodoOpc(e, 'lo')
        const hi = nodoOpc(e, 'hi')
        const [tr, tf] = [positivo(e, 't_rise'), positivo(e, 't_fall')]
        const m = modelo('da', (n) => `.model ${n} dac_bridge(out_low=0 out_high=1 out_undef=0.5 t_rise=${f(tr)} t_fall=${f(tf)})`)
        // El control oc va de 0 a 1 en rampa (0.5 si la entrada es X); la salida es el Thévenin (1 - oc) lo + oc hi.
        cuerpo.push(`a${k} [${entrada}] [oc${k}] ${m}`)
        cuerpo.push(`roc${k} oc${k} 0 1g`)
        const [vlo, vhi] = [fp(num(e, 'v_lo')), fp(num(e, 'v_hi'))]
        const ref = (n: string | null): string => (n === null || n === '0' ? '' : `${vn(n)}+`)
        cuerpo.push(
          `bo${k} ${o} 0 i=(${vn(o)}-((${ref(lo)}${vlo})*(1-v(oc${k}))+(${ref(hi)}${vhi})*v(oc${k})))/(${f(positivo(e, 'r_lo'))}*(1-v(oc${k}))+${f(positivo(e, 'r_hi'))}*v(oc${k}))`
        )
        lee(e.input, e.z_como)
        break
      }
      case 'OUT555': {
        const q = red(e, 'q')
        const [o, dis, vcc, gnd] = [nodo(e, 'out'), nodo(e, 'dis'), nodo(e, 'vcc'), nodo(e, 'gnd')]
        const [tr, tf] = [positivo(e, 't_rise'), positivo(e, 't_fall')]
        const m = modelo('da', (n) => `.model ${n} dac_bridge(out_low=0 out_high=1 out_undef=0.5 t_rise=${f(tr)} t_fall=${f(tf)})`)
        cuerpo.push(`a${k} [${q}] [oc${k}] ${m}`)
        cuerpo.push(`roc${k} oc${k} 0 1g`)
        const [vlo, rlo, vhi, rhi, gon, goff] = ['v_lo', 'r_lo', 'v_hi', 'r_hi', 'g_on', 'g_off'].map((c) => num(e, c))
        if (!(rlo > 0 && rhi > 0)) falla('sus resistencias de salida deben ser positivas.')
        const sobre = (n: string): string => (n === '0' ? '' : `${vn(n)}+`)
        const comun = `((${sobre(gnd)}${fp(vlo)})*(1-v(oc${k}))+(${sobre(vcc)}${fp(vhi)})*v(oc${k})-${vn(o)})/(${f(rlo)}*(1-v(oc${k}))+${f(rhi)}*v(oc${k}))`
        // La corriente de salida sale de VCC en la fracción oc y de GND en el resto; la descarga va de gon a goff.
        cuerpo.push(`bov${k} ${vcc} ${o} i=v(oc${k})*${comun}`)
        cuerpo.push(`bog${k} ${gnd} ${o} i=(1-v(oc${k}))*${comun}`)
        cuerpo.push(`bd${k} ${dis} ${gnd} i=(${vn(dis)}-${vn(gnd)})*(${f(gon)}*(1-v(oc${k}))+${f(goff)}*v(oc${k}))`)
        break
      }
      case 'J': {
        const [d, g, s] = [nodo(e, 'd'), nodo(e, 'g'), nodo(e, 's')]
        const ps = parametros(e.model, PARAMETROS_JFET)
        const m = modelo('jm', (n) => `.model ${n} ${e.pjf === true ? 'pjf' : 'njf'}(${ps})`)
        cuerpo.push(`j${k} ${d} ${g} ${s} ${m}`)
        break
      }
      case 'E':
      case 'G': {
        const ns = [nodo(e, 'p'), nodo(e, 'n'), nodo(e, 'cp'), nodo(e, 'cn')]
        cuerpo.push(`${tipo === 'E' ? 'e' : 'g'}${k} ${ns.join(' ')} ${f(num(e, tipo === 'E' ? 'ganancia' : 'gm'))}`)
        break
      }
      case 'H':
      case 'F': {
        const [p, n, cp, cn] = [nodo(e, 'p'), nodo(e, 'n'), nodo(e, 'cp'), nodo(e, 'cn')]
        const letra = tipo === 'H' ? 'h' : 'f'
        // La corriente de control se mide en una fuente de 0 V propia de la pieza, como la rama interna del motor.
        const medidor = `v${letra}${k}_ctl`
        cuerpo.push(`${medidor} ${cp} ${cn} dc 0`, `${letra}${k} ${p} ${n} ${medidor} ${f(num(e, tipo === 'H' ? 'r' : 'ganancia'))}`)
        break
      }
      case 'TERM': {
        const [a, b] = [nodo(e, 'a'), nodo(e, 'b')]
        const tipoT = e.tipo
        if (tipoT !== 'ntc' && tipoT !== 'ptc') falla('su tipo debe ser ntc o ptc.')
        const rt = tablaTermistor(e.rt)
        const p = { tipo: tipoT as 'ntc' | 'ptc', r25: positivo(e, 'r25'), beta: positivo(e, 'beta'), rt, delta: positivo(e, 'delta'), tau: positivo(e, 'tau') }
        const amb = valorDeCanal(e)
        const m = modelo('tm', (n) => subcircuitoTermistor(n, p))
        cuerpo.push(`x${k} ${a} ${b} ${m} amb=${f(amb)}`)
        avisos.push(`${etiqueta()}: ngspice no lo quema al pasar su temperatura máxima.`)
        break
      }
      case 'LDR': {
        const [a, b] = [nodo(e, 'a'), nodo(e, 'b')]
        const p = { r10: positivo(e, 'r10'), gamma: positivo(e, 'gamma'), roscuro: positivo(e, 'roscuro'), tau_sube: positivo(e, 'tau_sube'), tau_baja: positivo(e, 'tau_baja') }
        const lux = valorDeCanal(e)
        const m = modelo('ld', (n) => subcircuitoLdr(n, p))
        cuerpo.push(`x${k} ${a} ${b} ${m} lux=${f(Number.isFinite(lux) && lux > 0 ? lux : 0)}`)
        break
      }
      case 'PASOS': {
        const lista = e.nodos
        const unipolar = e.unipolar === true
        if (!Array.isArray(lista) || lista.length !== (unipolar ? 6 : 4)) return falla(`necesita ${unipolar ? 6 : 4} nodos.`)
        const ns = lista.map((v, i) => nodo({ [`nodos[${i}]`]: v }, `nodos[${i}]`))
        const kMutua = valorDe(e, 'k_mutua', 0.99)
        if (!(kMutua >= 0 && kMutua < 1)) falla('«k_mutua» debe estar entre 0 y 1.')
        const reduccion = valorDe(e, 'reduccion', 1)
        if (!(reduccion > 0)) falla('«reduccion» debe ser mayor que cero.')
        const p = { unipolar, r: positivo(e, 'r'), l: positivo(e, 'l'), k_mutua: kMutua, km: num(e, 'km'), dientes: positivo(e, 'dientes'), td: num(e, 'td'), j: positivo(e, 'j'), bm: positivo(e, 'bm') }
        // La carga del canal llega al eje dividida por la reducción, como en el motor.
        const carga = e.canal_carga === undefined ? 0 : valorDeCanal(e, 'canal_carga') / reduccion
        const m = modelo('pp', (n) => subcircuitoPasos(n, p))
        cuerpo.push(`x${k} ${ns.join(' ')} ${m} tc=${f(Number.isFinite(carga) ? carga : 0)}`)
        break
      }
      case 'EXT': {
        const [a, b] = [nodo(e, 'a'), nodo(e, 'b')]
        // Un análisis no tiene perilla que se mueva: la fuente vale lo que tiene el canal en el documento.
        const valor = num(e, 'k') * valorDeCanal(e) + num(e, 'c')
        if (!Number.isFinite(valor)) falla('su valor no es finito.')
        if (e.modo === 'i') {
          cuerpo.push(`i${k} ${a} ${b} dc ${f(valor)}`)
        } else if (e.modo === 'v') {
          const r = valorDe(e, 'r', 0)
          if (!(r >= 0)) falla('«r» no puede ser negativa.')
          cuerpo.push(r > 0 ? `v${k} ${a} xe${k} dc ${f(valor)}` : `v${k} ${a} ${b} dc ${f(valor)}`)
          if (r > 0) cuerpo.push(`re${k} xe${k} ${b} ${f(r)}`)
          sondaDeElemento.set(k, `i(v${k})`)
          nombreDeElemento(`v${k}`)
        } else {
          falla('su modo debe ser v o i.')
        }
        break
      }
      case 'LUT': {
        const comunes = redesDe(e.comunes, 'comunes')
        if (!Array.isArray(e.rebanadas) || e.rebanadas.length === 0 || e.rebanadas.length > 1024) falla('debe tener al menos una rebanada.')
        const rebanadas = (e.rebanadas as Campos[]).map((r) => ({ entradas: redesDe(r.entradas, 'entradas'), salidas: redesDe(r.salidas, 'salidas') }))
        const s = sintesis(() => sintetizarLut(`u${k}`, { comunes, rebanadas, tabla: tablaDe(e.tabla), retardos: e.retardos as [number, number][], abierta: e.abierta as boolean[] | undefined }))
        modelos.push(...s.modelos)
        cuerpo.push(...s.lineas)
        for (const v of e.comunes as unknown[]) lee(v, e.z_como)
        for (const r of e.rebanadas as Campos[]) {
          for (const v of r.entradas as unknown[]) lee(v, e.z_como)
          maneja(...(r.salidas as unknown[]))
        }
        break
      }
      case 'MSI': {
        const entradas = redesDe(e.entradas, 'entradas')
        const salidas = redesDe(e.salidas, 'salidas')
        const nucleo = e.nucleo as NucleoMsi
        if (typeof nucleo !== 'object' || nucleo === null) falla('su núcleo no tiene la forma esperada.')
        const aproximaciones = nucleo.tipo === 'aproximaciones'
        const s = sintesis(() =>
          sintetizarMsi(`u${k}`, {
            entradas,
            salidas,
            nucleo,
            de: e.de as SalidaMsi[],
            fuentes: e.fuentes as FuenteMsi[] | undefined,
            tabla: e.tabla === undefined ? undefined : tablaDe(e.tabla),
            retardos: e.retardos as [number, number][],
            abierta: e.abierta as boolean[] | undefined,
            ...(aproximaciones ? { codigo: opciones.codigoMsi?.get(k) } : {})
          })
        )
        modelos.push(...s.modelos)
        cuerpo.push(...s.lineas)
        if (aproximaciones) avisos.push(`El convertidor ${etiqueta()} se exporta con el código del instante actual: ngspice no simula su conversión.`)
        for (const v of e.entradas as unknown[]) lee(v, e.z_como)
        maneja(...(e.salidas as unknown[]))
        break
      }
      case 'DACM': {
        const [o, ret, rp, rn] = [nodo(e, 'out'), nodo(e, 'ret'), nodo(e, 'ref_p'), nodo(e, 'ref_n')]
        const bits = redesDe(e.bits, 'bits')
        if (bits.length < 1 || bits.length > 16) falla('admite de 1 a 16 bits.')
        const ta = positivo(e, 't_asentamiento')
        const rOut = valorDe(e, 'r_out', 0)
        if (!(rOut >= 0)) falla('«r_out» no puede ser negativa.')
        if (e.modo !== 'voltaje' && e.modo !== 'corriente') falla('su modo debe ser voltaje o corriente.')
        if (rp === rn) falla('sus referencias no pueden estar en el mismo nodo.')
        // Cada bit pasa a un nodo de 0 a 1 V con la rampa de asentamiento: k es la suma de sus pesos, y la rampa de varios bits a la vez es la de k.
        const m = modelo('da', (n) => `.model ${n} dac_bridge(out_low=0 out_high=1 out_undef=0.5 t_rise=${f(ta)} t_fall=${f(ta)})`)
        bits.forEach((b, i) => {
          cuerpo.push(`a${k}d${i} [${b}] [kb${k}x${i}] ${m}`)
          cuerpo.push(`rk${k}x${i} kb${k}x${i} 0 1g`)
        })
        const kexpr = bits.map((_, i) => `v(kb${k}x${i})*${f(2 ** -(i + 1))}`).join('+')
        if (e.modo === 'voltaje') {
          const x = rOut > 0 ? `xz${k}` : o
          cuerpo.push(`bz${k} ${x} ${ret} v=(${kexpr})*(${vn(rp)}-${vn(rn)})`)
          if (rOut > 0) cuerpo.push(`rz${k} ${o} xz${k} ${f(rOut)}`)
        } else {
          // Una fuente de 0 V entre las referencias mide la corriente de referencia, que sale k veces por la salida.
          cuerpo.push(`vz${k} ${rp} ${rn} dc 0`)
          cuerpo.push(`bz${k} ${o} ${ret} i=(${kexpr})*i(vz${k})`)
          if (rOut > 0) cuerpo.push(`rz${k} ${o} ${ret} ${f(rOut)}`)
        }
        for (const b of e.bits as unknown[]) lee(b, 'x')
        break
      }
      case 'INTC': {
        const [a, b] = [nodo(e, 'a'), nodo(e, 'b')]
        const [ron, roff] = [positivo(e, 'r_on'), positivo(e, 'r_off')]
        // Un análisis no pulsa teclas: el contacto vale lo que el canal tiene en el documento.
        cuerpo.push(`rm${k} ${a} ${b} ${f(valorDeCanal(e) > 0.5 ? ron : roff)}`)
        sondaDeElemento.set(k, `@rm${k}[i]`)
        nombreDeElemento(`rm${k}`)
        break
      }
      default:
        falla(`el tipo «${String(tipo).slice(0, 12)}» no se puede exportar.`)
    }
  }
  k = netlist.elements.length

  // Entradas digitales que nadie maneja: una entrada al aire lee 1 en 74LS (z_como = uno) y X en CMOS, que es lo que hace XSPICE.
  for (const [r, z] of leidas) {
    if (manejadas.has(r) || z !== 'uno' || r < 0 || r >= redes) continue
    const m = modelo('lg', (n) => `.model ${n} d_pullup(load=1e-12)`)
    tabla.digitales.set(nombreDeRed(r), r)
    cuerpo.push(`apu${r} ${nombreDeRed(r)} ${m}`)
  }

  // Sondas de los instrumentos: nodos con nombre.
  const sondas: SondaExportada[] = []
  for (const [i, s] of (netlist.sondas ?? []).entries()) {
    const o = s as unknown as Campos
    const nombre = `sonda${i}`
    k = 0
    let expresion: string | null = null
    const guardar: string[] = []
    if (o.kind === 'v') {
      const [p, n] = [o.p, o.n]
      if (typeof p !== 'number' || !Number.isInteger(p) || p < 0 || p >= nodos || typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n >= nodos) {
        throw new ErrorExportacion(`La sonda ${i + 1} apunta a un nodo que no existe.`)
      }
      registrarNodo(p)
      registrarNodo(n)
      expresion = n === 0 ? vn(nombreDeNodo(p)) : `(${vn(nombreDeNodo(p))}-${vn(nombreDeNodo(n))})`
      if (p === 0 && n !== 0) expresion = `(0-${vn(nombreDeNodo(n))})`
      if (p === 0 && n === 0) expresion = '0'
    } else if (o.kind === 'i') {
      const el = o.element
      const signo = o.signo
      if (typeof el !== 'number' || !Number.isInteger(el) || el < 0 || el >= netlist.elements.length || (signo !== 1 && signo !== -1)) {
        throw new ErrorExportacion(`La sonda ${i + 1} apunta a un elemento que no existe.`)
      }
      const vector = sondaDeElemento.get(el)
      if (vector) {
        expresion = signo === 1 ? vector : `(0-${vector})`
        if (vector.startsWith('@')) guardar.push(vector)
      } else {
        avisos.push(`La sonda de corriente ${i + 1} no se puede medir en ese elemento con ngspice.`)
      }
    } else if (o.kind === 'd') {
      avisos.push(`La sonda digital ${i + 1} no se exporta todavía.`)
    } else {
      throw new ErrorExportacion(`La sonda ${i + 1} no tiene la forma esperada.`)
    }
    sondas.push({ indice: i, nombre, expresion, guardar })
  }

  const opcionesFinal = new Set(opcionesSolver)
  if (netlist.elements.some((el) => ['GATE', 'DFF', 'JKFF', 'COUNTER', 'DECODER', 'LATCH555', 'ADC', 'DAC', 'OUT555', 'LOGIC', 'LUT', 'MSI', 'DACM'].includes((el as unknown as Campos).type as string))) opcionesFinal.add('xtrtol=7')

  const partes = [...(usaAmpop ? [...SUBCKT_AMPOP] : []), ...modelos, ...cuerpo]
  return { cuerpo: partes.join('\n') + '\n', archivos, opciones: [...opcionesFinal], sondas, corrienteDeElemento: sondaDeElemento, avisos, tabla }
}
