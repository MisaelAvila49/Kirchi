import { createEffect, createSignal, For, Index, Match, on, Show, Switch, type JSX } from 'solid-js'
import type { EstiloFigura } from '../doc/figuras'
import type { Id, Rotacion } from '../doc/tipos'
import type { Orientacion, Transformacion } from '../editor/acciones'
import type { PiezaDef } from '../piezas/tipos'
import { MOTIVO_REFERENCIA_SIMULANDO, type CambioTexto } from '../editor/Editor'
import CajaReferencia from './CajaReferencia'
import CampoValor from './CampoValor'
import { opcionesDeUnidad } from '../valores/unidades'
import FichaCatalogo from './FichaCatalogo'
import FichaComunes from './FichaComunes'
import FichaPersonalizado from './FichaPersonalizado'
import FichaSerie from './FichaSerie'
import TablaDeModelos from './TablaModelos'
import ControlesFormato from './ControlesFormato'
import FichaMedidor from './FichaMedidor'
import { textosInspectorDeSonda } from './textosSonda'
import FichaTexto from './FichaTexto'
import SimboloPieza from './SimboloPieza'
import ControlPosicion, { type PotVista } from './ControlPosicion'
import SeccionFigura from './SeccionFigura'
import IconoCinta from './cinta/IconoCinta'
import type { NombreIcono } from './cinta/trazos'
import { IconoPlegarDerecha } from './iconos'
import type { OrdenFormato, VistaFormato } from './vistaFormato'
import { atajoAria } from './atajoAria'
import { nombreLargo } from './cinta/comandos'
import OpcionConMuestra, { BotonDeLista } from './OpcionConMuestra'
import { plural, type Aviso } from './proyecto'
import { type AccionSim } from './vistaPrevia'
import { AVISOS_EN_INSPECTOR, FILA_PINES_CONECTADOS, TEXTO_SELECCIONAR_RED, repartirCampos, resumenSeleccion, TEXTO_ETIQUETAS_UNIDAS, type CampoProp, type VistaInspector } from './vistaInspector'

interface Props {
  vista: VistaInspector
  /** La definición de una pieza por su id (el símbolo de la cabecera); sin ella, la cabecera va sin símbolo. */
  defDe?(id: string): PiezaDef | undefined
  /** Devuelve el error para mostrarlo en el campo, o null si se aplicó. */
  onCambiarProp(id: Id, prop: string, texto: string): string | null
  /** La referencia (R1, C1, XFG1) arriba a la derecha; devuelve el motivo si no se aplicó (repetida, vacía), o null. */
  onCambiarReferencia?(id: Id, texto: string): string | null
  /** La ficha del generador: reemplaza la lista de propiedades de un generador. */
  fichaGenerador?(id: Id): JSX.Element
  /** La ficha de la fuente variable: sale de la pestaña Multímetro y vive aquí, como el generador. */
  fichaFuente?(id: Id): JSX.Element
  /** Los controles del multímetro: función, instrumento ideal y avisos; su lectura va en Mediciones. */
  fichaMultimetro?(id: Id): JSX.Element
  /** «Ver en Mediciones»: abre el panel Mediciones del riel derecho. */
  onVerMediciones?(): void
  onOrientar(o: Orientacion): void
  onTransformar(op: Transformacion): void
  onDuplicar(): void
  /** «Seleccionar su red» de un cable: no edita, así que también actúa al simular. */
  onSeleccionarRed?(cable: string): void
  onBorrar(): void
  onPlegar(): void
  /** Clic en un aviso sin selección: selecciona y centra sus piezas. */
  onAviso(a: Aviso): void
  /** «Ver los N avisos» o «Ver menos»: la lista entera de avisos aquí mismo, o solo las primeras. */
  onVerAvisos(): void
  /** La lista de avisos está entera («Ver menos» la recoge). */
  avisosAbiertos?: boolean
  /** Un control de la sección Texto (notas y etiquetas). */
  onFormato(o: OrdenFormato): void
  /** La ficha de una nota o etiqueta sola: vista previa del borrador en el lienzo y aplicarlo en un paso. */
  onPreviaTexto?(tipo: 'nota' | 'etiqueta', id: Id, c: CambioTexto | null): void
  onAplicarTexto?(tipo: 'nota' | 'etiqueta', id: Id, c: CambioTexto): string | null
  /** Estilo, ancho o alto y orden de las figuras seleccionadas (la sección Figura). */
  onFigura?(cambio: Partial<EstiloFigura>): void
  onMedidaFigura?(medida: 'ancho' | 'alto', texto: string): string | null
  onAlFondo?(): void
  /** «Ver las N en Proyecto»: abre el panel Proyecto en sus redes. */
  onVerRedes(): void
  /** Sondas: elegir una de la lista, invertir el sentido de la de corriente y seleccionar los cables de su red. */
  onElegirSonda?(id: Id): void
  onInvertirSentido?(id: Id): void
  onRedDeSonda?(id: Id): void
  /** El medidor rápido: cambiar lo que mide y pasarlo a un multímetro completo. */
  onCambiarMedidor?(id: Id, cambio: { magnitud?: 'voltaje' | 'corriente'; modo?: 'dc' | 'ac' }): string | null
  onConvertirMedidor?(id: Id): void
  /** Primera combinación del registro de atajos para un comando («Shift+R»); sin ella el botón no muestra atajo. */
  atajo?(id: string): string | undefined
  /** Un instrumento que lee de menos por cargar el circuito: la línea que lo dice. */
  carga?: string | null
  /** La vista previa está activa (corriendo o en pausa): el circuito no se edita y los controles de edición se deshabilitan. */
  simulando?: boolean
  /** El interruptor o botón seleccionado durante la vista previa, para accionarlo con el ratón o el teclado. */
  accion?: AccionSim | null
  onConmutar?(): void
  /** El potenciómetro seleccionado (con o sin vista previa) y el cambio de su posición; es lo único que se edita simulando. */
  pot?: PotVista | null
  onPot?(posicion: number, gesto?: string): void
  /** Un botón se sostiene mientras se mantiene pulsado: `true` al apretar y `false` al soltar, salir o perder el foco. */
  /** El botón seleccionado está presionado con «Mantener pulsado». */
  enclavado?: boolean
  onEnclavar?(): void
}

