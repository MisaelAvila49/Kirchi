//! Kirchi contra ngspice. Cada caso de `engine/referencias/` tiene su `.cir`, su `.csv` de ngspice (`node scripts/referencias-ngspice.mjs`) y la misma netlist para el motor (`.json`). Las pruebas no necesitan ngspice.
//! Punto de operación: 1 % por cifra. Transitorio: punto a punto con 1 % del valor (mínimo 1 % del pico más 1 µV o 1 nA) y, donde falla, ventana de tiempo `tolerancia_t` (flancos, arranque, saturación). Cada caso corre con LU densa y dispersa. Ambos programas usan las tolerancias del `.options` de cada `.cir` (reltol 1e-4).
//! `opamp_comparador`, `fuente_cv_cc`, `xfmr_elevador` y las conmutaciones de los optoacopladores tienen la referencia convergida (reltol 1e-6, paso máximo 0.05 a 2 µs): con reltol 1e-4 el instante de los flancos depende de la tolerancia de cada programa. Los casos digitales llevan `xtrtol=7` para usar el mismo `trtol`, comparan secuencias de niveles contra `<caso>.eventos.csv` y descartan niveles más breves que `tolerancia_t`.

use std::collections::BTreeMap;
use std::path::PathBuf;

use kirchi_engine::devices::Tol;
use kirchi_engine::digital::Nivel;
use kirchi_engine::transient::SolverKind;
use kirchi_engine::{Mixto, Netlist};

/// Las opciones de los `.cir`: `.options reltol=1e-4 abstol=1e-12 vntol=1e-7`.
const TOLERANCIAS: Tol = Tol { reltol: 1e-4, abstol: 1e-12, vntol: 1e-7, chgtol: 1e-14, trtol: 7.0 };
use serde::Deserialize;

#[derive(Deserialize)]
struct Caso {
    netlist: Netlist,
    /// Tiempo simulado: el del transitorio o el que se deja asentar un punto de operación.
    fin: f64,
    hmax: f64,
    #[serde(default)]
    tolerancia_t: f64,
    columnas: BTreeMap<String, Columna>,
    /// Columna de `<caso>.eventos.csv` → red digital del motor.
    #[serde(default)]
    eventos: BTreeMap<String, usize>,
    /// Cambios en caliente: en el instante `t` el elemento `element` pasa a ser `nuevo`.
    #[serde(default)]
    cambios: Vec<Cambio>,
    /// Valores de los canales de las perillas en vivo, puestos de antemano (con canales de forma rampa, los puntos de un pwl).
    #[serde(default)]
    valores: Vec<ValorCanal>,
}

#[derive(Deserialize)]
struct ValorCanal {
    t: f64,
    canal: usize,
    valor: f64,
}

#[derive(Deserialize, Clone)]
struct Cambio {
    t: f64,
    element: usize,
    nuevo: kirchi_engine::Element,
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
enum Columna {
    Nodo(usize),
    Corriente(usize),
    Aux(usize),
    /// El `estado` del elemento (el ángulo del eje de un motor a pasos).
    Estado(usize),
    /// La corriente que entra al elemento `[elemento, casilla]` por uno de sus terminales (`Mixto::corrientes_de`).
    Terminal([usize; 2]),
}

impl Columna {
    /// El piso de la tolerancia: 1 nA en una corriente y 1 µV en un voltaje.
    fn piso(self) -> f64 {
        match self {
            Columna::Nodo(_) | Columna::Aux(_) | Columna::Estado(_) => 1e-6,
            Columna::Corriente(_) | Columna::Terminal(_) => 1e-9,
        }
    }
}

fn carpeta() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("referencias")
}

fn leer_csv(caso: &str) -> (Vec<String>, Vec<Vec<f64>>) {
    let texto = std::fs::read_to_string(carpeta().join(format!("{caso}.csv"))).unwrap();
    let mut renglones = texto.lines();
    let columnas = renglones.next().unwrap().split(',').map(String::from).collect();
    let filas = renglones.filter(|r| !r.is_empty()).map(|r| r.split(',').map(|v| v.parse().unwrap()).collect()).collect();
    (columnas, filas)
}

/// `<caso>.eventos.csv`: el instante y el nivel de cada red (0, 1, X o Z) en cada renglón.
fn leer_eventos(caso: &str) -> (Vec<String>, Vec<(f64, Vec<char>)>) {
    let texto = std::fs::read_to_string(carpeta().join(format!("{caso}.eventos.csv"))).unwrap();
    let mut renglones = texto.lines();
    let columnas = renglones.next().unwrap().split(',').skip(1).map(String::from).collect();
    let filas = renglones
        .filter(|r| !r.is_empty())
        .map(|r| {
            let mut v = r.split(',');
            let t = v.next().unwrap().parse().unwrap();
            (t, v.map(|x| x.chars().next().unwrap()).collect())
        })
        .collect();
    (columnas, filas)
}

fn letra(n: Nivel) -> char {
    match n {
        Nivel::Cero => '0',
        Nivel::Uno => '1',
        Nivel::X => 'X',
        Nivel::Z => 'Z',
    }
}

