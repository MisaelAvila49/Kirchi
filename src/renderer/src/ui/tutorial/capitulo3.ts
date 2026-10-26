import type { Caja } from '../../piezas/tipos'
import { colocar } from './capitulo1'
import { baseDelOsciloscopio, capacitorEnRC, caja, enSombra, generadorConectado, mismoValor, piezasDe, SITIOS, sitioGenerador, sondaDeOsciloscopio, textoDe, unirCajas, valorDe, zonaEn } from './condiciones'
import type { CapituloDef, CtxTutorial, Guia, Objetivo } from './tipos'

const zona = (c: Caja | null): Objetivo => (c ? { tipo: 'zona', caja: c } : { tipo: 'ninguno' })
const control = (selector: string, pestana?: string, respaldo?: string): Objetivo => ({ tipo: 'control', selector, ...(pestana ? { pestana } : {}), ...(respaldo ? { respaldo } : {}) })
/** Simular está en Inicio › Simular; en una ventana angosta el grupo se pliega y se señala su botón. */
const GRUPO_SIMULAR = '[data-grupo="vista-previa"] .boton-grupo'
const sobre = (ctx: CtxTutorial, tipo: string, respaldo: { x: number; y: number }): Objetivo => {
  const p = piezasDe(ctx, tipo)[0]
  return p ? zona(caja(ctx, p, 2)) : zona(zonaEn(respaldo.x, respaldo.y))
}

/** El inspector y el osciloscopio: donde aparecen las formas de onda, los ajustes del generador y las lecturas. */
const INSPECTOR = 'aside.inspector'
const PANTALLA_OSC = '#instrumentos-panel'
/** El botón Cursores de la barra del instrumento (el de Pausar también cambia de estado: se elige por su acción, no por aria-pressed). */
export const BOTON_CURSORES = '.barra-instrumento [data-accion="cursores"]'
const verOsciloscopio = (ctx: CtxTutorial): Objetivo[] => {
  const o = piezasDe(ctx, 'osciloscopio')[0]
  return [...(o ? [zona(caja(ctx, o, 2))] : []), control(PANTALLA_OSC)]
}

/** La sombra del generador y el cable de su COM a la tierra, que da la vuelta por la izquierda como en el circuito del capítulo. */
const guiaGenerador = (ctx: CtxTutorial): Guia => {
  const g = piezasDe(ctx, 'generador')[0]
  const puesto = !!g && Math.abs(g.x - SITIOS.generador.x) <= 1 && Math.abs(g.y - SITIOS.generador.y) <= 1 && g.rot === 180
  return {
    piezas: puesto ? [] : [{ tipo: 'generador', x: SITIOS.generador.x, y: SITIOS.generador.y, rot: 180, props: { forma: 'Cuadrada', frecuencia: '1' } }],
    cables: generadorConectado(ctx) ? [] : [[{ x: 0, y: -16 }, { x: -6, y: -16 }, { x: -6, y: 12 }, { x: 0, y: 12 }]]
  }
}

/** La sombra del capacitor de 100 µF y sus dos cables: al cable de la resistencia al LED y a la tierra. */
const guiaCapacitor = (ctx: CtxTutorial): Guia => {
  const hecho = capacitorEnRC(ctx)
  return {
    piezas: hecho ? [] : [{ tipo: 'capacitor', x: SITIOS.capacitor.x, y: SITIOS.capacitor.y, rot: 90, props: { valor: '100u' } }],
    cables: hecho ? [] : [[{ x: 32, y: -4 }, { x: 40, y: -4 }], [{ x: 40, y: 4 }, { x: 40, y: 12 }, { x: 0, y: 12 }]]
  }
}

