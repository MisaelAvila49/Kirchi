import { nombreParecido, PARAMETROS, problemaDeParametro } from '../netlist/rangos'
import { leerCiclo, leerPosicion, leerValor } from '../valores/valores'
import { MAX_TEXTO_LARGO, MAX_TEXTO_PROP, type AnimacionDef, type LimitesDef, type ModeloDef, type PiezaDef, type PinDef, type PropDef, type Rotulo } from './tipos'
import { CLAVES_COMPUESTO, validarCompuesto } from './validarCompuesto'
import { LEYES_POT } from '../valores/leyPot'
import { validarDatos } from './validarDatos'
import { CLAVES_DIGITALES, MODELOS_DIGITALES, validarModeloDigital } from './validarDigital'
import { CLAVES_NUEVOS, MODELOS_NUEVOS, validarEnVivo, validarModeloNuevo } from './validarModelosNuevos'
import { CLAVES_MSI, MODELOS_MSI, validarCaja, validarModeloMsi } from './validarMsi'
import { CLAVES_INSTRUMENTOS, MODELOS_INSTRUMENTOS, validarModeloInstrumento } from './validarInstrumentos'
import { PROPS_DE_DOCUMENTO } from '../doc/paquetes'

/** Lo que valida `validarPieza`: la pieza sin su dibujo, con los archivos de sus variantes (la librería los carga). */
export type DefSinGeometria = Omit<PiezaDef, 'geometria' | 'variantes'> & { variantes?: { prop: string; simbolos: Record<string, string> } }
export type Validacion = { ok: true; def: DefSinGeometria } | { ok: false; errores: string[] }

/** Las series que una propiedad puede fijar (`elegida`: la de Configuración). */
const SERIES_DE_PROP = ['elegida', 'E6', 'E12', 'E24']
const MODELOS = ['R', 'C', 'L', 'V', 'I', 'D', 'zener', 'bjt', 'mosfet', 'ampop', 'comparador', 'compuesto', 'foco', 'fusible', 'motor', 'rele', 'zumbador', 'interruptor', 'senoidal', 'pulso', 'pot', 'alimentacion', 'tierra', ...MODELOS_NUEVOS, ...MODELOS_DIGITALES, ...MODELOS_MSI, ...MODELOS_INSTRUMENTOS]
/** Las claves que lleva cada tipo de modelo: una errata («tua» por «tau») se rechaza en vez de ignorarse. */
const CLAVES: Record<string, string[]> = {
  R: ['tipo', 'a', 'b', 'prop'], C: ['tipo', 'a', 'b', 'prop', 'rserie'], L: ['tipo', 'a', 'b', 'prop', 'rserie'], V: ['tipo', 'a', 'b', 'prop', 'rserie'], I: ['tipo', 'a', 'b', 'prop'],
  D: ['tipo', 'a', 'b', 'is', 'n', 'inom', 'por'],
  zener: ['tipo', 'a', 'b', 'prop', 'is', 'n', 'cjo', 'vj', 'm', 'serie', 'sinFamiliaHasta', 'por'],
  bjt: ['tipo', 'c', 'b', 'e', 'pnp', 'prop', 'modelos'],
  mosfet: ['tipo', 'd', 'g', 's', 'pmos', 'prop', 'modelos'],
  ampop: ['tipo', 'mas', 'menos', 'sal', 'vmas', 'vmenos', 'prop', 'modelos'],
  comparador: ['tipo', 'mas', 'menos', 'sal', 'vmas', 'vmenos', 'prop', 'modelos'],
  foco: ['tipo', 'a', 'b', 'voltaje', 'potencia', 'k', 'tau'],
  fusible: ['tipo', 'a', 'b', 'prop', 'rPorA', 'fusion', 'tau'],
  motor: ['tipo', 'a', 'b', 'voltaje', 'referencia'],
  rele: ['tipo', 'a1', 'a2', 'com', 'na', 'nc', 'voltaje', 'potencia', 'tau', 'operar', 'liberar'],
  zumbador: ['tipo', 'a', 'b', 'voltaje', 'potencia', 'umbral'],
  interruptor: ['tipo', 'a', 'b', 'c', 'prop', 'cerrado', 'momentaneo'],
  senoidal: ['tipo', 'a', 'b', 'amplitud', 'frecuencia'],
  pulso: ['tipo', 'a', 'b', 'alto', 'frecuencia', 'ciclo', 'ancho', 'subida', 'bajada', 'retardo'],
  pot: ['tipo', 'a', 'b', 'c', 'prop', 'posicion', 'ley', 'reostato'],
  compuesto: CLAVES_COMPUESTO,
  alimentacion: ['tipo', 'pin', 'nombre'],
  tierra: ['tipo', 'pin'],
  ...CLAVES_NUEVOS,
  ...CLAVES_DIGITALES,
  ...CLAVES_MSI,
  ...CLAVES_INSTRUMENTOS
}
/** Terminales de los modelos de más de dos pines, en el orden en que entran al motor. */
const TERMINALES: Record<string, string[]> = { bjt: ['c', 'b', 'e'], mosfet: ['d', 'g', 's'], ampop: ['mas', 'menos', 'sal', 'vmas', 'vmenos'], comparador: ['mas', 'menos', 'sal', 'vmas', 'vmenos'], rele: ['a1', 'a2', 'com', 'na', 'nc'] }
/** Parámetros de un comparador: los del amplificador (`netlist/rangos.ts`) y los del transistor de salida con su resistencia de base. */
const PARAMETROS_COMPARADOR_AO = PARAMETROS.ampop.nombres
const PARAMETROS_COMPARADOR_Q = ['rbase', 'is', 'bf', 'rc', 'tf', 'tr', 'cje', 'cjc']
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const esEntero = (v: unknown): v is number => Number.isInteger(v)
const esTexto = (v: unknown): v is string => typeof v === 'string' && v.length > 0

/** El renglón (desde 1) donde empieza la clave `"clave"` en el texto del JSON, para decir dónde está el error. */
export function lineaDeClave(texto: string, clave: string): number | null {
  // La clave seguida de «:», no la misma palabra como valor (en «buscar», por ejemplo).
  const m = new RegExp(`"${clave}"\s*:`).exec(texto)
  return m ? texto.slice(0, m.index).split('\n').length : null
}

/** Los colores de luz que el lienzo sabe pintar (`TOKEN_DE_LED` de `lienzo/capaSim.ts`). */
export const COLORES_DE_LUZ = ['rojo', 'verde', 'azul', 'amarillo', 'blanco'] as const

/** Las claves de cada tipo de animación: una errata se rechaza en vez de ignorarse. */
const CLAVES_ANIMACION: Record<AnimacionDef['tipo'], string[]> = {
  brillo: ['tipo', 'color'],
  filamento: ['tipo'],
  giro: ['tipo', 'vueltasMax'],
  contacto: ['tipo', 'manda'],
  cursor: ['tipo', 'prop', 'desde', 'hasta', 'codo'],
  sonido: ['tipo', 'frecuencia', 'onda'],
  luces: ['tipo', 'luces']
}
/** El modelo que admite cada animación. */
const MODELO_DE_ANIMACION: Record<AnimacionDef['tipo'], readonly string[]> = {
  brillo: ['D', 'display'],
  filamento: ['foco'],
  giro: ['motor', 'pasos'],
  // El interruptor y el botón se dibujan con accionado.svg.
  contacto: ['rele'],
  cursor: ['pot'],
  sonido: ['zumbador'],
  luces: ['compuesto']
}
/** Lo más rápido que se dibuja un giro (vueltas por segundo de pantalla): más se vería falso por el efecto estroboscópico. */
export const VUELTAS_MAX = 10

