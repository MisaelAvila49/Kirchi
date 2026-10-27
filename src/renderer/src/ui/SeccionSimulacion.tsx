import { For, Show } from 'solid-js'
import type { AjustesSimulacion } from '../../../compartido/ajustes'
import PistaGlobo from './PistaGlobo'

/** Los pasos de «Velocidad de las flechas». */
export const PASOS_FLECHAS = [0.25, 0.5, 1, 2, 4] as const

interface Props {
  simulacion: AjustesSimulacion
  onCambiar(parche: Partial<AjustesSimulacion>): void
  /** «Dibujo del lienzo sincronizado» (antes en General); sin el cambio el grupo Rendimiento no se muestra. */
  lienzoSincronizado?: boolean
  onLienzoSincronizado?: (v: boolean) => void
}

/** Configuración › Simulación: flechas de corriente, sonido con volumen, piezas que se queman y rendimiento del lienzo. */
export default function SeccionSimulacion(props: Props) {
  const s = () => props.simulacion
  return (
    <>
      <fieldset class="grupo">
        <legend>Flechas de corriente</legend>
        <div class="fila" role="radiogroup" aria-label="Velocidad de las flechas" aria-describedby="pista-flechas">
          <span>Velocidad</span>
          <PistaGlobo id="pista-flechas" texto="Multiplica la velocidad de las flechas de la corriente. Si el sistema pide reducir el movimiento, las animaciones empiezan en pausa." />
          <For each={PASOS_FLECHAS}>
            {(f) => (
              <label class="opcion">
                <input type="radio" name="velocidad-flechas" value={String(f)} checked={s().velocidadFlechas === f} onChange={() => props.onCambiar({ velocidadFlechas: f })} />
                <span class="cifra">{f}×</span>
              </label>
            )}
          </For>
        </div>
      </fieldset>
      <fieldset class="grupo">
        <legend>Sonido</legend>
        <div class="fila">
          <label class="opcion">
            <input type="checkbox" checked={s().sonido} onChange={(e) => props.onCambiar({ sonido: e.currentTarget.checked })} />
            Sonido (M)
          </label>
        </div>
        <label class="fila fld-campo">
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
          <span class="cifra">{s().volumen} %</span>
        </label>
      </fieldset>
      <fieldset class="grupo">
        <legend>Piezas</legend>
        <div class="fila">
          <label class="opcion">
            <input type="checkbox" checked={s().quemar} aria-describedby="pista-quemar" onChange={(e) => props.onCambiar({ quemar: e.currentTarget.checked })} />
            Las piezas se queman
          </label>
          <PistaGlobo
            id="pista-quemar"
            texto="Encendido, una pieza que pasa del doble de lo que admite durante medio segundo queda abierta hasta hacer clic sobre ella. El fusible y el foco se funden siempre."
          />
        </div>
      </fieldset>
      <Show when={props.onLienzoSincronizado}>
        {(cambiar) => (
          <fieldset class="grupo">
            <legend>Rendimiento</legend>
            <div class="fila">
              <label class="opcion">
                <input type="checkbox" checked={!!props.lienzoSincronizado} aria-describedby="pista-lienzo" onChange={(e) => cambiar()(e.currentTarget.checked)} />
                Dibujo del lienzo sincronizado
              </label>
              <PistaGlobo id="pista-lienzo" texto="Encendido, el lienzo no parpadea al abrir o cerrar paneles. Apagado ocupa menos memoria de video. Se aplica al reabrir Kirchi." />
            </div>
          </fieldset>
        )}
      </Show>
    </>
  )
}
