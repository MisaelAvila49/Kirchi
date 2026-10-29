//! Puente de valores: canales que mueve el exterior, elementos `EXT` que los leen y lectores con muestras en instantes exactos.
use kirchi_engine::mixto::Muestra;
use kirchi_engine::{Element, Mixto, Netlist};
use serde_json::{json, Value};

fn mixto(v: Value, h: f64) -> Mixto {
    Mixto::new(Netlist::from_json(&v.to_string()).unwrap(), h).unwrap()
}

fn tomar(m: &mut Mixto) -> Vec<Muestra> {
    let mut out = Vec::new();
    m.tomar_muestras(&mut out);
    out
}

/// Fuente EXT de voltaje sobre un divisor de 1 kΩ y 1 kΩ: el nodo 2 vale la mitad del canal. Sin capacitores, la isla no tiene dinámica.
fn divisor(inicial: f64, forma: &str) -> Value {
    json!({"nodes":3,"canales":[{"inicial":inicial,"forma":forma}],"lectores":[{"kind":"v","p":2,"n":0},{"kind":"i","elemento":1}],"elements":[
        {"type":"EXT","a":1,"b":0,"modo":"v","canal":0,"k":1.0,"c":0.0},
        {"type":"R","a":1,"b":2,"ohms":1000},
        {"type":"R","a":2,"b":0,"ohms":1000}]})
}

/// La misma fuente sobre un RC de 1 ms: la isla sí tiene dinámica.
fn rc(inicial: f64) -> Value {
    json!({"nodes":3,"canales":[{"inicial":inicial}],"lectores":[{"kind":"v","p":2,"n":0}],"elements":[
        {"type":"EXT","a":1,"b":0,"modo":"v","canal":0,"k":1.0,"c":0.0},
        {"type":"R","a":1,"b":2,"ohms":1000},
        {"type":"C","a":2,"b":0,"farads":1e-6}]})
}

#[test]
fn un_cambio_en_t_llega_exacto_en_una_isla_sin_dinamica_aunque_se_avance_de_golpe() {
    let mut m = mixto(divisor(1.0, "escalon"), 1e-5);
    m.poner_valor(0, 1e-3, 5.0).unwrap();
    for t in [0.5e-3, 0.999e-3, 1.001e-3, 5e-3] {
        m.pedir_muestra(0, t).unwrap();
    }
    m.advance_to(10e-3, u32::MAX).unwrap();
    let v: Vec<f64> = tomar(&mut m).iter().map(|s| s.v).collect();
    assert_eq!(v.len(), 4);
    assert!((v[0] - 0.5).abs() < 1e-9 && (v[1] - 0.5).abs() < 1e-9, "{v:?}");
    assert!((v[2] - 2.5).abs() < 1e-9 && (v[3] - 2.5).abs() < 1e-9, "{v:?}");
}

#[test]
fn el_paso_cae_en_el_cambio_y_el_valor_nuevo_empieza_justo_despues() {
    let mut m = mixto(divisor(1.0, "escalon"), 1e-5);
    m.poner_valor(0, 1e-3, 5.0).unwrap();
    m.advance_to(1e-3, u32::MAX).unwrap();
    assert!((m.time() - 1e-3).abs() < 1e-12, "t = {}", m.time());
    // El paso que termina en el cambio todavía es del valor de antes.
    assert!((m.leer_ahora(0).1 - 0.5).abs() < 1e-9);
    m.advance_to(1e-3 + 1e-6, u32::MAX).unwrap();
    assert!((m.leer_ahora(0).1 - 2.5).abs() < 1e-9);
}

#[test]
fn un_cambio_en_t_llega_exacto_en_una_isla_con_dinamica() {
    // Escalón de 0 a 5 V en 1 ms sobre un RC de 1 ms: v(t) = 5 (1 − e^(−(t − 1 ms)/τ)).
    let mut m = mixto(rc(0.0), 1e-5);
    m.poner_valor(0, 1e-3, 5.0).unwrap();
    for t in [0.9e-3, 1e-3 + 1e-3, 1e-3 + 3e-3] {
        m.pedir_muestra(0, t).unwrap();
    }
    m.advance_to(6e-3, u32::MAX).unwrap();
    let s = tomar(&mut m);
    assert!(s[0].v.abs() < 1e-9, "antes del cambio: {}", s[0].v);
    for (m, t) in s[1..].iter().zip([1.0, 3.0]) {
        let esperado = 5.0 * (1.0 - (-t as f64).exp());
        assert!((m.v - esperado).abs() < 5e-3, "t = {}: {} contra {esperado}", m.t, m.v);
    }
}

