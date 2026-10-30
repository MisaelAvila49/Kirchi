/** Instrumentos y análisis del origen: de qué pieza de Kirchi es cada generador y cómo se ven las directivas de análisis. */
import { puntosDeConfig, type ConfigAnalisis } from '../../../compartido/analisis/config'
import { TOPE_PUNTOS } from '../../../compartido/analisis/puntos'
import type { EntradaAnalisis } from '../edicion/analisisDoc'
import { leerValor } from '../valores/valores'
import { textoDeIngenieria } from '../valores/series'
import type { DirectivaAjena, InstrumentoAjeno } from './ajeno'
import { numeroSpice } from './lectores/spice'

type Generador = Extract<InstrumentoAjeno, { tipo: 'generador' }>
type Analisis = Extract<DirectivaAjena, { tipo: 'analisis' }>

export interface PiezaGenerada {
  tipo: string
  props: Record<string, string>
  /** Qué hizo la conversión que el usuario debe saber. */
  avisos: string[]
}

const num = (p: Record<string, number | string>, ...claves: string[]): number | undefined => {
  for (const k of claves) {
    const v = p[k]
    if (v === undefined) continue
    const n = typeof v === 'number' ? v : numeroSpice(String(v))
    if (n !== null && Number.isFinite(n)) return n
  }
  return undefined
}

const PREFIJOS_SI: [number, string][] = [[12, 'T'], [9, 'G'], [6, 'M'], [3, 'k'], [0, ''], [-3, 'm'], [-6, 'u'], [-9, 'n'], [-12, 'p'], [-15, 'f']]

/** El número como se escribe en una propiedad: ingeniería con tres cifras si es exacta, con hasta nueve si no (el lector de
 * valores no entiende la notación científica), y completo solo si ni así cabe. */
export function textoNumero(n: number): string {
  const limpio = Number(n.toPrecision(12))
  const aprox = (t: string): boolean => {
    // Se comprueba con el lector de Kirchi, donde «M» es mega (en SPICE es milli).
    const vuelta = leerValor(t)?.valor ?? null
    return vuelta !== null && Math.abs(vuelta - limpio) <= Math.abs(limpio) * 1e-9
  }
  const corto = textoDeIngenieria(limpio)
  if (aprox(corto)) return corto
  const abs = Math.abs(limpio)
  const [e, p] = PREFIJOS_SI.find(([x]) => abs >= 10 ** x * (1 - 1e-12)) ?? PREFIJOS_SI[PREFIJOS_SI.length - 1]!
  if (e >= 0 && e <= 3) return String(limpio)
  const largo = `${Number((e < 0 ? limpio * 10 ** -e : limpio / 10 ** e).toPrecision(9))}${p}`
  return aprox(largo) ? largo : String(limpio)
}

const CICLOS = [1, 5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 99]
const cicloCercano = (fraccion: number): string => {
  const pct = fraccion * 100
  const c = CICLOS.reduce((a, b) => (Math.abs(b - pct) < Math.abs(a - pct) ? b : a))
  return `${c} %`
}

const FORMAS_FALSTAD: Record<string, string> = { senoidal: 'Senoidal', cuadrada: 'Cuadrada', triangular: 'Triangular', diente: 'Diente de sierra', pulso: 'Pulso' }

/** Tiempo mínimo de un flanco en una onda por tramos: el motor no admite dos puntos con el mismo tiempo. */
const FLANCO_MIN = 1e-9

const textoPuntos = (puntos: [number, number][]): string => puntos.map(([t, v]) => `${textoNumero(t)} ${textoNumero(v)}`).join(', ')

/** Pulso completo de SPICE como fuente por tramos que repite su periodo, para lo que la fuente de pulso (0 V abajo) no cubre. */
function pulsoPorTramos(nombre: string, v1: number, v2: number, td: number, tr: number, tf: number, pw: number, per: number, avisos: string[]): PiezaGenerada | null {
  const subida = Math.max(tr, FLANCO_MIN), bajada = Math.max(tf, FLANCO_MIN)
  const ancho = pw > 0 ? pw : per / 2
  if (td + subida + ancho + bajada > per * (1 + 1e-9)) return null
  if (!(pw > 0)) avisos.push(`El pulso ${nombre} no trae ancho: se dejó la mitad del periodo.`)
  const puntos: [number, number][] = [[0, v1]]
  let t = td
  if (td > 0) puntos.push([td, v1])
  for (const [dt, v] of [[subida, v2], [ancho, v2], [bajada, v1]] as const) {
    t += dt
    puntos.push([t, v])
  }
  if (per > t) puntos.push([per, v1])
  return { tipo: 'fuente-pwl', props: { puntos: textoPuntos(puntos), repetir: 'Sí' }, avisos }
}

