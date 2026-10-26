# Cómo agregar una pieza

Cada pieza es una carpeta `componentes/<categoría>/<id>/` con dos archivos: `pieza.json`, que describe sus pines, propiedades y modelo eléctrico, y `simbolo.svg`, que contiene el dibujo. La aplicación lee ambos al arrancar y, si encuentra un problema, informa la ruta del archivo y el campo que falla, por ejemplo `pines[1].x debe ser par (rejilla de 2.5 mm)`.

## Pasos

1. Se copia la carpeta de una pieza parecida (una resistencia para un componente de dos terminales, una batería para uno vertical, una compuerta para uno con entradas y salida) y se le da el nombre nuevo. El nombre de la carpeta debe ser igual al campo `id`.
2. Se edita `pieza.json`: `id` en minúsculas con guiones, `nombre` en español e inglés, `categoria`, `prefijo` de 1 a 4 mayúsculas (la letra de la referencia, como R1 o SW2) y `buscar` con al menos un término que el buscador reconozca. La categoría es una de las de la Librería: `pasivos`, `fuentes`, `semiconductores`, `interruptores`, `electromecanicos`, `indicadores`, `digitales`, `integrados` o `instrumentos`; una nueva se agrega también en `CATEGORIAS` de `src/renderer/src/ui/catalogo.ts`.
3. Se definen los `pines`. Cada uno lleva `id`, `nombre`, `x` e `y` en unidades de rejilla fina (1.25 mm) relativas al origen de la pieza. Las coordenadas deben ser enteros pares, para que el pin caiga en la rejilla principal de 2.5 mm.
4. Se definen las `props`. Una propiedad numérica lleva `nombre`, `unidad`, `defecto` y, opcionalmente, `comunes` (valores sugeridos, todos legibles como «4.7k» o «100n»). Una propiedad de lista cerrada lleva `opciones` (no vacía) y un `defecto` que sea una de ellas.
5. Se declara el `modelo`, si la pieza se simula (sección «Tipos de modelo»). Sin `modelo`, la pieza se dibuja pero no se simula.
6. Si la referencia o el valor caerían sobre el dibujo, se mueven con `etiquetas`: `ref` y `valor` son puntos enteros en unidades de rejilla fina, fuera del cuerpo (por omisión, `(0, -3)` arriba y `(0, 3)` abajo). El texto empieza en el punto si queda a la derecha del origen y termina en él si queda a la izquierda. Si el valor tiene que leerse junto a un rótulo (el voltaje del terminal de alimentación tras su nombre), `"valor": { "trasRotulo": 0 }` lo pone en el renglón del rótulo de ese índice (desde 0), justo después de él y del lado en que crece, en cualquier orientación; entonces su punto no se usa.
7. Si el dibujo necesita letras o signos que deben leerse derechos (nombres y números de pin, la «M» de un motor, el «+» y el «−» de un amplificador), se declaran como `rotulos` (sección siguiente) y no se trazan en el SVG. Si el modelo de la pieza debe verse junto a ella (2N2222, LM741, NE555), la propiedad de lista `modelo` lleva `"mostrar": true`.
8. Se dibuja `simbolo.svg` siguiendo la convención de la sección siguiente, y se corre `npm test`: las pruebas de la librería (`piezas/libreria.test.ts` y `piezas/simbolos.test.ts`) verifican que todas las piezas carguen sin errores, que cada pin toque el extremo de un trazo y quede fuera del cuerpo, que la referencia y el valor se anclen fuera del cuerpo, que la categoría exista, que las unidades sean del Sistema Internacional y que el buscador encuentre la pieza por su nombre y por cada término de `buscar`.

Una pieza sin `modelo` se dibuja, se conecta y se lista igual que las demás; el aviso «U1 todavía no tiene modelo eléctrico.» aparece en el panel Proyecto y en el inspector cuando no hay nada seleccionado, que lista los avisos y dice «N avisos impiden simular» en lugar de «Listo para simular». Todas las piezas de la Librería tienen modelo.

## Tipos de modelo

Todos los modelos nombran pines (`a` y `b`, distintos) y propiedades de la pieza por su `id`. Los valores numéricos se leen con notación de ingeniería («4k7», «100n»); un valor que no se lee, o que desborda, impide simular y el aviso nombra la referencia.

`R`, `C`, `L` y `V` llevan `prop`, que apunta a una propiedad numérica: ohmios, faradios, henrios o el voltaje de una fuente continua (puede ser cero o negativo).

```json
"modelo": { "tipo": "V", "a": "+", "b": "-", "prop": "voltaje" }
```

`I` es una fuente de corriente ideal y lleva `prop` como las anteriores; la corriente entra por `a`, atraviesa la fuente y sale por `b` hacia el circuito (los pines de `fuente-corriente` son `entrada` y `salida`, sección siguiente).

```json
"modelo": { "tipo": "I", "a": "entrada", "b": "salida", "prop": "corriente" }
```

`pot` es un potenciómetro: dos resistencias, de `a` al cursor `c` y del cursor a `b`, que suman el valor de `prop`. `posicion` es una propiedad de lista cuyas opciones son porcentajes de 0 a 100 («25 %» deja 25 % del valor entre `a` y el cursor: el cursor está a un cuarto del recorrido desde el pin 1, y con el pin 1 a 5 V y el pin 2 a tierra queda a 3.75 V). Su medición junta los dos tramos: «Entre extremos» (pin 1 menos pin 2), «Cursor» (voltaje del cursor respecto de tierra, como el de cualquier red), la corriente del tramo pin 1 a cursor y la potencia de los dos tramos. Ningún tramo baja de su mínimo: 10 Ω o el 1 % del valor, el que sea menor (uno de 10 kΩ tiene 10 Ω en sus extremos y uno de 100 Ω, 1 Ω), como uno real. Así, con el cursor en un extremo, un LED sin resistencia en serie lleva una corriente grande pero simula (y avisa), en lugar de detener la vista previa. La medición de la pieza (voltaje, corriente y potencia) es la del tramo de `a` al cursor.

