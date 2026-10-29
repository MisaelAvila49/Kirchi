import type { FuenteMsi, NucleoMsi, RelojMsi, SalidaMsi, SenalMsi } from '../../../compartido/netlistMotor'
import { retardoDe, pinesDelModeloMsi, tablaDelModelo } from '../piezas/validarMsi'
import { compilarTabla, type TablaDef } from '../piezas/tablaVerdad'
import type { ModeloDef, NucleoPieza, RelojPieza } from '../piezas/tipos'
import { FAMILIAS, retardoDeChip, type ParametrosLogicos } from './familias'
import type { ElementoMotor } from './netlist'

/** Los elementos `LUT` y `MSI` de la netlist desde el modelo de una pieza: pines a redes digitales, tablas compartidas y
 * retardos escalados por familia. Los puentes con la parte analógica los pone quien llama (`ContextoMsi`). */
export type ModeloMsi = Extract<ModeloDef, { tipo: 'lut' | 'msi' }>

export interface ContextoMsi {
  /** Red digital que lee el modelo en `pin` (con su puente de entrada si la red es analógica). */
  leer(pin: string): number
  /** Red digital que maneja el modelo en `pin` (con su puente de salida; `tres` lo hace de tres estados). */
  manejar(pin: string, tres: boolean): number
  /** Índice de la tabla en `Netlist.tablas`; la misma tabla compartida da el mismo índice. */
  tabla(filas: (number | string)[]): number
}

interface Compilada {
  tabla: TablaDef
  filas: (number | string)[]
  /** Por salida de la tabla: alguna combinación la deja en Z. */
  conZ: boolean[]
  bitsEstado?: number
}

const cache = new WeakMap<object, Compilada | null>()

/** La tabla del modelo compilada una sola vez por modelo (la del 85 son 2,048 filas). Null si no compila. */
export function tablaCompilada(m: ModeloMsi): Compilada | null {
  if (cache.has(m)) return cache.get(m)!
  const tabla = tablaDelModelo(m)
  let r: Compilada | null = null
  if (tabla) {
    const bitsEstado = m.tipo === 'msi' ? m.nucleo.bits : undefined
    const c = compilarTabla(tabla, [...tabla.columnas, ...tabla.salidas], { ...(bitsEstado !== undefined ? { bitsEstado } : {}), bidireccionales: m.tipo === 'lut' ? m.bidireccionales ?? [] : [] })
    if (!c.errores.length) {
      const filas = (c.filas as (number | bigint)[]).map((f) => (typeof f === 'bigint' ? (f <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(f) : f.toString()) : f))
      const conZ = tabla.salidas.map((_, j) => (c.filas as (number | bigint)[]).some((f) => ((BigInt(f) >> BigInt(2 * j)) & 3n) === 2n))
      r = { tabla, filas, conZ, ...(bitsEstado !== undefined ? { bitsEstado } : {}) }
    }
  }
  cache.set(m, r)
  return r
}

/** Los pines de salida que pueden quedar en Z (por la tabla o por colector abierto): comparten red sin chocar con otra salida fija. */
export function salidasTresEstados(m: ModeloMsi): Set<string> {
  const c = tablaCompilada(m)
  const r = new Set<string>()
  if (!c) return r
  const abiertas = m.abiertas ?? []
  const rebanadas: (Record<string, string> | null)[] = m.tipo === 'lut' && m.rebanadas ? m.rebanadas : [null]
  c.tabla.salidas.forEach((n, j) => {
    if (c.conZ[j] || abiertas.includes(n)) for (const reb of rebanadas) r.add(reb ? reb[n] : n)
  })
  return r
}

const fuentePuro = (s: string) => (s.startsWith('!') ? s.slice(1) : s)

