//! Transitorio como el de ngspice (dctran.c y niiter.c): trapezoidal con un primer paso de Euler tras cada discontinuidad, paso adaptado al error de truncamiento, puntos de quiebre en los flancos y Newton con limitadores. Si no converge: paso menor, conductancia creciente en paralelo y escalamiento de fuentes; si no, el error nombra el elemento sospechoso.
//! Empieza en t = 0 con todo descargado (como `uic`).

use crate::dense::DenseLu;
use crate::devices::quemado::Quemado;
use crate::devices::{self, Alloc, Ctx, Device, Event, Hist, Mode, Reading, Tol, CASILLAS_MAX, CORRIENTE_FORZADA, GMIN, PASOS_FORZADOS, PERSISTENCIA_FORZADA};
use crate::digital::Nivel;
use crate::error::EngineError;
use crate::mna::{LinearSolver, Stamp};
use crate::canales::Canales;
use crate::netlist::{CanalDef, Element, FormaCanal, LectorDef, Netlist, Wave, PASO_RANGO};
use crate::sonda::{EstadoSonda, Sonda};

/// Una muestra pedida con `pedir_muestra`: el lector (como se numeró en la isla), el instante pedido y el valor leído.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MuestraLocal {
    pub lector: usize,
    pub t: f64,
    pub v: f64,
}

/// Una muestra cuyo instante coincide con un cambio de canal se toma un instante después, ya con el valor nuevo (múltiplos de `hmin`).
const ASTILLA_MUESTRA: f64 = 4.0;

/// Lo que mide una sonda dentro de una isla, con los nodos y los elementos numerados como en la isla.
#[derive(Clone, Copy, Debug)]
pub enum Medida {
    Voltaje { p: usize, n: usize },
    Corriente { elemento: usize, signo: f64 },
}

/// De dónde sale el promedio de una casilla de corriente por terminal: de las integrales propias de la casilla, de la
/// corriente de un elemento de dos terminales con su signo (`acum_i` y `acum_abs`), o cero (la tierra interna de uno de dos).
#[derive(Clone, Copy, Debug)]
enum Casilla {
    Propia(usize),
    Simple(usize, f64),
    Cero,
}

/// Un cambio de estado que se oye: el zumbador `element` empezó (1) o dejó (0) de sonar, o el contacto del relé
/// pasó a operado (1) o a reposo (0), en el instante `t` del paso aceptado que lo cambió.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Cruce {
    pub element: usize,
    pub t: f64,
    pub nivel: u8,
}

/// Cambios de estado que se guardan entre dos `take_cruces`; los que siguen se cuentan (`cruces_perdidos`) y no se guardan.
pub const TOPE_CRUCES: usize = 4096;

struct SondaIsla {
    /// Su número en la netlist completa.
    id: usize,
    medida: Medida,
    sonda: Sonda,
}

#[derive(Clone, Copy, Debug)]
pub enum SolverKind {
    Dense,
    #[cfg(feature = "faer")]
    Sparse,
}

/// Iteraciones de Newton por paso. ngspice usa 10 (ITL4), pero los limitadores suben una unión unos 0.4 V por
/// iteración y un LED azul que arranca en 0 V necesita más: con 10, ningún paso más corto lo arregla.
const MAX_ITER: usize = 50;
/// Iteraciones de Newton perdidas que una llamada a `advance_to` o `step` puede gastar antes de devolver `EngineError::Presupuesto` (no fatal, el rescate sigue en la llamada siguiente). Un paso atascado puede costar miles de factorizaciones.
pub const DEFAULT_ITER_BUDGET: usize = 20_000;
/// Iteraciones por nivel en el escalamiento de gmin y de fuentes.
const MAX_ITER_RESCATE: usize = 100;

/// Un cruce de umbral de un puente de entrada se localiza hasta que queda a menos de esto del final del paso (s). La
/// 1 ns sería un 20 % de error en los instantes con retardos de 5 ns.
pub const TOLERANCIA_CRUCE: f64 = 1e-10;
/// Intentos de localizar un cruce en un mismo paso: una cuadrada ideal salta el umbral de golpe y ningún paso más corto
/// lo encuentra, así que tras estos el paso se acepta como está.
const MAX_LOCALIZACIONES: u32 = 4;

/// Un paso que terminaría a menos de esta fracción de sí mismo antes del final de la llamada se estira hasta él. Si no, la suma de pasos deja una astilla de ~1e-13 s cuyo ruido de redondeo en 2C/h (1e7 S) impide converger, y la simulación se atasca en el mismo instante (compuanalogica.kir).
const RESTO_MIN: f64 = 1e-3;

/// Oscilación del trapecio: un voltaje que cambia de sentido en cada paso (dos vueltas seguidas, cada cambio de `ZIGZAG_FRACCION`
/// de su valor y `ZIGZAG_V` o más) durante `ZIGZAG_PASOS` pasos hace que los `EULER_PASOS` siguientes vayan con Euler hacia atrás.
const ZIGZAG_PASOS: u8 = 2;
const EULER_PASOS: u8 = 4;
const ZIGZAG_FRACCION: f64 = 1e-2;
const ZIGZAG_V: f64 = 1e-6;

/// Lo más corto que puede ser un tramo de una onda cuadrada, como fracción del paso máximo: con menos, cada flanco es un
/// punto de quiebre y el tiempo simulado casi no avanza.
const SEGMENTO_MIN_POR_PASO: f64 = 1e-4;

/// Una onda cuadrada o de pulso con un tramo más corto que `SEGMENTO_MIN_POR_PASO` del paso máximo `h` se rechaza (los
/// tramos de 0, flancos ideales, no cuentan).
fn comprobar_cuadrada(k: usize, e: &Element, h: f64) -> Result<(), EngineError> {
    let (tramo, nombre) = match e {
        Element::V { wave: Wave::Square { freq, duty, .. }, .. } => (duty.min(1.0 - duty) / freq, "cuadrada"),
        Element::V { wave: Wave::Pulse { freq, rise, fall, width, .. }, .. } => {
            let per = 1.0 / freq;
            let resto = per - rise - width - fall;
            let minimo = [*rise, *width, *fall, resto].into_iter().filter(|x| *x > 1e-12 * per).fold(f64::INFINITY, f64::min);
            (minimo, "de pulso")
        }
        Element::V { wave: Wave::Stair { freq, steps, .. }, .. } => (1.0 / (freq * *steps as f64), "de escalera"),
        _ => return Ok(()),
    };
    if tramo < h * SEGMENTO_MIN_POR_PASO {
        return Err(EngineError::Invalid(format!(
            "elemento {k}: la onda {nombre} cambia más de {:.0} veces por paso máximo, sube el paso o baja la frecuencia",
            1.0 / SEGMENTO_MIN_POR_PASO
        )));
    }
    Ok(())
}

/// Incógnitas a partir de las cuales conviene la LU dispersa. Medido con escaleras de diodos y capacitores: con 40 la dispersa
/// tarda 10 µs por paso y la densa 13, con 20 es 4.9 contra 4.5. Con cadenas de amplificadores de emisor común (`bench_etapas`)
/// se cruzan hacia 24: con 22 incógnitas la densa gana por 4 % y con 28 la dispersa por 25 %, con 34, por 23 %.
pub const UMBRAL_DISPERSA: usize = 24;

/// Incógnitas que tendrá la netlist (nodos sin tierra y las internas de cada dispositivo), sin armar el sistema.
pub fn incognitas(net: &Netlist) -> usize {
    let mut a = Alloc::new(net.nodes.max(1));
    for (k, e) in net.elements.iter().enumerate() {
        if !e.es_digital() {
            if let Ok(mut d) = devices::build(e, k) {
                d.bind(&mut a);
            }
        }
    }
    a.n
}

/// Matriz que descarta lo que se le estampa: con la factorización vigente solo se arma el lado derecho.
struct Descarte;
impl Stamp for Descarte {
    fn add(&mut self, _r: usize, _c: usize, _v: f64) {}
}

/// En qué nivel iba el rescate de convergencia.
#[derive(Clone, Copy, Debug)]
enum Etapa {
    /// Conductancia de cada nodo a tierra, en siemens.
    Gmin(f64),
    /// Sin conductancia, con las fuentes completas.
    Final,
    /// Fuentes al `k` por ciento de diez.
    Fuentes(u8),
}

/// El rescate que quedó a medias por falta de presupuesto: el paso (`t`, `h`), el nivel que sigue y la solución del anterior.
#[derive(Clone)]
struct Rescate {
    t: f64,
    h: f64,
    etapa: Etapa,
    x: Vec<f64>,
}

/// Contadores del trabajo del motor (y, con la característica `perfil`, tiempos por fase en nanosegundos).
#[derive(Clone, Copy, Debug, Default)]
pub struct Perfil {
    /// Intentos de paso (aceptados o no), rechazos por error de truncamiento, fallos de Newton y pasos aceptados.
    pub intentos: u64,
    pub rechazos_lte: u64,
    pub fallos: u64,
    /// Iteraciones de Newton, factorizaciones y resoluciones.
    pub iteraciones: u64,
    pub factorizaciones: u64,
    pub ns_carga: u64,
    pub ns_factor: u64,
    pub ns_resuelve: u64,
    pub ns_resto: u64,
    pub ns_trunc: u64,
    pub ns_accept: u64,
    pub ns_conv: u64,
}

/// Todo lo que define el futuro de una isla y cambia con el tiempo (para retroceder): tiempo, control del paso, soluciones, estado de los cuatro pasos anteriores, estado interno de cada dispositivo, promedios y lo justo de cada sonda.
/// No lleva lo que solo cambia con una edición (elementos, listas de dispositivos, solucionador): `Mixto` descarta los estados guardados si eso cambia.
pub struct EstadoTransient {
    x: Vec<f64>,
    x_acc: Vec<f64>,
    st: [Vec<f64>; 4],
    t: f64,
    delta: f64,
    delta_old: [f64; 4],
    order: u8,
    zz_paso: Vec<f64>,
    zz_vueltas: Vec<u8>,
    zz_racha: u8,
    zz_euler: u8,
    first: bool,
    at_break: bool,
    save_delta: f64,
    steps: u64,
    gshunt: f64,
    src: f64,
    readings: Vec<Reading>,
    forzados: u32,
    rescate: Option<Rescate>,
    forzado_desde: f64,
    forzado_i0: f64,
    forzado_k: Option<usize>,
    hubo_cruce: bool,
    localizaciones: u32,
    acum_v: Vec<f64>,
    acum_i: Vec<f64>,
    t_promedio: f64,
    term_ult: Vec<f64>,
    term_int: Vec<f64>,
    term_abs: Vec<f64>,
    acum_abs: Vec<f64>,
    pot_ult: Vec<f64>,
    pot_int: Vec<f64>,
    por_iniciar: Vec<usize>,
    /// Los dispositivos con estado propio (None: el que lo lleva todo en `st`, como una resistencia).
    devs: Vec<Option<Box<dyn Device>>>,
    sondas: Vec<EstadoSonda>,
    canales: Canales,
    programadas: Vec<(f64, usize)>,
}

impl EstadoTransient {
    /// Bytes que ocupa la copia (lo que reservan sus vectores y sus dispositivos).
    pub fn bytes(&self) -> usize {
        use std::mem::size_of;
        let f = size_of::<f64>();
        let vf = |v: &Vec<f64>| v.len() * f;
        vf(&self.x)
            + vf(&self.x_acc)
            + self.st.iter().map(vf).sum::<usize>()
            + self.readings.len() * size_of::<Reading>()
            + self.rescate.as_ref().map_or(0, |r| vf(&r.x))
            + vf(&self.acum_v)
            + vf(&self.acum_i)
            + vf(&self.term_ult)
            + vf(&self.term_int)
            + vf(&self.term_abs)
            + vf(&self.acum_abs)
            + vf(&self.pot_ult)
            + vf(&self.pot_int)
            + self.por_iniciar.len() * size_of::<usize>()
            + self.devs.len() * size_of::<Option<Box<dyn Device>>>()
            + self.devs.iter().flatten().map(|d| size_of_val(&**d) + d.bytes_heap()).sum::<usize>()
            + self.sondas.len() * size_of::<EstadoSonda>()
            + self.canales.bytes()
            + self.programadas.len() * size_of::<(f64, usize)>()
    }
}

pub struct Transient {
    elements: Vec<Element>,
    nodes: usize,
    /// Los canales de valor que lee esta isla (una isla que no lee ninguno tiene la estructura vacía y no paga nada).
    canales: Canales,
    /// Los lectores de la isla, sus muestras programadas (instante pedido y lector) y las ya tomadas.
    lectores: Vec<LectorDef>,
    programadas: Vec<(f64, usize)>,
    listas: Vec<MuestraLocal>,
    devs: Vec<Box<dyn Device>>,
    /// Incógnitas del sistema: nodos externos (sin tierra) y luego las internas de cada dispositivo.
    n: usize,
    is_current: Vec<bool>,
    /// Por incógnita, el elemento que la pidió (los nodos externos no tienen dueño único).
    owner: Vec<Option<usize>>,
    solver: Box<dyn LinearSolver>,
    rhs: Vec<f64>,
    x: Vec<f64>,
    x_new: Vec<f64>,
    /// Solución del último paso aceptado (a ella se vuelve si un intento falla).
    x_acc: Vec<f64>,
    /// Estado del paso en curso (0) y de los tres pasos aceptados anteriores.
    st: [Vec<f64>; 4],
    t: f64,
    hmax: f64,
    hmin: f64,
    /// Próximo paso que se intentará.
    delta: f64,
    delta_old: [f64; 4],
    order: u8,
    /// Lo que cambió cada voltaje en el último paso y cuántas veces seguidas cambió de sentido, la racha de pasos en zigzag y los
    /// pasos de Euler que faltan (ver `ZIGZAG_PASOS`).
    zz_paso: Vec<f64>,
    zz_vueltas: Vec<u8>,
    zz_racha: u8,
    zz_euler: u8,
    /// Aún no se da el primer paso: sin estimación de error y con las cargas del instante 0.
    first: bool,
    /// El paso anterior terminó en una discontinuidad: el siguiente es de Euler y más corto.
    at_break: bool,
    save_delta: f64,
    steps: u64,
    max_iter: usize,
    tol: Tol,
    linear: bool,
    /// Coeficiente y orden con que está factorizada la matriz de un circuito lineal.
    factored: Option<(f64, u8)>,
    gshunt: f64,
    src: f64,
    events: Vec<Event>,
    readings: Vec<Reading>,
    /// Pasos aceptados seguidos con una unión empujada a conducir sin límite.
    forzados: u32,
    /// Iteraciones de Newton que no llegaron a converger en la llamada en curso, el tope de la llamada y si se agotó.
    iter_perdidas: usize,
    iter_presupuesto: usize,
    iter_en_curso: usize,
    agotado: bool,
    /// Rescate de convergencia a medias (ver `rescue`).
    rescate: Option<Rescate>,
    /// Instante en que empezó la racha de pasos con una unión forzada, su corriente en el primer paso y el dispositivo.
    forzado_desde: f64,
    forzado_i0: f64,
    forzado_k: Option<usize>,
    /// Posiciones de los dispositivos con flancos y con uniones (los únicos a quienes se les pregunta en cada paso).
    con_quiebres: Vec<usize>,
    con_union: Vec<usize>,
    /// Posiciones de los puentes de entrada, si el último paso aceptado cambió el nivel de alguno y cuántas veces se
    /// repitió el paso en curso para localizar un cruce.
    con_puente: Vec<usize>,
    hubo_cruce: bool,
    localizaciones: u32,
    /// Ningún dispositivo tiene dinámica: entre eventos la solución no cambia (ver `advance_hasta_cruce`).
    estatico: bool,
    /// Desde qué instante salta sin pasos (la solución no cambió desde ahí) y lo que llevaban sus sondas entonces: `retroceder_salto` la regresa ahí.
    salto_desde: Option<f64>,
    sondas_salto: Vec<EstadoSonda>,
    /// Los dispositivos de estampa fija (resistencias, fusibles) y los demás: los fijos se estampan una vez en la base del
    /// solucionador y cada iteración empieza de ahí; `base_lista` cae con cada cambio en caliente, reposición o discontinuidad.
    fijos: Vec<usize>,
    variables: Vec<usize>,
    /// Los que pueden acotar el paso por error de truncamiento (los que tienen dinámica: cargas, flujos) y los que tienen su
    /// propia prueba de convergencia (los no lineales): los demás no hacen nada en esas llamadas.
    con_trunc: Vec<usize>,
    no_lineales: Vec<usize>,
    /// Los que hacen algo al aceptar un paso (`usa_accept`).
    con_accept: Vec<usize>,
    base_lista: bool,
    rhs_base: Vec<f64>,
    /// Sondas de los instrumentos que miden algo de esta isla.
    sondas: Vec<SondaIsla>,
    /// Promedios de las lecturas: ∫v·dt de cada nodo y ∫i·dt de cada elemento desde `t_promedio`.
    promediar: bool,
    acum_v: Vec<f64>,
    acum_i: Vec<f64>,
    t_promedio: f64,
    /// corrientes por terminal (`activar_terminales`): la primera casilla de cada elemento (sus nodos y la tierra
    /// interna, `CASILLAS_MAX` como mucho), el nodo de cada casilla (0 en la de la tierra), las del último paso aceptado, sus
    /// integrales ∫i·dt e ∫|i|·dt desde el último reinicio de los promedios.
    terminales: bool,
    term_inicio: Vec<usize>,
    term_nodo: Vec<usize>,
    term_ult: Vec<f64>,
    term_int: Vec<f64>,
    term_abs: Vec<f64>,
    /// Los de corrientes propias (los demás llevan ±i de su lectura: su media es la de `acum_i` y la de su valor absoluto la de
    /// `acum_abs`, que se integra en el mismo recorrido de las lecturas) y de dónde sale cada casilla.
    term_propios: Vec<usize>,
    term_ref: Vec<Casilla>,
    acum_abs: Vec<f64>,
    /// Elementos cuya potencia media se integra (`activar_potencias`), su potencia del último paso y ∫p·dt.
    potencias: Vec<usize>,
    pot_ult: Vec<f64>,
    pot_int: Vec<f64>,
    /// Los nodos de cada potencia de dos terminales sin corrientes propias, (a, b): su potencia es (V(a) − V(b))·i de
    /// su lectura, sin llamar al dispositivo; `usize::MAX` en a para los demás. Con 984 resistencias la llamada por elemento
    /// y paso le quitaba la mitad de la capacidad.
    pot_nodos: Vec<(usize, usize)>,
    /// Por elemento, su número en `potencias` si es de dos terminales sin corrientes propias (`u32::MAX` si no): su potencia se
    /// integra en el mismo recorrido de las lecturas.
    pot_simple: Vec<u32>,
    /// Los que registran cambios de estado (zumbadores y relés) y lo que registraron.
    con_estado: Vec<usize>,
    cruces: Vec<Cruce>,
    cruces_perdidos: u32,
    /// Elementos quemados con su dispositivo original, para reponerlos.
    quemados: Vec<(usize, Box<dyn Device>)>,
    /// Los repuestos que se cargan como en el primer paso (`Mode::InitTran`) en la primera iteración del paso siguiente: sus
    /// cargas y sus voltajes de unión eran los de cuando se quemaron, y la carga de antes daría un pico de corriente.
    por_iniciar: Vec<usize>,
    /// Las casillas de estado de cada dispositivo, `desde..hasta`.
    estados_de: Vec<(usize, usize)>,
    pub perfil: Perfil,
}

