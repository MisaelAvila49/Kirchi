import { createSignal, For, Index, Show } from 'solid-js'
import { capturarCombinacion, type Atajos } from '../editor/teclado'
import { agregarTecla, gruposDeConfig, quitarTecla, restaurarComando } from './configAtajos'
import { GrupoConfig } from './ControlesConfig'
import { partirCombinacion } from './hojaDeAtajos'

interface Props {
  atajos: Atajos
  /** Versión del registro de la ventana: sube cada vez que se recargan las teclas (también desde los ajustes). */
  version?: () => number
  /** Las teclas cambiaron: la ventana guarda `atajos.propiasActuales()` en los ajustes. */
  onCambio(): void
  /** Al abrir Configuración desde la hoja de atajos: el foco entra en el buscador de esta sección. */
  autofoco?: boolean
}

/** Lo que dice la fila en captura: esperando, una reservada, o un conflicto por resolver. */
type Captura = { id: string; mensaje: string | null; conflicto: { comb: string; texto: string; restaurar?: boolean } | null }

/**
 * Configuración → Atajos: búsqueda, teclas como chips, «Agregar» captura una combinación, aviso de conflicto con Reemplazar o Cancelar.
 */
export default function SeccionAtajos(props: Props) {
  const [filtro, setFiltro] = createSignal('')
  // El registro no es reactivo: la versión sube con cada cambio y rehace las filas.
  const [version, setVersion] = createSignal(0)
  const [captura, setCaptura] = createSignal<Captura | null>(null)
  const grupos = () => {
    void version()
    void props.version?.()
    return gruposDeConfig(props.atajos, filtro())
  }
  /** Devuelve el foco al «Agregar» de un comando (la fila se volvió a crear o el aviso se cerró). */
  const enfocarAgregar = (id: string) => queueMicrotask(() => document.querySelector<HTMLElement>(`.config-atajos [data-comando="${id}"]`)?.focus())
  /** Rehace las filas y, si se dice de qué comando, devuelve el foco a su «Agregar». */
  const cambio = (id?: string) => {
    setVersion((v) => v + 1)
    props.onCambio()
    if (id) enfocarAgregar(id)
  }
  /** Lleva el foco a «Cancelar» del aviso de conflicto: la opción segura, y quien usa teclado o lector lo encuentra al instante. */
  const enfocarCancelar = () => queueMicrotask(() => document.querySelector<HTMLElement>('.config-aviso [data-cancelar]')?.focus())
  /** Lo que la región viva anuncia: la espera de la captura, un motivo o el conflicto con sus opciones. */
  const anuncio = () => {
    const c = captura()
    if (!c) return ''
    if (c.conflicto) return `${c.conflicto.texto} Reemplazar o Cancelar.`
    return c.mensaje ?? 'Pulsa la combinación nueva. Escape cancela.'
  }
  const cancelar = (id: string) => {
    setCaptura(null)
    enfocarAgregar(id)
  }
  const agregar = (id: string, comb: string, reemplazar = false) => {
    const r = agregarTecla(props.atajos, id, comb, reemplazar)
    if (r.tipo === 'conflicto') {
      setCaptura({ id, mensaje: null, conflicto: { comb, texto: r.texto } })
      enfocarCancelar()
    } else if (r.tipo === 'llena') setCaptura({ id, mensaje: r.texto, conflicto: null })
    else {
      setCaptura(null)
      if (r.tipo === 'hecho') cambio(id)
    }
  }
  /** «Restaurar» de un comando: si otro tomó una de sus teclas de fábrica, pregunta antes de quitársela. */
  const restaurar = (id: string, reemplazar = false) => {
    const r = restaurarComando(props.atajos, id, reemplazar)
    if (r.tipo === 'conflicto') {
      setCaptura({ id, mensaje: null, conflicto: { comb: '', texto: `${r.texto} Restaurar se la quita.`, restaurar: true } })
      enfocarCancelar()
    } else {
      setCaptura(null)
      cambio(id)
    }
  }
  const tecla = (id: string) => (e: KeyboardEvent) => {
    const c = captura()
    if (!c || c.id !== id || c.conflicto) return
    // Tab sale de la captura y mueve el foco como siempre.
    if (e.key === 'Tab') {
      setCaptura(null)
      return
    }
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') {
      setCaptura(null)
      return
    }
    const r = capturarCombinacion(e)
    if (!r) return
    if ('reservada' in r) setCaptura({ id, mensaje: r.reservada, conflicto: null })
    else agregar(id, r.combinacion)
  }
  return (
    <div class="config-atajos">
      <input class="campo cfg-buscar" type="search" data-autofoco={props.autofoco ? '' : undefined} placeholder="Buscar un comando o una tecla…" aria-label="Buscar un comando o una tecla" value={filtro()} onInput={(e) => setFiltro(e.currentTarget.value)} />
      {/* Anuncia el inicio de la captura a quien usa lector de pantalla; el botón además cambia de texto. */}
      <p class="solo-lectores" role="status" aria-live="polite">
        {anuncio()}
      </p>
      <div class="config-atajos-lista">
        <Index each={grupos()}>
          {(g) => (
            <GrupoConfig titulo={g().nombre}>
              <Index each={g().filas}>
                {(f) => (
                  <div class="config-fila">
                    <span class="config-nombre">{f().nombre}</span>
                    <span class="config-teclas">
                      <Index each={f().teclas}>
                        {(t) => (
                          <span class="chip-tecla">
                            <For each={partirCombinacion(t())}>{(k) => <kbd>{k}</kbd>}</For>
                            <button type="button" class="boton-icono" aria-label={`Quitar ${t()} de ${f().nombre}`} onClick={() => (quitarTecla(props.atajos, f().id, t()), cambio(f().id))}>
                              ×
                            </button>
                          </span>
                        )}
                      </Index>
                      <Show when={f().teclas.length === 0}>
                        <span class="secundario">sin tecla</span>
                      </Show>
                    </span>
                    <span class="config-acciones">
                      <button
                        type="button"
                        class="boton"
                        data-comando={f().id}
                        aria-pressed={captura()?.id === f().id}
                        aria-label={captura()?.id === f().id && !captura()?.conflicto ? `Pulsa la combinación para ${f().nombre}. Escape cancela` : `Agregar una tecla a ${f().nombre}`}
                        on:keydown={(e) => tecla(f().id)(e)}
                        onBlur={() => captura()?.id === f().id && !captura()?.conflicto && setCaptura(null)}
                        onClick={() => setCaptura({ id: f().id, mensaje: null, conflicto: null })}
                      >
                        {captura()?.id === f().id && !captura()?.conflicto ? 'Pulsa la combinación… (Esc cancela)' : 'Agregar'}
                      </button>
                      <Show when={f().propio}>
                        <button type="button" class="boton" aria-label={`Restaurar las teclas de ${f().nombre}`} onClick={() => restaurar(f().id)}>
                          Restaurar
                        </button>
                      </Show>
                    </span>
                    <Show when={captura()?.id === f().id && (captura()?.mensaje || captura()?.conflicto)}>
                      {/* Sin role=status: el texto ya lo anuncia la región viva de arriba (un status que nace con texto no se lee). Esc aquí es Cancelar y no cierra el diálogo. */}
                      <p
                        class="config-aviso"
                        on:keydown={(e) => {
                          if (e.key !== 'Escape') return
                          e.preventDefault()
                          e.stopPropagation()
                          cancelar(f().id)
                        }}
                      >
                        {captura()?.conflicto?.texto ?? captura()?.mensaje}
                        <Show when={captura()?.conflicto}>
                          {(c) => (
                            <>
                              {' '}
                              <button type="button" class="boton" onClick={() => (c().restaurar ? restaurar(f().id, true) : agregar(f().id, c().comb, true))}>
                                Reemplazar
                              </button>{' '}
                              <button type="button" class="boton" data-cancelar onClick={() => cancelar(f().id)}>
                                Cancelar
                              </button>
                            </>
                          )}
                        </Show>
                      </p>
                    </Show>
                  </div>
                )}
              </Index>
            </GrupoConfig>
          )}
        </Index>
        <Show when={grupos().length === 0}>
          <p class="secundario">Ningún comando coincide.</p>
        </Show>
      </div>
      <button type="button" class="boton" onClick={() => (props.atajos.restaurar(), setCaptura(null), cambio())}>
        Restaurar todos los atajos
      </button>
    </div>
  )
}
