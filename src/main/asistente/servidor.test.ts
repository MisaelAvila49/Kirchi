import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bytesDelWasm, libreriaSinDom } from '../../renderer/src/prueba/pasoVista'
import { Herramientas, HERRAMIENTAS, TEXTO_APAGADO } from './herramientas'
import { crearServidor } from './servidor'

let base: string
let activo = true
let cliente: Client
let herramientas: Herramientas

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'kirchi-servidor-'))
  mkdirSync(join(base, 'datos'))
  herramientas = new Herramientas({
    lib: libreriaSinDom(),
    wasm: bytesDelWasm(),
    version: 'prueba',
    dirDatos: join(base, 'datos'),
    carpetaPorOmision: join(base, 'Asistente'),
    ajustes: () => ({ activo, carpeta: null })
  })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await crearServidor(herramientas, 'prueba').connect(b)
  cliente = new Client({ name: 'prueba', version: '1' })
  await cliente.connect(a)
})
afterAll(async () => {
  await cliente.close()
  herramientas.cerrar()
  rmSync(base, { recursive: true, force: true })
})

describe('servidor MCP', () => {
  it('lista todas las herramientas con su descripción', async () => {
    const { tools } = await cliente.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(HERRAMIENTAS.map((h) => h.nombre).sort())
    for (const t of tools) expect(t.description, t.name).toBeTruthy()
  })

  it('crear, colocar y leer pasan por el protocolo', async () => {
    const texto = (r: unknown) => ((r as { content: { text: string }[] }).content[0].text)
    expect(JSON.parse(texto(await cliente.callTool({ name: 'crear_circuito', arguments: { nombre: 'm' } })))).toEqual({ ok: true, nombre: 'm.kir' })
    const c = await cliente.callTool({ name: 'colocar', arguments: { circuito: 'm', tipo: 'resistencia', valor: '1k' } })
    expect(c.isError).toBeFalsy()
    const l = JSON.parse(texto(await cliente.callTool({ name: 'leer_circuito', arguments: { circuito: 'm' } })))
    expect(l.piezas[0]).toMatchObject({ ref: 'R1', valor: '1k' })
  })

  it('datos_pieza pasa por el protocolo', async () => {
    const r = await cliente.callTool({ name: 'datos_pieza', arguments: { tipo: 'npn', opcion: '2N3904' } })
    expect(r.isError).toBeFalsy()
    const d = JSON.parse((r as unknown as { content: { text: string }[] }).content[0].text)
    expect(d.presentaciones[0]).toMatchObject({ encapsulado: 'TO-92', patillas: { E: '1', B: '2', C: '3' } })
  })

  it('un argumento de tipo equivocado lo rechaza el esquema', async () => {
    const r = await cliente.callTool({ name: 'simular', arguments: { circuito: 'm', hasta: 'mucho' } }).catch((e) => e)
    const error = r instanceof Error || (r as { isError?: boolean }).isError === true
    expect(error).toBe(true)
  })

  it('apagado, el servidor responde y cada llamada devuelve el texto de activarlo', async () => {
    activo = false
    expect((await cliente.listTools()).tools.length).toBe(HERRAMIENTAS.length)
    const r = (await cliente.callTool({ name: 'estado', arguments: {} })) as { isError?: boolean; content: { text: string }[] }
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toBe(TEXTO_APAGADO)
    activo = true
  })
})
