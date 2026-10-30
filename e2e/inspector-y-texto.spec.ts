import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { fallasGraves } from './axe'
import { abrirPaneles, lanzar } from './lanzar'

let app: ElectronApplication
let page: Page

test.describe.configure({ mode: 'serial' })

const R = (id: string, ref: string, x: number, y = 0) => ({ id, tipo: 'resistencia', ref, x, y, rot: 0, espejo: false, props: {} })
const VACIO = { piezas: {}, cables: {}, etiquetas: {}, notas: {} }
/** Cuatro resistencias sueltas: ningún pin conectado, falta la tierra, 9 avisos. */
const SUELTAS = { ...VACIO, piezas: { a: R('a', 'R1', 0), b: R('b', 'R2', 20), c: R('c', 'R3', 40), d: R('d', 'R4', 60) } }

const sonda = (metodo: string, ...args: unknown[]): Promise<any> =>
  page.evaluate(([m, a]) => (window as any).__kirchi[m](...a), [metodo, args] as [string, unknown[]])
const aPantalla = (x: number, y: number): Promise<{ x: number; y: number }> => sonda('aPantalla', x, y)
const doc = (): Promise<any> => sonda('doc')

test.beforeAll(async () => {
  app = await lanzar()
  page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await abrirPaneles(page)
})
test.afterAll(async () => {
  await app?.close()
})

test('«Listo para simular»: con avisos los lista; un clic en un aviso selecciona y centra la pieza', async () => {
  await sonda('cargar', SUELTAS)
  const insp = page.locator('aside.inspector')
  await expect(insp.locator('.estado-sim')).toHaveText('9 avisos impiden simular.')
  await expect(insp.locator('.avisos-inspector li')).toHaveCount(3)
  // «Ver los 9 avisos» los lista todos en el inspector y «Ver menos» los recoge.
  await insp.getByRole('button', { name: 'Ver los 9 avisos' }).click()
  await expect(insp.locator('.avisos-inspector li')).toHaveCount(9)
  await insp.getByRole('button', { name: 'Ver menos' }).click()
  await expect(insp.locator('.avisos-inspector li')).toHaveCount(3)
  await insp.locator('.avisos-inspector button.entrada').first().click()
  expect((await sonda('seleccion')).piezas).toHaveLength(1)
  const id = (await sonda('seleccion')).piezas[0]
  const p = (await doc()).piezas[id]
  const lz = (await page.locator('canvas.lienzo-gl').boundingBox())!
  const c = await aPantalla(p.x, p.y)
  expect(Math.abs(c.x - (lz.x + lz.width / 2))).toBeLessThan(3)
  expect(Math.abs(c.y - (lz.y + lz.height / 2))).toBeLessThan(3)
  await page.keyboard.press('Escape')
})

test('«Listo para simular» aparece con un divisor completo y sus redes con nombre', async () => {
  const d = {
    piezas: {
      v: { id: 'v', tipo: 'fuente-dc', ref: 'V1', x: 0, y: 0, rot: 0, espejo: false, props: { voltaje: '5' } },
      r1: R('r1', 'R1', 10, -8),
      r2: { ...R('r2', 'R2', 14, -4), rot: 90 },
      g: { id: 'g', tipo: 'tierra', ref: 'GND1', x: 0, y: 8, rot: 0, espejo: false, props: {} }
    },
    cables: {
      c_a: { id: 'c_a', puntos: [{ x: 0, y: -4 }, { x: 0, y: -8 }, { x: 6, y: -8 }] },
      c_b: { id: 'c_b', puntos: [{ x: 14, y: 0 }, { x: 14, y: 8 }, { x: 0, y: 8 }, { x: 0, y: 4 }] }
    },
    etiquetas: { e: { id: 'e', nombre: 'VSAL', x: 6, y: -8, rot: 0 } },
    notas: {}
  }
  await sonda('cargar', d)
  const insp = page.locator('aside.inspector')
  await expect(insp.locator('.estado-sim')).toHaveText('Listo para simular.')
  await expect(insp).toContainText('Redes con nombre')
  await expect(insp).toContainText('VSAL')
})

test('Shift+R gira la pieza seleccionada 90° a la izquierda y R a la derecha', async () => {
  await sonda('cargar', SUELTAS)
  const p = await aPantalla(0, 0.5)
  await page.mouse.click(p.x, p.y)
  await page.keyboard.press('Shift+R')
  expect((await doc()).piezas.a.rot).toBe(270)
  await page.keyboard.press('r')
  expect((await doc()).piezas.a.rot).toBe(0)
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
})

test('colocar un NPN desde la Librería muestra su modelo «2N2222» y el inspector lo ofrece', async () => {
  await sonda('cargar', VACIO)
  await page.getByRole('searchbox', { name: /Buscar en la librería/ }).fill('npn')
  const item = (await page.locator('.pieza-libreria', { hasText: 'NPN' }).first().boundingBox())!
  const destino = await aPantalla(10, 6)
  await page.mouse.move(item.x + item.width / 2, item.y + item.height / 2)
  await page.mouse.down()
  await page.mouse.move(destino.x - 80, destino.y, { steps: 6 })
  await page.mouse.move(destino.x, destino.y, { steps: 6 })
  await page.mouse.up()
  const q = Object.values((await doc()).piezas).find((x: any) => x.tipo === 'npn') as any
  expect(q).toBeTruthy()
  expect(q.ref).toBe('Q1')
  await expect.poll(async () => (await sonda('textos')).some((t: any) => t.texto === '2N2222')).toBe(true)
  await page.getByRole('searchbox', { name: /Buscar en la librería/ }).fill('')
  const c = await aPantalla(q.x, q.y)
  await page.mouse.click(c.x, c.y)
  await expect(page.locator('aside.inspector h2')).toContainText('Transistor NPN')
  await expect(page.locator('aside.inspector').getByLabel('Referencia')).toHaveValue('Q1')
  // Tabla de modelos: el elegido es el renglón con aria-pressed.
  await expect(page.locator('aside.inspector').getByRole('group', { name: 'Modelo', exact: true }).locator('button[aria-pressed="true"]')).toContainText('2N2222')
})

