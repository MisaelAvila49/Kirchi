import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { fallasGraves } from './axe'
import { lanzar } from './lanzar'

/** El diálogo de Configuración con la ventana real: las cinco pestañas con teclado, axe en claro, oscuro y contraste alto, y una captura de cada pestaña en los dos temas a 1366 × 768 y a la ventana mínima de 800 × 500, sin desplazamiento horizontal. Requiere ventana. */
test.describe.configure({ mode: 'serial' })

const PESTAÑAS = ['General', 'Apariencia', 'Simulación', 'Asistente', 'Atajos']
const TAMAÑOS = [
  { nombre: '1366x768', ancho: 1366, alto: 768 },
  { nombre: '800x500', ancho: 800, alto: 500 }
]

let app: ElectronApplication
let page: Page

const cambiarTamaño = (ancho: number, alto: number) =>
  app.evaluate(({ BrowserWindow }, [w, h]) => {
    const v = BrowserWindow.getAllWindows()[0]
    v.unmaximize()
    v.setContentSize(w, h)
  }, [ancho, alto] as const)

test.beforeAll(async () => {
  app = await lanzar()
  page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await cambiarTamaño(1366, 768)
  await page.waitForTimeout(500)
  await page.keyboard.press('Control+Comma')
  await expect(page.getByRole('dialog', { name: 'Configuración' })).toBeVisible()
})

test.afterAll(async () => {
  await app?.close().catch(() => {})
})

/** El tema se cambia desde la propia pestaña Apariencia: el botón de la cinta queda bajo el velo del diálogo. */
async function ponerTema(tema: 'claro' | 'oscuro'): Promise<void> {
  await pestaña('Apariencia').click()
  await page.getByRole('radio', { name: new RegExp('^' + tema, 'i') }).check()
  await expect(page.locator('html')).toHaveAttribute('data-tema', tema)
}

const pestaña = (nombre: string) => page.getByRole('tablist', { name: 'Secciones de Configuración' }).getByRole('tab', { name: nombre, exact: true })

test('las cinco pestañas se recorren con flechas, Inicio y Fin', async () => {
  await expect(page.getByRole('tablist', { name: 'Secciones de Configuración' }).getByRole('tab')).toHaveText(PESTAÑAS)
  await pestaña('General').focus()
  for (const siguiente of PESTAÑAS.slice(1)) {
    await page.keyboard.press('ArrowRight')
    await expect(pestaña(siguiente)).toHaveAttribute('aria-selected', 'true')
    await expect(pestaña(siguiente)).toBeFocused()
  }
  await page.keyboard.press('ArrowRight')
  await expect(pestaña('General')).toBeFocused()
  await page.keyboard.press('End')
  await expect(pestaña('Atajos')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(pestaña('General')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(pestaña('Atajos')).toHaveAttribute('aria-selected', 'true')
})

test('axe en cada pestaña, en claro, oscuro y contraste alto', async () => {
  const fallas: string[] = []
  for (const modo of ['claro', 'oscuro', 'contraste alto']) {
    if (modo === 'oscuro') await ponerTema('oscuro')
    await page.emulateMedia({ forcedColors: modo === 'contraste alto' ? 'active' : 'none' })
    for (const p of PESTAÑAS) {
      await pestaña(p).click()
      // Con colores forzados axe da falsos `color-contrast` (mide los de la hoja, no los del sistema): se separan.
      const f = (await fallasGraves(page)).filter((x) => modo !== 'contraste alto' || !x.startsWith('color-contrast'))
      fallas.push(...f.map((x) => `${modo} · ${p} · ${x}`))
    }
  }
  await page.emulateMedia({ forcedColors: 'none' })
  expect(fallas).toEqual([])
})

test('capturas de cada pestaña en los dos temas, a 1366 × 768 y 800 × 500, sin desplazamiento horizontal', async ({}, info) => {
  for (const t of TAMAÑOS) {
    await cambiarTamaño(t.ancho, t.alto)
    await page.waitForTimeout(400)
    for (const tema of ['oscuro', 'claro']) {
      await ponerTema(tema as 'claro' | 'oscuro')
      for (const p of PESTAÑAS) {
        await pestaña(p).click()
        const desborde = await page.getByRole('dialog', { name: 'Configuración' }).evaluate((d) => {
          const panel = d.querySelector<HTMLElement>('[role="tabpanel"]') ?? d
          return { dialogo: d.scrollWidth - d.clientWidth, panel: panel.scrollWidth - panel.clientWidth, pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth }
        })
        expect(desborde, `${t.nombre} · ${tema} · ${p}`).toEqual({ dialogo: 0, panel: 0, pagina: 0 })
        await page.screenshot({ path: info.outputPath(`config-${p}-${tema}-${t.nombre}.png`) })
      }
    }
  }
})
