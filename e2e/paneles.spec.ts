import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { strFromU8, unzipSync } from 'fflate'
import { amplificadorInversor } from '../src/renderer/src/prueba/ejemplos'
import { fallasGraves } from './axe'
import { verInspector } from './franja'
import { carpetaNueva, lanzar } from './lanzar'

/** Hoja de atajos, paneles, figuras y tamaño de la interfaz con la ventana real: zoom y ajuste guardado, guardar y abrir el .kir por el proceso principal y la vista previa del ejemplo. Requiere ventana. */
test.describe.configure({ mode: 'serial' })

async function abrir(datos = carpetaNueva()): Promise<{ app: ElectronApplication; page: Page; datos: string }> {
  const app = await lanzar({ datos })
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await page.waitForTimeout(600)
  return { app, page, datos }
}
const sonda = (page: Page, m: string, ...a: unknown[]) => page.evaluate(([m, a]) => (window as any).__kirchi[m as string](...(a as unknown[])), [m, a] as const)
const factor = (app: ElectronApplication) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())
const ajustesEnDisco = (datos: string) => JSON.parse(readFileSync(join(datos, 'settings.json'), 'utf8'))

test('la hoja A2: once teclas solas, filtros, búsqueda y «Cambiar los atajos»; axe en los dos temas', async () => {
  const { app, page } = await abrir()
  for (const tema of ['claro', 'oscuro']) {
    if (tema === 'oscuro') await page.getByRole('button', { name: /^Tema oscuro/ }).first().click()
    await page.locator('canvas.lienzo-gl').focus()
    await page.keyboard.press('?')
    const hoja = page.locator('.hoja-a2')
    await expect(hoja.locator('.teclas-solas li')).toHaveCount(11)
    await hoja.getByRole('button', { name: /^Simulación/ }).click()
    // Con Avanzar, la velocidad, Corriente, Animaciones y Sonido son doce; con Grabar y Detener la grabación son catorce, y con Retroceder (Shift+F6) quince.
    await expect(hoja.locator('.hoja-lista .fila-atajo')).toHaveCount(15)
    await hoja.getByRole('button', { name: /^Todas/ }).click()
    await hoja.getByRole('searchbox').fill('ctrl+o')
    await expect(hoja.locator('.hoja-lista .fila-atajo')).toHaveCount(1)
    expect(await fallasGraves(page)).toEqual([])
    await hoja.getByRole('button', { name: 'Cambiar los atajos' }).click()
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest('.config-atajos') !== null)).toBe(true)
    await page.keyboard.press('Escape')
  }
  await app.close()
})

test('figuras: dibujar desde la cinta, estilo en el inspector, guardar en formato 4 y volver a abrir; atenuadas al simular', async () => {
  const { app, page, datos } = await abrir()
  const ruta = join(datos, 'figuras.kir')
  await app.evaluate(({ dialog }, ruta) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: ruta })) as unknown as typeof dialog.showSaveDialog
  }, ruta)
  await sonda(page, 'cargar', amplificadorInversor())
  await page.locator('.boton-cinta[data-comando="figura"]').click()
  await page.getByRole('menuitem', { name: 'Rectángulo' }).click()
  const a = (await sonda(page, 'aPantalla', 80, 30)) as { x: number; y: number }
  const b = (await sonda(page, 'aPantalla', 96, 40)) as { x: number; y: number }
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 5 })
  await page.mouse.up()
  const doc = (await sonda(page, 'doc')) as { figuras: Record<string, { x1: number; y1: number; x2: number; y2: number; tinta?: string }> }
  const nueva = Object.entries(doc.figuras).find(([, f]) => f.x1 === 80 && f.y1 === 30)
  expect(nueva?.[1]).toMatchObject({ x2: 96, y2: 40 })
  // Los paneles abren plegados: el inspector se abre para elegir la tinta.
  await verInspector(page)
  await page.getByRole('button', { name: 'Rojo', exact: true }).click()
  expect(((await sonda(page, 'doc')) as typeof doc).figuras[nueva![0]].tinta).toBe('rojo')
  // 0 cuadros en 1 s de reposo con figuras (después de que termina el pulso de confirmación del cambio de tinta).
  await page.mouse.move(5, 300)
  await page.waitForTimeout(500)
  const c0 = await sonda(page, 'cuadros')
  await page.waitForTimeout(1000)
  expect(await sonda(page, 'cuadros')).toBe(c0)
  // Guardar: el proceso principal escribe un .kir de formato 4 con las seis figuras.
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+s')
  await expect.poll(() => (sonda(page, 'archivo') as Promise<{ sinGuardar: boolean }>).then((x) => x.sinGuardar)).toBe(false)
  const zip = unzipSync(readFileSync(ruta))
  expect(JSON.parse(strFromU8(zip['manifest.json'])).formato).toBe(4)
  expect(Object.keys(JSON.parse(strFromU8(zip['circuito.json'])).figuras)).toHaveLength(6)
  // Simular: atenuadas y Vout en −5 V; al detener vuelven.
  await page.keyboard.press('F5')
  await expect.poll(() => sonda(page, 'simulacion').then((s: any) => s.fase)).toBe('corriendo')
  await page.waitForTimeout(1500)
  expect(await sonda(page, 'figurasAtenuadas')).toBe(true)
  expect(Object.values(((await sonda(page, 'simulacion')) as any).redes).some((v) => Math.abs((v as number) + 5) < 0.1)).toBe(true)
  await page.keyboard.press('Shift+F5')
  await expect.poll(() => sonda(page, 'figurasAtenuadas')).toBe(false)
  await app.close()
  // Volver a abrir el archivo guardado (por la línea de órdenes, como el doble clic del explorador).
  const otra = await lanzar({ datos: carpetaNueva(), args: [ruta] })
  const p2 = await otra.firstWindow()
  await p2.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await expect.poll(() => sonda(p2, 'doc').then((d: any) => Object.keys(d.figuras ?? {}).length)).toBe(6)
  await otra.close()
})

