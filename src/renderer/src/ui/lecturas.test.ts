import { describe, expect, it } from 'vitest'
import { lecturas, magnitudDe, nombrePaso, partirCifra } from './lecturas'
import { cifra, PASOS_REGION, textoPotencia, type FilaMedicion } from './medicion'

/** Lo que se lee de una ficha: la cifra, un espacio y la unidad, como decía la fila. */
const texto = (f: { numero: string; unidad: string }) => (f.unidad ? `${f.numero} ${f.unidad}` : f.numero)

describe('las lecturas de la vista previa como fichas', () => {
  it('parte la cifra de su unidad sin cambiar lo que se lee', () => {
    for (const v of [cifra(0.78, 'V'), cifra(0.0149, 'A'), cifra(-0.0025, 'A'), textoPotencia(-0.00238), cifra(2.5e18, 'V'), cifra(undefined, 'V'), 'saturado contra V+', '152', '1,234 rpm'])
      expect(texto(partirCifra(v)), v).toBe(v)
    expect(partirCifra(cifra(0.0149, 'A'))).toEqual({ numero: '14.9', unidad: 'mA' })
    expect(partirCifra(textoPotencia(-0.00238))).toEqual({ numero: '2.38', unidad: 'mW (entrega)' })
    expect(partirCifra(cifra(-0.0025, 'A'))).toEqual({ numero: '−2.50', unidad: 'mA' })
    expect(partirCifra(cifra(undefined, 'V')).unidad).toBe('')
  })

  it('la magnitud sale de la unidad SI, con o sin prefijo', () => {
    expect(['V', 'mV', 'kV', 'µA', 'mA', 'A', 'mW', 'W', 'mW (entrega)', 'rpm', ''].map(magnitudDe)).toEqual(['v', 'v', 'v', 'i', 'i', 'i', 'p', 'p', 'p', undefined, undefined])
  })

  it('un transistor bipolar: la región como barra de tres pasos y el resto en fichas por magnitud', () => {
    const filas: FilaMedicion[] = [
      { nombre: 'Región', valor: 'saturación', pasos: PASOS_REGION.bjt },
      { nombre: 'Vbe', valor: cifra(0.78, 'V') },
      { nombre: 'Vce', valor: cifra(0.12, 'V') },
      { nombre: 'Ic', valor: cifra(0.0149, 'A') },
      { nombre: 'β', valor: '18.2' }
    ]
    const l = lecturas(filas)
    expect(l.region).toEqual({ pasos: ['corte', 'activa', 'saturación'], actual: 2, texto: 'saturación' })
    expect(l.fichas.map((f) => [f.nombre, f.magnitud, f.ancha])).toEqual([['Vbe', 'v', false], ['Vce', 'v', false], ['Ic', 'i', false], ['β', undefined, false]])
    expect(l.fichas.map(texto)).toEqual(filas.slice(1).map((f) => f.valor))
  })

  it('los pasos llegan con la fila (medicion.ts): un MOSFET usa Lineal sin mirar el nombre de sus otras filas', () => {
    const mos = lecturas([{ nombre: 'Región', valor: 'lineal', pasos: PASOS_REGION.mosfet }, { nombre: 'Vds', valor: cifra(2.98, 'V') }])
    expect(mos.region).toEqual({ pasos: ['corte', 'lineal', 'saturación'], actual: 1, texto: 'lineal' })
    expect(lecturas([{ nombre: 'Región', valor: 'lineal' }]).region).toBeNull()
  })

  it('«activa inversa» no es un paso: la barra se queda sin paso marcado y la palabra va en una ficha, sin que salte el diseño', () => {
    const inv = lecturas([{ nombre: 'Región', valor: 'activa inversa', pasos: PASOS_REGION.bjt }, { nombre: 'Vbe', valor: cifra(-0.6, 'V') }])
    expect(inv.region).toEqual({ pasos: ['corte', 'activa', 'saturación'], actual: -1, texto: 'activa inversa' })
    expect(inv.fichas[0]).toMatchObject({ nombre: 'Región', numero: 'activa inversa', unidad: '', magnitud: undefined, ancha: true })
    expect(inv.fichas).toHaveLength(2)
  })

  it('la potencia va a todo el ancho; una lectura en alerta también, sin color de magnitud', () => {
    const l = lecturas([
      { nombre: 'Voltaje', valor: cifra(1.9, 'V') },
      { nombre: 'Corriente', valor: cifra(0.045, 'A') },
      { nombre: 'Potencia', valor: textoPotencia(0.0855) },
      { nombre: 'Estado', valor: 'más corriente de la que aguanta', alerta: true }
    ])
    expect(l.region).toBeNull()
    expect(l.fichas.map((f) => [f.magnitud, f.ancha, f.alerta])).toEqual([['v', false, false], ['i', false, false], ['p', true, false], [undefined, true, true]])
  })

  it('los pasos se escriben con mayúscula inicial', () => {
    expect(['corte', 'activa', 'saturación'].map(nombrePaso)).toEqual(['Corte', 'Activa', 'Saturación'])
  })
})
