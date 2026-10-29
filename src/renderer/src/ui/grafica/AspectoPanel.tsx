import BotonesTema from '../exportar/BotonesTema'
import { createMemo, createUniqueId, For, Show, type JSX } from 'solid-js'
import { TONOS_FIGURA, type TonoFigura } from '../../../../compartido/ajustes'
import {
  ESTILOS_REJILLA,
  GROSOR_LINEAS_RANGO,
  GROSOR_RANGO,
  LADOS_EJE_Y,
  NOMBRE_ESTILO_REJILLA,
  NOMBRE_SUBDIVISIONES,
  NOMBRE_LADO,
  NOMBRE_PESO,
  NOMBRE_POSICION_X,
  NOMBRE_TEMA_GRAFICA,
  PESOS_TEXTO,
  POSICIONES_EJE_X,
  PREFIJOS_EJE,
  TEMAS_GRAFICA,
  TEXTO_TAM_BASE,
  TEXTO_TAM_RANGO,
  type AspectoGrafica,
  DECIMALES_EJE,
  type AspectoTraza,
  type Decimales,
  type EstiloRejilla,
  type LadoEjeY,
  type PesoTexto,
  type PosicionEjeX,
  type PrefijoEje,
  type Subdivisiones,
  type TemaGrafica,
  type RangoEje
} from '../../../../compartido/grafica/aspecto'
import { SUBDIVISIONES } from '../../../../compartido/grafica/ticks'
import { admitePrefijo, decimalesPorOmision, unidadConPrefijo } from '../../../../compartido/grafica/ejes'
import { NOMBRE_TONO_FIGURA } from '../exportar/modelo'
import CamposRango from './CamposRango'
import { mismasClaves } from './claves'
import { ICONOS_REJILLA } from './iconosRejilla'

/**
 * Opciones de aspecto de una gráfica, las mismas en la ventana de gráficas, el osciloscopio y el diálogo de exportar. Los tonos son nombres de la tabla de colores.
 */
export interface TrazaVista {
  clave: string
  etiqueta: string
  /** El tono con que se dibuja ahora (el elegido o el de omisión). */
  tono: TonoFigura
  lado: LadoEjeY
  /** El tono elegido de forma explícita; null si es el de omisión. */
  tonoElegido: TonoFigura | null
  grosor: number | null
  prefijo: PrefijoEje | null
  /** Decimales elegidos para las cifras de su eje; ausente, 1. */
  decimales?: Decimales
  /** Desde y hasta escritos a mano para su eje vertical; ausente, automático. */
  rango?: RangoEje
  /** La unidad base de su eje vertical (`V`, `A`): con ella se arman «mV», «V»… Sin unidad con prefijo, no hay selector. */
  unidad: string
}

interface Props {
  aspecto: AspectoGrafica
  onAspecto(p: Partial<AspectoGrafica>): void
  trazas: readonly TrazaVista[]
  onTraza(clave: string, p: Partial<AspectoTraza>): void
  /** Con barras no hay eje vertical por traza, grosor ni unidad por traza: solo el color de cada serie. */
  modo?: 'lineas' | 'barras'
  /** El eje horizontal: cómo se llama («Eje del tiempo») y la unidad de sus números; null si no hay (barras). */
  ejeX: { etiqueta: string; unidad: string; log?: boolean } | null
  /** Texto de la unidad del eje horizontal en el rótulo del selector («Tiempo»). */
  onRestablecer(): void
  /** Controles propios de una gráfica (la magnitud en dBV de un Bode). */
  extra?: JSX.Element
  /** La figura exportada no tiene asas: sin la nota que las nombra. */
  sinAsas?: boolean
  /** Sin los botones de color de cada traza (el diálogo de exportar ya trae los suyos). */
  sinColor?: boolean
  /** Sin la lectura al pasar el ratón (el diálogo de exportar no la usa). */
  sinLectura?: boolean
  /** El tamaño del texto ya se elige aparte (exportar): «Textos» no lo repite. */
  sinTamanoTexto?: boolean
  /** X-Y: las trazas que pueden hacer de eje horizontal y cómo se llama el eje de siempre («Tiempo»). Sin candidatas, no hay selector. */
  candidatosX?: readonly { clave: string; etiqueta: string }[]
  nombreEjeBase?: string
  /** Desde y hasta escritos a mano para cada eje (gráficas de análisis): sin esto no hay campos de rango. */
  conRango?: boolean
  /** Grosores generales de las líneas (trazas, ejes y rejilla) dentro de «Rejilla»: lo que usa el editor de exportar. */
  conGrosores?: boolean
  /** El tema se elige entre «Tema claro» y «Tema oscuro» (con sol y luna), sin «Como la aplicación»: lo que usa el editor de exportar. */
  temaExplicito?: boolean
}

