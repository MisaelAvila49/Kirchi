// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../../conexiones/conexiones'
import { documentoVacio, type Documento, type Pieza } from '../../doc/tipos'
import { libreriaDePrueba } from '../../prueba/libreria'
import { TRAZOS } from '../cinta/trazos'
import { arranqueDeCapitulo } from './arranques'
import { CAPITULO_1 } from './capitulo1'
import { CAPITULO_2 } from './capitulo2'
import { CAPITULO_3 } from './capitulo3'
import { CAPITULO_4 } from './capitulo4'
import { CAPITULO_5 } from './capitulo5'
import { CAPITULOS } from './capitulos'
import { primerPasoPendiente } from './reanudar'
import { partirTexto, textoLlano } from './texto'
import type { CapituloDef, CtxTutorial } from './tipos'

const lib = libreriaDePrueba().piezas
const ctx = (d: Documento, extra: Partial<CtxTutorial> = {}): CtxTutorial => ({ doc: d, con: calcularConexiones(d, lib), lib, fase: 'detenida', centro: { x: 0, y: 0 }, ...extra })
const con = (...e: string[]) => ({ eventos: new Set(e) })
const hecho = (c: CapituloDef, id: string, x: CtxTutorial): boolean => c.pasos.find((p) => p.id === id)!.hecho(x)
const pieza = (id: string, tipo: string, x: number, y: number, rot: Pieza['rot'] = 0, props: Record<string, string> = {}): Pieza => ({ id, tipo, ref: id.toUpperCase(), x, y, rot, espejo: false, props })
const vacio = () => documentoVacio()
const inicio = (id: string): Documento => structuredClone(arranqueDeCapitulo(id)!)

