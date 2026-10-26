import { describe, expect, it } from 'vitest'
import { registrarAtajosDelEditor } from '../editor/atajosEditor'
import type { Editor } from '../editor/Editor'
import { Atajos, type EventoTecla } from '../editor/teclado'
import { registrarAtajosDeArchivo } from './atajosArchivo'
import { registrarAtajosDeSimulacion } from './atajosSimulacion'
import { registrarAtajosDeLaVentana } from './atajosVentana'
import { lugarDeTecla } from './cinta/modelo'
import { filtrarMapa, pesoDeGrupo, PESO_ENCABEZADO, PESO_LUGAR, repartirEnColumnas, hojaDeAtajos, mapaDeAtajos, partirCombinacion } from './hojaDeAtajos'

const ev = (key: string, m: Partial<EventoTecla> = {}): EventoTecla => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...m })

/** El registro real de la ventana; los comandos no se ejecutan, así que el editor puede ser un objeto vacío. */
function registro(llamadas: string[] = []): Atajos {
  const a = new Atajos()
  registrarAtajosDelEditor(a, {} as Editor, { encuadrar: () => {} })
  registrarAtajosDeLaVentana(a, { hojaDeAtajos: () => llamadas.push('hoja'), lienzoLimpio: () => llamadas.push('limpio'), configuracion: () => llamadas.push('config'), menuContextual: () => llamadas.push('menu'), enfocarFormato: () => llamadas.push('formato') })
  return a
}

