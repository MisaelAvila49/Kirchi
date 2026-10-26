import { createEffect, createMemo, createSignal, For, onCleanup, Show, type JSX } from 'solid-js'
import { ESCALAS_PNG, type FondoExportar, type FormatoFigura, type OpcionesExportar, type Tema } from '../../../compartido/ajustes'
import { PAGINAS, type FormatoExportar, type TipoPagina } from '../../../compartido/archivos'
import { MM_POR_UNIDAD } from '../doc/tipos'
import { NOMBRE_FORMATO } from '../exportar/exportar'
import { tamañoPng } from '../exportar/png'
import { cajaDeArea, type AlcanceExportar, type AreaMm } from '../exportar/seleccion'
import { TEXTO_SIN_LECTURA, type PuntoLeido } from '../exportar/lecturaEsquema'
import { cajaLamina } from '../exportar/svg'
import Dialogo from './Dialogo'
import BotonesTema from './exportar/BotonesTema'
import { IconoDeshacer, IconoRehacer } from './iconos'
import Bloque from './exportar/Bloque'
import { CampoFormato } from './exportar/campos'
import { cerrarGesto, confirmar, crearHistorial, deshacer, puedeDeshacer, puedeRehacer, rehacer, type Historial } from './exportar/editor/historial'
import { Deslizador, Interruptor } from './exportar/editor/controles'
import { BarraNota, MAGNITUDES, PanelNota } from './exportar/marco/ControlesNotas'
import {
  borrarNota,
  cajaDeNotas,
  crearFlecha,
  crearLectura,
  crearLlamada,
  crearResalte,
  crearTexto,
  editarNota,
  fantasmaDe,
  fueraDelAreaNota,
  ID_FANTASMA,
  MAX_NOTAS,
  moverAsa,
  moverNota,
  svgDeNotas,
  type ContextoNotas,
  type HerramientaEsquema,
  type MagnitudLectura,
  type NotaLectura,
  type Notas,
  type Parche
} from './exportar/marco/notasEsquema'
import VistaImagen, { type Recuadro } from './exportar/marco/VistaImagen'
import { IconoEtiqueta, IconoFlecha, IconoLlamada, IconoResalte, IconoSeleccionar, IconoTexto } from './exportar/editor/iconosEditor'
import { Pastillas } from './exportar/editor/controles'
import { NOMBRE_PREAJUSTE_ESQUEMA, opcionesDePreajusteEsquema, preajusteEsquemaDe, PREAJUSTES_ESQUEMA, type PreajusteEsquema } from './exportar/preajustes'
import SelectorEstilo from './exportar/SelectorEstilo'

/** La vista previa del esquema: el SVG con sus textos, si el fondo es transparente (se ve sobre un damero) y dónde cae su esquina en el mundo. */
export interface VistaEsquema {
  svg: string
  anchoMm: number
  altoMm: number
  transparente: boolean
  /** La esquina de arriba a la izquierda de la lámina, en mm del mundo (para colocar el recuadro del área). */
  origenXMm: number
  origenYMm: number
}

/** Lo que el diálogo necesita del circuito para las etiquetas de lectura: qué hay bajo un clic y qué dice la lectura de la vista previa. Todo en mm del mundo. */
export interface LecturaEsquema {
  objetivoEn(x: number, y: number, tol: number, magnitud: MagnitudLectura): { x: number; y: number; cable: string | null; pin: string | null } | null
  texto(n: PuntoLeido): string
  /** Bajo la cifra: «punto de operación» (vista previa detenida) o «t = 1.23 ms». */
  nota?(n: PuntoLeido): string | undefined
}

interface Props {
  formato: FormatoExportar
  onFormato(f: FormatoExportar): void
  /** Lo guardado la última vez: el diálogo parte de ello y avisa de cada cambio con `onCambiar`. */
  opciones: OpcionesExportar
  tema: Tema
  alcance: AlcanceExportar
  onAlcance(a: AlcanceExportar): void
  /** Sin selección, «Selección» no se puede elegir. */
  haySeleccion: boolean
  /** El área elegida (vive en la sesión) y el dibujo completo en mm, de donde parte un área nueva. */
  area: AreaMm | null
  dibujoMm: AreaMm
  onArea(a: AreaMm): void
  onCambiar(parche: Partial<OpcionesExportar>): void
  onExportar(): void
  onCerrar(): void
  /** El circuito tiene instrumentos o medidores rápidos: se ofrecen sus casillas. */
  hayInstrumentos?: boolean
  hayMedidores?: boolean
  /** La vista previa corre: solo entonces valen los colores de voltaje. */
  simulando?: boolean
  /** Arma la vista previa con las opciones de ahora; sin ella el diálogo no la muestra. */
  vista?: () => Promise<VistaEsquema | null>
  /** Las anotaciones cambiaron (incluye deshacer y rehacer): la aplicación las lleva al archivo que se exporta. Nunca van al `.kir`. */
  onNotas?(n: Notas): void
  /** Para las etiquetas de lectura; sin ella la herramienta avisa que no hay circuito que leer. */
  lectura?: LecturaEsquema
  /** Las anotaciones y la magnitud de la última vez que se abrió el diálogo en esta sesión. */
  notasIniciales?: Notas
  magnitudInicial?: MagnitudLectura
  onMagnitud?(m: MagnitudLectura): void
}

