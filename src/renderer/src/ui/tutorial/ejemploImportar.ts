/** El circuito del capítulo «Importar»: un netlist SPICE propio, con un transistor que se aproxima, un LM13700 sin equivalencia y un transitorio. */
export const NOMBRE_EJEMPLO_IMPORTAR = 'amplificador.cir'

export const EJEMPLO_IMPORTAR = `Amplificador de un transistor con un LM13700
Vcc vcc 0 DC 12
Vb b1 0 DC 0.7
Rb b1 b 1k
Rc vcc c 2.2k
Re e 0 470
Q1 c b e BC548
X1 c out vcc 0 LM13700
Rl out 0 10k
.model BC548 NPN(IS=6.7f BF=416 VAF=74 CJE=4.5p)
.tran 1u 1m
.end
`
