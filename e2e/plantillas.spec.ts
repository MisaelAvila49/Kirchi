import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fallasGraves } from './axe'
import { carpetaNueva, lanzar } from './lanzar'

/** Plantillas sobre Electron: guardar una selección, verla en el panel, colocarla con un clic, deshacer de una vez y axe en los dos temas. Requiere ventana. */
test.describe.configure({ mode: 'serial' })

const pieza = (id: string, tipo: string, ref: string, x: number, y: number, props: Record<string, string> = {}) => ({ id, tipo, ref, x, y, rot: 0, espejo: false, props })
const cable = (id: string, ...pts: [number, number][]) => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })

const DIVISOR = {
  piezas: {
    v1: pieza('v1', 'fuente-dc', 'V1', 0, 20, { voltaje: '5' }),
    r1: pieza('r1', 'resistencia', 'R1', 20, 0, { valor: '1k' }),
    r2: pieza('r2', 'resistencia', 'R2', 44, 0, { valor: '1k' }),
    g: pieza('g', 'tierra', 'GND1', 28, 32)
  },
  cables: {
    a: cable('a', [0, 16], [0, 0], [16, 0]),
    b: cable('b', [24, 0], [40, 0]),
    c: cable('c', [48, 0], [56, 0], [56, 32], [0, 32], [0, 24])
  },
  etiquetas: {},
  notas: {}
}

async function abrir(datos: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await lanzar({ datos })
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await page.waitForTimeout(600)
  return { app, page }
}
/** El icono Plantillas del riel abre su panel si está plegado o muestra otro. */
const abrirPanelPlantillas = async (page: Page) => {
  const boton = page.getByRole('navigation', { name: 'Paneles' }).getByRole('button', { name: 'Plantillas' })
  if ((await boton.getAttribute('aria-expanded')) !== 'true') await boton.click()
  await page.waitForSelector('.panel-plantillas')
}
const sonda = (page: Page, metodo: string, ...args: unknown[]): Promise<any> => page.evaluate(([m, a]) => (window as any).__kirchi[m](...a), [metodo, args] as [string, unknown[]])
const contar = async (page: Page) => {
  const d = await sonda(page, 'doc')
  return { piezas: Object.keys(d.piezas).length, cables: Object.keys(d.cables).length }
}

test('guardar una selección como plantilla, verla en el panel Plantillas, colocarla y deshacer', async () => {
  const datos = carpetaNueva()
  // Con --datos la carpeta de plantillas cuelga de la carpeta de datos: la prueba no toca los Documentos del usuario.
  const carpeta = join(datos, 'Documentos', 'Kirchi', 'Plantillas')
  const { app, page } = await abrir(datos)
  try {
    await sonda(page, 'cargar', DIVISOR)
    await page.locator('canvas.lienzo-gl').focus()
    await page.keyboard.press('Control+a')
    // La orden de la cinta (Inicio › Archivo › Plantilla…) abre el diálogo con la selección.
    await page.getByRole('button', { name: /Plantilla…/ }).first().click()
    await page.waitForSelector('.dialogo.plantilla')
    await page.locator('.dialogo.plantilla input[type=text]').first().fill('Mi divisor')
    await page.locator('.dialogo.plantilla textarea').fill('Dos resistencias en serie.')
    expect(await fallasGraves(page)).toEqual([])
    await page.locator('.dialogo.plantilla button[type=submit]').click()
    await page.waitForSelector('.dialogo.plantilla', { state: 'detached' })
    // El archivo quedó en la carpeta fija, dentro de su categoría.
    const archivo = join(carpeta, 'Mis plantillas', 'Mi divisor.kir')
    expect(existsSync(archivo)).toBe(true)
    expect(readdirSync(join(carpeta, 'Mis plantillas'))).toEqual(['Mi divisor.kir'])
    // El panel Plantillas del riel (entre Librería y Proyecto) la lista, con su descripción, y trae las trece incluidas.
    await abrirPanelPlantillas(page)
    const fila = page.locator('.pl-fila', { hasText: 'Mi divisor' })
    await expect(fila).toHaveCount(1)
    await expect(fila.locator('.pl-descripcion')).toHaveText('Dos resistencias en serie.')
    await expect(page.locator('.pl-fila[data-plantilla^="Incluidas/"]')).toHaveCount(13)
    // Colocarla: un clic en la plantilla y otro en el lienzo, sin encimarse. Un solo deshacer la quita entera.
    // La vista abre a ~24 px por unidad (la ventana ve unos 90 × 52 unidades): se vacía el lienzo para que el lugar no dependa del zoom.
    await sonda(page, 'cargar', { piezas: {}, cables: {}, etiquetas: {}, notas: {} })
    const antes = await contar(page)
    await fila.click()
    const c = await sonda(page, 'aPantalla', 10, 10)
    await page.mouse.move(c.x, c.y)
    await page.mouse.click(c.x, c.y)
    await page.waitForTimeout(300)
    const despues = await contar(page)
    expect(despues.piezas).toBe(antes.piezas + 4)
    await page.keyboard.press('Control+z')
    expect(await contar(page)).toEqual(antes)
    // Plegar una categoría se recuerda: «Mis plantillas» queda plegada y su plantilla sale de la vista.
    await page.locator('.pl-cat[data-id="Mis plantillas"]').click()
    await expect(page.locator('.pl-cat[data-id="Mis plantillas"]')).toHaveAttribute('aria-expanded', 'false')
    await expect(fila).toHaveCount(0)
    // El buscador filtra por nombre y descripción; el teclado recorre el árbol y Mayús+F10 abre el menú de la fila.
    await page.locator('.pl-buscar').fill('en serie')
    await expect(page.locator('.pl-fila')).toHaveCount(3)
    await page.locator('.pl-buscar').press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Shift+F10')
    await expect(page.getByRole('menuitem', { name: /Renombrar/ })).toBeVisible()
    await page.keyboard.press('Escape')
  } finally {
    await app.close()
  }
})

test('las plantillas incluidas y el diálogo pasan axe en los dos temas', async () => {
  const datos = carpetaNueva()
  mkdirSync(datos, { recursive: true })
  const { app, page } = await abrir(datos)
  try {
    for (const tema of ['claro', 'oscuro']) {
      if (tema === 'oscuro') await page.getByRole('button', { name: /^Tema oscuro/ }).click()
      await abrirPanelPlantillas(page)
      expect(await fallasGraves(page)).toEqual([])
    }
  } finally {
    await app.close()
  }
})
