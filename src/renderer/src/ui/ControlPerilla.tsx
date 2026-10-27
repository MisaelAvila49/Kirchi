import { createMemo, createSignal, createUniqueId, For, Show, type JSX } from 'solid-js'
import type { EnVivo } from '../piezas/tipos'
import { ladosDelPot } from '../sim/potenciometro'
import { formatearValor } from '../valores/valores'
import { fraccionEnVivo, leerEnVivo, pasoEnVivo, valorDeFraccion } from '../valores/enVivo'
import CampoValor from './CampoValor'

/** El potenciómetro seleccionado: su pieza, su referencia y la posición actual (0 a 100). */
export interface PotVista {
  id: string
  ref: string
  posicion: number
  /** Resistencia total en Ω (null si el valor no se lee): con ella el inspector dice cuánto mide cada lado del cursor. */
  ohms?: number | null
  /** La ley de variación («logarítmica») y si es un reóstato (una sola resistencia del extremo al cursor). */
  ley?: string
  reostato?: boolean
}

/** Una perilla en vivo de la pieza seleccionada: su propiedad, el valor actual y el rango. */
export interface PerillaVista {
  id: string
  propId: string
  ref: string
  nombre: string
  unidad: string
  valor: number
  enVivo: EnVivo
}

interface Props {
  perilla: PerillaVista
  /** `gesto`: el mismo valor mientras dura un arrastre del control (un solo paso de deshacer); sin él, el teclado y el campo. */
  onCambiar(valor: number, gesto?: string): void
  /** Con campo escrito (las perillas en vivo) o solo la cifra (el potenciómetro). */
  campo?: boolean
  /** Cómo se dice el valor en la cifra y en `aria-valuetext`. */
  decir?(valor: number): string
  /** Rótulo del deslizador para lectores de pantalla; por omisión «Nombre de REF». */
  etiqueta?: string
  /** Debajo del deslizador (las dos mitades del potenciómetro). */
  pie?: JSX.Element
}

let contador = 0
/** Resolución del deslizador de una escala logarítmica: la posición se guarda como fracción de 0 a 1000. */
const PASOS_LOG = 1000
const DIEZ = 10

/** Las etiquetas de la escala: los extremos y, en logarítmica, el punto medio de las décadas. */
function marcasDeEscala(ev: EnVivo, unidad: string): string[] {
  const valores = ev.escala === 'log' ? [ev.min, Number(Math.sqrt(ev.min * ev.max).toPrecision(2)), ev.max] : [ev.min, ev.max]
  return valores.map((v) => formatearValor(v, unidad))
}

/**
 * Perilla: deslizador (rol slider) y, si se pide, campo con unidad para escribir el valor. Flechas un paso, Shift paso fino,
 * Re Pág y Av Pág diez pasos, Inicio y Fin los extremos. En escala logarítmica cada muesca multiplica.
 */
