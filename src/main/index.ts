import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, nativeTheme, net, protocol, screen, session, shell, systemPreferences, webContents } from 'electron'
import { mkdirSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import { aplicarParche, ARG_PRUEBAS, argumentoAjustes, CANAL_GUARDAR_AJUSTES, type Ajustes, type Tema } from '../compartido/ajustes'
import { CANALES } from '../compartido/archivos'
import { CARPETA_PLANTILLAS } from '../compartido/plantillas'
import { planDeVentana } from '../compartido/ventana'
import { guardarAjustes, leerAjustes } from './ajustes'
import { leerBanderas } from './banderas'
import { ControlCierre } from './cierre'
import { planDeApertura, rutaDeAbrirArchivo, rutasDeLanzamiento } from './lanzamiento'
import { abrirCarpeta, dialogosDe, imprimirPdf, registrarArchivos, type Ventana } from './ipcArchivos'
import { registrarGraficas } from './ipcGraficas'
import { instalarPermisos, PermisosGrabacion, registrarGrabacion } from './ipcGrabacion'
import { depsReales, ServicioGrabacion } from './servicioGrabacion'
import { CANAL_AL_MINIMIZAR_GRABACION } from '../compartido/grabacion'
import { registrarNgspice } from './ipcNgspice'
import { ARG_SOLO_GRAFICAS, urlDeGraficas } from '../compartido/graficas'
import { ARG_SOLO_OSC, urlDeOsc } from '../compartido/ventanaOsc'
import { registrarOsc } from './ipcOsc'
import type { ServicioOsc } from './servicioOsc'
import type { ServicioGraficas, VentanaGraficas } from './servicioGraficas'
import { carpetaHerramientas } from './recursos'
import { localizarNgspice } from './servicioNgspice'
import { ServicioArchivos } from './servicioArchivos'
import { plantillaMenu } from './menu'
import { esPropia as origenPropio } from './origen'
import { resolveAppPath } from './resolveAppPath'
import { aplicarTamaño, controlDeTamaño, estadoDeVentanaViva, factorDe, registrarVentana } from './ventana'

const ISOLATION: Record<string, string> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
}

