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

/** El número como se escribe en una propiedad: ingeniería con tres cifras si es exacta, el número completo si no. */
export function textoNumero(n: number): string {
  const corto = textoDeIngenieria(n)
  // Se comprueba con el lector de Kirchi, donde «M» es mega (en SPICE es milli).
  const vuelta = leerValor(corto)?.valor ?? null
  return vuelta !== null && Math.abs(vuelta - n) <= Math.abs(n) * 1e-9 ? corto : String(n)
}

const CICLOS = [1, 5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 99]
const cicloCercano = (fraccion: number): string => {
  const pct = fraccion * 100
  const c = CICLOS.reduce((a, b) => (Math.abs(b - pct) < Math.abs(a - pct) ? b : a))
  return `${c} %`
}

const FORMAS_FALSTAD: Record<string, string> = { senoidal: 'Senoidal', cuadrada: 'Cuadrada', triangular: 'Triangular', diente: 'Diente de sierra', pulso: 'Pulso' }

/** La pieza de Kirchi para un generador del origen. Fuente de CA o de pulso (con 0 V abajo) si sus propiedades cubren todo lo
 * que trae; si no, el generador de funciones, que tiene offset, desfase y todas las formas. Amplitudes del generador: pico a pico. */
export function piezaDeGenerador(g: Generador): PiezaGenerada {
  const p = g.parametros
  const avisos: string[] = []
  if (g.forma === 'cd') return { tipo: 'fuente-dc', props: { voltaje: textoNumero(num(p, 'amplitud', 'valor', 'dc') ?? 0) }, avisos }

  const f = num(p, 'freq', 'frecuencia') ?? 0
  const fase = num(p, 'fase', 'phi') ?? 0
  const retardo = num(p, 'td') ?? 0
  if (g.forma === 'senoidal' || (g.forma === 'otra' && String(p.forma ?? '') === 'senoidal')) {
    const offset = num(p, 'vo', 'offset') ?? 0
    const amp = num(p, 'va', 'amplitud') ?? 0
    if ((num(p, 'theta') ?? 0) !== 0) avisos.push(`El amortiguamiento (theta) de ${g.nombre} no se convierte.`)
    if (offset === 0 && fase === 0 && retardo === 0) return { tipo: 'fuente-ac', props: { amplitud: textoNumero(amp), frecuencia: textoNumero(f) }, avisos }
    if (retardo !== 0) avisos.push(`El retardo de ${g.nombre} no se convierte en una senoidal.`)
    return {
      tipo: 'generador',
      props: { forma: 'Senoidal', frecuencia: textoNumero(f), amplitud: textoNumero(2 * amp), desplazamiento: textoNumero(offset), ...(fase !== 0 ? { desfase: textoNumero(fase) } : {}), ideal: 'sí' },
      avisos
    }
  }

  if (p.v1 !== undefined || p.v2 !== undefined) {
    const v1 = num(p, 'v1') ?? 0, v2 = num(p, 'v2') ?? 0
    const per = num(p, 'per') ?? 0
    const pw = num(p, 'pw') ?? 0
    const tr = num(p, 'tr') ?? 0, tf = num(p, 'tf') ?? 0
    if (!(per > 0)) avisos.push(`El pulso ${g.nombre} no trae periodo: se dejó a 1 kHz.`)
    const frecuencia = per > 0 ? 1 / per : 1000
    if (v1 === 0) {
      return {
        tipo: 'fuente-pulso',
        props: { alto: textoNumero(v2), frecuencia: textoNumero(frecuencia), ancho: textoNumero(pw), subida: textoNumero(tr), bajada: textoNumero(tf), retardo: textoNumero(retardo) },
        avisos
      }
    }
    avisos.push(`El pulso ${g.nombre} no parte de 0 V: se usa el generador de funciones con ciclo de trabajo redondeado${tr || tf || retardo ? ' y sin flancos ni retardo' : ''}.`)
    return {
      tipo: 'generador',
      props: { forma: 'Pulso', frecuencia: textoNumero(frecuencia), amplitud: textoNumero(Math.abs(v2 - v1)), desplazamiento: textoNumero((v1 + v2) / 2), ciclo: cicloCercano(per > 0 ? pw / per : 0.5), ideal: 'sí' },
      avisos
    }
  }

  // Falstad: forma, frecuencia, amplitud (pico), offset, fase y ciclo.
  const forma = String(p.forma ?? 'senoidal')
  const amp = num(p, 'amplitud') ?? 0
  if (!Object.hasOwn(FORMAS_FALSTAD, forma)) avisos.push(`La forma «${forma}» de ${g.nombre} no existe en Kirchi: se usa una senoidal.`)
  const props: Record<string, string> = {
    forma: Object.hasOwn(FORMAS_FALSTAD, forma) ? FORMAS_FALSTAD[forma]! : 'Senoidal',
    frecuencia: textoNumero(f),
    amplitud: textoNumero(2 * amp),
    desplazamiento: textoNumero(num(p, 'offset') ?? 0),
    ideal: 'sí'
  }
  if (fase !== 0) props.desfase = textoNumero(fase)
  const ciclo = num(p, 'ciclo')
  if (ciclo !== undefined && (forma === 'pulso' || forma === 'cuadrada')) {
    if (forma === 'pulso') props.ciclo = cicloCercano(ciclo)
    else if (Math.abs(ciclo - 0.5) > 1e-9) avisos.push(`El ciclo de trabajo de ${g.nombre} no se convierte en una onda cuadrada (queda al 50 %).`)
  }
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
