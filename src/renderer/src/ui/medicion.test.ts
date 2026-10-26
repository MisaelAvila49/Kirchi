// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { SIN_DATO } from '../valores/valores'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { seleccionVacia, type Seleccion } from '../editor/seleccion'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { textoNivelRed, type ExtraMedicion, type Lectura, type LecturaDigital, type MedicionPieza } from '../sim/lectura'
import { REGIONES_BJT, REGIONES_MOS } from '../sim/lectura'
import { cifra, cifraCorriente, estadoEnPalabras, medicionDeSeleccion, PASOS_REGION, textoBeta, textoPotencia } from './medicion'

const lib = libreriaDePrueba().piezas
const d = divisor()
const con = calcularConexiones(d, lib)
const medio = con.redDePin.get(clavePin('p_r1', '2'))!
const alta = con.redDePin.get(clavePin('p_v1', '+'))!
const l: Lectura = {
  t: 0.1,
  ratio: 1,
  redes: new Map([[medio, 2.5], [alta, 5]]),
  piezas: new Map([
    ['p_r1', { v: 2.5, i: 2.5e-3, p: 6.25e-3 }],
    ['p_v1', { v: 5, i: -2.5e-3, p: -12.5e-3 }]
  ])
}
const sel = (col: keyof Seleccion, id: string) => {
  const s = seleccionVacia()
  s[col].add(id)
  return s
}