```json
"modelo": { "tipo": "pot", "a": "1", "b": "2", "c": "3", "prop": "valor", "posicion": "posicion" }
```

`D` (diodo) lleva `is` (corriente de saturación) y `n` (coeficiente de emisión), ambos positivos. Con `por` los parámetros dependen de una propiedad de lista, como el color de un LED: `prop` es la propiedad (con `opciones`) y `valores` da `is` y `n` por opción. Una opción sin renglón usa el `is` y el `n` del modelo, y una opción guardada que ya no está en la lista de la propiedad se toma como la opción por omisión. Un LED lleva además `inom`, su corriente directa nominal en A (0.02 en los cinco colores); un renglón de `valores` puede traer su propia `inom`. Con más corriente directa que esa, el Registro lo dice una vez («D1 lleva 31.6 mA, más de sus 20 mA nominales: agrega una resistencia en serie.»), sin detener la vista previa, y su medición dice «más de sus 20 mA nominales» en una fila marcada; avisa una sola vez por LED en cada vista previa (una fuente de pulsos la cruzaría en cada periodo), y la fila de la medición sigue a cada lectura. `inom` no va al motor.

Un renglón de `valores` puede traer además `rs`, `bv`, `ibv`, `cjo`, `vj`, `m`, `tt` y `fc` (con los nombres y unidades de ngspice): así el diodo de la librería tiene lista de modelos (1N4148, 1N4007, 1N5819) con resistencia en serie, capacitancia, tiempo de tránsito y ruptura. El LED y el display no los usan.

```json
"modelo": {
  "tipo": "D", "a": "A", "b": "K", "is": 1.5e-17, "n": 2,
  "por": { "prop": "color", "valores": { "verde": { "is": 4.59e-20, "n": 2 }, "azul": { "is": 1.83e-28, "n": 2 } } }
}
```

`interruptor` lleva `prop` (una propiedad con exactamente dos `opciones`) y `cerrado`, la opción que cierra el contacto (1 mΩ cerrado, 1 GΩ abierto). Con `"momentaneo": true` se comporta como un botón: mientras corre la vista previa cierra solo mientras se sostiene el clic; sin él, cada clic conmuta. Si la carpeta trae además `accionado.svg`, con la misma convención que `simbolo.svg`, ese dibujo se usa cuando el contacto está cerrado (el botón presionado al sostenerlo, el interruptor cerrado al conmutarlo o con su propiedad en la opción `cerrado`); solo lo admiten las piezas con modelo `interruptor`. Una entrada CMOS que solo llega a contactos queda al aire con el contacto abierto: la vista previa la lleva a 0 V con 1 MΩ a tierra y el Registro lo dice.

```json
"modelo": { "tipo": "interruptor", "a": "1", "b": "2", "prop": "presionado", "cerrado": "sí", "momentaneo": true }
```

Con `c` (un tercer pin) es un conmutador de un polo y dos posiciones (SPDT): `a` es el común, que cierra con `b` cuando la propiedad vale `cerrado` y con `c` en la otra opción, siempre uno de los dos. Un clic simulando (y Enter o Espacio con la pieza seleccionada) cambia de posición, y `accionado.svg` se dibuja en la posición `cerrado`. Un tiro puede quedar sin conectar sin avisos, y un conmutador no puede ser `momentaneo`.

```json
"modelo": { "tipo": "interruptor", "a": "COM", "b": "2", "c": "1", "prop": "posicion", "cerrado": "2" }
```

`senoidal` es una fuente de voltaje sin desplazamiento: `amplitud` (valor de pico) y `frecuencia` (mayor que cero) son los `id` de dos propiedades numéricas.

```json
"modelo": { "tipo": "senoidal", "a": "+", "b": "-", "amplitud": "amplitud", "frecuencia": "frecuencia" }
```

`pulso` es una onda cuadrada de 0 V a `alto`: `alto` y `frecuencia` son propiedades numéricas y `ciclo` una propiedad de lista cuyas opciones son porcentajes mayores que 0 y menores que 100 («25 %»). La vista previa avisa si la frecuencia de una fuente deja menos de 20 pasos por periodo aun con el paso más corto (5 MHz).

```json
"modelo": { "tipo": "pulso", "a": "+", "b": "-", "alto": "alto", "frecuencia": "frecuencia", "ciclo": "ciclo" }
```

