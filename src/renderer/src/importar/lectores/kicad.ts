import type { CircuitoAjeno, DibujoAjeno, PiezaAjena, PinAjeno, RedAjena, TerminalAjena } from '../ajeno'
import { unirPuntosEnCables } from './segmentos'
import { ErrorSexpr, esLista, hijo, hijos, leerSexpr, numeros, texto, type Nodo } from './sexpr'

/** Primera versión de archivo de KiCad 7; antes de ella el formato es otro. */
const VERSION_MIN = 20230121
const VERSION_KICAD8 = 20231120
const VERSION_KICAD9 = 20250114
/** Más allá de esto el lector no conoce el formato y lo dice. */
const VERSION_MAX = 20270101
const PROFUNDIDAD_HOJAS = 12
// Una hoja citada muchas veces en cada nivel crecería de forma exponencial al aplanarla: se cuentan todas las instancias.
export const MAX_INSTANCIAS_HOJA = 256
const SEPARACION_HOJAS = 25

interface PinLib {
  numero: string
  nombre: string
  x: number
  y: number
  /** Pin de alimentación oculto: KiCad lo une a la red global que lleva su nombre. */
  poderOculto: boolean
}

interface SimboloLib {
  /** Pines por unidad (0 es común a todas) y estilo de cuerpo. */
  pines: { unidad: number; estilo: number; pin: PinLib }[]
  unidades: number
  props: Record<string, string>
  esPoder: boolean
}

interface SimboloHoja {
  libId: string
  ref: string
  valor: string
  x: number
  y: number
  rot: number
  unidad: number
  props: Record<string, string>
  pines: PinAjeno[]
  /** Nombre de la red global de cada pin de alimentación oculto (índice del pin). */
  poderOculto: Map<number, string>
  esPoder: boolean
  /** Hay más de una unidad en su símbolo de librería. */
  multiunidad: boolean
}

interface HojaLeida {
  simbolos: SimboloHoja[]
  cables: [number, number, number, number][]
  uniones: [number, number][]
  etiquetas: { nombre: string; x: number; y: number; tipo: 'local' | 'global' | 'jerarquica' }[]
  hojas: { nombre: string; archivo: string; pines: { nombre: string; x: number; y: number }[] }[]
  textos: { texto: string; x: number; y: number }[]
  buses: number
  avisos: string[]
}

const num = (v: Nodo | undefined): number => (typeof v === 'string' ? Number(v) : NaN)
const redondear = (v: number): number => Math.round(v * 10000) / 10000
/** Coordenada entera en centésimas de mm: absorbe el ruido de coma flotante (tolerancia de 0.01 mm). */
const ent = (v: number): number => Math.round(v * 100)
const sinCero = (v: number): number => (v === 0 ? 0 : v)

/** Pasa un punto de librería (Y hacia arriba) al esquema (Y hacia abajo): espejo, y después giro antihorario visto en pantalla. */
export function colocarPunto(px: number, py: number, rot: number, espejoX: boolean, espejoY: boolean): [number, number] {
  const x = px
  const y = 0 - py
  const r = ((Math.round(rot) % 360) + 360) % 360
  const [gx, gy] = r === 90 ? [y, 0 - x] : r === 180 ? [0 - x, 0 - y] : r === 270 ? [0 - y, x] : [x, y]
  return [sinCero(espejoY ? 0 - gx : gx), sinCero(espejoX ? 0 - gy : gy)]
}

function propiedades(l: Nodo[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of hijos(l, 'property')) if (typeof p[1] === 'string' && typeof p[2] === 'string') out[p[1]] = p[2]
  return out
}