describe('lecturas digitales en el inspector y el Multímetro', () => {
  const conExtra = (extra: ExtraMedicion): Lectura => ({ ...l, piezas: new Map([['p_r1', { v: 0, i: 0, p: 0, extra }]]) })
  const filas = (extra: ExtraMedicion) => medicionDeSeleccion(sel('piezas', 'p_r1'), con, conExtra(extra))
  const palabras = (extra: ExtraMedicion) => estadoEnPalabras({ v: 0, i: 0, p: 0, extra })

  it('una compuerta da el nivel de cada pin, con el voltaje si su red es analógica', () => {
    const x: ExtraMedicion = { tipo: 'digital', modelo: 'compuerta', pines: [{ id: 'A', nivel: '1', salida: false }, { id: 'B', nivel: 'X', salida: false }, { id: 'Y', nivel: '0', salida: true, v: 0.021 }] }
    expect(filas(x)).toEqual([
      { nombre: 'A', valor: '1' },
      { nombre: 'B', valor: 'X' },
      { nombre: 'Y', valor: '0 (21.0 mV)' }
    ])
    expect(palabras(x)).toBe('salida en 0')
  })

  it('un biestable dice Q y qué la fijó; el contador, su cuenta en decimal y en binario; el decodificador, el dígito', () => {
    expect(filas({ tipo: 'digital', modelo: 'biestable-jk', pines: [], q: '1', causa: 'conmuta' })).toEqual([
      { nombre: 'Q', valor: '1' },
      { nombre: 'Último cambio', valor: 'flanco de reloj: conmuta' }
    ])
    expect(filas({ tipo: 'digital', modelo: 'biestable-jk', pines: [], q: '0', causa: 'flanco' })![1].valor).toBe('flanco de reloj: mantiene')
    expect(filas({ tipo: 'digital', modelo: 'biestable-d', pines: [], q: '0', causa: 'flanco' })![1].valor).toBe('flanco de reloj')
    expect(filas({ tipo: 'digital', modelo: 'biestable-d', pines: [], q: 'X', causa: 'ambos' })![1].valor).toBe('PRE y CLR a la vez')
    expect(filas({ tipo: 'digital', modelo: 'contador', pines: [], cuenta: 7 })).toEqual([{ nombre: 'Cuenta', valor: '7, 0111' }])
    // Cada pin con el nombre de su `pieza.json` (con mayúscula), no con su id.
    const pinesD = [{ id: 'D', nombre: 'dato (D)', nivel: '1' as const, salida: false }, { id: 'QN', nombre: 'Q negada', nivel: '0' as const, salida: true }]
    expect(filas({ tipo: 'digital', modelo: 'biestable-d', pines: pinesD, q: '1', causa: 'flanco' })!.slice(2)).toEqual([
      { nombre: 'Dato (D)', valor: '1' },
      { nombre: 'Q negada', valor: '0' }
    ])
    expect(filas({ tipo: 'digital', modelo: 'contador', pines: [], cuenta: null })![0].valor).toBe('sin definir')
    expect(filas({ tipo: 'digital', modelo: 'decodificador', pines: [], digito: -1 })).toEqual([{ nombre: 'Dígito', valor: 'apagado' }])
    expect(palabras({ tipo: 'digital', modelo: 'decodificador', pines: [], digito: 3 })).toBe('manda 3')
    expect(palabras({ tipo: 'digital', modelo: 'biestable-d', pines: [], q: '1', causa: 'pre' })).toBe('Q en 1')
  })

  it('el 555 dice si oscila, con su frecuencia y su ciclo de trabajo; el display, lo que muestra y la corriente de cada segmento conectado', () => {
    expect(filas({ tipo: '555', salida: '1', f: 686.2, ciclo: 0.524, thr: 2.1, trig: 2.1, alimentacion: 5, vmin: 4.5, vmax: 16, modelo: 'NE555' })).toEqual([
      { nombre: 'Salida', valor: '1' },
      { nombre: 'Estado', valor: 'oscila' },
      { nombre: 'Frecuencia', valor: '686 Hz' },
      { nombre: 'Ciclo de trabajo', valor: '52.4 %' },
      { nombre: 'THR', valor: '2.10 V' },
      { nombre: 'TRIG', valor: '2.10 V' }
    ])
    expect(palabras({ tipo: '555', salida: '1', f: 686.2, ciclo: 0.524, thr: 2.1, trig: 2.1, alimentacion: 5, vmin: 4.5, vmax: 16, modelo: 'NE555' })).toBe('oscila a 686 Hz')
    expect(palabras({ tipo: '555', salida: '0', f: 0, ciclo: 0, thr: 0, trig: 0, alimentacion: 5, vmin: 4.5, vmax: 16, modelo: 'NE555' })).toBe('en reposo, salida en 0')
    expect(filas({ tipo: 'display', corrientes: [0.012, 0.012, 0.012, null, null, null, null, null], muestra: 'muestra 7' })).toEqual([
      { nombre: 'Muestra', valor: '7' },
      { nombre: 'Segmento a', valor: '12.0 mA' },
      { nombre: 'Segmento b', valor: '12.0 mA' },
      { nombre: 'Segmento c', valor: '12.0 mA' }
    ])
  })

  it('una red digital en el Multímetro: nivel, voltaje nominal y, si conmuta, frecuencia y ciclo de trabajo', () => {
    const [cable, redCable] = [...con.redDeCable][0]
    const d: LecturaDigital = { nivel: '1', nominal: 5, f: 1000, ciclo: 0.25, vcc: 5, cambios: 99, conmuta: true }
    const lectura: Lectura = { ...l, redes: new Map(), digitales: new Map([[redCable, d]]) }
    expect(medicionDeSeleccion(sel('cables', cable), con, lectura)).toEqual([
      { nombre: 'Nivel', valor: '1' },
      { nombre: 'Voltaje', valor: '5.00 V nominal' },
      { nombre: 'Frecuencia', valor: '1.00 kHz' },
      { nombre: 'Ciclo de trabajo', valor: '25.0 %' }
    ])
    // Una red analógica que maneja una salida: el voltaje medido y su nivel.
    const analogica: Lectura = { ...l, redes: new Map([[redCable, 4.98]]), digitales: new Map([[redCable, { ...d, nominal: null, f: 0, conmuta: false }]]) }
    expect(medicionDeSeleccion(sel('cables', cable), con, analogica)).toEqual([
      { nombre: 'Nivel', valor: '1' },
      { nombre: 'Voltaje', valor: '4.98 V' }
    ])
    expect(textoNivelRed(d)).toBe('conmuta, 1.00 kHz')
    expect(textoNivelRed({ ...d, conmuta: false })).toBe('1 · 5.00 V nominal')
    expect(textoNivelRed({ ...d, nivel: 'Z', nominal: null, conmuta: false })).toBe('Z')
  })
})