impl Transient {
    /// `h` es el paso más largo: el motor lo acorta donde la señal lo pide. La matriz es densa en circuitos chicos
    /// y dispersa en los grandes (más de `UMBRAL_DISPERSA` incógnitas, donde la dispersa ya es más rápida).
    pub fn new(net: Netlist, h: f64) -> Result<Self, EngineError> {
        #[cfg(feature = "faer")]
        if incognitas(&net) > UMBRAL_DISPERSA {
            return Self::with_solver(net, h, SolverKind::Sparse);
        }
        Self::with_solver(net, h, SolverKind::Dense)
    }

    pub fn with_solver(net: Netlist, h: f64, kind: SolverKind) -> Result<Self, EngineError> {
        net.validate()?;
        if let Some(k) = net.elements.iter().position(Element::es_digital) {
            return Err(EngineError::Invalid(format!("elemento {k}: un elemento digital no entra a la matriz analógica")));
        }
        if !(h.is_finite() && h > 0.0) {
            return Err(EngineError::Invalid("el paso de tiempo debe ser positivo".into()));
        }
        for (k, e) in net.elements.iter().enumerate() {
            comprobar_cuadrada(k, e, h)?;
        }
        if !(h >= PASO_RANGO.0 && h <= PASO_RANGO.1) {
            return Err(EngineError::Invalid(format!("el paso de tiempo debe estar entre {:e} s y {:e} s", PASO_RANGO.0, PASO_RANGO.1)));
        }
        let mut alloc = Alloc::new(net.nodes);
        let mut devs: Vec<Box<dyn Device>> = net.elements.iter().enumerate().map(|(k, e)| devices::build(e, k)).collect::<Result<_, _>>()?;
        // Las casillas de estado de cada dispositivo (las reparte `bind` en orden), para reponer uno quemado.
        let mut estados_de = Vec::with_capacity(devs.len());
        for (k, d) in devs.iter_mut().enumerate() {
            alloc.current = k;
            let desde = alloc.states;
            d.bind(&mut alloc);
            estados_de.push((desde, alloc.states));
        }
        let n = alloc.n;
        let solver: Box<dyn LinearSolver> = match kind {
            SolverKind::Dense => Box::new(DenseLu::try_new(n)?),
            #[cfg(feature = "faer")]
            SolverKind::Sparse => Box::new(crate::sparse::SparseLu::new(n)),
        };
        let ns = alloc.states;
        let linear = devs.iter().all(|d| d.linear());
        let con_quiebres = (0..devs.len()).filter(|&k| devs[k].tiene_quiebres()).collect();
        let con_union = (0..devs.len()).filter(|&k| devs[k].tiene_union()).collect();
        let con_puente = (0..devs.len()).filter(|&k| devs[k].nivel_logico().is_some()).collect();
        let estatico = devs.iter().all(|d| !d.tiene_dinamica());
        let (fijos, variables): (Vec<usize>, Vec<usize>) = (0..devs.len()).partition(|&k| devs[k].estampa_fija());
        let con_trunc = (0..devs.len()).filter(|&k| devs[k].tiene_dinamica()).collect();
        let no_lineales = (0..devs.len()).filter(|&k| !devs[k].linear()).collect();
        let con_accept = (0..devs.len()).filter(|&k| devs[k].usa_accept()).collect();
        let con_estado = (0..devs.len()).filter(|&k| devs[k].tiene_estado()).collect();
        let ne = net.elements.len();
        let usados: Vec<usize> = net.elements.iter().flat_map(Element::canales_usados).collect();
        let canales = Canales::nuevo(&net.canales, &usados);
        let mut term_inicio = Vec::with_capacity(ne + 1);
        let mut term_nodo = Vec::new();
        for e in &net.elements {
            term_inicio.push(term_nodo.len());
            term_nodo.extend(e.nodes());
            term_nodo.push(0);
        }
        term_inicio.push(term_nodo.len());
        Ok(Self {
            nodes: net.nodes,
            canales,
            lectores: net.lectores,
            programadas: Vec::new(),
            listas: Vec::new(),
            elements: net.elements,
            devs,
            n,
            is_current: alloc.is_current,
            owner: alloc.owner,
            solver,
            rhs: vec![0.0; n],
            x: vec![0.0; n],
            x_new: vec![0.0; n],
            x_acc: vec![0.0; n],
            st: [vec![0.0; ns], vec![0.0; ns], vec![0.0; ns], vec![0.0; ns]],
            t: 0.0,
            hmax: h,
            hmin: h * 1e-9,
            // El primer paso es mil veces más corto que el máximo (ngspice llega a algo parecido con sus puntos de quiebre):
            // al encender, un capacitor descargado frente a una fuente es un pico de pocos nanosegundos.
            delta: h * 1e-3,
            delta_old: [h; 4],
            order: 1,
            zz_paso: vec![0.0; n],
            zz_vueltas: vec![0; n],
            zz_racha: 0,
            zz_euler: 0,
            first: true,
            at_break: true,
            save_delta: h,
            steps: 0,
            max_iter: MAX_ITER,
            tol: Tol::default(),
            linear,
            factored: None,
            gshunt: 0.0,
            src: 1.0,
            events: Vec::new(),
            readings: vec![Reading::default(); ne],
            forzados: 0,
            iter_perdidas: 0,
            iter_presupuesto: DEFAULT_ITER_BUDGET,
            iter_en_curso: 0,
            agotado: false,
            rescate: None,
            forzado_desde: 0.0,
            forzado_i0: 0.0,
            forzado_k: None,
            con_quiebres,
            con_union,
            con_puente,
            hubo_cruce: false,
            localizaciones: 0,
            estatico,
            salto_desde: None,
            sondas_salto: Vec::new(),
            fijos,
            variables,
            con_trunc,
            no_lineales,
            con_accept,
            base_lista: false,
            rhs_base: vec![0.0; n],
            sondas: Vec::new(),
            promediar: false,
            acum_v: Vec::new(),
            acum_i: Vec::new(),
            t_promedio: 0.0,
            terminales: false,
            term_inicio,
            term_nodo,
            term_ult: Vec::new(),
            term_int: Vec::new(),
            term_abs: Vec::new(),
            term_propios: Vec::new(),
            term_ref: Vec::new(),
            acum_abs: Vec::new(),
            potencias: Vec::new(),
            pot_ult: Vec::new(),
            pot_int: Vec::new(),
            pot_nodos: Vec::new(),
            pot_simple: Vec::new(),
            con_estado,
            cruces: Vec::new(),
            cruces_perdidos: 0,
            quemados: Vec::new(),
            por_iniciar: Vec::new(),
            estados_de,
            perfil: Perfil::default(),
        })
    }

    /// Copia del estado de la isla (ver `EstadoTransient`).
    pub fn guardar(&self) -> EstadoTransient {
        EstadoTransient {
            x: self.x.clone(),
            x_acc: self.x_acc.clone(),
            st: self.st.clone(),
            t: self.t,
            delta: self.delta,
            delta_old: self.delta_old,
            order: self.order,
            zz_paso: self.zz_paso.clone(),
            zz_vueltas: self.zz_vueltas.clone(),
            zz_racha: self.zz_racha,
            zz_euler: self.zz_euler,
            first: self.first,
            at_break: self.at_break,
            save_delta: self.save_delta,
            steps: self.steps,
            gshunt: self.gshunt,
            src: self.src,
            readings: self.readings.clone(),
            forzados: self.forzados,
            rescate: self.rescate.clone(),
            forzado_desde: self.forzado_desde,
            forzado_i0: self.forzado_i0,
            forzado_k: self.forzado_k,
            hubo_cruce: self.hubo_cruce,
            localizaciones: self.localizaciones,
            acum_v: self.acum_v.clone(),
            acum_i: self.acum_i.clone(),
            t_promedio: self.t_promedio,
            term_ult: self.term_ult.clone(),
            term_int: self.term_int.clone(),
            term_abs: self.term_abs.clone(),
            acum_abs: self.acum_abs.clone(),
            pot_ult: self.pot_ult.clone(),
            pot_int: self.pot_int.clone(),
            por_iniciar: self.por_iniciar.clone(),
            devs: self.devs.iter().map(|d| (!d.sin_estado_propio()).then(|| d.clonar())).collect(),
            sondas: self.sondas.iter().map(|s| s.sonda.estado()).collect(),
            canales: self.canales.clone(),
            programadas: self.programadas.clone(),
        }
    }

    /// Vuelve al estado de `e`, que se guardó con la misma estructura (mismos elementos y dispositivos). La matriz se arma de
    /// nuevo en el paso siguiente, las sondas se recortan hasta lo que llevaban y lo que el estado anterior dejó sin leer
    /// (fusibles fundidos, cambios que se oyen) se descarta.
    pub fn restaurar(&mut self, e: &EstadoTransient) {
        self.x.clone_from(&e.x);
        self.x_new.clone_from(&e.x);
        self.x_acc.clone_from(&e.x_acc);
        self.st.clone_from(&e.st);
        self.t = e.t;
        self.salto_desde = None;
        self.delta = e.delta;
        self.delta_old = e.delta_old;
        self.order = e.order;
        self.zz_paso.clone_from(&e.zz_paso);
        self.zz_vueltas.clone_from(&e.zz_vueltas);
        self.zz_racha = e.zz_racha;
        self.zz_euler = e.zz_euler;
        self.first = e.first;
        self.at_break = e.at_break;
        self.save_delta = e.save_delta;
        self.steps = e.steps;
        self.gshunt = e.gshunt;
        self.src = e.src;
        self.readings.clone_from(&e.readings);
        self.forzados = e.forzados;
        self.rescate = e.rescate.clone();
        self.forzado_desde = e.forzado_desde;
        self.forzado_i0 = e.forzado_i0;
        self.forzado_k = e.forzado_k;
        self.hubo_cruce = e.hubo_cruce;
        self.localizaciones = e.localizaciones;
        self.acum_v.clone_from(&e.acum_v);
        self.acum_i.clone_from(&e.acum_i);
        self.t_promedio = e.t_promedio;
        self.term_ult.clone_from(&e.term_ult);
        self.term_int.clone_from(&e.term_int);
        self.term_abs.clone_from(&e.term_abs);
        self.acum_abs.clone_from(&e.acum_abs);
        self.pot_ult.clone_from(&e.pot_ult);
        self.pot_int.clone_from(&e.pot_int);
        self.por_iniciar.clone_from(&e.por_iniciar);
        self.canales.clone_from(&e.canales);
        self.programadas.clone_from(&e.programadas);
        self.listas.clear();
        for (d, g) in self.devs.iter_mut().zip(&e.devs) {
            if let Some(g) = g {
                *d = g.clonar();
            }
        }
        for (s, g) in self.sondas.iter_mut().zip(&e.sondas) {
            s.sonda.recortar(g);
        }
        // Lo que se arma en cada paso: la factorización y la base de las estampas fijas.
        self.factored = None;
        self.base_lista = false;
        self.events.clear();
        self.cruces.clear();
        self.cruces_perdidos = 0;
        self.iter_perdidas = 0;
        self.iter_en_curso = 0;
        self.agotado = false;
    }

    /// Si no tiene dinámica (salta entre eventos).
    pub fn es_estatico(&self) -> bool {
        self.estatico
    }

    /// Como `advance_to`, pero se detiene tras el primer paso en que un puente de entrada cambió de nivel. Devuelve los pasos dados y si hubo cruce. No reinicia la cuenta de iteraciones perdidas: lo hace `Mixto` una vez por llamada.
    pub fn advance_hasta_cruce(&mut self, t_end: f64, max_steps: u32) -> Result<(u32, bool), EngineError> {
        let mut steps = 0;
        while self.t + self.hmin < self.meta(t_end) && steps < max_steps {
            // Una isla sin dinámica (resistencias, LED, fuentes continuas, puentes) no cambia entre eventos: salta a la meta en
            // cuanto no hay una rampa en curso ni una discontinuidad pendiente.
            if self.estatico && !self.first && !self.at_break && self.next_break() == f64::INFINITY {
                if self.salto_desde.is_none() {
                    self.salto_desde = Some(self.t);
                    self.sondas_salto.clear();
                    self.sondas_salto.extend(self.sondas.iter().map(|s| s.sonda.estado()));
                }
                let h = t_end - self.t;
                self.t = t_end;
                self.tramo_quieto(h);
                steps += 1;
                break;
            }
            self.hubo_cruce = false;
            self.step_until(self.meta(t_end))?;
            steps += 1;
            if self.hubo_cruce {
                return Ok((steps, true));
            }
        }
        Ok((steps, false))
    }

    /// El instante en que cambió por última vez el nivel del elemento `k` si es un puente de entrada.
    pub fn instante_cambio(&self, k: usize) -> Option<f64> {
        self.devs.get(k).and_then(|d| d.instante_cambio())
    }

    /// El nivel que lee el elemento `k` si es un puente de entrada.
    pub fn nivel_logico(&self, k: usize) -> Option<Nivel> {
        self.devs.get(k).and_then(|d| d.nivel_logico())
    }

    /// El puente de salida `k` pasa a `n` ahora (`inmediato`: en el arranque, sin rampa). Es una discontinuidad: el paso
    /// siguiente empieza con Euler y corto. false si el elemento no es un puente de salida.
    pub fn fijar_nivel(&mut self, k: usize, n: Nivel, inmediato: bool) -> bool {
        self.fijar_nivel_bit(k, 0, n, inmediato)
    }

    /// Como `fijar_nivel` para un elemento que lee varias redes (el convertidor multiplicador): `bit` es la posición de la red en sus entradas.
    pub fn fijar_nivel_bit(&mut self, k: usize, bit: usize, n: Nivel, inmediato: bool) -> bool {
        let t = self.t;
        let Some(d) = self.devs.get_mut(k) else { return false };
        if !d.fijar_nivel_bit(t, bit, n, inmediato) {
            return false;
        }
        self.factored = None;
        if !inmediato {
            self.at_break = true;
            self.save_delta = self.save_delta.max(self.delta);
        }
        true
    }

    /// Cuántas veces dejó un bit sin nivel definido el elemento `k` (0 si no lleva esa cuenta).
    pub fn indefinidos(&self, k: usize) -> u64 {
        self.devs.get(k).map_or(0, |d| d.indefinidos())
    }

    /// Cuántas veces dejó un bit sin nivel definido el elemento `k` durante más de un microsegundo (0 si no lleva esa cuenta).
    pub fn indefinidos_persistentes(&self, k: usize) -> u64 {
        self.devs.get(k).map_or(0, |d| d.indefinidos_persistentes())
    }

    /// El paso más corto que da el motor (una milmillonésima del máximo).
    pub fn hmin(&self) -> f64 {
        self.hmin
    }

    /// Agrega la sonda `id` (su número en la netlist completa). Antes del primer paso aceptado la solución es el vector cero,
    /// que no es un valor del circuito (una fuente de 5 V se leería en 0 V y dispararía un disparo sin cruce): la sonda
    /// empieza a registrar con el primer paso.
    pub fn agregar_sonda(&mut self, id: usize, medida: Medida, mut sonda: Sonda) {
        sonda.fijar_columna_minima(self.hmax);
        if self.salto_desde.is_some() {
            self.sondas_salto.push(sonda.estado());
        }
        if !self.first {
            sonda.empujar(self.t, self.medir(medida));
        }
        self.sondas.push(SondaIsla { id, medida, sonda });
    }

    pub fn sonda(&self, id: usize) -> Option<&Sonda> {
        self.sondas.iter().find(|s| s.id == id).map(|s| &s.sonda)
    }

    pub fn sonda_mut(&mut self, id: usize) -> Option<&mut Sonda> {
        self.sondas.iter_mut().find(|s| s.id == id).map(|s| &mut s.sonda)
    }

