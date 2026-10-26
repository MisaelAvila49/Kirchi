//! criterio 1: las corrientes por terminal de cada dispositivo suman cero, cumplen la ley de corrientes en cada nodo
//! y sus promedios son los de la corriente del elemento; los cambios de estado que se oyen, el quemado y la llegada exacta de
//! «Avanzar» a su meta.
use std::path::PathBuf;

use kirchi_engine::devices::CASILLAS_MAX;
use kirchi_engine::{Element, Mixto, Netlist};

fn mixto(json: &str, h: f64) -> Mixto {
    Mixto::new(Netlist::from_json(json).unwrap(), h).unwrap()
}

/// Las netlists de las referencias de ngspice (analógicas, digitales y de instrumentos), con su paso máximo y su tiempo final.
fn referencias() -> Vec<(String, Netlist, f64, f64)> {
    let carpeta = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("referencias");
    let mut casos: Vec<_> = std::fs::read_dir(&carpeta).unwrap().filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "json")).collect();
    casos.sort();
    casos
        .into_iter()
        .map(|p| {
            let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&p).unwrap()).unwrap();
            let net: Netlist = serde_json::from_value(v["netlist"].clone()).unwrap();
            (p.file_stem().unwrap().to_string_lossy().into_owned(), net, v["hmax"].as_f64().unwrap(), v["fin"].as_f64().unwrap())
        })
        .collect()
}

/// La suma de las casillas de cada elemento analógico (sus nodos y la tierra interna) y la mayor de ellas en valor absoluto.
fn sumas_por_elemento(m: &Mixto, net: &Netlist) -> Vec<(usize, f64, f64)> {
    let mut r = Vec::new();
    for (k, e) in net.elements.iter().enumerate() {
        let mut buf = [0.0; CASILLAS_MAX];
        if !m.corrientes_de(k, &mut buf) {
            assert!(e.es_digital(), "elemento {k} analógico sin corrientes por terminal");
            continue;
        }
        let n = e.nodes().len() + 1;
        let suma: f64 = buf[..n].iter().sum();
        let mayor = buf[..n].iter().fold(0.0f64, |a, b| a.max(b.abs()));
        r.push((k, suma, mayor));
    }
    r
}

#[test]
fn las_corrientes_por_terminal_de_cada_dispositivo_suman_cero_en_todas_las_referencias() {
    for (caso, net, h, fin) in referencias() {
        let mut m = Mixto::new(net.clone(), h).unwrap();
        // Diez instantes repartidos en el transitorio de la referencia.
        for paso in 1..=10 {
            m.advance_to(fin * paso as f64 / 10.0, u32::MAX).unwrap();
            for (k, suma, mayor) in sumas_por_elemento(&m, &net) {
                assert!(suma.abs() <= 1e-9 * mayor + 1e-15, "{caso}: elemento {k} suma {suma:e} A (la mayor de sus corrientes {mayor:e} A)");
            }
        }
    }
}

/// Lo que entra a cada nodo por todos los terminales que llegan a él (la tierra interna, al nodo 0) y la mayor corriente de esos
/// terminales.
fn kcl(m: &Mixto, net: &Netlist) -> Vec<(f64, f64)> {
    let mut suma = vec![0.0; net.nodes];
    let mut mayor = vec![0.0f64; net.nodes];
    for (k, e) in net.elements.iter().enumerate() {
        let mut buf = [0.0; CASILLAS_MAX];
        if !m.corrientes_de(k, &mut buf) {
            continue;
        }
        let nodos = e.nodes();
        for (j, &n) in nodos.iter().chain(std::iter::once(&0)).enumerate() {
            suma[n] += buf[j];
            mayor[n] = mayor[n].max(buf[j].abs());
        }
    }
    suma.into_iter().zip(mayor).collect()
}

