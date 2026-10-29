import TarjetasInforme from './TarjetasInforme'
import type { TarjetaInforme } from './informeVivo'
import { createEffect, createMemo, createSignal, For, Index, on, onCleanup, Show, untrack, type JSX } from 'solid-js'
import type { Conexiones } from '../conexiones/conexiones'
import type { Documento, Id } from '../doc/tipos'
import type { Seleccion } from '../editor/seleccion'
import type { PiezaDef } from '../piezas/tipos'
import IconoCinta from './cinta/IconoCinta'
import { tonoDeCategoria } from './colores'
import { filaConFoco, restaurarFoco } from './foco'
import { agruparPiezas, piezasVisibles, plural, recortar, reutilizar, vistaProyecto, type EntradaAlimentacion, type EntradaPieza, type EntradaRed } from './proyecto'
import SpriteSimbolos, { UsoSimbolo } from './SpriteSimbolos'

interface Props {
  doc: Documento
  con: Conexiones
  lib: Map<string, PiezaDef>
  /** Nombres de las redes visibles, calculados una vez por conexiones (`nombresDeRedes`). */
  nombres: Map<number, string>
  seleccion: Seleccion
  /** Clic en una entrada: seleccionar y centrar. */
  onPieza(id: Id): void
  onRed(red: number): void
  /** Cambia el voltaje de un riel (VCC, VEE…): el de todos sus terminales. Devuelve el error para mostrarlo, o null. */
  onRiel(nombre: string, texto: string): string | null
  /** Dónde va el foco si ya no queda ninguna fila ni lista donde ponerlo. */
  alCanvas(): void
  /** Las piezas que pasan un límite de su hoja de datos al simular, con el texto del chip (vacío si no simula). */
  excedidas?: ReadonlyMap<Id, string>
  /** El archivo abierto, para su tarjeta: nombre y si tiene cambios sin guardar o es de solo lectura. */
  archivo: { nombre: string; sinGuardar: boolean; soloLectura: boolean }
  /** Secciones plegadas («piezas», «paquetes», «redes», «alimentaciones», «cat:<categoría>»): se recuerdan en los ajustes. */
  plegado: readonly string[]
  onPlegado(plegado: string[]): void
  /** El informe de la importación que creó el circuito, si el documento lo trae. */
  informe?: {
    titulo: string
    tarjetas: TarjetaInforme[]
    resaltada: TarjetaInforme['clase'] | null
    onResaltar(t: TarjetaInforme | null): void
    onEncuadrar(t: TarjetaInforme): void
    onOcultar(): void
  }
}

/** La clave de plegado de una categoría de piezas. */
const claveCategoria = (id: string) => `cat:${id}`

