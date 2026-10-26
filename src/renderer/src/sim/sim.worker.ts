import init, { Simulator } from './pkg/kirchi_engine.js'
import { avanzarSinColgarse, mensajeDeAtasco, PresupuestoDeIteraciones, VigilanteDeProgreso } from './atasco'
import { BUDGET_MS, PresupuestoDeLote } from './lote'
import { MAX_ELEMENTS, MAX_NODES, MAX_REDES_DIGITALES, VENTANA_PROMEDIO_MS, writeSim, type FromWorker, type PromedioSim, type ToWorker } from './protocol'
import { InstrumentosEnWorker } from './instrumentosWorker'
import { crearVistas } from './protocoloInstrumentos'

const ctx = self as unknown as {
  postMessage(m: FromWorker): void
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null
}

const presupuesto = new PresupuestoDeLote()
/** Cuántas iteraciones perdidas se permiten por llamada al motor (≈ 1 s de trabajo perdido, medido). */
let iteraciones = new PresupuestoDeIteraciones(1)
/** Si el tiempo simulado no avanza en 5 s (el motor sigue agotando su presupuesto), la vista previa se rinde. */
let vigilante = new VigilanteDeProgreso()

let sim: Simulator | null = null
let view: Float64Array | null = null
/** Memoria del WASM: los voltajes y corrientes se leen de ahí sin copiarlos a arreglos nuevos en cada ciclo. */
let memoria: WebAssembly.Memory | null = null
let nodos = 0
let elementos = 0
let digitales = 0
let speed = 1
let lastWall = 0
let ratio = 1
let capacity = 0
let idCarga = 0
/** Paso máximo vigente (el de la carga o el último cambio de frecuencia en caliente). */
let hMax = 0
let timer: ReturnType<typeof setTimeout> | undefined
/** Cuándo (reloj) se publicó el último promedio, y si el que está en curso ya no vale (hubo un cambio en caliente). */
let ultimoPromedio = 0
let promedioInvalido = false
/** El tiempo simulado en que empezó el promedio en curso. */
let tPromedio = 0
/** Los instrumentos del circuito cargado; null sin instrumentos. */
let instrumentos: InstrumentosEnWorker | null = null
/** «Sin límite de tiempo real» (cada ciclo usa todo su presupuesto, sin mirar el reloj). */
let sinTope = false
/** Lo simulado por segundo de reloj, suavizado. */
let rapidez = 0
/** Avance en curso (F6, «Avanzar hasta t» o un paso del motor): corre lo más rápido posible desde la pausa hasta `meta`
 * (NaN en un paso del motor) y vuelve a la pausa. */
let avance: { seq: number; desde: number; meta: number } | null = null
/** La memoria de las corrientes por terminal (si la corriente animada se usa) y si el motor las integra. */
let sabTerminales: Float64Array | null = null
let terminalesActivas = false
/** Los elementos cuya potencia media se integra y su lugar en el arreglo por elemento que se publica. */
let elementosPotencia: number[] = []
let potenciasPorElemento = new Float64Array(0)
/** Lo más que pide un ciclo con «Sin límite de tiempo real» o un avance. */
const SIN_TOPE_S = 3600
/** Con «Sin límite de tiempo real» y en un avance, cada ciclo pide a lo más este múltiplo de lo que la capacidad medida
 * alcanza en su presupuesto (y un paso como mínimo). Una meta lejana daba todos los pasos a la primera isla (van en orden
 * topológico) y el tiempo común no avanzaba. */
const FACTOR_SIN_TOPE = 2
const tramoSinTope = () => Math.min(SIN_TOPE_S, Math.max(hMax, (FACTOR_SIN_TOPE * capacity * BUDGET_MS) / 1000))
/** La velocidad que se pidió durante un avance; se aplica al terminarlo. */
let velocidadTrasAvance: { value: number; sinTope: boolean } | null = null

function fail(err: unknown, id = idCarga) {
  clearTimeout(timer)
  sim = null // tras un error el Simulator puede estar envenenado: no se libera
  instrumentos = null
  // Un avance en curso no se queda esperando su llegada.
  const a = avance
  avance = null
  velocidadTrasAvance = null
  ctx.postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
  if (a) ctx.postMessage({ type: 'llegada', id, seq: a.seq, t: Number.NaN, dt: 0, interrumpida: true })
}

