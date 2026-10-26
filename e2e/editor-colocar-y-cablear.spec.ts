import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { lanzar } from './lanzar'

let app: ElectronApplication
let page: Page

test.describe.configure({ mode: 'serial' })

const R = (id: string, ref: string, x: number) => ({ id, tipo: 'resistencia', ref, x, y: 0, rot: 0, espejo: false, props: {} })
/** R1 (a) en el origen, pines en (-4, 0) y (4, 0); R2 (b) en (20, 0), pines en (16, 0) y (24, 0). */
const DOS = { piezas: { a: R('a', 'R1', 0), b: R('b', 'R2', 20) }, cables: {}, etiquetas: {}, notas: {} }

/** Llama a un método de la sonda `window.__kirchi` dentro de la página. */
const sonda = (metodo: string, ...args: unknown[]): Promise<any> =>
  page.evaluate(([m, a]) => (window as any).__kirchi[m](...a), [metodo, args] as [string, unknown[]])
const aPantalla = (x: number, y: number): Promise<{ x: number; y: number }> => page.evaluate(([a, b]) => (window as any).__kirchi.aPantalla(a, b), [x, y])
const doc = (): Promise<any> => page.evaluate(() => (window as any).__kirchi.doc())
const conexiones = (): Promise<any> => page.evaluate(() => (window as any).__kirchi.conexiones())

async function memoria() {
  return app.evaluate(({ app }) => {
    const procs = app.getAppMetrics()
    return {
      // privateBytes solo existe en Windows; en macOS y Linux se usa el conjunto de trabajo.
      priv: procs.reduce((s, p) => s + ((p.memory as any).privateBytes ?? p.memory.workingSetSize), 0),
      ws: procs.reduce((s, p) => s + p.memory.workingSetSize, 0)
    }
  })
}

test.beforeAll(async () => {
  app = await lanzar()
  page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await page.waitForTimeout(800)
})

test.afterAll(async () => {
  await app?.close()
})

test('la librería de piezas carga sin errores', async () => {
  expect(await sonda('errores')).toEqual([])
})

/** Doble clic en el vacío, escribe `consulta` en el buscador y Enter: deja el fantasma listo para colocar. */
async function elegirEnBuscador(x: number, y: number, consulta: string) {
  await page.mouse.dblclick(x, y)
  await page.locator('.buscador-campo').fill(consulta)
  await page.keyboard.press('Enter')
  await expect.poll(() => sonda('herramienta')).toBe('colocar')
}
const cursorDelLienzo = () => page.locator('canvas.lienzo-gl').evaluate((el) => (el as HTMLElement).style.cursor)

test('doble clic, «r 1k» y Enter coloca una resistencia y vuelve a seleccionar', async () => {
  const caja = (await page.locator('canvas.lienzo-gl').boundingBox())!
  const x = caja.x + caja.width / 2, y = caja.y + caja.height / 2
  await elegirEnBuscador(x, y, 'r 1k')
  await page.mouse.click(x, y)
  expect(await sonda('herramienta')).toBe('seleccionar')
  const piezas = Object.values((await doc()).piezas)
  expect(piezas).toHaveLength(1)
  expect(piezas[0]).toMatchObject({ tipo: 'resistencia', ref: 'R1', props: { valor: '1k' } })
  // El pulso de confirmación dura 220 ms y luego el lienzo vuelve a dibujar solo bajo demanda.
  await expect.poll(() => sonda('animando')).toBe(0)
})

test('otra resistencia encima de R1 no se coloca: fantasma rojo, aviso y cursor de prohibido', async () => {
  const r1 = Object.values((await doc()).piezas)[0] as { x: number; y: number }
  const lejos = await aPantalla(r1.x + 30, r1.y + 20)
  await elegirEnBuscador(lejos.x, lejos.y, 'r')
  const encima = await aPantalla(r1.x + 2, r1.y)
  await page.mouse.move(encima.x, encima.y, { steps: 5 })
  await expect(page.locator('.globo')).toHaveText('Se encima con R1.')
  expect(await cursorDelLienzo()).toBe('not-allowed')
  await page.mouse.click(encima.x, encima.y)
  expect(Object.values((await doc()).piezas)).toHaveLength(1)
  expect(await sonda('herramienta')).toBe('colocar')
  // Clic derecho cancela la colocación.
  await page.mouse.click(encima.x, encima.y, { button: 'right' })
  expect(await sonda('herramienta')).toBe('seleccionar')
  expect(await cursorDelLienzo()).toBe('')
  await expect(page.locator('.globo')).toHaveCount(0)
})

