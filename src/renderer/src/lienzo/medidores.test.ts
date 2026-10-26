import { describe, expect, it } from 'vitest'
import type { Sonda } from '../doc/tipos'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { construirEscena } from './escena'
import { EscritorTrazos, EscritorTriangulos } from './buffers'
import type { Texto } from './etiquetas'
import { ALTO_CUERPO_AC, ALTO_CUERPO_DC, ANCHO_CUERPO, dibujarCuerpoDeMedidor, dibujarPantallaDeMedidor, funcionDeMedidor, MINIMO_PX_MEDIDOR, pantallaDeMedidor, textoDePantalla } from './medidores'
import { PALETA_CLARA, PALETA_OSCURA } from './paleta'
import { textosVisibles } from './texto'

const medidor = (extra: Partial<Sonda> = {}): Sonda => ({ id: 'm', tipo: 'medidor', x: 100, y: 50, magnitud: 'voltaje', modo: 'dc', pantalla: { dx: 4, dy: -3 }, ref: 'M1', ...extra })

describe('la pantalla del medidor rápido', () => {
  it('el cuerpo se centra en el punto más el desplazamiento y la guía une el punto con su esquina más cercana', () => {
    const p = pantallaDeMedidor(medidor())
    expect((p.caja.minX + p.caja.maxX) / 2).toBeCloseTo(104, 9)
    expect((p.caja.minY + p.caja.maxY) / 2).toBeCloseTo(47, 9)
    expect(p.caja.maxX - p.caja.minX).toBeCloseTo(ANCHO_CUERPO, 9)
    expect(p.caja.maxY - p.caja.minY).toBeCloseTo(ALTO_CUERPO_DC, 9)
    expect(p.guia[0]).toEqual({ x: 100, y: 50 })
    // El punto queda abajo y a la izquierda del centro: su esquina es la de abajo a la izquierda.
    expect(p.guia[1]).toEqual({ x: p.caja.minX, y: p.caja.maxY })
    const ac = pantallaDeMedidor(medidor({ modo: 'ac' })).caja
    expect(ac.maxY - ac.minY).toBeCloseTo(ALTO_CUERPO_AC, 9)
    // Pasar a AC no mueve el borde de arriba: el cuerpo crece hacia abajo.
    expect(ac.minY).toBeCloseTo(p.caja.minY, 9)
    const arriba = pantallaDeMedidor(medidor({ pantalla: { dx: -8, dy: 8 } }))
    expect(arriba.guia[1]).toEqual({ x: arriba.caja.maxX, y: arriba.caja.minY })
  })

  it('sin lectura muestra «‒.‒‒‒» y la función; cada función tiene su nombre', () => {
    expect(textoDePantalla(medidor(), null)).toMatchObject({ cifras: '‒.‒‒‒', unidad: 'V', hayDato: false })
    expect(funcionDeMedidor(medidor())).toBe('V DC')
    expect(funcionDeMedidor(medidor({ magnitud: 'corriente', modo: 'ac' }))).toBe('A AC')
    const textos: Texto[] = []
    dibujarCuerpoDeMedidor({ t: new EscritorTrazos(), tri: new EscritorTriangulos(), textos }, medidor(), PALETA_CLARA)
    expect(textos.map((x) => x.texto)).toEqual(['V DC', 'M1'])
    expect(textos.every((x) => x.fuente === 'cifras')).toBe(true)
  })

  it('7.05 V se lee «7.05» y «V»; 0.00705 A, «7.05» y «mA» (cuatro cifras significativas, prefijo automático)', () => {
    expect(textoDePantalla(medidor(), { estado: 'ok', valor: 7.05, unidad: 'V' })).toMatchObject({ cifras: '7.050', unidad: 'V', frecuencia: null, hayDato: true })
    expect(textoDePantalla(medidor({ magnitud: 'corriente' }), { estado: 'ok', valor: 0.00705, unidad: 'A' })).toMatchObject({ cifras: '7.050', unidad: 'mA' })
    expect(textoDePantalla(medidor(), { estado: 'ok', valor: 1234.567, unidad: 'V' })).toMatchObject({ cifras: '1.235', unidad: 'kV' })
    const v = (valor: number) => textoDePantalla(medidor(), { estado: 'ok', valor, unidad: 'V' })
    expect(v(2.5)).toMatchObject({ cifras: '2.500', unidad: 'V' })
    expect(v(1.768)).toMatchObject({ cifras: '1.768', unidad: 'V' })
    expect(v(12.34)).toMatchObject({ cifras: '12.34', unidad: 'V' })
    expect(v(0.1234)).toMatchObject({ cifras: '123.4', unidad: 'mV' })
    expect(v(0)).toMatchObject({ cifras: '0.000' })
    expect(v(0.99996)).toMatchObject({ cifras: '1000', unidad: 'mV' })
    expect(textoDePantalla(medidor(), { estado: 'ok', valor: -0.5, unidad: 'V' })).toMatchObject({ cifras: '-500.0', unidad: 'mV' })
  })

  it('en AC con frecuencia conocida agrega «50.0 Hz»', () => {
    const t = textoDePantalla(medidor({ modo: 'ac' }), { estado: 'ok', valor: 0.67, unidad: 'V', frecuencia: 50 })
    expect(t.frecuencia).toBe('50.0 Hz')
    expect(textoDePantalla(medidor({ modo: 'ac' }), { estado: 'ok', valor: 0.67, unidad: 'V', frecuencia: Number.NaN }).frecuencia).toBeNull()
    expect(textoDePantalla(medidor(), { estado: 'ok', valor: 1, unidad: 'V', frecuencia: 50 }).frecuencia).toBeNull()
  })

  it('fuera de rango o sin dato muestra «‒‒‒‒» y el globo da la causa', () => {
    const f = textoDePantalla(medidor(), { estado: 'ok', valor: 5e12, unidad: 'V' })
    expect(f).toMatchObject({ cifras: '‒‒‒‒', hayDato: false })
    expect(f.titulo).toContain('no cabe')
    const s = textoDePantalla(medidor(), { estado: 'sin-dato', motivo: 'flotante' })
    expect(s.cifras).toBe('‒‒‒‒')
    expect(s.titulo).toMatch(/no está conectada/)
  })

  it('dibuja la cifra como texto normal (Geist Mono seminegrita, a la derecha) con la unidad y la frecuencia, de 8 px mínimo', () => {
    const tri = new EscritorTriangulos()
    const textos: Texto[] = []
    dibujarPantallaDeMedidor({ t: new EscritorTrazos(), tri, textos }, medidor({ modo: 'ac' }), PALETA_OSCURA, { estado: 'ok', valor: 7.05, unidad: 'V', frecuencia: 50 })
    // Solo el vidrio son triángulos: la cifra ya no se arma con segmentos.
    expect(tri.cuenta).toBe(2)
    expect(textos.map((x) => x.texto)).toEqual(['7.050', 'V', '50.0 Hz'])
    const cifra = textos[0]
    expect(cifra).toMatchObject({ fuente: 'cifras', negrita: true, alinear: 'der' })
    const p = pantallaDeMedidor(medidor({ modo: 'ac' }))
    // Llena cerca del 60 % del alto del vidrio y cabe en su ancho con la unidad.
    expect((cifra.tamaño * 0.7) / (p.vidrio.maxY - p.vidrio.minY)).toBeGreaterThan(0.3)
    expect(cifra.x).toBeLessThan(textos[1].x)
    expect(textos.every((x) => x.minimoPx === MINIMO_PX_MEDIDOR)).toBe(true)
    // Bajo 8 px se descartan los textos (la cifra también).
    const cam = { x: 0, y: 0, zoom: 1 }
    expect(textosVisibles(textos, cam as never, 1000, 1000)).toHaveLength(0)
    expect(textosVisibles(textos, { ...cam, zoom: 8 } as never, 1000, 1000)).toHaveLength(3)
  })

  it('la escena lo dibuja sin bandera: en reposo con «‒.‒‒‒» y, simulando, solo el cuerpo', () => {
    const lib = libreriaDePrueba().piezas
    const d = documentoVacio()
    d.sondas = { m: medidor() }
    const con = calcularConexiones(d, lib)
    const reposo = construirEscena(d, lib, con, PALETA_CLARA)
    expect(reposo.banderas.size).toBe(0)
    expect(reposo.textos.map((x) => x.texto)).toEqual(['V DC', 'M1', '‒.‒‒‒', 'V'])
    const sim = construirEscena(d, lib, con, PALETA_CLARA, { simulando: true })
    expect(sim.textos.map((x) => x.texto)).toEqual(['V DC', 'M1'])
    expect(sim.nTriangulos).toBeLessThan(reposo.nTriangulos)
  })
})
