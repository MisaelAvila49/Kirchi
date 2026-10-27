//! Salidas de tres estados: la habilitación pone la salida en Z y dos salidas en la misma red se resuelven (0 con Z es 0, 1 con
//! Z es 1, 0 con 1 es X y avisa).
use kirchi_engine::digital::Nivel::{self, Cero, Uno, X, Z};
use kirchi_engine::{Element, Mixto, Netlist};

/// Redes: 0 dato A, 1 OE̅ A, 2 dato B, 3 OE̅ B, 4 el bus. Elementos 0 a 3: los estados lógicos; 4 y 5: los dos búferes.
const BUS: &str = r#"{"nodes":1,"digital_nets":5,"elements":[
    {"type":"LOGIC","out":0,"value":0},
    {"type":"LOGIC","out":1,"value":1},
    {"type":"LOGIC","out":2,"value":0},
    {"type":"LOGIC","out":3,"value":1},
    {"type":"GATE","fn":"buf","inputs":[0],"output":4,"rise_delay":5e-9,"fall_delay":5e-9,"enable":1,"enable_bajo":true},
    {"type":"GATE","fn":"buf","inputs":[2],"output":4,"rise_delay":5e-9,"fall_delay":5e-9,"enable":3,"enable_bajo":true}]}"#;

fn bus() -> Mixto {
    Mixto::new(Netlist::from_json(BUS).unwrap(), 1e-6).unwrap()
}

/// Pone un estado lógico y deja pasar el retardo de los búferes.
fn poner(m: &mut Mixto, red: usize, valor: u8) {
    m.set_element(red, Element::Logic { out: red, value: valor }).unwrap();
    let t = m.time() + 1e-6;
    m.advance_to(t, u32::MAX).unwrap();
}

/// Con (dato A, OE̅ A, dato B, OE̅ B) y el nivel del bus.
fn nivel_con(a: u8, oe_a: u8, b: u8, oe_b: u8) -> (Nivel, Vec<u32>) {
    let mut m = bus();
    // Los estados vuelven a su valor de arranque (0, 1, 0, 1); se cambia solo lo que difiere.
    for (red, v, base) in [(0, a, 0), (1, oe_a, 1), (2, b, 0), (3, oe_b, 1)] {
        if v != base {
            poner(&mut m, red, v);
        }
    }
    (m.nivel(4), m.tomar_conflictos())
}

#[test]
fn con_las_dos_deshabilitadas_el_bus_queda_en_z() {
    assert_eq!(nivel_con(0, 1, 0, 1).0, Z);
}

#[test]
fn cero_con_z_es_cero_y_uno_con_z_es_uno() {
    assert_eq!(nivel_con(0, 0, 0, 1).0, Cero);
    assert_eq!(nivel_con(1, 0, 0, 1).0, Uno);
    assert_eq!(nivel_con(0, 1, 0, 0).0, Cero);
    assert_eq!(nivel_con(0, 1, 1, 0).0, Uno);
}

#[test]
fn dos_salidas_iguales_se_mantienen_sin_conflicto() {
    assert_eq!(nivel_con(1, 0, 1, 0), (Uno, vec![]));
    assert_eq!(nivel_con(0, 0, 0, 0), (Cero, vec![]));
}

#[test]
fn cero_con_uno_es_x_y_el_conflicto_se_avisa_una_vez() {
    let mut m = bus();
    poner(&mut m, 1, 0);
    poner(&mut m, 3, 0);
    assert_eq!(m.nivel(4), Cero);
    assert!(m.tomar_conflictos().is_empty());
    poner(&mut m, 2, 1);
    assert_eq!(m.nivel(4), X);
    assert_eq!(m.tomar_conflictos(), vec![4]);
    // Mientras dura no se repite; al deshabilitar una sale del conflicto y al volver a entrar avisa de nuevo.
    assert!(m.tomar_conflictos().is_empty());
    poner(&mut m, 3, 1);
    assert_eq!(m.nivel(4), Cero);
    poner(&mut m, 3, 0);
    assert_eq!(m.nivel(4), X);
    assert_eq!(m.tomar_conflictos(), vec![4]);
}

