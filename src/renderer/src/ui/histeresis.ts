/** Una cifra nueva reemplaza a la que se ve si difiere en más de esto de su última cifra. */
export const HISTERESIS_CIFRA = 0.6

/** El valor de la última de `cifras` cifras significativas de `v` (2.50 con tres: 0.01); 0 si `v` es cero. */
export function ultimaCifra(v: number, cifras: number): number {
  if (v === 0 || !Number.isFinite(v)) return 0
  return 10 ** (Math.floor(Math.log10(Math.abs(v))) - cifras + 1)
}

/**
 * Cifra que se ve de cada lectura: deja quieto el último dígito cuando el valor real está quieto, como un multímetro de banco.
 */
export class Histeresis {
  private mostrados = new Map<string, number>()

  constructor(private readonly cifras = 3) {}

  valor(clave: string, v: number): number {
    if (!Number.isFinite(v)) return v
    const previo = this.mostrados.get(clave)
    if (previo !== undefined && Math.abs(v - previo) <= HISTERESIS_CIFRA * ultimaCifra(previo, this.cifras)) return previo
    this.mostrados.set(clave, v)
    return v
  }

  reiniciar(): void {
    this.mostrados.clear()
  }
}
