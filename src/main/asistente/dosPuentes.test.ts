// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CANALES_ASISTENTE as CA, TEXTO_CAMBIOS_DEL_USUARIO, type PeticionAsistente } from '../../compartido/asistente'
import { escribirKir } from '../../renderer/src/archivo/kir'
import { validarOrden } from '../../renderer/src/edicion/ordenes'
import { bytesDelWasm, libreriaSinDom } from '../../renderer/src/prueba/pasoVista'
import { SesionSinVentana } from '../../renderer/src/sinVentana/sesion'
import { Herramientas, type Respuesta } from './herramientas'
import { PuenteVentana } from './puenteVentana'
import { VentanaAsistente, type EventoIpc } from './ventanaAsistente'

const lib = libreriaSinDom()
const texto = (r: Respuesta): string => (r.content[0] as { text: string }).text
const ventana7: EventoIpc = { sender: { id: 7 }, senderFrame: { url: 'app://kirchi/index.html' } }

let dir: string
let carpeta: string
let v: VentanaAsistente
let doc: SesionSinVentana
let conservado: boolean
let puentes: PuenteVentana[]
let herramientas: Herramientas[]

const esperar = async (cond: () => boolean) => {
  const fin = Date.now() + 3000
  while (!cond() && Date.now() < fin) await new Promise((r) => setTimeout(r, 10))
  expect(cond()).toBe(true)
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kirchi-dos-puentes-'))
  carpeta = join(dir, 'Asistente')
  mkdirSync(carpeta)
  conservado = false
  puentes = []
  herramientas = []
  // La ventana: su documento es una sesión, abierta sobre Notch.kir, y responde como el receptor.
  doc = await SesionSinVentana.iniciar({ lib, wasm: bytesDelWasm(), version: 'prueba' })
  doc.crear()
  writeFileSync(join(carpeta, 'Notch.kir'), escribirKir(doc.doc, 'prueba'))
  const oyentes = new Map<string, (e: EventoIpc, ...a: unknown[]) => void>()
  v = new VentanaAsistente({
    ipc: { handle: () => {}, on: (c, f) => void oyentes.set(c, f) },
    dirDatos: dir,
    esPropia: () => true,
    ventanaDeDestino: () => 7,
    existeVentana: (id) => id === 7,
    esEditor: (id) => id === 7,
    enviar: (_id, _canal, arg) => {
      const p = arg as PeticionAsistente
      const d = p.datos as { orden?: unknown }
      let r: unknown
      if (p.tipo === 'documento') r = { bytes: Buffer.from(doc.guardar()).toString('base64'), titulo: 'Notch.kir', archivo: 'Notch.kir' }
      else if (conservado) r = { ok: false, motivo: TEXTO_CAMBIOS_DEL_USUARIO }
      else {
        const o = validarOrden(d.orden)
        r = o.ok ? doc.aplicar(o.orden) : { ok: false, motivo: o.motivo }
      }
      setTimeout(() => oyentes.get(CA.respuesta)!(ventana7, p.id, r), 0)
    },
    difundir: () => {},
    activo: () => true,
    carpeta: () => undefined,
    fijarActivo: () => {},
    fijarCarpeta: () => {},
    elegirCarpeta: async () => null,
    textoConfiguracion: () => '{}',
    avisarError: () => {},
    carpetaAsistente: () => carpeta,
    // La ventana abrió el archivo desde un diálogo: otra capitalización que la que arma el puente.
    ventanaConArchivo: (ruta) => (ruta.toLowerCase() === join(carpeta, 'notch.kir').toLowerCase() ? 7 : undefined),
    abrirEnVentanaNueva: () => {},
    plataforma: 'win32'
  })
  v.registrar()
  await v.reconciliar()
})

afterEach(() => {
  for (const h of herramientas) h.cerrar()
  for (const p of puentes) p.cerrar()
  v.cerrar()
  doc.cerrar()
  rmSync(dir, { recursive: true, force: true })
})

function puente(cliente: string): { puente: PuenteVentana; h: Herramientas } {
  const p = new PuenteVentana(dir, () => cliente)
  const h = new Herramientas({ lib, wasm: bytesDelWasm(), version: 'prueba', dirDatos: dir, carpetaPorOmision: carpeta, ajustes: () => ({ activo: true, carpeta: null }), ventana: () => p.obtener() })
  puentes.push(p)
  herramientas.push(h)
  return { puente: p, h }
}

describe('dos puentes del mismo cliente con el archivo abierto en la ventana', () => {
  it('el que no se unió primero también edita en vivo y el archivo del disco no cambia', async () => {
    // Claude Desktop lanza un puente para el chat y otro para el agente; el del chat se une primero y queda quieto.
    const chat = puente('claude-ai')
    chat.puente.vigilar(20)
    await esperar(() => chat.puente.unido)
    const agente = puente('local-agent-mode-kirchi')
    const ruta = join(carpeta, 'Notch.kir')
    const antes = { bytes: readFileSync(ruta), fecha: statSync(ruta).mtimeMs }
    const r = await agente.h.llamar('colocar', { circuito: 'Notch', tipo: 'resistencia', en: { x: 25, y: 25 } })
    expect(r.isError, texto(r)).toBeUndefined()
    expect(Object.values(doc.doc.piezas).map((p) => p.ref)).toEqual(['R1'])
    const lote = await agente.h.llamar('aplicar_lote', { circuito: 'notch.kir', ordenes: [{ orden: 'colocar', tipo: 'resistencia', en: { x: 50, y: 25 } }] })
    expect(lote.isError, texto(lote)).toBeUndefined()
    expect(Object.keys(doc.doc.piezas)).toHaveLength(2)
    expect(readFileSync(ruta).equals(antes.bytes)).toBe(true)
    expect(statSync(ruta).mtimeMs).toBe(antes.fecha)
    expect(v.estado().conectado).toEqual({ cliente: 'local-agent-mode-kirchi' })
  })

  it('tras «Conservar el mío» la siguiente orden falla con el motivo y nada se escribe en el disco', async () => {
    const agente = puente('local-agent-mode-kirchi')
    conservado = true
    const ruta = join(carpeta, 'Notch.kir')
    const antes = readFileSync(ruta)
    const r = await agente.h.llamar('colocar', { circuito: 'Notch', tipo: 'resistencia' })
    expect(r.isError).toBe(true)
    expect(texto(r)).toBe(TEXTO_CAMBIOS_DEL_USUARIO)
    expect(readFileSync(ruta).equals(antes)).toBe(true)
  })

  it('si la ventana no deja unirse, el puente no escribe el archivo en el disco', async () => {
    const agente = puente('local-agent-mode-kirchi')
    const ruta = join(carpeta, 'Notch.kir')
    const antes = readFileSync(ruta)
    // Cuatro puentes ya unidos: la ventana rechaza al quinto y no se puede saber qué tiene abierto.
    const otros = ['a', 'b', 'c', 'd'].map((c) => puente(c))
    for (const o of otros) await o.puente.obtener()
    const r = await agente.h.llamar('colocar', { circuito: 'Notch', tipo: 'resistencia' })
    expect(r.isError).toBe(true)
    expect(texto(r)).toContain('asistentes conectados')
    expect(readFileSync(ruta).equals(antes)).toBe(true)
  })
})
