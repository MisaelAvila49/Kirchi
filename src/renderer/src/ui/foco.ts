/**
 * Devuelve el foco cuando el control que lo tenía se desmontó (mismo lugar, anterior, la lista o `alternativa`). No usa `blur` ni `focusout`: no son fiables al quitar un elemento.
 */
export function restaurarFoco(lista: HTMLElement | null | undefined, selector: string, indice: number, alternativa: () => void): void {
  const activo = document.activeElement
  if (activo && activo !== document.body && activo.isConnected) return
  const filas = lista?.isConnected ? [...lista.querySelectorAll<HTMLElement>(selector)] : []
  const destino = filas[Math.min(indice, filas.length - 1)]
  if (destino) destino.focus()
  else if (lista?.isConnected) {
    lista.tabIndex = -1
    lista.focus()
  } else alternativa()
}

/** El elemento de `selector` que contiene a `el`, con su lista y su posición; null si `el` no está en una. */
export function filaConFoco(el: EventTarget | null, selector: string): { fila: HTMLElement; lista: HTMLElement; indice: number } | null {
  const fila = (el as HTMLElement | null)?.closest?.<HTMLElement>(selector)
  const lista = fila?.closest<HTMLElement>('ul, ol, [role="group"]')
  if (!fila || !lista) return null
  return { fila, lista, indice: [...lista.querySelectorAll<HTMLElement>(selector)].indexOf(fila) }
}
