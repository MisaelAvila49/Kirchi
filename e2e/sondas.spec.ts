import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { fallasGraves } from './axe'
import { verFranja } from './franja'
import { carpetaNueva, lanzar } from './lanzar'

/** Osciloscopio y sondas sobre Electron: Medir desde el clic derecho de un cable, marca de 0 V, rueda sobre el eje del tiempo, cifra de la sonda de voltaje, `.kir` con sondas en formato 5 y axe. Requiere ventana. */
test.describe.configure({ mode: 'serial' })

const pieza = (id: string, tipo: string, ref: string, x: number, y: number, props: Record<string, string> = {}) => ({ id, tipo, ref, x, y, rot: 0, espejo: false, props })
const cable = (id: string, ...pts: [number, number][]) => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })

/** 5 V sobre R1 y R2 de 1 kΩ, con la tierra, y XSC1 a la derecha midiendo el máximo de A. */
const DIVISOR = {
  piezas: {
    v1: pieza('v1', 'fuente-dc', 'V1', 0, 20, { voltaje: '5' }),
    r1: pieza('r1', 'resistencia', 'R1', 20, 0, { valor: '1k' }),
    r2: pieza('r2', 'resistencia', 'R2', 44, 0, { valor: '1k' }),
    g: pieza('g', 'tierra', 'GND1', 28, 32),
    o: pieza('o', 'osciloscopio', 'XSC1', 100, 10, { medidas: 'AM' })
  },
  cables: {
    a: cable('a', [0, 16], [0, 0], [16, 0]),
    b: cable('b', [24, 0], [40, 0]),
    c: cable('c', [48, 0], [56, 0], [56, 32], [0, 32], [0, 24])
  },
  etiquetas: {},
  notas: {}
}

async function abrir(o: { datos?: string; args?: string[] } = {}): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await lanzar({ datos: o.datos ?? carpetaNueva(), args: o.args })
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await page.waitForTimeout(600)
  return { app, page }
}
const sonda = (page: Page, metodo: string, ...args: unknown[]): Promise<any> => page.evaluate(([m, a]) => (window as any).__kirchi[m](...a), [metodo, args] as [string, unknown[]])
async function encuadrar(page: Page) {
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('f')
  await page.waitForTimeout(300)
}
/** Clic derecho en (x, y) del mundo y elige `ruta` (los nombres de los ítems, del menú al submenú). */
async function menuEn(page: Page, x: number, y: number, ...ruta: RegExp[]) {
  await encuadrar(page)
  const c = await sonda(page, 'aPantalla', x, y)
  await page.waitForTimeout(450)
  await page.mouse.click(c.x, c.y, { button: 'right' })
  for (const [k, n] of ruta.entries()) {
    const it = page.getByRole('menuitem', { name: n })
    if (k < ruta.length - 1) await it.hover()
    else await it.click()
    await page.waitForTimeout(250)
  }
}

