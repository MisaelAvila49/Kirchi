/**
 * Dos listas de claves iguales y en el mismo orden. El panel itera por claves y no por objetos: si no, cada edición rehacía los controles y soltaba el deslizador de grosor a medio arrastre.
 */
export const mismasClaves = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((c, k) => c === b[k])