function leerSimboloLib(l: Nodo[], todos: Map<string, Nodo[]>, vistos = new Set<string>()): SimboloLib {
  const nombre = typeof l[1] === 'string' ? l[1] : ''
  const props = propiedades(l)
  const pines: SimboloLib['pines'] = []
  const unidades = new Set<number>()
  for (const sub of hijos(l, 'symbol')) {
    const m = /_(\d+)_(\d+)$/.exec(typeof sub[1] === 'string' ? sub[1] : '')
    if (!m) continue
    const unidad = Number(m[1])
    const estilo = Number(m[2])
    if (unidad > 0) unidades.add(unidad)
    for (const p of hijos(sub, 'pin')) {
      const at = numeros(p, 'at')
      if (!at || !Number.isFinite(at[0]) || !Number.isFinite(at[1])) continue
      pines.push({ unidad, estilo, pin: { numero: texto(p, 'number') ?? '', nombre: texto(p, 'name') ?? '', x: at[0] as number, y: at[1] as number, poderOculto: p[1] === 'power_in' && (p.includes('hide') || texto(p, 'hide') === 'yes') } })
    }
  }
  const padreNombre = hijo(l, 'extends')?.[1]
  if (typeof padreNombre === 'string' && pines.length === 0 && !vistos.has(nombre)) {
    vistos.add(nombre)
    const libreria = nombre.includes(':') ? nombre.split(':')[0] : ''
    const padre = todos.get(padreNombre) ?? todos.get(`${libreria}:${padreNombre}`)
    if (padre) {
      const p = leerSimboloLib(padre, todos, vistos)
      return { ...p, props: { ...p.props, ...props }, esPoder: p.esPoder || hijo(l, 'power') !== undefined }
    }
  }
  return { pines, unidades: unidades.size, props, esPoder: hijo(l, 'power') !== undefined }
}

