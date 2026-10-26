import { createMemo, createUniqueId, For, Match, Show, Switch } from 'solid-js'
import type { SerieComercial } from '../../../compartido/ajustes'
import type { Armado } from '../calculadoras/circuitos'
import { leerEnVozAlta, type Ecuacion } from '../calculadoras/ecuacion'
import { calculadoraDe, CALCULADORAS, resumenParaLector, type CampoCalc, type Contexto, type DefCalculadora, type FilaValor, type OpcionCalc } from '../calculadoras/catalogo'
import { leerFormula, partesDeSustitucion } from '../calculadoras/formula'
import { calculadoraActiva, elegirCalculadora, estadoDeCalculadora, ponerCampo } from '../calculadoras/estado'
import type { PiezaDef } from '../piezas/tipos'
import { elegirSerie, serieElegida } from '../valores/serieElegida'
import CampoValor from './CampoValor'
import Formula from './Formula'
import Conmutador from './Conmutador'
import OpcionConMuestra, { BotonDeLista } from './OpcionConMuestra'
import { NOMBRE_SERIE } from './textosSerie'

interface Props {
  lib: Map<string, PiezaDef>
  /** «Generar circuito»: deja el circuito pegado al ratón, como una plantilla. */
  onGenerar(a: Armado): void
  /** No se puede editar (vista previa en marcha o archivo de solo lectura): el motivo que se dice junto a los botones. */
  motivoBloqueo?: string | null
}

const SERIES = (['E6', 'E12', 'E24', 'libre'] as const).map((s) => ({ valor: s, texto: NOMBRE_SERIE[s] }))

const IconoAviso = () => (
  <svg class="nota-serie-icono" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 2.2 14.2 13H1.8z" />
    <path d="M8 6.6v3M8 11.3v.1" />
  </svg>
)
const IconoInfo = () => (
  <svg class="nota-serie-icono" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="5.6" />
    <path d="M8 7.4v3.4M8 5.2v.1" />
  </svg>
)

/** Un campo de la ficha: rótulo a la izquierda y el valor a la derecha, como el inspector (editor de valores, dirección A). */
function Campo(props: { def: DefCalculadora; campo: CampoCalc; contexto: Contexto; error?: string }) {
  const id = `calc-${props.def.id}-${props.campo.id}-${createUniqueId()}`
  const valor = () => estadoDeCalculadora(props.def.id)[props.campo.id] ?? ''
  const poner = (t: string) => ponerCampo(props.def.id, props.campo.id, t)
  const c = props.campo
  return (
    <div class="fld fld-campo calc-campo">
      <Switch>
        <Match when={c.tipo === 'num' && c}>
          {(n) => (
            <>
              <label for={id}>{n().rotulo}</label>
              <CampoValor
                texto={valor()}
                unidad={n().unidad}
                nombre={n().rotulo}
                invalido={!!props.error}
                atributos={{ id, 'aria-describedby': props.error ? `${id}-error` : undefined }}
                onTexto={poner}
              />
            </>
          )}
        </Match>
        <Match when={c.tipo === 'lista' && c}>
          {(l) => (
            <>
              <label for={id}>{l().rotulo}</label>
              <div class="campo-lista">
                <select id={id} class="campo" classList={{ 'con-muestras': opcionesDe(l(), props.contexto).some((o) => !!o.muestra) }} value={valor()} onChange={(e) => poner(e.currentTarget.value)}>
                  <Show when={opcionesDe(l(), props.contexto).some((o) => !!o.muestra)}>
                    <BotonDeLista />
                  </Show>
                  <For each={opcionesDe(l(), props.contexto)}>{(o) => <OpcionConMuestra valor={o.valor} texto={o.texto} muestra={o.muestra} seleccionada={o.valor === valor()} />}</For>
                </select>
              </div>
            </>
          )}
        </Match>
        <Match when={c.tipo === 'conmutador' && c}>
          {(k) => (
            <>
              <span class="calc-rotulo" aria-hidden="true">
                {k().rotulo}
              </span>
              <Conmutador nombre={k().rotulo} opciones={opcionesDe(k(), props.contexto)} valor={valor()} onCambiar={poner} />
            </>
          )}
        </Match>
      </Switch>
      <Show when={props.error}>
        {(t) => (
          <p id={`${id}-error`} class="campo-error">
            {t()}
          </p>
        )}
      </Show>
    </div>
  )
}

/** Cuánto se puede alejar un comercial del valor exacto sin que la ficha lo marque: más de 5 % llama la atención. */
const TOLERANCIA_ERROR = 0.05

