import datos from '../../../../componentes/familias-logicas.json'

/** Familias lógicas: sus parámetros viven en `componentes/familias-logicas.json` (editable sin programar). Aquí se validan
 * y convierten a parámetros XSPICE del motor (`in_low`, `rise_delay`…). Es el único lugar donde se calculan: compuertas,
 * biestables, contador y decodificador los toman de aquí. */

/** Datos típicos de la hoja de datos a una alimentación: retardos de propagación, tiempos de transición y resistencias de salida. */
export interface PuntoFamilia {
  vcc: number
  tplh: number
  tphl: number
  t_rise: number
  t_fall: number
  r_lo: number
  r_hi: number
}

export interface Familia {
  nombre: string
  fuente: string
  alimentacion: { min: number; max: number; omision: number }
  /** Umbrales de entrada; con `relativa`, fracciones de la alimentación. Una entrada al aire se lee X o 1. Con `r_in`, la entrada toma corriente (74LS). */
  entrada: { vil: number; vih: number; relativa: boolean; al_aire: 'X' | '1'; r_in?: number; v_in?: number }
  /** Niveles de salida sin carga; con `relativa`, fracciones de la alimentación. */
  salida: { vol: number; voh: number; relativa: boolean }
  /** De menor a mayor alimentación; entre dos puntos se interpola en línea recta y fuera de ellos se toma el más cercano. */
  puntos: PuntoFamilia[]
}

export interface Familias {
  omision: string
  familias: Record<string, Familia>
}

/** Lo que lee el motor de una pieza digital: los parámetros de XSPICE de su familia a su alimentación. */
export interface ParametrosLogicos {
  in_low: number
  in_high: number
  v_lo: number
  v_hi: number
  r_lo: number
  r_hi: number
  /** Retardo hasta el principio de la rampa de salida: el de propagación (medido a la mitad) menos media transición. */
  rise_delay: number
  fall_delay: number
  t_rise: number
  t_fall: number
  z_como: 'x' | 'uno'
  r_in?: number
  v_in?: number
}

const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const esObjeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Distancia de edición entre dos nombres de campo, con transposiciones (para sugerir el que se quiso escribir). */
function distancia(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      // Dos letras cambiadas de lugar («vhi» por «vih») cuentan como un error, no como dos.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  return d[a.length][b.length]
}

/** Los campos que admite cada parte del archivo: uno desconocido (una errata) se rechaza con la sugerencia más cercana. */
const CAMPOS = {
  raiz: ['nota', 'omision', 'familias'],
  familia: ['nombre', 'fuente', 'nota', 'alimentacion', 'entrada', 'salida', 'puntos'],
  alimentacion: ['min', 'max', 'omision'],
  entrada: ['vil', 'vih', 'relativa', 'al_aire', 'r_in', 'v_in'],
  salida: ['vol', 'voh', 'relativa'],
  punto: ['vcc', 'tplh', 'tphl', 't_rise', 't_fall', 'r_lo', 'r_hi']
} as const

