/** Cables de una importación: cada red se une en árbol con el enrutador del editor; lo que no tiene ruta válida se nombra
 * con etiquetas, y la tierra lleva su propia pieza. */
import type { GeneradorId } from '../doc/ids'
import type { Cable, Documento, Etiqueta, Pieza, Punto } from '../doc/tipos'
import { colisiona, cuerpoEnMundo } from '../editor/colision'
import { cableEnCuerpo, piezaCruzada } from '../editor/conflictos'
import { enrutar, rutaLibre } from '../editor/enrutar'
import { pinesEnMundo } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'

export interface RedParaCablear {
  /** Nombre con que se etiqueta si hace falta; único entre las redes. */
  nombre: string
  tierra: boolean
  pines: { pieza: Pieza; pin: string }[]
}

export interface ResultadoCables {
  cables: Cable[]
  etiquetas: Etiqueta[]
  /** Piezas de tierra añadidas (ya están en el documento de trabajo). */
  tierras: Pieza[]
  /** Redes que quedaron con etiquetas, con las piezas cuyos pines se etiquetaron. */
  conEtiqueta: { nombre: string; piezas: string[] }[]
  avisos: string[]
}

/** Pines seguidos de una red sin ruta antes de dejar de buscar para los que faltan. */
const FALLOS_SEGUIDOS = 3
/** Tiempo para trazar cables: las redes que falten al agotarse se nombran con etiquetas (esquemas de cientos de piezas). */
const PRESUPUESTO_MS = 20000
const distancia = (a: Punto, b: Punto): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
const clave = (p: Punto): string => `${p.x},${p.y}`

/** Cuánto mide el árbol más corto aproximado de la red: sirve para cablear primero las redes chicas. */
function extension(puntos: Punto[]): number {
  if (puntos.length < 2) return 0
  const xs = puntos.map((p) => p.x), ys = puntos.map((p) => p.y)
  return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)
}