function leerHoja(raiz: Nodo[]): { hoja: HojaLeida; version?: number; generador?: string } {
  const avisos: string[] = []
  const esquema = raiz.find((n): n is Nodo[] => esLista(n) && n[0] === 'kicad_sch')
  if (!esquema) throw new ErrorSexpr('El archivo no es un esquema de KiCad (falta kicad_sch).')
  const version = Number(texto(esquema, 'version'))
  const hoja: HojaLeida = { simbolos: [], cables: [], uniones: [], etiquetas: [], hojas: [], textos: [], buses: 0, avisos }

  const todos = new Map<string, Nodo[]>()
  for (const s of hijos(hijo(esquema, 'lib_symbols') ?? [], 'symbol')) if (typeof s[1] === 'string') todos.set(s[1], s)
  const cache = new Map<string, SimboloLib>()
  const lib = (nombre: string): SimboloLib | undefined => {
    const previo = cache.get(nombre)
    if (previo) return previo
    const l = todos.get(nombre)
    if (!l) return undefined
    const s = leerSimboloLib(l, todos)
    cache.set(nombre, s)
    return s
  }

  for (const s of hijos(esquema, 'symbol')) {
    const libId = texto(s, 'lib_id') ?? ''
    const def = lib(texto(s, 'lib_name') ?? libId) ?? lib(libId)
    const at = numeros(s, 'at') ?? []
    const [x = NaN, y = NaN, rot = 0] = at
    const props = propiedades(s)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      avisos.push(`El símbolo «${libId}» (${props.Reference ?? '?'}) no trae su posición y se omitió.`)
      continue
    }
    const unidad = Number(texto(s, 'unit') ?? 1) || 1
    const estiloCuerpo = Number(texto(s, 'body_style') ?? texto(s, 'convert') ?? 1) || 1
    const espejo = texto(s, 'mirror') ?? ''
    const propsPieza: Record<string, string> = {}
    for (const [k, v] of Object.entries({ ...(def?.props ?? {}), ...props })) {
      if ((k.startsWith('Sim.') || k === 'Footprint') && v.trim() && v !== '~') propsPieza[k] = v
    }
    // Sin pines del estilo pedido (De Morgan) se usan los del estilo 1.
    const delEstilo = (def?.pines ?? []).some((q) => q.estilo === estiloCuerpo)
    const pines: PinAjeno[] = []
    const poderOculto = new Map<number, string>()
    for (const { unidad: u, estilo, pin } of def?.pines ?? []) {
      if (u !== 0 && u !== unidad) continue
      if (estilo !== 0 && estilo !== (delEstilo ? estiloCuerpo : 1)) continue
      const [dx, dy] = colocarPunto(pin.x, pin.y, rot, espejo === 'x', espejo === 'y')
      if (pin.poderOculto && pin.nombre) poderOculto.set(pines.length, pin.nombre)
      pines.push({ numero: pin.numero, ...(pin.nombre && pin.nombre !== '~' ? { nombre: pin.nombre } : {}), x: redondear(x + dx), y: redondear(y + dy) })
    }
    hoja.simbolos.push({
      libId,
      ref: props.Reference ?? '?',
      valor: props.Value ?? '',
      x, y, rot, unidad,
      props: propsPieza,
      pines,
      poderOculto,
      esPoder: (def?.esPoder ?? false) || (props.Reference ?? '').startsWith('#PWR'),
      multiunidad: (def?.unidades ?? 0) > 1
    })
    if (!def) avisos.push(`El símbolo «${libId}» (${props.Reference ?? '?'}) no está en la librería incrustada y se leyó sin conexiones.`)
  }

  for (const w of hijos(esquema, 'wire')) {
    const p = (hijo(w, 'pts') ?? []).filter(esLista).filter((q) => q[0] === 'xy').map((q) => [num(q[1]), num(q[2])] as [number, number])
    for (let i = 0; i + 1 < p.length; i++) {
      const [a, b] = [p[i] as [number, number], p[i + 1] as [number, number]]
      if ([...a, ...b].every(Number.isFinite)) hoja.cables.push([a[0], a[1], b[0], b[1]])
    }
  }
  for (const j of hijos(esquema, 'junction')) {
    const at = numeros(j, 'at')
    if (at && Number.isFinite(at[0]) && Number.isFinite(at[1])) hoja.uniones.push([at[0] as number, at[1] as number])
  }
  for (const [k, tipo] of [['label', 'local'], ['global_label', 'global'], ['hierarchical_label', 'jerarquica']] as const)
    for (const e of hijos(esquema, k)) {
      const at = numeros(e, 'at')
      if (typeof e[1] === 'string' && at && Number.isFinite(at[0]) && Number.isFinite(at[1])) hoja.etiquetas.push({ nombre: e[1], x: at[0] as number, y: at[1] as number, tipo })
    }
  for (const sh of hijos(esquema, 'sheet')) {
    const p = propiedades(sh)
    const archivo = p.Sheetfile ?? p['Sheet file'] ?? ''
    const pinesHoja = hijos(sh, 'pin').flatMap((q) => {
      const at = numeros(q, 'at')
      return typeof q[1] === 'string' && at && Number.isFinite(at[0]) && Number.isFinite(at[1]) ? [{ nombre: q[1], x: at[0] as number, y: at[1] as number }] : []
    })
    hoja.hojas.push({ nombre: p.Sheetname ?? p['Sheet name'] ?? archivo, archivo, pines: pinesHoja })
  }
  for (const t of hijos(esquema, 'text')) {
    const at = numeros(t, 'at')
    if (typeof t[1] === 'string' && at && Number.isFinite(at[0]) && Number.isFinite(at[1])) hoja.textos.push({ texto: t[1], x: at[0] as number, y: at[1] as number })
  }
  hoja.buses = hijos(esquema, 'bus').length + hijos(esquema, 'bus_entry').length
  return { hoja, version: Number.isFinite(version) ? version : undefined, generador: texto(esquema, 'generator_version') }
}

/** Unión-búsqueda sobre cadenas. */
class Uniones {
  private padre = new Map<string, string>()
  raiz(k: string): string {
    if (!this.padre.has(k)) this.padre.set(k, k)
    let r = k
    while ((this.padre.get(r) as string) !== r) r = this.padre.get(r) as string
    for (let c = k; c !== r; ) {
      const s = this.padre.get(c) as string
      this.padre.set(c, r)
      c = s
    }
    return r
  }
  unir(a: string, b: string): void {
    const ra = this.raiz(a)
    const rb = this.raiz(b)
    if (ra !== rb) this.padre.set(rb, ra)
  }
}

