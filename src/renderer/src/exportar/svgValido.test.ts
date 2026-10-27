// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { LIMITE_EXPORTAR } from '../../../compartido/archivos'
import { svgValido } from '../../../main/pdf'
import { calcularConexiones } from '../conexiones/conexiones'
import { FUENTES, TINTAS } from '../doc/formato'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { construirEscena } from '../lienzo/escena'
import { hexARgba, PALETA_CLARA, PALETA_OSCURA, type Paleta } from '../lienzo/paleta'
import { libreriaDePrueba } from '../prueba/libreria'
import { cssDeCaras, type CaraFuente } from './fuentes'
import { svgDeEscena } from './svg'

/** El SVG real del exportador (todas las piezas, formatos y rótulos) debe pasar la lista blanca del proceso principal
 * (`svgValido`): si una crece sin la otra, el PDF falla en la aplicación sin que ninguna prueba lo vea. */
const lib = libreriaDePrueba().piezas
const FUENTES_CSS = { interfaz: "'Mona Sans Variable', sans-serif", cifras: "'Geist Mono Variable', monospace", serif: "'Source Serif 4 Variable', serif" }
const CARA: CaraFuente = { familia: 'Mona Sans Variable', estilo: 'normal', peso: '200 900', ancho: '75% 125%', rango: 'U+0000-00FF, U+0131', intervalos: [[0, 255]], url: '/m.woff2' }
const CSS = cssDeCaras([CARA, { ...CARA, estilo: 'italic', url: '/i.woff2' }, { ...CARA, familia: 'Geist Mono Variable', url: '/g.woff2' }], new Map([['/m.woff2', 'AAECAw=='], ['/i.woff2', 'AAECAw=='], ['/g.woff2', 'AAECAw==']]))

/** Una pieza de cada tipo de la librería, en una rejilla, unidas por cables, con textos de todos los formatos. */
function documentoRico(): Documento {
  const d = documentoVacio()
  const tipos = [...lib.values()].filter((d) => !d.oculta).map((d) => d.id)
  expect(tipos).toHaveLength(102)
  tipos.forEach((tipo, i) => {
    const p: Pieza = { id: `p${i}`, tipo, ref: `X${i + 1}`, x: (i % 7) * 30, y: Math.floor(i / 7) * 30, rot: ([0, 90, 180, 270] as const)[i % 4], espejo: i % 5 === 0, props: {} }
    d.piezas[p.id] = p
  })
  for (let i = 0; i < 6; i++) d.cables[`c${i}`] = { id: `c${i}`, puntos: [{ x: i * 30 + 4, y: -6 }, { x: i * 30 + 12, y: -6 }, { x: i * 30 + 12, y: -12 }, { x: i * 30 + 30, y: -12 }] }
  d.cables.t = { id: 't', puntos: [{ x: 12, y: -12 }, { x: 12, y: -20 }] }
  let n = 0
  for (const fuente of FUENTES)
    for (const tinta of TINTAS) {
      const k = n++
      d.etiquetas[`e${k}`] = { id: `e${k}`, nombre: `VSAL${k}`, x: k * 12, y: 130, rot: ([0, 90, 180, 270] as const)[k % 4], formato: { fuente, tinta, negrita: true, ...(k % 2 === 0 ? { cursiva: true as const } : {}), subrayado: true, tam: 3.5 } }
      d.notas[`n${k}`] = {
        id: `n${k}`, x: k * 14, y: 150, ancho: 24,
        texto: `Práctica <${k}> & más: 4.7 kΩ, 10 µF "comillas" 'simples'. Un renglón largo que se reparte en varios.`,
        formato: { fuente, tinta, negrita: true, cursiva: true as const, subrayado: true, tam: 2.5, alinear: (['centro', 'der', 'just'] as const)[k % 3] }
      }
    }
  return d
}

describe('el SVG real del exportador pasa la lista blanca de main/pdf.ts', () => {
  for (const [nombre, paleta, rejilla] of [['claro con rejilla', PALETA_CLARA, true], ['oscuro sin rejilla', PALETA_OSCURA, false]] as [string, Paleta, boolean][])
    it(`documento rico, ${nombre}`, () => {
      const d = documentoRico()
      const esc = construirEscena(d, lib, calcularConexiones(d, lib), paleta)
      expect(esc.textos.length).toBeGreaterThan(30)
      const l = svgDeEscena(esc, { paleta, fondo: hexARgba('#F7F6F2'), rejilla, fuentes: FUENTES_CSS, base: () => 0.25, css: CSS, titulo: 'práctica <3> & "más".kir' })!
      expect(l.svg).toContain('@font-face')
      expect(l.svg).toContain('<text ')
      expect(svgValido(l.svg, LIMITE_EXPORTAR)).toBe(true)
    })

  it('sin css y sin textos (el del PNG) también', () => {
    const d = documentoRico()
    const esc = construirEscena(d, lib, calcularConexiones(d, lib), PALETA_CLARA)
    const l = svgDeEscena(esc, { paleta: PALETA_CLARA, fondo: null, rejilla: true, fuentes: FUENTES_CSS, base: () => 0.25, sinTextos: true })!
    expect(svgValido(l.svg, LIMITE_EXPORTAR)).toBe(true)
  })
})
