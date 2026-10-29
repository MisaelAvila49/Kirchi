import { clavePin } from '../../conexiones/conexiones'
import { sondasDe } from '../../doc/sondas'
import type { Documento, Id, Pieza, Punto } from '../../doc/tipos'
import { etiquetasSinChoques } from '../../lienzo/apartar'
import { TAM_CIFRA_INSTRUMENTO } from '../../lienzo/instrumentosLienzo'
import { anchoTexto } from '../../lienzo/medidas'
import { pantallaDeMedidor } from '../../lienzo/medidores'
import { banderasDelDocumento, type Bandera } from '../../lienzo/sondas'
import { cajaEnMundo } from '../../piezas/transformar'
import type { Caja } from '../../piezas/tipos'
import {
  baseDelOsciloscopio, CAPACITORES, capacitorEnRC, caja, detenidaTrasCorrer, enSombra, generadorConectado, medidorConSonda, medidorRapido, modoDe, osciloscopioAjustado, pinDe, piezasDe, SITIOS, sitioGenerador, sondaDeOsciloscopio,
  sondaDeVoltaje, textoDe, unirCajas, valorDe, vio, zonaEn, mismoValor
} from './condiciones'
import { colocar, control, DETENER, GRUPO_SIMULAR, LECTURA_MULTIMETRO, mira, RIEL_MEDICIONES, SIMULAR, zona } from './pasos'
import type { CapituloDef, CtxTutorial, Guia, Objetivo } from './tipos'

/** El inspector y el osciloscopio: donde aparecen las formas de onda, los ajustes del generador y las lecturas. */
const INSPECTOR = 'aside.inspector'
const PANTALLA_OSC = '#instrumentos-panel'
/** El botón Cursores de la barra del instrumento (el de Pausar también cambia de estado: se elige por su acción, no por aria-pressed). */
export const BOTON_CURSORES = '.barra-instrumento [data-accion="cursores"]'
/** Los mandos del osciloscopio: tiempo por división, disparo y la lista de medidas automáticas. */
export const MANDO_BASE = '.osc-mandos .osc-base'
export const MANDO_DISPARO = '.osc-mandos .osc-disparo'
export const MEDIDAS_OSC = '.osc-medidas'

const verOsciloscopio = (ctx: CtxTutorial): Objetivo[] => {
  const o = piezasDe(ctx, 'osciloscopio')[0]
  return [...(o ? [zona(caja(ctx, o, 2))] : []), control(PANTALLA_OSC)]
}
const sobre = (ctx: CtxTutorial, tipo: string, respaldo: { x: number; y: number }): Objetivo => {
  const p = piezasDe(ctx, tipo)[0]
  return p ? zona(caja(ctx, p, 2)) : zona(zonaEn(respaldo.x, respaldo.y))
}
/** Un punto distinto para cada medida, para que las lecturas no se encimen: el medidor rápido en el cable de la resistencia al LED, el multímetro en el de la fuente a la resistencia y la sonda en el de abajo, del LED a la tierra. */
export const PUNTOS_MEDIDA = { rapido: { x: 26, y: -4 }, multimetro: { x: 6, y: -4 }, sonda: { x: 18, y: 4 } } as const
const alrededor = (p: { x: number; y: number }) => zona({ minX: p.x - 5, minY: p.y - 3, maxX: p.x + 5, maxY: p.y + 3 })
const medidorRapidoEn = (): Objetivo => alrededor(PUNTOS_MEDIDA.rapido)
const multimetroEn = (): Objetivo => alrededor(PUNTOS_MEDIDA.multimetro)
const sondaEn = (): Objetivo => alrededor(PUNTOS_MEDIDA.sonda)
const cerca = (p: Punto, r = 1.5): Caja => ({ minX: p.x - r, minY: p.y - r, maxX: p.x + r, maxY: p.y + r })

/** Las banderas como las dibuja el lienzo (mismos textos que apartar): de ahí sale dónde queda la cifra de cada sonda. */
const banderasVistas = new WeakMap<Documento, ReadonlyMap<Id, Bandera>>()
function banderasDe(ctx: CtxTutorial): ReadonlyMap<Id, Bandera> {
  const lib = ctx.lib as Map<string, never>
  let b = banderasVistas.get(ctx.doc)
  if (!b) banderasVistas.set(ctx.doc, (b = banderasDelDocumento(ctx.doc, lib, ctx.con, etiquetasSinChoques(ctx.doc, lib))))
  return b
}

