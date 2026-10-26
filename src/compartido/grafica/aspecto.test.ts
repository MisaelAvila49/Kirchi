import { describe, expect, it } from 'vitest'
import { ASPECTO_ANALISIS, ASPECTO_INFORME, escalaDeTexto, ASPECTO_OSCILOSCOPIO, aspectoDeGrafica, escribirAspecto, graficaDeAspecto, GROSOR_RANGO, leerAspecto, trazasDeGrafica, validarGrafica } from './aspecto'

describe('aspecto de la gráfica en texto (osciloscopio)', () => {
  it('el texto vacío es el aspecto por omisión, sin cambiar nada', () => {
    const r = leerAspecto('', ASPECTO_OSCILOSCOPIO)
    expect(r.aspecto).toEqual(ASPECTO_OSCILOSCOPIO)
    expect(r.trazas).toEqual({})
    expect(escribirAspecto(r.aspecto, r.trazas, ASPECTO_OSCILOSCOPIO)).toBe('')
  })
  it('lee y escribe de ida y vuelta solo lo que difiere', () => {
    const texto = 'tema=oscuro grosor=2.5 rejilla=no marcas=no tiempo=abajo A=derecha/negro B=centro'
    const r = leerAspecto(texto, ASPECTO_OSCILOSCOPIO)
    expect(r.aspecto).toEqual({ ...ASPECTO_OSCILOSCOPIO, tema: 'oscuro', grosor: 2.5, rejilla: false, marcas: false, ejeX: 'abajo' })
    expect(r.trazas).toEqual({ A: { lado: 'derecha', color: 'negro' }, B: { lado: 'centro', color: null } })
    expect(escribirAspecto(r.aspecto, r.trazas, ASPECTO_OSCILOSCOPIO)).toBe(texto)
  })
  it('ignora lo desconocido, lo fuera de rango y los nombres raros', () => {
    const r = leerAspecto('grosor=99 tema=rosa marcas=quizá __proto__=izquierda/negro Z=derecha A=arriba/rojo tiempo=fuera', ASPECTO_OSCILOSCOPIO)
    expect(r.aspecto).toEqual(ASPECTO_OSCILOSCOPIO)
    expect(r.trazas).toEqual({ Z: { lado: 'derecha', color: null } })
    expect(Object.getPrototypeOf(r.trazas)).toBe(null)
  })
  it('el grosor se acota al intervalo', () => {
    expect(leerAspecto('grosor=0.2', ASPECTO_OSCILOSCOPIO).aspecto.grosor).toBe(ASPECTO_OSCILOSCOPIO.grosor)
    expect(leerAspecto(`grosor=${GROSOR_RANGO[1]}`, ASPECTO_OSCILOSCOPIO).aspecto.grosor).toBe(GROSOR_RANGO[1])
  })
})

describe('tamaño del texto de los ejes', () => {
  it('va y vuelve en el texto del osciloscopio y se acota de 9 a 24 px', () => {
    const r = leerAspecto('tam=16', ASPECTO_OSCILOSCOPIO)
    expect(r.aspecto.textoTam).toBe(16)
    expect(escribirAspecto(r.aspecto, r.trazas, ASPECTO_OSCILOSCOPIO)).toBe('tam=16')
    expect(leerAspecto('tam=8', ASPECTO_OSCILOSCOPIO).aspecto.textoTam).toBe(null)
    expect(leerAspecto('tam=25', ASPECTO_OSCILOSCOPIO).aspecto.textoTam).toBe(null)
    expect(leerAspecto('tam=11.5', ASPECTO_OSCILOSCOPIO).aspecto.textoTam).toBe(null)
    expect(leerAspecto('tam=24', ASPECTO_OSCILOSCOPIO).aspecto.textoTam).toBe(24)
  })
  it('en el documento de un análisis se guarda y se valida', () => {
    expect(validarGrafica({ textoTam: 14 })).toEqual({ ok: true, valor: { textoTam: 14 } })
    expect(validarGrafica({ textoTam: 30 }).ok).toBe(false)
    const a = aspectoDeGrafica({ textoTam: 18 })
    expect(a.textoTam).toBe(18)
    expect(graficaDeAspecto(a, {})).toEqual({ textoTam: 18 })
    expect(aspectoDeGrafica(undefined).textoTam).toBe(null)
  })
  it('la escala del diseño crece con el tamaño y nunca baja de la base', () => {
    expect(escalaDeTexto(null)).toBe(1)
    expect(escalaDeTexto(9)).toBe(1)
    expect(escalaDeTexto(22)).toBe(2)
  })
})

