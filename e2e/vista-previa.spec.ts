import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electronPath from 'electron'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fallasGraves } from './axe'
import { verFranja, verInspector, verMediciones } from './franja'
import { abrirPaneles, carpetaNueva, lanzar } from './lanzar'

/** Vista previa sobre Electron: lo que se bloquea mientras corre, interruptores y botones, piezas nuevas, aviso del LED directo, atajos guardados entre corridas, axe en los dos temas y memoria con umbral (tras usarla y corriendo, solo se registra). */

test.describe.configure({ mode: 'serial' })

const pieza = (id: string, tipo: string, ref: string, x: number, y: number, rot = 0, props: Record<string, string> = {}) => ({ id, tipo, ref, x, y, rot, espejo: false, props })
const cable = (id: string, ...pts: [number, number][]) => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })
const doc = (piezas: ReturnType<typeof pieza>[], cables: ReturnType<typeof cable>[]) => ({
  piezas: Object.fromEntries(piezas.map((p) => [p.id, p])),
  cables: Object.fromEntries(cables.map((c) => [c.id, c])),
  etiquetas: {},
  notas: {}
})
/** 5 V sobre dos resistencias de 1 kΩ: el punto medio une el pin 2 de R1 con el pin 1 de R2 en (14, −8). */
const CABLES_DIVISOR = [cable('c_a', [0, -4], [0, -8], [6, -8]), cable('c_b', [14, 0], [14, 8], [0, 8], [0, 4])]
const DIVISOR = doc(
  [pieza('v1', 'fuente-dc', 'V1', 0, 0, 0, { voltaje: '5' }), pieza('r1', 'resistencia', 'R1', 10, -8, 0, { valor: '1k' }), pieza('r2', 'resistencia', 'R2', 14, -4, 90, { valor: '1k' }), pieza('g', 'tierra', 'GND1', 0, 8)],
  CABLES_DIVISOR
)
const CON_INTERRUPTOR = doc(
  [pieza('v1', 'fuente-dc', 'V1', 0, 0, 0, { voltaje: '5' }), pieza('r1', 'resistencia', 'R1', 10, -8, 0, { valor: '1k' }), pieza('s1', 'interruptor', 'S1', 14, -4, 90, { estado: 'abierto' }), pieza('g', 'tierra', 'GND1', 0, 8)],
  CABLES_DIVISOR
)
/** Una Alimentación de 5 V (en lugar de la fuente) sobre el mismo divisor: el cable baja de la terminal a R1. */
const CON_ALIMENTACION = doc(
  [pieza('p1', 'alimentacion', 'PWR1', 0, -8, 0, { nombre: 'VCC' }), pieza('r1', 'resistencia', 'R1', 10, -8, 0, { valor: '1k' }), pieza('r2', 'resistencia', 'R2', 14, -4, 90, { valor: '1k' }), pieza('g', 'tierra', 'GND1', 14, 8)],
  [cable('c_a', [0, -8], [6, -8]), cable('c_b', [14, 0], [14, 8])]
)

async function abrir(o: { datos?: string; args?: string[] } = {}): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await lanzar({ datos: o.datos ?? carpetaNueva(), args: o.args })
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await abrirPaneles(page)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await page.waitForTimeout(600)
  return { app, page }
}
const sonda = (page: Page, metodo: string, ...args: unknown[]): Promise<any> => page.evaluate(([m, a]) => (window as any).__kirchi[m](...a), [metodo, args] as [string, unknown[]])
const fase = (page: Page): Promise<string> => sonda(page, 'simulacion').then((s) => s.fase)
const voltaje = async (page: Page, id: string) => (await sonda(page, 'simulacion')).piezas[id]?.v as number | undefined
const registro = (page: Page): Promise<string> => page.evaluate(() => document.querySelector('.registro')?.textContent ?? '')
/** JSON con las llaves ordenadas: dos documentos iguales dan el mismo texto sin importar el orden de inserción. */
const canonico = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x))
const enLienzo = async (page: Page, x: number, y: number) => {
  const p = await sonda(page, 'aPantalla', x, y)
  return p as { x: number; y: number }
}
async function simular(page: Page) {
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('F5')
  await expect.poll(() => fase(page)).toBe('corriendo')
}
async function dialogos(app: ElectronApplication, ruta: string) {
  await app.evaluate(({ dialog }, r) => {
    ;(dialog as any).showSaveDialog = async () => ({ canceled: false, filePath: r })
  }, ruta)
}

