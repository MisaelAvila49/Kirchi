Filtro pasa bajas con comentarios
* esto es un comentario de linea
Vin entrada GND AC 1 ; fuente de prueba
R1 entrada
+ nodo 4.7kohm $ resistencia en serie
C1 nodo gnd 10uF
L1 nodo salida 2.2mH
Rl salida 0 1MEG
L2 salida 0 3u
K1 L1 L2 0.9
.param ganancia=2
.include "modelos/extra.lib"
.control
run
.endc
.options reltol=1e-4
.ac oct 10 1 1meg
.end
.op