const GIROS: Rotacion[] = [0, 90, 180, 270]
const ICONO_FIGURA: Record<string, NombreIcono> = { linea: 'linea', rectangulo: 'rectangulo', elipse: 'elipse', flecha: 'flecha', varios: 'figura' }

/** Una propiedad: campo de texto con notación de ingeniería (Enter o salir aplica, Esc regresa) o lista cerrada. */
/** El modelo «Personalizado» de una pieza con modelo de SPICE: casilla y parámetros, siempre en «Más ajustes». */
function CampoPersonalizado(props: { campo: CampoProp; pieza: Id; onCambiar: Props['onCambiarProp']; desactivado?: boolean }) {
  const [texto, setTexto] = createSignal(props.campo.texto)
  const [error, setError] = createSignal<string | null>(null)
  let dueña = props.pieza
  // Si el juego cambia por fuera (deshacer, otra pieza seleccionada), el campo lo sigue.
  createEffect(
    on(
      () => [props.pieza, props.campo.texto] as const,
      ([pieza]) => {
        dueña = pieza
        setTexto(props.campo.texto)
        setError(null)
      },
      { defer: true }
    )
  )
  const aplicar = (t = texto()): boolean => {
    if (t === props.campo.texto) {
      setError(null)
      return true
    }
    const e = props.onCambiar(dueña, 'spice', t)
    setError(e)
    return e === null
  }
  return (
    <div class="fld fld-campo fld-catalogo">
      <span class="fld-rotulo">{props.campo.nombre}</span>
      <FichaPersonalizado
        id={`campo-${props.pieza}-spice`}
        texto={texto()}
        base={props.campo.personalizado?.base ?? ''}
        desactivado={props.desactivado}
        error={error()}
        onEscribir={setTexto}
        onAlternar={(activo) => {
          const t = activo ? (props.campo.personalizado?.base ?? '') : ''
          setTexto(t)
          aplicar(t)
        }}
        onSalir={() => aplicar()}
        onTecla={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            setTexto(props.campo.texto)
            setError(null)
          }
        }}
      />
    </div>
  )
}

