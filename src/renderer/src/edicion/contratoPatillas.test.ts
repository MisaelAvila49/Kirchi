// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { libreriaDePrueba, RAIZ_COMPONENTES } from '../prueba/libreria'

const guardado = JSON.parse(readFileSync(join(RAIZ_COMPONENTES, 'patillas.json'), 'utf8')) as Record<string, string[]>
const lib = libreriaDePrueba().piezas

/** Lo que el contrato guardado exige y la librería ya no cumple, como frases. */
function incumplimientos(contrato: Record<string, string[]>, ids: Map<string, string[]>): string[] {
  const salida: string[] = []
  for (const [tipo, patillas] of Object.entries(contrato)) {
    const actuales = ids.get(tipo)
    if (!actuales) {
      salida.push(`falta la pieza «${tipo}»`)
      continue
    }
    for (const id of patillas) if (!actuales.includes(id)) salida.push(`«${tipo}» perdió la patilla «${id}»`)
  }
  return salida
}

const idsDeLaLibreria = () => new Map([...lib].map(([tipo, def]) => [tipo, def.pines.map((p) => p.id)]))

describe('contrato de patillas', () => {
  it('la librería conserva todas las patillas guardadas', () => {
    expect(incumplimientos(guardado, idsDeLaLibreria())).toEqual([])
  })

  it('el archivo guardado cubre todas las piezas base de la librería', () => {
    const sinGuardar = [...lib.keys()].filter((tipo) => !(tipo in guardado) && !/-\d+$/.test(tipo))
    expect(sinGuardar).toEqual([])
  })

  it('quitar o renombrar una patilla en una copia falla con el tipo y el id', () => {
    const copia = idsDeLaLibreria()
    copia.set('resistencia', ['1'])
    copia.set('amp-op', ['-', '+', 'SALIDA', 'V+', 'V-'])
    copia.delete('led')
    expect(incumplimientos(guardado, copia)).toEqual(expect.arrayContaining(['falta la pieza «led»', '«resistencia» perdió la patilla «2»', '«amp-op» perdió la patilla «OUT»']))
  })

  it('agregar una patilla no rompe el contrato', () => {
    const copia = idsDeLaLibreria()
    copia.set('resistencia', ['1', '2', '3'])
    expect(incumplimientos(guardado, copia)).toEqual([])
  })
})
