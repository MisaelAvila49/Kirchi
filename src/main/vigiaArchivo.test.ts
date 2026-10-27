// @vitest-environment node
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VigiaArchivo } from './vigiaArchivo'

let dir: string
let vigia: VigiaArchivo
let avisos: string[]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kirchi-vigia-'))
  avisos = []
  vigia = new VigiaArchivo((r) => void avisos.push(r), 20)
})
afterEach(() => {
  vigia.cerrar()
  rmSync(dir, { recursive: true, force: true })
})

const escribir = (ruta: string, texto: string, segundos: number) => {
  writeFileSync(ruta, texto)
  const t = new Date(Date.now() + segundos * 1000)
  utimesSync(ruta, t, t)
}

describe('vigía del archivo abierto', () => {
  it('avisa una vez cuando otro cambia el archivo, y no cuando lo guarda la propia ventana', () => {
    const ruta = join(dir, 'a.kir')
    escribir(ruta, 'uno', 0)
    vigia.vigilar(ruta)
    vigia.revisarAhora()
    expect(avisos).toEqual([])
    escribir(ruta, 'dos', 5)
    vigia.conocer()
    vigia.revisarAhora()
    expect(avisos).toEqual([])
    escribir(ruta, 'tres, de otro programa', 10)
    vigia.revisarAhora()
    vigia.revisarAhora()
    expect(avisos).toEqual([ruta])
  })

  it('el sondeo lo nota solo, y cambiar de archivo deja de vigilar el anterior', async () => {
    const a = join(dir, 'a.kir')
    const b = join(dir, 'b.kir')
    escribir(a, 'uno', 0)
    escribir(b, 'uno', 0)
    vigia.vigilar(a)
    escribir(a, 'cambio', 5)
    const fin = Date.now() + 3000
    while (avisos.length === 0 && Date.now() < fin) await new Promise((r) => setTimeout(r, 20))
    expect(avisos).toEqual([a])
    vigia.vigilar(b)
    escribir(a, 'otro cambio', 10)
    vigia.revisarAhora()
    expect(avisos).toEqual([a])
  })

  it('un archivo que desaparece no avisa: puede estar a medio reemplazarse', () => {
    const a = join(dir, 'a.kir')
    escribir(a, 'uno', 0)
    vigia.vigilar(a)
    rmSync(a)
    vigia.revisarAhora()
    expect(avisos).toEqual([])
  })
})