/// Una secuencia de niveles sin los que duran menos que `tol` y sin repetidos seguidos.
fn sin_pulsos(s: &[(f64, char)], tol: f64) -> Vec<(f64, char)> {
    let mut r: Vec<(f64, char)> = Vec::new();
    for (k, &(t, v)) in s.iter().enumerate() {
        let dura = s.get(k + 1).map_or(f64::INFINITY, |n| n.0 - t);
        if dura < tol || r.last().is_some_and(|u| u.1 == v) {
            continue;
        }
        r.push((t, v));
    }
    r
}

fn medir(tr: &Mixto, c: Columna) -> f64 {
    match c {
        Columna::Nodo(k) => tr.voltage(k),
        Columna::Corriente(k) => tr.readings()[k].i,
        Columna::Aux(k) => tr.readings()[k].aux,
        Columna::Estado(k) => tr.readings()[k].estado,
        Columna::Terminal([k, j]) => {
            let mut buf = [0.0; kirchi_engine::devices::CASILLAS_MAX];
            assert!(tr.corrientes_de(k, &mut buf), "elemento {k}: no tiene corrientes por terminal");
            buf[j]
        }
    }
}

/// El tiempo de la isla que da la columna.
fn tiempo(tr: &Mixto, c: Columna) -> f64 {
    match c {
        Columna::Nodo(k) => tr.tiempo_de_nodo(k),
        Columna::Corriente(k) | Columna::Aux(k) | Columna::Estado(k) | Columna::Terminal([k, _]) => tr.tiempo_de_elemento(k),
    }
}

/// Peor error de cada columna como fracción de su tolerancia (1.0 es el límite) con la ventana de tiempo, el instante en que
/// ocurre y el peor error sin la ventana (punto a punto, sin excusar desfases). Una red digital da 0 si su secuencia coincide
/// y 2 si no, con el instante de la primera diferencia.
fn comparar(caso: &str, solver: SolverKind) -> BTreeMap<String, (f64, f64, f64)> {
    let c: Caso = serde_json::from_str(&std::fs::read_to_string(carpeta().join(format!("{caso}.json"))).unwrap()).unwrap();
    let (nombres, filas) = leer_csv(caso);
    // Una columna del caso que el CSV no trae no se compararía sin avisar (el CSV se regenera con el guion).
    for n in c.columnas.keys() {
        assert!(nombres.contains(n), "{caso}: la columna {n} no está en el CSV; se regenera con node scripts/referencias-ngspice.mjs");
    }
    let mut tr = Mixto::with_solver(c.netlist, c.hmax, solver).unwrap();
    tr.set_tolerances(TOLERANCIAS);
    tr.registrar_cambios(true);
    for v in &c.valores {
        tr.poner_valor(v.canal, v.t, v.valor).unwrap();
    }
    let iniciales: BTreeMap<String, char> = c.eventos.iter().map(|(n, &r)| (n.clone(), letra(tr.nivel(r)))).collect();
    let mut peor = BTreeMap::new();
    if nombres[0] != "t" {
        // Punto de operación: se deja asentar y se compara el final.
        tr.advance_to(c.fin, u32::MAX).unwrap();
        for (j, nombre) in nombres.iter().enumerate() {
            let Some(&col) = c.columnas.get(nombre) else { continue };
            let r = filas[0][j];
            let k = medir(&tr, col);
            let e = (k - r).abs() / (0.01 * r.abs() + col.piso());
            peor.insert(nombre.clone(), (e, c.fin, e));
        }
        return peor;
    }
    // Transitorio: la trayectoria de cada columna en cada paso de su isla. Una columna del CSV sin equivalente en `columnas`
    // no se compara (por ejemplo, el calentamiento de un fusible después de fundirse).
    let cols: Vec<Option<Columna>> = nombres[1..].iter().map(|n| c.columnas.get(n).copied()).collect();
    let mut series: Vec<(Vec<f64>, Vec<f64>)> = cols.iter().map(|_| (vec![0.0], vec![0.0])).collect();
    correr(&mut tr, &c.cambios, c.fin, c.hmax, caso, |tr| {
        for (j, col) in cols.iter().enumerate() {
            let Some(col) = *col else { continue };
            let t = tiempo(tr, col);
            let (ts, vs) = &mut series[j];
            if t > *ts.last().unwrap() {
                ts.push(t);
                vs.push(medir(tr, col));
            }
        }
    });
    for (j, nombre) in nombres[1..].iter().enumerate() {
        if !c.columnas.contains_key(nombre) {
            continue;
        }
        let (ts, vs) = &series[j];
        let pico = filas.iter().map(|f| f[j + 1].abs()).fold(0.0, f64::max);
        let mut max = (0.0f64, 0.0);
        let mut cruda = 0.0f64;
        for f in &filas {
            let (t, r) = (f[0], f[j + 1]);
            let tol = 0.01 * r.abs().max(0.01 * pico) + c.columnas[nombre].piso();
            let k = interpolar(ts, vs, t);
            let mut e = (k - r).abs() / tol;
            cruda = cruda.max(e);
            // La ventana se limita sola: el valor de ngspice tiene que caer dentro de lo que el motor recorrió en
            // ±tolerancia_t, así que en un tramo donde el motor es plano no excusa nada. No se limitó a los flancos de
            // las fuentes: las saturaciones, el relé y el MOSFET tienen eventos que no lo son y se desfasan igual.
            if e > 1.0 && c.tolerancia_t > 0.0 {
                // En un flanco vale cualquier instante a menos de tolerancia_t: r debe caer entre lo que el motor
                // recorrió en esa ventana.
                let (lo, hi) = rango(ts, vs, t - c.tolerancia_t, t + c.tolerancia_t);
                e = e.min(if r < lo { (lo - r) / tol } else if r > hi { (r - hi) / tol } else { 0.0 });
            }
            if e > max.0 {
                max = (e, t);
            }
        }
        peor.insert(nombre.clone(), (max.0, max.1, cruda));
    }
    if c.eventos.is_empty() {
        return peor;
    }
    // Redes digitales: la misma secuencia de niveles que ngspice, cada cambio a menos de tolerancia_t.
    let cambios = tr.tomar_cambios();
    let (enombres, efilas) = leer_eventos(caso);
    for (nombre, &red) in &c.eventos {
        let j = enombres.iter().position(|n| n == nombre).unwrap_or_else(|| panic!("{caso}: {nombre} no está en el CSV de eventos"));
        let referencia: Vec<(f64, char)> = efilas.iter().map(|(t, v)| (*t, v[j])).collect();
        let mut motor = vec![(0.0, iniciales[nombre])];
        motor.extend(cambios.iter().filter(|c| c.1 == red).map(|c| (c.0, letra(c.2))));
        let (r, m) = (sin_pulsos(&referencia, c.tolerancia_t), sin_pulsos(&motor, c.tolerancia_t));
        let mut e = (0.0, 0.0);
        for k in 0..r.len().max(m.len()) {
            match (r.get(k), m.get(k)) {
                (Some(a), Some(b)) if a.1 == b.1 && (a.0 - b.0).abs() <= c.tolerancia_t => {}
                (a, b) => {
                    println!("{caso}: {nombre} difiere en el cambio {k}: ngspice {a:?}, motor {b:?}");
                    e = (2.0, a.or(b).unwrap().0);
                    break;
                }
            }
        }
        peor.insert(format!("eventos {nombre}"), (e.0, e.1, e.0));
    }
    peor
}

