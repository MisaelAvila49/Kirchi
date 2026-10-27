import { createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import type { Tema } from '../../../../compartido/ajustes'
import type { AspectoGrafica, LadoEjeY, PosicionEjeX } from '../../../../compartido/grafica/aspecto'
import { ladoPorArrastre, posicionXPorArrastre } from '../../../../compartido/grafica/ejes'
import { Rueda } from '../osciloscopio/rueda'
import { zonaColocada } from './colocacion'
import { dibujarGrafica, geometriaGrafica, type Geometria } from './dibujo'
import { lecturaEn, type LecturaEn } from './lectura'
import { cursorXYBajo, moverCursorXY, pasoDeFlechaXY, ponerCursorXY } from './xy'
import { cursorBajo, desplazarTeclado, panelEn, ponerCursorEn, zoomCajaEn, zoomRueda, zoomTeclado } from './gestos'
import type { ModeloGrafica, VistaGrafica } from './modelo'
import { coloresGrafica, temaEfectivo } from './paleta'

interface Props {
  modelo: ModeloGrafica
  vista: VistaGrafica
  aspecto: AspectoGrafica
  /** El tema de la aplicación (el de la gráfica puede ser otro). */
  tema: Tema
  /** Un resumen para quien no ve el lienzo: qué se grafica y el intervalo de cada traza. */
  descripcion: string
  /** Los cursores están encendidos: se pueden arrastrar y mover con el teclado. */
  cursores: boolean
  /** La lectura de los cursores con todos sus datos (los dos valores de cada uno). */
  detalleCursores?: boolean
  onVista(v: VistaGrafica): void
  /** Un eje vertical arrastrado: las trazas que lo comparten y el lado donde quedó. */
  onEjeY?(claves: readonly string[], lado: LadoEjeY): void
  /** El eje horizontal arrastrado: dónde quedó. */
  onEjeX?(pos: PosicionEjeX): void
  ref?: (c: HTMLCanvasElement) => void
}

/** Tolerancia para tomar un cursor con el puntero, en píxeles CSS. */
const TOMAR_PX = 8
/** Cuánto mueve una flecha un cursor: un por ciento de lo que se ve (con Shift, diez). */
const PASO_TECLA = 0.01

/**
 * Gráfica interactiva en Canvas2D con el dibujo compartido (`dibujo.ts`): un dibujo por cuadro y solo si cambia algo.
 */
export default function GraficaCanvas(props: Props) {
  let canvas!: HTMLCanvasElement
  const [tam, setTam] = createSignal({ w: 0, h: 0, dpr: 1 })
  const [sobre, setSobre] = createSignal<0 | 1 | null>(null)
  const [arrastrado, setArrastrado] = createSignal<0 | 1 | null>(null)
  const [activo, setActivo] = createSignal<0 | 1>(0)
  const [enfocada, setEnfocada] = createSignal(false)
  const [caja, setCaja] = createSignal<{ p: number; x0: number; y0: number; x1: number; y1: number } | null>(null)
  // Lo que lee el puntero (la cruz y los valores) y si está sobre un eje que se puede mover.
  const [leyendo, setLeyendo] = createSignal<LecturaEn | null>(null)
  const [sobreEje, setSobreEje] = createSignal(false)
  const [moviendoEje, setMoviendoEje] = createSignal(false)
  let pedido = 0
  const colores = createMemo(() => coloresGrafica(temaEfectivo(props.aspecto.tema, props.tema)))
  const geo = (): Geometria => {
    const { w, h, dpr } = tam()
    return geometriaGrafica(props.modelo, props.vista, props.aspecto, w, h, dpr)
  }
  const resaltado = (): 0 | 1 | null => arrastrado() ?? sobre() ?? (enfocada() && props.cursores && props.vista.cursores ? activo() : null)

  const dibujar = () => {
    pedido = 0
    const { w, h, dpr } = tam()
    const ctx = canvas.getContext('2d')
    if (!ctx || w === 0 || h === 0) return
    dibujarGrafica(ctx, props.modelo, props.vista, props.aspecto, colores(), w, h, {
      dpr, cursorResaltado: resaltado(), asas: props.modelo.tipo === 'lineas', detalleCursores: props.detalleCursores, lectura: props.aspecto.lectura ? leyendo() : null
    })
    const b = caja()
    if (b) {
      ctx.save()
      ctx.strokeStyle = colores().texto
      ctx.lineWidth = dpr
      ctx.setLineDash([4 * dpr, 3 * dpr])
      ctx.beginPath()
      ctx.rect(Math.min(b.x0, b.x1) + 0.5, Math.min(b.y0, b.y1) + 0.5, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0))
      ctx.stroke()
      ctx.restore()
    }
  }
  const pedir = () => {
    if (!pedido) pedido = requestAnimationFrame(dibujar)
  }
  onMount(() => {
    props.ref?.(canvas)
    const ro = new ResizeObserver(([e]) => {
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(1, Math.round(e.contentRect.width * dpr))
      const h = Math.max(1, Math.round(e.contentRect.height * dpr))
      if (w === tam().w && h === tam().h && dpr === tam().dpr) return
      canvas.width = w
      canvas.height = h
      setTam({ w, h, dpr })
    })
    ro.observe(canvas)
    onCleanup(() => {
      ro.disconnect()
      if (pedido) cancelAnimationFrame(pedido)
    })
  })
  createEffect(() => {
    void props.modelo
    void props.vista
    void props.aspecto
    void props.tema
    void colores()
    void resaltado()
    void caja()
    void leyendo()
    void props.detalleCursores
    void tam()
    pedir()
  })

  const enPixeles = (e: PointerEvent | WheelEvent) => {
    const r = canvas.getBoundingClientRect()
    const { w, h } = tam()
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h }
  }
  type Eje = { tipo: 'ejeY'; p: number; claves: string[]; lado: LadoEjeY } | { tipo: 'ejeX'; p: number; pos: PosicionEjeX }
  let tomado: { tipo: 'cursor'; i: 0 | 1 } | { tipo: 'caja'; p: number; x0: number; y0: number } | Eje | null = null
  /** El eje que hay bajo el puntero (su columna o la banda del eje horizontal), si se puede mover. */
  const ejeBajo = (g: Geometria, x: number, y: number): Eje | null => {
    if (props.modelo.tipo !== 'lineas') return null
    const p = panelEn(g, x, y)
    if (p === null) return null
    const pan = g.paneles[p]
    const z = zonaColocada(pan.col, x, y - pan.y0)
    if (z?.tipo === 'columna') {
      const gr = pan.grupos[z.i]
      if (!gr || gr.trazas.length === 0) return null
      return { tipo: 'ejeY', p, claves: [...new Set(gr.trazas.map((i) => props.modelo.trazas[i].clave))], lado: gr.lado }
    }
    if (z?.tipo === 'ejeX' && pan.col.eje.posicion !== 'ninguno') return { tipo: 'ejeX', p, pos: props.aspecto.ejeX }
    return null
  }
  /** El cursor bajo el puntero: en X-Y, por distancia al punto de la curva; si no, por el eje horizontal. */
  const cursorAqui = (g: Geometria, x: number, y: number) => (props.modelo.xy ? cursorXYBajo(props.modelo, props.vista, g, x, y, TOMAR_PX * g.dpr) : cursorBajo(g, props.vista, x, y, TOMAR_PX))
  const abajo = (e: PointerEvent) => {
    if (e.button !== 0 || props.modelo.tipo !== 'lineas') return
    const q = enPixeles(e)
    const g = geo()
    setLeyendo(null)
    const i0 = cursorAqui(g, q.x, q.y)
    const eje = i0 === null ? ejeBajo(g, q.x, q.y) : null
    if (eje) {
      tomado = eje
      setMoviendoEje(true)
      canvas.setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }
    const i = cursorAqui(g, q.x, q.y)
    if (i !== null) {
      tomado = { tipo: 'cursor', i }
      setArrastrado(i)
      canvas.setPointerCapture(e.pointerId)
      return
    }
    const p = panelEn(g, q.x, q.y)
    if (p === null) return
    const c = g.paneles[p].col
    const y = q.y - g.paneles[p].y0
    if (q.x < c.x || q.x > c.x + c.w || y < c.y || y > c.y + c.h) return
    tomado = { tipo: 'caja', p, x0: q.x, y0: q.y }
    canvas.setPointerCapture(e.pointerId)
  }
  const mover = (e: PointerEvent) => {
    const q = enPixeles(e)
    if (!tomado) {
      const g = geo()
      setSobre(props.modelo.tipo === 'lineas' ? cursorAqui(g, q.x, q.y) : null)
      const eje = ejeBajo(g, q.x, q.y)
      setSobreEje(eje !== null)
      setLeyendo(props.aspecto.lectura && eje === null ? lecturaEn(props.modelo, props.vista, g, q.x, q.y) : null)
      return
    }
    if (tomado.tipo === 'ejeY' || tomado.tipo === 'ejeX') {
      const g = geo()
      const pan = g.paneles[tomado.p]
      if (tomado.tipo === 'ejeY') {
        const lado = ladoPorArrastre((q.x - pan.col.x) / pan.col.w, tomado.lado)
        if (lado !== tomado.lado) {
          tomado.lado = lado
          props.onEjeY?.(tomado.claves, lado)
        }
      } else {
        const pos = posicionXPorArrastre((q.y - pan.y0 - pan.col.y) / pan.col.h, tomado.pos)
        if (pos !== tomado.pos) {
          tomado.pos = pos
          props.onEjeX?.(pos)
        }
      }
      return
    }
    if (tomado.tipo === 'cursor') {
      props.onVista(props.modelo.xy ? ponerCursorXY(props.modelo, props.vista, geo(), tomado.i, q.x, q.y) : ponerCursorEn(geo(), props.vista, tomado.i, q.x))
      return
    }
    setCaja({ p: tomado.p, x0: tomado.x0, y0: tomado.y0, x1: q.x, y1: q.y })
  }
  const soltar = (e: PointerEvent) => {
    const t = tomado
    tomado = null
    setMoviendoEje(false)
    setArrastrado(null)
    const b = caja()
    setCaja(null)
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    if (t?.tipo === 'caja' && b) props.onVista(zoomCajaEn(geo(), props.vista, t.p, b.x0, b.y0, b.x1, b.y1))
  }
  const muescas = new Rueda()
  const rueda = (e: WheelEvent) => {
    if (props.modelo.tipo !== 'lineas') return
    const q = enPixeles(e)
    const g = geo()
    if (panelEn(g, q.x, q.y) === null) return
    e.preventDefault()
    const dir = muescas.paso(e)
    if (dir) props.onVista(zoomRueda(g, props.vista, q.x, q.y, dir, e.shiftKey, props.modelo.ejeX.datos))
  }
  const tecla = (e: KeyboardEvent) => {
    if (e.metaKey || e.altKey) return
    const v = props.vista
    if (props.modelo.tipo === 'lineas') {
      // Zoom y desplazamiento sin ratón. Ctrl + / Ctrl − son el zoom de toda la interfaz y no se tocan.
      if (!e.ctrlKey && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_')) {
        e.preventDefault()
        props.onVista(zoomTeclado(geo(), v, e.key === '+' || e.key === '=' ? -1 : 1, props.modelo.ejeX.datos))
        return
      }
      if (e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        props.onVista(desplazarTeclado(geo(), v, e.key === 'ArrowRight' ? 1 : -1, props.modelo.ejeX.datos))
        return
      }
    }
    if (e.ctrlKey) return
    if (e.key === 'Home') {
      e.preventDefault()
      props.onVista({ ...v, x: null, y: [] })
      return
    }
    if (!props.cursores || !v.cursores) return
    if (e.key === '1' || e.key === '2') {
      setActivo(e.key === '1' ? 0 : 1)
      e.preventDefault()
      return
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const g = geo()
    if (props.modelo.xy) {
      const n = pasoDeFlechaXY(props.modelo, v) * (e.shiftKey ? 10 : 1)
      props.onVista(moverCursorXY(props.modelo, v, g, activo(), e.key === 'ArrowRight' ? n : -n))
      return
    }
    const col = g.paneles[0].col
    const paso = (e.shiftKey ? 10 : 1) * PASO_TECLA * col.w * (e.key === 'ArrowRight' ? 1 : -1)
    const actual = v.cursores[activo()]
    // El píxel actual del cursor más el paso: el mismo camino que arrastrarlo, así en log el paso es proporcional.
    const px = col.x + ((g.escalaX === 'log' ? Math.log10(actual) - Math.log10(g.x.min) : actual - g.x.min) / (g.escalaX === 'log' ? Math.log10(g.x.max) - Math.log10(g.x.min) : g.x.max - g.x.min)) * col.w
    props.onVista(ponerCursorEn(g, v, activo(), px + paso))
  }
  return (
    <canvas
      ref={canvas}
      class="gr-lienzo"
      classList={{ 'sobre-cursor-t': (arrastrado() ?? sobre()) !== null, 'sobre-eje': sobreEje() && !moviendoEje(), 'moviendo-eje': moviendoEje() }}
      tabindex={0}
      role="group"
      aria-roledescription="gráfica"
      aria-label={props.descripcion}
      onKeyDown={tecla}
      onFocus={() => setEnfocada(true)}
      onBlur={() => setEnfocada(false)}
      onPointerDown={abajo}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onPointerLeave={() => (setSobre(null), setSobreEje(false), setLeyendo(null))}
      onDblClick={() => props.onVista({ ...props.vista, x: null, y: [] })}
      on:wheel={{ handleEvent: rueda, passive: false }}
    />
  )
}
