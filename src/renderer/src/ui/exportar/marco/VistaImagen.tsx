import { createEffect, createMemo, createSignal, For, on, Show, type JSX } from 'solid-js'
import { MM_POR_UNIDAD } from '../../../doc/tipos'
import { IconoAjustar, IconoMas, IconoMenos } from '../editor/iconosEditor'
import { aFigura, aPantalla, porcentaje } from '../editor/zoom'
import { fueraDelArea } from './atenuado'
import { asasDe, cajaDeNota, notaEn, PX_POR_MM, type ContextoNotas, type HerramientaEsquema, type Notas } from './notasEsquema'
import { PASO_ZOOM, usarZoom } from './usarZoom'

/** Un rectángulo en px de la figura (96 por pulgada, a 1×). */
export interface Recuadro {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Herramientas de anotación de la vista previa del esquema, en mm del mundo. Se dibujan como SVG sobre la imagen.
 */
export interface EdicionNotas {
  herramienta: HerramientaEsquema
  lista: Notas
  sel: string | null
  ctx: ContextoNotas
  /** El grupo SVG de las anotaciones (`svgDeNotas`). */
  svg: string
  /** La esquina de arriba a la izquierda de la lámina, en mm del mundo. */
  origenXMm: number
  origenYMm: number
  onSel(id: string | null): void
  onTexto(x: number, y: number): void
  onFlecha(x1: number, y1: number, x2: number, y2: number): void
  onResalte(x: number, y: number, ancho: number, alto: number): void
  onLlamada(x: number, y: number): void
  /** `tol` es el radio de captura en mm: 8 px de pantalla. */
  onLectura(x: number, y: number, tol: number): void
  onMover(id: string, dx: number, dy: number): void
  onAsa(id: string, asa: string, x: number, y: number): void
  onFinGesto(): void
  onEditarTexto(id: string): void
  /** El puntero en mm del mundo (null al salir de la imagen) y, arrastrando una flecha o un resalte, dónde se pulsó: de ahí sale el fantasma. */
  onPuntero(pos: { x: number; y: number } | null, inicio: { x: number; y: number } | null): void
  /** El grupo SVG del fantasma de la herramienta (`svgDeNotas` con `solo`), o '' sin él. */
  fantasma: string
  /** Con la etiqueta de lectura, el punto medible bajo el puntero (mm del mundo): se resalta y es el único sitio donde se puede poner. */
  objetivo?: { x: number; y: number } | null
  /** La barra flotante, junto a la nota elegida. */
  barra?: () => JSX.Element
}

interface Props {
  /** La imagen (un SVG) ya lista, o null mientras se arma. */
  url: string | null
  /** Tamaño de la figura a 1×, en px. */
  ancho: number
  alto: number
  /** Fondo transparente: se ve sobre un damero. */
  transparente?: boolean
  /** Lo que se dice mientras no hay imagen. */
  mensaje?: string
  /** El área elegida; con ella la vista atenúa lo de fuera y muestra un recuadro con cuatro asas. */
  recuadro?: Recuadro | null
  /** Lo que mide el área, escrito junto a su esquina («120 × 80 mm»). */
  medidaArea?: string
  /** La lámina exportada es de tema oscuro: el velo de fuera del área es oscuro y no del color del papel de la interfaz. */
  hojaOscura?: boolean
  /** El recuadro cambió (arrastrando una asa o dibujando uno nuevo en un espacio vacío); `fin` cierra el gesto. */
  onRecuadro?(r: Recuadro, fin: boolean): void
  /** Las herramientas de anotación (solo el exportar del esquema). */
  edicion?: EdicionNotas
}

type Gesto =
  | { tipo: 'pan'; x: number; y: number }
  | { tipo: 'asa'; fijoX: number; fijoY: number }
  | { tipo: 'dibujar'; x: number; y: number }
  | { tipo: 'mover-nota'; id: string; x: number; y: number; movido: boolean }
  | { tipo: 'asa-nota'; id: string; asa: string }
  | { tipo: 'nueva'; forma: 'flecha' | 'resalte'; x1: number; y1: number; x2: number; y2: number }

/** Lado mínimo de un recuadro, en px de la figura. */
export const LADO_MINIMO = 8

const cajaDe = (ax: number, ay: number, bx: number, by: number): Recuadro => ({ x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) })

