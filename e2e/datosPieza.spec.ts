import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { fallasGraves } from './axe'
import { abrirPaneles, carpetaNueva, lanzar } from './lanzar'

/** «Datos de la pieza» del inspector sobre Electron: encapsulado, patillas, enlace de la hoja de datos y axe en los dos temas. Requiere ventana. */
test.describe.configure({ mode: 'serial' })

const HOJA = 'https://www.onsemi.com/pdf/datasheet/2n3904-d.pdf'
const DOC = { piezas: { q1: { id: 'q1', tipo: 'npn', ref: 'Q1', x: 0, y: 0, rot: 0, espejo: false, props: { modelo: '2N3904' } } }, cables: {}, etiquetas: {}, notas: {} }

const sonda = (page: Page, metodo: string, ...args: unknown[]): Promise<any> => page.evaluate(([m, a]) => (window as any).__kirchi[m](...a), [metodo, args] as [string, unknown[]])
async function clicMundo(page: Page, x: number, y: number) {
  const p = await sonda(page, 'aPantalla', x, y)
  await page.mouse.click(p.x, p.y)
  await page.waitForTimeout(250)
}

let app: ElectronApplication
let page: Page
test.beforeAll(async () => {
  app = await lanzar({ datos: carpetaNueva() })
  page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await abrirPaneles(page)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await page.waitForTimeout(600)
  await sonda(page, 'cargar', DOC)
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('f')
  await clicMundo(page, 0, 0)
})
test.afterAll(async () => {
  await app?.close()
})

test('la sección llega plegada, se abre y lee el TO-92 con sus tres patillas', async () => {
  const seccion = page.locator('aside.inspector details.seccion-datos')
  await expect(seccion.locator('summary')).toHaveText('Datos de la pieza')
  await expect(seccion).not.toHaveAttribute('open', '')
  await seccion.locator('summary').click()
  await expect(seccion.locator('dl')).toContainText('TO-92')
  await expect(seccion.locator('tbody tr')).toHaveCount(3)
  await expect(seccion.locator('tbody tr').first()).toContainText('1')
  // La fila «Conexiones» de cada pin lleva el número de su patilla.
  await expect(page.locator('aside.inspector')).toContainText('· 1')
})

test('«Abrir hoja de datos» pide la dirección de la fila y no abre un navegador', async () => {
  await page.getByRole('button', { name: 'Abrir hoja de datos' }).click()
  await expect.poll(() => app.evaluate(() => (globalThis as { __enlacesAbiertos?: string[] }).__enlacesAbiertos ?? [])).toEqual([HOJA])
})

test('el panel no desborda a lo ancho y axe no halla fallas graves en claro ni en oscuro', async () => {
  for (const tema of ['claro', 'oscuro']) {
    if (tema === 'oscuro') await page.getByRole('button', { name: /^Tema oscuro/ }).click()
    const sobra = await page.locator('aside.inspector').evaluate((el) => [...el.querySelectorAll('*')].filter((n) => n.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).length)
    expect(sobra, tema).toBe(0)
    expect(await fallasGraves(page), tema).toEqual([])
  }
})

test('el plegado recordado sobrevive a volver a seleccionar la pieza y ningún otro enlace se abrió', async () => {
  await sonda(page, 'cargar', DOC)
  await clicMundo(page, 0, 0)
  await expect(page.locator('aside.inspector details.seccion-datos')).toHaveAttribute('open', '')
  expect(await app.evaluate(() => (globalThis as { __enlacesAbiertos?: string[] }).__enlacesAbiertos ?? [])).toEqual([HOJA])
})