const esTierra = (n: string): boolean => /^(GND[A-Z]*|GNDPWR|GNDREF|EARTH(_PROTECTIVE)?|CHASSIS|PE|0)$/i.test(n)
const esNombreDeBus = (n: string): boolean => /[[{]/.test(n)

interface PiezaHoja extends PiezaAjena {
  hoja: string
  claves: string[]
}

interface HojaIntegrada {
  id: string
  cables: { x1: number; y1: number; x2: number; y2: number; clave: string }[]
  puntos: Map<string, [number, number]>
}

function limites(h: HojaLeida): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  const ver = (x: number): void => {
    if (x < min) min = x
    if (x > max) max = x
  }
  for (const c of h.cables) {
    ver(c[0])
    ver(c[2])
  }
  for (const s of h.simbolos) {
    ver(s.x)
    for (const p of s.pines) ver(p.x as number)
  }
  for (const e of h.etiquetas) ver(e.x)
  return min === Infinity ? { min: 0, max: 0 } : { min, max }
}

export function leerKicad(contenido: string, nombre: string, hojas: Record<string, string> = {}): CircuitoAjeno {
  const avisos: string[] = []
  const raiz = leerHoja(leerSexpr(contenido))
  const { version } = raiz
  let versionTexto: string | undefined
  if (version === undefined) avisos.push('El archivo no declara su versión de KiCad; se intentó leer igual.')
  else {
    versionTexto = raiz.generador?.split('.')[0] ?? (version >= VERSION_KICAD9 ? '9' : version >= VERSION_KICAD8 ? '8' : '7')
    if (version < VERSION_MIN) avisos.push(`La versión del archivo (${version}) es anterior a KiCad 7; se intentó leer igual y puede faltar información.`)
    else if (version >= VERSION_MAX) avisos.push(`La versión del archivo (${version}) es más nueva que KiCad 9; se intentó leer igual.`)
  }

  const u = new Uniones()
  const porHoja: HojaIntegrada[] = []
  const piezas: PiezaHoja[] = []
  const nombres: { clave: string; nombre: string; rango: number }[] = []
  const conCable: string[] = []
  const dibujo: DibujoAjeno = { cables: [], uniones: [], etiquetas: [], terminales: [], textos: [] }
  const cacheHojas = new Map<string, HojaLeida | null>()
  const buscarHoja = (archivo: string): string | undefined => {
    if (Object.hasOwn(hojas, archivo)) return hojas[archivo]
    const base = archivo.split(/[\\/]/).pop()?.toLowerCase()
    const k = Object.keys(hojas).find((n) => n.split(/[\\/]/).pop()?.toLowerCase() === base)
    return k === undefined ? undefined : hojas[k]
  }
  // Cada hoja hija se coloca a la derecha de lo anterior para que su dibujo no se encime.
  let cursorX = limites(raiz.hoja).max + SEPARACION_HOJAS
  let buses = 0
  let instancias = 0

  const integrar = (h: HojaLeida, id: string, dx: number, profundidad: number, pila: string[]): void => {
    const hoja: HojaIntegrada = { id, cables: [], puntos: new Map() }
    porHoja.push(hoja)
    const pt = (x: number, y: number): string => {
      const [ix, iy] = [ent(x + dx), ent(y)]
      const c = `${id}|${ix}|${iy}`
      hoja.puntos.set(c, [ix, iy])
      u.raiz(c)
      return c
    }
    buses += h.buses
    avisos.push(...h.avisos)

    for (const [x1, y1, x2, y2] of h.cables) {
      const a = pt(x1, y1)
      u.unir(a, pt(x2, y2))
      hoja.cables.push({ x1: ent(x1 + dx), y1: ent(y1), x2: ent(x2 + dx), y2: ent(y2), clave: a })
      conCable.push(a)
      dibujo.cables.push([{ x: x1 + dx, y: y1 }, { x: x2 + dx, y: y2 }])
    }
    for (const [x, y] of h.uniones) {
      pt(x, y)
      dibujo.uniones.push({ x: x + dx, y })
    }
    for (const e of h.etiquetas) {
      if (esNombreDeBus(e.nombre)) {
        avisos.push(`La etiqueta «${e.nombre}» nombra un bus y no se convierte; sus miembros se unen por el nombre de la etiqueta de cada cable.`)
        continue
      }
      const p = pt(e.x, e.y)
      u.unir(p, e.tipo === 'global' ? `G|${e.nombre}` : e.tipo === 'jerarquica' ? `${id}|H|${e.nombre}` : `${id}|N|${e.nombre}`)
      nombres.push({ clave: p, nombre: e.tipo === 'global' || id === '' ? e.nombre : `${id}${e.nombre}`, rango: e.tipo === 'global' ? 1 : e.tipo === 'local' ? (id === '' ? 2 : 3) : 4 })
      dibujo.etiquetas.push({ nombre: e.nombre, x: e.x + dx, y: e.y })
    }
    for (const t of h.textos) dibujo.textos.push({ texto: t.texto, x: t.x + dx, y: t.y })

    for (const s of h.simbolos) {
      if (s.esPoder) {
        if (/(^|:)PWR_FLAG$/.test(s.libId) || s.ref.startsWith('#FLG')) continue
        const p0 = s.pines[0]
        const nombreRed = s.valor || p0?.nombre || ''
        if (!nombreRed || !p0) continue
        const p = pt(p0.x as number, p0.y as number)
        u.unir(p, `G|${nombreRed}`)
        nombres.push({ clave: p, nombre: nombreRed, rango: 0 })
        const t: TerminalAjena = { nombre: nombreRed, tipo: esTierra(nombreRed) ? 'tierra' : 'alimentacion', x: (p0.x as number) + dx, y: p0.y as number, giro: s.rot }
        dibujo.terminales.push(t)
        continue
      }
      if (s.ref.startsWith('#')) continue
      const claves = s.pines.map((p) => pt(p.x as number, p.y as number))
      for (const [i, red] of s.poderOculto) {
        u.unir(claves[i] as string, `G|${red}`)
        nombres.push({ clave: claves[i] as string, nombre: red, rango: 1 })
      }
      if (s.pines.length === 0) avisos.push(`El símbolo «${s.libId}» (${s.ref}) no trae pines y se leyó sin conexiones.`)
      const marcador = s.valor === '' || s.valor === '~' || s.valor.includes('${')
      const valor = marcador ? s.props['Sim.Params'] : s.valor
      piezas.push({
        hoja: id,
        claves,
        ref: s.ref,
        tipo: s.libId,
        ...(valor ? { valor } : {}),
        ...(s.props['Sim.Name'] ? { modelo: s.props['Sim.Name'] } : {}),
        props: s.props,
        ...(s.multiunidad ? { unidad: Number.isInteger(s.unidad) && s.unidad >= 1 && s.unidad <= 26 ? String.fromCharCode(64 + s.unidad) : String(s.unidad) } : {}),
        x: s.x + dx,
        y: s.y,
        giro: s.rot,
        pines: s.pines.map((p) => ({ ...p, x: redondear((p.x as number) + dx) }))
      })
    }

    for (const sh of h.hojas) {
      const fuente = sh.archivo ? buscarHoja(sh.archivo) : undefined
      if (fuente === undefined) {
        avisos.push(`La hoja «${sh.nombre}» (${sh.archivo || 'sin archivo'}) no se encontró entre los archivos dados y se omitió.`)
        continue
      }
      if (profundidad >= PROFUNDIDAD_HOJAS || pila.includes(sh.archivo)) {
        avisos.push(`La hoja «${sh.nombre}» se incluye a sí misma o anida demasiado y se omitió.`)
        continue
      }
      let hijoLeido = cacheHojas.get(sh.archivo)
      if (hijoLeido === undefined) {
        try {
          hijoLeido = leerHoja(leerSexpr(fuente)).hoja
        } catch (e) {
          avisos.push(`La hoja «${sh.nombre}» no se pudo leer: ${(e as Error).message}`)
          hijoLeido = null
        }
        cacheHojas.set(sh.archivo, hijoLeido)
      }
      if (!hijoLeido) continue
      if (++instancias > MAX_INSTANCIAS_HOJA) {
        avisos.push(`La hoja «${sh.nombre}» se omitió: el diseño pasa de ${MAX_INSTANCIAS_HOJA} hojas al aplanarlo.`)
        continue
      }
      const idHijo = `${id}${sh.nombre}/`
      const { min, max } = limites(hijoLeido)
      const dxHijo = cursorX - min
      cursorX += max - min + SEPARACION_HOJAS
      for (const pin of sh.pines) u.unir(pt(pin.x, pin.y), `${idHijo}|H|${pin.nombre}`)
      integrar(hijoLeido, idHijo, dxHijo, profundidad + 1, [...pila, sh.archivo])
    }
  }
  integrar(raiz.hoja, '', 0, 0, [])
  if (buses > 0) avisos.push(`El esquema trae ${buses} elemento${buses === 1 ? '' : 's'} de bus (trazos y entradas); no se convierten y los miembros se unen por el nombre de sus etiquetas.`)

  // Un pin, etiqueta o extremo que cae dentro de un cable recto, sin ser su extremo, queda unido a él.
  for (const h of porHoja)
    unirPuntosEnCables(
      [...h.puntos].map(([clave, [x, y]]) => ({ x, y, clave })),
      h.cables,
      (p, c) => u.unir(p, c)
    )

  // Una hoja usada dos veces repite referencias: las de las hojas hijas se prefijan con el camino de la hoja.
  const usos = new Map<string, Set<string>>()
  for (const p of piezas) {
    const c = `${p.ref}|${p.unidad ?? ''}`
    ;(usos.get(c) ?? usos.set(c, new Set()).get(c)!).add(p.hoja)
  }
  for (const p of piezas) if ((usos.get(`${p.ref}|${p.unidad ?? ''}`)?.size ?? 1) > 1 && p.hoja !== '') p.ref = `${p.hoja}${p.ref}`

  // Referencias sin anotar (`R?`) o copiadas: cada pieza repetida lleva su sufijo para que sus pines no se mezclen en las redes.
  const vistas = new Map<string, number>()
  for (const p of piezas) {
    const c = `${p.ref}|${p.unidad ?? ''}`
    const n = (vistas.get(c) ?? 0) + 1
    vistas.set(c, n)
    if (n > 1) p.ref = `${p.ref}_${n}`
  }

  const mejor = new Map<string, { nombre: string; rango: number }>()
  for (const n of nombres) {
    const r = u.raiz(n.clave)
    const previo = mejor.get(r)
    if (!previo) mejor.set(r, n)
    else if (previo.nombre !== n.nombre) {
      if (n.rango < previo.rango) mejor.set(r, n)
      else if (n.rango === previo.rango && n.rango <= 2) avisos.push(`Una red lleva dos nombres, «${previo.nombre}» y «${n.nombre}»; se conserva «${previo.nombre}».`)
    }
  }
  const raicesConCable = new Set(conCable.map((c) => u.raiz(c)))
  const porRaiz = new Map<string, RedAjena>()
  for (const p of piezas)
    p.pines.forEach((pin, i) => {
      const r = u.raiz(p.claves[i] as string)
      let red = porRaiz.get(r)
      if (!red) porRaiz.set(r, (red = { pines: [] }))
      red.pines.push({ ref: p.ref, pin: pin.numero as string })
    })
  const redes: RedAjena[] = []
  let auto = 0
  for (const [r, red] of porRaiz) {
    const etiqueta = mejor.get(r)?.nombre
    // Un pin suelto, sin cable ni nombre, no forma red.
    if (etiqueta === undefined && red.pines.length < 2 && !raicesConCable.has(r)) continue
    red.nombre = etiqueta ?? `Net-${++auto}`
    redes.push(red)
  }

  return {
    formato: 'kicad',
    ...(versionTexto ? { version: versionTexto } : {}),
    nombre,
    unidadesPorMm: 1,
    piezas: piezas.map(({ hoja: _hoja, claves: _claves, ...p }) => p),
    redes,
    dibujo,
    instrumentos: [],
    directivas: [],
    avisos
  }
}
