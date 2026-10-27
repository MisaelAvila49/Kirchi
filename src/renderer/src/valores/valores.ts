/** Exponentes de los prefijos SI aceptados; «R» marca el punto decimal en resistencias («4R7»). */
const EXPONENTES: Record<string, number> = { f: -15, p: -12, n: -9, u: -6, 'µ': -6, 'μ': -6, m: -3, R: 0, k: 3, K: 3, M: 6, G: 9, T: 12 }
const UNIDADES: Record<string, string> = { 'Ω': 'Ω', ohm: 'Ω', ohms: 'Ω', F: 'F', H: 'H', V: 'V', A: 'A', W: 'W', Hz: 'Hz', s: 's', '°C': '°C', lx: 'lx', 'N·m': 'N·m' }
const RE = /^([+-]?)(\d+(?:\.\d+)?|\.\d+)\s*([fpnuµμmRkKMGT]?)(\d*)\s*([A-Za-zΩ°·]*)$/

export interface Valor {
  valor: number
  unidad: string
}

/** Lee notación de ingeniería: «4k7», «4.7k», «10u», «2M2», «4R7», «100 nF», «-5 V». */
export function leerValor(texto: string): Valor | null {
  const m = RE.exec(texto.normalize('NFKC').trim())
  if (!m) return null
  const [, signo, numero, prefijo, cola, unidadTexto] = m
  if (cola && (!prefijo || numero.includes('.'))) return null
  let unidad = ''
  if (unidadTexto) {
    if (!Object.hasOwn(UNIDADES, unidadTexto)) return null
    unidad = UNIDADES[unidadTexto]
  }
  if (prefijo === 'R' && !unidad) unidad = 'Ω'
  const mantisa = Number(cola ? `${numero}.${cola}` : numero)
  const e = prefijo ? EXPONENTES[prefijo] : 0
  const abs = e < 0 ? mantisa / 10 ** -e : mantisa * 10 ** e
  return { valor: signo === '-' ? -abs : abs, unidad }
}

const ESCALAS: [number, string][] = [[12, 'T'], [9, 'G'], [6, 'M'], [3, 'k'], [0, ''], [-3, 'm'], [-6, 'µ'], [-9, 'n'], [-12, 'p'], [-15, 'f']]

/** Formato de ingeniería con 3 cifras significativas: 4700 Ω → «4.7 kΩ». */
export function formatearValor(valor: number, unidad: string): string {
  const pegar = (n: string, p: string) => (p + unidad ? `${n} ${p}${unidad}` : n)
  if (valor === 0 || Math.abs(valor) < 1e-18) return pegar('0', '')
  if (!Number.isFinite(valor)) return pegar(String(valor), '')
  const abs = Math.abs(valor)
  let i = ESCALAS.findIndex(([e]) => abs >= 10 ** e * (1 - 1e-12))
  if (i === -1) i = ESCALAS.length - 1
  for (;;) {
    const [e, p] = ESCALAS[i]
    const m = Number((e < 0 ? valor * 10 ** -e : valor / 10 ** e).toPrecision(3))
    if (Math.abs(m) >= 1000 && i > 0) {
      i--
      continue
    }
    return pegar(String(m), p)
  }
}

/** Posición del cursor de un potenciómetro: «25 %» → 0.25, de 0 a 1 incluidos; null si no es un porcentaje. */
export function leerPosicion(texto: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*%$/.exec(texto.trim())
  const v = m ? Number(m[1]) / 100 : NaN
  return v >= 0 && v <= 1 ? v : null
}

/** Ciclo de trabajo de una fuente de pulso: «50 %» → 0.5; null si no es un porcentaje entre 0 y 100 sin incluirlos. */
export function leerCiclo(texto: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*%$/.exec(texto.trim())
  const v = m ? Number(m[1]) / 100 : NaN
  return v > 0 && v < 1 ? v : null
}

/** Lo que se escribe donde no hay lectura. */
export const SIN_DATO = 'sin dato'

/** Cifra de una medición con 3 cifras significativas que conservan sus ceros («2.50 V», «12.5 mA»), como un multímetro;
 * las propiedades usan `formatearValor`. Bajo 1 f de la unidad da 0; sin lectura (NaN, infinito), «sin dato». */