#[test]
fn la_rampa_sigue_la_recta_del_valor_inicial_al_nuevo() {
    let mut m = mixto(divisor(0.0, "rampa"), 1e-4);
    m.poner_valor(0, 1e-3, 5.0).unwrap();
    for t in [0.25e-3, 0.5e-3, 0.75e-3, 2e-3] {
        m.pedir_muestra(0, t).unwrap();
    }
    m.advance_to(3e-3, u32::MAX).unwrap();
    let s = tomar(&mut m);
    for (m, esperado) in s.iter().zip([0.625, 1.25, 1.875, 2.5]) {
        assert!((m.v - esperado).abs() < 1e-6, "t = {}: {} contra {esperado}", m.t, m.v);
    }
    // Un segundo cambio parte del primero: de 5 V en 1 ms a 1 V en 3 ms.
    let mut m = mixto(divisor(0.0, "rampa"), 1e-4);
    m.poner_valor(0, 1e-3, 5.0).unwrap();
    m.poner_valor(0, 3e-3, 1.0).unwrap();
    m.pedir_muestra(0, 2e-3).unwrap();
    m.advance_to(4e-3, u32::MAX).unwrap();
    let s = tomar(&mut m);
    assert!((s[0].v - 1.5).abs() < 1e-6, "{}", s[0].v);
}

#[test]
fn un_cambio_tardio_se_aplica_en_el_tiempo_de_la_isla_y_se_cuenta() {
    let mut m = mixto(divisor(1.0, "escalon"), 1e-5);
    m.advance_to(2e-3, u32::MAX).unwrap();
    m.poner_valor(0, 1e-3, 5.0).unwrap();
    assert_eq!(m.tardios(), 1);
    // Un cambio a tiempo no suma.
    m.poner_valor(0, 3e-3, 7.0).unwrap();
    assert_eq!(m.tardios(), 1);
    // El tardío vale desde el tiempo de la isla: la mitad de 5 V un poco después de 2 ms, y no antes.
    m.pedir_muestra(0, 2e-3 + 1e-6).unwrap();
    m.pedir_muestra(0, 3e-3 + 1e-6).unwrap();
    m.advance_to(4e-3, u32::MAX).unwrap();
    let s = tomar(&mut m);
    assert!((s[0].v - 2.5).abs() < 1e-9 && (s[1].v - 3.5).abs() < 1e-9, "{s:?}");
}

