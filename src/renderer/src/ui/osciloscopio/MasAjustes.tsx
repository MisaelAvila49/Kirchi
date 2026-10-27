import { createSignal, For, Show } from 'solid-js'
import { CANALES, MATEMATICO, MAX_MEDIDAS_VISTA, MEDIDAS, NIVEL_MAX, type AjustesOsciloscopio, type CanalOMatematico, type IdMedida } from '../../instrumentos/ajustes'
import type { PantallaSab } from '../../sim/protocoloInstrumentos'
import { formatearMedida } from '../../valores/valores'
import Bloque from '../exportar/Bloque'
import ControlNumero from './ControlNumero'
import { lecturaCursoresXY } from './xy'
import { lecturaCursores, ponerCursor, vdivDe, type CualCursor } from './cursores'
import type { CursoresPantalla } from './dibujar'
import { alternarMedida, NOMBRE_CORTO } from './medidasVista'
import TablaOsciloscopio from './TablaOsciloscopio'

interface Props {
  refOsc: string
  ajustes: AjustesOsciloscopio
  pantalla: PantallaSab | null
  cursores: CursoresPantalla | null
  onCursores(c: CursoresPantalla | null): void
  onAjuste(prop: string, texto: string, gesto?: string): void
  /** Abre la hoja de aspecto (trazas, ejes, rejilla y textos) sobre la franja. */
  onAspecto?(): void
  /** Se cierra; `volverFoco` devuelve el foco al botón «Más ajustes» (Esc o el botón ×). */
  onCerrar(volverFoco: boolean): void
}

const letra = (c: CanalOMatematico) => (c === MATEMATICO ? 'A − B' : c)

/**
 * «Más ajustes» del osciloscopio: medidas, posición del disparo, resta A − B, instrumento ideal, cursores con teclado y «Ver como tabla». No es modal.
 */
