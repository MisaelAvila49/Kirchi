import type { Pieza } from '../../doc/tipos'
import {
  cableGuia, caja, circuitoCerrado, copiaEnLaResistencia, detenidaTrasCorrer, etiquetaDuplicada, etiquetaGirada, etiquetasEnElTerminal, fuenteYCableBorrados, hayLed, hayNota, ledAlimentadoPorEtiqueta, ledCatodoAbajo, mismoValor,
  nombreDe5V, pinDe, pinLibreDeResistencia, piezaEnSombra, piezasDe, resistenciaCambiada, SITIOS, terminalConCable, textoDe, tierraEnLaFuente, unirCajas, valorDe, zonaEn
} from './condiciones'
import { colocar, control, DETENER, GRUPO_SIMULAR, PANEL_IZQUIERDO, piezaOZona, SIMULAR, zona } from './pasos'
import type { CapituloDef, CtxTutorial, Guia, Objetivo } from './tipos'

type Sitio = { x: number; y: number }
type Cumple = (ctx: CtxTutorial) => (p: Pieza) => boolean

/** Donde va el circuito: se señala mientras falta alguna pieza. */
const ZONA_CIRCUITO = { minX: -14, minY: -20, maxX: 48, maxY: 24 }

/** El LED a la vista: ahí se ve el resultado de simular y de cambiar el valor. */
const verLed = (ctx: CtxTutorial): Objetivo[] => {
  const d = piezasDe(ctx, 'led')[0]
  return d ? [zona(caja(ctx, d, 2))] : []
}

/** Un paso de antes de borrar la fuente: al retomar basta con que el circuito siga armado sin ella. */
const aunSinFuente = (hecho: (ctx: CtxTutorial) => boolean) => (ctx: CtxTutorial): boolean =>
  hecho(ctx) || (piezasDe(ctx, 'fuente-dc').length === 0 && hayLed(ctx) && piezasDe(ctx, 'resistencia').length > 0)

/** El cable de 8 unidades que baja del pin del terminal VCC hasta la altura de la resistencia. */
const CABLE_VCC = [{ x: SITIOS.vcc.x, y: SITIOS.vcc.y }, { x: SITIOS.vcc.x, y: SITIOS.vcc.y + 8 }]
const terminal5V: Cumple = (ctx) => (p) => nombreDe5V(textoDe(ctx, p, 'nombre') ?? '')
/** Una caja de ancho por alto unidades centrada en (x, y): enmarca un tramo de cable o una etiqueta. */
const alrededorDe = (x: number, y: number, ancho = 8, alto = 6) => ({ minX: x - ancho / 2, minY: y - alto / 2, maxX: x + ancho / 2, maxY: y + alto / 2 })
/** Donde se pone la etiqueta: a media altura del cable del terminal, con lugar para su tramo a la derecha. */
const sobreElCable = alrededorDe(CABLE_VCC[0].x + 3, (CABLE_VCC[0].y + CABLE_VCC[1].y) / 2, 12, 8)
const deLaEtiqueta = (ctx: CtxTutorial) => {
  const e = etiquetasEnElTerminal(ctx)[0]
  return e ? alrededorDe(e.x, e.y, 10, 8) : sobreElCable
}

const fuente5V: Cumple = (ctx) => (p) => mismoValor(valorDe(ctx, p, 'voltaje'), 5)
const resistencia220: Cumple = (ctx) => (p) => mismoValor(valorDe(ctx, p, 'valor'), 220)

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

/**
 * Capítulo 2: fuente de 5 V, resistencia de 220 Ω y LED, de la primera pieza a la vista previa; después una nota y el cambio de la fuente por un terminal VCC, una etiqueta de red girada, su copia (Ctrl+D) unida a la resistencia y la vista previa. Parte de un lienzo vacío.
 */
