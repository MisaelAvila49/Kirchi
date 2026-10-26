import { describe, expect, it } from 'vitest'
import { CARPETA_POR_OMISION, etiquetasMicrofonos, nombreDeArchivo, nombreDeCarpeta, textoGuardada, TEXTO_TAMAÑO_POR_MINUTO } from './textos'

describe('textos de la grabación', () => {
  it('la carpeta por omisión es Videos › Kirchi y una elegida se nombra por su último tramo', () => {
    expect(nombreDeCarpeta(undefined)).toBe(CARPETA_POR_OMISION)
    expect(nombreDeCarpeta('C:\\Users\\ana\\Clases\\Kirchi')).toBe('Kirchi')
    expect(nombreDeCarpeta('/home/ana/videos/')).toBe('videos')
    expect(textoGuardada(undefined)).toBe('Grabación guardada en Videos › Kirchi')
    expect(textoGuardada('D:\\Clases')).toBe('Grabación guardada en Clases')
  })

  it('el nombre de un archivo sale de su ruta', () => {
    expect(nombreDeArchivo('C:\\Videos\\Kirchi\\divisor 2026.webm')).toBe('divisor 2026.webm')
    expect(nombreDeArchivo('/a/b.webm')).toBe('b.webm')
  })

  it('solo los micrófonos con identificador; sin etiqueta (permiso aún no dado) se numeran', () => {
    const r = etiquetasMicrofonos([
      { kind: 'videoinput', deviceId: 'c1', label: 'Cámara' },
      { kind: 'audioinput', deviceId: 'a1', label: '' },
      { kind: 'audiooutput', deviceId: 'o1', label: 'Bocinas' },
      { kind: 'audioinput', deviceId: 'a2', label: 'Diadema USB' },
      { kind: 'audioinput', deviceId: '', label: 'Sin id' },
      { kind: 'audioinput', deviceId: 'a3', label: '   ' }
    ])
    expect(r).toEqual([
      { id: 'a1', etiqueta: 'Micrófono 1' },
      { id: 'a2', etiqueta: 'Diadema USB' },
      { id: 'a3', etiqueta: 'Micrófono 3' }
    ])
  })

  it('el texto del tamaño por minuto es una sola constante (la tarea 21 la reemplaza por la cifra medida)', () => {
    expect(TEXTO_TAMAÑO_POR_MINUTO).toMatch(/minuto/)
  })
})
