import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import type { Tema } from '../../../../compartido/ajustes'
import { ASPECTO_OSCILOSCOPIO, escalaDeTexto, type AspectoGrafica, type AspectoTraza, type LadoEjeY, type PosicionEjeX } from '../../../../compartido/grafica/aspecto'
import { ladoPorArrastre, posicionXPorArrastre } from '../../../../compartido/grafica/ejes'
import type { AjustesOsciloscopio, Canal } from '../../instrumentos/ajustes'
import type { PantallaSab } from '../../sim/protocoloInstrumentos'
import { ayudaEjeTiempo } from './panel'
import { cursorCercano, cursorDeTecla, cursoresDelModo, moverCursor, ponerCursor, punteroDeCursor, tiempoDeX, voltajeDeY, type CualCursor } from './cursores'
import { canalesXY, coloresPantalla, dibujarPantalla, type CursoresPantalla } from './dibujar'
import { estiloCifrasDe, estiloDeAspecto } from './estilo'
import { lecturaPantalla, type LecturaOsc } from './lectura'
import { marcaEn, marcoDePantalla, posicionDeY, zonaEn, type Marco } from './marco'
import { temaEfectivo } from '../grafica/paleta'
import { dxDeTecla } from './recorrido'
import { canalHorizontalXY, marcaHorizontalEn, posicionDeX } from './marco'
import { cursorXYCercano, lecturaXY, moverCursorXYTecla, ponerCursorXY } from './xy'
import { Rueda } from './rueda'

/** La escala que cambia la rueda: los voltios por división de un canal o la base de tiempo. */
export type EjeRueda = { tipo: 'canal'; canal: Canal } | { tipo: 'tiempo' }

interface Props {
  pantalla: PantallaSab | null
  ajustes: AjustesOsciloscopio
  tema: Tema
  /** El aspecto de la pantalla (tema de la gráfica, grosor, rejilla, marcas, eje del tiempo) y el de cada canal; sin él, la pantalla de siempre. */
  aspecto?: AspectoGrafica
  canales?: Readonly<Record<string, AspectoTraza>>
  /** Lo que la pantalla muestra, en palabras (el canvas no se lee): canales, escalas y el estado del disparo. */
  descripcion: string
  cursores?: CursoresPantalla | null
  /** El ancho de la retícula en píxeles de dispositivo: las columnas que tiene que armar el worker. */
  onColumnas(n: number): void
  ref?: (c: HTMLCanvasElement) => void
  /** Un cursor arrastrado con el ratón. */
  onCursores?(c: CursoresPantalla): void
  /** La rueda sobre un eje (pantalla): `dir` 1 sube la escala (más por división) y −1 la baja. */
  onEscala?(eje: EjeRueda, dir: 1 | -1): void
  /** La marca de 0 V de un canal arrastrada a `pos` divisiones; `gesto` junta el arrastre en un paso de deshacer. */
  onPosicion?(canal: Canal, pos: number, gesto: string): void
  /** Los cursores con todo su detalle (1/Δt y los dos valores de cada uno). */
  detalleCursores?: boolean
  /** La escala de un canal arrastrada por su asa: dónde quedó (izquierda, en medio o derecha). */
  onLado?(canal: Canal, lado: LadoEjeY): void
  /** El eje del tiempo arrastrado por su asa: dónde quedó. */
  onEjeTiempo?(pos: PosicionEjeX): void
  /** Hay captura que recorrer (detenida o en pausa): arrastrar la retícula, la rueda y las teclas la desplazan. */
  recorrible?: boolean
  /** Desplazar lo que se ve: `dx` en pantallas completas (positivo, hacia lo más nuevo); −Infinity va al principio y +Infinity vuelve al final. */
  onRecorrer?(dx: number): void
}

/** Tolerancia para tomar una marca de 0 V o un cursor, en píxeles CSS. */
const TOMAR_PX = 8
let arrastres = 0

/**
 * Pantalla en Canvas2D: un dibujo por cuadro como mucho y solo si cambia algo. La rueda cambia voltios/div o la base; la marca de 0 V se arrastra (los mandos son la alternativa con teclado).
 */
