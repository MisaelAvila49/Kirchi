import { createEffect, createSignal, on, Show } from 'solid-js'
import type { SerieComercial } from '../../../compartido/ajustes'
import type { PropDef } from '../piezas/tipos'
import { elegirSerie, serieElegida } from '../valores/serieElegida'
import type { Serie } from '../valores/series'
import { leerValor } from '../valores/valores'
import { RANGOS_DE_UNIDAD, rangoDeValor, valoresDeRango, vistaSerie } from '../valores/vistaSerie'
import Conmutador from './Conmutador'
import FilasValores from './FilasValores'
import ListaValores from './ListaValores'
import { NOMBRE_SERIE } from './textosSerie'

interface Props {
  /** Lo que dice el campo del valor ahora (también lo que se escribe sin aplicar). */
  texto: string
  unidad: string
  /** `elegida`: la de Configuración, con su conmutador; una serie fija (el electrolítico, E6) no lo lleva. */
  serie: NonNullable<PropDef['serie']>
  /** Escribe un valor en el campo y lo aplica (un botón de la serie o «Usar»). */
  /** `volverAlCampo`: el botón desaparece al aplicar («Usar»), así que el foco debe pasar antes al campo del valor. */
  onUsar(texto: string, volverAlCampo?: boolean): void
  desactivado?: boolean
}

const OPCIONES = (['E6', 'E12', 'E24', 'libre'] as const).map((s) => ({ valor: s, texto: NOMBRE_SERIE[s] }))

const IconoOk = () => (
  <svg class="nota-serie-icono" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3.5 8.4 6.6 11.4 12.5 5" />
  </svg>
)
const IconoAviso = () => (
  <svg class="nota-serie-icono" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 2.2 14.2 13H1.8z" />
    <path d="M8 6.6v3M8 11.3v.1" />
  </svg>
)

/**
 * Serie comercial bajo el valor de una resistencia o capacitor. El aviso de valor no comercial es leve y nunca impide aplicar.
 */
export default function FichaSerie(props: Props) {
  const serie = (): SerieComercial => (props.serie === 'elegida' ? serieElegida() : props.serie)
  const vista = () => vistaSerie(props.texto, props.unidad, serie())
  // La lista completa de la serie, un rango a la vez (Ω | kΩ | MΩ, pF | nF | µF | mF): empieza en el del valor y lo sigue si el
  // valor pasa a otro rango; elegir otro rango solo mira, no cambia el valor.
  const rangos = () => RANGOS_DE_UNIDAD[props.unidad]
  const rangoDelValor = () => {
    const v = leerValor(props.texto)
    return v ? rangoDeValor(v.valor, props.unidad) : null
  }
  const [rango, setRango] = createSignal<string | null>(rangoDelValor() ?? rangos()?.[1]?.etiqueta ?? rangos()?.[0]?.etiqueta ?? null)
  createEffect(on(rangoDelValor, (r) => r && setRango(r), { defer: true }))
  const todos = () => (serie() === 'libre' || !rango() ? [] : valoresDeRango(serie() as Serie, props.unidad, rango()!, props.texto))
  return (
    <div class="ficha-serie">
      <Show when={props.serie === 'elegida'}>
        <div class="ficha-serie-fila">
          <span class="ficha-serie-rotulo" aria-hidden="true">
            Serie
          </span>
          <Conmutador nombre="Serie comercial" opciones={OPCIONES} valor={serieElegida()} onCambiar={(s) => elegirSerie(s)} desactivado={props.desactivado} />
        </div>
      </Show>
      <Show when={vista()}>
        {(v) => (
          <>
            <div class="nota-serie" classList={{ aviso: v().nota.tipo === 'aviso' }} role="status">
              {v().nota.tipo === 'aviso' ? <IconoAviso /> : <IconoOk />}
              <p>
                {v().nota.texto}
                <Show when={v().nota.usar}>
                  {(u) => (
                    <button type="button" class="boton nota-serie-usar" data-eleccion="" disabled={props.desactivado} onClick={() => props.onUsar(u().texto, true)}>
                      {u().etiqueta}
                    </button>
                  )}
                </Show>
              </p>
            </div>
            <Show when={serie() !== 'libre' && rango()}>
              <ListaValores titulo={`Valores comerciales ${serie()}`} detalle={rango() ?? undefined}>
                <Show when={rangos()}>
                  {(r) => (
                    <Conmutador
                      nombre="Rango de la lista de valores"
                      opciones={r().map((x) => ({ valor: x.etiqueta, texto: x.etiqueta }))}
                      valor={rango()!}
                      onCambiar={setRango}
                      desactivado={props.desactivado}
                    />
                  )}
                </Show>
                <FilasValores etiqueta={`Valores de ${serie()} en ${rango()}`} opciones={todos()} onUsar={props.onUsar} desactivado={props.desactivado} />
              </ListaValores>
            </Show>
          </>
        )}
      </Show>
    </div>
  )
}
