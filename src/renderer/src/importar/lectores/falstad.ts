import type { CircuitoAjeno, DibujoAjeno, DirectivaAjena, InstrumentoAjeno, PinAjeno, PiezaAjena, PuntoAjeno, RedAjena } from '../ajeno'
import { dividirLineas } from './lineas'
import { unirPuntosEnCables } from './segmentos'

/** Píxeles de Falstad que caben en un milímetro: 16 px (una celda) son 2.5 mm de Kirchi. */
const UNIDADES_POR_MM = 16 / 2.5

/** Líneas que no son elementos y por tanto no cuentan en el índice que usan `o` y `38`. */
const NO_ELEMENTO = new Set(['$', 'o', 'h', '38', '%', '?', '&', '\\'])

/** Prefijo de la referencia que se inventa (Falstad no las tiene). */
const PREFIJO: Record<string, string> = {
  r: 'R', c: 'C', l: 'L', d: 'D', z: 'DZ', '162': 'LED', t: 'Q', f: 'M', j: 'J', a: 'U',
  v: 'V', R: 'V', i: 'I', s: 'SW', S: 'SW', '174': 'RV', g: 'GND',
  '150': 'U', '151': 'U', '152': 'U', '153': 'U', '154': 'U', I: 'U', L: 'IN', M: 'OUT', '172': 'V'
}

const LETRAS = 'ABCDEFGH'

const FORMAS = ['cd', 'senoidal', 'cuadrada', 'triangular', 'diente', 'pulso', 'ruido', 'variable']

interface Pt {
  x: number
  y: number
}

interface Elemento {
  n: number
  codigo: string
  a: Pt
  b: Pt
  flags: number
  t: string[]
  /** Puntos que el osciloscopio mira para este elemento. */
  mira: Pt[]
}

/** Cables oblicuos que se revisan contra todos los puntos. */
const MAX_OBLICUOS = 500
const clave = (p: Pt): string => `${p.x},${p.y}`
const signo = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0)
const redondear = (v: number): number => Math.floor(v + 0.48)
const num = (t: string | undefined): number | undefined => {
  if (t === undefined) return undefined
  const v = Number(t)
  return t.trim() !== '' && Number.isFinite(v) ? v : undefined
}
/** Valor tal como lo escribe el archivo, normalizado a número cuando lo es. */
const valorDe = (t: string | undefined): string | undefined => (t === undefined ? undefined : String(num(t) ?? t))
/** Falstad escapa espacios y saltos en sus textos. */
const desescapar = (s: string): string => s.replace(/\\(s|n|r|q|\\)/g, (_, c: string) => ({ s: ' ', n: '\n', r: '\r', q: '"', '\\': '\\' })[c] as string)

/** Los dos extremos desplazados a lados opuestos del eje: el lado positivo es (dy, -dx) / largo, como en CircuitJS. */
function lados(a: Pt, b: Pt, f: number, g: number): [Pt, Pt] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dn = Math.hypot(dx, dy) || 1
  const px = a.x + (b.x - a.x) * f
  const py = a.y + (b.y - a.y) * f
  return [
    { x: redondear(px + (g * dy) / dn), y: redondear(py - (g * dx) / dn) },
    { x: redondear(px - (g * dy) / dn), y: redondear(py + (g * dx) / dn) }
  ]
}

/** Punto a la fracción `f` del eje, desplazado `g` hacia el lado positivo, como interpPoint de CircuitJS. */
function punto(a: Pt, b: Pt, f: number, g: number): Pt {
  return lados(a, b, f, g)[0]
}