const IconoOk = () => (
  <svg class="nota-serie-icono" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3.5 8.4 6.6 11.4 12.5 5" />
  </svg>
)

/**
 * Ecuación con su cuenta: fórmula, sustitución tenue y resultado con unidad. Los lectores oyen la ecuación en palabras (`role="math"`) y lo dibujado no se lee. Una ecuación que no se entiende va como texto.
 */
function EcuacionResuelta(props: { q: Ecuacion }) {
  const formula = () => leerFormula(props.q.ecuacion)
  const partes = () => partesDeSustitucion(props.q.sustitucion)
  return (
    <div class="calc-ecuacion">
      <Show
        when={formula()}
        fallback={
          <p class="calc-ecuacion-texto cifra">
            <span aria-hidden="true">{props.q.ecuacion}</span>
            <span class="solo-lectores">{leerEnVozAlta(props.q.ecuacion)}</span>
          </p>
        }
      >
        {(n) => (
          <div class="calc-formula" role="math" aria-label={leerEnVozAlta(props.q.ecuacion)}>
            <Formula nodos={n()} />
          </div>
        )}
      </Show>
      <Show
        when={partes()}
        fallback={
          <p class="calc-ecuacion-texto calc-ecuacion-valores cifra">
            <span aria-hidden="true">{props.q.sustitucion}</span>
            <span class="solo-lectores">{leerEnVozAlta(props.q.sustitucion)}</span>
          </p>
        }
      >
        {(p) => (
          <>
            <div class="calc-sustitucion" role="math" aria-label={leerEnVozAlta(props.q.sustitucion)}>
              <Formula nodos={[...p().lado, { t: 'op', op: '=' }, ...p().cuenta]} />
            </div>
            <p class="calc-igual" aria-hidden="true">
              <Formula nodos={[...p().lado, { t: 'op', op: '=' }]} />
              <span class="calc-igual-cifra cifra">
                {p().resultado.negativo ? '−' : ''}
                {p().resultado.cifra}
              </span>
              <Show when={p().resultado.unidad}>{(u) => <span class="calc-igual-unidad cifra">{u()}</span>}</Show>
            </p>
          </>
        )}
      </Show>
    </div>
  )
}

/**
 * Valores de los componentes como tabla corta: valor, exacto, comercial y error, con una marca que no depende del color. Con la serie libre solo el exacto.
 */
