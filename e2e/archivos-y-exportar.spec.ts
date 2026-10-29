import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { zipSync, strToU8 } from 'fflate'
import { closeSync, existsSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fallasGraves } from './axe'
import { verFranja } from './franja'
import { carpetaNueva, lanzar } from './lanzar'

/**
 * Archivos y exportación sobre el ejecutable: guardar y reabrir, 5,000 piezas en menos de 0.5 s, autoguardado y recuperación tras matar el proceso, cierre con cambios, archivo soltado, Recientes y exportar a SVG, PNG y PDF.
 * Los diálogos nativos se reemplazan desde el proceso principal porque Playwright no los ve. Con KIRCHI_CAPTURAS=<carpeta> se guardan capturas de la página y una copia de lo exportado.
 */

const CAPTURAS = process.env['KIRCHI_CAPTURAS'] ?? ''
if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true })

const sonda = (page: Page, metodo: string, ...args: unknown[]): Promise<any> =>
  page.evaluate(([m, a]) => (window as any).__kirchi[m](...a), [metodo, args] as [string, unknown[]])

async function abrir(o: { datos: string; args?: string[] }): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await lanzar(o)
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  return { app, page }
}

interface Respuestas {
  abrir?: string | null
  guardar?: string | null
  /** Contestación de «¿Reemplazar?»: true reemplaza. */
  reemplazar?: boolean
}

/** Respuestas de los diálogos de abrir, guardar y reemplazar (null: cancela). Las llamadas quedan en `globalThis.__dialogos`. */
async function dialogos(app: ElectronApplication, r: Respuestas): Promise<void> {
  await app.evaluate(({ dialog }, r) => {
    const reg = ((globalThis as any).__dialogos = { abrir: 0, guardar: [] as string[], reemplazo: 0 })
    dialog.showOpenDialog = (async () => {
      reg.abrir++
      return { canceled: !r.abrir, filePaths: r.abrir ? [r.abrir] : [] }
    }) as typeof dialog.showOpenDialog
    dialog.showSaveDialog = (async (_w: unknown, o: { defaultPath?: string }) => {
      reg.guardar.push(o?.defaultPath ?? '')
      return { canceled: !r.guardar, filePath: r.guardar ?? '' }
    }) as unknown as typeof dialog.showSaveDialog
    dialog.showMessageBox = (async () => {
      reg.reemplazo++
      return { response: r.reemplazar ? 0 : 1, checkboxChecked: false }
    }) as unknown as typeof dialog.showMessageBox
  }, r)
}
const registroDialogos = (app: ElectronApplication): Promise<{ abrir: number; guardar: string[]; reemplazo: number }> => app.evaluate(() => (globalThis as any).__dialogos)

const pieza = (id: string, tipo: string, ref: string, x: number, y: number, rot = 0, props: Record<string, string> = {}) => ({ id, tipo, ref, x, y, rot, espejo: false, props })
const cable = (id: string, ...pts: [number, number][]) => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })

/** Divisor de 1 kΩ y 1 kΩ con 5 V y un amplificador con transistor NPN en emisor común, en el mismo esquema. */
function circuitoBase() {
  const d: any = { piezas: {}, cables: {}, etiquetas: {}, notas: {} }
  for (const p of [
    pieza('v1', 'fuente-dc', 'V1', 0, 0, 0, { voltaje: '5' }),
    pieza('r1', 'resistencia', 'R1', 10, -8, 0, { valor: '1k' }),
    pieza('r2', 'resistencia', 'R2', 14, -4, 90, { valor: '1k' }),
    pieza('g1', 'tierra', 'GND1', 0, 8),
    pieza('q1', 'npn', 'Q1', 60, 0),
    pieza('rc', 'resistencia', 'R3', 62, -12, 90, { valor: '2k2' }),
    pieza('rb', 'resistencia', 'R4', 48, 0, 0, { valor: '47k' }),
    pieza('re', 'resistencia', 'R5', 62, 12, 90, { valor: '470' }),
    pieza('g2', 'tierra', 'GND2', 62, 20)
  ])
    d.piezas[p.id] = p
  for (const c of [cable('a', [0, -4], [0, -8], [6, -8]), cable('b', [14, 0], [14, 8], [0, 8], [0, 4]), cable('c', [52, 0], [56, 0]), cable('e', [62, 4], [62, 8])]) d.cables[c.id] = c
  d.etiquetas.s = { id: 's', nombre: 'VSAL', x: 66, y: -6, rot: 0 }
  d.notas.n = { id: 'n', x: 0, y: -24, ancho: 40, texto: 'Práctica 3: divisor y emisor común (4.7 kΩ, 10 µF).' }
  return d
}

/** JSON con las llaves ordenadas: dos documentos iguales dan el mismo texto sin importar el orden de inserción. */
const canonico = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x))

/** Un .kir armado a mano (el formato es un zip con manifest.json y circuito.json), para los casos que la aplicación no produce. */
function escribirKirAjeno(ruta: string, formato: number, doc: unknown): void {
  writeFileSync(ruta, zipSync({ 'manifest.json': strToU8(JSON.stringify({ app: 'kirchi', formato, version: '9.9.9' })), 'circuito.json': strToU8(JSON.stringify(doc)) }))
}

