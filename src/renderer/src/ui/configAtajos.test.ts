import { describe, expect, it } from 'vitest'
import { registrarAtajosDelEditor } from '../editor/atajosEditor'
import type { Editor } from '../editor/Editor'
import { Atajos } from '../editor/teclado'
import { registrarAtajosDeLaVentana } from './atajosVentana'
import { agregarTecla, gruposDeConfig, quitarTecla, restaurarComando } from './configAtajos'

/** El registro del editor; los comandos no se ejecutan, así que el editor puede ser un objeto vacío. */
function registro(): Atajos {
  const a = new Atajos()
  registrarAtajosDelEditor(a, {} as Editor, { encuadrar: () => {} })
  return a
}

describe('Configuración → Atajos', () => {
  it('los grupos de la hoja con las teclas vigentes; el filtro busca en nombre y teclas', () => {
    const a = registro()
    expect(gruposDeConfig(a).map((g) => g.nombre)).toEqual(['Edición', 'Piezas y redes', 'Cables', 'Texto', 'Mover', 'Vista y ventana'])
    expect(gruposDeConfig(a, 'ctrl + d').flatMap((g) => g.filas.map((f) => f.id))).toEqual(['duplicar'])
    expect(gruposDeConfig(a, 'duplic')[0].filas[0]).toEqual({ id: 'duplicar', nombre: 'Duplicar', teclas: ['Ctrl+D'], propio: false })
    expect(gruposDeConfig(a, 'zzz')).toEqual([])
  })

  it('agregar una combinación libre la suma y marca la fila como propia', () => {
    const a = registro()
    expect(agregarTecla(a, 'duplicar', 'Ctrl+Shift+D')).toEqual({ tipo: 'hecho' })
    expect(a.teclasDe('duplicar')).toEqual(['Ctrl+D', 'Ctrl+Shift+D'])
    expect(gruposDeConfig(a, 'duplicar')[0].filas[0].propio).toBe(true)
    expect(agregarTecla(a, 'duplicar', 'Ctrl+D')).toEqual({ tipo: 'repetida' })
  })

  it('una combinación de otro comando avisa y no cambia nada; con reemplazar se la quita', () => {
    const a = registro()
    expect(agregarTecla(a, 'girar', 'Ctrl+D')).toEqual({ tipo: 'conflicto', con: 'duplicar', nombre: 'Duplicar', texto: 'Ctrl+D ya es Duplicar.' })
    expect(a.teclasDe('girar')).toEqual(['R'])
    expect(agregarTecla(a, 'girar', 'Ctrl+D', true)).toEqual({ tipo: 'hecho' })
    expect(a.teclasDe('girar')).toEqual(['R', 'Ctrl+D'])
    expect(a.teclasDe('duplicar')).toEqual([])
    expect(a.conflictos()).toEqual([])
    expect(a.propiasActuales()).toEqual({ girar: ['R', 'Ctrl+D'], duplicar: [] })
  })

  it('quitar deja al comando con las demás o sin ninguna; un comando lleva hasta cuatro', () => {
    const a = registro()
    quitarTecla(a, 'rehacer', 'Ctrl+Y')
    expect(a.teclasDe('rehacer')).toEqual(['Ctrl+Shift+Z'])
    for (const t of ['F2', 'F3', 'F4']) agregarTecla(a, 'rehacer', t)
    expect(agregarTecla(a, 'rehacer', 'F7').tipo).toBe('llena')
    a.restaurarUno('rehacer')
    expect(a.teclasDe('rehacer')).toEqual(['Ctrl+Y', 'Ctrl+Shift+Z'])
  })
})

describe('restaurar un comando', () => {
  it('sin choques vuelve a las teclas de fábrica', () => {
    const a = registro()
    agregarTecla(a, 'duplicar', 'Ctrl+Shift+D')
    expect(restaurarComando(a, 'duplicar')).toEqual({ tipo: 'hecho' })
    expect(a.teclasDe('duplicar')).toEqual(['Ctrl+D'])
    expect(a.esPropio('duplicar')).toBe(false)
  })

  it('si otro comando tomó una tecla de fábrica, pregunta antes y no cambia nada', () => {
    const a = registro()
    agregarTecla(a, 'girar', 'Ctrl+D', true)
    a.ponerTeclas('duplicar', ['Ctrl+Shift+D'])
    const r = restaurarComando(a, 'duplicar')
    expect(r).toMatchObject({ tipo: 'conflicto', con: 'girar', texto: 'Ctrl+D ya es Girar 90° a la derecha.' })
    expect(a.teclasDe('duplicar')).toEqual(['Ctrl+Shift+D'])
    expect(a.conflictos()).toEqual([])
  })

  it('con reemplazar se la quita al otro y no queda ninguna tecla repetida', () => {
    const a = registro()
    agregarTecla(a, 'girar', 'Ctrl+D', true)
    a.ponerTeclas('duplicar', [])
    expect(restaurarComando(a, 'duplicar', true)).toEqual({ tipo: 'hecho' })
    expect(a.teclasDe('duplicar')).toEqual(['Ctrl+D'])
    expect(a.teclasDe('girar')).toEqual(['R'])
    expect(a.conflictos()).toEqual([])
  })

  it('Grabar la pantalla y Detener la grabación están en «Simulación» sin tecla de fábrica ni conflictos, y se pueden asignar', () => {
    const a = registro()
    const nada = () => {}
    registrarAtajosDeLaVentana(a, { hojaDeAtajos: nada, lienzoLimpio: nada, configuracion: nada, menuContextual: nada, enfocarFormato: nada, grabar: nada, detenerGrabacion: nada })
    const filas = gruposDeConfig(a).find((g) => g.nombre === 'Simulación')!.filas
    expect(filas.map((f) => f.id)).toEqual(expect.arrayContaining(['grabar', 'detener-grabacion']))
    expect(filas.find((f) => f.id === 'grabar')).toEqual({ id: 'grabar', nombre: 'Grabar la pantalla', teclas: [], propio: false })
    expect(filas.find((f) => f.id === 'detener-grabacion')).toMatchObject({ nombre: 'Detener la grabación', teclas: [] })
    expect(a.conflictos()).toEqual([])
    // Esc sigue siendo de otro comando: no detiene la grabación.
    expect(a.dueño('Escape', 'grabar')).not.toBe('detener-grabacion')
    expect(agregarTecla(a, 'grabar', 'Ctrl+Alt+G')).toEqual({ tipo: 'hecho' })
    expect(a.teclasDe('grabar')).toEqual(['Ctrl+Alt+G'])
    expect(a.conflictos()).toEqual([])
  })
})
