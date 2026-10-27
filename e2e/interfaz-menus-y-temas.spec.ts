import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fallasGraves } from './axe'
import { abrirPaneles, carpetaNueva, lanzar } from './lanzar'

let app: ElectronApplication
let page: Page
/** Carpeta de datos de esta corrida: la reapertura del final lee los ajustes que dejaron las pruebas. */
const datos = carpetaNueva()

test.describe.configure({ mode: 'serial' })

const R = (id: string, ref: string, x: number, y = 0) => ({ id, tipo: 'resistencia', ref, x, y, rot: 0, espejo: false, props: {} })
/** R1 (a) en el origen y R2 (b) en (20, 0), unidas por el cable w de (4, 0) a (16, 0). */
const DOS = { piezas: { a: R('a', 'R1', 0), b: R('b', 'R2', 20) }, cables: { w: { id: 'w', puntos: [{ x: 4, y: 0 }, { x: 16, y: 0 }] } }, etiquetas: {}, notas: {} }

const sonda = (metodo: string, ...args: unknown[]): Promise<any> =>
  page.evaluate(([m, a]) => (window as any).__kirchi[m](...a), [metodo, args] as [string, unknown[]])
const aPantalla = (x: number, y: number): Promise<{ x: number; y: number }> => sonda('aPantalla', x, y)
const doc = (): Promise<any> => sonda('doc')
const ajustesEnDisco = () => JSON.parse(readFileSync(join(datos, 'settings.json'), 'utf8'))

async function abrir(conPaneles = true): Promise<void> {
  app = await lanzar({ datos })
  page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  if (conPaneles) await abrirPaneles(page)
}

test('sin --pruebas no hay sonda; la primera vez abre en claro', async () => {
  const sin = await lanzar({ pruebas: false })
  const p = await sin.firstWindow()
  await p.waitForSelector('canvas.lienzo-gl')
  expect(await p.evaluate(() => typeof (window as any).__kirchi)).toBe('undefined')
  expect(await p.evaluate(() => document.documentElement.dataset.tema)).toBe('claro')
  await sin.close()
})

test.beforeAll(() => abrir())
test.afterAll(async () => {
  await app?.close()
})

test('la ventana abre en claro, con los paneles y la librería de 102 piezas', async () => {
  expect(await page.evaluate(() => document.documentElement.dataset.tema)).toBe('claro')
  await expect(page.locator('.lateral .panel-cabeza')).toContainText('102 piezas')
  await expect(page.locator('aside.inspector h2')).toHaveText('Sin selección')
})

test('el menú propio da zoom de página y pantalla completa, sin recargar ni cerrar con el teclado', async () => {
  const clic = (id: string) =>
    app.evaluate(({ BrowserWindow, Menu }, id) => {
      const w = BrowserWindow.getAllWindows()[0]
      Menu.getApplicationMenu()!.getMenuItemById(id)!.click(undefined, w, w.webContents)
    }, id)
  const factor = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())
  await clic('acercar')
  await expect.poll(factor).toBeGreaterThan(1)
  await clic('tamaño-real')
  await expect.poll(factor).toBe(1)
  const roles = await app.evaluate(({ Menu }) => {
    const todos = (m: Electron.Menu): string[] => m.items.flatMap((i) => [String(i.role ?? ''), ...(i.submenu ? todos(i.submenu) : [])])
    return todos(Menu.getApplicationMenu()!)
  })
  for (const r of ['reload', 'forcereload', 'close', 'toggledevtools']) expect(roles.map((x) => x.toLowerCase())).not.toContain(r)
})

test('clic derecho en una pieza abre su menú accesible; Girar 90° la gira', async () => {
  await sonda('cargar', DOS)
  const r1 = await aPantalla(0, 0.5)
  await page.mouse.click(r1.x, r1.y, { button: 'right' })
  const menu = page.getByRole('menu')
  await expect(menu).toHaveAttribute('aria-label', 'R1 · Resistencia 1 kΩ')
  await expect(page.locator('[role=menuitem]').first()).toBeFocused()
  // Editar e Inspector, y luego Cortar, Copiar, Pegar y Duplicar, van antes que Girar.
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Girar 90° a la derecha' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(menu).toHaveCount(0)
  expect((await doc()).piezas.a.rot).toBe(90)
  await page.keyboard.press('Control+z')
})

test('el doble clic derecho sigue borrando aunque el primero abra el menú, y lo cierra', async () => {
  await sonda('cargar', DOS)
  await page.waitForTimeout(450)
  const r2 = await aPantalla(20, 0.5)
  await page.mouse.click(r2.x, r2.y, { button: 'right' })
  await page.mouse.click(r2.x, r2.y, { button: 'right' })
  await expect(page.getByRole('menu')).toHaveCount(0)
  expect(Object.keys((await doc()).piezas)).toEqual(['a'])
})

