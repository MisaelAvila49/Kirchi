import { createMemo, createSignal, Index, Show } from 'solid-js'
import type { Documento, Id } from '../doc/tipos'
import type { Seleccion } from '../editor/seleccion'
import type { Paleta } from '../lienzo/paleta'
import type { PiezaDef } from '../piezas/tipos'
import type { FaseSim } from '../sim/control'
import type { Lectura } from '../sim/lectura'
import IconoCinta from './cinta/IconoCinta'
import type { PerillaVista } from './ControlPerilla'
import SeccionPerillas from './SeccionPerillas'
import { tonoDeCategoria } from './colores'
import { colorDeRed, fichasDe, vistaMediciones } from './mediciones'
import { recortar } from './proyecto'
import SpriteSimbolos, { UsoSimbolo } from './SpriteSimbolos'

/** Un multímetro en Mediciones: su referencia, la función («V CC») y su cifra («6.95 V»; «- - -» sin vista previa). */
export interface FilaMultimetro {
  id: Id
  ref: string
  funcion: string
  texto: string
  /** Una línea más, si hace falta («50 Hz», «Fusible fundido»). */
  detalle?: string
}

interface Props {
  doc: Documento
  lib: Map<string, PiezaDef>
  nombres: Map<number, string>
  lectura: Lectura | null
  seleccion: Seleccion
  fase: FaseSim
  /** La escala de voltaje de la vista previa y la paleta del lienzo: la muestra de cada red es el color de su cable. */
  escala: number
  paleta: Paleta
  /** La tecla vigente de Simular («F5»), para el texto de la vista detenida. */
  teclaSimular?: string
  /** Los multímetros del circuito con su cifra: la lectura que ya no tiene pestaña en la franja. */
  multimetros?: readonly FilaMultimetro[]
  /** Las perillas en vivo de la pieza seleccionada, en una fila compacta mientras simula. */
  perillas?: readonly PerillaVista[]
  onPerilla?(perilla: PerillaVista, valor: number, gesto?: string): void
  onPieza(id: Id): void
  onRed(red: number): void
  /** El botón Simular del panel sin vista previa: la misma orden que la cinta (por el ejecutor). */
  onSimular(boton: HTMLElement): void
}

