import { For, type JSX } from 'solid-js'
import type { TipoFicha } from '../analisis/fichas'

/**
 * Imagen chica del resultado típico de cada análisis (no de este circuito). Solo variables de color: las clases `ej-*` de `analisis.css` las resuelven.
 */
const ANCHO = 240
const ALTO = 130
const X0 = 32
const X1 = 226
const Y0 = 108
const Y1 = 12

const camino = (n: number, f: (t: number) => [number, number]): string =>
  Array.from({ length: n + 1 }, (_, i) => {
    const [x, y] = f(i / n)
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
  }).join('')

/** Los dos ejes y el rótulo de cada uno. */
function Ejes(props: { x: string; y: string }): JSX.Element {
  return (
    <>
      <path class="ej-eje" d={`M${X0} ${Y1}V${Y0}H${X1}`} />
      <text class="ej-txt" x={X1} y={Y0 + 14} text-anchor="end">
        {props.x}
      </text>
      <text class="ej-txt" x={X0 - 4} y={Y1 + 8} text-anchor="end">
        {props.y}
      </text>
    </>
  )
}

function Operacion(): JSX.Element {
  const filas: [string, number, string, string][] = [
    ['V(in)', 5, '5 V', 'ej-a'],
    ['V(out)', 3.3, '3.3 V', 'ej-b'],
    ['V(b)', 0.7, '0.7 V', 'ej-c']
  ]
  return (
    <>
      <For each={filas}>
        {([nombre, v, texto, clase], i) => (
          <>
            <text class="ej-txt" x="6" y={34 + i() * 34}>
              {nombre}
            </text>
            <rect class={`ej-barra ${clase}`} x="56" y={22 + i() * 34} width={v * 27} height="16" rx="3" />
            <text class="ej-txt" x={56 + v * 27 + 6} y={34 + i() * 34}>
              {texto}
            </text>
          </>
        )}
      </For>
    </>
  )
}

function Continua(): JSX.Element {
  return (
    <>
      <Ejes x="V1" y="I" />
      <path class="ej-curva ej-a" d={camino(60, (t) => [X0 + t * (X1 - X0), Y0 - Math.min(88, Math.expm1(Math.max(0, t * 5 - 0.5) * 1.9) * 2.4)])} />
    </>
  )
}

function Frecuencia(): JSX.Element {
  const db = (t: number) => {
    const r = 10 ** (t * 4 - 1.2)
    return -10 * Math.log10((1 - r * r) ** 2 + (r / 0.9) ** 2)
  }
  return (
    <>
      <Ejes x="f" y="dB" />
      <path class="ej-guia" d={`M${X0} 40H${X1}`} />
      <text class="ej-txt" x={X1} y="34" text-anchor="end">
        −3 dB
      </text>
      <path class="ej-curva ej-a" d={camino(80, (t) => [X0 + t * (X1 - X0), Math.max(Y1, Math.min(Y0, 30 - db(t) * 0.8))])} />
    </>
  )
}

function Tiempo(): JSX.Element {
  return (
    <>
      <Ejes x="t" y="V" />
      <path class="ej-guia" d={`M${X0} 22H${X1}`} />
      <path class="ej-curva ej-a" d={camino(60, (t) => [X0 + t * (X1 - X0), Y0 - (1 - Math.exp(-4 * t)) * (Y0 - 22)])} />
    </>
  )
}

function Fourier(): JSX.Element {
  const a = [1, 0, 0.33, 0, 0.2, 0, 0.14, 0, 0.11]
  return (
    <>
      <Ejes x="f" y="V" />
      <For each={a}>{(v, i) => <rect class="ej-barra ej-c" x={X0 + 10 + i() * 20} y={Y0 - v * 86} width="12" height={v * 86} />}</For>
    </>
  )
}

function Parametro(): JSX.Element {
  const curvas: [string, number][] = [['ej-a', 7], ['ej-b', 3.2], ['ej-c', 1.6]]
  return (
    <>
      <Ejes x="t" y="V" />
      <For each={curvas}>{([clase, k]) => <path class={`ej-curva ${clase}`} d={camino(40, (t) => [X0 + t * (X1 - X0), Y0 - (1 - Math.exp(-k * t)) * (Y0 - 22)])} />}</For>
    </>
  )
}

const DIBUJO: Readonly<Record<TipoFicha, { dibujo: () => JSX.Element; descripcion: string }>> = {
  op: { dibujo: Operacion, descripcion: 'Barras con el voltaje de tres redes.' },
  dc: { dibujo: Continua, descripcion: 'Una curva que sube cada vez más rápido al aumentar el voltaje de la fuente.' },
  ac: { dibujo: Frecuencia, descripcion: 'Una curva de ganancia plana que cae a partir de la frecuencia de corte.' },
  tran: { dibujo: Tiempo, descripcion: 'La carga de un capacitor: sube rápido y se asienta.' },
  fourier: { dibujo: Fourier, descripcion: 'Barras de armónicos, la primera la más alta.' },
  param: { dibujo: Parametro, descripcion: 'Tres curvas de carga, una por cada valor de la pieza.' }
}

export default function EjemploAnalisis(props: { tipo: TipoFicha }) {
  const d = () => DIBUJO[props.tipo]
  return (
    <figure class="an-ejemplo">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={`Ejemplo del resultado. ${d().descripcion}`}>
        {d().dibujo()}
      </svg>
      <figcaption>Ejemplo del resultado</figcaption>
    </figure>
  )
}
