import { createSignal, For, Match, Show, Switch } from 'solid-js'
import { COLORES_DE_CABLE, SERIES_COMERCIALES, TEMAS, type Ajustes, type ColorCables } from '../../../compartido/ajustes'
import type { ApiGrabacion } from '../../../compartido/grabacion'
import type { Atajos } from '../editor/teclado'
import { nombreDeCarpeta } from '../grabacion/textos'
import { TAMAÑOS_INTERFAZ } from '../../../compartido/ventana'
import { COLOR_CABLE } from '../lienzo/paleta'
import SeccionAtajos from './SeccionAtajos'
import PistaGlobo from './PistaGlobo'
import SeccionAsistente, { type PropsAsistente } from './SeccionAsistente'
import SeccionSimulacion from './SeccionSimulacion'
import Dialogo from './Dialogo'
import { siguientePestaña } from './cinta/navegacion'
import { panelDeConfig, pestañaInicial, pestañasVisibles, type PestañaConfig } from './pestañasConfig'
import { NOMBRE_TEMA } from './tema'
import { NOMBRE_SERIE } from './textosSerie'

// El nombre del tema vive en ui/tema.ts (lo usan también los módulos de la cinta); se reexporta para quien ya lo importa de aquí.
export { NOMBRE_TEMA }
export const NOMBRE_CABLE: Record<ColorCables, string> = { verde: 'Verde azulado', tinta: 'Negro', azul: 'Azul' }

interface Props {
  ajustes: Ajustes
  onCambiar(parche: Partial<Ajustes>): void
  onCerrar(): void
  /** Abre la carpeta de respaldos en el explorador; sin él (sin proceso principal) no se muestra. */
  onRespaldos?: () => void
  /** El registro de atajos de la ventana; sin él no se muestra la sección Atajos. */
  atajos?: Atajos
  onAtajos?: () => void
  /** Versión del registro de atajos de la ventana, para que la sección no quede vieja. */
  versionAtajos?: () => number
  /** Abre con el foco en Atajos (desde la hoja de atajos). */
  seccion?: PestañaConfig
  /** El asistente. Sin él no se muestra la pestaña Asistente. */
  asistente?: PropsAsistente
  /** La carpeta de las grabaciones; sin él (sin proceso principal) la fila no se muestra. */
  grabacion?: Pick<ApiGrabacion, 'cambiarCarpeta' | 'restablecerCarpeta'>
}

/**
 * Diálogo de Configuración con pestañas. Cada cambio se guarda al momento (el del lienzo se aplica al reabrir). Pestañas según WAI-ARIA: flechas, Inicio y Fin, y solo la elegida entra con Tab.
 */