fn interpolar(ts: &[f64], vs: &[f64], t: f64) -> f64 {
    let i = ts.partition_point(|&x| x < t).clamp(1, ts.len() - 1);
    let (t0, t1) = (ts[i - 1], ts[i]);
    let (v0, v1) = (vs[i - 1], vs[i]);
    if t1 == t0 { v1 } else { v0 + (v1 - v0) * (t - t0) / (t1 - t0) }
}

fn rango(ts: &[f64], vs: &[f64], a: f64, b: f64) -> (f64, f64) {
    let mut lo = interpolar(ts, vs, a).min(interpolar(ts, vs, b));
    let mut hi = interpolar(ts, vs, a).max(interpolar(ts, vs, b));
    for (t, v) in ts.iter().zip(vs) {
        if *t >= a && *t <= b {
            lo = lo.min(*v);
            hi = hi.max(*v);
        }
    }
    (lo, hi)
}

/// Avanza `tr` hasta `fin` de a un paso, aplicando cada cambio en caliente en su instante (todos los de un mismo instante, y los
/// de t = 0 antes del primer paso), y llama a `paso` después de cada paso. Un cambio cuenta como llegado a menos del paso mínimo
/// del motor (una milmillonésima del paso máximo) de su instante.
fn correr(tr: &mut Mixto, cambios: &[Cambio], fin: f64, hmax: f64, caso: &str, mut paso: impl FnMut(&Mixto)) {
    let eps = 1e-9 * hmax;
    let mut ordenados = cambios.to_vec();
    ordenados.sort_by(|a, b| a.t.total_cmp(&b.t));
    let mut pendientes: std::collections::VecDeque<Cambio> = ordenados.into();
    let aplicar = |tr: &mut Mixto, pendientes: &mut std::collections::VecDeque<Cambio>| {
        while pendientes.front().is_some_and(|p| tr.time() >= p.t - eps) {
            let p = pendientes.pop_front().unwrap();
            tr.set_element(p.element, p.nuevo).unwrap();
        }
    };
    aplicar(tr, &mut pendientes);
    while tr.time() < fin {
        // Cada cambio en caliente cae justo en su instante: `advance_to` termina el último paso en la meta.
        let meta = pendientes.front().map_or(fin, |p| p.t.min(fin));
        let dados = tr.advance_to(meta, 1).unwrap();
        assert!(dados > 0, "{caso}: advance_to no avanzó en t = {:.6e} s", tr.time());
        aplicar(tr, &mut pendientes);
        paso(tr);
    }
}

