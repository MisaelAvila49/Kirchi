import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { leerKicad } from './kicad'

// Espera KIRCHI_LOTE_IMPORTAR con la subcarpeta lote/kicad (esquemas .kicad_sch, también dentro de subcarpetas); sin la variable se omite.
const RAIZ = process.env.KIRCHI_LOTE_IMPORTAR
const LOTE = RAIZ ? join(RAIZ, 'lote', 'kicad') : ''
const hay = LOTE !== '' && existsSync(LOTE)

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const r = join(dir, n)
    return statSync(r).isDirectory() ? archivos(r) : r.endsWith('.kicad_sch') ? [r] : []
  })
}

describe.skipIf(!hay)('lote local de KiCad', () => {
  it('ningún archivo lanza y casi no quedan pines sueltos', () => {
    const todos = hay ? archivos(LOTE) : []
    let pinesTotal = 0
    let sueltos = 0
    let sinPines = 0
    let piezas = 0
    const lineas: string[] = []
    for (const ruta of todos) {
      // Las hojas hijas se buscan por nombre entre los archivos de la misma carpeta y sus subcarpetas.
      const carpeta = join(ruta, '..')
      const hermanas: Record<string, string> = {}
      for (const f of archivos(carpeta)) hermanas[f.slice(carpeta.length + 1).split('\\').join('/')] = readFileSync(f, 'utf8')
      let c: ReturnType<typeof leerKicad> | undefined
      expect(() => (c = leerKicad(readFileSync(ruta, 'utf8'), ruta, hermanas))).not.toThrow()
      if (!c) continue
      const enRed = new Set(c.redes.flatMap((r) => r.pines.map((p) => `${p.ref}|${p.pin}`)))
      const conPines = c.piezas.filter((p) => p.pines.length > 0)
      const s = conPines.flatMap((p) => p.pines.filter((q) => !enRed.has(`${p.ref}|${q.numero}`)))
      pinesTotal += conPines.reduce((a, p) => a + p.pines.length, 0)
      sueltos += s.length
      piezas += c.piezas.length
      sinPines += c.piezas.length - conPines.length
      lineas.push(`${ruta.slice(LOTE.length + 1)}: ${c.piezas.length} piezas, ${c.redes.length} redes, ${s.length} pines sueltos, ${c.avisos.length} avisos`)
    }
    process.stdout.write(`\nLote KiCad: ${todos.length} archivos, ${piezas} piezas, ${sinPines} sin pines, ${pinesTotal} pines, ${sueltos} sueltos\n${lineas.join('\n')}\n`)
    expect(todos.length).toBeGreaterThan(0)
  })
})
