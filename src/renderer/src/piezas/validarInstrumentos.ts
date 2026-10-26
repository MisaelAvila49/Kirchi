import type { PropDef } from './tipos'

/** Los modelos de los cuatro instrumentos. */
export const MODELOS_INSTRUMENTOS = ['multimetro', 'osciloscopio', 'generador', 'fuente-variable'] as const

/** Las claves de cada uno: una errata se rechaza en vez de ignorarse. */
export const CLAVES_INSTRUMENTOS: Record<string, string[]> = {
  multimetro: ['tipo', 'mas', 'com', 'modo', 'ideal'],
  osciloscopio: ['tipo', 'entradas', 'ideal'],
  generador: ['tipo', 'sal', 'com', 'forma', 'frecuencia', 'amplitud', 'desplazamiento', 'simetria', 'ciclo', 'desfase', 'retardo', 'pasos', 'salida', 'ideal'],
  'fuente-variable': ['tipo', 'mas', 'menos', 'voltaje', 'limite', 'salida']
}

/** Los pines que nombra un modelo de instrumento, con el campo que los nombra. */
function pinesDelInstrumento(m: any): [string, unknown][] {
  switch (m.tipo) {
    case 'osciloscopio':
      return (Array.isArray(m.entradas) ? m.entradas : []).map((p: unknown, k: number): [string, unknown] => [`entradas[${k}]`, p])
    case 'generador':
      return [['sal', m.sal], ['com', m.com]]
    case 'fuente-variable':
      return [['mas', m.mas], ['menos', m.menos]]
    default:
      return [['mas', m.mas], ['com', m.com]]
  }
}

/** Revisa un modelo de instrumento; `err` recibe el campo y la oración, como el resto de `validarPieza`. */
export function validarModeloInstrumento(m: any, pinExiste: (id: unknown) => boolean, props: PropDef[], err: (campo: string, texto: string) => void): void {
  if (m.tipo === 'osciloscopio' && !(Array.isArray(m.entradas) && m.entradas.length === 4)) err('modelo.entradas', 'debe nombrar las cuatro entradas, A a D')
  const pines = pinesDelInstrumento(m)
  for (const [c, p] of pines) if (!pinExiste(p)) err(`modelo.${c}`, 'no es un pin de la pieza')
  if (new Set(pines.map((x) => x[1])).size !== pines.length) err('modelo', 'cada terminal debe ser un pin distinto')
  const prop = (campo: string, clase: 'lista' | 'numero' | 'casilla') => {
    const q = props.find((x) => x.id === m[campo])
    if (!q) return err(`modelo.${campo}`, 'no es una propiedad de la pieza')
    if (clase === 'numero' && (q.opciones || q.texto)) err(`modelo.${campo}`, 'debe ser una propiedad numérica')
    if (clase === 'lista' && !q.opciones) err(`modelo.${campo}`, 'debe ser una propiedad de lista')
    if (clase === 'casilla' && !q.casilla) err(`modelo.${campo}`, 'debe ser una casilla (lista de dos opciones con "casilla": true)')
  }
  switch (m.tipo) {
    case 'multimetro':
      prop('modo', 'lista')
      prop('ideal', 'casilla')
      break
    case 'osciloscopio':
      prop('ideal', 'casilla')
      break
    case 'generador':
      prop('forma', 'lista')
      for (const c of ['frecuencia', 'amplitud', 'desplazamiento', 'desfase', 'retardo', 'pasos']) prop(c, 'numero')
      prop('simetria', 'lista')
      prop('ciclo', 'lista')
      prop('salida', 'casilla')
      prop('ideal', 'casilla')
      break
    case 'fuente-variable':
      prop('voltaje', 'numero')
      prop('limite', 'numero')
      prop('salida', 'casilla')
      break
  }
}

/** Un modelo (un instrumento). */
export const esModeloInstrumento = (m: { tipo: string } | undefined): boolean => !!m && (MODELOS_INSTRUMENTOS as readonly string[]).includes(m.tipo)
