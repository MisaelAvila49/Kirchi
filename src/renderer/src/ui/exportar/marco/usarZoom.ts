import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { ajustar, desplazar, zoomEn, type TamanoFigura, type VistaZoom } from '../editor/zoom'

/** Lo que se acerca de una vez con la rueda o con los botones. */
export const PASO_ZOOM = 1.25

/**
 * Zoom y desplazamiento de la vista previa, compartidos por el editor de gráficas y el del esquema. Mientras el lector no toque el zoom, un cambio de tamaño reencuadra.
 */
export function usarZoom(caja: () => HTMLElement, tam: () => TamanoFigura) {
  const [medida, setMedida] = createSignal({ w: 0, h: 0, dpr: 1 })
  const [vz, setVz] = createSignal<VistaZoom>({ k: 1, tx: 0, ty: 0 })
  /** Si el lector ya acercó o movió la figura, un cambio de tamaño de la caja no la reencuadra. */
  let tocada = false
  const ajustarVista = () => {
    const { w, h } = medida()
    if (w > 0) setVz(ajustar({ w, h }, tam()))
    tocada = false
  }
  onMount(() => {
    const el = caja()
    const ro = new ResizeObserver(([e]) => {
      setMedida({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height), dpr: window.devicePixelRatio || 1 })
      if (!tocada) ajustarVista()
    })
    ro.observe(el)
    // La rueda tiene que poder cancelarse: el oyente no es pasivo.
    const rueda = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const f = e.deltaY < 0 ? PASO_ZOOM : 1 / PASO_ZOOM
      tocada = true
      setVz((v) => zoomEn(v, f, e.clientX - r.left, e.clientY - r.top, { w: medida().w, h: medida().h }, tam()))
    }
    el.addEventListener('wheel', rueda, { passive: false })
    onCleanup(() => {
      ro.disconnect()
      el.removeEventListener('wheel', rueda)
    })
  })
  // Una figura de otro tamaño se vuelve a encuadrar mientras el lector no haya tocado el zoom.
  createEffect(() => {
    void tam().fw
    void tam().fh
    if (!tocada) ajustarVista()
  })
  /** Acerca (`factor` mayor que 1) o aleja alrededor del centro de la caja. */
  const acercar = (factor: number) => {
    tocada = true
    const { w, h } = medida()
    setVz((v) => zoomEn(v, factor, w / 2, h / 2, { w, h }, tam()))
  }
  /** Mueve la figura `dx`, `dy` px de pantalla. */
  const mover = (dx: number, dy: number) => {
    tocada = true
    setVz((v) => desplazar(v, dx, dy, { w: medida().w, h: medida().h }, tam()))
  }
  return { medida, vz, ajustarVista, acercar, mover }
}
