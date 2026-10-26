import { describe, expect, it } from 'vitest'
import { Atajos, capturarCombinacion, combinacion, esCampoDeTexto, TECLAS_RESERVADAS, type EventoTecla } from './teclado'

const ev = (key: string, m: Partial<EventoTecla> = {}): EventoTecla => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...m })

describe('combinacion', () => {
  it.each([
    [ev('r'), 'R'],
    [ev('R', { shiftKey: true }), 'Shift+R'],
    [ev('z', { ctrlKey: true }), 'Ctrl+Z'],
    [ev('Z', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+Z'],
    [ev('z', { metaKey: true }), 'Ctrl+Z'],
    [ev('Delete'), 'Supr'],
    [ev('Delete', { shiftKey: true }), 'Shift+Supr'],
    [ev('Backspace'), 'Retroceso'],
    [ev('Escape'), 'Esc'],
    [ev('/', { shiftKey: true }), '/'],
    [ev('?', { shiftKey: true }), '?'],
    [ev(' '), 'Espacio'],
    [ev(' ', { shiftKey: true }), 'Shift+Espacio'],
    [ev('Enter', { shiftKey: true }), 'Shift+Enter'],
    [ev('b', { ctrlKey: true }), 'Ctrl+B'],
    [ev('>', { ctrlKey: true, shiftKey: true, code: 'Period' }), 'Ctrl+Shift+.'],
    [ev(':', { ctrlKey: true, shiftKey: true, code: 'Period' }), 'Ctrl+Shift+.'],
    [ev(';', { ctrlKey: true, shiftKey: true, code: 'Comma' }), 'Ctrl+Shift+,'],
    [ev(',', { ctrlKey: true, code: 'Comma' }), 'Ctrl+,'],
    [ev('L', { ctrlKey: true, shiftKey: true, code: 'KeyL' }), 'Ctrl+Shift+L']
  ])('%o → %s', (e, t) => {
    expect(combinacion(e)).toBe(t)
  })
})

describe('Atajos', () => {
  const con = (fn: () => void) => {
    const a = new Atajos()
    a.registrar({ id: 'girar', nombre: 'Girar', teclas: ['R'], ejecutar: fn })
    return a
  }

  it('despacha la tecla registrada y evita la acción del navegador', () => {
    let n = 0, evitado = false
    const a = con(() => n++)
    expect(a.despachar({ ...ev('r'), preventDefault: () => (evitado = true) })).toBe(true)
    expect(n).toBe(1)
    expect(evitado).toBe(true)
    expect(a.despachar(ev('q'))).toBe(false)
  })

  it('las teclas propias reemplazan a las de fábrica y se restauran', () => {
    let n = 0
    const a = con(() => n++)
    a.ponerTeclas('girar', ['Ctrl+R'])
    a.despachar(ev('r'))
    a.despachar(ev('r', { ctrlKey: true }))
    expect(n).toBe(1)
    a.restaurar()
    expect(a.teclasDe('girar')).toEqual(['R'])
  })

  it('ignora lo que se escribe en campos de texto', () => {
    let n = 0
    const a = con(() => n++)
    a.despachar({ ...ev('r'), target: { tagName: 'INPUT' } as unknown as EventTarget })
    a.despachar({ ...ev('r'), target: { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget })
    expect(n).toBe(0)
    expect(esCampoDeTexto({ tagName: 'textarea' } as unknown as EventTarget)).toBe(true)
    expect(esCampoDeTexto({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false)
    expect(esCampoDeTexto(null)).toBe(false)
  })

  it('no repite al mantener la tecla salvo que el comando lo pida', () => {
    let n = 0
    const a = con(() => n++)
    a.despachar(ev('r', { repeat: true }))
    expect(n).toBe(0)
  })

  it('rechaza ids repetidos e informa conflictos', () => {
    const a = con(() => {})
    expect(() => a.registrar({ id: 'girar', nombre: 'Otro', teclas: [], ejecutar: () => {} })).toThrow('repetido')
    a.registrar({ id: 'rotar', nombre: 'Rotar', teclas: ['R'], ejecutar: () => {} })
    expect(a.conflictos()).toEqual([['R', 'girar', 'rotar']])
  })

  it('teclas propias: se guardan solo las que se apartan de las de fábrica y se restauran una por una', () => {
    const a = con(() => {})
    a.registrar({ id: 'tierra', nombre: 'Tierra', teclas: ['G'], ejecutar: () => {} })
    expect(a.propiasActuales()).toEqual({})
    a.ponerTeclas('girar', ['Ctrl+R'])
    a.ponerTeclas('tierra', ['G'])
    expect(a.esPropio('girar')).toBe(true)
    expect(a.esPropio('tierra')).toBe(false)
    expect(a.propiasActuales()).toEqual({ girar: ['Ctrl+R'] })
    a.restaurarUno('girar')
    expect(a.teclasDe('girar')).toEqual(['R'])
  })

  it('cargarPropias reemplaza lo que había e ignora comandos que no existen', () => {
    const a = con(() => {})
    a.ponerTeclas('girar', ['Q'])
    a.cargarPropias({ girar: ['Ctrl+R', 'Shift+G'], viejo: ['W'] })
    expect(a.teclasDe('girar')).toEqual(['Ctrl+R', 'Shift+G'])
    expect(a.propiasActuales()).toEqual({ girar: ['Ctrl+R', 'Shift+G'] })
    a.cargarPropias({})
    expect(a.teclasDe('girar')).toEqual(['R'])
  })

  it('cargarPropias descarta las combinaciones reservadas de un archivo alterado', () => {
    const a = con(() => {})
    a.cargarPropias({ girar: ['Tab', 'F11', 'Q'] })
    expect(a.teclasDe('girar')).toEqual(['Q'])
  })

  it('cargarPropias: una elección que hoy es solo de teclas reservadas (F11) deja las de fábrica, y las demás elecciones se conservan', () => {
    const a = con(() => {})
    a.cargarPropias({ girar: ['F11'] })
    expect(a.teclasDe('girar')).toEqual(['R'])
    expect(a.propiasActuales()).toEqual({})
    a.cargarPropias({ girar: ['F11', 'Shift+G'] })
    expect(a.teclasDe('girar')).toEqual(['Shift+G'])
  })

  it('dueño dice qué comando tiene una combinación, sin contar el que se está cambiando', () => {
    const a = con(() => {})
    expect(a.dueño('R')).toBe('girar')
    expect(a.dueño('R', 'girar')).toBeUndefined()
    expect(a.dueño('Ctrl+Q')).toBeUndefined()
    expect(a.nombreDe('girar')).toBe('Girar')
  })

  it('capturar: un modificador solo espera, una reservada da su motivo, lo demás es la combinación', () => {
    expect(capturarCombinacion(ev('Shift', { shiftKey: true }))).toBeNull()
    expect(capturarCombinacion(ev('Control', { ctrlKey: true }))).toBeNull()
    expect(capturarCombinacion(ev('Tab'))).toEqual({ reservada: TECLAS_RESERVADAS.Tab })
    expect(capturarCombinacion(ev('Escape'))).toEqual({ reservada: TECLAS_RESERVADAS.Esc })
    expect(capturarCombinacion(ev('F11'))).toEqual({ reservada: TECLAS_RESERVADAS.F11 })
    // Ctrl++ (con o sin Shift, como la escribe el teclado) y Alt+F4 las toma la ventana.
    expect(capturarCombinacion(ev('+', { ctrlKey: true }))).toEqual({ reservada: TECLAS_RESERVADAS['Ctrl++'] })
    expect(capturarCombinacion(ev('+', { ctrlKey: true, shiftKey: true }))).toEqual({ reservada: TECLAS_RESERVADAS['Ctrl++'] })
    expect(capturarCombinacion(ev('F4', { altKey: true }))).toEqual({ reservada: TECLAS_RESERVADAS['Alt+F4'] })
    expect(capturarCombinacion(ev('F4'))).not.toHaveProperty('reservada')
    expect(capturarCombinacion(ev('k', { ctrlKey: true }))).toEqual({ combinacion: 'Ctrl+K' })
    expect(capturarCombinacion(ev('F5'))).toEqual({ combinacion: 'F5' })
  })

  it('se instala y se quita de un destino de eventos', () => {
    let n = 0
    const a = con(() => n++)
    // Objeto contenedor: TypeScript no sigue asignaciones hechas dentro de funciones a una variable local.
    const caja: { oyente: ((e: KeyboardEvent) => void) | null } = { oyente: null }
    const destino = {
      addEventListener: (_t: string, f: (e: KeyboardEvent) => void) => {
        caja.oyente = f
      },
      removeEventListener: () => {
        caja.oyente = null
      }
    }
    const quitar = a.instalar(destino)
    caja.oyente!(ev('r') as unknown as KeyboardEvent)
    expect(n).toBe(1)
    quitar()
    expect(caja.oyente).toBeNull()
  })

  it('con `permitir` en false la tecla no se despacha', () => {
    let n = 0
    let abierto = true
    const a = con(() => n++)
    const caja: { oyente: ((e: KeyboardEvent) => void) | null } = { oyente: null }
    a.instalar({ addEventListener: (_t: string, f: (e: KeyboardEvent) => void) => (caja.oyente = f), removeEventListener: () => {} }, () => !abierto)
    caja.oyente!(ev('r') as unknown as KeyboardEvent)
    expect(n).toBe(0)
    abierto = false
    caja.oyente!(ev('r') as unknown as KeyboardEvent)
    expect(n).toBe(1)
  })

  it('una tecla con defaultPrevented ya la atendió otro: no se despacha', () => {
    let n = 0
    const a = con(() => n++)
    const caja: { oyente: ((e: KeyboardEvent) => void) | null } = { oyente: null }
    a.instalar({ addEventListener: (_t: string, f: (e: KeyboardEvent) => void) => (caja.oyente = f), removeEventListener: () => {} })
    caja.oyente!({ ...ev('r'), defaultPrevented: true } as unknown as KeyboardEvent)
    expect(n).toBe(0)
    expect(a.despachar({ ...ev('r'), defaultPrevented: true })).toBe(false)
    expect(n).toBe(0)
    caja.oyente!(ev('r') as unknown as KeyboardEvent)
    expect(n).toBe(1)
  })

  it('Ctrl+\\ con AltGr (teclados en español) llega como Ctrl+Alt+\\', () => {
    expect(combinacion(ev('\\', { ctrlKey: true }))).toBe('Ctrl+\\')
    expect(combinacion(ev('\\', { ctrlKey: true, altKey: true }))).toBe('Ctrl+Alt+\\')
    expect(combinacion(ev(',', { ctrlKey: true }))).toBe('Ctrl+,')
  })
})

describe('teclas reservadas de fábrica', () => {
  const armar = () => {
    const a = new Atajos()
    a.registrar({ id: 'escape', nombre: 'Cancelar', teclas: ['Esc'], ejecutar() {} })
    a.registrar({ id: 'colocar-pieza', nombre: 'Colocar', teclas: ['Enter', 'Espacio'], ejecutar() {} })
    a.registrar({ id: 'girar', nombre: 'Girar', teclas: ['R'], ejecutar() {} })
    return a
  }

  it('cargarPropias conserva las reservadas que son de fábrica del comando', () => {
    const a = armar()
    a.ponerTeclas('escape', [...a.teclasDe('escape'), 'Q'])
    a.ponerTeclas('colocar-pieza', [...a.teclasDe('colocar-pieza'), 'P'])
    a.cargarPropias(a.propiasActuales())
    expect(a.teclasDe('escape')).toEqual(['Esc', 'Q'])
    expect(a.teclasDe('colocar-pieza')).toEqual(['Enter', 'Espacio', 'P'])
  })

  it('una reservada que no es de fábrica del comando se sigue descartando', () => {
    const a = armar()
    a.cargarPropias({ girar: ['R', 'Esc', 'Tab'], escape: ['Esc', 'Tab'] })
    expect(a.teclasDe('girar')).toEqual(['R'])
    expect(a.teclasDe('escape')).toEqual(['Esc'])
  })

  it('los nombres heredados de Object no cuentan como reservados', () => {
    expect(capturarCombinacion({ key: 'constructor' } as unknown as EventoTecla)).not.toHaveProperty('reservada')
    const a = armar()
    a.cargarPropias({ girar: ['toString', '__proto__'] })
    expect(a.teclasDe('girar')).toEqual(['toString', '__proto__'])
  })
})

describe('conflictos al recargar teclas propias', () => {
  const armar = () => {
    const a = new Atajos()
    a.registrar({ id: 'duplicar', nombre: 'Duplicar', teclas: ['Ctrl+D'], ejecutar() {} })
    a.registrar({ id: 'girar', nombre: 'Girar', teclas: ['R'], ejecutar() {} })
    a.registrar({ id: 'espejo', nombre: 'Espejo', teclas: ['X'], ejecutar() {} })
    return a
  }

  it('si un settings.json alterado repite una tecla, la conserva quien la tiene de fábrica y avisa', () => {
    const a = armar()
    const avisos = a.cargarPropias({ girar: ['R', 'Ctrl+D'] })
    expect(a.conflictos()).toEqual([])
    expect(a.teclasDe('duplicar')).toEqual(['Ctrl+D'])
    expect(a.teclasDe('girar')).toEqual(['R'])
    expect(avisos).toEqual(['Ctrl+D estaba en Duplicar y en Girar: se queda en Duplicar.'])
  })

  it('sin dueño de fábrica gana el primero registrado, y una tecla repetida dentro de un comando se deja una vez', () => {
    const a = armar()
    const avisos = a.cargarPropias({ espejo: ['X', 'Q', 'Q'], girar: ['R', 'Q'] })
    expect(a.teclasDe('girar')).toEqual(['R', 'Q'])
    expect(a.teclasDe('espejo')).toEqual(['X'])
    expect(avisos).toHaveLength(1)
    expect(a.conflictos()).toEqual([])
  })

  it('sin conflictos no avisa nada', () => {
    expect(armar().cargarPropias({ girar: ['R', 'Q'] })).toEqual([])
  })
})
