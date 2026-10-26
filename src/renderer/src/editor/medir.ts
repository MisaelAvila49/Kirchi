import { anclaDeSonda, enTramo } from '../conexiones/anclas'
import { clavePin, type Conexiones } from '../conexiones/conexiones'
import { borrar, crear, juntar, modificar, type Comando } from '../doc/comandos'
import type { GeneradorId } from '../doc/ids'
import { siguienteReferenciaMedidor } from '../doc/referencias'
import { sondaDeEntrada, sondasDe } from '../doc/sondas'
import type { Documento, Id, Pieza, Punto, Sonda } from '../doc/tipos'
import type { Canal } from '../instrumentos/ajustes'
import { valores } from '../lienzo/apartar'
import { cajaEnMundo, pinesEnMundo } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'
import { nuevaPieza } from './colocar'
import { destinoDeSonda, pantallaLibre } from './sondas'

/** Lo que pide el clic derecho de un cable o etiqueta: entrada de osciloscopio (nombrado, primero o nuevo), terminal de
 * multímetro o sonda de voltaje o corriente. Todo pone sondas, no etiquetas. */
export type PedidoMedir =
  | { con: 'osciloscopio'; osc?: Id; canal: Canal }
  | { con: 'multimetro'; mm: Id; terminal: '+' | 'COM' }
  | { con: 'multimetro-nuevo'; modo?: string }
  /** El medidor rápido: voltaje DC con su pantalla en un lugar libre. */
  | { con: 'medidor' }
  | { con: 'voltaje' }
  | { con: 'corriente' }

/** Separación (unidades de rejilla fina) entre el dibujo y el instrumento que se coloca a su derecha. */
export const SEPARACION_INSTRUMENTO = 16
const paso = (v: number) => Math.round(v / 2) * 2

export const ERROR_CRUCE = 'Ahí se cruzan dos cables: haz clic en otro punto del cable.'

