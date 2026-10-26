/** Ventana de tiempo y distancia (px CSS) para que dos pulsaciones del botón derecho cuenten como doble clic. */
export const DOBLE_MS = 400
export const DOBLE_PX = 4

/** Reconoce el doble clic de un botón por sus pulsaciones (el navegador solo da `dblclick` para el izquierdo). Tras un
 * doble, la siguiente pulsación empieza de cero. */
export class DetectorDobleClic {
  private previa: { x: number; y: number; t: number } | null = null

  constructor(private ventana = DOBLE_MS) {}

  pulsar(x: number, y: number, t: number): boolean {
    const p = this.previa
    const doble = p !== null && t - p.t <= this.ventana && Math.hypot(x - p.x, y - p.y) <= DOBLE_PX
    this.previa = doble ? null : { x, y, t }
    return doble
  }

  /** La siguiente pulsación empieza de cero. */
  olvidar(): void {
    this.previa = null
  }
}

/** Ventana del doble clic izquierdo en el lienzo: la de Windows por omisión (500 ms), con la misma tolerancia de 4 px. */
export const DOBLE_IZQ_MS = 500

/** Doble clic contado por la aplicación: Chromium sigue sumando clics en su ventana y solo da `dblclick` en el segundo,
 * así que tras abrir el buscador el cuarto y quinto no lo reabrían. Aquí el segundo clic en 500 ms y 4 px es doble; uno
 * que solo cerró algo o se arrastró más de 4 px no cuenta como primero. */
export class ClicsDelLienzo {
  private detector = new DetectorDobleClic(DOBLE_IZQ_MS)
  private enCurso: { x: number; y: number; doble: boolean } | null = null

  /** Pulsación del botón izquierdo; `consumida` si solo cerró algo abierto. */
  abajo(x: number, y: number, t: number, consumida: boolean): void {
    if (consumida) {
      this.reiniciar()
      return
    }
    this.enCurso = { x, y, doble: this.detector.pulsar(x, y, t) }
  }

  /** Al soltar: true si completa un doble clic. */
  arriba(x: number, y: number, _t: number): boolean {
    const c = this.enCurso
    this.enCurso = null
    if (!c) return false
    if (Math.hypot(x - c.x, y - c.y) > DOBLE_PX) {
      // Fue un arrastre: ni es doble ni cuenta como primer clic.
      this.detector.olvidar()
      return false
    }
    return c.doble
  }

  reiniciar(): void {
    this.enCurso = null
    this.detector.olvidar()
  }
}