/** EXP de SPICE muestreada en tramos: sube hacia v2 desde td1 y vuelve hacia v1 desde td2, hasta cinco constantes de tiempo. */
function exponencialPorTramos(nombre: string, p: Record<string, number | string>, avisos: string[]): PiezaGenerada {
  const v1 = num(p, 'v1') ?? 0, v2 = num(p, 'v2') ?? v1
  const td1 = num(p, 'td1') ?? 0, tau1 = num(p, 'tau1') ?? 0
  const td2 = num(p, 'td2') ?? td1 + tau1, tau2 = num(p, 'tau2') ?? tau1
  if (!(tau1 > 0) || !(tau2 > 0)) {
    avisos.push(`La fuente exponencial ${nombre} no trae constantes de tiempo: se dejó fija en ${textoNumero(v1)} V.`)
    return { tipo: 'fuente-dc', props: { voltaje: textoNumero(v1) }, avisos }
  }
  const fin = Math.max(td2 + 5 * tau2, td1 + 5 * tau1)
  const valor = (t: number): number => {
    let v = v1
    if (t > td1) v += (v2 - v1) * (1 - Math.exp(-(t - td1) / tau1))
    if (t > td2) v += (v1 - v2) * (1 - Math.exp(-(t - td2) / tau2))
    return v
  }
  const tiempos = new Set<number>([0])
  for (let k = 1; k <= 60; k++) tiempos.add(Number(((fin * k) / 60).toPrecision(6)))
  for (const t of [td1, td2]) if (t > 0) tiempos.add(Number(t.toPrecision(6)))
  const ordenados = [...tiempos].sort((a, b) => a - b)
  avisos.push(`La fuente exponencial ${nombre} se importó en ${ordenados.length} tramos rectos hasta ${textoNumero(fin)} s.`)
  return { tipo: 'fuente-pwl', props: { puntos: textoPuntos(ordenados.map((t) => [t, Number(valor(t).toPrecision(6))])), repetir: 'No' }, avisos }
}

/** Una fuente de corriente: senoidal desde 0 A y pulso desde 0 A tienen pieza propia; lo demás se reduce a su nivel de partida y se avisa. */
function corrienteDeOnda(g: Generador, p: Record<string, number | string>): PiezaGenerada {
  const { corriente: _marca, ...sinMarca } = p
  const comoVoltaje = piezaDeGenerador({ ...g, parametros: sinMarca })
  const pieza = comoVoltaje.tipo === 'fuente-ac' ? 'fuente-corriente-ac' : comoVoltaje.tipo === 'fuente-pulso' ? 'fuente-corriente-pulso' : null
  if (pieza) return { tipo: pieza, props: comoVoltaje.props, avisos: comoVoltaje.avisos }
  const nivel = num(p, 'vo', 'dc', 'offset') ?? (g.forma === 'pulso' ? num(p, 'v1') : undefined) ?? 0
  return {
    tipo: 'fuente-corriente',
    props: { corriente: textoNumero(nivel) },
    avisos: [`${g.nombre} es una fuente de corriente con una forma que Kirchi no convierte (solo senoidal y pulso desde 0 A): se importó fija en ${textoNumero(nivel)} A.`]
  }
}

/** La pieza de Kirchi para un generador del origen. Fuente de CA o de pulso (con 0 V abajo) si sus propiedades cubren todo lo
 * que trae; si no, una fuente por tramos que lo repite exacto, o el generador de funciones. Amplitudes del generador: pico a pico. */
