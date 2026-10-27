import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { CANAL_ABRIR_ENLACE, CANAL_GUARDAR_AJUSTES, leerArgumentos, type Ajustes, type ApiKirchi } from '../compartido/ajustes'
import { CANALES, type ApiArchivos, type ResultadoAbrir } from '../compartido/archivos'
import { ARG_SOLO_GRAFICAS, CANALES_GRAFICAS as GR, validarDatosGraficas, validarPedidoAcoplar, validarPedidoExportar, type ApiGraficas } from '../compartido/graficas'
import { ARG_SOLO_OSC, CANALES_OSC as OS, validarComandoOsc, validarDatosOsc, type ApiOsciloscopio } from '../compartido/ventanaOsc'
import { CANALES_ASISTENTE as AS, validarEstado, type ApiAsistente, type EstadoAsistente } from '../compartido/asistente'
import { CANAL_AL_MINIMIZAR_GRABACION, CANALES_GRABACION as GB, type ApiGrabacion } from '../compartido/grabacion'
import { CANALES_NGSPICE as NG, type ApiNgspice } from '../compartido/ngspice'
import { CANALES_PLANTILLAS as PL, type ApiPlantillas } from '../compartido/plantillas'
import { CANAL_ORDEN_VENTANA, CANAL_TAMAÑO_INTERFAZ, esOrdenVentana, esTamañoInterfaz } from '../compartido/ventana'
import { apiParaVentana } from './apiParaVentana'
import { abrirSoltadoCon } from './soltado'

// API mínima para la interfaz: los ajustes con que abrió la ventana, guardar un parche y los archivos.
// Ninguna función da acceso al disco: cada una es un mensaje al proceso principal, que valida rutas y tamaños.
const { ajustes, pruebas } = leerArgumentos(process.argv)

const invocar = <T>(canal: string, ...args: unknown[]) => ipcRenderer.invoke(canal, ...args) as Promise<T>

const archivos: ApiArchivos = {
  abrir: () => invocar(CANALES.abrir),
  abrirReciente: (ruta) => invocar(CANALES.abrirReciente, ruta),
  // La página entrega el File soltado; la ruta se saca aquí y la página nunca la nombra.
  abrirSoltado: abrirSoltadoCon((f) => webUtils.getPathForFile(f), (ruta) => invocar<ResultadoAbrir>(CANALES.abrirSoltado, ruta)),
  inicial: () => invocar(CANALES.inicial),
  rutaGuardar: (nombre) => invocar(CANALES.rutaGuardar, nombre),
  guardar: (ruta, bytes) => invocar(CANALES.guardar, ruta, bytes),
  olvidarRecientes: () => invocar(CANALES.olvidarRecientes),
  abrirRespaldos: () => invocar(CANALES.abrirRespaldos),
  rutaExportar: (formato, nombre) => invocar(CANALES.rutaExportar, formato, nombre),
  escribirExportacion: (ruta, bytes) => invocar(CANALES.escribirExportacion, ruta, bytes),
  pdf: (ruta, svg, pagina) => invocar(CANALES.pdf, ruta, svg, pagina),
  // El diario va por `send`: llega en orden y sin esperar respuesta, también al cerrar la ventana.
  diarioBase: (bytes, base) => ipcRenderer.send(CANALES.diarioBase, bytes, base),
  diarioAnotar: (renglon) => ipcRenderer.send(CANALES.diarioAnotar, renglon),
  recuperables: () => invocar(CANALES.recuperables),
  recuperar: (id) => invocar(CANALES.recuperar, id),
  descartar: (id) => invocar(CANALES.descartar, id),
  estadoVentana: (e) => ipcRenderer.send(CANALES.estadoVentana, e),
  alPedirCerrar: (f) => {
    const oyente = () => f()
    ipcRenderer.on(CANALES.pideCerrar, oyente)
    return () => ipcRenderer.removeListener(CANALES.pideCerrar, oyente)
  },
  cerrar: (descartar) => ipcRenderer.send(CANALES.cerrar, descartar),
  alErrorDiario: (f) => {
    const oyente = (_e: unknown, mensaje: unknown) => f(typeof mensaje === 'string' ? mensaje : 'No se pudo escribir la copia de seguridad automática.')
    ipcRenderer.on(CANALES.diarioError, oyente)
    return () => ipcRenderer.removeListener(CANALES.diarioError, oyente)
  },
  alAbrirExterno: (f) => {
    // Solo llega del proceso principal; aun así se exige la forma de un ResultadoAbrir.
    const oyente = (_e: unknown, r: unknown) => {
      if (typeof r === 'object' && r !== null && typeof (r as { ok?: unknown }).ok === 'boolean') f(r as ResultadoAbrir)
    }
    ipcRenderer.on(CANALES.abrirExterno, oyente)
    return () => ipcRenderer.removeListener(CANALES.abrirExterno, oyente)
  },
  alCambioEnDisco: (f) => {
    const oyente = (_e: unknown, nombre: unknown) => f(typeof nombre === 'string' ? nombre.slice(0, 255) : '')
    ipcRenderer.on(CANALES.cambioEnDisco, oyente)
    return () => ipcRenderer.removeListener(CANALES.cambioEnDisco, oyente)
  },
  recargar: () => invocar(CANALES.recargar)
}

