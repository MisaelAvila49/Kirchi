// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { compilarNetlist } from '../netlist/netlist'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { FAMILIAS, parametrosDeFamilia } from '../netlist/familias'
import { retardoDe } from '../piezas/validarMsi'
import init, { Simulator } from './pkg/kirchi_engine.js'

// Combinacionales de tabla (LUT) y contadores de la Librería en el motor: los casos que ningún chip suelto prueba, con varios chips en una
// red, entradas al aire o las dos puntas de un bus manejadas a la vez.

const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })).memory
})

const CERO = 0
const UNO = 1
const Z = 3
const X = 2

const DC = (ref: string, voltaje: string, red: string): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje }, pines: { '+': red, '-': '0' } })

interface Corrida {
  /** Nivel (0, 1, X = 2, Z = 3) de la salida `j` del elemento LUT `k`. */
  salida: (k: number, j: number) => number
  /** Nivel de la salida de la compuerta `k`. */
  compuerta: (k: number) => number
  tiempo: number
}

function correr(partes: Parte[], fin = 2e-6): Corrida {
  const d = conEtiquetas(lib, partes)
  const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
  expect(r.errores).toEqual([])
  const nl = r.netlist as any
  const sim = new Simulator(JSON.stringify(nl), 1e-9)
  sim.set_tolerances(1e-4, 1e-12, 1e-7)
  sim.advance_to(fin, 1e9)
  const niveles = new Float64Array(memoria.buffer, sim.niveles_ptr(), sim.digital_count()).slice()
  const tiempo = sim.time()
  sim.free()
  const luts = nl.elements.filter((e: any) => e.type === 'LUT')
  const compuertas = nl.elements.filter((e: any) => e.type === 'GATE')
  return {
    salida: (k, j) => niveles[luts[k].rebanadas.flatMap((s: any) => s.salidas)[j]],
    compuerta: (k) => niveles[compuertas[k].output],
    tiempo
  }
}

const aire = (def: string, familia: string): Parte => {
  const pines = Object.fromEntries(lib.get(def)!.pines.map((p) => [p.id, `aire_${p.id}`]))
  return { tipo: def, ref: 'U1', props: { familia }, pines }
}

describe('74LS47: borrado de ceros a la izquierda', () => {
  /** Dos 7447 en cadena: BI/RBO del primero a RBI del segundo. `d1` y `d2` son los dígitos (0 a 15). */
  const cadena = (d1: number, d2: number, rbi1: string, unidos = false): Parte[] => {
    const bits = (d: number, p: string) => ['A', 'B', 'C', 'D'].map((n, k) => DC(`V${p}${n}`, (d >> k) & 1 ? '5' : '0', `${p}${n}`))
    const chip = (ref: string, p: string, rbi: string, birbo: string): Parte => ({
      tipo: 'decodificador-7447',
      ref,
      props: { familia: '74LS' },
      pines: { A: `${p}A`, B: `${p}B`, C: `${p}C`, D: `${p}D`, LT: 'alto', RBI: rbi, 'BI/RBO': birbo, a: `${p}a`, b: `${p}b`, c: `${p}c`, d: `${p}d`, e: `${p}e`, f: `${p}f`, g: `${p}g` }
    })
    return [DC('VALTO', '5', 'alto'), DC('VRBI', rbi1, 'rbi1'), ...bits(d1, 'x'), ...bits(d2, 'y'), chip('U1', 'x', 'rbi1', 'rbo1'), chip('U2', 'y', unidos ? 'alto' : 'rbo1', unidos ? 'rbo1' : 'rbo2')]
  }
  const segmentos = (c: Corrida, k: number) => Array.from({ length: 7 }, (_, j) => c.salida(k, j))

  it('con RBI bajo y un cero, el primero apaga sus siete segmentos y baja BI/RBO, y el segundo también se apaga', () => {
    const c = correr(cadena(0, 0, '0'))
    expect(segmentos(c, 0)).toEqual(Array(7).fill(Z))
    expect(c.salida(0, 7)).toBe(CERO)
    expect(segmentos(c, 1)).toEqual(Array(7).fill(Z))
  })

  it('con un dígito distinto de cero, el primero lo muestra, suelta BI/RBO y el segundo muestra su cero', () => {
    const c = correr(cadena(1, 0, '0'))
    // El 1 enciende b y c; el 0, de la a a la f.
    expect(segmentos(c, 0)).toEqual([Z, CERO, CERO, Z, Z, Z, Z])
    expect(c.salida(0, 7)).toBe(Z)
    expect(segmentos(c, 1)).toEqual([CERO, CERO, CERO, CERO, CERO, CERO, Z])
  })

  it('con BI/RBO de los dos unidos, el que borra su cero apaga también al otro y la corrida termina', () => {
    const c = correr(cadena(0, 5, '0', true))
    expect(segmentos(c, 1)).toEqual(Array(7).fill(Z))
    expect(c.tiempo).toBeGreaterThanOrEqual(2e-6)
    // Con RBI alto el primero muestra su cero, nadie baja la red y el 5 se ve (a, c, d, f y g).
    const d = correr(cadena(0, 5, '5', true))
    expect(segmentos(d, 1)).toEqual([CERO, Z, CERO, CERO, Z, CERO, CERO])
  })
})

