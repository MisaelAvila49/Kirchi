// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { buscar } from '../../buscador/buscar'
import { calcularConexiones } from '../../conexiones/conexiones'
import { documentoVacio, type Documento } from '../../doc/tipos'
import { libreriaDePrueba } from '../../prueba/libreria'
import type { FaseSim } from '../../sim/control'
import { arranqueDeCapitulo } from './arranques'
import { CAPITULO_2, LECTURA_MULTIMETRO, modoMultimetro } from './capitulo2'
import { CAPITULO_3 } from './capitulo3'
import { CAPITULO_4 } from './capitulo4'
import { CAPITULO_5 } from './capitulo5'
import { CAPITULOS } from './capitulos'
import type { CapituloDef, CtxTutorial } from './tipos'

const lib = libreriaDePrueba().piezas

const copia = (id: string): Documento => structuredClone(arranqueDeCapitulo(id)!)
const ctx = (d: Documento, extra: Partial<CtxTutorial> = {}): CtxTutorial => ({ doc: d, con: calcularConexiones(d, lib), lib, fase: 'detenida', centro: { x: 0, y: 0 }, ...extra })
const hecho = (cap: CapituloDef, paso: string, c: CtxTutorial): boolean => cap.pasos.find((p) => p.id === paso)!.hecho(c)
const con = (...e: string[]) => ({ eventos: new Set(e) })