export function leerFalstad(texto: string, nombre: string): CircuitoAjeno {
  const avisos: string[] = []
  const aviso = (n: number, m: string): void => void avisos.push(`Línea ${n}: ${m}`)
  const lineas = dividirLineas(texto, aviso)
  const piezas: PiezaAjena[] = []
  const elementos: Elemento[] = []
  const cables: { a: Pt; b: Pt }[] = []
  const textos: DibujoAjeno['textos'] = []
  const terminales: DibujoAjeno['terminales'] = []
  const contador = new Map<string, number>()
  const puntos = new Map<string, Pt>()
  const sondas: { n: number; nombre: string; p: Pt }[] = []
  const generadores: { ref: string; forma: string; params: Record<string, number | string>; plus: Pt; menos: Pt | null }[] = []
  const osciloscopios: { n: number; elm: number }[] = []
  const deslizadores: { n: number; elm: number; item: number; min: string; max: string; etiqueta: string }[] = []
  let paso: number | undefined
  const tierras: Pt[] = []

  const registrar = (p: Pt): void => void puntos.set(clave(p), p)
  const referencia = (codigo: string): string => {
    const pre = Object.hasOwn(PREFIJO, codigo) ? (PREFIJO[codigo] as string) : 'X'
    const k = (contador.get(pre) ?? 0) + 1
    contador.set(pre, k)
    return `${pre}${k}`
  }

  lineas.forEach((raw, i) => {
    const n = i + 1
    const linea = raw.trim()
    if (!linea) return
    const t = linea.split(/\s+/)
    const codigo = t[0] as string
    if (codigo === '$') {
      paso = num(t[2])
      return
    }
    if (codigo === 'o') {
      const elm = num(t[1])
      if (elm === undefined) aviso(n, 'el osciloscopio no indica qué elemento muestra y se omitió.')
      else osciloscopios.push({ n, elm })
      return
    }
    if (codigo === '38' || codigo === '&') {
      const [elm, item] = [num(t[1]), num(t[2])]
      if (elm === undefined || item === undefined) aviso(n, 'el deslizador está incompleto y se omitió.')
      else deslizadores.push({ n, elm, item, min: t[3] ?? '', max: t[4] ?? '', etiqueta: desescapar(t.slice(5).join(' ')) })
      return
    }
    if (NO_ELEMENTO.has(codigo)) return

    const [x1, y1, x2, y2] = [num(t[1]), num(t[2]), num(t[3]), num(t[4])]
    const flags = Number.parseInt(t[5] ?? '0', 10)
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
      aviso(n, `el elemento «${codigo}» no trae sus coordenadas y se omitió.`)
      // Ocupa su lugar en el índice para que `o` y `38` sigan apuntando bien.
      elementos.push({ n, codigo, a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, flags: 0, t, mira: [] })
      return
    }
    const a: Pt = { x: x1, y: y1 }
    const b: Pt = { x: x2, y: y2 }
    const el: Elemento = { n, codigo, a, b, flags: Number.isNaN(flags) ? 0 : flags, t, mira: [] }
    elementos.push(el)
    const par = t.slice(6)
    const dx = x2 - x1
    const dy = y2 - y1
    // En vertical el lado se toma al revés que en horizontal: así los ejemplos reales (el reductor con el MOSFET de arriba) quedan con su fuente donde van.
    const dsign = dy === 0 ? signo(dx) : signo(dy)
    const giro = (((Math.round((Math.atan2(-dy, dx) * 180) / Math.PI) % 360) + 360) % 360)

    if (codigo === 'w') {
      cables.push({ a, b })
      registrar(a)
      registrar(b)
      el.mira = [a]
      return
    }
    if (codigo === 'x') {
      textos.push({ texto: desescapar(t.slice(7).join(' ')), x: x1, y: y1 })
      return
    }
    if (codigo === 'p' || codigo === 'O') {
      sondas.push({ n, nombre: `${codigo === 'p' ? 'P' : 'S'}${sondas.length + 1}`, p: a })
      registrar(a)
      el.mira = [a]
      return
    }

    const pines: PinAjeno[] = []
    const props: Record<string, string> = {}
    let valor: string | undefined
    let modelo: string | undefined
    const pin = (p: Pt, nom?: string): void => {
      pines.push({ numero: String(pines.length + 1), ...(nom !== undefined ? { nombre: nom } : {}), x: p.x, y: p.y })
      registrar(p)
    }
    let mira: Pt[] | undefined

    switch (codigo) {
      case 'g':
        pin(a)
        tierras.push(a)
        break
      case 'r':
        valor = valorDe(par[0])
        pin(a)
        pin(b)
        break
      case 'c': {
        valor = valorDe(par[0])
        const v0 = valorDe(par[2])
        if (v0 !== undefined) props.vInicial = v0
        pin(a)
        pin(b)
        break
      }
      case 'l':
        valor = valorDe(par[0])
        pin(a)
        pin(b)
        break
      case 'd':
        if (par[0] && par[0] !== 'default') modelo = par[0]
        pin(a, 'A')
        pin(b, 'K')
        break
      case 'z':
        valor = valorDe(par[1])
        if (par[0] !== undefined) props.caida = valorDe(par[0]) as string
        pin(a, 'A')
        pin(b, 'K')
        break
      case '162':
        if (par[0] !== undefined) props.caida = valorDe(par[0]) as string
        pin(a, 'A')
        pin(b, 'K')
        break
      case 'i':
        valor = valorDe(par[0])
        pin(a)
        pin(b)
        break
      case 't': {
        const pnp = num(par[0]) === -1 ? -1 : 1
        props.pnp = String(pnp)
        const beta = valorDe(par[3])
        if (beta !== undefined) props.beta = beta
        if (par[4] && par[4] !== 'default') modelo = par[4]
        const [c, e] = lados(a, b, 1, 16 * dsign * pnp)
        pin(c, 'C')
        pin(a, 'B')
        pin(e, 'E')
        break
      }
      case 'f':
      case 'j': {
        const p = (el.flags & 1) !== 0
        props.canal = p ? 'p' : 'n'
        if (codigo === 'f') {
          const vt = valorDe(par[0])
          if (vt !== undefined) props.vt = vt
          const beta = valorDe(par[1])
          if (beta !== undefined) props.beta = beta
        }
        const hs2 = 16 * dsign * ((el.flags & 8) !== 0 ? -1 : 1)
        const [fuente, drenaje] = lados(a, b, 1, -hs2)
        // En el canal P el símbolo trae la fuente en el otro extremo.
        pin(p ? drenaje : fuente, 'S')
        pin(a, 'G')
        pin(p ? fuente : drenaje, 'D')
        // El orden SPICE es D, G, S.
        pines.reverse()
        pines.forEach((q, k) => (q.numero = String(k + 1)))
        break
      }
      case 'a': {
        const alto = (el.flags & 2) !== 0 ? 8 : 16
        const hs = alto * dsign * ((el.flags & 1) !== 0 ? -1 : 1)
        const [menos, mas] = lados(a, b, 0, hs)
        pin(menos, '-')
        pin(mas, '+')
        pin(b, 'salida')
        mira = [b]
        break
      }
      case 'v':
      case 'R': {
        const forma = Math.trunc(num(par[0]) ?? 0)
        const f = num(par[1]) ?? 0
        const amp = num(par[2]) ?? 0
        const off = num(par[3]) ?? 0
        const fase = num(par[4]) ?? 0
        const duty = num(par[5])
        props.forma = FORMAS[forma] ?? String(forma)
        props.amplitud = String(amp)
        if (forma === 0) valor = String(amp)
        else {
          props.frecuencia = String(f)
          props.offset = String(off)
          props.fase = String(Math.round(((fase * 180) / Math.PI) * 1000) / 1000)
          if (duty !== undefined && (forma === 2 || forma === 5)) props.ciclo = String(duty)
          const params: Record<string, number | string> = { forma: FORMAS[forma] ?? String(forma), frecuencia: f, amplitud: amp, offset: off, fase: Number(props.fase) }
          if (props.ciclo) params.ciclo = Number(props.ciclo)
          // Nombre de la pieza: aún no se asigna, se completa más abajo.
          generadores.push({ ref: '', forma: forma === 1 ? 'senoidal' : forma === 5 ? 'pulso' : 'otra', params, plus: codigo === 'v' ? b : a, menos: codigo === 'v' ? a : null })
        }
        if (codigo === 'v') {
          // El terminal positivo de CircuitJS es el segundo extremo.
          pin(b, '+')
          pin(a, '−')
        } else {
          pin(a)
          if (forma === 0) terminales.push({ nombre: `${valor}V`, tipo: 'alimentacion', x: a.x, y: a.y, giro })
        }
        break
      }
      case '150':
      case '151':
      case '152':
      case '153':
      case '154': {
        const entradas = Math.min(8, Math.max(1, Math.trunc(num(par[0]) ?? 2)))
        props.entradas = String(entradas)
        // Con el bit de tamaño pequeño las entradas van a 8 px en vez de 16.
        const hs = (el.flags & 1) !== 0 ? 8 : 16
        let i0 = -Math.trunc(entradas / 2)
        for (let k = 0; k < entradas; k++, i0++) {
          if (i0 === 0 && entradas % 2 === 0) i0++
          pin(punto(a, b, 0, hs * i0), LETRAS[k])
        }
        pin(b, 'Y')
        break
      }
      case 'I':
        pin(a, 'A')
        pin(b, 'Y')
        break
      case 'L': {
        // El estado llega como true/false (versiones nuevas) o como 0/1 en la primera posición.
        const estado = par.find((x) => x === 'true' || x === 'false')
        props.estado = estado === 'true' || (estado === undefined && num(par[0]) === 1) ? '1' : '0'
        pin(a, 'Y')
        break
      }
      case 'M':
        pin(a, 'A')
        break
      case '172': {
        // Riel con deslizador: el valor actual es el segundo campo.
        valor = valorDe(par[1])
        props.forma = 'cd'
        if (valor !== undefined) props.amplitud = valor
        pin(a)
        if (valor !== undefined) terminales.push({ nombre: `${valor}V`, tipo: 'alimentacion', x: a.x, y: a.y, giro })
        break
      }
      case 's':
        // Posición 0 es cerrado, 1 abierto.
        props.cerrado = num(par[0]) === 1 ? '0' : '1'
        pin(a)
        pin(b)
        break
      case 'S': {
        props.posicion = String(Math.trunc(num(par[0]) ?? 0))
        const [t0, t1] = lados(a, b, 1, 16)
        pin(a, 'común')
        pin(t0, '1')
        pin(t1, '2')
        break
      }
      case '174': {
        const R = valorDe(par[0])
        if (R !== undefined) valor = R
        const pos = valorDe(par[1])
        if (pos !== undefined) props.posicion = pos
        const [cursor] = lados(a, b, 0.5, 16 * dsign)
        pin(a)
        pin(b)
        pin(cursor, 'cursor')
        break
      }
      default:
        aviso(n, `el elemento «${codigo}» no se reconoce y se guardó como pieza genérica.`)
        props.parametros = par.join(' ')
        pin(a)
        pin(b)
    }

    const ref = referencia(codigo)
    if (generadores.length && generadores[generadores.length - 1]!.ref === '' && (codigo === 'v' || codigo === 'R')) generadores[generadores.length - 1]!.ref = ref
    el.mira = mira ?? pines.map((q) => ({ x: q.x as number, y: q.y as number }))
    piezas.push({
      ref,
      tipo: codigo,
      ...(valor !== undefined ? { valor } : {}),
      ...(modelo !== undefined ? { modelo } : {}),
      props,
      x: (x1 + x2) / 2,
      y: (y1 + y2) / 2,
      giro,
      pines
    })
    // Guardamos la referencia en el elemento para localizar la pieza por índice.
    ;(el as Elemento & { ref?: string }).ref = ref
  })

  // Conexión por puntos coincidentes (unión-búsqueda): un cable une sus extremos y un punto sobre el interior de un cable se une a él.
  const padre = new Map<string, string>()
  const raiz = (k: string): string => {
    let r = k
    while ((padre.get(r) ?? r) !== r) r = padre.get(r) as string
    for (let c = k; c !== r; ) {
      const s = padre.get(c) as string
      padre.set(c, r)
      c = s
    }
    return r
  }
  const unir = (p: Pt, q: Pt): void => void padre.set(raiz(clave(p)), raiz(clave(q)))
  for (const k of puntos.keys()) padre.set(k, k)
  for (const c of cables) unir(c.a, c.b)
  const uniones: PuntoAjeno[] = []
  const sobre = new Set<string>()
  const grado = new Map<string, number>()
  const sumar = (p: Pt): void => void grado.set(clave(p), (grado.get(clave(p)) ?? 0) + 1)
  for (const c of cables) {
    sumar(c.a)
    sumar(c.b)
  }
  for (const p of piezas) for (const q of p.pines) sumar({ x: q.x as number, y: q.y as number })
  // Rectos (casi todos): barrido por fila o columna. Los oblicuos se prueban uno a uno y con tope, por ser cuadrático.
  const rectos = cables.filter((c) => c.a.x === c.b.x || c.a.y === c.b.y)
  const oblicuos = cables.filter((c) => c.a.x !== c.b.x && c.a.y !== c.b.y)
  unirPuntosEnCables(
    [...puntos.values()].map((p) => ({ ...p, clave: clave(p) })),
    rectos.map((c) => ({ x1: c.a.x, y1: c.a.y, x2: c.b.x, y2: c.b.y, clave: clave(c.a) })),
    (p, c) => void padre.set(raiz(p), raiz(c)),
    (p) => void sobre.add(p)
  )
  if (oblicuos.length > MAX_OBLICUOS) avisos.push(`El esquema trae ${oblicuos.length} cables oblicuos; solo se revisaron los primeros ${MAX_OBLICUOS} para unir puntos sobre ellos.`)
  for (const c of oblicuos.slice(0, MAX_OBLICUOS)) {
    const cx = c.b.x - c.a.x
    const cy = c.b.y - c.a.y
    for (const q of puntos.values()) {
      if (clave(q) === clave(c.a) || clave(q) === clave(c.b)) continue
      const px = q.x - c.a.x
      const py = q.y - c.a.y
      if (cx * py - cy * px !== 0) continue
      const u = px * cx + py * cy
      if (u <= 0 || u >= cx * cx + cy * cy) continue
      unir(q, c.a)
      sobre.add(clave(q))
    }
  }
  for (const [k, g] of grado) if (g >= 3 || (g >= 1 && sobre.has(k))) uniones.push(puntos.get(k) as Pt)

  // Nombres de red: la de las tierras es 0, las demás N1, N2... por orden de aparición.
  const grupos = new Map<string, RedAjena>()
  const tierra = new Set(tierras.map((p) => raiz(clave(p))))
  let k = 0
  for (const p of piezas)
    for (const q of p.pines) {
      const r = raiz(clave({ x: q.x as number, y: q.y as number }))
      let red = grupos.get(r)
      if (!red) grupos.set(r, (red = { nombre: tierra.has(r) ? '0' : `N${++k}`, pines: [] }))
      red.pines.push({ ref: p.ref, pin: q.numero as string })
    }
  const nombreDe = (p: Pt): string | undefined => grupos.get(raiz(clave(p)))?.nombre

  const instrumentos: InstrumentoAjeno[] = []
  for (const s of sondas) {
    const red = nombreDe(s.p)
    if (red === undefined) aviso(s.n, 'la sonda no toca ninguna pieza y se omitió.')
    else instrumentos.push({ tipo: 'sonda', magnitud: 'voltaje', nombre: s.nombre, red, x: s.p.x, y: s.p.y })
  }
  for (const g of generadores) {
    const red = nombreDe(g.plus)
    if (red === undefined) continue
    instrumentos.push({ tipo: 'generador', forma: g.forma as 'senoidal' | 'pulso' | 'otra', nombre: g.ref, red, referencia: g.menos ? (nombreDe(g.menos) ?? '0') : '0', parametros: g.params })
  }

  if (osciloscopios.length) {
    const redes: string[] = []
    for (const o of osciloscopios) {
      const el = elementos[o.elm]
      if (!el) {
        aviso(o.n, `el osciloscopio muestra el elemento ${o.elm}, que no existe.`)
        continue
      }
      for (const p of el.mira) {
        const r = nombreDe(p)
        if (r !== undefined && r !== '0' && !redes.includes(r)) redes.push(r)
      }
    }
    if (redes.length) instrumentos.push({ tipo: 'virtual', clase: 'osciloscopio', nombre: 'Osciloscopio', redes })
    else aviso(osciloscopios[0]!.n, 'el osciloscopio no muestra ninguna red y se omitió.')
  }

  // Un deslizador ajusta un parámetro de un elemento: el valor ya está en el elemento y el rango queda anotado.
  const piezaPorRef = new Map(piezas.map((p) => [p.ref, p]))
  for (const d of deslizadores) {
    const el = elementos[d.elm] as (Elemento & { ref?: string }) | undefined
    const pieza = el?.ref ? piezaPorRef.get(el.ref) : undefined
    if (!pieza) {
      aviso(d.n, `el deslizador «${d.etiqueta}» apunta al elemento ${d.elm}, que no es una pieza, y se omitió.`)
      continue
    }
    pieza.props[`deslizador ${d.etiqueta}`] = `${d.min} a ${d.max}`
    if (!/duty|ciclo|freq|frecuen|volt|resist|capac|induc|amplit|offset|bias/i.test(d.etiqueta))
      aviso(d.n, `el deslizador «${d.etiqueta}» de ${pieza.ref} se anotó como propiedad sin aplicarse.`)
  }

  const directivas: DirectivaAjena[] = []
  if (osciloscopios.length && paso !== undefined && paso > 0) {
    const trazas = (instrumentos.find((i) => i.tipo === 'virtual') as { redes: string[] } | undefined)?.redes ?? []
    directivas.push({ tipo: 'analisis', analisis: 'tran', parametros: { paso, fin: paso * 1000 }, trazas: [...trazas] })
  }

  return {
    formato: 'falstad',
    nombre,
    unidadesPorMm: UNIDADES_POR_MM,
    piezas,
    redes: [...grupos.values()],
    dibujo: {
      cables: cables.map((c) => [c.a, c.b]),
      uniones,
      etiquetas: [],
      terminales,
      textos
    },
    instrumentos,
    directivas,
    avisos
  }
}
