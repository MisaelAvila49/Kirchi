//! Un bit del `DACM` que sigue sin nivel definido (X por quedar entre los umbrales de su entrada, o Z) conserva el último código y se
//! avisa una sola vez, para que el Registro lo diga.

use kirchi_engine::{Mixto, Netlist};

/// Dos bits (el más significativo en el nodo 4, siempre a 5 V; el otro en el nodo 1, que sube a 5 V pasando por la zona sin nivel) y una
/// referencia de 4 V: el código 2 da 2 V y el 3 da 3 V en la salida (nodo 3, con carga de 1 kΩ).
fn netlist(puntos: &str) -> Netlist {
    let json = format!(
        r#"{{"nodes":5,"digital_nets":2,"elements":[
        {{"type":"V","a":1,"b":0,"wave":{{"kind":"pwl","puntos":{puntos}}}}},
        {{"type":"V","a":2,"b":0,"wave":{{"kind":"dc","v":4}}}},
        {{"type":"V","a":4,"b":0,"wave":{{"kind":"dc","v":5}}}},
        {{"type":"R","a":3,"b":0,"ohms":1000}},
        {{"type":"ADC","p":4,"n":0,"out":0,"in_low":0.8,"in_high":2}},
        {{"type":"ADC","p":1,"n":0,"out":1,"in_low":0.8,"in_high":2}},
        {{"type":"DACM","modo":"voltaje","out":3,"ret":0,"ref_p":2,"ref_n":0,"bits":[0,1],"t_asentamiento":1e-9}}]}}"#
    );
    Netlist::from_json(&json).unwrap()
}

#[test]
fn un_bit_entre_los_umbrales_conserva_el_codigo_y_se_avisa_una_vez() {
    // 0 V hasta 10 µs, 1.4 V (sin nivel) de 10.1 a 20 µs y 5 V desde 20.1 µs.
    let mut m = Mixto::new(netlist("[[0,0],[0.00001,0],[0.0000101,1.4],[0.00002,1.4],[0.0000201,5]]"), 1e-7).unwrap();
    m.advance_to(5e-6, u32::MAX).unwrap();
    assert!(m.tomar_indefinidos().is_empty());
    assert!((m.voltage(3) - 2.0).abs() < 1e-6, "código 2: {}", m.voltage(3));
    m.advance_to(15e-6, u32::MAX).unwrap();
    assert_eq!(m.tomar_indefinidos(), vec![6], "el DACM es el elemento 6");
    assert!((m.voltage(3) - 2.0).abs() < 1e-6, "conserva el último código: {}", m.voltage(3));
    // Sin cambios nuevos no se vuelve a avisar, y al definirse el bit el código nuevo llega.
    m.advance_to(18e-6, u32::MAX).unwrap();
    assert!(m.tomar_indefinidos().is_empty());
    m.advance_to(30e-6, u32::MAX).unwrap();
    assert!((m.voltage(3) - 3.0).abs() < 1e-6, "código 3: {}", m.voltage(3));
    assert!(m.tomar_indefinidos().is_empty());
}

#[test]
fn un_flanco_rapido_por_la_zona_entre_los_umbrales_no_avisa() {
    // 5 V en 20 ns, como la salida de un puente: pasa por X unos 5 ns.
    let mut m = Mixto::new(netlist("[[0,0],[0.00001,0],[0.00001002,5]]"), 1e-7).unwrap();
    m.advance_to(30e-6, u32::MAX).unwrap();
    assert!(m.tomar_indefinidos().is_empty());
    assert!((m.voltage(3) - 3.0).abs() < 1e-6);
}

#[test]
fn un_flanco_lento_que_pasa_dos_microsegundos_sin_nivel_si_avisa() {
    let mut m = Mixto::new(netlist("[[0,0],[0.00001,0],[0.00002,5]]"), 1e-7).unwrap();
    m.advance_to(30e-6, u32::MAX).unwrap();
    assert_eq!(m.tomar_indefinidos(), vec![6]);
    assert!(m.tomar_indefinidos().is_empty());
}
