import type { Caja } from '../../piezas/tipos'
import { piezasDe, tramoEntre, vio } from './condiciones'
import type { CapituloDef, Objetivo } from './tipos'

const zona = (c: Caja | null): Objetivo => (c ? { tipo: 'zona', caja: c } : { tipo: 'ninguno' })
const control = (selector: string, pestana?: string): Objetivo => ({ tipo: 'control', selector, ...(pestana ? { pestana } : {}) })

/**
 * Capítulo 4: guardar, abrir desde Recientes y exportar la selección. Los pasos se cumplen con eventos del servicio de archivos, no con clics, porque los diálogos son del sistema.
 */
export const CAPITULO_4: CapituloDef = {
  id: 'archivo',
  numero: 4,
  titulo: 'Archivo',
  resumen: 'Guardar, recientes y exportar la selección',
  minutos: 4,
  tono: 'violeta',
  totalPasos: 5,
  arranque: true,
  zona: { minX: -14, minY: -24, maxX: 56, maxY: 40 },
  pasos: [
    {
      id: 'guardar',
      resumen: 'guarda el circuito',
      texto: 'Guarda el circuito con {tecla:guardar}.',
      cumplido: 'Circuito guardado.',
      pista: 'El archivo termina en .kir y se abre en cualquier equipo con Kirchi.',
      transitorio: true,
      objetivo: () => control('[data-comando="guardar"]'),
      hecho: (ctx) => vio(ctx, 'guardado')
    },
    {
      id: 'nuevo',
      resumen: 'empieza un circuito nuevo',
      texto: 'Empieza un circuito nuevo con {tecla:nuevo}.',
      cumplido: 'Circuito nuevo.',
      pista: 'El que guardaste sigue en el disco.',
      transitorio: true,
      objetivo: () => control('[data-comando="nuevo"]', 'inicio'),
      hecho: (ctx) => vio(ctx, 'nuevo')
    },
    {
      id: 'reciente',
      resumen: 'ábrelo desde Recientes',
      texto: 'En la pestaña Inicio abre Recientes y elige el archivo que guardaste.',
      cumplido: 'Archivo reciente abierto.',
      transitorio: true,
      objetivo: () => control('[data-comando="recientes"]', 'inicio'),
      hecho: (ctx) => vio(ctx, 'reciente')
    },
    {
      id: 'seleccionar',
      resumen: 'selecciona la resistencia y el LED',
      texto: 'Selecciona la resistencia y el LED: {gesto:clic} en una y {gesto:mayus-clic} en el otro.',
      cumplido: 'Selección lista.',
      pista: 'También puedes {gesto:arrastrar|arrastra} un recuadro que encierre las dos piezas.',
      transitorio: true,
      objetivo: (ctx) => zona(tramoEntre(ctx, 'resistencia', 'led', 2)),
      hecho: (ctx) => {
        const s = ctx.seleccion
        return !!s && s.size >= 2 && piezasDe(ctx, 'resistencia').some((p) => s.has(p.id)) && piezasDe(ctx, 'led').some((p) => s.has(p.id))
      }
    },
    {
      id: 'exportar',
      resumen: 'exporta solo la selección',
      texto: 'En la pestaña Inicio abre Exportar y, en el diálogo, elige el formato (PNG o PDF) y, en «Qué se exporta», elige Selección.',
      cumplido: 'Selección exportada.',
      pista: 'También con clic derecho sobre lo seleccionado y «Exportar la selección…». El margen de 5 mm se cambia en el mismo diálogo.',
      transitorio: true,
      objetivo: () => control('[data-comando="exportar"]', 'inicio'),
      hecho: (ctx) => vio(ctx, 'exportado-seleccion')
    }
  ]
}
