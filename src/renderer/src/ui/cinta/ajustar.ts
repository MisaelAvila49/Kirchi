/** Orden en que se pliegan los grupos cuando falta ancho (índices). Deja fuera los que plegados no ganan ancho. */
export function ordenDePlegado(prioridades: readonly number[], abiertos?: readonly number[], plegados?: readonly number[]): number[] {
  return prioridades
    .map((p, i) => [p, i] as const)
    .filter(([, i]) => !abiertos || !plegados || plegados[i] < abiertos[i])
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .map(([, i]) => i)
}

/** Pliega de uno en uno hasta que `cabe()` es verdadero. Devuelve cuántos quedaron plegados. */
export function plegarHastaCaber(n: number, aplicar: (k: number) => void, cabe: () => boolean): number {
  for (let k = 0; k <= n; k++) {
    aplicar(k)
    if (cabe()) return k
  }
  return n
}

/** Orden en que crecen los grupos cuando sobra ancho: de menor a mayor `crecer`, a igualdad el más a la derecha. */
export function ordenDeCrecimiento(crecer: readonly (number | undefined)[]): number[] {
  return crecer
    .map((c, i) => [c, i] as const)
    .filter((x): x is readonly [number, number] => x[0] !== undefined)
    .sort((a, b) => a[0] - b[0] || b[1] - a[1])
    .map(([, i]) => i)
}

/** Espejo de `plegarHastaCaber`: crece de uno en uno mientras cabe y deshace el que desborda. */
export function crecerMientrasQuepa(n: number, aplicar: (k: number) => void, cabe: () => boolean): number {
  for (let k = 1; k <= n; k++) {
    aplicar(k)
    if (!cabe()) {
      aplicar(k - 1)
      return k - 1
    }
  }
  return n
}
