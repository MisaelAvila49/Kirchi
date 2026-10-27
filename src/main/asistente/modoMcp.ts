import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { app } from 'electron'
import { limpiarCliente } from '../../compartido/asistente'
import { CARPETA_PLANTILLAS } from '../../compartido/plantillas'
import { carpetaHerramientas } from '../recursos'
import { localizarNgspice, ServicioNgspice } from '../servicioNgspice'
import { lectorDeAjustes } from './ajustes'
import { CARPETA_ASISTENTE } from './carpeta'
import { imprimirPdf } from '../ipcArchivos'
import { htmlParaPdf } from '../pdf'
import { Herramientas } from './herramientas'
import { libreriaSinVentana } from './libreria'
import { plantillasDeUsuario } from './plantillasUsuario'
import { PuenteVentana } from './puenteVentana'
import { rasterizarPng } from './rasterizador'
import { crearRegistroPuente } from './registroPuente'
import { crearServidor } from './servidor'

/** Segundos que se esperan al cerrar ngspice antes de salir a la fuerza. */
const ESPERA_SALIDA_MS = 2000
const ARCHIVO_MOTOR = 'kirchi_engine_bg.wasm'

/** El motor junto al código del proceso principal (Vite puede dejar este módulo en una subcarpeta). */
function bytesDelMotor(): Uint8Array {
  for (const base of [__dirname, join(__dirname, '..')]) {
    const ruta = join(base, ARCHIVO_MOTOR)
    if (existsSync(ruta)) return new Uint8Array(readFileSync(ruta))
  }
  throw new Error('No se encontró el motor de simulación.')
}

/** La entrada estándar. En Windows el `process.stdin` de Electron termina de inmediato, así que se lee el descriptor 0. */
function entradaEstandar(): NodeJS.ReadableStream {
  return process.platform === 'win32' ? createReadStream(null as unknown as string, { fd: 0, autoClose: false }) : process.stdin
}

/**
 * El puente del asistente: un Electron sin ventanas que habla MCP por la entrada y salida estándar. Todo lo que no sea
 * protocolo va a la salida de error, porque un byte ajeno en la salida estándar rompe al cliente. Sale al cerrarse la entrada.
 */
export async function iniciarModoMcp(opciones: { datos: string | null }): Promise<void> {
  const aError = (...a: unknown[]) => console.error(...a)
  console.log = aError
  console.info = aError
  if (opciones.datos) app.setPath('userData', opciones.datos)
  app.disableHardwareAcceleration()
  app.dock?.hide()
  // Sin ventanas, cerrar la ventana oculta de una imagen no debe cerrar la aplicación.
  app.on('window-all-closed', () => {})
  await app.whenReady()

  const dirDatos = app.getPath('userData')
  const registro = crearRegistroPuente(dirDatos)
  registro.anotar(`arranque: Kirchi ${app.getVersion()}${app.isPackaged ? '' : ' (desarrollo)'}, ${process.platform}, datos ${dirDatos}`)
  // Una falla suelta no debe cerrar la conexión: queda en el registro y el puente sigue atendiendo.
  process.on('uncaughtException', (e) => registro.error('excepción no atrapada', e))
  process.on('unhandledRejection', (e) => registro.error('promesa rechazada sin atender', e))
  const documentos = opciones.datos ? join(opciones.datos, 'Documentos') : app.getPath('documents')
  const appPath = app.getAppPath()
  const ejecutable = localizarNgspice({ empaquetado: app.isPackaged, carpetaHerramientas: carpetaHerramientas({ empaquetado: app.isPackaged, resourcesPath: process.resourcesPath, appPath }), appPath })
  const ngspice = ejecutable ? new ServicioNgspice({ ejecutable }) : null
  // El nombre del cliente llega con su `initialize`: el puente se une a la ventana al presentarse el cliente.
  let servidor: ReturnType<typeof crearServidor> | null = null
  const puente = new PuenteVentana(dirDatos, () => limpiarCliente(servidor?.server.getClientVersion()?.name))
  puente.alCambiar = (unido, motivo) => registro.anotar(unido ? 'unido a la ventana de Kirchi' : `sin ventana: ${motivo ?? ''}`)
  puente.alRechazar = (motivo) => registro.anotar(`la ventana no aceptó la unión: ${motivo}`)
  let ultimoMotivo = ''
  const ajustes = lectorDeAjustes(dirDatos, {
    alFallar: (m) => {
      if (m !== ultimoMotivo) registro.anotar(`ajustes: ${m}`)
      ultimoMotivo = m
    }
  })
  const herramientas = new Herramientas({
    lib: libreriaSinVentana(),
    wasm: bytesDelMotor(),
    version: app.getVersion(),
    dirDatos,
    carpetaPorOmision: join(documentos, ...CARPETA_ASISTENTE),
    ajustes,
    analisis: async (peticion) => (ngspice ? ngspice.ejecutar(0, peticion) : { ok: false, error: 'ngspice no está instalado con Kirchi: los análisis no están disponibles.' }),
    rasterizar: rasterizarPng,
    pdf: (svg, anchoMm, altoMm) => imprimirPdf(htmlParaPdf(svg, { tipo: 'ajustar', anchoMm, altoMm })),
    plantillas: plantillasDeUsuario(join(documentos, ...CARPETA_PLANTILLAS)),
    ventana: () => puente.obtener(),
    registro
  })

  const entrada = entradaEstandar()
  const transporte = new StdioServerTransport(entrada as NodeJS.ReadableStream & import('node:stream').Readable, process.stdout)
  // Electron escribe un salto de línea al arrancar y un cliente puede mandar líneas vacías: no son fallas del protocolo.
  transporte.onerror = (e) => {
    if (!/^\s*$/.test(e.message) && !/Unexpected end of JSON|Unexpected token/.test(e.message)) {
      aError(`mcp: ${e.message}`)
      registro.error('transporte', e)
    }
  }

  let saliendo = false
  const salir = (motivo: string) => {
    if (saliendo) return
    saliendo = true
    registro.anotar(`salida: ${motivo}`)
    ngspice?.cancelar(0)
    herramientas.cerrar()
    puente.cerrar()
    const forzar = setTimeout(() => app.exit(0), ESPERA_SALIDA_MS)
    forzar.unref()
    app.exit(0)
  }
  // Nadie más cierra el puente: un cierre que no venga de aquí queda anotado y se ignora.
  app.on('before-quit', (e) => {
    if (saliendo) return
    e.preventDefault()
    registro.anotar('se pidió cerrar la aplicación sin que el cliente cerrara la entrada; se ignora')
  })
  entrada.on('end', () => salir('la entrada estándar terminó'))
  entrada.on('close', () => salir('la entrada estándar se cerró'))
  entrada.on('error', (e) => {
    registro.error('entrada estándar', e)
    salir('error en la entrada estándar')
  })
  transporte.onclose = () => salir('el transporte se cerró')
  process.stdout.on('error', (e) => {
    registro.error('salida estándar', e)
    salir('error en la salida estándar')
  })

  servidor = crearServidor(herramientas, app.getVersion(), { registro })
  servidor.server.oninitialized = () => {
    registro.anotar(`cliente: ${limpiarCliente(servidor?.server.getClientVersion()?.name)}`)
    puente.vigilar()
  }
  await servidor.connect(transporte)
}
