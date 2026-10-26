// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { exportarSpice } from '../../../compartido/spice/exportar'
import { armarMazo, validarPeticion } from '../../../compartido/spice/mazo'
import { calcularConexiones } from '../conexiones/conexiones'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { compilarNetlist } from './netlist'

// El exportador cubre las piezas de la librería. Cada pieza se arma con todos sus pines en redes propias, cada
// red con una resistencia a tierra (para que ningún instrumento quede «suelto»), se compila con `compilarNetlist` y se exporta;
// además se prueba cada opción de cada propiedad de lista (modelos, familias, formas de onda).

const lib = libreriaDePrueba().piezas
const LINEA_SEGURA = /^[a-z0-9_ .+\-*/()[\]{}=,%:^"<>!#@$]*$/
const DIRECTIVAS = /^\.(model|subckt|ends|param)\b/

function armar(tipo: string, props: Record<string, string>, ref = 'U1'): Parte[] {
  const def = lib.get(tipo)!
  const pines = Object.fromEntries(def.pines.map((p) => [p.id, tipo === 'tierra' ? '0' : `r_${p.id}`]))
  const resistencias = tipo === 'tierra' ? [] : def.pines.map((p, i): Parte => ({ tipo: 'resistencia', ref: `R${i + 1}`, props: { valor: '1k' }, pines: { '1': `r_${p.id}`, '2': '0' } }))
  return [{ tipo, ref, props, pines }, ...resistencias]
}

/** Las combinaciones que se prueban de una pieza: la de omisión y cada opción de cada propiedad de lista (una a la vez). */
function variantes(tipo: string): Record<string, string>[] {
  const def = lib.get(tipo)!
  const out: Record<string, string>[] = [{}]
  for (const p of def.props) for (const o of p.opciones ?? []) if (o !== p.defecto) out.push({ [p.id]: o })
  return out
}

function revisar(cuerpo: string): void {
  for (const l of cuerpo.split('\n')) {
    expect(l).toMatch(LINEA_SEGURA)
    // Un renglón que empieza con punto es un modelo, un subcircuito o un parámetro de un subcircuito; nada más.
    if (l.startsWith('.')) expect(l).toMatch(DIRECTIVAS)
  }
}

describe('el exportador cubre las 58 piezas de la librería', () => {
  const tipos = [...lib.keys()].sort()

  it('la librería tiene las 58 piezas', () => {
    expect(tipos).toHaveLength(58)
  })

  it.each(tipos)('%s', (tipo) => {
    let exportadas = 0
    for (const props of variantes(tipo)) {
      const d = conEtiquetas(lib, armar(tipo, props))
      const con = calcularConexiones(d, lib)
      const r = compilarNetlist(d, lib, con)
      // Una combinación que la netlist rechaza (una familia con una alimentación fuera de su intervalo) no se exporta.
      if (!r.netlist || r.errores.length > 0) continue
      const nombresElementos = r.piezaDeElemento.map((id) => d.piezas[id]?.ref ?? '?')
      const nombresNodos = new Map<number, string>()
      for (const [red, nodo] of r.nodoDeRed) nombresNodos.set(nodo, con.redes[red]?.nombre ?? '?')
      const e = exportarSpice(r.netlist, { nombresElementos, nombresNodos })
      revisar(e.cuerpo)
      // Y con un análisis encima, el mazo completo.
      const m = armarMazo(validarPeticion({ netlist: r.netlist, analisis: { tipo: 'tran', paso: 1e-6, fin: 1e-3 } }))
      expect(m.texto).toContain('.end\n')
      exportadas++
    }
    if (tipo !== 'tierra') expect(exportadas).toBeGreaterThan(0)
  })
})

describe('el texto del usuario no llega al mazo', () => {
  it('referencias, valores y nombres de red con órdenes de SPICE', () => {
    const feo = '.include C:\\Windows\\win.ini'
    const partes: Parte[] = [
      { tipo: 'fuente-dc', ref: 'V1\n.control\nshell calc\n.endc', props: { voltaje: '5' }, pines: { '+': `r"${feo}`, '-': '0' } },
      { tipo: 'resistencia', ref: `R1 ${feo}`, props: { valor: '1k' }, pines: { '1': `r"${feo}`, '2': 'x\n.end' } },
      { tipo: 'resistencia', ref: 'R2', props: { valor: '2k' }, pines: { '1': 'x\n.end', '2': '0' } },
      { tipo: 'diodo', ref: 'D1; rm -rf', pines: { A: 'x\n.end', K: '0' } }
    ]
    const d = conEtiquetas(lib, partes)
    const con = calcularConexiones(d, lib)
    const r = compilarNetlist(d, lib, con)
    expect(r.netlist).not.toBeNull()
    const nombresElementos = r.piezaDeElemento.map((id) => d.piezas[id]?.ref ?? '?')
    const nombresNodos = new Map<number, string>()
    for (const [red, nodo] of r.nodoDeRed) nombresNodos.set(nodo, con.redes[red]?.nombre ?? '?')
    const m = armarMazo(validarPeticion({ netlist: r.netlist, analisis: { tipo: 'op' } }), { nombresElementos, nombresNodos })
    for (const prohibido of ['include', 'shell', 'win.ini', 'calc', 'rm -rf', 'x\n']) expect(m.texto).not.toContain(prohibido)
    revisar(m.exportacion.cuerpo)
    // El control es el que arma Kirchi y nada más.
    expect(m.texto.split('\n').filter((l) => l.startsWith('.') && !DIRECTIVAS.test(l))).toEqual([`.options reltol=0.0001 abstol=1e-12 vntol=1e-7`, '.control', '.endc', '.end'])
    // La tabla de vuelta sí conserva los nombres para mostrar el resultado.
    const nombres = [...m.exportacion.tabla.nodos.values()].map((n) => n.nombre)
    expect(nombres.some((n) => n?.includes('.end'))).toBe(true)
  })
})