export function Opciones<T extends string>(props: { nombre: string; valor: T; opciones: readonly (readonly [T, string])[]; onCambiar(v: T): void }) {
  const grupo = createUniqueId()
  return (
    <div class="asp-campo" role="radiogroup" aria-label={props.nombre}>
      <span class="asp-rotulo" aria-hidden="true">
        {props.nombre}
      </span>
      <div class="asp-pastillas">
        <For each={props.opciones}>
          {([v, texto]) => (
            <label class="asp-pastilla">
              <input type="radio" name={`${grupo}-${props.nombre}`} checked={props.valor === v} onChange={() => props.onCambiar(v)} />
              <span>{texto}</span>
            </label>
          )}
        </For>
      </div>
    </div>
  )
}

/** Las pastillas «0 1 2 3 4 Auto» de los decimales de un eje: `valor` es lo elegido o, sin elección, los de omisión de ese eje. */
export function PastillasDecimales(props: { nombre: string; valor: Decimales | undefined; omision: number; onCambiar(d: Decimales): void }) {
  const opciones = DECIMALES_EJE.map((d) => [String(d), d === 'auto' ? 'Auto' : String(d)] as const)
  return <Opciones nombre={props.nombre} valor={String(props.valor ?? props.omision)} opciones={opciones} onCambiar={(v) => props.onCambiar(v === 'auto' ? 'auto' : (Number(v) as Decimales))} />
}

/** Opciones como una fila de botones cuadrados con icono (radios nativos: flechas, nombre y globo con el texto de la opción). */
export function OpcionesIconos<T extends string>(props: { nombre: string; valor: T; opciones: readonly (readonly [T, string])[]; icono(v: T): JSX.Element; onCambiar(v: T): void }) {
  const grupo = createUniqueId()
  return (
    <div class="asp-campo" role="radiogroup" aria-label={props.nombre}>
      <span class="asp-rotulo" aria-hidden="true">
        {props.nombre}
      </span>
      <div class="asp-pastillas asp-iconos">
        <For each={props.opciones}>
          {([v, texto]) => (
            <label class="asp-pastilla asp-icono-op" title={texto}>
              <input type="radio" name={`${grupo}-${props.nombre}`} aria-label={texto} checked={props.valor === v} onChange={() => props.onCambiar(v)} />
              <span aria-hidden="true">{props.icono(v)}</span>
            </label>
          )}
        </For>
      </div>
    </div>
  )
}

/** El tema de una figura exportada: claro u oscuro explícitos, sin seguir a la aplicación. */
export const OPCIONES_TEMA_EXPORTAR: readonly (readonly ['claro' | 'oscuro', string])[] = [['claro', 'Tema claro'], ['oscuro', 'Tema oscuro']]

const GROSORES: readonly number[] = Array.from({ length: (GROSOR_RANGO[1] - GROSOR_RANGO[0]) * 2 + 1 }, (_, i) => GROSOR_RANGO[0] + i / 2)

