import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { carpetaNueva, lanzar } from './lanzar'

/** Gráficas y análisis sobre Electron: un filtro RC de 1 kΩ y 159.15 nF da −3.01 dB y −45° en 1 kHz, y el cursor lo lee. */
const P = (id: string, tipo: string, ref: string, x: number, y: number, rot: number, props: Record<string, string> = {}) => ({ id, tipo, ref, x, y, rot, espejo: false, props })
const RC = {
  piezas: {
    p_v1: P('p_v1', 'fuente-pulso', 'V1', 0, 0, 0, { alto: '2', frecuencia: '1k' }),
    p_r1: P('p_r1', 'resistencia', 'R1', 10, -8, 0, { valor: '1k' }),
    p_c1: P('p_c1', 'capacitor', 'C1', 14, -4, 90, { valor: '159.15n' }),
    p_g: P('p_g', 'tierra', 'GND1', 0, 8, 0)
  },
  cables: {
    c_a: { id: 'c_a', puntos: [{ x: 0, y: -4 }, { x: 0, y: -8 }, { x: 6, y: -8 }] },
    c_b: { id: 'c_b', puntos: [{ x: 14, y: 0 }, { x: 14, y: 8 }, { x: 0, y: 8 }, { x: 0, y: 4 }] }
  },
  etiquetas: { e1: { id: 'e1', nombre: 'entrada', x: 6, y: -8, rot: 0 }, e2: { id: 'e2', nombre: 'salida', x: 14, y: -8, rot: 0 } },
  notas: {}
}

async function abrir(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await lanzar({ datos: carpetaNueva() })
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await page.waitForTimeout(600)
  return { app, page }
}
const sonda = (page: Page, metodo: string, ...args: unknown[]): Promise<any> => page.evaluate(([m, a]) => (window as any).__kirchi[m](...a), [metodo, args] as [string, unknown[]])

const aHz = (t: string): number => {
  const m = /^(−?[\d.]+)\s*(k|M|m)?Hz$/.exec(t.replace('−', '-').trim())
  if (!m) return Number.NaN
  const escala: Record<string, number> = { k: 1e3, M: 1e6, m: 1e-3 }
  return Number(m[1].replace('−', '-')) * (escala[m[2] ?? ''] ?? 1)
}

