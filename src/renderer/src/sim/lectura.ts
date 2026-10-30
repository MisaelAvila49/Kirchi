import type { Id } from '../doc/tipos'
import { enumerar, type ModeloDigital } from '../netlist/digital'
import { formatearMedida } from '../valores/valores'
import { DIVISIONES_H } from '../instrumentos/ajustes'
import type { RelojAdc } from '../netlist/convertidores'
import { ELEMENTOS_DIGITALES, type ElementoMotor, type NetlistMotor, type Onda, type ResultadoNetlist } from '../netlist/netlist'
import type { SimReading } from './protocol'
import type { Tramo } from '../conexiones/corrientes'
import type { Aviso } from './avisos'

/** Nivel lógico como lo muestra la interfaz; el motor da 0, 1, 2 (X) y 3 (Z). */
export type NivelLogico = '0' | '1' | 'X' | 'Z'
const NIVELES: readonly NivelLogico[] = ['0', '1', 'X', 'Z']
export const nivelDe = (codigo: number | undefined): NivelLogico => NIVELES[codigo ?? 2] ?? 'X'

/** Qué fijó el estado de un biestable por última vez (el orden de `Causa` en `engine/src/digital/modelos.rs`). */
export type CausaBiestable = 'arranque' | 'flanco' | 'pone' | 'borra' | 'conmuta' | 'pre' | 'clr' | 'ambos' | 'indefinida'
const CAUSAS: readonly CausaBiestable[] = ['arranque', 'flanco', 'pone', 'borra', 'conmuta', 'pre', 'clr', 'ambos', 'indefinida']

/** Corriente de un segmento del display sobre la cual se cuenta encendido: la del LED que se ve encendido en el lienzo (2
 * % de `CORRIENTE_BRILLO_PLENO`, que da `BRILLO_MINIMO` con la raíz de `lienzo/luces.ts`). */
export const CORRIENTE_SEGMENTO_ENCENDIDO = 4e-4

/** Una red con nivel lógico: una red digital pura, o una analógica que maneja una salida digital o la del 555. */
export interface LecturaDigital {
  nivel: NivelLogico
  /** Voltaje nominal de una red digital pura (0 V, o la alimentación de quien la maneja si está en 1); null si es analógica, X o Z. */
  nominal: number | null
  /** Frecuencia (Hz) y ciclo de trabajo (0 a 1) del último periodo completo; 0 si no conmuta. */
  f: number
  ciclo: number
  /** La alimentación de quien la maneja (una pieza digital); null si la maneja el 555 o nadie. El lienzo alterna con ella. */
  vcc: number | null
  /** Cuántas veces cambió desde que arrancó la vista previa. */
  cambios: number
  /** Cambia más rápido de lo que la pantalla muestra cada nivel. */
  conmuta: boolean
}

/** Frecuencia en pantalla (la de la red por la fracción del tiempo real alcanzada) desde la que una red «conmuta»: con
 * lecturas a 10 Hz un nivel menor a 100 ms no se alcanza a ver. Depende solo de la lectura del motor y no de cuántas
 * veces se lea (contar cambios entre lecturas hacía parpadear entre patrón y nivel). */
export const F_CONMUTA = 5

/** Nombre de la región de cada tipo de transistor según el código del motor (`engine/src/devices/region.rs`): 0 no conduce, 1
 * amplifica, 2 conduce como interruptor y 3 al revés. Todo lo que muestra una región lee de aquí. */
export const REGIONES = {
  bjt: ['corte', 'activa', 'saturación', 'activa inversa'],
  igbt: ['corte', 'activa', 'saturación', 'activa inversa'],
  mosfet: ['corte', 'saturación', 'lineal'],
  jfet: ['corte', 'saturación', 'lineal']
} as const
export type TipoConRegion = keyof typeof REGIONES
/** El nombre de la región de `tipo` para el código `estado` del motor; un código desconocido es «corte». */
export const nombreDeRegion = <T extends TipoConRegion>(tipo: T, estado: number): (typeof REGIONES)[T][number] => (REGIONES[tipo] as readonly string[])[estado] as (typeof REGIONES)[T][number] ?? 'corte'
/** Corriente (A) por debajo de la cual un zener se cuenta sin conducir. */
export const CORRIENTE_MINIMA_ZENER = 1e-6

