//! Simulador mixto: reparte el circuito en islas analógicas, cada una con su `Transient`, y las sincroniza con la lógica como el modo mixto de XSPICE: lo analógico avanza hasta el próximo evento o cruce de umbral y entonces la lógica procesa sus eventos.
//! Las islas son las partes analógicas que solo se tocan a través de piezas digitales (la tierra no une), para que los pasos cortos de un display no frenen al capacitor de un 555. Las que se influyen en ciclo se juntan y las demás avanzan en orden topológico. Sin lógica es una sola isla con la numeración original.

use std::collections::VecDeque;

use crate::canales::Canales;
use crate::devices::{Event, Reading, Tol};
use crate::digital::modelos::construir;
use crate::digital::simulador::EstadoDigital;
use crate::digital::{a_ps, a_ps_arriba, a_s, Digital, Nivel};
use crate::error::EngineError;
use crate::netlist::{Element, LectorDef, Netlist, SondaDef};
use crate::sonda::{EstadoSonda, Interpolacion, Sonda};
use crate::transient::{Cruce, EstadoTransient, Medida, SolverKind, Transient, DEFAULT_ITER_BUDGET};

/// Muestras pendientes que admite el simulador.
pub const MAX_MUESTRAS: usize = 4096;

/// Una muestra de un lector: el número del lector, el instante pedido y el valor leído.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Muestra {
    pub lector: usize,
    pub t: f64,
    pub v: f64,
}

/// El puente de valores (canales y lectores) repartido entre las islas.
#[derive(Default)]
struct Valores {
    /// Todos los canales con el valor que les puso el exterior; cada isla guarda además su copia de los que lee.
    canales: Canales,
    /// Por canal, las islas que lo leen.
    lectoras: Vec<Vec<usize>>,
    /// Por lector, su isla y su número dentro de ella; y por isla, el lector global de cada uno de los suyos.
    lecturas: Vec<(usize, usize)>,
    de_local: Vec<Vec<usize>>,
    /// Las islas con lectores.
    con_lectores: Vec<usize>,
    /// Cambios de canal que llegaron con un tiempo anterior al de la isla que los lee.
    tardios: u64,
    /// Muestras tomadas que aún no se entregan.
    listas: Vec<Muestra>,
}

/// Dónde vive una sonda: en su isla (con el mismo número que en la netlist) o en la lógica.
#[derive(Clone, Copy, Debug)]
enum LugarSonda {
    Isla { isla: usize },
    Logica(usize),
}

/// Una sonda de una red digital pura: registra el nivel como voltaje nominal.
struct SondaDigital {
    bajo: f64,
    alto: f64,
    sonda: Sonda,
}

/// El valor de una sonda digital: el voltaje nominal, X como NaN y Z como infinito.
fn valor_digital(n: Nivel, bajo: f64, alto: f64) -> f64 {
    match n {
        Nivel::Cero => bajo,
        Nivel::Uno => alto,
        Nivel::X => f64::NAN,
        Nivel::Z => f64::INFINITY,
    }
}

/// Separar en islas. Con false todo lo analógico queda en una sola matriz (la opción b).
pub const SEPARAR_ISLAS: bool = true;
/// Eventos digitales que una llamada a `advance_to` procesa antes de devolver el control al worker, aunque no llegue a la
/// meta: un lazo que oscila a decenas de megahertz no congela la interfaz.
pub const PRESUPUESTO_EVENTOS: u64 = 100_000;
/// Un evento vence cuando todas las islas llegaron a su instante con esta holgura (el instante de un cruce se redondea al
/// picosegundo siguiente).
const HOLGURA: f64 = 2e-12;

/** Lo más que una isla sin dinámica que no influye en otra se adelanta a la más adelantada de las que tienen dinámica (s simulados). Con una meta lejana saltaba hasta ella de una vez (un fusible calentado por una hora). */
pub const ADELANTO_QUIETA: f64 = 0.1;

#[derive(Clone, Copy, Debug)]
enum Lugar {
    Isla { isla: usize, local: usize },
    Logica { modelo: usize },
}

/// Lo que detiene a una isla: las salidas digitales (de modelos o de puentes de entrada) desde cuyas redes se llega por la
/// lógica a la red que lee alguno de sus puentes de salida, y las de sus propios puentes de entrada (un cruce suyo que la
/// lógica aún no procesa no debe quedar tapado por el siguiente cruce del mismo puente).
struct Horizonte {
    /// Ordenadas y sin repetir: se busca con `admite` (una tabla densa por isla costaba islas × salidas de memoria y de tiempo).
    salidas: Vec<u32>,
}

impl Horizonte {
    fn admite(&self, salida: u32) -> bool {
        self.salidas.binary_search(&salida).is_ok()
    }
}

struct Isla {
    tr: Transient,
    /// Elemento global de cada elemento local.
    globales: Vec<usize>,
    /// Puentes de entrada: elemento local, su índice en `Digital` y el último nivel que se le pasó a la lógica.
    entradas: Vec<(usize, usize, Nivel)>,
    /// No influye en ninguna otra isla (un fusible aparte, los segmentos de un display). Si además no tiene
    /// dinámica, no se adelanta a las islas que sí la tienen (ver `avanzar`).
    sumidero: bool,
}

impl Isla {
    /// Hasta dónde llegó: un paso más corto que el mínimo ya no se da.
    fn alcanzado(&self) -> f64 {
        self.tr.time() + self.tr.hmin()
    }
}

pub struct Mixto {
    islas: Vec<Isla>,
    logica: Option<Digital>,
    nodos: usize,
    /// Isla y nodo local de cada nodo global (None en la tierra y en un nodo sin elementos).
    nodo: Vec<Option<(usize, usize)>>,
    lugar: Vec<Lugar>,
    /// Elemento global de cada modelo digital.
    global_de_modelo: Vec<usize>,
    /// Por red digital, los elementos analógicos que la leen: (isla, elemento local, posición de la red en sus entradas).
    lectores: Vec<Vec<(usize, usize, usize)>>,
    /// Por isla, las salidas digitales que llegan a sus puentes de salida.
    horizontes: Vec<Horizonte>,
    readings: Vec<Reading>,
    /// Tiempo alcanzado por un circuito sin islas (solo lógica).
    t_logica: f64,
    presupuesto_eventos: u64,
    /// Iteraciones de Newton perdidas que puede gastar una llamada entre todas las islas.
    presupuesto_iter: usize,
    perdidas: usize,
    cambiadas: Vec<u32>,
    sondas: Vec<LugarSonda>,
    sondas_digitales: Vec<SondaDigital>,
    /// Por red digital, las sondas digitales que la miden (vacío sin sondas digitales).
    sondas_de_red: Vec<Vec<usize>>,
    /// La primera casilla de corriente por terminal de cada elemento en el orden de la netlist (los digitales no
    /// tienen), y la isla y el número dentro de ella de cada potencia de `activar_potencias`.
    casillas: Vec<usize>,
    potencias: Vec<(usize, usize)>,
    /// Retroceder: los estados guardados antes de cada avance en pausa (ver `guardar_estado`).
    guardados: Historial,
    valores: Valores,
}

/// Cuántos estados guarda como máximo `Mixto::guardar_estado` (los últimos 200 avances).
pub const ESTADOS_MAX: usize = 200;
/// Memoria máxima de los estados guardados (bytes): pasada, se olvidan los más viejos aunque no sean 200.
pub const ESTADOS_BYTES_MAX: usize = 64 * 1024 * 1024;

/// Todo lo que cambia con el tiempo en el simulador mixto en un instante: el de cada isla, la lógica, las lecturas y de cada
/// sonda lo justo para recortarla. Ver `Mixto::guardar_estado`.
struct EstadoMixto {
    islas: Vec<EstadoTransient>,
    /// El último nivel que se le pasó a la lógica de cada puente de entrada, por isla.
    entradas: Vec<Vec<Nivel>>,
    logica: Option<EstadoDigital>,
    t_logica: f64,
    readings: Vec<Reading>,
    sondas_digitales: Vec<EstadoSonda>,
    canales: Canales,
    /// `Mixto::time()` cuando se guardó.
    tiempo: f64,
    bytes: usize,
}

struct Historial {
    estados: VecDeque<EstadoMixto>,
    bytes: usize,
    max: usize,
    max_bytes: usize,
    /// Cuántos estados se olvidaron por pasar de la memoria máxima (no por pasar de `max`) desde la última vez que se preguntó.
    perdidos_por_memoria: u64,
}

impl Default for Historial {
    fn default() -> Self {
        Self { estados: VecDeque::new(), bytes: 0, max: ESTADOS_MAX, max_bytes: ESTADOS_BYTES_MAX, perdidos_por_memoria: 0 }
    }
}

/// La primera casilla de corriente por terminal de cada elemento (sus nodos y la tierra interna; ninguna en los digitales) y
/// la siguiente a la última.
fn casillas_de(net: &Netlist) -> Vec<usize> {
    let mut c = Vec::with_capacity(net.elements.len() + 1);
    let mut n = 0;
    for e in &net.elements {
        c.push(n);
        if !e.es_digital() {
            n += e.nodes().len() + 1;
        }
    }
    c.push(n);
    c
}

fn raiz(padre: &mut [usize], mut k: usize) -> usize {
    while padre[k] != k {
        padre[k] = padre[padre[k]];
        k = padre[k];
    }
    k
}

fn unir(padre: &mut [usize], a: usize, b: usize) {
    let (a, b) = (raiz(padre, a), raiz(padre, b));
    if a != b {
        padre[a] = b;
    }
}

impl Mixto {
    /// Como `Transient::new`: cada isla elige la LU densa o la dispersa según su tamaño.
    pub fn new(net: Netlist, h: f64) -> Result<Self, EngineError> {
        Self::construir(net, h, None)
    }

    pub fn with_solver(net: Netlist, h: f64, kind: SolverKind) -> Result<Self, EngineError> {
        Self::construir(net, h, Some(kind))
    }

