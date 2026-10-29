import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { carpetaNueva, lanzar } from './lanzar'

/**
 * «Aprende Kirchi», los cuatro capítulos sobre Electron. Cada prueba entra por Ayuda › Aprende Kirchi, usa la acción real en los pasos «Haz» y avanza los «Mira» con «Siguiente». Las esperas son del estado de la aplicación (sondeos), nunca tiempos fijos. Requiere ventana.
 */
test.describe.configure({ mode: 'serial' })

async function abrir(datos = carpetaNueva()): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await lanzar({ datos })
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  // La ventana maximizada: el ancho de la página llega al de la pantalla útil.
  await page.waitForFunction(() => window.innerWidth >= screen.availWidth - 24)
  return { app, page }
}

const sonda = (page: Page, metodo: string, ...args: unknown[]): Promise<any> => page.evaluate(([m, a]) => (window as any).__kirchi[m](...a), [metodo, args] as [string, unknown[]])
const globo = (page: Page) => page.locator('.tutorial-globo')
const cabecera = (page: Page) => page.locator('.tutorial-cap').first().textContent()
const cumplido = async (page: Page) => /Cumplido/.test((await cabecera(page)) ?? '')
const enPaso = (page: Page, n: number, total: number) => expect(page.locator('.tutorial-cap').first()).toHaveText(new RegExp(`Paso ${n} de ${total}\\b`))
/** Todo paso señala algo: el marco del foco está a la vista. */
const marco = (page: Page) => expect(page.locator('.tutorial-foco-marco').first()).toBeVisible()

/** Entra por Ayuda, Aprende Kirchi y el botón del capítulo. */
async function empezar(page: Page, capitulo: string, total: number) {
  await page.getByRole('tab', { name: 'Ayuda' }).click()
  await page.locator('[data-comando="aprender"]:visible').click()
  await page.locator(`[data-capitulo="${capitulo}"]`).click()
  await expect(globo(page)).toBeVisible()
  await enPaso(page, 1, total)
}

/** Un paso «Mira»: el marco está a la vista y «Siguiente» pasa al paso `n`. */
async function mirar(page: Page, n: number, total: number) {
  await marco(page)
  await expect(globo(page).getByRole('button', { name: 'Siguiente' })).toBeVisible()
  await globo(page).getByRole('button', { name: 'Siguiente' }).click()
  await enPaso(page, n, total)
}

/** Pasa al paso siguiente de un «Haz» ya cumplido; el ratón sobre el globo detiene el avance automático, así que no hay carrera. */
async function siguiente(page: Page, n: number, total: number) {
  await expect.poll(() => cumplido(page)).toBe(true)
  await globo(page).hover()
  await globo(page).getByRole('button', { name: 'Siguiente' }).click()
  await enPaso(page, n, total)
}

/** Salta pasos con el botón del globo desde el paso `desde` hasta el paso `n`. Los «Mira» se pasan con «Siguiente» y los «Haz» con «Saltar paso». */
async function irAlPaso(page: Page, desde: number, n: number, total: number) {
  for (let i = desde; i < n; i++) {
    const boton = globo(page).locator('.tutorial-accion')
    await boton.click()
    await enPaso(page, i + 1, total)
  }
}

/** Espera a que el globo termine su desplazamiento (0.18 s) antes de hacer clic en el lienzo, para no pegarle mientras pasa. */
async function globoQuieto(page: Page) {
  let antes = ''
  await expect.poll(async () => {
    const actual = JSON.stringify(await globo(page).boundingBox())
    const quieto = actual === antes
    antes = actual
    return quieto
  }).toBe(true)
}

const lienzo = (page: Page) => page.locator('canvas.lienzo-gl')

