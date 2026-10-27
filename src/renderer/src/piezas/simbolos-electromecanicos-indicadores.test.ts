// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { buscar } from '../buscador/buscar'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio } from '../doc/tipos'
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

describe('electromecánicos e indicadores', () => {
  it.each([
    ['rele', 'electromecanicos', 'K', ['A1@-4,-4', 'A2@-4,4', 'NC@0,-4', 'NA@4,-4', 'COM@2,4']],
    ['motor-dc', 'electromecanicos', 'M', ['+@-4,0', '-@4,0']],
    ['motor-pasos-bipolar', 'electromecanicos', 'M', ['A+@-4,-2', 'A-@-4,2', 'B+@4,-2', 'B-@4,2']],
    ['motor-pasos-unipolar', 'electromecanicos', 'M', ['A@-4,-2', "A2@-4,2", 'B@4,-2', 'B2@4,2', 'COM@0,4']],
    ['foco', 'indicadores', 'LP', ['1@-4,0', '2@4,0']],
    ['zumbador', 'indicadores', 'BZ', ['+@-2,2', '-@2,2']],
    ['display-7seg', 'indicadores', 'DS', ['a@-6,-8', 'b@-6,-6', 'c@-6,-4', 'd@-6,-2', 'e@-6,0', 'f@-6,2', 'g@-6,4', 'dp@-6,6', 'COM@6,0']]
  ] as const)('%s: categoría %s, prefijo %s y pines', (id, categoria, prefijo, esperados) => {
    const def = lib.get(id)
    expect(def, id).toBeDefined()
    expect(def).toMatchObject({ categoria, prefijo })
    expect(pines(id)).toEqual(esperados)
  })

  it.each([
    ['rele', 'rele'],
    ['relé', 'rele'],
    ['motor', 'motor-dc'],
    ['nema 17', 'motor-pasos-bipolar'],
    ['17hs4401', 'motor-pasos-bipolar'],
    ['28byj-48', 'motor-pasos-unipolar'],
    ['foco 12', 'foco'],
    ['buzzer', 'zumbador'],
    ['7 segmentos', 'display-7seg']
  ] as const)('el buscador encuentra «%s» primero: %s', (q, id) => {
    expect(primero(q)).toBe(id)
  })

  it('el relé, el motor, el foco, el zumbador y el display simulan', () => {
    const avisos = avisosDe(['rele', 'motor-dc', 'foco', 'zumbador', 'display-7seg'])
    for (let i = 1; i <= 5; i++) expect(avisos).not.toContain(`X${i} todavía no tiene modelo eléctrico.`)
  })

  it('el display elige cátodo o ánodo común y color', () => {
    expect(lib.get('display-7seg')!.props.map((p) => [p.id, p.defecto])).toEqual([['tipo', 'cátodo común'], ['color', 'rojo']])
  })

  /** Puntos «x,y» de cada trazo de la pieza, redondeados a 2 decimales. */
  const trazos = (id: string) =>
    lib.get(id)!.geometria.trazos.map((t) => {
      const a = Array.from(t)
      return Array.from({ length: a.length / 2 }, (_, i) => [+a[2 * i].toFixed(2), +a[2 * i + 1].toFixed(2)] as [number, number])
    })

  it('el foco es el de IEEE 315 (círculo con filamento), no la X de IEC', () => {
    const t = trazos('foco')
    // Ningún segmento diagonal de un lado al otro del círculo (la X de IEC).
    for (const tr of t)
      for (let i = 1; i < tr.length; i++) {
        const dx = Math.abs(tr[i][0] - tr[i - 1][0]), dy = Math.abs(tr[i][1] - tr[i - 1][1])
        const largo = Math.hypot(dx, dy)
        expect(largo > 2.5 && dx > 1 && dy > 1, 'diagonal larga').toBe(false)
      }
    // El filamento es un arco (Ω) dentro del círculo, unido a los dos terminales; no la onda «~» de la fuente AC.
    const fil = t.find((tr) => tr.length > 8 && (tr[0][0] !== tr.at(-1)![0] || tr[0][1] !== tr.at(-1)![1]) && tr.some(([, y]) => y < -0.5))
    expect(fil, 'filamento').toBeDefined()
    expect(fil![0]).toEqual([-0.9, 0])
    expect(fil!.at(-1)).toEqual([0.9, 0])
    expect(fil!.every(([, y]) => y <= 0), 'sin cruzar el eje como una senoide').toBe(true)
  })

  it('relé: la cuchilla llega a la punta del contacto normalmente cerrado y el enlace punteado la toca', () => {
    const t = trazos('rele')
    // Del común sube hasta (2, 1) y de ahí la cuchilla es la capa de su estado: en reposo al normalmente cerrado y
    // operado al normalmente abierto.
    expect(t.find((tr) => tr.some(([x, y]) => x === 2 && y === 4))!.at(-1)).toEqual([2, 1])
    const capa = (n: string) => lib.get('rele')!.geometria.capas![n].trazos.map((tr) => Array.from({ length: tr.length / 2 }, (_, i) => [+tr[2 * i].toFixed(2), +tr[2 * i + 1].toFixed(2)]))
    expect(capa('estado-operado')).toEqual([[[2, 1], [4, -1.2]]])
    const cuchilla = capa('estado-reposo')[0] as [number, number][]
    expect(cuchilla).toEqual([[2, 1], [0, -1.2]])
    expect(t.some((tr) => tr.some(([x, y]) => x === 0 && y === -4) && tr.some(([x, y]) => x === 0 && y === -1.2))).toBe(true)
    // El último trazo punteado termina sobre la cuchilla (entre (2, 1) y (0, -1.2)).
    const [x0, y0] = cuchilla.at(-2)!, [x1, y1] = cuchilla.at(-1)!
    const punteado = t.filter((tr) => tr.length === 2 && tr[0][1] === 0 && tr[1][1] === 0).sort((a, b) => b[1][0] - a[1][0])[0]
    const [px, py] = punteado[1]
    const xCuchilla = x0 + ((py - y0) / (y1 - y0)) * (x1 - x0)
    expect(Math.abs(px - xCuchilla)).toBeLessThan(0.05)
  })

  it('relé: la bobina es el inductor de IEEE 315 (arcos), no el rectángulo de IEC', () => {
    const arcos = trazos('rele').filter((tr) => tr.length > 6 && tr.every(([x]) => x >= -4.05 && x <= -3.1))
    expect(arcos).toHaveLength(1)
  })

  it('motor y zumbador llevan la marca «+» (dos trazos que se cruzan) junto a su pin «+», fuera del cuerpo', () => {
    for (const id of ['motor-dc', 'zumbador']) {
      const def = lib.get(id)!
      const mas = def.pines.find((p) => p.id === '+')!
      const t = trazos(id)
      // Los dos trazos de la cruz: uno horizontal y otro vertical de 0.8 de largo, con el mismo centro.
      const rectos = t.filter((tr) => tr.length === 2 && Math.hypot(tr[1][0] - tr[0][0], tr[1][1] - tr[0][1]) < 1)
      const horiz = rectos.find((tr) => tr[0][1] === tr[1][1])
      const vert = rectos.find((tr) => tr[0][0] === tr[1][0])
      expect(horiz, `${id}: trazo horizontal`).toBeDefined()
      expect(vert, `${id}: trazo vertical`).toBeDefined()
      const c = [(horiz![0][0] + horiz![1][0]) / 2, (vert![0][1] + vert![1][1]) / 2]
      expect(vert![0][0]).toBeCloseTo(c[0], 5)
      // Cerca del pin «+» (a menos de 2.5 unidades), del lado exterior del símbolo.
      expect(Math.hypot(c[0] - mas.x, c[1] - mas.y), `${id}: distancia al pin +`).toBeLessThan(2.5)
      expect(c[0], `${id}: a la izquierda del símbolo`).toBeLessThan(-2.5)
    }
  })
})
