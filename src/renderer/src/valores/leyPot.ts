/** Las leyes de variación de un potenciómetro: lineal (B), logarítmica o de audio (A) y antilogarítmica o inversa (C). */
export const LEYES_POT = ['lineal', 'logarítmica', 'antilogarítmica'] as const

/** Fracción del valor total entre el pin 1 y el cursor cuando el eje está en la fracción `x` (0 a 1) del giro. La
 * logarítmica comercial «A» es en realidad dos tramos rectos: 15 % del valor a la mitad del giro (la cifra común en
 * audio; otras casas dan 10 a 20 %); la antilogarítmica es su espejo. Una ley desconocida cuenta como lineal. */
export function fraccionConLey(x: number, ley: string | undefined): number {
  const log = (u: number) => (u <= 0.5 ? 0.3 * u : 0.15 + 1.7 * (u - 0.5))
  if (ley === 'logarítmica') return log(x)
  if (ley === 'antilogarítmica') return 1 - log(1 - x)
  return x
}
