//! La onda de pulso de SPICE (cuadrada con flancos, triangular, diente de sierra) y la fase continua del generador.
use kirchi_engine::{Element, EngineError, Netlist, Transient, Wave};

fn pulso(low: f64, high: f64, freq: f64, rise: f64, fall: f64, width: f64, phase: f64) -> Wave {
    Wave::Pulse { low, high, freq, rise, fall, width, phase, continua: false }
}

#[test]
fn la_triangular_y_el_diente_de_sierra_siguen_su_formula() {
    let t = 1e-3;
    let tri = pulso(-1.0, 1.0, 1000.0, 0.5 * t, 0.5 * t, 0.0, 0.0);
    for (x, v) in [(0.0, -1.0), (0.25 * t, 0.0), (0.5 * t, 1.0), (0.75 * t, 0.0), (1.25 * t, 0.0)] {
        assert!((tri.at(x) - v).abs() < 1e-12, "triangular en {x}: {}", tri.at(x));
    }
    let diente = pulso(-1.0, 1.0, 1000.0, t, 0.0, 0.0, 0.0);
    assert!((diente.at(0.5 * t) - 0.0).abs() < 1e-12);
    assert!((diente.at(0.999 * t) - 0.998).abs() < 1e-9);
    assert!((diente.at(1.001 * t) - (-0.998)).abs() < 1e-9);
}

#[test]
fn la_fase_corre_el_principio_del_ciclo() {
    // Periodo de 10 ms con fase 0.8: la subida empieza a los 2 ms, como PULSE(0 10 2m …) de ngspice.
    let w = pulso(0.0, 10.0, 100.0, 1e-6, 1e-6, 2e-3, 0.8);
    assert_eq!(w.at(1.9e-3), 0.0);
    assert!((w.at(2.0005e-3) - 5.0).abs() < 1e-6);
    assert_eq!(w.at(3e-3), 10.0);
    assert_eq!(w.at(4.5e-3), 0.0);
}

#[test]
fn las_esquinas_son_puntos_de_quiebre() {
    let w = pulso(-1.0, 1.0, 1000.0, 0.5e-3, 0.5e-3, 0.0, 0.0);
    assert!((w.next_edge(0.0) - 0.5e-3).abs() < 1e-15);
    assert!((w.next_edge(0.5e-3) - 1e-3).abs() < 1e-15);
    assert!((w.next_edge(0.7e-3) - 1e-3).abs() < 1e-15);
    assert_eq!(Wave::Sine { offset: 0.0, amp: 1.0, freq: 1000.0, phase: 0.0, continua: true }.next_edge(0.0), f64::INFINITY);
}

#[test]
fn un_paso_que_termina_en_un_flanco_ideal_usa_el_nivel_de_antes() {
    let w = pulso(0.0, 5.0, 1000.0, 0.0, 0.0, 0.25e-3, 0.0);
    assert_eq!(w.during(0.25e-3, 1e-5), 5.0);
    assert_eq!(w.during(0.25e-3 + 1e-5, 1e-5), 0.0);
    // En una rampa, el valor al final del paso.
    let r = pulso(0.0, 1.0, 1000.0, 1e-3, 0.0, 0.0, 0.0);
    assert!((r.during(0.5e-3, 1e-5) - 0.5).abs() < 1e-12);
}

const RC: &str = r#"{"nodes":3,"elements":[{"type":"V","a":1,"b":0,"wave":ONDA},{"type":"R","a":1,"b":2,"ohms":1000},{"type":"C","a":2,"b":0,"farads":1e-7}]}"#;

fn rc(onda: &str) -> Transient {
    Transient::new(Netlist::from_json(&RC.replace("ONDA", onda)).unwrap(), 1e-5).unwrap()
}

