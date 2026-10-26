// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { vistaInspector } from '../ui/vistaInspector'
import { seleccionDe } from '../editor/seleccion'
import { nombresDeRedes } from '../ui/redes'
import { escribirKir, formatoDe, leerKir } from './kir'

const lib = libreriaDePrueba().piezas

describe('la 2D no cambia el formato del .kir', () => {
  it('una resistencia de un archivo anterior abre con 0.25 W y se guarda con los mismos bytes si no se edita', () => {
    const d = divisor()
    expect(Object.values(d.piezas).some((p) => p.tipo === 'resistencia' && p.props.potencia === undefined)).toBe(true)
    const bytes = escribirKir(d, '0.2.0')
    const l = leerKir(bytes)
    if (!l.ok) throw new Error(l.error)
    expect(formatoDe(l.doc)).toBe(formatoDe(d))
    expect(escribirKir(l.doc, '0.2.0')).toEqual(bytes)
    const con = calcularConexiones(l.doc, lib)
    const v = vistaInspector(l.doc, lib, con, seleccionDe('piezas', 'p_r1'), nombresDeRedes(l.doc, con))
    expect(v.tipo === 'pieza' && v.props.find((p) => p.id === 'potencia')?.texto).toBe('0.25 W')
  })
})
