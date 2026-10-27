import { createEffect, createSignal, createUniqueId, For, on, Show, type JSX } from 'solid-js'
import { valoresDeParametro, type AnalisisDoc, type BarridoDeFuente, type ConfigAnalisis, type ParametroBarrido, type VentanaFourier } from '../../../compartido/analisis/config'
import type { Id } from '../doc/tipos'
import { textoDeNumero } from '../instrumentos/ajusteAutomatico'
import { BASES_DE_PARAMETRO, conBase, errorDeBorrador, NOMBRE_FICHA, parametroInicial, reconciliarAnalisis, type TipoFicha } from '../analisis/fichas'
import { salePorOmision, type ContextoAnalisis } from '../analisis/contexto'
import { DESCRIPCION_FICHA, pistaDe } from '../analisis/descripciones'
import { guardadasDeSeleccion, seleccionDeGuardadas } from '../analisis/ejecucion'
import { formatearValor, leerValor } from '../valores/valores'
import CampoValor from './CampoValor'
import Conmutador from './Conmutador'
import EjemploAnalisis from './EjemploAnalisis'

export interface PropsFicha {
  tipo: TipoFicha
  /** Los análisis guardados de este tipo. */
  guardados: readonly AnalisisDoc[]
  elegido: AnalisisDoc | null
  onElegir(id: Id): void
  ctx: ContextoAnalisis | null
  /** Por qué no hay contexto (circuito vacío, sin tierra, pieza sin modelo). */
  errorCtx: string | null
  /** Se puede cambiar el documento (no hay solo lectura ni vista previa). */
  editable: boolean
  motivoNoEditable: string | null
  /** Crea un análisis nuevo de este tipo; devuelve el porqué si no se pudo. */
  onNuevo(): string | null
  /** Guarda un análisis (un paso de deshacer); devuelve el porqué si no se pudo. */
  onGuardar(a: AnalisisDoc): string | null
  onBorrar(id: Id): void
  corriendo: boolean
  /** Por qué Ejecutar no actúa ahora (vista previa, avisos que bloquean); null si actúa. */
  motivoNoEjecutar: string | null
  onEjecutar(): void
  /** Detiene el análisis que corre (el botón se llama «Detener» mientras corre). */
  onDetener(): void
  /** Sin nada corriendo, «Cancelar» descarta lo que se arma y vuelve a la vista de omisión del riel derecho. */
  onDescartar(): void
  /** El error de la última corrida de este análisis, para verlo en la ficha. */
  errorCorrida: string | null
  /** Cómo quedó la última corrida de este análisis («Listo · 97 ms»), junto a Ejecutar; null si no hay. */
  estadoCorrida?: string | null
}

const sinPrefijo = (n: number | undefined): string => (n === undefined ? '' : textoDeNumero(n, 7))

/** La pista de un ajuste a pedido: el botón «?» de su renglón la abre y la cierra. */
function usarPista(pista: string | undefined) {
  const [abierta, setAbierta] = createSignal(false)
  const id = `an-pista-${createUniqueId()}`
  return { abierta, id, alternar: () => setAbierta((a) => !a), hay: () => !!pista, texto: () => pista }
}
type Pista = ReturnType<typeof usarPista>

function PistaBoton(props: { pista: Pista; ajuste: string }) {
  return (
    <Show when={props.pista.hay()}>
      <button type="button" class="an-q" aria-expanded={props.pista.abierta()} aria-controls={props.pista.id} aria-label={`Ayuda: ${props.ajuste}`} onClick={() => props.pista.alternar()}>
        <span aria-hidden="true">?</span>
      </button>
    </Show>
  )
}

function PistaTexto(props: { pista: Pista }) {
  return (
    <Show when={props.pista.hay()}>
      <p class="an-pista" id={props.pista.id} hidden={!props.pista.abierta()}>
        {props.pista.texto()}
      </p>
    </Show>
  )
}

