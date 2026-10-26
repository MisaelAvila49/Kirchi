import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { fallasGraves } from './axe'
import { carpetaNueva, lanzar } from './lanzar'

/** Animación y tiempo sobre Electron: ritmo de cuadros, tiempo simulado contra el reloj en cámara lenta, audio, memoria con la corriente animada y axe. Requiere ventana y correr sola. */
test.describe.configure({ mode: 'serial' })

const pieza = (id: string, tipo: string, ref: string, x: number, y: number, props: Record<string, string> = {}) => ({ id, tipo, ref, x, y, rot: 0, espejo: false, props })
type Pieza = ReturnType<typeof pieza>
type Pines = Record<string, [number, number, string]>
/** Documento sin cables: cada pin lleva una etiqueta con el nombre de su red (`0` es tierra, unida a una pieza Tierra). */
function doc(partes: [Pieza, Pines][]) {
  const piezas: Record<string, Pieza> = {}
  const etiquetas: Record<string, { id: string; nombre: string; x: number; y: number; rot: number }> = {}
  for (const [p, pines] of partes) {
    piezas[p.id] = p
    for (const [pin, [dx, dy, red]] of Object.entries(pines)) {
      const id = `e_${p.id}_${pin}`
      etiquetas[id] = { id, nombre: red, x: p.x + dx, y: p.y + dy, rot: 0 }
    }
  }
  return { piezas, cables: {}, etiquetas, notas: {} }
}
const dosPines = (a: string, b: string): Pines => ({ '1': [-4, 0, a], '2': [4, 0, b] })
const tierra: [Pieza, Pines] = [pieza('g', 'tierra', 'GND1', -60, 30), { '1': [0, 0, '0'] }]

/** Un motor en 6 V y un divisor con cables: las flechas van sobre los tramos de cable, no entre piezas unidas por etiquetas. */
const MOTOR = (() => {
  const d = doc([
    tierra,
    [pieza('v1', 'fuente-dc', 'V1', 0, 0, { voltaje: '6' }), { '+': [0, -4, 'm'], '-': [0, 4, '0'] }],
    [pieza('m1', 'motor-dc', 'M1', 20, 0), { '+': [-4, 0, 'm'], '-': [4, 0, '0'] }]
  ])
  const x = 60
  Object.assign(d.piezas, {
    dv: pieza('dv', 'fuente-dc', 'V2', x, 0, { voltaje: '5' }),
    dr1: pieza('dr1', 'resistencia', 'R1', x + 10, -8, { valor: '1k' }),
    dr2: { ...pieza('dr2', 'resistencia', 'R2', x + 20, 0, { valor: '1k' }), rot: 90 },
    dg: pieza('dg', 'tierra', 'GND2', x, 12)
  })
  Object.assign(d.cables, {
    c1: { id: 'c1', puntos: [{ x, y: -4 }, { x, y: -8 }, { x: x + 6, y: -8 }] },
    c2: { id: 'c2', puntos: [{ x: x + 14, y: -8 }, { x: x + 20, y: -8 }, { x: x + 20, y: -4 }] },
    c3: { id: 'c3', puntos: [{ x: x + 20, y: 4 }, { x: x + 20, y: 8 }, { x, y: 8 }] },
    c4: { id: 'c4', puntos: [{ x, y: 4 }, { x, y: 12 }] }
  })
  return d
})()
/** Un RC de 100 ms (100 kΩ y 1 µF) sobre 5 V: a 0.01× su carga dura diez segundos de reloj. */
const RC = doc([
  tierra,
  [pieza('v1', 'fuente-dc', 'V1', 0, 0, { voltaje: '5' }), { '+': [0, -4, 'a'], '-': [0, 4, '0'] }],
  [pieza('r1', 'resistencia', 'R1', 20, 0, { valor: '100k' }), dosPines('a', 'c')],
  [pieza('c1', 'capacitor', 'C1', 40, 0, { valor: '1u' }), dosPines('c', '0')]
])
/** Un zumbador de 5 V con una cuadrada de 2 Hz (la práctica del 555, sin el 555). */
const ZUMBADOR = doc([
  tierra,
  [pieza('v1', 'fuente-pulso', 'V1', 0, 0, { alto: '5', frecuencia: '2', ciclo: '50 %' }), { '+': [0, -4, 'a'], '-': [0, 4, '0'] }],
  [pieza('bz', 'zumbador', 'BZ1', 20, 0), { '+': [-2, 2, 'a'], '-': [2, 2, '0'] }]
])