export function piezaDeGenerador(g: Generador): PiezaGenerada {
  const p = g.parametros
  const avisos: string[] = []
  if (g.forma === 'cd') return { tipo: 'fuente-dc', props: { voltaje: textoNumero(num(p, 'amplitud', 'valor', 'dc') ?? 0) }, avisos }
  if (p.corriente !== undefined) return corrienteDeOnda(g, p)

  const forma0 = String(p.forma ?? '')
  if (forma0 === 'pwl') {
    // Los puntos vienen como números de JavaScript (pueden traer notación científica), tiempo y valor alternados.
    const n = String(p.puntos ?? '').split(/[\s,]+/).filter(Boolean).map(Number)
    const puntos: [number, number][] = []
    for (let i = 0; i + 1 < n.length; i += 2) puntos.push([n[i]!, n[i + 1]!])
    if (!puntos.length || n.length % 2 !== 0 || n.some((x) => !Number.isFinite(x)) || puntos[0]![0] !== 0 || puntos.some((q, i) => i > 0 && !(q[0] > puntos[i - 1]![0])))
      return { tipo: 'fuente-dc', props: { voltaje: '0' }, avisos: [`Los puntos de ${g.nombre} no se pudieron leer: se dejó fija en 0 V.`] }
    return { tipo: 'fuente-pwl', props: { puntos: textoPuntos(puntos), repetir: p.repetir ? 'Sí' : 'No' }, avisos }
  }
  if (forma0 === 'exp') return exponencialPorTramos(g.nombre, p, avisos)

  const f = num(p, 'freq', 'frecuencia') ?? 0
  const fase = num(p, 'fase', 'phi') ?? 0
  const retardo = num(p, 'td') ?? 0
  if (g.forma === 'senoidal' || (g.forma === 'otra' && forma0 === 'senoidal')) {
    const offset = num(p, 'vo', 'offset') ?? 0
    const amp = num(p, 'va', 'amplitud') ?? 0
    if ((num(p, 'theta') ?? 0) !== 0) avisos.push(`El amortiguamiento (theta) de ${g.nombre} no se convierte.`)
    if (!(f > 0)) avisos.push(`La senoidal ${g.nombre} no trae frecuencia: se dejó a 1 kHz.`)
    const frecuencia = f > 0 ? f : 1000
    if (offset === 0 && fase === 0 && retardo === 0) return { tipo: 'fuente-ac', props: { amplitud: textoNumero(amp), frecuencia: textoNumero(frecuencia) }, avisos }
    if (retardo !== 0) avisos.push(`El retardo de ${g.nombre} no se convierte en una senoidal.`)
    return {
      tipo: 'generador',
      props: { forma: 'Senoidal', frecuencia: textoNumero(frecuencia), amplitud: textoNumero(2 * amp), desplazamiento: textoNumero(offset), ...(fase !== 0 ? { desfase: textoNumero(fase) } : {}), ideal: 'sí' },
      avisos
    }
  }

  if (p.v1 !== undefined || p.v2 !== undefined) {
    const v1 = num(p, 'v1') ?? 0, v2 = num(p, 'v2') ?? 0
    const per = num(p, 'per') ?? 0
    const pw = num(p, 'pw') ?? 0
    const tr = num(p, 'tr') ?? 0, tf = num(p, 'tf') ?? 0
    if (!(per > 0)) avisos.push(`El pulso ${g.nombre} no trae periodo: se dejó a 1 kHz.`)
    const periodo = per > 0 ? per : 1e-3
    // Subida, ancho y bajada tienen que caber en el periodo; si no, la pieza no compila y se cae al generador.
    const cabe = tr + (pw > 0 ? pw : periodo / 2) + tf
    if (v1 === 0 && cabe <= periodo * (1 + 1e-9)) {
      // Un retardo mayor que el sobrante solo cambia la fase.
      let td = retardo
      if (td + cabe > periodo * (1 + 1e-9)) {
        td = Math.max(0, Math.min(retardo % periodo, periodo - cabe))
        avisos.push(`El retardo de ${g.nombre} (${textoNumero(retardo)} s) no cabe en su periodo: se dejó en ${textoNumero(td)} s.`)
      }
      return {
        tipo: 'fuente-pulso',
        props: { alto: textoNumero(v2), frecuencia: textoNumero(1 / periodo), ancho: textoNumero(pw), subida: textoNumero(tr), bajada: textoNumero(tf), retardo: textoNumero(td) },
        avisos
      }
    }
    const tramos = pulsoPorTramos(g.nombre, v1, v2, retardo, tr, tf, pw, periodo, avisos)
    if (tramos) return tramos
    avisos.push(`El pulso ${g.nombre} no parte de 0 V o no cabe en su periodo con su retardo y sus flancos: se usa el generador de funciones con ciclo de trabajo redondeado${tr || tf || retardo ? ' y sin flancos ni retardo' : ''}.`)
    return {
      tipo: 'generador',
      props: { forma: 'Pulso', frecuencia: textoNumero(1 / periodo), amplitud: textoNumero(Math.abs(v2 - v1)), desplazamiento: textoNumero((v1 + v2) / 2), ciclo: cicloCercano(pw / periodo || 0.5), ideal: 'sí' },
      avisos
    }
  }

  // Falstad: forma, frecuencia, amplitud (pico), offset, fase y ciclo.
  const forma = forma0 || 'senoidal'
  const amp = num(p, 'amplitud') ?? 0
  const offset = num(p, 'offset') ?? 0
  const ciclo = num(p, 'ciclo')
  if (!Object.hasOwn(FORMAS_FALSTAD, forma)) avisos.push(`La forma «${forma}» de ${g.nombre} no existe en Kirchi: se usa una senoidal.`)
  // Cuadrada con ciclo propio: va entre offset - amp y offset + amp y empieza arriba. Desde 0 V es la fuente de pulso; si no, por tramos.
  if (forma === 'cuadrada' && ciclo !== undefined && ciclo > 0 && ciclo < 1 && Math.abs(ciclo - 0.5) > 1e-9 && f > 0) {
    const alto = offset + amp, bajo = offset - amp
    const periodo = 1 / f
    const retardoFase = fase !== 0 ? ((((-fase / 360) % 1) + 1) % 1) * periodo : 0
    if (fase !== 0) avisos.push(`La fase de ${g.nombre} (${textoNumero(fase)}°) se importó como un retardo de ${textoNumero(retardoFase)} s.`)
    if (Math.abs(bajo) < 1e-12) {
      return { tipo: 'fuente-pulso', props: { alto: textoNumero(alto), frecuencia: textoNumero(f), ciclo: `${Number((ciclo * 100).toPrecision(4))} %`, retardo: textoNumero(retardoFase) }, avisos }
    }
    if (retardoFase === 0) {
      return { tipo: 'fuente-pwl', props: { puntos: textoPuntos([[0, alto], [ciclo * periodo, alto], [ciclo * periodo + FLANCO_MIN, bajo], [periodo, bajo]]), repetir: 'Sí' }, avisos }
    }
    avisos.push(`El ciclo de trabajo de ${g.nombre} no se convierte en una onda cuadrada con fase (queda al 50 %).`)
  }
  const props: Record<string, string> = {
    forma: Object.hasOwn(FORMAS_FALSTAD, forma) ? FORMAS_FALSTAD[forma]! : 'Senoidal',
    frecuencia: textoNumero(f),
    amplitud: textoNumero(2 * amp),
    desplazamiento: textoNumero(offset),
    ideal: 'sí'
  }
  if (fase !== 0) props.desfase = textoNumero(fase)
  if (ciclo !== undefined && forma === 'pulso') props.ciclo = cicloCercano(ciclo)
  else if (ciclo !== undefined && forma === 'cuadrada' && Math.abs(ciclo - 0.5) > 1e-9 && !avisos.some((a) => a.includes('ciclo de trabajo'))) avisos.push(`El ciclo de trabajo de ${g.nombre} no se convierte en una onda cuadrada (queda al 50 %).`)
  return { tipo: 'generador', props, avisos }
}