const plantillas: ApiPlantillas = {
  listar: () => invocar(PL.listar),
  leer: (categoria, nombre) => invocar(PL.leer, categoria, nombre),
  guardar: (categoria, nombre, bytes, reemplazar) => invocar(PL.guardar, categoria, nombre, bytes, reemplazar),
  renombrar: (categoria, nombre, nuevo) => invocar(PL.renombrar, categoria, nombre, nuevo),
  mover: (categoria, nombre, nueva) => invocar(PL.mover, categoria, nombre, nueva),
  borrar: (categoria, nombre) => invocar(PL.borrar, categoria, nombre),
  borrarCategoria: (categoria, confirmada) => invocar(PL.borrarCategoria, categoria, confirmada),
  mostrar: (categoria) => invocar(PL.mostrar, categoria)
}

// Solo «corre esta petición de análisis» (datos) y «cancela»: ni líneas de órdenes ni rutas.
const ngspice: ApiNgspice = {
  ejecutar: (peticion) => invocar(NG.ejecutar, peticion),
  cancelar: () => invocar(NG.cancelar)
}

// Las gráficas aparte: datos estructurados que el proceso principal revisa; lo que llega de vuelta se revisa también aquí.
const graficas: ApiGraficas = {
  abrir: (datos) => invocar(GR.abrir, datos),
  actualizar: (datos) => invocar(GR.actualizar, datos),
  pedir: async () => validarDatosGraficas(await invocar(GR.pedir)),
  alDatos: (f) => {
    const oyente = (_e: unknown, d: unknown) => {
      const v = validarDatosGraficas(d)
      if (v) f(v)
    }
    ipcRenderer.on(GR.datos, oyente)
    return () => ipcRenderer.removeListener(GR.datos, oyente)
  },
  exportar: (p) => ipcRenderer.send(GR.exportar, p),
  alExportar: (f) => {
    const oyente = (_e: unknown, p: unknown) => {
      const v = validarPedidoExportar(p)
      if (v) f(v)
    }
    ipcRenderer.on(GR.alExportar, oyente)
    return () => ipcRenderer.removeListener(GR.alExportar, oyente)
  },
  acoplar: (n) => ipcRenderer.send(GR.acoplar, { n }),
  alAcoplar: (f) => {
    const oyente = (_e: unknown, p: unknown) => {
      const v = validarPedidoAcoplar(p)
      if (v) f(v.n)
    }
    ipcRenderer.on(GR.alAcoplar, oyente)
    return () => ipcRenderer.removeListener(GR.alAcoplar, oyente)
  }
}

// El osciloscopio aparte: datos estructurados que el proceso principal revisa; lo que llega de vuelta se revisa aquí también.
const escuchar = <T>(canal: string, revisar: (x: unknown) => T | null, f: (x: T) => void): (() => void) => {
  const oyente = (_e: unknown, x: unknown) => {
    const v = revisar(x)
    if (v) f(v)
  }
  ipcRenderer.on(canal, oyente)
  return () => ipcRenderer.removeListener(canal, oyente)
}
const osciloscopio: ApiOsciloscopio = {
  abrir: (datos) => invocar(OS.abrir, datos),
  actualizar: (datos) => invocar(OS.actualizar, datos),
  pedir: async () => validarDatosOsc(await invocar(OS.pedir)),
  alDatos: (f) => escuchar(OS.datos, validarDatosOsc, f),
  comando: (c) => ipcRenderer.send(OS.comando, c),
  alComando: (f) => escuchar(OS.alComando, validarComandoOsc, f),
  acoplar: () => ipcRenderer.send(OS.acoplar),
  cerrar: () => invocar(OS.cerrar),
  alAcoplar: (f) => escuchar(OS.alAcoplar, () => true, () => f()),
  alCerrar: (f) => escuchar(OS.alCerrar, () => true, () => f())
}