/** Puntos de pantalla de las líneas de color de la figura del editor de exportar, por color (para hacer clic sobre cada traza). */
const trazasDeLaFigura = (page: Page) =>
  page.evaluate(() => {
    const cv = document.querySelector('.exportar-editor canvas') as HTMLCanvasElement
    const r = cv.getBoundingClientRect()
    const c = document.createElement('canvas')
    c.width = cv.width
    c.height = cv.height
    const g = c.getContext('2d')!
    g.drawImage(cv, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    const res: Record<string, { x: number; y: number }[]> = {}
    for (let y = 0; y < c.height; y += 2)
      for (let x = 0; x < c.width; x += 2) {
        const i = (y * c.width + x) * 4
        if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) < 90) continue
        ;(res[`${d[i] >> 5},${d[i + 1] >> 5},${d[i + 2] >> 5}`] ??= []).push({ x: r.x + (x / c.width) * r.width, y: r.y + (y / c.height) * r.height })
      }
    return res
  })

test('capítulo 1: Conoce Kirchi, cuatro «Mira» y siete «Haz» con las acciones reales', async () => {
  const { app, page } = await abrir()
  await empezar(page, 'conoce', 11)
  // Parte de un circuito ya armado.
  expect(Object.keys((await sonda(page, 'doc')).piezas)).toHaveLength(4)
  // Los íconos de la interfaz salen en el texto, junto a los nombres.
  await mirar(page, 2, 11)
  await expect(globo(page).locator('.tutorial-icono svg')).toHaveCount(3)
  await expect(page.locator('#panel-lateral')).toBeVisible()
  await mirar(page, 3, 11)
  await expect(globo(page).locator('.tutorial-icono svg')).toHaveCount(4)
  await mirar(page, 4, 11)
  await expect(globo(page).locator('.tutorial-icono svg')).toHaveCount(3)
  await mirar(page, 5, 11)

  // Zoom con la rueda.
  const c = (await lienzo(page).boundingBox())!
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2)
  await page.mouse.wheel(0, -300)
  await siguiente(page, 6, 11)

  // Desplazar: Espacio y arrastrar sobre el lienzo.
  await lienzo(page).focus()
  await page.keyboard.down('Space')
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2)
  await page.mouse.down()
  await page.mouse.move(c.x + c.width / 2 + 40, c.y + c.height / 2 + 20, { steps: 4 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  await siguiente(page, 7, 11)

  // Encuadrar con F.
  await lienzo(page).focus()
  await page.keyboard.press('f')
  await siguiente(page, 8, 11)

  // Pantalla completa: entrar y volver (el menú nativo la hace; aquí se pide a la ventana).
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true))
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false))
  await siguiente(page, 9, 11)

  // Lienzo limpio: entrar y volver.
  await lienzo(page).focus()
  await page.keyboard.press('Control+Shift+L')
  await expect(page.getByRole('tab', { name: 'Inicio' })).toBeHidden()
  await page.keyboard.press('Control+Shift+L')
  await expect(page.getByRole('tab', { name: 'Inicio' })).toBeVisible()
  await siguiente(page, 10, 11)

  // Ctrl+K: el cuadro de búsqueda es el objetivo del marco.
  await marco(page)
  await lienzo(page).focus()
  await page.keyboard.press('Control+k')
  await siguiente(page, 11, 11)

  // La hoja de atajos: el tutorial se esconde mientras está abierta y vuelve al cerrarla.
  await page.getByRole('tab', { name: 'Ayuda' }).click()
  await page.getByRole('group', { name: 'Aprender' }).getByRole('button', { name: 'Atajos' }).click()
  await expect(page.getByRole('dialog', { name: /atajos/i })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect.poll(() => cumplido(page)).toBe(true)
  await globo(page).getByRole('button', { name: 'Terminar' }).click()
  await expect(globo(page)).toHaveCount(0)
  await app.close()
})

