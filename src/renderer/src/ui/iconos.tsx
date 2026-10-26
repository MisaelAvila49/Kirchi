import type { JSX } from 'solid-js'

/** Iconos de trazo de 16 × 16; toman el color del texto y no se leen en voz alta. */
const Icono = (props: { children: JSX.Element; class?: string }) => (
  <svg class={`icono ${props.class ?? ''}`} viewBox="0 0 16 16" aria-hidden="true">
    {props.children}
  </svg>
)

/** Alineación de texto: renglones a la izquierda, al centro, a la derecha o justificados. */
export const IconoAlinear = (props: { como: 'izq' | 'centro' | 'der' | 'just' }) => {
  const d = { izq: 'M3 4h10M3 7h6M3 10h10M3 13h6', centro: 'M3 4h10M5 7h6M3 10h10M5 13h6', der: 'M3 4h10M7 7h6M3 10h10M7 13h6', just: 'M3 4h10M3 7h10M3 10h10M3 13h10' }
  return (
    <Icono>
      <path d={d[props.como]} />
    </Icono>
  )
}

export const IconoArchivo = () => (
  <Icono>
    <path d="M3 4h10M3 8h10M3 12h10" />
  </Icono>
)
export const IconoDeshacer = () => (
  <Icono>
    <path d="M6 4 3 7l3 3M3 7h7a3 3 0 0 1 0 6H8" />
  </Icono>
)
export const IconoRehacer = () => (
  <Icono>
    <path d="M10 4l3 3-3 3M13 7H6a3 3 0 0 0 0 6h2" />
  </Icono>
)
export const IconoSimular = () => (
  <Icono class="relleno">
    <path d="M5 3.5v9l7-4.5z" />
  </Icono>
)
export const IconoPausa = () => (
  <Icono class="relleno">
    <path d="M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z" />
  </Icono>
)
export const IconoDetener = () => (
  <Icono class="relleno">
    <path d="M4 4h8v8H4z" />
  </Icono>
)
export const IconoSol = () => (
  <Icono>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5" />
  </Icono>
)
export const IconoLuna = () => (
  <Icono>
    <path d="M12 9.5A5 5 0 0 1 6.5 4a5 5 0 1 0 5.5 5.5z" />
  </Icono>
)
export const IconoLibreria = () => (
  <Icono>
    <path d="M2 8h3l1.5-3 3 6L11 8h3" />
  </Icono>
)
export const IconoPlantillas = () => (
  <Icono>
    <path d="M5.5 2.5h8v8.5M2.5 5h8v8.5h-8zM4.8 8.2h3.4M4.8 10.6h2.2" />
  </Icono>
)
export const IconoInspector = () => (
  <Icono>
    <path d="M2.5 3h11v10h-11zM10 3v10" />
  </Icono>
)
export const IconoProyecto = () => (
  <Icono>
    <path d="M3 3h4v4H3zM9 9h4v4H9zM7 5h3v4" />
  </Icono>
)
export const IconoAnalisis = () => (
  <Icono>
    <path d="M2.5 2.5v11h11" />
    <path d="M4.5 10c1.6-.2 2-5.5 4-5.5s1.4 5 4 5" />
  </Icono>
)
export const IconoMediciones = () => (
  <Icono>
    <circle cx="8" cy="8" r="5" />
    <path d="M8 5v3l2 1.5" />
  </Icono>
)
export const IconoCalculadoras = () => (
  <Icono>
    <rect x="3.5" y="2" width="9" height="12" rx="1.5" />
    <path d="M5.6 4.8h4.8" />
    <path d="M5.8 8h.01M8 8h.01M10.2 8h.01M5.8 10.6h.01M8 10.6h.01M10.2 10.6h.01" />
  </Icono>
)
export const IconoPlegarIzquierda = () => (
  <Icono>
    <path d="M10 4 6 8l4 4" />
  </Icono>
)
export const IconoPlegarDerecha = () => (
  <Icono>
    <path d="M6 4l4 4-4 4" />
  </Icono>
)
export const IconoArriba = () => (
  <Icono>
    <path d="M4 10l4-4 4 4" />
  </Icono>
)
export const IconoAbajo = () => (
  <Icono>
    <path d="M4 6l4 4 4-4" />
  </Icono>
)
export const IconoCerrar = () => (
  <Icono>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icono>
)
export const IconoPaneles = () => (
  <Icono>
    <path d="M2.5 3.5h11v9h-11zM6 3.5v9M10.5 3.5v9" />
  </Icono>
)

/**
 * Icono del nivel de un mensaje del Registro: cada nivel con su forma, para que no dependa solo del color. Toma el color del texto (`--n`) y no se lee en voz alta.
 */
export const IconoNivel = (props: { nivel: 'error' | 'aviso' | 'info'; class?: string }) => (
  <svg class={`icono-nivel ${props.class ?? ''}`} viewBox="0 0 12 12" aria-hidden="true">
    {props.nivel === 'error' ? (
      <path d="M4 1h4l3 3v4l-3 3H4L1 8V4zM4.2 4.2l3.6 3.6M7.8 4.2 4.2 7.8" />
    ) : props.nivel === 'aviso' ? (
      <path d="M6 1.2 11 10.6H1zM6 4.6v3M6 8.9v.2" />
    ) : (
      <path d="M6 1.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6zM6 5.4v3.4M6 3.4v.2" />
    )}
  </svg>
)
