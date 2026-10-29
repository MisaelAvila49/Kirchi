import { crear, borrar, juntar, modificar, type Comando } from '../../doc/comandos'
import { refDe, siguienteUnidad } from '../../doc/paquetes'
import type { Cable, Id, Punto } from '../../doc/tipos'
import { colisiona, lugarLibre } from '../../editor/colision'
import { borrarSeleccion } from '../../editor/acciones'
import { cambiarProp, nuevaPieza } from '../../editor/colocar'
import { enrutar, rutaLibre } from '../../editor/enrutar'
import { limpiarPolilinea } from '../../editor/rutas'
import { seleccionDe } from '../../editor/seleccion'
import { emparejarPines } from '../../importar/pines'
import { ID_SIN_EQUIVALENCIA, pinesDe } from '../../piezas/sinEquivalencia'
import { pinesEnMundo } from '../../piezas/transformar'
import { rechazo, type Estado, type Plan, type Rechazo } from '../plan'

const mismoPunto = (a: Punto, b: Punto): boolean => a.x === b.x && a.y === b.y
const letras = (ref: string): string => /^[A-Za-z]+/.exec(ref)?.[0].toUpperCase() ?? ''

/** El cable con sus extremos sobre un pin viejo llevados al pin nuevo; el tramo pegado al extremo se rehace con el
 * enrutador para que siga ortogonal y fuera de los cuerpos. Null si el cable no toca ningún pin viejo. */
function conExtremosNuevos(est: Estado, doc: Estado['doc'], c: Cable, destino: (p: Punto) => Punto | undefined | null): Cable | null {
  let pts = c.puntos
  let cambio = false
  const ignorarCables = new Set([c.id])
  const inicio = pts.length >= 2 ? destino(pts[0]) : undefined
  if (inicio) {
    pts = [...enrutar(doc, est.lib, inicio, pts[1], { ignorarCables }), ...pts.slice(2)]
    cambio = true
  }
  const fin = pts.length >= 2 ? destino(pts[pts.length - 1]) : undefined
  if (fin) {
    pts = [...pts.slice(0, -2), ...enrutar(doc, est.lib, pts[pts.length - 2], fin, { ignorarCables })]
    cambio = true
  }
  return cambio ? { ...c, puntos: limpiarPolilinea(pts) } : null
}

/** Cambia una pieza por otra de la librería en el mismo lugar: la nueva toma la posición, el giro y la referencia (si el
 * prefijo coincide), los pines se emparejan por nombre, luego por número y por orden, y los cables que tocaban la vieja pasan
 * a la nueva. Todo en un solo cambio. Los pines sin pareja se dicen en `avisos`: quien llama decide si los confirma. */