describe('gráfica de un análisis en el documento', () => {
  it('acepta una configuración válida y la devuelve limpia', () => {
    const r = validarGrafica({ tema: 'claro', grosor: 2, rejilla: false, marcas: false, ejeX: 'abajo', trazas: [{ id: 'salida', lado: 'derecha', color: 'negro' }], basura: 1 })
    expect(r).toEqual({ ok: true, valor: { tema: 'claro', grosor: 2, rejilla: false, marcas: false, ejeX: 'abajo', trazas: [{ id: 'salida', lado: 'derecha', color: 'negro' }] } })
  })
  it('lo omitido queda fuera: solo se guarda lo que difiere', () => {
    expect(validarGrafica({})).toEqual({ ok: true, valor: {} })
    expect(validarGrafica({ rejilla: ASPECTO_ANALISIS.rejilla })).toEqual({ ok: true, valor: {} })
  })
  it('rechaza valores de otro tipo, lados o colores que no existen y demasiadas trazas', () => {
    expect(validarGrafica({ tema: 'rosa' }).ok).toBe(false)
    expect(validarGrafica({ grosor: 'gordo' }).ok).toBe(false)
    expect(validarGrafica({ grosor: 40 }).ok).toBe(false)
    expect(validarGrafica({ trazas: [{ id: 'x', lado: 'arriba' }] }).ok).toBe(false)
    expect(validarGrafica({ trazas: [{ id: 'x', color: 'rojo' }] }).ok).toBe(false)
    expect(validarGrafica({ trazas: Array.from({ length: 200 }, (_, i) => ({ id: `t${i}` })) }).ok).toBe(false)
    expect(validarGrafica(null).ok).toBe(false)
  })
  it('un nombre de traza largo se recorta y uno vacío se rechaza', () => {
    const r = validarGrafica({ trazas: [{ id: 'a'.repeat(300), lado: 'centro' }] })
    expect(r.ok && r.valor.trazas?.[0].id.length).toBeLessThanOrEqual(80)
    expect(validarGrafica({ trazas: [{ id: '', lado: 'centro' }] }).ok).toBe(false)
  })
})