test('el divisor de 1 kΩ y 1 kΩ con 5 V muestra 2.50 V en la red intermedia, Mediciones, sin lecturas en el inspector', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', DIVISOR)
  // Mientras se edita, sin lectura: nada de voltajes ni chips.
  expect(await sonda(page, 'chips')).toEqual([])
  await simular(page)
  await expect.poll(async () => await voltaje(page, 'r1')).toBeCloseTo(2.5, 6)
  await expect.poll(async () => (await sonda(page, 'simulacion')).t).toBeGreaterThan(0)
  // Los chips están ocultos por omisión; V los muestra todos y otra V los oculta.
  expect(await sonda(page, 'chips')).toEqual([])
  await page.keyboard.press('v')
  await expect.poll(async () => (await sonda(page, 'chips')).map((c: any) => c.texto)).toContain('2.50 V')
  expect((await sonda(page, 'chips')).map((c: any) => c.texto).sort()).toEqual(['2.50 V', '5.00 V'])
  await page.keyboard.press('v')
  await expect.poll(async () => (await sonda(page, 'chips')).length).toBe(0)
  // El inspector de R1 no da lecturas, solo una línea que lleva a Mediciones, donde están con tres cifras.
  const r1 = await enLienzo(page, 10, -8)
  await page.mouse.click(r1.x, r1.y)
  await expect(page.locator('aside.inspector .medicion')).toHaveCount(0)
  await expect(page.locator('aside.inspector .ver-mediciones')).toBeVisible()
  await verMediciones(page)
  await expect(page.locator('#panel-derecho')).toContainText('2.50 V')
  await expect(page.locator('#panel-derecho')).toContainText('2.50 mA')
  expect(await fallasGraves(page)).toEqual([])
  // Mientras corre no se edita: Supr no borra, Ctrl+Z no deshace y el aviso lo dice.
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Delete')
  await page.keyboard.press('Control+Z')
  expect(Object.keys((await sonda(page, 'doc')).piezas)).toHaveLength(4)
  // Pausa y reanuda con F5; Shift+F5 detiene y deja el documento sin cambios.
  await page.keyboard.press('F5')
  await expect.poll(() => fase(page)).toBe('pausada')
  await page.keyboard.press('F5')
  await expect.poll(() => fase(page)).toBe('corriendo')
  await page.keyboard.press('Shift+F5')
  await expect.poll(() => fase(page)).toBe('detenida')
  expect((await sonda(page, 'archivo')).sinGuardar).toBe(false)
  expect(canonico(await sonda(page, 'doc'))).toBe(canonico(DIVISOR))
  await app.close()
})

test('los botones de la cinta simulan, pausan, reanudan y detienen; el nombre cambia con la fase', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', DIVISOR)
  // Simular y Detener viven en Inicio › Simular; Voltajes y Corriente, en el acceso rápido de la fila de título.
  const rapido = page.getByRole('toolbar', { name: 'Acceso rápido' })
  const simular = page.getByRole('toolbar', { name: 'Inicio', exact: true })
  await expect(simular.getByRole('button', { name: 'Detener' })).toHaveAttribute('aria-disabled', 'true')
  await simular.getByRole('button', { name: 'Simular' }).click()
  await expect.poll(() => fase(page)).toBe('corriendo')
  await simular.getByRole('button', { name: 'Pausar' }).click()
  await expect.poll(() => fase(page)).toBe('pausada')
  await simular.getByRole('button', { name: 'Reanudar' }).click()
  await expect.poll(() => fase(page)).toBe('corriendo')
  // Voltajes y Corriente están en la fila de título, junto al acceso rápido.
  await rapido.getByRole('button', { name: 'Voltajes', exact: true }).click()
  await expect.poll(async () => (await sonda(page, 'chips')).length).toBe(2)
  await simular.getByRole('button', { name: 'Detener' }).click()
  await expect.poll(() => fase(page)).toBe('detenida')
  await expect(simular.getByRole('button', { name: 'Simular' })).toBeVisible()
  await expect(simular.getByRole('button', { name: 'Detener' })).toHaveAttribute('aria-disabled', 'true')
  await app.close()
})