/** Lo propio de cada modelo, además de voltaje, corriente y potencia. */
export type ExtraMedicion =
  /** `v` es Vce e `i` es Ic; aquí, Vbe e Ib. */
  | { tipo: 'bjt'; region: (typeof REGIONES.bjt)[number]; vbe: number; ib: number }
  /** `v` es Vds e `i` es Id; aquí, Vgs. */
  | { tipo: 'mosfet'; region: (typeof REGIONES.mosfet)[number]; vgs: number }
  /** `v` es Vds e `i` es Id; aquí, Vgs. */
  | { tipo: 'jfet'; region: (typeof REGIONES.jfet)[number]; vgs: number }
  /** `v` es la salida respecto de tierra; 1 si está detenida contra V+, -1 contra V-. */
  | { tipo: 'ampop'; saturado: -1 | 0 | 1 }
  | { tipo: 'zener'; estado: 'directa' | 'ruptura' | 'corte' }
  /** `calentamiento`: la fracción del que lo funde (la `aux` del motor). */
  | { tipo: 'fusible'; fundido: boolean; calentamiento?: number }
  /** Una pieza compuesta: la corriente y el voltaje de cada elemento de su lista `modelo.elementos` (0 si no se armó), para sus límites. */
  | { tipo: 'compuesto'; corrientes: number[]; voltajes: number[]; region?: string }
  /** `fundido`: el filamento pasó de su temperatura máxima y quedó abierto; `calentamiento`, el θ del motor (1 es el nominal). */
  | { tipo: 'foco'; fundido: boolean; calentamiento?: number }
  /** `angulo` (rad, del eje de salida) y `pasos` (pasos completos) solo los da un motor a pasos; su `i` y su `v` son los de la fase A. */
  | { tipo: 'motor'; rpm: number; angulo?: number; pasos?: number }
  /** `temperatura`: la del termistor con su calentamiento propio (°C, la `aux` del motor). */
  | { tipo: 'termistor'; temperatura: number }
  /** `r`: la resistencia que tiene la fotorresistencia ahora (Ω, la `aux` del motor). */
  | { tipo: 'ldr'; r: number }
  /** `v` e `i` son los de la bobina; `operado`, el común con el normalmente abierto. */
  | { tipo: 'rele'; operado: boolean }
  | { tipo: 'zumbador'; suena: boolean }
  /** Pieza digital: nivel de cada pin en el orden del modelo, con su voltaje si la red es analógica. Los biestables dan
   * además Q y qué la fijó; el contador, su cuenta (null sin definir); el decodificador, el dígito que manda (-1 apagado,
   * null sin definir). */
  | { tipo: 'digital'; modelo: ModeloDigital['tipo']; pines: { id: string; nombre?: string; nivel: NivelLogico; salida: boolean; v?: number }[]; q?: NivelLogico; causa?: CausaBiestable; cuenta?: number | null; digito?: number | null; registro?: RegistroMsi }
  /** El ADC0804: el código de la última conversión (null con bits sin definir), si hay una en curso, INTR, el fondo de escala
   * (2 · V de VREF/2; null si no se leyó) y el reloj. */
  | { tipo: 'convertidor-ad'; codigo: number | null; bits: number; convirtiendo: boolean; intr: NivelLogico; vref: number | null; reloj: RelojAdc | null }
  /** El DAC0808: el código vigente en sus entradas y la corriente que entra por IO. */
  | { tipo: 'convertidor-da'; codigo: number; io: number }
  /** El 555: el nivel de su salida, la frecuencia y el ciclo de trabajo de su biestable (0 si no oscila) y los voltajes de THR y TRIG. */
  | { tipo: '555'; salida: NivelLogico; f: number; ciclo: number; thr: number; trig: number; alimentacion: number; vmin: number; vmax: number; modelo: string }
  /** El display: la corriente de cada segmento (a a g y el punto; null si está suelto) y lo que muestra en palabras. */
  | { tipo: 'display'; corrientes: (number | null)[]; muestra: string }
  /** Un LED con corriente nominal (A): `excedida` si la corriente directa pasa de ella. */
  | { tipo: 'led'; inom: number; excedida: boolean }
  /** La fuente variable: `v` e `i` son lo que entrega por sus terminales; su modo. */
  | { tipo: 'fuente-variable'; modo: 'CV' | 'CC' | 'apagada' }

/** El registro que un `MSI` muestra: la cuenta, el registro de desplazamiento o el almacenamiento, como número (null con algún bit sin definir). `nombres` lleva el
 * de cada bit (el primero es el menos significativo) y `reloj` la frecuencia de su reloj principal con el nombre del pin. */
export interface RegistroMsi {
  clase: 'cuenta' | 'registro' | 'almacén'
  valor: number | null
  bits: number
  nombres: string[]
  reloj?: { hz: number; pin: string }
}

/** Voltaje entre los terminales `a` y `b` del modelo, corriente de `a` hacia `b` y potencia que absorbe (negativa si entrega). */
export interface MedicionPieza {
  v: number
  i: number
  p: number
  /** Solo en un potenciómetro: voltaje del cursor respecto de tierra. Entonces `v` es el voltaje entre extremos (pin 1
   * menos pin 2), `i` la corriente del tramo pin 1 a cursor y `p` la potencia de los dos tramos. */
  cursor?: number
  extra?: ExtraMedicion
}