test('el menú del vacío coloca una tierra donde se hizo clic derecho y nunca sale de la ventana', async () => {
  await sonda('cargar', DOS)
  await page.waitForTimeout(450)
  const v = await aPantalla(10, 6)
  await page.mouse.click(v.x, v.y, { button: 'right' })
  await page.getByRole('menuitem', { name: /^Tierra/ }).click()
  expect(await sonda('herramienta')).toBe('colocar')
  await page.mouse.click(v.x, v.y)
  expect(Object.values((await doc()).piezas).find((p: any) => p.tipo === 'tierra')).toMatchObject({ x: 10, y: 6 })
  const lz = (await page.locator('canvas.lienzo-gl').boundingBox())!
  await page.waitForTimeout(450)
  await page.mouse.click(lz.x + lz.width - 220, lz.y + lz.height - 8, { button: 'right' })
  const m = (await page.locator('.menu').boundingBox())!
  const vista = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  expect(m.x).toBeGreaterThanOrEqual(8)
  expect(m.y + m.height).toBeLessThanOrEqual(vista.h - 8)
  expect(m.x + m.width).toBeLessThanOrEqual(vista.w - 8)
  await page.keyboard.press('Escape')
})

test('Inicio › Archivo trae Guardar, Nuevo, Abrir, Guardar como, Recientes y Exportar; sin recientes, Recientes está deshabilitado con su razón', async () => {
  const archivo = page.getByRole('toolbar', { name: 'Inicio', exact: true }).getByRole('group', { name: 'Archivo' })
  await expect(archivo.getByRole('button')).toHaveText(['Guardar', 'Nuevo', 'Abrir…', 'Guardar como…', 'Recientes', 'Exportar', 'Plantilla…'])
  await expect(archivo.getByRole('button', { name: 'Guardar', exact: true })).not.toHaveAttribute('aria-disabled', 'true')
  const recientes = archivo.getByRole('button', { name: 'Recientes' })
  await expect(recientes).toHaveAttribute('aria-disabled', 'true')
  await expect(recientes).toHaveAccessibleDescription('Todavía no hay archivos recientes.')
  await page.getByRole('toolbar', { name: 'Ventana' }).getByRole('button', { name: 'Configuración' }).click()
  await expect(page.getByRole('dialog', { name: 'Configuración' })).toBeVisible()
  await page.keyboard.press('Escape')
})

test('arrastrar una resistencia de la Librería la coloca donde se suelta', async () => {
  await sonda('cargar', DOS)
  const item = (await page.getByRole('button', { name: 'Resistencia', exact: true }).boundingBox())!
  const destino = await aPantalla(10, 6)
  await page.mouse.move(item.x + item.width / 2, item.y + item.height / 2)
  await page.mouse.down()
  await page.mouse.move(destino.x - 80, destino.y, { steps: 6 })
  await page.mouse.move(destino.x, destino.y, { steps: 6 })
  await page.mouse.up()
  expect(Object.values((await doc()).piezas).find((p: any) => p.ref === 'R3')).toMatchObject({ x: 10, y: 6 })
  expect(await sonda('herramienta')).toBe('seleccionar')
  await expect(page.locator('.recientes')).toHaveCount(0)
})

test('Proyecto: clic en una pieza la selecciona y la centra; los avisos ya no están en el panel', async () => {
  await page.getByRole('button', { name: 'Proyecto', exact: true }).click()
  await page.getByRole('button', { name: /^R3 / }).click()
  await expect(page.getByRole('button', { name: /^R3 / })).toHaveAttribute('aria-current', 'true')
  const lz = (await page.locator('canvas.lienzo-gl').boundingBox())!
  const c = await aPantalla(10, 6)
  expect(Math.abs(c.x - (lz.x + lz.width / 2))).toBeLessThan(2)
  expect(Math.abs(c.y - (lz.y + lz.height / 2))).toBeLessThan(2)
  // Los avisos viven en el inspector («Listo para simular») y en el Registro, no en el panel Proyecto.
  await expect(page.locator('.panel-proyecto')).not.toContainText('Avisos')
  await expect(page.locator('.panel-proyecto')).not.toContainText('Falta una tierra.')
  await page.locator('.riel.der .riel-boton[data-panel="inspector"]').click()
})