describe('74xx245 con los dos lados manejados', () => {
  const montaje = (enA: string, enB: string, datoA: string, datoB: string, dir: Parte): Parte[] => {
    const driver = (ref: string, en: string, dato: string, lado: string): Parte => {
      const pines: Record<string, string> = { '1OE': en, '2OE': en }
      for (let k = 0; k < 4; k++) {
        pines[`1A${k + 1}`] = dato
        pines[`2A${k + 1}`] = dato
        pines[`1Y${k + 1}`] = `${lado}${k + 1}`
        pines[`2Y${k + 1}`] = `${lado}${k + 5}`
      }
      return { tipo: 'bufer-244', ref, props: { familia: '74HC' }, pines }
    }
    const t: Record<string, string> = { DIR: 'dir', OE: 'oe' }
    for (let k = 1; k <= 8; k++) {
      t[`A${k}`] = `a${k}`
      t[`B${k}`] = `b${k}`
    }
    return [DC('VOE', '0', 'oe'), dir, DC('VEA', enA, 'ena'), DC('VEB', enB, 'enb'), DC('VDA', datoA, 'da'), DC('VDB', datoB, 'db'), { tipo: 'transceptor-245', ref: 'U1', props: { familia: '74HC' }, pines: t }, driver('U2', 'ena', 'da', 'a'), driver('U3', 'enb', 'db', 'b')]
  }
  // Las cuatro filas del bus A de U1 (A1 a A8) son las salidas 0 a 7 del 245 en el orden A1, B1, A2, B2…
  const busA = (c: Corrida) => c.salida(0, 0)

  it('el emisor manda cuando el otro lado no está manejado: A1 sigue a B1 con DIR bajo', () => {
    const c = correr(montaje('5', '0', '0', '5', DC('VDIR', '0', 'dir')))
    expect(busA(c)).toBe(UNO)
  })

  it('con el driver de A y el 245 manejando la misma red con datos opuestos, la red queda en X y la corrida termina', () => {
    const c = correr(montaje('0', '0', '0', '5', DC('VDIR', '0', 'dir')))
    expect(busA(c)).toBe(X)
    expect(c.tiempo).toBeGreaterThanOrEqual(2e-6)
  })

  it('cambiar DIR con pulsos de 1 ns no cuelga el motor ni deja una red fuera de 0, 1, Z y X', () => {
    const dir: Parte = { tipo: 'fuente-pulso', ref: 'VDIR', props: { alto: '5', frecuencia: '10M', ciclo: '10 %', ancho: '1n', subida: '10p', bajada: '10p' }, pines: { '+': 'dir', '-': '0' } }
    const c = correr(montaje('5', '5', '0', '5', dir))
    for (let j = 0; j < 16; j++) expect([CERO, UNO, Z, X]).toContain(c.salida(0, j))
    expect(c.tiempo).toBeGreaterThanOrEqual(2e-6)
  })
})

describe('74xx151 con las entradas al aire', () => {
  it('en 74LS cada entrada al aire se lee en alto: el estrobo G desactiva el chip (Y bajo, W alto)', () => {
    const c = correr([aire('multiplexor-151', '74LS')])
    expect([c.salida(0, 0), c.salida(0, 1)]).toEqual([CERO, UNO])
  })

  it('en 74HC cada entrada al aire es desconocida y con las doce las salidas quedan en X', () => {
    const c = correr([aire('multiplexor-151', '74HC')])
    expect([c.salida(0, 0), c.salida(0, 1)]).toEqual([X, X])
  })
})

describe('dos 74xx125 y un estado lógico en la misma red', () => {
  const montaje = (oe1: string): Parte[] => [
    DC('VDATO', '0', 'dato'),
    DC('VOE1', oe1, 'oe1'),
    DC('VOE2', '5', 'oe2'),
    { tipo: 'estado-logico', ref: 'U3', props: { estado: '1' }, pines: { S: 'bus' } },
    { tipo: 'buffer-3-estados', ref: 'U1', props: { familia: '74HC' }, pines: { A: 'dato', OE: 'oe1', Y: 'bus' } },
    { tipo: 'buffer-3-estados', ref: 'U2', props: { familia: '74HC' }, pines: { A: 'dato', OE: 'oe2', Y: 'bus' } }
  ]

  it('con los dos búferes sin habilitar la red toma el estado lógico', () => {
    const c = correr(montaje('5'))
    expect(c.compuerta(0)).toBe(UNO)
  })

  it('un búfer habilitado que lleva un 0 choca con el estado lógico en 1 y la red queda en X', () => {
    const c = correr(montaje('0'))
    expect(c.compuerta(0)).toBe(X)
  })
})

// Contadores MSI: la secuencia de la hoja y las filas de su tabla de función se corren por la netlist y el motor, con cada
// entrada como una fuente por tramos (la misma ruta que un circuito real).

type Nv = 0 | 1
/** Cambios de una entrada: `[instante en ns, nivel]` en orden. */
type Cambios = [number, Nv][]

interface Montaje {
  id: string
  familia: string
  vcc?: string
  inicial: Record<string, Nv>
  cambios: Record<string, Cambios>
  /** Pines que van a la misma red que otro (dos relojes unidos): pin -> pin cuya fuente comparte. */
  unidos?: Record<string, string>
}

