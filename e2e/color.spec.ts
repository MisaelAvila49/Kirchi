import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { fallasGraves } from './axe'
import { verInspector } from './franja'
import { abrirPaneles, carpetaNueva, lanzar } from './lanzar'

/** Color e iconos sobre Electron: la práctica 3 (9 V, 2N2222 y LED rojo) en los dos temas, editando y simulando, con axe. Requiere ventana. */
test.describe.configure({ mode: 'serial' })

const pieza = (id: string, tipo: string, ref: string, x: number, y: number, props: Record<string, string> = {}) => ({ id, tipo, ref, x, y, rot: 0, espejo: false, props })
type Pieza = ReturnType<typeof pieza>
type Pines = Record<string, [number, number, string]>
function doc(partes: [Pieza, Pines][]) {
  const piezas: Record<string, Pieza> = {}
  const etiquetas: Record<string, { id: string; nombre: string; x: number; y: number; rot: number }> = {}
  for (const [p, pines] of partes) {
    piezas[p.id] = p
    for (const [pin, [dx, dy, red]] of Object.entries(pines)) etiquetas[`e_${p.id}_${pin}`] = { id: `e_${p.id}_${pin}`, nombre: red, x: p.x + dx, y: p.y + dy, rot: 0 }
  }
  return { piezas, cables: {}, etiquetas, notas: {} }
}
const dos = (a: string, b: string): Pines => ({ '1': [-4, 0, a], '2': [4, 0, b] })
const P3 = doc([
  [pieza('v1', 'fuente-dc', 'V1', 0, 0, { voltaje: '9' }), { '+': [0, -4, 'vcc'], '-': [0, 4, '0'] }],
  [pieza('g', 'tierra', 'GND1', -20, 0), { '1': [0, 0, '0'] }],
  [pieza('s1', 'interruptor', 'S1', 20, 0, { estado: 'cerrado' }), dos('vcc', 'sw')],
  [pieza('r1', 'resistencia', 'R1', 40, 0, { valor: '10k' }), dos('sw', 'b')],
  [pieza('q1', 'npn', 'Q1', 60, 0), { B: [-4, 0, 'b'], C: [2, -4, 'k'], E: [2, 4, '0'] }],
  [pieza('r2', 'resistencia', 'R2', 80, 0, { valor: '470' }), dos('vcc', 'a')],
  [pieza('d1', 'led', 'D1', 100, 0, { color: 'rojo' }), { A: [-4, 0, 'a'], K: [4, 0, 'k'] }]
])

const sonda = (page: Page, metodo: string, ...args: unknown[]): Promise<any> => page.evaluate(([m, a]) => (window as any).__kirchi[m](...a), [metodo, args] as [string, unknown[]])
async function clicMundo(page: Page, x: number, y: number) {
  const p = await sonda(page, 'aPantalla', x, y)
  await page.mouse.click(p.x, p.y)
  await page.waitForTimeout(250)
}

let app: ElectronApplication
let page: Page
test.beforeAll(async () => {
  app = await lanzar({ datos: carpetaNueva() })
  page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await abrirPaneles(page)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await page.waitForTimeout(600)
  await sonda(page, 'cargar', P3)
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('f')
})
test.afterAll(async () => {
  await app?.close()
})

for (const tema of ['claro', 'oscuro'] as const) {
  test(`${tema}: Librería, inspector teñido, Mediciones y barra de estado`, async () => {
    if (tema === 'oscuro') await page.getByRole('button', { name: /^Tema oscuro/ }).click()
    // Ocho categorías de piezas y la de Instrumentos, cada una con su tono.
    await expect(page.locator('.categoria[data-tono]')).toHaveCount(9)
    await clicMundo(page, 60, 0)
    await expect(page.locator('aside.inspector')).toHaveAttribute('data-tono', 'violeta')
    await expect(page.locator('.categoria-pieza')).toHaveText('Semiconductores')
    await expect(page.locator('.estado-modo')).toHaveText('Edición')
    await expect(page.locator('.inspector h3.sec', { hasText: /^Propiedades$/ })).toBeVisible()
    expect(await fallasGraves(page)).toEqual([])
    await page.locator('canvas.lienzo-gl').focus()
    await page.keyboard.press('F5')
    await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('corriendo')
    await clicMundo(page, 60, 0)
    await expect(page.locator('.marco')).toHaveAttribute('data-fase', 'corriendo')
    await expect(page.locator('.estado-modo')).toHaveText('Simulando')
    await expect(page.locator('.inspector .sim-aviso')).toHaveCount(0)
    // El inspector no da lecturas; una línea lleva a Mediciones, donde sí están (con la cifra de la pieza).
    await expect(page.locator('.inspector .medicion')).toHaveCount(0)
    await expect(page.locator('.inspector .ver-mediciones')).toBeVisible()
    await page.locator('.inspector .ver-mediciones button').click()
    await expect(page.locator('#panel-derecho')).toHaveAttribute('aria-label', 'Mediciones')
    await expect(page.locator('.panel-mediciones .fila-medida[aria-current="true"]')).toContainText('Q1')
    expect(await page.locator('.panel-mediciones .fila-medida[aria-current="true"] .cifra[data-magnitud="v"]').count()).toBeGreaterThanOrEqual(1)
    // La nota va debajo y el cuerpo del inspector trae su sección Propiedades.
    await verInspector(page)
    await expect(page.locator('.inspector h3.sec', { hasText: /^Propiedades$/ })).toBeVisible()
    expect(await fallasGraves(page)).toEqual([])
    await page.keyboard.press('Shift+F5')
    await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('detenida')
  })
}