test('capítulo 2: Tu primer circuito empieza vacío y termina con la nota, el terminal VCC, las etiquetas y la simulación', async () => {
  const { app, page } = await abrir()
  await empezar(page, 'circuito', 19)
  expect(Object.keys((await sonda(page, 'doc')).piezas)).toHaveLength(0)
  // Paso 3: el LED se arrastra desde la Librería, con su icono en el texto y el panel abierto.
  await irAlPaso(page, 1, 3, 19)
  await expect(globo(page).locator('.tutorial-icono svg')).toHaveCount(1)
  await expect(page.locator('#panel-lateral')).toBeVisible()
  await marco(page)
  // Hasta la nota: se salta el armado (los pasos se comprueban en las pruebas unitarias con el documento real).
  await irAlPaso(page, 3, 11, 19)
  const pieza = (id: string, tipo: string, ref: string, x: number, y: number, rot = 0, props: Record<string, string> = {}) => ({ id, tipo, ref, x, y, rot, espejo: false, props })
  const cable = (id: string, ...pts: [number, number][]) => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })
  const base = await sonda(page, 'doc')
  for (const p of [pieza('v', 'fuente-dc', 'V1', 0, 0), pieza('r', 'resistencia', 'R1', 16, -4, 0, { valor: '1k' }), pieza('d', 'led', 'D1', 32, 0, 90), pieza('g', 'tierra', 'GND1', 0, 12)]) base.piezas[p.id] = p
  for (const c of [cable('c1', [0, -4], [12, -4]), cable('c2', [20, -4], [32, -4]), cable('c3', [32, 4], [0, 4]), cable('c4', [0, 4], [0, 12])]) base.cables[c.id] = c
  // Paso 11: la nota.
  base.notas.n = { id: 'n', x: 0, y: 20, ancho: 20, texto: 'Hola' }
  await sonda(page, 'cargar', base)
  await siguiente(page, 12, 19)
  // Paso 12: borrar la fuente y el cable de su +.
  delete base.piezas.v
  await sonda(page, 'cargar', base)
  await expect.poll(() => cumplido(page)).toBe(false)
  delete base.cables.c1
  await sonda(page, 'cargar', base)
  await siguiente(page, 13, 19)
  // Paso 13: el terminal VCC sobre su sombra; paso 14: su cable.
  await marco(page)
  base.piezas.t = pieza('t', 'alimentacion', 'PWR1', 0, -12)
  await sonda(page, 'cargar', base)
  await siguiente(page, 14, 19)
  base.cables.w1 = cable('w1', [0, -12], [0, -4])
  await sonda(page, 'cargar', base)
  await siguiente(page, 15, 19)
  // Paso 15: la etiqueta VCC en un tramo corto del cable. Con otro nombre no cuenta.
  base.cables.w2 = cable('w2', [0, -8], [4, -8])
  base.etiquetas.e1 = { id: 'e1', nombre: 'A', x: 4, y: -8, rot: 0 }
  await sonda(page, 'cargar', base)
  await expect.poll(() => cumplido(page)).toBe(false)
  base.etiquetas.e1.nombre = 'VCC'
  await sonda(page, 'cargar', base)
  await siguiente(page, 16, 19)
  // Paso 16: girarla. Paso 17: duplicarla (la copia conserva el giro).
  base.etiquetas.e1.rot = 90
  await sonda(page, 'cargar', base)
  await siguiente(page, 17, 19)
  base.etiquetas.e2 = { id: 'e2', nombre: 'VCC', x: 8, y: 8, rot: 90 }
  await sonda(page, 'cargar', base)
  await siguiente(page, 18, 19)
  // Paso 18: la copia al extremo libre de la resistencia, unida con un cable. Suelta no cuenta.
  base.etiquetas.e2 = { id: 'e2', nombre: 'VCC', x: 8, y: -4, rot: 90 }
  await sonda(page, 'cargar', base)
  await expect.poll(() => cumplido(page)).toBe(false)
  base.cables.w3 = cable('w3', [8, -4], [12, -4])
  await sonda(page, 'cargar', base)
  await siguiente(page, 19, 19)
  // Paso 19: F5 de verdad; el LED se enciende por las etiquetas.
  await lienzo(page).focus()
  await page.keyboard.press('F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('corriendo')
  await expect.poll(() => cumplido(page)).toBe(true)
  await globo(page).hover()
  await globo(page).getByRole('button', { name: 'Terminar' }).click()
  await expect(globo(page)).toHaveCount(0)
  await app.close()
})