/** La pieza con una fuente por tramos en cada entrada; devuelve cómo leer cada salida en un instante (en ns). */
function montarMsi(m: Montaje) {
  const volt = Number.parseFloat(m.vcc ?? '5 V')
  const def = lib.get(m.id)!
  const salidas = Object.keys((def.modelo as any).salidas)
  const partes: Parte[] = []
  const pines: Record<string, string> = {}
  for (const p of def.pines) {
    if (salidas.includes(p.id)) {
      pines[p.id] = `o_${p.id}`
      continue
    }
    if (m.unidos?.[p.id]) {
      pines[p.id] = `i_${m.unidos[p.id]}`
      continue
    }
    const ini = m.inicial[p.id]
    if (ini === undefined) throw new Error(`${m.id}: falta el nivel inicial de ${p.id}`)
    pines[p.id] = `i_${p.id}`
    const pts: string[] = [`0 ${ini * volt}`]
    let previo = ini
    let ultimo = 0
    for (const [ns, nivel] of m.cambios[p.id] ?? []) {
      if (!Number.isInteger(ns) || ns < ultimo + 1) throw new Error(`${m.id}: cambio de ${p.id} en ${ns} ns fuera de orden o a menos de 2 ns del anterior`)
      pts.push(`${ns}n ${previo * volt}`, `${ns}.0001n ${nivel * volt}`)
      previo = nivel
      ultimo = ns
    }
    partes.push({ tipo: 'fuente-pwl', ref: `V${partes.length + 1}`, props: { puntos: pts.join(', ') }, pines: { '+': `i_${p.id}`, '-': '0' } })
  }
  partes.push({ tipo: m.id, ref: 'U1', props: { familia: m.familia, alimentacion: m.vcc ?? '5 V' }, pines })
  const d = conEtiquetas(lib, partes)
  const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
  expect(r.errores).toEqual([])
  const nl = r.netlist as any
  const e = nl.elements.find((x: any) => x.type === 'MSI')
  const red = (pin: string): number => e.salidas[salidas.indexOf(pin)]
  const sim = new Simulator(JSON.stringify(nl), 1e-9)
  sim.set_tolerances(1e-4, 1e-12, 1e-7)
  const leer = (ns: number): ((pin: string) => number) => {
    sim.advance_to(ns * 1e-9, 1e9)
    const niveles = new Float64Array(memoria.buffer, sim.niveles_ptr(), sim.digital_count())
    const copia = niveles.slice()
    return (pin) => copia[red(pin)]
  }
  return { leer, liberar: () => sim.free() }
}

/** La cuenta en QA a QD, o el índice de la única salida Qn en alto (4017); -1 si alguna no está definida. */
function cuentaDe(id: string, lee: (pin: string) => number): number {
  if (id === 'contador-4017') {
    const altas = Array.from({ length: 10 }, (_, k) => k).filter((k) => lee(`Q${k}`) === UNO)
    const definidas = Array.from({ length: 10 }, (_, k) => lee(`Q${k}`)).every((v) => v === CERO || v === UNO)
    return definidas && altas.length === 1 ? altas[0] : -1
  }
  const bits = ['QA', 'QB', 'QC', 'QD'].map(lee)
  return bits.every((v) => v === CERO || v === UNO) ? bits.reduce<number>((a, v, k) => a + v * 2 ** k, 0) : -1
}

/** Una salida de la hoja: `cuenta` de un contador; `Q` la cadena QA a QH de un registro y `Z` si las ocho están en alta impedancia. */
function salidaDe(id: string, pin: string, lee: (pin: string) => number): string | boolean | number | null {
  if (pin === 'cuenta') return cuentaDe(id, lee)
  if (pin === 'Q') return 'ABCDEFGH'.split('').map((c) => ({ [CERO]: '0', [UNO]: '1', [Z]: 'z' })[lee(`Q${c}`)] ?? 'x').join('')
  if (pin === 'Z') return 'ABCDEFGH'.split('').every((c) => lee(`Q${c}`) === Z)
  // El contenido del registro paralelo del 165 no tiene patilla: la hoja lo anota y el chip lo muestra por QH.
  if (pin === 'registro') return null
  return lee(pin)
}

const secuencias = import.meta.glob('../piezas/__fixtures__/secuencias/*.json', { eager: true, import: 'default' }) as Record<string, any>

/** Corre la secuencia de la hoja de `id` con el periodo de reloj `periodo` (ns) y devuelve las muestras que no coinciden. */
function correrSecuencia(id: string, familia: string, periodo: number, vcc = '5 V'): string[] {
  const h = secuencias[`../piezas/__fixtures__/secuencias/${id}.json`]
  const instantes: number[] = [...h.pasos.map((p: any) => p.t), ...h.muestras.map((x: any) => x.t), ...h.relojes.flatMap((r: any) => [...r.subidas, ...r.bajadas])]
  const desfase = Math.ceil(-Math.min(...instantes)) + 1
  const ns = (t: number) => Math.round((t + desfase) * periodo)
  const inicial: Record<string, Nv> = { ...h.inicial }
  const cambios: Record<string, Cambios> = {}
  for (const r of h.relojes) {
    inicial[r.senal] = r.inicial
    cambios[r.senal] = [...r.subidas.map((t: number): [number, Nv] => [ns(t), 1]), ...r.bajadas.map((t: number): [number, Nv] => [ns(t), 0])].sort((a, b) => a[0] - b[0])
  }
  for (const paso of h.pasos) for (const [pin, nivel] of Object.entries(paso.entradas) as [string, Nv][]) (cambios[pin] ??= []).push([ns(paso.t), nivel])
  for (const lista of Object.values(cambios)) lista.sort((a, b) => a[0] - b[0])
  const { leer, liberar } = montarMsi({ id, familia, vcc, inicial, cambios })
  const fallas: string[] = []
  const muestras = h.muestras.filter((x: any) => !x.solo || x.solo.some((s: string) => id.endsWith(s))).sort((a: any, b: any) => a.t - b.t)
  for (const x of muestras) {
    const lee = leer(ns(x.t))
    for (const [pin, esperado] of Object.entries(x.salidas) as [string, number][]) {
      const obtenido = salidaDe(id, pin, lee)
      if (obtenido !== null && obtenido !== esperado) fallas.push(`${familia} t = ${x.t}: ${pin} dio ${obtenido} y la hoja dice ${esperado} (${x.origen})`)
    }
  }
  liberar()
  return fallas
}

