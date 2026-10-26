import { createEffect, Match, on, Show, Switch } from 'solid-js'
import { Deslizador, Escalonador, Interruptor, Pastillas, Tonos } from '../editor/controles'
import { TONOS_RAPIDOS } from '../editor/edicion'
import { IconoBorrar, IconoNegrita } from '../editor/iconosEditor'
import { GROSOR_RANGO, TAM_LLAMADA_RANGO, TAM_TEXTO_RANGO, numeroDe, type FormaResalte, type MagnitudLectura, type NotaEsquema, type Notas, type Parche, type PuntaFlecha } from './notasEsquema'

/** Cambia una nota; `clave` junta los cambios de un mismo arrastre en un solo paso de deshacer. */
export type EditarNota = (id: string, parche: Parche, clave?: string) => void

interface Props {
  nota: NotaEsquema
  editar: EditarNota
  onBorrar(): void
}

const clave = (n: NotaEsquema, k: string) => `nota:${n.id}:${k}`

function Borrar(props: { onBorrar(): void }) {
  return (
    <button type="button" class="boton-icono" aria-label="Borrar" title="Borrar (Supr)" onClick={props.onBorrar}>
      <IconoBorrar />
    </button>
  )
}

/** Barra chica junto a la nota elegida. Llama a las mismas operaciones que el panel de la derecha. */
export function BarraNota(props: Props) {
  const n = () => props.nota
  const ed = (p: Parche, k: string) => props.editar(n().id, p, clave(n(), k))
  /** La nota ya elegida como su tipo: se lee dentro de cada rama, así editarla no rehace la barra (el foco se queda). */
  const como = <T extends NotaEsquema['tipo']>() => n() as Extract<NotaEsquema, { tipo: T }>
  const tamañoTexto = (q: () => { tam: number }) => (
    <Escalonador nombre="Tamaño" texto={`${q().tam}`} menosOff={q().tam <= TAM_TEXTO_RANGO[0]} masOff={q().tam >= TAM_TEXTO_RANGO[1]} onMenos={() => ed({ tam: q().tam - 1 }, 'tam')} onMas={() => ed({ tam: q().tam + 1 }, 'tam')} />
  )
  const negrita = (q: () => { negrita: boolean }) => (
    <button type="button" class="boton-icono" aria-pressed={q().negrita} aria-label="Negrita" title="Negrita" onClick={() => ed({ negrita: !q().negrita }, 'negrita')}>
      <IconoNegrita />
    </button>
  )
  const grosor = (q: () => { grosor: number }) => (
    <Escalonador nombre="Grosor" texto={`${q().grosor} px`} menosOff={q().grosor <= GROSOR_RANGO[0]} masOff={q().grosor >= GROSOR_RANGO[1]} onMenos={() => ed({ grosor: q().grosor - 1 }, 'grosor')} onMas={() => ed({ grosor: q().grosor + 1 }, 'grosor')} />
  )
  const cuerpo = () => (
    <Switch>
      <Match when={n().tipo === 'texto'}>
        {tamañoTexto(como<'texto'>)}
        {negrita(como<'texto'>)}
      </Match>
      <Match when={n().tipo === 'llamada'}>
        <Escalonador nombre="Tamaño" texto={`${como<'llamada'>().tam}`} menosOff={como<'llamada'>().tam <= TAM_LLAMADA_RANGO[0]} masOff={como<'llamada'>().tam >= TAM_LLAMADA_RANGO[1]} onMenos={() => ed({ tam: como<'llamada'>().tam - 2 }, 'tam')} onMas={() => ed({ tam: como<'llamada'>().tam + 2 }, 'tam')} />
      </Match>
      <Match when={n().tipo === 'flecha'}>{grosor(como<'flecha'>)}</Match>
      <Match when={n().tipo === 'resalte'}>
        {grosor(como<'resalte'>)}
        <button type="button" class="boton-icono" aria-pressed={como<'resalte'>().relleno} aria-label="Relleno claro" title="Relleno claro" onClick={() => ed({ relleno: !como<'resalte'>().relleno }, 'relleno')}>
          <span class="editor-relleno" aria-hidden="true" />
        </button>
      </Match>
      <Match when={n().tipo === 'lectura'}>
        <Pastillas<MagnitudLectura> nombre="Qué mide la etiqueta" valor={como<'lectura'>().magnitud} opciones={MAGNITUDES} onCambiar={(v) => ed({ magnitud: v }, 'magnitud')} />
        {tamañoTexto(como<'lectura'>)}
        {negrita(como<'lectura'>)}
      </Match>
    </Switch>
  )
  return (
    <div class="editor-barra" role="toolbar" aria-label="Lo más usado de lo elegido" data-tipo={n().tipo}>
      {cuerpo()}
      <Tonos nombre="Color" valor={n().tono} tonos={TONOS_RAPIDOS} onElegir={(t) => t && ed({ tono: t }, 'tono')} />
      <Borrar onBorrar={props.onBorrar} />
    </div>
  )
}

const NOMBRE_TIPO: Record<NotaEsquema['tipo'], string> = { texto: 'Texto', flecha: 'Flecha', resalte: 'Resalte', llamada: 'Llamada', lectura: 'Etiqueta de lectura' }
const PUNTAS: readonly (readonly [PuntaFlecha, string])[] = [
  ['cerrada', 'Cerrada'],
  ['abierta', 'Abierta'],
  ['ninguna', 'Sin punta']
]
const FORMAS: readonly (readonly [FormaResalte, string])[] = [
  ['rectangulo', 'Recuadro'],
  ['elipse', 'Círculo']
]
export const MAGNITUDES: readonly (readonly [MagnitudLectura, string])[] = [
  ['voltaje', 'Voltaje'],
  ['corriente', 'Corriente']
]