`alimentacion` es un terminal de alimentación como los de Proteus: una fuente de voltaje entre su red y la tierra. Lleva `pin` y `nombre` (el `id` de una propiedad de texto, ver «Propiedades de texto»); el voltaje no es una propiedad de la pieza. El nombre es la red: los terminales con el mismo nombre quedan en la misma red, y también una etiqueta de red con ese nombre (igual que dos etiquetas entre sí, distinguiendo mayúsculas y sin contar espacios en los extremos); la red toma el nombre. Si el nombre es un voltaje («+15V», «-15V», «−15V», «+5V», «3.3V», «12V»: signo opcional, guion o menos tipográfico, punto decimal y una V al final), ese es su voltaje, y el inspector lo muestra sin dejar editarlo («El voltaje sale del nombre.»). Cualquier otro nombre (VCC, VDD, VEE, AVCC…) es un riel: todos sus terminales comparten el voltaje de la tabla del documento, que por omisión da 5 V a VCC y VDD, −5 V a VEE y 5 V a los demás. Cambiar el voltaje de un VCC en el inspector, con doble clic en su voltaje o en la sección «Alimentaciones» del panel Proyecto cambia el de todos los VCC en un paso de deshacer. El `.kir` guarda solo los rieles que difieren del de omisión y que usa algún terminal (formato 2). Al unir nombres, el menos tipográfico (−), la raya corta (–) y el guion son el mismo signo, y un voltaje se escribe de una sola forma: «+15V», «15V», «+15 V» y «15v» son la misma red, con el texto que se escribió en cada terminal. Varios terminales de una red son una sola fuente. Dos nombres distintos unidos por un cable con voltajes distintos, o un voltaje distinto de cero sobre la tierra, no se pueden simular y el aviso lo dice («VCC tiene dos voltajes distintos: 5 V y 12 V.»). La medición del terminal (voltaje, corriente y potencia) es la de la fuente, que se asigna al primero de la red. No se rotula su referencia: lo que se ve es el nombre, con el voltaje del riel tras él (un nombre que ya es un voltaje no lo repite). El buscador propone nombres: «+15V» o «−15V» escritos solos, «alimentación 12» («+12V») y los nombres comunes de la propiedad («vee»).

```json
"modelo": { "tipo": "alimentacion", "pin": "1", "nombre": "nombre", "voltaje": "voltaje" }
```

`tierra` solo necesita `pin`.

### Modelos de SPICE

Los parámetros de estos modelos llevan los mismos nombres y unidades que en ngspice, así que un modelo nuevo se agrega con un bloque de JSON y se compara contra la misma línea `.model` de SPICE (las de las piezas de la librería están en `engine/referencias/modelos.lib`). Un parámetro que falta toma el valor por omisión de ngspice. Un nombre que el motor no lee (una errata como «Bf» o «vto ») y un valor fuera de lo que admite la vista previa se rechazan al cargar la librería, con el nombre del parámetro y lo que se admite (los rangos están en `netlist/rangos.ts`). `modelos` debe traer un juego de parámetros por cada opción de la propiedad `prop`; una opción guardada que ya no está en la lista usa la de omisión.

`bjt` es un transistor bipolar de Gummel-Poon: `c`, `b` y `e` son los pines de colector, base y emisor, y `pnp` dice la polaridad. Se usan `is`, `bf`, `nf`, `vaf`, `ikf`, `ise`, `ne`, `br`, `nr`, `var`, `ikr`, `isc`, `nc`, `rb`, `irb`, `rbm`, `re`, `rc`, `cje`, `vje`, `mje`, `tf`, `xtf`, `vtf`, `itf`, `cjc`, `vjc`, `mjc`, `xcjc`, `tr` y `fc` (a 27 °C, sin sustrato ni exceso de fase). Las tarjetas son las que publican los fabricantes (Motorola y Fairchild para los 2N, NXP para los BC).

```json
"modelo": {
  "tipo": "bjt", "c": "C", "b": "B", "e": "E", "pnp": false, "prop": "modelo",
  "modelos": { "2N2222": { "is": 14.34e-15, "bf": 255.9, "vaf": 74.03, "rb": 10, "rc": 1, "cje": 22.01e-12, "tf": 411.1e-12 } }
}
```

`mosfet` es el nivel 1 de SPICE con el sustrato unido a la fuente (la unión de sustrato a drenador es el diodo de cuerpo): `d`, `g` y `s`, y `pmos` para el canal P. Usa `vto`, `kp`, `lambda`, `rd`, `rs`, `cbd`, `cbs`, `is`, `pb`, `mj`, `fc`, `cgso` y `cgdo`, más `w` y `l`, que en SPICE van en la línea de la instancia (`M1 d g s s modelo W=1 L=1`). Con 1 m de ancho y de largo, `kp` es la beta del canal y `cgso`, `cgdo` quedan en faradios. Los cuatro MOSFET de la librería se ajustaron a sus hojas de datos: `vto` al voltaje de umbral típico, `kp`, `rd` y `rs` a la resistencia de encendido, `cgso` y `cgdo` a las capacitancias de entrada y de transferencia inversa, y `cbd` a la de salida.

```json
"modelo": {
  "tipo": "mosfet", "d": "D", "g": "G", "s": "S", "pmos": false, "prop": "modelo",
  "modelos": { "2N7000": { "vto": 2.1, "kp": 0.18, "lambda": 0.02, "rd": 0.3, "rs": 0.2, "cbd": 34e-12, "is": 1e-15, "cgso": 15e-12, "cgdo": 5e-12, "w": 1, "l": 1 } }
}
```

`zener` es un diodo con ruptura inversa. `prop` es el voltaje Zener y `serie` da, por voltaje, la corriente de prueba `izt` (A) y la impedancia `zzt` (Ω) de la hoja de datos de la serie 1N47xx. Kirchi toma el renglón del voltaje más cercano y arma el diodo de SPICE con `rs` = zzt − 0.0259 V / izt y `bv` = voltaje − izt · rs, de modo que con izt hay justo el voltaje Zener entre las terminales y la impedancia es la de la hoja. `is`, `n`, `cjo`, `vj` y `m` son los del diodo. Con esa resistencia en serie el voltaje en directo con mucha corriente queda algo más alto que el real (un solo diodo de SPICE no tiene una resistencia para cada sentido). Con `por` (`prop` y `valores`) otra propiedad de lista elige la familia: cada opción trae su propia `serie` (BZX55C junto a 1N47xxA) y una opción sin renglón usa `serie`. `sinFamiliaHasta` (opcional) es el voltaje de la última fila que usa un archivo guardado antes de que la pieza tuviera la propiedad de `por` (sin ella en `props`): un Zener de más voltaje toma esa fila, como antes de que la tabla creciera, y los archivos viejos salen idénticos.