test('Shift+clic coloca dos resistencias seguidas', async () => {
  await sonda('cargar', { piezas: {}, cables: {}, etiquetas: {}, notas: {} })
  const a = await aPantalla(0, 0), b = await aPantalla(0, 12)
  await elegirEnBuscador(a.x, a.y, 'r')
  await page.keyboard.down('Shift')
  await page.mouse.click(a.x, a.y)
  await page.mouse.move(b.x, b.y, { steps: 5 })
  await page.mouse.click(b.x, b.y)
  await page.keyboard.up('Shift')
  expect(await sonda('herramienta')).toBe('colocar')
  await page.keyboard.press('Escape')
  const piezas = Object.values((await doc()).piezas) as { x: number; y: number }[]
  expect(piezas.map((p) => [p.x, p.y])).toEqual([[0, 0], [0, 12]])
})

test('cablear entre dos pines con clics', async () => {
  await sonda('cargar', DOS)
  const p1 = await aPantalla(4, 0), p2 = await aPantalla(16, 0)
  await page.mouse.click(p1.x, p1.y)
  await page.mouse.move(p2.x, p2.y, { steps: 5 })
  await page.mouse.click(p2.x, p2.y)
  const cables = Object.values((await doc()).cables) as { puntos: unknown }[]
  expect(cables).toHaveLength(1)
  expect(cables[0].puntos).toEqual([{ x: 4, y: 0 }, { x: 16, y: 0 }])
  const con = await conexiones()
  expect(con.redDePin['a:2']).toBe(con.redDePin['b:1'])
})

test('arrastrar una pieza estira el cable y la conexión sigue', async () => {
  const a = await aPantalla(20, 0), b = await aPantalla(20, 6)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 8 })
  await page.mouse.up()
  const d = await doc()
  expect(d.piezas.b).toMatchObject({ x: 20, y: 6 })
  expect((Object.values(d.cables)[0] as { puntos: unknown }).puntos).toEqual([{ x: 4, y: 0 }, { x: 16, y: 0 }, { x: 16, y: 6 }])
  const con = await conexiones()
  expect(con.redDePin['a:2']).toBe(con.redDePin['b:1'])
})

test('Ctrl+Z deshace el arrastre completo en un paso', async () => {
  await page.keyboard.press('Control+z')
  const d = await doc()
  expect(d.piezas.b).toMatchObject({ x: 20, y: 0 })
  expect((Object.values(d.cables)[0] as { puntos: unknown }).puntos).toEqual([{ x: 4, y: 0 }, { x: 16, y: 0 }])
})

test('clic derecho durante el cableado lo cancela sin crear cable', async () => {
  await sonda('cargar', DOS)
  const p1 = await aPantalla(4, 0), esquina = await aPantalla(10, 6)
  await page.mouse.click(p1.x, p1.y)
  await page.mouse.move(esquina.x, esquina.y, { steps: 5 })
  await page.mouse.click(esquina.x, esquina.y)
  expect(await sonda('herramienta')).toBe('cablear')
  await page.mouse.click(esquina.x, esquina.y, { button: 'right' })
  expect(await sonda('herramienta')).toBe('seleccionar')
  expect((await doc()).cables).toEqual({})
})

test('arrastrar de un pin de R1 a uno de R2 crea un cable que une las dos redes', async () => {
  await sonda('cargar', DOS)
  const p1 = await aPantalla(4, 0), p2 = await aPantalla(16, 0)
  await page.mouse.move(p1.x, p1.y)
  await page.mouse.down()
  await page.mouse.move(p2.x, p2.y, { steps: 8 })
  await page.mouse.up()
  const cables = Object.values((await doc()).cables) as { puntos: unknown }[]
  expect(cables).toHaveLength(1)
  expect(cables[0].puntos).toEqual([{ x: 4, y: 0 }, { x: 16, y: 0 }])
  const con = await conexiones()
  expect(con.redDePin['a:2']).toBe(con.redDePin['b:1'])
  expect(await sonda('herramienta')).toBe('seleccionar')
})

test('doble clic derecho sobre R1 la borra y Ctrl+Z la regresa', async () => {
  await sonda('cargar', DOS)
  const r1 = await aPantalla(0, 0.5)
  await page.mouse.click(r1.x, r1.y, { button: 'right' })
  await page.mouse.click(r1.x, r1.y, { button: 'right' })
  expect(Object.keys((await doc()).piezas)).toEqual(['b'])
  await page.keyboard.press('Control+z')
  expect(Object.keys((await doc()).piezas).sort()).toEqual(['a', 'b'])
})