describe('contadores: la secuencia de la hoja', () => {
  // Periodo de reloj de 1 µs (10 veces el retardo máximo de la hoja); el CD4017B es lento y lleva 20 µs.
  const casos: [string, string, number][] = [['contador-161', '74HC', 1000], ['contador-161', '74LS', 1000], ['contador-163', '74HC', 1000], ['contador-163', '74LS', 1000], ['contador-190', '74HC', 1000], ['contador-190', '74LS', 1000], ['contador-193', '74HC', 1000], ['contador-193', '74LS', 1000], ['contador-4017', 'CD4000B', 20000], ['contador-4017', '74HC', 1000]]
  it.each(casos)('%s en %s sigue las muestras de la figura', (id, familia, periodo) => {
    expect(correrSecuencia(id, familia, periodo)).toEqual([])
  })
})

interface PasoFuncion {
  /** Entradas que cambian al empezar el ciclo. */
  poner?: Record<string, Nv>
  /** Reloj que da su flanco activo en este ciclo. */
  reloj?: string
  /** Cuenta esperada al final del ciclo (QA a QD, o la salida Qn en alto del 4017). */
  cuenta?: number
  /** Otras salidas esperadas. */
  sal?: Record<string, number>
}

/** Recorre una lista de ciclos: al empezar cambian las entradas, a la mitad llega el flanco del reloj y al final se lee. */
function correrFuncion(id: string, familia: string, reposo: Record<string, Nv>, pasos: PasoFuncion[], opciones: { vcc?: string; ciclo?: number } = {}): string[] {
  const ciclo = opciones.ciclo ?? 1000
  const u = ciclo / 1000
  const cambios: Record<string, Cambios> = {}
  const nivel: Record<string, Nv> = { ...reposo }
  const poner = (pin: string, t: number, v: Nv) => {
    if (nivel[pin] === v) return
    ;(cambios[pin] ??= []).push([Math.round(t), v])
    nivel[pin] = v
  }
  const sondeos: { t: number; paso: PasoFuncion; k: number }[] = []
  pasos.forEach((paso, k) => {
    const t0 = 2 * ciclo + k * ciclo
    for (const [pin, v] of Object.entries(paso.poner ?? {})) poner(pin, t0 + 100 * u, v)
    if (paso.reloj) {
      const reposoDe = reposo[paso.reloj]
      poner(paso.reloj, t0 + 400 * u, (1 - reposoDe) as Nv)
      poner(paso.reloj, t0 + 700 * u, reposoDe)
    }
    sondeos.push({ t: t0 + 950 * u, paso, k })
  })
  const { leer, liberar } = montarMsi({ id, familia, vcc: opciones.vcc, inicial: reposo, cambios })
  const fallas: string[] = []
  for (const { t, paso, k } of sondeos) {
    const lee = leer(t)
    if (paso.cuenta !== undefined && cuentaDe(id, lee) !== paso.cuenta) fallas.push(`${familia} ciclo ${k + 1}: la cuenta es ${cuentaDe(id, lee)} y debía ser ${paso.cuenta}`)
    for (const [pin, esperado] of Object.entries(paso.sal ?? {})) if (lee(pin) !== esperado) fallas.push(`${familia} ciclo ${k + 1}: ${pin} es ${lee(pin)} y debía ser ${esperado}`)
  }
  liberar()
  return fallas
}

describe('contadores: las filas de la tabla de función', () => {
  const reposo161: Record<string, Nv> = { CLK: 0, CLR: 1, LOAD: 1, ENP: 1, ENT: 1, A: 0, B: 0, C: 0, D: 0 }
  // El 161 borra al instante con CLR bajo; el 163 espera el flanco. En el resto son iguales.
  const base = (sincrono: boolean): PasoFuncion[] => [
    { poner: { A: 1, C: 1, LOAD: 0 }, reloj: 'CLK', cuenta: 5 },
    { poner: { LOAD: 1 }, reloj: 'CLK', cuenta: 6 },
    { poner: { ENP: 0 }, reloj: 'CLK', cuenta: 6 },
    { poner: { ENP: 1, ENT: 0 }, reloj: 'CLK', cuenta: 6 },
    { poner: { ENT: 1 }, reloj: 'CLK', cuenta: 7 },
    { poner: { LOAD: 0, A: 0, B: 1, C: 1, ENP: 0, ENT: 0 }, cuenta: 7 },
    { reloj: 'CLK', cuenta: 6 },
    { poner: { LOAD: 1, ENP: 1, ENT: 1 }, cuenta: 6 },
    { poner: { CLR: 0 }, cuenta: sincrono ? 6 : 0 },
    { reloj: 'CLK', cuenta: 0 },
    { poner: { LOAD: 0, A: 1, B: 1, C: 1, D: 1 }, reloj: 'CLK', cuenta: 0 },
    { poner: { CLR: 1 }, reloj: 'CLK', cuenta: 15, sal: { RCO: 1 } },
    { poner: { LOAD: 1, ENT: 0 }, sal: { RCO: 0 }, cuenta: 15 },
    { poner: { ENT: 1 }, sal: { RCO: 1 }, cuenta: 15 },
    { reloj: 'CLK', cuenta: 0, sal: { RCO: 0 } }
  ]
  it.each([['contador-161', false], ['contador-163', true]] as const)('%s: carga, cuenta, retención, borrado y RCO', (id, sincrono) => {
    // Retiene con ENP o con ENT bajos, LOAD bajo espera el flanco y carga aunque ENP y ENT estén bajos, y el borrado manda sobre la carga.
    for (const familia of ['74HC', '74LS']) expect(correrFuncion(id, familia, reposo161, base(sincrono))).toEqual([])
  })
})