/** Escribe en la memoria compartida lo último calculado por el motor y avisa de fusibles fundidos. `cerrar` (llegada de un
 * avance) publica también el promedio del tramo corrido desde el anterior. */
function publicar(forzar = false, cerrar = false) {
  if (!sim || !view || !memoria) return
  // Las direcciones primero y el búfer después: si la memoria creciera, el búfer viejo quedaría desconectado.
  const pv = sim.voltages_ptr()
  const pc = sim.currents_ptr()
  const pa = sim.aux_ptr()
  const pe = sim.estado_ptr()
  const pn = sim.niveles_ptr()
  const pm = sim.medidas_ptr()
  // Cada 100 ms de reloj, el promedio exacto de lo simulado desde el anterior; tras un cambio en caliente, nada.
  // Al llegar un avance, el del tramo que corrió: lo que se queda a la vista es de ese mismo instante.
  const ahora = performance.now()
  const toca = !promedioInvalido && (ahora - ultimoPromedio >= VENTANA_PROMEDIO_MS || (cerrar && sim.time() > tPromedio))
  const pp = toca ? sim.promedios_ptr() : 0
  // Las corrientes por terminal y las potencias del mismo intervalo (antes de leer el búfer de la memoria).
  const pt = toca && terminalesActivas && sabTerminales ? sim.terminales_ptr() : 0
  const pw = toca && elementosPotencia.length ? sim.potencias_ptr() : 0
  const bufer = memoria.buffer
  const f64 = (p: number, n: number) => new Float64Array(bufer, p, n)
  let promedio: PromedioSim | null | undefined
  if (promedioInvalido) promedio = null
  else if (toca) {
    if (pw) {
      const w = f64(pw, elementosPotencia.length)
      elementosPotencia.forEach((k, q) => (potenciasPorElemento[k] = w[q]))
    }
    // Siempre con las potencias (en cero sin ninguna): las de una carga anterior no quedan en la memoria.
    promedio = { duracion: f64(pp, 1)[0], fin: sim.time(), voltajes: f64(pp + 8, nodos), corrientes: f64(pp + 8 * (1 + nodos), elementos), potencias: potenciasPorElemento }
  }
  const terminales = pt && sabTerminales ? { vista: sabTerminales, datos: f64(pt, sabTerminales.length) } : promedioInvalido && sabTerminales ? { vista: sabTerminales, datos: [0] } : undefined
  writeSim(view, sim.time(), ratio, capacity, f64(pv, nodos), f64(pc, elementos), f64(pa, elementos), f64(pe, elementos), f64(pn, digitales), f64(pm, 3 * digitales), promedio, { rapidez, ...(terminales ? { terminales } : {}) })
  if (toca || promedioInvalido) {
    sim.reiniciar_promedios()
    ultimoPromedio = ahora
    tPromedio = sim.time()
    promedioInvalido = false
  }
  const ev = sim.take_events()
  for (let k = 0; k + 3 < ev.length; k += 4) ctx.postMessage({ type: 'fundido', id: idCarga, indice: ev[k], t: ev[k + 1], amps: ev[k + 2], segundos: ev[k + 3] })
  // Los cambios de estado que se oyen, con el ancla para pasarlos a reloj (el reloj absoluto es el mismo en la ventana).
  const c = sim.take_cruces()
  if (c.length > 1 || c[0] > 0) {
    const velocidad = avance || sinTope ? 0 : speed
    ctx.postMessage({ type: 'cruces', id: idCarga, datos: Array.from(c.subarray(1)), perdidos: c[0], ancla: { t: sim.time(), reloj: performance.timeOrigin + performance.now() }, velocidad })
  }
  // Los instrumentos después: sus lecturas usan la memoria del WASM y el búfer de arriba ya se escribió.
  if (instrumentos) for (const c of instrumentos.publicar(ahora, forzar)) ctx.postMessage({ type: 'rango', id: idCarga, multimetro: c.multimetro, rango: c.rango })
}

/** El mensaje de un error del motor, o null si no es un `Error` con texto. */
const textoDe = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Termina el avance en curso en el instante alcanzado: queda en pausa, publica lo de ese instante (con el promedio del
 * tramo corrido) y responde con `llegada`. */
