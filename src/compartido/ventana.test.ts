import { describe, expect, it } from 'vitest'
import { ACELERADORES_OCULTOS, CANAL_TAMAÑO_INTERFAZ, ordenDeTeclaNumerica, esOrdenVentana, esTamañoInterfaz, ORDEN_VENTANA, ORDENES_VENTANA, TAMAÑOS_INTERFAZ, tamañoTrasOrden, estadoDeVentana, planDeVentana, type EstadoVentana, type Rect } from './ventana'

describe('órdenes de la ventana', () => {
  it('solo cuatro, y nada más pasa', () => {
    expect([...ORDENES_VENTANA]).toEqual(['acercar', 'alejar', 'tamaño-real', 'pantalla-completa'])
    for (const o of ORDENES_VENTANA) expect(esOrdenVentana(o)).toBe(true)
    for (const v of ['cerrar', '', 5, null, undefined, { orden: 'acercar' }, 'constructor']) expect(esOrdenVentana(v)).toBe(false)
  })
})

describe('nombres y teclas de las órdenes de la ventana (los comparten el menú de la aplicación y la cinta)', () => {
  it('Ctrl++ para acercar, como se escribe en un teclado en español; pantalla completa según el sistema', () => {
    expect(ORDENES_VENTANA.map((o) => ORDEN_VENTANA[o].nombre)).toEqual(['Acercar la página', 'Alejar la página', 'Tamaño real de la página', 'Pantalla completa'])
    expect(ORDENES_VENTANA.map((o) => ORDEN_VENTANA[o].tecla(false))).toEqual(['Ctrl++', 'Ctrl+-', 'Ctrl+0', 'F11'])
    expect(ORDEN_VENTANA['pantalla-completa'].tecla(true)).toBe('Ctrl+Cmd+F')
    expect(ORDEN_VENTANA['pantalla-completa'].acelerador(true)).toBe('Control+Command+F')
    expect(ORDEN_VENTANA.acercar.acelerador(false)).toBe('CommandOrControl+Plus')
  })
})

describe('tamaño de la interfaz', () => {
  it('los pasos de Chromium entre 80 y 150 %; acercar y alejar recorren los pasos sin pasar de los topes y tamaño real es 100', () => {
    expect([...TAMAÑOS_INTERFAZ]).toEqual([80, 90, 100, 110, 125, 150])
    expect(tamañoTrasOrden(100, 'acercar')).toBe(110)
    expect(tamañoTrasOrden(110, 'acercar')).toBe(125)
    expect(tamañoTrasOrden(150, 'acercar')).toBe(150)
    expect(tamañoTrasOrden(90, 'alejar')).toBe(80)
    expect(tamañoTrasOrden(80, 'alejar')).toBe(80)
    expect(tamañoTrasOrden(125, 'tamaño-real')).toBe(100)
    expect(CANAL_TAMAÑO_INTERFAZ).toBe('ventana:tamaño')
  })

  it('solo los pasos valen', () => {
    for (const t of TAMAÑOS_INTERFAZ) expect(esTamañoInterfaz(t)).toBe(true)
    for (const v of [100.5, 0, 200, '100', null, undefined, NaN]) expect(esTamañoInterfaz(v)).toBe(false)
  })
})

describe('teclado numérico', () => {
  const t = (code: string, m: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = { ctrlKey: true }) => ordenDeTeclaNumerica({ code, ctrlKey: false, metaKey: false, altKey: false, ...m })
  it('Ctrl o Cmd con +, − y 0 del numérico dan acercar, alejar y tamaño real', () => {
    expect(t('NumpadAdd')).toBe('acercar')
    expect(t('NumpadSubtract')).toBe('alejar')
    expect(t('Numpad0')).toBe('tamaño-real')
    expect(t('NumpadAdd', { metaKey: true })).toBe('acercar')
  })
  it('sin Ctrl, con Alt o con otra tecla no es una orden', () => {
    expect(t('NumpadAdd', {})).toBeNull()
    expect(t('NumpadAdd', { ctrlKey: true, altKey: true })).toBeNull()
    for (const c of ['Equal', 'Minus', 'Digit0', 'Numpad1', 'NumpadMultiply', 'constructor', '']) expect(t(c)).toBeNull()
  })
  it('los aceleradores ocultos del menú cubren Ctrl+= y el numérico', () => {
    expect(ACELERADORES_OCULTOS.map(([o, a]) => `${o} ${a}`)).toEqual([
      'acercar CommandOrControl+=', 'acercar CommandOrControl+numadd', 'alejar CommandOrControl+numsub', 'tamaño-real CommandOrControl+num0'
    ])
  })
})