describe('contador-190: década, sentido, habilitación, carga asíncrona, MAX/MIN y RCO', () => {
  const reposo: Record<string, Nv> = { CLK: 0, LOAD: 1, 'D/U': 0, CTEN: 0, A: 0, B: 0, C: 0, D: 0 }
  const pasos: PasoFuncion[] = [
    { poner: { A: 1, D: 1, LOAD: 0 }, cuenta: 9 },
    // Con CLK y CTEN en bajo y MAX/MIN en alto, RCO baja; con CTEN en alto sube.
    { poner: { LOAD: 1 }, cuenta: 9, sal: { 'MAX/MIN': 1, RCO: 0 } },
    { poner: { CTEN: 1 }, cuenta: 9, sal: { 'MAX/MIN': 1, RCO: 1 } },
    { poner: { CTEN: 0 }, reloj: 'CLK', cuenta: 0, sal: { 'MAX/MIN': 0, RCO: 1 } },
    { poner: { 'D/U': 1 }, reloj: 'CLK', cuenta: 9, sal: { 'MAX/MIN': 0 } },
    { reloj: 'CLK', cuenta: 8 },
    { poner: { CTEN: 1 }, reloj: 'CLK', cuenta: 8 },
    { poner: { CTEN: 0, 'D/U': 0 }, reloj: 'CLK', cuenta: 9 },
    { poner: { LOAD: 0, A: 1, B: 0, C: 1, D: 0 }, reloj: 'CLK', cuenta: 5 },
    { poner: { LOAD: 1 }, reloj: 'CLK', cuenta: 6 }
  ]
  it.each(['74HC', '74LS'])('%s: sigue las filas de la hoja', (familia) => {
    expect(correrFuncion('contador-190', familia, reposo, pasos)).toEqual([])
  })
})

describe('contador-193: dos relojes, borrado que manda sobre la carga, CO y BO', () => {
  const reposo: Record<string, Nv> = { UP: 1, DOWN: 1, CLR: 0, LOAD: 1, A: 0, B: 0, C: 0, D: 0 }
  const pasos: PasoFuncion[] = [
    { poner: { CLR: 1 }, cuenta: 0 },
    { poner: { CLR: 0 }, reloj: 'UP', cuenta: 1 },
    { reloj: 'UP', cuenta: 2 },
    { reloj: 'DOWN', cuenta: 1 },
    { poner: { A: 1, B: 1, D: 1, LOAD: 0 }, cuenta: 11 },
    // El borrado manda sobre la carga y, al soltarlo, la carga que sigue activa vuelve a cargar.
    { poner: { CLR: 1 }, cuenta: 0 },
    { poner: { CLR: 0 }, cuenta: 11 },
    { poner: { LOAD: 1 }, reloj: 'UP', cuenta: 12 },
    { poner: { LOAD: 0, A: 1, B: 1, C: 1, D: 1 }, cuenta: 15 },
    { poner: { LOAD: 1 }, cuenta: 15, sal: { CO: 1, BO: 1 } },
    { poner: { UP: 0 }, cuenta: 15, sal: { CO: 0, BO: 1 } },
    { poner: { UP: 1 }, cuenta: 0, sal: { CO: 1, BO: 1 } },
    { poner: { DOWN: 0 }, cuenta: 0, sal: { CO: 1, BO: 0 } },
    { poner: { DOWN: 1 }, cuenta: 15, sal: { BO: 1 } },
    // Un flanco de UP con DOWN en bajo no cuenta; al subir DOWN con UP en alto cuenta hacia abajo.
    { poner: { DOWN: 0 }, reloj: 'UP', cuenta: 15 },
    { poner: { DOWN: 1 }, cuenta: 14 }
  ]
  it.each(['74HC', '74LS'])('%s: sigue las filas de la hoja', (familia) => {
    expect(correrFuncion('contador-193', familia, reposo, pasos)).toEqual([])
  })
})

