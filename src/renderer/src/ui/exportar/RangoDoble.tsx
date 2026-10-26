import { createEffect, createSignal, untrack } from 'solid-js'
import { formatearSI } from '../../valores/valores'
import CampoValor from '../CampoValor'
import type { EjeDeFigura } from '../osciloscopio/figura'
import type { Dominio } from '../grafica/vista'
import { aFraccion, extremoMovido, rangoEfectivo, textoDeExtremo, tramoDeCampo, type RangoExportar } from './rango'

interface Props {
  eje: EjeDeFigura
  /** El tramo que se exporta ahora (el eje completo, o lo que muestra la gráfica, si no hay recorte). */
  vista: Dominio
  /** Hay un recorte puesto. */
  recortado: boolean
  onCambiar(r: RangoExportar | null): void
  /** Versión de la franja del editor de exportar: una sola fila y el aviso de error solo para lectores de pantalla. */
  compacto?: boolean
  /** Decimales de los valores, los del eje: un número de 0 a 4 o «auto» (los necesarios). */
  decimales?: number | 'auto'
}

/** Pasos del deslizador: milésimas del eje (en su escala). */
const PASOS = 1000

/**
 * Tramo que se exporta: deslizador de dos asas nativas (ratón, toque y teclado) y campos «Desde» y «Hasta» con unidad. Los campos cuentan desde `origen` y aplican al salir o con Enter.
 */
export default function RangoDoble(props: Props) {
  const origen = () => props.eje.origen ?? 0
  const escala = () => props.eje.mapa.escala
  const texto = (v: number) => formatearSI(v - origen(), props.eje.unidad)
  const campo = (v: number) => textoDeExtremo(v - origen(), props.eje.unidad, props.decimales)
  // Arrancan con los extremos de la vista: el efecto de abajo corre después de armar los campos y estos ya habrían tomado el texto vacío.
  const [desde, setDesde] = createSignal(untrack(() => campo(props.vista.min)))
  const [hasta, setHasta] = createSignal(untrack(() => campo(props.vista.max)))
  const [error, setError] = createSignal('')
  // Los campos siguen a lo que se ve: mover una asa o «Todo el eje» los reescriben.
  createEffect(() => {
    setDesde(campo(props.vista.min))
    setHasta(campo(props.vista.max))
    setError('')
  })
  const fa = () => aFraccion(props.vista.min, props.eje.total, escala())
  const fb = () => aFraccion(props.vista.max, props.eje.total, escala())
  const mover = (cual: 0 | 1, valor: string) => {
    const r = extremoMovido(props.eje.total, escala(), props.vista, cual, Number(valor) / PASOS)
    props.onCambiar(rangoEfectivo(r, props.eje.total) ? r : null)
  }
  /** Aplica un campo: acota a lo capturado y a que «Desde» quede antes de «Hasta». Lo que no se lee se queda marcado hasta Esc. */
  const aplicar = (cual: 0 | 1) => {
    const t = tramoDeCampo(cual === 0 ? desde() : hasta(), cual, props.eje.unidad, origen(), props.eje.total, escala(), props.vista)
    if ('error' in t) return setError(t.error)
    setError('')
    const efectivo = rangoEfectivo(t.rango, props.eje.total)
    const dom = efectivo ?? props.eje.total
    setDesde(campo(dom.min))
    setHasta(campo(dom.max))
    props.onCambiar(efectivo ? t.rango : null)
  }
  const revertir = () => {
    setDesde(campo(props.vista.min))
    setHasta(campo(props.vista.max))
    setError('')
  }
  const tecla = (cual: 0 | 1) => (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      aplicar(cual)
    } else if (e.key === 'Escape' && (error() || (cual === 0 ? desde() : hasta()) !== campo(cual === 0 ? props.vista.min : props.vista.max))) {
      e.preventDefault()
      e.stopPropagation()
      revertir()
    }
  }
  const alSalir = (cual: 0 | 1) => () => {
    if (error()) return revertir()
    if ((cual === 0 ? desde() : hasta()) !== campo(cual === 0 ? props.vista.min : props.vista.max)) aplicar(cual)
  }
  const par = (cual: 0 | 1) => (
    <div class="campo-rango" role="group" aria-label={cual === 0 ? 'Inicio del tramo, valor' : 'Final del tramo, valor'}>
      <span aria-hidden="true">{cual === 0 ? 'Desde' : 'Hasta'}</span>
      <CampoValor
        texto={cual === 0 ? desde() : hasta()}
        unidad={props.eje.unidad}
        nombre={cual === 0 ? 'Desde' : 'Hasta'}
        onTexto={(t) => (cual === 0 ? setDesde(t) : setHasta(t))}
        onAplicar={alSalir(cual)}
        onTecla={tecla(cual)}
        invalido={!!error()}
        atributos={{ 'aria-label': cual === 0 ? 'Desde' : 'Hasta', 'aria-describedby': 'rango-error', class: 'campo-rango-num' }}
      />
    </div>
  )
  // El relleno entre las dos asas: las asas nativas se detienen medio pulgar antes de los bordes, y la banda lo respeta.
  const pos = (f: number) => `calc(var(--asa) / 2 + (100% - var(--asa)) * ${f})`
  return (
    <div class="rango-doble" classList={{ compacto: props.compacto }} role="group" aria-label="Tramo del eje que se exporta">
      <div class="rango-doble-pista">
        <div class="rango-doble-riel" aria-hidden="true" />
        <div class="rango-doble-banda" aria-hidden="true" style={{ left: pos(fa()), right: `calc(100% - ${pos(fb())})` }} />
        <input
          type="range"
          class="rango-doble-asa"
          min="0"
          max={PASOS}
          step="1"
          value={Math.round(fa() * PASOS)}
          aria-label="Inicio del tramo"
          aria-valuetext={texto(props.vista.min)}
          onInput={(e) => mover(0, e.currentTarget.value)}
        />
        <input
          type="range"
          class="rango-doble-asa"
          min="0"
          max={PASOS}
          step="1"
          value={Math.round(fb() * PASOS)}
          aria-label="Final del tramo"
          aria-valuetext={texto(props.vista.max)}
          onInput={(e) => mover(1, e.currentTarget.value)}
        />
      </div>
      <div class="rango-doble-campos">
        {par(0)}
        {par(1)}
        <button type="button" class="boton rango-doble-todo" disabled={!props.recortado} onClick={() => props.onCambiar(null)}>
          {props.compacto ? 'Restablecer' : 'Restablecer tramo'}
        </button>
      </div>
      <p id="rango-error" class="campo-rango-error nota-dialogo" classList={{ 'solo-lectores': props.compacto }} role="alert">
        {error()}
      </p>
    </div>
  )
}
