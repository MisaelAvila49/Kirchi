import { createSignal, For, Match, Show, Switch } from 'solid-js'
import { COLORES_DE_CABLE, SERIES_COMERCIALES, TEMAS, TEXTOS_AJUSTE, type Ajustes, type ColorCables } from '../../../compartido/ajustes'
import type { ApiGrabacion } from '../../../compartido/grabacion'
import type { Atajos } from '../editor/teclado'
import { nombreDeCarpeta } from '../grabacion/textos'
import { TAMAÑOS_INTERFAZ } from '../../../compartido/ventana'
import { COLOR_CABLE } from '../lienzo/paleta'
import SeccionAtajos from './SeccionAtajos'
import SeccionAsistente, { type PropsAsistente } from './SeccionAsistente'
import SeccionSimulacion from './SeccionSimulacion'
import Dialogo from './Dialogo'
import { FilaCarpeta, FilaConfig, GrupoConfig, Interruptor, Segmentado } from './ControlesConfig'
import { siguientePestaña } from './cinta/navegacion'
import { panelDeConfig, pestañaInicial, pestañasVisibles, type PestañaConfig } from './pestañasConfig'
import { NOMBRE_TEMA } from './tema'
import { NOMBRE_SERIE } from './textosSerie'

const NOMBRE_TEXTO_AJUSTE: Record<(typeof TEXTOS_AJUSTE)[number], string> = { Ajuste: 'Ajuste (30 %)', Valores: 'Valores (3 kΩ)', Ambos: 'Ambos', Nada: 'Nada' }
/** En Configuración «libre» dice lo que hace: no hay serie. En la calculadora y en la ficha de serie sigue siendo «Libre». */
const NOMBRE_SERIE_CONFIG = { ...NOMBRE_SERIE, libre: 'Sin serie' }

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
 * Diálogo de Configuración: pestañas en una columna a la izquierda y una tarjeta por grupo. Cada cambio se guarda al momento (el del lienzo se aplica al reabrir).
 * Pestañas según WAI-ARIA (vertical): flechas arriba y abajo, Inicio y Fin, y solo la elegida entra con Tab.
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
    // La columna es vertical: arriba y abajo recorren las pestañas (izquierda y derecha también, por costumbre).
    const j = siguientePestaña(t.length, i, e.key === 'ArrowDown' ? 'ArrowRight' : e.key === 'ArrowUp' ? 'ArrowLeft' : e.key)
    if (j === null) return
    e.preventDefault()
    // Activación automática: llegar a una pestaña la elige.
    setActiva(pestañas()[j].id)
    t[j].focus()
  }
  return (
    <Dialogo titulo="Configuración" clase="configuracion" onCerrar={props.onCerrar}>
      <div class="cfg-cuerpo">
        <div ref={lista} role="tablist" aria-label="Secciones de Configuración" aria-orientation="vertical" class="pestañas-config" onKeyDown={tecla}>
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
          <h3 class="cfg-ph">{pestañas().find((p) => p.id === activa())?.nombre}</h3>
          <Switch>
            <Match when={activa() === 'general'}>
              <GrupoConfig titulo="Archivos y grabaciones">
                <FilaConfig id="cfg-ultima-carpeta" nombre="Última carpeta de cada diálogo" cap="Abrir, Guardar como y Exportar vuelven a la que usó cada uno." />
                <Show when={props.onRespaldos}>
                  {(abrir) => (
                    <FilaConfig id="cfg-respaldos" nombre="Respaldos" cap="Al guardar encima se conservan las tres versiones anteriores.">
                      <button type="button" class="boton" onClick={() => abrir()()}>
                        Abrir la carpeta de respaldos
                      </button>
                    </FilaConfig>
                  )}
                </Show>
                <Show when={props.grabacion}>
                  <FilaCarpeta
                    id="cfg-carpeta-grabaciones"
                    nombre="Carpeta de grabaciones"
                    idCarpeta="carpeta-grabaciones"
                    carpeta={nombreDeCarpeta(carpeta())}
                    ruta={carpeta()}
                    personalizada={!!carpeta()}
                    onCambiar={() => void cambiarCarpeta()}
                    onRestablecer={() => void restablecerCarpeta()}
                  />
                  <Show when={errorCarpeta()}>
                    <p class="secundario nota-dialogo" role="alert">
                      {errorCarpeta()}
                    </p>
                  </Show>
                </Show>
              </GrupoConfig>
              <GrupoConfig titulo="Edición">
                <FilaConfig
                  id="cfg-serie"
                  nombre="Serie de valores al escribir"
                  cap="La serie que ofrece el editor al escribir un valor."
                  pista={{ id: 'pista-serie', texto: 'Un valor fuera de la serie se avisa, nunca se bloquea. Sin serie acepta cualquier valor sin avisar.' }}
                  apila
                >
                  <Segmentado
                    nombre="serie-comercial"
                    etiqueta="cfg-serie"
                    describedby="pista-serie"
                    opciones={SERIES_COMERCIALES.map((s) => ({ valor: s, texto: NOMBRE_SERIE_CONFIG[s] }))}
                    valor={props.ajustes.serieComercial}
                    onCambiar={(s) => props.onCambiar({ serieComercial: s })}
                  />
                </FilaConfig>
                <FilaConfig
                  id="cfg-texto-ajuste"
                  nombre="Texto de las piezas ajustables"
                  cap="El recuadro junto a potenciómetros, termistores y sensores."
                  pista={{
                    id: 'pista-texto-ajuste',
                    texto: 'Ajuste dice la posición de la perilla, como 30 % o 25 °C. Valores dice la resistencia, como 3 kΩ | 7 kΩ en un potenciómetro. Cada pieza puede pedir otra cosa en su opción Mostrar.'
                  }}
                  apila
                >
                  <Segmentado
                    nombre="texto-ajuste"
                    etiqueta="cfg-texto-ajuste"
                    describedby="pista-texto-ajuste"
                    opciones={TEXTOS_AJUSTE.map((t) => ({ valor: t, texto: NOMBRE_TEXTO_AJUSTE[t] }))}
                    valor={props.ajustes.textoAjuste}
                    onCambiar={(t) => props.onCambiar({ textoAjuste: t })}
                  />
                </FilaConfig>
              </GrupoConfig>
              <GrupoConfig titulo="Tutorial">
                <FilaConfig
                  id="cfg-avanzar-solo"
                  nombre="Avanzar solo en el tutorial"
                  pista={{ id: 'pista-avanzar-solo', texto: 'Un paso cumplido pasa al siguiente a los 2.5 segundos. Se detiene mientras el ratón o el foco están en el globo. Apagado, se avanza con Siguiente.' }}
                >
                  <Interruptor
                    etiqueta="cfg-avanzar-solo"
                    describedby="pista-avanzar-solo"
                    activo={props.ajustes.tutorial.avanzarSolo}
                    onCambiar={(v) => props.onCambiar({ tutorial: { ...props.ajustes.tutorial, avanzarSolo: v } })}
                  />
                </FilaConfig>
              </GrupoConfig>
            </Match>
            <Match when={activa() === 'apariencia'}>
              <GrupoConfig titulo="Tema y color">
                <FilaConfig id="cfg-tema" nombre="Tema">
                  <Segmentado nombre="tema" etiqueta="cfg-tema" opciones={TEMAS.map((t) => ({ valor: t, texto: NOMBRE_TEMA[t] }))} valor={props.ajustes.tema} onCambiar={(t) => props.onCambiar({ tema: t })} />
                </FilaConfig>
                <FilaConfig id="cfg-cables" nombre="Color de cables al editar" apila>
                  <Segmentado
                    nombre="cables"
                    etiqueta="cfg-cables"
                    opciones={COLORES_DE_CABLE.map((c) => ({ valor: c, texto: NOMBRE_CABLE[c], muestra: COLOR_CABLE[c][props.ajustes.tema] }))}
                    valor={props.ajustes.colorCables}
                    onCambiar={(c) => props.onCambiar({ colorCables: c })}
                  />
                </FilaConfig>
              </GrupoConfig>
              <GrupoConfig titulo="Tamaño">
                <FilaConfig id="cfg-tamaño" nombre="Tamaño de la interfaz" cap="Es el zoom de Ctrl++, Ctrl+- y Ctrl+0." apila>
                  <Segmentado
                    nombre="tamaño-interfaz"
                    etiqueta="cfg-tamaño"
                    describedby="cfg-tamaño-cap"
                    opciones={TAMAÑOS_INTERFAZ.map((t) => ({ valor: t, texto: `${t} %`, cifra: true }))}
                    valor={props.ajustes.tamañoInterfaz}
                    onCambiar={(t) => props.onCambiar({ tamañoInterfaz: t })}
                  />
                </FilaConfig>
              </GrupoConfig>
              <GrupoConfig titulo="Lienzo">
                <FilaConfig
                  id="cfg-lienzo"
                  nombre="Evitar parpadeo del lienzo"
                  pista={{ id: 'pista-lienzo', texto: 'Encendido, el lienzo no parpadea al abrir o cerrar paneles. Apagado ocupa menos memoria de video. Se aplica al reabrir Kirchi.' }}
                >
                  <Interruptor etiqueta="cfg-lienzo" describedby="pista-lienzo" activo={!!props.ajustes.lienzoSincronizado} onCambiar={(v) => props.onCambiar({ lienzoSincronizado: v })} />
                </FilaConfig>
              </GrupoConfig>
            </Match>
            <Match when={activa() === 'simulacion'}>
              <SeccionSimulacion simulacion={props.ajustes.simulacion} onCambiar={(p) => props.onCambiar({ simulacion: { ...props.ajustes.simulacion, ...p } })} />
            </Match>
            <Match when={activa() === 'asistente' && props.asistente}>{(a) => <SeccionAsistente {...a()} />}</Match>
            <Match when={activa() === 'atajos' && props.atajos}>
              {(a) => <SeccionAtajos atajos={a()} version={props.versionAtajos} onCambio={() => props.onAtajos?.()} autofoco={props.seccion === 'atajos'} />}
            </Match>
          </Switch>
        </div>
      </div>
      <p class="secundario nota-dialogo">Los cambios se guardan solos.</p>
    </Dialogo>
  )
}