/** Capítulo 3: el generador cuadrado de 1 Hz, un capacitor y el osciloscopio de dos canales. */
export const CAPITULO_3: CapituloDef = {
  id: 'senales',
  numero: 3,
  titulo: 'Señales',
  resumen: 'Generador, capacitor y osciloscopio',
  minutos: 8,
  tono: 'azul',
  totalPasos: 10,
  arranque: true,
  zona: { minX: -14, minY: -24, maxX: 56, maxY: 40 },
  pasos: [
    {
      id: 'generador',
      resumen: 'cambia la fuente por un generador',
      texto: 'Cambia la fuente por un generador: bórrala con Supr, coloca un generador sobre la sombra («generador») y une su COM a la tierra.',
      cumplido: 'Generador conectado.',
      pista: 'Para cablear, haz clic en el pin COM y luego en la tierra.',
      lado: 'derecha',
      guia: guiaGenerador,
      objetivo: (ctx) => {
        // Mientras la fuente siga puesta se señala junto con el lugar del generador: hay que borrarla y poner el otro arriba.
        const sitio = zonaEn(sitioGenerador(ctx).x, sitioGenerador(ctx).y)
        const f = piezasDe(ctx, 'fuente-dc')[0]
        return zona(f ? unirCajas([caja(ctx, f, 2), sitio]) : sitio)
      },
      hecho: (ctx) => piezasDe(ctx, 'fuente-dc').length === 0 && generadorConectado(ctx)
    },
    {
      id: 'cuadrada',
      abre: 'inspector',
      resumen: 'elige onda cuadrada de 1 Hz',
      texto: 'Haz {gesto:clic} en el generador y elige en el inspector la forma Cuadrada y 1 Hz.',
      cumplido: 'Cuadrada de 1 Hz.',
      objetivo: (ctx) => sobre(ctx, 'generador', sitioGenerador(ctx)),
      focos: () => [control(INSPECTOR)],
      hecho: (ctx) => piezasDe(ctx, 'generador').some((g) => textoDe(ctx, g, 'forma') === 'Cuadrada' && mismoValor(valorDe(ctx, g, 'frecuencia'), 1))
    },
    {
      id: 'capacitor',
      resumen: 'agrega un capacitor de 100 µF',
      texto: 'Coloca un capacitor de 100 µF sobre la sombra («c 100u»), gíralo con {tecla:girar} y une un pin al cable entre la resistencia y el LED y el otro a la tierra.',
      cumplido: 'Capacitor en el circuito RC.',
      objetivo: () => zona(zonaEn(SITIOS.capacitor.x, SITIOS.capacitor.y)),
      guia: guiaCapacitor,
      // Uno sin girar (o en otro lugar) no cubre la sombra: el globo dice que se coloque sobre ella.
      fueraDeSombra: (ctx) => piezasDe(ctx, 'capacitor').length > 0 && !capacitorEnRC(ctx) && !piezasDe(ctx, 'capacitor').some((c) => enSombra(c, { ...SITIOS.capacitor, rot: 90 })),
      hecho: capacitorEnRC
    },
    {
      id: 'osciloscopio',
      resumen: 'coloca el osciloscopio',
      texto: 'Coloca un osciloscopio sobre la sombra: {gesto:doble-clic} en el lienzo y escribe «osciloscopio».',
      cumplido: 'Osciloscopio colocado.',
      ...colocar('osciloscopio', SITIOS.osciloscopio, 0, undefined)
    },
    {
      id: 'canal-a',
      resumen: 'mide el generador en el canal A',
      texto: 'Haz {gesto:clic-derecho} sobre el cable de la salida del generador y elige Medir con el osciloscopio, Entrada A.',
      cumplido: 'Canal A en la salida del generador.',
      objetivo: (ctx) => sobre(ctx, 'generador', sitioGenerador(ctx)),
      focos: verOsciloscopio,
      hecho: (ctx) => piezasDe(ctx, 'osciloscopio').length > 0 && sondaDeOsciloscopio(ctx, 'A')
    },
    {
      id: 'canal-b',
      resumen: 'mide el capacitor en el canal B',
      texto: 'Haz {gesto:clic-derecho} sobre un cable del capacitor y elige Medir con el osciloscopio, Entrada B.',
      cumplido: 'Canal B en el capacitor.',
      objetivo: (ctx) => sobre(ctx, 'capacitor', { x: 40, y: 0 }),
      focos: verOsciloscopio,
      hecho: (ctx) => piezasDe(ctx, 'osciloscopio').length > 0 && sondaDeOsciloscopio(ctx, 'B')
    },
    {
      id: 'simular',
      resumen: 'simula y abre la pestaña Osciloscopio',
      texto: 'Pulsa {tecla:simular} y abre la pestaña Osciloscopio de la franja de abajo.',
      cumplido: 'Dos canales a la vista.',
      transitorio: true,
      objetivo: () => control('#pestaña-osciloscopio'),
      // Dos acciones: el botón de simular y la pestaña Osciloscopio, con el osciloscopio del lienzo y su pantalla a la vista.
      focos: (ctx) => {
        const o = piezasDe(ctx, 'osciloscopio')[0]
        return [...(o ? [zona(caja(ctx, o, 2))] : []), control('[data-comando="simular"]', 'inicio', GRUPO_SIMULAR), control(PANTALLA_OSC)]
      },
      hecho: (ctx) => ctx.fase !== 'detenida' && ctx.franja === 'osciloscopio' && sondaDeOsciloscopio(ctx, 'A') && sondaDeOsciloscopio(ctx, 'B')
    },
    {
      id: 'tiempo',
      abre: 'osciloscopio',
      resumen: 'cambia el Tiempo/div a 100 ms',
      texto: 'Pon el Tiempo/div en 100 ms con la {gesto:rueda} sobre el eje del tiempo, arriba de la pantalla.',
      cumplido: 'Base de tiempo en 100 ms.',
      pista: 'Con 1 ms por división solo se ve un tramo de la onda.',
      objetivo: () => control('.osc-pantalla'),
      hecho: (ctx) => {
        const b = baseDelOsciloscopio(ctx)
        return b !== null && b >= 0.05 && b <= 0.2
      }
    },
    {
      id: 'disparo',
      abre: 'osciloscopio',
      resumen: 'dispara con el canal B',
      texto: 'En el cuadro Disparo elige el canal B como fuente.',
      cumplido: 'Disparo en el canal B.',
      objetivo: () => control('.osc-disparo'),
      hecho: (ctx) => piezasDe(ctx, 'osciloscopio').some((o) => textoDe(ctx, o, 'disp_fuente') === 'B')
    },
    {
      id: 'cursores',
      abre: 'osciloscopio',
      resumen: 'enciende los cursores',
      texto: 'Pulsa Cursores, en la barra de arriba de la pantalla, y arrastra las dos líneas para leer el tiempo y el voltaje.',
      cumplido: 'Cursores encendidos.',
      transitorio: true,
      objetivo: () => control(BOTON_CURSORES),
      hecho: (ctx) => ctx.cursores === true
    }
  ]
}