```json
"modelo": { "tipo": "zener", "a": "A", "b": "K", "prop": "voltaje", "is": 2.5e-15, "n": 1, "cjo": 1e-10, "vj": 0.75, "m": 0.33, "serie": { "5.1": { "izt": 0.049, "zzt": 7 } } }
```

### Modelos propios

Las piezas que SPICE no trae se describen con sus valores nominales; las ecuaciones están en el motor (`engine/src/devices/`) y, escritas con fuentes B, en las netlists de `engine/referencias/`.

`ampop` es un amplificador operacional de una etapa: `mas`, `menos`, `sal`, `vmas` y `vmenos` son los pines, y por cada modelo `a0` (ganancia en continua), `gbw` (Hz), `sr` (V/s), `rin` y `rout` (Ω), `ilim` (corriente de salida máxima, A), `dhi` y `dlo` (cuánto se queda la salida de cada alimentación, V) y `rq` (la resistencia entre alimentaciones que da el consumo en reposo).

```json
"modelo": {
  "tipo": "ampop", "mas": "+", "menos": "-", "sal": "OUT", "vmas": "V+", "vmenos": "V-", "prop": "modelo",
  "modelos": { "LM741": { "a0": 2e5, "gbw": 1e6, "sr": 0.5e6, "rin": 2e6, "rout": 75, "ilim": 25e-3, "dhi": 1, "dlo": 1, "rq": 17.6e3 } }
}
```

`comparador` es un comparador de colector abierto (LM393, LM311). Lleva los mismos pines y la misma `modelos` por opción de `prop` que `ampop` (`mas`, `menos`, `sal`, `vmas`, `vmenos`) y, por cada modelo, los nueve parámetros del amplificador más los del transistor de salida: `rbase` (Ω, entre el amplificador y la base) y `is`, `bf`, `rc`, `tf`, `tr`, `cje` y `cjc`. Kirchi lo arma con lo que el motor ya tiene, sin primitivas nuevas: un amplificador de una etapa, una resistencia y un transistor NPN con el colector en `sal` y el emisor en `vmenos`. Con `menos` arriba de `mas` el transistor conduce y la salida baja; al revés la salida queda al aire y la sube la resistencia de carga. La velocidad de respuesta sale del `gbw` (con poca sobreexcitación el retardo crece) y de `sr`. Si lo único que toca la salida no puede subirla (una resistencia hacia tierra, un medidor), la vista previa avisa «U1 es de colector abierto y su salida no tiene resistencia de carga a un voltaje: solo baja, nunca sube.». La medición de la pieza es la del transistor (VCE y corriente de bajada).

`compuesto` es el comparador generalizado: una pieza armada con lo que el motor ya simula, sin primitivas nuevas. Lista `elementos` con sus nodos, que son pines de la pieza o redes de `internas`, y valores que son un número, el nombre de un parámetro del modelo elegido (`prop` con `modelos`, un juego de números por opción) o el id de una propiedad numérica de la pieza (con «-» delante, su opuesto). Un nombre se busca primero entre los parámetros del modelo. Los elementos son `R` (`ohms`), `C` (`farads`), `L` (`henries`), `V` (`volts`, continua), `I` (`amps`), `senoidal` (`amp`, `freq` y `fase` en grados), `D` (`params`: `is`, `n`, `rs`, `bv`, `ibv`, `cjo`, `vj`, `m`, `tt`, `fc`), `Q` (`c`, `b`, `e`, `pnp` y `params` con los nombres de ngspice del transistor) y `OA` (`mas`, `menos`, `sal`, `vmas`, `vmenos` y los nueve `params` del amplificador). `medida` dice de dónde sale la lectura de la pieza: el voltaje entre los pines `mas` y `menos`, la corriente del elemento número `i` (desde 0) y, como potencia, lo que disipan todos sus elementos menos las fuentes. `opcionales` son pines que pueden quedar al aire (los canales sin usar de un ULN2003). Cada pin lo debe usar algún elemento y cada red interna también. La validación rechaza la errata, el nombre que no se resuelve en todas las opciones y los parámetros de SPICE fuera de rango, con la ruta del campo. Los terminales (todos los pines, en su orden) los agrega la validación; no se escriben.

```json
"modelo": {
  "tipo": "compuesto", "prop": "modelo",
  "modelos": { "7805": { "vref": 2.5003, "r1": 50000, "r2": 50000 } },
  "internas": ["fb"],
  "medida": { "mas": "OUT", "menos": "GND", "i": 1 },
  "elementos": [
    { "t": "R", "a": "OUT", "b": "fb", "ohms": "r1" },
    { "t": "R", "a": "fb", "b": "GND", "ohms": "r2" }
  ]
}
```

En un compuesto, un transistor con capacitancias de unión (`cje`, `cjc`, `tf`, `tr`) de resistencias muy pequeñas (`rc`, `re` de milésimas de ohm) forma constantes de tiempo de picosegundos y la regla trapezoidal oscila (también en ngspice): los transistores de paso de los reguladores van sin ellas.

