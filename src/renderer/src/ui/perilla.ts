/** Prefijos de los campos de perilla, como se escriben en una propiedad («1.100k», «2.000u»). */
const PREFIJOS: readonly [string, number][] = [['M', 1e6], ['k', 1e3], ['', 1], ['m', 1e-3], ['u', 1e-6], ['n', 1e-9]]
const FORMA = /^(-?)(\d+)(?:\.(\d+))?([Mkmun]?)$/
const factor = (p: string) => PREFIJOS.find(([q]) => q === p)![1]

/** Cuatro cifras significativas con prefijo SI, sin unidad: 1000 → «1.000k», 0.05 → «50.00m», 0 → «0.000». */
export function textoPerilla(v: number): string {
  if (v === 0 || !Number.isFinite(v)) return '0.000'
  const abs = Math.abs(v)
  let i = PREFIJOS.findIndex(([, f]) => abs >= f * (1 - 1e-12))
  if (i < 0) i = PREFIJOS.length - 1
  let t = (v / PREFIJOS[i][1]).toPrecision(4)
  // 999.96 redondea a «1000»: pasa al prefijo de arriba.
  if (Math.abs(Number(t)) >= 1000 && i > 0) t = (v / PREFIJOS[--i][1]).toPrecision(4)
  return `${t}${PREFIJOS[i][0]}`
}

/**
 * Flecha o rueda sobre un campo de perilla: sube o baja (`dir`) la cifra a la izquierda del cursor (`caret`), acota a [min, max]. null si no es un número o no cambia.
 */
export function pasoPerilla(texto: string, caret: number, dir: 1 | -1, min: number, max: number): { texto: string; caret: number; valor: number } | null {
  const m = FORMA.exec(texto)
  if (!m) return null
  const [, signo, ent, frac = '', pre] = m
  const esCifra = (k: number) => k >= 0 && k < texto.length && /\d/.test(texto[k])
  let i = caret - 1
  if (!esCifra(i)) i = caret
  if (!esCifra(i)) i = signo.length + ent.length - 1
  const punto = signo.length + ent.length
  const exp = i < punto ? punto - 1 - i : -(i - punto)
  const peso = 10 ** exp * factor(pre)
  const valor = Number(`${signo}${ent}${frac ? `.${frac}` : ''}`) * factor(pre)
  const nuevo = Math.min(max, Math.max(min, Number((valor + dir * peso).toPrecision(12))))
  if (nuevo === Number(valor.toPrecision(12))) return null
  const t = textoPerilla(nuevo)
  const m2 = FORMA.exec(t)!
  const exp2 = Math.round(Math.log10(peso / factor(m2[4])))
  const punto2 = m2[1].length + m2[2].length
  let j = exp2 >= 0 ? punto2 - 1 - exp2 : punto2 - exp2
  j = Math.max(m2[1].length, Math.min(t.length - m2[4].length - 1, j))
  if (t[j] === '.') j++
  return { texto: t, caret: j + 1, valor: nuevo }
}
