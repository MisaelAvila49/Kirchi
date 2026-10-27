import { createSignal, createUniqueId, For, Show, untrack } from 'solid-js'
import { textoDeNumero } from '../instrumentos/ajusteAutomatico'
import { desdeExtremos, extremosDe, FORMAS, periodoDeFrecuencia, RANGOS_GENERADOR, type AjustesGenerador, type Forma } from '../instrumentos/ajustes'
import { extrasDeForma, marcasDeTiempo, nombreDeForma, trazoIcono, usaFrecuencia, vistaPrevia, GEOMETRIA_PREVIA, type ExtraDeForma } from '../instrumentos/ondaPrevia'
import { formatearValor, leerValor } from '../valores/valores'
import CampoPerilla from './CampoPerilla'
import Conmutador from './Conmutador'
import { admiteRms, AYUDA_MEDIDA, EXPLICACION_SIN_RMS, medidaAVpp, medidaEfectiva, TITULO_MEDIDA, UNIDAD_MEDIDA, vppAMedida, type MedidaAmplitud } from '../instrumentos/medidaAmplitud'
import { medidaAmplitud, modoAmplitud, modoTiempo, setMedidaAmplitud, setModoAmplitud, setModoTiempo } from './modosGenerador'

const SIMETRIAS = ['0 %', '10 %', '20 %', '25 %', '30 %', '40 %', '50 %', '60 %', '70 %', '75 %', '80 %', '90 %', '100 %']
const CICLOS = ['1 %', '5 %', '10 %', '20 %', '25 %', '30 %', '40 %', '50 %', '60 %', '70 %', '75 %', '80 %', '90 %', '95 %', '99 %']
const pct = (f: number) => `${Math.round(f * 100)} %`
const PICO = RANGOS_GENERADOR.pico

interface Props {
  a: AjustesGenerador
  /** Cambia una propiedad por su id; devuelve el error del editor, o null. */
  ajuste(prop: string, texto: string): string | null
  /** Cambia varias propiedades en un solo paso (Vpp y offset al escribir Vmín y Vmáx). */
  ajustes(cambios: Record<string, string>): string | null
  /** `inspector`: la ficha entera con su vista previa. `linea`: la del doble clic, con lo propio de la forma en «Más ajustes». */
  contexto: 'inspector' | 'linea'
  /** Un error que viene de fuera (el de «aceptar» del doble clic) para el campo de esa propiedad. */
  errorDe?(prop: string): string | null | undefined
  /** Enter ya aplicó lo escrito: el doble clic lo acepta y se cierra. */
  onEnter?(): void
  /** Primer campo numérico que recibe el foco al abrir el doble clic. */
  alMontarFoco?(campo: HTMLInputElement): void
  /** Los controles de una propiedad no se editan ahora. */
  fijo?(prop: string): boolean
}

/**
 * Ficha compacta del generador. El documento guarda una sola representación (frecuencia, amplitud, desplazamiento): los conmutadores solo cambian cómo se muestra y se escribe.
 */
