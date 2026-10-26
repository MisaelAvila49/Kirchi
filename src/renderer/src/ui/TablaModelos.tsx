import { For } from 'solid-js'
import type { TablaModelos } from '../piezas/columnasModelo'

interface Props {
  tabla: TablaModelos
  /** El modelo elegido. */
  valor: string
  /** Lo que es la lista («Modelo»), para el lector de pantalla. */
  nombre: string
  desactivado?: boolean
  onElegir(modelo: string): void
}

/**
 * Tabla de modelos: un renglón-botón por modelo con las cifras de su hoja de datos. Comparte inspector y doble clic.
 */
export default function TablaDeModelos(props: Props) {
  return (
    <div class="tabla-modelos" role="group" aria-label={props.nombre}>
      <div class="tabla-modelos-cabeza" aria-hidden="true">
        <span>Modelo</span>
        <For each={props.tabla.columnas}>{(c) => <span>{c}</span>}</For>
      </div>
      <For each={props.tabla.filas}>
        {(f) => (
          <button
            type="button"
            class="tabla-modelos-fila" data-eleccion=""
            aria-pressed={f.modelo === props.valor}
            disabled={props.desactivado}
            onClick={() => props.onElegir(f.modelo)}
          >
            <span class="cifra">{f.modelo}</span>
            {/* El nombre de la columna va solo para lectores, antes de su cifra: «2N2222 Bf 256 Ic máx 600 mA». */}
            <For each={f.celdas}>
              {(c, i) => (
                <span class="cifra">
                  <span class="solo-lectores">{props.tabla.columnas[i()]} </span>
                  {c}
                </span>
              )}
            </For>
          </button>
        )}
      </For>
    </div>
  )
}
