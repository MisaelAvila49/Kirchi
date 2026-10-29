import { tipoDeFicha } from '../../analisis/fichas'
import { leerValor } from '../../valores/valores'
import { mismoValor, notchColocado, vio } from './condiciones'
import { control, mira } from './pasos'
import type { CapituloDef, PasoDef } from './tipos'

/** El botón de Exportar de la barra de la gráfica y el de Exportar del diálogo de la figura. */
export const BOTON_EXPORTAR_GRAFICA = '.barra-instrumento [data-accion="exportar"]'
export const BOTON_EXPORTAR_FIGURA = '.exportar-editor .editor-pie-acciones .principal'
/** Una zona del panel de la figura: `EditorFigura` la marca con `data-zona`. */
export const zonaDeFigura = (id: string): string => `.editor-propiedades [data-zona="${id}"]`
/** Las zonas del diálogo de exportar el esquema. */
export const HERRAMIENTAS_ESQUEMA = '.exportar-esquema .editor-herramientas'
export const ALCANCE_ESQUEMA = '.exportar-esquema [role="radiogroup"][aria-label="Qué se exporta"]'
export const FORMATOS_ESQUEMA = '.exportar-esquema .editor-pie-formato'
const CALCULADORA_FILTROS = '.calc-eleccion[data-calculadora="filtro"]'

/** Un paso «Mira» sobre una zona del panel de la figura: se dibuja encima del diálogo. */
const zonaFigura = (id: string, resumen: string, texto: string): PasoDef => mira({ id: `figura-${id}`, sobreDialogo: true, resumen, texto, objetivo: () => control(zonaDeFigura(id)) })

/**
 * Capítulo 4: un filtro notch de la calculadora, su diagrama de Bode, leer la gráfica con cursores y exportarla (con su editor de figura, también con varios elementos a la vez) y exportar el esquema. Parte de un lienzo vacío. Ejecutar y exportar se cumplen con eventos de la aplicación, porque el resultado y los diálogos no se leen del documento.
 */
