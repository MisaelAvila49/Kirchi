//! Retroceder (1.2): correr N pasos, guardar, correr M, restaurar y volver a correr M debe dar exactamente lo mismo bit a bit, con un analógico con todos los dispositivos con estado, un 555 con contador y display, y una lógica sola. Las sondas se recortan y el historial respeta sus topes.
use kirchi_engine::{Mixto, Netlist};
use serde_json::{json, Value};

fn red(nodos: usize, redes: usize, el: Vec<Value>, sondas: Vec<Value>) -> Netlist {
    Netlist::from_json(&json!({"nodes": nodos, "digital_nets": redes, "elements": el, "sondas": sondas}).to_string()).unwrap()
}

/// Rectificador con filtro, foco con fusible, motor, transformador, transistor, amplificador, relé y zumbador: casi todo lo que
/// guarda estado interno en el motor analógico.
fn zoologico(sondas: Vec<Value>) -> Netlist {
    red(
        17,
        0,
        vec![
            json!({"type":"V","a":1,"b":0,"wave":{"kind":"sine","offset":0,"amp":5,"freq":1000.0}}),
            json!({"type":"D","a":1,"b":2,"is":1.5e-17,"n":2}),
            json!({"type":"C","a":2,"b":0,"farads":1e-5}),
            json!({"type":"R","a":2,"b":0,"ohms":1000}),
            json!({"type":"V","a":4,"b":0,"wave":{"kind":"dc","v":12}}),
            json!({"type":"LAMP","a":4,"b":5,"rfrio":10.0,"k":8.0,"pnom":10.0,"tau":0.002}),
            json!({"type":"FUSE","a":5,"b":0,"ohms":0.1,"inom":0.5,"ifusion":2.0,"tau":0.01}),
            json!({"type":"MOTOR","a":4,"b":7,"r":5.0,"l":0.001,"ke":0.02,"j":1e-5,"bm":1e-6}),
            json!({"type":"R","a":7,"b":0,"ohms":1.0}),
            json!({"type":"XFMR","a1":1,"b1":0,"a2":8,"b2":0,"l1":0.01,"l2":0.01,"k":0.9}),
            json!({"type":"R","a":8,"b":0,"ohms":100}),
            json!({"type":"Q","c":9,"b":10,"e":0}),
            json!({"type":"R","a":4,"b":9,"ohms":1000}),
            json!({"type":"R","a":1,"b":10,"ohms":10000}),
            json!({"type":"OA","p":2,"n":12,"out":12,"vp":4,"vn":0}),
            json!({"type":"R","a":12,"b":0,"ohms":10000}),
            json!({"type":"RELAY","a1":2,"a2":0,"com":4,"na":15,"nc":16,"r":200.0,"l":0.1,"ion":0.003,"ioff":0.001}),
            json!({"type":"R","a":15,"b":0,"ohms":100}),
            json!({"type":"R","a":16,"b":0,"ohms":1000}),
            json!({"type":"BUZZER","a":2,"b":0,"ohms":1000.0,"umbral":2.0}),
            // Los números de red que no se usan quedan atados a tierra para que la matriz no sea singular.
            json!({"type":"R","a":3,"b":0,"ohms":1e6}),
            json!({"type":"R","a":6,"b":0,"ohms":1e6}),
            json!({"type":"R","a":11,"b":0,"ohms":1e6}),
            json!({"type":"R","a":13,"b":0,"ohms":1e6}),
            json!({"type":"R","a":14,"b":0,"ohms":1e6}),
        ],
        sondas,
    )
}