export interface ContextoAnalisis {
  /** Referencia final de la fuente que el origen llama así; undefined si no existe. */
  refDe(nombre: string): string | undefined
  /** «R1.2» de una red por su nombre en el origen; undefined si no existe. */
  trazaDeRed(nombre: string): string | undefined
  /** La fuente de entrada del análisis de CA y su amplitud. */
  fuenteAc(): { ref: string; magnitud: number } | undefined
}

export interface AnalisisConvertido {
  entrada?: EntradaAnalisis
  /** Texto de la directiva de origen para el informe. */
  de: string
  avisos: string[]
}

const NOMBRES: Record<Analisis['analisis'], string> = {
  op: 'Punto de operación importado',
  dc: 'Barrido de CD importado',
  tran: 'Transitorio importado',
  ac: 'Respuesta en frecuencia importada',
  fourier: 'Fourier importado'
}

/** Lo que el informe dice de la directiva de origen: `.tran`, `.ac`... con sus parámetros. */
function textoDe(d: Analisis): string {
  const p = Object.entries(d.parametros).map(([k, v]) => `${k} ${v}`)
  return `.${d.analisis}${p.length ? ` (${p.join(', ')})` : ''}`
}

export function analisisDe(d: Analisis, ctx: ContextoAnalisis): AnalisisConvertido {
  const avisos: string[] = []
  const de = textoDe(d)
  const sinEntrada = (motivo: string): AnalisisConvertido => ({ de, avisos: [`${de}: ${motivo}`] })
  const p = d.parametros
  let config: ConfigAnalisis
  switch (d.analisis) {
    case 'op':
      config = { tipo: 'op' }
      break
    case 'tran': {
      const fin = num(p, 'fin')
      if (fin === undefined || !(fin > 0)) return sinEntrada('no trae un tiempo final válido y no se convirtió.')
      const maximo = num(p, 'max', 'paso')
      const inicio = num(p, 'inicio')
      config = { tipo: 'tran', fin, ...(maximo !== undefined && maximo > 0 ? { maximo } : {}), ...(inicio !== undefined && inicio > 0 && inicio < fin ? { inicio } : {}), ...(p.uic ? { uic: true } : {}) }
      if (puntosDeConfig(config) > TOPE_PUNTOS) {
        config = { tipo: 'tran', fin, ...(inicio !== undefined && inicio > 0 && inicio < fin ? { inicio } : {}) }
        avisos.push(`${de}: el paso máximo daba demasiados puntos y se dejó el de Kirchi.`)
      }
      break
    }
    case 'ac': {
      const fuente = ctx.fuenteAc()
      const barrido = String(p.tipo ?? 'dec')
      const puntos = num(p, 'puntos'), desde = num(p, 'fi'), hasta = num(p, 'ff')
      if (!fuente) return sinEntrada('no hay una fuente de entrada y no se convirtió.')
      if (!(barrido === 'dec' || barrido === 'oct' || barrido === 'lin') || puntos === undefined || desde === undefined || hasta === undefined) return sinEntrada('le faltan parámetros y no se convirtió.')
      config = { tipo: 'ac', barrido, puntos, desde, hasta, fuente: fuente.ref, magnitud: fuente.magnitud }
      break
    }
    case 'dc': {
      const nombre = String(p.fuente ?? '')
      const ref = ctx.refDe(nombre)
      const desde = num(p, 'inicio'), hasta = num(p, 'fin'), paso = num(p, 'paso')
      if (!ref) return sinEntrada(`no se encontró la fuente «${nombre}» y no se convirtió.`)
      if (desde === undefined || hasta === undefined || paso === undefined || paso <= 0) return sinEntrada('le faltan parámetros y no se convirtió.')
      config = { tipo: 'dc', fuente: ref, desde, hasta, paso }
      break
    }
    case 'fourier': {
      const fundamental = num(p, 'f')
      if (fundamental === undefined || !(fundamental > 0)) return sinEntrada('no trae la frecuencia fundamental y no se convirtió.')
      config = { tipo: 'fourier', fundamental, armonicos: 9, periodos: 1, descarte: 0, ventana: 'rectangular' }
      avisos.push(`${de}: se usaron 9 armónicos y el último periodo.`)
      break
    }
  }

  const trazas: string[] = []
  const corrientes: string[] = []
  for (const t of d.trazas) {
    const i = /^i\(([^)]+)\)$/i.exec(t)
    const v = /^v\(([^),]+)\)$/i.exec(t)
    if (i) {
      const ref = ctx.refDe(i[1]!)
      if (ref) corrientes.push(ref)
      else avisos.push(`${de}: la corriente ${t} no se encontró.`)
      continue
    }
    const nombre = v ? v[1]! : t
    if (nombre === '0') continue
    const traza = ctx.trazaDeRed(nombre)
    if (traza) trazas.push(traza)
    else avisos.push(`${de}: la traza «${t}» no se encontró.`)
  }
  return { entrada: { nombre: NOMBRES[d.analisis], config, ...(trazas.length ? { trazas: [...new Set(trazas)] } : {}), ...(corrientes.length ? { corrientes: [...new Set(corrientes)] } : {}) }, de, avisos }
}
