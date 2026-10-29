// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { seleccionDe, seleccionVacia } from '../editor/seleccion'
import { documentoVacio } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import type { FaseSim } from '../sim/control'
import { accionableSeleccionado, anuncioDeFase, CUADROS_TRAS_CAMBIO, LecturaPorCuadro, leeCadaCiclo, leeTrasCambio, MENSAJE_DETENER_PARA_EDITAR, textoModo } from './vistaPrevia'

const lib = libreriaDePrueba().piezas

describe('lectura tras un cambio en caliente', () => {
  it('sigue leyendo cuadro a cuadro también en pausa (el worker da un paso corto y hay que leerlo) y se acaba al detener', () => {
    const lee = (['detenida', 'arrancando', 'corriendo', 'pausada'] as FaseSim[]).filter(leeTrasCambio)
    expect(lee).toEqual(['arrancando', 'corriendo', 'pausada'])
    // En pausa la lectura de 10 Hz no corre: sin esto un fusible repuesto en pausa se quedaría en rojo.
    expect(leeCadaCiclo('pausada')).toBe(false)
  })
})

describe('lectura periódica', () => {
  it('lee mientras arranca o corre, y no en pausa ni detenida', () => {
    const lee = (['detenida', 'arrancando', 'corriendo', 'pausada'] as FaseSim[]).filter(leeCadaCiclo)
    expect(lee).toEqual(['arrancando', 'corriendo'])
  })
})

describe('lectura en cada cuadro tras un cambio en caliente', () => {
  it('lee CUADROS_TRAS_CAMBIO cuadros seguidos; otro cambio a medio camino reinicia la cuenta sin arrancar otro ciclo', () => {
    const l = new LecturaPorCuadro()
    const contar = () => {
      let n = 0
      while (l.cuadro(true)) n++
      return n
    }
    expect(l.pedir()).toBe(true)
    expect(contar()).toBe(CUADROS_TRAS_CAMBIO)
    expect(l.pedir()).toBe(true)
    l.cuadro(true)
    l.cuadro(true)
    expect(l.pedir()).toBe(false)
    expect(contar()).toBe(CUADROS_TRAS_CAMBIO)
  })

  it('al detenerse la vista previa deja de leer', () => {
    const l = new LecturaPorCuadro()
    l.pedir()
    expect(l.cuadro(false)).toBe(false)
    expect(l.restantes).toBe(0)
    expect(l.pedir()).toBe(true)
  })
})

describe('anuncio de la fase', () => {
  const recorrer = (fases: FaseSim[]) => {
    let estable: FaseSim = 'detenida'
    const dichos: string[] = []
    for (const f of fases) {
      const a = anuncioDeFase(estable, f)
      estable = a.estable
      if (a.texto) dichos.push(a.texto)
    }
    return dichos
  }
  it('se dice una vez por cambio: marcha, pausa, reanudar y detener', () => {
    expect(recorrer(['arrancando', 'corriendo', 'pausada', 'corriendo', 'detenida'])).toEqual([
      'Vista previa en marcha.', 'Vista previa en pausa.', 'Vista previa reanudada.', 'Vista previa detenida.'
    ])
  })
  it('accionar un interruptor recarga (arrancando) sin repetir el anuncio, también en pausa', () => {
    expect(recorrer(['arrancando', 'corriendo', 'arrancando', 'corriendo', 'arrancando', 'corriendo'])).toEqual(['Vista previa en marcha.'])
    expect(recorrer(['arrancando', 'corriendo', 'pausada', 'arrancando', 'pausada'])).toEqual(['Vista previa en marcha.', 'Vista previa en pausa.'])
  })
  it('un arranque que falla y vuelve a detenida no anuncia nada', () => {
    expect(recorrer(['arrancando', 'detenida'])).toEqual([])
  })
})

describe('interruptor o botón seleccionado', () => {
  const doc = () => {
    const d = documentoVacio()
    d.piezas.s = { id: 's', tipo: 'interruptor', ref: 'S1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
    d.piezas.b = { id: 'b', tipo: 'boton', ref: 'SW1', x: 10, y: 0, rot: 0, espejo: false, props: {} }
    d.piezas.r = { id: 'r', tipo: 'resistencia', ref: 'R1', x: 20, y: 0, rot: 0, espejo: false, props: {} }
    return d
  }
  it('un interruptor se conmuta y un botón se sostiene', () => {
    expect(accionableSeleccionado(doc(), lib, seleccionDe('piezas', 's'))).toEqual({ id: 's', tipo: 'conmutar' })
    expect(accionableSeleccionado(doc(), lib, seleccionDe('piezas', 'b'))).toEqual({ id: 'b', tipo: 'sostener' })
  })
  it('otra pieza, varias cosas o nada no se accionan', () => {
    expect(accionableSeleccionado(doc(), lib, seleccionDe('piezas', 'r'))).toBeNull()
    expect(accionableSeleccionado(doc(), lib, seleccionVacia())).toBeNull()
    const dos = seleccionDe('piezas', 's')
    dos.piezas.add('b')
    expect(accionableSeleccionado(doc(), lib, dos)).toBeNull()
    const conCable = seleccionDe('piezas', 's')
    conCable.cables.add('c')
    expect(accionableSeleccionado(doc(), lib, conCable)).toBeNull()
    expect(accionableSeleccionado(doc(), lib, seleccionDe('piezas', 'fantasma'))).toBeNull()
    expect(accionableSeleccionado(doc(), lib, seleccionDe('piezas', '__proto__'))).toBeNull()
  })
})

describe('avisos de edición bloqueada', () => {
  it('el aviso de edición bloqueada no lleva guiones largos', () => {
    expect(MENSAJE_DETENER_PARA_EDITAR).toBe('Detén la vista previa para modificar piezas y cables. Los valores sí se ajustan mientras corre.')
  })

  it('el inspector no lleva párrafo de edición bloqueada: lo que no se edita se ve deshabilitado', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const insp = readFileSync(join(import.meta.dirname, 'Inspector.tsx'), 'utf8')
    expect(insp).not.toContain('sim-aviso')
    expect(insp).not.toContain('MENSAJE_VALOR_EN_CALIENTE')
  })
})

describe('modo en la barra de estado', () => {
  it('Edición con la vista previa detenida, Simulando al arrancar y al correr, En pausa en pausa', () => {
    expect((['detenida', 'arrancando', 'corriendo', 'pausada'] as const).map(textoModo)).toEqual(['Edición', 'Simulando', 'Simulando', 'En pausa'])
  })
})
