/** Gráficas en ventana aparte: la ventana carga la misma página con la ruta `#graficas`, pide sus datos al proceso principal y el editor se los manda. Aquí viven la ruta, los canales y la revisión de lo que viaja. */
import type { Tema } from './ajustes'
import { validarAnalisis, type AnalisisDoc } from './analisis/config'
import type { ResultadoMapeado } from './analisis/resultados'

export const RUTA_GRAFICAS = '#graficas'

/** Argumento con que el proceso principal abre la ventana de gráficas: el preload expone solo `graficas` (nada de ngspice ni de archivos). */
export const ARG_SOLO_GRAFICAS = '--kirchi-solo-graficas'

export const CANALES_GRAFICAS = {
  /** Del editor al proceso principal: abre la ventana de gráficas o, si ya está abierta, le manda los datos nuevos. */
  abrir: 'graficas:abrir',
  /** Del editor al proceso principal: manda datos nuevos solo si la ventana ya está abierta (no la crea ni la enfoca). */
  actualizar: 'graficas:actualizar',
  /** De la ventana de gráficas al proceso principal: pide los datos que le tocan. */
  pedir: 'graficas:pedir',
  /** Del proceso principal a la ventana de gráficas: datos nuevos. */
  datos: 'graficas:datos',
  /** De la ventana de gráficas al editor (por el proceso principal): quiere exportar una gráfica. */
  exportar: 'graficas:exportar',
  alExportar: 'graficas:al-exportar',
  /** De la ventana de gráficas: «Acoplar». El proceso principal la cierra y el editor trae la corrida a su franja. */
  acoplar: 'graficas:acoplar',
  alAcoplar: 'graficas:al-acoplar'
} as const

/** Lo que la ventana de gráficas le pide al editor al exportar: qué corrida, con la vista que tiene. */
export interface PedidoExportar {
  n: number
  /** Trazas apagadas por el lector. */
  ocultas: string[]
}

export interface CorridaTransferida {
  n: number
  nombre: string
  analisis: AnalisisDoc
  mapeado: ResultadoMapeado
}

export interface DatosGraficas {
  corridas: CorridaTransferida[]
  elegida: number | null
  tema: Tema
  /** Nombre del documento, para el título de la ventana. */
  archivo: string
}

export const MAX_CORRIDAS_TRANSFERIDAS = 20
/** Tope de números que viajan (8 bytes cada uno): una corrida llena de 5 millones de puntos ya es el tope del análisis. */
export const MAX_NUMEROS_TRANSFERIDOS = 40_000_000
/** Puntos de un eje, series por corrida y corridas de un barrido que pueden viajar. */
export const MAX_PUNTOS_TRANSFERIDOS = 5_000_000
export const MAX_SERIES = 512
export const MAX_SUBCORRIDAS = 512

