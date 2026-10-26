import type { Id } from '../doc/tipos'
import { medirAbsoluto, FACTOR_QUEMA_ABSOLUTOS } from './absolutos'
import type { LimitePieza } from './avisos'
import type { Lectura } from './lectura'

/** Intervalos de lectura seguidos en que una pieza debe pasar de su máximo SOLO por la muestra final (la media no lo pasa)
 * para contar: una muestra suelta no representa al intervalo. Con lecturas de 100 ms son 0.3 s. */
export const MIN_INTERVALOS_POR_MUESTRA = 3

/** Quemado (apagado por omisión): LED con más del doble de su corriente nominal, resistencia o transistor con más del
 * doble de su potencia (`limites.quema` del `pieza.json`) durante medio segundo simulado seguido quedan abiertos;
 * electrolítico y motor, según su voltaje. Se mide con la media del intervalo. Fusible y foco se funden en el motor. */
export class VigiaDeQuemado {
  private seguidos = new Map<Id, number>()
  private quemadas = new Set<Id>()
  /** Intervalos seguidos en que una pieza pasó su máximo absoluto solo por la muestra final (no por la media). */
  private soloMuestra = new Map<Id, number>()
  /** El fin del último intervalo contado: el mismo promedio se lee muchas veces (por cuadro, al pausar) y cuenta una. */
  private ultimoFin = Number.NaN

  /** Cuántas veces su límite lleva la pieza en la lectura promediada (0 si no se quema o no hay lectura). */
  static veces(l: Lectura, id: Id, lim: LimitePieza, potencia: number | undefined): number {
    const m = l.piezas.get(id)
    if (!m || !lim.quema) return 0
    if (lim.tipo === 'led') return m.i / lim.corriente!
    if (lim.tipo === 'capacitor') return Math.max(m.v / lim.voltaje!.nominal, -m.v / lim.voltaje!.inverso!)
    if (lim.tipo === 'motor') return Math.abs(m.v) / lim.voltaje!.nominal
    const p = potencia ?? Math.abs(m.p)
    if (lim.tipo === 'resistencia' || lim.tipo === 'transistor') return lim.potencia ? p / lim.potencia : 0
    return 0
  }

  /** Veces su máximo absoluto en el peor de sus máximos, con lectura media y último paso en los de voltaje; 0 si ninguno
   * pasa. Quema desde `FACTOR_QUEMA_ABSOLUTOS`. */
  static vecesAbsolutas(l: Lectura, id: Id, lim: LimitePieza, potencia: number | undefined, instantanea?: Lectura): number {
    if (!lim.absolutos) return 0
    let peor = 0
    for (const x of lim.absolutos.lista) {
      // El voltaje diferencial de entrada solo avisa: una señal real lo roza sin dañar la pieza.
      if (x.sinQuema) continue
      const a = medirAbsoluto(x, l.redes, l.piezas.get(id), potencia)
      const b = instantanea && x.unidad === 'V' ? medirAbsoluto(x, instantanea.redes, undefined, undefined) : undefined
      peor = Math.max(peor, a?.veces ?? 0, b?.veces ?? 0)
    }
    return peor
  }

  /** Con la lectura promediada `l` de `duracion` segundos simulados que terminan en `fin`, las piezas que se acaban de
   * quemar (cada una una vez, hasta que se repone). Un intervalo con el mismo `fin` que el anterior ya se contó. */
  revisar(l: Lectura, duracion: number, fin: number, limites: ReadonlyMap<Id, LimitePieza>, potencias: ReadonlyMap<Id, number>, instantanea?: Lectura): Id[] {
    const nuevas: Id[] = []
    if (!(duracion > 0) || fin === this.ultimoFin) return nuevas
    this.ultimoFin = fin
    for (const [id, lim] of limites) {
      if (!lim.quema || this.quemadas.has(id)) continue
      const pot = potencias.get(id)
      const porMedia = VigiaDeQuemado.veces(l, id, lim, pot) > lim.quema.factor || VigiaDeQuemado.vecesAbsolutas(l, id, lim, pot) > FACTOR_QUEMA_ABSOLUTOS
      const porMuestra = !porMedia && !!instantanea && VigiaDeQuemado.vecesAbsolutas(l, id, lim, pot, instantanea) > FACTOR_QUEMA_ABSOLUTOS
      // Pasar solo en la muestra final cuenta cuando se repite en `MIN_INTERVALOS_POR_MUESTRA` intervalos seguidos.
      const racha = porMuestra ? (this.soloMuestra.get(id) ?? 0) + 1 : 0
      if (racha > 0) this.soloMuestra.set(id, racha)
      else this.soloMuestra.delete(id)
      if (porMedia || (porMuestra && racha >= MIN_INTERVALOS_POR_MUESTRA)) {
        const t = (this.seguidos.get(id) ?? 0) + duracion
        this.seguidos.set(id, t)
        if (t >= lim.quema.durante - 1e-12) {
          this.quemadas.add(id)
          this.seguidos.delete(id)
          this.soloMuestra.delete(id)
          nuevas.push(id)
        }
      } else this.seguidos.delete(id)
    }
    return nuevas
  }

  esQuemada(id: Id): boolean {
    return this.quemadas.has(id)
  }

  get todas(): ReadonlySet<Id> {
    return this.quemadas
  }

  /** Un clic la repone: vuelve a contar desde cero. */
  reponer(id: Id): void {
    this.quemadas.delete(id)
    this.seguidos.delete(id)
    this.soloMuestra.delete(id)
  }

  /** Tras Retroceder: el tiempo vuelve atrás, así que las rachas en curso y el último intervalo contado ya no valen. Las quemadas se quedan. */
  reiniciarRachas(): void {
    this.seguidos.clear()
    this.soloMuestra.clear()
    this.ultimoFin = Number.NaN
  }

  reiniciar(): void {
    this.quemadas.clear()
    this.seguidos.clear()
    this.soloMuestra.clear()
    this.ultimoFin = Number.NaN
  }
}