    fn medir(&self, m: Medida) -> f64 {
        match m {
            Medida::Voltaje { p, n } => self.voltage(p) - self.voltage(n),
            Medida::Corriente { elemento, signo } => signo * self.readings[elemento].i,
        }
    }

    fn registrar_sondas(&mut self) {
        let t = self.t;
        for k in 0..self.sondas.len() {
            if !self.sondas[k].sonda.activa() {
                continue;
            }
            let v = self.medir(self.sondas[k].medida);
            self.sondas[k].sonda.empujar(t, v);
        }
    }

    /// La isla avanzó `h` sin cambiar nada (una isla sin dinámica saltó a la meta): los promedios suman el valor constante y
    /// las sondas registran el instante nuevo.
    fn tramo_quieto(&mut self, h: f64) {
        self.acumular_quieto(h);
        if !self.sondas.is_empty() {
            self.registrar_sondas();
        }
    }

    /// Lo que suma un salto de `h` sin pasos: el estado que no es de la matriz y los promedios. Con `h` negativo lo deshace (todo es
    /// lineal en `h` salvo el calentamiento del fusible, cuya exponencial se invierte exacta).
    fn acumular_quieto(&mut self, h: f64) {
        // El estado que no es de la matriz sigue con las mismas entradas (el calentamiento de un fusible).
        for (r, d) in self.readings.iter_mut().zip(self.devs.iter_mut()) {
            if d.avanzar_quieto(h) {
                *r = d.reading(&self.x_acc, &self.st[1]);
            }
        }
        if self.promediar {
            for k in 0..self.acum_v.len() {
                self.acum_v[k] += self.x_acc[k] * h;
            }
            for (k, r) in self.readings.iter().enumerate() {
                self.acum_i[k] += r.i * h;
            }
            // Las corrientes por terminal y las potencias, constantes durante el salto.
            if self.terminales {
                for (k, r) in self.readings.iter().enumerate() {
                    self.acum_abs[k] += r.i.abs() * h;
                }
                for j in 0..self.term_ult.len() {
                    self.term_int[j] += self.term_ult[j] * h;
                    self.term_abs[j] += self.term_ult[j].abs() * h;
                }
            }
            for q in 0..self.potencias.len() {
                self.pot_int[q] += self.pot_ult[q] * h;
            }
        }
    }

    /// Regresa una isla que salta sin pasos a `t` (o al inicio del salto), deshaciendo promedios y recortando sondas, para que un
    /// cambio en caliente se vea desde `t`. Devuelve si regresó.
    pub fn retroceder_salto(&mut self, t: f64) -> bool {
        let Some(desde) = self.salto_desde else { return false };
        let t = t.max(desde);
        if self.at_break || t >= self.t {
            return false;
        }
        let h = self.t - t;
        self.acumular_quieto(-h);
        self.t = t;
        if self.sondas_salto.len() == self.sondas.len() {
            for (s, e) in self.sondas.iter_mut().zip(&self.sondas_salto) {
                s.sonda.recortar(e);
            }
            if t > desde {
                self.registrar_sondas();
            }
        }
        true
    }

    /// Empieza a integrar los voltajes de nodo y las corrientes: cuesta un recorrido más por paso aceptado.
    pub fn activar_promedios(&mut self) {
        self.promediar = true;
        self.acum_v = vec![0.0; self.nodes - 1];
        self.acum_i = vec![0.0; self.devs.len()];
        self.t_promedio = self.t;
    }

    pub fn reiniciar_promedios(&mut self) {
        self.acum_v.fill(0.0);
        self.acum_i.fill(0.0);
        self.term_int.fill(0.0);
        self.term_abs.fill(0.0);
        self.acum_abs.fill(0.0);
        self.pot_int.fill(0.0);
        self.t_promedio = self.t;
    }

    /// Empieza (o deja) de integrar la corriente de cada terminal y su valor absoluto, con los promedios (que activa si
    /// no lo estaban). Apagado no cuesta nada por paso.
    pub fn activar_terminales(&mut self, si: bool) {
        if !si {
            self.terminales = false;
            return;
        }
        if !self.promediar {
            self.activar_promedios();
        }
        let n = self.term_nodo.len();
        self.term_ult = vec![0.0; n];
        self.term_int = vec![0.0; n];
        self.term_abs = vec![0.0; n];
        // ∫|i|·dt desde el último reinicio, como `acum_i`: lo que ya pasó del intervalo cuenta con el valor absoluto de su integral.
        self.acum_abs = self.acum_i.iter().map(|x| x.abs()).collect();
        self.repartir_terminales();
        // Desde el último paso aceptado: sin esto el primer intervalo partiría de cero.
        if !self.first {
            let Self { devs, readings, x_acc, st, term_inicio, term_ult, term_propios, .. } = self;
            for &k in term_propios.iter() {
                devs[k].corrientes(x_acc, &st[1], &readings[k], &mut term_ult[term_inicio[k]..term_inicio[k + 1]]);
            }
        }
        // Lo que ya pasó del intervalo cuenta con las del último paso, como si hubieran estado así: sin esto, activarlas a
        // mitad del intervalo daría una media más baja que la corriente (la integral empezaría en cero).
        let d = self.duracion_promedio();
        if d > 0.0 {
            for j in 0..n {
                self.term_int[j] = self.term_ult[j] * d;
                self.term_abs[j] = self.term_ult[j].abs() * d;
            }
        }
        self.terminales = true;
    }

    /// Quiénes escriben sus corrientes por terminal y quiénes llevan ±i de su lectura, y de dónde se lee cada casilla: con
    /// los de dos terminales (casi todos) solo se integran i y |i| por paso, sin llamar a cada dispositivo.
    fn repartir_terminales(&mut self) {
        let n = self.term_nodo.len();
        self.term_propios.clear();
        self.term_ref = (0..n).map(Casilla::Propia).collect();
        for k in 0..self.devs.len() {
            let (a, b) = (self.term_inicio[k], self.term_inicio[k + 1]);
            if !self.devs[k].corrientes_propias() && b - a == 3 {
                self.term_ref[a] = Casilla::Simple(k, 1.0);
                self.term_ref[a + 1] = Casilla::Simple(k, -1.0);
                self.term_ref[a + 2] = Casilla::Cero;
            } else {
                self.term_propios.push(k);
            }
        }
    }

    /// Casillas de corriente por terminal de todos los elementos (sus nodos más la tierra interna de cada uno).
    pub fn casillas_terminales(&self) -> usize {
        self.term_nodo.len()
    }

    /// La primera casilla del elemento `k` y la siguiente a su última.
    pub fn casillas_de(&self, k: usize) -> (usize, usize) {
        (self.term_inicio[k], self.term_inicio[k + 1])
    }

    /// El promedio de la corriente de la casilla `j` y el de su valor absoluto desde el último reinicio; sin tiempo integrado,
    /// la del último paso y su valor absoluto. (0, 0) con las corrientes por terminal apagadas.
    pub fn promedio_terminal(&self, j: usize) -> (f64, f64) {
        if !self.terminales {
            return (0.0, 0.0);
        }
        let d = self.duracion_promedio();
        match self.term_ref[j] {
            Casilla::Cero => (0.0, 0.0),
            Casilla::Simple(k, signo) => {
                if d > 0.0 { (signo * self.acum_i[k] / d, self.acum_abs[k] / d) } else { (signo * self.readings[k].i, self.readings[k].i.abs()) }
            }
            Casilla::Propia(j) => {
                if d > 0.0 { (self.term_int[j] / d, self.term_abs[j] / d) } else { (self.term_ult[j], self.term_ult[j].abs()) }
            }
        }
    }

    /// Las corrientes por terminal del elemento `k` en el último paso aceptado, calculadas ahora (las pruebas contra ngspice).
    pub fn corrientes_de(&self, k: usize, out: &mut [f64]) {
        let (a, b) = self.casillas_de(k);
        self.devs[k].corrientes(&self.x_acc, &self.st[1], &self.readings[k], &mut out[..b - a]);
    }

    /// Los elementos cuya potencia media se integra (los que pueden avisar de su potencia: resistencias, transistores,
    /// fusibles). Reemplaza la lista anterior y activa los promedios si no lo estaban.
    pub fn activar_potencias(&mut self, elementos: &[usize]) -> Result<(), EngineError> {
        if let Some(&k) = elementos.iter().find(|&&k| k >= self.devs.len()) {
            return Err(EngineError::Invalid(format!("elemento {k}: fuera de rango")));
        }
        if !self.promediar {
            self.activar_promedios();
        }
        self.potencias = elementos.to_vec();
        self.pot_ult = vec![0.0; elementos.len()];
        self.pot_int = vec![0.0; elementos.len()];
        self.repartir_potencias();
        if !self.first {
            for q in 0..self.potencias.len() {
                self.pot_ult[q] = self.potencia_q(q);
            }
        }
        // Como las corrientes por terminal: lo que ya pasó del intervalo, con la potencia del último paso.
        let d = self.duracion_promedio();
        for q in 0..self.potencias.len() {
            self.pot_int[q] = self.pot_ult[q] * d;
        }
        Ok(())
    }

    /// Los nodos de cada potencia que se calcula sin llamar al dispositivo (ver `pot_nodos`).
    fn repartir_potencias(&mut self) {
        self.pot_nodos = self
            .potencias
            .iter()
            .map(|&k| {
                let (a, b) = (self.term_inicio[k], self.term_inicio[k + 1]);
                if !self.devs[k].corrientes_propias() && b - a == 3 { (self.term_nodo[a], self.term_nodo[a + 1]) } else { (usize::MAX, 0) }
            })
            .collect();
        self.pot_simple = vec![u32::MAX; self.devs.len()];
        for (q, &(a, _)) in self.pot_nodos.iter().enumerate() {
            if a != usize::MAX {
                self.pot_simple[self.potencias[q]] = q as u32;
            }
        }
    }

    /// La potencia de la `q`-ésima de `activar_potencias` en el último paso aceptado.
    #[inline]
    fn potencia_q(&self, q: usize) -> f64 {
        let k = self.potencias[q];
        match self.pot_nodos[q] {
            (usize::MAX, _) => self.potencia_de(k),
            (a, b) => (self.voltage(a) - self.voltage(b)) * self.readings[k].i,
        }
    }

    /// La potencia que absorbe el elemento `k` en el último paso aceptado: la suma del voltaje de cada terminal por la corriente
    /// que entra por él (positiva si disipa).
    fn potencia_de(&self, k: usize) -> f64 {
        let (a, b) = self.casillas_de(k);
        let mut c = [0.0; CASILLAS_MAX];
        self.devs[k].corrientes(&self.x_acc, &self.st[1], &self.readings[k], &mut c[..b - a]);
        (a..b).map(|j| self.voltage(self.term_nodo[j]) * c[j - a]).sum()
    }

    /// La potencia media de la `q`-ésima de `activar_potencias` desde el último reinicio; sin tiempo integrado, la del último paso.
    pub fn promedio_potencia(&self, q: usize) -> f64 {
        let d = self.duracion_promedio();
        if d > 0.0 { self.pot_int[q] / d } else { self.pot_ult[q] }
    }

    /// Los cambios de estado que se oyen desde la última llamada, en orden (y cuenta de nuevo los que no caben).
    pub fn take_cruces(&mut self) -> Vec<Cruce> {
        let mut v = Vec::new();
        self.tomar_cruces(&mut v);
        v
    }

    /// Como `take_cruces`, pero los agrega a `out` sin reservar memoria (la lista conserva su capacidad para los pasos
    /// siguientes); devuelve cuántos no cupieron.
    pub fn tomar_cruces(&mut self, out: &mut Vec<Cruce>) -> u32 {
        let perdidos = self.cruces_perdidos;
        self.cruces_perdidos = 0;
        out.extend(self.cruces.drain(..));
        perdidos
    }

    /// Cuántos cambios de estado no se guardaron desde la última `take_cruces` (pasaron de `TOPE_CRUCES`).
    pub fn cruces_perdidos(&self) -> u32 {
        self.cruces_perdidos
    }

    /// «Las piezas se queman»: con `si`, el elemento `index` queda abierto en todos sus terminales (`Quemado`); sin
    /// él, vuelve el dispositivo de antes con su estado. Solo resistencias, diodos, transistores, capacitores, motores
    /// y amplificadores. Es una discontinuidad.
    pub fn quemar(&mut self, index: usize, si: bool) -> Result<(), EngineError> {
        let Some(e) = self.elements.get(index) else {
            return Err(EngineError::Invalid(format!("elemento {index}: fuera de rango")));
        };
        if !matches!(e, Element::R { .. } | Element::D { .. } | Element::Q { .. } | Element::M { .. } | Element::C { .. } | Element::Motor { .. } | Element::OA { .. }) {
            return Err(EngineError::Invalid(format!("elemento {index}: solo se queman resistencias, diodos, transistores, capacitores, motores y amplificadores")));
        }
        match (si, self.quemados.iter().position(|(k, _)| *k == index)) {
            (true, None) => {
                let nodos = e.nodes().into_iter().map(|n| if n == 0 { None } else { Some(n - 1) }).collect();
                let internas = (0..self.n).filter(|&i| self.owner[i] == Some(index)).collect();
                let original = std::mem::replace(&mut self.devs[index], Box::new(Quemado::new(nodos, internas)));
                self.quemados.push((index, original));
            }
            (false, Some(p)) => {
                let (_, original) = self.quemados.swap_remove(p);
                self.devs[index] = original;
                self.sembrar_estado(index);
                self.por_iniciar.push(index);
            }
            _ => return Ok(()),
        }
        // El quemado no es lineal ni tiene dinámica, uniones ni estampa fija: se vuelven a repartir los dispositivos como al
        // construir, y la base de las estampas fijas se arma de nuevo.
        let devs = &self.devs;
        self.linear = devs.iter().all(|d| d.linear());
        self.estatico = devs.iter().all(|d| !d.tiene_dinamica());
        self.con_quiebres = (0..devs.len()).filter(|&k| devs[k].tiene_quiebres()).collect();
        self.con_union = (0..devs.len()).filter(|&k| devs[k].tiene_union()).collect();
        (self.fijos, self.variables) = (0..devs.len()).partition(|&k| devs[k].estampa_fija());
        self.con_trunc = (0..devs.len()).filter(|&k| devs[k].tiene_dinamica()).collect();
        self.no_lineales = (0..devs.len()).filter(|&k| !devs[k].linear()).collect();
        self.con_accept = (0..devs.len()).filter(|&k| devs[k].usa_accept()).collect();
        // El quemado da su potencia por su dispositivo (no es de dos terminales con ±i).
        if !self.potencias.is_empty() {
            self.repartir_potencias();
        }
        // El quemado escribe sus propias corrientes por terminal (de todos sus terminales, casi nada).
        if self.terminales {
            self.repartir_terminales();
            let (a, b) = self.casillas_de(index);
            let mut c = [0.0; CASILLAS_MAX];
            self.devs[index].corrientes(&self.x_acc, &self.st[1], &self.readings[index], &mut c[..b - a]);
            self.term_ult[a..b].copy_from_slice(&c[..b - a]);
        }
        self.base_lista = false;
        self.factored = None;
        self.at_break = true;
        self.save_delta = self.save_delta.max(self.delta);
        Ok(())
    }

    /// El estado de un repuesto con los voltajes de ahora: mientras estuvo quemado sus casillas guardaron los de
    /// cuando se quemó. Se carga con la solución aceptada (sin estampar nada) y lo que deja en el estado del paso se toma como
    /// el de los pasos anteriores, unas veces (el limitador de las uniones acerca el voltaje de a poco).
    fn sembrar_estado(&mut self, index: usize) {
        let (a, b) = self.estados_de[index];
        if a == b {
            return;
        }
        for _ in 0..8 {
            let [s0, s1, s2, _] = &mut self.st;
            let mut descarte = Descarte;
            let mut c = Ctx {
                x: &self.x_acc,
                m: &mut descarte,
                rhs: &mut self.rhs,
                s0,
                s1,
                s2,
                mode: Mode::Float,
                order: 1,
                ag0: 1.0 / self.delta,
                ag1: 0.0,
                xfact: 0.0,
                t: self.t,
                h: self.delta,
                gmin: GMIN,
                src: self.src,
                canales: &self.canales,
            };
            self.devs[index].load(&mut c);
            let [s0, s1, s2, s3] = &mut self.st;
            s1[a..b].copy_from_slice(&s0[a..b]);
            s2[a..b].copy_from_slice(&s0[a..b]);
            s3[a..b].copy_from_slice(&s0[a..b]);
        }
    }

    /// Si el elemento `index` está quemado.
    pub fn quemado(&self, index: usize) -> bool {
        self.quemados.iter().any(|(k, _)| *k == index)
    }

    /// El tiempo simulado que llevan los promedios; 0 sin promedios activados.
    pub fn duracion_promedio(&self) -> f64 {
        if self.promediar { self.t - self.t_promedio } else { 0.0 }
    }

    /// El promedio del voltaje del nodo desde el último reinicio; sin tiempo integrado, el voltaje del último paso.
    pub fn promedio_v(&self, nodo: usize) -> f64 {
        let d = self.duracion_promedio();
        if nodo == 0 { 0.0 } else if d > 0.0 { self.acum_v[nodo - 1] / d } else { self.voltage(nodo) }
    }

    /// Lo mismo con la corriente del elemento `k`.
    pub fn promedio_i(&self, k: usize) -> f64 {
        let d = self.duracion_promedio();
        if d > 0.0 { self.acum_i[k] / d } else { self.readings[k].i }
    }

