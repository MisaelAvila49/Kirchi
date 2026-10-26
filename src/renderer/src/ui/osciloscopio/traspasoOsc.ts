import type { ComandoOsc, DatosOsc, PantallaOsc } from '../../../../compartido/ventanaOsc'
import type { PantallaSab } from '../../sim/protocoloInstrumentos'
import type { CursoresPantalla } from './dibujar'
import type { EjeRueda } from './Pantalla'
import type { Canal } from '../../instrumentos/ajustes'

/**
 * Traspaso entre el editor y la ventana del osciloscopio, sin interfaz para probarlo: copiar la pantalla fuera de la memoria compartida y repartir las órdenes de la ventana.
 */

/**
 * Recuerda el último resultado mientras la clave no cambie: el sondeo corre 30 veces por segundo y leer la memoria compartida copia sus arreglos.
 */
export function memoPorClave<T>(): (clave: string, calcular: () => T) => T {
  let clave: string | null = null
  let valor!: T
  return (k, calcular) => {
    if (k !== clave) {
      valor = calcular()
      clave = k
    }
    return valor
  }
}

/** Una copia que sí puede cruzar el IPC: los arreglos de la memoria compartida se copian a memoria propia. */
export function copiarPantalla(p: PantallaSab): PantallaOsc {
  return {
    version: p.version,
    t0: p.t0,
    dt: p.dt,
    ncol: p.ncol,
    tDisparo: p.tDisparo,
    estado: p.estado,
    tCaptura: p.tCaptura,
    csv: { ...p.csv },
    completoHasta: [...p.completoHasta],
    medidas: p.medidas.map((c) => c.map((m) => ({ valor: m.valor, razon: m.razon }))),
    columnas: p.columnas.slice(),
    muestras: p.muestras.slice()
  }
}

export const pantallaDeOsc = (p: PantallaOsc): PantallaSab => p as unknown as PantallaSab

export const cursoresDeOsc = (c: DatosOsc['cursores']): CursoresPantalla | null => (c ? ({ canal: c.canal, t: c.t, v: c.v } as CursoresPantalla) : null)
export const cursoresAOsc = (c: CursoresPantalla | null): DatosOsc['cursores'] => (c ? { canal: c.canal, t: c.t ? [c.t[0], c.t[1]] : null, v: c.v ? [c.v[0], c.v[1]] : null } : null)

/** Lo que el editor sabe hacer cuando la ventana se lo pide. */
export interface AccionesOsc {
  pausar(): void
  reanudar(): void
  forzar(): void
  auto(): void
  rearmar(): void
  exportar(): void
  elegir(id: string): void
  columnas(id: string, n: number): void
  cursores(c: CursoresPantalla | null): void
  escala(eje: EjeRueda, dir: 1 | -1): void
  posicion(canal: Canal, pos: number, gesto: string): void
  ajuste(prop: string, texto: string, gesto?: string): void
}

export function despacharComando(c: ComandoOsc, a: AccionesOsc): void {
  switch (c.tipo) {
    case 'pausar': return a.pausar()
    case 'reanudar': return a.reanudar()
    case 'forzar': return a.forzar()
    case 'auto': return a.auto()
    case 'rearmar': return a.rearmar()
    case 'exportar': return a.exportar()
    case 'elegir': return a.elegir(c.id)
    case 'columnas': return a.columnas(c.id, c.n)
    case 'cursores': return a.cursores(cursoresDeOsc(c.cursores))
    case 'escala': return a.escala(c.eje.tipo === 'tiempo' ? { tipo: 'tiempo' } : { tipo: 'canal', canal: c.eje.canal as Canal }, c.dir)
    case 'posicion': return a.posicion(c.canal as Canal, c.pos, c.gesto)
    case 'ajuste': return a.ajuste(c.prop, c.texto, c.gesto)
  }
}