describe('aspecto de la gráfica: estilo de ejes, rejilla, lectura y unidades', () => {
  it('el texto de los ejes, su peso, el estilo de rejilla, la lectura y el prefijo del tiempo van y vuelven en el texto del osciloscopio', () => {
    const texto = 'texto=negro peso=negrita estilo=puntos lectura=no ux=m A=derecha/negro A.grosor=3 A.unidad=base B.unidad=m'
    const r = leerAspecto(texto, ASPECTO_OSCILOSCOPIO)
    expect(r.aspecto).toMatchObject({ textoTono: 'negro', textoPeso: 'negrita', rejillaEstilo: 'puntos', lectura: false, prefijoX: 'm' })
    expect(r.trazas.A).toEqual({ lado: 'derecha', color: 'negro', grosor: 3, prefijo: 'base' })
    expect(r.trazas.B).toEqual({ lado: 'izquierda', color: null, prefijo: 'm' })
    expect(escribirAspecto(r.aspecto, r.trazas, ASPECTO_OSCILOSCOPIO)).toBe('texto=negro peso=negrita estilo=puntos lectura=no ux=m A=derecha/negro A.grosor=3 A.unidad=base B.unidad=m')
  })
  it('la rejilla de solo verticales va y vuelve en el texto y en el documento', () => {
    const r = leerAspecto('estilo=vertical', ASPECTO_OSCILOSCOPIO)
    expect(r.aspecto.rejillaEstilo).toBe('vertical')
    expect(escribirAspecto(r.aspecto, r.trazas, ASPECTO_OSCILOSCOPIO)).toBe('estilo=vertical')
    expect(validarGrafica({ rejillaEstilo: 'vertical' })).toEqual({ ok: true, valor: { rejillaEstilo: 'vertical' } })
  })
  it('las subdivisiones de cada eje van y vuelven en el texto y en el documento, y «auto» es lo de omisión', () => {
    const r = leerAspecto('subx=5 suby=2', ASPECTO_OSCILOSCOPIO)
    expect([r.aspecto.subdivisionesX, r.aspecto.subdivisionesY]).toEqual([5, 2])
    expect(escribirAspecto(r.aspecto, r.trazas, ASPECTO_OSCILOSCOPIO)).toBe('subx=5 suby=2')
    expect(leerAspecto('subx=5 subx=auto', ASPECTO_OSCILOSCOPIO).aspecto.subdivisionesX).toBeNull()
    expect(leerAspecto('subx=3 suby=0', ASPECTO_OSCILOSCOPIO).aspecto.subdivisionesX).toBeUndefined()
    const g = graficaDeAspecto(r.aspecto, {})
    expect(g).toEqual({ subdivisionesX: 5, subdivisionesY: 2 })
    expect(validarGrafica(g)).toEqual({ ok: true, valor: g })
    expect(aspectoDeGrafica(g)).toMatchObject({ subdivisionesX: 5, subdivisionesY: 2 })
    expect(escribirAspecto(ASPECTO_OSCILOSCOPIO, {}, ASPECTO_OSCILOSCOPIO)).toBe('')
    expect(validarGrafica({ subdivisionesX: 3 }).ok).toBe(false)
  })
  it('«texto=traza» devuelve el tono de la traza donde la base usa uno fijo', () => {
    const r = leerAspecto('texto=traza', ASPECTO_INFORME)
    expect(r.aspecto.textoTono).toBeNull()
    expect(escribirAspecto(r.aspecto, r.trazas, ASPECTO_INFORME)).toBe('texto=traza')
  })
  it('lo inválido de los campos nuevos se ignora', () => {
    const r = leerAspecto('texto=rosa peso=grueso estilo=rayas lectura=quizá A.grosor=40 A.unidad=T __proto__.grosor=2', ASPECTO_OSCILOSCOPIO)
    expect(r.aspecto).toEqual(ASPECTO_OSCILOSCOPIO)
    expect(r.trazas.A).toBeUndefined()
    expect(Object.getPrototypeOf(r.trazas)).toBe(null)
  })
  it('en el documento solo se guarda lo que difiere y ida y vuelta conserva todo', () => {
    const doc = { textoTono: 'negro', textoPeso: 'medio', rejillaEstilo: 'guiones', lectura: false, prefijoX: 'u', trazas: [{ id: 'V(s)', lado: 'derecha', color: 'naranja', grosor: 3, prefijo: 'm' }] } as const
    const v = validarGrafica(doc)
    expect(v).toEqual({ ok: true, valor: doc })
    if (!v.ok) return
    const a = aspectoDeGrafica(v.valor)
    expect(a).toMatchObject({ textoTono: 'negro', textoPeso: 'medio', rejillaEstilo: 'guiones', lectura: false, prefijoX: 'u' })
    expect(graficaDeAspecto(a, trazasDeGrafica(v.valor))).toEqual(doc)
    expect(validarGrafica({ textoTono: null, textoPeso: 'normal', rejillaEstilo: 'lineas', lectura: true })).toEqual({ ok: true, valor: {} })
  })
  it('el documento rechaza prefijos, pesos y estilos que no existen', () => {
    expect(validarGrafica({ textoPeso: 'fino' }).ok).toBe(false)
    expect(validarGrafica({ rejillaEstilo: 'rayas' }).ok).toBe(false)
    expect(validarGrafica({ prefijoX: 'T' }).ok).toBe(false)
    expect(validarGrafica({ textoTono: 'rojo' }).ok).toBe(false)
    expect(validarGrafica({ trazas: [{ id: 'a', grosor: 99 }] }).ok).toBe(false)
    expect(validarGrafica({ trazas: [{ id: 'a', prefijo: 'T' }] }).ok).toBe(false)
  })
})