fn revisar(caso: &str) {
    let mut resultados = vec![("denso", comparar(caso, SolverKind::Dense))];
    #[cfg(feature = "faer")]
    resultados.push(("disperso", comparar(caso, SolverKind::Sparse)));
    for (nombre, peor) in &resultados {
        // Con la ventana de tiempo y, entre paréntesis, sin ella (punto a punto) cuando difiere.
        let texto: Vec<String> = peor
            .iter()
            .map(|(n, (e, _, c))| if (c - e).abs() > 5e-4 { format!("{n} {e:.3} (sin ventana {c:.3})") } else { format!("{n} {e:.3}") })
            .collect();
        println!("{caso} ({nombre}): {}", texto.join(", "));
        for (n, (e, t, _)) in peor {
            assert!(*e <= 1.0, "{caso} ({nombre}): {n} se sale de la tolerancia ({e:.2} veces) en t = {t:.6e} s");
        }
    }
}

#[test]
fn puente_1000u() {
    revisar("puente_1000u");
}

#[test]
fn puente_100u() {
    revisar("puente_100u");
}

#[test]
fn diodos_serie_rc() {
    revisar("diodos_serie_rc");
}

// Dos inductores acoplados (el transformador) contra `K1 L1 L2 k` de ngspice.
#[test]
fn xfmr_reductor() {
    revisar("xfmr_reductor");
}

#[test]
fn xfmr_elevador() {
    revisar("xfmr_elevador");
}

#[test]
fn rectificador() {
    revisar("rectificador");
}

#[test]
fn led_rojo() {
    revisar("led_rojo");
}

#[test]
fn zener_regulador() {
    revisar("zener_regulador");
}

#[test]
fn zener_recortador() {
    revisar("zener_recortador");
}

#[test]
fn npn_2n2222() {
    revisar("npn_2n2222");
}

#[test]
fn npn_2n3904() {
    revisar("npn_2n3904");
}

#[test]
fn npn_bc547() {
    revisar("npn_bc547");
}

#[test]
fn pnp_2n2907() {
    revisar("pnp_2n2907");
}

#[test]
fn pnp_2n3906() {
    revisar("pnp_2n3906");
}

#[test]
fn pnp_bc557() {
    revisar("pnp_bc557");
}

#[test]
fn ec_amplificador() {
    revisar("ec_amplificador");
}

#[test]
fn par_diferencial() {
    revisar("par_diferencial");
}

#[test]
fn nmos_2n7000() {
    revisar("nmos_2n7000");
}

#[test]
fn nmos_irfz44n() {
    revisar("nmos_irfz44n");
}

#[test]
fn pmos_bs250() {
    revisar("pmos_bs250");
}

#[test]
fn pmos_irf9540() {
    revisar("pmos_irf9540");
}

#[test]
fn mosfet_conmutacion() {
    revisar("mosfet_conmutacion");
}

// JFET de nivel 1: punto de operación por modelo, región lineal y saturación, drenador invertido, fuente común y conmutación.
#[test]
fn jfet_2n5457_autopolarizacion() {
    revisar("jfet_2n5457_autopolarizacion");
}

#[test]
fn jfet_j201_autopolarizacion() {
    revisar("jfet_j201_autopolarizacion");
}

#[test]
fn jfet_2n3819_autopolarizacion() {
    revisar("jfet_2n3819_autopolarizacion");
}

#[test]
fn jfet_2n5460_autopolarizacion() {
    revisar("jfet_2n5460_autopolarizacion");
}

#[test]
fn jfet_j175_autopolarizacion() {
    revisar("jfet_j175_autopolarizacion");
}

#[test]
fn jfet_2n3819_triodo() {
    revisar("jfet_2n3819_triodo");
}

#[test]
fn jfet_2n3819_saturacion() {
    revisar("jfet_2n3819_saturacion");
}

#[test]
fn jfet_j201_inverso() {
    revisar("jfet_j201_inverso");
}

#[test]
fn jfet_2n5457_fuente_comun() {
    revisar("jfet_2n5457_fuente_comun");
}

#[test]
fn jfet_2n3819_fuente_corriente() {
    revisar("jfet_2n3819_fuente_corriente");
}

#[test]
fn jfet_j175_interruptor() {
    revisar("jfet_j175_interruptor");
}

// Fuentes controladas E, G, H y F: amplificador, lazo de ganancia alta, transconductancia, transresistencia, espejo y un filtro RC.
#[test]
fn vcvs_amplificador() {
    revisar("vcvs_amplificador");
}

#[test]
fn vcvs_lazo() {
    revisar("vcvs_lazo");
}

#[test]
fn vccs_transconductancia() {
    revisar("vccs_transconductancia");
}

#[test]
fn ccvs_transresistencia() {
    revisar("ccvs_transresistencia");
}

#[test]
fn cccs_espejo() {
    revisar("cccs_espejo");
}

#[test]
fn vcvs_filtro_rc() {
    revisar("vcvs_filtro_rc");
}

// Fuente por tramos: rampa, escalones con subida de 1 µs y repetición.
#[test]
fn pwl_rampa() {
    revisar("pwl_rampa");
}

#[test]
fn pwl_escalones() {
    revisar("pwl_escalones");
}

#[test]
fn pwl_repeticion() {
    revisar("pwl_repeticion");
}

// Termistor NTC: divisor a tres temperaturas con la tabla R/T, autocalentamiento, limitador de arranque y ambiente que cambia en el tiempo.
#[test]
fn ntc_10k_divisor_25() {
    revisar("ntc_10k_divisor_25");
}