describe('hoja de atajos', () => {
  it('lista cada comando del registro una sola vez, en sus grupos', () => {
    const a = registro()
    const hoja = hojaDeAtajos(a)
    expect(hoja.map((g) => g.nombre)).toEqual(['Edición', 'Piezas y redes', 'Cables', 'Texto', 'Mover', 'Vista y ventana'])
    const ids = hoja.flatMap((g) => g.filas.map((f) => f.id))
    expect(ids.sort()).toEqual(a.lista().map((c) => c.id).sort())
    expect(a.conflictos()).toEqual([])
  })

  it('cada fila trae el nombre y las teclas vigentes, partidas', () => {
    const a = registro()
    const rehacer = hojaDeAtajos(a)[0].filas.find((f) => f.id === 'rehacer')!
    expect(rehacer).toEqual({ id: 'rehacer', nombre: 'Rehacer', teclas: [['Ctrl', 'Y'], ['Ctrl', 'Shift', 'Z']] })
    a.ponerTeclas('rehacer', ['F4'])
    expect(hojaDeAtajos(a)[0].filas.find((f) => f.id === 'rehacer')!.teclas).toEqual([['F4']])
  })

  it('los atajos de Archivo van primero, en su grupo, sin chocar con los demás', () => {
    const a = registro()
    const llamadas: string[] = []
    registrarAtajosDeArchivo(a, { nuevo: () => llamadas.push('nuevo'), abrir: () => llamadas.push('abrir'), guardar: () => llamadas.push('guardar'), guardarComo: () => llamadas.push('como') })
    expect(hojaDeAtajos(a)[0]).toEqual({
      nombre: 'Archivo',
      filas: [
        { id: 'nuevo', nombre: 'Nuevo circuito', teclas: [['Ctrl', 'N']] },
        { id: 'abrir', nombre: 'Abrir un circuito', teclas: [['Ctrl', 'O']] },
        { id: 'guardar', nombre: 'Guardar', teclas: [['Ctrl', 'S']] },
        { id: 'guardar-como', nombre: 'Guardar como', teclas: [['Ctrl', 'Shift', 'S']] }
      ]
    })
    expect(a.conflictos()).toEqual([])
    for (const [key, shiftKey] of [['s', false], ['S', true], ['o', false], ['n', false]] as const) a.despachar(ev(key, { ctrlKey: true, shiftKey }))
    expect(llamadas).toEqual(['guardar', 'como', 'abrir', 'nuevo'])
  })

  it('+ y − mueven el potenciómetro seleccionado, en el grupo Simulación, y solo cuando hay uno', () => {
    const a = registro()
    const llamadas: string[] = []
    let hay = false
    registrarAtajosDeSimulacion(a, {
      simularOPausar: () => {},
      detener: () => {},
      alternarVoltajes: () => {},
      potenciometro: { paso: (d) => llamadas.push(`pot ${d}`), hay: () => hay }
    })
    const g = hojaDeAtajos(a).find((x) => x.nombre === 'Simulación')!
    expect(g.filas.map((f) => f.id)).toEqual(['simular', 'detener', 'voltajes', 'pot-mas', 'pot-menos'])
    expect(g.filas.slice(3).map((f) => f.teclas)).toEqual([[['+']], [['-']]])
    expect(a.conflictos()).toEqual([])
    expect(a.despachar(ev('+'))).toBe(false)
    hay = true
    expect(a.despachar(ev('+'))).toBe(true)
    expect(a.despachar(ev('-'))).toBe(true)
    expect(llamadas).toEqual(['pot 1', 'pot -1'])
  })

  it('F5 simula o pausa, Shift+F5 detiene y V alterna los voltajes, en el grupo Simulación, sin chocar con los demás', () => {
    const a = registro()
    const llamadas: string[] = []
    registrarAtajosDeArchivo(a, { nuevo: () => {}, abrir: () => {}, guardar: () => {}, guardarComo: () => {} })
    registrarAtajosDeSimulacion(a, { simularOPausar: () => llamadas.push('simular'), detener: () => llamadas.push('detener'), alternarVoltajes: () => llamadas.push('voltajes') })
    expect(hojaDeAtajos(a)[1]).toEqual({
      nombre: 'Simulación',
      filas: [
        { id: 'simular', nombre: 'Simular, pausar o reanudar la vista previa', teclas: [['F5']] },
        { id: 'detener', nombre: 'Detener la vista previa', teclas: [['Shift', 'F5']] },
        { id: 'voltajes', nombre: 'Mostrar u ocultar los voltajes de todas las redes', teclas: [['V']] }
      ]
    })
    expect(a.conflictos()).toEqual([])
    a.despachar(ev('F5'))
    a.despachar(ev('F5', { shiftKey: true }))
    a.despachar(ev('v'))
    expect(llamadas).toEqual(['simular', 'detener', 'voltajes'])
  })

  it('lo que no tiene grupo va al final, en Otros', () => {
    const a = registro()
    a.registrar({ id: 'nuevo-comando', nombre: 'Algo nuevo', teclas: ['F9'], ejecutar: () => {} })
    expect(hojaDeAtajos(a).at(-1)).toEqual({ nombre: 'Otros', filas: [{ id: 'nuevo-comando', nombre: 'Algo nuevo', teclas: [['F9']] }] })
  })

  it('Shift+F10 y la tecla de menú abren el menú contextual', () => {
    const llamadas: string[] = []
    const a = registro(llamadas)
    a.despachar(ev('F10', { shiftKey: true }))
    a.despachar(ev('ContextMenu'))
    expect(llamadas).toEqual(['menu', 'menu'])
    expect(hojaDeAtajos(a).flatMap((g) => g.filas).some((f) => f.id === 'menu-contextual')).toBe(true)
  })

  it('?, Ctrl+Shift+L, Ctrl+\ (también con AltGr) y Ctrl+, abren la hoja, el lienzo limpio y Configuración; F11 ya no es del lienzo limpio', () => {
    const llamadas: string[] = []
    const a = registro(llamadas)
    a.despachar(ev('?', { shiftKey: true }))
    a.despachar(ev('L', { ctrlKey: true, shiftKey: true }))
    a.despachar(ev('\\', { ctrlKey: true }))
    a.despachar(ev('\\', { ctrlKey: true, altKey: true }))
    a.despachar(ev(',', { ctrlKey: true }))
    expect(a.despachar(ev('F11'))).toBe(false)
    expect(llamadas).toEqual(['hoja', 'limpio', 'limpio', 'limpio', 'config'])
  })

  it('girar a la derecha y a la izquierda van juntos en «Piezas y redes»', () => {
    const piezas = hojaDeAtajos(registro()).find((g) => g.nombre === 'Piezas y redes')!
    expect(piezas.filas.slice(0, 2)).toEqual([
      { id: 'girar', nombre: 'Girar 90° a la derecha', teclas: [['R']] },
      { id: 'girar-izq', nombre: 'Girar 90° a la izquierda', teclas: [['Shift', 'R']] }
    ])
  })

  it('los atajos de formato van en «Texto», con Shift en la alineación para no chocar con R ni con L', () => {
    const texto = hojaDeAtajos(registro()).find((g) => g.nombre === 'Texto')!
    expect(texto.filas.map((f) => [f.id, f.teclas[0].join('+')])).toEqual([
      ['negrita', 'Ctrl+B'], ['cursiva', 'Ctrl+I'], ['subrayado', 'Ctrl+U'], ['tam-mayor', 'Ctrl+Shift+.'], ['tam-menor', 'Ctrl+Shift+,'],
      ['alinear-izq', 'Ctrl+Shift+Q'], ['alinear-centro', 'Ctrl+Shift+E'], ['alinear-der', 'Ctrl+Shift+R'], ['justificar', 'Ctrl+Shift+J']
    ])
  })

  it('partirCombinacion', () => {
    expect(partirCombinacion('Ctrl+Shift+Z')).toEqual(['Ctrl', 'Shift', 'Z'])
    expect(partirCombinacion('Ctrl+\\')).toEqual(['Ctrl', '\\'])
    expect(partirCombinacion('?')).toEqual(['?'])
  })

  it('Ctrl+F1 pliega la cinta y Ctrl+K va al buscador, en «Vista y ventana» detrás de Lienzo limpio', () => {
    const a = new Atajos()
    const llamadas: string[] = []
    registrarAtajosDeLaVentana(a, {
      hojaDeAtajos: () => {},
      lienzoLimpio: () => {},
      configuracion: () => {},
      menuContextual: () => {},
      enfocarFormato: () => {},
      plegarCinta: () => llamadas.push('plegar'),
      buscarComando: () => llamadas.push('buscar')
    })
    const vista = hojaDeAtajos(a).find((g) => g.nombre === 'Vista y ventana')!
    expect(vista.filas.map((f) => f.id)).toEqual(['menu-contextual', 'formato-barra', 'limpio', 'plegar-cinta', 'buscar-comando', 'atajos', 'configuracion'])
    expect(vista.filas.find((f) => f.id === 'plegar-cinta')).toEqual({ id: 'plegar-cinta', nombre: 'Plegar o fijar la cinta', teclas: [['Ctrl', 'F1']] })
    expect(vista.filas.find((f) => f.id === 'buscar-comando')!.teclas).toEqual([['Ctrl', 'K']])
    a.despachar(ev('F1', { ctrlKey: true }))
    a.despachar(ev('k', { ctrlKey: true }))
    expect(llamadas).toEqual(['plegar', 'buscar'])
    expect(a.conflictos()).toEqual([])
  })
})