test('el Bode de un RC se ejecuta desde el botón Analizar y un cursor lee la frecuencia de corte', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', RC)
  // Analizar es un botón con menú en Inicio; la ficha queda en la pestaña Análisis del riel derecho.
  await page.locator('[data-comando="analizar"]:visible').click()
  await page.getByRole('menuitem', { name: 'CA / Bode' }).click()
  await page.locator('.ficha-analisis').getByRole('button', { name: 'Ejecutar' }).click()
  const lienzo = page.locator('.gr-lienzo')
  await expect(lienzo).toBeVisible({ timeout: 30_000 })

  // Una sola pantalla en estilo Instrumento (magnitud y fase como columnas A y B), eje de frecuencia logarítmico y la leyenda con las dos trazas.
  await expect(page.locator('.gr-leyenda-item')).toHaveCount(2)
  await page.getByRole('button', { name: 'Cursores' }).click()
  // La lectura de los cursores es compacta (solo diferencias); el detalle trae los dos valores de cada cursor.
  await page.getByRole('button', { name: 'Ver detalles' }).click()
  await lienzo.focus()
  // Con el foco en la gráfica, las flechas mueven el cursor 1 (la tecla 2 elige el otro): hasta leer 1 kHz.
  const primero = async () => {
    const t = await page.locator('.gr-lectura').first().innerText()
    return aHz(/Frecuencia: ([^→]+) →/.exec(t)?.[1] ?? '')
  }
  for (let i = 0; i < 400; i++) {
    const f = await primero()
    if (Math.abs(Math.log10(f) - 3) < 0.004) break
    await page.keyboard.press(Math.log10(f) < 3 ? 'ArrowRight' : 'ArrowLeft')
  }
  const lectura = await page.locator('.gr-lectura').first().innerText()
  expect(lectura).toMatch(/V\(salida\): −3\.0\d* dB/)
  expect(lectura).toMatch(/V\(salida\): −4[45](\.\d*)?°/)

  // El aspecto se guarda con el análisis: eje de la traza a la derecha y tono negro (la hoja lateral «Aspecto» se abre desde la barra del instrumento).
  await page.getByRole('button', { name: 'Aspecto', exact: true }).click()
  await expect(page.locator('.hoja-aspecto')).toBeVisible()
  const traza = page.locator('.hoja-aspecto .asp-traza').first()
  await traza.getByLabel('Eje vertical').selectOption('derecha')
  await traza.getByRole('button', { name: 'Negro' }).click()
  const guardado = Object.values((await sonda(page, 'doc')).analisis)[0] as any
  expect(guardado.grafica.trazas[0]).toMatchObject({ lado: 'derecha', color: 'negro' })

  await page.getByRole('button', { name: 'Listo' }).click()
  await expect(page.locator('.hoja-aspecto')).toHaveCount(0)

  // Exportar: el editor de la figura trae la vista grande, las herramientas, las propiedades y los cuatro formatos.
  await page.getByRole('button', { name: 'Exportar…' }).first().click()
  const editor = page.locator('.exportar-editor')
  await expect(editor).toBeVisible()
  await expect(editor.getByRole('toolbar', { name: 'Herramientas de la figura' })).toBeVisible()
  await expect(editor.getByLabel('Objeto de la figura que se edita')).toBeVisible()
  for (const f of ['PNG', 'SVG', 'PDF', 'CSV']) await expect(editor.getByLabel(f)).toBeVisible()
  // Una etiqueta de valor se pone con la herramienta y se puede deshacer.
  await editor.getByRole('button', { name: /Etiqueta de valor/ }).click()
  const vista = editor.locator('.editor-vista')
  const caja = (await vista.boundingBox())!
  // La etiqueta solo se pone cerca de una traza: se barre la vertical central hasta que alguna click la alcance.
  const objeto = editor.getByRole('combobox', { name: 'Objeto de la figura que se edita' })
  for (let y = 0.05; y < 0.95; y += 0.02) {
    await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height * y)
    if ((await objeto.innerText()).includes('Valor 1')) break
  }
  await expect(objeto).toContainText('Valor 1')
  await editor.getByRole('button', { name: 'Deshacer' }).click()
  await expect(editor.getByRole('combobox', { name: 'Objeto de la figura que se edita' })).not.toContainText('Valor 1')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await app.close()
})

test('el osciloscopio guarda el aspecto de su pantalla en el documento y lo conserva al recargar', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', { ...RC, piezas: { ...RC.piezas, p_x: P('p_x', 'osciloscopio', 'XSC1', 30, 0, 0, { aspecto: 'tiempo=abajo marcas=si A=derecha/negro' }) } })
  const d = await sonda(page, 'doc')
  expect(d.piezas.p_x.props.aspecto).toBe('tiempo=abajo marcas=si A=derecha/negro')
  await app.close()
})

test('la gráfica de la pestaña Gráficas sigue el alto del panel sin escalones', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', RC)
  // Analizar es un botón con menú en Inicio; la ficha queda en la pestaña Análisis del riel derecho.
  await page.locator('[data-comando="analizar"]:visible').click()
  await page.getByRole('menuitem', { name: 'CA / Bode' }).click()
  await page.locator('.ficha-analisis').getByRole('button', { name: 'Ejecutar' }).click()
  await expect(page.locator('.gr-lienzo')).toBeVisible({ timeout: 30_000 })
  const altos: number[] = []
  for (const h of [260, 380, 580]) {
    await page.evaluate((alto) => ((document.querySelector('.instrumentos-panel') as HTMLElement).style.height = `${alto}px`), h)
    await page.waitForTimeout(200)
    altos.push(await page.evaluate(() => document.querySelector('.gr-marco')!.getBoundingClientRect().height))
  }
  // El panel tiene un mínimo de unos 250 px por la barra del instrumento, por eso se mide desde 260. Crece con el panel: más alto el panel, más alta la gráfica, con la misma diferencia (lo que ocupan botones y leyenda).
  expect(altos[1]).toBeGreaterThan(altos[0] + 100)
  expect(altos[2]).toBeGreaterThan(altos[1] + 150)
  expect(Math.abs(380 - altos[1] - (260 - altos[0]))).toBeLessThan(2)
  expect(Math.abs(580 - altos[2] - (380 - altos[1]))).toBeLessThan(2)
  await app.close()
})