#[test]
fn en_cada_nodo_lo_que_entra_por_los_terminales_suma_cero_al_converger() {
    // Lo que da Newton al converger: la tolerancia de corriente del motor es relativa (reltol 1e-3) más abstol (1e-12) por
    // dispositivo, y en un nodo se suman los de cada uno.
    let mut peor = (0.0f64, String::new());
    for (caso, net, h, fin) in referencias() {
        let mut m = Mixto::new(net.clone(), h).unwrap();
        m.advance_to(fin, u32::MAX).unwrap();
        for (n, (s, mayor)) in kcl(&m, &net).into_iter().enumerate().skip(1) {
            if mayor == 0.0 {
                continue;
            }
            let r = s.abs() / (mayor + 1e-9);
            if r > peor.0 {
                peor = (r, format!("{caso}, nodo {n}: {s:e} A con terminales de hasta {mayor:e} A"));
            }
            assert!(s.abs() <= 1e-3 * mayor + 1e-9, "{caso}: en el nodo {n} entran {s:e} A (terminales de hasta {mayor:e} A)");
        }
    }
    println!("peor ley de corrientes en un nodo: {:.2e} relativo ({})", peor.0, peor.1);
}

const DIVISOR_SENO: &str = r#"{"nodes":3,"elements":[
    {"type":"V","a":1,"b":0,"wave":{"kind":"sine","offset":1,"amp":2,"freq":1000}},
    {"type":"R","a":1,"b":2,"ohms":1000},
    {"type":"R","a":2,"b":0,"ohms":1000}]}"#;

