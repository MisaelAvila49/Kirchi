import type { Caja } from '../../piezas/tipos'
import { colocar } from './capitulo1'
import { mismoValor, valorDe, vio, zonaEn } from './condiciones'
import type { CapituloDef, CtxTutorial, Objetivo } from './tipos'

const zona = (c: Caja | null): Objetivo => (c ? { tipo: 'zona', caja: c } : { tipo: 'ninguno' })
const control = (selector: string, pestana?: string): Objetivo => ({ tipo: 'control', selector, ...(pestana ? { pestana } : {}) })

/** Un lugar libre a la derecha de todo lo dibujado (el multímetro de voltaje llega a x = 56): ahí va la resistencia nueva. Fijo, para que la sombra no se mueva al colocarla. */
export const SITIO_VALOR = { x: 70, y: -4 } as const
export const sitioLibre = (_ctx?: CtxTutorial): { x: number; y: number } => SITIO_VALOR

/** Capítulo 5: atajos y gestos que ahorran tiempo. Las teclas de cada paso salen de la tabla real de atajos. */
export const CAPITULO_5: CapituloDef = {
  id: 'trucos',
  numero: 5,
  titulo: 'Trucos',
  resumen: 'Lienzo limpio, buscar valores, clic derecho, encuadrar, rejilla fina, Ctrl+K y atajos',
  minutos: 5,
  tono: 'naranja',
  totalPasos: 10,
  arranque: true,
  zona: { minX: -14, minY: -26, maxX: 84, maxY: 40 },
  pasos: [
    {
      id: 'limpio',
      resumen: 'deja el lienzo limpio',
      texto: 'Pulsa {tecla:limpio} para ocultar los paneles y quedarte solo con el lienzo.',
      cumplido: 'Lienzo limpio.',
      transitorio: true,
      objetivo: () => control('[data-comando="limpio"]', 'vista'),
      hecho: (ctx) => ctx.limpio === true
    },
    {
      id: 'encuadrar',
      resumen: 'encuadra el circuito con el lienzo limpio',
      texto: 'Aléjate o acércate con la {gesto:rueda} y pulsa {tecla:encuadrar}.',
      cumplido: 'Circuito encuadrado.',
      pista: 'Sigues en el lienzo limpio: el siguiente paso trae los paneles de vuelta.',
      transitorio: true,
      // Sin paneles ni cinta no hay botón que señalar: el paso se hace con la tecla y solo vale con el lienzo limpio.
      objetivo: () => ({ tipo: 'ninguno' }),
      hecho: (ctx) => ctx.limpio === true && vio(ctx, 'encuadrar')
    },
    {
      id: 'volver',
      resumen: 'trae los paneles de vuelta',
      texto: 'Pulsa {tecla:limpio} otra vez para volver a ver los paneles.',
      cumplido: 'Paneles de vuelta.',
      transitorio: true,
      objetivo: () => ({ tipo: 'ninguno' }),
      hecho: (ctx) => ctx.limpio === false
    },
    {
      id: 'valor',
      resumen: 'coloca una resistencia escribiendo su valor',
      texto: 'Haz {gesto:doble-clic} en el lienzo y escribe «r 4k7» para colocar una resistencia de 4.7 kΩ.',
      cumplido: 'Resistencia de 4.7 kΩ colocada.',
      // Los pasos de clic derecho que siguen la borran: al retomar basta con que el paso ya se haya hecho una vez (su resultado no está en el documento).
      sigueVigente: () => true,
      ...colocar('resistencia', SITIO_VALOR, 0, { valor: '4k7' }, (ctx) => (p) => mismoValor(valorDe(ctx, p, 'valor'), 4700))
    },
    {
      id: 'cancelar-cable',
      resumen: 'cancela un cable a medio trazar con el clic derecho',
      texto: 'Haz {gesto:clic} en un pin de la resistencia nueva y, sin terminar el cable, {gesto:clic-derecho} en un lugar libre.',
      cumplido: 'Cable cancelado.',
      pista: 'El clic derecho cancela lo que esté a medias, y Esc también.',
      transitorio: true,
      objetivo: () => zona(zonaEn(SITIO_VALOR.x, SITIO_VALOR.y)),
      hecho: (ctx) => vio(ctx, 'cable-cancelado')
    },
    {
      id: 'menu-pieza',
      resumen: 'abre el menú de una pieza con el clic derecho',
      texto: 'Haz {gesto:clic-derecho} sobre la resistencia nueva para abrir su menú.',
      cumplido: 'Menú de la pieza abierto.',
      pista: 'Sobre un cable, una etiqueta o un espacio libre el menú cambia: cada cosa trae el suyo.',
      transitorio: true,
      objetivo: () => zona(zonaEn(SITIO_VALOR.x, SITIO_VALOR.y)),
      hecho: (ctx) => vio(ctx, 'menu-pieza')
    },
    {
      id: 'borrar-derecho',
      resumen: 'borra una pieza con doble clic derecho',
      texto: 'Haz {gesto:doble-clic-derecho} sobre la resistencia nueva para borrarla; {tecla:deshacer} la devuelve.',
      cumplido: 'Pieza borrada con doble clic derecho.',
      pista: 'Funciona igual sobre un cable, una etiqueta o una nota.',
      transitorio: true,
      objetivo: () => zona(zonaEn(SITIO_VALOR.x, SITIO_VALOR.y)),
      hecho: (ctx) => vio(ctx, 'borrado-clic-derecho')
    },
    {
      id: 'rejilla',
      resumen: 'mueve la nota con Alt',
      texto: 'Mantén pulsada la tecla Alt y {gesto:arrastrar|arrastra} la nota.',
      cumplido: 'Nota movida libremente.',
      pista: 'Con Alt la nota se mueve libre, sin rejilla; sin Alt, de 2.5 mm en 2.5 mm.',
      transitorio: true,
      objetivo: (ctx) => {
        const n = Object.values(ctx.doc.notas)[0]
        return n ? zona({ minX: n.x - 1, minY: n.y - 1, maxX: n.x + n.ancho + 1, maxY: n.y + 6 }) : { tipo: 'ninguno' }
      },
      hecho: (ctx) => vio(ctx, 'rejilla-fina')
    },
    {
      id: 'comandos',
      resumen: 'busca un comando',
      texto: 'Pulsa {tecla:buscar-comando} y busca una orden por su nombre, por ejemplo «exportar».',
      cumplido: 'Buscador de comandos abierto.',
      transitorio: true,
      objetivo: () => ({ tipo: 'ninguno' }),
      hecho: (ctx) => vio(ctx, 'buscar-comando')
    },
    {
      id: 'atajos',
      resumen: 'abre la hoja de atajos',
      texto: 'Abre la hoja de atajos con {tecla:atajos}.',
      cumplido: 'Hoja de atajos abierta.',
      pista: 'Ahí están todas las teclas y se pueden cambiar.',
      transitorio: true,
      objetivo: () => control('[data-comando="atajos"]'),
      hecho: (ctx) => ctx.dialogo === 'atajos'
    }
  ]
}
