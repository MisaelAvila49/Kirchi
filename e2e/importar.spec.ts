import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fallasGraves } from './axe'
import { verFranja } from './franja'
import { carpetaNueva, lanzar } from './lanzar'

/** Abrir un circuito de otro programa lo convierte en un documento nuevo sin guardar. El diálogo nativo se reemplaza desde el proceso principal. */

const FIXTURES = join(process.cwd(), 'src', 'renderer', 'src', 'importar', '__fixtures__')

const sonda = (page: Page, metodo: string, ...args: unknown[]): Promise<any> =>
  page.evaluate(([m, a]) => (window as any).__kirchi[m](...a), [metodo, args] as [string, unknown[]])

async function abrir(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await lanzar({ datos: carpetaNueva() })
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  return { app, page }
}

async function dialogoAbre(app: ElectronApplication, ruta: string): Promise<void> {
  await app.evaluate(({ dialog }, ruta) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [ruta] })) as typeof dialog.showOpenDialog
  }, ruta)
}

for (const [carpeta, archivo] of [['spice', 'divisor.cir'], ['ltspice', 'divisor.asc']] as const) {
  test(`abrir ${archivo} lo importa como documento nuevo sin guardar y lo anota en el Registro`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kirchi-importar-'))
    const ruta = join(dir, archivo)
    copyFileSync(join(FIXTURES, carpeta, archivo), ruta)
    const { app, page } = await abrir()
    await dialogoAbre(app, ruta)
    await page.locator('canvas.lienzo-gl').focus()
    await page.keyboard.press('Control+O')
    await expect.poll(async () => (await sonda(page, 'archivo')).nombre).toBe('divisor.kir')
    expect(await page.title()).toBe('divisor.kir * · Kirchi')
    const estado = await sonda(page, 'archivo')
    expect(estado.ruta).toBeNull()
    expect(estado.sinGuardar).toBe(true)
    expect(Object.keys((await sonda(page, 'doc')).piezas).length).toBeGreaterThan(0)
    // El informe sale en un diálogo; el Registro también lo anota.
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await verFranja(page, 'Registro')
    await expect(page.locator('.registro')).toContainText('Importado de')
    await app.close()
  })
}

/** Dos transistores aproximados, una caja gris y un análisis: las tres tarjetas del informe. */
const CIRCUITO_SPICE = `Etapa con dos aproximadas y una caja
Vcc vcc 0 DC 12
Vb b1 0 DC 0.7
Rc vcc c 2.2k
Re e 0 470
Rb b1 b 1k
Q1 c b e BC548
Q2 c2 c e2 BC548
Rc2 vcc c2 1k
Re2 e2 0 100
X1 c2 out vcc 0 LM13700
Rl out 0 10k
.model BC548 NPN(IS=6.7f BF=416 VAF=74 CJE=4.5p)
.tran 1u 1m
.end
`

const CAPTURAS = process.env.KIRCHI_CAPTURAS_INFORME

/** Abre la ventana de 1366 por 768 en el tema pedido e importa CIRCUITO_SPICE con el diálogo nativo reemplazado. */
async function importarEtapa(tema: 'claro' | 'oscuro'): Promise<{ app: ElectronApplication; page: Page }> {
  const datos = carpetaNueva()
  mkdirSync(datos, { recursive: true })
  writeFileSync(join(datos, 'settings.json'), JSON.stringify({ tema }))
  const app = await lanzar({ datos })
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await app.evaluate(({ BrowserWindow }) => {
    const v = BrowserWindow.getAllWindows()[0]
    v.unmaximize()
    v.setContentSize(1366, 768)
  })
  await page.waitForTimeout(400)
  const ruta = join(mkdtempSync(join(tmpdir(), 'kirchi-importar-')), 'etapa.cir')
  writeFileSync(ruta, CIRCUITO_SPICE)
  await dialogoAbre(app, ruta)
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+O')
  return { app, page }
}

