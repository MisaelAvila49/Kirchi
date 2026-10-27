// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CANALES_ASISTENTE as CA, type EstadoAsistente, type PeticionAsistente } from '../../compartido/asistente'
import { ClienteTuberia } from './clienteTuberia'
import { VentanaAsistente, type EventoIpc } from './ventanaAsistente'
import { PuenteVentana } from './puenteVentana'

let dir: string
let activo: boolean
let carpeta: string | undefined
let enviados: { id: number; canal: string; arg: unknown }[]
let difundidos: EstadoAsistente[]
let handlers: Map<string, (e: EventoIpc, ...a: unknown[]) => unknown>
let oyentes: Map<string, (e: EventoIpc, ...a: unknown[]) => void>
let v: VentanaAsistente
/** Qué ventana tiene abierto cada archivo y qué archivos se pidieron abrir en una ventana nueva. */
let conArchivo: Map<string, number>
let abiertasNuevas: string[]
const ventana = (id: number): EventoIpc => ({ sender: { id }, senderFrame: { url: 'app://kirchi/index.html' } })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kirchi-ventana-'))
  activo = false
  carpeta = undefined
  enviados = []
  difundidos = []
  handlers = new Map()
  oyentes = new Map()
  conArchivo = new Map()
  abiertasNuevas = []
  v = new VentanaAsistente({
    ipc: { handle: (c, f) => void handlers.set(c, f), on: (c, f) => void oyentes.set(c, f) },
    dirDatos: dir,
    esPropia: (u) => u?.startsWith('app://kirchi/') === true,
    ventanaDeDestino: () => 7,
    existeVentana: (id) => id === 7 || id === 8,
    esEditor: (id) => id === 7 || id === 8,
    enviar: (id, canal, arg) => void enviados.push({ id, canal, arg }),
    difundir: (_c, e) => void difundidos.push(e as EstadoAsistente),
    activo: () => activo,
    carpeta: () => carpeta,
    fijarActivo: (a) => void (activo = a),
    fijarCarpeta: (r) => void (carpeta = r ?? undefined),
    elegirCarpeta: async () => 'D:\\elegida',
    textoConfiguracion: () => '{}',
    avisarError: () => {},
    carpetaAsistente: () => join(dir, 'Asistente'),
    ventanaConArchivo: (r) => conArchivo.get(r),
    abrirEnVentanaNueva: (r) => void abiertasNuevas.push(r)
  })
  v.registrar()
})

afterEach(() => {
  v.cerrar()
  rmSync(dir, { recursive: true, force: true })
})

const esperar = async (cond: () => boolean) => {
  const fin = Date.now() + 3000
  while (!cond() && Date.now() < fin) await new Promise((r) => setTimeout(r, 10))
  expect(cond()).toBe(true)
}