test('una resistencia colocada sobre un cable queda en serie', async () => {
  await sonda('cargar', { piezas: {}, cables: { w: { id: 'w', puntos: [{ x: -20, y: 0 }, { x: 20, y: 0 }] } }, etiquetas: {}, notas: {} })
  // Con los paneles el lienzo es más bajo: (0, 16) puede quedar fuera de la vista; (0, 8) siempre se ve.
  const vacio = await aPantalla(0, 8), sobre = await aPantalla(0, 0)
  await elegirEnBuscador(vacio.x, vacio.y, 'r')
  await page.mouse.move(sobre.x, sobre.y, { steps: 5 })
  await page.mouse.click(sobre.x, sobre.y)
  const d = await doc()
  const r = Object.values(d.piezas)[0] as { id: string }
  expect((Object.values(d.cables) as { puntos: unknown }[]).map((c) => c.puntos)).toEqual([
    [{ x: -20, y: 0 }, { x: -4, y: 0 }],
    [{ x: 4, y: 0 }, { x: 20, y: 0 }]
  ])
  const con = await conexiones()
  expect(con.redDePin[`${r.id}:1`]).not.toBe(con.redDePin[`${r.id}:2`])
  expect(con.uniones).toEqual([])
})

test('en una ventana chica F encuadra sin cortar textos ni meter nada bajo el minimapa', async () => {
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.unmaximize()
    w.setContentSize(900, 560)
  })
  await page.waitForTimeout(500)
  // Tres resistencias en las esquinas: con el encuadre anterior (sin textos ni minimapa) «R1» quedaba a 1 px del borde
  // superior, «1 kΩ» de R3 se cortaba abajo y R3 caía bajo el minimapa.
  const r = (id: string, ref: string, x: number, y: number) => ({ id, tipo: 'resistencia', ref, x, y, rot: 0, espejo: false, props: {} })
  await sonda('cargar', { piezas: { a: r('a', 'R1', 0, 0), b: r('b', 'R2', 36, 0), c: r('c', 'R3', 36, 20) }, cables: {}, etiquetas: {}, notas: {} })
  await page.keyboard.press('f')
  await page.waitForTimeout(100)
  const lienzo = (await page.locator('canvas.lienzo-gl').boundingBox())!
  // Con todo el circuito a la vista el minimapa se oculta: entonces no hay nada que se le meta debajo.
  const mini = (await page.locator('.minimapa').count()) > 0 ? await page.locator('.minimapa').boundingBox() : null
  // Extremos de lo dibujado: pines en x = −4 y 40; las referencias van 3 arriba y los valores 3 abajo, con 1.6 de alto.
  const a = await aPantalla(-4, -3.8), b = await aPantalla(40, 23.8)
  const margen = 24 - 1
  expect(a.x - lienzo.x).toBeGreaterThanOrEqual(margen)
  expect(a.y - lienzo.y).toBeGreaterThanOrEqual(margen)
  expect(lienzo.x + lienzo.width - b.x).toBeGreaterThanOrEqual(margen)
  expect(lienzo.y + lienzo.height - b.y).toBeGreaterThanOrEqual(margen)
  const tocaMinimapa = mini !== null && b.x > mini.x - margen && b.y > mini.y - margen
  expect(tocaMinimapa).toBe(false)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await page.waitForTimeout(800)
})

/** Tramos de una polilínea que entran al interior de una caja. */
const tramosDentro = (pts: { x: number; y: number }[], c: { minX: number; minY: number; maxX: number; maxY: number }) =>
  pts.slice(1).filter((q, i) => {
    const p = pts[i]
    const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x), y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y)
    return x0 < c.maxX && x1 > c.minX && y0 < c.maxY && y1 > c.minY && (y0 === y1 ? y0 > c.minY && y0 < c.maxY : x0 > c.minX && x0 < c.maxX)
  }).length

test('un cable cuya L pasaría por una resistencia se enruta alrededor de ella', async () => {
  const r = (id: string, ref: string, x: number, y: number, rot = 0) => ({ id, tipo: 'resistencia', ref, x, y, rot, espejo: false, props: {} })
  // R3 vertical en (10, 0): la L primero horizontal de (4, 0) a (16, 10) la atravesaría (cuerpo x 9..11, y −2.5..2.5).
  await sonda('cargar', { piezas: { a: r('a', 'R1', 0, 0), b: r('b', 'R2', 20, 10), m: r('m', 'R3', 10, 0, 90) }, cables: {}, etiquetas: {}, notas: {} })
  const p1 = await aPantalla(4, 0), medio = await aPantalla(12, 0.4), p2 = await aPantalla(16, 10)
  await page.mouse.click(p1.x, p1.y)
  await page.mouse.move(medio.x, medio.y, { steps: 4 })
  await page.mouse.move(p2.x, p2.y, { steps: 4 })
  await page.mouse.click(p2.x, p2.y)
  const cables = Object.values((await doc()).cables) as { puntos: { x: number; y: number }[] }[]
  expect(cables).toHaveLength(1)
  expect(tramosDentro(cables[0].puntos, { minX: 9, minY: -2.5, maxX: 11, maxY: 2.5 })).toBe(0)
  const con = await conexiones()
  expect(con.redDePin['a:2']).toBe(con.redDePin['b:1'])
})

