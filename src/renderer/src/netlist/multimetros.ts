import { partirClavePin, porId, type Conexiones } from '../conexiones/conexiones'
import type { Documento, Id, Pieza } from '../doc/tipos'
import { ajustesMultimetro } from '../instrumentos/ajustes'
import type { PiezaDef } from '../piezas/tipos'

/** Los modelos que son una fuente: un voltímetro directo sobre una de ellas es una medición normal. */
const FUENTES = new Set(['V', 'I', 'bateria', 'senoidal', 'pulso', 'alimentacion', 'generador', 'fuente-variable'])

/** Multímetro conectado al revés (no impide simular). En A, si las terminales comparten red con dos o más pines ajenos, el
 * amperímetro puentea dos nodos en vez de ir en serie. En V, si una terminal es lo único que une un pin con el resto (y
 * no es tierra ni fuente), el voltímetro cierra el camino como pieza en serie. */
export function avisosDeMultimetros(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones): { texto: string; piezas: Id[] }[] {
  return avisosDeLosMultimetros(Object.values(doc.piezas).filter((p) => lib.get(p.tipo)?.modelo?.tipo === 'multimetro'), doc, lib, con)
}

/** Lo mismo con los multímetros ya reunidos, para quien recorre las piezas de todos modos (sin otro recorrido de todo el documento). */
export function avisosDeLosMultimetros(multimetros: Pieza[], doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones): { texto: string; piezas: Id[] }[] {
  const out: { texto: string; piezas: Id[] }[] = []
  // Solo los multímetros se ordenan: ordenar todas las piezas costaba O(n log n) en cada aviso.
  for (const p of [...multimetros].sort(porId)) {
    const def = lib.get(p.tipo)!
    const m = def.modelo
    if (m?.tipo !== 'multimetro') continue
    const modo = ajustesMultimetro(p, def).modo
    const redes = [m.mas, m.com].map((pin) => con.redDePin.get(`${p.id}:${pin}`))
    if (redes[0] === undefined || redes[1] === undefined || redes[0] === redes[1]) continue
    /** Los pines de otras piezas en la red de cada terminal. */
    const otros = redes.map((r) => con.redes[r!].pines.map(partirClavePin).filter((k) => k.piezaId !== p.id))
    if (modo === 'A DC' || modo === 'A AC') {
      if (otros[0].length >= 2 && otros[1].length >= 2) out.push({ texto: `${p.ref}: el amperímetro va en serie, no entre dos puntos del circuito.`, piezas: [p.id] })
    } else if (modo === 'V DC' || modo === 'V AC') {
      const enSerie = otros.some((lista, k) => {
        const red = con.redes[redes[k]!]
        if (red.tierra || lista.length !== 1) return false
        const tipo = lib.get(doc.piezas[lista[0].piezaId]?.tipo ?? '')?.modelo?.tipo
        return !(tipo && FUENTES.has(tipo))
      })
      if (enSerie) out.push({ texto: `${p.ref}: el voltímetro va en paralelo con lo que mide: una de sus terminales es lo único que une un pin con el resto.`, piezas: [p.id] })
    }
  }
  return out
}