export interface Lectura {
  /** Tiempo simulado en segundos. */
  t: number
  /** Fracción del tiempo real alcanzada (1 = al ritmo del reloj). */
  ratio: number
  /** Segundos simulados por segundo de reloj que lleva el worker (con «Sin límite de tiempo real», lo que alcanza). */
  rapidez?: number
  /** Voltaje respecto de tierra de cada red que entra a la simulación (id de red → V). */
  redes: Map<number, number>
  /** Medición de cada pieza simulada (la tierra no está). */
  piezas: Map<Id, MedicionPieza>
  /** Nivel de cada red con lógica (id de red → lectura); ausente en las lecturas armadas a mano sin lógica. */
  digitales?: Map<number, LecturaDigital>
  /** Lo que se escribe en cifras: promedio del último intervalo de 100 ms con histéresis de la última cifra
   * (`ControlSimulacion.leer`). Colores de cables, brillo de LED y avisos usan `redes` y `piezas`. */
  estable?: { redes: Map<number, number>; piezas: Map<Id, MedicionPieza> }
  /** Con la corriente animada: corriente media de cada tramo de cable (punto 0 a punto 1) y la de su valor absoluto en el
   * último intervalo, y las redes sin flechas. */
  corrientes?: { tramos: readonly Tramo[]; media: Float64Array; absoluta: Float64Array; sinFlechas: ReadonlyMap<number, 'lazos'> }
  /** Los avisos de sobrecorriente a la vista y las piezas quemadas. */
  avisos?: ReadonlyMap<Id, Aviso>
  quemadas?: ReadonlySet<Id>
}

/** La lectura con lo estable en lugar del último paso, para lo que se escribe en cifras (chips, Mediciones, Multímetro). */
export function paraTexto(l: Lectura): Lectura {
  return l.estable ? { ...l, redes: l.estable.redes, piezas: l.estable.piezas } : l
}

/** Segmentos encendidos (en orden a a g) de cada dígito: los del decodificador y las variantes con cola del 6, el 7 y el 9. */
const DIGITOS: Record<string, string> = { abcdef: '0', bc: '1', abdeg: '2', abcdg: '3', bcfg: '4', acdfg: '5', cdefg: '6', acdefg: '6', abc: '7', abcf: '7', abcdefg: '8', abcfg: '9', abcdfg: '9' }

/** Lo que muestra un display con estas corrientes por segmento (a a g y el punto): «muestra 7», «apagado» o los segmentos. */
export function textoDelDisplay(corrientes: readonly (number | null)[]): string {
  const prendido = (k: number) => (corrientes[k] ?? 0) >= CORRIENTE_SEGMENTO_ENCENDIDO
  const segmentos = [...'abcdefg'].filter((_, k) => prendido(k))
  const punto = prendido(7)
  if (segmentos.length === 0) return punto ? 'solo el punto' : 'apagado'
  const digito = DIGITOS[segmentos.join('')]
  const base = digito !== undefined ? `muestra ${digito}` : `${enumerar(segmentos)} ${segmentos.length === 1 ? 'encendido' : 'encendidos'}`
  return punto ? `${base} con punto` : base
}

/** Nivel de una red en palabras: «1 · 5.00 V nominal» en una red digital pura, «X» o «Z», o «conmuta, 1.00 kHz» si cambia
 * más rápido de lo que muestra la pantalla. Lo usan el Multímetro, Mediciones y los chips. */
export function textoNivelRed(d: LecturaDigital): string {
  if (d.conmuta && d.f > 0) return `conmuta, ${formatearMedida(d.f, 'Hz')}`
  return d.nominal === null ? d.nivel : `${d.nivel} · ${formatearMedida(d.nominal, 'V')} nominal`
}

/** La alimentación de quien maneja cada red digital (la salida de una pieza digital), para el voltaje nominal. */
const alimentaciones = new WeakMap<ResultadoNetlist, Map<number, number>>()
function alimentacionDeRedes(r: ResultadoNetlist): Map<number, number> {
  let m = alimentaciones.get(r)
  if (!m) {
    m = new Map()
    for (const p of r.digitales.values()) for (const pin of p.pines) if (pin.salida) m.set(pin.red, p.alimentacion)
    alimentaciones.set(r, m)
  }
  return m
}

/** Las redes con nivel lógico: las digitales puras y las analógicas que maneja una salida. */
function lecturasDigitales(r: ResultadoNetlist, s: SimReading): Map<number, LecturaDigital> {
  const vcc = alimentacionDeRedes(r)
  const m = new Map<number, LecturaDigital>()
  const poner = (red: number, d: number, pura: boolean) => {
    const nivel = nivelDe(s.niveles[d])
    const cambios = s.medidas[3 * d + 2] ?? 0
    const nominal = !pura ? null : nivel === '0' ? 0 : nivel === '1' ? (vcc.get(d) ?? null) : null
    const f = s.medidas[3 * d] ?? 0
    m.set(red, { nivel, nominal, f, ciclo: s.medidas[3 * d + 1] ?? 0, vcc: vcc.get(d) ?? null, cambios, conmuta: f * s.ratio >= F_CONMUTA })
  }
  for (const [red, d] of r.redDigital) poner(red, d, true)
  for (const [red, d] of r.manejoDeRed) if (!m.has(red)) poner(red, d, false)
  return m
}

