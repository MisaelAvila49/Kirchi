import { describe, expect, it, vi } from 'vitest'
import { grabacionPorOmision, type OpcionesGrabacion } from '../compartido/ajustes'
import { CANALES_GRABACION as CG } from '../compartido/grabacion'
import {
  AVISO_MICROFONO_DENEGADO,
  AVISO_PANTALLA_DENEGADA,
  instalarPermisos,
  PermisosGrabacion,
  registrarGrabacion,
  validarOpciones,
  VENTANA_PERMISOS_MS,
  type DepsIpcGrabacion,
  type DepsPermisos
} from './ipcGrabacion'

vi.mock('./cabeceraWebm', () => ({ escribirDuracion: (b: Uint8Array, ms: number) => Uint8Array.from([...b, ms % 256]) }))

const URL_PROPIA = 'app://kirchi/index.html'
const MARCO = { url: URL_PROPIA }
const WC = { id: 7 }
const conMic: OpcionesGrabacion = { ...grabacionPorOmision(), microfono: 'mic-1' }
const sinMic = grabacionPorOmision()

function montar(o: { plataforma?: string; estados?: Record<string, string>; fuentes?: string[] } = {}) {
  let t = 1000
  const deps: DepsPermisos = {
    ahora: () => t,
    plataforma: o.plataforma ?? 'win32',
    estadoMedia: (tipo) => (o.estados?.[tipo] ?? 'granted') as never,
    esPropia: (u) => u === URL_PROPIA,
    idDe: (x) => (x === WC || x === MARCO ? 7 : undefined),
    idFuenteDeVentana: (id) => (id === 7 ? 'window:77:0' : undefined),
    fuentesDeVentana: async () => (o.fuentes ?? ['window:12:0', 'window:77:0', 'screen:0:0']).map((id) => ({ id, name: id }))
  }
  return { permisos: new PermisosGrabacion(deps), avanzar: (ms: number) => void (t += ms) }
}
const detallesAudio = { requestingUrl: URL_PROPIA, mediaTypes: ['audio'] }