    /// Cambia las tolerancias (las pruebas contra ngspice usan las mismas que su netlist).
    pub fn set_tolerances(&mut self, tol: Tol) {
        self.tol = tol;
    }

    /// Cambia en caliente un elemento por otro del mismo tipo y con los mismos nodos (una resistencia, una fuente):
    /// no toca el tiempo, los capacitores, los inductores ni el estado de los dispositivos. Es una discontinuidad:
    /// el paso siguiente empieza con Euler.
    pub fn set_element(&mut self, index: usize, e: Element) -> Result<(), EngineError> {
        if index >= self.devs.len() {
            return Err(EngineError::Invalid(format!("elemento {index}: fuera de rango")));
        }
        Netlist { nodes: self.nodes, digital_nets: 0, elements: vec![e.clone()], sondas: Vec::new(), canales: vec![CanalDef { inicial: 0.0, forma: FormaCanal::Escalon }; self.canales.total()], lectores: Vec::new(), tablas: Vec::new() }.validate().map_err(|err| match err {
            EngineError::Invalid(m) => EngineError::Invalid(m.replacen("elemento 0", &format!("elemento {index}"), 1)),
            otro => otro,
        })?;
        comprobar_cuadrada(index, &e, self.hmax)?;
        // Una pieza quemada guarda el valor nuevo en su dispositivo original, el que vuelve al reponerla; el quemado
        // sigue abierto.
        if let Some(p) = self.quemados.iter().position(|(k, _)| *k == index) {
            if !self.quemados[p].1.set_en(&e, self.t) {
                return Err(EngineError::Invalid(format!(
                    "elemento {index}: solo se cambian en caliente resistencias y fuentes, con los mismos nodos"
                )));
            }
            self.elements[index] = e;
            return Ok(());
        }
        if !self.devs[index].set_en(&e, self.t) {
            return Err(EngineError::Invalid(format!(
                "elemento {index}: solo se cambian en caliente resistencias y fuentes, con los mismos nodos"
            )));
        }
        self.elements[index] = e;
        // Una fuente continua que pasa a senoidal (o al revés) cambia si la isla tiene dinámica: si no se recalcula, la isla
        // seguiría saltando entre eventos con el voltaje de antes.
        self.estatico = self.devs.iter().all(|d| !d.tiene_dinamica());
        self.con_trunc = (0..self.devs.len()).filter(|&k| self.devs[k].tiene_dinamica()).collect();
        // Un fusible de multímetro que cambió de modo puede volver a calentarse (o dejar de hacerlo).
        self.con_accept = (0..self.devs.len()).filter(|&k| self.devs[k].usa_accept()).collect();
        self.con_quiebres = (0..self.devs.len()).filter(|&k| self.devs[k].tiene_quiebres()).collect();
        self.factored = None;
        self.base_lista = false;
        self.at_break = true;
        self.save_delta = self.save_delta.max(self.delta);
        Ok(())
    }

    /// Cambia el paso máximo sin tocar el tiempo ni el estado (la frecuencia de una fuente cambió en caliente): el paso en curso
    /// se acorta si hace falta y el mínimo sigue al máximo. Es una discontinuidad como cualquier cambio en caliente.
    pub fn set_max_step(&mut self, h: f64) -> Result<(), EngineError> {
        self.comprobar_paso(h)?;
        self.hmax = h;
        for s in self.sondas.iter_mut() {
            s.sonda.fijar_columna_minima(h);
        }
        self.hmin = h * 1e-9;
        self.delta = self.delta.min(h);
        self.save_delta = self.save_delta.min(h);
        self.factored = None;
        self.at_break = true;
        Ok(())
    }

    /// El paso máximo.
    pub fn hmax(&self) -> f64 {
        self.hmax
    }

    /// Si `set_max_step(h)` lo aceptaría, sin cambiar nada (el simulador mixto revisa todas sus islas antes de cambiar una).
    pub fn comprobar_paso(&self, h: f64) -> Result<(), EngineError> {
        if !(h.is_finite() && h >= PASO_RANGO.0 && h <= PASO_RANGO.1) {
            return Err(EngineError::Invalid(format!("el paso de tiempo debe estar entre {:e} s y {:e} s", PASO_RANGO.0, PASO_RANGO.1)));
        }
        for (k, e) in self.elements.iter().enumerate() {
            comprobar_cuadrada(k, e, h)?;
        }
        Ok(())
    }

    /// La resistencia del elemento `index` (el cursor de un potenciómetro, un interruptor).
    /// Si el motor le pide `accept` al elemento `k` (las pruebas del fusible del multímetro).
    #[doc(hidden)]
    pub fn devs_usan_accept(&self, k: usize) -> bool {
        self.con_accept.contains(&k)
    }

    pub fn set_resistance(&mut self, index: usize, ohms: f64) -> Result<(), EngineError> {
        match self.elements.get(index) {
            Some(&Element::R { a, b, .. }) => self.set_element(index, Element::R { a, b, ohms }),
            // El rango del óhmetro del multímetro, que es un fusible con su fuente de prueba.
            Some(&Element::Fuse { a, b, inom, ifusion, tau, v, sin_carga, .. }) => self.set_element(index, Element::Fuse { a, b, ohms, inom, ifusion, tau, v, sin_carga }),
            Some(_) => Err(EngineError::Invalid(format!("elemento {index}: no es una resistencia"))),
            None => Err(EngineError::Invalid(format!("elemento {index}: fuera de rango"))),
        }
    }

    pub fn time(&self) -> f64 {
        self.t
    }

    pub fn steps(&self) -> u64 {
        self.steps
    }

    pub fn node_count(&self) -> usize {
        self.nodes
    }

    pub fn voltage(&self, node: usize) -> f64 {
        if node == 0 { 0.0 } else { self.x_acc[node - 1] }
    }

    pub fn voltages(&self) -> Vec<f64> {
        (0..self.nodes).map(|k| self.voltage(k)).collect()
    }

    /// Los voltajes de todos los nodos en `out`, que se reutiliza: no reserva memoria si ya cabe.
    pub fn voltages_into(&self, out: &mut Vec<f64>) {
        out.clear();
        out.extend((0..self.nodes).map(|k| self.voltage(k)));
    }

    pub fn element_count(&self) -> usize {
        self.devs.len()
    }

    /// Lecturas de cada elemento con la última solución aceptada, en el orden de la netlist.
    pub fn readings(&self) -> &[Reading] {
        &self.readings
    }

    /// Corriente de cada elemento en el último paso, en el orden de la netlist, de `a` hacia `b` a
    /// través del elemento (convención de signos pasiva: una fuente que entrega potencia da negativo).
    pub fn currents(&self) -> Vec<f64> {
        self.readings.iter().map(|r| r.i).collect()
    }

    /// Los fusibles que se fundieron desde la última llamada.
    pub fn take_events(&mut self) -> Vec<Event> {
        std::mem::take(&mut self.events)
    }

    /// Repone el dispositivo `index` (un fusible fundido queda entero): es una discontinuidad.
    pub fn reset_element(&mut self, index: usize) -> Result<(), EngineError> {
        let Some(d) = self.devs.get_mut(index) else {
            return Err(EngineError::Invalid(format!("elemento {index}: fuera de rango")));
        };
        if !d.reset() {
            return Err(EngineError::Invalid(format!("elemento {index}: no se puede reponer")));
        }
        self.factored = None;
        self.base_lista = false;
        self.at_break = true;
        Ok(())
    }

    /// Iteraciones perdidas (de intentos que no convergieron) que gastó la última llamada a `advance_to` o `step`: con el
    /// tiempo que tardó, la interfaz calcula cuánto cuesta una iteración y ajusta el presupuesto.
    pub fn lost_iterations(&self) -> usize {
        self.iter_perdidas
    }

    /// Empieza una llamada del simulador mixto: la cuenta de iteraciones perdidas vuelve a cero.
    pub fn empezar_llamada(&mut self) {
        self.iter_perdidas = 0;
        self.agotado = false;
    }

    /// Cambia el presupuesto de iteraciones perdidas por llamada (ver `DEFAULT_ITER_BUDGET`).
    pub fn set_iteration_budget(&mut self, n: usize) {
        self.iter_presupuesto = n;
    }

    /// Iteraciones de Newton por intento antes de acortar el paso (50 por omisión). Bajarlas fuerza el rescate de convergencia
    /// en circuitos que no lo necesitan: sirve para probar que el rescate y el presupuesto funcionan juntos.
    pub fn set_max_iter(&mut self, n: usize) {
        self.max_iter = n;
    }

    /// Da un paso de tiempo aceptado (el motor elige su duración, a lo más `h`).
    pub fn step(&mut self) -> Result<(), EngineError> {
        self.iter_perdidas = 0;
        self.agotado = false;
        self.step_until(f64::INFINITY)
    }

    /// Avanza hasta `t_end` (el último paso cae justo ahí) o hasta dar `max_steps` pasos; devuelve los pasos dados.
    pub fn advance_to(&mut self, t_end: f64, max_steps: u32) -> Result<u32, EngineError> {
        self.iter_perdidas = 0;
        self.agotado = false;
        let mut steps = 0;
        while self.t + self.hmin < self.meta(t_end) && steps < max_steps {
            self.step_until(self.meta(t_end))?;
            steps += 1;
        }
        Ok(steps)
    }

    /// Margen con que se comparan instantes (medio paso mínimo).
    fn eps(&self) -> f64 {
        0.5 * self.hmin
    }

    fn next_break(&self) -> f64 {
        let mut m = self.con_quiebres.iter().map(|&k| self.devs[k].next_break(self.t)).fold(f64::INFINITY, f64::min);
        if !self.canales.vacio() {
            m = m.min(self.canales.proximo(self.t, self.eps()));
        }
        if !self.programadas.is_empty() {
            let eps = self.eps();
            for &(ts, _) in &self.programadas {
                let e = self.instante_de_muestra(ts);
                if e > self.t + eps {
                    m = m.min(e);
                }
            }
        }
        m
    }

    /// Cuándo se toma la muestra pedida para `ts`: en `ts`, o un instante después si un canal cambia justo en `ts` (así lee el valor nuevo).
    fn instante_de_muestra(&self, ts: f64) -> f64 {
        if self.canales.hay_cambio_en(ts, self.eps()) { ts + ASTILLA_MUESTRA * self.hmin } else { ts }
    }

    /// Hasta dónde llega una llamada que pidió `t_end`: una muestra pedida en `t_end` con un cambio de canal en el mismo instante necesita un paso más.
    fn meta(&self, t_end: f64) -> f64 {
        if self.programadas.is_empty() {
            return t_end;
        }
        let eps = self.eps();
        self.programadas.iter().filter(|&&(ts, _)| ts <= t_end + eps).fold(t_end, |m, &(ts, _)| m.max(self.instante_de_muestra(ts)))
    }

    /// Lo que mide el lector `l` con el último paso aceptado.
    fn leer_lector(&self, l: usize) -> f64 {
        match self.lectores[l] {
            LectorDef::V { p, n } => self.voltage(p) - self.voltage(n),
            LectorDef::I { elemento } => self.readings[elemento].i,
        }
    }

    fn capturar_muestras(&mut self) {
        let eps = self.eps();
        let mut k = 0;
        while k < self.programadas.len() {
            let (ts, l) = self.programadas[k];
            if self.t + eps >= self.instante_de_muestra(ts) {
                let v = self.leer_lector(l);
                self.listas.push(MuestraLocal { lector: l, t: ts, v });
                self.programadas.remove(k);
            } else {
                k += 1;
            }
        }
    }

    /// Encola el cambio de un canal a `v` en `t`. Un `t` anterior al tiempo de la isla se aplica en el tiempo de la isla (y
    /// devuelve true: llegó tarde). Un canal que la isla no lee no hace nada.
    pub fn poner_valor(&mut self, canal: usize, t: f64, v: f64) -> Result<bool, EngineError> {
        if !self.canales.tiene(canal) {
            return Ok(false);
        }
        let eps = self.eps();
        self.canales.compactar(self.t, eps);
        // Un cambio a menos de un paso mínimo se aplica ya: un quiebre tan pegado no se puede alcanzar.
        let te = if t <= self.t + self.hmin { self.t } else { t };
        self.canales.poner(canal, te, v, self.t)?;
        // Un cambio de este instante es una discontinuidad: el paso siguiente es de Euler y no se salta aunque la isla esté quieta.
        if te <= self.t + eps {
            self.at_break = true;
            self.save_delta = self.save_delta.max(self.delta);
        }
        Ok(t < self.t - eps)
    }

    /// Pasa a ser el valor vigente todo cambio hasta el tiempo de la isla (libera lugar en las colas).
    pub fn compactar_canales(&mut self) {
        let eps = self.eps();
        self.canales.compactar(self.t, eps);
    }

    /// La cola de cambios del canal no admite otro.
    pub fn canal_lleno(&self, canal: usize) -> bool {
        self.canales.lleno(canal)
    }

    /// La isla lee el canal.
    pub fn lee_canal(&self, canal: usize) -> bool {
        self.canales.tiene(canal)
    }

    /// El valor vigente del canal en el tiempo de la isla (NaN si no lo lee).
    pub fn valor_canal(&self, canal: usize) -> f64 {
        self.canales.valor(canal, self.t, self.t)
    }

    /// El próximo cambio de los canales que lee después de su tiempo; infinito si no hay (o si no lee ninguno).
    pub fn proximo_cambio_canal(&self) -> f64 {
        if self.canales.vacio() { f64::INFINITY } else { self.canales.proximo(self.t, self.eps()) }
    }

    /// Programa la lectura del lector `lector` en `t`: el paso cae exacto ahí y la muestra es de un paso aceptado. Si `t` ya
    /// pasó se responde con la lectura vigente y el tiempo de la isla.
    pub fn pedir_muestra(&mut self, lector: usize, t: f64) -> Result<(), EngineError> {
        if lector >= self.lectores.len() {
            return Err(EngineError::Invalid(format!("lector {lector} fuera de rango")));
        }
        let eps = self.eps();
        if t < self.t - eps {
            let v = self.leer_lector(lector);
            self.listas.push(MuestraLocal { lector, t: self.t, v });
        } else if t <= self.t + self.hmin && !self.canales.hay_cambio_en(t, eps) {
            let v = self.leer_lector(lector);
            self.listas.push(MuestraLocal { lector, t, v });
        } else {
            self.programadas.push((t, lector));
        }
        Ok(())
    }

    /// Pasa a `out` las muestras ya tomadas.
    pub fn tomar_muestras(&mut self, out: &mut Vec<MuestraLocal>) {
        out.append(&mut self.listas);
    }

    /// Cuántas muestras esperan su instante.
    pub fn muestras_programadas(&self) -> usize {
        self.programadas.len()
    }

    /// La lectura del lector con el último paso aceptado, sin programar nada.
    pub fn leer_ahora(&self, lector: usize) -> Option<f64> {
        (lector < self.lectores.len()).then(|| self.leer_lector(lector))
    }