describe('ventana del asistente', () => {
  it('apagado no abre la tubería; encendido por el canal sí, y apagarlo la cierra', async () => {
    await v.reconciliar()
    expect(await ClienteTuberia.conectar(dir, 'x')).toMatchObject({ ok: false, sinVentana: true })
    expect(await handlers.get(CA.activar)!(ventana(7), true)).toMatchObject({ activo: true, conectado: null })
    const c = await ClienteTuberia.conectar(dir, 'Claude Desktop')
    expect(c.ok).toBe(true)
    expect(v.estado().conectado).toEqual({ cliente: 'Claude Desktop' })
    expect(difundidos.at(-1)?.conectado).toEqual({ cliente: 'Claude Desktop' })
    await handlers.get(CA.activar)!(ventana(7), false)
    if (c.ok) await esperar(() => !c.cliente.vivo)
    expect(v.estado()).toMatchObject({ activo: false, conectado: null })
  })

  it('reenvía la petición a la ventana unida y solo cree la respuesta que viene de ella', async () => {
    activo = true
    await v.reconciliar()
    const c = await ClienteTuberia.conectar(dir, 'x')
    if (!c.ok) throw new Error('no conectó')
    const respuesta = c.cliente.pedir('estado', { a: 1 })
    await esperar(() => enviados.length === 1)
    const p = enviados[0].arg as PeticionAsistente
    expect(enviados[0]).toMatchObject({ id: 7, canal: CA.peticion })
    expect(p).toMatchObject({ tipo: 'estado', datos: { a: 1 } })
    oyentes.get(CA.respuesta)!(ventana(8), p.id, { falsa: true })
    oyentes.get(CA.respuesta)!(ventana(7), p.id, { ventana: true })
    expect(await respuesta).toEqual({ ok: true, datos: { ventana: true } })
  })

  it('cerrar la ventana unida suelta al asistente', async () => {
    activo = true
    await v.reconciliar()
    const c = await ClienteTuberia.conectar(dir, 'x')
    if (!c.ok) throw new Error('no conectó')
    v.ventanaCerrada(7)
    await esperar(() => !c.cliente.vivo)
    expect(v.estado().conectado).toBeNull()
  })

  it('desconectar desde Configuración suelta al cliente y la tubería sigue abierta', async () => {
    activo = true
    await v.reconciliar()
    const c = await ClienteTuberia.conectar(dir, 'x')
    if (!c.ok) throw new Error('no conectó')
    await handlers.get(CA.desconectar)!(ventana(7))
    await esperar(() => !c.cliente.vivo)
    expect((await ClienteTuberia.conectar(dir, 'y')).ok).toBe(true)
  })

  it('la carpeta solo cambia por el diálogo del proceso principal, y se restablece', async () => {
    expect(await handlers.get(CA.cambiarCarpeta)!(ventana(7))).toBe('D:\\elegida')
    expect(carpeta).toBe('D:\\elegida')
    expect(difundidos.at(-1)?.carpeta).toBe('D:\\elegida')
    await handlers.get(CA.restablecerCarpeta)!(ventana(7))
    expect(carpeta).toBeUndefined()
  })

  it('abre en una ventana nueva solo circuitos de la carpeta del asistente y manda cada orden a la ventana que tiene su archivo', async () => {
    activo = true
    await v.reconciliar()
    const c = await ClienteTuberia.conectar(dir, 'x')
    if (!c.ok) throw new Error('no conectó')
    mkdirSync(join(dir, 'Asistente'))
    const ruta = join(dir, 'Asistente', 'nuevo.kir')
    writeFileSync(ruta, '{}')
    writeFileSync(join(dir, 'fuera.kir'), '{}')
    expect(await c.cliente.pedir('abrir', { ruta: join(dir, 'fuera.kir') })).toMatchObject({ ok: false })
    expect(await c.cliente.pedir('abrir', { ruta })).toEqual({ ok: true, datos: { ok: true } })
    expect(abiertasNuevas).toEqual([ruta])
    expect(await c.cliente.pedir('dondeEsta', { ruta })).toEqual({ ok: true, datos: { abierto: false, cargando: true } })
    conArchivo.set(ruta, 8)
    expect(await c.cliente.pedir('dondeEsta', { ruta })).toEqual({ ok: true, datos: { abierto: true } })
    // La orden va a la ventana 8, la del archivo, y no a la unida (7).
    const r = c.cliente.pedir('orden', { orden: { orden: 'deshacer' }, ruta })
    await esperar(() => enviados.length === 1)
    expect(enviados[0].id).toBe(8)
    oyentes.get(CA.respuesta)!(ventana(8), (enviados[0].arg as PeticionAsistente).id, { ok: true })
    expect(await r).toEqual({ ok: true, datos: { ok: true } })
    conArchivo.clear()
    expect(await c.cliente.pedir('orden', { orden: { orden: 'deshacer' }, ruta })).toEqual({ ok: false, motivo: 'El circuito ya no está abierto en Kirchi.' })
  })

  it('el puente se une solo en cuanto la ventana abre la tubería, sin esperar a una herramienta', async () => {
    const puente = new PuenteVentana(dir, () => 'Claude Desktop')
    try {
      puente.vigilar(20)
      activo = true
      await v.reconciliar()
      await esperar(() => v.estado().conectado !== null)
      expect(v.estado().conectado).toEqual({ cliente: 'Claude Desktop' })
      // Pulsar «Desconectar» se respeta: el puente no vuelve a unirse con la misma llave.
      await handlers.get(CA.desconectar)!(ventana(7))
      await esperar(() => !puente.unido)
      await new Promise((r) => setTimeout(r, 100))
      expect(v.estado().conectado).toBeNull()
    } finally {
      puente.cerrar()
    }
  })

  it('rechaza lo que no viene de una ventana propia del editor', async () => {
    await expect(Promise.resolve().then(() => handlers.get(CA.activar)!(ventana(99), true))).rejects.toThrow()
    expect(() => handlers.get(CA.estado)!({ sender: { id: 7 }, senderFrame: { url: 'https://ajeno.example/' } })).toThrow()
    await expect(Promise.resolve().then(() => handlers.get(CA.activar)!(ventana(7), 'si'))).rejects.toThrow()
  })
})
