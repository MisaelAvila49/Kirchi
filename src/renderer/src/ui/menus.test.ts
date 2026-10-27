// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { documentoVacio, type Documento } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { seleccionVacia } from '../editor/seleccion'
import { menuDeCategoria, menuDePlantilla } from './menus'
import {
  ariaAtajoDeItem, atajoAria, teclasDeAtajo, entradasFormato, menuArchivo, menuDeObjetivo, menuExportar, menuFigura, menuRecientes, nombresDeRecientes, ordenDeAccion, estiloDeAccion, pedidoDeAccion,
  PISTA_SIN_RECIENTES, PISTA_SOLO_LECTURA, PISTA_VACIO, type ContextoArchivo, type ContextoMenu, type EntradaMenu, type ItemMenu, type ModeloMenu
} from './menus'
import { textoMenu } from './cinta/comandos'
import { vistaFormato } from './vistaFormato'
import { vistaFigura } from './vistaFigura'
import { seleccionDe } from '../editor/seleccion'
import { calcularConexiones } from '../conexiones/conexiones'

const lib = libreriaDePrueba().piezas
function ejemplo(): Documento {
  const d = documentoVacio()
  d.piezas.r = { id: 'r', tipo: 'resistencia', ref: 'R1', x: 0, y: 0, rot: 0, espejo: false, props: { valor: '330' } }
  d.piezas.d = { id: 'd', tipo: 'led', ref: 'D1', x: 20, y: 0, rot: 0, espejo: false, props: {} }
  d.etiquetas.e = { id: 'e', nombre: 'VSAL', x: 40, y: 0, rot: 0 }
  return d
}
const TECLAS: Record<string, string> = {
  girar: 'R', 'girar-izq': 'Shift+R', 'espejo-x': 'X', 'espejo-y': 'Y', cortar: 'Ctrl+X', copiar: 'Ctrl+C', duplicar: 'Ctrl+D', borrar: 'Supr', pegar: 'Ctrl+V', etiqueta: 'L', tierra: 'G', nota: 'T', encuadrar: 'F',
  configuracion: 'Ctrl+,', nuevo: 'Ctrl+N', abrir: 'Ctrl+O', guardar: 'Ctrl+S', 'guardar-como': 'Ctrl+Shift+S'
}
const archivo = (extra: Partial<ContextoArchivo> = {}): ContextoArchivo => ({ teclas: (id) => TECLAS[id], recientes: [], soloLectura: false, vacio: false, ...extra })
const items = (es: EntradaMenu[] | undefined) => (es ?? []).flatMap((e): ItemMenu[] => (e.tipo === 'item' ? [e] : []))
const ctx = (extra: Partial<ContextoMenu> = {}): ContextoMenu => ({ doc: ejemplo(), lib, puedePegar: true, teclas: (id) => TECLAS[id], seleccionados: 1, ...extra })
/** Texto y atajo de cada ítem; «—» por cada separador. */
const filas = (m: ModeloMenu) => m.entradas.map((e) => (e.tipo === 'separador' ? '—' : `${e.texto}${e.atajo ? ` [${e.atajo}]` : ''}${e.deshabilitado ? ' (no)' : ''}`))
const en = { x: 0, y: 0 }