describe('permisos de la sesión', () => {
  it('sin pedido todo se niega', async () => {
    const { permisos } = montar()
    expect(permisos.permiso(WC, 'media', detallesAudio)).toBe(false)
    expect(permisos.permiso(WC, 'geolocation', {})).toBe(false)
    expect(await permisos.pantalla({ frame: MARCO })).toBeNull()
  })

  it('instalarPermisos: el controlador responde false y la captura sin pedido va vacía', async () => {
    const { permisos } = montar()
    let pedirPermiso!: (wc: unknown, p: string, cb: (b: boolean) => void, d: object) => void
    let pedirPantalla!: (p: object, cb: (f: object | null) => void) => void
    instalarPermisos({ setPermissionRequestHandler: (f) => (pedirPermiso = f), setDisplayMediaRequestHandler: (f) => (pedirPantalla = f) }, permisos)
    const cb = vi.fn()
    pedirPermiso(WC, 'media', cb, detallesAudio)
    expect(cb).toHaveBeenCalledWith(false)
    const cb2 = vi.fn()
    pedirPantalla({ frame: MARCO }, cb2)
    await new Promise((r) => setTimeout(r, 0))
    expect(cb2).toHaveBeenCalledWith(null)
  })

  it('el micrófono se concede solo para audio, de la página propia, en los 5 s siguientes y con micrófono elegido', () => {
    const { permisos, avanzar } = montar()
    expect(permisos.pedir(7, conMic)).toEqual({ ok: true })
    expect(permisos.permiso(WC, 'media', detallesAudio)).toBe(true)
    expect(permisos.permiso(WC, 'media', { requestingUrl: URL_PROPIA, mediaTypes: ['audio', 'video'] })).toBe(false)
    expect(permisos.permiso(WC, 'media', { requestingUrl: URL_PROPIA, mediaTypes: ['video'] })).toBe(false)
    expect(permisos.permiso(WC, 'media', { requestingUrl: URL_PROPIA })).toBe(false)
    expect(permisos.permiso(WC, 'media', { requestingUrl: 'https://ejemplo.com/', mediaTypes: ['audio'] })).toBe(false)
    expect(permisos.permiso({ id: 9 }, 'media', detallesAudio)).toBe(false)
    expect(permisos.permiso(WC, 'notifications', detallesAudio)).toBe(false)
    avanzar(VENTANA_PERMISOS_MS + 1)
    expect(permisos.permiso(WC, 'media', detallesAudio)).toBe(false)
  })

  it('el micrófono se concede una sola vez por grabación', () => {
    const { permisos } = montar()
    permisos.pedir(7, conMic)
    expect(permisos.permiso({ id: 9 }, 'media', detallesAudio)).toBe(false)
    expect(permisos.permiso(WC, 'media', detallesAudio)).toBe(true)
    expect(permisos.permiso(WC, 'media', detallesAudio)).toBe(false)
    permisos.pedir(7, conMic)
    expect(permisos.permiso(WC, 'media', detallesAudio)).toBe(true)
  })

  it('el permiso previo de getDisplayMedia (media sin tipos) se concede solo a la página propia, con pedido vigente y antes de entregar la ventana', async () => {
    const { permisos, avanzar } = montar()
    const captura = { requestingUrl: URL_PROPIA, mediaTypes: [] as string[] }
    expect(permisos.permiso(WC, 'media', captura)).toBe(false)
    permisos.pedir(7, sinMic)
    expect(permisos.permiso(WC, 'media', captura)).toBe(true)
    expect(permisos.permiso(WC, 'media', { requestingUrl: 'https://ejemplo.com/', mediaTypes: [] })).toBe(false)
    expect(permisos.permiso({ id: 9 }, 'media', captura)).toBe(false)
    await permisos.pantalla({ frame: MARCO })
    expect(permisos.permiso(WC, 'media', captura)).toBe(false)
    permisos.pedir(7, sinMic)
    avanzar(VENTANA_PERMISOS_MS + 1)
    expect(permisos.permiso(WC, 'media', captura)).toBe(false)
  })

  it('sin micrófono elegido, el audio sigue negado', () => {
    const { permisos } = montar()
    permisos.pedir(7, sinMic)
    expect(permisos.permiso(WC, 'media', detallesAudio)).toBe(false)
  })

  it('la captura entrega solo la fuente de la ventana propia, una vez y dentro de la ventana de tiempo', async () => {
    const { permisos, avanzar } = montar()
    permisos.pedir(7, sinMic)
    expect(await permisos.pantalla({ frame: { url: 'https://ejemplo.com/' } })).toBeNull()
    expect(await permisos.pantalla({ frame: MARCO })).toEqual({ video: { id: 'window:77:0', name: 'window:77:0' } })
    expect(await permisos.pantalla({ frame: MARCO })).toBeNull()
    permisos.pedir(7, sinMic)
    avanzar(VENTANA_PERMISOS_MS + 1)
    expect(await permisos.pantalla({ frame: MARCO })).toBeNull()
  })

  it('si la ventana no está entre las fuentes, no se da pantalla completa ni otra ventana', async () => {
    const { permisos } = montar({ fuentes: ['screen:0:0', 'window:12:0'] })
    permisos.pedir(7, sinMic)
    expect(await permisos.pantalla({ frame: MARCO })).toBeNull()
  })

  it('macOS con la grabación de pantalla o el micrófono negados: error en español y nada se abre', async () => {
    const a = montar({ plataforma: 'darwin', estados: { screen: 'denied' } })
    expect(a.permisos.pedir(7, sinMic)).toEqual({ ok: false, error: AVISO_PANTALLA_DENEGADA })
    expect(AVISO_PANTALLA_DENEGADA).toContain('Ajustes del Sistema › Privacidad y seguridad › Grabación de pantalla')
    expect(await a.permisos.pantalla({ frame: MARCO })).toBeNull()
    const b = montar({ plataforma: 'darwin', estados: { microphone: 'restricted' } })
    expect(b.permisos.pedir(7, conMic)).toEqual({ ok: false, error: AVISO_MICROFONO_DENEGADO })
    expect(AVISO_MICROFONO_DENEGADO).toContain('Privacidad y seguridad › Micrófono')
    expect(b.permisos.permiso(WC, 'media', detallesAudio)).toBe(false)
    // sin micrófono elegido, su permiso no se consulta
    expect(b.permisos.pedir(7, sinMic)).toEqual({ ok: true })
    // no-determinado lo decide el sistema al preguntar
    expect(montar({ plataforma: 'darwin', estados: { screen: 'not-determined', microphone: 'not-determined' } }).permisos.pedir(7, conMic)).toEqual({ ok: true })
  })

  it('fuera de macOS no se consulta el estado del sistema', () => {
    expect(montar({ plataforma: 'win32', estados: { screen: 'denied' } }).permisos.pedir(7, sinMic)).toEqual({ ok: true })
  })
})

