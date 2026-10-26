//! Rendimiento nativo del motor digital, sin umbrales: 1) eventos por segundo con 1,000 compuertas, 2) costo de un flanco sobre una red analógica, 3) un 555 astable con contador, decodificador y display a 1 Hz y 1 kHz.
//! `cargo run --release --example bench_digital`
use std::time::Instant;

use kirchi_engine::{Mixto, Netlist};
use serde_json::{json, Value};

fn red(nodos: usize, redes: usize, el: Vec<Value>) -> Netlist {
    Netlist::from_json(&json!({"nodes": nodos, "digital_nets": redes, "elements": el}).to_string()).unwrap()
}

fn anillos(k: usize) -> Netlist {
    let mut el = Vec::new();
    for a in 0..k {
        for j in 0..5 {
            let (entrada, salida) = (5 * a + (j + 4) % 5, 5 * a + j);
            el.push(json!({"type":"GATE","fn":"not","inputs":[entrada],"output":salida,"rise_delay":9e-9,"fall_delay":9e-9}));
        }
    }
    red(1, 5 * k, el)
}

/// Cuadrada de `f` Hz → puente 74HC → inversor → puente de salida → 330 Ω → LED rojo.
fn flancos(f: f64) -> Netlist {
    red(4, 2, vec![
        json!({"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":f}}),
        json!({"type":"ADC","p":1,"n":0,"out":0,"in_low":1.5,"in_high":3.5}),
        json!({"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":5e-9,"fall_delay":5e-9}),
        json!({"type":"DAC","input":1,"out":2,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":6.666666666666667e-9,"t_fall":6.666666666666667e-9}),
        json!({"type":"R","a":2,"b":3,"ohms":330}),
        json!({"type":"D","a":3,"b":0,"is":1.5e-17,"n":2}),
    ])
}

/// 555 astable (R1 = 1 kΩ, R2 = 6.7 kΩ, C para la frecuencia `f`) → contador hasta 9 → decodificador → display de cátodo común.
fn criterio2(f: f64) -> Netlist {
    let c = 1.44 / (14.4e3 * f);
    // Nodos: 1 VCC, 2 DIS, 3 THR y TRIG, 4 CV, 5 OUT, 6 toma del divisor, 7 a 13 salidas a los segmentos, 14 a 20 ánodos.
    // Redes: 0 umbral, 1 disparo, 2 reinicio, 3 Q, 4 reloj del contador, 5 a 8 Q0 a Q3, 9 CO, 10 RST del contador, 11 a 17 a..g.
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
    red(21, 18, el)
}

fn main() {
    let mut m = Mixto::new(anillos(200), 1e-5).unwrap();
    m.registrar_cambios(false);
    let inicio = Instant::now();
    m.advance_to(1e-4, u32::MAX).unwrap();
    let s = inicio.elapsed().as_secs_f64();
    let cambios: f64 = (0..m.digital_count()).map(|r| m.medida(r).2).sum();
    println!("1,000 compuertas: {:.2} millones de eventos por segundo ({cambios:.0} en {:.1} ms)", cambios / s / 1e6, s * 1e3);

    for f in [1e3, 1e4] {
        let mut m = Mixto::new(flancos(f), (1.0 / (100.0 * f)).clamp(1e-8, 1e-5)).unwrap();
        m.advance_to(2.0 / f, u32::MAX).unwrap();
        let t0 = m.time();
        let inicio = Instant::now();
        let sim = 2000.0 / f;
        m.advance_to(t0 + sim, u32::MAX).unwrap();
        let s = inicio.elapsed().as_secs_f64();
        println!("flancos a {f:.0} Hz: {} islas, {:.2} µs por flanco, {:.1} veces el tiempo real", m.islas(), s * 1e6 / (2.0 * f * sim), sim / s);
    }

    for f in [1.0, 1e3] {
        let mut m = Mixto::new(criterio2(f), 1e-5).unwrap();
        let sim = if f < 10.0 { 12.0 } else { 0.1 };
        let inicio = Instant::now();
        m.advance_to(sim, u32::MAX).unwrap();
        let s = inicio.elapsed().as_secs_f64();
        let (fq, _, _) = m.medida(3);
        let (fco, _, _) = m.medida(9);
        println!(
            "criterio 2 a {f:.0} Hz: {} islas, 555 a {fq:.2} Hz, acarreo a {fco:.3} Hz, {:.1} veces el tiempo real ({sim} s simulados en {:.0} ms)",
            m.islas(),
            sim / s,
            s * 1e3
        );
    }
}
