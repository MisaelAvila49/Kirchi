import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { lanzar } from './lanzar'

let app: ElectronApplication
let page: Page
let startupMs = 0

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const t0 = Date.now()
  app = await lanzar()
  page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  startupMs = Date.now() - t0
})

test.afterAll(async () => {
  await app?.close()
})

test('abre en menos de 1.5 s', () => {
  console.log(`arranque: ${startupMs} ms`)
  expect(startupMs).toBeLessThan(1500)
})

test('el aislamiento entre orígenes está activo', async () => {
  expect(await page.evaluate(() => (window as any).__kirchi.isolated)).toBe(true)
})