#[test]
fn el_promedio_de_un_terminal_es_el_de_la_corriente_del_elemento_y_el_absoluto_no_es_menor() {
    let mut m = mixto(DIVISOR_SENO, 1e-5);
    m.activar_promedios();
    m.activar_terminales(true);
    m.advance_to(1e-3, u32::MAX).unwrap();
    m.reiniciar_promedios();
    m.advance_to(3e-3, u32::MAX).unwrap();
    let (mut v, mut i) = (Vec::new(), Vec::new());
    m.promedios_into(&mut v, &mut i);
    let (mut medias, mut abs) = (Vec::new(), Vec::new());
    let d = m.terminales_into(&mut medias, &mut abs);
    assert!((d - 2e-3).abs() < 1e-12, "duración {d}");
    // Tres casillas por elemento: a, b y la tierra interna. R1 (elemento 1) entra por el nodo 1.
    assert_eq!(medias.len(), 9);
    assert!((medias[3] - i[1]).abs() < 1e-12, "{} contra {}", medias[3], i[1]);
    assert!((medias[4] + i[1]).abs() < 1e-12);
    assert_eq!(medias[5], 0.0);
    // 1 V de desplazamiento sobre 2 kΩ: 0.5 mA de media; la senoidal de 2 V de pico pasa por cero y el absoluto es mayor.
    assert!((medias[3] - 0.5e-3).abs() < 1e-6, "media {}", medias[3]);
    assert!(abs[3] > medias[3] + 1e-4, "absoluto {} y media {}", abs[3], medias[3]);
    // Pura alterna (sin desplazamiento): media casi cero y absoluto 2/π del pico.
    let mut m = mixto(&DIVISOR_SENO.replace(r#""offset":1"#, r#""offset":0"#), 1e-5);
    m.activar_terminales(true);
    m.advance_to(1e-3, u32::MAX).unwrap();
    m.reiniciar_promedios();
    m.advance_to(3e-3, u32::MAX).unwrap();
    m.terminales_into(&mut medias, &mut abs);
    let pico = 2.0 / 2000.0;
    assert!(medias[3].abs() < 1e-3 * pico, "media {}", medias[3]);
    assert!((abs[3] - 2.0 / std::f64::consts::PI * pico).abs() < 1e-3 * pico, "absoluto {}", abs[3]);
}

#[test]
fn apagadas_las_corrientes_por_terminal_valen_cero_y_la_netlist_dice_sus_casillas() {
    let mut m = mixto(DIVISOR_SENO, 1e-5);
    m.advance_to(1e-3, u32::MAX).unwrap();
    assert_eq!(m.casillas_terminales(), 9);
    let (mut medias, mut abs) = (Vec::new(), Vec::new());
    m.terminales_into(&mut medias, &mut abs);
    assert!(medias.iter().chain(&abs).all(|&x| x == 0.0));
    // Las instantáneas sí se calculan (las pruebas contra ngspice).
    let mut buf = [0.0; CASILLAS_MAX];
    assert!(m.corrientes_de(1, &mut buf));
    assert!((buf[0] - m.readings()[1].i).abs() < 1e-15);
}

#[test]
fn la_potencia_media_de_una_resistencia_con_alterna_es_la_de_su_valor_eficaz() {
    let mut m = mixto(&DIVISOR_SENO.replace(r#""offset":1"#, r#""offset":0"#), 1e-5);
    m.activar_potencias(&[1, 2]).unwrap();
    m.advance_to(1e-3, u32::MAX).unwrap();
    m.reiniciar_promedios();
    m.advance_to(3e-3, u32::MAX).unwrap();
    let mut p = Vec::new();
    m.potencias_into(&mut p);
    // 1 V de pico sobre cada resistencia de 1 kΩ: (1/√2)² / 1000 = 0.5 mW, aunque la corriente media sea cero.
    for x in &p {
        assert!((x - 0.5e-3).abs() < 1e-3 * 0.5e-3, "potencia {x}");
    }
    assert!(m.activar_potencias(&[7]).is_err());
}

#[test]
fn el_zumbador_y_el_rele_registran_cada_cambio_con_su_instante_y_un_tope() {
    // Un zumbador con una cuadrada de 1 kHz: dos cambios por periodo.
    let mut m = mixto(r#"{"nodes":2,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":1000,"duty":0.5}},
        {"type":"BUZZER","a":1,"b":0,"ohms":166.7,"umbral":3}]}"#, 1e-5);
    m.advance_to(10.2e-3, u32::MAX).unwrap();
    let (c, perdidos) = m.take_cruces();
    assert_eq!(perdidos, 0);
    assert_eq!(c.len(), 21, "{c:?}");
    assert!(c.windows(2).all(|w| w[0].nivel != w[1].nivel && w[1].t > w[0].t));
    // Con 1 MHz en 5 ms serían 10,000 cambios: se guardan los primeros 4,096 y se cuentan los demás.
    let mut m = mixto(r#"{"nodes":2,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":1e6,"duty":0.5}},
        {"type":"BUZZER","a":1,"b":0,"ohms":166.7,"umbral":3}]}"#, 1e-8);
    m.advance_to(5e-3, u32::MAX).unwrap();
    let (c, perdidos) = m.take_cruces();
    assert_eq!(c.len(), kirchi_engine::transient::TOPE_CRUCES);
    assert!(perdidos as usize + c.len() >= 9_990, "{perdidos} perdidos");
    assert_eq!(m.take_cruces(), (Vec::new(), 0));
    // El relé de 5 V con su bobina a una cuadrada de 50 Hz: opera y libera una vez por periodo.
    let mut m = mixto(r#"{"nodes":4,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":50,"duty":0.5}},
        {"type":"RELAY","a1":1,"a2":0,"com":2,"na":3,"nc":0,"r":69.444,"l":0.20833,"ion":0.054,"ioff":0.0072},
        {"type":"V","a":2,"b":0,"wave":{"kind":"dc","v":5}},
        {"type":"R","a":3,"b":0,"ohms":100}]}"#, 1e-5);
    m.advance_to(0.1, u32::MAX).unwrap();
    let (c, _) = m.take_cruces();
    assert_eq!(c.iter().map(|x| x.nivel).collect::<Vec<_>>(), vec![1, 0, 1, 0, 1, 0, 1, 0, 1, 0], "{c:?}");
    assert!(c.iter().all(|x| x.element == 1));
}

const LED_SOBRE_5V: &str = r#"{"nodes":3,"elements":[
    {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
    {"type":"R","a":1,"b":2,"ohms":100},
    {"type":"D","a":2,"b":0,"is":1.5e-17,"n":2}]}"#;