export default function ControlPerilla(props: Props) {
  const id = `perilla-${createUniqueId()}`
  const ev = () => props.perilla.enVivo
  const log = () => ev().escala === 'log'
  const conCampo = () => props.campo !== false
  const decir = (v: number) => props.decir?.(v) ?? formatearValor(v, props.perilla.unidad)
  let gesto: string | undefined
  const soltar = () => (gesto = undefined)
  const [error, setError] = createSignal<string | null>(null)
  let escrito: string | null = null
  const quitarFracciones = (v: number) => Number(v.toPrecision(6))

  const posicion = createMemo(() => (log() ? Math.round(fraccionEnVivo(ev(), props.perilla.valor) * PASOS_LOG) : props.perilla.valor))
  const desdeDeslizador = (n: number): number => {
    if (log()) return valorDeFraccion(ev(), n / PASOS_LOG)
    // Sin paso nativo (paso fino distinto): el arrastre se ajusta al paso normal, el fino queda para el teclado y el campo.
    const e = ev()
    return quitarFracciones(Math.min(e.max, Math.max(e.min, e.min + Math.round((n - e.min) / e.paso) * e.paso)))
  }
  const cambiar = (v: number, g?: string) => {
    setError(null)
    props.onCambiar(v, g)
  }
  const tecla = (e: KeyboardEvent) => {
    const v = props.perilla.valor
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
    let nuevo: number | null = null
    if (dir) nuevo = pasoEnVivo(ev(), v, dir, e.shiftKey)
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      nuevo = v
      for (let i = 0; i < DIEZ; i++) nuevo = pasoEnVivo(ev(), nuevo, e.key === 'PageUp' ? 1 : -1)
    } else if (e.key === 'Home') nuevo = ev().min
    else if (e.key === 'End') nuevo = ev().max
    if (nuevo === null) return
    e.preventDefault()
    e.stopPropagation()
    if (nuevo !== v) cambiar(nuevo)
  }
  const aplicarCampo = () => {
    if (escrito === null) return
    const l = leerEnVivo({ nombre: props.perilla.nombre, unidad: props.perilla.unidad, enVivo: ev() }, escrito)
    if ('error' in l) return setError(l.error)
    escrito = null
    cambiar(l.valor)
  }
  const textoCampo = () => String(quitarFracciones(props.perilla.valor))
  const campoId = `${id}-campo`
  const marcas = createMemo(() => marcasDeEscala(ev(), props.perilla.unidad))

  return (
    <div class="fld fld-pos" classList={{ 'fld-perilla': conCampo() }}>
      <label for={conCampo() ? campoId : id}>{props.perilla.nombre}</label>
      <Show when={conCampo()} fallback={<output class="cifra" for={id}>{decir(props.perilla.valor)}</output>}>
        <CampoValor
          texto={textoCampo()}
          unidad={props.perilla.unidad}
          nombre={props.perilla.nombre}
          atributos={{ id: campoId, 'aria-describedby': `${id}-ayuda` }}
          invalido={!!error()}
          onTexto={(t) => {
            escrito = t
            if (error()) setError(null)
          }}
          onAplicar={aplicarCampo}
          onTecla={(e) => {
            if (e.key === 'Enter') aplicarCampo()
          }}
        />
      </Show>
      <input
        id={id}
        class="deslizador"
        type="range"
        min={log() ? 0 : ev().min}
        max={log() ? PASOS_LOG : ev().max}
        step={log() ? 1 : ev().paso === ev().pasoFino ? ev().paso : 'any'}
        value={posicion()}
        aria-valuetext={decir(props.perilla.valor)}
        aria-label={props.etiqueta ?? `${props.perilla.nombre} de ${props.perilla.ref}`}
        onPointerDown={() => (gesto = `d${++contador}`)}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onBlur={soltar}
        on:keydown={tecla}
        onInput={(e) => cambiar(desdeDeslizador(Number(e.currentTarget.value)), gesto)}
      />
      <Show when={conCampo()}>
        <div class="escala cifra" aria-hidden="true">
          <For each={marcas()}>{(m) => <span>{m}</span>}</For>
        </div>
        <p id={`${id}-ayuda`} class={error() ? 'campo-error' : 'campo-ayuda'} aria-live="polite">
          {error() ?? ''}
        </p>
      </Show>
      {props.pie}
    </div>
  )
}

/** Posición del cursor de un potenciómetro (0 a 100 %): la perilla sin campo escrito, con las dos mitades debajo. */
export function ControlPosicionPot(props: { pot: PotVista; onCambiar(posicion: number, gesto?: string): void; lados?: boolean }) {
  const perilla = (): PerillaVista => ({
    id: props.pot.id,
    propId: 'posicion',
    ref: props.pot.ref,
    nombre: 'Posición del cursor',
    unidad: '%',
    valor: Math.round(props.pot.posicion),
    enVivo: { magnitud: 'carga', min: 0, max: 100, paso: 1, pasoFino: 1 }
  })
  return (
    <ControlPerilla
      perilla={perilla()}
      campo={false}
      decir={(v) => `${Math.round(v)} %`}
      etiqueta={`Posición del cursor de ${props.pot.ref}`}
      onCambiar={props.onCambiar}
      pie={
        <Show when={props.lados ? ladosDelPot(props.pot.ohms ?? null, props.pot.posicion, props.pot.ley) : null}>
          {(l) => (
            <>
              <span class="secundario fld-lado">{props.pot.reostato ? 'Extremo a cursor' : 'Pin 1 a cursor'}</span>
              <b class="cifra">{l().pin1}</b>
              <Show when={!props.pot.reostato}>
                <span class="secundario fld-lado">Cursor a pin 2</span>
                <b class="cifra">{l().pin2}</b>
              </Show>
            </>
          )}
        </Show>
      }
    />
  )
}
