//! Cadena de `k` amplificadores de emisor común (2N2222, 20 mV a 1 kHz, paso máximo de la vista previa) y cuánto del tiempo real alcanza el motor, sin Electron.
//! `cargo run --release --example bench_etapas --features perfil` (con `perfil` reparte el tiempo por fase).
use std::time::Instant;

use kirchi_engine::transient::SolverKind;
use kirchi_engine::{Netlist, Transient};

struct Cuenta;
static ASIGNACIONES: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
unsafe impl std::alloc::GlobalAlloc for Cuenta {
    unsafe fn alloc(&self, l: std::alloc::Layout) -> *mut u8 {
        ASIGNACIONES.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        std::alloc::System.alloc(l)
    }
    unsafe fn dealloc(&self, p: *mut u8, l: std::alloc::Layout) {
        std::alloc::System.dealloc(p, l)
    }
}
#[global_allocator]
static A: Cuenta = Cuenta;

fn etapas(k: usize, con_led: bool) -> Netlist {
    let referencia: serde_json::Value = serde_json::from_str(include_str!("../referencias/ec_amplificador.json")).unwrap();
    let q = referencia["netlist"]["elements"].as_array().unwrap().iter().find(|e| e["type"] == "Q").unwrap().clone();
    let mut el = vec![
        serde_json::json!({"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":12}}),
        serde_json::json!({"type":"V","a":2,"b":0,"wave":{"kind":"sine","offset":0,"amp":0.02,"freq":1000}}),
    ];
    let mut n = 3;
    for _ in 0..k {
        let (b, c, e, o) = (n, n + 1, n + 2, n + 3);
        n += 4;
        el.push(serde_json::json!({"type":"C","a":2,"b":b,"farads":1e-6}));
        el.push(serde_json::json!({"type":"R","a":1,"b":b,"ohms":47000}));
        el.push(serde_json::json!({"type":"R","a":b,"b":0,"ohms":10000}));
        if con_led {
            // Un LED en serie con el colector, como en el circuito de la e2e.
            el.push(serde_json::json!({"type":"R","a":1,"b":n,"ohms":2200}));
            el.push(serde_json::json!({"type":"D","a":n,"b":c}));
            n += 1;
        } else {
            el.push(serde_json::json!({"type":"R","a":1,"b":c,"ohms":2200}));
        }
        el.push(serde_json::json!({"type":"R","a":e,"b":0,"ohms":470}));
        el.push(serde_json::json!({"type":"C","a":e,"b":0,"farads":1e-5}));
        el.push(serde_json::json!({"type":"C","a":c,"b":o,"farads":1e-6}));
        el.push(serde_json::json!({"type":"R","a":o,"b":0,"ohms":10000}));
        let mut qk = q.clone();
        qk["c"] = c.into();
        qk["b"] = b.into();
        qk["e"] = e.into();
        el.push(qk);
    }
    Netlist::from_json(&serde_json::json!({"nodes": n, "elements": el}).to_string()).unwrap()
}

fn main() {
    let sim_s: f64 = std::env::var("SIM").ok().and_then(|v| v.parse().ok()).unwrap_or(0.1);
    for con_led in [false, true] {
        println!("{}", if con_led { "con LED en el colector" } else { "sin LED" });
        let ks: Vec<usize> = std::env::var("KS").map(|v| v.split(',').map(|x| x.parse().unwrap()).collect()).unwrap_or(vec![1, 2, 5, 10, 20]);
        for k in ks {
            let net = etapas(k, con_led);
            let incog = kirchi_engine::transient::incognitas(&net);
            let mut tr = match std::env::var("SOLVER").as_deref() {
                Ok("dense") => Transient::with_solver(net, 1e-5, SolverKind::Dense).unwrap(),
                Ok("sparse") => Transient::with_solver(net, 1e-5, SolverKind::Sparse).unwrap(),
                _ => Transient::new(net, 1e-5).unwrap(),
            };
            tr.advance_to(1e-9, 1).unwrap();
            let p0 = tr.perfil;
            let s0 = tr.steps();
            let a0 = ASIGNACIONES.load(std::sync::atomic::Ordering::Relaxed);
            let t0 = Instant::now();
            tr.advance_to(sim_s, u32::MAX).unwrap();
            let wall = t0.elapsed().as_secs_f64();
            let pasos = (tr.steps() - s0) as f64;
            let asig = (ASIGNACIONES.load(std::sync::atomic::Ordering::Relaxed) - a0) as f64 / pasos;
            let p = tr.perfil;
            let it = (p.iteraciones - p0.iteraciones) as f64;
            println!(
                "{k:>3} etapas ({incog:>4} incógnitas): {:>7.1} % del tiempo real, {:>7.1} us/paso, {:>6.0} pasos por s simulado, {:.2} intentos/paso, {:.1} rechazos LTE y {:.1} fallos por 100 pasos, {:.2} iteraciones/paso, {:.2} factorizaciones/paso, {:.1} asignaciones/paso",
                100.0 * sim_s / wall,
                1e6 * wall / pasos,
                pasos / sim_s,
                (p.intentos - p0.intentos) as f64 / pasos,
                100.0 * (p.rechazos_lte - p0.rechazos_lte) as f64 / pasos,
                100.0 * (p.fallos - p0.fallos) as f64 / pasos,
                it / pasos,
                (p.factorizaciones - p0.factorizaciones) as f64 / pasos,
                asig,
            );
            #[cfg(feature = "perfil")]
            {
                let c = (p.ns_carga - p0.ns_carga) as f64 / 1e3 / pasos;
                let f = (p.ns_factor - p0.ns_factor) as f64 / 1e3 / pasos;
                let r = (p.ns_resuelve - p0.ns_resuelve) as f64 / 1e3 / pasos;
                let total = 1e6 * wall / pasos;
                let pre = kirchi_engine::sparse::PERFIL_PRE.swap(0, std::sync::atomic::Ordering::Relaxed) as f64 / 1e3 / pasos;
                let num = kirchi_engine::sparse::PERFIL_NUM.swap(0, std::sync::atomic::Ordering::Relaxed) as f64 / 1e3 / pasos;
                println!("      dentro del factor disperso: preparar {pre:.1}, faer {num:.1}");
                let tr = (p.ns_trunc - p0.ns_trunc) as f64 / 1e3 / pasos;
                let ac = (p.ns_accept - p0.ns_accept) as f64 / 1e3 / pasos;
                let cv = (p.ns_conv - p0.ns_conv) as f64 / 1e3 / pasos;
                println!("      us/paso: carga {c:.1}, factor {f:.1}, resuelve {r:.1}, truncamiento {tr:.1}, aceptar {ac:.1}, prueba de convergencia {cv:.1}, resto {:.1}", total - c - f - r - tr - ac - cv);
            }
        }
    }
}