#[test]
fn quemar_deja_abierta_la_pieza_y_reponerla_vuelve_a_su_corriente() {
    let mut m = mixto(LED_SOBRE_5V, 1e-5);
    m.advance_to(1e-3, u32::MAX).unwrap();
    let antes = m.readings()[2].i;
    assert!(antes > 0.02, "LED con {antes} A");
    m.quemar(2, true).unwrap();
    m.advance_to(2e-3, u32::MAX).unwrap();
    // Abierto: el nodo del LED sube a los 5 V de la fuente y no pasa corriente (1 GΩ).
    assert!((m.voltage(2) - 5.0).abs() < 1e-6, "{}", m.voltage(2));
    assert!(m.readings()[2].i.abs() < 1e-8);
    let mut buf = [0.0; CASILLAS_MAX];
    m.corrientes_de(2, &mut buf);
    assert!(buf[..3].iter().all(|x| x.abs() < 1e-8));
    // Quemar dos veces no hace nada; reponer vuelve al LED de antes.
    m.quemar(2, true).unwrap();
    m.quemar(2, false).unwrap();
    m.advance_to(3e-3, u32::MAX).unwrap();
    assert!((m.readings()[2].i - antes).abs() < 1e-3 * antes, "{} contra {antes}", m.readings()[2].i);
    // Un transistor con sus resistencias internas también (sus nodos internos quedan en cero) y una fuente no se quema.
    let mut q = mixto(r#"{"nodes":4,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":10}},
        {"type":"R","a":1,"b":2,"ohms":1000},
        {"type":"R","a":1,"b":3,"ohms":100000},
        {"type":"Q","c":2,"b":3,"e":0,"model":{"is":14.34e-15,"bf":255.9,"rb":10,"rc":1}}]}"#, 1e-5);
    q.advance_to(1e-3, u32::MAX).unwrap();
    q.quemar(3, true).unwrap();
    q.advance_to(2e-3, u32::MAX).unwrap();
    assert!((q.voltage(2) - 10.0).abs() < 1e-4, "colector {}", q.voltage(2));
    assert!(q.quemar(0, true).is_err());
}

#[test]
fn avanzar_llega_a_su_meta_con_todas_las_islas_en_el_mismo_instante() {
    // Una cuadrada de 1 kHz por un inversor 74HC hasta un LED: dos islas y la lógica.
    let json = r#"{"nodes":4,"digital_nets":2,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":1000,"duty":0.5}},
        {"type":"ADC","p":1,"n":0,"out":0,"in_low":1.5,"in_high":3.5},
        {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":8e-9,"fall_delay":8e-9},
        {"type":"DAC","input":1,"out":2,"v_lo":0,"v_hi":5,"r_lo":50,"r_hi":50,"t_rise":6e-9,"t_fall":6e-9},
        {"type":"R","a":2,"b":3,"ohms":330},
        {"type":"D","a":3,"b":0,"is":1.5e-17,"n":2}]}"#;
    let mut m = mixto(json, 1e-5);
    assert!(m.islas() >= 2);
    // Diez avances de 0.37 ms (que no caen en los flancos) y uno de un paso del motor.
    let mut meta = 0.0;
    for _ in 0..10 {
        meta += 0.37e-3;
        while m.time() < meta - m.hmin() {
            m.advance_to(meta, 200).unwrap();
        }
        for t in m.tiempos_de_islas() {
            assert!((t - meta).abs() <= m.hmin(), "una isla en {t} y la meta en {meta}");
        }
        assert!((m.time() - meta).abs() <= m.hmin());
    }
    // «Un paso del motor»: un paso de una isla no mueve `time()` si otra quedó atrás; se repite hasta que avanza.
    let antes = m.time();
    let mut llamadas = 0;
    while m.time() <= antes {
        m.advance_to(antes + 1e-5, 1).unwrap();
        llamadas += 1;
        assert!(llamadas < 100, "el tiempo no avanzó en {llamadas} pasos");
    }
    assert!(m.time() <= antes + 1e-5);
}

