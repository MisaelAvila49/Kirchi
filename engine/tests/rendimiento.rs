//! Rendimiento nativo del motor con cadenas de amplificadores de emisor común (2N2222, 20 mV a 1 kHz, el paso máximo de la vista
//! previa de 100 por periodo). Los tiempos solo se comprueban en `--release`: `cargo test --release --test rendimiento`.
use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;
use std::time::Instant;

use kirchi_engine::{Netlist, Transient};

struct Cuenta;
// Por hilo: las pruebas corren en paralelo y cada una cuenta solo sus reservas.
thread_local! {
    static ASIGNACIONES: Cell<u64> = const { Cell::new(0) };
}
fn asignaciones() -> u64 {
    ASIGNACIONES.with(Cell::get)
}
unsafe impl GlobalAlloc for Cuenta {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        let _ = ASIGNACIONES.try_with(|c| c.set(c.get() + 1));
        System.alloc(l)
    }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
        System.dealloc(p, l)
    }
}
#[global_allocator]
static A: Cuenta = Cuenta;

/// Las pruebas de tiempo se turnan: corriendo a la vez en hilos de la misma prueba, una le quita procesador a la otra.
static TIEMPOS: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn etapas(k: usize) -> Netlist {
    Netlist::from_json(&etapas_json(k).to_string()).unwrap()
}

/// La netlist de `etapas` como JSON, para agregarle sondas.
fn etapas_json(k: usize) -> serde_json::Value {
    let referencia: serde_json::Value = serde_json::from_str(include_str!("../referencias/ec_amplificador.json")).unwrap();
    let q = referencia["netlist"]["elements"].as_array().unwrap().iter().find(|e| e["type"] == "Q").unwrap().clone();
    let mut el = vec![
        serde_json::json!({"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":12}}),
        serde_json::json!({"type":"V","a":2,"b":0,"wave":{"kind":"sine","offset":0,"amp":0.02,"freq":1000}}),
    ];
    let mut n = 3;
    for _ in 0..k {
        let (b, c, e, o) = (n, n + 1, n + 2, n + 3);
        n += 4;
        el.push(serde_json::json!({"type":"C","a":2,"b":b,"farads":1e-6}));
        el.push(serde_json::json!({"type":"R","a":1,"b":b,"ohms":47000}));
        el.push(serde_json::json!({"type":"R","a":b,"b":0,"ohms":10000}));
        el.push(serde_json::json!({"type":"R","a":1,"b":c,"ohms":2200}));
        el.push(serde_json::json!({"type":"R","a":e,"b":0,"ohms":470}));
        el.push(serde_json::json!({"type":"C","a":e,"b":0,"farads":1e-5}));
        el.push(serde_json::json!({"type":"C","a":c,"b":o,"farads":1e-6}));
        el.push(serde_json::json!({"type":"R","a":o,"b":0,"ohms":10000}));
        let mut qk = q.clone();
        qk["c"] = c.into();
        qk["b"] = b.into();
        qk["e"] = e.into();
        el.push(qk);
    }
    serde_json::json!({"nodes": n, "elements": el})
}

/// Un paso aceptado no reserva memoria, ni siquiera al buscar el elemento sospechoso en las iteraciones sin convergencia.
#[test]
fn un_paso_no_reserva_memoria() {
    let mut tr = Transient::new(etapas(10), 1e-5).unwrap();
    tr.advance_to(2e-3, u32::MAX).unwrap();
    let a0 = asignaciones();
    let p0 = tr.steps();
    tr.advance_to(6e-3, u32::MAX).unwrap();
    let pasos = (tr.steps() - p0) as f64;
    let por_paso = (asignaciones() - a0) as f64 / pasos;
    assert!(pasos > 300.0);
    assert!(por_paso < 0.5, "{por_paso} reservas por paso");
}

/// Una cadena de cinco etapas corre al tiempo real o más en la máquina de referencia (el mejor de cinco corridas).
/// Lo mismo con la LU densa (una etapa, unas diez incógnitas).
#[test]
fn un_paso_con_la_lu_densa_no_reserva_memoria() {
    let mut tr = Transient::new(etapas(1), 1e-5).unwrap();
    tr.advance_to(2e-3, u32::MAX).unwrap();
    let a0 = asignaciones();
    let p0 = tr.steps();
    tr.advance_to(6e-3, u32::MAX).unwrap();
    let pasos = (tr.steps() - p0) as f64;
    let por_paso = (asignaciones() - a0) as f64 / pasos;
    assert!(pasos > 300.0);
    assert!(por_paso < 0.5, "{por_paso} reservas por paso");
}