/** «Ejes»: dónde van, las marcas, la unidad mostrada y la lectura al pasar el ratón. */
export function SeccionEjes(props: Props) {
  const id = createUniqueId()
  const a = () => props.aspecto
  return (
    <>
      <Show when={(props.candidatosX?.length ?? 0) > 0}>
        <label class="asp-fila">
          <span id={`${id}-xy`}>Eje horizontal</span>
          <select class="campo" aria-labelledby={`${id}-xy`} value={a().ejeXTraza ?? ''} onChange={(e) => props.onAspecto({ ejeXTraza: e.currentTarget.value || undefined })}>
            <option value="">{props.nombreEjeBase ?? 'Tiempo'}</option>
            <For each={props.candidatosX}>{(c) => <option value={c.clave}>{c.etiqueta}</option>}</For>
          </select>
        </label>
      </Show>
      <Show when={props.ejeX}>
        {(x) => <Opciones nombre={x().etiqueta} valor={a().ejeX} opciones={POSICIONES_EJE_X.map((p) => [p, NOMBRE_POSICION_X[p]] as const)} onCambiar={(p: PosicionEjeX) => props.onAspecto({ ejeX: p })} />}
      </Show>
      <label class="asp-casilla">
        <input type="checkbox" checked={a().marcas} onChange={(e) => props.onAspecto({ marcas: e.currentTarget.checked })} />
        Marcas en los ejes
      </label>
      <Show when={!props.sinAsas}>
        <p class="asp-nota">Cada eje también se mueve con su asa.</p>
      </Show>
      <Show when={props.conRango && props.ejeX && !props.ejeX.log}>
        <CamposRango nombre={props.ejeX!.etiqueta} unidad={props.ejeX!.unidad} rango={a().rangoX} onRango={(r) => props.onAspecto({ rangoX: r })} />
      </Show>
      <Show when={props.ejeX && admitePrefijo(props.ejeX!.unidad)}>
        <label class="asp-fila">
          <span id={`${id}-ux`}>Unidad de los números</span>
          <select class="campo" aria-labelledby={`${id}-ux`} value={a().prefijoX ?? ''} onChange={(e) => props.onAspecto({ prefijoX: (e.currentTarget.value || null) as PrefijoEje | null })}>
            <option value="">Automática</option>
            <For each={PREFIJOS_EJE}>{(p) => <option value={p}>{unidadConPrefijo(props.ejeX!.unidad, p)}</option>}</For>
          </select>
        </label>
        <p class="asp-nota">Solo cambia cómo se escriben los números. La escala por división no cambia.</p>
      </Show>
      <Show when={props.ejeX && (!props.ejeX.log || a().prefijoX)}>
        <PastillasDecimales nombre="Decimales de los números" valor={a().decimalesX} omision={decimalesPorOmision(props.ejeX!.unidad)} onCambiar={(d) => props.onAspecto({ decimalesX: d })} />
      </Show>
      <Show when={!props.sinLectura}>
        <label class="asp-casilla">
          <input type="checkbox" checked={a().lectura} onChange={(e) => props.onAspecto({ lectura: e.currentTarget.checked })} />
          Valores al pasar el ratón
        </label>
      </Show>
    </>
  )
}