describe('contador-4017: reloj y no INH, borrado, diez salidas y CO', () => {
  const reposo: Record<string, Nv> = { CLK: 0, INH: 0, RESET: 0 }
  const pasos: PasoFuncion[] = [
    { reloj: 'CLK', cuenta: 1, sal: { CO: 1 } },
    { reloj: 'CLK', cuenta: 2 },
    { reloj: 'CLK', cuenta: 3 },
    { reloj: 'CLK', cuenta: 4, sal: { CO: 1 } },
    { reloj: 'CLK', cuenta: 5, sal: { CO: 0 } },
    { poner: { INH: 1 }, reloj: 'CLK', cuenta: 5 },
    { poner: { INH: 0 }, cuenta: 5 },
    { reloj: 'CLK', cuenta: 6 },
    // Con INH en alto la subida de CLK no cuenta; al bajar INH con CLK en alto, CLK y no INH sube y cuenta.
    { poner: { INH: 1 }, cuenta: 6 },
    { poner: { CLK: 1 }, cuenta: 6 },
    { poner: { INH: 0 }, cuenta: 7 },
    { poner: { CLK: 0 }, cuenta: 7 },
    { poner: { RESET: 1 }, cuenta: 0, sal: { CO: 1 } },
    { reloj: 'CLK', cuenta: 0 },
    { poner: { RESET: 0 }, reloj: 'CLK', cuenta: 1 },
    ...Array.from({ length: 8 }, (_, k): PasoFuncion => ({ reloj: 'CLK', cuenta: k + 2 })),
    { reloj: 'CLK', cuenta: 0, sal: { CO: 1 } }
  ]
  it.each([['CD4000B', 20000], ['74HC', 1000]] as const)('%s: sigue las filas de la hoja', (familia, ciclo) => {
    expect(correrFuncion('contador-4017', familia, reposo, pasos, { ciclo })).toEqual([])
  })
})

describe('contadores: el retardo del reloj a la primera salida que cambia', () => {
  const hojas = import.meta.glob('../piezas/__fixtures__/retardos/contador-*.json', { eager: true, import: 'default' }) as Record<string, any>
  const comunes = { A: 0, B: 0, C: 0, D: 0 } as const
  const CONFIG: Record<string, { reposo: Record<string, Nv>; reloj: string; salidas: string[] }> = {
    'contador-161': { reposo: { CLK: 0, CLR: 1, LOAD: 1, ENP: 1, ENT: 1, ...comunes }, reloj: 'CLK', salidas: ['QA', 'QB', 'QC', 'QD'] },
    'contador-163': { reposo: { CLK: 0, CLR: 1, LOAD: 1, ENP: 1, ENT: 1, ...comunes }, reloj: 'CLK', salidas: ['QA', 'QB', 'QC', 'QD'] },
    'contador-190': { reposo: { CLK: 0, LOAD: 1, 'D/U': 0, CTEN: 0, ...comunes }, reloj: 'CLK', salidas: ['QA', 'QB', 'QC', 'QD'] },
    'contador-193': { reposo: { UP: 1, DOWN: 1, CLR: 0, LOAD: 1, ...comunes }, reloj: 'UP', salidas: ['QA', 'QB', 'QC', 'QD'] },
    'contador-4017': { reposo: { CLK: 0, INH: 0, RESET: 0 }, reloj: 'CLK', salidas: Array.from({ length: 10 }, (_, k) => `Q${k}`) }
  }
  const casos = Object.keys(CONFIG).flatMap((id) => Object.keys((lib.get(id)!.modelo as any).retardos).map((familia) => [id, familia] as const))

  it.each(casos)('%s en %s: el motor tarda lo que dice el modelo y no más que el máximo de la hoja', (id, familia) => {
    const cfg = CONFIG[id]
    const juego = (lib.get(id)!.modelo as any).retardos[familia]
    const maximos: number[] = []
    const recoger = (o: unknown, clave = '') => {
      if (typeof o === 'number') {
        if (clave === 'max') maximos.push(o)
      } else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) recoger(v, k)
    }
    recoger(hojas[`../piezas/__fixtures__/retardos/${id}.json`].familias[familia].caminos)
    const tA = 5000
    const reposo = cfg.reposo[cfg.reloj]
    const cambios: Record<string, Cambios> = { [cfg.reloj]: reposo ? [[tA - 1000, 0], [tA, 1]] : [[tA, 1]] }
    const { leer, liberar } = montarMsi({ id, familia, vcc: `${juego.vcc} V`, inicial: cfg.reposo, cambios })
    const antes = leer(tA - 100)
    const previos = cfg.salidas.map(antes)
    let medido = -1
    let cambio = ''
    let nuevo = 0
    for (let t = tA; t < tA + 800 && medido < 0; t++) {
      const lee = leer(t)
      cfg.salidas.forEach((pin, k) => {
        if (medido < 0 && lee(pin) !== previos[k]) {
          medido = t - tA
          cambio = pin
          nuevo = lee(pin)
        }
      })
    }
    liberar()
    expect(medido, 'alguna salida cambia').toBeGreaterThan(0)
    const esperado = retardoDe(juego, cambio)![nuevo === UNO ? 0 : 1] * 1e9
    // El motor retrasa la red digital la mitad de la transición de la salida: el 50 % del flanco físico cae en el retardo del modelo.
    const k = parametrosDeFamilia(FAMILIAS.familias[familia], juego.vcc)
    const al50 = medido + ((nuevo === UNO ? k.t_rise : k.t_fall) * 1e9) / 2
    expect(Math.abs(al50 - esperado)).toBeLessThanOrEqual(2)
    expect(al50).toBeLessThanOrEqual(Math.max(...maximos))
  })
})

describe('registros: la secuencia de la hoja', () => {
  const casos = ['registro-164', 'registro-165', 'registro-595'].flatMap((id) => ['74HC', '74LS'].map((familia) => [id, familia] as const))
  it.each(casos)('%s en %s sigue las muestras de la figura', (id, familia) => {
    expect(correrSecuencia(id, familia, 1000)).toEqual([])
  })
})

const BITS8 = 'ABCDEFGH'.split('')
const salidas8 = (v: number[]): Record<string, number> => Object.fromEntries(BITS8.map((c, k) => [`Q${c}`, v[k]]))