/** La ruta de la ventana de gráficas a partir de la URL de la interfaz (sin ruta previa). */
export function urlDeGraficas(base: string): string {
  const sinRuta = base.replace(/#.*$/, '')
  return `${sinRuta}${RUTA_GRAFICAS}`
}

export const esRutaGraficas = (hash: string | undefined | null): boolean => hash === RUTA_GRAFICAS

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const esF64 = (x: unknown): x is Float64Array => x instanceof Float64Array

/** Revisa lo que llega por el IPC (la interfaz lo manda, pero el proceso principal no confía en la forma). Devuelve una copia limpia o null. */
export function validarDatosGraficas(x: unknown): DatosGraficas | null {
  if (!esObjeto(x) || !Array.isArray(x.corridas) || x.corridas.length > MAX_CORRIDAS_TRANSFERIDAS) return null
  if (x.tema !== 'claro' && x.tema !== 'oscuro') return null
  let numeros = 0
  const corridas: CorridaTransferida[] = []
  for (const c of x.corridas) {
    if (!esObjeto(c) || typeof c.n !== 'number' || !Number.isInteger(c.n) || c.n < 0 || typeof c.nombre !== 'string') return null
    const a = validarAnalisis(c.analisis)
    if (!a.ok) return null
    const m = c.mapeado
    if (!esObjeto(m) || !Array.isArray(m.corridas) || m.corridas.length > MAX_SUBCORRIDAS || typeof m.tipo !== 'string' || typeof m.ejeNombre !== 'string' || typeof m.ejeUnidad !== 'string' || typeof m.logX !== 'boolean') return null
    for (const k of m.corridas) {
      if (!esObjeto(k) || typeof k.etiqueta !== 'string' || !esF64(k.eje) || !Array.isArray(k.series) || k.series.length > MAX_SERIES) return null
      if (k.eje.length > MAX_PUNTOS_TRANSFERIDOS) return null
      numeros += k.eje.length
      for (const s of k.series) {
        if (!esObjeto(s) || typeof s.etiqueta !== 'string' || typeof s.unidad !== 'string' || !esF64(s.valores) || (s.fase !== undefined && !esF64(s.fase))) return null
        // Una serie con otra longitud que su eje rompería el dibujo y la tabla.
        if (s.valores.length !== k.eje.length || (esF64(s.fase) && s.fase.length !== k.eje.length)) return null
        numeros += s.valores.length + (esF64(s.fase) ? s.fase.length : 0)
      }
      if (k.fourier !== undefined && (!Array.isArray(k.fourier) || k.fourier.length > MAX_SERIES)) return null
    }
    if (numeros > MAX_NUMEROS_TRANSFERIDOS) return null
    corridas.push({ n: c.n, nombre: c.nombre.slice(0, 200), analisis: a.valor, mapeado: m as unknown as ResultadoMapeado })
  }
  const elegida = typeof x.elegida === 'number' && Number.isInteger(x.elegida) ? x.elegida : null
  return { corridas, elegida, tema: x.tema, archivo: typeof x.archivo === 'string' ? x.archivo.slice(0, 200) : '' }
}

/** «Acoplar»: qué corrida se veía en la ventana, para mostrarla en la franja. */
export function validarPedidoAcoplar(x: unknown): { n: number } | null {
  return esObjeto(x) && typeof x.n === 'number' && Number.isInteger(x.n) && x.n >= 0 ? { n: x.n } : null
}

export function validarPedidoExportar(x: unknown): PedidoExportar | null {
  if (!esObjeto(x) || typeof x.n !== 'number' || !Number.isInteger(x.n)) return null
  const ocultas = Array.isArray(x.ocultas) ? x.ocultas.filter((o): o is string => typeof o === 'string').slice(0, 200) : []
  return { n: x.n, ocultas }
}

/** Lo que el preload expone de las gráficas aparte (en `window.kirchi.graficas`). */
export interface ApiGraficas {
  /** Abre la ventana de gráficas o, si ya está abierta, le manda estos datos. */
  abrir(datos: DatosGraficas): Promise<boolean>
  /** Manda datos nuevos solo si la ventana está abierta, sin crearla ni enfocarla; falso si no hay ventana. */
  actualizar(datos: DatosGraficas): Promise<boolean>
  /** La ventana de gráficas pide sus datos al arrancar. */
  pedir(): Promise<DatosGraficas | null>
  /** La ventana de gráficas escucha los datos nuevos; devuelve cómo dejar de escuchar. */
  alDatos(f: (d: DatosGraficas) => void): () => void
  /** La ventana de gráficas le pide al editor exportar una corrida. */
  exportar(p: PedidoExportar): void
  /** El editor escucha esos pedidos; devuelve cómo dejar de escuchar. */
  alExportar(f: (p: PedidoExportar) => void): () => void
  /** La ventana de gráficas se acopla: se cierra y la corrida que se veía vuelve a la franja del editor. */
  acoplar(n: number): void
  /** El editor escucha el acople; devuelve cómo dejar de escuchar. */
  alAcoplar(f: (n: number) => void): () => void
}
