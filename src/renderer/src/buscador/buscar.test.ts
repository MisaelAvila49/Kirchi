// @vitest-environment happy-dom
import { modeloDe, nombreConModelo } from '../editor/colocar'
import { describe, expect, it } from 'vitest'
import { libreriaDePrueba } from '../prueba/libreria'
import { buscar, interpretar } from './buscar'

const lib = libreriaDePrueba().piezas
const ids = (q: string, recientes: string[] = []) => buscar(q, lib, recientes).map((r) => r.def.id)
const primero = (q: string) => buscar(q, lib)[0]

describe('interpretar', () => {
  it('separa el término del valor solo si el resto es un valor', () => {
    expect(interpretar('  r   4k7 ')).toEqual({ termino: 'r', valor: '4k7' })
    expect(interpretar('fuente 5 V')).toEqual({ termino: 'fuente', valor: '5 V' })
    expect(interpretar('diodo emisor')).toEqual({ termino: 'diodo emisor' })
    expect(interpretar('r')).toEqual({ termino: 'r' })
  })
})

describe('buscar', () => {
  it('«osci» propone el osciloscopio antes que el cristal (su nombre empieza así; el cristal solo lo trae como sinónimo de oscilador)', () => {
    expect(primero('osci').def.id).toBe('osciloscopio')
    expect(primero('oscil').def.id).toBe('osciloscopio')
    // Un sinónimo sigue valiendo: «oscilador» llega al cristal y «xtal» también.
    expect(ids('oscilador')).toContain('cristal')
    expect(primero('xtal').def.id).toBe('cristal')
  })

  it('«r 4k7» propone la resistencia de 4.7 kΩ', () => {
    expect(primero('r 4k7')).toMatchObject({ def: { id: 'resistencia' }, valor: '4k7' })
  })

  it('el término exacto gana', () => {
    expect(ids('r')[0]).toBe('resistencia')
    // Con una letra solo cuentan los textos que empiezan con ella: «r» no trae la batería ni el interruptor.
    expect(ids('r')).not.toContain('bateria')
    expect(ids('r')).not.toContain('interruptor')
    expect(primero('g').def.id).toBe('tierra')
    expect(primero('c 100n')).toMatchObject({ def: { id: 'capacitor' }, valor: '100n' })
    expect(primero('v 5')).toMatchObject({ def: { id: 'fuente-dc' }, valor: '5' })
  })

  it('no distingue acentos ni mayúsculas', () => {
    expect(primero('batería').def.id).toBe('bateria')
    expect(primero('BATERIA').def.id).toBe('bateria')
    expect(primero('botón').def.id).toBe('boton')
  })

  it('no propone valor a piezas sin propiedad numérica ni con otra unidad', () => {
    expect(primero('led 1k')).toMatchObject({ def: { id: 'led' } })
    expect(primero('led 1k').valor).toBeUndefined()
    expect(primero('r 5V').valor).toBeUndefined()
  })

  it('varias palabras que no son valor se buscan juntas', () => {
    expect(ids('diodo emisor')).toEqual(['led'])
  })

  it('«fuente dc» y «fuente dc 5» encuentran la fuente, con el valor al final', () => {
    expect(ids('fuente dc')).toEqual(['fuente-dc'])
    expect(primero('fuente dc 5')).toMatchObject({ def: { id: 'fuente-dc' }, valor: '5' })
    expect(primero('Fuente  DC 12 V')).toMatchObject({ def: { id: 'fuente-dc' }, valor: '12 V' })
    expect(interpretar('fuente dc 5')).toEqual({ termino: 'fuente dc', valor: '5' })
  })

  it('todas las palabras tienen que coincidir, también con las opciones de las propiedades', () => {
    expect(ids('led rojo')).toEqual(['led'])
    expect(ids('resistencia rojo')).toEqual([])
    expect(ids('diodo zzz')).toEqual([])
  })

  const alfabetico = () => [...lib.values()].filter((d) => !d.oculta).sort((a, b) => a.nombre.es.localeCompare(b.nombre.es, 'es')).map((d) => d.id)

  it('sin consulta salen todas en orden alfabético', () => {
    expect(ids('')).toEqual(alfabetico())
    expect(ids('')).toEqual(expect.arrayContaining(['bateria', 'boton', 'capacitor', 'diodo', 'fuente-dc', 'inductor', 'interruptor', 'led', 'resistencia', 'tierra']))
  })

  it('las recientes van primero', () => {
    expect(ids('', ['led', 'capacitor']).slice(0, 3)).toEqual(['led', 'capacitor', alfabetico().filter((id) => id !== 'led' && id !== 'capacitor')[0]])
  })

  it('sin coincidencias la lista queda vacía', () => {
    expect(ids('zzz')).toEqual([])
  })
})

