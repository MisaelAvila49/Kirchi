/** Píxeles de una muesca de la rueda de un ratón (Chromium da 100 por muesca en Windows; algunos ratones, 120). */
export const PX_POR_MUESCA = 100
/** Píxeles por línea y por página cuando el evento no viene en píxeles (`deltaMode` 1 y 2). */
const PX_POR_LINEA = 40
const PX_POR_PAGINA = 800
/** Tras esta pausa (ms) lo juntado se olvida: un medio movimiento de hace rato no completa el siguiente. */
const PAUSA_MS = 400

/**
 * Rueda de los controles de la serie 1, 2 y 5: un paso por muesca. Un panel táctil manda muchos eventos chicos, así que se juntan hasta una muesca, se ignoran los sin movimiento vertical y no se acumula más de una pendiente.
 */
export class Rueda {
  private acumulado = 0
  private ultimo = -Infinity
  constructor(private readonly ahora: () => number = () => performance.now()) {}

  /** El paso de este evento: 1 hacia abajo, −1 hacia arriba o 0 si todavía no completa una muesca. */
  paso(e: Pick<WheelEvent, 'deltaY' | 'deltaMode'>): -1 | 0 | 1 {
    if (!e.deltaY) return 0
    const t = this.ahora()
    if (t - this.ultimo > PAUSA_MS) this.acumulado = 0
    this.ultimo = t
    const px = e.deltaMode === 1 ? e.deltaY * PX_POR_LINEA : e.deltaMode === 2 ? e.deltaY * PX_POR_PAGINA : e.deltaY
    // Un cambio de sentido empieza de cero.
    if (Math.sign(px) !== Math.sign(this.acumulado)) this.acumulado = 0
    this.acumulado += px
    if (Math.abs(this.acumulado) < PX_POR_MUESCA * 0.95) return 0
    const dir = this.acumulado > 0 ? 1 : -1
    this.acumulado = Math.max(-PX_POR_MUESCA, Math.min(PX_POR_MUESCA, this.acumulado - dir * PX_POR_MUESCA))
    return dir
  }
}
