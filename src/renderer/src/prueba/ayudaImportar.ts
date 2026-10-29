import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import type { CircuitoAjeno } from '../importar/ajeno'
import { fijosDe } from '../importar/convertir'
import { emparejarPines } from '../importar/pines'
import type { PiezaDef } from '../piezas/tipos'

const TIERRA = /^(0|a?d?p?gnd|earth|tierra)$/i

/** Compara las redes del circuito ajeno con las que calcula Kirchi sobre el documento importado: una red del origen no puede
 * quedar partida ni unirse con otra (salvo las que se llaman igual o son todas tierra, que se unen por nombre). Lista vacía: iguales. */
export function problemasDeRedes(ajeno: CircuitoAjeno, doc: Documento, lib: Map<string, PiezaDef>): string[] {
  const con = calcularConexiones(doc, lib)
  const porRef = new Map(Object.values(doc.piezas).map((p) => [p.ref, p]))
  const problemas: string[] = []
  const ajenosEnRed = new Map<number, Set<number>>()
  ajeno.redes.forEach((r, k) => {
    const redes = new Set<number>()
    for (const q of r.pines) {
      // Un símbolo multiunidad es varias piezas del origen con la misma referencia: el pin se busca en cada una.
      for (const pa of ajeno.piezas.filter((p) => p.ref === q.ref || (p.unidad !== undefined && `${p.ref}:${p.unidad}` === q.ref))) {
        const pk = porRef.get(pa.unidad !== undefined && porRef.has(pa.ref + pa.unidad) ? pa.ref + pa.unidad : pa.ref) ?? [...porRef.values()].find((x) => x.props.paquete === pa.ref && x.props.unidad === pa.unidad)
        const def = pk && lib.get(pk.tipo)
        if (!pk || !def) continue
        const id = pk.pines
          ? (ajeno.formato === 'proteus' && pa.unidad === undefined ? pk.pines.find((x) => x.nombre === q.pin) ?? pk.pines.find((x) => x.numero === q.pin) : pk.pines.find((x) => x.numero === q.pin) ?? pk.pines.find((x) => x.nombre === q.pin) ?? pk.pines.find((x) => x.id === q.pin))?.id
          : emparejarPines(pa, def, pk.props, { fisico: ajeno.formato === 'kicad' || (ajeno.formato === 'proteus' && pa.unidad === undefined), fijos: fijosDe(ajeno, pa, pk.tipo) }).pares.get(q.pin)
        if (!id) continue
        const rid = con.redDePin.get(clavePin(pk.id, id))
        if (rid === undefined) problemas.push(`${q.ref}.${q.pin} no está en ninguna red`)
        else redes.add(rid)
      }
    }
    if (redes.size > 1) problemas.push(`la red ${r.nombre ?? k} quedó partida en ${redes.size}`)
    for (const rid of redes) {
      const s = ajenosEnRed.get(rid) ?? new Set<number>()
      s.add(k)
      ajenosEnRed.set(rid, s)
    }
  })
  for (const [rid, ks] of ajenosEnRed) {
    if (ks.size < 2) continue
    const red = con.redes[rid]!
    // Se unen por nombre solo las redes que se llaman igual o que son todas tierra: un voltaje pegado a la tierra sí es un error.
    const nombres = [...ks].map((k) => (ajeno.redes[k]!.nombre ?? '').toLowerCase())
    const porNombre = new Set(nombres).size === 1 || nombres.every((n) => TIERRA.test(n))
    // Dos terminales de alimentación con el mismo nombre son la misma red en Kirchi: en el origen son dos fuentes ideales del mismo voltaje.
    const nombresDeAlimentacion = [...ks].map((k) => {
      const ns = ajeno.redes[k]!.pines.map((q) => porRef.get(q.ref)).filter((pk) => pk?.tipo === 'alimentacion').map((pk) => String(pk!.props.nombre ?? ''))
      return new Set(ns).size === 1 ? ns[0]! : ''
    })
    const porAlimentacion = nombresDeAlimentacion[0] !== '' && new Set(nombresDeAlimentacion).size === 1
    if (porAlimentacion) continue
    if (!porNombre) problemas.push(`las redes ${[...ks].map((k) => ajeno.redes[k]!.nombre ?? k).join(' y ')} se unieron`)
  }
  return problemas
}
