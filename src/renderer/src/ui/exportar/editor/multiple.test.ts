import { describe, expect, it } from 'vitest'
import { anotacionesVacias } from '../../../../../compartido/grafica/anotaciones'
import { agregarEtiqueta, agregarFlecha, agregarTexto, cambiarTraza, editarEtiqueta, editarFlecha, editarTexto, estiloEje, estiloTitulo, type EstadoEditor } from './edicion'
import { propagar, sumarAlGrupo, todosLosElegidos } from './multiple'
import type { Seleccion } from './objetos'

const vacio = (): EstadoEditor => ({ anot: anotacionesVacias(), aspecto: {} as EstadoEditor['aspecto'], trazas: {}, ocultas: [], adornos: {} as EstadoEditor['adornos'], rango: null })
const clave = (id: string) => id.split('#')[0]
const t = (id: string): Seleccion => ({ tipo: 'texto', id })

/** Tres textos: t1, t2 y t3. */
function tresTextos(): EstadoEditor {
  let e = vacio()
  for (let i = 0; i < 3; i++) e = agregarTexto(e, 0.1 * (i + 1), 0.2, `Texto ${i + 1}`)!.estado
  return e
}

describe('elegir varios con Mayús o Ctrl y clic', () => {
  it('sin nada elegido, el clic aditivo elige uno solo', () => {
    expect(sumarAlGrupo({ sel: null, extras: [] }, t('t1'))).toEqual({ sel: t('t1'), extras: [] })
  })

  it('suma los del mismo tipo y los quita al repetirlos', () => {
    let g = sumarAlGrupo({ sel: t('t1'), extras: [] }, t('t2'))
    expect(g).toEqual({ sel: t('t1'), extras: [t('t2')] })
    g = sumarAlGrupo(g, t('t3'))
    expect(todosLosElegidos(g)).toEqual([t('t1'), t('t2'), t('t3')])
    g = sumarAlGrupo(g, t('t2'))
    expect(g).toEqual({ sel: t('t1'), extras: [t('t3')] })
  })

  it('repetir el principal pasa el siguiente a principal; con uno solo no cambia nada', () => {
    expect(sumarAlGrupo({ sel: t('t1'), extras: [t('t2'), t('t3')] }, t('t1'))).toEqual({ sel: t('t2'), extras: [t('t3')] })
    const solo = { sel: t('t1'), extras: [] }
    expect(sumarAlGrupo(solo, t('t1'))).toBe(solo)
  })

  it('un objeto de otro tipo empieza un grupo nuevo: no se mezclan tipos', () => {
    const g = sumarAlGrupo({ sel: t('t1'), extras: [t('t2')] }, { tipo: 'flecha', id: 'f1' })
    expect(g).toEqual({ sel: { tipo: 'flecha', id: 'f1' }, extras: [] })
  })
})