    fn construir(net: Netlist, h: f64, kind: Option<SolverKind>) -> Result<Self, EngineError> {
        net.validate()?;
        let transitorio = |n: Netlist| match kind {
            Some(k) => Transient::with_solver(n, h, k),
            None => Transient::new(n, h),
        };
        let ne = net.elements.len();
        let casillas = casillas_de(&net);
        let hay_logica = net.digital_nets > 0 || net.elements.iter().any(|e| e.es_digital() || e.es_puente());
        if !hay_logica {
            let nodos = net.nodes;
            let defs = net.sondas.clone();
            let canales = Canales::todos(&net.canales);
            let n_lectores = net.lectores.len();
            let tr = transitorio(net)?;
            let valores = Valores {
                lectoras: (0..canales.total()).map(|c| if tr.lee_canal(c) { vec![0] } else { Vec::new() }).collect(),
                canales,
                lecturas: (0..n_lectores).map(|k| (0, k)).collect(),
                de_local: vec![(0..n_lectores).collect()],
                con_lectores: if n_lectores > 0 { vec![0] } else { Vec::new() },
                ..Valores::default()
            };
            let mut m = Self {
                islas: vec![Isla { tr, globales: (0..ne).collect(), entradas: Vec::new(), sumidero: true }],
                logica: None,
                nodos,
                nodo: (0..nodos).map(|k| if k == 0 { None } else { Some((0, k)) }).collect(),
                lugar: (0..ne).map(|k| Lugar::Isla { isla: 0, local: k }).collect(),
                global_de_modelo: Vec::new(),
                lectores: Vec::new(),
                horizontes: Vec::new(),
                readings: vec![Reading::default(); ne],
                t_logica: 0.0,
                presupuesto_eventos: PRESUPUESTO_EVENTOS,
                presupuesto_iter: DEFAULT_ITER_BUDGET,
                perdidas: 0,
                cambiadas: Vec::new(),
                sondas: Vec::new(),
                sondas_digitales: Vec::new(),
                sondas_de_red: Vec::new(),
                casillas,
                potencias: Vec::new(),
                guardados: Historial::default(),
                valores,
            };
            m.armar_sondas(&defs)?;
            m.leer();
            return Ok(m);
        }

        // 1. Componentes de nodos analógicos, sin la tierra, unidos por los elementos analógicos y los puentes.
        let mut padre: Vec<usize> = (0..net.nodes).collect();
        for e in net.elements.iter().filter(|e| !e.es_digital()) {
            let ns: Vec<usize> = e.nodes().into_iter().filter(|&k| k != 0).collect();
            for w in ns.windows(2) {
                unir(&mut padre, w[0], w[1]);
            }
        }
        let mut comp: Vec<Option<usize>> = Vec::with_capacity(ne);
        for e in &net.elements {
            comp.push(if e.es_digital() { None } else { e.nodes().into_iter().find(|&k| k != 0).map(|k| raiz(&mut padre, k)) });
        }

        // 2. Una isla por componente con algún puente; los componentes sin puentes, juntos en la isla 0.
        let mut con_puente = vec![false; net.nodes];
        for (k, e) in net.elements.iter().enumerate() {
            if let (true, Some(r)) = (e.es_puente(), comp[k]) {
                con_puente[r] = true;
            }
        }
        let analogico_suelto = net.elements.iter().enumerate().any(|(k, e)| !e.es_digital() && comp[k].is_none_or(|r| !con_puente[r]));
        let mut isla_de_raiz = vec![usize::MAX; net.nodes];
        let mut n_islas = usize::from(analogico_suelto || !SEPARAR_ISLAS);
        for k in 0..ne {
            if let Some(r) = comp[k] {
                if isla_de_raiz[r] == usize::MAX {
                    isla_de_raiz[r] = if con_puente[r] && SEPARAR_ISLAS {
                        n_islas += 1;
                        n_islas - 1
                    } else {
                        0
                    };
                }
            }
        }
        let isla_prov: Vec<Option<usize>> = (0..ne).map(|k| (!net.elements[k].es_digital()).then(|| comp[k].map_or(0, |r| isla_de_raiz[r]))).collect();

        // 3. Qué isla influye en cuál: desde la red de cada puente de entrada, por la lógica, hasta los puentes de salida.
        let mut leen: Vec<Vec<usize>> = vec![Vec::new(); net.digital_nets];
        let mut dac_de_red: Vec<Vec<usize>> = vec![Vec::new(); net.digital_nets];
        for (k, e) in net.elements.iter().enumerate() {
            for r in e.entradas_digitales() {
                if e.es_digital() {
                    leen[r].push(k);
                } else if let Some(i) = isla_prov[k] {
                    dac_de_red[r].push(i);
                }
            }
        }
        let mut influye: Vec<Vec<usize>> = vec![Vec::new(); n_islas];
        let mut visto = vec![false; net.digital_nets];
        let mut tocadas: Vec<usize> = Vec::new();
        for (k, e) in net.elements.iter().enumerate() {
            let (Some(i), true) = (isla_prov[k], e.es_puente()) else { continue };
            let salidas = e.salidas_digitales();
            if salidas.is_empty() {
                continue;
            }
            for r in tocadas.drain(..) {
                visto[r] = false;
            }
            let mut cola: VecDeque<usize> = salidas.into_iter().collect();
            while let Some(r) = cola.pop_front() {
                if std::mem::replace(&mut visto[r], true) {
                    continue;
                }
                tocadas.push(r);
                for &j in &dac_de_red[r] {
                    if j != i {
                        influye[i].push(j);
                    }
                }
                for &m in &leen[r] {
                    cola.extend(net.elements[m].salidas_digitales());
                }
            }
        }
        for a in influye.iter_mut() {
            a.sort_unstable();
            a.dedup();
        }
        // 4. Las islas que se influyen en ciclo se juntan (componentes fuertemente conexas, Tarjan); las componentes quedan
        // en orden topológico.
        let mut posicion = vec![0usize; n_islas];
        for (p, c) in crate::grafo::componentes_fuertes(&influye).into_iter().enumerate() {
            for i in c {
                posicion[i] = p;
            }
        }
        let n_final = posicion.iter().max().map_or(0, |&p| p + 1);
        // Las islas finales que no influyen en otra.
        let mut sumidero = vec![true; n_final];
        for (a, bs) in influye.iter().enumerate() {
            if bs.iter().any(|&b| posicion[b] != posicion[a]) {
                sumidero[posicion[a]] = false;
            }
        }
        let isla_de: Vec<Option<usize>> = isla_prov.iter().map(|i| i.map(|i| posicion[i])).collect();

        // 5. La netlist de cada isla, con sus nodos numerados desde 1.
        let mut nodo: Vec<Option<(usize, usize)>> = vec![None; net.nodes];
        let mut cuantos = vec![1usize; n_final];
        let mut lugar: Vec<Option<Lugar>> = vec![None; ne];
        let mut elementos: Vec<Vec<Element>> = vec![Vec::new(); n_final];
        let mut globales: Vec<Vec<usize>> = vec![Vec::new(); n_final];
        for (k, e) in net.elements.iter().enumerate() {
            let Some(i) = isla_de[k] else { continue };
            for n in e.nodes() {
                if n != 0 && nodo[n].is_none() {
                    nodo[n] = Some((i, cuantos[i]));
                    cuantos[i] += 1;
                }
            }
            lugar[k] = Some(Lugar::Isla { isla: i, local: elementos[i].len() });
            elementos[i].push(e.con_nodos(|n| nodo[n].map_or(0, |(_, l)| l)));
            globales[i].push(k);
        }
        let (lectores_de_isla, lecturas, de_local) = repartir_lectores(&net, &nodo, &lugar, n_final)?;
        let mut islas = Vec::with_capacity(n_final);
        for (i, (els, glob)) in elementos.into_iter().zip(globales).enumerate() {
            let local = Netlist { nodes: cuantos[i], digital_nets: net.digital_nets, elements: els, sondas: Vec::new(), canales: net.canales.clone(), lectores: lectores_de_isla[i].clone(), tablas: Vec::new() };
            let tr = transitorio(local).map_err(|e| a_global_de(&glob, e))?;
            islas.push(Isla { tr, globales: glob, entradas: Vec::new(), sumidero: sumidero[i] });
        }

        // 6. La lógica: los modelos digitales y una salida por cada puente de entrada.
        let mut modelos = Vec::new();
        let mut global_de_modelo = Vec::new();
        let mut puentes = Vec::new();
        let mut lectores: Vec<Vec<(usize, usize, usize)>> = vec![Vec::new(); net.digital_nets];
        let tablas: Vec<std::sync::Arc<[u64]>> = net.tablas.iter().map(|t| std::sync::Arc::from(t.as_slice())).collect();
        for (k, e) in net.elements.iter().enumerate() {
            if let Some(m) = construir(e, k, &tablas, &net.tablas)? {
                lugar[k] = Some(Lugar::Logica { modelo: modelos.len() });
                global_de_modelo.push(k);
                modelos.push(m);
            } else if let Some(Lugar::Isla { isla, local }) = lugar[k] {
                for r in e.salidas_digitales() {
                    islas[isla].entradas.push((local, puentes.len(), Nivel::X));
                    puentes.push(r as u32);
                }
                for (bit, r) in e.entradas_digitales().into_iter().enumerate() {
                    lectores[r].push((isla, local, bit));
                }
            }
        }
        let mut logica = Digital::new(net.digital_nets, modelos, &puentes)?;
        let mut iniciales = vec![Nivel::X; puentes.len()];
        for isla in islas.iter_mut() {
            for e in isla.entradas.iter_mut() {
                e.2 = isla.tr.nivel_logico(e.0).unwrap_or(Nivel::X);
                iniciales[e.1] = e.2;
            }
        }
        logica.arrancar(&iniciales);
        // 7. El horizonte de cada isla: hacia atrás desde las redes que leen sus puentes de salida, por los modelos que las
        // manejan, hasta los puentes de entrada. Un evento en otra red nunca cambia lo que la isla ve, así que no la detiene.
        // Una red de tres estados puede tener varias salidas: el horizonte pasa por todas.
        let mut conductor: Vec<Vec<usize>> = vec![Vec::new(); net.digital_nets];
        for (k, e) in net.elements.iter().enumerate() {
            for r in e.salidas_digitales() {
                conductor[r].push(k);
            }
        }
        // Un índice de las redes que lee cada isla y otro de las salidas de cada red, y una marca con el número de la isla que la
        // puso: así cada horizonte cuesta lo que recorre y no el tamaño de la netlist entera (con mil islas en cadena era cuadrático).
        let mut lee_isla: Vec<Vec<usize>> = vec![Vec::new(); islas.len()];
        for (r, ls) in lectores.iter().enumerate() {
            for &(i, _, _) in ls {
                if lee_isla[i].last() != Some(&r) {
                    lee_isla[i].push(r);
                }
            }
        }
        let salidas_por_red = logica.salidas_por_red();
        let mut marca = vec![usize::MAX; net.digital_nets];
        let mut horizontes = Vec::with_capacity(islas.len());
        for i in 0..islas.len() {
            let mut pila: Vec<usize> = lee_isla[i].clone();
            let mut salidas: Vec<u32> = Vec::new();
            while let Some(r) = pila.pop() {
                if std::mem::replace(&mut marca[r], i) == i {
                    continue;
                }
                salidas.extend(&salidas_por_red[r]);
                for &k in conductor[r].iter().filter(|&&k| net.elements[k].es_digital()) {
                    pila.extend(net.elements[k].entradas_digitales());
                }
            }
            for e in &islas[i].entradas {
                salidas.push(logica.salida_de_puente(e.1));
            }
            salidas.sort_unstable();
            salidas.dedup();
            horizontes.push(Horizonte { salidas });
        }
        for (r, ls) in lectores.iter().enumerate() {
            for &(i, l, b) in ls {
                islas[i].tr.fijar_nivel_bit(l, b, logica.nivel(r), true);
            }
        }
        let mut m = Self {
            islas,
            logica: Some(logica),
            nodos: net.nodes,
            nodo,
            lugar: lugar.into_iter().map(|l| l.expect("cada elemento queda en una isla o en la lógica")).collect(),
            global_de_modelo,
            lectores,
            horizontes,
            readings: vec![Reading::default(); ne],
            t_logica: 0.0,
            presupuesto_eventos: PRESUPUESTO_EVENTOS,
            presupuesto_iter: DEFAULT_ITER_BUDGET,
            perdidas: 0,
            cambiadas: Vec::new(),
            sondas: Vec::new(),
            sondas_digitales: Vec::new(),
            sondas_de_red: Vec::new(),
            casillas,
            potencias: Vec::new(),
            guardados: Historial::default(),
            valores: Valores::default(),
        };
        m.valores = Valores {
            lectoras: (0..net.canales.len()).map(|c| (0..m.islas.len()).filter(|&i| m.islas[i].tr.lee_canal(c)).collect()).collect(),
            canales: Canales::todos(&net.canales),
            con_lectores: (0..m.islas.len()).filter(|&i| !de_local[i].is_empty()).collect(),
            lecturas,
            de_local,
            ..Valores::default()
        };
        m.armar_sondas(&net.sondas)?;
        m.leer();
        Ok(m)
    }

