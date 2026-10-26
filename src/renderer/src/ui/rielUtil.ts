/** `aria-controls` del botón de un riel: solo cuando el panel está abierto, porque plegado no existe en la página y el id apuntaría a nada. */
export const controlesDelPanel = (abierto: boolean, id: string): string | undefined => (abierto ? id : undefined)
