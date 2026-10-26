import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { carpetaNueva, lanzar } from './lanzar'

/** Editor del doble clic y bandera de sonda con el ratón real: cada gesto es un clic o arrastre de verdad. Requiere ventana y correr sola. */
test.describe.configure({ mode: 'serial' })

const pieza = (id: string, tipo: string, ref: string, x: number, y: number, props: Record<string, string> = {}) => ({ id, tipo, ref, x, y, rot: 0, espejo: false, props })
const cable = (id: string, ...pts: [number, number][]) => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })
/** Una resistencia con un cable a cada lado y una sonda de voltaje sobre el cable de la derecha. */
const CIRCUITO = {
  piezas: { r: pieza('r', 'resistencia', 'R1', 16, -4, { valor: '1k' }), g: pieza('g', 'tierra', 'GND1', 40, 8) },
  cables: { a: cable('a', [12, -4], [4, -4]), b: cable('b', [20, -4], [40, -4], [40, 4]) },
  etiquetas: {},
  notas: {},
  sondas: { s1: { id: 's1', tipo: 'voltaje', x: 26, y: -4 } }
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

test('el editor del doble clic no se cierra con un clic en un espacio vacío de su ventana, y sí con uno fuera', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', CIRCUITO)
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('f')
  await page.waitForTimeout(400)
  const c = await sonda(page, 'aPantalla', 16, -4)
  await page.mouse.dblclick(c.x, c.y)
  const caja = page.locator('.en-linea')
  await expect(caja).toBeVisible()
  // Un punto de la caja que no es un control: el propio contenedor.
  const libre = await caja.evaluate((el) => {
    const b = el.getBoundingClientRect()
    for (let y = b.top + 2; y < b.bottom - 2; y += 4)
      for (let x = b.left + 2; x < b.right - 2; x += 6) if (document.elementFromPoint(x, y) === el) return { x, y }
    return null
  })
  expect(libre).not.toBeNull()
  await page.mouse.click(libre!.x, libre!.y)
  await page.waitForTimeout(300)
  await expect(caja).toBeVisible()
  // Fuera de la ventana, sobre el lienzo, sí se cierra.
  await page.mouse.click(40, 700)
  await expect(caja).toHaveCount(0)
  await app.close()
})

test('la bandera de una sonda se arrastra por su cable con el ratón, tomada por la bandera y no por el punto', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', CIRCUITO)
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('f')
  await page.waitForTimeout(400)
  const s = await sonda(page, 'doc').then((d) => d.sondas.s1)
  const punto = await sonda(page, 'aPantalla', s.x, s.y)
  // La bandera flota fuera del cable (arriba a la derecha, o donde haya lugar): se busca con clics reales el desfase donde el
  // lienzo la encuentra en su caja, que es lo que haría una persona al apuntarle.
  let bandera: { x: number; y: number } | null = null
  for (const [dx, dy] of [[40, -40], [-40, -40], [40, 40], [-40, 40], [60, -60], [-60, -60], [25, -25], [-25, -25], [0, -50], [0, 50]]) {
    await page.mouse.click(punto.x + dx, punto.y + dy)
    if (((await sonda(page, 'seleccion')).sondas ?? []).length > 0) {
      bandera = { x: punto.x + dx, y: punto.y + dy }
      break
    }
  }
  expect(bandera, 'se encontró la bandera con el ratón').not.toBeNull()
  await page.mouse.move(bandera!.x, bandera!.y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(bandera!.x + 6 * i, bandera!.y)
  await page.mouse.up()
  const despues = (await sonda(page, 'doc')).sondas.s1
  expect(despues.x).toBeGreaterThan(s.x)
  expect(despues.y).toBe(s.y)
  await page.keyboard.press('Control+z')
  expect((await sonda(page, 'doc')).sondas.s1.x).toBe(s.x)
  await app.close()
})