test('una nota se formatea con la barra flotante y el formato sobrevive a guardar y cargar', async () => {
  await sonda('cargar', { ...VACIO, notas: { n: { id: 'n', x: 0, y: 0, ancho: 24, texto: 'Divisor de voltaje' } } })
  const antes = (await sonda('textos')).find((t: any) => t.texto.startsWith('Divisor'))
  const p = await aPantalla(5, 1.6)
  await page.mouse.click(p.x, p.y)
  const barra = page.getByRole('toolbar', { name: 'Formato del texto' })
  await expect(barra).toBeVisible()
  await barra.getByRole('button', { name: 'Negrita' }).click()
  await barra.getByLabel('Fuente').selectOption('serif')
  await barra.getByRole('button', { name: 'Azul' }).click()
  const guardado = await doc()
  expect(guardado.notas.n.formato).toMatchObject({ fuente: 'serif', negrita: true, tinta: 'azul' })
  expect(JSON.stringify(guardado)).not.toMatch(/#[0-9a-f]{6}/i)
  await sonda('cargar', VACIO)
  expect(Object.keys((await doc()).notas)).toHaveLength(0)
  await sonda('cargar', guardado)
  expect((await doc()).notas.n).toEqual(guardado.notas.n)
  const despues = (await sonda('textos')).find((t: any) => t.texto.startsWith('Divisor'))
  expect(despues).toMatchObject({ fuente: 'serif', negrita: true })
  expect(antes.fuente).toBe('interfaz')
})

test('el menú Formato ▸ del clic derecho aplica una cursiva', async () => {
  await sonda('cargar', { ...VACIO, notas: { n: { id: 'n', x: 0, y: 0, ancho: 24, texto: 'Divisor de voltaje' } } })
  const p = await aPantalla(5, 1.6)
  await page.waitForTimeout(450)
  await page.mouse.click(p.x, p.y, { button: 'right' })
  const formato = page.getByRole('menuitem', { name: /^Formato/ })
  await expect(formato).toBeVisible()
  await formato.click()
  await page.getByRole('menuitemcheckbox', { name: 'Cursiva' }).click()
  expect((await doc()).notas.n.formato?.cursiva).toBe(true)
})

test('arrastrar el asa derecha de una nota cambia solo su ancho', async () => {
  await sonda('cargar', { ...VACIO, notas: { n: { id: 'n', x: 0, y: 0, ancho: 40, anchoFijo: true, texto: 'Una nota con varias palabras para repartir' } } })
  const p = await aPantalla(5, 1.6)
  await page.mouse.click(p.x, p.y)
  const de = await aPantalla(40, 0)
  const a = await aPantalla(30, 0)
  await page.mouse.move(de.x, de.y)
  await page.mouse.down()
  await page.mouse.move((de.x + a.x) / 2, de.y, { steps: 4 })
  await page.mouse.move(a.x, a.y, { steps: 4 })
  await page.mouse.up()
  const n = (await doc()).notas.n
  expect(n).toMatchObject({ x: 0, ancho: 30, anchoFijo: true })
  expect(n.formato).toBeUndefined()
  await page.keyboard.press('Control+z')
  expect((await doc()).notas.n.ancho).toBe(40)
})

test('el inspector de una nota tiene la sección Texto y rechaza un tamaño de 60 pt', async () => {
  await sonda('cargar', { ...VACIO, notas: { n: { id: 'n', x: 0, y: 0, ancho: 24, texto: 'Divisor de voltaje' } } })
  const p = await aPantalla(5, 1.6)
  await page.mouse.click(p.x, p.y)
  const insp = page.locator('aside.inspector')
  // Ficha de texto: la nota abre «Editar la nota» con el texto y el formato como borrador.
  await expect(insp.getByRole('group', { name: 'Editar la nota' })).toBeVisible()
  const tam = insp.getByLabel('Tamaño (pt)', { exact: true })
  await tam.fill('60')
  await tam.press('Enter')
  await expect(insp.locator('.campo-error').filter({ hasText: 'máximo' })).toHaveText('El tamaño máximo es 56.7 pt.')
  await tam.press('Escape')
})

test('la Librería trae las 113 piezas en nueve categorías (con Instrumentos), sin errores de librería', async () => {
  await sonda('cargar', VACIO)
  await page.keyboard.press('Escape')
  await expect(page.locator('.lateral .panel-cabeza')).toContainText('113 piezas')
  await expect(page.locator('.categoria-boton:not(.grupo-boton)')).toHaveCount(9)
  expect(await sonda('errores')).toEqual([])
})

test('axe sin fallas graves con el inspector «Listo para simular» y una nota seleccionada con su barra', async () => {
  await sonda('cargar', SUELTAS)
  expect(await fallasGraves(page)).toEqual([])
  await sonda('cargar', { ...VACIO, notas: { n: { id: 'n', x: 0, y: 0, ancho: 24, texto: 'Divisor de voltaje' } } })
  const p = await aPantalla(5, 1.6)
  await page.mouse.click(p.x, p.y)
  await expect(page.getByRole('toolbar', { name: 'Formato del texto' })).toBeVisible()
  expect(await fallasGraves(page)).toEqual([])
})
