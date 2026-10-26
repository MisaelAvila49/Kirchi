use std::time::Instant;

use kirchi_engine::transient::SolverKind;
use kirchi_engine::{Element, Netlist, Transient, Wave};

/// Escalera RC lineal: fuente senoidal en el nodo 1, luego R en serie y C a tierra por nodo.
fn ladder(nodes: usize) -> Netlist {
    let mut elements = vec![Element::V {
        a: 1,
        b: 0,
        wave: Wave::Sine { offset: 0.0, amp: 1.0, freq: 1000.0, phase: 0.0, continua: false },
    }];
    for k in 1..nodes - 1 {
        elements.push(Element::R { a: k, b: k + 1, ohms: 100.0 });
        elements.push(Element::C { a: k + 1, b: 0, farads: 1e-7 });
    }
    Netlist { nodes, digital_nets: 0, elements, sondas: Vec::new() }
}

fn run(name: &str, net: Netlist, h: f64, sim_seconds: f64, kind: SolverKind) {
    let mut tr = Transient::with_solver(net, h, kind).unwrap();
    let t0 = Instant::now();
    tr.advance_to(sim_seconds, u32::MAX).unwrap();
    let wall = t0.elapsed().as_secs_f64();
    println!(
        "{name:<34} {:>12.0} pasos/s {:>10.3}x tiempo real",
        tr.steps() as f64 / wall,
        sim_seconds / wall
    );
}

fn main() {
    let rect = include_str!("../fixtures/rectificador.json");
    run("rectificador, densa, h=5us", Netlist::from_json(rect).unwrap(), 5e-6, 1.0, SolverKind::Dense);
    for n in [10, 50, 200, 500] {
        run(&format!("escalera RC {n} nodos, densa"), ladder(n), 5e-6, 0.02, SolverKind::Dense);
    }
    #[cfg(feature = "faer")]
    {
        run("rectificador, dispersa, h=5us", Netlist::from_json(rect).unwrap(), 5e-6, 1.0, SolverKind::Sparse);
        for n in [10, 50, 200, 500] {
            run(&format!("escalera RC {n} nodos, dispersa"), ladder(n), 5e-6, 0.02, SolverKind::Sparse);
        }
    }
}
