import type { Documento, Id, Pieza } from '../doc/tipos'
import { capasDeAnimacion, type PiezaDef } from '../piezas/tipos'
import type { Lectura } from '../sim/lectura'
import { EscritorTrazos, EscritorTriangulos } from './buffers'
import { orientar } from './escena'
import { cajaEnMundo } from '../piezas/transformar'
import { ANCHO_TRAZO } from './medidas'
import type { Paleta } from './paleta'

/** Lo que se mueve por cuadro, en un búfer del tamaño de lo que se mueve y no del circuito. El rotor gira con sus rpm por
 * la velocidad del tiempo con tope de vueltas por segundo de pantalla; la armadura del relé recorre 60 ms de reloj del
 * estado anterior al nuevo. */

/** Duración del recorrido de un contacto, en milisegundos de reloj. */
export const RECORRIDO_MS = 60
/** Debajo de esta velocidad el rotor se queda quieto y la flecha de sentido desaparece. */
export const RPM_MINIMA = 1

/** Vueltas por segundo de pantalla del rotor: las del motor por la velocidad del tiempo, con su tope y su signo. */
export function vueltasPorSegundo(rpm: number, velocidadTiempo: number, vueltasMax: number): number {
  if (!(Math.abs(rpm) >= RPM_MINIMA) || !Number.isFinite(rpm)) return 0
  const v = (Math.abs(rpm) / 60) * (velocidadTiempo === Number.POSITIVE_INFINITY ? 1e9 : velocidadTiempo)
  return Math.sign(rpm) * Math.min(vueltasMax, v)
}

interface Rotor {
  /** Ángulo en vueltas (0 a 1) en `desde` y vueltas por segundo desde entonces. */
  angulo: number
  vps: number
  desde: number
}

interface Contacto {
  /** 0 en reposo, 1 operado; el recorrido va de `de` a `a` desde `desde` (ms). */
  de: number
  a: number
  desde: number
}

/** Lo que dibuja la capa de movimiento en un cuadro. */
export interface CapaMovimiento {
  trazos: Float32Array
  nTrazos: number
  triangulos: Float32Array
  nTriangulos: number
}

export class Movimiento {
  private rotores = new Map<Id, Rotor>()
  private contactos = new Map<Id, Contacto>()
  private t = new EscritorTrazos()
  private tri = new EscritorTriangulos()
  /** Las piezas que giran o tienen contacto, una vez al arrancar la vista previa (mientras corre no se edita). */
  private piezas: Pieza[] = []

  /** Al arrancar la vista previa: qué piezas pueden moverse. */
  preparar(doc: Documento, lib: Map<string, PiezaDef>): void {
    this.reiniciar()
    this.piezas = Object.values(doc.piezas).filter((p) => {
      const t = lib.get(p.tipo)?.animacion?.tipo
      return t === 'giro' || t === 'contacto'
    })
    // En reposo desde el primer cuadro: la escena ya no los dibuja al simular y la primera lectura tarda un momento.
    for (const p of this.piezas) {
      if (lib.get(p.tipo)?.animacion?.tipo === 'giro') this.rotores.set(p.id, { angulo: 0, vps: 0, desde: 0 })
      else this.contactos.set(p.id, { de: 0, a: 0, desde: 0 })
    }
  }

  /** Si el circuito tiene algo que se mueva (un motor o un relé): sin eso no se pide ningún cuadro por movimiento. */
  get vacio(): boolean {
    return this.piezas.length === 0
  }

  /** Una lectura nueva: el ángulo de cada rotor sigue desde donde iba con su nueva velocidad, y cada contacto que cambió empieza su recorrido. */
  actualizar(lib: Map<string, PiezaDef>, l: Lectura, velocidadTiempo: number, ahora: number, pausadas: boolean): void {
    for (const p of this.piezas) {
      const a = lib.get(p.tipo)?.animacion
      if (!a) continue
      const x = l.piezas.get(p.id)?.extra
      if (a.tipo === 'giro' && x?.tipo === 'motor') {
        const r = this.rotores.get(p.id) ?? { angulo: 0, vps: 0, desde: ahora }
        r.angulo = this.anguloEn(r, ahora, pausadas)
        r.vps = vueltasPorSegundo(x.rpm, velocidadTiempo, a.vueltasMax)
        r.desde = ahora
        this.rotores.set(p.id, r)
      } else if (a.tipo === 'contacto' && x?.tipo === 'rele') {
        const nuevo = x.operado ? 1 : 0
        const c = this.contactos.get(p.id)
        if (!c) this.contactos.set(p.id, { de: nuevo, a: nuevo, desde: ahora })
        else if (c.a !== nuevo) this.contactos.set(p.id, { de: pausadas ? nuevo : this.estadoEn(c, ahora), a: nuevo, desde: ahora })
      }
    }
  }

