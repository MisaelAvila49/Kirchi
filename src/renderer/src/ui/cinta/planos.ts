// Generado con scripts/gen-planos.mjs desde scripts/datos/iconos-color.js. No se edita a mano.
import type { Tono } from '../colores'
import type { NombreIcono } from './trazos'

/** Papel de cada capa de un icono plano: variables de la hoja que `IconoCinta` resuelve, nunca un color escrito. */
export type Papel = 'h' | 'h2' | 'tenue' | 'borde' | 'contra' | 'gris'

/** Una capa de 16 × 16: su trayecto con relleno, con trazo o con los dos. */
export interface Capa {
  d: string
  relleno?: Papel
  trazo?: Papel
  grosor?: number
}

/** Icono plano a varios colores (R1): sus capas y, si cambia, la versión de 14 px sin los detalles que no se leen. */
export interface Plano {
  capas: readonly Capa[]
  chico?: readonly Capa[]
}

export const PLANOS = {
  guardar: {
    capas: [{ d: 'M2.5 3.2c0-.4.3-.7.7-.7h8.1l2.2 2.2v8.1c0 .4-.3.7-.7.7H3.2a.7.7 0 0 1-.7-.7z', relleno: 'h' }, { d: 'M5 2.5h5v3.4H5z', relleno: 'contra' }, { d: 'M8.1 3.2h1.2v2H8.1z', relleno: 'h' }, { d: 'M4.6 9h6.8v4.5H4.6z', relleno: 'contra' }]
  },
  nuevo: {
    capas: [{ d: 'M4 1.8h5.2L12 4.6v9.6H4z', relleno: 'tenue', trazo: 'borde', grosor: 1.2 }, { d: 'M8 7.4v4.4M5.8 9.6h4.4', trazo: 'h', grosor: 1.8 }]
  },
  abrir: {
    capas: [{ d: 'M2 3.4h4.1l1.5 1.5H14v2.3H2z', relleno: 'borde' }, { d: 'M1.4 7.2h13.2l-1.3 6.3H2.7z', relleno: 'h' }]
  },
  guardarComo: {
    capas: [{ d: 'M2 2.8c0-.4.3-.7.7-.7h7l1.9 1.9v3.6L8.4 10.8v2.5H2.7a.7.7 0 0 1-.7-.7z', relleno: 'h' }, { d: 'M4.2 2.1h4.4v3H4.2z', relleno: 'contra' }, { d: 'M4 8.6h4.4v4.7H4z', relleno: 'contra' }, { d: 'M9.4 14.6l.5-2.4 3.9-3.9 1.9 1.9-3.9 3.9z', relleno: 'h2', trazo: 'h2', grosor: 0.4 }],
    chico: [{ d: 'M2 2.8c0-.4.3-.7.7-.7h7l1.9 1.9v3.6L8.4 10.8v2.5H2.7a.7.7 0 0 1-.7-.7z', relleno: 'h' }, { d: 'M4.2 2.1h4.4v3H4.2z', relleno: 'contra' }, { d: 'M9.4 14.6l.5-2.4 3.9-3.9 1.9 1.9-3.9 3.9z', relleno: 'h2', trazo: 'h2', grosor: 0.4 }]
  },
  recientes: {
    capas: [{ d: 'M2 8a6 6 0 1 0 12 0a6 6 0 1 0 -12 0z', relleno: 'h' }, { d: 'M8 4.6V8l2.4 1.6', trazo: 'contra', grosor: 1.6 }]
  },
  exportar: {
    capas: [{ d: 'M13 9.6V13H3V3h3.4', trazo: 'gris', grosor: 1.6 }, { d: 'M9.2 2.6h4.2v4.2M13.2 2.8 7.6 8.4', trazo: 'h', grosor: 1.9 }]
  },
  cortar: {
    capas: [{ d: 'M5.9 9.6 11 2.4M10.1 9.6 5 2.4', trazo: 'gris', grosor: 1.6 }, { d: 'M2.1 11.6a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0 -4.6 0z', relleno: 'h' }, { d: 'M9.3 11.6a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0 -4.6 0z', relleno: 'h' }, { d: 'M3.5 11.6a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0z', relleno: 'contra' }, { d: 'M10.7 11.6a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0z', relleno: 'contra' }],
    chico: [{ d: 'M5.9 9.6 11 2.4M10.1 9.6 5 2.4', trazo: 'gris', grosor: 1.6 }, { d: 'M2.1 11.6a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0 -4.6 0z', relleno: 'h' }, { d: 'M9.3 11.6a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0 -4.6 0z', relleno: 'h' }]
  },
  copiar: {
    capas: [{ d: 'M2.6 1.9h7.3v9.2H2.6z', relleno: 'tenue', trazo: 'borde', grosor: 1.2 }, { d: 'M5.8 5h7.6v9.2H5.8z', relleno: 'h' }, { d: 'M7.8 8h3.6M7.8 10.4h3.6', trazo: 'contra', grosor: 1.2 }],
    chico: [{ d: 'M2.6 1.9h7.3v9.2H2.6z', relleno: 'tenue', trazo: 'borde', grosor: 1.2 }, { d: 'M5.8 5h7.6v9.2H5.8z', relleno: 'h' }]
  },
  pegar: {
    capas: [{ d: 'M3.2 3h9.6v11.3H3.2z', relleno: 'h' }, { d: 'M5 5.6h6v7H5z', relleno: 'contra' }, { d: 'M5.6 1.6h4.8v2.8H5.6z', relleno: 'borde' }]
  },
  duplicar: {
    capas: [{ d: 'M2 2h7.6v7.6H2z', relleno: 'tenue', trazo: 'borde', grosor: 1.2 }, { d: 'M6 6h8v8H6z', relleno: 'h' }, { d: 'M10 8.2v3.6M8.2 10h3.6', trazo: 'contra', grosor: 1.6 }]
  },
  borrar: {
    capas: [{ d: 'M2.6 4.2h10.8', trazo: 'borde', grosor: 1.7 }, { d: 'M6.3 4V2.4h3.4V4', trazo: 'borde', grosor: 1.4 }, { d: 'M3.9 5.4h8.2l-.8 8.8H4.7z', relleno: 'h' }, { d: 'M6.7 7.4v4.6M9.3 7.4v4.6', trazo: 'contra', grosor: 1.2 }],
    chico: [{ d: 'M2.6 4.2h10.8', trazo: 'borde', grosor: 1.7 }, { d: 'M6.3 4V2.4h3.4V4', trazo: 'borde', grosor: 1.4 }, { d: 'M3.9 5.4h8.2l-.8 8.8H4.7z', relleno: 'h' }]
  },
  todo: {
    capas: [{ d: 'M2 4V2h2M6.5 2h3M12 2h2v2M14 6.5v3M14 12v2h-2M9.5 14h-3M4 14H2v-2M2 9.5v-3', trazo: 'borde', grosor: 1.4 }, { d: 'M5 5h6v6H5z', relleno: 'h' }]
  },
  girar: {
    capas: [{ d: 'M5.8 9.6h4.4v4.4H5.8z', relleno: 'gris' }, { d: 'M3 9.2A5 5 0 0 1 12.4 6.4', trazo: 'h', grosor: 1.9 }, { d: 'M14 3.2l-.6 4.4-4.2-1.2z', relleno: 'h' }]
  },
  girarIzq: {
    capas: [{ d: 'M5.8 9.6h4.4v4.4H5.8z', relleno: 'gris' }, { d: 'M13 9.2A5 5 0 0 0 3.6 6.4', trazo: 'h', grosor: 1.9 }, { d: 'M2 3.2l.6 4.4 4.2-1.2z', relleno: 'h' }]
  },
  espejoX: {
    capas: [{ d: 'M8 1.4v13.2', trazo: 'gris', grosor: 1.2 }, { d: 'M6.4 3.4 1.6 12.6h4.8z', relleno: 'h' }, { d: 'M9.6 3.4l4.8 9.2H9.6z', relleno: 'tenue', trazo: 'borde', grosor: 1.2 }]
  },
  espejoY: {
    capas: [{ d: 'M1.4 8h13.2', trazo: 'gris', grosor: 1.2 }, { d: 'M3.4 6.4 12.6 1.6v4.8z', relleno: 'h' }, { d: 'M3.4 9.6l9.2 4.8V9.6z', relleno: 'tenue', trazo: 'borde', grosor: 1.2 }]
  },
  pieza: {
    capas: [{ d: 'M2.2 6.6a4.4 4.4 0 1 0 8.8 0a4.4 4.4 0 1 0 -8.8 0z', relleno: 'tenue', trazo: 'h', grosor: 1.7 }, { d: 'M9.9 9.9 14 14', trazo: 'borde', grosor: 2.4 }]
  },
  buscar: {
    capas: [{ d: 'M2.2 6.6a4.4 4.4 0 1 0 8.8 0a4.4 4.4 0 1 0 -8.8 0z', trazo: 'gris', grosor: 1.7 }, { d: 'M9.9 9.9 14 14', trazo: 'gris', grosor: 2 }]
  },
  etiqueta: {
    capas: [{ d: 'M1.6 4.4h9.2L14.6 8l-3.8 3.6H1.6z', relleno: 'h' }, { d: 'M4.6 8h4', trazo: 'contra', grosor: 1.5 }]
  },
  tierra: {
    capas: [{ d: 'M8 1.6v6.6', trazo: 'h2', grosor: 2 }, { d: 'M2.8 8.4h10.4M5 11h6M7 13.6h2', trazo: 'gris', grosor: 1.9 }]
  },
  alimentacion: {
    capas: [{ d: 'M8 14.6V5.6', trazo: 'h2', grosor: 2 }, { d: 'M8 1.4 12.6 6.8H3.4z', relleno: 'h' }]
  },
  nota: {
    capas: [{ d: 'M2.4 2.4h11.2v7.4l-3.8 3.8H2.4z', relleno: 'h' }, { d: 'M9.8 13.6V9.8h3.8z', relleno: 'borde' }, { d: 'M5 5.4h6M8 5.4v5', trazo: 'contra', grosor: 1.5 }]
  },
  simular: {
    capas: [{ d: 'M4.6 3.2v9.6l7.6-4.8z', relleno: 'h' }]
  },
  pausa: {
    capas: [{ d: 'M4.2 3.2h2.8v9.6H4.2zM9 3.2h2.8v9.6H9z', relleno: 'h' }]
  },
  detener: {
    capas: [{ d: 'M3.8 3.8h8.4v8.4H3.8z', relleno: 'h' }]
  },
  paso: {
    capas: [{ d: 'M3 3.4v9.2l6.4-4.6z', relleno: 'h' }, { d: 'M11 3.4h2.2v9.2H11z', relleno: 'borde' }]
  },
  pasoAtras: {
    capas: [{ d: 'M13 3.4v9.2l-6.4-4.6z', relleno: 'h' }, { d: 'M2.8 3.4H5v9.2H2.8z', relleno: 'borde' }]
  },
  tiempoAvanza: {
    capas: [{ d: 'M2.6 8a5.4 5.4 0 1 0 10.8 0a5.4 5.4 0 1 0 -10.8 0z', trazo: 'gris', grosor: 1.5 }, { d: 'M8 4.8V8l2.6 1.6', trazo: 'h', grosor: 1.9 }]
  },
  hastaT: {
    capas: [{ d: 'M1.8 8h8.4M7.6 4.8 10.8 8l-3.2 3.2', trazo: 'h', grosor: 1.9 }, { d: 'M12.4 3h2v10h-2z', relleno: 'borde' }]
  },
  velocidad: {
    capas: [{ d: 'M2.4 11.6a5.6 5.6 0 1 1 11.2 0', trazo: 'gris', grosor: 1.6 }, { d: 'M8 11.6l3-3.9', trazo: 'h', grosor: 2 }, { d: 'M6.5 11.6a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0z', relleno: 'h' }]
  },
  voltajes: {
    capas: [{ d: 'M1.6 4.2h12.8v7.6H1.6z', relleno: 'h' }, { d: 'M5.9 6.1 8 10l2.1-3.9', trazo: 'contra', grosor: 1.6 }]
  },
  corriente: {
    capas: [{ d: 'M1.8 6.4h9.4M8.8 3.6l2.8 2.8-2.8 2.8', trazo: 'h', grosor: 1.9 }, { d: 'M2.4 11.8h.01M5.4 11.8h.01M8.4 11.8h.01M11.4 11.8h.01', trazo: 'gris', grosor: 2 }]
  },
  animaciones: {
    capas: [{ d: 'M5.2 8a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0 -5.6 0z', relleno: 'h' }, { d: 'M8 1.6v1.8M8 12.6v1.8M3.5 3.5l1.2 1.2M11.3 11.3l1.2 1.2M3.5 12.5l1.2-1.2M11.3 4.7l1.2-1.2', trazo: 'borde', grosor: 1.6 }]
  },
  sonido: {
    capas: [{ d: 'M1.8 5.6h2.8L8.6 2.4v11.2L4.6 10.4H1.8z', relleno: 'h' }, { d: 'M10.8 5.4a3.6 3.6 0 0 1 0 5.2M12.8 3.6a6.2 6.2 0 0 1 0 8.8', trazo: 'borde', grosor: 1.6 }]
  },
  sonidoApagado: {
    capas: [{ d: 'M1.8 5.6h2.8L8.6 2.4v11.2L4.6 10.4H1.8z', relleno: 'h' }, { d: 'M10.4 5.6l4 4.8M14.4 5.6l-4 4.8', trazo: 'borde', grosor: 1.7 }]
  },
  masLento: {
    capas: [{ d: 'M8.4 3.2v9.6L2.8 8zM14 3.2v9.6L8.4 8z', relleno: 'h' }]
  },
  masRapido: {
    capas: [{ d: 'M2 3.2v9.6L7.6 8zM7.6 3.2v9.6L13.2 8z', relleno: 'h' }]
  },
  aviso: {
    capas: [{ d: 'M8 1.6 15 13.8H1z', relleno: 'h' }, { d: 'M8 6.2v3.6M8 11.6h.01', trazo: 'contra', grosor: 1.8 }]
  },
  analisis: {
    capas: [{ d: 'M2 2.4v11.2h12', trazo: 'gris', grosor: 1.5 }, { d: 'M3.6 5h3.8c2 0 3 1.6 4 5l1.4 3', trazo: 'h', grosor: 1.9 }]
  },
  analisisOp: {
    capas: [{ d: 'M2.4 2.4v11.2h11.2', trazo: 'gris', grosor: 1.5 }, { d: 'M2.4 8.2H8M8 8.2v5.4', trazo: 'gris', grosor: 1.2 }, { d: 'M5.6 8.2a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0z', relleno: 'h' }]
  },
  analisisDc: {
    capas: [{ d: 'M2.4 2.4v11.2h11.2', trazo: 'gris', grosor: 1.5 }, { d: 'M3.6 11.8h4.2c2.4 0 3.4-1.2 4.2-7.6', trazo: 'h', grosor: 1.9 }]
  },
  analisisAc: {
    capas: [{ d: 'M2.4 2.4v11.2h11.2', trazo: 'gris', grosor: 1.5 }, { d: 'M3.6 5.2h4c2.2 0 3 1.4 4.4 6.4', trazo: 'h', grosor: 1.9 }]
  },
  analisisTran: {
    capas: [{ d: 'M2.4 2.4v11.2h11.2', trazo: 'gris', grosor: 1.5 }, { d: 'M3.6 11.8c1.6-6.6 3.8-7.2 8.8-7.2', trazo: 'h', grosor: 1.9 }]
  },
  analisisFourier: {
    capas: [{ d: 'M2.4 13.6h11.2', trazo: 'gris', grosor: 1.5 }, { d: 'M4.3 13.4V3.4M7.1 13.4V7M9.9 13.4V9.6M12.7 13.4v-2.6', trazo: 'h', grosor: 2.2 }]
  },
  analisisParam: {
    capas: [{ d: 'M2.4 2.4v11.2h11.2', trazo: 'gris', grosor: 1.5 }, { d: 'M3.6 13c2-.4 4-2 8.4-4.6', trazo: 'h', grosor: 1.2 }, { d: 'M3.6 11c2-.4 4-2 8.4-4.6', trazo: 'h', grosor: 1.9 }, { d: 'M3.6 8.6c2-.4 4-2 8.4-4.6', trazo: 'h', grosor: 1.2 }]
  },
  ejecutar: {
    capas: [{ d: 'M2.4 13.6h11.2', trazo: 'gris', grosor: 1.5 }, { d: 'M4.8 2.6v8.6l6.6-4.3z', relleno: 'h' }]
  },
  graficas: {
    capas: [{ d: 'M2.4 2.4v11.2h11.2', trazo: 'gris', grosor: 1.5 }, { d: 'M3.6 10.6c1.8-1.2 3-6 4.6-6s2.2 5.2 4.2 5.2', trazo: 'h', grosor: 1.9 }, { d: 'M3.6 7.4c2 0 2.6 4.4 4.6 4.4s2.6-6 4.2-6', trazo: 'h', grosor: 1.2 }]
  },
  multimetro: {
    capas: [{ d: 'M3.2 1.4h9.6v13.2H3.2z', relleno: 'h' }, { d: 'M4.9 3.2h6.2v3.6H4.9z', relleno: 'contra' }, { d: 'M6 10.8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z', relleno: 'contra' }, { d: 'M8 10.8l1.1-1.1', trazo: 'h', grosor: 1.2 }],
    chico: [{ d: 'M3.2 1.4h9.6v13.2H3.2z', relleno: 'h' }, { d: 'M4.9 3.2h6.2v3.6H4.9z', relleno: 'contra' }, { d: 'M6 10.8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z', relleno: 'contra' }]
  },
  osciloscopio: {
    capas: [{ d: 'M1.4 2.6h13.2v10.8H1.4z', relleno: 'h' }, { d: 'M3.4 8C4.4 4.6 5.6 4.6 6.4 8S8.4 11.4 9.2 8s2-3.4 3.2 0', trazo: 'contra', grosor: 1.5 }]
  },
  generador: {
    capas: [{ d: 'M1.7 8a6.3 6.3 0 1 0 12.6 0a6.3 6.3 0 1 0 -12.6 0z', relleno: 'h' }, { d: 'M4.4 8c.7-2.5 1.9-2.5 2.3 0s1.7 2.5 2.4 0 1.7-2.5 2.4 0', trazo: 'contra', grosor: 1.5 }]
  },
  fuenteVariable: {
    capas: [{ d: 'M3 8a5 5 0 1 0 10 0a5 5 0 1 0 -10 0z', relleno: 'h' }, { d: 'M2 14 14 2M10.8 2H14v3.2', trazo: 'borde', grosor: 1.7 }]
  },
  registro: {
    capas: [{ d: 'M6 4h8M6 8h8M6 12h8', trazo: 'gris', grosor: 1.6 }, { d: 'M1.5 4a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0z', relleno: 'h2' }, { d: 'M1.5 8a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0z', relleno: 'h2' }, { d: 'M1.5 12a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0z', relleno: 'h2' }]
  },
  franja: {
    capas: [{ d: 'M2 3h12v10H2z', trazo: 'gris', grosor: 1.4 }, { d: 'M2 9h12v4H2z', relleno: 'h' }]
  },
  encuadrar: {
    capas: [{ d: 'M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5', trazo: 'gris', grosor: 1.6 }, { d: 'M5 6h6v4H5z', relleno: 'h' }]
  },
  acercar: {
    capas: [{ d: 'M2.2 6.6a4.4 4.4 0 1 0 8.8 0a4.4 4.4 0 1 0 -8.8 0z', relleno: 'tenue', trazo: 'h', grosor: 1.7 }, { d: 'M9.9 9.9 14 14', trazo: 'borde', grosor: 2.4 }, { d: 'M6.6 4.6v4M4.6 6.6h4', trazo: 'borde', grosor: 1.5 }]
  },
  alejar: {
    capas: [{ d: 'M2.2 6.6a4.4 4.4 0 1 0 8.8 0a4.4 4.4 0 1 0 -8.8 0z', relleno: 'tenue', trazo: 'h', grosor: 1.7 }, { d: 'M9.9 9.9 14 14', trazo: 'borde', grosor: 2.4 }, { d: 'M4.6 6.6h4', trazo: 'borde', grosor: 1.5 }]
  },
  'tamañoReal': {
    capas: [{ d: 'M3.2 5.6 5 4.4v7.2M11 5.6l1.8-1.2v7.2', trazo: 'h', grosor: 1.8 }, { d: 'M8 6.8h.01M8 9.6h.01', trazo: 'gris', grosor: 2 }]
  },
  libreria: {
    capas: [{ d: 'M1.6 8h3.2l1.7-3.4 3 6.8L11.2 8h3.2', trazo: 'h', grosor: 1.9 }]
  },
  plantillas: {
    capas: [{ d: 'M5.5 2.5h8v8.5', trazo: 'gris', grosor: 1.4 }, { d: 'M2.5 5h8v8.5h-8z', relleno: 'tenue', trazo: 'h', grosor: 1.5 }, { d: 'M4.8 8.2h3.4M4.8 10.6h2.2', trazo: 'borde', grosor: 1.4 }]
  },
  proyecto: {
    capas: [{ d: 'M2.4 2.4h5v5h-5z', relleno: 'h' }, { d: 'M8.6 8.6h5v5h-5z', relleno: 'h2' }, { d: 'M7.4 4.9h3.6v3.7', trazo: 'gris', grosor: 1.4 }]
  },
  mediciones: {
    capas: [{ d: 'M2.4 8a5.6 5.6 0 1 0 11.2 0a5.6 5.6 0 1 0 -11.2 0z', relleno: 'tenue', trazo: 'h', grosor: 1.6 }, { d: 'M8 4.8V8l2.3 1.7', trazo: 'borde', grosor: 1.6 }]
  },
  calculadoras: {
    capas: [{ d: 'M4 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 12 14H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 2z', relleno: 'tenue', trazo: 'h', grosor: 1.5 }, { d: 'M4.8 4h6.4v2.4H4.8z', relleno: 'h' }, { d: 'M5.4 8.6h.01M8 8.6h.01M10.6 8.6h.01', trazo: 'borde', grosor: 1.8 }, { d: 'M5.4 11.2h.01M8 11.2h.01M10.6 11.2h.01', trazo: 'borde', grosor: 1.8 }],
    chico: [{ d: 'M4 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 12 14H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 2z', relleno: 'tenue', trazo: 'h', grosor: 1.5 }, { d: 'M4.8 4h6.4v2.4H4.8z', relleno: 'h' }, { d: 'M5.4 8.6h.01M8 8.6h.01M10.6 8.6h.01', trazo: 'borde', grosor: 1.8 }]
  },
  inspector: {
    capas: [{ d: 'M2 3h12v10H2z', trazo: 'gris', grosor: 1.4 }, { d: 'M10 3h4v10h-4z', relleno: 'h' }]
  },
  lienzoLimpio: {
    capas: [{ d: 'M2 3h12v10H2z', trazo: 'gris', grosor: 1.4 }, { d: 'M2 3h4v10H2z', relleno: 'h' }, { d: 'M11 6.4 9.4 8l1.6 1.6', trazo: 'borde', grosor: 1.5 }]
  },
  sol: {
    capas: [{ d: 'M4.8 8a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0z', relleno: 'h' }, { d: 'M8 1.2v2M8 12.8v2M1.2 8h2M12.8 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4', trazo: 'h', grosor: 1.5 }]
  },
  luna: {
    capas: [{ d: 'M12.6 9.6A5.2 5.2 0 0 1 6.4 3.4a5.4 5.4 0 1 0 6.2 6.2z', relleno: 'h' }]
  },
  pantallaCompleta: {
    capas: [{ d: 'M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4', trazo: 'h', grosor: 1.9 }]
  },
  ejemplos: {
    capas: [{ d: 'M8 4C6.6 2.8 4.4 2.6 1.6 3v10c2.8-.4 5-.2 6.4 1z', relleno: 'h' }, { d: 'M8 4c1.4-1.2 3.6-1.4 6.4-1v10c-2.8-.4-5-.2-6.4 1z', relleno: 'tenue', trazo: 'borde', grosor: 1.1 }]
  },
  acerca: {
    capas: [{ d: 'M1.6 8a6.4 6.4 0 1 0 12.8 0a6.4 6.4 0 1 0 -12.8 0z', relleno: 'h' }, { d: 'M8 7.2v4.2M8 4.8h.01', trazo: 'contra', grosor: 1.8 }]
  },
  ayuda: {
    capas: [{ d: 'M1.6 8a6.4 6.4 0 1 0 12.8 0a6.4 6.4 0 1 0 -12.8 0z', relleno: 'h' }, { d: 'M6.2 6.3a1.9 1.9 0 1 1 2.6 1.8c-.6.3-.8.7-.8 1.3v.3M8 11.6h.01', trazo: 'contra', grosor: 1.6 }]
  },
  paneles: {
    capas: [{ d: 'M2 3.4h12v9.2H2z', trazo: 'gris', grosor: 1.4 }, { d: 'M2 3.4h3.8v9.2H2zM10.2 3.4H14v9.2h-3.8z', relleno: 'h' }]
  },
  deshacer: {
    capas: [{ d: 'M6 3.6 2.6 7 6 10.4M2.8 7H10a3 3 0 0 1 0 6H8', trazo: 'h', grosor: 1.9 }]
  },
  rehacer: {
    capas: [{ d: 'M10 3.6 13.4 7 10 10.4M13.2 7H6a3 3 0 0 0 0 6h2', trazo: 'h', grosor: 1.9 }]
  },
  atajos: {
    capas: [{ d: 'M1.4 4h13.2v8H1.4z', relleno: 'tenue', trazo: 'gris', grosor: 1.3 }, { d: 'M4 6.6h.01M6.7 6.6h.01M9.3 6.6h.01M12 6.6h.01', trazo: 'gris', grosor: 1.8 }, { d: 'M5 9.4h6', trazo: 'gris', grosor: 1.5 }]
  },
  linea: {
    capas: [{ d: 'M3.2 12.8 12.8 3.2', trazo: 'h', grosor: 1.9 }, { d: 'M1.5 12.8a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0 -3.4 0z', relleno: 'borde' }, { d: 'M11.1 3.2a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0 -3.4 0z', relleno: 'borde' }]
  },
  rectangulo: {
    capas: [{ d: 'M2.2 3.6h11.6v8.8H2.2z', relleno: 'tenue', trazo: 'h', grosor: 1.6 }]
  },
  elipse: {
    capas: [{ d: 'M2 8a6 4.4 0 1 0 12 0a6 4.4 0 1 0-12 0z', relleno: 'tenue', trazo: 'h', grosor: 1.6 }]
  },
  flecha: {
    capas: [{ d: 'M2.6 13.4 11 5', trazo: 'h', grosor: 1.9 }, { d: 'M13.6 2.4 12.6 8.6 7.4 3.4z', relleno: 'h' }]
  },
  figura: {
    capas: [{ d: 'M1.6 6.2h7.6v7.6H1.6z', relleno: 'tenue', trazo: 'h', grosor: 1.4 }, { d: 'M7.4 5.2a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0 -6.8 0z', relleno: 'h' }]
  },
  cancelar: {
    capas: [{ d: 'M1.7 8a6.3 6.3 0 1 0 12.6 0a6.3 6.3 0 1 0 -12.6 0z', relleno: 'h' }, { d: 'M5.7 5.7l4.6 4.6M10.3 5.7l-4.6 4.6', trazo: 'contra', grosor: 1.7 }]
  },
  mover: {
    capas: [{ d: 'M8 3.6v8.8M3.6 8h8.8', trazo: 'h', grosor: 1.7 }, { d: 'M8 1.2 10.6 4.2H5.4zM8 14.8 5.4 11.8h5.2zM1.2 8 4.2 5.4v5.2zM14.8 8 11.8 10.6V5.4z', relleno: 'h' }]
  },
  moverIzq: {
    capas: [{ d: 'M14 8H5.4', trazo: 'h', grosor: 1.9 }, { d: 'M1.8 8 6.6 3.6v8.8z', relleno: 'h' }]
  },
  moverDer: {
    capas: [{ d: 'M2 8h8.6', trazo: 'h', grosor: 1.9 }, { d: 'M14.2 8 9.4 3.6v8.8z', relleno: 'h' }]
  },
  moverArriba: {
    capas: [{ d: 'M8 14V5.4', trazo: 'h', grosor: 1.9 }, { d: 'M8 1.8 12.4 6.6H3.6z', relleno: 'h' }]
  },
  moverAbajo: {
    capas: [{ d: 'M8 2v8.6', trazo: 'h', grosor: 1.9 }, { d: 'M8 14.2 3.6 9.4h8.8z', relleno: 'h' }]
  },
  menuContextual: {
    capas: [{ d: 'M1.6 1.6h9v10.2h-9z', relleno: 'tenue', trazo: 'borde', grosor: 1.2 }, { d: 'M3.6 4.4h5M3.6 6.8h5M3.6 9.2h3.4', trazo: 'gris', grosor: 1.3 }, { d: 'M9.4 8.4l5.4 2-2.3.9-.9 2.3z', relleno: 'h', trazo: 'h', grosor: 0.8 }]
  },
  formato: {
    capas: [{ d: 'M4 11.4 8 2.8l4 8.6M5.6 8.2h4.8', trazo: 'h', grosor: 1.8 }, { d: 'M2.4 14h11.2', trazo: 'borde', grosor: 1.6 }]
  },
  negrita: {
    capas: [{ d: 'M4.4 13.2V2.8l7.2 10.4V2.8', trazo: 'h', grosor: 2.4 }]
  },
  cursiva: {
    capas: [{ d: 'M7.2 2.8 4.6 13.2M12 2.8 5.8 8.2M7.6 6.8l2 6.4', trazo: 'h', grosor: 1.8 }]
  },
  subrayado: {
    capas: [{ d: 'M11 3.6C10.4 2.8 9.4 2.4 8 2.4c-1.7 0-3 .9-3 2.3 0 3 6 1.8 6 5 0 1.4-1.3 2.3-3 2.3-1.4 0-2.5-.5-3.1-1.4', trazo: 'h', grosor: 1.7 }, { d: 'M2.6 14.4h10.8', trazo: 'borde', grosor: 1.6 }]
  },
  letraMayor: {
    capas: [{ d: 'M1.8 13.4 5.6 4h.8l3.8 9.4M3.3 10.2h5.4', trazo: 'h', grosor: 1.7 }, { d: 'M13.2 2.6 15.4 6.2H11z', relleno: 'borde' }]
  },
  letraMenor: {
    capas: [{ d: 'M1.8 13.4 5.6 4h.8l3.8 9.4M3.3 10.2h5.4', trazo: 'h', grosor: 1.7 }, { d: 'M13.2 6.2 15.4 2.6H11z', relleno: 'borde' }]
  },
  alinearIzq: {
    capas: [{ d: 'M2.4 3.4h11.2M2.4 9.4h11.2', trazo: 'h', grosor: 1.7 }, { d: 'M2.4 6.4h7M2.4 12.4h7', trazo: 'borde', grosor: 1.7 }]
  },
  alinearCentro: {
    capas: [{ d: 'M2.4 3.4h11.2M2.4 9.4h11.2', trazo: 'h', grosor: 1.7 }, { d: 'M4.6 6.4h6.8M4.6 12.4h6.8', trazo: 'borde', grosor: 1.7 }]
  },
  alinearDer: {
    capas: [{ d: 'M2.4 3.4h11.2M2.4 9.4h11.2', trazo: 'h', grosor: 1.7 }, { d: 'M6.6 6.4h7M6.6 12.4h7', trazo: 'borde', grosor: 1.7 }]
  },
  justificar: {
    capas: [{ d: 'M2.4 3.4h11.2M2.4 9.4h11.2', trazo: 'h', grosor: 1.7 }, { d: 'M2.4 6.4h11.2M2.4 12.4h11.2', trazo: 'borde', grosor: 1.7 }]
  },
  potMas: {
    capas: [{ d: 'M1.8 12.6h12.4', trazo: 'gris', grosor: 1.5 }, { d: 'M3.2 12.6a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0z', relleno: 'borde' }, { d: 'M11.6 9.8V5.2', trazo: 'h', grosor: 1.9 }, { d: 'M11.6 1.6 14.6 5.6H8.6z', relleno: 'h' }]
  },
  potMenos: {
    capas: [{ d: 'M1.8 12.6h12.4', trazo: 'gris', grosor: 1.5 }, { d: 'M3.2 12.6a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0z', relleno: 'borde' }, { d: 'M11.6 1.8v4.6', trazo: 'h', grosor: 1.9 }, { d: 'M11.6 10.4 14.6 6.4H8.6z', relleno: 'h' }]
  },
  quitarEsquina: {
    capas: [{ d: 'M2.4 13.6V5.6h6.6', trazo: 'h', grosor: 1.9 }, { d: 'M7.4 5.6a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0z', relleno: 'h' }, { d: 'M14.4 10.6H9.6M11.6 8.4 9.4 10.6l2.2 2.2', trazo: 'borde', grosor: 1.6 }]
  },
  invertirL: {
    capas: [{ d: 'M2.4 13.6h11.2V2.4', trazo: 'gris', grosor: 1.3 }, { d: 'M2.4 13.6V2.4h11.2', trazo: 'h', grosor: 1.9 }]
  },
  ajusteAuto: {
    capas: [{ d: 'M2.2 9.2c1.1-4.6 2.3-4.6 3.2-.6s2.1 4 3.1 0 2.1-4.2 3.2-.2', trazo: 'h', grosor: 1.7 }, { d: 'M12.8 1.8v3.4M11.1 3.5h3.4', trazo: 'gris', grosor: 1.3 }, { d: 'M2.2 13.4h8.2', trazo: 'gris', grosor: 1.3 }]
  },
  cursores: {
    capas: [{ d: 'M4.8 2.4v11.2M11.2 2.4v11.2', trazo: 'h', grosor: 1.6 }, { d: 'M5.6 8h4.8', trazo: 'gris', grosor: 1.3 }, { d: 'M7 6.5 5.5 8 7 9.5M9 6.5 10.5 8 9 9.5', trazo: 'gris', grosor: 1.3 }]
  },
  zoomRestablecer: {
    capas: [{ d: 'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10', trazo: 'gris', grosor: 1.4 }, { d: 'M5.6 8a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0z', relleno: 'h' }]
  },
  masAjustes: {
    capas: [{ d: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11', trazo: 'gris', grosor: 1.3 }, { d: 'M3.1 4.5a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0 -3.8 0z', relleno: 'h' }, { d: 'M8.6 8a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0 -3.8 0z', relleno: 'h' }, { d: 'M4.6 11.5a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0 -3.8 0z', relleno: 'h' }]
  },
  ventanaAparte: {
    capas: [{ d: 'M5.8 2.4h7.8v6.4H5.8z', relleno: 'tenue', trazo: 'borde', grosor: 1.2 }, { d: 'M2 6.4h8.6v7.2H2z', relleno: 'h' }, { d: 'M2 8.6h8.6', trazo: 'contra', grosor: 1.1 }]
  },
  acoplar: {
    capas: [{ d: 'M2.4 2.4h11.2v11.2H2.4z', relleno: 'tenue', trazo: 'borde', grosor: 1.2 }, { d: 'M2.4 9.4h11.2v4.2H2.4z', relleno: 'h' }, { d: 'M8 3.8v3.8M6.3 6.2 8 7.9l1.7-1.7', trazo: 'h', grosor: 1.5 }]
  },
  grabar: {
    capas: [{ d: 'M2 8a6 6 0 1 0 12 0a6 6 0 1 0 -12 0z', trazo: 'borde', grosor: 1.4 }, { d: 'M5 8a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z', relleno: 'h' }]
  },
  configuracion: {
    capas: [{ d: 'M14.31 6.95L14.31 9.05L12.56 9.13L12.03 10.42L13.21 11.72L11.72 13.21L10.42 12.03L9.13 12.56L9.05 14.31L6.95 14.31L6.87 12.56L5.58 12.03L4.28 13.21L2.79 11.72L3.97 10.42L3.44 9.13L1.69 9.05L1.69 6.95L3.44 6.87L3.97 5.58L2.79 4.28L4.28 2.79L5.58 3.97L6.87 3.44L6.95 1.69L9.05 1.69L9.13 3.44L10.42 3.97L11.72 2.79L13.21 4.28L12.03 5.58L12.56 6.87Z', relleno: 'h' }, { d: 'M6 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z', relleno: 'contra' }]
  }
} satisfies Partial<Record<NombreIcono, Plano>>

/** Color de cada orden por lo que hace (no por su grupo); con dos, el segundo es `h2` (el tallo de Tierra, la pluma de Guardar como). */
export type TonoIcono = Tono | readonly [Tono, Tono]

export const TONO_ICONO = {
  guardar: 'azul',
  nuevo: 'verdeazul',
  abrir: 'ocre',
  guardarComo: ['azul', 'ocre'],
  recientes: 'violeta',
  exportar: 'naranja',
  respaldos: 'ocre',
  cortar: 'magenta',
  copiar: 'azul',
  pegar: 'ocre',
  duplicar: ['azul', 'verdeazul'],
  borrar: 'rojo',
  todo: 'violeta',
  girar: 'cian',
  girarIzq: 'cian',
  espejoX: 'violeta',
  espejoY: 'violeta',
  pieza: 'azul',
  etiqueta: 'verdeazul',
  tierra: ['gris', 'verdeazul'],
  alimentacion: ['naranja', 'verdeazul'],
  nota: 'ocre',
  simular: 'azul',
  pausa: 'azul',
  detener: 'rojo',
  paso: 'azul',
  pasoAtras: 'azul',
  tiempoAvanza: 'azul',
  hastaT: 'azul',
  velocidad: 'cian',
  voltajes: 'naranja',
  corriente: 'ambar',
  animaciones: 'violeta',
  aviso: 'ambar',
  analisis: 'violeta',
  analisisOp: 'violeta',
  analisisDc: 'ocre',
  analisisAc: 'cian',
  analisisTran: 'azul',
  analisisFourier: 'magenta',
  analisisParam: 'verdeazul',
  ejecutar: 'verdeazul',
  graficas: 'violeta',
  sonido: 'verdeazul',
  sonidoApagado: 'gris',
  masLento: 'cian',
  masRapido: 'cian',
  multimetro: 'ambar',
  osciloscopio: 'cian',
  generador: 'magenta',
  fuenteVariable: 'naranja',
  registro: ['gris', 'azul'],
  franja: 'azul',
  encuadrar: 'azul',
  acercar: 'azul',
  alejar: 'azul',
  'tamañoReal': 'azul',
  libreria: 'verdeazul',
  plantillas: 'cian',
  proyecto: ['ocre', 'azul'],
  mediciones: 'naranja',
  calculadoras: 'violeta',
  inspector: 'azul',
  lienzoLimpio: 'cian',
  sol: 'ocre',
  luna: 'violeta',
  pantallaCompleta: 'azul',
  ejemplos: 'verdeazul',
  acerca: 'azul',
  ayuda: 'azul',
  paneles: 'azul',
  deshacer: 'azul',
  rehacer: 'azul',
  atajos: 'gris',
  configuracion: 'gris',
  buscar: 'gris',
  linea: 'oliva',
  rectangulo: 'oliva',
  elipse: 'oliva',
  flecha: 'oliva',
  figura: 'oliva',
  cancelar: 'gris',
  mover: 'cian',
  moverIzq: 'cian',
  moverDer: 'cian',
  moverArriba: 'cian',
  moverAbajo: 'cian',
  menuContextual: 'azul',
  formato: 'magenta',
  negrita: 'magenta',
  cursiva: 'magenta',
  subrayado: 'magenta',
  letraMayor: 'magenta',
  letraMenor: 'magenta',
  alinearIzq: 'magenta',
  alinearCentro: 'magenta',
  alinearDer: 'magenta',
  justificar: 'magenta',
  potMas: 'naranja',
  potMenos: 'naranja',
  quitarEsquina: 'verdeazul',
  invertirL: 'verdeazul',
  ajusteAuto: 'verdeazul',
  cursores: 'magenta',
  zoomRestablecer: 'cian',
  masAjustes: 'ocre',
  ventanaAparte: 'violeta',
  acoplar: 'violeta',
  grabar: 'rojo'
} satisfies Partial<Record<NombreIcono, TonoIcono>>