export function formatearMedida(valor: number, unidad: string, cifras = 3): string {
  if (!Number.isFinite(valor)) return SIN_DATO
  if (Math.abs(valor) < 1e-15) return `${(0).toFixed(cifras - 1)} ${unidad}`
  const abs = Math.abs(valor)
  let i = ESCALAS.findIndex(([e]) => abs >= 10 ** e * (1 - 1e-12))
  if (i === -1) i = ESCALAS.length - 1
  for (;;) {
    const [e, p] = ESCALAS[i]
    const m = e < 0 ? valor * 10 ** -e : valor / 10 ** e
    const texto = m.toPrecision(cifras)
    if (Math.abs(Number(texto)) >= 1000) {
      // Pasa de 999 T: sin prefijo SI que usar, se escribe con potencia de diez.
      if (i === 0) return `${potenciaDeDiez(valor)} ${unidad}`
      i--
      continue
    }
    return `${menosTipografico(texto)} ${p}${unidad}`
  }
}

/** El signo negativo de una cifra es el menos tipográfico (U+2212), del ancho de un más: «−2.50 mA». */
const menosTipografico = (texto: string): string => (texto.startsWith('-') ? `−${texto.slice(1)}` : texto)

const SUPERINDICE: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' }

/** Tres cifras significativas con potencia de diez: 2.5e18 → «2.50×10¹⁸»; la mantisa nunca llega a 10. */
function potenciaDeDiez(valor: number): string {
  let exp = Math.floor(Math.log10(Math.abs(valor)))
  let m = valor / 10 ** exp
  if (Math.abs(Number(m.toPrecision(3))) >= 10) {
    exp++
    m = valor / 10 ** exp
  }
  return `${menosTipografico(m.toPrecision(3))}×10${[...String(exp)].map((c) => SUPERINDICE[c]).join('')}`
}

/** Unidades que no llevan prefijo SI: se escriben con su número tal cual («−3.01 dB»). Los grados y el porcentaje van pegados o con espacio según la costumbre. */
const SIN_PREFIJO_SI = new Set(['dB', 'dBV', '°', '%', ''])
const PEGADAS = new Set(['°'])

/** Número de un eje o campo de rango con prefijo SI de uso común y hasta `cifras` significativas sin ceros de relleno: 1
 * 000 000 Hz → «1 MHz», 0.0025 s → «2.5 ms», −45° → «−45°». Sin lectura, «sin dato». */
export function formatearSI(valor: number, unidad: string, cifras = 4): string {
  if (!Number.isFinite(valor)) return SIN_DATO
  const signo = (n: string) => n.replace('-', '−')
  if (SIN_PREFIJO_SI.has(unidad)) {
    const n = signo(String(Number((Math.abs(valor) < 1e-12 ? 0 : valor).toPrecision(cifras))))
    return PEGADAS.has(unidad) || !unidad ? `${n}${unidad}` : `${n} ${unidad}`
  }
  if (Math.abs(valor) < 1e-18) return `0 ${unidad}`
  const abs = Math.abs(valor)
  let i = ESCALAS.findIndex(([e]) => abs >= 10 ** e * (1 - 1e-12))
  if (i === -1) i = ESCALAS.length - 1
  for (;;) {
    const [e, p] = ESCALAS[i]
    const m = Number((e < 0 ? valor * 10 ** -e : valor / 10 ** e).toPrecision(cifras))
    if (Math.abs(m) >= 1000 && i > 0) {
      i--
      continue
    }
    return `${signo(String(m))} ${p}${unidad}`
  }
}

/** Lo escrito en un campo de una cantidad en `unidad`: «2.5 ms», «2,5ms», «1M», «500 µ» o el número en la unidad base.
 * Punto o coma decimal, `u` o `µ`. Null si no es número, trae otra unidad o un prefijo donde no cabe (dB, °, %). */
export function leerEnUnidad(texto: string, unidad: string): number | null {
  const t = texto.normalize('NFKC').trim().replace(',', '.').replace('−', '-')
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([fpnuµμmkKMGT]?)\s*([^\d\s]*)$/i.exec(t)
  if (!m) return null
  const [, numero, prefijo, cola] = m
  let pref = prefijo
  let u = cola
  // «45°» o «3 dB»: lo que parecía prefijo puede ser el principio de la unidad («m» de «mV» sí lo es; «d» de «dB» no está en la lista).
  if (u !== '' && u !== unidad) return null
  if (SIN_PREFIJO_SI.has(unidad) && pref) return null
  if (u === '' && pref === unidad) {
    pref = ''
    u = unidad
  }
  const e = pref ? EXPONENTES[pref] : 0
  if (pref && e === undefined) return null
  const n = Number(numero)
  if (!Number.isFinite(n)) return null
  return e < 0 ? n / 10 ** -e : n * 10 ** e
}