/** El multímetro con su cifra del lienzo, que va a su izquierda (la de `textosDeInstrumentos`). */
function multimetroConCifra(ctx: CtxTutorial, m: Pieza): Caja {
  const def = ctx.lib.get(m.tipo)
  if (!def) return caja(ctx, m, 2)
  const c = cajaEnMundo(m, def)
  const cy = (c.minY + c.maxY) / 2
  const cifra = { minX: c.minX - 1 - anchoTexto('-0.000 mV', TAM_CIFRA_INSTRUMENTO), minY: cy - TAM_CIFRA_INSTRUMENTO, maxX: c.minX, maxY: cy + TAM_CIFRA_INSTRUMENTO }
  return unirCajas([caja(ctx, m, 1), cifra])!
}

/** El multímetro con su sonda: la pieza con su cifra y su fila en Mediciones (o el botón del riel si el panel está plegado). */
const verMedidor = (ctx: CtxTutorial): Objetivo[] => {
  const m = medidorConSonda(ctx)
  return [...(m ? [zona(multimetroConCifra(ctx, m))] : []), control(LECTURA_MULTIMETRO, undefined, RIEL_MEDICIONES)]
}

/** Al simular, cada medida se enmarca con el lugar donde se lee: el medidor rápido en su punto y en su pantalla, la sonda con su cifra y el multímetro con la suya y con Mediciones. Punto y pantalla van aparte: su caja envolvente llegaba hasta el multímetro y los dos marcos se juntaban. */
const verMedidas = (ctx: CtxTutorial): Objetivo[] => {
  const sondas = Object.values(sondasDe(ctx.doc))
  const medidores = sondas.filter((s) => s.tipo === 'medidor').flatMap((s) => [zona(cerca(s)), zona(pantallaDeMedidor(s).caja)])
  const banderas = sondas.some((s) => s.tipo === 'voltaje') ? banderasDe(ctx) : null
  const voltajes = sondas.filter((s) => s.tipo === 'voltaje').map((s) => {
    const b = banderas?.get(s.id)
    return zona(b ? unirCajas([cerca(s, 1), b.reservada]) : cerca(s, 3))
  })
  return [...(medidores.length ? medidores : [medidorRapidoEn()]), ...(voltajes.length ? voltajes : [sondaEn()]), ...verMedidor(ctx)]
}

/** La sombra del generador y el cable de su COM a la tierra, que da la vuelta por la izquierda. */
const guiaGenerador = (ctx: CtxTutorial): Guia => {
  const g = piezasDe(ctx, 'generador')[0]
  const puesto = !!g && Math.abs(g.x - SITIOS.generador.x) <= 1 && Math.abs(g.y - SITIOS.generador.y) <= 1 && g.rot === 180
  return {
    piezas: puesto ? [] : [{ tipo: 'generador', x: SITIOS.generador.x, y: SITIOS.generador.y, rot: 180, props: { forma: 'Cuadrada', frecuencia: '1' } }],
    cables: generadorConectado(ctx) ? [] : [[{ x: 0, y: -16 }, { x: -6, y: -16 }, { x: -6, y: 12 }, { x: 0, y: 12 }]]
  }
}

/** De pie sobre su sombra, con cualquiera de los dos giros verticales. */
const capacitorEnSitio = (c: Pieza): boolean => enSombra(c, { ...SITIOS.capacitor, rot: 90 }) || enSombra(c, { ...SITIOS.capacitor, rot: 270 })

/** La tierra del circuito: la más cercana a su sitio (la del multímetro también es tierra, pero no es la que se dibuja en la guía). */
function tierraDelCircuito(ctx: CtxTutorial): Pieza | undefined {
  const d = (p: Pieza) => Math.abs(p.x - SITIOS.tierra.x) + Math.abs(p.y - SITIOS.tierra.y)
  return [...piezasDe(ctx, 'tierra')].sort((a, b) => d(a) - d(b))[0]
}

