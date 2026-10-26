import { documentoVacio, type Documento, type Figura, type FormatoTexto, type Nota, type Pieza, type Punto, type Rotacion } from '../doc/tipos'
import { anchoNotaAuto } from '../lienzo/medidas'

const pieza = (id: string, tipo: string, ref: string, x: number, y: number, props: Record<string, string> = {}, rot: Rotacion = 0): Pieza => ({
  id, tipo, ref, x, y, rot, espejo: false, props
})
const nota = (id: string, x: number, y: number, texto: string, formato?: FormatoTexto): Nota => ({ id, x, y, ancho: anchoNotaAuto(texto, formato), texto, ...(formato ? { formato } : {}) })

/** Práctica 4 · Amplificador inversor: LM741 con R1 = R2 = 1 kΩ (ganancia −1), Vin de 5 V en la tabla de rieles y ±15 V
 * por nombre, así Vout es −5 V. Con título, dos marcos, una flecha a R2 con la ganancia y una elipse de aviso en la
 * salida. Lo escribe `prueba/ejemplos.test.ts` (`KIRCHI_EJEMPLO=<ruta>`). */
export function amplificadorInversor(): Documento {
  const d = documentoVacio()
  for (const p of [
    pieza('p_u1', 'amp-op', 'U1', 40, 20, { modelo: 'LM741' }),
    pieza('p_r1', 'resistencia', 'R1', 22, 18, { valor: '1k' }),
    pieza('p_r2', 'resistencia', 'R2', 40, 0, { valor: '1k' }),
    pieza('p_vin', 'alimentacion', 'PWR1', 12, 14, { nombre: 'Vin' }),
    pieza('p_vcc', 'alimentacion', 'PWR2', 40, 12, { nombre: '+15V' }),
    pieza('p_vee', 'alimentacion', 'PWR3', 40, 28, { nombre: '-15V' }, 180),
    pieza('p_gnd', 'tierra', 'GND1', 32, 28)
  ])
    d.piezas[p.id] = p
  const cables: [string, ...Punto[]][] = [
    ['c_vin', { x: 12, y: 14 }, { x: 12, y: 18 }, { x: 18, y: 18 }],
    ['c_r1', { x: 26, y: 18 }, { x: 30, y: 18 }],
    ['c_menos', { x: 30, y: 18 }, { x: 34, y: 18 }],
    ['c_r2a', { x: 30, y: 18 }, { x: 30, y: 0 }, { x: 36, y: 0 }],
    ['c_r2b', { x: 44, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 20 }],
    ['c_sal', { x: 46, y: 20 }, { x: 50, y: 20 }],
    ['c_vout', { x: 50, y: 20 }, { x: 54, y: 20 }],
    ['c_mas', { x: 34, y: 22 }, { x: 32, y: 22 }, { x: 32, y: 28 }],
    ['c_vcc', { x: 40, y: 12 }, { x: 40, y: 16 }],
    ['c_vee', { x: 40, y: 24 }, { x: 40, y: 28 }]
  ]
  for (const [id, ...puntos] of cables) d.cables[id] = { id, puntos }
  d.etiquetas.e_vout = { id: 'e_vout', nombre: 'Vout', x: 54, y: 20, rot: 0 }
  d.alimentaciones = { a_vin: { id: 'a_vin', nombre: 'Vin', voltaje: '5' } }
  for (const n of [
    // Sin caja: la línea del título y los marcos ya separan el dibujo.
    nota('n_titulo', 6, -16, 'Práctica 4 · Amplificador inversor', { tam: 3.5, negrita: true, contorno: 'ninguno' }),
    nota('n_entrada', 5, 22, 'Entrada', { tinta: 'gris', contorno: 'ninguno' }),
    nota('n_amp', 29, 37, 'Amplificador inversor', { tinta: 'verde', contorno: 'ninguno' }),
    nota('n_ganancia', 63, -9, 'Ganancia: −R2 / R1 = −1', { contorno: 'ninguno' }),
    nota('n_aviso', 54, 26, 'Revisar que no se sature', { tinta: 'rojo', contorno: 'ninguno' })
  ])
    d.notas[n.id] = n
  const figuras: Figura[] = [
    { id: 'f_titulo', tipo: 'linea', x1: 6, y1: -10, x2: 62, y2: -10, orden: 0, grosor: 0.5 },
    { id: 'f_entrada', tipo: 'rectangulo', x1: 4, y1: 4, x2: 26, y2: 26, orden: 1, trazo: 'guiones' },
    { id: 'f_amp', tipo: 'rectangulo', x1: 28, y1: -4, x2: 52, y2: 40, orden: 2, tinta: 'verde', grosor: 0.35, relleno: true },
    { id: 'f_flecha', tipo: 'flecha', x1: 62, y1: -6, x2: 46, y2: -1, orden: 3, tinta: 'tinta', grosor: 0.35 },
    { id: 'f_aviso', tipo: 'elipse', x1: 51, y1: 16, x2: 66, y2: 24, orden: 4, tinta: 'rojo', grosor: 0.35, trazo: 'puntos' }
  ]
  d.figuras = Object.fromEntries(figuras.map((f) => [f.id, f]))
  return d
}
