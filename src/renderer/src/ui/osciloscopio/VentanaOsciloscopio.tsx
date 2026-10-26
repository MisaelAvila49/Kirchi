import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import type { AspectoGrafica, AspectoTraza } from '../../../../compartido/grafica/aspecto'
import { fusionarDatosOsc, type ApiOsciloscopio, type DatosOsc } from '../../../../compartido/ventanaOsc'
import type { AjustesOsciloscopio } from '../../instrumentos/ajustes'
import type { FaseSim } from '../../sim/control'
import type { PantallaSab } from '../../sim/protocoloInstrumentos'
import type { CursoresPantalla } from './dibujar'
import MandosOsciloscopio from './MandosOsciloscopio'
import PanelOsciloscopio from './PanelOsciloscopio'
import { cursoresAOsc, cursoresDeOsc, pantallaDeOsc } from './traspasoOsc'

interface Props {
  api: ApiOsciloscopio | undefined
}

/**
 * Página de la ventana del osciloscopio. No hay circuito: cada orden viaja al editor, que cambia el documento. Los cursores se mueven aquí para que el arrastre no espere la vuelta.
 */
export default function VentanaOsciloscopio(props: Props) {
  const [datos, setDatos] = createSignal<DatosOsc | null>(null)
  const [cursores, setCursores] = createSignal<CursoresPantalla | null>(null)
  const [aviso, setAviso] = createSignal<string | null>(null)
  // Cada pantalla nueva sube la versión: el panel la sondea con `version(id)` como si viniera de la memoria compartida.
  const [version, setVersion] = createSignal(0)
  let primera = true
  const poner = (d: DatosOsc) => {
    if (d.pantalla !== undefined) setVersion((v) => v + 1)
    setDatos((antes) => fusionarDatosOsc(antes, d))
    document.documentElement.dataset.tema = d.tema
    if (primera) {
      primera = false
      setCursores(cursoresDeOsc(d.cursores))
    }
  }
  onMount(() => {
    void props.api?.pedir().then((d) => (d ? poner(d) : setAviso('No hay osciloscopio que mostrar: ábrelo de nuevo desde la ventana principal.')))
    const quitar = props.api?.alDatos(poner)
    onCleanup(() => quitar?.())
  })
  const mandar = (c: Parameters<ApiOsciloscopio['comando']>[0]) => props.api?.comando(c)
  const ajustes = () => datos()?.ajustes as unknown as AjustesOsciloscopio | null
  const congelada = () => {
    const c = datos()?.congelada
    return c ? { pantalla: pantallaDeOsc(c.pantalla), ajustes: c.ajustes as unknown as AjustesOsciloscopio } : null
  }
  return (
    <main class="ventana-osc">
      <h1 class="solo-lectores">Osciloscopio</h1>
      <Show when={datos()} fallback={<p class="secundario" role="status">{aviso() ?? 'Cargando el osciloscopio…'}</p>}>
        {(d) => (
          <PanelOsciloscopio
            osciloscopios={d().osciloscopios}
            elegido={d().elegido}
            onElegir={(id) => {
              setCursores(null)
              mandar({ tipo: 'elegir', id })
            }}
            ajustes={ajustes()}
            aspecto={(d().aspecto ?? undefined) as AspectoGrafica | undefined}
            aspectoCanales={d().aspectoCanales as Record<string, AspectoTraza>}
            tema={d().tema}
            fase={d().fase as FaseSim}
            teclaSimular={d().teclaSimular ?? undefined}
            leer={() => ({ multimetros: new Map(), pantalla: (d().pantalla ? pantallaDeOsc(d().pantalla!) : undefined) as PantallaSab | undefined, capturada: d().capturada })}
            version={() => version()}
            onColumnas={(id, n) => mandar({ tipo: 'columnas', id, n })}
            cursores={cursores()}
            onCursores={(c) => {
              setCursores(c)
              mandar({ tipo: 'cursores', cursores: cursoresAOsc(c) })
            }}
            aviso={d().aviso}
            notaAjuste={d().notaAjuste}
            onAjuste={(prop, texto, gesto) => mandar({ tipo: 'ajuste', prop, texto, ...(gesto ? { gesto } : {}) })}
            onAuto={() => mandar({ tipo: 'auto' })}
            congelada={congelada()}
            onForzar={() => mandar({ tipo: 'forzar' })}
            onPausar={() => mandar({ tipo: 'pausar' })}
            onReanudar={() => mandar({ tipo: 'reanudar' })}
            onExportar={() => {
              mandar({ tipo: 'exportar' })
              setAviso('El diálogo de exportar se abrió en la ventana principal.')
            }}
            onEscala={(eje, dir) => mandar({ tipo: 'escala', eje, dir })}
            onPosicion={(canal, pos, gesto) => mandar({ tipo: 'posicion', canal, pos, gesto })}
            onVentana={() => props.api?.acoplar()}
            enVentana
            mandos={() => (
              <Show when={ajustes()}>
                {(a) => <MandosOsciloscopio ajustes={a} fuentes={() => d().fuentes} estadoDisparo={() => d().estadoDisparo} onAjuste={(p, t, g) => mandar({ tipo: 'ajuste', prop: p, texto: t, ...(g ? { gesto: g } : {}) })} onRearmar={() => mandar({ tipo: 'rearmar' })} />}
              </Show>
            )}
          />
        )}
      </Show>
      <Show when={aviso() && datos()}>
        <p class="deriv" role="status">
          {aviso()}
        </p>
      </Show>
    </main>
  )
}
