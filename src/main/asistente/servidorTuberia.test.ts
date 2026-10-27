// @vitest-environment node
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { connect, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_MENSAJE_TUBERIA, TEXTO_YA_CONECTADO } from '../../compartido/asistente'
import { ClienteTuberia } from './clienteTuberia'
import { leerLlave, nombreTuberia, rutaLlave } from './llave'
import { lineaDe, ServidorTuberia } from './servidorTuberia'

let dir: string
let servidor: ServidorTuberia
let unidos: string[]
let idos: number
const abiertos: Socket[] = []

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kirchi-tuberia-'))
  unidos = []
  idos = 0
  servidor = new ServidorTuberia({
    dirDatos: dir,
    atender: async (tipo, datos) => {
      if (tipo === 'falla') throw new Error('no se pudo')
      return { tipo, datos }
    },
    alUnirse: (c) => unidos.push(c),
    alIrse: () => void idos++
  })
  await servidor.abrir()
})

afterEach(() => {
  for (const s of abiertos.splice(0)) s.destroy()
  servidor.cerrar()
  rmSync(dir, { recursive: true, force: true })
})

/** Un socket crudo, sin pasar por `ClienteTuberia`, para mandar lo que un cliente correcto no mandaría. */
async function crudo(): Promise<{ socket: Socket; lineas: string[]; cerrado: Promise<void> }> {
  const socket = connect(nombreTuberia(dir))
  abiertos.push(socket)
  const lineas: string[] = []
  let buffer = ''
  socket.on('data', (d) => {
    buffer += d.toString('utf8')
    let i: number
    while ((i = buffer.indexOf('\n')) >= 0) {
      lineas.push(buffer.slice(0, i))
      buffer = buffer.slice(i + 1)
    }
  })
  const cerrado = new Promise<void>((ok) => socket.on('close', () => ok()))
  socket.on('error', () => {})
  await new Promise<void>((ok) => socket.once('connect', () => ok()))
  return { socket, lineas, cerrado }
}

const esperar = async (cond: () => boolean, ms = 3000) => {
  const fin = Date.now() + ms
  while (!cond() && Date.now() < fin) await new Promise((r) => setTimeout(r, 10))
  expect(cond()).toBe(true)
}

