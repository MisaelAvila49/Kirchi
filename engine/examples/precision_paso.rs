//! Error de la señal del amplificador de emisor común según el paso máximo (pasos por periodo de 1 kHz), contra la misma
//! simulación con 1,000 pasos por periodo. Mide la amplitud pico a pico del colector (nodo 3) y el error eficaz de la forma de onda.
use kirchi_engine::{Netlist, Transient};

fn onda(h: f64) -> Vec<f64> {
    let v: serde_json::Value = serde_json::from_str(include_str!("../referencias/ec_amplificador.json")).unwrap();
    let net = Netlist::from_json(&v["netlist"].to_string()).unwrap();
    let mut tr = Transient::new(net, h).unwrap();
    tr.advance_to(0.03, u32::MAX).unwrap();
    // Último periodo, 100 muestras en los mismos instantes sea cual sea el paso.
    (1..=100).map(|k| {
        tr.advance_to(0.03 + k as f64 * 1e-5, u32::MAX).unwrap();
        tr.voltage(3)
    }).collect()
}

fn main() {
    let ref_ = onda(1e-6);
    let pp = |w: &[f64]| w.iter().cloned().fold(f64::MIN, f64::max) - w.iter().cloned().fold(f64::MAX, f64::min);
    println!("referencia (1000 pasos por periodo): {:.5} V pico a pico", pp(&ref_));
    for n in [200, 100, 70, 50, 40, 30, 20] {
        let w = onda(1e-3 / n as f64);
        let eficaz = (w.iter().zip(&ref_).map(|(a, b)| (a - b).powi(2)).sum::<f64>() / 100.0).sqrt();
        println!("{n:>4} pasos por periodo: pico a pico {:.5} V ({:+.3} %), error eficaz de la forma {:.2e} V ({:.3} % del pico a pico)", pp(&w), 100.0 * (pp(&w) / pp(&ref_) - 1.0), eficaz, 100.0 * eficaz / pp(&ref_));
    }
}
