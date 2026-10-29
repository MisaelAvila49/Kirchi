// @vitest-environment happy-dom
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { FuenteMsi, NetlistMotor, NucleoMsi, RelojMsi, SalidaMsi, SenalMsi } from '../../../compartido/netlistMotor'
import { armarMazo, validarPeticion } from '../../../compartido/spice/mazo'
import { carpetaHerramientas } from '../../../main/recursos'
import { localizarNgspice, ServicioNgspice } from '../../../main/servicioNgspice'
import { calcularConexiones } from '../conexiones/conexiones'
import { armarBanco, claseDeVoltaje, onda, pulsos, pulsosBajos, unir, type Banco, type Onda } from '../prueba/bancoDigital'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { conPiezas, piezaDePrueba } from '../prueba/piezasNuevas'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { compilarNetlist } from './netlist'

// Los elementos genéricos LUT y MSI exportados a XSPICE dan la misma secuencia de niveles que el motor: las mismas entradas entran
// a los dos y cada salida se muestrea cada 0.1 ns. Un nivel de ngspice vale si el motor lo tuvo a menos de 0.3 ns. Sin
// `herramientas/ngspice` se omite (ngspice no se distribuye ni está en CI).

const raiz = join(import.meta.dirname, '../../../..')
const ejecutable = localizarNgspice({ empaquetado: false, carpetaHerramientas: carpetaHerramientas({ empaquetado: false, resourcesPath: '', appPath: raiz }), appPath: raiz })
const hay = (() => {
  if (!ejecutable) return false
  const r = spawnSync(ejecutable, ['-n', '-v'], { encoding: 'utf8', windowsHide: true })
  return /ngspice-47\b/.test(`${r.stdout}${r.stderr}`)
})()
if (!hay) console.warn('ngspice 47 no está en herramientas/ngspice: se omite la prueba de la síntesis contra ngspice.')

const servicio = new ServicioNgspice({ ejecutable: ejecutable ?? 'ngspice', limiteMs: 120_000 })

let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(raiz, 'src/renderer/src/sim/pkg/kirchi_engine_bg.wasm')) })).memory
})

const PASO_NS = 0.1
const VENTANA = 3

/** Interpola el voltaje de un vector de ngspice (tiempos crecientes) en el instante `t`. */
function enInstante(ts: Float64Array, v: Float64Array, t: number): number {
  let lo = 0
  let hi = ts.length - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (ts[m] >= t) hi = m
    else lo = m
  }
  const [t0, t1] = [ts[lo], ts[hi]]
  return t1 === t0 || t <= t0 ? v[lo] : t >= t1 ? v[hi] : v[lo] + ((v[hi] - v[lo]) * (t - t0)) / (t1 - t0)
}

/** Corre el banco en el motor y en ngspice y devuelve los niveles de ngspice que el motor no tuvo cerca, y cuántos cambios y comparaciones hubo. */
async function contraElMotor(banco: Banco, finNs: number): Promise<{ distintos: string[]; cambios: number; comparados: number }> {
  const res = await servicio.ejecutar(1, { netlist: banco.netlist, analisis: { tipo: 'tran', paso: 1e-9, fin: finNs * 1e-9, maximo: 5e-11, uic: true } })
  if (!res.ok) throw new Error(res.error)
  const g = res.graficos[0]
  const ts = g.vectores[0].re
  const muestras = Math.floor(finNs / PASO_NS) + 1
  const sim = new Simulator(JSON.stringify(banco.netlist), 1e-9)
  sim.set_tolerances(1e-4, 1e-12, 1e-7)
  const redes = sim.digital_count()
  const motor = Array.from({ length: banco.salidas }, () => new Int8Array(muestras))
  for (let k = 0; k < muestras; k++) {
    sim.advance_to(k * PASO_NS * 1e-9, 1e9)
    const niveles = new Float64Array(memoria.buffer, sim.niveles_ptr(), redes)
    for (let j = 0; j < banco.salidas; j++) motor[j][k] = niveles[banco.entradas + j]
  }
  sim.free()
  const distintos: string[] = []
  let cambios = 0
  let comparados = 0
  for (let j = 0; j < banco.salidas; j++) {
    const v = g.vectores.find((x) => x.referencia.tipo === 'nodo' && x.referencia.nodo === banco.primerNodoSalida + j)!.re
    let anterior: number | null = null
    for (let k = 0; k < muestras; k++) {
      const n = claseDeVoltaje(enInstante(ts, v, k * PASO_NS * 1e-9))
      if (n === null) continue
      if (anterior !== null && n !== anterior) cambios++
      anterior = n
      // Un X o un Z del motor no se compara: el puente de ngspice los lee a medio camino.
      if (motor[j][k] > 1) continue
      comparados++
      let cerca = false
      for (let w = Math.max(0, k - VENTANA); w <= Math.min(muestras - 1, k + VENTANA); w++) if (motor[j][w] === n || motor[j][w] > 1) cerca = true
      if (!cerca && distintos.length < 8) distintos.push(`salida ${j} en ${(k * PASO_NS).toFixed(1)} ns: ngspice ${n}, motor ${motor[j][k]}`)
    }
  }
  return { distintos, cambios, comparados }
}

