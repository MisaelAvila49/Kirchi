import { createMemo } from 'solid-js'
import { ASPECTO_OSCILOSCOPIO, escribirAspecto, type AspectoGrafica, type AspectoTraza } from '../../../../compartido/grafica/aspecto'
import type { AjustesOsciloscopio } from '../../instrumentos/ajustes'
import type { TrazaVista } from '../grafica/AspectoPanel'
import HojaAspecto from '../grafica/HojaAspecto'
import { TONO_CANAL } from '../colores'

interface Props {
  ajustes: AjustesOsciloscopio
  aspecto?: AspectoGrafica
  aspectoCanales?: Readonly<Record<string, AspectoTraza>>
  /** Guarda la propiedad `aspecto` del osciloscopio (texto). */
  onAjuste(prop: string, texto: string): void
  /** Se cierra; `volverFoco` devuelve el foco al botón «Aspecto» (Esc o el botón ×). */
  onCerrar(volverFoco: boolean): void
}

/**
 * «Aspecto» del osciloscopio: las mismas opciones que la ventana de gráficas, en una hoja de unos 400 px. Se guarda en la propiedad `aspecto`.
 */
export default function AspectoOsc(props: Props) {
  const asp = () => props.aspecto ?? ASPECTO_OSCILOSCOPIO
  const canales = () => props.aspectoCanales ?? {}
  const guardar = (a: AspectoGrafica, c: Readonly<Record<string, AspectoTraza>>) => props.onAjuste('aspecto', escribirAspecto(a, c, ASPECTO_OSCILOSCOPIO) || 'normal')
  const trazas = createMemo((): TrazaVista[] =>
    props.ajustes.canales
      .filter((c) => c.on)
      .map((c) => {
        const e = canales()[c.canal]
        return { clave: c.canal, etiqueta: `Canal ${c.canal}`, tono: e?.color ?? TONO_CANAL[c.canal], lado: e?.lado ?? 'izquierda', tonoElegido: e?.color ?? null, grosor: e?.grosor ?? null, prefijo: e?.prefijo ?? null, decimales: e?.decimales, unidad: 'V' }
      })
  )
  return (
    <HojaAspecto
      titulo="Aspecto de la pantalla"
      id="osc-aspecto"
      aspecto={asp()}
      onAspecto={(p) => guardar({ ...asp(), ...p }, canales())}
      trazas={trazas()}
      onTraza={(canal, p) => guardar(asp(), { ...canales(), [canal]: { ...(canales()[canal] ?? { lado: 'izquierda' as const, color: null }), ...p } })}
      modo="lineas"
      ejeX={{ etiqueta: 'Eje del tiempo', unidad: 's' }}
      onRestablecer={() => guardar(ASPECTO_OSCILOSCOPIO, {})}
      onCerrar={props.onCerrar}
    />
  )
}
