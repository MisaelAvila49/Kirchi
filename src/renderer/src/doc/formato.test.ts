import { describe, expect, it } from 'vitest'
import { formatoCompleto, formatoConCambio, formatoMinimo, leerFormato, leerPx, leerTam, mmAPx, pxAMm, PX_MAX, PX_MIN, nombreContorno, NOMBRE_TINTA, SERIE_TAM, siguienteTam, textoTam } from './formato'

describe('formato de notas y etiquetas', () => {
  it('sin formato: Mona Sans en notas, Geist Mono en etiquetas, 2 mm, tinta y a la izquierda', () => {
    expect(formatoCompleto(undefined, 'nota')).toEqual({ fuente: 'sans', tam: 2, negrita: false, cursiva: false, subrayado: false, tinta: 'tinta', alinear: 'izq', contorno: 'auto' })
    expect(formatoCompleto(undefined, 'etiqueta')).toMatchObject({ fuente: 'mono', tam: 2, alinear: 'izq' })
  })

  it('la tinta «tinta» se rotula «Negro» y el contorno por omisión dice lo que hace según el tipo', () => {
    expect(NOMBRE_TINTA.tinta).toBe('Negro')
    expect(nombreContorno('tinta', 1, 0)).toBe('Negro')
    expect(nombreContorno('auto', 2, 0)).toBe('Predeterminado (gris)')
    expect(nombreContorno('auto', 0, 3)).toBe('Predeterminado (color del cable)')
    expect(nombreContorno('auto', 1, 1)).toBe('Predeterminado')
    expect(nombreContorno('ninguno', 1, 1)).toBe('Sin contorno')
  })

  it('el mínimo omite lo que está por omisión; todo por omisión es undefined', () => {
    expect(formatoMinimo(formatoCompleto(undefined, 'nota'), 'nota')).toBeUndefined()
    expect(formatoMinimo({ ...formatoCompleto(undefined, 'nota'), fuente: 'mono', tam: 3.5, negrita: true }, 'nota')).toEqual({ fuente: 'mono', tam: 3.5, negrita: true })
    // La fuente por omisión depende del tipo: «sans» se guarda en una etiqueta y no en una nota.
    expect(formatoMinimo({ ...formatoCompleto(undefined, 'etiqueta'), fuente: 'sans' }, 'etiqueta')).toEqual({ fuente: 'sans' })
  })

  it('el contorno: «auto» es el de siempre y no se guarda; una tinta o «ninguno» sí, en notas y etiquetas', () => {
    expect(formatoMinimo({ ...formatoCompleto(undefined, 'nota'), contorno: 'auto' }, 'nota')).toBeUndefined()
    expect(formatoConCambio(undefined, { contorno: 'rojo' }, 'nota')).toEqual({ contorno: 'rojo' })
    expect(formatoConCambio(undefined, { contorno: 'ninguno' }, 'etiqueta')).toEqual({ contorno: 'ninguno' })
    expect(formatoConCambio({ contorno: 'azul', negrita: true }, { contorno: 'auto' }, 'nota')).toEqual({ negrita: true })
    expect(formatoConCambio({ contorno: 'azul' }, { contorno: 'auto' }, 'etiqueta')).toBeUndefined()
    expect(leerFormato({ contorno: 'verde' }, 'etiqueta', 'de la etiqueta X')).toEqual({ formato: { contorno: 'verde' }, avisos: [] })
    expect(leerFormato({ contorno: 'ninguno' }, 'nota', 'de la nota')).toEqual({ formato: { contorno: 'ninguno' }, avisos: [] })
    // «auto» no es un valor de archivo: es la ausencia del campo.
    for (const malo of ['auto', 'morado', 3, null, true]) {
      expect(leerFormato({ contorno: malo, negrita: true }, 'nota', 'de la nota')).toEqual({
        formato: { negrita: true },
        avisos: [`Se descartó el contorno «${String(malo)}» de la nota.`]
      })
    }
    expect(leerFormato({ contorno: '__proto__' }, 'nota', 'de la nota').formato).toBeUndefined()
  })

  it('un cambio se aplica sobre el formato; las etiquetas no se alinean; quitar la negrita la borra', () => {
    expect(formatoConCambio(undefined, { negrita: true, alinear: 'centro' }, 'nota')).toEqual({ negrita: true, alinear: 'centro' })
    expect(formatoConCambio(undefined, { alinear: 'centro' }, 'etiqueta')).toBeUndefined()
    expect(formatoConCambio({ negrita: true, tinta: 'rojo' }, { negrita: false }, 'nota')).toEqual({ tinta: 'rojo' })
    expect(formatoConCambio({ tam: 5 }, { tam: 2 }, 'nota')).toBeUndefined()
    expect(formatoConCambio(undefined, { tam: 3.46 }, 'nota')).toEqual({ tam: 3.5 })
  })

  it('un cambio de tamaño se ajusta a 1-20 mm y se ignora si no es un número', () => {
    expect(formatoConCambio(undefined, { tam: 40 }, 'nota')).toEqual({ tam: 20 })
    expect(formatoConCambio(undefined, { tam: 0.2 }, 'nota')).toEqual({ tam: 1 })
    expect(formatoConCambio(undefined, { tam: -3 }, 'etiqueta')).toEqual({ tam: 1 })
    expect(formatoConCambio({ tam: 5 }, { tam: NaN }, 'nota')).toEqual({ tam: 5 })
    expect(formatoConCambio({ tam: 5 }, { tam: Infinity }, 'nota')).toEqual({ tam: 5 })
    expect(formatoConCambio(undefined, { tam: NaN, negrita: true }, 'nota')).toEqual({ negrita: true })
  })

  it('el campo de tamaño acepta mm con un decimal y rechaza lo que no cabe en 1 a 20 mm', () => {
    expect(leerTam('3.5')).toEqual({ tam: 3.5 })
    expect(leerTam(' 12 mm ')).toEqual({ tam: 12 })
    expect(leerTam('2.25')).toEqual({ tam: 2.3 })
    expect(leerTam('0.5')).toEqual({ error: 'El tamaño mínimo es 1 mm.' })
    expect(leerTam('25')).toEqual({ error: 'El tamaño máximo es 20 mm.' })
    expect(leerTam('3,5')).toEqual({ error: 'Escribe el tamaño en mm, por ejemplo 3.5.' })
    expect(leerTam('')).toEqual({ error: 'Escribe el tamaño en mm, por ejemplo 3.5.' })
  })

  it('siguiente tamaño de la serie ISO 3098, mayor o menor', () => {
    expect(SERIE_TAM).toEqual([1.8, 2.5, 3.5, 5, 7, 10])
    expect(siguienteTam(2, 1)).toBe(2.5)
    expect(siguienteTam(2, -1)).toBe(1.8)
    expect(siguienteTam(3.5, 1)).toBe(5)
    expect(siguienteTam(10, 1)).toBe(10)
    expect(siguienteTam(1.8, -1)).toBe(1.8)
    expect(siguienteTam(15, -1)).toBe(10)
    expect(textoTam(3.5)).toBe('3.5 mm')
    expect(textoTam(10)).toBe('10 mm')
  })

  it('leer del archivo: lo válido se queda, lo demás se descarta con su aviso', () => {
    expect(leerFormato(undefined, 'nota', 'de la nota')).toEqual({ avisos: [] })
    expect(leerFormato({ fuente: 'serif', tam: 7, subrayado: true, tinta: 'verde', alinear: 'der' }, 'nota', 'de la nota')).toEqual({
      formato: { fuente: 'serif', tam: 7, subrayado: true, tinta: 'verde', alinear: 'der' },
      avisos: []
    })
    expect(leerFormato({ tam: 40 }, 'nota', 'de la nota').avisos).toEqual(['Se descartó el tamaño 40 mm de la nota: el máximo es 20 mm.'])
    expect(leerFormato({ tam: 0.5, negrita: false, cursiva: 'sí' }, 'nota', 'de la nota').avisos).toEqual([
      'Se descartó el tamaño 0.5 mm de la nota: el mínimo es 1 mm.',
      'Se descartó «negrita» de la nota: solo admite true.',
      'Se descartó «cursiva» de la nota: solo admite true.'
    ])
    expect(leerFormato('grande', 'etiqueta', 'de la etiqueta A')).toEqual({ avisos: ['Se descartó el formato de la etiqueta A: no es una lista de propiedades.'] })
    expect(leerFormato({ tam: 'tres' }, 'nota', 'de la nota').avisos).toEqual(['Se descartó el tamaño «tres» de la nota: no es un número.'])
  })
})