/** Una casilla con su pista a pedido. */
function Casilla(props: { marcada: boolean; desactivado?: boolean; onCambiar(v: boolean): void; texto: string; pista?: string; ajuste: string }) {
  const pista = usarPista(props.pista)
  return (
    <div class="an-fila-casilla">
      <label class="casilla">
        <input type="checkbox" checked={props.marcada} disabled={props.desactivado} onChange={(e) => props.onCambiar(e.currentTarget.checked)} />
        {props.texto}
      </label>
      <PistaBoton pista={pista} ajuste={props.ajuste} />
      <PistaTexto pista={pista} />
    </div>
  )
}

/** Un renglón con rótulo y un selector de opciones (Conmutador) con su pista a pedido. */
function FilaConmutador(props: { rotulo: string; pista?: string; children: JSX.Element }) {
  const pista = usarPista(props.pista)
  return (
    <div class="ficha-fila an-fila-conmutador">
      <span class="fld-rotulo">
        <span class="ficha-serie-rotulo" aria-hidden="true">
          {props.rotulo}
        </span>
        <PistaBoton pista={pista} ajuste={props.rotulo} />
      </span>
      {props.children}
      <PistaTexto pista={pista} />
    </div>
  )
}

interface PropsCampo {
  etiqueta: string
  valor: number | undefined
  unidad: string
  /** Un valor nuevo; undefined cuando se vacía un campo opcional. */
  onValor(v: number | undefined): void
  opcional?: boolean
  desactivado?: boolean
  /** Un número entero sin unidad (puntos, armónicos). */
  entero?: boolean
  /** Lo que hace el ajuste, a pedido con el botón «?». */
  pista?: string
}

/** Un renglón de rótulo y valor con unidad: lee lo escrito al salir del campo o con Enter y avisa si no se entiende. */
function Campo(props: PropsCampo) {
  const id = `an-${createUniqueId()}`
  const pista = usarPista(props.pista)
  const [error, setError] = createSignal<string | null>(null)
  let texto = sinPrefijo(props.valor)
  const aplicar = () => {
    const t = texto.trim()
    if (t === '' && props.opcional) {
      setError(null)
      if (props.valor !== undefined) props.onValor(undefined)
      return
    }
    const v = leerValor(t)
    if (!v) return setError(`«${t}» no es un número válido.`)
    if (props.entero && !Number.isInteger(v.valor)) return setError(`${props.etiqueta} debe ser un entero.`)
    if (v.unidad && v.unidad !== props.unidad) return setError(`«${t}» no está en ${props.unidad || 'unidades de este campo'}.`)
    setError(null)
    if (v.valor !== props.valor) props.onValor(v.valor)
  }
  return (
    <div class="fld fld-an">
      <span class="fld-rotulo">
        <label for={id}>{props.etiqueta}</label>
        <PistaBoton pista={pista} ajuste={props.etiqueta} />
      </span>
      <CampoValor
        texto={sinPrefijo(props.valor)}
        unidad={props.unidad}
        nombre={props.etiqueta}
        desactivado={props.desactivado}
        invalido={!!error()}
        atributos={{ id, 'aria-describedby': error() ? `${id}-e` : undefined }}
        onTexto={(t) => (texto = t)}
        onAplicar={aplicar}
        onTecla={(e) => {
          if (e.key === 'Enter') aplicar()
        }}
      />
      <Show when={error()}>
        <p class="fld-error" id={`${id}-e`} role="alert">
          {error()}
        </p>
      </Show>
      <PistaTexto pista={pista} />
    </div>
  )
}

