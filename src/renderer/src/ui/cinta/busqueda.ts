import type { PestañaCinta } from '../../../../compartido/ajustes'
import { normalizar } from '../../buscador/buscar'
import { COMANDOS, type IdComando } from './comandos'
import { enGrabacion, iconoDe, razonDeshabilitado, teclaVisible, textoDe, type EstadoCinta, type Teclas } from './estado'
import { DONDE_BARRA, lugares } from './modelo'
import type { NombreIcono } from './trazos'

export interface EntradaBusqueda {
  id: IdComando
  /** El nombre que muestra la cinta ahora (Pausar en vez de Simular mientras corre). */
  texto: string
  icono: NombreIcono
  /** Nombre de la pestaña donde está, o «Barra». */
  donde: string
  pestaña?: PestañaCinta
  tecla?: string
  /** Todas sus teclas vigentes, sin acentos ni mayúsculas (la primera es `tecla`). */
  teclas: readonly string[]
  razon: string | null
  /** Texto en que se busca, sin acentos: nombre, nombre del registro, del menú, palabras extra y tecla. */
  claves: string
}

/** Un renglón por comando de la cinta. `todas` da cada tecla vigente del comando. */
export function entradasDeBusqueda(
  e: EstadoCinta,
  tecla: Teclas,
  nombreRegistro: (id: string) => string | undefined,
  todas: (id: string) => readonly string[] = (id) => [tecla(id) ?? ''].filter(Boolean)
): EntradaBusqueda[] {
  const vistos = new Set<IdComando>()
  const out: EntradaBusqueda[] = []
  const agregar = (id: IdComando, donde: string, pestaña?: PestañaCinta) => {
    if (vistos.has(id)) return
    vistos.add(id)
    const c = COMANDOS[id]
    // El reloj del botón Grabar no sirve de nombre en la lista.
    const texto = id === 'grabar' && enGrabacion(e) ? 'Detener la grabación' : textoDe(id, e)
    const t = teclaVisible(id, tecla)
    const teclas = (c.tecla ? todas(c.tecla) : c.teclaFija ? [c.teclaFija] : []).map(normalizar)
    const claves = normalizar([texto, c.texto, c.tecla ? (nombreRegistro(c.tecla) ?? '') : '', c.textoMenu ?? '', c.palabras ?? '', ...teclas].join(' '))
    out.push({ id, texto, icono: iconoDe(id, e), donde, pestaña, tecla: t, teclas, razon: razonDeshabilitado(id, e, tecla), claves })
  }
  for (const l of lugares()) agregar(l.id, l.pestaña?.nombre ?? DONDE_BARRA, l.pestaña?.id)
  return out
}

/** «ctrl+shift+z» → ["ctrl", "shift", "z"]; «ctrl++» → ["ctrl", "+"]; «ctrl+» → ["ctrl", ""] (lo que falta por escribir). */
function segmentos(t: string): string[] {
  if (t.length > 1 && t.endsWith('++')) return [...t.slice(0, -2).split('+'), '+']
  return t.split('+')
}

/** Si lo escrito es una combinación de `k` o su comienzo, con la última tecla a medio escribir. */
function esComienzoDeCombinacion(w: string, k: string): boolean {
  const ws = segmentos(w), ks = segmentos(k)
  if (ws.length > ks.length) return false
  const n = ws.length - 1
  for (let i = 0; i < n; i++) if (ws[i] !== ks[i]) return false
  // Una sola letra es una tecla entera: «ctrl+s» es Ctrl+S y no el comienzo de Ctrl+Shift+S.
  return ws[n] === ks[n] || (ws[n].length !== 1 && ks[n].startsWith(ws[n]))
}

/** Una palabra con «+» es una combinación de teclas (entera o su comienzo). Las demás se buscan en las claves. */
function coincide(x: EntradaBusqueda, w: string): boolean {
  if (!w.includes('+') || w === '+') return x.claves.includes(w)
  return x.teclas.some((k) => esComienzoDeCombinacion(w, k))
}

/** Hasta `max` comandos que contienen todas las palabras de la consulta; primero los que empiezan con la primera. */
export function buscarComandos(consulta: string, entradas: readonly EntradaBusqueda[], max = 8): EntradaBusqueda[] {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return []
  const empieza = (x: EntradaBusqueda) => (normalizar(x.texto).startsWith(palabras[0]) ? 0 : 1)
  return entradas
    .map((x, i) => [x, i] as const)
    .filter(([x]) => palabras.every((w) => coincide(x, w)))
    .sort((a, b) => empieza(a[0]) - empieza(b[0]) || a[1] - b[1])
    .slice(0, max)
    .map(([x]) => x)
}
