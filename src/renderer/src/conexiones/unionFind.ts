/** Unión-búsqueda genérica sobre llaves enteras (o de texto). */
export class UnionFind<K extends string | number = number> {
  private padre = new Map<K, K>()

  buscar(k: K): K {
    let r = this.padre.get(k)
    if (r === undefined) {
      this.padre.set(k, k)
      return k
    }
    if (r === k) return k
    for (let q = this.padre.get(r)!; q !== r; q = this.padre.get(r)!) r = q
    let x = k
    while (x !== r) {
      const p = this.padre.get(x)!
      this.padre.set(x, r)
      x = p
    }
    return r
  }

  unir(a: K, b: K): void {
    const ra = this.buscar(a), rb = this.buscar(b)
    if (ra !== rb) this.padre.set(ra, rb)
  }
}