test('el chip de una red aparece al pasar el ratón por su cable y se mueve un poco al arrastrarlo', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', DIVISOR)
  await simular(page)
  await expect.poll(async () => await voltaje(page, 'r1')).toBeCloseTo(2.5, 6)
  // Sobre el cable de la red de 5 V (tramo horizontal de arriba) sale su chip.
  const c = await enLienzo(page, 3, -8)
  await page.mouse.move(c.x, c.y, { steps: 4 })
  await expect.poll(async () => (await sonda(page, 'chips')).map((x: any) => x.texto)).toEqual(['5.00 V'])
  const antes = (await sonda(page, 'chips'))[0]
  const p0 = await enLienzo(page, antes.x, antes.y)
  await page.mouse.move(p0.x, p0.y, { steps: 3 })
  await page.mouse.down()
  const lejos = await enLienzo(page, antes.x + 20, antes.y + 20)
  await page.mouse.move(lejos.x, lejos.y, { steps: 6 })
  // Mientras se arrastra, la red del chip sigue a la vista aunque el puntero ya no esté sobre él.
  const durante = (await sonda(page, 'chips'))[0]
  const mov = Math.hypot(durante.x - antes.x, durante.y - antes.y)
  // El chip se aleja a lo más 8 unidades (10 mm) de su red; parte a 1.6 del cable, así que se mueve a lo más 9.6 desde su lugar calculado.
  expect(mov).toBeGreaterThan(0.5)
  expect(mov).toBeLessThanOrEqual(8 + 1.6 + 0.01)
  await page.mouse.up()
  // Al soltar, el puntero quedó lejos del chip (el desplazo está acotado) y de su cable: el chip se oculta.
  await expect.poll(async () => (await sonda(page, 'chips')).length).toBe(0)
  // Al volver al cable, el chip sale donde el lector lo dejó.
  await page.mouse.move(c.x, c.y, { steps: 4 })
  await expect.poll(async () => (await sonda(page, 'chips')).length).toBe(1)
  const despues = (await sonda(page, 'chips'))[0]
  expect(Math.hypot(despues.x - durante.x, despues.y - durante.y)).toBeLessThan(0.01)
  expect((await sonda(page, 'archivo')).sinGuardar).toBe(false)
  await page.keyboard.press('Shift+F5')
  await app.close()
})

test('accionar un interruptor con el clic y con Enter lo cambia sin detener la simulación ni tocar el documento', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', CON_INTERRUPTOR)
  await simular(page)
  await expect.poll(async () => (await voltaje(page, 'r1')) ?? 1).toBeCloseTo(0, 3)
  const s1 = await enLienzo(page, 14, -4)
  await page.mouse.click(s1.x, s1.y)
  await expect.poll(async () => (await voltaje(page, 'r1')) ?? 0).toBeCloseTo(5, 3)
  expect((await sonda(page, 'doc')).piezas.s1.props.estado).toBe('abierto')
  expect((await sonda(page, 'archivo')).sinGuardar).toBe(false)
  // Con S1 seleccionado, Enter lo vuelve a abrir.
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await voltaje(page, 'r1')) ?? 1).toBeCloseTo(0, 3)
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await voltaje(page, 'r1')) ?? 0).toBeCloseTo(5, 3)
  // Al detener, el documento y el estado del interruptor siguen como estaban.
  await page.keyboard.press('Shift+F5')
  await expect.poll(() => fase(page)).toBe('detenida')
  expect(canonico(await sonda(page, 'doc'))).toBe(canonico(CON_INTERRUPTOR))
  await app.close()
})

