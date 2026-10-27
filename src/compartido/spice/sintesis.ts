/**
 * Síntesis en XSPICE digital de los elementos genéricos `LUT` y `MSI`. La comparten el exportador y `scripts/referencias-ngspice.mjs`
 * (renglones `*@generar lut|msi <prefijo> {json}`), para que los análisis y las referencias del motor usen el mismo texto.
 * Sin importaciones de valores y solo con sintaxis que Node borra al leer, para que el script la cargue directo.
 *
 * Una tabla de verdad es un `d_genlut` con las entradas en orden inverso (la primera entrada del índice del motor es el bit más
 * significativo y la primera de `d_genlut` el menos). Un valor X de la tabla se lee 0: XSPICE no distingue «no importa», y una
 * entrada desconocida vuelve desconocidas todas las salidas de su tabla, así que cada salida lee solo lo que la cambia.
 * Un contador o un desplazamiento es un `d_dff` por bit con su siguiente estado en una `d_genlut`; los retardos del chip se
 * restan de la salida para que el camino del reloj a cada salida sume lo mismo que el motor.
 */

import type { FuenteMsi, NucleoMsi, RelojMsi, SalidaMsi, SenalMsi } from '../netlistMotor'

export interface Sintesis {
  modelos: string[]
  lineas: string[]
}

export interface ParamsLut {
  /** Redes de las entradas comunes y de cada rebanada, con la primera entrada como bit más significativo del índice. */
  comunes: string[]
  rebanadas: { entradas: string[]; salidas: string[] }[]
  /** Filas de la tabla: dos bits por salida de rebanada (0, 1, Z = 2, X = 3), la primera salida en los bits bajos. */
  tabla: (number | string)[]
  /** `[subida, bajada]` en segundos por salida de rebanada. */
  retardos: [number, number][]
  abierta?: boolean[]
}

export interface ParamsMsi {
  entradas: string[]
  salidas: string[]
  nucleo: NucleoMsi
  de: SalidaMsi[]
  fuentes?: FuenteMsi[]
  tabla?: (number | string)[]
  retardos: [number, number][]
  abierta?: boolean[]
  /** Solo para aproximaciones: el código que quedan fijas las salidas (ngspice no simula la conversión). Sin él, 0 y sin fin de conversión. */
  codigo?: number
}

const UN_PS = 1e-12
/** Las fuentes de una tabla de salida y las entradas de una de rebanada: a lo más 14 bits de índice, como en el motor. */
const BITS_MAX = 14

const numero = (v: number): string => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('Un parámetro de la síntesis no es un número finito.')
  return Object.is(v, -0) ? '0' : String(v)
}
const vector = (xs: number[]): string => `[${xs.map(numero).join(' ')}]`

/** Un retardo de elemento menos lo que ya suman las etapas anteriores (en picosegundos), con 1 ps como mínimo. */
const menos = (d: number, ps: number): number => Math.max(UN_PS, d - ps * UN_PS)

function filasDe(tabla: (number | string)[], largo: number): bigint[] {
  if (!Array.isArray(tabla) || tabla.length !== largo) throw new Error(`La tabla debe tener ${largo} filas.`)
  return tabla.map((f) => {
    const valida = typeof f === 'number' ? Number.isSafeInteger(f) && f >= 0 : typeof f === 'string' && /^[0-9]{1,20}$/.test(f)
    if (!valida) throw new Error('Una fila de la tabla no es un entero no negativo.')
    return BigInt(f)
  })
}

const nivelDe = (fila: bigint, columna: number): number => Number((fila >> BigInt(2 * columna)) & 3n)

function listaDeRedes(v: unknown, que: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || x.length === 0)) throw new Error(`${que} debe ser una lista de redes.`)
  return v as string[]
}