describe('registro-164: las filas de la tabla de función', () => {
  const reposo: Record<string, Nv> = { CLK: 0, CLR: 1, A: 0, B: 0 }
  it.each(['74HC', '74LS'])('%s: desplaza A y B, retiene sin flanco y se borra al instante', (familia) => {
    // Cada paso: lo que cambia y si hay flanco. El estado esperado sale de la tabla de la hoja.
    const guion: { poner?: Record<string, Nv>; reloj?: boolean }[] = [
      { poner: { A: 1, B: 1 }, reloj: true }, { poner: { B: 0 }, reloj: true }, { poner: { B: 1 }, reloj: true }, { poner: { A: 0 }, reloj: true },
      { poner: { A: 1 }, reloj: true }, { reloj: true }, { reloj: true }, { reloj: true }, { reloj: true },
      { poner: { A: 0 } }, { poner: { CLR: 0 } }, { poner: { A: 1 }, reloj: true }, { poner: { CLR: 1 }, reloj: true }, { poner: { A: 0 } }, { reloj: true }
    ]
    const nivel: Record<string, Nv> = { ...reposo }
    let q: number[] = Array(8).fill(0)
    const pasos: PasoFuncion[] = guion.map((g) => {
      Object.assign(nivel, g.poner)
      if (g.poner?.CLR === 0) q = Array(8).fill(0)
      if (g.reloj && nivel.CLR === 1) q = [nivel.A & nivel.B, ...q.slice(0, 7)]
      return { poner: g.poner, ...(g.reloj ? { reloj: 'CLK' } : {}), sal: salidas8(q) }
    })
    expect(correrFuncion('registro-164', familia, reposo, pasos)).toEqual([])
  })
})

describe('registro-165: las filas de la tabla de función', () => {
  const reposo: Record<string, Nv> = { 'SH/LD': 1, CLK: 0, 'CLK INH': 0, SER: 0, A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0 }
  it.each(['74HC', '74LS'])('%s: carga por nivel, desplaza con CLK o con CLK INH y se inhibe con CLK INH alto', (familia) => {
    const guion: { poner?: Record<string, Nv>; reloj?: boolean }[] = [
      { poner: { A: 1, C: 1, E: 1, G: 1, H: 1, 'SH/LD': 0 } },
      // Con SH/LD bajo el reloj no desplaza y los datos que cambian entran solos.
      { reloj: true }, { poner: { H: 0 } }, { poner: { 'SH/LD': 1 } },
      { reloj: true }, { poner: { SER: 1 }, reloj: true }, { reloj: true },
      // CLK INH sube con CLK bajo: la O de los dos sube y desplaza; con INH alto el reloj no hace nada.
      { poner: { 'CLK INH': 1 } }, { reloj: true }, { reloj: true }, { poner: { 'CLK INH': 0 } },
      { reloj: true }, { reloj: true }, { reloj: true }, { reloj: true }, { reloj: true }
    ]
    const nivel: Record<string, Nv> = { ...reposo }
    let r: number[] = Array(8).fill(0)
    const pasos: PasoFuncion[] = guion.map((g) => {
      const antes = nivel['CLK INH']
      Object.assign(nivel, g.poner)
      if (nivel['SH/LD'] === 0) r = BITS8.map((c) => nivel[c])
      else if (antes === 0 && nivel['CLK INH'] === 1) r = [nivel.SER, ...r.slice(0, 7)]
      if (g.reloj && nivel['SH/LD'] === 1 && nivel['CLK INH'] === 0) r = [nivel.SER, ...r.slice(0, 7)]
      return { poner: g.poner, ...(g.reloj ? { reloj: 'CLK' } : {}), sal: { QH: r[7], QHN: 1 - r[7] } }
    })
    expect(correrFuncion('registro-165', familia, reposo, pasos)).toEqual([])
  })
})

describe('registro-595: las filas de la tabla de función', () => {
  const reposo: Record<string, Nv> = { SER: 0, SRCLK: 0, RCLK: 0, SRCLR: 1, OE: 0 }
  it.each(['74HC', '74LS'])('%s: desplaza, almacena aparte, saca en tres estados y borra solo el desplazamiento', (familia) => {
    const guion: { poner?: Record<string, Nv>; reloj?: string }[] = [
      { poner: { SER: 1 }, reloj: 'SRCLK' }, { poner: { SER: 0 }, reloj: 'SRCLK' }, { reloj: 'RCLK' }, { reloj: 'SRCLK' }, { reloj: 'SRCLK' }, { reloj: 'RCLK' },
      { poner: { OE: 1 } }, { poner: { SER: 1 }, reloj: 'SRCLK' }, { reloj: 'RCLK' }, { poner: { OE: 0, SER: 0 } },
      { poner: { SRCLR: 0 } }, { reloj: 'SRCLK' }, { reloj: 'RCLK' }, { poner: { SRCLR: 1, SER: 1 }, reloj: 'SRCLK' }, { reloj: 'SRCLK' }, { reloj: 'RCLK' }
    ]
    const nivel: Record<string, Nv> = { ...reposo }
    let sr: number[] = Array(8).fill(0)
    let alm: number[] = Array(8).fill(0)
    const pasos: PasoFuncion[] = guion.map((g) => {
      Object.assign(nivel, g.poner)
      if (nivel.SRCLR === 0) sr = Array(8).fill(0)
      else if (g.reloj === 'SRCLK') sr = [nivel.SER, ...sr.slice(0, 7)]
      if (g.reloj === 'RCLK') alm = [...sr]
      return { poner: g.poner, ...(g.reloj ? { reloj: g.reloj } : {}), sal: { ...salidas8(nivel.OE ? Array(8).fill(Z) : alm), "QH'": sr[7] } }
    })
    expect(correrFuncion('registro-595', familia, reposo, pasos)).toEqual([])
  })

  it.each(['74HC', '74LS'])('%s: con SRCLK y RCLK unidos el almacén va un pulso detrás del desplazamiento', (familia) => {
    const cambios: Record<string, Cambios> = { SRCLK: [] }
    for (let k = 0; k < 4; k++) cambios.SRCLK.push([3000 + 2000 * k, 1], [4000 + 2000 * k, 0])
    const { leer, liberar } = montarMsi({ id: 'registro-595', familia, inicial: { SER: 1, SRCLK: 0, SRCLR: 1, OE: 0 }, cambios, unidos: { RCLK: 'SRCLK' } })
    const q = (ns: number) => salidaDe('registro-595', 'Q', leer(ns))
    // Tras el pulso k el desplazamiento tiene k unos y el almacén los k - 1 del pulso anterior.
    expect([q(2000), q(5000), q(7000), q(9000), q(11000)]).toEqual(['00000000', '00000000', '10000000', '11000000', '11100000'])
    liberar()
  })
})

