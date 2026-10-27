//! Un transceptor de un bit como tabla: sus patillas A y B son entradas y salidas a la vez, y cada lado puede estar manejado
//! por otro dispositivo. Las salidas del lado que escucha quedan en Z, así que comparten red con quien lo maneja.
use kirchi_engine::digital::Nivel::{self, Cero, Uno, X, Z};
use kirchi_engine::{Element, Mixto, Netlist};
use std::time::{Duration, Instant};

const DIR: usize = 0;
const OE: usize = 1;
const DATO_A: usize = 2;
const HAB_A: usize = 3;
const DATO_B: usize = 4;
const HAB_B: usize = 5;
const A: usize = 6;
const B: usize = 7;

/// Fila = DIR, OE̅, A, B (DIR es el bit más significativo). Con OE̅ en 0, DIR = 1 lleva A a B y DIR = 0 lleva B a A; el lado
/// que escucha queda en Z (2) y cada salida solo lee la patilla del otro lado.
fn tabla() -> String {
    let filas: Vec<String> = (0..16u32)
        .map(|i| {
            let (dir, oe, a, b) = (i >> 3 & 1, i >> 2 & 1, i >> 1 & 1, i & 1);
            let sal_a = if oe == 0 && dir == 0 { b } else { 2 };
            let sal_b = if oe == 0 && dir == 1 { a } else { 2 };
            (sal_a | sal_b << 2).to_string()
        })
        .collect();
    format!("[{}]", filas.join(","))
}

/// DIR = 1 y OE̅ = 0 (A hacia B), el lado A manejado con un 1 y el lado B sin manejar. Cada lado lo maneja un estado lógico a
/// través de un búfer de tres estados con habilitación activa en bajo.
fn transceptor() -> Mixto {
    let json = format!(
        r#"{{"nodes":1,"digital_nets":8,"tablas":[{}],"elements":[
        {{"type":"LOGIC","out":{DIR},"value":1}},
        {{"type":"LOGIC","out":{OE},"value":0}},
        {{"type":"LOGIC","out":{DATO_A},"value":1}},
        {{"type":"LOGIC","out":{HAB_A},"value":0}},
        {{"type":"LOGIC","out":{DATO_B},"value":0}},
        {{"type":"LOGIC","out":{HAB_B},"value":1}},
        {{"type":"GATE","fn":"buf","inputs":[{DATO_A}],"output":{A},"rise_delay":2e-9,"fall_delay":2e-9,"enable":{HAB_A},"enable_bajo":true}},
        {{"type":"GATE","fn":"buf","inputs":[{DATO_B}],"output":{B},"rise_delay":2e-9,"fall_delay":2e-9,"enable":{HAB_B},"enable_bajo":true}},
        {{"type":"LUT","comunes":[{DIR},{OE}],"rebanadas":[{{"entradas":[{A},{B}],"salidas":[{A},{B}]}}],"tabla":0,"retardos":[[5e-9,5e-9],[5e-9,5e-9]]}}]}}"#,
        tabla()
    );
    Mixto::new(Netlist::from_json(&json).unwrap(), 1e-6).unwrap()
}

/// Cambia varios estados lógicos a la vez y deja pasar `dt` segundos.
fn poner(m: &mut Mixto, cambios: &[(usize, u8)], dt: f64) {
    for &(red, v) in cambios {
        m.set_element(red, Element::Logic { out: red, value: v }).unwrap();
    }
    let t = m.time() + dt;
    m.advance_to(t, u32::MAX).unwrap();
}

fn lados(m: &Mixto) -> (Nivel, Nivel) {
    (m.nivel(A), m.nivel(B))
}

#[test]
fn con_a_hacia_b_el_lado_b_toma_el_dato_de_a() {
    let mut m = transceptor();
    m.advance_to(1e-6, u32::MAX).unwrap();
    assert_eq!(lados(&m), (Uno, Uno));
    poner(&mut m, &[(DATO_A, 0)], 1e-6);
    assert_eq!(lados(&m), (Cero, Cero));
    assert!(m.tomar_conflictos().is_empty());
}

#[test]
fn al_cambiar_la_direccion_el_dato_viaja_de_b_hacia_a() {
    let mut m = transceptor();
    m.advance_to(1e-6, u32::MAX).unwrap();
    // Se suelta el lado A, lo maneja el lado B con un 0 y se invierte DIR.
    poner(&mut m, &[(HAB_A, 1), (HAB_B, 0), (DIR, 0)], 1e-6);
    assert_eq!(lados(&m), (Cero, Cero));
    // Entre los 2 ns del búfer de B y los 5 ns del transceptor, B choca con la salida que aún no se suelta: es real.
    assert_eq!(m.tomar_conflictos(), vec![B as u32]);
    poner(&mut m, &[(DATO_B, 1)], 1e-6);
    assert_eq!(lados(&m), (Uno, Uno));
    assert!(m.tomar_conflictos().is_empty());
    // Con OE̅ en 1 el transceptor suelta los dos lados: queda lo que maneja el lado B, y A se queda sin manejar.
    poner(&mut m, &[(OE, 1)], 1e-6);
    assert_eq!(lados(&m), (Z, Uno));
}

#[test]
fn si_los_dos_lados_se_manejan_a_la_vez_hay_x_y_un_solo_aviso() {
    let mut m = transceptor();
    m.advance_to(1e-6, u32::MAX).unwrap();
    // A manejado con 1, B con 0 y DIR hacia B: la salida del transceptor (1) choca con el 0 de B.
    poner(&mut m, &[(HAB_B, 0)], 1e-6);
    assert_eq!(lados(&m), (Uno, X));
    assert_eq!(m.tomar_conflictos(), vec![B as u32]);
    poner(&mut m, &[], 10e-6);
    assert!(m.tomar_conflictos().is_empty());
    // Al quitar el manejo de B se recupera el dato de A.
    poner(&mut m, &[(HAB_B, 1)], 1e-6);
    assert_eq!(lados(&m), (Uno, Uno));
}

#[test]
fn un_pulso_de_direccion_de_1_ns_no_deja_glitch_ni_cuelga_el_motor() {
    let mut m = transceptor();
    m.advance_to(1e-6, u32::MAX).unwrap();
    let inicio = Instant::now();
    // Más corto que el retardo de 5 ns de la tabla: el retardo inercial lo absorbe.
    poner(&mut m, &[(DIR, 0)], 1e-9);
    poner(&mut m, &[(DIR, 1)], 1e-6);
    assert!(inicio.elapsed() < Duration::from_millis(250));
    assert_eq!(lados(&m), (Uno, Uno));
    assert!(m.tomar_conflictos().is_empty());
}
