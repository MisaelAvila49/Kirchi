// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { avisosDelCircuito } from '../ui/proyecto'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { compilarNetlist } from './netlist'
import { avisosDeMultimetros } from './multimetros'

const lib = libreriaDePrueba().piezas
const fuente: Parte = { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } }
const R = (ref: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor: '1k' }, pines: { '1': a, '2': b } })
const mm = (modo: string, mas: string, com: string): Parte => ({ tipo: 'multimetro', ref: 'XMM1', props: { modo }, pines: { '+': mas, COM: com } })
const avisos = (partes: Parte[]) => {
  const d = conEtiquetas(lib, partes)
  return avisosDeMultimetros(d, lib, calcularConexiones(d, lib)).map((a) => a.texto)
}

describe('multímetro mal conectado', () => {
  it('un amperímetro entre dos nodos con varias piezas avisa que va en serie', () => {
    const t = avisos([fuente, R('R1', 'a', 'b'), R('R2', 'a', 'b'), R('R3', 'b', '0'), R('R4', 'b', '0'), mm('A DC', 'a', 'b')])
    expect(t).toHaveLength(1)
    expect(t[0]).toContain('el amperímetro va en serie')
  })

  it('un amperímetro en serie no avisa', () => {
    expect(avisos([fuente, R('R1', 'a', 'b'), R('R2', 'c', '0'), mm('A DC', 'b', 'c')])).toEqual([])
  })

  it('un voltímetro en serie con una resistencia avisa que va en paralelo', () => {
    const t = avisos([fuente, R('R1', 'a', 'b'), R('R2', 'c', '0'), mm('V DC', 'b', 'c')])
    expect(t[0]).toContain('el voltímetro va en paralelo')
  })

  it('un voltímetro en paralelo con una pieza, o directo sobre una fuente, no avisa', () => {
    expect(avisos([fuente, R('R1', 'a', 'b'), R('R2', 'b', '0'), mm('V DC', 'b', '0')])).toEqual([])
    expect(avisos([fuente, R('R1', 'a', 'b'), R('R2', 'b', '0'), mm('V DC', 'a', 'b')])).toEqual([])
    expect(avisos([fuente, R('R1', 'a', '0'), mm('V DC', 'a', '0')])).toEqual([])
  })

  it('el aviso llega al panel Proyecto (leve) y al Registro (avisos de la netlist)', () => {
    const d = conEtiquetas(lib, [fuente, R('R1', 'a', 'b'), R('R2', 'c', '0'), mm('V DC', 'b', 'c')])
    const con = calcularConexiones(d, lib)
    expect(avisosDelCircuito(d, con, lib).some((a) => a.leve && a.texto.includes('voltímetro va en paralelo'))).toBe(true)
    expect(compilarNetlist(d, lib, con).avisos.some((t) => t.includes('voltímetro va en paralelo'))).toBe(true)
  })
})
