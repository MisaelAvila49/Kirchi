import { createEffect, createSignal, For, on, Show, untrack, type JSX } from 'solid-js'
import { conservarNumero, etiquetaUnidad, leerCampo, opcionesDeUnidad, partirValor, textoDeCampo } from '../valores/unidades'
import { leerValor } from '../valores/valores'
import { pasoPerilla, textoPerilla } from './perilla'

interface Props {
  /** El texto de la propiedad («4.7k»). */
  texto: string
  /** La unidad base: Ω, F, H, V, A, Hz o s llevan selector; cualquier otra se escribe en el campo como siempre. */
  unidad: string
  /** El rótulo del campo, para el nombre de la lista de unidades («Unidad de Resistencia»). */
  nombre: string
  /** Cada cambio del campo o de la unidad, con el texto que iría en la propiedad (lo escrito tal cual si no es un número solo). */
  onTexto(t: string): void
  /** Enter, salir del campo o un paso de perilla: aplicar lo escrito. */
  onAplicar?(): void
  /** Teclas del campo (Enter y Esc). Enter llega con el texto ya normalizado. */
  onTecla?(e: KeyboardEvent): void
  /** Atributos del campo del número (id, aria, clase). */
  atributos?: JSX.InputHTMLAttributes<HTMLInputElement>
  campo?(el: HTMLInputElement): void
  desactivado?: boolean
  soloLectura?: boolean
  invalido?: boolean
  /** Campo de perilla: flechas y rueda mueven la cifra a la izquierda del cursor, acotado a [min, max], con cuatro cifras. */
  perilla?: { min: number; max: number }
}

const NORMAL: Record<string, string> = { u: 'µ' }
const aAscii = (p: string) => (p === 'µ' ? 'u' : p)
const SOLO_NUMERO = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/

/**
 * Valor con unidad: campo numérico y lista con prefijo y unidad (`4k7` y `4.7 k` siguen valiendo). Elegir otra unidad conserva el número.
 */
