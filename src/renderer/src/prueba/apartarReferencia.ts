import { porId } from '../conexiones/conexiones'
import type { Documento, Id, Pieza } from '../doc/tipos'
import { cuerpoEnMundo } from '../editor/colision'
import { AIRE_APRETADO, areaEncimada, bloquesApilados, cajasSeCruzan, cajaTexto, CANDIDATOS, CORRIMIENTOS_RENGLON, ladoDePunto, RADIOS_HOLGURA } from '../lienzo/apartar'
import { rotulosDePieza, textoEnPieza, textosLocales, type Texto } from '../lienzo/etiquetas'
import { textosManuales } from '../lienzo/textosManuales'
import { ANCHO_CABLE, cajaEtiqueta, cajaNota } from '../lienzo/medidas'
import type { Caja, PiezaDef } from '../piezas/tipos'

/** Versión de referencia de `etiquetasSinChoques` antes de acelerarla: cubetas en un Map de arreglos, un objeto por
 * candidato y cada consulta contra todos los obstáculos. Lenta a propósito: las pruebas exigen que la rápida dé lo mismo.
 * Si se cambia a propósito la regla de colocación, se cambia aquí también. */

const EPS = 1e-6
/** Hasta cuántos lugares libres se cuentan por rótulo para decidir el orden de colocación. */
const TOPE_LIBRES = 3

const CELDA = 16
/** Máximo de cubetas por caja. Con coordenadas de ±2^20 una caja grande ocuparía ~10^10 y congelaría la interfaz: la que
 * ocupa más va a `grandes` y una consulta mayor recorre todos los obstáculos. Ambos casos son lineales en obstáculos. */
const MAX_CUBETAS = 64
/** Clave entera pequeña de una celda (los Map son mucho más rápidos con ellas). Da la vuelta cada 2,048 celdas: dos
 * lejanas pueden compartir cubeta, lo que solo agrega comparaciones. */
const clave = (cx: number, cy: number) => ((cx & 2047) << 11) | (cy & 2047)

/** Rejilla de cubetas con los obstáculos (cajas en arreglo plano) para buscar cerca de un texto. `dueño` es la pieza cuyo
 * cuerpo es el obstáculo, o −1. */
class Cubetas {
  private cajas = new Float64Array(4 * 1024)
  private dueños = new Int32Array(1024)
  private n = 0
  private m = new Map<number, number[]>()
  /** Obstáculos que ocupan más de `MAX_CUBETAS` cubetas: no están en `m` y se revisan siempre. */
  private grandes: number[] = []

  agregar(minX: number, minY: number, maxX: number, maxY: number, dueño = -1): void {
    if (this.n === this.dueños.length) {
      const c = new Float64Array(this.cajas.length * 2)
      c.set(this.cajas)
      this.cajas = c
      const d = new Int32Array(this.dueños.length * 2)
      d.set(this.dueños)
      this.dueños = d
    }
    const i = this.n++
    this.cajas[4 * i] = minX
    this.cajas[4 * i + 1] = minY
    this.cajas[4 * i + 2] = maxX
    this.cajas[4 * i + 3] = maxY
    this.dueños[i] = dueño
    const x0 = Math.floor(minX / CELDA), y0 = Math.floor(minY / CELDA)
    const x1 = Math.floor(maxX / CELDA), y1 = Math.floor(maxY / CELDA)
    // `!(… <= MAX)` también manda aquí las cajas con coordenadas no finitas.
    if (!((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_CUBETAS)) {
      this.grandes.push(i)
      return
    }
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const k = clave(cx, cy)
        const l = this.m.get(k)
        if (l) l.push(i)
        else this.m.set(k, [i])
      }
  }

  private cruza(i: number, c: Caja, propia: number): boolean {
    if (this.dueños[i] === propia) return false
    const k = this.cajas
    return k[4 * i] < c.maxX - EPS && c.minX < k[4 * i + 2] - EPS && k[4 * i + 1] < c.maxY - EPS && c.minY < k[4 * i + 3] - EPS
  }

  /** Algún obstáculo cruza la caja, sin contar el cuerpo de la pieza número `propia`. */
  choca(c: Caja, propia: number): boolean {
    const x0 = Math.floor(c.minX / CELDA), y0 = Math.floor(c.minY / CELDA)
    const x1 = Math.floor(c.maxX / CELDA), y1 = Math.floor(c.maxY / CELDA)
    if (!((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_CUBETAS)) {
      for (let i = 0; i < this.n; i++) if (this.cruza(i, c, propia)) return true
      return false
    }
    for (const i of this.grandes) if (this.cruza(i, c, propia)) return true
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const l = this.m.get(clave(cx, cy))
        if (!l) continue
        for (const i of l) if (this.cruza(i, c, propia)) return true
      }
    return false
  }