function terminarAvance(interrumpida: boolean) {
  const a = avance
  if (!a || !sim) return
  avance = null
  // En pausa, salvo que se haya pedido otra velocidad mientras corría.
  const v = velocidadTrasAvance
  velocidadTrasAvance = null
  speed = v?.value ?? 0
  sinTope = v !== null && v.sinTope && v.value > 0
  instrumentos?.velocidad(speed > 0 && !sinTope ? speed : Number.POSITIVE_INFINITY)
  publicar(true, true)
  const t = sim.time()
  ctx.postMessage({ type: 'llegada', id: idCarga, seq: a.seq, t, dt: t - a.desde, interrumpida, guardados: sim.estados_guardados() })
  if (speed > 0) {
    lastWall = performance.now()
    timer = setTimeout(loop, 4)
  }
}

/** Un ciclo del avance: lo más rápido posible hacia su meta sin pasar de BUDGET_MS, y la meta exacta al final
 * (`advance_to` hace caer el último paso en ella y todas las islas quedan a menos de su paso mínimo). Un paso del motor
 * es un solo paso aceptado, repetido mientras el tiempo no avance (el de una isla adelantada no lo mueve). */
function cicloDeAvance() {
  const a = avance!
  const s = sim!
  const start = performance.now()
  if (Number.isNaN(a.meta)) {
    for (let k = 0; k < 100 && s.time() <= a.desde; k++) s.advance_to(a.desde + hMax, 1)
    terminarAvance(false)
    return
  }
  const t0 = s.time()
  while (s.time() < a.meta - s.hmin() && performance.now() - start < BUDGET_MS) {
    const t1 = performance.now()
    // Hacia la meta de a poco (ver `tramoSinTope`); el último tramo cae exacto en ella.
    const meta = Math.min(a.meta, s.time() + tramoSinTope())
    const r = avanzarSinColgarse(s, meta, presupuesto.tamano(BUDGET_MS - (t1 - start)), iteraciones, () => performance.now())
    if (r.atasco !== null) {
      vigilante.gastar(r.ms)
      if (vigilante.atascado()) throw new Error(r.atasco)
      break
    }
    presupuesto.medir(performance.now() - t1, r.pasos)
    if (r.pasos === 0) break
  }
  vigilante.observar(s.time())
  const usado = (performance.now() - start) / 1000
  const avanzado = s.time() - t0
  if (usado > 0 && avanzado > 0) capacity = capacity === 0 ? avanzado / usado : 0.9 * capacity + 0.1 * (avanzado / usado)
  if (s.time() >= a.meta - s.hmin()) terminarAvance(false)
  else {
    publicar()
    // Sin esperar: el avance va lo más rápido que puede, cediendo el turno para que pasen la interrupción y las lecturas.
    timer = setTimeout(loop, 0)
  }
}

/** Avanza el tiempo simulado que corresponde al reloj, sin pasar de BUDGET_MS de cálculo. */
function loop() {
  if (!sim || !view || !memoria) return
  let atasco: string | null = null
  let gastoAtascado = 0
  try {
    if (avance) {
      cicloDeAvance()
      return
    }
    const now = performance.now()
    const wallDt = Math.min((now - lastWall) / 1000, 0.1)
    lastWall = now
    // «Sin límite de tiempo real» pide mucho más de lo que cabe en el presupuesto: el ciclo corta por tiempo de cálculo.
    const want = sinTope ? tramoSinTope() : wallDt * speed
    const t0 = sim.time()
    const goal = t0 + want
    const start = performance.now()
    while (sim.time() < goal - 1e-12 && performance.now() - start < BUDGET_MS) {
      const t1 = performance.now()
      // Presupuesto agotado: no es un fallo, el motor conserva el último paso aceptado. Se cede el turno para que la pausa, los
      // cambios en caliente y las lecturas pasen, y la llamada siguiente continúa (o se rinde tras 5 s sin avanzar).
      const r = avanzarSinColgarse(sim, goal, presupuesto.tamano(BUDGET_MS - (t1 - start)), iteraciones, () => performance.now())
      if (r.atasco !== null) {
        atasco = r.atasco
        gastoAtascado = r.ms
        break
      }
      const pasos = r.pasos
      presupuesto.medir(performance.now() - t1, pasos)
      if (pasos === 0) break
    }
    const ahora = performance.now()
    vigilante.observar(sim.time())
    if (atasco !== null) {
      vigilante.gastar(gastoAtascado)
      if (vigilante.atascado()) throw new Error(atasco)
    }
    const used = (ahora - start) / 1000
    const got = sim.time() - t0
    // Con «Sin límite de tiempo real» no hay un ritmo pedido que alcanzar: la barra dice la rapidez.
    if (want > 0 && !sinTope) ratio = 0.9 * ratio + 0.1 * Math.min(got / want, 1)
    if (sinTope) ratio = 1
    if (used > 0 && got > 0) capacity = capacity === 0 ? got / used : 0.9 * capacity + 0.1 * (got / used)
    if (wallDt > 0 && speed > 0) rapidez = rapidez === 0 ? got / wallDt : 0.8 * rapidez + 0.2 * (got / wallDt)
    publicar()
    // En pausa el worker duerme hasta el siguiente mensaje (`speed` lo despierta): no se despierta cada 4 ms para nada.
    if (speed > 0) timer = setTimeout(loop, sinTope ? 0 : 4)
  } catch (err) {
    fail(err)
  }
}

