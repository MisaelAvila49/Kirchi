import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { carpetaNueva, lanzar } from './lanzar'

/** Barra superior con la ventana real: lo que no se prueba sin Electron (plegado y pestaña recordados, pantalla completa, zoom de la página). */
test.describe.configure({ mode: 'serial' })

async function abrir(datos: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await lanzar({ datos })
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await page.waitForTimeout(600)
  return { app, page }
}
const ajustesEnDisco = (datos: string) => JSON.parse(readFileSync(join(datos, 'settings.json'), 'utf8'))

test('la cinta plegada y su pestaña se recuerdan al reabrir', async () => {
  const datos = carpetaNueva()
  let { app, page } = await abrir(datos)
  await page.getByRole('tab', { name: 'Vista', exact: true }).click()
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+F1')
  await expect.poll(() => ajustesEnDisco(datos).cinta).toEqual({ plegada: true, pestaña: 'vista' })
  await app.close()
  ;({ app, page } = await abrir(datos))
  await expect(page.getByRole('tab', { name: 'Vista', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('toolbar', { name: 'Vista', exact: true })).toBeHidden()
  const alto = await page.locator('header.barra').evaluate((h) => h.getBoundingClientRect().height)
  // Plegada quedan la fila del título (30) y la de pestañas (28).
  expect(alto).toBeLessThanOrEqual(60)
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+F1')
  await page.getByRole('tab', { name: 'Inicio', exact: true }).click()
  await expect.poll(() => ajustesEnDisco(datos).cinta).toEqual({ plegada: false, pestaña: 'inicio' })
  await app.close()
})

test('Vista › Ventana: pantalla completa y el tamaño de la interfaz actúan sobre la ventana, también con el teclado numérico', async () => {
  const { app, page } = await abrir(carpetaNueva())
  const factor = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())
  await page.getByRole('tab', { name: 'Vista', exact: true }).click()
  const vista = page.getByRole('toolbar', { name: 'Vista', exact: true })
  // «Interfaz − 100 % +» (dirección A): + va al paso siguiente del tamaño de la interfaz, 110 %; la cifra vuelve al 100 %.
  await vista.getByRole('button', { name: 'Acercar la página' }).click()
  await expect.poll(factor).toBeCloseTo(1.1)
  await expect(vista.getByRole('button', { name: '110 %, tamaño real de la página' })).toBeVisible()
  await vista.getByRole('button', { name: '110 %, tamaño real de la página' }).click()
  await expect.poll(factor).toBe(1)
  // Ctrl con + y 0 del teclado numérico (la interfaz las atiende si el acelerador no llega).
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+NumpadAdd')
  await expect.poll(factor).toBeCloseTo(1.1)
  await page.keyboard.press('Control+NumpadSubtract')
  await expect.poll(factor).toBe(1)
  await page.keyboard.press('Control+NumpadAdd')
  await page.keyboard.press('Control+Numpad0')
  await expect.poll(factor).toBe(1)
  await vista.getByRole('button', { name: 'Pantalla completa' }).click()
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true)
  await vista.getByRole('button', { name: 'Pantalla completa' }).click()
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false)
  await page.getByRole('tab', { name: 'Inicio', exact: true }).click()
  await app.close()
})

// Tres pestañas; el último grupo de Inicio dice qué hacer sin selección y la franja se abre con su pestaña.
test('tres pestañas: Inicio, Vista y Ayuda; el último grupo de Inicio pide elegir algo', async () => {
  const { app, page } = await abrir(carpetaNueva())
  await expect(page.getByRole('tablist', { name: 'Cinta' }).getByRole('tab')).toHaveText(['Inicio', 'Vista', 'Ayuda'])
  await expect(page.getByRole('toolbar', { name: 'Inicio', exact: true }).getByText('Elige algo en el lienzo.')).toBeVisible()
  await page.getByRole('tab', { name: 'Registro' }).click()
  await expect(page.locator('.instrumentos.abierta')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Registro' })).toHaveAttribute('aria-selected', 'true')
  await app.close()
})

test('Ctrl+K con la ventana real: «configuracion» y Enter abren Configuración', async () => {
  const { app, page } = await abrir(carpetaNueva())
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+k')
  await page.keyboard.type('configuracion')
  await expect(page.getByRole('option')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Configuración' })).toBeVisible()
  await page.keyboard.press('Escape')
  await app.close()
})
