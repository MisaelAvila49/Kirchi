/** Textos de ayuda de cada ficha de análisis. Las claves de pista son `<tipo>.<ajuste>`; el barrido de parámetro suma las
 * propias `param.*`. */
import { MAX_ARMONICOS, MAX_PERIODOS } from '../../../compartido/analisis/config'
import type { TipoFicha } from './fichas'

export interface DescripcionFicha {
  mide: string
  veras: string
}

export const DESCRIPCION_FICHA: Readonly<Record<TipoFicha, DescripcionFicha>> = {
  op: {
    mide: 'Los voltajes y las corrientes del circuito cuando todo está estable.',
    veras: 'Una tabla con el voltaje de cada red y otra con la corriente y la potencia de cada pieza.'
  },
  dc: {
    mide: 'Cómo responde una salida cuando una fuente cambia poco a poco.',
    veras: 'Una curva con la fuente en el eje horizontal y el voltaje o la corriente en el vertical.'
  },
  ac: {
    mide: 'Cuánto amplifica o atenúa el circuito cada frecuencia.',
    veras: 'Dos curvas contra la frecuencia, la ganancia en dB arriba y la fase en grados abajo.'
  },
  tran: {
    mide: 'Cómo cambian los voltajes y las corrientes con el tiempo.',
    veras: 'Formas de onda como en un osciloscopio, con el arranque, la carga y las oscilaciones.'
  },
  fourier: {
    mide: 'Qué frecuencias componen una señal que se repite.',
    veras: 'Una barra por armónico con su amplitud, la primera es la frecuencia fundamental.'
  },
  param: {
    mide: 'Cómo cambia un resultado cuando se cambia el valor de una pieza.',
    veras: 'Varias curvas del mismo análisis, una por cada valor de la pieza y cada una de otro color.'
  }
}

/** Una pista por ajuste: qué hace, en una frase. */
export const PISTAS: Readonly<Record<string, string>> = {
  'dc.fuente': 'La fuente cuyo valor va cambiando durante el barrido.',
  'dc.desde': 'El valor con el que empieza el barrido.',
  'dc.hasta': 'El valor con el que termina el barrido.',
  'dc.paso': 'Un paso menor da una curva más suave y tarda más.',
  'dc.segunda': 'Repite la curva para cada valor de otra fuente, como las curvas de un transistor.',
  'dc.fuente2': 'La fuente que cambia más despacio, una curva por cada uno de sus valores.',
  'ac.fuente': 'La fuente que se toma como entrada de la señal de prueba.',
  'ac.magnitud': 'Con 1 V la salida en dB es directamente la ganancia.',
  'ac.barrido': 'En década y octava los puntos se reparten en escala logarítmica.',
  'ac.puntos': 'Con 20 puntos por década las curvas salen suaves y con 100 se ven picos angostos.',
  'ac.desde': 'La frecuencia más baja del barrido.',
  'ac.hasta': 'La frecuencia más alta del barrido.',
  'ac.incluir': 'Frecuencias en Hz, separadas por comas, que el barrido calcula exactamente además de su rejilla, como 60 para la red eléctrica.',
  'tran.fin': 'Cuánto tiempo se simula, contado desde el instante 0.',
  'tran.maximo': 'Un paso menor sigue mejor los cambios rápidos y tarda más.',
  'tran.inicio': 'Descarta lo anterior a este instante, útil si solo interesa el régimen estable.',
  'tran.uic': 'Marcado, los capacitores empiezan descargados en lugar de partir del reposo.',
  'fourier.fundamental': 'Suele ser la frecuencia de la fuente, y los armónicos son sus múltiplos.',
  'fourier.armonicos': `Cuántas barras se calculan, de 1 a ${MAX_ARMONICOS}.`,
  'fourier.periodos': `Más periodos dan barras más limpias, de 1 a ${MAX_PERIODOS} contados desde el final.`,
  'fourier.descarte': 'Deja pasar el arranque para que el circuito se asiente antes de medir.',
  'fourier.ventana': 'La ventana que se aplica a los periodos antes de calcular las barras.',
  'param.pieza': 'La pieza cuyo valor cambia en cada corrida.',
  'param.modo': 'Los valores pueden repartirse en línea recta, por décadas o ser una lista que escribes tú.',
  'param.desde': 'El primer valor de la pieza.',
  'param.hasta': 'El último valor de la pieza.',
  'param.puntos': 'Cuántos valores de la pieza se prueban entre el primero y el último.',
  'param.valores': 'Los valores de la pieza separados por coma, por ejemplo 1k, 2.2k, 4.7k.',
  'param.base': 'El análisis completo que se repite con cada valor de la pieza.'
}

/** Los ajustes de la ficha de cada tipo (el barrido de parámetro suma los suyos a los de su base). */
export const AJUSTES_DE_FICHA: Readonly<Record<TipoFicha, readonly string[]>> = {
  op: [],
  dc: ['dc.fuente', 'dc.desde', 'dc.hasta', 'dc.paso', 'dc.segunda', 'dc.fuente2'],
  ac: ['ac.fuente', 'ac.magnitud', 'ac.barrido', 'ac.puntos', 'ac.desde', 'ac.hasta', 'ac.incluir'],
  tran: ['tran.fin', 'tran.maximo', 'tran.inicio', 'tran.uic'],
  fourier: ['fourier.fundamental', 'fourier.armonicos', 'fourier.periodos', 'fourier.descarte', 'fourier.ventana'],
  param: ['param.pieza', 'param.modo', 'param.desde', 'param.hasta', 'param.puntos', 'param.valores', 'param.base']
}

export const pistaDe = (clave: string): string | undefined => PISTAS[clave]