function retardosDe(v: unknown, n: number): [number, number][] {
  if (!Array.isArray(v) || v.length !== n) throw new Error(`Debe haber un retardo por cada una de las ${n} salidas.`)
  return v.map((r) => {
    if (!Array.isArray(r) || r.length !== 2 || !(r[0] > 0) || !(r[1] > 0) || !Number.isFinite(r[0]) || !Number.isFinite(r[1])) throw new Error('Un retardo debe ser [subida, bajada] positivos y finitos.')
    return [r[0], r[1]] as [number, number]
  })
}

/** El armador de celdas de una síntesis: nombres propios con el prefijo `p`, modelos sin repetir y la profundidad en ps de cada red. */
function armador(p: string) {
  const modelos: string[] = []
  const lineas: string[] = []
  const hechos = new Map<string, string>()
  const profundidad = new Map<string, number>()
  const inversores = new Map<string, string>()
  const constantes = new Map<number, string>()
  let redes = 0
  let celdas = 0

  const red = (): string => `${p}n${redes++}`
  const modelo = (definicion: string): string => {
    let nombre = hechos.get(definicion)
    if (!nombre) {
      nombre = `${p}m${hechos.size}`
      hechos.set(definicion, nombre)
      modelos.push(`.model ${nombre} ${definicion}`)
    }
    return nombre
  }
  const celda = (conexiones: string, m: string): void => {
    lineas.push(`a${p}c${celdas++} ${conexiones} ${m}`)
  }
  const prof = (n: string): number => profundidad.get(n) ?? 0
  const marca = (n: string, ps: number): string => {
    profundidad.set(n, ps)
    return n
  }

  const constante = (v: 0 | 1): string => {
    let n = constantes.get(v)
    if (!n) {
      n = red()
      constantes.set(v, n)
      celda(n, modelo(v === 1 ? 'd_pullup(load=1e-12)' : 'd_pulldown(load=1e-12)'))
    }
    return n
  }
  const inv = (x: string): string => {
    let n = inversores.get(x)
    if (!n) {
      n = marca(red(), prof(x) + 1)
      inversores.set(x, n)
      celda(`${x} ${n}`, modelo('d_inverter(rise_delay=1e-12 fall_delay=1e-12)'))
    }
    return n
  }
  const puerta = (clase: 'd_and' | 'd_or', ins: string[]): string => {
    if (ins.length === 1) return ins[0]
    const n = marca(red(), Math.max(...ins.map(prof)) + 1)
    celda(`[${ins.join(' ')}] ${n}`, modelo(`${clase}(rise_delay=1e-12 fall_delay=1e-12 inertial_delay=true)`))
    return n
  }
  /** Una `d_genlut`: `columnas[j]` es la tabla de la salida `j` (una cifra 0 o 1 por combinación, la primera entrada es el bit bajo). */
  const genlut = (entradas: string[], columnas: string[], salidas: string[], subida: number[], bajada: number[]): void => {
    if (entradas.length < 1 || entradas.length > BITS_MAX) throw new Error(`Una tabla admite de 1 a ${BITS_MAX} entradas.`)
    const def = `d_genlut(rise_delay=${vector(subida)} fall_delay=${vector(bajada)} input_delay=${vector(entradas.map(() => UN_PS))} table_values "${columnas.join('')}")`
    const salida = `[${salidas.join(' ')}]`
    celda(`[${entradas.join(' ')}] ${salida}`, modelo(def))
    for (const s of salidas) profundidad.set(s, Math.max(...entradas.map(prof)) + 2)
  }
  /** Una lógica pequeña de 1 ps: las salidas valen `f(índice)` de cada combinación de las entradas (la primera es el bit bajo). */
  const logica = (entradas: string[], salidas: string[], f: (indice: number) => number[]): void => {
    const columnas = salidas.map(() => '')
    for (let i = 0; i < 1 << entradas.length; i++) f(i).forEach((v, j) => (columnas[j] += v ? '1' : '0'))
    genlut(entradas, columnas, salidas, salidas.map(() => UN_PS), salidas.map(() => UN_PS))
  }
  const biestable = (d: string, clk: string, set: string, reset: string, q: string, qn: string): void => {
    celda(`${d} ${clk} ${set} ${reset} ${q} ${qn}`, modelo('d_dff(clk_delay=1e-12 set_delay=1e-12 reset_delay=1e-12 rise_delay=1e-12 fall_delay=1e-12 ic=0)'))
    marca(q, prof(clk) + 2)
    marca(qn, prof(clk) + 2)
  }
  const tresEstados = (dato: string, habilita: string, salida: string): void => celda(`${dato} ${habilita} ${salida}`, modelo('d_tristate(delay=1e-12)'))
  const abiertoC = (entrada: string, salida: string, retardo: number): void =>
    celda(`${entrada} ${salida}`, modelo(`d_open_c(open_delay=${numero(retardo)} fall_delay=${numero(retardo)})`))
  const buffer = (entrada: string, salida: string, negada: boolean, subida: number, bajada: number): void =>
    celda(`${entrada} ${salida}`, modelo(`${negada ? 'd_inverter' : 'd_buffer'}(rise_delay=${numero(subida)} fall_delay=${numero(bajada)} inertial_delay=true)`))
  const latch = (s: string, r: string, q: string, nq: string): void =>
    celda(`${s} ${r} ${constante(1)} ${constante(0)} ${constante(0)} ${q} ${nq}`, modelo('d_srlatch(sr_delay=1e-12 enable_delay=1e-12 set_delay=1e-12 reset_delay=1e-12 rise_delay=1e-12 fall_delay=1e-12 ic=0)'))

  return { modelos, lineas, red, prof, marca, constante, inv, puerta, genlut, logica, biestable, tresEstados, abiertoC, buffer, latch }
}
type Armador = ReturnType<typeof armador>