#[test]
fn cinco_etapas_corren_al_tiempo_real_o_mas() {
    if cfg!(debug_assertions) {
        return;
    }
    let _turno = TIEMPOS.lock().unwrap_or_else(|e| e.into_inner());
    let sim_s = 0.05;
    let mut mejor: f64 = 0.0;
    for _ in 0..5 {
        let mut tr = Transient::new(etapas(5), 1e-5).unwrap();
        tr.advance_to(1e-9, 1).unwrap();
        tr.advance_to(0.01, u32::MAX).unwrap();
        let t0 = Instant::now();
        tr.advance_to(0.01 + sim_s, u32::MAX).unwrap();
        mejor = mejor.max(sim_s / t0.elapsed().as_secs_f64());
    }
    println!("5 etapas: {:.0} % del tiempo real", 100.0 * mejor);
    assert!(mejor >= 1.0, "{:.0} % del tiempo real", 100.0 * mejor);
}

/// Criterio 4: con cuatro sondas y los promedios activados un paso tampoco reserva memoria (las sondas reservan
/// su búfer al cargar la netlist).
#[test]
fn cuatro_sondas_y_los_promedios_no_reservan_memoria_por_paso() {
    let mut v = etapas_json(10);
    v["sondas"] = serde_json::json!([
        {"kind":"v","p":3,"n":0,"muestras":262144,"columna":1e-5},
        {"kind":"v","p":4,"n":0,"muestras":262144,"columna":1e-5},
        {"kind":"v","p":6,"n":0,"muestras":262144,"columna":1e-5},
        {"kind":"i","element":3,"signo":1,"muestras":32768,"columna":1e-5}
    ]);
    let mut m = kirchi_engine::Mixto::new(Netlist::from_json(&v.to_string()).unwrap(), 1e-5).unwrap();
    m.activar_promedios();
    m.advance_to(2e-3, u32::MAX).unwrap();
    let a0 = asignaciones();
    let pasos = m.advance_to(6e-3, u32::MAX).unwrap() as f64;
    let por_paso = (asignaciones() - a0) as f64 / pasos;
    assert!(pasos > 300.0);
    assert!(por_paso < 0.5, "{por_paso} reservas por paso");
}

/// Criterio 1: con las corrientes por terminal, las potencias y los promedios activados un paso tampoco reserva
/// memoria (los vectores se reservan al activarlos).
#[test]
fn las_corrientes_por_terminal_y_las_potencias_no_reservan_memoria_por_paso() {
    let net = etapas(10);
    let total = net.elements.len();
    let mut m = kirchi_engine::Mixto::new(net, 1e-5).unwrap();
    m.activar_promedios();
    m.activar_terminales(true);
    m.activar_potencias(&(0..total).collect::<Vec<_>>()).unwrap();
    m.advance_to(2e-3, u32::MAX).unwrap();
    let a0 = asignaciones();
    let pasos = m.advance_to(6e-3, u32::MAX).unwrap() as f64;
    let por_paso = (asignaciones() - a0) as f64 / pasos;
    assert!(pasos > 300.0);
    assert!(por_paso < 0.5, "{por_paso} reservas por paso");
}

/// Criterio 1: lo que cuestan las corrientes por terminal en cinco etapas (nativo; el criterio de 5 % se mide en
/// WASM con `sim/animacion.rendimiento.test.ts`). Se compara la mejor de cinco tandas intercaladas con y sin ellas.
#[test]
fn las_corrientes_por_terminal_cuestan_poco_en_cinco_etapas() {
    if cfg!(debug_assertions) {
        return;
    }
    let _turno = TIEMPOS.lock().unwrap_or_else(|e| e.into_inner());
    let sim_s = 0.05;
    let capacidad = |terminales: bool| {
        let mut m = kirchi_engine::Mixto::new(etapas(5), 1e-5).unwrap();
        m.activar_promedios();
        m.activar_terminales(terminales);
        m.advance_to(0.01, u32::MAX).unwrap();
        let t0 = Instant::now();
        m.advance_to(0.01 + sim_s, u32::MAX).unwrap();
        sim_s / t0.elapsed().as_secs_f64()
    };
    // Cinco tandas intercaladas, la mejor de cada una: una racha de carga del equipo toca a las dos por igual.
    let (mut sin, mut con) = (0.0f64, 0.0f64);
    for _ in 0..5 {
        sin = sin.max(capacidad(false));
        con = con.max(capacidad(true));
    }
    println!("cinco etapas: {:.0} % sin corrientes por terminal y {:.0} % con ellas ({:.1} % menos)", 100.0 * sin, 100.0 * con, 100.0 * (1.0 - con / sin));
    assert!(con >= 0.9 * sin, "{con} contra {sin}");
}