/** Una lista de frecuencias en Hz separadas por comas («60, 120»): vacía vale ninguna. Lee al salir del campo o con Enter. */
function CampoFrecuencias(props: { etiqueta: string; valor: readonly number[] | undefined; onValor(v: number[]): void; desactivado?: boolean; pista?: string }) {
  const id = `an-${createUniqueId()}`
  const pista = usarPista(props.pista)
  const [error, setError] = createSignal<string | null>(null)
  const mostrado = () => (props.valor ?? []).map((f) => sinPrefijo(f)).join(', ')
  let texto = mostrado()
  const aplicar = () => {
    const partes = texto.split(/[,;]|\s+/).map((t) => t.trim()).filter((t) => t !== '')
    const lista: number[] = []
    for (const t of partes) {
      const v = leerValor(t)
      if (!v || !(v.valor > 0) || (v.unidad && v.unidad !== 'Hz')) return setError(`«${t}» no es una frecuencia en Hz.`)
      lista.push(v.valor)
    }
    setError(null)
    const unicas = [...new Set(lista)].sort((x, y) => x - y)
    if (unicas.join(',') !== (props.valor ?? []).join(',')) props.onValor(unicas)
  }
  return (
    <div class="fld fld-an">
      <span class="fld-rotulo">
        <label for={id}>{props.etiqueta}</label>
        <PistaBoton pista={pista} ajuste={props.etiqueta} />
      </span>
      <input
        id={id}
        class="campo"
        type="text"
        inputMode="decimal"
        placeholder="60, 120"
        value={mostrado()}
        disabled={props.desactivado}
        aria-invalid={error() ? 'true' : undefined}
        aria-describedby={error() ? `${id}-e` : undefined}
        onInput={(e) => (texto = e.currentTarget.value)}
        onChange={aplicar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') aplicar()
        }}
      />
      <Show when={error()}>
        <p class="fld-error" id={`${id}-e`} role="alert">
          {error()}
        </p>
      </Show>
      <PistaTexto pista={pista} />
    </div>
  )
}

function Lista(props: { etiqueta: string; valor: string; opciones: readonly { valor: string; texto: string }[]; onValor(v: string): void; desactivado?: boolean; pista?: string }) {
  const id = `an-${createUniqueId()}`
  const pista = usarPista(props.pista)
  return (
    <div class="fld fld-an">
      <span class="fld-rotulo">
        <label for={id}>{props.etiqueta}</label>
        <PistaBoton pista={pista} ajuste={props.etiqueta} />
      </span>
      <select id={id} class="campo" disabled={props.desactivado} onChange={(e) => props.onValor(e.currentTarget.value)}>
        <Show when={props.opciones.length > 0 && !props.opciones.some((o) => o.valor === props.valor)}>
          <option value="" selected disabled>
            Elige una…
          </option>
        </Show>
        <For each={props.opciones}>{(o) => <option value={o.valor} selected={o.valor === props.valor}>{o.texto}</option>}</For>
      </select>
      <PistaTexto pista={pista} />
    </div>
  )
}

const VENTANAS: readonly { valor: VentanaFourier; texto: string }[] = [
  { valor: 'rectangular', texto: 'Rectangular' },
  { valor: 'hann', texto: 'Hann' }
]

/**
 * Fichas de configuración de los análisis. El borrador vive aquí: un cambio válido se guarda en un paso de deshacer, uno inválido deja el mensaje y no guarda.
 */
