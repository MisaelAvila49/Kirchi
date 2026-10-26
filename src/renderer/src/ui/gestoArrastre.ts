export type FaseArrastre = 'mover' | 'soltar' | 'cancelar'

/** Distancia en px que el puntero debe recorrer para que un clic se vuelva arrastre. */
export const UMBRAL_ARRASTRE = 4

/**
 * Gesto de las filas que se toman con clic o se arrastran al lienzo. El clic que sigue a un arrastre se descarta con `clicCon`.
 */
export function crearGestoArrastre() {
  let suprimirClic = false
  const iniciar = (ev: PointerEvent, arrastrar: (m: PointerEvent, fase: FaseArrastre) => void) => {
    if (ev.button !== 0) return
    // Un clic suprimido de un gesto anterior que nunca llegó no debe comerse el clic de este.
    suprimirClic = false
    const boton = ev.currentTarget as HTMLElement
    const x0 = ev.clientX, y0 = ev.clientY
    let arrastrando = false
    let vivo = true
    boton.setPointerCapture(ev.pointerId)
    const terminar = (m: PointerEvent, fase: FaseArrastre) => {
      if (!vivo) return
      vivo = false
      boton.removeEventListener('pointermove', mover)
      boton.removeEventListener('pointerup', soltar)
      boton.removeEventListener('pointercancel', cancelar)
      boton.removeEventListener('lostpointercapture', cancelar)
      if (!arrastrando) return
      suprimirClic = true
      arrastrar(m, fase)
    }
    const mover = (m: PointerEvent) => {
      // El botón derecho apretado durante el arrastre lo cancela (como cancela una colocación).
      if (m.buttons & 2) return terminar(m, 'cancelar')
      if (!arrastrando && Math.hypot(m.clientX - x0, m.clientY - y0) < UMBRAL_ARRASTRE) return
      arrastrando = true
      arrastrar(m, 'mover')
    }
    const soltar = (m: PointerEvent) => terminar(m, 'soltar')
    const cancelar = (m: PointerEvent) => terminar(m, 'cancelar')
    boton.addEventListener('pointermove', mover)
    boton.addEventListener('pointerup', soltar)
    boton.addEventListener('pointercancel', cancelar)
    boton.addEventListener('lostpointercapture', cancelar)
  }
  const clicCon = (tomar: () => void) => {
    if (suprimirClic) {
      suprimirClic = false
      return
    }
    tomar()
  }
  return { iniciar, clicCon }
}
