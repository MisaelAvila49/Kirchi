// @vitest-environment happy-dom
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { escribirKir, leerKir } from '../archivo/kir'
import { formatoDe } from '../archivo/formatos'
import type { Documento } from '../doc/tipos'
import { libreriaDePrueba } from './libreria'
import { construir, DEFINICIONES } from './plantillasIncluidas'

const lib = libreriaDePrueba().piezas
const COLECCIONES = ['piezas', 'cables', 'etiquetas', 'notas', 'figuras', 'sondas', 'alimentaciones', 'analisis'] as const

const llaves = (doc: Documento, c: (typeof COLECCIONES)[number]): string[] => Object.keys(doc[c] ?? {}).sort()

/** Escribe el documento, lo lee otra vez y exige las mismas llaves en cada colección y el mismo formato. */
function reescribir(nombre: string, doc: Documento): void {
  const lectura = leerKir(escribirKir(doc, 'prueba'))
  expect(lectura.ok, nombre).toBe(true)
  if (!lectura.ok) return
  expect(lectura.soloLectura, `${nombre}: solo lectura`).toBe(false)
  for (const c of COLECCIONES) expect(llaves(lectura.doc, c), `${nombre}: ${c}`).toEqual(llaves(doc, c))
  expect(formatoDe(lectura.doc), `${nombre}: formato`).toBe(formatoDe(doc))
}

describe('compatibilidad de los archivos', () => {
  for (const def of DEFINICIONES) {
    it(`la plantilla ${def.id} se reescribe sin perder colecciones`, () => {
      reescribir(def.id, construir(def, lib))
    })
  }

  it('un circuito con medidores rápidos (voltaje y corriente, DC y AC) se reescribe sin perderlos', () => {
    const doc = construir(DEFINICIONES[0], lib)
    doc.sondas = {
      ...doc.sondas,
      m1: { id: 'm1', tipo: 'medidor', x: 0, y: 0, magnitud: 'voltaje', modo: 'dc', pantalla: { dx: 7, dy: -6 }, ref: 'M1' },
      m2: { id: 'm2', tipo: 'medidor', x: 2, y: 0, magnitud: 'corriente', modo: 'ac', pantalla: { dx: -8, dy: 8 }, ref: 'M2' }
    }
    reescribir('medidores', doc)
    const lectura = leerKir(escribirKir(doc, 'prueba'))
    expect(lectura.ok && lectura.doc.sondas?.m2).toEqual(doc.sondas.m2)
  })

  const carpeta = join(import.meta.dirname, '../../../../PruebasManualesKirchi')
  const kirs = existsSync(carpeta) ? readdirSync(carpeta).filter((n) => n.endsWith('.kir')) : []
  for (const nombre of kirs) {
    it(`el archivo ${nombre} se abre, se reescribe y conserva sus colecciones`, () => {
      const lectura = leerKir(new Uint8Array(readFileSync(join(carpeta, nombre))))
      expect(lectura.ok).toBe(true)
      if (lectura.ok) reescribir(nombre, lectura.doc)
    })
  }
})