/** Un riel con su voltaje en un campo (Enter o salir aplica, Esc regresa); un nombre con voltaje, solo leído. */
function FilaRiel(props: { riel: EntradaAlimentacion; onRiel: Props['onRiel'] }) {
  const [texto, setTexto] = createSignal(props.riel.texto)
  const [error, setError] = createSignal<string | null>(null)
  // Si el voltaje cambia por fuera (deshacer, el inspector) o la fila pasa a ser de otro riel, el campo lo sigue y su error
  // se va: era de lo escrito para el de antes.
  createEffect(on(() => [props.riel.nombre, props.riel.texto] as const, ([, t]) => (setTexto(t), setError(null)), { defer: true }))
  const id = () => `riel-${props.riel.nombre.replace(/[^A-Za-z0-9_-]/g, (c) => `_${c.charCodeAt(0)}`)}`
  const cuantos = () => plural(props.riel.terminales, 'terminal', 'terminales')
  const aplicar = () => {
    if (texto() === props.riel.texto) return setError(null)
    setError(props.onRiel(props.riel.nombre, texto()))
  }
  return (
    <div class="riel-ficha" data-tono={tonoDeCategoria('fuentes')}>
      <div class="riel-cabeza">
        <span class="riel-icono" aria-hidden="true">
          <IconoCinta nombre="alimentacion" uso="chico" />
        </span>
        <Show when={!props.riel.deNombre} fallback={<span class="cifra riel-ficha-nombre">{props.riel.nombre}</span>}>
          <label for={id()} class="cifra riel-ficha-nombre">
            {props.riel.nombre}
          </label>
        </Show>
        <span class="secundario">{cuantos()}</span>
      </div>
      <div class="riel-campo">
        <Show when={!props.riel.deNombre} fallback={<span class="cifra riel-fijo">{props.riel.lectura ?? props.riel.texto}</span>}>
          <input
            id={id()}
            class="campo cifra"
            value={texto()}
            aria-invalid={error() ? 'true' : undefined}
            aria-describedby={`${id()}-ayuda`}
            onInput={(e) => setTexto(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                aplicar()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setTexto(props.riel.texto)
                setError(null)
              }
            }}
            onBlur={aplicar}
          />
          <span class="unidad cifra" aria-hidden="true">
            V
          </span>
        </Show>
      </div>
      <p id={`${id()}-ayuda`} class={error() ? 'campo-error' : 'campo-ayuda'} aria-live="polite">
        {error() ??
          (props.riel.deNombre
            ? 'El voltaje sale del nombre.'
            : props.riel.lectura && props.riel.lectura !== props.riel.texto
              ? `= ${props.riel.lectura}`
              : props.riel.terminales > 1
                ? 'Cambia el voltaje de todos.'
                : '')}
      </p>
    </div>
  )
}

/**
 * Proyecto: piezas con su valor, redes con sus conexiones y alimentaciones. Los avisos están en el inspector y el Registro.
 */