describe('tubería del asistente', () => {
  it('escribe la llave de 32 bytes al abrir y la borra al cerrar', () => {
    expect(leerLlave(dir)).toMatch(/^[0-9a-f]{64}$/)
    servidor.cerrar()
    expect(existsSync(rutaLlave(dir))).toBe(false)
  })

  it('con la llave responde y deja pasar el motivo de una falla', async () => {
    const c = await ClienteTuberia.conectar(dir, 'Claude Desktop')
    expect(c.ok).toBe(true)
    if (!c.ok) return
    expect(await c.cliente.pedir('eco', { a: 1 })).toEqual({ ok: true, datos: { tipo: 'eco', datos: { a: 1 } } })
    expect(await c.cliente.pedir('falla', null)).toEqual({ ok: false, motivo: 'no se pudo' })
    expect(unidos).toEqual(['Claude Desktop'])
    expect(servidor.conectado).toBe('Claude Desktop')
    c.cliente.cerrar()
    await esperar(() => idos === 1)
    expect(servidor.conectado).toBeNull()
  })

  it('un proceso de Node aparte con la llave responde y sin ella se queda sin respuesta', async () => {
    const script = join(dir, 'cliente.cjs')
    writeFileSync(
      script,
      `const net = require('net'); const fs = require('fs');
const [nombre, ruta, usar] = process.argv.slice(2);
const llave = usar === 'si' ? fs.readFileSync(ruta, 'utf8').trim() : 'x'.repeat(64);
const s = net.connect(nombre); let b = ''; let n = 0;
s.on('connect', () => s.write(JSON.stringify({ v: 1, id: 1, tipo: 'hola', datos: { llave, cliente: 'otro proceso' } }) + '\\n'));
s.on('data', (d) => { b += d; let i; while ((i = b.indexOf('\\n')) >= 0) { const m = JSON.parse(b.slice(0, i)); b = b.slice(i + 1); if (m.tipo === 'listo') s.write(JSON.stringify({ v: 1, id: 2, tipo: 'eco', datos: 7 }) + '\\n'); else { console.log(m.tipo + ':' + JSON.stringify(m.datos)); s.destroy(); } } });
s.on('close', () => process.exit(0)); s.on('error', () => process.exit(0));
setTimeout(() => process.exit(0), 4000);`
    )
    const correr = async (usar: string) => (await promisify(execFile)(process.execPath, [script, nombreTuberia(dir), rutaLlave(dir), usar], { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } })).stdout
    expect(await correr('si')).toContain('respuesta:{"tipo":"eco","datos":7}')
    expect(await correr('no')).toBe('')
  })

  it('con la llave equivocada la conexión se cierra sin respuesta', async () => {
    const { socket, lineas, cerrado } = await crudo()
    socket.write(lineaDe({ v: 1, id: 1, tipo: 'hola', datos: { llave: 'a'.repeat(64), cliente: 'x' } }))
    await cerrado
    expect(lineas).toEqual([])
    expect(unidos).toEqual([])
  })

  it('un mensaje inválido corta la conexión', async () => {
    const { socket, cerrado } = await crudo()
    socket.write('esto no es json\n')
    await cerrado
  })

  it('un mensaje de más de 16 MB corta la conexión', async () => {
    const llave = leerLlave(dir)
    const { socket, lineas, cerrado } = await crudo()
    socket.write(lineaDe({ v: 1, id: 1, tipo: 'hola', datos: { llave, cliente: 'x' } }))
    await esperar(() => lineas.length === 1)
    const tope = MAX_MENSAJE_TUBERIA + 1024 * 1024
    for (let hecho = 0; hecho < tope && !socket.destroyed; hecho += 1024 * 1024) socket.write('a'.repeat(1024 * 1024))
    await cerrado
    expect(servidor.conectado).toBeNull()
  })

  it('admite varios puentes a la vez (uno por modo del cliente) y rechaza pasado el tope', async () => {
    const primero = await ClienteTuberia.conectar(dir, 'Uno')
    const segundo = await ClienteTuberia.conectar(dir, 'Dos')
    if (!primero.ok || !segundo.ok) throw new Error('no conectaron los dos')
    expect(servidor.cuantos).toBe(2)
    // Los dos llegan a la ventana y el indicador muestra al último que habló.
    expect(await segundo.cliente.pedir('eco', 2)).toEqual({ ok: true, datos: { tipo: 'eco', datos: 2 } })
    expect(servidor.conectado).toBe('Dos')
    expect(await primero.cliente.pedir('eco', 1)).toEqual({ ok: true, datos: { tipo: 'eco', datos: 1 } })
    expect(servidor.conectado).toBe('Uno')
    const mas = [await ClienteTuberia.conectar(dir, 'Tres'), await ClienteTuberia.conectar(dir, 'Cuatro')]
    expect(await ClienteTuberia.conectar(dir, 'Cinco')).toEqual({ ok: false, sinVentana: false, motivo: TEXTO_YA_CONECTADO })
    primero.cliente.cerrar()
    await esperar(() => idos === 1)
    expect(servidor.conectado).not.toBeNull()
    for (const c of [segundo, ...mas]) if (c.ok) c.cliente.cerrar()
  })

  it('apagar el interruptor cierra la conexión viva', async () => {
    const c = await ClienteTuberia.conectar(dir, 'Uno')
    expect(c.ok).toBe(true)
    if (!c.ok) return
    servidor.cerrar()
    await esperar(() => !c.cliente.vivo)
    expect(await c.cliente.pedir('eco', 1)).toMatchObject({ ok: false })
    const otra = await ClienteTuberia.conectar(dir, 'Dos')
    expect(otra).toMatchObject({ ok: false, sinVentana: true })
  })

  it('desconectar suelta al cliente y la tubería sigue abierta para otro', async () => {
    const c = await ClienteTuberia.conectar(dir, 'Uno')
    if (!c.ok) throw new Error('no conectó')
    servidor.desconectar()
    await esperar(() => !c.cliente.vivo)
    const d = await ClienteTuberia.conectar(dir, 'Dos')
    expect(d.ok).toBe(true)
    if (d.ok) d.cliente.cerrar()
  })

  it('sin archivo de llave no hay ventana', async () => {
    const otra = mkdtempSync(join(tmpdir(), 'kirchi-sin-'))
    try {
      expect(await ClienteTuberia.conectar(otra, 'x')).toMatchObject({ ok: false, sinVentana: true })
    } finally {
      rmSync(otra, { recursive: true, force: true })
    }
  })
})
