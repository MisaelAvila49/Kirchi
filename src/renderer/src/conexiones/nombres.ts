/** Nombres de red de etiquetas y terminales. Se ve el texto escrito, pero une su llave (`claveDeNombre`): menos
 * tipográfico y raya corta son guion, y un voltaje tiene una sola forma. */

/** El menos tipográfico (U+2212) y la raya corta (U+2013) se leen como el guion. */
export const conGuion = (t: string): string => t.replace(/[−–]/g, '-')

/** El voltaje que dice un nombre como «+15V», «-15V», «−15V», «3.3V» o «12 V»; null si el nombre no es un voltaje. */
export function voltajeDeNombre(nombre: string): number | null {
  const m = /^([+-]?)(\d+(?:\.\d+)?|\.\d+)\s*[Vv]$/.exec(conGuion(nombre.trim()))
  if (!m) return null
  const v = Number(m[2])
  // 310 cifras dan Infinity: eso no es un voltaje.
  if (!Number.isFinite(v)) return null
  return m[1] === '-' && v !== 0 ? -v : v
}

/** El nombre de terminal que dice un voltaje: «+15V», «-15V», «+3.3V» (el que propone el buscador). */
export const nombreDeVoltaje = (v: number): string => `${v < 0 ? '-' : '+'}${Math.abs(v)}V`

/** Llave de unión de nombres: sin espacios en los extremos, guion por U+2212 y U+2013 y voltaje en forma única («+15V»,
 * «15 V» y «15v» dan «+15V»). Distingue mayúsculas. */
export function claveDeNombre(nombre: string): string {
  const v = voltajeDeNombre(nombre)
  return v === null ? conGuion(nombre.trim()) : nombreDeVoltaje(v)
}
