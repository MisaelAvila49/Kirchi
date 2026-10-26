import { Show } from 'solid-js'
import type { FaseSim } from '../sim/control'
import { plural } from './proyecto'
import { textoModo } from './vistaPrevia'
import { formatearTiempo, LO_MAS_RAPIDO, textoVelocidad } from './tiempo/velocidades'

// Los botones no toman el foco con el ratón: Espacio y los atajos siguen yendo al lienzo.
const sinFoco = (e: MouseEvent) => e.preventDefault()

interface Props {
  zoom: number
  /** La fase de la vista previa: la barra dice el modo (Edición, Simulando o En pausa). */
  fase?: FaseSim
  piezas: number
  redes: number
  /** Figuras de dibujo: solo se nombran si hay. */
  figuras?: number
  /** Acción o pista en curso (`pistaDeEstado`). */
  pista: string
  /** Fracción del tiempo real que alcanza la vista previa (null si no corre): por debajo de 100 % se marca en ámbar. */
  tiempoReal?: number | null
  /** Si la barra va en ámbar (`HisteresisDeRitmo`): la cifra se muestra mientras lo esté. */
  lento?: boolean
  /** − y + junto a la cifra de zoom: las mismas órdenes que el control de la cinta. */
  onPasoZoom?(dir: 1 | -1, boton: HTMLElement): void
  /** El zoom está en su mínimo o en su máximo: ese botón queda deshabilitado. */
  topeZoom?: 'minimo' | 'maximo' | null
  /** Tiempo simulado, velocidad y avance de «Avanzar hasta t» mientras existe la vista previa. */
  tiempo?: { t: number; velocidad: number; rapidez?: number; avance?: string | null } | null
  /** La velocidad es un botón que abre el mismo menú de la cinta. */
  onVelocidad?(boton: HTMLElement): void
  /** El icono de sonido, solo si el circuito tiene algo que suena; un clic silencia o reanuda un sonido bloqueado. */
  sonido?: { activo: boolean; bloqueado: boolean; onClic(): void } | null
  /** La grabación en curso («● Grabando 00:42 · Pausar · Detener»); null si no se graba. */
  grabando?: { pausada: boolean; reloj: string; onPausar(): void; onDetener(): void } | null
}

/** Texto tras la velocidad (ritmo respecto al tiempo real). Vacío en pausa. */
export function restoDeTiempo(v: number, ratio: number | null, lento: boolean, rapidez?: number): string {
  if (ratio === null) return ''
  if (v === LO_MAS_RAPIDO) return rapidez && rapidez > 0 ? ` · ${Number(rapidez.toPrecision(2)).toLocaleString('en-US')}× el tiempo real` : ''
  const pct = Math.min(100, Math.max(0, Math.round(ratio * 100)))
  return lento ? ` · al ${Math.min(99, pct)} % de ${textoVelocidad(v)}` : ` · al ${pct} %`
}

/** El renglón entero, sin el modo: «t = 12.35 ms · 0.01× · al 100 %». */
export const textoTiempo = (t: number, v: number, ratio: number | null, lento = false, rapidez?: number): string => `t = ${formatearTiempo(t, v)} · ${textoVelocidad(v)}${restoDeTiempo(v, ratio, lento, rapidez)}`

/** Cuándo la barra se pone en ámbar. La histéresis evita el parpadeo al oscilar el ritmo cerca del 100 %. */
export class HisteresisDeRitmo {
  private activo = false
  private desde: number | null = null

  actualizar(r: number | null | undefined, ahoraMs: number): boolean {
    if (r == null || !Number.isFinite(r)) {
      this.activo = false
      this.desde = null
      return false
    }
    if (this.activo) {
      if (r > 0.99) this.activo = false
      return this.activo
    }
    if (r < 0.97) {
      this.activo = true
      return true
    }
    if (r < 0.99) {
      this.desde ??= ahoraMs
      if (ahoraMs - this.desde >= 1000) {
        this.activo = true
        return true
      }
    } else this.desde = null
    return false
  }
}

