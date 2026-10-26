import { For, Match, Show, Switch } from 'solid-js'
import type { Nodo } from '../calculadoras/formula'

/**
 * Ecuación dibujada como fórmula (fracciones con CSS). Solo se ve: quien la contiene pone `role="math"` con la ecuación en palabras y esconde esto con `aria-hidden`.
 */

/** Los nodos agrupados: lo que va pegado (2π, ln 3) forma un grupo y cada operador queda aparte, así el renglón parte donde conviene. */
function grupos(nodos: readonly Nodo[]): Nodo[][] {
  const out: Nodo[][] = []
  let actual: Nodo[] = []
  const cerrar = () => {
    if (actual.length) out.push(actual)
    actual = []
  }
  for (const n of nodos) {
    if (n.t === 'op') {
      cerrar()
      out.push([n])
    } else actual.push(n)
  }
  cerrar()
  return out
}

function Pieza(props: { n: Nodo }) {
  return (
    <Switch>
      <Match when={props.n.t === 'num' && props.n}>
        {(n) => (
          <span class="f-n cifra">
            {n().negativo ? '−' : ''}
            {n().cifra}
            <Show when={n().unidad}>{(u) => <span class="f-u">{` ${u()}`}</span>}</Show>
          </span>
        )}
      </Match>
      <Match when={props.n.t === 'var' && props.n}>
        {(n) => (
          <i class="f-v">
            {n().base}
            <Show when={n().sub}>{(s) => <sub>{s()}</sub>}</Show>
          </i>
        )}
      </Match>
      <Match when={props.n.t === 'pi'}>
        <i class="f-v">π</i>
      </Match>
      <Match when={props.n.t === 'op' && props.n}>
        {(n) => <span classList={{ 'f-op': !n().unario, 'f-signo': !!n().unario }}>{n().op}</span>}
      </Match>
      <Match when={props.n.t === 'frac' && props.n}>
        {(n) => (
          <span class="f-frac">
            <span class="f-arriba">
              <Fila nodos={n().num} />
            </span>
            <span class="f-abajo">
              <Fila nodos={n().den} />
            </span>
          </span>
        )}
      </Match>
      <Match when={props.n.t === 'raiz' && props.n}>
        {(n) => (
          <span class="f-raiz">
            <span class="f-radical">√</span>
            <span class="f-radicando">
              <Fila nodos={n().hijos} />
            </span>
          </span>
        )}
      </Match>
      <Match when={props.n.t === 'par' && props.n}>
        {(n) => (
          <span class="f-par-grupo">
            <span class="f-par">(</span>
            <Fila nodos={n().hijos} />
            <span class="f-par">)</span>
          </span>
        )}
      </Match>
      <Match when={props.n.t === 'fn' && props.n}>
        {(n) => (
          <span class="f-fn">
            <span class="f-fn-nombre">{n().nombre}</span>
            <Pieza n={n().arg} />
          </span>
        )}
      </Match>
    </Switch>
  )
}

/** Un renglón de nodos que puede partirse en un operador si no cabe. */
export function Fila(props: { nodos: readonly Nodo[] }) {
  return (
    <span class="f-fila">
      <For each={grupos(props.nodos)}>
        {(g) => (
          <span class="f-grupo">
            <For each={g}>{(n) => <Pieza n={n} />}</For>
          </span>
        )}
      </For>
    </span>
  )
}

export default function Formula(props: { nodos: readonly Nodo[] }) {
  return (
    <span class="formula" aria-hidden="true">
      <Fila nodos={props.nodos} />
    </span>
  )
}