/** El elemento del motor de una pieza `lut` o `msi`. `opcionFamilia` es la familia elegida en la pieza y `vcc` su alimentación. */
export function elementoMsi(m: ModeloMsi, k: ParametrosLogicos, opcionFamilia: string, vcc: number, ctx: ContextoMsi): ElementoMotor | { error: string } {
  const c = tablaCompilada(m)
  // Un registro de desplazamiento sin salidas de tabla (el 164, el 165) no lleva ninguna.
  const sinTabla = m.tipo === 'msi' && !tablaDelModelo(m)
  if (!c && !sinTabla) return { error: 'La tabla de la pieza no compila.' }
  const juego = m.retardos[opcionFamilia]
  const familia = FAMILIAS.familias[opcionFamilia]
  if (!juego || !familia) return { error: `La pieza no trae retardos para ${opcionFamilia}.` }
  const retardo = (salida: string): [number, number] => {
    const t = retardoDe(juego, salida)
    return t ? retardoDeChip(familia, vcc, juego.vcc, t) : [k.rise_delay, k.fall_delay]
  }
  const tres = salidasTresEstados(m)
  const abiertas = m.abiertas ?? []
  const z_como = k.z_como
  const tabla = c ? ctx.tabla(c.filas) : undefined

  if (m.tipo === 'lut') {
    const tab = c!.tabla
    const locales = tab.columnas.filter((n) => !m.comunes.includes(n))
    const pinDe = (reb: Record<string, string> | null, n: string) => (reb ? reb[n] : n)
    const comunes = m.comunes.map((n) => ctx.leer(n))
    const rebanadas = (m.rebanadas ?? [null]).map((reb) => ({
      entradas: locales.map((n) => ctx.leer(pinDe(reb, n))),
      salidas: tab.salidas.map((n) => ctx.manejar(pinDe(reb, n), tres.has(pinDe(reb, n))))
    }))
    return {
      type: 'LUT', comunes, rebanadas, tabla: tabla!,
      retardos: tab.salidas.map(retardo),
      ...(abiertas.length ? { abierta: tab.salidas.map((n) => abiertas.includes(n)) } : {}),
      z_como
    }
  }

  const { entradas: pinesEntrada } = pinesDelModeloMsi(m)
  const idx = (pin: string) => pinesEntrada.indexOf(fuentePuro(pin))
  const senal = (s: string): SenalMsi => ({ entrada: idx(s), ...(s.startsWith('!') ? { bajo: true } : {}) })
  const reloj = (r: RelojPieza): RelojMsi => ({ senales: r.senales.map(senal), ...(r.combina ? { combina: r.combina } : {}), ...(r.flanco ? { flanco: r.flanco } : {}) })
  const n: NucleoPieza = m.nucleo
  const nucleo: NucleoMsi =
    n.tipo === 'contador'
      ? {
          tipo: 'contador', bits: n.bits, modulo: n.modulo, reloj: reloj(n.reloj),
          ...(n.abajo ? { abajo: reloj(n.abajo) } : {}),
          ...(n.sentido ? { sentido: senal(n.sentido) } : {}),
          ...(n.habilita ? { habilita: n.habilita.map(senal) } : {}),
          ...(n.borra ? { borra: { senal: senal(n.borra.senal), sincrona: n.borra.sincrona ?? false } } : {}),
          ...(n.carga ? { carga: { senal: senal(n.carga.senal), sincrona: n.carga.sincrona ?? false, datos: n.carga.datos.map(idx) } } : {})
        }
      : {
          tipo: 'desplazamiento', bits: n.bits, reloj: reloj(n.reloj),
          ...(n.serie ? { serie: n.serie.map(senal) } : {}),
          ...(n.borra ? { borra: { senal: senal(n.borra.senal), sincrona: n.borra.sincrona ?? false } } : {}),
          ...(n.carga ? { carga: { senal: senal(n.carga.senal), sincrona: n.carga.sincrona ?? false, datos: n.carga.datos.map(idx) } } : {}),
          ...(n.almacen ? { almacen: reloj(n.almacen) } : {})
        }

  // Las fuentes de la tabla: una por columna, `estado` en sus bits (el más significativo primero), qK y aK en su bit.
  const fuentes: FuenteMsi[] = (c?.tabla.columnas ?? []).flatMap((col): FuenteMsi[] => {
    if (col === 'estado') return Array.from({ length: c!.bitsEstado ?? 1 }, (_, i) => ({ bit: (c!.bitsEstado ?? 1) - 1 - i }))
    const q = /^([qa])(\d+)$/.exec(col)
    if (q) return [q[1] === 'q' ? { bit: Number(q[2]) } : { aux: Number(q[2]) }]
    return [{ entrada: idx(col) }]
  })
  const nombresSalida = Object.keys(m.salidas)
  const de: SalidaMsi[] = nombresSalida.map((pin) => {
    const v = m.salidas[pin]
    if (v === 'tabla') return { tipo: 'tabla', columna: c!.tabla.salidas.indexOf(pin) }
    const q = /^(!?)([qa])(\d+)$/.exec(v)!
    return { tipo: 'directa', fuente: q[2] === 'q' ? { bit: Number(q[3]) } : { aux: Number(q[3]) }, ...(q[1] ? { negada: true } : {}) }
  })
  return {
    type: 'MSI',
    entradas: pinesEntrada.map((p) => ctx.leer(p)),
    salidas: nombresSalida.map((p) => ctx.manejar(p, tres.has(p) || abiertas.includes(p))),
    nucleo, de, fuentes, ...(tabla !== undefined ? { tabla } : {}),
    retardos: nombresSalida.map(retardo),
    ...(abiertas.length ? { abierta: nombresSalida.map((p) => abiertas.includes(p)) } : {}),
    z_como
  }
}