const carpetaTemporal = () => mkdtempSync(join(tmpdir(), 'kirchi-e2e-kir-'))

async function captura(page: Page, nombre: string): Promise<void> {
  if (CAPTURAS) await page.screenshot({ path: join(CAPTURAS, `${nombre}.png`) })
}

async function ponerTema(page: Page, tema: 'claro' | 'oscuro'): Promise<void> {
  if ((await page.evaluate(() => document.documentElement.dataset.tema)) === tema) return
  await page.getByRole('button', { name: /^Tema oscuro/ }).click()
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.tema)).toBe(tema)
}

/** Un botón de Inicio › Archivo que abre un menú (Recientes o Exportar) y, si se dan, sus opciones, con el ratón. */
async function menuDeCinta(page: Page, boton: 'Recientes' | 'Exportar', ...ruta: string[]): Promise<void> {
  await page.getByRole('toolbar', { name: 'Inicio', exact: true }).getByRole('button', { name: boton, exact: true }).click()
  for (const nombre of ruta) await page.getByRole('menuitem', { name: nombre, exact: true }).click()
}

/** Mata de golpe el proceso principal de Kirchi y espera a que muera. `app.process()` no es ese proceso (es el lanzador de Playwright), así que se mata el `process.pid` del propio proceso principal. */
async function matar(app: ElectronApplication): Promise<void> {
  const pid = await app.evaluate(() => process.pid)
  const lanzador = app.process()
  process.kill(pid, 'SIGKILL')
  await expect
    .poll(() => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    }, { timeout: 10_000 })
    .toBe(false)
  if (lanzador.exitCode === null) await new Promise<void>((ok) => (lanzador.once('exit', () => ok()), lanzador.kill('SIGKILL'), setTimeout(ok, 3000)))
}

/** Dibuja algo (mover todo con la flecha) y espera a que el diario lo tenga: el último renglón escrito. */
async function editarYEsperarDiario(page: Page, datos: string): Promise<void> {
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  expect((await sonda(page, 'archivo')).sinGuardar).toBe(true)
  const raiz = join(datos, 'recuperacion')
  await expect
    .poll(
      () => {
        try {
          return readdirSync(raiz).some((id) => readdirSync(join(raiz, id)).some((n) => n.startsWith('diario') && statSync(join(raiz, id, n)).size > 40))
        } catch {
          return false
        }
      },
      { timeout: 10_000 }
    )
    .toBe(true)
  // El diario escribe como mucho un segundo después del cambio: se espera de sobra.
  await page.waitForTimeout(2000)
}

/** Lee dimensiones y pHYs de un PNG. */
function leerPng(bytes: Buffer): { ancho: number; alto: number; ppmX: number | null; ppmY: number | null; pHYsAntesDeIDAT: boolean } {
  expect(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true)
  let i = 8, ancho = 0, alto = 0, ppmX: number | null = null, ppmY: number | null = null, idat = false, antes = false
  while (i < bytes.length) {
    const largo = bytes.readUInt32BE(i), tipo = bytes.toString('latin1', i + 4, i + 8)
    if (tipo === 'IHDR') {
      ancho = bytes.readUInt32BE(i + 8)
      alto = bytes.readUInt32BE(i + 12)
    } else if (tipo === 'IDAT') idat = true
    else if (tipo === 'pHYs') {
      ppmX = bytes.readUInt32BE(i + 8)
      ppmY = bytes.readUInt32BE(i + 12)
      antes = !idat
    }
    i += 12 + largo
  }
  return { ancho, alto, ppmX, ppmY, pHYsAntesDeIDAT: antes }
}

/** Páginas y MediaBox (en puntos) de un PDF de Chromium. */
function leerPdf(bytes: Buffer): { paginas: number; cajas: [number, number][] } {
  const t = bytes.toString('latin1')
  const paginas = (t.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length
  const cajas = [...t.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2])] as [number, number])
  return { paginas, cajas }
}
const PT_POR_MM = 72 / 25.4

test.describe.configure({ mode: 'serial' })

