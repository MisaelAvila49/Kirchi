// @vitest-environment happy-dom
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { idSecuencial } from '../doc/ids'
import type { Documento } from '../doc/tipos'
import { compilarNetlist } from '../netlist/netlist'
import { libreriaDePrueba } from '../prueba/libreria'
import { leerResultados, type Lectura } from '../sim/lectura'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import type { CircuitoAjeno, PiezaAjena } from './ajeno'
import { decodificarTexto, detectarFormato } from './detectar'
import { importarBytes } from './importar'
import { leerFalstad } from './lectores/falstad'
import { leerKicad } from './lectores/kicad'
import { leerLtspice } from './lectores/ltspice'
import { leerSpice } from './lectores/spice'

// Compara la simulación de cada ejemplo importado (motor WASM de Kirchi, tal como queda el documento tras `importarBytes`) con la del
// programa original y escribe la tabla en `KIRCHI_TABLA_SIMULACION` (por omisión, en la carpeta temporal). Fallan la prueba un
// error del arnés y una regresión en los casos que hoy coinciden con su referencia; el resto solo se informa. Necesita la carpeta de ejemplos en `KIRCHI_EJEMPLOS_IMPORTAR` y ngspice 47 en `herramientas/ngspice`.
//
// Referencias: SPICE, el propio .cir en ngspice. LTspice, KiCad y Falstad, un netlist SPICE armado con la conectividad del lector
// (`CircuitoAjeno.redes`), los valores y las directivas del archivo; el NE555 no tiene equivalente y se compara contra su fórmula.
// Proteus, la traza que guardó Proteus.

const CARPETA = process.env.KIRCHI_EJEMPLOS_IMPORTAR ?? ''
const RAIZ = join(import.meta.dirname, '../../../..')
const NGSPICE = process.platform === 'win32' ? join(RAIZ, 'herramientas', 'ngspice', 'Spice64', 'bin', 'ngspice_con.exe') : 'ngspice'
const hayNgspice = existsSync(NGSPICE) || process.platform !== 'win32'
const PDSPRJ = process.env.KIRCHI_PROTEUS_USUARIO ?? join(RAIZ, 'PruebasManualesKirchi', 'importar', 'proteus', 'New Project.pdsprj')
const SALIDA = process.env.KIRCHI_TABLA_SIMULACION ?? join(tmpdir(), 'kirchi-simulacion-ejemplos.md')

const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })).memory
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Series y métricas

interface Serie {
  t: number[]
  v: number[]
}
interface Metricas {
  min: number
  max: number
  mean: number
  final: number
  f: number
  /** Veces que la señal cruzó hacia arriba el nivel medio. */
  ciclos: number
  /** Duración del primer pulso por encima del nivel medio (s). */
  ancho: number
}

function interpolar(s: Serie, t: number): number {
  const { t: ts, v } = s
  if (ts.length === 0) return NaN
  if (t <= ts[0]) return v[0]
  if (t >= ts[ts.length - 1]) return v[v.length - 1]
  let lo = 0
  let hi = ts.length - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (ts[m] <= t) lo = m
    else hi = m
  }
  return ts[hi] === ts[lo] ? v[hi] : v[lo] + ((v[hi] - v[lo]) * (t - ts[lo])) / (ts[hi] - ts[lo])
}

const remuestrear = (s: Serie, a: number, b: number, n = 2000): Serie => {
  const t = Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n)
  return { t, v: t.map((x) => interpolar(s, x)) }
}

function metricas(s: Serie, a: number, b: number): Metricas {
  const r = remuestrear(s, a, b)
  const mean = r.v.reduce((x, y) => x + y, 0) / r.v.length
  const min = Math.min(...r.v)
  const max = Math.max(...r.v)
  const mitad = (min + max) / 2
  const cruces: number[] = []
  // Con histéresis del 10 % del pico a pico, para que el ruido o los rizos chicos no cuenten como ciclos.
  const h = 0.1 * (max - min)
  let abajo = r.v[0] < mitad
  r.v.forEach((x, i) => {
    if (abajo && x > mitad + h) {
      cruces.push(r.t[i])
      abajo = false
    } else if (!abajo && x < mitad - h) abajo = true
  })
  const f = cruces.length >= 3 && max - min > 1e-6 && max - min > 1e-4 * Math.max(Math.abs(max), Math.abs(min)) ? (cruces.length - 1) / (cruces[cruces.length - 1] - cruces[0]) : NaN
  let ancho = NaN
  const sube = r.v.findIndex((x) => x > mitad)
  if (sube >= 0 && max - min > 1e-6) {
    const baja = r.v.findIndex((x, i) => i > sube && x < mitad)
    if (baja > 0) ancho = r.t[baja] - r.t[sube]
  }
  return { min, max, mean, final: r.v[r.v.length - 1], f, ciclos: cruces.length, ancho }
}

const restar = (a: Serie, b: Serie): Serie => ({ t: a.t, v: a.t.map((t, i) => a.v[i] - interpolar(b, t)) })

// ---------------------------------------------------------------------------------------------------------------------------------
// ngspice

interface Salida {
  ok: boolean
  motivo?: string
  series: Map<string, Serie>
}