/** El porcentaje del tiempo real que se marca en ámbar: el que se redondea a menos de 100 %. */
export const porcentajeLento = (r: number | null | undefined): number | null => (r == null || !Number.isFinite(r) || Math.round(r * 100) >= 100 ? null : Math.max(0, Math.round(r * 100)))

/** Barra de estado de 22 px: rejilla, zoom, piezas y redes, y la acción en curso. */
export default function BarraEstado(props: Props) {
  return (
    <footer class="estado-barra">
      <span class="estado-modo">{textoModo(props.fase ?? 'detenida')}</span>
      <Show when={props.tiempo}>
        {(t) => (
          <span class="estado-tiempo cifra">
            t = {formatearTiempo(t().t, t().velocidad)} ·{' '}
            <Show when={props.onVelocidad} fallback={textoVelocidad(t().velocidad)}>
              <button type="button" class="boton-estado estado-texto" aria-haspopup="menu" aria-label={`Velocidad ${textoVelocidad(t().velocidad)}`} onMouseDown={sinFoco} onClick={(e) => props.onVelocidad?.(e.currentTarget)}>
                {textoVelocidad(t().velocidad)}
              </button>
            </Show>
            <span classList={{ 'estado-lento': !!props.lento }}>{restoDeTiempo(t().velocidad, props.fase === 'corriendo' ? (props.tiempoReal ?? null) : null, !!props.lento, t().rapidez)}</span>
            <Show when={t().avance}>{(a) => <span class="estado-avance"> · {a()}</span>}</Show>
          </span>
        )}
      </Show>
      <Show when={props.grabando}>
        {(g) => (
          <span class="estado-grabando" role="group" aria-label="Grabación en curso">
            <span class="punto-grabando" classList={{ pausado: g().pausada }} aria-hidden="true">
              ●
            </span>{' '}
            <span class="cifra">
              {g().pausada ? 'En pausa' : 'Grabando'} {g().reloj}
            </span>
            {' · '}
            <button type="button" class="boton-estado estado-texto" onMouseDown={sinFoco} onClick={() => g().onPausar()}>
              {g().pausada ? 'Continuar' : 'Pausar'}
            </button>
            {' · '}
            <button type="button" class="boton-estado estado-texto" onMouseDown={sinFoco} onClick={() => g().onDetener()}>
              Detener
            </button>
          </span>
        )}
      </Show>
      <Show when={props.sonido}>
        {(s) => (
          <button type="button" class="boton-estado estado-texto" aria-pressed={s().activo ? 'true' : 'false'} onMouseDown={sinFoco} onClick={() => s().onClic()}>
            {s().bloqueado ? 'Sonido bloqueado: haz clic para oírlo' : s().activo ? 'Sonido' : 'Sin sonido'}
          </button>
        )}
      </Show>
      <span>Rejilla 2.5 mm</span>
      <span class="estado-zoom">
        <Show when={props.onPasoZoom}>
          <button type="button" class="boton-estado" aria-label="Alejar" aria-disabled={props.topeZoom === 'minimo' ? 'true' : undefined} onMouseDown={sinFoco} onClick={(e) => props.onPasoZoom?.(-1, e.currentTarget)}>
            −
          </button>
        </Show>
        <span>Zoom {props.zoom} %</span>
        <Show when={props.onPasoZoom}>
          <button type="button" class="boton-estado" aria-label="Acercar" aria-disabled={props.topeZoom === 'maximo' ? 'true' : undefined} onMouseDown={sinFoco} onClick={(e) => props.onPasoZoom?.(1, e.currentTarget)}>
            +
          </button>
        </Show>
      </span>
      <span>
        {plural(props.piezas, 'pieza', 'piezas')} · {plural(props.redes, 'red', 'redes')}
        {props.figuras ? ` · ${plural(props.figuras, 'figura', 'figuras')}` : ''}
      </span>
      <Show when={!props.tiempo && props.lento && props.tiempoReal != null && Number.isFinite(props.tiempoReal)}>
        <span class="estado-lento">Al {Math.min(99, Math.max(0, Math.round((props.tiempoReal ?? 0) * 100)))} % del tiempo real</span>
      </Show>
      <span class="estado-pista">{props.pista}</span>
    </footer>
  )
}
