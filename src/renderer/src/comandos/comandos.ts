import { ORDEN_VENTANA } from '../../../compartido/ventana'
// Solo el tipo del icono viene de la cinta (se borra al compilar): el editor y los menús usan esto sin depender de la interfaz.
import type { NombreIcono } from '../ui/cinta/trazos'

/** macOS: la pantalla completa va con Ctrl+Cmd+F, como en el menú de la aplicación. */
const ES_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform ?? '')

/**
 * Órdenes de la barra superior: cada una se declara aquí, en el modelo y en el mapa de acciones de `App.tsx`.
 */
export type IdComando =
  | 'guardar' | 'nuevo' | 'abrir' | 'guardar-como' | 'recientes' | 'exportar' | 'guardar-plantilla'
  | 'deshacer' | 'rehacer'
  | 'cortar' | 'copiar' | 'pegar' | 'duplicar' | 'borrar' | 'todo' | 'agrupar-encapsulados'
  | 'girar-izq' | 'girar' | 'espejo-x' | 'espejo-y' | 'restablecer-textos'
  | 'pieza' | 'figura' | 'figura-linea' | 'figura-rectangulo' | 'figura-elipse' | 'figura-flecha' | 'etiqueta' | 'tierra' | 'alimentacion' | 'nota'
  | 'simular' | 'detener' | 'voltajes'
  | 'avanzar' | 'retroceder' | 'avanzar-tiempo' | 'avanzar-hasta' | 'velocidad' | 'mas-lento' | 'mas-rapido' | 'corriente' | 'animaciones' | 'sonido' | 'numeros-patilla'
  | 'franja-osciloscopio' | 'franja-registro'
  | 'analisis-op' | 'analisis-dc' | 'analisis-ac' | 'analisis-tran' | 'analisis-fourier' | 'analisis-param' | 'analisis-ejecutar' | 'analisis-cancelar' | 'panel-analisis' | 'franja-graficas'
  | 'instrumentos' | 'analizar'
  | 'colocar-multimetro' | 'colocar-osciloscopio' | 'colocar-generador' | 'colocar-fuente'
  | 'encuadrar' | 'zoom-100' | 'zoom-menos' | 'zoom-mas'
  | 'panel-libreria' | 'panel-plantillas' | 'panel-proyecto' | 'panel-mediciones' | 'panel-calculadoras' | 'panel-inspector' | 'panel-instrumentos' | 'limpio'
  | 'grabar' | 'detener-grabacion'
  | 'tema' | 'pantalla-completa' | 'pagina-mas' | 'pagina-menos' | 'pagina-real'
  | 'atajos' | 'configuracion' | 'plegar-cinta' | 'aprender' | 'enfocar-tutorial' | 'ejemplos' | 'acerca'

export interface DefComandoCinta {
  /** Nombre en la cinta, en el globo y en el buscador. Simular, Tema, Franja y Plegar lo cambian con el estado (`textoDe`). */
  texto: string
  /** Nombre largo para el registro de atajos, la hoja, Configuración y el buscador («Girar 90° a la derecha»). Sin él, es
   * `texto`. */
  nombre?: string
  /** Nombre en el menú del clic derecho cuando no es `texto`: el largo o un rótulo de dónde actúa («Pegar aquí»).
   * `nombres.test.ts` lo vigila. */
  textoMenu?: string
  icono: NombreIcono
  /** Id del registro de atajos: su primera tecla vigente es la que se muestra y se anuncia. */
  tecla?: string
  /** Tecla que no está en el registro porque la atiende otro: el menú de la aplicación (F11) o un gesto («doble clic»). */
  teclaFija?: string
  /** Cambia el circuito: se deshabilita mientras corre la vista previa y en solo lectura. */
  edita?: boolean
  /** Abre un menú bajo su botón (Recientes, Exportar, Zoom de la página). */
  menu?: boolean
  /** Abre un panel de opciones bajo su botón (Grabar): lleva flecha, pero no es un menú. */
  popover?: boolean
  /** Botón partido (Grabar): el clic hace la orden con lo recordado y su flecha, aparte a la derecha, abre las opciones o el menú. */
  partido?: boolean
  /** Otras palabras con que el buscador lo encuentra. */
  palabras?: string
  /** Nombre accesible cuando el texto visible solo no se entiende («Todo»); contiene el texto visible (WCAG 2.5.3). */
  rotuloAccesible?: string
}

