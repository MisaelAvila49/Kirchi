import type { Punto } from '../doc/tipos'
import type { GenerarDef } from './generadores'
import type { TablaDef } from './tablaVerdad'

export interface PinDef {
  id: string
  nombre: string
  /** Unidades de rejilla fina relativas al origen de la pieza. */
  x: number
  y: number
  /** Una nota para el globo del pin: renglones separados por « · » que salen bajo el nombre (las resistencias de ajuste de un regulador). */
  ayuda?: string
}

export interface PropDef {
  id: string
  nombre: string
  unidad?: string
  defecto: string
  /** Valores sugeridos (serie E12) que muestra el buscador. */
  comunes?: string[]
  /** Valores comerciales: el editor ofrece una serie para este valor numérico, `elegida` (Configuración) o una fija
   * (electrolítico, E6), con vecinos y una nota si no es comercial. Nunca bloquea. */
  serie?: 'elegida' | 'E6' | 'E12' | 'E24'
  /** Catálogo: `comunes` son valores de catálogo (el Zener) ofrecidos como botones; cualquier otro es «Personalizado», en
   * «Más ajustes». El documento guarda el mismo texto: solo cambia cómo se muestra. */
  catalogo?: boolean
  /** Si existe, la propiedad es una lista cerrada (interruptor abierto/cerrado). */
  opciones?: string[]
  /** En una lista cerrada: la opción elegida se dibuja como valor de la pieza (si no hay propiedad numérica). */
  mostrar?: boolean
  /** Texto libre (el nombre de un terminal de alimentación): sin unidad ni notación de ingeniería; `defecto` es su texto. */
  texto?: boolean
  /** Largo máximo de un texto largo (el aspecto del osciloscopio guarda muchos pares); sin él, `MAX_TEXTO_PROP`. Solo con `texto`. */
  largoMax?: number
  /** Una lista de dos opciones que el inspector muestra como casilla; la segunda es la marcada («Instrumento ideal»). */
  casilla?: boolean
  /** Un ajuste de instrumento (los voltios por división): no es el valor que se dibuja junto a la pieza ni el del buscador. */
  ajuste?: boolean
  /** No se escribe al crear la pieza, solo cuando el usuario la cambia (potencia nominal de la resistencia): los circuitos
   * nuevos y los viejos guardan los mismos bytes. */
  omitir?: boolean
  /** Valor numérico que puede quedar vacío (la condición inicial de un capacitor): vacío es «sin valor» y su `defecto` es «». */
  opcional?: boolean
  /** Perilla en vivo: la propiedad se mueve mientras simula y llega al motor por un canal. La unidad es la de la magnitud
   * (°C, lx, N·m); `escala: 'log'` (luz) hace que cada muesca multiplique en vez de sumar (`paso` y `pasoFino` cuentan muescas por década) y exige `min` positivo. */
  enVivo?: EnVivo
}

export interface EnVivo {
  magnitud: 'temperatura' | 'luz' | 'carga'
  min: number
  max: number
  paso: number
  pasoFino: number
  escala?: 'log'
}

/** Un valor numérico con valores comunes (sin lista cerrada, texto libre ni ajuste de instrumento) ofrece su lista plegable. */
export const comunesDeLaFicha = (d: PropDef): boolean => !!d.comunes && d.comunes.length > 0 && !d.opciones && !d.texto && !d.ajuste && !d.catalogo && !d.serie

/** Largo máximo del texto de una propiedad `texto`. */
export const MAX_TEXTO_PROP = 24
/** El tope de `largoMax` de una propiedad de texto largo. */
export const MAX_TEXTO_LARGO = 6000

/** Texto que se dibuja derecho dentro o junto al símbolo: su ancla gira con la pieza, el texto no. */
export interface Rotulo {
  /** Texto fijo; con `prop`, el de la propiedad `texto` cuando la pieza no la trae. */
  texto: string
  /** Id de una propiedad `texto` o de lista de la pieza: el rótulo dibuja su valor (el nombre de un terminal, el modo). */
  prop?: string
  /** Con `prop` de lista: el texto de cada opción («V DC» → «V»); una opción que no está aquí se escribe tal cual. */
  valores?: Record<string, string>
  /** Ancla en unidades de rejilla fina del símbolo (antes de girar). */
  x: number
  y: number
  /** Alto de la letra en mm. */
  tam: number
  /** Hacia dónde crece el texto desde el ancla, en el símbolo sin girar: `izq` (a la derecha del ancla), `der` (a su
   * izquierda), `centro`, o `arriba`/`abajo` para texto que cuelga de un borde horizontal (centrado sin girar; girado 90°
   * o 270° crece hacia adentro del cuerpo). */
  alinear: 'izq' | 'centro' | 'der' | 'arriba' | 'abajo'
  fuente: 'sans' | 'mono'
  /** `pieza`: tinta del símbolo (nombres, signos); `valor`: gris secundario (números de pin). */
  tinta: 'pieza' | 'valor'
}

