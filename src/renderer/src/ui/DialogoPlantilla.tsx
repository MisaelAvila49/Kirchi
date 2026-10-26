import { createSignal, For, Show } from 'solid-js'
import { CATEGORIA_POR_OMISION, LARGO_MAXIMO_NOMBRE, motivoNombreInvalido, type ResultadoPlantilla } from '../../../compartido/plantillas'
import type { VistaPlantilla } from '../plantillas/plantilla'
import { MAX_DESCRIPCION } from '../plantillas/plantilla'
import Dialogo from './Dialogo'
import { MiniaturaPlantilla } from './MiniaturaPlantilla'

export interface DatosPlantilla {
  nombre: string
  categoria: string
  descripcion: string
}

interface Props {
  /** Guardar una selección o copiar una incluida (los tres campos), renombrar (solo el nombre), cambiar de categoría o cambiar la descripción. */
  modo: 'guardar' | 'renombrar' | 'mover' | 'descripcion'
  titulo: string
  /** Texto del botón principal. */
  accion: string
  inicial: DatosPlantilla
  /** Categorías que ya existen, para elegirlas o escribir una nueva. */
  categorias: readonly string[]
  vista?: VistaPlantilla
  /** «4 piezas y 6 cables»: lo que se guarda. */
  resumen?: string
  /** Hace la operación. Con `existe` en la respuesta el diálogo pregunta si se reemplaza. */
  onAceptar(d: DatosPlantilla, reemplazar: boolean): Promise<ResultadoPlantilla>
  onCerrar(): void
}

let siguiente = 0

/** Guardar como plantilla, copiar una incluida o renombrar. Un nombre repetido pregunta antes de reemplazar. */
export default function DialogoPlantilla(props: Props) {
  const id = `plantilla-${++siguiente}`
  const [nombre, setNombre] = createSignal(props.inicial.nombre)
  const [categoria, setCategoria] = createSignal(props.inicial.categoria)
  const [descripcion, setDescripcion] = createSignal(props.inicial.descripcion)
  const [tocado, setTocado] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [repetida, setRepetida] = createSignal(false)
  const [ocupado, setOcupado] = createSignal(false)
  const veNombre = () => props.modo === 'guardar' || props.modo === 'renombrar'
  const veCategoria = () => props.modo === 'guardar' || props.modo === 'mover'
  const veDescripcion = () => props.modo === 'guardar' || props.modo === 'descripcion'
  const motivoNombre = () => (veNombre() ? motivoNombreInvalido(nombre()) : null)
  const motivoCategoria = () => (veCategoria() ? motivoNombreInvalido(categoria(), 'categoría') : null)
  const invalido = () => motivoNombre() ?? motivoCategoria()
  const cambiar = (f: () => void) => {
    f()
    setRepetida(false)
    setError(null)
  }
  const aceptar = async (reemplazar: boolean) => {
    setTocado(true)
    if (invalido() || ocupado()) return
    setOcupado(true)
    try {
      const r = await props.onAceptar({ nombre: nombre(), categoria: categoria(), descripcion: descripcion() }, reemplazar)
      if (r.ok) return
      if (r.existe) setRepetida(true)
      setError(r.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar.')
    } finally {
      setOcupado(false)
    }
  }
  return (
    <Dialogo titulo={props.titulo} clase="plantilla" onCerrar={props.onCerrar}>
      <form
        class="form-plantilla"
        onSubmit={(e) => {
          e.preventDefault()
          void aceptar(repetida())
        }}
      >
        <Show when={props.modo === 'guardar' && props.vista}>
          {(v) => (
            <div class="vista-guardar-plantilla">
              <MiniaturaPlantilla vista={v()} clase="grande" />
              <Show when={props.resumen}>
                <p class="secundario">{props.resumen}</p>
              </Show>
            </div>
          )}
        </Show>
        <Show when={veNombre()}>
          <label class="campo-plantilla" for={`${id}-nombre`}>
            Nombre
          </label>
          <input
            id={`${id}-nombre`}
            class="campo"
            type="text"
            data-autofoco
            autocomplete="off"
            maxlength={LARGO_MAXIMO_NOMBRE + 20}
            value={nombre()}
            aria-invalid={tocado() && motivoNombre() ? 'true' : undefined}
            aria-describedby={`${id}-error`}
            onInput={(e) => cambiar(() => setNombre(e.currentTarget.value))}
          />
        </Show>
        <Show when={veCategoria()}>
          <label class="campo-plantilla" for={`${id}-categoria`}>
            Categoría
          </label>
          <input
            id={`${id}-categoria`}
            class="campo"
            type="text"
            list={`${id}-categorias`}
            autocomplete="off"
            data-autofoco={props.modo === 'mover' ? '' : undefined}
            maxlength={LARGO_MAXIMO_NOMBRE + 20}
            value={categoria()}
            aria-invalid={tocado() && motivoCategoria() ? 'true' : undefined}
            aria-describedby={`${id}-ayuda-categoria ${id}-error`}
            onInput={(e) => cambiar(() => setCategoria(e.currentTarget.value))}
          />
          <datalist id={`${id}-categorias`}>
            <For each={[...new Set([CATEGORIA_POR_OMISION, ...props.categorias])]}>{(c) => <option value={c} />}</For>
          </datalist>
          <p id={`${id}-ayuda-categoria`} class="secundario nota-dialogo">
            Elige una que ya existe o escribe una nueva.
          </p>
        </Show>
        <Show when={veDescripcion()}>
          <label class="campo-plantilla" for={`${id}-descripcion`}>
            Descripción <span class="secundario">(opcional)</span>
          </label>
          <textarea id={`${id}-descripcion`} class="campo area-plantilla" rows="3" maxlength={MAX_DESCRIPCION} data-autofoco={props.modo === 'descripcion' ? '' : undefined} value={descripcion()} onInput={(e) => cambiar(() => setDescripcion(e.currentTarget.value))} />
        </Show>
        <p id={`${id}-error`} class="campo-error" aria-live="polite" aria-atomic="true">
          {error() ?? (tocado() ? invalido() : null) ?? ''}
        </p>
        <div class="dialogo-botones">
          <button type="button" class="boton" onClick={() => props.onCerrar()}>
            Cancelar
          </button>
          {/* Un solo botón: si cambiara de elemento, el foco se perdería y Esc dejaría de cerrar el diálogo. */}
          <button type="submit" class="boton" classList={{ principal: !repetida(), peligro: repetida() }} disabled={ocupado()}>
            {repetida() ? 'Reemplazar' : props.accion}
          </button>
        </div>
      </form>
    </Dialogo>
  )
}