export const CAPITULO_2: CapituloDef = {
  id: 'circuito',
  numero: 2,
  titulo: 'Tu primer circuito',
  resumen: 'Fuente, resistencia y LED, una nota y etiquetas de red',
  descripcion: 'Arma un circuito con una fuente, una resistencia y un LED, simúlalo y cambia un valor en vivo. Después escribe una nota y cambia la fuente por un terminal VCC unido con etiquetas de red.',
  minutos: 8,
  tono: 'azul',
  totalPasos: 19,
  documentoNuevo: true,
  zona: ZONA_CIRCUITO,
  pasos: [
    {
      id: 'fuente',
      abre: 'libreria',
      resumen: 'coloca la fuente de 5 V',
      texto: 'Haz {gesto:doble-clic} en el lienzo y escribe {codigo:fuente dc 5}.',
      cumplido: 'Fuente colocada.',
      pista: 'Pon la fuente sobre la sombra. Trae 5 V por omisión.',
      ...colocar('fuente-dc', SITIOS.fuente, 0, undefined, fuente5V),
      // Más adelante se borra: al retomar basta con que el circuito siga armado sin ella.
      sigueVigente: aunSinFuente((ctx) => piezaEnSombra(ctx, 'fuente-dc', SITIOS.fuente, fuente5V(ctx)))
    },
    {
      id: 'resistencia',
      resumen: 'coloca la resistencia de 220 Ω',
      texto: 'Haz {gesto:doble-clic} en el lienzo y escribe {codigo:r 220}.',
      cumplido: 'Resistencia colocada.',
      pista: 'Se escribe la letra r, un espacio y el valor: con solo 220 no se sabe qué pieza es.',
      ...colocar('resistencia', SITIOS.resistencia, 0, { valor: '220' }, resistencia220),
      // Después el paso «valor» la cambia: al retomar basta una resistencia sobre su sombra.
      sigueVigente: (ctx) => piezaEnSombra(ctx, 'resistencia', SITIOS.resistencia)
    },
    {
      id: 'led',
      abre: 'libreria',
      resumen: 'arrastra el LED desde la Librería',
      texto: '{gesto:arrastrar} Arrastra el LED desde la {icono:libreria|Librería} hasta la sombra.',
      pista: 'Es la segunda forma de colocar una pieza. Búscalo por su nombre en la lista.',
      cumplido: 'LED colocado.',
      ...colocar('led', SITIOS.led, 0, undefined),
      focos: () => [control(PANEL_IZQUIERDO)]
    },
    {
      id: 'girar',
      resumen: 'gira el LED con la tecla de giro',
      texto: 'Selecciona el LED y pulsa {tecla:girar} hasta que la barra quede abajo.',
      cumplido: 'LED girado.',
      pista: 'La barra es el cátodo. Cada pulsación gira la pieza 90 grados.',
      objetivo: (ctx) => piezaOZona(ctx, 'led', SITIOS.led),
      guia: (ctx) => ({ piezas: ledCatodoAbajo(ctx) || !hayLed(ctx) ? [] : [{ tipo: 'led', x: SITIOS.led.x, y: SITIOS.led.y, rot: 90 }], cables: [] }),
      hecho: ledCatodoAbajo
    },
    {
      id: 'cables',
      resumen: 'une los pines con cables',
      texto: 'Une los pines con cables siguiendo las líneas punteadas.',
      cumplido: 'Circuito cerrado.',
      pista: 'Clic en un pin y luego en otro. Un doble clic derecho sobre un cable lo borra.',
      objetivo: (ctx) => zona(unirCajas(['fuente-dc', 'resistencia', 'led'].flatMap((t) => piezasDe(ctx, t).slice(0, 1).map((p) => caja(ctx, p, 2)))) ?? ZONA_CIRCUITO),
      guia: cablesDelCircuito,
      hecho: circuitoCerrado,
      sigueVigente: aunSinFuente(circuitoCerrado)
    },
    {
      id: 'tierra',
      resumen: 'pon una tierra en el − de la fuente',
      texto: 'Pulsa {tecla:tierra} para poner la tierra y únela al − de la fuente.',
      cumplido: 'Tierra conectada.',
      pista: 'La tierra es el cero del circuito: los voltajes se miden contra ella.',
      objetivo: () => zona(zonaEn(SITIOS.tierra.x, SITIOS.tierra.y)),
      guia: (ctx) => {
        const v = piezasDe(ctx, 'fuente-dc')[0], g = piezasDe(ctx, 'tierra')[0]
        const cable = g ? cableGuia(ctx, { p: v, pin: '-' }, { p: g, pin: '1' }) : [{ x: SITIOS.fuente.x, y: SITIOS.fuente.y + 4 }, { x: SITIOS.tierra.x, y: SITIOS.tierra.y }]
        return { piezas: g ? [] : [{ tipo: 'tierra', x: SITIOS.tierra.x, y: SITIOS.tierra.y, rot: 0 }], cables: cable ? [cable] : [] }
      },
      hecho: tierraEnLaFuente,
      sigueVigente: aunSinFuente(tierraEnLaFuente)
    },
    {
      id: 'simular',
      resumen: 'simula con la tecla de simular',
      texto: 'Pulsa {tecla:simular} para simular.',
      pista: 'El LED se enciende si el circuito está cerrado.',
      cumplido: 'Vista previa en marcha.',
      transitorio: true,
      objetivo: () => control(SIMULAR, 'inicio', GRUPO_SIMULAR),
      focos: verLed,
      hecho: (ctx) => ctx.fase !== 'detenida' && circuitoCerrado(ctx)
    },
    {
      id: 'valor',
      resumen: 'cambia el valor de la resistencia en vivo',
      texto: 'Con la simulación en marcha, haz {gesto:doble-clic} en la resistencia y escribe {codigo:1k}.',
      pista: 'Los valores se ajustan en vivo y el LED cambia de brillo. Piezas y cables esperan a detenerla.',
      cumplido: 'Valor cambiado.',
      objetivo: (ctx) => piezaOZona(ctx, 'resistencia', SITIOS.resistencia),
      focos: verLed,
      hecho: resistenciaCambiada
    },
    {
      id: 'voltajes',
      resumen: 'muestra los voltajes',
      texto: 'Pulsa {tecla:voltajes} para ver el voltaje de cada red.',
      pista: 'Con la simulación en marcha, cada red muestra el suyo.',
      cumplido: 'Voltajes a la vista.',
      transitorio: true,
      objetivo: () => control('[data-comando="voltajes"]'),
      hecho: (ctx) => ctx.voltajes === true && ctx.fase !== 'detenida'
    },
    {
      id: 'detener',
      resumen: 'detén la vista previa',
      texto: 'Pulsa {tecla:detener} para detener.',
      pista: 'El circuito queda como estaba y se puede editar otra vez.',
      cumplido: 'Vista previa detenida.',
      transitorio: true,
      objetivo: () => control(DETENER, 'inicio', GRUPO_SIMULAR),
      hecho: (ctx) => detenidaTrasCorrer(ctx) && circuitoCerrado(ctx)
    },
    {
      id: 'nota',
      resumen: 'escribe una nota de texto',
      texto: 'Escribe una {icono:nota|Nota} de texto con {tecla:nota}.',
      pista: 'Sirve para explicar el circuito y no afecta a la simulación.',
      cumplido: 'Nota escrita.',
      transitorio: true,
      objetivo: () => control('[data-comando="nota"]', 'inicio'),
      hecho: hayNota
    },
    {
      id: 'borrar-fuente',
      resumen: 'borra la fuente y su cable',
      texto: 'Borra la fuente y el cable que salía de su + con {tecla:borrar}.',
      pista: 'Selecciona cada uno, pulsa la tecla y repite con el otro.',
      cumplido: 'Fuente y cable borrados.',
      objetivo: (ctx) => {
        const v = piezasDe(ctx, 'fuente-dc')[0], l = pinLibreDeResistencia(ctx)
        const cajas = [...(v ? [caja(ctx, v, 2)] : []), ...(l ? [caja(ctx, l.r, 2)] : [])]
        return zona(unirCajas(cajas) ?? zonaEn(SITIOS.fuente.x, SITIOS.fuente.y))
      },
      hecho: fuenteYCableBorrados
    },
    {
      id: 'terminal',
      abre: 'libreria',
      resumen: 'coloca un terminal VCC de 5 V',
      texto: 'Coloca un terminal de {icono:alimentacion|Alimentación} sobre la sombra. Se llama VCC y da 5 V.',
      pista: 'VCC es el nombre del riel de 5 V: no hace falta escribir el voltaje.',
      cumplido: 'Terminal VCC colocado.',
      ...colocar('alimentacion', SITIOS.vcc, 0, { nombre: 'VCC' }, terminal5V),
      focos: () => [control('[data-comando="alimentacion"]', 'inicio')]
    },
    {
      id: 'cable-terminal',
      resumen: 'tiende un cable desde el terminal',
      texto: 'Tiende un cable corto hacia abajo desde el pin del terminal, sobre la línea punteada.',
      pista: 'Clic en el pin y doble clic en el otro extremo: en el vacío así termina el cable.',
      cumplido: 'Cable tendido.',
      objetivo: () => zona(alrededorDe(CABLE_VCC[0].x, (CABLE_VCC[0].y + CABLE_VCC[1].y) / 2, 8, 12)),
      guia: (ctx) => ({ piezas: [], cables: terminalConCable(ctx) ? [] : [CABLE_VCC] }),
      hecho: terminalConCable
    },
    {
      id: 'etiqueta-vcc',
      resumen: 'pon una etiqueta VCC sobre el cable',
      texto: 'Con el cursor sobre ese cable, pulsa {tecla:etiqueta} y escribe {codigo:VCC}.',
      pista: 'Una etiqueta llamada VCC recibe también los 5 V.',
      cumplido: 'Etiqueta VCC colocada.',
      objetivo: () => zona(sobreElCable),
      hecho: (ctx) => etiquetasEnElTerminal(ctx).length > 0
    },
    {
      id: 'girar-etiqueta',
      resumen: 'gira la etiqueta',
      texto: 'Con la etiqueta seleccionada, gírala con {tecla:girar}.',
      pista: 'Cada pulsación gira 90 grados. La copia conservará este giro.',
      cumplido: 'Etiqueta girada.',
      objetivo: (ctx) => zona(deLaEtiqueta(ctx)),
      hecho: etiquetaGirada
    },
    {
      id: 'duplicar-etiqueta',
      resumen: 'duplica la etiqueta',
      texto: 'Con la etiqueta seleccionada, duplícala con {tecla:duplicar}.',
      pista: 'Si se deselecciona, haz clic sobre ella. La copia aparece junto al cursor, en un lugar libre.',
      cumplido: 'Etiqueta duplicada.',
      objetivo: (ctx) => zona(deLaEtiqueta(ctx)),
      hecho: etiquetaDuplicada
    },
    {
      id: 'unir-copia',
      resumen: 'une la copia a la resistencia',
      texto: 'Arrastra la copia hasta el extremo libre de la resistencia y únela con un cable.',
      pista: 'Mismo nombre, misma red: los 5 V llegan sin cable hasta el terminal.',
      cumplido: 'Resistencia unida a la etiqueta.',
      objetivo: (ctx) => {
        const l = pinLibreDeResistencia(ctx), q = l && pinDe(ctx, l.r, l.pin)
        return zona(q ? alrededorDe(q.x - 4, q.y, 14, 8) : alrededorDe(8, -4, 14, 8))
      },
      guia: (ctx) => {
        const l = pinLibreDeResistencia(ctx), q = l && pinDe(ctx, l.r, l.pin)
        return { piezas: [], cables: !q || copiaEnLaResistencia(ctx) ? [] : [[{ x: q.x, y: q.y }, { x: q.x - 4, y: q.y }]] }
      },
      hecho: (ctx) => copiaEnLaResistencia(ctx) !== undefined
    },
    {
      id: 'simular-etiquetas',
      resumen: 'simula con la tecla de simular',
      texto: 'Pulsa {tecla:simular} para simular: el LED se enciende.',
      pista: 'Los 5 V llegan al LED por las etiquetas, sin cable desde el terminal.',
      cumplido: 'LED encendido.',
      transitorio: true,
      objetivo: () => control(SIMULAR, 'inicio', GRUPO_SIMULAR),
      focos: verLed,
      hecho: ledAlimentadoPorEtiqueta
    }
  ]
}