test('el inspector valida el valor y gira con las mismas reglas que R', async () => {
  await sonda('cargar', DOS)
  const r2 = await aPantalla(20, 0.5)
  await page.mouse.click(r2.x, r2.y)
  const insp = page.locator('aside.inspector')
  // El título es el nombre de la pieza; su referencia va arriba a la derecha, en un recuadro editable.
  await expect(insp.locator('h2')).toHaveText('Resistencia')
  await expect(insp.getByLabel('Referencia')).toHaveValue('R2')
  const valor = insp.getByRole('textbox', { name: 'Valor', exact: true })
  await valor.fill('2 F')
  await valor.press('Enter')
  await expect(insp.locator('.campo-error', { hasText: 'Se esperaba' })).toHaveText('Se esperaba un valor en Ω.')
  await valor.fill('4k7')
  await valor.press('Enter')
  // El campo normaliza lo escrito (valores con unidad): «4k7» se guarda como 4.7k.
  expect((await doc()).piezas.b.props.valor).toBe('4.7k')
  await insp.getByRole('button', { name: '90°' }).click()
  expect((await doc()).piezas.b).toMatchObject({ rot: 90, espejo: false })
  const con = await sonda('conexiones')
  expect(con.redDePin['a:2']).toBe(con.redDePin['b:1'])
})

test('Vista › Zoom tiene Alejar, Acercar y un campo que acepta «150» y rechaza texto; la barra de estado trae − y +', async () => {
  await page.getByRole('tab', { name: 'Vista', exact: true }).click()
  const vista = page.getByRole('toolbar', { name: 'Vista', exact: true })
  const campo = vista.getByRole('textbox', { name: 'Zoom en porcentaje' })
  const antes = parseFloat((await campo.inputValue()).replace(',', '.'))
  await vista.getByRole('button', { name: 'Acercar', exact: true }).click()
  await expect.poll(async () => parseFloat((await campo.inputValue()).replace(',', '.'))).toBeGreaterThan(antes)
  await campo.fill('150')
  await campo.press('Enter')
  await expect(campo).toHaveValue('150 %')
  await vista.getByRole('button', { name: 'Alejar', exact: true }).click()
  await expect.poll(async () => parseFloat(await campo.inputValue())).toBeLessThan(150)
  await campo.fill('abc')
  await campo.press('Enter')
  await expect(campo).toHaveAttribute('aria-invalid', 'true')
  await campo.press('Escape')
  const estado = page.locator('.estado-barra')
  const enEstado = async () => Number((await estado.textContent())!.match(/Zoom (\d+) %/)![1])
  const z0 = await enEstado()
  await estado.getByRole('button', { name: 'Acercar' }).click()
  await expect.poll(enEstado).toBeGreaterThan(z0)
  await estado.getByRole('button', { name: 'Alejar' }).click()
  await expect.poll(enEstado).toBe(z0)
  await page.getByRole('tab', { name: 'Inicio', exact: true }).click()
})

test('Ctrl+D duplica la selección en el cursor', async () => {
  await sonda('cargar', DOS)
  const r1 = await aPantalla(0, 0.5)
  await page.mouse.click(r1.x, r1.y)
  const destino = await aPantalla(10, 10)
  await page.mouse.move(destino.x, destino.y, { steps: 4 })
  await page.keyboard.press('Control+d')
  const copia = Object.values((await doc()).piezas).find((p: any) => p.ref === 'R3') as any
  expect(copia).toBeTruthy()
  expect(Math.abs(copia.x - 10)).toBeLessThanOrEqual(3)
  expect(Math.abs(copia.y - 10)).toBeLessThanOrEqual(3)
  await page.keyboard.press('Control+z')
})

/** Estados de la interfaz que axe revisa en cada tema: librería, inspector, menús, Proyecto, atajos, Configuración, lienzo limpio, pestañas, cinta plegada, buscador de comandos y un grupo plegado por falta de ancho. */
async function axeEnTodosLosEstados(): Promise<string[]> {
  const fallas: string[] = []
  const revisar = async (estado: string) => fallas.push(...(await fallasGraves(page)).map((f) => `${estado} · ${f}`))
  await sonda('cargar', DOS)
  await revisar('librería')
  const r2 = await aPantalla(20, 0.5)
  await page.mouse.click(r2.x, r2.y)
  await revisar('inspector con pieza')
  await page.waitForTimeout(450)
  await page.mouse.click(r2.x, r2.y, { button: 'right' })
  await revisar('menú del clic derecho')
  await page.keyboard.press('Escape')
  await page.getByRole('toolbar', { name: 'Inicio', exact: true }).getByRole('button', { name: 'Exportar', exact: true }).click()
  await revisar('diálogo Exportar')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Proyecto', exact: true }).click()
  await page.getByRole('tab', { name: /Registro/ }).click()
  await revisar('Proyecto y Registro')
  await page.getByRole('tab', { name: /Registro/ }).click()
  await page.locator('.riel.der .riel-boton[data-panel="inspector"]').click()
  await page.getByRole('button', { name: /Atajos/ }).click()
  await revisar('hoja de atajos')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+Comma')
  await revisar('Configuración')
  await page.keyboard.press('Escape')
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+Backslash')
  await revisar('lienzo limpio')
  await page.keyboard.press('Control+Backslash')
  for (const t of ['Vista', 'Ayuda']) {
    await page.getByRole('tab', { name: t, exact: true }).click()
    await revisar(`pestaña ${t}`)
  }
  await page.getByRole('tab', { name: 'Inicio', exact: true }).click()
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+F1')
  await revisar('cinta plegada')
  await page.getByRole('tab', { name: 'Inicio', exact: true }).click()
  await revisar('cinta abierta encima del lienzo')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+F1')
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+k')
  await page.keyboard.type('gir')
  await revisar('buscador de comandos')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  // Un grupo plegado: la ventana a 800 × 768 pliega algún grupo; luego vuelve a como estaba (maximizada o con su tamaño, que
  // aquí no es la maximizada: sin devolverle el tamaño, la segunda vuelta de axe encontraría Archivo plegado).
  const { maximizada, bordes } = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    return { maximizada: w.isMaximized(), bordes: w.getBounds() }
  })
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.unmaximize()
    w.setSize(800, 768)
  })
  await page.waitForTimeout(500)
  // Los grupos se pliegan por prioridad (Simular primero, Archivo el último), así que se abre el primero que esté plegado.
  await page.locator('.grupo .boton-grupo').first().click()
  await revisar('grupo plegado abierto')
  await page.keyboard.press('Escape')
  await app.evaluate(({ BrowserWindow }, { m, b }) => {
    const w = BrowserWindow.getAllWindows()[0]
    if (m) w.maximize()
    else w.setBounds(b)
  }, { m: maximizada, b: bordes })
  await page.waitForTimeout(500)
  await page.mouse.click(r2.x + 200, r2.y + 100)
  return fallas
}