interface Estado {
  o: OpcionesExportar
  alcance: AlcanceExportar
  area: AreaMm | null
  /** Las anotaciones: solo viven en la imagen. Entran al historial, así que deshacer y rehacer las cubren. */
  notas: Notas
}

const HERRAMIENTAS: readonly { id: HerramientaEsquema; nombre: string; tecla: string; icono: () => JSX.Element; ayuda: string }[] = [
  { id: 'seleccionar', nombre: 'Seleccionar', tecla: 'V', icono: () => <IconoSeleccionar />, ayuda: 'Elige, mueve y estira lo anotado' },
  { id: 'texto', nombre: 'Texto', tecla: 'T', icono: () => <IconoTexto />, ayuda: 'Haz clic en la imagen para escribir un texto' },
  { id: 'flecha', nombre: 'Flecha', tecla: 'F', icono: () => <IconoFlecha />, ayuda: 'Arrastra sobre la imagen para dibujar una flecha' },
  { id: 'resalte', nombre: 'Resalte', tecla: 'R', icono: () => <IconoResalte />, ayuda: 'Arrastra para marcar una zona con un recuadro o un círculo' },
  { id: 'llamada', nombre: 'Llamada numerada', tecla: 'N', icono: () => <IconoLlamada />, ayuda: 'Haz clic para poner un círculo con el número que sigue' },
  { id: 'lectura', nombre: 'Etiqueta de lectura', tecla: 'E', icono: () => <IconoEtiqueta />, ayuda: 'Haz clic en un cable o en un pin para anotar su voltaje o su corriente' }
]

const NOMBRE_FONDO: Record<FondoExportar, string> = { papel: 'Tema claro', blanco: 'Blanco', transparente: 'Transparente', oscuro: 'Tema oscuro' }
const NOMBRE_PAGINA: Record<TipoPagina, string> = { ajustar: 'Del dibujo', a4: 'A4', carta: 'Carta' }
const NOMBRE_ALCANCE: Record<AlcanceExportar, string> = { todo: 'Todo', seleccion: 'Selección', area: 'Área' }
const FORMATOS: readonly FormatoFigura[] = ['png', 'svg', 'pdf']
const PX_POR_MM = 96 / 25.4
/** Espera tras el último cambio antes de rehacer la vista (las fuentes y la escena cuestan unos milisegundos). */
export const MS_VISTA_ESQUEMA = 150
const miles = (n: number) => n.toLocaleString('en-US')
const mm = (v: number) => `${Math.round(v)} mm`
const esCampo = (t: EventTarget | null) => (t instanceof HTMLInputElement ? t.type !== 'range' && t.type !== 'checkbox' && t.type !== 'radio' : t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement)

/** Un área nueva: el 60 % central del dibujo. */
export const areaInicial = (d: AreaMm): AreaMm => ({ x: d.x + d.ancho * 0.2, y: d.y + d.alto * 0.2, ancho: d.ancho * 0.6, alto: d.alto * 0.6 })

/**
 * Exportar el esquema en el marco del editor de gráficas. Las herramientas de anotación solo viven en la imagen exportada, nunca en el `.kir`.
 */
