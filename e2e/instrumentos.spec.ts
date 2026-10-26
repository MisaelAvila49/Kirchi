import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { fallasGraves } from './axe'
import { verFranja, verInspector, verMediciones } from './franja'
import { carpetaNueva, lanzar } from './lanzar'

/** Instrumentos sobre Electron: voltímetro de 10 MΩ, osciloscopio de cuatro canales y multímetro al 100 % del tiempo real, costo de dibujar, memoria y axe. Requiere ventana y correr sola. */
test.describe.configure({ mode: 'serial' })

const pieza = (id: string, tipo: string, ref: string, x: number, y: number, props: Record<string, string> = {}) => ({ id, tipo, ref, x, y, rot: 0, espejo: false, props })
type Pieza = ReturnType<typeof pieza>
type Pines = Record<string, [number, number, string]>
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
const fuente = (pos: string, neg: string): Pines => ({ '+': [0, -4, pos], '-': [0, 4, neg] })
const tierra: [Pieza, Pines] = [pieza('g', 'tierra', 'GND1', -60, 30), { '1': [0, 0, '0'] }]
/** Los cuatro canales encendidos en `a` a `d` y un multímetro en V DC sobre `m`, a la derecha del dibujo. */
const instrumentos = (a: string, b: string, c: string, d: string, m: string, x0: number): [Pieza, Pines][] => [
  [pieza('osc', 'osciloscopio', 'XSC1', x0, 0, { c_on: 'encendido', d_on: 'encendido', medidas: 'Ap Af' }), { A: [-8, -6, a], B: [-8, -2, b], C: [-8, 2, c], D: [-8, 6, d] }],
  [pieza('mm', 'multimetro', 'XMM1', x0 + 30, 0, { modo: 'V DC' }), { '+': [0, -6, m], COM: [0, 6, '0'] }]
]

/** El amplificador de emisor común con un LED en el colector (el de simulacion-analogica.spec.ts). */
const AMPLIFICADOR = doc([
  tierra,
  [pieza('v1', 'fuente-dc', 'V1', 0, 0, { voltaje: '12' }), fuente('vcc', '0')],
  [pieza('vs', 'fuente-ac', 'VS', 20, 0, { amplitud: '20m', frecuencia: '1k' }), fuente('s', '0')],
  [pieza('c1', 'capacitor', 'C1', 40, 0, { valor: '1u' }), dosPines('s', 'b')],
  [pieza('r1', 'resistencia', 'RA', 60, 0, { valor: '47k' }), dosPines('vcc', 'b')],
  [pieza('r2', 'resistencia', 'RB', 80, 0, { valor: '10k' }), dosPines('b', '0')],
  [pieza('rc', 'resistencia', 'RC', 100, 0, { valor: '2.2k' }), dosPines('vcc', 'a')],
  [pieza('d1', 'led', 'D1', 120, 0, { color: 'rojo' }), { A: [-4, 0, 'a'], K: [4, 0, 'c'] }],
  [pieza('q1', 'npn', 'Q1', 140, 0), { B: [-4, 0, 'b'], C: [2, -4, 'c'], E: [2, 4, 'e'] }],
  [pieza('re', 'resistencia', 'RE', 160, 0, { valor: '470' }), dosPines('e', '0')],
  [pieza('ce', 'capacitor', 'CE', 180, 0, { valor: '10u' }), dosPines('e', '0')],
  ...instrumentos('s', 'b', 'c', 'e', 'c', 220)
])

/** El 555 a 986 Hz con contador, decodificador y display (el de logica.spec.ts). */
function reloj() {
  const R = (id: string, ref: string, x: number, y: number, valor: string, a: string, b: string): [Pieza, Pines] => [pieza(id, 'resistencia', ref, x, y, { valor }), dosPines(a, b)]
  return doc([
    tierra,
    [pieza('v1', 'fuente-dc', 'V1', -40, 0, { voltaje: '5' }), fuente('vcc', '0')],
    R('ra', 'R1', -20, -20, '1k', 'vcc', 'dis'),
    R('rb', 'R2', -20, -10, '6.8k', 'dis', 'thr'),
    [pieza('c1', 'capacitor', 'C1', -20, 10, { valor: '100n' }), dosPines('thr', '0')],
    [pieza('c2', 'capacitor', 'C2', -20, 20, { valor: '10n' }), dosPines('cv', '0')],
    [pieza('u1', 'temporizador-555', 'U1', 0, 0, { modelo: 'NE555' }), { '1': [0, 8, '0'], '2': [-6, 4, 'thr'], '3': [6, -2, 'ck'], '4': [2, -8, 'vcc'], '5': [6, 4, 'cv'], '6': [-6, 0, 'thr'], '7': [-6, -4, 'dis'], '8': [-2, -8, 'vcc'] }],
    [pieza('u2', 'contador', 'U2', 30, 0), { CLK: [-6, -4, 'ck'], RST: [-6, 2, '0'], Q0: [6, -6, 'q0'], Q1: [6, -4, 'q1'], Q2: [6, -2, 'q2'], Q3: [6, 0, 'q3'], CO: [6, 4, 'co'] }],
    [pieza('u3', 'decodificador-7seg', 'U3', 60, 0), { A: [-6, -6, 'q0'], B: [-6, -4, 'q1'], C: [-6, -2, 'q2'], D: [-6, 0, 'q3'], a: [6, -8, 'pa'], b: [6, -6, 'pb'], c: [6, -4, 'pc'], d: [6, -2, 'pd'], e: [6, 0, 'pe'], f: [6, 2, 'pf'], g: [6, 4, 'pg'] }],
    ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s, k) => R(`s${s}`, `R${k + 3}`, 90, -24 + 8 * k, '330', `p${s}`, `an_${s}`)),
    [pieza('ds', 'display-7seg', 'DS1', 120, 0), { a: [-6, -8, 'an_a'], b: [-6, -6, 'an_b'], c: [-6, -4, 'an_c'], d: [-6, -2, 'an_d'], e: [-6, 0, 'an_e'], f: [-6, 2, 'an_f'], g: [-6, 4, 'an_g'], dp: [-6, 6, 'suelto'], COM: [6, 0, '0'] }],
    ...instrumentos('ck', 'thr', 'q0', 'an_a', 'thr', 160)
  ])
}

