import { clavePin, porId, type Conexiones } from './conexiones'
import { UnionFind } from './unionFind'
import { instrumentoDe, nombreDeSonda } from '../doc/sondas'
import type { Documento, Id, Pieza } from '../doc/tipos'
import { esOptoacoplador, PISTA_OPTOACOPLADOR } from '../netlist/fuentesPrevias'
import { anotarFuente, diodosDirectos, esTransformador, gruposDelModelo, leerPropiedad, numericasDelModelo, PISTA_TRANSFORMADOR, pinesQueDebenConectarse, terminalesDeAlimentacion, terminalesDelModelo, type PiezasDeFuentes } from '../netlist/netlist'
import { entradasAlAire, entradasTrasContactos, esModeloDigital, familiaDe, hayLogica, salidasATierra, salidasUnidas, textoEntradasTrasContactos } from '../netlist/digital'
import { avisosDeLosMultimetros } from '../netlist/multimetros'
import { avisosAbsolutosEstaticos } from '../sim/absolutos'
import type { PiezaDef } from '../piezas/tipos'
import { ordenRef } from './listaDeRedes'
import { aplicarUniones, unirCompartidas } from '../netlist/paquetes'

/** Algo que impediría simular; `piezas` son las que menciona, para seleccionarlas y centrarlas. */
export interface Aviso {
  texto: string
  piezas: Id[]
  /** No impide simular: una entrada CMOS al aire, una familia que no existe y se simula con la de omisión. */
  leve?: boolean
}


/** «a», «a y b», «a, b y c». */
export function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes.join('')
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/** Referencias que un aviso lista antes de resumir el resto como «y N más». */
export const REFS_EN_AVISO = 3

/**
 * Referencias de una isla en orden natural, con tope: «R1, R2, R3 y 4,997 más». Con una más que el tope se listan todas. Elige las menores en un recorrido, sin ordenar toda la lista.
 */
export function referenciasCortas(refs: string[]): string {
  if (refs.length <= REFS_EN_AVISO + 1) return enumerar([...refs].sort(ordenRef))
  const menores: string[] = []
  for (const r of refs) {
    let i = menores.length
    while (i > 0 && ordenRef(menores[i - 1], r) > 0) i--
    if (i < REFS_EN_AVISO) {
      menores.splice(i, 0, r)
      if (menores.length > REFS_EN_AVISO) menores.pop()
    }
  }
  return `${menores.join(', ')} y ${(refs.length - REFS_EN_AVISO).toLocaleString('es-MX')} más`
}


/**
 * Lo que impediría simular, cada clase por su cuenta para que una no oculte a las otras (no pasa por `compilarNetlist`, que se detiene en el primer problema). Se calcula aparte de `vistaProyecto` y la ventana la memoiza por conexiones, solo mientras algo la muestra.
 */
