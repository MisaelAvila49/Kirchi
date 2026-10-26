import { createEffect, createMemo, onCleanup, Show } from 'solid-js'
import type { Camera } from '../canvas/camera'
import type { Documento, Punto } from '../doc/tipos'
import { cssRgba, TOKEN_DE_TINTA, type Paleta } from '../lienzo/paleta'
import {
  aMinimapa, cablesDelMinimapa, cajaDeDocumento, deMinimapa, encuadreConVista, figurasDelMinimapa, minimapaVisible, ponerRespaldo, rectDeCaja, respaldoMinimapa,
  type CajaDePieza, type Encuadre
} from './geometriaMinimapa'

const ANCHO = 180
const ALTO = 120

interface Props {
  doc: Documento
  cam: Camera
  vista: { ancho: number; alto: number }
  paleta: Paleta
  /** La caja de cada pieza en el mundo (con su símbolo y su giro); sin ella, un cuadro alrededor de su posición. */
  cajaPieza?: CajaDePieza
  onSaltar(p: Punto): void
}

/**
 * Minimapa: piezas como bloques, cables como líneas finas y marco de la vista sin relleno. Clic para ir, arrastrar para mover. Se oculta si todo cabe en la vista.
 */
export default function Minimapa(props: Props) {
  const vista = () => ({ minX: props.cam.x, minY: props.cam.y, maxX: props.cam.x + props.vista.ancho / props.cam.zoom, maxY: props.cam.y + props.vista.alto / props.cam.zoom })
  // Antes de saber el tamaño de la vista (0 × 0) no se muestra: nada cabe en un área vacía.
  const caja = createMemo(() => cajaDeDocumento(props.doc, 4, props.cajaPieza))
  const visible = () => props.vista.ancho > 0 && props.vista.alto > 0 && minimapaVisible(caja(), vista())
  return (
    <Show when={visible()}>
      <Lienzo {...props} caja={caja()} />
    </Show>
  )
}

function Lienzo(props: Props & { caja: ReturnType<typeof cajaDeDocumento> }) {
  let canvas!: HTMLCanvasElement
  let encuadre: Encuadre | null = null
  /** El encuadre que había al empezar un arrastre: mientras dura, la escala no sigue a la vista. */
  let congelado: Encuadre | null = null
  let raf = 0

  const dibujar = () => {
    raf = 0
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    // Con la ventana oculta (minimizada) el respaldo se libera; al volver a verse se recrea y se dibuja.
    const visible = document.visibilityState !== 'hidden'
    ponerRespaldo(canvas, respaldoMinimapa(visible, ANCHO, ALTO, dpr))
    if (!visible) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, ANCHO, ALTO)
    const cam = props.cam
    const v = { minX: cam.x, minY: cam.y, maxX: cam.x + props.vista.ancho / cam.zoom, maxY: cam.y + props.vista.alto / cam.zoom }
    const e = encuadreConVista(props.caja, v, ANCHO, ALTO, congelado)
    encuadre = e
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    // Las figuras debajo de todo, como en el lienzo: su contorno de 1 px en su tinta y con su opacidad (con tope).
    ctx.lineWidth = 1
    for (const f of figurasDelMinimapa(props.doc, e)) {
      ctx.globalAlpha = f.opacidad / 100
      ctx.strokeStyle = cssRgba(props.paleta[TOKEN_DE_TINTA[f.tinta]])
      ctx.beginPath()
      if (f.tipo === 'rectangulo') ctx.rect(f.x1, f.y1, f.x2 - f.x1, f.y2 - f.y1)
      else if (f.tipo === 'elipse') ctx.ellipse((f.x1 + f.x2) / 2, (f.y1 + f.y2) / 2, Math.abs(f.x2 - f.x1) / 2, Math.abs(f.y2 - f.y1) / 2, 0, 0, 2 * Math.PI)
      else {
        ctx.moveTo(f.x1, f.y1)
        ctx.lineTo(f.x2, f.y2)
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    // Primero los cuerpos como bloques simples (sin símbolo: a este tamaño solo dirían ruido) y encima los cables como líneas
    // finas, que así se ven llegar a cada bloque. El bloque va en gris de texto secundario, con un contorno del color del panel
    // que separa a los que se tocan; el cable, en el color de los cables del lienzo.
    for (const p of Object.values(props.doc.piezas)) {
      const k = props.cajaPieza?.(p)
      const r = k ? rectDeCaja(e, k) : (() => { const m = aMinimapa(e, p); return { x: m.x - 1.5, y: m.y - 1.5, ancho: 3, alto: 3 } })()
      ctx.fillStyle = cssRgba(props.paleta.textoSecundario)
      ctx.fillRect(r.x, r.y, r.ancho, r.alto)
      ctx.strokeStyle = cssRgba(props.paleta.paneles)
      ctx.lineWidth = 1
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.ancho - 1, r.alto - 1)
    }
    ctx.strokeStyle = cssRgba(props.paleta.cable)
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const c of cablesDelMinimapa(props.doc, e)) {
      ctx.moveTo(c[0].x, c[0].y)
      for (let i = 1; i < c.length; i++) ctx.lineTo(c[i].x, c[i].y)
    }
    ctx.stroke()
    // El marco de la vista, solo contorno: sin relleno que oculte el dibujo. Un borde de 2 px del color de selección con un
    // filete del color del panel por fuera, que lo separa de los bloques oscuros en los dos temas.
    const a = aMinimapa(e, { x: v.minX, y: v.minY })
    const b = aMinimapa(e, { x: v.maxX, y: v.maxY })
    ctx.strokeStyle = cssRgba(props.paleta.paneles)
    ctx.lineWidth = 4
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
    ctx.strokeStyle = cssRgba(props.paleta.seleccion)
    ctx.lineWidth = 2
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
  }

  createEffect(() => {
    void props.doc
    void props.caja
    void props.cam
    void props.vista
    void props.paleta
    if (!raf) raf = requestAnimationFrame(dibujar)
  })
  // Con la página oculta no corre requestAnimationFrame: el respaldo se libera aquí y no en el siguiente cuadro.
  const alVerse = () => {
    if (document.visibilityState === 'hidden') {
      cancelAnimationFrame(raf)
      raf = 0
      ponerRespaldo(canvas, respaldoMinimapa(false, ANCHO, ALTO, 1))
    } else if (!raf) raf = requestAnimationFrame(dibujar)
  }
  document.addEventListener('visibilitychange', alVerse)
  onCleanup(() => {
    cancelAnimationFrame(raf)
    document.removeEventListener('visibilitychange', alVerse)
  })

  const saltar = (e: PointerEvent) => {
    if (!encuadre) return
    const r = canvas.getBoundingClientRect()
    props.onSaltar(deMinimapa(encuadre, { x: e.clientX - r.left, y: e.clientY - r.top }))
  }
  const soltar = () => {
    if (!congelado) return
    congelado = null
    canvas.classList.remove('arrastrando')
    if (!raf) raf = requestAnimationFrame(dibujar)
  }

  return (
    <canvas
      ref={canvas}
      class="minimapa"
      data-reserva
      style={{ width: `${ANCHO}px`, height: `${ALTO}px` }}
      role="img"
      aria-label="Minimapa del esquema. Clic para ir a un punto, arrastrar para mover la vista."
      onPointerDown={(e) => {
        canvas.setPointerCapture(e.pointerId)
        congelado = encuadre
        canvas.classList.add('arrastrando')
        saltar(e)
      }}
      onPointerMove={(e) => {
        if (e.buttons & 1) saltar(e)
      }}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onLostPointerCapture={soltar}
    />
  )
}
