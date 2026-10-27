import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { join } from 'node:path'
import { carpetaNueva, lanzar } from './lanzar'

/** «Aprende Kirchi», capítulos 2 a 5 sobre Electron, un paso de cada uno con la acción real. El capítulo 4 usa el diálogo de guardar con respuesta fija, como archivos-y-exportar.spec.ts. Requiere ventana. */
test.describe.configure({ mode: 'serial' })

async function abrir(datos = carpetaNueva()): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await lanzar({ datos })
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await page.waitForTimeout(600)
  return { app, page }
}

const sonda = (page: Page, metodo: string, ...args: unknown[]): Promise<any> => page.evaluate(([m, a]) => (window as any).__kirchi[m](...a), [metodo, args] as [string, unknown[]])
const cabecera = (page: Page) => page.locator('.tutorial-cap').first().textContent()
const cumplido = async (page: Page) => /Cumplido/.test((await cabecera(page)) ?? '')

/** Entra por Ayuda, Aprende Kirchi y el botón del capítulo. */
async function empezar(page: Page, capitulo: string) {
  await page.getByRole('tab', { name: 'Ayuda' }).click()
  await page.locator('[data-comando="aprender"]:visible').click()
  await page.locator(`[data-capitulo="${capitulo}"]`).click()
  await expect(page.locator('.tutorial-globo')).toBeVisible()
}

/** Salta pasos con el botón del globo hasta el paso `n` (desde 1). */
async function irAlPaso(page: Page, n: number) {
  for (let i = 1; i < n; i++) await page.locator('.tutorial-globo').getByRole('button', { name: 'Saltar paso' }).click()
  await expect(page.locator('.tutorial-cap').first()).toHaveText(new RegExp(`Paso ${n} de`))
}

test('capítulo 2: «Medir» con el multímetro cumple el paso 1 con el circuito de arranque', async () => {
  const { app, page } = await abrir()
  await empezar(page, 'medir')
  // El circuito de arranque trae la fuente, la resistencia, el LED y la tierra.
  expect(Object.keys((await sonda(page, 'doc')).piezas)).toHaveLength(4)
  // Clic derecho sobre el cable entre la resistencia y el LED: Medir, Multímetro, Multímetro completo.
  const p = await sonda(page, 'aPantalla', 26, -4)
  await page.mouse.click(p.x, p.y, { button: 'right' })
  await page.locator('[role="menuitem"]', { hasText: /^Medir$/ }).first().click()
  await page.locator('[role="menuitem"]', { hasText: /^Multímetro$/ }).first().click()
  await page.locator('[role="menuitem"]', { hasText: 'Multímetro completo' }).first().click()
  await expect.poll(() => cumplido(page)).toBe(true)
  await app.close()
})

test('capítulo 3: el osciloscopio colocado con el buscador cumple su paso', async () => {
  const { app, page } = await abrir()
  await empezar(page, 'senales')
  await irAlPaso(page, 4)
  const r = (await page.locator('.tutorial-foco-marco').first().boundingBox())!
  const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  await page.mouse.dblclick(c.x, c.y)
  await page.waitForSelector('.buscador input')
  await page.keyboard.type('osciloscopio')
  await page.keyboard.press('Enter')
  await page.mouse.move(c.x + 2, c.y + 2)
  await page.mouse.click(c.x, c.y)
  await expect.poll(() => cumplido(page)).toBe(true)
  await app.close()
})

test('capítulo 4: Ctrl+S con el diálogo nativo respondido cumple «guardar» con el evento del servicio de archivos', async () => {
  const datos = carpetaNueva()
  const { app, page } = await abrir(datos)
  const ruta = join(datos, 'tutorial-archivo.kir')
  await app.evaluate(({ dialog }, ruta) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: ruta })) as unknown as typeof dialog.showSaveDialog
  }, ruta)
  await empezar(page, 'archivo')
  await expect(page.locator('.tutorial-cap').first()).toHaveText(/Paso 1 de 5/)
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+s')
  await expect.poll(() => cumplido(page)).toBe(true)
  expect((await sonda(page, 'archivo')).ruta).toBe(ruta)
  // El siguiente paso pide Nuevo: Ctrl+N cumple con el evento «nuevo» (el circuito ya está guardado y no pregunta).
  await page.locator('.tutorial-globo').hover()
  await page.locator('.tutorial-globo').getByRole('button', { name: 'Siguiente' }).click()
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+n')
  await expect.poll(() => cumplido(page)).toBe(true)
  await app.close()
})

test('capítulo 5: Ctrl+Shift+L deja el lienzo limpio y cumple el paso con la tecla de la tabla de atajos', async () => {
  const { app, page } = await abrir()
  await empezar(page, 'trucos')
  // El texto del paso lee la tecla vigente de la tabla de atajos.
  await expect(page.locator('.tutorial-texto kbd').first()).toHaveText('Ctrl+Shift+L')
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+Shift+L')
  await expect.poll(() => cumplido(page)).toBe(true)
  await app.close()
})

test('el globo cumplido no cambia de alto con el ratón en su borde inferior (no parpadea)', async () => {
  const { app, page } = await abrir()
  await empezar(page, 'medir')
  const p = await sonda(page, 'aPantalla', 26, -4)
  await page.mouse.click(p.x, p.y, { button: 'right' })
  await page.locator('[role="menuitem"]', { hasText: /^Medir$/ }).first().click()
  await page.locator('[role="menuitem"]', { hasText: /^Multímetro$/ }).first().click()
  await page.locator('[role="menuitem"]', { hasText: 'Multímetro completo' }).first().click()
  await expect.poll(() => cumplido(page)).toBe(true)
  const globo = page.locator('.tutorial-globo')
  const b = (await globo.boundingBox())!
  await page.mouse.move(b.x + 40, b.y + b.height - 1)
  // Con la barra de avance saliendo y entrando, el alto alternaba 14 px: ahora queda fijo.
  const altos = new Set<number>()
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100)
    altos.add(Math.round((await globo.boundingBox())!.height))
  }
  expect(altos.size).toBe(1)
  await app.close()
})

test('capítulo 5, F con el lienzo limpio es un paso propio antes de volver a los paneles', async () => {
  const { app, page } = await abrir()
  await empezar(page, 'trucos')
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+Shift+L')
  await expect.poll(() => cumplido(page)).toBe(true)
  await page.locator('.tutorial-globo').getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.locator('.tutorial-cap').first()).toHaveText(/Paso 2 de \d+/)
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('f')
  await expect.poll(() => cumplido(page)).toBe(true)
  await app.close()
})