/** Parámetros del diodo según la opción elegida de una propiedad de lista (el color de un LED). */
export interface ParametrosPor {
  prop: string
  /** Opción → parámetros; una opción que no esté aquí usa los `is` y `n` del modelo. */
  /** `inom` (A), si la trae, cambia la corriente nominal del LED para esa opción. */
  valores: Record<string, { is: number; n: number; inom?: number } & ExtrasDiodo>
}

/** Lo demás de un diodo de SPICE: resistencia en serie, ruptura inversa (`bv` a `ibv`), capacitancia de unión (`cjo`,
 * `vj`, `m`, `fc`) y tiempo de tránsito `tt`. Sin ellos, el diodo es solo `is` y `n`. */
export interface ExtrasDiodo {
  rs?: number
  bv?: number
  ibv?: number
  cjo?: number
  vj?: number
  m?: number
  tt?: number
  fc?: number
}

/** Una fila de la hoja de datos de un Zener: corriente de prueba (A) e impedancia dinámica a ella (Ω). */
export interface SerieZener {
  izt: number
  zzt: number
}

/** Un número, o el nombre de un parámetro del modelo elegido o de una propiedad numérica de la pieza (con «-» delante, su
 * opuesto), o `{ prop, por, mas }`: `mas + por × prop`, lineal en una propiedad (la salida de un sensor integrado). */
export type ValorCompuesto = number | string | { prop: string; por: number; mas: number }

/** Un elemento de una pieza `compuesto`; los nodos son pines de la pieza o redes de `internas`. */
export type ElementoCompuesto =
  | { t: 'R'; a: string; b: string; ohms: ValorCompuesto }
  | { t: 'C'; a: string; b: string; farads: ValorCompuesto }
  | { t: 'L'; a: string; b: string; henries: ValorCompuesto }
  | { t: 'V'; a: string; b: string; volts: ValorCompuesto }
  | { t: 'I'; a: string; b: string; amps: ValorCompuesto }
  | { t: 'senoidal'; a: string; b: string; amp: ValorCompuesto; freq: ValorCompuesto; fase?: ValorCompuesto }
  | { t: 'D'; a: string; b: string; params?: Record<string, ValorCompuesto> }
  | { t: 'Q'; c: string; b: string; e: string; pnp?: boolean; params: Record<string, ValorCompuesto> }
  /** Transformador: dos devanados acoplados con el punto en `a1` y `a2`; `l1` es la inductancia del primario, `n` la relación Np/Ns (L2 = L1 / n²) y `k` el acoplamiento. */
  | { t: 'T'; a1: string; b1: string; a2: string; b2: string; l1: ValorCompuesto; n: ValorCompuesto; k: ValorCompuesto }
  | { t: 'OA'; mas: string; menos: string; sal: string; vmas: string; vmenos: string; params: Record<string, ValorCompuesto>; euler?: boolean }
  | { t: 'M'; d: string; g: string; s: string; pmos?: boolean; params: Record<string, ValorCompuesto> }
  | { t: 'J'; d: string; g: string; s: string; pjf?: boolean; params: Record<string, ValorCompuesto> }
  /** Fuentes controladas entre `p` y `n` por el voltaje (`E`, `G`) o la corriente (`H`, `F`) de `cp` y `cn`. */
  | { t: 'E'; p: string; n: string; cp: string; cn: string; ganancia: ValorCompuesto }
  | { t: 'G'; p: string; n: string; cp: string; cn: string; gm: ValorCompuesto }
  | { t: 'H'; p: string; n: string; cp: string; cn: string; r: ValorCompuesto }
  | { t: 'F'; p: string; n: string; cp: string; cn: string; ganancia: ValorCompuesto }
  /** Fuente de valor externo: `k` por la perilla `canal` (id de una propiedad `enVivo`) más `c`, con `r` en serie opcional. */
  | { t: 'EXT'; a: string; b: string; modo: 'v' | 'i'; canal: string; k: ValorCompuesto; c: ValorCompuesto; r?: ValorCompuesto }

/** Parámetros de un modelo con los nombres y las unidades de ngspice («is», «bf», «vto»). */
export type ParametrosSpice = Record<string, number>

/** La corriente de una fuente `I` que no es fija: `prop` del modelo es su amplitud (pico, o el nivel alto del pulso) y estos ids dan el resto; el pulso lleva
 * las mismas propiedades que la fuente de voltaje de pulso. */
export type OndaDeCorriente =
  | { forma: 'senoidal'; frecuencia: string }
  | { forma: 'pulso'; frecuencia: string; ciclo: string; ancho?: string; subida?: string; bajada?: string; retardo?: string }