/** Las propiedades de la nota elegida, en el panel de la derecha. */
export function PanelNota(props: Props & { lista: Notas; enfocarTexto: number }) {
  const n = () => props.nota
  const ed = (p: Parche, k: string) => props.editar(n().id, p, clave(n(), k))
  let textoEl: HTMLInputElement | undefined
  // El campo del texto aparece al elegir la nota: el foco se lleva un instante después de pintarlo.
  createEffect(
    on(
      () => props.enfocarTexto,
      (k) => {
        if (k > 0) setTimeout(() => (textoEl?.focus(), textoEl?.select()), 0)
      },
      { defer: true }
    )
  )
  return (
    <>
      <div class="editor-seccion-cabeza">
        <h3 class="editor-seccion-titulo">{n().tipo === 'llamada' ? `Llamada ${numeroDe(props.lista, n().id)}` : NOMBRE_TIPO[n().tipo]}</h3>
        <Borrar onBorrar={props.onBorrar} />
      </div>
      <Show when={n().tipo === 'texto' && (n() as Extract<NotaEsquema, { tipo: 'texto' }>)}>
        {(t) => (
          <>
            <label class="editor-campo">
              <span class="editor-rotulo">Texto</span>
              <input
                ref={textoEl}
                type="text"
                class="campo"
                maxLength={120}
                value={t().texto}
                onInput={(e) => {
                  const v = e.currentTarget.value
                  if (v.trim() !== '') ed({ texto: v }, 'texto')
                }}
              />
            </label>
            <Deslizador rotulo="Tamaño" min={TAM_TEXTO_RANGO[0]} max={TAM_TEXTO_RANGO[1]} valor={t().tam} texto={`${t().tam} px`} onCambiar={(v) => ed({ tam: v }, 'tam')} />
            <Interruptor rotulo="Negrita" activo={t().negrita} onCambiar={(v) => ed({ negrita: v }, 'negrita')} />
          </>
        )}
      </Show>
      <Show when={n().tipo === 'llamada' && (n() as Extract<NotaEsquema, { tipo: 'llamada' }>)}>
        {(t) => <Deslizador rotulo="Tamaño" min={TAM_LLAMADA_RANGO[0]} max={TAM_LLAMADA_RANGO[1]} paso={2} valor={t().tam} texto={`${t().tam} px`} onCambiar={(v) => ed({ tam: v }, 'tam')} />}
      </Show>
      <Show when={n().tipo === 'flecha' && (n() as Extract<NotaEsquema, { tipo: 'flecha' }>)}>
        {(t) => (
          <>
            <Deslizador rotulo="Grosor" min={GROSOR_RANGO[0]} max={GROSOR_RANGO[1]} valor={t().grosor} texto={`${t().grosor} px`} onCambiar={(v) => ed({ grosor: v }, 'grosor')} />
            <div class="editor-campo">
              <span class="editor-rotulo">Punta</span>
              <Pastillas<PuntaFlecha> nombre="Punta de la flecha" valor={t().punta} opciones={PUNTAS} onCambiar={(v) => ed({ punta: v }, 'punta')} />
            </div>
          </>
        )}
      </Show>
      <Show when={n().tipo === 'resalte' && (n() as Extract<NotaEsquema, { tipo: 'resalte' }>)}>
        {(t) => (
          <>
            <div class="editor-campo">
              <span class="editor-rotulo">Forma</span>
              <Pastillas<FormaResalte> nombre="Forma del resalte" valor={t().forma} opciones={FORMAS} onCambiar={(v) => ed({ forma: v }, 'forma')} />
            </div>
            <Deslizador rotulo="Grosor" min={GROSOR_RANGO[0]} max={GROSOR_RANGO[1]} valor={t().grosor} texto={`${t().grosor} px`} onCambiar={(v) => ed({ grosor: v }, 'grosor')} />
            <Interruptor rotulo="Relleno claro" activo={t().relleno} onCambiar={(v) => ed({ relleno: v }, 'relleno')} />
          </>
        )}
      </Show>
      <Show when={n().tipo === 'lectura' && (n() as Extract<NotaEsquema, { tipo: 'lectura' }>)}>
        {(t) => (
          <>
            <div class="editor-campo">
              <span class="editor-rotulo">Mide</span>
              <Pastillas<MagnitudLectura> nombre="Qué mide la etiqueta" valor={t().magnitud} opciones={MAGNITUDES} onCambiar={(v) => ed({ magnitud: v }, 'magnitud')} />
            </div>
            <Deslizador rotulo="Tamaño" min={TAM_TEXTO_RANGO[0]} max={TAM_TEXTO_RANGO[1]} valor={t().tam} texto={`${t().tam} px`} onCambiar={(v) => ed({ tam: v }, 'tam')} />
            <Interruptor rotulo="Negrita" activo={t().negrita} onCambiar={(v) => ed({ negrita: v }, 'negrita')} />
            <Interruptor rotulo="Mostrar texto" activo={t().mostrarTexto !== false} onCambiar={(v) => ed({ mostrarTexto: v }, 'mostrarTexto')} />
          </>
        )}
      </Show>
      <div class="editor-campo">
        <span class="editor-rotulo">Color</span>
        <Tonos nombre="Color de la nota" valor={n().tono} onElegir={(t) => t && ed({ tono: t }, 'tono')} />
      </div>
    </>
  )
}