export default function FichaAnalisis(props: PropsFicha) {
  const [borrador, setBorrador] = createSignal<AnalisisDoc | null>(props.elegido)
  const [error, setError] = createSignal<string | null>(null)
  // Lo que viene del documento (deshacer, rehacer, otro análisis) reemplaza el borrador.
  createEffect(
    on(
      () => props.elegido,
      (e) => {
        setBorrador(e)
        setError(null)
      },
      { defer: true }
    )
  )

  const cambiar = (f: (a: AnalisisDoc) => AnalisisDoc) => {
    const a = borrador()
    if (!a) return
    const nuevo = f(a)
    setBorrador(nuevo)
    const e = errorDeBorrador(nuevo)
    if (e) return setError(e)
    setError(props.onGuardar(nuevo))
  }
  const cambiarConfig = (f: (c: ConfigAnalisis) => ConfigAnalisis) => cambiar((a) => ({ ...a, config: f(a.config) }))
  const fuentes = () => (props.ctx?.fuentes ?? []).map((f) => ({ valor: f.id, texto: f.ref }))
  const sinEditar = () => !props.editable

  const barrido = (rotulo: string, b: BarridoDeFuente, alCambiar: (b: BarridoDeFuente) => void, conFuente: boolean): JSX.Element => (
    <>
      <Show when={conFuente}>
        <Lista etiqueta={`Fuente ${rotulo}`} valor={b.fuente} opciones={fuentes()} onValor={(v) => alCambiar({ ...b, fuente: v })} desactivado={sinEditar()} pista={pistaDe(rotulo === 'anidada' ? 'dc.fuente2' : 'dc.fuente')} />
      </Show>
      <Campo etiqueta="Desde" valor={b.desde} unidad="V" onValor={(v) => v !== undefined && alCambiar({ ...b, desde: v })} desactivado={sinEditar()} pista={pistaDe('dc.desde')} />
      <Campo etiqueta="Hasta" valor={b.hasta} unidad="V" onValor={(v) => v !== undefined && alCambiar({ ...b, hasta: v })} desactivado={sinEditar()} pista={pistaDe('dc.hasta')} />
      <Campo etiqueta="Paso" valor={b.paso} unidad="V" onValor={(v) => v !== undefined && alCambiar({ ...b, paso: v })} desactivado={sinEditar()} pista={pistaDe('dc.paso')} />
    </>
  )

  const cuerpoBase = (a: AnalisisDoc): JSX.Element => {
    const c = a.config
    switch (c.tipo) {
      case 'op':
        return <p class="deriv ficha-aviso">No necesita ajustes. Al ejecutarlo, los voltajes quedan en el lienzo y en Gráficas.</p>
      case 'dc':
        return (
          <>
            <h4 class="sec">Primera fuente</h4>
            {barrido('que se barre', c, (b) => cambiarConfig((x) => ({ ...(x as typeof c), ...b })), true)}
            <h4 class="sec">Segunda fuente (opcional)</h4>
            <Casilla
              ajuste="Barrer una segunda fuente"
              marcada={!!c.segunda}
              desactivado={sinEditar() || fuentes().length < 2}
              texto="Barrer una segunda fuente (una curva por cada valor)"
              pista={pistaDe('dc.segunda')}
              onCambiar={(si) => {
                const otra = props.ctx?.fuentes.find((f) => f.id !== c.fuente)
                if (!si) return cambiarConfig((x) => ({ ...(x as typeof c), segunda: undefined }))
                if (otra) cambiarConfig((x) => ({ ...(x as typeof c), segunda: { fuente: otra.id, desde: 0, hasta: 5, paso: 1 } }))
              }}
            />
            <Show when={fuentes().length < 2}>
              <p class="deriv ficha-aviso">El circuito tiene una sola fuente de voltaje.</p>
            </Show>
            <Show when={c.segunda}>{(s) => barrido('anidada', s(), (b) => cambiarConfig((x) => ({ ...(x as typeof c), segunda: b })), true)}</Show>
          </>
        )
      case 'ac':
        return (
          <>
            <Lista etiqueta="Entrada de CA" valor={c.fuente} opciones={fuentes()} onValor={(v) => cambiarConfig((x) => ({ ...(x as typeof c), fuente: v }))} desactivado={sinEditar()} pista={pistaDe('ac.fuente')} />
            <Campo etiqueta="Amplitud de la entrada" valor={c.magnitud} unidad="V" onValor={(v) => v !== undefined && cambiarConfig((x) => ({ ...(x as typeof c), magnitud: v }))} desactivado={sinEditar()} pista={pistaDe('ac.magnitud')} />
            <FilaConmutador rotulo="Barrido" pista={pistaDe('ac.barrido')}>
              <Conmutador
                nombre="Tipo de barrido de frecuencia"
                valor={c.barrido}
                desactivado={sinEditar()}
                onCambiar={(v) => cambiarConfig((x) => ({ ...(x as typeof c), barrido: v }))}
                opciones={[
                  { valor: 'dec', texto: 'Década' },
                  { valor: 'oct', texto: 'Octava' },
                  { valor: 'lin', texto: 'Lineal' }
                ]}
              />
            </FilaConmutador>
            <Campo etiqueta={c.barrido === 'lin' ? 'Puntos en total' : `Puntos por ${c.barrido === 'dec' ? 'década' : 'octava'}`} valor={c.puntos} unidad="" entero onValor={(v) => v !== undefined && cambiarConfig((x) => ({ ...(x as typeof c), puntos: v }))} desactivado={sinEditar()} pista={pistaDe('ac.puntos')} />
            <Campo etiqueta="Frecuencia inicial" valor={c.desde} unidad="Hz" onValor={(v) => v !== undefined && cambiarConfig((x) => ({ ...(x as typeof c), desde: v }))} desactivado={sinEditar()} pista={pistaDe('ac.desde')} />
            <Campo etiqueta="Frecuencia final" valor={c.hasta} unidad="Hz" onValor={(v) => v !== undefined && cambiarConfig((x) => ({ ...(x as typeof c), hasta: v }))} desactivado={sinEditar()} pista={pistaDe('ac.hasta')} />
            <CampoFrecuencias etiqueta="Incluir frecuencias" valor={c.incluir} onValor={(v) => cambiarConfig((x) => ({ ...(x as typeof c), incluir: v.length ? v : undefined }))} desactivado={sinEditar()} pista={pistaDe('ac.incluir')} />
          </>
        )
      case 'tran':
        return (
          <>
            <Campo etiqueta="Tiempo final" valor={c.fin} unidad="s" onValor={(v) => v !== undefined && cambiarConfig((x) => ({ ...(x as typeof c), fin: v }))} desactivado={sinEditar()} pista={pistaDe('tran.fin')} />
            <Campo
              etiqueta="Paso máximo"
              valor={c.maximo}
              unidad="s"
              opcional
              onValor={(v) => cambiarConfig((x) => ({ ...(x as typeof c), maximo: v }))}
              desactivado={sinEditar()}
              pista={pistaDe('tran.maximo')}
            />
            <Campo etiqueta="Guardar desde" valor={c.inicio} unidad="s" opcional onValor={(v) => cambiarConfig((x) => ({ ...(x as typeof c), inicio: v }))} desactivado={sinEditar()} pista={pistaDe('tran.inicio')} />
            <Casilla
              ajuste="Partir de cero"
              marcada={!!c.uic}
              desactivado={sinEditar()}
              texto="Partir de cero, sin calcular el reposo (condiciones iniciales)"
              pista={pistaDe('tran.uic')}
              onCambiar={(si) => cambiarConfig((x) => ({ ...(x as typeof c), uic: si || undefined }))}
            />
          </>
        )
      case 'fourier':
        return (
          <>
            <Campo etiqueta="Frecuencia fundamental" valor={c.fundamental} unidad="Hz" onValor={(v) => v !== undefined && cambiarConfig((x) => ({ ...(x as typeof c), fundamental: v }))} desactivado={sinEditar()} pista={pistaDe('fourier.fundamental')} />
            <Campo etiqueta="Armónicos" valor={c.armonicos} unidad="" entero pista={pistaDe('fourier.armonicos')} onValor={(v) => v !== undefined && cambiarConfig((x) => ({ ...(x as typeof c), armonicos: v }))} desactivado={sinEditar()} />
            <Campo etiqueta="Periodos analizados" valor={c.periodos} unidad="" entero pista={pistaDe('fourier.periodos')} onValor={(v) => v !== undefined && cambiarConfig((x) => ({ ...(x as typeof c), periodos: v }))} desactivado={sinEditar()} />
            <Campo etiqueta="Periodos que se dejan pasar" valor={c.descarte} unidad="" entero pista={pistaDe('fourier.descarte')} onValor={(v) => v !== undefined && cambiarConfig((x) => ({ ...(x as typeof c), descarte: v }))} desactivado={sinEditar()} />
            <Lista etiqueta="Ventana" valor={c.ventana} opciones={VENTANAS} onValor={(v) => cambiarConfig((x) => ({ ...(x as typeof c), ventana: v as VentanaFourier }))} desactivado={sinEditar()} pista={pistaDe('fourier.ventana')} />
          </>
        )
    }
  }

  const cuerpoParametro = (a: AnalisisDoc, p: ParametroBarrido): JSX.Element => {
    const piezas = () => (props.ctx?.barribles ?? []).map((b) => ({ valor: b.id, texto: `${b.ref} (${formatearValor(b.valor, b.unidad)})` }))
    const pieza = () => props.ctx?.barribles.find((b) => b.id === p.pieza)
    const unidad = () => pieza()?.unidad ?? ''
    const poner = (q: ParametroBarrido) => cambiar((x) => ({ ...x, parametro: q }))
    const modo = p.modo
    const rango = () => (p.modo === 'lista' ? null : p)
    return (
      <>
        <h4 class="sec">Pieza que se barre</h4>
        <Lista
          etiqueta="Pieza"
          valor={p.pieza}
          opciones={piezas()}
          desactivado={sinEditar()}
          pista={pistaDe('param.pieza')}
          onValor={(v) => {
            const b = props.ctx?.barribles.find((x) => x.id === v)
            if (b) poner(parametroInicial(b))
          }}
        />
        <FilaConmutador rotulo="Valores" pista={pistaDe('param.modo')}>
          <Conmutador
            nombre="Cómo se dan los valores del barrido"
            valor={modo}
            desactivado={sinEditar()}
            onCambiar={(m) => {
              const base = pieza()?.valor ?? 1
              if (m === 'lista') return poner({ pieza: p.pieza, modo: 'lista', valores: valoresDeParametro(p).slice(0, 8) })
              poner(m === 'log' && !(base > 0) ? { pieza: p.pieza, modo: 'lineal', desde: -1, hasta: 1, puntos: 5 } : { pieza: p.pieza, modo: m, desde: p.modo === 'lista' ? (base > 0 ? base / 2 : -1) : p.desde, hasta: p.modo === 'lista' ? (base > 0 ? base * 2 : 1) : p.hasta, puntos: p.modo === 'lista' ? 5 : p.puntos })
            }}
            opciones={[
              { valor: 'lineal', texto: 'Lineal' },
              { valor: 'log', texto: 'Logarítmico' },
              { valor: 'lista', texto: 'Lista' }
            ]}
          />
        </FilaConmutador>
        <Show
          when={rango()}
          fallback={
            <ListaDeValores
              unidad={unidad()}
              valores={p.modo === 'lista' ? p.valores : []}
              desactivado={sinEditar()}
              pista={pistaDe('param.valores')}
              onValores={(vs) => poner({ pieza: p.pieza, modo: 'lista', valores: vs })}
            />
          }
        >
          {(r) => (
            <>
              <Campo etiqueta="Valor inicial" valor={r().desde} unidad={unidad()} onValor={(v) => v !== undefined && poner({ ...r(), desde: v })} desactivado={sinEditar()} pista={pistaDe('param.desde')} />
              <Campo etiqueta="Valor final" valor={r().hasta} unidad={unidad()} onValor={(v) => v !== undefined && poner({ ...r(), hasta: v })} desactivado={sinEditar()} pista={pistaDe('param.hasta')} />
              <Campo etiqueta="Valores" valor={r().puntos} unidad="" entero onValor={(v) => v !== undefined && poner({ ...r(), puntos: v })} desactivado={sinEditar()} pista={pistaDe('param.puntos')} />
            </>
          )}
        </Show>
        <h4 class="sec">Análisis que se repite</h4>
        <Lista
          etiqueta="Análisis base"
          valor={a.config.tipo}
          desactivado={sinEditar()}
          pista={pistaDe('param.base')}
          opciones={BASES_DE_PARAMETRO.map((t) => ({ valor: t, texto: NOMBRE_FICHA[t] }))}
          onValor={(v) => {
            if (!props.ctx) return
            const r = conBase(a, v as (typeof BASES_DE_PARAMETRO)[number], props.ctx)
            if (!r.ok) return setError(r.error)
            cambiar(() => r.analisis)
          }}
        />
        {cuerpoBase(a)}
      </>
    )
  }

  // Las trazas elegidas aparte de las de omisión (redes con nombre y sondas); el punto de operación las muestra todas.
  const conTrazas = () => {
    const a = borrador()
    return !!a && (a.config.tipo !== 'op' || !!a.parametro)
  }
  // Las trazas extra se guardan con el análisis: redes por su nombre y piezas por id.
  const seleccion = () => seleccionDeGuardadas(borrador()?.trazas, props.ctx)
  const guardarSeleccion = (redes: ReadonlySet<number>, piezas: ReadonlySet<Id>) => {
    const ctx = props.ctx
    if (!ctx) return
    const t = guardadasDeSeleccion({ redes, piezas }, ctx)
    cambiar((a) => {
      const { trazas: _antes, ...resto } = a
      return t ? { ...resto, trazas: t } : resto
    })
  }
  const alternarRed = (nodo: number, si: boolean) => {
    const redes = new Set(seleccion().redes)
    if (si) redes.add(nodo)
    else redes.delete(nodo)
    guardarSeleccion(redes, seleccion().piezas)
  }
  const alternarPieza = (id: Id, si: boolean) => {
    const piezas = new Set(seleccion().piezas)
    if (si) piezas.add(id)
    else piezas.delete(id)
    guardarSeleccion(seleccion().redes, piezas)
  }

  // Lo que el análisis nombra y ya no existe, sin reemplazo posible: se dice junto al selector que hay que volver a elegir.
  const pendientes = () => {
    const a = borrador()
    return a && props.ctx ? reconciliarAnalisis(a, props.ctx).pendientes : []
  }
  const nombreId = `an-nombre-${createUniqueId()}`
  const mensajeEjecutar = () => (props.corriendo ? null : props.motivoNoEjecutar)
  return (
    <section class="ficha-analisis" aria-label={`Ficha: ${NOMBRE_FICHA[props.tipo]}`} data-ficha={props.tipo}>
      <header class="an-cabeza">
        <h3>{NOMBRE_FICHA[props.tipo]}</h3>
        <Show when={props.guardados.length > 0}>
          <label class="an-elegir">
            <span class="solo-lectores">Análisis guardado</span>
            <select class="campo" aria-label="Análisis guardado" value={props.elegido?.id} onChange={(e) => props.onElegir(e.currentTarget.value)}>
              <For each={props.guardados}>{(g) => <option value={g.id} selected={g.id === props.elegido?.id}>{g.nombre}</option>}</For>
            </select>
          </label>
        </Show>
      </header>
      {/* Ejecutar arriba: lo primero que se busca en la ficha. */}
      <div class="an-correr">
        <button type="button" class="boton boton-principal" aria-disabled={!!mensajeEjecutar() || props.corriendo || !props.elegido} disabled={props.corriendo || !props.elegido} onClick={() => !mensajeEjecutar() && props.onEjecutar()} aria-describedby="an-razon">
          Ejecutar
        </button>
        <Show
          when={props.corriendo}
          fallback={
            <button type="button" class="boton" onClick={() => props.onDescartar()}>
              Cancelar
            </button>
          }
        >
          <button type="button" class="boton" onClick={() => props.onDetener()}>
            Detener
          </button>
        </Show>
      </div>
      <p class="an-estado cifra" role="status">
        <Show when={props.corriendo} fallback={props.estadoCorrida ?? ''}>
          <span class="an-giro" aria-hidden="true" />
          Ejecutando
        </Show>
      </p>
      {/* La forma esperada del resultado y, debajo, qué mide: la ficha dice qué se va a ver antes de pedir ajustes. */}
      <div class="an-explica">
        <EjemploAnalisis tipo={props.tipo} />
        <dl>
          <dt>Qué mide</dt>
          <dd>{DESCRIPCION_FICHA[props.tipo].mide}</dd>
        </dl>
        <div class="an-gestion">
          <button type="button" class="boton" disabled={!props.editable || !props.ctx} aria-disabled={!props.editable || !props.ctx} onClick={() => setError(props.onNuevo())}>
            Nuevo
          </button>
          <Show when={props.elegido}>
            {(e) => (
              <button type="button" class="boton" disabled={!props.editable} onClick={() => props.onBorrar(e().id)}>
                Borrar
              </button>
            )}
          </Show>
        </div>
        <details class="an-veras">
          <summary>Qué verás</summary>
          <p>{DESCRIPCION_FICHA[props.tipo].veras}</p>
        </details>
      </div>
      <p id="an-razon" class="an-razon" classList={{ vacio: !mensajeEjecutar() }}>
        {mensajeEjecutar() ?? ''}
      </p>
      <Show when={!props.editable && props.motivoNoEditable}>
        <p class="nota-serie aviso an-aviso" role="status">
          {props.motivoNoEditable}
        </p>
      </Show>
      <Show when={props.errorCtx}>
        <p class="nota-serie aviso an-aviso" role="status">
          {props.errorCtx}
        </p>
      </Show>
      <Show
        when={borrador()}
        fallback={
          <p class="secundario an-vacio">
            Aún no hay ningún análisis de este tipo. Pulsa «Nuevo» para crear uno.
          </p>
        }
      >
        {(a) => (
          <div class="an-cuerpo">
            <div class="fld fld-an fld-nombre">
              <label for={nombreId}>Nombre</label>
              <input
                id={nombreId}
                class="campo"
                type="text"
                maxlength={80}
                value={a().nombre}
                disabled={sinEditar()}
                onChange={(e) => cambiar((x) => ({ ...x, nombre: e.currentTarget.value.trim() || x.nombre }))}
              />
            </div>
            <Show when={pendientes().length > 0}>
              <For each={pendientes()}>
                {(m) => (
                  <p class="fld-error an-error" role="alert">
                    {m}
                  </p>
                )}
              </For>
            </Show>
            <Show when={a().parametro} fallback={cuerpoBase(a())}>
              {(p) => cuerpoParametro(a(), p())}
            </Show>
            <Show when={conTrazas() && props.ctx}>
              {(c) => (
                <details class="mas-ajustes an-trazas">
                  <summary>Qué se grafica</summary>
                  <p class="deriv">Salen por omisión las redes con nombre (menos los rieles de alimentación) y las sondas de los instrumentos. Agrega cualquier otra red o la corriente de una pieza.</p>
                  <div class="an-trazas-listas">
                    <fieldset>
                      <legend>Voltaje de una red</legend>
                      <For each={c().redes}>
                        {(r) => (
                          <label class="casilla">
                            <input type="checkbox" checked={salePorOmision(r) || seleccion().redes.has(r.nodo)} disabled={salePorOmision(r) || sinEditar()} onChange={(e) => alternarRed(r.nodo, e.currentTarget.checked)} />
                            {r.nombre}
                            <Show when={salePorOmision(r)}>
                              <span class="deriv"> · por omisión</span>
                            </Show>
                          </label>
                        )}
                      </For>
                    </fieldset>
                    <fieldset>
                      <legend>Corriente de una pieza</legend>
                      <For each={c().corrientes}>
                        {(k) => (
                          <label class="casilla">
                            <input type="checkbox" checked={seleccion().piezas.has(k.pieza)} onChange={(e) => alternarPieza(k.pieza, e.currentTarget.checked)} />
                            {k.ref}
                          </label>
                        )}
                      </For>
                    </fieldset>
                  </div>
                </details>
              )}
            </Show>
          </div>
        )}
      </Show>
      <Show when={error() ?? props.errorCorrida}>
        {(e) => (
          <p class="fld-error an-error" role="alert">
            {e()}
          </p>
        )}
      </Show>
    </section>
  )
}

