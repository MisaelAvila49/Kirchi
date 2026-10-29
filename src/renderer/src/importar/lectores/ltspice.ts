import type { CircuitoAjeno, DibujoAjeno, PiezaAjena, PuntoAjeno, RedAjena, TerminalAjena } from '../ajeno'
import { dividirLineas } from './lineas'
import { unirPuntosEnCables } from './segmentos'
import { leerSpice } from './spice'
import { normalizarNombre, parteDeAmpOp, pinesColocados, simboloLtspice, type GiroLtspice } from './ltspiceSimbolos'

interface Segmento {
  x1: number
  y1: number
  x2: number
  y2: number
}

const clave = (x: number, y: number): string => `${x},${y}`

/** Unión-búsqueda sobre puntos de la hoja. */
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

const sinComillas = (s: string): string => s.trim().replace(/^"(.*)"$/s, '$1').trim()
const esNumero = (s: string): boolean => /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?[a-zµμ]*$/i.test(s.trim())

interface SimboloLeido {
  n: number
  tipo: string
  x: number
  y: number
  giro: GiroLtspice
  espejo: boolean
  attrs: Record<string, string>
}

export function leerLtspice(texto: string, nombre: string): CircuitoAjeno {
  const avisos: string[] = []
  const aviso = (n: number, m: string): void => void avisos.push(`Línea ${n}: ${m}`)
  const lineas = dividirLineas(texto, aviso)
  const cables: Segmento[] = []
  const flags: { nombre: string; x: number; y: number }[] = []
  const iopins: { x: number; y: number; dir: string }[] = []
  const simbolos: SimboloLeido[] = []
  const textos: DibujoAjeno['textos'] = []
  const directivas: { x: number; y: number; texto: string }[] = []
  let version: string | undefined
  let actual: SimboloLeido | null = null

  lineas.forEach((raw, i) => {
    const n = i + 1
    const l = raw.trim()
    if (!l) return
    const t = l.split(/\s+/)
    const num = (k: number): number => Number(t[k])
    switch (t[0]) {
      case 'Version':
        version = t[1]
        break
      case 'WIRE':
        if (t.length >= 5 && [1, 2, 3, 4].every((k) => Number.isFinite(num(k)))) cables.push({ x1: num(1), y1: num(2), x2: num(3), y2: num(4) })
        else aviso(n, 'un cable no trae sus cuatro coordenadas y se omitió.')
        break
      case 'FLAG':
        if (Number.isFinite(num(1)) && Number.isFinite(num(2)) && t[3] !== undefined) flags.push({ x: num(1), y: num(2), nombre: t.slice(3).join(' ') })
        else aviso(n, 'una etiqueta de red está incompleta y se omitió.')
        break
      case 'IOPIN':
        if (Number.isFinite(num(1)) && Number.isFinite(num(2))) iopins.push({ x: num(1), y: num(2), dir: t[3] ?? 'BiDir' })
        break
      case 'SYMBOL': {
        const r = /^([RM])(0|90|180|270)$/.exec(t[4] ?? 'R0')
        if (!t[1] || !Number.isFinite(num(2)) || !Number.isFinite(num(3))) {
          aviso(n, 'un símbolo está incompleto y se omitió.')
          actual = null
          break
        }
        actual = { n, tipo: normalizarNombre(t[1]), x: num(2), y: num(3), giro: Number(r?.[2] ?? 0) as GiroLtspice, espejo: r?.[1] === 'M', attrs: {} }
        simbolos.push(actual)
        break
      }
      case 'SYMATTR':
        if (actual && t[1]) actual.attrs[t[1].toLowerCase()] = l.replace(/^SYMATTR\s+\S+\s?/, '')
        break
      case 'TEXT': {
        const m = /^TEXT\s+(-?\d+)\s+(-?\d+)\s+\S+\s+\d+\s*(.*)$/.exec(l)
        if (!m) break
        const [x, y, cuerpo] = [Number(m[1]), Number(m[2]), m[3] as string]
        // Las directivas y los comentarios traen `\n` literal para varias líneas.
        const partes = cuerpo.split('\\n')
        if (cuerpo.startsWith('!')) for (const p of partes) directivas.push({ x, y, texto: p.replace(/^!/, '') })
        else textos.push({ texto: partes.map((p) => p.replace(/^;/, '')).join('\n'), x, y })
        break
      }
      default:
        // WINDOW, LINE, RECTANGLE, CIRCLE, ARC, DATAFLAG y SHEET son dibujo o presentación.
        break
    }
  })

  const piezas: PiezaAjena[] = []
  const usados = new Set<string>()
  for (const s of simbolos) {
    const ref = s.attrs.instname?.trim() || `X${piezas.length + 1}`
    if (usados.has(ref)) aviso(s.n, `la referencia «${ref}» está repetida.`)
    usados.add(ref)
    const def = simboloLtspice(s.tipo)
    const valor = s.attrs.value?.trim()
    const modeloAttr = s.attrs.spicemodel ? sinComillas(s.attrs.spicemodel) : ''
    const parte = parteDeAmpOp(s.tipo)
    const modelo = modeloAttr || (def?.valorEsModelo && valor ? valor : '') || (def && !def.valorEsModelo && parte ? parte : '')
    const props: Record<string, string> = {}
    if (s.attrs.value2) props.value2 = s.attrs.value2.trim()
    if (s.attrs.spiceline) props.spiceLine = s.attrs.spiceline.trim()
    if (s.attrs.spiceline2) props.spiceLine2 = s.attrs.spiceline2.trim()
    if (s.attrs.prefix) props.prefix = s.attrs.prefix.trim()
    const usaValor = valor && !(def?.valorEsModelo && !esNumero(valor))
    piezas.push({
      ref,
      tipo: s.tipo,
      ...(usaValor ? { valor } : {}),
      ...(modelo ? { modelo } : {}),
      props,
      x: s.x,
      y: s.y,
      // Antihorario visto en pantalla: R90 de LTspice gira en sentido horario.
      giro: (360 - s.giro) % 360,
      ...(s.espejo ? { espejoX: true } : {}),
      pines: def ? pinesColocados(def, s.x, s.y, s.giro, s.espejo) : []
    })
    if (!def) aviso(s.n, `el símbolo «${s.tipo}» (${ref}) no está en la tabla de pines y se leyó sin conexiones.`)
    else if (!def.medido) aviso(s.n, `la posición de los pines de «${s.tipo}» (${ref}) no se verificó contra un esquema real.`)
  }

  // Redes: los cables unen sus extremos y todo punto que cae dentro de un cable.
  const u = new Uniones()
  const puntos = new Map<string, PuntoAjeno>()
  const alta = (x: number, y: number): string => {
    const k = clave(x, y)
    puntos.set(k, { x, y })
    u.raiz(k)
    return k
  }
  for (const c of cables) u.unir(alta(c.x1, c.y1), alta(c.x2, c.y2))
  for (const f of flags) alta(f.x, f.y)
  for (const p of piezas) for (const pin of p.pines) alta(pin.x as number, pin.y as number)
  unirPuntosEnCables(
    [...puntos.values()].map((p) => ({ ...p, clave: clave(p.x, p.y) })),
    cables.map((c) => ({ ...c, clave: clave(c.x1, c.y1) })),
    (p, c) => u.unir(p, c)
  )
  // Dos etiquetas con el mismo nombre son la misma red.
  const porNombre = new Map<string, string>()
  for (const f of flags) {
    const k = clave(f.x, f.y)
    const previo = porNombre.get(f.nombre.toLowerCase())
    if (previo) u.unir(previo, k)
    else porNombre.set(f.nombre.toLowerCase(), k)
  }
  const nombreDeRaiz = new Map<string, string>()
  for (const f of flags) {
    const r = u.raiz(clave(f.x, f.y))
    const previo = nombreDeRaiz.get(r)
    if (previo === undefined || (f.nombre === '0' && previo !== '0')) nombreDeRaiz.set(r, f.nombre)
    else if (previo !== f.nombre && previo !== '0' && f.nombre !== '0') avisos.push(`Una red lleva dos nombres, «${previo}» y «${f.nombre}»; se conserva «${previo}».`)
  }
  const conCable = new Set<string>()
  for (const c of cables) conCable.add(u.raiz(clave(c.x1, c.y1)))
  const redesPorRaiz = new Map<string, RedAjena>()
  for (const p of piezas)
    for (const pin of p.pines) {
      const r = u.raiz(clave(pin.x as number, pin.y as number))
      let red = redesPorRaiz.get(r)
      if (!red) redesPorRaiz.set(r, (red = { pines: [] }))
      red.pines.push({ ref: p.ref, pin: pin.numero as string })
    }
  // Las redes sin etiqueta se numeran (N001...) en el orden en que aparecen sus pines, como hace LTspice.
  const redes: RedAjena[] = []
  let auto = 0
  const nombreAuto = (): string => `N${String(++auto).padStart(3, '0')}`
  for (const [r, red] of redesPorRaiz) {
    const etiqueta = nombreDeRaiz.get(r)
    // Un pin suelto, sin cable ni nombre, no forma red.
    if (etiqueta === undefined && red.pines.length < 2 && !conCable.has(r)) continue
    red.nombre = etiqueta ?? nombreAuto()
    redes.push(red)
  }
  const nombreDe = (x: number, y: number): string => {
    const r = u.raiz(clave(x, y))
    return redesPorRaiz.get(r)?.nombre ?? nombreDeRaiz.get(r) ?? nombreAuto()
  }

  // Directivas y fuentes: se arma un texto SPICE mínimo y se pasa por el lector SPICE.
  const sinteticas: string[] = ['* LTspice']
  const origen: string[] = ['']
  for (const p of piezas) {
    if (p.tipo.toLowerCase() !== 'voltage' || p.pines.length < 2) continue
    const [a, b] = p.pines.map((pin) => nombreDe(pin.x as number, pin.y as number))
    sinteticas.push(`${p.ref} ${a} ${b} ${(p.valor ?? '0').replace(/\bSINE\b/gi, 'SIN')}`)
    origen.push(`la fuente ${p.ref}`)
  }
  for (const d of directivas) {
    sinteticas.push(d.texto)
    origen.push(`el texto en (${d.x}, ${d.y})`)
  }
  const spice = leerSpice(sinteticas.join('\n'), nombre)
  for (const a of spice.avisos) {
    const m = /^Línea (\d+): (.*)$/s.exec(a)
    avisos.push(m ? `En ${origen[Number(m[1]) - 1] ?? 'una directiva'}: ${m[2]}` : a)
  }

  const terminales: TerminalAjena[] = [
    ...flags.filter((f) => f.nombre === '0').map((f): TerminalAjena => ({ nombre: '0', tipo: 'tierra', x: f.x, y: f.y })),
    ...iopins.map((io): TerminalAjena => ({ nombre: io.dir, tipo: io.dir === 'In' ? 'entrada' : io.dir === 'Out' ? 'salida' : 'otra', x: io.x, y: io.y }))
  ]
  const dibujo: DibujoAjeno = {
    cables: cables.map((c) => [{ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }]),
    uniones: [],
    etiquetas: flags.filter((f) => f.nombre !== '0').map((f) => ({ nombre: f.nombre, x: f.x, y: f.y })),
    terminales,
    textos
  }

  return {
    formato: 'ltspice',
    ...(version ? { version } : {}),
    nombre,
    piezas,
    redes,
    dibujo,
    instrumentos: spice.instrumentos.filter((i) => i.tipo === 'generador'),
    directivas: spice.directivas,
    ...(spice.params ? { params: spice.params } : {}),
    avisos
  }
}
