import { createMemo, createSignal, For, Show } from 'solid-js'
import { buscarCalculadoras, type HalladoCalculadora } from '../../calculadoras/buscar'
import type { IdCalculadora } from '../../calculadoras/catalogo'
import { filtrarPlantillas, type ItemPlantilla } from '../../plantillas/almacen'
import { atajoAria } from '../menus'
import { buscarComandos, entradasDeBusqueda, type EntradaBusqueda } from './busqueda'
import type { EstadoCinta, Teclas } from './estado'
import IconoCinta from './IconoCinta'

interface Props {
  estado: EstadoCinta
  tecla: Teclas
  /** Todas las teclas vigentes de un comando del registro: también se busca por ellas. */
  teclas(id: string): readonly string[]
  /** Nombre de un comando del registro de atajos (también se busca por él). */
  nombreDe(id: string): string | undefined
  /** Ejecuta lo elegido; `ancla` es el campo (un menú se abre debajo de él). */
  onEjecutar(e: EntradaBusqueda, ancla: HTMLElement): void
  /** Las plantillas que también se encuentran aquí (solo con palabras de 3 letras o más) y qué hacer al elegir una. */
  plantillas?: readonly ItemPlantilla[]
  onPlantilla?(item: ItemPlantilla): void
  /** Las calculadoras también se encuentran aquí (con palabras de 3 letras o más): abre su panel, con la elegida o con `null`. */
  onCalculadora?(id: IdCalculadora | null): void
  /** Devuelve el foco al lienzo. */
  onSalir(): void
  ref?(el: HTMLInputElement): void
}

const ID_LISTA = 'comandos-hallados'
const MAX_PLANTILLAS = 4

/** Un renglón de plantilla en la lista de comandos: con los mismos campos que se pintan de uno. */
interface HalladoPlantilla {
  plantilla: ItemPlantilla
  texto: string
  icono: EntradaBusqueda['icono']
  donde: string
  tecla?: undefined
  razon: null
}
/** Un renglón de calculadora: abre el panel Calculadoras. */
interface HalladoCalc {
  calculadora: HalladoCalculadora
  texto: string
  icono: EntradaBusqueda['icono']
  donde: string
  tecla?: undefined
  razon: null
}
type Hallado = EntradaBusqueda | HalladoPlantilla | HalladoCalc

/** Buscar un comando (Ctrl+K): combobox con su lista, entre los botones de la cinta. */
export default function BuscarComando(props: Props) {
  const [q, setQ] = createSignal('')
  const [activo, setActivo] = createSignal(0)
  const [abierta, setAbierta] = createSignal(false)
  let campo!: HTMLInputElement
  const entradas = createMemo(() => entradasDeBusqueda(props.estado, props.tecla, props.nombreDe, props.teclas))
  const hallados = createMemo<Hallado[]>(() => {
    const comandos = buscarComandos(q(), entradas())
    const consulta = q().trim()
    if (!consulta || consulta.split(/\s+/).some((w) => w.length < 3)) return comandos
    const plantillas =
      props.plantillas && props.onPlantilla
        ? filtrarPlantillas(props.plantillas, consulta)
            .slice(0, MAX_PLANTILLAS)
            .map((plantilla): HalladoPlantilla => ({ plantilla, texto: `Colocar ${plantilla.nombre}`, icono: 'pieza', donde: 'Plantilla', razon: null }))
        : []
    const calculadoras = props.onCalculadora ? buscarCalculadoras(consulta).map((calculadora): HalladoCalc => ({ calculadora, texto: calculadora.texto, icono: 'mediciones', donde: 'Panel', razon: null })) : []
    return [...comandos, ...plantillas, ...calculadoras]
  })
  const visible = () => abierta() && hallados().length > 0
  const sinResultados = () => abierta() && q().trim() !== '' && hallados().length === 0
  const cerrar = () => {
    setQ('')
    setActivo(0)
    setAbierta(false)
  }
  const correr = (h: Hallado) => {
    cerrar()
    props.onSalir()
    if ('plantilla' in h) props.onPlantilla?.(h.plantilla)
    else if ('calculadora' in h) props.onCalculadora?.(h.calculadora.id)
    else props.onEjecutar(h, campo)
  }
  const tecla = (e: KeyboardEvent) => {
    const n = hallados().length
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault()
      if (!abierta()) setAbierta(true)
      else setActivo((a) => (a + 1) % n)
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault()
      setActivo((a) => (a - 1 + n) % n)
    } else if (e.key === 'Enter' && visible()) {
      e.preventDefault()
      correr(hallados()[Math.min(activo(), n - 1)])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (q()) cerrar()
      else props.onSalir()
    }
  }
  const atajo = () => props.tecla('buscar-comando')
  return (
    <div class="buscar-comando">
      <IconoCinta nombre="buscar" />
      <input
        ref={(el) => {
          campo = el
          props.ref?.(el)
        }}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible()}
        aria-controls={ID_LISTA}
        aria-activedescendant={visible() ? `${ID_LISTA}-${Math.min(activo(), hallados().length - 1)}` : undefined}
        aria-label="Buscar un comando"
        aria-keyshortcuts={atajoAria(atajo())}
        placeholder="Buscar un comando"
        autocomplete="off"
        spellcheck={false}
        value={q()}
        onInput={(e) => {
          setQ(e.currentTarget.value)
          setActivo(0)
          setAbierta(true)
        }}
        onKeyDown={tecla}
        onBlur={() => setAbierta(false)}
      />
      <Show when={atajo()}>{(t) => <kbd aria-hidden="true">{t()}</kbd>}</Show>
      <ul id={ID_LISTA} role="listbox" aria-label="Comandos" class="comandos-hallados" hidden={!visible()}>
        <For each={hallados()}>
          {(h, i) => (
            <li
              id={`${ID_LISTA}-${i()}`}
              role="option"
              aria-selected={i() === activo()}
              aria-disabled={h.razon ? 'true' : undefined}
              onPointerDown={(e) => {
                e.preventDefault()
                correr(h)
              }}
              onPointerMove={() => setActivo(i())}
            >
              <IconoCinta nombre={h.icono} />
              <span class="cmd-nombre">{h.texto}</span>
              <span class="cmd-donde">{h.donde}</span>
              <Show when={h.tecla}>{(t) => <kbd>{t()}</kbd>}</Show>
            </li>
          )}
        </For>
      </ul>
      {/* Siempre montada (una región viva que aparece no se anuncia): sin resultados dice «Sin comandos» y se ve debajo. */}
      <p role="status" class="comandos-vacio" classList={{ visible: sinResultados() }}>
        {sinResultados() ? 'Sin comandos' : ''}
      </p>
    </div>
  )
}
