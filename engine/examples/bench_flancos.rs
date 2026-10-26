//! Costo de un flanco en el motor analógico: una cuadrada de 0 a 5 V maneja `k` LED con 330 Ω y se cuentan los pasos de más por flanco. Con «RC en la matriz» se agrega un capacitor de 1 µF por 10 kΩ.
//! `cargo run --release --example bench_flancos`
use std::time::Instant;

use kirchi_engine::{Netlist, Transient};

fn circuito(k: usize, freq: f64, rc: bool) -> Netlist {
    let mut el = vec![serde_json::json!({"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":freq}})];
    let mut n = 2;
    for _ in 0..k {
        el.push(serde_json::json!({"type":"R","a":1,"b":n,"ohms":330}));
        el.push(serde_json::json!({"type":"D","a":n,"b":0,"is":1.5e-17,"n":2}));
        n += 1;
    }
    if rc {
        el.push(serde_json::json!({"type":"V","a":n,"b":0,"wave":{"kind":"dc","v":5}}));
        el.push(serde_json::json!({"type":"R","a":n,"b":n + 1,"ohms":10000}));
        el.push(serde_json::json!({"type":"C","a":n + 1,"b":0,"farads":1e-6}));
        n += 2;
    }
    Netlist::from_json(&serde_json::json!({"nodes": n, "elements": el}).to_string()).unwrap()
}

/// Paso máximo de la vista previa: 100 por periodo de la fuente más rápida, entre 10 ns y 10 µs (`pasoDeSimulacion`).
fn paso(freq: f64) -> f64 {
    (1.0 / (100.0 * freq)).clamp(1e-8, 1e-5)
}

fn main() {
    println!("| LED | f (Hz) | RC en la matriz | flancos | pasos por flanco | µs por paso | µs por flanco | veces el tiempo real |");
    println!("|---|---|---|---|---|---|---|---|");
    for &(k, freq, rc) in &[(4, 100.0, false), (4, 1e3, false), (7, 1e3, false), (7, 1e3, true), (4, 1e4, false), (4, 1e4, true)] {
        let h = paso(freq);
        let mut tr = Transient::new(circuito(k, freq, rc), h).unwrap();
        // Se deja asentar dos periodos (el capacitor del RC sigue cargando: es lo que se quiere medir).
        tr.advance_to(2.0 / freq, u32::MAX).unwrap();
        let (t0, p0) = (tr.time(), tr.steps());
        let sim = 0.2_f64.min(2000.0 / freq);
        let inicio = Instant::now();
        tr.advance_to(t0 + sim, u32::MAX).unwrap();
        let s = inicio.elapsed().as_secs_f64();
        let flancos = 2.0 * freq * sim;
        let pasos = (tr.steps() - p0) as f64;
        // Pasos que daría sin flancos (todos al paso máximo): la diferencia es lo que cuestan los flancos.
        let de_mas = (pasos - sim / h).max(0.0);
        let us_paso = s * 1e6 / pasos;
        println!(
            "| {k} | {freq:.0} | {} | {flancos:.0} | {:.1} | {us_paso:.2} | {:.1} | {:.1} |",
            if rc { "sí" } else { "no" },
            de_mas / flancos,
            de_mas * us_paso / flancos,
            sim / s
        );
    }
}
