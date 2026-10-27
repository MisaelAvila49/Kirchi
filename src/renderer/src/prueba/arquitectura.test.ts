import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = join(import.meta.dirname, '..')

/** Quién puede leer `doc.cables`: la conectividad sale de `Conexiones` y nadie más la recalcula. Los archivos de la lista
 * solo guardan, copian, dibujan o miden geometría de cables. */
const PERMITIDOS = [
  'conexiones/', // dueña de la conectividad
  'doc/', // el modelo del documento
  'archivo/', // lee y escribe el .kir
  'editor/', // edita los cables
  'edicion/', // las operaciones de edición ejecutan lo mismo que los gestos
  'sinVentana/', // el modo sin ventana lee las redes de un documento y compila su netlist
  'plantillas/', // copia cables al armar y colocar
  'exportar/', // dibuja el circuito en SVG, PNG y PDF
  'prueba/', // circuitos de prueba y oráculos
  'lienzo/', // dibuja y evita encimar textos con la geometría de los cables (la red de cada cable ya viene de Conexiones)
  'App.tsx', // centra la vista en los cables de una red y cuenta lo seleccionado
  'ui/geometriaMinimapa.ts', // caja y trazo del minimapa
  'ui/vistaInspector.ts', // cuenta cables para el resumen
  'ui/tutorial/arranques.ts' // arma circuitos de arranque del tutorial
]

function archivos(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== 'pkg') out.push(...archivos(ruta))
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(ruta)
  }
  return out
}

describe('arquitectura', () => {
  it('nadie lee los cables del documento fuera de su lugar', () => {
    const faltas: string[] = []
    for (const f of archivos(RAIZ)) {
      const rel = relative(RAIZ, f).split(sep).join('/')
      if (PERMITIDOS.some((p) => (p.endsWith('/') ? rel.startsWith(p) : rel === p))) continue
      readFileSync(f, 'utf8').split('\n').forEach((linea, i) => {
        if (/\bdoc\.cables\b|\.cables\[/.test(linea)) faltas.push(`${rel}:${i + 1}: lee los cables del documento, usa Conexiones`)
      })
    }
    expect(faltas).toEqual([])
  })

  it('la lista de permitidos no tiene entradas que ya no existen', () => {
    const rels = archivos(RAIZ).map((f) => relative(RAIZ, f).split(sep).join('/'))
    for (const p of PERMITIDOS) expect(rels.some((r) => (p.endsWith('/') ? r.startsWith(p) : r === p)), p).toBe(true)
  })

  it('la edición y el modo sin ventana no dependen de la interfaz ni del navegador', () => {
    const faltas: string[] = []
    const deInterfaz = /\bfrom\s+['"](?:\.\.?\/)+(?:ui|lienzo\/contexto[^'"]*)(?:\/[^'"]*)?['"]|\bfrom\s+['"]solid-js(?:\/[^'"]*)?['"]/
    const delNavegador = /(?<![\w.])(?:document|window)\./
    for (const f of archivos(RAIZ)) {
      const rel = relative(RAIZ, f).split(sep).join('/')
      if (!rel.startsWith('edicion/') && !rel.startsWith('sinVentana/')) continue
      readFileSync(f, 'utf8').split('\n').forEach((linea, i) => {
        const codigo = linea.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '').replace(/\/\*.*?\*\//g, '')
        if (deInterfaz.test(codigo)) faltas.push(`${rel}:${i + 1}: importa de la interfaz`)
        if (delNavegador.test(codigo)) faltas.push(`${rel}:${i + 1}: usa document o window`)
      })
    }
    expect(faltas).toEqual([])
  })
})