/** Animación de una pieza con su vocabulario fijo. Los errores llevan el renglón de la clave `animacion`; las capas que
 * pide se revisan al cargar la librería, con el símbolo. */
function validarAnimacion(a: any, modelo: any, props: PropDef[], linea: number | null, err: (campo: string, msg: string) => void): AnimacionDef | undefined {
  const donde = linea ? ` (renglón ${linea})` : ''
  const e = (campo: string, msg: string) => err(`animacion${campo}${donde}`, msg)
  if (a === null || typeof a !== 'object' || Array.isArray(a)) return void e('', 'debe ser un objeto')
  const tipos = Object.keys(CLAVES_ANIMACION) as AnimacionDef['tipo'][]
  if (!tipos.includes(a.tipo)) return void e('.tipo', `debe ser uno de ${tipos.join(', ')}`)
  const t = a.tipo as AnimacionDef['tipo']
  for (const k of Object.keys(a)) {
    if (CLAVES_ANIMACION[t].includes(k)) continue
    const parecida = nombreParecido(k, CLAVES_ANIMACION[t])
    e(`.${k}`, `clave desconocida en una animación «${t}»${parecida ? `, ¿quisiste decir «${parecida}»?` : ''}`)
  }
  if (!modelo || !MODELO_DE_ANIMACION[t].includes(modelo.tipo)) e('.tipo', `«${t}» no aplica a un modelo «${modelo?.tipo ?? 'sin modelo'}»`)
  const lista = (id: unknown) => props.find((p) => p.id === id && p.opciones)
  switch (t) {
    case 'brillo':
      if (a.color !== undefined && !lista(a.color)) e('.color', 'debe ser una propiedad de lista de la pieza')
      else if (a.color !== undefined) {
        const otros = lista(a.color)!.opciones!.filter((o) => !(COLORES_DE_LUZ as readonly string[]).includes(o))
        if (otros.length) e('.color', `sus opciones deben ser colores de luz (${COLORES_DE_LUZ.join(', ')}); no lo es «${otros[0]}»`)
      }
      return { tipo: 'brillo', ...(a.color !== undefined ? { color: a.color } : {}) }
    case 'filamento':
      return { tipo: 'filamento' }
    case 'giro': {
      const v = a.vueltasMax ?? 2
      if (!(typeof v === 'number' && v > 0 && v <= VUELTAS_MAX)) e('.vueltasMax', `debe estar entre 0 y ${VUELTAS_MAX} vueltas por segundo`)
      return { tipo: 'giro', vueltasMax: v }
    }
    case 'contacto': {
      const mandas = ['operado', 'cerrado', 'presionado']
      if (!mandas.includes(a.manda)) e('.manda', `debe ser ${mandas.join(', ')}`)
      else if (modelo?.tipo === 'rele' && a.manda !== 'operado') e('.manda', 'un relé lo manda su lectura «operado»')
      return { tipo: 'contacto', manda: a.manda }
    }
    case 'cursor': {
      if (!lista(a.prop) || a.prop !== modelo?.posicion) e('.prop', 'debe ser la propiedad de la posición del cursor (modelo.posicion)')
      for (const c of ['desde', 'hasta', 'codo']) if (typeof a[c] !== 'number' || !Number.isFinite(a[c])) e(`.${c}`, 'debe ser un número en unidades del símbolo')
      if (typeof a.desde === 'number' && typeof a.hasta === 'number' && !(a.desde < a.hasta)) e('.hasta', 'debe ser mayor que desde')
      return { tipo: 'cursor', prop: a.prop, desde: a.desde, hasta: a.hasta, codo: a.codo }
    }
    case 'sonido': {
      const f = props.find((p) => p.id === a.frecuencia)
      if (!f || f.opciones || f.unidad !== 'Hz') e('.frecuencia', 'debe ser una propiedad numérica en Hz')
      const ondas = ['triangular', 'senoidal', 'cuadrada']
      if (!ondas.includes(a.onda)) e('.onda', `debe ser ${ondas.join(', ')}`)
      return { tipo: 'sonido', frecuencia: a.frecuencia, onda: a.onda }
    }
    case 'luces': {
      const elementos: any[] = modelo?.tipo === 'compuesto' && Array.isArray(modelo.elementos) ? modelo.elementos : []
      const salida: { elemento: number; x: number; y: number; color: string }[] = []
      if (!Array.isArray(a.luces) || a.luces.length === 0) return void e('.luces', 'debe ser una lista con al menos una luz')
      a.luces.forEach((l: any, k: number) => {
        const c = `.luces[${k}]`
        if (l === null || typeof l !== 'object' || Array.isArray(l)) return void e(c, 'debe ser un objeto')
        for (const clave of Object.keys(l)) if (!['elemento', 'x', 'y', 'color'].includes(clave)) e(`${c}.${clave}`, 'clave desconocida: van elemento, x, y y color')
        if (!(esEntero(l.elemento) && elementos[l.elemento]?.t === 'D')) e(`${c}.elemento`, 'debe ser el índice de un diodo (t: "D") de modelo.elementos')
        for (const eje of ['x', 'y']) if (!(esEntero(l[eje]) && l[eje] % 2 === 0)) e(`${c}.${eje}`, 'debe ser un entero par (rejilla de 2.5 mm)')
        if (!(COLORES_DE_LUZ as readonly string[]).includes(l.color)) e(`${c}.color`, `debe ser un color de luz (${COLORES_DE_LUZ.join(', ')})`)
        salida.push({ elemento: l.elemento, x: l.x, y: l.y, color: l.color })
      })
      return { tipo: 'luces', luces: salida }
    }
  }
}