/** Mediciones: estado vivo, redes con la muestra de su voltaje y piezas con sus lecturas como fichas de magnitud. */
export default function PanelMediciones(props: Props) {
  const [filtro, setFiltro] = createSignal('')
  const vista = createMemo(() => vistaMediciones(props.doc, props.nombres, props.lectura, filtro(), props.lib))
  // Topadas en 200 filas cada lista: el color y las fichas se calculan solo para las pintadas.
  const redes = createMemo(() => recortar(vista()?.redes ?? []))
  const piezas = createMemo(() => recortar(vista()?.piezas ?? []))
  const logica = createMemo(() => recortar(vista()?.logica ?? []))
  const tiposUsados = createMemo(() =>
    [...new Set([...piezas().filas, ...logica().filas].map((p) => props.doc.piezas[p.id]?.tipo).filter((t): t is string => !!t))]
      .map((t) => props.lib.get(t))
      .filter((d): d is PiezaDef => !!d)
  )
  const Resto = (p: { n: number }) => (
    <Show when={p.n > 0}>
      <p class="secundario resto">{`y ${p.n.toLocaleString('es-MX')} más: usa el filtro.`}</p>
    </Show>
  )
  const Instrumentos = () => (
    <Show when={(props.multimetros?.length ?? 0) > 0}>
      <section class="categoria" aria-labelledby="mediciones-instrumentos">
        <h3 id="mediciones-instrumentos" class="categoria-titulo">
          Instrumentos <span class="cifra pastilla">{props.multimetros!.length}</span>
        </h3>
        <ul class="lista" aria-labelledby="mediciones-instrumentos">
          <Index each={props.multimetros}>
            {(m) => (
              <li>
                <button type="button" class="entrada fila-instrumento" aria-current={props.seleccion.piezas.has(m().id) ? 'true' : undefined} onClick={() => props.onPieza(m().id)}>
                  <span class="fila-ref">{m().ref}</span>
                  <span class="secundario">{m().funcion}</span>
                  <output class="cifra cifra-multimetro" aria-label={`Lectura de ${m().ref}`}>
                    {m().texto}
                  </output>
                  <Show when={m().detalle}>
                    <span class="secundario detalle-multimetro">{m().detalle}</span>
                  </Show>
                </button>
              </li>
            )}
          </Index>
        </ul>
      </section>
    </Show>
  )
  const vacio = (
    <div class="panel-proyecto panel-mediciones">
      <Instrumentos />
      <div class="vacio-med">
      <span class="vacio-icono" aria-hidden="true">
        <IconoCinta nombre="mediciones" uso="grande" />
      </span>
      <p>
        <b>{props.fase === 'arrancando' ? 'Arrancando la vista previa…' : 'Sin vista previa'}</b>
        {`Pulsa Simular${props.teclaSimular ? ` (${props.teclaSimular})` : ''} para ver los voltajes y las corrientes del circuito.`}
      </p>
      <button type="button" class="boton boton-simular-vacio" disabled={props.fase === 'arrancando'} onClick={(e) => props.onSimular(e.currentTarget)}>
        <IconoCinta nombre="simular" uso="chico" />
        Simular
      </button>
      </div>
    </div>
  )
  return (
    <Show when={vista()} fallback={vacio}>
      {(v) => (
        <div class="panel-proyecto panel-mediciones">
          <div class="estado-med">
            <span class="punto-vivo" aria-hidden="true" />
            <div>
              <b>{props.fase === 'pausada' ? 'En pausa' : 'Vista previa'}</b>
              <span class="cifra" aria-live="off">
                {v().encabezado}
              </span>
            </div>
          </div>
          <input class="campo" type="search" placeholder="Filtrar…" aria-label="Filtrar redes y piezas medidas" value={filtro()} onInput={(e) => setFiltro(e.currentTarget.value)} />
          <SpriteSimbolos defs={tiposUsados()} prefijo="mediciones-simbolo" />
          <Instrumentos />
          <section class="categoria" aria-labelledby="mediciones-redes">
            <h3 id="mediciones-redes" class="categoria-titulo">
              Redes <span class="cifra pastilla">{v().redes.length}</span>
            </h3>
            <ul class="lista" aria-labelledby="mediciones-redes">
              {/* Index y no For: las filas se renuevan diez veces por segundo y el botón enfocado no debe rehacerse. */}
              <Index each={redes().filas}>
                {(r) => (
                  <li>
                    <button type="button" class="entrada fila-red-med" onClick={() => props.onRed(r().red)}>
                      <span class="muestra-v" aria-hidden="true" style={{ background: props.lectura ? colorDeRed(r().red, props.lectura, props.escala, props.paleta) : undefined }} />
                      <span class="fila-nombre-red">{r().nombre}</span>
                      <span class="cifra chip-lectura">{r().voltaje}</span>
                    </button>
                  </li>
                )}
              </Index>
            </ul>
            <Resto n={redes().resto} />
          </section>
          <SeccionPerillas compacta perillas={props.perillas ?? []} onCambiar={(p, v, g) => props.onPerilla?.(p, v, g)} />
          <Show when={v().logica.length > 0}>
            <section class="categoria" aria-labelledby="mediciones-logica">
              <h3 id="mediciones-logica" class="categoria-titulo">
                Lógica y convertidores <span class="cifra pastilla">{v().logica.length}</span>
              </h3>
              <ul class="lista" aria-labelledby="mediciones-logica">
                <Index each={logica().filas}>
                  {(f) => {
                    const tipo = () => props.doc.piezas[f().id]?.tipo
                    return (
                      <li>
                        <button type="button" class="entrada fila-logica" aria-current={props.seleccion.piezas.has(f().id) ? 'true' : undefined} onClick={() => props.onPieza(f().id)}>
                          <span class="fila-cabeza">
                            <Show when={tipo()}>
                              {(t) => (
                                <span class="ficha-simbolo" data-tono={tonoDeCategoria(props.lib.get(t())?.categoria ?? '')} aria-hidden="true">
                                  <UsoSimbolo tipo={t()} prefijo="mediciones-simbolo" />
                                </span>
                              )}
                            </Show>
                            <span class="fila-ref">{f().ref}</span>
                            <span class="logica-titulo">{f().titulo}</span>
                            <Show when={f().estado}>
                              {(e) => (
                                <span class="pastilla-estado" data-tono={e().tono}>
                                  {e().texto}
                                </span>
                              )}
                            </Show>
                            <Show when={f().rotulo}>
                              <span class="secundario logica-rotulo">{f().rotulo}</span>
                            </Show>
                          </span>
                          <Show when={f().cifra}>
                            <output class="cifra logica-cifra" aria-label={`Lectura de ${f().ref}`}>
                              {f().cifra}
                            </output>
                          </Show>
                          <Show when={f().formas.length > 0}>
                            <span class="cifra secundario logica-formas">
                              <Index each={f().formas}>{(x) => <span>{x()}</span>}</Index>
                            </span>
                          </Show>
                          <Show when={f().bits.length > 0}>
                            <span class="logica-bits" role="list" aria-label={`Bits de ${f().ref}, del más al menos significativo`}>
                              <Index each={f().bits}>
                                {(b) => (
                                  <span class="logica-bit" role="listitem" data-magnitud={b().valor === '1' ? 'v' : undefined} data-tono={b().valor === '1' ? undefined : 'gris'}>
                                    <small>{b().nombre}</small>
                                    {b().valor}
                                  </span>
                                )}
                              </Index>
                            </span>
                          </Show>
                          <Show when={f().renglones.length > 0}>
                            <dl class="logica-renglones">
                              <Index each={f().renglones}>
                                {(r) => (
                                  <>
                                    <dt>{r().rotulo}</dt>
                                    <dd class="cifra">{r().valor}</dd>
                                  </>
                                )}
                              </Index>
                            </dl>
                          </Show>
                        </button>
                      </li>
                    )
                  }}
                </Index>
              </ul>
              <Resto n={logica().resto} />
            </section>
          </Show>
          <section class="categoria" aria-labelledby="mediciones-piezas">
            <h3 id="mediciones-piezas" class="categoria-titulo">
              Piezas <span class="cifra pastilla">{v().piezas.length}</span>
            </h3>
            <ul class="lista" aria-labelledby="mediciones-piezas">
              <Index each={piezas().filas}>
                {(p) => {
                  const tipo = () => props.doc.piezas[p().id]?.tipo
                  return (
                    <li>
                      <button type="button" class="entrada fila-medida" aria-current={props.seleccion.piezas.has(p().id) ? 'true' : undefined} onClick={() => props.onPieza(p().id)}>
                        <span class="fila-cabeza">
                          <Show when={tipo()}>
                            {(t) => (
                              <span class="ficha-simbolo" data-tono={tonoDeCategoria(props.lib.get(t())?.categoria ?? '')} aria-hidden="true">
                                <UsoSimbolo tipo={t()} prefijo="mediciones-simbolo" />
                              </span>
                            )}
                          </Show>
                          <span class="fila-ref">{p().ref}</span>
                        </span>
                        {/* Cada cifra es una ficha que no se parte; si no caben pasan al renglón de abajo. */}
                        <span class="mini-lecturas">
                          <Index each={fichasDe(p())}>
                            {(c) => (
                              <span class="cifra" data-magnitud={c().magnitud}>
                                {c().texto}
                              </span>
                            )}
                          </Index>
                        </span>
                      </button>
                    </li>
                  )
                }}
              </Index>
            </ul>
            <Resto n={piezas().resto} />
          </section>
        </div>
      )}
    </Show>
  )
}
