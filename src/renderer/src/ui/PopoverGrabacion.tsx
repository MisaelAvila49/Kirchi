import { createResource, createSignal, For, onCleanup, onMount } from 'solid-js'
import { CALIDADES_GRABACION, QUE_GRABAR, type CalidadGrabacion, type OpcionesGrabacion, type QueGrabar } from '../../../compartido/ajustes'
import { listarMicrofonos, SIN_MICROFONO, TEXTO_TAMAÑO_POR_MINUTO, type OpcionMicrofono } from '../grabacion/textos'

const NOMBRE_QUE: Record<QueGrabar, string> = { ventana: 'Ventana de Kirchi', lienzo: 'Solo el lienzo' }
const NOMBRE_CALIDAD: Record<CalidadGrabacion, string> = { '720p': '720p', '1080p': '1080p', real: 'Tamaño real' }

interface Props {
  /** Esquina superior izquierda del panel, bajo el botón que lo abrió. */
  x: number
  y: number
  opciones: OpcionesGrabacion
  onCambiar(parche: Partial<OpcionesGrabacion>): void
  onEmpezar(): void
  /** `devolverFoco`: se cerró con Esc y el foco vuelve al botón. */
  onCerrar(devolverFoco: boolean): void
  /** Los micrófonos del sistema; las pruebas dan los suyos. */
  microfonos?: () => Promise<OpcionMicrofono[]>
}

/** Opciones de Grabar. Cada cambio se guarda al momento; «Empezar a grabar» cierra el panel y arranca. */
export default function PopoverGrabacion(props: Props) {
  let caja!: HTMLDivElement
  const [pos, setPos] = createSignal({ left: props.x, top: props.y })
  const [lista] = createResource(() => (props.microfonos ?? listarMicrofonos)().catch(() => [] as OpcionMicrofono[]))
  const microfonos = () => lista() ?? []
  // Un micrófono guardado que ya no está conectado se muestra como «Sin micrófono» (el ajuste no se toca hasta que se elija otro).
  const elegido = () => (props.opciones.microfono && microfonos().some((m) => m.id === props.opciones.microfono) ? props.opciones.microfono : '')

  onMount(() => {
    const r = caja.getBoundingClientRect()
    setPos({ left: Math.max(8, Math.min(props.x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(props.y, window.innerHeight - r.height - 8)) })
    caja.querySelector<HTMLElement>('input[type="radio"]:checked, input')?.focus()
    // Un clic fuera lo cierra; el del botón que lo abrió lo cierra él mismo.
    const fuera = (e: PointerEvent) => {
      const en = e.target as Element | null
      if (caja.contains(en) || en?.closest?.('[data-comando="grabar"], [data-grabar-flecha]')) return
      props.onCerrar(false)
    }
    document.addEventListener('pointerdown', fuera, true)
    window.addEventListener('blur', cerrarSinFoco)
    onCleanup(() => {
      document.removeEventListener('pointerdown', fuera, true)
      window.removeEventListener('blur', cerrarSinFoco)
    })
  })
  const cerrarSinFoco = () => props.onCerrar(false)

  return (
    <div
      ref={caja}
      class="popover-grabacion"
      role="dialog"
      aria-label="Opciones de grabación"
      style={{ left: `${pos().left}px`, top: `${pos().top}px` }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        props.onCerrar(true)
      }}
    >
      <fieldset class="opciones">
        <legend>Qué se graba</legend>
        <For each={QUE_GRABAR}>
          {(q) => (
            <label class="opcion">
              <input type="radio" name="grabacion-que" value={q} checked={props.opciones.que === q} onChange={() => props.onCambiar({ que: q })} />
              {NOMBRE_QUE[q]}
            </label>
          )}
        </For>
      </fieldset>
      <fieldset class="opciones">
        <legend>Calidad</legend>
        <For each={CALIDADES_GRABACION}>
          {(c) => (
            <label class="opcion">
              <input type="radio" name="grabacion-calidad" value={c} checked={props.opciones.calidad === c} onChange={() => props.onCambiar({ calidad: c })} />
              {NOMBRE_CALIDAD[c]}
            </label>
          )}
        </For>
      </fieldset>
      <label class="campo-grabacion">
        <span>Micrófono</span>
        <select value={elegido()} onChange={(e) => props.onCambiar({ microfono: e.currentTarget.value || null })}>
          <option value="" selected={elegido() === ''}>
            {SIN_MICROFONO}
          </option>
          <For each={microfonos()}>
            {(m) => (
              <option value={m.id} selected={elegido() === m.id}>
                {m.etiqueta}
              </option>
            )}
          </For>
        </select>
      </label>
      <label class="opcion">
        <input type="checkbox" checked={props.opciones.resaltarClics} onChange={(e) => props.onCambiar({ resaltarClics: e.currentTarget.checked })} />
        Resaltar los clics del ratón
      </label>
      <p class="secundario nota-dialogo">{TEXTO_TAMAÑO_POR_MINUTO}</p>
      <button type="button" class="boton principal" onClick={() => props.onEmpezar()}>
        ● Empezar a grabar
      </button>
    </div>
  )
}