describe('capítulo 2: Medir', () => {
  const fin = () => copia('senales')
  const m = (id: string, ...fases: [FaseSim?]) => ctx(fin(), { fase: fases[0] ?? 'detenida', derecho: id === 'derecho' ? 'mediciones' : null })

  it('tiene los pasos del plan y cada total coincide', () => {
    expect(CAPITULO_2.pasos.map((p) => p.id)).toEqual(['medir-voltaje', 'simular', 'lectura', 'detener', 'serie', 'corriente', 'lectura-corriente', 'ohmios', 'lectura-ohmios'])
    expect(CAPITULO_2.totalPasos).toBe(CAPITULO_2.pasos.length)
  })

  it('el multímetro con sonda se cumple al poner uno con «Medir» y no con uno suelto', () => {
    expect(hecho(CAPITULO_2, 'medir-voltaje', ctx(copia('medir')))).toBe(false)
    expect(hecho(CAPITULO_2, 'medir-voltaje', ctx(fin()))).toBe(true)
    const suelto = copia('medir')
    suelto.piezas.x = { id: 'x', tipo: 'multimetro', ref: 'XMM1', x: 50, y: 0, rot: 0, espejo: false, props: {} }
    expect(hecho(CAPITULO_2, 'medir-voltaje', ctx(suelto))).toBe(false)
    const sinPieza = fin()
    delete sinPieza.piezas.m1
    expect(hecho(CAPITULO_2, 'medir-voltaje', ctx(sinPieza))).toBe(false)
  })

  it('simular pide la vista previa en marcha con el multímetro de la sonda puesto', () => {
    const v = (extra: Partial<CtxTutorial>, d = fin()) => hecho(CAPITULO_2, 'simular', ctx(d, extra))
    expect(v({ fase: 'corriendo' })).toBe(true)
    expect(v({ fase: 'pausada' })).toBe(true)
    expect(v({ fase: 'detenida' })).toBe(false)
    expect(v({ fase: 'corriendo' }, copia('medir'))).toBe(false)
  })

  it('la lectura pide Mediciones a la vista, la vista previa en marcha y el modo V DC', () => {
    const v = (extra: Partial<CtxTutorial>, d = fin()) => hecho(CAPITULO_2, 'lectura', ctx(d, extra))
    expect(v({ fase: 'corriendo', derecho: 'mediciones' })).toBe(true)
    expect(v({ fase: 'pausada', derecho: 'mediciones' })).toBe(true)
    expect(v({ fase: 'corriendo', derecho: 'inspector' })).toBe(false)
    expect(v({ fase: 'corriendo', derecho: null })).toBe(false)
    expect(v({ fase: 'detenida', derecho: 'mediciones' })).toBe(false)
    const ac = fin()
    ac.piezas.m1.props.modo = 'V AC'
    expect(v({ fase: 'corriendo', derecho: 'mediciones' }, ac)).toBe(false)
    expect(v({ fase: 'corriendo', derecho: 'mediciones' }, copia('medir'))).toBe(false)
  })

  it('en la lectura se señala la lectura de Mediciones (o su icono) y, aparte, el multímetro del circuito', () => {
    const paso = CAPITULO_2.pasos.find((p) => p.id === 'lectura')!
    expect(paso.abre).toBe('mediciones')
    expect(paso.objetivo(ctx(fin()))).toMatchObject({ tipo: 'control', selector: LECTURA_MULTIMETRO, respaldo: '.riel-boton[data-panel="mediciones"]' })
    expect(paso.focos!(ctx(fin())).map((o) => o.tipo)).toEqual(['zona'])
  })

  it('detener sigue la fase', () => {
    expect(hecho(CAPITULO_2, 'detener', m('x'))).toBe(false)
    expect(hecho(CAPITULO_2, 'detener', { ...m('x'), eventos: new Set(['sim-activa']) })).toBe(true)
    expect(hecho(CAPITULO_2, 'detener', m('x', 'corriendo'))).toBe(false)
  })

  it('en serie se cumple con el multímetro que parte un cable, no con el de la sonda ni con uno en paralelo', () => {
    expect(hecho(CAPITULO_2, 'serie', ctx(copia('medir')))).toBe(false)
    expect(hecho(CAPITULO_2, 'serie', ctx(fin()))).toBe(true)
    // Solo el de voltaje (sonda sobre un nodo con dos pines ajenos): no está en serie.
    const soloSonda = fin()
    delete soloSonda.piezas.m2
    expect(hecho(CAPITULO_2, 'serie', ctx(soloSonda))).toBe(false)
    // Un multímetro cableado en paralelo con la resistencia: cada terminal toca un nodo con dos pines ajenos.
    const paralelo = copia('medir')
    paralelo.piezas.p = { id: 'p', tipo: 'multimetro', ref: 'XMM3', x: 16, y: -16, rot: 0, espejo: false, props: { modo: 'V DC' } }
    paralelo.cables.p1 = { id: 'p1', puntos: [{ x: 16, y: -10 }, { x: 12, y: -10 }, { x: 12, y: -4 }] }
    paralelo.cables.p2 = { id: 'p2', puntos: [{ x: 16, y: -22 }, { x: 24, y: -22 }, { x: 24, y: -4 }] }
    expect(hecho(CAPITULO_2, 'serie', ctx(paralelo))).toBe(false)
  })

  it('la corriente pide A DC en el multímetro en serie, elegido en el Inspector, sin pedir la vista previa', () => {
    const a = (modo: string, extra: Partial<CtxTutorial> = {}) => {
      const d = fin()
      d.piezas.m2.props.modo = modo
      return hecho(CAPITULO_2, 'corriente', ctx(d, extra))
    }
    expect(a('A DC')).toBe(true)
    expect(a('V DC')).toBe(false)
    // El modo A DC del multímetro de la sonda no cuenta: no está en serie.
    const d = fin()
    d.piezas.m2.props.modo = 'V DC'
    d.piezas.m1.props.modo = 'A DC'
    expect(hecho(CAPITULO_2, 'corriente', ctx(d))).toBe(false)
  })

  it('la lectura de la corriente pide la vista previa en marcha, A DC en serie y Mediciones a la vista', () => {
    const a = (modo: string, extra: Partial<CtxTutorial>) => {
      const d = fin()
      d.piezas.m2.props.modo = modo
      return hecho(CAPITULO_2, 'lectura-corriente', ctx(d, extra))
    }
    expect(a('A DC', { fase: 'corriendo', derecho: 'mediciones' })).toBe(true)
    expect(a('A DC', { fase: 'detenida', derecho: 'mediciones' })).toBe(false)
    expect(a('A DC', { fase: 'corriendo', derecho: 'inspector' })).toBe(false)
    expect(a('A DC', { fase: 'corriendo', derecho: null })).toBe(false)
    expect(a('V DC', { fase: 'corriendo', derecho: 'mediciones' })).toBe(false)
  })

  it('corriente y ohmios señalan la función que hay que cambiar en el Inspector, además del multímetro y, para detener, su botón', () => {
    // Falla: el foco se quedaba en el multímetro del lienzo y no en la función A DC o Ω del panel.
    const c = ctx(fin())
    const corriente = CAPITULO_2.pasos.find((p) => p.id === 'corriente')!
    expect(corriente.abre).toBe('inspector')
    expect(corriente.objetivo(c)).toEqual({ tipo: 'control', selector: modoMultimetro('A DC'), respaldo: '.riel-boton[data-panel="inspector"]' })
    expect(corriente.focos!(c)).toEqual([expect.objectContaining({ tipo: 'zona' })])
    const ohmios = CAPITULO_2.pasos.find((p) => p.id === 'ohmios')!
    expect(ohmios.abre).toBe('inspector')
    expect(ohmios.objetivo(c)).toEqual({ tipo: 'control', selector: modoMultimetro('Ω'), respaldo: '.riel-boton[data-panel="inspector"]' })
    expect(ohmios.focos!(c)).toEqual([expect.objectContaining({ tipo: 'zona' }), { tipo: 'control', selector: '[data-comando="detener"]', pestana: 'inicio', respaldo: '[data-grupo="vista-previa"] .boton-grupo' }])
    expect(modoMultimetro('Ω')).toBe('.modos-multimetro [data-valor="Ω"]')
    expect(LECTURA_MULTIMETRO).toBe('#panel-derecho .fila-instrumento')
  })

  it('los ohmios piden Ω en el multímetro de la sonda con la vista previa detenida, y su lectura Mediciones a la vista', () => {
    const o = (modo: string, extra: Partial<CtxTutorial>, paso = 'ohmios') => {
      const d = fin()
      d.piezas.m1.props.modo = modo
      return hecho(CAPITULO_2, paso, ctx(d, extra))
    }
    expect(o('Ω', { fase: 'detenida' })).toBe(true)
    expect(o('Ω', { fase: 'corriendo' })).toBe(false)
    expect(o('A DC', { fase: 'detenida' })).toBe(false)
    expect(o('Ω', { fase: 'detenida', derecho: 'mediciones' }, 'lectura-ohmios')).toBe(true)
    expect(o('Ω', { fase: 'detenida', derecho: 'inspector' }, 'lectura-ohmios')).toBe(false)
    expect(o('Ω', { fase: 'corriendo', derecho: 'mediciones' }, 'lectura-ohmios')).toBe(false)
  })

  it('cada paso del capítulo que lee abre Mediciones y cada paso que cambia la función abre el Inspector', () => {
    const abre = (id: string) => CAPITULO_2.pasos.find((p) => p.id === id)!.abre
    for (const id of ['lectura', 'lectura-corriente', 'lectura-ohmios']) expect(abre(id), id).toBe('mediciones')
    for (const id of ['corriente', 'ohmios']) expect(abre(id), id).toBe('inspector')
  })
})