/** Voltaje, corriente y potencia del elemento `k` con voltajes de nodo `v`: entre extremos en los de dos terminales; Vce e
 * Ic en un transistor (la potencia suma la de la base, con su corriente en `aux`); Vds e Id en un MOSFET; en un
 * amplificador, salida contra tierra y su corriente (potencia: reposo más caída a la alimentación); bobina en un relé. */
export function medicionDeElemento(e: ElementoMotor, v: (nodo: number) => number, i: number, aux: number): { v: number; i: number; p: number } {
  switch (e.type) {
    case 'Q': {
      const vce = v(e.c) - v(e.e), vbe = v(e.b) - v(e.e)
      return { v: vce, i, p: vce * i + vbe * aux }
    }
    case 'M': {
      const vds = v(e.d) - v(e.s)
      return { v: vds, i, p: vds * i }
    }
    case 'J': {
      const vds = v(e.d) - v(e.s)
      return { v: vds, i, p: vds * i }
    }
    case 'E':
    case 'G':
    case 'H':
    case 'F': {
      // La salida de una fuente controlada: voltaje entre sus bornes y la corriente que la atraviesa (el control no disipa).
      const dv = v(e.p) - v(e.n)
      return { v: dv, i, p: dv * i }
    }
    case 'PASOS': {
      // El primer devanado (fase A); la corriente del motor que reporta el motor es la de esa fase.
      const dv = v(e.nodos[0]) - v(e.nodos[1])
      return { v: dv, i, p: dv * i }
    }
    case 'OA': {
      const [vo, vp, vn] = [v(e.out), v(e.vp), v(e.vn)]
      return { v: vo, i, p: (vp - vn) ** 2 / (e.model.rq ?? RQ_OMISION) + (i > 0 ? (vp - vo) * i : (vo - vn) * -i) }
    }
    case 'RELAY': {
      const vb = v(e.a1) - v(e.a2)
      return { v: vb, i, p: vb * i }
    }
    default: {
      // Los elementos digitales y los puentes no tienen un voltaje de pieza propio (sus lecturas son las del motor).
      if (!('a' in e) || !('b' in e)) return { v: 0, i, p: 0 }
      const dv = v(e.a) - v(e.b)
      return { v: dv, i, p: dv * i }
    }
  }
}

