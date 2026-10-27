import { propDelBuscador, propModelo, propNumerica } from '../editor/colocar'
import { nombreDeVoltaje, voltajeDeNombre } from '../netlist/alimentaciones'
import type { PiezaDef } from '../piezas/tipos'
import { leerValor } from '../valores/valores'

export interface Resultado {
  def: PiezaDef
  /** Valor propuesto para la primera propiedad numérica, tal como se escribió; en un terminal de alimentación, su nombre. */
  valor?: string
  puntos: number
}

export const normalizar = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

/** Separa la consulta en términos y valor. El valor es la cola más corta, desde la segunda palabra, que se lee como valor
 * («r 4k7», «fuente 5 V»). */
export function interpretar(consulta: string): { termino: string; valor?: string } {
  const palabras = consulta.trim().split(/\s+/).filter(Boolean)
  for (let i = 1; i < palabras.length; i++) {
    const resto = palabras.slice(i).join(' ')
    if (leerValor(resto)) return { termino: palabras.slice(0, i).join(' '), valor: resto }
  }
  return { termino: palabras.join(' ') }
}

/** Mejor puntaje de una palabra contra un texto: entero 100, empieza 60, contiene 30 (desde 3 letras), o contra sus palabras sueltas. */
function puntuarTexto(palabra: string, texto: string): number {
  const n = normalizar(texto)
  // Contener sin empezar solo cuenta desde 3 letras: con «r» saldrían batería, interruptor y medio catálogo.
  let mejor = n === palabra ? 100 : n.startsWith(palabra) ? 60 : palabra.length >= 3 && n.includes(palabra) ? 30 : 0
  for (const w of n.split(/[^\p{L}\p{N}]+/u)) {
    if (!w || w === n) continue
    const s = w === palabra ? 70 : w.startsWith(palabra) ? 50 : 0
    if (s > mejor) mejor = s
  }
  return mejor
}

/** Cada palabra tiene que coincidir con algo de la definición (nombres, términos, id u opciones de sus propiedades). */
function puntuar(def: PiezaDef, palabras: string[], sinModelos?: ReadonlySet<string>): number {
  if (palabras.length === 0) return 1
  const sin = (t: string) => !sinModelos?.has(normalizar(t))
  // Lo que coincide con el nombre de la pieza (o su id) vale un punto más que un sinónimo: con «osci» el osciloscopio (su nombre)
  // va antes que el cristal, que solo lo trae como sinónimo de «oscilador»; antes empataban y ganaba el orden alfabético.
  const nombres = [def.nombre.es, def.nombre.en, def.id].filter(sin)
  const sinonimos = def.buscar.filter(sin)
  const opciones = def.props.flatMap((p) => p.opciones ?? [])
  let total = 0
  for (const palabra of palabras) {
    let mejor = 0
    for (const t of sinonimos) mejor = Math.max(mejor, puntuarTexto(palabra, t))
    for (const t of nombres) {
      const s = puntuarTexto(palabra, t)
      if (s) mejor = Math.max(mejor, s + 1)
    }
    // Las opciones (color del LED, abierto o cerrado) solo se buscan desde 3 letras: con «r» saldría «rojo».
    if (!sinModelos && palabra.length >= 3) for (const t of opciones) mejor = Math.max(mejor, puntuarTexto(palabra, t))
    if (!mejor) return 0
    total += mejor
  }
  return total
}

/** Un terminal de alimentación propone su nombre: un voltaje solo («+15V», «3.3V») o tras el término, o uno de sus nombres
 * comunes («vee»). El voltaje solo va primero. */
function terminalBuscado(def: PiezaDef, consulta: string, palabras: string[], valor: string | undefined): Resultado | null {
  const propio = voltajeDeNombre(consulta)
  if (propio !== null) return { def, puntos: 1000, valor: nombreDeVoltaje(propio) }
  const puntos = puntuar(def, palabras)
  if (!puntos) return null
  const comun = propDelBuscador(def)?.comunes?.find((c) => normalizar(c) === normalizar(consulta))
  if (comun) return { def, puntos, valor: comun }
  // Solo un número llano, con o sin V («12», «-5 V»): «r 4k7» no propone un terminal de 4700 V.
  const llano = valor ? /^[+\-−]?(\d+(?:\.\d+)?|\.\d+)\s*[Vv]?$/.exec(valor.trim()) : null
  if (llano) {
    const v = voltajeDeNombre(/[Vv]$/.test(valor!.trim()) ? valor! : `${valor}V`)
    if (v !== null) return { def, puntos, valor: nombreDeVoltaje(v) }
  }
  return { def, puntos }
}

export function buscar(consulta: string, lib: Map<string, PiezaDef>, recientes: string[] = []): Resultado[] {
  const { termino, valor } = interpretar(consulta)
  const palabras = normalizar(termino).split(' ').filter(Boolean)
  const v = valor ? leerValor(valor) : null
  const rango = (id: string) => {
    const i = recientes.indexOf(id)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  const out: Resultado[] = []
  for (const def of lib.values()) {
    if (def.oculta) continue
    if (def.modelo?.tipo === 'alimentacion') {
      const r = terminalBuscado(def, consulta, palabras, valor)
      if (r) out.push(r)
      continue
    }
    const prop = propNumerica(def)
    // Una pieza con lista de modelos (2N2222, TL081): con una palabra de dos letras o más, cada modelo que empieza con ella es
    // un resultado: «TL» propone TL081, TL072... El prefijo exacto va primero y luego por nombre. La pieza sola
    // sigue saliendo si su nombre coincide (un nombre que empieza con la palabra, 60, gana a un modelo, 55) (sin contar sus modelos, que ya salieron uno a uno).
    const modelo = propModelo(def)
    if (modelo && !prop && !valor && palabras.length === 1 && palabras[0].length >= 2) {
      const hits = modelo.opciones!.filter((o) => normalizar(o).startsWith(palabras[0]))
      if (hits.length > 0) {
        for (const h of hits) out.push({ def, valor: h, puntos: normalizar(h) === palabras[0] ? 100 : 55 })
        const solo = puntuar(def, palabras, new Set(modelo.opciones!.map(normalizar)))
        if (solo) out.push({ def, puntos: solo })
        continue
      }
    }
    const puntos = puntuar(def, palabras)
    if (!puntos) continue
    const r: Resultado = { def, puntos }
    const elegido = !prop && modelo ? modelo.opciones!.find((o) => palabras.includes(normalizar(o))) : undefined
    if (elegido) r.valor = elegido
    else if (valor && v && prop && (!v.unidad || !prop.unidad || v.unidad === prop.unidad)) r.valor = valor
    // Con un valor escrito («v 5»), una pieza que no toma ninguno (el multímetro por «voltímetro») va después de las que sí.
    else if (valor && !prop) r.puntos /= 2
    out.push(r)
  }
  out.sort((a, b) => b.puntos - a.puntos || rango(a.def.id) - rango(b.def.id) || a.def.nombre.es.localeCompare(b.def.nombre.es, 'es') || (a.valor ?? '').localeCompare(b.valor ?? '', 'es', { numeric: true, sensitivity: 'base' }))
  return out
}
