/** Fichas de configuración de los análisis. La validación es la de `compartido/analisis/config.ts`, la misma del `.kir` y
 * el IPC. */
import { validarAnalisis, type AnalisisDoc, type ConfigAnalisis, type ParametroBarrido, type TipoAnalisis } from '../../../compartido/analisis/config'
import type { Id } from '../doc/tipos'
import type { ClaseFuente, ContextoAnalisis, FuenteAnalisis } from './contexto'

/** Un botón de la cinta por ficha; el barrido de parámetro es un análisis cualquiera repetido con otro valor de una pieza. */
export type TipoFicha = TipoAnalisis | 'param'
export const TIPOS_FICHA: readonly TipoFicha[] = ['op', 'dc', 'ac', 'tran', 'fourier', 'param']

export const NOMBRE_FICHA: Readonly<Record<TipoFicha, string>> = {
  op: 'Punto de operación',
  dc: 'Barrido de CD',
  ac: 'CA / Bode',
  tran: 'Transitorio',
  fourier: 'Fourier',
  param: 'Barrido de parámetro'
}

/** Una línea que dice qué pregunta responde cada análisis (va bajo el título de la ficha). */
export const AYUDA_FICHA: Readonly<Record<TipoFicha, string>> = {
  op: 'Voltaje de cada red y corriente de cada pieza en reposo, con los capacitores abiertos y los inductores en corto.',
  dc: 'Cómo cambian los voltajes al barrer el valor de una fuente. Una segunda fuente anidada da una curva por cada valor.',
  ac: 'Ganancia en dB y fase en grados contra la frecuencia, con la entrada de CA en la fuente que elijas.',
  tran: 'Los voltajes y las corrientes contra el tiempo, desde el reposo o desde cero, con un paso máximo que tú fijas.',
  fourier: 'Magnitud y fase de los armónicos de una señal periódica, con su distorsión armónica total.',
  param: 'Repite un análisis cambiando el valor de una resistencia, un capacitor, un inductor o una fuente, y compara las curvas.'
}

export const tipoDeFicha = (a: AnalisisDoc): TipoFicha => (a.parametro ? 'param' : a.config.tipo)

/** Los análisis que un barrido de parámetro puede repetir. */
export const BASES_DE_PARAMETRO: readonly TipoAnalisis[] = ['op', 'dc', 'ac', 'tran']

export type Nuevo = { ok: true; analisis: AnalisisDoc } | { ok: false; error: string }

const SIN_FUENTE = 'Este análisis necesita una fuente de voltaje en el circuito y no hay ninguna.'
const SIN_FUENTE_AC = 'Este análisis necesita una fuente de señal en el circuito (un generador o una fuente) y solo hay terminales de alimentación.'
const SIN_BARRIBLE = 'Este análisis necesita una resistencia, un capacitor, un inductor o una fuente de CD que barrer, y el circuito no tiene ninguna.'

/** El nombre «Barrido de CD 2»: el primero libre de ese tipo. */
export function nombreNuevo(tipo: TipoFicha, existentes: readonly AnalisisDoc[]): string {
  const usados = new Set(existentes.map((a) => a.nombre))
  for (let n = 1; ; n++) {
    const nombre = `${NOMBRE_FICHA[tipo]} ${n}`
    if (!usados.has(nombre)) return nombre
  }
}

/** Fuente por omisión de un barrido. CA: generador, luego fuente no CD, luego CD; nunca un riel (saldría en 0 dB).
 * CD: fuente CD, generador, otra señal y por último un riel. Con empate gana la primera por referencia. */
export function fuenteDeEntrada(fuentes: readonly FuenteAnalisis[], tipo: 'ac' | 'dc'): FuenteAnalisis | undefined {
  const orden: ClaseFuente[] = tipo === 'ac' ? ['generador', 'senal', 'continua'] : ['continua', 'generador', 'senal', 'riel']
  for (const clase of orden) {
    const f = fuentes.find((x) => (x.clase ?? 'continua') === clase)
    if (f) return f
  }
  return undefined
}