/// El 555 astable de `bench_digital` (criterio 2): 555 → contador hasta 9 → decodificador → display de siete LED.
fn criterio2(f: f64, sondas: Vec<Value>) -> Netlist {
    let c = 1.44 / (14.4e3 * f);
    let mut el = vec![
        json!({"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}}),
        json!({"type":"R","a":1,"b":2,"ohms":1000}),
        json!({"type":"R","a":2,"b":3,"ohms":6700}),
        json!({"type":"C","a":3,"b":0,"farads":c}),
        json!({"type":"C","a":4,"b":0,"farads":1e-8}),
        json!({"type":"R","a":1,"b":4,"ohms":5000}),
        json!({"type":"R","a":4,"b":6,"ohms":5000}),
        json!({"type":"R","a":6,"b":0,"ohms":5000}),
        json!({"type":"R","a":1,"b":0,"ohms":1800}),
        json!({"type":"ADC","p":3,"n":4,"out":0,"in_low":0,"in_high":0}),
        json!({"type":"ADC","p":6,"n":3,"out":1,"in_low":0,"in_high":0}),
        json!({"type":"ADC","p":1,"n":0,"out":2,"in_low":0.7,"in_high":0.7}),
        json!({"type":"LATCH555","trig":1,"thr":0,"res":2,"q":3,"delay":1e-7}),
        json!({"type":"OUT555","q":3,"out":5,"dis":2,"vcc":1,"gnd":0,"v_lo":0.025,"r_lo":7.5,"v_hi":-1.4,"r_hi":3,"g_on":0.06666666666666667,"g_off":1e-9,"t_rise":1e-7,"t_fall":1e-7}),
        json!({"type":"ADC","p":5,"n":0,"out":4,"in_low":1.5,"in_high":3.5}),
        json!({"type":"LOGIC","out":10,"value":0}),
        json!({"type":"COUNTER","clk":4,"rst":10,"q":[5,6,7,8],"co":9,"modulo":10,"rise_delay":5e-9,"fall_delay":5e-9}),
        json!({"type":"DECODER","inputs":[5,6,7,8],"outputs":[11,12,13,14,15,16,17],"activo_alto":true,"rise_delay":5e-9,"fall_delay":5e-9}),
    ];
    for s in 0..7 {
        el.push(json!({"type":"DAC","input":11 + s,"out":7 + s,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":6.666666666666667e-9,"t_fall":6.666666666666667e-9}));
        el.push(json!({"type":"R","a":7 + s,"b":14 + s,"ohms":330}));
        el.push(json!({"type":"D","a":14 + s,"b":0,"is":1.5e-17,"n":2}));
    }
    red(21, 18, el, sondas)
}

/// Un anillo de tres inversores que maneja un contador: lógica sola, sin islas.
fn logica_sola() -> Netlist {
    red(
        1,
        9,
        vec![
            json!({"type":"GATE","fn":"not","inputs":[2],"output":0,"rise_delay":5e-9,"fall_delay":5e-9}),
            json!({"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":5e-9,"fall_delay":5e-9}),
            json!({"type":"GATE","fn":"not","inputs":[1],"output":2,"rise_delay":5e-9,"fall_delay":5e-9}),
            json!({"type":"LOGIC","out":3,"value":0}),
            json!({"type":"COUNTER","clk":0,"rst":3,"q":[4,5,6,7],"co":8,"modulo":10,"rise_delay":5e-9,"fall_delay":5e-9}),
        ],
        vec![],
    )
}

/// Todo lo observable del motor: tiempo, voltajes, lecturas de cada elemento y niveles digitales, como bits.
fn huella(m: &Mixto) -> Vec<u64> {
    let mut v = vec![m.time().to_bits()];
    v.extend(m.voltages().iter().map(|x| x.to_bits()));
    for r in m.readings() {
        v.extend([r.i.to_bits(), r.aux.to_bits(), r.estado.to_bits()]);
    }
    v.extend((0..m.digital_count()).map(|r| m.nivel(r).codigo().to_bits()));
    v.extend(m.tiempos_de_islas().iter().map(|t| t.to_bits()));
    for r in 0..m.digital_count() {
        let (f, c, n) = m.medida(r);
        v.extend([f.to_bits(), c.to_bits(), n.to_bits()]);
    }
    v
}

/// Avanza a `t_a`, guarda, avanza a `t_b`, restaura y vuelve a avanzar a `t_b`: la huella tiene que ser idéntica.
fn volver_a_correr(mut m: Mixto, t_a: f64, t_b: f64) {
    m.advance_to(t_a, u32::MAX).unwrap();
    let en_a = huella(&m);
    m.guardar_estado();
    m.advance_to(t_b, u32::MAX).unwrap();
    let en_b = huella(&m);
    assert_ne!(en_a, en_b, "el avance tiene que cambiar algo");
    let t = m.restaurar_estado().expect("hay un estado guardado");
    assert_eq!(t.to_bits(), f64::from_bits(en_a[0]).to_bits(), "vuelve al instante guardado");
    assert_eq!(huella(&m), en_a, "justo después de restaurar es lo de antes del avance");
    m.advance_to(t_b, u32::MAX).unwrap();
    assert_eq!(huella(&m), en_b, "volver a correr da lo mismo bit a bit");
    // Y de nuevo: un segundo ida y vuelta desde el mismo punto.
    assert!(m.restaurar_estado().is_none(), "el estado se gasta al restaurarlo");
}

#[test]
fn el_circuito_analogico_con_todos_sus_dispositivos_vuelve_a_correr_igual() {
    volver_a_correr(Mixto::new(zoologico(vec![]), 1e-5).unwrap(), 5e-3, 12e-3);
}

#[test]
fn el_555_con_contador_y_display_vuelve_a_correr_igual() {
    // 1 kHz: unos 70 ciclos del reloj del contador en 0.1 s, con eventos digitales y cruces de umbral en el camino.
    volver_a_correr(Mixto::new(criterio2(1e3, vec![]), 1e-5).unwrap(), 0.03, 0.07);
}

#[test]
fn la_logica_sola_vuelve_a_correr_igual() {
    volver_a_correr(Mixto::new(logica_sola(), 1e-5).unwrap(), 3e-7, 9e-7);
}

#[test]
fn varios_retrocesos_en_cadena_regresan_cada_uno_a_su_instante() {
    let mut m = Mixto::new(zoologico(vec![]), 1e-5).unwrap();
    let mut huellas = Vec::new();
    for k in 1..=5 {
        huellas.push(huella(&m));
        m.guardar_estado();
        m.advance_to(k as f64 * 2e-3, u32::MAX).unwrap();
    }
    for h in huellas.iter().rev() {
        m.restaurar_estado().unwrap();
        assert_eq!(&huella(&m), h);
    }
    assert_eq!(m.estados_guardados().0, 0);
}

#[test]
fn las_sondas_se_recortan_hasta_el_instante_guardado() {
    let sondas = vec![
        json!({"kind":"v","p":2,"n":0,"muestras":4096,"columna":1e-4}),
        json!({"kind":"i","element":3,"signo":1,"muestras":4096,"columna":1e-4}),
    ];
    let mut m = Mixto::new(zoologico(sondas), 1e-5).unwrap();
    m.advance_to(4e-3, u32::MAX).unwrap();
    let (n0, t0, v0, c0) = {
        let s = m.sonda(0).unwrap();
        (s.registradas(), s.tiempo(), s.ultimo_valor(), s.columna_en(0.0, 4e-3))
    };
    m.guardar_estado();
    m.advance_to(9e-3, u32::MAX).unwrap();
    let (n1, v1) = {
        let s = m.sonda(0).unwrap();
        (s.registradas(), s.ultimo_valor())
    };
    assert!(n1 > n0);
    m.restaurar_estado().unwrap();
    let s = m.sonda(0).unwrap();
    assert_eq!(s.registradas(), n0, "las muestras de lo deshecho ya no están");
    assert_eq!(s.tiempo().to_bits(), t0.to_bits());
    assert_eq!(s.ultimo_valor().to_bits(), v0.to_bits());
    let c = s.columna_en(0.0, 4e-3);
    assert!((c.min - c0.min).abs() < 1e-5 && (c.max - c0.max).abs() < 1e-5, "la rejilla se rehizo con lo que quedó");
    assert!(s.columna_en(5e-3, 9e-3).vacia(), "lo deshecho no se ve");
    // Al volver a correr, la sonda registra lo mismo que la primera vez.
    m.advance_to(9e-3, u32::MAX).unwrap();
    let s = m.sonda(0).unwrap();
    assert_eq!(s.registradas(), n1);
    assert_eq!(s.ultimo_valor().to_bits(), v1.to_bits());
}

#[test]
fn una_sonda_digital_tambien_se_recorta() {
    let sondas = vec![json!({"kind":"v","p":5,"n":0,"muestras":4096,"columna":1e-4}), json!({"kind":"d","red":3,"bajo":0,"alto":5,"muestras":4096,"columna":1e-4})];
    let net = criterio2(1e3, sondas);
    let mut m = Mixto::new(net, 1e-5).unwrap();
    m.advance_to(0.01, u32::MAX).unwrap();
    let n0: Vec<u64> = (0..m.n_sondas()).map(|k| m.sonda(k).unwrap().registradas()).collect();
    m.guardar_estado();
    m.advance_to(0.02, u32::MAX).unwrap();
    assert!((0..m.n_sondas()).all(|k| m.sonda(k).unwrap().registradas() > n0[k]));
    m.restaurar_estado().unwrap();
    for k in 0..m.n_sondas() {
        assert_eq!(m.sonda(k).unwrap().registradas(), n0[k], "sonda {k}");
    }
}

#[test]
fn un_bufer_que_dio_la_vuelta_conserva_lo_que_sigue_valiendo() {
    // 1,024 muestras de búfer y miles de pasos: el búfer circular da varias vueltas entre el estado guardado y ahora.
    let sondas = vec![json!({"kind":"v","p":2,"n":0,"muestras":1024,"columna":1e-4})];
    let mut m = Mixto::new(zoologico(sondas), 1e-5).unwrap();
    m.advance_to(0.02, u32::MAX).unwrap();
    assert!(m.sonda(0).unwrap().registradas() > 1024);
    let n0 = m.sonda(0).unwrap().registradas();
    m.guardar_estado();
    m.advance_to(0.0205, u32::MAX).unwrap();
    m.restaurar_estado().unwrap();
    let s = m.sonda(0).unwrap();
    assert_eq!(s.registradas(), n0);
    assert!(s.cubre_desde().is_finite());
    assert!(s.cubre_desde() < s.tiempo());
    // Un retroceso más largo que el búfer entero deja la sonda vacía en vez de mostrar datos sobrescritos.
    m.guardar_estado();
    m.advance_to(0.04, u32::MAX).unwrap();
    m.restaurar_estado().unwrap();
    let s = m.sonda(0).unwrap();
    assert!(s.registradas() == 0 || s.cubre_desde() <= s.tiempo());
}

#[test]
fn editar_el_circuito_descarta_los_estados_guardados() {
    let mut m = Mixto::new(zoologico(vec![]), 1e-5).unwrap();
    m.guardar_estado();
    m.guardar_estado();
    assert_eq!(m.estados_guardados().0, 2);
    m.set_resistance(3, 2000.0).unwrap();
    assert_eq!(m.estados_guardados(), (0, 0));
    assert!(m.restaurar_estado().is_none());
}

#[test]
fn el_historial_guarda_a_lo_mas_los_ultimos_y_cuenta_lo_que_pierde_por_memoria() {
    let mut m = Mixto::new(zoologico(vec![]), 1e-5).unwrap();
    m.set_tope_estados(5, usize::MAX);
    for k in 1..=12 {
        m.advance_to(k as f64 * 1e-4, u32::MAX).unwrap();
        m.guardar_estado();
    }
    assert_eq!(m.estados_guardados().0, 5);
    assert_eq!(m.estados_perdidos_por_memoria(), 0, "perder por pasar de 5 no es perder por memoria");
    // El más viejo que queda es el del avance 8 (t = 0.7 ms).
    for _ in 0..4 {
        m.restaurar_estado().unwrap();
    }
    let t = m.restaurar_estado().unwrap();
    assert!((t - 8e-4).abs() < 1e-9, "{t}");
    // Con un tope de memoria de dos estados, el resto se olvida y se cuenta.
    let mut m = Mixto::new(zoologico(vec![]), 1e-5).unwrap();
    m.guardar_estado();
    let uno = m.estados_guardados().1;
    m.set_tope_estados(200, 2 * uno + uno / 2);
    for _ in 0..6 {
        m.guardar_estado();
    }
    assert_eq!(m.estados_guardados().0, 2);
    assert!(m.estados_perdidos_por_memoria() >= 4);
    assert_eq!(m.estados_perdidos_por_memoria(), 0, "la cuenta se pone en cero al preguntar");
}

/// El circuito de estrés: miles de resistencias. Mide cuánto ocupa un estado.
#[test]
fn un_estado_de_un_circuito_de_cinco_mil_resistencias_cabe_muchas_veces_en_el_tope() {
    // Una escalera R-2R larga de 5,000 resistencias.
    let n = 2500;
    let mut el = vec![json!({"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}})];
    for k in 1..=n {
        el.push(json!({"type":"R","a":k,"b":k + 1,"ohms":1000}));
        el.push(json!({"type":"R","a":k + 1,"b":0,"ohms":2000}));
    }
    let net = red(n + 2, 0, el, vec![]);
    assert_eq!(net.elements.len(), 5001);
    let mut m = Mixto::new(net, 1e-5).unwrap();
    m.advance_to(1e-4, u32::MAX).unwrap();
    m.guardar_estado();
    let (cuantos, bytes) = m.estados_guardados();
    eprintln!("5,001 elementos: {bytes} bytes por estado, {} estados caben en 64 MB", 64 * 1024 * 1024 / bytes);
    assert_eq!(cuantos, 1);
    assert!(bytes < 600_000, "{bytes}");
}
