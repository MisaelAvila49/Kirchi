import { vio } from './condiciones'
import { control, FRANJA, LIENZO, mira, PANEL_DERECHO, PANEL_IZQUIERDO, PESTANAS_CINTA, RIEL_DERECHO, RIEL_IZQUIERDO } from './pasos'
import type { CapituloDef } from './tipos'

/** El cuadro de búsqueda de comandos, en el título de la cinta (Ctrl+K). */
export const CAMPO_BUSCAR_COMANDO = '.buscar-comando input'

/**
 * Capítulo 1: un recorrido por la ventana. Cuatro pasos «Mira» enmarcan sus zonas y siete «Haz» enseñan a moverse: zoom, desplazar, encuadrar, pantalla completa, lienzo limpio, buscar un comando y la hoja de atajos. Parte de un circuito sencillo ya armado.
 */
export const CAPITULO_1: CapituloDef = {
  id: 'conoce',
  numero: 1,
  titulo: 'Conoce Kirchi',
  resumen: 'La ventana y cómo moverse en ella',
  descripcion: 'Recorre la cinta, los paneles y la franja, y aprende a mover la vista, buscar un comando y abrir la hoja de atajos.',
  minutos: 4,
  tono: 'verdeazul',
  totalPasos: 11,
  arranque: true,
  zona: { minX: -14, minY: -16, maxX: 48, maxY: 24 },
  pasos: [
    mira({
      id: 'cinta',
      resumen: 'mira la cinta',
      texto: 'Arriba está la cinta, con tres pestañas: Inicio, Vista y Ayuda.',
      pista: 'Inicio trae lo que usas más: archivo, colocar, simular. Vista, los paneles y el zoom.',
      objetivo: () => control(PESTANAS_CINTA)
    }),
    mira({
      id: 'izquierdo',
      abre: 'libreria',
      resumen: 'mira el panel izquierdo',
      texto: 'A la izquierda se coloca: {icono:libreria|Librería}, {icono:plantillas|Plantillas} y {icono:calculadoras|Calculadoras}.',
      objetivo: () => control(RIEL_IZQUIERDO),
      focos: () => [control(PANEL_IZQUIERDO)]
    }),
    mira({
      id: 'derecho',
      abre: 'inspector',
      resumen: 'mira el panel derecho',
      texto: 'A la derecha se ve cómo funciona: {icono:inspector|Inspector}, {icono:mediciones|Mediciones}, {icono:proyecto|Proyecto} y {icono:analisis|Análisis}.',
      objetivo: () => control(RIEL_DERECHO),
      focos: () => [control(PANEL_DERECHO)]
    }),
    mira({
      id: 'franja',
      abre: 'osciloscopio',
      resumen: 'mira la franja de abajo',
      texto: 'Abajo está la franja de instrumentos: {icono:osciloscopio|Osciloscopio}, {icono:graficas|Gráficas} y {icono:registro|Registro}.',
      objetivo: () => control(FRANJA)
    }),
    {
      id: 'zoom',
      resumen: 'acerca y aleja con la rueda',
      texto: 'Gira la {gesto:rueda} sobre el lienzo para acercar o alejar.',
      cumplido: 'Zoom cambiado.',
      pista: 'El zoom se centra donde está el puntero.',
      transitorio: true,
      objetivo: () => control(LIENZO),
      hecho: (ctx) => vio(ctx, 'zoom-rueda')
    },
    {
      id: 'desplazar',
      resumen: 'mueve la vista',
      texto: 'Mantén {kbd:Espacio} y {gesto:arrastrar} sobre el lienzo para mover la vista.',
      cumplido: 'Vista movida.',
      pista: 'También sirve arrastrar con el botón central del ratón.',
      transitorio: true,
      objetivo: () => control(LIENZO),
      hecho: (ctx) => vio(ctx, 'desplazar-vista')
    },
    {
      id: 'encuadrar',
      resumen: 'encuadra todo el circuito',
      texto: 'Pulsa {tecla:encuadrar} para ver el circuito entero.',
      cumplido: 'Circuito encuadrado.',
      pista: 'Sirve cuando te pierdes en el lienzo.',
      transitorio: true,
      objetivo: () => control(LIENZO),
      hecho: (ctx) => vio(ctx, 'encuadrar')
    },
    {
      id: 'pantalla-completa',
      resumen: 'pasa a pantalla completa y vuelve',
      texto: 'Pulsa {kbd:F11} para la pantalla completa y otra vez {kbd:F11} para salir.',
      cumplido: 'Pantalla completa probada.',
      transitorio: true,
      objetivo: () => control('[data-comando="pantalla-completa"]', 'vista'),
      hecho: (ctx) => vio(ctx, 'pantalla-completa-si') && vio(ctx, 'pantalla-completa-no')
    },
    {
      id: 'limpio',
      resumen: 'oculta los paneles y vuelve',
      texto: 'Pulsa {tecla:limpio} para ocultar los paneles y otra vez para volver.',
      cumplido: 'Lienzo limpio probado.',
      pista: 'Deja solo el circuito, útil para mostrarlo o grabarlo.',
      transitorio: true,
      objetivo: () => control('[data-comando="limpio"]', 'vista'),
      hecho: (ctx) => vio(ctx, 'limpio-si') && vio(ctx, 'limpio-no')
    },
    {
      id: 'comandos',
      resumen: 'busca un comando',
      texto: 'Pulsa {tecla:buscar-comando} y escribe el nombre de un comando.',
      cumplido: 'Buscador de comandos abierto.',
      pista: 'Cualquier orden está ahí, aunque no recuerdes en qué pestaña.',
      transitorio: true,
      objetivo: () => control(CAMPO_BUSCAR_COMANDO),
      hecho: (ctx) => vio(ctx, 'buscar-comando')
    },
    {
      id: 'atajos',
      resumen: 'abre la hoja de atajos',
      texto: 'Abre la hoja de atajos con {tecla:atajos}.',
      cumplido: 'Hoja de atajos abierta.',
      pista: 'Ahí están todas las teclas y se pueden cambiar.',
      transitorio: true,
      objetivo: () => control('[data-comando="atajos"]', 'ayuda'),
      hecho: (ctx) => ctx.dialogo === 'atajos'
    }
  ]
}
