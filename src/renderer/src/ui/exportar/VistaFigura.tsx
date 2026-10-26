import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import type { Lienzo2D } from '../osciloscopio/dibujar'

interface Props {
  /** Tamaño de la figura a 1× (px CSS) y su dibujo con `k` px de lienzo por px CSS. */
  ancho: number
  alto: number
  dibujar(ctx: Lienzo2D, k: number): void
  /** Lo que lee el dibujo y debe rehacerse (opciones, datos): se vuelve a dibujar cuando cambia. */
  version?: unknown
}

/**
 * Vista previa de una figura en `<canvas>`, con la misma función que el PNG. A lo más un dibujo por cuadro. La figura llega ya recortada al tramo.
 */
export default function VistaFigura(props: Props) {
  let caja!: HTMLDivElement
  let lienzo!: HTMLCanvasElement
  const [medida, setMedida] = createSignal({ w: 0, dpr: 1 })
  let pedido = 0
  // La vista no pasa del 34 % del alto de la ventana: la figura se achica (conserva su forma) y el diálogo deja sitio a los bloques.
  const ancho = () => {
    const { w } = medida()
    return Math.max(0, Math.min(w, Math.floor((Math.max(180, window.innerHeight * 0.34) * props.ancho) / props.alto)))
  }
  const dibujar = () => {
    pedido = 0
    const { dpr } = medida()
    const w = ancho()
    const ctx = lienzo.getContext('2d')
    if (!ctx || w <= 0) return
    const k = (w * dpr) / props.ancho
    lienzo.width = Math.round(props.ancho * k)
    lienzo.height = Math.round(props.alto * k)
    lienzo.style.width = `${w}px`
    lienzo.style.height = `${(w * props.alto) / props.ancho}px`
    props.dibujar(ctx as unknown as Lienzo2D, k)
  }
  onMount(() => {
    const ro = new ResizeObserver(([e]) => setMedida({ w: Math.floor(e.contentRect.width), dpr: window.devicePixelRatio || 1 }))
    ro.observe(caja)
    // Cambiar el alto de la ventana cambia el ancho que cabe sin que cambie el de la caja.
    const alCambiar = () => setMedida((m) => ({ ...m }))
    window.addEventListener('resize', alCambiar)
    onCleanup(() => {
      window.removeEventListener('resize', alCambiar)
      ro.disconnect()
      if (pedido) cancelAnimationFrame(pedido)
    })
  })
  createEffect(() => {
    void props.version
    void medida()
    if (!pedido) pedido = requestAnimationFrame(dibujar)
  })
  return (
    <div class="vista-figura" ref={caja}>
      <canvas ref={lienzo} aria-hidden="true" />
    </div>
  )
}
