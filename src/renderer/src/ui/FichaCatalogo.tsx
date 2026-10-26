import { createSignal, Show, type JSX } from 'solid-js'
import { leerValor, formatearValor } from '../valores/valores'
import { vistaCatalogo } from '../valores/vistaSerie'
import FilasValores from './FilasValores'
import ListaValores from './ListaValores'

interface Props {
  /** Lo que dice el campo del valor ahora. */
  texto: string
  unidad: string
  /** Los valores de catálogo (`comunes`). */
  comunes: readonly string[]
  /** Escribe un valor en el campo y lo aplica. */
  onUsar(texto: string): void
  desactivado?: boolean
  /** El campo libre (el que el llamador ya tiene): solo se ve en «Más ajustes» cuando el valor es Personalizado. */
  children: JSX.Element
}

/** El valor del catálogo más cercano (por razón) a un texto; el primero si el texto no se lee. */
export function masCercanoDelCatalogo(texto: string, comunes: readonly string[]): string {
  const v = leerValor(texto)
  if (!v || !(v.valor > 0)) return comunes[0]
  let mejor = comunes[0]
  for (const c of comunes) if (Math.abs(Math.log(leerValor(c)!.valor / v.valor)) < Math.abs(Math.log(leerValor(mejor)!.valor / v.valor))) mejor = c
  return mejor
}

/**
 * Catálogo de una propiedad numérica. Un `.kir` viejo con un valor fuera del catálogo abre como Personalizado con ese mismo valor.
 */
export default function FichaCatalogo(props: Props) {
  const v = () => vistaCatalogo(props.texto, props.unidad, props.comunes)
  const [forzado, setForzado] = createSignal(false)
  const personalizado = () => forzado() || v().personalizado
  const [abierto, setAbierto] = createSignal(personalizado())
  const marcar = (marcado: boolean) => {
    setForzado(marcado)
    // Al desmarcarla, el valor vuelve al del catálogo más cercano.
    if (!marcado && v().personalizado) props.onUsar(masCercanoDelCatalogo(props.texto, props.comunes))
  }
  const lectura = () => {
    const x = leerValor(props.texto)
    return x ? formatearValor(x.valor, props.unidad) : props.texto
  }
  return (
    <div class="ficha-catalogo">
      <Show when={!personalizado()}>
        <p class="nota-serie" role="status">
          <svg class="nota-serie-icono" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 8.4 6.6 11.4 12.5 5" />
          </svg>
          <span>{lectura()} es un valor comercial del catálogo.</span>
        </p>
      </Show>
      <Show when={personalizado()}>
        <p class="campo-ayuda ficha-catalogo-nota">Personalizado: {lectura()}. Se edita en «Más ajustes».</p>
      </Show>
      <ListaValores titulo="Valores comerciales" detalle={String(v().opciones.length)}>
        <FilasValores etiqueta="Valores del catálogo" opciones={v().opciones} onUsar={props.onUsar} desactivado={props.desactivado} />
      </ListaValores>
      <details class="mas-ajustes" open={abierto()} onToggle={(e) => setAbierto(e.currentTarget.open)}>
        <summary>Más ajustes</summary>
        <label class="casilla ficha-personalizado">
          <input type="checkbox" checked={personalizado()} disabled={props.desactivado} onChange={(e) => marcar(e.currentTarget.checked)} />
          <span>
            <span class="ficha-personalizado-nombre">Personalizado</span> <span class="secundario">(un valor propio en lugar del catálogo)</span>
          </span>
        </label>
        <Show when={personalizado()}>{props.children}</Show>
      </details>
    </div>
  )
}