test('capítulo 3: Medir arranca con el circuito, mide con «Medir» y termina con pausa, avanzar y retroceder', async () => {
  const { app, page } = await abrir()
  await empezar(page, 'medir-senales', 20)
  // El circuito de arranque trae la fuente, la resistencia, el LED y la tierra.
  expect(Object.keys((await sonda(page, 'doc')).piezas)).toHaveLength(4)
  // Clic derecho sobre el cable entre la resistencia y el LED: Medir, Multímetro, Medidor rápido.
  const p = await sonda(page, 'aPantalla', 26, -4)
  await page.mouse.click(p.x, p.y, { button: 'right' })
  await page.locator('[role="menuitem"]', { hasText: /^Medir$/ }).first().click()
  await page.locator('[role="menuitem"]', { hasText: /^Multímetro$/ }).first().click()
  await page.locator('[role="menuitem"]', { hasText: 'Medidor rápido' }).first().click()
  await siguiente(page, 2, 20)
  // Cada medida va en su propio cable: el multímetro en el de la fuente a la resistencia y la sonda en el de abajo.
  await globoQuieto(page)
  const m = await sonda(page, 'aPantalla', 6, -4)
  await page.mouse.click(m.x, m.y, { button: 'right' })
  await page.locator('[role="menuitem"]', { hasText: /^Medir$/ }).first().click()
  await page.locator('[role="menuitem"]', { hasText: /^Multímetro$/ }).first().click()
  await page.locator('[role="menuitem"]', { hasText: 'Multímetro completo' }).first().click()
  await siguiente(page, 3, 20)
  const v = await sonda(page, 'aPantalla', 18, 4)
  await globoQuieto(page)
  await page.mouse.click(v.x, v.y, { button: 'right' })
  await page.locator('[role="menuitem"]', { hasText: /^Medir$/ }).first().click()
  await page.locator('[role="menuitem"]', { hasText: /^Sonda$/ }).first().click()
  await page.locator('[role="menuitem"]', { hasText: /^Voltaje$/ }).first().click()
  await siguiente(page, 4, 20)
  // La lectura (paso 5) es un «Mira» con Mediciones abierto.
  await irAlPaso(page, 4, 5, 20)
  await expect(page.locator('#panel-derecho')).toBeVisible()
  await mirar(page, 6, 20)
  // Pausa, Avanzar y Retroceder (pasos 18 a 20) con el circuito de arranque.
  await irAlPaso(page, 6, 18, 20)
  await lienzo(page).focus()
  await page.keyboard.press('F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('corriendo')
  await page.keyboard.press('F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('pausada')
  await siguiente(page, 19, 20)
  await lienzo(page).focus()
  await page.keyboard.press('F6')
  await siguiente(page, 20, 20)
  await lienzo(page).focus()
  await page.keyboard.press('Shift+F6')
  await expect.poll(() => cumplido(page)).toBe(true)
  await app.close()
})

test('capítulo 4: del notch de la calculadora al Bode, la figura sobre el diálogo y la exportación del esquema', async () => {
  const { app, page } = await abrir()
  await empezar(page, 'analizar', 25)
  expect(Object.keys((await sonda(page, 'doc')).piezas)).toHaveLength(0)

  // Calculadoras › Filtros › Notch a 60 Hz › Generar circuito.
  await expect(page.locator('#panel-lateral')).toBeVisible()
  await marco(page)
  await page.locator('.calc-eleccion[data-calculadora="filtro"]').click()
  await siguiente(page, 2, 25)
  await page.locator('.panel-calculadoras .calc-campos select').first().selectOption('notch')
  await siguiente(page, 3, 25)
  await page.locator('.panel-calculadoras [data-accion="generar"]').click()
  const c = (await lienzo(page).boundingBox())!
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2)
  await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2)
  await siguiente(page, 4, 25)

  // Analizar › CA / Bode › Ejecutar (el paso señala la pestaña Inicio, desde Ayuda).
  await page.getByRole('tab', { name: 'Inicio' }).click()
  await page.locator('[data-comando="analizar"]:visible').click()
  await page.locator('[role="menuitem"]', { hasText: 'CA / Bode' }).first().click()
  await siguiente(page, 5, 25)
  await page.locator('[data-comando="analisis-ejecutar"]:visible').first().click()
  await expect.poll(() => cumplido(page), { timeout: 60_000 }).toBe(true)
  await globo(page).hover()
  await globo(page).getByRole('button', { name: 'Siguiente' }).click()
  await enPaso(page, 6, 25)

  // Cursores de la gráfica y apertura de la exportación.
  await page.locator('.barra-instrumento [data-accion="cursores"]:visible').first().click()
  await siguiente(page, 7, 25)
  await page.locator('.barra-instrumento [data-accion="exportar"]:visible').first().click()
  await expect(page.locator('.exportar-editor')).toBeVisible()
  // El tutorial queda encima del diálogo: el globo se ve y el marco enmarca cada zona del panel.
  await expect.poll(() => cumplido(page)).toBe(true)
  await expect(globo(page)).toBeVisible()
  await globo(page).hover()
  await globo(page).getByRole('button', { name: 'Siguiente' }).click()
  await enPaso(page, 8, 25)
  // Estilo Informe, con el clic real en su botón: los paneles de ganancia y fase se apilan.
  await marco(page)
  await page.locator('.exportar-editor .selector-estilo label', { hasText: 'Informe' }).click()
  await siguiente(page, 9, 25)
  for (const [i, zona] of ['restablecer', 'datos', 'tema', 'mostrar', 'letra', 'texto', 'rejilla', 'ejes', 'adornos'].entries()) {
    await expect(page.locator(`.editor-propiedades [data-zona="${zona}"]`).first()).toBeVisible()
    await mirar(page, 10 + i, 25)
  }
  // Varios elementos con Informe: clic en la traza de abajo y Mayús+clic en la de arriba (clics reales sobre la figura).
  await enPaso(page, 18, 25)
  await marco(page)
  const grupos = await trazasDeLaFigura(page)
  const medio = (pts: { x: number; y: number }[]) => [...pts].sort((p, q) => p.x - q.x)[Math.floor(pts.length / 2)]
  const verde = grupos['0,4,3'], azul = grupos['1,3,5']
  expect(verde?.length, 'la traza verde se dibuja').toBeGreaterThan(60)
  expect(azul?.length, 'la traza azul se dibuja').toBeGreaterThan(60)
  // Dos trazas distintas: la curva azul de la fase (V(Salida), abajo) y la línea verde de la ganancia (V(Entrada), arriba).
  const abajo = medio(azul.filter((p) => p.y > 600)), arriba = medio(verde.filter((p) => p.y < 600))
  await page.mouse.click(abajo.x, abajo.y)
  await page.keyboard.down('Shift')
  await page.mouse.click(arriba.x, arriba.y)
  await page.keyboard.up('Shift')
  await siguiente(page, 19, 25)
  // El color se aplica a los dos elegidos: sus muestras de «Datos» y la figura cambian (la figura ya no dibuja el verde ni el azul de origen).
  const tonos = page.locator('.editor-propiedades .tono-figura')
  const elegido = (await tonos.nth(3).getAttribute('data-tono-figura'))!
  await tonos.nth(3).click()
  await page.mouse.click(abajo.x, abajo.y - 160)
  await expect(page.locator('.editor-propiedades [data-zona="datos"] [data-tono-figura]')).toHaveCount(2)
  for (const m of await page.locator('.editor-propiedades [data-zona="datos"] [data-tono-figura]').all()) await expect(m).toHaveAttribute('data-tono-figura', elegido)
  const despues = await trazasDeLaFigura(page)
  expect(despues['0,4,3']?.length ?? 0, 'sin traza verde').toBeLessThan(40)
  expect(despues['1,3,5']?.length ?? 0, 'sin traza azul').toBeLessThan(40)
  await siguiente(page, 20, 25)
  // Exportar abre el diálogo nativo de guardar: aquí se salta y se cierra el diálogo de la figura.
  await globo(page).locator('.tutorial-accion').click()
  await page.locator('.exportar-editor').getByRole('button', { name: 'Cerrar' }).first().click()
  await expect(page.locator('.exportar-editor')).toHaveCount(0)
  // El paso 21 no va sobre el diálogo: el globo vuelve al cerrarlo.
  await enPaso(page, 21, 25)

  // Exportar el esquema: herramientas, Solo la selección y formatos sobre el diálogo.
  await page.locator('[data-comando="exportar"]:visible').first().click()
  await expect(page.locator('.exportar-esquema')).toBeVisible()
  await expect.poll(() => cumplido(page)).toBe(true)
  await globo(page).hover()
  await globo(page).getByRole('button', { name: 'Siguiente' }).click()
  await enPaso(page, 22, 25)
  await expect(page.locator('.exportar-esquema .editor-herramientas')).toBeVisible()
  await mirar(page, 23, 25)
  await expect(page.locator('.exportar-esquema [aria-label="Qué se exporta"]')).toBeVisible()
  await mirar(page, 24, 25)
  await expect(page.locator('.exportar-esquema .editor-pie-formato')).toBeVisible()
  await mirar(page, 25, 25)
  await app.close()
})

