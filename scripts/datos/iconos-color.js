// Iconos con color para la cinta: un color por lo que significa la orden, no por su grupo. Llega al <svg> como variables (--h, --h-tenue, --h-borde, --h2).
;(function () {
  'use strict'
  const TONO = {
    guardar: 'azul', nuevo: 'verdeazul', abrir: 'ocre', guardarComo: ['azul', 'ocre'], recientes: 'violeta', exportar: 'naranja', respaldos: 'ocre',
    cortar: 'magenta', copiar: 'azul', pegar: 'ocre', duplicar: ['azul', 'verdeazul'], borrar: 'rojo', todo: 'violeta',
    girar: 'cian', girarIzq: 'cian', espejoX: 'violeta', espejoY: 'violeta',
    pieza: 'azul', etiqueta: 'verdeazul', tierra: ['gris', 'verdeazul'], alimentacion: ['naranja', 'verdeazul'], nota: 'ocre',
    simular: 'azul', pausa: 'azul', detener: 'rojo', paso: 'azul', pasoAtras: 'azul', tiempoAvanza: 'azul', hastaT: 'azul', velocidad: 'cian', voltajes: 'naranja',
    corriente: 'ambar', animaciones: 'violeta', aviso: 'ambar', analisis: 'violeta', analisisOp: 'violeta', analisisDc: 'ocre', analisisAc: 'cian', analisisTran: 'azul', analisisFourier: 'magenta', analisisParam: 'verdeazul', ejecutar: 'verdeazul', graficas: 'violeta',
    sonido: 'verdeazul', sonidoApagado: 'gris', masLento: 'cian', masRapido: 'cian',
    multimetro: 'ambar', osciloscopio: 'cian', generador: 'magenta', fuenteVariable: 'naranja', registro: ['gris', 'azul'], franja: 'azul',
    encuadrar: 'azul', acercar: 'azul', alejar: 'azul', tamañoReal: 'azul', libreria: 'verdeazul', plantillas: 'cian', proyecto: ['ocre', 'azul'],
    mediciones: 'naranja', calculadoras: 'violeta', inspector: 'azul', lienzoLimpio: 'cian', sol: 'ocre', luna: 'violeta', pantallaCompleta: 'azul',
    ejemplos: 'verdeazul', acerca: 'azul', ayuda: 'azul', paneles: 'azul', deshacer: 'azul', rehacer: 'azul',
    atajos: 'gris', configuracion: 'gris', buscar: 'gris',
    linea: 'oliva', rectangulo: 'oliva', elipse: 'oliva', flecha: 'oliva', figura: 'oliva',
    cancelar: 'gris', mover: 'cian', moverIzq: 'cian', moverDer: 'cian', moverArriba: 'cian', moverAbajo: 'cian', menuContextual: 'azul',
    formato: 'magenta', negrita: 'magenta', cursiva: 'magenta', subrayado: 'magenta', letraMayor: 'magenta', letraMenor: 'magenta',
    alinearIzq: 'magenta', alinearCentro: 'magenta', alinearDer: 'magenta', justificar: 'magenta',
    potMas: 'naranja', potMenos: 'naranja', quitarEsquina: 'verdeazul', invertirL: 'verdeazul',
    ajusteAuto: 'verdeazul', cursores: 'magenta', zoomRestablecer: 'cian', masAjustes: 'ocre', ventanaAparte: 'violeta', acoplar: 'violeta', grabar: 'rojo'
  }
  window.TONO_ICONO = TONO

  // Juego plano a varios colores (r1). Papeles: h (color de la orden, 3:1 o más contra la cinta), h2 (segundo color),
  // tenue (relleno suave, siempre con contorno), borde (trazo exterior en el tono de texto), contra (detalle dentro de un
  // relleno: blanco en claro, casi negro en oscuro) y gris (lo neutro que significa algo, como la tierra).
  const R = { h: 'var(--h)', h2: 'var(--h2)', tenue: 'var(--h-tenue)', borde: 'var(--h-borde)', contra: 'var(--ic-contra)', gris: 'var(--ic-gris)' }
  const f = (d, r) => `<path d="${d}" style="fill:${R[r]};stroke:none"/>`
  const s = (d, r, w = 1.6) => `<path d="${d}" style="fill:none;stroke:${R[r]};stroke-width:${w}"/>`
  const fs = (d, rf, rs, w = 1.2) => `<path d="${d}" style="fill:${R[rf]};stroke:${R[rs]};stroke-width:${w}"/>`
  const c = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`
  const disco = 'M2.5 3.2c0-.4.3-.7.7-.7h8.1l2.2 2.2v8.1c0 .4-.3.7-.7.7H3.2a.7.7 0 0 1-.7-.7z'
  const A = {
    guardar: f(disco, 'h') + f('M5 2.5h5v3.4H5z', 'contra') + f('M8.1 3.2h1.2v2H8.1z', 'h') + f('M4.6 9h6.8v4.5H4.6z', 'contra'),
    nuevo: fs('M4 1.8h5.2L12 4.6v9.6H4z', 'tenue', 'borde') + s('M8 7.4v4.4M5.8 9.6h4.4', 'h', 1.8),
    abrir: f('M2 3.4h4.1l1.5 1.5H14v2.3H2z', 'borde') + f('M1.4 7.2h13.2l-1.3 6.3H2.7z', 'h'),
    guardarComo: f('M2 2.8c0-.4.3-.7.7-.7h7l1.9 1.9v3.6L8.4 10.8v2.5H2.7a.7.7 0 0 1-.7-.7z', 'h') + f('M4.2 2.1h4.4v3H4.2z', 'contra') + f('M4 8.6h4.4v4.7H4z', 'contra') + fs('M9.4 14.6l.5-2.4 3.9-3.9 1.9 1.9-3.9 3.9z', 'h2', 'h2', 0.4),
    recientes: f(c(8, 8, 6), 'h') + s('M8 4.6V8l2.4 1.6', 'contra', 1.6),
    exportar: s('M13 9.6V13H3V3h3.4', 'gris', 1.6) + s('M9.2 2.6h4.2v4.2M13.2 2.8 7.6 8.4', 'h', 1.9),
    cortar: s('M5.9 9.6 11 2.4M10.1 9.6 5 2.4', 'gris', 1.6) + f(c(4.4, 11.6, 2.3), 'h') + f(c(11.6, 11.6, 2.3), 'h') + f(c(4.4, 11.6, 0.9), 'contra') + f(c(11.6, 11.6, 0.9), 'contra'),
    copiar: fs('M2.6 1.9h7.3v9.2H2.6z', 'tenue', 'borde') + f('M5.8 5h7.6v9.2H5.8z', 'h') + s('M7.8 8h3.6M7.8 10.4h3.6', 'contra', 1.2),
    pegar: f('M3.2 3h9.6v11.3H3.2z', 'h') + f('M5 5.6h6v7H5z', 'contra') + f('M5.6 1.6h4.8v2.8H5.6z', 'borde'),
    duplicar: fs('M2 2h7.6v7.6H2z', 'tenue', 'borde') + f('M6 6h8v8H6z', 'h') + s('M10 8.2v3.6M8.2 10h3.6', 'contra', 1.6),
    borrar: s('M2.6 4.2h10.8', 'borde', 1.7) + s('M6.3 4V2.4h3.4V4', 'borde', 1.4) + f('M3.9 5.4h8.2l-.8 8.8H4.7z', 'h') + s('M6.7 7.4v4.6M9.3 7.4v4.6', 'contra', 1.2),
    todo: s('M2 4V2h2M6.5 2h3M12 2h2v2M14 6.5v3M14 12v2h-2M9.5 14h-3M4 14H2v-2M2 9.5v-3', 'borde', 1.4) + f('M5 5h6v6H5z', 'h'),
    girar: f('M5.8 9.6h4.4v4.4H5.8z', 'gris') + s('M3 9.2A5 5 0 0 1 12.4 6.4', 'h', 1.9) + f('M14 3.2l-.6 4.4-4.2-1.2z', 'h'),
    girarIzq: f('M5.8 9.6h4.4v4.4H5.8z', 'gris') + s('M13 9.2A5 5 0 0 0 3.6 6.4', 'h', 1.9) + f('M2 3.2l.6 4.4 4.2-1.2z', 'h'),
    espejoX: s('M8 1.4v13.2', 'gris', 1.2) + f('M6.4 3.4 1.6 12.6h4.8z', 'h') + fs('M9.6 3.4l4.8 9.2H9.6z', 'tenue', 'borde'),
    espejoY: s('M1.4 8h13.2', 'gris', 1.2) + f('M3.4 6.4 12.6 1.6v4.8z', 'h') + fs('M3.4 9.6l9.2 4.8V9.6z', 'tenue', 'borde'),
    pieza: fs(c(6.6, 6.6, 4.4), 'tenue', 'h', 1.7) + s('M9.9 9.9 14 14', 'borde', 2.4),
    buscar: s(c(6.6, 6.6, 4.4), 'gris', 1.7) + s('M9.9 9.9 14 14', 'gris', 2),
    etiqueta: f('M1.6 4.4h9.2L14.6 8l-3.8 3.6H1.6z', 'h') + s('M4.6 8h4', 'contra', 1.5),
    tierra: s('M8 1.6v6.6', 'h2', 2) + s('M2.8 8.4h10.4M5 11h6M7 13.6h2', 'gris', 1.9),
    alimentacion: s('M8 14.6V5.6', 'h2', 2) + f('M8 1.4 12.6 6.8H3.4z', 'h'),
    nota: f('M2.4 2.4h11.2v7.4l-3.8 3.8H2.4z', 'h') + f('M9.8 13.6V9.8h3.8z', 'borde') + s('M5 5.4h6M8 5.4v5', 'contra', 1.5),
    simular: f('M4.6 3.2v9.6l7.6-4.8z', 'h'),
    pausa: f('M4.2 3.2h2.8v9.6H4.2zM9 3.2h2.8v9.6H9z', 'h'),
    detener: f('M3.8 3.8h8.4v8.4H3.8z', 'h'),
    paso: f('M3 3.4v9.2l6.4-4.6z', 'h') + f('M11 3.4h2.2v9.2H11z', 'borde'),
    pasoAtras: f('M13 3.4v9.2l-6.4-4.6z', 'h') + f('M2.8 3.4H5v9.2H2.8z', 'borde'),
    tiempoAvanza: s('M2.6 8a5.4 5.4 0 1 0 10.8 0a5.4 5.4 0 1 0 -10.8 0z', 'gris', 1.5) + s('M8 4.8V8l2.6 1.6', 'h', 1.9),
    hastaT: s('M1.8 8h8.4M7.6 4.8 10.8 8l-3.2 3.2', 'h', 1.9) + f('M12.4 3h2v10h-2z', 'borde'),
    velocidad: s('M2.4 11.6a5.6 5.6 0 1 1 11.2 0', 'gris', 1.6) + s('M8 11.6l3-3.9', 'h', 2) + f(c(8, 11.6, 1.5), 'h'),
    voltajes: f('M1.6 4.2h12.8v7.6H1.6z', 'h') + s('M5.9 6.1 8 10l2.1-3.9', 'contra', 1.6),
    corriente: s('M1.8 6.4h9.4M8.8 3.6l2.8 2.8-2.8 2.8', 'h', 1.9) + s('M2.4 11.8h.01M5.4 11.8h.01M8.4 11.8h.01M11.4 11.8h.01', 'gris', 2),
    animaciones: f(c(8, 8, 2.8), 'h') + s('M8 1.6v1.8M8 12.6v1.8M3.5 3.5l1.2 1.2M11.3 11.3l1.2 1.2M3.5 12.5l1.2-1.2M11.3 4.7l1.2-1.2', 'borde', 1.6),
    sonido: f('M1.8 5.6h2.8L8.6 2.4v11.2L4.6 10.4H1.8z', 'h') + s('M10.8 5.4a3.6 3.6 0 0 1 0 5.2M12.8 3.6a6.2 6.2 0 0 1 0 8.8', 'borde', 1.6),
    sonidoApagado: f('M1.8 5.6h2.8L8.6 2.4v11.2L4.6 10.4H1.8z', 'h') + s('M10.4 5.6l4 4.8M14.4 5.6l-4 4.8', 'borde', 1.7),
    masLento: f('M8.4 3.2v9.6L2.8 8zM14 3.2v9.6L8.4 8z', 'h'),
    masRapido: f('M2 3.2v9.6L7.6 8zM7.6 3.2v9.6L13.2 8z', 'h'),
    aviso: f('M8 1.6 15 13.8H1z', 'h') + s('M8 6.2v3.6M8 11.6h.01', 'contra', 1.8),
    analisis: s('M2 2.4v11.2h12', 'gris', 1.5) + s('M3.6 5h3.8c2 0 3 1.6 4 5l1.4 3', 'h', 1.9),
    analisisOp: s('M2.4 2.4v11.2h11.2', 'gris', 1.5) + s('M2.4 8.2H8M8 8.2v5.4', 'gris', 1.2) + f(c(8, 8.2, 2.4), 'h'),
    analisisDc: s('M2.4 2.4v11.2h11.2', 'gris', 1.5) + s('M3.6 11.8h4.2c2.4 0 3.4-1.2 4.2-7.6', 'h', 1.9),
    analisisAc: s('M2.4 2.4v11.2h11.2', 'gris', 1.5) + s('M3.6 5.2h4c2.2 0 3 1.4 4.4 6.4', 'h', 1.9),
    analisisTran: s('M2.4 2.4v11.2h11.2', 'gris', 1.5) + s('M3.6 11.8c1.6-6.6 3.8-7.2 8.8-7.2', 'h', 1.9),
    analisisFourier: s('M2.4 13.6h11.2', 'gris', 1.5) + s('M4.3 13.4V3.4M7.1 13.4V7M9.9 13.4V9.6M12.7 13.4v-2.6', 'h', 2.2),
    analisisParam: s('M2.4 2.4v11.2h11.2', 'gris', 1.5) + s('M3.6 13c2-.4 4-2 8.4-4.6', 'h', 1.2) + s('M3.6 11c2-.4 4-2 8.4-4.6', 'h', 1.9) + s('M3.6 8.6c2-.4 4-2 8.4-4.6', 'h', 1.2),
    ejecutar: s('M2.4 13.6h11.2', 'gris', 1.5) + f('M4.8 2.6v8.6l6.6-4.3z', 'h'),
    graficas: s('M2.4 2.4v11.2h11.2', 'gris', 1.5) + s('M3.6 10.6c1.8-1.2 3-6 4.6-6s2.2 5.2 4.2 5.2', 'h', 1.9) + s('M3.6 7.4c2 0 2.6 4.4 4.6 4.4s2.6-6 4.2-6', 'h', 1.2),
    multimetro: f('M3.2 1.4h9.6v13.2H3.2z', 'h') + f('M4.9 3.2h6.2v3.6H4.9z', 'contra') + f(c(8, 10.8, 2), 'contra') + s('M8 10.8l1.1-1.1', 'h', 1.2),
    osciloscopio: f('M1.4 2.6h13.2v10.8H1.4z', 'h') + s('M3.4 8C4.4 4.6 5.6 4.6 6.4 8S8.4 11.4 9.2 8s2-3.4 3.2 0', 'contra', 1.5),
    generador: f(c(8, 8, 6.3), 'h') + s('M4.4 8c.7-2.5 1.9-2.5 2.3 0s1.7 2.5 2.4 0 1.7-2.5 2.4 0', 'contra', 1.5),
    fuenteVariable: f(c(8, 8, 5), 'h') + s('M2 14 14 2M10.8 2H14v3.2', 'borde', 1.7),
    registro: s('M6 4h8M6 8h8M6 12h8', 'gris', 1.6) + f(c(2.8, 4, 1.3), 'h2') + f(c(2.8, 8, 1.3), 'h2') + f(c(2.8, 12, 1.3), 'h2'),
    franja: s('M2 3h12v10H2z', 'gris', 1.4) + f('M2 9h12v4H2z', 'h'),
    encuadrar: s('M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5', 'gris', 1.6) + f('M5 6h6v4H5z', 'h'),
    acercar: fs(c(6.6, 6.6, 4.4), 'tenue', 'h', 1.7) + s('M9.9 9.9 14 14', 'borde', 2.4) + s('M6.6 4.6v4M4.6 6.6h4', 'borde', 1.5),
    alejar: fs(c(6.6, 6.6, 4.4), 'tenue', 'h', 1.7) + s('M9.9 9.9 14 14', 'borde', 2.4) + s('M4.6 6.6h4', 'borde', 1.5),
    tamañoReal: s('M3.2 5.6 5 4.4v7.2M11 5.6l1.8-1.2v7.2', 'h', 1.8) + s('M8 6.8h.01M8 9.6h.01', 'gris', 2),
    libreria: s('M1.6 8h3.2l1.7-3.4 3 6.8L11.2 8h3.2', 'h', 1.9),
    plantillas: s('M5.5 2.5h8v8.5', 'gris', 1.4) + fs('M2.5 5h8v8.5h-8z', 'tenue', 'h', 1.5) + s('M4.8 8.2h3.4M4.8 10.6h2.2', 'borde', 1.4),
    proyecto: f('M2.4 2.4h5v5h-5z', 'h') + f('M8.6 8.6h5v5h-5z', 'h2') + s('M7.4 4.9h3.6v3.7', 'gris', 1.4),
    mediciones: fs(c(8, 8, 5.6), 'tenue', 'h', 1.6) + s('M8 4.8V8l2.3 1.7', 'borde', 1.6),
    calculadoras: fs('M4 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 12 14H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 2z', 'tenue', 'h', 1.5) + f('M4.8 4h6.4v2.4H4.8z', 'h') + s('M5.4 8.6h.01M8 8.6h.01M10.6 8.6h.01', 'borde', 1.8) + s('M5.4 11.2h.01M8 11.2h.01M10.6 11.2h.01', 'borde', 1.8),
    inspector: s('M2 3h12v10H2z', 'gris', 1.4) + f('M10 3h4v10h-4z', 'h'),
    lienzoLimpio: s('M2 3h12v10H2z', 'gris', 1.4) + f('M2 3h4v10H2z', 'h') + s('M11 6.4 9.4 8l1.6 1.6', 'borde', 1.5),
    sol: f(c(8, 8, 3.2), 'h') + s('M8 1.2v2M8 12.8v2M1.2 8h2M12.8 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4', 'h', 1.5),
    luna: f('M12.6 9.6A5.2 5.2 0 0 1 6.4 3.4a5.4 5.4 0 1 0 6.2 6.2z', 'h'),
    pantallaCompleta: s('M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4', 'h', 1.9),
    ejemplos: f('M8 4C6.6 2.8 4.4 2.6 1.6 3v10c2.8-.4 5-.2 6.4 1z', 'h') + fs('M8 4c1.4-1.2 3.6-1.4 6.4-1v10c-2.8-.4-5-.2-6.4 1z', 'tenue', 'borde', 1.1),
    acerca: f(c(8, 8, 6.4), 'h') + s('M8 7.2v4.2M8 4.8h.01', 'contra', 1.8),
    ayuda: f(c(8, 8, 6.4), 'h') + s('M6.2 6.3a1.9 1.9 0 1 1 2.6 1.8c-.6.3-.8.7-.8 1.3v.3M8 11.6h.01', 'contra', 1.6),
    paneles: s('M2 3.4h12v9.2H2z', 'gris', 1.4) + f('M2 3.4h3.8v9.2H2zM10.2 3.4H14v9.2h-3.8z', 'h'),
    deshacer: s('M6 3.6 2.6 7 6 10.4M2.8 7H10a3 3 0 0 1 0 6H8', 'h', 1.9),
    rehacer: s('M10 3.6 13.4 7 10 10.4M13.2 7H6a3 3 0 0 0 0 6h2', 'h', 1.9),
    atajos: fs('M1.4 4h13.2v8H1.4z', 'tenue', 'gris', 1.3) + s('M4 6.6h.01M6.7 6.6h.01M9.3 6.6h.01M12 6.6h.01', 'gris', 1.8) + s('M5 9.4h6', 'gris', 1.5),
    linea: s('M3.2 12.8 12.8 3.2', 'h', 1.9) + f(c(3.2, 12.8, 1.7), 'borde') + f(c(12.8, 3.2, 1.7), 'borde'),
    rectangulo: fs('M2.2 3.6h11.6v8.8H2.2z', 'tenue', 'h', 1.6),
    elipse: fs('M2 8a6 4.4 0 1 0 12 0a6 4.4 0 1 0-12 0z', 'tenue', 'h', 1.6),
    flecha: s('M2.6 13.4 11 5', 'h', 1.9) + f('M13.6 2.4 12.6 8.6 7.4 3.4z', 'h'),
    figura: fs('M1.6 6.2h7.6v7.6H1.6z', 'tenue', 'h', 1.4) + f(c(10.8, 5.2, 3.4), 'h'),
    // Hoja de atajos y menús.
    cancelar: f(c(8, 8, 6.3), 'h') + s('M5.7 5.7l4.6 4.6M10.3 5.7l-4.6 4.6', 'contra', 1.7),
    mover: s('M8 3.6v8.8M3.6 8h8.8', 'h', 1.7) + f('M8 1.2 10.6 4.2H5.4zM8 14.8 5.4 11.8h5.2zM1.2 8 4.2 5.4v5.2zM14.8 8 11.8 10.6V5.4z', 'h'),
    moverIzq: s('M14 8H5.4', 'h', 1.9) + f('M1.8 8 6.6 3.6v8.8z', 'h'),
    moverDer: s('M2 8h8.6', 'h', 1.9) + f('M14.2 8 9.4 3.6v8.8z', 'h'),
    moverArriba: s('M8 14V5.4', 'h', 1.9) + f('M8 1.8 12.4 6.6H3.6z', 'h'),
    moverAbajo: s('M8 2v8.6', 'h', 1.9) + f('M8 14.2 3.6 9.4h8.8z', 'h'),
    menuContextual: fs('M1.6 1.6h9v10.2h-9z', 'tenue', 'borde') + s('M3.6 4.4h5M3.6 6.8h5M3.6 9.2h3.4', 'gris', 1.3) + fs('M9.4 8.4l5.4 2-2.3.9-.9 2.3z', 'h', 'h', 0.8),
    formato: s('M4 11.4 8 2.8l4 8.6M5.6 8.2h4.8', 'h', 1.8) + s('M2.4 14h11.2', 'borde', 1.6),
    negrita: s('M4.4 13.2V2.8l7.2 10.4V2.8', 'h', 2.4),
    cursiva: s('M7.2 2.8 4.6 13.2M12 2.8 5.8 8.2M7.6 6.8l2 6.4', 'h', 1.8),
    subrayado: s('M11 3.6C10.4 2.8 9.4 2.4 8 2.4c-1.7 0-3 .9-3 2.3 0 3 6 1.8 6 5 0 1.4-1.3 2.3-3 2.3-1.4 0-2.5-.5-3.1-1.4', 'h', 1.7) + s('M2.6 14.4h10.8', 'borde', 1.6),
    letraMayor: s('M1.8 13.4 5.6 4h.8l3.8 9.4M3.3 10.2h5.4', 'h', 1.7) + f('M13.2 2.6 15.4 6.2H11z', 'borde'),
    letraMenor: s('M1.8 13.4 5.6 4h.8l3.8 9.4M3.3 10.2h5.4', 'h', 1.7) + f('M13.2 6.2 15.4 2.6H11z', 'borde'),
    alinearIzq: s('M2.4 3.4h11.2M2.4 9.4h11.2', 'h', 1.7) + s('M2.4 6.4h7M2.4 12.4h7', 'borde', 1.7),
    alinearCentro: s('M2.4 3.4h11.2M2.4 9.4h11.2', 'h', 1.7) + s('M4.6 6.4h6.8M4.6 12.4h6.8', 'borde', 1.7),
    alinearDer: s('M2.4 3.4h11.2M2.4 9.4h11.2', 'h', 1.7) + s('M6.6 6.4h7M6.6 12.4h7', 'borde', 1.7),
    justificar: s('M2.4 3.4h11.2M2.4 9.4h11.2', 'h', 1.7) + s('M2.4 6.4h11.2M2.4 12.4h11.2', 'borde', 1.7),
    potMas: s('M1.8 12.6h12.4', 'gris', 1.5) + f(c(5.4, 12.6, 2.2), 'borde') + s('M11.6 9.8V5.2', 'h', 1.9) + f('M11.6 1.6 14.6 5.6H8.6z', 'h'),
    potMenos: s('M1.8 12.6h12.4', 'gris', 1.5) + f(c(5.4, 12.6, 2.2), 'borde') + s('M11.6 1.8v4.6', 'h', 1.9) + f('M11.6 10.4 14.6 6.4H8.6z', 'h'),
    quitarEsquina: s('M2.4 13.6V5.6h6.6', 'h', 1.9) + f(c(9, 5.6, 1.6), 'h') + s('M14.4 10.6H9.6M11.6 8.4 9.4 10.6l2.2 2.2', 'borde', 1.6),
    invertirL: s('M2.4 13.6h11.2V2.4', 'gris', 1.3) + s('M2.4 13.6V2.4h11.2', 'h', 1.9),
    ajusteAuto: s('M2.2 9.2c1.1-4.6 2.3-4.6 3.2-.6s2.1 4 3.1 0 2.1-4.2 3.2-.2', 'h', 1.7) + s('M12.8 1.8v3.4M11.1 3.5h3.4', 'gris', 1.3) + s('M2.2 13.4h8.2', 'gris', 1.3),
    cursores: s('M4.8 2.4v11.2M11.2 2.4v11.2', 'h', 1.6) + s('M5.6 8h4.8', 'gris', 1.3) + s('M7 6.5 5.5 8 7 9.5M9 6.5 10.5 8 9 9.5', 'gris', 1.3),
    zoomRestablecer: s('M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10', 'gris', 1.4) + f(c(8, 8, 2.4), 'h'),
    masAjustes: s('M2.5 4.5h11M2.5 8h11M2.5 11.5h11', 'gris', 1.3) + f(c(5, 4.5, 1.9), 'h') + f(c(10.5, 8, 1.9), 'h') + f(c(6.5, 11.5, 1.9), 'h'),
    ventanaAparte: fs('M5.8 2.4h7.8v6.4H5.8z', 'tenue', 'borde', 1.2) + f('M2 6.4h8.6v7.2H2z', 'h') + s('M2 8.6h8.6', 'contra', 1.1),
    acoplar: fs('M2.4 2.4h11.2v11.2H2.4z', 'tenue', 'borde', 1.2) + f('M2.4 9.4h11.2v4.2H2.4z', 'h') + s('M8 3.8v3.8M6.3 6.2 8 7.9l1.7-1.7', 'h', 1.5),
    grabar: s(c(8, 8, 6), 'borde', 1.4) + f(c(8, 8, 3), 'h'),
    configuracion: f('M14.31 6.95L14.31 9.05L12.56 9.13L12.03 10.42L13.21 11.72L11.72 13.21L10.42 12.03L9.13 12.56L9.05 14.31L6.95 14.31L6.87 12.56L5.58 12.03L4.28 13.21L2.79 11.72L3.97 10.42L3.44 9.13L1.69 9.05L1.69 6.95L3.44 6.87L3.97 5.58L2.79 4.28L4.28 2.79L5.58 3.97L6.87 3.44L6.95 1.69L9.05 1.69L9.13 3.44L10.42 3.97L11.72 2.79L13.21 4.28L12.03 5.58L12.56 6.87Z', 'h') + f(c(8, 8, 2), 'contra')
  }
  const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  sprite.setAttribute('aria-hidden', 'true')
  sprite.style.display = 'none'
  sprite.innerHTML = Object.entries(A).map(([id, d]) => `<symbol id="a-${id}" viewBox="0 0 16 16">${d}</symbol>`).join('')
  document.body.prepend(sprite)

  const conA = !!document.querySelector('.marco.r1')
  const anterior = window.reemplazarIconos
  const teñir = (raiz) => {
    for (const s of raiz.querySelectorAll('svg.icono:not([data-icono])')) {
      if (!s.closest('.barra-x') || s.closest('.sim .principal')) continue
      const u = s.querySelector('use')
      const id = u && u.getAttribute('href').replace(/^#[ia]-/, '')
      if (!id) continue
      s.dataset.icono = id
      const t = TONO[id]
      if (!t) continue
      const [h, h2] = Array.isArray(t) ? t : [t, t]
      s.style.cssText += `--h: var(--${h}); --h-texto: var(--${h}-texto); --h-suave: var(--${h}-suave); --h-tenue: var(--${h}-tenue); --h-borde: var(--${h}-texto); --h2: var(--${h2});`
      s.classList.add('con-tono')
      if (conA && A[id]) {
        u.setAttribute('href', '#a-' + id)
        s.classList.add('plano')
      }
    }
  }
  window.reemplazarIconos = (raiz = document) => {
    anterior(raiz)
    teñir(raiz)
  }
  // La interfaz cambia el href de Simular/Pausar y del tema: se actualiza el color y, en r1, se sigue con el juego plano.
  new MutationObserver((ms) => {
    for (const m of ms) {
      const u = m.target
      const s = u.closest('svg.icono')
      const v = u.getAttribute('href') || ''
      if (!s || !s.closest('.barra-x') || s.closest('.sim .principal') || !/^#[ia]-/.test(v)) continue
      const id = v.slice(3)
      if (conA && v.startsWith('#i-') && A[id]) { u.setAttribute('href', '#a-' + id); continue }
      const t = TONO[id]
      if (!t) continue
      const [h, h2] = Array.isArray(t) ? t : [t, t]
      s.dataset.icono = id
      s.style.cssText = `--h: var(--${h}); --h-texto: var(--${h}-texto); --h-suave: var(--${h}-suave); --h-tenue: var(--${h}-tenue); --h-borde: var(--${h}-texto); --h2: var(--${h2});`
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['href'] })
})()
