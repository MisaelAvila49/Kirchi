// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../../conexiones/conexiones'
import { libreriaDePrueba } from '../../prueba/libreria'
import { arranqueDeCapitulo } from './arranques'
import { BOTON_CURSORES, CAPITULO_3 } from './capitulo3'

const lib = libreriaDePrueba().piezas

describe('capítulo 3: el paso de cursores señala el botón Cursores de la barra del instrumento', () => {
  it('el selector apunta a un solo botón, el de la acción «cursores», y no al de Pausar', () => {
    const doc = arranqueDeCapitulo('archivo')!
    const ctx = { doc, con: calcularConexiones(doc, lib), lib, fase: 'detenida' as const, centro: { x: 0, y: 0 } }
    const barra = readFileSync(join(import.meta.dirname, '../instrumento/BarraInstrumento.tsx'), 'utf8')
    const defs = readFileSync(join(import.meta.dirname, '../instrumento/barra.ts'), 'utf8')
    const paso = CAPITULO_3.pasos.find((p) => p.id === 'cursores')!
    expect(paso.objetivo(ctx)).toEqual({ tipo: 'control', selector: BOTON_CURSORES })
    expect(BOTON_CURSORES).toBe('.barra-instrumento [data-accion="cursores"]')
    // Un solo lugar dibuja los botones, con su acción como atributo, y una sola definición se llama «cursores» y se rotula así.
    expect(barra.match(/data-accion=\{a\}/g)).toHaveLength(1)
    expect(defs.match(/accion: 'cursores'/g)).toHaveLength(1)
    expect(defs).toMatch(/cursores: \{[^}]*corto: 'Cursores'/)
  })
})