  private anguloEn(r: Rotor, ahora: number, pausadas: boolean): number {
    const a = r.angulo + (pausadas ? 0 : (r.vps * (ahora - r.desde)) / 1000)
    return a - Math.floor(a)
  }

  private estadoEn(c: Contacto, ahora: number): number {
    const s = Math.min(1, Math.max(0, (ahora - c.desde) / RECORRIDO_MS))
    return c.de + (c.a - c.de) * s
  }

  /** Si algo visible se mueve en `ahora`: un rotor que gira o un recorrido a medias (el lienzo pide cuadros solo entonces). */
  enMovimiento(ahora: number, pausadas: boolean): boolean {
    if (pausadas) return false
    for (const r of this.rotores.values()) if (r.vps !== 0) return true
    for (const c of this.contactos.values()) if (c.de !== c.a && ahora - c.desde < RECORRIDO_MS) return true
    return false
  }

  /** El ángulo del rotor de una pieza en vueltas (para las pruebas y la flecha de sentido). */
  angulo(id: Id, ahora: number, pausadas: boolean): number | null {
    const r = this.rotores.get(id)
    return r ? this.anguloEn(r, ahora, pausadas) : null
  }

  /** Las vueltas por segundo de pantalla de un rotor (0 quieto). */
  vps(id: Id): number {
    return this.rotores.get(id)?.vps ?? 0
  }

  /** Lo que se dibuja en este cuadro: cada rotor girado a su ángulo y cada armadura en su punto del recorrido. Con
   * `vista`, lo que queda fuera no se arma. */
  construir(doc: Documento, lib: Map<string, PiezaDef>, paleta: Paleta, ahora: number, pausadas: boolean, vista?: { minX: number; minY: number; maxX: number; maxY: number }): CapaMovimiento {
    const t = this.t, tri = this.tri
    t.vaciar()
    tri.vaciar()
    const fuera = (p: Pieza, def: PiezaDef) => {
      if (!vista) return false
      const c = cajaEnMundo(p, def)
      return c.maxX < vista.minX || c.minX > vista.maxX || c.maxY < vista.minY || c.minY > vista.maxY
    }
    for (const [id, r] of this.rotores) {
      const p = doc.piezas[id], def = p && lib.get(p.tipo)
      const capa = def?.geometria.capas?.rotor
      if (!p || !capa || fuera(p, def)) continue
      const ang = 2 * Math.PI * this.anguloEn(r, ahora, pausadas)
      const [c, s] = [Math.cos(ang), Math.sin(ang)]
      const girar = (pts: readonly number[]) => pts.map((v, i) => (i % 2 ? pts[i - 1] * s + v * c : v * c - pts[i + 1] * s))
      dibujar(t, tri, p, capa.trazos.map(girar), girar(capa.rellenos), paleta)
    }
    for (const [id, k] of this.contactos) {
      const p = doc.piezas[id], def = p && lib.get(p.tipo)
      const nombres = capasDeAnimacion(def?.animacion)
      const [a, b] = nombres.map((n) => def?.geometria.capas?.[n])
      if (!p || !def || !a || !b || fuera(p, def)) continue
      const s = pausadas ? k.a : this.estadoEn(k, ahora)
      const mezcla = (x: readonly number[], y: readonly number[]) => x.map((v, i) => v + (y[i] - v) * s)
      dibujar(t, tri, p, a.trazos.map((l, i) => mezcla(l, b.trazos[i])), mezcla(a.rellenos, b.rellenos), paleta)
    }
    return { trazos: t.resultado(), nTrazos: t.cuenta, triangulos: tri.resultado(), nTriangulos: tri.cuenta }
  }

  /** Al detener: nada se mueve. */
  reiniciar(): void {
    this.rotores.clear()
    this.contactos.clear()
    this.piezas = []
  }
}

/** Trazos y rellenos en unidades del símbolo, orientados y llevados al lugar de la pieza. */
function dibujar(t: EscritorTrazos, tri: EscritorTriangulos, p: Pieza, trazos: readonly (readonly number[])[], rellenos: readonly number[], paleta: Paleta): void {
  for (const l of trazos) {
    const o = orientar(l, p.rot, p.espejo)
    for (let i = 2; i + 1 < o.length; i += 2) t.segmento(p.x + o[i - 2], p.y + o[i - 1], p.x + o[i], p.y + o[i + 1], ANCHO_TRAZO, paleta.pieza)
  }
  const r = orientar(rellenos, p.rot, p.espejo)
  for (let i = 0; i + 5 < r.length; i += 6) tri.triangulo(p.x + r[i], p.y + r[i + 1], p.x + r[i + 2], p.y + r[i + 3], p.x + r[i + 4], p.y + r[i + 5], paleta.pieza)
}
