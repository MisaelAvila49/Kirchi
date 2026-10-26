import type { Caja } from '../../piezas/tipos'
import { caja, detenidaTrasCorrer, medidorConSonda, medidorEnSerie, medidorEnSerieDe, modoDe, piezasDe, sitioSerie, tramoEntre, zonaEn } from './condiciones'
import type { CapituloDef, CtxTutorial, Guia, Objetivo } from './tipos'

const zona = (c: Caja | null): Objetivo => (c ? { tipo: 'zona', caja: c } : { tipo: 'ninguno' })
const control = (selector: string, pestana?: string, respaldo?: string): Objetivo => ({ tipo: 'control', selector, ...(pestana ? { pestana } : {}), ...(respaldo ? { respaldo } : {}) })
/** Simular y Detener están en Inicio › Simular; en una ventana angosta el grupo se pliega y se señala su botón. */
const GRUPO_SIMULAR = '[data-grupo="vista-previa"] .boton-grupo'

/** Donde Mediciones, a la derecha, muestra la lectura del multímetro. */
export const LECTURA_MULTIMETRO = '#panel-derecho .fila-instrumento'

/** El icono de Mediciones en el riel derecho: se señala si el panel no está a la vista. */
const RIEL_MEDICIONES = '.riel-boton[data-panel="mediciones"]'
const RIEL_INSPECTOR = '.riel-boton[data-panel="inspector"]'

/** Una función del multímetro en el inspector (V DC, A DC, Ω…): ahí se señala el cambio de función, no el multímetro del lienzo. */
export const modoMultimetro = (modo: string): string => `.modos-multimetro [data-valor="${modo}"]`

const SIMULAR = '[data-comando="simular"]'
const DETENER = '[data-comando="detener"]'

/** El multímetro con su sonda: su pieza y el lugar donde se lee. */
const verMedidor = (ctx: CtxTutorial): Objetivo[] => {
  const m = medidorConSonda(ctx)
  return [...(m ? [zona(caja(ctx, m, 2))] : []), control(RIEL_MEDICIONES)]
}
/** La sombra del multímetro en serie sobre el cable de abajo, girado como en el circuito del capítulo. */
const guiaSerie = (ctx: CtxTutorial): Guia => {
  const s = sitioSerie(ctx)
  return { piezas: medidorEnSerieDe(ctx) ? [] : [{ tipo: 'multimetro', x: s.x, y: s.y, rot: 90 }], cables: [] }
}