`rserie` en un modelo `C`, `L` o `V` es el id de una propiedad numérica con una resistencia en serie (ESR del capacitor, resistencia del alambre de la bobina, resistencia interna de la batería): con ella mayor que cero la netlist pone el elemento y una resistencia unidos por una red interna, y la lectura de la pieza es la de sus dos terminales. `ley` en un modelo `pot` es una propiedad de lista con «lineal», «logarítmica» o «antilogarítmica» (la logarítmica de audio, 15 % del valor a mitad del giro); con `"reostato": true` el potenciómetro no lleva `b` y es una sola resistencia del pin `a` al cursor `c`. Un pin puede llevar `ayuda`, renglones separados por « · » que el globo del pin muestra bajo su nombre.

`foco` lleva `voltaje` y `potencia` (propiedades), `k` (el filamento caliente tiene 1 + k veces la resistencia del frío; 9 da la corriente de arranque de diez veces la nominal) y `tau` (inercia térmica, s). Si el calentamiento llega al doble del nominal (un foco de 12 V a 24 V), el filamento se funde: queda abierto y el Registro lo avisa.

```json
"modelo": { "tipo": "foco", "a": "1", "b": "2", "voltaje": "voltaje", "potencia": "potencia", "k": 9, "tau": 0.05 }
```

`fusible` lleva la corriente nominal en `prop`, `rPorA` (la resistencia de uno de 1 A; la de los demás es esa entre su corriente), `fusion` (veces la nominal que lo funden sostenidas) y `tau` (s). El calentamiento sigue a i² con esa constante, así que un pulso corto lo funde cuando su I²t llega a tau · (fusion · nominal)².

```json
"modelo": { "tipo": "fusible", "a": "1", "b": "2", "prop": "corriente", "rPorA": 0.1, "fusion": 2, "tau": 0.125 }
```

`motor` lleva el voltaje nominal (propiedad) y un motor de `referencia` a `v` volts con su resistencia `r`, inductancia `l`, constante `ke` (V·s/rad, igual a la de par en N·m/A), inercia `j` (kg·m²) y fricción viscosa `bm` (N·m·s/rad). Uno de otro voltaje es el mismo motor con otro devanado: `r` y `l` crecen con el cuadrado del voltaje y `ke` con el voltaje.

```json
"modelo": { "tipo": "motor", "a": "+", "b": "-", "voltaje": "voltaje", "referencia": { "v": 6, "r": 3, "l": 1.5e-3, "ke": 6.05e-3, "j": 2.4e-7, "bm": 6.4e-7 } }
```

`rele` lleva los pines de la bobina (`a1`, `a2`) y del contacto (`com`, `na`, `nc`), el voltaje de la bobina (propiedad), su `potencia` (W) y su constante `tau` (s) (la bobina es voltaje² / potencia en serie con tau por esa resistencia), y `operar` y `liberar`: el contacto pasa a normalmente abierto cuando la corriente llega a la de `operar` veces el voltaje nominal y vuelve cuando baja de la de `liberar` veces.

```json
"modelo": { "tipo": "rele", "a1": "A1", "a2": "A2", "com": "COM", "na": "NA", "nc": "NC", "voltaje": "voltaje", "potencia": 0.36, "tau": 3e-3, "operar": 0.75, "liberar": 0.1 }
```

`zumbador` es una resistencia que consume `potencia` (W) al voltaje nominal (propiedad) y suena desde `umbral` veces ese voltaje.

```json
"modelo": { "tipo": "zumbador", "a": "+", "b": "-", "voltaje": "voltaje", "potencia": 0.15, "umbral": 0.6 }
```

### Modelos digitales

Las piezas digitales llevan dos propiedades de lista: `familia` (una de las de `componentes/familias-logicas.json`: 74HC, 74LS o CD4000B) y `alimentacion` (su voltaje, como «5 V»). La alimentación es implícita: no hay pines de VCC ni GND y la pieza no toma corriente del circuito. Los umbrales, los niveles, los retardos y las resistencias de salida salen de la familia a esa alimentación (`netlist/familias.ts`); se editan en `familias-logicas.json`, con un punto por alimentación de la hoja de datos.

`compuerta` lleva `funcion` (not, and, or, nand, nor o xor), los pines `entradas` (uno en NOT y dos en las demás) y `salida`.

    "modelo": { "tipo": "compuerta", "funcion": "nand", "entradas": ["A", "B"], "salida": "Y", "familia": "familia", "alimentacion": "alimentacion" }

`biestable-d` (flanco de subida) y `biestable-jk` (flanco de bajada) llevan sus pines por nombre: `d` o `j` y `k`, `clk`, `pre` y `clr` (activos en bajo), `q` y `qn`. `contador` lleva `clk`, `rst` (activo en alto), `q` (Q0 a Q3), `co` y `hasta`, la propiedad de lista con «9» o «15». `decodificador` lleva `entradas` (A a D, A el bit menos significativo), `salidas` (a a g), `polaridad` (la propiedad de lista) y `bajo` (su opción de salidas activas en bajo). `estado-logico` lleva su pin `salida` y `prop`, la propiedad de lista con «0» y «1».

`555` lleva sus ocho pines por nombre y, por cada opción de `prop`, los parámetros del macromodelo: `rdiv` (cada resistencia del divisor, Ω), `rq` (la que da el consumo en reposo, Ω), `vres` (umbral de RESET, V), `td` (retardo del biestable, s), `tr` y `tf` (subida y bajada de la salida, s), `vlo` y `rlo` (la salida en bajo, en V sobre GND y Ω), `vhi` y `rhi` (en alto, en V sobre VCC, negativo si queda debajo, y Ω), `rdis` (la descarga cerrada, Ω) y `vmin` y `vmax` (la alimentación que admite, V). Los del NE555 y el LM555 salen de la hoja de datos del NE555 de TI; los del TLC555, de la suya, salvo `rdiv`, que no está publicado y se estimó en 100 kΩ.