/** Una fila de una tabla: el nivel de cada salida en dos bits (0, 1, Z = 2, X = 3), la primera salida en los bits bajos. */
const fila = (...niveles: number[]): number => niveles.reduce((a, n, j) => a + n * 4 ** j, 0)
const Z = 2

/** Los cambios de un bit de una lista de códigos que se presentan cada `paso` ns desde `desde`. */
function bitDe(bit: number, desde: number, paso: number, codigos: number[]): [number, 0 | 1][] {
  const cambios: [number, 0 | 1][] = []
  let previo = 0
  codigos.forEach((c, k) => {
    const n = ((c >> bit) & 1) as 0 | 1
    if (n !== previo) cambios.push([desde + k * paso, n])
    previo = n
  })
  return cambios
}

const retardo: [number, number] = [1.2e-8, 1.8e-8]

describe.skipIf(!hay)('LUT: la síntesis de ngspice da la secuencia del motor', () => {
  it('un decodificador de 3 a 8 con tres habilitaciones y salidas activas en bajo', async () => {
    // Entradas G1, G2A, G2B, C, B, A (G1 es el bit más significativo del índice) y salidas Y0 a Y7.
    const tabla = Array.from({ length: 64 }, (_, i) => {
      const habilitado = ((i >> 5) & 1) === 1 && ((i >> 4) & 1) === 0 && ((i >> 3) & 1) === 0
      return fila(...Array.from({ length: 8 }, (_, k) => (habilitado && (i & 7) === k ? 0 : 1)))
    })
    const codigos = [1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4]
    const banco = armarBanco(
      (e, s) => ({ type: 'LUT', comunes: [], rebanadas: [{ entradas: e, salidas: s }], tabla: 0, retardos: s.map(() => retardo), z_como: 'x' }),
      [onda(1, [330, 0], [370, 1]), onda(0, [400, 1], [440, 0]), onda(0), onda(0, ...bitDe(2, 20, 40, codigos)), onda(0, ...bitDe(1, 20, 40, codigos)), onda(0, ...bitDe(0, 20, 40, codigos))],
      8,
      [tabla]
    )
    const r = await contraElMotor(banco, 520)
    expect(r.distintos).toEqual([])
    expect(r.cambios).toBeGreaterThan(20)
  }, 120_000)

  it('un selector 2 a 1 de cuatro rebanadas con S y E comunes', async () => {
    // Comunes S y E (activa en bajo, bits altos del índice); cada rebanada A, B y su salida Y.
    const tabla = Array.from({ length: 16 }, (_, i) => {
      const [s, e, a, b] = [(i >> 3) & 1, (i >> 2) & 1, (i >> 1) & 1, i & 1]
      return fila(e ? 0 : s ? b : a)
    })
    const banco = armarBanco(
      (e, s) => ({ type: 'LUT', comunes: [e[0], e[1]], rebanadas: [0, 1, 2, 3].map((k) => ({ entradas: [e[2 + 2 * k], e[3 + 2 * k]], salidas: [s[k]] })), tabla: 0, retardos: [retardo], z_como: 'x' }),
      [
        onda(0, [100, 1], [180, 0], [260, 1]),
        onda(0, [300, 1], [340, 0]),
        onda(1, [40, 0], [140, 1], [220, 0]),
        onda(0, [60, 1], [200, 0], [320, 1]),
        onda(0, [80, 1], [160, 0]),
        onda(1, [120, 0], [240, 1]),
        onda(0, [90, 1], [270, 0]),
        onda(0, [150, 1], [310, 0]),
        onda(1, [50, 0], [210, 1]),
        onda(0, [110, 1], [290, 0])
      ],
      4,
      [tabla]
    )
    const r = await contraElMotor(banco, 380)
    expect(r.distintos).toEqual([])
    expect(r.cambios).toBeGreaterThan(12)
  }, 120_000)

  it('un transceptor de tres estados con DIR y OE comunes y un manejador externo por lado', async () => {
    // Comunes DIR (1 es A hacia B) y OE (activa en bajo), entradas A y B y salidas A y B: cada salida depende del lado contrario.
    const tabla = Array.from({ length: 16 }, (_, i) => {
      const [dir, oe, a, b] = [(i >> 3) & 1, (i >> 2) & 1, (i >> 1) & 1, i & 1]
      return fila(!oe && !dir ? b : Z, !oe && dir ? a : Z)
    })
    // Entradas: DIR, OE, dato y habilitación del manejador de A, dato y habilitación del de B. Las salidas son las redes del bus.
    const banco = armarBanco(
      (e, s) => [
        { type: 'LUT', comunes: [e[0], e[1]], rebanadas: [{ entradas: [s[0], s[1]], salidas: [s[0], s[1]] }], tabla: 0, retardos: [retardo, retardo], z_como: 'x' },
        { type: 'GATE', fn: 'buf', inputs: [e[2]], output: s[0], enable: e[3], rise_delay: 1e-9, fall_delay: 1e-9, z_como: 'x' },
        { type: 'GATE', fn: 'buf', inputs: [e[4]], output: s[1], enable: e[5], rise_delay: 1e-9, fall_delay: 1e-9, z_como: 'x' }
      ],
      [
        onda(1, [140, 0], [260, 1], [380, 0]),
        onda(0, [300, 1], [330, 0]),
        onda(0, [20, 1], [60, 0], [100, 1], [285, 1], [315, 0], [345, 1]),
        onda(1, [130, 0], [270, 1], [370, 0]),
        onda(0, [190, 1], [230, 0], [400, 1], [430, 0]),
        onda(0, [150, 1], [250, 0], [390, 1])
      ],
      2,
      [tabla]
    )
    const r = await contraElMotor(banco, 460)
    expect(r.distintos).toEqual([])
    expect(r.cambios).toBeGreaterThan(8)
  }, 120_000)

  it('una salida de colector abierto baja a 0 y suelta la red con el 1', async () => {
    const banco = armarBanco(
      (e, s) => ({ type: 'LUT', comunes: [], rebanadas: [{ entradas: [e[0]], salidas: [s[0]] }], tabla: 0, retardos: [retardo], abierta: [true], z_como: 'x' }),
      [onda(0, [50, 1], [100, 0], [150, 1], [200, 0])],
      1,
      [[fila(1), fila(0)]]
    )
    const r = await contraElMotor(banco, 260)
    expect(r.distintos).toEqual([])
    expect(r.comparados).toBeGreaterThan(300)
  }, 120_000)
})