describe('los cinco capítulos: forma y textos', () => {
  const pasos = CAPITULOS.flatMap((c) => c.pasos.map((p) => ({ c, p })))

  it('hay cinco capítulos con ids propios, numerados y con su descripción', () => {
    expect(CAPITULOS.map((c) => [c.numero, c.id, c.titulo])).toEqual([
      [1, 'conoce', 'Conoce Kirchi'],
      [2, 'circuito', 'Tu primer circuito'],
      [3, 'medir-senales', 'Medir'],
      [4, 'analizar', 'Analizar y exportar'],
      [5, 'importar', 'Importar']
    ])
    for (const c of CAPITULOS) expect(c.descripcion.split('. ').length, c.id).toBeLessThanOrEqual(2)
  })

  it('los ids de paso no se repiten dentro de un capítulo y cada paso tiene resumen, texto y objetivo', () => {
    for (const c of CAPITULOS) {
      expect(new Set(c.pasos.map((p) => p.id)).size, c.id).toBe(c.pasos.length)
      for (const p of c.pasos) {
        expect(p.resumen.length, `${c.id}/${p.id}`).toBeGreaterThan(5)
        expect(p.texto.length, `${c.id}/${p.id}`).toBeGreaterThan(10)
        expect(typeof p.objetivo, `${c.id}/${p.id}`).toBe('function')
      }
    }
  })

  it('todos los pasos señalan algo con el marco, nunca «ninguno» (con el circuito de su capítulo)', () => {
    for (const c of CAPITULOS) {
      const d = c.arranque ? inicio(c.id) : vacio()
      const x = ctx(d)
      for (const p of c.pasos) {
        const o = p.objetivo(x)
        expect(o.tipo, `${c.id}/${p.id}`).not.toBe('ninguno')
        if (o.tipo === 'control') expect(o.selector.length, `${c.id}/${p.id}`).toBeGreaterThan(3)
      }
    }
  })

  it('un paso «Mira» no se cumple solo: avanza con «Siguiente» y al retomar se da por visto', () => {
    const miras = pasos.filter(({ p }) => p.tipo === 'mira')
    expect(miras.length).toBeGreaterThanOrEqual(10)
    for (const { c, p } of miras) {
      const x = ctx(c.arranque ? inicio(c.id) : vacio(), con('zoom-rueda', 'encuadrar', 'buscar-comando'))
      expect(p.hecho(x), `${c.id}/${p.id}`).toBe(false)
      expect(p.transitorio, `${c.id}/${p.id}`).toBe(true)
    }
    // Los «Haz» no declaran tipo «mira».
    expect(pasos.filter(({ p }) => p.tipo === 'haz').length).toBe(0)
  })

  it('los textos: sin guiones largos, sin «patilla», pocos puntos y coma y solo iconos que existen', () => {
    for (const { c, p } of pasos) {
      const todo = `${p.resumen} ${p.texto} ${p.pista ?? ''} ${p.cumplido}`
      expect(todo, `${c.id}/${p.id}`).not.toMatch(/—|–/)
      expect(todo.toLowerCase(), `${c.id}/${p.id}`).not.toContain('patilla')
      expect((todo.match(/;/g) ?? []).length, `${c.id}/${p.id}`).toBe(0)
      for (const parte of partirTexto(p.texto, () => undefined)) if (parte.tipo === 'icono') expect(Object.hasOwn(TRAZOS, parte.id), `${c.id}/${p.id}: ${parte.id}`).toBe(true)
    }
  })

  it('ninguna marca quedó sin dibujar: ni el texto, ni la pista, ni el resumen o el cumplido llevan una llave suelta', () => {
    for (const { c, p } of pasos) {
      for (const [campo, valor] of Object.entries({ texto: p.texto, pista: p.pista ?? '', resumen: p.resumen, cumplido: p.cumplido })) {
        const sueltos = partirTexto(valor, () => 'X').filter((parte) => parte.tipo === 'texto' && /[{}]/.test(parte.texto))
        expect(sueltos, `${c.id}/${p.id}.${campo}`).toEqual([])
        // La pista se dibuja con el mismo lector que el texto, así que sus marcas también deben existir.
        for (const parte of partirTexto(valor, () => 'X')) if (parte.tipo === 'icono') expect(Object.hasOwn(TRAZOS, parte.id), `${c.id}/${p.id}.${campo}: ${parte.id}`).toBe(true)
      }
    }
  })

  it('el texto de una instrucción es corto: una instrucción y a lo más una pista', () => {
    for (const { c, p } of pasos) {
      expect(textoLlano(p.texto, () => 'F5', (id) => id).length, `${c.id}/${p.id}`).toBeLessThanOrEqual(140)
      expect(p.pista === undefined || p.pista.length <= 130, `${c.id}/${p.id}`).toBe(true)
    }
  })

  it('los pasos del capítulo 1 llevan los iconos de la interfaz junto a sus nombres', () => {
    const iconos = (id: string) => partirTexto(CAPITULO_1.pasos.find((p) => p.id === id)!.texto, () => undefined).filter((x) => x.tipo === 'icono').map((x) => (x.tipo === 'icono' ? x.id : ''))
    expect(iconos('izquierdo')).toEqual(['libreria', 'plantillas', 'calculadoras'])
    expect(iconos('derecho')).toEqual(['inspector', 'mediciones', 'proyecto', 'analisis'])
    expect(iconos('franja')).toEqual(['osciloscopio', 'graficas', 'registro'])
  })

  it('los pasos sobre el diálogo y las zonas del panel de la figura existen en el código del editor', () => {
    const editor = readFileSync(join(import.meta.dirname, '../exportar/editor/EditorFigura.tsx'), 'utf8')
    const zonas = CAPITULO_4.pasos.filter((p) => p.id.startsWith('figura-')).map((p) => p.id.slice('figura-'.length))
    expect(zonas).toEqual(['restablecer', 'datos', 'tema', 'mostrar', 'letra', 'texto', 'rejilla', 'ejes', 'adornos'])
    for (const z of zonas) expect(editor, z).toContain(`data-zona="${z}"`)
    for (const p of CAPITULO_4.pasos.filter((q) => q.id.startsWith('figura-'))) expect(p.sobreDialogo, p.id).toBe(true)
  })
})