describe('menús del clic derecho', () => {
  it('el clic derecho de una figura: cortar, copiar, duplicar, llevar al fondo y borrar', () => {
    const doc = { ...documentoVacio(), figuras: { f1: { id: 'f1', tipo: 'flecha' as const, x1: 0, y1: 0, x2: 8, y2: 0, orden: 0 } } }
    const m = menuDeObjetivo({ tipo: 'figura', id: 'f1', en: { x: 4, y: 0 } }, { doc, lib: new Map(), puedePegar: false, teclas: () => undefined, seleccionados: 1 })
    expect(m.titulo).toBe('Flecha')
    expect(m.entradas.filter((e) => e.tipo === 'item').map((e) => (e.tipo === 'item' ? e.id : ''))).toEqual(['panel-inspector', 'cortar', 'copiar', 'pegar-aqui', 'duplicar', 'al-fondo', 'borrar'])
    expect(m.entradas.find((e) => e.tipo === 'item' && e.id === 'al-fondo')).toMatchObject({ texto: 'Llevar al fondo' })
    // Ya detrás de las demás: deshabilitado con su razón.
    const atras = menuDeObjetivo({ tipo: 'figura', id: 'f1', en: { x: 4, y: 0 } }, { doc, lib: new Map(), puedePegar: false, teclas: () => undefined, seleccionados: 1, alFondo: false })
    expect(atras.entradas.find((e) => e.tipo === 'item' && e.id === 'al-fondo')).toMatchObject({ deshabilitado: true, pista: 'Ya está detrás de las demás figuras.' })
  })

  it('el clic derecho de una figura trae su formato: tinta con su muestra, grosor, trazo, opacidad, relleno y punta', () => {
    const doc = { ...documentoVacio(), figuras: { f1: { id: 'f1', tipo: 'rectangulo' as const, x1: 0, y1: 0, x2: 8, y2: 6, orden: 0, tinta: 'rojo' as const, grosor: 0.5 as const } } }
    const figura = vistaFigura(doc, seleccionDe('figuras', 'f1'))
    const m = menuDeObjetivo({ tipo: 'figura', id: 'f1', en: { x: 4, y: 0 } }, { doc, lib: new Map(), puedePegar: false, teclas: () => undefined, seleccionados: 1, figura })
    const f = items(m.entradas).find((e) => e.id === 'formato')!
    expect(f).toMatchObject({ texto: 'Formato', icono: 'formato', flecha: true })
    const sub = items(f.submenu)
    expect(sub.filter((e) => e.id.startsWith('figura-estilo:tinta:')).map((e) => [e.texto, e.muestra, e.marcado])).toEqual([
      ['Negro', 'tinta-tinta', false], ['Gris', 'tinta-gris', false], ['Rojo', 'tinta-rojo', true], ['Azul', 'tinta-azul', false], ['Verde', 'tinta-verde', false]
    ])
    expect(sub.filter((e) => e.marcado === true).map((e) => e.texto)).toEqual(['Rojo', 'Grosor 0.5 mm', 'Trazo continuo', 'Opacidad 100 %'])
    expect(sub.find((e) => e.id.startsWith('figura-estilo:relleno'))).toMatchObject({ texto: 'Relleno suave', rol: 'casilla', marcado: false, id: 'figura-estilo:relleno:si' })
    // Un rectángulo no tiene punta; una flecha sí y no tiene relleno.
    expect(sub.some((e) => e.id.startsWith('figura-estilo:punta'))).toBe(false)
    const flecha = { ...documentoVacio(), figuras: { f2: { id: 'f2', tipo: 'flecha' as const, x1: 0, y1: 0, x2: 8, y2: 0, orden: 0 } } }
    const mf = menuDeObjetivo({ tipo: 'figura', id: 'f2', en: { x: 4, y: 0 } }, { doc: flecha, lib: new Map(), puedePegar: false, teclas: () => undefined, seleccionados: 1, figura: vistaFigura(flecha, seleccionDe('figuras', 'f2')) })
    const subf = items(items(mf.entradas).find((e) => e.id === 'formato')!.submenu)
    expect(subf.filter((e) => e.id.startsWith('figura-estilo:punta')).map((e) => e.texto)).toEqual(['Punta llena', 'Punta abierta', 'Dos puntas'])
    expect(subf.some((e) => e.id.startsWith('figura-estilo:relleno'))).toBe(false)
    expect(items(mf.entradas).map((e) => e.id)).toEqual(['panel-inspector', 'cortar', 'copiar', 'pegar-aqui', 'duplicar', 'formato', 'al-fondo', 'borrar'])
  })

  it('cada ítem del formato de figura es un cambio de estilo, y nada más lo es', () => {
    expect(estiloDeAccion('figura-estilo:tinta:azul')).toEqual({ tinta: 'azul' })
    expect(estiloDeAccion('figura-estilo:grosor:0.35')).toEqual({ grosor: 0.35 })
    expect(estiloDeAccion('figura-estilo:trazo:puntos')).toEqual({ trazo: 'puntos' })
    expect(estiloDeAccion('figura-estilo:opacidad:25')).toEqual({ opacidad: 25 })
    expect(estiloDeAccion('figura-estilo:relleno:si')).toEqual({ relleno: true })
    expect(estiloDeAccion('figura-estilo:relleno:no')).toEqual({ relleno: false })
    expect(estiloDeAccion('figura-estilo:punta:dos')).toEqual({ punta: 'dos' })
    for (const malo of ['figura-estilo:tinta:morado', 'figura-estilo:grosor:3', 'figura-estilo:opacidad:60', 'al-fondo', 'formato:tinta:rojo']) expect(estiloDeAccion(malo as never), malo).toBeNull()
  })

  it('las tintas del submenú Formato de notas y etiquetas llevan su muestra de color', () => {
    const d = ejemplo()
    const v = vistaFormato(d, seleccionDe('etiquetas', 'e'))!
    expect(items(entradasFormato(v, () => undefined)).filter((e) => e.id.startsWith('formato:tinta:')).map((e) => e.muestra)).toEqual(['tinta-tinta', 'tinta-gris', 'tinta-rojo', 'tinta-azul', 'tinta-verde'])
    // Los contornos de una tinta también; el predeterminado y «Sin contorno», no.
    expect(items(entradasFormato(v, () => undefined)).filter((e) => e.id.startsWith('formato:contorno:')).map((e) => e.muestra ?? null)).toEqual([null, 'tinta-tinta', 'tinta-gris', 'tinta-rojo', 'tinta-azul', 'tinta-verde', null])
  })

  it('pieza: su referencia, nombre y valor arriba, y las acciones con sus atajos del registro', () => {
    const m = menuDeObjetivo({ tipo: 'pieza', id: 'r', en }, ctx())
    expect(m.titulo).toBe('R1 · Resistencia 330 Ω')
    expect(filas(m)).toEqual([
      'Editar [doble clic]', 'Inspector', '—',
      'Cortar [Ctrl+X]', 'Copiar [Ctrl+C]', 'Pegar [Ctrl+V]', 'Duplicar [Ctrl+D]', '—',
      'Girar 90° a la derecha [R]', 'Girar 90° a la izquierda [Shift+R]', 'Reflejar horizontal [X]', 'Reflejar vertical [Y]', '—',
      'Eliminar [Supr]'
    ])
    expect(items(m.entradas)[0]).toMatchObject({ id: 'editar-valor' })
    expect(m.entradas.at(-1)).toMatchObject({ peligro: true })
  })

  it('el menú ofrece Editar (el doble clic), nunca restablecer textos ni Seleccionar su red, y toda entrada tiene icono', () => {
    const d = ejemplo()
    d.piezas.g = { id: 'g', tipo: 'tierra', ref: 'GND1', x: 100, y: 0, rot: 0, espejo: false, props: {} }
    for (const id of ['r', 'd', 'g']) {
      const m = menuDeObjetivo({ tipo: 'pieza', id, en }, ctx({ doc: d }))
      expect(items(m.entradas).map((e) => e.id)).toContain('editar-valor')
      expect(items(m.entradas).map((e) => e.id)).not.toContain('seleccionar-red' as never)
      expect(items(m.entradas).map((e) => e.id)).not.toContain('restablecer-textos' as never)
      expect(items(m.entradas).filter((e) => !e.icono).map((e) => e.id)).toEqual([])
    }
    expect(menuDeObjetivo({ tipo: 'pieza', id: 'd', en }, ctx({ seleccionados: 3 })).titulo).toBe('3 elementos seleccionados')
  })

  it('con varios elementos, cable, nota y figura también ofrecen girar y reflejar; con uno solo no', () => {
    const idsDe = (m: ModeloMenu) => items(m.entradas).map((e) => e.id)
    // La etiqueta de red gira y se refleja sola, sobre su punta.
    expect(idsDe(menuDeObjetivo({ tipo: 'etiqueta', id: 'e', en }, ctx()))).toEqual(expect.arrayContaining(['girar', 'girar-izq', 'espejo-x', 'espejo-y']))
    for (const tipo of ['cable', 'etiqueta'] as const) {
      if (tipo === 'cable') expect(idsDe(menuDeObjetivo({ tipo, id: 'w', en }, ctx()))).not.toContain('girar')
      expect(idsDe(menuDeObjetivo({ tipo, id: 'w', en }, ctx({ seleccionados: 4 })))).toEqual(expect.arrayContaining(['pegar-aqui', 'girar', 'girar-izq', 'espejo-x', 'espejo-y']))
    }
  })

  it('cable, etiqueta y nota', () => {
    const c = menuDeObjetivo({ tipo: 'cable', id: 'w', en }, ctx({ red: 'VSAL' }))
    expect(c.titulo).toBe('Cable · VSAL')
    expect(filas(c)).toEqual([
      'Derivar desde aquí [Alt+clic]', 'Inspector', '—',
      'Cortar [Ctrl+X]', 'Copiar [Ctrl+C]', 'Pegar [Ctrl+V]', 'Duplicar [Ctrl+D]', '—',
      'Medir', '—',
      'Eliminar [Supr]'
    ])
    const medir = items(c.entradas).find((x) => x.id === 'medir')!
    expect(medir).toMatchObject({ flecha: true })
    expect(items(medir.submenu).map((x) => [x.id, x.texto])).toEqual([['medir-sonda', 'Sonda'], ['medir-mm', 'Multímetro'], ['medir-osc', 'Osciloscopio']])
    const sub1 = (id: string) => items(items(medir.submenu).find((x) => x.id === id)!.submenu)
    expect(sub1('medir-sonda').map((x) => [x.id, x.texto])).toEqual([['medir-sonda:voltaje', 'Voltaje'], ['medir-sonda:corriente', 'Corriente']])
    // Sin osciloscopio en el circuito, las cuatro entradas de uno nuevo.
    expect(sub1('medir-osc').map((x) => [x.id, x.texto])).toEqual([['medir-osc:nuevo:A', 'Entrada A'], ['medir-osc:nuevo:B', 'Entrada B'], ['medir-osc:nuevo:C', 'Entrada C'], ['medir-osc:nuevo:D', 'Entrada D']])
    expect(sub1('medir-mm').map((x) => [x.id, x.texto])).toEqual([['medir-mm:rapido', 'Medidor rápido'], ['medir-mm:nuevo', 'Multímetro completo']])
    const e = menuDeObjetivo({ tipo: 'etiqueta', id: 'e', en }, ctx())
    expect(e.titulo).toBe('Etiqueta de red VSAL')
    expect(filas(e)).toEqual([
      'Editar [doble clic]', 'Inspector', '—', 'Cortar [Ctrl+X]', 'Copiar [Ctrl+C]', 'Pegar [Ctrl+V]', 'Duplicar [Ctrl+D]', '—',
      'Girar 90° a la derecha [R]', 'Girar 90° a la izquierda [Shift+R]', 'Reflejar horizontal [X]', 'Reflejar vertical [Y]', '—',
      'Medir', '—', 'Eliminar [Supr]'
    ])
    expect(menuDeObjetivo({ tipo: 'nota', id: 'n', en }, ctx()).titulo).toBe('Nota de texto')
  })

  it('con instrumentos en el circuito, el submenú dice qué mide cada entrada', () => {
    const d = ejemplo()
    const pz = (id: string, tipo: string, ref: string, x: number) => ({ id, tipo, ref, x, y: 0, rot: 0 as const, espejo: false, props: {} })
    d.piezas.o = pz('o', 'osciloscopio', 'XSC1', 200)
    d.piezas.m = pz('m', 'multimetro', 'XMM1', 260)
    const con = calcularConexiones(d, lib)
    const c = menuDeObjetivo({ tipo: 'cable', id: 'w', en }, ctx({ doc: d, con }))
    const medirSub = (c2: typeof c) => items(items(c2.entradas).find((x) => x.id === 'medir')!.submenu)
    const sub = (id: string) => items(medirSub(c).find((x) => x.id === id)!.submenu).map((x) => [x.id, x.texto, x.detalle])
    expect(sub('medir-osc')).toEqual([['medir-osc:o:A', 'Entrada A', 'libre'], ['medir-osc:o:B', 'Entrada B', 'libre'], ['medir-osc:o:C', 'Entrada C', 'libre'], ['medir-osc:o:D', 'Entrada D', 'libre']])
    expect(sub('medir-mm')).toEqual([['medir-mm:rapido', 'Medidor rápido', undefined], ['medir-mm:nuevo', 'Multímetro completo', undefined], ['medir-mm:m:+', 'XMM1 · +', 'libre'], ['medir-mm:m:COM', 'XMM1 · COM', 'libre']])
    // Con dos osciloscopios, un nivel más: cada uno con sus cuatro entradas.
    d.piezas.o2 = pz('o2', 'osciloscopio', 'XSC2', 320)
    const dos = menuDeObjetivo({ tipo: 'cable', id: 'w', en }, ctx({ doc: d, con: calcularConexiones(d, lib) }))
    const grupos = items(items(items(dos.entradas).find((x) => x.id === 'medir')!.submenu).find((x) => x.id === 'medir-osc')!.submenu)
    expect(grupos.map((x) => x.texto)).toEqual(['XSC1', 'XSC2'])
    expect(items(grupos[0].submenu).map((x) => x.id)).toEqual(['medir-osc:o:A', 'medir-osc:o:B', 'medir-osc:o:C', 'medir-osc:o:D'])
  })

  it('el menú de una sonda: invertir el sentido (corriente), Mediciones y eliminarla', () => {
    const d = { ...ejemplo(), sondas: { i: { id: 'i', tipo: 'corriente' as const, x: 0, y: 0, sentido: 'derecha' as const }, v: { id: 'v', tipo: 'voltaje' as const, x: 0, y: 0 } } }
    const i = menuDeObjetivo({ tipo: 'sonda', id: 'i', en }, ctx({ doc: d }))
    expect(i.titulo).toBe('Sonda de corriente hacia la derecha')
    expect(filas(i)).toEqual(['Invertir el sentido', 'Mediciones', '—', 'Eliminar [Supr]'])
    expect(filas(menuDeObjetivo({ tipo: 'sonda', id: 'v', en }, ctx({ doc: d })))).toEqual(['Mediciones', '—', 'Eliminar [Supr]'])
    expect(pedidoDeAccion('medir-osc:o:B')).toEqual({ con: 'osciloscopio', osc: 'o', canal: 'B' })
    expect(pedidoDeAccion('medir-osc:nuevo:C')).toEqual({ con: 'osciloscopio', canal: 'C' })
    expect(pedidoDeAccion('medir-mm:m:COM')).toEqual({ con: 'multimetro', mm: 'm', terminal: 'COM' })
    expect(pedidoDeAccion('medir-mm:nuevo')).toEqual({ con: 'multimetro-nuevo' })
    expect(pedidoDeAccion('medir-mm:rapido')).toEqual({ con: 'medidor' })
    expect(pedidoDeAccion('medir-sonda:voltaje')).toEqual({ con: 'voltaje' })
    expect(pedidoDeAccion('medir-sonda:corriente')).toEqual({ con: 'corriente' })
    expect(pedidoDeAccion('borrar')).toBeNull()
  })

  it('vacío: colocar, pegar (deshabilitado sin portapapeles), L, G, T, Figura ▸ y encuadrar', () => {
    const m = menuDeObjetivo({ tipo: 'vacio', en }, ctx())
    expect(filas(m)).toEqual([
      'Colocar pieza aquí… [doble clic]', 'Pegar aquí [Ctrl+V]', '—', 'Etiqueta de red [L]', 'Tierra [G]', 'Nota de texto [T]', 'Figura', '—', 'Agrupar en encapsulados', 'Encuadrar todo [F]'
    ])
    // Las figuras también desde el lienzo en blanco, las mismas órdenes que el botón Figura.
    const figura = items(m.entradas).find((e) => e.id === 'figura')!
    expect(figura).toMatchObject({ flecha: true, icono: 'figura' })
    expect(items(figura.submenu).map((e) => [e.id, e.texto, e.icono])).toEqual(items(menuFigura().entradas).map((e) => [e.id, e.texto, e.icono]))
    const sinPegar = menuDeObjetivo({ tipo: 'vacio', en }, ctx({ puedePegar: false }))
    expect(sinPegar.entradas[1]).toMatchObject({ deshabilitado: true, pista: 'Primero copia algo con Ctrl+C.' })
  })

  it('varios elementos: portapapeles, los cuatro giros, Guardar como plantilla y Exportar la selección, y Eliminar; sin Editar ni Inspector', () => {
    for (const tipo of ['pieza', 'cable', 'etiqueta'] as const) {
      const m = menuDeObjetivo({ tipo, id: 'r', en }, ctx({ seleccionados: 3 }))
      expect(filas(m), tipo).toEqual([
        'Cortar [Ctrl+X]', 'Copiar [Ctrl+C]', 'Pegar [Ctrl+V]', 'Duplicar [Ctrl+D]', '—',
        'Girar 90° a la derecha [R]', 'Girar 90° a la izquierda [Shift+R]', 'Reflejar horizontal [X]', 'Reflejar vertical [Y]', '—',
        'Guardar como plantilla…', 'Exportar la selección…', '—', 'Eliminar [Supr]'
      ])
    }
  })

  it('con un solo elemento no hay Guardar como plantilla ni Exportar la selección en el menú (siguen en la cinta)', () => {
    for (const o of [{ tipo: 'pieza', id: 'r', en }, { tipo: 'cable', id: 'w', en }, { tipo: 'etiqueta', id: 'e', en }] as const) {
      const ids = items(menuDeObjetivo(o, ctx()).entradas).map((e) => e.id)
      expect(ids).not.toContain('guardar-plantilla')
      expect(ids).not.toContain('exportar-seleccion')
      expect(ids).not.toContain('seleccionar-red' as never)
    }
  })

  it('«Exportar la selección…» aparece con varios elementos seleccionados y no en el lienzo vacío ni sin selección', () => {
    const idsDe = (m: ModeloMenu) => items(m.entradas).map((e) => e.id)
    for (const o of [{ tipo: 'pieza', id: 'r', en }, { tipo: 'cable', id: 'w', en }, { tipo: 'etiqueta', id: 'e', en }] as const) expect(idsDe(menuDeObjetivo(o, ctx({ seleccionados: 2 })))).toContain('exportar-seleccion')
    expect(items(menuDeObjetivo({ tipo: 'pieza', id: 'r', en }, ctx({ seleccionados: 2 })).entradas).find((e) => e.id === 'exportar-seleccion')).toMatchObject({ texto: 'Exportar la selección…' })
    expect(idsDe(menuDeObjetivo({ tipo: 'pieza', id: 'r', en }, ctx({ seleccionados: 0 })))).not.toContain('exportar-seleccion')
    expect(idsDe(menuDeObjetivo({ tipo: 'vacio', en }, ctx()))).not.toContain('exportar-seleccion')
  })

  it('todas las entradas de los menús de objetivo llevan icono R1', () => {
    const icono = (m: ModeloMenu) => Object.fromEntries(items(m.entradas).map((e) => [e.id, e.icono ?? null]))
    expect(icono(menuDeObjetivo({ tipo: 'pieza', id: 'r', en }, ctx()))).toEqual({
      cortar: 'cortar', copiar: 'copiar', 'pegar-aqui': 'pegar', duplicar: 'duplicar', girar: 'girar', 'girar-izq': 'girarIzq', 'espejo-x': 'espejoX', 'espejo-y': 'espejoY',
      'editar-valor': 'etiqueta', 'panel-inspector': 'inspector', borrar: 'borrar'
    })
    expect(icono(menuDeObjetivo({ tipo: 'vacio', en }, ctx()))).toEqual({
      'colocar-aqui': 'pieza', 'pegar-aqui': 'pegar', etiqueta: 'etiqueta', tierra: 'tierra', nota: 'nota', figura: 'figura', 'agrupar-encapsulados': 'pieza', encuadrar: 'encuadrar'
    })
    const sinIcono = (m: ModeloMenu) => items(m.entradas).filter((e) => !e.icono).map((e) => e.id)
    expect(sinIcono(menuDeObjetivo({ tipo: 'cable', id: 'w', en }, ctx()))).toEqual([])
    const s = seleccionVacia()
    s.etiquetas.add('e')
    const nota = menuDeObjetivo({ tipo: 'etiqueta', id: 'e', en }, ctx({ formato: vistaFormato(ejemplo(), s) }))
    expect(sinIcono(nota)).toEqual([])
  })

  it('los atajos salen del registro: si cambian, el menú los muestra', () => {
    const m = menuDeObjetivo({ tipo: 'pieza', id: 'r', en }, ctx({ teclas: (id) => (id === 'girar' ? 'Ctrl+R' : TECLAS[id]) }))
    expect(filas(m)[8]).toBe('Girar 90° a la derecha [Ctrl+R]')
  })
})