test('el globo cumplido no cambia de alto con el ratón en su borde inferior (no parpadea)', async () => {
  const { app, page } = await abrir()
  await empezar(page, 'medir-senales', 20)
  const p = await sonda(page, 'aPantalla', 26, -4)
  await page.mouse.click(p.x, p.y, { button: 'right' })
  await page.locator('[role="menuitem"]', { hasText: /^Medir$/ }).first().click()
  await page.locator('[role="menuitem"]', { hasText: /^Multímetro$/ }).first().click()
  await page.locator('[role="menuitem"]', { hasText: 'Medidor rápido' }).first().click()
  await expect.poll(() => cumplido(page)).toBe(true)
  const caja = (await globo(page).boundingBox())!
  await page.mouse.move(caja.x + 40, caja.y + caja.height - 1)
  // Con la barra de avance saliendo y entrando, el alto alternaba 14 px: se muestrea en cada cuadro durante un segundo y medio.
  const distintos = await page.evaluate(async () => {
    const el = document.querySelector('.tutorial-globo')!
    const altos = new Set<number>()
    const fin = performance.now() + 1500
    while (performance.now() < fin) {
      altos.add(Math.round(el.getBoundingClientRect().height))
      await new Promise((r) => requestAnimationFrame(r))
    }
    return altos.size
  })
  expect(distintos).toBe(1)
  await app.close()
})