test('medir con el osciloscopio pone una sonda, la pantalla mide, la marca y la rueda cambian la escala y se guarda en formato 5', async () => {
  const datos = carpetaNueva()
  let { app, page } = await abrir({ datos })
  await sonda(page, 'cargar', DIVISOR)
  await menuEn(page, 32, 0, /Medir con el osciloscopio/, /^Entrada A/)
  const d = await sonda(page, 'doc')
  expect(Object.values(d.sondas)).toEqual([expect.objectContaining({ tipo: 'osciloscopio', instrumento: 'o', entrada: 'A', x: 32, y: 0 })])
  expect(Object.keys(d.etiquetas)).toEqual([])
  // El medidor rápido en el mismo nodo (el clic derecho de un cable ya no trae sondas sueltas de voltaje).
  await menuEn(page, 32, 0, /Medir con el multímetro/, /^Medidor rápido/)
  // Simulando: el máximo de A es el punto medio (2.5 V).
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('corriendo')
  await verFranja(page, 'Osciloscopio')
  // 2.5 V del divisor cargado con el 1 MΩ de la entrada: 2.499 V.
  await expect(page.locator('.osc-medidas')).toContainText(/Vmáx 2\.49\d V/, { timeout: 5000 })
  await expect(page.locator('.osc-fuente').first()).toHaveText('← R1:2')
  // La rueda sobre el eje del tiempo (arriba de la retícula) baja la base de 1 ms a 500 µs por división.
  const p = await page.locator('canvas.osc-lienzo').boundingBox()
  await page.mouse.move(p!.x + p!.width / 2, p!.y + 12)
  await page.mouse.wheel(0, -100)
  await expect.poll(async () => (await sonda(page, 'doc')).piezas.o.props.base).toBe('500u')
  // La marca de 0 V de A (en el borde izquierdo de la retícula) sube dos divisiones.
  const q = await page.locator('canvas.osc-lienzo').boundingBox()
  // Con A y B a la misma altura, sus marcas van una junto a la otra y el aire de la izquierda crece una marca (16 px).
  // Cada columna mide lo que piden sus cifras (con 1 V por división y 11 px: 4 caracteres, 32 px).
  const ret = { x: q!.x + 20 + 16 + 2 * 32, y: q!.y + 40, h: q!.height - 48 }
  const y0 = ret.y + ret.h / 2
  await page.mouse.move(ret.x - 8, y0)
  await page.mouse.down()
  await page.mouse.move(ret.x - 8, y0 - ret.h / 8, { steps: 4 })
  await page.mouse.move(ret.x - 8, y0 - 2 * (ret.h / 8), { steps: 4 })
  await page.mouse.up()
  await expect.poll(async () => (await sonda(page, 'doc')).piezas.o.props.a_pos).toBe('2')
  await page.keyboard.press('Shift+F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('detenida')
  // Detenida, Ctrl+Z deshace el arrastre de la marca en un paso.
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+Z')
  await expect.poll(async () => (await sonda(page, 'doc')).piezas.o.props.a_pos ?? '0').toMatch(/^(0|)$/)
  // Guardar: con el medidor rápido el archivo sube a formato 8 (5 solo con las sondas); al volver a abrir están.
  const ruta = join(mkdtempSync(join(tmpdir(), 'kirchi-sondas-')), 'sondas.kir')
  await app.evaluate(({ dialog }, ruta) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: ruta })) as unknown as typeof dialog.showSaveDialog
  }, ruta)
  await page.keyboard.press('Control+S')
  await expect.poll(async () => (await sonda(page, 'archivo')).sinGuardar).toBe(false)
  const zip = unzipSync(readFileSync(ruta))
  expect(JSON.parse(strFromU8(zip['manifest.json'])).formato).toBe(8)
  const guardadas = (await sonda(page, 'doc')).sondas
  await app.close()
  ;({ app, page } = await abrir({ datos, args: [ruta] }))
  await expect.poll(async () => Object.keys((await sonda(page, 'doc')).sondas ?? {}).length).toBe(2)
  expect((await sonda(page, 'doc')).sondas).toEqual(guardadas)
  await app.close()
})

test('axe sin fallas graves ni críticas con el osciloscopio y las sondas, en los dos temas', async () => {
  for (const tema of ['claro', 'oscuro'] as const) {
    const { app, page } = await abrir()
    if (tema === 'oscuro') await page.getByRole('button', { name: /^Tema oscuro/ }).click()
    await sonda(page, 'cargar', DIVISOR)
    await menuEn(page, 32, 0, /Medir con el osciloscopio/, /^Entrada A/)
    await menuEn(page, 56, 16, /Medir con el multímetro/, /^Medidor rápido/)
    await page.locator('canvas.lienzo-gl').focus()
    await page.keyboard.press('F5')
    await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('corriendo')
    await verFranja(page, 'Osciloscopio')
    await page.waitForTimeout(800)
    // El ratón sobre la bandera de la sonda A (arriba a la derecha de su punto).
    const b = await sonda(page, 'aPantalla', 32 + 2.9, -2.9)
    await page.mouse.move(b.x, b.y)
    await page.waitForTimeout(300)
    await expect(page.locator('.globo')).toContainText('Sonda A de XSC1')
    expect(await fallasGraves(page), `${tema}`).toEqual([])
    await page.getByRole('button', { name: 'Más ajustes' }).click()
    expect(await fallasGraves(page), `${tema} con Más ajustes`).toEqual([])
    await page.keyboard.press('Escape')
    await page.keyboard.press('Shift+F5')
    await app.close()
  }
})
