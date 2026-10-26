import { For } from 'solid-js'
import type { AjustesSimulacion } from '../../../compartido/ajustes'

/** Los pasos de «Velocidad de las flechas». */
export const PASOS_FLECHAS = [0.25, 0.5, 1, 2, 4] as const

interface Props {
  simulacion: AjustesSimulacion
  onCambiar(parche: Partial<AjustesSimulacion>): void
}

/** Configuración › Simulación: velocidad de las flechas, volumen con silencio aparte y «Las piezas se queman». */
export default function SeccionSimulacion(props: Props) {
  const s = () => props.simulacion
  return (
    <fieldset class="opciones">
      <legend>Simulación</legend>
      <p id="nota-flechas" class="secundario nota-dialogo">
        Multiplica la velocidad de las flechas de la corriente.
      </p>
      <div class="opciones-fila" role="radiogroup" aria-label="Velocidad de las flechas" aria-describedby="nota-flechas">
        <For each={PASOS_FLECHAS}>
          {(f) => (
            <label class="opcion">
              <input type="radio" name="velocidad-flechas" value={String(f)} checked={s().velocidadFlechas === f} onChange={() => props.onCambiar({ velocidadFlechas: f })} />
              <span class="cifra">{f}×</span>
            </label>
          )}
        </For>
      </div>
      <label class="opcion">
        <input type="checkbox" checked={s().sonido} onChange={(e) => props.onCambiar({ sonido: e.currentTarget.checked })} />
        Sonido (M)
      </label>
      <label class="fld fld-campo">
        <span>Volumen</span>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={s().volumen}
          aria-valuetext={`${s().volumen} %`}
          disabled={!s().sonido}
          onInput={(e) => props.onCambiar({ volumen: Number(e.currentTarget.value) })}
        />
      </label>
      <label class="opcion">
        <input type="checkbox" checked={s().quemar} aria-describedby="nota-quemar" onChange={(e) => props.onCambiar({ quemar: e.currentTarget.checked })} />
        Las piezas se queman
      </label>
      <p id="nota-quemar" class="secundario nota-dialogo">
        Encendida, una pieza que pasa del doble de lo que admite durante medio segundo queda abierta hasta hacer clic sobre ella. El fusible y el foco se funden siempre.
      </p>
      <p class="secundario nota-dialogo">
        Las animaciones empiezan en pausa si el sistema pide reducir el movimiento.
      </p>
    </fieldset>
  )
}