test('un botón se sostiene mientras se aprieta y vuelve al soltar', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', doc(
    [pieza('v1', 'fuente-dc', 'V1', 0, 0, 0, { voltaje: '5' }), pieza('r1', 'resistencia', 'R1', 10, -8, 0, { valor: '1k' }), pieza('b1', 'boton', 'SW1', 14, -4, 90), pieza('g', 'tierra', 'GND1', 0, 8)],
    CABLES_DIVISOR
  ))
  await simular(page)
  await expect.poll(async () => (await voltaje(page, 'r1')) ?? 1).toBeCloseTo(0, 3)
  const b = await enLienzo(page, 14, -4)
  await page.mouse.move(b.x, b.y)
  await page.mouse.down()
  await expect.poll(async () => (await voltaje(page, 'r1')) ?? 0).toBeCloseTo(5, 3)
  await page.mouse.up()
  await expect.poll(async () => (await voltaje(page, 'r1')) ?? 1).toBeCloseTo(0, 3)
  await page.keyboard.press('Shift+F5')
  await app.close()
})

test('una Alimentación de 5 V sobre el divisor da 2.50 V; una fuente de corriente de 1 mA sobre 1 kΩ da 1.00 V', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', CON_ALIMENTACION)
  await simular(page)
  await expect.poll(async () => await voltaje(page, 'r1')).toBeCloseTo(2.5, 6)
  await page.keyboard.press('Shift+F5')
  await expect.poll(() => fase(page)).toBe('detenida')
  // I1 empuja 1 mA de su salida (arriba) hacia R1 y de ahí a tierra.
  await sonda(page, 'cargar', doc(
    [pieza('i1', 'fuente-corriente', 'I1', 0, 0, 0, { corriente: '1m' }), pieza('r1', 'resistencia', 'R1', 10, -8, 0, { valor: '1k' }), pieza('g', 'tierra', 'GND1', 0, 8)],
    [cable('c_a', [0, -4], [0, -8], [6, -8]), cable('c_b', [14, -8], [14, 8], [0, 8], [0, 4])]
  ))
  await simular(page)
  await expect.poll(async () => await voltaje(page, 'r1')).toBeCloseTo(1, 6)
  await page.keyboard.press('Shift+F5')
  await app.close()
})

test('un potenciómetro se mide entero: extremos, cursor y corriente', async () => {
  const { app, page } = await abrir()
  // 10 V sobre un potenciómetro de 10 kΩ con el cursor al 25 % y una carga de 1 MΩ en el cursor: el cursor queda a 2.5 o 7.5 V.
  await sonda(page, 'cargar', doc(
    [
      pieza('v1', 'fuente-dc', 'V1', 0, 0, 0, { voltaje: '10' }),
      pieza('rv', 'potenciometro', 'RV1', 20, 0, 0, { valor: '10k', posicion: '25 %' }),
      pieza('rl', 'resistencia', 'R1', 28, 4, 90, { valor: '1M' }),
      pieza('g', 'tierra', 'GND1', 0, 8),
      pieza('g2', 'tierra', 'GND2', 28, 12)
    ],
    [cable('c_a', [0, -4], [0, -8], [16, -8], [16, 0]), cable('c_b', [24, 0], [24, 8], [0, 8], [0, 4]), cable('c_c', [20, -4], [28, -4], [28, 0]), cable('c_d', [28, 8], [28, 12])]
  ))
  await simular(page)
  await expect.poll(async () => await voltaje(page, 'rv')).toBeCloseTo(10, 4)
  const cursor = (await sonda(page, 'simulacion')).piezas.rv.cursor as number
  expect([2.5, 7.5].some((x) => Math.abs(cursor - x) < 0.1)).toBe(true)
  const rv = await enLienzo(page, 20, 0)
  await page.mouse.click(rv.x, rv.y)
  await verMediciones(page)
  const medicion = page.locator('#panel-derecho')
  await expect(medicion).toContainText('10.0 V')
  await expect(medicion).toContainText('mA')
  await page.keyboard.press('Shift+F5')
  await app.close()
})

