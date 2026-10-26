import { siguienteControl } from '../barraNav'

/** Flechas sobre las pestañas (patrón de pestañas de WAI-ARIA): derecha e izquierda dan la vuelta, Inicio y Fin van a los extremos. */
export function siguientePestaña(total: number, actual: number, tecla: string): number | null {
  if (total <= 0) return null
  if (tecla === 'ArrowRight') return (actual + 1) % total
  if (tecla === 'ArrowLeft') return (actual - 1 + total) % total
  if (tecla === 'Home') return 0
  if (tecla === 'End') return total - 1
  return null
}

export type Visible = (el: HTMLElement) => boolean
/** Con caja en la pantalla: un control con `display: none` (Atajos a menos de 920 px) no la tiene. */
const conCaja: Visible = (el) => el.getClientRects().length > 0

/**
 * Controles que recorren las flechas: los visibles y no deshabilitados de verdad (los `aria-disabled` cuentan para que el lector lea su razón). El botón de un grupo solo cuenta con el grupo plegado.
 */
export function itemsDeBarra(barra: HTMLElement, visible: Visible = conCaja): HTMLElement[] {
  return [...barra.querySelectorAll<HTMLElement>('button, input')].filter((el) => {
    if ((el as HTMLButtonElement | HTMLInputElement).disabled || el.closest('[hidden]')) return false
    const grupo = el.closest('.grupo')
    if (grupo) {
      const plegado = grupo.classList.contains('plegado')
      if (el.classList.contains('boton-grupo') ? !plegado : plegado) return false
    }
    return visible(el)
  })
}

/**
 * Deja un solo control con tabindex 0: el que ya lo tenía si sigue a la vista, si no el primero. Si el enfocado quedó en un grupo recién plegado, el foco pasa al botón del grupo.
 */
export function normalizarFoco(barra: HTMLElement, visible: Visible = conCaja): void {
  const it = itemsDeBarra(barra, visible)
  const enfocado = document.activeElement instanceof HTMLElement && barra.contains(document.activeElement) ? document.activeElement : null
  const grupo = enfocado && !it.includes(enfocado) ? enfocado.closest('.grupo.plegado:not(.abierto)') : null
  const delGrupo = grupo?.querySelector<HTMLElement>('.boton-grupo') ?? null
  const actual = delGrupo ?? it.find((x) => x.tabIndex === 0) ?? it[0]
  for (const x of barra.querySelectorAll<HTMLElement>('button, input')) x.tabIndex = -1
  if (actual) actual.tabIndex = 0
  delGrupo?.focus()
}

/** Foco itinerante en una barra de la cinta. `alSubir` atiende la flecha arriba. Devuelve cómo quitarlo. */
export function instalarFocoItinerante(barra: HTMLElement, o: { alSubir?(): void; visible?: Visible } = {}): () => void {
  const visible = o.visible ?? conCaja
  const tecla = (e: KeyboardEvent) => {
    // Con un modificador la tecla es de otro (Shift+flecha, Ctrl+Inicio): la barra solo atiende las flechas solas.
    if (e.defaultPrevented || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || (e.target as HTMLElement | null)?.tagName === 'INPUT') return
    const it = itemsDeBarra(barra, visible)
    const i = it.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    if (e.key === 'ArrowUp' && o.alSubir) {
      e.preventDefault()
      o.alSubir()
      return
    }
    const j = siguienteControl(it.length, i, e.key)
    if (j === null) return
    e.preventDefault()
    for (const x of it) x.tabIndex = -1
    it[j].tabIndex = 0
    it[j].focus()
  }
  // Con el ratón o desde el buscador el foco puede llegar a cualquier control: ese pasa a ser el de la barra.
  const foco = (e: FocusEvent) => {
    const it = itemsDeBarra(barra, visible)
    const t = e.target as HTMLElement
    if (!it.includes(t)) return
    for (const x of it) x.tabIndex = -1
    t.tabIndex = 0
  }
  barra.addEventListener('keydown', tecla)
  barra.addEventListener('focusin', foco)
  return () => {
    barra.removeEventListener('keydown', tecla)
    barra.removeEventListener('focusin', foco)
  }
}