interface EspecSalida {
  /** Columna de la tabla que da esta salida. */
  columna: number
  salida: string
  retardo: [number, number]
  abierta: boolean
  /** Picosegundos que el camino del reloj ya sumó antes de la tabla. */
  ps: number
}

/** Las entradas (posición en la lista, la primera es el bit bajo del índice) de las que depende `pide` sobre el nivel de la columna. */
function entradasQueImportan(filas: bigint[], columna: number, n: number, pide: (nivel: number) => boolean): number[] {
  const importan: number[] = []
  for (let b = 0; b < n; b++) {
    if (filas.some((fila, i) => pide(nivelDe(fila, columna)) !== pide(nivelDe(filas[i ^ (1 << b)], columna)))) importan.push(b)
  }
  return importan
}

/**
 * Las salidas de una tabla: por cada grupo de salidas que dependen de las mismas entradas, una `d_genlut` de 1 ps que solo lee
 * esas entradas (XSPICE da desconocidas todas las salidas si una entrada lo es, y el motor no: un lado de un transceptor en Z no
 * cambia las salidas que no dependen de él) y, detrás de cada columna, un búfer de retardo inercial con el retardo del chip (la
 * `d_genlut` no traga pulsos más cortos que su retardo y el motor sí). Una salida con Z en su columna pasa además por un
 * `d_tristate` con la habilitación en una segunda columna, y una abierta (el 1 pasa a Z) sin Z por un `d_open_c`. Una salida que
 * pasa a Z o sale de Z usa el retardo de subida, como en el motor.
 */
