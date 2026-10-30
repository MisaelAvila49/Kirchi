// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { libreriaDePrueba } from '../prueba/libreria'
import { convertir } from './convertir'
import { leerFalstad } from './lectores/falstad'
import { generadorDeSim } from './lectores/kicad'
import { leerLtspice } from './lectores/ltspice'
import { leerSpice } from './lectores/spice'

const lib = libreriaDePrueba().piezas

/** Pieza de Kirchi con la que queda la fuente `ref` de un netlist SPICE. */
function fuenteImportada(netlist: string, ref: string) {
  const c = convertir(leerSpice(netlist, 'prueba'), lib, idSecuencial())
  const p = c.fragmento.piezas.find((x) => x.ref.startsWith(ref[0]!) && (x.tipo.startsWith('fuente') || x.tipo === 'generador'))
  return { p, avisos: c.avisos, analisis: c.analisis }
}

describe('fuentes de SPICE', () => {
  it('un PULSE de V1 mayor que V2 baja en el pulso y conserva ancho, flancos y retardo', () => {
    const { p } = fuenteImportada('t\nV1 a 0 PULSE(6 0 1u 1n 1n 0.5u 5u)\nR1 a 0 1k\n.end', 'V1')
    expect(p?.tipo).toBe('fuente-pwl')
    expect(p?.props).toEqual({ puntos: '0 6, 1u 6, 1.001u 0, 1.501u 0, 1.502u 6, 5u 6', repetir: 'Sí' })
  })
  it('un PULSE desde 0 V lleva su voltaje alto, frecuencia, ancho, flancos y retardo a la fuente de pulso', () => {
    const { p } = fuenteImportada('t\nV1 a 0 PULSE(0 15 0 10n 20n 25u 50u)\nR1 a 0 1k\n.end', 'V1')
    expect(p?.tipo).toBe('fuente-pulso')
    expect(p?.props).toMatchObject({ alto: '15', frecuencia: '20k', ancho: '25u', subida: '10n', bajada: '20n' })
  })
  it('SIN con amplitud, frecuencia y fase llega a la pieza; sin offset ni fase es la fuente de CA', () => {
    expect(fuenteImportada('t\nV1 a 0 SIN(0 0.1 1k)\nR1 a 0 1k\n.end', 'V1').p).toMatchObject({ tipo: 'fuente-ac', props: { amplitud: '100m', frecuencia: '1k' } })
    const g = fuenteImportada('t\nV1 a 0 SIN(2 1 1k 0 0 90)\nR1 a 0 1k\n.end', 'V1').p
    expect(g).toMatchObject({ tipo: 'generador', props: { amplitud: '2', desplazamiento: '2', desfase: '90' } })
  })
  it('un PWL se vuelve la fuente por tramos con los mismos puntos', () => {
    const { p } = fuenteImportada('t\nvee 6 0 dc -10 pwl 0 0 1e-9 -10\nR1 6 0 1k\n.end', 'vee')
    expect(p).toMatchObject({ tipo: 'fuente-pwl', props: { puntos: '0 0, 1n -10', repetir: 'No' } })
  })
  it('un PWL que no parte de t = 0 sostiene su primer valor hasta ahí', () => {
    const { p } = fuenteImportada('t\nV1 a 0 PWL(1m 2 2m 4)\nR1 a 0 1k\n.end', 'V1')
    expect(p?.props.puntos).toBe('0 2, 1m 2, 2m 4')
  })
  it('una fuente de corriente con una forma sin pieza queda fija en su nivel de CD y avisa', () => {
    const { p, avisos } = fuenteImportada('t\nI1 0 a SINE(2m 1m 100k)\nR1 a 0 1k\n.end', 'I1')
    expect(p).toMatchObject({ tipo: 'fuente-corriente', props: { corriente: '2m' } })
    expect(avisos.join(' ')).toContain('I1 es una fuente de corriente con una forma que Kirchi no convierte')
  })
  it('una exponencial se muestrea por tramos y lo dice', () => {
    const { p, avisos } = fuenteImportada('t\nV1 a 0 EXP(0 5 1m 1m 5m 2m)\nR1 a 0 1k\n.end', 'V1')
    expect(p?.tipo).toBe('fuente-pwl')
    expect(avisos.join(' ')).toContain('tramos rectos')
  })
})