#[test]
fn ntc_10k_divisor_100c() {
    revisar("ntc_10k_divisor_100c");
}

#[test]
fn ntc_100k_divisor_60c() {
    revisar("ntc_100k_divisor_60c");
}

#[test]
fn ntc_10k_autocalentamiento() {
    revisar("ntc_10k_autocalentamiento");
}

#[test]
fn ntc_arranque_limitador() {
    revisar("ntc_arranque_limitador");
}

#[test]
fn ntc_10k_cambio_temperatura() {
    revisar("ntc_10k_cambio_temperatura");
}

// Termistor PTC cerámico: divisor a tres temperaturas, conmutación a 230 V con autocalentamiento y ambiente que sube por la zona de salto y baja.
#[test]
fn ptc_divisor_25() {
    revisar("ptc_divisor_25");
}

#[test]
fn ptc_divisor_80c() {
    revisar("ptc_divisor_80c");
}

#[test]
fn ptc_divisor_125c() {
    revisar("ptc_divisor_125c");
}

#[test]
fn ptc_conmutacion_230v() {
    revisar("ptc_conmutacion_230v");
}

#[test]
fn ptc_cambio_temperatura() {
    revisar("ptc_cambio_temperatura");
}

// Fotorresistencia: divisor a luces fijas y escalón de luz con subida de 20 ms y bajada de 30 ms.
#[test]
fn ldr_gl5528_10lx() {
    revisar("ldr_gl5528_10lx");
}

#[test]
fn ldr_gl5528_1000lx() {
    revisar("ldr_gl5528_1000lx");
}

#[test]
fn ldr_gl5539_0p1lx() {
    revisar("ldr_gl5539_0p1lx");
}

#[test]
fn ldr_gl5516_300lx() {
    revisar("ldr_gl5516_300lx");
}

#[test]
fn ldr_gl5528_escalon_luz() {
    revisar("ldr_gl5528_escalon_luz");
}

// LM35: 10 mV por grado a tres temperaturas y una rampa de temperatura que el seguidor sigue.
#[test]
fn lm35_25c() {
    revisar("lm35_25c");
}

#[test]
fn lm35_100c() {
    revisar("lm35_100c");
}

#[test]
fn lm35_0c() {
    revisar("lm35_0c");
}

#[test]
fn lm35_rampa() {
    revisar("lm35_rampa");
}

// TMP36: 0.5 V más 10 mV por grado a tres temperaturas y una rampa de temperatura que el seguidor sigue.
#[test]
fn tmp36_25c() {
    revisar("tmp36_25c");
}

#[test]
fn tmp36_m40c() {
    revisar("tmp36_m40c");
}

#[test]
fn tmp36_125c() {
    revisar("tmp36_125c");
}

#[test]
fn tmp36_rampa() {
    revisar("tmp36_rampa");
}

// Optoacoplador 4N25: LED y fototransistor de CTR 50 % en CC, saturado y conmutando una carga.
#[test]
fn opto_4n25_ctr() {
    revisar("opto_4n25_ctr");
}

#[test]
fn opto_4n25_saturado() {
    revisar("opto_4n25_saturado");
}

#[test]
fn opto_4n25_conmutacion() {
    revisar("opto_4n25_conmutacion");
}

// Optoacoplador PC817: el CTR nominal de cada rango en CC y la conmutación del rango A.
#[test]
fn opto_pc817a_ctr() {
    revisar("opto_pc817a_ctr");
}

#[test]
fn opto_pc817b_ctr() {
    revisar("opto_pc817b_ctr");
}

#[test]
fn opto_pc817c_ctr() {
    revisar("opto_pc817c_ctr");
}

#[test]
fn opto_pc817d_ctr() {
    revisar("opto_pc817d_ctr");
}

#[test]
fn opto_pc817a_conmutacion() {
    revisar("opto_pc817a_conmutacion");
}

// IGBT (MOSFET que maneja un PNP con el diodo en antiparalelo): conducción, zona activa, diodo y conmutación de los dos modelos.
#[test]
fn igbt_irg4bc30ud_conduccion() {
    revisar("igbt_irg4bc30ud_conduccion");
}

#[test]
fn igbt_irg4bc30ud_activa() {
    revisar("igbt_irg4bc30ud_activa");
}

#[test]
fn igbt_irg4bc30ud_diodo() {
    revisar("igbt_irg4bc30ud_diodo");
}

#[test]
fn igbt_irg4bc30ud_conmutacion() {
    revisar("igbt_irg4bc30ud_conmutacion");
}

#[test]
fn igbt_fga25n120antd_conduccion() {
    revisar("igbt_fga25n120antd_conduccion");
}

#[test]
fn igbt_fga25n120antd_activa() {
    revisar("igbt_fga25n120antd_activa");
}

#[test]
fn igbt_fga25n120antd_conmutacion() {
    revisar("igbt_fga25n120antd_conmutacion");
}

// UJT como equivalente de un PUT: antes del pico, saturado, sobre el valle y el oscilador de relajación (con LU densa y dispersa).
#[test]
fn ujt_2n2646_bajo() {
    revisar("ujt_2n2646_bajo");
}

