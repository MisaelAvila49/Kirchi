import type { CircuitoAjeno, DirectivaAjena, InstrumentoAjeno, PinAjeno, PiezaAjena, RedAjena } from '../ajeno'
import { dividirLineas } from './lineas'

/** Exponentes decimales de los sufijos: se suman al texto del número para no acumular error de punto flotante. */
const PREFIJOS: Record<string, number> = { f: -15, p: -12, n: -9, u: -6, 'µ': -6, 'μ': -6, m: -3, k: 3, g: 9, t: 12 }

/** Número SPICE con sufijo (f p n u m k meg g t mil); las unidades pegadas tras el sufijo se ignoran. */
export function numeroSpice(t: string): number | null {
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-zµμ]*)$/i.exec(t.trim())
  if (!m) return null
  const [mant, ex] = (m[1] as string).split(/e/i)
  const s = (m[2] ?? '').toLowerCase()
  if (s.startsWith('mil')) return Number(m[1]) * 25.4e-6
  const sufijo = s.startsWith('meg') ? 6 : s ? (PREFIJOS[s[0] as string] ?? 0) : 0
  const r = Number(`${mant}e${Number(ex ?? 0) + sufijo}`)
  return Number.isFinite(r) ? r : null
}

const valorONumero = (t: string): number | string => numeroSpice(t) ?? t

interface Linea {
  n: number
  texto: string
}

/** Quita comentarios, une las continuaciones `+` y numera por la línea donde empieza cada instrucción. */
function lineasLogicas(lineas: string[]): Linea[] {
  const out: Linea[] = []
  for (let i = 1; i < lineas.length; i++) {
    const raw = lineas[i] as string
    if (/^\s*\*/.test(raw)) continue
    let t = raw
    const pc = t.indexOf(';')
    if (pc >= 0) t = t.slice(0, pc)
    t = t.replace(/(^|\s)\$(\s.*|$)/, '').trim()
    if (!t) continue
    const ult = out[out.length - 1]
    if (t.startsWith('+') && ult) ult.texto += ' ' + t.slice(1).trim()
    else out.push({ n: i + 1, texto: t })
  }
  return out
}

const unir = (s: string): string => s.replace(/\s*=\s*/g, '=')
const tokens = (s: string): string[] => unir(s).replace(/[(),]/g, ' ').split(/\s+/).filter(Boolean)
const esTierra = (n: string): boolean => n === '0' || n.toLowerCase() === 'gnd'

const NOMBRES_Q = ['C', 'B', 'E', 'S']
const FUNCIONES = ['pulse', 'sin', 'pwl', 'exp', 'sffm', 'am']
const CAMPOS_FUENTE: Record<string, string[]> = {
  pulse: ['v1', 'v2', 'td', 'tr', 'tf', 'pw', 'per'],
  sin: ['vo', 'va', 'freq', 'td', 'theta']
}

type Analisis = Extract<DirectivaAjena, { tipo: 'analisis' }>

