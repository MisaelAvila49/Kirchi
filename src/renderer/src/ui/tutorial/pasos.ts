import type { Pieza } from '../../doc/tipos'
import type { Caja } from '../../piezas/tipos'
import { cableGuia, caja, piezaEnSombra, piezaFueraDeSombra, piezasDe, zonaEn } from './condiciones'
import type { CtxTutorial, Objetivo, PasoDef } from './tipos'

/* Piezas comunes de los capítulos: objetivos, el paso «Mira» y el paso de colocar una pieza sobre su sombra. */

export const zona = (c: Caja | null): Objetivo => (c ? { tipo: 'zona', caja: c } : { tipo: 'ninguno' })
export const control = (selector: string, pestana?: string, respaldo?: string): Objetivo => ({ tipo: 'control', selector, ...(pestana ? { pestana } : {}), ...(respaldo ? { respaldo } : {}) })

/** Simular y Detener están en Inicio › Simular; en una ventana angosta el grupo se pliega y se señala su botón. */
export const GRUPO_SIMULAR = '[data-grupo="vista-previa"] .boton-grupo'
export const SIMULAR = '[data-comando="simular"]'
export const DETENER = '[data-comando="detener"]'

/** Las zonas de la ventana que los pasos «Mira» enmarcan. */
export const PESTANAS_CINTA = '[role="tablist"][aria-label="Cinta"]'
export const RIEL_IZQUIERDO = 'nav[aria-label="Paneles"]'
export const RIEL_DERECHO = 'nav[aria-label="Para ver el circuito"]'
export const PANEL_IZQUIERDO = '#panel-lateral'
export const PANEL_DERECHO = '#panel-derecho'
export const FRANJA = '.instrumentos'
export const LIENZO = 'canvas.lienzo-gl'

/** Donde Mediciones, a la derecha, muestra la lectura del multímetro. */
export const LECTURA_MULTIMETRO = '#panel-derecho .fila-instrumento'
/** El icono de Mediciones en el riel derecho: se señala si el panel no está a la vista. */
export const RIEL_MEDICIONES = '.riel-boton[data-panel="mediciones"]'

type DatosMira = Omit<PasoDef, 'tipo' | 'hecho' | 'cumplido' | 'transitorio' | 'sigueVigente' | 'guia' | 'fueraDeSombra'>

/** Un paso «Mira»: enmarca una zona, la explica en una línea y avanza con «Siguiente». No comprueba nada, así que al retomar se da por visto. */
export function mira(p: DatosMira): PasoDef {
  return { ...p, tipo: 'mira', cumplido: '', transitorio: true, hecho: () => false }
}

type Sitio = { x: number; y: number }
type Cumple = (ctx: CtxTutorial) => (p: Pieza) => boolean
const cualquiera: Cumple = () => () => true

/** Un paso de colocar una pieza: la sombra en su sitio, y el paso se cumple solo con la pieza sobre ella. */
export function colocar(tipo: string, sitio: Sitio, rot: Pieza['rot'], props: Record<string, string> | undefined, ok: Cumple = cualquiera): Pick<PasoDef, 'objetivo' | 'guia' | 'hecho' | 'fueraDeSombra'> {
  return {
    objetivo: () => zona(zonaEn(sitio.x, sitio.y)),
    guia: (ctx) => ({ piezas: piezaEnSombra(ctx, tipo, sitio, ok(ctx)) ? [] : [{ tipo, x: sitio.x, y: sitio.y, rot, props }], cables: [] }),
    hecho: (ctx) => piezaEnSombra(ctx, tipo, sitio, ok(ctx)),
    fueraDeSombra: (ctx) => piezaFueraDeSombra(ctx, tipo, sitio, ok(ctx))
  }
}

/** La pieza del tipo, si está puesta, o la zona donde se espera. */
export const piezaOZona = (ctx: CtxTutorial, tipo: string, respaldo: Sitio): Objetivo => {
  const p = piezasDe(ctx, tipo)[0]
  return p ? zona(caja(ctx, p, 2)) : zona(zonaEn(respaldo.x, respaldo.y))
}

export { cableGuia }