/** Lo que falta del RC: el capacitor de 100 µF que más lleva unido y, de cada pin, si todavía hay que llevarlo al nodo del LED o a la tierra. */
export interface AvanceRC {
  c: Pieza
  alNodo: Punto | null
  aTierra: Punto | null
}
export function avanceDelRC(ctx: CtxTutorial): AvanceRC | null {
  const led = piezasDe(ctx, 'led')[0]
  const nodo = led ? ctx.con.redDePin.get(clavePin(led.id, 'A')) : undefined
  const esTierra = (id: number | undefined) => id !== undefined && ctx.con.redes.some((r) => r.id === id && r.tierra)
  let mejor: AvanceRC | null = null, cuenta = -1
  for (const [tipo, [a, b]] of Object.entries(CAPACITORES))
    for (const c of piezasDe(ctx, tipo)) {
      const pa = pinDe(ctx, c, a), pb = pinDe(ctx, c, b)
      if (!pa || !pb || !mismoValor(valorDe(ctx, c, 'valor'), 100e-6)) continue
      const ra = ctx.con.redDePin.get(clavePin(c.id, a)), rb = ctx.con.redDePin.get(clavePin(c.id, b))
      const nA = nodo !== undefined && ra === nodo, nB = nodo !== undefined && rb === nodo
      // Al nodo va el pin que ya está en él; si ninguno, el que no está en la tierra y, si los dos están libres, el de arriba.
      const aEsNodo = nA || (!nB && (esTierra(rb) || (!esTierra(ra) && pa.y <= pb.y)))
      const [pn, pt, hechoNodo, hechoTierra] = aEsNodo ? [pa, pb, nA, esTierra(rb)] : [pb, pa, nB, esTierra(ra)]
      const n = Number(hechoNodo) + Number(hechoTierra)
      if (n > cuenta) [mejor, cuenta] = [{ c, alNodo: hechoNodo ? null : { x: pn.x, y: pn.y }, aTierra: hechoTierra ? null : { x: pt.x, y: pt.y } }, n]
    }
  return mejor
}

/** Qué cables faltan, desde dónde y hacia qué punto: de la sombra si no hay capacitor puesto (o está suelto fuera de ella), o de los pines del que se puso. */
function pendientesDelRC(ctx: CtxTutorial): { sombra: boolean; alNodo: [Punto, Punto] | null; aTierra: [Punto, Punto] | null } {
  const av = avanceDelRC(ctx)
  const suelto = !!av && av.alNodo !== null && av.aTierra !== null
  const sombra = !av || (suelto && !capacitorEnSitio(av.c))
  const desde = sombra ? { alNodo: { x: SITIOS.capacitor.x, y: SITIOS.capacitor.y - 4 }, aTierra: { x: SITIOS.capacitor.x, y: SITIOS.capacitor.y + 4 } } : av!
  const a = pinDe(ctx, piezasDe(ctx, 'led')[0], 'A'), g = pinDe(ctx, tierraDelCircuito(ctx), '1')
  return {
    sombra,
    alNodo: desde.alNodo && a ? [desde.alNodo, { x: a.x, y: a.y }] : null,
    aTierra: desde.aTierra && g ? [desde.aTierra, { x: g.x, y: g.y }] : null
  }
}

/** La sombra del capacitor de 100 µF y los cables que le faltan: arriba al nodo del LED (primero en horizontal) y abajo a la tierra (primero en vertical). Cada cable deja de dibujarse en cuanto su pin queda unido, y la sombra en cuanto hay un capacitor sobre ella o cableado. */
const guiaCapacitor = (ctx: CtxTutorial): Guia => {
  if (capacitorEnRC(ctx)) return { piezas: [], cables: [] }
  const f = pendientesDelRC(ctx)
  const cables: { x: number; y: number }[][] = []
  if (f.alNodo) {
    const [p, q] = f.alNodo
    cables.push(p.x === q.x || p.y === q.y ? [p, q] : [p, { x: q.x, y: p.y }, q])
  }
  if (f.aTierra) {
    const [p, q] = f.aTierra
    cables.push(p.x === q.x || p.y === q.y ? [p, q] : [p, { x: p.x, y: q.y }, q])
  }
  return { piezas: f.sombra ? [{ tipo: 'capacitor', x: SITIOS.capacitor.x, y: SITIOS.capacitor.y, rot: 90, props: { valor: '100u' } }] : [], cables }
}

