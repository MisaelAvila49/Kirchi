import { describe, expect, it } from 'vitest'
import { cambiarUnidad, conservarNumero, etiquetaUnidad, leerCampo, opcionesDeUnidad, partirValor, textoDeCampo } from './unidades'

describe('unidades con selector', () => {
  it('cada unidad ofrece exactamente los prefijos pedidos, con el prefijo y la unidad juntos', () => {
    const rotulos = (u: string) => opcionesDeUnidad(u)!.map((o) => etiquetaUnidad(o, u))
    expect(rotulos('Ω')).toEqual(['mΩ', 'Ω', 'kΩ', 'MΩ'])
    expect(rotulos('F')).toEqual(['pF', 'nF', 'µF', 'mF'])
    expect(rotulos('H')).toEqual(['nH', 'µH', 'mH', 'H'])
    expect(rotulos('V')).toEqual(['mV', 'V', 'kV'])
    expect(rotulos('A')).toEqual(['µA', 'mA', 'A'])
    expect(rotulos('Hz')).toEqual(['Hz', 'kHz', 'MHz'])
    expect(rotulos('s')).toEqual(['ns', 'µs', 'ms', 's'])
  })

  it('el micro de la lista es el signo U+00B5, el mismo que se muestra en el resto de la interfaz', () => {
    expect(etiquetaUnidad(opcionesDeUnidad('F')![2], 'F').codePointAt(0)).toBe(0xb5)
  })

  it('una unidad sin prefijos (%, grados, sin unidad) no tiene selector', () => {
    for (const u of ['%', '°', '', 'W']) expect(opcionesDeUnidad(u)).toBeNull()
  })

  it('parte un valor en número y prefijo: 4700 Ω → 4.7 kΩ, 0.0001 F → 100 µF', () => {
    expect(partirValor(4700, 'Ω')).toEqual({ numero: '4.7', prefijo: 'k' })
    expect(partirValor(1e-4, 'F')).toEqual({ numero: '100', prefijo: 'µ' })
    expect(partirValor(0.5, 'Ω')).toEqual({ numero: '500', prefijo: 'm' })
    expect(partirValor(2.2e6, 'Ω')).toEqual({ numero: '2.2', prefijo: 'M' })
    expect(partirValor(33e-12, 'F')).toEqual({ numero: '33', prefijo: 'p' })
    expect(partirValor(1000, 'Hz')).toEqual({ numero: '1', prefijo: 'k' })
  })

  it('un valor fuera de la lista se queda en el prefijo más cercano: 2 F → 2000 mF, 5 MV → 5000 kV', () => {
    expect(partirValor(2, 'F')).toEqual({ numero: '2000', prefijo: 'm' })
    expect(partirValor(5e6, 'V')).toEqual({ numero: '5000', prefijo: 'k' })
    expect(partirValor(1e-13, 'F')).toEqual({ numero: '0.1', prefijo: 'p' })
  })

  it('el cero cae en el prefijo de uso común de la unidad y no deja ruido de coma flotante', () => {
    expect(partirValor(0, 'Ω')).toEqual({ numero: '0', prefijo: '' })
    expect(partirValor(0, 'F')).toEqual({ numero: '0', prefijo: 'n' })
    expect(partirValor(0.1 + 0.2, 'V')).toEqual({ numero: '300', prefijo: 'm' })
    expect(partirValor(4.7e-6, 'F')).toEqual({ numero: '4.7', prefijo: 'µ' })
  })

  it('cambiarUnidad escribe el mismo valor con otro prefijo: 4.7 kΩ → 4700 Ω y de vuelta', () => {
    const a = cambiarUnidad(4700, 'Ω', '')
    expect(a).toEqual({ numero: '4700', prefijo: '' })
    expect(leerCampo(a.numero, a.prefijo, 'Ω')!.valor).toBe(4700)
    expect(cambiarUnidad(4700, 'Ω', 'M')).toEqual({ numero: '0.0047', prefijo: 'M' })
    expect(cambiarUnidad(1e-7, 'F', 'p')).toEqual({ numero: '100000', prefijo: 'p' })
    expect(cambiarUnidad(1e-7, 'F', 'm')).toEqual({ numero: '0.0001', prefijo: 'm' })
  })

  it('elegir otra unidad conserva el número y cambia el valor: 4.7 kΩ pasa a 4.7 Ω', () => {
    expect(conservarNumero('4.7', 'k', 'Ω', '')).toEqual({ numero: '4.7', prefijo: '', texto: '4.7' })
    expect(conservarNumero('4.7', '', 'Ω', 'M')).toEqual({ numero: '4.7', prefijo: 'M', texto: '4.7M' })
    expect(conservarNumero('100', 'n', 'F', 'µ')).toEqual({ numero: '100', prefijo: 'µ', texto: '100u' })
    expect(leerCampo('4.7', '', 'Ω')!.valor).toBe(4.7)
  })

  it('si lo escrito no es un número solo (4k7), se lee, se muestra como número y la unidad nueva lo acompaña', () => {
    expect(conservarNumero('4k7', 'k', 'Ω', '')).toEqual({ numero: '4.7', prefijo: '', texto: '4.7' })
    expect(conservarNumero('abc', 'k', 'Ω', '')).toBeNull()
  })

  it('un número solo toma el prefijo elegido: 4.7 con kΩ son 4700 Ω', () => {
    expect(leerCampo('4.7', 'k', 'Ω')).toEqual({ valor: 4700, prefijo: 'k' })
    expect(leerCampo('100', 'n', 'F')!.valor).toBeCloseTo(1e-7, 20)
    expect(leerCampo('0.5', '', 'A')).toEqual({ valor: 0.5, prefijo: '' })
  })

  it('escribir «4k7», «4.7 k», «4.7k», «4700» con unidad o «4.7 kΩ» da el mismo valor y mueve el selector', () => {
    for (const t of ['4k7', '4.7 k', '4.7k', '4.7 kΩ', '4.7kΩ', '4.7 KΩ', '4700 Ω', '4R7k']) {
      const r = leerCampo(t, 'Ω', 'Ω')
      if (t === '4R7k') {
        expect(r, t).toBeNull()
        continue
      }
      expect(r!.valor, t).toBeCloseTo(4700, 6)
      expect(r!.prefijo, t).toBe(t === '4700 Ω' ? '' : 'k')
    }
  })

  it('un número con prefijo escrito ignora el selector, y uno sin él lo respeta (también con espacios)', () => {
    expect(leerCampo('10u', 'n', 'F')).toEqual({ valor: 1e-5, prefijo: 'µ' })
    expect(leerCampo(' 10 ', 'µ', 'F')!.valor).toBeCloseTo(1e-5, 20)
    expect(leerCampo('2.2 m', '', 'H')!.prefijo).toBe('m')
  })

  it('el micro escrito con U+00B5, con la letra griega U+03BC o con u mueve el selector a µ', () => {
    for (const t of ['100 µF', '100 μF', '100u', '100 uF']) expect(leerCampo(t, 'n', 'F')).toEqual({ valor: 1e-4, prefijo: 'µ' })
  })

  it('lo que no se lee o es de otra unidad da null (el campo sigue diciendo su error)', () => {
    expect(leerCampo('', 'k', 'Ω')).toBeNull()
    expect(leerCampo('abc', 'k', 'Ω')).toBeNull()
    expect(leerCampo('5 V', 'k', 'Ω')).toBeNull()
    expect(leerCampo('4.', 'k', 'Ω')).toBeNull()
    expect(leerCampo('1e3', 'k', 'Ω')).toBeNull()
  })

  it('un negativo se lee con su signo (offset de un generador)', () => {
    expect(leerCampo('-2.5', '', 'V')).toEqual({ valor: -2.5, prefijo: '' })
    expect(leerCampo('-500', 'm', 'V')!.valor).toBeCloseTo(-0.5, 12)
    expect(partirValor(-0.5, 'V')).toEqual({ numero: '-500', prefijo: 'm' })
  })

  it('el texto que se guarda en la propiedad es el de siempre: número y prefijo ASCII sin unidad', () => {
    expect(textoDeCampo('4.7', 'k')).toBe('4.7k')
    expect(textoDeCampo('100', 'µ')).toBe('100u')
    expect(textoDeCampo('4700', '')).toBe('4700')
    expect(textoDeCampo('0.5', 'm')).toBe('0.5m')
    expect(textoDeCampo('2.2', 'M')).toBe('2.2M')
  })
})

describe('unidades de las perillas en vivo', () => {
  it('lx y N·m llevan prefijos; los °C no', () => {
    const rotulos = (u: string) => opcionesDeUnidad(u)!.map((o) => etiquetaUnidad(o, u))
    expect(rotulos('lx')).toEqual(['lx', 'klx'])
    expect(rotulos('N·m')).toEqual(['µN·m', 'mN·m', 'N·m'])
    expect(opcionesDeUnidad('°C')).toBeNull()
  })

  it('se leen y se parten con su unidad', () => {
    expect(leerCampo('5', 'k', 'lx')).toEqual({ valor: 5000, prefijo: 'k' })
    expect(leerCampo('2.5 klx', '', 'lx')).toEqual({ valor: 2500, prefijo: 'k' })
    expect(leerCampo('40 mN·m', '', 'N·m')!.valor).toBeCloseTo(0.04, 12)
    expect(partirValor(20000, 'lx')).toEqual({ numero: '20', prefijo: 'k' })
    expect(partirValor(0.05, 'N·m')).toEqual({ numero: '50', prefijo: 'm' })
  })
})