/** Revisa el archivo de familias; cada error dice el campo, como los de `pieza.json`. */
export function validarFamilias(json: unknown): { ok: true; familias: Familias } | { ok: false; errores: string[] } {
  const errores: string[] = []
  const err = (campo: string, texto: string) => errores.push(`familias-logicas.json: ${campo} ${texto}`)
  const llaves = (o: unknown, permitidas: readonly string[], campo: string) => {
    if (!esObjeto(o)) return
    for (const k of Object.keys(o)) {
      if (permitidas.includes(k)) continue
      const cerca = permitidas.map((p) => [p, distancia(k, p)] as const).sort((a, b) => a[1] - b[1])[0]
      err(campo ? `${campo}.${k}` : k, `no es un campo conocido${cerca && cerca[1] <= 2 ? ` (¿${cerca[0]}?)` : ''}`)
    }
  }
  if (!esObjeto(json) || !esObjeto(json.familias)) return { ok: false, errores: ['familias-logicas.json: debe tener «familias»'] }
  llaves(json, CAMPOS.raiz, '')
  const familias = json.familias as Record<string, unknown>
  if (typeof json.omision !== 'string' || !Object.hasOwn(familias, json.omision)) err('omision', 'debe ser el nombre de una familia')
  for (const [id, f] of Object.entries(familias)) {
    const c = `familias.${id}`
    if (!esObjeto(f)) {
      err(c, 'debe ser un objeto')
      continue
    }
    llaves(f, CAMPOS.familia, c)
    llaves(f.alimentacion, CAMPOS.alimentacion, `${c}.alimentacion`)
    llaves(f.entrada, CAMPOS.entrada, `${c}.entrada`)
    llaves(f.salida, CAMPOS.salida, `${c}.salida`)
    if (Array.isArray(f.puntos)) f.puntos.forEach((p: unknown, k: number) => llaves(p, CAMPOS.punto, `${c}.puntos[${k}]`))
    if (typeof f.nombre !== 'string' || !f.nombre) err(`${c}.nombre`, 'falta')
    const a = f.alimentacion as Record<string, unknown> | undefined
    if (!esObjeto(a) || !esNumero(a.min) || !esNumero(a.max) || !esNumero(a.omision) || !(a.min > 0 && a.min <= a.omision && a.omision <= a.max && a.max <= 100)) {
      err(`${c}.alimentacion`, 'debe tener min, omision y max positivos y en ese orden (hasta 100 V)')
    }
    const e = f.entrada as Record<string, unknown> | undefined
    if (!esObjeto(e) || !esNumero(e.vil) || !esNumero(e.vih) || typeof e.relativa !== 'boolean' || !(e.vil <= e.vih) || (e.al_aire !== 'X' && e.al_aire !== '1')) {
      err(`${c}.entrada`, 'debe tener vil y vih (vil hasta vih), relativa y al_aire («X» o «1»)')
    } else if ((e.r_in !== undefined && !(esNumero(e.r_in) && e.r_in > 0)) || (e.v_in !== undefined && !esNumero(e.v_in))) {
      err(`${c}.entrada`, 'r_in debe ser positiva y v_in un número')
    } else if (e.v_in !== undefined && e.r_in === undefined) {
      // Un voltaje interno sin su resistencia no carga la red: sería un dato que no hace nada.
      err(`${c}.entrada`, 'v_in necesita r_in')
    } else if (e.relativa === true && !(e.vil >= 0 && e.vih <= 1)) {
      err(`${c}.entrada`, 'con relativa: true lleva vil y vih entre 0 y 1')
    }
    const s = f.salida as Record<string, unknown> | undefined
    if (!esObjeto(s) || !esNumero(s.vol) || !esNumero(s.voh) || typeof s.relativa !== 'boolean' || !(s.vol < s.voh)) err(`${c}.salida`, 'debe tener vol menor que voh y relativa')
    else if (s.relativa === true && !(s.vol >= 0 && s.voh <= 1)) err(`${c}.salida`, 'con relativa: true lleva vol y voh entre 0 y 1')
    const puntos = f.puntos
    if (!Array.isArray(puntos) || puntos.length === 0) err(`${c}.puntos`, 'debe tener al menos un punto')
    else
      puntos.forEach((p: unknown, k: number) => {
        const campos = ['vcc', 'tplh', 'tphl', 't_rise', 't_fall', 'r_lo', 'r_hi'] as const
        if (!esObjeto(p) || !campos.every((n) => esNumero(p[n]) && (p[n] as number) > 0)) err(`${c}.puntos[${k}]`, `debe tener ${campos.join(', ')} positivos`)
        else if (k > 0 && !((p.vcc as number) > (puntos[k - 1] as PuntoFamilia).vcc)) err(`${c}.puntos[${k}].vcc`, 'debe crecer de un punto al siguiente')
      })
  }
  return errores.length ? { ok: false, errores } : { ok: true, familias: json as unknown as Familias }
}

const leidas = validarFamilias(datos)
/** Los errores del archivo incluido (la prueba de la librería exige que no haya). */
export const ERRORES_FAMILIAS: string[] = leidas.ok ? [] : leidas.errores
/** Las familias del archivo incluido; si el archivo tiene errores, ninguna (las piezas digitales no simulan y el error lo dice). */
export const FAMILIAS: Familias = leidas.ok ? leidas.familias : { omision: '', familias: {} }

/** Interpolación en línea recta entre los dos puntos que rodean a `vcc`; fuera del intervalo, el punto más cercano. */
function interpolar(puntos: PuntoFamilia[], vcc: number): PuntoFamilia {
  if (vcc <= puntos[0].vcc) return puntos[0]
  const ultimo = puntos[puntos.length - 1]
  if (vcc >= ultimo.vcc) return ultimo
  const k = puntos.findIndex((p) => p.vcc > vcc)
  const [a, b] = [puntos[k - 1], puntos[k]]
  const x = (vcc - a.vcc) / (b.vcc - a.vcc)
  const m = (u: number, v: number) => u + (v - u) * x
  return { vcc, tplh: m(a.tplh, b.tplh), tphl: m(a.tphl, b.tphl), t_rise: m(a.t_rise, b.t_rise), t_fall: m(a.t_fall, b.t_fall), r_lo: m(a.r_lo, b.r_lo), r_hi: m(a.r_hi, b.r_hi) }
}

/** Retardo mínimo del motor (1 ps): un retardo de propagación más corto que media transición no lo deja en cero. */
const RETARDO_MIN = 1e-12

/** Los parámetros del motor de la familia `f` a la alimentación `vcc` (V). */
export function parametrosDeFamilia(f: Familia, vcc: number): ParametrosLogicos {
  const p = interpolar(f.puntos, vcc)
  const ent = (v: number) => (f.entrada.relativa ? v * vcc : v)
  const sal = (v: number) => (f.salida.relativa ? v * vcc : v)
  return {
    in_low: ent(f.entrada.vil),
    in_high: ent(f.entrada.vih),
    v_lo: sal(f.salida.vol),
    v_hi: sal(f.salida.voh),
    r_lo: p.r_lo,
    r_hi: p.r_hi,
    rise_delay: Math.max(RETARDO_MIN, p.tplh - p.t_rise / 2),
    fall_delay: Math.max(RETARDO_MIN, p.tphl - p.t_fall / 2),
    t_rise: p.t_rise,
    t_fall: p.t_fall,
    z_como: f.entrada.al_aire === '1' ? 'uno' : 'x',
    ...(f.entrada.r_in !== undefined ? { r_in: f.entrada.r_in, v_in: f.entrada.v_in ?? 0 } : {})
  }
}