test('se guarda, se cierra y se reabre idéntico, también desde la línea de órdenes', async () => {
  const datos = carpetaNueva()
  const dir = carpetaTemporal()
  const ruta = join(dir, 'practica 3.kir')
  let { app, page } = await abrir({ datos })
  expect(await page.title()).toBe('sin título.kir · Kirchi')
  await sonda(page, 'cargar', circuitoBase())
  expect((await sonda(page, 'archivo')).sinGuardar).toBe(false)
  await dialogos(app, { guardar: ruta })
  // Un cambio con el teclado (mover todo un paso con la flecha) deja «sin guardar».
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('ArrowRight')
  expect((await sonda(page, 'archivo')).sinGuardar).toBe(true)
  expect(await page.title()).toBe('sin título.kir * · Kirchi')
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())).toBe('sin título.kir * · Kirchi')
  await captura(page, 'titulo-con-asterisco-claro')
  await page.keyboard.press('Control+S')
  await expect.poll(async () => (await sonda(page, 'archivo')).sinGuardar).toBe(false)
  expect(await page.title()).toBe('practica 3.kir · Kirchi')
  // El primer guardado no tenía nada que respaldar y el diálogo sugirió el nombre dentro de Documentos.
  expect(existsSync(join(datos, 'respaldos')) ? readdirSync(join(datos, 'respaldos')) : []).toEqual([])
  expect((await registroDialogos(app)).guardar[0]).toMatch(/sin título\.kir$/)
  const guardado = await sonda(page, 'doc')
  const bytes = readFileSync(ruta)
  await app.close()
  // Reabrir por la línea de órdenes, como un doble clic en el explorador.
  ;({ app, page } = await abrir({ datos, args: [ruta] }))
  await expect.poll(async () => (await sonda(page, 'archivo')).nombre).toBe('practica 3.kir')
  expect(canonico(await sonda(page, 'doc'))).toBe(canonico(guardado))
  expect((await sonda(page, 'archivo')).sinGuardar).toBe(false)
  expect(await page.title()).toBe('practica 3.kir · Kirchi')
  // Guardar de nuevo sin cambios escribe los mismos bytes, y deja un respaldo del anterior (en la carpeta de datos).
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+S')
  const respaldos = () => (existsSync(join(datos, 'respaldos')) ? readdirSync(join(datos, 'respaldos')).flatMap((c) => readdirSync(join(datos, 'respaldos', c)).filter((n) => n.endsWith('.kir'))) : [])
  await expect.poll(() => respaldos().length).toBe(1)
  expect(readFileSync(ruta).equals(bytes)).toBe(true)
  expect(readdirSync(dir)).toEqual(['practica 3.kir'])
  expect(readFileSync(join(datos, 'respaldos', readdirSync(join(datos, 'respaldos'))[0], respaldos()[0])).equals(bytes)).toBe(true)
  // Recientes lo trae.
  await menuDeCinta(page, 'Recientes')
  await expect(page.getByRole('menuitem', { name: 'practica 3.kir' })).toBeVisible()
  await captura(page, 'menu-archivo-recientes-claro')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await app.close()
})

test('Guardar como agrega .kir y, si ya existe, pregunta antes de reemplazar (Cancelar no toca el archivo)', async () => {
  const datos = carpetaNueva()
  const dir = carpetaTemporal()
  const existente = join(dir, 'otro.kir')
  writeFileSync(existente, 'contenido ajeno que no se debe perder')
  const { app, page } = await abrir({ datos })
  await sonda(page, 'cargar', circuitoBase())
  // El diálogo nativo confirmó «otro» (que no existe): la aplicación agrega .kir y es ella quien pregunta.
  await dialogos(app, { guardar: join(dir, 'otro'), reemplazar: false })
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+Shift+S')
  await expect.poll(async () => (await registroDialogos(app)).reemplazo).toBe(1)
  await page.waitForTimeout(300)
  expect(readFileSync(existente, 'utf8')).toBe('contenido ajeno que no se debe perder')
  expect((await sonda(page, 'archivo')).nombre).toBe('sin título.kir')
  await dialogos(app, { guardar: join(dir, 'otro'), reemplazar: true })
  await page.keyboard.press('Control+Shift+S')
  await expect.poll(async () => (await sonda(page, 'archivo')).nombre).toBe('otro.kir')
  expect((await registroDialogos(app)).reemplazo).toBe(1)
  expect(readFileSync(existente).subarray(0, 2).toString('latin1')).toBe('PK')
  // El archivo anterior quedó respaldado en la carpeta de datos.
  const respaldo = readdirSync(join(datos, 'respaldos')).flatMap((c) => readdirSync(join(datos, 'respaldos', c)))
  expect(respaldo.some((n) => n.endsWith('.kir'))).toBe(true)
  // Con la ruta ya conocida, Guardar como sugiere el archivo abierto y su carpeta.
  await page.keyboard.press('Control+Shift+S')
  await expect.poll(async () => (await registroDialogos(app)).guardar.length).toBe(2)
  expect((await registroDialogos(app)).guardar.at(-1)).toBe(existente)
  await app.close()
})

test('un .kir de 5,000 piezas abre en menos de 0.5 s', async () => {
  const datos = carpetaNueva()
  const ruta = join(carpetaTemporal(), 'grande.kir')
  let { app, page } = await abrir({ datos })
  await sonda(page, 'cargarDemo', 5000)
  await dialogos(app, { guardar: ruta })
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+Shift+S')
  await expect.poll(async () => (await sonda(page, 'archivo')).nombre, { timeout: 20_000 }).toBe('grande.kir')
  await app.close()
  ;({ app, page } = await abrir({ datos }))
  await dialogos(app, { abrir: ruta })
  await page.locator('canvas.lienzo-gl').focus()
  const ms = await page.evaluate(async () => {
    const t0 = performance.now()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', code: 'KeyO', ctrlKey: true, bubbles: true }))
    while ((window as any).__kirchi.archivo().nombre !== 'grande.kir') await new Promise((r) => setTimeout(r, 5))
    return performance.now() - t0
  })
  console.log(`abrir 5,000 piezas: ${ms.toFixed(0)} ms (${(statSync(ruta).size / 1024).toFixed(0)} KB en disco)`)
  expect(Object.keys((await sonda(page, 'doc')).piezas)).toHaveLength(5000)
  expect(ms).toBeLessThan(500)
  await app.close()
})