test('un LED directo a una fuente avisa y no deja simular; con una resistencia en serie sí simula', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', doc(
    [pieza('v1', 'fuente-dc', 'V1', 0, 0, 0, { voltaje: '9' }), pieza('d1', 'led', 'D1', 14, -4, 90, { color: 'rojo' }), pieza('g', 'tierra', 'GND1', 0, 8)],
    [cable('c_a', [0, -4], [0, -8], [14, -8]), cable('c_b', [14, 0], [14, 8], [0, 8], [0, 4])]
  ))
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('F5')
  await page.waitForTimeout(500)
  expect(await fase(page)).toBe('detenida')
  await expect(page.locator('aside.inspector')).toContainText('sin resistencia: agrega una en serie')
  await verFranja(page, 'Registro')
  await expect(page.locator('.registro')).toContainText('sin resistencia: agrega una en serie')
  // Con 330 Ω en serie el LED simula y su corriente es de unos 22 mA.
  await sonda(page, 'cargar', doc(
    [pieza('v1', 'fuente-dc', 'V1', 0, 0, 0, { voltaje: '9' }), pieza('r1', 'resistencia', 'R1', 10, -8, 0, { valor: '330' }), pieza('d1', 'led', 'D1', 14, -4, 90, { color: 'rojo' }), pieza('g', 'tierra', 'GND1', 0, 8)],
    CABLES_DIVISOR
  ))
  await simular(page)
  await expect.poll(async () => (await sonda(page, 'simulacion')).piezas.d1?.i as number).toBeGreaterThan(0.02)
  // Cada corrida empieza con el Registro vacío: el aviso de la anterior ya no está.
  await verFranja(page, 'Registro')
  await expect(page.locator('.registro')).not.toContainText('sin resistencia: agrega una en serie')
  await page.keyboard.press('Shift+F5')
  await app.close()
})

test('un temporizador 555 sin conectar no deja simular y dice qué pin falta (el 555 tiene modelo)', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', doc([...Object.values(DIVISOR.piezas), pieza('u1', 'temporizador-555', 'U1', 60, 0)], CABLES_DIVISOR))
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('F5')
  await page.waitForTimeout(500)
  expect(await fase(page)).toBe('detenida')
  await verFranja(page, 'Registro')
  await expect(page.locator('.registro')).toContainText(/de U1 no está conectado a nada[.]/)
  await expect(page.locator('.registro')).not.toContainText('modelo eléctrico')
  await app.close()
})