export default function MasAjustes(props: Props) {
  const [tabla, setTabla] = createSignal(false)
  const columnas = (): CanalOMatematico[] => [...CANALES.filter((c) => props.ajustes.canales.find((x) => x.canal === c)?.on), ...(props.ajustes.matematico ? [MATEMATICO as CanalOMatematico] : [])]
  const elegida = (c: CanalOMatematico, m: IdMedida) => props.ajustes.medidas.some((x) => x.canal === c && x.medida === m)
  const llenas = () => props.ajustes.medidas.length >= MAX_MEDIDAS_VISTA
  const moverDe = (cual: CualCursor) => (v: number) => props.cursores && props.onCursores(ponerCursor(props.cursores, cual, v))
  const casilla = (prop: string, nombre: string, marcada: boolean, alCambiar?: (v: boolean) => void) => (
    <label class="osc-fila-ajuste">
      <span>{nombre}</span>
      <input type="checkbox" checked={marcada} onChange={(e) => (alCambiar ? alCambiar(e.currentTarget.checked) : props.onAjuste(prop, e.currentTarget.checked ? 'encendido' : 'apagado'))} />
    </label>
  )
  return (
    <div
      class="osc-mas"
      id="osc-mas-ajustes"
      role="dialog"
      aria-label="Más ajustes del osciloscopio"
      on:keydown={(e: KeyboardEvent) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        props.onCerrar(true)
      }}
    >
      <div class="osc-mas-col">
        <Bloque titulo="Medidas a la vista" resumen={`${props.ajustes.medidas.length} de ${MAX_MEDIDAS_VISTA}`} abierto>
        <table class="osc-tabla-medidas">
          <caption class="solo-lectores">Medidas por canal</caption>
          <thead>
            <tr>
              <th scope="col">Medida</th>
              <For each={columnas()}>
                {(c) => (
                  <th scope="col" data-canal={c}>
                    <span class="osc-letra">{letra(c)}</span>
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={MEDIDAS}>
              {(m) => (
                <tr>
                  <th scope="row">{NOMBRE_CORTO[m]}</th>
                  <For each={columnas()}>
                    {(c) => (
                      <td data-canal={c}>
                        <input
                          type="checkbox"
                          aria-label={`${NOMBRE_CORTO[m]} del canal ${letra(c)}`}
                          checked={elegida(c, m)}
                          disabled={!elegida(c, m) && llenas()}
                          onChange={() => {
                            const t = alternarMedida(props.ajustes.medidas, { canal: c, medida: m })
                            if (t !== null) props.onAjuste('medidas', t)
                          }}
                        />
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <p class="secundario osc-nota-chica">Hasta cuatro a la vista.</p>
        </Bloque>
        <Bloque titulo="Disparo y canales" resumen={props.ajustes.disparoCentro ? 'disparo al centro' : 'disparo al 10 %'} abierto>
        <div class="osc-fila-ajuste">
          <span id="osc-posh">Posición del disparo</span>
          <span class="osc-segmentos" role="group" aria-labelledby="osc-posh">
            <button type="button" aria-pressed={!props.ajustes.disparoCentro} onClick={() => props.onAjuste('posh', '10 %')}>
              10 %
            </button>
            <button type="button" aria-pressed={props.ajustes.disparoCentro} onClick={() => props.onAjuste('posh', 'Centro')}>
              Centro
            </button>
          </span>
        </div>
        {casilla('mat_on', 'Resta A − B', props.ajustes.matematico)}
        {casilla('ideal', 'Instrumento ideal', props.ajustes.ideal)}
        </Bloque>
        <Show when={props.cursores}>
          {(c) => (
            <Bloque titulo="Cursores" resumen={c().xy ? 'puntos de la curva' : `canal ${letra(c().canal)}`} abierto>
              <Show when={c().xy}>
                <p class="osc-cursores cifra" data-canal={c().canal}>
                  <For each={lecturaCursoresXY(c(), props.ajustes)}>{(l) => <span class="osc-cursores-linea">{l}</span>}</For>
                </p>
              </Show>
              <Show when={c().t && c().v}>
              <label class="osc-fila-ajuste" data-canal={c().canal}>
                <span>Canal de los cursores</span>
                <select value={c().canal} onChange={(e) => props.onCursores({ ...c(), canal: e.currentTarget.value as CanalOMatematico })}>
                  <For each={[...CANALES, MATEMATICO] as CanalOMatematico[]}>{(x) => <option value={x}>{letra(x)}</option>}</For>
                </select>
              </label>
              <For each={['t1', 't2'] as const}>
                {(q, i) => (
                  <ControlNumero
                    etiqueta={`Tiempo ${i() + 1}`}
                    valor={c().t![i()]}
                    paso={props.ajustes.base / 10}
                    min={0}
                    max={1e9}
                    texto={(v) => formatearMedida(v, 's', 4)}
                    onCambiar={moverDe(q)}
                  />
                )}
              </For>
              <For each={['v1', 'v2'] as const}>
                {(q, i) => (
                  <ControlNumero
                    etiqueta={`Voltaje ${i() + 1}`}
                    valor={c().v![i()]}
                    paso={vdivDe(props.ajustes, c().canal) / 10}
                    min={-NIVEL_MAX}
                    max={NIVEL_MAX}
                    texto={(v) => formatearMedida(v, 'V', 4)}
                    onCambiar={moverDe(q)}
                  />
                )}
              </For>
              <p class="osc-cursores cifra" data-canal={c().canal}>
                {(() => {
                  const l = lecturaCursores(c())
                  return `Δt ${l.dt}   1/Δt ${l.inv}   ΔV ${l.dv}`
                })()}
              </p>
              </Show>
            </Bloque>
          )}
        </Show>
        <Show when={props.onAspecto}>
          <Bloque titulo="Aspecto de la pantalla" resumen="trazas, ejes, rejilla y textos">
            <div class="osc-fila">
              <button type="button" class="boton" onClick={() => props.onAspecto!()}>
                Abrir el aspecto
              </button>
            </div>
          </Bloque>
        </Show>
        <Bloque titulo="Tabla de valores" resumen={tabla() ? 'a la vista' : 'oculta'}>
        <div class="osc-fila">
          <button type="button" class="boton" aria-expanded={tabla()} disabled={!props.pantalla} onClick={() => setTabla((t) => !t)}>
            {tabla() ? 'Ocultar la tabla' : 'Ver como tabla'}
          </button>
        </div>
        <Show when={tabla() && props.pantalla}>{(p) => <TablaOsciloscopio pantalla={p()} ajustes={props.ajustes} ref={props.refOsc} />}</Show>
        </Bloque>
      </div>
      <button type="button" class="boton-icono osc-mas-cerrar" aria-label="Cerrar más ajustes" onClick={() => props.onCerrar(true)}>
        ×
      </button>
    </div>
  )
}
