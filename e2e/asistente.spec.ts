import { readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import electronPath from 'electron'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fallasGraves } from './axe'
import { verFranja } from './franja'
import { carpetaNueva, lanzar } from './lanzar'

/** El indicador del asistente y su recorrido completo con la ventana real: el interruptor abre la tubería, un cliente MCP real (`Kirchi --mcp`) se une, coloca una pieza por el núcleo de edición, Ctrl+Z la quita y «Desconectar» apaga el indicador. Requiere ventana. */
test.describe.configure({ mode: 'serial' })

const texto = (r: unknown): string => (r as { content: { text: string }[] }).content[0].text
const sonda = (page: Page, m: string) => page.evaluate((m) => (window as any).__kirchi[m](), m)

async function abrirConfiguracion(page: Page): Promise<void> {
  await page.getByRole('toolbar', { name: 'Ventana' }).getByRole('button', { name: 'Configuración' }).click()
  await expect(page.getByRole('dialog', { name: 'Configuración' })).toBeVisible()
  await page.getByRole('tab', { name: 'Asistente' }).click()
}

async function cerrarConfiguracion(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Configuración' })).toHaveCount(0)
}

let app: ElectronApplication
let page: Page
let cliente: Client
let datos: string
const ms: number[] = []

test.beforeAll(async () => {
  datos = carpetaNueva()
  app = await lanzar({ datos })
  page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await page.waitForTimeout(600)
})

test.afterAll(async () => {
  await cliente?.close().catch(() => {})
  await app?.close().catch(() => {})
})

test('apagado no hay indicador; encender el interruptor deja «Listo»', async () => {
  await expect(page.locator('.chip-asistente')).toHaveCount(0)
  await abrirConfiguracion(page)
  const interruptor = page.getByRole('switch', { name: /Permitir que un asistente/ })
  await expect(interruptor).toHaveAttribute('aria-checked', 'false')
  await interruptor.click()
  await expect(interruptor).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('status').filter({ hasText: 'Listo. Escríbele al asistente desde tu cliente.' })).toBeVisible()
  await cerrarConfiguracion(page)
})

test('un cliente MCP real se une, coloca una pieza por el núcleo y deja chip, pieza y renglón', async () => {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v
  const transporte = new StdioClientTransport({ command: electronPath as unknown as string, args: ['.', '--mcp', `--datos=${datos}`], env, stderr: 'pipe' })
  cliente = new Client({ name: 'Prueba e2e', version: '1' })
  cliente.onerror = () => {}
  await cliente.connect(transporte)
  // El puente se une a la ventana en cuanto el cliente se presenta, antes de cualquier herramienta.
  const chip = page.locator('.chip-asistente')
  await expect(chip).toBeVisible()
  await expect(chip).toHaveAttribute('data-globo-nombre', 'Conectado: Prueba e2e')
  const estado = JSON.parse(texto(await cliente.callTool({ name: 'estado', arguments: {} })))
  expect(estado).toMatchObject({ ventana: true, modo: 'con ventana' })

  const antes = Object.keys(((await sonda(page, 'doc')) as { piezas: object }).piezas).length
  for (let i = 0; i < 3; i++) {
    const t = performance.now()
    const r = await cliente.callTool({ name: 'colocar', arguments: { tipo: 'resistencia', valor: '4k7', en: { x: 25 + i * 25, y: 25 } } })
    ms.push(performance.now() - t)
    expect((r as { isError?: boolean }).isError, texto(r)).toBeFalsy()
  }
  console.error(`colocar de punta a punta (ms): ${ms.map((m) => Math.round(m)).join(', ')}`)
  expect(Object.keys(((await sonda(page, 'doc')) as { piezas: object }).piezas).length).toBe(antes + 3)

  await verFranja(page, 'Registro')
  await expect(page.locator('.instrumentos.abierta')).toContainText('Asistente: colocó R1 (4k7).')
  // La lectura del circuito no deja renglón y ve lo que hay en la ventana.
  const leido = JSON.parse(texto(await cliente.callTool({ name: 'leer_circuito', arguments: {} })))
  expect(leido.piezas.map((p: { ref: string }) => p.ref)).toEqual(['R1', 'R2', 'R3'])
  await expect(page.locator('.instrumentos.abierta')).not.toContainText('leyó')
})

