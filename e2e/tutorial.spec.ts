import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { fallasGraves } from './axe'
import { carpetaNueva, lanzar } from './lanzar'

/** «Aprende Kirchi», capítulo 1 sobre Electron: cada paso se cumple con la acción real, el avance queda en settings.json y se retoma, y axe no marca fallas graves en los dos temas. Requiere ventana. */
test.describe.configure({ mode: 'serial' })

async function abrir(datos: string): Promise<{ app: ElectronApplication; page: Page }> {
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
const centroDelFoco = async (page: Page) => {
  const r = (await page.locator('.tutorial-foco-marco').first().boundingBox())!
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}

/** Pasa al paso siguiente con el botón: el ratón sobre el globo detiene el paso automático, así que no hay carrera. */
async function siguiente(page: Page, nombre = 'Siguiente') {
  const globo = page.locator('.tutorial-globo')
  await globo.hover()
  await globo.getByRole('button', { name: nombre }).click()
}

/** Pone una pieza con el buscador del doble clic en el centro del foco (sin esperar a que el paso se cumpla). */
async function poner(page: Page, consulta: string) {
  const c = await centroDelFoco(page)
  await page.mouse.dblclick(c.x, c.y)
  await page.waitForSelector('.buscador input')
  await page.keyboard.type(consulta)
  await page.keyboard.press('Enter')
  await page.mouse.move(c.x + 2, c.y + 2)
  await page.mouse.click(c.x, c.y)
}

/** Coloca una pieza con el buscador del doble clic en el centro del foco y espera a que el paso se cumpla. */
async function colocar(page: Page, consulta: string) {
  await poner(page, consulta)
  await expect.poll(() => cumplido(page)).toBe(true)
  await siguiente(page)
}

/** Une dos puntos del mundo con un cable: un clic en cada pin. */
async function unir(page: Page, a: [number, number], b: [number, number]) {
  const A = await sonda(page, 'aPantalla', a[0], a[1])
  const B = await sonda(page, 'aPantalla', b[0], b[1])
  await page.mouse.move(A.x, A.y)
  await page.mouse.click(A.x, A.y)
  await page.mouse.move((A.x + B.x) / 2, (A.y + B.y) / 2)
  await page.mouse.move(B.x, B.y)
  await page.mouse.click(B.x, B.y)
}

test('el capítulo 1 se cumple paso a paso con acciones reales y el avance se guarda', async () => {
  const datos = carpetaNueva()
  const { app, page } = await abrir(datos)

  // Entrada: pestaña Ayuda, Aprende Kirchi y Empezar.
  await page.getByRole('tab', { name: 'Ayuda' }).click()
  await page.locator('[data-comando="aprender"]:visible').click()
  await expect(page.locator('.tutorial-selector')).toBeVisible()
  await page.locator('[data-capitulo="primer-circuito"]').click()
  await expect(page.locator('.tutorial-globo')).toBeVisible()
  await expect(page.locator('.tutorial-cap').first()).toHaveText(/Paso 1 de 9/)

  // Esc conserva su significado: no cierra el tutorial.
  await page.keyboard.press('Escape')
  await expect(page.locator('.tutorial-globo')).toBeVisible()

  // El foco oscurece pero no bloquea: el doble clic del paso 1 pasa a través.
  await colocar(page, 'fuente dc 5')
  await colocar(page, 'r 220')
  await colocar(page, 'led')

  // Paso 4: clic en el LED y R hasta que el cátodo quede abajo.
  const c = await centroDelFoco(page)
  await page.mouse.click(c.x, c.y)
  await page.keyboard.press('r')
  await expect.poll(() => cumplido(page)).toBe(true)
  await siguiente(page)

  // Paso 5: tres cables pin a pin.
  const piezas = Object.values((await sonda(page, 'doc')).piezas) as { tipo: string; x: number; y: number }[]
  const v = piezas.find((p) => p.tipo === 'fuente-dc')!, r = piezas.find((p) => p.tipo === 'resistencia')!, l = piezas.find((p) => p.tipo === 'led')!
  await unir(page, [v.x, v.y - 4], [r.x - 4, r.y])
  await unir(page, [r.x + 4, r.y], [l.x, l.y - 4])
  await unir(page, [l.x, l.y + 4], [v.x, v.y + 4])
  await expect.poll(() => cumplido(page)).toBe(true)
  await siguiente(page)

  // Paso 6: la tierra bajo la fuente, unida al − de la fuente.
  // El paso pide la tecla G (coloca la tierra) y un clic sobre la sombra; el globo tapa el centro del foco, así que no se hace doble clic.
  // El globo puede caer sobre el centro del foco: se coloca en su franja de arriba, que el globo no cubre.
  const marco = (await page.locator('.tutorial-foco-marco').first().boundingBox())!
  const cg = { x: marco.x + marco.width / 2, y: marco.y + 30 + 60 }
  await page.mouse.move(cg.x, cg.y - 60)
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('g')
  await page.mouse.move(cg.x + 2, cg.y - 58)
  await page.mouse.click(cg.x, cg.y - 60)
  const g = (Object.values((await sonda(page, 'doc')).piezas) as { tipo: string; x: number; y: number }[]).find((p) => p.tipo === 'tierra')!
  await unir(page, [v.x, v.y + 4], [g.x, g.y])
  await expect.poll(() => cumplido(page)).toBe(true)

  // axe con el globo a la vista, en los dos temas.
  expect(await fallasGraves(page)).toEqual([])
  await page.evaluate(() => (document.documentElement.dataset.tema = 'oscuro'))
  expect(await fallasGraves(page)).toEqual([])
  await siguiente(page)

  // Paso 7: F5 en el lienzo.
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('F5')
  await expect.poll(() => cumplido(page), { timeout: 10_000 }).toBe(true)
  await siguiente(page)

  // Paso 8: doble clic en la resistencia y un valor nuevo, sin detener la simulación.
  const R = await sonda(page, 'aPantalla', r.x, r.y)
  await page.mouse.dblclick(R.x, R.y)
  await page.keyboard.press('Control+a')
  await page.keyboard.type('1k')
  await page.keyboard.press('Enter')
  await expect.poll(() => cumplido(page)).toBe(true)
  await siguiente(page)

  // Paso 9: Mayús+F5 y Terminar.
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Shift+F5')
  await expect.poll(() => cumplido(page)).toBe(true)
  await siguiente(page, 'Terminar')
  await expect(page.locator('.tutorial-globo')).toHaveCount(0)

  // El selector marca el capítulo como hecho y ofrece repetirlo.
  await page.locator('[data-comando="aprender"]:visible').click()
  await expect(page.locator('.tutorial-estado').first()).toHaveText(/Hecho/)
  await expect(page.locator('[data-capitulo="primer-circuito"]')).toHaveText('Repetir')
  await app.close()
})

test('salir a la mitad guarda el paso y el selector lo retoma', async () => {
  const datos = carpetaNueva()
  let { app, page } = await abrir(datos)
  await page.getByRole('tab', { name: 'Ayuda' }).click()
  await page.locator('[data-comando="aprender"]:visible').click()
  await page.locator('[data-capitulo="primer-circuito"]').click()
  await page.locator('.tutorial-globo').getByRole('button', { name: 'Saltar paso' }).click()
  await page.locator('.tutorial-globo').getByRole('button', { name: 'Saltar paso' }).click()
  await page.locator('.tutorial-globo').getByRole('button', { name: 'Salir' }).click()
  await expect(page.locator('.tutorial-globo')).toHaveCount(0)
  await app.close()

  // Otra sesión con la misma carpeta de datos: el avance viene de settings.json.
  ;({ app, page } = await abrir(datos))
  await page.getByRole('tab', { name: 'Ayuda' }).click()
  await page.locator('[data-comando="aprender"]:visible').click()
  await expect(page.locator('.tutorial-estado').first()).toHaveText('En curso: 2 de 9')
  await page.locator('[data-capitulo="primer-circuito"]').click()
  // El lienzo abre vacío y el paso 3 espera piezas: el diálogo «Retomar» lo avisa y, con el circuito propio, el capítulo vuelve al
  // primer paso que el lienzo no cumple (el 1). El avance guardado ya se comprobó arriba (2 de 9).
  await expect(page.getByRole('dialog', { name: 'Retomar el capítulo 1' })).toContainText('desde el paso 1')
  await page.getByRole('button', { name: 'Seguir con mi circuito' }).click()
  await expect(page.locator('.tutorial-cap').first()).toHaveText(/Paso 1 de 9/)
  await app.close()
})

test('Ctrl+K encuentra «Aprende Kirchi» y abre el selector', async () => {
  const { app, page } = await abrir(carpetaNueva())
  await page.keyboard.press('Control+k')
  await page.keyboard.type('aprende')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tutorial-selector')).toBeVisible()
  await app.close()
})