describe('validarOpciones', () => {
  it('acepta las opciones completas y rechaza lo demás', () => {
    expect(validarOpciones(conMic)).toEqual(conMic)
    for (const malo of [null, 5, 'x', [], {}, { ...sinMic, que: 'pantalla' }, { ...sinMic, calidad: '4k' }, { ...sinMic, microfono: 3 }, { ...sinMic, resaltarClics: 1 }, { que: 'ventana' }]) {
      expect(() => validarOpciones(malo)).toThrow()
    }
  })
})

describe('canales IPC', () => {
  function registrar(o: { renombra?: string | null } = {}) {
    const manejadores = new Map<string, (e: never, ...a: unknown[]) => unknown>()
    const servicio = {
      carpetaGrabaciones: vi.fn(() => '/v/Kirchi'),
      guardar: vi.fn((_b: Uint8Array, _n?: string, _c?: string) => '/v/Kirchi/Kirchi 2026-10-24 15.42.07.webm'),
      renombrar: vi.fn(async (_r: string) => o.renombra ?? null)
    }
    const { permisos } = montar()
    const cerrar = vi.spyOn(permisos, 'cerrar')
    const fijarCarpeta = vi.fn()
    const abrirRuta = vi.fn(async (_r: string) => '')
    const elegirCarpeta = vi.fn(async (_id: number, _i: string): Promise<string | null> => '/otra')
    const deps = { servicio, permisos, esPropia: (u: string | undefined) => u === URL_PROPIA, esEditor: (id: number) => id === 7, abrirRuta, elegirCarpeta, fijarCarpeta } as unknown as DepsIpcGrabacion
    registrarGrabacion({ handle: (c, f) => void manejadores.set(c, f as never) }, deps)
    const llamar = (canal: string, ...args: unknown[]) => Promise.resolve().then(() => manejadores.get(canal)!({ sender: { id: 7 }, senderFrame: MARCO } as never, ...args))
    return { llamar, servicio, fijarCarpeta, abrirRuta, elegirCarpeta, cerrar, manejadores }
  }
  const datos = { bytes: new Uint8Array([1, 2, 3]), duracionMs: 1000, nombreCircuito: 'Divisor' }

  it('rechazan un origen que no es propio o una ventana que no es del editor', async () => {
    const { manejadores } = registrar()
    for (const canal of Object.values(CG)) {
      await expect(Promise.resolve().then(() => manejadores.get(canal)!({ sender: { id: 7 }, senderFrame: { url: 'https://x.com/' } } as never))).rejects.toThrow('origen no permitido')
      await expect(Promise.resolve().then(() => manejadores.get(canal)!({ sender: { id: 99 }, senderFrame: MARCO } as never))).rejects.toThrow('origen no permitido')
    }
  })

  it('guardar escribe la duración, llama al servicio y devuelve ruta y nombre', async () => {
    const r = registrar()
    expect(await r.llamar(CG.guardar, datos)).toEqual({ ruta: '/v/Kirchi/Kirchi 2026-10-24 15.42.07.webm', nombre: 'Kirchi 2026-10-24 15.42.07.webm' })
    expect(Array.from(r.servicio.guardar.mock.calls[0][0])).toEqual([1, 2, 3, 232])
    expect(r.servicio.guardar.mock.calls[0][1]).toBe('Divisor')
    expect(r.cerrar).toHaveBeenCalled()
  })

  it('guardar un MP4 no toca la cabecera y lo pasa con su contenedor', async () => {
    const r = registrar()
    await r.llamar(CG.guardar, { ...datos, contenedor: 'mp4' })
    expect(Array.from(r.servicio.guardar.mock.calls[0][0])).toEqual([1, 2, 3])
    expect(r.servicio.guardar.mock.calls[0][2]).toBe('mp4')
    await expect(r.llamar(CG.guardar, { ...datos, contenedor: 'avi' })).rejects.toThrow()
  })

  it('guardar valida tipos, tamaño y duración', async () => {
    const r = registrar()
    for (const malo of [null, 'x', { ...datos, bytes: [1] }, { ...datos, bytes: new Uint8Array(0) }, { ...datos, duracionMs: -1 }, { ...datos, duracionMs: NaN }, { ...datos, duracionMs: '5' }, { ...datos, nombreCircuito: 4 }, { ...datos, nombreCircuito: 'x'.repeat(201) }]) {
      await expect(r.llamar(CG.guardar, malo)).rejects.toThrow()
    }
    expect(r.servicio.guardar).not.toHaveBeenCalled()
  })

  it('renombrar solo acepta texto y se lo pasa al servicio, que valida la ruta', async () => {
    const r = registrar({ renombra: '/v/Kirchi/nuevo.webm' })
    expect(await r.llamar(CG.renombrar, '/v/Kirchi/a.webm')).toBe('/v/Kirchi/nuevo.webm')
    expect(r.servicio.renombrar).toHaveBeenCalledWith('/v/Kirchi/a.webm')
    for (const malo of [undefined, 3, '', { ruta: 'x' }, 'x'.repeat(5000)]) await expect(r.llamar(CG.renombrar, malo)).rejects.toThrow()
    expect(r.servicio.renombrar).toHaveBeenCalledTimes(1)
  })

  it('pedir valida las opciones y abre la ventana de permisos', async () => {
    const r = registrar()
    expect(await r.llamar(CG.pedir, sinMic)).toEqual({ ok: true })
    await expect(r.llamar(CG.pedir, { que: 'ventana' })).rejects.toThrow()
  })

  it('abrirCarpeta abre la carpeta del servicio y avisa si falla', async () => {
    const r = registrar()
    await r.llamar(CG.abrirCarpeta)
    expect(r.abrirRuta).toHaveBeenCalledWith('/v/Kirchi')
    r.abrirRuta.mockResolvedValueOnce('error')
    await expect(r.llamar(CG.abrirCarpeta)).rejects.toThrow('No se pudo abrir')
  })

  it('cambiarCarpeta guarda la elegida en los ajustes y restablecer la borra', async () => {
    const r = registrar()
    await r.llamar(CG.cambiarCarpeta)
    expect(r.elegirCarpeta).toHaveBeenCalledWith(7, '/v/Kirchi')
    expect(r.fijarCarpeta).toHaveBeenCalledWith('/otra')
    r.fijarCarpeta.mockClear()
    r.elegirCarpeta.mockResolvedValueOnce(null)
    expect(await r.llamar(CG.cambiarCarpeta)).toBeNull()
    expect(r.fijarCarpeta).not.toHaveBeenCalled()
    await r.llamar(CG.restablecerCarpeta)
    expect(r.fijarCarpeta).toHaveBeenCalledWith(undefined)
  })
})