export function avisosDelCircuito(doc: Documento, conDoc: Conexiones, lib: Map<string, PiezaDef>): Aviso[] {
  const piezas = Object.values(doc.piezas).sort(porId)
  if (piezas.length === 0) return []
  const avisos: Aviso[] = []
  // Las patillas compartidas de un encapsulado son una sola, como las ve la netlist.
  // Sin chips de varias unidades no hay nada que unir, y el caso común no paga el recorrido.
  const compartidas = piezas.some((p) => p.props.unidad) ? unirCompartidas(doc, lib, conDoc) : { errores: [], uniones: [] }
  avisos.push(...compartidas.errores)
  const con = aplicarUniones(conDoc, compartidas.uniones)
  // Un solo recorrido separa las piezas con modelo y anota las que importan al diagnóstico de fuentes.
  const fuentes: PiezasDeFuentes = { diodos: [], fuentes: [], terminales: [] }
  const modeladas: Pieza[] = []
  const multimetros: Pieza[] = []
  for (const p of piezas) {
    const m = lib.get(p.tipo)?.modelo
    if (!m) continue
    modeladas.push(p)
    if (m.tipo === 'multimetro') multimetros.push(p)
    anotarFuente(fuentes, p, m)
  }

  for (const p of piezas) if (!lib.get(p.tipo)?.modelo) avisos.push({ texto: `${p.ref} todavía no tiene modelo eléctrico.`, piezas: [p.id] })

  // Las piezas digitales: su familia y su alimentación (las mismas oraciones que la netlist).
  for (const p of modeladas) {
    const def = lib.get(p.tipo)!
    const m = def.modelo
    if (!esModeloDigital(m)) continue
    const f = familiaDe(p, def, m)
    if (!f.ok) avisos.push({ texto: f.error, piezas: [p.id] })
    else if (f.aviso) avisos.push({ texto: f.aviso, piezas: [p.id], leve: true })
  }

  // Las mismas oraciones que da el netlist al compilar: la primera propiedad que falla de cada pieza.
  for (const p of modeladas) {
    const def = lib.get(p.tipo)!
    for (const q of numericasDelModelo(def.modelo!)) {
      const r = leerPropiedad(p, def, q.prop, q.positiva)
      if (!r.ok) {
        avisos.push({ texto: r.error, piezas: [p.id] })
        break
      }
    }
  }

  // Un circuito solo digital no necesita tierra.
  const soloDigital = piezas.every((p) => esModeloDigital(lib.get(p.tipo)?.modelo))
  if (!soloDigital && !con.redes.some((r) => r.tierra)) avisos.push({ texto: 'Falta una tierra.', piezas: [] })

  for (const p of modeladas) {
    const def = lib.get(p.tipo)!
    const m = def.modelo!
    for (const id of pinesQueDebenConectarse(m)) {
      const red = con.redes[con.redDePin.get(clavePin(p.id, id)) ?? -1]
      if (red && red.pines.length === 1 && !red.tierra) avisos.push({ texto: `El pin ${def.pines.find((x) => x.id === id)?.nombre ?? id} de ${p.ref} no está conectado a nada.`, piezas: [p.id] })
    }
  }

  avisos.push(...terminalesDeAlimentacion(doc, lib, con, fuentes).conflictos, ...diodosDirectos(doc, lib, con, fuentes))
  // Los máximos de la hoja de datos que los voltajes fijos del circuito ya pasan (un amp-op con 50 V de alimentación).
  avisos.push(...avisosAbsolutosEstaticos(doc, lib, con, modeladas))
  // Sin piezas digitales ni 555 no se busca nada digital: los avisos de un circuito analógico no pagan por el motor.
  const logica = hayLogica(piezas, lib)
  if (logica) avisos.push(...salidasUnidas(doc, lib, con), ...salidasATierra(doc, lib, con))

  // Islas: piezas con modelo cuyas redes no llegan a la tierra a través de otras piezas.
  if (con.redes.some((r) => r.tierra)) {
    const uf = new UnionFind<number>()
    const tierra = -1
    for (const r of con.redes) if (r.tierra) uf.unir(r.id, tierra)
    const extremos: { p: Pieza; red: number }[] = []
    for (const p of modeladas) {
      const m = lib.get(p.tipo)!.modelo!
      const redes = terminalesDelModelo(m).map((id) => con.redDePin.get(clavePin(p.id, id)))
      if (redes.length === 0 || redes.some((r) => r === undefined)) continue
      // Un terminal de alimentación es una fuente contra tierra: su red llega a ella.
      if (m.tipo === 'alimentacion') {
        uf.unir(redes[0]!, tierra)
        continue
      }
      // Los pines unidos por dentro de la pieza (un amplificador no une sus entradas con sus alimentaciones).
      for (const g of gruposDelModelo(m)) {
        // Sin arreglos nuevos por pieza: con 5,000 resistencias cada uno cuesta cerca de 1 ms por recorrido.
        const r0 = redes[g.pines[0]]!
        for (const k of g.pines) uf.unir(r0, redes[k]!)
        if (g.tierra) uf.unir(r0, tierra)
        extremos.push({ p, red: r0 })
      }
    }
    const islas = new Map<number, Pieza[]>()
    for (const { p, red } of extremos) {
      const raiz = uf.buscar(red)
      if (raiz === uf.buscar(tierra)) continue
      const isla = islas.get(raiz)
      // Los extremos de una pieza van seguidos: si ya entró a esta isla, es la última (sin buscarla en toda la isla).
      if (!isla) islas.set(raiz, [p])
      else if (isla[isla.length - 1] !== p) isla.push(p)
    }
    for (const ps of islas.values()) {
      const refs = referenciasCortas(ps.map((p) => p.ref))
      const pista = (ps.some((p) => esTransformador(lib.get(p.tipo))) ? ` ${PISTA_TRANSFORMADOR}` : '') + (ps.some((p) => esOptoacoplador(lib.get(p.tipo))) ? ` ${PISTA_OPTOACOPLADOR}` : '')
      avisos.push({ texto: (ps.length === 1 ? `${refs} no tiene camino a tierra.` : `${refs} no tienen camino a tierra.`) + pista, piezas: ps.map((p) => p.id) })
    }
  }
  // Lo que no impide simular va al final.
  if (logica) for (const { texto, piezas } of entradasAlAire(doc, lib, con)) avisos.push({ texto, piezas, leve: true })
  if (logica) for (const t of entradasTrasContactos(doc, lib, con)) avisos.push({ texto: textoEntradasTrasContactos([t])!, piezas: t.piezas, leve: true })
  avisos.push(...avisosDeSondas(doc, con))
  for (const a of avisosDeLosMultimetros(multimetros, doc, lib, con)) avisos.push({ ...a, leve: true })
  return avisos
}

/** Las sondas que no miden: las que no tocan nada y las de una entrada que además tiene un cable. No impiden simular. */
function avisosDeSondas(doc: Documento, con: Conexiones): Aviso[] {
  const out: Aviso[] = []
  for (const s of Object.values(doc.sondas ?? {}).sort(porId)) {
    const inst = instrumentoDe(doc, s)
    const n = nombreDeSonda(s, inst?.ref)
    const sujeto = n.charAt(0).toUpperCase() + n.slice(1)
    const piezas = inst ? [inst.id] : []
    if (!con.redDeSonda.has(s.id)) out.push({ texto: `${sujeto} no toca ningún cable ni pin: no mide nada.`, piezas, leve: true })
    else if (con.sondasSinUnir.includes(s.id)) out.push({ texto: `${sujeto} no mide: su entrada también tiene un cable.`, piezas, leve: true })
  }
  return out
}