test('Recientes: elegir uno cambia de archivo (con la pregunta si hay cambios) y «Borrar la lista» la vacía', async () => {
  const datos = carpetaNueva()
  const dir = carpetaTemporal()
  const a = join(dir, 'a.kir'), b = join(dir, 'b.kir')
  const { app, page } = await abrir({ datos })
  const da = circuitoBase()
  const db = { piezas: { x: pieza('x', 'resistencia', 'R1', 0, 0, 0, { valor: '10k' }) }, cables: {}, etiquetas: {}, notas: {} }
  for (const [ruta, doc] of [[a, da], [b, db]] as const) {
    await sonda(page, 'cargar', doc)
    await dialogos(app, { guardar: ruta })
    await page.locator('canvas.lienzo-gl').focus()
    await page.keyboard.press('Control+Shift+S')
    await expect.poll(async () => (await sonda(page, 'archivo')).ruta).toBe(ruta)
  }
  // La más nueva primero: b, a.
  await menuDeCinta(page, 'Recientes')
  await expect(page.getByRole('menu', { name: 'Recientes' }).or(page.locator('.menu').last()).getByRole('menuitem').first()).toBeVisible()
  expect(await page.getByRole('menuitem').allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining('b.kir'), expect.stringContaining('a.kir')]))
  // Con cambios, elegir otro archivo pregunta primero: Cancelar deja todo como estaba.
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('ArrowRight')
  await menuDeCinta(page, 'Recientes', 'a.kir')
  const pregunta = page.getByRole('dialog', { name: '¿Guardar los cambios?' })
  await expect(pregunta).toBeVisible()
  await pregunta.getByRole('button', { name: 'Cancelar' }).click()
  expect((await sonda(page, 'archivo')).nombre).toBe('b.kir')
  await menuDeCinta(page, 'Recientes', 'a.kir')
  await page.getByRole('dialog', { name: '¿Guardar los cambios?' }).getByRole('button', { name: 'No guardar' }).click()
  await expect.poll(async () => (await sonda(page, 'archivo')).nombre).toBe('a.kir')
  expect(Object.keys((await sonda(page, 'doc')).piezas)).toHaveLength(9)
  expect((await sonda(page, 'archivo')).sinGuardar).toBe(false)
  // El archivo desaparece: elegirlo avisa en el Registro y lo saca de la lista.
  rmSync(b)
  await menuDeCinta(page, 'Recientes', 'b.kir')
  await verFranja(page, 'Registro')
  await expect(page.locator('.registro')).toContainText('b.kir')
  await menuDeCinta(page, 'Recientes')
  await expect(page.getByRole('menuitem', { name: 'b.kir' })).toHaveCount(0)
  await page.getByRole('menuitem', { name: 'Borrar la lista' }).click()
  await expect(page.getByRole('toolbar', { name: 'Inicio', exact: true }).getByRole('button', { name: 'Recientes' })).toHaveAttribute('aria-disabled', 'true')
  await app.close()
})