test('Ctrl+Z quita lo que colocó el asistente, de una orden por paso', async () => {
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+z')
  await expect.poll(async () => Object.keys(((await sonda(page, 'doc')) as { piezas: object }).piezas).length).toBe(2)
  await page.keyboard.press('Control+Shift+z')
  await expect.poll(async () => Object.keys(((await sonda(page, 'doc')) as { piezas: object }).piezas).length).toBe(3)
})

test('el chip y su globo pasan axe en claro y oscuro', async () => {
  for (const tema of ['claro', 'oscuro']) {
    if (tema === 'oscuro') await page.getByRole('button', { name: /^Tema oscuro/ }).first().click()
    await page.locator('.chip-asistente').hover()
    await expect(page.locator('.globo-cinta, [role="tooltip"]').filter({ hasText: 'Conectado: Prueba e2e' }).first()).toBeVisible()
    expect(await fallasGraves(page)).toEqual([])
    await page.mouse.move(5, 400)
  }
})

test('el clic en el chip abre Configuración › Asistente y «Desconectar» apaga el indicador', async () => {
  await page.locator('.chip-asistente').click()
  await expect(page.getByRole('dialog', { name: 'Configuración' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Asistente' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('status').filter({ hasText: 'Conectado: Prueba e2e' })).toBeVisible()
  await page.getByRole('button', { name: 'Desconectar' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Listo. Escríbele al asistente desde tu cliente.' })).toBeVisible()
  await cerrarConfiguracion(page)
  await expect(page.locator('.chip-asistente')).toHaveCount(0)
  // El puente no vuelve a unirse solo: lo dice.
  const r = await cliente.callTool({ name: 'leer_circuito', arguments: {} })
  expect((r as { isError?: boolean }).isError).toBe(true)
  expect(texto(r)).toContain('desconectó')
})

test('apagar el interruptor cierra la tubería: el servidor sigue pero dice que está apagado', async () => {
  await abrirConfiguracion(page)
  await page.getByRole('switch', { name: /Permitir que un asistente/ }).click()
  await cerrarConfiguracion(page)
  const r = await cliente.callTool({ name: 'estado', arguments: {} })
  expect(texto(r)).toContain('apagado')
})

test('al volver a encender el interruptor el puente se une solo otra vez', async () => {
  await abrirConfiguracion(page)
  await page.getByRole('switch', { name: /Permitir que un asistente/ }).click()
  await cerrarConfiguracion(page)
  await expect(page.locator('.chip-asistente')).toBeVisible({ timeout: 10_000 })
})

test('un circuito nuevo del asistente abre su propia ventana y las órdenes sobre ese archivo se ven allí', async () => {
  const antes = Object.keys(((await sonda(page, 'doc')) as { piezas: object }).piezas).length
  const ventanaNueva = app.waitForEvent('window')
  const creado = JSON.parse(texto(await cliente.callTool({ name: 'crear_circuito', arguments: { nombre: 'nuevo-e2e' } })))
  expect(creado.ventana).toContain('ventana nueva')
  const otra = await ventanaNueva
  await otra.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await expect.poll(() => otra.title()).toContain('nuevo-e2e.kir')
  const r = await cliente.callTool({ name: 'colocar', arguments: { circuito: 'nuevo-e2e', tipo: 'resistencia', valor: '1k' } })
  expect((r as { isError?: boolean }).isError, texto(r)).toBeFalsy()
  await expect.poll(async () => Object.keys(((await sonda(otra, 'doc')) as { piezas: object }).piezas).length).toBe(1)
  // El documento del usuario en la primera ventana no cambió.
  expect(Object.keys(((await sonda(page, 'doc')) as { piezas: object }).piezas).length).toBe(antes)
  // Si otro programa cambia ese archivo, la ventana avisa sin bloquear y «Conservar el mío» deja los cambios por guardar.
  const ruta = join(datos, 'Documentos', 'Kirchi', 'Asistente', 'nuevo-e2e.kir')
  writeFileSync(ruta, readFileSync(ruta))
  const t = new Date(Date.now() + 60_000)
  utimesSync(ruta, t, t)
  const aviso = otra.getByRole('status').filter({ hasText: 'Este archivo cambió fuera de Kirchi.' })
  await expect(aviso).toBeVisible({ timeout: 10_000 })
  expect(await fallasGraves(otra)).toEqual([])
  await aviso.getByRole('button', { name: 'Conservar el mío' }).click()
  await expect(aviso).toHaveCount(0)
  await expect.poll(() => otra.title()).toContain('*')
})