/** La configuración de arranque de un tipo base, con las fuentes del circuito. */
export function configInicial(tipo: TipoAnalisis, ctx: Pick<ContextoAnalisis, 'fuentes'>): ConfigAnalisis | { error: string } {
  switch (tipo) {
    case 'op':
      return { tipo: 'op' }
    case 'dc': {
      const f = fuenteDeEntrada(ctx.fuentes, 'dc')
      return f ? { tipo: 'dc', fuente: f.id, desde: 0, hasta: 5, paso: 0.1 } : { error: SIN_FUENTE }
    }
    case 'ac': {
      const f = fuenteDeEntrada(ctx.fuentes, 'ac')
      return f ? { tipo: 'ac', barrido: 'dec', puntos: 20, desde: 10, hasta: 1e6, fuente: f.id, magnitud: 1 } : { error: ctx.fuentes.length === 0 ? SIN_FUENTE : SIN_FUENTE_AC }
    }
    case 'tran':
      return { tipo: 'tran', fin: 0.01 }
    case 'fourier':
      return { tipo: 'fourier', fundamental: 1000, armonicos: 10, periodos: 5, descarte: 2, ventana: 'rectangular' }
  }
}

/** El barrido de arranque de una pieza: de la mitad al doble de su valor, en cinco pasos (logarítmico si es positivo). */
export function parametroInicial(p: { id: Id; valor: number }): ParametroBarrido {
  if (p.valor > 0) return { pieza: p.id, modo: 'log', desde: p.valor / 2, hasta: p.valor * 2, puntos: 5 }
  return { pieza: p.id, modo: 'lineal', desde: p.valor - 1, hasta: p.valor + 1, puntos: 5 }
}

/** Un análisis nuevo de una ficha, con un id que da quien guarda. */
export function analisisNuevo(tipo: TipoFicha, ctx: Pick<ContextoAnalisis, 'fuentes' | 'barribles'>, id: Id, existentes: readonly AnalisisDoc[]): Nuevo {
  const nombre = nombreNuevo(tipo, existentes)
  const base = tipo === 'param' ? 'op' : tipo
  const config = configInicial(base, ctx)
  if ('error' in config) return { ok: false, error: config.error }
  let parametro: ParametroBarrido | undefined
  if (tipo === 'param') {
    if (ctx.barribles.length === 0) return { ok: false, error: SIN_BARRIBLE }
    parametro = parametroInicial(ctx.barribles[0])
  }
  const r = validarAnalisis({ id, nombre, config, ...(parametro ? { parametro } : {}) })
  return r.ok ? { ok: true, analisis: r.valor } : { ok: false, error: r.error }
}

/** Cambia el análisis base de un barrido de parámetro (conserva el parámetro y el nombre). */
export function conBase(a: AnalisisDoc, tipo: TipoAnalisis, ctx: Pick<ContextoAnalisis, 'fuentes'>): { ok: true; analisis: AnalisisDoc } | { ok: false; error: string } {
  const config = configInicial(tipo, ctx)
  if ('error' in config) return { ok: false, error: config.error }
  return { ok: true, analisis: { ...a, config } }
}

/** El mensaje que explica por qué un borrador no se puede guardar, o null si es válido. */
export function errorDeBorrador(a: AnalisisDoc): string | null {
  const r = validarAnalisis(a)
  return r.ok ? null : r.error
}

export interface Reconciliado {
  analisis: AnalisisDoc
  /** Lo que se cambió solo, una frase por cambio (para el Registro). */
  cambios: string[]
  /** Lo que sigue sin pieza y no hay con qué reemplazar, para mostrarlo en la ficha junto a su selector. */
  pendientes: string[]
}