test('soltar un archivo: el File real da su ruta en el preload; uno armado en la página, no', async () => {
  const datos = carpetaNueva()
  const dir = carpetaTemporal()
  const ruta = join(dir, 'soltado.kir')
  const { app, page } = await abrir({ datos })
  await sonda(page, 'cargar', circuitoBase())
  await dialogos(app, { guardar: ruta })
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+Shift+S')
  await expect.poll(async () => (await sonda(page, 'archivo')).ruta).toBe(ruta)
  await sonda(page, 'cargar', { piezas: {}, cables: {}, etiquetas: {}, notas: {} })
  // Un <input type=file> con el archivo del disco da un File real (Playwright lo llena por la ruta).
  await page.evaluate(() => {
    const i = document.createElement('input')
    i.type = 'file'
    i.id = '__elegir'
    i.multiple = true
    document.body.append(i)
  })
  const soltar = (archivos: 'real' | 'armado') =>
    page.evaluate((cual) => {
      const dt = new DataTransfer()
      if (cual === 'real') for (const f of Array.from((document.getElementById('__elegir') as HTMLInputElement).files!)) dt.items.add(f)
      else dt.items.add(new File([new Uint8Array([80, 75, 3, 4])], 'armado.kir'))
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
    }, archivos)
  // Armado en la página: no tiene ruta, no se abre nada y se dice.
  await soltar('armado')
  await verFranja(page, 'Registro')
  await expect(page.locator('.registro')).toContainText('armado.kir')
  expect(Object.keys((await sonda(page, 'doc')).piezas)).toEqual([])
  // Un archivo real que no es .kir se ignora con su aviso.
  const foto = join(dir, 'foto.jpg')
  writeFileSync(foto, Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
  await page.locator('#__elegir').setInputFiles(foto)
  await soltar('real')
  await verFranja(page, 'Registro')
  await expect(page.locator('.registro')).toContainText('Kirchi abre circuitos .kir y de Falstad, LTspice, SPICE, KiCad y Proteus; se ignoró foto.jpg.')
  // El real sí.
  await page.locator('#__elegir').setInputFiles(ruta)
  await soltar('real')
  await expect.poll(async () => Object.keys((await sonda(page, 'doc')).piezas).length).toBe(9)
  expect((await sonda(page, 'archivo')).nombre).toBe('soltado.kir')
  expect(Object.keys((await sonda(page, 'doc')).piezas)).toHaveLength(9)
  expect((await sonda(page, 'archivo')).ruta).toBe(ruta)
  await app.close()
})

test('autoguardado: tras matar el proceso se ofrece recuperar y el contenido queda idéntico (claro y oscuro, con axe)', async () => {
  const datos = carpetaNueva()
  const ruta = join(carpetaTemporal(), 'recup.kir')
  // Se parte de un archivo real (la base del diario es lo que se leyó del disco), como en el uso normal.
  escribirKirAjeno(ruta, 1, circuitoBase())
  const original = readFileSync(ruta)
  let { app, page } = await abrir({ datos, args: [ruta] })
  await expect.poll(async () => (await sonda(page, 'archivo')).nombre).toBe('recup.kir')
  await editarYEsperarDiario(page, datos)
  const antes = canonico(await sonda(page, 'doc'))
  expect(antes).not.toBe(canonico(circuitoBase()))
  await matar(app)
  for (const tema of ['claro', 'oscuro'] as const) {
    // El tema de la ventana sale de los ajustes de la carpeta de datos: se deja elegido antes de abrir.
    const ajustes = join(datos, 'settings.json')
    const actuales = existsSync(ajustes) ? JSON.parse(readFileSync(ajustes, 'utf8')) : {}
    writeFileSync(ajustes, JSON.stringify({ ...actuales, tema }))
    ;({ app, page } = await abrir({ datos }))
    const dialogo = page.getByRole('dialog', { name: 'Recuperar el trabajo sin guardar' })
    await expect(dialogo).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.dataset.tema)).toBe(tema)
    await expect(dialogo).toContainText('recup.kir')
    expect(await fallasGraves(page)).toEqual([])
    await captura(page, `dialogo-recuperar-${tema}`)
    if (tema === 'claro') {
      // Decidir después deja la sesión para la próxima vez; se mata este proceso (que no tiene cambios).
      await dialogo.getByRole('button', { name: 'Decidir después' }).click()
      expect((await sonda(page, 'archivo')).sinGuardar).toBe(false)
      await matar(app)
    }
  }
  await page.getByRole('dialog', { name: 'Recuperar el trabajo sin guardar' }).getByRole('button', { name: 'Recuperar' }).click()
  await expect.poll(async () => (await sonda(page, 'archivo')).sinGuardar).toBe(true)
  expect(canonico(await sonda(page, 'doc'))).toBe(antes)
  expect(await page.title()).toBe('recup.kir * · Kirchi')
  expect((await sonda(page, 'archivo')).ruta).toBe(ruta)
  // Lo recuperado sigue protegido: si se mata otra vez sin guardar, se vuelve a ofrecer idéntico.
  await matar(app)
  ;({ app, page } = await abrir({ datos }))
  const otra = page.getByRole('dialog', { name: 'Recuperar el trabajo sin guardar' })
  await expect(otra).toBeVisible()
  await otra.getByRole('button', { name: 'Recuperar' }).click()
  await expect.poll(async () => (await sonda(page, 'archivo')).sinGuardar).toBe(true)
  expect(canonico(await sonda(page, 'doc'))).toBe(antes)
  // Guardar escribe sobre el archivo original (el permiso se renovó al recuperar) y respalda el anterior.
  expect(readFileSync(ruta).equals(original)).toBe(true)
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+S')
  await expect.poll(async () => (await sonda(page, 'archivo')).sinGuardar).toBe(false)
  expect(readFileSync(ruta).equals(original)).toBe(false)
  const respaldos = readdirSync(join(datos, 'respaldos')).flatMap((c) => readdirSync(join(datos, 'respaldos', c)).filter((n) => n.endsWith('.kir')))
  expect(respaldos).toHaveLength(1)
  // Descartar: una sesión con cambios, muerta, se borra y la siguiente vez ya no se ofrece.
  await editarYEsperarDiario(page, datos)
  await matar(app)
  ;({ app, page } = await abrir({ datos }))
  await page.getByRole('dialog', { name: 'Recuperar el trabajo sin guardar' }).getByRole('button', { name: 'Descartar' }).click()
  await app.close()
  ;({ app, page } = await abrir({ datos }))
  await page.waitForTimeout(500)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await app.close()
})

test('una sesión viva (otra ventana de Kirchi con la misma carpeta) no se ofrece como recuperable', async () => {
  const datos = carpetaNueva()
  const uno = await abrir({ datos })
  await sonda(uno.page, 'cargar', circuitoBase())
  await editarYEsperarDiario(uno.page, datos)
  const dos = await abrir({ datos })
  await dos.page.waitForTimeout(800)
  await expect(dos.page.getByRole('dialog')).toHaveCount(0)
  await dos.app.close()
  await uno.app.close()
})