/** Un lugar a la derecha del dibujo, a media altura, en la rejilla. */
function lugarLibre(doc: Documento, lib: Map<string, PiezaDef>): Punto {
  let [maxX, minY, maxY] = [0, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
  for (const p of valores(doc.piezas)) {
    const def = lib.get(p.tipo)
    if (!def) continue
    const c = cajaEnMundo(p, def)
    maxX = Math.max(maxX, c.maxX)
    minY = Math.min(minY, c.minY)
    maxY = Math.max(maxY, c.maxY)
  }
  return { x: paso(maxX + SEPARACION_INSTRUMENTO), y: Number.isFinite(minY) ? paso((minY + maxY) / 2) : 0 }
}

/** La red de la entrada `pin` del instrumento, sin contar su sonda: tiene algo más que el propio pin (un cable, otro pin, una etiqueta). */
export function entradaCableada(con: Conexiones, p: Pieza, pin: string, sonda: Sonda | undefined): boolean {
  const r = con.redDePin.get(clavePin(p.id, pin))
  const red = r === undefined ? undefined : con.redes[r]
  if (!red) return false
  // Con su sonda unida, la red es la del punto medido: eso no cuenta como cable a la entrada.
  if (sonda && con.redDeSonda.get(sonda.id) === r && !con.sondasSinUnir.includes(sonda.id)) return false
  return red.pines.length > 1 || red.cables.length > 0 || red.nombre !== undefined
}

/** Sonda nueva; si la entrada ya tenía una, se quita y la nueva ocupa su lugar en el mismo paso. Se borra y crea (no se
 * modifica) porque `mantenerSondas` devolvería la nueva a su cable viejo. */
function ponerSonda(nombre: string, antes: Sonda | undefined, nueva: Sonda): Comando[] {
  return antes ? [borrar(nombre, 'sondas', antes), crear(nombre, 'sondas', nueva)] : [crear(nombre, 'sondas', nueva)]
}

/** Comando de un paso que mide la red `red` en el punto `en` (cable con su id en `cable`, o ancla de etiqueta), y la sonda
 * resultante; o por qué no se puede. */
export function comandoMedir(
  doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, red: number, en: Punto, pedido: PedidoMedir, gen: GeneradorId, cable?: Id
): { cmd: Comando; sonda: Id; instrumento?: Id } | { error: string } {
  const r = con.redes[red]
  if (!r) return { error: 'Eso no está en una red.' }
  // En un cruce sin unión con otra red la sonda no sabría qué medir.
  const a = anclaDeSonda(doc, lib, en.x, en.y)
  const redDelPunto = !a ? undefined : a.tipo === 'pin' ? con.redDePin.get(a.clave) : a.tipo === 'etiqueta' ? con.redDeEtiqueta.get(a.id) : con.redDeCable.get(a.id)
  if (redDelPunto !== red) return { error: ERROR_CRUCE }

  if (pedido.con === 'voltaje') {
    if (Object.values(sondasDe(doc)).some((s) => s.tipo === 'voltaje' && s.x === en.x && s.y === en.y)) return { error: 'Ya hay una sonda de voltaje en ese punto.' }
    const s: Sonda = { id: gen('s'), tipo: 'voltaje', x: en.x, y: en.y }
    return { cmd: crear('sonda de voltaje', 'sondas', s), sonda: s.id }
  }
  if (pedido.con === 'corriente') {
    const c = cable && Object.hasOwn(doc.cables, cable) ? doc.cables[cable] : undefined
    const tramo = c ? c.puntos.findIndex((q, i) => i > 0 && enTramo(c.puntos[i - 1], q, en.x, en.y)) - 1 : -2
    const base: Sonda = { id: gen('s'), tipo: 'corriente', x: en.x, y: en.y, sentido: 'derecha' }
    const d = destinoDeSonda(doc, lib, base, c && tramo >= 0 ? { tipo: 'cable', id: c.id, tramo, x: en.x, y: en.y } : null, en)
    if (!d.valida) return { error: d.motivo ?? 'La sonda de corriente va en un cable.' }
    const s: Sonda = { ...base, sentido: d.sentido ?? 'derecha' }
    return { cmd: crear('sonda de corriente', 'sondas', s), sonda: s.id }
  }

  if (pedido.con === 'medidor') {
    const s: Sonda = { id: gen('s'), tipo: 'medidor', x: en.x, y: en.y, magnitud: 'voltaje', modo: 'dc', pantalla: pantallaLibre(doc, lib, en, 'dc'), ref: siguienteReferenciaMedidor(doc) }
    return { cmd: crear('medidor rápido', 'sondas', s), sonda: s.id }
  }

  if (pedido.con === 'multimetro-nuevo') {
    if (r.tierra) return { error: 'Esa red es la tierra: el multímetro mediría 0 V.' }
    const def = lib.get('multimetro')
    const defT = lib.get('tierra')
    if (!def || !defT) return { error: 'La librería no trae el multímetro.' }
    const nombre = 'medir con el multímetro'
    const mm0 = nuevaPieza(doc, def, lugarLibre(doc, lib), 0, false, gen)
    const mm = pedido.modo ? { ...mm0, props: { ...mm0.props, modo: pedido.modo } } : mm0
    const pines = new Map(pinesEnMundo(mm, def).map((q) => [q.id, q]))
    const s: Sonda = { id: gen('s'), tipo: 'multimetro', x: en.x, y: en.y, instrumento: mm.id, entrada: '+' }
    // COM a una tierra puesta con su pin sobre el de COM.
    const com = pines.get('COM')!
    const pinT = defT.pines[0]
    const tierra = nuevaPieza({ ...doc, piezas: { ...doc.piezas, [mm.id]: mm } }, defT, { x: com.x - pinT.x, y: com.y - pinT.y }, 0, false, gen)
    return { cmd: juntar(nombre, [crear(nombre, 'piezas', mm), crear(nombre, 'piezas', tierra), crear(nombre, 'sondas', s)]), sonda: s.id, instrumento: mm.id }
  }

  if (pedido.con === 'multimetro') {
    const mm = Object.hasOwn(doc.piezas, pedido.mm) ? doc.piezas[pedido.mm] : undefined
    if (!mm || lib.get(mm.tipo)?.modelo?.tipo !== 'multimetro') return { error: 'Ese multímetro ya no está en el circuito.' }
    const antes = sondaDeEntrada(doc, mm.id, pedido.terminal)
    if (antes && con.redDeSonda.get(antes.id) === red) return { error: `La terminal ${pedido.terminal} de ${mm.ref} ya mide esa red.` }
    if (entradaCableada(con, mm, pedido.terminal, antes)) return { error: `La terminal ${pedido.terminal} de ${mm.ref} ya está conectada: elige otra terminal.` }
    const s: Sonda = { id: gen('s'), tipo: 'multimetro', x: en.x, y: en.y, instrumento: mm.id, entrada: pedido.terminal }
    return { cmd: juntar('medir con el multímetro', ponerSonda('medir con el multímetro', antes, s)), sonda: s.id, instrumento: mm.id }
  }

  // Osciloscopio: el pedido, el primero por referencia o uno nuevo a la derecha del dibujo.
  const nombre = 'medir con el osciloscopio'
  const def = lib.get('osciloscopio')
  if (!def) return { error: 'La librería no trae el osciloscopio.' }
  const existentes = valores(doc.piezas)
    .filter((p) => lib.get(p.tipo)?.modelo?.tipo === 'osciloscopio')
    .sort((x, y) => x.ref.localeCompare(y.ref, 'es', { numeric: true }))
  const pedidoOsc = pedido.osc !== undefined && Object.hasOwn(doc.piezas, pedido.osc) ? doc.piezas[pedido.osc] : undefined
  if (pedido.osc !== undefined && !pedidoOsc) return { error: 'Ese osciloscopio ya no está en el circuito.' }
  const cmds: Comando[] = []
  let osc = pedidoOsc ?? existentes[0]
  const nuevo = !osc
  if (!osc) {
    osc = nuevaPieza(doc, def, lugarLibre(doc, lib), 0, false, gen)
    cmds.push(crear(nombre, 'piezas', osc))
  }
  const canal = pedido.canal
  const antes = nuevo ? undefined : sondaDeEntrada(doc, osc.id, canal)
  if (antes && con.redDeSonda.get(antes.id) === red) return { error: `La entrada ${canal} de ${osc.ref} ya mide esa red.` }
  if (!nuevo && entradaCableada(con, osc, canal, antes)) return { error: `La entrada ${canal} de ${osc.ref} ya está conectada con un cable: elige otra entrada.` }
  const on = `${canal.toLowerCase()}_on`
  if (!nuevo && osc.props[on] !== 'encendido') cmds.push(modificar(nombre, 'piezas', osc, { ...osc, props: { ...osc.props, [on]: 'encendido' } }))
  const s: Sonda = { id: gen('s'), tipo: 'osciloscopio', x: en.x, y: en.y, instrumento: osc.id, entrada: canal }
  cmds.push(...ponerSonda(nombre, antes, s))
  return { cmd: juntar(nombre, cmds), sonda: s.id, instrumento: osc.id }
}