/** Traduce una lectura del motor (por nodo y por elemento) a redes y piezas del documento. */
export function leerResultados(r: ResultadoNetlist, s: SimReading): Lectura {
  const v = (nodo: number) => (nodo === 0 ? 0 : (s.voltages[nodo] ?? 0))
  const redes = new Map<number, number>()
  for (const [red, nodo] of r.nodoDeRed) redes.set(red, v(nodo))
  const piezas = new Map<Id, MedicionPieza>()
  r.netlist?.elements.forEach((e, k) => {
    const id = r.piezaDeElemento[k]
    if (!id || ELEMENTOS_DIGITALES.has(e.type) || r.compuestos?.has(id)) return
    const aux = s.aux[k] ?? 0
    const m: MedicionPieza = medicionDeElemento(e, v, s.currents[k] ?? 0, aux)
    const extra = extraDeElemento(e, r.tipoDeElemento[k], m, v, aux, s.estado[k] ?? 0, r.umbrales.get(id))
    if (extra) m.extra = extra
    const previa = piezas.get(id)
    // Un potenciómetro tiene dos elementos: la corriente es la del primer tramo y la potencia suma los dos.
    if (previa && r.potenciometros.has(id)) previa.p += m.p
    else piezas.set(id, m)
  })
  // Una pieza de varios elementos (reguladores, puente, ESR): el voltaje entre sus pines de medida, la corriente de su elemento principal
  // y la potencia que disipan todos sus elementos (las fuentes internas no disipan: entregan).
  for (const [id, c] of r.compuestos ?? []) {
    const nodo = (red: number) => v(r.nodoDeRed.get(red) ?? 0)
    const elementos = r.netlist?.elements ?? []
    const i = c.i >= 0 ? (s.currents[c.i] ?? 0) : 0
    let p = 0
    const voltajes: number[] = []
    for (const k of c.elementos) {
      const e = elementos[k]
      const m = e ? medicionDeElemento(e, v, s.currents[k] ?? 0, s.aux[k] ?? 0) : null
      voltajes.push(m?.v ?? 0)
      if (!e || !m || e.type === 'V' || e.type === 'I' || e.type === 'E' || e.type === 'G' || e.type === 'H' || e.type === 'F') continue
      p += m.p
    }
    const dv = nodo(c.mas) - nodo(c.menos)
    // La región del transistor que la pieza declara en `medida.region` (el PNP del IGBT), con los nombres de su tipo.
    const kr = c.region === undefined ? -1 : (c.elementos[c.region] ?? -1)
    const tipoR = kr >= 0 ? ({ Q: 'igbt', M: 'mosfet', J: 'jfet' } as const)[elementos[kr]?.type as 'Q' | 'M' | 'J'] : undefined
    const region = tipoR ? nombreDeRegion(tipoR, s.estado[kr] ?? 0) : undefined
    piezas.set(id, { v: dv, i, p: c.elementos.length === 2 && elementos[c.elementos[0]]?.type === 'V' ? dv * i : p, extra: { tipo: 'compuesto', corrientes: c.elementos.map((k) => (k >= 0 ? (s.currents[k] ?? 0) : 0)), voltajes, ...(region ? { region } : {}) } })
  }
  medirInstrumentos(r, s, piezas, v)
  for (const [id, red] of r.potenciometros) {
    const m = piezas.get(id)
    const na = r.nodoDeRed.get(red.a), nb = r.nodoDeRed.get(red.b), nc = r.nodoDeRed.get(red.c)
    if (!m || na === undefined || nb === undefined || nc === undefined) continue
    m.v = v(na) - v(nb)
    m.cursor = v(nc)
  }
  const rapidez = s.rapidez !== undefined && s.rapidez > 0 ? { rapidez: s.rapidez } : {}
  if (!r.netlist?.digital_nets) return { t: s.time, ratio: s.ratio, redes, piezas, ...rapidez }
  // Las piezas digitales, el 555 y el display tienen lecturas propias y no un voltaje de pieza.
  for (const [id, p] of r.digitales) {
    const k = p.elemento
    const aux = s.aux[k] ?? 0
    const x: Extract<ExtraMedicion, { tipo: 'digital' }> = {
      tipo: 'digital',
      modelo: r.tipoDeElemento[k] as ModeloDigital['tipo'],
      pines: p.pines.map((q) => ({ id: q.id, nombre: q.nombre, nivel: nivelDe(s.niveles[q.red]), salida: q.salida, ...(redes.has(q.redDoc) ? { v: redes.get(q.redDoc)! } : {}) }))
    }
    if (x.modelo === 'biestable-d' || x.modelo === 'biestable-jk') {
      x.q = nivelDe(s.estado[k])
      x.causa = CAUSAS[aux] ?? 'indefinida'
    } else if (x.modelo === 'contador') x.cuenta = aux >= 0 ? aux : null
    else if (x.modelo === 'decodificador') x.digito = aux >= -1 ? aux : null
    else if (x.modelo === 'msi') {
      const reg = registroMsi(r.netlist?.elements[k], p, aux, s.estado[k] ?? -1, s)
      if (reg) x.registro = reg
    }
    piezas.set(id, { v: 0, i: 0, p: 0, extra: x })
  }
  for (const [id, c] of r.convertidores ?? []) {
    const e = r.netlist?.elements[c.elemento]
    if (e?.type === 'MSI') {
      const codigo = s.aux[c.elemento] ?? -1
      const vref2 = c.vref2 === undefined ? undefined : redes.get(c.vref2)
      piezas.set(id, {
        v: 0, i: 0, p: 0,
        extra: {
          tipo: 'convertidor-ad', codigo: codigo >= 0 ? codigo : null, bits: e.nucleo.tipo === 'aproximaciones' ? e.nucleo.bits : 8,
          convirtiendo: (s.estado[c.elemento] ?? 0) > 0, intr: nivelDe(c.intr === undefined ? undefined : s.niveles[c.intr]), vref: vref2 === undefined ? null : 2 * vref2, reloj: r.relojesAdc.get(id) ?? null
        }
      })
    } else if (e?.type === 'DACM') piezas.set(id, { v: 0, i: s.currents[c.elemento] ?? 0, p: 0, extra: { tipo: 'convertidor-da', codigo: s.estado[c.elemento] ?? 0, io: s.currents[c.elemento] ?? 0 } })
  }
  for (const [id, t] of r.temporizadores) {
    const alimentacion = (redes.get(t.vcc) ?? 0) - (redes.get(t.gnd) ?? 0)
    const extra: ExtraMedicion = { tipo: '555', salida: nivelDe(s.niveles[t.q]), f: s.medidas[3 * t.q] ?? 0, ciclo: s.medidas[3 * t.q + 1] ?? 0, thr: redes.get(t.thr) ?? 0, trig: redes.get(t.trig) ?? 0, alimentacion, vmin: t.vmin, vmax: t.vmax, modelo: t.modelo }
    piezas.set(id, { v: 0, i: 0, p: 0, extra })
  }
  for (const [id, indices] of r.displays) {
    const corrientes = indices.map((k) => (k >= 0 ? (s.currents[k] ?? 0) : null))
    piezas.set(id, { v: 0, i: 0, p: 0, extra: { tipo: 'display', corrientes, muestra: textoDelDisplay(corrientes) } })
  }
  return { t: s.time, ratio: s.ratio, redes, piezas, digitales: lecturasDigitales(r, s), ...rapidez }
}