/** Un marco chico en cada punto donde falta conectar: el nodo del LED (donde termina el cable de la resistencia) y la tierra. Nunca la sombra ni el cable entero: un marco largo se juntaba con el otro y tapaba medio circuito. */
function marcosDelRC(ctx: CtxTutorial): Objetivo[] {
  const f = pendientesDelRC(ctx)
  const g = tierraDelCircuito(ctx)
  const out: Objetivo[] = []
  // El del nodo sube un poco más: el globo va encima y no debe tapar el pin de arriba de un capacitor puesto algo más alto.
  if (f.alNodo) out.push(zona({ ...cerca(f.alNodo[1]), minY: f.alNodo[1].y - 2.5 }))
  if (f.aTierra) out.push(zona(g ? caja(ctx, g, 1) : cerca(f.aTierra[1])))
  return out.length ? out : [zona(cerca({ x: SITIOS.led.x, y: SITIOS.led.y - 4 }))]
}

/**
 * Capítulo 3: medir con el medidor rápido, el multímetro y una sonda; cambiar la fuente por un generador con un capacitor y ver las señales en el osciloscopio con cursores y medidas; pausar, avanzar y retroceder la simulación. Parte del circuito de fuente, resistencia y LED.
 */
export const CAPITULO_3: CapituloDef = {
  id: 'medir-senales',
  numero: 3,
  titulo: 'Medir',
  resumen: 'Medidores, osciloscopio y control del tiempo',
  descripcion: 'Mide con el medidor rápido, el multímetro y una sonda; después ve la señal de un generador en el osciloscopio, con cursores y medidas, y controla el tiempo de la simulación.',
  minutos: 9,
  tono: 'ocre',
  totalPasos: 20,
  arranque: true,
  zona: { minX: -14, minY: -24, maxX: 56, maxY: 40 },
  pasos: [
    {
      id: 'medidor-rapido',
      resumen: 'pon un medidor rápido en un cable',
      texto: 'Haz {gesto:clic-derecho} en el cable de la resistencia al LED y elige {icono:voltajes|Medir}, {icono:multimetro|Multímetro}, Medidor rápido.',
      cumplido: 'Medidor rápido puesto.',
      pista: 'Muestra el voltaje de ese punto sobre el lienzo, sin tender cables.',
      // El circuito que deja el capítulo no conserva este medidor: al retomar basta con que el paso ya se haya hecho.
      sigueVigente: () => true,
      objetivo: medidorRapidoEn,
      hecho: medidorRapido
    },
    {
      id: 'multimetro',
      resumen: 'pon un multímetro completo',
      texto: 'Haz {gesto:clic-derecho} en el cable de la fuente a la resistencia y elige {icono:voltajes|Medir}, {icono:multimetro|Multímetro}, Multímetro completo.',
      cumplido: 'Multímetro puesto con su sonda.',
      pista: 'El multímetro completo tiene funciones y su lectura va en Mediciones.',
      objetivo: multimetroEn,
      hecho: (ctx) => medidorConSonda(ctx) !== undefined
    },
    {
      id: 'sonda',
      resumen: 'pon una sonda de voltaje',
      texto: 'Haz {gesto:clic-derecho} en el cable de abajo, el del LED a la tierra, y elige {icono:voltajes|Medir}, {icono:voltajes|Sonda}, Voltaje.',
      cumplido: 'Sonda de voltaje puesta.',
      pista: 'La sonda muestra el voltaje de ese punto en el Registro y en las gráficas.',
      objetivo: sondaEn,
      hecho: sondaDeVoltaje
    },
    {
      id: 'simular',
      resumen: 'inicia la vista previa',
      texto: 'Pulsa {tecla:simular} para simular.',
      cumplido: 'Vista previa en marcha.',
      pista: 'Los medidores empiezan a leer.',
      transitorio: true,
      objetivo: () => control(SIMULAR, 'inicio', GRUPO_SIMULAR),
      focos: verMedidas,
      hecho: (ctx) => ctx.fase !== 'detenida' && medidorConSonda(ctx) !== undefined
    },
    mira({
      id: 'lectura',
      abre: 'mediciones',
      resumen: 'mira la lectura en Mediciones',
      texto: 'La lectura del multímetro se ve en {icono:mediciones|Mediciones}, a la derecha.',
      objetivo: () => ({ tipo: 'control', selector: LECTURA_MULTIMETRO, respaldo: RIEL_MEDICIONES }),
      focos: (ctx) => {
        const m = medidorConSonda(ctx)
        return m ? [zona(multimetroConCifra(ctx, m))] : []
      }
    }),
    {
      id: 'detener',
      resumen: 'detén la vista previa para cambiar el circuito',
      texto: 'Pulsa {tecla:detener} para detener: las piezas se cambian con la simulación parada.',
      cumplido: 'Vista previa detenida.',
      transitorio: true,
      objetivo: () => control(DETENER, 'inicio', GRUPO_SIMULAR),
      hecho: detenidaTrasCorrer
    },
    {
      id: 'generador',
      resumen: 'cambia la fuente por un generador',
      texto: 'Borra la fuente, coloca un generador ({codigo:generador}) y une su COM a la tierra.',
      cumplido: 'Generador conectado.',
      pista: 'Borra la fuente con Supr. Pon el generador sobre la sombra y cablea del pin COM a la tierra.',
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
      texto: 'Selecciona el generador y elige Cuadrada y 1 Hz en el {icono:inspector|Inspector}.',
      pista: 'Una cuadrada de 1 Hz cambia de nivel cada medio segundo, lento para verla.',
      cumplido: 'Cuadrada de 1 Hz.',
      objetivo: (ctx) => sobre(ctx, 'generador', sitioGenerador(ctx)),
      focos: () => [control(INSPECTOR)],
      hecho: (ctx) => piezasDe(ctx, 'generador').some((g) => textoDe(ctx, g, 'forma') === 'Cuadrada' && mismoValor(valorDe(ctx, g, 'frecuencia'), 1))
    },
    {
      id: 'capacitor',
      resumen: 'agrega un capacitor de 100 µF',
      texto: 'Coloca un capacitor con {codigo:c 100u} y únelo al cable de la resistencia al LED y a la tierra.',
      pista: 'Gíralo con la tecla de giro y arrastra desde cada pin: uno al cable y el otro a la tierra.',
      cumplido: 'Capacitor en el circuito RC.',
      // Los marcos van solo en los puntos que faltan por unir; sobre la sombra de la pieza no hay marco.
      objetivo: (ctx) => marcosDelRC(ctx)[0],
      focos: (ctx) => marcosDelRC(ctx).slice(1),
      // Arriba del circuito mientras falta el nodo: abajo o a los lados el globo taparía la sombra y sus dos cables. Si solo falta la tierra, debajo de ella, donde no hay nada.
      lado: (ctx) => (pendientesDelRC(ctx).alNodo ? 'arriba' : 'abajo'),
      guia: guiaCapacitor,
      // Uno suelto sin girar (o en otro lugar) no cubre la sombra: el globo dice que se coloque sobre ella. Ya cableado cuenta donde esté.
      fueraDeSombra: (ctx) => pendientesDelRC(ctx).sombra && avanceDelRC(ctx) !== null,
      hecho: capacitorEnRC
    },
    {
      id: 'osciloscopio',
      resumen: 'coloca el osciloscopio',
      texto: 'Haz {gesto:doble-clic} en el lienzo y escribe {codigo:osciloscopio}.',
      pista: 'Colócalo sobre la sombra.',
      cumplido: 'Osciloscopio colocado.',
      ...colocar('osciloscopio', SITIOS.osciloscopio, 0, undefined)
    },
    {
      id: 'canal-a',
      resumen: 'mide el generador en el canal A',
      texto: 'Haz {gesto:clic-derecho} en el cable del generador y elige {icono:voltajes|Medir}, {icono:osciloscopio|Osciloscopio}, Entrada A.',
      pista: 'El canal A dibuja la señal de entrada.',
      cumplido: 'Canal A en la salida del generador.',
      objetivo: (ctx) => sobre(ctx, 'generador', sitioGenerador(ctx)),
      focos: verOsciloscopio,
      hecho: (ctx) => piezasDe(ctx, 'osciloscopio').length > 0 && sondaDeOsciloscopio(ctx, 'A')
    },
    {
      id: 'canal-b',
      resumen: 'mide el capacitor en el canal B',
      texto: 'Haz {gesto:clic-derecho} en un cable del capacitor y elige {icono:voltajes|Medir}, {icono:osciloscopio|Osciloscopio}, Entrada B.',
      pista: 'El canal B dibuja cómo se carga el capacitor.',
      cumplido: 'Canal B en el capacitor.',
      objetivo: (ctx) => sobre(ctx, 'capacitor', { x: 40, y: 0 }),
      focos: verOsciloscopio,
      hecho: (ctx) => piezasDe(ctx, 'osciloscopio').length > 0 && sondaDeOsciloscopio(ctx, 'B')
    },
    {
      id: 'osciloscopio-simular',
      resumen: 'simula y abre la pestaña Osciloscopio',
      texto: 'Pulsa {tecla:simular} y abre la pestaña {icono:osciloscopio|Osciloscopio}, abajo.',
      pista: 'Las dos señales aparecen en la pantalla.',
      cumplido: 'Dos canales a la vista.',
      transitorio: true,
      objetivo: () => control('#pestaña-osciloscopio'),
      // Dos acciones: el botón de simular y la pestaña Osciloscopio, con el osciloscopio del lienzo y su pantalla a la vista.
      focos: (ctx) => {
        const o = piezasDe(ctx, 'osciloscopio')[0]
        return [...(o ? [zona(caja(ctx, o, 2))] : []), control(SIMULAR, 'inicio', GRUPO_SIMULAR), control(PANTALLA_OSC)]
      },
      hecho: (ctx) => ctx.fase !== 'detenida' && ctx.franja === 'osciloscopio' && sondaDeOsciloscopio(ctx, 'A') && sondaDeOsciloscopio(ctx, 'B')
    },
    {
      id: 'tiempo-div',
      abre: 'osciloscopio',
      resumen: 'cambia el tiempo por división',
      texto: 'Cambia el Tiempo/div para ver más o menos ciclos en la pantalla.',
      pista: 'Cada división de la retícula dura ese tiempo.',
      cumplido: 'Escala de tiempo cambiada.',
      transitorio: true,
      objetivo: () => control(MANDO_BASE),
      hecho: (ctx) => baseDelOsciloscopio(ctx) !== null && osciloscopioAjustado(ctx, ['base'])
    },
    {
      id: 'disparo',
      abre: 'osciloscopio',
      resumen: 'cambia el disparo',
      texto: 'Cambia el flanco, el nivel o el modo del Disparo.',
      pista: 'El disparo decide en qué punto de la señal empieza cada barrido.',
      cumplido: 'Disparo ajustado.',
      transitorio: true,
      objetivo: () => control(MANDO_DISPARO),
      hecho: (ctx) => osciloscopioAjustado(ctx, ['disp_fuente', 'disp_flanco', 'disp_nivel', 'disp_modo'])
    },
    {
      id: 'cursores',
      abre: 'osciloscopio',
      resumen: 'enciende los cursores',
      texto: 'Pulsa {icono:cursores|Cursores}, arriba de la pantalla.',
      pista: 'Miden desde el borde de la pantalla y no hace falta pausar: se quedan quietos mientras ella avanza.',
      cumplido: 'Cursores encendidos.',
      transitorio: true,
      objetivo: () => control(BOTON_CURSORES),
      hecho: (ctx) => ctx.cursores === true
    },
    mira({
      id: 'medidas',
      abre: 'osciloscopio',
      resumen: 'mira las medidas automáticas',
      texto: 'Bajo la pantalla, las medidas automáticas calculan frecuencia, amplitud y más de cada canal.',
      objetivo: () => control(MEDIDAS_OSC, undefined, PANTALLA_OSC)
    }),
    {
      id: 'pausa',
      resumen: 'pausa la vista previa',
      texto: 'Pulsa {tecla:simular} otra vez para pausar la simulación.',
      pista: 'En pausa la pantalla se queda quieta y se puede revisar.',
      cumplido: 'Simulación en pausa.',
      transitorio: true,
      objetivo: () => control(SIMULAR, 'inicio', GRUPO_SIMULAR),
      hecho: (ctx) => ctx.fase === 'pausada'
    },
    {
      id: 'avanzar',
      resumen: 'avanza un intervalo',
      texto: 'Pulsa {icono:paso|Avanzar} ({tecla:avanzar}) para que la simulación avance un intervalo.',
      pista: 'Cuánto avanza se elige en el botón Avanzar de Inicio.',
      cumplido: 'Simulación avanzada.',
      transitorio: true,
      objetivo: () => control('[data-comando="avanzar"]', 'inicio', GRUPO_SIMULAR),
      hecho: (ctx) => vio(ctx, 'avanzado')
    },
    {
      id: 'retroceder',
      resumen: 'retrocede al avance anterior',
      texto: 'Pulsa {icono:pasoAtras|Retroceder} ({tecla:retroceder}) para volver al estado de antes del avance.',
      cumplido: 'Simulación retrocedida.',
      transitorio: true,
      objetivo: () => control('[data-comando="retroceder"]', 'inicio', GRUPO_SIMULAR),
      hecho: (ctx) => vio(ctx, 'retrocedido')
    }
  ]
}