const alta = (entrada: number): SenalMsi => ({ entrada })
const baja = (entrada: number): SenalMsi => ({ entrada, bajo: true })
const sube = (entrada: number): RelojMsi => ({ senales: [alta(entrada)] })
const bit = (b: number): SalidaMsi => ({ tipo: 'directa', fuente: { bit: b } })
const col = (columna: number): SalidaMsi => ({ tipo: 'tabla', columna })
const bits = (n: number): SalidaMsi[] => Array.from({ length: n }, (_, b) => bit(b))

interface ConfigMsi {
  nucleo: NucleoMsi
  de: SalidaMsi[]
  fuentes?: FuenteMsi[]
  tabla?: number[]
  ondas: (Onda | { igualA: number })[]
}

function bancoMsi(c: ConfigMsi): Banco {
  return armarBanco(
    (e, s) => ({
      type: 'MSI',
      entradas: e,
      salidas: s,
      nucleo: c.nucleo,
      de: c.de,
      ...(c.fuentes ? { fuentes: c.fuentes } : {}),
      ...(c.tabla ? { tabla: 0 } : {}),
      retardos: s.map(() => retardo),
      z_como: 'x'
    }),
    c.ondas,
    c.de.length,
    c.tabla ? [c.tabla] : []
  )
}

describe.skipIf(!hay)('MSI: la síntesis de ngspice da la secuencia del motor', () => {
  // Entradas del 161: 0 CLK, 1 CLR (bajo), 2 LOAD (bajo, síncrona), 3 ENP, 4 ENT, 5 a 8 A a D. Salidas QA a QD y RCO.
  const c161 = (sincrono: boolean): ConfigMsi => ({
    nucleo: { tipo: 'contador', bits: 4, modulo: 16, reloj: sube(0), habilita: [alta(3), alta(4)], borra: { senal: baja(1), sincrona: sincrono }, carga: { senal: baja(2), sincrona: true, datos: [5, 6, 7, 8] } },
    de: [...bits(4), col(0)],
    fuentes: [{ entrada: 4 }, { bit: 3 }, { bit: 2 }, { bit: 1 }, { bit: 0 }],
    tabla: Array.from({ length: 32 }, (_, i) => fila(i === 31 ? 1 : 0)),
    ondas: [
      onda(0, ...unir(pulsos(20, 18, 20, 10), pulsos(420, 1, 20, 10), pulsos(480, 1, 20, 10), pulsos(540, 1, 20, 10))),
      onda(1, [520, 0], [560, 1]),
      onda(1, [410, 0], [440, 1]),
      onda(1, [460, 0], [500, 1]),
      onda(1),
      onda(0, [400, 1]),
      onda(0),
      onda(0, [400, 1]),
      onda(0)
    ]
  })

  it('el 161 cuenta, carga con el reloj, se detiene con ENP y se borra al instante', async () => {
    const r = await contraElMotor(bancoMsi(c161(false)), 600)
    expect(r.distintos).toEqual([])
    expect(r.cambios).toBeGreaterThan(30)
  }, 120_000)

  it('el 163 se borra con el reloj y no al instante', async () => {
    const r = await contraElMotor(bancoMsi(c161(true)), 600)
    expect(r.distintos).toEqual([])
    expect(r.cambios).toBeGreaterThan(30)
  }, 120_000)

  it('el 190 cuenta en década hacia arriba y hacia abajo, carga de golpe y se detiene con CTEN', async () => {
    // Entradas: 0 CLK (en alto en reposo), 1 LOAD (bajo), 2 D/U, 3 CTEN (bajo), 4 a 7 A a D. Salidas QA a QD, MAX/MIN y RCO.
    const tabla = Array.from({ length: 128 }, (_, i) => {
      const [clk, cten, du, n] = [(i >> 6) & 1, (i >> 5) & 1, (i >> 4) & 1, i & 15]
      const maxmin = (du === 0 && n === 9) || (du === 1 && n === 0)
      return fila(maxmin ? 1 : 0, !(clk === 0 && cten === 0 && maxmin) ? 1 : 0)
    })
    const banco = bancoMsi({
      nucleo: { tipo: 'contador', bits: 4, modulo: 10, reloj: sube(0), sentido: alta(2), habilita: [baja(3)], carga: { senal: baja(1), sincrona: false, datos: [4, 5, 6, 7] } },
      de: [...bits(4), col(0), col(1)],
      fuentes: [{ entrada: 0 }, { entrada: 3 }, { entrada: 2 }, { bit: 3 }, { bit: 2 }, { bit: 1 }, { bit: 0 }],
      tabla,
      ondas: [
        onda(1, ...unir(pulsosBajos(20, 11, 40, 10), pulsosBajos(460, 11, 40, 10), pulsosBajos(960, 1, 40, 10))),
        onda(1, [900, 0], [920, 1]),
        onda(0, [440, 1]),
        onda(1, [5, 0], [940, 1]),
        onda(0, [880, 1]),
        onda(0),
        onda(0),
        onda(0, [880, 1])
      ]
    })
    const r = await contraElMotor(banco, 1000)
    expect(r.distintos).toEqual([])
    expect(r.cambios).toBeGreaterThan(40)
  }, 180_000)

  it('el 193 cuenta con dos relojes, se borra y se precarga de golpe y da CO y BO en los extremos', async () => {
    // Entradas: 0 UP y 1 DOWN (en alto en reposo), 2 CLR (alto), 3 LOAD (bajo), 4 a 7 A a D. Salidas QA a QD, CO y BO.
    const tabla = Array.from({ length: 64 }, (_, i) => {
      const [up, down, n] = [(i >> 5) & 1, (i >> 4) & 1, i & 15]
      return fila(!(up === 0 && n === 15) ? 1 : 0, !(down === 0 && n === 0) ? 1 : 0)
    })
    const banco = bancoMsi({
      nucleo: { tipo: 'contador', bits: 4, modulo: 16, reloj: sube(0), abajo: sube(1), borra: { senal: alta(2), sincrona: false }, carga: { senal: baja(3), sincrona: false, datos: [4, 5, 6, 7] } },
      de: [...bits(4), col(0), col(1)],
      fuentes: [{ entrada: 0 }, { entrada: 1 }, { bit: 3 }, { bit: 2 }, { bit: 1 }, { bit: 0 }],
      tabla,
      ondas: [
        onda(1, ...unir(pulsosBajos(100, 5, 40, 10), pulsosBajos(560, 1, 40, 10), pulsosBajos(710, 1, 40, 10))),
        onda(1, ...unir(pulsosBajos(300, 4, 40, 10), pulsosBajos(640, 1, 40, 10), [[700, 0], [740, 1]])),
        onda(0, [10, 1], [30, 0]),
        onda(1, [50, 0], [70, 1], [500, 0], [520, 1]),
        onda(0, [40, 1]),
        onda(0, [480, 1]),
        onda(0, [40, 1]),
        onda(0, [40, 1])
      ]
    })
    const r = await contraElMotor(banco, 800)
    expect(r.distintos).toEqual([])
    expect(r.cambios).toBeGreaterThan(28)
  }, 180_000)

  it('el 4017 cuenta con CLK y no INH, da diez salidas y CO y se pone en cero con RESET', async () => {
    // Entradas: 0 CLK (en alto en reposo), 1 INH, 2 RESET. Salidas Q0 a Q9 y CO por tabla.
    const tabla = Array.from({ length: 16 }, (_, n) => fila(...Array.from({ length: 10 }, (_, k) => (n === k ? 1 : 0)), n < 5 ? 1 : 0))
    const banco = bancoMsi({
      nucleo: { tipo: 'contador', bits: 4, modulo: 10, reloj: { senales: [alta(0), baja(1)] }, borra: { senal: alta(2), sincrona: false } },
      de: Array.from({ length: 11 }, (_, c) => col(c)),
      fuentes: [{ bit: 3 }, { bit: 2 }, { bit: 1 }, { bit: 0 }],
      tabla,
      ondas: [onda(1, ...unir(pulsosBajos(20, 11, 40, 20), pulsosBajos(480, 1, 40, 20), pulsosBajos(580, 1, 40, 20))), onda(0, [460, 1], [520, 0]), onda(1, [10, 0], [560, 1], [620, 0])]
    })
    const r = await contraElMotor(banco, 700)
    expect(r.distintos).toEqual([])
    expect(r.cambios).toBeGreaterThan(24)
  }, 180_000)

  it('el 164 desplaza A y B por QA a QH y se borra al instante', async () => {
    // Entradas: 0 CLK, 1 A, 2 B, 3 CLR (bajo, asíncrono).
    const banco = bancoMsi({
      nucleo: { tipo: 'desplazamiento', bits: 8, reloj: sube(0), serie: [alta(1), alta(2)], borra: { senal: baja(3), sincrona: false } },
      de: bits(8),
      ondas: [onda(0, ...unir(pulsos(30, 16, 20, 10), pulsos(380, 3, 20, 10))), onda(0, [10, 1], [200, 0], [370, 1]), onda(0, [10, 1], [100, 0], [140, 1]), onda(1, [345, 0], [365, 1])]
    })
    const r = await contraElMotor(banco, 480)
    expect(r.distintos).toEqual([])
    expect(r.cambios).toBeGreaterThan(10)
  }, 120_000)

  it('el 165 carga en paralelo por nivel, desplaza con el reloj O de CLK e INH y saca QH y su negada', async () => {
    // Entradas: 0 CLK, 1 INH, 2 SH/LD (bajo, asíncrono), 3 SER, 4 a 11 A a H.
    const banco = bancoMsi({
      nucleo: { tipo: 'desplazamiento', bits: 8, reloj: { senales: [alta(0), alta(1)], combina: 'O' }, serie: [alta(3)], carga: { senal: baja(2), sincrona: false, datos: [4, 5, 6, 7, 8, 9, 10, 11] } },
      de: [bit(7), { tipo: 'directa', fuente: { bit: 7 }, negada: true }],
      ondas: [
        onda(0, ...unir(pulsos(60, 12, 20, 10), pulsos(350, 1, 20, 10))),
        onda(0, [330, 1], [380, 0]),
        onda(1, [20, 0], [40, 1], [420, 0], [440, 1]),
        onda(0, [95, 1], [135, 0]),
        onda(0, [10, 1]),
        onda(0),
        onda(0),
        onda(0),
        onda(0),
        onda(0),
        onda(0, [410, 1]),
        onda(0, [10, 1])
      ]
    })
    const r = await contraElMotor(banco, 480)
    expect(r.distintos).toEqual([])
    expect(r.cambios).toBeGreaterThan(4)
  }, 120_000)

  // Entradas del 595: 0 SRCLK, 1 RCLK, 2 SER, 3 SRCLR (bajo), 4 OE (bajo). Salidas Q0 a Q7 (tres estados) y QH'.
  const nucleo595: NucleoMsi = { tipo: 'desplazamiento', bits: 8, reloj: sube(0), serie: [alta(2)], borra: { senal: baja(3), sincrona: false }, almacen: sube(1) }
  const tabla595 = Array.from({ length: 512 }, (_, i) => fila(...Array.from({ length: 8 }, (_, k) => (((i >> 8) & 1) === 1 ? Z : (i >> (7 - k)) & 1))))
  const config595 = (ondas: ConfigMsi['ondas']): ConfigMsi => ({
    nucleo: nucleo595,
    de: [...Array.from({ length: 8 }, (_, c) => col(c)), bit(7)],
    fuentes: [{ entrada: 4 }, ...Array.from({ length: 8 }, (_, k): FuenteMsi => ({ aux: k }))],
    tabla: tabla595,
    ondas
  })

  it('el 595 desplaza, guarda aparte con RCLK, saca en tres estados con OE y se borra sin tocar el almacén', async () => {
    const banco = bancoMsi(
      config595([
        onda(0, ...pulsos(30, 10, 20, 10)),
        onda(0, ...unir(pulsos(250, 1, 20, 10), pulsos(330, 1, 20, 10), pulsos(400, 1, 20, 10))),
        onda(0, [10, 1], [45, 0], [125, 1], [165, 0]),
        onda(1, [360, 0], [380, 1]),
        onda(0, [280, 1], [300, 0])
      ])
    )
    const r = await contraElMotor(banco, 460)
    expect(r.distintos).toEqual([])
    expect(r.cambios).toBeGreaterThan(8)
  }, 120_000)

  it('el 595 con los dos relojes unidos deja el almacén un pulso atrás', async () => {
    const banco = bancoMsi(config595([onda(0, ...pulsos(30, 8, 20, 10)), { igualA: 0 }, onda(0, [10, 1], [45, 0], [85, 1], [105, 0]), onda(1), onda(0)]))
    const r = await contraElMotor(banco, 220)
    expect(r.distintos).toEqual([])
    expect(r.cambios).toBeGreaterThan(4)
  }, 120_000)
})