export default function PanelProyecto(props: Props) {
  const [filtro, setFiltro] = createSignal('')
  // Todo lo derivado depende de las conexiones (que cambian solo al cambiar el circuito) y lee el documento sin
  // suscribirse: un paso de arrastre no recalcula nada.
  const base = createMemo(() => {
    const c = props.con
    const f = filtro()
    return untrack(() => vistaProyecto(props.doc, props.lib, c, props.nombres, f))
  })
  // Identidad estable por fila: un cambio del documento no rehace las filas que siguen igual (ni les quita el foco).
  const previasP = new Map<Id, EntradaPieza>()
  const previasR = new Map<number, EntradaRed>()
  const piezas = createMemo(() =>
    recortar(reutilizar(previasP, base().piezas, (p) => p.id, (a, b) => a.ref === b.ref && a.nombre === b.nombre && a.valor === b.valor && a.tipo === b.tipo))
  )
  const redes = createMemo(() => recortar(reutilizar(previasR, base().redes, (r) => r.red, (a, b) => a.nombre === b.nombre && a.conexiones === b.conexiones)))
  // Los tipos que muestran las filas pintadas: el sprite lleva un símbolo por tipo, no uno por fila.
  const defsUsadas = createMemo(() => [...new Set(piezas().filas.map((p) => p.tipo))].map((t) => props.lib.get(t)).filter((d): d is PiezaDef => !!d))
  const grupos = createMemo(() => agruparPiezas(piezas().filas, base().piezas))
  const plegada = (clave: string) => props.plegado.includes(clave)
  // Quien filtra quiere ver lo que coincide: con un filtro escrito se abre todo lo que tiene filas.
  const abierta = (clave: string) => piezasVisibles(plegada(clave), filtro())
  const alternar = (clave: string) => props.onPlegado(plegada(clave) ? props.plegado.filter((c) => c !== clave) : [...props.plegado, clave])
  const Flecha = () => (
    <svg class="categoria-flecha" viewBox="0 0 10 6" aria-hidden="true">
      <path d="M1 1l4 4 4-4" />
    </svg>
  )
  const estadoArchivo = () => (props.archivo.soloLectura ? 'Solo lectura' : props.archivo.sinGuardar ? 'Sin guardar' : 'Guardado')

  // El foco de una fila que se desmonta (por ejemplo al deshacer) pasa a la que ocupa su lugar.
  let ultimo: { fila: HTMLElement; lista: HTMLElement; indice: number } | null = null
  const alEnfocar = (e: FocusEvent) => {
    ultimo = filaConFoco(e.target, 'button.entrada')
  }
  const alDesmontar = (fila: () => HTMLElement | undefined) => {
    onCleanup(() => {
      const u = ultimo
      if (!u || u.fila !== fila()) return
      ultimo = null
      queueMicrotask(() => restaurarFoco(u.lista, 'button.entrada', u.indice, props.alCanvas))
    })
  }
  // Una fila es UN elemento: el botón con su texto; el valor secundario sale de `data-valor` (CSS `::after`), que el
  // nombre accesible incluye. Sin `li` ni `span` por fila el panel con 1,000 piezas baja de ~2,000 a ~650 elementos.
  const Fila = (p: { onClick(): void; actual?: boolean; titulo?: string; valor?: string; tipo?: string; tono?: string; aviso?: string; children: JSX.Element }) => {
    let el: HTMLButtonElement | undefined
    alDesmontar(() => el)
    return (
      <button
        ref={el}
        type="button"
        class="entrada"
        classList={{ 'fila-pieza': !!p.tipo }}
        aria-current={p.actual ? 'true' : undefined}
        title={p.aviso ? `${p.titulo ?? ''}${p.titulo ? ': ' : ''}${p.aviso}` : p.titulo}
        aria-description={p.aviso}
        data-aviso={p.aviso ? '' : undefined}
        data-valor={p.valor}
        onClick={() => p.onClick()}
      >
        <Show when={p.tipo}>
          {(t) => (
            <span class="ficha-simbolo" data-tono={p.tono}>
              <UsoSimbolo tipo={t()} prefijo="proyecto-simbolo" />
            </span>
          )}
        </Show>
        {p.children}
      </button>
    )
  }
  const Resto = (p: { n: number }) => (
    <Show when={p.n > 0}>
      <p class="secundario resto">{`y ${p.n.toLocaleString('es-MX')} más: usa el filtro.`}</p>
    </Show>
  )
  return (
    <div class="panel-proyecto" onFocusIn={alEnfocar}>
      <div class="archivo-ficha">
        <span class="archivo-icono" aria-hidden="true">
          <IconoCinta nombre="guardar" uso="grande" />
        </span>
        <div>
          <b>{props.archivo.nombre}</b>
          <span>{estadoArchivo()}</span>
        </div>
      </div>
      <Show when={props.informe}>
        {(inf) => (
          <section class="informe-importacion" aria-labelledby="proyecto-informe">
            <h3 id="proyecto-informe">{inf().titulo}</h3>
            <div class="tarjetas-informe">
              <TarjetasInforme tarjetas={inf().tarjetas} resaltada={inf().resaltada} onResaltar={inf().onResaltar} onEncuadrar={inf().onEncuadrar} />
            </div>
            <button type="button" class="boton" onClick={() => inf().onOcultar()}>
              Ocultar el informe
            </button>
          </section>
        )}
      </Show>
      <SpriteSimbolos defs={defsUsadas()} prefijo="proyecto-simbolo" />
      <input class="campo" type="search" placeholder="Filtrar…" aria-label="Filtrar piezas y redes" value={filtro()} onInput={(e) => setFiltro(e.currentTarget.value)} />
      <section class="categoria" aria-labelledby="proyecto-piezas">
        <h3 id="proyecto-piezas" class="categoria-titulo">
          <button type="button" class="categoria-plegar" aria-expanded={abierta('piezas')} aria-controls="proyecto-piezas-lista" onClick={() => alternar('piezas')}>
            <Flecha />
            Piezas
          </button>
          <span class="cifra pastilla">{base().piezas.length}</span>
        </h3>
        <div id="proyecto-piezas-lista">
          <Show when={abierta('piezas')}>
            <For each={grupos()}>
              {(g) => (
                <div class="grupo-piezas" data-tono={g.tono}>
                  <h4 class="grupo-titulo">
                    <button type="button" class="categoria-plegar" aria-expanded={abierta(claveCategoria(g.id))} aria-label={`${g.nombre} ${plural(g.total, 'pieza', 'piezas')}`} onClick={() => alternar(claveCategoria(g.id))}>
                      <Flecha />
                      <span class="muestra" aria-hidden="true" />
                      {g.nombre}
                    </button>
                    <span class="cifra">{g.total}</span>
                  </h4>
                  <Show when={abierta(claveCategoria(g.id))}>
                    <div class="lista" role="group" tabindex="-1" aria-label={g.nombre}>
                      <For each={g.piezas}>
                        {(p) => (
                          <Fila actual={props.seleccion.piezas.has(p.id)} titulo={p.nombre} valor={p.valor} tipo={p.tipo} tono={p.tono} aviso={props.excedidas?.get(p.id)} onClick={() => props.onPieza(p.id)}>
                            {p.ref}
                          </Fila>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              )}
            </For>
            <Resto n={piezas().resto} />
            <Show when={base().piezas.length === 0}>
              <p class="secundario">{base().total.piezas ? 'Ninguna pieza coincide.' : 'El esquema está vacío.'}</p>
            </Show>
          </Show>
        </div>
      </section>
      <Show when={base().paquetes.length > 0}>
        <section class="categoria" aria-labelledby="proyecto-paquetes">
          <h3 id="proyecto-paquetes" class="categoria-titulo">
            <button type="button" class="categoria-plegar" aria-expanded={abierta('paquetes')} aria-controls="proyecto-paquetes-lista" onClick={() => alternar('paquetes')}>
              <Flecha />
              Encapsulados
            </button>
            <span class="cifra pastilla">{base().paquetes.length}</span>
          </h3>
          <div id="proyecto-paquetes-lista">
            <Show when={abierta('paquetes')}>
              <div class="lista" role="group" tabindex="-1" aria-labelledby="proyecto-paquetes">
                <For each={base().paquetes}>
                  {(q) => (
                    <Fila valor={`${q.chip} (${q.unidades})`} onClick={() => props.onPieza(q.pieza)}>
                      {q.paquete}
                    </Fila>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </section>
      </Show>
      <section class="categoria" aria-labelledby="proyecto-redes">
        <h3 id="proyecto-redes" class="categoria-titulo">
          <button type="button" class="categoria-plegar" aria-expanded={abierta('redes')} aria-controls="proyecto-redes-lista" onClick={() => alternar('redes')}>
            <Flecha />
            Redes
          </button>
          <span class="cifra pastilla">{base().redes.length}</span>
        </h3>
        <div id="proyecto-redes-lista">
          <Show when={abierta('redes')}>
            <div class="lista" role="group" tabindex="-1" aria-labelledby="proyecto-redes">
              <For each={redes().filas}>
                {(r) => (
                  <Fila valor={plural(r.conexiones, 'conexión', 'conexiones')} onClick={() => props.onRed(r.red)}>
                    <span class="glifo-red" aria-hidden="true" />
                    {r.nombre}
                  </Fila>
                )}
              </For>
            </div>
            <Resto n={redes().resto} />
          </Show>
        </div>
      </section>
      <Show when={base().alimentaciones.length > 0}>
        <section class="categoria" aria-labelledby="proyecto-alimentaciones">
          <h3 id="proyecto-alimentaciones" class="categoria-titulo">
            <button type="button" class="categoria-plegar" aria-expanded={!plegada('alimentaciones')} aria-controls="proyecto-alimentaciones-lista" onClick={() => alternar('alimentaciones')}>
              <Flecha />
              Alimentaciones
            </button>
            <span class="cifra pastilla">{base().alimentaciones.length}</span>
          </h3>
          <div id="proyecto-alimentaciones-lista">
            <Show when={!plegada('alimentaciones')}>
              <div class="lista-rieles">
                {/* Por posición: aplicar un voltaje rehace la vista y la fila (con su campo enfocado) se queda, solo cambia su texto. */}
                <Index each={base().alimentaciones}>{(r) => <FilaRiel riel={r()} onRiel={props.onRiel} />}</Index>
              </div>
            </Show>
          </div>
        </section>
      </Show>
    </div>
  )
}