test('Proyecto y Mediciones con la vista previa del ejemplo; axe en los dos temas', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', amplificadorInversor())
  await page.getByRole('button', { name: 'Proyecto' }).first().click()
  await expect(page.locator('.archivo-ficha')).toBeVisible()
  await expect(page.locator('.panel-proyecto .fila-pieza')).toHaveCount(7)
  await expect(page.locator('.riel-ficha')).toHaveCount(3)
  expect(await fallasGraves(page)).toEqual([])
  await page.getByRole('button', { name: 'Mediciones' }).first().click()
  await page.locator('.vacio-med').getByRole('button', { name: 'Simular' }).click()
  await expect(page.locator('.estado-med')).toBeVisible({ timeout: 8000 })
  await expect(page.locator('#panel-derecho')).toContainText('−5.00 V')
  expect(await fallasGraves(page)).toEqual([])
  await page.keyboard.press('Shift+F5')
  await page.getByRole('button', { name: /^Tema oscuro/ }).first().click()
  await page.getByRole('button', { name: 'Proyecto' }).first().click()
  expect(await fallasGraves(page)).toEqual([])
  await app.close()
})

test('tamaño de la interfaz: el ajuste, las teclas del menú y la cinta mueven el mismo valor, que se recuerda al reabrir', async () => {
  const { app, page, datos } = await abrir()
  expect(await factor(app)).toBe(1)
  await page.keyboard.press('Control+,')
  await page.getByRole('tab', { name: 'Apariencia' }).click()
  await page.locator('.cfg-seg label').filter({ hasText: '125 %' }).click()
  await expect(page.getByRole('radio', { name: '125 %' })).toBeChecked()
  await expect.poll(() => factor(app)).toBeCloseTo(1.25)
  await expect.poll(() => ajustesEnDisco(datos).tamañoInterfaz).toBe(125)
  // La tecla Ctrl++ del menú va al paso siguiente y Configuración muestra el vigente.
  await app.evaluate(({ BrowserWindow, Menu }) => {
    const w = BrowserWindow.getAllWindows()[0]
    Menu.getApplicationMenu()!.getMenuItemById('acercar')!.click(undefined, w, w.webContents)
  })
  await expect.poll(() => factor(app)).toBeCloseTo(1.5)
  await expect(page.getByRole('radio', { name: '150 %' })).toBeChecked()
  await page.keyboard.press('Escape')
  await app.close()
  const otra = await abrir(datos)
  expect(await factor(otra.app)).toBeCloseTo(1.5)
  await otra.app.evaluate(({ BrowserWindow, Menu }) => {
    const w = BrowserWindow.getAllWindows()[0]
    Menu.getApplicationMenu()!.getMenuItemById('tamaño-real')!.click(undefined, w, w.webContents)
  })
  await expect.poll(() => factor(otra.app)).toBe(1)
  await expect.poll(() => ajustesEnDisco(datos).tamañoInterfaz).toBe(100)
  await otra.app.close()
})