export function leerSpice(texto: string, nombre: string): CircuitoAjeno {
  const piezas: PiezaAjena[] = []
  const redes = new Map<string, RedAjena>()
  const instrumentos: InstrumentoAjeno[] = []
  const directivas: DirectivaAjena[] = []
  const avisos: string[] = []
  const params: Record<string, string> = {}
  const lineaDe = new Map<string, number>()
  const modelos = new Map<string, string>()
  const subcircuitos = new Map<string, string[]>()
  const acoplamientos: { n: number; l1: string; l2: string; k: string }[] = []
  const trazasPendientes: { n: number; tipo?: string; trazas: string[] }[] = []
  const aviso = (n: number, m: string): void => void avisos.push(`Línea ${n}: ${m}`)
  const lineas = dividirLineas(texto, aviso)

  /** Registra el pin en su red por nombre de nodo (sin distinguir mayúsculas) y devuelve el nombre de la red. */
  function conectar(ref: string, nodos: string[], nombres: (string | undefined)[]): PinAjeno[] {
    return nodos.map((nodo, i) => {
      const clave = esTierra(nodo) ? '0' : nodo.toLowerCase()
      let r = redes.get(clave)
      if (!r) redes.set(clave, (r = { nombre: clave === '0' ? '0' : nodo, pines: [] }))
      r.pines.push({ ref, pin: String(i + 1) })
      return { numero: String(i + 1), ...(nombres[i] !== undefined ? { nombre: nombres[i] } : {}) }
    })
  }
  const nombreRed = (nodo: string): string => (esTierra(nodo) ? '0' : (redes.get(nodo.toLowerCase())?.nombre ?? nodo))

  function trazasDe(n: number, resto: string): string[] {
    const out: string[] = []
    for (const m of resto.matchAll(/(?<![a-z0-9_])(vdb|vm|vp|vr|vi|v|i)\(([^()]{0,200})\)/gi)) {
      const f = (m[1] as string).toLowerCase()
      const args = (m[2] as string).split(',').map((s) => s.trim())
      const a = args[0] ?? ''
      if (!a) continue
      if (f === 'i') out.push(`i(${a})`)
      else {
        out.push(a)
        if (args.length > 1) aviso(n, `la traza ${m[0]} es diferencial y se guardó como «${a}».`)
      }
    }
    return out
  }

  function fuente(l: Linea, toks: string[], ref: string, letra: string): void {
    const nodos = toks.slice(1, 3)
    const props: Record<string, string> = {}
    let dc: string | undefined
    let forma: string | undefined
    let args: string[] = []
    const rest = toks.slice(3)
    for (let i = 0; i < rest.length; i++) {
      const t = rest[i] as string
      const k = t.toLowerCase()
      if (k === 'dc') dc = rest[++i]
      else if (k === 'ac') {
        props.ac = rest[++i] ?? ''
        if (rest[i + 1] !== undefined && numeroSpice(rest[i + 1] as string) !== null && !FUNCIONES.includes((rest[i + 1] as string).toLowerCase())) props.fase = rest[++i] as string
      } else if (FUNCIONES.includes(k)) {
        forma = k
        args = []
        while (i + 1 < rest.length && !['dc', 'ac', ...FUNCIONES].includes((rest[i + 1] as string).toLowerCase())) args.push(rest[++i] as string)
      } else if (dc === undefined && !forma) dc = t
    }
    if (dc !== undefined) props.dc = dc
    if (forma) props.forma = forma
    const pieza: PiezaAjena = { ref, tipo: letra, ...(dc !== undefined ? { valor: dc } : {}), props, pines: conectar(ref, nodos, ['+', '−']) }
    if (forma === 'pwl' || forma === 'exp') props[forma] = args.join(' ')
    piezas.push(pieza)
    const campos = forma ? CAMPOS_FUENTE[forma] : undefined
    if (letra === 'V' && forma && campos) {
      const parametros: Record<string, number | string> = {}
      campos.forEach((c, i) => {
        if (args[i] !== undefined) parametros[c] = valorONumero(args[i] as string)
      })
      instrumentos.push({
        tipo: 'generador',
        forma: forma === 'pulse' ? 'pulso' : 'senoidal',
        nombre: ref,
        red: nombreRed(nodos[0] as string),
        referencia: nombreRed(nodos[1] as string),
        parametros
      })
    } else if (forma && !campos) aviso(l.n, `la fuente ${ref} con forma ${forma.toUpperCase()} se guardó como propiedad, sin generador.`)
  }

  function elemento(l: Linea): void {
    const toks = tokens(l.texto)
    // Una línea solo de paréntesis o comas no deja ningún elemento.
    if (!toks.length) return
    const ref = toks[0] as string
    const letra = ref[0]?.toUpperCase() ?? ''
    const falta = (n: number): boolean => {
      if (toks.length > n) return false
      aviso(l.n, `al elemento «${ref}» le faltan datos y se omitió.`)
      return true
    }
    const props: Record<string, string> = {}
    const posicionales: string[] = []
    const desde = (i: number): string[] => {
      posicionales.length = 0
      for (const t of toks.slice(i)) {
        const e = t.indexOf('=')
        if (e > 0) props[t.slice(0, e).toLowerCase()] = t.slice(e + 1)
        else posicionales.push(t)
      }
      return posicionales
    }
    const alta = (p: Omit<PiezaAjena, 'ref' | 'props'> & { props?: Record<string, string> }): void => {
      piezas.push({ ref, ...p, props: { ...props, ...p.props } })
      lineaDe.set(ref, l.n)
    }
    switch (letra) {
      case 'R':
      case 'C':
      case 'L': {
        if (falta(2)) return
        const pos = desde(3)
        let modelo: string | undefined
        let valor: string | undefined = props[letra.toLowerCase()] ?? pos[0]
        if (props[letra.toLowerCase()] === undefined && pos[0] !== undefined && numeroSpice(pos[0]) === null && pos[1] !== undefined) {
          modelo = pos[0]
          valor = pos[1]
        }
        delete props[letra.toLowerCase()]
        alta({ tipo: letra, ...(valor !== undefined ? { valor } : {}), ...(modelo ? { modelo } : {}), pines: conectar(ref, toks.slice(1, 3), ['1', '2']) })
        return
      }
      case 'D': {
        if (falta(2)) return
        const pos = desde(3)
        if (pos[1] !== undefined) props.area = pos[1]
        alta({ tipo: 'D', ...(pos[0] ? { modelo: pos[0] } : {}), pines: conectar(ref, toks.slice(1, 3), ['A', 'K']) })
        return
      }
      case 'Q': {
        if (falta(4)) return
        const resto = toks.slice(1).filter((t) => !t.includes('='))
        // Tras el modelo pueden venir el área y `off`: no son el nodo del sustrato.
        const cuatro = resto.length >= 5 && numeroSpice(resto[4] as string) === null && !['off', 'area'].includes((resto[4] as string).toLowerCase())
        const n = cuatro ? 4 : 3
        desde(1 + n + 1)
        const modelo = resto[n]
        alta({ tipo: 'Q', ...(modelo ? { modelo } : {}), pines: conectar(ref, resto.slice(0, n), NOMBRES_Q.slice(0, n)) })
        return
      }
      case 'M': {
        if (falta(5)) return
        desde(6)
        alta({ tipo: 'M', modelo: toks[5] as string, pines: conectar(ref, toks.slice(1, 5), ['D', 'G', 'S', 'B']) })
        return
      }
      case 'J': {
        if (falta(4)) return
        const pos = desde(5)
        if (pos[0] !== undefined) props.area = pos[0]
        alta({ tipo: 'J', modelo: toks[4] as string, pines: conectar(ref, toks.slice(1, 4), ['D', 'G', 'S']) })
        return
      }
      case 'V':
      case 'I':
        if (falta(2)) return
        fuente(l, toks, ref, letra)
        lineaDe.set(ref, l.n)
        return
      case 'E':
      case 'G': {
        if (falta(4)) return
        const pos = desde(5)
        if (pos[0] && ['poly', 'value', 'table'].includes(pos[0].toLowerCase())) props.expresion = l.texto.split(/\s+/).slice(5).join(' ')
        alta({ tipo: letra, ...(pos[0] && !props.expresion ? { valor: pos[0] } : {}), pines: conectar(ref, toks.slice(1, 5), ['+', '−', 'C+', 'C−']) })
        return
      }
      case 'F':
      case 'H': {
        if (falta(3)) return
        const pos = desde(4)
        alta({ tipo: letra, ...(pos[0] ? { valor: pos[0] } : {}), props: { controladora: toks[3] as string }, pines: conectar(ref, toks.slice(1, 3), ['+', '−']) })
        return
      }
      case 'B': {
        if (falta(2)) return
        alta({ tipo: 'B', props: { expresion: l.texto.split(/\s+/).slice(3).join(' ') }, pines: conectar(ref, toks.slice(1, 3), ['+', '−']) })
        return
      }
      case 'X': {
        const cola = toks.slice(1)
        const ip = cola.findIndex((t) => t.toLowerCase() === 'params:' || t.includes('='))
        const antes = (ip >= 0 ? cola.slice(0, ip) : cola).filter((t) => t.toLowerCase() !== 'params:')
        if (antes.length < 2) {
          aviso(l.n, `al elemento «${ref}» le faltan datos y se omitió.`)
          return
        }
        desde(1 + antes.length)
        const sub = antes[antes.length - 1] as string
        const nodos = antes.slice(0, -1)
        alta({ tipo: sub, pines: conectar(ref, nodos, nodos.map(() => undefined)) })
        return
      }
      case 'K':
        if (falta(3)) return
        acoplamientos.push({ n: l.n, l1: toks[1] as string, l2: toks[2] as string, k: toks[3] as string })
        return
      default:
        aviso(l.n, `no se reconoció el elemento «${ref}».`)
    }
  }

  function modelo(toks: string[]): void {
    const [, nom, tipo, ...rest] = toks
    if (!nom || !tipo) return
    const parametros: Record<string, number | string> = {}
    for (const t of rest) {
      const e = t.indexOf('=')
      if (e > 0) parametros[t.slice(0, e).toLowerCase()] = valorONumero(t.slice(e + 1))
    }
    const clase = tipo.toLowerCase()
    modelos.set(nom.toLowerCase(), clase)
    directivas.push({ tipo: 'modelo', nombre: nom, clase, parametros })
  }

  function analisis(l: Linea, toks: string[]): void {
    const num = (i: number): number | string | undefined => (toks[i] !== undefined ? valorONumero(toks[i] as string) : undefined)
    const parametros: Record<string, number | string> = {}
    const poner = (clave: string, v: number | string | undefined): void => {
      if (v !== undefined) parametros[clave] = v
    }
    const cmd = (toks[0] as string).toLowerCase()
    let tipo: Analisis['analisis']
    let trazas: string[] = []
    if (cmd === '.op') tipo = 'op'
    else if (cmd === '.dc') {
      tipo = 'dc'
      poner('fuente', toks[1])
      poner('inicio', num(2))
      poner('fin', num(3))
      poner('paso', num(4))
      if (toks.length > 5) aviso(l.n, 'el barrido .dc anidado se leyó solo en su primera fuente.')
    } else if (cmd === '.tran') {
      tipo = 'tran'
      poner('paso', num(1))
      poner('fin', num(2))
      const pos = toks.slice(3).filter((t) => t.toLowerCase() !== 'uic')
      poner('inicio', pos[0] !== undefined ? valorONumero(pos[0]) : undefined)
      poner('max', pos[1] !== undefined ? valorONumero(pos[1]) : undefined)
      if (toks.some((t, i) => i > 2 && t.toLowerCase() === 'uic')) parametros.uic = 1
    } else if (cmd === '.ac') {
      tipo = 'ac'
      poner('tipo', toks[1]?.toLowerCase())
      poner('puntos', num(2))
      poner('fi', num(3))
      poner('ff', num(4))
    } else {
      tipo = 'fourier'
      poner('f', num(1))
      trazas = trazasDe(l.n, l.texto.split(/\s+/).slice(2).join(' '))
    }
    directivas.push({ tipo: 'analisis', analisis: tipo, parametros, trazas })
  }

  let sub: { nombre: string; nodos: string[]; cuerpo: string[]; prof: number } | null = null
  let enControl = false
  for (const l of lineasLogicas(lineas)) {
    const t = l.texto
    const primero = (t.split(/\s+/)[0] as string).toLowerCase()
    if (enControl) {
      if (primero === '.endc') enControl = false
      continue
    }
    if (sub) {
      if (primero === '.ends') {
        if (--sub.prof === 0) {
          directivas.push({ tipo: 'subcircuito', nombre: sub.nombre, nodos: sub.nodos, cuerpo: sub.cuerpo.join('\n') })
          subcircuitos.set(sub.nombre.toLowerCase(), sub.nodos)
          sub = null
          continue
        }
      } else if (primero === '.subckt') sub.prof++
      sub.cuerpo.push(t)
      continue
    }
    if (primero === '.end') break
    if (!primero.startsWith('.')) {
      elemento(l)
      continue
    }
    const toks = tokens(t)
    switch (primero) {
      case '.control':
        enControl = true
        aviso(l.n, 'se ignoró el bloque .control, que corre órdenes propias de ngspice.')
        break
      case '.endc':
        aviso(l.n, 'se ignoró un .endc sin su .control.')
        break
      case '.ends':
        aviso(l.n, 'se ignoró un .ends sin su .subckt.')
        break
      case '.subckt': {
        const ip = toks.findIndex((x, i) => i > 1 && (x.toLowerCase() === 'params:' || x.includes('=')))
        sub = { nombre: toks[1] ?? '', nodos: toks.slice(2, ip >= 0 ? ip : undefined), cuerpo: [], prof: 1 }
        break
      }
      case '.model':
        modelo(toks)
        break
      case '.param':
      case '.params':
        for (const m of unir(t).matchAll(/([A-Za-z_]\w*)=(\S+)/g)) params[m[1] as string] = (m[2] as string).replace(/^\{|\}$/g, '')
        break
      case '.op':
      case '.dc':
      case '.tran':
      case '.ac':
      case '.four':
      case '.fourier':
        analisis(l, toks)
        break
      case '.print':
      case '.plot':
      case '.probe':
      case '.meas':
      case '.measure': {
        const tipo = ['tran', 'ac', 'dc', 'op'].find((x) => x === toks[1]?.toLowerCase())
        const trazas = trazasDe(l.n, t)
        if (trazas.length) trazasPendientes.push({ n: l.n, ...(tipo ? { tipo } : {}), trazas })
        break
      }
      case '.include':
      case '.inc':
      case '.lib':
      case '.options':
      case '.option':
      case '.temp':
      case '.ic':
      case '.nodeset':
      case '.global':
      case '.save':
      case '.width':
        directivas.push({ tipo: 'otra', texto: t })
        break
      default:
        directivas.push({ tipo: 'otra', texto: t })
        aviso(l.n, `no se reconoció la directiva ${primero}.`)
    }
  }
  if (sub) aviso(lineas.length, `el subcircuito «${(sub as { nombre: string }).nombre}» no termina con .ends y se omitió.`)

  const inductores = new Map<string, PiezaAjena>()
  for (const p of piezas) if (p.tipo === 'L' && !inductores.has(p.ref.toLowerCase())) inductores.set(p.ref.toLowerCase(), p)
  for (const a of acoplamientos) {
    const buscar = (r: string): PiezaAjena | undefined => inductores.get(r.toLowerCase())
    const p1 = buscar(a.l1)
    const p2 = buscar(a.l2)
    if (!p1 || !p2) {
      aviso(a.n, `el acoplamiento entre ${a.l1} y ${a.l2} nombra un inductor que no existe y se omitió.`)
      continue
    }
    p1.props.acoplamiento = a.k
    p2.props.acoplamiento = a.k
    aviso(a.n, `el acoplamiento entre ${p1.ref} y ${p2.ref} (${a.k}) se guardó como propiedad de los dos inductores.`)
  }

  for (const p of piezas) {
    const clase = p.modelo ? modelos.get(p.modelo.toLowerCase()) : undefined
    if (clase) p.props.tipoModelo = clase
    const nodos = p.tipo.length > 0 && subcircuitos.get(p.tipo.toLowerCase())
    if (nodos) p.pines.forEach((pin, i) => void (nodos[i] !== undefined && (pin.nombre = nodos[i])))
    const usados = new Set<string>()
    for (const v of [p.valor ?? '', ...Object.values(p.props)])
      for (const w of v.matchAll(/[A-Za-z_]\w*/g)) if (Object.keys(params).some((k) => k.toLowerCase() === w[0].toLowerCase())) usados.add(w[0])
    for (const u of usados) aviso(lineaDe.get(p.ref) ?? 0, `${p.ref} usa el parámetro «${u}» (.param) y su valor no se evaluó.`)
  }

  for (const tp of trazasPendientes) {
    const destino = directivas.filter((d): d is Analisis => d.tipo === 'analisis' && (tp.tipo ? d.analisis === tp.tipo : d.analisis !== 'op' && d.analisis !== 'fourier'))
    if (!destino.length) aviso(tp.n, 'las trazas pedidas no tienen un análisis del mismo tipo y se omitieron.')
    for (const d of destino) for (const z of tp.trazas) if (!d.trazas.includes(z)) d.trazas.push(z)
  }

  return {
    formato: 'spice',
    nombre,
    piezas,
    redes: [...redes.values()],
    instrumentos,
    directivas,
    avisos,
    ...(Object.keys(params).length ? { params } : {})
  }
}