#[test]
fn la_cuadrada_como_pulso_simula_igual_que_la_cuadrada() {
    let mut a = rc(r#"{"kind":"square","low":-1,"high":1,"freq":1000,"duty":0.25}"#);
    let mut b = rc(r#"{"kind":"pulse","low":-1,"high":1,"freq":1000,"rise":0,"fall":0,"width":0.00025}"#);
    a.advance_to(5e-3, u32::MAX).unwrap();
    b.advance_to(5e-3, u32::MAX).unwrap();
    assert!((a.voltage(2) - b.voltage(2)).abs() < 1e-9, "{} contra {}", a.voltage(2), b.voltage(2));
}

/// Una senoidal de 1 kHz que pasa a 2 kHz en 1.25 ms (en el pico): con `continua` sigue sin salto.
fn cambio_de_frecuencia(continua: bool) -> (f64, f64, Transient) {
    let onda = |f: f64| Wave::Sine { offset: 0.0, amp: 1.0, freq: f, phase: 0.0, continua };
    let mut tr = rc(&format!(r#"{{"kind":"sine","offset":0,"amp":1,"freq":1000,"continua":{continua}}}"#));
    tr.advance_to(1.25e-3, u32::MAX).unwrap();
    let antes = tr.voltage(1);
    tr.set_element(0, Element::V { a: 1, b: 0, wave: onda(2000.0) }).unwrap();
    tr.step().unwrap();
    let despues = tr.voltage(1);
    (antes, despues, tr)
}

#[test]
fn con_fase_continua_la_frecuencia_nueva_sigue_desde_el_mismo_punto_del_ciclo() {
    let (antes, despues, mut tr) = cambio_de_frecuencia(true);
    assert!((antes - 1.0).abs() < 1e-9);
    assert!((despues - antes).abs() < 0.01, "saltó de {antes} a {despues}");
    tr.advance_to(2e-3, u32::MAX).unwrap();
    // ψ = 1.25 ciclos en el cambio y 2 kHz después: en 2 ms van 1.25 + 2000 · 0.75e-3 = 2.75 ciclos.
    let esperado = (2.0 * std::f64::consts::PI * 2.75f64).sin();
    assert!((tr.voltage(1) - esperado).abs() < 1e-6, "{} contra {esperado}", tr.voltage(1));
}

#[test]
fn sin_fase_continua_la_frecuencia_nueva_empieza_de_cero_como_hoy() {
    let (_, despues, _) = cambio_de_frecuencia(false);
    // sen(2π · 2000 · 1.25 ms) = sen(5π) ≈ 0: la fuente AC salta.
    assert!(despues.abs() < 0.2, "{despues}");
}

#[test]
fn cambiar_de_forma_conserva_el_punto_del_ciclo() {
    // De senoidal en 0.25 ms (un cuarto de ciclo) a triangular: la triangular sigue en su cuarto de ciclo (en 0 V, subiendo).
    let mut tr = rc(r#"{"kind":"sine","offset":0,"amp":1,"freq":1000,"continua":true}"#);
    tr.advance_to(0.25e-3, u32::MAX).unwrap();
    let tri = Wave::Pulse { low: -1.0, high: 1.0, freq: 1000.0, rise: 0.5e-3, fall: 0.5e-3, width: 0.0, phase: 0.0, continua: true };
    tr.set_element(0, Element::V { a: 1, b: 0, wave: tri }).unwrap();
    tr.advance_to(0.375e-3, u32::MAX).unwrap();
    // Un octavo de ciclo después del cambio: 0.375 de ciclo, en la subida: −1 + 2 · 0.375/0.5 = 0.5 V.
    assert!((tr.voltage(1) - 0.5).abs() < 1e-6, "{}", tr.voltage(1));
}

fn invalido(onda: &str, h: f64) -> String {
    match Netlist::from_json(&RC.replace("ONDA", onda)).and_then(|n| Transient::new(n, h)) {
        Err(EngineError::Invalid(m)) => m,
        otro => panic!("se esperaba un error y salió {:?}", otro.err()),
    }
}

#[test]
fn un_pulso_mal_formado_se_rechaza() {
    assert!(invalido(r#"{"kind":"pulse","low":0,"high":1,"freq":1000,"rise":0.0006,"fall":0.0006,"width":0}"#, 1e-5).contains("fuera del rango"));
    assert!(invalido(r#"{"kind":"pulse","low":0,"high":1,"freq":1000,"rise":0,"fall":0,"width":0.0005,"phase":1}"#, 1e-5).contains("fuera del rango"));
    assert!(invalido(r#"{"kind":"sine","offset":0,"amp":1,"freq":1000,"phase":-0.1}"#, 1e-5).contains("fuera del rango"));
    // Un tramo de 1 ns con un paso máximo de 1 ms: la onda cambia más de 10,000 veces por paso.
    assert!(invalido(r#"{"kind":"pulse","low":0,"high":1,"freq":1000,"rise":1e-9,"fall":0,"width":0.0005}"#, 1e-3).contains("onda de pulso"));
}

/// Una fuente continua en una isla con un puente de entrada (una isla quieta, que salta entre eventos), un inversor y su LED.
const ISLA_QUIETA: &str = r#"{"nodes":4,"digital_nets":2,"elements":[
    {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":1}},
    {"type":"R","a":1,"b":0,"ohms":1000},
    {"type":"ADC","p":1,"n":0,"out":0,"in_low":1.5,"in_high":3.5},
    {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":5e-9,"fall_delay":5e-9},
    {"type":"DAC","input":1,"out":2,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":7e-9,"t_fall":7e-9},
    {"type":"R","a":2,"b":3,"ohms":330},
    {"type":"D","a":3,"b":0,"is":1.5e-17,"n":2}]}"#;

#[test]
fn una_fuente_continua_que_pasa_a_senoidal_en_caliente_deja_de_saltar() {
    // La isla era quieta por tener solo una fuente continua; con la senoidal tiene dinámica: si siguiera saltando entre eventos,
    // su voltaje se quedaría en el de antes del cambio.
    let mut m = kirchi_engine::Mixto::new(Netlist::from_json(ISLA_QUIETA).unwrap(), 1e-5).unwrap();
    m.advance_to(1e-3, u32::MAX).unwrap();
    m.set_element(0, Element::V { a: 1, b: 0, wave: Wave::Sine { offset: 0.0, amp: 2.0, freq: 1000.0, phase: 0.0, continua: false } }).unwrap();
    m.advance_to(1.25e-3, u32::MAX).unwrap();
    // 2 sen(2π · 1000 · 1.25 ms) = 2 V.
    assert!((m.voltage(1) - 2.0).abs() < 1e-3, "{}", m.voltage(1));
}

#[test]
fn un_paso_maximo_que_una_isla_rechaza_no_cambia_ninguna() {
    // Dos islas en orden: la de una cuadrada de 1 kHz sobre un RC con el puente de entrada (acepta 0.1 s) y, después de ella
    // por la lógica, la del puente de salida con una cuadrada de 10 kHz y ciclo de 1 % en serie (no acepta 0.1 s: su tramo de
    // 1 µs cambiaría más de 10,000 veces por paso). El cambio se rechaza entero: la primera isla sigue con su paso de antes.
    let json = r#"{"nodes":6,"digital_nets":2,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":1000}},
        {"type":"ADC","p":1,"n":0,"out":0,"in_low":1.5,"in_high":3.5},
        {"type":"R","a":1,"b":2,"ohms":1000},
        {"type":"C","a":2,"b":0,"farads":1e-7},
        {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":5e-9,"fall_delay":5e-9},
        {"type":"DAC","input":1,"out":3,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":7e-9,"t_fall":7e-9},
        {"type":"R","a":3,"b":4,"ohms":1000},
        {"type":"V","a":4,"b":0,"wave":{"kind":"square","low":0,"high":1,"freq":10000,"duty":0.01}}]}"#;
    let voltaje = |cambiar: bool| {
        let mut m = kirchi_engine::Mixto::new(Netlist::from_json(json).unwrap(), 1e-7).unwrap();
        if cambiar {
            assert!(m.set_max_step(1e-1).is_err());
        }
        m.advance_to(2.3e-3, u32::MAX).unwrap();
        m.voltage(2)
    };
    assert_eq!(voltaje(false), voltaje(true));
}

#[test]
fn las_resistencias_y_los_fusibles_cambiados_en_caliente_o_fundidos_entran_al_paso_siguiente() {
    // Una isla no lineal (un diodo) con resistencias y un fusible: las estampas de los elementos fijos se guardan entre
    // iteraciones, y cambiar uno en caliente, reponerlo o fundirlo debe cambiar la solución del paso siguiente.
    let json = r#"{"nodes":4,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
        {"type":"R","a":1,"b":2,"ohms":1000},
        {"type":"D","a":2,"b":0,"is":1e-14,"n":1},
        {"type":"FUSE","a":1,"b":3,"ohms":1,"inom":0.5,"ifusion":1,"tau":0.001},
        {"type":"R","a":3,"b":0,"ohms":1000}]}"#;
    for denso in [true, false] {
        let net = Netlist::from_json(json).unwrap();
        let tipo = if denso { kirchi_engine::transient::SolverKind::Dense } else { kirchi_engine::transient::SolverKind::Sparse };
        let mut tr = Transient::with_solver(net, 1e-5, tipo).unwrap();
        tr.advance_to(1e-3, u32::MAX).unwrap();
        let i_diodo = tr.readings()[1].i;
        assert!((tr.voltage(3) - 5.0 * 1000.0 / 1001.0).abs() < 1e-6);
        tr.set_element(1, Element::R { a: 1, b: 2, ohms: 100.0 }).unwrap();
        tr.advance_to(2e-3, u32::MAX).unwrap();
        assert!(tr.readings()[1].i > 8.0 * i_diodo, "la resistencia nueva no entró: {} contra {i_diodo}", tr.readings()[1].i);
        // La carga del fusible baja a 1 Ω: 2.5 A sobre 1 A de fusión, se funde y la salida queda abierta.
        tr.set_element(4, Element::R { a: 3, b: 0, ohms: 1.0 }).unwrap();
        tr.advance_to(10e-3, u32::MAX).unwrap();
        assert_eq!(tr.readings()[3].estado, 1.0);
        assert!(tr.voltage(3).abs() < 1e-6, "fundido: {}", tr.voltage(3));
        tr.reset_element(3).unwrap();
        tr.set_element(4, Element::R { a: 3, b: 0, ohms: 1000.0 }).unwrap();
        tr.advance_to(11e-3, u32::MAX).unwrap();
        assert!((tr.voltage(3) - 5.0 * 1000.0 / 1001.0).abs() < 1e-6, "repuesto: {}", tr.voltage(3));
    }
}

fn escalera(low: f64, high: f64, freq: f64, steps: u32, phase: f64) -> Wave {
    Wave::Stair { low, high, freq, steps, phase, continua: true }
}

#[test]
fn la_escalera_sube_en_niveles_iguales_y_vuelve_al_principio() {
    // Cuatro pasos de 0 a 3 V en 4 ms: 0, 1, 2 y 3 V.
    let w = escalera(0.0, 3.0, 250.0, 4, 0.0);
    for (x, v) in [(0.5e-3, 0.0), (1.5e-3, 1.0), (2.5e-3, 2.0), (3.5e-3, 3.0), (4.5e-3, 0.0), (6.5e-3, 2.0)] {
        assert!((w.at(x) - v).abs() < 1e-12, "escalera en {x}: {}", w.at(x));
    }
    // Los saltos son puntos de quiebre.
    assert!((w.next_edge(0.0) - 1e-3).abs() < 1e-12);
    assert!((w.next_edge(1.2e-3) - 2e-3).abs() < 1e-12);
    assert!((w.next_edge(3.5e-3) - 4e-3).abs() < 1e-12);
}

#[test]
fn la_escalera_con_fase_arranca_a_mitad_del_ciclo() {
    // Fase 0.5: en t = 0 va en el tercer nivel de cuatro.
    let w = escalera(0.0, 3.0, 250.0, 4, 0.5);
    assert!((w.at(0.1e-3) - 2.0).abs() < 1e-12);
    assert!((w.at(1.1e-3) - 3.0).abs() < 1e-12);
    assert!((w.at(2.1e-3) - 0.0).abs() < 1e-12);
}

#[test]
fn la_escalera_se_simula_y_se_valida() {
    let json = RC.replace("ONDA", r#"{"kind":"stair","low":0,"high":3,"freq":250,"steps":4,"continua":true}"#);
    let mut tr = Transient::new(Netlist::from_json(&json).unwrap(), 1e-5).unwrap();
    tr.advance_to(2.5e-3, u32::MAX).unwrap();
    assert!((tr.voltage(1) - 2.0).abs() < 0.05, "{}", tr.voltage(1));
    assert!(invalido(r#"{"kind":"stair","low":0,"high":3,"freq":250,"steps":1}"#, 1e-5).contains("fuera del rango"));
    assert!(invalido(r#"{"kind":"stair","low":0,"high":3,"freq":250,"steps":4,"phase":1}"#, 1e-5).contains("fuera del rango"));
}