test('axe sin fallas graves en los dos temas con la vista previa corriendo, el inspector y Mediciones', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', DIVISOR)
  await simular(page)
  await page.keyboard.press('v')
  const r1 = await enLienzo(page, 10, -8)
  await page.mouse.click(r1.x, r1.y)
  await verMediciones(page)
  await expect(page.locator('#panel-derecho')).toContainText('2.50 V')
  expect(await fallasGraves(page)).toEqual([])
  await page.getByRole('button', { name: /^Tema oscuro/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro')
  await page.waitForTimeout(300)
  expect(await fallasGraves(page)).toEqual([])
  await verInspector(page)
  expect(await fallasGraves(page)).toEqual([])
  await page.keyboard.press('Shift+F5')
  await app.close()
})

test('Configuración → Atajos: Ctrl+Shift+F5 para detener sobrevive a cerrar y abrir, la hoja y el botón lo muestran y el viejo ya no actúa', async () => {
  const datos = carpetaNueva()
  let { app, page } = await abrir({ datos })
  await page.keyboard.press('Control+,')
  await page.getByRole('tab', { name: 'Atajos' }).click()
  await page.locator('.config-atajos input[type=search]').fill('detener')
  const agregar = page.locator('.config-atajos [data-comando="detener"]')
  await agregar.click()
  await page.keyboard.press('Control+Shift+F5')
  await expect(page.locator('.config-atajos .config-fila', { hasText: 'Detener la vista previa' })).toContainText('Ctrl')
  // Quita la de fábrica (Shift+F5) para probar que deja de actuar.
  await page.getByRole('button', { name: 'Quitar Shift+F5 de Detener la vista previa' }).click()
  expect(await fallasGraves(page)).toEqual([])
  await page.keyboard.press('Escape')
  await app.close()
  ;({ app, page } = await abrir({ datos }))
  await page.keyboard.press('?')
  const fila = page.locator('.fila-atajo', { hasText: 'Detener la vista previa' })
  await expect(fila.locator('kbd')).toHaveText(['Ctrl', 'Shift', 'F5'])
  await page.keyboard.press('Escape')
  // El atajo nuevo detiene y el de fábrica ya no.
  await sonda(page, 'cargar', DIVISOR)
  await simular(page)
  await page.keyboard.press('Shift+F5')
  await page.waitForTimeout(300)
  expect(await fase(page)).toBe('corriendo')
  await page.keyboard.press('Control+Shift+F5')
  await expect.poll(() => fase(page)).toBe('detenida')
  // El botón Detener anuncia la tecla nueva.
  await page.keyboard.press('F5')
  await expect.poll(() => fase(page)).toBe('corriendo')
  await expect(page.getByRole('toolbar', { name: 'Inicio', exact: true }).getByRole('button', { name: 'Detener' })).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+F5')
  await page.keyboard.press('Control+Shift+F5')
  await app.close()
})

test('Sin el menú: el divisor y el amplificador con transistor se dibujan con el teclado y el ratón, se guardan y se reabren idénticos', async () => {
  const datos = carpetaNueva()
  const dir = mkdtempSync(join(tmpdir(), 'kirchi-c3-'))
  const ruta = join(dir, 'amplificador.kir')
  let { app, page } = await abrir({ datos })
  const lienzo = page.locator('canvas.lienzo-gl')
  /** Coloca la pieza que da `consulta` en el punto de mundo (x, y), girada `giros` veces con R. */
  const colocar = async (consulta: string, x: number, y: number, giros = 0) => {
    const p = await enLienzo(page, x, y)
    await page.mouse.dblclick(p.x, p.y)
    await page.locator('.buscador-campo').fill(consulta)
    await page.keyboard.press('Enter')
    await expect.poll(() => sonda(page, 'herramienta')).toBe('colocar')
    for (let i = 0; i < giros; i++) await page.keyboard.press('r')
    await page.mouse.move(p.x, p.y)
    await page.mouse.click(p.x, p.y)
    await expect.poll(() => sonda(page, 'herramienta')).toBe('seleccionar')
  }
  /** Cable con clics por los puntos de mundo dados (el primero y el último son pines). */
  const cablear = async (...pts: [number, number][]) => {
    for (const [x, y] of pts) {
      const p = await enLienzo(page, x, y)
      await page.mouse.move(p.x, p.y, { steps: 4 })
      await page.mouse.click(p.x, p.y)
    }
    await page.keyboard.press('Escape')
  }
  /** Tierra con G en el punto de mundo dado. */
  const tierra = async (x: number, y: number) => {
    const p = await enLienzo(page, x, y)
    await page.mouse.move(p.x, p.y)
    await lienzo.focus()
    await page.keyboard.press('g')
    await page.mouse.click(p.x, p.y)
    await page.keyboard.press('Escape')
  }
  await sonda(page, 'cargar', { piezas: {}, cables: {}, etiquetas: {}, notas: {} })
  await colocar('dc 5', 0, 0)
  await colocar('r 1k', 10, -8)
  // R2 va a 6 unidades de R1: las piezas no se enciman (2.5 mm mínimos entre cuerpos).
  await colocar('r 1k', 20, -4, 1)
  await tierra(0, 8)
  await cablear([0, -4], [0, -8], [6, -8])
  await cablear([14, -8], [20, -8])
  await cablear([20, 0], [20, 8], [0, 8])
  await cablear([0, 4], [0, 8])
  const d1 = await sonda(page, 'doc')
  expect(Object.values(d1.piezas).map((p: any) => p.tipo).sort()).toEqual(['fuente-dc', 'resistencia', 'resistencia', 'tierra'])
  // El divisor dibujado a mano simula y da 2.50 V.
  await simular(page)
  const idR1 = (Object.values(d1.piezas).find((p: any) => p.ref === 'R1') as any).id
  await expect.poll(async () => await voltaje(page, idR1)).toBeCloseTo(2.5, 6)
  await page.keyboard.press('Shift+F5')
  await expect.poll(() => fase(page)).toBe('detenida')
  // El amplificador de emisor común.
  await colocar('npn', 60, 0)
  await colocar('r 47k', 48, 0)
  await colocar('r 2k2', 62, -12, 1)
  await colocar('r 470', 62, 12, 1)
  await tierra(62, 20)
  await cablear([52, 0], [56, 0])
  await cablear([62, -8], [62, -4])
  await cablear([62, 4], [62, 8])
  await cablear([62, 16], [62, 20])
  const d = await sonda(page, 'doc')
  expect(Object.values(d.piezas).map((p: any) => p.tipo).sort()).toEqual(['fuente-dc', 'npn', 'resistencia', 'resistencia', 'resistencia', 'resistencia', 'resistencia', 'tierra', 'tierra'])
  expect(Object.keys(d.cables).length).toBeGreaterThanOrEqual(7)
  // Guardar con el teclado (el diálogo nativo se reemplaza), cerrar y reabrir idéntico.
  await dialogos(app, ruta)
  await lienzo.focus()
  await page.keyboard.press('Control+S')
  await expect.poll(async () => (await sonda(page, 'archivo')).sinGuardar).toBe(false)
  expect(readFileSync(ruta).length).toBeGreaterThan(100)
  await app.close()
  ;({ app, page } = await abrir({ datos, args: [ruta] }))
  await expect.poll(async () => (await sonda(page, 'archivo')).nombre).toBe('amplificador.kir')
  expect(canonico(await sonda(page, 'doc'))).toBe(canonico(d))
  await app.close()
})

/** Memoria privada y de conjunto de trabajo (MB) de todos los procesos de la aplicación; privateBytes solo existe en Windows. */
async function memoria(app: ElectronApplication): Promise<{ priv: number; ws: number }> {
  const m = await app.evaluate(({ app }) => {
    const procs = app.getAppMetrics()
    return {
      priv: procs.reduce((s, p) => s + ((p.memory as any).privateBytes ?? p.memory.workingSetSize), 0),
      ws: procs.reduce((s, p) => s + p.memory.workingSetSize, 0)
    }
  })
  return { priv: m.priv / 1024, ws: m.ws / 1024 }
}
/** Fuerza el recolector de basura del renderizador por el protocolo de depuración. */
async function recolectar(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('HeapProfiler.enable')
  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.detach()
}

/** Carga 1,000 piezas, fuerza el recolector y compara la memoria privada de la aplicación con el umbral de su pantalla. */
async function memoriaConMilPiezas(app: ElectronApplication, page: Page, etiqueta: string): Promise<void> {
  await sonda(page, 'cargarDemo', 1000)
  await page.waitForTimeout(2000)
  await recolectar(page)
  await page.waitForTimeout(500)
  const pantalla = await app.evaluate(({ screen }) => {
    const d = screen.getPrimaryDisplay()
    return { w: Math.round(d.size.width * d.scaleFactor), h: Math.round(d.size.height * d.scaleFactor) }
  })
  const ventana = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }))
  const umbral = pantalla.w * pantalla.h > 1920 * 1080 ? 350 : 300
  const m = await memoria(app)
  console.log(
    `memoria RECIEN ABIERTA con 1,000 piezas (${etiqueta}): ${m.priv.toFixed(0)} MB privados, ${m.ws.toFixed(0)} MB de conjunto de trabajo; ` +
      `pantalla ${pantalla.w}×${pantalla.h}, ventana ${ventana.w}×${ventana.h} a ${ventana.dpr}×, umbral ${umbral} MB`
  )
  expect(m.priv).toBeLessThan(umbral)
}