/** Tras un cambio en caliente (estado lógico, interruptor, cursor) el ciclo corre en ese momento y no espera su
 * temporizador de 4 ms (a 200 Hz serían casi un cuadro más de retraso). En pausa no corre: el control manda `paso` para
 * las lecturas. */
function calcularYa() {
  if (!sim || speed <= 0) return
  clearTimeout(timer)
  loop()
}

ctx.onmessage = async (e) => {
  const m = e.data
  if (m.type === 'load') {
    idCarga = m.id
    try {
      memoria = (await init()).memory
      if (m.id !== idCarga) return // llegó otra carga mientras se iniciaba el WASM: esa se encarga
      clearTimeout(timer)
      try {
        sim?.free()
      } catch {
        /* instancia anterior inutilizable */
      }
      sim = null
      instrumentos = null
      const fresh = new Simulator(m.netlist, m.h)
      const nodes = fresh.node_count()
      const elements = fresh.element_count()
      const redes = fresh.digital_count()
      nodos = nodes
      elementos = elements
      digitales = redes
      if (nodes > MAX_NODES || elements > MAX_ELEMENTS || redes > MAX_REDES_DIGITALES) {
        try {
          fresh.free()
        } catch {
          /* nada que liberar */
        }
        throw new Error(
          nodes > MAX_NODES
            ? `La vista previa admite hasta ${MAX_NODES} redes y este circuito tiene ${nodes}.`
            : redes > MAX_REDES_DIGITALES
              ? `La vista previa admite hasta ${MAX_REDES_DIGITALES} redes digitales y este circuito tiene ${redes}.`
              : `La vista previa admite hasta ${MAX_ELEMENTS} piezas simuladas y este circuito tiene ${elements}.`
        )
      }
      // La memoria de las corrientes por terminal es del tamaño que dijo la netlist; si el motor cuenta otras casillas,
      // las corrientes de cada tramo saldrían corridas: se rechaza la carga.
      if (m.terminales) {
        const casillas = (m.terminales.sab.byteLength / Float64Array.BYTES_PER_ELEMENT - 1) / 2
        const delMotor = fresh.casillas_terminales()
        if (casillas !== delMotor) {
          try {
            fresh.free()
          } catch {
            /* nada que liberar */
          }
          throw new Error(`La memoria de las corrientes por terminal tiene ${casillas} casillas y el motor cuenta ${delMotor}.`)
        }
      }
      sim = fresh
      const mi = m.instrumentos
      instrumentos = mi
        ? new InstrumentosEnWorker(fresh, () => memoria!.buffer, crearVistas(mi.sab, mi.config.osciloscopios.length, mi.config.multimetros.length), mi.config, performance.now())
        : null
      sim.activar_promedios()
      // Las corrientes por terminal (si la corriente animada empieza encendida) y las potencias de los avisos.
      sabTerminales = m.terminales ? new Float64Array(m.terminales.sab) : null
      terminalesActivas = m.terminales?.activa === true
      if (terminalesActivas) sim.activar_terminales(true)
      elementosPotencia = m.potencias ?? []
      potenciasPorElemento = new Float64Array(elements)
      if (elementosPotencia.length) sim.activar_potencias(Uint32Array.from(elementosPotencia))
      avance = null
      velocidadTrasAvance = null
      // Una carga empieza con la velocidad que trae (1× sin ella; 0 si queda en pausa: no corre nada antes de la pausa), sin
      // nada pendiente de antes, y los instrumentos con esa velocidad.
      speed = m.velocidad !== undefined && Number.isFinite(m.velocidad) && m.velocidad >= 0 ? m.velocidad : 1
      sinTope = m.sinTope === true && speed > 0
      instrumentos?.velocidad(speed)
      rapidez = 0
      ultimoPromedio = performance.now()
      tPromedio = 0
      promedioInvalido = true
      view = new Float64Array(m.sab)
      ratio = 1
      capacity = 0
      hMax = m.h
      iteraciones = new PresupuestoDeIteraciones(nodes + elements)
      vigilante = new VigilanteDeProgreso()
      presupuesto.msPorPaso = Number.NaN
      lastWall = performance.now()
      ctx.postMessage({ type: 'ready', id: m.id, nodes, elements, digitales: redes, lazo: Array.from(fresh.lazo_de_arranque()) })
      loop()
    } catch (err) {
      fail(err, m.id)
    }
  } else if (m.type === 'valores') {
    if (!sim) return
    // Un valor que el motor rechaza no detiene la vista previa: se avisa y el elemento conserva el anterior.
    const rechazar = (indice: number, err: unknown) => ctx.postMessage({ type: 'rechazado', id: idCarga, indice, message: textoDe(err), seq: m.seq })
    // Un paso máximo menor se aplica antes de los elementos (la frecuencia nueva ya cabe) y uno mayor, después.
    const h = m.h
    if (h !== undefined && h < hMax) {
      try {
        sim.set_max_step(h)
        hMax = h
      } catch (err) {
        rechazar(-1, err)
      }
    }
    for (const c of m.cambios) {
      try {
        sim.set_element(c.indice, JSON.stringify(c.elemento))
      } catch (err) {
        rechazar(c.indice, err)
      }
    }
    if (h !== undefined && h > hMax) {
      try {
        sim.set_max_step(h)
        hMax = h
      } catch (err) {
        rechazar(-1, err)
      }
    }
    // Lo que se promediaba antes del cambio ya no es lo que se ve: hasta el siguiente intervalo se lee el último paso.
    promedioInvalido = true
    calcularYa()
  } else if (m.type === 'reponer') {
    promedioInvalido = true
    try {
      sim?.reset_element(m.indice)
    } catch (err) {
      fail(err)
      return
    }
    calcularYa()
  } else if (m.type === 'paso') {
    // Un solo paso corto aunque el reloj esté en pausa: las lecturas reflejan lo recién cambiado.
    try {
      if (sim) {
        sim.advance_to(sim.time() + hMax, 1)
        publicar(true)
      }
    } catch (err) {
      if (mensajeDeAtasco(textoDe(err)) === null) fail(err)
    }
  } else if (m.type === 'speed') {
    // Durante un avance la velocidad pedida espera a que termine (el avance corre lo más rápido posible).
    if (avance && Number.isFinite(m.value) && m.value >= 0) {
      velocidadTrasAvance = { value: m.value, sinTope: m.sinTope === true }
      return
    }
    if (Number.isFinite(m.value) && m.value >= 0) {
      const reanuda = speed === 0 && m.value > 0
      const pausa = speed > 0 && m.value === 0
      speed = m.value
      sinTope = m.sinTope === true && m.value > 0
      // El rodillo del osciloscopio se decide en tiempo de reloj: le importa la velocidad vigente.
      instrumentos?.velocidad(sinTope ? Number.POSITIVE_INFINITY : speed)
      // Al pausar, la pantalla que se queda a la vista con sus muestras de exportación0).
      if (pausa && sim) publicar(true)
      // Pausar y reanudar no cuentan como tiempo atascado.
      vigilante.reiniciar()
      if (reanuda && sim) {
        // Corriendo ya no hay un avance al que volver: lo guardado era de antes de lo que va a pasar.
        sim.descartar_estados()
        clearTimeout(timer)
        lastWall = performance.now()
        loop()
      }
    }
  } else if (m.type === 'instrumentos') {
    try {
      instrumentos?.configurar(m.config, performance.now())
      // En pausa la pantalla se arma otra vez con lo que ya guardaron las sondas (otra base de tiempo, otro disparo).
      if (sim && speed <= 0) publicar(true)
    } catch (err) {
      fail(err)
    }
  } else if (m.type === 'pantalla') {
    instrumentos?.columnas(m.osciloscopio, m.columnas)
    if (sim && speed <= 0) publicar(true)
  } else if (m.type === 'rearmar') {
    instrumentos?.rearmar(m.osciloscopio)
  } else if (m.type === 'forzar-pantallas') {
    if (sim) publicar(true)
  } else if (m.type === 'captura-amplia') {
    let pantalla = null
    try {
      pantalla = sim ? (instrumentos?.capturaAmplia(m.osciloscopio, m.columnas, m.hasta) ?? null) : null
    } catch (err) {
      fail(err)
    }
    ctx.postMessage({ type: 'captura-amplia', id: idCarga, seq: m.seq, pantalla })
  } else if (m.type === 'captura-fina') {
    let registro = null
    try {
      registro = sim ? (instrumentos?.capturaFina(m.osciloscopio, m.hasta) ?? null) : null
    } catch (err) {
      fail(err)
    }
    ctx.postMessage({ type: 'captura-fina', id: idCarga, seq: m.seq, registro })
  } else if (m.type === 'avanzar' || m.type === 'hasta') {
    // Sin circuito o con otro avance en curso no se avanza, pero se responde: el control no se queda esperando.
    if (!sim || avance) {
      ctx.postMessage({ type: 'llegada', id: idCarga, seq: m.seq, t: sim ? sim.time() : Number.NaN, dt: 0, interrumpida: true, guardados: sim?.estados_guardados() ?? 0 })
      return
    }
    clearTimeout(timer)
    speed = 0
    const desde = sim.time()
    // Retroceder: el estado de antes del avance (los últimos 200, hasta 64 MB; el motor olvida los más viejos).
    sim.guardar_estado()
    const perdidos = sim.estados_perdidos()
    if (perdidos > 0) ctx.postMessage({ type: 'estados-perdidos', id: idCarga, perdidos, guardados: sim.estados_guardados() })
    avance = { seq: m.seq, desde, meta: m.type === 'hasta' ? m.t : m.dt === 'paso' ? Number.NaN : desde + m.dt }
    instrumentos?.velocidad(Number.POSITIVE_INFINITY)
    vigilante.reiniciar()
    try {
      loop()
    } catch (err) {
      fail(err)
    }
  } else if (m.type === 'retroceder') {
    // Solo desde la pausa y sin un avance en curso; si no, o si no hay nada guardado, se responde sin tocar nada.
    const sinCambio = () => ctx.postMessage({ type: 'retrocedio', id: idCarga, seq: m.seq, t: Number.NaN, guardados: sim ? sim.estados_guardados() : 0 })
    if (!sim || avance || speed > 0) return sinCambio()
    const t = sim.restaurar_estado()
    if (Number.isNaN(t)) return sinCambio()
    try {
      // El motor ya recortó las sondas; los instrumentos olvidan lo que armaron con lo deshecho.
      instrumentos?.retroceder(t)
      vigilante.reiniciar()
      promedioInvalido = true
      publicar(true)
      ctx.postMessage({ type: 'retrocedio', id: idCarga, seq: m.seq, t, guardados: sim.estados_guardados() })
    } catch (err) {
      fail(err)
    }
  } else if (m.type === 'interrumpir') {
    if (!avance) return
    clearTimeout(timer)
    terminarAvance(true)
  } else if (m.type === 'corrientes') {
    if (!sim) return
    terminalesActivas = m.activa && sabTerminales !== null
    sim.activar_terminales(terminalesActivas)
    // Lo que se integraba antes no es de las corrientes por terminal: hasta el intervalo siguiente no hay promedio.
    promedioInvalido = true
  } else if (m.type === 'quemar') {
    if (!sim) return
    try {
      sim.quemar(m.indice, m.si)
    } catch (err) {
      ctx.postMessage({ type: 'rechazado', id: idCarga, indice: m.indice, message: textoDe(err), seq: m.seq })
      return
    }
    promedioInvalido = true
    calcularYa()
  } else {
    clearTimeout(timer)
    sim?.free()
    sim = null
    instrumentos = null
  }
}