describe('Instrumento (de omisión) e Informe (preajuste de exportación)', () => {
  it('el análisis se dibuja como el osciloscopio: eje arriba, cifras del tono de cada traza y sin la marca de informe', () => {
    expect(ASPECTO_ANALISIS).toMatchObject({ ejeX: 'arriba', textoTono: null })
    expect(ASPECTO_ANALISIS.informe).toBeUndefined()
    expect(aspectoDeGrafica(undefined)).toEqual(ASPECTO_ANALISIS)
  })
  it('Informe es el aspecto de antes: eje abajo, letras negras y la marca informe', () => {
    expect(ASPECTO_INFORME).toMatchObject({ ejeX: 'abajo', textoTono: 'negro', informe: true })
  })
  it('la marca informe se guarda con el análisis y vuelve igual; falso no se guarda', () => {
    const v = validarGrafica({ informe: true })
    expect(v).toEqual({ ok: true, valor: { informe: true } })
    if (!v.ok) return
    const a = aspectoDeGrafica(v.valor)
    expect(a.informe).toBe(true)
    expect(graficaDeAspecto(a, {})).toEqual({ informe: true })
    expect(validarGrafica({ informe: false })).toEqual({ ok: true, valor: {} })
    expect(validarGrafica({ informe: 'sí' }).ok).toBe(false)
  })
})

describe('anotaciones guardadas con la gráfica de un análisis', () => {
  const nota = { textos: [{ id: 't1', texto: 'Pico', fx: 0.4, fy: 0.3, tam: 16, negrita: false, tono: 'negro' }], ejes: { x: { titulo: 'Tiempo' } } }
  it('se guardan limpias y vuelven iguales', () => {
    const v = validarGrafica({ anotaciones: { ...nota, flechas: [], etiquetas: [] } })
    expect(v).toEqual({ ok: true, valor: { anotaciones: nota } })
  })
  it('anotaciones vacías no dejan rastro y las malas se rechazan con su motivo', () => {
    expect(validarGrafica({ anotaciones: {} })).toEqual({ ok: true, valor: {} })
    const mal = validarGrafica({ anotaciones: { textos: [{ id: 't1', texto: 'x', fx: 0, fy: 0, tam: 16, negrita: false, tono: 'rojo' }] } })
    expect(mal.ok).toBe(false)
  })
})

describe('decimales de los ejes en el aspecto', () => {
  it('el texto del osciloscopio los escribe y los lee, y sin ellos quedan en la omisión', () => {
    expect(leerAspecto('', ASPECTO_OSCILOSCOPIO).aspecto.decimalesX).toBeUndefined()
    const { aspecto, trazas } = leerAspecto('dx=3 A=izquierda A.dec=auto B.dec=0', ASPECTO_OSCILOSCOPIO)
    expect(aspecto.decimalesX).toBe(3)
    expect(trazas.A.decimales).toBe('auto')
    expect(trazas.B.decimales).toBe(0)
    const t = escribirAspecto(aspecto, trazas, ASPECTO_OSCILOSCOPIO)
    expect(t).toContain('dx=3')
    expect(t).toContain('A.dec=auto')
    expect(leerAspecto(t, ASPECTO_OSCILOSCOPIO)).toEqual({ aspecto, trazas })
  })
  it('lo inválido se ignora', () => {
    const r = leerAspecto('dx=7 A.dec=9 B.dec=x', ASPECTO_OSCILOSCOPIO)
    expect(r.aspecto.decimalesX).toBeUndefined()
    expect(r.trazas.A).toBeUndefined()
  })
  it('un lector viejo ignora las claves nuevas: el texto sin ellas es el de siempre', () => {
    expect(escribirAspecto(ASPECTO_OSCILOSCOPIO, {}, ASPECTO_OSCILOSCOPIO)).toBe('')
  })
  it('la gráfica de un análisis los guarda y los devuelve', () => {
    const doc = { decimalesX: 3, trazas: [{ id: 'I(r1)', lado: 'derecha', decimales: 2 }, { id: 'V(s)', decimales: 'auto' }] } as const
    const v = validarGrafica(doc)
    expect(v.ok && v.valor).toEqual(doc)
    const a = aspectoDeGrafica(doc as never)
    const t = trazasDeGrafica(doc as never)
    expect(a.decimalesX).toBe(3)
    expect(t['V(s)'].decimales).toBe('auto')
    expect(graficaDeAspecto(a, t)).toEqual(doc)
    expect(aspectoDeGrafica(undefined).decimalesX).toBeUndefined()
    expect(validarGrafica({ decimalesX: 5 }).ok).toBe(false)
    expect(validarGrafica({ trazas: [{ id: 'a', decimales: -1 }] }).ok).toBe(false)
  })
})

