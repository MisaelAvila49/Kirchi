import { acotarAltoFranja, ALTO_FRANJA_MIN, altoConTecla, altoFranjaMax } from './altoFranja'

interface Props {
  /** Alto del panel de la franja (px). */
  alto: number
  altoVentana: number
  /** `final`: se soltó el ratón o fue una tecla (se guarda en los ajustes); durante el arrastre, false. */
  onAlto(alto: number, final: boolean): void
}

/**
 * Borde superior de la franja, arrastrable y con teclado (flechas 10 px, con Shift 50 px, Inicio y Fin). Usa `on:keydown` (no delegado) para que `stopPropagation` las aparte de los atajos del lienzo.
 */
export default function SeparadorFranja(props: Props) {
  let inicio: { y: number; alto: number } | null = null
  const altoEn = (e: PointerEvent) => acotarAltoFranja(inicio!.alto + inicio!.y - e.clientY, props.altoVentana)
  const abajo = (e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    inicio = { y: e.clientY, alto: props.alto }
  }
  const mover = (e: PointerEvent) => {
    if (inicio) props.onAlto(altoEn(e), false)
  }
  const soltar = (e: PointerEvent) => {
    if (!inicio) return
    const alto = altoEn(e)
    inicio = null
    props.onAlto(alto, true)
  }
  const tecla = (e: KeyboardEvent) => {
    const nuevo = altoConTecla(props.alto, e, props.altoVentana)
    if (nuevo === null) return
    e.preventDefault()
    e.stopPropagation()
    props.onAlto(nuevo, true)
  }
  return (
    <div
      class="separador-franja"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Alto de los instrumentos"
      aria-valuemin={ALTO_FRANJA_MIN}
      aria-valuemax={altoFranjaMax(props.altoVentana)}
      aria-valuenow={props.alto}
      aria-valuetext={`${props.alto} píxeles`}
      tabindex="0"
      on:pointerdown={abajo}
      on:pointermove={mover}
      on:pointerup={soltar}
      on:pointercancel={soltar}
      on:keydown={tecla}
    />
  )
}