`display` lleva sus ocho segmentos (`segmentos`, a a g y el punto), su `comun`, `conexion` (la propiedad de lista del tipo) y `anodo` (su opción de ánodo común), y el diodo de cada segmento como el LED: `is`, `n` y, por color, `por`.

### Instrumentos

`multimetro`, `osciloscopio`, `generador` y `fuente-variable` son piezas que se cablean como en el laboratorio. Nombran sus pines (`mas` y `com`; `entradas`, las cuatro del osciloscopio; `sal` y `com`; `mas` y `menos`) y sus propiedades; lo que significa cada propiedad lo fija `src/renderer/src/instrumentos/ajustes.ts`, que también trae los rangos y la serie 1, 2 y 5 de los voltios por división y de la base de tiempo. Para el motor cada instrumento es un conjunto de elementos que ya sabe resolver: el multímetro, un solo fusible de 10 A con la resistencia de toda la cadena de su modo y la fuente de prueba en serie (sin nodos internos); el osciloscopio, 1 MΩ a tierra por entrada; el generador, su onda en serie con 50 Ω; la fuente variable, su dispositivo de dos tramos con 100 nF de salida. La casilla `ideal` cambia esas cargas por las de un instrumento ideal.

Tres extensiones del formato sirven a cualquier pieza: `"casilla": true` en una lista de dos opciones (el inspector la muestra como casilla y la segunda es la marcada), `"valores"` en un rótulo con `prop` de lista (el texto de cada opción, como la letra del modo del multímetro) y `"variantes"` (un dibujo extra por opción de una lista, en archivos `simbolo-<nombre>.svg` de la misma carpeta, como la onda dentro del generador). `"ajuste": true` en una propiedad numérica la aparta del valor que se dibuja junto a la pieza y del que propone el buscador.

El generador de funciones toca siete formas: senoidal, cuadrada, triangular, diente de sierra, pulso, escalón y escalera. Todas salen de la onda `pulse` del motor salvo la escalera, que tiene la suya (`stair`, con `steps` niveles iguales de `low` a `high` por periodo). El diente de sierra es un pulso que sube todo el periodo, y el escalón, uno de 1,000 s que arranca bajo y sube tras `retardo`. Sus propiedades `desfase` (grados), `retardo` (s) y `pasos` llevan `ajuste` y `omitir`, así que un `.kir` de antes se abre igual. La frecuencia y el periodo se calculan uno del otro (solo se guarda la frecuencia), y la amplitud pico a pico y el desplazamiento tienen su par mínimo y máximo (solo se guardan los dos primeros).

## Propiedades de texto

Una propiedad con `"texto": true` es un texto libre, como el nombre de un terminal: no lleva `unidad`, `opciones` ni `mostrar`, su `defecto` es el texto de omisión (de 1 a 24 caracteres) y el inspector la edita sin notación de ingeniería («5V» es un nombre y no un valor). Puede llevar `comunes`: nombres listos de 1 a 24 caracteres, que el buscador muestra como «Nombres comunes». No cuenta como el «valor» de la pieza: el valor que se dibuja es el de la primera propiedad numérica (en el terminal de alimentación, el voltaje de su riel). Para dibujar su texto junto al símbolo se usa un rótulo ligado a ella.

```json
"props": [{ "id": "nombre", "nombre": "Nombre", "defecto": "VCC", "texto": true, "comunes": ["+15V", "-15V", "+5V", "VCC", "VEE"] }]
```

## Rótulos y modelo visible

`rotulos` es una lista opcional de textos dentro o junto al símbolo. Cada uno lleva `texto` y `x`, `y` (el ancla, en unidades de rejilla fina del símbolo sin girar; pueden ser fraccionarios) y, opcionalmente: `tam` (alto de la letra en mm, 1.25 por omisión), `alinear` (`izq`, `centro`, `der`, `arriba` o `abajo`; `centro` por omisión), `fuente` (`mono` por omisión, o `sans`) y `tinta` (`pieza`, la tinta del símbolo, por omisión; o `valor`, el gris secundario de los números de pin).

El ancla gira y se refleja con la pieza, pero el texto nunca: se queda horizontal. `alinear` dice hacia dónde crece el texto desde el ancla en el símbolo sin girar: `izq` hacia la derecha del ancla (el texto empieza en ella), `der` hacia su izquierda, `centro` sin desplazarse. Al girar o reflejar la pieza, esa dirección gira con ella: si queda horizontal, el texto sigue creciendo hacia ese lado (con espejo o a 180° `izq` y `der` se intercambian, y así el texto sigue del mismo lado del pin); si queda vertical, el texto se centra sobre el ancla. `arriba` y `abajo` sirven para un nombre que cuelga de un borde horizontal del cuerpo (el GND del 555 hacia arriba, el RESET hacia abajo): sin girar queda centrado, pero a 90° o 270°, cuando ese borde pasa a ser vertical, el texto crece hacia adentro del cuerpo en vez de cruzar el borde.

Un rótulo con `prop` en lugar de `texto` dibuja el valor de una propiedad de texto de la pieza (recortado a 24 caracteres; si la pieza no la trae, el texto de omisión de la propiedad). Con `alinear: "arriba"` el nombre de un terminal queda sobre la punta de su flecha y, al girar la pieza, crece hacia afuera de ella. El ancho que cuenta para la caja del símbolo es el del texto de omisión; un nombre más largo sobresale sin ampliar la caja.

```json
"rotulos": [{ "prop": "nombre", "x": 0, "y": -5.6, "tam": 2, "alinear": "arriba" }]
```