/** El voltaje de un nodo en el punto de operación de ngspice. */
async function operacion(netlist: NetlistMotor, nodo: number): Promise<number> {
  const res = await servicio.ejecutar(1, { netlist, analisis: { tipo: 'op' } })
  if (!res.ok) throw new Error(res.error)
  const v = res.graficos[0].vectores.find((x) => x.referencia.tipo === 'nodo' && x.referencia.nodo === nodo)
  if (!v) throw new Error(`sin el nodo ${nodo} en ${res.graficos[0].vectores.map((x) => x.nombre).join(' ')}`)
  return v.re[0]
}

/** El voltaje de un nodo en el motor una vez pasada la rampa de asentamiento. */
function enElMotor(netlist: NetlistMotor, nodo: number): number {
  const sim = new Simulator(JSON.stringify(netlist), 1e-7)
  sim.set_tolerances(1e-4, 1e-12, 1e-7)
  sim.advance_to(5e-6, 1e9)
  const v = sim.voltages()[nodo]
  sim.free()
  return v
}

describe.skipIf(!hay)('DACM e INTC: ngspice da lo que el motor y la fórmula', () => {
  /** 178 = 0b10110010 en ocho redes digitales fijas (la más significativa primero). */
  const BITS = Array.from({ length: 8 }, (_, k) => (178 >> (7 - k)) & 1)
  const logicos = BITS.map((value, k): NetlistMotor['elements'][number] => ({ type: 'LOGIC', out: k, value: value as 0 | 1 }))
  const dacm = (extra: object): NetlistMotor['elements'][number] =>
    ({ type: 'DACM', modo: 'voltaje', out: 2, ret: 0, ref_p: 1, ref_n: 0, bits: [0, 1, 2, 3, 4, 5, 6, 7], t_asentamiento: 1e-7, ...extra }) as NetlistMotor['elements'][number]

  it('un DACM en voltaje da el código sobre 2^n de la referencia, sin carga y con resistencia de salida', async () => {
    const fuente: NetlistMotor['elements'][number] = { type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 5 } }
    const sin: NetlistMotor = { nodes: 3, digital_nets: 8, elements: [fuente, ...logicos, dacm({})] }
    const esperado = (178 / 256) * 5
    expect(await operacion(sin, 2)).toBeCloseTo(esperado, 6)
    expect(enElMotor(sin, 2)).toBeCloseTo(esperado, 6)
    const con: NetlistMotor = { nodes: 3, digital_nets: 8, elements: [fuente, ...logicos, dacm({ r_out: 1000 }), { type: 'R', a: 2, b: 0, ohms: 1000 }] }
    expect(await operacion(con, 2)).toBeCloseTo(esperado / 2, 6)
    expect(enElMotor(con, 2)).toBeCloseTo(esperado / 2, 6)
  }, 60_000)

  it('un DACM en corriente saca k veces la corriente de referencia por la salida', async () => {
    // 10 V sobre 5 kΩ a REF+ (que el DACM mantiene en el voltaje de REF-, tierra): 2 mA de referencia. La salida cuelga de 5 V por 1 kΩ.
    const red: NetlistMotor = {
      nodes: 5,
      digital_nets: 8,
      elements: [
        { type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 10 } },
        { type: 'R', a: 1, b: 2, ohms: 5000 },
        { type: 'V', a: 3, b: 0, wave: { kind: 'dc', v: 5 } },
        { type: 'R', a: 3, b: 4, ohms: 1000 },
        ...logicos,
        dacm({ modo: 'corriente', out: 4, ref_p: 2 })
      ]
    }
    const esperado = 5 - 1000 * (178 / 256) * 2e-3
    expect(await operacion(red, 4)).toBeCloseTo(esperado, 6)
    expect(enElMotor(red, 4)).toBeCloseTo(esperado, 6)
  }, 60_000)

  it('un INTC vale r_on con su canal en 1 y r_off con su canal en 0', async () => {
    for (const [canal, esperado] of [
      [1, (5 * 1000) / 1001],
      [0, (5 * 1000) / (1000 + 1e9)]
    ]) {
      const red: NetlistMotor = { nodes: 3, canales: [{ inicial: canal }], elements: [{ type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 5 } }, { type: 'INTC', a: 1, b: 2, canal: 0, r_on: 1, r_off: 1e9 }, { type: 'R', a: 2, b: 0, ohms: 1000 }] }
      expect(await operacion(red, 2), `canal ${canal}`).toBeCloseTo(esperado, 6)
      expect(enElMotor(red, 2), `canal ${canal}`).toBeCloseTo(esperado, 6)
    }
  }, 60_000)
})