/** «Textos»: el color, el grosor y el tamaño de las letras y cifras de los ejes. */
export function SeccionTextos(props: Props) {
  const a = () => props.aspecto
  const textoTono = (): TonoFigura | 'traza' => a().textoTono ?? 'traza'
  const opcionesTexto: readonly (readonly [TonoFigura | 'traza', string])[] = [['traza', 'De cada traza'], ['negro', NOMBRE_TONO_FIGURA.negro], ['gris', NOMBRE_TONO_FIGURA.gris], ['canal-b', NOMBRE_TONO_FIGURA['canal-b']]]
  return (
    <>
      <Opciones nombre="Color" valor={textoTono()} opciones={opcionesTexto} onCambiar={(t) => props.onAspecto({ textoTono: t === 'traza' ? null : t })} />
      <Opciones nombre="Grosor del texto" valor={a().textoPeso} opciones={PESOS_TEXTO.map((p) => [p, NOMBRE_PESO[p]] as const)} onCambiar={(p: PesoTexto) => props.onAspecto({ textoPeso: p })} />
      <Show when={!props.sinTamanoTexto}>
      <label class="asp-campo asp-rango">
        <span class="asp-rotulo">Tamaño del texto</span>
        <input
          type="range"
          min={TEXTO_TAM_RANGO[0]}
          max={TEXTO_TAM_RANGO[1]}
          step="1"
          value={a().textoTam ?? TEXTO_TAM_BASE}
          aria-valuetext={`${a().textoTam ?? TEXTO_TAM_BASE} px`}
          onInput={(e) => props.onAspecto({ textoTam: Number(e.currentTarget.value) === TEXTO_TAM_BASE ? null : Number(e.currentTarget.value) })}
        />
        <output class="cifra">{a().textoTam ?? TEXTO_TAM_BASE} px</output>
      </label>
      </Show>
    </>
  )
}

/** «Trazas»: el grosor de la línea y, por traza, su eje vertical, su color, su grosor y la unidad de su eje. */
export function SeccionTrazas(props: Props) {
  const id = createUniqueId()
  // Las claves son cadenas: mientras no cambien, `For` conserva los controles de cada traza (con sus listas abiertas y su foco) aunque el
  // modelo entregue objetos nuevos en cada edición.
  const claves = createMemo((): string[] => props.trazas.map((t) => t.clave), [], { equals: mismasClaves })
  const a = () => props.aspecto
  return (
    <>
      <label class="asp-campo asp-rango">
        <span class="asp-rotulo">Grosor de la línea</span>
        <input type="range" min={GROSOR_RANGO[0]} max={GROSOR_RANGO[1]} step="0.1" value={a().grosor} aria-valuetext={`${a().grosor} px`} onInput={(e) => props.onAspecto({ grosor: Number(e.currentTarget.value) })} />
        <output class="cifra">{a().grosor} px</output>
      </label>
      <For each={claves()}>
        {(clave, i) => {
          const t = () => props.trazas.find((x) => x.clave === clave) ?? props.trazas[0]
          return (
            <div class="asp-traza" role="group" aria-label={t().etiqueta}>
              <span class="asp-traza-nombre">
                <span class="asp-muestra" data-tono-figura={t().tono} aria-hidden="true" />
                {t().etiqueta}
              </span>
              <Show when={props.modo !== 'barras'}>
                <label class="asp-fila">
                  <span>Eje vertical</span>
                  <select class="campo" value={t().lado} onChange={(e) => props.onTraza(t().clave, { lado: e.currentTarget.value as LadoEjeY })}>
                    <For each={LADOS_EJE_Y}>{(l) => <option value={l}>{NOMBRE_LADO[l]}</option>}</For>
                  </select>
                </label>
              </Show>
              <Show when={!props.sinColor}>
                <div class="asp-fila" role="group" aria-label={`Color de ${t().etiqueta}`}>
                  <span aria-hidden="true">Color</span>
                  <span class="tonos-figura">
                    <button type="button" class="asp-sin-tono" aria-pressed={t().tonoElegido === null} aria-label="Auto, el tono predeterminado" title="Tono predeterminado" onClick={() => props.onTraza(t().clave, { color: null })}>
                      Auto
                    </button>
                    <For each={TONOS_FIGURA}>
                      {(tono) => <button type="button" class="tono-figura" data-tono-figura={tono} aria-pressed={t().tonoElegido === tono} aria-label={NOMBRE_TONO_FIGURA[tono]} title={NOMBRE_TONO_FIGURA[tono]} onClick={() => props.onTraza(t().clave, { color: tono })} />}
                    </For>
                  </span>
                </div>
              </Show>
              <Show when={props.modo !== 'barras'}>
                <label class="asp-fila">
                  <span>Grosor</span>
                  <select class="campo" value={t().grosor === null ? '' : String(t().grosor)} onChange={(e) => props.onTraza(t().clave, { grosor: e.currentTarget.value === '' ? null : Number(e.currentTarget.value) })}>
                    <option value="">Igual que la gráfica</option>
                    <For each={GROSORES}>{(g) => <option value={String(g)}>{g} px</option>}</For>
                  </select>
                </label>
                <label class="asp-fila">
                  <span id={`${id}-u${i()}`}>Unidad del eje</span>
                  <Show when={admitePrefijo(t().unidad)} fallback={<span class="asp-fija cifra">{t().unidad || 'Sin unidad'}</span>}>
                    <select class="campo" aria-labelledby={`${id}-u${i()}`} value={t().prefijo ?? ''} onChange={(e) => props.onTraza(t().clave, { prefijo: (e.currentTarget.value || null) as PrefijoEje | null })}>
                      <option value="">Automática</option>
                      <For each={PREFIJOS_EJE}>{(p) => <option value={p}>{unidadConPrefijo(t().unidad, p)}</option>}</For>
                    </select>
                  </Show>
                </label>
                <Show when={props.conRango}>
                  <CamposRango nombre={t().etiqueta} unidad={t().unidad} rango={t().rango} onRango={(r) => props.onTraza(t().clave, { rango: r })} />
                </Show>
                <PastillasDecimales nombre="Decimales del eje" valor={t().decimales} omision={decimalesPorOmision('V')} onCambiar={(d) => props.onTraza(t().clave, { decimales: d })} />
              </Show>
            </div>
          )
        }}
      </For>
      <Show when={props.extra}>{props.extra}</Show>
    </>
  )
}