/// Dos islas que leen el mismo canal: la de los LED llega lejos mientras la otra espera a un anillo de 1 ps que agota el presupuesto de eventos.
/// La que llega lejos lleva un capacitor: una isla sin dinámica regresaría al instante del cambio (ver `islas_quietas.rs`).
#[test]
fn dos_islas_con_tiempos_distintos_aplican_cada_una_en_el_suyo() {
    let mut m = mixto(
        json!({"nodes":6,"digital_nets":3,"canales":[{"inicial":0.0}],"elements":[
            {"type":"EXT","a":1,"b":0,"modo":"v","canal":0,"k":1.0,"c":0.0},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"R","a":2,"b":0,"ohms":1000},
            {"type":"C","a":2,"b":0,"farads":1e-9},
            {"type":"GATE","fn":"not","inputs":[2],"output":0,"rise_delay":1e-12,"fall_delay":1e-12},
            {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":1e-12,"fall_delay":1e-12},
            {"type":"GATE","fn":"not","inputs":[1],"output":2,"rise_delay":1e-12,"fall_delay":1e-12},
            {"type":"DAC","input":0,"out":3,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":1e-9,"t_fall":1e-9},
            {"type":"R","a":3,"b":4,"ohms":100000},
            {"type":"EXT","a":4,"b":0,"modo":"v","canal":0,"k":1.0,"c":0.0},
            {"type":"R","a":4,"b":5,"ohms":1000},
            {"type":"R","a":5,"b":0,"ohms":1000}]}),
        1e-5,
    );
    assert!(m.islas() >= 2);
    m.set_event_budget(10_000);
    m.advance_to(1e-3, u32::MAX).unwrap();
    let atras = m.time();
    assert!(atras < 1e-6, "t = {atras}");
    let rapida = m.tiempo_de_nodo(2);
    assert!(rapida > 5e-4, "la isla sin puentes llegó a {rapida}");
    // Cambio en 5e-4: tarde para la isla que llegó a 1 ms y a tiempo para la que va detrás.
    m.poner_valor(0, 5e-4, 4.0).unwrap();
    assert_eq!(m.tardios(), 1);
    m.advance_to(2e-3, u32::MAX).unwrap();
    assert!((m.voltage(2) - 2.0).abs() < 1e-9, "v = {}", m.voltage(2));
}

#[test]
fn la_muestra_en_t_es_la_solucion_analitica_de_un_rc() {
    // Fuente fija de 5 V sobre el RC de 1 ms, descargado en t = 0.
    let mut m = mixto(rc(5.0), 1e-5);
    let instantes = [0.123e-3, 0.7e-3, 1.7e-3, 3.1e-3];
    for t in instantes {
        m.pedir_muestra(0, t).unwrap();
    }
    m.advance_to(5e-3, u32::MAX).unwrap();
    let s = tomar(&mut m);
    assert_eq!(s.len(), 4);
    for (m, t) in s.iter().zip(instantes) {
        let esperado = 5.0 * (1.0 - (-t / 1e-3_f64).exp());
        assert_eq!(m.t, t);
        assert!((m.v - esperado).abs() < 5e-3, "t = {t}: {} contra {esperado}", m.v);
    }
}

#[test]
fn una_muestra_y_un_cambio_en_el_mismo_instante_ven_el_valor_nuevo() {
    for muestra_primero in [false, true] {
        let mut m = mixto(divisor(1.0, "escalon"), 1e-5);
        if muestra_primero {
            m.pedir_muestra(0, 1e-3).unwrap();
            m.poner_valor(0, 1e-3, 5.0).unwrap();
        } else {
            m.poner_valor(0, 1e-3, 5.0).unwrap();
            m.pedir_muestra(0, 1e-3).unwrap();
        }
        m.pedir_muestra(0, 0.5e-3).unwrap();
        m.advance_to(1e-3, u32::MAX).unwrap();
        let s = tomar(&mut m);
        assert_eq!(s.len(), 2, "{s:?}");
        assert!((s[0].v - 0.5).abs() < 1e-9 && s[0].t == 0.5e-3);
        assert!((s[1].v - 2.5).abs() < 1e-9 && s[1].t == 1e-3, "{s:?}");
    }
}

#[test]
fn una_muestra_pedida_en_el_pasado_responde_con_la_lectura_vigente_y_el_tiempo_de_la_isla() {
    let mut m = mixto(divisor(1.0, "escalon"), 1e-5);
    m.advance_to(2e-3, u32::MAX).unwrap();
    m.pedir_muestra(0, 1e-3).unwrap();
    let s = tomar(&mut m);
    assert_eq!(s.len(), 1);
    assert!((s[0].t - 2e-3).abs() < 1e-12 && (s[0].v - 0.5).abs() < 1e-9, "{s:?}");
}

#[test]
fn el_lector_de_corriente_y_leer_ahora_no_programan_nada() {
    let mut m = mixto(divisor(2.0, "escalon"), 1e-5);
    m.pedir_muestra(1, 1e-3).unwrap();
    m.advance_to(2e-3, u32::MAX).unwrap();
    let s = tomar(&mut m);
    // 2 V sobre 2 kΩ: 1 mA de a hacia b por dentro de la primera resistencia.
    assert_eq!(s[0].lector, 1);
    assert!((s[0].v - 1e-3).abs() < 1e-12, "{}", s[0].v);
    let (t, v) = m.leer_ahora(0);
    assert!((t - 2e-3).abs() < 1e-12 && (v - 1.0).abs() < 1e-9);
    assert!(tomar(&mut m).is_empty());
    assert!(m.leer_ahora(9).1.is_nan());
}

#[test]
fn retroceder_y_avanzar_con_cambios_en_cola_dan_lo_mismo_bit_a_bit() {
    let armar = || {
        let mut m = mixto(rc(0.0), 1e-5);
        m.poner_valor(0, 1e-3, 5.0).unwrap();
        m.poner_valor(0, 2.5e-3, 2.0).unwrap();
        m.pedir_muestra(0, 1.5e-3).unwrap();
        m.pedir_muestra(0, 3e-3).unwrap();
        m
    };
    let mut m = armar();
    m.advance_to(0.5e-3, u32::MAX).unwrap();
    m.guardar_estado();
    m.advance_to(4e-3, u32::MAX).unwrap();
    let primera = (m.voltages(), tomar(&mut m));
    assert_eq!(primera.1.len(), 2);
    assert_eq!(m.restaurar_estado(), Some(0.5e-3));
    assert!(tomar(&mut m).is_empty());
    m.advance_to(4e-3, u32::MAX).unwrap();
    let segunda = (m.voltages(), tomar(&mut m));
    assert_eq!(primera, segunda);
    // Escribir en un canal no descarta los estados guardados; al volver, el canal vuelve a lo que tenía al guardar.
    let mut m = armar();
    m.advance_to(0.5e-3, u32::MAX).unwrap();
    m.guardar_estado();
    m.advance_to(1.2e-3, u32::MAX).unwrap();
    m.poner_valor(0, 1.3e-3, 9.0).unwrap();
    assert_eq!(m.estados_guardados().0, 1);
    m.restaurar_estado().unwrap();
    assert_eq!(m.valor_canal(0), 0.0);
    m.advance_to(2e-3, u32::MAX).unwrap();
    assert!(m.voltage(2) < 5.0 && m.voltage(2) > 0.5);
}

#[test]
fn un_canal_alimenta_la_isla_de_un_dac_junto_a_los_cambios_del_estado_logico() {
    // Un DAC de 5 V con 55 Ω y una corriente externa de 1 mA al nodo 2: v2 = (Vdac / 1055 + I) / (1 / 1055 + 1 / 1000).
    let mut m = mixto(
        json!({"nodes":3,"digital_nets":1,"canales":[{"inicial":0.0}],"elements":[
            {"type":"LOGIC","out":0,"value":0},
            {"type":"DAC","input":0,"out":1,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":7e-9,"t_fall":7e-9},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"R","a":2,"b":0,"ohms":1000},
            {"type":"EXT","a":0,"b":2,"modo":"i","canal":0,"k":1.0,"c":0.0}]}),
        1e-6,
    );
    let esperado = |vdac: f64, i: f64| (vdac / 1055.0 + i) / (1.0 / 1055.0 + 1.0 / 1000.0);
    m.advance_to(1e-4, u32::MAX).unwrap();
    assert!((m.voltage(2) - esperado(0.0, 0.0)).abs() < 1e-6, "v = {}", m.voltage(2));
    m.poner_valor(0, 2e-4, 1e-3).unwrap();
    m.advance_to(3e-4, u32::MAX).unwrap();
    assert!((m.voltage(2) - esperado(0.0, 1e-3)).abs() < 1e-6, "v = {}", m.voltage(2));
    m.set_element(0, Element::Logic { out: 0, value: 1 }).unwrap();
    m.poner_valor(0, 4e-4, -1e-3).unwrap();
    m.advance_to(5e-4, u32::MAX).unwrap();
    assert!((m.voltage(2) - esperado(5.0, -1e-3)).abs() < 1e-6, "v = {}", m.voltage(2));
    assert_eq!(m.tardios(), 0);
}

#[test]
fn un_millon_de_cambios_en_un_segundo_no_atascan_el_motor() {
    let mut m = mixto(divisor(0.0, "escalon"), 1e-4);
    let por_tanda = 1000;
    let tandas = 1000;
    for tanda in 0..tandas {
        for k in 0..por_tanda {
            let n = tanda * por_tanda + k;
            m.poner_valor(0, (n as f64 + 1.0) * 1e-6, (n % 7) as f64).unwrap();
        }
        let fin = (tanda + 1) as f64 * por_tanda as f64 * 1e-6;
        m.advance_to(fin, u32::MAX).unwrap();
        assert!((m.time() - fin).abs() < 1e-9, "t = {} contra {fin}", m.time());
    }
    // En t = 1 s el paso que termina en el último cambio todavía es del anterior (n = 999,998), de 6 V.
    assert!((m.voltage(2) - 0.5 * ((tandas * por_tanda - 2) % 7) as f64).abs() < 1e-9, "v = {}", m.voltage(2));
}

#[test]
fn se_rechaza_lo_que_no_es_un_numero_un_canal_un_lector_o_una_cola_de_mas() {
    let mut m = mixto(divisor(0.0, "escalon"), 1e-4);
    assert!(m.poner_valor(0, 1e-3, f64::NAN).is_err());
    assert!(m.poner_valor(0, 1e-3, f64::INFINITY).is_err());
    assert!(m.poner_valor(0, f64::NAN, 1.0).is_err());
    assert!(m.poner_valor(1, 1e-3, 1.0).is_err());
    assert!(m.pedir_muestra(0, f64::NAN).is_err());
    assert!(m.pedir_muestra(5, 1e-3).is_err());
    assert!(m.valor_canal(3).is_nan());
    // El rechazo no deja rastro: el canal sigue en su valor.
    assert_eq!(m.valor_canal(0), 0.0);
    for k in 0..4096 {
        m.poner_valor(0, 1.0 + k as f64, 1.0).unwrap();
    }
    assert!(m.poner_valor(0, 1e4, 1.0).is_err());
    for k in 0..4096 {
        m.pedir_muestra(0, 1.0 + k as f64).unwrap();
    }
    assert!(m.pedir_muestra(0, 1e4).is_err());
}