function tablaDeSalidas(a: Armador, entradas: string[], filas: bigint[], especs: EspecSalida[]): void {
  interface Columna {
    /** Si la columna vale 1 para ese nivel de la tabla (0, 1, Z o X). */
    valores: (nivel: number) => boolean
    columna: number
    destino: string
    subida: number
    bajada: number
  }
  const grupos = new Map<string, { importan: number[]; columnas: Columna[] }>()
  const despues: (() => void)[] = []
  const agregar = (importan: number[], c: Columna): void => {
    const clave = importan.join(',')
    const g = grupos.get(clave) ?? { importan, columnas: [] }
    g.columnas.push(c)
    grupos.set(clave, g)
  }
  for (const e of especs) {
    const [sub, baj] = e.retardo
    const conZ = filas.some((fila) => nivelDe(fila, e.columna) === 2)
    // La tabla y su búfer suman 3 ps antes del `d_tristate` o del `d_open_c` (1 ps cada uno) y 2 ps cuando no hay ninguno.
    const nuevo = (valores: (v: number) => boolean, destino: string, subida: number, bajada: number): void =>
      agregar(entradasQueImportan(filas, e.columna, entradas.length, valores), { valores, columna: e.columna, destino, subida, bajada })
    if (conZ) {
      // El dato (un 1 solo si no es abierta) y la habilitación (los 0 si es abierta, todo menos Z si no).
      const [dato, hab] = [a.red(), a.red()]
      nuevo((v) => v === 1 && !e.abierta, dato, menos(sub, e.ps + 3), menos(baj, e.ps + 3))
      nuevo((v) => (e.abierta ? v === 0 : v !== 2), hab, menos(sub, e.ps + 3), menos(sub, e.ps + 3))
      despues.push(() => a.tresEstados(dato, hab, e.salida))
    } else if (e.abierta) {
      const nivel = a.red()
      nuevo((v) => v === 1, nivel, menos(sub, e.ps + 3), menos(sub, e.ps + 3))
      despues.push(() => a.abiertoC(nivel, e.salida, UN_PS))
    } else {
      nuevo((v) => v === 1, e.salida, menos(sub, e.ps + 2), menos(baj, e.ps + 2))
    }
  }
  for (const { importan, columnas } of grupos.values()) {
    // Una columna constante lee una entrada cualquiera: la lista no puede quedar vacía.
    const ins = importan.length > 0 ? importan.map((b) => entradas[b]) : [a.constante(0)]
    const combinaciones = 1 << ins.length
    const texto = columnas.map((c) => {
      let t = ''
      for (let m = 0; m < combinaciones; m++) {
        let i = 0
        importan.forEach((b, r) => {
          if ((m >> r) & 1) i |= 1 << b
        })
        t += c.valores(nivelDe(filas[i], c.columna)) ? '1' : '0'
      }
      return t
    })
    const crudas = columnas.map(() => a.red())
    a.genlut(ins, texto, crudas, crudas.map(() => UN_PS), crudas.map(() => UN_PS))
    columnas.forEach((c, j) => despues.push(() => a.buffer(crudas[j], c.destino, false, c.subida, c.bajada)))
  }
  for (const d of despues) d()
}

/** `LUT`: una `d_genlut` por rebanada con las mismas tablas, retardos y colectores abiertos del motor. */
export function sintetizarLut(p: string, params: ParamsLut): Sintesis {
  const comunes = listaDeRedes(params.comunes, 'Las entradas comunes')
  if (!Array.isArray(params.rebanadas) || params.rebanadas.length === 0) throw new Error('Debe haber al menos una rebanada.')
  const ne = params.rebanadas[0].entradas.length
  const ns = params.rebanadas[0].salidas.length
  if (comunes.length + ne < 1 || comunes.length + ne > BITS_MAX) throw new Error(`Una tabla admite de 1 a ${BITS_MAX} bits de índice.`)
  if (ns < 1 || ns > 32) throw new Error('Una rebanada tiene de 1 a 32 salidas.')
  const filas = filasDe(params.tabla, 1 << (comunes.length + ne))
  const retardos = retardosDe(params.retardos, ns)
  const abierta = params.abierta ?? []
  if (abierta.length !== 0 && abierta.length !== ns) throw new Error('Debe haber una marca de colector abierto por salida de rebanada.')
  const a = armador(p)
  for (const r of params.rebanadas) {
    const entradas = listaDeRedes(r.entradas, 'Las entradas de una rebanada')
    const salidas = listaDeRedes(r.salidas, 'Las salidas de una rebanada')
    if (entradas.length !== ne || salidas.length !== ns) throw new Error('Las rebanadas deben ser del mismo tamaño.')
    tablaDeSalidas(
      a,
      [...entradas].reverse().concat([...comunes].reverse()),
      filas,
      salidas.map((salida, j) => ({ columna: j, salida, retardo: retardos[j], abierta: abierta[j] === true, ps: 0 }))
    )
  }
  return { modelos: a.modelos, lineas: a.lineas }
}