export default function Configuracion(props: Props) {
  const pestañas = () => pestañasVisibles(!!props.atajos, !!props.asistente)
  const [activa, setActiva] = createSignal<PestañaConfig>(pestañaInicial(props.seccion, !!props.atajos, !!props.asistente))
  let lista!: HTMLDivElement
  // La carpeta de grabaciones la guarda el proceso principal: aquí se muestra la de ahora y se actualiza al cambiarla.
  const [carpeta, setCarpeta] = createSignal<string | undefined>(props.ajustes.carpetaGrabaciones)
  const [errorCarpeta, setErrorCarpeta] = createSignal('')
  const cambiarCarpeta = async () => {
    setErrorCarpeta('')
    try {
      const nueva = await props.grabacion?.cambiarCarpeta()
      if (nueva) setCarpeta(nueva)
    } catch (e) {
      setErrorCarpeta(e instanceof Error && e.message ? e.message : 'No se pudo cambiar la carpeta.')
    }
  }
  const restablecerCarpeta = async () => {
    setErrorCarpeta('')
    try {
      await props.grabacion?.restablecerCarpeta()
      setCarpeta(undefined)
    } catch (e) {
      setErrorCarpeta(e instanceof Error && e.message ? e.message : 'No se pudo restablecer la carpeta.')
    }
  }
  const tecla = (e: KeyboardEvent) => {
    const t = [...lista.querySelectorAll<HTMLElement>('[role="tab"]')]
    const i = t.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    const j = siguientePestaña(t.length, i, e.key)
    if (j === null) return
    e.preventDefault()
    // Activación automática: llegar a una pestaña la elige.
    setActiva(pestañas()[j].id)
    t[j].focus()
  }
  return (
    <Dialogo titulo="Configuración" clase="configuracion" onCerrar={props.onCerrar}>
      <div ref={lista} role="tablist" aria-label="Secciones de Configuración" class="pestañas-config" onKeyDown={tecla}>
        <For each={pestañas()}>
          {(p) => (
            <button
              type="button"
              role="tab"
              id={`config-tab-${p.id}`}
              aria-controls={panelDeConfig(p.id, activa())}
              aria-selected={p.id === activa()}
              tabIndex={p.id === activa() ? 0 : -1}
              data-autofoco={p.id === activa() && props.seccion !== 'atajos' ? '' : undefined}
              onClick={() => setActiva(p.id)}
            >
              {p.nombre}
            </button>
          )}
        </For>
      </div>
      <div role="tabpanel" id={`config-panel-${activa()}`} tabIndex={0} aria-labelledby={`config-tab-${activa()}`} class="panel-config">
        <Switch>
          <Match when={activa() === 'general'}>
            <fieldset class="grupo">
              <legend>Archivos</legend>
              <p class="pista">
                Cada diálogo recuerda su última carpeta.
                <PistaGlobo
                  id="pista-archivos"
                  texto="Abrir, Guardar como y Exportar vuelven a la última carpeta que usó cada uno. Al guardar encima de un circuito se conservan sus tres versiones anteriores en la carpeta de respaldos."
                />
              </p>
              <Show when={props.onRespaldos}>
                {(abrir) => (
                  <div class="fila">
                    <button type="button" class="boton" onClick={() => abrir()()}>
                      Abrir la carpeta de respaldos
                    </button>
                  </div>
                )}
              </Show>
            </fieldset>
            <Show when={props.grabacion}>
              <fieldset class="grupo">
                <legend>Grabaciones</legend>
                <div class="fila fila-carpeta-grabaciones">
                  <span>Carpeta de grabaciones</span>
                  <span class="carpeta cifra" id="carpeta-grabaciones" title={carpeta()}>
                    {nombreDeCarpeta(carpeta())}
                  </span>
                  <button type="button" class="boton" onClick={() => void cambiarCarpeta()}>
                    Cambiar…
                  </button>
                  <button type="button" class="boton" disabled={!carpeta()} onClick={() => void restablecerCarpeta()}>
                    Restablecer
                  </button>
                </div>
                <Show when={errorCarpeta()}>
                  <p class="secundario nota-dialogo" role="alert">
                    {errorCarpeta()}
                  </p>
                </Show>
              </fieldset>
            </Show>
            <fieldset class="grupo">
              <legend>Valores comerciales</legend>
              <p class="pista">
                La serie que ofrece el editor al escribir un valor.
                <PistaGlobo id="pista-serie" texto="Un valor fuera de la serie se avisa, nunca se bloquea." />
              </p>
              <div class="fila">
                <For each={SERIES_COMERCIALES}>
                  {(s) => (
                    <label class="opcion">
                      <input type="radio" name="serie-comercial" value={s} checked={props.ajustes.serieComercial === s} aria-describedby="pista-serie" onChange={() => props.onCambiar({ serieComercial: s })} />
                      {NOMBRE_SERIE[s]}
                    </label>
                  )}
                </For>
              </div>
            </fieldset>
            <fieldset class="grupo">
              <legend>Tutorial</legend>
              <div class="fila">
                <label class="opcion">
                  <input
                    type="checkbox"
                    checked={props.ajustes.tutorial.avanzarSolo}
                    aria-describedby="pista-avanzar-solo"
                    onChange={(e) => props.onCambiar({ tutorial: { ...props.ajustes.tutorial, avanzarSolo: e.currentTarget.checked } })}
                  />
                  Avanzar solo en el tutorial
                </label>
                <PistaGlobo
                  id="pista-avanzar-solo"
                  texto="Un paso cumplido pasa al siguiente a los 2.5 segundos. Se detiene mientras el ratón o el foco están en el globo. Apagado, se avanza con Siguiente."
                />
              </div>
            </fieldset>
          </Match>
          <Match when={activa() === 'apariencia'}>
            <fieldset class="grupo">
              <legend>Tema</legend>
              <div class="fila">
                <For each={TEMAS}>
                  {(t) => (
                    <label class="opcion">
                      <input type="radio" name="tema" value={t} checked={props.ajustes.tema === t} onChange={() => props.onCambiar({ tema: t })} />
                      {NOMBRE_TEMA[t]}
                    </label>
                  )}
                </For>
              </div>
            </fieldset>
            <fieldset class="grupo">
              <legend>Color de cables al editar</legend>
              <div class="fila">
                <For each={COLORES_DE_CABLE}>
                  {(c) => (
                    <label class="opcion">
                      <input type="radio" name="cables" value={c} checked={props.ajustes.colorCables === c} onChange={() => props.onCambiar({ colorCables: c })} />
                      <span class="muestra" style={{ background: COLOR_CABLE[c][props.ajustes.tema] }} aria-hidden="true" />
                      {NOMBRE_CABLE[c]}
                    </label>
                  )}
                </For>
              </div>
            </fieldset>
            <fieldset class="grupo">
              <legend>Tamaño de la interfaz</legend>
              <p id="nota-tamaño-interfaz" class="pista">
                Ahora: <span class="cifra">{props.ajustes.tamañoInterfaz} %</span>. Es el zoom de Ctrl++, Ctrl+- y Ctrl+0.
              </p>
              <div class="fila">
                <For each={TAMAÑOS_INTERFAZ}>
                  {(t) => (
                    <label class="opcion">
                      <input
                        type="radio"
                        name="tamaño-interfaz"
                        value={String(t)}
                        checked={props.ajustes.tamañoInterfaz === t}
                        aria-describedby="nota-tamaño-interfaz"
                        onChange={() => props.onCambiar({ tamañoInterfaz: t })}
                      />
                      <span class="cifra">{t} %</span>
                    </label>
                  )}
                </For>
              </div>
            </fieldset>
          </Match>
          <Match when={activa() === 'simulacion'}>
            <SeccionSimulacion
              simulacion={props.ajustes.simulacion}
              onCambiar={(p) => props.onCambiar({ simulacion: { ...props.ajustes.simulacion, ...p } })}
              lienzoSincronizado={props.ajustes.lienzoSincronizado}
              onLienzoSincronizado={(v) => props.onCambiar({ lienzoSincronizado: v })}
            />
          </Match>
          <Match when={activa() === 'asistente' && props.asistente}>{(a) => <SeccionAsistente {...a()} />}</Match>
          <Match when={activa() === 'atajos' && props.atajos}>
            {(a) => <SeccionAtajos atajos={a()} version={props.versionAtajos} onCambio={() => props.onAtajos?.()} autofoco={props.seccion === 'atajos'} />}
          </Match>
        </Switch>
      </div>
      <p class="secundario nota-dialogo">Los cambios se guardan solos.</p>
    </Dialogo>
  )
}