describe('capítulo 1: Conoce Kirchi', () => {
  const x = (...e: string[]) => ctx(inicio('conoce'), con(...e))

  it('tiene cuatro pasos «Mira» y siete «Haz» en el orden aprobado', () => {
    expect(CAPITULO_1.pasos.map((p) => `${p.tipo === 'mira' ? 'mira' : 'haz'}:${p.id}`)).toEqual([
      'mira:cinta', 'mira:izquierdo', 'mira:derecho', 'mira:franja', 'haz:zoom', 'haz:desplazar', 'haz:encuadrar', 'haz:pantalla-completa', 'haz:limpio', 'haz:comandos', 'haz:atajos'
    ])
  })

  it('cada gesto se cumple con su evento y no con otro', () => {
    expect(hecho(CAPITULO_1, 'zoom', x())).toBe(false)
    expect(hecho(CAPITULO_1, 'zoom', x('zoom-rueda'))).toBe(true)
    expect(hecho(CAPITULO_1, 'zoom', x('desplazar-vista'))).toBe(false)
    expect(hecho(CAPITULO_1, 'desplazar', x('desplazar-vista'))).toBe(true)
    expect(hecho(CAPITULO_1, 'encuadrar', x('encuadrar'))).toBe(true)
    expect(hecho(CAPITULO_1, 'comandos', x('buscar-comando'))).toBe(true)
  })

  it('la pantalla completa y el lienzo limpio piden entrar y volver, para no dejar la ventana cambiada', () => {
    expect(hecho(CAPITULO_1, 'pantalla-completa', x('pantalla-completa-si'))).toBe(false)
    expect(hecho(CAPITULO_1, 'pantalla-completa', x('pantalla-completa-si', 'pantalla-completa-no'))).toBe(true)
    expect(hecho(CAPITULO_1, 'limpio', x('limpio-si'))).toBe(false)
    expect(hecho(CAPITULO_1, 'limpio', x('limpio-si', 'limpio-no'))).toBe(true)
  })

  it('la hoja de atajos se cumple al abrirse', () => {
    expect(hecho(CAPITULO_1, 'atajos', ctx(inicio('conoce')))).toBe(false)
    expect(hecho(CAPITULO_1, 'atajos', ctx(inicio('conoce'), { dialogo: 'atajos' }))).toBe(true)
  })

  it('Ctrl+K señala el cuadro de búsqueda de comandos', () => {
    expect(CAPITULO_1.pasos.find((p) => p.id === 'comandos')!.objetivo(x())).toEqual({ tipo: 'control', selector: '.buscar-comando input' })
  })
})