export type ModeloDef =
  /** `I`: fuente de corriente ideal; la corriente entra por `a`, la atraviesa y sale por `b` hacia el circuito. */
  | { tipo: 'R' | 'C' | 'L' | 'V' | 'I'; a: string; b: string; prop: string; rserie?: string; ic?: string; onda?: OndaDeCorriente }
  /** Zener de la serie `serie` (voltaje → corriente de prueba `izt` en A e impedancia `zzt` en Ω de la hoja); `prop` es el
   * voltaje Zener. `is`, `n`, `cjo`, `vj` y `m` son del diodo de SPICE. */
  /** JFET de nivel 1 (`pjf`: canal P), un juego de parámetros de SPICE por opción de `prop`. */
  | { tipo: 'jfet'; d: string; g: string; s: string; pjf: boolean; prop: string; modelos: Record<string, ParametrosSpice> }
  /** Termistor: `r25`, `beta`, `delta`, `tau` y `tmax` por opción de `prop` (o una tabla R/T en `tablas`); la temperatura
   * ambiente es la perilla `temperatura`. */
  | { tipo: 'termistor'; a: string; b: string; ptc?: true; prop: string; modelos: Record<string, ParametrosSpice>; tablas?: Record<string, [number, number][]>; temperatura: string }
  /** Fotorresistencia: `r10`, `gamma`, `roscuro`, `tau_sube` y `tau_baja` por opción de `prop`; la luz es la perilla `luz`. */
  | { tipo: 'ldr'; a: string; b: string; prop: string; modelos: Record<string, ParametrosSpice>; luz: string }
  /** Motor a pasos de dos fases: 4 `nodos` (bipolar) o 6 (unipolar, con la toma central repetida); `carga` es la perilla del par. */
  | { tipo: 'pasos'; nodos: string[]; unipolar?: true; prop: string; modelos: Record<string, ParametrosSpice>; carga?: string }
  /** Puente H doble (L298): entradas IN1 a IN4, habilitaciones ENA y ENB, salidas OUT1 a OUT4, SENSA, SENSB, VS, VSS y GND; lo arma `netlist/puenteH.ts`. */
  | { tipo: 'puente-h'; entradas: string[]; habilita: string[]; salidas: string[]; sensa: string; sensb: string; vs: string; vss: string; gnd: string; prop: string; modelos: Record<string, ParametrosSpice> }
  /** Fuente controlada `forma` (E, G, H o F); `prop` es la propiedad numérica con su ganancia. */
  | { tipo: 'controlada'; forma: 'E' | 'G' | 'H' | 'F'; p: string; n: string; cp: string; cn: string; prop: string }
  /** Fuente por tramos: `puntos` es la propiedad de texto con los pares, `repetir` la lista de dos opciones (la segunda repite) y `modo` la lista voltaje o corriente. */
  | { tipo: 'pwl'; a: string; b: string; puntos: string; repetir: string; modo: string }
  | { tipo: 'zener'; a: string; b: string; prop: string; is: number; n: number; cjo: number; vj: number; m: number; serie: Record<string, SerieZener>; sinFamiliaHasta?: number; por?: { prop: string; valores: Record<string, Record<string, SerieZener>> } }
  /** Transistor bipolar de Gummel-Poon: un juego de parámetros de SPICE por opción de `prop` («2N2222»). */
  | { tipo: 'bjt'; c: string; b: string; e: string; pnp: boolean; prop: string; modelos: Record<string, ParametrosSpice> }
  /** MOSFET de nivel 1 con el sustrato en la fuente, con un juego de parámetros de SPICE por opción de `prop`. */
  | { tipo: 'mosfet'; d: string; g: string; s: string; pmos: boolean; prop: string; modelos: Record<string, ParametrosSpice> }
  /** Amplificador operacional de una etapa (`a0`, `gbw`, `sr`, `rin`, `rout`, `ilim`, `dhi`, `dlo`, `rq`) por opción. */
  | { tipo: 'ampop'; mas: string; menos: string; sal: string; vmas: string; vmenos: string; prop: string; modelos: Record<string, ParametrosSpice> }
  /** Comparador de colector abierto: amplificador de una etapa (los nueve parámetros de `ampop`) que maneja por `rbase` la
   * base de un NPN con colector de salida y emisor en V−. Con `menos` sobre `mas` conduce y la salida baja; al revés
   * queda al aire y una carga la sube. El transistor lleva `is`, `bf`, `rc`, `tf`, `tr`, `cje` y `cjc`. */
  | { tipo: 'comparador'; mas: string; menos: string; sal: string; vmas: string; vmenos: string; prop: string; modelos: Record<string, ParametrosSpice> }
  /** Foco: voltaje y potencia nominales (propiedades), caliente `1 + k` veces la resistencia fría, inercia `tau` (s). */
  | { tipo: 'foco'; a: string; b: string; voltaje: string; potencia: string; k: number; tau: number }
  /** Fusible: corriente nominal (propiedad), `rPorA` Ω a 1 A (la resistencia baja con la corriente nominal), se funde a `fusion` veces la nominal con la constante `tau` (s). */
  | { tipo: 'fusible'; a: string; b: string; prop: string; rPorA: number; fusion: number; tau: number }
  /** Motor DC: el de `referencia` (a `v` volts) escalado al voltaje nominal (propiedad). */
  | { tipo: 'motor'; a: string; b: string; voltaje: string; referencia: { v: number; r: number; l: number; ke: number; j: number; bm: number } }
  /** Relé: bobina de `potencia` W al voltaje nominal (propiedad) con constante `tau` (s); opera a `operar` y libera a `liberar` veces el nominal. */
  | { tipo: 'rele'; a1: string; a2: string; com: string; na: string; nc: string; voltaje: string; potencia: number; tau: number; operar: number; liberar: number }
  /** Zumbador activo: una resistencia que consume `potencia` W al voltaje nominal (propiedad) y suena desde `umbral` veces él. */
  | { tipo: 'zumbador'; a: string; b: string; voltaje: string; potencia: number; umbral: number }
  /** Potenciómetro: dos resistencias, de `a` al cursor `c` y del cursor a `b`, según `posicion` («0 %» a «100 %»). `ley`
   * es lista «lineal», «logarítmica» o «antilogarítmica» (sin ella, lineal).
   * Con `reostato` no lleva `b`: una sola resistencia de `a` a `c` que vale el total por la fracción de la posición. */
  | { tipo: 'pot'; a: string; b?: string; c: string; prop: string; posicion: string; ley?: string; reostato?: true }
  /** Pieza armada con lo que el motor ya simula: elementos con nodos (pines o redes internas) y valores que son números o
   * nombres (parámetro del modelo por `prop` o propiedad numérica). Comparador generalizado, sin primitivas nuevas.
   * `terminales` los llena la validación (todos los pines, en orden). */
  | {
      tipo: 'compuesto'
      prop?: string
      modelos?: Record<string, ParametrosSpice>
      internas?: string[]
      opcionales?: string[]
      /** Grupos de pines opcionales (los de un canal) que, si todos quedan al aire, se quitan con los elementos que cuelgan de ellos por las redes internas: un canal sin usar solo llevaría fugas por los pines que comparte. */
      podar?: string[][]
      /** Los pines de los que sale el voltaje de la pieza y el elemento (índice de `elementos`) cuya corriente es la de la pieza; `region` es el índice del transistor (Q, M o J) cuya región se muestra. */
      medida: { mas: string; menos: string; i: number; region?: number }
      elementos: ElementoCompuesto[]
      terminales: string[]
    }
  /** Diodo o LED; `inom` (A) es la corriente directa nominal de un LED: pasarla se avisa (`sim/sobrecorriente.ts`). */
  | { tipo: 'D'; a: string; b: string; is: number; n: number; inom?: number; por?: ParametrosPor }
  /** `momentaneo`: el botón cierra solo mientras se sostiene al simular; sin él, cada clic conmuta. Con `c` es conmutador:
   * `a` es el común, que cierra con `b` en la opción `cerrado` y con `c` en la otra. */
  | { tipo: 'interruptor'; a: string; b: string; prop: string; cerrado: string; momentaneo?: boolean; c?: string }
  /** Fuente senoidal sin desplazamiento: ids de las propiedades de amplitud (pico) y frecuencia. */
  | { tipo: 'senoidal'; a: string; b: string; amplitud: string; frecuencia: string }
  /** Onda cuadrada de 0 V a `alto`: ids de propiedades; `ciclo` es lista de porcentajes («50 %»). Con `ancho`, `subida`,
   * `bajada` o `retardo` distintos de cero es un pulso de SPICE, y el ancho (si no es 0) manda sobre el ciclo. */
  | { tipo: 'pulso'; a: string; b: string; alto: string; frecuencia: string; ciclo: string; ancho?: string; subida?: string; bajada?: string; retardo?: string }
  | { tipo: 'tierra'; pin: string }
  /** Terminal de alimentación (VCC, +15V): una fuente entre su red y la tierra. Los de igual `nombre` (propiedad `texto`)
   * y las etiquetas con ese nombre quedan en la misma red. Un nombre que es voltaje da ese voltaje; otro es un riel de la
   * tabla del documento (`netlist/alimentaciones.ts`). */
  | { tipo: 'alimentacion'; pin: string; nombre: string }
  /** Compuerta: `funcion` es not, and, or, nand, nor, xor o xnor; `entradas` y `salida` son pines; `familia` y `alimentacion`
   * son propiedades de lista (familia de `componentes/familias-logicas.json` y su voltaje). Con `histeresis` (solo NOT) la
   * entrada es un disparador Schmitt con los umbrales `schmitt` de su familia. Con `habilitacion` (un pin) y `activo`
   * («bajo» o «alto») la salida queda en Z mientras no está habilitada y puede compartir red con otras salidas iguales. */
  | { tipo: 'compuerta'; funcion: 'not' | 'buf' | 'and' | 'or' | 'nand' | 'nor' | 'xor' | 'xnor'; entradas: string[]; salida: string; familia: string; alimentacion: string; histeresis?: true; habilitacion?: string; activo?: 'bajo' | 'alto' }
  /** Biestable D por flanco de subida (74HC74) con PRE y CLR activos en bajo. */
  | { tipo: 'biestable-d'; d: string; clk: string; pre: string; clr: string; q: string; qn: string; familia: string; alimentacion: string }
  /** Biestable JK por flanco de bajada (74HC112) con PRE y CLR activos en bajo. */
  | { tipo: 'biestable-jk'; j: string; k: string; clk: string; pre: string; clr: string; q: string; qn: string; familia: string; alimentacion: string }
  /** Contador de 4 bits por flanco de subida con RST activo en alto; `hasta` es la propiedad de lista «9» o «15». */
  | { tipo: 'contador'; clk: string; rst: string; q: string[]; co: string; hasta: string; familia: string; alimentacion: string }
  /** Decodificador BCD a 7 segmentos; `polaridad` es la propiedad de lista y `bajo` la opción de salidas activas en bajo. */
  | { tipo: 'decodificador'; entradas: string[]; salidas: string[]; polaridad: string; bajo: string; familia: string; alimentacion: string }
  /** Estado lógico: `prop` es la propiedad de lista con «0» y «1»; se conmuta al simular. */
  | { tipo: 'estado-logico'; salida: string; prop: string; familia: string; alimentacion: string }
  /** Temporizador 555: sus ocho pines y, por opción de `prop` (NE555, LM555, TLC555), los parámetros de su macromodelo. */
  | { tipo: '555'; gnd: string; trig: string; out: string; reset: string; cv: string; thr: string; dis: string; vcc: string; prop: string; modelos: Record<string, Parametros555> }
  /** Display de 7 segmentos: un LED por segmento (a a g y el punto) con su común; `conexion` dice cátodo o ánodo común. */
  /** Combinacional por tabla: `comunes` más las entradas de cada rebanada eligen la fila. Sin `rebanadas` las columnas y
   * salidas de la tabla son pines. Con ellas, cada rebanada traduce el nombre local de la tabla a un pin. `tabla` o `generar`. */
  | { tipo: 'lut'; familia: string; alimentacion: string; comunes: string[]; rebanadas?: Record<string, string>[]; bidireccionales?: string[]; abiertas?: string[]; tabla?: TablaDef; generar?: GenerarDef; retardos: RetardosPorFamilia }
  /** Núcleo de estado (contador o desplazamiento) y salidas: cada pin de `salidas` es `q3`, `!q3`, `a2` (registro auxiliar) o `tabla`. */
  | { tipo: 'msi'; familia: string; alimentacion: string; nucleo: NucleoPieza; salidas: Record<string, string>; abiertas?: string[]; tabla?: TablaDef; retardos: RetardosPorFamilia }
  /** ADC0804: `db` va del bit 0 al 7. Umbrales y niveles de la hoja, `rref` cada mitad de VREF/2, `r_lo` y `r_hi` las resistencias de salida y los tiempos de conversión. */
  | { tipo: 'convertidor-ad'; cs: string; rd: string; wr: string; clkin: string; clkr: string; intr: string; vinp: string; vinn: string; agnd: string; vref2: string; dgnd: string; vcc: string; db: string[]; vil: number; vih: number; vtp: number; vtn: number; voh: number; vol: number; rref: number; r_lo: number; r_hi: number; ciclos_inicio: number; ciclos_bit: number; t_acceso: number; t_intr: number }
  /** DAC0808: `a` va del bit más significativo (A1) al menos. */
  | { tipo: 'convertidor-da'; a: string[]; io: string; gnd: string; vee: string; vcc: string; vrefp: string; vrefn: string; comp: string; vil: number; vih: number; t_asentamiento: number }
  /** Interruptor DIP: un contacto por par de pines; `estado` es la propiedad de texto con un 0 o un 1 por contacto. */
  | { tipo: 'interruptores'; contactos: [string, string][]; estado: string; r_on: number; r_off: number }
  /** Teclado matricial: una tecla une su fila con su columna. `rebote` es la propiedad de lista que lo enciende. */
  | { tipo: 'teclado'; filas: string[]; columnas: string[]; r_on: number; r_off: number; rebote?: string }
  | { tipo: 'display'; segmentos: string[]; comun: string; conexion: string; anodo: string; is: number; n: number; por?: ParametrosPor; inom?: number }
  /** Multímetro: «+» y COM; `modo` lista sus seis funciones e `ideal` es la casilla «Instrumento ideal». El significado de
   * cada propiedad de un instrumento lo fija `instrumentos/ajustes.ts`. */
  | { tipo: 'multimetro'; mas: string; com: string; modo: string; ideal: string }
  /** Osciloscopio: cuatro entradas referidas a tierra (A a D); sus ajustes son propiedades con los ids de `PROPS_OSCILOSCOPIO`. */
  | { tipo: 'osciloscopio'; entradas: string[]; ideal: string }
  /** Generador de funciones: su salida y COM, y las propiedades de su onda (la amplitud en pico a pico). */
  | { tipo: 'generador'; sal: string; com: string; forma: string; frecuencia: string; amplitud: string; desplazamiento: string; simetria: string; ciclo: string; desfase: string; retardo: string; pasos: string; salida: string; ideal: string }
  /** Fuente variable de un canal: «+» y «−», su voltaje, su límite de corriente y la casilla de la salida. */
  | { tipo: 'fuente-variable'; mas: string; menos: string; voltaje: string; limite: string; salida: string }