function Campo(props: { campo: CampoProp; pieza: Id; onCambiar: Props['onCambiarProp']; desactivado?: boolean }) {
  const [texto, setTexto] = createSignal(props.campo.texto)
  const [error, setError] = createSignal<string | null>(null)
  // Pieza a la que pertenece lo escrito: lo que se teclea nunca se aplica a otra distinta.
  let dueña = props.pieza
  // Si el valor cambia por fuera (deshacer, otra pieza seleccionada), el campo lo sigue. Si la pieza
  // cambió con texto sin aplicar, ese texto se aplica a la pieza ANTERIOR antes de mostrar la nueva.
  createEffect(
    on(
      () => [props.pieza, props.campo.texto] as const,
      ([pieza]) => {
        if (pieza !== dueña) {
          if (texto() !== valorMostrado) props.onCambiar(dueña, props.campo.id, texto())
          dueña = pieza
        }
        valorMostrado = props.campo.texto
        setTexto(props.campo.texto)
        setError(null)
      },
      { defer: true }
    )
  )
  let valorMostrado = props.campo.texto
  const id = () => `campo-${props.pieza}-${props.campo.id}`
  const aplicar = (t = texto()): boolean => {
    if (t === props.campo.texto) {
      setError(null)
      return true
    }
    const e = props.onCambiar(dueña, props.campo.id, t)
    setError(e)
    return e === null
  }
  /** Un botón de la serie o del catálogo, o «Usar»: escribe el valor y lo aplica. */
  const usar = (t: string, volverAlCampo?: boolean) => {
    if (volverAlCampo) document.getElementById(id())?.focus()
    setTexto(t)
    aplicar(t)
  }
  /** El campo de texto del valor; en un catálogo vive dentro de «Más ajustes». */
  const entrada = () => (
    <CampoValor
      texto={texto()}
      unidad={props.campo.unidad ?? ''}
      nombre={props.campo.nombre}
      desactivado={props.desactivado}
      soloLectura={props.campo.soloLectura}
      invalido={!!error()}
      atributos={{ id: id(), 'aria-label': props.campo.catalogo ? props.campo.nombre : undefined, 'aria-describedby': `${id()}-ayuda` }}
      onTexto={setTexto}
      onAplicar={() => aplicar()}
      onTecla={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          aplicar()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setTexto(props.campo.texto)
          setError(null)
        }
      }}
    />
  )
  return (
    <div class="fld fld-campo" classList={{ 'fld-tabla': !!props.campo.tabla, 'fld-catalogo': !!props.campo.catalogo }}>
      <Show when={props.campo.catalogo || props.campo.tabla} fallback={<label for={id()}>{props.campo.nombre}</label>}>
        {/* Como el renglón de una resistencia: el rótulo a la izquierda y lo elegido a la derecha; la lista va debajo. */}
        <div class="fld-cabeza">
          <span class="fld-rotulo" id={`${id()}-rotulo`}>
            {props.campo.nombre}
          </span>
          <span class="entrada-valor entrada-solo cifra">{props.campo.lectura ?? props.campo.texto}</span>
        </div>
      </Show>
      <Show
        when={props.campo.tabla}
        fallback={
      <Show
        when={props.campo.opciones}
        fallback={
          <Show
            when={props.campo.catalogo && props.campo.comunes}
            fallback={
              <>
                {entrada()}
                {/* Una pieza con valores comunes y sin serie (la fuente, la batería, el fusible): la lista plegable de siempre. */}
                <Show when={!props.campo.serie && props.campo.comunes}>
                  {(comunes) => <FichaComunes texto={texto()} unidad={props.campo.unidad ?? ''} comunes={comunes()} onUsar={usar} desactivado={props.desactivado} />}
                </Show>
              </>
            }
          >
            {(comunes) => (
              <FichaCatalogo texto={texto()} unidad={props.campo.unidad ?? ''} comunes={comunes()} onUsar={usar} desactivado={props.desactivado}>
                {entrada()}
              </FichaCatalogo>
            )}
          </Show>
        }
      >
        {(opciones) => (
          <div class="campo-lista">
            <select
              id={id()}
              class="campo"
              classList={{ 'con-muestras': !!props.campo.muestras }}
              value={props.campo.texto}
              disabled={props.desactivado}
              aria-describedby={`${id()}-ayuda`}
              onChange={(e) => {
                // Una opción rechazada deja la lista en el valor del documento.
                if (!aplicar(e.currentTarget.value)) e.currentTarget.value = props.campo.texto
              }}
            >
              {/* El color de un LED o un display va dentro de su opción, a la izquierda. */}
              <Show when={props.campo.muestras}>
                <BotonDeLista />
              </Show>
              <For each={opciones().includes(props.campo.texto) ? opciones() : [props.campo.texto, ...opciones()]}>
                {(o) => <OpcionConMuestra valor={o} muestra={props.campo.muestras?.[o]} seleccionada={o === props.campo.texto} />}
              </For>
            </select>
          </div>
        )}
      </Show>
        }
      >
        {(tabla) => <TablaDeModelos tabla={tabla()} valor={props.campo.texto} nombre={props.campo.nombre} desactivado={props.desactivado} onElegir={(m) => aplicar(m)} />}
      </Show>
      <Show when={props.campo.serie}>{(s) => <FichaSerie texto={texto()} unidad={props.campo.unidad ?? ''} serie={s()} onUsar={usar} desactivado={props.desactivado} />}</Show>
      <p id={`${id()}-ayuda`} class={error() ? 'campo-error' : 'campo-ayuda'} aria-live="polite">
        {error() ?? [!props.campo.catalogo && !props.campo.tabla && !opcionesDeUnidad(props.campo.unidad ?? '') && props.campo.lectura && props.campo.lectura !== props.campo.texto ? `= ${props.campo.lectura}` : '', props.campo.ayuda ?? ''].filter(Boolean).join(' · ')}
      </p>
    </div>
  )
}

