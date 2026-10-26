import { createEffect, createSignal, on } from 'solid-js'
import type { RangoEje } from '../../../../compartido/grafica/aspecto'
import CampoValor from '../CampoValor'
import { rangoDeTextos } from './rangoCampos'

interface Props {
  /** El nombre del eje, para el nombre accesible de los campos. */
  nombre: string
  /** La unidad base del eje (V, s, Hz…): los campos llevan su lista de prefijos. */
  unidad: string
  /** El rango escrito a mano; ausente es el automático (campos vacíos). */
  rango: RangoEje | undefined
  onRango(r: RangoEje | undefined): void
  /** Las clases de la fila y del rótulo, que cambian entre el panel de la hoja y el del editor. */
  clase?: { fila: string; rotulo: string }
}

/**
 * «Desde» y «Hasta» de un eje con unidad y «Automático». Se aplica cuando los dos valores se leen y desde < hasta.
 */
export default function CamposRango(props: Props) {
  const clase = () => props.clase ?? { fila: 'asp-fila', rotulo: 'asp-rotulo' }
  const texto = (v: number | undefined) => (v === undefined ? '' : String(Number(v.toPrecision(12))))
  const [desde, setDesde] = createSignal(texto(props.rango?.min))
  const [hasta, setHasta] = createSignal(texto(props.rango?.max))
  // Un cambio que viene de fuera («Automático», deshacer) vuelve a escribirse en los campos.
  createEffect(
    on(
      () => props.rango,
      (r) => {
        const a = rangoDeTextos(desde(), hasta(), props.unidad)
        if (a && r && a.min === r.min && a.max === r.max) return
        setDesde(texto(r?.min))
        setHasta(texto(r?.max))
      },
      { defer: true }
    )
  )
  const aplicar = (d: string, h: string) => {
    const r = rangoDeTextos(d, h, props.unidad)
    if (r) props.onRango(r)
  }
  return (
    <>
      <div class={clase().fila} role="group" aria-label={`Rango de ${props.nombre}`}>
        <span class={clase().rotulo}>Desde</span>
        <CampoValor texto={desde()} unidad={props.unidad} nombre={`Desde, ${props.nombre}`} atributos={{ placeholder: 'Auto' }} onTexto={(t) => (setDesde(t), aplicar(t, hasta()))} />
      </div>
      <div class={clase().fila} role="group" aria-label={`Rango de ${props.nombre}`}>
        <span class={clase().rotulo}>Hasta</span>
        <CampoValor texto={hasta()} unidad={props.unidad} nombre={`Hasta, ${props.nombre}`} atributos={{ placeholder: 'Auto' }} onTexto={(t) => (setHasta(t), aplicar(desde(), t))} />
      </div>
      <button type="button" class="boton" disabled={!props.rango} onClick={() => props.onRango(undefined)}>
        Automático
      </button>
    </>
  )
}
