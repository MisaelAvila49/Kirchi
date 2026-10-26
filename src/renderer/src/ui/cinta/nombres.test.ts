// @vitest-environment happy-dom
// (menus.ts necesita la librería de prueba, que lee los símbolos con DOMParser.)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TEXTO_SELECCIONAR_RED } from '../vistaInspector'
import { documentoVacio } from '../../doc/tipos'
import { registrarAtajosDelEditor } from '../../editor/atajosEditor'
import type { Editor } from '../../editor/Editor'
import { seleccionVacia } from '../../editor/seleccion'
import { Atajos } from '../../editor/teclado'
import { libreriaDePrueba } from '../../prueba/libreria'
import { registrarAtajosDeArchivo } from '../atajosArchivo'
import { registrarAtajosDeSimulacion } from '../atajosSimulacion'
import { registrarAtajosDeLaVentana } from '../atajosVentana'
import { menuArchivo, menuDeObjetivo, razonSinPegar, type EntradaMenu, type ItemMenu } from '../menus'
import { vistaFormato } from '../vistaFormato'
import { COMANDOS, nombreLargo, textoMenu, type IdComando } from './comandos'

const ids = Object.keys(COMANDOS) as IdComando[]
const nada = () => {}

function registroCompleto(): Atajos {
  const a = new Atajos()
  registrarAtajosDelEditor(a, {} as Editor, { encuadrar: nada })
  registrarAtajosDeLaVentana(a, { hojaDeAtajos: nada, lienzoLimpio: nada, configuracion: nada, menuContextual: nada, enfocarFormato: nada, plegarCinta: nada, buscarComando: nada, enfocarTutorial: nada, grabar: nada, detenerGrabacion: nada })
  registrarAtajosDeSimulacion(a, { simularOPausar: nada, detener: nada, alternarVoltajes: nada, potenciometro: { paso: nada, hay: () => false }, tiempo: { ejecutar: nada } })
  registrarAtajosDeArchivo(a, { nuevo: nada, abrir: nada, guardar: nada, guardarComo: nada })
  return a
}

/** Los únicos rótulos del clic derecho que no son ni el nombre corto ni el largo: dicen dónde actúan. */
const CONTEXTUALES: Partial<Record<IdComando, readonly string[]>> = { pegar: ['Pegar aquí'], borrar: ['Eliminar'] }
/** Ítems del menú cuyo id no es el del comando de la cinta que hacen. */
const ID_DE_MENU: Record<string, IdComando> = { 'pegar-aqui': 'pegar' }

const items = (es: EntradaMenu[] | undefined): ItemMenu[] => (es ?? []).flatMap((e): ItemMenu[] => (e.tipo === 'item' ? [e, ...items(e.submenu)] : []))

function todosLosMenus(): ItemMenu[] {
  const lib = libreriaDePrueba().piezas
  const doc = documentoVacio()
  doc.piezas.r = { id: 'r', tipo: 'resistencia', ref: 'R1', x: 0, y: 0, rot: 0, espejo: false, props: { valor: '1k' } }
  doc.notas.n = { id: 'n', x: 0, y: 0, ancho: 20, texto: 'hola' }
  doc.etiquetas.e = { id: 'e', x: 0, y: 0, nombre: 'VCC', rot: 0 }
  const ctx = { doc, lib, puedePegar: true, teclas: () => undefined, seleccionados: 1, formato: vistaFormato(doc, seleccionVacia()) }
  const en = { x: 0, y: 0 }
  return [
    ...items(menuDeObjetivo({ tipo: 'pieza', id: 'r', en }, ctx).entradas),
    ...items(menuDeObjetivo({ tipo: 'cable', id: 'c', en }, ctx).entradas),
    ...items(menuDeObjetivo({ tipo: 'nota', id: 'n', en }, ctx).entradas),
    ...items(menuDeObjetivo({ tipo: 'etiqueta', id: 'e', en }, ctx).entradas),
    ...items(menuDeObjetivo({ tipo: 'vacio', en }, ctx).entradas),
    ...items(menuArchivo({ teclas: () => undefined, recientes: [], soloLectura: false, vacio: false }).entradas)
  ]
}

describe('una sola fuente de nombres', () => {
  it('el registro de atajos (y con él la hoja y Configuración) toma el nombre largo de la tabla de comandos', () => {
    const a = registroCompleto()
    for (const id of ids) {
      const t = COMANDOS[id].tecla
      if (t) expect(a.nombreDe(t), id).toBe(nombreLargo(id))
    }
  })

  it('reflejar y encuadrar se llaman igual en el registro, la cinta y el menú', () => {
    expect(nombreLargo('espejo-x')).toBe('Reflejar horizontal')
    expect(nombreLargo('espejo-y')).toBe('Reflejar vertical')
    expect(nombreLargo('encuadrar')).toBe(textoMenu('encuadrar'))
  })

  it('cada ítem del clic derecho que es un comando de la cinta dice su nombre corto, su nombre largo o un rótulo de lugar de la lista', () => {
    const vistos = new Set<IdComando>()
    for (const it of todosLosMenus()) {
      const id = (ID_DE_MENU[it.id] ?? it.id) as IdComando
      if (!Object.hasOwn(COMANDOS, id)) continue
      vistos.add(id)
      expect([COMANDOS[id].texto, nombreLargo(id), ...(CONTEXTUALES[id] ?? [])], `${it.id}: «${it.texto}»`).toContain(it.texto)
    }
    expect(vistos.size).toBeGreaterThan(15)
  })

  it('el rótulo de cada comando en el menú también es su nombre corto, el largo o uno de la lista', () => {
    for (const id of ids) expect([COMANDOS[id].texto, nombreLargo(id), ...(CONTEXTUALES[id] ?? [])], id).toContain(textoMenu(id))
  })

  it('los botones de girar y reflejar del inspector toman su nombre de la tabla', () => {
    const insp = readFileSync(join(import.meta.dirname, '../Inspector.tsx'), 'utf8')
    for (const id of ['girar', 'girar-izq', 'espejo-x', 'espejo-y']) expect(insp, id).toContain(`conAtajo('${id}', nombreLargo('${id}'))`)
  })

  it('«Seleccionar su red» vive en el inspector de un cable y ya no está en ningún clic derecho', () => {
    const insp = readFileSync(join(import.meta.dirname, '../Inspector.tsx'), 'utf8')
    expect(insp).toContain('{TEXTO_SELECCIONAR_RED}')
    expect(TEXTO_SELECCIONAR_RED).toBe('Seleccionar su red')
    const lib = libreriaDePrueba().piezas
    for (const tipo of ['cable', 'pieza', 'etiqueta'] as const) {
      const m = menuDeObjetivo({ tipo, id: 'c', en: { x: 0, y: 0 } }, { doc: documentoVacio(), lib, puedePegar: false, teclas: () => undefined, seleccionados: 1 })
      expect(items(m.entradas).map((e) => e.texto)).not.toContain(TEXTO_SELECCIONAR_RED)
    }
  })

  it('«Pegar aquí» sin nada copiado dice la tecla vigente de Copiar, como la cinta', () => {
    const lib = libreriaDePrueba().piezas
    const m = menuDeObjetivo({ tipo: 'vacio', en: { x: 0, y: 0 } }, { doc: documentoVacio(), lib, puedePegar: false, teclas: (id) => (id === 'copiar' ? 'F3' : undefined), seleccionados: 0 })
    expect(items(m.entradas).find((e) => e.id === 'pegar-aqui')!.pista).toBe(razonSinPegar('F3'))
    expect(razonSinPegar('F3')).toBe('Primero copia algo con F3.')
  })
})