#[test]
fn el_zumbador_se_cambia_en_caliente_y_su_elemento_es_de_dos_terminales() {
    let mut m = mixto(r#"{"nodes":2,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
        {"type":"BUZZER","a":1,"b":0,"ohms":166.7,"umbral":3}]}"#, 1e-5);
    m.advance_to(1e-3, u32::MAX).unwrap();
    assert_eq!(m.readings()[1].estado, 1.0);
    m.set_element(1, Element::Buzzer { a: 1, b: 0, ohms: 960.0, umbral: 7.2 }).unwrap();
    m.advance_to(2e-3, u32::MAX).unwrap();
    assert_eq!(m.readings()[1].estado, 0.0);
    assert!((m.readings()[1].i - 5.0 / 960.0).abs() < 1e-9);
    assert!(Netlist::from_json(r#"{"nodes":2,"elements":[{"type":"BUZZER","a":1,"b":1,"ohms":100,"umbral":3}]}"#).is_err());
    assert!(Netlist::from_json(r#"{"nodes":2,"elements":[{"type":"BUZZER","a":1,"b":0,"ohms":100,"umbral":0}]}"#).is_err());
}

#[test]
#[cfg(feature = "faer")]
fn quemar_vale_igual_con_la_lu_densa_y_con_la_dispersa_y_rearma_la_base_de_las_estampas_fijas() {
    use kirchi_engine::transient::SolverKind;
    use kirchi_engine::Transient;
    // Una escalera de 30 resistencias de 1 kΩ con un LED al final: 32 incógnitas, de las que usan la LU dispersa.
    let mut el = vec![r#"{"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":12}}"#.to_string()];
    for k in 1..=30 {
        el.push(format!(r#"{{"type":"R","a":{k},"b":{},"ohms":10}}"#, k + 1));
    }
    el.push(r#"{"type":"D","a":31,"b":0,"is":1.5e-17,"n":2}"#.to_string());
    let json = format!(r#"{{"nodes":32,"elements":[{}]}}"#, el.join(","));
    let mut corrientes = Vec::new();
    for kind in [SolverKind::Dense, SolverKind::Sparse] {
        let mut tr = Transient::with_solver(Netlist::from_json(&json).unwrap(), 1e-5, kind).unwrap();
        tr.advance_to(1e-3, u32::MAX).unwrap();
        let antes = tr.readings()[31].i;
        // Se quema la resistencia 15 (una de estampa fija): todo lo de después queda sin corriente.
        tr.quemar(15, true).unwrap();
        tr.advance_to(2e-3, u32::MAX).unwrap();
        assert!(tr.readings()[31].i.abs() < 1e-7, "{kind:?}: {}", tr.readings()[31].i);
        assert!((tr.voltage(15) - 12.0).abs() < 1e-5, "{kind:?}: {}", tr.voltage(15));
        tr.quemar(15, false).unwrap();
        tr.advance_to(3e-3, u32::MAX).unwrap();
        assert!((tr.readings()[31].i - antes).abs() < 1e-6 * antes, "{kind:?}: {} contra {antes}", tr.readings()[31].i);
        corrientes.push(antes);
    }
    assert!((corrientes[0] - corrientes[1]).abs() < 1e-6 * corrientes[0]);
}

/// Dos islas con dinámica unidas por la lógica (una senoidal con su RC hasta un inversor, y el RC que maneja) y una isla sin
/// dinámica aparte (1 V sobre un fusible de 1 Ω con τ = 1 s, que se calienta como I²·(1 − e^(−t/τ))).
const TRES_ISLAS: &str = r#"{"nodes":6,"digital_nets":2,"elements":[
    {"type":"V","a":1,"b":0,"wave":{"kind":"sine","offset":2.5,"amp":2,"freq":1000}},
    {"type":"R","a":1,"b":2,"ohms":1000},
    {"type":"C","a":2,"b":0,"farads":1e-7},
    {"type":"ADC","p":2,"n":0,"out":0,"in_low":1.5,"in_high":3.5},
    {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":8e-9,"fall_delay":8e-9},
    {"type":"DAC","input":1,"out":3,"v_lo":0,"v_hi":5,"r_lo":50,"r_hi":50,"t_rise":6e-9,"t_fall":6e-9},
    {"type":"R","a":3,"b":4,"ohms":1000},
    {"type":"C","a":4,"b":0,"farads":1e-6},
    {"type":"V","a":5,"b":0,"wave":{"kind":"dc","v":1}},
    {"type":"FUSE","a":5,"b":0,"ohms":1,"inom":5,"ifusion":10,"tau":1}]}"#;

/// El calentamiento que el fusible de `TRES_ISLAS` debe llevar en el instante `t` (fracción del que lo funde).
fn calentamiento(t: f64) -> f64 {
    (1.0 - (-t).exp()) / 100.0
}

#[test]
fn con_metas_lejanas_la_isla_quieta_no_se_adelanta_y_se_calienta_lo_del_tiempo_simulado() {
    // Metas a una hora con pocos pasos por llamada. Las islas con dinámica van en orden topológico (la que influye en otra va
    // primero) y el worker acota la meta de cada ciclo con la capacidad medida; la isla del fusible, sin dinámica y sin
    // influir en otra, no pasa de la más adelantada de ellas.
    let mut m = mixto(TRES_ISLAS, 1e-5);
    assert!(m.islas() >= 3, "{} islas", m.islas());
    for _ in 0..30 {
        m.advance_to(m.time() + 3600.0, 200).unwrap();
        let hi = m.tiempos_de_islas().into_iter().fold(0.0f64, f64::max);
        let tf = m.tiempo_de_elemento(9);
        let dinamicas = [0usize, 6].iter().map(|&k| m.tiempo_de_elemento(k)).fold(0.0f64, f64::max);
        assert!(tf <= dinamicas + kirchi_engine::mixto::ADELANTO_QUIETA + 1e-9 && tf < 1.0, "el fusible en {tf} y las islas con dinámica hasta {dinamicas} ({hi})");
        let aux = m.readings()[9].aux;
        assert!((aux - calentamiento(tf)).abs() < 1e-6, "calentamiento {aux} en t = {tf} (debía ser {})", calentamiento(tf));
    }
}

#[test]
fn con_metas_de_un_ciclo_las_islas_llegan_juntas_y_el_fusible_se_calienta_lo_del_tiempo_simulado() {
    let mut m = mixto(TRES_ISLAS, 1e-5);
    for _ in 0..25 {
        let meta = m.time() + 4e-3;
        m.advance_to(meta, u32::MAX).unwrap();
        for t in m.tiempos_de_islas() {
            assert!((t - meta).abs() <= m.hmin(), "una isla en {t} y la meta en {meta}");
        }
        let aux = m.readings()[9].aux;
        assert!((aux - calentamiento(meta)).abs() < 1e-6, "calentamiento {aux} en t = {meta} (debía ser {})", calentamiento(meta));
    }
}

#[test]
fn reponer_una_pieza_quemada_no_da_un_pico_por_la_carga_que_tenia_al_quemarse() {
    // Un diodo de 1 µF de unión directo sobre una senoidal de 1 Hz y 0.3 V (nunca conduce): su corriente es la de su capacitancia,
    // del orden de C·dV/dt ≈ 2 µA. Se quema en 0.25 s (con 0.3 V) y se repone en 0.75 s (con −0.3 V): con la carga de cuando se
    // quemó, el primer paso daría C·0.6 V/h, decenas de mA.
    let mut m = mixto(r#"{"nodes":2,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"sine","offset":0,"amp":0.3,"freq":1}},
        {"type":"D","a":0,"b":1,"is":1e-14,"n":1,"cjo":1e-6}]}"#, 1e-4);
    m.advance_to(0.25, u32::MAX).unwrap();
    m.quemar(1, true).unwrap();
    m.advance_to(0.75, u32::MAX).unwrap();
    m.quemar(1, false).unwrap();
    let mut mayor = 0.0f64;
    for _ in 0..20 {
        let t = m.time();
        m.advance_to(t + 1e-4, 1).unwrap();
        mayor = mayor.max(m.readings()[1].i.abs());
    }
    assert!(mayor < 1e-4, "pico de {mayor} A al reponer");
}

#[test]
fn en_el_paso_en_que_el_foco_se_funde_sus_corrientes_son_las_de_la_solucion_del_paso() {
    // Un foco de 12 V y 5 W con 36 V: se funde. En ese paso la fuente entregó la corriente del filamento (con la resistencia
    // con que se resolvió el paso), y las corrientes por terminal del foco deben ser esas, no las del filamento ya abierto.
    let mut m = mixto(r#"{"nodes":2,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":36}},
        {"type":"LAMP","a":1,"b":0,"rfrio":2.88,"k":9,"pnom":5,"tau":0.05}]}"#, 1e-4);
    let mut buf_v = [0.0; CASILLAS_MAX];
    let mut buf_f = [0.0; CASILLAS_MAX];
    for _ in 0..200_000 {
        let t = m.time();
        m.advance_to(t + 1e-4, 1).unwrap();
        if m.readings()[1].estado == 1.0 {
            m.corrientes_de(0, &mut buf_v);
            m.corrientes_de(1, &mut buf_f);
            // En el nodo 1 entran la de la fuente por su «a» y la del foco por su «a»: suman cero.
            let (iv, if_) = (buf_v[0], buf_f[0]);
            assert!(iv.abs() > 0.1, "la fuente entregaba {iv} A en el paso");
            assert!((iv + if_).abs() <= 1e-3 * iv.abs(), "fuente {iv} A y foco {if_} A en el paso en que se fundió");
            return;
        }
    }
    panic!("el foco no se fundió");
}

#[test]
fn el_zumbador_dice_el_instante_del_cruce_dentro_del_paso_y_no_tiembla_en_su_umbral() {
    // Una senoidal de 10 Hz y 5 V de pico con pasos de 1 ms: cruza los 3 V en asin(0.6)/(2π·10) s, entre dos pasos.
    let mut m = mixto(r#"{"nodes":2,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"sine","offset":0,"amp":5,"freq":10}},
        {"type":"BUZZER","a":1,"b":0,"ohms":166.7,"umbral":3}]}"#, 1e-3);
    m.advance_to(0.03, u32::MAX).unwrap();
    let (c, _) = m.take_cruces();
    let esperado = (0.6f64).asin() / (2.0 * std::f64::consts::PI * 10.0);
    assert_eq!(c[0].nivel, 1, "{c:?}");
    assert!((c[0].t - esperado).abs() < 2e-5, "suena en {} y no en {esperado}", c[0].t);
    // Un voltaje que oscila 10 mV alrededor del umbral no lo hace sonar y callar en cada oscilación.
    let mut m = mixto(r#"{"nodes":2,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"sine","offset":3,"amp":0.01,"freq":1000}},
        {"type":"BUZZER","a":1,"b":0,"ohms":166.7,"umbral":3}]}"#, 1e-5);
    m.advance_to(0.02, u32::MAX).unwrap();
    let (c, _) = m.take_cruces();
    assert!(c.len() <= 1, "{} cambios con 10 mV alrededor del umbral", c.len());
}

#[test]
fn activar_las_corrientes_por_terminal_o_las_potencias_a_mitad_del_intervalo_no_baja_sus_medias() {
    // El transistor de las pruebas del quemado, en continua: su Ic es la misma todo el intervalo.
    let q = r#"{"nodes":4,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":10}},
        {"type":"R","a":1,"b":2,"ohms":1000},
        {"type":"R","a":1,"b":3,"ohms":100000},
        {"type":"Q","c":2,"b":3,"e":0,"model":{"is":14.34e-15,"bf":255.9,"rb":10,"rc":1}}]}"#;
    let mut m = mixto(q, 1e-5);
    m.activar_promedios();
    m.advance_to(1e-3, u32::MAX).unwrap();
    m.reiniciar_promedios();
    m.advance_to(2e-3, u32::MAX).unwrap();
    m.activar_terminales(true);
    m.activar_potencias(&[1]).unwrap();
    m.advance_to(3e-3, u32::MAX).unwrap();
    let (mut medias, mut abs) = (Vec::new(), Vec::new());
    m.terminales_into(&mut medias, &mut abs);
    // Casillas: la fuente, R1 y R2 llevan tres cada una; el colector del transistor es la 9.
    let a = 9;
    let ic = m.readings()[3].i;
    assert!((medias[a] - ic).abs() < 1e-6 * ic, "media de Ic {} contra {ic}", medias[a]);
    assert!((abs[a] - ic).abs() < 1e-6 * ic, "media de |Ic| {} contra {ic}", abs[a]);
    let mut p = Vec::new();
    m.potencias_into(&mut p);
    let pr = ic * ic * 1000.0;
    assert!((p[0] - pr).abs() < 1e-3 * pr, "potencia {} contra {pr}", p[0]);
}

#[test]
fn un_valor_nuevo_de_una_pieza_quemada_se_guarda_para_cuando_se_reponga() {
    // 10 V sobre 1 kΩ en serie con R2 de 1 kΩ: R2 quemada, se le pone 4 kΩ en caliente y al reponerla lleva 2 mA.
    let mut m = mixto(r#"{"nodes":3,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":10}},
        {"type":"R","a":1,"b":2,"ohms":1000},
        {"type":"R","a":2,"b":0,"ohms":1000}]}"#, 1e-5);
    m.advance_to(1e-3, u32::MAX).unwrap();
    m.quemar(2, true).unwrap();
    m.set_element(2, Element::R { a: 2, b: 0, ohms: 4000.0 }).unwrap();
    m.advance_to(2e-3, u32::MAX).unwrap();
    assert!(m.readings()[2].i.abs() < 1e-8, "quemada lleva {} A", m.readings()[2].i);
    m.quemar(2, false).unwrap();
    m.advance_to(3e-3, u32::MAX).unwrap();
    assert!((m.readings()[2].i - 2e-3).abs() < 1e-9, "repuesta lleva {} A", m.readings()[2].i);
}