test('cerrar con cambios pregunta: Cancelar no cierra, Guardar guarda y cierra, No guardar cierra y borra el diario', async () => {
  const datos = carpetaNueva()
  const dir = carpetaTemporal()
  const { app, page } = await abrir({ datos })
  await sonda(page, 'cargar', circuitoBase())
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
  const cerrar = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await cerrar()
  const pregunta = page.getByRole('dialog', { name: '¿Guardar los cambios?' })
  await expect(pregunta).toBeVisible()
  await expect(pregunta.getByRole('button', { name: 'Guardar', exact: true })).toBeFocused()
  await captura(page, 'dialogo-guardar-cambios-claro')
  expect(await fallasGraves(page)).toEqual([])
  await pregunta.getByRole('button', { name: 'Cancelar' }).click()
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  await page.keyboard.press('Escape')
  // Oscuro: mismo diálogo, axe y captura.
  await ponerTema(page, 'oscuro')
  await cerrar()
  await expect(pregunta).toBeVisible()
  expect(await fallasGraves(page)).toEqual([])
  await captura(page, 'dialogo-guardar-cambios-oscuro')
  await pregunta.getByRole('button', { name: 'Cancelar' }).click()
  await ponerTema(page, 'claro')
  // Un archivo que nunca se guardó: cerrar → Guardar abre Guardar como; si ahí se cancela, la ventana sigue.
  await dialogos(app, { guardar: null })
  await cerrar()
  await pregunta.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect.poll(async () => (await registroDialogos(app)).guardar.length).toBe(1)
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  // Ahora sí elige: se guarda y la ventana se cierra.
  const ruta = join(dir, 'al-cerrar.kir')
  await dialogos(app, { guardar: ruta })
  await cerrar()
  const salida1 = new Promise((ok) => app.process().once('exit', ok))
  await pregunta.getByRole('button', { name: 'Guardar', exact: true }).click()
  await salida1
  expect(readFileSync(ruta).subarray(0, 2).toString('latin1')).toBe('PK')
  // No guardar: cierra y no deja nada que recuperar.
  const datos2 = carpetaNueva()
  const dos = await abrir({ datos: datos2 })
  await sonda(dos.page, 'cargar', circuitoBase())
  await dos.page.locator('canvas.lienzo-gl').focus()
  await dos.page.keyboard.press('Control+A')
  await dos.page.keyboard.press('Delete')
  await dos.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  const pregunta2 = dos.page.getByRole('dialog', { name: '¿Guardar los cambios?' })
  await expect(pregunta2).toBeVisible()
  const salida2 = new Promise((ok) => dos.app.process().once('exit', ok))
  await pregunta2.getByRole('button', { name: 'No guardar' }).click()
  await salida2
  expect(existsSync(join(datos2, 'recuperacion')) ? readdirSync(join(datos2, 'recuperacion')) : []).toEqual([])
})

test('un archivo de más de 64 MB se rechaza antes de leerlo y el documento no cambia', async () => {
  const datos = carpetaNueva()
  const ruta = join(carpetaTemporal(), 'enorme.kir')
  const fd = openSync(ruta, 'w')
  ftruncateSync(fd, 65 * 2 ** 20)
  closeSync(fd)
  const { app, page } = await abrir({ datos })
  await sonda(page, 'cargar', circuitoBase())
  await dialogos(app, { abrir: ruta })
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+O')
  await verFranja(page, 'Registro')
  await expect(page.locator('.registro')).toContainText('enorme.kir es demasiado grande para ser un circuito')
  expect(Object.keys((await sonda(page, 'doc')).piezas)).toHaveLength(9)
  await app.close()
})

test('un .kir de una versión más nueva se abre en solo lectura y no se guarda encima', async () => {
  const datos = carpetaNueva()
  const dir = carpetaTemporal()
  const ruta = join(dir, 'futuro.kir')
  const doc = { piezas: { r: pieza('r', 'resistencia', 'R1', 0, 0, 0, { valor: '1k' }) }, cables: {}, etiquetas: {}, notas: {}, campoDelFuturo: { x: 1 } }
  escribirKirAjeno(ruta, 99, doc)
  const bytes = readFileSync(ruta)
  const { app, page } = await abrir({ datos })
  await dialogos(app, { abrir: ruta, guardar: join(dir, 'no-debe-pedirse.kir') })
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+O')
  await expect.poll(async () => (await sonda(page, 'archivo')).nombre).toBe('futuro.kir')
  const est = await sonda(page, 'archivo')
  expect(est.soloLectura).toBe(true)
  expect(await page.title()).toBe('futuro.kir (solo lectura) · Kirchi')
  expect(Object.keys((await sonda(page, 'doc')).piezas)).toEqual(['r'])
  // El Registro lo dice (un aviso no abre la franja: se abre su pestaña).
  await verFranja(page, 'Registro')
  await expect(page.locator('.registro')).toContainText('más nueva de Kirchi')
  await captura(page, 'solo-lectura-registro-claro')
  // Guardar y Guardar como están deshabilitados con su pista; el atajo no hace nada y avisa.
  const inicio = page.getByRole('toolbar', { name: 'Inicio', exact: true })
  await expect(inicio.getByRole('button', { name: 'Guardar', exact: true })).toHaveAttribute('aria-disabled', 'true')
  await expect(inicio.getByRole('button', { name: 'Guardar como…' })).toHaveAttribute('aria-disabled', 'true')
  await expect(inicio.getByRole('button', { name: 'Guardar', exact: true })).toHaveAccessibleDescription(/solo lectura/)
  await inicio.getByRole('button', { name: 'Guardar', exact: true }).hover()
  await expect(page.locator('.globo-cinta')).toContainText('solo lectura')
  await captura(page, 'solo-lectura-cinta-claro')
  await page.keyboard.press('Escape')
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+S')
  await verFranja(page, 'Registro')
  await expect(page.locator('.registro')).toContainText('se abrió en solo lectura')
  expect((await registroDialogos(app)).guardar).toEqual([])
  expect(readFileSync(ruta).equals(bytes)).toBe(true)
  await ponerTema(page, 'oscuro')
  await captura(page, 'solo-lectura-registro-oscuro')
  await app.close()
})

