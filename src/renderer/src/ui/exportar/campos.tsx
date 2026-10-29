import { For, Show } from 'solid-js'
import { ESCALAS_PNG, FAMILIAS_FIGURA, MUESTREOS_CSV, SEPARADORES_CSV, type MuestreoCsv, type SeparadorCsv, TAMAÑO_LETRA_FIGURA, type FormatoFigura, type OpcionesFigura } from '../../../../compartido/ajustes'

import { NOMBRE_MUESTREO, NOMBRE_SEPARADOR } from './csvFormato'
import type { Adornos } from './preajustes'
import { AYUDA_FORMATO, NOMBRE_FAMILIA_FIGURA, NOMBRE_FORMATO_FIGURA, SUB_FORMATO, visiblesDe, type SerieFigura } from './modelo'

/**
 * Controles de exportar una figura de datos, comunes al osciloscopio y a las gráficas. Cada figura dice sus series (`series`) y opciones (`visibles`).
 */

interface PropsFormato {
  formatos: readonly FormatoFigura[]
  formato: FormatoFigura
  onFormato(f: FormatoFigura): void
}

/** «Formato»: un solo grupo de radios con aspecto de casillas (flechas para cambiar), con el nombre y su palabra, y la ayuda del elegido debajo. */
export function CampoFormato(props: PropsFormato) {
  return (
    <fieldset class="opciones campo-formato" aria-label="Formato">
      <div class="formatos-figura formatos-casillas">
        <For each={props.formatos}>
          {(f) => (
            <label class="casilla-formato" classList={{ elegida: props.formato === f }}>
              <input type="radio" name="formato-figura" checked={props.formato === f} data-autofoco={props.formato === f ? '' : undefined} onChange={() => props.onFormato(f)} />
              <b>{NOMBRE_FORMATO_FIGURA[f]}</b>
              <small>{SUB_FORMATO[f]}</small>
            </label>
          )}
        </For>
      </div>
      <p class="secundario nota-dialogo" aria-live="polite">
        {AYUDA_FORMATO[props.formato]}
      </p>
    </fieldset>
  )
}

interface PropsOpciones {
  op: OpcionesFigura
  formato: FormatoFigura
  onCambiar(parche: Partial<OpcionesFigura>): void
  series: readonly SerieFigura[]
  /** La rejilla se elige en el aspecto de la gráfica: aquí no se repite. */
  sinRejilla?: boolean
  /** La letra va aparte (exportar la pone en su sitio del panel). */
  sinLetra?: boolean
}

/** Resolución (PNG) y letra: van dentro del bloque «Formato de archivo». */
export function CamposDeArchivo(props: PropsOpciones) {
  const v = () => visiblesDe(props.formato)
  return (
    <>
      <Show when={v().escala}>
        <fieldset class="opciones">
          <legend>Resolución</legend>
          <div class="formatos-figura">
            <For each={ESCALAS_PNG}>
              {(s) => (
                <label class="chip-opcion" classList={{ elegida: props.op.escala === s }}>
                  <input type="radio" name="escala-figura" checked={props.op.escala === s} onChange={() => props.onCambiar({ escala: s })} />
                  {s}×
                </label>
              )}
            </For>
          </div>
          <p class="secundario nota-dialogo">{96 * props.op.escala} ppp: cada px de la vista son {props.op.escala} del archivo.</p>
        </fieldset>
      </Show>
      <Show when={props.formato === 'csv'}>
        <fieldset class="opciones">
          <legend>Tabla</legend>
          <label class="campo-figura">
            <span>Separador</span>
            <select value={props.op.separadorCsv} onChange={(e) => props.onCambiar({ separadorCsv: e.currentTarget.value as SeparadorCsv })}>
              <For each={SEPARADORES_CSV}>{(s) => <option value={s}>{NOMBRE_SEPARADOR[s]}</option>}</For>
            </select>
          </label>
          <label class="campo-figura">
            <span>Muestras</span>
            <select value={String(props.op.muestreoCsv)} onChange={(e) => props.onCambiar({ muestreoCsv: Number(e.currentTarget.value) as MuestreoCsv })}>
              <For each={MUESTREOS_CSV}>{(m) => <option value={String(m)}>{NOMBRE_MUESTREO[m]}</option>}</For>
            </select>
          </label>
        </fieldset>
      </Show>
      <Show when={v().letra && !props.sinLetra}>
        <CamposDeLetra {...props} />
      </Show>
    </>
  )
}