#[test]
fn quemar_un_capacitor_o_un_motor_los_deja_abiertos_y_reponerlos_los_devuelve() {
    // Un electrolítico en directo: cargado a 5 V por 100 Ω. Quemado, se abre y deja de pasar corriente; repuesto, vuelve a cargarse.
    let mut c = mixto(r#"{"nodes":3,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
        {"type":"R","a":1,"b":2,"ohms":100},
        {"type":"C","a":2,"b":0,"farads":1e-6}]}"#, 1e-6);
    c.advance_to(1e-4, u32::MAX).unwrap();
    let carga = c.readings()[2].i;
    assert!(carga.abs() > 1e-3, "{carga}");
    c.quemar(2, true).unwrap();
    c.advance_to(1e-3, u32::MAX).unwrap();
    assert!((c.voltage(2) - 5.0).abs() < 1e-3, "{}", c.voltage(2));
    assert!(c.readings()[2].i.abs() < 1e-8);
    c.quemar(2, false).unwrap();
    c.advance_to(2e-3, u32::MAX).unwrap();
    assert!((c.voltage(2) - 5.0).abs() < 1e-2, "{}", c.voltage(2));

    // Un motor de 6 V a 13 V: gira y consume; quemado, no consume nada (su corriente de rama y su velocidad se anulan).
    let mut m = mixto(r#"{"nodes":2,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":13}},
        {"type":"MOTOR","a":1,"b":0,"r":3,"l":1.5e-3,"ke":6.05e-3,"j":2.4e-7,"bm":6.4e-7}]}"#, 1e-5);
    m.advance_to(0.05, u32::MAX).unwrap();
    assert!(m.readings()[1].i.abs() > 0.1);
    m.quemar(1, true).unwrap();
    m.advance_to(0.1, u32::MAX).unwrap();
    assert!(m.readings()[1].i.abs() < 1e-6, "{}", m.readings()[1].i);
    m.quemar(1, false).unwrap();
    m.advance_to(0.15, u32::MAX).unwrap();
    assert!(m.readings()[1].i.abs() > 0.1, "{}", m.readings()[1].i);
}