describe('capítulo 2: Tu primer circuito', () => {
  /** El circuito del capítulo hasta el final del tramo anterior: la fuente, el cable de su + y nada más cambiado. */
  const sinFuente = (): Documento => {
    const d = inicio('medir-senales')
    delete d.piezas.v
    delete d.cables.c1
    return d
  }
  /** Con el terminal VCC, su cable, la etiqueta en un tramo corto y, si se pide, la copia unida a la resistencia. */
  const conVcc = (rot: 0 | 90 = 90, copia = true): Documento => {
    const d = sinFuente()
    d.piezas.t = pieza('t', 'alimentacion', 0, -12)
    d.cables.w1 = { id: 'w1', puntos: [{ x: 0, y: -12 }, { x: 0, y: -4 }] }
    d.cables.w2 = { id: 'w2', puntos: [{ x: 0, y: -8 }, { x: 4, y: -8 }] }
    d.etiquetas.e1 = { id: 'e1', nombre: 'VCC', x: 4, y: -8, rot }
    if (copia) {
      d.etiquetas.e2 = { id: 'e2', nombre: 'VCC', x: 8, y: -4, rot }
      d.cables.w3 = { id: 'w3', puntos: [{ x: 8, y: -4 }, { x: 12, y: -4 }] }
    }
    return d
  }

  it('termina con la nota, quitar la fuente, el terminal VCC, la etiqueta, su copia y la vista previa', () => {
    expect(CAPITULO_2.pasos.slice(10).map((p) => p.id)).toEqual(['nota', 'borrar-fuente', 'terminal', 'cable-terminal', 'etiqueta-vcc', 'girar-etiqueta', 'duplicar-etiqueta', 'unir-copia', 'simular-etiquetas'])
    expect(CAPITULO_2.totalPasos).toBe(CAPITULO_2.pasos.length)
  })

  it('borrar la fuente exige borrar también el cable de su +: el pin libre de la resistencia queda solo', () => {
    expect(hecho(CAPITULO_2, 'borrar-fuente', ctx(inicio('medir-senales')))).toBe(false)
    const d = inicio('medir-senales')
    delete d.piezas.v
    expect(hecho(CAPITULO_2, 'borrar-fuente', ctx(d))).toBe(false)
    delete d.cables.c1
    expect(hecho(CAPITULO_2, 'borrar-fuente', ctx(d))).toBe(true)
  })

  it('el terminal se cumple sobre su sombra con VCC (el riel de 5 V) o con un nombre de 5 V, y no con otro voltaje', () => {
    const d = sinFuente()
    expect(hecho(CAPITULO_2, 'terminal', ctx(d))).toBe(false)
    d.piezas.t = pieza('t', 'alimentacion', 0, -12)
    expect(hecho(CAPITULO_2, 'terminal', ctx(d))).toBe(true)
    d.piezas.t.props.nombre = '+5V'
    expect(hecho(CAPITULO_2, 'terminal', ctx(d))).toBe(true)
    d.piezas.t.props.nombre = '12V'
    expect(hecho(CAPITULO_2, 'terminal', ctx(d))).toBe(false)
    d.piezas.t.props.nombre = 'VCC'
    d.piezas.t.x = 20
    expect(hecho(CAPITULO_2, 'terminal', ctx(d))).toBe(false)
  })

  it('el cable, la etiqueta VCC, el giro, la duplicación y la unión se cumplen cada uno con su acción', () => {
    const t = conVcc(0, false)
    delete t.cables.w1
    delete t.cables.w2
    delete t.etiquetas.e1
    expect(hecho(CAPITULO_2, 'cable-terminal', ctx(t))).toBe(false)
    expect(hecho(CAPITULO_2, 'cable-terminal', ctx(conVcc(0, false)))).toBe(true)
    // La etiqueta debe llamarse VCC y tocar el cable del terminal.
    const e = conVcc(0, false)
    expect(hecho(CAPITULO_2, 'etiqueta-vcc', ctx(e))).toBe(true)
    e.etiquetas.e1.nombre = 'A'
    expect(hecho(CAPITULO_2, 'etiqueta-vcc', ctx(e))).toBe(false)
    // Girar: cualquier giro distinto del de omisión.
    expect(hecho(CAPITULO_2, 'girar-etiqueta', ctx(conVcc(0, false)))).toBe(false)
    expect(hecho(CAPITULO_2, 'girar-etiqueta', ctx(conVcc(90, false)))).toBe(true)
    // Duplicar: dos etiquetas VCC con el mismo giro girado; una escrita de nuevo (sin giro) no cuenta.
    expect(hecho(CAPITULO_2, 'duplicar-etiqueta', ctx(conVcc(90, false)))).toBe(false)
    expect(hecho(CAPITULO_2, 'duplicar-etiqueta', ctx(conVcc(90)))).toBe(true)
    const nueva = conVcc(90)
    nueva.etiquetas.e2.rot = 0
    expect(hecho(CAPITULO_2, 'duplicar-etiqueta', ctx(nueva))).toBe(false)
    // Unir: la copia toca el pin libre de la resistencia; suelta, no.
    expect(hecho(CAPITULO_2, 'unir-copia', ctx(conVcc(90, false)))).toBe(false)
    expect(hecho(CAPITULO_2, 'unir-copia', ctx(conVcc(90)))).toBe(true)
    const suelta = conVcc(90)
    delete suelta.cables.w3
    expect(hecho(CAPITULO_2, 'unir-copia', ctx(suelta))).toBe(false)
  })

  it('un cable directo del terminal a la resistencia no cuenta como la unión por etiqueta', () => {
    const d = conVcc(90, false)
    d.cables.w9 = { id: 'w9', puntos: [{ x: 0, y: -4 }, { x: 12, y: -4 }] }
    expect(hecho(CAPITULO_2, 'unir-copia', ctx(d))).toBe(false)
  })

  it('el LED se enciende solo con la vista previa en marcha y la unión por la etiqueta', () => {
    const paso = CAPITULO_2.pasos.at(-1)!
    expect(paso.hecho(ctx(conVcc()))).toBe(false)
    expect(paso.hecho(ctx(conVcc(), { fase: 'corriendo' }))).toBe(true)
    expect(paso.hecho(ctx(conVcc(90, false), { fase: 'corriendo' }))).toBe(false)
  })

  it('con la fuente ya borrada, retomar en los últimos pasos no vuelve a pedir los primeros', () => {
    for (const id of ['fuente', 'resistencia', 'led', 'girar', 'cables', 'tierra'])
      expect(primerPasoPendiente(CAPITULO_2, ctx(conVcc()), CAPITULO_2.pasos.findIndex((p) => p.id === 'borrar-fuente')), id).toBe(-1)
  })

  it('la sombra del terminal y el cable punteado guían hasta que se cumplen', () => {
    const terminal = CAPITULO_2.pasos.find((p) => p.id === 'terminal')!
    expect(terminal.guia!(ctx(sinFuente())).piezas).toMatchObject([{ tipo: 'alimentacion', x: 0, y: -12, rot: 0 }])
    expect(terminal.guia!(ctx(conVcc())).piezas).toEqual([])
    const cable = CAPITULO_2.pasos.find((p) => p.id === 'cable-terminal')!
    const sin = conVcc(0, false)
    delete sin.cables.w1
    expect(cable.guia!(ctx(sin)).cables).toHaveLength(1)
    expect(cable.guia!(ctx(conVcc())).cables).toEqual([])
  })

  it('la nota se cumple con cualquier nota de texto', () => {
    const d = vacio()
    expect(hecho(CAPITULO_2, 'nota', ctx(d))).toBe(false)
    d.notas.n = { id: 'n', x: 0, y: 0, ancho: 20, texto: 'Hola' }
    expect(hecho(CAPITULO_2, 'nota', ctx(d))).toBe(true)
  })

  it('V cumple con los voltajes visibles solo si la simulación corre', () => {
    const d = inicio('medir-senales')
    expect(hecho(CAPITULO_2, 'voltajes', ctx(d, { voltajes: true }))).toBe(false)
    expect(hecho(CAPITULO_2, 'voltajes', ctx(d, { voltajes: true, fase: 'corriendo' }))).toBe(true)
    expect(hecho(CAPITULO_2, 'voltajes', ctx(d, { voltajes: false, fase: 'corriendo' }))).toBe(false)
  })

  it('el valor se cambia con la simulación en marcha: el paso no pide detenerla', () => {
    const p = CAPITULO_2.pasos.find((q) => q.id === 'valor')!
    expect(p.texto).toContain('{codigo:1k}')
    expect(p.pista).toContain('en vivo')
    expect(hecho(CAPITULO_2, 'valor', ctx(inicio('medir-senales'), { fase: 'corriendo' }))).toBe(true)
  })
})

