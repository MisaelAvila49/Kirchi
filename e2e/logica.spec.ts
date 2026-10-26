import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { fallasGraves } from './axe'
import { verFranja, verInspector, verMediciones } from './franja'
import { carpetaNueva, lanzar } from './lanzar'

/** Lógica sobre Electron: contador con el 555 a 1 Hz, estado lógico en el LED, 555 a 1 kHz al 100 % del tiempo real, anillo que oscila, memoria y axe con lecturas digitales. Requiere ventana. */
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

/** 555 astable (1 kΩ, `r2`, `c1`), contador hasta 9, decodificador y display de cátodo común con 330 Ω por segmento. */
function reloj(r2: string, c1: string) {
  const R = (id: string, ref: string, x: number, y: number, valor: string, a: string, b: string): [Pieza, Pines] => [pieza(id, 'resistencia', ref, x, y, { valor }), dosPines(a, b)]
  return doc([
    tierra,
    [pieza('v1', 'fuente-dc', 'V1', -40, 0, { voltaje: '5' }), { '+': [0, -4, 'vcc'], '-': [0, 4, '0'] }],
    R('ra', 'R1', -20, -20, '1k', 'vcc', 'dis'),
    R('rb', 'R2', -20, -10, r2, 'dis', 'thr'),
    [pieza('c1', 'capacitor', 'C1', -20, 10, { valor: c1 }), dosPines('thr', '0')],
    [pieza('c2', 'capacitor', 'C2', -20, 20, { valor: '10n' }), dosPines('cv', '0')],
    [pieza('u1', 'temporizador-555', 'U1', 0, 0, { modelo: 'NE555' }), { '1': [0, 8, '0'], '2': [-6, 4, 'thr'], '3': [6, -2, 'ck'], '4': [2, -8, 'vcc'], '5': [6, 4, 'cv'], '6': [-6, 0, 'thr'], '7': [-6, -4, 'dis'], '8': [-2, -8, 'vcc'] }],
    [pieza('u2', 'contador', 'U2', 30, 0), { CLK: [-6, -4, 'ck'], RST: [-6, 2, '0'], Q0: [6, -6, 'q0'], Q1: [6, -4, 'q1'], Q2: [6, -2, 'q2'], Q3: [6, 0, 'q3'], CO: [6, 4, 'co'] }],
    [pieza('u3', 'decodificador-7seg', 'U3', 60, 0), { A: [-6, -6, 'q0'], B: [-6, -4, 'q1'], C: [-6, -2, 'q2'], D: [-6, 0, 'q3'], a: [6, -8, 'pa'], b: [6, -6, 'pb'], c: [6, -4, 'pc'], d: [6, -2, 'pd'], e: [6, 0, 'pe'], f: [6, 2, 'pf'], g: [6, 4, 'pg'] }],
    ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s, k) => R(`s${s}`, `R${k + 3}`, 90, -24 + 8 * k, '330', `p${s}`, `an_${s}`)),
    [pieza('ds', 'display-7seg', 'DS1', 120, 0), { a: [-6, -8, 'an_a'], b: [-6, -6, 'an_b'], c: [-6, -4, 'an_c'], d: [-6, -2, 'an_d'], e: [-6, 0, 'an_e'], f: [-6, 2, 'an_f'], g: [-6, 4, 'an_g'], dp: [-6, 6, 'suelto'], COM: [6, 0, '0'] }]
  ])
}
/** Dos estados lógicos, una NAND y un LED rojo con 330 Ω. */
const NAND_LED = doc([
  tierra,
  [pieza('e1', 'estado-logico', 'E1', 0, -10, { estado: '1' }), { S: [4, 0, 'a'] }],
  [pieza('e2', 'estado-logico', 'E2', 0, 10, { estado: '1' }), { S: [4, 0, 'b'] }],
  [pieza('u1', 'nand', 'U1', 20, 0), { A: [-6, -2, 'a'], B: [-6, 2, 'b'], Y: [6, 0, 'y'] }],
  [pieza('r1', 'resistencia', 'R1', 40, 0, { valor: '330' }), dosPines('y', 'k')],
  [pieza('d1', 'led', 'D1', 60, 0, { color: 'rojo' }), { A: [-4, 0, 'k'], K: [4, 0, '0'] }]
])
/** Tres inversores en anillo, sin nada más. */
const ANILLO = doc([
  [pieza('u1', 'not', 'U1', 0, 0), { A: [-6, 0, 'c'], Y: [6, 0, 'a'] }],
  [pieza('u2', 'not', 'U2', 20, 0), { A: [-6, 0, 'a'], Y: [6, 0, 'b'] }],
  [pieza('u3', 'not', 'U3', 40, 0), { A: [-6, 0, 'b'], Y: [6, 0, 'c'] }]
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
const muestra = async (page: Page): Promise<string> => (await sonda(page, 'vista')).piezas.ds?.extra?.muestra ?? ''

test('con el 555 a 1 Hz el display cuenta un dígito por segundo', async () => {
  const { app, page } = await abrir()
  // f = 1.44 / ((1 kΩ + 2 · 720 kΩ) · 1 µF) = 1.00 Hz.
  await sonda(page, 'cargar', reloj('720k', '1u'))
  await simular(page)
  // La primera carga del capacitor (de 0 a 2/3 de VCC) tarda más que un periodo.
  await page.waitForTimeout(2500)
  const vistos: string[] = []
  const inicio = Date.now()
  while (Date.now() - inicio < 6000) {
    // Solo los dígitos: una lectura a mitad de un cambio puede dar segmentos sueltos («a y b encendidos»).
    const m = await muestra(page)
    if (/^muestra \d$/.test(m) && m !== vistos.at(-1)) vistos.push(m)
    await page.waitForTimeout(50)
  }
  console.log(`a 1 Hz: el display mostró ${vistos.join(', ')} en 6 s`)
  // Seis segundos a un dígito por segundo: entre cinco y siete cambios, todos dígitos seguidos.
  expect(vistos.length).toBeGreaterThanOrEqual(6)
  expect(vistos.length).toBeLessThanOrEqual(8)
  const d = vistos.map((v) => Number(/^muestra (\d)$/.exec(v)?.[1]))
  for (let k = 1; k < d.length; k++) expect((d[k - 1] + 1) % 10).toBe(d[k])
  await page.keyboard.press('Shift+F5')
  await app.close()
})

test('conmutar un estado lógico cambia el LED en el cuadro siguiente', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', NAND_LED)
  await simular(page)
  await page.waitForTimeout(500)
  const e2 = await sonda(page, 'aPantalla', 0, 10)
  // Un número impar de veces: al terminar, E2 sale en 0 aunque el documento diga 1.
  for (let vez = 0; vez < 3; vez++) {
    const antes = (await sonda(page, 'vista')).piezas.d1.i as number
    // Cuadros desde que el clic llega a la página (el escucha de `pointerdown` en captura) hasta que cambia la corriente del LED
    // en la lectura que dibuja el lienzo (`vista()`), como la prueba del potenciómetro.
    const cuadros = page.evaluate((i0) => {
      return new Promise<number>((listo) => {
        window.addEventListener(
          'pointerdown',
          () => {
            let n = 0
            const mirar = () => {
              n++
              const i = (window as any).__kirchi.vista().piezas.d1.i as number
              if (Math.abs(i - i0) > 1e-3 || n > 60) listo(n)
              else requestAnimationFrame(() => setTimeout(mirar, 0))
            }
            requestAnimationFrame(() => setTimeout(mirar, 0))
          },
          { capture: true, once: true }
        )
      })
    }, antes)
    await page.mouse.click(e2.x, e2.y)
    const n = await cuadros
    console.log(`el LED cambió ${n} cuadro(s) después de conmutar E2 (de ${(antes * 1000).toFixed(2)} mA)`)
    expect(n).toBeLessThanOrEqual(2)
    await page.waitForTimeout(300)
  }
  // El documento no cambió: sigue con E2 en 1 mientras se ve en 0, y al detener el rótulo vuelve a decir 1.
  expect((await sonda(page, 'doc')).piezas.e2.props.estado).toBe('1')
  await page.keyboard.press('Shift+F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('detenida')
  expect((await sonda(page, 'doc')).piezas.e2.props.estado).toBe('1')
  const rotulo = async () => ((await sonda(page, 'textos')).find((t: { x: number; y: number; texto: string }) => Math.abs(t.x) < 3 && Math.abs(t.y - 10) < 3 && (t.texto === '0' || t.texto === '1')))?.texto
  await expect.poll(rotulo, { timeout: 2000 }).toBe('1')
  await app.close()
})

test('con el 555 a 1 kHz, el contador, el decodificador y el display corren al 100 % del tiempo real', async () => {
  const { app, page } = await abrir()
  // f = 1.44 / ((1 kΩ + 2 · 6.8 kΩ) · 100 nF) = 986 Hz.
  await sonda(page, 'cargar', reloj('6.8k', '100n'))
  await simular(page)
  await page.waitForTimeout(1500)
  const medir = () => page.evaluate(() => ({ t: (window as any).__kirchi.simulacion().t as number, reloj: performance.now() / 1000 }))
  const a = await medir()
  await page.waitForTimeout(5000)
  const b = await medir()
  const s = await sonda(page, 'simulacion')
  const ritmo = (b.t - a.t) / (b.reloj - a.reloj)
  console.log(`555 a ${s.piezas.u1?.extra?.f?.toFixed(0)} Hz con contador y display a ${(100 * ritmo).toFixed(1)} % del tiempo real (ratio ${s.ratio.toFixed(3)})`)
  expect(s.piezas.u1?.extra?.f).toBeGreaterThan(900)
  expect(ritmo).toBeGreaterThan(0.99)
  expect(s.ratio).toBeGreaterThan(0.995)
  await expect(page.locator('.estado-lento')).toHaveCount(0)
  await page.keyboard.press('Shift+F5')
  await app.close()
})

test('el anillo de tres inversores oscila, lo dice una vez y se pausa y se detiene sin colgar la ventana', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', ANILLO)
  await simular(page)
  await page.waitForTimeout(1000)
  await verFranja(page, 'Registro')
  await expect(page.locator('.registro')).toContainText(/U1, U2 y U3 forman un lazo que oscila a \d+(\.\d+)? MHz\./)
  const antes = performance.now()
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase, { timeout: 1000 }).toBe('pausada')
  await page.keyboard.press('Shift+F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase, { timeout: 1000 }).toBe('detenida')
  console.log(`pausa y detención del anillo en ${(performance.now() - antes).toFixed(0)} ms`)
  const lineas = (await page.locator('.registro').innerText()).split('\n').filter((t) => t.includes('forman un lazo'))
  expect(lineas).toHaveLength(1)
  await app.close()
})

/** Memoria privada y de conjunto de trabajo (MB) de todos los procesos de la aplicación; privateBytes solo existe en Windows. */
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
async function recolectar(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('HeapProfiler.enable')
  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.detach()
}

test('memoria con la vista previa corriendo el circuito del contador con 555 (solo se registra, sin umbral)', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', reloj('6.8k', '100n'))
  await page.waitForTimeout(1500)
  await recolectar(page)
  const antes = await memoria(app)
  await simular(page)
  await page.waitForTimeout(4000)
  await recolectar(page)
  const corriendo = await memoria(app)
  console.log(`555 con contador y display, ${antes.priv.toFixed(0)} MB privados detenida y ${corriendo.priv.toFixed(0)} MB corriendo (${corriendo.ws.toFixed(0)} MB de conjunto de trabajo), sin umbral`)
  expect(corriendo.priv).toBeGreaterThan(0)
  await page.keyboard.press('Shift+F5')
  await app.close()
})

test('axe sin fallas graves en los dos temas con lecturas digitales en el inspector y Mediciones', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', reloj('10k', '100n'))
  await simular(page)
  await page.keyboard.press('v')
  await page.waitForTimeout(1500)
  for (const [x, y] of [[0, 0], [30, 0], [120, 0]]) {
    const p = await sonda(page, 'aPantalla', x, y)
    await page.mouse.click(p.x, p.y)
    await page.waitForTimeout(300)
    for (const tema of ['claro', 'oscuro']) {
      if ((await page.locator('html').getAttribute('data-tema')) !== tema) await page.getByRole('button', { name: /^Tema (oscuro|claro)/ }).click()
      await verInspector(page)
      await expect(page.locator('aside.inspector')).toBeVisible()
      expect(await fallasGraves(page), `${tema}, pieza en (${x}, ${y}), inspector`).toEqual([])
      // El botón del riel alterna el panel: un clic con Mediciones ya abierto lo plegaría.
      await verMediciones(page)
      expect(await fallasGraves(page), `${tema}, pieza en (${x}, ${y}), Mediciones`).toEqual([])
    }
  }
  await page.keyboard.press('Shift+F5')
  await app.close()
})