    /// Pone cada sonda donde vive lo que mide (ver el comentario de `LugarSonda`).
    fn armar_sondas(&mut self, defs: &[SondaDef]) -> Result<(), EngineError> {
        for (k, d) in defs.iter().enumerate() {
            let nueva = |interp| {
                let mut s = Sonda::new(interp, d.muestras(), d.columna());
                if d.sin_rejilla() {
                    s.quitar_rejilla();
                }
                s
            };
            match *d {
                SondaDef::V { p, n, .. } => {
                    let (np, nn) = (self.nodo.get(p).copied().flatten(), self.nodo.get(n).copied().flatten());
                    let isla = match (np, nn) {
                        (Some((a, _)), Some((b, _))) if a != b => {
                            return Err(EngineError::Invalid(format!("sonda {k}: sus dos nodos quedan en islas distintas")))
                        }
                        (Some((a, _)), _) | (None, Some((a, _))) => a,
                        (None, None) => return Err(EngineError::Invalid(format!("sonda {k}: no mide ningún nodo con elementos"))),
                    };
                    let local = |x: Option<(usize, usize)>| x.map_or(0, |(_, l)| l);
                    self.islas[isla].tr.agregar_sonda(k, Medida::Voltaje { p: local(np), n: local(nn) }, nueva(Interpolacion::Lineal));
                    self.sondas.push(LugarSonda::Isla { isla });
                }
                SondaDef::I { element, signo, .. } => match self.lugar[element] {
                    Lugar::Isla { isla, local } => {
                        self.islas[isla].tr.agregar_sonda(k, Medida::Corriente { elemento: local, signo }, nueva(Interpolacion::Lineal));
                        self.sondas.push(LugarSonda::Isla { isla });
                    }
                    Lugar::Logica { .. } => return Err(EngineError::Invalid(format!("sonda {k}: el elemento no existe o es digital"))),
                },
                SondaDef::D { red, bajo, alto, .. } => {
                    let mut sonda = nueva(Interpolacion::Escalon);
                    sonda.empujar(self.time(), valor_digital(self.nivel(red), bajo, alto));
                    if self.sondas_de_red.is_empty() {
                        self.sondas_de_red = vec![Vec::new(); self.digital_count()];
                    }
                    self.sondas_de_red[red].push(self.sondas_digitales.len());
                    self.sondas.push(LugarSonda::Logica(self.sondas_digitales.len()));
                    self.sondas_digitales.push(SondaDigital { bajo, alto, sonda });
                }
            }
        }
        Ok(())
    }

    pub fn n_sondas(&self) -> usize {
        self.sondas.len()
    }

    /// La sonda `k` de la netlist.
    pub fn sonda(&self, k: usize) -> Option<&Sonda> {
        match *self.sondas.get(k)? {
            LugarSonda::Isla { isla } => self.islas[isla].tr.sonda(k),
            LugarSonda::Logica(j) => Some(&self.sondas_digitales[j].sonda),
        }
    }

    pub fn sonda_mut(&mut self, k: usize) -> Option<&mut Sonda> {
        match *self.sondas.get(k)? {
            LugarSonda::Isla { isla } => self.islas[isla].tr.sonda_mut(k),
            LugarSonda::Logica(j) => Some(&mut self.sondas_digitales[j].sonda),
        }
    }

    /// Memoria que reservan las sondas (bytes).
    pub fn memoria_sondas(&self) -> usize {
        (0..self.sondas.len()).filter_map(|k| self.sonda(k)).map(Sonda::bytes).sum()
    }

    /// Las sondas digitales llevan su escalón hasta donde está completa la simulación.
    fn marcar_sondas_digitales(&mut self) {
        if self.sondas_digitales.is_empty() {
            return;
        }
        let t = self.time();
        for s in self.sondas_digitales.iter_mut() {
            let v = s.sonda.ultimo_valor();
            s.sonda.empujar(t, v);
        }
    }

    /// Empieza a integrar los voltajes y las corrientes de todas las islas.
    pub fn activar_promedios(&mut self) {
        self.guardados.descartar();
        for i in self.islas.iter_mut() {
            i.tr.activar_promedios();
        }
    }

    pub fn reiniciar_promedios(&mut self) {
        for i in self.islas.iter_mut() {
            i.tr.reiniciar_promedios();
        }
    }

    /// El promedio de cada nodo (`v`) y de la corriente de cada elemento en el orden de la netlist (`i`) desde el último
    /// reinicio, cada uno en el tiempo de su isla; devuelve el intervalo más corto entre las islas (0 sin promedios).
    pub fn promedios_into(&self, v: &mut Vec<f64>, i: &mut Vec<f64>) -> f64 {
        v.clear();
        i.clear();
        v.extend((0..self.nodos).map(|k| self.nodo[k].map_or(0.0, |(isla, l)| self.islas[isla].tr.promedio_v(l))));
        i.extend(self.lugar.iter().map(|l| match *l {
            Lugar::Isla { isla, local } => self.islas[isla].tr.promedio_i(local),
            Lugar::Logica { .. } => 0.0,
        }));
        let d = self.islas.iter().map(|x| x.tr.duracion_promedio()).fold(f64::INFINITY, f64::min);
        if d.is_finite() { d } else { 0.0 }
    }

    /// Empieza (o deja) de integrar las corrientes por terminal de todas las islas.
    pub fn activar_terminales(&mut self, si: bool) {
        self.guardados.descartar();
        for i in self.islas.iter_mut() {
            i.tr.activar_terminales(si);
        }
    }

    /// Casillas de corriente por terminal de toda la netlist (`terminales_into` da una por cada una).
    pub fn casillas_terminales(&self) -> usize {
        *self.casillas.last().unwrap_or(&0)
    }

    /// El promedio de cada corriente por terminal (`medias`) y el de su valor absoluto (`absolutas`) desde el último reinicio,
    /// en el orden de la netlist: por elemento, sus nodos y la tierra interna, cada uno en el tiempo de su isla (los digitales no
    /// tienen casillas). Devuelve el intervalo más corto entre las islas, como `promedios_into`.
    pub fn terminales_into(&self, medias: &mut Vec<f64>, absolutas: &mut Vec<f64>) -> f64 {
        medias.clear();
        absolutas.clear();
        for l in &self.lugar {
            if let Lugar::Isla { isla, local } = *l {
                let tr = &self.islas[isla].tr;
                let (a, b) = tr.casillas_de(local);
                for j in a..b {
                    let (m, v) = tr.promedio_terminal(j);
                    medias.push(m);
                    absolutas.push(v);
                }
            }
        }
        let d = self.islas.iter().map(|x| x.tr.duracion_promedio()).fold(f64::INFINITY, f64::min);
        if d.is_finite() { d } else { 0.0 }
    }

    /// Las corrientes por terminal del elemento `k` (de la netlist) en el último paso de su isla, en `out` (sus nodos y la
    /// tierra interna); false si el elemento es digital o no existe.
    pub fn corrientes_de(&self, k: usize, out: &mut [f64]) -> bool {
        match self.lugar.get(k) {
            Some(&Lugar::Isla { isla, local }) => {
                self.islas[isla].tr.corrientes_de(local, out);
                true
            }
            _ => false,
        }
    }