export default function CampoValor(props: Props) {
  const opciones = () => opcionesDeUnidad(props.unidad)
  const formato = (valor: number): { numero: string; prefijo: string } => {
    if (props.perilla) {
      const m = /^(-?\d+(?:\.\d+)?)([Mkmun]?)$/.exec(textoPerilla(valor))
      const p = m ? (NORMAL[m[2]] ?? m[2]) : null
      if (m && opciones()?.some((o) => o.prefijo === p)) return { numero: m[1], prefijo: p! }
    }
    return partirValor(valor, props.unidad)
  }
  /** Lo que muestra el campo para un texto de la propiedad; lo que no se lee se deja como está. */
  const derivar = (t: string, prefijo: string): { numero: string; prefijo: string } => {
    const v = leerValor(t)
    if (v && (v.unidad === '' || v.unidad === props.unidad) && opciones()) return formato(v.valor)
    return { numero: t, prefijo }
  }
  const inicial = untrack(() => derivar(props.texto, ''))
  const [numero, setNumero] = createSignal(inicial.numero)
  const [prefijo, setPrefijo] = createSignal(inicial.prefijo)
  let campo!: HTMLInputElement
  let ultimo = props.texto
  let editado = false
  const emitir = (t: string) => {
    ultimo = t
    props.onTexto(t)
  }
  // Un texto que viene de fuera (otro botón, Esc, otra pieza) se vuelve a mostrar; el eco de lo que se acaba de escribir, no.
  createEffect(
    on(
      () => props.texto,
      (t) => {
        if (t === ultimo) return
        ultimo = t
        editado = false
        const d = derivar(t, untrack(prefijo))
        setNumero(d.numero)
        setPrefijo(d.prefijo)
      },
      { defer: true }
    )
  )
  /** Lo escrito se lee y se vuelve a mostrar con el prefijo que lo deja legible; el texto de la propiedad sale de ahí. */
  const normalizar = () => {
    if (!editado || !opciones()) return
    editado = false
    const l = leerCampo(numero(), prefijo(), props.unidad)
    if (!l) return
    const d = formato(l.valor)
    setNumero(d.numero)
    setPrefijo(d.prefijo)
    campo.value = d.numero
    emitir(textoDeCampo(d.numero, d.prefijo))
  }
  const alEscribir = (t: string) => {
    editado = true
    setNumero(t)
    if (!opciones()) return emitir(t)
    if (SOLO_NUMERO.test(t.trim())) return emitir(textoDeCampo(t, prefijo()))
    // «4k7», «4.7 k», «4.7 kΩ»: manda lo escrito y la lista se mueve al prefijo que quiso decir.
    const l = leerCampo(t, prefijo(), props.unidad)
    if (l) setPrefijo(l.prefijo)
    emitir(t)
  }
  const alElegirUnidad = (p: string) => {
    // El número se queda y cambia el valor (4.7 kΩ pasa a 4.7 Ω): se aplica enseguida, no hay nada que esperar.
    const c = conservarNumero(numero(), prefijo(), props.unidad, p)
    if (!c) return setPrefijo(p)
    setNumero(c.numero)
    setPrefijo(c.prefijo)
    campo.value = c.numero
    editado = false
    emitir(c.texto)
    props.onAplicar?.()
  }
  const paso = (dir: 1 | -1) => {
    const p = props.perilla
    if (!p) return
    const r = pasoPerilla(`${numero()}${aAscii(prefijo())}`, campo.selectionStart ?? campo.value.length, dir, p.min, p.max)
    if (!r) return
    const d = formato(r.valor)
    setNumero(d.numero)
    setPrefijo(d.prefijo)
    campo.value = d.numero
    const m = /^(-?\d+(?:\.\d+)?)[Mkmun]?$/.exec(r.texto)
    const largo = m ? m[1].length : r.texto.length
    campo.setSelectionRange(Math.min(r.caret, largo), Math.min(r.caret, largo))
    editado = false
    emitir(r.texto)
    props.onAplicar?.()
  }
  const alTeclear = (e: KeyboardEvent) => {
    if (props.perilla && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      e.stopPropagation()
      return paso(e.key === 'ArrowUp' ? 1 : -1)
    }
    if (e.key === 'Enter') normalizar()
    props.onTecla?.(e)
  }
  return (
    <span class="entrada-valor" classList={{ 'con-unidad-lista': !!opciones() }}>
      <input
        type="text"
        inputmode="decimal"
        spellcheck={false}
        autocomplete="off"
        {...props.atributos}
        class={`campo cifra ${props.atributos?.class ?? ''}`.trim()}
        ref={(el) => {
          campo = el
          props.campo?.(el)
        }}
        value={numero()}
        disabled={props.desactivado}
        readOnly={props.soloLectura}
        aria-invalid={props.invalido ? 'true' : undefined}
        onInput={(e) => alEscribir(e.currentTarget.value)}
        on:keydown={alTeclear}
        on:wheel={(e: WheelEvent) => {
          if (!props.perilla || document.activeElement !== campo) return
          e.preventDefault()
          paso(e.deltaY < 0 ? 1 : -1)
        }}
        onBlur={() => {
          normalizar()
          props.onAplicar?.()
        }}
      />
      <Show when={opciones()} fallback={<Show when={props.unidad}>{(u) => <b class="entrada-unidad" aria-hidden="true">{u()}</b>}</Show>}>
        {(lista) => (
          <span class="unidad-lista">
            <select class="unidad-valor" aria-label={`Unidad de ${props.nombre}`} disabled={props.desactivado || props.soloLectura} onChange={(e) => alElegirUnidad(e.currentTarget.value)}>
              <For each={lista()}>
                {(o) => (
                  <option value={o.prefijo} selected={o.prefijo === prefijo()}>
                    {etiquetaUnidad(o, props.unidad)}
                  </option>
                )}
              </For>
            </select>
            <svg class="unidad-flecha" viewBox="0 0 10 6" aria-hidden="true">
              <path d="M1 1l4 4 4-4" />
            </svg>
          </span>
        )}
      </Show>
    </span>
  )
}