/** La única fuente del nombre, el icono y la tecla de cada orden de la barra (el buscador y la hoja de atajos leen de aquí). */
export const COMANDOS: Readonly<Record<IdComando, DefComandoCinta>> = {
  guardar: { texto: 'Guardar', icono: 'guardar', tecla: 'guardar' },
  nuevo: { texto: 'Nuevo', nombre: 'Nuevo circuito', icono: 'nuevo', tecla: 'nuevo' },
  abrir: { texto: 'Abrir…', nombre: 'Abrir un circuito', icono: 'abrir', tecla: 'abrir' },
  'guardar-como': { texto: 'Guardar como…', nombre: 'Guardar como', icono: 'guardarComo', tecla: 'guardar-como' },
  recientes: { texto: 'Recientes', icono: 'recientes', menu: true },
  exportar: { texto: 'Exportar', nombre: 'Exportar imagen', textoMenu: 'Exportar imagen', icono: 'exportar', palabras: 'imagen png svg pdf' },
  'guardar-plantilla': { texto: 'Plantilla…', nombre: 'Guardar como plantilla…', textoMenu: 'Guardar como plantilla…', icono: 'guardarComo', palabras: 'plantilla guardar seleccion reutilizar' },
  deshacer: { texto: 'Deshacer', icono: 'deshacer', tecla: 'deshacer', edita: true },
  rehacer: { texto: 'Rehacer', icono: 'rehacer', tecla: 'rehacer', edita: true },
  cortar: { texto: 'Cortar', icono: 'cortar', tecla: 'cortar', edita: true },
  copiar: { texto: 'Copiar', icono: 'copiar', tecla: 'copiar' },
  pegar: { texto: 'Pegar', nombre: 'Pegar en el cursor', textoMenu: 'Pegar aquí', icono: 'pegar', tecla: 'pegar', edita: true },
  duplicar: { texto: 'Duplicar', icono: 'duplicar', tecla: 'duplicar', edita: true },
  borrar: { texto: 'Borrar', nombre: 'Borrar la selección', icono: 'borrar', tecla: 'borrar', edita: true },
  'agrupar-encapsulados': { texto: 'Agrupar', nombre: 'Agrupar en encapsulados', textoMenu: 'Agrupar en encapsulados', icono: 'pieza', edita: true, palabras: 'unidades paquete encapsulado compuertas u1a referencias' },
  todo: { texto: 'Todo', nombre: 'Seleccionar todo', rotuloAccesible: 'Seleccionar todo', icono: 'todo', tecla: 'todo', palabras: 'seleccionar' },
  'girar-izq': { texto: 'Girar a la izquierda', nombre: 'Girar 90° a la izquierda', textoMenu: 'Girar 90° a la izquierda', icono: 'girarIzq', tecla: 'girar-izq', edita: true, palabras: 'rotar' },
  girar: { texto: 'Girar a la derecha', nombre: 'Girar 90° a la derecha', textoMenu: 'Girar 90° a la derecha', icono: 'girar', tecla: 'girar', edita: true, palabras: 'rotar' },
  'espejo-x': { texto: 'Reflejar horizontal', icono: 'espejoX', tecla: 'espejo-x', edita: true, palabras: 'espejo' },
  'espejo-y': { texto: 'Reflejar vertical', icono: 'espejoY', tecla: 'espejo-y', edita: true, palabras: 'espejo' },
  // Solo en el buscador (Ctrl+K): ya no está en el clic derecho.
  'restablecer-textos': { texto: 'Restablecer posición de los textos', icono: 'nota', edita: true, palabras: 'referencia valor texto pieza reparto automático acomodar' },
  pieza: { texto: 'Pieza…', icono: 'pieza', teclaFija: 'doble clic', edita: true, palabras: 'colocar buscar componente' },
  // Un botón con menú; las figuras no tienen tecla propia (el buscador las encuentra).
  figura: { texto: 'Figura', nombre: 'Figura de dibujo', icono: 'figura', edita: true, menu: true, palabras: 'dibujo marco línea rectángulo elipse flecha' },
  'figura-linea': { texto: 'Línea', nombre: 'Dibujar una línea', icono: 'linea', edita: true, palabras: 'figura dibujo raya' },
  'figura-rectangulo': { texto: 'Rectángulo', nombre: 'Dibujar un rectángulo', icono: 'rectangulo', edita: true, palabras: 'figura dibujo marco cuadro sección' },
  'figura-elipse': { texto: 'Elipse', nombre: 'Dibujar una elipse', icono: 'elipse', edita: true, palabras: 'figura dibujo círculo óvalo' },
  'figura-flecha': { texto: 'Flecha', nombre: 'Dibujar una flecha', icono: 'flecha', edita: true, palabras: 'figura dibujo señalar' },
  etiqueta: { texto: 'Etiqueta de red', icono: 'etiqueta', tecla: 'etiqueta', edita: true },
  tierra: { texto: 'Tierra', icono: 'tierra', tecla: 'tierra', edita: true },
  alimentacion: { texto: 'Alimentación', icono: 'alimentacion', edita: true, palabras: 'vcc 5v' },
  nota: { texto: 'Nota', nombre: 'Nota de texto', textoMenu: 'Nota de texto', icono: 'nota', tecla: 'nota', edita: true },
  simular: { texto: 'Simular', nombre: 'Simular, pausar o reanudar la vista previa', icono: 'simular', tecla: 'simular' },
  detener: { texto: 'Detener', nombre: 'Detener la vista previa', icono: 'detener', tecla: 'detener' },
  voltajes: { texto: 'Voltajes', nombre: 'Mostrar u ocultar los voltajes de todas las redes', icono: 'voltajes', tecla: 'voltajes' },
  // El tiempo y lo que se muestra al simular. Solo F6, C y M traen tecla; las demás se asignan en Configuración › Atajos.
  // «Avanzar en el tiempo» elige qué avanza (división, paso, tiempo fijo o un instante) y las flechas avanzan (F6) o
  // regresan (Shift+F6).
  'avanzar-tiempo': { texto: 'Avanzar', nombre: 'Elegir cuánto avanza cada avance', icono: 'tiempoAvanza', menu: true, palabras: 'intervalo división paso de cálculo tiempo fijo cuánto avanza' },
  avanzar: { texto: 'Avanzar', nombre: 'Avanzar lo elegido', icono: 'paso', tecla: 'avanzar', palabras: 'paso F6 intervalo un paso adelante' },
  retroceder: { texto: 'Retroceder', nombre: 'Retroceder al avance anterior', icono: 'pasoAtras', tecla: 'retroceder', palabras: 'atrás regresar deshacer avance paso anterior Shift F6' },
  'avanzar-hasta': { texto: 'Avanzar hasta t…', nombre: 'Avanzar hasta un instante', icono: 'hastaT', tecla: 'avanzar-hasta', palabras: 'tiempo instante correr hasta' },
  velocidad: { texto: 'Velocidad', nombre: 'Velocidad del tiempo', icono: 'velocidad', menu: true, palabras: 'cámara lenta tiempo rápido' },
  'mas-lento': { texto: 'Más lento', nombre: 'Tiempo más lento', icono: 'masLento', tecla: 'mas-lento', palabras: 'velocidad cámara lenta' },
  'mas-rapido': { texto: 'Más rápido', nombre: 'Tiempo más rápido', icono: 'masRapido', tecla: 'mas-rapido', palabras: 'velocidad' },
  corriente: { texto: 'Corriente', nombre: 'Mostrar u ocultar la corriente animada', icono: 'corriente', tecla: 'corriente', palabras: 'flechas corriente animada' },
  animaciones: { texto: 'Animaciones', nombre: 'Pausar o reanudar las animaciones', icono: 'animaciones', tecla: 'animaciones', palabras: 'movimiento pausa flechas rotor' },
  'numeros-patilla': { texto: 'Números de pin', nombre: 'Mostrar u ocultar los números de pin de los circuitos integrados', icono: 'pieza', palabras: 'pines patillas pin dip encapsulado chip numeración' },
  sonido: { texto: 'Sonido', nombre: 'Silenciar o activar el sonido', icono: 'sonido', tecla: 'sonido', palabras: 'silencio volumen zumbador pitido' },
  'franja-osciloscopio': { texto: 'Osciloscopio', nombre: 'Pestaña Osciloscopio de la franja', icono: 'osciloscopio', palabras: 'franja instrumentos pantalla scope' },
  // Los dos botones con menú de Inicio. Instrumentos coloca uno; Analizar abre la ficha de cada análisis y los resultados.
  instrumentos: { texto: 'Instrumentos', nombre: 'Colocar un instrumento', icono: 'osciloscopio', menu: true, palabras: 'multímetro osciloscopio generador fuente variable menú' },
  analizar: { texto: 'Analizar', nombre: 'Elegir un análisis', icono: 'analisis', menu: true, palabras: 'análisis ngspice menú bode transitorio punto de operación' },
  // Colocar un instrumento (sin tecla propia; el buscador de comandos las encuentra).
  'colocar-multimetro': { texto: 'Multímetro', nombre: 'Colocar un multímetro', icono: 'multimetro', edita: true, palabras: 'instrumento voltímetro amperímetro óhmetro tester' },
  'colocar-osciloscopio': { texto: 'Osciloscopio', nombre: 'Colocar un osciloscopio', icono: 'osciloscopio', edita: true, palabras: 'instrumento scope' },
  'colocar-generador': { texto: 'Generador', nombre: 'Colocar un generador de funciones', icono: 'generador', edita: true, palabras: 'instrumento función señal' },
  'colocar-fuente': { texto: 'Fuente variable', nombre: 'Colocar una fuente variable', icono: 'fuenteVariable', edita: true, palabras: 'instrumento fuente de laboratorio banco' },
  'franja-registro': { texto: 'Registro', icono: 'registro', palabras: 'franja mensajes' },
  // Un botón por análisis de ngspice (abre su ficha en la franja), Ejecutar y Cancelar. Sin tecla; Ctrl+K los encuentra.
  'analisis-op': { texto: 'Punto de operación', icono: 'analisisOp', edita: true, palabras: 'análisis ngspice dc reposo polarización voltajes de cada red' },
  'analisis-dc': { texto: 'Barrido de CD', nombre: 'Análisis de barrido de CD', icono: 'analisisDc', edita: true, palabras: 'análisis ngspice dc curva característica iv barrido de fuente' },
  'analisis-ac': { texto: 'CA / Bode', nombre: 'Análisis de CA (diagrama de Bode)', icono: 'analisisAc', edita: true, palabras: 'análisis ngspice ac bode frecuencia respuesta filtro ganancia fase' },
  'analisis-tran': { texto: 'Transitorio', nombre: 'Análisis transitorio', icono: 'analisisTran', edita: true, palabras: 'análisis ngspice tiempo largo condiciones iniciales' },
  'analisis-fourier': { texto: 'Fourier', nombre: 'Análisis de Fourier', icono: 'analisisFourier', edita: true, palabras: 'análisis ngspice armónicos thd espectro distorsión' },
  'analisis-param': { texto: 'Barrido de parámetro', icono: 'analisisParam', edita: true, palabras: 'análisis ngspice valor de una pieza lista rango variar resistencia capacitor' },
  'analisis-ejecutar': { texto: 'Ejecutar', nombre: 'Ejecutar el análisis elegido', icono: 'ejecutar', palabras: 'análisis ngspice correr calcular' },
  'analisis-cancelar': { texto: 'Cancelar', nombre: 'Detener el análisis en curso o cancelar el que se prepara', icono: 'cancelar', palabras: 'análisis ngspice detener' },
  // La ficha de configuración vive en la pestaña Análisis del riel derecho (ya no en la franja).
  'panel-analisis': { texto: 'Panel Análisis', nombre: 'Panel Análisis del riel derecho', icono: 'analisis', palabras: 'análisis ngspice configurar ficha panel derecho riel' },
  'franja-graficas': { texto: 'Gráficas', nombre: 'Pestaña Gráficas de la franja', icono: 'graficas', palabras: 'análisis ngspice resultados corridas tabla franja' },
  encuadrar: { texto: 'Encuadrar', nombre: 'Encuadrar todo', textoMenu: 'Encuadrar todo', icono: 'encuadrar', tecla: 'encuadrar', palabras: 'zoom' },
  'zoom-100': { texto: 'Tamaño real', icono: 'tamañoReal', palabras: 'zoom 100' },
  // Los botones − y + del control de zoom (Vista › Zoom y la barra de estado).
  'zoom-menos': { texto: 'Alejar', nombre: 'Alejar el lienzo', icono: 'alejar', palabras: 'zoom menos' },
  'zoom-mas': { texto: 'Acercar', nombre: 'Acercar el lienzo', icono: 'acercar', palabras: 'zoom más' },
  'panel-libreria': { texto: 'Librería', icono: 'libreria', palabras: 'panel' },
  'panel-plantillas': { texto: 'Plantillas', nombre: 'Panel de plantillas', icono: 'plantillas', palabras: 'panel guardar reutilizar circuitos ejemplos' },
  'panel-proyecto': { texto: 'Proyecto', nombre: 'Panel Proyecto del riel derecho', icono: 'proyecto', palabras: 'panel derecho riel piezas redes' },
  'panel-mediciones': { texto: 'Mediciones', nombre: 'Panel Mediciones del riel derecho', icono: 'mediciones', palabras: 'panel derecho riel lecturas voltaje corriente multímetro' },
  'panel-calculadoras': { texto: 'Calculadoras', nombre: 'Panel de calculadoras', icono: 'calculadoras', palabras: 'panel divisor led filtro 555 amplificador cálculo' },
  'panel-inspector': { texto: 'Inspector', nombre: 'Panel Inspector del riel derecho', icono: 'inspector', palabras: 'panel derecho riel propiedades valores' },
  'panel-instrumentos': { texto: 'Franja', nombre: 'Franja de instrumentos', icono: 'franja', palabras: 'panel instrumentos osciloscopio registro plegar' },
  limpio: { texto: 'Lienzo limpio', nombre: 'Lienzo limpio (ocultar o mostrar los paneles)', icono: 'lienzoLimpio', tecla: 'limpio', palabras: 'paneles' },
  // Grabar la pantalla. Sin tecla de fábrica; se asignan en Configuración › Atajos.
  grabar: { texto: 'Grabar', nombre: 'Grabar la pantalla', icono: 'grabar', tecla: 'grabar', popover: true, partido: true, palabras: 'grabar pantalla video captura screencast micrófono voz clase' },
  'detener-grabacion': { texto: 'Detener la grabación', icono: 'detener', tecla: 'detener-grabacion', palabras: 'grabar pantalla video parar terminar' },
  tema: { texto: 'Tema', icono: 'sol', palabras: 'tema claro oscuro' },
  'pantalla-completa': { texto: ORDEN_VENTANA['pantalla-completa'].nombre, icono: 'pantallaCompleta', teclaFija: ORDEN_VENTANA['pantalla-completa'].tecla(ES_MAC) },
  // Las del control del tamaño de la interfaz (Vista › Ventana): el menú Ver de la aplicación, con sus mismos nombres y teclas.
  'pagina-mas': { texto: ORDEN_VENTANA.acercar.nombre, icono: 'acercar', teclaFija: ORDEN_VENTANA.acercar.tecla(ES_MAC), palabras: 'zoom' },
  'pagina-menos': { texto: ORDEN_VENTANA.alejar.nombre, icono: 'alejar', teclaFija: ORDEN_VENTANA.alejar.tecla(ES_MAC), palabras: 'zoom' },
  'pagina-real': { texto: ORDEN_VENTANA['tamaño-real'].nombre, icono: 'tamañoReal', teclaFija: ORDEN_VENTANA['tamaño-real'].tecla(ES_MAC), palabras: 'zoom 100' },
  atajos: { texto: 'Atajos', nombre: 'Hoja de atajos', icono: 'atajos', tecla: 'atajos', palabras: 'teclado hoja' },
  configuracion: { texto: 'Configuración', icono: 'configuracion', tecla: 'configuracion', palabras: 'ajustes' },
  'plegar-cinta': { texto: 'Plegar la cinta', nombre: 'Plegar o fijar la cinta', icono: 'arriba', tecla: 'plegar-cinta', palabras: 'fijar' },
  // Tutorial: el selector de capítulos de «Aprende Kirchi»; sin tecla, vive en Ayuda y en el buscador Ctrl+K.
  aprender: { texto: 'Aprende Kirchi', nombre: 'Aprende Kirchi (tutorial)', icono: 'ayuda', palabras: 'tutorial ayuda aprender curso guía recorrido capítulos primer circuito' },
  // Lleva el foco al globo del tutorial en marcha (el globo no está en el orden de tabulación del editor).
  // Ayuda: las plantillas incluidas son los ejemplos; Acerca de abre la ficha de Kirchi.
  ejemplos: { texto: 'Ejemplos', nombre: 'Ejemplos de circuitos', icono: 'libreria', palabras: 'plantillas incluidas circuitos modelos' },
  acerca: { texto: 'Acerca de', nombre: 'Acerca de Kirchi', icono: 'ayuda', palabras: 'versión licencia autor créditos' },
  'enfocar-tutorial': { texto: 'Ir al tutorial', nombre: 'Ir al globo del tutorial', icono: 'ayuda', tecla: 'enfocar-tutorial', palabras: 'aprende kirchi globo paso foco ayuda' }
}