/** El voltímetro sobre el divisor de 1 MΩ y 1 MΩ con 5 V, y un generador con su osciloscopio para el gesto. */
const DIVISOR = doc([
  tierra,
  [pieza('v1', 'fuente-dc', 'V1', 0, 0, { voltaje: '5' }), fuente('vcc', '0')],
  [pieza('r1', 'resistencia', 'R1', 20, -10, { valor: '1M' }), dosPines('vcc', 'm')],
  [pieza('r2', 'resistencia', 'R2', 20, 10, { valor: '1M' }), dosPines('m', '0')],
  [pieza('mm', 'multimetro', 'XMM1', 50, 0, { modo: 'V DC' }), { '+': [0, -6, 'm'], COM: [0, 6, '0'] }],
  [pieza('gen', 'generador', 'XFG1', 80, 0), { '+': [0, -6, 's'], COM: [0, 6, '0'] }],
  [pieza('rl', 'resistencia', 'RL', 100, 0, { valor: '1k' }), dosPines('s', '0')],
  [pieza('osc', 'osciloscopio', 'XSC1', 130, 0, { medidas: 'Ap' }), { A: [-8, -6, 's'], B: [-8, -2, '0'], C: [-8, 2, '0'], D: [-8, 6, '0'] }]
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
async function clicEn(page: Page, x: number, y: number) {
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('f')
  await page.waitForTimeout(200)
  const c = await sonda(page, 'aPantalla', x, y)
  await page.mouse.click(c.x, c.y)
}
async function memoria(app: ElectronApplication): Promise<{ priv: number; ws: number }> {
  const m = await app.evaluate(({ app }) => {
    const procs = app.getAppMetrics()
    return {
      priv: procs.reduce((s, p) => s + ((p.memory as any).privateBytes ?? p.memory.workingSetSize), 0),
      ws: procs.reduce((s, p) => s + p.memory.workingSetSize, 0)
    }
  })
  return { priv: m.priv / 1024, ws: m.ws / 1024 }
}

test('el voltímetro de 10 MΩ sobre el divisor de 1 MΩ y 1 MΩ lee 2.381 V', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', DIVISOR)
  await simular(page)
  await page.waitForTimeout(1200)
  await clicEn(page, 50, 0)
  // Los controles y el aviso de carga en el inspector; la cifra en Mediciones.
  await verInspector(page)
  await expect(page.locator('.inspector .panel-instrumento')).toContainText('Carga el circuito: lee 4.8 % menos que un instrumento ideal')
  await verMediciones(page)
  await expect(page.locator('.fila-instrumento .cifra-multimetro')).toHaveText('2.381 V')
  await page.keyboard.press('Shift+F5')
  await app.close()
})

for (const [nombre, armar] of [
  ['el amplificador con LED', () => AMPLIFICADOR],
  ['el 555 con contador y display', reloj]
] as const) {
  test(`${nombre} con un osciloscopio de cuatro canales y un multímetro corre al 100 % del tiempo real`, async () => {
    const { app, page } = await abrir()
    await sonda(page, 'cargar', armar())
    await simular(page)
    await verFranja(page, 'Osciloscopio')
    await page.waitForTimeout(1500)
    const medir = () => page.evaluate(() => ({ t: (window as any).__kirchi.simulacion().t as number, reloj: performance.now() / 1000 }))
    const a = await medir()
    await page.waitForTimeout(5000)
    const b = await medir()
    const s = await sonda(page, 'simulacion')
    const ritmo = (b.t - a.t) / (b.reloj - a.reloj)
    console.log(`${nombre} con instrumentos a ${(100 * ritmo).toFixed(1)} % del tiempo real (ratio del worker ${s.ratio.toFixed(3)})`)
    expect(ritmo).toBeGreaterThan(0.99)
    expect(s.ratio).toBeGreaterThan(0.995)
    await page.keyboard.press('Shift+F5')
    await app.close()
  })
}

test('reposo sin dibujos, a lo más un dibujo por cuadro, 2 ms por dibujo y el gesto del generador', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', DIVISOR)
  await simular(page)
  await verFranja(page, 'Osciloscopio')
  await page.waitForTimeout(1500)
  // Corriendo: dibujos de la pantalla contra cuadros de la ventana en 2 s.
  const { dibujos, cuadros } = await page.evaluate(
    () =>
      new Promise<{ dibujos: number; cuadros: number }>((listo) => {
        const k = (window as any).__kirchi
        const d0 = k.pantallas()
        let n = 0
        const t0 = performance.now()
        const paso = () => {
          n++
          if (performance.now() - t0 < 2000) requestAnimationFrame(paso)
          else listo({ dibujos: k.pantallas() - d0, cuadros: n })
        }
        requestAnimationFrame(paso)
      })
  )
  console.log(`${dibujos} dibujos de la pantalla en ${cuadros} cuadros (2 s)`)
  expect(dibujos).toBeGreaterThan(10)
  expect(dibujos).toBeLessThanOrEqual(cuadros)
  // El costo de dibujar en un canvas de verdad.
  const ms = await sonda(page, 'medirPantalla')
  console.log(`dibujar 4 canales y A − B a 2,560 columnas: ${ms.toFixed(2)} ms`)
  expect(ms).toBeLessThan(2)
  // El gesto: la amplitud del generador de 2 a 4 Vpp con su perilla; la medida Vpp de la pantalla lo dice.
  await clicEn(page, 80, 0)
  await verInspector(page)
  const perilla = page.getByRole('spinbutton', { name: 'Amplitud pico a pico', exact: true })
  await perilla.fill('4')
  await perilla.press('Enter')
  await verFranja(page, 'Osciloscopio')
  const t0 = Date.now()
  await expect(page.locator('.osc-medidas')).toContainText(/Vpp 3\.\d{3} V/, { timeout: 2000 })
  console.log(`la amplitud nueva se vio en ${Date.now() - t0} ms (meta: 200 ms)`)
  // En pausa: 0 dibujos y 0 cuadros del lienzo en 1 s.
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('pausada')
  await page.waitForTimeout(400)
  const [d0, c0] = [await sonda(page, 'pantallas'), await sonda(page, 'cuadros')]
  await page.waitForTimeout(1000)
  expect(await sonda(page, 'pantallas')).toBe(d0)
  expect(await sonda(page, 'cuadros')).toBe(c0)
  // Detenida: queda la captura y sigue sin dibujarse sola.
  await page.keyboard.press('Shift+F5')
  await expect(page.locator('.osc-estado')).toHaveText(/^Detenida · captura de t = /)
  const d1 = await sonda(page, 'pantallas')
  await page.waitForTimeout(1000)
  expect(await sonda(page, 'pantallas')).toBe(d1)
  await app.close()
})