export function reemplazarPieza(est: Estado, id: Id, tipoNuevo: string, props: Record<string, string> = {}): Plan | Rechazo {
  const { doc, lib } = est
  const vieja = Object.hasOwn(doc.piezas, id) ? doc.piezas[id] : undefined
  if (!vieja) return rechazo('La pieza que se iba a reemplazar ya no está.')
  const defVieja = lib.get(vieja.tipo)
  const defNueva = lib.get(tipoNuevo)
  if (!defVieja) return rechazo(`${vieja.ref} es de un tipo que esta librería no tiene.`)
  if (!defNueva) return rechazo(`No existe el tipo de pieza «${tipoNuevo}».`)
  if (tipoNuevo === ID_SIN_EQUIVALENCIA) return rechazo('Elige una pieza de Kirchi con equivalencia.')
  const verbo = `No se reemplazó ${vieja.ref}`

  const { [id]: _quitada, ...resto } = doc.piezas
  const sin = { ...doc, piezas: resto }
  let nueva = nuevaPieza(sin, defNueva, { x: vieja.x, y: vieja.y }, vieja.rot, vieja.espejo, est.gen)
  for (const [k, v] of Object.entries(props)) {
    const r = cambiarProp(nueva, defNueva, k, v)
    if ('error' in r) return rechazo(`${verbo}: ${r.error}`)
    nueva = r.pieza
  }
  if (letras(vieja.ref) === defNueva.prefijo.toUpperCase()) nueva = { ...nueva, ref: vieja.ref }
  const unidad = siguienteUnidad(sin, lib, defNueva.id, nueva.props)
  if (unidad) nueva = { ...nueva, ref: refDe(unidad.paquete, unidad.unidad), props: { ...nueva.props, paquete: unidad.paquete, unidad: unidad.unidad } }

  // Los cuerpos no se enciman: si el lugar de la vieja no basta para la nueva, se busca el más cercano.
  if (colisiona(sin, lib, nueva)) {
    const lugar = lugarLibre(sin, lib, [{ ...nueva, x: 0, y: 0 }], { x: nueva.x, y: nueva.y })
    if (!lugar.libre) return rechazo(`${verbo}: no hay lugar libre para ${defNueva.nombre.es}.`)
    nueva = { ...nueva, x: lugar.en.x, y: lugar.en.y }
  }

  // Pines: nombre, número y orden, sin repetir ninguno de la pieza nueva.
  const pinesViejos = pinesDe(vieja, defVieja)
  const propios = vieja.pines
  const ajena = { ref: vieja.ref, tipo: vieja.tipo, props: {}, pines: pinesViejos.map((p) => ({ nombre: p.nombre, ...(propios?.find((q) => q.id === p.id)?.numero !== undefined ? { numero: propios.find((q) => q.id === p.id)!.numero } : {}) })) }
  const e = emparejarPines(ajena, defNueva, nueva.props)
  const par = new Map<string, string>()
  const usados = new Set<string>()
  ajena.pines.forEach((q, i) => {
    const nuevo = (q.numero !== undefined ? e.pares.get(q.numero) : undefined) ?? (q.nombre ? e.pares.get(q.nombre) : undefined)
    if (nuevo && !usados.has(nuevo)) {
      usados.add(nuevo)
      par.set(pinesViejos[i].id, nuevo)
    }
  })
  const enViejo = new Map(pinesEnMundo(vieja, defVieja).map((p) => [p.id, { x: p.x, y: p.y }]))
  const enNuevo = new Map(pinesEnMundo(nueva, defNueva).map((p) => [p.id, { x: p.x, y: p.y }]))
  const destinoDe = (p: Punto): Punto | null => {
    for (const [idViejo, q] of enViejo) if (mismoPunto(p, q)) return enNuevo.get(par.get(idViejo) ?? '') ?? null
    return null
  }
  const sinPareja = pinesViejos.filter((p) => !par.has(p.id))
  const faltan = defNueva.pines.filter((p) => !usados.has(p.id))

  // Cables: los extremos sobre un pin viejo pasan al nuevo; los de un pin sin pareja quedan donde estaban, sueltos.
  const conNueva = { ...sin, piezas: { ...sin.piezas, [nueva.id]: nueva } }
  const cambios: Comando[] = []
  let sueltos = 0
  let quitados = 0
  for (const c of Object.values(doc.cables)) {
    const rehecho = conExtremosNuevos(est, conNueva, c, destinoDe)
    if (!rehecho) continue
    if (rehecho.puntos.length < 2) {
      cambios.push(borrar('reemplazar', 'cables', c))
      continue
    }
    // El enrutador devuelve su mejor intento aunque esté bloqueado: un cable que no queda libre no se rehace.
    const libre = (puntos: Punto[]): boolean => rutaLibre(conNueva, est.lib, puntos, { ignorarCables: new Set([c.id]) })
    if (libre(rehecho.puntos)) cambios.push(modificar('reemplazar', 'cables', c, rehecho))
    else if (libre(c.puntos)) sueltos++
    else (cambios.push(borrar('reemplazar', 'cables', c)), quitados++)
  }

  const cmd: Comando = juntar('reemplazar', [crear('reemplazar', 'piezas', nueva), ...cambios, borrarSeleccion(doc, seleccionDe('piezas', id))])
  const nombreViejo = vieja.props.nombre ?? defVieja.nombre.es
  const avisos: string[] = []
  if (sinPareja.length > 0 || faltan.length > 0) {
    avisos.push(`${nombreViejo} tenía ${pinesViejos.length} ${pinesViejos.length === 1 ? 'pin' : 'pines'} y ${defNueva.nombre.es} tiene ${defNueva.pines.length}.`)
    if (sinPareja.length > 0) avisos.push(`Se desconectan: ${sinPareja.map((p) => propios?.find((q) => q.id === p.id)?.numero ?? p.nombre).join(', ')}.`)
    if (faltan.length > 0) avisos.push(`Quedan sin cable en la pieza nueva: ${faltan.map((p) => p.nombre).join(', ')}.`)
  }
  if (sueltos + quitados > 0) {
    const n = sueltos + quitados
    avisos.push(`${n} ${n === 1 ? 'cable no pudo' : 'cables no pudieron'} llegar al pin nuevo sin cruzar una pieza${quitados > 0 ? ` (${quitados} se ${quitados === 1 ? 'quitó' : 'quitaron'})` : ''}: ${n === 1 ? 'conéctalo' : 'conéctalos'} a mano.`)
  }
  return { cmd, creados: { [nueva.ref]: nueva.id }, avisos, verbo }
}