test('capítulo 3: el capacitor del RC cuenta con los gestos reales, unido a media altura del cable o por los extremos', async () => {
  const { app, page } = await abrir()
  await empezar(page, 'medir-senales', 20)
  await irAlPaso(page, 1, 9, 20)
  await globoQuieto(page)
  // Doble clic en el vacío, «c 100u» y Enter; un clic sobre la sombra lo coloca y R lo gira como dice la pista.
  const vacio = await sonda(page, 'aPantalla', 60, 20)
  await page.mouse.dblclick(vacio.x, vacio.y)
  await page.locator('.buscador-campo').fill('c 100u')
  await page.keyboard.press('Enter')
  // El globo cubre el centro de la sombra: se coloca en su parte libre, una celda más arriba.
  const sombra = await sonda(page, 'aPantalla', 40, -2)
  // R gira el fantasma antes de soltarlo.
  await page.mouse.move(sombra.x, sombra.y)
  await page.keyboard.press('r')
  await page.mouse.move(sombra.x + 1, sombra.y + 1)
  await page.mouse.click(sombra.x, sombra.y)
  const delCap = async () => Object.values((await sonda(page, 'doc')).piezas as Record<string, any>).find((p) => p.tipo === 'capacitor')
  await expect.poll(async () => (await delCap())?.rot).toBe(90)
  const cap = (await delCap())!
  expect(cap, 'el capacitor se colocó').toBeTruthy()
  // Un pin a un punto intermedio del cable de la resistencia al LED (crea una unión) y el otro al de la tierra.
  const arrastrar = async (de: [number, number], a: [number, number]) => {
    const p = await sonda(page, 'aPantalla', ...de), q = await sonda(page, 'aPantalla', ...a)
    await page.mouse.move(p.x, p.y)
    await page.mouse.down()
    await page.mouse.move(q.x, q.y, { steps: 8 })
    await page.mouse.up()
  }
  await arrastrar([cap.x, cap.y - 4], [26, -4])
  await arrastrar([cap.x, cap.y + 4], [0, 12])
  await expect.poll(() => cumplido(page), { timeout: 5000 }).toBe(true)
  await app.close()
})

