import type { JSX } from 'solid-js'
import type { EstiloRejilla } from '../../../../compartido/grafica/aspecto'

/** Iconos de trazo de 16 × 16 (como los planos de la cinta) del estilo de rejilla; toman el color del texto, con trazo de 1 px y no se leen en voz alta. */
const Icono = (props: { children: JSX.Element }) => (
  <svg class="icono" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="butt" style={{ 'stroke-width': '1px' }}>
    <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
    {props.children}
  </svg>
)

const PUNTOS = [5.5, 8, 10.5] as const

export const ICONOS_REJILLA: Readonly<Record<EstiloRejilla | 'ninguna', () => JSX.Element>> = {
  ninguna: () => <Icono>{null}</Icono>,
  lineas: () => (
    <Icono>
      <path d="M2.5 6.2h11M2.5 9.8h11M6.2 2.5v11M9.8 2.5v11" />
    </Icono>
  ),
  horizontal: () => (
    <Icono>
      <path d="M2.5 5.2h11M2.5 8h11M2.5 10.8h11" />
    </Icono>
  ),
  vertical: () => (
    <Icono>
      <path d="M5.2 2.5v11M8 2.5v11M10.8 2.5v11" />
    </Icono>
  ),
  puntos: () => (
    <Icono>
      {PUNTOS.flatMap((x) => PUNTOS.map((y) => <circle cx={x} cy={y} r="0.85" fill="currentColor" stroke="none" />))}
    </Icono>
  ),
  guiones: () => (
    <Icono>
      <path d="M2.5 5.2h11M2.5 8h11M2.5 10.8h11M5.2 2.5v11M8 2.5v11M10.8 2.5v11" stroke-dasharray="1.5 1.5" />
    </Icono>
  )
}
