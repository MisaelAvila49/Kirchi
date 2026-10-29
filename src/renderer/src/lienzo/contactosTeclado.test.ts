// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Atajos, combinacion, type EventoTecla } from '../editor/teclado'
import { registrarAtajosDelEditor } from '../editor/atajosEditor'
import type { Editor } from '../editor/Editor'
import { libreriaDePrueba } from '../prueba/libreria'
import { registrarAtajosDeLaVentana } from '../ui/atajosVentana'
import { contactoDeEvento, teclasDe } from './contactos'

const lib = libreriaDePrueba().piezas
const ev = (key: string, m: Partial<EventoTecla> = {}): EventoTecla => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...m })

describe('teclas de un DIP y de un teclado', () => {
  it('las teclas del teclado de la computadora que mueven los contactos no están en ningún atajo de una sola tecla', () => {
    const a = new Atajos()
    registrarAtajosDelEditor(a, {} as unknown as Editor, { encuadrar: () => {} })
    registrarAtajosDeLaVentana(a, {} as never)
    const teclas = new Set(['interruptor-dip-4', 'interruptor-dip-8', 'teclado-4x4', 'teclado-4x3'].flatMap((id) => [...teclasDe(lib.get(id))]))
    expect(teclas.size).toBe(16)
    for (const t of teclas) {
      // Con Mayús para el * y el #, que en casi todo teclado salen así.
      const conMayus = t === '*' || t === '#'
      expect(a.dueño(combinacion(ev(t, { shiftKey: conMayus }))), `la tecla ${t}`).toBeUndefined()
    }
  })

  it('con Ctrl, Alt o Meta no mueven ningún contacto y sin ellos sí', () => {
    const kp = lib.get('teclado-4x4')
    expect(contactoDeEvento(kp, ev('a'))).toBe(3)
    expect(contactoDeEvento(kp, ev('#', { shiftKey: true }))).toBe(14)
    expect(contactoDeEvento(kp, ev('a', { ctrlKey: true }))).toBeNull()
    expect(contactoDeEvento(kp, ev('a', { altKey: true }))).toBeNull()
    expect(contactoDeEvento(kp, ev('a', { metaKey: true }))).toBeNull()
    expect(contactoDeEvento(lib.get('resistencia'), ev('a'))).toBeNull()
  })
})