describe('capítulo 3: Medir', () => {
  it('el orden: medidores, lectura, generador y capacitor, osciloscopio con sus mandos, y el control del tiempo', () => {
    expect(CAPITULO_3.pasos.map((p) => p.id)).toEqual([
      'medidor-rapido', 'multimetro', 'sonda', 'simular', 'lectura', 'detener', 'generador', 'cuadrada', 'capacitor', 'osciloscopio',
      'canal-a', 'canal-b', 'osciloscopio-simular', 'tiempo-div', 'disparo', 'cursores', 'medidas', 'pausa', 'avanzar', 'retroceder'
    ])
  })

  it('la sonda de voltaje se cumple solo con una sonda de ese tipo', () => {
    const d = inicio('medir-senales')
    expect(hecho(CAPITULO_3, 'sonda', ctx(d))).toBe(false)
    d.sondas = { s: { id: 's', tipo: 'corriente', x: 26, y: -4, sentido: 'directo' } as never }
    expect(hecho(CAPITULO_3, 'sonda', ctx(d))).toBe(false)
    d.sondas = { s: { id: 's', tipo: 'voltaje', x: 26, y: -4 } }
    expect(hecho(CAPITULO_3, 'sonda', ctx(d))).toBe(true)
  })

  it('la lectura es un paso «Mira» sobre Mediciones, con el panel abierto', () => {
    const p = CAPITULO_3.pasos.find((q) => q.id === 'lectura')!
    expect(p.tipo).toBe('mira')
    expect(p.abre).toBe('mediciones')
    expect(p.objetivo(ctx(inicio('medir-senales')))).toMatchObject({ tipo: 'control', selector: '#panel-derecho .fila-instrumento' })
  })

  it('el tiempo por división y el disparo se cumplen al cambiar su valor respecto del de omisión', () => {
    const d = inicio('medir-senales')
    d.piezas.o = pieza('o', 'osciloscopio', 28, 24)
    expect(hecho(CAPITULO_3, 'tiempo-div', ctx(d))).toBe(false)
    expect(hecho(CAPITULO_3, 'disparo', ctx(d))).toBe(false)
    d.piezas.o.props = { base: '10m' }
    expect(hecho(CAPITULO_3, 'tiempo-div', ctx(d))).toBe(true)
    expect(hecho(CAPITULO_3, 'disparo', ctx(d))).toBe(false)
    d.piezas.o.props = { disp_flanco: 'Bajada' }
    expect(hecho(CAPITULO_3, 'disparo', ctx(d))).toBe(true)
    // Escribir el valor de omisión no cuenta como un cambio.
    d.piezas.o.props = { disp_flanco: 'Subida', base: '1m' }
    expect(hecho(CAPITULO_3, 'disparo', ctx(d))).toBe(false)
    expect(hecho(CAPITULO_3, 'tiempo-div', ctx(d))).toBe(false)
  })

  it('los cursores se cumplen al encenderlos y el texto dice que miden sin pausar', () => {
    expect(hecho(CAPITULO_3, 'cursores', ctx(inicio('medir-senales'), { cursores: false }))).toBe(false)
    expect(hecho(CAPITULO_3, 'cursores', ctx(inicio('medir-senales'), { cursores: true }))).toBe(true)
    const p = CAPITULO_3.pasos.find((q) => q.id === 'cursores')!
    expect(p.pista).toContain('no hace falta pausar')
    expect(p.objetivo(ctx(vacio()))).toEqual({ tipo: 'control', selector: '.barra-instrumento [data-accion="cursores"]' })
  })

  it('pausa, avanzar y retroceder usan la fase y los eventos de la simulación, con las teclas y botones de la aplicación', () => {
    expect(hecho(CAPITULO_3, 'pausa', ctx(vacio(), { fase: 'corriendo' }))).toBe(false)
    expect(hecho(CAPITULO_3, 'pausa', ctx(vacio(), { fase: 'pausada' }))).toBe(true)
    expect(hecho(CAPITULO_3, 'avanzar', ctx(vacio(), con()))).toBe(false)
    expect(hecho(CAPITULO_3, 'avanzar', ctx(vacio(), con('avanzado')))).toBe(true)
    expect(hecho(CAPITULO_3, 'retroceder', ctx(vacio(), con('avanzado')))).toBe(false)
    expect(hecho(CAPITULO_3, 'retroceder', ctx(vacio(), con('retrocedido')))).toBe(true)
    const t = (id: string) => CAPITULO_3.pasos.find((p) => p.id === id)!.texto
    expect(t('avanzar')).toContain('{tecla:avanzar}')
    expect(t('avanzar')).toContain('{icono:paso|Avanzar}')
    expect(t('retroceder')).toContain('{tecla:retroceder}')
    expect(t('retroceder')).toContain('{icono:pasoAtras|Retroceder}')
    expect(t('pausa')).toContain('{tecla:simular}')
  })

  it('el icono de Medir es el de la interfaz', () => {
    expect(CAPITULO_3.pasos.find((p) => p.id === 'medidor-rapido')!.texto).toContain('{icono:voltajes|Medir}')
  })
})