/** Lo que admite la pieza antes de avisar y de quemarse. */
function validarLimites(l: any, modelo: any, props: PropDef[], pines: { id: string }[], err: (campo: string, msg: string) => void): LimitesDef | undefined {
  if (l === null || typeof l !== 'object' || Array.isArray(l)) return void err('limites', 'debe ser un objeto')
  for (const k of Object.keys(l)) if (!['potencia', 'por', 'voltaje', 'quema', 'compuesto', 'absolutos'].includes(k)) err(`limites.${k}`, 'clave desconocida: van potencia, por, voltaje, quema, compuesto y absolutos')
  const out: LimitesDef = {}
  if (l.potencia !== undefined) {
    const q = props.find((p) => p.id === l.potencia)
    if (modelo?.tipo !== 'R') err('limites.potencia', 'solo la resistencia tiene potencia nominal')
    else if (!q?.opciones) err('limites.potencia', 'debe ser una propiedad de lista de la pieza')
    else if (!q.opciones.every((o) => { const v = leerValor(o); return v !== null && v.valor > 0 && v.unidad === 'W' })) err('limites.potencia', 'sus opciones deben ser potencias en W, como «0.25 W»')
    else out.potencia = l.potencia
  }
  if (l.por !== undefined) {
    const q = props.find((p) => p.id === l.por?.prop)
    if (modelo?.tipo !== 'bjt' && modelo?.tipo !== 'mosfet') err('limites.por', 'solo los transistores tienen límites por modelo')
    else if (!q?.opciones) err('limites.por.prop', 'debe ser una propiedad de lista de la pieza')
    else if (l.por.valores === null || typeof l.por.valores !== 'object') err('limites.por.valores', 'debe ser un objeto')
    else {
      for (const o of q.opciones) {
        const v = l.por.valores[o]
        if (v === undefined) err(`limites.por.valores.${o}`, 'falta: cada opción necesita su corriente y su potencia máximas')
        else if (v === null || typeof v !== 'object' || Array.isArray(v)) err(`limites.por.valores.${o}`, 'debe ser un objeto con corriente (A) y potencia (W)')
        else if (!(typeof v.corriente === 'number' && v.corriente > 0 && typeof v.potencia === 'number' && v.potencia > 0)) err(`limites.por.valores.${o}`, 'debe tener corriente (A) y potencia (W) positivas')
        else if (typeof v.fuente !== 'string' || v.fuente.trim() === '') err(`limites.por.valores.${o}.fuente`, 'debe decir de qué hoja de datos salen')
      }
      for (const k of Object.keys(l.por.valores)) if (!q.opciones.includes(k)) err(`limites.por.valores.${k}`, 'no es una de las opciones de la propiedad')
      out.por = { prop: l.por.prop, valores: l.por.valores }
    }
  }
  if (l.voltaje !== undefined) {
    const v = l.voltaje
    const q = props.find((p) => p.id === v?.prop)
    const nominal = (t: string) => {
      const x = leerValor(t)
      return x !== null && x.valor > 0 && (!x.unidad || x.unidad === 'V')
    }
    if (modelo?.tipo !== 'C' && modelo?.tipo !== 'motor') err('limites.voltaje', 'solo el capacitor electrolítico y el motor tienen voltaje nominal')
    else if (!q || q.texto) err('limites.voltaje.prop', 'debe ser una propiedad de la pieza con un voltaje')
    else if (!(q.opciones ? q.opciones.every(nominal) : nominal(q.defecto))) err('limites.voltaje.prop', 'sus valores deben ser voltajes mayores que cero, como «25 V»')
    else if (!(typeof v.aviso === 'number' && v.aviso >= 1)) err('limites.voltaje.aviso', 'debe ser el número de veces el nominal desde el que avisa (1 o más)')
    else if (v.inverso !== undefined && !(modelo?.tipo === 'C' && typeof v.inverso === 'number' && v.inverso > 0)) err('limites.voltaje.inverso', 'solo el capacitor tiene un voltaje inverso máximo, mayor que cero (V)')
    else if (modelo?.tipo === 'C' && v.inverso === undefined) err('limites.voltaje.inverso', 'el capacitor necesita su voltaje inverso máximo (V)')
    else out.voltaje = { prop: v.prop, aviso: v.aviso, ...(v.inverso !== undefined ? { inverso: v.inverso } : {}) }
  }
  if (l.compuesto !== undefined) {
    const lista: any[] | undefined = Array.isArray(l.compuesto) ? l.compuesto : undefined
    const n = modelo?.tipo === 'compuesto' && Array.isArray(modelo.elementos) ? modelo.elementos.length : 0
    if (modelo?.tipo !== 'compuesto') err('limites.compuesto', 'solo una pieza compuesta tiene límites por canal')
    else if (!lista || lista.length === 0) err('limites.compuesto', 'debe ser una lista con al menos un límite')
    else {
      const ok = lista.map((c, k) => {
        const donde = `limites.compuesto.${k}`
        const mal = (campo: string, msg: string): false => {
          err(campo === '' ? donde : `${donde}.${campo}`, msg)
          return false
        }
        if (c === null || typeof c !== 'object' || Array.isArray(c)) return mal('', 'debe ser un objeto')
        if (typeof c.nombre !== 'string' || c.nombre.trim() === '') return mal('nombre', 'debe decir cómo se llama (por ejemplo «canal 1»)')
        if (!Array.isArray(c.elementos) || c.elementos.length === 0 || !c.elementos.every((x: unknown) => Number.isInteger(x) && (x as number) >= 0 && (x as number) < n)) return mal('elementos', `debe ser una lista de índices de modelo.elementos (de 0 a ${n - 1})`)
        if (c.medida !== undefined && c.medida !== 'corriente' && c.medida !== 'voltaje') return mal('medida', 'debe ser «corriente» o «voltaje»')
        if (c.sentido !== 'positiva' && c.sentido !== 'negativa') return mal('sentido', 'debe ser «positiva» o «negativa»')
        if (!(typeof c.max === 'number' && c.max > 0)) return mal('max', 'debe ser un máximo positivo (A o V, según medida)')
        if (typeof c.consejo !== 'string' || c.consejo.trim() === '') return mal('consejo', 'debe decir qué hacer cuando se pasa')
        if (typeof c.fuente !== 'string' || c.fuente.trim() === '') return mal('fuente', 'debe decir de qué hoja de datos sale (o que es un criterio de Kirchi)')
        return true
      })
      if (ok.every(Boolean)) out.compuesto = lista.map((c) => ({ nombre: c.nombre, elementos: c.elementos, ...(c.medida !== undefined ? { medida: c.medida } : {}), sentido: c.sentido, max: c.max, consejo: c.consejo, fuente: c.fuente }))
    }
  }
  if (l.absolutos !== undefined) {
    const a = l.absolutos
    const q = a?.prop !== undefined ? props.find((p) => p.id === a.prop) : undefined
    const ids = new Set(pines.map((x) => x.id))
    const tipos = ['ampop', 'comparador', 'bjt', 'mosfet', 'jfet', 'D', 'zener', 'termistor', 'ldr', 'compuesto', '555', 'puente-h']
    if (!tipos.includes(modelo?.tipo)) err('limites.absolutos', `solo ${tipos.join(', ')} tienen máximos absolutos`)
    else if (a === null || typeof a !== 'object' || Array.isArray(a) || a.valores === null || typeof a.valores !== 'object' || Array.isArray(a.valores)) err('limites.absolutos', 'debe ser un objeto con valores')
    else if (a.prop !== undefined && !q?.opciones) err('limites.absolutos.prop', 'debe ser una propiedad de lista de la pieza')
    else {
      let bien = true
      const mal = (campo: string, msg: string) => {
        bien = false
        err(`limites.absolutos.${campo}`, msg)
      }
      const llaves = Object.keys(a.valores)
      if (llaves.length === 0) mal('valores', 'debe dar al menos un juego de máximos')
      for (const o of llaves) {
        const v = a.valores[o]
        if (a.prop === undefined ? o !== '*' : !q!.opciones!.includes(o)) mal(`valores.${o}`, a.prop === undefined ? 'sin prop, el único juego va en la llave «*»' : 'no es una de las opciones de la propiedad')
        else if (v === null || typeof v !== 'object' || Array.isArray(v)) mal(`valores.${o}`, 'debe ser un objeto con fuente y limites')
        else if (typeof v.fuente !== 'string' || v.fuente.trim() === '') mal(`valores.${o}.fuente`, 'debe decir de qué hoja de datos salen (documento, revisión y tabla)')
        else if (!Array.isArray(v.limites) || v.limites.length === 0) mal(`valores.${o}.limites`, 'debe ser una lista con al menos un máximo')
        else
          v.limites.forEach((x: any, k: number) => {
            const d = `valores.${o}.limites.${k}`
            const pin = (t: unknown) => typeof t === 'string' && ids.has(t)
            if (x === null || typeof x !== 'object' || Array.isArray(x)) return mal(d, 'debe ser un objeto')
            if (typeof x.nombre !== 'string' || x.nombre.trim() === '') return mal(`${d}.nombre`, 'debe decir de qué es el máximo (por ejemplo «alimentación»)')
            if (typeof x.consejo !== 'string' || x.consejo.trim() === '') return mal(`${d}.consejo`, 'debe decir qué hacer cuando se pasa')
            if (x.medida !== undefined) {
              if (x.medida !== 'corriente' && x.medida !== 'potencia') return mal(`${d}.medida`, 'debe ser «corriente» o «potencia»')
              if (x.de !== undefined || x.a !== undefined) return mal(d, 'un máximo de corriente o potencia no lleva de ni a')
            } else {
              const de: unknown[] = Array.isArray(x.de) ? x.de : [x.de]
              if (de.length === 0 || !de.every(pin)) return mal(`${d}.de`, 'debe ser un pin de la pieza (o una lista de pines)')
              if (!(pin(x.a) || x.a === 'tierra')) return mal(`${d}.a`, 'debe ser un pin de la pieza o «tierra»')
            }
            if (x.min !== undefined && typeof x.min !== 'number') return mal(`${d}.min`, 'debe ser un número')
            if (x.max !== undefined && typeof x.max !== 'number') return mal(`${d}.max`, 'debe ser un número')
            if (x.min === undefined && x.max === undefined) return mal(d, 'necesita min, max o los dos')
            if (x.abs !== undefined && (typeof x.abs !== 'boolean' || x.min !== undefined)) return mal(`${d}.abs`, 'debe ser verdadero o falso, y no va con min')
            if (x.sinQuema !== undefined && typeof x.sinQuema !== 'boolean') return mal(`${d}.sinQuema`, 'debe ser verdadero o falso')
            if (x.escala !== undefined && !(typeof x.escala === 'number' && x.escala > 0)) return mal(`${d}.escala`, 'debe ser un número positivo')
            if (x.medida !== undefined && x.max !== undefined && !(x.max > 0)) return mal(`${d}.max`, 'debe ser positivo')
          })
      }
      if (bien) out.absolutos = { ...(a.prop !== undefined ? { prop: a.prop } : {}), valores: a.valores }
    }
  }
  if (l.quema !== undefined) {
    const q = l.quema
    // El capacitor se quema al pasar de su límite (factor 1); las demás piezas, de un múltiplo suyo.
    const factorMin = modelo?.tipo === 'C' ? 1 : 1 + Number.EPSILON
    if (!(q && typeof q.factor === 'number' && q.factor >= factorMin && typeof q.durante === 'number' && q.durante > 0)) err('limites.quema', modelo?.tipo === 'C' ? 'debe tener factor de 1 o más y durante positivo (s)' : 'debe tener factor mayor que 1 y durante positivo (s)')
    else if (!['D', 'R', 'bjt', 'mosfet', 'jfet', 'C', 'motor', 'ampop', 'comparador', 'zener', 'compuesto'].includes(modelo?.tipo)) err('limites.quema', 'solo se queman el LED y el diodo, la resistencia, los transistores y JFET, el capacitor electrolítico, el motor, el amp-op, el Zener y las piezas compuestas')
    else if (q.elemento !== undefined && !(modelo?.tipo === 'compuesto' && Number.isInteger(q.elemento) && q.elemento >= 0 && q.elemento < (Array.isArray(modelo.elementos) ? modelo.elementos.length : 0))) err('limites.quema.elemento', 'solo una pieza compuesta lo lleva: un índice de modelo.elementos')
    else if (modelo?.tipo === 'compuesto' && q.elemento === undefined) err('limites.quema.elemento', 'una pieza compuesta necesita el índice de modelo.elementos que se abre')
    else out.quema = { factor: q.factor, durante: q.durante, ...(q.elemento !== undefined ? { elemento: q.elemento } : {}) }
  }
  return out
}