describe('decimales propios de las etiquetas de valor', () => {
  it('van aparte de los de los ejes en el texto del osciloscopio y en el documento', () => {
    const { aspecto } = leerAspecto('dx=2 de=3', ASPECTO_OSCILOSCOPIO)
    expect(aspecto.decimalesX).toBe(2)
    expect(aspecto.decimalesEtiquetas).toBe(3)
    expect(escribirAspecto(aspecto, {}, ASPECTO_OSCILOSCOPIO)).toContain('de=3')
    expect(leerAspecto('', ASPECTO_OSCILOSCOPIO).aspecto.decimalesEtiquetas).toBeUndefined()
    const g = graficaDeAspecto(aspecto, {})
    expect(aspectoDeGrafica(g).decimalesEtiquetas).toBe(3)
    expect(validarGrafica({ decimalesEtiquetas: 7 }).ok).toBe(false)
  })
})

describe('grosores generales de ejes y rejilla', () => {
  it('se guardan en el texto y en el documento y se validan', () => {
    const { aspecto } = leerAspecto('gej=2 grej=0.5', ASPECTO_OSCILOSCOPIO)
    expect([aspecto.grosorEjes, aspecto.grosorRejilla]).toEqual([2, 0.5])
    expect(escribirAspecto(aspecto, {}, ASPECTO_OSCILOSCOPIO)).toContain('gej=2')
    expect(aspectoDeGrafica(graficaDeAspecto(aspecto, {})).grosorRejilla).toBe(0.5)
    expect(validarGrafica({ grosorEjes: 9 }).ok).toBe(false)
    expect(leerAspecto('gej=9', ASPECTO_OSCILOSCOPIO).aspecto.grosorEjes).toBeUndefined()
  })
})

describe('eje horizontal X-Y guardado con la gráfica', () => {
  it('la traza del eje horizontal se guarda y se lee del documento', () => {
    const g = graficaDeAspecto({ ...ASPECTO_ANALISIS, ejeXTraza: 'V(in)' }, {})
    expect(g.ejeXTraza).toBe('V(in)')
    expect(aspectoDeGrafica(g).ejeXTraza).toBe('V(in)')
    expect(aspectoDeGrafica(undefined).ejeXTraza).toBeUndefined()
    const v = validarGrafica({ ejeXTraza: ' V(out) ' })
    expect(v.ok && v.valor.ejeXTraza).toBe('V(out)')
    expect(validarGrafica({ ejeXTraza: 3 }).ok).toBe(false)
  })
})

describe('rango escrito a mano de los ejes', () => {
  it('se guarda con la gráfica (X y cada eje vertical) y un desde que no es menor que el hasta se rechaza', () => {
    const g = graficaDeAspecto({ ...ASPECTO_ANALISIS, rangoX: { min: -0.01, max: 0.01 } }, { 'V(out)': { lado: 'izquierda', color: null, rango: { min: -0.15, max: 0.15 } } })
    expect(g.rangoX).toEqual({ min: -0.01, max: 0.01 })
    expect(g.trazas).toEqual([{ id: 'V(out)', rango: { min: -0.15, max: 0.15 } }])
    expect(aspectoDeGrafica(g).rangoX).toEqual({ min: -0.01, max: 0.01 })
    expect(trazasDeGrafica(g)['V(out)'].rango).toEqual({ min: -0.15, max: 0.15 })
    expect(validarGrafica(g).ok).toBe(true)
    expect(validarGrafica({ rangoX: { min: 1, max: 1 } }).ok).toBe(false)
    expect(validarGrafica({ trazas: [{ id: 'a', rango: { min: 2, max: 1 } }] }).ok).toBe(false)
  })
})