    /// Los elementos (de la netlist) cuya potencia media se integra; un elemento digital o fuera de rango se rechaza.
    pub fn activar_potencias(&mut self, elementos: &[usize]) -> Result<(), EngineError> {
        self.guardados.descartar();
        let mut por_isla: Vec<Vec<usize>> = vec![Vec::new(); self.islas.len()];
        let mut lugares = Vec::with_capacity(elementos.len());
        for &k in elementos {
            match self.lugar.get(k) {
                Some(&Lugar::Isla { isla, local }) => {
                    lugares.push((isla, por_isla[isla].len()));
                    por_isla[isla].push(local);
                }
                Some(_) => return Err(EngineError::Invalid(format!("elemento {k}: un elemento digital no tiene potencia"))),
                None => return Err(EngineError::Invalid(format!("elemento {k}: fuera de rango"))),
            }
        }
        for (i, locales) in por_isla.iter().enumerate() {
            self.islas[i].tr.activar_potencias(locales)?;
        }
        self.potencias = lugares;
        Ok(())
    }

    /// La potencia media de cada elemento de `activar_potencias`, en su orden.
    pub fn potencias_into(&self, out: &mut Vec<f64>) {
        out.clear();
        out.extend(self.potencias.iter().map(|&(i, q)| self.islas[i].tr.promedio_potencia(q)));
    }

    /// Los cambios de estado que se oyen (zumbadores y relés) desde la última llamada, con su elemento en el orden de la
    /// netlist y ordenados por instante, y cuántos no cupieron.
    pub fn take_cruces(&mut self) -> (Vec<Cruce>, u32) {
        let mut todos = Vec::new();
        let perdidos = self.tomar_cruces(&mut todos);
        (todos, perdidos)
    }

    /// Como `take_cruces`, en `out` (que se vacía antes) y sin reservar memoria si `out` ya tiene capacidad.
    pub fn tomar_cruces(&mut self, out: &mut Vec<Cruce>) -> u32 {
        out.clear();
        let mut perdidos = 0u32;
        for isla in self.islas.iter_mut() {
            let desde = out.len();
            perdidos = perdidos.saturating_add(isla.tr.tomar_cruces(out));
            for c in &mut out[desde..] {
                c.element = isla.globales[c.element];
            }
        }
        // Cada isla los da en orden; juntas, por instante (sin reservar: `sort_unstable_by`).
        if self.islas.len() > 1 {
            out.sort_unstable_by(|a, b| a.t.total_cmp(&b.t));
        }
        perdidos
    }

    /// «Las piezas se queman»: quema (o repone) el elemento `index` en su isla (`Transient::quemar`).
    pub fn quemar(&mut self, index: usize, si: bool) -> Result<(), EngineError> {
        self.guardados.descartar();
        match self.lugar.get(index).copied() {
            Some(Lugar::Isla { isla, local }) => {
                let r = self.islas[isla].tr.quemar(local, si);
                r.map_err(|e| a_global_de(&self.islas[isla].globales, e))
            }
            Some(_) => Err(EngineError::Invalid(format!("elemento {index}: solo se queman resistencias, diodos, transistores, capacitores, motores y amplificadores"))),
            None => Err(EngineError::Invalid(format!("elemento {index}: fuera de rango"))),
        }
    }

    /// El tiempo de cada isla (las pruebas de «Avanzar» comprueban que todas quedan en el mismo instante).
    pub fn tiempos_de_islas(&self) -> Vec<f64> {
        self.islas.iter().map(|i| i.tr.time()).collect()
    }

    /// El paso más corto que da alguna isla (el mayor de sus mínimos): «Avanzar» llega a su meta con esta precisión.
    pub fn hmin(&self) -> f64 {
        self.islas.iter().map(|i| i.tr.hmin()).fold(0.0, f64::max)
    }

    /// Avanza hasta `t_end` o hasta dar `max_steps` pasos; un paso es un paso de una isla o un instante de la lógica.
    /// También devuelve el control si procesó `presupuesto_eventos` eventos digitales en la llamada.
    pub fn advance_to(&mut self, t_end: f64, max_steps: u32) -> Result<u32, EngineError> {
        self.perdidas = 0;
        if self.logica.is_none() {
            let r = self.islas[0].tr.advance_to(t_end, max_steps);
            self.perdidas = self.islas[0].tr.lost_iterations();
            self.leer();
            return r;
        }
        for isla in self.islas.iter_mut() {
            isla.tr.empezar_llamada();
        }
        let mut pasos = 0;
        let r = self.avanzar(t_end, max_steps, &mut pasos);
        self.perdidas = self.islas.iter().map(|i| i.tr.lost_iterations()).sum();
        self.leer();
        self.marcar_sondas_digitales();
        r.map(|()| pasos)
    }

    fn avanzar(&mut self, t_end: f64, max_steps: u32, pasos: &mut u32) -> Result<(), EngineError> {
        let eventos0 = self.logica.as_ref().unwrap().eventos;
        // Una isla sin dinámica que no influye en otra no pasa de la más adelantada de las que tienen dinámica (más `ADELANTO_QUIETA`). La frontera se calcula una vez por llamada y el orden no cambia: una isla que influye en otra va antes.
        let mut frontera = f64::NEG_INFINITY;
        for x in &self.islas {
            if !x.tr.es_estatico() {
                frontera = frontera.max(x.alcanzado());
            }
        }
        if frontera == f64::NEG_INFINITY {
            frontera = t_end;
        }
        loop {
            // 1. Los eventos que ya vencieron: todas las islas llegaron a su instante.
            let comun = self.islas.iter().map(Isla::alcanzado).fold(f64::INFINITY, f64::min).min(t_end);
            loop {
                let Self { logica, islas, lectores, cambiadas, t_logica, presupuesto_eventos, sondas_digitales, sondas_de_red, .. } = self;
                let logica = logica.as_mut().unwrap();
                let Some(te) = logica.siguiente() else { break };
                if a_s(te) > comun + HOLGURA {
                    break;
                }
                cambiadas.clear();
                cambiadas.extend_from_slice(logica.procesar(te)?);
                for &red in cambiadas.iter() {
                    let n = logica.nivel(red as usize);
                    for &(i, l, b) in &lectores[red as usize] {
                        islas[i].tr.fijar_nivel_bit(l, b, n, false);
                    }
                    if let Some(js) = sondas_de_red.get(red as usize) {
                        for &j in js {
                            let s = &mut sondas_digitales[j];
                            s.sonda.empujar(a_s(te), valor_digital(n, s.bajo, s.alto));
                        }
                    }
                }
                *pasos += 1;
                if islas.is_empty() {
                    *t_logica = a_s(te).min(t_end);
                }
                if logica.eventos - eventos0 >= *presupuesto_eventos || *pasos >= max_steps {
                    return Ok(());
                }
            }
            let siguiente = self.logica.as_ref().unwrap().siguiente().map(a_s);
            let falta_logica = siguiente.is_some_and(|t| t <= t_end + HOLGURA);
            if !falta_logica && self.islas.iter().all(|i| i.alcanzado() >= t_end) {
                if self.islas.is_empty() {
                    self.t_logica = t_end;
                }
                return Ok(());
            }
            // 2. Cada isla avanza, en orden topológico, hasta el próximo evento que llega a sus puentes de salida (su
            // horizonte) o hasta un cruce. El cruce de una isla queda en la cola y acota el horizonte de las que siguen.
            for i in 0..self.islas.len() {
                let mut h = self.horizonte(i, t_end);
                let quieta = self.islas[i].sumidero && self.islas[i].tr.es_estatico();
                // Hasta `ADELANTO_QUIETA` adelante de la frontera: con las metas de siempre (un ciclo del worker) salta a la meta
                // de una vez, como antes; detenerla en la frontera le daba un salto por cada vuelta (los segmentos de un display
                // costaban 8 % de capacidad).
                if quieta {
                    h = h.min(frontera + ADELANTO_QUIETA);
                }
                if self.islas[i].alcanzado() >= h {
                    continue;
                }
                // El presupuesto de iteraciones es de toda la llamada: a esta isla le queda lo que no gastaron las demás.
                let otras: usize = self.islas.iter().enumerate().filter(|&(j, _)| j != i).map(|(_, x)| x.tr.lost_iterations()).sum();
                self.islas[i].tr.set_iteration_budget(self.presupuesto_iter.saturating_sub(otras));
                let r = self.islas[i].tr.advance_hasta_cruce(h, max_steps - *pasos);
                let (n, cruzo) = r.map_err(|e| a_global_de(&self.islas[i].globales, e))?;
                *pasos += n;
                if !self.islas[i].tr.es_estatico() {
                    frontera = frontera.max(self.islas[i].alcanzado());
                }
                if cruzo {
                    let Self { logica, islas, .. } = self;
                    let isla = &mut islas[i];
                    let t = isla.tr.time();
                    let logica = logica.as_mut().unwrap();
                    for e in isla.entradas.iter_mut() {
                        let nivel = isla.tr.nivel_logico(e.0).unwrap_or(Nivel::X);
                        if nivel != e.2 {
                            e.2 = nivel;
                            // El instante del cruce dentro del paso, nunca después del final del paso.
                            let tc = isla.tr.instante_cambio(e.0).unwrap_or(t).min(t);
                            logica.poner_puente(e.1, a_ps_arriba(tc), nivel);
                        }
                    }
                }
                if *pasos >= max_steps {
                    return Ok(());
                }
            }
        }
    }

    /// Guarda el estado completo antes de un avance para `restaurar_estado`, hasta `ESTADOS_MAX` y `ESTADOS_BYTES_MAX` (se olvida el más viejo). Cubre tiempo, cada isla con el estado interno de sus dispositivos, la lógica, los promedios y lo justo de cada sonda.
    /// Cualquier edición del circuito (`set_element`, `set_resistance`, `set_max_step`, `reset_element`, `quemar`, `activar_*`) descarta los estados guardados.
    pub fn guardar_estado(&mut self) {
        let islas: Vec<EstadoTransient> = self.islas.iter().map(|i| i.tr.guardar()).collect();
        let logica = self.logica.as_ref().map(Digital::guardar);
        let sondas_digitales: Vec<EstadoSonda> = self.sondas_digitales.iter().map(|s| s.sonda.estado()).collect();
        let entradas: Vec<Vec<Nivel>> = self.islas.iter().map(|i| i.entradas.iter().map(|e| e.2).collect()).collect();
        let bytes = islas.iter().map(EstadoTransient::bytes).sum::<usize>()
            + logica.as_ref().map_or(0, EstadoDigital::bytes)
            + self.readings.len() * std::mem::size_of::<Reading>()
            + entradas.iter().map(Vec::len).sum::<usize>()
            + std::mem::size_of::<EstadoMixto>();
        let canales = self.valores.canales.clone();
        let bytes = bytes + canales.bytes();
        self.guardados.meter(EstadoMixto { islas, entradas, logica, t_logica: self.t_logica, readings: self.readings.clone(), sondas_digitales, canales, tiempo: self.time(), bytes });
    }

