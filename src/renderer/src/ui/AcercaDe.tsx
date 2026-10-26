import { createSignal, For, Show } from 'solid-js'
import { VERSION } from '../version'
import Dialogo from './Dialogo'
import iconoKirchi from '../../../../build/icono.svg?no-inline'
import type { LicenciasTerceros } from './licencias'

/** Los grupos de programas aparte, en el orden en que se muestran. */
const GRUPOS = ['Electron', 'ngspice', 'ngspice para Windows']

/** Un renglón plegable con el nombre, la versión, la licencia y su texto completo. */
function Entrada(props: { nombre: string; version: string; licencia: string; texto: string }) {
  return (
    <li>
      <details>
        <summary>
          {props.nombre} {props.version} <span class="secundario">· {props.licencia}</span>
        </summary>
        <pre class="acerca-texto" tabindex="0" role="region" aria-label={`Texto de la licencia de ${props.nombre}`}>{props.texto || 'La licencia se declara en el paquete, sin archivo de texto.'}</pre>
      </details>
    </li>
  )
}

/** La ficha de Kirchi: qué es, quién lo hizo, con qué licencia se comparte y las licencias de lo que lleva dentro y junto a él. */
export default function AcercaDe(props: { onCerrar(): void }) {
  const [datos, setDatos] = createSignal<LicenciasTerceros | null>(null)
  const [error, setError] = createSignal(false)
  // El archivo de licencias pesa unos 400 KB: se pide solo al abrir una de las listas.
  const alAbrir = (e: Event) => {
    if (!(e.currentTarget as HTMLDetailsElement).open || datos()) return
    import('./licenciasTerceros.json').then((m) => setDatos(m.default as LicenciasTerceros), () => setError(true))
  }
  const sinDatos = () => (
    <Show when={error()}>
      <p role="alert">No se pudo leer la lista de licencias.</p>
    </Show>
  )
  return (
    <Dialogo titulo="Acerca de Kirchi" clase="acerca-de" onCerrar={props.onCerrar}>
      <p class="acerca-marca">
        <img class="acerca-icono" src={iconoKirchi} alt="" width="40" height="40" />
        <span>
          <strong>Kirchi</strong> versión <span class="acerca-version">{VERSION}</span>
        </span>
      </p>
      <p>Kirchi es un simulador de circuitos de escritorio, libre y sin conexión, para estudiantes de ingeniería.</p>
      <p>Copyright (c) 2026 Misael Saúl Avila López. Licencia MIT.</p>
      <details class="acerca-licencias" onToggle={alAbrir}>
        <summary>Licencia de Kirchi</summary>
        {sinDatos()}
        <Show when={datos()}>{(d) => <pre class="acerca-texto" tabindex="0" role="region" aria-label="Texto de la licencia de Kirchi">{d().licenciaKirchi}</pre>}</Show>
      </details>
      <details class="acerca-licencias" onToggle={alAbrir}>
        <summary>ngspice y Electron (programas aparte)</summary>
        <p class="secundario nota-dialogo">
          Los análisis los calcula ngspice, un programa aparte que Kirchi ejecuta en su propio proceso, sin enlazarlo. Va en la carpeta resources/herramientas/ngspice del programa con sus licencias (COPYING-ngspice.txt, GPL-2.0.txt y AVISOS.txt).
        </p>
        <ul class="acerca-componentes">
          <li>Simulador: licencia BSD modificada (Universidad de California y equipo de ngspice).</li>
          <li>KLU (resolvedor de matrices, dentro del ejecutable): LGPL 2.1.</li>
          <li>numparam (parámetros, dentro del ejecutable): LGPL 2 o posterior.</li>
          <li>OSDI (dentro del ejecutable): MPL 2.0.</li>
          <li>XSPICE (modelos de código): dominio público.</li>
          <li>Modelo de código «table» (table.cm, módulo aparte): GPL 2 o posterior.</li>
          <li>Solo en Windows: tiempo de ejecución de GCC enlazado estático (GPL 3 con excepción de tiempo de ejecución) y, si el compilador lo enlaza, winpthreads (MIT). Sin DLL de terceros.</li>
        </ul>
        <Show when={datos()}>
          {(d) => (
            <p class="secundario nota-dialogo">
              Código fuente de ngspice {d().ngspice.version}: el archivo {d().ngspice.fuente.nombre} se entrega en la misma carpeta de descarga que los instaladores de Kirchi y está en sourceforge.net/projects/ngspice. SHA-256: <span class="acerca-suma">{d().ngspice.fuente.sha256}</span>.
            </p>
          )}
        </Show>
        <p class="secundario nota-dialogo">La interfaz corre en Electron y Chromium. Sus licencias viajan junto al programa (LICENSE.electron.txt y LICENSES.chromium.html).</p>
        {sinDatos()}
        <Show when={datos()}>
          {(d) => (
            <For each={GRUPOS}>
              {(g) => (
                <>
                  <h3 class="acerca-grupo">{g}</h3>
                  <ul class="acerca-lista">
                    <For each={d().aparte.filter((p) => p.grupo === g)}>{(p) => <Entrada nombre={p.nombre} version={p.version} licencia={p.licencia} texto={d().textos[p.texto]} />}</For>
                  </ul>
                </>
              )}
            </For>
          )}
        </Show>
      </details>
      <details class="acerca-licencias" onToggle={alAbrir}>
        <summary>Licencias de terceros</summary>
        <p class="secundario nota-dialogo">Kirchi lleva dentro estas bibliotecas y fuentes tipográficas, todas con licencias permisivas.</p>
        {sinDatos()}
        <Show when={datos()}>
          {(d) => (
            <ul class="acerca-lista">
              <For each={d().paquetes}>{(p) => <Entrada nombre={p.nombre} version={p.version} licencia={p.licencia} texto={d().textos[p.texto]} />}</For>
            </ul>
          )}
        </Show>
      </details>
      <div class="dialogo-botones">
        <button type="button" class="boton principal" data-autofoco onClick={props.onCerrar}>
          Cerrar
        </button>
      </div>
    </Dialogo>
  )
}
