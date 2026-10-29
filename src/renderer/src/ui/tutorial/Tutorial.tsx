import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show, untrack } from 'solid-js'
import type { Punto } from '../../doc/tipos'
import type { Caja } from '../../piezas/tipos'
import { colocarGlobo, rectDeFoco, type Rect } from './colocacion'
import { debeEncuadrar, sobresaleDelPanel, zonaFueraDeVista } from './encuadre'
import { trazoVelo, unirFocos } from './velo'
import type { ControlTutorial } from './control'
import { avanzaSolo, reservaBarra } from './automatico'
import IconoCinta from '../cinta/IconoCinta'
import { TRAZOS, type NombreIcono } from '../cinta/trazos'
import GestoIcono from './GestoIcono'
import { pasoSobreDialogo } from './sobreDialogo'
import { partirTexto, textoLlano } from './texto'
import type { CtxTutorial, Objetivo } from './tipos'

/** Cuánto espera un paso cumplido antes de pasar solo al siguiente (con la barra de avance a la vista). */
export const ESPERA_AUTOMATICA_MS = 2400
/** Hasta cuántos pasos se dibuja un punto por paso; con más, una barra de avance. */
const PUNTOS_MAX = 10
const AIRE_FOCO = 4
const ANCHO_GLOBO = 320
/** Cada cuánto se vuelve a medir el objetivo por si la cinta, un panel o la ventana cambiaron de lugar sin avisar. */
const REPASO_MS = 300

interface Props {
  control: ControlTutorial
  /** Lo que ven las condiciones y los objetivos; lee las señales del editor, la simulación y la cámara. */
  ctx(): CtxTutorial
  aPantalla(p: Punto): Punto | null
  /** El rectángulo del lienzo en la ventana: una zona del mundo se recorta a él. */
  areaLienzo(): Rect | null
  /** Encuadra la vista sobre una zona del mundo con el zoom fijo del encuadre. */
  encuadrar(caja: Caja): void
  teclaDe(id: string): string | undefined
  nombreDe(id: string): string
  anunciar(texto: string): void
  /** `prefers-reduced-motion`: sin transiciones y sin paso automático. */
  movimientoReducido: boolean
  /** Configuración › «Avanzar solo en el tutorial». */
  avanzarSolo: boolean
  /** Hay un diálogo o un menú encima: el tutorial se esconde mientras tanto. */
  oculto: boolean
  onSalir(): void
  /** Tras un botón del globo el foco vuelve al lienzo: las teclas del paso (R, F5) solo valen ahí. */
  alAccion(): void
}

const igualRect = (a: Rect | null, b: Rect | null): boolean =>
  a === b || (!!a && !!b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5)

/** El panel con desplazamiento que contiene a `el` (el más cercano), si lo hay. */
function panelConDesplazamiento(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

const rectDeElemento = (el: HTMLElement): Rect => {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}

/**
 * Primer elemento del selector que tiene tamaño (en la cinta hay un botón por pestaña y solo el de la pestaña a la vista se ve).
 * Si vive en un panel con desplazamiento y queda fuera, el panel se desplaza una vez (`desplazados`) para mostrarlo y el
 * rectángulo se recorta a lo que el panel deja ver, así el marco no cae sobre lo de al lado.
 */
function rectDeControl(selector: string, desplazados?: WeakSet<Element>): Rect | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    let r = rectDeElemento(el)
    if (r.w <= 0 || r.h <= 0) continue
    const panel = panelConDesplazamiento(el)
    if (!panel) return r
    const c = rectDeElemento(panel)
    if (desplazados && !desplazados.has(el) && sobresaleDelPanel(r, c)) {
      desplazados.add(el)
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
      r = rectDeElemento(el)
    }
    return intersecar(r, c)
  }
  return null
}

function intersecar(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h)
  return x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : null
}

