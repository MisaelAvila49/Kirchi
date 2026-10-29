import { createEffect, createMemo, createSignal, on, onCleanup, Show } from 'solid-js'
import { formatoCompleto, formatoConCambio, formatoMinimo, siguienteTam, type FormatoCompleto } from '../doc/formato'
import type { FormatoTexto } from '../doc/tipos'
import type { CambioTexto } from '../editor/Editor'
import ControlesFormato from './ControlesFormato'
import type { OrdenFormato, VistaFormato } from './vistaFormato'

interface Props {
  tipo: 'nota' | 'etiqueta'
  /** El texto que se edita: al cambiar, la ficha empieza de nuevo. */
  id: string
  texto: string
  formato: FormatoTexto | undefined
  /** Dibuja el borrador en el lienzo sin tocar el documento; `null` lo quita. */
  onPrevia(id: string, c: CambioTexto | null): void
  /** Aplica en un paso de deshacer; devuelve el error para mostrarlo o null. */
  onAplicar(id: string, c: CambioTexto): string | null
  teclas?(id: string): string | undefined
}

/** El estado de los controles de ControlesFormato para un solo texto. */
function vistaDe(f: FormatoCompleto, tipo: 'nota' | 'etiqueta'): VistaFormato {
  return {
    notas: tipo === 'nota' ? 1 : 0,
    etiquetas: tipo === 'etiqueta' ? 1 : 0,
    fuente: f.fuente,
    tam: f.tam,
    negrita: f.negrita,
    cursiva: f.cursiva,
    subrayado: f.subrayado,
    tinta: f.tinta,
    contorno: f.contorno,
    alinear: tipo === 'nota' ? f.alinear : null,
    tamMayor: null,
    tamMenor: null
  }
}

/**
 * Ficha compacta de una nota o etiqueta de red. Todo es un borrador visible en el lienzo: «Aplicar» lo guarda en un paso de deshacer, «Cancelar» lo descarta.
 */
export default function FichaTexto(props: Props) {
  const etiqueta = props.tipo === 'etiqueta'
  const inicial = () => formatoCompleto(props.formato, props.tipo)
  const [texto, setTexto] = createSignal(props.texto)
  const [fmt, setFmt] = createSignal<FormatoCompleto>(inicial())
  const [error, setError] = createSignal<string | null>(null)
  const cambio = createMemo((): CambioTexto => ({ texto: texto(), formato: fmt() }))
  const sucio = () => texto() !== props.texto || JSON.stringify(formatoMinimo(fmt(), props.tipo)) !== JSON.stringify(formatoMinimo(inicial(), props.tipo))
  // Un texto vacío no se dibuja (haría desaparecer la nota): la vista previa conserva el de antes hasta que haya algo escrito.
  // Al desmontarse, el accesorio ya no se puede leer (Solid avisa «Stale read»): se guarda el último id.
  let ultimoId = props.id
  createEffect(() => {
    const c = cambio()
    ultimoId = props.id
    props.onPrevia(ultimoId, c.texto?.trim() ? c : { formato: c.formato })
  })
  onCleanup(() => props.onPrevia(ultimoId, null))
  // Otro texto, o el mismo cambiado desde fuera (la barra flotante, deshacer): el borrador empieza de nuevo.
  createEffect(on(() => [props.id, props.texto, JSON.stringify(props.formato)], () => (setTexto(props.texto), setFmt(inicial()), setError(null)), { defer: true }))

  const orden = (o: OrdenFormato) => {
    const f = fmt()
    if (o.tipo === 'parche') setFmt(formatoCompleto(formatoConCambio(formatoMinimo(f, props.tipo), o.parche, props.tipo), props.tipo))
    else if (o.tipo === 'alternar') setFmt({ ...f, [o.prop]: !f[o.prop] })
    else setFmt({ ...f, tam: siguienteTam(f.tam, o.dir) })
  }
  const aplicar = () => {
    if (!sucio()) return setError(null)
    setError(props.onAplicar(props.id, { texto: texto(), formato: fmt() }))
  }
  const cancelar = () => {
    setTexto(props.texto)
    setFmt(inicial())
    setError(null)
  }
  const tecla = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelar()
    } else if (e.key === 'Enter' && (etiqueta || e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      aplicar()
    }
  }
  const rotulo = etiqueta ? 'Nombre de la red' : 'Texto de la nota'
  return (
    <div class="ficha-texto" role="group" aria-label={etiqueta ? 'Editar la etiqueta' : 'Editar la nota'}>
      <div class="ficha-texto-campo">
        <label for="ficha-texto-campo">{rotulo}</label>
        <Show
          when={etiqueta}
          fallback={<textarea id="ficha-texto-campo" class="campo" rows={3} value={texto()} aria-invalid={error() ? 'true' : undefined} aria-describedby="ficha-texto-error" onInput={(e) => setTexto(e.currentTarget.value)} onKeyDown={tecla} />}
        >
          <input id="ficha-texto-campo" class="campo" type="text" value={texto()} spellcheck={false} autocomplete="off" aria-invalid={error() ? 'true' : undefined} aria-describedby="ficha-texto-error" onInput={(e) => setTexto(e.currentTarget.value)} onKeyDown={tecla} />
        </Show>
        <p id="ficha-texto-error" class="campo-error" role="alert">
          {error() ?? ''}
        </p>
      </div>
      <ControlesFormato vista={vistaDe(fmt(), props.tipo)} variante="inspector" onOrden={orden} teclas={props.teclas} clave={props.id} />
      <div class="ficha-texto-pie">
        <button type="button" class="boton principal" disabled={!sucio()} onClick={aplicar}>
          Aplicar
        </button>
        <button type="button" class="boton" disabled={!sucio()} onClick={cancelar}>
          Cancelar
        </button>
      </div>
      <p class="ficha-texto-ayuda secundario">
        <kbd>{etiqueta ? 'Enter' : 'Ctrl+Enter'}</kbd> aplica · <kbd>Esc</kbd> cancela
      </p>
    </div>
  )
}
