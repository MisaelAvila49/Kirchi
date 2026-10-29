import { zona, control, mira } from './pasos'
import { caja, piezasDe } from './condiciones'
import type { CapituloDef } from './tipos'

const TARJETA_APROXIMADAS = '.panel-proyecto .tarjeta-informe[data-clase="aproximadas"]'

/**
 * Capítulo 5: abrir un circuito de otro programa (un netlist SPICE que trae el tutorial), leer el informe y reemplazar la caja gris. Parte de un lienzo vacío. Abrir el ejemplo, cerrar el informe y pasar el ratón por una tarjeta se leen del estado de la ventana; reemplazar, del documento.
 */
export const CAPITULO_5: CapituloDef = {
  id: 'importar',
  numero: 5,
  titulo: 'Importar',
  resumen: 'Abrir un circuito de otro programa y reemplazar lo que no tiene equivalencia',
  descripcion: 'Abre un circuito de SPICE, lee el informe de lo que se aproximó y reemplaza la pieza que no tiene equivalencia.',
  minutos: 4,
  tono: 'naranja',
  totalPasos: 7,
  documentoNuevo: true,
  zona: { minX: -40, minY: -40, maxX: 80, maxY: 40 },
  pasos: [
    mira({
      id: 'abrir-formatos',
      resumen: 'mira qué circuitos abre Abrir',
      texto: '{icono:abrir|Abrir} también abre circuitos de Falstad, LTspice, SPICE, KiCad y Proteus.',
      pista: 'Arrastrar el archivo a la ventana hace lo mismo. El original no se modifica.',
      objetivo: () => control('[data-comando="abrir"]', 'inicio')
    }),
    {
      id: 'abrir-ejemplo',
      resumen: 'abre el circuito de ejemplo',
      texto: 'Pulsa Abrir el ejemplo, en este globo: es un amplificador escrito en SPICE.',
      cumplido: 'Circuito importado.',
      pista: 'Con Abrir se elegiría un archivo de tu equipo.',
      boton: { id: 'abrir-ejemplo', texto: 'Abrir el ejemplo' },
      objetivo: () => control('[data-comando="abrir"]', 'inicio'),
      hecho: (ctx) => ctx.dialogo === 'importacion' || ctx.doc.importacion !== undefined
    },
    mira({
      id: 'tarjetas',
      sobreDialogo: true,
      resumen: 'mira las tarjetas del informe',
      texto: 'Ocre: modelo aproximado. Rojo: sin equivalencia. Verde azulado: análisis convertido.',
      objetivo: () => control('.tarjetas-informe')
    }),
    {
      id: 'entendido',
      sobreDialogo: true,
      abre: 'proyecto',
      resumen: 'cierra el informe',
      texto: 'Pulsa Entendido para ver las tarjetas en {icono:proyecto|Proyecto}.',
      cumplido: 'Informe en Proyecto.',
      transitorio: true,
      objetivo: () => control('.dialogo-botones .principal'),
      hecho: (ctx) => ctx.dialogo !== 'importacion' && ctx.derecho === 'proyecto' && ctx.doc.importacion !== undefined
    },
    {
      id: 'resaltar',
      lado: 'izquierda',
      abre: 'proyecto',
      resumen: 'señala la tarjeta ocre',
      texto: 'Pasa el ratón por la tarjeta ocre y mira qué piezas se resaltan en el lienzo.',
      cumplido: 'Piezas aproximadas resaltadas.',
      transitorio: true,
      objetivo: () => control(TARJETA_APROXIMADAS),
      hecho: (ctx) => ctx.resaltada === 'aproximadas'
    },
    {
      id: 'reemplazar',
      resumen: 'reemplaza la caja gris',
      texto: '{gesto:clic-derecho} en la caja gris, elige Reemplazar por… y busca un amp op.',
      cumplido: 'Pieza reemplazada.',
      pista: 'Si Kirchi avisa que los pines no coinciden, confirma el cambio.',
      objetivo: (ctx) => {
        const p = piezasDe(ctx, 'sin-equivalencia')[0]
        return p ? zona(caja(ctx, p, 2)) : control('.panel-proyecto .tarjeta-informe[data-clase="sinEquivalencia"]')
      },
      hecho: (ctx) => (ctx.doc.importacion?.sinEquivalencia.length ?? 0) > 0 && piezasDe(ctx, 'sin-equivalencia').length === 0
    },
    mira({
      id: 'guardar',
      resumen: 'mira cómo se guarda',
      texto: '{icono:guardar|Guardar} crea un .kir nuevo con el circuito. El archivo original no se toca.',
      objetivo: () => control('[data-comando="guardar"]', 'inicio')
    })
  ]
}
