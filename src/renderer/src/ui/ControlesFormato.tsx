import { createEffect, createSignal, For, on, Show } from 'solid-js'
import { ALINEACIONES, CONTORNOS, FUENTES, leerPt, mmAPt, ptAMm, NOMBRE_ALINEACION, NOMBRE_CONTORNO, nombreContorno, NOMBRE_FUENTE, NOMBRE_TINTA, SERIE_TAM, textoPt, TINTAS, type Alineacion, type Contorno } from '../doc/formato'
import { IconoAlinear } from './iconos'
import type { OrdenFormato, VistaFormato } from './vistaFormato'

interface Props {
  vista: VistaFormato
  onOrden(o: OrdenFormato): void
  /** «barra»: en un renglón, el tamaño como lista; «inspector»: con rótulos, el tamaño como campo con validación. */
  variante: 'barra' | 'inspector'
  /** Atajo de cada orden (del registro de atajos), para el globo de los botones. */
  teclas?(id: string): string | undefined
  /** Pasa el foco al lienzo (la barra lo usa tras elegir con el puntero en una lista). */
  alCanvas?(): void
  /** Qué se está formateando (los ids seleccionados): al cambiar, el campo de tamaño descarta lo que se estaba escribiendo. */
  clave?: string
}

const pulsado = (v: boolean | 'mixto') => (v === 'mixto' ? 'mixed' : v ? 'true' : 'false')
const conAtajo = (nombre: string, t?: string) => (t ? `${nombre} (${t})` : nombre)

/** Campo de tamaño en pt (2.8 a 56.7): el documento guarda mm. Enter o salir aplica, Esc regresa. */
export function CampoPt(props: { valor: number | 'varios'; clave?: string; onAplicar(pt: number): void; id?: string }) {
  const id = props.id ?? 'formato-pt'
  const mostrado = () => (props.valor === 'varios' ? '' : String(mmAPt(props.valor)))
  const [texto, setTexto] = createSignal(mostrado())
  const [error, setError] = createSignal<string | null>(null)
  createEffect(on(() => [props.valor, props.clave], () => (setTexto(mostrado()), setError(null)), { defer: true }))
  const aplicar = () => {
    if (texto() === mostrado()) return setError(null)
    const r = leerPt(texto())
    if ('error' in r) return setError(r.error)
    setError(null)
    props.onAplicar(r.pt)
  }
  return (
    <div class="fld fld-campo">
      <label for={id}>Tamaño (pt)</label>
      <input
        id={id}
        class="campo cifra"
        type="text"
        inputmode="decimal"
        value={texto()}
        placeholder={props.valor === 'varios' ? 'varios' : undefined}
        aria-invalid={error() ? 'true' : undefined}
        aria-describedby={`${id}-ayuda`}
        onInput={(e) => setTexto(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            aplicar()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setTexto(mostrado())
            setError(null)
          }
        }}
        onBlur={aplicar}
      />
      <p id={`${id}-ayuda`} class={error() ? 'campo-error' : 'campo-ayuda'} aria-live="polite">
        {error() ?? 'pt, de 2.8 a 56.7'}
      </p>
    </div>
  )
}

/**
 * Controles de formato de notas y etiquetas, compartidos por la barra flotante y el inspector. Con textos distintos muestran el estado mixto.
 */