describe('registros: el retardo de la señal que cambia a la primera salida que cambia', () => {
  const hojas = import.meta.glob('../piezas/__fixtures__/retardos/registro-*.json', { eager: true, import: 'default' }) as Record<string, any>
  const tA = 10000
  // Siete pulsos de SRCLK con SER en alto y el octavo en tA: QH' sube con el octavo.
  const ochoPulsos: Cambios = [...Array.from({ length: 7 }, (_, k): Cambios => [[1000 + 1000 * k, 1], [1500 + 1000 * k, 0]]).flat(), [tA, 1]]
  interface Caso {
    id: string
    reposo: Record<string, Nv>
    cambios: Record<string, Cambios>
    salidas: string[]
  }
  const CASOS: Record<string, Caso> = {
    'registro-164': { id: 'registro-164', reposo: { CLK: 0, CLR: 1, A: 1, B: 1 }, cambios: { CLK: [[tA, 1]] }, salidas: BITS8.map((c) => `Q${c}`) },
    // SH/LD baja con H en alto: QH sube y QHN baja por la carga asíncrona.
    'registro-165': { id: 'registro-165', reposo: { 'SH/LD': 1, CLK: 0, 'CLK INH': 0, SER: 0, A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 1 }, cambios: { 'SH/LD': [[tA, 0]] }, salidas: ['QH', 'QHN'] },
    'registro-595': { id: 'registro-595', reposo: { SER: 1, SRCLK: 0, RCLK: 0, SRCLR: 1, OE: 0 }, cambios: { SRCLK: [[1000, 1], [1500, 0]], RCLK: [[tA, 1]] }, salidas: BITS8.map((c) => `Q${c}`) },
    "registro-595 (QH')": { id: 'registro-595', reposo: { SER: 1, SRCLK: 0, RCLK: 0, SRCLR: 1, OE: 0 }, cambios: { SRCLK: ochoPulsos }, salidas: ["QH'"] }
  }
  const casos = Object.entries(CASOS).flatMap(([nombre, c]) => Object.keys((lib.get(c.id)!.modelo as any).retardos).map((familia) => [nombre, familia] as const))

  it.each(casos)('%s en %s: el motor tarda lo que dice el modelo y no más que el máximo de la hoja', (nombre, familia) => {
    const cfg = CASOS[nombre]
    const juego = (lib.get(cfg.id)!.modelo as any).retardos[familia]
    const maximos: number[] = []
    const recoger = (o: unknown, clave = '') => {
      if (typeof o === 'number') {
        if (clave === 'max') maximos.push(o)
      } else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) recoger(v, k)
    }
    recoger(hojas[`../piezas/__fixtures__/retardos/${cfg.id}.json`].familias[familia].caminos)
    const { leer, liberar } = montarMsi({ id: cfg.id, familia, vcc: `${juego.vcc} V`, inicial: cfg.reposo, cambios: cfg.cambios })
    const previos = cfg.salidas.map(leer(tA - 100))
    let medido = -1
    let cambio = ''
    let nuevo = 0
    for (let t = tA; t < tA + 800 && medido < 0; t++) {
      const lee = leer(t)
      cfg.salidas.forEach((pin, k) => {
        if (medido < 0 && lee(pin) !== previos[k]) {
          medido = t - tA
          cambio = pin
          nuevo = lee(pin)
        }
      })
    }
    liberar()
    expect(medido, 'alguna salida cambia').toBeGreaterThan(0)
    const esperado = retardoDe(juego, cambio)![nuevo === UNO ? 0 : 1] * 1e9
    // El motor retrasa la red digital la mitad de la transición de la salida: el 50 % del flanco físico cae en el retardo del modelo.
    const k = parametrosDeFamilia(FAMILIAS.familias[familia], juego.vcc)
    const al50 = medido + ((nuevo === UNO ? k.t_rise : k.t_fall) * 1e9) / 2
    expect(Math.abs(al50 - esperado)).toBeLessThanOrEqual(2)
    expect(al50).toBeLessThanOrEqual(Math.max(...maximos))
  })
})