describe('submenú Formato', () => {
  const TEXTO: Record<string, string> = { negrita: 'Ctrl+B', cursiva: 'Ctrl+I', subrayado: 'Ctrl+U', 'tam-mayor': 'Ctrl+Shift+.', 'tam-menor': 'Ctrl+Shift+,', 'alinear-centro': 'Ctrl+Shift+E' }
  const lista = (es: EntradaMenu[]) => es.map((e) => (e.tipo === 'separador' ? '—' : `${e.marcado === true ? '✓ ' : e.marcado === 'mixto' ? '– ' : ''}${e.texto}${e.atajo ? ` [${e.atajo}]` : ''}`))
  const conNota = () => {
    const d = ejemplo()
    d.notas.n = { id: 'n', x: 0, y: 20, ancho: 20, texto: 'hola', formato: { negrita: true, alinear: 'centro' } }
    const s = seleccionVacia()
    s.notas.add('n')
    return { d, v: vistaFormato(d, s)! }
  }

  it('la nota y la etiqueta agregan «Formato ▸» con su submenú; sin formato en el contexto no aparece', () => {
    const { d, v } = conNota()
    const m = menuDeObjetivo({ tipo: 'nota', id: 'n', en }, ctx({ doc: d, formato: v }))
    expect(filas(m)).toEqual(['Editar [doble clic]', 'Inspector', '—', 'Cortar [Ctrl+X]', 'Copiar [Ctrl+C]', 'Pegar [Ctrl+V]', 'Duplicar [Ctrl+D]', '—', 'Formato', '—', 'Eliminar [Supr]'])
    expect(m.entradas[8]).toMatchObject({ flecha: true, submenu: expect.any(Array) })
    expect(filas(menuDeObjetivo({ tipo: 'nota', id: 'n', en }, ctx({ doc: d })))).not.toContain('Formato')
  })

  it('los mismos controles que la barra: casillas, fuentes, pasos de tamaño, alineación y tintas, con el estado marcado', () => {
    const { v } = conNota()
    expect(lista(entradasFormato(v, (id) => TEXTO[id]))).toEqual([
      '✓ Negrita [Ctrl+B]', 'Cursiva [Ctrl+I]', 'Subrayado [Ctrl+U]', '—',
      '✓ Mona Sans', 'Source Serif', 'Geist Mono', '—',
      'Letra más grande (2.5 mm) [Ctrl+Shift+.]', 'Letra más chica (1.8 mm) [Ctrl+Shift+,]', '—',
      'Izquierda', '✓ Centro [Ctrl+Shift+E]', 'Derecha', 'Justificado', '—',
      '✓ Negro', 'Gris', 'Rojo', 'Azul', 'Verde', '—',
      '✓ Contorno predeterminado (gris)', 'Contorno negro', 'Contorno gris', 'Contorno rojo', 'Contorno azul', 'Contorno verde', 'Sin contorno'
    ])
    // Una etiqueta sola no se alinea.
    const s = seleccionVacia()
    s.etiquetas.add('e')
    expect(lista(entradasFormato(vistaFormato(ejemplo(), s)!, () => undefined))).not.toContain('Centro')
  })

  it('el contorno por omisión se rotula según lo seleccionado', () => {
    const s = seleccionVacia()
    s.etiquetas.add('e')
    expect(lista(entradasFormato(vistaFormato(ejemplo(), s)!, () => undefined))).toContain('✓ Contorno predeterminado (color del cable)')
    s.notas.add('n')
    expect(lista(entradasFormato(vistaFormato(conNota().d, s)!, () => undefined))).toContain('✓ Contorno predeterminado')
  })

  it('cada ítem del submenú da su orden; lo demás no es formato', () => {
    expect(ordenDeAccion('formato:negrita')).toEqual({ tipo: 'alternar', prop: 'negrita' })
    expect(ordenDeAccion('formato:tam-menor')).toEqual({ tipo: 'paso', dir: -1 })
    expect(ordenDeAccion('formato:fuente:serif')).toEqual({ tipo: 'parche', parche: { fuente: 'serif' } })
    expect(ordenDeAccion('formato:alinear:just')).toEqual({ tipo: 'parche', parche: { alinear: 'just' } })
    expect(ordenDeAccion('formato:tinta:verde')).toEqual({ tipo: 'parche', parche: { tinta: 'verde' } })
    expect(ordenDeAccion('formato:contorno:ninguno')).toEqual({ tipo: 'parche', parche: { contorno: 'ninguno' } })
    expect(ordenDeAccion('formato:contorno:rojo')).toEqual({ tipo: 'parche', parche: { contorno: 'rojo' } })
    expect(ordenDeAccion('formato:contorno:morado')).toBeNull()
    expect(ordenDeAccion('formato:tinta:morado')).toBeNull()
    expect(ordenDeAccion('formato')).toBeNull()
    expect(ordenDeAccion('girar')).toBeNull()
  })
})

