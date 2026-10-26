import type { Pieza } from '../../doc/tipos'
import type { Caja } from '../../piezas/tipos'
import {
  cableGuia, caja, circuitoCerrado, detenidaTrasCorrer, hayLed, ledCatodoAbajo, mismoValor, piezaEnSombra, piezaFueraDeSombra, piezasDe, resistenciaCambiada,
  SITIOS, tierraEnLaFuente, unirCajas, valorDe, zonaEn
} from './condiciones'
import type { CapituloDef, CtxTutorial, Guia, Objetivo, PasoDef } from './tipos'

const zona = (c: Caja | null): Objetivo => (c ? { tipo: 'zona', caja: c } : { tipo: 'ninguno' })
const control = (selector: string, pestana?: string, respaldo?: string): Objetivo => ({ tipo: 'control', selector, ...(pestana ? { pestana } : {}), ...(respaldo ? { respaldo } : {}) })
/** Simular y Detener están en Inicio › Simular; en una ventana angosta el grupo se pliega y se señala su botón. */
const GRUPO_SIMULAR = '[data-grupo="vista-previa"] .boton-grupo'
const piezaOZona = (ctx: CtxTutorial, tipo: string, respaldo: { x: number; y: number }): Objetivo => {
  const p = piezasDe(ctx, tipo)[0]
  return p ? zona(caja(ctx, p, 2)) : zona(zonaEn(respaldo.x, respaldo.y))
}
/** El LED a la vista: ahí se ve el resultado de simular y de cambiar el valor. */
const verLed = (ctx: CtxTutorial): Objetivo[] => {
  const d = piezasDe(ctx, 'led')[0]
  return d ? [zona(caja(ctx, d, 2))] : []
}

type Sitio = { x: number; y: number }
type Cumple = (ctx: CtxTutorial) => (p: Pieza) => boolean

const fuente5V: Cumple = (ctx) => (p) => mismoValor(valorDe(ctx, p, 'voltaje'), 5)
const resistencia220: Cumple = (ctx) => (p) => mismoValor(valorDe(ctx, p, 'valor'), 220)
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

/** Los tres cables del circuito, como van entre los pines de las piezas puestas (los que ya están hechos no se dibujan). */
function cablesDelCircuito(ctx: CtxTutorial): Guia {
  const v = piezasDe(ctx, 'fuente-dc')[0], r = piezasDe(ctx, 'resistencia')[0], d = piezasDe(ctx, 'led')[0]
  const cables = [
    cableGuia(ctx, { p: v, pin: '+' }, { p: r, pin: '1' }),
    cableGuia(ctx, { p: r, pin: '2' }, { p: d, pin: 'A' }),
    cableGuia(ctx, { p: d, pin: 'K' }, { p: v, pin: '-' })
  ].filter((c): c is Sitio[] => c !== null)
  return { piezas: [], cables }
}