describe('medicionDeSeleccion', () => {
  it('una pieza: voltaje, corriente y potencia', () => {
    expect(medicionDeSeleccion(sel('piezas', 'p_r1'), con, l)).toEqual([
      { nombre: 'Voltaje', valor: '2.50 V' },
      { nombre: 'Corriente', valor: '2.50 mA' },
      { nombre: 'Potencia', valor: '6.25 mW' }
    ])
  })

  it('una fuente que alimenta el circuito dice que entrega la potencia', () => {
    expect(medicionDeSeleccion(sel('piezas', 'p_v1'), con, l)![2]).toEqual({ nombre: 'Potencia', valor: '12.5 mW (entrega)' })
    expect(textoPotencia(0)).toBe('0.00 W')
  })

  it('un potenciómetro: entre extremos, cursor, corriente del tramo y potencia de la pieza', () => {
    const lp: Lectura = { ...l, piezas: new Map([['p_rv', { v: 5, cursor: 3.75, i: 0.5e-3, p: 2.5e-3 }]]) }
    expect(medicionDeSeleccion(sel('piezas', 'p_rv'), con, lp)).toEqual([
      { nombre: 'Entre extremos', valor: '5.00 V' },
      { nombre: 'Cursor', valor: '3.75 V' },
      { nombre: 'Corriente', valor: '500 µA' },
      { nombre: 'Potencia', valor: '2.50 mW' }
    ])
  })

  it('una corriente por debajo de 1 µA se muestra «sin corriente» con su valor entre paréntesis', () => {
    const lp: Lectura = { ...l, piezas: new Map([['p_r1', { v: 1, i: 4e-9, p: 4e-9 }]]) }
    expect(medicionDeSeleccion(sel('piezas', 'p_r1'), con, lp)![1]).toEqual({ nombre: 'Corriente', valor: 'sin corriente (4.00 nA)' })
    expect(cifraCorriente(0)).toBe('sin corriente')
    expect(cifraCorriente(2e-6)).toBe('2.00 µA')
    expect(cifraCorriente(undefined)).not.toMatch(/sin corriente/)
  })

  it('un cable: el voltaje de su red', () => {
    expect(medicionDeSeleccion(sel('cables', 'c_a'), con, l)).toEqual([{ nombre: 'Voltaje', valor: '5.00 V' }])
  })

  it('sin lectura, sin selección, con varias cosas o con una pieza que no se simula: nada', () => {
    expect(medicionDeSeleccion(sel('piezas', 'p_r1'), con, null)).toBeNull()
    expect(medicionDeSeleccion(seleccionVacia(), con, l)).toBeNull()
    const dos = sel('piezas', 'p_r1')
    dos.piezas.add('p_v1')
    expect(medicionDeSeleccion(dos, con, l)).toBeNull()
    expect(medicionDeSeleccion(sel('piezas', 'p_g'), con, l)).toBeNull()
  })

  it('un transistor: región, Vbe, Vce, Ic y β', () => {
    const lq: Lectura = { ...l, piezas: new Map([['p_q', { v: 5.95, i: 2.37e-3, p: 0.0141, extra: { tipo: 'bjt', region: 'activa', vbe: 0.671, ib: 9.4e-6 } }]]) }
    expect(medicionDeSeleccion(sel('piezas', 'p_q'), con, lq)).toEqual([
      { nombre: 'Región', valor: 'activa', pasos: ['corte', 'activa', 'saturación'] },
      { nombre: 'Vbe', valor: '671 mV' },
      { nombre: 'Vce', valor: '5.95 V' },
      { nombre: 'Ic', valor: '2.37 mA' },
      { nombre: 'β', valor: '252' }
    ])
    expect(textoBeta(1e-9, 0)).toBe(SIN_DATO)
    // Los pasos de la barra salen de las regiones del motor; «activa inversa» no es uno de ellos.
    expect(PASOS_REGION).toEqual({ bjt: REGIONES_BJT.slice(0, 3), mosfet: [...REGIONES_MOS] })
  })

  it('un MOSFET, un amplificador saturado, un fusible fundido, un motor, un relé y un zumbador', () => {
    const conExtra = (extra: MedicionPieza['extra'], v = 1, i = 1e-3) => medicionDeSeleccion(sel('piezas', 'p'), con, { ...l, piezas: new Map([['p', { v, i, p: v * i, extra }]]) })
    expect(conExtra({ tipo: 'mosfet', region: 'saturación', vgs: 2.98 }, 5.06, 0.0694)).toEqual([
      { nombre: 'Región', valor: 'saturación', pasos: ['corte', 'lineal', 'saturación'] },
      { nombre: 'Vgs', valor: '2.98 V' },
      { nombre: 'Vds', valor: '5.06 V' },
      { nombre: 'Id', valor: '69.4 mA' }
    ])
    expect(conExtra({ tipo: 'ampop', saturado: 1 }, 13.8)![1]).toEqual({ nombre: 'Estado', valor: 'saturado contra V+' })
    expect(conExtra({ tipo: 'ampop', saturado: -1 })![1].valor).toBe('saturado contra V−')
    expect(conExtra({ tipo: 'fusible', fundido: true })![0]).toEqual({ nombre: 'Estado', valor: 'fundido' })
    expect(conExtra({ tipo: 'foco', fundido: true })![0]).toEqual({ nombre: 'Estado', valor: 'fundido' })
    expect(conExtra({ tipo: 'foco', fundido: false })![0]).toEqual({ nombre: 'Estado', valor: 'entero' })
    expect(conExtra({ tipo: 'motor', rpm: 8912.4 })![0]).toEqual({ nombre: 'Velocidad', valor: '8,912 rpm' })
    // El sentido del motor, el estado del relé y el zumbador en silencio.
    expect(conExtra({ tipo: 'motor', rpm: 8912.4 })![1]).toEqual({ nombre: 'Sentido', valor: 'horario' })
    expect(conExtra({ tipo: 'motor', rpm: -30 })![1]).toEqual({ nombre: 'Sentido', valor: 'antihorario' })
    expect(conExtra({ tipo: 'motor', rpm: 0.2 })![1]).toEqual({ nombre: 'Sentido', valor: 'quieto' })
    expect(conExtra({ tipo: 'rele', operado: true })![0]).toEqual({ nombre: 'Estado', valor: 'operado' })
    expect(conExtra({ tipo: 'rele', operado: false })![0]).toEqual({ nombre: 'Estado', valor: 'en reposo' })
    expect(conExtra({ tipo: 'rele', operado: true })![1]).toEqual({ nombre: 'Contacto', valor: 'común con NA' })
    expect(conExtra({ tipo: 'zumbador', suena: false })![2]).toEqual({ nombre: 'Sonido', valor: 'en silencio' })
    expect(conExtra({ tipo: 'fusible', fundido: false, calentamiento: 0.425 })![2]).toEqual({ nombre: 'Calentamiento', valor: '43 % del que lo funde' })
    expect(conExtra({ tipo: 'zener', estado: 'ruptura' })![2]).toEqual({ nombre: 'Estado', valor: 'en ruptura' })
  })

  it('una cifra que no se lee es una raya', () => {
    expect(cifra(Number.NaN, 'V')).toBe(SIN_DATO)
    expect(cifra(undefined, 'V')).toBe(SIN_DATO)
    expect(cifra(Number.POSITIVE_INFINITY, 'A')).toBe(SIN_DATO)
  })
})
