/** Muestras crudas por canal del osciloscopio y por sonda de multímetro. */
export const MUESTRAS_CANAL = 262_144
export const MUESTRAS_MULTIMETRO = 32_768
/** Lo menos que guarda una sonda (`MUESTRAS_SONDA` de `engine/src/netlist.rs`). */
export const MUESTRAS_MIN = 1024
/** El tope de todas las sondas de un circuito: 16 MiB (`MEMORIA_SONDAS` del motor). */
export const MEMORIA_SONDAS = 16 * 1024 * 1024
/** Columnas de la rejilla de cada sonda (`COLUMNAS` de `engine/src/sonda.rs`). */
export const COLUMNAS_SONDA = 4096

/** Bytes que reserva una sonda de `n` muestras: lo mismo que `Sonda::bytes_de` en el motor. */
export const bytesDeSonda = (n: number): number => n * 12 + COLUMNAS_SONDA * 56 + 256 * 8

export type UsoSonda = 'canal' | 'multimetro'

/** Muestras de cada sonda: las de su uso, a la mitad por potencias de dos (primero canales, luego multímetros) mientras
 * todas pasen de 16 MiB. Con más sondas de las que caben aun en lo mínimo, una oración. */
export function repartirMemoria(usos: readonly UsoSonda[]): number[] | string {
  let canal = MUESTRAS_CANAL
  let multimetro = MUESTRAS_MULTIMETRO
  const total = () => usos.reduce((s, u) => s + bytesDeSonda(u === 'canal' ? canal : multimetro), 0)
  while (total() > MEMORIA_SONDAS) {
    if (canal > MUESTRAS_MIN) canal /= 2
    else if (multimetro > MUESTRAS_MIN) multimetro /= 2
    else return 'Los instrumentos del circuito piden más de 16 MiB para sus capturas: quita alguno.'
  }
  return usos.map((u) => (u === 'canal' ? canal : multimetro))
}
