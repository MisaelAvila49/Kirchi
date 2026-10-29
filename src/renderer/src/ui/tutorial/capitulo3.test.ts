// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../../conexiones/conexiones'
import { documentoVacio, type Documento } from '../../doc/tipos'
import { pantallaDeMedidor } from '../../lienzo/medidores'
import { cajaEnMundo } from '../../piezas/transformar'
import type { Caja } from '../../piezas/tipos'
import { libreriaDePrueba } from '../../prueba/libreria'
import { CAPITULO_3 } from './capitulo3'
import type { CtxTutorial, Objetivo } from './tipos'

const lib = libreriaDePrueba().piezas
const ctx = (d: Documento, extra: Partial<CtxTutorial> = {}): CtxTutorial => ({ doc: d, con: calcularConexiones(d, lib), lib, fase: 'detenida', centro: { x: 0, y: 0 }, ...extra })
const paso = (id: string) => CAPITULO_3.pasos.find((p) => p.id === id)!
/** Documentos guardados de la aplicación con el flujo de una persona: medidas, generador y el capacitor sobre su sombra con solo el cable de arriba, o con los dos. */
const flujo = JSON.parse(readFileSync(join(import.meta.dirname, '__fixtures__/capitulo3-capacitor.json'), 'utf8')) as Record<'soloArriba' | 'completo', Documento>
const doc = (k: keyof typeof flujo): Documento => ({ ...documentoVacio(), ...structuredClone(flujo[k]) })

const cajas = (os: Objetivo[]): Caja[] => os.flatMap((o) => (o.tipo === 'zona' ? [o.caja] : []))
const marcos = (id: string, c: CtxTutorial): Caja[] => cajas([paso(id).objetivo(c), ...(paso(id).focos?.(c) ?? [])])
const seTocan = (a: Caja, b: Caja, aire = 0) => a.minX - aire <= b.maxX && b.minX - aire <= a.maxX && a.minY - aire <= b.maxY && b.minY - aire <= a.maxY
const contiene = (a: Caja, b: Caja) => a.minX <= b.minX && a.minY <= b.minY && a.maxX >= b.maxX && a.maxY >= b.maxY

describe('capítulo 3, paso del capacitor con el documento real', () => {
  it('con los dos pines unidos al nodo del LED y a la tierra el paso se cumple', () => {
    expect(paso('capacitor').hecho(ctx(doc('completo')))).toBe(true)
  })

  it('con el capacitor sobre la sombra y solo el cable de arriba: sin sombra encima de la pieza, solo el cable que falta y un marco en la tierra', () => {
    const c = ctx(doc('soloArriba'))
    expect(paso('capacitor').hecho(c)).toBe(false)
    const g = paso('capacitor').guia!(c)
    // La sombra se dibujaba encima del capacitor ya puesto, con el mismo color, y parecía que no estaba.
    expect(g.piezas).toEqual([])
    // El cable de arriba ya está: solo queda el punteado del pin de abajo a la tierra.
    expect(g.cables).toEqual([[{ x: 40, y: 4 }, { x: 40, y: 12 }, { x: 0, y: 12 }]])
    expect(paso('capacitor').fueraDeSombra!(c)).toBe(false)
    const ms = marcos('capacitor', c)
    expect(ms).toHaveLength(1)
    expect(contiene(ms[0], { minX: -0.5, minY: 11.5, maxX: 0.5, maxY: 12.5 })).toBe(true)
    // Con solo la tierra por unir el globo va debajo de ella: arriba taparía la sonda y el cable del cátodo.
    const lado = paso('capacitor').lado
    expect(typeof lado === 'function' ? lado(c) : lado).toBe('abajo')
  })

  it('antes de colocar: un marco chico en el nodo del LED y otro en la tierra, separados y sin tapar el cable del cátodo ni la sombra', () => {
    const d = doc('soloArriba')
    for (const id of Object.keys(d.piezas)) if (d.piezas[id].tipo === 'capacitor') delete d.piezas[id]
    const c = ctx(d)
    const ms = marcos('capacitor', c)
    expect(ms).toHaveLength(2)
    // Con dos marcos que se tocan el velo los junta en una caja envolvente que cubría medio circuito.
    expect(seTocan(ms[0], ms[1], 2)).toBe(false)
    const catodo = { minX: 2, minY: 3.9, maxX: 30, maxY: 4.1 }
    const sombra = { minX: 39, minY: -3, maxX: 41, maxY: 3 }
    for (const m of ms) {
      expect(seTocan(m, catodo), JSON.stringify(m)).toBe(false)
      expect(seTocan(m, sombra), JSON.stringify(m)).toBe(false)
      expect((m.maxX - m.minX) * (m.maxY - m.minY)).toBeLessThanOrEqual(40)
    }
    expect(paso('capacitor').guia!(c).piezas).toHaveLength(1)
    const lado = paso('capacitor').lado
    expect(typeof lado === 'function' ? lado(c) : lado).toBe('arriba')
  })
})

describe('capítulo 3, paso de simular: cada instrumento con el lugar donde se lee', () => {
  it('enmarca la pantalla del medidor rápido, la cifra de la sonda, la cifra del multímetro y su fila en Mediciones, sin que los marcos se junten', () => {
    const d = doc('soloArriba')
    const c = ctx(d, { fase: 'corriendo' })
    const p = paso('simular')
    const focos = p.focos!(c)
    const ms = cajas(focos)
    const sondas = Object.values(d.sondas!)
    const medidor = sondas.find((s) => s.tipo === 'medidor')!
    expect(ms.some((m) => contiene(m, pantallaDeMedidor(medidor).caja))).toBe(true)
    // La cifra de la sonda de voltaje va a la derecha de su bandera: unas siete unidades desde el punto.
    const v = sondas.find((s) => s.tipo === 'voltaje')!
    expect(ms.some((m) => m.minX <= v.x && m.maxX >= v.x + 7)).toBe(true)
    // La cifra del multímetro va a su izquierda, fuera de la caja de la pieza.
    const mm = Object.values(d.piezas).find((q) => q.tipo === 'multimetro')!
    const cuerpo = cajaEnMundo(mm, lib.get('multimetro')!)
    expect(ms.some((m) => contiene(m, cuerpo) && m.minX <= cuerpo.minX - 6)).toBe(true)
    expect(focos).toContainEqual({ tipo: 'control', selector: '#panel-derecho .fila-instrumento', respaldo: '.riel-boton[data-panel="mediciones"]' })
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) expect(seTocan(ms[i], ms[j]), `${JSON.stringify(ms[i])} y ${JSON.stringify(ms[j])}`).toBe(false)
  })
})
