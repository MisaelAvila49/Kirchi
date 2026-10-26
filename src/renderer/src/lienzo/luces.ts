import type { EscritorTriangulos } from './buffers'
import { conAlfa, type Paleta, type RGBA } from './paleta'

/** Cómo se ve la luz. Un LED brilla con la raíz de su corriente media entre la nominal (el ojo comprime y promedia lo que
 * parpadea muy rápido: ley de Talbot y Plateau); un foco, con el cuadrado del calentamiento del filamento. Ninguna luz
 * destella más de tres veces por segundo (WCAG 2.3.1). */

/** Brillo por debajo del cual una luz se ve apagada: el de 2 % de la corriente nominal. */
export const BRILLO_MINIMO = Math.sqrt(0.02)
/** El resplandor llega a 1.6 veces el radio de la luz y se desvanece hacia afuera. */
export const FACTOR_RESPLANDOR = 1.6
/** Opacidad del resplandor junto al cuerpo, con brillo pleno. */
export const ALFA_RESPLANDOR = 0.35

/** 0 a 1: la raíz de la corriente media entre la nominal; en inversa, apagado. Por encima de la nominal no crece más. */
export function brilloDeLuz(i: number, inom: number): number {
  if (!(Number.isFinite(i) && i > 0 && inom > 0)) return 0
  return Math.sqrt(Math.min(1, i / inom))
}

/** La luz del foco con el calentamiento θ de su filamento (1 al voltaje y la potencia nominales): θ², acotada en 1. */
export const luzDeFoco = (theta: number): number => (Number.isFinite(theta) && theta > 0 ? Math.min(1, theta * theta) : 0)

/** El color del filamento: del naranja apagado (θ bajo) al blanco cálido (θ = 1). */
export function colorDeFoco(theta: number, p: Paleta): RGBA {
  const s = Math.max(0, Math.min(1, theta))
  const [a, b] = [p.focoTibio, p.focoPleno]
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s, 1]
}

/** Un anillo de `lados` trapecios con la opacidad de `alfaDentro` en el radio `r0` a 0 en `r1`, con opacidad por vértice. */
export function resplandor(tri: EscritorTriangulos, cx: number, cy: number, r0: number, r1: number, color: RGBA, alfaDentro: number, lados = 24): void {
  const dentro = conAlfa(color, alfaDentro), fuera = conAlfa(color, 0)
  for (let k = 0; k < lados; k++) {
    const a = (2 * Math.PI * k) / lados, b = (2 * Math.PI * (k + 1)) / lados
    const [ca, sa, cb, sb] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b)]
    tri.trianguloDegradado(cx + r0 * ca, cy + r0 * sa, dentro, cx + r1 * ca, cy + r1 * sa, fuera, cx + r1 * cb, cy + r1 * sb, fuera)
    tri.trianguloDegradado(cx + r0 * ca, cy + r0 * sa, dentro, cx + r1 * cb, cy + r1 * sb, fuera, cx + r0 * cb, cy + r0 * sb, dentro)
  }
}

/** Regla de destellos (WCAG 2.3.1): un cambio es un cambio de sentido del brillo mayor a `CAMBIO_MINIMO` del pleno. Con
 * más de `CAMBIOS_ENTRA` en el último segundo de reloj la luz se dibuja quieta, y vuelve a seguirlos con `CAMBIOS_SALE` o
 * menos durante un segundo (histéresis). */
export const CAMBIO_MINIMO = 0.1
export const CAMBIOS_ENTRA = 6
export const CAMBIOS_SALE = 4
export const VENTANA_DESTELLOS_MS = 1000

interface EstadoLuz {
  /** El sentido en que va el brillo (1 sube, −1 baja, 0 todavía no se sabe) y el extremo al que llegó. */
  sentido: number
  extremo: number
  cambios: number[]
  muestras: { t: number; b: number }[]
  conmuta: boolean
  bajoDesde: number | null
  /** La última muestra contada: la misma lectura se dibuja en muchos cuadros y cuenta una vez. */
  muestra: number
}

/** Vigila cada luz (por llave: pieza, o pieza y segmento). Mientras conmuta se dibuja con su brillo medio del último
 * segundo y la marca de «conmuta». */
export class VigiaDeDestellos {
  private luces = new Map<string, EstadoLuz>()

  /** Brillo que se dibuja y si la luz conmuta más rápido de lo que se ve sin destellar. `ahora` es el reloj (ms) y
   * `muestra` el instante simulado de la lectura: una muestra repetida no cuenta. */
  revisar(llave: string, brillo: number, ahora: number, muestra: number): { brillo: number; conmuta: boolean } {
    let l = this.luces.get(llave)
    if (!l) this.luces.set(llave, (l = { sentido: 0, extremo: brillo, cambios: [], muestras: [], conmuta: false, bajoDesde: null, muestra: Number.NaN }))
    if (muestra !== l.muestra) {
      l.muestra = muestra
      const d = brillo - l.extremo
      if (l.sentido === 0) {
        if (Math.abs(d) > CAMBIO_MINIMO) [l.sentido, l.extremo] = [Math.sign(d), brillo]
      } else if (d * l.sentido >= 0) l.extremo = brillo
      else if (Math.abs(d) > CAMBIO_MINIMO) {
        l.cambios.push(ahora)
        l.sentido = -l.sentido
        l.extremo = brillo
      }
      l.muestras.push({ t: ahora, b: brillo })
    }
    const desde = ahora - VENTANA_DESTELLOS_MS
    while (l.cambios.length && l.cambios[0] < desde) l.cambios.shift()
    while (l.muestras.length > 1 && l.muestras[0].t < desde) l.muestras.shift()
    const n = l.cambios.length
    if (!l.conmuta && n > CAMBIOS_ENTRA) [l.conmuta, l.bajoDesde] = [true, null]
    else if (l.conmuta) {
      if (n > CAMBIOS_SALE) l.bajoDesde = null
      else if (l.bajoDesde === null) l.bajoDesde = ahora
      else if (ahora - l.bajoDesde >= VENTANA_DESTELLOS_MS) [l.conmuta, l.bajoDesde] = [false, null]
    }
    if (!l.conmuta) return { brillo, conmuta: false }
    const medio = l.muestras.reduce((s, m) => s + m.b, 0) / l.muestras.length
    return { brillo: medio, conmuta: true }
  }

  /** Al detener o al volver a simular: nada de antes cuenta. */
  reiniciar(): void {
    this.luces.clear()
  }
}