describe('menú Archivo', () => {
  it('trae todo lo de la especificación con los atajos del registro; sin recientes, Recientes no se abre', () => {
    const m = menuArchivo(archivo())
    expect(m.mostrarTitulo).toBe(false)
    expect(filas(m)).toEqual([
      'Nuevo [Ctrl+N]', 'Abrir… [Ctrl+O]', 'Recientes (no)', '—', 'Guardar [Ctrl+S]', 'Guardar como… [Ctrl+Shift+S]', '—',
      'Exportar imagen [PNG · SVG · PDF]', '—', 'Configuración [Ctrl+,]'
    ])
    expect(items(m.entradas).find((e) => e.id === 'recientes')).toMatchObject({ pista: PISTA_SIN_RECIENTES })
  })

  it('Recientes: un ítem por archivo con su número y Borrar la lista al final', () => {
    const m = menuArchivo(archivo({ recientes: ['C:\\a\\practica.kir', 'C:\\b\\otra.kir'] }))
    const r = items(m.entradas).find((e) => e.id === 'recientes')!
    expect(r.deshabilitado).toBeFalsy()
    expect(r.submenu?.map((e) => (e.tipo === 'item' ? `${e.id} ${e.texto}` : '—'))).toEqual(['reciente:0 practica.kir', 'reciente:1 otra.kir', '—', 'olvidar-recientes Borrar la lista'])
  })

  it('dos recientes con el mismo nombre se distinguen por su carpeta', () => {
    expect(nombresDeRecientes(['C:\\Escritorio\\p.kir', '/home/ana/Practicas/P.kir', '/x/otra.kir'])).toEqual(['p.kir (Escritorio)', 'P.kir (Practicas)', 'otra.kir'])
  })

  it('en solo lectura no se guarda; con el circuito vacío no se exporta', () => {
    const m = menuArchivo(archivo({ soloLectura: true, vacio: true }))
    const es = items(m.entradas)
    expect(es.find((e) => e.id === 'guardar')).toMatchObject({ deshabilitado: true, pista: PISTA_SOLO_LECTURA })
    expect(es.find((e) => e.id === 'guardar-como')).toMatchObject({ deshabilitado: true, pista: PISTA_SOLO_LECTURA })
    expect(es.find((e) => e.id === 'exportar')).toMatchObject({ deshabilitado: true, pista: PISTA_VACIO })
  })

  it('Exportar imagen abre PNG, SVG y PDF', () => {
    const e = items(menuArchivo(archivo()).entradas).find((x) => x.id === 'exportar')!
    expect(items(e.submenu).map((x) => `${x.id} ${x.texto}`)).toEqual(['exportar:png PNG…', 'exportar:svg SVG…', 'exportar:pdf PDF…'])
  })
})

