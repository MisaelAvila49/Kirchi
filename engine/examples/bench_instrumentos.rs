//! Costo de los instrumentos en el motor nativo, sin umbrales: capacidad con y sin sondas, adelanto entre islas, muestras por segundo simulado de un reloj de 10 kHz y capacidad con el paso acotado a 500 por pantalla.
//! `cargo run --release --example bench_instrumentos`
use std::time::Instant;

use kirchi_engine::{Mixto, Netlist};
use serde_json::{json, Value};

const MUESTRAS: usize = 262_144;

/// Un amplificador de emisor común con LED en el colector (el de la e2e), con señal de 20 mV a 1 kHz.
fn amplificador() -> Value {
    let referencia: Value = serde_json::from_str(include_str!("../referencias/ec_amplificador.json")).unwrap();
    let mut q = referencia["netlist"]["elements"].as_array().unwrap().iter().find(|e| e["type"] == "Q").unwrap().clone();
    // Nodos: 1 VCC, 2 señal, 3 base, 4 colector, 5 emisor, 6 salida, 7 ánodo del LED.
    q["c"] = 4.into();
    q["b"] = 3.into();
    q["e"] = 5.into();
    json!({"nodes": 8, "elements": [
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":12}},
        {"type":"V","a":2,"b":0,"wave":{"kind":"sine","offset":0,"amp":0.02,"freq":1000}},
        {"type":"C","a":2,"b":3,"farads":1e-6},
        {"type":"R","a":1,"b":3,"ohms":47000},
        {"type":"R","a":3,"b":0,"ohms":10000},
        {"type":"R","a":1,"b":7,"ohms":2200},
        {"type":"D","a":7,"b":4,"is":1.5e-17,"n":2},
        {"type":"R","a":5,"b":0,"ohms":470},
        {"type":"C","a":5,"b":0,"farads":1e-5},
        {"type":"C","a":4,"b":6,"farads":1e-6},
        {"type":"R","a":6,"b":0,"ohms":10000},
        q
    ]})
}

/// El 555 a `f` Hz con contador hasta 9, decodificador y display (el de `bench_digital`).
fn reloj(f: f64) -> Value {
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
    json!({"nodes": 21, "digital_nets": 18, "elements": el})
}