/** Nombre de un comando en el menú del clic derecho. */
export const textoMenu = (id: IdComando): string => COMANDOS[id].textoMenu ?? COMANDOS[id].texto

/** Las órdenes del menú Zoom de la página y la orden de la ventana que mandan. */
export const ORDEN_DE_PAGINA = { 'pagina-mas': 'acercar', 'pagina-menos': 'alejar', 'pagina-real': 'tamaño-real' } as const
export type IdDePagina = keyof typeof ORDEN_DE_PAGINA
export const esDePagina = (id: string): id is IdDePagina => Object.hasOwn(ORDEN_DE_PAGINA, id)

/** Las órdenes del menú Figura y la figura que dibuja cada una. */
export const FIGURA_DE_COMANDO = { 'figura-linea': 'linea', 'figura-rectangulo': 'rectangulo', 'figura-elipse': 'elipse', 'figura-flecha': 'flecha' } as const
export type IdDeFigura = keyof typeof FIGURA_DE_COMANDO
export const esDeFigura = (id: string): id is IdDeFigura => Object.hasOwn(FIGURA_DE_COMANDO, id)

/** Nombre largo de un comando: el del registro de atajos, la hoja y Configuración. */
export const nombreLargo = (id: IdComando): string => COMANDOS[id].nombre ?? COMANDOS[id].texto