  /** Algún obstáculo de dueño mayor que `rango` cruza la caja. */
  chocaDeRango(c: Caja, rango: number): boolean {
    for (let i = 0; i < this.n; i++) if (this.dueños[i] > rango && this.cruza(i, c, -2)) return true
    return false
  }

  /** Área total en que la caja `c` se encima con los obstáculos, sin contar el cuerpo de la pieza `propia`. */
  areaSolapada(c: Caja, propia: number): number {
    const x0 = Math.floor(c.minX / CELDA), y0 = Math.floor(c.minY / CELDA)
    const x1 = Math.floor(c.maxX / CELDA), y1 = Math.floor(c.maxY / CELDA)
    const vistos = new Set<number>()
    let total = 0
    const sumar = (i: number) => {
      if (vistos.has(i) || this.dueños[i] === propia) return
      vistos.add(i)
      const k = this.cajas
      const w = Math.min(k[4 * i + 2], c.maxX) - Math.max(k[4 * i], c.minX)
      const h = Math.min(k[4 * i + 3], c.maxY) - Math.max(k[4 * i + 1], c.minY)
      if (w > 0 && h > 0) total += w * h
    }
    if (!((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_CUBETAS)) {
      for (let i = 0; i < this.n; i++) sumar(i)
      return total
    }
    for (const i of this.grandes) sumar(i)
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) for (const i of this.m.get(clave(cx, cy)) ?? []) sumar(i)
    return total
  }

  /** ¿Algún obstáculo ajeno a `propia` queda a `d` o menos de la caja `c`? Sirve para comprobar que un texto esté más
   * cerca de su pieza que de cualquier otra. */
  masCercaQue(c: Caja, d: number, propia: number): boolean {
    const r = d + EPS
    const x0 = Math.floor((c.minX - r) / CELDA), y0 = Math.floor((c.minY - r) / CELDA)
    const x1 = Math.floor((c.maxX + r) / CELDA), y1 = Math.floor((c.maxY + r) / CELDA)
    if (!((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_CUBETAS)) {
      for (let i = 0; i < this.n; i++) if (this.dueños[i] !== propia && this.distancia(i, c) <= r) return true
      return false
    }
    for (const i of this.grandes) if (this.dueños[i] !== propia && this.distancia(i, c) <= r) return true
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const l = this.m.get(clave(cx, cy))
        if (!l) continue
        for (const i of l) if (this.dueños[i] !== propia && this.distancia(i, c) <= r) return true
      }
    return false
  }

  private distancia(i: number, c: Caja): number {
    const k = this.cajas
    return Math.hypot(Math.max(0, k[4 * i] - c.maxX, c.minX - k[4 * i + 2]), Math.max(0, k[4 * i + 1] - c.maxY, c.minY - k[4 * i + 3]))
  }
}

type TextoLocal = ReturnType<typeof textosLocales>[number]

/** El k-ésimo lugar de `CANDIDATOS` para un texto local de una pieza. */
function candidatoDeTexto(p: Pieza, t: TextoLocal, k: number): Texto {
  const { x: lx, y: ly, renglon } = t.local
  // En el renglón de un rótulo (el voltaje de un terminal) solo se corre a lo largo de él, hacia donde crece.
  if (renglon) return textoEnPieza(p, t.texto, lx, ly, t.color, renglon * CORRIMIENTOS_RENGLON[k])
  // Afuera: el eje dominante del punto local (vertical si empatan); de lado, el otro.
  const vertical = Math.abs(ly) >= Math.abs(lx)
  const s = vertical ? Math.sign(ly) || -1 : Math.sign(lx)
  const [a, b] = CANDIDATOS[k]
  return vertical ? textoEnPieza(p, t.texto, lx + b, ly + s * a, t.color) : textoEnPieza(p, t.texto, lx + s * a, ly + b, t.color)
}

/** Distancia entre dos cajas: 0 si se tocan o se cruzan. */
const distanciaCajas = (a: Caja, b: Caja): number => Math.hypot(Math.max(0, a.minX - b.maxX, b.minX - a.maxX), Math.max(0, a.minY - b.maxY, b.minY - a.maxY))

/** Referencias y valores de todas las piezas: cada uno en su lugar de la definición o, si ahí se encima, en el primer
 * candidato libre y más cerca de su pieza que de otra. Referencia y valor se deciden juntos (si alguno no tiene lugar
 * holgado, el par se apila del lado con más holgura). Primero se colocan las piezas con menos lugares buenos. */