#[test]
fn la_habilitacion_en_x_deja_la_salida_en_x() {
    let mut m = Mixto::new(
        Netlist::from_json(r#"{"nodes":1,"digital_nets":3,"elements":[
            {"type":"LOGIC","out":0,"value":1},
            {"type":"GATE","fn":"buf","inputs":[0],"output":2,"rise_delay":1e-9,"fall_delay":1e-9,"enable":1}]}"#)
        .unwrap(),
        1e-6,
    )
    .unwrap();
    // La red 1 nadie la maneja: queda en Z, que una entrada CMOS lee como X.
    m.advance_to(1e-6, u32::MAX).unwrap();
    assert_eq!(m.nivel(2), X);
}

#[test]
fn con_la_habilitacion_activa_en_alto_el_nivel_alto_la_abre() {
    let mut m = Mixto::new(
        Netlist::from_json(r#"{"nodes":1,"digital_nets":3,"elements":[
            {"type":"LOGIC","out":0,"value":1},
            {"type":"LOGIC","out":1,"value":0},
            {"type":"GATE","fn":"not","inputs":[0],"output":2,"rise_delay":1e-9,"fall_delay":1e-9,"enable":1}]}"#)
        .unwrap(),
        1e-6,
    )
    .unwrap();
    assert_eq!(m.nivel(2), Z);
    poner(&mut m, 1, 1);
    assert_eq!(m.nivel(2), Cero);
}

#[test]
fn dos_compuertas_sin_habilitacion_en_la_misma_red_se_rechazan() {
    let json = r#"{"nodes":1,"digital_nets":3,"elements":[
        {"type":"LOGIC","out":0,"value":0},
        {"type":"GATE","fn":"not","inputs":[0],"output":2,"rise_delay":1e-9,"fall_delay":1e-9},
        {"type":"GATE","fn":"not","inputs":[0],"output":2,"rise_delay":1e-9,"fall_delay":1e-9}]}"#;
    let e = Netlist::from_json(json).unwrap_err();
    assert!(e.to_string().contains("ya la maneja"), "{e}");
}

#[test]
fn una_salida_deshabilitada_sobre_un_nodo_analogico_lo_suelta() {
    // 5 V a 1 kΩ al nodo 2; el puente de salida (55 Ω) lo lleva a 0 V cuando el búfer maneja 0 y lo suelta en Z.
    let json = r#"{"nodes":3,"digital_nets":3,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
        {"type":"R","a":1,"b":2,"ohms":1000},
        {"type":"LOGIC","out":0,"value":0},
        {"type":"LOGIC","out":1,"value":1},
        {"type":"GATE","fn":"buf","inputs":[0],"output":2,"rise_delay":1e-9,"fall_delay":1e-9,"enable":1,"enable_bajo":true},
        {"type":"DAC","input":2,"out":2,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":6e-9,"t_fall":6e-9,"z":true}]}"#;
    let mut m = Mixto::new(Netlist::from_json(json).unwrap(), 1e-7).unwrap();
    m.advance_to(2e-6, u32::MAX).unwrap();
    assert_eq!(m.nivel(2), Z);
    assert!((m.voltage(2) - 5.0).abs() < 1e-3, "suelta: {}", m.voltage(2));
    m.set_element(3, Element::Logic { out: 1, value: 0 }).unwrap();
    m.advance_to(4e-6, u32::MAX).unwrap();
    assert_eq!(m.nivel(2), Cero);
    assert!((m.voltage(2) - 5.0 * 55.0 / 1055.0).abs() < 1e-3, "maneja 0: {}", m.voltage(2));
    m.set_element(3, Element::Logic { out: 1, value: 1 }).unwrap();
    m.advance_to(6e-6, u32::MAX).unwrap();
    assert!((m.voltage(2) - 5.0).abs() < 1e-3, "suelta otra vez: {}", m.voltage(2));
}
