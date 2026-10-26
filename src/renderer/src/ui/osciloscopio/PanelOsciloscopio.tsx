import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack, type JSX } from 'solid-js'
import type { Tema } from '../../../../compartido/ajustes'
import { ASPECTO_OSCILOSCOPIO, escribirAspecto, type AspectoGrafica, type AspectoTraza, type LadoEjeY, type PosicionEjeX } from '../../../../compartido/grafica/aspecto'
import type { Id } from '../../doc/tipos'
import { anuncioDeDisparo } from '../../instrumentos/barrido'
import { textoDeSerie } from '../../instrumentos/ajusteAutomatico'
import { pasoSerie } from '../../instrumentos/serie'
import { BASE_RANGO, DIVISIONES_H, MATEMATICO, type AjustesOsciloscopio, type Canal } from '../../instrumentos/ajustes'
import type { FaseSim, LecturaInstrumentos } from '../../sim/control'
import type { PantallaSab, RegistroFino } from '../../sim/protocoloInstrumentos'
import { formatearMedida, formatearValor } from '../../valores/valores'
import { acoplarVista, acoplesDistintos, notasDeAcople } from './acopleVista'
import { cursoresIniciales } from './cursores'
import type { CursoresPantalla } from './dibujar'
import BarraInstrumento from '../instrumento/BarraInstrumento'
import { accionDeTecla } from '../instrumento/barra'
import AspectoOsc from './AspectoOsc'
import MasAjustes from './MasAjustes'
import { alternarMedida, medidaDePantalla, NOMBRE_CORTO, NOMBRE_MEDIDA, textoMedida } from './medidasVista'
import { textoBarrido, textoEstado } from './panel'
import { acotarInicio, ERROR_REGISTRO, inicioTrasRegistro, limitesDeRecorrido, SIN_REGISTRO, ventanaDeRegistro } from './recorrido'
import Pantalla, { type EjeRueda } from './Pantalla'

/** Sin osciloscopio en el circuito. */
export const MENSAJE_SIN_OSCILOSCOPIO = 'Coloca un osciloscopio o mide un cable con el clic derecho.'
/** Con la vista previa en pausa o detenida, cada cuánto se mira si el worker escribió otra pantalla (sin pedir cuadros). */
export const MS_VERSION_EN_REPOSO = 100
/** Cuánto espera la pausa a que el worker escriba la pantalla con sus muestras antes de congelar lo que hay (ms). */
export const MS_ESPERA_MUESTRAS = 400
/** La línea bajo la pantalla que dice qué se puede hacer con el ratón sobre ella. */
/** La base de tiempo a la que vuelve «Restablecer el zoom» (la de omisión del osciloscopio). */
export const BASE_POR_OMISION = 1e-3
export const PISTA_PANTALLA = 'Rueda sobre un eje: su escala · Asa de un eje: lo mueve · Marca de 0 V: mueve el canal'