test('arrastrar el tramo de un chipote hasta la línea lo deja recto', async () => {
  const r = (id: string, ref: string, x: number) => ({ id, tipo: 'resistencia', ref, x, y: 0, rot: 0, espejo: false, props: {} })
  const w = { id: 'w', puntos: [{ x: 0, y: 0 }, { x: 0, y: -8 }, { x: 18, y: -8 }, { x: 18, y: 0 }, { x: 40, y: 0 }] }
  await sonda('cargar', { piezas: { a: r('a', 'R1', -4), b: r('b', 'R2', 44) }, cables: { w }, etiquetas: {}, notas: {} })
  const de = await aPantalla(9, -8), a = await aPantalla(9, 0)
  await page.mouse.move(de.x, de.y)
  await page.mouse.down()
  await page.mouse.move(a.x, a.y, { steps: 8 })
  await page.mouse.up()
  const cables = Object.values((await doc()).cables) as { puntos: unknown }[]
  expect(cables.map((c) => c.puntos)).toEqual([[{ x: 0, y: 0 }, { x: 40, y: 0 }]])
})

test('tres flechas a la derecha mueven R1 6 unidades y Ctrl+Z la regresa en un paso', async () => {
  await sonda('cargar', DOS)
  const r1 = await aPantalla(0, 0.5)
  await page.mouse.click(r1.x, r1.y)
  for (let k = 0; k < 3; k++) await page.keyboard.press('ArrowRight')
  expect((await doc()).piezas.a).toMatchObject({ x: 6, y: 0 })
  await page.keyboard.press('Control+z')
  expect((await doc()).piezas.a).toMatchObject({ x: 0, y: 0 })
})

test('quieto, el lienzo no redibuja', async () => {
  await page.mouse.move(5, 5)
  await page.waitForTimeout(300)
  const c0 = await sonda('cuadros')
  await page.waitForTimeout(1000)
  const c1 = await sonda('cuadros')
  console.log(`cuadros en 1 s de reposo: ${c1 - c0}`)
  expect(c1 - c0).toBeLessThanOrEqual(1)
})

test('memoria privada con 1,000 piezas tras usar la aplicación (solo se registra, sin umbral)', async () => {
  // El criterio con umbral (350 MB) se mide con la aplicación recién abierta y el recolector forzado en
  // vista-previa.spec.ts. Aquí queda la cifra tras arrastrar, cablear y
  // escribir en los casos anteriores, que arrastra memoria que el recolector aún no devolvió.
  await sonda('cargarDemo', 1000)
  await page.waitForTimeout(2000)
  const pantalla = await app.evaluate(({ screen }) => {
    const d = screen.getPrimaryDisplay()
    return { w: Math.round(d.size.width * d.scaleFactor), h: Math.round(d.size.height * d.scaleFactor) }
  })
  const ventana = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }))
  const m = await memoria()
  console.log(
    `memoria con 1,000 piezas TRAS USARLA: ${(m.priv / 1024).toFixed(0)} MB privados, ${(m.ws / 1024).toFixed(0)} MB de conjuntos de trabajo; ` +
      `pantalla ${pantalla.w}×${pantalla.h}, ventana ${ventana.w}×${ventana.h} a ${ventana.dpr}×, sin umbral`
  )
  expect(m.priv).toBeGreaterThan(0)
})

test('5,000 piezas reales a 60 fps', async () => {
  await sonda('cargarDemo', 5000)
  await page.waitForTimeout(1000)
  await sonda('medir', true)
  await page.waitForTimeout(3000)
  const s = await sonda('fps')
  await sonda('medir', false)
  const m = await memoria()
  console.log(`cuadros con 5,000 piezas: ${JSON.stringify(s)}; memoria: ${(m.priv / 1024).toFixed(0)} MB privados (solo registro)`)
  expect(s.fps).toBeGreaterThan(55)
})