describe('búsqueda de modelos por prefijo', () => {
  const modelos = (q: string) => buscar(q, lib).filter((r) => r.valor).map((r) => `${r.def.id}:${r.valor}`)
  it('«TL» propone TL081 y todos los modelos que empiezan con esas letras', () => {
    const m = modelos('TL')
    expect(m).toContain('amp-op:TL081')
    expect(m).toContain('amp-op:TLV9002')
    expect(m.every((x) => /:TL/i.test(x))).toBe(true)
  })
  it('no distingue mayúsculas ni acentos y ordena por nombre', () => {
    expect(modelos('tl')).toEqual(modelos('TL'))
    expect(modelos('tl')).toEqual([...modelos('tl')].sort())
  })
  it('un modelo escrito entero va primero y es el único de su pieza', () => {
    const r = buscar('tl081', lib)
    expect(r[0]).toMatchObject({ def: { id: 'amp-op' }, valor: 'TL081' })
    expect(r.filter((x) => x.def.id === 'amp-op')).toHaveLength(1)
  })
  it('también en transistores y MOSFET, y con una sola letra no se inunda', () => {
    expect(modelos('tip')).toEqual(expect.arrayContaining(['npn:TIP31', 'npn:TIP120', 'pnp:TIP32']))
    expect(modelos('irf')).toEqual(expect.arrayContaining(['mosfet-n:IRF540N', 'mosfet-p:IRF4905']))
    expect(modelos('t')).toEqual([])
  })
  it('el prefijo gana a una coincidencia por nombre de pieza y no duplica la pieza', () => {
    const r = buscar('bc', lib)
    expect(r.filter((x) => x.def.id === 'npn').map((x) => x.valor)).toEqual(['BC337', 'BC547'])
  })
})

describe('modelo a la vista', () => {
  it('un modelo escrito entero se propone como valor y se coloca', () => {
    expect(primero('tl081')).toMatchObject({ def: { id: 'amp-op' }, valor: 'TL081' })
    expect(primero('bc547')).toMatchObject({ def: { id: 'npn' }, valor: 'BC547' })
  })
  it('sin modelo escrito no hay valor: se muestra el de omisión', () => {
    expect(primero('transistor npn').valor).toBeUndefined()
    expect(modeloDe(primero('npn').def)).toBe('2N2222')
    expect(modeloDe(lib.get('resistencia')!)).toBeUndefined()
  })
  it('nombreConModelo une el nombre y el modelo', () => {
    expect(nombreConModelo(lib.get('amp-op')!, 'TL081')).toBe('Amp. operacional · TL081')
    expect(nombreConModelo(lib.get('npn')!)).toBe('Transistor NPN · 2N2222')
    expect(nombreConModelo(lib.get('resistencia')!)).toBe(lib.get('resistencia')!.nombre.es)
  })
})

describe('buscar: la mejor coincidencia primero', () => {
  it('«led» da el LED primero y sin las coincidencias por subcadena', () => {
    const r = ids('led')
    expect(r[0]).toBe('led')
    expect(r).not.toContain('fuente-cccs')
  })
  it('consultas reales', () => {
    expect(ids('res')[0]).toBe('resistencia')
    expect(ids('555')[0]).toBe('temporizador-555')
    expect(ids('555')).not.toContain('npn')
    expect(ids('74595')).toEqual(['registro-595'])
    expect(ids('fuente')[0]).toBe('fuente-dc')
    expect(ids('nand')[0]).toBe('nand')
    expect(ids('capacitor')[0]).toBe('capacitor')
    expect(ids('LÉD')[0]).toBe('led')
  })
})

describe('Librería con filtro', () => {
  it('la categoría de la mejor coincidencia va primero', async () => {
    const { catalogo } = await import('../ui/catalogo')
    const c = catalogo(lib, 'led')
    expect(c[0].piezas[0].def.id).toBe('led')
    expect(c.flatMap((x) => x.piezas.map((p) => p.def.id))).not.toContain('fuente-cccs')
  })
})