for (const corrida of [1, 2, 3]) {
  test(`memoria con 1,000 piezas a pantalla completa, aplicación recién abierta y recolector forzado (corrida ${corrida} de 3)`, async () => {
    const { app, page } = await abrir()
    await memoriaConMilPiezas(app, page, `corrida ${corrida}`)
    await app.close()
  })
}

test('memoria con 1,000 piezas y el asistente conectado, aplicación recién abierta y recolector forzado', async () => {
  // El asistente quedó encendido de una sesión anterior y un puente real (`Kirchi --mcp`) se une a la ventana. El puente es
  // otro proceso: no cuenta en las métricas de la ventana.
  const datos = carpetaNueva()
  writeFileSync(join(datos, 'settings.json'), JSON.stringify({ asistente: { activo: true } }))
  const { app, page } = await abrir({ datos })
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v
  const cliente = new Client({ name: 'Prueba de memoria', version: '1' })
  cliente.onerror = () => {}
  try {
    await cliente.connect(new StdioClientTransport({ command: electronPath as unknown as string, args: ['.', '--mcp', `--datos=${datos}`], env, stderr: 'pipe' }))
    await expect(page.locator('.chip-asistente')).toHaveAttribute('data-globo-nombre', 'Conectado: Prueba de memoria')
    await memoriaConMilPiezas(app, page, 'asistente conectado')
    // La medición se hizo con el puente unido de verdad.
    const estado = JSON.parse((await cliente.callTool({ name: 'estado', arguments: {} }) as { content: { text: string }[] }).content[0].text)
    expect(estado).toMatchObject({ ventana: true })
  } finally {
    await cliente.close().catch(() => {})
    await app.close()
  }
})