    /// Un paso aceptado que no pasa de `stop`. Los intentos fallidos o con demasiado error se repiten más cortos.
    fn step_until(&mut self, stop: f64) -> Result<(), EngineError> {
        self.salto_desde = None;
        loop {
            let brk = self.next_break();
            let mut delta = self.delta.min(self.hmax);
            if self.zz_euler > 0 {
                self.order = 1;
            }
            if self.at_break {
                self.order = 1;
                delta = delta.min(0.1 * self.save_delta.min(brk - self.t)).max(2.0 * self.hmin);
            }
            let mut en_quiebre = false;
            if self.t + delta >= brk {
                self.save_delta = delta;
                delta = brk - self.t;
                en_quiebre = true;
            } else if self.t + 1.9 * delta > brk {
                delta = (brk - self.t) / 2.0;
            }
            let mut planeado = None;
            if self.t + delta > stop {
                planeado = Some(delta);
                delta = stop - self.t;
                en_quiebre = false;
            } else if stop - (self.t + delta) < RESTO_MIN * delta && !(en_quiebre && brk < stop) {
                // Un paso que quedaría a una astilla de `stop` (el redondeo de sumar cientos de pasos iguales) se estira
                // hasta él: si no, el último paso de la llamada mide 1e-13 s y ahí Newton no converge (ver `RESTO_MIN`).
                // No cruza un quiebre: el que está antes de `stop` (la muestra tras un cambio de canal) acaba el paso.
                delta = stop - self.t;
            }
            match self.attempt(delta) {
                Ok(()) => {}
                // Una matriz singular en un circuito no lineal puede ser pasajera (el punto de trabajo de una iteración
                // deja un nodo sin conductancia): se trata como falta de convergencia y se acorta el paso.
                Err(e) if self.reintentable(&e) => {
                    self.perfil.fallos += 1;
                    let element = match e {
                        EngineError::NoConvergence { element, .. } | EngineError::Singular { element } => element,
                        _ => None,
                    };
                    self.x.copy_from_slice(&self.x_acc);
                    self.order = 1;
                    // Tras una discontinuidad el paso no baja de 2 hmin: de ahí para abajo ya es el mínimo.
                    if delta > 2.0 * self.hmin {
                        self.delta = (delta / 8.0).max(self.hmin);
                        continue;
                    }
                    let t = self.t + delta;
                    self.rescue(t, delta).map_err(|e| self.culpar(e, t, element))?;
                }
                Err(e) => {
                    self.x.copy_from_slice(&self.x_acc);
                    return Err(e);
                }
            }
            // Una unión empujada a conducir corrientes absurdas durante varios pasos y un tiempo seguidos: el circuito no
            // tiene un punto de trabajo razonable (un LED sin resistencia sobre una fuente). El pico de un capacitor
            // que se carga, de pocos nanosegundos, no cuenta.
            let (forzada, corriente) = self.union_mas_cargada();
            let desde = if self.forzados == 0 { self.t } else { self.forzado_desde };
            let primera = if self.forzados == 0 { corriente } else { self.forzado_i0 };
            // El pico de un capacitor que se carga cae como 1/t; una unión sobre una fuente se queda plana.
            let sin_decaer = corriente >= 0.9 * primera;
            if forzada.is_some() && self.forzados + 1 >= PASOS_FORZADOS && self.t + delta - desde >= PERSISTENCIA_FORZADA * self.hmax && sin_decaer {
                self.x.copy_from_slice(&self.x_acc);
                return Err(EngineError::DiodoSinLimite { element: forzada });
            }
            // Error de truncamiento: el primer paso no se revisa (como en ngspice). El orden con que se intentó el paso se
            // guarda: si la localización lo repite, se repite con ese orden y no con el que el error pidió para el siguiente.
            let orden_del_intento = self.order;
            let mut lte = f64::INFINITY;
            let mut newdelta = (2.0 * delta).min(self.hmax);
            if !self.first {
                #[cfg(feature = "perfil")]
                let tt = std::time::Instant::now();
                lte = self.truncation(self.order, delta);
                #[cfg(feature = "perfil")]
                {
                    self.perfil.ns_trunc += tt.elapsed().as_nanos() as u64;
                }
                newdelta = newdelta.min(lte);
                if newdelta <= 0.9 * delta && delta > 2.0 * self.hmin {
                    // Se rechaza el punto y se repite con el paso que pide el error.
                    self.perfil.rechazos_lte += 1;
                    self.x.copy_from_slice(&self.x_acc);
                    self.delta = newdelta.max(self.hmin);
                    continue;
                }
                if self.order == 1 && self.zz_euler == 0 {
                    let lte2 = self.truncation(2, delta);
                    let dt2 = (2.0 * delta).min(lte2).min(self.hmax);
                    if dt2 > 1.05 * delta {
                        self.order = 2;
                        newdelta = dt2;
                        lte = lte2;
                    }
                }
            }
            // Un puente de entrada cruzó su umbral dentro del paso: se repite terminando medio TOLERANCIA_CRUCE después del
            // cruce estimado, para que el paso aceptado acabe justo después de él (localización).
            if !self.con_puente.is_empty() && self.localizaciones < MAX_LOCALIZACIONES && delta > 2.0 * self.hmin {
                let theta = self.con_puente.iter().filter_map(|&k| self.devs[k].cruce(&self.x_acc, &self.x)).fold(1.0f64, f64::min);
                if theta < 1.0 && (1.0 - theta) * delta > TOLERANCIA_CRUCE {
                    self.localizaciones += 1;
                    self.order = orden_del_intento;
                    self.x.copy_from_slice(&self.x_acc);
                    self.delta = (theta * delta + 0.5 * TOLERANCIA_CRUCE).max(self.hmin);
                    continue;
                }
            }
            self.localizaciones = 0;
            self.forzado_desde = desde;
            self.forzado_i0 = primera;
            self.forzado_k = forzada;
            self.forzados = if forzada.is_some() { self.forzados + 1 } else { 0 };
            #[cfg(feature = "perfil")]
            let ta = std::time::Instant::now();
            self.accept(delta, en_quiebre);
            #[cfg(feature = "perfil")]
            {
                self.perfil.ns_accept += ta.elapsed().as_nanos() as u64;
            }
            // Un paso recortado para caer en `stop` no frena al siguiente: vuelve el paso planeado si el error lo permite.
            self.delta = match planeado {
                Some(p) => p.min(lte).min(self.hmax),
                None => newdelta,
            }
            .max(self.hmin);
            return Ok(());
        }
    }

    /// Un fallo que se repara con un paso más corto o con el rescate de convergencia.
    fn reintentable(&self, e: &EngineError) -> bool {
        match e {
            EngineError::NoConvergence { .. } => true,
            EngineError::Singular { .. } => !self.linear,
            _ => false,
        }
    }

    /// El dispositivo con la unión más cargada (si pasa de `CORRIENTE_FORZADA`) y su corriente, con el estado del paso.
    fn union_mas_cargada(&self) -> (Option<usize>, f64) {
        let mut mejor = (None, 0.0);
        for &k in &self.con_union {
            let i = self.devs[k].junction_current(&self.st[0]);
            if i > CORRIENTE_FORZADA && i > mejor.1 {
                mejor = (Some(k), i);
            }
        }
        mejor
    }

    /// El error final tras el rescate: si los pasos aceptados venían con una unión forzada, se culpa a ella (el estado de
    /// la última iteración fallida no cuenta: puede ser cualquier cosa); si no, se agrega el sospechoso.
    fn culpar(&self, e: EngineError, t: f64, element: Option<usize>) -> EngineError {
        if self.forzados > 0 && self.forzado_k.is_some() && matches!(e, EngineError::NoConvergence { .. } | EngineError::Singular { .. }) {
            return EngineError::DiodoSinLimite { element: self.forzado_k };
        }
        match e {
            EngineError::NoConvergence { element: otro, .. } => EngineError::NoConvergence { t, element: otro.or(element) },
            EngineError::Singular { element: otro } => EngineError::Singular { element: otro.or(element) },
            e => e,
        }
    }

    /// El elemento dueño de la incógnita `i`: el que pidió la interna o, en un nodo externo, el sospechoso de tocarlo.
    fn owner_of(&self, i: usize) -> Option<usize> {
        self.owner.get(i).copied().flatten().or_else(|| self.element_of_unknown(i))
    }

    /// El paso más largo que permite el error de truncamiento de todas las cargas con el orden `order`.
    fn truncation(&self, order: u8, delta: f64) -> f64 {
        let mut d = self.delta_old;
        d[0] = delta;
        let h = Hist { s: [&self.st[0], &self.st[1], &self.st[2], &self.st[3]], delta_old: d, order, tol: self.tol };
        let mut dt = f64::INFINITY;
        // Solo los que tienen dinámica tienen cargas que acotan el paso (los demás no hacen nada en `trunc`).
        for &k in &self.con_trunc {
            self.devs[k].trunc(&h, &mut dt);
        }
        dt
    }

    fn accept(&mut self, delta: f64, en_quiebre: bool) {
        self.t += delta;
        self.steps += 1;
        if self.first {
            // El estado del instante 0 se toma como los dos anteriores (los pasos previos no existen).
            let [_, s1, s2, s3] = &mut self.st;
            s2.copy_from_slice(s1);
            s3.copy_from_slice(s1);
        }
        self.st.rotate_right(1);
        let [s0, s1, ..] = &mut self.st;
        s0.copy_from_slice(s1);
        self.delta_old = [delta, delta, self.delta_old[1], self.delta_old[2]];
        self.first = false;
        self.por_iniciar.clear();
        self.at_break = en_quiebre;
        if self.promediar {
            // Trapecio entre el paso aceptado anterior (aún en `x_acc`) y este.
            for k in 0..self.acum_v.len() {
                self.acum_v[k] += 0.5 * (self.x_acc[k] + self.x[k]) * delta;
            }
        }
        self.vigilar_zigzag();
        self.x_acc.copy_from_slice(&self.x);
        let mut discontinuidad = false;
        for &k in &self.con_accept {
            discontinuidad |= self.devs[k].accept(&self.x, &self.st[1], self.t, delta, &mut self.events);
        }
        if discontinuidad {
            self.at_break = true;
            self.save_delta = self.save_delta.max(delta);
            self.factored = None;
            self.base_lista = false;
        }
        for &k in &self.con_puente {
            if self.devs[k].tomar_cambio() {
                self.hubo_cruce = true;
            }
        }
        let con_potencias = !self.potencias.is_empty();
        for (k, (r, d)) in self.readings.iter_mut().zip(&self.devs).enumerate() {
            let nueva = d.reading(&self.x_acc, &self.st[1]);
            if self.promediar {
                self.acum_i[k] += 0.5 * (r.i + nueva.i) * delta;
                // Con la corriente animada, también ∫|i|·dt (la media absoluta de los de dos terminales).
                if self.terminales {
                    self.acum_abs[k] += 0.5 * (r.i.abs() + nueva.i.abs()) * delta;
                }
            }
            // La potencia de uno de dos terminales, (V(a) − V(b))·i, en el mismo recorrido.
            if con_potencias {
                let q = self.pot_simple[k];
                if q != u32::MAX {
                    let q = q as usize;
                    let (a, b) = self.pot_nodos[q];
                    let v = |n: usize| if n == 0 { 0.0 } else { self.x_acc[n - 1] };
                    let p = (v(a) - v(b)) * nueva.i;
                    self.pot_int[q] += 0.5 * (self.pot_ult[q] + p) * delta;
                    self.pot_ult[q] = p;
                }
            }
            *r = nueva;
        }
        // Corrientes por terminal, potencias de los demás y cambios de estado que se oyen.
        if self.terminales {
            self.integrar_terminales(delta);
        }
        for q in 0..self.potencias.len() {
            if self.pot_nodos[q].0 != usize::MAX {
                continue;
            }
            let p = self.potencia_de(self.potencias[q]);
            self.pot_int[q] += 0.5 * (self.pot_ult[q] + p) * delta;
            self.pot_ult[q] = p;
        }
        if !self.canales.vacio() {
            let eps = self.eps();
            self.canales.compactar(self.t, eps);
        }
        if !self.programadas.is_empty() {
            self.capturar_muestras();
        }
        for i in 0..self.con_estado.len() {
            let k = self.con_estado[i];
            if let Some((nivel, t)) = self.devs[k].tomar_estado() {
                if self.cruces.len() < TOPE_CRUCES {
                    self.cruces.push(Cruce { element: k, t, nivel });
                } else {
                    self.cruces_perdidos = self.cruces_perdidos.saturating_add(1);
                }
            }
        }
        if !self.sondas.is_empty() {
            self.registrar_sondas();
        }
    }

    /// Trapecio de cada corriente por terminal de los de corrientes propias y de su valor absoluto entre el paso aceptado
    /// anterior y este (los de dos terminales ya se integraron con las lecturas, en `acum_i` y `acum_abs`).
    fn integrar_terminales(&mut self, delta: f64) {
        let Self { devs, readings, x_acc, st, term_inicio, term_ult, term_int, term_abs, term_propios, .. } = self;
        let mut c = [0.0; CASILLAS_MAX];
        for &k in term_propios.iter() {
            let (i0, i1) = (term_inicio[k], term_inicio[k + 1]);
            devs[k].corrientes(x_acc, &st[1], &readings[k], &mut c[..i1 - i0]);
            for (j, &b) in (i0..i1).zip(c.iter()) {
                let a = term_ult[j];
                term_int[j] += 0.5 * (a + b) * delta;
                term_abs[j] += 0.5 * (a.abs() + b.abs()) * delta;
                term_ult[j] = b;
            }
        }
    }

    /// Con pasos mucho más largos que una constante de tiempo del circuito (un lazo rápido, una carga que se vacía en un paso)
    /// el trapecio no amortigua y la solución salta de un lado al otro en cada paso; Euler hacia atrás sí la amortigua.
    fn vigilar_zigzag(&mut self) {
        // Con `x_acc` aún en el paso anterior: tres cambios seguidos de sentido alterno son dos vueltas.
        let mut zigzag = false;
        for i in 0..self.n {
            if self.is_current[i] {
                continue;
            }
            let (v, v1, e1) = (self.x[i], self.x_acc[i], self.zz_paso[i]);
            let e = v - v1;
            let umbral = (ZIGZAG_FRACCION * v.abs().max(v1.abs())).max(ZIGZAG_V);
            let vueltas = if e * e1 < 0.0 && e.abs() > umbral && e1.abs() > umbral { self.zz_vueltas[i].saturating_add(1) } else { 0 };
            self.zz_vueltas[i] = vueltas;
            self.zz_paso[i] = e;
            zigzag |= vueltas >= 2;
        }
        self.zz_racha = if zigzag { self.zz_racha + 1 } else { 0 };
        if self.zz_racha >= ZIGZAG_PASOS {
            self.zz_racha = 0;
            self.zz_euler = EULER_PASOS;
        } else {
            self.zz_euler = self.zz_euler.saturating_sub(1);
        }
    }

    /// Resuelve el paso de duración `delta` que termina en t + delta.
    fn attempt(&mut self, delta: f64) -> Result<(), EngineError> {
        self.perfil.intentos += 1;
        let (ag0, ag1) = if self.order == 1 { (1.0 / delta, -1.0 / delta) } else { (2.0 / delta, 1.0) };
        let xfact = delta / self.delta_old[1];
        self.newton(self.t + delta, delta, ag0, ag1, xfact, self.max_iter, if self.first { Mode::InitTran } else { Mode::Pred })
    }

    #[allow(clippy::too_many_arguments)]
    fn newton(&mut self, t: f64, h: f64, ag0: f64, ag1: f64, xfact: f64, max_iter: usize, mode: Mode) -> Result<(), EngineError> {
        self.iter_en_curso = 0;
        let r = self.newton_interno(t, h, ag0, ag1, xfact, max_iter, mode);
        if r.is_err() {
            self.iter_perdidas += self.iter_en_curso;
        }
        r
    }

    #[allow(clippy::too_many_arguments)]
    fn newton_interno(&mut self, t: f64, h: f64, ag0: f64, ag1: f64, xfact: f64, max_iter: usize, mut mode: Mode) -> Result<(), EngineError> {
        let mut trouble = None;
        // La incógnita que más se movió en la primera iteración sin convergencia: solo si el paso falla se busca el elemento que
        // la toca (buscarlo en cada iteración recorría todos los elementos y reservaba memoria por cada uno).
        let mut sospecha: Option<usize> = None;
        for iter in 0..max_iter {
            self.iter_en_curso = iter + 1;
            self.perfil.iteraciones += 1;
            #[cfg(feature = "perfil")]
            let t_a = std::time::Instant::now();
            if self.iter_perdidas + iter >= self.iter_presupuesto {
                self.agotado = true;
                return Err(EngineError::Presupuesto { t, element: trouble.or_else(|| sospecha.and_then(|i| self.element_of_unknown(i))) });
            }
            let cached = self.linear && self.factored == Some((ag0, self.order)) && self.gshunt == 0.0;
            // Las estampas fijas se guardan la primera vez (en una iteración que estampa la matriz) y las siguientes empiezan
            // de ellas: cada resistencia y cada fusible se estampaban en cada iteración de cada paso.
            let construir = !cached && !self.base_lista && !self.fijos.is_empty();
            if !cached {
                if self.base_lista {
                    self.solver.restaurar_base();
                } else {
                    self.solver.clear();
                }
            }
            if self.base_lista {
                self.rhs.copy_from_slice(&self.rhs_base);
            } else {
                self.rhs.fill(0.0);
            }
            if construir {
                {
                    let [s0, s1, s2, _] = &mut self.st;
                    let m: &mut dyn Stamp = self.solver.as_mut();
                    let mut c = Ctx { x: &self.x, m, rhs: &mut self.rhs, s0, s1, s2, mode, order: self.order, ag0, ag1, xfact, t, h, gmin: GMIN, src: self.src, canales: &self.canales };
                    for &k in &self.fijos {
                        self.devs[k].load(&mut c);
                    }
                }
                self.solver.guardar_base();
                self.rhs_base.copy_from_slice(&self.rhs);
                self.base_lista = true;
            }
            let mut noncon = false;
            {
                let mut descarte = Descarte;
                let m: &mut dyn Stamp = if cached { &mut descarte } else { self.solver.as_mut() };
                let [s0, s1, s2, _] = &mut self.st;
                let mut c = Ctx { x: &self.x, m, rhs: &mut self.rhs, s0, s1, s2, mode, order: self.order, ag0, ag1, xfact, t, h, gmin: GMIN, src: self.src, canales: &self.canales };
                // Con la base lista, solo los que no son fijos; sin ella (una isla lineal ya factorizada que nunca la armó), todos.
                let todos = !self.base_lista;
                let cuantos = if todos { self.devs.len() } else { self.variables.len() };
                for j in 0..cuantos {
                    let k = if todos { j } else { self.variables[j] };
                    // Un repuesto toma sus cargas del instante en que vuelve (como en el primer paso).
                    let iniciar = iter == 0 && !self.por_iniciar.is_empty() && self.por_iniciar.contains(&k);
                    if iniciar {
                        c.mode = Mode::InitTran;
                    }
                    if self.devs[k].load(&mut c) {
                        noncon = true;
                        trouble = Some(k);
                    }
                    if iniciar {
                        c.mode = mode;
                    }
                }
                if self.gshunt > 0.0 {
                    for i in 0..self.n {
                        if !self.is_current[i] {
                            c.m.add(i, i, self.gshunt);
                        }
                    }
                }
            }
            #[cfg(feature = "perfil")]
            let t_b = std::time::Instant::now();
            if !cached {
                self.perfil.factorizaciones += 1;
                if let Err(e) = self.solver.factor() {
                    self.factored = None;
                    let malo = self.solver.bad_unknown().and_then(|i| self.owner_of(i));
                    // Valores que no son finitos en un circuito no lineal son un desborde de los modelos: se reintenta.
                    if !self.linear && self.solver.non_finite() {
                        return Err(EngineError::NoConvergence { t, element: trouble.or_else(|| sospecha.and_then(|i| self.element_of_unknown(i))).or(malo) });
                    }
                    return Err(match e {
                        EngineError::Singular { .. } => EngineError::Singular { element: malo },
                        e => e,
                    });
                }
                // La matriz con la conductancia de rescate no es la del circuito: no se reutiliza.
                self.factored = if self.linear && self.gshunt == 0.0 { Some((ag0, self.order)) } else { None };
            }
            #[cfg(feature = "perfil")]
            let t_c = std::time::Instant::now();
            self.solver.solve(&self.rhs, &mut self.x_new);
            #[cfg(feature = "perfil")]
            {
                let t_d = std::time::Instant::now();
                self.perfil.ns_carga += (t_b - t_a).as_nanos() as u64;
                self.perfil.ns_factor += (t_c - t_b).as_nanos() as u64;
                self.perfil.ns_resuelve += (t_d - t_c).as_nanos() as u64;
            }
            if self.x_new.iter().any(|v| !v.is_finite()) {
                self.factored = None;
                // La LU dispersa no detecta pivotes casi nulos: en un circuito lineal una solución que no es finita
                // es una matriz singular; en uno no lineal puede ser un desborde de los modelos y se reintenta.
                return Err(if self.linear { EngineError::Singular { element: None } } else { EngineError::NoConvergence { t, element: trouble.or_else(|| sospecha.and_then(|i| self.element_of_unknown(i))) } });
            }
            // Siempre al menos dos iteraciones, como en ngspice: la segunda recalcula las cargas con la solución nueva.
            // En un circuito lineal la solución ya es exacta en la primera, así que la segunda reutiliza la
            // factorización y no se revisa el cambio de los nodos.
            #[cfg(feature = "perfil")]
            let tc = std::time::Instant::now();
            let mut converged = !noncon && iter > 0;
            let mut peor = (0.0, None);
            for i in 0..if self.linear { 0 } else { self.n } {
                let (a, b) = (self.x_new[i], self.x[i]);
                let tol = self.tol.reltol * a.abs().max(b.abs()) + if self.is_current[i] { self.tol.abstol } else { self.tol.vntol };
                let d = (a - b).abs();
                if !(d <= tol) {
                    converged = false;
                    if d / tol > peor.0 {
                        peor = (d / tol, Some(i));
                    }
                }
            }
            // Con los nodos quietos, la prueba de cada dispositivo (como CKTconvTest de ngspice).
            if converged {
                // Un dispositivo lineal no tiene prueba propia (su corriente es la de la linealización).
                for &k in &self.no_lineales {
                    let d = &self.devs[k];
                    if !d.converged(&self.x_new, &self.st[0], &self.tol) {
                        converged = false;
                        trouble = Some(k);
                        break;
                    }
                }
            }
            #[cfg(feature = "perfil")]
            {
                self.perfil.ns_conv += tc.elapsed().as_nanos() as u64;
            }
            std::mem::swap(&mut self.x, &mut self.x_new);
            if converged {
                return Ok(());
            }
            if trouble.is_none() && sospecha.is_none() {
                sospecha = peor.1;
            }
            mode = Mode::Float;
        }
        Err(EngineError::NoConvergence { t, element: trouble.or_else(|| sospecha.and_then(|i| self.element_of_unknown(i))) })
    }