test('axe sin fallas graves ni críticas en claro, con menú, diálogos y paneles', async () => {
  await sonda('cargar', DOS)
  expect(await fallasGraves(page)).toEqual([])
  const r1 = await aPantalla(0, 0.5)
  await page.waitForTimeout(450)
  await page.mouse.click(r1.x, r1.y, { button: 'right' })
  expect(await fallasGraves(page)).toEqual([])
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /Atajos/ }).click()
  expect(await fallasGraves(page)).toEqual([])
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Proyecto', exact: true }).click()
  await page.getByRole('tab', { name: /Registro/ }).click()
  expect(await fallasGraves(page)).toEqual([])
  await page.getByRole('tab', { name: /Registro/ }).click()
  await page.locator('.riel.der .riel-boton[data-panel="inspector"]').click()
})

test('axe en claro: los ocho estados', async () => {
  expect(await axeEnTodosLosEstados()).toEqual([])
})

test('el tema oscuro se elige con su botón, se guarda y pasa axe', async () => {
  await page.getByRole('button', { name: /Tema oscuro/ }).click()
  expect(await page.evaluate(() => document.documentElement.dataset.tema)).toBe('oscuro')
  await expect(page.getByRole('button', { name: /Tema oscuro/ })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => ajustesEnDisco().tema).toBe('oscuro')
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(23, 24, 27)')
  // Los segmentos del conmutador animan su color 0.12 s al cambiar de tema: axe mide cuando ya se asentaron.
  await page.waitForTimeout(400)
  expect(await fallasGraves(page)).toEqual([])
  const r1 = await aPantalla(0, 0.5)
  await page.waitForTimeout(450)
  await page.mouse.click(r1.x, r1.y, { button: 'right' })
  expect(await fallasGraves(page)).toEqual([])
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+Comma')
  expect(await fallasGraves(page)).toEqual([])
  await page.keyboard.press('Escape')
})

test('axe en oscuro: los ocho estados', async () => {
  expect(await axeEnTodosLosEstados()).toEqual([])
})

test('Ctrl+\\ alterna el lienzo limpio; el inspector plegado se recuerda', async () => {
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+Backslash')
  await expect(page.locator('.barra-limpia')).toBeVisible()
  await expect(page.locator('header.barra')).toHaveCount(0)
  await page.keyboard.press('Control+Backslash')
  await expect(page.locator('header.barra')).toBeVisible()
  await page.getByRole('button', { name: 'Plegar el inspector' }).click()
  await expect(page.locator('aside.inspector')).toHaveCount(0)
  await expect.poll(() => ajustesEnDisco().inspector).toBe(false)
})

test('al reabrir, la ventana abre en oscuro con el panel lateral y el inspector plegados', async () => {
  await app.close()
  await abrir(false)
  expect(await page.evaluate(() => document.documentElement.dataset.tema)).toBe('oscuro')
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(23, 24, 27)')
  await expect(page.locator('aside.inspector')).toHaveCount(0)
  await expect(page.locator('.riel.der .riel-boton[data-panel="inspector"]')).toBeVisible()
  await expect(page.locator('aside.lateral:not(.derecho)')).toHaveCount(0)
  await expect(page.locator('.riel-boton[data-panel="libreria"]')).toBeVisible()
})
