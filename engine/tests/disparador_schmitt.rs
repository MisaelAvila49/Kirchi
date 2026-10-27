//! Un puente de entrada con histéresis (74HC14) cambia en dos umbrales distintos según el sentido y no lee X entre ellos.
use kirchi_engine::digital::Nivel;
use kirchi_engine::{Mixto, Netlist};

/// Seno de 1 kHz entre -0.35 V y 4.65 V (2.15 V ± 2.5 V) a un puente de entrada de 1.6 y 2.7 V y un inversor.
fn circuito(histeresis: bool) -> String {
    format!(
        r#"{{"nodes":2,"digital_nets":2,"elements":[
        {{"type":"V","a":1,"b":0,"wave":{{"kind":"sine","offset":2.15,"amp":2.5,"freq":1000}}}},
        {{"type":"ADC","p":1,"n":0,"out":0,"in_low":1.6,"in_high":2.7,"histeresis":{histeresis}}},
        {{"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":1e-9,"fall_delay":1e-9}}]}}"#
    )
}

fn cambios_de_la_entrada(histeresis: bool) -> Vec<(f64, Nivel)> {
    let mut m = Mixto::new(Netlist::from_json(&circuito(histeresis)).unwrap(), 1e-6).unwrap();
    m.registrar_cambios(true);
    m.advance_to(2e-3, u32::MAX).unwrap();
    m.tomar_cambios().into_iter().filter(|c| c.1 == 0).map(|c| (c.0, c.2)).collect()
}

#[test]
fn barrido_arriba_y_abajo_cambia_en_2_7_subiendo_y_en_1_6_bajando() {
    let c = cambios_de_la_entrada(true);
    // sin(wt) = (2.7 - 2.15) / 2.5 sube en 35.3 us; baja a 1.6 V en (pi + asin(0.22)) / w = 535.3 us.
    let esperado = [(35.3e-6, Nivel::Uno), (535.3e-6, Nivel::Cero), (1035.3e-6, Nivel::Uno), (1535.3e-6, Nivel::Cero)];
    assert_eq!(c.len(), esperado.len(), "{c:?}");
    for ((t, n), (te, ne)) in c.iter().zip(esperado) {
        assert_eq!(*n, ne);
        assert!((t - te).abs() < 1.5e-6, "{t} contra {te}");
    }
}

#[test]
fn sin_histeresis_la_misma_banda_se_lee_x() {
    let c = cambios_de_la_entrada(false);
    assert!(c.iter().any(|x| x.1 == Nivel::X), "{c:?}");
}

#[test]
fn el_inversor_de_la_salida_sigue_a_la_entrada_con_histeresis() {
    let mut m = Mixto::new(Netlist::from_json(&circuito(true)).unwrap(), 1e-6).unwrap();
    // A los 300 us la señal ya subió y bajó de 2.7 V sin llegar a 1.6 V: la entrada sigue en 1.
    m.advance_to(300e-6, u32::MAX).unwrap();
    assert_eq!((m.nivel(0), m.nivel(1)), (Nivel::Uno, Nivel::Cero));
    // A los 700 us pasó de 1.6 V hacia abajo.
    m.advance_to(700e-6, u32::MAX).unwrap();
    assert_eq!((m.nivel(0), m.nivel(1)), (Nivel::Cero, Nivel::Uno));
}