test('capítulo 3 con el flujo completo: cada lectura enmarcada al simular y el capacitor sobre la sombra, cableado en dos tiempos', async () => {
  const { app, page } = await abrir()
  await empezar(page, 'medir-senales', 20)
  const medir = async (x: number, y: number, sub: string, item: string) => {
    await globoQuieto(page)
    const p = await sonda(page, 'aPantalla', x, y)
    await page.mouse.click(p.x, p.y, { button: 'right' })
    await page.locator('[role="menuitem"]', { hasText: /^Medir$/ }).first().click()
    await page.locator('[role="menuitem"]', { hasText: new RegExp(`^${sub}$`) }).first().click()
    await page.locator('[role="menuitem"]', { hasText: item }).first().click()
  }
  const arrastrar = async (de: [number, number], a: [number, number]) => {
    const p = await sonda(page, 'aPantalla', ...de), q = await sonda(page, 'aPantalla', ...a)
    await page.mouse.move(p.x, p.y)
    await page.mouse.down()
    await page.mouse.move(q.x, q.y, { steps: 8 })
    await page.mouse.up()
  }
  const clic = async (x: number, y: number) => {
    const p = await sonda(page, 'aPantalla', x, y)
    await page.mouse.move(p.x, p.y, { steps: 4 })
    await page.mouse.click(p.x, p.y)
  }
  const poner = async (consulta: string, x: number, y: number, giros: number) => {
    await globoQuieto(page)
    const vacio = await sonda(page, 'aPantalla', 70, 30)
    await page.mouse.dblclick(vacio.x, vacio.y)
    await page.locator('.buscador-campo').fill(consulta)
    await page.keyboard.press('Enter')
    const s = await sonda(page, 'aPantalla', x, y)
    await page.mouse.move(s.x, s.y)
    for (let i = 0; i < giros; i++) await page.keyboard.press('r')
    await page.mouse.move(s.x + 1, s.y + 1)
    await page.mouse.click(s.x, s.y)
    await page.keyboard.press('Escape')
  }
  const marcos = page.locator('.tutorial-foco-marco')
  await medir(26, -4, 'Multímetro', 'Medidor rápido')
  await siguiente(page, 2, 20)
  await medir(6, -4, 'Multímetro', 'Multímetro completo')
  await siguiente(page, 3, 20)
  await medir(18, 4, 'Sonda', 'Voltaje')
  await siguiente(page, 4, 20)
  // Simular: el botón, el punto y la pantalla del medidor rápido, la sonda con su cifra, el multímetro con la suya y su fila en Mediciones, cada uno con su marco.
  await lienzo(page).focus()
  await page.keyboard.press('F5')
  await expect.poll(() => cumplido(page)).toBe(true)
  await expect(marcos).toHaveCount(6)
  await siguiente(page, 5, 20)
  await mirar(page, 6, 20)
  await lienzo(page).focus()
  await page.keyboard.press('Shift+F5')
  await siguiente(page, 7, 20)
  // El generador en lugar de la fuente, con su COM a la tierra.
  await globoQuieto(page)
  await clic(1, 0)
  await page.keyboard.press('Delete')
  await poner('generador', 0, -10, 2)
  await arrastrar([0, -16], [0, 12])
  await siguiente(page, 8, 20)
  await irAlPaso(page, 8, 9, 20)
  // Antes de colocar: un marco en el nodo del LED y otro en la tierra, separados.
  await expect(marcos).toHaveCount(2)
  await poner('c 100u', 40, 0, 1)
  const cap = Object.values((await sonda(page, 'doc')).piezas as Record<string, any>).find((p) => p.tipo === 'capacitor')
  expect(cap).toMatchObject({ x: 40, y: 0, rot: 90 })
  // Solo el cable de arriba: el paso sigue pendiente y queda un solo marco, el de la tierra.
  await arrastrar([40, -4], [32, -4])
  await expect(marcos).toHaveCount(1)
  expect(await cumplido(page)).toBe(false)
  // El de abajo por la línea punteada, con clics en el pin, en la esquina y en la tierra.
  await clic(40, 4)
  await clic(40, 12)
  await clic(0, 12)
  await expect.poll(() => cumplido(page), { timeout: 5000 }).toBe(true)
  await app.close()
})