test('memoria con el osciloscopio de cuatro canales corriendo (solo se registra, sin umbral)', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', AMPLIFICADOR)
  await page.waitForTimeout(1500)
  const detenida = await memoria(app)
  await simular(page)
  await page.waitForTimeout(3000)
  const cerrada = await memoria(app)
  await verFranja(page, 'Osciloscopio')
  await page.waitForTimeout(3000)
  const abierta = await memoria(app)
  console.log(
    `${detenida.priv.toFixed(0)} MB privados detenida, ${cerrada.priv.toFixed(0)} corriendo con la pestaña cerrada y ` +
      `${abierta.priv.toFixed(0)} con la pestaña Osciloscopio abierta (${abierta.ws.toFixed(0)} MB de conjunto de trabajo), sin umbral`
  )
  await page.keyboard.press('Shift+F5')
  await app.close()
})

test('axe sin fallas graves ni críticas con el osciloscopio, el multímetro y el generador, en los dos temas', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', DIVISOR)
  for (const tema of ['claro', 'oscuro']) {
    if (tema === 'oscuro') await page.getByRole('button', { name: /^Tema oscuro/ }).click()
    await simular(page)
    await page.waitForTimeout(1000)
    await verFranja(page, 'Osciloscopio')
    expect(await fallasGraves(page), `${tema}: osciloscopio`).toEqual([])
    await clicEn(page, 50, 0)
    await verInspector(page)
    expect(await fallasGraves(page), `${tema}: multímetro en el inspector`).toEqual([])
    await verMediciones(page)
    expect(await fallasGraves(page), `${tema}: multímetro en Mediciones`).toEqual([])
    await verInspector(page)
    await clicEn(page, 80, 0)
    expect(await fallasGraves(page), `${tema}: generador`).toEqual([])
    await page.keyboard.press('Shift+F5')
    await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('detenida')
  }
  await app.close()
})