/// Un reloj de 10 kHz por un puente a cuatro inversores, cada uno con su LED (riesgo 3).
fn cuatro_leds() -> Value {
    let mut el = vec![
        json!({"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":1e4}}),
        json!({"type":"ADC","p":1,"n":0,"out":0,"in_low":1.5,"in_high":3.5}),
    ];
    for k in 0..4 {
        let (sal, anodo) = (2 + 2 * k, 3 + 2 * k);
        el.push(json!({"type":"GATE","fn":"not","inputs":[0],"output":1 + k,"rise_delay":5e-9,"fall_delay":5e-9}));
        el.push(json!({"type":"DAC","input":1 + k,"out":sal,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":6.666666666666667e-9,"t_fall":6.666666666666667e-9}));
        el.push(json!({"type":"R","a":sal,"b":anodo,"ohms":330}));
        el.push(json!({"type":"D","a":anodo,"b":0,"is":1.5e-17,"n":2}));
    }
    json!({"nodes": 10, "digital_nets": 5, "elements": el})
}

/// La netlist con `sondas` de voltaje de 262,144 muestras (columnas de `columna` segundos) sobre los nodos dados.
fn con_sondas(mut n: Value, nodos: &[usize], digitales: &[usize], columna: f64) -> Netlist {
    let mut s: Vec<Value> = nodos.iter().map(|&p| json!({"kind":"v","p":p,"n":0,"muestras":MUESTRAS,"columna":columna})).collect();
    s.extend(digitales.iter().map(|&r| json!({"kind":"d","red":r,"bajo":0,"alto":5,"muestras":MUESTRAS,"columna":columna})));
    n["sondas"] = Value::Array(s);
    Netlist::from_json(&n.to_string()).unwrap()
}

/// La netlist con un multímetro en voltios entre `nodo` y tierra: el fusible de 10 MΩ y sus dos sondas de 32,768 muestras.
fn con_multimetro(mut n: Value, nodo: usize) -> Netlist {
    let el = n["elements"].as_array_mut().unwrap();
    let k = el.len();
    el.push(json!({"type":"FUSE","a":nodo,"b":0,"ohms":1e7,"inom":10,"ifusion":20,"tau":0.125,"v":0}));
    n["sondas"] = json!([
        {"kind":"v","p":nodo,"n":0,"muestras":32768,"columna":1e-3},
        {"kind":"i","element":k,"signo":1,"muestras":32768,"columna":1e-3}
    ]);
    Netlist::from_json(&n.to_string()).unwrap()
}

/// Capacidad en llamadas como las del worker (lotes de 200 pasos hasta 8 ms de reloj por cada 12 ms simulados), el mejor de
/// tres, tras calentar 50 ms simulados.
fn capacidad(net: &Netlist, h: f64, promedios: bool, sim: f64) -> f64 {
    let mut mejor: f64 = 0.0;
    for _ in 0..3 {
        let mut m = Mixto::new(net.clone(), h).unwrap();
        if promedios {
            m.activar_promedios();
        }
        m.advance_to(0.05, u32::MAX).unwrap();
        let t0 = m.time();
        let inicio = Instant::now();
        while m.time() < t0 + sim {
            let meta = m.time() + 0.012;
            while m.time() < meta - 1e-12 {
                if m.advance_to(meta, 200).unwrap() == 0 {
                    break;
                }
            }
            if promedios {
                m.reiniciar_promedios();
            }
        }
        mejor = mejor.max((m.time() - t0) / inicio.elapsed().as_secs_f64());
    }
    mejor
}

/// Capacidad con un paso máximo `h` medida sobre 5,000 pasos (para las bases de tiempo rápidas).
fn capacidad_por_pasos(net: &Netlist, h: f64) -> f64 {
    let mut m = Mixto::new(net.clone(), h).unwrap();
    m.advance_to(0.002, u32::MAX).unwrap();
    let t0 = m.time();
    let inicio = Instant::now();
    m.advance_to(t0 + 10.0, 5000).unwrap();
    (m.time() - t0) / inicio.elapsed().as_secs_f64()
}

fn main() {
    // 1. Costo de cuatro sondas y los promedios.
    let (amp, reloj_1k) = (amplificador(), reloj(1000.0));
    let sin = |v: &Value| Netlist::from_json(&v.to_string()).unwrap();
    for (nombre, v, h, nodos, digitales) in [
        ("amplificador con LED", &amp, 1e-5, vec![2usize, 4, 6, 7], vec![]),
        ("555 con contador y display", &reloj_1k, 1e-5, vec![3, 5, 14], vec![5usize]),
    ] {
        let base = capacidad(&sin(v), h, false, 0.5);
        let con = capacidad(&con_sondas(v.clone(), &nodos, &digitales, 1e-4), h, true, 0.5);
        println!("{nombre}: {base:.2} sin instrumentos, {con:.2} con cuatro sondas y promedios ({:+.1} %)", 100.0 * (con / base - 1.0));
    }
    // Con el multímetro como lo arma la interfaz (un fusible de 10 MΩ con la fuente de prueba en serie) en el
    // ánodo de un segmento, con sus dos sondas y los promedios: la isla de ese LED era quieta (salta entre eventos).
    let base = capacidad(&sin(&reloj_1k), 1e-5, false, 0.5);
    let con = capacidad(&con_multimetro(reloj_1k.clone(), 14), 1e-5, true, 0.5);
    println!("555 con contador y display: {base:.2} sin instrumentos, {con:.2} con un multímetro en un segmento ({:+.1} %)", 100.0 * (con / base - 1.0));

    // 2. Cuánto se adelanta una isla en el 555 con contador y display.
    let mut m = Mixto::new(con_sondas(reloj_1k.clone(), &[3, 5, 14], &[5], 1e-4), 1e-5).unwrap();
    let mut adelanto: f64 = 0.0;
    while m.time() < 1.0 {
        let meta = m.time() + 0.012;
        while m.time() < meta - 1e-12 {
            if m.advance_to(meta, 200).unwrap() == 0 {
                break;
            }
            let ts: Vec<f64> = (1..21).map(|k| m.tiempo_de_nodo(k)).collect();
            let (lo, hi) = ts.iter().fold((f64::INFINITY, f64::NEG_INFINITY), |(a, b), &t| (a.min(t), b.max(t)));
            adelanto = adelanto.max(hi - lo);
        }
    }
    let s = m.sonda(2).unwrap();
    println!(
        "555 con display: {} islas, la más adelantada llegó a {:.3} ms delante; la sonda del segmento recibió {} muestras en 1 s y su búfer cubre {:.3} s",
        m.islas(),
        adelanto * 1e3,
        s.registradas(),
        s.tiempo() - s.cubre_desde()
    );

    // 3. Volumen de muestras con flancos.
    let mut m = Mixto::new(con_sondas(cuatro_leds(), &[3], &[], 1e-5), 1e-6).unwrap();
    m.advance_to(0.1, u32::MAX).unwrap();
    let s = m.sonda(0).unwrap();
    let por_s = s.registradas() as f64 / m.time();
    println!(
        "reloj de 10 kHz con cuatro LED: {por_s:.0} muestras por segundo simulado en la sonda de un LED; 262,144 cubren {:.3} s (una pantalla de 10 ms/div dura 0.1 s)",
        MUESTRAS as f64 / por_s
    );

    // 4. Base de tiempo y tiempo real.
    for (nombre, v, h0) in [("amplificador con LED", &amp, 1e-5), ("555 con contador y display", &reloj_1k, 1e-5)] {
        let net = sin(v);
        let mut renglon = format!("{nombre}:");
        for tb in [1e-6f64, 2e-6, 5e-6, 1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4, 1e-3, 2e-3, 5e-3, 1e-2] {
            let h = (10.0 * tb / 500.0).min(h0).max(1e-8);
            renglon += &format!(" {:.0e} s/div {:.2};", tb, capacidad_por_pasos(&net, h));
        }
        println!("{renglon}");
    }
}