#[test]
fn quemar_un_amplificador_lo_deja_abierto_y_reponerlo_lo_devuelve() {
    // Seguidor de LM741 con ±15 V y 1 kΩ de carga: la salida sigue a la entrada (5 V) y entrega 5 mA. Quemado, no entrega nada
    // (la salida cae a 0 V por la carga); repuesto, vuelve a seguir a la entrada.
    let mut m = mixto(r#"{"nodes":5,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":15}},
        {"type":"V","a":0,"b":2,"wave":{"kind":"dc","v":15}},
        {"type":"V","a":3,"b":0,"wave":{"kind":"dc","v":5}},
        {"type":"OA","p":3,"n":4,"out":4,"vp":1,"vn":2,"model":{"a0":2e5,"gbw":1e6,"sr":0.5e6,"rin":2e6,"rout":75,"ilim":25e-3,"dhi":1,"dlo":1,"rq":17.6e3}},
        {"type":"R","a":4,"b":0,"ohms":1000}]}"#, 1e-6);
    m.advance_to(5e-3, u32::MAX).unwrap();
    assert!((m.voltage(4) - 5.0).abs() < 1e-3, "{}", m.voltage(4));
    m.quemar(3, true).unwrap();
    m.advance_to(10e-3, u32::MAX).unwrap();
    assert!(m.voltage(4).abs() < 1e-3, "quemado deja {} V", m.voltage(4));
    m.quemar(3, false).unwrap();
    m.advance_to(15e-3, u32::MAX).unwrap();
    assert!((m.voltage(4) - 5.0).abs() < 1e-2, "repuesto da {} V", m.voltage(4));
}