describe('fuentes de KiCad', () => {
  it('SIN lleva dc, amplitud y frecuencia de Sim.Params', () => {
    expect(generadorDeSim('V1', { 'Sim.Device': 'V', 'Sim.Type': 'SIN', 'Sim.Params': 'dc=0 ampl=1 f=1k ac=1' })).toMatchObject({ tipo: 'generador', forma: 'senoidal', nombre: 'V1', parametros: { vo: 0, va: 1, freq: 1000 } })
  })
  it('PULSE lleva niveles, flancos, ancho y periodo', () => {
    expect(generadorDeSim('V101', { 'Sim.Device': 'V', 'Sim.Type': 'PULSE', 'Sim.Params': 'y1=0 y2=15 per=50u tw=25u' })).toMatchObject({ forma: 'pulso', parametros: { v1: 0, v2: 15, pw: 25e-6, per: 50e-6 } })
  })
  it('PWL entre comillas llega como puntos', () => {
    expect(generadorDeSim('V2', { 'Sim.Device': 'V', 'Sim.Type': 'PWL', 'Sim.Params': 'pwl="0 0 1m 5"' })).toMatchObject({ forma: 'otra', parametros: { forma: 'pwl', puntos: '0 0, 0.001 5' } })
  })
  it('una fuente de CD o un símbolo sin simulación no es un generador', () => {
    expect(generadorDeSim('V3', { 'Sim.Device': 'V', 'Sim.Type': 'DC', 'Sim.Params': 'dc=5' })).toBeNull()
    expect(generadorDeSim('R1', {})).toBeNull()
  })
})

describe('fuentes de LTspice', () => {
  const asc = [
    'Version 4', 'SHEET 1 880 680',
    'WIRE 0 0 0 64', 'FLAG 0 64 0',
    'SYMBOL current 0 -64 R0', 'SYMATTR InstName I1', 'SYMATTR Value SINE(0 1m 100k)',
    'SYMBOL res 0 64 R0', 'SYMATTR InstName R1', 'SYMATTR Value 1k'
  ].join('\n')
  it('una fuente de corriente SINE se reconoce como generador', () => {
    const c = leerLtspice(asc, 'prueba')
    expect(c.instrumentos).toMatchObject([{ tipo: 'generador', nombre: 'I1', parametros: { va: 1e-3, freq: 1e5, corriente: 1 } }])
  })
})

describe('.tran de SPICE y LTspice', () => {
  const analisis = (linea: string) => leerSpice(`t\nR1 a 0 1k\n${linea}\n.end`, 'prueba').directivas.find((d) => d.tipo === 'analisis')
  it('un solo argumento es el tiempo final', () => {
    expect(analisis('.tran 100u')).toMatchObject({ parametros: { fin: 1e-4 } })
    expect(analisis('.tran 1000u uic')).toMatchObject({ parametros: { fin: 1e-3, uic: 1 } })
  })
  it('paso, final, inicio y máximo siguen su orden', () => {
    expect(analisis('.tran 1u 1m 100u 2u')).toMatchObject({ parametros: { paso: 1e-6, fin: 1e-3, inicio: 1e-4, max: 2e-6 } })
    expect(analisis('.tran 0 1100u 1000u')).toMatchObject({ parametros: { paso: 0, fin: 1.1e-3, inicio: 1e-3 } })
  })
})

describe('condiciones iniciales', () => {
  const capacitor = (c: ReturnType<typeof convertir>, ref: string) => c.fragmento.piezas.find((p) => p.ref === ref)!
  it('un .ic de SPICE sobre el terminal de un capacitor con el otro a tierra es su voltaje inicial', () => {
    const c = convertir(leerSpice('t\nV1 a 0 5\nR1 a b 1k\nC1 b 0 1u\n.ic V(b)=2\n.end', 'prueba'), lib, idSecuencial())
    expect(capacitor(c, 'C1').props.vinicial).toBe('2')
    expect(c.avisos.join(' ')).toContain('Condiciones iniciales del origen: C1 2 V')
    expect(c.avisos.join(' ')).not.toContain('no se aplicó')
  })
  it('dos nodos con .ic dan la diferencia y un nodo suelto avisa que no se aplicó', () => {
    const c = convertir(leerSpice('t\nV1 a 0 5\nR1 a b 1k\nC1 b c 1u\nR2 c 0 1k\n.ic V(b)=5 V(c)=1.5 V(a)=3\n.end', 'prueba'), lib, idSecuencial())
    expect(capacitor(c, 'C1').props.vinicial).toBe('3.5')
    expect(c.avisos.join(' ')).toContain('V(a) no es un terminal de un capacitor con el otro a tierra y no se aplicó')
  })
  it('el ic= del elemento manda sobre el .ic y un inductor lo recibe', () => {
    const c = convertir(leerSpice('t\nV1 a 0 5\nR1 a b 1k\nC1 b 0 1u ic=1\nL1 b 0 1m ic=10m\n.ic V(b)=2\n.end', 'prueba'), lib, idSecuencial())
    expect(capacitor(c, 'C1').props.vinicial).toBe('1')
    expect(capacitor(c, 'L1').props.iinicial).toBe('10m')
  })
  it('el estado guardado de un capacitor y un inductor de Falstad es su condición inicial', () => {
    const txt = ['$ 1 0.000005 10 50 5 50 5e-11', 'c 192 128 192 224 0 9.9e-5 0.68', 'l 80 128 80 304 0 0.01 -0.01', 'g 80 304 80 320 0 0'].join('\n')
    const c = convertir(leerFalstad(txt, 'prueba'), lib, idSecuencial())
    expect(capacitor(c, 'C1').props.vinicial).toBe('680m')
    expect(capacitor(c, 'L1').props.iinicial).toBe('-10m')
    expect(c.avisos.join(' ')).not.toContain('no admite condiciones iniciales')
  })
})

