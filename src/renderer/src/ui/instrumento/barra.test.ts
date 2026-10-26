import { describe, expect, it } from 'vitest'
import { TONOS } from '../colores'
import { PLANOS } from '../cinta/planos'
import { accionDeTecla, aspectoDeBoton, atajoAria, BOTONES_BARRA, GRUPOS_BARRA, textoGlobo, type AccionBarra } from './barra'

const tecla = (key: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o })

describe('barra del instrumento', () => {
  it('cada botón tiene grupo, tono de la tabla, icono plano y atajo', () => {
    const grupos = GRUPOS_BARRA.map((g) => g.id)
    for (const d of Object.values(BOTONES_BARRA)) {
      expect(grupos, d.accion).toContain(d.grupo)
      expect(TONOS, d.accion).toContain(d.tono)
      expect(PLANOS, d.accion).toHaveProperty([d.icono])
      expect(d.atajo.length, d.accion).toBeGreaterThan(0)
    }
  })

  it('el zoom va solo con iconos y los demás llevan un nombre corto', () => {
    for (const a of ['acercar', 'alejar', 'restablecer'] as const) expect(BOTONES_BARRA[a].corto).toBeUndefined()
    for (const a of ['pausa', 'auto', 'cursores', 'exportar', 'mas', 'ventana'] as const) expect(BOTONES_BARRA[a].corto, a).toBeTruthy()
    expect(BOTONES_BARRA.aspecto.corto).toBeUndefined()
  })

  it('Pausar pasa a Reanudar y Ventana pasa a Acoplar', () => {
    expect(aspectoDeBoton('pausa')).toMatchObject({ nombre: 'Pausar', icono: 'pausa' })
    expect(aspectoDeBoton('pausa', { pausada: true })).toMatchObject({ nombre: 'Reanudar', corto: 'Reanudar', icono: 'simular' })
    expect(aspectoDeBoton('ventana')).toMatchObject({ nombre: 'Abrir en ventana', corto: 'Ventana' })
    expect(aspectoDeBoton('ventana', { enVentana: true })).toMatchObject({ nombre: 'Acoplar a la franja', corto: 'Acoplar', icono: 'acoplar' })
  })

  it('el nombre accesible contiene el rótulo visible (WCAG 2.5.3)', () => {
    for (const a of Object.keys(BOTONES_BARRA) as AccionBarra[]) {
      for (const estado of [{}, { pausada: true }, { enVentana: true }]) {
        const v = aspectoDeBoton(a, estado)
        if (v.corto) expect(v.aria.toLowerCase(), `${a} ${JSON.stringify(estado)}`).toContain(v.corto.toLowerCase())
      }
    }
    expect(aspectoDeBoton('auto').aria).toBe('Auto: ajuste automático')
  })

  it('el globo dice el nombre y el atajo', () => {
    expect(textoGlobo(aspectoDeBoton('cursores'))).toBe('Cursores (C)')
    expect(textoGlobo(aspectoDeBoton('ventana', { enVentana: true }))).toBe('Acoplar a la franja (Ctrl+Mayús+V)')
    expect(atajoAria('Ctrl+Mayús+V')).toBe('Ctrl+Shift+V')
  })

  it('cada tecla enciende su botón y ninguna otra cosa', () => {
    const casos: [ReturnType<typeof tecla>, AccionBarra | null][] = [
      [tecla('p'), 'pausa'],
      [tecla('P'), 'pausa'],
      [tecla('a'), 'auto'],
      [tecla('c'), 'cursores'],
      [tecla('m'), 'mas'],
      [tecla('s'), 'aspecto'],
      [tecla('+'), 'acercar'],
      [tecla('='), 'acercar'],
      [tecla('-'), 'alejar'],
      [tecla('−'), 'alejar'],
      [tecla('0'), 'restablecer'],
      [tecla('e', { ctrlKey: true }), 'exportar'],
      [tecla('V', { ctrlKey: true, shiftKey: true }), 'ventana'],
      [tecla('e'), null],
      [tecla('c', { ctrlKey: true }), null],
      [tecla('p', { altKey: true }), null],
      [tecla('Enter'), null],
      [tecla('x'), null]
    ]
    for (const [t, esperada] of casos) expect(accionDeTecla(t), JSON.stringify(t)).toBe(esperada)
  })
})
