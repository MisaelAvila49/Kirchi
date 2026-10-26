import type { JSX } from 'solid-js'
import type { Tono } from '../../colores'

/** Iconos de trazo de 16 × 16 de las herramientas del editor de exportar; toman el color del texto (la tinta) o el de su orden en el juego R1 (`h`, como la cinta) y no se leen en voz alta. */
const Icono = (props: { children: JSX.Element; h?: Tono }) => (
  <svg class="icono" classList={{ color: !!props.h }} viewBox="0 0 16 16" aria-hidden="true" data-h={props.h}>
    {props.children}
  </svg>
)

export const IconoSeleccionar = () => (
  <Icono>
    <path d="M4 2.5v10l2.7-2.4 1.8 3.7 1.6-.8-1.8-3.6 3.7-.2z" />
  </Icono>
)
export const IconoTexto = () => (
  <Icono h="azul">
    <path d="M3.5 4V3h9v1M8 3v10M6 13h4" />
  </Icono>
)
export const IconoEtiqueta = () => (
  <Icono h="naranja">
    <path d="M2.5 5.5h8l3 2.5-3 2.5h-8z" />
    <path d="M5 8h3" />
  </Icono>
)
export const IconoFlecha = () => (
  <Icono h="violeta">
    <path d="M3 13 13 3M7 3h6v6" />
  </Icono>
)
export const IconoRango = () => (
  <Icono h="verdeazul">
    <path d="M3 3v10M13 3v10M3 8h10M5.5 6 3 8l2.5 2M10.5 6 13 8l-2.5 2" />
  </Icono>
)
export const IconoMas = () => (
  <Icono>
    <circle cx="7" cy="7" r="4.2" />
    <path d="M7 5.2v3.6M5.2 7h3.6M10.2 10.2 13.5 13.5" />
  </Icono>
)
export const IconoMenos = () => (
  <Icono>
    <circle cx="7" cy="7" r="4.2" />
    <path d="M5.2 7h3.6M10.2 10.2 13.5 13.5" />
  </Icono>
)
export const IconoAjustar = () => (
  <Icono>
    <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
  </Icono>
)
export const IconoBorrar = () => (
  <Icono>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8h5.8l.6-8M7 7v3.5M9 7v3.5" />
  </Icono>
)
export const IconoNegrita = () => (
  <Icono>
    <path d="M5 3h3.2a2.2 2.2 0 0 1 0 4.4H5zM5 7.4h3.8a2.3 2.3 0 0 1 0 4.6H5zM5 3v9" />
  </Icono>
)
export const IconoResalte = () => (
  <Icono h="cian">
    <rect x="2.5" y="4" width="11" height="8" rx="1.5" stroke-dasharray="2.2 1.6" />
  </Icono>
)
export const IconoLlamada = () => (
  <Icono h="magenta">
    <circle cx="8" cy="8" r="5.2" />
    <path d="M7 6.2 8.4 5.5v5M7 10.5h2.8" />
  </Icono>
)
