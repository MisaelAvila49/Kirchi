// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { buscar } from '../buscador/buscar'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio } from '../doc/tipos'
import { textoDeValor } from '../lienzo/etiquetas'
import { libreriaDePrueba } from '../prueba/libreria'
import { avisosDelCircuito } from '../ui/proyecto'

const lib = libreriaDePrueba().piezas
/** «id@x,y» de cada pin, en orden. */
const pines = (id: string) => lib.get(id)!.pines.map((p) => `${p.id}@${p.x},${p.y}`)
const primero = (q: string) => buscar(q, lib)[0]?.def.id
/** Avisos de un esquema con una pieza de cada tipo, separadas 30 unidades. */
function avisosDe(tipos: string[]): string[] {
  const d = documentoVacio()
  tipos.forEach((tipo, i) => (d.piezas[`p${i}`] = { id: `p${i}`, tipo, ref: `X${i + 1}`, x: i * 30, y: 0, rot: 0, espejo: false, props: {} }))
  return avisosDelCircuito(d, calcularConexiones(d, lib), lib).map((a) => a.texto)
}

describe('pasivos y fuentes nuevos', () => {
  it.each([
    ['potenciometro', 'pasivos', 'RV', ['1@-4,0', '2@4,0', '3@0,-4']],
    ['fusible', 'pasivos', 'F', ['1@-4,0', '2@4,0']],
    ['fuente-ac', 'fuentes', 'V', ['+@0,-4', '-@0,4']],
    ['fuente-pulso', 'fuentes', 'V', ['+@0,-4', '-@0,4']],
    ['fuente-corriente', 'fuentes', 'I', ['entrada@0,4', 'salida@0,-4']],
    ['fuente-vcvs', 'fuentes', 'E', ['+@0,-4', '-@0,4', 'C+@-4,-2', 'C-@-4,2']],
    ['fuente-vccs', 'fuentes', 'G', ['+@0,-4', '-@0,4', 'C+@-4,-2', 'C-@-4,2']],
    ['fuente-ccvs', 'fuentes', 'H', ['+@0,-4', '-@0,4', 'C+@-4,-2', 'C-@-4,2']],
    ['fuente-cccs', 'fuentes', 'F', ['+@0,-4', '-@0,4', 'C+@-4,-2', 'C-@-4,2']],
    ['fuente-pwl', 'fuentes', 'V', ['+@0,-4', '-@0,4']]
  ] as const)('%s: categoría %s, prefijo %s y pines', (id, categoria, prefijo, esperados) => {
    const def = lib.get(id)
    expect(def, id).toBeDefined()
    expect(def).toMatchObject({ categoria, prefijo })
    expect(pines(id)).toEqual(esperados)
  })

  it.each([
    ['pot', 'potenciometro'],
    ['fusible', 'fusible'],
    ['fuente ac 12', 'fuente-ac'],
    ['pulso', 'fuente-pulso'],
    ['i 10m', 'fuente-corriente'],
    ['fuente vcvs', 'fuente-vcvs'],
    ['transconductor', 'fuente-vccs'],
    ['fuente ccvs', 'fuente-ccvs'],
    ['fuente cccs', 'fuente-cccs'],
    ['pwl', 'fuente-pwl']
  ] as const)('el buscador encuentra «%s» primero: %s', (q, id) => {
    expect(primero(q)).toBe(id)
  })

  it('fuente de corriente: la punta de la flecha apunta al pin «salida»', () => {
    const def = lib.get('fuente-corriente')!
    const pin = (id: string) => def.pines.find((p) => p.id === id)!
    // Sobre el eje (x = 0) y dentro del círculo, el punto más alto es la punta de la flecha.
    const ys = def.geometria.trazos.flatMap((t) => Array.from(t).filter((_, i) => i % 2 === 1 && Math.abs(t[i - 1]) < 1e-6)).filter((y) => Math.abs(y) < 1.5)
    const puntaY = Math.min(...ys)
    expect(puntaY).toBeCloseTo(-1.1)
    expect(Math.sign(pin('salida').y)).toBe(Math.sign(puntaY))
    expect(Math.sign(pin('entrada').y)).toBe(-Math.sign(puntaY))
  })

  it('fuente AC: la amplitud es de pico y 180 V cubre los 127 V eficaces', () => {
    const amp = lib.get('fuente-ac')!.props.find((p) => p.id === 'amplitud')!
    expect(amp.nombre).toBe('Amplitud (pico)')
    expect(amp.comunes).toContain('180')
    expect(amp.comunes).not.toContain('127')
    expect(127 * Math.SQRT2).toBeCloseTo(179.6, 1)
  })

  it('la fuente DC dibuja el «+» con trazos (se ve a cualquier zoom y se lee igual girado) y deja el «−» como rótulo', () => {
    const def = lib.get('fuente-dc')!
    // Dos trazos cortos que se cruzan, dentro del círculo y del lado del pin «+».
    const cortos = def.geometria.trazos.filter((t) => t.length === 4 && Math.hypot(t[2] - t[0], t[3] - t[1]) < 1)
    const horiz = cortos.find((t) => t[1] === t[3])
    const vert = cortos.find((t) => t[0] === t[2])
    expect(horiz).toBeDefined()
    expect(vert).toBeDefined()
    expect((horiz![0] + horiz![2]) / 2).toBeCloseTo(vert![0], 6)
    expect((vert![1] + vert![3]) / 2).toBeLessThan(0)
    expect(horiz![1]).toBeGreaterThan(-1.8)
    expect(def.rotulos?.map((r) => r.texto)).toEqual(['−'])
  })

  it('el fusible y el inductor simulan', () => {
    expect(avisosDe(['fusible', 'inductor']).some((t) => t.includes('modelo eléctrico'))).toBe(false)
  })

  it('el potenciómetro y la fuente de corriente tienen modelo', () => {
    expect(lib.get('potenciometro')!.modelo).toEqual({ tipo: 'pot', a: '1', b: '2', c: '3', prop: 'valor', posicion: 'posicion', ley: 'ley' })
    expect(lib.get('fuente-corriente')!.modelo).toEqual({ tipo: 'I', a: 'entrada', b: 'salida', prop: 'corriente' })
    expect(avisosDe(['potenciometro', 'fuente-corriente']).some((t) => t.includes('modelo eléctrico'))).toBe(false)
  })

  it('las fuentes AC y de pulso tienen modelo', () => {
    expect(lib.get('fuente-ac')!.modelo).toEqual({ tipo: 'senoidal', a: '+', b: '-', amplitud: 'amplitud', frecuencia: 'frecuencia' })
    expect(lib.get('fuente-pulso')!.modelo).toEqual({ tipo: 'pulso', a: '+', b: '-', alto: 'alto', frecuencia: 'frecuencia', ciclo: 'ciclo', ancho: 'ancho', subida: 'subida', bajada: 'bajada', retardo: 'retardo' })
    expect(avisosDe(['fuente-ac', 'fuente-pulso']).some((t) => t.includes('modelo eléctrico'))).toBe(false)
  })

  it('el valor que se muestra en el lienzo es el de la primera propiedad numérica', () => {
    const pieza = (tipo: string) => ({ id: 'p', tipo, ref: 'X1', x: 0, y: 0, rot: 0, espejo: false, props: {} }) as const
    const valor = (tipo: string) => textoDeValor(pieza(tipo), lib.get(tipo)!)
    expect(valor('potenciometro')).toBe('10 kΩ · 50 %')
    expect(valor('fuente-ac')).toBe('5 V')
    expect(valor('fuente-corriente')).toBe('1 mA')
    expect(valor('fusible')).toBe('1 A')
    // El orden de las propiedades decide qué se muestra; la frecuencia queda en segundo lugar.
    expect(lib.get('potenciometro')!.props.map((p) => p.id)).toEqual(['valor', 'posicion', 'ley', 'junto'])
    expect(lib.get('fuente-ac')!.props.map((p) => [p.id, p.unidad])).toEqual([['amplitud', 'V'], ['frecuencia', 'Hz']])
    expect(lib.get('fuente-pulso')!.props.find((p) => p.id === 'ciclo')!.opciones).toContain('50 %')
  })
})