describe('capítulo 4: Analizar y exportar', () => {
  it('el orden: calculadora, bode, gráfica, tour del panel de la figura, varios elementos, exportar y esquema', () => {
    expect(CAPITULO_4.pasos.map((p) => p.id)).toEqual([
      'filtros', 'notch', 'generar', 'bode', 'ejecutar', 'cursores-grafica', 'abrir-figura', 'informe',
      'figura-restablecer', 'figura-datos', 'figura-tema', 'figura-mostrar', 'figura-letra', 'figura-texto', 'figura-rejilla', 'figura-ejes', 'figura-adornos',
      'varios', 'juntos', 'exportar-figura', 'abrir-esquema', 'esquema-herramientas', 'esquema-seleccion', 'esquema-formatos', 'exportar-esquema'
    ])
  })

  it('Filtros y el notch de 60 Hz se leen de la calculadora; otra frecuencia u otro tipo no cuentan', () => {
    const d = vacio()
    expect(hecho(CAPITULO_4, 'filtros', ctx(d, { izquierdo: 'calculadoras', calculadora: { activa: 'divisor' } }))).toBe(false)
    expect(hecho(CAPITULO_4, 'filtros', ctx(d, { izquierdo: 'libreria', calculadora: { activa: 'filtro' } }))).toBe(false)
    expect(hecho(CAPITULO_4, 'filtros', ctx(d, { izquierdo: 'calculadoras', calculadora: { activa: 'filtro' } }))).toBe(true)
    expect(hecho(CAPITULO_4, 'notch', ctx(d, { calculadora: { activa: 'filtro', tipo: 'bajas', f0: '60' } }))).toBe(false)
    expect(hecho(CAPITULO_4, 'notch', ctx(d, { calculadora: { activa: 'filtro', tipo: 'notch', f0: '50' } }))).toBe(false)
    expect(hecho(CAPITULO_4, 'notch', ctx(d, { calculadora: { activa: 'filtro', tipo: 'notch', f0: '60' } }))).toBe(true)
    expect(hecho(CAPITULO_4, 'notch', ctx(d, { calculadora: { activa: 'filtro', tipo: 'notch', f0: '60 Hz' } }))).toBe(true)
  })

  it('el capacitor del RC cuenta por redes: unión a media altura del cable, giro y orden de pines cualesquiera', () => {
    const cable = (id: string, ...pts: [number, number][]) => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })
    const conCap = (rot: Pieza['rot'], cables: ReturnType<typeof cable>[], tipo = 'capacitor') => {
      const d = inicio('medir-senales')
      d.piezas.cap = pieza('cap', tipo, 40, -2, rot, { valor: '100u' })
      for (const c of cables) d.cables[c.id] = c
      return d
    }
    // El documento que dejó la prueba real: c2 partido en una unión (26,-4), un cable de ahí al pin 1 y otro del pin 2 a la tierra.
    const real = conCap(90, [cable('a', [40, -6], [26, -6], [26, -4]), cable('b', [26, -4], [32, -4]), cable('t', [40, 2], [40, 12], [0, 12])])
    real.cables.c2 = cable('c2', [20, -4], [26, -4])
    expect(hecho(CAPITULO_3, 'capacitor', ctx(real))).toBe(true)
    // Pines al revés: el 1 a tierra y el 2 al cable de la resistencia al LED.
    const alReves = conCap(270, [cable('a', [40, 2], [26, 2], [26, -4]), cable('t', [40, -6], [48, -6], [48, 12], [0, 12])])
    alReves.cables.c2 = cable('c2', [20, -4], [26, -4])
    alReves.cables.c2b = cable('c2b', [26, -4], [32, -4])
    expect(hecho(CAPITULO_3, 'capacitor', ctx(alReves))).toBe(true)
    // Con un solo pin conectado, o los dos en la misma red, no cuenta.
    expect(hecho(CAPITULO_3, 'capacitor', ctx(conCap(90, [cable('a', [40, -6], [32, -6], [32, -4])])))).toBe(false)
    expect(hecho(CAPITULO_3, 'capacitor', ctx(conCap(90, [cable('a', [40, -6], [32, -6], [32, -4]), cable('b', [40, 2], [44, 2], [44, -6], [40, -6])])))).toBe(false)
  })

  it('generar se cumple con el generador y los capacitores del notch en el lienzo', () => {
    const d = vacio()
    expect(hecho(CAPITULO_4, 'generar', ctx(d))).toBe(false)
    d.piezas.g = pieza('g', 'generador', 0, 0)
    expect(hecho(CAPITULO_4, 'generar', ctx(d))).toBe(false)
    d.piezas.c1 = pieza('c1', 'capacitor', 20, 0)
    d.piezas.c2 = pieza('c2', 'capacitor', 24, 0)
    expect(hecho(CAPITULO_4, 'generar', ctx(d))).toBe(false)
    d.piezas.c3 = pieza('c3', 'capacitor', 28, 0)
    expect(hecho(CAPITULO_4, 'generar', ctx(d))).toBe(true)
  })

  it('ejecutar, los cursores de la gráfica, los diálogos y las exportaciones se cumplen con lo que de verdad pasó', () => {
    const d = vacio()
    expect(hecho(CAPITULO_4, 'ejecutar', ctx(d, con()))).toBe(false)
    expect(hecho(CAPITULO_4, 'ejecutar', ctx(d, con('bode-listo')))).toBe(true)
    expect(hecho(CAPITULO_4, 'cursores-grafica', ctx(d))).toBe(false)
    expect(hecho(CAPITULO_4, 'cursores-grafica', ctx(d, { cursoresGrafica: true }))).toBe(true)
    expect(hecho(CAPITULO_4, 'abrir-figura', ctx(d, { dialogo: 'atajos' }))).toBe(false)
    expect(hecho(CAPITULO_4, 'abrir-figura', ctx(d, { dialogo: 'exportar-grafica' }))).toBe(true)
    expect(hecho(CAPITULO_4, 'exportar-figura', ctx(d, con('grafica-exportada')))).toBe(true)
    expect(hecho(CAPITULO_4, 'abrir-esquema', ctx(d, { dialogo: 'exportar-esquema' }))).toBe(true)
    expect(hecho(CAPITULO_4, 'exportar-esquema', ctx(d, con('exportado')))).toBe(true)
    expect(hecho(CAPITULO_4, 'exportar-esquema', ctx(d, con('exportado-seleccion')))).toBe(true)
    expect(hecho(CAPITULO_4, 'exportar-esquema', ctx(d, con('grafica-exportada')))).toBe(false)
  })

  it('elegir Informe se cumple con el aviso del editor de la figura y va antes del tour del panel', () => {
    const d = vacio()
    expect(hecho(CAPITULO_4, 'informe', ctx(d, con()))).toBe(false)
    expect(hecho(CAPITULO_4, 'informe', ctx(d, con('figura-informe')))).toBe(true)
    const ids = CAPITULO_4.pasos.map((p) => p.id)
    expect(ids.indexOf('informe')).toBeLessThan(ids.indexOf('figura-restablecer'))
  })

  it('elegir varios y cambiarlos juntos son dos pasos, uno por cada aviso del editor de la figura', () => {
    const d = vacio()
    expect(hecho(CAPITULO_4, 'varios', ctx(d, con('figura-cambio-multiple')))).toBe(false)
    expect(hecho(CAPITULO_4, 'varios', ctx(d, con('figura-seleccion-multiple')))).toBe(true)
    expect(hecho(CAPITULO_4, 'juntos', ctx(d, con('figura-seleccion-multiple')))).toBe(false)
    expect(hecho(CAPITULO_4, 'juntos', ctx(d, con('figura-cambio-multiple')))).toBe(true)
  })

  it('el tour de las zonas es de pasos «Mira» sobre el diálogo y Ctrl+S es solo una pista del último paso', () => {
    for (const p of CAPITULO_4.pasos.filter((q) => q.id.startsWith('figura-') || q.id.startsWith('esquema-'))) {
      expect(p.tipo, p.id).toBe('mira')
      expect(p.sobreDialogo, p.id).toBe(true)
    }
    expect(CAPITULO_4.pasos.some((p) => p.id === 'guardar')).toBe(false)
    expect(CAPITULO_4.pasos.at(-1)!.pista).toContain('{tecla:guardar}')
  })

  it('los dos capítulos que parten de un lienzo vacío lo piden y no traen circuito', () => {
    expect(CAPITULO_2.documentoNuevo).toBe(true)
    expect(CAPITULO_4.documentoNuevo).toBe(true)
    expect(arranqueDeCapitulo('analizar')).toBeUndefined()
  })
})