/** El registro de un `MSI` con sus nombres de bit y su reloj, según su núcleo; null si el núcleo no tiene registro que mostrar. `principal` y `auxiliar` son las dos lecturas del motor. */
function registroMsi(e: ElementoMotor | undefined, p: { pines: { id: string; nombre: string; red: number; salida: boolean }[] }, principal: number, auxiliar: number, s: SimReading): RegistroMsi | null {
  if (e?.type !== 'MSI' || e.nucleo.tipo === 'aproximaciones') return null
  const n = e.nucleo
  const almacen = n.tipo === 'desplazamiento' && n.almacen !== undefined
  const clase = n.tipo === 'contador' ? 'cuenta' : almacen ? 'almacén' : 'registro'
  const valor = almacen ? auxiliar : principal
  // El nombre de cada bit es el del pin de salida que lo muestra directo (negado o no). Un almacén que sale por una tabla
  // (el 595 con su habilitación de salida) lleva las salidas de la tabla en el orden de sus bits.
  const pinDe = (j: number) => p.pines.find((q) => q.salida && q.red === e.salidas[j])?.nombre
  const directos = Array.from({ length: n.bits }, (_, b) => {
    const j = e.de.findIndex((d) => d.tipo === 'directa' && (almacen ? 'aux' in d.fuente && d.fuente.aux === b : 'bit' in d.fuente && d.fuente.bit === b))
    return j < 0 ? undefined : pinDe(j)
  })
  const deTabla = e.de.flatMap((d, j) => (d.tipo === 'tabla' ? [pinDe(j)] : []))
  const nombres = directos.every((x) => x === undefined) && deTabla.length === n.bits && deTabla.every((x) => x !== undefined) ? (deTabla as string[]) : directos.map((x, b) => x ?? String(b))
  const red = e.entradas[n.reloj.senales[0]?.entrada ?? -1]
  const pinReloj = red === undefined ? undefined : p.pines.find((q) => !q.salida && q.red === red)
  return { clase, valor: valor >= 0 ? valor : null, bits: n.bits, nombres, ...(red === undefined ? {} : { reloj: { hz: s.medidas[3 * red] ?? 0, pin: pinReloj?.nombre ?? '' } }) }
}

/** Lo propio del modelo con la segunda lectura y el estado que da el motor; null si el modelo no tiene nada aparte. */
export function extraDeElemento(e: ElementoMotor, tipo: string | undefined, m: { v: number; i: number }, v: (nodo: number) => number, aux: number, estado: number, umbral?: number): ExtraMedicion | null {
  // Un comparador es un amplificador y un transistor por dentro: su medición es la de la salida (VCE y corriente), sin región ni saturación.
  if (tipo === 'comparador') return null
  switch (e.type) {
    case 'Q':
      return { tipo: 'bjt', region: nombreDeRegion('bjt', estado), vbe: v(e.b) - v(e.e), ib: aux }
    case 'M':
      return { tipo: 'mosfet', region: nombreDeRegion('mosfet', estado), vgs: v(e.g) - v(e.s) }
    case 'J':
      return { tipo: 'jfet', region: nombreDeRegion('jfet', estado), vgs: v(e.g) - v(e.s) }
    case 'OA':
      return { tipo: 'ampop', saturado: estado > 0 ? 1 : estado < 0 ? -1 : 0 }
    case 'FUSE':
      return { tipo: 'fusible', fundido: estado > 0, calentamiento: aux }
    case 'LAMP':
      return { tipo: 'foco', fundido: estado > 0, calentamiento: aux }
    case 'MOTOR':
      return { tipo: 'motor', rpm: (aux * 60) / (2 * Math.PI) }
    case 'PASOS':
      // El ángulo de salida ya viene dividido entre la reducción; un paso completo del rotor es π / (2 · dientes).
      return { tipo: 'motor', rpm: (aux * 60) / (2 * Math.PI), angulo: estado, pasos: (estado * (e.reduccion ?? 1)) / (Math.PI / (2 * e.dientes)) }
    case 'RELAY':
      return { tipo: 'rele', operado: estado > 0 }
    case 'TERM':
      return { tipo: 'termistor', temperatura: aux }
    case 'LDR':
      return { tipo: 'ldr', r: aux }
  }
  if (tipo === 'zener') return { tipo: 'zener', estado: m.i > CORRIENTE_MINIMA_ZENER ? 'directa' : m.i < -CORRIENTE_MINIMA_ZENER ? 'ruptura' : 'corte' }
  if (tipo === 'zumbador' && umbral !== undefined) return { tipo: 'zumbador', suena: m.v >= umbral }
  if (tipo === 'D' && umbral !== undefined) return { tipo: 'led', inom: umbral, excedida: m.i > umbral }
  return null
}

/** Resistencia entre alimentaciones de un amplificador cuyo modelo no la trae: la de omisión del motor (`OpampModel`). */
const RQ_OMISION = 17.6e3

/** Paso más largo de la vista previa: 20 µs, los 50 pasos por periodo de una señal de 1 kHz. Con 10 µs esa señal quedaba
 * acotada por este límite y no por sus pasos por periodo; 20 µs bastan para ver cargar un capacitor y encender un LED, y
 * el error de truncamiento acorta el paso donde hace falta. */
