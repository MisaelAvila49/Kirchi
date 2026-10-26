/** Ecuación de una calculadora y su sustitución con símbolos tipográficos. `leerEnVozAlta` arma la versión para lectores
 * de pantalla, que no dicen bien «kΩ» ni «·». */

export interface Ecuacion {
  /** Con letras: «Vsalida = Vin · R2 / (R1 + R2)». */
  ecuacion: string
  /** Con los valores y el resultado: «Vsalida = 9 V · 5.6 kΩ / (4.7 kΩ + 5.6 kΩ) = 4.89 V». */
  sustitucion: string
}

const PREFIJOS: Record<string, string> = { T: 'tera', G: 'giga', M: 'mega', k: 'kilo', m: 'mili', 'µ': 'micro', n: 'nano', p: 'pico', f: 'femto' }
const UNIDADES: Record<string, [singular: string, plural: string]> = { 'Ω': ['ohmio', 'ohmios'], F: ['faradio', 'faradios'], Hz: ['hercio', 'hercios'], V: ['voltio', 'voltios'], A: ['amperio', 'amperios'], s: ['segundo', 'segundos'], W: ['vatio', 'vatios'] }

/** Lo que se dice al leer una ecuación: «R1 + R2» → «R1 más R2», «4.7 kΩ» → «4.7 kiloohmios», «·» → «por», «/» → «entre». */
export function leerEnVozAlta(texto: string): string {
  let t = texto.replace(/(\d+(?:\.\d+)?)\s?([TGMkmµnpf]?)(Ω|Hz|F|V|A|s|W)(?![A-Za-zΩµ])/g, (_m, n: string, p: string, u: string) => `${n} ${PREFIJOS[p] ?? ''}${UNIDADES[u][n === '1' ? 0 : 1]}`)
  t = t.replace(/(\d)\s?%/g, '$1 por ciento')
  const palabras: [RegExp, string][] = [
    [/\s·\s/g, ' por '],
    [/\s\/\s/g, ' entre '],
    [/\s=\s/g, ' igual a '],
    [/\s\+\s/g, ' más '],
    [/\s[−-]\s/g, ' menos '],
    [/(^|[(=\s])−(?=\S)/g, '$1menos '],
    [/\(/g, ' abre paréntesis '],
    [/\)/g, ' cierra paréntesis '],
    [/π/g, ' pi '],
    [/√/g, ' raíz cuadrada de '],
    [/\bln\s/g, 'logaritmo natural de ']
  ]
  for (const [re, por] of palabras) t = t.replace(re, por)
  return t.replace(/\s+/g, ' ').trim()
}