/** El número de bits de una señal o un reloj dentro de las entradas: se rechaza un índice que no existe. */
function entradaDe(entradas: string[], i: number): string {
  if (!Number.isInteger(i) || i < 0 || i >= entradas.length) throw new Error(`La entrada ${i} del chip no existe.`)
  return entradas[i]
}

/** Los biestables de un registro de `bits` bits con su siguiente estado, borrado y carga síncronos y asíncronos (como los núcleos del motor). */
function registro(
  a: Armador,
  entradas: string[],
  bits: number,
  clk: string,
  borra: { senal: SenalMsi; sincrona?: boolean } | undefined,
  carga: { senal: SenalMsi; sincrona?: boolean; datos: number[] } | undefined,
  habilita: string,
  siguiente: (i: number) => string,
  q: string[],
  qn: string[]
): void {
  const act = (s: SenalMsi): string => (s.bajo === true ? a.inv(entradaDe(entradas, s.entrada)) : entradaDe(entradas, s.entrada))
  const cero = (): string => a.constante(0)
  if (carga && (!Array.isArray(carga.datos) || carga.datos.length < bits)) throw new Error('La carga paralela necesita un dato por bit.')
  const dato = (i: number): string => (carga ? entradaDe(entradas, carga.datos[i]) : cero())
  const sincrono = (x: { sincrona?: boolean } | undefined): boolean => x?.sincrona === true
  const borraS = borra && sincrono(borra) ? act(borra.senal) : cero()
  const cargaS = carga && sincrono(carga) ? act(carga.senal) : cero()
  const borraA = borra && !sincrono(borra) ? act(borra.senal) : null
  const cargaA = carga && !sincrono(carga) ? act(carga.senal) : null
  for (let i = 0; i < bits; i++) {
    // D = borrado, luego carga, luego (sin habilitación) el estado propio y por fin el siguiente.
    const d = a.red()
    a.logica([borraS, cargaS, habilita, dato(i), siguiente(i), q[i]], [d], (x) => {
      const [cl, ld, en, di, sig, propio] = [0, 1, 2, 3, 4, 5].map((b) => (x >> b) & 1)
      return [cl ? 0 : ld ? di : en ? sig : propio]
    })
    let [set, reset] = [cero(), cero()]
    if (borraA || cargaA) {
      ;[set, reset] = [a.red(), a.red()]
      a.logica([borraA ?? cero(), cargaA ?? cero(), dato(i)], [set, reset], (x) => {
        const [cl, ld, di] = [0, 1, 2].map((b) => (x >> b) & 1)
        return [!cl && ld && di ? 1 : 0, cl || (ld && !di) ? 1 : 0]
      })
    }
    a.biestable(d, clk, set, reset, q[i], qn[i])
  }
}

