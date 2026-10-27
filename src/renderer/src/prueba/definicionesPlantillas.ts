import { cablesDe, etiquetasDe, parte } from '../calculadoras/disposicion'
import { FILTROS_DE_BANDA } from './definicionesNuevas'
import { PLANTILLAS_MSI } from './definicionesMsi'
import type { DefPlantilla } from './plantillasIncluidas'


/** Plantillas incluidas armadas a mano (las de banda están en `definicionesNuevas.ts`), con posiciones, textos y cables de
 * `calculadoras/disposicion.ts`. Las fuentes de etapas con circuito integrado son terminales con nombre de voltaje
 * («+5V»): el nombre es la red, como en Proteus. */
const BASICAS: DefPlantilla[] = [
  {
    id: 'divisor-de-voltaje',
    nombre: 'Divisor de voltaje',
    descripcion: 'Dos resistencias en serie reparten el voltaje de la fuente.',
    partes: [
      parte('divisor', 'v1', 'fuente-dc', { voltaje: '9' }),
      parte('divisor', 'r1', 'resistencia', { valor: '10k' }),
      parte('divisor', 'r2', 'resistencia', { valor: '4k7' }),
      parte('divisor', 'g1', 'tierra')
    ],
    conexiones: [['v1.+', 'r1.1'], ['r1.2', 'r2.1'], ['v1.-', 'g1.1'], ['r2.2', 'g1.1']],
    cables: cablesDe('divisor'),
      etiquetas: etiquetasDe('divisor')
  },
  {
    id: 'led-con-resistencia',
    nombre: 'LED con resistencia',
    descripcion: 'La resistencia limita la corriente del LED a unos 9 mA.',
    partes: [
      parte('led', 'v1', 'fuente-dc', { voltaje: '5' }),
      parte('led', 'r1', 'resistencia', { valor: '330' }),
      parte('led', 'd1', 'led', { color: 'rojo' }),
      parte('led', 'g1', 'tierra')
    ],
    conexiones: [['v1.+', 'r1.1'], ['r1.2', 'd1.A'], ['v1.-', 'g1.1'], ['d1.K', 'g1.1']],
    cables: cablesDe('led'),
      etiquetas: etiquetasDe('led')
  },
  {
    id: 'filtro-rc-paso-bajas',
    nombre: 'Filtro RC paso bajas',
    descripcion: 'Deja pasar las frecuencias bajas y atenúa las altas, con corte en unos 1.6 kHz.',
    partes: [
      parte('bajas', 'g1', 'generador', { frecuencia: '1k', amplitud: '2' }),
      parte('bajas', 'r1', 'resistencia', { valor: '1k' }),
      parte('bajas', 'c1', 'capacitor', { valor: '100n' }),
      parte('bajas', 't1', 'tierra')
    ],
    conexiones: [['g1.+', 'r1.1'], ['r1.2', 'c1.1'], ['g1.COM', 't1.1'], ['c1.2', 't1.1']],
    cables: cablesDe('bajas'),
      etiquetas: etiquetasDe('bajas')
  },
  {
    id: 'filtro-rc-paso-altas',
    nombre: 'Filtro RC paso altas',
    descripcion: 'Deja pasar las frecuencias altas y bloquea las bajas, con corte en unos 1.6 kHz.',
    partes: [
      parte('altas', 'g1', 'generador', { frecuencia: '1k', amplitud: '2' }),
      parte('altas', 'c1', 'capacitor', { valor: '100n' }),
      parte('altas', 'r1', 'resistencia', { valor: '1k' }),
      parte('altas', 't1', 'tierra')
    ],
    conexiones: [['g1.+', 'c1.1'], ['c1.2', 'r1.1'], ['g1.COM', 't1.1'], ['r1.2', 't1.1']],
    cables: cablesDe('altas'),
      etiquetas: etiquetasDe('altas')
  },
  {
    id: '555-astable',
    nombre: '555 astable',
    descripcion: 'El 555 oscila solo y hace parpadear un LED, a unos 690 Hz.',
    partes: [
      parte('astable', 'u1', 'temporizador-555', { modelo: 'NE555' }),
      parte('astable', 'p1', 'alimentacion', { nombre: '+5V' }),
      parte('astable', 'p2', 'alimentacion', { nombre: '+5V' }),
      parte('astable', 'r1', 'resistencia', { valor: '1k' }),
      parte('astable', 'r2', 'resistencia', { valor: '10k' }),
      parte('astable', 'c1', 'capacitor', { valor: '100n' }),
      parte('astable', 'c2', 'capacitor', { valor: '10n' }),
      parte('astable', 'r3', 'resistencia', { valor: '330' }),
      parte('astable', 'd1', 'led', { color: 'rojo' }),
      parte('astable', 'g1', 'tierra'),
      parte('astable', 'g2', 'tierra'),
      parte('astable', 'g3', 'tierra'),
      parte('astable', 'g4', 'tierra')
    ],
    conexiones: [
      ['p1.1', 'u1.8'], ['u1.4', 'u1.8'], ['p2.1', 'r1.1'], ['r1.2', 'u1.7'], ['r1.2', 'r2.1'], ['r2.2', 'c1.1'],
      ['u1.6', 'u1.2'], ['r2.2', 'u1.2'], ['c1.2', 'g2.1'], ['u1.1', 'g1.1'], ['u1.5', 'c2.1'], ['c2.2', 'g3.1'],
      ['u1.3', 'r3.1'], ['r3.2', 'd1.A'], ['d1.K', 'g4.1']
    ],
    cables: cablesDe('astable'),
      etiquetas: etiquetasDe('astable')
  },
  {
    id: '555-monoestable',
    nombre: '555 monoestable',
    descripcion: 'Un pulso corto en el disparo da un pulso de salida de duración fija, unos 0.11 s.',
    partes: [
      parte('monoestable', 'u1', 'temporizador-555', { modelo: 'NE555' }),
      parte('monoestable', 'p1', 'alimentacion', { nombre: '+5V' }),
      parte('monoestable', 'p2', 'alimentacion', { nombre: '+5V' }),
      parte('monoestable', 'r1', 'resistencia', { valor: '10k' }),
      parte('monoestable', 'c1', 'capacitor-electrolitico', { valor: '10u' }),
      parte('monoestable', 'v2', 'fuente-pulso', { alto: '5', frecuencia: '2', ciclo: '90 %' }),
      parte('monoestable', 'c2', 'capacitor', { valor: '10n' }),
      parte('monoestable', 'r3', 'resistencia', { valor: '330' }),
      parte('monoestable', 'd1', 'led', { color: 'rojo' }),
      parte('monoestable', 'g1', 'tierra'),
      parte('monoestable', 'g2', 'tierra'),
      parte('monoestable', 'g3', 'tierra'),
      parte('monoestable', 'g4', 'tierra'),
      parte('monoestable', 'g5', 'tierra')
    ],
    conexiones: [
      ['p1.1', 'u1.8'], ['u1.4', 'u1.8'], ['p2.1', 'r1.1'], ['r1.2', 'u1.7'], ['u1.7', 'u1.6'], ['c1.+', 'u1.6'], ['c1.-', 'g2.1'],
      ['u1.1', 'g1.1'], ['u1.2', 'v2.+'], ['v2.-', 'g5.1'], ['u1.5', 'c2.1'], ['c2.2', 'g3.1'], ['u1.3', 'r3.1'], ['r3.2', 'd1.A'], ['d1.K', 'g4.1']
    ],
    cables: cablesDe('monoestable'),
      etiquetas: etiquetasDe('monoestable')
  },
  {
    id: 'emisor-comun',
    nombre: 'Amplificador de emisor común',
    descripcion: 'Un 2N2222 polarizado con divisor de base amplifica la señal del generador.',
    partes: [
      parte('emisor', 'q1', 'npn', { modelo: '2N2222' }),
      parte('emisor', 'p1', 'alimentacion', { nombre: '+12V' }),
      parte('emisor', 'p2', 'alimentacion', { nombre: '+12V' }),
      parte('emisor', 'r1', 'resistencia', { valor: '47k' }),
      parte('emisor', 'r2', 'resistencia', { valor: '10k' }),
      parte('emisor', 'rc', 'resistencia', { valor: '2k2' }),
      parte('emisor', 're', 'resistencia', { valor: '1k' }),
      parte('emisor', 'ce', 'capacitor-electrolitico', { valor: '100u' }),
      parte('emisor', 'c1', 'capacitor', { valor: '10u' }),
      parte('emisor', 'g1', 'generador', { frecuencia: '1k', amplitud: '0.02' }),
      parte('emisor', 'c2', 'capacitor', { valor: '10u' }),
      parte('emisor', 'rl', 'resistencia', { valor: '10k' }),
      parte('emisor', 't1', 'tierra'),
      parte('emisor', 't2', 'tierra'),
      parte('emisor', 't3', 'tierra'),
      parte('emisor', 't4', 'tierra')
    ],
    conexiones: [
      ['p1.1', 'r1.1'], ['p2.1', 'rc.1'], ['r1.2', 'q1.B'], ['r2.1', 'q1.B'], ['c1.2', 'q1.B'], ['r2.2', 't1.1'],
      ['g1.+', 'c1.1'], ['g1.COM', 't3.1'], ['rc.2', 'q1.C'], ['rc.2', 'c2.1'], ['c2.2', 'rl.1'], ['rl.2', 't4.1'],
      ['q1.E', 're.1'], ['re.1', 'ce.+'], ['re.2', 'ce.-'], ['re.2', 't2.1']
    ],
    cables: cablesDe('emisor'),
      etiquetas: etiquetasDe('emisor')
  },
  {
    id: 'amplificador-inversor',
    nombre: 'Amplificador inversor',
    descripcion: 'Un LM741 con realimentación invierte la señal, con ganancia −10.',
    partes: [
      parte('inversor', 'u1', 'amp-op', { modelo: 'LM741' }),
      parte('inversor', 'p1', 'alimentacion', { nombre: '+15V' }),
      parte('inversor', 'p2', 'alimentacion', { nombre: '-15V' }),
      parte('inversor', 'r1', 'resistencia', { valor: '1k' }),
      parte('inversor', 'r2', 'resistencia', { valor: '10k' }),
      parte('inversor', 'v1', 'fuente-dc', { voltaje: '0.5' }),
      parte('inversor', 'rl', 'resistencia', { valor: '10k' }),
      parte('inversor', 'g1', 'tierra'),
      parte('inversor', 'g2', 'tierra'),
      parte('inversor', 'g3', 'tierra')
    ],
    conexiones: [
      ['p1.1', 'u1.V+'], ['p2.1', 'u1.V-'], ['v1.+', 'r1.1'], ['r1.2', 'u1.-'], ['u1.+', 'g1.1'], ['r2.1', 'u1.-'], ['r2.2', 'u1.OUT'],
      ['u1.OUT', 'rl.1'], ['rl.2', 'g3.1'], ['v1.-', 'g2.1']
    ],
    cables: cablesDe('inversor'),
      etiquetas: etiquetasDe('inversor')
  },
  {
    id: 'amplificador-no-inversor',
    nombre: 'Amplificador no inversor',
    descripcion: 'Un LM741 amplifica sin invertir, con ganancia 11.',
    partes: [
      parte('noinversor', 'u1', 'amp-op', { modelo: 'LM741' }),
      parte('noinversor', 'p1', 'alimentacion', { nombre: '+15V' }),
      parte('noinversor', 'p2', 'alimentacion', { nombre: '-15V' }),
      parte('noinversor', 'r1', 'resistencia', { valor: '1k' }),
      parte('noinversor', 'r2', 'resistencia', { valor: '10k' }),
      parte('noinversor', 'v1', 'fuente-dc', { voltaje: '0.5' }),
      parte('noinversor', 'rl', 'resistencia', { valor: '10k' }),
      parte('noinversor', 'g1', 'tierra'),
      parte('noinversor', 'g2', 'tierra'),
      parte('noinversor', 'g3', 'tierra')
    ],
    conexiones: [
      ['p1.1', 'u1.V+'], ['p2.1', 'u1.V-'], ['v1.+', 'u1.+'], ['v1.-', 'g2.1'], ['r1.1', 'g1.1'], ['r1.2', 'u1.-'], ['r2.1', 'u1.-'], ['r2.2', 'u1.OUT'],
      ['u1.OUT', 'rl.1'], ['rl.2', 'g3.1']
    ],
    cables: cablesDe('noinversor'),
      etiquetas: etiquetasDe('noinversor')
  },
  {
    id: 'puente-rectificador',
    nombre: 'Puente rectificador con filtro',
    descripcion: 'Cuatro diodos rectifican la corriente alterna y un capacitor alisa el voltaje, cerca de 10.6 V.',
    partes: [
      parte('puente', 'v1', 'fuente-ac', { amplitud: '12', frecuencia: '60' }),
      parte('puente', 'd1', 'diodo'),
      parte('puente', 'd3', 'diodo'),
      parte('puente', 'd2', 'diodo'),
      parte('puente', 'd4', 'diodo'),
      parte('puente', 'c1', 'capacitor-electrolitico', { valor: '470u' }),
      parte('puente', 'rl', 'resistencia', { valor: '1k' }),
      parte('puente', 'g1', 'tierra'),
      parte('puente', 'g2', 'tierra')
    ],
    conexiones: [
      ['v1.+', 'd1.A'], ['d1.A', 'd3.K'], ['v1.-', 'd4.K'], ['d4.K', 'd2.A'], ['d1.K', 'd2.K'], ['d2.K', 'c1.+'], ['c1.+', 'rl.1'],
      ['d3.A', 'g1.1'], ['d4.A', 'g1.1'], ['c1.-', 'g2.1'], ['rl.2', 'g2.1']
    ],
    cables: cablesDe('puente'),
      etiquetas: etiquetasDe('puente')
  },
  {
    id: 'puente-h-discreto',
    nombre: 'Puente H discreto',
    descripcion: 'Dos pares TIP31 y TIP32 manejan un motor en los dos sentidos y lo detienen con las dos entradas iguales.',
    partes: [
      ['qa1', 'npn', 0, -10, 0, { modelo: 'TIP31' }],
      ['qa2', 'pnp', 0, 10, 0, { modelo: 'TIP32' }],
      ['da1', 'diodo', 8, -10, 270, { modelo: '1N4007' }],
      ['da2', 'diodo', 8, 10, 270, { modelo: '1N4007' }],
      ['ra', 'resistencia', -12, 0, 0, { valor: '10' }],
      ['va', 'fuente-dc', -22, 0, 0, { voltaje: '6' }],
      ['pa1', 'alimentacion', 2, -18, 0, { nombre: '+6V' }],
      ['pa2', 'alimentacion', 8, -18, 0, { nombre: '+6V' }],
      ['ga1', 'tierra', 2, 18, 0],
      ['ga2', 'tierra', 8, 18, 0],
      ['ga3', 'tierra', -22, 8, 0],
      ['qb1', 'npn', 0, 36, 0, { modelo: 'TIP31' }],
      ['qb2', 'pnp', 0, 56, 0, { modelo: 'TIP32' }],
      ['db1', 'diodo', 8, 36, 270, { modelo: '1N4007' }],
      ['db2', 'diodo', 8, 56, 270, { modelo: '1N4007' }],
      ['rb', 'resistencia', -12, 46, 0, { valor: '10' }],
      ['vb', 'fuente-dc', -22, 46, 0, { voltaje: '0' }],
      ['pb1', 'alimentacion', 2, 28, 0, { nombre: '+6V' }],
      ['pb2', 'alimentacion', 8, 28, 0, { nombre: '+6V' }],
      ['gb1', 'tierra', 2, 64, 0],
      ['gb2', 'tierra', 8, 64, 0],
      ['gb3', 'tierra', -22, 54, 0],
      ['m1', 'motor-dc', 22, 23, 90, { voltaje: '6' }]
    ],
    conexiones: [
      ['va.+', 'ra.1'], ['ra.2', 'qa1.B'], ['ra.2', 'qa2.B'], ['qa1.C', 'pa1.1'], ['qa1.E', 'qa2.E'], ['qa1.E', 'da1.A'], ['qa2.E', 'da2.K'],
      ['qa2.C', 'ga1.1'], ['da1.K', 'pa2.1'], ['da2.A', 'ga2.1'], ['va.-', 'ga3.1'],
      ['vb.+', 'rb.1'], ['rb.2', 'qb1.B'], ['rb.2', 'qb2.B'], ['qb1.C', 'pb1.1'], ['qb1.E', 'qb2.E'], ['qb1.E', 'db1.A'], ['qb2.E', 'db2.K'],
      ['qb2.C', 'gb1.1'], ['db1.K', 'pb2.1'], ['db2.A', 'gb2.1'], ['vb.-', 'gb3.1'],
      ['qa1.E', 'm1.+'], ['qb1.E', 'm1.-']
    ]
  }
]

/** Las incluidas de siempre, los tres filtros de banda y las de lógica MSI. */
export const DEFINICIONES: DefPlantilla[] = [...BASICAS, ...FILTROS_DE_BANDA, ...PLANTILLAS_MSI]