// Empaquetado (el que abren las asociaciones de archivo) las banderas de la línea de órdenes no valen; ver `leerBanderas`.
const banderas = leerBanderas(process.argv, { empaquetado: app.isPackaged })
/** La URL del servidor de desarrollo solo existe sin empaquetar: una variable de entorno no redirige la app instalada. */
const URL_DESARROLLO = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']
/** Una sola instancia por usuario: un segundo doble clic en un `.kir` llega a la primera como `second-instance`. Las pruebas abren varias a la vez y no la toman. */
const primeraInstancia = banderas.pruebas || app.requestSingleInstanceLock()
if (!primeraInstancia) app.quit()
/** `open-file` de macOS que llega antes de `ready`: se abren al crear la primera ventana. */
const porAbrir: string[] = []
// Antes de `ready`: la carpeta de datos decide de dónde salen los ajustes.
if (banderas.datos) {
  try {
    mkdirSync(banderas.datos, { recursive: true })
    app.setPath('userData', banderas.datos)
  } catch (e) {
    console.error(`--datos ignorado: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Fondo de la ventana antes de que pinte la interfaz, igual al lienzo de cada tema. */
const FONDO: Record<Tema, string> = { claro: '#F7F6F2', oscuro: '#17181B' }

let ajustes: Ajustes
/** Ventanas abiertas por el id de su webContents: cada una con su servicio de archivos y su cierre. */
const ventanas = new Map<number, Ventana>()

/** Guarda los ajustes sin tirar el proceso si el disco falla: siguen vigentes en memoria. */
function persistirAjustes(): void {
  try {
    guardarAjustes(app.getPath('userData'), ajustes)
  } catch (e) {
    console.error(`settings.json: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Acercar, alejar y tamaño real (teclas del menú y Vista › Zoom de la página): un solo valor, guardado en los ajustes. */
const cambiarTamaño = controlDeTamaño({
  actual: () => ajustes.tamañoInterfaz,
  poner: (t) => {
    ajustes = { ...ajustes, tamañoInterfaz: t }
    persistirAjustes()
  },
  ventanas: () => [...ventanas.values()].map((v) => v.win)
})

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

function serveRenderer(): void {
  const root = normalize(join(__dirname, '../renderer'))
  protocol.handle('app', async (req) => {
    const r = resolveAppPath(root, req.url)
    if ('status' in r) return new Response('error', { status: r.status })
    try {
      const res = await net.fetch(pathToFileURL(r.file).toString())
      const headers = new Headers(res.headers)
      for (const [k, v] of Object.entries(ISOLATION)) headers.set(k, v)
      if (r.file.endsWith('.wasm')) headers.set('Content-Type', 'application/wasm')
      if (r.file.endsWith('.svg')) headers.set('Content-Type', 'image/svg+xml')
      return new Response(res.body, { status: res.status, headers })
    } catch {
      return new Response('no encontrado', { status: 404 })
    }
  })
}

const LOWER = Object.fromEntries(Object.keys(ISOLATION).map((k) => [k.toLowerCase(), true]))

function isolateDevServer(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Las cabeceras llegan con otra capitalización: se quitan antes de añadirlas,
    // o quedarían duplicadas ("require-corp, require-corp") y el navegador las ignora.
    const responseHeaders = Object.fromEntries(
      Object.entries(details.responseHeaders ?? {}).filter(([k]) => !(k.toLowerCase() in LOWER))
    )
    for (const [k, v] of Object.entries(ISOLATION)) responseHeaders[k] = [v]
    callback({ responseHeaders })
  })
}

/** Páginas propias: las únicas que pueden guardar ajustes. */
const esPropia = (url: string | undefined): boolean => origenPropio(url, URL_DESARROLLO)

/** El tema de los controles nativos (barras de desplazamiento, título de la ventana) sigue al de Kirchi, no al del sistema. */
const ponerTemaNativo = (t: Tema) => {
  nativeTheme.themeSource = t === 'oscuro' ? 'dark' : 'light'
}

/** Documentos del usuario para los diálogos; si el sistema no la da, el diálogo elige. */
function carpetaDocumentos(): string | undefined {
  try {
    return app.getPath('documents')
  } catch {
    return undefined
  }
}

/** Carpeta fija de las plantillas del usuario: Documentos/Kirchi/Plantillas (se crea al primer uso). */
function carpetaPlantillas(): string | undefined {
  // Con `--datos` (las pruebas) la carpeta cuelga de ahí: una prueba nunca escribe en los Documentos del usuario.
  const documentos = banderas.datos ? join(banderas.datos, 'Documentos') : carpetaDocumentos()
  return documentos ? join(documentos, ...CARPETA_PLANTILLAS) : undefined
}

/** El servicio de las ventanas de gráficas (se crea al arrancar). */
let graficas: ServicioGraficas | null = null
/** El servicio de las ventanas del osciloscopio. */
let osciloscopio: ServicioOsc | null = null

/** Ventana de gráficas: misma página con la ruta `#graficas` y el mismo preload, que con `ARG_SOLO_GRAFICAS` expone solo las gráficas. Mismas opciones de seguridad que el editor. */
function crearVentanaGraficas(padre: number): VentanaGraficas {
  return crearVentanaAparte(padre, { titulo: 'Gráficas · Kirchi', argumento: ARG_SOLO_GRAFICAS, url: urlDeGraficas(URL_DESARROLLO ?? 'app://kirchi/index.html'), ancho: 1100, alto: 760, alCerrarElEditor: () => graficas?.cerrarDePadre(padre) })
}

/** La ventana del osciloscopio de un editor: las mismas opciones de seguridad, con la ruta `#osciloscopio`. */
function crearVentanaOsc(padre: number): VentanaGraficas {
  return crearVentanaAparte(padre, { titulo: 'Osciloscopio · Kirchi', argumento: ARG_SOLO_OSC, url: urlDeOsc(URL_DESARROLLO ?? 'app://kirchi/index.html'), ancho: 1180, alto: 720, alCerrarElEditor: () => osciloscopio?.cerrarDePadre(padre) })
}

interface OpcionesVentanaAparte {
  titulo: string
  argumento: string
  url: string
  ancho: number
  alto: number
  alCerrarElEditor(): void
}

function crearVentanaAparte(padre: number, o: OpcionesVentanaAparte): VentanaGraficas {
  const win = new BrowserWindow({
    width: o.ancho,
    height: o.alto,
    minWidth: 640,
    minHeight: 420,
    show: false,
    backgroundColor: FONDO[ajustes.tema],
    title: o.titulo,
    ...(app.isPackaged ? {} : { icon: join(app.getAppPath(), 'build/icon.png') }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      zoomFactor: factorDe(ajustes.tamañoInterfaz),
      additionalArguments: [argumentoAjustes(ajustes), o.argumento, ...(banderas.pruebas ? [ARG_PRUEBAS] : [])]
    }
  })
  win.setMenuBarVisibility(false)
  win.once('ready-to-show', () => win.show())
  win.webContents.on('did-finish-load', () => aplicarTamaño(ajustes.tamañoInterfaz, [win]))
  const id = win.webContents.id
  const cerrarse: (() => void)[] = []
  win.on('closed', () => cerrarse.forEach((f) => f()))
  // Si se cierra el editor que la abrió, ella también.
  const editor = ventanas.get(padre)?.win
  editor?.once('closed', o.alCerrarElEditor)
  win.loadURL(o.url).catch((e) => {
    console.error(e)
    win.show()
  })
  return {
    id,
    isDestroyed: () => win.isDestroyed(),
    focus: () => {
      if (win.isMinimized()) win.restore()
      win.focus()
    },
    enviar: (canal, ...args) => {
      if (!win.isDestroyed()) win.webContents.send(canal, ...args)
    },
    ponerTitulo: (t) => win.setTitle(t),
    alCerrarse: (f) => void cerrarse.push(f),
    cerrar: () => {
      if (!win.isDestroyed()) win.close()
    }
  }
}

/** Ventana nueva. `rutaKir` ya salió de `rutasDeLanzamiento` y la ventana la pide con `inicial`, con las mismas comprobaciones que Abrir. El resto de la línea de órdenes no llega al servicio. */
function createWindow(rutaKir?: string): void {
  // Abre como se cerró la última: rectángulo acotado a una pantalla que exista, maximizada o pantalla completa.
  const plan = planDeVentana(ajustes.ventana, [screen.getPrimaryDisplay(), ...screen.getAllDisplays().filter((d) => d.id !== screen.getPrimaryDisplay().id)].map((d) => ({ x: d.workArea.x, y: d.workArea.y, ancho: d.workArea.width, alto: d.workArea.height })))
  const win = new BrowserWindow({
    ...(plan.x !== undefined && plan.y !== undefined ? { x: plan.x, y: plan.y } : {}),
    width: plan.ancho,
    height: plan.alto,
    minWidth: 800,
    minHeight: 500,
    show: false,
    backgroundColor: FONDO[ajustes.tema],
    title: 'Kirchi',
    // Empaquetada, la ventana toma el icono del ejecutable (build/icon.ico); en desarrollo se le da el PNG.
    ...(app.isPackaged ? {} : { icon: join(app.getAppPath(), 'build/icon.png') }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      zoomFactor: factorDe(ajustes.tamañoInterfaz),
      additionalArguments: [argumentoAjustes(ajustes), ...(banderas.pruebas ? [ARG_PRUEBAS] : [])]
    }
  })
  // La barra del menú propio se oculta: sus aceleradores siguen activos y Alt no la muestra.
  if (process.platform !== 'darwin') win.setMenuBarVisibility(false)
  const servicio = new ServicioArchivos({
    dirDatos: app.getPath('userData'),
    dialogos: dialogosDe(win),
    recientes: () => ajustes.archivosRecientes,
    ponerRecientes: (l) => {
      ajustes = { ...ajustes, archivosRecientes: l }
      persistirAjustes()
    },
    abrirCarpeta,
    carpetas: () => ajustes.carpetas,
    ponerCarpeta: (tipo, carpeta) => {
      if (ajustes.carpetas[tipo] === carpeta) return
      ajustes = { ...ajustes, carpetas: { ...ajustes.carpetas, [tipo]: carpeta } }
      persistirAjustes()
    },
    documentos: carpetaDocumentos(),
    // La única carpeta que no sale de un diálogo: la decide este proceso y la interfaz solo manda categoría y nombre.
    plantillas: carpetaPlantillas(),
    imprimir: imprimirPdf,
    argv: rutaKir ? [process.argv[0], rutaKir] : [process.argv[0]],
    // El diario que no se puede escribir llega a la interfaz (Registro), no solo a la consola.
    avisarErrorDiario: (mensaje) => {
      console.error(`diario: ${mensaje}`)
      if (!win.isDestroyed()) win.webContents.send(CANALES.diarioError, mensaje)
    }
  })
  const id = win.webContents.id
  ventanas.set(id, { win, servicio, cierre: new ControlCierre(win, servicio.sesion) })
  win.on('closed', () => ventanas.delete(id))
  // Minimizar pausa la grabación en curso: el editor lo sabe por este aviso.
  win.on('minimize', () => win.webContents.send(CANAL_AL_MINIMIZAR_GRABACION, true))
  win.on('restore', () => win.webContents.send(CANAL_AL_MINIMIZAR_GRABACION, false))
  // El zoom de Chromium es por origen: se vuelve a poner al cargar, por si otra ventana del editor lo dejó distinto.
  win.webContents.on('did-finish-load', () => aplicarTamaño(ajustes.tamañoInterfaz, [win]))
  win.once('ready-to-show', () => {
    if (plan.maximizada) win.maximize()
    win.show()
    if (plan.pantallaCompleta) win.setFullScreen(true)
  })
  // Al cerrar se anota cómo estaba (antes de que la ventana se destruya); la última en cerrarse manda.
  win.on('close', () => {
    if (win.isDestroyed()) return
    ajustes = { ...ajustes, ventana: estadoDeVentanaViva(win) }
    persistirAjustes()
  })
  if (banderas.devtools) win.webContents.openDevTools({ mode: 'detach' })
  const devUrl = URL_DESARROLLO
  win.loadURL(devUrl ?? 'app://kirchi/index.html').catch((e) => {
    console.error(e)
    win.show()
  })
}

/** La ventana que recibe un `.kir` del sistema: la que tiene el foco o, si no, la primera. */
function ventanaDeDestino(): Ventana | undefined {
  const foco = BrowserWindow.getFocusedWindow()
  const todas = [...ventanas.values()].filter((v) => !v.win.isDestroyed())
  return todas.find((v) => v.win === foco) ?? todas[0]
}

/** Los `.kir` de un segundo lanzamiento o de `open-file`: el primero va a la ventana en uso (que pregunta por cambios sin guardar) y los demás, a ventanas nuevas. */
function abrirDelSistema(rutas: string[]): void {
  const destino = ventanaDeDestino()
  if (destino) {
    if (destino.win.isMinimized()) destino.win.restore()
    destino.win.show()
    destino.win.focus()
  }
  const plan = planDeApertura(rutas, ventanas.size)
  if (plan.enLaVentana) {
    if (destino?.servicio.interfazLista) void destino.servicio.abrirExterno(plan.enLaVentana).then((r) => destino.win.isDestroyed() || destino.win.webContents.send(CANALES.abrirExterno, r))
    else createWindow(plan.enLaVentana)
  } else if (!destino) createWindow()
  for (const r of plan.enNuevas) createWindow(r)
}

app.on('second-instance', (_e, argv, cwd) => abrirDelSistema(rutasDeLanzamiento(argv, cwd)))
app.on('open-file', (e, ruta) => {
  e.preventDefault()
  const rutas = rutaDeAbrirArchivo(ruta)
  if (app.isReady()) abrirDelSistema(rutas)
  else porAbrir.push(...rutas)
})

app.on('web-contents-created', (_e, wc) => {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  wc.on('will-navigate', (ev, url) => {
    if (!esPropia(url)) ev.preventDefault()
  })
})

app.whenReady().then(() => {
  if (!primeraInstancia) return
  serveRenderer()
  ajustes = leerAjustes(app.getPath('userData'))
  // Todo permiso se niega salvo, 5 s después de que el usuario pida grabar, la ventana propia y el micrófono elegido (ipcGrabacion.ts).
  const permisosGrabacion = new PermisosGrabacion({
    ahora: Date.now,
    plataforma: process.platform,
    estadoMedia: (tipo) => (process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus(tipo) : 'granted'),
    esPropia,
    idDe: (x) => {
      if (x === null || typeof x !== 'object') return undefined
      // Un WebFrameMain también tiene `send`, pero no `id`: solo un WebContents lo trae como número.
      if (typeof (x as Electron.WebContents).id === 'number') return (x as Electron.WebContents).id
      return webContents.fromFrame(x as Electron.WebFrameMain)?.id
    },
    idFuenteDeVentana: (id) => {
      const v = ventanas.get(id)
      return v && !v.win.isDestroyed() ? v.win.getMediaSourceId() : undefined
    },
    fuentesDeVentana: async () => (await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } })).map((f) => ({ id: f.id, name: f.name }))
  })
  instalarPermisos(session.defaultSession, permisosGrabacion)
  const servicioGrabacion = new ServicioGrabacion(
    depsReales({
      // Con `--datos` (las pruebas) las grabaciones caen dentro de esa carpeta, nunca en los Videos del usuario.
      videos: () => (banderas.datos ? join(banderas.datos, 'Videos') : app.getPath('videos')),
      carpetaConfigurada: () => ajustes.carpetaGrabaciones,
      dialogoGuardarComo: async (sugerido, carpeta) => {
        const r = await dialog.showSaveDialog({ title: 'Cambiar nombre de la grabación', defaultPath: join(carpeta, sugerido), filters: sugerido.toLowerCase().endsWith('.mp4') ? [{ name: 'Video MP4', extensions: ['mp4'] }] : [{ name: 'Video WebM', extensions: ['webm'] }], properties: ['showOverwriteConfirmation'] })
        return r.canceled || !r.filePath ? null : r.filePath
      }
    })
  )
  registrarGrabacion(ipcMain, {
    servicio: servicioGrabacion,
    permisos: permisosGrabacion,
    esPropia,
    esEditor: (id) => ventanas.has(id),
    abrirRuta: (ruta) => shell.openPath(ruta),
    elegirCarpeta: async (id, inicial) => {
      const win = ventanas.get(id)?.win
      const opciones = { title: 'Carpeta de las grabaciones', defaultPath: inicial, properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[] }
      const r = win ? await dialog.showOpenDialog(win, opciones) : await dialog.showOpenDialog(opciones)
      return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
    },
    fijarCarpeta: (ruta) => {
      const { carpetaGrabaciones: _antes, ...resto } = ajustes
      ajustes = ruta ? { ...resto, carpetaGrabaciones: ruta } : resto
      persistirAjustes()
    }
  })
  ponerTemaNativo(ajustes.tema)
  ipcMain.handle(CANAL_GUARDAR_AJUSTES, (e, parche: unknown) => {
    if (!esPropia(e.senderFrame?.url)) throw new Error('origen no permitido')
    const antes = ajustes.tamañoInterfaz
    ajustes = aplicarParche(ajustes, parche)
    ponerTemaNativo(ajustes.tema)
    persistirAjustes()
    if (ajustes.tamañoInterfaz !== antes) aplicarTamaño(ajustes.tamañoInterfaz, [...ventanas.values()].map((v) => v.win))
    return ajustes
  })
  ipcMain.handle(CANALES.leerAjustes, (e) => {
    if (!esPropia(e.senderFrame?.url)) throw new Error('origen no permitido')
    return ajustes
  })
  // Vista › Ventana de la barra superior: solo del marco principal de una ventana del editor.
  registrarVentana(ipcMain, (id) => ventanas.get(id)?.win, esPropia, cambiarTamaño)
  registrarArchivos((id) => ventanas.get(id), esPropia)
  graficas = registrarGraficas(
    (id) => ventanas.has(id),
    esPropia,
    crearVentanaGraficas,
    (padre, canal, mensaje) => {
      const v = ventanas.get(padre)
      if (!v || v.win.isDestroyed()) return
      v.win.webContents.send(canal, mensaje)
      if (v.win.isMinimized()) v.win.restore()
      v.win.focus()
    }
  )
  osciloscopio = registrarOsc(
    (id) => ventanas.has(id),
    esPropia,
    crearVentanaOsc,
    (padre, canal, mensaje) => {
      const v = ventanas.get(padre)
      if (!v || v.win.isDestroyed()) return
      v.win.webContents.send(canal, mensaje)
    },
    (padre) => {
      const v = ventanas.get(padre)
      if (!v || v.win.isDestroyed()) return
      if (v.win.isMinimized()) v.win.restore()
      v.win.focus()
    }
  )
  // ngspice corre como proceso aparte (BSD y GPL, nunca enlazado); sin el ejecutable en herramientas/ los análisis dicen que no están disponibles.
  const ngspice = registrarNgspice(localizarNgspice({ empaquetado: app.isPackaged, carpetaHerramientas: carpetaHerramientas({ empaquetado: app.isPackaged, resourcesPath: process.resourcesPath, appPath: app.getAppPath() }), appPath: app.getAppPath() }), esPropia, (id) => ventanas.has(id))
  app.on('before-quit', () => ngspice?.cerrar())
  // Playwright cierra con app.quit(): en las pruebas eso no pregunta por los cambios ni borra el diario.
  if (banderas.pruebas) app.on('before-quit', () => ventanas.forEach((v) => v.cierre.salirSinPreguntar()))
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantillaMenu({ mac: process.platform === 'darwin', devtools: banderas.devtools, tamaño: cambiarTamaño })))
  if (URL_DESARROLLO) isolateDevServer()
  // El doble clic que abrió Kirchi: el primer `.kir` en la primera ventana y los demás en las suyas.
  const delArranque = [...rutasDeLanzamiento(process.argv, process.cwd()), ...porAbrir.splice(0)]
  const plan = planDeApertura(delArranque, 0)
  createWindow(plan.enLaVentana ?? undefined)
  for (const r of plan.enNuevas) createWindow(r)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