async function abrir(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await lanzar({ datos: carpetaNueva() })
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await page.waitForTimeout(600)
  return { app, page }
}
const sonda = (page: Page, metodo: string, ...args: unknown[]): Promise<any> => page.evaluate(([m, a]) => (window as any).__kirchi[m](...a), [metodo, args] as [string, unknown[]])
async function simular(page: Page) {
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('corriendo')
}
// Avanzar y Simular están en Inicio; la velocidad, las animaciones y el sonido, en Vista › Tiempo y animación.
const cinta = (page: Page) => page.getByRole('toolbar', { name: 'Vista', exact: true })
const inicio = (page: Page) => page.getByRole('toolbar', { name: 'Inicio', exact: true })
async function aSimulacion(page: Page) {
  await page.getByRole('tab', { name: 'Vista', exact: true }).click()
}
async function aInicio(page: Page) {
  await page.getByRole('tab', { name: 'Inicio', exact: true }).click()
}
async function velocidad(page: Page, texto: RegExp) {
  await aSimulacion(page)
  await cinta(page).getByRole('button', { name: /^Velocidad / }).click()
  await page.getByRole('menuitemradio', { name: texto }).click()
}

test('con la corriente animada y un motor, a lo más 60 cuadros por segundo; en pausa, cero', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', MOTOR)
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('c')
  await simular(page)
  await page.waitForTimeout(1500)
  expect((await sonda(page, 'tiempo')).flechas).toBeGreaterThan(0)
  const c0 = await sonda(page, 'cuadros')
  await page.waitForTimeout(2000)
  const porSegundo = ((await sonda(page, 'cuadros')) - c0) / 2
  console.log(`${porSegundo.toFixed(1)} cuadros por segundo con el motor y la corriente animada (pantalla a su ritmo)`)
  expect(porSegundo).toBeLessThanOrEqual(62)
  expect(porSegundo).toBeGreaterThan(30)
  await page.keyboard.press('F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('pausada')
  await page.waitForTimeout(300)
  const c1 = await sonda(page, 'cuadros')
  await page.waitForTimeout(1000)
  expect(await sonda(page, 'cuadros')).toBe(c1)
  // Con el sistema pidiendo menos movimiento, corriendo solo dibuja con las lecturas.
  await page.keyboard.press('Shift+F5')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await sonda(page, 'cargar', MOTOR)
  await simular(page)
  await page.waitForTimeout(1000)
  const c2 = await sonda(page, 'cuadros')
  await page.waitForTimeout(1000)
  const lecturas = Math.round(1000 / (await sonda(page, 'tiempo')).msLectura)
  expect((await sonda(page, 'cuadros')) - c2).toBeLessThanOrEqual(lecturas + 2)
  await page.keyboard.press('Shift+F5')
  await app.close()
})