/** Si el análisis nombra una pieza que ya no está en el documento (no hace falta compilar nada para saberlo). */
export function nombraPiezaAusente(a: AnalisisDoc, piezas: Readonly<Record<Id, unknown>>): boolean {
  const c = a.config
  const ids: Id[] = c.tipo === 'ac' ? [c.fuente] : c.tipo === 'dc' ? [c.fuente, ...(c.segunda ? [c.segunda.fuente] : [])] : []
  if (a.parametro) ids.push(a.parametro.pieza)
  return ids.some((id) => !Object.hasOwn(piezas, id))
}

/** Pone al día un análisis guardado: lo que ya no existe se cambia por la fuente de omisión o queda en `pendientes`.
 * Los textos nombran las piezas por referencia, nunca por id interno. */
export function reconciliarAnalisis(a: AnalisisDoc, ctx: Pick<ContextoAnalisis, 'fuentes' | 'barribles'>): Reconciliado {
  const cambios: string[] = []
  const pendientes: string[] = []
  let analisis = a
  const hayFuente = (id: Id) => ctx.fuentes.some((f) => f.id === id)
  const c = a.config
  if (c.tipo === 'ac' && !hayFuente(c.fuente)) {
    const f = fuenteDeEntrada(ctx.fuentes, 'ac')
    if (f) {
      analisis = { ...analisis, config: { ...c, fuente: f.id } }
      cambios.push(`${a.nombre}: la entrada de CA ya no estaba en el circuito y ahora es ${f.ref}.`)
    } else pendientes.push(ctx.fuentes.length === 0 ? 'La entrada de CA ya no está en el circuito y no hay una fuente de voltaje que la reemplace.' : 'La entrada de CA ya no está en el circuito y solo quedan terminales de alimentación: agrega un generador o una fuente de señal.')
  }
  if (c.tipo === 'dc') {
    let cd = c
    if (!hayFuente(cd.fuente)) {
      const f = fuenteDeEntrada(ctx.fuentes, 'dc')
      if (f) {
        cd = { ...cd, fuente: f.id }
        cambios.push(`${a.nombre}: la fuente que se barre ya no estaba en el circuito y ahora es ${f.ref}.`)
      } else pendientes.push('La fuente que se barre ya no está en el circuito y no hay otra que la reemplace.')
    }
    if (cd.segunda && !hayFuente(cd.segunda.fuente)) {
      const f = fuenteDeEntrada(ctx.fuentes.filter((x) => x.id !== cd.fuente), 'dc')
      if (f) {
        cd = { ...cd, segunda: { ...cd.segunda, fuente: f.id } }
        cambios.push(`${a.nombre}: la segunda fuente ya no estaba en el circuito y ahora es ${f.ref}.`)
      } else {
        const { segunda: _quitada, ...resto } = cd
        cd = resto
        cambios.push(`${a.nombre}: la segunda fuente ya no estaba en el circuito y se quitó.`)
      }
    }
    if (cd !== c) analisis = { ...analisis, config: cd }
  }
  if (a.parametro && !ctx.barribles.some((b) => b.id === a.parametro!.pieza)) {
    const b = ctx.barribles[0]
    if (b) {
      analisis = { ...analisis, parametro: parametroInicial(b) }
      cambios.push(`${a.nombre}: la pieza que se barre ya no estaba en el circuito y ahora es ${b.ref}.`)
    } else pendientes.push('La pieza que se barre ya no está en el circuito y no hay una resistencia, un capacitor, un inductor ni una fuente de CD que la reemplace.')
  }
  return { analisis, cambios, pendientes }
}

/** Cancelar con la ficha en reposo borra el análisis solo si se creó desde la ficha y nunca se ejecutó. */
export function seDescartaAlCancelar(id: Id, creadosSinEjecutar: ReadonlySet<Id>, corridas: readonly { analisisId: Id }[]): boolean {
  return creadosSinEjecutar.has(id) && !corridas.some((c) => c.analisisId === id)
}