    /// Vuelve al último estado guardado (y lo olvida): devuelve el instante al que volvió, o None si no hay ninguno. Las sondas
    /// (osciloscopio, multímetro) se recortan hasta ese instante. Lo que había sin leer (fusibles fundidos, cambios que se
    /// oyen) se descarta.
    pub fn restaurar_estado(&mut self) -> Option<f64> {
        let e = self.guardados.sacar()?;
        for (isla, g) in self.islas.iter_mut().zip(&e.islas) {
            isla.tr.restaurar(g);
        }
        for (isla, g) in self.islas.iter_mut().zip(&e.entradas) {
            for (entrada, &nivel) in isla.entradas.iter_mut().zip(g) {
                entrada.2 = nivel;
            }
        }
        if let (Some(l), Some(g)) = (self.logica.as_mut(), e.logica.as_ref()) {
            l.restaurar(g);
        }
        for (s, g) in self.sondas_digitales.iter_mut().zip(&e.sondas_digitales) {
            s.sonda.recortar(g);
        }
        self.t_logica = e.t_logica;
        self.readings.clone_from(&e.readings);
        self.valores.canales.clone_from(&e.canales);
        self.valores.listas.clear();
        self.cambiadas.clear();
        self.perdidas = 0;
        Some(e.tiempo)
    }

    /// Olvida los estados guardados (se siguió corriendo sin guardar: ya no hay un avance al que volver).
    pub fn descartar_estados(&mut self) {
        self.guardados.descartar();
    }

    /// Cuántos estados hay guardados y cuántos bytes ocupan.
    pub fn estados_guardados(&self) -> (usize, usize) {
        (self.guardados.estados.len(), self.guardados.bytes)
    }

    /// Cuántos estados se olvidaron por la memoria máxima desde la última pregunta (y lo pone en cero).
    pub fn estados_perdidos_por_memoria(&mut self) -> u64 {
        std::mem::take(&mut self.guardados.perdidos_por_memoria)
    }

    /// Cambia cuántos estados y cuánta memoria se guardan como máximo (las pruebas; los valores por omisión son los de arriba).
    pub fn set_tope_estados(&mut self, cuantos: usize, bytes: usize) {
        self.guardados.max = cuantos.max(1);
        self.guardados.max_bytes = bytes;
        self.guardados.recortar();
    }

    /// Pone el canal `canal` en `valor` a partir de `t` (segundos). Cada isla que lo lee lo aplica en `max(t, su tiempo)`; si `t` ya
    /// pasó para alguna, se cuenta en `tardios`. Rechaza un canal fuera de rango, un valor o un tiempo no finitos y una cola llena.
    /// No descarta los estados guardados.
    pub fn poner_valor(&mut self, canal: usize, t: f64, valor: f64) -> Result<(), EngineError> {
        if canal >= self.valores.canales.total() {
            return Err(EngineError::Invalid(format!("canal {canal} fuera de rango")));
        }
        if !(t.is_finite() && valor.is_finite()) {
            return Err(EngineError::Invalid(format!("canal {canal}: el tiempo y el valor deben ser finitos")));
        }
        let ahora = self.time();
        self.valores.canales.compactar(ahora, 0.0);
        let mut lleno = self.valores.canales.lleno(canal);
        for &i in &self.valores.lectoras[canal] {
            self.islas[i].tr.compactar_canales();
            lleno |= self.islas[i].tr.canal_lleno(canal);
        }
        if lleno {
            return Err(EngineError::Invalid(format!("canal {canal}: la cola de cambios está llena")));
        }
        self.valores.canales.poner(canal, t.max(ahora), valor, ahora)?;
        let mut tardios = 0;
        for &i in &self.valores.lectoras[canal] {
            tardios += u64::from(self.islas[i].tr.poner_valor(canal, t, valor)?);
        }
        if self.valores.lectoras[canal].is_empty() && t < ahora {
            tardios += 1;
        }
        self.valores.tardios += tardios;
        Ok(())
    }

    /// El valor del canal en el tiempo del simulador (NaN si el canal no existe).
    pub fn valor_canal(&self, canal: usize) -> f64 {
        if canal >= self.valores.canales.total() {
            return f64::NAN;
        }
        let ahora = self.time();
        self.valores.canales.valor(canal, ahora, ahora)
    }

    /// Cuántos cambios de canal llegaron con un tiempo anterior al de la isla que los lee, desde que se construyó.
    pub fn tardios(&self) -> u64 {
        self.valores.tardios
    }

    /// Programa una lectura exacta en `t` (segundos). Rechaza un lector fuera de rango, un tiempo no finito y más de
    /// `MAX_MUESTRAS` pendientes. Una `t` que ya pasó para la isla del lector se responde con su lectura vigente y su tiempo.
    pub fn pedir_muestra(&mut self, lector: usize, t: f64) -> Result<(), EngineError> {
        let Some(&(i, l)) = self.valores.lecturas.get(lector) else {
            return Err(EngineError::Invalid(format!("lector {lector} fuera de rango")));
        };
        if !t.is_finite() {
            return Err(EngineError::Invalid(format!("lector {lector}: el tiempo debe ser finito")));
        }
        let pendientes: usize = self.valores.listas.len() + self.valores.con_lectores.iter().map(|&j| self.islas[j].tr.muestras_programadas()).sum::<usize>();
        if pendientes >= MAX_MUESTRAS {
            return Err(EngineError::Invalid(format!("hay {MAX_MUESTRAS} muestras pendientes")));
        }
        self.islas[i].tr.pedir_muestra(l, t)?;
        self.recoger_muestras();
        Ok(())
    }

    /// Pasa a `out` las muestras cumplidas, en orden de tiempo.
    pub fn tomar_muestras(&mut self, out: &mut Vec<Muestra>) {
        self.recoger_muestras();
        self.valores.listas.sort_by(|a, b| a.t.total_cmp(&b.t));
        out.append(&mut self.valores.listas);
    }

    /// El tiempo de la isla del lector y su lectura con el último paso, sin programar nada (NaN si el lector no existe).
    pub fn leer_ahora(&self, lector: usize) -> (f64, f64) {
        match self.valores.lecturas.get(lector) {
            Some(&(i, l)) => (self.islas[i].tr.time(), self.islas[i].tr.leer_ahora(l).unwrap_or(f64::NAN)),
            None => (self.time(), f64::NAN),
        }
    }

    /// Lleva las muestras que tomaron las islas a la lista del simulador, con el número global de su lector.
    fn recoger_muestras(&mut self) {
        if self.valores.con_lectores.is_empty() {
            return;
        }
        let mut tmp = Vec::new();
        for k in 0..self.valores.con_lectores.len() {
            let i = self.valores.con_lectores[k];
            self.islas[i].tr.tomar_muestras(&mut tmp);
            let globales = &self.valores.de_local[i];
            self.valores.listas.extend(tmp.drain(..).map(|m| Muestra { lector: globales[m.lector], t: m.t, v: m.v }));
        }
    }

    /// Hasta dónde puede avanzar la isla `i` sin pasar un evento pendiente que llega a sus puentes de salida. La cabeza de la
    /// cola, si es de una de esas salidas, es el mínimo (aunque esté cancelada, es una cota segura); si no, se recorren.
    fn horizonte(&self, i: usize, t_end: f64) -> f64 {
        let l = self.logica.as_ref().unwrap();
        let hz = &self.horizontes[i];
        let te = match l.cabeza() {
            Some((t, s)) if hz.admite(s) => Some(t),
            _ => l.pendiente_en(&hz.salidas),
        };
        let h = te.map_or(t_end, |t| a_s(t).min(t_end));
        // Un modelo que pidió despertar puede programar una salida que llegue a sus puentes: la isla no pasa de ahí.
        let h = l.proximo_despertar().map_or(h, |t| h.min(a_s(t)));
        // El próximo cambio de un canal que lee la isla, si queda más allá de lo que ya alcanzó.
        let cambio = self.islas[i].tr.proximo_cambio_canal();
        if cambio > self.islas[i].alcanzado() { h.min(cambio) } else { h }
    }

    /// Las lecturas de cada elemento en el orden de la netlist: las de su isla o, de un modelo digital, su segunda lectura
    /// y su estado.
    fn leer(&mut self) {
        self.recoger_muestras();
        for (k, l) in self.lugar.iter().enumerate() {
            self.readings[k] = match *l {
                Lugar::Isla { isla, local } => self.islas[isla].tr.readings()[local],
                Lugar::Logica { modelo } => {
                    let (aux, estado) = self.logica.as_ref().unwrap().lectura(modelo);
                    Reading { i: 0.0, aux, estado }
                }
            };
        }
    }

    /// Hasta dónde está completa la simulación: lo que alcanzaron todas las islas, y no más allá del próximo evento sin
    /// procesar de la lógica. Con los horizontes por isla, una isla que la lógica no toca puede ir muy adelante mientras la
    /// lógica va atrás (un anillo de 1 ps que agota su presupuesto de eventos): el tiempo es el de la lógica.
    pub fn time(&self) -> f64 {
        let islas = if self.islas.is_empty() { self.t_logica } else { self.islas.iter().map(|i| i.tr.time()).fold(f64::INFINITY, f64::min) };
        match self.logica.as_ref().and_then(Digital::siguiente) {
            Some(te) => islas.min(a_s(te)),
            None => islas,
        }
    }

