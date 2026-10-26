import { CANALES, MATEMATICO, type AjustesOsciloscopio, type CanalOMatematico } from '../../instrumentos/ajustes'
import { CANALES_PANTALLA, CIFRAS_COLUMNA, MUESTRAS_CSV, type PantallaSab } from '../../sim/protocoloInstrumentos'
import { formatearMedida, formatearValor } from '../../valores/valores'
import { medidaDePantalla, NOMBRE_MEDIDA, textoMedida } from './medidasVista'
import { rangoEfectivo, type RangoExportar } from '../exportar/rango'
import { ejeDeCaptura, referenciaDelTiempo } from './recorte'
import { valorDeColumnas } from './tabla'

const MODOS: Readonly<Record<AjustesOsciloscopio['disparo']['modo'], string>> = { auto: 'Automático', normal: 'Normal', unico: 'Único', rodante: 'Rodante' }

interface CanalCaptura {
  id: CanalOMatematico
  /** Su bloque en la pantalla (A a D y A − B). */
  i: number
  nombre: string
}

const canalesDe = (a: AjustesOsciloscopio): CanalCaptura[] => {
  const c: CanalCaptura[] = a.canales.flatMap((x, i) => (x.on ? [{ id: x.canal, i, nombre: x.canal }] : []))
  if (a.matematico) c.push({ id: MATEMATICO, i: CANALES.length, nombre: 'A − B' })
  return c
}
const escalaDe = (a: AjustesOsciloscopio, c: CanalCaptura) => {
  const k = a.canales[c.i]
  return k ? `${formatearValor(k.vdiv, 'V')}/div ${k.acople}` : `${formatearValor(a.canales[0].vdiv, 'V')}/div`
}
const disparoDe = (a: AjustesOsciloscopio) => `${a.disparo.fuente}; ${a.disparo.subida ? 'subida' : 'bajada'}; ${formatearMedida(a.disparo.nivel, 'V')}; ${MODOS[a.disparo.modo]}`

/**
 * Celda de texto del CSV a salvo de hojas de cálculo (OWASP, inyección de fórmulas): lo que empieza con =, +, −, @, tabulador o retorno lleva comilla simple delante. Con comas, comillas o saltos va entre comillas dobles (RFC 4180). Los números no pasan por aquí.
 */