/** `MSI`: contador, desplazamiento (con almacén) o aproximaciones con salidas fijas, y su etapa de salida. */
export function sintetizarMsi(p: string, params: ParamsMsi): Sintesis {
  const entradas = listaDeRedes(params.entradas, 'Las entradas')
  const salidas = listaDeRedes(params.salidas, 'Las salidas')
  const nucleo = params.nucleo
  const de = params.de
  if (!Array.isArray(de) || de.length !== salidas.length) throw new Error('Debe haber una definición por salida.')
  const retardos = retardosDe(params.retardos, salidas.length)
  const abierta = params.abierta ?? []
  if (abierta.length !== 0 && abierta.length !== salidas.length) throw new Error('Debe haber una marca de colector abierto por salida.')
  const fuentes = params.fuentes ?? []
  if (fuentes.length > BITS_MAX) throw new Error(`Una tabla de salida admite a lo más ${BITS_MAX} fuentes.`)
  const a = armador(p)
  const act = (s: SenalMsi): string => (s.bajo === true ? a.inv(entradaDe(entradas, s.entrada)) : entradaDe(entradas, s.entrada))
  /** El reloj efectivo en su estado activo: la Y o la O de sus señales y, si dispara en la bajada, su negada. */
  const armado = (r: RelojMsi): string => {
    if (!Array.isArray(r.senales) || r.senales.length === 0) throw new Error('Un reloj necesita al menos una señal.')
    const efectivo = a.puerta(r.combina === 'O' ? 'd_or' : 'd_and', r.senales.map(act))
    return r.flanco === 'bajada' ? a.inv(efectivo) : efectivo
  }
  const registroDe = (bits: number): { q: string[]; qn: string[] } => {
    if (!Number.isInteger(bits) || bits < 1 || bits > 16) throw new Error('Un registro tiene de 1 a 16 bits.')
    return { q: Array.from({ length: bits }, () => a.red()), qn: Array.from({ length: bits }, () => a.red()) }
  }

  // Los registros que ve la etapa de salida y los picosegundos que el reloj suma hasta cada uno.
  let principal: string[] = []
  let auxiliar: string[] = []
  let bandera: string = a.constante(0)
  let psPrincipal = 0
  let psAuxiliar = 0

  if (nucleo.tipo === 'contador') {
    const { bits, modulo } = nucleo
    const { q, qn } = registroDe(bits)
    if (!Number.isInteger(modulo) || modulo < 2 || modulo > 2 ** bits) throw new Error('El módulo debe estar entre 2 y 2^bits.')
    let clk: string
    let abajo: string | null = null
    if (nucleo.abajo) {
      // Dos relojes: la cuenta es la subida de «los dos en reposo activo» y el sentido lo da el último que estuvo en reposo.
      const [arriba, otro] = [armado(nucleo.reloj), armado(nucleo.abajo)]
      clk = a.puerta('d_and', [arriba, otro])
      const [s, r, hacia, desde] = [a.red(), a.red(), a.red(), a.red()]
      a.logica([arriba, otro], [s, r], (x) => [!(x & 1) && x & 2 ? 1 : 0, x & 1 && !(x & 2) ? 1 : 0])
      a.latch(s, r, hacia, desde)
      abajo = desde
    } else {
      clk = armado(nucleo.reloj)
      if (nucleo.sentido) abajo = act(nucleo.sentido)
    }
    // Siguiente cuenta en una tabla sobre el estado y el sentido.
    const cuenta = Array.from({ length: bits }, () => a.red())
    a.logica([...q, ...(abajo ? [abajo] : [])], cuenta, (x) => {
      const v = x & ((1 << bits) - 1)
      const dn = abajo ? (x >> bits) & 1 : 0
      const sig = dn ? (v === 0 ? modulo - 1 : v - 1) : v === modulo - 1 ? 0 : (v + 1) & ((1 << bits) - 1)
      return cuenta.map((_, i) => (sig >> i) & 1)
    })
    const habilita = nucleo.habilita && nucleo.habilita.length > 0 ? a.puerta('d_and', nucleo.habilita.map(act)) : a.constante(1)
    registro(a, entradas, bits, clk, nucleo.borra, nucleo.carga, habilita, (i) => cuenta[i], q, qn)
    principal = q
    psPrincipal = a.prof(q[0])
  } else if (nucleo.tipo === 'desplazamiento') {
    const { bits } = nucleo
    const { q, qn } = registroDe(bits)
    const clk = armado(nucleo.reloj)
    // Entra la Y de las señales serie (sin señales, un 1, como el motor) por el bit 0 y cada bit toma el anterior.
    const serie = nucleo.serie && nucleo.serie.length > 0 ? a.puerta('d_and', nucleo.serie.map(act)) : a.constante(1)
    registro(a, entradas, bits, clk, nucleo.borra, nucleo.carga, a.constante(1), (i) => (i === 0 ? serie : q[i - 1]), q, qn)
    principal = q
    psPrincipal = a.prof(q[0])
    if (nucleo.almacen) {
      // El almacén copia el registro como estaba antes del flanco: el biestable toma su dato antes de que el principal cambie.
      const clkAlmacen = armado(nucleo.almacen)
      auxiliar = q.map(() => a.red())
      q.forEach((dato, i) => a.biestable(dato, clkAlmacen, a.constante(0), a.constante(0), auxiliar[i], a.red()))
      psAuxiliar = a.prof(auxiliar[0])
    }
  } else if (nucleo.tipo === 'aproximaciones') {
    // ngspice no simula la conversión: el código y el fin de conversión quedan fijos en lo que se pidió.
    const bits = nucleo.bits
    if (!Number.isInteger(bits) || bits < 1 || bits > 16) throw new Error('Un registro tiene de 1 a 16 bits.')
    const codigo = params.codigo ?? 0
    if (!Number.isInteger(codigo) || codigo < 0 || codigo >= 2 ** bits) throw new Error('El código fijo debe caber en los bits del convertidor.')
    principal = Array.from({ length: bits }, (_, b) => a.constante(((codigo >> b) & 1) as 0 | 1))
    bandera = a.constante(params.codigo === undefined ? 0 : 1)
  } else {
    throw new Error('El núcleo del chip no se puede exportar.')
  }

  const indice = (b: number): void => {
    if (!Number.isInteger(b) || b < 0) throw new Error('El índice de una fuente no es válido.')
  }
  /** La red y los picosegundos de una fuente: una entrada llega sin etapas de reloj, un registro con las de su reloj. */
  const fuente = (f: FuenteMsi): { red: string; ps: number } => {
    if ('entrada' in f) return { red: entradaDe(entradas, f.entrada), ps: 0 }
    if ('bit' in f) {
      indice(f.bit)
      return { red: principal[f.bit] ?? a.constante(0), ps: psPrincipal }
    }
    if ('aux' in f) {
      indice(f.aux)
      return { red: auxiliar[f.aux] ?? a.constante(0), ps: psAuxiliar }
    }
    indice(f.bandera)
    return { red: bandera, ps: 0 }
  }

  const enTabla = de.some((s) => s.tipo === 'tabla')
  const origenes = fuentes.map(fuente)
  const filas = enTabla ? filasDe(params.tabla ?? [], 1 << fuentes.length) : []
  const psTabla = origenes.length > 0 ? Math.max(...origenes.map((o) => o.ps)) : 0
  const especs: EspecSalida[] = []
  de.forEach((s, j) => {
    if (s.tipo === 'tabla') {
      if (!Number.isInteger(s.columna) || s.columna < 0 || s.columna >= 32) throw new Error('Una columna de la tabla de salida no es válida.')
      especs.push({ columna: s.columna, salida: salidas[j], retardo: retardos[j], abierta: abierta[j] === true, ps: psTabla })
      return
    }
    // Directa: un búfer (o inversor) desde el bit, con o sin colector abierto.
    const o = fuente(s.fuente)
    const [sub, baj] = retardos[j]
    if (abierta[j] === true) {
      const nivel = a.red()
      a.buffer(o.red, nivel, s.negada === true, UN_PS, UN_PS)
      a.abiertoC(nivel, salidas[j], menos(sub, o.ps + 1))
    } else {
      a.buffer(o.red, salidas[j], s.negada === true, menos(sub, o.ps), menos(baj, o.ps))
    }
  })
  if (especs.length > 0) tablaDeSalidas(a, origenes.map((o) => o.red).reverse(), filas, especs)
  return { modelos: a.modelos, lineas: a.lineas }
}

/** Genera la síntesis de una clase por su nombre: lo usa el script de referencias con los parámetros en JSON. */
export function generarSintesis(clase: string, prefijo: string, params: unknown): string {
  const s = clase === 'lut' ? sintetizarLut(prefijo, params as ParamsLut) : clase === 'msi' ? sintetizarMsi(prefijo, params as ParamsMsi) : null
  if (!s) throw new Error(`No hay síntesis para «${clase}».`)
  return [...s.modelos, ...s.lineas].join('\n')
}