/** Sección «Texto»: los controles de formato de la barra flotante, con el tamaño como campo con validación. */
const SeccionTexto = (props: { vista: VistaFormato; clave: string; onFormato: Props['onFormato']; teclas: Props['atajo'] }) => (
  <>
    <h3 class="sec">Texto</h3>
    <ControlesFormato vista={props.vista} variante="inspector" onOrden={props.onFormato} teclas={props.teclas} clave={props.clave} />
  </>
)

/** Una fila del inspector: un nombre y su cifra (las lecturas de la vista previa van en Mediciones). */
const Fila = (props: { nombre: string; valor: string }) => (
  <div class="fld">
    <span class="secundario">{props.nombre}</span>
    <b class="cifra">{props.valor}</b>
  </div>
)

/** Inspector contextual de 300 px; plegable desde su encabezado. */
export default function Inspector(props: Props) {
  let encabezado: HTMLHeadingElement | undefined
  const [masAbierto, setMasAbierto] = createSignal(false)
  /** La pieza seleccionada, o null con cualquier otra selección. */
  const pieza = () => (props.vista.tipo === 'pieza' ? props.vista : null)
  const figura = () => (props.vista.tipo === 'figura' ? props.vista : null)
  /** Los campos de la pieza seleccionada, sin la posición de un potenciómetro (tiene su control). */
  const campos = (): CampoProp[] => (props.vista.tipo === 'pieza' ? props.vista.props.filter((c) => !(props.pot && c.id === 'posicion')) : [])
  const partes = () => repartirCampos(campos(), (c) => !!c.personalizado)
  const titulo = () => {
    const v = props.vista
    if (v.tipo === 'nada') return 'Sin selección'
    if (v.tipo === 'pieza') return v.nombre
    if (v.tipo === 'desconocida') return v.ref || 'Pieza'
    if (v.tipo === 'varias') return `${v.total} elementos`
    if (v.tipo === 'cable') return 'Cable'
    if (v.tipo === 'etiqueta') return `Etiqueta ${v.nombre}`
    if (v.tipo === 'figura') return v.titulo
    if (v.tipo === 'sonda') return v.titulo
    return 'Nota'
  }
  // El atajo sale del registro: si el usuario lo cambia, el botón lo sigue. El nombre accesible es el del aria-label;
  // el `title` es la ayuda visible (como en la barra superior) y el atajo se anuncia aparte con `aria-keyshortcuts`.
  const conAtajo = (id: string, nombre: string) => {
    const t = props.atajo?.(id)
    return { 'aria-label': nombre, title: t ? `${nombre} (${t})` : nombre, 'aria-keyshortcuts': t ? atajoAria(t) : undefined }
  }
  // alFondo: null sin el botón; false, deshabilitado con su razón (ya están detrás de las demás figuras).
  const acciones = (girar: boolean, reflejar = girar, alFondo: boolean | null = null) => (
    <div class="acciones">
      <Show when={girar}>
        <button type="button" class="boton" {...conAtajo('girar-izq', nombreLargo('girar-izq'))} onClick={() => props.onTransformar('girarIzq')}>
          ↺ 90°
        </button>
        <button type="button" class="boton" {...conAtajo('girar', nombreLargo('girar'))} onClick={() => props.onTransformar('girar')}>
          ↻ 90°
        </button>
      </Show>
      <Show when={reflejar}>
        <button type="button" class="boton" {...conAtajo('espejo-x', nombreLargo('espejo-x'))} onClick={() => props.onTransformar('espejoX')}>
          {nombreLargo('espejo-x')}
        </button>
        <button type="button" class="boton" {...conAtajo('espejo-y', nombreLargo('espejo-y'))} onClick={() => props.onTransformar('espejoY')}>
          {nombreLargo('espejo-y')}
        </button>
      </Show>
      <button type="button" class="boton" onClick={() => props.onDuplicar()}>
        Duplicar
      </button>
      <Show when={alFondo !== null}>
        <button
          type="button"
          class="boton"
          aria-disabled={alFondo ? undefined : 'true'}
          aria-describedby={alFondo ? undefined : 'razon-al-fondo'}
          title={alFondo ? undefined : 'Ya está detrás de las demás figuras.'}
          onClick={() => alFondo && props.onAlFondo?.()}
        >
          Al fondo
        </button>
        <Show when={!alFondo}>
          <span id="razon-al-fondo" class="solo-lectores">
            Ya está detrás de las demás figuras.
          </span>
        </Show>
      </Show>
      <button
        type="button"
        class="boton peligro"
        onClick={() => {
          props.onBorrar()
          // El botón desaparece con lo borrado: el foco pasa al encabezado del inspector y no cae al cuerpo.
          queueMicrotask(() => {
            if (!document.activeElement || document.activeElement === document.body) encabezado?.focus()
          })
        }}
      >
        Borrar
      </button>
    </div>
  )
  return (
    <aside id="panel-derecho" class="inspector" aria-label="Inspector" data-tono={pieza()?.tono ?? (figura() ? 'oliva' : undefined)}>
      <header class="panel-cabeza" classList={{ 'de-pieza': !!pieza() || !!figura() }}>
        <Show when={pieza() && props.defDe?.(pieza()!.defId)}>
          {(def) => (
            <span class="ficha-pieza" aria-hidden="true">
              <SimboloPieza def={def()} />
            </span>
          )}
        </Show>
        <Show when={figura()}>
          {(f) => (
            <span class="ficha-pieza ficha-figura" aria-hidden="true">
              <IconoCinta nombre={ICONO_FIGURA[f().figura.tipo]} uso="grande" />
            </span>
          )}
        </Show>
        <div class="titulo-pieza">
          <h2 ref={encabezado} tabindex="-1">
            {titulo()}
          </h2>
          <Show when={pieza()}>
            {(v) => (
              <span class="categoria-pieza">
                <span class="muestra" aria-hidden="true" />
                {v().categoria}
              </span>
            )}
          </Show>
          <Show when={figura()}>
            <span class="categoria-pieza">
              <span class="muestra" aria-hidden="true" />
              Figura de dibujo
            </span>
          </Show>
        </div>
        <Show when={pieza() && props.onCambiarReferencia}>
          <CajaReferencia
            pieza={pieza()!.id}
            valor={pieza()!.ref}
            onCambiar={(id, t) => props.onCambiarReferencia!(id, t)}
            desactivado={props.simulando}
            motivoFija={props.simulando ? MOTIVO_REFERENCIA_SIMULANDO : undefined}
          />
        </Show>
        <button type="button" class="boton-icono" aria-label="Plegar el inspector" onClick={() => props.onPlegar()}>
          <IconoPlegarDerecha />
        </button>
      </header>
      {/* Simulando se enfoca con Tab para desplazarlo con el teclado: las lecturas de un transistor lo alargan y sus
          campos están bloqueados, así que adentro puede no haber nada enfocable (WCAG 2.1.1). */}
      <div class="panel-cuerpo" tabindex={props.simulando ? 0 : undefined} role={props.simulando ? 'region' : undefined} aria-label={props.simulando ? `Inspector de ${titulo()}` : undefined}>
        {/* El inspector no da lecturas en vivo de piezas ni de cables; una línea lleva a Mediciones. */}
        <Show when={props.simulando && (props.vista.tipo === 'pieza' || props.vista.tipo === 'cable') && props.onVerMediciones}>
          <p class="secundario sub ver-mediciones">
            Las lecturas están en Mediciones.{' '}
            <button type="button" class="enlace" onClick={() => props.onVerMediciones?.()}>
              Ver en Mediciones
            </button>
          </p>
        </Show>
        <Show when={props.carga && !(props.vista.tipo === 'pieza' && props.vista.defId === 'multimetro')}>
          <p class="secundario sub">{props.carga}</p>
        </Show>
        <Show when={props.accion}>
          <section class="acciones-sim" aria-label="Accionar">
            <Show when={props.accion}>
              {(a) => (
                <div class="acciones">
                  <Show
                    when={a().tipo === 'sostener'}
                    fallback={
                      <button type="button" class="boton" onClick={() => props.onConmutar?.()}>
                        {a().tipo === 'reponer' ? 'Reponer el fusible' : 'Conmutar'}
                      </button>
                    }
                  >
                    {/* Un botón se deja presionado hasta volver a pulsar aquí; en el lienzo se sostiene
                        mientras se aprieta, con el ratón o con Enter y Espacio. */}
                    <button type="button" class="boton" aria-pressed={props.enclavado ? 'true' : 'false'} onClick={() => props.onEnclavar?.()}>
                      Mantener pulsado
                    </button>
                  </Show>
                </div>
              )}
            </Show>
          </section>
        </Show>
        <Show when={props.pot}>{(p) => <ControlPosicion lados pot={p()} onCambiar={(v, g) => props.onPot?.(v, g)} />}</Show>
        {/* Simulando, de una pieza se editan los valores de fuentes y resistencias (cada campo decide); lo demás no. */}
        <fieldset class="inspector-campos" disabled={props.simulando && props.vista.tipo !== 'pieza' && props.vista.tipo !== 'cable'}>
        <Switch>
          <Match when={props.vista.tipo === 'nada' && props.vista}>
            {(v) => (
              <>
                {/* Región viva montada durante toda la vista sin selección (vacía con el circuito vacío): el cambio de
                    estado se anuncia, y solo cambia al cambiar el circuito, no con cada tecla. */}
                <div class="estado-sim" classList={{ mal: !props.simulando && v().estado === 'avisos', vacio: v().estado === 'vacio', listo: !props.simulando && v().estado === 'listo' }} role="status">
                  {/* La palomita no tiene texto: lo que se anuncia sigue siendo la frase. */}
                  <Show when={!props.simulando && v().estado === 'listo'}>
                    <span class="listo-icono" aria-hidden="true">
                      <svg viewBox="0 0 16 16">
                        <path d="M3.5 8.4 6.6 11.4 12.5 5" />
                      </svg>
                    </span>
                  </Show>
                  <Show when={v().estado !== 'vacio'}>
                    <b>
                      {props.simulando
                        ? 'Vista previa en curso.'
                        : v().estado === 'listo'
                          ? 'Listo para simular.'
                          : `${v().bloqueantes.toLocaleString('es-MX')} ${v().bloqueantes === 1 ? 'aviso impide' : 'avisos impiden'} simular.`}
                    </b>
                  </Show>
                </div>
                <Show when={v().estado !== 'vacio'} fallback={<p class="secundario sub">Doble clic en el lienzo para agregar una pieza.</p>}>
                  <Show when={!props.simulando && v().avisos.length > 0}>
                    <ul class="lista avisos-inspector" aria-label="Avisos">
                      <For each={v().avisos}>
                        {(a) => (
                          <li>
                            <Show when={a.piezas.length > 0} fallback={<p class="aviso" classList={{ leve: !!a.leve }}>{a.texto}</p>}>
                              <button type="button" class="entrada aviso" classList={{ leve: !!a.leve }} onClick={() => props.onAviso(a)}>
                                {a.texto}
                              </button>
                            </Show>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                  <Show when={!props.simulando && (v().totalAvisos > v().avisos.length || props.avisosAbiertos) && v().totalAvisos > AVISOS_EN_INSPECTOR}>
                    <Show when={props.avisosAbiertos && v().totalAvisos > v().avisos.length}>
                      <p class="secundario resto">y {(v().totalAvisos - v().avisos.length).toLocaleString('es-MX')} más.</p>
                    </Show>
                    <button type="button" class="enlace" aria-expanded={!!props.avisosAbiertos} onClick={() => props.onVerAvisos()}>
                      {props.avisosAbiertos ? 'Ver menos' : `Ver los ${v().totalAvisos.toLocaleString('es-MX')} avisos`}
                    </button>
                  </Show>
                </Show>
                <h3 class="sec">Circuito</h3>
                <dl class="cuentas">
                  <div>
                    <dt>Piezas</dt>
                    <dd class="cifra">{v().piezas.toLocaleString('es-MX')}</dd>
                  </div>
                  <div>
                    <dt>Redes</dt>
                    <dd class="cifra">{v().redes.toLocaleString('es-MX')}</dd>
                  </div>
                  <div>
                    <dt>Cables</dt>
                    <dd class="cifra">{v().cables.toLocaleString('es-MX')}</dd>
                  </div>
                  <Show when={v().figuras > 0}>
                    <div>
                      <dt>Figuras</dt>
                      <dd class="cifra">{v().figuras.toLocaleString('es-MX')}</dd>
                    </div>
                  </Show>
                </dl>
                <Show when={v().porCategoria.length > 0}>
                  <h3 class="sec">Por categoría</h3>
                  {/* La barra repite lo que dice la lista: es decorativa. */}
                  <div class="composicion" aria-hidden="true">
                    <For each={v().porCategoria}>{(c) => <span data-tono={c.tono} style={{ flex: String(c.piezas) }} />}</For>
                  </div>
                  <ul class="por-categoria">
                    <For each={v().porCategoria}>
                      {(c) => (
                        <li data-tono={c.tono}>
                          <span class="muestra" aria-hidden="true" />
                          <span>{c.nombre}</span>
                          <span class="cifra">{c.piezas.toLocaleString('es-MX')}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
                <Show when={v().sondas.length > 0}>
                  <h3 class="sec">Sondas</h3>
                  <ul class="lista-sondas">
                    <For each={v().sondas}>
                      {(s) => (
                        <li>
                          <button type="button" class="enlace cifra" onClick={() => props.onElegirSonda?.(s.id)}>
                            {s.texto}
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
                <Show when={v().redesConNombre.length > 0}>
                  <h3 class="sec">Redes con nombre</h3>
                  <For each={v().redesConNombre}>{(r) => <Fila nombre={r.nombre} valor={plural(r.conexiones, 'conexión', 'conexiones')} />}</For>
                  <Show when={v().totalRedesConNombre > v().redesConNombre.length}>
                    <button type="button" class="enlace" onClick={() => props.onVerRedes()}>
                      Ver las {v().totalRedesConNombre.toLocaleString('es-MX')} en Proyecto
                    </button>
                  </Show>
                </Show>
              </>
            )}
          </Match>
          <Match when={props.vista.tipo === 'pieza' && props.vista}>
            {(v) => (
              <>
                {/* La categoría va en la cabecera, con su muestra. */}
                <p class="secundario sub">{plural(v().pines, 'pin', 'pines')}</p>
                {/* El generador lleva su ficha compacta (forma, tiempo, amplitud) y la fuente variable la suya; las demás piezas, sus campos. */}
                <Show
                  when={(props.fichaGenerador && v().defId === 'generador') || (props.fichaFuente && v().defId === 'fuente-variable') || (props.fichaMultimetro && v().defId === 'multimetro')}
                  fallback={
                    <>
                      {/* La sección de ajustes; sin campos que mostrar (una tierra), no va. */}
                      <Show when={campos().length > 0}>
                        <h3 class="sec">Propiedades</h3>
                      </Show>
                      {/* La posición de un potenciómetro tiene su control deslizante arriba: la lista cerrada no se repite. */}
                      <Index each={partes().vistos}>
                        {(c) => <Campo campo={c()} pieza={v().id} onCambiar={props.onCambiarProp} desactivado={props.simulando && !c().enCaliente} />}
                      </Index>
                      <Show when={partes().mas.length > 0}>
                        <details class="mas-ajustes" open={masAbierto()} onToggle={(e) => setMasAbierto(e.currentTarget.open)}>
                          <summary>Más ajustes ({partes().mas.length})</summary>
                          <Index each={partes().mas}>
                            {(c) => (
                              <Show when={c().personalizado} fallback={<Campo campo={c()} pieza={v().id} onCambiar={props.onCambiarProp} desactivado={props.simulando && !c().enCaliente} />}>
                                <CampoPersonalizado campo={c()} pieza={v().id} onCambiar={props.onCambiarProp} desactivado={props.simulando} />
                              </Show>
                            )}
                          </Index>
                        </details>
                      </Show>
                    </>
                  }
                >
                  <h3 class="sec">Propiedades</h3>
                  {/* Con llave por la pieza: la ficha se rehace solo al cambiar de generador, no con cada cambio del documento. */}
                  <Show when={v().id} keyed>
                    {(id) => (v().defId === 'fuente-variable' ? props.fichaFuente!(id) : v().defId === 'multimetro' ? props.fichaMultimetro!(id) : props.fichaGenerador!(id))}
                  </Show>
                </Show>
                <fieldset class="inspector-campos" disabled={props.simulando}>
                <h3 class="sec">Posición</h3>
                <div class="fld">
                  <span class="secundario" id="giro-etiqueta">
                    Giro
                  </span>
                  <div class="seg" role="group" aria-labelledby="giro-etiqueta">
                    <For each={GIROS}>
                      {(r) => (
                        <button type="button" aria-pressed={v().rot === r} onClick={() => props.onOrientar({ rot: r, espejo: v().espejo })}>
                          {r}°
                        </button>
                      )}
                    </For>
                  </div>
                </div>
                <div class="fld">
                  <span class="secundario" id="reflejo-etiqueta">
                    Reflejo
                  </span>
                  <div class="seg" role="group" aria-labelledby="reflejo-etiqueta">
                    <For each={[false, true]}>
                      {(e) => (
                        <button type="button" aria-pressed={v().espejo === e} onClick={() => props.onOrientar({ rot: v().rot, espejo: e })}>
                          {e ? 'sí' : 'no'}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
                <h3 class="sec">Conexiones</h3>
                <For each={v().conexiones}>{(c) => <Fila nombre={c.pin} valor={c.red} />}</For>
                {acciones(false)}
                </fieldset>
              </>
            )}
          </Match>
          <Match when={props.vista.tipo === 'desconocida' && props.vista}>
            {(v) => (
              <>
                <p class="secundario sub">Pieza desconocida: {v().tipoPieza}. Se conserva al guardar.</p>
                {acciones(false)}
              </>
            )}
          </Match>
          <Match when={props.vista.tipo === 'varias' && props.vista}>
            {(v) => (
              <>
                <p class="secundario sub">{resumenSeleccion(v())}</p>
                <Show when={v().formato}>{(f) => <SeccionTexto vista={f()} clave={`varias-${v().notas}-${v().etiquetas}`} onFormato={props.onFormato} teclas={props.atajo} />}</Show>
                {/* Las etiquetas giran y se reflejan como las piezas. */}
                {acciones(v().piezas > 0 || v().etiquetas > 0)}
              </>
            )}
          </Match>
          <Match when={props.vista.tipo === 'cable' && props.vista}>
            {(v) => (
              <>
                <Fila nombre="Red" valor={v().red} />
                <Fila nombre={FILA_PINES_CONECTADOS} valor={String(v().conexiones)} />
                {/* Seleccionar su red no edita: queda activo al simular, fuera del grupo que se bloquea. */}
                <div class="acciones">
                  <button type="button" class="boton" onClick={() => props.onSeleccionarRed?.(v().id)}>
                    {TEXTO_SELECCIONAR_RED}
                  </button>
                </div>
                <fieldset class="inspector-campos" disabled={props.simulando}>
                  {acciones(false)}
                </fieldset>
              </>
            )}
          </Match>
          <Match when={props.vista.tipo === 'etiqueta' && props.vista}>
            {(v) => (
              <>
                <Fila nombre="Red" valor={v().red} />
                <Fila nombre={FILA_PINES_CONECTADOS} valor={String(v().conexiones)} />
                <p class="secundario sub">{TEXTO_ETIQUETAS_UNIDAS}</p>
                <fieldset class="inspector-campos" disabled={props.simulando}>
                  <Show when={props.onAplicarTexto} fallback={<Show when={v().formato}>{(f) => <SeccionTexto vista={f()} clave={v().id} onFormato={props.onFormato} teclas={props.atajo} />}</Show>}>
                    <FichaTexto tipo="etiqueta" id={v().id} texto={v().nombre} formato={v().formatoDoc} onPrevia={(id, c) => props.onPreviaTexto?.('etiqueta', id, c)} onAplicar={(id, c) => props.onAplicarTexto!('etiqueta', id, c)} teclas={props.atajo} />
                  </Show>
                  {/* La etiqueta gira y se refleja sobre su punto de conexión. */}
                  {acciones(true)}
                </fieldset>
              </>
            )}
          </Match>
          <Match when={props.vista.tipo === 'figura' && props.vista}>
            {(v) => (
              <>
                <SeccionFigura vista={v().figura} clave={v().ids.join(',')} onEstilo={(c) => props.onFigura?.(c)} onMedida={(m, t) => props.onMedidaFigura?.(m, t) ?? null} />
                {acciones(false, false, v().figura.alFondo)}
              </>
            )}
          </Match>
          <Match when={props.vista.tipo === 'sonda' && props.vista}>
            {(v) => (
              <>
                <Show when={v().medidor}>
                  {(m) => (
                    <FichaMedidor
                      id={v().id}
                      medidor={m()}
                      simulando={props.simulando}
                      onReferencia={(id, t) => props.onCambiarReferencia?.(id, t) ?? null}
                      onCambiar={(id, c) => props.onCambiarMedidor?.(id, c) ?? null}
                      onConvertir={(id) => props.onConvertirMedidor?.(id)}
                    />
                  )}
                </Show>
                <Show when={textosInspectorDeSonda(!!v().medidor).mostrarMide}>
                  <Fila nombre="Mide" valor={v().mide} />
                </Show>
                <Show when={v().sentido}>{(t) => <Fila nombre="Sentido" valor={t()} />}</Show>
                <div class="acciones">
                  <button type="button" class="boton" onClick={() => props.onRedDeSonda?.(v().id)}>
                    {TEXTO_SELECCIONAR_RED}
                  </button>
                </div>
                <fieldset class="inspector-campos" disabled={props.simulando}>
                  <div class="acciones">
                    <Show when={v().sentido}>
                      <button type="button" class="boton" onClick={() => props.onInvertirSentido?.(v().id)}>
                        Invertir el sentido
                      </button>
                    </Show>
                    <button type="button" class="boton peligro" {...conAtajo('borrar', textosInspectorDeSonda(!!v().medidor).quitar)} onClick={() => props.onBorrar()}>
                      {textosInspectorDeSonda(!!v().medidor).quitar}
                    </button>
                  </div>
                </fieldset>
                <p class="secundario sub">{v().medidor ? 'Arrastra la pantalla para acomodarla. Las flechas llevan el punto por la red.' : 'Arrastra la bandera para medir otro punto.'}</p>
              </>
            )}
          </Match>
          <Match when={props.vista.tipo === 'nota' && props.vista}>
            {(v) => (
              <>
                <fieldset class="inspector-campos" disabled={props.simulando}>
                  <Show
                    when={props.onAplicarTexto}
                    fallback={
                      <>
                        <p class="nota-texto">{v().texto}</p>
                        <Show when={v().formato}>{(f) => <SeccionTexto vista={f()} clave={v().id} onFormato={props.onFormato} teclas={props.atajo} />}</Show>
                      </>
                    }
                  >
                    <FichaTexto tipo="nota" id={v().id} texto={v().texto} formato={v().formatoDoc} onPrevia={(id, c) => props.onPreviaTexto?.('nota', id, c)} onAplicar={(id, c) => props.onAplicarTexto!('nota', id, c)} teclas={props.atajo} />
                  </Show>
                  {acciones(true, false)}
                </fieldset>
              </>
            )}
          </Match>
        </Switch>
        </fieldset>
      </div>
    </aside>
  )
}
