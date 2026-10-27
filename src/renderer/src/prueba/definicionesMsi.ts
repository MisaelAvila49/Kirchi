import type { DefPlantilla, Parte } from './plantillasIncluidas'

/** Plantillas de la lógica MSI. A diferencia de las de las calculadoras, no salen de `Calculadora.kir`: llevan sus propias posiciones y
 * el A* del editor enruta sus cables. */

const digito = (n: '1' | '2', y: number, familia: string): Parte[] => [
  [`u${n}`, 'contador-161', 0, y, 0, { familia: '74HC' }],
  [`u${n === '1' ? '3' : '4'}`, 'decodificador-7447', 28, y, 0, { familia }],
  [`d${n}`, 'display-7seg', 52, y, 0, { tipo: 'ánodo común' }],
  [`r${n}`, 'resistencia', 66, y, 0, { valor: '330' }],
  [`p${n}`, 'alimentacion', 74, y, 0, { nombre: '+5V' }]
]

const CONTADOR_99: DefPlantilla = {
  id: 'contador-0-a-99',
  nombre: 'Contador de 0 a 99',
  descripcion: 'Dos 74HC161 cuentan a 2 Hz y dos 74LS47 muestran las decenas y las unidades en displays de ánodo común.',
  partes: [
    ['v1', 'fuente-pulso', -46, 0, 0, { alto: '5', frecuencia: '2', ciclo: '50 %', retardo: '100m' }],
    ['g0', 'tierra', -46, 10, 0],
    ...digito('2', -30, '74LS'),
    ...digito('1', 30, '74LS'),
    ['g1', 'nand', 16, 12, 0, { familia: '74HC' }],
    ['g2', 'not', -28, 4, 0, { familia: '74HC' }],
    ['g3', 'nand-3', 16, -50, 0, { familia: '74HC' }],
    ['c1', 'alimentacion', -16, 14, 0, { nombre: '+5V' }],
    ['c2', 'alimentacion', -16, -48, 0, { nombre: '+5V' }],
    ['e1', 'alimentacion', -16, 48, 0, { nombre: '+5V' }],
    ['l1', 'alimentacion', 12, 44, 0, { nombre: '+5V' }],
    ['l2', 'alimentacion', 12, -20, 0, { nombre: '+5V' }],
    ['t1', 'tierra', -16, 32, 0],
    ['t2', 'tierra', -16, -28, 0]
  ],
  conexiones: [
    ['v1.-', 'g0.1'],
    ['v1.+', 'u1.CLK'], ['v1.+', 'u2.CLK'],
    ['c1.1', 'u1.CLR'], ['e1.1', 'u1.ENP'], ['e1.1', 'u1.ENT'], ['c2.1', 'u2.CLR'],
    ['t1.1', 'u1.A'], ['t1.1', 'u1.B'], ['t1.1', 'u1.C'], ['t1.1', 'u1.D'],
    ['t2.1', 'u2.A'], ['t2.1', 'u2.B'], ['t2.1', 'u2.C'], ['t2.1', 'u2.D'],
    ['u1.QA', 'u3.A'], ['u1.QB', 'u3.B'], ['u1.QC', 'u3.C'], ['u1.QD', 'u3.D'],
    ['u2.QA', 'u4.A'], ['u2.QB', 'u4.B'], ['u2.QC', 'u4.C'], ['u2.QD', 'u4.D'],
    ['u1.QA', 'g1.A'], ['u1.QD', 'g1.B'], ['g1.Y', 'u1.LOAD'],
    ['g1.Y', 'g2.A'], ['g2.Y', 'u2.ENP'], ['g2.Y', 'u2.ENT'],
    ['u2.QA', 'g3.A'], ['u2.QD', 'g3.B'], ['g2.Y', 'g3.C'], ['g3.Y', 'u2.LOAD'],
    ['l1.1', 'u3.LT'], ['l1.1', 'u3.RBI'], ['l2.1', 'u4.LT'], ['l2.1', 'u4.RBI'],
    ['u3.a', 'd1.a'], ['u3.b', 'd1.b'], ['u3.c', 'd1.c'], ['u3.d', 'd1.d'], ['u3.e', 'd1.e'], ['u3.f', 'd1.f'], ['u3.g', 'd1.g'],
    ['u4.a', 'd2.a'], ['u4.b', 'd2.b'], ['u4.c', 'd2.c'], ['u4.d', 'd2.d'], ['u4.e', 'd2.e'], ['u4.f', 'd2.f'], ['u4.g', 'd2.g'],
    ['d1.COM', 'r1.1'], ['r1.2', 'p1.1'], ['d2.COM', 'r2.1'], ['r2.2', 'p2.1']
  ]
}

export const PLANTILLAS_MSI: DefPlantilla[] = [CONTADOR_99]