test('a ×0.01 y ×0.001 el tiempo simulado sigue a la velocidad dentro de 1 %', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', RC)
  for (const [v, texto] of [[0.01, /^×0\.01 \(/], [0.001, /^×0\.001 \(/]] as const) {
    await velocidad(page, texto)
    await simular(page)
    await page.waitForTimeout(500)
    const [t0, r0] = [(await sonda(page, 'simulacion')).t as number, Date.now()]
    await page.waitForTimeout(10_000)
    const [t1, r1] = [(await sonda(page, 'simulacion')).t as number, Date.now()]
    const esperado = (v * (r1 - r0)) / 1000
    console.log(`a ${v}×: ${(t1 - t0).toExponential(4)} s simulados en ${((r1 - r0) / 1000).toFixed(2)} s de reloj (esperado ${esperado.toExponential(4)})`)
    expect(Math.abs(t1 - t0 - esperado) / esperado).toBeLessThan(0.01)
    await page.keyboard.press('Shift+F5')
    await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('detenida')
  }
  // Cambiar la velocidad no reinicia: a medio cargar, el capacitor sigue en su voltaje.
  await velocidad(page, /^×0\.1 \(/)
  await simular(page)
  await page.waitForTimeout(1000)
  const antes = (await sonda(page, 'vista')).piezas.c1.v as number
  await velocidad(page, /^×0\.01 \(/)
  await page.waitForTimeout(300)
  const despues = (await sonda(page, 'vista')).piezas.c1.v as number
  // Sin reinicio: el voltaje sigue donde estaba (a los 0.1 s del RC de 0.1 s son unos 3.2 V). Entre las dos lecturas pasan el menú
  // de velocidad y 300 ms, y parte de ese tiempo corre aún a 0.1×, así que el margen es de 0.5 V y no de 0.25.
  expect(Math.abs(despues - antes)).toBeLessThan(0.5)
  expect(despues).toBeGreaterThan(2.5)
  expect((await sonda(page, 'simulacion')).t).toBeGreaterThan(0.09)
  await page.keyboard.press('Shift+F5')
  await app.close()
})

test('sin contexto de audio antes de simular ni silenciado; el zumbador lo crea y calla al pausar (latencia registrada)', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', ZUMBADOR)
  expect((await sonda(page, 'tiempo')).audio).toBe(false)
  // Silenciado desde antes de simular: no se crea.
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('m')
  await simular(page)
  await page.waitForTimeout(1500)
  expect((await sonda(page, 'tiempo')).audio).toBe(false)
  await page.keyboard.press('m')
  await page.waitForTimeout(1500)
  expect((await sonda(page, 'tiempo')).audio).toBe(true)
  const latencia = await page.evaluate(async () => {
    const c = new AudioContext()
    const r = { base: c.baseLatency, salida: (c as any).outputLatency as number | undefined }
    await c.close()
    return r
  })
  console.log(`latencia de WebAudio en esta máquina: base ${(1000 * latencia.base).toFixed(1)} ms, salida ${latencia.salida === undefined ? 'sin dato' : (1000 * latencia.salida).toFixed(1) + ' ms'}`)
  expect((await sonda(page, 'tiempo')).bloqueado).toBe(false)
  await page.keyboard.press('F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('pausada')
  await page.keyboard.press('Shift+F5')
  await app.close()
})

test('memoria con 984 resistencias en paralelo y la corriente animada (solo se registra, sin umbral)', async () => {
  const { app, page } = await abrir()
  const piezas: Record<string, Pieza> = {}
  const cables: Record<string, { id: string; puntos: { x: number; y: number }[] }> = {}
  for (let k = 0; k < 984; k++) piezas[`r${k}`] = { ...pieza(`r${k}`, 'resistencia', `R${k + 1}`, 4 * k, 8, { valor: '1k' }), rot: 90 }
  piezas.v = pieza('v', 'fuente-dc', 'V1', -12, 8, { voltaje: '5' })
  piezas.g = pieza('g', 'tierra', 'GND1', -12, 16)
  cables.arriba = { id: 'arriba', puntos: [{ x: -12, y: 4 }, { x: 4 * 983, y: 4 }] }
  cables.abajo = { id: 'abajo', puntos: [{ x: -12, y: 12 }, { x: 4 * 983, y: 12 }] }
  cables.tierra = { id: 'tierra', puntos: [{ x: -12, y: 12 }, { x: -12, y: 16 }] }
  await sonda(page, 'cargar', { piezas, cables, etiquetas: {}, notas: {} })
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('c')
  await simular(page)
  await page.waitForTimeout(4000)
  const m = await app.evaluate(({ app }) => {
    const procs = app.getAppMetrics()
    return { priv: procs.reduce((s, p) => s + ((p.memory as any).privateBytes ?? p.memory.workingSetSize), 0) / 1024, ws: procs.reduce((s, p) => s + p.memory.workingSetSize, 0) / 1024 }
  })
  const t = await sonda(page, 'tiempo')
  console.log(`con 984 resistencias en paralelo y la corriente animada, ${m.priv.toFixed(0)} MB privados (${m.ws.toFixed(0)} MB de conjunto de trabajo), ${t.flechas} tramos con flechas, capa de la vista previa ${t.costoSim.toFixed(1)} ms; sin umbral`)
  expect(t.flechas).toBeGreaterThan(1900)
  await page.keyboard.press('Shift+F5')
  await app.close()
})

test('axe sin fallas graves en los dos temas en los estados de animación y tiempo, con un recorrido de teclado', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', MOTOR)
  for (const tema of ['claro', 'oscuro']) {
    if (tema === 'oscuro') await page.getByRole('button', { name: /^Tema oscuro/ }).click()
    await aSimulacion(page)
    expect(await fallasGraves(page), `${tema}: Vista › Tiempo y animación`).toEqual([])
    await cinta(page).getByRole('button', { name: /^Velocidad / }).click()
    expect(await fallasGraves(page), `${tema}: menú de Velocidad`).toEqual([])
    await page.keyboard.press('Escape')
    await aInicio(page)
    await inicio(page).locator('[data-comando="avanzar-tiempo"]').click()
    expect(await fallasGraves(page), `${tema}: menú de Avanzar en el tiempo`).toEqual([])
    // «Avanzar hasta…» vive en el menú de Avanzar en el tiempo.
    await page.getByRole('menuitem', { name: /^Avanzar hasta/ }).click()
    expect(await fallasGraves(page), `${tema}: diálogo de Avanzar hasta t`).toEqual([])
    await page.keyboard.press('Escape')
    // Solo con el teclado: F6 arranca en pausa y avanza, C enciende la corriente, M silencia.
    await page.locator('canvas.lienzo-gl').focus()
    await page.keyboard.press('F6')
    await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('pausada')
    await expect.poll(async () => (await sonda(page, 'simulacion')).t).toBeGreaterThan(0.09)
    await page.keyboard.press('c')
    await page.keyboard.press('m')
    expect(await fallasGraves(page), `${tema}: en pausa con la corriente animada`).toEqual([])
    await page.keyboard.press('m')
    await page.keyboard.press('c')
    await page.keyboard.press('Shift+F5')
    await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('detenida')
  }
  await app.close()
})
