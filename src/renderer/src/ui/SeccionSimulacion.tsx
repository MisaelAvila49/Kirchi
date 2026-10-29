import type { AjustesSimulacion } from '../../../compartido/ajustes'
import { FilaConfig, GrupoConfig, Interruptor, Segmentado } from './ControlesConfig'

/** Los pasos de «Velocidad de las flechas». */
export const PASOS_FLECHAS = [0.25, 0.5, 1, 2, 4] as const

interface Props {
  simulacion: AjustesSimulacion
  onCambiar(parche: Partial<AjustesSimulacion>): void
}

/** Configuración › Simulación: flechas de corriente, sonido con volumen y piezas que se queman. */
export default function SeccionSimulacion(props: Props) {
  const s = () => props.simulacion
  return (
    <>
      <GrupoConfig titulo="Animación y sonido">
        <FilaConfig
          id="cfg-flechas"
          nombre="Velocidad de las flechas"
          pista={{ id: 'pista-flechas', texto: 'Multiplica la velocidad de las flechas de la corriente. Si el sistema pide reducir el movimiento, las animaciones empiezan en pausa.' }}
          apila
        >
          <Segmentado
            nombre="velocidad-flechas"
            etiqueta="cfg-flechas"
            describedby="pista-flechas"
            opciones={PASOS_FLECHAS.map((f) => ({ valor: f, texto: `×${f}`, cifra: true }))}
            valor={s().velocidadFlechas}
            onCambiar={(f) => props.onCambiar({ velocidadFlechas: f })}
          />
        </FilaConfig>
        <FilaConfig id="cfg-sonido" nombre="Sonido">
          <Interruptor etiqueta="cfg-sonido" activo={s().sonido} onCambiar={(v) => props.onCambiar({ sonido: v })} />
        </FilaConfig>
        <FilaConfig id="cfg-volumen" nombre="Volumen">
          <span class="cfg-rango">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={s().volumen}
              aria-labelledby="cfg-volumen"
              aria-valuetext={`${s().volumen} %`}
              disabled={!s().sonido}
              onInput={(e) => props.onCambiar({ volumen: Number(e.currentTarget.value) })}
            />
            <output class="cifra">{s().volumen} %</output>
          </span>
        </FilaConfig>
      </GrupoConfig>
      <GrupoConfig titulo="Piezas">
        <FilaConfig
          id="cfg-quemar"
          nombre="Las piezas se queman"
          pista={{
            id: 'pista-quemar',
            texto:
              'Encendido, una pieza que pasa del doble de su potencia (resistencias y transistores), su corriente (LED) o su voltaje (electrolítico y motor) durante medio segundo queda abierta hasta hacer clic sobre ella. Con los máximos de la hoja de datos basta 1.25 veces. El fusible y el foco se funden siempre.'
          }}
        >
          <Interruptor etiqueta="cfg-quemar" describedby="pista-quemar" activo={s().quemar} onCambiar={(v) => props.onCambiar({ quemar: v })} />
        </FilaConfig>
      </GrupoConfig>
    </>
  )
}