/** 24 filas de 41 resistencias de 1 kΩ en paralelo, cada una con su fuente de 5 V y su tierra: 984 resistencias que sí simulan. */
function milPiezasSimulables() {
  const piezas: ReturnType<typeof pieza>[] = []
  const cables: ReturnType<typeof cable>[] = []
  for (let f = 0; f < 24; f++) {
    const y = 20 * f
    piezas.push(pieza(`v${f}`, 'fuente-dc', `V${f + 1}`, -8, y, 0, { voltaje: '5' }), pieza(`g${f}`, 'tierra', `GND${f + 1}`, -8, y + 6))
    cables.push(cable(`a${f}`, [-8, y - 4], [-8, y - 6], [8, y - 6]), cable(`b${f}`, [-8, y + 4], [-8, y + 6]))
    for (let i = 0; i < 41; i++) {
      const x = 12 * i + 8
      piezas.push(pieza(`r${f}_${i}`, 'resistencia', `R${f * 41 + i + 1}`, x, y, 1 * 90, { valor: '1k' }))
      cables.push(cable(`t${f}_${i}`, [x, y - 4], [x, y - 6], [x + 12, y - 6]), cable(`u${f}_${i}`, [x, y + 4], [x, y + 6], [x + 12, y + 6]))
    }
    cables.push(cable(`w${f}`, [8, y + 6], [-8, y + 6]))
  }
  return doc(piezas, cables)
}

test('memoria tras usarla y con la vista previa corriendo (solo se registra, sin umbral)', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', milPiezasSimulables())
  await page.waitForTimeout(1500)
  await recolectar(page)
  const antes = await memoria(app)
  await simular(page)
  await expect.poll(async () => await voltaje(page, 'r23_40')).toBeCloseTo(5, 3)
  await page.waitForTimeout(4000)
  const t = (await sonda(page, 'simulacion')).t as number
  await recolectar(page)
  const corriendo = await memoria(app)
  console.log(
    `memoria con 984 resistencias simulables (1,032 piezas): ${antes.priv.toFixed(0)} MB privados detenida; ` +
      `${corriendo.priv.toFixed(0)} MB privados con la vista previa corriendo (t = ${t.toFixed(3)} s; ${corriendo.ws.toFixed(0)} MB de conjunto de trabajo), sin umbral`
  )
  expect(corriendo.priv).toBeGreaterThan(0)
  await page.keyboard.press('Shift+F5')
  await app.close()
})
