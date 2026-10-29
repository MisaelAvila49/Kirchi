import { createEffect, createMemo, createSignal, For, onCleanup, Show, type JSX } from 'solid-js'
import type { Anotaciones } from '../../../../../compartido/grafica/anotaciones'
import type { Lienzo2D } from '../../osciloscopio/dibujar'
import type { FiguraCaptura } from '../../osciloscopio/figura'
import { medirTexto } from './dibujoNotas'
import { puntoGlobal } from './etiquetas'
import { cajaDeSeleccion, extremosDeFlecha, objetoEn, resolverEtiqueta, type Seleccion } from './objetos'
import { IconoAjustar, IconoMas, IconoMenos } from './iconosEditor'
import { aFigura, aPantalla, porcentaje } from './zoom'
import { PASO_ZOOM, usarZoom } from '../marco/usarZoom'
import { medirMono } from './etiquetas'
import { previoDe, RADIO_ETIQUETA, rangoAlBajar, rangoAlMover, rangoAlSubir, type GestoRango } from './previo'

export type Herramienta = 'seleccionar' | 'texto' | 'etiqueta' | 'flecha' | 'rango'

interface Props {
  figura: FiguraCaptura
  /** El tramo ya elegido (px de la figura), sombreado mientras se elige otro. */
  tramoPx?: [number, number] | null
  anot: Anotaciones
  sel: Seleccion | null
  /** Los que se suman al principal (mismo tipo): también se resaltan. */
  extras?: readonly Seleccion[]
  herramienta: Herramienta
  /** Elegir (o soltar) un objeto; `ancla` es el punto de la figura donde se hizo clic (para poner la barra flotante junto a él). */
  onSel(s: Seleccion | null, ancla?: [number, number], aditivo?: boolean): void
  onAgregarTexto(fx: number, fy: number): void
  onAgregarFlecha(x1: number, y1: number, x2: number, y2: number): void
  onAgregarEtiqueta(traza: string, x: number, dx: number, dy: number): void
  /** Arrastrar una nota: el movimiento desde el último aviso, en px de la figura. */
  onMover(s: Seleccion, dx: number, dy: number): void
  /** Arrastrar un extremo de una flecha (1 o 2) a un punto de la figura, como fracciones. */
  onMoverExtremo(id: string, cual: 1 | 2, fx: number, fy: number): void
  /** Elegir un tramo del eje arrastrando sobre la retícula: de un px de la figura a otro. */
  onRango(desde: number, hasta: number): void
  /** Arrastrar un eje para acomodarlo: el punto de la figura donde está el puntero. */
  onArrastrarEje(id: string, fx: number, fy: number): void
  onFinGesto(): void
  onEditarTexto(id: string): void
  /** La barra flotante: se pone junto al objeto elegido, en coordenadas de la caja. */
  barra?: (donde: { x: number; y: number }) => JSX.Element
  /** Dónde se hizo el último clic sobre la figura (px de la figura), para la barra de una traza. */
  ancla: [number, number] | null
}

type Gesto =
  | { tipo: 'pan'; x: number; y: number }
  | { tipo: 'mover'; sel: Seleccion; x: number; y: number; movido: boolean }
  | { tipo: 'extremo'; id: string; cual: 1 | 2 }
  | { tipo: 'flecha'; x1: number; y1: number; x2: number; y2: number }
  | GestoRango
  | { tipo: 'eje'; id: string; x: number; y: number; movido: boolean }

/**
 * Vista previa del editor, dibujada con la misma función que el archivo. Lo resaltado (recuadros, asas) son elementos aparte que no entran al archivo.
 */
