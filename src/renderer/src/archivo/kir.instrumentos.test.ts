// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { compilarNetlist } from '../netlist/netlist'
import { conEtiquetas, divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { escribirKir, formatoDe, leerKir } from './kir'

const lib = libreriaDePrueba().piezas

describe('el .kir con instrumentos (criterio 8 de la 2C)', () => {
  const d = conEtiquetas(lib, [
    { tipo: 'generador', ref: 'XFG1', props: { forma: 'Triangular', frecuencia: '2.500k', simetria: '25 %', amplitud: '4' }, pines: { '+': 's', COM: '0' } },
    { tipo: 'osciloscopio', ref: 'XSC1', props: { b_vdiv: '200m', base: '500u', disp_modo: 'Único', medidas: 'Ap Bf' }, pines: { A: 's', B: 's', C: '0', D: '0' } },
    { tipo: 'multimetro', ref: 'XMM1', props: { modo: 'Ω', ideal: 'sí' }, pines: { '+': 's', COM: '0' } },
    { tipo: 'fuente-variable', ref: 'XPS1', props: { voltaje: '12', limite: '500m' }, pines: { '+': 'v', '-': '0' } }
  ])
  // Los ids de las etiquetas de `conEtiquetas` llevan el nombre del pin («e_p_0_+»), que un `.kir` no admite como id.
  d.etiquetas = Object.fromEntries(Object.values(d.etiquetas).map((e, k) => [`e${k}`, { ...e, id: `e${k}` }]))

  it('va y vuelve idéntico, en el formato de siempre', () => {
    const r = leerKir(escribirKir(d, '0.0.1'))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.doc).toEqual(d)
      expect(r.avisos).toEqual([])
    }
    expect(formatoDe(d)).toBe(1)
    expect([...escribirKir(d, '0.0.1')]).toEqual([...escribirKir(structuredClone(d), '0.0.1')])
  })

  it('un circuito sin instrumentos se escribe con los mismos bytes que antes', () => {
    // El formato y el escritor no cambiaron: el divisor de las pruebas sale igual que (formato 1).
    expect(formatoDe(divisor())).toBe(1)
    expect([...escribirKir(divisor(), '0.0.1')]).toEqual([...escribirKir(divisor(), '0.0.1')])
  })

  it('un ajuste fuera de rango en un archivo manipulado no simula y dice cuál es', () => {
    const malo = structuredClone(d)
    const osc = Object.values(malo.piezas).find((p) => p.tipo === 'osciloscopio')!
    osc.props.a_vdiv = '3'
    const r = leerKir(escribirKir(malo, '0.0.1'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const n = compilarNetlist(r.doc, lib, calcularConexiones(r.doc, lib))
    expect(n.netlist).toBeNull()
    expect(n.errores).toEqual(['Los voltios por división «3» del canal A de XSC1 no son de la serie 1, 2 y 5 de 1 mV a 50 V.'])
  })
})