    /// El tiempo de la isla del nodo `k` (las pruebas contra ngspice leen cada columna en el tiempo de su isla).
    pub fn tiempo_de_nodo(&self, k: usize) -> f64 {
        self.nodo.get(k).copied().flatten().map_or(self.time(), |(i, _)| self.islas[i].tr.time())
    }

    pub fn tiempo_de_elemento(&self, k: usize) -> f64 {
        match self.lugar.get(k) {
            Some(Lugar::Isla { isla, .. }) => self.islas[*isla].tr.time(),
            _ => self.time(),
        }
    }

    pub fn islas(&self) -> usize {
        self.islas.len()
    }

    pub fn node_count(&self) -> usize {
        self.nodos
    }

    pub fn voltage(&self, node: usize) -> f64 {
        self.nodo.get(node).copied().flatten().map_or(0.0, |(i, l)| self.islas[i].tr.voltage(l))
    }

    pub fn voltages(&self) -> Vec<f64> {
        (0..self.nodos).map(|k| self.voltage(k)).collect()
    }

    pub fn voltages_into(&self, out: &mut Vec<f64>) {
        out.clear();
        out.extend((0..self.nodos).map(|k| self.voltage(k)));
    }

    pub fn element_count(&self) -> usize {
        self.lugar.len()
    }

    pub fn readings(&self) -> &[Reading] {
        &self.readings
    }

    pub fn currents(&self) -> Vec<f64> {
        self.readings.iter().map(|r| r.i).collect()
    }

    /// Redes digitales de la netlist.
    pub fn digital_count(&self) -> usize {
        self.logica.as_ref().map_or(0, Digital::redes)
    }

    pub fn nivel(&self, red: usize) -> Nivel {
        self.logica.as_ref().map_or(Nivel::Z, |l| l.nivel(red))
    }

    /// Frecuencia (Hz), ciclo de trabajo y número de cambios de la red digital `red` hasta ahora.
    pub fn medida(&self, red: usize) -> (f64, f64, f64) {
        self.logica.as_ref().map_or((0.0, 0.0, 0.0), |l| l.medida(red, a_ps(self.time())))
    }

    /// Los elementos (en el orden de la netlist) de un lazo que no se asentó al arrancar.
    pub fn lazo_de_arranque(&self) -> Vec<usize> {
        self.logica.as_ref().map_or_else(Vec::new, |l| l.lazo_de_arranque().iter().map(|&m| self.global_de_modelo[m]).collect())
    }

    /// Las redes digitales que entraron en conflicto (dos salidas de tres estados, una en 0 y otra en 1) desde la última llamada.
    pub fn tomar_conflictos(&mut self) -> Vec<u32> {
        self.logica.as_mut().map_or_else(Vec::new, |l| l.tomar_conflictos())
    }

    /// El invariante de la lógica (`Digital::comprobar`), para las pruebas de robustez.
    pub fn comprobar_logica(&mut self) -> Result<(), String> {
        self.logica.as_mut().map_or(Ok(()), Digital::comprobar)
    }

    pub fn set_event_budget(&mut self, n: u64) {
        self.presupuesto_eventos = n.max(1);
    }

    /// Guarda cada cambio de nivel de las redes digitales (las pruebas contra ngspice).
    pub fn registrar_cambios(&mut self, si: bool) {
        if let Some(l) = self.logica.as_mut() {
            l.registrar(si);
        }
    }

    /// Los cambios guardados desde la última llamada: instante (s), red y nivel.
    pub fn tomar_cambios(&mut self) -> Vec<(f64, usize, Nivel)> {
        self.logica.as_mut().map_or_else(Vec::new, |l| l.tomar_registro().into_iter().map(|(t, r, n)| (a_s(t), r as usize, n)).collect())
    }

    /// Cambia en caliente un elemento, en su isla. Un estado lógico se aplica en `time()` o, si alguna isla a la que llega su salida va más adelante, en el tiempo de la más adelantada de esas, porque un evento no puede caer antes del tiempo de una isla.
    pub fn set_element(&mut self, index: usize, e: Element) -> Result<(), EngineError> {
        self.guardados.descartar();
        match self.lugar.get(index).copied() {
            None => Err(EngineError::Invalid(format!("elemento {index}: fuera de rango"))),
            Some(Lugar::Logica { modelo }) => {
                let Element::Logic { value, .. } = e else {
                    return Err(EngineError::Invalid(format!("elemento {index}: de la lógica solo se cambia en caliente un estado lógico")));
                };
                if value > 1 {
                    return Err(EngineError::Invalid(format!("elemento {index}: value debe ser 0 o 1")));
                }
                let s = self.logica.as_ref().unwrap().salida_de_modelo(modelo) as usize;
                let t = self
                    .islas
                    .iter()
                    .zip(&self.horizontes)
                    .filter(|(_, hz)| hz.admite(s as u32))
                    .map(|(i, _)| i.tr.time())
                    .fold(self.time(), f64::max);
                let n = if value == 1 { Nivel::Uno } else { Nivel::Cero };
                if !self.logica.as_mut().unwrap().fijar(modelo, a_ps_arriba(t), n) {
                    return Err(EngineError::Invalid(format!("elemento {index}: de la lógica solo se cambia en caliente un estado lógico")));
                }
                Ok(())
            }
            Some(Lugar::Isla { isla, local }) => {
                let fuera = std::cell::Cell::new(false);
                let local_e = e.con_nodos(|n| match self.nodo.get(n).copied().flatten() {
                    _ if n == 0 => 0,
                    Some((i, l)) if i == isla => l,
                    _ => {
                        fuera.set(true);
                        0
                    }
                });
                if fuera.get() {
                    return Err(EngineError::Invalid(format!("elemento {index}: solo se cambian en caliente resistencias y fuentes, con los mismos nodos")));
                }
                let r = self.islas[isla].tr.set_element(local, local_e);
                r.map_err(|err| a_global_de(&self.islas[isla].globales, err))
            }
        }
    }

    pub fn set_resistance(&mut self, index: usize, ohms: f64) -> Result<(), EngineError> {
        self.guardados.descartar();
        match self.lugar.get(index).copied() {
            Some(Lugar::Isla { isla, local }) => {
                let r = self.islas[isla].tr.set_resistance(local, ohms);
                r.map_err(|e| a_global_de(&self.islas[isla].globales, e))
            }
            Some(_) => Err(EngineError::Invalid(format!("elemento {index}: no es una resistencia"))),
            None => Err(EngineError::Invalid(format!("elemento {index}: fuera de rango"))),
        }
    }

    /// Cambia el paso máximo de todas las islas, o de ninguna: primero se revisa cada una.
    pub fn set_max_step(&mut self, h: f64) -> Result<(), EngineError> {
        self.guardados.descartar();
        for isla in self.islas.iter() {
            isla.tr.comprobar_paso(h).map_err(|e| a_global_de(&isla.globales, e))?;
        }
        for isla in self.islas.iter_mut() {
            isla.tr.set_max_step(h).map_err(|e| a_global_de(&isla.globales, e))?;
        }
        Ok(())
    }

    pub fn reset_element(&mut self, index: usize) -> Result<(), EngineError> {
        self.guardados.descartar();
        match self.lugar.get(index).copied() {
            Some(Lugar::Isla { isla, local }) => {
                let r = self.islas[isla].tr.reset_element(local);
                r.map_err(|e| a_global_de(&self.islas[isla].globales, e))
            }
            Some(_) => Err(EngineError::Invalid(format!("elemento {index}: no se puede reponer"))),
            None => Err(EngineError::Invalid(format!("elemento {index}: fuera de rango"))),
        }
    }

    /// Los fusibles que se fundieron desde la última llamada, con su elemento en el orden de la netlist.
    pub fn take_events(&mut self) -> Vec<Event> {
        let mut todos = Vec::new();
        for isla in self.islas.iter_mut() {
            for mut e in isla.tr.take_events() {
                e.element = isla.globales[e.element];
                todos.push(e);
            }
        }
        todos
    }

    pub fn set_tolerances(&mut self, tol: Tol) {
        for isla in self.islas.iter_mut() {
            isla.tr.set_tolerances(tol);
        }
    }

    pub fn set_iteration_budget(&mut self, n: usize) {
        self.presupuesto_iter = n;
        for isla in self.islas.iter_mut() {
            isla.tr.set_iteration_budget(n);
        }
    }

    pub fn set_max_iter(&mut self, n: usize) {
        for isla in self.islas.iter_mut() {
            isla.tr.set_max_iter(n);
        }
    }

    /// Iteraciones perdidas de todas las islas en la última llamada a `advance_to`.
    pub fn lost_iterations(&self) -> usize {
        self.perdidas
    }
}

impl Historial {
    fn descartar(&mut self) {
        self.estados.clear();
        self.bytes = 0;
    }

    fn meter(&mut self, e: EstadoMixto) {
        self.bytes += e.bytes;
        self.estados.push_back(e);
        self.recortar();
    }

    fn recortar(&mut self) {
        while self.estados.len() > self.max {
            self.olvidar_el_mas_viejo();
        }
        // Siempre queda el último aunque solo él pase de la memoria máxima.
        while self.bytes > self.max_bytes && self.estados.len() > 1 {
            self.olvidar_el_mas_viejo();
            self.perdidos_por_memoria += 1;
        }
    }

    fn olvidar_el_mas_viejo(&mut self) {
        if let Some(v) = self.estados.pop_front() {
            self.bytes -= v.bytes;
        }
    }

    fn sacar(&mut self) -> Option<EstadoMixto> {
        let e = self.estados.pop_back()?;
        self.bytes -= e.bytes;
        Some(e)
    }
}