#[test]
fn ujt_2n2646_conduccion() {
    revisar("ujt_2n2646_conduccion");
}

#[test]
fn ujt_2n2646_valle() {
    revisar("ujt_2n2646_valle");
}

#[test]
fn ujt_2n2646_relajacion() {
    revisar("ujt_2n2646_relajacion");
}

// Motor a pasos bipolar con fuentes de 12 V y 6 Ω por fase: un paso, ocho medios pasos y el arranque con carga.
#[test]
fn pasos_17hs4401_paso() {
    revisar("pasos_17hs4401_paso");
}

#[test]
fn pasos_17hs4401_medios_pasos() {
    revisar("pasos_17hs4401_medios_pasos");
}

#[test]
fn pasos_17hs4401_carga() {
    revisar("pasos_17hs4401_carga");
}

// Motor a pasos unipolar con la toma a 5 V y cada mitad a tierra: un paso, ocho medios pasos y el arranque con carga.
#[test]
fn pasos_28byj48_paso() {
    revisar("pasos_28byj48_paso");
}

#[test]
fn pasos_28byj48_medios_pasos() {
    revisar("pasos_28byj48_medios_pasos");
}

#[test]
fn pasos_28byj48_carga() {
    revisar("pasos_28byj48_carga");
}

// L298 armado con puentes y habilitación contra XSPICE: un motor DC con diodos que frena, gira, frena, gira al revés y frena.
#[test]
fn l298_motor_dc() {
    revisar("l298_motor_dc");
}

#[test]
fn opamp_inversor() {
    revisar("opamp_inversor");
}

#[test]
fn opamp_seguidor() {
    revisar("opamp_seguidor");
}

#[test]
fn opamp_comparador() {
    revisar("opamp_comparador");
}

#[test]
fn foco_encendido() {
    revisar("foco_encendido");
}

#[test]
fn motor_arranque() {
    revisar("motor_arranque");
}

#[test]
fn fusible_fundido() {
    revisar("fusible_fundido");
}

#[test]
fn rele_proteccion() {
    revisar("rele_proteccion");
}

#[test]
fn hc_inversor_rc() {
    revisar("hc_inversor_rc");
}

#[test]
fn hc_cadena_nand() {
    revisar("hc_cadena_nand");
}

#[test]
fn hc_medio_sumador() {
    revisar("hc_medio_sumador");
}

#[test]
fn anillo_habilitado() {
    revisar("anillo_habilitado");
}

#[test]
fn latch_sr_nand() {
    revisar("latch_sr_nand");
}

#[test]
fn ls_abanico() {
    revisar("ls_abanico");
}

#[test]
fn cd4000_12v() {
    revisar("cd4000_12v");
}

#[test]
fn hc_divisor_d() {
    revisar("hc_divisor_d");
}

#[test]
fn hc_jk_conmuta() {
    revisar("hc_jk_conmuta");
}

#[test]
fn hc_contador() {
    revisar("hc_contador");
}

#[test]
fn hc_decodificador_display() {
    revisar("hc_decodificador_display");
}

#[test]
fn hc_reloj_lento() {
    revisar("hc_reloj_lento");
}

#[test]
fn ne555_astable() {
    revisar("ne555_astable");
}

#[test]
fn ne555_monoestable() {
    revisar("ne555_monoestable");
}

#[test]
fn tlc555_astable() {
    revisar("tlc555_astable");
}

/// El caso de referencia en el motor, sin ngspice.
fn correr_caso(caso: &str) -> Mixto {
    let c: Caso = serde_json::from_str(&std::fs::read_to_string(carpeta().join(format!("{caso}.json"))).unwrap()).unwrap();
    let mut m = Mixto::new(c.netlist, c.hmax).unwrap();
    m.registrar_cambios(true);
    m.advance_to(c.fin, u32::MAX).unwrap();
    m
}

/// Además de ngspice, la frecuencia del astable y el ancho del monoestable dentro de 2 % de la
/// fórmula de la hoja de datos.
#[test]
fn el_555_queda_dentro_del_2_por_ciento_de_la_formula() {
    for (caso, r1, r2, c) in [("ne555_astable", 1e3, 10e3, 100e-9), ("tlc555_astable", 10e3, 47e3, 10e-9)] {
        let (f, ciclo, _) = correr_caso(caso).medida(3);
        let formula = 1.44 / ((r1 + 2.0 * r2) * c);
        let ciclo_formula = (r1 + r2) / (r1 + 2.0 * r2);
        println!("{caso}: {f:.1} Hz y {:.1} % contra {formula:.1} Hz y {:.1} % de la fórmula", 100.0 * ciclo, 100.0 * ciclo_formula);
        assert!((f / formula - 1.0).abs() < 0.02, "{caso}: {f} Hz contra {formula} Hz");
        // El ciclo de trabajo también, relativo: el NE555 da 51.5 % contra 52.4 % (-1.7 %) porque mientras descarga, la
        // resistencia de la descarga lleva también la corriente de R1 (tarea 1).
        assert!((ciclo / ciclo_formula - 1.0).abs() < 0.02, "{caso}: ciclo {ciclo} contra {ciclo_formula}");
    }
    let mut m = correr_caso("ne555_monoestable");
    let q: Vec<(f64, Nivel)> = m.tomar_cambios().into_iter().filter(|c| c.1 == 3).map(|c| (c.0, c.2)).collect();
    let sube = q.iter().find(|c| c.1 == Nivel::Uno).unwrap().0;
    let baja = q.iter().find(|c| c.0 > sube && c.1 == Nivel::Cero).unwrap().0;
    let formula = 1.1 * 10e3 * 100e-9;
    println!("ne555_monoestable: {:.4} ms contra {:.4} ms de la fórmula", 1e3 * (baja - sube), 1e3 * formula);
    assert!(((baja - sube) / formula - 1.0).abs() < 0.02, "ancho {} s contra {formula} s", baja - sube);
}

