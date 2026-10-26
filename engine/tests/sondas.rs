//! Las sondas viven en la isla de lo que miden y registran cada paso; los promedios integran cada nodo y cada
//! elemento desde el último reinicio.
use kirchi_engine::{EngineError, Mixto, Netlist};

fn mixto(json: &str, h: f64) -> Mixto {
    Mixto::new(Netlist::from_json(json).unwrap(), h).unwrap()
}

const RC_CON_SONDAS: &str = r#"{"nodes":3,"elements":[
    {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
    {"type":"R","a":1,"b":2,"ohms":1000},
    {"type":"C","a":2,"b":0,"farads":1e-6}],
  "sondas":[
    {"kind":"v","p":2,"n":0,"muestras":4096,"columna":1e-4},
    {"kind":"i","element":1,"signo":1,"muestras":4096,"columna":1e-4}]}"#;

#[test]
fn una_sonda_registra_cada_paso_de_su_isla_y_su_integral_es_la_del_rc() {
    let mut m = mixto(RC_CON_SONDAS, 1e-5);
    assert_eq!(m.n_sondas(), 2);
    m.advance_to(5e-3, u32::MAX).unwrap();
    let v = m.sonda(0).unwrap();
    assert_eq!(v.tiempo(), m.time());
    assert!((v.valor_en(m.time()) - m.voltage(2)).abs() < 1e-6);
    // ∫v·dt de 0 a 5 ms con τ = 1 ms: 5 (t − τ (1 − e^(−t/τ))).
    let exacta = 5.0 * (5e-3 - 1e-3 * (1.0 - (-5.0f64).exp()));
    let c = v.columna_en(0.0, 5e-3);
    assert!((c.iv - exacta).abs() / exacta < 1e-3, "{} contra {exacta}", c.iv);
    // ∫i·dt de la resistencia es la carga del capacitor.
    let q = m.sonda(1).unwrap().columna_en(0.0, 5e-3).iv;
    assert!((q - 1e-6 * m.voltage(2)).abs() / q < 2e-3, "{q} contra {}", 1e-6 * m.voltage(2));
}

#[test]
fn la_sonda_en_pausa_no_registra_y_al_reanudar_sigue_desde_el_tiempo_de_su_isla() {
    // La sonda de corriente del multímetro en un modo de voltaje: en pausa no registra, y al reanudar su ventana empieza en el
    // primer paso después de reanudar.
    let mut m = mixto(RC_CON_SONDAS, 1e-5);
    m.advance_to(1e-3, u32::MAX).unwrap();
    m.sonda_mut(1).unwrap().activar(false);
    let n = m.sonda(1).unwrap().registradas();
    m.advance_to(2e-3, u32::MAX).unwrap();
    assert_eq!(m.sonda(1).unwrap().registradas(), n);
    assert_eq!(m.sonda(0).unwrap().tiempo(), m.time());
    let pausa = m.time();
    m.sonda_mut(1).unwrap().activar(true);
    m.advance_to(3e-3, u32::MAX).unwrap();
    let i = m.sonda(1).unwrap();
    assert_eq!(i.tiempo(), m.time());
    assert!(i.cubre_desde() > pausa && i.cubre_desde() <= pausa + 1e-5, "cubre desde {}", i.cubre_desde());
    // La corriente de la resistencia en 3 ms: (5 − v) / 1 kΩ.
    assert!((i.valor_en(m.time()) - (5.0 - m.voltage(2)) / 1000.0).abs() < 1e-9);
}

