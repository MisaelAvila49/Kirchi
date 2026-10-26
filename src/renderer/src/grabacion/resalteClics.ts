/** Anillo de 400 ms en el punto del clic, solo mientras se graba. Vive en el DOM sobre la aplicación para que la captura
 * lo incluya; sin animación permanente. */
export const DURACION_RESALTE_MS = 400
export const DIAMETRO_RESALTE = 44

export interface DepsResalte {
  /** Escucha los clics (coordenadas de la ventana); devuelve cómo dejar de escuchar. */
  escuchar(f: (x: number, y: number) => void): () => void
  /** Pone el anillo y devuelve cómo quitarlo. */
  poner(x: number, y: number): () => void
  esperar(f: () => void, ms: number): void
  /** Falso mientras no se graba (también en pausa: el cuadro no se captura). */
  activo(): boolean
}

export function instalarResalte(d: DepsResalte): () => void {
  return d.escuchar((x, y) => {
    if (!d.activo()) return
    const quitar = d.poner(x, y)
    d.esperar(quitar, DURACION_RESALTE_MS)
  })
}

/** Las dependencias reales: un `div` fijo con un contorno del color de acento, que se desvanece y se agranda. */
export function depsDelDocumento(doc: Document, activo: () => boolean): DepsResalte {
  return {
    escuchar: (f) => {
      const oyente = (e: PointerEvent) => f(e.clientX, e.clientY)
      doc.addEventListener('pointerdown', oyente, true)
      return () => doc.removeEventListener('pointerdown', oyente, true)
    },
    poner: (x, y) => {
      const el = doc.createElement('div')
      el.setAttribute('aria-hidden', 'true')
      el.dataset.resalteClic = ''
      Object.assign(el.style, {
        position: 'fixed',
        left: `${x - DIAMETRO_RESALTE / 2}px`,
        top: `${y - DIAMETRO_RESALTE / 2}px`,
        width: `${DIAMETRO_RESALTE}px`,
        height: `${DIAMETRO_RESALTE}px`,
        boxSizing: 'border-box',
        border: '3px solid var(--rojo)',
        borderRadius: '50%',
        background: 'transparent',
        pointerEvents: 'none',
        zIndex: '2147483647'
      })
      doc.body.appendChild(el)
      el.animate?.(
        [
          { opacity: 1, transform: 'scale(0.5)' },
          { opacity: 0, transform: 'scale(1.25)' }
        ],
        { duration: DURACION_RESALTE_MS, easing: 'ease-out', fill: 'forwards' }
      )
      return () => el.remove()
    },
    esperar: (f, ms) => void setTimeout(f, ms),
    activo
  }
}