describe('ariaAtajoDeItem', () => {
  it('un atajo se dibuja tecla por tecla; un gesto o un texto, en palabras', () => {
    expect(teclasDeAtajo('Ctrl+Shift+S')).toEqual(['Ctrl', 'Shift', 'S'])
    expect(teclasDeAtajo('Ctrl++')).toEqual(['Ctrl', '+'])
    expect(teclasDeAtajo('Supr')).toEqual(['Supr'])
    for (const g of ['doble clic', 'Alt+clic', 'PNG · SVG · PDF']) expect(teclasDeAtajo(g)).toBeNull()
  })

  it('un ítem deshabilitado no anuncia su atajo aunque lo muestre', () => {
    const es = items(menuArchivo(archivo({ soloLectura: true })).entradas)
    const guardar = es.find((e) => e.id === 'guardar')!
    expect(guardar.atajo).toBe('Ctrl+S')
    expect(ariaAtajoDeItem(guardar)).toBeUndefined()
    expect(ariaAtajoDeItem(es.find((e) => e.id === 'nuevo')!)).toBe('Control+N')
    expect(ariaAtajoDeItem(es.find((e) => e.id === 'configuracion')!)).toBe('Control+,')
  })
})

describe('atajoAria', () => {
  it.each([
    ['Ctrl+C', 'Control+C'],
    ['Supr', 'Delete'],
    ['Ctrl+Shift+S', 'Control+Shift+S'],
    ['R', 'R'],
    ['Ctrl+,', 'Control+,'],
    ['Arriba', 'ArrowUp'],
    ['Shift+Abajo', 'Shift+ArrowDown'],
    ['Izquierda', 'ArrowLeft'],
    ['Derecha', 'ArrowRight'],
    ['doble clic', undefined],
    ['Alt+clic', undefined],
    ['PNG · SVG · PDF', undefined],
    [undefined, undefined]
  ])('%s → %s', (a, b) => {
    expect(atajoAria(a)).toBe(b)
  })
})