function TablaValores(props: { filas: readonly FilaValor[]; serie: SerieComercial }) {
  const libre = () => props.serie === 'libre'
  return (
    <table class="calc-tabla">
      <caption class="solo-lectores">{libre() ? 'Valores exactos' : `Valores comerciales ${props.serie}: exacto, comercial y error`}</caption>
      <thead>
        <tr>
          <th scope="col">Valor</th>
          <th scope="col">Exacto</th>
          <Show when={!libre()}>
            <th scope="col">Comercial</th>
            <th scope="col">Error</th>
          </Show>
        </tr>
      </thead>
      <tbody>
        <For each={props.filas}>
          {(f) => (
            <tr>
              <th scope="row">{f.rotulo}</th>
              <Show
                when={!f.frase}
                fallback={
                  <td class="calc-frase" colspan={libre() ? 2 : 4}>
                    {f.exacto}
                  </td>
                }
              >
                <td class="cifra">{f.exacto}</td>
                <Show when={!libre()}>
                  <td class="cifra calc-comercial">{f.comercial ?? f.exacto}</td>
                  <td class="cifra calc-error" data-estado={Math.abs(f.desvioNum ?? 0) > TOLERANCIA_ERROR ? 'aviso' : 'ok'}>
                    {Math.abs(f.desvioNum ?? 0) > TOLERANCIA_ERROR ? <IconoAviso /> : <IconoOk />}
                    <span>{f.desvio ?? '0.0 %'}</span>
                    <span class="solo-lectores">{Math.abs(f.desvioNum ?? 0) > TOLERANCIA_ERROR ? ', más de 5 %' : ', dentro de lo normal'}</span>
                  </td>
                </Show>
              </Show>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}

const opcionesDe = (c: CampoCalc, ctx: Contexto): OpcionCalc[] => (c.tipo === 'num' ? [] : c.opciones(ctx))

/**
 * Panel «Calculadoras» del riel izquierdo. Datos y cifras salen de `calculadoras/catalogo.ts`; aquí solo se pintan.
 */
export default function PanelCalculadoras(props: Props) {
  const def = createMemo(() => calculadoraDe(calculadoraActiva()))
  const contexto = (): Contexto => ({ serie: serieElegida() as SerieComercial, lib: props.lib })
  const evaluacion = createMemo(() => def().evaluar(estadoDeCalculadora(def().id), contexto()))
  const salida = () => evaluacion().salida
  const serie = () => serieElegida()
  return (
    <div class="panel-calculadoras">
      {/* Fijas bajo el encabezado del panel: «Generar circuito» queda a la mano al desplazar la ficha. */}
      <div class="calc-fijo">
      <div class="calc-acciones">
        <button
          type="button"
          class="boton principal"
          data-accion="generar"
          disabled={!salida() || !!props.motivoBloqueo}
          title="El circuito queda pegado al ratón: haz clic donde va. Esc lo cancela."
          onClick={() => salida() && props.onGenerar(salida()!.armado)}
        >
          Generar circuito
        </button>
      </div>
      <Show when={props.motivoBloqueo}>{(m) => <p class="calc-ayuda">{m()}</p>}</Show>
      </div>
      <div class="calc-lista" role="group" aria-label="Calculadora">
        <For each={CALCULADORAS}>
          {(d) => (
            <button type="button" class="calc-eleccion" aria-pressed={calculadoraActiva() === d.id} data-calculadora={d.id} onClick={() => elegirCalculadora(d.id)}>
              {d.corto}
            </button>
          )}
        </For>
      </div>
      {/* keyed por la calculadora: cada una monta su ficha con sus campos. */}
      <Show when={def()} keyed>
        {(d) => (
          <section class="calc-ficha" aria-labelledby={`calc-titulo-${d.id}`}>
            <h3 id={`calc-titulo-${d.id}`} class="calc-titulo">
              {d.nombre}
            </h3>
            <p class="calc-resumen">{d.resumen}</p>
            <div class="calc-campos">
              <For each={d.campos}>
                {(k) => (
                  <Show when={!k.visible || k.visible(estadoDeCalculadora(d.id))}>
                    <Campo def={d} campo={k} contexto={contexto()} error={evaluacion().erroresCampo[k.id]} />
                  </Show>
                )}
              </For>
              <div class="fld calc-campo calc-serie">
                <span class="calc-rotulo" aria-hidden="true">
                  Serie
                </span>
                <Conmutador nombre="Serie comercial" opciones={SERIES} valor={serie()} onCambiar={(s) => elegirSerie(s)} />
              </div>
            </div>
            {/* Una sola región viva y corta: el resto de la ficha no se anuncia a cada tecla. */}
            <p class="solo-lectores" role="status" aria-live="polite" aria-atomic="true">
              {resumenParaLector(evaluacion())}
            </p>
            <div class="calc-resultado">
              <Show when={evaluacion().error}>
                {(e) => (
                  <div class="nota-serie aviso">
                    <IconoAviso />
                    <p>{e()}</p>
                  </div>
                )}
              </Show>
              <Show when={salida()}>
                {(s) => (
                  <>
                    <h4 class="calc-subtitulo">{s().ecuaciones.length === 1 ? 'Ecuación' : 'Ecuaciones'}</h4>
                    <div class="calc-ecuaciones" data-ecuaciones>
                      <For each={s().ecuaciones}>{(q) => <EcuacionResuelta q={q} />}</For>
                    </div>
                    <h4 class="calc-subtitulo">{serie() === 'libre' ? 'Valores exactos' : `Valores comerciales ${serie()}`}</h4>
                    <TablaValores filas={s().valores} serie={serie()} />
                    <h4 class="calc-subtitulo">Con esos valores</h4>
                    <table class="calc-tabla calc-reales">
                      <caption class="solo-lectores">Con esos valores</caption>
                      <tbody>
                        <For each={s().reales}>
                          {(f) => (
                            <tr>
                              <th scope="row">
                                {f.rotulo}
                                <Show when={f.detalle}>
                                  <small class="calc-exacto cifra">{f.detalle}</small>
                                </Show>
                              </th>
                              <td class="cifra calc-comercial">{f.valor}</td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                    <For each={s().avisos}>
                      {(a) => (
                        <div class="nota-serie aviso">
                          <IconoAviso />
                          <p>{a}</p>
                        </div>
                      )}
                    </For>
                    <Show when={s().nota}>
                      {(n) => (
                        <div class="nota-serie">
                          <IconoInfo />
                          <p>{n()}</p>
                        </div>
                      )}
                    </Show>
                  </>
                )}
              </Show>
            </div>
          </section>
        )}
      </Show>
    </div>
  )
}
