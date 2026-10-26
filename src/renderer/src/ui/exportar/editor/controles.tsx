import { createUniqueId, For, Show, type JSX } from 'solid-js'
import { TONOS_FIGURA, type TonoFigura } from '../../../../../compartido/ajustes'
import { NOMBRE_TONO_FIGURA } from '../modelo'

/** Controles chicos que comparten el panel de propiedades y la barra flotante del editor de exportar. */

/** Una fila de tonos de la tabla de colores (con «Auto» si `auto` dice qué tono vuelve a ser el de omisión). */
export function Tonos(props: { nombre: string; valor: TonoFigura | null | undefined; onElegir(t: TonoFigura | null): void; tonos?: readonly TonoFigura[]; auto?: string }) {
  return (
    <span class="tonos-figura editor-tonos" role="group" aria-label={props.nombre}>
      <Show when={props.auto}>
        <button type="button" class="asp-sin-tono" aria-pressed={props.valor == null} aria-label={`Auto, ${props.auto}`} title={props.auto} onClick={() => props.onElegir(null)}>
          Auto
        </button>
      </Show>
      <For each={props.tonos ?? TONOS_FIGURA}>
        {(t) => <button type="button" class="tono-figura" data-tono-figura={t} aria-pressed={props.valor === t} aria-label={NOMBRE_TONO_FIGURA[t]} title={NOMBRE_TONO_FIGURA[t]} onClick={() => props.onElegir(t)} />}
      </For>
    </span>
  )
}

/** Un deslizador con su rótulo y su valor escrito; `clave` junta los cambios de un mismo arrastre en un solo paso de deshacer. */
export function Deslizador(props: { rotulo: string; min: number; max: number; paso?: number; valor: number; texto?: string; onCambiar(v: number): void }) {
  return (
    <label class="editor-campo editor-deslizador">
      <span class="editor-rotulo">{props.rotulo}</span>
      <input type="range" min={props.min} max={props.max} step={props.paso ?? 1} value={props.valor} aria-valuetext={props.texto ?? String(props.valor)} onInput={(e) => props.onCambiar(Number(e.currentTarget.value))} />
      <output class="cifra">{props.texto ?? props.valor}</output>
    </label>
  )
}

/** Un interruptor con rótulo (una casilla con aspecto de interruptor). */
export function Interruptor(props: { rotulo: string; activo: boolean; onCambiar(v: boolean): void; deshabilitado?: boolean }) {
  return (
    <label class="editor-campo editor-interruptor">
      <span class="editor-rotulo">{props.rotulo}</span>
      <input type="checkbox" role="switch" checked={props.activo} disabled={props.deshabilitado} onChange={(e) => props.onCambiar(e.currentTarget.checked)} />
    </label>
  )
}

/** Una fila con un rótulo a la izquierda y el control a la derecha. */
export function Fila(props: { rotulo: string; children: JSX.Element }) {
  const id = createUniqueId()
  return (
    <div class="editor-campo" role="group" aria-labelledby={id}>
      <span class="editor-rotulo" id={id}>
        {props.rotulo}
      </span>
      <div class="editor-control">{props.children}</div>
    </div>
  )
}

/** Un grupo de pastillas excluyentes (un radio por opción). */
export function Pastillas<T extends string>(props: { nombre: string; valor: T; opciones: readonly (readonly [T, string])[]; onCambiar(v: T): void }) {
  const grupo = createUniqueId()
  return (
    <div class="editor-pastillas" role="radiogroup" aria-label={props.nombre}>
      <For each={props.opciones}>
        {([v, texto]) => (
          <label class="asp-pastilla">
            <input type="radio" name={`${grupo}`} checked={props.valor === v} onChange={() => props.onCambiar(v)} />
            <span>{texto}</span>
          </label>
        )}
      </For>
    </div>
  )
}

/** Un par de botones − y + con la cifra en medio (tamaño o grosor). */
export function Escalonador(props: { nombre: string; texto: string; onMenos(): void; onMas(): void; menosOff?: boolean; masOff?: boolean }) {
  return (
    <span class="editor-escalonador" role="group" aria-label={props.nombre}>
      <button type="button" class="boton-icono" aria-label={`Disminuir ${props.nombre.toLowerCase()}`} disabled={props.menosOff} onClick={props.onMenos}>
        −
      </button>
      <output class="cifra">{props.texto}</output>
      <button type="button" class="boton-icono" aria-label={`Aumentar ${props.nombre.toLowerCase()}`} disabled={props.masOff} onClick={props.onMas}>
        +
      </button>
    </span>
  )
}
