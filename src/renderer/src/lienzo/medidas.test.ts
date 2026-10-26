import { describe, expect, it } from 'vitest'
import type { Etiqueta, Nota } from '../doc/tipos'
import { anchoEnEm } from './metricas'
import {
  altoNota, anchoNotaAuto, anchoNotaMinimo, anchoSigueAlTexto, anclaTextoEtiqueta, cajaEtiqueta, cajaNota, disposicionNota, formaEtiqueta, porcentajeZoom, ZOOM_100,
  ANCHO_CABLE, RADIO_UNION, ZOOM_INICIAL
} from './medidas'

const etq = (rot: Etiqueta['rot']): Etiqueta => ({ id: 'e', nombre: 'VCC', x: 10, y: 0, rot })
const cerca = (a: number[], b: number[]) => {
  expect(a).toHaveLength(b.length)
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9))
}

describe('punto de unión', () => {
  it('es un punto discreto: de 2.5 a 3.5 veces el grosor del cable, y no depende de cuántos cables concurren', () => {
    expect(2 * RADIO_UNION).toBeGreaterThanOrEqual(2.5 * ANCHO_CABLE)
    expect(2 * RADIO_UNION).toBeLessThanOrEqual(3.5 * ANCHO_CABLE)
  })
})

describe('medidas', () => {
  // Largo de la bandera: 1 + 3 caracteres × 1.6 × 0.6 + 0.8 = 4.68.
  it('la bandera de la etiqueta apunta a su punto de conexión', () => {
    cerca(formaEtiqueta(etq(0)), [10, 0, 11, -1, 14.68, -1, 14.68, 1, 11, 1, 10, 0])
  })

  it('la bandera girada 180° crece hacia la izquierda', () => {
    const c = cajaEtiqueta(etq(180))
    cerca([c.minX, c.minY, c.maxX, c.maxY], [5.32, -1, 10, 1])
  })

  it('el texto de la etiqueta se ancla dentro de la bandera o tras su punta', () => {
    expect(anclaTextoEtiqueta(etq(0))).toEqual({ x: expect.closeTo(11.4, 9), y: 0, alinear: 'izq' })
    expect(anclaTextoEtiqueta(etq(180))).toEqual({ x: expect.closeTo(8.6, 9), y: 0, alinear: 'der' })
  })

  // La bandera es simétrica respecto de su eje: reflejarla equivale a otra de sus cuatro orientaciones.
  it('en sus cuatro orientaciones el texto queda dentro de la bandera y se lee de izquierda a derecha o de arriba abajo', () => {
    // Largo de la bandera 4.68; el texto empieza a 1.4 de la punta y mide 3 × 1.6 × 0.6 = 2.88: termina a 4.28, dentro.
    const horizontales = [[0, 11.4, 'izq'], [180, 8.6, 'der']] as const
    for (const [rot, x, alinear] of horizontales) {
      const a = anclaTextoEtiqueta(etq(rot))
      expect(a).toEqual({ x: expect.closeTo(x, 9), y: 0, alinear })
      expect(a.giro).toBeUndefined()
    }
    const verticales = [[90, 1.4, 'izq'], [270, -1.4, 'der']] as const
    for (const [rot, y, alinear] of verticales) {
      const a = anclaTextoEtiqueta(etq(rot))
      expect(a).toEqual({ x: 10, y: expect.closeTo(y, 9), alinear, giro: 90 })
      // Gire como gire, el texto cabe en la caja de la bandera.
      const c = cajaEtiqueta(etq(rot))
      const ini = alinear === 'izq' ? a.y : a.y - 2.88
      expect(ini).toBeGreaterThanOrEqual(c.minY - 1e-9)
      expect(ini + 2.88).toBeLessThanOrEqual(c.maxY + 1e-9)
    }
  })

  it('la caja de la etiqueta es la de su bandera, también vertical', () => {
    const c = cajaEtiqueta(etq(90))
    cerca([c.minX, c.minY, c.maxX, c.maxY], [9, 0, 11, 4.68])
    const d = cajaEtiqueta(etq(270))
    cerca([d.minX, d.minY, d.maxX, d.maxY], [9, -4.68, 11, 0])
  })

  it('la nota mide sus renglones', () => {
    const n: Nota = { id: 'n', x: 2, y: 4, ancho: 8, texto: 'a\nb' }
    expect(altoNota(n)).toBeCloseTo(5.2, 9)
    const c = cajaNota(n)
    cerca([c.minX, c.minY, c.maxX, c.maxY], [2, 4, 10, 9.2])
    expect(anchoNotaAuto('hola')).toBe(8)
    // El ancho automático es el del renglón más largo medido en Mona Sans más el margen, en pasos de la rejilla fina.
    const largo = 'x'.repeat(40)
    expect(anchoNotaAuto(largo)).toBe(Math.ceil(anchoEnEm(largo, { fuente: 'sans', negrita: false, cursiva: false }) * 1.6 + 1.6))
    expect(anchoNotaAuto('x'.repeat(2000))).toBe(320)
  })

  it('con formato: la letra más grande agranda la bandera, el renglón y el ancho automático', () => {
    const grande: Etiqueta = { ...etq(0), formato: { tam: 4 } }
    // 4 mm es el doble de 2 mm: la bandera mide el doble de alto y su texto el doble de ancho.
    const f = formaEtiqueta(grande)
    expect(f[3]).toBeCloseTo(-2, 9)
    expect(f[4] - 10).toBeCloseTo(2 * (14.68 - 10), 9)
    expect(anclaTextoEtiqueta(grande).x).toBeCloseTo(12.8, 9)
    const n: Nota = { id: 'n', x: 0, y: 0, ancho: 30, texto: 'a\nb', formato: { tam: 4 } }
    expect(altoNota(n)).toBeCloseTo(1.2 + 2 * 4, 9)
    expect(anchoNotaAuto('hola', { tam: 10 })).toBeGreaterThan(anchoNotaAuto('hola'))
  })

  it('una nota reparte su texto en el ancho de la caja y no se angosta más que su palabra más larga', () => {
    const n: Nota = { id: 'n', x: 0, y: 0, ancho: 12, texto: 'una nota con varias palabras', anchoFijo: true }
    const d = disposicionNota(n)
    expect(d.renglones.length).toBeGreaterThan(1)
    for (const r of d.renglones) expect(r.ancho).toBeLessThanOrEqual(12 - 1.6 + 1e-9)
    expect(disposicionNota(n)).toBe(d)
    expect(anchoNotaMinimo({ texto: 'a b', formato: undefined })).toBe(4)
    expect(anchoNotaMinimo({ texto: 'Anticonstitucionalmente', formato: undefined })).toBe(anchoNotaAuto('Anticonstitucionalmente'))
  })

  it('una nota antigua sin anchoFijo no cambia de forma: el ancho automático sigue al texto y el guardado no se toca', () => {
    const vieja: Nota = { id: 'n', x: 0, y: 0, ancho: 10, texto: 'MEDIR CON EL MULTÍMETRO' }
    const d = disposicionNota(vieja)
    expect(d.renglones).toHaveLength(1)
    expect(cajaNota(vieja).maxX - cajaNota(vieja).minX).toBeCloseTo(d.anchoArea + 1.6, 9)
    expect(cajaNota(vieja).maxX).toBeGreaterThan(10)
    expect(vieja.ancho).toBe(10)
    // Con el ancho fijado por el usuario sí se reparte en la caja.
    expect(disposicionNota({ ...vieja, anchoFijo: true }).renglones.length).toBeGreaterThan(1)
    // El tope sigue siendo el máximo de una nota.
    expect(cajaNota({ ...vieja, texto: 'x'.repeat(3000) }).maxX).toBeLessThanOrEqual(320 + 1e-9)
  })

  it('el margen de la caja crece con la letra para que la cursiva y el serif no sobresalgan', () => {
    const chica: Nota = { id: 'n', x: 0, y: 0, ancho: 20, texto: 'hola' }
    const grande: Nota = { ...chica, formato: { tam: 10, cursiva: true, fuente: 'serif' } }
    expect(disposicionNota(chica).padX).toBe(0.8)
    expect(disposicionNota(grande).padX).toBeCloseTo(0.2 * 8, 9)
    const d = disposicionNota(grande)
    expect(cajaNota(grande).maxX - cajaNota(grande).minX).toBeCloseTo(d.anchoArea + 2 * d.padX, 9)
    expect(altoNota(grande)).toBeCloseTo(2 * d.padY + d.renglones.length * d.linea, 9)
    expect(d.padY).toBeGreaterThan(0.6)
  })

  it('la disposición no depende de la posición: una nota movida reutiliza la de su contenido', () => {
    const n: Nota = { id: 'n', x: 0, y: 0, ancho: 12, texto: 'una nota con varias palabras', anchoFijo: true }
    const movida = { ...n, x: 40, y: 8 }
    expect(disposicionNota(movida)).toBe(disposicionNota(n))
    expect(disposicionNota({ ...n, texto: 'otro texto' })).not.toBe(disposicionNota(n))
    expect(disposicionNota({ ...n, formato: { tam: 3 } })).not.toBe(disposicionNota(n))
    expect(disposicionNota({ ...n, ancho: 20 })).not.toBe(disposicionNota(n))
  })

  it('una nota con un ancho menor que el mínimo se dibuja con el mínimo', () => {
    const n: Nota = { id: 'n', x: 0, y: 0, ancho: 0.5, texto: 'a b', anchoFijo: true }
    expect(cajaNota(n).maxX - cajaNota(n).minX).toBeGreaterThanOrEqual(4)
    expect(disposicionNota(n).anchoArea).toBeCloseTo(4 - 1.6, 9)
  })

  it('el ancho sigue al texto mientras el usuario no lo fije con las asas', () => {
    expect(anchoSigueAlTexto({})).toBe(true)
    expect(anchoSigueAlTexto({ anchoFijo: true })).toBe(false)
  })

  it('100 % es tamaño real a 96 ppp', () => {
    expect(ZOOM_100).toBeCloseTo(4.7244, 4)
    expect(porcentajeZoom(ZOOM_100)).toBe(100)
    expect(porcentajeZoom(ZOOM_INICIAL)).toBe(200)
  })
})