describe('cambiar varios a la vez', () => {
  it('un cambio de tamaño, negrita y color del texto principal llega a los demás; su texto y su posición no', () => {
    const antes = tresTextos()
    const despues = editarTexto(editarTexto(editarTexto(antes, 't1', { tam: 20 }), 't1', { negrita: true }), 't1', { tono: 'naranja' })
    const r = propagar(antes, despues, t('t1'), [t('t2'), t('t3')], clave)
    for (const id of ['t1', 't2', 't3']) {
      const n = r.anot.textos.find((x) => x.id === id)!
      expect(n, id).toMatchObject({ tam: 20, negrita: true, tono: 'naranja' })
    }
    expect(r.anot.textos.map((x) => x.texto)).toEqual(['Texto 1', 'Texto 2', 'Texto 3'])
    expect(r.anot.textos.map((x) => x.fx)).toEqual([0.1, 0.2, 0.3])
  })

  it('cambiar el texto o moverlo solo afecta al principal', () => {
    const antes = tresTextos()
    const despues = editarTexto(antes, 't1', { texto: 'Otro', fx: 0.9 })
    expect(propagar(antes, despues, t('t1'), [t('t2')], clave)).toBe(despues)
  })

  it('sin grupo o con un cambio que no se comparte devuelve el estado tal cual', () => {
    const antes = tresTextos()
    const despues = editarTexto(antes, 't1', { tam: 18 })
    expect(propagar(antes, despues, t('t1'), [], clave)).toBe(despues)
    expect(propagar(antes, antes, t('t1'), [t('t2')], clave)).toBe(antes)
    expect(propagar(antes, despues, null, [t('t2')], clave)).toBe(despues)
  })

  it('no toca a los de otro tipo que estuvieran en la lista de extras', () => {
    const antes = tresTextos()
    const despues = editarTexto(antes, 't1', { tam: 22 })
    const r = propagar(antes, despues, t('t1'), [{ tipo: 'flecha', id: 'f1' }], clave)
    expect(r).toBe(despues)
  })

  it('las flechas comparten grosor y color, no sus extremos', () => {
    let e = vacio()
    e = agregarFlecha(e, 0.1, 0.1, 0.4, 0.4)!.estado
    e = agregarFlecha(e, 0.5, 0.5, 0.8, 0.9)!.estado
    const despues = editarFlecha(editarFlecha(e, 'f1', { grosor: 4 }), 'f1', { tono: 'canal-b', x2: 0.3 })
    const r = propagar(e, despues, { tipo: 'flecha', id: 'f1' }, [{ tipo: 'flecha', id: 'f2' }], clave)
    const f2 = r.anot.flechas.find((f) => f.id === 'f2')!
    expect(f2).toMatchObject({ grosor: 4, tono: 'canal-b', x1: 0.5, y1: 0.5, x2: 0.8, y2: 0.9 })
  })

  it('las etiquetas de valor comparten el color y conservan su traza y su posición', () => {
    let e = vacio()
    e = agregarEtiqueta(e, 'A', 0.001)!.estado
    e = agregarEtiqueta(e, 'B', 0.002)!.estado
    const despues = editarEtiqueta(e, 'e1', { tono: 'naranja', dx: 99 })
    const r = propagar(e, despues, { tipo: 'etiqueta', id: 'e1' }, [{ tipo: 'etiqueta', id: 'e2' }], clave)
    expect(r.anot.etiquetas.find((q) => q.id === 'e2')).toMatchObject({ tono: 'naranja', traza: 'B', x: 0.002 })
    expect(r.anot.etiquetas.find((q) => q.id === 'e2')!.dx).not.toBe(99)
  })

  it('el título y el subtítulo comparten el estilo; quitar un campo lo quita en ambos', () => {
    let e = estiloTitulo(vacio(), 'titulo', { tam: 24, negrita: true })
    e = estiloTitulo(e, 'subtitulo', { tam: 12 })
    const despues = estiloTitulo(e, 'titulo', { tam: 30 })
    const r = propagar(e, despues, { tipo: 'fijo', id: 'titulo' }, [{ tipo: 'fijo', id: 'subtitulo' }], clave)
    expect(r.anot.estilos.subtitulo).toMatchObject({ tam: 30 })
    const sin = propagar(despues, estiloTitulo(despues, 'titulo', { tam: null }), { tipo: 'fijo', id: 'titulo' }, [{ tipo: 'fijo', id: 'subtitulo' }], clave)
    expect(sin.anot.estilos.subtitulo?.tam).toBeUndefined()
  })

  it('dos trazas comparten color, grosor, eje y decimales', () => {
    const antes = vacio()
    const despues = cambiarTraza(cambiarTraza(antes, 'A', { color: 'naranja' }), 'A', { grosor: 3, lado: 'derecha' })
    const r = propagar(antes, despues, { tipo: 'traza', id: 'A' }, [{ tipo: 'traza', id: 'B#°' }], clave)
    expect(r.trazas.B).toMatchObject({ color: 'naranja', grosor: 3, lado: 'derecha' })
    expect(r.trazas.A).toMatchObject({ color: 'naranja', grosor: 3 })
  })

  it('las dos trazas de un Bode igualan color, grosor y eje aunque el principal ya los tuviera', () => {
    const quitaUnidad = (id: string) => (id.includes('#') ? id.slice(0, id.lastIndexOf('#')) : id)
    // V(Salida) ya era naranja, con grosor 3 y a la derecha; V(Entrada) no.
    const antes = cambiarTraza(vacio(), 'V(Salida)', { color: 'naranja', grosor: 3, lado: 'derecha' })
    const sel = { tipo: 'traza' as const, id: 'V(Salida)' }
    const otras = [{ tipo: 'traza' as const, id: 'V(Entrada)#°' }]
    for (const campo of ['color', 'grosor', 'lado'] as const) {
      const despues = cambiarTraza(antes, 'V(Salida)', { [campo]: antes.trazas['V(Salida)'][campo] })
      const r = propagar(antes, despues, sel, otras, quitaUnidad, [campo])
      expect(r.trazas['V(Entrada)']?.[campo]).toBe(antes.trazas['V(Salida)'][campo])
    }
  })

  it('dos ejes comparten tono, grosor del texto, tamaño y línea, pero no el título', () => {
    const antes = vacio()
    const despues = estiloEje(estiloEje(antes, 'A', { tam: 14, grosor: 2 }), 'A', { titulo: 'Solo A', tono: 'gris' })
    const r = propagar(antes, despues, { tipo: 'eje', id: 'eje:A' }, [{ tipo: 'eje', id: 'eje:B' }], clave)
    expect(r.anot.ejes.B).toEqual({ tam: 14, grosor: 2, tono: 'gris' })
    expect(r.anot.ejes.A.titulo).toBe('Solo A')
  })

  it('no modifica el estado de entrada', () => {
    const antes = tresTextos()
    const despues = editarTexto(antes, 't1', { tam: 20 })
    const copia = structuredClone(despues)
    propagar(antes, despues, t('t1'), [t('t2')], clave)
    expect(despues).toEqual(copia)
  })
})