/** El valor de las pastillas de subdivisiones: «auto» es lo de omisión (null). */
const subdivisionValor = (s: Subdivisiones | null | undefined): string => (s ? String(s) : 'auto')
const subdivisionDe = (v: string): Subdivisiones | null => (v === 'auto' ? null : (Number(v) as Subdivisiones))
/** Un eje logarítmico no cuenta partes: cualquier subdivisión pinta las marcas 2 a 9 de cada década. */
function opcionesSubdivision(log: boolean): readonly (readonly [string, string])[] {
  if (log) return [['auto', 'Auto'], ['1', 'Ninguna'], ['2', '2 a 9 de cada década']]
  return [['auto', 'Auto'], ...SUBDIVISIONES.map((n) => [String(n), NOMBRE_SUBDIVISIONES[n]] as const)]
}

/** Un deslizador de grosor de línea en px, de medio en medio. */
function Deslizador2(props: { rotulo: string; valor: number; min: number; max: number; onCambiar(v: number): void }) {
  return (
    <label class="asp-campo asp-rango">
      <span class="asp-rotulo">{props.rotulo}</span>
      <input type="range" min={props.min} max={props.max} step="0.5" value={props.valor} aria-valuetext={`${props.valor} px`} onInput={(e) => props.onCambiar(Number(e.currentTarget.value))} />
      <output class="cifra">{props.valor} px</output>
    </label>
  )
}

/** El estilo de la rejilla (ninguna, puntos, líneas...). */
export function ControlRejilla(props: Props) {
  const a = () => props.aspecto
  const rejillaValor = (): EstiloRejilla | 'ninguna' => (a().rejilla ? a().rejillaEstilo : 'ninguna')
  const opcionesRejilla: readonly (readonly [EstiloRejilla | 'ninguna', string])[] = [['ninguna', 'Ninguna'], ...ESTILOS_REJILLA.map((e) => [e, NOMBRE_ESTILO_REJILLA[e]] as const)]
  return (
    <OpcionesIconos
      nombre="Rejilla"
      valor={rejillaValor()}
      opciones={opcionesRejilla}
      icono={(v) => ICONOS_REJILLA[v]()}
      onCambiar={(v) => (v === 'ninguna' ? props.onAspecto({ rejilla: false }) : props.onAspecto({ rejilla: true, rejillaEstilo: v }))}
    />
  )
}