export default function DialogoExportar(props: Props) {
  const [h, setH] = createSignal<Historial<Estado>>(crearHistorial({ o: props.opciones, alcance: props.alcance, area: props.area, notas: props.notasIniciales ?? [] }))
  const e = () => h().presente
  const o = () => e().o
  const aplicar = (n: Estado, clave: string | null = null) => setH((x) => confirmar(x, n, clave))
  const cambiar = (parche: Partial<OpcionesExportar>, clave?: string) => {
    aplicar({ ...e(), o: { ...e().o, ...parche } }, clave ?? null)
    props.onCambiar(parche)
  }
  const elegirAlcance = (a: AlcanceExportar) => {
    const previa = e().area
    const area = a === 'area' && !previa ? areaInicial(props.dibujoMm) : previa
    aplicar({ ...e(), alcance: a, area })
    props.onAlcance(a)
    if (area && area !== previa) props.onArea(area)
  }
  const cambiarArea = (a: AreaMm, clave: string) => {
    aplicar({ ...e(), area: a }, clave)
    props.onArea(a)
  }
  /** Lleva a la aplicación lo que dice el estado al que se volvió. */
  const aplicarEstado = (n: Estado) => {
    props.onCambiar(n.o)
    props.onAlcance(n.alcance)
    if (n.area) props.onArea(n.area)
    props.onNotas?.(n.notas)
  }
  const deshacerTodo = () => {
    setH((x) => deshacer(x))
    aplicarEstado(e())
  }
  const rehacerTodo = () => {
    setH((x) => rehacer(x))
    aplicarEstado(e())
  }
  const elegirPreajuste = (n: PreajusteEsquema) => cambiar({ ...opcionesDePreajusteEsquema(n, props.tema) })

  // ---------- Anotaciones (solo para la imagen) ----------
  const [herramienta, setHerramienta] = createSignal<HerramientaEsquema>('seleccionar')
  const [sel, setSel] = createSignal<string | null>(null)
  const [enfocarTexto, setEnfocarTexto] = createSignal(0)
  const [magnitud, setMagnitud] = createSignal<MagnitudLectura>(props.magnitudInicial ?? 'voltaje')
  const [aviso, setAviso] = createSignal('')
  const notas = () => e().notas
  const temaLamina = () => (o().fondo === 'oscuro' ? ('oscuro' as const) : ('claro' as const))
  const ctxNotas: ContextoNotas = {
    texto: (n: NotaLectura) => props.lectura?.texto({ x: n.x, y: n.y, magnitud: n.magnitud, cable: n.cable, pin: n.pin }) ?? TEXTO_SIN_LECTURA,
    nota: (n: NotaLectura) => props.lectura?.nota?.({ x: n.x, y: n.y, magnitud: n.magnitud, cable: n.cable, pin: n.pin })
  }
  const elegirMagnitud = (m: MagnitudLectura) => {
    setMagnitud(m)
    props.onMagnitud?.(m)
  }
  // El fantasma de la herramienta: lo que se pondría con un clic ahora, siguiendo al puntero.
  const [puntero, setPuntero] = createSignal<{ x: number; y: number } | null>(null)
  const [inicioGesto, setInicioGesto] = createSignal<{ x: number; y: number } | null>(null)
  const objetivoLectura = createMemo(() => {
    const pos = puntero()
    return herramienta() === 'lectura' && pos ? (props.lectura?.objetivoEn(pos.x, pos.y, 3, magnitud()) ?? null) : null
  })
  const fantasma = createMemo(() => {
    const pos = puntero()
    const h = herramienta()
    const objetivo = objetivoLectura()
    return fantasmaDe({ herramienta: h, lista: notas(), pos, inicio: inicioGesto(), magnitud: magnitud(), objetivo })
  })
  const svgFantasma = createMemo(() => {
    const f = fantasma()
    if (!f) return ''
    const ctxF: ContextoNotas = {
      texto: (n) => (n.id === ID_FANTASMA ? textoFantasma(n) : ctxNotas.texto(n)),
      nota: (n) => (n.id === ID_FANTASMA && !n.cable && !n.pin ? undefined : ctxNotas.nota?.(n))
    }
    return svgDeNotas([...notas(), f], { tema: temaLamina(), ctx: ctxF, solo: ID_FANTASMA })
  })
  const textoFantasma = (n: NotaLectura) => (n.cable || n.pin ? (props.lectura?.texto({ x: n.x, y: n.y, magnitud: n.magnitud, cable: n.cable, pin: n.pin }) ?? TEXTO_SIN_LECTURA) : TEXTO_SIN_LECTURA)
  const svgNotas = createMemo(() => svgDeNotas(notas(), { tema: temaLamina(), ctx: ctxNotas }))
  const notaElegida = createMemo(() => notas().find((n) => n.id === sel()) ?? null)
  // Tras deshacer, una nota elegida que ya no existe se suelta.
  createEffect(() => {
    if (sel() && !notaElegida()) setSel(null)
  })
  const ponerNotas = (n: Notas, clave: string | null = null) => {
    aplicar({ ...e(), notas: n }, clave)
    props.onNotas?.(n)
  }
  const alAgregar = (r: { notas: Notas; id: string } | null, tipo: HerramientaEsquema) => {
    if (!r) return setAviso(`Ya hay ${MAX_NOTAS} anotaciones: borra alguna para poner otra.`)
    setH((x) => confirmar(cerrarGesto(x), { ...e(), notas: r.notas }, null))
    props.onNotas?.(r.notas)
    setAviso('')
    // Lo recién puesto queda elegido, con su barra, y la herramienta vuelve a Seleccionar.
    setSel(r.id)
    setHerramienta('seleccionar')
    setPuntero(null)
    setInicioGesto(null)
    if (tipo === 'texto') setEnfocarTexto((n) => n + 1)
  }
  const editarNotaDlg = (id: string, parche: Parche, clave?: string) => {
    const n = notas().find((q) => q.id === id)
    // Cambiar lo que mide una etiqueta la vuelve a apuntar en su mismo punto (el cable que mide corriente no es el pin que mide voltaje).
    const nueva = parche.magnitud
    if (n?.tipo === 'lectura' && nueva && nueva !== n.magnitud) {
      const t = props.lectura?.objetivoEn(n.x, n.y, 3, nueva)
      if (t) parche = { ...parche, x: t.x, y: t.y, cable: t.cable, pin: t.pin }
      elegirMagnitud(nueva)
    }
    ponerNotas(editarNota(notas(), id, parche), clave ?? null)
  }
  const moverAsaDlg = (id: string, asa: string, x: number, y: number) => {
    const n = notas().find((q) => q.id === id)
    if (n?.tipo === 'lectura' && asa === 'punto') {
      const t = props.lectura?.objetivoEn(x, y, 3, n.magnitud)
      if (t) ponerNotas(editarNota(notas(), id, { x: t.x, y: t.y, cable: t.cable, pin: t.pin }), `asa:${id}:punto`)
      return
    }
    ponerNotas(moverAsa(notas(), id, asa, x, y), `asa:${id}:${asa}`)
  }
  const borrarElegida = () => {
    const id = sel()
    if (!id) return
    ponerNotas(borrarNota(notas(), id))
    setSel(null)
  }
  const elegirHerramienta = (t: HerramientaEsquema) => {
    setHerramienta(t)
    setAviso('')
    if (t !== 'seleccionar') setSel(null)
  }
  const alLeer = (x: number, y: number, tol: number) => {
    const t = props.lectura?.objetivoEn(x, y, tol, magnitud())
    if (!t) return setAviso(magnitud() === 'corriente' ? 'Haz clic dentro de un tramo de cable para anotar su corriente.' : 'Haz clic sobre un cable o un pin para anotar su voltaje.')
    alAgregar(crearLectura(notas(), { ...t, magnitud: magnitud() }), 'lectura')
  }
  /** La caja del área con las anotaciones que tocan algo de ella: la lámina que saldrá con «Área». */
  const laminaDeArea = (a: AreaMm) => {
    const dibujo = cajaDeArea(a)
    const extra = cajaDeNotas(notas(), ctxNotas, dibujo)
    const caja = extra ? { minX: Math.min(dibujo.minX, extra.minX), minY: Math.min(dibujo.minY, extra.minY), maxX: Math.max(dibujo.maxX, extra.maxX), maxY: Math.max(dibujo.maxY, extra.maxY) } : dibujo
    return cajaLamina(caja, o().margenMm / MM_POR_UNIDAD)
  }
  /** La caja de la lámina que saldrá, en mm del mundo: lo que quede fuera no entra a la imagen. */
  const laminaMm = () => {
    const a = e().area
    if (e().alcance === 'area' && a) {
      const l = laminaDeArea(a).caja
      return { x: l.minX * MM_POR_UNIDAD, y: l.minY * MM_POR_UNIDAD, w: (l.maxX - l.minX) * MM_POR_UNIDAD, h: (l.maxY - l.minY) * MM_POR_UNIDAD }
    }
    const v = vista()
    return v ? { x: v.origenXMm, y: v.origenYMm, w: v.anchoMm, h: v.altoMm } : null
  }
  const fueraDeLaImagen = () => {
    const l = laminaMm()
    return l ? notas().filter((n) => fueraDelAreaNota(n, l, ctxNotas)).length : 0
  }
  const ayudaHerramienta = () => HERRAMIENTAS.find((t) => t.id === herramienta())!.ayuda

  const fondos = () => (props.formato === 'pdf' ? (['blanco', 'papel', 'oscuro'] as FondoExportar[]) : (['blanco', 'transparente', 'papel', 'oscuro'] as FondoExportar[]))

  // Con «Área» la vista es el dibujo entero, igual que con «Todo»: cambiar entre los dos no la rehace.
  const alcanceVista = createMemo(() => (e().alcance === 'area' ? 'todo' : e().alcance))

  const opcionesVista = createMemo(() => e().o)
  // Las anotaciones que salen del dibujo agrandan la lámina: la vista se rehace solo cuando cambia esa caja, no en cada arrastre dentro del dibujo.
  const cajaNotasVista = createMemo(() => cajaDeNotas(notas(), ctxNotas), null, { equals: (a, b) => (a === b || (!!a && !!b && a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY)) })
  // Un booleano estable: la lectura de la vista previa cambia en cada paso y, leída aquí sin más, rehacía (y cancelaba) la vista sin parar.
  const simulandoVista = createMemo(() => !!props.simulando)

  // La vista: un SVG en una imagen. Se pide tras una pausa corta y solo vale la última petición.
  const [url, setUrl] = createSignal<string | null>(null)
  const [vista, setVista] = createSignal<VistaEsquema | null>(null)
  const [estado, setEstado] = createSignal<'cargando' | 'lista' | 'vacia' | 'error'>('cargando')
  let pedido = 0
  const soltar = () => {
    const u = url()
    if (u) URL.revokeObjectURL(u)
  }
  createEffect(() => {
    // Lo que cambia la vista: el formato, el alcance (con «Área» se ve el dibujo entero) y cada opción que el dibujo usa.
    void [props.formato, alcanceVista(), opcionesVista(), props.tema, simulandoVista(), cajaNotasVista()]
    const crear = props.vista
    if (!crear) return
    const n = ++pedido
    setEstado('cargando')
    const t = setTimeout(async () => {
      try {
        const v = await crear()
        if (n !== pedido) return
        soltar()
        if (!v) {
          setUrl(null)
          setVista(null)
          setEstado('vacia')
          return
        }
        setUrl(URL.createObjectURL(new Blob([v.svg], { type: 'image/svg+xml' })))
        setVista(v)
        setEstado('lista')
      } catch {
        if (n === pedido) setEstado('error')
      }
    }, MS_VISTA_ESQUEMA)
    onCleanup(() => clearTimeout(t))
  })
  onCleanup(() => {
    pedido++
    soltar()
  })

  // El tamaño de lo que saldrá: con un área, el de su caja más el margen; si no, el de la lámina de la vista.
  const tamaño = createMemo(() => {
    const a = e().area
    if (e().alcance === 'area' && a) {
      const l = laminaDeArea(a)
      return { anchoMm: l.anchoMm, altoMm: l.altoMm }
    }
    const v = vista()
    return v ? { anchoMm: v.anchoMm, altoMm: v.altoMm } : null
  })
  const pie = () => {
    const t = tamaño()
    if (!t) return '…'
    if (props.formato === 'png') {
      const p = tamañoPng(t.anchoMm, t.altoMm, o().escala)
      return `${miles(p.ancho)} × ${miles(p.alto)} px${p.reducida ? ' (reducida al máximo)' : ''}`
    }
    return `${mm(t.anchoMm)} × ${mm(t.altoMm)}`
  }

  // El recuadro del área, en px de la figura de la vista (la lámina entera, que en este alcance es el dibujo).
  const recuadro = (): Recuadro | null => {
    const a = e().area
    const v = vista()
    if (e().alcance !== 'area' || !a || !v) return null
    return { x: (a.x - v.origenXMm) * PX_POR_MM, y: (a.y - v.origenYMm) * PX_POR_MM, w: a.ancho * PX_POR_MM, h: a.alto * PX_POR_MM }
  }
  const alRecuadro = (r: Recuadro, fin: boolean) => {
    const v = vista()
    if (!v) return
    cambiarArea({ x: r.x / PX_POR_MM + v.origenXMm, y: r.y / PX_POR_MM + v.origenYMm, ancho: r.w / PX_POR_MM, alto: r.h / PX_POR_MM }, 'area')
    if (fin) setH((x) => cerrarGesto(x))
  }
  const campoArea = (rotulo: string, campo: keyof AreaMm) => (
    <label class="editor-campo editor-numero">
      <span class="editor-rotulo">{rotulo}</span>
      <input
        type="number"
        class="campo"
        step="1"
        min={campo === 'ancho' || campo === 'alto' ? 1 : undefined}
        value={Math.round((e().area?.[campo] ?? 0) * 10) / 10}
        aria-label={`${rotulo} del área, en milímetros`}
        onChange={(ev) => {
          const a = e().area
          const n = Number(ev.currentTarget.value)
          if (!a || !Number.isFinite(n)) return
          cambiarArea({ ...a, [campo]: campo === 'ancho' || campo === 'alto' ? Math.max(1, n) : n }, `area:${campo}`)
          setH((x) => cerrarGesto(x))
        }}
      />
      <span class="secundario">mm</span>
    </label>
  )

  const tecla = (ev: KeyboardEvent) => {
    const ctrl = ev.ctrlKey || ev.metaKey
    const k = ev.key
    if (ctrl) {
      if (esCampo(ev.target)) return
      const z = k.toLowerCase()
      if (z === 'z') {
        ev.preventDefault()
        if (ev.shiftKey) rehacerTodo()
        else deshacerTodo()
      } else if (z === 'y') {
        ev.preventDefault()
        rehacerTodo()
      }
      return
    }
    if (k === 'Escape') {
      if (herramienta() !== 'seleccionar') {
        ev.preventDefault()
        ev.stopPropagation()
        return setHerramienta('seleccionar')
      }
      if (sel()) {
        ev.preventDefault()
        ev.stopPropagation()
        return setSel(null)
      }
      return
    }
    if (esCampo(ev.target) || ev.altKey) return
    const id = sel()
    if ((k === 'Delete' || k === 'Backspace') && id) {
      ev.preventDefault()
      return borrarElegida()
    }
    if (id && (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') && !(ev.target instanceof HTMLButtonElement)) {
      ev.preventDefault()
      const paso = ev.shiftKey ? 5 : 1
      const dx = k === 'ArrowLeft' ? -paso : k === 'ArrowRight' ? paso : 0
      const dy = k === 'ArrowUp' ? -paso : k === 'ArrowDown' ? paso : 0
      return ponerNotas(moverNota(notas(), id, dx, dy), `mover:${id}`)
    }
    if (ev.target instanceof HTMLButtonElement || ev.target instanceof HTMLSelectElement) return
    const t = HERRAMIENTAS.find((q) => q.tecla.toLowerCase() === k.toLowerCase())
    if (t) {
      ev.preventDefault()
      elegirHerramienta(t.id)
    }
  }

  const cabeza = (
    <>
      <SelectorEstilo<PreajusteEsquema>
        elegido={preajusteEsquemaDe(o())}
        onElegir={elegirPreajuste}
        opciones={PREAJUSTES_ESQUEMA.map((n) => [n, NOMBRE_PREAJUSTE_ESQUEMA[n]] as const)}
        rotulo="Preajuste"
        nombreAccesible="Preajuste del dibujo exportado"
      />
      <div class="editor-historial" role="group" aria-label="Deshacer y rehacer">
        <button type="button" class="boton-icono" aria-label="Deshacer" title="Deshacer (Ctrl+Z)" disabled={!puedeDeshacer(h())} onClick={deshacerTodo}>
          <IconoDeshacer />
        </button>
        <button type="button" class="boton-icono" aria-label="Rehacer" title="Rehacer (Ctrl+Y)" disabled={!puedeRehacer(h())} onClick={rehacerTodo}>
          <IconoRehacer />
        </button>
      </div>
    </>
  )

  return (
    <Dialogo titulo={`Exportar como ${NOMBRE_FORMATO[props.formato]}`} clase="exportar-editor exportar-esquema" onCerrar={props.onCerrar} cabeza={cabeza}>
      <div class="editor" on:keydown={tecla} onPointerUp={() => setH((x) => cerrarGesto(x))}>
        <div class="editor-cuerpo">
          <div class="editor-herramientas" role="toolbar" aria-orientation="vertical" aria-label="Herramientas de anotación">
            <For each={HERRAMIENTAS}>
              {(t) => (
                <button type="button" class="boton-icono editor-herramienta" aria-pressed={herramienta() === t.id} aria-label={`${t.nombre} (${t.tecla})`} title={`${t.nombre} (${t.tecla}). ${t.ayuda}.`} onClick={() => elegirHerramienta(t.id)}>
                  {t.icono()}
                </button>
              )}
            </For>
          </div>
          <div class="editor-centro">
            <p class="editor-pista" role="status">
              {herramienta() !== 'seleccionar'
                ? `${ayudaHerramienta()}.`
                : e().alcance === 'area'
                  ? 'Arrastra las esquinas del recuadro, o dibuja otro sobre un espacio vacío.'
                  : 'Rueda para acercar. Arrastra el fondo para mover.'}
            </p>
            <VistaImagen
              url={url()}
              ancho={(vista()?.anchoMm ?? 100) * PX_POR_MM}
              alto={(vista()?.altoMm ?? 60) * PX_POR_MM}
              transparente={!!vista()?.transparente}
              mensaje={estado() === 'vacia' ? 'No hay nada que exportar.' : estado() === 'error' ? 'No se pudo armar la vista previa.' : 'Armando la vista…'}
              recuadro={recuadro()}
              hojaOscura={o().fondo === 'oscuro'}
              medidaArea={e().alcance === 'area' && tamaño() ? `${mm(tamaño()!.anchoMm)} × ${mm(tamaño()!.altoMm)}` : undefined}
              onRecuadro={alRecuadro}
              edicion={{
                herramienta: herramienta(),
                lista: notas(),
                sel: sel(),
                ctx: ctxNotas,
                svg: svgNotas(),
                origenXMm: vista()?.origenXMm ?? 0,
                origenYMm: vista()?.origenYMm ?? 0,
                onSel: setSel,
                onTexto: (x, y) => alAgregar(crearTexto(notas(), x, y), 'texto'),
                onFlecha: (x1, y1, x2, y2) => alAgregar(crearFlecha(notas(), x1, y1, x2, y2), 'flecha'),
                onResalte: (x, y, w, h) => alAgregar(crearResalte(notas(), x, y, w, h, 'rectangulo'), 'resalte'),
                onLlamada: (x, y) => alAgregar(crearLlamada(notas(), x, y), 'llamada'),
                onLectura: alLeer,
                onMover: (id, dx, dy) => ponerNotas(moverNota(notas(), id, dx, dy), `mover:${id}`),
                onAsa: moverAsaDlg,
                onPuntero: (p, i) => (setPuntero(p), setInicioGesto(i)),
                fantasma: svgFantasma(),
                objetivo: objetivoLectura(),
                onFinGesto: () => setH((x) => cerrarGesto(x)),
                onEditarTexto: (id) => (setSel(id), setEnfocarTexto((n) => n + 1)),
                barra: () => <Show when={notaElegida()}>{(n) => <BarraNota nota={n()} editar={editarNotaDlg} onBorrar={borrarElegida} />}</Show>
              }}
            />
          </div>
          <div class="editor-panel">
            <div class="editor-propiedades">
              <Bloque titulo="Anotaciones" resumen={notas().length ? `${notas().length}` : undefined} abierto>
                <Show
                  when={notaElegida()}
                  fallback={
                    <>
                      <p class="editor-nota">{herramienta() === 'seleccionar' ? 'Elige una herramienta de la columna de la izquierda para anotar la imagen. Las anotaciones no se guardan en el circuito.' : `${ayudaHerramienta()}.`}</p>
                      <Show when={herramienta() === 'lectura'}>
                        <div class="editor-campo">
                          <span class="editor-rotulo">Mide</span>
                          <Pastillas<MagnitudLectura> nombre="Qué mide la etiqueta" valor={magnitud()} opciones={MAGNITUDES} onCambiar={elegirMagnitud} />
                        </div>
                      </Show>
                    </>
                  }
                >
                  {(n) => <PanelNota nota={n()} lista={notas()} editar={editarNotaDlg} onBorrar={borrarElegida} enfocarTexto={enfocarTexto()} />}
                </Show>
                <Show when={fueraDeLaImagen() > 0}>
                  <p class="editor-nota" role="status">
                    {fueraDeLaImagen() === 1 ? 'Una anotación queda fuera de la imagen y no saldrá.' : `${fueraDeLaImagen()} anotaciones quedan fuera de la imagen y no saldrán.`}
                  </p>
                </Show>
                <Show when={aviso()}>
                  <p class="editor-nota" role="status">
                    {aviso()}
                  </p>
                </Show>
              </Bloque>
              <Bloque titulo="Qué se exporta" resumen={NOMBRE_ALCANCE[e().alcance]} abierto>
                <div class="editor-pastillas" role="radiogroup" aria-label="Qué se exporta">
                  <For each={['todo', 'seleccion', 'area'] as const}>
                    {(a) => (
                      <label class="asp-pastilla" classList={{ deshabilitada: a === 'seleccion' && !props.haySeleccion }}>
                        <input
                          type="radio"
                          name="alcance"
                          checked={e().alcance === a}
                          disabled={a === 'seleccion' && !props.haySeleccion}
                          aria-describedby={a === 'seleccion' && !props.haySeleccion ? 'alcance-ayuda' : undefined}
                          onChange={() => elegirAlcance(a)}
                        />
                        <span>{NOMBRE_ALCANCE[a]}</span>
                      </label>
                    )}
                  </For>
                </div>
                <Show when={!props.haySeleccion}>
                  <p id="alcance-ayuda" class="editor-nota">
                    Selecciona algo en el lienzo para poder exportar solo eso.
                  </p>
                </Show>
                <Show when={e().alcance === 'area' && e().area}>
                  {campoArea('Izquierda', 'x')}
                  {campoArea('Arriba', 'y')}
                  {campoArea('Ancho', 'ancho')}
                  {campoArea('Alto', 'alto')}
                </Show>
              </Bloque>
              <Bloque titulo="Fondo" resumen={NOMBRE_FONDO[o().fondo]} abierto>
                <div class="editor-pastillas fondo-fijo" role="radiogroup" aria-label="Fondo">
                  <For each={fondos().filter((f) => f === 'blanco' || f === 'transparente')}>
                    {(f) => (
                      <label class="asp-pastilla">
                        <input type="radio" name="fondo" checked={o().fondo === f} onChange={() => cambiar({ fondo: f })} />
                        <span>{NOMBRE_FONDO[f]}</span>
                      </label>
                    )}
                  </For>
                </div>
                <BotonesTema valor={o().fondo === 'papel' ? 'claro' : o().fondo === 'oscuro' ? 'oscuro' : null} onCambiar={(t) => cambiar({ fondo: t === 'oscuro' ? 'oscuro' : 'papel' })} />
                <Interruptor rotulo="Mostrar la rejilla" activo={o().rejilla} onCambiar={(v) => cambiar({ rejilla: v })} />
                <Interruptor rotulo="Cables en tinta negra" activo={o().tintaNegra} onCambiar={(v) => cambiar({ tintaNegra: v })} />
              </Bloque>
              <Bloque titulo="Contenido" abierto>
                <Interruptor rotulo="Instrumentos" activo={o().instrumentos} deshabilitado={!props.hayInstrumentos} onCambiar={(v) => cambiar({ instrumentos: v })} />
                <Interruptor rotulo="Lecturas de los medidores rápidos" activo={o().lecturasMedidores} deshabilitado={!props.hayMedidores} onCambiar={(v) => cambiar({ lecturasMedidores: v })} />
                <Interruptor rotulo="Colores de voltaje de la vista previa" activo={o().coloresVoltaje && !!props.simulando} deshabilitado={!props.simulando} onCambiar={(v) => cambiar({ coloresVoltaje: v })} />
                <Show when={!props.simulando}>
                  <p class="editor-nota">Los colores de voltaje y las lecturas necesitan la vista previa en marcha (F5).</p>
                </Show>
              </Bloque>
              <Bloque titulo="Margen" resumen={`${o().margenMm} mm`} abierto>
                <Deslizador rotulo="Alrededor" min={0} max={30} valor={o().margenMm} texto={`${o().margenMm} mm`} onCambiar={(v) => cambiar({ margenMm: v }, 'margen')} />
              </Bloque>
            </div>
          </div>
        </div>
        <div class="editor-pie">
          <div class="editor-pie-formato">
            <CampoFormato formatos={FORMATOS} formato={props.formato} onFormato={(f) => props.onFormato(f as FormatoExportar)} />
          </div>
          <div class="editor-pie-tamano">
            <Show when={props.formato === 'png'}>
              <label class="editor-escala">
                <span class="editor-pie-rotulo">Resolución</span>{' '}
                <select class="campo" value={o().escala} onChange={(ev) => cambiar({ escala: Number(ev.currentTarget.value) as OpcionesExportar['escala'] })}>
                  <For each={ESCALAS_PNG}>{(s) => <option value={s}>{s}× ({96 * s} ppp)</option>}</For>
                </select>
              </label>
            </Show>
            <Show when={props.formato === 'pdf'}>
              <label class="editor-escala">
                <span class="editor-pie-rotulo">Hoja</span>{' '}
                <select class="campo" value={o().pagina} onChange={(ev) => cambiar({ pagina: ev.currentTarget.value as TipoPagina })}>
                  <For each={PAGINAS}>{(p) => <option value={p}>{NOMBRE_PAGINA[p]}</option>}</For>
                </select>
              </label>
            </Show>
            <span class="editor-pie-rotulo">Tamaño</span>
            <output class="cifra" aria-live="polite">
              {pie()}
            </output>
          </div>
          <div class="editor-pie-acciones">
            <button type="button" class="boton" onClick={props.onCerrar}>
              Cancelar
            </button>
            <button type="button" class="boton principal" disabled={estado() === 'vacia'} onClick={props.onExportar}>
              Exportar…
            </button>
          </div>
        </div>
      </div>
    </Dialogo>
  )
}