/** `doc` trae las piezas ya colocadas y se completa con cada cable, etiqueta y tierra que se añade. */
export function cablear(doc: Documento, lib: Map<string, PiezaDef>, redes: RedParaCablear[], gen: GeneradorId, nuevaTierra: () => Pieza, presupuestoMs = PRESUPUESTO_MS): ResultadoCables {
  const res: ResultadoCables = { cables: [], etiquetas: [], tierras: [], conEtiqueta: [], avisos: [] }

  const posiciones = (r: RedParaCablear): { pieza: Pieza; pin: string; p: Punto }[] => {
    const salida: { pieza: Pieza; pin: string; p: Punto }[] = []
    for (const { pieza, pin } of r.pines) {
      const def = lib.get(pieza.tipo)
      const q = def ? pinesEnMundo(pieza, def).find((x) => x.id === pin) : undefined
      if (q) salida.push({ pieza, pin, p: { x: q.x, y: q.y } })
    }
    return salida
  }

  const poner = (ruta: Punto[]): void => {
    const c: Cable = { id: gen('c'), puntos: ruta }
    doc.cables[c.id] = c
    res.cables.push(c)
  }

  /** Une `desde` con `hasta` si hay una ruta válida; devuelve la ruta puesta. */
  const unir = (desde: Punto, hasta: Punto): Punto[] | null => {
    const ruta = enrutar(doc, lib, desde, hasta)
    if (ruta.length < 2 || !rutaLibre(doc, lib, ruta)) return null
    poner(ruta)
    return ruta
  }

  /** Los pines de todas las piezas: una tierra nueva no puede tapar el pin de otra red. */
  const pinesDelDoc = Object.values(doc.piezas).flatMap((pz) => {
    const def = lib.get(pz.tipo)
    return def ? pinesEnMundo(pz, def).map((q) => ({ x: q.x, y: q.y })) : []
  })

  /** Un punto sobre un cable (en su interior o en un extremo): ahí un pin nuevo quedaría unido a esa red. */
  const sobreCable = (q: Punto): boolean =>
    Object.values(doc.cables).some((c) =>
      c.puntos.some((a, i) => {
        const b = c.puntos[i + 1]
        return b !== undefined && q.x >= Math.min(a.x, b.x) && q.x <= Math.max(a.x, b.x) && q.y >= Math.min(a.y, b.y) && q.y <= Math.max(a.y, b.y)
      })
    )

  /** Una pieza de tierra cerca del pin, unida con un cable corto. */
  const tierraEn = (p: Punto, otros: Punto[], nombre: string): boolean => {
    for (const largo of [4, 6, 8, 12, 16, 24])
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
        const q = { x: p.x + dx * largo, y: p.y + dy * largo }
        const candidata: Pieza = { id: '\0tierra', tipo: 'tierra', ref: '', x: q.x, y: q.y, rot: 0, espejo: false, props: {} }
        if (colisiona(doc, lib, candidata) || cableEnCuerpo(doc, lib, candidata) || sobreCable(q)) continue
        const cuerpo = cuerpoEnMundo(candidata, lib.get('tierra'), 1)
        if (pinesDelDoc.some((o) => (o.x !== p.x || o.y !== p.y) && o.x >= cuerpo.minX && o.x <= cuerpo.maxX && o.y >= cuerpo.minY && o.y <= cuerpo.maxY)) continue
        const ruta = enrutar(doc, lib, p, q)
        if (ruta.length < 2 || !rutaLibre(doc, lib, ruta)) continue
        // El cable no puede llegar a la tierra atravesando su propio símbolo (que cuelga bajo el pin).
        doc.piezas[candidata.id] = candidata
        const cruza = piezaCruzada(doc, lib, ruta) !== null
        delete doc.piezas[candidata.id]
        if (cruza) continue
        const t = { ...nuevaTierra(), x: q.x, y: q.y }
        doc.piezas[t.id] = t
        res.tierras.push(t)
        pinesDelDoc.push({ x: q.x, y: q.y })
        poner(ruta)
        return true
      }
    // Sin lugar para otra tierra: se une a una ya puesta o a otro pin de la red, que es la misma.
    const cercanas = [...res.tierras.map((c) => ({ x: c.x, y: c.y })), ...otros.filter((o) => clave(o) !== clave(p))].sort((a, b) => distancia(a, p) - distancia(b, p)).slice(0, 8)
    for (const c of cercanas) if (unir(p, c)) return true
    // Pin encerrado (filas de pines juntos): una tierra libre más lejos y una etiqueta en cada punto las une por nombre.
    for (let r = 6; r <= 40; r += 2) {
      const anillo: Punto[] = []
      for (let dx = -r; dx <= r; dx += 2) for (let dy = -r; dy <= r; dy += 2) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) anillo.push({ x: p.x + dx, y: p.y + dy })
      anillo.sort((a, b) => distancia(a, p) - distancia(b, p))
      for (const q of anillo) {
        const candidata: Pieza = { id: '\0tierra', tipo: 'tierra', ref: '', x: q.x, y: q.y, rot: 0, espejo: false, props: {} }
        if (colisiona(doc, lib, candidata) || cableEnCuerpo(doc, lib, candidata) || sobreCable(q)) continue
        const cuerpo = cuerpoEnMundo(candidata, lib.get('tierra'), 1)
        if (pinesDelDoc.some((o) => o.x >= cuerpo.minX && o.x <= cuerpo.maxX && o.y >= cuerpo.minY && o.y <= cuerpo.maxY)) continue
        const t = { ...nuevaTierra(), x: q.x, y: q.y }
        doc.piezas[t.id] = t
        res.tierras.push(t)
        pinesDelDoc.push({ x: q.x, y: q.y })
        etiquetar(nombre, q)
        etiquetar(nombre, p)
        res.conEtiqueta.push({ nombre, piezas: [t.id] })
        return true
      }
    }
    return false
  }

  const etiquetar = (nombre: string, p: Punto): void => {
    const e: Etiqueta = { id: gen('e'), nombre, x: p.x, y: p.y, rot: 0 }
    doc.etiquetas[e.id] = e
    res.etiquetas.push(e)
  }

  const lista = redes.map((r) => ({ r, pos: posiciones(r) })).filter((x) => x.pos.length > 0)
  lista.sort((a, b) => Number(a.r.tierra) - Number(b.r.tierra) || extension(a.pos.map((x) => x.p)) - extension(b.pos.map((x) => x.p)))

  const inicio = performance.now()
  let sinTiempo = 0
  for (const { r, pos } of lista) {
    const esTierraPieza = (x: { pieza: Pieza }): boolean => lib.get(x.pieza.tipo)?.modelo?.tipo === 'tierra'
    const unicos: typeof pos = []
    const vistos = new Set<string>()
    for (const x of pos) if (!vistos.has(clave(x.p))) (vistos.add(clave(x.p)), unicos.push(x))

    // Una red de tierra sin pieza de tierra: cada pin lleva la suya.
    if (r.tierra && !pos.some(esTierraPieza)) {
      for (const x of unicos) if (!tierraEn(x.p, unicos.map((u) => u.p), r.nombre)) res.avisos.push(`No hubo lugar para una tierra junto a ${x.pieza.ref}.${x.pin}.`)
      continue
    }
    if (unicos.length < 2) continue

    const conectados: Punto[] = [unicos[0]!.p]
    const pendientes = unicos.slice(1)
    const sueltos: typeof unicos = []
    if (!r.tierra && performance.now() - inicio > presupuestoMs) {
      sinTiempo++
      sueltos.push(...pendientes.splice(0))
    }
    let contada = sueltos.length > 0
    let fallos = 0
    while (pendientes.length) {
      // Tras varios pines seguidos sin ruta el resto casi seguro tampoco la tiene: se nombran y no se sigue buscando.
      if (fallos >= FALLOS_SEGUIDOS) {
        sueltos.push(...pendientes.splice(0))
        break
      }
      // El presupuesto también corre dentro de una red grande: lo que falta se nombra con etiquetas.
      if (!r.tierra && performance.now() - inicio > presupuestoMs) {
        if (!contada) sinTiempo++
        sueltos.push(...pendientes.splice(0))
        break
      }
      // El par (pendiente, punto conectado) más cercano.
      let mejor = { i: 0, d: Infinity }
      pendientes.forEach((x, i) => {
        let d = Infinity
        for (const c of conectados) d = Math.min(d, distancia(c, x.p))
        if (d < mejor.d) mejor = { i, d }
      })
      const [x] = pendientes.splice(mejor.i, 1)
      const cercanos = [...conectados].sort((a, b) => distancia(a, x!.p) - distancia(b, x!.p)).slice(0, 3)
      let ruta: Punto[] | null = null
      for (const c of cercanos) {
        ruta = unir(c, x!.p)
        if (ruta) break
      }
      if (ruta) (conectados.push(...ruta), (fallos = 0))
      else (sueltos.push(x!), fallos++)
    }
    if (!sueltos.length) continue

    if (r.tierra) {
      for (const x of sueltos) if (!tierraEn(x.p, unicos.map((u) => u.p), r.nombre)) res.avisos.push(`No hubo lugar para una tierra junto a ${x.pieza.ref}.${x.pin}.`)
      continue
    }
    // Sin ruta: el grupo ya unido y cada pin suelto llevan el mismo nombre.
    etiquetar(r.nombre, unicos[0]!.p)
    for (const x of sueltos) etiquetar(r.nombre, x.p)
    const piezas = [unicos[0]!, ...sueltos].map((x) => x.pieza.id)
    res.conEtiqueta.push({ nombre: r.nombre, piezas: [...new Set(piezas)] })
  }
  if (sinTiempo) res.avisos.push(`Por el tamaño del esquema, ${sinTiempo} ${sinTiempo === 1 ? 'red se nombró' : 'redes se nombraron'} con etiquetas sin trazar sus cables.`)
  return res
}
