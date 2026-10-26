import { Show, type JSX } from 'solid-js'
import type { FormatoFigura } from '../../../../compartido/ajustes'
import Dialogo from '../Dialogo'
import Bloque from './Bloque'
import { CampoFormato } from './campos'
import { NOMBRE_FORMATO_FIGURA } from './modelo'

interface Props {
  titulo: string
  /** En la cabecera, a la derecha del título: los preajustes «Instrumento» e «Informe» (`SelectorEstilo`). */
  estilo?: JSX.Element
  formatos: readonly FormatoFigura[]
  formato: FormatoFigura
  onFormato(f: FormatoFigura): void
  /** La vista previa grande: un lienzo, una imagen o la tabla del principio del CSV, tal como saldrá. */
  vista: JSX.Element
  /** Bajo la vista: el tamaño que tendrá lo que se exporta. */
  pie?: string
  /** Bajo la vista, junto al tamaño: el tramo del eje que se exporta («1.0 ms a 8.0 ms» o «Todo el eje»). */
  tramo?: string
  /** El deslizador de dos asas del tramo, bajo el pie de la vista y también fijo arriba (`RangoDoble`). */
  rango?: JSX.Element
  /** Cómo se llama lo que va en `tramo` («Tramo» para un eje, «Alcance» para el esquema). */
  rotuloTramo?: string
  /** Los bloques de la columna izquierda (Datos y rango, Ejes, Trazas). */
  children?: JSX.Element
  /** Los bloques de la columna derecha, sobre «Formato de archivo» (Rejilla y fondo). */
  derecha?: JSX.Element
  /** Lo que va dentro del bloque «Formato de archivo», bajo los formatos (resolución, letra, hoja). */
  formatoExtra?: JSX.Element
  /** La línea en cifras al pie del bloque «Formato de archivo»: «PNG de 2400 × 1386 px». */
  resumen?: string
  onExportar(): void
  onCerrar(): void
  /** Por qué no se puede exportar ahora (el botón queda deshabilitado y lo dice). */
  motivoNo?: string
  /** Exportando: el botón espera. */
  ocupado?: boolean
}

/**
 * Diálogo de exportar una figura: vista grande arriba, tamaño y tramo debajo, y bloques plegables en dos columnas. Quien lo usa pone su `vista` y sus grupos de opciones.
 */
export default function DialogoFigura(props: Props) {
  return (
    <Dialogo titulo={props.titulo} clase="exportar-vista" onCerrar={props.onCerrar} cabeza={props.estilo}>
      <div class="exportar-cuerpo">
        <div class="exportar-vista-previa">
          <div class="vista-caja" role="group" aria-label="Vista previa de lo que se exporta">
            {props.vista}
          </div>
          <Show when={props.pie || props.tramo}>
            <p class="secundario nota-dialogo vista-pie cifra" aria-live="polite">
              <Show when={props.pie}>
                <span>
                  <span class="vista-pie-rotulo">Tamaño</span> <b>{props.pie}</b>
                </span>
              </Show>
              <Show when={props.tramo}>
                <span>
                  <span class="vista-pie-rotulo">{props.rotuloTramo ?? 'Tramo'}</span> <b>{props.tramo}</b>
                </span>
              </Show>
            </p>
          </Show>
          {props.rango}
        </div>
        <div class="exportar-bloques">
          <div class="exportar-col">{props.children}</div>
          <div class="exportar-col">
            {props.derecha}
            <Bloque titulo="Formato de archivo" resumen={NOMBRE_FORMATO_FIGURA[props.formato]} abierto>
              <CampoFormato formatos={props.formatos} formato={props.formato} onFormato={props.onFormato} />
              {props.formatoExtra}
              <Show when={props.resumen}>
                <p class="resumen-archivo cifra" aria-live="polite">
                  {props.resumen}
                </p>
              </Show>
            </Bloque>
          </div>
        </div>
      </div>
      <Show when={props.motivoNo}>
        <p class="secundario nota-dialogo" role="status">
          {props.motivoNo}
        </p>
      </Show>
      <div class="dialogo-botones">
        <button type="button" class="boton" onClick={() => props.onCerrar()}>
          Cancelar
        </button>
        <button type="button" class="boton principal" disabled={!!props.motivoNo || props.ocupado} onClick={() => props.onExportar()}>
          {props.ocupado ? 'Exportando…' : 'Exportar…'}
        </button>
      </div>
    </Dialogo>
  )
}