export function etiquetasSinChoquesReferencia(doc: Documento, lib: Map<string, PiezaDef>): Map<Id, Texto[]> {
  const cubetas = new Cubetas()
  /** Solo los cuerpos, para medir qué pieza queda más cerca de un texto. */
  const cuerpos = new Cubetas()
  const agregarCaja = (c: Caja, dueño = -1) => cubetas.agregar(c.minX, c.minY, c.maxX, c.maxY, dueño)
  const m = ANCHO_CABLE / 2
  for (const c of Object.values(doc.cables))
    for (let i = 1; i < c.puntos.length; i++) {
      const a = c.puntos[i - 1], b = c.puntos[i]
      cubetas.agregar(Math.min(a.x, b.x) - m, Math.min(a.y, b.y) - m, Math.max(a.x, b.x) + m, Math.max(a.y, b.y) + m)
    }
  const piezas = Object.values(doc.piezas).sort(porId)
  piezas.forEach((p, i) => {
    const def = lib.get(p.tipo)
    const cuerpo = cuerpoEnMundo(p, def)
    agregarCaja(cuerpo, i)
    cuerpos.agregar(cuerpo.minX, cuerpo.minY, cuerpo.maxX, cuerpo.maxY, i)
    // Los rótulos del símbolo (nombres y números de pin) tampoco se pisan con la referencia ni el valor.
    if (def?.rotulos) for (const r of rotulosDePieza(p, def)) agregarCaja(cajaTexto(r))
  })
  for (const e of Object.values(doc.etiquetas)) agregarCaja(cajaEtiqueta(e))
  for (const n of Object.values(doc.notas)) agregarCaja(cajaNota(n))
  // Los textos movidos a mano quedan donde se pusieron y son obstáculos fijos para todos los demás, también los de su pieza.
  const manuales = piezas.map((p) => {
    const def = lib.get(p.tipo)
    return def && p.textos ? textosManuales(p, def, textosLocales(p, def, doc)) : new Map<number, Texto>()
  })
  for (const m of manuales) for (const t of m.values()) agregarCaja(cajaTexto(t))

  // Cada rótulo evalúa sus candidatos de a uno, cuando hace falta: aceptables y libres de obstáculos fijos. Antes de
  // poner texto se cuentan los libres hasta `TOPE_LIBRES`, que basta para saber qué rótulos tienen pocas salidas.
  interface Candidato { q: Texto; propia: number; aceptable: boolean }
  interface Rotulo { ip: number; pos: number; p: Pieza; t: TextoLocal; suyo: Caja; cands: Candidato[]; libres: number }
  const evaluar = (r: Rotulo): Candidato => {
    const q = candidatoDeTexto(r.p, r.t, r.cands.length)
    const caja = cajaTexto(q, 0)
    const propia = distanciaCajas(caja, r.suyo)
    const c = { q, propia, aceptable: !cuerpos.masCercaQue(caja, propia, r.ip) }
    r.cands.push(c)
    return c
  }
  const candidato = (r: Rotulo, k: number): Candidato => r.cands[k] ?? evaluar(r)
  /** Los textos ya puestos, sin cuerpos ni cables: contra ellos se mide si un lugar queda apretado. */
  const soloTextos = new Cubetas()
  const grupos: { ip: number; rs: Rotulo[]; libres: number }[] = []
  for (let ip = 0; ip < piezas.length; ip++) {
    const p = piezas[ip]
    const def = lib.get(p.tipo)
    if (!def) continue
    const suyo = cuerpoEnMundo(p, def)
    const rs: Rotulo[] = []
    let pos = 0
    for (const t of textosLocales(p, def, doc)) {
      if (manuales[ip].has(pos)) {
        pos++
        continue
      }
      const r: Rotulo = { ip, pos: pos++, p, t, suyo, cands: [], libres: 0 }
      while (r.libres < TOPE_LIBRES && r.cands.length < CANDIDATOS.length) {
        const c = evaluar(r)
        if (c.aceptable && !cubetas.choca(cajaTexto(c.q), ip)) r.libres++
      }
      rs.push(r)
    }
    if (rs.length) grupos.push({ ip, rs, libres: Math.min(...rs.map((r) => r.libres)) })
  }
  // Primero las piezas con menos lugares buenos, para que otra no les quite el único que tienen;
  // a igual número, el orden de siempre (por id de pieza).
  const orden = grupos.map((_, i) => i).sort((i, j) => grupos[i].libres - grupos[j].libres || i - j)
  /** Los textos de la definición de las piezas que aún no se colocan: ya cuentan como vecinos de los demás. El dueño es el lugar de la pieza en `orden`. */
  const defectos = new Cubetas()
  orden.forEach((gi, rango) => {
    for (const r of grupos[gi].rs) {
      const c = cajaTexto(candidato(r, 0).q)
      defectos.agregar(c.minX, c.minY, c.maxX, c.maxY, rango)
    }
  })
  const puestos: Texto[][] = piezas.map((_, ip) => {
    const l: Texto[] = []
    for (const [pos, t] of manuales[ip]) l[pos] = t
    return l
  })
  for (let rango = 0; rango < orden.length; rango++) {
    const { ip, rs } = grupos[orden[rango]]
    const suyo = rs[0].suyo
    const propios: Caja[] = []
    const chocaPropios = (c: Caja) => propios.some((o) => cajasSeCruzan(o, c))
    const apretado = (q: Texto) => {
      const caja = cajaTexto(q, AIRE_APRETADO)
      return soloTextos.choca(caja, -2) || defectos.chocaDeRango(caja, rango)
    }
    let elegidos: Texto[] | null = []
    // 1. Texto por texto: el primer lugar aceptable, libre y holgado.
    for (const r of rs) {
      let q: Texto | null = null
      for (let k = 0; k < CANDIDATOS.length && !q; k++) {
        const c = candidato(r, k)
        if (!c.aceptable) continue
        const caja = cajaTexto(c.q)
        if (!cubetas.choca(caja, ip) && !chocaPropios(caja) && !apretado(c.q)) q = c.q
      }
      if (!q) {
        elegidos = null
        break
      }
      elegidos.push(q)
      propios.push(cajaTexto(q))
    }
    // 2. Referencia y valor apilados del lado con más holgura.
    if (!elegidos && rs.length === 2 && !rs.some((r) => r.t.local.renglon)) {
      const primero = candidato(rs[0], 0).q
      const bloques = bloquesApilados(suyo, rs.map((r) => ({ texto: r.t.texto, color: r.t.color })), ladoDePunto(suyo, primero.x, primero.y))
      let mejor = -1
      for (const bloque of bloques) {
        const cajas = bloque.map((q) => cajaTexto(q))
        const buenos = bloque.every((q, i) => {
          const caja0 = cajaTexto(q, 0)
          return !cuerpos.masCercaQue(caja0, distanciaCajas(caja0, suyo), ip) && !cubetas.choca(cajas[i], ip) && !apretado(q)
        })
        if (!buenos) continue
        const union: Caja = {
          minX: Math.min(...cajas.map((c) => c.minX)), minY: Math.min(...cajas.map((c) => c.minY)),
          maxX: Math.max(...cajas.map((c) => c.maxX)), maxY: Math.max(...cajas.map((c) => c.maxY))
        }
        let holgura = 0
        for (const r of RADIOS_HOLGURA) {
          if (cubetas.choca({ minX: union.minX - r, minY: union.minY - r, maxX: union.maxX + r, maxY: union.maxY + r }, ip)) break
          holgura++
        }
        if (holgura > mejor) {
          mejor = holgura
          elegidos = bloque
        }
      }
    }
    // 3. La regla de antes, texto por texto.
    if (!elegidos) {
      elegidos = []
      propios.length = 0
      for (const r of rs) {
        let elegido: Texto | null = null
        let menor = Infinity
        let encimado: Texto | null = null
        let masCerca: Texto | null = null
        let dMin = Infinity
        for (let k = 0; k < CANDIDATOS.length; k++) {
          const c = candidato(r, k)
          if (c.propia < dMin) {
            dMin = c.propia
            masCerca = c.q
          }
          if (!c.aceptable) continue
          const caja = cajaTexto(c.q)
          if (!cubetas.choca(caja, ip) && !chocaPropios(caja)) {
            elegido = c.q
            break
          }
          let area = cubetas.areaSolapada(caja, ip)
          for (const o of propios) area += areaEncimada(o, caja)
          if (area < menor - 1e-9) {
            menor = area
            encimado = c.q
          }
        }
        elegido ??= encimado ?? masCerca!
        elegidos.push(elegido)
        propios.push(cajaTexto(elegido))
      }
    }
    rs.forEach((r, i) => {
      const caja = cajaTexto(elegidos![i])
      agregarCaja(caja)
      soloTextos.agregar(caja.minX, caja.minY, caja.maxX, caja.maxY)
      puestos[ip][r.pos] = elegidos![i]
    })
  }
  const out = new Map<Id, Texto[]>()
  piezas.forEach((p, ip) => {
    if (lib.has(p.tipo)) out.set(p.id, puestos[ip])
  })
  return out
}
