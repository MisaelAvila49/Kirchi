import { alFondo } from '../editor/figuras'
import { conCaja, estiloDe, figurasDe } from '../doc/figuras'
import { MM_POR_UNIDAD, type Documento, type Figura, type Grosor, type Opacidad, type Punta, type Tinta, type TipoFigura, type Trazo } from '../doc/tipos'
import { tamañoSeleccion, type Seleccion } from '../editor/seleccion'

/** Lo que muestra la sección «Figura» del inspector para una o varias figuras (lo distinto entre ellas, «varios»). */
export interface VistaFigura {
  total: number
  tipo: TipoFigura | 'varios'
  tinta: Tinta | 'varias'
  grosor: Grosor | 'varios'
  trazo: Trazo | 'varios'
  /** null: ninguna de las seleccionadas admite relleno (líneas y flechas). */
  relleno: boolean | 'mixto' | null
  /** null: ninguna es flecha. */
  punta: Punta | 'varias' | null
  opacidad: Opacidad | 'varias'
  /** Solo con una: el ancho y el alto de su caja, o el largo de la línea o la flecha, en mm. */
  medidas: { ancho: number; alto: number } | { largo: number } | null
  /** «Al fondo» cambia algo: alguna otra figura queda detrás de las seleccionadas. */
  alFondo: boolean
}

/** La selección son figuras y nada más: el inspector muestra la sección Figura. */
export const soloFiguras = (s: Seleccion): boolean => s.figuras.size > 0 && tamañoSeleccion(s) === s.figuras.size

const comun = <T, M extends string>(xs: readonly T[], mixto: M): T | M => (xs.every((x) => x === xs[0]) ? xs[0] : mixto)
const mm = (u: number) => Math.round(u * MM_POR_UNIDAD * 100) / 100

export function vistaFigura(doc: Documento, sel: Seleccion): VistaFigura | null {
  const fs = figurasDe(doc)
  const figuras = [...sel.figuras].map((id) => fs[id]).filter((f): f is Figura => !!f)
  if (figuras.length === 0) return null
  const estilos = figuras.map(estiloDe)
  const rellenos = figuras.filter((f) => conCaja(f.tipo)).map((f) => estiloDe(f).relleno)
  const puntas = figuras.filter((f) => f.tipo === 'flecha').map((f) => estiloDe(f).punta)
  const [f] = figuras
  return {
    total: figuras.length,
    tipo: comun(figuras.map((x) => x.tipo), 'varios'),
    tinta: comun(estilos.map((e) => e.tinta), 'varias'),
    grosor: comun(estilos.map((e) => e.grosor), 'varios'),
    trazo: comun(estilos.map((e) => e.trazo), 'varios'),
    relleno: rellenos.length === 0 ? null : comun(rellenos, 'mixto'),
    punta: puntas.length === 0 ? null : comun(puntas, 'varias'),
    opacidad: comun(estilos.map((e) => e.opacidad), 'varias'),
    medidas:
      figuras.length !== 1 ? null : conCaja(f.tipo) ? { ancho: mm(f.x2 - f.x1), alto: mm(f.y2 - f.y1) } : { largo: Math.round(Math.hypot(f.x2 - f.x1, f.y2 - f.y1) * MM_POR_UNIDAD * 10) / 10 },
    alFondo: alFondo(Object.values(fs), sel.figuras).length > 0
  }
}