describe('fuentes de corriente variables', () => {
  const fuente = (linea: string) => convertir(leerSpice(`t\nR1 a 0 1k\n${linea}\n.end`, 'prueba'), lib, idSecuencial())
  it('SINE desde 0 A es la fuente de corriente AC', () => {
    const c = fuente('I1 0 a SINE(0 1m 100k)')
    expect(c.fragmento.piezas.find((p) => p.ref === 'I1')).toMatchObject({ tipo: 'fuente-corriente-ac', props: { amplitud: '1m', frecuencia: '100k' } })
  })
  it('PULSE desde 0 A es la fuente de corriente de pulso', () => {
    const c = fuente('I1 0 a PULSE(0 2m 0 1u 1u 0.4m 1m)')
    expect(c.fragmento.piezas.find((p) => p.ref === 'I1')).toMatchObject({ tipo: 'fuente-corriente-pulso', props: { alto: '2m', frecuencia: '1k', ancho: '400u' } })
  })
  it('una forma sin pieza se queda fija en su nivel y lo dice', () => {
    const c = fuente('I1 0 a SINE(1m 1m 100k)')
    expect(c.fragmento.piezas.find((p) => p.ref === 'I1')).toMatchObject({ tipo: 'fuente-corriente', props: { corriente: '1m' } })
    expect(c.avisos.join(' ')).toContain('forma que Kirchi no convierte')
  })
})

describe('modelos del archivo', () => {
  const importado = (netlist: string) => convertir(leerSpice(netlist, 'prueba'), lib, idSecuencial())
  it('un NPN con .model lleva sus parámetros al transistor y lo dice', () => {
    const c = importado('t\nV1 c 0 5\nR1 c b 1k\nq1 c b 0 qnl\n.model qnl npn(level=1 bf=80 rb=100 ccs=2pf tf=0.3ns cje=3pf va=50)\n.end')
    const q = c.fragmento.piezas.find((p) => p.tipo === 'npn')!
    expect(q.spice).toEqual({ bf: 80, rb: 100, tf: 0.3e-9, cje: 3e-12, vaf: 50 })
    const aviso = c.avisos.find((a) => a.includes('modelo del archivo «qnl»'))!
    expect(aviso).toContain('ccs (no lo usa el motor)')
    expect(c.informe.omitidas.some((x) => x.includes('.model qnl'))).toBe(false)
  })
  it('un MOSFET con .model lleva vto y kp', () => {
    const c = importado('t\nV1 d 0 5\nV2 g 0 3\nm1 d g 0 0 nm\n.model nm nmos(level=1 vto=1.5 kp=0.02)\n.end')
    expect(c.fragmento.piezas.find((p) => p.tipo.includes('mos'))?.spice).toEqual({ vto: 1.5, kp: 0.02 })
  })
  it('un PNP no recibe el modelo de un NPN', () => {
    const c = importado('t\nV1 c 0 5\nR1 c b 1k\nq1 0 b c qpn\n.model qpn npn(bf=80)\n.end')
    expect(c.fragmento.piezas.find((p) => p.tipo === 'pnp')?.spice).toBeUndefined()
  })
})

describe('fuentes solo de CA', () => {
  it('una fuente de corriente con solo ac da 0 A en CD y no el valor por omisión', () => {
    const c = convertir(leerSpice('t\niin 1 0 ac\nr1 1 0 1k\n.end', 'prueba'), lib, idSecuencial())
    expect(c.fragmento.piezas.find((p) => p.tipo === 'fuente-corriente')?.props.corriente).toBe('0')
  })
})
