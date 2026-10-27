import { esRutaKir, NOMBRE_NUEVO, nombreDeRuta, type ApiArchivos, type ArchivoLeido, type Recuperable, type ResultadoAbrir } from '../../../compartido/archivos'
import { documentoVacio, type Documento } from '../doc/tipos'
import type { Historial } from '../doc/historial'
import { recuperar, type Diario } from './diario'
import { escribirKir, leerKir } from './kir'
import { faltantesDe } from './requisitos'
import type { PiezaDef } from '../piezas/tipos'

/** El archivo del documento abierto. */
export interface EstadoArchivo {
  /** null mientras no se haya guardado nunca. */
  ruta: string | null
  nombre: string
  soloLectura: boolean
}

export const estadoNuevo = (): EstadoArchivo => ({ ruta: null, nombre: NOMBRE_NUEVO, soloLectura: false })

/** Título de la ventana: el asterisco marca cambios sin guardar. */
export function tituloVentana(e: EstadoArchivo, sucio: boolean): string {
  return `${e.nombre}${sucio ? ' *' : ''}${e.soloLectura ? ' (solo lectura)' : ''} · Kirchi`
}

const dos = (n: number) => String(n).padStart(2, '0')
/** «13/10/2026 a las 14:32», para decir hasta cuándo llegan los cambios que se pueden recuperar. */
export function textoFecha(ms: number): string {
  const d = new Date(ms)
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} a las ${dos(d.getHours())}:${dos(d.getMinutes())}`
}

export type Respuesta = 'guardar' | 'descartar' | 'cancelar'
export type RespuestaRecuperar = 'recuperar' | 'descartar' | 'despues'

export const MENSAJE_SIN_ARCHIVOS = 'Esta ventana no puede abrir ni guardar archivos: Kirchi corre sin su proceso principal.'

/** Lo que el control usa del editor (el real o uno de prueba). */
export interface EditorArchivo {
  readonly doc: Documento
  readonly historial: Historial
  cargar(doc: Documento, opciones?: { sucio?: boolean; soloLectura?: boolean }): void
  /** Marca del estado para `marcarGuardado`; cierra antes el paso abierto (`Editor.marca`). */
  marca(): unknown
  marcarGuardado(marca?: unknown): void
}

export interface InterfazArchivo {
  /** «¿Guardar los cambios de X?»: Guardar, No guardar o Cancelar. */
  preguntarGuardar(nombre: string): Promise<Respuesta>
  /** «Kirchi se cerró sin guardar X»: Recuperar, Descartar o Decidir después. */
  ofrecerRecuperar(r: Recuperable): Promise<RespuestaRecuperar>
  /** Mensaje al Registro: un aviso, o una nota informativa con `info` (se recuperó un archivo). */
  registrar(texto: string, nivel?: 'aviso' | 'info'): void
  /** Error que el usuario tiene que ver: al Registro, y la franja se abre en él. */
  error(texto: string): void
  /** Solo para lectores de pantalla («Se guardó practica-3.kir.»). */
  anunciar(texto: string): void
  /** Se cargó un documento: encuadrar. */
  cargado(): void
  recientes(l: string[]): void
  estado(e: EstadoArchivo): void
  /** Algo ocurrió de verdad en el disco o el documento (guardar, nuevo, abrir reciente). Lo escucha el tutorial para
   * cumplir sus pasos. */
  hecho?(e: 'guardado' | 'nuevo' | 'reciente'): void
}

export interface DependenciasArchivo {
  api: ApiArchivos | undefined
  editor: EditorArchivo
  diario: Diario
  version: string
  ui: InterfazArchivo
  /** La librería cargada: con ella el aviso de lo que el archivo usa y falta. */
  lib?: Map<string, PiezaDef>
}

/** Toda operación que reemplaza el documento pregunta antes si hay cambios sin guardar. El disco solo se toca por `api`. */
export class ControlArchivo {
  private e: EstadoArchivo = estadoNuevo()
  /** Hay una operación en curso (un diálogo abierto): otra petición igual no se encima. */
  private ocupado = false

  constructor(private d: DependenciasArchivo) {}

  get estado(): EstadoArchivo {
    return this.e
  }

  private poner(e: EstadoArchivo): void {
    this.e = e
    this.d.ui.estado(e)
  }

  private sinApi(): boolean {
    if (this.d.api) return false
    this.d.ui.error(MENSAJE_SIN_ARCHIVOS)
    return true
  }

  /** Una operación a la vez: mientras hay un diálogo abierto, Ctrl+S o Ctrl+O no abren otro. */
  private async una<T>(f: () => Promise<T>, siOcupado: T): Promise<T> {
    if (this.ocupado) return siOcupado
    this.ocupado = true
    try {
      return await f()
    } finally {
      this.ocupado = false
    }
  }

  private nuevaBase(bytes: Uint8Array, sucio: boolean): void {
    this.d.diario.reiniciar()
    this.d.api?.diarioBase(bytes, { ruta: this.e.ruta, nombre: this.e.nombre, sucio })
  }

  /** Al abrir la ventana: la base del diario, el archivo de la línea de órdenes y lo que haya que recuperar. */
  async iniciar(): Promise<void> {
    const api = this.d.api
    if (!api) return
    this.nuevaBase(escribirKir(this.d.editor.doc, this.d.version), false)
    const inicial = await api.inicial()
    if (inicial) await this.resultado(inicial, false)
    for (const r of (await api.recuperables()).slice(0, 1)) await this.ofrecer(r)
  }

  /** Si hay cambios sin guardar, pregunta; true si se puede seguir (se guardó o se descartó). */
  private async puedeReemplazar(): Promise<boolean> {
    if (!this.d.editor.historial.sinGuardar) return true
    const r = await this.d.ui.preguntarGuardar(this.e.nombre)
    if (r === 'cancelar') return false
    return r === 'descartar' || (await this.guardarAhora())
  }

  nuevo(): Promise<void> {
    return this.una(async () => {
      if (!(await this.puedeReemplazar())) return
      this.d.editor.cargar(documentoVacio())
      this.poner(estadoNuevo())
      this.nuevaBase(escribirKir(this.d.editor.doc, this.d.version), false)
      this.d.ui.cargado()
      this.d.ui.hecho?.('nuevo')
    }, undefined)
  }

  /** Circuito empaquetado con la aplicación: reemplaza el documento como Nuevo y queda sin ruta. true si quedó cargado. */
  abrirEmpaquetado(doc: Documento): Promise<boolean> {
    return this.una(async () => {
      if (!(await this.puedeReemplazar())) return false
      this.d.editor.cargar(doc)
      this.poner(estadoNuevo())
      this.nuevaBase(escribirKir(this.d.editor.doc, this.d.version), false)
      this.d.ui.cargado()
      return true
    }, false)
  }

  abrir(): Promise<void> {
    return this.una(async () => {
      if (this.sinApi()) return
      await this.resultado(await this.d.api!.abrir(), true)
    }, undefined)
  }

  /** Un `.kir` que abrió el sistema con la ventana ya abierta: pregunta por cambios sin guardar y, sin otra operación en
   * curso, lo carga. */
  abrirExterno(r: ResultadoAbrir): Promise<void> {
    return this.una(async () => {
      await this.resultado(r, true)
    }, undefined)
  }

  /** El archivo abierto cambió en el disco y el usuario eligió Recargar: se lee de nuevo sin preguntar, porque ya decidió. */
  recargar(): Promise<boolean> {
    return this.una(async () => {
      const api = this.d.api
      if (!api?.recargar) return false
      const r = await api.recargar()
      if (!r.ok) {
        if ('error' in r) this.d.ui.error(r.error)
        return false
      }
      return this.cargarLeido(r.archivo)
    }, false)
  }

  /** Un archivo de Recientes: el proceso principal solo lo abre si su ruta está en la lista. */
  abrirReciente(ruta: string): Promise<void> {
    return this.una(async () => {
      if (this.sinApi()) return
      if (await this.resultado(await this.d.api!.abrirReciente(ruta), true)) this.d.ui.hecho?.('reciente')
    }, undefined)
  }

  /** Archivos soltados en la ventana: se abre el primer `.kir`; si no hay ninguno, se dice. */
  soltar(archivos: readonly File[]): Promise<void> {
    if (this.sinApi()) return Promise.resolve()
    const kir = archivos.find((f) => esRutaKir(f.name))
    if (!kir) {
      if (archivos.length) this.d.ui.error(`Solo se abren circuitos .kir; se ignoró ${archivos[0].name}.`)
      return Promise.resolve()
    }
    // Se entrega el File: el preload saca la ruta y la página nunca la nombra (null: no tiene ruta).
    return this.una(async () => {
      const r = await this.d.api!.abrirSoltado(kir)
      if (!r) this.d.ui.error(`No se pudo abrir ${kir.name}: no viene de una carpeta del equipo.`)
      else await this.resultado(r, true)
    }, undefined)
  }

  /** true si el archivo quedó cargado. */
  private async resultado(r: ResultadoAbrir, preguntar: boolean): Promise<boolean> {
    if (!r.ok) {
      if ('error' in r) {
        this.d.ui.error(r.error)
        this.d.ui.recientes(r.recientes)
      }
      return false
    }
    this.d.ui.recientes(r.recientes)
    if (preguntar && !(await this.puedeReemplazar())) return false
    return this.cargarLeido(r.archivo)
  }

  private cargarLeido(a: ArchivoLeido): boolean {
    const l = leerKir(a.bytes)
    if (!l.ok) {
      this.d.ui.error(`No se pudo abrir ${a.nombre}: ${l.error.charAt(0).toLowerCase()}${l.error.slice(1)}`)
      return false
    }
    this.d.editor.cargar(l.doc, { soloLectura: l.soloLectura })
    this.poner({ ruta: a.ruta, nombre: a.nombre, soloLectura: l.soloLectura })
    this.nuevaBase(a.bytes, false)
    for (const aviso of l.avisos) this.d.ui.registrar(aviso)
    const falta = this.d.lib ? faltantesDe(l.requiere, this.d.lib, l.doc).aviso : null
    if (falta) this.d.ui.registrar(falta)
    this.d.ui.cargado()
    return true
  }

  guardar(): Promise<boolean> {
    return this.una(() => this.guardarAhora(), false)
  }

  guardarComo(): Promise<boolean> {
    return this.una(() => this.guardarAhora(true), false)
  }

  /** Guarda en la ruta del archivo, o pide una (Guardar como, o si nunca se guardó). true si quedó guardado. */
  private async guardarAhora(pedirRuta = false): Promise<boolean> {
    if (this.sinApi()) return false
    if (this.e.soloLectura) {
      this.d.ui.error(`${this.e.nombre} se abrió en solo lectura: es de una versión más nueva de Kirchi y guardarlo aquí perdería lo que esta versión no entiende.`)
      return false
    }
    const api = this.d.api!
    let ruta = this.e.ruta
    if (pedirRuta || !ruta) {
      ruta = await api.rutaGuardar(this.e.ruta ?? this.e.nombre)
      if (!ruta) return false
    }
    // Lo pendiente del diario se escribe antes: si guardar falla, el diario sigue completo.
    this.d.diario.vaciar()
    const marca = this.d.editor.marca()
    const bytes = escribirKir(this.d.editor.doc, this.d.version)
    const r = await api.guardar(ruta, bytes)
    if (!r.ok) {
      this.d.ui.error(r.error)
      return false
    }
    this.d.diario.guardado()
    this.poner({ ruta, nombre: nombreDeRuta(ruta), soloLectura: false })
    this.d.editor.marcarGuardado(marca)
    this.d.ui.recientes(r.recientes)
    this.d.ui.anunciar(`Se guardó ${nombreDeRuta(ruta)}.`)
    this.d.ui.hecho?.('guardado')
    return true
  }

  /** El proceso principal avisa que el usuario quiere cerrar con cambios sin guardar. */
  pedirCerrar(): Promise<void> {
    return this.una(async () => {
      const api = this.d.api
      if (!api) return
      if (!this.d.editor.historial.sinGuardar) {
        api.cerrar(false)
        return
      }
      const r = await this.d.ui.preguntarGuardar(this.e.nombre)
      if (r === 'cancelar') return
      if (r === 'descartar') {
        api.cerrar(true)
        return
      }
      if (await this.guardarAhora()) api.cerrar(false)
    }, undefined)
  }

  private async ofrecer(r: Recuperable): Promise<void> {
    const api = this.d.api!
    const que = await this.d.ui.ofrecerRecuperar(r)
    if (que === 'despues') return
    if (que === 'descartar') {
      await api.descartar(r.id)
      return
    }
    if (!(await this.puedeReemplazar())) return
    const datos = await api.recuperar(r.id)
    const rec = datos ? recuperar(datos.base, datos.diario) : null
    if (!datos || !rec?.ok) {
      const motivo = rec && !rec.ok ? rec.error : 'Sus datos ya no están.'
      this.d.ui.error(`No se pudo recuperar ${r.nombre}: ${motivo.charAt(0).toLowerCase()}${motivo.slice(1)}`)
      return
    }
    this.d.editor.cargar(rec.doc, { sucio: true, soloLectura: rec.soloLectura })
    this.poner({ ruta: datos.ruta, nombre: datos.nombre, soloLectura: rec.soloLectura })
    // La base nueva es lo recuperado, que no está guardado en ningún archivo.
    this.nuevaBase(escribirKir(rec.doc, this.d.version), true)
    await api.descartar(r.id)
    for (const aviso of rec.avisos) this.d.ui.registrar(aviso)
    this.d.ui.registrar(`Se recuperó ${datos.nombre} con los cambios sin guardar; guárdalo para conservarlos.`, 'info')
    this.d.ui.cargado()
  }
}