const DB = Array.from({ length: 8 }, (_, k) => `DB${k}`)
const adc = piezaDePrueba('adc-t', ['CS', 'RD', 'WR', 'CLKIN', 'INTR', 'VINP', 'VINN', 'AGND', 'VREF2', 'DGND', 'VCC', 'CLKR', ...DB], [], {
  tipo: 'convertidor-ad', cs: 'CS', rd: 'RD', wr: 'WR', clkin: 'CLKIN', clkr: 'CLKR', intr: 'INTR', vinp: 'VINP', vinn: 'VINN', agnd: 'AGND', vref2: 'VREF2', dgnd: 'DGND', vcc: 'VCC', db: DB,
  vil: 0.8, vih: 2, vtp: 3.1, vtn: 1.8, voh: 4.5, vol: 0.4, rref: 2200, r_lo: 250, r_hi: 500, ciclos_inicio: 4, ciclos_bit: 8, t_acceso: 135e-9, t_intr: 300e-9
})
const A = Array.from({ length: 8 }, (_, k) => `A${k + 1}`)
const dac = piezaDePrueba('dac-t', [...A, 'IO', 'GND', 'VEE', 'VCC', 'VREFP', 'VREFN', 'COMP'], [], {
  tipo: 'convertidor-da', a: A, io: 'IO', gnd: 'GND', vee: 'VEE', vcc: 'VCC', vrefp: 'VREFP', vrefn: 'VREFN', comp: 'COMP', vil: 0.8, vih: 2, t_asentamiento: 150e-9
})
const libConvertidores = conPiezas(adc, dac)
const V = (ref: string, v: string, mas: string): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje: v }, pines: { '+': mas, '-': '0' } })
const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })

describe.skipIf(!hay)('los convertidores armados con piezas se exportan a ngspice', () => {
  function compilar(partes: Parte[]) {
    const d = conEtiquetas(libConvertidores, partes)
    const con = calcularConexiones(d, libConvertidores)
    const r = compilarNetlist(d, libConvertidores, con)
    expect(r.errores).toEqual([])
    return { r, nodo: (nombre: string) => r.nodoDeRed.get(con.redes.find((x) => x.nombre === nombre)!.id)! }
  }

  it('el DAC0808 con A1 y A2 en alto saca 0.75 de la corriente de referencia, en ngspice y en el motor', async () => {
    const bits = ['alto', 'alto', '0', '0', '0', '0', '0', '0']
    const pines = { ...Object.fromEntries(A.map((p, k) => [p, bits[k]])), IO: 'io', GND: '0', VEE: 'vee', VCC: 'vcc', VREFP: 'refp', VREFN: 'refn', COMP: 'comp' }
    const { r, nodo } = compilar([V('V1', '5', 'vcc'), V('V2', '-15', 'vee'), V('V3', '5', 'alto'), R('R14', '5k', 'refp', 'vref'), V('V4', '10', 'vref'), R('R15', '5k', 'refn', '0'), R('RL', '1k', 'io', '0'), { tipo: 'dac-t', ref: 'U1', props: {}, pines }])
    // 2 mA de referencia (VREF / R14: VREF- solo se mide, R15 no resta corriente) y 0.75 de ella sale de IO por la carga de 1 kΩ.
    const esperado = -1.5
    expect(await operacion(r.netlist!, nodo('io'))).toBeCloseTo(esperado, 4)
    expect(enElMotor(r.netlist!, nodo('io'))).toBeCloseTo(esperado, 4)
  }, 60_000)

  it('el ADC0804 se exporta con sus salidas fijas, el comparador contra el DACM y el aviso del código', async () => {
    const pines = { CS: '0', RD: '0', WR: 'wr', CLKIN: 'clkin', INTR: 'intr', VINP: 'vin', VINN: '0', AGND: '0', VREF2: 'vref2', DGND: '0', VCC: 'vcc', CLKR: 'clkr', ...Object.fromEntries(DB.map((p) => [p, p.toLowerCase()])) }
    const { r } = compilar([V('V1', '5', 'vcc'), V('V2', '2.5', 'vin'), V('V3', '5', 'wr'), R('R1', '10k', 'clkr', 'clkin'), { tipo: 'capacitor', ref: 'C1', props: { valor: '150p' }, pines: { '1': 'clkin', '2': '0' } }, { tipo: 'adc-t', ref: 'U1', props: {}, pines }])
    const mazo = armarMazo(validarPeticion({ netlist: r.netlist, analisis: { tipo: 'op' } }), { nombresElementos: r.piezaDeElemento.map(() => 'U1') })
    expect(mazo.exportacion.avisos.some((x) => /se exporta con el código del instante actual: ngspice no simula su conversión/.test(x))).toBe(true)
    const res = await servicio.ejecutar(1, { netlist: r.netlist!, analisis: { tipo: 'op' } })
    if (!res.ok) throw new Error(res.error)
    expect(res.graficos[0].vectores.length).toBeGreaterThan(3)
  }, 60_000)
})