describe('menús de los botones de la cinta', () => {
  it('Recientes y Exportar son los submenús de Archivo, con su título', () => {
    const rutas = ['C:\\a\\practica.kir', 'C:\\b\\practica.kir', 'C:\\c\\otro.kir']
    const r = menuRecientes(rutas)
    expect(r.titulo).toBe('Recientes')
    expect(filas(r)).toEqual(['practica.kir (a)', 'practica.kir (b)', 'otro.kir', '—', 'Borrar la lista'])
    const archivo = items(menuArchivo({ teclas: () => undefined, recientes: rutas, soloLectura: false, vacio: false }).entradas)
    expect(archivo.find((e) => e.id === 'recientes')!.submenu).toEqual(r.entradas)
    expect(menuExportar().titulo).toBe('Exportar imagen')
    expect(filas(menuExportar())).toEqual(['PNG…', 'SVG…', 'PDF…'])
    expect(archivo.find((e) => e.id === 'exportar')!.submenu).toEqual(menuExportar().entradas)
  })

  it('los nombres que el clic derecho comparte con la cinta salen de la misma tabla', () => {
    const pieza = items(menuDeObjetivo({ tipo: 'pieza', id: 'r', en }, ctx()).entradas)
    expect(pieza.find((e) => e.id === 'girar')!.texto).toBe(textoMenu('girar'))
    expect(pieza.find((e) => e.id === 'espejo-y')!.texto).toBe(textoMenu('espejo-y'))
    const vacio = items(menuDeObjetivo({ tipo: 'vacio', en }, ctx()).entradas)
    expect(vacio.find((e) => e.id === 'nota')!.texto).toBe(textoMenu('nota'))
    expect(vacio.find((e) => e.id === 'pegar-aqui')!.texto).toBe(textoMenu('pegar'))
  })
})