export default function FichaGenerador(props: Props) {
  const nombreForma = `forma-onda-${createUniqueId()}`
  const [errores, setErrores] = createSignal<Record<string, string | null>>({})
  const [mas, setMas] = createSignal(false)
  const guardar = (clave: string, e: string | null) => {
    setErrores((x) => ({ ...x, [clave]: e }))
    return e
  }
  const error = (clave: string, prop = clave) => errores()[clave] ?? props.errorDe?.(prop) ?? null
  const cambiar = (prop: string, texto: string) => guardar(prop, props.ajuste(prop, texto))
  const cambiarPeriodo = (texto: string) => {
    const v = leerValor(texto)
    if (!v || !(v.valor > 0)) return guardar('periodo', 'El periodo debe ser un número mayor que cero.')
    const e = props.ajuste('frecuencia', textoDeNumero(1 / v.valor, 6))
    guardar('frecuencia', null)
    return guardar('periodo', e)
  }
  const cambiarExtremo = (cual: 'minimo' | 'maximo', texto: string) => {
    const v = leerValor(texto)
    if (!v) return guardar(cual, `«${texto}» no es un valor válido.`)
    const actual = extremosDe(props.a.vpp, props.a.desplazamiento)
    const [mn, mx] = cual === 'minimo' ? [v.valor, actual.maximo] : [actual.minimo, v.valor]
    if (mx < mn) return guardar(cual, cual === 'minimo' ? 'El mínimo no puede ser mayor que el máximo.' : 'El máximo no puede ser menor que el mínimo.')
    const d = desdeExtremos(mn, mx)
    return guardar(cual, props.ajustes({ amplitud: textoDeNumero(d.vpp, 6), desplazamiento: textoDeNumero(d.desplazamiento, 6) }))
  }
  const cambiarAmplitud = (m: MedidaAmplitud, texto: string) => {
    const v = leerValor(texto)
    if (!v || !Number.isFinite(v.valor)) return guardar('amplitud', `«${texto}» no es un valor válido.`)
    return guardar('amplitud', props.ajuste('amplitud', textoDeNumero(medidaAVpp(props.a.forma, m, v.valor), 6)))
  }
  const extremos = () => extremosDe(props.a.vpp, props.a.desplazamiento)
  const fijo = (p: string) => !!props.fijo?.(p)
  // Los valores van como funciones: un número pasado directo haría que Solid rehiciera el campo (y su foco) con cada cambio.
  const perilla = (etiqueta: string, clave: string, valor: () => number, unidad: string, min: number, max: number, onCambiar: (t: string) => string | null, prop = clave, foco = false) => (
    <CampoPerilla etiqueta={etiqueta} valor={valor()} unidad={unidad} min={min} max={max} onCambiar={onCambiar} error={error(clave, prop)} onEnter={props.onEnter} alMontar={foco ? props.alMontarFoco : undefined} />
  )
  const lista = (etiqueta: string, prop: string, opciones: string[], actual: () => string) => (
    <label class="fld fld-lista">
      <span>{etiqueta}</span>
      <select class="campo" value={actual()} disabled={fijo(prop)} onChange={(e) => cambiar(prop, e.currentTarget.value)}>
        <For each={opciones}>{(s) => <option value={s} selected={s === actual()}>{s}</option>}</For>
      </select>
    </label>
  )
  const extra = (e: ExtraDeForma) => {
    switch (e) {
      case 'simetria':
        return lista('Simetría', 'simetria', SIMETRIAS, () => pct(props.a.simetria))
      case 'ciclo':
        return lista('Ciclo de trabajo', 'ciclo', CICLOS, () => pct(props.a.ciclo))
      case 'retardo':
        return perilla('Retardo', 'retardo', () => props.a.retardo, 's', RANGOS_GENERADOR.retardo[0], RANGOS_GENERADOR.retardo[1], (t) => cambiar('retardo', t))
      case 'pasos':
        return perilla('Pasos', 'pasos', () => props.a.pasos, '', RANGOS_GENERADOR.pasos[0], RANGOS_GENERADOR.pasos[1], (t) => cambiar('pasos', t))
      case 'fase':
        return perilla('Fase', 'desfase', () => props.a.desfase, '°', RANGOS_GENERADOR.desfase[0], RANGOS_GENERADOR.desfase[1], (t) => cambiar('desfase', t))
    }
  }
  const salidas = () => (
    <>
      <label class="casilla">
        <input type="checkbox" checked={props.a.salida} disabled={fijo('salida')} onChange={(e) => cambiar('salida', e.currentTarget.checked ? 'encendida' : 'apagada')} />
        Salida
      </label>
      <label class="casilla">
        <input type="checkbox" checked={props.a.ideal} disabled={fijo('ideal')} onChange={(e) => cambiar('ideal', e.currentTarget.checked ? 'sí' : 'no')} />
        Instrumento ideal (sin los 50 Ω de salida)
      </label>
    </>
  )
  const previa = () => {
    const v = vistaPrevia(props.a)
    const g = GEOMETRIA_PREVIA
    return (
      <svg class="previa-onda" viewBox={`0 0 ${g.ancho} ${g.alto}`} role="img" aria-label={`Vista previa: ${nombreDeForma(props.a.forma)}, de ${formatearValor(v.minimo, 'V')} a ${formatearValor(v.maximo, 'V')}`}>
        <line class="previa-cero" x1={g.mx} x2={g.ancho - g.mx} y1={v.yCero} y2={v.yCero} />
        <path class="previa-trazo" d={v.trazo} />
        <For each={marcasDeTiempo(props.a)}>
          {(m, i) => (
            <>
              <line class="previa-marca" x1={m.x} x2={m.x} y1={g.alto - g.eje} y2={g.alto - g.eje + 3} />
              <text class="previa-tiempo" x={m.x} y={g.alto - 3} text-anchor={i() === 0 ? 'start' : i() === marcasDeTiempo(props.a).length - 1 ? 'end' : 'middle'}>{m.texto}</text>
            </>
          )}
        </For>
        <text x={g.mx + 2} y="10">{formatearValor(v.maximo, 'V')}</text>
        <text x={g.mx + 2} y={g.alto - g.eje - 3}>{formatearValor(v.minimo, 'V')}</text>
        <text x={g.ancho - g.mx} y={v.yCero - 3} text-anchor="end">0 V</text>
      </svg>
    )
  }
  const extras = () => extrasDeForma(props.a.forma)
  // Un error de «aceptar» en lo que esconde «Más ajustes» lo abre, o nadie lo vería.
  const errorEscondido = () => ['desfase', 'retardo', 'pasos'].some((p) => error(p))
  return (
    <div class="ficha-gen ficha-generador" classList={{ 'ficha-linea': props.contexto === 'linea' }}>
      <fieldset class="formas-tira">
        <legend class="solo-lectores">Forma de onda</legend>
        <For each={FORMAS}>
          {(f: Forma) => (
            <label class="forma-op" title={nombreDeForma(f)}>
              <input type="radio" name={nombreForma} value={f} checked={props.a.forma === f} disabled={fijo('forma')} onChange={() => cambiar('forma', f)} />
              <svg viewBox="0 0 36 14" aria-hidden="true">
                <path d={trazoIcono(f)} />
              </svg>
              {/* El nombre se ve en cada opción: solo con el dibujo no se distinguían Escalón y Escalera. */}
              <span class="forma-nombre">{nombreDeForma(f)}</span>
            </label>
          )}
        </For>
      </fieldset>
      <p class="ficha-forma">
        <b>{nombreDeForma(props.a.forma)}</b>
        <span class="deriv">
          Vmín {formatearValor(extremos().minimo, 'V')} · Vmáx {formatearValor(extremos().maximo, 'V')}
        </span>
      </p>
      <Show when={props.a.forma === 'Cuadrada'}>
        <p class="deriv ficha-aviso">Ciclo de trabajo fijo de 50 %. Para otro ciclo, usa Pulso.</p>
      </Show>
      <Show when={props.contexto === 'inspector'}>{previa()}</Show>
      <Show when={usaFrecuencia(props.a.forma)}>
        <div class="ficha-grupo">
          <div class="ficha-fila">
            <span class="ficha-serie-rotulo" aria-hidden="true">
              Tiempo
            </span>
            <Conmutador
              nombre="Frecuencia o periodo"
              valor={modoTiempo()}
              onCambiar={setModoTiempo}
              opciones={[
                { valor: 'frecuencia', texto: 'Frecuencia' },
                { valor: 'periodo', texto: 'Periodo' }
              ]}
            />
          </div>
          <Show
            when={modoTiempo() === 'frecuencia'}
            fallback={perilla('Periodo', 'periodo', () => periodoDeFrecuencia(props.a.frecuencia), 's', 1 / RANGOS_GENERADOR.frecuencia[1], 1 / RANGOS_GENERADOR.frecuencia[0], cambiarPeriodo, 'periodo', true)}
          >
            {perilla('Frecuencia', 'frecuencia', () => props.a.frecuencia, 'Hz', RANGOS_GENERADOR.frecuencia[0], RANGOS_GENERADOR.frecuencia[1], (t) => cambiar('frecuencia', t), 'frecuencia', true)}
          </Show>
          <p class="deriv ficha-deriv">{modoTiempo() === 'frecuencia' ? `Periodo = ${formatearValor(periodoDeFrecuencia(props.a.frecuencia), 's')}` : `Frecuencia = ${formatearValor(props.a.frecuencia, 'Hz')}`}</p>
        </div>
      </Show>
      <div class="ficha-grupo">
        <div class="ficha-fila">
          <span class="ficha-serie-rotulo" aria-hidden="true">
            Amplitud
          </span>
          <Conmutador
            nombre="Cómo se da la amplitud"
            valor={modoAmplitud()}
            onCambiar={setModoAmplitud}
            opciones={[
              { valor: 'vpp', texto: 'Vpp + Offset' },
              { valor: 'extremos', texto: 'Vmín + Vmáx' }
            ]}
          />
        </div>
        <Show
          when={modoAmplitud() === 'extremos'}
          fallback={
            <>
              <Conmutador
                nombre="Medida de la amplitud"
                valor={medidaEfectiva(props.a.forma, medidaAmplitud())}
                onCambiar={setMedidaAmplitud}
                opciones={[
                  { valor: 'pp', texto: 'Pico a pico', titulo: AYUDA_MEDIDA.pp },
                  { valor: 'pico', texto: 'Pico', titulo: AYUDA_MEDIDA.pico },
                  { valor: 'rms', texto: 'rms', desactivada: !admiteRms(props.a.forma), titulo: admiteRms(props.a.forma) ? AYUDA_MEDIDA.rms : EXPLICACION_SIN_RMS }
                ]}
              />
              <Show when={medidaEfectiva(props.a.forma, medidaAmplitud())} keyed>
                {(m) =>
                  perilla(
                    TITULO_MEDIDA[m],
                    'amplitud',
                    () => vppAMedida(props.a.forma, m, props.a.vpp),
                    UNIDAD_MEDIDA[m],
                    0,
                    vppAMedida(props.a.forma, m, RANGOS_GENERADOR.vpp[1]),
                    (t) => cambiarAmplitud(m, t),
                    'amplitud',
                    untrack(() => !usaFrecuencia(props.a.forma))
                  )
                }
              </Show>
              {perilla('Offset', 'desplazamiento', () => props.a.desplazamiento, 'V', -PICO, PICO, (t) => cambiar('desplazamiento', t))}
            </>
          }
        >
          {perilla('Vmín', 'minimo', () => extremos().minimo, 'V', -PICO, PICO, (t) => cambiarExtremo('minimo', t))}
          {perilla('Vmáx', 'maximo', () => extremos().maximo, 'V', -PICO, PICO, (t) => cambiarExtremo('maximo', t))}
        </Show>
      </div>
      {/* Lo propio de la forma (ciclo de trabajo, fase, retardo, pasos) se ve siempre que la forma lo usa. */}
      <Show when={extras().length > 0}>
        <h3 class="sec">Ajustes de {nombreDeForma(props.a.forma).toLowerCase()}</h3>
        <For each={extras()}>{extra}</For>
      </Show>
      <Show
        when={props.contexto === 'linea'}
        fallback={<div class="ficha-casillas">{salidas()}</div>}
      >
        <details class="mas-ajustes" open={mas() || errorEscondido()} onToggle={(e) => setMas(e.currentTarget.open)}>
          <summary>Más ajustes (salida e instrumento ideal)</summary>
          <div class="ficha-casillas">{salidas()}</div>
        </details>
      </Show>
    </div>
  )
}