describe('capítulo 3: Señales', () => {
  const inicio = () => copia('senales')
  const fin = () => copia('archivo')

  it('tiene los diez pasos y cada total coincide', () => {
    expect(CAPITULO_3.pasos.map((p) => p.id)).toEqual(['generador', 'cuadrada', 'capacitor', 'osciloscopio', 'canal-a', 'canal-b', 'simular', 'tiempo', 'disparo', 'cursores'])
    expect(CAPITULO_3.totalPasos).toBe(10)
  })

  it('el paso del generador señala la fuente junto con el sitio nuevo mientras siga puesta, y deja el globo a un costado', () => {
    const paso = CAPITULO_3.pasos[0]
    expect(paso.lado).toBe('derecha')
    const conFuente = paso.objetivo(ctx(inicio()))
    const sinFuente = inicio()
    delete sinFuente.piezas.v
    const solo = paso.objetivo(ctx(sinFuente))
    if (conFuente.tipo !== 'zona' || solo.tipo !== 'zona') throw new Error('no son zonas')
    // El sitio del generador (arriba de donde estaba la fuente) y la fuente caben en la zona más grande.
    expect(solo.caja).toEqual({ minX: -10, minY: -18, maxX: 10, maxY: -2 })
    expect(conFuente.caja.minY).toBeLessThanOrEqual(solo.caja.minY)
    expect(conFuente.caja.maxY).toBeGreaterThan(solo.caja.maxY)
  })

  it('el generador pide la fuente borrada, su salida cableada y su COM en la tierra', () => {
    expect(hecho(CAPITULO_3, 'generador', ctx(inicio()))).toBe(false)
    expect(hecho(CAPITULO_3, 'generador', ctx(fin()))).toBe(true)
    const conFuente = fin()
    conFuente.piezas.v = { id: 'v', tipo: 'fuente-dc', ref: 'V1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
    expect(hecho(CAPITULO_3, 'generador', ctx(conFuente))).toBe(false)
    const sinSalida = fin()
    delete sinSalida.cables.c1
    expect(hecho(CAPITULO_3, 'generador', ctx(sinSalida))).toBe(false)
    const sinTierra = fin()
    delete sinTierra.cables.w2
    expect(hecho(CAPITULO_3, 'generador', ctx(sinTierra))).toBe(false)
    // Su salida en la red de cualquier otra pieza que no sea la resistencia no basta.
    const conOtra = fin()
    conOtra.piezas.r.tipo = 'capacitor'
    expect(hecho(CAPITULO_3, 'generador', ctx(conOtra))).toBe(false)
  })

  it('la cuadrada pide forma y 1 Hz, escritos como sea', () => {
    const f = (forma: string, frecuencia: string) => {
      const d = fin()
      d.piezas.xfg.props = { forma, frecuencia }
      return hecho(CAPITULO_3, 'cuadrada', ctx(d))
    }
    expect(f('Cuadrada', '1')).toBe(true)
    expect(f('Cuadrada', '1 Hz')).toBe(true)
    expect(f('Cuadrada', '1000m')).toBe(true)
    expect(f('Senoidal', '1')).toBe(false)
    expect(f('Cuadrada', '1k')).toBe(false)
    const porOmision = fin()
    porOmision.piezas.xfg.props = {}
    expect(hecho(CAPITULO_3, 'cuadrada', ctx(porOmision))).toBe(false)
  })

  it('el capacitor pide 100 µF del cable de la resistencia al LED a la tierra, con sus dos pines unidos', () => {
    expect(hecho(CAPITULO_3, 'capacitor', ctx(inicio()))).toBe(false)
    expect(hecho(CAPITULO_3, 'capacitor', ctx(fin()))).toBe(true)
    const otro = fin()
    otro.piezas.c.props.valor = '1u'
    expect(hecho(CAPITULO_3, 'capacitor', ctx(otro))).toBe(false)
    const colgado = fin()
    delete colgado.cables.k2
    expect(hecho(CAPITULO_3, 'capacitor', ctx(colgado))).toBe(false)
    const sinNodo = fin()
    delete sinNodo.cables.k1
    expect(hecho(CAPITULO_3, 'capacitor', ctx(sinNodo))).toBe(false)
  })

  it('el osciloscopio y sus dos canales se cumplen con su pieza y sus sondas', () => {
    expect(hecho(CAPITULO_3, 'osciloscopio', ctx(inicio()))).toBe(false)
    expect(hecho(CAPITULO_3, 'osciloscopio', ctx(fin()))).toBe(true)
    expect(hecho(CAPITULO_3, 'canal-a', ctx(inicio()))).toBe(false)
    expect(hecho(CAPITULO_3, 'canal-a', ctx(fin()))).toBe(true)
    expect(hecho(CAPITULO_3, 'canal-b', ctx(fin()))).toBe(true)
    const sinB = fin()
    delete sinB.sondas!.sb
    expect(hecho(CAPITULO_3, 'canal-b', ctx(sinB))).toBe(false)
    expect(hecho(CAPITULO_3, 'canal-a', ctx(sinB))).toBe(true)
    // Una sonda de multímetro en la entrada no es una del osciloscopio.
    expect(hecho(CAPITULO_3, 'canal-b', ctx(inicio()))).toBe(false)
  })

  it('simular pide la vista previa en marcha y la pestaña Osciloscopio', () => {
    expect(hecho(CAPITULO_3, 'simular', ctx(fin(), { fase: 'corriendo', franja: 'osciloscopio' }))).toBe(true)
    expect(hecho(CAPITULO_3, 'simular', ctx(fin(), { fase: 'corriendo', franja: 'registro' }))).toBe(false)
    expect(hecho(CAPITULO_3, 'simular', ctx(fin(), { fase: 'detenida', franja: 'osciloscopio' }))).toBe(false)
  })

  it('el tiempo por división se cumple de 50 ms a 200 ms y no con el de omisión (1 ms)', () => {
    const t = (base?: string) => {
      const d = fin()
      if (base !== undefined) d.piezas.xsc.props.base = base
      return hecho(CAPITULO_3, 'tiempo', ctx(d))
    }
    expect(t()).toBe(false)
    expect(t('1m')).toBe(false)
    expect(t('100m')).toBe(true)
    expect(t('0.1')).toBe(true)
    expect(t('50m')).toBe(true)
    expect(t('500m')).toBe(false)
    expect(t('1')).toBe(false)
  })

  it('el disparo se cumple con el canal B como fuente', () => {
    const d = fin()
    expect(hecho(CAPITULO_3, 'disparo', ctx(d))).toBe(false)
    d.piezas.xsc.props.disp_fuente = 'A'
    expect(hecho(CAPITULO_3, 'disparo', ctx(d))).toBe(false)
    d.piezas.xsc.props.disp_fuente = 'B'
    expect(hecho(CAPITULO_3, 'disparo', ctx(d))).toBe(true)
  })

  it('los cursores se cumplen cuando están encendidos', () => {
    expect(hecho(CAPITULO_3, 'cursores', ctx(fin()))).toBe(false)
    expect(hecho(CAPITULO_3, 'cursores', ctx(fin(), { cursores: true }))).toBe(true)
  })
})

describe('capítulo 4: Archivo, con los eventos del servicio de archivos simulados', () => {
  const base = () => ctx(copia('archivo'))

  it('tiene los cinco pasos', () => {
    expect(CAPITULO_4.pasos.map((p) => p.id)).toEqual(['guardar', 'nuevo', 'reciente', 'seleccionar', 'exportar'])
    expect(CAPITULO_4.totalPasos).toBe(5)
  })

  it('guardar, nuevo, reciente y exportar esperan su evento y no se cumplen con el gesto sin el evento', () => {
    const casos: [string, string][] = [['guardar', 'guardado'], ['nuevo', 'nuevo'], ['reciente', 'reciente'], ['exportar', 'exportado-seleccion']]
    for (const [paso, evento] of casos) {
      expect(hecho(CAPITULO_4, paso, base()), paso).toBe(false)
      expect(hecho(CAPITULO_4, paso, { ...base(), ...con(evento) }), paso).toBe(true)
      // Un evento de otro paso no sirve.
      const otros = casos.map(([, e]) => e).filter((e) => e !== evento)
      expect(hecho(CAPITULO_4, paso, { ...base(), ...con(...otros) }), `${paso} con eventos ajenos`).toBe(false)
    }
  })

  it('exportar todo el circuito no cuenta: solo la selección', () => {
    expect(hecho(CAPITULO_4, 'exportar', { ...base(), ...con('exportado') })).toBe(false)
  })

  it('el paso de exportar manda a elegir Selección en el diálogo nuevo y no a la casilla de antes', () => {
    const paso = CAPITULO_4.pasos.find((p) => p.id === 'exportar')!
    expect(paso.texto).toContain('elige Selección')
    expect(paso.texto).not.toContain('Solo la selección')
    expect(paso.pista).toContain('Exportar la selección…')
  })

  it('seleccionar pide la resistencia y el LED juntos, no cualquier par', () => {
    const s = (...ids: string[]) => hecho(CAPITULO_4, 'seleccionar', { ...base(), seleccion: new Set(ids) })
    expect(s()).toBe(false)
    expect(s('r')).toBe(false)
    expect(s('r', 'd')).toBe(true)
    expect(s('r', 'd', 'c')).toBe(true)
    expect(s('c', 'xsc')).toBe(false)
    expect(hecho(CAPITULO_4, 'seleccionar', base())).toBe(false)
  })
})

describe('capítulo 5: Trucos', () => {
  const base = (extra: Partial<CtxTutorial> = {}) => ctx(copia('trucos'), extra)

  it('tiene los diez pasos', () => {
    // F (encuadrar) va con el lienzo limpio y antes de volver al modo normal.
    expect(CAPITULO_5.pasos.map((p) => p.id)).toEqual(['limpio', 'encuadrar', 'volver', 'valor', 'cancelar-cable', 'menu-pieza', 'borrar-derecho', 'rejilla', 'comandos', 'atajos'])
    expect(CAPITULO_5.totalPasos).toBe(10)
  })

  it('los tres pasos del clic derecho se cumplen con el evento de la aplicación y no antes', () => {
    for (const [paso, evento] of [['cancelar-cable', 'cable-cancelado'], ['menu-pieza', 'menu-pieza'], ['borrar-derecho', 'borrado-clic-derecho']] as const) {
      expect(hecho(CAPITULO_5, paso, base()), paso).toBe(false)
      expect(hecho(CAPITULO_5, paso, base(con('otro'))), paso).toBe(false)
      expect(hecho(CAPITULO_5, paso, base(con(evento))), paso).toBe(true)
      expect(CAPITULO_5.pasos.find((p) => p.id === paso)!.transitorio, paso).toBe(true)
    }
    // La resistencia nueva se borra en el último: «valor» no queda pendiente al retomar.
    expect(CAPITULO_5.pasos.find((p) => p.id === 'valor')!.sigueVigente!(base())).toBe(true)
  })

  it('el lienzo limpio y su regreso siguen el estado del lienzo', () => {
    expect(hecho(CAPITULO_5, 'limpio', base())).toBe(false)
    expect(hecho(CAPITULO_5, 'limpio', base({ limpio: true }))).toBe(true)
    expect(hecho(CAPITULO_5, 'volver', base({ limpio: true }))).toBe(false)
    expect(hecho(CAPITULO_5, 'volver', base({ limpio: false }))).toBe(true)
  })

  it('«r 4k7» se cumple con una resistencia de 4.7 kΩ sobre su sombra y no con la que ya traía el circuito', () => {
    expect(hecho(CAPITULO_5, 'valor', base())).toBe(false)
    const d = copia('trucos')
    d.piezas.nueva = { id: 'nueva', tipo: 'resistencia', ref: 'R2', x: 70, y: -4, rot: 0, espejo: false, props: { valor: '4k7' } }
    expect(hecho(CAPITULO_5, 'valor', ctx(d))).toBe(true)
    d.piezas.nueva.props.valor = '4.7k'
    expect(hecho(CAPITULO_5, 'valor', ctx(d))).toBe(true)
    d.piezas.nueva.props.valor = '47k'
    expect(hecho(CAPITULO_5, 'valor', ctx(d))).toBe(false)
    // Fuera de la sombra el paso no se cumple y el globo lo dice.
    d.piezas.nueva.props.valor = '4k7'
    d.piezas.nueva.x = 90
    expect(hecho(CAPITULO_5, 'valor', ctx(d))).toBe(false)
    expect(CAPITULO_5.pasos.find((p) => p.id === 'valor')!.fueraDeSombra!(ctx(d))).toBe(true)
  })

  it('encuadrar pide F con el lienzo limpio: sin el lienzo limpio o sin el evento no se cumple', () => {
    expect(hecho(CAPITULO_5, 'encuadrar', base({ limpio: true }))).toBe(false)
    expect(hecho(CAPITULO_5, 'encuadrar', base(con('encuadrar')))).toBe(false)
    expect(hecho(CAPITULO_5, 'encuadrar', base({ limpio: true, ...con('encuadrar') }))).toBe(true)
  })

  it('la rejilla fina y el buscador de comandos esperan su evento real', () => {
    for (const [paso, evento] of [['rejilla', 'rejilla-fina'], ['comandos', 'buscar-comando']] as const) {
      expect(hecho(CAPITULO_5, paso, base()), paso).toBe(false)
      expect(hecho(CAPITULO_5, paso, base(con(evento))), paso).toBe(true)
    }
  })

  it('la hoja de atajos se cumple con su diálogo abierto y no con otro', () => {
    expect(hecho(CAPITULO_5, 'atajos', base())).toBe(false)
    expect(hecho(CAPITULO_5, 'atajos', base({ dialogo: 'configuracion' }))).toBe(false)
    expect(hecho(CAPITULO_5, 'atajos', base({ dialogo: 'atajos' }))).toBe(true)
  })
})

describe('los cinco capítulos: objetivos y textos', () => {
  const arranques: Record<string, string> = { 'primer-circuito': '', medir: 'medir', senales: 'senales', archivo: 'archivo', trucos: 'trucos' }

  it('cada objetivo se calcula sin error con el circuito de arranque y con el documento vacío', () => {
    for (const c of CAPITULOS)
      for (const p of c.pasos)
        for (const d of [arranques[c.id] ? copia(arranques[c.id]) : documentoVacio(), documentoVacio()]) {
          const o = p.objetivo(ctx(d))
          expect(['control', 'zona', 'ninguno'], `${c.id}/${p.id}`).toContain(o.tipo)
          if (o.tipo === 'zona') {
            expect(o.caja.maxX, `${c.id}/${p.id}`).toBeGreaterThan(o.caja.minX)
            expect(o.caja.maxY, `${c.id}/${p.id}`).toBeGreaterThan(o.caja.minY)
          }
          if (o.tipo === 'control') expect(o.selector.length, `${c.id}/${p.id}`).toBeGreaterThan(0)
        }
  })

  it('los controles fuera de la pestaña visible de la cinta dicen de cuál son', () => {
    const pestanas = new Set(['inicio', 'simulacion', 'vista', 'ayuda'])
    for (const c of CAPITULOS)
      for (const p of c.pasos) {
        const o = p.objetivo(ctx(documentoVacio()))
        if (o.tipo === 'control' && o.pestana) expect(pestanas.has(o.pestana), `${c.id}/${p.id}`).toBe(true)
      }
    const recientes = CAPITULO_4.pasos.find((p) => p.id === 'reciente')!.objetivo(ctx(documentoVacio()))
    expect(recientes).toEqual({ tipo: 'control', selector: '[data-comando="recientes"]', pestana: 'inicio' })
  })

  it('ningún paso se cumple por sí solo con el circuito de arranque de su propio capítulo', () => {
    // Ningún capítulo arranca con su primer paso hecho: el tutorial no avanzaría sin que la persona haga algo.
    for (const c of CAPITULOS.slice(1)) expect(c.pasos[0].hecho(ctx(copia(arranques[c.id]))), c.id).toBe(false)
  })

  it('los ids de paso no se repiten y los textos van sin guiones largos y con a lo sumo un punto y coma', () => {
    for (const c of CAPITULOS) {
      expect(new Set(c.pasos.map((p) => p.id)).size, c.id).toBe(c.pasos.length)
      expect(c.totalPasos, c.id).toBe(c.pasos.length)
      for (const t of [c.titulo, c.resumen])
        expect(t, c.id).not.toContain('—')
      for (const p of c.pasos)
        for (const t of [p.texto, p.resumen, p.cumplido, p.pista ?? '']) {
          expect(t, `${c.id}/${p.id}`).not.toContain('—')
          expect((t.match(/;/g) ?? []).length, `${c.id}/${p.id}`).toBeLessThanOrEqual(1)
        }
    }
  })
})

describe('lo que los textos piden escribir en el buscador encuentra la pieza', () => {
  const primero = (q: string) => buscar(q, lib)[0]
  it('multímetro, generador, osciloscopio, c 100u y r 4k7', () => {
    const texto = CAPITULOS.flatMap((c) => c.pasos.map((p) => p.texto)).join(' ')
    for (const q of ['«multímetro»', '«generador»', '«osciloscopio»', '«c 100u»', '«r 4k7»']) expect(texto, q).toContain(q)
    expect(primero('multímetro').def.id).toBe('multimetro')
    expect(primero('generador').def.id).toBe('generador')
    expect(primero('osciloscopio').def.id).toBe('osciloscopio')
    expect(primero('c 100u')).toMatchObject({ def: { id: 'capacitor' }, valor: '100u' })
    expect(primero('r 4k7')).toMatchObject({ def: { id: 'resistencia' }, valor: '4k7' })
  })
})

describe('ids de capítulos', () => {
  it('la lista de Ajustes coincide con los capítulos que existen', async () => {
    const { IDS_CAPITULOS_TUTORIAL } = await import('../../../../compartido/ajustes')
    expect([...IDS_CAPITULOS_TUTORIAL]).toEqual(CAPITULOS.map((c) => c.id))
  })
})

describe('mismoValor', () => {
  it('tolera el error de redondeo de 1e-6 relativo y nada más', async () => {
    const { mismoValor } = await import('./condiciones')
    expect(mismoValor(100e-6 * (1 + 5e-7), 100e-6)).toBe(true)
    expect(mismoValor(100e-6 * (1 + 1e-5), 100e-6)).toBe(false)
    expect(mismoValor(null, 5)).toBe(false)
  })
})