/// Un error de una isla con sus elementos numerados como en la netlist completa: el mensaje de la interfaz nombra la pieza.
/// Reparte los lectores entre las islas: la lista de cada una (con nodos y elementos numerados como en la isla), la isla y el
/// número local de cada lector y el lector global de cada número local.
#[allow(clippy::type_complexity)]
fn repartir_lectores(net: &Netlist, nodo: &[Option<(usize, usize)>], lugar: &[Option<Lugar>], islas: usize) -> Result<(Vec<Vec<LectorDef>>, Vec<(usize, usize)>, Vec<Vec<usize>>), EngineError> {
    let mut por_isla: Vec<Vec<LectorDef>> = vec![Vec::new(); islas];
    let mut de_local: Vec<Vec<usize>> = vec![Vec::new(); islas];
    let mut lecturas = Vec::with_capacity(net.lectores.len());
    for (k, d) in net.lectores.iter().enumerate() {
        let (isla, local) = match *d {
            LectorDef::V { p, n } => {
                let sitio = |x: usize| if x == 0 { Ok(None) } else { nodo[x].map(Some).ok_or_else(|| EngineError::Invalid(format!("lector {k}: el nodo {x} no tiene elementos analógicos"))) };
                let (sp, sn) = (sitio(p)?, sitio(n)?);
                let isla = match (sp, sn) {
                    (Some((a, _)), Some((b, _))) if a != b => return Err(EngineError::Invalid(format!("lector {k}: los nodos {p} y {n} están en islas distintas"))),
                    (Some((a, _)), _) | (_, Some((a, _))) => a,
                    (None, None) => return Err(EngineError::Invalid(format!("lector {k}: ambos nodos son la tierra"))),
                };
                (isla, LectorDef::V { p: sp.map_or(0, |s| s.1), n: sn.map_or(0, |s| s.1) })
            }
            LectorDef::I { elemento } => match lugar[elemento] {
                Some(Lugar::Isla { isla, local }) => (isla, LectorDef::I { elemento: local }),
                _ => return Err(EngineError::Invalid(format!("lector {k}: el elemento {elemento} no es analógico"))),
            },
        };
        lecturas.push((isla, por_isla[isla].len()));
        por_isla[isla].push(local);
        de_local[isla].push(k);
    }
    Ok((por_isla, lecturas, de_local))
}

