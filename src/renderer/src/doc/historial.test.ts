import { describe, expect, it, vi } from 'vitest'
import { borrar, crear, modificar } from './comandos'
import { Historial } from './historial'
import { documentoVacio, type Pieza } from './tipos'

const pieza = (id: string, x = 0): Pieza => ({ id, tipo: 'resistencia', ref: 'R1', x, y: 0, rot: 0, espejo: false, props: {} })

function lcg(seed: number) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
}

describe('Historial', () => {
  it('deshace y rehace', () => {
    const h = new Historial(documentoVacio())
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    expect(h.puedeDeshacer).toBe(true)
    expect(h.deshacer()).toBe(true)
    expect(h.doc.piezas).toEqual({})
    expect(h.rehacer()).toBe(true)
    expect(h.doc.piezas.a).toEqual(pieza('a'))
    expect(h.rehacer()).toBe(false)
  })

  it('un comando nuevo borra lo que se podía rehacer', () => {
    const h = new Historial(documentoVacio())
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    h.deshacer()
    h.ejecutar(crear('crear', 'piezas', pieza('b')))
    expect(h.puedeRehacer).toBe(false)
  })

  it('revertirGrupo anula el gesto y conserva lo que se podía rehacer', () => {
    const h = new Historial(documentoVacio())
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    h.ejecutar(crear('crear', 'piezas', pieza('z')))
    h.deshacer()
    expect(h.puedeRehacer).toBe(true)
    h.ejecutar(modificar('mover', 'piezas', pieza('a', 0), pieza('a', 2), 'arrastre'))
    h.ejecutar(modificar('mover', 'piezas', pieza('a', 2), pieza('a', 4), 'arrastre'))
    expect(h.puedeRehacer).toBe(false)
    expect(h.revertirGrupo()).toBe(true)
    expect(h.doc.piezas.a.x).toBe(0)
    expect(h.puedeRehacer).toBe(true)
    expect(h.revertirGrupo()).toBe(false)
    h.rehacer()
    expect(Object.keys(h.doc.piezas).sort()).toEqual(['a', 'z'])
  })

  it('un arrastre agrupado se deshace en un paso, y cerrarGrupo lo termina', () => {
    const h = new Historial(documentoVacio())
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    for (let x = 1; x <= 5; x++) h.ejecutar(modificar('mover', 'piezas', pieza('a', x - 1), pieza('a', x), 'arrastre'))
    h.cerrarGrupo()
    h.ejecutar(modificar('mover', 'piezas', pieza('a', 5), pieza('a', 6), 'arrastre'))
    h.deshacer()
    expect(h.doc.piezas.a.x).toBe(5)
    h.deshacer()
    expect(h.doc.piezas.a.x).toBe(0)
  })

  it('avisa a los suscriptores y deja de avisar al cancelar', () => {
    const h = new Historial(documentoVacio())
    const fn = vi.fn()
    const cancelar = h.suscribir(fn)
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    expect(fn).toHaveBeenCalledTimes(1)
    cancelar()
    h.deshacer()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('un oyente que falla no impide avisar a los demás ni rompe ejecutar', () => {
    const h = new Historial(documentoVacio())
    const espia = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(() => {})
    const segundo = vi.fn()
    h.suscribir(() => {
      throw new Error('falla')
    })
    h.suscribir(segundo)
    expect(() => h.ejecutar(crear('crear', 'piezas', pieza('a')))).not.toThrow()
    expect(segundo).toHaveBeenCalledTimes(1)
    expect(espia).toHaveBeenCalledTimes(1)
    espia.mockRestore()
  })

  it('indica el tipo de notificación', () => {
    const h = new Historial(documentoVacio())
    const tipos: string[] = []
    h.suscribir((_d, _c, tipo) => tipos.push(tipo))
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    h.deshacer()
    h.rehacer()
    h.reemplazar(documentoVacio())
    expect(tipos).toEqual(['ejecutar', 'deshacer', 'rehacer', 'reemplazar'])
  })

  it('congela los elementos que entran al documento', () => {
    const h = new Historial(documentoVacio())
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    expect(() => {
      ;(h.doc.piezas.a as { x: number }).x = 99
    }).toThrow(TypeError)
    expect(() => {
      h.doc.piezas.a.props.k = 'v'
    }).toThrow(TypeError)
  })

  it('crear y borrar en el mismo gesto no deja un paso vacío', () => {
    const h = new Historial(documentoVacio())
    h.ejecutar(crear('crear', 'piezas', pieza('a'), 'g'))
    h.cerrarGrupo()
    h.ejecutar(crear('crear', 'piezas', pieza('b'), 'g'))
    h.ejecutar(borrar('borrar', 'piezas', pieza('b'), 'g'))
    expect(h.doc.piezas.b).toBeUndefined()
    h.deshacer()
    expect(h.doc.piezas.a).toBeUndefined()
    expect(h.puedeDeshacer).toBe(false)
  })

  it('ignora comandos vacíos', () => {
    const h = new Historial(documentoVacio())
    h.ejecutar({ nombre: 'nada', cambios: [] })
    expect(h.puedeDeshacer).toBe(false)
  })

  it('reemplazar carga otro documento y vacía la historia', () => {
    const h = new Historial(documentoVacio())
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    h.reemplazar(documentoVacio())
    expect(h.puedeDeshacer).toBe(false)
    expect(h.doc.piezas).toEqual({})
  })

  it('deshacer todo regresa al inicio y rehacer todo al final (200 operaciones al azar)', () => {
    const rnd = lcg(42)
    const h = new Historial(documentoVacio())
    const inicial = structuredClone(h.doc)
    let n = 0
    for (let k = 0; k < 200; k++) {
      const ids = Object.keys(h.doc.piezas)
      const r = rnd()
      if (r < 0.4 || ids.length === 0) h.ejecutar(crear('crear', 'piezas', pieza(`p${n++}`, Math.floor(rnd() * 100))))
      else {
        const p = h.doc.piezas[ids[Math.floor(rnd() * ids.length)]]
        if (r < 0.75) h.ejecutar(modificar('mover', 'piezas', p, { ...p, x: p.x + 1 }, rnd() < 0.5 ? 'arrastre' : undefined))
        else h.ejecutar(borrar('borrar', 'piezas', p))
      }
    }
    const final = structuredClone(h.doc)
    while (h.deshacer()) {
      /* hasta el inicio */
    }
    expect(h.doc).toEqual(inicial)
    while (h.rehacer()) {
      /* hasta el final */
    }
    expect(h.doc).toEqual(final)
  })
})

describe('marca de guardado', () => {
  it('un historial nuevo está guardado; un paso lo ensucia y deshacerlo lo limpia', () => {
    const h = new Historial(documentoVacio())
    expect(h.sinGuardar).toBe(false)
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    expect(h.sinGuardar).toBe(true)
    h.deshacer()
    expect(h.sinGuardar).toBe(false)
    h.rehacer()
    expect(h.sinGuardar).toBe(true)
  })

  it('después de guardar, deshacer ensucia y rehacer vuelve a lo guardado', () => {
    const h = new Historial(documentoVacio())
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    h.ejecutar(crear('crear', 'piezas', pieza('b')))
    h.marcarGuardado()
    expect(h.sinGuardar).toBe(false)
    h.deshacer()
    expect(h.sinGuardar).toBe(true)
    h.rehacer()
    expect(h.sinGuardar).toBe(false)
  })

  it('un paso nuevo tras deshacer lo guardado ensucia para siempre (lo guardado ya no se alcanza)', () => {
    const h = new Historial(documentoVacio())
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    h.marcarGuardado()
    h.deshacer()
    h.ejecutar(crear('crear', 'piezas', pieza('b')))
    expect(h.sinGuardar).toBe(true)
    h.deshacer()
    expect(h.sinGuardar).toBe(true)
  })

  it('un paso que se funde con el guardado ensucia', () => {
    const h = new Historial(documentoVacio())
    h.ejecutar(modificar('mover', 'piezas', pieza('a', 0), pieza('a', 2), 'flechas'))
    h.marcarGuardado()
    h.ejecutar(modificar('mover', 'piezas', pieza('a', 2), pieza('a', 4), 'flechas'))
    expect(h.sinGuardar).toBe(true)
  })

  it('reemplazar deja el documento guardado; marcarSucio no se limpia deshaciendo', () => {
    const h = new Historial(documentoVacio())
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    h.reemplazar(documentoVacio())
    expect(h.sinGuardar).toBe(false)
    h.marcarSucio()
    expect(h.sinGuardar).toBe(true)
    h.ejecutar(crear('crear', 'piezas', pieza('b')))
    h.deshacer()
    expect(h.sinGuardar).toBe(true)
  })

  it('una marca tomada antes de guardar deja sin guardar lo que se hizo mientras', () => {
    const h = new Historial(documentoVacio())
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    const m = h.marca()
    h.ejecutar(crear('crear', 'piezas', pieza('b')))
    h.marcarGuardado(m)
    expect(h.sinGuardar).toBe(true)
    h.deshacer()
    expect(h.sinGuardar).toBe(false)
  })

  it('revertir el gesto abierto devuelve la marca al paso anterior', () => {
    const h = new Historial(documentoVacio())
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    h.marcarGuardado()
    h.ejecutar(modificar('mover', 'piezas', pieza('a', 0), pieza('a', 2), 'arrastre'))
    expect(h.sinGuardar).toBe(true)
    h.revertirGrupo()
    expect(h.sinGuardar).toBe(false)
  })
})