export default function ControlesFormato(props: Props) {
  const t = (id: string) => props.teclas?.(id)
  const opcionesTam = () => {
    const v = props.vista.tam
    return [...new Set([...SERIE_TAM, ...(v === 'varios' ? [] : [v])])].sort((a, b) => a - b)
  }
  // Elegir en una lista con el puntero devuelve el foco al lienzo; con el teclado (flechas) el foco se queda para seguir probando.
  let conPuntero = false
  const tras = () => {
    if (conPuntero) props.alCanvas?.()
    conPuntero = false
  }
  const fuente = (
    <select
      class="campo"
      aria-label="Fuente"
      value={props.vista.fuente === 'varios' ? '' : props.vista.fuente}
      onPointerDown={() => (conPuntero = true)}
      onChange={(e) => {
        const f = e.currentTarget.value as (typeof FUENTES)[number]
        if (f && f !== props.vista.fuente) props.onOrden({ tipo: 'parche', parche: { fuente: f }, control: 'fuente' })
        tras()
      }}
    >
      <Show when={props.vista.fuente === 'varios'}>
        <option value="" disabled>
          varias
        </option>
      </Show>
      <For each={FUENTES}>{(f) => <option value={f}>{NOMBRE_FUENTE[f]}</option>}</For>
    </select>
  )
  const contorno = (
    <select
      class="campo"
      aria-label="Contorno"
      value={props.vista.contorno === 'varios' ? '' : props.vista.contorno}
      onPointerDown={() => (conPuntero = true)}
      onChange={(e) => {
        const c = e.currentTarget.value as Contorno
        if (c && c !== props.vista.contorno) props.onOrden({ tipo: 'parche', parche: { contorno: c }, control: 'contorno' })
        tras()
      }}
    >
      <Show when={props.vista.contorno === 'varios'}>
        <option value="" disabled>
          varios
        </option>
      </Show>
      <For each={CONTORNOS}>{(c) => <option value={c}>{c === 'auto' || c === 'ninguno' ? nombreContorno(c, props.vista.notas, props.vista.etiquetas) : `Contorno ${NOMBRE_CONTORNO[c].toLowerCase()}`}</option>}</For>
    </select>
  )
  const estilos = (
    <div class="seg formato-estilos" role="group" aria-label="Estilo">
      <button type="button" aria-label="Negrita" title={conAtajo('Negrita', t('negrita'))} aria-pressed={pulsado(props.vista.negrita)} onClick={() => props.onOrden({ tipo: 'alternar', prop: 'negrita' })}>
        <b>N</b>
      </button>
      <button type="button" aria-label="Cursiva" title={conAtajo('Cursiva', t('cursiva'))} aria-pressed={pulsado(props.vista.cursiva)} onClick={() => props.onOrden({ tipo: 'alternar', prop: 'cursiva' })}>
        <i>K</i>
      </button>
      <button type="button" aria-label="Subrayado" title={conAtajo('Subrayado', t('subrayado'))} aria-pressed={pulsado(props.vista.subrayado)} onClick={() => props.onOrden({ tipo: 'alternar', prop: 'subrayado' })}>
        <u>S</u>
      </button>
    </div>
  )
  const ids: Record<Alineacion, string> = { izq: 'alinear-izq', centro: 'alinear-centro', der: 'alinear-der', just: 'justificar' }
  const alineacion = (
    <Show when={props.vista.alinear !== null}>
      <div class="seg" role="group" aria-label="Alineación">
        <For each={ALINEACIONES}>
          {(a) => (
            <button
              type="button"
              aria-label={NOMBRE_ALINEACION[a]}
              title={conAtajo(NOMBRE_ALINEACION[a], t(ids[a]))}
              aria-pressed={props.vista.alinear === a ? 'true' : 'false'}
              onClick={() => props.onOrden({ tipo: 'parche', parche: { alinear: a }, control: 'alinear' })}
            >
              <IconoAlinear como={a} />
            </button>
          )}
        </For>
      </div>
    </Show>
  )
  const tintas = (
    <div class="tintas" role="group" aria-label="Color">
      <For each={TINTAS}>
        {(tinta) => (
          <button
            type="button"
            class="tinta"
            aria-label={NOMBRE_TINTA[tinta]}
            title={NOMBRE_TINTA[tinta]}
            aria-pressed={props.vista.tinta === tinta ? 'true' : 'false'}
            onClick={() => props.onOrden({ tipo: 'parche', parche: { tinta }, control: 'tinta' })}
          >
            <span style={{ background: `var(--texto-${tinta})` }} />
          </button>
        )}
      </For>
    </div>
  )
  return (
    <Show
      when={props.variante === 'inspector'}
      fallback={
        <>
          {fuente}
          <select
            class="campo cifra formato-tam"
            aria-label="Tamaño de letra"
            value={props.vista.tam === 'varios' ? '' : String(props.vista.tam)}
            onPointerDown={() => (conPuntero = true)}
            onChange={(e) => {
              const mm = Number(e.currentTarget.value)
              if (e.currentTarget.value && mm !== props.vista.tam) props.onOrden({ tipo: 'parche', parche: { tam: mm }, control: 'tam' })
              tras()
            }}
          >
            <Show when={props.vista.tam === 'varios'}>
              <option value="" disabled>
                varios
              </option>
            </Show>
            <For each={opcionesTam()}>{(mm) => <option value={String(mm)}>{textoPt(mm)}</option>}</For>
          </select>
          {estilos}
          {alineacion}
          {tintas}
          {contorno}
        </>
      }
    >
      <div class="fld">
        <span class="secundario">Fuente</span>
        {fuente}
      </div>
      <CampoPt valor={props.vista.tam} clave={props.clave} onAplicar={(pt) => props.onOrden({ tipo: 'parche', parche: { tam: ptAMm(pt) } })} />
      <div class="fld">
        <span class="secundario">Estilo</span>
        {estilos}
      </div>
      <Show when={props.vista.alinear !== null}>
        <div class="fld">
          <span class="secundario">Alineación</span>
          {alineacion}
        </div>
      </Show>
      <div class="fld">
        <span class="secundario">Color</span>
        {tintas}
      </div>
      <div class="fld">
        <span class="secundario">Contorno</span>
        {contorno}
      </div>
    </Show>
  )
}