export default function VistaEditor(props: Props) {
  let caja!: HTMLDivElement
  let lienzo!: HTMLCanvasElement
  const [gesto, setGesto] = createSignal<Gesto | null>(null)
  const [cursor, setCursor] = createSignal('default')
  // Dónde está el puntero sobre la figura (px de la figura): la vista previa de lo que se va a colocar sigue a este punto.
  const [sobre, setSobre] = createSignal<[number, number] | null>(null)
  let pedido = 0
  const tam = () => ({ fw: props.figura.ancho, fh: props.figura.alto })
  const geo = createMemo(() => props.figura.geometria?.() ?? null)
  const { medida, vz, ajustarVista, acercar, mover } = usarZoom(() => caja, tam)
  onCleanup(() => {
    if (pedido) cancelAnimationFrame(pedido)
  })

  const dibujar = () => {
    pedido = 0
    const { w, h, dpr } = medida()
    const ctx = lienzo.getContext('2d')
    if (!ctx || w <= 0 || h <= 0) return
    lienzo.width = Math.round(w * dpr)
    lienzo.height = Math.round(h * dpr)
    ctx.clearRect(0, 0, lienzo.width, lienzo.height)
    const v = vz()
    ctx.save()
    ctx.translate(v.tx * dpr, v.ty * dpr)
    props.figura.dibujar(ctx as unknown as Lienzo2D, v.k * dpr)
    ctx.restore()
  }
  const pedirDibujo = () => {
    if (!pedido) pedido = requestAnimationFrame(dibujar)
  }
  createEffect(() => {
    void props.figura
    void medida()
    void vz()
    pedirDibujo()
  })

  const punto = (e: PointerEvent | MouseEvent): [number, number] => {
    const r = caja.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const enFigura = (e: PointerEvent | MouseEvent): [number, number] => {
    const [x, y] = punto(e)
    return aFigura(vz(), x, y)
  }
  const tolerancia = () => 6 / Math.max(0.5, vz().k)
  const queHay = (fx: number, fy: number) => {
    const g = geo()
    return g ? objetoEn({ geo: g, anot: props.anot, medir: medirTexto, x: fx, y: fy, tol: tolerancia() }) : null
  }

  const alBajar = (e: PointerEvent) => {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault()
      caja.setPointerCapture(e.pointerId)
      const [x, y] = punto(e)
      setGesto({ tipo: 'pan', x, y })
      return
    }
    if (e.button !== 0) return
    caja.focus({ preventScroll: true })
    const [fx, fy] = enFigura(e)
    const g = geo()
    caja.setPointerCapture(e.pointerId)
    if (props.herramienta === 'texto') {
      props.onAgregarTexto(fx / props.figura.ancho, fy / props.figura.alto)
      return
    }
    if (props.herramienta === 'etiqueta') {
      const r = g ? puntoGlobal(g.trazas, fx, fy) : null
      if (r && r.punto.d <= RADIO_ETIQUETA) props.onAgregarEtiqueta(r.traza.id, r.punto.x, 18, -44)
      return
    }
    if (props.herramienta === 'flecha') {
      setGesto({ tipo: 'flecha', x1: fx, y1: fy, x2: fx, y2: fy })
      return
    }
    if (props.herramienta === 'rango') {
      const gr = gesto()
      const paso = rangoAlBajar(gr?.tipo === 'rango' ? gr : null, fx, vz().k)
      setGesto(paso.gesto)
      if (paso.aplicar) props.onRango(paso.aplicar[0], paso.aplicar[1])
      return
    }
    const hit = queHay(fx, fy)
    // Mayús o Ctrl y clic suman al grupo y no arrastran nada: mover varios no está.
    const aditivo = e.shiftKey || e.ctrlKey || e.metaKey
    if (hit && aditivo) {
      props.onSel(hit, [fx, fy], true)
    } else if (hit) {
      props.onSel(hit, [fx, fy])
      if (hit.tipo === 'texto' || hit.tipo === 'flecha' || hit.tipo === 'etiqueta') setGesto({ tipo: 'mover', sel: hit, x: fx, y: fy, movido: false })
      else if (hit.tipo === 'eje') setGesto({ tipo: 'eje', id: hit.id, x: fx, y: fy, movido: false })
    } else {
      if (!aditivo) props.onSel(null)
      const [x, y] = punto(e)
      setGesto({ tipo: 'pan', x, y })
    }
  }
  const alMover = (e: PointerEvent) => {
    const gs = gesto()
    setSobre(enFigura(e))
    if (!gs) {
      if (props.herramienta !== 'seleccionar') return setCursor(props.herramienta === 'texto' ? 'text' : 'crosshair')
      const [fx, fy] = enFigura(e)
      const hit = queHay(fx, fy)
      setCursor(!hit ? 'default' : hit.tipo === 'texto' || hit.tipo === 'flecha' || hit.tipo === 'etiqueta' ? 'move' : hit.tipo === 'eje' ? 'grab' : 'pointer')
      return
    }
    if (gs.tipo === 'pan') {
      const [x, y] = punto(e)
      mover(x - gs.x, y - gs.y)
      setGesto({ tipo: 'pan', x, y })
      return
    }
    const [fx, fy] = enFigura(e)
    if (gs.tipo === 'mover') {
      const dx = fx - gs.x
      const dy = fy - gs.y
      if (!gs.movido && Math.hypot(dx, dy) * vz().k < 3) return
      props.onMover(gs.sel, dx, dy)
      setGesto({ ...gs, x: fx, y: fy, movido: true })
    } else if (gs.tipo === 'eje') {
      if (!gs.movido && Math.hypot(fx - gs.x, fy - gs.y) * vz().k < 3) return
      props.onArrastrarEje(gs.id, fx, fy)
      setGesto({ ...gs, movido: true })
    } else if (gs.tipo === 'extremo') props.onMoverExtremo(gs.id, gs.cual, fx / props.figura.ancho, fy / props.figura.alto)
    else if (gs.tipo === 'flecha') setGesto({ ...gs, x2: fx, y2: fy })
    else if (gs.tipo === 'rango') setGesto(rangoAlMover(gs, fx))
  }
  const alSubir = (e: PointerEvent) => {
    const gs = gesto()
    if (caja.hasPointerCapture(e.pointerId)) caja.releasePointerCapture(e.pointerId)
    if (!gs) return
    if (gs.tipo === 'rango') {
      const paso = rangoAlSubir(gs, vz().k)
      setGesto(paso.gesto)
      if (paso.aplicar) props.onRango(paso.aplicar[0], paso.aplicar[1])
      return
    }
    setGesto(null)
    if (gs.tipo === 'mover' || gs.tipo === 'extremo' || gs.tipo === 'eje') props.onFinGesto()
    else if (gs.tipo === 'flecha') {
      if (Math.hypot(gs.x2 - gs.x1, gs.y2 - gs.y1) * vz().k >= 12) props.onAgregarFlecha(gs.x1 / props.figura.ancho, gs.y1 / props.figura.alto, gs.x2 / props.figura.ancho, gs.y2 / props.figura.alto)
    }
  }
  const alDobleClic = (e: MouseEvent) => {
    if (props.herramienta !== 'seleccionar') return
    const [fx, fy] = enFigura(e)
    const g = geo()
    if (!g) return
    const hit = queHay(fx, fy)
    if (hit?.tipo === 'texto') return props.onEditarTexto(hit.id)
    if (hit?.tipo === 'traza') {
      const r = puntoGlobal(g.trazas, fx, fy, hit.id)
      if (r) props.onAgregarEtiqueta(r.traza.id, r.punto.x, 18, -44)
    }
  }

  // ---------- Lo que se superpone a la figura (en px de la caja) ----------
  const pant = (x: number, y: number) => aPantalla(vz(), x, y)
  const hoja = () => {
    const v = vz()
    return { left: `${v.tx}px`, top: `${v.ty}px`, width: `${props.figura.ancho * v.k}px`, height: `${props.figura.alto * v.k}px` }
  }
  const cajaSel = createMemo(() => {
    const g = geo()
    const s = props.sel
    if (!g || !s) return null
    const r = cajaDeSeleccion(s, g, props.anot, medirTexto)
    if (!r) return null
    const [x, y] = pant(r.x, r.y)
    const k = vz().k
    return { x, y, w: r.w * k, h: r.h * k }
  })
  /** El trazo de una traza elegida, en px de la caja. */
  const trazoDe = (id: string): string => {
    const t = geo()?.trazas.find((q) => q.id === id)
    if (!t) return ''
    const v = vz()
    const paso = Math.max(1, Math.ceil(t.px.length / 1500))
    const pts: string[] = []
    for (let i = 0; i < t.px.length; i += paso) pts.push(`${(t.px[i] * v.k + v.tx).toFixed(1)},${(t.py[i] * v.k + v.ty).toFixed(1)}`)
    return pts.join(' ')
  }
  const trazaElegida = createMemo(() => {
    const s = props.sel
    return s && s.tipo === 'traza' ? trazoDe(s.id) : ''
  })
  /** Las trazas que se suman a la principal. */
  const trazasExtra = createMemo(() => (props.extras ?? []).filter((x) => x.tipo === 'traza').map((x) => trazoDe(x.id)).filter(Boolean))
  /** Los recuadros de los demás elegidos que no son trazas. */
  const cajasExtra = createMemo(() => {
    const g = geo()
    if (!g) return []
    const k = vz().k
    return (props.extras ?? [])
      .filter((x) => x.tipo !== 'traza')
      .map((x) => cajaDeSeleccion(x, g, props.anot, medirTexto))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map((r) => {
        const [x, y] = pant(r.x, r.y)
        return { x, y, w: r.w * k, h: r.h * k }
      })
  })
  const flechaElegida = createMemo(() => {
    const s = props.sel
    if (!s || s.tipo !== 'flecha') return null
    const f = props.anot.flechas.find((q) => q.id === s.id)
    if (!f) return null
    const [x1, y1, x2, y2] = extremosDeFlecha(f, props.figura)
    const a = pant(x1, y1)
    const b = pant(x2, y2)
    return { id: f.id, a, b }
  })
  const puntoDeEtiqueta = createMemo(() => {
    const g = geo()
    const s = props.sel
    if (!g || !s || s.tipo !== 'etiqueta') return null
    const n = props.anot.etiquetas.find((q) => q.id === s.id)
    const r = n ? resolverEtiqueta(n, g, medirMono) : null
    return r ? pant(r.punto.px, r.punto.py) : null
  })
  const previo = createMemo(() => previoDe({ herramienta: props.herramienta, gesto: gesto(), cursor: sobre(), geo: geo(), eje: props.figura.eje }))
  const areaY = () => {
    const ar = geo()?.area
    return { y0: ar?.y ?? 0, y1: (ar?.y ?? 0) + (ar?.h ?? props.figura.alto) }
  }
  const dondeBarra = createMemo(() => {
    const s = props.sel
    const c = cajaSel()
    if (!s || !c || !props.barra) return null
    // Una traza ocupa toda la retícula: la barra va junto al punto donde se hizo clic; lo demás, sobre su recuadro.
    if (s.tipo === 'traza' && props.ancla) {
      const [x, y] = pant(props.ancla[0], props.ancla[1])
      return { x, y: y - 14, abajo: false }
    }
    if (c.y > 70) return { x: c.x + c.w / 2, y: c.y - 10, abajo: false }
    // Un objeto alto (un eje) que toca el borde de arriba: la barra va dentro, junto a su extremo superior.
    if (c.h > 220) return { x: c.x + c.w / 2, y: c.y + 12, abajo: true }
    return { x: c.x + c.w / 2, y: c.y + c.h + 10, abajo: true }
  })

  const tecla = (e: KeyboardEvent) => {
    // Esc suelta lo que se está colocando (el tramo a medias o la flecha), sin cerrar el diálogo.
    if (e.key === 'Escape' && gesto() && (gesto()!.tipo === 'rango' || gesto()!.tipo === 'flecha')) {
      setGesto(null)
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (e.key === '+' || e.key === '=') acercar(PASO_ZOOM)
    else if (e.key === '-' || e.key === '_') acercar(1 / PASO_ZOOM)
    else if (e.key === '0') ajustarVista()
    else return
    e.preventDefault()
  }
  return (
    <div class="editor-vista-caja" classList={{ [`herr-${props.herramienta}`]: true }} style={{ cursor: cursor() }}>
      <div
        ref={caja}
        class="editor-vista"
        role="group"
        tabindex="0"
        aria-label="Vista previa de la figura. Elige lo que quieres cambiar en la lista Objeto del panel de la derecha."
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSubir}
        onPointerCancel={alSubir}
        onPointerLeave={() => setSobre(null)}
        onDblClick={alDobleClic}
        onContextMenu={(e) => e.preventDefault()}
        on:keydown={tecla}
      >
        <div class="editor-hoja" style={hoja()} aria-hidden="true" />
        <canvas ref={lienzo} aria-hidden="true" />
        <svg class="editor-capa" aria-hidden="true">
          <Show when={trazaElegida()}>
            <polyline class="editor-traza-sel" points={trazaElegida()} />
          </Show>
          <For each={trazasExtra()}>{(pts) => <polyline class="editor-traza-sel" points={pts} />}</For>
          <Show when={props.tramoPx} keyed>
          {(t) => (
            <div class="editor-rango" style={{ left: `${pant(t[0], areaY().y0)[0]}px`, top: `${pant(t[0], areaY().y0)[1]}px`, width: `${pant(t[1], 0)[0] - pant(t[0], 0)[0]}px`, height: `${pant(0, areaY().y1)[1] - pant(0, areaY().y0)[1]}px` }} aria-hidden="true" />
          )}
        </Show>
        <Show when={previo()} keyed>
            {(q) => {
              if (q.tipo === 'flecha') {
                const [ax, ay] = pant(q.x1, q.y1)
                const [bx, by] = pant(q.x2, q.y2)
                return <line class="editor-previo" classList={{ fantasma: q.fantasma }} x1={ax} y1={ay} x2={bx} y2={by} />
              }
              if (q.tipo === 'guia') {
                const [x, y0] = pant(q.fx, areaY().y0)
                const [, y1] = pant(q.fx, areaY().y1)
                return <line class="editor-previo editor-guia" x1={x} y1={y0} x2={x} y2={y1} />
              }
              if (q.tipo === 'etiqueta') {
                const [x, y] = pant(q.px, q.py)
                return <circle class="editor-previo-punto" cx={x} cy={y} r="5" />
              }
              return null
            }}
          </Show>
        </svg>
        <Show when={cajaSel() && props.sel?.tipo !== 'traza' && props.sel?.tipo !== 'flecha'}>
          <div class="editor-sel" style={{ left: `${cajaSel()!.x - 3}px`, top: `${cajaSel()!.y - 3}px`, width: `${cajaSel()!.w + 6}px`, height: `${cajaSel()!.h + 6}px` }} aria-hidden="true" />
        </Show>
        <For each={cajasExtra()}>
          {(c) => <div class="editor-sel" style={{ left: `${c.x - 3}px`, top: `${c.y - 3}px`, width: `${c.w + 6}px`, height: `${c.h + 6}px` }} aria-hidden="true" />}
        </For>
        <Show when={puntoDeEtiqueta()}>{(p) => <div class="editor-asa" style={{ left: `${p()[0]}px`, top: `${p()[1]}px` }} aria-hidden="true" />}</Show>
        <Show when={flechaElegida()}>
          {(f) => (
            <>
              <svg class="editor-capa" aria-hidden="true">
                <line class="editor-traza-sel" x1={f().a[0]} y1={f().a[1]} x2={f().b[0]} y2={f().b[1]} />
              </svg>
              <For each={[1, 2] as const}>
                {(cual) => (
                  <div
                    class="editor-asa editor-asa-mueve"
                    style={{ left: `${(cual === 1 ? f().a : f().b)[0]}px`, top: `${(cual === 1 ? f().a : f().b)[1]}px` }}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      caja.setPointerCapture(e.pointerId)
                      setGesto({ tipo: 'extremo', id: f().id, cual })
                    }}
                    aria-hidden="true"
                  />
                )}
              </For>
            </>
          )}
        </Show>
        <Show when={previo()} keyed>
          {(q) => {
            if (q.tipo === 'tramo') {
              const [x0, y0] = pant(q.desde, areaY().y0)
              const [x1, y1] = pant(q.hasta, areaY().y1)
              return (
                <>
                  <div class="editor-rango" style={{ left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` }} aria-hidden="true" />
                  <div class="editor-previo-texto" style={{ left: `${(x0 + x1) / 2}px`, top: `${y0 + 6}px` }} aria-hidden="true">
                    {q.textoDesde} a {q.textoHasta}
                  </div>
                </>
              )
            }
            if (q.tipo === 'guia') {
              const [x, y] = pant(q.fx, areaY().y0)
              return (
                <div class="editor-previo-texto" style={{ left: `${x}px`, top: `${y + 6}px` }} aria-hidden="true">
                  {q.texto}
                </div>
              )
            }
            if (q.tipo === 'etiqueta') {
              const [x, y] = pant(q.px, q.py)
              return (
                <div class="editor-previo-texto editor-previo-globo" style={{ left: `${x + 18}px`, top: `${y - 44}px` }} aria-hidden="true">
                  <span>{q.renglones[0]}</span>
                  <span>{q.renglones[1]}</span>
                </div>
              )
            }
            return null
          }}
        </Show>
        <Show when={dondeBarra()}>
          {(d) => (
            <div
              class="editor-barra-lugar"
              classList={{ debajo: d().abajo }}
              onPointerDown={(e) => e.stopPropagation()}
              onDblClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.stopPropagation()} style={{ left: `${Math.max(150, Math.min(medida().w - 150, d().x))}px`, top: `${d().y}px` }}
            >
              {props.barra?.(d())}
            </div>
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
