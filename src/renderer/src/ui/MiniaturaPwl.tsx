import { createMemo, For, Show } from 'solid-js'
import { leerPuntosPwl } from '../valores/pwl'
import { formatearValor } from '../valores/valores'

const ANCHO = 240
const ALTO = 72
const MARGEN = 6

/** Gráfica miniatura de los puntos de una fuente PWL: la línea, un punto por vértice y los extremos del tiempo y del valor. */
export default function MiniaturaPwl(props: { texto: string }) {
  const lectura = createMemo(() => leerPuntosPwl(props.texto))
  const dibujo = createMemo(() => {
    const l = lectura()
    if (!l.ok) return null
    const ts = l.puntos.map((p) => p[0]), vs = l.puntos.map((p) => p[1])
    const tMax = Math.max(...ts) || 1
    const vMin = Math.min(...vs), vMax = Math.max(...vs)
    const rango = vMax - vMin || 1
    const x = (t: number) => MARGEN + (t / tMax) * (ANCHO - 2 * MARGEN)
    const y = (v: number) => ALTO - MARGEN - ((v - vMin) / rango) * (ALTO - 2 * MARGEN)
    const pts = l.puntos.map(([t, v]) => ({ x: x(t), y: y(v) }))
    return { pts, tMax, vMin, vMax }
  })
  return (
    <Show when={dibujo()} fallback={<p class="campo-error">{lectura().ok ? '' : `Puntos no válidos: ${(lectura() as { error: string }).error}`}</p>}>
      {(d) => (
        <figure class="pwl-mini">
          <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={`Forma de onda de ${d().pts.length} puntos, de 0 a ${formatearValor(d().tMax, 's')}, entre ${formatearValor(d().vMin, 'V')} y ${formatearValor(d().vMax, 'V')}`}>
            <polyline points={d().pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
            <For each={d().pts}>{(p) => <circle cx={p.x} cy={p.y} r="2.2" fill="currentColor" />}</For>
          </svg>
          <figcaption class="secundario cifra">{`0 a ${formatearValor(d().tMax, 's')} · ${formatearValor(d().vMin, 'V')} a ${formatearValor(d().vMax, 'V')}`}</figcaption>
        </figure>
      )}
    </Show>
  )
}