for (const tema of ['claro', 'oscuro'] as const) {
  test(`el informe de importación en pantalla, tema ${tema}: diálogo, tarjetas que resaltan, Proyecto, ocultar y deshacer`, async () => {
    const { app, page } = await importarEtapa(tema)
    const dialogo = page.getByRole('dialog', { name: 'Importado de SPICE' })
    await expect(dialogo).toBeVisible()
    await expect(dialogo).toContainText('etapa.cir: 10 de 11 piezas convertidas. El original no se modificó.')
    const tarjetas = dialogo.locator('button.tarjeta-informe')
    await expect(tarjetas).toHaveCount(3)
    await expect(tarjetas.nth(0)).toContainText('2 con modelo aproximado')
    await expect(tarjetas.nth(1)).toContainText('1 sin equivalencia')
    await expect(tarjetas.nth(0)).toContainText('Q1 BC548 → 2N2222')
    await expect(tarjetas.nth(1)).toContainText('X1 LM13700 queda como caja gris')
    await expect(tarjetas.nth(2)).toContainText('Transitorio de 0 a 1 ms')
    await expect(page.getByRole('button', { name: 'Entendido' })).toBeFocused()
    expect(await sonda(page, 'resaltado')).toBeNull()

    // Pasar el ratón o enfocar una tarjeta resalta sus piezas; salir lo quita.
    await tarjetas.nth(0).hover()
    await expect.poll(() => sonda(page, 'resaltado')).toMatchObject({ tono: 'ocre' })
    expect((await sonda(page, 'resaltado')).piezas).toHaveLength(2)
    await page.mouse.move(5, 5)
    await expect.poll(() => sonda(page, 'resaltado')).toBeNull()
    expect(await fallasGraves(page), `diálogo en ${tema}`).toEqual([])
    if (CAPTURAS) {
      await tarjetas.nth(0).hover()
      await page.waitForTimeout(150)
      await page.screenshot({ path: join(CAPTURAS, `dialogo-${tema}.png`) })
      await page.mouse.move(5, 5)
    }

    await page.getByRole('button', { name: 'Entendido' }).click()
    await expect(dialogo).toHaveCount(0)
    const seccion = page.locator('.panel-proyecto .informe-importacion')
    await expect(seccion).toBeVisible()
    await expect(seccion.locator('h3')).toHaveText('Importado de SPICE')
    const cartas = seccion.locator('button.tarjeta-informe')
    await expect(cartas).toHaveCount(3)

    // Tab recorre las tarjetas y enfocar resalta como el ratón.
    await cartas.nth(0).focus()
    await expect.poll(() => sonda(page, 'resaltado')).toMatchObject({ tono: 'ocre' })
    await page.keyboard.press('Tab')
    await expect(cartas.nth(1)).toBeFocused()
    await expect.poll(() => sonda(page, 'resaltado')).toMatchObject({ tono: 'rojo' })
    await cartas.nth(0).hover()
    await expect.poll(() => sonda(page, 'resaltado')).toMatchObject({ tono: 'ocre' })
    if (CAPTURAS) {
      await page.waitForTimeout(150)
      await page.screenshot({ path: join(CAPTURAS, `proyecto-${tema}.png`) })
    }
    expect(await fallasGraves(page), `Proyecto en ${tema}`).toEqual([])

    // Un clic encuadra las piezas de la tarjeta: la vista se mueve.
    const antes = await sonda(page, 'aPantalla', 0, 0)
    await cartas.nth(1).click()
    await expect.poll(async () => JSON.stringify(await sonda(page, 'aPantalla', 0, 0))).not.toBe(JSON.stringify(antes))

    // Ocultar el informe lo quita del documento y Ctrl+Z lo regresa.
    await seccion.getByRole('button', { name: 'Ocultar el informe' }).click()
    await expect(seccion).toHaveCount(0)
    expect((await sonda(page, 'doc')).importacion).toBeUndefined()
    expect(await sonda(page, 'resaltado')).toBeNull()
    await page.locator('canvas.lienzo-gl').focus()
    await page.keyboard.press('Control+Z')
    await expect(page.locator('.panel-proyecto .informe-importacion')).toBeVisible()
    expect((await sonda(page, 'doc')).importacion.origen.formato).toBe('spice')
    await app.close()
  })
}

test('Esc cierra el diálogo de importación y abre Proyecto con el informe', async () => {
  const { app, page } = await importarEtapa('claro')
  await expect(page.getByRole('dialog', { name: 'Importado de SPICE' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.panel-proyecto .informe-importacion')).toBeVisible()
  await app.close()
})

test('«Ver las piezas marcadas» cierra el diálogo y encuadra lo marcado', async () => {
  const { app, page } = await importarEtapa('claro')
  await page.getByRole('button', { name: 'Ver las piezas marcadas' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.panel-proyecto .informe-importacion')).toBeVisible()
  await app.close()
})

test('«Reemplazar por…» cambia la caja gris por una pieza de Kirchi, baja la tarjeta roja y Ctrl+Z la regresa', async () => {
  const { app, page } = await importarEtapa('claro')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const caja = Object.values((await sonda(page, 'doc')).piezas as Record<string, any>).find((p) => p.tipo === 'sin-equivalencia')
  expect(caja).toBeDefined()
  const c = await sonda(page, 'aPantalla', caja.x, caja.y)
  await page.mouse.click(c.x, c.y, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Reemplazar por…' }).click()
  const buscador = page.locator('.buscador-campo')
  await buscador.fill('amp op')
  await page.keyboard.press('Enter')
  // El LM13700 tiene más pines que un amplificador operacional: se pregunta antes de cambiar.
  const pregunta = page.getByRole('dialog', { name: '¿Reemplazar la pieza?' })
  await expect(pregunta).toContainText('tenía 4 pines')
  if (CAPTURAS) await page.screenshot({ path: join(CAPTURAS, 'reemplazar-pregunta.png') })
  await pregunta.getByRole('button', { name: /^Reemplazar por/ }).click()
  await expect.poll(async () => Object.values((await sonda(page, 'doc')).piezas as Record<string, any>).filter((p) => p.tipo === 'sin-equivalencia').length).toBe(0)
  const tarjeta = page.locator('.panel-proyecto .informe-importacion button.tarjeta-informe[data-clase="sinEquivalencia"]')
  await expect(tarjeta).toContainText('Todas reemplazadas')
  if (CAPTURAS) await page.screenshot({ path: join(CAPTURAS, 'reemplazar-hecho.png') })
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+Z')
  await expect(tarjeta).toContainText('1 sin equivalencia')
  expect(Object.values((await sonda(page, 'doc')).piezas as Record<string, any>).filter((p) => p.tipo === 'sin-equivalencia')).toHaveLength(1)
  await app.close()
})
