export const TEXTO_CAMBIO_EN_DISCO = 'Este archivo cambió fuera de Kirchi.'

interface Props {
  onRecargar(): void
  onConservar(): void
}

/** Aviso sobre el lienzo cuando el archivo abierto cambió en el disco por otro lado. No bloquea: se puede seguir editando. */
export default function AvisoCambioEnDisco(props: Props) {
  return (
    <div class="aviso-grabacion aviso-disco" role="status">
      <span class="aviso-texto">{TEXTO_CAMBIO_EN_DISCO}</span>
      <button type="button" class="boton" onClick={() => props.onRecargar()}>
        Recargar
      </button>
      <button type="button" class="boton" onClick={() => props.onConservar()}>
        Conservar el mío
      </button>
    </div>
  )
}