/// La cuadrada de 1 MHz por un inversor de 5 ns sobre una carga de 10 kΩ: dos islas y una red digital entre ellas.
const INVERSOR_CON_SONDAS: &str = r#"{"nodes":3,"digital_nets":2,"elements":[
    {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":1e6}},
    {"type":"ADC","p":1,"n":0,"out":0,"in_low":1.5,"in_high":3.5},
    {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":5e-9,"fall_delay":5e-9},
    {"type":"DAC","input":1,"out":2,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":6.666666666666667e-9,"t_fall":6.666666666666667e-9},
    {"type":"R","a":2,"b":0,"ohms":10000}],
  "sondas":[
    {"kind":"v","p":1,"n":0,"muestras":4096,"columna":1e-8},
    {"kind":"v","p":2,"n":0,"muestras":4096,"columna":1e-8},
    {"kind":"d","red":1,"bajo":0,"alto":5,"muestras":1024,"columna":1e-8}]}"#;

#[test]
fn cada_sonda_va_al_tiempo_de_su_isla_y_la_digital_registra_los_eventos() {
    let mut m = mixto(INVERSOR_CON_SONDAS, 1e-9);
    m.advance_to(2e-6, u32::MAX).unwrap();
    assert_eq!(m.sonda(0).unwrap().tiempo(), m.tiempo_de_nodo(1));
    assert_eq!(m.sonda(1).unwrap().tiempo(), m.tiempo_de_nodo(2));
    let d = m.sonda(2).unwrap();
    assert_eq!(d.tiempo(), m.time());
    // La salida arranca en alto, baja unos 5 ns después del primer flanco (en t = 0) y sube 5 ns después de los 0.5 µs.
    assert_eq!(d.valor_en(0.3e-6), 0.0);
    assert_eq!(d.valor_en(0.6e-6), 5.0);
    let c = d.columna_en(0.0, 1e-6);
    assert!((c.iv - 5.0 * (5e-9 + 1e-6 - 505e-9)).abs() < 1.5e-9, "iv {}", c.iv);
}

#[test]
fn la_sonda_de_una_isla_quieta_llega_hasta_su_salto() {
    // El LED de una isla sin dinámica: la isla salta entre flancos sin pasar por `accept`, y su sonda registra el salto.
    let mut m = mixto(r#"{"nodes":4,"digital_nets":2,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":1000}},
        {"type":"ADC","p":1,"n":0,"out":0,"in_low":1.5,"in_high":3.5},
        {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":5e-9,"fall_delay":5e-9},
        {"type":"DAC","input":1,"out":2,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":7e-9,"t_fall":7e-9},
        {"type":"R","a":2,"b":3,"ohms":330},
        {"type":"D","a":3,"b":0,"is":1.5e-17,"n":2}],
      "sondas":[{"kind":"v","p":3,"n":0,"muestras":4096,"columna":1e-4}]}"#, 1e-5);
    m.advance_to(0.01, u32::MAX).unwrap();
    let s = m.sonda(0).unwrap();
    assert_eq!(s.tiempo(), m.tiempo_de_nodo(3));
    // Entre 9.5 y 10 ms la salida del inversor está en alto: el LED conduce a unos 1.69 V todo el intervalo.
    let c = s.columna_en(9.55e-3, 9.95e-3);
    assert!(!c.vacia() && (c.iv / 0.4e-3 - 1.69).abs() < 0.1, "promedio {}", c.iv / 0.4e-3);
}

#[test]
fn los_promedios_integran_cada_nodo_y_cada_elemento_desde_el_ultimo_reinicio() {
    let mut m = mixto(r#"{"nodes":4,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":10}},
        {"type":"R","a":1,"b":2,"ohms":1000},
        {"type":"R","a":2,"b":0,"ohms":1000},
        {"type":"V","a":3,"b":0,"wave":{"kind":"sine","offset":0,"amp":1,"freq":1000}},
        {"type":"R","a":3,"b":0,"ohms":1000}]}"#, 1e-5);
    m.activar_promedios();
    m.advance_to(1e-3, u32::MAX).unwrap();
    m.reiniciar_promedios();
    m.advance_to(3e-3, u32::MAX).unwrap();
    let (mut v, mut i) = (Vec::new(), Vec::new());
    let dur = m.promedios_into(&mut v, &mut i);
    assert!((dur - 2e-3).abs() < 1e-12, "duración {dur}");
    assert!((v[2] - 5.0).abs() < 1e-9, "divisor {}", v[2]);
    // Dos periodos completos de la senoidal: promedio casi cero (el trapezoidal con 100 pasos por periodo).
    assert!(v[3].abs() < 1e-4, "senoidal {}", v[3]);
    assert!((i[1] - 5e-3).abs() < 1e-12, "corriente {}", i[1]);
}

#[test]
fn sin_promedios_activados_la_duracion_es_cero_y_se_lee_el_ultimo_paso() {
    let mut m = mixto(RC_CON_SONDAS, 1e-5);
    m.advance_to(1e-3, u32::MAX).unwrap();
    let (mut v, mut i) = (Vec::new(), Vec::new());
    assert_eq!(m.promedios_into(&mut v, &mut i), 0.0);
    assert_eq!(v[2], m.voltage(2));
}

fn error(json: &str) -> String {
    match Netlist::from_json(json).and_then(|n| Mixto::new(n, 1e-6).map(|_| ())) {
        Err(EngineError::Invalid(m)) => m,
        otro => panic!("se esperaba un error de validación y salió {otro:?}"),
    }
}

#[test]
fn una_sonda_mal_formada_se_rechaza_con_su_numero() {
    let rc = r#"{"nodes":3,"elements":[{"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},{"type":"R","a":1,"b":2,"ohms":1000},{"type":"C","a":2,"b":0,"farads":1e-6}],"sondas":"#;
    assert!(error(&format!(r#"{rc}[{{"kind":"v","p":2,"n":2,"muestras":4096,"columna":1e-4}}]}}"#)).contains("sonda 0: sus dos nodos son el mismo"));
    assert!(error(&format!(r#"{rc}[{{"kind":"v","p":2,"n":0,"muestras":1000,"columna":1e-4}}]}}"#)).contains("potencia de dos"));
    assert!(error(&format!(r#"{rc}[{{"kind":"v","p":9,"n":0,"muestras":4096,"columna":1e-4}}]}}"#)).contains("nodo fuera de rango"));
    assert!(error(&format!(r#"{rc}[{{"kind":"i","element":1,"signo":2,"muestras":4096,"columna":1e-4}}]}}"#)).contains("signo"));
    assert!(error(&format!(r#"{rc}[{{"kind":"d","red":0,"bajo":0,"alto":5,"muestras":4096,"columna":1e-4}}]}}"#)).contains("red digital fuera de rango"));
    // Siete canales de 262,144 muestras pasan de 16 MiB.
    let canal = r#"{"kind":"v","p":2,"n":0,"muestras":262144,"columna":1e-4}"#;
    let siete = vec![canal; 7].join(",");
    assert!(error(&format!("{rc}[{siete}]}}")).contains("16 MiB"));
}

#[test]
fn una_sonda_de_voltaje_entre_dos_islas_se_rechaza() {
    let json = INVERSOR_CON_SONDAS.replace(r#"{"kind":"v","p":1,"n":0"#, r#"{"kind":"v","p":1,"n":2"#);
    assert!(error(&json).contains("sonda 0: sus dos nodos quedan en islas distintas"));
    let json = INVERSOR_CON_SONDAS.replace(r#"{"kind":"v","p":1,"n":0,"muestras":4096,"columna":1e-8}"#, r#"{"kind":"i","element":2,"signo":1,"muestras":4096,"columna":1e-8}"#);
    assert!(error(&json).contains("sonda 0: el elemento no existe o es digital"));
}

#[test]
fn una_netlist_sin_sondas_no_reserva_nada() {
    let m = mixto(r#"{"nodes":2,"elements":[{"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":1}},{"type":"R","a":1,"b":0,"ohms":1}]}"#, 1e-6);
    assert_eq!(m.n_sondas(), 0);
    assert_eq!(m.memoria_sondas(), 0);
}

#[test]
fn el_fusible_cambia_de_resistencia_en_caliente_sin_enfriarse() {
    // El multímetro pasa a «Instrumento ideal»: su fusible de 10 mΩ queda en 1 µΩ y conserva su calentamiento.
    use kirchi_engine::{Element, Transient};
    let mut tr = Transient::new(Netlist::from_json(r#"{"nodes":2,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":0.1}},
        {"type":"FUSE","a":1,"b":0,"ohms":0.01,"inom":10,"ifusion":20,"tau":0.125}]}"#).unwrap(), 1e-4).unwrap();
    tr.advance_to(1e-2, u32::MAX).unwrap();
    let calor = tr.readings()[1].aux;
    assert!(calor > 0.0);
    tr.set_element(1, Element::Fuse { a: 1, b: 0, ohms: 0.02, inom: 10.0, ifusion: 20.0, tau: 0.125, v: 0.0, sin_carga: false }).unwrap();
    tr.step().unwrap();
    assert!((tr.readings()[1].i - 5.0).abs() < 1e-9, "{}", tr.readings()[1].i);
    assert!(tr.readings()[1].aux >= calor * 0.99);
}


#[test]
fn el_multimetro_es_un_fusible_con_su_fuente_de_prueba_en_serie() {
    // El óhmetro en el rango de 10 kΩ con 1 V de prueba sobre 4.7 kΩ: V = 4.7 / 14.7, y la corriente de `a` a `b` por dentro
    // (la que entra por «+») es la que saca la prueba. `set_resistance` lo pasa al rango de 100 kΩ en caliente.
    use kirchi_engine::Transient;
    let mut tr = Transient::new(Netlist::from_json(r#"{"nodes":2,"elements":[
        {"type":"R","a":1,"b":0,"ohms":4700},
        {"type":"FUSE","a":1,"b":0,"ohms":10000,"inom":10,"ifusion":20,"tau":0.125,"v":1}]}"#).unwrap(), 1e-4).unwrap();
    tr.advance_to(1e-3, u32::MAX).unwrap();
    assert!((tr.voltage(1) - 4700.0 / 14700.0).abs() < 1e-9, "{}", tr.voltage(1));
    assert!((tr.readings()[1].i + 1.0 / 14700.0).abs() < 1e-12, "{}", tr.readings()[1].i);
    tr.set_resistance(1, 1e5).unwrap();
    tr.step().unwrap();
    assert!((tr.voltage(1) - 4700.0 / 104700.0).abs() < 1e-9, "{}", tr.voltage(1));
    // Sin la fuente (v de omisión) es un fusible como el.
    let sin = Netlist::from_json(r#"{"nodes":2,"elements":[{"type":"FUSE","a":1,"b":0,"ohms":1,"inom":1,"ifusion":2,"tau":0.1}]}"#).unwrap();
    assert!(matches!(sin.elements[0], kirchi_engine::Element::Fuse { v, .. } if v == 0.0));
}

#[test]
fn el_disparo_de_un_canal_en_una_isla_adelantada_se_encuentra_en_el_tiempo_del_otro_canal() {
    // Canal A: un generador de 50 kHz sobre 1 kΩ, una isla que la lógica no toca. Canal B: la salida de un inversor, en otra
    // isla que avanza de evento en evento. El osciloscopio pide el disparo de A en el tiempo de B (lo completo de los dos):
    // con A muchos milisegundos adelante, el anillo de 256 disparos ya no tiene los de ese instante.
    use kirchi_engine::sonda::{Acople, ConfigSonda, Disparo};
    let mut m = mixto(r#"{"nodes":5,"digital_nets":2,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"sine","offset":0,"amp":1,"freq":50000}},
        {"type":"R","a":1,"b":0,"ohms":1000},
        {"type":"V","a":2,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":1000}},
        {"type":"ADC","p":2,"n":0,"out":0,"in_low":1.5,"in_high":3.5},
        {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":5e-9,"fall_delay":5e-9},
        {"type":"DAC","input":1,"out":3,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":7e-9,"t_fall":7e-9},
        {"type":"R","a":3,"b":4,"ohms":330},
        {"type":"D","a":4,"b":0,"is":1.5e-17,"n":2}],
      "sondas":[{"kind":"v","p":1,"n":0,"muestras":262144,"columna":1e-6},{"kind":"v","p":3,"n":0,"muestras":4096,"columna":1e-6}]}"#, 2e-7);
    let d = Disparo { nivel: 0.3, subida: true, histeresis: 0.1 };
    m.sonda_mut(0).unwrap().configurar(&ConfigSonda { columna: 1e-6, acople: Acople::Dc, disparo: Some(d) });
    let mut adelanto: f64 = 0.0;
    let mut revisados = 0;
    while m.time() < 0.02 {
        // Llamadas cortas, como las del worker.
        m.advance_to(0.02, 20_000).unwrap();
        let (ta, tb) = (m.sonda(0).unwrap().tiempo(), m.sonda(1).unwrap().tiempo());
        adelanto = adelanto.max(ta - tb);
        // Lo completo de los dos canales, como el `hasta` del barrido.
        let tb = ta.min(tb);
        if tb < 1e-4 {
            continue;
        }
        let dado = m.sonda(0).unwrap().ultimo_disparo(tb).expect("sin disparo en el tiempo del otro canal");
        // El cruce de subida de 0.3 V más reciente antes de `tb`: sen(2π·50k·t) = 0.3.
        let fase = 0.3f64.asin() / (2.0 * std::f64::consts::PI);
        let k = (tb * 5e4 - fase).floor();
        let exacto = (k + fase) / 5e4;
        assert!((dado - exacto).abs() < 2e-8, "en {tb}: {dado} contra {exacto}");
        revisados += 1;
    }
    println!("adelanto máximo de la isla del canal A: {:.3} ms, {revisados} revisados", adelanto * 1e3);
    assert!(revisados >= 5);
    assert!(adelanto > 6e-3, "la isla del canal A no se adelantó: {adelanto}");
}

#[test]
fn la_sonda_no_registra_el_vector_cero_de_antes_del_primer_paso() {
    // Antes del primer paso la solución del motor es el vector cero: una fuente de 5 V se leería en 0 V en t = 0, el mínimo
    // de la primera columna sería 0 y el disparo de 2.5 V de subida dispararía en el primer paso sin que nada cruzara.
    use kirchi_engine::sonda::{Acople, ConfigSonda, Disparo};
    let mut m = mixto(r#"{"nodes":2,"elements":[{"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},{"type":"R","a":1,"b":0,"ohms":1000}],
      "sondas":[{"kind":"v","p":1,"n":0,"muestras":4096,"columna":1e-4}]}"#, 1e-5);
    assert_eq!(m.sonda(0).unwrap().tiempo(), f64::NEG_INFINITY);
    m.sonda_mut(0).unwrap().configurar(&ConfigSonda { columna: 1e-4, acople: Acople::Dc, disparo: Some(Disparo { nivel: 2.5, subida: true, histeresis: 0.1 }) });
    m.advance_to(1e-3, u32::MAX).unwrap();
    let s = m.sonda(0).unwrap();
    assert_eq!(s.columna_en(0.0, 1e-3).min, 5.0);
    assert!(s.ultimo_disparo(1.0).is_none());
}

#[test]
fn una_sonda_sin_rejilla_solo_guarda_sus_muestras() {
    // Las del multímetro (`sin_rejilla`): su lectura es la ventana sobre las muestras crudas y nunca pide columnas de la
    // rejilla, así que cada paso no la actualiza. Lo que el búfer ya no cubre queda vacío; la ventana es la misma.
    let json = |sin_rejilla: bool| {
        format!(r#"{{"nodes":3,"elements":[{{"type":"V","a":1,"b":0,"wave":{{"kind":"sine","offset":1,"amp":1,"freq":1000}}}},{{"type":"R","a":1,"b":2,"ohms":1000}},{{"type":"C","a":2,"b":0,"farads":1e-7}}],
          "sondas":[{{"kind":"v","p":2,"n":0,"muestras":1024,"columna":1e-3,"sin_rejilla":{sin_rejilla}}}]}}"#)
    };
    let (mut con, mut sin) = (mixto(&json(false), 1e-5), mixto(&json(true), 1e-5));
    con.advance_to(0.05, u32::MAX).unwrap();
    sin.advance_to(0.05, u32::MAX).unwrap();
    let (a, b) = (con.sonda(0).unwrap(), sin.sonda(0).unwrap());
    // Lo viejo (fuera de las 1,024 muestras): con rejilla, una columna gruesa; sin ella, vacía.
    assert!(!a.columna_en(0.01, 0.011).vacia());
    assert!(b.columna_en(0.01, 0.011).vacia());
    assert_eq!(a.ventana(0.045, 0.05).cifras(), b.ventana(0.045, 0.05).cifras());
    assert_eq!(a.columna_en(0.048, 0.049), b.columna_en(0.048, 0.049));
}