const grabacion: ApiGrabacion = {
  pedir: (opciones) => invocar(GB.pedir, opciones),
  guardar: (datos) => invocar(GB.guardar, datos),
  renombrar: (ruta) => invocar(GB.renombrar, ruta),
  abrirCarpeta: () => invocar(GB.abrirCarpeta),
  cambiarCarpeta: () => invocar(GB.cambiarCarpeta),
  restablecerCarpeta: () => invocar(GB.restablecerCarpeta),
  alMinimizar: (f) => {
    const oyente = (_e: unknown, m: unknown) => f(m === true)
    ipcRenderer.on(CANAL_AL_MINIMIZAR_GRABACION, oyente)
    return () => ipcRenderer.removeListener(CANAL_AL_MINIMIZAR_GRABACION, oyente)
  }
}

// El asistente: el estado que revisa el proceso principal y las peticiones del puente. Una petición solo se entrega con su forma
// correcta; la ventana contesta por `responder`, y el proceso principal comprueba de quién viene.
const asistente: ApiAsistente = {
  estado: async () => validarEstado(await invocar(AS.estado)) ?? { activo: false, conectado: null },
  alEstado: (f) => escuchar<EstadoAsistente>(AS.alEstado, validarEstado, f),
  activar: async (activo) => validarEstado(await invocar(AS.activar, activo === true)) ?? { activo: false, conectado: null },
  cambiarCarpeta: async () => {
    const r = await invocar<unknown>(AS.cambiarCarpeta)
    return typeof r === 'string' && r.length > 0 ? r : null
  },
  restablecerCarpeta: () => invocar(AS.restablecerCarpeta),
  desconectar: () => invocar(AS.desconectar),
  textoConfiguracion: async () => String(await invocar(AS.textoConfiguracion)),
  alPeticion: (f) =>
    escuchar(
      AS.peticion,
      (x) => (typeof x === 'object' && x !== null && Number.isSafeInteger((x as { id?: unknown }).id) && typeof (x as { tipo?: unknown }).tipo === 'string' ? (x as { id: number; tipo: string; datos: unknown }) : null),
      f
    ),
  responder: (id, respuesta) => ipcRenderer.send(AS.respuesta, id, respuesta)
}

// Las ventanas aparte solo muestran datos: el proceso principal las abre con `ARG_SOLO_GRAFICAS` o `ARG_SOLO_OSC` y no se les expone ngspice, archivos ni plantillas.
const soloGraficas = process.argv.includes(ARG_SOLO_GRAFICAS) || process.argv.includes(ARG_SOLO_OSC)

const api: ApiKirchi = apiParaVentana(soloGraficas, {
  ajustes,
  pruebas,
  guardarAjustes: (parche) => ipcRenderer.invoke(CANAL_GUARDAR_AJUSTES, parche) as Promise<Ajustes>,
  leerAjustes: () => invocar(CANALES.leerAjustes),
  abrirEnlace: (url) => invocar<boolean>(CANAL_ABRIR_ENLACE, url),
  archivos,
  plantillas,
  ngspice,
  graficas,
  osciloscopio,
  grabacion,
  asistente,
  // Por `send`: la orden no espera respuesta. Se revisa aquí y otra vez en el proceso principal, que descarta lo que no
  // esté en su lista.
  ventana: (orden) => {
    if (esOrdenVentana(orden)) ipcRenderer.send(CANAL_ORDEN_VENTANA, orden)
  },
  // El tamaño de la interfaz lo decide y lo aplica el proceso principal; la página solo escucha el valor vigente.
  alTamañoInterfaz: (f) => {
    const oyente = (_e: unknown, t: unknown) => {
      if (esTamañoInterfaz(t)) f(t)
    }
    ipcRenderer.on(CANAL_TAMAÑO_INTERFAZ, oyente)
    return () => ipcRenderer.removeListener(CANAL_TAMAÑO_INTERFAZ, oyente)
  }
})

contextBridge.exposeInMainWorld('kirchi', api)