Los rótulos no cuentan como cuerpo para las colisiones, pero la referencia y el valor se apartan de ellos y la caja de la pieza se amplía si alguno se sale. Como los demás textos, se ocultan por debajo de 6 px de alto; lo que debe verse a cualquier zoom y se lee igual girado (el «+», por ejemplo) se dibuja con trazos, y lo que se lee mal girado (letras, el «−») va como rótulo.

`mostrar: true` en una propiedad de lista (con `opciones`) hace que la opción elegida se dibuje como valor de la pieza cuando esta no tiene una propiedad numérica. Hoy lo llevan `modelo` de `npn`, `pnp`, `mosfet-n`, `mosfet-p`, `amp-op` y `temporizador-555`.

## Convención de `simbolo.svg`

El `viewBox` usa las mismas unidades que los pines (rejilla fina), con el origen en el centro de la pieza. El elemento raíz lleva `fill="none" stroke="currentColor"`, de modo que todo se traza y nada se rellena. Un elemento con `fill="currentColor"` se rellena (por ejemplo el triángulo del diodo). Los valores `none`, `transparent` y vacío cuentan como ausencia de color.

Se admiten los elementos `g`, `line`, `polyline`, `polygon`, `rect`, `circle`, `ellipse` y `path`, y en las trayectorias los comandos M, L, H, V, C, Q, A y Z, absolutos y relativos. Se ignoran `title`, `desc`, `metadata`, `defs` y los elementos de otros espacios de nombres, como los que agrega Inkscape.

No se admiten `transform` ni `style` con `fill` o `stroke` (se usan los atributos). Las banderas de los arcos se escriben separadas, `A1 1 0 0 1 1 0` y no `A1 1 0 011 0`. No hay agujeros: cada trayectoria cerrada con relleno se pinta sólida. El grosor de línea se ignora, porque la aplicación dibuja un solo grosor.

Cada pin debe coincidir con el extremo de una línea del dibujo; de otro modo el cable parecería terminar en el aire.

Si una figura rellena no lleva trazo, sus bordes se ven dentados: agrega también trazo.

## Convención de la fuente de corriente

Los pines de `fuente-corriente` se llaman `entrada` (la cola de la flecha, abajo) y `salida` (la punta, arriba). La corriente entra por `entrada`, atraviesa la fuente y sale por `salida` hacia el circuito. SPICE escribe `I n+ n- valor` y da por positiva la corriente que va de `n+` a `n−` a través de la fuente, así que el netlist asigna `n+ = entrada` y `n− = salida`. Con ese mapeo, un valor positivo empuja la corriente hacia el circuito conectado a `salida`, como indica la flecha.

## Amplitud de la fuente AC

La propiedad `amplitud` de `fuente-ac` es el valor de pico, no el eficaz: eficaz = pico / √2. Una red de 127 V eficaces tiene un pico de unos 180 V, por eso 180 está entre los valores comunes.

## Animaciones

`animacion` es opcional y trae a lo más uno de estos tipos; una clave que no es del tipo, un tipo que no aplica al modelo o un parámetro fuera de rango se rechaza al cargar la Librería con el renglón de la clave `animacion` en el archivo:

- `{ "tipo": "brillo", "color": "color" }`: luz según la corriente media entre la nominal (`inom` del modelo o de la opción), con la raíz de esa fracción. `color` es la propiedad de lista que elige la luz, con opciones de entre rojo, verde, azul, amarillo y blanco (los colores que el lienzo sabe pintar); sin `color`, rojo. Para el LED y el display.
- `{ "tipo": "filamento" }`: la luz del foco según el calentamiento de su filamento, del naranja apagado al blanco cálido.
- `{ "tipo": "giro", "vueltasMax": 2 }`: la capa `rotor` gira con las rpm del motor por la velocidad del tiempo, a lo más `vueltasMax` vueltas por segundo de pantalla (de 0 a 10).
- `{ "tipo": "contacto", "manda": "operado" }` (solo el relé): elige entre las capas `estado-reposo` y `estado-operado` según la lectura del relé, con un recorrido de 60 ms. Las dos capas deben tener los mismos trazos con el mismo número de puntos (el recorrido los interpola). El interruptor y el botón no la usan: se dibujan con `accionado.svg`, y una pieza no puede traer las dos cosas.
- `{ "tipo": "cursor", "prop": "posicion", "desde": -2.5, "hasta": 2.5, "codo": -3 }`: la capa `cursor` se corre en x de `desde` (0 %) a `hasta` (100 %) según la propiedad de la posición del potenciómetro; lo que está arriba de `codo` (y) no se mueve y donde la línea lo cruza se agrega un tramo horizontal. Al 50 % el dibujo es el de siempre. Se ve igual al editar, al simular y al exportar.
- `{ "tipo": "sonido", "frecuencia": "frecuencia", "onda": "triangular" }`: el tono del zumbador mientras suena; `frecuencia` es una propiedad numérica en Hz y `onda` es `triangular`, `senoidal` o `cuadrada`.

Las capas son grupos del `simbolo.svg` con `data-capa` (minúsculas con guiones, sin capas dentro de capas ni repetidas):

```svg
<circle cx="0" cy="0" r="2"/><g data-capa="rotor"><path d="M0 -1.85 V-1.35"/></g>
```

El símbolo debe traer exactamente las capas que pide su animación: una que falta o una que nadie usa es un error. Lo que no anima (la caja del cuerpo, las colisiones, la vista previa de la Librería) ve el símbolo con sus capas en reposo: el rotor quieto, el contacto en `estado-reposo` y el cursor al 50 %.

## Modelo propio («Personalizado»)

