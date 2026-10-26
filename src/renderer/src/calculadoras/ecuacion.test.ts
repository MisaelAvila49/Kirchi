import { describe, expect, it } from 'vitest'
import { leerEnVozAlta } from './ecuacion'

describe('leerEnVozAlta', () => {
  it('símbolos y operadores en palabras', () => {
    expect(leerEnVozAlta('Vsalida = Vin · R2 / (R1 + R2)')).toBe('Vsalida igual a Vin por R2 entre abre paréntesis R1 más R2 cierra paréntesis')
    expect(leerEnVozAlta('fc = 1 / (2π · R · C)')).toBe('fc igual a 1 entre abre paréntesis 2 pi por R por C cierra paréntesis')
    expect(leerEnVozAlta('f0 = √(fL · fH)')).toBe('f0 igual a raíz cuadrada de abre paréntesis fL por fH cierra paréntesis')
    expect(leerEnVozAlta('f = 1 / (ln 2 · R)')).toContain('logaritmo natural de 2')
  })
  it('unidades con prefijo: «4.7 kΩ» se dice «4.7 kiloohmios» y las cifras negativas dicen «menos»', () => {
    expect(leerEnVozAlta('Vsalida = 9 V · 5.6 kΩ / (4.7 kΩ + 5.6 kΩ) = 4.89 V')).toBe(
      'Vsalida igual a 9 voltios por 5.6 kiloohmios entre abre paréntesis 4.7 kiloohmios más 5.6 kiloohmios cierra paréntesis igual a 4.89 voltios'
    )
    expect(leerEnVozAlta('Ganancia = −10 kΩ / 1 kΩ = −10')).toBe('Ganancia igual a menos 10 kiloohmios entre 1 kiloohmio igual a menos 10')
    expect(leerEnVozAlta('C = 100 nF · 10 µF · 5 mA · 1.6 kHz')).toContain('100 nanofaradios por 10 microfaradios por 5 miliamperios por 1.6 kilohercios')
    expect(leerEnVozAlta('D = 60.5 %')).toBe('D igual a 60.5 por ciento')
  })
  it('la unidad va en singular solo con un 1 exacto: «1 kΩ», «1.5 kΩ», «11 V»', () => {
    expect(leerEnVozAlta('R = 1 kΩ')).toBe('R igual a 1 kiloohmio')
    expect(leerEnVozAlta('R = 1.5 kΩ')).toBe('R igual a 1.5 kiloohmios')
    expect(leerEnVozAlta('V = 11 V')).toBe('V igual a 11 voltios')
  })
  it('un nombre como «Vsalida» o «Rin» no se toma por unidad', () => {
    expect(leerEnVozAlta('Rin = 1 kΩ')).toBe('Rin igual a 1 kiloohmio')
    expect(leerEnVozAlta('Vsalida = Ganancia · Vin')).toBe('Vsalida igual a Ganancia por Vin')
  })
})