export const CAPITULO_4: CapituloDef = {
  id: 'analizar',
  numero: 4,
  titulo: 'Analizar y exportar',
  resumen: 'Calculadora, Bode y exportar la gráfica y el esquema',
  descripcion: 'Genera un filtro notch con la calculadora, calcula su respuesta en frecuencia, lee la gráfica con cursores y expórtala; después exporta el esquema.',
  minutos: 10,
  tono: 'violeta',
  totalPasos: 25,
  documentoNuevo: true,
  zona: { minX: -14, minY: -24, maxX: 56, maxY: 40 },
  pasos: [
    {
      id: 'filtros',
      abre: 'calculadoras',
      resumen: 'elige la calculadora de filtros',
      texto: 'En {icono:calculadoras|Calculadoras}, elige Filtros.',
      cumplido: 'Calculadora de filtros abierta.',
      pista: 'Las calculadoras dan los valores de las piezas a partir de lo que quieres lograr.',
      transitorio: true,
      objetivo: () => control(CALCULADORA_FILTROS, undefined, '.riel-boton[data-panel="calculadoras"]'),
      hecho: (ctx) => ctx.izquierdo === 'calculadoras' && ctx.calculadora?.activa === 'filtro'
    },
    {
      id: 'notch',
      resumen: 'elige un notch de 60 Hz',
      texto: 'En Tipo, elige Notch de doble T con el muesco en 60 Hz.',
      cumplido: 'Notch de 60 Hz preparado.',
      pista: 'El notch deja pasar todo menos una frecuencia, aquí la del zumbido de la red eléctrica.',
      transitorio: true,
      objetivo: () => control('.panel-calculadoras .calc-campos select'),
      hecho: (ctx) => ctx.calculadora?.activa === 'filtro' && ctx.calculadora.tipo === 'notch' && mismoValor(leerValor(ctx.calculadora.f0 ?? '')?.valor ?? null, 60)
    },
    {
      id: 'generar',
      resumen: 'genera el circuito',
      texto: 'Pulsa Generar circuito y haz clic en el lienzo para colocarlo.',
      cumplido: 'Circuito colocado.',
      pista: 'El circuito trae su generador y las piezas con los valores calculados.',
      objetivo: () => control('.panel-calculadoras [data-accion="generar"]'),
      hecho: notchColocado
    },
    {
      id: 'bode',
      abre: 'analisis',
      resumen: 'elige el análisis CA / Bode',
      texto: 'En Inicio, abre {icono:analisis|Analizar} y elige CA / Bode.',
      cumplido: 'Análisis de CA preparado.',
      pista: 'Calcula cuánto pasa de cada frecuencia por el filtro.',
      objetivo: () => control('[data-comando="analizar"]', 'inicio'),
      hecho: (ctx) => Object.values(ctx.doc.analisis ?? {}).some((a) => tipoDeFicha(a) === 'ac')
    },
    {
      id: 'ejecutar',
      resumen: 'ejecuta el análisis',
      texto: 'Pulsa {icono:ejecutar|Ejecutar} en el panel de Análisis.',
      cumplido: 'Bode calculado.',
      pista: 'La gráfica con la ganancia y la fase se abre abajo, en Gráficas.',
      transitorio: true,
      objetivo: () => control('[data-comando="analisis-ejecutar"]'),
      hecho: (ctx) => vio(ctx, 'bode-listo')
    },
    {
      id: 'cursores-grafica',
      abre: 'graficas',
      resumen: 'lee la gráfica con cursores',
      texto: 'Pulsa {icono:cursores|Cursores}, arriba de la gráfica.',
      cumplido: 'Cursores encendidos.',
      pista: 'Arrastra las líneas para leer la ganancia y la fase a cada frecuencia.',
      transitorio: true,
      objetivo: () => control('.barra-instrumento [data-accion="cursores"]'),
      hecho: (ctx) => ctx.cursoresGrafica === true
    },
    {
      id: 'abrir-figura',
      resumen: 'abre la exportación de la gráfica',
      texto: 'Pulsa {icono:exportar|Exportar}, arriba de la gráfica.',
      cumplido: 'Exportación de la gráfica abierta.',
      pista: 'Sale con título, leyenda y escala, en PNG, SVG, PDF o CSV.',
      transitorio: true,
      objetivo: () => control(BOTON_EXPORTAR_GRAFICA),
      hecho: (ctx) => ctx.dialogo === 'exportar-grafica'
    },
    {
      id: 'informe',
      sobreDialogo: true,
      resumen: 'elige el estilo Informe',
      texto: 'Arriba del diálogo, en Estilo, elige Informe.',
      cumplido: 'Estilo Informe elegido.',
      pista: 'Informe apila la ganancia y la fase en dos paneles, con título y leyenda, como una figura de artículo.',
      transitorio: true,
      objetivo: () => control('.exportar-editor .selector-estilo'),
      hecho: (ctx) => vio(ctx, 'figura-informe')
    },
    zonaFigura('restablecer', 'mira Restablecer figura', 'Restablecer figura devuelve la figura a como se abrió.'),
    zonaFigura('datos', 'mira Datos', 'Datos elige qué trazas salen en la figura.'),
    zonaFigura('tema', 'mira Tema', 'Tema cambia entre una figura clara y una oscura.'),
    zonaFigura('mostrar', 'mira Mostrar', 'Mostrar enciende o apaga los ejes con sus escalas.'),
    zonaFigura('letra', 'mira Letra', 'Letra elige la familia y el tamaño del texto.'),
    zonaFigura('texto', 'mira la apariencia del texto', 'Apariencia de texto cambia el color y el grosor de los números.'),
    zonaFigura('rejilla', 'mira la rejilla', 'Rejilla elige su estilo, su grosor y sus subdivisiones.'),
    zonaFigura('ejes', 'mira el grosor de los ejes', 'Los ejes tienen su propio grosor.'),
    zonaFigura('adornos', 'mira los adornos', 'Adornos agrega título, leyenda, marco y resplandor.'),
    {
      id: 'varios',
      sobreDialogo: true,
      resumen: 'elige varias trazas a la vez',
      texto: 'Haz clic en una traza de la figura y, con {kbd:Mayús}, en otra del mismo tipo.',
      cumplido: 'Dos elementos elegidos.',
      pista: 'También sirve con varios textos, etiquetas o ejes.',
      transitorio: true,
      objetivo: () => control('.exportar-editor .editor-centro'),
      hecho: (ctx) => vio(ctx, 'figura-seleccion-multiple')
    },
    {
      id: 'juntos',
      sobreDialogo: true,
      resumen: 'cambia los elegidos juntos',
      texto: 'Cambia el color o el grosor en el panel: se aplica a todos los elegidos.',
      cumplido: 'Cambio aplicado a varios.',
      transitorio: true,
      objetivo: () => control('.exportar-editor .editor-propiedades'),
      hecho: (ctx) => vio(ctx, 'figura-cambio-multiple')
    },
    {
      id: 'exportar-figura',
      sobreDialogo: true,
      resumen: 'exporta la gráfica',
      texto: 'Pulsa Exportar, abajo a la derecha, y guarda la imagen.',
      cumplido: 'Gráfica exportada.',
      transitorio: true,
      objetivo: () => control(BOTON_EXPORTAR_FIGURA),
      hecho: (ctx) => vio(ctx, 'grafica-exportada')
    },
    {
      id: 'abrir-esquema',
      resumen: 'abre la exportación del esquema',
      texto: 'En Inicio, pulsa {icono:exportar|Exportar} para exportar el esquema.',
      cumplido: 'Exportación del esquema abierta.',
      transitorio: true,
      objetivo: () => control('[data-comando="exportar"]', 'inicio'),
      hecho: (ctx) => ctx.dialogo === 'exportar-esquema'
    },
    mira({
      id: 'esquema-herramientas',
      sobreDialogo: true,
      resumen: 'mira las herramientas de anotación',
      texto: 'Las herramientas de anotación ponen textos, flechas, cuadros y lecturas sobre el esquema.',
      objetivo: () => control(HERRAMIENTAS_ESQUEMA)
    }),
    mira({
      id: 'esquema-seleccion',
      sobreDialogo: true,
      resumen: 'mira Solo la selección',
      texto: 'Qué se exporta permite elegir Solo la selección, el área o todo el circuito.',
      objetivo: () => control(ALCANCE_ESQUEMA)
    }),
    mira({
      id: 'esquema-formatos',
      sobreDialogo: true,
      resumen: 'mira los formatos',
      texto: 'Abajo se elige el formato: SVG, PNG o PDF.',
      objetivo: () => control(FORMATOS_ESQUEMA)
    }),
    {
      id: 'exportar-esquema',
      sobreDialogo: true,
      resumen: 'exporta el esquema',
      texto: 'Pulsa Exportar, abajo a la derecha, y guarda el archivo.',
      cumplido: 'Esquema exportado.',
      pista: 'Con {tecla:guardar} guardas el circuito en un archivo .kir.',
      transitorio: true,
      objetivo: () => control('.exportar-esquema .editor-pie-acciones .principal'),
      hecho: (ctx) => vio(ctx, 'exportado') || vio(ctx, 'exportado-seleccion')
    }
  ]
}