describe('tamaño en px (8 a 48, de 1 en 1)', () => {
  it('el rango y la conversión: 8 px es el tamaño por omisión y no se guarda', () => {
    expect([PX_MIN, PX_MAX]).toEqual([8, 48])
    expect(pxAMm(8)).toBe(2)
    expect(mmAPx(2)).toBe(8)
    expect(pxAMm(48)).toBe(12.7)
    expect(formatoConCambio(undefined, { tam: pxAMm(8) }, 'nota')).toBeUndefined()
    expect(formatoConCambio(undefined, { tam: pxAMm(12) }, 'etiqueta')).toEqual({ tam: 3.2 })
  })

  it('cada px entero se distingue y regresa a sí mismo', () => {
    for (let px = PX_MIN; px <= PX_MAX; px++) expect(mmAPx(pxAMm(px))).toBe(px)
  })

  it('el campo acepta enteros de 8 a 48, con o sin «px», y rechaza lo demás', () => {
    expect(leerPx('16')).toEqual({ px: 16 })
    expect(leerPx(' 24 px ')).toEqual({ px: 24 })
    for (const mal of ['7', '49', '12.5', 'a', '']) expect('error' in leerPx(mal)).toBe(true)
  })

  it('un .kir sin px no cambia: el formato guarda solo mm', () => {
    expect(leerFormato({ tam: 3.5, negrita: true }, 'nota', 'de la nota').formato).toEqual({ tam: 3.5, negrita: true })
  })
})