/** Capítulo 1: fuente de 5 V, resistencia de 220 Ω y LED, de la primera pieza a la vista previa. */
export const CAPITULO_1: CapituloDef = {
  id: 'primer-circuito',
  numero: 1,
  titulo: 'Tu primer circuito',
  resumen: 'Fuente, resistencia y LED',
  minutos: 6,
  tono: 'verdeazul',
  totalPasos: 9,
  documentoNuevo: true,
  zona: { minX: -14, minY: -16, maxX: 48, maxY: 24 },
  pasos: [
    {
      id: 'fuente',
      abre: 'libreria',
      resumen: 'coloca la fuente de 5 V',
      texto: 'Coloca una fuente de 5 V sobre la sombra. Haz {gesto:doble-clic} en el lienzo y escribe «fuente dc 5».',
      cumplido: 'Fuente colocada.',
      pista: 'La fuente de voltaje DC trae 5 V por omisión.',
      ...colocar('fuente-dc', SITIOS.fuente, 0, undefined, fuente5V)
    },
    {
      id: 'resistencia',
      resumen: 'coloca la resistencia de 220 Ω',
      texto: 'Coloca una resistencia de 220 Ω sobre la sombra. Haz {gesto:doble-clic} en el lienzo y escribe «r 220».',
      cumplido: 'Resistencia colocada.',
      ...colocar('resistencia', SITIOS.resistencia, 0, { valor: '220' }, resistencia220),
      // Después el paso «valor» la cambia: al retomar basta una resistencia sobre su sombra.
      sigueVigente: (ctx) => piezaEnSombra(ctx, 'resistencia', SITIOS.resistencia)
    },
    {
      id: 'led',
      resumen: 'coloca el LED',
      texto: 'Coloca un LED sobre la sombra. Haz {gesto:doble-clic} en el lienzo y escribe «led».',
      cumplido: 'LED colocado.',
      ...colocar('led', SITIOS.led, 0, undefined)
    },
    {
      id: 'girar',
      resumen: 'gira el LED con la tecla de giro',
      texto: 'Selecciona el LED con {gesto:clic} y pulsa {tecla:girar} hasta que el cátodo (la barra) quede abajo.',
      cumplido: 'LED girado.',
      pista: 'Cada pulsación gira la pieza 90 grados.',
      objetivo: (ctx) => piezaOZona(ctx, 'led', SITIOS.led),
      guia: (ctx) => ({ piezas: ledCatodoAbajo(ctx) || !hayLed(ctx) ? [] : [{ tipo: 'led', x: SITIOS.led.x, y: SITIOS.led.y, rot: 90 }], cables: [] }),
      hecho: ledCatodoAbajo
    },
    {
      id: 'cables',
      resumen: 'une los pines con cables',
      texto: 'Une las piezas con cables siguiendo las líneas punteadas: haz {gesto:clic} en un pin y luego en otro.',
      cumplido: 'Circuito cerrado.',
      pista: 'Un doble clic derecho sobre un cable lo borra si te equivocas.',
      objetivo: (ctx) => zona(unirCajas(['fuente-dc', 'resistencia', 'led'].flatMap((t) => piezasDe(ctx, t).slice(0, 1).map((p) => caja(ctx, p, 2))))),
      guia: cablesDelCircuito,
      hecho: circuitoCerrado
    },
    {
      id: 'tierra',
      resumen: 'pon una tierra en el − de la fuente',
      texto: 'Pulsa {tecla:tierra} para colocar una tierra sobre la sombra y únela al − de la fuente con un cable.',
      cumplido: 'Tierra conectada.',
      pista: 'La tierra es el cero del circuito: todos los voltajes se miden contra ella.',
      objetivo: () => zona(zonaEn(SITIOS.tierra.x, SITIOS.tierra.y)),
      guia: (ctx) => {
        const v = piezasDe(ctx, 'fuente-dc')[0], g = piezasDe(ctx, 'tierra')[0]
        const cable = g ? cableGuia(ctx, { p: v, pin: '-' }, { p: g, pin: '1' }) : [{ x: SITIOS.fuente.x, y: SITIOS.fuente.y + 4 }, { x: SITIOS.tierra.x, y: SITIOS.tierra.y }]
        return { piezas: g ? [] : [{ tipo: 'tierra', x: SITIOS.tierra.x, y: SITIOS.tierra.y, rot: 0 }], cables: cable ? [cable] : [] }
      },
      hecho: tierraEnLaFuente
    },
    {
      id: 'simular',
      resumen: 'simula con la tecla de simular',
      texto: 'Pulsa {tecla:simular} para iniciar la vista previa.',
      cumplido: 'Vista previa en marcha.',
      transitorio: true,
      objetivo: () => control('[data-comando="simular"]', 'inicio', GRUPO_SIMULAR),
      focos: verLed,
      hecho: (ctx) => ctx.fase !== 'detenida' && circuitoCerrado(ctx)
    },
    {
      id: 'valor',
      resumen: 'cambia el valor de la resistencia',
      texto: 'Haz {gesto:doble-clic} en la resistencia y cambia su valor, por ejemplo a 1k.',
      cumplido: 'Valor cambiado.',
      objetivo: (ctx) => piezaOZona(ctx, 'resistencia', SITIOS.resistencia),
      focos: verLed,
      hecho: resistenciaCambiada
    },
    {
      id: 'detener',
      resumen: 'detén la vista previa',
      texto: 'Detén la vista previa con {tecla:detener}.',
      cumplido: 'Vista previa detenida.',
      transitorio: true,
      objetivo: () => control('[data-comando="detener"]', 'inicio', GRUPO_SIMULAR),
      hecho: (ctx) => detenidaTrasCorrer(ctx) && circuitoCerrado(ctx)
    }
  ]
}