/** Órdenes del clic derecho idénticas a su botón de la cinta (`App.tsx` las ejecuta con la misma acción). Duplicar y Pegar
 * aquí actúan en el punto del clic y no están. */
export const EN_MENUS = [
  'girar', 'girar-izq', 'espejo-x', 'espejo-y', 'cortar', 'copiar', 'borrar', 'etiqueta', 'tierra', 'nota', 'encuadrar',
  'configuracion', 'nuevo', 'abrir', 'guardar', 'guardar-como',
  // Lo que la cinta ofrece de un instrumento seleccionado también está en su clic derecho.
  'panel-inspector', 'panel-mediciones', 'franja-osciloscopio', 'franja-registro'
] as const satisfies readonly IdComando[]
export type IdDeMenu = (typeof EN_MENUS)[number]

/** Lo que abren los menús Instrumentos y Analizar de Inicio: cada entrada es la orden de la cinta de ese nombre. */
export const EN_MENUS_DE_CINTA = [
  'colocar-multimetro', 'colocar-osciloscopio', 'colocar-generador', 'colocar-fuente',
  'analisis-op', 'analisis-dc', 'analisis-ac', 'analisis-tran', 'analisis-fourier', 'analisis-param', 'franja-graficas', 'panel-analisis'
] as const satisfies readonly IdComando[]
export type IdDeMenuDeCinta = (typeof EN_MENUS_DE_CINTA)[number]
export const esDeMenuDeCinta = (id: string): id is IdDeMenuDeCinta => (EN_MENUS_DE_CINTA as readonly string[]).includes(id)
export const esDeMenu = (id: string): id is IdDeMenu => (EN_MENUS as readonly string[]).includes(id)