export const PASO_MAX = 2e-5
/** Paso más corto: por debajo el reloj no alcanza el tiempo real ni con circuitos de pocas redes. */
export const PASO_MIN = 1e-8
/** Pasos por periodo de la fuente más rápida como paso máximo. Con 200 un emisor común a 1 kHz quedaba a 1.48 veces el
 * tiempo real y con 100 a 2.8; con 50 la capacidad casi se duplica y el error eficaz contra 1,000 pasos es 0.013 % del
 * pico a pico (0.010 % con 100; `cargo run --release --example precision_paso`). */
export const PASOS_POR_PERIODO = 50
/** Por debajo de estos pasos por periodo (con el paso más corto) la onda ya no se sigue: la netlist avisa. */
export const PASOS_MINIMOS = 20

/** Pasos por pantalla del osciloscopio de base de tiempo más rápida: con menos, la pantalla tendría dos puntos. */
export const PASOS_POR_PANTALLA = 500

/** Paso máximo para la netlist: 50 por periodo de la fuente más rápida y 500 por pantalla del osciloscopio más rápido
 * (`bases`, s/div), entre 10 ns y 20 µs. */
export function pasoDeSimulacion(n: NetlistMotor, bases: readonly number[] = []): number {
  let h = PASO_MAX
  for (const e of n.elements) {
    const w = ondaDe(e)
    if (!w || w.kind === 'dc' || w.kind === 'pwl') continue
    h = Math.min(h, 1 / (PASOS_POR_PERIODO * w.freq))
  }
  for (const b of bases) h = Math.min(h, (DIVISIONES_H * b) / PASOS_POR_PANTALLA)
  return Math.max(PASO_MIN, h)
}

/** Paso más largo de la vista previa adaptativa: 250 µs, 66 pasos por cuadro de 1/60 s a 1×. Con su tolerancia sola el
 * motor deja hasta 3 mV tras un flanco de 1 V en `compuanalogica.kir`; medido contra 20 µs, 200 µs difiere 0.012 mV, 250
 * µs 0.032 mV, 300 µs 0.09 mV y 400 µs 2.5 mV. */
export const PASO_VISTA = 2.5e-4
/** Pasos por periodo de las fuentes lentas (hasta 250 Hz): el error de truncamiento del motor no ve el codo de un diodo. */
const PASOS_POR_PERIODO_FINO = 200
/** El motor rechaza un tramo de onda más corto que 1e-4 del paso máximo (`comprobar_cuadrada`): la mitad de ese límite. */
const PASO_POR_TRAMO = 0.5e4

/** La onda de una fuente de voltaje o de corriente con onda; undefined en cualquier otro elemento. */
function ondaDe(e: ElementoMotor): Onda | undefined {
  return e.type === 'V' ? e.wave : e.type === 'I' ? e.wave : undefined
}

/** El tramo más corto de una onda con flancos (los de 0, flancos ideales, no cuentan); Infinity si no tiene. */
function tramoMinimo(w: Onda): number {
  switch (w.kind) {
    case 'square':
      return Math.min(w.duty, 1 - w.duty) / w.freq
    case 'pulse': {
      const per = 1 / w.freq
      const resto = per - w.rise - w.width - w.fall
      return [w.rise, w.width, w.fall, resto].filter((x) => x > 1e-12 * per).reduce((a, b) => Math.min(a, b), Infinity)
    }
    case 'stair':
      return 1 / (w.freq * w.steps)
    case 'pwl':
      return w.puntos.slice(1).reduce((m, p, k) => Math.min(m, p[0] - w.puntos[k][0]), Infinity)
    default:
      return Infinity
  }
}

/** Paso máximo de la vista previa en vivo, el menor de: 20 pasos por cuadro, por fuente periódica 200 por periodo hasta
 * 250 Hz y 50 con tope de 20 µs desde ahí (un rectificador a 60 Hz con 50 se alejaba 2.5 % de la cota fina), la mitad del
 * tramo más corto de sus flancos y 500 por pantalla de osciloscopio; nunca menos de 10 ns. */
export function pasoDeVistaPrevia(n: NetlistMotor, bases: readonly number[] = []): number {
  const t = topesDeVistaPrevia(n, bases)
  return t.fuentes.reduce((h, [, hk]) => Math.min(h, hk), t.libre)
}

/** El paso de `pasoDeVistaPrevia` repartido por isla: `libre` (20 pasos por cuadro y las pantallas del osciloscopio) vale en
 * todas, y el de cada fuente periódica (índice de elemento y paso) solo en la isla de la fuente (`Simulator.topes_de_paso`). */
