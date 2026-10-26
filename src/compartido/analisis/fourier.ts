/** Fourier de un transitorio: ventana de los últimos `periodos`, remuestreo a intervalos iguales (ngspice da pasos desiguales) y transformada en los armónicos pedidos. Con periodos enteros no hay fuga espectral. */

export type VentanaFourier = 'rectangular' | 'hann'

export interface OpcionesFourier {
  fundamental: number
  armonicos: number
  periodos: number
  ventana: VentanaFourier
  /** Muestras por periodo del remuestreo. */
  puntosPorPeriodo: number
}

export interface Armonico {
  /** 1 es la fundamental. */
  n: number
  frecuencia: number
  /** Amplitud de pico en las unidades de la señal. */
  magnitud: number
  /** Fase en grados de un coseno que empieza en el inicio de la ventana, entre -180 y 180. */
  fase: number
}

export interface ResultadoFourier {
  continua: number
  armonicos: Armonico[]
  /** Distorsión armónica total en %: raíz de la suma de cuadrados de los armónicos 2 a N entre la fundamental. null si la fundamental es nula. */
  thd: number | null
}

/** Valor de `y` en `t` por interpolación lineal; `t` crece. */
function interpolador(t: ArrayLike<number>, y: ArrayLike<number>): (x: number) => number {
  let i = 1
  return (x) => {
    while (i < t.length - 1 && t[i] < x) i++
    const [t0, t1] = [t[i - 1], t[i]]
    return t1 === t0 ? y[i] : y[i - 1] + ((y[i] - y[i - 1]) * (x - t0)) / (t1 - t0)
  }
}

/** Tope de operaciones (armónicos por muestras) de una señal: lo máximo que permite la configuración son 80 millones y toma menos de un segundo. */
export const TOPE_OPERACIONES_FOURIER = 200_000_000

export function fourier(t: ArrayLike<number>, y: ArrayLike<number>, o: OpcionesFourier): ResultadoFourier {
  if (t.length < 2 || t.length !== y.length) throw new Error('No hay datos suficientes para el análisis de Fourier.')
  const T = 1 / o.fundamental
  const fin = t[t.length - 1]
  const t0 = fin - o.periodos * T
  if (t0 < t[0] - T * 1e-6) throw new Error('El transitorio es más corto que la ventana de Fourier: alarga el tiempo o baja los periodos.')
  const N = o.periodos * o.puntosPorPeriodo
  const muestra = interpolador(t, y)
  const dt = T / o.puntosPorPeriodo
  const w = new Float64Array(N)
  const x = new Float64Array(N)
  let sw = 0
  let sx = 0
  for (let i = 0; i < N; i++) {
    w[i] = o.ventana === 'hann' ? 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N) : 1
    x[i] = muestra(t0 + i * dt)
    sw += w[i]
    sx += w[i] * x[i]
  }
  if (o.armonicos * N > TOPE_OPERACIONES_FOURIER) throw new Error('El análisis de Fourier pide demasiado cálculo: baja los armónicos o los periodos.')
  // Una tabla de cos y sen de una vuelta en N pasos; el armónico n usa cada (n·periodos)-ésimo elemento (la señal tiene `periodos`
  // periodos en N muestras). Es lo mismo que cos(2π·n·periodos·i/N), sin llamar a cos y sen N veces por armónico.
  const cos = new Float64Array(N)
  const sen = new Float64Array(N)
  for (let k = 0; k < N; k++) {
    cos[k] = Math.cos((2 * Math.PI * k) / N)
    sen[k] = Math.sin((2 * Math.PI * k) / N)
  }
  const wx = new Float64Array(N)
  for (let i = 0; i < N; i++) wx[i] = w[i] * x[i]
  const armonicos: Armonico[] = []
  for (let n = 1; n <= o.armonicos; n++) {
    let re = 0
    let im = 0
    const salto = (n * o.periodos) % N
    let k = 0
    for (let i = 0; i < N; i++) {
      const v = wx[i]
      re += v * cos[k]
      im -= v * sen[k]
      k += salto
      if (k >= N) k -= N
    }
    const magnitud = (2 * Math.hypot(re, im)) / sw
    armonicos.push({ n, frecuencia: n * o.fundamental, magnitud, fase: magnitud < 1e-15 ? 0 : (Math.atan2(im, re) * 180) / Math.PI })
  }
  const base = armonicos[0].magnitud
  let suma = 0
  for (const a of armonicos.slice(1)) suma += a.magnitud * a.magnitud
  return { continua: sx / sw, armonicos, thd: base > 1e-15 ? (Math.sqrt(suma) / base) * 100 : null }
}
