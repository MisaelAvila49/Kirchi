import type { Id, Pieza, Punto } from '../doc/tipos'
import type { Caja, PiezaDef, ZonaDeClic } from '../piezas/tipos'
import { cajaTransformada } from '../piezas/transformar'
import type { EscritorTrazos, EscritorTriangulos } from './buffers'
import type { RGBA } from './paleta'

/** El interruptor DIP y el teclado matricial se manejan con el clic o el teclado sobre las zonas de su símbolo: una palanca
 * por posición, una tecla por cruce de fila y columna. Aquí viven las zonas, qué contactos están cerrados y su dibujo. */

/** Las zonas de clic de la pieza (una por contacto), o null si no es un DIP ni un teclado. */
export function zonasDe(def: PiezaDef | undefined): readonly ZonaDeClic[] | null {
  const a = def?.animacion
  return a?.tipo === 'zonas' ? a.zonas : null
}

/** Qué clase de contactos tiene la pieza. */
export function claseDeContactos(def: PiezaDef | undefined): 'palanca' | 'tecla' | null {
  const m = def?.modelo
  return zonasDe(def) ? (m?.tipo === 'interruptores' ? 'palanca' : m?.tipo === 'teclado' ? 'tecla' : null) : null
}

/** La zona en coordenadas del mundo con la orientación de la pieza (sigue siendo un rectángulo con giros de 90°). */
function zonaEnMundo(p: Pieza, z: ZonaDeClic): Caja {
  return cajaTransformada({ minX: z.x, minY: z.y, maxX: z.x + z.ancho, maxY: z.y + z.alto }, p)
}

/** El contacto cuya zona contiene el punto del mundo, o null. */
export function contactoEn(p: Pieza, def: PiezaDef | undefined, punto: Punto): number | null {
  const zonas = zonasDe(def)
  if (!zonas) return null
  for (let k = 0; k < zonas.length; k++) {
    const c = zonaEnMundo(p, zonas[k])
    if (punto.x >= c.minX && punto.x <= c.maxX && punto.y >= c.minY && punto.y <= c.maxY) return k
  }
  return null
}

/** El carácter del teclado de la computadora que acciona cada contacto: las teclas 1 a N de un DIP y la `tecla` de cada zona de un teclado. */
export function teclasDe(def: PiezaDef | undefined): readonly string[] {
  const zonas = zonasDe(def)
  if (!zonas) return []
  return claseDeContactos(def) === 'palanca' ? zonas.map((_, k) => String(k + 1)) : zonas.map((z) => z.tecla ?? '')
}

/** El contacto que acciona la tecla del teclado de la computadora (las letras sin distinguir mayúsculas), o null. */
export function contactoDeTecla(def: PiezaDef | undefined, tecla: string): number | null {
  if (tecla.length !== 1) return null
  const k = teclasDe(def).indexOf(tecla.toUpperCase())
  return k >= 0 ? k : null
}

/** El contacto que una pulsación de tecla acciona: ninguno si lleva Ctrl, Alt o Meta (esas combinaciones son de los atajos). */
export function contactoDeEvento(def: PiezaDef | undefined, e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): number | null {
  return e.ctrlKey || e.metaKey || e.altKey ? null : contactoDeTecla(def, e.key)
}

/** La línea de ayuda del inspector mientras la vista previa corre y la pieza está seleccionada. */
export function ayudaDeContactos(def: PiezaDef | undefined): string | null {
  const clase = claseDeContactos(def)
  const teclas = teclasDe(def)
  if (!clase || teclas.length === 0) return null
  if (clase === 'palanca') return `Simulando: las teclas 1 a ${teclas.length} mueven las palancas.`
  const hay = (t: string) => teclas.includes(t)
  const lista = ['0 a 9', ...(hay('A') ? ['A a D'] : []), '* y #']
  return `Simulando: las teclas ${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]} pulsan el teclado.`
}

/** El estado de un DIP en el documento: un 1 por palanca cerrada. */
export function palancasCerradas(estado: string, n: number): boolean[] {
  return Array.from({ length: n }, (_, k) => estado[k] === '1')
}

/** Las teclas que se sostienen ahora, por pieza: no se guardan en el documento (la tecla pulsada no es parte del circuito). */
export const teclasPulsadas = new Map<Id, ReadonlySet<number>>()

/** Qué contactos están cerrados: las palancas según `estado` del documento y las teclas según las que se sostienen. */
export function contactosCerrados(p: Pieza, def: PiezaDef): boolean[] {
  const zonas = zonasDe(def)
  const m = def.modelo
  if (!zonas) return []
  if (m?.tipo === 'interruptores') return palancasCerradas(p.props[m.estado] ?? def.props.find((d) => d.id === m.estado)?.defecto ?? '', zonas.length)
  const pulsadas = teclasPulsadas.get(p.id)
  return zonas.map((_, k) => pulsadas?.has(k) ?? false)
}

/** Un rectángulo relleno con su contorno. Sin escritor de triángulos solo el contorno. */
function cuadro(t: EscritorTrazos, tri: EscritorTriangulos | null, c: Caja, ancho: number, color: RGBA): void {
  t.segmento(c.minX, c.minY, c.maxX, c.minY, ancho, color)
  t.segmento(c.maxX, c.minY, c.maxX, c.maxY, ancho, color)
  t.segmento(c.maxX, c.maxY, c.minX, c.maxY, ancho, color)
  t.segmento(c.minX, c.maxY, c.minX, c.minY, ancho, color)
  if (!tri) return
  tri.triangulo(c.minX, c.minY, c.maxX, c.minY, c.maxX, c.maxY, color)
  tri.triangulo(c.minX, c.minY, c.maxX, c.maxY, c.minX, c.maxY, color)
}

/** Dibuja las palancas (a la derecha las cerradas, a la izquierda las abiertas) o la tecla pulsada rellena. */
export function dibujarContactos(t: EscritorTrazos, tri: EscritorTriangulos | null, p: Pieza, def: PiezaDef, color: RGBA, ancho: number): void {
  const zonas = zonasDe(def)
  if (!zonas) return
  const cerrados = contactosCerrados(p, def)
  const palanca = claseDeContactos(def) === 'palanca'
  zonas.forEach((z, k) => {
    if (palanca) {
      // La palanca ocupa la mitad de la ranura (la zona deja 0.3 de margen arriba y abajo y 0.4 a los lados).
      const media = z.ancho / 2
      const x = cerrados[k] ? z.x + media + 0.1 : z.x + 0.4
      const caja = cajaTransformada({ minX: x, minY: z.y + z.alto / 2 - 0.5, maxX: x + media - 0.5, maxY: z.y + z.alto / 2 + 0.5 }, p)
      cuadro(t, tri, caja, ancho, color)
    } else if (cerrados[k]) {
      const cx = z.x + z.ancho / 2, cy = z.y + z.alto / 2
      cuadro(t, tri, cajaTransformada({ minX: cx - 1.4, minY: cy - 1.4, maxX: cx + 1.4, maxY: cy + 1.4 }, p), ancho, color)
    }
  })
}
