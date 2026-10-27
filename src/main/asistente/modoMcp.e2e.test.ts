import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Lanza el proceso principal construido con `--mcp`, como lo haría un cliente. Sin `out/` se salta.
const raiz = join(import.meta.dirname, '..', '..', '..')
const principal = join(raiz, 'out', 'main', 'index.js')
const hayBuild = existsSync(principal)
const electron: string = hayBuild ? createRequire(import.meta.url)('electron') : ''

let base: string
let datos: string
let cliente: Client
let transporte: StdioClientTransport
let ms = 0

/** Lanza el puente como lo hace un cliente, sin ELECTRON_RUN_AS_NODE: con ella el ejecutable corre como Node y no abre Electron. */
async function lanzar(carpetaDatos: string): Promise<{ cliente: Client; transporte: StdioClientTransport }> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v
  const t = new StdioClientTransport({ command: electron, args: [principal, '--mcp', `--datos=${carpetaDatos}`], env, stderr: 'pipe' })
  const c = new Client({ name: 'prueba-e2e', version: '1' })
  // Electron escribe un salto de línea al arrancar: el cliente lo cuenta como línea vacía y lo tolera.
  c.onerror = () => {}
  await c.connect(t)
  return { cliente: c, transporte: t }
}

/** Un lote largo: dos inversores con TL081 y alimentación por etiquetas a V+ y V-. */
const LOTE_LARGO = [
  { orden: 'colocar', tipo: 'fuente-dc', ref: 'V3', props: { voltaje: '1' }, en: { x: 10, y: 40 } },
  { orden: 'colocar', tipo: 'resistencia', ref: 'R1', valor: '10k', en: { x: 30, y: 30 } },
  { orden: 'colocar', tipo: 'resistencia', ref: 'R2', valor: '20k', en: { x: 60, y: 15 } },
  { orden: 'colocar', tipo: 'amp-op', ref: 'U1', props: { modelo: 'TL081' }, en: { x: 60, y: 35 } },
  { orden: 'colocar', tipo: 'resistencia', ref: 'R3', valor: '10k', en: { x: 90, y: 30 } },
  { orden: 'colocar', tipo: 'resistencia', ref: 'R4', valor: '10k', en: { x: 120, y: 15 } },
  { orden: 'colocar', tipo: 'amp-op', ref: 'U2', props: { modelo: 'TL081' }, en: { x: 120, y: 35 } },
  { orden: 'colocar', tipo: 'tierra', ref: 'GND1', en: { x: 10, y: 70 } },
  { orden: 'colocar', tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '12' }, en: { x: 10, y: 100 } },
  { orden: 'colocar', tipo: 'fuente-dc', ref: 'V2', props: { voltaje: '12' }, en: { x: 40, y: 100 } },
  { orden: 'conectar', desde: 'V3.+', hasta: 'R1.1' },
  { orden: 'conectar', desde: 'R1.2', hasta: 'U1.-' },
  { orden: 'conectar', desde: 'U1.-', hasta: 'R2.1' },
  { orden: 'conectar', desde: 'R2.2', hasta: 'U1.OUT' },
  { orden: 'conectar', desde: 'U1.OUT', hasta: 'R3.1' },
  { orden: 'conectar', desde: 'R3.2', hasta: 'U2.-' },
  { orden: 'conectar', desde: 'U2.-', hasta: 'R4.1' },
  { orden: 'conectar', desde: 'R4.2', hasta: 'U2.OUT' },
  { orden: 'conectar', desde: 'V3.-', hasta: 'GND1.1' },
  { orden: 'conectar', desde: 'U1.+', hasta: 'GND1.1', via: 'etiqueta' },
  { orden: 'conectar', desde: 'U2.+', hasta: 'GND1.1', via: 'etiqueta' },
  { orden: 'conectar', desde: 'V1.-', hasta: 'GND1.1', via: 'etiqueta' },
  { orden: 'conectar', desde: 'V2.+', hasta: 'GND1.1', via: 'etiqueta' },
  { orden: 'conectar', desde: 'V1.+', hasta: 'U1.V+', via: 'etiqueta' },
  { orden: 'conectar', desde: 'V1.+', hasta: 'U2.V+', via: 'etiqueta' },
  { orden: 'conectar', desde: 'V2.-', hasta: 'U1.V-', via: 'etiqueta' },
  { orden: 'conectar', desde: 'V2.-', hasta: 'U2.V-', via: 'etiqueta' }
]

const texto = (r: unknown): string => (r as { content: { type: string; text: string }[] }).content[0].text

