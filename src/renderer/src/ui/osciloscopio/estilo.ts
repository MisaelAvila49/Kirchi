import { tamTextoMax, type EstiloEje } from '../../../../compartido/grafica/anotaciones'
import { TEXTO_TAM_BASE, type AspectoGrafica, type AspectoTraza } from '../../../../compartido/grafica/aspecto'
import type { EstiloCifras } from './marco'
import type { EstiloPantalla } from './dibujar'

/** Lo que el marco necesita para medir las columnas: el tamaño de las cifras (el mayor entre el general y el de cada eje) y lo elegido por canal. */
export function estiloCifrasDe(a: Pick<AspectoGrafica, 'textoTam'>, canales: Readonly<Record<string, AspectoTraza>> = {}, ejes?: Readonly<Record<string, EstiloEje>>): EstiloCifras {
  return { px: tamTextoMax(a.textoTam, ejes) ?? TEXTO_TAM_BASE, canales: Object.fromEntries(Object.entries(canales).map(([k, t]) => [k, { prefijo: t.prefijo ?? null, ...(t.decimales !== undefined ? { decimales: t.decimales } : {}) }])) }
}

/** Del aspecto guardado en la propiedad del osciloscopio (y el de cada canal) al estilo con que se dibuja la pantalla. */
export function estiloDeAspecto(a: AspectoGrafica, canales: Readonly<Record<string, AspectoTraza>> = {}, ejes?: Readonly<Record<string, EstiloEje>>): EstiloPantalla {
  return {
    textoTono: a.textoTono,
    textoPeso: a.textoPeso,
    textoTam: a.textoTam,
    rejillaEstilo: a.rejillaEstilo,
    subdivisionesX: a.subdivisionesX ?? null,
    subdivisionesY: a.subdivisionesY ?? null,
    prefijoX: a.prefijoX,
    ...(a.decimalesX !== undefined ? { decimalesX: a.decimalesX } : {}),
    ...(a.grosorEjes !== undefined ? { grosorEjes: a.grosorEjes } : {}),
    ...(a.grosorRejilla !== undefined ? { grosorRejilla: a.grosorRejilla } : {}),
    ...(ejes && Object.keys(ejes).length > 0 ? { ejes } : {}),
    canales: Object.fromEntries(Object.entries(canales).map(([k, t]) => [k, { grosor: t.grosor ?? null, prefijo: t.prefijo ?? null, ...(t.decimales !== undefined ? { decimales: t.decimales } : {}) }]))
  }
}