/**
 * Vista previa con imagen: lámina con zoom y desplazamiento. Con `recuadro`, un rectángulo con asas; arrastrar en un espacio vacío dibuja otro. Lo superpuesto no entra al archivo.
 */
export default function VistaImagen(props: Props) {
  let caja!: HTMLDivElement
  const tam = () => ({ fw: Math.max(1, props.ancho), fh: Math.max(1, props.alto) })
  const { vz, ajustarVista, acercar, mover } = usarZoom(() => caja, tam)
  const [gesto, setGesto] = createSignal<Gesto | null>(null)
  const [cursor, setCursor] = createSignal<string | undefined>(undefined)

  const punto = (e: PointerEvent): [number, number] => {
    const r = caja.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const enFigura = (e: PointerEvent): [number, number] => aFigura(vz(), ...punto(e))
  const acotarX = (x: number) => Math.max(0, Math.min(props.ancho, x))
  const acotarY = (y: number) => Math.max(0, Math.min(props.alto, y))
  const dentro = (r: Recuadro, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

  // ---------- Anotaciones: de px de la figura a mm del mundo y de vuelta ----------
  const ed = () => props.edicion
  const aMm = (fx: number, fy: number): [number, number] => [fx / PX_POR_MM + (ed()?.origenXMm ?? 0), fy / PX_POR_MM + (ed()?.origenYMm ?? 0)]
  const deMm = (x: number, y: number): [number, number] => [(x - (ed()?.origenXMm ?? 0)) * PX_POR_MM, (y - (ed()?.origenYMm ?? 0)) * PX_POR_MM]
  const pantMm = (x: number, y: number): [number, number] => {
    const [fx, fy] = deMm(x, y)
    return aPantalla(vz(), fx, fy)
  }
  const tolMm = () => 6 / Math.max(0.5, vz().k) / PX_POR_MM
  const hay = (fx: number, fy: number): string | null => {
    const q = ed()
    if (!q) return null
    const [x, y] = aMm(fx, fy)
    return notaEn(q.lista, x, y, tolMm(), q.ctx)
  }
  // Cambiar de herramienta (o Esc) cancela lo que se estaba arrastrando y el fantasma.
  const herramientaActual = createMemo(() => ed()?.herramienta)
  createEffect(
    on(
      herramientaActual,
      () => {
        if (gesto()?.tipo === 'nueva') setGesto(null)
        ed()?.onPuntero(null, null)
      },
      { defer: true }
    )
  )
  const [sobreNota, setSobreNota] = createSignal(false)
  const cursorNotas = createMemo(() => {
    const q = ed()
    if (!q || q.herramienta === 'seleccionar') return undefined
    if (q.herramienta === 'texto') return 'text'
    // La llamada se ve como su propio círculo fantasma; sobre una anotación vuelve el cursor normal.
    if (q.herramienta === 'llamada') return sobreNota() ? 'default' : 'none'
    if (q.herramienta === 'lectura') return q.objetivo ? 'pointer' : 'not-allowed'
    return 'crosshair'
  })

  const alBajar = (e: PointerEvent) => {
    caja.focus({ preventScroll: true })
    caja.setPointerCapture(e.pointerId)
    const [x, y] = punto(e)
    const [fx, fy] = enFigura(e)
    const q = ed()
    if (q && e.button === 0) {
      const [mx, my] = aMm(fx, fy)
      const h = q.herramienta
      if (h === 'texto') return q.onTexto(mx, my)
      if (h === 'llamada') return q.onLlamada(mx, my)
      if (h === 'lectura') return q.onLectura(mx, my, (8 / Math.max(0.5, vz().k) / PX_POR_MM))
      if (h === 'flecha' || h === 'resalte') {
        q.onPuntero({ x: mx, y: my }, { x: mx, y: my })
        return setGesto({ tipo: 'nueva', forma: h, x1: mx, y1: my, x2: mx, y2: my })
      }
      const id = hay(fx, fy)
      if (id) {
        q.onSel(id)
        return setGesto({ tipo: 'mover-nota', id, x: mx, y: my, movido: false })
      }
      q.onSel(null)
    }
    const r = props.recuadro
    // Un espacio vacío de la lámina (fuera del recuadro) dibuja uno nuevo; lo demás mueve la vista.
    if (e.button === 0 && props.onRecuadro && r && !dentro(r, fx, fy) && fx >= 0 && fy >= 0 && fx <= props.ancho && fy <= props.alto) setGesto({ tipo: 'dibujar', x: fx, y: fy })
    else setGesto({ tipo: 'pan', x, y })
  }
  const nuevo = (g: Extract<Gesto, { tipo: 'asa' | 'dibujar' }>, e: PointerEvent): Recuadro => {
    const [fx, fy] = enFigura(e)
    const ax = g.tipo === 'asa' ? g.fijoX : g.x
    const ay = g.tipo === 'asa' ? g.fijoY : g.y
    return cajaDe(ax, ay, acotarX(fx), acotarY(fy))
  }
  const alMover = (e: PointerEvent) => {
    const g = gesto()
    const q = ed()
    if (q && q.herramienta !== 'seleccionar' && (!g || g.tipo === 'nueva')) q.onPuntero({ x: aMm(...enFigura(e))[0], y: aMm(...enFigura(e))[1] }, g?.tipo === 'nueva' ? { x: g.x1, y: g.y1 } : null)
    if (!g) {
      if (q?.herramienta === 'llamada') setSobreNota(!!hay(...enFigura(e)))
      if (q?.herramienta === 'seleccionar') {
        const [fx, fy] = enFigura(e)
        setCursor(hay(fx, fy) ? 'move' : undefined)
      }
      return
    }
    if (g.tipo === 'pan') {
      const [x, y] = punto(e)
      mover(x - g.x, y - g.y)
      setGesto({ tipo: 'pan', x, y })
      return
    }
    if (g.tipo === 'mover-nota' || g.tipo === 'asa-nota' || g.tipo === 'nueva') {
      const [mx, my] = aMm(...enFigura(e))
      if (!q) return
      if (g.tipo === 'asa-nota') return q.onAsa(g.id, g.asa, mx, my)
      if (g.tipo === 'nueva') return setGesto({ ...g, x2: mx, y2: my })
      const dx = mx - g.x
      const dy = my - g.y
      if (!g.movido && Math.hypot(dx, dy) * PX_POR_MM * vz().k < 3) return
      q.onMover(g.id, dx, dy)
      return setGesto({ ...g, x: mx, y: my, movido: true })
    }
    const r = nuevo(g, e)
    // Dibujando, el recuadro nuevo aparece al pasar del lado mínimo; con una asa, siempre.
    if (g.tipo === 'asa' || (r.w >= LADO_MINIMO && r.h >= LADO_MINIMO)) props.onRecuadro?.(r, false)
  }
  const alSubir = (e: PointerEvent) => {
    const g = gesto()
    setGesto(null)
    if (caja.hasPointerCapture(e.pointerId)) caja.releasePointerCapture(e.pointerId)
    if (!g || g.tipo === 'pan') return
    const q = ed()
    if (g.tipo === 'mover-nota' || g.tipo === 'asa-nota') return q?.onFinGesto()
    if (g.tipo === 'nueva') {
      if (!q) return
      const largo = Math.hypot(g.x2 - g.x1, g.y2 - g.y1) * PX_POR_MM * vz().k
      if (g.forma === 'flecha' && largo >= 12) q.onFlecha(g.x1, g.y1, g.x2, g.y2)
      else if (g.forma === 'resalte' && Math.abs(g.x2 - g.x1) * PX_POR_MM * vz().k >= 8 && Math.abs(g.y2 - g.y1) * PX_POR_MM * vz().k >= 8) q.onResalte(Math.min(g.x1, g.x2), Math.min(g.y1, g.y2), Math.abs(g.x2 - g.x1), Math.abs(g.y2 - g.y1))
      return
    }
    const r = nuevo(g, e)
    // Un clic sin arrastrar no cambia nada; una asa nunca deja el recuadro por debajo del lado mínimo.
    if (g.tipo === 'dibujar' && (r.w < LADO_MINIMO || r.h < LADO_MINIMO)) return
    props.onRecuadro?.({ x: r.x, y: r.y, w: Math.max(r.w, LADO_MINIMO), h: Math.max(r.h, LADO_MINIMO) }, true)
  }
  const tecla = (e: KeyboardEvent) => {
    if (e.key === '+' || e.key === '=') acercar(PASO_ZOOM)
    else if (e.key === '-' || e.key === '_') acercar(1 / PASO_ZOOM)
    else if (e.key === '0') ajustarVista()
    else return
    e.preventDefault()
  }

  const hoja = () => {
    const v = vz()
    return { left: `${v.tx}px`, top: `${v.ty}px`, width: `${props.ancho * v.k}px`, height: `${props.alto * v.k}px` }
  }
  const pantalla = () => {
    const r = props.recuadro
    if (!r) return null
    const v = vz()
    const [x, y] = aPantalla(v, r.x, r.y)
    return { x, y, w: r.w * v.k, h: r.h * v.k }
  }
  /** Lo que queda fuera del área, en px de pantalla: la lámina menos el recuadro. */
  const fuera = () => {
    const p = pantalla()
    const v = vz()
    return fueraDelArea({ x: v.tx, y: v.ty, w: props.ancho * v.k, h: props.alto * v.k }, p)
  }
  /** Las cuatro asas: en cada una, la esquina contraria queda fija. */
  const asas = () => {
    const r = props.recuadro
    const p = pantalla()
    if (!r || !p) return []
    return [
      { x: p.x, y: p.y, fijoX: r.x + r.w, fijoY: r.y + r.h, cursor: 'nwse-resize', nombre: 'arriba a la izquierda' },
      { x: p.x + p.w, y: p.y, fijoX: r.x, fijoY: r.y + r.h, cursor: 'nesw-resize', nombre: 'arriba a la derecha' },
      { x: p.x, y: p.y + p.h, fijoX: r.x + r.w, fijoY: r.y, cursor: 'nesw-resize', nombre: 'abajo a la izquierda' },
      { x: p.x + p.w, y: p.y + p.h, fijoX: r.x, fijoY: r.y, cursor: 'nwse-resize', nombre: 'abajo a la derecha' }
    ]
  }

  const cajaSel = createMemo(() => {
    const q = ed()
    const n = q?.sel ? q.lista.find((t) => t.id === q.sel) : undefined
    if (!q || !n) return null
    const r = cajaDeNota(n, q.ctx)
    const [x, y] = pantMm(r.x, r.y)
    const k = vz().k * PX_POR_MM
    return { x, y, w: r.w * k, h: r.h * k }
  })
  const asasNota = createMemo(() => {
    const q = ed()
    const n = q?.sel ? q.lista.find((t) => t.id === q.sel) : undefined
    if (!q || !n || q.herramienta !== 'seleccionar') return []
    return asasDe(n).map((a) => {
      const [px, py] = pantMm(a.x, a.y)
      return { id: a.id, px, py, cursor: a.id === 'nw' || a.id === 'se' ? 'nwse-resize' : a.id === 'ne' || a.id === 'sw' ? 'nesw-resize' : 'grab' }
    })
  })
  /** La barra va sobre la nota elegida; si no cabe arriba, debajo. */
  const dondeBarra = createMemo(() => {
    const c = cajaSel()
    if (!c) return { x: 0, y: 0, abajo: false }
    const w = caja?.clientWidth ?? 600
    const x = Math.max(150, Math.min(w - 150, c.x + c.w / 2))
    return c.y > 70 ? { x, y: c.y - 10, abajo: false } : { x, y: c.y + c.h + 10, abajo: true }
  })

  return (
    <div class="editor-vista-caja">
      <div
        ref={caja}
        class="editor-vista marco-vista"
        classList={{ 'con-recuadro': !!props.recuadro && !cursorNotas() }}
        style={{ cursor: cursorNotas() ?? cursor() }}
        role="group"
        tabindex="0"
        aria-label="Vista previa del dibujo. Rueda para acercar, arrastra el fondo para moverlo; + y − acercan, 0 ajusta."
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSubir}
        onPointerCancel={alSubir}
        onPointerLeave={() => ed()?.onPuntero(null, null)}
        onDblClick={(e) => {
          const q = ed()
          if (!q || q.herramienta !== 'seleccionar') return
          const id = hay(...aFigura(vz(), e.clientX - caja.getBoundingClientRect().left, e.clientY - caja.getBoundingClientRect().top))
          if (id && q.lista.find((n) => n.id === id)?.tipo === 'texto') q.onEditarTexto(id)
        }}
        onContextMenu={(e) => e.preventDefault()}
        on:keydown={tecla}
      >
        <Show when={props.url} fallback={<p class="vista-cargando secundario marco-mensaje">{props.mensaje ?? 'Armando la vista…'}</p>}>
          <img class="vista-imagen marco-imagen" classList={{ transparente: !!props.transparente }} src={props.url!} alt="" draggable={false} style={hoja()} />
        </Show>
        <Show when={props.url && props.edicion ? props.edicion : null}>
          {(q) => (
            <>
              <svg class="marco-notas" style={hoja()} viewBox={`${q().origenXMm / MM_POR_UNIDAD} ${q().origenYMm / MM_POR_UNIDAD} ${props.ancho / PX_POR_MM / MM_POR_UNIDAD} ${props.alto / PX_POR_MM / MM_POR_UNIDAD}`} aria-hidden="true" innerHTML={q().svg} />
              <Show when={cajaSel()}>
                {(c) => <div class="editor-sel" style={{ left: `${c().x - 3}px`, top: `${c().y - 3}px`, width: `${c().w + 6}px`, height: `${c().h + 6}px` }} aria-hidden="true" />}
              </Show>
              <For each={asasNota()}>
                {(a) => (
                  <div
                    class="editor-asa editor-asa-mueve"
                    style={{ left: `${a.px}px`, top: `${a.py}px`, cursor: a.cursor }}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      caja.setPointerCapture(e.pointerId)
                      setGesto({ tipo: 'asa-nota', id: q().sel!, asa: a.id })
                    }}
                    aria-hidden="true"
                  />
                )}
              </For>
              <Show when={q().objetivo}>
                {(o) => {
                  const p = () => pantMm(o().x, o().y)
                  return <div class="editor-sel" style={{ left: `${p()[0] - 9}px`, top: `${p()[1] - 9}px`, width: '18px', height: '18px', 'border-radius': '50%' }} aria-hidden="true" />
                }}
              </Show>
              <Show when={q().fantasma}>
                <svg class="marco-notas marco-fantasma" style={{ ...hoja(), opacity: 0.6 }} viewBox={`${q().origenXMm / MM_POR_UNIDAD} ${q().origenYMm / MM_POR_UNIDAD} ${props.ancho / PX_POR_MM / MM_POR_UNIDAD} ${props.alto / PX_POR_MM / MM_POR_UNIDAD}`} aria-hidden="true" innerHTML={q().fantasma} />
              </Show>
              <Show when={cajaSel() && q().barra}>
                {(_) => (
                  <div class="editor-barra-lugar" classList={{ debajo: dondeBarra().abajo }} onPointerDown={(e) => e.stopPropagation()} onDblClick={(e) => e.stopPropagation()} style={{ left: `${dondeBarra().x}px`, top: `${dondeBarra().y}px` }}>
                    {q().barra!()}
                  </div>
                )}
              </Show>
            </>
          )}
        </Show>
        <Show when={props.url ? pantalla() : null}>
          {(p) => (
            <>
              <For each={fuera()}>{(r) => <div class="editor-atenuado" classList={{ oscura: !!props.hojaOscura }} style={{ left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` }} aria-hidden="true" />}</For>
              <div class="editor-recuadro" style={{ left: `${p().x}px`, top: `${p().y}px`, width: `${p().w}px`, height: `${p().h}px` }} aria-hidden="true" />
              <Show when={props.medidaArea}>
                <span class="editor-medida-area cifra" style={{ left: `${p().x}px`, top: `${p().y + p().h + 4}px` }} aria-hidden="true">
                  {props.medidaArea}
                </span>
              </Show>
              <For each={asas()}>
                {(a) => (
                  <div
                    class="editor-asa editor-asa-mueve"
                    style={{ left: `${a.x}px`, top: `${a.y}px`, cursor: a.cursor }}
                    title={`Mover la esquina de ${a.nombre}`}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      caja.setPointerCapture(e.pointerId)
                      setGesto({ tipo: 'asa', fijoX: a.fijoX, fijoY: a.fijoY })
                    }}
                    aria-hidden="true"
                  />
                )}
              </For>
            </>
          )}
        </Show>
      </div>
      <div class="editor-zoom" role="group" aria-label="Zoom de la vista previa">
        <button type="button" class="boton-icono" aria-label="Alejar" title="Alejar" onClick={() => acercar(1 / PASO_ZOOM)}>
          <IconoMenos />
        </button>
        <output class="cifra" aria-live="off" aria-label="Aumento">
          {porcentaje(vz())} %
        </output>
        <button type="button" class="boton-icono" aria-label="Acercar" title="Acercar" onClick={() => acercar(PASO_ZOOM)}>
          <IconoMas />
        </button>
        <button type="button" class="boton-icono" aria-label="Ajustar la figura a la vista" title="Ajustar a la vista" onClick={ajustarVista}>
          <IconoAjustar />
        </button>
      </div>
    </div>
  )
}