describe('capítulo 5: Importar', () => {
  const informe = { origen: { formato: 'spice', nombre: 'amplificador.cir' }, sinEquivalencia: [{ id: 'x1' }] } as unknown as NonNullable<Documento['importacion']>
  const conInforme = (): Documento => {
    const d = vacio()
    d.importacion = informe
    d.piezas.x1 = pieza('x1', 'sin-equivalencia', 0, 0)
    return d
  }

  it('abrir el ejemplo se cumple cuando sale el diálogo del informe y trae su botón en el globo', () => {
    const p = CAPITULO_5.pasos.find((q) => q.id === 'abrir-ejemplo')!
    expect(p.boton).toEqual({ id: 'abrir-ejemplo', texto: 'Abrir el ejemplo' })
    expect(hecho(CAPITULO_5, 'abrir-ejemplo', ctx(vacio()))).toBe(false)
    expect(hecho(CAPITULO_5, 'abrir-ejemplo', ctx(vacio(), { dialogo: 'importacion' }))).toBe(true)
  })

  it('«Entendido» se cumple al cerrar el diálogo con Proyecto a la vista', () => {
    expect(hecho(CAPITULO_5, 'entendido', ctx(conInforme(), { dialogo: 'importacion', derecho: 'proyecto' }))).toBe(false)
    expect(hecho(CAPITULO_5, 'entendido', ctx(conInforme(), { dialogo: null, derecho: 'inspector' }))).toBe(false)
    expect(hecho(CAPITULO_5, 'entendido', ctx(conInforme(), { dialogo: null, derecho: 'proyecto' }))).toBe(true)
  })

  it('señalar la tarjeta ocre se cumple solo con esa tarjeta resaltada', () => {
    expect(hecho(CAPITULO_5, 'resaltar', ctx(conInforme(), { resaltada: 'sinEquivalencia' }))).toBe(false)
    expect(hecho(CAPITULO_5, 'resaltar', ctx(conInforme(), { resaltada: 'aproximadas' }))).toBe(true)
  })

  it('reemplazar se cumple cuando la caja gris ya no está y el informe sigue en el documento', () => {
    expect(hecho(CAPITULO_5, 'reemplazar', ctx(conInforme()))).toBe(false)
    const d = conInforme()
    delete d.piezas.x1
    d.piezas.u2 = pieza('u2', 'amp-op', 0, 0)
    expect(hecho(CAPITULO_5, 'reemplazar', ctx(d))).toBe(true)
    expect(hecho(CAPITULO_5, 'reemplazar', ctx(vacio()))).toBe(false)
  })

  it('parte de un lienzo vacío y el ejemplo produce aproximadas, una caja gris y un análisis', async () => {
    expect(CAPITULO_5.documentoNuevo).toBe(true)
    expect(arranqueDeCapitulo('importar')).toBeUndefined()
    const { importarBytes } = await import('../../importar/importar')
    const { EJEMPLO_IMPORTAR, NOMBRE_EJEMPLO_IMPORTAR } = await import('./ejemploImportar')
    const r = importarBytes(NOMBRE_EJEMPLO_IMPORTAR, new TextEncoder().encode(EJEMPLO_IMPORTAR), lib)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.informe.aproximadas).toHaveLength(1)
      expect(r.informe.sinEquivalencia).toHaveLength(1)
      expect(r.informe.analisis).toHaveLength(1)
    }
  })
})
