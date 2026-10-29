//! Una isla sin dinámica que no influye en otra salta entre eventos y puede ir adelante de las islas con dinámica: sus lecturas
//! deben ser las de su circuito en `time()`, aunque `advance_to` salte mucho o devuelva el control antes de la meta.

use kirchi_engine::{Mixto, Netlist};

/// Un reloj de 1 kHz (isla con dinámica, con un RC para que tenga pasos) maneja un inversor y su puente de salida carga un
/// divisor (nodo 4); aparte, un divisor de 10 V con dos resistencias de 1 kΩ (nodo 6) que nada toca.
const CIRCUITO: &str = r#"{"nodes":7,"digital_nets":2,"elements":[
    {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":1000}},
    {"type":"R","a":1,"b":2,"ohms":1000},
    {"type":"C","a":2,"b":0,"farads":1e-8},
    {"type":"ADC","p":2,"n":0,"out":0,"in_low":1.5,"in_high":3.5},
    {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":5e-9,"fall_delay":5e-9},
    {"type":"DAC","input":1,"out":3,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":7e-9,"t_fall":7e-9},
    {"type":"R","a":3,"b":4,"ohms":1000},
    {"type":"R","a":4,"b":0,"ohms":1000},
    {"type":"V","a":5,"b":0,"wave":{"kind":"dc","v":10}},
    {"type":"R","a":5,"b":6,"ohms":1000},
    {"type":"R","a":6,"b":0,"ohms":1000}]}"#;

fn mixto() -> Mixto {
    Mixto::new(Netlist::from_json(CIRCUITO).unwrap(), 1e-5).unwrap()
}

#[test]
fn saltos_grandes_y_chicos_dan_las_mismas_lecturas() {
    let (mut grande, mut chico) = (mixto(), mixto());
    assert!(grande.islas() >= 3, "{} islas", grande.islas());
    for k in 1..=8 {
        let t = k as f64 * 0.25e-3 + 0.13;
        while grande.time() < t - 1e-12 {
            grande.advance_to(t, u32::MAX).unwrap();
        }
        while chico.time() < t - 1e-12 {
            chico.advance_to((chico.time() + 1e-4).min(t), u32::MAX).unwrap();
        }
        for n in [2, 4, 6] {
            assert!((grande.voltage(n) - chico.voltage(n)).abs() < 1e-3, "t = {t}, nodo {n}: {} contra {}", grande.voltage(n), chico.voltage(n));
        }
    }
}

#[test]
fn un_cambio_en_caliente_en_una_isla_quieta_se_ve_en_cuanto_se_avanza() {
    // Una meta lejana con pocos pasos por llamada (como el worker): las islas con dinámica quedan atrás de la meta.
    let mut m = mixto();
    m.advance_to(5.0, 200).unwrap();
    let ahora = m.time();
    assert!(ahora < 5.0, "t = {ahora}");
    assert!((m.voltage(6) - 5.0).abs() < 1e-9, "divisor en {}", m.voltage(6));
    // La resistencia de arriba del divisor pasa a 3 kΩ: 2.5 V. Un avance corto desde `time()` ya lo muestra.
    m.set_resistance(9, 3000.0).unwrap();
    let meta = m.time() + 1e-4;
    while m.time() < meta - 1e-12 {
        m.advance_to(meta, 200).unwrap();
    }
    assert!((m.voltage(6) - 2.5).abs() < 1e-6, "en t = {} el divisor sigue en {} (el de la isla va en {:?})", m.time(), m.voltage(6), m.tiempos_de_islas());
}

#[test]
fn el_promedio_de_una_isla_quieta_cuenta_el_cambio_desde_que_llega() {
    // 5 V hasta `time()` y 2.5 V desde ahí hasta 2 `time()`: el promedio en la isla del divisor es 3.75 V.
    let mut m = mixto();
    m.activar_promedios();
    m.advance_to(5.0, 200).unwrap();
    let t1 = m.time();
    m.set_resistance(9, 3000.0).unwrap();
    while m.time() < 2.0 * t1 - 1e-12 {
        m.advance_to(2.0 * t1, 200).unwrap();
    }
    let (mut v, mut i) = (Vec::new(), Vec::new());
    m.promedios_into(&mut v, &mut i);
    let isla = m.tiempos_de_islas()[2];
    let esperado = (5.0 * t1 + 2.5 * (isla - t1)) / isla;
    assert!((v[6] - esperado).abs() < 1e-6, "promedio {} contra {esperado} (cambio en {t1}, isla en {isla})", v[6]);
}

#[test]
fn un_cambio_de_canal_para_ahora_no_llega_tarde_a_una_isla_quieta_adelantada() {
    // El divisor de arriba lo maneja una fuente EXT: con la isla adelantada, un cambio para `time()` se aplica en `time()`.
    let json = CIRCUITO.replace(r#"{"type":"V","a":5,"b":0,"wave":{"kind":"dc","v":10}}"#, r#"{"type":"EXT","a":5,"b":0,"modo":"v","canal":0,"k":1.0,"c":0.0}"#).replace(r#""digital_nets":2,"#, r#""digital_nets":2,"canales":[{"inicial":10.0}],"#);
    let mut m = Mixto::new(Netlist::from_json(&json).unwrap(), 1e-5).unwrap();
    m.advance_to(5.0, 200).unwrap();
    let ahora = m.time();
    assert!(m.tiempos_de_islas().iter().any(|&t| t > ahora + 1e-3), "{:?}", m.tiempos_de_islas());
    m.poner_valor(0, ahora, 4.0).unwrap();
    assert_eq!(m.tardios(), 0);
    let meta = ahora + 1e-4;
    while m.time() < meta - 1e-12 {
        m.advance_to(meta, 200).unwrap();
    }
    assert!((m.voltage(6) - 2.0).abs() < 1e-9, "v = {}", m.voltage(6));
}
