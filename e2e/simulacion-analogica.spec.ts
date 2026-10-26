import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { carpetaNueva, lanzar } from './lanzar'

/** Simulación analógica sobre Electron: el LED sigue al potenciómetro, un amplificador con transistor corre al 100 % del tiempo real y se registra la memoria. Requiere ventana. */
test.describe.configure({ mode: 'serial' })

const pieza = (id: string, tipo: string, ref: string, x: number, y: number, props: Record<string, string> = {}) => ({ id, tipo, ref, x, y, rot: 0, espejo: false, props })
type Pieza = ReturnType<typeof pieza>
/** Documento sin cables: cada pin lleva una etiqueta con el nombre de su red (`0` es tierra, unida a una pieza Tierra). */
function doc(partes: [Pieza, Record<string, [number, number, string]>][]) {
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
/** Pines de cada pieza (los de su `pieza.json`) con la red a la que van. */
const dosPines = (a: string, b: string): Record<string, [number, number, string]> => ({ '1': [-4, 0, a], '2': [4, 0, b] })
const fuente = (pos: string, neg: string): Record<string, [number, number, string]> => ({ '+': [0, -4, pos], '-': [0, 4, neg] })
const led = (a: string, k: string): Record<string, [number, number, string]> => ({ A: [-4, 0, a], K: [4, 0, k] })
const npn = (b: string, c: string, e: string): Record<string, [number, number, string]> => ({ B: [-4, 0, b], C: [2, -4, c], E: [2, 4, e] })

/** 9 V, potenciómetro de 10 kΩ que polariza la base de un 2N2222 por 100 kΩ y un LED con 470 Ω en el colector: entre 35 y 65 % el transistor está en región activa (unos 6 mA al centro). */
const POT_LED = doc([
  [pieza('v1', 'fuente-dc', 'V1', 0, 0, { voltaje: '9' }), fuente('vcc', '0')],
  [pieza('g', 'tierra', 'GND1', -20, 0), { '1': [0, 0, '0'] }],
  [pieza('rv', 'potenciometro', 'RV1', 20, 0, { valor: '10k', posicion: '50 %' }), { '1': [-4, 0, '0'], '2': [4, 0, 'vcc'], '3': [0, -4, 'cur'] }],
  [pieza('rb', 'resistencia', 'R1', 40, 0, { valor: '100k' }), dosPines('cur', 'b')],
  [pieza('q1', 'npn', 'Q1', 60, 0), npn('b', 'k', '0')],
  [pieza('rc', 'resistencia', 'R2', 80, 0, { valor: '470' }), dosPines('vcc', 'a')],
  [pieza('d1', 'led', 'D1', 100, 0, { color: 'rojo' }), led('a', 'k')]
])

/** Amplificador de emisor común con un 2N2222 y un LED en el colector: 12 V, divisor de 47 kΩ y 10 kΩ, 2.2 kΩ de colector, 470 Ω con 10 µF en el emisor y señal de 20 mV a 1 kHz. `n` sufija redes y piezas. */
function amplificador(n = '', x0 = 0, y0 = 0): [Pieza, Record<string, [number, number, string]>][] {
  const red = (r: string) => (r === '0' ? '0' : `${r}${n}`)
  const p = (id: string, tipo: string, ref: string, x: number, props: Record<string, string> = {}) => pieza(`${id}${n}`, tipo, `${ref}${n}`, x0 + x, y0, props)
  return [
    [p('v1', 'fuente-dc', 'V', 0, { voltaje: '12' }), fuente(red('vcc'), '0')],
    [p('g', 'tierra', 'GND', -20), { '1': [0, 0, '0'] }],
    [p('vs', 'fuente-ac', 'VS', 20, { amplitud: '20m', frecuencia: '1k' }), fuente(red('s'), '0')],
    [p('c1', 'capacitor', 'C', 40, { valor: '1u' }), dosPines(red('s'), red('b'))],
    [p('r1', 'resistencia', 'RA', 60, { valor: '47k' }), dosPines(red('vcc'), red('b'))],
    [p('r2', 'resistencia', 'RB', 80, { valor: '10k' }), dosPines(red('b'), '0')],
    [p('rc', 'resistencia', 'RC', 100, { valor: '2.2k' }), dosPines(red('vcc'), red('a'))],
    [p('d1', 'led', 'D', 120, { color: 'rojo' }), led(red('a'), red('c'))],
    [p('q1', 'npn', 'Q', 140), npn(red('b'), red('c'), red('e'))],
    [p('re', 'resistencia', 'RE', 160, { valor: '470' }), dosPines(red('e'), '0')],
    [p('ce', 'capacitor', 'CE', 180, { valor: '10u' }), dosPines(red('e'), '0')]
  ]
}

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

test('al mover el potenciómetro, la corriente del LED cambia en el siguiente cuadro', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', POT_LED)
  await simular(page)
  await expect.poll(async () => (await sonda(page, 'simulacion')).piezas.d1?.i as number).toBeGreaterThan(1e-4)
  await page.waitForTimeout(500)
  const rv = await sonda(page, 'aPantalla', 20, 0)
  await page.mouse.click(rv.x, rv.y)
  for (let paso = 0; paso < 3; paso++) {
    const antes = (await sonda(page, 'vista')).piezas.d1.i as number
    // Cuenta cuadros (requestAnimationFrame) desde que llega la tecla a la página (el escucha de `keydown` en captura, no el
    // momento en que Playwright la manda) hasta que cambia la corriente del LED en la lectura que dibuja el lienzo
    // (`vista()`, no la que se pide al motor). Se mira al terminar cada cuadro, después de todas sus llamadas de rAF.
    const cuadros = page.evaluate((i0) => {
      return new Promise<number>((listo) => {
        window.addEventListener(
          'keydown',
          () => {
            let n = 0
            const mirar = () => {
              n++
              const i = (window as any).__kirchi.vista().piezas.d1.i as number
              if (Math.abs(i - i0) > 0.01 * Math.abs(i0) || n > 60) listo(n)
              else requestAnimationFrame(() => setTimeout(mirar, 0))
            }
            requestAnimationFrame(() => setTimeout(mirar, 0))
          },
          { capture: true, once: true }
        )
      })
    }, antes)
    // Simulando, con el potenciómetro seleccionado, la flecha a la derecha mueve su cursor 5 %.
    await page.keyboard.press('ArrowRight')
    const n = await cuadros
    console.log(`el LED cambió ${n} cuadro(s) después de mover el cursor (de ${(antes * 1000).toFixed(2)} mA)`)
    // El cuadro en que llega la tecla o el siguiente: el worker toma el cambio en su próximo ciclo (12 ms como mucho) y la
    // ventana lee en cada cuadro tras un cambio en caliente. Con solo la lectura de 10 Hz, sin ventana, tardaba hasta 5.
    expect(n).toBeLessThanOrEqual(2)
    await page.waitForTimeout(300)
  }
  await page.keyboard.press('Shift+F5')
  await app.close()
})