/** Parámetros del macromodelo del 555 (los de `K555` en `engine/referencias/digital.lib`). */
export interface Parametros555 {
  rdiv: number
  rq: number
  vres: number
  td: number
  tr: number
  tf: number
  vlo: number
  rlo: number
  vhi: number
  rhi: number
  rdis: number
  vmin: number
  vmax: number
}

export interface Caja {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface Geometria {
  /** Polilíneas [x0, y0, x1, y1, …] en unidades de rejilla fina. */
  trazos: number[][]
  /** Triángulos [x0, y0, x1, y1, x2, y2, …]. */
  rellenos: number[]
  caja: Caja
  /** Grupos `<g data-capa="nombre">` del símbolo, aparte del dibujo de siempre: los dibuja su animación (rotor, estados de
   * un contacto, flecha del potenciómetro) en vez de sumarse siempre. */
  capas?: Record<string, Geometria>
  /** Con capas, el símbolo sin ninguna. `trazos` y `rellenos` traen las capas en reposo (rotor, reposo de un contacto,
   * cursor al 50 %), así lo que no anima (caja del cuerpo, vistas de la Librería) sigue viendo el símbolo de siempre. */
  fija?: { trazos: number[][]; rellenos: number[] }
}

/** Animación de una pieza, de un vocabulario fijo. Cada tipo dice qué capas de su símbolo necesita (`CAPAS_DE_ANIMACION`). */
export type AnimacionDef =
  /** Luz según la corriente media entre la nominal; `color` es la propiedad de lista que elige la luz (rojo sin ella). */
  | { tipo: 'brillo'; color?: string }
  /** Luz del foco según el calentamiento de su filamento. */
  | { tipo: 'filamento' }
  /** La capa `rotor` gira con las rpm, a lo más `vueltasMax` vueltas por segundo de pantalla. */
  | { tipo: 'giro'; vueltasMax: number }
  /** Las capas de estado según lo que manda: el contacto del relé (`operado`), el interruptor (`cerrado`) o el botón (`presionado`). */
  | { tipo: 'contacto'; manda: 'operado' | 'cerrado' | 'presionado' }
  /** La capa `cursor` se corre en x de `desde` (0 %) a `hasta` (100 %) según `prop`; lo que está arriba de `codo` (y) no se mueve. */
  | { tipo: 'cursor'; prop: string; desde: number; hasta: number; codo: number }
  /** Un tono de la propiedad `frecuencia` (Hz) con la forma `onda` mientras suena. */
  | { tipo: 'sonido'; frecuencia: string; onda: 'triangular' | 'senoidal' | 'cuadrada' }
  /** Luces sueltas de una pieza compuesta: cada una brilla con la corriente del diodo `elemento` (índice de `modelo.elementos`)
   * en el punto (`x`, `y`) del símbolo, con el color de LED `color`. */
  | { tipo: 'luces'; luces: { elemento: number; x: number; y: number; color: string }[] }
  /** Zonas de clic de un interruptor DIP (una por posición) o de un teclado (una por tecla, en el orden de sus contactos), en
   * unidades del símbolo. `tecla` es el carácter del teclado de la computadora que la acciona. */
  | { tipo: 'zonas'; zonas: ZonaDeClic[] }

/** Un rectángulo del símbolo que se acciona con un clic (esquina superior izquierda y tamaño). */
export interface ZonaDeClic {
  x: number
  y: number
  ancho: number
  alto: number
  tecla?: string
}

/** Las capas que pide cada animación, en el orden de sus estados (reposo antes que operado). */
export function capasDeAnimacion(a: AnimacionDef | undefined): readonly string[] {
  if (!a) return []
  switch (a.tipo) {
    case 'giro':
      return ['rotor']
    case 'cursor':
      return ['cursor']
    case 'contacto':
      return a.manda === 'operado' ? ['estado-reposo', 'estado-operado'] : a.manda === 'cerrado' ? ['estado-abierto', 'estado-cerrado'] : ['estado-suelto', 'estado-presionado']
    default:
      return []
  }
}

/** Los programas de los que una pieza guarda su nombre equivalente (el nombre del formato, nunca un archivo suyo). */
export const FORMATOS_EQUIVALENCIA = ['kicad', 'ltspice', 'falstad', 'proteus', 'fritzing'] as const
export type FormatoEquivalencia = (typeof FORMATOS_EQUIVALENCIA)[number]

/** Nombre de la pieza en otros programas; `sinVerificar` lista los formatos cuyo nombre no se confirmó con el programa o su documentación. */
export type Equivalencias = Partial<Record<FormatoEquivalencia, string | string[]>> & { sinVerificar?: string[] }

/** Una forma física de la pieza: encapsulado, patillas y de dónde sale cada dato. */
export interface Presentacion {
  /** Id de `componentes/encapsulados.json`. */
  encapsulado: string
  /** Id de pin → patilla(s) física(s). El número vive aquí y no en `pines[]` porque cambia con el modelo, la familia y el encapsulado. */
  patillas: Record<string, string | string[]>
  /** Red implícita → patilla(s) que no son pines del símbolo: `{ VCC: '14', GND: '7' }`. */
  alimentacion?: Record<string, string | string[]>
  /** Patilla → qué es, cuando el modelo no la usa («Ajuste de offset», «NC»). */
  sinModelo?: Record<string, string>
  /** Cada unidad de un chip doble o cuádruple; la primera coincide con `patillas`. */
  unidades?: { nombre: string; patillas: Record<string, string> }[]
  /** Id de huella de KiCad «Biblioteca:Nombre»; sin ella, la del encapsulado. */
  huella?: string
  /** Número de parte si cambia con la presentación (MMBT3904 en SOT-23). */
  parte?: string
  lcsc?: { numero: string; comprobado?: string; sinVerificar?: true }
  /** Presentación típica, no fijada por el valor (el electrolítico de 100 µF). */
  representativa?: true
  protoboard?: { arte?: string; separacion?: number }
}

/** Los datos físicos de una opción de la pieza. */
export interface FilaDatos {
  /** Sin pieza física: fuentes ideales, instrumentos, tierra, «Ideal». */
  virtual?: true
  fabricante?: string
  parte?: string
  /** Enlace https del fabricante, nunca un agregador. */
  hoja?: string
  /** En qué difiere el chip real del modelo. */
  aproximada?: string
  /** Reemplaza a la de la pieza en los formatos que trae. */
  equivalencias?: Equivalencias
  /** La primera es la de omisión. */
  presentaciones?: Presentacion[]
  /** Campo → por qué falta. */
  pendiente?: Record<string, string>
  comprobado?: { fecha: string; fuente: string }
  nota?: string
}

export interface DatosPieza {
  /** Propiedad de lista (o dos) que elige la fila; sin ella la única fila es «*». */
  por?: string | [string, string]
  equivalencias?: Equivalencias
  /** Clave: la opción, «opciónA|opciónB» con dos propiedades, o «*». */
  valores: Record<string, FilaDatos>
}

/** Retardo típico `[subida, bajada]` por salida (o grupo `Q*`, o `*`) a la alimentación `vcc` de la hoja, por opción de familia. */
export type RetardosPorFamilia = Record<string, { vcc: number } & Record<string, number | [number, number]>>

/** Una señal de control de `pieza.json`: el id de un pin, con `!` delante si es activa en bajo. */
export interface RelojPieza {
  senales: string[]
  combina?: 'Y' | 'O'
  flanco?: 'subida' | 'bajada'
}
export interface AccionPieza {
  senal: string
  sincrona?: boolean
}
export interface CargaPieza extends AccionPieza {
  /** Pines de dato, el bit 0 primero. */
  datos: string[]
}
export type NucleoPieza =
  | { tipo: 'contador'; bits: number; modulo: number; reloj: RelojPieza; abajo?: RelojPieza; sentido?: string; habilita?: string[]; borra?: AccionPieza; carga?: CargaPieza }
  | { tipo: 'desplazamiento'; bits: number; reloj: RelojPieza; serie?: string[]; borra?: AccionPieza; carga?: CargaPieza; almacen?: RelojPieza }

/** El símbolo de un integrado dibujado por `scripts/generar-simbolo-ci.mjs` desde esta clave. */
export interface CajaPieza {
  titulo?: string
  forma: 'funcional' | 'dip'
  /** Ids de pin (con `!` si es activo en bajo); null deja un hueco. */
  izquierda?: (string | null)[]
  derecha?: (string | null)[]
  arriba?: (string | null)[]
  abajo?: (string | null)[]
  ancho?: number
  marcas?: Record<string, ('bajo' | 'dinamico' | 'z' | 'oc')[]>
}

export interface PiezaDef {
  id: string
  nombre: { es: string; en: string }
  categoria: string
  prefijo: string
  buscar: string[]
  pines: PinDef[]
  props: PropDef[]
  modelo?: ModeloDef
  /** Dónde van referencia y valor, en unidades del símbolo. `valor.trasRotulo` (índice de `rotulos`) pone el valor en el
   * renglón de ese rótulo, justo después y del lado en que crece; entonces su punto no se usa. */
  etiquetas: { ref: Punto; valor: Punto & { trasRotulo?: number } }
  rotulos?: Rotulo[]
  geometria: Geometria
  /** Compuerta de cantidad variable de entradas: `base` es la pieza de dos, `n` las de esta y `max` el tope. Cada cantidad
   * es una pieza (`and`, `and-3`…`and-8`) y la propiedad «Entradas» cambia de una a otra. */
  entradas?: { base: string; n: number; max: number }
  /** No sale en la Librería ni en el buscador (las de 3 a 8 entradas se alcanzan por la propiedad «Entradas»). */
  oculta?: true
  /** Un dibujo extra según una propiedad de lista (la forma de la onda del generador), sobre el del símbolo. */
  variantes?: { prop: string; geometrias: Record<string, Geometria> }
  /** Dibujo de un interruptor con el contacto cerrado (`accionado.svg`: el botón presionado), con la caja de `geometria`. */
  geometriaAccionada?: Geometria
  /** Lo que la pieza admite antes de avisar (y de quemarse con «Las piezas se queman»). */
  limites?: LimitesDef
  /** Su animación (`animacion` del `pieza.json`). */
  animacion?: AnimacionDef
  /** De dónde salen los parámetros de cada modelo, por opción de `modelo`: hoja de datos o modelo libre (documento,
   * revisión y URL); si se ajustaron a la hoja en vez de copiarse, se dice. */
  fuentes?: Record<string, string>
  /** Datos físicos por opción: encapsulado, patillas, huella, hoja de datos y equivalencias. */
  datos?: DatosPieza
  /** Cómo se dibuja el símbolo generado (`caja` del `pieza.json`). */
  caja?: CajaPieza
  /** Grupo plegable de la Librería dentro de su categoría. */
  grupo?: string
}

/** Máximo absoluto. De voltaje: V(`de`) − V(`a`) entre `min` y `max` (con `abs`, su valor absoluto contra `max`); `de`
 * puede ser lista (el peor pin) y `a` un pin o `tierra`. De `medida`: corriente media de `a` a `b` o potencia media.
 * `escala` (V): contra qué se mide cuánto se pasó en el quemado cuando el máximo es un margen sobre otro punto. */
export interface AbsolutoDef {
  nombre: string
  de?: string | string[]
  a?: string
  medida?: 'corriente' | 'potencia'
  abs?: boolean
  /** Solo avisa, no cuenta para el quemado (el voltaje diferencial de entrada). */
  sinQuema?: boolean
  min?: number
  max?: number
  escala?: number
  /** Qué hacer cuando se pasa; cierra la línea del Registro. */
  consejo: string
}

/** Lo que admite una pieza. La corriente nominal de un LED sigue en su modelo (`inom`); aquí van la propiedad con la
 * potencia nominal de una resistencia, corriente y potencia máximas de cada modelo de transistor (con su hoja de datos) y
 * cuándo se quema. */
export interface LimitesDef {
  /** Id de la propiedad de lista con la potencia nominal («0.25 W»). */
  potencia?: string
  /** Por opción de una propiedad de lista (el modelo de un transistor): corriente (A) y potencia (W) máximas y su fuente. */
  por?: { prop: string; valores: Record<string, { corriente?: number; potencia?: number; fuente: string }> }
  /** Voltaje nominal de una pieza (capacitor electrolítico, motor): `prop` es la propiedad con el nominal, avisa con más
   * de `aviso` veces el nominal y el capacitor además con más de `inverso` volts al revés. */
  voltaje?: { prop: string; aviso: number; inverso?: number }
  /** Se quema con más de `factor` veces su límite durante `durante` segundos simulados seguidos. `elemento` (pieza
   * compuesta) es el índice de `modelo.elementos` que se abre al quemarse (el transistor de paso de un regulador). */
  quema?: { factor: number; durante: number; elemento?: number }
  /** Máximos absolutos de la hoja de cada modelo: alimentación, entrada, voltaje inverso, Vce, Vds, Vgs, corriente media
   * de diodo y potencia de Zener. Sin `prop`, el único juego va en la llave «*»; una opción sin juego (diodo «Genérico»)
   * no tiene máximos. */
  absolutos?: { prop?: string; valores: Record<string, { fuente: string; limites: AbsolutoDef[] }> }
  /** Piezas compuestas (ULN2003, reguladores): un límite por canal o sentido. `elementos` son índices de
   * `modelo.elementos` cuyas corrientes o voltajes se suman según `medida`. `positiva` avisa si la suma pasa de `max` y
   * `negativa` si su opuesto pasa (el signo es el del motor: un PNP lo trae al revés). */
  compuesto?: { nombre: string; elementos: number[]; medida?: 'corriente' | 'voltaje'; sentido: 'positiva' | 'negativa'; max: number; consejo: string; fuente: string }[]
}