describe.skipIf(!hayBuild)('puente --mcp en un proceso real', () => {
  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'kirchi-mcp-'))
    datos = join(base, 'datos')
    mkdirSync(datos)
    writeFileSync(join(datos, 'settings.json'), JSON.stringify({ asistente: { activo: true } }))
    const t = performance.now()
    ;({ cliente, transporte } = await lanzar(datos))
    ms = performance.now() - t
  }, 60_000)

  afterAll(async () => {
    await cliente?.close().catch(() => {})
    rmSync(base, { recursive: true, force: true })
  })

  it('responde initialize y lista las herramientas', async () => {
    expect(cliente.getServerVersion()?.name).toBe('kirchi')
    const { tools } = await cliente.listTools()
    expect(tools.length).toBeGreaterThan(15)
    expect(tools.map((t) => t.name)).toContain('simular')
    // Criterio de la especificación: la primera respuesta llega en menos de 3 s en frío.
    console.error(`initialize en ${Math.round(ms)} ms`)
  }, 30_000)

  it('arma un divisor y lo simula, con la cifra en la salida', async () => {
    await cliente.callTool({ name: 'crear_circuito', arguments: { nombre: 'prueba' } })
    const r = await cliente.callTool({
      name: 'insertar_plantilla',
      arguments: { circuito: 'prueba', plantilla: 'divisor-de-voltaje' }
    })
    expect(r.isError, texto(r)).toBeFalsy()
    const s = JSON.parse(texto(await cliente.callTool({ name: 'simular', arguments: { circuito: 'prueba', hasta: 0.01 } })))
    expect(s.lectura.piezas.R2.v.toFixed(3)).toBe('2.878')
  }, 60_000)

  it('exporta el esquema como PNG válido dentro del tope', async () => {
    const r = (await cliente.callTool({ name: 'exportar_imagen', arguments: { circuito: 'prueba', lado: 800 } })) as { isError?: boolean; content: { type: string; data?: string; mimeType?: string; text?: string }[] }
    expect(r.isError, JSON.stringify(r.content[0]).slice(0, 200)).toBeFalsy()
    const img = r.content.find((c) => c.type === 'image')!
    expect(img.mimeType).toBe('image/png')
    const png = Buffer.from(img.data!, 'base64')
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const [ancho, alto] = [png.readUInt32BE(16), png.readUInt32BE(20)]
    expect(Math.max(ancho, alto)).toBeLessThanOrEqual(2048)
    expect(ancho).toBeGreaterThan(50)
  }, 60_000)

  it('después de exportar la imagen el puente sigue vivo y aplica el lote largo con etiquetas a V+ y V-', async () => {
    let cerrado = false
    transporte.onclose = () => void (cerrado = true)
    // Cerrar la ventana oculta de la imagen no debe cerrar el puente: el siguiente mensaje tiene respuesta.
    await new Promise((r) => setTimeout(r, 1500))
    await cliente.callTool({ name: 'crear_circuito', arguments: { nombre: 'inversores' } })
    const r = await cliente.callTool({ name: 'aplicar_lote', arguments: { circuito: 'inversores', ordenes: LOTE_LARGO } })
    expect(r.isError, texto(r)).toBeFalsy()
    const otra = await cliente.callTool({ name: 'exportar_imagen', arguments: { circuito: 'inversores', lado: 600 } })
    expect(otra.isError).toBeFalsy()
    await new Promise((r) => setTimeout(r, 1500))
    const leido = JSON.parse(texto(await cliente.callTool({ name: 'leer_circuito', arguments: { circuito: 'inversores' } })))
    expect(leido.piezas).toHaveLength(10)
    expect(cerrado).toBe(false)
  }, 90_000)

  it('relanzado con la misma carpeta de datos sigue encendido y encuentra lo armado sin haberlo guardado', async () => {
    await cliente.close()
    const otro = await lanzar(datos)
    try {
      const r = await otro.cliente.callTool({ name: 'leer_circuito', arguments: { circuito: 'inversores' } })
      expect(texto(r)).not.toContain('apagado')
      expect(JSON.parse(texto(r)).piezas).toHaveLength(10)
    } finally {
      await otro.cliente.close()
    }
    // El registro propio del puente dice qué pasó: arranque, cada herramienta con su duración y la salida.
    const registro = readFileSync(join(datos, 'asistente-puente.log'), 'utf8')
    expect(registro).toMatch(/arranque: Kirchi/)
    expect(registro).toMatch(/aplicar_lote \d+ ms/)
    expect(registro).toMatch(/salida: /)
    expect(registro).not.toMatch(/se pidió cerrar la aplicación/)
  }, 90_000)
})