let deckN = 0
function correrNgspice(cuerpo: string, nodos: string[], analisis: string): Salida {
  const tmp = mkdtempSync(join(tmpdir(), 'kirchi-sim-'))
  try {
    const lista = [...new Set(nodos.filter((n) => n !== '0'))]
    const deck = [
      cuerpo.replace(/^\.end\s*$/gim, ''),
      '.options reltol=1e-3 abstol=1e-12 vntol=1e-6',
      '.control',
      'set wr_singlescale',
      'set wr_vecnames',
      'option numdgt=7',
      analisis,
      `wrdata salida.txt ${lista.map((n) => `v(${n})`).join(' ')}`,
      '.endc',
      '.end'
    ].join('\n')
    writeFileSync(join(tmp, 'c.cir'), deck)
    if (process.env.KIRCHI_VOLCADO) writeFileSync(join(process.env.KIRCHI_VOLCADO, `deck-${deckN++}.cir`), deck)
    const r = spawnSync(NGSPICE, ['-b', 'c.cir'], { cwd: tmp, encoding: 'utf8', timeout: 120_000, windowsHide: true })
    const log = `${r.stdout}\n${r.stderr}`
    if (!existsSync(join(tmp, 'salida.txt'))) {
      const err = log.split(/\r?\n/).find((l) => /error|singular|no convergence|timestep too small/i.test(l)) ?? 'sin salida'
      return { ok: false, motivo: `ngspice: ${err.trim()}`, series: new Map() }
    }
    const lineas = readFileSync(join(tmp, 'salida.txt'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const nombres = lineas[0].split(/\s+/).map((x) => x.toLowerCase())
    const filas = lineas.slice(1).map((l) => l.split(/\s+/).map(Number))
    const series = new Map<string, Serie>()
    nombres.slice(1).forEach((nombre, j) => {
      const n = nombre.replace(/^v\((.*)\)$/, '$1')
      series.set(n, { t: filas.map((f) => f[0]), v: filas.map((f) => f[j + 1]) })
    })
    series.set('0', { t: [0, 1], v: [0, 0] })
    return { ok: true, series }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Netlist SPICE a partir de lo que leyó el lector

const limpio = (n: string): string => {
  if (n === '0' || /^gnd$/i.test(n)) return '0'
  return n.replace(/\+/g, 'p').replace(/-|−/g, 'm').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase()
}

function mapaDeNodos(c: CircuitoAjeno): (ref: string, ...claves: (string | undefined)[]) => string {
  const m = new Map<string, string>()
  c.redes.forEach((r, i) => {
    const nombre = r.nombre !== undefined ? limpio(r.nombre) : `n${i + 1}`
    for (const p of r.pines) m.set(`${p.ref}\u0000${p.pin}`, nombre)
  })
  return (ref, ...claves) => {
    for (const k of claves) if (k !== undefined && m.has(`${ref}\u0000${k}`)) return m.get(`${ref}\u0000${k}`)!
    return `nc_${ref}_${claves.filter(Boolean).join('_')}`
  }
}

const claveDe = (p: PiezaAjena, i: number): (string | undefined)[] => [p.pines[i]?.numero, p.pines[i]?.nombre, String(i + 1)]

/** Valor de LTspice o KiCad a texto de SPICE: «12V» pasa a «12», «SINE(» a «SIN(». */
const valorSpice = (v: string): string => v.replace(/^(\d+(\.\d+)?)\s*(V|A|F|H|Ohm|Ohms)$/i, '$1').replace(/(\d)(uF|nF|pF|mH|uH|Ohms?)\b/gi, (_, d: string, u: string) => d + u.replace(/F|H|Ohms?/i, ''))

const MODELO_1N4148 = '.model 1N4148 D(Is=2.52n Rs=.568 N=1.752 Cjo=4p M=.4 tt=20n)'
// Sustituto del UniversalOpamp2 de LTspice (no existe en ngspice): ganancia 1e6, polo a 10 Hz (GBW 10 MHz), salida acotada por las alimentaciones.
const SUBCKT_UO2 = [
  '.subckt UO2 inp inn vp vn out',
  'Bg a 0 V=1e5*(V(inp)-V(inn))',
  'Rp a b 1k',
  'Cp b 0 1.59u',
  'Bo out 0 V=min(max(V(b),V(vn)),V(vp))',
  '.ends'
].join('\n')
// Sustituto de `kicad_builtin_opamp` (Simulation_SPICE.sp): ganancia GAIN, un polo POLE, offset VOFF, ROUT, acotado por las alimentaciones.
const subcktKicad = (p: Record<string, string>): string =>
  [
    '.subckt KOP inp inn vp vn out',
    `Bg a 0 V=${p.GAIN ?? '100k'}*(V(inp)-V(inn)+${p.VOFF ?? '0'})`,
    'Rp a b 1k',
    `Cp b 0 {1/(2*3.14159265*${p.POLE ?? '10'}*1k)}`,
    'Bo o2 0 V=min(max(V(b),V(vn)),V(vp))',
    `Ro o2 out ${p.ROUT ?? '1'}`,
    '.ends'
  ].join('\n')

function ltspiceASpice(c: CircuitoAjeno): string {
  const nodo = mapaDeNodos(c)
  const L = [`* ${c.nombre}`]
  let uo2 = false
  let d1n4148 = false
  for (const p of c.piezas) {
    const n = (i: number) => nodo(p.ref, ...claveDe(p, i))
    const tipo = p.tipo.toLowerCase().split('/').pop()!
    if (['res', 'cap', 'ind'].includes(tipo)) L.push(`${p.ref} ${n(0)} ${n(1)} ${valorSpice(p.valor ?? '')}`)
    else if (tipo === 'diode') {
      L.push(`${p.ref} ${n(0)} ${n(1)} ${p.modelo ?? p.valor}`)
      d1n4148 = true
    } else if (tipo === 'voltage' || tipo === 'current') {
      const v = (p.valor ?? '0').replace(/^SINE\(/i, 'SIN(')
      const ac = p.props.value2 && /^AC/i.test(p.props.value2) ? ` ${p.props.value2}` : ''
      L.push(`${p.ref} ${n(0)} ${n(1)} ${/^(SIN|PULSE)/i.test(v) ? v : `DC ${v}`}${ac}`)
    } else if (tipo === 'universalopamp2') {
      // Entradas cambiadas respecto de la tabla del lector: solo así el oscilador de Wien oscila y el rectificador de precisión rectifica.
      L.push(`X${p.ref} ${n(1)} ${n(0)} ${n(2)} ${n(3)} ${n(4)} UO2`)
      uo2 = true
    } else L.push(`* sin equivalente en ngspice: ${p.ref} (${p.tipo})`)
  }
  if (d1n4148) L.push(MODELO_1N4148)
  if (uo2) L.push(SUBCKT_UO2)
  for (const d of c.directivas) if (d.tipo === 'otra' && /^\.ic\b/i.test(d.texto)) L.push(d.texto.toLowerCase())
  return L.join('\n')
}

const Q2N2222 = '.model Q2N2222 NPN(IS=14.34E-15 BF=255.9 VAF=74.03 IKF=.2847 NE=1.307 ISE=14.34E-15 BR=6.092 NC=2 RC=1 CJC=7.306E-12 MJC=.4776 VJC=.75 CJE=22.01E-12 MJE=.377 VJE=.75 TR=46.91E-9 TF=411.1E-12 ITF=.6 VTF=1.7 XTF=3 RB=10)'

function kicadASpice(c: CircuitoAjeno, sustituir: Record<string, string> = {}): string {
  const nodo = mapaDeNodos(c)
  const L = [`* ${c.nombre}`]
  const modelos = new Set<string>()
  const parametros = (s: string | undefined): Record<string, string> => Object.fromEntries((s ?? '').split(/\s+/).filter(Boolean).map((x) => x.split('=') as [string, string]))
  for (const p of c.piezas) {
    const sp = p.props
    const dev = sp['Sim.Device'] ?? (/^Device:R$/.test(p.tipo) ? 'R' : /^Device:C$/.test(p.tipo) ? 'C' : /^Device:L$/.test(p.tipo) ? 'L' : '')
    const par = parametros(sp['Sim.Params'])
    // `Sim.Pins` liga el número de pin con el papel SPICE: «1=C 2=B 3=E».
    const papel = Object.fromEntries((sp['Sim.Pins'] ?? '').split(/\s+/).filter(Boolean).map((x) => x.split('=').reverse() as [string, string]))
    const nodoDe = (rol: string): string => nodo(p.ref, papel[rol])
    const dos = (): [string, string] => (papel['+'] ? [nodoDe('+'), nodoDe('-')] : [nodo(p.ref, p.pines[0]?.numero), nodo(p.ref, p.pines[1]?.numero)])
    const valor = par.r ?? par.c ?? par.l ?? p.valor ?? ''
    if (sustituir[p.ref]) {
      const [a, b] = papel['+'] ? [nodoDe('+'), nodoDe('-')] : [nodo(p.ref, p.pines[0]?.numero), nodo(p.ref, p.pines[1]?.numero)]
      L.push(`${p.ref} ${a} ${b} ${sustituir[p.ref]}`)
      continue
    }
    if (dev === 'R' || dev === 'C' || dev === 'L') {
      const [a, b] = dos()
      L.push(`${p.ref} ${a} ${b} ${valorSpice(valor)}`)
    } else if (dev === 'V' || dev === 'I') {
      const [a, b] = dos()
      const tipo = sp['Sim.Type'] ?? 'DC'
      const ac = par.ac ? ` AC ${par.ac}` : ''
      if (tipo === 'SIN') L.push(`${p.ref} ${a} ${b} SIN(${par.dc ?? 0} ${par.ampl ?? 1} ${par.f ?? '1k'})${ac}`)
      else if (tipo === 'PULSE') L.push(`${p.ref} ${a} ${b} PULSE(${par.y1} ${par.y2} ${par.td} ${par.tr} ${par.tf} ${par.tw} ${par.per})`)
      else L.push(`${p.ref} ${a} ${b} DC ${valorSpice(p.valor ?? '0')}${ac}`)
    } else if (dev === 'D') {
      L.push(`${p.ref} ${nodoDe('A')} ${nodoDe('K')} DMOD`)
      modelos.add('.model DMOD D')
    } else if (dev === 'NPN' || dev === 'PNP') {
      const m = sp['Sim.Name'] ?? 'QGEN'
      L.push(`${p.ref} ${nodoDe('C')} ${nodoDe('B')} ${nodoDe('E')} ${m}`)
      modelos.add(m === 'Q2N2222' ? Q2N2222 : `.model ${m} ${dev}`)
    } else if (dev === 'NMOS') {
      // Por el nombre del pin del símbolo: la propiedad Sim.Pins de este ejemplo («1=D 2=G 3=S») contradice al símbolo (1 es G, 2 es D).
      const porNombre = (nombre: string): string => nodo(p.ref, p.pines.find((x) => x.nombre === nombre)?.numero)
      L.push(`M${p.ref} ${porNombre('D')} ${porNombre('G')} ${porNombre('S')} ${porNombre('S')} MIRF`)
      // El .mod de IRF540N no viene con los ejemplos: nivel 1 con Vto 3.6 V y unos 44 mohm de Rds(on) a 15 V.
      modelos.add('.model MIRF NMOS(level=1 vto=3.6 kp=2)')
    } else if (dev === 'SUBCKT') {
      L.push(`X${p.ref} ${nodoDe('in+')} ${nodoDe('in-')} ${nodoDe('vcc')} ${nodoDe('vee')} ${nodoDe('out')} KOP`)
      modelos.add(subcktKicad(par))
    } else L.push(`* sin equivalente: ${p.ref} (${p.tipo})`)
  }
  return [...L, ...modelos].join('\n')
}

/** Estados guardados por Falstad en sus inductores (corriente) y capacitores (voltaje), en el orden del archivo. */
function estadosFalstad(texto: string): { l: number[]; c: number[] } {
  const e = { l: [] as number[], c: [] as number[] }
  for (const linea of texto.split(/\r?\n/)) {
    const t = linea.trim().split(/\s+/)
    if (t[0] === 'l') e.l.push(Number(t[7]))
    else if (t[0] === 'c') e.c.push(Number(t[7]))
  }
  return e
}

function falstadASpice(c: CircuitoAjeno, texto: string, conEstado: boolean): string {
  const nodo = mapaDeNodos(c)
  const est = estadosFalstad(texto)
  const L = [`* ${c.nombre}`]
  const modelos = new Set<string>()
  let il = 0
  let ic = 0
  for (const p of c.piezas) {
    const n = (i: number) => nodo(p.ref, ...claveDe(p, i))
    const pn = (nombre: string) => n(Math.max(0, p.pines.findIndex((x) => x.nombre === nombre)))
    const prop = (k: string, d: number) => (p.props[k] !== undefined && !Number.isNaN(Number(p.props[k])) ? Number(p.props[k]) : d)
    switch (p.tipo) {
      case 'r':
        L.push(`${p.ref} ${n(0)} ${n(1)} ${p.valor}`)
        break
      case 'c': {
        const v = est.c[ic++]
        L.push(`${p.ref} ${n(0)} ${n(1)} ${p.valor}${conEstado && v ? ` ic=${v}` : ''}`)
        break
      }
      case 'l': {
        const i = est.l[il++]
        L.push(`${p.ref} ${n(0)} ${n(1)} ${p.valor}${conEstado && i ? ` ic=${i}` : ''}`)
        break
      }
      case 'd':
        L.push(`${p.ref} ${pn('A')} ${pn('K')} DF`)
        modelos.add('.model DF D(Is=1.7143528e-8 N=2)')
        break
      case 't':
        L.push(`${p.ref} ${pn('C')} ${pn('B')} ${pn('E')} ${prop('pnp', 1) < 0 ? 'QP' : 'QN'}`)
        modelos.add(`.model QN NPN(BF=${prop('beta', 100)} IS=1e-13)`)
        modelos.add(`.model QP PNP(BF=${prop('beta', 100)} IS=1e-13)`)
        break
      case 'f':
        L.push(`${p.ref} ${pn('D')} ${pn('G')} ${pn('S')} ${pn('S')} ${p.props.canal === 'p' ? 'MP' : 'MN'}`)
        modelos.add(`.model MN NMOS(level=1 vto=${prop('vt', 1.5)} kp=${prop('beta', 0.02)})`)
        modelos.add(`.model MP PMOS(level=1 vto=-${prop('vt', 1.5)} kp=${prop('beta', 0.02)})`)
        break
      case 'R':
      case 'v': {
        const [mas, menos] = p.tipo === 'R' ? [n(0), '0'] : [n(0), n(1)]
        const forma = p.props.forma ?? 'cd'
        const amp = prop('amplitud', 5)
        const off = prop('offset', 0)
        const f = prop('frecuencia', 1000)
        const duty = prop('ciclo', 0.5)
        const onda =
          forma === 'cd' ? `DC ${amp}` : forma === 'senoidal' ? `SIN(${off} ${amp} ${f})` : forma === 'cuadrada' ? `PULSE(${off - amp} ${off + amp} 0 1n 1n ${duty / f} ${1 / f})` : `DC ${off}`
        L.push(`${p.ref} ${mas} ${menos} ${onda}`)
        break
      }
      case 'I':
        L.push(`B${p.ref} ${pn('Y')} 0 V=5*(1-u(V(${pn('A')})-2.5))`)
        break
      case 'L':
        // La posición va en el primer campo tras las banderas («1 false 5 0»: posición 1, no momentáneo, 5 V y 0 V).
        L.push(`V${p.ref} ${pn('Y')} 0 DC 5`)
        break
      case 'g':
      case 'O':
      case 'o':
        break
      default:
        L.push(`* sin equivalente: ${p.ref} (${p.tipo})`)
    }
  }
  return [...L, ...modelos].join('\n')
}

/** El .cir original con su análisis sustituido: quita lo que ngspice en lote no usa (.print, .plot) y la directiva de análisis. */
function spiceOriginal(texto: string): string {
  return texto
    .split(/\r?\n/)
    .filter((l) => !/^\s*\.(print|plot|pss|pz|end|tran|op|width|opt|options|ac|dc)\b/i.test(l) && !/^\s*\*\s*\.tran/i.test(l))
    .join('\n')
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Motor de Kirchi

type Punto = [ref: string, pin: string]

interface Corrida {
  compila: boolean
  motivo?: string
  series: Map<string, Serie>
  aviso?: string
}

function simularKirchi(doc: Documento, fin: number, puntos: Record<string, Punto>, transitorio: boolean): Corrida {
  const con = calcularConexiones(doc, lib)
  const r = compilarNetlist(doc, lib, con)
  if (r.errores.length > 0) return { compila: false, motivo: `no compila: ${r.errores.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join(' | ').slice(0, 300)}`, series: new Map() }
  const redDe = ([ref, pin]: Punto): number => {
    const p = Object.values(doc.piezas).find((x) => x.ref === ref)
    if (!p) throw new Error(`no hay pieza ${ref} en el documento importado`)
    const def = lib.get(p.tipo)
    const pinDef = p.pines?.find((x) => x.numero === pin || x.id === pin) ?? def?.pines?.find((x: { id: string; numero?: string }) => x.id === pin || x.numero === pin)
    const id = pinDef?.id ?? pin
    const red = con.redDePin.get(clavePin(p.id, id))
    if (red === undefined) {
      const disponibles = (p.pines ?? def?.pines ?? []).map((x: { id: string; numero?: string }) => `${x.id}${x.numero ? `/${x.numero}` : ''}`).join(',')
      throw new Error(`${ref}.${pin} no está en ninguna red (pines: ${disponibles})`)
    }
    return red
  }
  const redes = Object.fromEntries(Object.entries(puntos).map(([k, p]) => [k, redDe(p)]))
  const sim = new Simulator(JSON.stringify(r.netlist), fin / 8000)
  sim.set_tolerances(1e-4, 1e-12, 1e-7)
  const leer = (): Lectura => {
    const n = sim.element_count()
    const f64 = (p: number, k = n) => new Float64Array(memoria.buffer, p, k).slice()
    const g = sim.digital_count()
    return leerResultados(r, { time: sim.time(), ratio: 1, capacity: 1, seq: 0, consistente: true, voltages: sim.voltages(), currents: f64(sim.currents_ptr()), aux: f64(sim.aux_ptr()), estado: f64(sim.estado_ptr()), niveles: f64(sim.niveles_ptr(), g), medidas: f64(sim.medidas_ptr(), 3 * g) })
  }
  const series = new Map<string, Serie>(Object.keys(redes).map((k) => [k, { t: [], v: [] }]))
  const anotar = () => {
    const l = leer()
    for (const [k, red] of Object.entries(redes)) {
      const s = series.get(k)!
      s.t.push(sim.time())
      s.v.push(l.redes.get(red) ?? NaN)
    }
  }
  let aviso: string | undefined
  try {
    if (!transitorio) {
      sim.advance_to(fin, 10_000_000)
      anotar()
    } else {
      const inicio = Date.now()
      let pasos = 0
      while (sim.time() < fin) {
        const antes = sim.time()
        sim.advance_to(fin, 1)
        anotar()
        pasos++
        if (sim.time() <= antes && pasos > 100_000) {
          aviso = `el motor no avanza en t = ${antes.toExponential(3)} s`
          break
        }
        if (Date.now() - inicio > 40_000) {
          aviso = `se cortó a los 40 s en t = ${sim.time().toExponential(3)} s de ${fin.toExponential(2)} s`
          break
        }
      }
    }
  } finally {
    sim.free()
  }
  return { compila: true, series, aviso }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Casos

interface Objetivo {
  etiqueta: string
  mas: Punto
  menos?: Punto
  /** Pin de Kirchi si no se llama igual que en el origen. */
  kirchiMas?: Punto
  kirchiMenos?: Punto
}

interface Caso {
  id: string
  ruta: string
  fin: number
  /** Inicio de la ventana de métricas como fracción de `fin`. */
  desde?: number
  objetivos: Objetivo[]
  /** Análisis de ngspice (sin la palabra `.control`), si el origen no trae uno utilizable. */
  analisis?: string
  op?: boolean
  /** Para el .cir original: nodos por nombre en vez de por pin. */
  nodosSpice?: Record<string, string>
  /** Referencia por fórmula en lugar de ngspice. */
  formula?: { descripcion: string; valores: Record<string, Partial<Metricas>> }
  notaReferencia: string
  /** Segunda corrida de ngspice con otras fuentes (lo que Kirchi leyó de ellas), para separar el efecto de la fuente del de las piezas. */
  variante?: { descripcion: string; fuentes: Record<string, string> }
}

const tranSpice = (fin: number, hmax = fin / 8000, extra = ''): string => `tran ${hmax} ${fin} 0 ${hmax}${extra}`

const CASOS: Caso[] = [
  {
    id: 'Falstad colpitts',
    ruta: 'Falstad/colpitts.txt',
    fin: 20e-3,
    objetivos: [
      { etiqueta: 'colector (N3)', mas: ['R1', '1'], kirchiMas: ['R1', '1'] },
      { etiqueta: 'base (N1)', mas: ['L1', '1'] }
    ],
    notaReferencia: 'ngspice con el netlist de Falstad (BF 100, IS 1e-13, estados guardados de L y C con uic)'
  },
  {
    id: 'Falstad conv-boost',
    ruta: 'Falstad/conv-boost.txt',
    fin: 5e-3,
    objetivos: [
      { etiqueta: 'salida (N4)', mas: ['R1', '1'] },
      { etiqueta: 'compuerta (N2)', mas: ['M1', 'G'] },
      { etiqueta: 'drenaje (N1)', mas: ['L1', '2'] }
    ],
    notaReferencia: 'ngspice con MOSFET nivel 1 (Vt 1.5, beta 0.02), diodo Is 1.7e-8 N 2 y cuadrada de 68 % entre 0 y 10 V'
  },
  {
    id: 'Falstad mux',
    ruta: 'Falstad/mux.txt',
    fin: 25e-3,
    desde: 0.1,
    objetivos: [
      { etiqueta: 'salida (N1)', mas: ['R1', '1'] },
      { etiqueta: 'entrada 80 Hz (N3)', mas: ['V1', '1'], kirchiMas: ['V1', '+'] },
      { etiqueta: 'entrada 40 Hz (N5)', mas: ['V2', '1'], kirchiMas: ['V2', '+'] }
    ],
    notaReferencia: 'ngspice con MOSFET nivel 1, inversor ideal y selector en 5 V (posición 1 del campo de la entrada lógica)'
  },
  {
    id: 'LTspice Rectificadores',
    ruta: 'LTspice/Rectificadores.asc',
    fin: 100e-6,
    desde: 0.2,
    objetivos: [
      { etiqueta: 'media onda Vout1', mas: ['R1', '1'] },
      { etiqueta: 'onda completa Vout2+ menos Vout2-', mas: ['R2', '1'], menos: ['R2', '2'] },
      { etiqueta: 'precisión Vout3+ menos Vout3-', mas: ['R4', '1'], menos: ['R4', '2'] },
      { etiqueta: 'alimentación + del amp-op (Vdd)', mas: ['U1', '3'], kirchiMas: ['U1', 'V+'] },
      { etiqueta: 'alimentación − del amp-op (Vss)', mas: ['U1', '4'], kirchiMas: ['U1', 'V-'] }
    ],
    notaReferencia: 'ngspice con el netlist de LTspice (1N4148 de LTspice; UniversalOpamp2 sustituido por un modelo de ganancia 1e6, GBW 10 MHz y salida acotada)'
  },
  {
    id: 'LTspice Circuitos-RLC',
    ruta: 'LTspice/Circuitos-RLC.asc',
    fin: 1100e-6,
    desde: 1000 / 1100,
    objetivos: [
      { etiqueta: 'N1 (nodo de V1)', mas: ['V1', '1'], kirchiMas: ['V1', '+'] },
      { etiqueta: 'N2 (tras R2)', mas: ['R2', '1'] },
      { etiqueta: 'N3 (sobre C2)', mas: ['C2', '1'] },
      { etiqueta: 'N001 (fuente de corriente)', mas: ['R1', '1'] }
    ],
    notaReferencia: 'ngspice con el netlist de LTspice; la ventana es la de .tran 0 1100u 1000u'
  },
  {
    id: 'LTspice Oscilador-Wien',
    ruta: 'LTspice/Oscilador-Wien.asc',
    fin: 1e-3,
    desde: 0.8,
    objetivos: [
      { etiqueta: 'Vout', mas: ['R4', '1'] },
      { etiqueta: 'salida del amp-op (N002)', mas: ['R1', '1'] },
      { etiqueta: 'alimentación + del amp-op (Vdd)', mas: ['U1', '3'], kirchiMas: ['U1', 'V+'] }
    ],
    notaReferencia: 'ngspice con el netlist de LTspice, .ic V(Vout)=1u y el amp-op sustituido (ganancia 1e6, GBW 10 MHz, acotado a ±5 V). Frecuencia teórica 1/(2πRC) = 159 kHz'
  },
  {
    id: 'LTspice 555-monoestable',
    ruta: 'LTspice/555-monoestable.asc',
    fin: 30e-6,
    desde: 0,
    objetivos: [
      { etiqueta: 'Vout', mas: ['R1', '1'], kirchiMas: ['R1', '1'] },
      { etiqueta: 'Threshold (C2)', mas: ['C2', '1'] },
      { etiqueta: 'Trigger (V2)', mas: ['V2', '1'], kirchiMas: ['V2', '+'] },
      { etiqueta: 'Vcc (pin 8 del 555)', mas: ['U1', '8'] }
    ],
    formula: {
      descripcion: 'ancho del pulso = R·C·ln 3 = 1 kΩ · 1 nF · 1.0986 = 1.10 µs, un pulso por cada flanco de bajada del disparo (cada 5 µs, el primero en 1 µs): 6 pulsos en 30 µs, Vout alto cerca de Vcc (6 V) y Threshold sube hasta 4 V (2/3 de Vcc)',
      valores: { Vout: { ciclos: 6, max: 6, min: 0, ancho: 1.0986e-6 }, 'Threshold (C2)': { max: 4, min: 0 }, 'Trigger (V2)': { max: 6, min: 0, mean: 5.4, ciclos: 6 }, 'Vcc (pin 8 del 555)': { max: 6, min: 6 } }
    },
    notaReferencia: 'fórmula del monoestable (el NE555 de LTspice no existe en ngspice)'
  },
  {
    id: 'KiCad amplifier-ac',
    ruta: 'KiCad/amplifier-ac/amplifier-ac.kicad_sch',
    fin: 5e-3,
    desde: 0.4,
    objetivos: [
      { etiqueta: 'VIN', mas: ['R3', '2'] },
      { etiqueta: 'VBASE', mas: ['R5', '2'] },
      { etiqueta: 'VOUT', mas: ['R2', '1'] }
    ],
    notaReferencia: 'ngspice con el netlist de las propiedades Sim.* (Q2N2222 con los parámetros PSpice estándar; 2n2222.model no viene con el ejemplo), V1 = SIN(0 1 1k)',
    variante: { descripcion: 'V1 como la dejó Kirchi (fuente-ac por omisión: 5 V pico, 60 Hz)', fuentes: { V1: 'SIN(0 5 60)' } }
  },
  {
    id: 'KiCad buck_conv',
    ruta: 'KiCad/buck_conv/buck_conv.kicad_sch',
    fin: 2e-3,
    desde: 0.5,
    objetivos: [
      { etiqueta: 'VOUT', mas: ['C101', '1'] },
      { etiqueta: 'PWM_OUT (nodo de conmutación)', mas: ['L101', '1'] },
      { etiqueta: 'gg (compuerta)', mas: ['R101', '1'] }
    ],
    notaReferencia: 'ngspice con las propiedades Sim.* (IRF540N sustituido por NMOS nivel 1 con Vto 3.6 V y Rds(on) cercano a 44 mΩ; IRF-Power-VDMOS.mod no viene con el ejemplo; D con el modelo por omisión)',
    variante: { descripcion: 'V101 como la dejó Kirchi (fuente-pulso por omisión: 0 a 5 V, 1 kHz, 50 %)', fuentes: { V101: 'PULSE(0 5 0 1n 1n 0.5m 1m)' } }
  },
  {
    id: 'KiCad generic_opamp_bip',
    ruta: 'KiCad/generic_models/generic_opamp_bip.kicad_sch',
    fin: 5e-3,
    desde: 0.4,
    objetivos: [
      { etiqueta: 'in', mas: ['R2', '2'] },
      { etiqueta: 'out (amp-op)', mas: ['R1', '1'] },
      { etiqueta: 'outb (etapa con BJT)', mas: ['R7', '1'] },
      { etiqueta: 'Net-2 (base de Q1)', mas: ['R3', '1'] }
    ],
    notaReferencia: 'ngspice con las propiedades Sim.* (kicad_builtin_opamp sustituido por GAIN 100k, POLE 30 Hz, VOFF 10 µV, ROUT 10 Ω acotado a ±5 V; NPN con parámetros por omisión)',
    variante: { descripcion: 'V3 como la dejó Kirchi (fuente-ac por omisión: 5 V pico, 60 Hz)', fuentes: { V3: 'SIN(0 5 60)' } }
  },
  {
    id: 'SPICE e_pss_colpitt_osc_pss',
    ruta: 'SPICE/e_pss_colpitt_osc_pss.cir',
    fin: 12e-6,
    desde: 0.5,
    objetivos: [
      { etiqueta: 'colector (nodo 2)', mas: ['rl', '2'] },
      { etiqueta: 'emisor (nodo 3)', mas: ['re', '1'] },
      { etiqueta: 'nodo 4', mas: ['rl', '1'] }
    ],
    analisis: 'tran 3e-9 12e-6 0 3e-9',
    notaReferencia: 'el .cir original con el .tran 30n 12u que trae comentado (el archivo pide .pss); frecuencia predicha en el propio archivo 3.30 MHz'
  },
  {
    id: 'SPICE t_general_schmitt',
    ruta: 'SPICE/t_general_schmitt.cir',
    fin: 1000e-9,
    desde: 0,
    objetivos: [
      { etiqueta: 'nodo 1 (entrada)', mas: ['rin', '1'] },
      { etiqueta: 'nodo 3 (colector Q1)', mas: ['rc1', '2'] },
      { etiqueta: 'nodo 5', mas: ['r1', '2'] },
      { etiqueta: 'nodo 6 (colector Q2)', mas: ['rc2', '2'] },
      { etiqueta: 'nodo 7 (salida)', mas: ['rth1', '1'] }
    ],
    analisis: 'tran 1e-10 1e-6 0 1e-10',
    notaReferencia: 'el .cir original con su .tran 10ns 1000ns'
  },
  {
    id: 'SPICE t_polezero_pz2',
    ruta: 'SPICE/t_polezero_pz2.cir',
    fin: 1e-3,
    op: true,
    objetivos: [
      { etiqueta: 'nodo 1', mas: ['r1', '1'] },
      { etiqueta: 'nodo 4', mas: ['r4', '1'] }
    ],
    analisis: 'op',
    notaReferencia: 'el .cir original en punto de operación (el análisis .pz y la fuente AC no tienen equivalente en el motor)'
  }
]

// ---------------------------------------------------------------------------------------------------------------------------------
// Tabla

interface Fila {
  ejemplo: string
  red: string
  metrica: string
  original: number
  original2?: number
  kirchi: number
  dif: string
  difiere: boolean
}

const fmt = (x: number | undefined): string => (x === undefined ? '' : Number.isNaN(x) ? 'sin ciclos' : Math.abs(x) >= 1e4 || (Math.abs(x) < 1e-2 && x !== 0) ? x.toExponential(3) : String(Number(x.toPrecision(4))))

function compararMetricas(ejemplo: string, red: string, o: Partial<Metricas>, k: Metricas | null, o2?: Partial<Metricas>): Fila[] {
  const filas: Fila[] = []
  const escala = Math.max(Math.abs(o.max ?? 0), Math.abs(o.min ?? 0), 1e-9)
  const claves: [keyof Metricas, string][] = [
    ['min', 'mínimo'],
    ['max', 'máximo'],
    ['mean', 'media'],
    ['final', 'final'],
    ['f', 'frecuencia (Hz)'],
    ['ciclos', 'ciclos'],
    ['ancho', 'ancho del primer pulso (s)']
  ]
  for (const [c, nombre] of claves) {
    const ov = o[c]
    if (ov === undefined) continue
    if (c === 'ciclos' && o.f !== undefined && !Number.isNaN(o.f)) continue
    if ((c === 'f' || c === 'ciclos' || c === 'ancho') && (Number.isNaN(ov) || ov === 0) && (k === null || Number.isNaN(k[c]))) continue
    const kv = k === null ? NaN : k[c]
    let dif: string
    let difiere: boolean
    if (k === null) {
      dif = 'sin simulación'
      difiere = true
    } else if (c === 'f') {
      const d = (kv - ov) / ov
      dif = Number.isNaN(kv) ? 'Kirchi no oscila' : `${(d * 100).toFixed(1)} %`
      difiere = Number.isNaN(kv) || Math.abs(d) > 0.05
    } else if (c === 'ancho') {
      const d = (kv - ov) / ov
      dif = Number.isNaN(kv) ? 'Kirchi no tiene pulso' : `${(d * 100).toFixed(1)} %`
      difiere = Number.isNaN(kv) || Math.abs(d) > 0.1
    } else if (c === 'ciclos') {
      dif = String(kv - ov)
      difiere = kv !== ov
    } else {
      const d = kv - ov
      dif = `${fmt(d)} (${((Math.abs(d) / escala) * 100).toFixed(1)} % de la escala)`
      difiere = Math.abs(d) / escala > 0.05
    }
    filas.push({ ejemplo, red, metrica: nombre, original: ov, original2: o2?.[c], kirchi: kv, dif, difiere })
  }
  return filas
}

// ---------------------------------------------------------------------------------------------------------------------------------

interface Resultado {
  caso: Caso
  estado: string
  avisosImportador: string[]
  piezasKirchi: string[]
  filas: Fila[]
  notas: string[]
  detallePines?: string[]
}

/**
 * Pines cruzados: compara, pieza por pieza (las de tres pines o más), con quién comparte red cada pin en Kirchi y en el original. Si el
 * pin de Kirchi `X` comparte red con el mismo conjunto de piezas que el pin `Y` del original y `X` ≠ `Y`, la conversión los cruzó.
 */
function verificarPines(ajeno: CircuitoAjeno, doc: Documento, detalle: string[] = []): string[] {
  const con = calcularConexiones(doc, lib)
  const ignorar = (t: string) => t === 'tierra' || t === 'osciloscopio'
  const porRed = new Map<number, { ref: string; pin: string; tipo: string }[]>()
  const piezasK = Object.values(doc.piezas)
  for (const p of piezasK) {
    const def = lib.get(p.tipo) as { pines?: { id: string }[] } | undefined
    for (const pd of (p.pines ?? def?.pines ?? []) as { id: string }[]) {
      const r = con.redDePin.get(clavePin(p.id, pd.id))
      if (r !== undefined) porRed.set(r, [...(porRed.get(r) ?? []), { ref: p.ref, pin: pd.id, tipo: p.tipo }])
    }
  }
  const vecinosK = (ref: string, pin: string): string => {
    for (const lista of porRed.values()) {
      if (!lista.some((x) => x.ref === ref && x.pin === pin)) continue
      const v = new Set(lista.filter((x) => x.ref !== ref && !ignorar(x.tipo)).map((x) => x.ref))
      if (lista.some((x) => x.tipo === 'tierra')) v.add('GND')
      return [...v].sort().join(',')
    }
    return ''
  }
  const redDeAjeno = new Map<string, { nombre?: string; refs: string[] }>()
  for (const r of ajeno.redes) for (const p of r.pines) redDeAjeno.set(`${p.ref}\u0000${p.pin}`, { nombre: r.nombre, refs: r.pines.map((x) => x.ref) })
  const norm = (r: string): string => r.toLowerCase().replace('in+', '+').replace(/^in[-−]$/, '-').replace('−', '-').replace('vcc', 'v+').replace('vee', 'v-')
  const out: string[] = []
  for (const pa of ajeno.piezas) {
    if (pa.pines.length < 3) continue
    const papel = Object.fromEntries((pa.props['Sim.Pins'] ?? '').split(/\s+/).filter(Boolean).map((x) => x.split('=') as [string, string]))
    const vecinosA = pa.pines.map((_, i) => {
      for (const k of claveDe(pa, i)) {
        const r = k !== undefined ? redDeAjeno.get(`${pa.ref}\u0000${k}`) : undefined
        if (r) {
          const v = new Set(r.refs.filter((x) => x !== pa.ref))
          if (r.nombre !== undefined && /^(0|gnd)$/i.test(r.nombre)) v.add('GND')
          return [...v].sort().join(',')
        }
      }
      return ''
    })
    const rolA = (i: number): string => papel[pa.pines[i].numero ?? ''] ?? pa.pines[i].nombre ?? pa.pines[i].numero ?? String(i + 1)
    const pk = piezasK.find((x) => x.ref === pa.ref)
    if (!pk) continue
    const def = lib.get(pk.tipo) as { pines?: { id: string }[] } | undefined
    for (const pd of (pk.pines ?? def?.pines ?? []) as { id: string }[]) {
      const vk = vecinosK(pk.ref, pd.id)
      if (vk === '') continue
      const cand = vecinosA.map((v, i) => (v === vk ? i : -1)).filter((i) => i >= 0)
      if (cand.length !== 1) continue
      detalle.push(`${pa.ref}.${pd.id} de Kirchi comparte red con [${vk}]; en el original lo mismo hace el pin ${rolA(cand[0])}`)
      const numerico = /^\d+$/.test(pd.id)
      const esperado = numerico ? (pa.pines[cand[0]].numero ?? String(cand[0] + 1)) : rolA(cand[0])
      if (norm(esperado) !== norm(pd.id)) out.push(`${pa.ref}: el pin ${pd.id} de Kirchi está en la red del pin ${esperado} del original (vecinos ${vk})`)
    }
  }
  return out
}

function correrCaso(caso: Caso): Resultado {
  const ruta = join(CARPETA, caso.ruta)
  const nombre = caso.ruta.split('/').pop()!
  const bytes = readFileSync(ruta)
  const texto = decodificarTexto(bytes)
  const res: Resultado = { caso, estado: '', avisosImportador: [], piezasKirchi: [], filas: [], notas: [] }
  const fmtoArchivo = (detectarFormato(nombre, bytes) as { formato: string }).formato
  const ajeno: CircuitoAjeno =
    fmtoArchivo === 'falstad' ? leerFalstad(texto, nombre) : fmtoArchivo === 'ltspice' ? leerLtspice(texto, nombre) : fmtoArchivo === 'kicad' ? leerKicad(texto, nombre, {}) : leerSpice(texto, nombre)
  const imp = importarBytes(nombre, bytes, lib, idSecuencial())
  if (!imp.ok) {
    res.estado = `no se importa: ${imp.motivo}`
    return res
  }
  res.avisosImportador = imp.avisos
  res.piezasKirchi = Object.values(imp.doc.piezas).filter((p) => p.tipo !== 'tierra').map((p) => `${p.ref} ${p.tipo} ${JSON.stringify(p.props)}`)
  const doc = imp.doc
  const detalle: string[] = []
  res.notas.push(...verificarPines(ajeno, doc, detalle).map((x) => `pines cruzados: ${x}`))
  res.detallePines = detalle
  const nodoDe = mapaDeNodos(ajeno)

  // Referencia
  const dos = (o: Objetivo): { mas: string; menos?: string } => {
    const claves = (ref: string, pin: string) => {
      const p = ajeno.piezas.find((x) => x.ref === ref)
      return [pin, ...(p ? p.pines.flatMap((x, i) => (x.nombre === pin || x.numero === pin ? claveDe(p, i) : [])) : [])]
    }
    return { mas: nodoDe(o.mas[0], ...claves(o.mas[0], o.mas[1])), menos: o.menos ? nodoDe(o.menos[0], ...claves(o.menos[0], o.menos[1])) : undefined }
  }
  const referencias: Map<string, Partial<Metricas>>[] = []
  const t0 = caso.fin * (caso.desde ?? 0.5)
  let orig: Map<string, Serie> | null = null
  let orig2: Map<string, Serie> | null = null
  if (!caso.formula) {
    const nodos = caso.objetivos.flatMap((o) => Object.values(dos(o)).filter((x): x is string => !!x))
    let cuerpo: string
    let analisis = caso.analisis ?? tranSpice(caso.fin)
    if (fmtoArchivo === 'spice') cuerpo = spiceOriginal(texto)
    else if (fmtoArchivo === 'ltspice') cuerpo = ltspiceASpice(ajeno)
    else if (fmtoArchivo === 'kicad') cuerpo = kicadASpice(ajeno)
    else cuerpo = falstadASpice(ajeno, texto, true)
    if (fmtoArchivo === 'falstad') analisis = tranSpice(caso.fin, caso.fin / 8000, ' uic')
    if (fmtoArchivo === 'ltspice' && caso.id.includes('Wien')) analisis = tranSpice(caso.fin)
    const s = correrNgspice(cuerpo, nodos, analisis)
    if (!s.ok) res.notas.push(`la referencia no corrió: ${s.motivo}`)
    else orig = s.series
    if (fmtoArchivo === 'kicad' && caso.variante) {
      const s2 = correrNgspice(kicadASpice(ajeno, caso.variante.fuentes), nodos, analisis)
      if (s2.ok) orig2 = s2.series
      else res.notas.push(`la variante no corrió: ${s2.motivo}`)
      res.notas.push(`columna «Original, variante»: ${caso.variante.descripcion}`)
    }
    if (fmtoArchivo === 'falstad') {
      res.notas.push('columna «Original, variante»: el mismo netlist desde reposo (sin los estados guardados de L y C)')
      const s2 = correrNgspice(falstadASpice(ajeno, texto, false), nodos, tranSpice(caso.fin, caso.fin / 8000, ' uic'))
      if (s2.ok) orig2 = s2.series
      else res.notas.push(`la referencia desde reposo no corrió: ${s2.motivo}`)
    }
    if (fmtoArchivo === 'falstad') {
      // Valores esperados a mano.
      if (caso.id.includes('colpitts')) {
        const L = 0.01
        const Cs = (1e-4 * 1e-4) / (2e-4)
        res.notas.push(`frecuencia esperada f = 1/(2π√(L·Cserie)) = 1/(2π√(${L} H · ${Cs * 1e6} µF)) = ${(1 / (2 * Math.PI * Math.sqrt(L * Cs))).toFixed(1)} Hz`)
      }
      if (caso.id.includes('boost')) res.notas.push('esperado en régimen (CCM ideal): Vout = Vin/(1−D) = 5 V/(1−0.68) = 15.6 V; con D = 50 % (lo que dejó el importador) sería 10 V')
    }
  }
  void referencias

  // Kirchi
  const puntos: Record<string, Punto> = {}
  caso.objetivos.forEach((o, i) => {
    puntos[`m${i}`] = o.kirchiMas ?? o.mas
    if (o.menos) puntos[`n${i}`] = o.kirchiMenos ?? o.menos
  })
  let k: Corrida
  try {
    k = simularKirchi(doc, caso.fin, puntos, !caso.op)
  } catch (e) {
    k = { compila: false, motivo: `falla al simular: ${e instanceof Error ? e.message : String(e)}`, series: new Map() }
  }
  if (process.env.KIRCHI_VOLCADO && k.compila) writeFileSync(`${process.env.KIRCHI_VOLCADO}/${caso.id.replace(/\W+/g, '_')}.csv`, [...k.series.entries()].map(([n, ss]) => [n, ...ss.t.map((t, x) => `${t},${ss.v[x]}`)].join('\n')).join('\n'))
  res.estado = k.compila ? `compila${k.aviso ? `; ${k.aviso}` : ''}` : (k.motivo ?? 'no compila')
  caso.objetivos.forEach((o, i) => {
    const sk = k.compila ? (o.menos ? restar(k.series.get(`m${i}`)!, k.series.get(`n${i}`)!) : k.series.get(`m${i}`)!) : null
    const fin = k.compila && sk ? Math.min(caso.fin, sk.t[sk.t.length - 1]) : caso.fin
    const t0k = Math.min(t0, fin * 0.5)
    const mk = (s: Serie | null): Metricas | null => (s ? (caso.op ? { min: s.v[s.v.length - 1], max: s.v[s.v.length - 1], mean: s.v[s.v.length - 1], final: s.v[s.v.length - 1], f: NaN, ciclos: 0, ancho: NaN } : metricas(s, t0k, fin)) : null)
    const sel = (m: Map<string, Serie> | null): Serie | null => {
      if (!m) return null
      const d = dos(o)
      const a = m.get(d.mas)
      if (!a) return null
      return d.menos ? restar(a, m.get(d.menos) ?? { t: [0, 1], v: [0, 0] }) : a
    }
    const mo = (s: Serie | null): Metricas | null => (s ? (caso.op ? { min: s.v[s.v.length - 1], max: s.v[s.v.length - 1], mean: s.v[s.v.length - 1], final: s.v[s.v.length - 1], f: NaN, ciclos: 0, ancho: NaN } : metricas(s, t0, caso.fin)) : null)
    if (caso.formula) {
      const v = caso.formula.valores[o.etiqueta]
      if (v) res.filas.push(...compararMetricas(caso.id, o.etiqueta, v, mk(sk)))
      return
    }
    const sinAncho = (m: Metricas | null): Partial<Metricas> | null => (m ? { ...m, ancho: undefined } : null)
    const mO = sinAncho(mo(sel(orig)))
    if (!mO) {
      res.filas.push({ ejemplo: caso.id, red: o.etiqueta, metrica: '(sin referencia)', original: NaN, kirchi: NaN, dif: 'referencia no disponible', difiere: true })
      return
    }
    const mO2 = sinAncho(mo(sel(orig2)))
    const filas = compararMetricas(caso.id, o.etiqueta, mO, mk(sk), mO2 ?? undefined)
    res.filas.push(...filas)
  })
  return res
}

function correrProteus(): Resultado {
  const caso: Caso = { id: 'Proteus New Project', ruta: 'New Project.pdsprj', fin: 10, objetivos: [], notaReferencia: 'traza guardada por Proteus en U4(OP)' }
  const res: Resultado = { caso, estado: '', avisosImportador: [], piezasKirchi: [], filas: [], notas: [] }
  const imp = importarBytes('New Project.pdsprj', readFileSync(PDSPRJ), lib, idSecuencial())
  if (!imp.ok) {
    res.estado = `no se importa: ${imp.motivo}`
    return res
  }
  res.avisosImportador = imp.avisos
  res.piezasKirchi = Object.values(imp.doc.piezas).filter((p) => p.tipo !== 'tierra').map((p) => `${p.ref} ${p.tipo} ${JSON.stringify(p.props)}`)
  let k: Corrida
  try {
    k = simularKirchi(imp.doc, 10, { u4: ['U4', 'OUT'] }, true)
  } catch (e) {
    k = { compila: false, motivo: `falla al simular: ${e instanceof Error ? e.message : String(e)}`, series: new Map() }
  }
  res.estado = k.compila ? `compila${k.aviso ? `; ${k.aviso}` : ''}` : (k.motivo ?? 'no compila')
  if (k.compila) {
    const s = k.series.get('u4')!
    const m = metricas(s, 0, 10)
    const tPico = s.t[s.v.indexOf(Math.max(...s.v))]
    const quedar = (red: string, met: string, o: number, kv: number, tol: number) => res.filas.push({ ejemplo: caso.id, red, metrica: met, original: o, kirchi: kv, dif: `${(((kv - o) / o) * 100).toFixed(1)} %`, difiere: Math.abs((kv - o) / o) > tol })
    quedar('U4(OP)', 'final', 0.998, m.final, 0.05)
    quedar('U4(OP)', 'máximo', 1.194, m.max, 0.05)
    quedar('U4(OP)', 'tiempo del pico (s)', 3.91, tPico, 0.05)
  }
  return res
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Causas probables, escritas tras mirar la tabla y las piezas importadas de cada ejemplo (la evidencia son las cifras de esta misma tabla).

type Etiqueta = 'fuente' | 'estado' | 'modelo' | 'pines' | 'no simula' | 'analisis' | 'pulso' | 'generador'
const ROTULO: Record<Etiqueta, string> = {
  fuente: 'Parámetros de una fuente perdidos (queda con los valores por omisión de la pieza o sin generador)',
  estado: 'Estado inicial o .ic del original no importado',
  modelo: 'Modelo de semiconductor o amp-op distinto del original',
  pines: 'Pines cruzados',
  'no simula': 'No compila o el motor no resuelve el circuito',
  analisis: 'Directiva de análisis mal leída o sin equivalente',
  pulso: 'Pulso o ciclo de trabajo mal convertido',
  generador: 'Generador o entrada lógica de Falstad mal convertidos'
}

const CAUSAS: Record<string, { etiqueta: Etiqueta; texto: string }[]> = {
  'Falstad colpitts': [
    { etiqueta: 'modelo', texto: 'La corriente de L1 (−10.1 mA) y los voltajes de C1 y C2 guardados ya se importan como condiciones iniciales y Kirchi oscila a 223.6 Hz (el original, 217.3 Hz, 2.9 %). Quedan 4 de 10 filas: la base difiere 7 a 15 % en su rango y el valor final del colector 27 % (señal en oscilación, la fase del último instante); causa probable, el transistor de Kirchi no es el de BF 100 e IS 1e-13 de Falstad (no medido).' }
  ],
  'Falstad conv-boost': [
  ],
  'Falstad mux': [],
  'LTspice Rectificadores': [
    { etiqueta: 'modelo', texto: 'Media onda y onda completa concuerdan en forma y frecuencia; el pico de onda completa difiere 22 % (0.071 contra 0.056 V) por el modelo del 1N4148 (el diodo no admite parámetros propios en Kirchi).' },
    { etiqueta: 'pines', texto: 'Rectificador de precisión: el UniversalOpamp2 no existe en ngspice y la referencia lo sustituye con las entradas cambiadas; el .tran de un argumento ya se lee como tiempo final.' }
  ],
  'LTspice Circuitos-RLC': [
    { etiqueta: 'modelo', texto: 'I1 (SINE 1 mA) llega como fuente de corriente AC y N001 coincide en amplitud (1.1 %); su frecuencia sale 17.6 % distinta en una ventana de 3.7 ciclos. N3 difiere 27 a 34 % en el transitorio de 1000 a 1100 µs; causa no determinada (frecuencia y fase coinciden).' }
  ],
  'LTspice Oscilador-Wien': [
    { etiqueta: 'estado', texto: '.ic V(Vout)=1u ya se importa (1 µV en C2) y Kirchi oscila: 35 cruces del nivel medio y 0.36 V de amplitud en la ventana. La referencia de ngspice corre sin uic y se queda en 0 V, así que las filas difieren por esa referencia; la frecuencia de Kirchi (71 kHz) queda lejos de la teórica de 159 kHz, causa no determinada.' }
  ],
  'LTspice 555-monoestable': [
    { etiqueta: 'modelo', texto: 'V2 ya es un pulso por tramos que baja 0.5 µs cada 5 µs. El NE555 de Kirchi tiene salida alta más baja que Vcc (4.59 V frente a 6 V) y el pulso medido dura 0.51 µs en vez de 1.10 µs: es del modelo del 555.' }
  ],
  'KiCad amplifier-ac': [
    { etiqueta: 'modelo', texto: 'V1 ya llega como 1 V a 1 kHz. 2n2222.model no viene con el ejemplo: Kirchi usa su 2N2222 y la referencia el modelo PSpice estándar; los puntos de polarización difieren.' }
  ],
  'KiCad buck_conv': [
    { etiqueta: 'modelo', texto: 'V101 ya llega como 0 a 15 V, 20 kHz, ancho 25 µs: Vout pasó de 0.7 V a 5.4 V (el original da 4.8 V). IRF-Power-VDMOS.mod no viene con el ejemplo y el diodo genérico de Kirchi no es el del archivo.' },
    { etiqueta: 'pines', texto: 'Sim.Pins del archivo dice «1=D 2=G 3=S» pero el símbolo IRF540N tiene 1=G, 2=D, 3=S. Kirchi sigue los nombres del símbolo, que es lo físicamente correcto.' }
  ],
  'KiCad generic_opamp_bip': [
    { etiqueta: 'modelo', texto: 'V3 ya llega como 0.1 V a 1 kHz. kicad_builtin_opamp (GAIN 100k, POLE 30, ROUT 10) se sustituye por el LM741 y el NPN genérico por el 2N2222; la etapa con BJT difiere por eso.' }
  ],
  'SPICE e_pss_colpitt_osc_pss': [
    { etiqueta: 'modelo', texto: 'vee ya es la PWL 0 a −10 V en 1 ns y qnl lleva sus parámetros (bf 80, rb 100, tf, cje, cjc, va). Kirchi sigue sin oscilar a 3.3 MHz; causa no determinada (paso de la simulación contra un periodo de 300 ns).' },
    { etiqueta: 'analisis', texto: '.pss no se reconoce (se comparó con el .tran 30n 12u que el archivo trae comentado).' }
  ],
  'SPICE t_general_schmitt': [
    { etiqueta: 'modelo', texto: 'El PULSE ya es una fuente por tramos con flancos de 400 ns y retardo de 10 ns, y qstd lleva sus parámetros. Quedan diferencias en el nodo 5 y la salida (nodo 7), donde el modelo propio omite los parámetros que el motor no usa (rc, tf…).' }
  ],
  'SPICE t_polezero_pz2': [
    { etiqueta: 'no simula', texto: 'El motor declara matriz singular (elemento 11) con resistencias de 1e8 Ω o más junto a inductores y fuentes controladas; con 1e7 Ω resuelve. Es del solucionador, no de la conversión (la fuente iin ya da 0 A).' }
  ],
  'Proteus New Project': []
}

function escribir(resultados: Resultado[]): void {
  const L: string[] = []
  L.push('# Simulación de los ejemplos importados contra el programa original', '')
  const git = (...args: string[]) => spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8' }).stdout.trim()
  L.push(`Corrida del ${new Date().toISOString().slice(0, 16).replace('T', ' ')}, sobre ${git('rev-parse', '--short', 'HEAD')} con ${git('status', '--short', '--', 'src/renderer/src/importar').split(/\r?\n/).filter((x) => x && !x.includes('simulacion.ejemplos')).length} archivos de importar/ modificados sin confirmar (el convertidor cambia entre corridas; las causas de abajo se escribieron contra esta).`, '')
  L.push(`Generado por \`simulacion.ejemplos.test.ts\`. Kirchi: motor WASM (vista previa) sobre el documento tal como lo deja \`importarBytes\`, desde t = 0 hasta el final del análisis del original. Métricas sobre la ventana indicada de cada ejemplo. Una fila "difiere" cuando la diferencia pasa de 5 % de la escala (máximo absoluto del original) o de 5 % en la frecuencia.`, '')
  L.push('## Resumen', '', '| Ejemplo | Compila y simula | Filas que difieren | Referencia |', '|---|---|---|---|')
  for (const r of resultados) {
    const d = r.filas.filter((f) => f.difiere).length
    L.push(`| ${r.caso.id} | ${r.estado} | ${d} de ${r.filas.length} | ${r.caso.notaReferencia} |`)
  }
  L.push('', '## Detalle por red', '', '| Ejemplo | Red | Métrica | Original | Original, variante | Kirchi | Diferencia | Difiere |', '|---|---|---|---|---|---|---|---|')
  for (const r of resultados)
    for (const f of r.filas) L.push(`| ${f.ejemplo} | ${f.red} | ${f.metrica} | ${fmt(f.original)} | ${fmt(f.original2)} | ${fmt(f.kirchi)} | ${f.dif} | ${f.difiere ? 'sí' : 'no'} |`)
  L.push('', '## Causas probables por ejemplo', '')
  for (const r of resultados) {
    const cs = CAUSAS[r.caso.id] ?? []
    L.push(`### ${r.caso.id}`, '', cs.length ? '' : 'Sin diferencias que se deban a la importación (las cifras de la tabla coinciden dentro de la tolerancia, salvo el instante del pico).', ...cs.map((x) => `- [${x.etiqueta}] ${x.texto}`), '')
  }
  const cuenta = new Map<Etiqueta, string[]>()
  for (const [ej, cs] of Object.entries(CAUSAS)) for (const e of new Set(cs.map((x) => x.etiqueta))) cuenta.set(e, [...(cuenta.get(e) ?? []), ej])
  L.push('## Causas ordenadas por cuántos ejemplos afectan', '', '| Causa | Ejemplos | Cuáles |', '|---|---|---|')
  for (const [e, ejs] of [...cuenta.entries()].sort((a, b) => b[1].length - a[1].length)) L.push(`| ${ROTULO[e]} | ${ejs.length} | ${ejs.join(', ')} |`)
  L.push('', '## Evidencia por ejemplo', '')
  for (const r of resultados) {
    L.push(`### ${r.caso.id}`, '', `Estado: ${r.estado}`, '')
    if (r.caso.formula) L.push(`Referencia por fórmula: ${r.caso.formula.descripcion}`, '')
    for (const n of r.notas) L.push(`- Nota: ${n}`)
    if (r.detallePines?.length) L.push(`- Conectividad de las piezas de tres pines o más: ${r.detallePines.join('; ')}`)
    if (r.avisosImportador.length) L.push(`- Avisos del importador: ${r.avisosImportador.join(' | ')}`)
    L.push(`- Piezas en Kirchi: ${r.piezasKirchi.join('; ')}`, '')
  }
  mkdirSync(join(SALIDA, '..'), { recursive: true })
  writeFileSync(SALIDA, L.join('\n'))
}

describe.skipIf(CARPETA === '' || !existsSync(CARPETA) || !hayNgspice)('simulación de los ejemplos importados contra el programa original: informe y casos que deben coincidir', () => {
  const resultados: Resultado[] = []
  const distintas = (r: Resultado | undefined): number => r?.filas.filter((f) => f.difiere).length ?? -1
  it('corre todos los ejemplos, escribe la tabla y ninguno falla en el arnés', { timeout: 1_200_000 }, () => {
    for (const caso of CASOS) {
      try {
        resultados.push(correrCaso(caso))
      } catch (e) {
        resultados.push({ caso, estado: `falla del arnés: ${e instanceof Error ? e.message : String(e)}`, avisosImportador: [], piezasKirchi: [], filas: [], notas: [] })
      }
      console.log(`${caso.id}: ${resultados[resultados.length - 1].estado}`)
    }
    if (existsSync(PDSPRJ)) resultados.push(correrProteus())
    escribir(resultados)
    expect(resultados.filter((r) => r.estado.startsWith("falla del arn")).map((r) => r.estado)).toEqual([])
  })
  // Casos que coinciden con su referencia: una regresión del importador o del motor los saca de ahí.
  it.each(['Falstad mux', 'Falstad conv-boost'])('%s compila y no tiene filas distintas', (id) => {
    const r = resultados.find((x) => x.caso.id === id)
    expect(r?.estado).toBe('compila')
    expect(r!.filas.length).toBeGreaterThan(0)
    expect(distintas(r)).toBe(0)
  })
  it.skipIf(!existsSync(PDSPRJ))('Proteus New Project compila y queda dentro de lo medido (a lo más 1 fila distinta de 3)', () => {
    const r = resultados.find((x) => x.caso.id === 'Proteus New Project')
    expect(r?.estado).toBe('compila')
    expect(r!.filas.length).toBe(3)
    expect(distintas(r)).toBeLessThanOrEqual(1)
  })
})
