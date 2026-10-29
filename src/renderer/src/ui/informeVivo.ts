/** Las cuentas del informe de una importación contra el documento de ahora: lo que ya se reemplazó o se borró deja de contar. */
import type { Documento, Id } from '../doc/tipos'
import type { Informe } from '../importar/informe'

export type ClaseTarjeta = 'aproximadas' | 'sinEquivalencia' | 'etiquetas' | 'analisis'

export interface TarjetaInforme {
  clase: ClaseTarjeta
  /** Tono de `ui/colores.css`. */
  tono: 'ocre' | 'rojo' | 'azul' | 'verdeazul'
  titulo: string
  lineas: string[]
  /** Lo que se resalta y se encuadra al elegir la tarjeta. */
  piezas: Id[]
  cables: Id[]
  etiquetas: Id[]
}

/** Renglones visibles por tarjeta; el resto se resume en «y N más». */
const MAX_LINEAS = 3

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

function conResto(lineas: string[]): string[] {
  if (lineas.length <= MAX_LINEAS) return lineas
  return [...lineas.slice(0, MAX_LINEAS), `y ${lineas.length - MAX_LINEAS} más`]
}

function lista(nombres: string[]): string {
  const u = [...new Set(nombres)]
  const mostrados = u.slice(0, MAX_LINEAS)
  const resto = u.length - mostrados.length
  if (resto > 0) return `${mostrados.join(', ')} y ${resto} más`
  return mostrados.length > 1 ? `${mostrados.slice(0, -1).join(', ')} y ${mostrados[mostrados.length - 1]}` : mostrados[0]
}

/** `nombrePieza` da el nombre de un tipo de la librería; sin él se muestra el id. */
export function informeVivo(doc: Documento, informe: Informe, nombrePieza: (tipo: string) => string = (t) => t): TarjetaInforme[] {
  const tarjetas: TarjetaInforme[] = []

  const aprox = informe.aproximadas.filter((a) => Object.hasOwn(doc.piezas, a.id) && doc.piezas[a.id]!.tipo === a.pieza)
  if (aprox.length > 0)
    tarjetas.push({
      clase: 'aproximadas',
      tono: 'ocre',
      titulo: `${aprox.length} con modelo aproximado`,
      lineas: conResto(aprox.map((a) => `${doc.piezas[a.id].ref}${a.original ? ` ${a.original}` : ''} → ${a.modelo ?? nombrePieza(a.pieza)}`)),
      piezas: aprox.map((a) => a.id),
      cables: [],
      etiquetas: []
    })

  const cajas = informe.sinEquivalencia.filter((s) => Object.hasOwn(doc.piezas, s.id) && doc.piezas[s.id]!.tipo === 'sin-equivalencia')
  if (informe.sinEquivalencia.length > 0)
    tarjetas.push(
      cajas.length === 0
        ? { clase: 'sinEquivalencia', tono: 'verdeazul', titulo: 'Todas reemplazadas', lineas: [], piezas: [], cables: [], etiquetas: [] }
        : {
            clase: 'sinEquivalencia',
            tono: 'rojo',
            titulo: `${cajas.length} sin equivalencia`,
            lineas: conResto(cajas.map((s) => `${doc.piezas[s.id].ref} ${s.original ?? s.tipo} queda como caja gris. Reemplázala para simular.`)),
            piezas: cajas.map((s) => s.id),
            cables: [],
            etiquetas: []
          }
    )

  const etiquetasDoc = Object.values(doc.etiquetas)
  const redes = informe.redesConEtiqueta
    .map((r) => ({ nombre: r.nombre, etiquetas: etiquetasDoc.filter((e) => e.nombre === r.nombre).map((e) => e.id), piezas: r.ids.filter((id) => Object.hasOwn(doc.piezas, id)) }))
    .filter((r) => r.etiquetas.length > 0)
  if (redes.length > 0)
    tarjetas.push({
      clase: 'etiquetas',
      tono: 'azul',
      titulo: plural(redes.length, 'red con etiqueta', 'redes con etiqueta'),
      lineas: [`${lista(redes.map((r) => r.nombre))}: se unen por el nombre de la etiqueta.`],
      piezas: [...new Set(redes.flatMap((r) => r.piezas))],
      cables: [],
      etiquetas: redes.flatMap((r) => r.etiquetas)
    })

  const nombresAnalisis = new Set(Object.values(doc.analisis ?? {}).map((a) => a.nombre))
  const analisis = informe.analisis.filter((a) => nombresAnalisis.has(a.nombre))
  if (analisis.length > 0)
    tarjetas.push({
      clase: 'analisis',
      tono: 'verdeazul',
      titulo: plural(analisis.length, 'análisis convertido', 'análisis convertidos'),
      lineas: conResto(analisis.map((a) => a.de)),
      piezas: [],
      cables: [],
      etiquetas: []
    })

  return tarjetas
}

/** «Importado de Proteus 8.13». */
export function tituloDeImportacion(informe: Informe): string {
  const nombres = { falstad: 'Falstad', ltspice: 'LTspice', spice: 'SPICE', kicad: 'KiCad', proteus: 'Proteus' } as const
  const o = informe.origen
  return `Importado de ${nombres[o.formato]}${o.version ? ` ${o.version}` : ''}`
}

/** «Filtro.pdsprj: 27 de 28 piezas convertidas. El original no se modificó.» */
export function resumenDeConversion(informe: Informe): string {
  return `${informe.origen.nombre}: ${informe.convertidas} de ${informe.total} ${informe.total === 1 ? 'pieza convertida' : 'piezas convertidas'}. El original no se modificó.`
}

export const tieneMarcas = (t: TarjetaInforme[]): boolean => t.some((x) => x.piezas.length > 0 || x.etiquetas.length > 0)