/** Grosor de las trazas. */
export function GrosorTrazas(props: Props) {
  return <Deslizador2 rotulo="Grosor de las trazas" valor={props.aspecto.grosor} min={GROSOR_RANGO[0]} max={GROSOR_RANGO[1]} onCambiar={(v) => props.onAspecto({ grosor: v })} />
}

/** Grosor de los ejes. */
export function GrosorEjes(props: Props) {
  return <Deslizador2 rotulo="Grosor de los ejes" valor={props.aspecto.grosorEjes ?? 1} min={GROSOR_LINEAS_RANGO[0]} max={GROSOR_LINEAS_RANGO[1]} onCambiar={(v) => props.onAspecto({ grosorEjes: v === 1 ? undefined : v })} />
}

/** Grosor de la rejilla; sin rejilla no hay nada que graduar. */
export function GrosorRejilla(props: Props) {
  return (
    <Show when={props.aspecto.rejilla}>
      <Deslizador2 rotulo="Grosor de la rejilla" valor={props.aspecto.grosorRejilla ?? 1} min={GROSOR_LINEAS_RANGO[0]} max={GROSOR_LINEAS_RANGO[1]} onCambiar={(v) => props.onAspecto({ grosorRejilla: v === 1 ? undefined : v })} />
    </Show>
  )
}

/** Subdivisiones de los dos ejes; sin rejilla no se dibujan. */
export function SubdivisionesEjes(props: Props) {
  const a = () => props.aspecto
  return (
    <Show when={a().rejilla}>
      <Opciones
        nombre="Subdivisiones del eje horizontal"
        valor={subdivisionValor(a().subdivisionesX)}
        opciones={opcionesSubdivision(props.ejeX?.log === true)}
        onCambiar={(v) => props.onAspecto({ subdivisionesX: subdivisionDe(v) })}
      />
      <Opciones nombre="Subdivisiones del eje vertical" valor={subdivisionValor(a().subdivisionesY)} opciones={opcionesSubdivision(false)} onCambiar={(v) => props.onAspecto({ subdivisionesY: subdivisionDe(v) })} />
    </Show>
  )
}

/** El tema de la figura. */
export function ControlTema(props: Props) {
  const a = () => props.aspecto
  return (
    <Show
      when={props.temaExplicito}
      fallback={<Opciones nombre="Tema de la gráfica" valor={a().tema} opciones={TEMAS_GRAFICA.map((t) => [t, NOMBRE_TEMA_GRAFICA[t]] as const)} onCambiar={(t: TemaGrafica) => props.onAspecto({ tema: t })} />}
    >
      <BotonesTema valor={a().tema === 'oscuro' ? 'oscuro' : 'claro'} onCambiar={(t) => props.onAspecto({ tema: t })} />
    </Show>
  )
}

/** «Rejilla»: el estilo de la rejilla, sus grosores, sus subdivisiones y el tema de la gráfica; `fondo` suma lo propio del editor de exportar. */
export function SeccionRejilla(props: Props & { fondo?: JSX.Element }) {
  return (
    <>
      <ControlRejilla {...props} />
      <Show when={props.conGrosores}>
        <GrosorTrazas {...props} />
        <GrosorEjes {...props} />
        <GrosorRejilla {...props} />
      </Show>
      <SubdivisionesEjes {...props} />
      <ControlTema {...props} />
      {props.fondo}
    </>
  )
}

/** Lo que reciben las secciones de aspecto (la hoja lateral y el editor de exportar). */
export type PropsAspecto = Props
