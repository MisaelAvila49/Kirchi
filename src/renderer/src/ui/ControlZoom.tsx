import { createEffect, createSignal, on } from 'solid-js'
import { ZOOM_MAX, ZOOM_MIN } from '../canvas/camera'
import { leerPorcentaje, siguientePasoZoom, zoomAPorcentaje } from '../lienzo/medidas'
import { RAZON_ZOOM_MAXIMO, RAZON_ZOOM_MINIMO } from './cinta/estado'

interface Props {
  /** Zoom actual en porcentaje, sin redondear. */
  pct: number
  /** Aplica un zoom en porcentaje (alrededor del centro de la vista). */
  onZoom(pct: number): void
  /** Mensaje para la región viva cuando el texto escrito no sirve. */
  onAviso(texto: string): void
  /** Botones − y + como órdenes de la cinta: si existen, el control les deja el paso. */
  onPaso?(dir: 1 | -1, boton: HTMLElement): void
  /** Sin `onPaso`, por qué un botón en el tope no hace nada («Ya está en el zoom máximo.»), solo por la región viva. */
  onAnuncio?(texto: string): void
}

const MIN = zoomAPorcentaje(ZOOM_MIN)
const MAX = zoomAPorcentaje(ZOOM_MAX)
const EPS = 1e-6
const mostrar = (pct: number) => (pct < 1 ? `${pct.toFixed(1)} %` : `${Math.round(pct)} %`)

// Los botones no toman el foco con el mouse: Espacio y los atajos siguen yendo al lienzo.
const sinFoco = (e: MouseEvent) => e.preventDefault()

/** [−] [campo] [+]: pasos de 50 % (de 10 % por debajo de 50) y un campo editable que acepta «150», «150 %» o «150%». */
export default function ControlZoom(props: Props) {
  const [texto, setTexto] = createSignal(mostrar(props.pct))
  const [invalido, setInvalido] = createSignal(false)
  let editando = false
  // Mientras no se escribe, el campo sigue al zoom real (rueda, encuadre, botones).
  createEffect(
    on(
      () => props.pct,
      (p) => {
        if (!editando) setTexto(mostrar(p))
      }
    )
  )
  const paso = (dir: 1 | -1, boton: HTMLElement) => {
    editando = false
    setInvalido(false)
    if (props.onPaso) return props.onPaso(dir, boton)
    // En el tope el botón no se deshabilita (el foco caería al cuerpo de la página): dice por qué no hace nada.
    if (dir > 0 ? props.pct >= MAX - EPS : props.pct <= MIN + EPS) return props.onAnuncio?.(dir > 0 ? RAZON_ZOOM_MAXIMO : RAZON_ZOOM_MINIMO)
    const n = siguientePasoZoom(props.pct, dir, MIN, MAX)
    props.onZoom(n)
    setTexto(mostrar(n))
  }
  const revertir = () => {
    editando = false
    setTexto(mostrar(props.pct))
    setInvalido(false)
  }
  const aplicar = (): boolean => {
    const v = leerPorcentaje(texto())
    if (v === null) {
      setInvalido(true)
      props.onAviso(`«${texto()}» no es un zoom válido: escribe un porcentaje como 150.`)
      return false
    }
    const acotado = Math.min(MAX, Math.max(MIN, v))
    editando = false
    setInvalido(false)
    props.onZoom(acotado)
    setTexto(mostrar(acotado))
    return true
  }
  return (
    <div class="control-zoom" role="group" aria-label="Zoom">
      <button type="button" class="boton" aria-label="Alejar" aria-disabled={props.pct <= MIN + EPS ? 'true' : undefined} onMouseDown={sinFoco} onClick={(e) => paso(-1, e.currentTarget)}>
        −
      </button>
      <input
        class="campo-zoom cifra"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        aria-label="Zoom en porcentaje"
        aria-invalid={invalido() ? 'true' : undefined}
        value={texto()}
        onFocus={(e) => e.currentTarget.select()}
        onInput={(e) => {
          editando = true
          setTexto(e.currentTarget.value)
          setInvalido(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (!editando || aplicar()) e.currentTarget.select()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            revertir()
          }
        }}
        onBlur={() => {
          // Sin haber escrito nada no hay nada que aplicar: el campo solo vuelve a mostrar el zoom real.
          if (!editando) {
            setInvalido(false)
            setTexto(mostrar(props.pct))
            return
          }
          editando = false
          // Al salir se aplica lo escrito si sirve; si no, vuelve al zoom real.
          if (leerPorcentaje(texto()) !== null) aplicar()
          else {
            if (texto().trim() !== '' && texto() !== mostrar(props.pct)) props.onAviso(`«${texto()}» no es un zoom válido; se conserva ${mostrar(props.pct)}.`)
            revertir()
          }
        }}
      />
      <button type="button" class="boton" aria-label="Acercar" aria-disabled={props.pct >= MAX - EPS ? 'true' : undefined} onMouseDown={sinFoco} onClick={(e) => paso(1, e.currentTarget)}>
        +
      </button>
    </div>
  )
}