export function topesDeVistaPrevia(n: NetlistMotor, bases: readonly number[] = []): { libre: number; fuentes: [number, number][] } {
  let libre = PASO_VISTA
  for (const b of bases) libre = Math.min(libre, (DIVISIONES_H * b) / PASOS_POR_PANTALLA)
  libre = Math.max(PASO_MIN, libre)
  const fuentes: [number, number][] = []
  n.elements.forEach((e, k) => {
    const w = ondaDe(e)
    if (!w || w.kind === 'dc') return
    let h: number
    // Una onda por tramos no tiene frecuencia: solo cuentan sus esquinas.
    if (w.kind === 'pwl') h = PASO_POR_TRAMO * tramoMinimo(w)
    else {
      const f = w.freq
      // Hasta 250 Hz, 200 pasos por periodo (el rectificador a 60 Hz con 50 se alejaba 2.5 % de la cota fina); de ahí en adelante,
      // los 50 de siempre con tope de 20 µs, así que nunca es más fino que `pasoDeSimulacion`.
      h = Math.min(Math.max(1 / (PASOS_POR_PERIODO_FINO * f), Math.min(1 / (PASOS_POR_PERIODO * f), PASO_MAX)), PASO_POR_TRAMO * tramoMinimo(w))
    }
    if (h < libre) fuentes.push([k, Math.max(PASO_MIN, h)])
  })
  return { libre, fuentes }
}

/** Los topes en el arreglo plano que pide `Simulator.topes_de_paso` (elemento y paso, uno tras otro). */
export const topesPlanos = (t: { fuentes: [number, number][] }): Float64Array => Float64Array.from(t.fuentes.flat())

/** Las bases de tiempo de los osciloscopios con algún canal encendido (las que acotan el paso). */
export function basesDeTiempo(r: ResultadoNetlist): number[] {
  return [...r.instrumentos.osciloscopios.values()].filter((o) => o.ajustes.canales.some((c) => c.on) || o.ajustes.matematico).map((o) => o.ajustes.base)
}

/** Voltaje del naranja (y azul) pleno de la escala de cables: el de la fuente de mayor magnitud o la mayor alimentación de
 * piezas digitales, fijo mientras corre para que un mismo voltaje conserve su color. Sin fuentes con voltaje, 1 V. */
export function escalaDeVoltaje(n: NetlistMotor, alimentaciones: Iterable<number> = []): number {
  let v = 0
  for (const a of alimentaciones) if (Math.abs(a) > v) v = Math.abs(a)
  for (const e of n.elements) {
    // La fuente variable da su voltaje como cualquier fuente.
    if (e.type === 'PSU' && Math.abs(e.v) > v) v = Math.abs(e.v)
    if (e.type !== 'V') continue
    const w = e.wave
    const m = w.kind === 'dc' ? Math.abs(w.v) : w.kind === 'pwl' ? Math.max(...w.puntos.map((p) => Math.abs(p[1]))) : w.kind === 'sine' ? Math.abs(w.offset) + Math.abs(w.amp) : Math.max(Math.abs(w.low), Math.abs(w.high))
    if (m > v) v = m
  }
  return v > 0 ? v : 1
}


/** Medición de pieza de cada instrumento, con sus terminales y no con su último elemento: generador y fuente variable,
 * voltaje entre terminales y corriente entregada (potencia negativa); multímetro, voltaje entre «+» y COM, corriente por
 * «+» y su fusible. El osciloscopio no tiene. */
function medirInstrumentos(r: ResultadoNetlist, s: SimReading, piezas: Map<Id, MedicionPieza>, v: (nodo: number) => number): void {
  const el = r.netlist?.elements
  // Un resultado armado a mano en una prueba puede no traer instrumentos.
  if (!el || !r.instrumentos) return
  const corriente = (k: number) => s.currents[k] ?? 0
  for (const [id, g] of r.instrumentos.generadores) {
    const R = el[g.resistencia], V = el[g.fuente]
    if (R?.type !== 'R' || V?.type !== 'V') continue
    const dv = v(R.b) - v(V.b), i = corriente(g.resistencia)
    piezas.set(id, { v: dv, i, p: -dv * i })
  }
  for (const [id, f] of r.instrumentos.fuentes) {
    const P = el[f.elemento]
    if (P?.type !== 'PSU') continue
    const dv = v(P.a) - v(P.b), i = -corriente(f.elemento), e = s.estado[f.elemento] ?? 0
    piezas.set(id, { v: dv, i, p: -dv * i, extra: { tipo: 'fuente-variable', modo: e > 0 ? 'CC' : e < 0 ? 'apagada' : 'CV' } })
  }
  for (const [id, mm] of r.instrumentos.multimetros) {
    const F = el[mm.elemento]
    if (F?.type !== 'FUSE') continue
    // Su único elemento va de «+» a COM: su corriente es la que entra por «+».
    const dv = v(F.a) - v(F.b), i = corriente(mm.elemento)
    piezas.set(id, { v: dv, i, p: dv * i, extra: { tipo: 'fusible', fundido: (s.estado[mm.elemento] ?? 0) > 0 } })
  }
  for (const id of r.instrumentos.osciloscopios.keys()) piezas.delete(id)
}
