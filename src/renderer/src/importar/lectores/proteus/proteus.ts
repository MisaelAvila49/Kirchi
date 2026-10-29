import type { CircuitoAjeno, DibujoAjeno, DirectivaAjena, InstrumentoAjeno, PinAjeno, PiezaAjena, RedAjena, TerminalAjena } from '../../ajeno'
import { numeroSpice } from '../spice'
import { cadenaBinaria, leerHojas, type ObjetoDsn } from './dsn'
import { Simbolos } from './simbolos'
import { abrirProyecto } from './zip'

/** 1 unidad del archivo son 10 nm. */
const UNIDADES_POR_MM = 100000
/** Propiedades que no aportan al convertidor; las demás pasan con tope. */
const PROPS_OMITIDAS = new Set(['PRIMITIVE', 'MODFILE', 'VALUE', 'PACKAGE'])
const MAX_PROPS = 40
const MAX_VALOR_PROP = 200
const ALIMENTACION = /^([+-]?\d+(\.\d+)?V?|V[+-]|V(CC|DD|EE|SS|BB|PP)\d*|GND)$/i

type Cable = Extract<ObjetoDsn, { tipo: 'cable' }>
type Generador = Extract<ObjetoDsn, { tipo: 'generador' | 'sonda' }>

const grados = (decimas: number): number => (((decimas / 10) % 360) + 360) % 360

/** Pares `{CLAVE=valor}` del texto de propiedades. */
function propiedades(texto: string): Record<string, string> {
  const r: Record<string, string> = {}
  for (const m of texto.matchAll(/\{([A-Za-z0-9_$.]+)=([^}]*)\}/g)) r[m[1].toUpperCase()] = m[2]
  return r
}

/** Número con sufijo SPICE (`1u`, `20`, `2.5k`); undefined si no lo es. */
function numero(t: string | undefined): number | undefined {
  if (t === undefined) return undefined
  return numeroSpice(t.replace(/s+/g, '')) ?? undefined
}

const numOTexto = (t: string): number | string => numero(t) ?? t

function parametrosDeGenerador(forma: 'pulso' | 'senoidal' | 'cd' | 'otra', p: Record<string, string>): Record<string, number | string> {
  const o: Record<string, number | string> = {}
  const pon = (clave: string, de: string): void => {
    if (p[de] !== undefined && p[de] !== '') o[clave] = numOTexto(p[de])
  }
  if (forma === 'pulso') {
    for (const k of ['v1', 'v2', 'td', 'tr', 'tf']) pon(k, k.toUpperCase())
    pon('per', 'PER')
    if (o.per === undefined && numero(p.FREQ)) o.per = 1 / (numero(p.FREQ) as number)
    const pw = p.PW
    if (pw !== undefined && pw.trim().endsWith('%')) {
      const pct = Number.parseFloat(pw)
      o.pwPorcentaje = pct
      if (typeof o.per === 'number') o.pw = (o.per * pct) / 100
    } else pon('pw', 'PW')
  } else if (forma === 'senoidal') {
    pon('amplitud', 'AMP')
    pon('offset', 'OFFSET')
    pon('frecuencia', 'FREQ')
    pon('fase', 'PHASE')
    pon('theta', 'THETA')
  } else if (forma === 'cd') pon('valor', 'VALUE')
  else for (const [k, v] of Object.entries(p)) if (!PROPS_OMITIDAS.has(k) && k !== 'MANUALEDITS' && k !== 'HIDDENPROPS') o[k.toLowerCase()] = numOTexto(v)
  return o
}

/** Instrumentos virtuales de Proteus, por el nombre de su modelo o de su dispositivo. */
function claseVirtual(texto: string): 'voltimetro' | 'amperimetro' | 'osciloscopio' | 'otro' | null {
  const t = texto.toUpperCase().replace(/[^A-Z]/g, '')
  if (/^I?(DC|AC)(VMETER|VOLTMETER)/.test(t)) return 'voltimetro'
  if (/^I?(DC|AC)(IMETER|AMMETER|AMPMETER)/.test(t)) return 'amperimetro'
  if (t === 'DSO' || t.startsWith('OSCILLOSCOPE')) return 'osciloscopio'
  if (/ANALYSER|ANALYZER|VIRTUALTERMINAL|DEBUGGER|COUNTERTIMER|PATTERNGENERATOR/.test(t)) return 'otro'
  return null
}