interface Props {
  osciloscopios: readonly { id: Id; ref: string }[]
  elegido: Id | null
  onElegir(id: Id): void
  ajustes: AjustesOsciloscopio | null
  tema: Tema
  /** El aspecto de la pantalla del osciloscopio elegido y el de cada canal. */
  aspecto?: AspectoGrafica
  aspectoCanales?: Readonly<Record<string, AspectoTraza>>
  fase: FaseSim
  teclaSimular?: string
  leer(id: Id): LecturaInstrumentos | null
  version(id: Id): number
  onColumnas(id: Id, n: number): void
  cursores?: CursoresPantalla | null
  onCursores?(c: CursoresPantalla | null): void
  /**
   * Columna de mandos. Se arma una sola vez: con cada pantalla nueva (unas 60 por segundo) los controles se recrearían entre el botón que se aprieta y el que se suelta, y las listas se cerrarían y el foco se perdería.
   */
  mandos?: (p: () => PantallaSab | null) => JSX.Element
  /** La pantalla en pausa: la imagen y los ajustes congelados, mientras la simulación sigue. */
  congelada?: { pantalla: PantallaSab; ajustes: AjustesOsciloscopio } | null
  /** Congela la pantalla que se ve; el que llama guarda lo que entrega. */
  onPausar?(c: { pantalla: PantallaSab; ajustes: AjustesOsciloscopio }): void
  onReanudar?(): void
  /** Pide al worker que escriba ya la pantalla con sus muestras de exportación (se congela con ellas). */
  onForzar?(): void
  /** La pantalla en el DOM (la exportación de la captura la usa). */
  refLienzo?: (c: HTMLCanvasElement) => void
  /** La base de tiempo pide un paso más corto y la vista previa va bajo el tiempo real: la línea que lo dice. */
  aviso?: string | null
  /** Lo que dijo el último «Ajuste automático» cuando cambió el acoplamiento (pasó A a AC). */
  notaAjuste?: string | null
  /** Cambia una propiedad del osciloscopio a la vista (Más ajustes, quitar una medida). */
  onAjuste?(prop: string, texto: string, gesto?: string): void
  onAuto?(p: PantallaSab | null): void
  /** «Exportar…»: el diálogo de la captura con su vista previa. */
  onExportar?(): void
  onEscala?(eje: EjeRueda, dir: 1 | -1): void
  onPosicion?(canal: Canal, pos: number, gesto: string): void
  /** «Abrir en ventana» (o «Acoplar», en la ventana aparte): sin esto el botón no se dibuja. */
  onVentana?(): void
  /** Es la ventana aparte: el botón de ventana dice «Acoplar». */
  enVentana?: boolean
  /** Todo lo que conservan las sondas del osciloscopio `id` (hasta `hasta`, si se da), para desplazarse con la vista previa detenida o en pausa; sin esto no hay desplazamiento. */
  registro?(id: Id, hasta?: number): Promise<RegistroFino | null>
}

/** La línea que dice qué se puede hacer con la pantalla cuando se puede recorrer lo capturado. */
export const PISTA_RECORRIDO = 'Arrastra la pantalla, usa la rueda o las flechas para recorrer lo capturado.'

/** La descripción de la pantalla para los lectores: los canales con su escala, la base de tiempo y el estado del disparo. */
export function describirPantalla(ref: string, a: AjustesOsciloscopio, p: PantallaSab | null): string {
  const canales = a.canales.filter((c) => c.on).map((c) => `${c.canal} ${formatearValor(c.vdiv, 'V')} por división${c.acople === 'DC' ? '' : ` en ${c.acople}`}`)
  const estado = p ? anuncioDeDisparo(p.estado) : 'sin captura'
  return `Osciloscopio ${ref}: ${canales.join(', ') || 'sin canales'}, ${formatearValor(a.base, 's')} por división, ${estado.toLowerCase()}.`
}

/**
 * Pestaña Osciloscopio: cabecera en vivo, pantalla, medidas y columna de mandos. «Más ajustes» abre un panel sobre la pantalla.
 */