fn a_global_de(globales: &[usize], e: EngineError) -> EngineError {
    let g = |k: Option<usize>| k.map(|k| globales.get(k).copied().unwrap_or(k));
    match e {
        EngineError::Singular { element } => EngineError::Singular { element: g(element) },
        EngineError::DiodoSinLimite { element } => EngineError::DiodoSinLimite { element: g(element) },
        EngineError::Presupuesto { t, element } => EngineError::Presupuesto { t, element: g(element) },
        EngineError::NoConvergence { t, element } => EngineError::NoConvergence { t, element: g(element) },
        EngineError::Invalid(m) => match m.strip_prefix("elemento ").and_then(|r| r.split_once(':')) {
            Some((k, resto)) if k.parse::<usize>().is_ok() => {
                EngineError::Invalid(format!("elemento {}:{resto}", g(k.parse().ok()).unwrap()))
            }
            _ => EngineError::Invalid(m),
        },
        otro => otro,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mixto(json: &str, h: f64) -> Mixto {
        Mixto::new(Netlist::from_json(json).unwrap(), h).unwrap()
    }

    #[test]
    fn sin_logica_es_el_motor_de_la_2a() {
        let json = include_str!("../fixtures/rectificador.json");
        let mut m = mixto(json, 5e-6);
        let mut t = Transient::new(Netlist::from_json(json).unwrap(), 5e-6).unwrap();
        m.advance_to(0.05, u32::MAX).unwrap();
        t.advance_to(0.05, u32::MAX).unwrap();
        assert_eq!(m.islas(), 1);
        assert_eq!(m.voltages(), t.voltages());
        assert_eq!(m.currents(), t.currents());
    }

    /// Fuente cuadrada de 1 MHz, puente de entrada 74HC, inversor de 5 ns y puente de salida con 55 Ω sobre 10 kΩ.
    const INVERSOR: &str = r#"{"nodes":3,"digital_nets":2,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":1e6}},
        {"type":"ADC","p":1,"n":0,"out":0,"in_low":1.5,"in_high":3.5},
        {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":5e-9,"fall_delay":5e-9},
        {"type":"DAC","input":1,"out":2,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":6.666666666666667e-9,"t_fall":6.666666666666667e-9},
        {"type":"R","a":2,"b":0,"ohms":10000}]}"#;

    #[test]
    fn la_fuente_y_la_carga_quedan_en_islas_distintas_y_el_inversor_sigue_al_reloj() {
        let mut m = mixto(INVERSOR, 1e-9);
        assert_eq!(m.islas(), 2);
        // En t = 0 la entrada está en 0 V y la salida ya está en alto (el primer paso la encuentra en 5 V, sin rampa, como
        // dac_bridge).
        assert_eq!(m.nivel(1), Nivel::Uno);
        m.registrar_cambios(true);
        m.advance_to(2e-6, u32::MAX).unwrap();
        let salida: Vec<(f64, Nivel)> = m.tomar_cambios().into_iter().filter(|c| c.1 == 1).map(|c| (c.0, c.2)).collect();
        // La entrada cruza 3.5 V con el primer flanco (en t = 0) y 1.5 V en 0.5 µs: la salida cambia 5 ns después.
        assert_eq!(salida.len(), 4, "{salida:?}");
        assert!(salida[0].0 < 5.2e-9 && salida[0].1 == Nivel::Cero);
        assert!((salida[1].0 - 505e-9).abs() < 2e-10 && salida[1].1 == Nivel::Uno);
        assert!((m.voltage(2) - 5.0 * 10000.0 / 10055.0).abs() < 1e-6, "v = {}", m.voltage(2));
        assert_eq!(m.readings()[2].estado, 1.0);
    }

    #[test]
    fn un_circuito_solo_digital_avanza_sin_islas() {
        let mut m = mixto(r#"{"nodes":1,"digital_nets":2,"elements":[
            {"type":"LOGIC","out":0,"value":0},
            {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":1e-9,"fall_delay":1e-9}]}"#, 1e-6);
        assert_eq!(m.islas(), 0);
        assert_eq!(m.nivel(1), Nivel::Uno);
        m.advance_to(1e-3, u32::MAX).unwrap();
        assert_eq!(m.time(), 1e-3);
        // Conmutar el estado lógico en caliente: la compuerta responde 1 ns después.
        m.set_element(0, Element::Logic { out: 0, value: 1 }).unwrap();
        m.advance_to(1e-3 + 2e-9, u32::MAX).unwrap();
        assert_eq!(m.nivel(1), Nivel::Cero);
        assert!(m.set_element(1, Element::Logic { out: 1, value: 1 }).is_err());
    }

    #[test]
    fn un_anillo_que_oscila_respeta_el_presupuesto_de_eventos() {
        let mut m = mixto(r#"{"nodes":1,"digital_nets":3,"elements":[
            {"type":"GATE","fn":"not","inputs":[2],"output":0,"rise_delay":5e-9,"fall_delay":5e-9},
            {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":5e-9,"fall_delay":5e-9},
            {"type":"GATE","fn":"not","inputs":[1],"output":2,"rise_delay":5e-9,"fall_delay":5e-9}]}"#, 1e-6);
        assert!(!m.lazo_de_arranque().is_empty());
        m.set_event_budget(1000);
        m.advance_to(1.0, u32::MAX).unwrap();
        // Con 1,000 eventos por llamada no llega a 1 s: devuelve el control a los pocos microsegundos simulados.
        assert!(m.time() < 1e-4, "t = {}", m.time());
        let (f, ciclo, _) = m.medida(0);
        assert!((f - 1.0 / 30e-9).abs() / f < 1e-6 && (ciclo - 0.5).abs() < 1e-6, "f = {f}, ciclo = {ciclo}");
    }

    #[test]
    fn una_isla_sin_dinamica_salta_entre_eventos() {
        // Una cuadrada de 1 kHz maneja un inversor cuya salida enciende un LED: la isla del LED solo da pasos en las rampas.
        let mut m = mixto(r#"{"nodes":4,"digital_nets":2,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":1000}},
            {"type":"ADC","p":1,"n":0,"out":0,"in_low":1.5,"in_high":3.5},
            {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":5e-9,"fall_delay":5e-9},
            {"type":"DAC","input":1,"out":2,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":7e-9,"t_fall":7e-9},
            {"type":"R","a":2,"b":3,"ohms":330},
            {"type":"D","a":3,"b":0,"is":1.5e-17,"n":2}]}"#, 1e-5);
        m.advance_to(0.01, u32::MAX).unwrap();
        let pasos_led = m.islas[1].tr.steps();
        // Veinte flancos en 10 ms: unos pocos pasos por rampa, no los mil de 10 µs que daría sin saltar.
        assert!(pasos_led < 400, "{pasos_led} pasos en la isla del LED");
        assert!((m.voltage(3) - 1.69).abs() < 0.1, "LED en {}", m.voltage(3));
    }

    #[test]
    fn un_estado_logico_se_conmuta_en_el_tiempo_de_la_simulacion_y_no_en_el_de_una_isla_adelantada() {
        // Un anillo de 1 ps deja a la lógica atrás mientras el RC, que la lógica no toca, llega a la meta. El estado lógico se
        // conmuta en `time()` (lo que ya está completo), no en el tiempo del RC.
        let mut m = mixto(r#"{"nodes":3,"digital_nets":5,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"sine","offset":0,"amp":5,"freq":1000}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"C","a":2,"b":0,"farads":1e-6},
            {"type":"GATE","fn":"not","inputs":[2],"output":0,"rise_delay":1e-12,"fall_delay":1e-12},
            {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":1e-12,"fall_delay":1e-12},
            {"type":"GATE","fn":"not","inputs":[1],"output":2,"rise_delay":1e-12,"fall_delay":1e-12},
            {"type":"LOGIC","out":3,"value":0},
            {"type":"GATE","fn":"not","inputs":[3],"output":4,"rise_delay":1e-9,"fall_delay":1e-9}]}"#, 1e-5);
        m.set_event_budget(10_000);
        m.advance_to(1e-3, u32::MAX).unwrap();
        let ahora = m.time();
        assert!(ahora < 1e-6, "t = {ahora}");
        m.set_element(6, Element::Logic { out: 3, value: 1 }).unwrap();
        m.registrar_cambios(true);
        // Unas pocas llamadas bastan si el cambio quedó en `ahora`; si quedó en el tiempo del RC (1 ms), el anillo de 1 ps
        // tardaría mil millones de eventos en llegar.
        for _ in 0..20 {
            if m.nivel(4) == Nivel::Cero {
                break;
            }
            m.advance_to(1e-3, u32::MAX).unwrap();
        }
        let baja = m.tomar_cambios().into_iter().find(|c| c.1 == 4).map(|c| c.0);
        let baja = baja.unwrap_or_else(|| panic!("la salida no bajó en 20 llamadas (conmutado en {ahora:.6e}, t = {:.6e})", m.time()));
        assert!((baja - ahora - 1e-9).abs() < 1e-11, "la salida bajó en {baja:.6e} y se conmutó en {ahora:.6e}");
    }

    /// La fuente y luego `n` islas en cadena: cada una, un puente de salida sobre una resistencia y un puente de entrada que, por un
    /// inversor, maneja la siguiente. Cada isla influye en todas las que siguen. Devuelve lo que tarda en armarse y cuántas islas hay.
    fn armar_cadena(n: usize) -> (std::time::Duration, usize) {
        let mut el = vec![
            r#"{"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":1000}}"#.to_string(),
            r#"{"type":"ADC","p":1,"n":0,"out":0,"in_low":1.5,"in_high":3.5}"#.to_string(),
        ];
        for k in 0..n {
            let nodo = k + 2;
            el.push(format!(r#"{{"type":"GATE","fn":"not","inputs":[{}],"output":{},"rise_delay":1e-9,"fall_delay":1e-9}}"#, 2 * k, 2 * k + 1));
            el.push(format!(r#"{{"type":"DAC","input":{},"out":{nodo},"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":1e-9,"t_fall":1e-9}}"#, 2 * k + 1));
            el.push(format!(r#"{{"type":"R","a":{nodo},"b":0,"ohms":1000}}"#));
            el.push(format!(r#"{{"type":"ADC","p":{nodo},"n":0,"out":{},"in_low":1.5,"in_high":3.5}}"#, 2 * k + 2));
        }
        let json = format!(r#"{{"nodes":{},"digital_nets":{},"elements":[{}]}}"#, n + 2, 2 * n + 1, el.join(","));
        let t0 = std::time::Instant::now();
        let m = mixto(&json, 1e-5);
        (t0.elapsed(), m.islas())
    }

    #[test]
    fn mil_islas_en_cadena_se_ordenan_sin_costo_cubico() {
        // El tiempo absoluto depende de la máquina y del perfil, así que el
        // criterio que vale en todos lados es el crecimiento: al duplicar las islas el tiempo no puede multiplicarse por más de
        // 3 (lineal da 2, cuadrático tiende a 4 y cúbico a 8). Se toma el mínimo de varias armadas para no medir ruido.
        let mejor = |n: usize| (0..5).map(|_| armar_cadena(n).0).min().unwrap();
        let n = 1000;
        let (_, islas) = armar_cadena(n);
        assert_eq!(islas, n + 1);
        let (t1, t2) = (mejor(n), mejor(2 * n));
        let razon = t2.as_secs_f64() / t1.as_secs_f64();
        println!("mil islas en cadena: {n} islas en {t1:?}, {} en {t2:?}, razón {razon:.2}", 2 * n);
        assert!(razon < 3.0, "al duplicar las islas el tiempo se multiplicó por {razon:.2} ({t1:?} a {t2:?})");
        // El límite absoluto (el de antes) solo vale en release, donde el tiempo no lo domina el perfil de depuración.
        #[cfg(not(debug_assertions))]
        assert!(t1 < std::time::Duration::from_millis(100), "armarlas tardó {t1:?}");
    }

    #[test]
    fn el_presupuesto_de_iteraciones_acota_la_llamada_entera() {
        // Una cuadrada de 10 kHz enciende un LED por un inversor: cada flanco es un tramo de `advance_hasta_cruce`. Con dos
        // iteraciones de Newton por intento casi todo paso del LED falla, y el presupuesto de 200 iteraciones perdidas vale
        // para toda la llamada, no para cada tramo.
        let mut m = mixto(r#"{"nodes":4,"digital_nets":2,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":10000}},
            {"type":"ADC","p":1,"n":0,"out":0,"in_low":1.5,"in_high":3.5},
            {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":5e-9,"fall_delay":5e-9},
            {"type":"DAC","input":1,"out":2,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":7e-9,"t_fall":7e-9},
            {"type":"R","a":2,"b":3,"ohms":330},
            {"type":"C","a":3,"b":0,"farads":1e-9},
            {"type":"D","a":3,"b":0,"is":1.5e-17,"n":2}]}"#, 1e-6);
        m.set_max_iter(2);
        m.set_iteration_budget(200);
        let r = m.advance_to(0.01, u32::MAX);
        let perdidas = m.lost_iterations();
        println!("presupuesto 200: {perdidas} iteraciones perdidas, {:?}", r.as_ref().err());
        // Como en `Transient`, cuenta también la iteración que toca el tope.
        assert!(perdidas <= 201, "{perdidas} iteraciones perdidas con un presupuesto de 200");
        assert!(matches!(r, Err(EngineError::Presupuesto { .. })), "{r:?}");
    }

    /// Pasos de la isla del RC en 1 ms, con o sin un anillo de inversores de 5 ns que no la toca.
    fn pasos_del_rc(con_anillo: bool) -> u64 {
        let rc = r#"{"type":"V","a":1,"b":0,"wave":{"kind":"sine","offset":0,"amp":5,"freq":1000}},{"type":"R","a":1,"b":2,"ohms":1000},{"type":"C","a":2,"b":0,"farads":1e-6}"#;
        let anillo = if con_anillo {
            r#",{"type":"GATE","fn":"not","inputs":[2],"output":0,"rise_delay":5e-9,"fall_delay":5e-9},
            {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":5e-9,"fall_delay":5e-9},
            {"type":"GATE","fn":"not","inputs":[1],"output":2,"rise_delay":5e-9,"fall_delay":5e-9}"#
        } else {
            ""
        };
        let mut m = mixto(&format!(r#"{{"nodes":3,"digital_nets":3,"elements":[{rc}{anillo}]}}"#), 1e-5);
        while m.time() < 1e-3 {
            m.advance_to(1e-3, u32::MAX).unwrap();
        }
        m.islas[0].tr.steps()
    }

    #[test]
    fn un_anillo_que_no_llega_a_una_isla_no_le_impone_su_ritmo() {
        // El anillo produce un evento cada 5 ns, pero ninguna red suya llega a un puente de salida del RC: la isla avanza con
        // su propio paso y no se detiene en cada evento.
        let (solo, con) = (pasos_del_rc(false), pasos_del_rc(true));
        println!("pasos del RC en 1 ms: {solo} sin el anillo y {con} con él");
        assert!(con <= solo + 2, "el RC dio {con} pasos con el anillo y {solo} sin él");
    }

    /// Dos islas: la de la fuente (un RC con el puente de entrada) y la de la carga, cuyo puente de salida lee la red del
    /// puente de entrada sin compuertas en medio.
    const PUENTE_DIRECTO: &str = r#"{"nodes":5,"digital_nets":1,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
        {"type":"R","a":1,"b":2,"ohms":1000},
        {"type":"C","a":2,"b":0,"farads":1e-9},
        {"type":"ADC","p":2,"n":0,"out":0,"in_low":2.5,"in_high":2.5},
        {"type":"DAC","input":0,"out":3,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":1e-9,"t_fall":1e-9},
        {"type":"R","a":3,"b":4,"ohms":1000},
        {"type":"C","a":4,"b":0,"farads":1e-12}]}"#;

    #[test]
    fn una_isla_se_detiene_en_el_evento_que_llega_a_su_puente_de_salida() {
        // La rampa del puente de salida empieza en el cruce y no al final del paso de la otra isla: a 0.5 ns del cruce va a
        // la mitad.
        let mut m = mixto(PUENTE_DIRECTO, 1e-8);
        assert_eq!(m.islas(), 2);
        m.registrar_cambios(true);
        m.advance_to(2e-6, u32::MAX).unwrap();
        let cruce = m.tomar_cambios()[0].0;
        let mut m = mixto(PUENTE_DIRECTO, 1e-8);
        m.advance_to(cruce + 0.5e-9, u32::MAX).unwrap();
        assert!((m.readings()[4].aux - 0.5).abs() < 0.01, "control {} a 0.5 ns del cruce", m.readings()[4].aux);
    }

    #[test]
    fn el_evento_de_un_cruce_lleva_el_instante_del_cruce_y_no_el_del_final_del_paso() {
        // RC de 1 µs hacia 5 V con un puente de umbral 2.5 V: cruza en RC ln 2. El inversor de 5 ns cambia 5 ns después del
        // cruce, no del final del paso localizado (que queda hasta TOLERANCIA_CRUCE después). Con pasos de 0.1 ns la
        // interpolación lineal dentro del paso es exacta al picosegundo.
        let mut m = mixto(r#"{"nodes":3,"digital_nets":2,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"C","a":2,"b":0,"farads":1e-9},
            {"type":"ADC","p":2,"n":0,"out":0,"in_low":2.5,"in_high":2.5},
            {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":5e-9,"fall_delay":5e-9}]}"#, 1e-10);
        m.set_tolerances(Tol { reltol: 1e-6, ..Tol::default() });
        m.registrar_cambios(true);
        m.advance_to(0.8e-6, u32::MAX).unwrap();
        let c = m.tomar_cambios();
        let cruce = c.iter().find(|c| c.1 == 0).unwrap().0;
        let salida = c.iter().find(|c| c.1 == 1).unwrap().0;
        let exacto = 1e-6 * 2f64.ln();
        assert!((cruce - exacto).abs() < 3e-12, "cruce en {cruce:.6e}, exacto {exacto:.6e} ({:.1} ps)", (cruce - exacto) * 1e12);
        assert!((salida - cruce - 5e-9).abs() < 1.5e-12, "salida {salida:.6e}");
    }

    #[test]
    fn los_errores_de_una_isla_nombran_el_elemento_de_la_netlist() {
        let e = a_global_de(&[4, 7], EngineError::Invalid("elemento 1: el valor debe ser positivo".into()));
        assert_eq!(e, EngineError::Invalid("elemento 7: el valor debe ser positivo".into()));
        assert_eq!(a_global_de(&[4, 7], EngineError::Singular { element: Some(0) }), EngineError::Singular { element: Some(4) });
    }
}