/** La familia y el tamaño general de la letra de la figura. */
export function CamposDeLetra(props: PropsOpciones) {
  return (
    <>
      <Show when={visiblesDe(props.formato).letra}>
        <fieldset class="opciones">
          <legend>Letra</legend>
          <label class="campo-figura">
            <span>Familia</span>
            <select value={props.op.fuente} onChange={(e) => props.onCambiar({ fuente: e.currentTarget.value as OpcionesFigura['fuente'] })}>
              <For each={FAMILIAS_FIGURA}>{(f) => <option value={f}>{NOMBRE_FAMILIA_FIGURA[f]}</option>}</For>
            </select>
          </label>
          <label class="campo-figura" title="Cambia juntos el título y los números de los ejes. Cada texto también tiene su tamaño propio al seleccionarlo.">
            <span>Tamaño del texto</span>
            <input
              type="range"
              min={TAMAÑO_LETRA_FIGURA[0]}
              max={TAMAÑO_LETRA_FIGURA[1]}
              step="1"
              value={props.op.tamañoLetra}
              aria-valuetext={`${props.op.tamañoLetra} px`}
              onInput={(e) => props.onCambiar({ tamañoLetra: Number(e.currentTarget.value) })}
            />
            <output class="cifra">{props.op.tamañoLetra} px</output>
          </label>
        </fieldset>
      </Show>
    </>
  )
}

/**
 * Qué lleva la figura: ejes con escalas y, sin rejilla propia, la rejilla. El fondo lo da el «Tema de la gráfica».
 */
export function CamposDeFondo(props: PropsOpciones) {
  const v = () => visiblesDe(props.formato)
  return (
    <>
      <Show when={v().ejes || (v().rejilla && !props.sinRejilla)}>
        <fieldset class="opciones">
          <legend>Mostrar</legend>
          <Show when={v().ejes}>
            <label class="opcion">
              <input type="checkbox" checked={props.op.ejes} onChange={(e) => props.onCambiar({ ejes: e.currentTarget.checked })} />
              Ejes con sus escalas
            </label>
          </Show>
          <Show when={v().rejilla && !props.sinRejilla}>
            <label class="opcion">
              <input type="checkbox" checked={props.op.rejilla} onChange={(e) => props.onCambiar({ rejilla: e.currentTarget.checked })} />
              Rejilla
            </label>
          </Show>
        </fieldset>
      </Show>
    </>
  )
}

/** Un dato que se puede exportar (un canal del osciloscopio o una traza de una gráfica) y si se exporta. */
export interface DatoExportable {
  id: string
  /** «Canal A», «Sin carga». */
  nombre: string
  /** Letra del canal para el tono (`data-canal`): solo el osciloscopio. */
  canal?: string
  /** El tono de la traza (`data-tono-figura`): solo las gráficas de análisis. */
  tono?: string
  activo: boolean
  /** No hay con qué llenarlo (un canal apagado en la pantalla): se ve con borde punteado y no se puede encender. */
  sinDato?: boolean
}

/** «Qué se exporta»: casillas de canales o trazas. La última encendida no se apaga (sin datos no hay figura). */
export function ChipsDatos(props: { rotulo: string; datos: readonly DatoExportable[]; onAlternar(id: string): void }) {
  const encendidos = () => props.datos.filter((d) => d.activo && !d.sinDato).length
  return (
    <fieldset class="chips-datos" aria-label={props.rotulo}>
      <For each={props.datos}>
        {(d) => (
          <label class="chip-dato" classList={{ elegida: d.activo && !d.sinDato, 'sin-sonda': !!d.sinDato }} data-canal={d.canal} data-tono-figura={d.tono}>
            <input
              type="checkbox"
              checked={d.activo && !d.sinDato}
              disabled={d.sinDato}
              aria-disabled={d.sinDato || (d.activo && encendidos() <= 1) ? 'true' : undefined}
              onChange={(e) => {
                if (d.activo && encendidos() <= 1) {
                  e.currentTarget.checked = true
                  return
                }
                props.onAlternar(d.id)
              }}
            />
            {d.canal ? <span class="chip-letra">{d.canal === 'M' ? 'A − B' : d.canal}</span> : null}
            <Show when={!d.canal || d.sinDato}>
              <span>{d.canal ? 'sin sonda' : d.nombre}</span>
            </Show>
          </label>
        )}
      </For>
    </fieldset>
  )
}

/** «Adornos»: lo que lleva la figura alrededor del dibujo. Cambiar uno deja el estilo «a medida». */
export function CamposDeAdornos(props: { adornos: Adornos; onCambiar(parche: Partial<Adornos>): void }) {
  const filas: readonly (readonly [keyof Adornos, string])[] = [
    ['titulo', 'Título y subtítulo'],
    ['leyenda', 'Leyenda arriba'],
    ['marco', 'Marco doble y franja de escalas'],
    ['resplandor', 'Resplandor de fósforo en las líneas']
  ]
  return (
    <fieldset class="opciones">
      <legend>Adornos</legend>
      <For each={filas}>
        {([k, texto]) => (
          <label class="opcion">
            <input type="checkbox" checked={props.adornos[k]} onChange={(e) => props.onCambiar({ [k]: e.currentTarget.checked })} />
            {texto}
          </label>
        )}
      </For>
    </fieldset>
  )
}