/** El registro completo, como en la ventana (con Archivo, Simulación y la cinta). */
function registroCompleto(): Atajos {
  const a = new Atajos()
  const nada = () => {}
  registrarAtajosDelEditor(a, {} as Editor, { encuadrar: nada })
  registrarAtajosDeLaVentana(a, { hojaDeAtajos: nada, lienzoLimpio: nada, configuracion: nada, menuContextual: nada, enfocarFormato: nada, plegarCinta: nada, buscarComando: nada })
  registrarAtajosDeSimulacion(a, { simularOPausar: nada, detener: nada, alternarVoltajes: nada, potenciometro: { paso: nada, hay: () => false }, tiempo: { ejecutar: nada } })
  registrarAtajosDeArchivo(a, { nuevo: nada, abrir: nada, guardar: nada, guardarComo: nada })
  return a
}

describe('hoja A2 (mapa de atajos)', () => {
  it('cada comando del registro sale una sola vez, en el grupo de su lugar en la cinta, con su icono; sin «Otros»', () => {
    const a = registroCompleto()
    const m = mapaDeAtajos(a, lugarDeTecla)
    expect(m.grupos.map((g) => [g.nombre, g.icono])).toEqual([
      ['Inicio › Archivo', 'abrir'], ['Inicio › Editar', 'copiar'], ['Inicio › Girar y reflejar', 'girar'], ['Inicio › Colocar', 'pieza'],
      ['Simulación', 'simular'], ['Vista y ventana', 'encuadrar'], ['Solo con teclado', 'atajos'], ['Texto de notas', 'formato']
    ])
    // Las ocho flechas van en dos filas (una por paso), que dicen qué órdenes del registro juntan.
    const ids = m.grupos.flatMap((g) => g.filas.flatMap((f) => f.juntas ?? [f.id]))
    const delRegistro = ids.filter((id) => a.nombreDe(id) !== undefined)
    expect(delRegistro.sort()).toEqual(a.lista().map((c) => c.id).sort())
    expect(new Set(ids).size).toBe(ids.length)
    // Siete órdenes más (Avanzar, Avanzar hasta t, Más lento, Más rápido, Corriente, Animaciones y Sonido) y, en la 1.2, Retroceder.
    expect(m.total).toBe(61)
  })

  it('las flechas de mover se juntan en dos filas con las cuatro teclas; si una cambia de tecla, vuelven a ir separadas', () => {
    const a = registroCompleto()
    const teclado = () => mapaDeAtajos(a).grupos.find((g) => g.id === 'teclado')!.filas
    const mover = teclado().filter((f) => f.juntas)
    expect(mover.map((f) => [f.id, f.nombre, f.icono, f.flechas])).toEqual([
      ['mover', 'Mover la selección', 'mover', { teclas: ['←', '→', '↑', '↓'] }],
      ['mover-5', 'Mover la selección cinco pasos', 'mover', { mod: 'Shift', teclas: ['←', '→', '↑', '↓'] }]
    ])
    expect(mover[0].juntas).toEqual(['mover-izq', 'mover-der', 'mover-arriba', 'mover-abajo'])
    // Se encuentran por el nombre de cada una y por sus teclas.
    const m = mapaDeAtajos(a)
    expect(filtrarMapa(m, 'teclado', 'izquierda').flatMap((g) => g.filas.map((f) => f.id))).toEqual(['mover', 'mover-5'])
    expect(filtrarMapa(m, null, 'shift+arriba').flatMap((g) => g.filas.map((f) => f.id))).toEqual(['mover-5'])
    a.ponerTeclas('mover-izq', ['A'])
    expect(teclado().filter((f) => f.juntas).map((f) => f.id)).toEqual(['mover-5'])
    expect(teclado().find((f) => f.id === 'mover-izq')?.teclas).toEqual([['A']])
  })

  it('las once teclas solas, en orden y con su icono; la que se cambia a una combinación sale de la tira', () => {
    const a = registroCompleto()
    expect(mapaDeAtajos(a).solas.map((s) => [s.tecla, s.nombre, s.icono])).toEqual([
      ['R', 'Girar', 'girar'], ['X', 'Horizontal', 'espejoX'], ['Y', 'Vertical', 'espejoY'], ['L', 'Etiqueta', 'etiqueta'], ['G', 'Tierra', 'tierra'],
      ['T', 'Nota', 'nota'], ['V', 'Voltajes', 'voltajes'], ['F', 'Encuadrar', 'encuadrar'], ['F5', 'Simular', 'simular'], ['Supr', 'Borrar', 'borrar'], ['?', 'Atajos', 'atajos']
    ])
    a.ponerTeclas('girar', ['Ctrl+G'])
    a.ponerTeclas('nota', ['N'])
    const solas = mapaDeAtajos(a).solas
    expect(solas.map((s) => s.id)).not.toContain('girar')
    expect(solas.find((s) => s.id === 'nota')?.tecla).toBe('N')
  })

  it('cada fila trae su icono R1, sus teclas vigentes y su lugar si no es el del grupo; Pieza va con «doble clic»', () => {
    const m = mapaDeAtajos(registroCompleto(), lugarDeTecla)
    const fila = (id: string) => m.grupos.flatMap((g) => g.filas).find((f) => f.id === id)!
    expect(fila('rehacer')).toMatchObject({ icono: 'rehacer', teclas: [['Ctrl', 'Y'], ['Ctrl', 'Shift', 'Z']] })
    expect(fila('rehacer')).toHaveProperty('lugar', 'Barra')
    expect(fila('cortar')).not.toHaveProperty('lugar')
    expect(fila('limpio')).toMatchObject({ lugar: 'Vista › Ventana' })
    expect(fila('pieza')).toMatchObject({ nombre: 'Pieza…', teclas: [], gesto: 'doble clic', icono: 'pieza' })
    expect(fila('pagina-mas')).toMatchObject({ teclas: [['Ctrl', '+']] })
    // Ninguna fila sin icono.
    expect(m.grupos.flatMap((g) => g.filas).filter((f) => !f.icono).map((f) => f.id)).toEqual([])
    expect([fila('negrita').icono, fila('escape').icono, fila('mover-5').icono, fila('retroceso').icono, fila('buscar-comando').icono]).toEqual([
      'negrita', 'cancelar', 'mover', 'quitarEsquina', 'buscar'
    ])
  })

  it('reparte los grupos en columnas parejas sin cambiar su orden', () => {
    expect(repartirEnColumnas([5, 5, 5, 5], 2)).toEqual([[0, 1], [2, 3]])
    expect(repartirEnColumnas([10, 2, 2, 2, 2, 2], 2)).toEqual([[0], [1, 2, 3, 4, 5]])
    expect(repartirEnColumnas([3, 9, 4, 4, 6, 5], 3)).toEqual([[0, 1], [2, 3], [4, 5]])
    // Más columnas que grupos: las que sobran no se crean; una sola columna los lleva todos.
    expect(repartirEnColumnas([4, 4], 3)).toEqual([[0], [1]])
    expect(repartirEnColumnas([1, 2, 3], 1)).toEqual([[0, 1, 2]])
    expect(repartirEnColumnas([], 2)).toEqual([])
  })

  it('el peso de un grupo cuenta su encabezado y los renglones de más de cada fila', () => {
    const m = mapaDeAtajos(registroCompleto(), lugarDeTecla)
    const archivo = m.grupos[0]
    expect(pesoDeGrupo(archivo)).toBeCloseTo(PESO_ENCABEZADO + archivo.filas.length, 9)
    const editar = m.grupos[1]
    const conLugar = editar.filas.filter((f) => f.lugar).length
    expect(pesoDeGrupo(editar)).toBeCloseTo(PESO_ENCABEZADO + editar.filas.length + conLugar * PESO_LUGAR, 9)
  })

  it('filtrar por grupo y por texto (nombre o tecla, sin acentos ni mayúsculas); lo vacío no se muestra', () => {
    const m = mapaDeAtajos(registroCompleto(), lugarDeTecla)
    expect(filtrarMapa(m, 'simulacion', '').map((g) => g.filas.length)).toEqual([13])
    // Por subcadena de «nombre + teclas»: «ctrl+o» solo es la de Abrir («ctrl+s» también estaría en «ctrl+shift+z»).
    expect(filtrarMapa(m, null, 'ctrl+o').flatMap((g) => g.filas.map((f) => f.id))).toEqual(['abrir'])
    expect(filtrarMapa(m, null, 'ESPEJO').flatMap((g) => g.filas.map((f) => f.id))).toEqual([])
    expect(filtrarMapa(m, null, 'reflejar').flatMap((g) => g.filas.map((f) => f.id))).toEqual(['espejo-x', 'espejo-y'])
    expect(filtrarMapa(m, null, 'configuracion').flatMap((g) => g.filas.map((f) => f.id))).toEqual(['configuracion'])
    expect(filtrarMapa(m, 'texto', 'f5')).toEqual([])
  })
})