    /// El primer elemento no lineal conectado al nodo de la incógnita `i` (para nombrar al sospechoso).
    fn element_of_unknown(&self, i: usize) -> Option<usize> {
        let nodo = i + 1;
        let toca = |k: usize| self.elements[k].nodes().contains(&nodo);
        (0..self.devs.len()).find(|&k| !self.devs[k].linear() && toca(k)).or_else(|| (0..self.devs.len()).find(|&k| toca(k)))
    }

    /// Último recurso con el paso mínimo: una conductancia en paralelo con cada nodo baja de 10 mS a cero y luego las fuentes crecen de 10 % a 100 %, cada nivel desde la solución del anterior. Si el presupuesto se agota, guarda el nivel para seguir en la llamada siguiente.
    fn rescue(&mut self, t: f64, h: f64) -> Result<(), EngineError> {
        let (ag0, ag1) = (1.0 / h, -1.0 / h);
        let xfact = h / self.delta_old[1];
        let tope = MAX_ITER_RESCATE.min(self.max_iter * 10);
        let (mut etapa, mut x_ok) = match self.rescate.take() {
            Some(r) if r.t == t && r.h == h => (r.etapa, r.x),
            _ => (Etapa::Gmin(1e-2), self.x_acc.clone()),
        };
        self.x.copy_from_slice(&x_ok);
        loop {
            match etapa {
                Etapa::Gmin(g) => {
                    self.gshunt = g;
                    let r = self.newton(t, h, ag0, ag1, xfact, tope, Mode::Float);
                    self.gshunt = 0.0;
                    match r {
                        Ok(()) => {
                            x_ok.copy_from_slice(&self.x);
                            let siguiente = g / 10.0;
                            etapa = if siguiente > 1e-12 { Etapa::Gmin(siguiente) } else { Etapa::Final };
                        }
                        // Con una conductancia de 10 mS en cada nodo, una matriz singular ya no es de nodos flotantes.
                        Err(e @ EngineError::Singular { .. }) => return Err(e),
                        Err(e @ EngineError::Presupuesto { .. }) => return Err(self.guardar_rescate(t, h, etapa, x_ok, e)),
                        Err(_) => {
                            self.x.copy_from_slice(&self.x_acc);
                            x_ok.copy_from_slice(&self.x_acc);
                            etapa = Etapa::Fuentes(1);
                        }
                    }
                }
                Etapa::Final => match self.newton(t, h, ag0, ag1, xfact, tope, Mode::Float) {
                    Ok(()) => return Ok(()),
                    Err(e @ EngineError::Presupuesto { .. }) => return Err(self.guardar_rescate(t, h, etapa, x_ok, e)),
                    Err(_) => {
                        self.x.copy_from_slice(&self.x_acc);
                        x_ok.copy_from_slice(&self.x_acc);
                        etapa = Etapa::Fuentes(1);
                    }
                },
                Etapa::Fuentes(k) => {
                    self.src = k as f64 / 10.0;
                    let r = self.newton(t, h, ag0, ag1, xfact, tope, Mode::Float);
                    self.src = 1.0;
                    match r {
                        Ok(()) if k == 10 => return Ok(()),
                        Ok(()) => {
                            x_ok.copy_from_slice(&self.x);
                            etapa = Etapa::Fuentes(k + 1);
                        }
                        Err(e @ EngineError::Presupuesto { .. }) => return Err(self.guardar_rescate(t, h, etapa, x_ok, e)),
                        Err(e) => {
                            self.x.copy_from_slice(&self.x_acc);
                            return Err(e);
                        }
                    }
                }
            }
        }
    }

