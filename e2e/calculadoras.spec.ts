import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { fallasGraves } from './axe'
import { carpetaNueva, lanzar } from './lanzar'

/** Calculadoras sobre Electron: generar el divisor, colocarlo, simularlo (4.89 V con E12), deshacer de una vez y axe en los dos temas. Requiere ventana. */
test.describe.configure({ mode: 'serial' })

async function abrir(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await lanzar({ datos: carpetaNueva() })
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await page.waitForTimeout(600)
  return { app, page }
}
const sonda = (page: Page, metodo: string, ...args: unknown[]): Promise<any> => page.evaluate(([m, a]) => (window as any).__kirchi[m](...a), [metodo, args] as [string, unknown[]])

test('generar el divisor, colocarlo, simularlo y deshacer; axe de la ficha en los dos temas', async () => {
  const { app, page } = await abrir()

  // El riel trae el icono y el panel abre con la lista de las seis calculadoras.
  await page.locator('.riel-boton[data-panel="calculadoras"]').click()
  await expect(page.locator('aside.lateral:not(.derecho) h2')).toHaveText('Calculadoras')
  await expect(page.locator('.calc-eleccion')).toHaveCount(6)
  await expect(page.locator('.calc-eleccion[aria-pressed="true"]')).toHaveText('Divisor')

  // Con los valores de inicio (9 V a 5 V con 10 kΩ en total, E12) salen 4.7 kΩ y 5.6 kΩ y 4.89 V.
  await expect(page.locator('.calc-tabla tbody tr', { hasText: 'R1' }).first()).toContainText('4.7')
  await expect(page.locator('.calc-reales tr', { hasText: 'Vout real' })).toContainText('4.89')

  // Generar circuito: queda en la sombra de colocar y un clic lo pone, con un solo paso de deshacer.
  await page.locator('[data-accion="generar"]').click()
  await expect.poll(() => sonda(page, 'herramienta')).toBe('colocar')
  const c = await sonda(page, 'aPantalla', 0, 0)
  await page.mouse.move(c.x, c.y)
  await page.mouse.click(c.x, c.y)
  await expect.poll(async () => Object.keys((await sonda(page, 'doc')).piezas).length).toBe(4)

  // Simulado, alguna red queda en el Vout real de la ficha.
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('corriendo')
  await expect
    .poll(async () => Object.values((await sonda(page, 'simulacion')).redes as Record<string, number>).some((v) => Math.abs(v - 4.89) < 0.02))
    .toBe(true)
  await page.keyboard.press('Shift+F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('detenida')

  await page.keyboard.press('Control+z')
  await expect.poll(async () => Object.keys((await sonda(page, 'doc')).piezas).length).toBe(0)

  for (const tema of ['claro', 'oscuro']) {
    if (tema === 'oscuro') await page.getByRole('button', { name: /^Tema oscuro/ }).first().click()
    for (const id of ['divisor', 'led', 'filtro', 'astable', 'monoestable', 'amplificador']) {
      await page.locator(`[data-calculadora="${id}"]`).click()
      expect(await fallasGraves(page), `${id} en ${tema}`).toEqual([])
    }
  }

  // Ctrl+K encuentra la calculadora y lleva el foco a su primer campo.
  await page.keyboard.press('Control+k')
  await page.keyboard.type('calculadora filtros')
  await page.keyboard.press('Enter')
  await expect(page.locator('.calc-eleccion[aria-pressed="true"]')).toHaveText('Filtros')
  await app.close()
})