/** Capítulo 2: medir con el multímetro (voltaje con la sonda de «Medir», corriente en serie y ohmios con la simulación detenida). Las funciones se eligen en el Inspector y las cifras se leen en Mediciones. */
export const CAPITULO_2: CapituloDef = {
  id: 'medir',
  numero: 2,
  titulo: 'Medir',
  resumen: 'Multímetro, voltaje, corriente y ohmios',
  minutos: 5,
  tono: 'ocre',
  totalPasos: 9,
  arranque: true,
  zona: { minX: -14, minY: -16, maxX: 64, maxY: 24 },
  pasos: [
    {
      id: 'medir-voltaje',
      resumen: 'pon un multímetro con Medir',
      texto: 'Haz {gesto:clic-derecho} sobre el cable entre la resistencia y el LED y elige Medir con el multímetro, Multímetro nuevo.',
      cumplido: 'Multímetro puesto con su sonda.',
      pista: 'La sonda mide el voltaje de ese punto contra la tierra sin tender un cable.',
      objetivo: (ctx) => zona(tramoEntre(ctx, 'resistencia', 'led', 2)),
      hecho: (ctx) => medidorConSonda(ctx) !== undefined
    },
    {
      id: 'simular',
      resumen: 'inicia la vista previa',
      texto: 'Pulsa {tecla:simular} para que el multímetro empiece a medir.',
      cumplido: 'Vista previa en marcha.',
      transitorio: true,
      objetivo: () => control(SIMULAR, 'inicio', GRUPO_SIMULAR),
      focos: verMedidor,
      hecho: (ctx) => ctx.fase !== 'detenida' && medidorConSonda(ctx) !== undefined
    },
    {
      id: 'lectura',
      abre: 'mediciones',
      resumen: 'lee el voltaje en Mediciones',
      texto: 'Lee el voltaje en Mediciones, a la derecha.',
      cumplido: 'Voltaje a la vista.',
      pista: 'Si el panel está plegado o muestra otro, ábrelo con su icono.',
      transitorio: true,
      objetivo: () => ({ tipo: 'control', selector: LECTURA_MULTIMETRO, respaldo: RIEL_MEDICIONES }),
      focos: (ctx) => {
        const m = medidorConSonda(ctx)
        return m ? [zona(caja(ctx, m, 2))] : []
      },
      hecho: (ctx) => {
        const m = medidorConSonda(ctx)
        return !!m && modoDe(ctx, m) === 'V DC' && ctx.fase !== 'detenida' && ctx.derecho === 'mediciones'
      }
    },
    {
      id: 'detener',
      resumen: 'detén la vista previa',
      texto: 'Detén la vista previa con {tecla:detener}: un multímetro en serie se cablea con ella detenida.',
      cumplido: 'Vista previa detenida.',
      transitorio: true,
      objetivo: () => control(DETENER, 'inicio', GRUPO_SIMULAR),
      hecho: (ctx) => detenidaTrasCorrer(ctx) && medidorConSonda(ctx) !== undefined
    },
    {
      id: 'serie',
      resumen: 'pon otro multímetro en serie',
      texto: 'Coloca otro multímetro sobre el cable de abajo, donde marca la sombra: {gesto:doble-clic} en un lugar libre, escribe «multímetro» y gíralo con {tecla:girar}.',
      cumplido: 'Multímetro en serie.',
      pista: 'Un cable recto se parte y el multímetro queda en serie.',
      objetivo: (ctx) => zona(zonaEn(sitioSerie(ctx).x, sitioSerie(ctx).y)),
      guia: guiaSerie,
      hecho: (ctx) => medidorEnSerieDe(ctx) !== undefined
    },
    {
      id: 'corriente',
      abre: 'inspector',
      resumen: 'elige A DC en el Inspector',
      texto: 'Haz {gesto:clic} en el multímetro en serie y elige A DC en el Inspector.',
      cumplido: 'Función A DC elegida.',
      pista: 'Un amperímetro va en serie: por él pasa toda la corriente del circuito.',
      // Dos acciones a la vez, cada una con su foco: el multímetro (clic) y la función A DC.
      objetivo: () => ({ tipo: 'control', selector: modoMultimetro('A DC'), respaldo: RIEL_INSPECTOR }),
      focos: (ctx) => {
        const m = medidorEnSerieDe(ctx)
        return m ? [zona(caja(ctx, m, 3))] : []
      },
      hecho: (ctx) => piezasDe(ctx, 'multimetro').some((p) => medidorEnSerie(ctx, p) && modoDe(ctx, p) === 'A DC')
    },
    {
      id: 'lectura-corriente',
      abre: 'mediciones',
      resumen: 'simula y lee la corriente en Mediciones',
      texto: 'Pulsa {tecla:simular} y lee la corriente en Mediciones.',
      cumplido: 'Corriente medida.',
      transitorio: true,
      objetivo: () => control(SIMULAR, 'inicio', GRUPO_SIMULAR),
      focos: () => [control(LECTURA_MULTIMETRO)],
      hecho: (ctx) => ctx.fase !== 'detenida' && ctx.derecho === 'mediciones' && piezasDe(ctx, 'multimetro').some((p) => medidorEnSerie(ctx, p) && modoDe(ctx, p) === 'A DC')
    },
    {
      id: 'ohmios',
      abre: 'inspector',
      resumen: 'elige Ω con la vista previa detenida',
      texto: 'Detén la vista previa con {tecla:detener}, haz {gesto:clic} en el multímetro de la sonda y elige Ω en el Inspector.',
      cumplido: 'Función Ω elegida.',
      pista: 'Con las fuentes apagadas mide la resistencia que ve desde ese punto, la de 1 kΩ.',
      transitorio: true,
      // El multímetro (clic), la función Ω y el botón de detener, a la vez.
      objetivo: () => ({ tipo: 'control', selector: modoMultimetro('Ω'), respaldo: RIEL_INSPECTOR }),
      focos: (ctx) => {
        const m = medidorConSonda(ctx)
        return [...(m ? [zona(caja(ctx, m, 3))] : []), control(DETENER, 'inicio', GRUPO_SIMULAR)]
      },
      hecho: (ctx) => {
        const m = medidorConSonda(ctx)
        return ctx.fase === 'detenida' && !!m && modoDe(ctx, m) === 'Ω'
      }
    },
    {
      id: 'lectura-ohmios',
      abre: 'mediciones',
      resumen: 'lee los ohmios en Mediciones',
      texto: 'Lee los ohmios en Mediciones: son los 1 kΩ de la resistencia.',
      cumplido: 'Ohmios medidos.',
      transitorio: true,
      objetivo: () => ({ tipo: 'control', selector: LECTURA_MULTIMETRO, respaldo: RIEL_MEDICIONES }),
      hecho: (ctx) => {
        const m = medidorConSonda(ctx)
        return ctx.fase === 'detenida' && !!m && modoDe(ctx, m) === 'Ω' && ctx.derecho === 'mediciones'
      }
    }
  ]
}