function tipoTerminal(t: Extract<ObjetoDsn, { tipo: 'terminal' }>): TerminalAjena['tipo'] {
  const d = t.dispositivo.toUpperCase()
  if (d.includes('GROUND')) return 'tierra'
  if (ALIMENTACION.test(t.nombre.trim())) return 'alimentacion'
  if (d === '$TERINPUT') return 'entrada'
  if (d === '$TEROUTPUT') return 'salida'
  return 'otra'
}

export function leerProteus(bytes: Uint8Array, nombre: string): CircuitoAjeno {
  const proyecto = abrirProyecto(bytes)
  const d = proyecto.dsn
  const s = cadenaBinaria(d)
  const avisos: string[] = []
  if (!s.startsWith('ISIS SCHEMATIC FILE')) throw new Error('El esquema del proyecto no tiene el formato de Proteus 8.')
  const cabecera = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const release = proyecto.release ?? (d.length > 0xa9 ? cabecera.getUint16(0xa7, true) : undefined)
  const filever = d.length > 0xab ? cabecera.getUint16(0xa9, true) : (proyecto.filever ?? 830)
  const version = release ? `${String(release)[0]}.${String(release).slice(1)}` : undefined
  if (release !== undefined && (release < 805 || release > 817)) avisos.push(`La versión ${version} de Proteus no se ha probado.`)

  const hojas = leerHojas(d, s, filever)
  hojas.forEach((h, i) => {
    if (h.error) avisos.push(`No se pudo leer la hoja ${i + 1}: ${h.error}.`)
  })
  const objetos = hojas.flatMap((h) => h.objetos)
  const simbolos = new Simbolos(d, s)

  // Conectividad: cada cable es un nodo y las uniones, sondas de voltaje y nombres iguales los juntan.
  const padre = new Map<number, number>()
  const raiz = (a: number): number => {
    let r = a
    while ((padre.get(r) ?? r) !== r) r = padre.get(r) as number
    for (let x = a; x !== r; ) {
      const sig = padre.get(x) as number
      padre.set(x, r)
      x = sig
    }
    padre.set(r, r)
    return r
  }
  const une = (a: number, b: number): void => void padre.set(raiz(a), raiz(b))
  const cables = new Map<number, Cable>()
  for (const o of objetos) if (o.tipo === 'cable') cables.set(o.desp, o)
  const porNombre = new Map<string, number>()
  const nombrar = (clave: string, cable: number): void => {
    const previo = porNombre.get(clave)
    if (previo === undefined) porNombre.set(clave, cable)
    else une(cable, previo)
  }
  /** Nombre elegido para una red: el primero que le puso una terminal o una etiqueta. */
  const nombreDeRaiz = new Map<number, string>()
  const ocurrencias = new Map<string, number>()

  for (const o of objetos) {
    if (o.tipo === 'union') {
      const c = o.cables.filter((x) => x !== 0)
      for (const x of c.slice(1)) une(x, c[0])
    } else if (o.tipo === 'sonda' && !o.dispositivo.toUpperCase().includes('IPROBE')) {
      const c = o.alambres.filter((x) => x !== 0)
      for (const x of c.slice(1)) une(x, c[0])
    } else if (o.tipo === 'terminal') {
      const tierra = o.dispositivo.toUpperCase().includes('GROUND')
      const clave = tierra ? 'GND' : o.nombre || o.dispositivo
      ocurrencias.set(clave, (ocurrencias.get(clave) ?? 0) + 1)
      if (o.cable !== 0) nombrar(clave, o.cable)
    } else if (o.tipo === 'cable') {
      for (const e of o.etiquetas) {
        if (e.texto === '') continue
        ocurrencias.set(e.texto, (ocurrencias.get(e.texto) ?? 0) + 1)
        nombrar(e.texto, o.desp)
      }
    }
  }
  // Los nombres se asignan con las raíces finales; la tierra manda sobre cualquier otro nombre.
  for (const [clave, cable] of porNombre) if (clave !== 'GND' && !nombreDeRaiz.has(raiz(cable))) nombreDeRaiz.set(raiz(cable), clave)
  for (const [clave, cable] of porNombre) if (clave === 'GND') nombreDeRaiz.set(raiz(cable), '0')

  const usados = new Set(nombreDeRaiz.values())
  let n = 0
  const nombreDeRed = (cable: number): string => {
    const r = raiz(cable)
    let v = nombreDeRaiz.get(r)
    if (v === undefined) {
      do v = `N${++n}`
      while (usados.has(v))
      usados.add(v)
      nombreDeRaiz.set(r, v)
    }
    return v
  }

  // Piezas e instrumentos virtuales.
  const piezas: PiezaAjena[] = []
  const instrumentos: InstrumentoAjeno[] = []
  const redes = new Map<number, RedAjena>()
  const componentes = objetos.filter((o): o is Extract<ObjetoDsn, { tipo: 'componente' }> => o.tipo === 'componente')
  const cuentaRef = new Map<string, number>()
  for (const c of componentes) {
    const base = (c.ref ?? '').split(':')[0]
    cuentaRef.set(base, (cuentaRef.get(base) ?? 0) + 1)
  }
  const sinSimbolo = new Map<string, number>()
  const conteoDistinto: string[] = []
  const fuera: string[] = []
  let sinReferencia = 0
  // Las hojas de un proyecto reutilizan referencias (`U4` es una AND en una y un 74125 en otra): cada chip distinto con la misma
  // referencia lleva un sufijo, y las unidades A, B... de un mismo chip comparten la suya.
  const chips = new Map<string, { tipo: string; unidades: Set<string> }[]>()
  const refDeChip = (ref: string, unidad: string | undefined, tipo: string): string => {
    const lista = chips.get(ref) ?? chips.set(ref, []).get(ref)!
    let k = unidad === undefined ? -1 : lista.findIndex((x) => x.tipo === tipo && x.unidades.size > 0 && !x.unidades.has(unidad))
    if (k < 0) k = lista.push({ tipo, unidades: new Set() }) - 1
    if (unidad !== undefined) lista[k]!.unidades.add(unidad)
    return k === 0 ? ref : `${ref}_${k + 1}`
  }
  for (const c of componentes) {
    const props = propiedades(c.props)
    const virtual = claseVirtual(props.ACTIVE ?? props.MODFILE ?? c.dispositivo) ?? claseVirtual(c.dispositivo)
    const nombreInst = c.ref || c.valor || c.dispositivo
    if (virtual) {
      const conectados = c.pines.filter((x) => x !== 0)
      const nombres = [...new Set(conectados.map(nombreDeRed))].filter((x) => x !== '0')
      if (virtual === 'otro') avisos.push(`El instrumento virtual ${nombreInst} (${c.dispositivo}) no tiene equivalente y no se importó.`)
      else instrumentos.push({ tipo: 'virtual', clase: virtual, nombre: nombreInst, redes: nombres })
      continue
    }
    let ref = c.ref ?? ''
    let unidad: string | undefined
    const dos = ref.lastIndexOf(':')
    if (dos > 0) {
      unidad = ref.slice(dos + 1)
      ref = ref.slice(0, dos)
    }
    if (ref === '') ref = `?${++sinReferencia}`
    const mu = (cuentaRef.get(ref) ?? 1) > 1
    ref = refDeChip(ref, unidad, c.dispositivo)
    const pos = simbolos.posiciones(c.dispositivo, c.x, c.y, c.giro, c.banderas)
    const pines: PinAjeno[] = []
    if (!pos) sinSimbolo.set(c.dispositivo, (sinSimbolo.get(c.dispositivo) ?? 0) + 1)
    else {
      if (pos.length !== c.pines.length && unidad === undefined) conteoDistinto.push(ref)
      pos.forEach(({ pin, x, y }, i) => {
        pines.push({ ...(pin.nombre ? { nombre: pin.nombre } : {}), ...(pin.numero ? { numero: pin.numero } : {}), x, y })
        const cable = c.pines[i]
        if (cable === undefined || cable === 0) return
        const w = cables.get(cable)
        const v = w?.vertices
        if (!v || !v.length || !((v[0].x === x && v[0].y === y) || (v[v.length - 1].x === x && v[v.length - 1].y === y))) fuera.push(`${ref}.${pin.nombre || pin.numero}`)
        const r = raiz(cable)
        let red = redes.get(r)
        if (!red) redes.set(r, (red = { nombre: nombreDeRed(cable), pines: [] }))
        // Con varias unidades del mismo código, el nombre del pin se repite entre compuertas: el número las distingue.
        // Los números de pin se repiten entre las unidades de una misma referencia: la unidad va en la referencia de la red.
        red.pines.push({ ref: unidad !== undefined ? `${ref}:${unidad}` : ref, pin: (mu ? pin.numero || pin.nombre : pin.nombre || pin.numero) || String(i + 1) })
      })
    }
    const extra: Record<string, string> = {}
    for (const [k, v] of Object.entries(props)) {
      if (PROPS_OMITIDAS.has(k) || Object.keys(extra).length >= MAX_PROPS) continue
      extra[k] = v.slice(0, MAX_VALOR_PROP)
    }
    // Potenciómetros: POS (por ciento, POT-HG) manda sobre STATE (pasos del 10 %); 0 es el cursor junto a la patilla 1.
    if (/^POT(-|$)/i.test(c.dispositivo)) {
      const crudo = props.POS ?? (props.STATE !== undefined ? String(Number(props.STATE) * 10) : undefined)
      const n = crudo === undefined ? NaN : Number(crudo)
      if (Number.isFinite(n)) extra.posicion = String(Math.min(1, Math.max(0, n / 100)))
    }
    piezas.push({
      ref,
      tipo: c.dispositivo,
      ...(c.valor ? { valor: c.valor } : {}),
      ...(props.SPICEMODEL ? { modelo: props.SPICEMODEL } : {}),
      props: extra,
      ...(unidad ? { unidad } : {}),
      x: c.x,
      y: c.y,
      giro: grados(c.giro),
      espejoX: (c.banderas & 1) !== 0,
      espejoY: (c.banderas & 2) !== 0,
      pines
    })
  }
  if (sinSimbolo.size) avisos.push(`No se encontró el símbolo de ${[...sinSimbolo].map(([k, v]) => `${k} (${v})`).join(', ')}; sus pines no se leyeron.`)
  if (conteoDistinto.length) avisos.push(`Piezas con distinto número de pines que su símbolo: ${resumir(conteoDistinto)}.`)
  if (fuera.length) avisos.push(`Pines que no coinciden con el extremo de su cable: ${resumir(fuera)}.`)

  // Generadores y sondas.
  const red = (a: number, b: number): string | undefined => {
    const c = a !== 0 ? a : b
    return c === 0 ? undefined : nombreDeRed(c)
  }
  const redDe = new Map<string, string>()
  const gens = objetos.filter((o): o is Generador => o.tipo === 'generador' || o.tipo === 'sonda')
  for (const o of gens) {
    if (o.tipo === 'sonda') {
      const r = red(o.alambres[0], o.alambres[1])
      const corriente = o.dispositivo.toUpperCase().includes('IPROBE')
      if (r !== undefined) redDe.set(o.ident, r)
      instrumentos.push({ tipo: 'sonda', magnitud: corriente ? 'corriente' : 'voltaje', nombre: o.nombre || o.ident, ...(r !== undefined ? { red: r } : {}), x: o.x, y: o.y })
      continue
    }
    const disp = o.dispositivo.toUpperCase()
    const forma = disp.includes('PULSEGEN') ? 'pulso' : disp.includes('SINEGEN') ? 'senoidal' : disp.includes('DCGEN') ? 'cd' : 'otra'
    const r = o.alambres[0] !== 0 ? nombreDeRed(o.alambres[0]) : undefined
    if (r === undefined) {
      avisos.push(`El generador ${o.nombre || o.ident} no está conectado y no se importó.`)
      continue
    }
    redDe.set(o.ident, r)
    if (forma === 'otra') avisos.push(`El generador ${o.nombre || o.ident} es de un tipo (${o.dispositivo}) sin equivalente directo; se conservan sus parámetros.`)
    instrumentos.push({ tipo: 'generador', forma, nombre: o.nombre || o.ident, red: r, referencia: o.alambres[1] !== 0 ? nombreDeRed(o.alambres[1]) : '0', parametros: parametrosDeGenerador(forma, propiedades(o.props)) })
  }

  // Gráficas: la analógica con eje de tiempo es un transitorio; las demás quedan como directiva sin convertir.
  const directivas: DirectivaAjena[] = []
  for (const o of objetos) {
    if (o.tipo !== 'grafica') continue
    if (o.titulo.toUpperCase().includes('ANALOGUE') || o.ejeX.toUpperCase() === 'TIME') {
      const trazas: string[] = []
      for (const t of o.trazas) {
        const r = redDe.get(t.ident)
        if (r === undefined) avisos.push(`La traza ${t.nombre || t.expresion} de la gráfica ${o.titulo} no se refiere a una sonda o generador del esquema.`)
        else if (!trazas.includes(r)) trazas.push(r)
      }
      directivas.push({ tipo: 'analisis', analisis: 'tran', parametros: { inicio: o.inicio, fin: o.fin }, trazas, nombre: o.titulo })
    } else directivas.push({ tipo: 'otra', texto: `Gráfica ${o.titulo}` })
  }

  // Dibujo.
  const dibujo: DibujoAjeno = { cables: [], uniones: [], etiquetas: [], terminales: [], textos: [] }
  for (const o of objetos) {
    if (o.tipo === 'cable') {
      if (!o.bus && o.vertices.some((v) => v.x !== o.vertices[0].x || v.y !== o.vertices[0].y)) dibujo.cables.push(o.vertices.map((v) => ({ x: v.x, y: v.y })))
      for (const e of o.etiquetas) if (e.texto) dibujo.etiquetas.push({ nombre: e.texto, x: e.x, y: e.y })
    } else if (o.tipo === 'union') {
      if (o.cables.filter((x) => x !== 0).length >= 3) dibujo.uniones.push({ x: o.x, y: o.y })
    } else if (o.tipo === 'terminal') {
      const tipo = tipoTerminal(o)
      dibujo.terminales.push({ nombre: tipo === 'tierra' ? (o.nombre || 'GND') : o.nombre, tipo, x: o.x, y: o.y, giro: grados(o.giro) })
    }
  }
  const textos = objetos.filter((o) => o.tipo === 'texto').length
  if (textos) avisos.push(`${textos === 1 ? 'Un bloque de texto o script del esquema no se importó' : `${textos} bloques de texto o script del esquema no se importaron`}.`)

  // Jerarquía: las hojas se aplanan y se unen por el nombre de sus terminales y etiquetas.
  const subcircuitos = objetos.filter((o) => o.tipo === 'subcircuito').length
  const conObjetos = hojas.filter((h) => h.objetos.some((o) => o.tipo === 'componente' || o.tipo === 'terminal')).length
  if (subcircuitos || conObjetos > 1) avisos.push('Las hojas del proyecto se aplanaron: se unieron por el nombre de sus terminales y etiquetas, sin jerarquía.')
  const sueltos = new Set<string>()
  for (const o of objetos) if (o.tipo === 'terminal' && o.dispositivo.toUpperCase().startsWith('$SCP') && o.nombre && ocurrencias.get(o.nombre) === 1) sueltos.add(o.nombre)
  if (sueltos.size) avisos.push(`Puertos de subcircuito sin pareja en otra hoja: ${resumir([...sueltos])}.`)

  const listaRedes = [...redes.values()]
  return {
    formato: 'proteus',
    ...(version ? { version } : {}),
    nombre,
    unidadesPorMm: UNIDADES_POR_MM,
    yHaciaArriba: true,
    piezas,
    redes: listaRedes,
    dibujo,
    instrumentos,
    directivas,
    avisos
  }
}

/** Los primeros nombres de una lista larga, para que un aviso no ocupe la pantalla. */
function resumir(l: string[]): string {
  return l.length <= 6 ? l.join(', ') : `${l.slice(0, 6).join(', ')} y ${l.length - 6} más`
}