test('un amplificador de un transistor con un LED corre al 100 % del tiempo real', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', doc(amplificador()))
  await simular(page)
  await expect.poll(async () => (await sonda(page, 'simulacion')).piezas.d1?.i as number).toBeGreaterThan(1e-3)
  await page.waitForTimeout(1000)
  const medir = () => page.evaluate(() => ({ t: (window as any).__kirchi.simulacion().t as number, reloj: performance.now() / 1000 }))
  const a = await medir()
  await page.waitForTimeout(5000)
  const b = await medir()
  const s = await sonda(page, 'simulacion')
  const ritmo = (b.t - a.t) / (b.reloj - a.reloj)
  console.log(`amplificador con LED a ${(100 * ritmo).toFixed(1)} % del tiempo real (ratio del worker ${s.ratio.toFixed(3)}, t = ${b.t.toFixed(3)} s)`)
  expect(ritmo).toBeGreaterThan(0.99)
  expect(s.ratio).toBeGreaterThan(0.995)
  await expect(page.locator('.estado-lento')).toHaveCount(0)
  await page.keyboard.press('Shift+F5')
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
/** Fuerza el recolector de basura del renderizador por el protocolo de depuración. */
async function recolectar(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('HeapProfiler.enable')
  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.detach()
}

test('memoria con la vista previa corriendo 20 amplificadores con transistor (solo se registra, sin umbral)', async () => {
  const { app, page } = await abrir()
  const partes = Array.from({ length: 20 }, (_, k) => amplificador(`_${k}`, 0, 30 * k)).flat()
  await sonda(page, 'cargar', doc(partes))
  await page.waitForTimeout(1500)
  await recolectar(page)
  const antes = await memoria(app)
  await simular(page)
  await expect.poll(async () => (await sonda(page, 'simulacion')).piezas.d1_19?.i as number).toBeGreaterThan(1e-3)
  await page.waitForTimeout(4000)
  const s = await sonda(page, 'simulacion')
  await recolectar(page)
  const corriendo = await memoria(app)
  console.log(
    `memoria con 20 amplificadores (${partes.length} piezas, 20 transistores): ${antes.priv.toFixed(0)} MB privados detenida; ` +
      `${corriendo.priv.toFixed(0)} MB privados corriendo (t = ${s.t.toFixed(3)} s, ${(100 * s.ratio).toFixed(0)} % del tiempo real; ${corriendo.ws.toFixed(0)} MB de conjunto de trabajo), sin umbral`
  )
  expect(corriendo.priv).toBeGreaterThan(0)
  await page.keyboard.press('Shift+F5')
  await app.close()
})