/// Tomar los cambios que se oyen de un zumbador que cambia diez mil veces por segundo (5 kHz) no reserva memoria (la lista
/// del transitorio conserva su capacidad y el búfer es del que llama).
#[test]
fn tomar_los_cambios_que_se_oyen_no_reserva_memoria() {
    let mut m = kirchi_engine::Mixto::new(
        Netlist::from_json(r#"{"nodes":2,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":5000,"duty":0.5}},
            {"type":"BUZZER","a":1,"b":0,"ohms":166.7,"umbral":3}]}"#).unwrap(),
        1e-6,
    )
    .unwrap();
    let mut buf = Vec::new();
    for _ in 0..20 {
        m.advance_to(m.time() + 1e-4, u32::MAX).unwrap();
        m.tomar_cruces(&mut buf);
    }
    let a0 = asignaciones();
    let mut n = 0;
    for _ in 0..200 {
        m.advance_to(m.time() + 1e-4, u32::MAX).unwrap();
        m.tomar_cruces(&mut buf);
        n += buf.len();
    }
    let reservas = asignaciones() - a0;
    // 5 kHz son diez mil cambios por segundo: 200 en los 20 ms medidos.
    assert!(n >= 190, "{n} cambios");
    assert_eq!(reservas, 0, "{reservas} reservas en 200 llamadas con {n} cambios");
}

/// Integrar la potencia media de 984 resistencias en paralelo (la e2e de mil piezas) cuesta a lo más una cuarta parte de la capacidad (nativo, mejor de cinco tandas). Es el peor caso: dos nodos y mil elementos. Se midió de 17 a 20 %.
#[test]
fn las_potencias_de_984_resistencias_cuestan_poco() {
    if cfg!(debug_assertions) {
        return;
    }
    let _turno = TIEMPOS.lock().unwrap_or_else(|e| e.into_inner());
    let mut el = vec![serde_json::json!({"type":"V","a":1,"b":0,"wave":{"kind":"sine","offset":0,"amp":5,"freq":1000}})];
    for k in 0..984 {
        el.push(serde_json::json!({"type":"R","a":1,"b":0,"ohms":1000 + k}));
    }
    let net = Netlist::from_json(&serde_json::json!({"nodes":2,"elements":el}).to_string()).unwrap();
    let capacidad = |potencias: bool| {
        let mut m = kirchi_engine::Mixto::new(net.clone(), 2e-5).unwrap();
        m.activar_promedios();
        if potencias {
            m.activar_potencias(&(1..=984).collect::<Vec<_>>()).unwrap();
        }
        m.advance_to(0.01, u32::MAX).unwrap();
        let t0 = Instant::now();
        m.advance_to(0.11, u32::MAX).unwrap();
        0.1 / t0.elapsed().as_secs_f64()
    };
    let (mut sin, mut con) = (0.0f64, 0.0f64);
    for _ in 0..5 {
        sin = sin.max(capacidad(false));
        con = con.max(capacidad(true));
    }
    println!("984 resistencias: {:.0} % sin potencias y {:.0} % con ellas ({:.1} % menos)", 100.0 * sin, 100.0 * con, 100.0 * (1.0 - con / sin));
    assert!(con >= 0.75 * sin, "{con} contra {sin}");
}

/// Los 256 canales declarados que ninguna pieza lee: la isla no guarda estado de canal, no reserva memoria por paso y, en
/// `--release`, corre dentro del 2 % de la misma netlist sin canales.
#[test]
fn declarar_canales_que_la_isla_no_lee_no_cuesta() {
    let con_canales = || {
        let mut v = etapas_json(5);
        v["canales"] = serde_json::Value::Array(vec![serde_json::json!({"inicial": 0.0}); 256]);
        Netlist::from_json(&v.to_string()).unwrap()
    };
    let mut m = kirchi_engine::Mixto::new(con_canales(), 1e-5).unwrap();
    m.advance_to(2e-3, u32::MAX).unwrap();
    let a0 = asignaciones();
    let pasos = m.advance_to(6e-3, u32::MAX).unwrap() as f64;
    assert!(pasos > 300.0);
    let por_paso = (asignaciones() - a0) as f64 / pasos;
    assert!(por_paso < 0.5, "{por_paso} reservas por paso");
    if cfg!(debug_assertions) {
        return;
    }
    let _turno = TIEMPOS.lock().unwrap_or_else(|e| e.into_inner());
    let sim_s = 0.05;
    let capacidad = |net: Netlist| {
        let mut m = kirchi_engine::Mixto::new(net, 1e-5).unwrap();
        m.advance_to(0.01, u32::MAX).unwrap();
        let t0 = Instant::now();
        m.advance_to(0.01 + sim_s, u32::MAX).unwrap();
        sim_s / t0.elapsed().as_secs_f64()
    };
    let (mut sin, mut con) = (0.0f64, 0.0f64);
    for _ in 0..5 {
        sin = sin.max(capacidad(etapas(5)));
        con = con.max(capacidad(con_canales()));
    }
    println!("cinco etapas: {:.0} % sin canales y {:.0} % con 256 declarados ({:.1} % menos)", 100.0 * sin, 100.0 * con, 100.0 * (1.0 - con / sin));
    assert!(con >= 0.98 * sin, "{con} contra {sin}");
}