const CAPTURAS_IMPORTAR = process.env.KIRCHI_CAPTURAS_TUTORIAL

test('capítulo 5: Importar abre el ejemplo, lee el informe, resalta la tarjeta ocre y reemplaza la caja gris', async () => {
  const { app, page } = await abrir()
  const captura = async (nombre: string) => {
    if (!CAPTURAS_IMPORTAR) return
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${CAPTURAS_IMPORTAR}/${nombre}.png` })
  }
  await empezar(page, 'importar', 7)
  expect(Object.keys((await sonda(page, 'doc')).piezas)).toHaveLength(0)

  // Mira: Abrir y los formatos que acepta.
  await mirar(page, 2, 7)

  // Haz: el botón del globo importa el ejemplo y sale el informe.
  await captura('paso2-abrir-ejemplo')
  await globo(page).getByRole('button', { name: 'Abrir el ejemplo' }).click()
  await expect(page.getByRole('dialog', { name: 'Importado de SPICE' })).toBeVisible()
  await siguiente(page, 3, 7)

  // Mira: las tarjetas, con el marco y el globo sobre el diálogo.
  await expect(page.locator('.tutorial-globo.sobre-dialogo')).toBeVisible()
  await captura('paso3-tarjetas')
  await mirar(page, 4, 7)

  // Haz: Entendido cierra el diálogo y abre Proyecto.
  await page.getByRole('button', { name: 'Entendido' }).click()
  await siguiente(page, 5, 7)

  // Haz: el ratón por la tarjeta ocre resalta las piezas aproximadas.
  const tarjeta = page.locator('.panel-proyecto .tarjeta-informe[data-clase="aproximadas"]')
  await tarjeta.hover()
  await expect.poll(() => sonda(page, 'resaltado')).toMatchObject({ tono: 'ocre' })
  await captura('paso5-tarjeta-ocre')
  await siguiente(page, 6, 7)

  // Haz: clic derecho en la caja gris, Reemplazar por… y un amp op.
  await page.mouse.move(5, 5)
  await captura('paso6-reemplazar')
  const caja = Object.values((await sonda(page, 'doc')).piezas as Record<string, any>).find((p) => p.tipo === 'sin-equivalencia')
  const c = await sonda(page, 'aPantalla', caja.x, caja.y)
  await page.mouse.click(c.x, c.y, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Reemplazar por…' }).click()
  await page.locator('.buscador-campo').fill('amp op')
  await page.keyboard.press('Enter')
  await page.getByRole('dialog', { name: '¿Reemplazar la pieza?' }).getByRole('button', { name: /^Reemplazar por/ }).click()
  await expect(page.locator('.panel-proyecto .tarjeta-informe[data-clase="sinEquivalencia"]')).toContainText('Todas reemplazadas')
  await expect(page.locator('.panel-proyecto .tarjeta-informe[data-clase="sinEquivalencia"]')).toHaveAttribute('data-tono', 'verdeazul')
  await siguiente(page, 7, 7)

  // Mira: guardar crea un .kir nuevo.
  await marco(page)
  await captura('paso7-guardar')
  await expect(globo(page).getByRole('button', { name: 'Terminar' })).toBeVisible()
  await app.close()
})