export function celdaDeTexto(texto: string): string {
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto
  return /[",\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}

const BANDERA_VACIA = 8

/** Un renglón de comentario del CSV: empieza con # o, si la referencia llevaba coma y quedó entre comillas, con \"#. */
export const esComentarioCsv = (linea: string): boolean => linea.startsWith('#') || linea.startsWith('"#')

/** Un tramo de columnas vacías entre dos con dato de un canal (tiempo simulado, `ini` incluido y `fin` excluido). */
interface Hueco {
  canal: CanalCaptura
  ini: number
  fin: number
}

/**
 * Tramo con dato en todos los canales con alguno (primera a última columna no vacía). Las columnas vacías entre dos con dato salen en `huecos`. Un canal sin datos no cuenta.
 */
function tramoConDato(p: PantallaSab, canales: readonly CanalCaptura[]): { ini: number; fin: number; sinDato: CanalCaptura[]; huecos: Hueco[] } | null {
  const sinDato: CanalCaptura[] = []
  const huecos: Hueco[] = []
  let ini = Number.NEGATIVE_INFINITY
  let fin = Number.POSITIVE_INFINITY
  let alguno = false
  if (p.ncol > 0 && p.dt > 0 && Number.isFinite(p.t0)) {
    for (const c of canales) {
      let j0 = -1
      let j1 = -1
      for (let j = 0; j < p.ncol; j++) {
        if (p.columnas[(c.i * p.ncol + j) * CIFRAS_COLUMNA + 4] & BANDERA_VACIA) continue
        if (j0 < 0) j0 = j
        j1 = j
      }
      if (j0 < 0) {
        sinDato.push(c)
        continue
      }
      alguno = true
      for (let j = j0; j <= j1; j++) {
        if (!(p.columnas[(c.i * p.ncol + j) * CIFRAS_COLUMNA + 4] & BANDERA_VACIA)) continue
        let k = j
        while (k <= j1 && p.columnas[(c.i * p.ncol + k) * CIFRAS_COLUMNA + 4] & BANDERA_VACIA) k++
        huecos.push({ canal: c, ini: p.t0 + j * p.dt, fin: p.t0 + k * p.dt })
        j = k
      }
      ini = Math.max(ini, p.t0 + j0 * p.dt)
      fin = Math.min(fin, p.t0 + (j1 + 1) * p.dt)
    }
  }
  return alguno && fin > ini ? { ini, fin, sinDato, huecos } : null
}

/**
 * Lo que abarca el dato real de la captura en el eje de la figura. Fuera de ahí el recorte no se ofrece. Null sin datos.
 */
export function dominioConDato(a: AjustesOsciloscopio, p: PantallaSab): { min: number; max: number } | null {
  const t = tramoConDato(p, canalesDe(a))
  if (!t) return null
  const ref = referenciaDelTiempo(p)
  return { min: t.ini - ref, max: t.fin - ref }
}

/**
 * Con las columnas finas (`fino`), las muestras del CSV son la primera cifra de cada una a resolución plena, no 2,001 instantes de toda la captura. Una fina vacía va como NaN.
 */
function conMuestrasFinas(p: PantallaSab): PantallaSab {
  const f = p.fino
  if (!f || f.n < 2 || !(f.dt > 0)) return p
  const muestras = new Float32Array(CANALES_PANTALLA * f.n)
  for (let c = 0; c < CANALES_PANTALLA; c++)
    for (let j = 0; j < f.n; j++) {
      const q = (c * f.n + j) * CIFRAS_COLUMNA
      muestras[c * f.n + j] = f.columnas[q + 4] & BANDERA_VACIA ? Number.NaN : f.columnas[q + 2]
    }
  return { ...p, csv: { t0: f.t0, dt: f.dt, n: f.n }, muestras }
}

/**
 * CSV de una captura: comentarios con los ajustes, nombres y un renglón por instante (hasta 2,001). Punto decimal, coma de separador. El tiempo parte de 0 en el primer instante con dato de todos los canales y un comentario dice a qué tiempo simulado equivale. Un canal sin datos va con su columna vacía y su razón.
 */
export function csvDeCaptura(ref: string, a: AjustesOsciloscopio, p0: PantallaSab, rango?: RangoExportar | null): string {
  const p = conMuestrasFinas(p0)
  const paso = p.muestras.length / CANALES_PANTALLA
  const canales = canalesDe(a)
  const conMuestras = p.csv.n > 0
  const tramo = tramoConDato(p, canales)
  // El recorte se cuenta en el eje de la figura (desde el disparo, si lo hay): sus instantes se pasan al tiempo simulado.
  const recorte = rangoEfectivo(rango, ejeDeCaptura(a, p))
  const refT = referenciaDelTiempo(p)
  const n = conMuestras ? p.csv.n : MUESTRAS_CSV
  const t0 = conMuestras ? p.csv.t0 : p.t0
  const dt = conMuestras ? p.csv.dt : (p.ncol * p.dt) / (MUESTRAS_CSV - 1)
  const cabecera = [`# Kirchi · osciloscopio ${ref}`, `# Base de tiempo: ${formatearValor(a.base, 's')}/div; disparo: ${disparoDe(a)}`, `# ${canales.map((c) => `${c.nombre}: ${escalaDe(a, c)}`).join('; ')}`]
  const filas: string[] = []
  let deColumnas = false
  let origen = Number.NaN
  if (tramo && Number.isFinite(t0) && dt > 0) {
    // La tolerancia de una millonésima de intervalo: el borde de una columna no deja fuera a la muestra que cae sobre él.
    const tol = dt * 1e-6
    for (let k = 0; k < n; k++) {
      const t = t0 + k * dt
      if (t < tramo.ini - tol || t > tramo.fin + tol) continue
      if (recorte && (t - refT < recorte.min - tol || t - refT > recorte.max + tol)) continue
      if (Number.isNaN(origen)) origen = t
      const celdas = [String(Number((t - origen).toPrecision(10)))]
      for (const c of canales) {
        if (tramo.sinDato.includes(c)) {
          celdas.push('')
          continue
        }
        // Un hueco interior va vacío aunque el búfer de muestras tenga algo ahí: la pantalla no tuvo dato en ese tramo.
        if (tramo.huecos.some((h) => h.canal === c && t >= h.ini - tol && t < h.fin - tol)) {
          celdas.push('')
          continue
        }
        let v = conMuestras ? p.muestras[c.i * paso + k] : Number.NaN
        if (!Number.isFinite(v)) {
          v = valorDeColumnas(p, c.i, t)
          if (conMuestras && Number.isFinite(v)) deColumnas = true
        }
        celdas.push(Number.isFinite(v) ? String(Number(v.toPrecision(7))) : '')
      }
      filas.push(celdas.join(','))
    }
  }
  if (filas.length) {
    cabecera.push(`# Captura a t = ${formatearMedida(p.tCaptura, 's', 4)}; ${filas.length} instantes cada ${formatearMedida(dt, 's', 4)}`)
    cabecera.push(`# t = 0 es el inicio ${recorte ? 'del tramo exportado' : 'de la captura'} (t simulado = ${formatearMedida(origen, 's', 4)}).`)
    if (recorte) cabecera.push(`# Tramo exportado: de ${formatearMedida(recorte.min, 's', 4)} a ${formatearMedida(recorte.max, 's', 4)} en el eje del tiempo de la figura${Number.isFinite(p.tDisparo) ? ' (desde el disparo)' : ''}.`)
  } else cabecera.push('# Sin captura: la pantalla todavía no tiene datos de todos los canales encendidos.')
  for (const c of tramo?.sinDato ?? []) cabecera.push(`# ${c.nombre}: sin datos en esta captura (su entrada no tiene cable o aún no hay lectura); su columna va vacía.`)
  for (const h of tramo?.huecos ?? []) {
    if (!filas.length) break
    cabecera.push(`# ${h.canal.nombre}: sin datos de t = ${formatearMedida(Math.max(h.ini, origen) - origen, 's', 4)} a ${formatearMedida(h.fin - origen, 's', 4)} (hueco en la captura); sus celdas van vacías.`)
  }
  if (deColumnas)
    cabecera.push(
      conMuestras
        ? '# Algunos valores salen de las columnas de la pantalla: el búfer de muestras no cubría esos instantes.'
        : '# Los valores salen de las columnas de la pantalla: la captura no trae sus muestras.'
    )
  else if (!conMuestras && filas.length) cabecera.push('# Los valores salen de las columnas de la pantalla: la captura no trae sus muestras.')
  // La cabecera es texto (cada renglón de comentario es una sola celda, con la referencia que escribió el usuario); las filas
  // de datos son números escritos por el formateador de números.
  const nombres = ['t (s)', ...canales.map((c) => `${c.nombre} (V)`)].map(celdaDeTexto).join(',')
  return `${[...cabecera.map(celdaDeTexto), nombres, ...filas].join('\n')}\n`
}

/** Un pedazo de texto de la leyenda del PNG; con `canal`, en el color de ese canal. */
export interface TrozoLeyenda {
  texto: string
  canal?: CanalOMatematico
}

/** Los cuatro renglones de la leyenda del PNG: ajustes, escala de cada canal, medidas a la vista y el tiempo de la captura. */
export function lineasDeCaptura(ref: string, a: AjustesOsciloscopio, p: PantallaSab, rango?: RangoExportar | null): TrozoLeyenda[][] {
  const recorte = rangoEfectivo(rango, ejeDeCaptura(a, p))
  const canales = canalesDe(a)
  const escalas: TrozoLeyenda[] = canales.flatMap((c, n) => [...(n ? [{ texto: '   ' }] : []), { texto: c.nombre, canal: c.id }, { texto: ` ${escalaDe(a, c)}` }])
  const medidas: TrozoLeyenda[] = a.medidas.flatMap((m, n) => [
    ...(n ? [{ texto: '   ' }] : []),
    { texto: m.canal === MATEMATICO ? 'A − B' : m.canal, canal: m.canal },
    { texto: ` ${NOMBRE_MEDIDA[m.medida]} ${textoMedida(m.medida, medidaDePantalla(p, m)).texto}` }
  ])
  return [
    [{ texto: `${ref} · ${formatearValor(a.base, 's')}/div · disparo ${disparoDe(a).replace(/; /g, ' ').replace(/ (Automático|Normal|Único|Rodante)$/, ' · $1')}` }],
    escalas,
    medidas.length ? medidas : [{ texto: 'Sin medidas a la vista' }],
    [{ texto: `Captura a t = ${formatearMedida(p.tCaptura, 's', 4)}${recorte ? ` · tramo de ${formatearMedida(recorte.min, 's', 4)} a ${formatearMedida(recorte.max, 's', 4)}` : ''}` }]
  ]
}