/** La capa del tutorial: el foco que oscurece lo demás y el globo con el paso. Solo se ve; la aplicación sigue respondiendo en toda la ventana. */
export default function Tutorial(props: Props) {
  const estado = props.control.estado
  const [ventana, setVentana] = createSignal({ w: window.innerWidth, h: window.innerHeight })
  const [repaso, setRepaso] = createSignal(0)
  const [medida, setMedida] = createSignal({ w: ANCHO_GLOBO, h: 150 })
  const [auto, setAuto] = createSignal(false)
  let globo: HTMLElement | undefined
  // El globo retiene el avance automático mientras el ratón lo cubre o el foco está dentro.
  const [encima, setEncima] = createSignal(false)
  const [conFoco, setConFoco] = createSignal(false)

  onMount(() => {
    const alRedimensionar = () => setVentana({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', alRedimensionar)
    onCleanup(() => window.removeEventListener('resize', alRedimensionar))
  })

  // El repaso periódico solo corre mientras hay un capítulo en marcha.
  createEffect(() => {
    if (!estado()) return
    const intervalo = setInterval(() => setRepaso((n) => n + 1), REPASO_MS)
    onCleanup(() => clearInterval(intervalo))
  })

  // Cada cambio del editor, de la simulación o de la cámara se revisa contra la condición del paso.
  // También con el repaso periódico: algunas condiciones se leen de la pantalla (el botón Cursores de la gráfica) y no avisan.
  createEffect(() => {
    repaso()
    if (estado()) props.control.evaluar(props.ctx())
  })

  const paso = () => {
    const e = estado()
    return e ? e.capitulo.pasos[e.paso] : null
  }

  // Cada paso desplaza su panel una sola vez: después el lector manda y el marco solo sigue a la zona.
  let desplazados = new WeakSet<Element>()
  createEffect(on(() => (estado() ? `${estado()!.capitulo.id}:${estado()!.paso}` : null), () => (desplazados = new WeakSet<Element>())))

  /** Un objetivo, ya en la ventana (null si no está a la vista). */
  const rectDe = (o: Objetivo): Rect | null => {
    if (o.tipo === 'control') {
      // Un botón de una pestaña de la cinta que no está a la vista se señala con su pestaña.
      return rectDeControl(o.selector, desplazados) ?? (o.respaldo ? rectDeControl(o.respaldo) : null) ?? (o.pestana ? rectDeControl(`#cinta-pestana-${o.pestana}`) : null)
    }
    if (o.tipo === 'zona') {
      const a = props.aPantalla({ x: o.caja.minX, y: o.caja.minY })
      const b = props.aPantalla({ x: o.caja.maxX, y: o.caja.maxY })
      const area = props.areaLienzo()
      if (!a || !b || !area) return null
      return intersecar({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }, area)
    }
    return null
  }

  /** Los focos del paso: el objetivo primero (el globo se coloca junto a él) y después los que suma el paso (la lectura, la pantalla). */
  const focos = createMemo<Rect[]>(
    () => {
      repaso()
      ventana()
      const p = paso()
      if (!p || props.oculto) return []
      const ctx = props.ctx()
      const todos = [p.objetivo(ctx), ...(p.focos?.(ctx) ?? [])]
      return todos.map(rectDe).filter((r): r is Rect => r !== null).map((r) => rectDeFoco(r, AIRE_FOCO, ventana()))
    },
    [],
    { equals: (a, b) => a.length === b.length && a.every((r, i) => igualRect(r, b[i])) }
  )
  const foco = () => focos()[0] ?? null
  const velo = createMemo(() => trazoVelo(ventana(), focos(), 8))

  // Encuadre: al empezar o retomar un capítulo y en cada paso cuyo objetivo en el lienzo queda fuera de la vista, la vista se
  // encuadra sobre la zona del capítulo con un zoom fijo (el de Encuadrar, a pasos de 50 %).
  let capituloEncuadrado: string | null = null
  createEffect(() => {
    const e = estado()
    if (!e) {
      capituloEncuadrado = null
      return
    }
    // Solo el cambio de capítulo o de paso: el estado se emite en cada evaluación.
    claveEncuadre()
    const o = untrack(() => e.capitulo.pasos[e.paso].objetivo(props.ctx()))
    const fuera = o.tipo === 'zona' && untrack(() => zonaFueraDeVista(o.caja, props.aPantalla, props.areaLienzo()))
    if (debeEncuadrar(capituloEncuadrado, e.capitulo.id, fuera)) props.encuadrar(e.capitulo.zona)
    capituloEncuadrado = e.capitulo.id
  })
  const claveEncuadre = createMemo(() => {
    const e = estado()
    return e ? `${e.capitulo.id}:${e.paso}` : null
  })
  // El editor de valores, el buscador y la barra de formato del texto se dibujan sobre el globo: se mide dónde están para que el globo se aparte.
  const estorbos = createMemo<Rect[]>(
    () => {
      repaso()
      const out: Rect[] = []
      for (const el of document.querySelectorAll<HTMLElement>('.en-linea, .buscador, .barra-formato')) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) out.push({ x: r.left, y: r.top, w: r.width, h: r.height })
      }
      return out
    },
    [],
    { equals: (a, b) => a.length === b.length && a.every((r, i) => igualRect(r, b[i])) }
  )
  const sitio = createMemo(() => {
    const lado = paso()?.lado
    return colocarGlobo({ objetivo: foco(), globo: medida(), ventana: ventana(), preferido: typeof lado === 'function' ? lado(props.ctx()) : lado, evitar: estorbos() })
  })

  // Un paso cumplido pasa solo al siguiente tras una espera con barra de avance. Se detiene mientras el globo tiene el ratón
  // encima o el foco dentro, y se reanuda al soltarlo; Configuración puede apagarlo (entonces se pulsa Siguiente).
  // Memos con comparación por valor: `estado` se emite en cada evaluación y no debe reiniciar la espera.
  const claveCumplido = createMemo(() => {
    const e = estado()
    return e?.cumplido ? `${e.capitulo.id}:${e.paso}` : null
  })
  const esUltimo = createMemo(() => {
    const e = estado()
    return !!e && e.paso >= e.capitulo.pasos.length - 1
  })
  const condicion = () => ({
    cumplido: claveCumplido() !== null,
    ultimo: esUltimo(),
    avanzarSolo: props.avanzarSolo,
    movimientoReducido: props.movimientoReducido,
    retenido: encima() || conFoco()
  })
  // El carril de la barra no depende del ratón: si apareciera y desapareciera, el globo cambiaría de alto bajo el puntero.
  const conCarril = createMemo(() => reservaBarra(condicion()))
  createEffect(() => {
    const activo = avanzaSolo(condicion())
    setAuto(activo)
    if (!activo) return
    const temporizador = setTimeout(() => {
      setAuto(false)
      props.control.siguiente()
    }, ESPERA_AUTOMATICA_MS)
    onCleanup(() => clearTimeout(temporizador))
  })

  // Lo que se dice por la región viva: el paso al llegar a él y el «hecho» al cumplirse.
  createEffect(
    on(
      () => {
        const e = estado()
        return e ? `${e.capitulo.id}:${e.paso}` : null
      },
      (clave) => {
        const e = estado()
        if (!clave || !e) return
        const p = e.capitulo.pasos[e.paso]
        props.anunciar(`Capítulo ${e.capitulo.numero}, paso ${e.paso + 1} de ${e.capitulo.pasos.length}. ${textoLlano(p.texto, props.teclaDe, props.nombreDe)}`)
      }
    )
  )
  createEffect(
    on(
      () => estado()?.cumplido === true,
      (hecho) => {
        const p = paso()
        if (hecho && p) props.anunciar(`Paso cumplido. ${p.cumplido}`)
      },
      { defer: true }
    )
  )

  // Hay una pieza del tipo esperado pero no sobre su sombra (en otro lugar o sin el giro): el globo lo dice.
  const fuera = createMemo(() => {
    repaso()
    const p = paso()
    return !!p && !props.oculto && !estado()?.cumplido && (p.fueraDeSombra?.(props.ctx()) ?? false)
  })

  /** Un paso «Mira» solo se lee: no hay acción que comprobar y se avanza con «Siguiente». */
  const esMira = () => paso()?.tipo === 'mira'
  const ultimo = () => {
    const e = estado()
    return !!e && e.paso === e.capitulo.pasos.length - 1
  }

  /** El texto de un paso (o su pista) con sus marcas dibujadas: código, iconos, gestos y teclas vigentes. */
  const Partes = (p: { texto: string }) => (
    <For each={partirTexto(p.texto, props.teclaDe)}>
      {(parte) => (parte.tipo === 'texto' ? parte.texto : parte.tipo === 'codigo' ? <code class="tutorial-codigo">{parte.texto}</code> : parte.tipo === 'icono' ? (
          <span class="tutorial-icono">
            <Show when={Object.hasOwn(TRAZOS, parte.id)}>
              <IconoCinta nombre={parte.id as NombreIcono} />
            </Show>
            {parte.texto}
          </span>
        ) : parte.tipo === 'gesto' ? (
          <span class="tutorial-gesto">
            <GestoIcono id={parte.id} />
            {parte.texto}
          </span>
        ) : parte.tecla ? <kbd>{parte.tecla}</kbd> : <b>{props.nombreDe(parte.id)}</b>)}
    </For>
  )

  return (
    <Show when={estado() && !props.oculto ? estado() : null}>
      {(e) => (
        <>
          <Show when={velo()}>
            <svg class="tutorial-velo" classList={{ cumplido: e().cumplido, 'sobre-dialogo': pasoSobreDialogo(estado()) }} width={ventana().w} height={ventana().h} aria-hidden="true">
              <path class="tutorial-velo-relleno" fill-rule="evenodd" d={velo()} />
              <For each={unirFocos(focos())}>
                {(f) => <rect class="tutorial-foco-marco" x={f.x} y={f.y} width={f.w} height={f.h} rx={Math.min(8, f.w / 2, f.h / 2)} />}
              </For>
            </svg>
          </Show>
          <section
            ref={(el) => {
              globo = el
              // El alto del globo cambia con el texto, la pista y el estado: se mide cada vez que cambia.
              const ro = new ResizeObserver(() => setMedida({ w: el.offsetWidth || ANCHO_GLOBO, h: el.offsetHeight }))
              ro.observe(el)
              onCleanup(() => ro.disconnect())
            }}
            class="tutorial-globo"
            classList={{ cumplido: e().cumplido, 'sobre-dialogo': pasoSobreDialogo(estado()) }}
            data-lado={sitio().lado}
            aria-label={`Aprende Kirchi, capítulo ${e().capitulo.numero}`}
            style={{ left: `${sitio().x}px`, top: `${sitio().y}px`, width: `${ANCHO_GLOBO}px`, '--flecha': `${sitio().flecha}px` }}
            on:pointerenter={() => setEncima(true)}
            on:pointerleave={() => setEncima(false)}
            on:focusin={() => setConFoco(true)}
            on:focusout={(ev) => setConFoco(ev.relatedTarget instanceof Node && ev.currentTarget.contains(ev.relatedTarget))}
          >
            <div class="tutorial-tope">
              <span class="tutorial-cap">
                {e().cumplido ? `Paso ${e().paso + 1} de ${e().capitulo.pasos.length} · Cumplido` : `Capítulo ${e().capitulo.numero} · ${esMira() ? 'Mira' : 'Haz'} · Paso ${e().paso + 1} de ${e().capitulo.pasos.length}`}
              </span>
              <Show
                when={e().capitulo.pasos.length <= PUNTOS_MAX}
                fallback={
                  <span class="tutorial-progreso" aria-hidden="true">
                    <b style={{ width: `${Math.round(((e().paso + (e().cumplido ? 1 : 0)) / e().capitulo.pasos.length) * 100)}%` }} />
                  </span>
                }
              >
                <span class="tutorial-puntos" aria-hidden="true">
                  <For each={e().capitulo.pasos}>
                    {(_, i) => <i classList={{ h: i() < e().paso, a: i() === e().paso && !e().cumplido, ok: i() === e().paso && e().cumplido }} />}
                  </For>
                </span>
              </Show>
            </div>
            <Show
              when={e().cumplido}
              fallback={
                <>
                  <p class="tutorial-texto">
                    <Partes texto={paso()!.texto} />
                  </p>
                  <Show when={fuera()}>
                    <p class="tutorial-pista tutorial-fuera">Colócalo sobre la sombra, con el mismo giro.</p>
                  </Show>
                  <Show when={paso()!.pista}>
                    <p class="tutorial-pista">
                      <Partes texto={paso()!.pista!} />
                    </p>
                  </Show>
                </>
              }
            >
              <p class="tutorial-texto">
                <span class="tutorial-listo">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M2 7.5l3.2 3L12 3.5" />
                  </svg>
                  {paso()!.cumplido}
                </span>{' '}
                <Show when={!ultimo()} fallback={<>Terminaste el capítulo {e().capitulo.numero}.</>}>
                  Sigue: {e().capitulo.pasos[e().paso + 1].resumen}.
                </Show>
              </p>
              <Show when={conCarril()}>
                <div class="tutorial-barra" aria-hidden="true">
                  <Show when={auto()}>
                    <b style={{ 'animation-duration': `${ESPERA_AUTOMATICA_MS}ms` }} />
                  </Show>
                </div>
              </Show>
            </Show>
            <div class="tutorial-pie">
              <button type="button" class="boton tutorial-texto-boton" onClick={() => props.onSalir()}>
                Salir
              </button>
              <div>
                <Show when={e().paso > 0}>
                  <button type="button" class="boton" onClick={() => (props.control.atras(), props.alAccion())}>
                    Atrás
                  </button>
                </Show>
                <button
                  type="button"
                  class="boton tutorial-accion"
                  classList={{ principal: e().cumplido || esMira() }}
                  onClick={() => (e().cumplido ? props.control.siguiente() : props.control.saltar(), props.alAccion())}
                >
                  {e().cumplido || esMira() ? (ultimo() ? 'Terminar' : 'Siguiente') : 'Saltar paso'}
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </Show>
  )
}