test('exportar SVG, PNG y PDF: archivos válidos, a escala, con una sola página del tamaño del dibujo; la ventana del PDF se cierra', async () => {
  const datos = carpetaNueva()
  const dir = carpetaTemporal()
  const { app, page } = await abrir({ datos })
  await sonda(page, 'cargar', circuitoBase())
  await verFranja(page, 'Registro')
  const ventanas = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
  const exportarComo = async (formato: 'SVG' | 'PNG' | 'PDF', nombre: string, alAbrir?: () => Promise<void>) => {
    await dialogos(app, { guardar: join(dir, nombre) })
    // Exportar abre el diálogo directo: el formato se elige adentro.
    await page.getByRole('toolbar', { name: 'Inicio', exact: true }).getByRole('button', { name: 'Exportar', exact: true }).click()
    await page.getByRole('dialog', { name: /^Exportar como/ }).locator('label.casilla-formato', { hasText: formato }).click()
    const dialogo = page.getByRole('dialog', { name: `Exportar como ${formato}` })
    await expect(dialogo).toBeVisible()
    await alAbrir?.()
    await dialogo.getByRole('button', { name: 'Exportar…' }).click()
    await expect.poll(() => existsSync(join(dir, nombre)), { timeout: 20_000 }).toBe(true)
    await verFranja(page, 'Registro')
    await expect(page.locator('.registro')).toContainText(`Se exportó ${nombre}.`)
  }
  await exportarComo('SVG', 'esquema.svg')
  const svg = readFileSync(join(dir, 'esquema.svg'), 'utf8')
  expect(svg).toMatch(/^<\?xml[^>]*\?>\n<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  expect(svg).toContain("@font-face{font-family:'Mona Sans Variable'")
  expect(svg).toContain('>Q1<')
  const mmAncho = Number(/<svg[^>]* width="([\d.]+)mm"/.exec(svg)![1]), mmAlto = Number(/<svg[^>]* height="([\d.]+)mm"/.exec(svg)![1])
  expect(mmAncho).toBeGreaterThan(50)
  expect(mmAlto).toBeGreaterThan(20)
  // El SVG exportado se parsea como XML en un navegador real.
  const parsea = await page.evaluate((s) => new DOMParser().parseFromString(s, 'image/svg+xml').getElementsByTagName('parsererror').length, svg)
  expect(parsea).toBe(0)

  // PNG a 2× (192 ppp): con el diálogo abierto se capturan las opciones.
  await exportarComo('PNG', 'esquema.png', async () => {
    await captura(page, 'dialogo-exportar-png-claro')
    expect(await fallasGraves(page)).toEqual([])
  })
  const png = readFileSync(join(dir, 'esquema.png'))
  const p = leerPng(png)
  const esperadoAncho = Math.floor((mmAncho * 96 * 2) / 25.4), esperadoAlto = Math.floor((mmAlto * 96 * 2) / 25.4)
  expect(Math.abs(p.ancho - esperadoAncho)).toBeLessThanOrEqual(1)
  expect(Math.abs(p.alto - esperadoAlto)).toBeLessThanOrEqual(1)
  expect(p.ppmX).toBe(7559)
  expect(p.ppmY).toBe(7559)
  expect(p.pHYsAntesDeIDAT).toBe(true)
  expect(png.length).toBeGreaterThan(5_000)
  expect(png.length).toBeLessThan(5 * 2 ** 20)

  // PDF con la hoja «Del dibujo» (la opción por omisión): una página y su tamaño es el del dibujo, no carta.
  await exportarComo('PDF', 'esquema.pdf', async () => {
    await captura(page, 'dialogo-exportar-pdf-claro')
    expect(await fallasGraves(page)).toEqual([])
    await expect(page.getByLabel('Hoja')).toHaveValue('ajustar')
  })
  const pdfBytes = readFileSync(join(dir, 'esquema.pdf'))
  const pdf = pdfBytes.toString('latin1')
  expect(pdf.startsWith('%PDF-')).toBe(true)
  expect(pdf).toMatch(/\/FontName \/[A-Z]{6}\+Mona/)
  expect(pdf).toContain('/ToUnicode')
  const hoja = leerPdf(pdfBytes)
  expect(hoja.paginas).toBe(1)
  expect(hoja.cajas).toHaveLength(1)
  const [pw, ph] = hoja.cajas[0]
  console.log(`PDF ajustar: ${pw.toFixed(2)} × ${ph.toFixed(2)} pt; dibujo ${(mmAncho * PT_POR_MM).toFixed(2)} × ${(mmAlto * PT_POR_MM).toFixed(2)} pt (${mmAncho} × ${mmAlto} mm); ${(pdfBytes.length / 1024).toFixed(0)} KB`)
  expect(Math.abs(pw - mmAncho * PT_POR_MM)).toBeLessThan(2)
  expect(Math.abs(ph - mmAlto * PT_POR_MM)).toBeLessThan(2)
  expect(Math.abs(pw - 612)).toBeGreaterThan(20)
  expect(pdfBytes.length).toBeGreaterThan(5_000)
  expect(pdfBytes.length).toBeLessThan(5 * 2 ** 20)
  expect(await ventanas()).toBe(1)

  // PDF en carta: 215.9 × 279.4 mm, horizontal si el dibujo es más ancho que alto.
  await exportarComo('PDF', 'carta.pdf', async () => {
    await page.getByLabel('Hoja').selectOption('carta')
  })
  const carta = leerPdf(readFileSync(join(dir, 'carta.pdf')))
  expect(carta.paginas).toBe(1)
  const [cw, ch] = carta.cajas[0]
  const [lado, corto] = mmAncho > mmAlto ? [279.4, 215.9] : [215.9, 279.4]
  const [ew, eh] = mmAncho > mmAlto ? [lado, corto] : [corto, lado]
  console.log(`PDF carta: ${cw.toFixed(2)} × ${ch.toFixed(2)} pt (esperado ${(ew * PT_POR_MM).toFixed(2)} × ${(eh * PT_POR_MM).toFixed(2)})`)
  expect(Math.abs(cw - ew * PT_POR_MM)).toBeLessThan(2)
  expect(Math.abs(ch - eh * PT_POR_MM)).toBeLessThan(2)
  expect(await ventanas()).toBe(1)
  // Un PDF tras otro sigue funcionando (la ventana oculta no queda trabada) y no quedan temporales de la impresión.
  await exportarComo('PDF', 'otra-vez.pdf')
  expect(readdirSync(tmpdir()).filter((n) => n.startsWith('kirchi-pdf-'))).toEqual([])
  if (CAPTURAS) for (const n of ['esquema.svg', 'esquema.png', 'esquema.pdf', 'carta.pdf']) writeFileSync(join(CAPTURAS, n), readFileSync(join(dir, n)))
  await app.close()
})

test('axe en el diálogo de exportar, en claro y en oscuro', async () => {
  const datos = carpetaNueva()
  const { app, page } = await abrir({ datos })
  await sonda(page, 'cargar', circuitoBase())
  for (const tema of ['claro', 'oscuro'] as const) {
    await ponerTema(page, tema)
    for (const formato of ['PNG', 'PDF'] as const) {
      await page.getByRole('toolbar', { name: 'Inicio', exact: true }).getByRole('button', { name: 'Exportar', exact: true }).click()
      await page.getByRole('dialog', { name: /^Exportar como/ }).locator('label.casilla-formato', { hasText: formato }).click()
      const dialogo = page.getByRole('dialog', { name: `Exportar como ${formato}` })
      await expect(dialogo).toBeVisible()
      expect(await fallasGraves(page)).toEqual([])
      if (tema === 'oscuro') await captura(page, `dialogo-exportar-${formato.toLowerCase()}-oscuro`)
      await page.keyboard.press('Escape')
      await expect(dialogo).toHaveCount(0)
    }
  }
  await app.close()
})

test('Recientes de la cinta en oscuro (captura) y, con el circuito vacío, Exportar deshabilitado', async () => {
  const datos = carpetaNueva()
  const dir = carpetaTemporal()
  const ruta = join(dir, 'practica 3.kir')
  const { app, page } = await abrir({ datos })
  await sonda(page, 'cargar', circuitoBase())
  await dialogos(app, { guardar: ruta })
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+Shift+S')
  await expect.poll(async () => (await sonda(page, 'archivo')).ruta).toBe(ruta)
  await ponerTema(page, 'oscuro')
  await menuDeCinta(page, 'Recientes')
  await expect(page.getByRole('menuitem', { name: 'practica 3.kir' })).toBeVisible()
  await captura(page, 'menu-recientes-oscuro')
  await page.keyboard.press('Escape')
  await sonda(page, 'cargar', { piezas: {}, cables: {}, etiquetas: {}, notas: {} })
  const exportar = page.getByRole('toolbar', { name: 'Inicio', exact: true }).getByRole('button', { name: 'Exportar', exact: true })
  await expect(exportar).toHaveAttribute('aria-disabled', 'true')
  await expect(exportar).toHaveAccessibleDescription('El circuito está vacío: no hay nada que exportar.')
  await app.close()
})