/** La lista de valores de un barrido: números separados por coma o espacio, con la unidad de la pieza. */
function ListaDeValores(props: { unidad: string; valores: readonly number[]; desactivado?: boolean; onValores(v: number[]): void; pista?: string }) {
  const id = `an-${createUniqueId()}`
  const pista = usarPista(props.pista)
  const [error, setError] = createSignal<string | null>(null)
  const texto = () => props.valores.map((v) => textoDeNumero(v, 6)).join(', ')
  const aplicar = (t: string) => {
    const partes = t.split(/[,;\s]+/).filter(Boolean)
    if (partes.length === 0) return setError('Escribe al menos un valor.')
    const vs: number[] = []
    for (const p of partes) {
      const v = leerValor(p)
      if (!v || (v.unidad && v.unidad !== props.unidad)) return setError(`«${p}» no es un valor válido${props.unidad ? ` en ${props.unidad}` : ''}.`)
      vs.push(v.valor)
    }
    setError(null)
    props.onValores(vs)
  }
  return (
    <div class="fld fld-an fld-lista-valores">
      <span class="fld-rotulo">
        <label for={id}>Valores ({props.unidad || 'unidades SI'})</label>
        <PistaBoton pista={pista} ajuste="Valores del barrido" />
      </span>
      <input id={id} class="campo cifra" type="text" value={texto()} disabled={props.desactivado} aria-invalid={error() ? 'true' : undefined} onChange={(e) => aplicar(e.currentTarget.value)} placeholder="1k, 2.2k, 4.7k" />
      <PistaTexto pista={pista} />
      <Show when={error()}>
        <p class="fld-error" role="alert">
          {error()}
        </p>
      </Show>
    </div>
  )
}