Un transistor, un MOSFET o un amplificador puede llevar en el documento sus propios parámetros de SPICE (`spice` de la pieza, con los nombres de ngspice de las secciones anteriores) en lugar de los de su lista de modelos. No se declara en el `pieza.json`: lo ofrecen el inspector y el doble clic para todo modelo `bjt`, `mosfet` y `ampop`, en «Más ajustes». Lo que falta toma el valor de omisión de ngspice.

## Fuentes de los modelos

`fuentes` es un objeto con un texto por opción de la propiedad `modelo`: la hoja de datos del fabricante o el modelo libre de donde salen los parámetros (documento, revisión y URL). Si los parámetros se ajustaron a la hoja de datos en lugar de copiarse de un archivo de modelo (siempre que la licencia de ese archivo no permita redistribuirlo), el texto lo dice, y dice también qué cifras la hoja no da y quedaron sin validar. Cada modelo nuevo se compara con ngspice con los mismos parámetros (`engine/referencias/` y `scripts/referencias-ngspice.mjs`) y con los puntos clave de su hoja (`netlist/modelosDiscretos.test.ts`).

## Límites

`limites` dice lo que la pieza admite antes de avisar en el lienzo y, con «Las piezas se queman» de Configuración, de quemarse:

```json
"limites": {
  "potencia": "potencia",
  "por": { "prop": "modelo", "valores": { "2N2222": { "corriente": 0.6, "potencia": 0.625, "fuente": "ON Semiconductor, P2N2222A/D, Maximum Ratings" } } },
  "quema": { "factor": 2, "durante": 0.5 }
}
```

`potencia` (solo la resistencia) es el `id` de una propiedad de lista con potencias en W («0.25 W»). `por` (solo transistores) da la corriente (A) y la potencia (W) máximas de cada opción de la propiedad, con la hoja de datos de donde salen; cada opción necesita su renglón. `quema` (LED, resistencia, transistores, capacitor electrolítico y motor) quema la pieza cuando pasa de `factor` veces su límite durante `durante` segundos simulados seguidos. El LED y el display avisan con su `inom`, el foco con su potencia nominal y el fusible con su corriente nominal, sin `limites`.

`voltaje` (capacitor electrolítico y motor) dice cuál propiedad trae el voltaje nominal (numérica, como la del motor, o una lista como «25 V») y cuántas veces ese nominal avisa (`aviso`: 1 en el capacitor, 1.5 en el motor, con el valor absoluto del voltaje en el motor). El capacitor lleva además `inverso`, los volts al revés que admite (1): avisa con más de eso y con más de `aviso` veces el nominal en directo. Su `quema` tiene `factor` 1 (se quema al pasar de su límite, directo o inverso) y la del motor 2 (al doble del nominal); el motor, como el capacitor, solo cuenta el voltaje medio del intervalo.

```json
"limites": { "voltaje": { "prop": "voltaje", "aviso": 1, "inverso": 1 }, "quema": { "factor": 1, "durante": 0.5 } }
```

`compuesto` (solo las piezas de modelo `compuesto`: ULN2003, reguladores) es una lista de límites por canal o por sentido. Cada uno trae `nombre` («canal 1»), `elementos` (índices de `modelo.elementos` cuyas corrientes se suman, o cuyos voltajes si `medida` es `"voltaje"`; la corriente de un transistor es la de colector y su voltaje, Vce), `sentido` (`"positiva"` avisa cuando la suma pasa de `max`, `"negativa"` cuando su opuesto pasa: un PNP trae el signo al revés que un NPN), `max` (A o V), `consejo` (cierra la línea del Registro) y `fuente` (la hoja de datos, o «Criterio de Kirchi»). Solo avisa, no quema la pieza:

```json
"limites": { "compuesto": [ { "nombre": "canal 1", "elementos": [2, 3], "sentido": "positiva", "max": 0.5, "consejo": "reparte la carga entre canales.", "fuente": "TI SLRS027T" } ] }
```

`absolutos` (amp-op, comparador, transistores, diodo, Zener, 555 y reguladores) son los máximos absolutos de la hoja de datos de cada modelo. Lleva `prop` (la propiedad de lista que elige el juego; sin ella, el único va en la llave `*`) y, por opción, `fuente` (documento, revisión y tabla) y `limites`: una lista donde cada máximo trae `nombre` («alimentación (V+ a V−)»), `consejo` (cierra la línea del Registro) y bien un voltaje (`de`, un pin o una lista de pines, y `a`, un pin o `tierra`; el máximo es lo que vale V(de) − V(a), con `abs` su valor absoluto) o bien una `medida` (`corriente` media o `potencia` media de la pieza), con `min`, `max` y, si es un margen sobre otro punto, `escala` (V, para el quemado). Una opción sin juego, como el diodo «Genérico», no tiene máximos. Avisa en el chip, en el Registro y en Proyecto, y con «Las piezas se queman» abre la pieza desde 1.25 veces su máximo (`quema` lleva `elemento` en las compuestas: el índice de `modelo.elementos` que se abre):

```json
"limites": {
  "absolutos": { "prop": "modelo", "valores": { "TL081": { "fuente": "Texas Instruments TL081, SLOS081, Absolute Maximum Ratings: ±18 V.", "limites": [ { "nombre": "alimentación (V+ a V−)", "de": "V+", "a": "V-", "max": 36, "consejo": "baja la alimentación." } ] } } },
  "quema": { "factor": 2, "durante": 0.5 }
}
```

Una propiedad con `"omitir": true` no se escribe en el documento al colocar la pieza: la pieza toma su `defecto` hasta que se cambia, y un `.kir` de antes que no la trae se guarda con los mismos bytes.