export function lineaDeError(texto: string, error: unknown): number | null {
  const msg = error instanceof Error ? error.message : String(error)
  const l = /line (\d+)/.exec(msg)
  if (l) return Number(l[1])
  const p = /position (\d+)/.exec(msg)
  if (p) return texto.slice(0, Number(p[1])).split('\n').length
  return null
}

/** Las claves que admite el nivel superior de `pieza.json` y cada pin: una errata («hojas» por «hoja») se rechaza en vez de ignorarse. */
const CLAVES_RAIZ = ['id', 'nombre', 'categoria', 'prefijo', 'buscar', 'pines', 'props', 'modelo', 'etiquetas', 'rotulos', 'entradas', 'oculta', 'variantes', 'animacion', 'limites', 'fuentes', 'datos', 'caja', 'grupo']
const CLAVES_PIN = ['id', 'nombre', 'x', 'y', 'ayuda']

export function validarPieza(texto: string, ruta: string): Validacion {
  let d: any
  texto = texto.replace(/^﻿/, '')
  try {
    d = JSON.parse(texto)
  } catch (e) {
    const l = lineaDeError(texto, e)
    return { ok: false, errores: [`${ruta}: JSON inválido${l ? ` en la línea ${l}` : ''}`] }
  }
  if (d === null || typeof d !== 'object' || Array.isArray(d)) return { ok: false, errores: [`${ruta}: el archivo debe contener un objeto JSON`] }
  const errores: string[] = []
  const err = (campo: string, msg: string) => errores.push(`${ruta}: ${campo} ${msg}`)

  for (const k of Object.keys(d)) {
    if (CLAVES_RAIZ.includes(k)) continue
    const parecida = nombreParecido(k, CLAVES_RAIZ)
    err(k, `clave desconocida${parecida ? `, ¿quisiste decir «${parecida}»?` : ''}`)
  }
  if (!esTexto(d?.id) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.id)) err('id', 'debe ser texto en minúsculas con guiones')
  if (!esTexto(d?.nombre?.es) || !esTexto(d?.nombre?.en)) err('nombre', 'debe tener «es» y «en»')
  if (!esTexto(d?.categoria)) err('categoria', 'es obligatoria')
  if (!esTexto(d?.prefijo) || !/^[A-Z]{1,4}$/.test(d.prefijo)) err('prefijo', 'debe ser de 1 a 4 mayúsculas')
  if (!Array.isArray(d?.buscar) || d.buscar.length === 0 || !d.buscar.every(esTexto)) err('buscar', 'debe ser una lista de textos con al menos uno')

  const esObj = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v)
  const pines: PinDef[] = []
  if (!Array.isArray(d?.pines) || d.pines.length === 0) err('pines', 'debe tener al menos un pin')
  else
    d.pines.forEach((p: any, i: number) => {
      if (!esObj(p)) return err(`pines[${i}]`, 'debe ser un objeto')
      for (const k of Object.keys(p)) {
        if (CLAVES_PIN.includes(k)) continue
        const parecida = nombreParecido(k, CLAVES_PIN)
        err(`pines[${i}].${k}`, `clave desconocida${parecida ? `, ¿quisiste decir «${parecida}»?` : ''}`)
      }
      if (!esTexto(p.id)) err(`pines[${i}].id`, 'es obligatorio')
      if (!esTexto(p.nombre)) err(`pines[${i}].nombre`, 'es obligatorio')
      for (const eje of ['x', 'y'] as const) {
        if (!esEntero(p[eje])) err(`pines[${i}].${eje}`, 'debe ser un entero')
        else if (p[eje] % 2 !== 0) err(`pines[${i}].${eje}`, 'debe ser par (rejilla de 2.5 mm)')
      }
      if (p.ayuda !== undefined && !esTexto(p.ayuda)) err(`pines[${i}].ayuda`, 'debe ser un texto (renglones separados por « · »)')
      if (esTexto(p.id) && pines.some((q) => q.id === p.id)) err(`pines[${i}].id`, `repetido: ${p.id}`)
      pines.push(p)
    })

  const props: PropDef[] = []
  if (d?.props !== undefined && !Array.isArray(d.props)) err('props', 'debe ser una lista')
  else
    (d?.props ?? []).forEach((p: any, i: number) => {
      const c = `props[${i}]`
      if (!esObj(p)) return err(c, 'debe ser un objeto')
      if (!esTexto(p.id)) err(`${c}.id`, 'es obligatorio')
      else if (props.some((q) => q.id === p.id)) err(`${c}.id`, `repetido: ${p.id}`)
      else if ((PROPS_DE_DOCUMENTO as readonly string[]).includes(p.id)) err(`${c}.id`, `«${p.id}» está reservado para el documento`)
      if (!esTexto(p.nombre)) err(`${c}.nombre`, 'es obligatorio')
      const hayOpciones = p.opciones !== undefined
      if (hayOpciones && (!Array.isArray(p.opciones) || p.opciones.length === 0 || !p.opciones.every(esTexto))) err(`${c}.opciones`, 'debe ser una lista de textos no vacía')
      if (p.mostrar !== undefined) {
        if (typeof p.mostrar !== 'boolean') err(`${c}.mostrar`, 'debe ser verdadero o falso')
        else if (p.mostrar && !hayOpciones) err(`${c}.mostrar`, 'solo aplica a una propiedad de lista (con opciones)')
      }
      if (p.ajuste !== undefined && typeof p.ajuste !== 'boolean') err(`${c}.ajuste`, 'debe ser verdadero o falso')
      if (p.omitir !== undefined && typeof p.omitir !== 'boolean') err(`${c}.omitir`, 'debe ser verdadero o falso')
      if (p.enVivo !== undefined) validarEnVivo(p, c, err)
      // Valores comerciales: `serie` ofrece una serie en el editor; `catalogo` toma `comunes` como los valores del
      // catálogo y deja cualquier otro como «Personalizado». Solo en una propiedad numérica.
      const numericaProp = !hayOpciones && p.texto !== true
      if (p.serie !== undefined) {
        if (!SERIES_DE_PROP.includes(p.serie)) err(`${c}.serie`, 'debe ser «elegida», «E6», «E12» o «E24»')
        else if (!numericaProp) err(`${c}.serie`, 'solo aplica a una propiedad numérica')
      }
      if (p.catalogo !== undefined) {
        if (typeof p.catalogo !== 'boolean') err(`${c}.catalogo`, 'debe ser verdadero o falso')
        else if (p.catalogo && !numericaProp) err(`${c}.catalogo`, 'solo aplica a una propiedad numérica')
        else if (p.catalogo && !(Array.isArray(p.comunes) && p.comunes.length > 0)) err(`${c}.catalogo`, 'necesita una lista de comunes')
        else if (p.catalogo && p.serie !== undefined) err(`${c}.serie`, 'y catalogo no se combinan')
      }
      if (p.casilla !== undefined) {
        if (typeof p.casilla !== 'boolean') err(`${c}.casilla`, 'debe ser verdadero o falso')
        else if (p.casilla && !(Array.isArray(p.opciones) && p.opciones.length === 2)) err(`${c}.casilla`, 'solo aplica a una lista de dos opciones')
      }
      if (p.texto !== undefined) {
        if (typeof p.texto !== 'boolean') err(`${c}.texto`, 'debe ser verdadero o falso')
        else if (p.texto && (hayOpciones || p.unidad !== undefined || p.mostrar !== undefined)) err(`${c}.texto`, 'no puede combinarse con opciones, unidad ni mostrar')
      }
      if (p.largoMax !== undefined) {
        if (p.texto !== true) err(`${c}.largoMax`, 'solo aplica a una propiedad de texto')
        else if (!Number.isInteger(p.largoMax) || p.largoMax <= MAX_TEXTO_PROP || p.largoMax > MAX_TEXTO_LARGO) err(`${c}.largoMax`, `debe ser un entero de ${MAX_TEXTO_PROP + 1} a ${MAX_TEXTO_LARGO}`)
      }
      // En una propiedad de texto, `comunes` son nombres listos (los del terminal de alimentación: «+15V», «VEE»).
      if (p.comunes !== undefined && p.texto === true) {
        if (!Array.isArray(p.comunes) || !p.comunes.every((v: unknown) => typeof v === 'string' && v.trim() !== '' && v.length <= MAX_TEXTO_PROP))
          err(`${c}.comunes`, `debe ser una lista de textos de 1 a ${MAX_TEXTO_PROP} caracteres`)
      } else if (p.comunes !== undefined) {
        if (!Array.isArray(p.comunes) || !p.comunes.every(esTexto)) err(`${c}.comunes`, 'debe ser una lista de textos')
        else
          for (const v of p.comunes) if (!leerValor(v)) err(`${c}.comunes`, `contiene un valor no válido: «${v}»`)
      }
      if (typeof p.defecto !== 'string') err(`${c}.defecto`, 'es obligatorio')
      else if (hayOpciones) {
        if (Array.isArray(p.opciones) && !p.opciones.includes(p.defecto)) err(`${c}.defecto`, 'debe ser una de las opciones')
      } else if (p.texto === true) {
        const tope = Number.isInteger(p.largoMax) ? p.largoMax : MAX_TEXTO_PROP
        if (p.defecto.trim() === '' || p.defecto.length > tope) err(`${c}.defecto`, `debe ser un texto de 1 a ${tope} caracteres`)
      } else if (!leerValor(p.defecto)) err(`${c}.defecto`, `no es un valor válido: «${p.defecto}»`)
      else if (esObj(p.enVivo) && esNumero(p.enVivo.min) && esNumero(p.enVivo.max)) {
        const x = leerValor(p.defecto)?.valor
        if (x !== undefined && (x < p.enVivo.min || x > p.enVivo.max)) err(`${c}.defecto`, 'debe estar entre el min y el max de enVivo')
      }
      props.push(p)
    })

  let modelo = d?.modelo as ModeloDef | undefined
  if (modelo !== undefined) {
    const m = modelo as any
    const pinExiste = (id: unknown) => pines.some((p) => p.id === id)
    const propExiste = (id: unknown) => props.some((p) => p.id === id)
    if (!MODELOS.includes(m?.tipo)) err('modelo.tipo', `debe ser uno de ${MODELOS.join(', ')}`)
    else if (Object.keys(m).some((k) => !CLAVES[m.tipo].includes(k))) {
      for (const k of Object.keys(m)) {
        if (CLAVES[m.tipo].includes(k)) continue
        const parecida = nombreParecido(k, CLAVES[m.tipo])
        err(`modelo.${k}`, `clave desconocida en un modelo «${m.tipo}»${parecida ? `, ¿quisiste decir «${parecida}»?` : ''}`)
      }
    } else if (m.tipo === 'tierra') {
      if (!pinExiste(m.pin)) err('modelo.pin', 'no es un pin de la pieza')
    } else if (Object.hasOwn(TERMINALES, m.tipo)) {
      const campos = TERMINALES[m.tipo]
      for (const k of campos) if (!pinExiste(m[k])) err(`modelo.${k}`, 'no es un pin de la pieza')
      if (new Set(campos.map((k) => m[k])).size !== campos.length) err('modelo', 'cada terminal debe ser un pin distinto')
      // Una propiedad numérica que el modelo lee.
      const numerica = (campo: string) => {
        const q = props.find((p) => p.id === m[campo])
        if (!q) err(`modelo.${campo}`, 'no es una propiedad de la pieza')
        else if (q.opciones || q.texto) err(`modelo.${campo}`, 'debe ser una propiedad numérica')
      }
      if (m.tipo === 'rele') {
        numerica('voltaje')
        for (const c of ['potencia', 'tau', 'operar']) if (!(esNumero(m[c]) && m[c] > 0)) err(`modelo.${c}`, 'debe ser positivo')
        if (!(esNumero(m.liberar) && m.liberar >= 0 && m.liberar < m.operar)) err('modelo.liberar', 'debe estar entre 0 y modelo.operar')
      } else {
        const polaridad = m.tipo === 'bjt' ? 'pnp' : m.tipo === 'mosfet' ? 'pmos' : null
        if (polaridad && typeof m[polaridad] !== 'boolean') err(`modelo.${polaridad}`, 'debe ser verdadero o falso')
        const prop = props.find((p) => p.id === m.prop)
        if (!prop) err('modelo.prop', 'no es una propiedad de la pieza')
        else if (!prop.opciones) err('modelo.prop', 'debe ser una propiedad de lista')
        else if (!esObj(m.modelos)) err('modelo.modelos', 'debe ser un objeto')
        else {
          for (const o of prop.opciones) {
            const v = m.modelos[o]
            if (m.tipo === 'comparador' && esObj(v)) for (const k of [...PARAMETROS_COMPARADOR_AO, ...PARAMETROS_COMPARADOR_Q]) if (v[k] === undefined) err(`modelo.modelos.${o}.${k}`, 'falta: el comparador necesita todos sus parámetros')
            if (!esObj(v)) err(`modelo.modelos.${o}`, 'falta: cada opción de la propiedad necesita sus parámetros')
            else
              for (const [k, x] of Object.entries(v)) {
                if (!esNumero(x)) err(`modelo.modelos.${o}.${k}`, 'debe ser un número')
                else if (m.tipo === 'bjt' || m.tipo === 'mosfet' || m.tipo === 'ampop') {
                  const problema = problemaDeParametro(m.tipo, k, x)
                  if (problema) err(`modelo.modelos.${o}.${k}`, problema)
                } else if (m.tipo === 'comparador') {
                  // Los nueve del amplificador y los del transistor de salida (`rbase` es la resistencia entre ambos).
                  const problema = PARAMETROS_COMPARADOR_AO.includes(k) ? problemaDeParametro('ampop', k, x) : PARAMETROS_COMPARADOR_Q.includes(k) ? (x > 0 ? null : 'debe ser positivo') : `parámetro desconocido (los del comparador son ${[...PARAMETROS_COMPARADOR_AO, ...PARAMETROS_COMPARADOR_Q].join(', ')})`
                  if (problema) err(`modelo.modelos.${o}.${k}`, problema)
                }
              }
          }
          for (const k of Object.keys(m.modelos)) if (!prop.opciones.includes(k)) err(`modelo.modelos.${k}`, 'no es una de las opciones de la propiedad')
        }
      }
    } else if ((MODELOS_NUEVOS as readonly string[]).includes(m.tipo)) {
      validarModeloNuevo(m, pinExiste, props, err)
    } else if ((MODELOS_DIGITALES as readonly string[]).includes(m.tipo)) {
      validarModeloDigital(m, pinExiste, props, err)
    } else if ((MODELOS_MSI as readonly string[]).includes(m.tipo)) {
      validarModeloMsi(m, pinExiste, props, err, pines.map((p) => p.id))
    } else if ((MODELOS_INSTRUMENTOS as readonly string[]).includes(m.tipo)) {
      validarModeloInstrumento(m, pinExiste, props, err)
    } else if (m.tipo === 'compuesto') {
      validarCompuesto(m, pines.map((q) => q.id), props, err)
    } else if (m.tipo === 'alimentacion') {
      if (!pinExiste(m.pin)) err('modelo.pin', 'no es un pin de la pieza')
      const nombre = props.find((q) => q.id === m.nombre)
      if (!nombre) err('modelo.nombre', 'no es una propiedad de la pieza')
      else if (!nombre.texto) err('modelo.nombre', 'debe ser una propiedad de texto (con "texto": true)')
    } else {
      if (!pinExiste(m.a)) err('modelo.a', 'no es un pin de la pieza')
      const reostato = m.tipo === 'pot' && m.reostato === true
      if (reostato && m.b !== undefined) err('modelo.b', 'un reóstato no lleva modelo.b: es una sola resistencia del extremo al cursor')
      else if (!reostato && !pinExiste(m.b)) err('modelo.b', 'no es un pin de la pieza')
      if (m.reostato !== undefined && (m.tipo !== 'pot' || m.reostato !== true)) err('modelo.reostato', 'solo puede ser verdadero y solo lo lleva un potenciómetro')
      if (m.a === m.b && pinExiste(m.a)) err('modelo.b', 'no puede ser el mismo pin que modelo.a')
      if (m.tipo === 'interruptor' && m.c !== undefined) {
        if (!pinExiste(m.c)) err('modelo.c', 'no es un pin de la pieza')
        else if (m.c === m.a || m.c === m.b) err('modelo.c', 'debe ser un pin distinto de modelo.a y modelo.b')
        if (m.momentaneo) err('modelo.momentaneo', 'un conmutador (con modelo.c) no puede ser momentáneo')
      }
      if (m.rserie !== undefined) {
        const q = props.find((x) => x.id === m.rserie)
        if (m.tipo !== 'C' && m.tipo !== 'L' && m.tipo !== 'V') err('modelo.rserie', 'solo lo llevan un capacitor, una bobina y una fuente de voltaje')
        else if (!q) err('modelo.rserie', 'no es una propiedad de la pieza')
        else if (q.opciones || q.texto) err('modelo.rserie', 'debe ser una propiedad numérica')
      }
      if (m.tipo === 'pot') {
        if (!pinExiste(m.c)) err('modelo.c', 'no es un pin de la pieza')
        else if (m.c === m.a || m.c === m.b) err('modelo.c', 'debe ser un pin distinto de modelo.a y modelo.b')
        if (m.ley !== undefined) {
          const ley = props.find((q) => q.id === m.ley)
          if (!ley) err('modelo.ley', 'no es una propiedad de la pieza')
          else if (!ley.opciones) err('modelo.ley', 'debe ser una propiedad de lista')
          else if (!ley.opciones.every((o) => (LEYES_POT as readonly string[]).includes(o))) err('modelo.ley', `sus opciones deben ser de ${LEYES_POT.join(', ')}`)
        }
        const pos = props.find((q) => q.id === m.posicion)
        if (!pos) err('modelo.posicion', 'no es una propiedad de la pieza')
        else if (!pos.opciones) err('modelo.posicion', 'debe ser una propiedad de lista')
        else if (!pos.opciones.every((o) => leerPosicion(o) !== null)) err('modelo.posicion', 'sus opciones deben ser porcentajes de 0 a 100, como «50 %»')
      }
      if (m.tipo === 'D') {
        if (!(typeof m.is === 'number' && m.is > 0)) err('modelo.is', 'debe ser positivo')
        if (!(typeof m.n === 'number' && m.n > 0)) err('modelo.n', 'debe ser positivo')
        const corriente = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0
        if (m.inom !== undefined && !corriente(m.inom)) err('modelo.inom', 'debe ser una corriente positiva en A')
        if (m.por !== undefined) {
          const prop = props.find((p) => p.id === m.por?.prop)
          const valores = m.por?.valores
          if (!prop) err('modelo.por.prop', 'no es una propiedad de la pieza')
          else if (!prop.opciones) err('modelo.por.prop', 'debe ser una propiedad de lista')
          else if (valores === null || typeof valores !== 'object' || Array.isArray(valores)) err('modelo.por.valores', 'debe ser un objeto')
          else
            for (const [k, v] of Object.entries(valores as Record<string, any>)) {
              if (!prop.opciones.includes(k)) err(`modelo.por.valores.${k}`, 'no es una de las opciones de la propiedad')
              else if (!(typeof v?.is === 'number' && v.is > 0 && typeof v?.n === 'number' && v.n > 0)) err(`modelo.por.valores.${k}`, 'debe tener is y n positivos')
              else if (v.inom !== undefined && !corriente(v.inom)) err(`modelo.por.valores.${k}.inom`, 'debe ser una corriente positiva en A')
              else
                for (const c of ['rs', 'bv', 'ibv', 'cjo', 'vj', 'm', 'tt', 'fc'])
                  if (v[c] !== undefined && !(typeof v[c] === 'number' && Number.isFinite(v[c]) && v[c] >= 0)) err(`modelo.por.valores.${k}.${c}`, 'debe ser cero o positivo')
            }
        }
      } else if (m.tipo === 'senoidal' || m.tipo === 'pulso') {
        const campos = m.tipo === 'senoidal' ? ['amplitud', 'frecuencia'] : ['alto', 'frecuencia', 'ciclo']
        for (const c of campos) {
          const prop = props.find((p) => p.id === m[c])
          if (!prop) err(`modelo.${c}`, 'no es una propiedad de la pieza')
          else if (c === 'ciclo') {
            if (!prop.opciones) err('modelo.ciclo', 'debe ser una propiedad de lista')
            else if (!prop.opciones.every((o) => leerCiclo(o) !== null)) err('modelo.ciclo', 'sus opciones deben ser porcentajes entre 0 y 100, como «50 %»')
          } else if (prop.opciones) err(`modelo.${c}`, 'debe ser una propiedad numérica')
        }
        // Los tiempos del pulso son opcionales: si están, propiedades numéricas en segundos.
        if (m.tipo === 'pulso')
          for (const c of ['ancho', 'subida', 'bajada', 'retardo']) {
            if (m[c] === undefined) continue
            const prop = props.find((p) => p.id === m[c])
            if (!prop) err(`modelo.${c}`, 'no es una propiedad de la pieza')
            else if (prop.opciones || prop.texto || prop.unidad !== 's') err(`modelo.${c}`, 'debe ser una propiedad numérica en s')
          }
      } else if (m.tipo === 'foco' || m.tipo === 'motor' || m.tipo === 'zumbador') {
        for (const c of m.tipo === 'foco' ? ['voltaje', 'potencia'] : ['voltaje']) {
          const q = props.find((p) => p.id === m[c])
          if (!q) err(`modelo.${c}`, 'no es una propiedad de la pieza')
          else if (q.opciones || q.texto) err(`modelo.${c}`, 'debe ser una propiedad numérica')
        }
        if (m.tipo === 'foco') {
          if (!(esNumero(m.k) && m.k >= 0)) err('modelo.k', 'debe ser cero o positivo')
          if (!(esNumero(m.tau) && m.tau > 0)) err('modelo.tau', 'debe ser positivo')
        } else if (m.tipo === 'motor') {
          const r = m.referencia
          if (!esObj(r)) err('modelo.referencia', 'debe ser un objeto')
          else for (const c of ['v', 'r', 'l', 'ke', 'j', 'bm']) if (!(esNumero(r[c]) && r[c] > 0)) err(`modelo.referencia.${c}`, 'debe ser positivo')
        } else {
          if (!(esNumero(m.potencia) && m.potencia > 0)) err('modelo.potencia', 'debe ser positivo')
          if (!(esNumero(m.umbral) && m.umbral > 0 && m.umbral <= 1)) err('modelo.umbral', 'debe estar entre 0 y 1')
        }
      } else if (!propExiste(m.prop)) err('modelo.prop', 'no es una propiedad de la pieza')
      else {
        const prop = props.find((p) => p.id === m.prop)!
        if (m.tipo === 'interruptor') {
          if (m.momentaneo !== undefined && typeof m.momentaneo !== 'boolean') err('modelo.momentaneo', 'debe ser verdadero o falso')
          if (prop.opciones?.length !== 2) err('modelo.prop', 'debe tener exactamente dos opciones (abierto y cerrado)')
          if (typeof m.cerrado !== 'string') err('modelo.cerrado', 'es obligatorio')
          else if (!prop.opciones?.includes(m.cerrado)) err('modelo.cerrado', 'debe ser una de las opciones de la propiedad')
        } else if (prop.opciones) err('modelo.prop', 'debe ser una propiedad numérica')
        if (m.tipo === 'zener') {
          for (const c of ['is', 'n', 'vj']) if (!(esNumero(m[c]) && m[c] > 0)) err(`modelo.${c}`, 'debe ser positivo')
          if (!(esNumero(m.cjo) && m.cjo >= 0)) err('modelo.cjo', 'debe ser cero o positivo')
          if (!(esNumero(m.m) && m.m > 0 && m.m < 1)) err('modelo.m', 'debe estar entre 0 y 1')
          const filas = (donde: string, serie: unknown) => {
            if (!esObj(serie) || Object.keys(serie as object).length === 0) return void err(donde, 'debe ser un objeto con al menos un voltaje')
            for (const [k, v] of Object.entries(serie as Record<string, any>)) {
              if (!/^[0-9]+(\.[0-9]+)?$/.test(k) || !(Number(k) > 0)) err(`${donde}.${k}`, 'la llave debe ser un voltaje en volts como «5.1»')
              else if (!(esNumero(v?.izt) && v.izt > 0 && esNumero(v?.zzt) && v.zzt > 0)) err(`${donde}.${k}`, 'debe tener izt y zzt positivos')
            }
          }
          filas('modelo.serie', m.serie)
          if (m.sinFamiliaHasta !== undefined && !(esNumero(m.sinFamiliaHasta) && m.sinFamiliaHasta > 0)) err('modelo.sinFamiliaHasta', 'debe ser un voltaje positivo')
          // Otras familias (BZX55 junto a 1N47xx): una serie por opción de una propiedad de lista.
          if (m.por !== undefined) {
            const q = props.find((x) => x.id === m.por?.prop)
            if (!q) err('modelo.por.prop', 'no es una propiedad de la pieza')
            else if (!q.opciones) err('modelo.por.prop', 'debe ser una propiedad de lista')
            else if (!esObj(m.por.valores)) err('modelo.por.valores', 'debe ser un objeto')
            else
              for (const [o, serie] of Object.entries(m.por.valores as Record<string, unknown>)) {
                if (!q.opciones.includes(o)) err(`modelo.por.valores.${o}`, 'no es una de las opciones de la propiedad')
                else filas(`modelo.por.valores.${o}`, serie)
              }
          }
        } else if (m.tipo === 'fusible') {
          for (const c of ['rPorA', 'tau']) if (!(esNumero(m[c]) && m[c] > 0)) err(`modelo.${c}`, 'debe ser positivo')
          if (!(esNumero(m.fusion) && m.fusion > 1)) err('modelo.fusion', 'debe ser mayor que 1')
        }
      }
    }
  }

  const etq = d?.etiquetas ?? {}
  const ref = etq.ref ?? { x: 0, y: -3 }
  const tras = etq.valor?.trasRotulo
  // Con `trasRotulo` el valor sigue al rótulo y su punto es opcional (por omisión el de siempre).
  const valor = tras === undefined ? (etq.valor ?? { x: 0, y: 3 }) : { x: etq.valor.x ?? 0, y: etq.valor.y ?? 3, trasRotulo: tras }
  for (const [n, p] of [['etiquetas.ref', ref], ['etiquetas.valor', valor]] as const) {
    if (!esEntero(p?.x) || !esEntero(p?.y)) err(n, 'debe tener x e y enteros')
  }
  const nRotulos = Array.isArray(d?.rotulos) ? d.rotulos.length : 0
  if (tras !== undefined && !(esEntero(tras) && tras >= 0 && tras < nRotulos)) err('etiquetas.valor.trasRotulo', 'debe ser el índice de uno de los rótulos de la pieza (desde 0)')

  const rotulos: Rotulo[] = []
  if (d?.rotulos !== undefined && !Array.isArray(d.rotulos)) err('rotulos', 'debe ser una lista')
  else
    (d?.rotulos ?? []).forEach((r: any, i: number) => {
      const c = `rotulos[${i}]`
      if (!esObj(r)) return err(c, 'debe ser un objeto')
      if (r.prop !== undefined) {
        if (!props.some((q) => q.id === r.prop && (q.texto === true || q.opciones !== undefined))) err(`${c}.prop`, 'debe ser una propiedad de texto (con "texto": true) o de lista de la pieza')
      } else if (!esTexto(r.texto)) err(`${c}.texto`, 'es obligatorio')
      for (const eje of ['x', 'y'] as const) if (typeof r[eje] !== 'number' || !Number.isFinite(r[eje])) err(`${c}.${eje}`, 'debe ser un número')
      if (r.tam !== undefined && !(typeof r.tam === 'number' && r.tam > 0 && r.tam <= 10)) err(`${c}.tam`, 'debe ser un número positivo en mm (hasta 10)')
      if (r.alinear !== undefined && !['izq', 'centro', 'der', 'arriba', 'abajo'].includes(r.alinear)) err(`${c}.alinear`, 'debe ser izq, centro, der, arriba o abajo')
      if (r.fuente !== undefined && !['sans', 'mono'].includes(r.fuente)) err(`${c}.fuente`, 'debe ser sans o mono')
      if (r.tinta !== undefined && !['pieza', 'valor'].includes(r.tinta)) err(`${c}.tinta`, 'debe ser pieza o valor')
      if (r.valores !== undefined) {
        const q = props.find((x) => x.id === r.prop)
        const ajena = esObj(r.valores) ? Object.keys(r.valores).find((k) => !q?.opciones?.includes(k)) : undefined
        if (!q?.opciones) err(`${c}.valores`, 'solo aplica con una propiedad de lista en prop')
        else if (!esObj(r.valores) || !Object.values(r.valores).every((v) => typeof v === 'string')) err(`${c}.valores`, 'debe ser un objeto de textos')
        else if (ajena !== undefined) err(`${c}.valores`, `debe dar un texto por opción de su propiedad («${ajena}» no es una)`)
      }
      const base = r.prop !== undefined ? props.find((q) => q.id === r.prop)?.defecto ?? '' : r.texto
      rotulos.push({
        texto: base,
        ...(r.prop !== undefined ? { prop: r.prop } : {}),
        ...(esObj(r.valores) ? { valores: r.valores } : {}),
        x: r.x, y: r.y, tam: r.tam ?? 1.25, alinear: r.alinear ?? 'centro', fuente: r.fuente ?? 'mono', tinta: r.tinta ?? 'pieza'
      })
    })

  // Compuerta de entradas variables: la pieza es la de dos entradas y la librería arma las demás.
  let entradas: PiezaDef['entradas']
  if (d?.entradas !== undefined) {
    const e = d.entradas
    const lista = props.find((q) => q.id === 'entradas')
    if (!esObj(e) || !(esEntero(e.max) && e.max >= 3 && e.max <= 8)) err('entradas', 'debe ser un objeto con max, un entero de 3 a 8')
    else if (modelo?.tipo !== 'compuerta' || modelo.funcion === 'not' || modelo.entradas.length !== 2) err('entradas', 'solo lo lleva una compuerta de dos entradas (no NOT)')
    else if (!lista?.opciones || lista.opciones.join() !== Array.from({ length: e.max - 1 }, (_, k) => String(k + 2)).join() || lista.defecto !== '2') err('props', `debe tener la propiedad de lista «entradas» con las opciones de 2 a ${e.max} y «2» por omisión`)
    else entradas = { base: d.id, n: 2, max: e.max }
  }

  let variantes: DefSinGeometria['variantes']
  if (d?.variantes !== undefined) {
    const v = d.variantes
    const q = props.find((x) => x.id === v?.prop)
    if (!esObj(v)) err('variantes', 'debe ser un objeto')
    else if (!q?.opciones) err('variantes.prop', 'debe ser una propiedad de lista de la pieza')
    else if (!esObj(v.simbolos)) err('variantes.simbolos', 'debe ser un objeto')
    else {
      for (const [k, f] of Object.entries(v.simbolos)) {
        if (!q.opciones.includes(k)) err(`variantes.simbolos.${k}`, 'no es una de las opciones de la propiedad')
        else if (typeof f !== 'string' || !/^simbolo-[a-z0-9-]+\.svg$/.test(f)) err(`variantes.simbolos.${k}`, 'debe ser un archivo simbolo-<nombre>.svg')
      }
      variantes = { prop: v.prop, simbolos: v.simbolos }
    }
  }

  // Una pieza compuesta conoce todos sus pines, en su orden: `terminalesDelModelo` los lee de aquí.
  if (modelo?.tipo === 'compuesto' && !errores.length) modelo = { ...modelo, terminales: pines.map((q) => q.id) }

  // La animación y los límites.
  const animacion = d?.animacion !== undefined ? validarAnimacion(d.animacion, modelo, props, lineaDeClave(texto, 'animacion'), err) : undefined
  const limites = d?.limites !== undefined ? validarLimites(d.limites, modelo, props, pines, err) : undefined

  let fuentes: Record<string, string> | undefined
  if (d?.fuentes !== undefined) {
    if (!d.fuentes || typeof d.fuentes !== 'object' || Array.isArray(d.fuentes) || !Object.values(d.fuentes).every(esTexto)) err('fuentes', 'debe ser un objeto de textos: la fuente de cada modelo')
    else fuentes = { ...d.fuentes }
  }

  const datos = d?.datos !== undefined ? validarDatos(d.datos, pines, props, err) : undefined

  if (d?.caja !== undefined) validarCaja(d.caja, (id) => pines.some((p) => p.id === id), err)
  if (d?.grupo !== undefined && !esTexto(d.grupo)) err('grupo', 'debe ser un texto')

  if (errores.length) return { ok: false, errores }
  return {
    ok: true,
    def: {
      id: d.id, nombre: d.nombre, categoria: d.categoria, prefijo: d.prefijo, buscar: d.buscar, pines, props, modelo, etiquetas: { ref, valor },
      ...(rotulos.length ? { rotulos } : {}),
      ...(entradas ? { entradas } : {}),
      ...(variantes ? { variantes } : {}),
      ...(animacion ? { animacion } : {}),
      ...(limites ? { limites } : {}),
      ...(fuentes ? { fuentes } : {}),
      ...(datos ? { datos } : {}),
      ...(d.caja !== undefined ? { caja: d.caja } : {}),
      ...(d.grupo !== undefined ? { grupo: d.grupo } : {})
    }
  }
}