export default function PanelOsciloscopio(props: Props) {
  const [pantalla, setPantalla] = createSignal<PantallaSab | null>(null)
  const [capturada, setCapturada] = createSignal(false)
  const [mas, setMas] = createSignal(false)
  const [aspectoAbierto, setAspectoAbierto] = createSignal(false)
  const [detalleCursores, setDetalleCursores] = createSignal(false)
  // Lo que se muestra: la pantalla congelada con sus ajustes, o la de en vivo. Por debajo, el sondeo sigue (es barato) para que al
  // reanudar no haya un salto, y el que se congela es siempre lo último que dejó el worker con sus muestras.
  const delMotor = () => props.congelada?.pantalla ?? pantalla()
  // Recorrer lo capturado: con la vista previa detenida, en pausa o con la pantalla congelada, el worker (o la copia
  // que dejó al detener) entrega todo lo registrado y de ahí se arma la ventana que empieza en `inicio`; null, la pantalla de siempre.
  const [registro, setRegistro] = createSignal<RegistroFino | null>(null)
  const [inicio, setInicio] = createSignal<number | null>(null)
  const quieta = () => !!props.congelada || (props.fase !== 'corriendo' && props.fase !== 'arrancando')
  const [sinRegistro, setSinRegistro] = createSignal<string | null>(null)
  // La clave del osciloscopio que se recorre y la de la captura: un osciloscopio u otra fase rehacen la vista; una captura nueva
  // del mismo (publicación final al pausar, cada Avanzar o Retroceder) trae el registro de nuevo SIN mover lo que el usuario recorrió.
  const idRecorrible = createMemo(() => {
    const o = delMotor()
    return quieta() && props.elegido && o && o.ncol > 0 && props.registro ? props.elegido : null
  })
  const tCapturaVista = () => delMotor()?.tCaptura
  // La pantalla y los ajustes con que llegó la captura que se ve (quieta): el punto de partida para rehacer la imagen con los
  // mandos de ahora (voltios, posición, acoplamiento y tiempo por división) sin reanudar.
  const origen = createMemo(() => {
    if (!idRecorrible()) return null
    void tCapturaVista()
    return untrack(() => {
      const [pantalla, ajustes] = [delMotor(), props.congelada?.ajustes ?? props.ajustes]
      return pantalla && ajustes ? { pantalla, ajustes } : null
    })
  })
  createEffect(() => {
    void idRecorrible()
    setInicio(null)
    setRegistro(null)
    setSinRegistro(null)
  })
  createEffect(() => {
    const id = idRecorrible()
    void tCapturaVista()
    if (!id) return
    let vigente = true
    onCleanup(() => (vigente = false))
    void props
      .registro!(id, untrack(() => props.congelada?.pantalla.tCaptura))
      .then((r) => {
        if (!vigente) return
        setRegistro(r)
        setSinRegistro(r ? null : SIN_REGISTRO)
        const a = untrack(ajustesMostrados)
        if (r && a) setInicio((i) => inicioTrasRegistro(i, r, DIVISIONES_H * a.base))
      })
      .catch(() => vigente && (setRegistro(null), setSinRegistro(ERROR_REGISTRO)))
  })
  // En pausa los mandos siguen valiendo (como el STOP de un osciloscopio digital): con la pantalla congelada se toman los de ahora para
  // voltios, posición, acoplamiento y tiempo por división, siempre que haya registro de donde rehacer la imagen.
  const ajustesMostrados = createMemo(() => {
    const c = props.congelada
    if (!c) return props.ajustes
    const v = props.ajustes
    if (!registro() || !v) return c.ajustes
    return {
      ...c.ajustes,
      base: v.base,
      canales: c.ajustes.canales.map((k) => {
        const n = v.canales.find((x) => x.canal === k.canal)
        return n ? { ...k, vdiv: n.vdiv, pos: n.pos, acople: n.acople } : k
      })
    }
  })
  const recorrible = () => !!registro() && !!ajustesMostrados()
  const ventana = createMemo(() => {
    const [i, r, b, a] = [inicio(), registro(), origen(), ajustesMostrados()]
    if (!r || !b || !a || b.pantalla.ncol === 0) return null
    // Sin recorrer, la pantalla de siempre vale mientras no cambie el tiempo por división ni el acoplamiento.
    const [otraBase, otroAcople] = [a.base !== b.ajustes.base, acoplesDistintos(a, b.ajustes)]
    if (i === null && !otraBase && !otroAcople) return null
    const v = ventanaDeRegistro(r, a.base, b.pantalla.ncol, acotarInicio(r, DIVISIONES_H * a.base, i ?? b.pantalla.t0), b.pantalla)
    return acoplarVista(v, b.ajustes, a)
  })
  const mostrada = () => ventana() ?? delMotor()
  const recorrer = (dx: number) => {
    const [r, a, o] = [registro(), ajustesMostrados(), origen()?.pantalla ?? delMotor()]
    if (!r || !a || !o) return
    const span = DIVISIONES_H * a.base
    if (dx === Number.POSITIVE_INFINITY) return setInicio(null)
    if (dx === Number.NEGATIVE_INFINITY) return setInicio(limitesDeRecorrido(r, span).min)
    setInicio(acotarInicio(r, span, (ventana()?.t0 ?? o.t0) + dx * span))
  }
  const rangoVisto = () => {
    const v = inicio() === null ? null : ventana()
    return v ? `Viendo t = ${formatearMedida(v.t0, 's', 4)} a ${formatearMedida(v.t0 + v.dt * v.ncol, 's', 4)}` : null
  }
  /** Se pidió pausar y falta la pantalla con sus muestras (el worker las arma cada 250 ms). */
  let esperandoMuestras = false
  const congelar = (p: PantallaSab) => {
    esperandoMuestras = false
    if (props.ajustes) props.onPausar?.({ pantalla: p, ajustes: props.ajustes })
  }
  const pausar = () => {
    const p = pantalla()
    if (!p || p.ncol === 0 || !props.ajustes) return
    if (p.csv.n > 0) return congelar(p)
    esperandoMuestras = true
    props.onForzar?.()
    // Si el worker no contesta a tiempo, se congela lo que hay (la exportación saldrá de las columnas, y el CSV lo dice).
    setTimeout(() => esperandoMuestras && congelar(pantalla() ?? p), MS_ESPERA_MUESTRAS)
  }
  const alternarPausa = () => (props.congelada ? props.onReanudar?.() : pausar())
  let botonMas: HTMLButtonElement | undefined
  let botonAspecto: HTMLButtonElement | undefined
  let raiz: HTMLDivElement | undefined
  let vista = -1
  const mirar = () => {
    const id = props.elegido
    if (!id) return
    const v = props.version(id)
    if (v === vista) return
    vista = v
    const l = props.leer(id)
    setPantalla(l?.pantalla ?? null)
    setCapturada(l?.capturada ?? false)
    if (esperandoMuestras && l?.pantalla && l.pantalla.ncol > 0 && l.pantalla.csv.n > 0) congelar(l.pantalla)
  }
  createEffect(() => {
    // Otra fase u otro osciloscopio: se mira de nuevo enseguida.
    const fase = props.fase
    void props.elegido
    vista = -1
    mirar()
    let cuadro = 0
    let temporizador: ReturnType<typeof setInterval> | undefined
    if (fase === 'corriendo') {
      const paso = () => {
        mirar()
        cuadro = requestAnimationFrame(paso)
      }
      cuadro = requestAnimationFrame(paso)
    } else temporizador = setInterval(mirar, MS_VERSION_EN_REPOSO)
    onCleanup(() => {
      if (cuadro) cancelAnimationFrame(cuadro)
      clearInterval(temporizador)
    })
  })
  // Solo se arma la pantalla que se ve: al cambiar de osciloscopio, el de antes pasa a 0 columnas y el nuevo toma el ancho de la
  // retícula; al cerrar la pestaña (el panel se desmonta), el elegido pasa a 0.
  let ancho = 0
  let mostrado: Id | null = null
  const columnas = (n: number) => {
    ancho = n
    if (props.elegido) props.onColumnas(props.elegido, n)
  }
  createEffect(() => {
    const id = props.elegido
    if (mostrado && mostrado !== id) props.onColumnas(mostrado, 0)
    if (id && id !== mostrado && ancho > 0) props.onColumnas(id, ancho)
    mostrado = id
  })
  onCleanup(() => {
    if (mostrado) props.onColumnas(mostrado, 0)
  })
  const refDelElegido = () => props.osciloscopios.find((o) => o.id === props.elegido)?.ref ?? ''
  const conPantalla = () => !!mostrada() && mostrada()!.ncol > 0
  /** Se puede congelar con la simulación en marcha y una pantalla armada; reanudar siempre se puede. */
  const puedePausar = () => !!props.congelada || (props.fase === 'corriendo' && conPantalla())
  /** Se puede acercar o alejar la base de tiempo un paso (el zoom de la barra mueve el tiempo por división). */
  const puedeZoomTiempo = (dir: 1 | -1) => !!props.ajustes && pasoSerie(props.ajustes.base, dir, BASE_RANGO[0], BASE_RANGO[1]) !== props.ajustes.base
  // Las teclas de la barra con el foco en el panel (fuera de un campo de texto o una lista): P, A, C, +, −, 0, S, M, Ctrl+E y Ctrl+Mayús+V.
  const tecla = (e: KeyboardEvent) => {
    const a = accionDeTecla(e)
    if (!a || (e.target as HTMLElement).closest('input, select, textarea, [contenteditable]')) return
    const botón = raiz?.querySelector<HTMLButtonElement>(`.barra-instrumento [data-accion="${a}"]`)
    if (!botón || botón.disabled) return
    e.preventDefault()
    botón.click()
  }
  const alternarCursores = () => {
    const a = props.ajustes
    if (props.cursores) return props.onCursores?.(null)
    const p = mostrada()
    if (!a || !p) return
    const canal = a.canales.find((c) => c.on)?.canal ?? 'A'
    props.onCursores?.(cursoresIniciales(a, p.t0, canal))
  }
  /** Al abrir, el foco entra al panel (la primera casilla de las medidas o, sin canales, su botón de cerrar): ahí Esc lo cierra. */
  /** Mover un eje con el ratón: el lado de la escala de un canal o dónde va el eje del tiempo, en la propiedad `aspecto`. */
  const guardarAspecto = (a: AspectoGrafica, canales: Readonly<Record<string, AspectoTraza>>) => props.onAjuste?.('aspecto', escribirAspecto(a, canales, ASPECTO_OSCILOSCOPIO) || 'normal')
  const moverLado = (canal: Canal, lado: LadoEjeY) => {
    const canales = props.aspectoCanales ?? {}
    guardarAspecto(props.aspecto ?? ASPECTO_OSCILOSCOPIO, { ...canales, [canal]: { ...(canales[canal] ?? { lado: 'izquierda' as const, color: null }), lado } })
  }
  const moverEjeTiempo = (ejeX: PosicionEjeX) => guardarAspecto({ ...(props.aspecto ?? ASPECTO_OSCILOSCOPIO), ejeX }, props.aspectoCanales ?? {})
  const abrirAspecto = () => {
    setMas(false)
    setAspectoAbierto(true)
    queueMicrotask(() => raiz?.querySelector<HTMLElement>('#osc-aspecto .hoja-cerrar')?.focus())
  }
  const cerrarAspecto = (volverFoco: boolean) => {
    setAspectoAbierto(false)
    if (volverFoco) botonAspecto?.focus()
  }
  const abrirMas = () => {
    setAspectoAbierto(false)
    setMas(true)
    queueMicrotask(() => raiz?.querySelector<HTMLElement>('#osc-mas-ajustes input[type=checkbox]:not(:disabled), #osc-mas-ajustes .osc-mas-cerrar')?.focus())
  }
  const cerrarMas = (volverFoco: boolean) => {
    setMas(false)
    if (volverFoco) botonMas?.focus()
  }
  const notas = () => [props.notaAjuste, ...(props.ajustes ? notasDeAcople(props.ajustes) : [])].filter((n): n is string => !!n)
  return (
    <Show when={props.osciloscopios.length > 0} fallback={<p class="secundario">{MENSAJE_SIN_OSCILOSCOPIO}</p>}>
      <div class="osciloscopio" ref={raiz} onKeyDown={tecla}>
        <div class="osc-vista">
          <BarraInstrumento
            etiqueta={`Barra del instrumento: ${refDelElegido()}`}
            enVentana={props.enVentana}
            inicio={
              <>
                <Show
                  when={props.osciloscopios.length > 1}
                  fallback={
                    <span class="osc-nombre">
                      <b>{refDelElegido()}</b> <span class="secundario">Osciloscopio</span>
                    </span>
                  }
                >
                  <label class="osc-nombre">
                    <span class="solo-lectores">Osciloscopio</span>
                    <select value={props.elegido ?? ''} onChange={(e) => props.onElegir(e.currentTarget.value)}>
                      <For each={props.osciloscopios}>{(o) => <option value={o.id}>{o.ref}</option>}</For>
                    </select>
                  </label>
                </Show>
                <span class="osc-estado" role="status" data-fase={props.congelada ? 'pantalla-pausada' : props.fase}>
                  <span class="osc-estado-punto" aria-hidden="true" />
                  {textoEstado(props.fase, capturada(), mostrada(), props.teclaSimular, !!props.congelada)}
                </span>
                <Show when={!props.congelada && textoBarrido(props.fase, mostrada())}>
                  {(t) => (
                    <span class="osc-barrido cifra secundario" aria-hidden="true">
                      {t()}
                    </span>
                  )}
                </Show>
              </>
            }
            botones={{
              pausa: { onClick: alternarPausa, activo: !!props.congelada, deshabilitado: !puedePausar() },
              auto: { onClick: () => props.onAuto?.(mostrada()), deshabilitado: !mostrada() },
              cursores: { onClick: alternarCursores, activo: !!props.cursores, deshabilitado: !props.cursores && !mostrada() },
              acercar: { onClick: () => props.onEscala?.({ tipo: 'tiempo' }, -1), deshabilitado: !puedeZoomTiempo(-1) },
              alejar: { onClick: () => props.onEscala?.({ tipo: 'tiempo' }, 1), deshabilitado: !puedeZoomTiempo(1) },
              restablecer: { onClick: () => props.onAjuste?.('base', textoDeSerie(BASE_POR_OMISION)), deshabilitado: !props.ajustes || props.ajustes.base === BASE_POR_OMISION },
              exportar: { onClick: () => props.onExportar?.(), deshabilitado: !conPantalla() },
              aspecto: { onClick: () => (aspectoAbierto() ? cerrarAspecto(false) : abrirAspecto()), expandido: aspectoAbierto(), controla: 'osc-aspecto', ref: (el) => (botonAspecto = el) },
              mas: { onClick: () => (mas() ? cerrarMas(false) : abrirMas()), expandido: mas(), controla: 'osc-mas-ajustes', ref: (el) => (botonMas = el) },
              ...(props.onVentana ? { ventana: { onClick: () => props.onVentana!() } } : {})
            }}
            medirExtra={
              <Show when={props.cursores}>
                <button type="button" class="bi-detalles" aria-pressed={detalleCursores()} onClick={() => setDetalleCursores((d) => !d)}>
                  {detalleCursores() ? 'Ocultar detalles' : 'Ver detalles'}
                </button>
              </Show>
            }
          />
          <div class="osc-pantalla">
            <Show when={ajustesMostrados()} fallback={<p class="secundario">Los ajustes de este osciloscopio no son válidos: revísalos en el inspector.</p>}>
              {(a) => (
                <Pantalla
                  pantalla={mostrada()}
                  ajustes={a()}
                  tema={props.tema}
                  aspecto={props.aspecto}
                  canales={props.aspectoCanales}
                  descripcion={describirPantalla(refDelElegido(), a(), mostrada())}
                  cursores={props.cursores}
                  onCursores={(c) => props.onCursores?.(c)}
                  onColumnas={columnas}
                  onEscala={(e, d) => props.onEscala?.(e, d)}
                  onPosicion={(c, p, g) => props.onPosicion?.(c, p, g)}
                  detalleCursores={detalleCursores()}
                  onLado={moverLado}
                  onEjeTiempo={moverEjeTiempo}
                  recorrible={recorrible()}
                  onRecorrer={recorrer}
                  ref={props.refLienzo}
                />
              )}
            </Show>
          </div>
          <Show when={rangoVisto()}>
            {(t) => (
              <p class="osc-recorrido">
                <span>{t()}</span>
                <button type="button" class="boton" onClick={() => setInicio(null)}>
                  Volver al final
                </button>
              </p>
            )}
          </Show>
          <div class="osc-pie">
            {/* Las notas (la base de tiempo bajo el tiempo real, el acoplamiento, el ajuste automático) van bajo la pantalla: si aparecieran
                arriba, la moverían mientras se simula. El texto completo, en el título. */}
            <Show
              when={props.aviso || notas().length > 0}
              fallback={<Show when={props.congelada && !recorrible()}><p class="osc-nota-vivo secundario">Pausada: los cambios de escala se ven al reanudar.</p></Show>}
            >
              <p class="osc-notas" classList={{ aviso: !!props.aviso }} title={[props.aviso, ...notas()].filter(Boolean).join(' ')}>
                {[props.aviso, ...notas()].filter(Boolean).join(' · ')}
              </p>
            </Show>
            <ul class="osc-medidas" aria-label="Medidas a la vista">
              <For each={ajustesMostrados()?.medidas ?? []}>
                {(m) => {
                  const t = () => textoMedida(m.medida, medidaDePantalla(mostrada(), m))
                  const letra = m.canal === MATEMATICO ? 'A − B' : m.canal
                  return (
                    <li class="osc-ficha" data-canal={m.canal} title={t().razon ?? undefined}>
                      {/* Con espacios entre las partes: el texto de la ficha se lee «A Vpp 3.000 V», no «AVpp3.000 V». */}
                      <b class="osc-letra">{letra}</b>{' '}
                      <span>{NOMBRE_CORTO[m.medida]}</span>{' '}
                      <span class="cifra">{t().texto}</span>
                      <Show when={t().razon}>{(r) => <span class="solo-lectores">{`: ${r()}`}</span>}</Show>
                      <button
                        type="button"
                        class="osc-quitar"
                        aria-label={`Quitar ${NOMBRE_MEDIDA[m.medida]} del canal ${letra}`}
                        onClick={(e) => {
                          if (!props.ajustes) return
                          // Quitar la ficha quita el botón con el foco: pasa a la ficha siguiente o a «+ Medida».
                          const li = e.currentTarget.closest('li')
                          const i = li ? [...li.parentElement!.children].indexOf(li) : 0
                          props.onAjuste?.('medidas', alternarMedida(props.ajustes.medidas, m) ?? '')
                          requestAnimationFrame(() => {
                            const fichas = raiz?.querySelectorAll<HTMLElement>('.osc-medidas .osc-quitar, .osc-medidas .osc-medida-nueva')
                            fichas?.[Math.min(i, fichas.length - 1)]?.focus()
                          })
                        }}
                      >
                        ×
                      </button>
                    </li>
                  )
                }}
              </For>
              <li>
                <button type="button" class="boton osc-medida-nueva" aria-expanded={mas()} aria-controls={mas() ? 'osc-mas-ajustes' : undefined} onClick={abrirMas}>
                  <span aria-hidden="true">+</span> Medida
                </button>
              </li>
            </ul>
            <p class="osc-pista secundario">{PISTA_PANTALLA}</p>
            <Show when={!recorrible() && sinRegistro()}>
              <p class="osc-pista secundario">{sinRegistro()}</p>
            </Show>
            <Show when={recorrible()}>
              <p class="osc-pista secundario">{PISTA_RECORRIDO}</p>
            </Show>
          </div>
          <Show when={mas() && props.ajustes}>
            {(a) => (
              <MasAjustes
                refOsc={refDelElegido()}
                ajustes={a()}
                pantalla={mostrada()}
                cursores={props.cursores ?? null}
                onCursores={(c) => props.onCursores?.(c)}
                onAjuste={(p, t, g) => props.onAjuste?.(p, t, g)}
                onAspecto={abrirAspecto}
                onCerrar={cerrarMas}
              />
            )}
          </Show>
        </div>
        <div class="osc-lateral">{untrack(() => props.mandos?.(pantalla))}</div>
        {/* La hoja de aspecto cubre el lado derecho de toda la franja, no solo la pantalla. */}
        <Show when={aspectoAbierto() && props.ajustes}>
          {(a) => <AspectoOsc ajustes={a()} aspecto={props.aspecto} aspectoCanales={props.aspectoCanales} onAjuste={(p, t) => props.onAjuste?.(p, t)} onCerrar={cerrarAspecto} />}
        </Show>
      </div>
    </Show>
  )
}