export default function Pantalla(props: Props) {
  let canvas!: HTMLCanvasElement
  const [tam, setTam] = createSignal({ w: 0, h: 0, dpr: 1 })
  const [sobreMarca, setSobreMarca] = createSignal(false)
  const [sobreTiempo, setSobreTiempo] = createSignal(false)
  // El cursor bajo el puntero o arrastrado, y el que mueven las flechas (tecla 1 o 2) con el foco en la pantalla.
  const [sobreCursor, setSobreCursor] = createSignal<CualCursor | null>(null)
  const [arrastrado, setArrastrado] = createSignal<CualCursor | null>(null)
  const [activo, setActivo] = createSignal<0 | 1>(0)
  const [enfocada, setEnfocada] = createSignal(false)
  // Lo que lee el puntero (la cruz y los voltajes) y si está sobre un eje que se puede mover.
  const [leyendo, setLeyendo] = createSignal<LecturaOsc | null>(null)
  const [sobreEje, setSobreEje] = createSignal(false)
  const [moviendoEje, setMoviendoEje] = createSignal(false)
  const [recorriendo, setRecorriendo] = createSignal(false)
  const cursorDelTeclado = (): CualCursor | null => {
    const c = cursores()
    if (!c || !enfocada()) return null
    if (c.xy) return activo() === 0 ? 't1' : 't2'
    return c.t ? (activo() === 0 ? 't1' : 't2') : c.v ? (activo() === 0 ? 'v1' : 'v2') : null
  }
  /** Los cursores del modo de pantalla actual (los del otro modo no se ven ni se toman). */
  const cursores = () => cursoresDelModo(props.cursores, props.ajustes)
  let pedido = 0
  const aspecto = () => props.aspecto ?? ASPECTO_OSCILOSCOPIO
  const lados = () => Object.fromEntries(Object.entries(props.canales ?? {}).map(([c, t]) => [c, t.lado])) as Partial<Record<Canal, LadoEjeY>>
  const opcionesMarco = () => ({ ejeX: aspecto().ejeX, lados: lados(), escalaTexto: escalaDeTexto(aspecto().textoTam), estiloCifras: estiloCifrasDe(aspecto(), props.canales) })
  const marco = () => {
    const { w, h, dpr } = tam()
    return marcoDePantalla(props.ajustes, w, h, dpr, opcionesMarco())
  }
  const dibujar = () => {
    pedido = 0
    const { w, h, dpr } = tam()
    const ctx = canvas.getContext('2d')
    if (!ctx || w === 0 || h === 0) return
    const a = aspecto()
    const tonos = Object.fromEntries(Object.entries(props.canales ?? {}).map(([c, t]) => [c, t.color]))
    dibujarPantalla(ctx, props.pantalla, props.ajustes, w, h, coloresPantalla(temaEfectivo(a.tema, props.tema), false, tonos), {
      dpr, cursores: cursores(), resaltado: arrastrado() ?? sobreCursor() ?? cursorDelTeclado(), ejes: true,
      sinReticula: !a.rejilla, marcas: a.marcas, grosor: a.grosor, marco: opcionesMarco(),
      estilo: estiloDeAspecto(a, props.canales), asas: true, lectura: a.lectura ? leyendo() : null, detalleCursores: props.detalleCursores
    })
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
  // Las columnas que arma el worker son las del ancho de la retícula: cambian con el tamaño y con los canales encendidos.
  let columnas = -1
  createEffect(() => {
    if (tam().w === 0) return
    const n = Math.max(1, Math.round(marco().w))
    if (n === columnas) return
    columnas = n
    props.onColumnas(n)
  })
  createEffect(() => {
    // Lo que cambia el dibujo: la pantalla (por su versión), los ajustes, el tema, los cursores y el tamaño.
    void props.pantalla?.version
    void props.ajustes
    void props.tema
    void props.aspecto
    void props.canales
    void props.cursores
    void props.detalleCursores
    void leyendo()
    void arrastrado()
    void sobreCursor()
    void cursorDelTeclado()
    void tam()
    pedir()
  })
  const prefijosDeCanales = () => Object.fromEntries(Object.entries(props.canales ?? {}).map(([k, t]) => [k, t.prefijo ?? null]))
  const leer = (p: PantallaSab, m: Marco, x: number, y: number): LecturaOsc | null => (canalesXY(props.ajustes) ? lecturaXY(p, props.ajustes, m, x, y, prefijosDeCanales()) : lecturaPantalla(p, props.ajustes, m, x, prefijosDeCanales(), aspecto().prefijoX))
  /** El cursor bajo (x, y): en X-Y, por distancia al punto de la curva; si no, el de tiempo o el de voltaje. */
  const cursorAqui = (c: CursoresPantalla, x: number, y: number, m: Marco, tol: number): CualCursor | null => {
    if (c.xy) {
      const i = cursorXYCercano(c, props.ajustes, m, x, y, tol)
      return i === null ? null : i === 0 ? 't1' : 't2'
    }
    return props.pantalla ? cursorCercano(c, x - m.x, y - m.y, m.w, m.h, props.pantalla.t0, props.ajustes, tol) : null
  }
  const enPixeles = (e: PointerEvent | WheelEvent) => {
    const r = canvas.getBoundingClientRect()
    const { w, h } = tam()
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h }
  }
  // Arrastrar: una marca de 0 V (en su borde, fuera de la retícula) o un cursor (dentro).
  let tomado: { tipo: 'marca'; canal: Canal; gesto: string; pos: number } | { tipo: 'cursor'; cual: CualCursor } | { tipo: 'canal'; canal: Canal; lado: LadoEjeY } | { tipo: 'tiempo'; pos: PosicionEjeX } | { tipo: 'recorrer'; x: number } | null = null
  const ladoDe = (c: Canal): LadoEjeY => props.canales?.[c]?.lado ?? 'izquierda'
  const abajo = (e: PointerEvent) => {
    if (e.button !== 0) return
    const q = enPixeles(e)
    const m = marco()
    const tol = TOMAR_PX * tam().dpr
    const canal = marcaEn(m, props.ajustes, q.x, q.y, tol) ?? marcaHorizontalEn(m, props.ajustes, q.x, q.y, tol)
    if (canal) {
      const pos = props.ajustes.canales.find((c) => c.canal === canal)!.pos
      tomado = { tipo: 'marca', canal, gesto: `marca-${++arrastres}`, pos }
      canvas.setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }
    const c = cursores()
    const cual = c && props.pantalla ? cursorAqui(c, q.x, q.y, m, tol) : null
    if (c && cual) {
      tomado = { tipo: 'cursor', cual }
      setArrastrado(cual)
      canvas.setPointerCapture(e.pointerId)
      return
    }
    // Un eje por su columna o su banda: se mueve a la izquierda, en medio o a la derecha (el del tiempo, arriba, en medio o abajo).
    const z = zonaEn(m, q.x, q.y)
    if (z?.tipo === 'canal' || z?.tipo === 'tiempo') {
      tomado = z.tipo === 'canal' ? { tipo: 'canal', canal: z.canal, lado: ladoDe(z.canal) } : { tipo: 'tiempo', pos: aspecto().ejeX }
      setLeyendo(null)
      setMoviendoEje(true)
      canvas.setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }
    // Dentro de la retícula y sin nada que tomar: arrastrar desplaza lo capturado (la traza sigue al puntero).
    if (props.recorrible && z?.tipo === 'pantalla') {
      tomado = { tipo: 'recorrer', x: q.x }
      setRecorriendo(true)
      setLeyendo(null)
      canvas.setPointerCapture(e.pointerId)
      e.preventDefault()
    }
  }
  const mover = (e: PointerEvent) => {
    const q = enPixeles(e)
    const m = marco()
    if (!tomado) {
      const tol = TOMAR_PX * tam().dpr
      const marca = (marcaEn(m, props.ajustes, q.x, q.y, tol) ?? marcaHorizontalEn(m, props.ajustes, q.x, q.y, tol)) !== null
      setSobreMarca(marca)
      const c = cursores()
      const cur = c && props.pantalla ? cursorAqui(c, q.x, q.y, m, tol) : null
      setSobreCursor(cur)
      const z = zonaEn(m, q.x, q.y)
      setSobreEje(!marca && cur === null && (z?.tipo === 'canal' || z?.tipo === 'tiempo'))
      setSobreTiempo(z?.tipo === 'tiempo')
      const a = aspecto()
      const l = a.lectura && !marca && cur === null && z?.tipo === 'pantalla' && props.pantalla ? leer(props.pantalla, m, q.x, q.y) : null
      setLeyendo(l)
      return
    }
    if (tomado.tipo === 'recorrer') {
      const dx = tomado.x - q.x
      tomado.x = q.x
      if (dx !== 0 && m.w > 0) props.onRecorrer?.(dx / m.w)
      return
    }
    if (tomado.tipo === 'canal') {
      const lado = ladoPorArrastre((q.x - m.x) / m.w, tomado.lado)
      if (lado !== tomado.lado) {
        tomado.lado = lado
        props.onLado?.(tomado.canal, lado)
      }
      return
    }
    if (tomado.tipo === 'tiempo') {
      const pos = posicionXPorArrastre((q.y - m.y) / m.h, tomado.pos)
      if (pos !== tomado.pos) {
        tomado.pos = pos
        props.onEjeTiempo?.(pos)
      }
      return
    }
    if (tomado.tipo === 'marca') {
      // En X-Y la marca del canal horizontal se corre a los lados.
      const pos = tomado.canal === canalHorizontalXY(props.ajustes) ? posicionDeX(m, q.x) : posicionDeY(m, q.y)
      if (pos === tomado.pos) return
      tomado.pos = pos
      props.onPosicion?.(tomado.canal, pos, tomado.gesto)
      return
    }
    const c = cursores()
    if (!c || !props.pantalla) return
    if (c.xy) {
      props.onCursores?.(ponerCursorXY(c, tomado.cual === 't1' ? 0 : 1, props.pantalla, props.ajustes, m, q.x, q.y))
      return
    }
    const valor = tomado.cual[0] === 't' ? tiempoDeX(q.x - m.x, m.w, props.pantalla.t0, props.ajustes) : voltajeDeY(q.y - m.y, m.h, props.ajustes, c.canal)
    props.onCursores?.(ponerCursor(c, tomado.cual, valor))
  }
  const soltar = () => {
    tomado = null
    setMoviendoEje(false)
    setRecorriendo(false)
    setArrastrado(null)
  }
  // Con el foco en la pantalla (Tab, solo con cursores): 1 y 2 eligen el cursor, las flechas lo mueven (Shift, una división).
  const tecla = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const c = cursores()
    if (c) {
      if (e.key === '1' || e.key === '2') {
        setActivo(e.key === '1' ? 0 : 1)
        e.preventDefault()
        return
      }
      if (c.xy && props.pantalla && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        props.onCursores?.(moverCursorXYTecla(c, activo(), e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1, e.shiftKey, props.pantalla, props.ajustes, marco()))
        return
      }
      const m = cursorDeTecla(e.key, activo(), c)
      if (m) {
        e.preventDefault()
        props.onCursores?.(moverCursor(c, m.cual, m.dir, e.shiftKey, props.ajustes))
        return
      }
    }
    // Recorrer lo capturado: las flechas (una división; Mayús, una pantalla) cuando no hay cursores que mover, y siempre
    // AvPág y RePág (una pantalla), Inicio y Fin.
    const dx = props.recorrible ? dxDeTecla(e.key, e.shiftKey, !!c) : null
    if (dx === null) return
    e.preventDefault()
    props.onRecorrer?.(dx)
  }
  const muescas = new Rueda()
  const rueda = (e: WheelEvent) => {
    const q = enPixeles(e)
    const z = zonaEn(marco(), q.x, q.y)
    // Sobre la retícula (o con Mayús sobre cualquier parte), la rueda recorre lo capturado.
    if (props.recorrible && props.onRecorrer && (z?.tipo === 'pantalla' || (e.shiftKey && z))) {
      const delta = e.deltaX || e.deltaY
      const w = marco().w
      if (!delta || w <= 0) return
      e.preventDefault()
      const px = e.deltaMode === 1 ? delta * 40 : e.deltaMode === 2 ? delta * 800 : delta
      props.onRecorrer(px / ((w / tam().dpr) * 1))
      return
    }
    if (!z || z.tipo === 'pantalla' || !props.onEscala) return
    e.preventDefault()
    const dir = muescas.paso(e)
    if (dir) props.onEscala(z, dir)
  }
  return (
    <canvas
      ref={canvas}
      class="osc-lienzo"
      classList={{ 'sobre-eje': sobreEje() && !moviendoEje(), 'moviendo-eje': moviendoEje(), 'sobre-marca': sobreMarca(), recorrible: !!props.recorrible && !recorriendo(), recorriendo: recorriendo(), 'sobre-cursor-t': punteroDeCursor(arrastrado() ?? sobreCursor()) === 'ew-resize', 'sobre-cursor-v': punteroDeCursor(arrastrado() ?? sobreCursor()) === 'ns-resize' }}
      tabindex={cursores() || props.recorrible ? 0 : undefined}
      onKeyDown={tecla}
      onFocus={() => setEnfocada(true)}
      onBlur={() => setEnfocada(false)}
      role="img"
      aria-label={props.descripcion}
      title={sobreTiempo() ? ayudaEjeTiempo(props.pantalla) : undefined}
      onPointerDown={abajo}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onPointerLeave={() => (setSobreMarca(false), setSobreCursor(null), setSobreEje(false), setSobreTiempo(false), setLeyendo(null))}
      on:wheel={{ handleEvent: rueda, passive: false }}
    />
  )
}
