import { For, Show } from 'solid-js'
import { estiloCapa, pinturaDe, type Pintura, type UsoIcono } from './pintar'
import { TRAZOS, type NombreIcono, type Trazo } from './trazos'

const TRAZO: Pintura = { variante: 'trazo', capas: null }

/**
 * Icono de 16 × 16 de la cinta, sin lectura ni foco. Con `uso` es el dibujo plano; sin él, el trazo en el color del texto. Colores por `data-h` y `data-h2` (colores.css).
 */
export default function IconoCinta(props: { nombre: NombreIcono; class?: string; uso?: UsoIcono }) {
  const t = (): Trazo => TRAZOS[props.nombre]
  const p = (): Pintura => (props.uso ? pinturaDe(props.nombre, props.uso) : TRAZO)
  const clase = () => {
    const v = p().variante
    return ['icono', v === 'trazo' ? '' : v, v !== 'plano' && t().relleno ? 'relleno' : '', props.class ?? ''].filter(Boolean).join(' ')
  }
  return (
    <svg class={clase()} viewBox="0 0 16 16" aria-hidden="true" data-icono={props.nombre} data-h={p().h} data-h2={p().h2}>
      <Show
        when={p().capas}
        fallback={
          <>
            <path d={t().d} />
            <For each={t().circulos ?? []}>{(c) => <circle cx={c[0]} cy={c[1]} r={c[2]} />}</For>
          </>
        }
      >
        {(capas) => <For each={capas()}>{(c) => <path d={c.d} style={estiloCapa(c)} />}</For>}
      </Show>
    </svg>
  )
}
