// Iconos de trazo de 16 x 16 de Kirchi (los de src/renderer/src/ui/iconos.tsx y los nuevos de la barra, en el mismo estilo:
// trazo de 1.8 a 14 px, puntas y uniones redondas, sin relleno salvo Simular, Pausar y Detener). Toman el color del texto.
// Uso: <i data-i="girar"></i> se cambia por <svg class="icono"><use href="#i-girar"/></svg>.
const ICONOS = {
  // Los que ya existen en la aplicación.
  archivo: '<path d="M3 4h10M3 8h10M3 12h10"/>',
  deshacer: '<path d="M6 4 3 7l3 3M3 7h7a3 3 0 0 1 0 6H8"/>',
  rehacer: '<path d="M10 4l3 3-3 3M13 7H6a3 3 0 0 0 0 6h2"/>',
  simular: '<path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none"/>',
  pausa: '<path d="M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z" fill="currentColor" stroke="none"/>',
  detener: '<path d="M4 4h8v8H4z" fill="currentColor" stroke="none"/>',
  sol: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5"/>',
  luna: '<path d="M12 9.5A5 5 0 0 1 6.5 4a5 5 0 1 0 5.5 5.5z"/>',
  libreria: '<path d="M2 8h3l1.5-3 3 6L11 8h3"/>',
  plantillas: '<path d="M5.5 2.5h8v8.5M2.5 5h8v8.5h-8zM4.8 8.2h3.4M4.8 10.6h2.2"/>',
  proyecto: '<path d="M3 3h4v4H3zM9 9h4v4H9zM7 5h3v4"/>',
  mediciones: '<circle cx="8" cy="8" r="5"/><path d="M8 5v3l2 1.5"/>',
  calculadoras: '<path d="M5 2h6a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 11 14H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 2zM5.6 4.8h4.8M5.8 8h.01M8 8h.01M10.2 8h.01M5.8 10.6h.01M8 10.6h.01M10.2 10.6h.01"/>',
  arriba: '<path d="M4 10l4-4 4 4"/>',
  abajo: '<path d="M4 6l4 4 4-4"/>',
  plegarIzq: '<path d="M10 4 6 8l4 4"/>',
  plegarDer: '<path d="M6 4l4 4-4 4"/>',
  paneles: '<path d="M2.5 3.5h11v9h-11zM6 3.5v9M10.5 3.5v9"/>',
  // Nuevos: archivo.
  nuevo: '<path d="M4 1.8h5.2L12 4.6v9.6H4zM9 1.8v3h3M8 7.6v4M6 9.6h4"/>',
  abrir: '<path d="M2 4h4l1.5 1.5H14V13H2z"/>',
  guardar: '<path d="M2.5 2.5h9l2 2v9h-11zM5 2.5V6h5V2.5M5 13.5v-4h6v4"/>',
  guardarComo: '<path d="M7.5 13.5h-5v-11h8l2 2v2.5M5 2.5V6h4.5V2.5M9.4 14.2l.3-2 3.8-3.8 1.7 1.7-3.8 3.8z"/>',
  recientes: '<path d="M3.2 5.3A5.5 5.5 0 1 1 2.5 8M2.5 3v2.6h2.6M8 5.2V8l2 1.5"/>',
  exportar: '<path d="M13 9.5V13H3V3h3.5M9 2.5h4.5V7M13.5 2.5 7.5 8.5"/>',
  respaldos: '<path d="M2 4h4l1.5 1.5H14V13H2zM8 7.6v2.2l1.6 1"/>',
  configuracion: '<path d="M14.31 6.95L14.31 9.05L12.56 9.13L12.03 10.42L13.21 11.72L11.72 13.21L10.42 12.03L9.13 12.56L9.05 14.31L6.95 14.31L6.87 12.56L5.58 12.03L4.28 13.21L2.79 11.72L3.97 10.42L3.44 9.13L1.69 9.05L1.69 6.95L3.44 6.87L3.97 5.58L2.79 4.28L4.28 2.79L5.58 3.97L6.87 3.44L6.95 1.69L9.05 1.69L9.13 3.44L10.42 3.97L11.72 2.79L13.21 4.28L12.03 5.58L12.56 6.87Z"/><circle cx="8" cy="8" r="2"/>',
  atajos: '<path d="M2 4.2h12a.6.6 0 0 1 .6.6v6.4a.6.6 0 0 1-.6.6H2a.6.6 0 0 1-.6-.6V4.8a.6.6 0 0 1 .6-.6zM4.3 6.7h.01M6.8 6.7h.01M9.2 6.7h.01M11.7 6.7h.01M5 9.4h6"/>',
  // Edición.
  cortar: '<circle cx="4.5" cy="11.5" r="1.9"/><circle cx="11.5" cy="11.5" r="1.9"/><path d="M5.8 10.1 11 2.5M10.2 10.1 5 2.5"/>',
  copiar: '<path d="M5.5 5h7.5v9H5.5zM3 11V2h7.5"/>',
  pegar: '<path d="M5 3H3.5v11h9V3H11M5.5 2h5v2.4h-5z"/>',
  duplicar: '<path d="M6 6h8v8H6zM3.5 10H2V2h8v1.5M10 8.3v3.4M8.3 10h3.4"/>',
  borrar: '<path d="M2.8 4.2h10.4M6.3 4.2V2.5h3.4v1.7M4.2 4.2l.7 9.8h6.2l.7-9.8M6.8 6.8v4.6M9.2 6.8v4.6"/>',
  todo: '<path d="M2 4V2h2M6.5 2h3M12 2h2v2M14 6.5v3M14 12v2h-2M9.5 14h-3M4 14H2v-2M2 9.5v-3M5.5 5.5h5v5h-5z"/>',
  red: '<circle cx="3" cy="8" r="1.4"/><circle cx="13" cy="3.8" r="1.4"/><circle cx="13" cy="12.2" r="1.4"/><path d="M4.4 8H8M8 3.8v8.4M8 3.8h3.6M8 12.2h3.6"/>',
  // Girar y reflejar: el cuadro marca la pieza y la flecha el sentido.
  girar: '<path d="M3.2 9.5A4.9 4.9 0 0 1 12.4 6.6M12.9 3.4l-.4 3.3-3.3-.4M6.3 10.2h3.4v3.4H6.3z"/>',
  girarIzq: '<path d="M12.8 9.5A4.9 4.9 0 0 0 3.6 6.6M3.1 3.4l.4 3.3 3.3-.4M6.3 10.2h3.4v3.4H6.3z"/>',
  espejoX: '<path d="M8 1.6v1.8M8 5.4v1.8M8 9.2V11M8 13v1.4M6 4 2 12h4zM10 4l4 8h-4z"/>',
  espejoY: '<path d="M1.6 8h1.8M5.4 8h1.8M9.2 8H11M13 8h1.4M4 6l8-4v4zM4 10l8 4v-4z"/>',
  // Colocar.
  pieza: '<circle cx="6.8" cy="6.8" r="4.3"/><path d="M10 10l4 4"/>',
  cable: '<path d="M3.2 12.5V5.5h9.6"/><circle cx="3.2" cy="12.5" r="1.3"/><circle cx="12.8" cy="5.5" r="1.3"/>',
  etiqueta: '<path d="M2 5h8.6L14 8l-3.4 3H2zM5 8h3.5"/>',
  tierra: '<path d="M8 2.5v6M3 8.5h10M5 11h6M7 13.5h2"/>',
  alimentacion: '<path d="M8 14V3.2M4.6 6.6 8 3.2l3.4 3.4"/>',
  nota: '<path d="M2.5 2.5h11v11h-11zM5 5.5h6M8 5.5v6"/>',
  compuerta: '<path d="M5 3h3.4a5 5 0 0 1 0 10H5zM1.5 5.5H5M1.5 10.5H5M13.4 8H15"/>',
  display7: '<path d="M5.2 2.5h5.6M4.4 3.3v4M11.6 3.3v4M5.2 8h5.6M4.4 8.8v4M11.6 8.8v4M5.2 13.5h5.6"/>',
  aviso: '<path d="M8 2.2 14.3 13H1.7zM8 6.3v3.2M8 11.3h.01"/>',
  reloj: '<path d="M1.5 11h3V5H8v6h3V5h3.5"/>',
  // Ver.
  encuadrar: '<path d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5M5.5 6.5h5v3h-5z"/>',
  acercar: '<circle cx="6.8" cy="6.8" r="4.3"/><path d="M10 10l4 4M6.8 4.9v3.8M4.9 6.8h3.8"/>',
  alejar: '<circle cx="6.8" cy="6.8" r="4.3"/><path d="M10 10l4 4M4.9 6.8h3.8"/>',
  tamañoReal: '<path d="M3.2 5.6 5 4.4v7.2M11 5.6l1.8-1.2v7.2M8 6.8h.01M8 9.6h.01"/>',
  lienzoLimpio: '<path d="M2 3h12v10H2zM5.5 3v10M10 6.5 8.5 8l1.5 1.5"/>',
  inspector: '<path d="M2 3h12v10H2zM10.5 3v10"/>',
  franja: '<path d="M2 3h12v10H2zM2 9.5h12"/>',
  pantallaCompleta: '<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/>',
  voltajes: '<path d="M2.6 4.5h10.8a.8.8 0 0 1 .8.8v5.4a.8.8 0 0 1-.8.8H2.6a.8.8 0 0 1-.8-.8V5.3a.8.8 0 0 1 .8-.8zM6.2 6.3 8 9.8l1.8-3.5"/>',
  // Simulación.
  paso: '<path d="M3.5 3.5v9l6-4.5zM12 3.5v9"/>',
  pasoAtras: '<path d="M12.5 3.5v9l-6-4.5zM4 3.5v9"/>',
  tiempoAvanza: '<path d="M2.6 8a5.4 5.4 0 1 0 10.8 0a5.4 5.4 0 1 0-10.8 0zM8 4.8V8l2.6 1.6"/>',
  velocidad: '<path d="M2.5 11.5a5.5 5.5 0 1 1 11 0M8 11.5l2.8-3.6M2.5 11.5h1.3M12.2 11.5h1.3"/>',
  hastaT: '<path d="M2 8h8.5M8 5l3 3-3 3M13.5 3.5v9"/>',
  corriente: '<path d="M2 6.5h9M9 3.8l2.7 2.7L9 9.2M2.5 12h.01M5.5 12h.01M8.5 12h.01M11.5 12h.01"/>',
  animaciones: '<circle cx="8" cy="8" r="2.4"/><path d="M8 1.8v1.6M8 12.6v1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/>',
  // El altavoz con ondas (tachado al silenciar) y los pasos de la velocidad del tiempo.
  sonido: '<path d="M2.5 6h2.5l3.5-3v10L5 10H2.5zM10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.4 3.8a5.9 5.9 0 0 1 0 8.4"/>',
  sonidoApagado: '<path d="M2.5 6h2.5l3.5-3v10L5 10H2.5zM10.5 6l3.5 4M14 6l-3.5 4"/>',
  masLento: '<path d="M8.5 3.5v9L3.5 8zM13.5 3.5v9L8.5 8z"/>',
  masRapido: '<path d="M2.5 3.5v9l5-4.5zM7.5 3.5v9l5-4.5z"/>',
  analisis: '<path d="M2 2.5v11h12M3.6 5h4c2 0 3 1.6 4 5l1.4 3"/>',
  // Un icono por análisis (punto de operación, barrido de CD, CA, transitorio, Fourier y barrido de parámetro), Ejecutar y Gráficas.
  analisisOp: '<path d="M2.5 2.5v11h11M2.5 8.2H8M8 8.2v5.3"/><circle cx="8" cy="8.2" r="1.9"/>',
  analisisDc: '<path d="M2.5 2.5v11h11M3.6 11.8h4.2c2.4 0 3.4-1.2 4.2-7.6"/>',
  analisisAc: '<path d="M2.5 2.5v11h11M3.6 5.2h4c2.2 0 3 1.4 4.4 6.4"/>',
  analisisTran: '<path d="M2.5 2.5v11h11M3.6 11.8c1.6-6.6 3.8-7.2 8.8-7.2"/>',
  analisisFourier: '<path d="M2.5 13.5h11M4.3 13.5V3.4M7.1 13.5V7M9.9 13.5V9.6M12.7 13.5v-2.6"/>',
  analisisParam: '<path d="M2.5 2.5v11h11M3.6 11c2-.4 4-2 8.4-4.6M3.6 8.6c2-.4 4-2 8.4-4.6M3.6 13c2-.4 4-2 8.4-4.6"/>',
  ejecutar: '<path d="M2.5 13.5h11M5 2.8v8l6-4z"/>',
  graficas: '<path d="M2.5 2.5v11h11M3.6 10.6c1.8-1.2 3-6 4.6-6s2.2 5.2 4.2 5.2M3.6 7.4c2 0 2.6 4.4 4.6 4.4s2.6-6 4.2-6"/>',
  // Instrumentos.
  multimetro: '<path d="M3.5 1.8h9v12.4h-9zM5.3 3.8h5.4v3.3H5.3z"/><circle cx="8" cy="10.8" r="1.8"/>',
  osciloscopio: '<path d="M1.8 3h12.4v10H1.8zM3.6 8C4.6 4.6 5.8 4.6 6.6 8S8.6 11.4 9.4 8 11.4 4.6 12.4 8"/>',
  generador: '<circle cx="8" cy="8" r="5.9"/><path d="M4.6 8c.7-2.4 1.8-2.4 2.2 0s1.6 2.4 2.3 0 1.6-2.4 2.3 0"/>',
  fuenteVariable: '<circle cx="8" cy="8" r="4.6"/><path d="M2.4 13.6 13.6 2.4M10.6 2.4h3v3"/>',
  registro: '<path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01"/>',
  // Ayuda.
  ayuda: '<circle cx="8" cy="8" r="6.2"/><path d="M6.2 6.3a1.9 1.9 0 1 1 2.6 1.8c-.6.3-.8.7-.8 1.3v.4M8 11.6h.01"/>',
  paleta: '<path d="M2 3h12v10H2zM4.5 6.5l2 1.5-2 1.5M8 9.5h3.5"/>',
  ejemplos: '<path d="M8 4.2C6.6 3 4.5 2.8 2 3.2v9.6c2.5-.4 4.6-.2 6 1 1.4-1.2 3.5-1.4 6-1V3.2c-2.5-.4-4.6-.2-6 1zM8 4.2v9.6"/>',
  acerca: '<circle cx="8" cy="8" r="6.2"/><path d="M8 7.3v4M8 4.8h.01"/>',
  buscar: '<circle cx="6.8" cy="6.8" r="4.3"/><path d="M10 10l4 4"/>',
  mas: '<path d="M3.5 8h.01M8 8h.01M12.5 8h.01"/>',
  // Figuras de dibujo: un trayecto y sus círculos, como los demás.
  linea: '<path d="M3 13 13 3"/><circle cx="3" cy="13" r="1.3"/><circle cx="13" cy="3" r="1.3"/>',
  rectangulo: '<path d="M3.4 3.5h9.2a1.2 1.2 0 0 1 1.2 1.2v6.6a1.2 1.2 0 0 1-1.2 1.2H3.4a1.2 1.2 0 0 1-1.2-1.2V4.7a1.2 1.2 0 0 1 1.2-1.2z"/>',
  elipse: '<path d="M2 8a6 4.4 0 1 0 12 0a6 4.4 0 1 0-12 0z"/>',
  flecha: '<path d="M2.6 13.4 12.6 3.4M7.4 3.2h5.4v5.4"/>',
  figura: '<path d="M2.8 6.2h5.4a1 1 0 0 1 1 1v5.4a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1V7.2a1 1 0 0 1 1-1z"/><circle cx="10.8" cy="5.2" r="3.4"/>',
  // Hoja de atajos y menús: las órdenes que no tenían icono.
  cancelar: '<circle cx="8" cy="8" r="6"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/>',
  mover: '<path d="M8 2v12M2 8h12M6 4l2-2 2 2M6 12l2 2 2-2M4 6 2 8l2 2M12 6l2 2-2 2"/>',
  moverIzq: '<path d="M13.5 8H3M6.5 4.5 3 8l3.5 3.5"/>',
  moverDer: '<path d="M2.5 8H13M9.5 4.5 13 8l-3.5 3.5"/>',
  moverArriba: '<path d="M8 13.5V3M4.5 6.5 8 3l3.5 3.5"/>',
  moverAbajo: '<path d="M8 2.5V13M4.5 9.5 8 13l3.5-3.5"/>',
  menuContextual: '<path d="M2 2h8.5v10H2zM4 4.8h4.5M4 7.2h4.5M4 9.6h3M10 9l4.5 1.8-2 .8-.8 2z"/>',
  formato: '<path d="M4 11.5 8 3l4 8.5M5.6 8.4h4.8M2.5 14h11"/>',
  negrita: '<path d="M4.5 13V3l7 10V3"/>',
  cursiva: '<path d="M7 3 4.6 13M11.8 3 5.8 8.2M7.4 7 9.4 13"/>',
  subrayado: '<path d="M11 3.6C10.4 2.8 9.4 2.4 8 2.4c-1.7 0-3 .9-3 2.3 0 3 6 1.8 6 5 0 1.4-1.3 2.3-3 2.3-1.4 0-2.5-.5-3.1-1.4M3 14.4h10"/>',
  letraMayor: '<path d="M1.8 13.5 5.5 4h1l3.7 9.5M3.2 10.2h5.6M11.2 6l1.9-2.4L15 6"/>',
  letraMenor: '<path d="M1.8 13.5 5.5 4h1l3.7 9.5M3.2 10.2h5.6M11.2 3.6 13.1 6 15 3.6"/>',
  alinearIzq: '<path d="M2.5 3.5h11M2.5 6.5h7M2.5 9.5h11M2.5 12.5h7"/>',
  alinearCentro: '<path d="M2.5 3.5h11M4.5 6.5h7M2.5 9.5h11M4.5 12.5h7"/>',
  alinearDer: '<path d="M2.5 3.5h11M6.5 6.5h7M2.5 9.5h11M6.5 12.5h7"/>',
  justificar: '<path d="M2.5 3.5h11M2.5 6.5h11M2.5 9.5h11M2.5 12.5h11"/>',
  potMas: '<path d="M2 12.5h12M11.5 9.5V3M9.3 5.2l2.2-2.2 2.2 2.2"/><circle cx="5.5" cy="12.5" r="1.8"/>',
  potMenos: '<path d="M2 12.5h12M11.5 3v6.5M9.3 7.3l2.2 2.2 2.2-2.2"/><circle cx="5.5" cy="12.5" r="1.8"/>',
  quitarEsquina: '<path d="M2.5 13.5V5.5h6.5M14 10.5H9.5M11.5 8.5l-2 2 2 2"/><circle cx="9" cy="5.5" r="1.2"/>',
  invertirL: '<path d="M2.5 13.5V2.5h11M2.5 13.5h11V2.5"/>',
  ajusteAuto: '<path d="M2.2 9.2c1.1-4.6 2.3-4.6 3.2-.6s2.1 4 3.1 0 2.1-4.2 3.2-.2M12.8 1.8v3.4M11.1 3.5h3.4M2.2 13.4h8.2"/>',
  cursores: '<path d="M4.8 2.4v11.2M11.2 2.4v11.2M5.6 8h4.8M7 6.5 5.5 8 7 9.5M9 6.5 10.5 8 9 9.5"/>',
  zoomRestablecer: '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/><circle cx="8" cy="8" r="2.4"/>',
  masAjustes: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/><circle cx="5" cy="4.5" r="1.9"/><circle cx="10.5" cy="8" r="1.9"/><circle cx="6.5" cy="11.5" r="1.9"/>',
  ventanaAparte: '<path d="M5.8 2.4h7.8v6.4H5.8zM2 6.4h8.6v7.2H2z"/>',
  acoplar: '<path d="M2.4 2.4h11.2v11.2H2.4zM2.4 9.4h11.2M8 3.8v3.8M6.3 6.2 8 7.9l1.7-1.7"/>',
  grabar: '<circle cx="8" cy="8" r="6"/><path d="M5.2 8a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0-5.6 0z"/>'
}

;(function insertarIconos() {
  const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  sprite.setAttribute('aria-hidden', 'true')
  sprite.style.display = 'none'
  sprite.innerHTML = Object.entries(ICONOS)
    .map(([id, d]) => `<symbol id="i-${id}" viewBox="0 0 16 16">${d}</symbol>`)
    .join('')
  document.body.prepend(sprite)
  window.reemplazarIconos = (raiz = document) => {
    for (const i of raiz.querySelectorAll('i[data-i]')) {
      const id = i.dataset.i
      if (!ICONOS[id]) console.error('Icono que no existe: ' + id)
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      s.setAttribute('class', 'icono ' + (i.className || ''))
      s.setAttribute('viewBox', '0 0 16 16')
      s.setAttribute('aria-hidden', 'true')
      s.setAttribute('focusable', 'false')
      s.innerHTML = `<use href="#i-${id}"></use>`
      i.replaceWith(s)
    }
  }
  window.ICONOS_KIRCHI = ICONOS
})()
