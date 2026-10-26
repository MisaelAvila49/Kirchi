/** «Ctrl+Z» del registro de atajos → «Control+Z» de `aria-keyshortcuts` (que nombra las teclas completas). */
export function atajoAria(combinacion: string): string {
  return combinacion
    .split('+')
    .map((t) => (t === 'Ctrl' ? 'Control' : t === 'Cmd' ? 'Meta' : t))
    .join('+')
}