describe('menú del botón Figura', () => {
  it('las cuatro figuras con su icono R1 y su nombre, sin título visible', () => {
    const m = menuFigura()
    expect(m.mostrarTitulo).toBe(false)
    expect(m.titulo).toBe('Figura')
    expect(m.entradas.map((e) => (e.tipo === 'item' ? [e.id, e.texto, e.icono] : null))).toEqual([
      ['figura-linea', 'Línea', 'linea'], ['figura-rectangulo', 'Rectángulo', 'rectangulo'], ['figura-elipse', 'Elipse', 'elipse'], ['figura-flecha', 'Flecha', 'flecha']
    ])
  })
})

describe('menú de una plantilla', () => {
  const ids = (m: ModeloMenu) => items(m.entradas).map((e) => e.id)
  it('una incluida solo se coloca o se copia a las propias', () => {
    const m = menuDePlantilla('Divisor de voltaje', true)
    expect(m.titulo).toBe('Plantilla · Divisor de voltaje')
    expect(ids(m)).toEqual(['plantilla:colocar', 'plantilla:copiar'])
  })

  it('una propia se coloca, renombra, cambia de descripción y de categoría, muestra y borra (lo único peligroso es borrar)', () => {
    const m = menuDePlantilla('Mi filtro', false)
    expect(ids(m)).toEqual(['plantilla:colocar', 'plantilla:renombrar', 'plantilla:descripcion', 'plantilla:mover', 'plantilla:mostrar', 'plantilla:borrar'])
    expect(items(m.entradas).filter((e) => e.peligro).map((e) => e.id)).toEqual(['plantilla:borrar'])
  })

  it('todas las entradas llevan icono, como los demás menús del clic derecho', () => {
    for (const m of [menuDePlantilla('X', true), menuDePlantilla('X', false), menuDeCategoria('Filtros', 3)]) {
      for (const e of items(m.entradas)) expect(e.icono, `${m.titulo}: ${e.texto}`).toBeDefined()
    }
    const textos = items(menuDePlantilla('X', false).entradas).map((e) => e.texto)
    expect(textos).toContain('Cambiar descripción…')
  })

  it('una categoría propia se muestra en su carpeta o se borra (con puntos suspensivos y en color de peligro)', () => {
    const m = menuDeCategoria('Filtros', 3)
    expect(m.titulo).toBe('Categoría · Filtros')
    expect(ids(m)).toEqual(['categoria:mostrar', 'categoria:borrar'])
    const borrar = items(m.entradas).find((e) => e.id === 'categoria:borrar')!
    expect(borrar).toMatchObject({ texto: 'Borrar categoría…', peligro: true })
  })
})