// El generador sobre un RC, y el voltímetro y el amperímetro (un fusible con la resistencia de su modo).
#[test]
fn gen_seno_rc() {
    revisar("gen_seno_rc");
}

#[test]
fn gen_cuadrada_rc() {
    revisar("gen_cuadrada_rc");
}

#[test]
fn multimetro_voltimetro() {
    revisar("multimetro_voltimetro");
}

#[test]
fn multimetro_amperimetro() {
    revisar("multimetro_amperimetro");
}

// La onda de pulso (triangular y diente de sierra) y el cambio de frecuencia en caliente con la fase continua.
#[test]
fn gen_triangular() {
    revisar("gen_triangular");
}

#[test]
fn gen_diente() {
    revisar("gen_diente");
}

#[test]
fn gen_fase() {
    revisar("gen_fase");
}

// La fuente variable de dos tramos pasa de CV a CC y vuelve, con la carga que entra y sale por un MOSFET.
#[test]
fn fuente_cv_cc() {
    revisar("fuente_cv_cc");
}


// El óhmetro, un fusible con la fuente de prueba en serie (tarea 7).
#[test]
fn multimetro_ohmetro() {
    revisar("multimetro_ohmetro");
}

#[test]
fn el_arnes_aplica_los_cambios_del_mismo_instante_y_los_del_instante_cero() {
    // Dos cambios a 1 ms (la fuente y la carga, como el generador y el modo de un multímetro en el mismo gesto) y uno a t = 0:
    // se aplican todos, cada uno en su instante, sin que `advance_to` quede pidiendo un paso de largo cero.
    let net = Netlist::from_json(r#"{"nodes":2,"elements":[{"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":1}},{"type":"R","a":1,"b":0,"ohms":1000}]}"#).unwrap();
    let cambio = |t: f64, json: &str| Cambio { t, element: if json.contains("\"R\"") { 1 } else { 0 }, nuevo: serde_json::from_str(json).unwrap() };
    let cambios = [
        cambio(1e-3, r#"{"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}}"#),
        cambio(0.0, r#"{"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":2}}"#),
        cambio(1e-3, r#"{"type":"R","a":1,"b":0,"ohms":500}"#),
    ];
    let mut tr = Mixto::new(net, 1e-5).unwrap();
    let mut vistos = Vec::new();
    correr(&mut tr, &cambios, 2e-3, 1e-5, "prueba", |tr| vistos.push((tr.time(), tr.voltage(1), tr.readings()[1].i)));
    assert!(vistos.iter().filter(|v| v.0 <= 1e-3).all(|v| v.1 == 2.0), "el cambio de t = 0 no se aplicó");
    let (_, v, i) = *vistos.last().unwrap();
    assert_eq!(v, 5.0);
    assert!((i - 0.01).abs() < 1e-12, "{i}");
}

#[test]
fn hc_compuertas_n() {
    revisar("hc_compuertas_n");
}

#[test]
fn hc_schmitt() {
    revisar("hc_schmitt");
}

#[test]
fn hc_bus_tres_estados() {
    revisar("hc_bus_tres_estados");
}

// Combinacionales de tabla (LUT) de la Librería contra la síntesis de XSPICE: los mismos niveles en los mismos instantes.
// Los flancos de entradas distintas distan más que el retardo del chip (o coinciden): d_genlut vuelve a disparar sus salidas
// con cada cambio de entrada y eso reinicia el retardo inercial de la salida, así que un flanco cercano la atrasa en ngspice.
// Decodificador de 3 a 8 de tabla (LUT) con las tres habilitaciones, en 74HC.
#[test]
fn lut_decodificador_138_hc() {
    revisar("lut_decodificador_138_hc");
}

// El mismo decodificador en 74LS.
#[test]
fn lut_decodificador_138_ls() {
    revisar("lut_decodificador_138_ls");
}

// Una unidad del doble decodificador de 2 a 4, en 74LS.
#[test]
fn lut_decodificador_139_ls() {
    revisar("lut_decodificador_139_ls");
}

// Decodificador BCD a siete segmentos de colector abierto, con BI/RBO al aire y RBI en pulso.
#[test]
fn lut_decodificador_7447_ls() {
    revisar("lut_decodificador_7447_ls");
}

// El mismo decodificador con la prueba de segmentos en pulso.
#[test]
fn lut_decodificador_7447_ls_prueba_lt() {
    revisar("lut_decodificador_7447_ls_prueba_lt");
}

// Decodificador BCD a decimal CD4000B.
#[test]
fn lut_decodificador_4028_cd() {
    revisar("lut_decodificador_4028_cd");
}

// Multiplexor de 8 a 1 con la salida directa y la complementaria.
#[test]
fn lut_multiplexor_151_hc() {
    revisar("lut_multiplexor_151_hc");
}

// Doble multiplexor de 4 a 1 de rebanadas con selección común.
#[test]
fn lut_multiplexor_153_ls() {
    revisar("lut_multiplexor_153_ls");
}

// Cuádruple multiplexor de 2 a 1 de rebanadas.
#[test]
fn lut_multiplexor_157_hc() {
    revisar("lut_multiplexor_157_hc");
}

// Codificador de prioridad de 8 a 3 con GS y EO.
#[test]
fn lut_codificador_148_ls() {
    revisar("lut_codificador_148_ls");
}

// Sumador de 4 bits de tabla generada.
#[test]
fn lut_sumador_283_hc() {
    revisar("lut_sumador_283_hc");
}

// Comparador de magnitud de 4 bits con cascada, de tabla generada.
#[test]
fn lut_comparador_85_ls() {
    revisar("lut_comparador_85_ls");
}

// Búfer octal de tres estados en dos grupos de cuatro.
#[test]
fn lut_bufer_244_hc() {
    revisar("lut_bufer_244_hc");
}

// Transceptor octal bidireccional entre dos búferes de tres estados que manejan cada lado por turnos.
#[test]
fn lut_transceptor_245_hc() {
    revisar("lut_transceptor_245_hc");
}

// Contador binario 74HC161 con carga síncrona, borrado asíncrono y habilitaciones al azar contra la síntesis de ngspice.
#[test]
fn msi_contador_161_hc() {
    revisar("msi_contador_161_hc");
}

// El mismo contador en 74LS con sus retardos de subida y bajada.
#[test]
fn msi_contador_161_ls() {
    revisar("msi_contador_161_ls");
}

// Contador binario 74HC163 con borrado y carga síncronos y habilitaciones al azar contra la síntesis de ngspice.
#[test]
fn msi_contador_163_hc() {
    revisar("msi_contador_163_hc");
}

// El mismo contador en 74LS.
#[test]
fn msi_contador_163_ls() {
    revisar("msi_contador_163_ls");
}

// Contador de década 74HC190 con sentido, habilitación y carga asíncrona al azar contra la síntesis de ngspice, con sus salidas MAX/MIN y RCO.
#[test]
fn msi_contador_190_hc() {
    revisar("msi_contador_190_hc");
}

// El mismo contador en 74LS.
#[test]
fn msi_contador_190_ls() {
    revisar("msi_contador_190_ls");
}

// Contador binario 74HC193 de dos relojes con borrado y carga asíncronos al azar contra la síntesis de ngspice, con sus salidas CO y BO.
#[test]
fn msi_contador_193_hc() {
    revisar("msi_contador_193_hc");
}

// El mismo contador en 74LS.
#[test]
fn msi_contador_193_ls() {
    revisar("msi_contador_193_ls");
}

// Contador Johnson CD4017B con INH, reloj y borrado al azar contra la síntesis de ngspice, con el 4017 contando también por la bajada de INH.
#[test]
fn msi_contador_4017_cd() {
    revisar("msi_contador_4017_cd");
}

// El mismo contador en 74HC.
#[test]
fn msi_contador_4017_hc() {
    revisar("msi_contador_4017_hc");
}

// Modelos comerciales agregados a transistores, diodo, amplificadores, comparador y reguladores, con los circuitos de la librería exportados a JSON.
#[test]
fn bjt_bc337() {
    revisar("bjt_bc337");
}

#[test]
fn bjt_bc327() {
    revisar("bjt_bc327");
}

#[test]
fn bjt_2n5551() {
    revisar("bjt_2n5551");
}

#[test]
fn bjt_2n5401() {
    revisar("bjt_2n5401");
}

#[test]
fn bjt_2n3055() {
    revisar("bjt_2n3055");
}

#[test]
fn diodo_1n4001() {
    revisar("diodo_1n4001");
}

#[test]
fn diodo_1n4001_ruptura() {
    revisar("diodo_1n4001_ruptura");
}

#[test]
fn reg_7809_arranque() {
    revisar("reg_7809_arranque");
}

#[test]
fn reg_7815_arranque() {
    revisar("reg_7815_arranque");
}

#[test]
fn reg_7912_arranque() {
    revisar("reg_7912_arranque");
}

#[test]
fn reg_7915_arranque() {
    revisar("reg_7915_arranque");
}

#[test]
fn ao_mcp6002_ac() {
    revisar("ao_mcp6002_ac");
}

#[test]
fn ao_mcp6002_pulso() {
    revisar("ao_mcp6002_pulso");
}

#[test]
fn ao_op27_ac() {
    revisar("ao_op27_ac");
}

#[test]
fn ao_op27_pulso() {
    revisar("ao_op27_pulso");
}

#[test]
fn comp_lm339_pulso() {
    revisar("comp_lm339_pulso");
}

#[test]
fn comp_lm339_seno() {
    revisar("comp_lm339_seno");
}
