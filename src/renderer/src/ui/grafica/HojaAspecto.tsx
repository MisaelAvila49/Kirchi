import { For, onMount, type JSX } from 'solid-js'
import { SeccionEjes, SeccionRejilla, SeccionTextos, SeccionTrazas, type PropsAspecto } from './AspectoPanel'

interface Props extends PropsAspecto {
  /** El nombre accesible de la hoja y su título («Aspecto de la pantalla»). */
  titulo: string
  /** Para `aria-controls` del botón que la abre. */
  id: string
  /** Se cierra; `volverFoco` devuelve el foco al botón que la abrió (Esc, Listo o la ×). */
  onCerrar(volverFoco: boolean): void
}

const SECCIONES = [
  { id: 'trazas', nombre: 'Trazas' },
  { id: 'ejes', nombre: 'Ejes' },
  { id: 'rejilla', nombre: 'Rejilla' },
  { id: 'textos', nombre: 'Textos' }
] as const
type IdSeccion = (typeof SECCIONES)[number]['id']

/**
 * Hoja de aspecto: panel lateral de unos 400 px sobre la franja. Los cambios se ven al instante y se guardan con el instrumento o el análisis.
 */
export default function HojaAspecto(props: Props) {
  let cuerpo!: HTMLDivElement
  let cerrarBtn!: HTMLButtonElement
  onMount(() => cerrarBtn.focus({ preventScroll: true }))
  const ir = (id: IdSeccion) => {
    const el = cuerpo.querySelector<HTMLElement>(`#${props.id}-${id}`)
    if (!el) return
    cuerpo.scrollTo({ top: el.offsetTop - cuerpo.offsetTop - 4, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  const seccion = (id: IdSeccion, cuerpoSeccion: JSX.Element) => (
    <section class="hoja-seccion" id={`${props.id}-${id}`} aria-labelledby={`${props.id}-${id}-t`}>
      <h3 id={`${props.id}-${id}-t`} class="hoja-seccion-titulo">
        {SECCIONES.find((s) => s.id === id)!.nombre}
      </h3>
      {cuerpoSeccion}
    </section>
  )
  return (
    <aside
      class="hoja-aspecto"
      id={props.id}
      role="dialog"
      aria-label={props.titulo}
      on:keydown={(e: KeyboardEvent) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        props.onCerrar(true)
      }}
    >
      <div class="hoja-cabeza">
        <h2 class="hoja-titulo">{props.titulo}</h2>
        <button ref={cerrarBtn} type="button" class="boton-icono hoja-cerrar" aria-label="Cerrar el aspecto" onClick={() => props.onCerrar(true)}>
          ×
        </button>
      </div>
      <nav class="hoja-saltos" aria-label="Ir a una sección">
        <For each={SECCIONES}>
          {(s) => (
            <button type="button" class="hoja-salto" onClick={() => ir(s.id)}>
              {s.nombre}
            </button>
          )}
        </For>
      </nav>
      <div class="hoja-cuerpo" ref={cuerpo}>
        {seccion('trazas', <SeccionTrazas {...props} />)}
        {seccion('ejes', <SeccionEjes {...props} />)}
        {seccion('rejilla', <SeccionRejilla {...props} />)}
        {seccion('textos', <SeccionTextos {...props} />)}
      </div>
      <div class="hoja-pie">
        <button type="button" class="boton" onClick={() => props.onRestablecer()}>
          Restablecer
        </button>
        <button type="button" class="boton principal" onClick={() => props.onCerrar(true)}>
          Listo
        </button>
      </div>
    </aside>
  )
}