describe('abrir como se cerró', () => {
  const p1: Rect = { x: 0, y: 0, ancho: 1920, alto: 1040 }
  const p2: Rect = { x: 1920, y: 0, ancho: 1366, alto: 728 }
  const e = (r: Partial<EstadoVentana> = {}): EstadoVentana => ({ x: 100, y: 80, ancho: 1000, alto: 700, maximizada: false, pantallaCompleta: false, ...r })

  it('sin estado guardado: tamaño de siempre y sin posición (el sistema la centra)', () => {
    expect(planDeVentana(null, [p1])).toEqual({ ancho: 1280, alto: 800, maximizada: false, pantallaCompleta: false })
  })
  it('un rectángulo que cabe se respeta tal cual, con maximizada y pantalla completa', () => {
    expect(planDeVentana(e({ maximizada: true }), [p1, p2])).toEqual({ x: 100, y: 80, ancho: 1000, alto: 700, maximizada: true, pantallaCompleta: false })
    expect(planDeVentana(e({ pantallaCompleta: true }), [p1]).pantallaCompleta).toBe(true)
  })
  it('en la segunda pantalla se queda ahí', () => {
    expect(planDeVentana(e({ x: 2000, y: 20 }), [p1, p2])).toMatchObject({ x: 2000, y: 20 })
  })
  it('si la pantalla se desconectó vuelve centrada en la principal y conserva el modo', () => {
    const plan = planDeVentana(e({ x: 2100, y: 50, maximizada: true }), [p1])
    expect(plan.x).toBeUndefined()
    expect(plan).toMatchObject({ ancho: 1280, alto: 800, maximizada: true })
  })
  it('una ventana casi fuera de la pantalla (solo asoma un borde) se vuelve a centrar', () => {
    expect(planDeVentana(e({ x: 1900, y: 1030 }), [p1]).x).toBeUndefined()
  })
  it('una ventana que se sale por la derecha se desplaza hasta caber', () => {
    expect(planDeVentana(e({ x: 1500 }), [p1])).toMatchObject({ x: 920, y: 80, ancho: 1000 })
  })
  it('más grande que la pantalla se recorta a su área útil y nunca baja del mínimo', () => {
    expect(planDeVentana(e({ x: 0, y: 0, ancho: 5000, alto: 3000 }), [p2])).toMatchObject({ x: 1920, y: 0, ancho: 1366, alto: 728 })
    expect(planDeVentana(null, [{ x: 0, y: 0, ancho: 640, alto: 400 }])).toMatchObject({ ancho: 800, alto: 500 })
  })
  it('sin pantallas (no debería pasar) no revienta', () => {
    expect(planDeVentana(e(), [])).toMatchObject({ ancho: 1280, alto: 800 })
  })

  it('un estado alterado del disco se descarta', () => {
    expect(estadoDeVentana({ x: 1.4, y: 2, ancho: 900, alto: 600, maximizada: true })).toEqual({ x: 1, y: 2, ancho: 900, alto: 600, maximizada: true, pantallaCompleta: false })
    for (const v of [null, 5, [], {}, { x: 'a', y: 0, ancho: 900, alto: 600 }, { x: 0, y: 0, ancho: 10, alto: 600 }, { x: NaN, y: 0, ancho: 900, alto: 600 }, { x: 0, y: 0, ancho: 900, alto: 1e9 }])
      expect(estadoDeVentana(v)).toBeNull()
  })
})