    /// Deja el rescate listo para seguir en la llamada siguiente y devuelve el error de presupuesto.
    fn guardar_rescate(&mut self, t: f64, h: f64, etapa: Etapa, x: Vec<f64>, e: EngineError) -> EngineError {
        self.rescate = Some(Rescate { t, h, etapa, x });
        e
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::devices::VT;

    fn net(json: &str) -> Netlist {
        Netlist::from_json(json).unwrap()
    }

    const RC: &str = r#"{"nodes":3,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
        {"type":"R","a":1,"b":2,"ohms":1000},
        {"type":"C","a":2,"b":0,"farads":1e-6}]}"#;

    #[test]
    fn cambiar_una_resistencia_en_caliente_conserva_tiempo_y_capacitor() {
        // RC con tau = 1 ms: a t = 1 ms el capacitor lleva 3.16 V. Se duplica la R y el capacitor sigue de ahí, no de cero.
        let mut tr = Transient::new(net(RC), 1e-6).unwrap();
        tr.advance_to(1e-3, u32::MAX).unwrap();
        let (t, v) = (tr.time(), tr.voltage(2));
        assert!(v > 3.0);
        tr.set_resistance(1, 2000.0).unwrap();
        assert_eq!(tr.time(), t);
        assert_eq!(tr.voltage(2), v);
        tr.step().unwrap();
        // Un paso después el voltaje sigue cerca de donde iba (no cae a cero) y la corriente usa la R nueva.
        assert!((tr.voltage(2) - v).abs() < 0.01, "v = {}", tr.voltage(2));
        let i = tr.currents()[1];
        assert!((i - (5.0 - tr.voltage(2)) / 2000.0).abs() < 1e-9, "i = {i}");
    }

    #[test]
    fn el_divisor_se_actualiza_en_el_paso_siguiente() {
        let mut tr = Transient::new(net(r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":10}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"R","a":2,"b":0,"ohms":1000}]}"#), 1e-6).unwrap();
        tr.step().unwrap();
        assert!((tr.voltage(2) - 5.0).abs() < 1e-9);
        tr.set_resistance(2, 3000.0).unwrap();
        tr.step().unwrap();
        assert!((tr.voltage(2) - 7.5).abs() < 1e-9, "v = {}", tr.voltage(2));
        assert_eq!(tr.steps(), 2);
    }

    #[test]
    fn set_resistance_rechaza_lo_que_no_es_una_resistencia_positiva() {
        let mut tr = Transient::new(net(r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":10}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"R","a":2,"b":0,"ohms":1000}]}"#), 1e-6).unwrap();
        assert!(matches!(tr.set_resistance(0, 5.0), Err(EngineError::Invalid(_))));
        assert!(matches!(tr.set_resistance(9, 5.0), Err(EngineError::Invalid(_))));
        assert!(matches!(tr.set_resistance(1, 0.0), Err(EngineError::Invalid(_))));
        assert!(matches!(tr.set_resistance(1, f64::NAN), Err(EngineError::Invalid(_))));
    }

    #[test]
    fn cambiar_una_fuente_en_caliente() {
        let mut tr = Transient::new(net(RC), 1e-5).unwrap();
        tr.advance_to(10e-3, u32::MAX).unwrap();
        assert!((tr.voltage(2) - 5.0).abs() < 1e-3);
        let t = tr.time();
        tr.set_element(0, Element::V { a: 1, b: 0, wave: crate::Wave::Dc { v: 2.0 } }).unwrap();
        assert_eq!(tr.time(), t);
        tr.advance_to(t + 10e-3, u32::MAX).unwrap();
        assert!((tr.voltage(2) - 2.0).abs() < 1e-3, "v = {}", tr.voltage(2));
        // Otro tipo o nodos distintos no se cambian en caliente.
        assert!(matches!(tr.set_element(0, Element::V { a: 2, b: 0, wave: crate::Wave::Dc { v: 2.0 } }), Err(EngineError::Invalid(_))));
        assert!(matches!(tr.set_element(2, Element::C { a: 2, b: 0, farads: 2e-6 }), Err(EngineError::Invalid(_))));
        assert!(matches!(tr.set_element(1, Element::R { a: 1, b: 2, ohms: -1.0 }), Err(EngineError::Invalid(_))));
    }

    #[test]
    fn set_resistance_en_un_circuito_no_lineal() {
        let mut tr = Transient::new(net(DIODO_R), 1e-6).unwrap();
        tr.step().unwrap();
        let i1 = tr.currents()[1];
        tr.set_resistance(1, 500.0).unwrap();
        tr.step().unwrap();
        assert!(tr.currents()[1] > 1.8 * i1);
    }

    /// RC de 1 ms con un puente de entrada en el capacitor (umbral de 2.5 V).
    const RC_CON_PUENTE: &str = r#"{"nodes":3,"digital_nets":1,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
        {"type":"R","a":1,"b":2,"ohms":1000},
        {"type":"C","a":2,"b":0,"farads":1e-6},
        {"type":"ADC","p":2,"n":0,"out":0,"in_low":2.5,"in_high":2.5}]}"#;

    #[test]
    fn el_paso_se_detiene_justo_despues_del_cruce() {
        // Con paso máximo de 100 µs el capacitor cruza 2.5 V cerca de RC ln 2 = 693 µs: el paso aceptado termina dentro de
        // TOLERANCIA_CRUCE después del cruce (el voltaje pasa del umbral por menos que la pendiente por esa tolerancia).
        let mut tr = Transient::new(net(RC_CON_PUENTE), 1e-4).unwrap();
        assert_eq!(tr.nivel_logico(3), Some(Nivel::Cero));
        let (pasos, cruzo) = tr.advance_hasta_cruce(1e-2, u32::MAX).unwrap();
        assert!(cruzo && pasos > 1);
        assert_eq!(tr.nivel_logico(3), Some(Nivel::Uno));
        let (t, v) = (tr.time(), tr.voltage(2));
        assert!((t - 1e-3 * 2f64.ln()).abs() < 5e-6, "t = {t}");
        let pendiente = 2.5 / 1e-3;
        assert!(v >= 2.5 && v - 2.5 <= pendiente * TOLERANCIA_CRUCE, "v = {v}");
        // Lo que sigue ya no cruza: llega a la meta sin detenerse.
        assert_eq!(tr.advance_hasta_cruce(1e-2, u32::MAX).unwrap().1, false);
        assert!((tr.time() - 1e-2).abs() < 1e-12);
    }

    #[test]
    fn una_cuadrada_ideal_cruza_de_golpe_y_el_paso_se_acepta() {
        let mut tr = Transient::new(net(r#"{"nodes":2,"digital_nets":1,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":1000,"duty":0.5}},
            {"type":"R","a":1,"b":0,"ohms":1000},
            {"type":"ADC","p":1,"n":0,"out":0,"in_low":1.5,"in_high":3.5}]}"#), 1e-5).unwrap();
        // Alta desde t = 0: el primer paso ya la ve en 5 V.
        assert!(tr.advance_hasta_cruce(1e-3, u32::MAX).unwrap().1);
        assert_eq!(tr.nivel_logico(2), Some(Nivel::Uno));
        // El flanco de bajada a los 0.5 ms: el paso que lo cruza empieza en el flanco.
        assert!(tr.advance_hasta_cruce(1e-3, u32::MAX).unwrap().1);
        assert_eq!(tr.nivel_logico(2), Some(Nivel::Cero));
        assert!((tr.time() - 0.5e-3).abs() < 1e-7, "t = {}", tr.time());
    }

    #[test]
    fn el_puente_de_salida_maneja_su_carga_con_su_resistencia() {
        // Thévenin de 0 a 5 V con 55 Ω sobre 1 kΩ: en alto, 5 · 1000 / 1055.
        let mut tr = Transient::new(net(r#"{"nodes":2,"digital_nets":1,"elements":[
            {"type":"DAC","input":0,"out":1,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":10e-9,"t_fall":10e-9},
            {"type":"R","a":1,"b":0,"ohms":1000}]}"#), 1e-9).unwrap();
        assert!(tr.fijar_nivel(0, Nivel::Cero, true));
        tr.advance_to(100e-9, u32::MAX).unwrap();
        assert!(tr.voltage(1).abs() < 1e-12);
        assert!(tr.fijar_nivel(0, Nivel::Uno, false));
        tr.advance_to(105e-9, u32::MAX).unwrap();
        assert!((tr.voltage(1) - 2.5 * 1000.0 / 1055.0).abs() < 1e-9, "v = {}", tr.voltage(1));
        tr.advance_to(200e-9, u32::MAX).unwrap();
        assert!((tr.voltage(1) - 5.0 * 1000.0 / 1055.0).abs() < 1e-9);
        assert!((tr.readings()[0].i - 5.0 / 1055.0).abs() < 1e-12);
    }

    #[test]
    fn con_nodos_de_referencia_la_corriente_sale_del_vcc_en_alto() {
        // 74LS en alto (3.42 V y 68 Ω) respecto de un VCC de 5 V: con lo y hi, la salida queda en VCC - 1.58 V y la fuente
        // entrega la corriente de la carga.
        let mut tr = Transient::new(net(r#"{"nodes":3,"digital_nets":1,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
            {"type":"DAC","input":0,"out":2,"lo":0,"hi":1,"v_lo":0.15,"v_hi":-1.58,"r_lo":25,"r_hi":68,"t_rise":12e-9,"t_fall":6e-9},
            {"type":"R","a":2,"b":0,"ohms":1000}]}"#), 1e-9).unwrap();
        assert!(tr.fijar_nivel(1, Nivel::Uno, true));
        tr.advance_to(50e-9, u32::MAX).unwrap();
        let v = 3.42 * 1000.0 / 1068.0;
        assert!((tr.voltage(2) - v).abs() < 1e-9, "v = {}", tr.voltage(2));
        assert!((tr.readings()[0].i + v / 1000.0).abs() < 1e-12, "i = {}", tr.readings()[0].i);
    }

    #[test]
    fn un_elemento_digital_no_entra_a_la_matriz() {
        let n = net(r#"{"nodes":2,"digital_nets":1,"elements":[{"type":"R","a":1,"b":0,"ohms":1},{"type":"LOGIC","out":0,"value":1}]}"#);
        assert_eq!(incognitas(&n), 1);
        assert_eq!(
            Transient::new(n, 1e-6).err().unwrap(),
            EngineError::Invalid("elemento 1: un elemento digital no entra a la matriz analógica".into())
        );
    }

    #[test]
    fn divisor_de_voltaje() {
        let mut tr = Transient::new(net(r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":10}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"R","a":2,"b":0,"ohms":1000}]}"#), 1e-6).unwrap();
        tr.step().unwrap();
        assert!((tr.voltage(2) - 5.0).abs() < 1e-9);
        assert_eq!(tr.voltage(0), 0.0);
    }

    #[test]
    fn carga_rc_sigue_la_exponencial_con_menos_pasos() {
        // tau = 1 ms; en t = tau, V = 5 (1 - e^-1) = 3.1606. El paso crece donde la curva se suaviza: con un máximo
        // de 100 µs bastan unos cuantos pasos, con un error mucho menor al 1 %.
        let mut tr = Transient::new(net(RC), 1e-4).unwrap();
        let steps = tr.advance_to(1e-3, u32::MAX).unwrap();
        assert_eq!(tr.time(), 1e-3);
        assert!(steps < 80, "pasos = {steps}");
        let exact = 5.0 * (1.0 - (-1.0f64).exp());
        assert!((tr.voltage(2) - exact).abs() / exact < 1e-3, "v = {}", tr.voltage(2));
    }

    #[test]
    fn el_paso_crece_hasta_el_maximo_cuando_todo_se_asienta() {
        let mut tr = Transient::new(net(RC), 1e-4).unwrap();
        tr.advance_to(20e-3, u32::MAX).unwrap();
        let t = tr.time();
        tr.step().unwrap();
        assert!((tr.time() - t - 1e-4).abs() < 1e-12, "paso = {}", tr.time() - t);
    }

    #[test]
    fn fuente_de_corriente() {
        let mut tr = Transient::new(net(r#"{"nodes":2,"elements":[
            {"type":"I","a":0,"b":1,"amps":0.001},
            {"type":"R","a":1,"b":0,"ohms":1000}]}"#), 1e-6).unwrap();
        tr.step().unwrap();
        assert!((tr.voltage(1) - 1.0).abs() < 1e-9);
    }

    #[test]
    fn fuentes_en_paralelo_son_singulares() {
        let mut tr = Transient::new(net(r#"{"nodes":2,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":3}}]}"#), 1e-6).unwrap();
        assert!(matches!(tr.step().unwrap_err(), EngineError::Singular { .. }));
    }

    #[test]
    fn paso_no_finito_es_invalido() {
        let json = r#"{"nodes":2,"elements":[{"type":"R","a":1,"b":0,"ohms":1}]}"#;
        assert!(matches!(Transient::new(net(json), f64::NAN), Err(EngineError::Invalid(_))));
        assert!(matches!(Transient::new(net(json), f64::INFINITY), Err(EngineError::Invalid(_))));
    }

    #[test]
    fn par_flotante_denso_es_singular() {
        let mut tr = Transient::new(net(r#"{"nodes":3,"elements":[
            {"type":"I","a":1,"b":2,"amps":0.001},
            {"type":"R","a":1,"b":2,"ohms":1000}]}"#), 1e-6).unwrap();
        assert!(matches!(tr.step().unwrap_err(), EngineError::Singular { .. }));
    }

    #[test]
    fn la_singularidad_nombra_el_elemento_dueno_de_la_incognita() {
        // Dos fuentes en paralelo: la corriente de rama que falla es de una de las dos fuentes (elementos 0 y 1).
        let mut tr = Transient::new(net(r#"{"nodes":2,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":3}}]}"#), 1e-6).unwrap();
        assert!(matches!(tr.step().unwrap_err(), EngineError::Singular { element: Some(k) } if k <= 1));
    }

    #[test]
    fn el_presupuesto_de_iteraciones_devuelve_el_control_con_el_estado_intacto() {
        // Con una iteración por paso, el circuito solo se resuelve gastando iteraciones en pasos más cortos y en el rescate
        // (con el presupuesto de omisión sí lo logra, ver `con_una_iteracion_por_paso_el_rescate_de_gmin_resuelve`). Con
        // un presupuesto de 30 iteraciones perdidas por llamada, la llamada devuelve el error antes de agotar el rescate.
        let mut tr = Transient::new(net(DIODO_R), 1e-6).unwrap();
        tr.set_max_iter(1);
        tr.set_iteration_budget(30);
        let e = tr.advance_to(1e-5, 100).unwrap_err();
        // No es un fallo del circuito: el motor sigue sano y la llamada siguiente continúa donde quedó.
        assert!(matches!(e, EngineError::Presupuesto { .. }), "{e:?}");
        assert!(tr.lost_iterations() >= 30, "iteraciones perdidas {}", tr.lost_iterations());
        // El tiempo y los voltajes son los del último paso aceptado: finitos y antes de la meta.
        let t = tr.time();
        assert!(t < 1e-5, "t = {t}");
        assert!(tr.voltages().iter().all(|v| v.is_finite()));
        // La siguiente llamada tiene su presupuesto completo y, con él, el circuito sigue y se resuelve.
        tr.set_iteration_budget(DEFAULT_ITER_BUDGET);
        tr.set_max_iter(MAX_ITER);
        tr.advance_to(1e-5, u32::MAX).unwrap();
        assert!(tr.time() > t && tr.voltage(2) > 0.6 && tr.voltage(2) < 0.75, "v = {}", tr.voltage(2));
    }

    #[test]
    fn un_cambio_en_caliente_de_frecuencia_conserva_el_estado_y_se_rechaza_si_pide_demasiado() {
        let json = r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":50}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"C","a":2,"b":0,"farads":1e-6}]}"#;
        let mut tr = Transient::new(net(json), 1e-4).unwrap();
        tr.advance_to(5e-3, u32::MAX).unwrap();
        let (t, v) = (tr.time(), tr.voltage(2));
        assert!(v > 1.0);
        // 100 veces más rápida: pide un paso máximo 100 veces menor, y con él se acepta sin perder el tiempo ni la carga.
        let rapida = Element::V { a: 1, b: 0, wave: Wave::Square { low: 0.0, high: 5.0, freq: 5000.0, duty: 0.5 } };
        tr.set_max_step(1e-6).unwrap();
        tr.set_element(0, rapida).unwrap();
        assert_eq!(tr.time(), t);
        assert_eq!(tr.voltage(2), v);
        tr.advance_to(t + 1e-3, u32::MAX).unwrap();
        // Un paso fuera de rango o una cuadrada demasiado rápida para el paso vigente se rechazan sin tocar nada.
        assert!(matches!(tr.set_max_step(1e9), Err(EngineError::Invalid(_))));
        tr.set_max_step(1e-3).unwrap();
        let loca = Element::V { a: 1, b: 0, wave: Wave::Square { low: 0.0, high: 5.0, freq: 1e9, duty: 0.5 } };
        assert!(matches!(tr.set_element(0, loca), Err(EngineError::Invalid(m)) if m.contains("onda cuadrada")));
    }

    #[test]
    fn el_rescate_se_reanuda_entre_llamadas_aunque_el_presupuesto_no_alcance_para_uno_completo() {
        // Cadena de 12 LED azules con 330 Ω desde 50 V y 3 iteraciones por paso: el rescate cuesta unas 54 iteraciones perdidas, más que el presupuesto de 40. Cada llamada guarda el nivel y la siguiente sigue de ahí. (El de la interfaz nunca baja de 300.)
        let mut el = vec![
            r#"{"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":50}}"#.to_string(),
            r#"{"type":"R","a":1,"b":2,"ohms":330}"#.to_string(),
        ];
        for k in 2..13 {
            el.push(format!(r#"{{"type":"D","a":{k},"b":{},"is":1.83e-28,"n":2}}"#, k + 1));
        }
        el.push(r#"{"type":"D","a":13,"b":0,"is":1.83e-28,"n":2}"#.to_string());
        let json = format!(r#"{{"nodes":14,"elements":[{}]}}"#, el.join(","));
        let mut tr = Transient::new(net(&json), 1e-6).unwrap();
        tr.set_max_iter(3);
        tr.set_iteration_budget(40);
        let mut llamadas = 0;
        while tr.time() < 1e-8 {
            match tr.step() {
                Ok(()) | Err(EngineError::Presupuesto { .. }) => {}
                Err(e) => panic!("{e:?}"),
            }
            llamadas += 1;
            assert!(llamadas < 500, "no llega: t = {:e} tras {llamadas} llamadas", tr.time());
        }
        assert!(tr.voltages().iter().all(|v| v.is_finite()));
    }

    #[test]
    fn una_onda_cuadrada_demasiado_rapida_para_el_paso_maximo_se_rechaza_en_vez_de_arrastrarse() {
        // 1 GHz con un paso máximo de 10 ms son 10,000,000 de flancos por paso: cada uno es un punto de quiebre y 100,000 pasos
        // no llegaban a 5e-8 s. Se pide un paso máximo acorde a la señal.
        let con = |freq: f64, h: f64| {
            Netlist::from_json(&format!(r#"{{"nodes":2,"elements":[
                {{"type":"V","a":1,"b":0,"wave":{{"kind":"square","low":0,"high":5,"freq":{freq}}}}},
                {{"type":"R","a":1,"b":0,"ohms":1000}}]}}"#))
            .and_then(|n| Transient::new(n, h))
        };
        assert!(matches!(con(1e9, 1e-2), Err(EngineError::Invalid(m)) if m.contains("onda cuadrada")));
        assert!(matches!(con(1e12, 1e-2), Err(EngineError::Invalid(_))));
        assert!(con(1e3, 1e-5).is_ok());
        assert!(con(1e9, 1e-9).is_ok());
    }

    #[test]
    fn un_paso_de_tiempo_extremo_es_invalido() {
        let json = r#"{"nodes":2,"elements":[{"type":"R","a":1,"b":0,"ohms":1}]}"#;
        for h in [1e-30, 1e9] {
            assert!(matches!(Transient::new(net(json), h), Err(EngineError::Invalid(_))), "h = {h}");
        }
        assert!(Transient::new(net(json), 1e-9).is_ok());
    }

    #[test]
    fn paso_no_positivo_es_invalido() {
        let r = Transient::new(net(r#"{"nodes":2,"elements":[{"type":"R","a":1,"b":0,"ohms":1}]}"#), 0.0);
        assert!(matches!(r, Err(EngineError::Invalid(_))));
    }

    /// Corriente de Shockley con gmin, la del modelo de ngspice.
    fn shockley(vd: f64, is: f64, n: f64) -> f64 {
        is * ((vd / (n * VT)).exp() - 1.0) + GMIN * vd
    }

    #[test]
    fn diodo_con_resistencia_cumple_kcl() {
        let mut tr = Transient::new(net(DIODO_R), 1e-6).unwrap();
        tr.step().unwrap();
        let vd = tr.voltage(2);
        assert!(vd > 0.6 && vd < 0.75, "vd = {vd}");
        let i_r = (5.0 - vd) / 1000.0;
        let i_d = shockley(vd, 1e-14, 1.0);
        assert!((i_r - i_d).abs() / i_r < 1e-4, "i_r = {i_r}, i_d = {i_d}");
    }

    #[test]
    fn un_led_azul_arranca_desde_cero_volts() {
        // Su voltaje crítico es 3.2 V y el limitador lo sube de a 0.4 V por iteración: el primer paso necesita
        // más de las 10 iteraciones de ngspice, y en el mínimo el motor no debe quedarse dando vueltas.
        let mut tr = Transient::new(net(r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":9}},
            {"type":"R","a":1,"b":2,"ohms":330},
            {"type":"D","a":2,"b":0,"is":1.83e-28,"n":2}]}"#), 1e-6).unwrap();
        tr.advance_to(1e-5, 100).unwrap();
        assert!((tr.voltage(2) - 3.096).abs() < 1e-3, "v = {}", tr.voltage(2));
    }

    #[test]
    fn sin_iteraciones_el_primer_paso_falla_sin_quedarse_dando_vueltas() {
        let mut tr = Transient::new(net(DIODO_R), 1e-6).unwrap();
        tr.set_max_iter(0);
        assert!(matches!(tr.step().unwrap_err(), EngineError::NoConvergence { .. }));
        assert_eq!(tr.time(), 0.0);
    }

    #[test]
    fn con_una_iteracion_por_paso_el_rescate_de_gmin_resuelve() {
        // Newton no alcanza con una iteración, pero el escalamiento de gmin (diez por nivel) sí.
        let mut tr = Transient::new(net(DIODO_R), 1e-6).unwrap();
        tr.set_max_iter(1);
        tr.step().unwrap();
        assert!(tr.voltage(2) > 0.6 && tr.voltage(2) < 0.75, "v = {}", tr.voltage(2));
    }

    #[test]
    fn diodo_inverso_casi_no_conduce() {
        let mut tr = Transient::new(net(r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":-5}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"D","a":2,"b":0}]}"#), 1e-6).unwrap();
        tr.step().unwrap();
        assert!((tr.voltage(2) + 5.0).abs() < 1e-3);
    }

    #[test]
    fn rectificador_carga_el_capacitor() {
        let mut tr = Transient::new(net(include_str!("../fixtures/rectificador.json")), 5e-6).unwrap();
        tr.advance_to(0.1, u32::MAX).unwrap();
        let v = tr.voltage(3);
        assert!(v > 2.5 && v < 4.5, "v_salida = {v}");
    }

    const DIODO_R: &str = r#"{"nodes":3,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
        {"type":"R","a":1,"b":2,"ohms":1000},
        {"type":"D","a":2,"b":0}]}"#;

    #[test]
    fn fallo_deja_el_estado_intacto_y_nombra_el_elemento() {
        let mut tr = Transient::new(net(DIODO_R), 1e-6).unwrap();
        for _ in 0..3 {
            tr.step().unwrap();
        }
        let (v, t) = (tr.voltages(), tr.time());
        tr.set_max_iter(0);
        let e = tr.step().unwrap_err();
        assert!(matches!(e, EngineError::NoConvergence { .. }), "{e:?}");
        assert_eq!(tr.voltages(), v);
        assert_eq!(tr.time(), t);
        tr.set_max_iter(MAX_ITER);
        tr.step().unwrap();
        assert!(tr.time() > t);
    }

    #[test]
    fn avance_por_tramos_igual_a_un_tramo() {
        let json = include_str!("../fixtures/rectificador.json");
        let mut a = Transient::new(net(json), 5e-6).unwrap();
        a.advance_to(0.02, u32::MAX).unwrap();
        let mut b = Transient::new(net(json), 5e-6).unwrap();
        while b.advance_to(0.02, 200).unwrap() > 0 {}
        assert_eq!(a.time(), b.time());
        assert_eq!(a.voltages(), b.voltages());
    }

    #[test]
    fn tope_de_pasos_y_llegada_exacta() {
        let mut tr = Transient::new(net(DIODO_R), 1e-6).unwrap();
        assert_eq!(tr.advance_to(1.0, 7).unwrap(), 7);
        assert!(tr.time() > 0.0 && tr.time() <= 7e-6, "t = {}", tr.time());
        // advance_to termina justo en el tiempo pedido aunque el paso no lo divida.
        tr.advance_to(1.234567e-4, u32::MAX).unwrap();
        assert_eq!(tr.time(), 1.234567e-4);
    }

    #[test]
    fn rc_senoidal_amplitud_en_regimen() {
        let mut tr = Transient::new(net(r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"sine","offset":0,"amp":1,"freq":159.1549431}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"C","a":2,"b":0,"farads":1e-6}]}"#), 1e-5).unwrap();
        tr.advance_to(0.05, u32::MAX).unwrap();
        let t0 = tr.time();
        let periodo = 2.0 * std::f64::consts::PI * 1e-3;
        let mut max = 0.0f64;
        while tr.time() < t0 + periodo {
            tr.step().unwrap();
            max = max.max(tr.voltage(2));
        }
        let esperado = std::f64::consts::FRAC_1_SQRT_2;
        assert!((max - esperado).abs() / esperado < 0.01, "max = {max}");
    }

    /// Amplitud y fase de `v(t)` a la frecuencia `freq` sobre `periodos` periodos completos (desmodulación en cuadratura
    /// con muestras equiespaciadas: se avanza a cada instante con advance_to, el motor elige sus pasos por dentro).
    fn amplitud_y_fase(tr: &mut Transient, nodo: usize, freq: f64, periodos: usize) -> (f64, f64) {
        let w = 2.0 * std::f64::consts::PI * freq;
        let (mut i, mut q, mut n) = (0.0, 0.0, 0.0);
        let t0 = tr.time();
        let muestras = periodos * 400;
        for k in 1..=muestras {
            tr.advance_to(t0 + k as f64 / (400.0 * freq), u32::MAX).unwrap();
            let v = tr.voltage(nodo);
            i += v * (w * tr.time()).sin();
            q += v * (w * tr.time()).cos();
            n += 1.0;
        }
        let (i, q) = (2.0 * i / n, 2.0 * q / n);
        ((i * i + q * q).sqrt(), q.atan2(i))
    }

    #[test]
    fn rc_senoidal_amplitud_y_fase_analiticas() {
        // R = 1 kΩ, C = 1 µF, f = 2 / (2π RC): ωRC = 2, amplitud 1/√5 y fase −atan 2 = −63.43°.
        let freq = 2.0 / (2.0 * std::f64::consts::PI * 1e-3);
        let json = format!(r#"{{"nodes":3,"elements":[
            {{"type":"V","a":1,"b":0,"wave":{{"kind":"sine","offset":0,"amp":1,"freq":{freq}}}}},
            {{"type":"R","a":1,"b":2,"ohms":1000}},
            {{"type":"C","a":2,"b":0,"farads":1e-6}}]}}"#);
        let mut tr = Transient::new(net(&json), 1.0 / (freq * 200.0)).unwrap();
        tr.advance_to(20.0 / freq, u32::MAX).unwrap();
        let (amp, fase) = amplitud_y_fase(&mut tr, 2, freq, 10);
        let (amp_ok, fase_ok) = (1.0 / 5f64.sqrt(), -(2f64.atan()));
        assert!((amp - amp_ok).abs() / amp_ok < 0.01, "amplitud {amp} contra {amp_ok}");
        assert!((fase - fase_ok).abs() / fase_ok.abs() < 0.01, "fase {fase} contra {fase_ok}");
    }

    #[test]
    fn rc_con_pulso_de_1_khz_al_25_por_ciento_llega_al_regimen_periodico() {
        // τ = 100 µs, periodo 1 ms, nivel alto 250 µs. En régimen: v0 = 5 b (1 − a) / (1 − a b) al empezar el
        // periodo y v1 = 5 − (5 − v0) a al terminar el nivel alto, con a = e^(−2.5) y b = e^(−7.5).
        let mut tr = Transient::new(net(r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":1000,"duty":0.25}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"C","a":2,"b":0,"farads":1e-7}]}"#), 5e-6).unwrap();
        let (a, b) = ((-2.5f64).exp(), (-7.5f64).exp());
        let v0 = 5.0 * b * (1.0 - a) / (1.0 - a * b);
        let v1 = 5.0 - (5.0 - v0) * a;
        tr.advance_to(20e-3, u32::MAX).unwrap();
        // Al final del nivel alto del periodo 21 y a la mitad del nivel bajo.
        tr.advance_to(20e-3 + 250e-6, u32::MAX).unwrap();
        assert!((tr.voltage(2) - v1).abs() / v1 < 0.01, "v1 = {} contra {v1}", tr.voltage(2));
        tr.advance_to(20e-3 + 625e-6, u32::MAX).unwrap();
        let medio = v1 * (-3.75f64).exp();
        assert!((tr.voltage(2) - medio).abs() / medio < 0.01, "v = {} contra {medio}", tr.voltage(2));
        // Y la tensión mínima del régimen (al final del periodo) no pasa de unos milivoltios.
        tr.advance_to(21e-3, u32::MAX).unwrap();
        assert!((tr.voltage(2) - v0).abs() < 5e-3, "v0 = {} contra {v0}", tr.voltage(2));
    }

    #[test]
    fn un_paso_cae_en_cada_flanco_de_la_cuadrada() {
        // Con un paso máximo que no divide el periodo, el motor igual se detiene en 250 µs y en 1 ms.
        let mut tr = Transient::new(net(r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":1000,"duty":0.25}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"C","a":2,"b":0,"farads":1e-7}]}"#), 7e-6).unwrap();
        let mut tiempos = Vec::new();
        while tr.time() < 1.1e-3 {
            tr.step().unwrap();
            tiempos.push(tr.time());
        }
        for flanco in [250e-6, 1e-3] {
            assert!(tiempos.iter().any(|t| (t - flanco).abs() < 1e-12), "sin paso en {flanco}");
        }
    }

    #[test]
    fn inductor_rl_sigue_la_exponencial() {
        // L = 1 mH, R = 10 Ω: τ = 100 µs; i(τ) = 0.5 (1 − e^−1) A con 5 V.
        let mut tr = Transient::new(net(r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
            {"type":"R","a":1,"b":2,"ohms":10},
            {"type":"L","a":2,"b":0,"henries":1e-3}]}"#), 1e-6).unwrap();
        tr.advance_to(100e-6, u32::MAX).unwrap();
        let i = tr.currents()[2];
        let exacta = 0.5 * (1.0 - (-1.0f64).exp());
        assert!((i - exacta).abs() / exacta < 1e-3, "i = {i} contra {exacta}");
        // Y en régimen el inductor es un corto.
        tr.advance_to(2e-3, u32::MAX).unwrap();
        assert!(tr.voltage(2).abs() < 1e-6);
    }

    #[test]
    fn lc_oscila_sin_perder_amplitud() {
        // Trapezoidal no amortigua: tras 20 periodos de un LC la amplitud sigue dentro de 1 %.
        let mut tr = Transient::new(net(r#"{"nodes":2,"elements":[
            {"type":"I","a":0,"b":1,"amps":0},
            {"type":"C","a":1,"b":0,"farads":1e-6},
            {"type":"L","a":1,"b":0,"henries":1e-3}]}"#), 2e-6).unwrap();
        // Se carga el capacitor con una corriente de 1 A durante 1 µs y se apaga.
        tr.set_element(0, Element::I { a: 0, b: 1, amps: 1.0 }).unwrap();
        tr.advance_to(1e-6, u32::MAX).unwrap();
        tr.set_element(0, Element::I { a: 0, b: 1, amps: 0.0 }).unwrap();
        let periodo = 2.0 * std::f64::consts::PI * (1e-3f64 * 1e-6).sqrt();
        let mut pico0 = 0.0f64;
        while tr.time() < 1e-6 + periodo {
            tr.step().unwrap();
            pico0 = pico0.max(tr.voltage(1).abs());
        }
        tr.advance_to(1e-6 + 20.0 * periodo, u32::MAX).unwrap();
        let mut pico = 0.0f64;
        while tr.time() < 1e-6 + 21.0 * periodo {
            tr.step().unwrap();
            pico = pico.max(tr.voltage(1).abs());
        }
        assert!((pico - pico0).abs() / pico0 < 0.01, "pico {pico} contra {pico0}");
    }

    #[test]
    fn un_diodo_directo_sobre_una_fuente_culpa_al_diodo_y_no_a_la_tierra() {
        let corre = |json: &str| Transient::new(net(json), 1e-5).unwrap().advance_to(1e-3, 100);
        // LED con sus parámetros, diodo con los de omisión y diodo sobre dos fuentes en serie.
        assert_eq!(corre(r#"{"nodes":2,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":9}},
            {"type":"D","a":1,"b":0,"is":1.5e-17,"n":2}]}"#), Err(EngineError::DiodoSinLimite { element: Some(1) }));
        assert_eq!(corre(r#"{"nodes":2,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":9}},
            {"type":"D","a":1,"b":0}]}"#), Err(EngineError::DiodoSinLimite { element: Some(1) }));
        assert_eq!(corre(r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
            {"type":"V","a":2,"b":1,"wave":{"kind":"dc","v":5}},
            {"type":"D","a":2,"b":0}]}"#), Err(EngineError::DiodoSinLimite { element: Some(2) }));
        // Con poco voltaje conduce sin problema, y una matriz singular sin diodos sigue diciendo lo que es.
        let mut tr = Transient::new(net(r#"{"nodes":2,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":0.65}},
            {"type":"D","a":1,"b":0}]}"#), 1e-5).unwrap();
        tr.advance_to(1e-3, u32::MAX).unwrap();
        assert_eq!(tr.time(), 1e-3);
        assert!(matches!(corre(DIODO_R_FLOTANTE), Err(EngineError::Singular { .. })));
    }

    #[test]
    fn el_led_sobre_una_fuente_da_el_mismo_error_con_la_densa_y_con_la_dispersa() {
        let json = r#"{"nodes":2,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":9}},
            {"type":"D","a":1,"b":0,"is":1.5e-17,"n":2}]}"#;
        for kind in [SolverKind::Dense, SolverKind::Sparse] {
            let mut tr = Transient::with_solver(net(json), 1e-5, kind).unwrap();
            assert_eq!(tr.advance_to(1e-3, 100), Err(EngineError::DiodoSinLimite { element: Some(1) }));
        }
    }

    #[test]
    fn un_transistor_con_la_base_en_una_fuente_culpa_al_transistor() {
        // Sin rb ni re, la base a 5 V empuja la unión a corrientes absurdas: el error nombra al transistor (elemento 2).
        let json = r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"Q","c":2,"b":1,"e":0}]}"#;
        for kind in [SolverKind::Dense, SolverKind::Sparse] {
            let mut tr = Transient::with_solver(net(json), 1e-5, kind).unwrap();
            assert_eq!(tr.advance_to(1e-3, 100), Err(EngineError::DiodoSinLimite { element: Some(2) }));
        }
    }

    #[test]
    fn una_bateria_un_diodo_y_un_capacitor_sin_resistencia_no_son_un_error() {
        // El pico de corriente del primer paso no se repite: el capacitor se carga a la fuente menos la caída del diodo.
        let json = r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":9}},
            {"type":"D","a":1,"b":2},
            {"type":"C","a":2,"b":0,"farads":1e-4}]}"#;
        for kind in [SolverKind::Dense, SolverKind::Sparse] {
            let mut tr = Transient::with_solver(net(json), 1e-5, kind).unwrap();
            tr.advance_to(1e-2, u32::MAX).unwrap();
            assert!(tr.voltage(2) > 8.0 && tr.voltage(2) < 9.0, "v = {}", tr.voltage(2));
        }
    }

    /// Diodo de la librería (is = 1e-14, n = 1, sin rs) a un capacitor grande en paralelo con 1 kΩ: el pico de corriente al
    /// encender pasa de 1 kA durante unos 26 ns por mF, sin importar el paso máximo, y no es un error.
    fn diodo_a_capacitor_y_carga(fuente: &str, farads: &str, interruptor: bool) -> String {
        // Con interruptor, el elemento 1 es una resistencia de 1 GΩ (abierto) entre la fuente y el diodo.
        let (nodos, anodo, salida, abre) = if interruptor { (4, 2, 3, r#"{"type":"R","a":1,"b":2,"ohms":1e9},"#) } else { (3, 1, 2, "") };
        format!(r#"{{"nodes":{nodos},"elements":[
            {{"type":"V","a":1,"b":0,"wave":{fuente}}},
            {abre}
            {{"type":"D","a":{anodo},"b":{salida}}},
            {{"type":"C","a":{salida},"b":0,"farads":{farads}}},
            {{"type":"R","a":{salida},"b":0,"ohms":1000}}]}}"#)
    }

    #[test]
    fn el_pico_de_carga_de_un_capacitor_grande_tras_un_diodo_no_es_un_error() {
        let dc = r#"{"kind":"dc","v":12}"#;
        let cuadrada = r#"{"kind":"square","low":0,"high":5,"freq":1000}"#;
        // (fuente, capacitor, paso máximo, interruptor): los cuatro circuitos que la revisión encontró disparando el error.
        for (fuente, c, hmax, cierra) in [(dc, "1e-3", 1e-6, false), (dc, "4.7e-3", 1e-5, false), (cuadrada, "1e-3", 1e-6, false), (dc, "470e-6", 1e-6, true)] {
            for kind in [SolverKind::Dense, SolverKind::Sparse] {
                let mut tr = Transient::with_solver(net(&diodo_a_capacitor_y_carga(fuente, c, cierra)), hmax, kind).unwrap();
                if cierra {
                    // El interruptor de 1 mΩ cierra sobre el diodo y el capacitor.
                    tr.advance_to(1e-4, u32::MAX).unwrap();
                    tr.set_resistance(1, 1e-3).unwrap();
                }
                let r = tr.advance_to(5e-3, u32::MAX);
                assert!(r.is_ok(), "{fuente} {c} hmax {hmax}: {r:?}");
                let salida = if cierra { 3 } else { 2 };
                assert!(tr.voltage(salida) > 3.0, "{fuente} {c}: v = {}", tr.voltage(salida));
            }
        }
    }

    #[test]
    fn un_mosfet_al_reves_sobre_una_fuente_culpa_a_su_diodo_de_cuerpo() {
        // Fuente de 12 V a la «fuente» del IRFZ44N y el drenador a tierra, sin rd ni rs: el diodo de cuerpo queda en directo.
        let json = r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":12}},
            {"type":"R","a":2,"b":0,"ohms":1000},
            {"type":"M","d":0,"g":2,"s":1,"model":{"vto":3,"kp":18,"lambda":0.01,"is":2e-14,"cbd":1.55e-9,"cgso":1.38e-9,"cgdo":88e-12}}]}"#;
        for kind in [SolverKind::Dense, SolverKind::Sparse] {
            let mut tr = Transient::with_solver(net(json), 1e-5, kind).unwrap();
            assert_eq!(tr.advance_to(1e-3, 100), Err(EngineError::DiodoSinLimite { element: Some(2) }));
        }
    }

    #[test]
    fn el_puente_con_la_fuente_flotante_y_un_capacitor_grande_no_es_singular() {
        // Cuatro diodos, fuente de 12 V flotante, 1000 µF y 1 kΩ: el primer paso es de pocos nanosegundos y la matriz tiene
        // 2e4 S de un lado y 1e-12 S de los nodos con diodos en inversa del otro.
        let json = r#"{"nodes":4,"elements":[
            {"type":"V","a":1,"b":2,"wave":{"kind":"sine","offset":0,"amp":12,"freq":50}},
            {"type":"D","a":1,"b":3},{"type":"D","a":2,"b":3},{"type":"D","a":0,"b":1},{"type":"D","a":0,"b":2},
            {"type":"C","a":3,"b":0,"farads":1e-3},{"type":"R","a":3,"b":0,"ohms":1000}]}"#;
        let mut d = Transient::with_solver(net(json), 2e-5, SolverKind::Dense).unwrap();
        let mut s = Transient::with_solver(net(json), 2e-5, SolverKind::Sparse).unwrap();
        d.advance_to(0.06, u32::MAX).unwrap();
        s.advance_to(0.06, u32::MAX).unwrap();
        assert!(d.voltage(3) > 9.5 && d.voltage(3) < 11.0, "v = {}", d.voltage(3));
        assert!((d.voltage(3) - s.voltage(3)).abs() < 1e-3, "{} contra {}", d.voltage(3), s.voltage(3));
    }

    /// Un diodo con la resistencia en un lazo sin tierra: singular, pero no por el diodo.
    const DIODO_R_FLOTANTE: &str = r#"{"nodes":3,"elements":[
        {"type":"R","a":1,"b":2,"ohms":1000},
        {"type":"D","a":2,"b":1}]}"#;

    #[test]
    fn rectificador_converge_al_reducir_el_paso() {
        let json = include_str!("../fixtures/rectificador.json");
        let mut g = Transient::new(net(json), 5e-6).unwrap();
        g.advance_to(0.1, u32::MAX).unwrap();
        let mut f = Transient::new(net(json), 5e-7).unwrap();
        f.advance_to(0.1, u32::MAX).unwrap();
        let d = (g.voltage(3) - f.voltage(3)).abs();
        assert!(d < 0.02, "grueso = {}, fino = {}", g.voltage(3), f.voltage(3));
    }

    #[test]
    fn un_circuito_demasiado_grande_para_el_denso_da_error_y_no_aborta() {
        let json = r#"{"nodes":70000,"elements":[{"type":"R","a":1,"b":0,"ohms":10}]}"#;
        let e = Transient::with_solver(net(json), 1e-6, SolverKind::Dense).err().unwrap();
        assert!(matches!(e, EngineError::Invalid(_)), "{e:?}");
    }

    #[test]
    fn los_circuitos_grandes_usan_la_dispersa_y_dan_lo_mismo() {
        // Escalera de 60 nodos con diodos: más de UMBRAL_DISPERSA incógnitas.
        let mut el = vec![r#"{"type":"V","a":1,"b":0,"wave":{"kind":"sine","offset":0,"amp":5,"freq":1000}}"#.to_string()];
        for k in 1..59 {
            el.push(format!(r#"{{"type":"R","a":{k},"b":{},"ohms":100}}"#, k + 1));
            el.push(format!(r#"{{"type":"D","a":{},"b":0}}"#, k + 1));
        }
        let json = format!(r#"{{"nodes":60,"elements":[{}]}}"#, el.join(","));
        assert!(incognitas(&net(&json)) > UMBRAL_DISPERSA);
        let mut a = Transient::new(net(&json), 5e-6).unwrap();
        let mut b = Transient::with_solver(net(&json), 5e-6, SolverKind::Dense).unwrap();
        a.advance_to(1e-3, u32::MAX).unwrap();
        b.advance_to(1e-3, u32::MAX).unwrap();
        for k in 0..60 {
            assert!((a.voltage(k) - b.voltage(k)).abs() < 1e-9, "nodo {k}");
        }
    }

    #[test]
    fn corrientes_del_divisor() {
        let mut tr = Transient::new(net(r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"R","a":2,"b":0,"ohms":1000}]}"#), 1e-6).unwrap();
        assert_eq!(tr.currents(), vec![0.0, 0.0, 0.0]);
        tr.step().unwrap();
        let i = tr.currents();
        assert_eq!(tr.element_count(), 3);
        // La fuente entrega 2.5 mA: de a hacia b a través de ella circulan -2.5 mA.
        assert!((i[0] + 2.5e-3).abs() < 1e-12, "i_v = {}", i[0]);
        assert!((i[1] - 2.5e-3).abs() < 1e-12 && (i[2] - 2.5e-3).abs() < 1e-12);
    }

    #[test]
    fn corriente_del_capacitor_al_cargar() {
        // Al primer paso el capacitor descargado se lleva casi toda la corriente de la resistencia.
        let mut tr = Transient::new(net(RC), 1e-6).unwrap();
        tr.step().unwrap();
        let i = tr.currents();
        assert!((i[1] - i[2]).abs() < 1e-12, "i_r = {}, i_c = {}", i[1], i[2]);
        assert!(i[2] > 4.9e-3);
        tr.advance_to(0.02, u32::MAX).unwrap();
        assert!(tr.currents()[2].abs() < 1e-6);
    }

    #[test]
    fn corriente_del_diodo_igual_a_la_de_la_resistencia() {
        let mut tr = Transient::new(net(DIODO_R), 1e-6).unwrap();
        tr.step().unwrap();
        let i = tr.currents();
        assert!((i[1] - i[2]).abs() / i[1] < 1e-4, "i_r = {}, i_d = {}", i[1], i[2]);
        assert!((i[0] + i[1]).abs() / i[1] < 1e-4);
    }

    #[test]
    fn diodo_invertido_no_conduce() {
        let mut tr = Transient::new(net(r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"D","a":0,"b":2}]}"#), 1e-6).unwrap();
        tr.step().unwrap();
        assert!((tr.voltage(2) - 5.0).abs() < 1e-3);
    }
}
