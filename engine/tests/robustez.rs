//! Los circuitos difíciles simulan sin detenerse y ninguna entrada hace abortar el motor.

use std::panic::{catch_unwind, AssertUnwindSafe};
use std::time::{Duration, Instant};

use kirchi_engine::digital::Nivel;
use kirchi_engine::{Element, EngineError, Mixto, Netlist, Transient, Wave};

/// IRFZ44N que conmuta 1 mH y 10 Ω desde 12 V a 1 kHz; con `diodo`, el de protección entre drenador y alimentación.
fn mosfet_inductivo(diodo: bool) -> String {
    let d = if diodo { r#",{"type":"D","a":3,"b":1}"# } else { "" };
    format!(
        r#"{{"nodes":6,"elements":[
        {{"type":"V","a":1,"b":0,"wave":{{"kind":"dc","v":12}}}},
        {{"type":"V","a":4,"b":0,"wave":{{"kind":"square","low":0,"high":10,"freq":1000,"duty":0.5}}}},
        {{"type":"R","a":4,"b":2,"ohms":100}},
        {{"type":"L","a":1,"b":5,"henries":1e-3}},
        {{"type":"R","a":5,"b":3,"ohms":10}},
        {{"type":"M","d":3,"g":2,"s":0,"model":{{"vto":3,"kp":18,"lambda":0.01,"rd":4e-3,"rs":2e-3,"cbd":1.55e-9,"is":2e-14,"cgso":1.38e-9,"cgdo":88e-12,"w":1,"l":1}}}}{d}]}}"#
    )
}

#[test]
fn un_mosfet_con_carga_inductiva_y_diodo_simula_sin_detenerse() {
    let mut tr = Transient::new(Netlist::from_json(&mosfet_inductivo(true)).unwrap(), 1e-5).unwrap();
    let (mut pico_i, mut pico_v) = (0.0f64, 0.0f64);
    while tr.time() < 5e-3 {
        tr.advance_to(5e-3, 1).unwrap();
        pico_i = pico_i.max(tr.readings()[3].i);
        pico_v = pico_v.max(tr.voltage(3));
    }
    // La corriente sube hacia 12 V / 10 Ω con τ = 100 µs (casi 1.2 A en 0.5 ms) y el diodo sujeta el drenador
    // a menos de un volt sobre la alimentación al abrir.
    assert!(pico_i > 1.1 && pico_i < 1.2, "pico de corriente {pico_i}");
    assert!(pico_v > 12.5 && pico_v < 13.5, "pico de voltaje {pico_v}");
}

#[test]
fn sin_el_diodo_el_drenador_se_dispara_pero_la_simulacion_sigue() {
    let mut tr = Transient::new(Netlist::from_json(&mosfet_inductivo(false)).unwrap(), 1e-5).unwrap();
    let mut pico_v = 0.0f64;
    while tr.time() < 3e-3 {
        tr.advance_to(3e-3, 1).unwrap();
        pico_v = pico_v.max(tr.voltage(3));
    }
    // Sin camino para la corriente del inductor, el drenador oscila con la capacitancia de la unión: cientos de volts.
    assert!(pico_v > 100.0, "pico de voltaje {pico_v}");
}

#[test]
fn un_rele_sin_diodo_de_proteccion_tambien_simula() {
    // El 2N2222 corta la bobina sin diodo: el colector salta muy por encima de la alimentación y el motor sigue.
    let json = r#"{"nodes":6,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
        {"type":"V","a":4,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":25,"duty":0.5}},
        {"type":"R","a":4,"b":2,"ohms":4700},
        {"type":"Q","c":3,"b":2,"e":0,"model":{"is":14.34e-15,"bf":255.9,"vaf":74.03,"rb":10,"rc":1,"cjc":7.306e-12,"cje":22.01e-12}},
        {"type":"RELAY","a1":1,"a2":3,"com":1,"na":5,"nc":0,"r":69.444,"l":0.20833,"ion":0.054,"ioff":0.0072},
        {"type":"R","a":5,"b":0,"ohms":100}]}"#;
    let mut tr = Transient::new(Netlist::from_json(json).unwrap(), 1e-5).unwrap();
    let mut pico = 0.0f64;
    while tr.time() < 0.1 {
        tr.advance_to(0.1, 1).unwrap();
        pico = pico.max(tr.voltage(3));
    }
    assert!(pico > 50.0, "pico del colector {pico}");
}

/// Presupuesto de tiempo de pared de una corrida (construir, avanzar tres tramos y cambiar elementos).
const PRESUPUESTO: Duration = Duration::from_secs(5);

/// Los circuitos que la revisión encontró fallando o arrastrándose: cada uno con lo que debe pasar.
mod fijos {
    use super::*;
    use kirchi_engine::transient::SolverKind;

    /// Diodo de la librería (is = 1e-14, n = 1, sin rs) a un capacitor grande en paralelo con 1 kΩ, desde una fuente sin
    /// resistencia.
    fn diodo_a_capacitor(fuente: &str, farads: &str) -> String {
        format!(
            r#"{{"nodes":3,"elements":[
            {{"type":"V","a":1,"b":0,"wave":{fuente}}},
            {{"type":"D","a":1,"b":2}},
            {{"type":"C","a":2,"b":0,"farads":{farads}}},
            {{"type":"R","a":2,"b":0,"ohms":1000}}]}}"#
        )
    }

    /// Avanza hasta `fin`; falla si pasa de `max_pasos` o del presupuesto de tiempo.
    fn correr(json: &str, h: f64, fin: f64, max_pasos: u64) -> Result<Transient, EngineError> {
        let t0 = Instant::now();
        let mut tr = Transient::new(Netlist::from_json(json).unwrap(), h).unwrap();
        while tr.time() < fin {
            tr.advance_to(fin, 1000)?;
            assert!(tr.steps() <= max_pasos, "{json}: {} pasos y solo llegó a t = {:e}", tr.steps(), tr.time());
            assert!(t0.elapsed() < PRESUPUESTO, "{json}: tardó más de {PRESUPUESTO:?}");
        }
        Ok(tr)
    }

    #[test]
    fn el_pico_de_carga_de_un_capacitor_grande_no_es_un_error() {
        let dc = r#"{"kind":"dc","v":12}"#;
        let cuadrada = r#"{"kind":"square","low":0,"high":5,"freq":1000}"#;
        for (fuente, c, h) in [(dc, "1e-3", 1e-6), (dc, "4.7e-3", 1e-5), (cuadrada, "1e-3", 1e-6)] {
            let tr = correr(&diodo_a_capacitor(fuente, c), h, 5e-3, 2_000_000).unwrap_or_else(|e| panic!("{fuente} {c}: {e:?}"));
            assert!(tr.voltage(2) > 3.0, "{fuente} {c}: v = {}", tr.voltage(2));
        }
    }

    #[test]
    fn una_union_forzada_da_el_error_de_la_pieza_con_la_densa_y_con_la_dispersa() {
        let led = r#"{"nodes":2,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":9}},
            {"type":"D","a":1,"b":0,"is":1.5e-17,"n":2}]}"#;
        let bjt = r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"Q","c":2,"b":1,"e":0}]}"#;
        let mos = r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":12}},
            {"type":"R","a":2,"b":0,"ohms":1000},
            {"type":"M","d":0,"g":2,"s":1,"model":{"vto":3,"kp":18,"lambda":0.01,"is":2e-14,"cbd":1.55e-9,"cgso":1.38e-9,"cgdo":88e-12}}]}"#;
        for (json, elemento) in [(led, 1), (bjt, 2), (mos, 2)] {
            for kind in [SolverKind::Dense, SolverKind::Sparse] {
                let mut tr = Transient::with_solver(Netlist::from_json(json).unwrap(), 1e-5, kind).unwrap();
                assert_eq!(tr.advance_to(1e-3, 100), Err(EngineError::DiodoSinLimite { element: Some(elemento) }), "{json}");
            }
        }
    }

    #[test]
    fn un_foco_alimentado_con_corriente_se_funde_en_vez_de_desbocarse() {
        for (k, tau) in [("9", "0.05"), ("1000", "1e-6")] {
            let json = format!(
                r#"{{"nodes":2,"elements":[{{"type":"I","a":0,"b":1,"amps":1}},{{"type":"LAMP","a":1,"b":0,"rfrio":1,"k":{k},"pnom":5,"tau":{tau}}}]}}"#
            );
            let mut tr = correr(&json, 1e-4, 2.0, 2_000_000).unwrap_or_else(|e| panic!("k = {k}: {e:?}"));
            assert_eq!(tr.take_events().len(), 1, "k = {k}");
            assert!(tr.readings()[1].aux >= -1e-9);
        }
    }

    #[test]
    fn una_cuadrada_demasiado_rapida_se_rechaza_y_un_rele_que_se_corta_la_bobina_no_se_arrastra() {
        let cuadrada = |freq: &str| {
            format!(r#"{{"nodes":2,"elements":[{{"type":"V","a":1,"b":0,"wave":{{"kind":"square","low":0,"high":5,"freq":{freq}}}}},{{"type":"R","a":1,"b":0,"ohms":1000}}]}}"#)
        };
        for freq in ["1e9", "1e12"] {
            let r = Netlist::from_json(&cuadrada(freq)).and_then(|n| Transient::new(n, 1e-2));
            assert!(matches!(r, Err(EngineError::Invalid(_))), "freq = {freq}");
        }
        let rele = r#"{"nodes":4,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
            {"type":"RELAY","a1":2,"a2":0,"com":1,"na":3,"nc":2,"r":69.444,"l":1e-12,"ion":0.054,"ioff":0.0072},
            {"type":"R","a":3,"b":0,"ohms":100}]}"#;
        correr(rele, 1e-5, 0.05, 20_000).unwrap();
    }
}

/// Generador congruencial: las mismas netlists en cada corrida.
struct Azar(u64);
impl Azar {
    fn sig(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }
    fn nodo(&mut self, n: usize) -> usize {
        (self.sig() * n as f64) as usize % n
    }
    /// Entre `lo` y `hi`, repartido por décadas.
    fn log(&mut self, lo: f64, hi: f64) -> f64 {
        lo * (hi / lo).powf(self.sig())
    }
    /// Un valor de cualquier tamaño y a veces de signo raro, como el de un archivo manipulado.
    fn valor(&mut self) -> f64 {
        let ancho = if self.sig() < 0.7 { 16.0 } else { 40.0 };
        let e = (self.sig() * ancho - ancho / 2.0).round();
        let v = 10f64.powf(e) * (0.5 + self.sig());
        if self.sig() < 0.05 { -v } else if self.sig() < 0.02 { 0.0 } else { v }
    }
}

/// Un elemento al azar de los 13 tipos (la fuente de voltaje, en continua, senoidal o cuadrada).
fn elemento(r: &mut Azar, n: usize) -> String {
    let (a, b, c) = (r.nodo(n), r.nodo(n), r.nodo(n));
    let (d, e) = (r.nodo(n), r.nodo(n));
    match (r.sig() * 13.0) as usize {
        0 => format!(r#"{{"type":"R","a":{a},"b":{b},"ohms":{}}}"#, r.valor()),
        1 => format!(r#"{{"type":"C","a":{a},"b":{b},"farads":{}}}"#, r.valor()),
        2 => format!(r#"{{"type":"L","a":{a},"b":{b},"henries":{}}}"#, r.valor()),
        3 => {
            let onda = match (r.sig() * 3.0) as usize {
                0 => format!(r#"{{"kind":"dc","v":{}}}"#, r.valor()),
                1 => format!(r#"{{"kind":"sine","offset":{},"amp":{},"freq":{}}}"#, r.valor(), r.valor(), r.log(1.0, 1e6)),
                _ => format!(r#"{{"kind":"square","low":{},"high":{},"freq":{},"duty":{}}}"#, r.valor(), r.valor(), r.log(1.0, 1e6), 0.1 + 0.8 * r.sig()),
            };
            format!(r#"{{"type":"V","a":{a},"b":{b},"wave":{onda}}}"#)
        }
        4 => format!(r#"{{"type":"I","a":{a},"b":{b},"amps":{}}}"#, r.valor()),
        5 => format!(r#"{{"type":"D","a":{a},"b":{b},"is":{},"bv":{},"rs":{}}}"#, r.valor(), r.valor(), r.valor()),
        6 => format!(r#"{{"type":"Q","c":{a},"b":{b},"e":{c},"pnp":{},"model":{{"is":{},"bf":{},"rb":{},"cje":{}}}}}"#, r.sig() < 0.5, r.valor(), r.valor(), r.valor(), r.valor()),
        7 => format!(r#"{{"type":"M","d":{a},"g":{b},"s":{c},"pmos":{},"model":{{"vto":{},"kp":{},"rd":{},"cbd":{}}}}}"#, r.sig() < 0.5, r.valor(), r.valor(), r.valor(), r.valor()),
        8 => format!(r#"{{"type":"OA","p":{a},"n":{b},"out":{c},"vp":{d},"vn":{e},"model":{{"a0":{},"sr":{},"rout":{}}}}}"#, r.valor(), r.valor(), r.valor()),
        9 => format!(r#"{{"type":"LAMP","a":{a},"b":{b},"rfrio":{},"k":{},"pnom":{},"tau":{}}}"#, r.valor(), r.log(0.1, 1000.0), r.valor(), r.valor()),
        10 => format!(r#"{{"type":"MOTOR","a":{a},"b":{b},"r":{},"l":{},"ke":{},"j":{},"bm":{}}}"#, r.valor(), r.valor(), r.valor(), r.valor(), r.valor()),
        11 => format!(r#"{{"type":"FUSE","a":{a},"b":{b},"ohms":{},"inom":{},"ifusion":{},"tau":{}}}"#, r.valor(), r.valor(), r.valor(), r.valor()),
        _ => {
            let ion = r.valor();
            format!(r#"{{"type":"RELAY","a1":{a},"a2":{b},"com":{c},"na":{d},"nc":{e},"r":{},"l":{},"ion":{ion},"ioff":{}}}"#, r.valor(), r.valor(), ion * 0.9 * r.sig())
        }
    }
}

/// Un elemento al azar; con `valido`, uno que pasa la validación (se vuelve a sortear hasta 50 veces).
fn elemento_de(r: &mut Azar, n: usize, valido: bool) -> String {
    for _ in 0..50 {
        let e = elemento(r, n);
        if !valido || Netlist::from_json(&format!(r#"{{"nodes":{n},"elements":[{e}]}}"#)).is_ok() {
            return e;
        }
    }
    elemento(r, n)
}

#[derive(Default, Debug)]
struct Cuenta {
    /// Netlists que el motor aceptó construir.
    construidas: u32,
    /// De ellas, las que dieron al menos un paso aceptado (el tiempo avanzó).
    avanzaron: u32,
    /// De ellas, las que terminaron los tres tramos sin error del motor.
    completas: u32,
    /// Las que se detuvieron con un error en palabras, y de qué clase.
    con_error: u32,
    singular: u32,
    sin_convergencia: u32,
    union_sin_limite: u32,
    otro: u32,
}

/// Construye, avanza tres tramos con cambios en caliente entre ellos y comprueba lo que nunca debe pasar: tiempo que no avanza o
/// retrocede, voltajes o lecturas que no son finitos, y pasar del presupuesto de tiempo.
fn correr(json: &str, h: f64, r: &mut Azar, cuenta: &mut Cuenta) {
    let Ok(net) = Netlist::from_json(json) else { return };
    let resistencias: Vec<usize> = net.elements.iter().enumerate().filter(|(_, e)| matches!(e, Element::R { .. })).map(|(k, _)| k).collect();
    let fuentes: Vec<(usize, usize, usize)> =
        net.elements.iter().enumerate().filter_map(|(k, e)| if let Element::V { a, b, .. } = e { Some((k, *a, *b)) } else { None }).collect();
    let total = net.elements.len();
    let Ok(mut tr) = Transient::new(net, h) else { return };
    cuenta.construidas += 1;
    let t0 = Instant::now();
    let mut avanzo = false;
    for tramo in 0..3 {
        if tramo > 0 {
            // Cambios en caliente entre tramos: una resistencia, una fuente o la reposición de un elemento.
            match (r.sig() * 3.0) as usize {
                0 if !resistencias.is_empty() => {
                    let _ = tr.set_resistance(resistencias[r.nodo(resistencias.len())], r.log(1e-3, 1e9));
                }
                1 if !fuentes.is_empty() => {
                    let (k, a, b) = fuentes[r.nodo(fuentes.len())];
                    let _ = tr.set_element(k, Element::V { a, b, wave: Wave::Dc { v: r.valor().clamp(-1e3, 1e3) } });
                }
                _ => {
                    let _ = tr.reset_element(r.nodo(total));
                }
            }
        }
        let antes = tr.time();
        if let Err(e) = tr.advance_to(antes + 50.0 * h, 400) {
            cuenta.con_error += 1;
            match e {
                EngineError::Singular { .. } => cuenta.singular += 1,
                EngineError::NoConvergence { .. } => cuenta.sin_convergencia += 1,
                EngineError::DiodoSinLimite { .. } => cuenta.union_sin_limite += 1,
                _ => cuenta.otro += 1,
            }
            // Un error deja el estado intacto: lo que se lee sigue siendo finito.
            assert!(tr.voltages().iter().all(|v| v.is_finite()), "voltajes que no son finitos tras el error con {json} y h = {h}");
            break;
        }
        if tr.time() > antes {
            avanzo = true;
        }
        assert!(tr.time().is_finite() && tr.time() >= antes, "el tiempo no es finito o retrocede con {json} y h = {h}");
        assert!(tr.voltages().iter().all(|v| v.is_finite()), "voltajes que no son finitos con {json} y h = {h}");
        assert!(
            tr.readings().iter().all(|l| l.i.is_finite() && l.aux.is_finite() && l.estado.is_finite()),
            "lecturas que no son finitas con {json} y h = {h}"
        );
        assert!(t0.elapsed() < PRESUPUESTO, "tardó más de {PRESUPUESTO:?} con {json} y h = {h}");
        if tramo == 2 {
            cuenta.completas += 1;
        }
    }
    if avanzo {
        cuenta.avanzaron += 1;
    }
}

#[test]
fn ninguna_netlist_al_azar_hace_abortar_ni_arrastrar_el_motor() {
    let mut r = Azar(7);
    let (mut validas, mut crudas) = (Cuenta::default(), Cuenta::default());
    let (mut n_validas, mut n_crudas) = (0u32, 0u32);
    for _ in 0..1000 {
        let n = 2 + r.nodo(6);
        let k = 1 + r.nodo(8);
        // Nueve de cada diez netlists traen solo elementos que pasan la validación (con valores extremos dentro de sus cotas)
        // y 1 MΩ de cada nodo a tierra, para que ningún nodo quede flotante; la décima trae elementos al azar y casi
        // siempre se rechaza con un error en palabras.
        let valida = r.sig() < 0.9;
        let mut elementos: Vec<String> = (0..k).map(|_| elemento_de(&mut r, n, valida)).collect();
        if valida {
            elementos.extend((1..n).map(|nodo| format!(r#"{{"type":"R","a":{nodo},"b":0,"ohms":1e6}}"#)));
        }
        let json = format!(r#"{{"nodes":{n},"elements":[{}]}}"#, elementos.join(","));
        let h = if valida { r.valor().abs().clamp(1e-9, 1e-3) } else { r.valor().abs().max(1e-12) };
        let cuenta = if valida {
            n_validas += 1;
            &mut validas
        } else {
            n_crudas += 1;
            &mut crudas
        };
        if catch_unwind(AssertUnwindSafe(|| correr(&json, h, &mut r, cuenta))).is_err() {
            panic!("el motor abortó o falló una comprobación con {json} y h = {h}");
        }
    }
    println!("netlists válidas {n_validas}: {validas:?}");
    println!("netlists crudas {n_crudas}: {crudas:?}");
    assert!(validas.construidas * 10 >= n_validas * 9, "construidas: {validas:?} de {n_validas}");
    assert!(validas.avanzaron * 10 >= n_validas * 6, "avanzaron: {validas:?} de {n_validas}");
}

/// Un elemento digital o puente al azar sobre `n` nodos. Una salida de cada 500 repite una red para probar salidas unidas, y los retardos a veces salen de su rango (como en un archivo manipulado).
fn digital(r: &mut Azar, n: usize, d: usize, sal: &mut usize) -> String {
    let red = |r: &mut Azar| r.nodo(d);
    let mut nueva = |r: &mut Azar| {
        if r.sig() < 0.002 {
            r.nodo(d)
        } else {
            *sal += 1;
            *sal - 1
        }
    };
    let ret = |r: &mut Azar| if r.sig() < 0.99 { r.log(1e-12, 1e-3) } else { r.valor() };
    let nodo = |r: &mut Azar| r.nodo(n);
    // Un nodo que casi nunca es la tierra (la salida de un puente no puede serlo).
    let vivo = |r: &mut Azar| if r.sig() < 0.03 { 0 } else { 1 + r.nodo(n - 1) };
    match (r.sig() * 10.0) as usize {
        0 => {
            let f = ["not", "buf", "and", "or", "nand", "nor", "xor"][r.nodo(7)];
            let k = if f == "not" || f == "buf" { 1 } else { 2 + r.nodo(3) };
            let entradas: Vec<String> = (0..k).map(|_| red(r).to_string()).collect();
            let o = nueva(r);
            format!(r#"{{"type":"GATE","fn":"{f}","inputs":[{}],"output":{o},"rise_delay":{},"fall_delay":{}}}"#, entradas.join(","), ret(r), ret(r))
        }
        1 => {
            let o = nueva(r);
            format!(r#"{{"type":"LOGIC","out":{o},"value":{}}}"#, r.nodo(2))
        }
        2 => {
            let e: Vec<usize> = (0..4).map(|_| red(r)).collect();
            let (q, qn) = (nueva(r), nueva(r));
            format!(
                r#"{{"type":"DFF","d":{},"clk":{},"pre":{},"clr":{},"q":{q},"qn":{qn},"rise_delay":{},"fall_delay":{}}}"#,
                e[0], e[1], e[2], e[3], ret(r), ret(r)
            )
        }
        3 => {
            let e: Vec<usize> = (0..5).map(|_| red(r)).collect();
            let (q, qn) = (nueva(r), nueva(r));
            format!(
                r#"{{"type":"JKFF","j":{},"k":{},"clk":{},"pre":{},"clr":{},"q":{q},"qn":{qn},"rise_delay":{},"fall_delay":{}}}"#,
                e[0], e[1], e[2], e[3], e[4], ret(r), ret(r)
            )
        }
        4 => {
            let (clk, rst) = (red(r), red(r));
            let q: Vec<usize> = (0..5).map(|_| nueva(r)).collect();
            format!(
                r#"{{"type":"COUNTER","clk":{clk},"rst":{rst},"q":[{},{},{},{}],"co":{},"modulo":{},"rise_delay":{},"fall_delay":{}}}"#,
                q[0], q[1], q[2], q[3], q[4], if r.sig() < 0.5 { 10 } else { 16 }, ret(r), ret(r)
            )
        }
        5 => {
            let entradas: Vec<String> = (0..4).map(|_| red(r).to_string()).collect();
            let salidas: Vec<String> = (0..7).map(|_| nueva(r).to_string()).collect();
            format!(
                r#"{{"type":"DECODER","inputs":[{}],"outputs":[{}],"activo_alto":{},"rise_delay":{},"fall_delay":{}}}"#,
                entradas.join(","), salidas.join(","), r.sig() < 0.5, ret(r), ret(r)
            )
        }
        6 => {
            let (lo, hi) = (r.valor().clamp(-1e3, 1e3), r.valor().clamp(-1e3, 1e3));
            let carga = if r.sig() < 0.3 { format!(r#","r_in":{},"v_in":{}"#, r.log(1e2, 1e6), r.valor().clamp(-1e3, 1e3)) } else { String::new() };
            let p = nodo(r);
            let q = match nodo(r) {
                q if q == p && r.sig() < 0.95 => (p + 1) % n,
                q => q,
            };
            let o = nueva(r);
            format!(r#"{{"type":"ADC","p":{p},"n":{q},"out":{o},"in_low":{},"in_high":{}{carga}}}"#, lo.min(hi), lo.max(hi))
        }
        7 => format!(
            r#"{{"type":"DAC","input":{},"out":{},"v_lo":{},"v_hi":{},"r_lo":{},"r_hi":{},"t_rise":{},"t_fall":{}}}"#,
            red(r), vivo(r), r.valor().clamp(-1e3, 1e3), r.valor().clamp(-1e3, 1e3), r.log(1e-3, 1e6), r.log(1e-3, 1e6), ret(r), ret(r)
        ),
        8 => {
            let e: Vec<usize> = (0..3).map(|_| red(r)).collect();
            let q = nueva(r);
            format!(r#"{{"type":"LATCH555","trig":{},"thr":{},"res":{},"q":{q},"delay":{}}}"#, e[0], e[1], e[2], ret(r))
        }
        _ => format!(
            r#"{{"type":"OUT555","q":{},"out":{},"dis":{},"vcc":{},"gnd":{},"v_lo":0.025,"r_lo":7.5,"v_hi":-1.4,"r_hi":3,"g_on":{},"g_off":1e-9,"t_rise":{},"t_fall":{}}}"#,
            red(r), vivo(r), nodo(r), nodo(r), nodo(r), r.log(1e-6, 1e3), ret(r), ret(r)
        ),
    }
}

/// Construye un circuito mixto, lo avanza tres tramos conmutando un estado lógico entre ellos y comprueba lo que nunca debe
/// pasar. Devuelve None si la netlist no se aceptó, y si terminó los tres tramos sin error del motor.
fn correr_mixto(json: &str, h: f64, r: &mut Azar) -> Option<bool> {
    let net = Netlist::from_json(json).ok()?;
    let logicos: Vec<(usize, usize)> = net.elements.iter().enumerate().filter_map(|(k, e)| if let Element::Logic { out, .. } = e { Some((k, *out)) } else { None }).collect();
    let mut m = Mixto::new(net, h).ok()?;
    m.set_event_budget(20_000);
    let t0 = Instant::now();
    for tramo in 0..3 {
        if tramo > 0 {
            if let Some(&(k, out)) = logicos.get(r.nodo(logicos.len().max(1))) {
                let _ = m.set_element(k, Element::Logic { out, value: r.nodo(2) as u8 });
            }
        }
        let antes = m.time();
        if m.advance_to(antes + 50.0 * h, 400).is_err() {
            assert!(m.voltages().iter().all(|v| v.is_finite()), "voltajes que no son finitos tras el error con {json} y h = {h}");
            return Some(false);
        }
        assert!(m.time().is_finite() && m.time() >= antes, "el tiempo no es finito o retrocede con {json} y h = {h}");
        assert!(m.voltages().iter().all(|v| v.is_finite()), "voltajes que no son finitos con {json} y h = {h}");
        assert!(m.readings().iter().all(|l| l.i.is_finite() && l.aux.is_finite() && l.estado.is_finite()), "lecturas que no son finitas con {json}");
        for red in 0..m.digital_count() {
            let (f, c, _) = m.medida(red);
            assert!(f.is_finite() && c.is_finite(), "medidas que no son finitas con {json}");
        }
        // Invariante de la lógica: cada salida de un modelo vale lo que el modelo pide con sus entradas de ahora, salvo que
        // tenga un cambio pendiente hacia eso.
        if let Err(e) = m.comprobar_logica() {
            panic!("la lógica quedó inconsistente con {json} y h = {h}: {e}");
        }
        assert!(t0.elapsed() < PRESUPUESTO, "tardó más de {PRESUPUESTO:?} con {json} y h = {h}");
    }
    Some(true)
}

/// Criterio 3: la prueba de netlists al azar, con elementos digitales y puentes.
#[test]
fn ninguna_netlist_mixta_al_azar_hace_abortar_ni_arrastrar_el_motor() {
    let mut r = Azar(11);
    let (mut construidas, mut completas) = (0u32, 0u32);
    for _ in 0..400 {
        let n = 2 + r.nodo(5);
        let d = 1 + r.nodo(8);
        let mut sal = 0;
        let mut el: Vec<String> = (0..1 + r.nodo(4)).map(|_| elemento_de(&mut r, n, true)).collect();
        el.extend((0..1 + r.nodo(8)).map(|_| digital(&mut r, n, d, &mut sal)));
        el.extend((1..n).map(|nodo| format!(r#"{{"type":"R","a":{nodo},"b":0,"ohms":1e6}}"#)));
        let redes = d.max(sal);
        let json = format!(r#"{{"nodes":{n},"digital_nets":{redes},"elements":[{}]}}"#, el.join(","));
        let h = r.valor().abs().clamp(1e-9, 1e-3);
        match catch_unwind(AssertUnwindSafe(|| correr_mixto(&json, h, &mut r))) {
            Err(_) => panic!("el motor abortó o falló una comprobación con {json} y h = {h}"),
            Ok(Some(c)) => {
                construidas += 1;
                completas += u32::from(c);
            }
            Ok(None) => {}
        }
    }
    println!("netlists mixtas: 400, construidas {construidas}, completas {completas}");
    assert!(construidas >= 300, "solo {construidas} de 400 se construyeron");
}

/// Tres inversores en anillo (9 ns cada uno) no se asientan al arrancar: oscilan a 18.5 MHz y cada llamada devuelve el
/// control al agotar su presupuesto de eventos.
#[test]
fn un_anillo_de_tres_inversores_oscila_y_devuelve_el_control() {
    let mut m = Mixto::new(
        Netlist::from_json(r#"{"nodes":1,"digital_nets":3,"elements":[
            {"type":"GATE","fn":"not","inputs":[2],"output":0,"rise_delay":9e-9,"fall_delay":9e-9},
            {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":9e-9,"fall_delay":9e-9},
            {"type":"GATE","fn":"not","inputs":[1],"output":2,"rise_delay":9e-9,"fall_delay":9e-9}]}"#)
        .unwrap(),
        1e-5,
    )
    .unwrap();
    assert!(!m.lazo_de_arranque().is_empty());
    m.set_event_budget(10_000);
    let mut peor = Duration::ZERO;
    let mut llamadas = 0;
    while m.time() < 1e-3 {
        let t = Instant::now();
        m.advance_to(1e-3, u32::MAX).unwrap();
        peor = peor.max(t.elapsed());
        llamadas += 1;
    }
    let (f, ciclo, _) = m.medida(0);
    println!("anillo: {:.2} MHz, {llamadas} llamadas, la más larga {peor:?}", f / 1e6);
    assert!((f - 1.0 / 54e-9).abs() / f < 1e-6 && (ciclo - 0.5).abs() < 1e-6, "f = {f}, ciclo = {ciclo}");
    // Unos 111,000 cambios por milisegundo simulado: con 10,000 por llamada hacen falta al menos 11 llamadas.
    assert!(llamadas >= 11, "{llamadas} llamadas");
    assert!(peor < Duration::from_millis(200), "una llamada tardó {peor:?}");
}

/// Un latch SR de dos NAND con sus dos entradas soltadas a la vez oscila como en XSPICE (las dos salidas juntas, una vez por
/// retardo) y no cuelga el motor.
#[test]
fn un_latch_soltado_a_la_vez_oscila_sin_colgarse() {
    let mut m = Mixto::new(
        Netlist::from_json(r#"{"nodes":1,"digital_nets":3,"elements":[
            {"type":"LOGIC","out":0,"value":0},
            {"type":"GATE","fn":"nand","inputs":[0,2],"output":1,"rise_delay":5e-9,"fall_delay":5e-9},
            {"type":"GATE","fn":"nand","inputs":[0,1],"output":2,"rise_delay":5e-9,"fall_delay":5e-9}]}"#)
        .unwrap(),
        1e-5,
    )
    .unwrap();
    m.advance_to(1e-6, u32::MAX).unwrap();
    m.set_element(0, Element::Logic { out: 0, value: 1 }).unwrap();
    m.advance_to(2e-6, u32::MAX).unwrap();
    let (f, _, _) = m.medida(1);
    assert!((f - 1.0 / 10e-9).abs() / f < 1e-6, "f = {f}");
    assert_eq!(m.medida(1).2, m.medida(2).2);
}

/// Una entrada CMOS al aire lee X, la compuerta da X y su puente de salida queda a la mitad de la alimentación.
#[test]
fn una_entrada_al_aire_da_x_y_la_salida_queda_a_la_mitad() {
    let mut m = Mixto::new(
        Netlist::from_json(r#"{"nodes":2,"digital_nets":2,"elements":[
            {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":5e-9,"fall_delay":5e-9},
            {"type":"DAC","input":1,"out":1,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":7e-9,"t_fall":7e-9},
            {"type":"R","a":1,"b":0,"ohms":10000}]}"#)
        .unwrap(),
        1e-6,
    )
    .unwrap();
    assert_eq!((m.nivel(0), m.nivel(1)), (Nivel::Z, Nivel::X));
    m.advance_to(1e-5, u32::MAX).unwrap();
    assert!((m.voltage(1) - 2.5 * 10000.0 / 10055.0).abs() < 1e-9, "v = {}", m.voltage(1));
}

/// 4,096 redes digitales, el límite de la vista previa: una cadena de 4,095 inversores declarada al revés (el último primero)
/// se asienta en el arranque sin parecer un lazo y no deja eventos pendientes.
#[test]
fn una_cadena_de_4096_redes_declarada_al_reves_se_asienta_al_arrancar() {
    let mut el = vec![r#"{"type":"LOGIC","out":0,"value":1}"#.to_string()];
    for k in (1..4096).rev() {
        el.push(format!(r#"{{"type":"GATE","fn":"not","inputs":[{}],"output":{k},"rise_delay":1e-9,"fall_delay":1e-9}}"#, k - 1));
    }
    let net = Netlist::from_json(&format!(r#"{{"nodes":1,"digital_nets":4096,"elements":[{}]}}"#, el.join(","))).unwrap();
    net.check_limits(kirchi_engine::netlist::LIMITE_REDES, kirchi_engine::netlist::LIMITE_ELEMENTOS).unwrap();
    let t0 = Instant::now();
    let mut m = Mixto::new(net, 1e-6).unwrap();
    let arranque = t0.elapsed();
    println!("cadena de 4,095 inversores: arranque en {arranque:?}, {} modelos en el lazo", m.lazo_de_arranque().len());
    assert!(m.lazo_de_arranque().is_empty(), "una cadena no es un lazo");
    assert!((0..4096).all(|k| m.nivel(k) == if k % 2 == 0 { Nivel::Uno } else { Nivel::Cero }));
    m.registrar_cambios(true);
    m.advance_to(1e-3, u32::MAX).unwrap();
    assert!(m.tomar_cambios().is_empty(), "la cadena ya estaba asentada");
    assert!(arranque < Duration::from_millis(500), "el arranque tardó {arranque:?}");
}

/// Un anillo de tres inversores de 1 ps junto a una isla analógica: cada llamada devuelve el control al agotar su
/// presupuesto de eventos, el tiempo avanza poco a poco (es el de la lógica, que va atrás) y la isla no se arrastra.
#[test]
fn un_anillo_de_1_ps_con_una_isla_analogica_devuelve_el_control() {
    let mut m = Mixto::new(
        Netlist::from_json(r#"{"nodes":3,"digital_nets":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"sine","offset":0,"amp":5,"freq":1000}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"C","a":2,"b":0,"farads":1e-6},
            {"type":"GATE","fn":"not","inputs":[2],"output":0,"rise_delay":1e-12,"fall_delay":1e-12},
            {"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":1e-12,"fall_delay":1e-12},
            {"type":"GATE","fn":"not","inputs":[1],"output":2,"rise_delay":1e-12,"fall_delay":1e-12}]}"#)
        .unwrap(),
        1e-5,
    )
    .unwrap();
    m.set_event_budget(100_000);
    let mut peor = Duration::ZERO;
    let mut antes = m.time();
    for _ in 0..20 {
        let t = Instant::now();
        m.advance_to(1e-3, u32::MAX).unwrap();
        peor = peor.max(t.elapsed());
        assert!(m.time() > antes, "el tiempo no avanzó");
        antes = m.time();
    }
    let (f, _, cambios) = m.medida(0);
    println!("anillo de 1 ps: {:.1} GHz, {cambios} cambios en la red 0, t = {:.3e} s, la llamada más larga {peor:?}", f / 1e9, m.time());
    // 20 llamadas de 100,000 eventos son 2 millones de eventos, uno por picosegundo: 2 µs de anillo. La lógica va atrás y
    // manda el tiempo, aunque el RC ya llegó a 1 ms.
    assert!(m.time() < 1e-5, "t = {}", m.time());
    assert!(peor < Duration::from_millis(200), "una llamada tardó {peor:?}");
    assert!((f - 1.0 / 6e-12).abs() / f < 1e-6, "f = {f}");
}

/// Un estado lógico con un abanico de 4,000 inversores: conmutarlo cambia las 4,000 salidas un retardo después, en una
/// llamada corta.
#[test]
fn un_abanico_de_miles_de_entradas_conmuta_completo() {
    let mut el = vec![r#"{"type":"LOGIC","out":0,"value":0}"#.to_string()];
    for k in 1..=4000 {
        el.push(format!(r#"{{"type":"GATE","fn":"not","inputs":[0],"output":{k},"rise_delay":2e-9,"fall_delay":3e-9}}"#));
    }
    let net = Netlist::from_json(&format!(r#"{{"nodes":1,"digital_nets":4001,"elements":[{}]}}"#, el.join(","))).unwrap();
    let mut m = Mixto::new(net, 1e-6).unwrap();
    m.advance_to(1e-6, u32::MAX).unwrap();
    assert!((1..=4000).all(|k| m.nivel(k) == Nivel::Uno));
    m.set_element(0, Element::Logic { out: 0, value: 1 }).unwrap();
    m.registrar_cambios(true);
    let t = Instant::now();
    m.advance_to(2e-6, u32::MAX).unwrap();
    let dura = t.elapsed();
    let cambios = m.tomar_cambios();
    println!("abanico de 4,000: {} cambios en {dura:?}", cambios.len());
    assert_eq!(cambios.len(), 4001);
    let t_logic = cambios.iter().find(|c| c.1 == 0).unwrap().0;
    assert!(cambios.iter().filter(|c| c.1 > 0).all(|c| c.2 == Nivel::Cero && (c.0 - (t_logic + 3e-9)).abs() < 2e-12), "{:?}", &cambios[..3]);
    assert!(dura < Duration::from_millis(100), "tardó {dura:?}");
}

/// Un anillo y un latch declarados en orden inverso, ya en el simulador mixto: el anillo oscila a 33.3 MHz y el latch soltado
/// a la vez oscila cada 5 ns.
#[test]
fn un_anillo_y_un_latch_en_orden_inverso_oscilan_en_el_simulador_mixto() {
    let mut m = Mixto::new(
        Netlist::from_json(r#"{"nodes":1,"digital_nets":3,"elements":[
            {"type":"GATE","fn":"not","inputs":[1],"output":0,"rise_delay":5e-9,"fall_delay":5e-9},
            {"type":"GATE","fn":"not","inputs":[2],"output":1,"rise_delay":5e-9,"fall_delay":5e-9},
            {"type":"GATE","fn":"not","inputs":[0],"output":2,"rise_delay":5e-9,"fall_delay":5e-9}]}"#)
        .unwrap(),
        1e-6,
    )
    .unwrap();
    assert!(!m.lazo_de_arranque().is_empty());
    m.advance_to(1e-6, u32::MAX).unwrap();
    let (f, ciclo, _) = m.medida(0);
    assert!((f - 1.0 / 30e-9).abs() / f < 1e-6 && (ciclo - 0.5).abs() < 1e-6, "f = {f}, ciclo = {ciclo}");
    let mut m = Mixto::new(
        Netlist::from_json(r#"{"nodes":1,"digital_nets":3,"elements":[
            {"type":"GATE","fn":"nand","inputs":[0,1],"output":2,"rise_delay":5e-9,"fall_delay":5e-9},
            {"type":"GATE","fn":"nand","inputs":[0,2],"output":1,"rise_delay":5e-9,"fall_delay":5e-9},
            {"type":"LOGIC","out":0,"value":0}]}"#)
        .unwrap(),
        1e-5,
    )
    .unwrap();
    m.advance_to(1e-6, u32::MAX).unwrap();
    m.set_element(2, Element::Logic { out: 0, value: 1 }).unwrap();
    m.advance_to(2e-6, u32::MAX).unwrap();
    let (f, _, _) = m.medida(1);
    assert!((f - 1.0 / 10e-9).abs() / f < 1e-6, "f = {f}");
    assert_eq!(m.medida(1).2, m.medida(2).2);
}

/// Riesgo 4: circuitos al azar con instrumentos (cadena del multímetro, generador, fuente variable, entrada de osciloscopio, fusible) y sondas, con cambios en caliente entre tramos como los de la vista previa.
#[test]
fn ninguna_netlist_con_instrumentos_al_azar_hace_abortar_ni_arrastrar_el_motor() {
    let mut r = Azar(23);
    let (mut construidas, mut completas) = (0u32, 0u32);
    // Por qué no se construyó cada una que no se construyó: las cuentas a la vista, no un descarte silencioso.
    let mut rechazos: std::collections::BTreeMap<String, u32> = std::collections::BTreeMap::new();
    for _ in 0..400 {
        let n = 3 + r.nodo(4);
        // Nodos del circuito 1..n, y tres internos del multímetro: n (prueba), n + 1 (fusible) y n + 2 (salida del generador).
        let (prueba, fusible, gen) = (n, n + 1, n + 2);
        let mut el: Vec<String> = (0..1 + r.nodo(5)).map(|_| elemento_de(&mut r, n, true)).collect();
        el.extend((1..n).map(|nodo| format!(r#"{{"type":"R","a":{nodo},"b":0,"ohms":1e6}}"#)));
        let (mas, com) = (1 + r.nodo(n - 1), r.nodo(n));
        // Un multímetro con sus dos puntas en la misma red no se arma (la interfaz lo deja suelto): la sonda de su voltaje
        // se rechazaría y la netlist entera no se probaría. COM va a tierra.
        let com = if com == mas { 0 } else { com };
        let mm = el.len();
        el.push(format!(r#"{{"type":"V","a":{prueba},"b":{com},"wave":{{"kind":"dc","v":0}}}}"#));
        el.push(format!(r#"{{"type":"R","a":{prueba},"b":{fusible},"ohms":9999999.99}}"#));
        el.push(format!(r#"{{"type":"FUSE","a":{fusible},"b":{mas},"ohms":0.01,"inom":10,"ifusion":20,"tau":0.125}}"#));
        let g = el.len();
        let f = r.log(10.0, 1e5);
        el.push(format!(r#"{{"type":"V","a":{gen},"b":0,"wave":{{"kind":"sine","offset":0,"amp":{},"freq":{f},"continua":true}}}}"#, r.log(0.01, 10.0)));
        el.push(format!(r#"{{"type":"R","a":{gen},"b":{},"ohms":50}}"#, 1 + r.nodo(n - 1)));
        let ps = el.len();
        let salida = 1 + r.nodo(n - 1);
        el.push(format!(r#"{{"type":"PSU","a":{salida},"b":0,"v":{},"ilim":{},"vk":0.005}}"#, 30.0 * r.sig(), r.log(1e-3, 3.0)));
        el.push(format!(r#"{{"type":"C","a":{salida},"b":0,"farads":1e-7}}"#));
        el.push(format!(r#"{{"type":"R","a":{},"b":0,"ohms":1e6}}"#, 1 + r.nodo(n - 1)));
        // Y el multímetro como lo arma la interfaz: un solo fusible con la fuente de prueba en serie, de «+» a
        // tierra, sin sorteos nuevos (las demás netlists no cambian).
        let um = el.len();
        el.push(format!(r#"{{"type":"FUSE","a":{mas},"b":0,"ohms":9999999.99,"inom":10,"ifusion":20,"tau":0.125,"v":0}}"#));
        let h = (1.0 / (100.0 * f)).clamp(1e-8, 1e-5);
        let json = format!(
            r#"{{"nodes":{},"elements":[{}],"sondas":[{{"kind":"v","p":{mas},"n":{com},"muestras":32768,"columna":{h}}},{{"kind":"i","element":{},"signo":-1,"muestras":32768,"columna":{h}}},{{"kind":"v","p":{},"n":0,"muestras":65536,"columna":{h}}}]}}"#,
            n + 3,
            el.join(","),
            mm + 1,
            1 + r.nodo(n - 1)
        );
        let resultado = catch_unwind(AssertUnwindSafe(|| {
            let construir = Netlist::from_json(&json).and_then(|net| Mixto::new(net, h));
            let mut m = match construir {
                Ok(m) => m,
                Err(e) => {
                    *rechazos.entry(motivo(&e)).or_default() += 1;
                    return None;
                }
            };
            m.activar_promedios();
            let t0 = Instant::now();
            for tramo in 0..3 {
                if tramo > 0 {
                    // Modo del multímetro: óhmetro (1 V y 10 kΩ), amperímetro (0 V y 90 mΩ) o voltímetro.
                    let (v, ohms) = [(1.0, 9999.99), (0.0, 0.09), (0.0, 9999999.99)][r.nodo(3)];
                    let _ = m.set_element(mm, Element::V { a: prueba, b: com, wave: Wave::Dc { v } });
                    let _ = m.set_element(mm + 1, Element::R { a: prueba, b: fusible, ohms });
                    let _ = m.set_element(um, Element::Fuse { a: mas, b: 0, ohms: ohms + 0.01, inom: 10.0, ifusion: 20.0, tau: 0.125, v, sin_carga: false });
                    let _ = m.set_element(g, Element::V { a: gen, b: 0, wave: Wave::Sine { offset: 0.0, amp: 1.0, freq: f * (0.5 + r.sig()), phase: 0.0, continua: true } });
                    let _ = m.set_element(ps, Element::Psu { a: salida, b: 0, v: 12.0, ilim: r.log(1e-3, 3.0), vk: 0.005, encendida: r.sig() < 0.8 });
                }
                let antes = m.time();
                if m.advance_to(antes + 50.0 * h, 400).is_err() {
                    assert!(m.voltages().iter().all(|v| v.is_finite()), "voltajes que no son finitos tras el error con {json}");
                    return Some(false);
                }
                assert!(m.time().is_finite() && m.time() >= antes, "el tiempo retrocede con {json}");
                assert!(m.readings().iter().all(|l| l.i.is_finite() && l.aux.is_finite() && l.estado.is_finite()), "lecturas que no son finitas con {json}");
                for k in 0..m.n_sondas() {
                    let s = m.sonda(k).unwrap();
                    assert!(s.tiempo().is_finite(), "sonda {k} sin tiempo con {json}");
                    let c = s.columna_en(antes, m.time());
                    assert!(c.vacia() || (c.min.is_finite() && c.max.is_finite() && c.iv.is_finite()), "sonda {k} con valores que no son finitos con {json}");
                }
                assert!(t0.elapsed() < PRESUPUESTO, "tardó más de {PRESUPUESTO:?} con {json}");
            }
            Some(true)
        }));
        match resultado {
            Err(_) => panic!("el motor abortó o falló una comprobación con {json}"),
            Ok(Some(c)) => {
                construidas += 1;
                if c {
                    completas += 1;
                }
            }
            Ok(None) => {}
        }
    }
    println!("netlists con instrumentos: {construidas} construidas de 400, {completas} completas; rechazadas: {rechazos:?}");
    assert!(construidas >= 380, "solo se construyeron {construidas}");
    assert!(rechazos.keys().all(|k| !k.starts_with("sonda")), "sondas rechazadas: {rechazos:?}");
}

/// El motivo de un rechazo al construir, sin los números de elemento ni de sonda: «sonda: sus dos nodos son el mismo».
fn motivo(e: &EngineError) -> String {
    let texto = match e {
        EngineError::Invalid(m) => m.clone(),
        otro => format!("{otro:?}"),
    };
    let texto = texto.split_once(": ").map_or(texto.as_str(), |(_, resto)| resto).to_string();
    let tipo = if format!("{e:?}").contains("sonda") || texto.contains("islas") { "sonda" } else { "otro" };
    format!("{tipo}: {}", texto.chars().filter(|c| !c.is_ascii_digit()).collect::<String>().trim())
}

/// Un número de los que la interfaz podría mandar por error a la API de las sondas: normales casi siempre, a veces NaN,
/// infinitos, cero o negativos.
fn raro(r: &mut Azar, normal: f64) -> f64 {
    match r.nodo(12) {
        0 => f64::NAN,
        1 => f64::INFINITY,
        2 => f64::NEG_INFINITY,
        3 => 0.0,
        4 => -normal,
        5 => normal * 1e30,
        _ => normal * (0.5 + r.sig()),
    }
}

/// Riesgo 4 con lógica: lo anterior más una parte digital con sondas, el generador en varias formas y ajustes en caliente de sondas y paso máximo. En cada tramo se lee todo lo de la API de WASM, también con números inválidos (NaN, índices enormes, i0 > i1). Una sonda entre dos islas se rechaza al construir y se cuenta aparte.
#[test]
fn ninguna_netlist_con_instrumentos_y_logica_al_azar_hace_abortar_el_motor_ni_su_api() {
    use kirchi_engine::lectura_sondas as ls;
    use kirchi_engine::sonda::{resta_columnas, Columna, Interpolacion};
    let mut r = Azar(57);
    let (mut construidas, mut completas) = (0u32, 0u32);
    let mut rechazos: std::collections::BTreeMap<String, u32> = std::collections::BTreeMap::new();
    for _ in 0..300 {
        let n = 3 + r.nodo(4);
        // Nodos 1..n del circuito, n el generador por dentro, n + 1 la cuadrada, n + 2 la salida del inversor y n + 3 el LED.
        let (gen, cuadrada, sal, led) = (n, n + 1, n + 2, n + 3);
        let mut el: Vec<String> = (0..1 + r.nodo(5)).map(|_| elemento_de(&mut r, n, true)).collect();
        el.extend((1..n).map(|nodo| format!(r#"{{"type":"R","a":{nodo},"b":0,"ohms":1e6}}"#)));
        let g = el.len();
        let f = r.log(10.0, 1e5);
        let onda = |r: &mut Azar, f: f64| -> String {
            if r.sig() < 0.5 {
                format!(r#"{{"kind":"sine","offset":0,"amp":{},"freq":{f},"continua":true}}"#, r.log(0.01, 10.0))
            } else {
                // La triangular de simetría s, el diente de sierra (s de 0 o 1) o la cuadrada con flancos de 1 % del periodo.
                let per = 1.0 / f;
                let (rise, fall, width) = match r.nodo(3) {
                    0 => {
                        let s = [0.0, 0.25, 0.5, 1.0][r.nodo(4)];
                        (s * per, (1.0 - s) * per, 0.0)
                    }
                    1 => (0.01 * per, 0.01 * per, 0.3 * per),
                    _ => (0.0, 0.0, per * (0.01 + 0.98 * r.sig())),
                };
                format!(r#"{{"kind":"pulse","low":-1,"high":1,"freq":{f},"rise":{rise},"fall":{fall},"width":{width},"continua":true}}"#)
            }
        };
        el.push(format!(r#"{{"type":"V","a":{gen},"b":0,"wave":{}}}"#, onda(&mut r, f)));
        let a = 1 + r.nodo(n - 1);
        el.push(format!(r#"{{"type":"R","a":{gen},"b":{a},"ohms":50}}"#));
        // El multímetro de un elemento entre «+» y COM.
        let (mas, com) = (1 + r.nodo(n - 1), r.nodo(n));
        let com = if com == mas { 0 } else { com };
        let mm = el.len();
        el.push(format!(r#"{{"type":"FUSE","a":{mas},"b":{com},"ohms":9999999.99,"inom":10,"ifusion":20,"tau":0.125,"v":0}}"#));
        // La parte digital.
        el.push(format!(r#"{{"type":"V","a":{cuadrada},"b":0,"wave":{{"kind":"square","low":0,"high":5,"freq":{}}}}}"#, r.log(10.0, 1e4)));
        el.push(format!(r#"{{"type":"ADC","p":{cuadrada},"n":0,"out":0,"in_low":1.5,"in_high":3.5}}"#));
        el.push(r#"{"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":5e-9,"fall_delay":5e-9}"#.to_string());
        el.push(format!(r#"{{"type":"DAC","input":1,"out":{sal},"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":7e-9,"t_fall":7e-9}}"#));
        el.push(format!(r#"{{"type":"R","a":{sal},"b":{led},"ohms":330}}"#));
        el.push(format!(r#"{{"type":"D","a":{led},"b":0,"is":1.5e-17,"n":2}}"#));
        let h = (1.0 / (100.0 * f)).clamp(1e-8, 1e-5);
        // Sondas: el voltaje y la corriente del multímetro, el canal A en la salida del generador, el LED y la red digital.
        let json = format!(
            r#"{{"nodes":{},"digital_nets":2,"elements":[{}],"sondas":[{{"kind":"v","p":{mas},"n":{com},"muestras":32768,"columna":{h}}},{{"kind":"i","element":{mm},"signo":1,"muestras":32768,"columna":{h}}},{{"kind":"v","p":{a},"n":0,"muestras":65536,"columna":{h}}},{{"kind":"v","p":{led},"n":0,"muestras":4096,"columna":{h}}},{{"kind":"d","red":1,"bajo":0,"alto":5,"muestras":4096,"columna":{h}}}]}}"#,
            n + 4,
            el.join(",")
        );
        let resultado = catch_unwind(AssertUnwindSafe(|| {
            let mut m = match Netlist::from_json(&json).and_then(|net| Mixto::new(net, h)) {
                Ok(m) => m,
                Err(e) => {
                    *rechazos.entry(motivo(&e)).or_default() += 1;
                    return None;
                }
            };
            m.activar_promedios();
            let t0 = Instant::now();
            let (mut tmp, mut out, mut v, mut i) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
            for tramo in 0..4 {
                if tramo > 0 {
                    let f2 = f * (0.5 + r.sig());
                    let w: Wave = serde_json::from_str(&onda(&mut r, f2)).unwrap();
                    let _ = m.set_element(g, Element::V { a: gen, b: 0, wave: w });
                    let (pv, ohms) = [(1.0, 1e4), (0.0, 0.1), (0.0, 1e7)][r.nodo(3)];
                    let _ = m.set_element(mm, Element::Fuse { a: mas, b: com, ohms, inom: 10.0, ifusion: 20.0, tau: 0.125, v: pv, sin_carga: r.sig() < 0.2 });
                    let _ = m.set_max_step(h * (0.5 + 1.5 * r.sig()));
                    for k in 0..m.n_sondas() {
                        let config = format!(
                            r#"{{"columna":{},"acople":"{}","disparo":{}}}"#,
                            r.log(1e-9, 1e-2),
                            if r.sig() < 0.5 { "dc" } else { "ac" },
                            if r.sig() < 0.3 { "null".to_string() } else { format!(r#"{{"nivel":{},"subida":{},"histeresis":{}}}"#, 2.0 * r.sig() - 1.0, r.sig() < 0.5, 0.1 * r.sig()) }
                        );
                        let _ = ls::configurar(&mut m, k, &config);
                    }
                    // Configuraciones que no valen: se rechazan con su error, sin tocar la sonda.
                    for malo in [r#"{"columna":0}"#, r#"{"columna":1e-4,"acople":"rara"}"#, r#"{"columna":1e-4,"disparo":{"nivel":1e300,"subida":true}}"#, "no es json"] {
                        assert!(ls::configurar(&mut m, r.nodo(8), malo).is_err());
                    }
                }
                let antes = m.time();
                let paso = m.advance_to(antes + 50.0 * h, 400);
                if paso.is_err() {
                    assert!(m.voltages().iter().all(|v| v.is_finite()), "voltajes que no son finitos tras el error con {json}");
                    return Some(false);
                }
                let ahora = m.time();
                assert!(ahora.is_finite() && ahora >= antes, "el tiempo retrocede con {json}");
                // La API de WASM con números al azar, normales y raros: nada aborta y lo que da cabe en lo que promete.
                for _ in 0..8 {
                    let k = if r.sig() < 0.2 { usize::MAX - r.nodo(3) } else { r.nodo(m.n_sondas() + 1) };
                    let u = r.sig();
                    let (t0c, dt) = (raro(&mut r, ahora * u), raro(&mut r, (ahora - antes).max(1e-9) / 100.0));
                    let (i0, i1) = if r.sig() < 0.2 { (usize::MAX - 3, usize::MAX) } else { (r.nodo(50), r.nodo(5000)) };
                    ls::columnas_planas(&m, k, t0c, dt, i0, i1, &mut tmp, &mut out);
                    assert!(out.len() <= 4096 * ls::CIFRAS_COLUMNA && out.len() % ls::CIFRAS_COLUMNA == 0);
                    ls::resta_planas(&m, k, r.nodo(m.n_sondas() + 1), t0c, dt, i0, i1, &mut tmp, &mut out);
                    assert!(out.len() <= 4096 * ls::CIFRAS_COLUMNA);
                    ls::muestras_planas(&m, k, t0c, dt, if r.sig() < 0.2 { usize::MAX } else { r.nodo(5000) }, &mut out);
                    assert!(out.len() <= ls::MAX_MUESTRAS);
                    ls::ventana_plana(&m, k, t0c, raro(&mut r, ahora), &mut out);
                    assert_eq!(out.len(), 13);
                    if let Some(s) = m.sonda(k) {
                        let _ = s.ultimo_disparo(raro(&mut r, ahora));
                    }
                }
                ls::promedios_planos(&m, &mut v, &mut i, &mut out);
                assert!(out.iter().all(|x| x.is_finite()), "promedios que no son finitos con {json}");
                for k in 0..m.n_sondas() {
                    let s = m.sonda(k).unwrap();
                    let c = s.columna_en(antes, ahora);
                    assert!(c.vacia() || (c.iv.is_finite() && (c.banderas & 3 != 0 || (c.min.is_finite() && c.max.is_finite()))), "sonda {k} con {json}");
                    // La ventana: integrales finitas, el tiempo medido dentro del intervalo y los periodos dentro de lo registrado.
                    let w = s.ventana(antes, ahora);
                    assert!(w.iv.is_finite() && w.iv2.is_finite() && w.iv2 >= -1e-300, "ventana de la sonda {k} con {json}");
                    assert!(!(w.hasta > w.desde) || (w.t_valido >= 0.0 && w.t_valido <= (w.hasta - w.desde) * (1.0 + 1e-12)), "tiempo medido de la sonda {k} con {json}");
                    if w.periodos > 0 {
                        assert!(w.p0 < w.p1 && w.p0 >= s.cubre_desde() - 1e-15 && w.p1 <= s.tiempo() + 1e-15, "periodos de la sonda {k} con {json}");
                    }
                    if let Some(td) = s.ultimo_disparo(ahora) {
                        assert!(td <= ahora && td.is_finite(), "disparo de la sonda {k} en {td} con {json}");
                    }
                }
                // A − B entre el canal del generador y el del LED (lineales, quizá de islas distintas).
                let (sa, sb) = (m.sonda(2).unwrap(), m.sonda(3).unwrap());
                assert!(sa.interpolacion() == Interpolacion::Lineal && sb.interpolacion() == Interpolacion::Lineal);
                let mut cols = [Columna::VACIA; 16];
                resta_columnas(sa, sb, antes, (ahora - antes) / 16.0, 0, 16, &mut cols);
                assert!(cols.iter().all(|c| c.vacia() || (c.iv.is_finite() && c.min.is_finite())), "A − B con {json}");
                assert!(t0.elapsed() < PRESUPUESTO, "tardó más de {PRESUPUESTO:?} con {json}");
            }
            Some(true)
        }));
        match resultado {
            Err(_) => panic!("el motor abortó o falló una comprobación con {json}"),
            Ok(Some(c)) => {
                construidas += 1;
                completas += c as u32;
            }
            Ok(None) => {}
        }
    }
    println!("netlists con instrumentos y lógica: {construidas} construidas de 300, {completas} completas; rechazadas: {rechazos:?}");
    assert!(construidas >= 200, "solo se construyeron {construidas}");
}

/// Netlists al azar con zumbadores, las corrientes por terminal y las potencias activadas y piezas que se queman y
/// se reponen entre tramos (el quemado cambia la topología en caliente): nada aborta, todo sigue finito y las corrientes por
/// terminal de cada elemento suman cero.
#[test]
fn ninguna_netlist_al_azar_con_quemados_y_corrientes_por_terminal_hace_abortar_el_motor() {
    let mut r = Azar(2026);
    let (mut construidas, mut completas, mut quemados) = (0u32, 0u32, 0u32);
    for _ in 0..400 {
        let n = 2 + r.nodo(6);
        let k = 1 + r.nodo(8);
        let mut elementos: Vec<String> = (0..k).map(|_| elemento_de(&mut r, n, true)).collect();
        // Un zumbador de cada tres netlists.
        if r.sig() < 0.34 {
            elementos.push(format!(r#"{{"type":"BUZZER","a":{},"b":0,"ohms":{},"umbral":{}}}"#, 1 + r.nodo(n - 1), r.log(10.0, 1e4), r.log(0.1, 20.0)));
        }
        elementos.extend((1..n).map(|nodo| format!(r#"{{"type":"R","a":{nodo},"b":0,"ohms":1e6}}"#)));
        let json = format!(r#"{{"nodes":{n},"elements":[{}]}}"#, elementos.join(","));
        let h = r.valor().abs().clamp(1e-9, 1e-3);
        let Ok(net) = Netlist::from_json(&json) else { continue };
        let total = net.elements.len();
        let quemables: Vec<usize> = (0..total).filter(|&k| matches!(net.elements[k], Element::R { .. } | Element::D { .. } | Element::Q { .. } | Element::M { .. })).collect();
        let resultado = catch_unwind(AssertUnwindSafe(|| {
            let Ok(mut tr) = Transient::new(net.clone(), h) else { return (false, false, 0) };
            tr.activar_terminales(true);
            tr.activar_potencias(&(0..total).collect::<Vec<_>>()).unwrap();
            let mut q = 0;
            for tramo in 0..3 {
                if tramo > 0 && !quemables.is_empty() {
                    let k = quemables[r.nodo(quemables.len())];
                    let si = r.sig() < 0.7;
                    tr.quemar(k, si).unwrap();
                    q += usize::from(si);
                }
                let antes = tr.time();
                if tr.advance_to(antes + 50.0 * h, 400).is_err() {
                    return (true, false, q);
                }
                assert!(tr.voltages().iter().all(|v| v.is_finite()), "voltajes que no son finitos con {json}");
                let mut buf = [0.0; kirchi_engine::devices::CASILLAS_MAX];
                for (k, e) in net.elements.iter().enumerate() {
                    tr.corrientes_de(k, &mut buf);
                    let c = &buf[..e.nodes().len() + 1];
                    let mayor = c.iter().fold(0.0f64, |a, b| a.max(b.abs()));
                    assert!(c.iter().all(|x| x.is_finite()), "corrientes por terminal que no son finitas con {json}");
                    assert!(c.iter().sum::<f64>().abs() <= 1e-9 * mayor + 1e-15, "el elemento {k} no suma cero con {json}");
                }
                for (j, _) in (0..total).enumerate() {
                    assert!(tr.promedio_potencia(j).is_finite(), "potencia que no es finita con {json}");
                }
                let _ = tr.take_cruces();
            }
            (true, true, q)
        }));
        match resultado {
            Ok((c, completa, q)) => {
                construidas += u32::from(c);
                completas += u32::from(completa);
                quemados += q as u32;
            }
            Err(_) => panic!("el motor abortó o falló una comprobación con {json} y h = {h}"),
        }
    }
    println!("netlists con quemados: {construidas} construidas de 400, {completas} completas, {quemados} piezas quemadas");
    assert!(construidas >= 300, "solo se construyeron {construidas}");
    assert!(quemados >= 200, "solo se quemaron {quemados}");
}

/// Netlists mixtas al azar (con lógica y puentes, varias islas) con las corrientes por terminal, las potencias, los
/// cambios que se oyen y piezas que se queman y se reponen entre tramos en el simulador mixto: nada aborta, todo sigue finito y
/// las corrientes por terminal de cada elemento analógico suman cero.
#[test]
fn ninguna_netlist_mixta_al_azar_con_quemados_hace_abortar_el_motor() {
    let mut r = Azar(2027);
    let (mut construidas, mut completas, mut quemados) = (0u32, 0u32, 0u32);
    for _ in 0..300 {
        let n = 2 + r.nodo(5);
        let d = 1 + r.nodo(8);
        let mut sal = 0;
        let mut el: Vec<String> = (0..1 + r.nodo(4)).map(|_| elemento_de(&mut r, n, true)).collect();
        if r.sig() < 0.34 {
            el.push(format!(r#"{{"type":"BUZZER","a":{},"b":0,"ohms":{},"umbral":{}}}"#, 1 + r.nodo(n - 1), r.log(10.0, 1e4), r.log(0.1, 20.0)));
        }
        el.extend((0..1 + r.nodo(8)).map(|_| digital(&mut r, n, d, &mut sal)));
        el.extend((1..n).map(|nodo| format!(r#"{{"type":"R","a":{nodo},"b":0,"ohms":1e6}}"#)));
        let redes = d.max(sal);
        let json = format!(r#"{{"nodes":{n},"digital_nets":{redes},"elements":[{}]}}"#, el.join(","));
        let h = r.valor().abs().clamp(1e-9, 1e-3);
        let Ok(net) = Netlist::from_json(&json) else { continue };
        let total = net.elements.len();
        let quemables: Vec<usize> = (0..total).filter(|&k| matches!(net.elements[k], Element::R { .. } | Element::D { .. } | Element::Q { .. } | Element::M { .. })).collect();
        let analogicos: Vec<usize> = (0..total).filter(|&k| !net.elements[k].es_digital()).collect();
        let resultado = catch_unwind(AssertUnwindSafe(|| {
            let Ok(mut m) = Mixto::new(net.clone(), h) else { return (false, false, 0) };
            m.activar_terminales(true);
            if m.activar_potencias(&analogicos).is_err() {
                return (true, false, 0);
            }
            let mut q = 0;
            for tramo in 0..3 {
                if tramo > 0 && !quemables.is_empty() {
                    let k = quemables[r.nodo(quemables.len())];
                    let si = r.sig() < 0.7;
                    m.quemar(k, si).unwrap();
                    q += usize::from(si);
                }
                let antes = m.time();
                if m.advance_to(antes + 50.0 * h, 400).is_err() {
                    return (true, false, q);
                }
                assert!(m.voltages().iter().all(|v| v.is_finite()), "voltajes que no son finitos con {json}");
                let mut buf = [0.0; kirchi_engine::devices::CASILLAS_MAX];
                for (k, e) in net.elements.iter().enumerate() {
                    if !m.corrientes_de(k, &mut buf) {
                        continue;
                    }
                    let c = &buf[..e.nodes().len() + 1];
                    let mayor = c.iter().fold(0.0f64, |a, b| a.max(b.abs()));
                    assert!(c.iter().all(|x| x.is_finite()), "corrientes por terminal que no son finitas con {json}");
                    assert!(c.iter().sum::<f64>().abs() <= 1e-9 * mayor + 1e-15, "el elemento {k} no suma cero con {json}");
                }
                let mut p = Vec::new();
                m.potencias_into(&mut p);
                assert!(p.iter().all(|x| x.is_finite()), "potencia que no es finita con {json}");
                let (mut medias, mut abs) = (Vec::new(), Vec::new());
                m.terminales_into(&mut medias, &mut abs);
                assert!(medias.iter().chain(&abs).all(|x| x.is_finite()), "medias que no son finitas con {json}");
                let _ = m.take_cruces();
            }
            (true, true, q)
        }));
        match resultado {
            Ok((c, completa, q)) => {
                construidas += u32::from(c);
                completas += u32::from(completa);
                quemados += q as u32;
            }
            Err(_) => panic!("el motor abortó o falló una comprobación con {json} y h = {h}"),
        }
    }
    println!("netlists mixtas con quemados: {construidas} construidas de 300, {completas} completas, {quemados} piezas quemadas");
    assert!(construidas >= 200, "solo se construyeron {construidas}");
    assert!(quemados >= 100, "solo se quemaron {quemados}");
}

/// Integrador con TL081 (100 kΩ y 1 µF, cuadrada de ±0.5 V a 0.05 Hz) seguido de un inversor de ganancia -1: lo reducido de
/// compuanalogica.kir.
fn integrador_e_inversor() -> String {
    let tl081 = r#"{"a0":2e5,"gbw":3e6,"sr":13e6,"rin":1e12,"rout":100,"ilim":0.04,"dhi":1.5,"dlo":1.5,"rq":21400}"#;
    format!(
        r#"{{"nodes":8,"elements":[
        {{"type":"V","a":1,"b":0,"wave":{{"kind":"dc","v":15}}}},
        {{"type":"V","a":2,"b":0,"wave":{{"kind":"dc","v":-15}}}},
        {{"type":"V","a":3,"b":0,"wave":{{"kind":"pulse","low":-0.5,"high":0.5,"freq":0.05,"rise":0,"fall":0,"width":10,"phase":0,"continua":true}}}},
        {{"type":"R","a":3,"b":4,"ohms":1e5}},
        {{"type":"C","a":4,"b":5,"farads":1e-6}},
        {{"type":"R","a":5,"b":0,"ohms":1e6}},
        {{"type":"OA","p":0,"n":4,"out":5,"vp":1,"vn":2,"model":{tl081}}},
        {{"type":"R","a":5,"b":6,"ohms":1000}},
        {{"type":"R","a":6,"b":7,"ohms":1000}},
        {{"type":"OA","p":0,"n":6,"out":7,"vp":1,"vn":2,"model":{tl081}}}]}}"#
    )
}

#[test]
fn avanzar_en_tramos_multiplos_del_paso_no_deja_astillas_que_atasquen() {
    // Con 20 µs, un tramo de 5 ms son 250 pasos cuya suma queda ~1e-13 s antes del final. Ese último paso no convergía, el paso bajaba y volvía a crecer, y se atascaba hacia t = 1.01 s con cualquiera de estos tramos.
    for tramo in [0.005, 0.0083, 0.01, 0.0166] {
        let mut m = Mixto::new(Netlist::from_json(&integrador_e_inversor()).unwrap(), 20e-6).unwrap();
        while m.time() < 2.0 - 1e-12 {
            let meta = (m.time() + tramo).min(2.0);
            if let Err(e) = m.advance_to(meta, u32::MAX) {
                panic!("tramo {tramo}: {e} en t = {}", m.time());
            }
        }
        // El inversor sigue al integrador: -(−0.5 V / 0.1 s) · 2 s de rampa, unos 10 V sin saturar.
        assert!((m.voltage(7) - 10.0).abs() < 0.2, "tramo {tramo}: salida {}", m.voltage(7));
    }
}

/// El JFET con las mismas defensas que el MOSFET y el diodo: nada se cuelga ni pasa del vigilante de 250 ms.
mod jfet {
    use super::*;

    const MODELO: &str = r#"{"vto":-3.05838,"beta":3.04692e-4,"lambda":0.00350877,"pb":1,"cgs":3e-12,"cgd":6e-12,"is":1e-14}"#;

    /// Avanza `fin` segundos y devuelve el resultado con el tiempo de pared que tardó.
    fn correr(json: &str, h: f64, fin: f64, sparse: bool) -> (Result<Transient, EngineError>, Duration) {
        use kirchi_engine::transient::SolverKind;
        let t0 = Instant::now();
        let kind = if sparse { SolverKind::Sparse } else { SolverKind::Dense };
        let mut tr = Transient::with_solver(Netlist::from_json(json).unwrap(), h, kind).unwrap();
        let r = tr.advance_to(fin, 1000).map(|_| tr);
        (r, t0.elapsed())
    }

    #[test]
    fn la_compuerta_en_directo_sin_resistencia_converge_o_avisa_de_la_union() {
        let json = format!(r#"{{"nodes":4,"elements":[
            {{"type":"V","a":1,"b":0,"wave":{{"kind":"dc","v":12}}}},
            {{"type":"V","a":2,"b":0,"wave":{{"kind":"dc","v":5}}}},
            {{"type":"R","a":1,"b":3,"ohms":1000}},
            {{"type":"J","d":3,"g":2,"s":0,"model":{MODELO}}}]}}"#);
        for sparse in [false, true] {
            let (r, t) = correr(&json, 1e-5, 1e-3, sparse);
            assert!(t < Duration::from_millis(250), "tardó {t:?}");
            match r {
                Ok(tr) => assert!(tr.voltage(3).is_finite()),
                Err(e) => assert_eq!(e, EngineError::DiodoSinLimite { element: Some(3) }),
            }
        }
    }

    #[test]
    fn el_drenador_al_aire_simula_con_la_compuerta_senoidal() {
        let json = format!(r#"{{"nodes":5,"elements":[
            {{"type":"V","a":4,"b":0,"wave":{{"kind":"sine","offset":0,"amp":2,"freq":1000}}}},
            {{"type":"R","a":4,"b":2,"ohms":1000}},
            {{"type":"J","d":1,"g":2,"s":0,"model":{MODELO}}},
            {{"type":"J","d":3,"g":0,"s":0,"model":{MODELO}}}]}}"#);
        for sparse in [false, true] {
            let (r, t) = correr(&json, 1e-5, 2e-3, sparse);
            assert!(t < Duration::from_millis(250), "tardó {t:?}");
            let tr = r.unwrap_or_else(|e| panic!("{e:?}"));
            assert!((1..5).all(|n| tr.voltage(n).is_finite()));
        }
    }

    #[test]
    fn la_fuente_de_corriente_de_jfet_con_rs_cero_regula_en_idss() {
        let json = format!(r#"{{"nodes":3,"elements":[
            {{"type":"V","a":1,"b":0,"wave":{{"kind":"dc","v":20}}}},
            {{"type":"R","a":1,"b":2,"ohms":1000}},
            {{"type":"J","d":2,"g":0,"s":0,"model":{MODELO}}}]}}"#);
        for sparse in [false, true] {
            let (r, t) = correr(&json, 1e-5, 1e-3, sparse);
            assert!(t < Duration::from_millis(250), "tardó {t:?}");
            let tr = r.unwrap();
            // IDSS de la hoja con la modulación del largo: unos 3 mA, y el drenador cae a 17 V.
            let i = tr.readings()[2].i;
            assert!((i - 3.0e-3).abs() < 0.1e-3, "i = {i}");
        }
    }
}

mod motor_a_pasos {
    use kirchi_engine::{Element, Netlist, Transient, Wave};
    use std::f64::consts::FRAC_PI_2;

    /// Paso completo del 17HS4401 (50 pares de polos): π / 2N.
    const PASO: f64 = FRAC_PI_2 / 50.0;
    const CAMPO: [(f64, f64); 4] = [(1.0, 0.0), (0.0, 1.0), (-1.0, 0.0), (0.0, -1.0)];
    const MOTOR: &str = r#"{"type":"PASOS","nodos":[NODO_A,0,NODO_B,0],"r":1.5,"l":2.8e-3,"km":0.1664,"dientes":50,"td":0.022,"j":5.4e-6,"bm":2e-3}"#;

    /// Sube de 200 a 2,000 pasos por segundo en 90 pasos, sigue 1,000 pasos a 2,000 y se asienta; `mover` aplica el campo
    /// (fase A, fase B) normalizado. Devuelve el mayor retraso del rotor respecto del campo y el error final, ambos en pasos.
    fn recorrer(mut tr: Transient, mover: impl Fn(&mut Transient, f64, f64)) -> (f64, f64) {
        mover(&mut tr, CAMPO[0].0, CAMPO[0].1);
        tr.advance_to(0.02, u32::MAX).unwrap();
        let mut t = tr.time();
        let mut peor = 0.0f64;
        let pasos = 90 + 1000;
        for k in 1..=pasos {
            let f = (200.0 + 20.0 * k as f64).min(2000.0);
            mover(&mut tr, CAMPO[k % 4].0, CAMPO[k % 4].1);
            t += 1.0 / f;
            tr.advance_to(t, u32::MAX).unwrap();
            peor = peor.max((k as f64 * PASO - tr.readings()[tr.readings().len() - 1].estado).abs() / PASO);
        }
        tr.advance_to(t + 0.05, u32::MAX).unwrap();
        let final_ = (pasos as f64 * PASO - tr.readings()[tr.readings().len() - 1].estado).abs() / PASO;
        (peor, final_)
    }

    #[test]
    fn a_2000_pasos_por_segundo_con_corriente_impuesta_no_pierde_posicion() {
        let json = format!(
            r#"{{"nodes":3,"elements":[{{"type":"I","a":0,"b":1,"amps":0}},{{"type":"I","a":0,"b":2,"amps":0}},{}]}}"#,
            MOTOR.replace("NODO_A", "1").replace("NODO_B", "2")
        );
        let tr = Transient::new(Netlist::from_json(&json).unwrap(), 1e-4).unwrap();
        let (peor, final_) = recorrer(tr, |tr, a, b| {
            tr.set_element(0, Element::I { a: 0, b: 1, amps: 1.7 * a, wave: None }).unwrap();
            tr.set_element(1, Element::I { a: 0, b: 2, amps: 1.7 * b, wave: None }).unwrap();
        });
        assert!(peor < 1.5, "el rotor se retrasó {peor} pasos");
        assert!(final_ < 0.05, "perdió {final_} pasos");
    }

    #[test]
    fn a_2000_pasos_por_segundo_con_voltaje_y_resistencia_en_serie_no_pierde_posicion() {
        // 48 V con 26.5 Ω por fase: 1.7 A en reposo y la fuerza contraelectromotriz del giro baja la corriente sin parar el motor.
        let json = format!(
            r#"{{"nodes":5,"elements":[
            {{"type":"V","a":1,"b":0,"wave":{{"kind":"dc","v":0}}}},{{"type":"V","a":2,"b":0,"wave":{{"kind":"dc","v":0}}}},
            {{"type":"R","a":1,"b":3,"ohms":26.5}},{{"type":"R","a":2,"b":4,"ohms":26.5}},{}]}}"#,
            MOTOR.replace("NODO_A", "3").replace("NODO_B", "4")
        );
        let tr = Transient::new(Netlist::from_json(&json).unwrap(), 1e-4).unwrap();
        let (peor, final_) = recorrer(tr, |tr, a, b| {
            tr.set_element(0, Element::V { a: 1, b: 0, wave: Wave::Dc { v: 48.0 * a } }).unwrap();
            tr.set_element(1, Element::V { a: 2, b: 0, wave: Wave::Dc { v: 48.0 * b } }).unwrap();
        });
        assert!(peor < 1.5, "el rotor se retrasó {peor} pasos");
        assert!(final_ < 0.05, "perdió {final_} pasos");
    }
}

/// El armado mínimo del ADC0804: un `DACM` en voltaje con referencia de 5 V (LSB de 19.53 mV), un comparador con 0.1 mV de histéresis desplazado medio LSB, de modo que el código es el entero más cercano, y el núcleo de aproximaciones del `MSI` que prueba cada bit desde el más significativo.
mod convertidor {
    use super::*;
    use kirchi_engine::transient::SolverKind;
    use serde_json::json;

    const LSB: f64 = 5.0 / 256.0;
    const HISTERESIS: f64 = 0.1e-3;
    /// Una decisión cada 8 ciclos de un reloj interno de 0.2 µs.
    const PERIODO: f64 = 1.6e-6;
    /// Redes digitales: 0 comparador, 1 a 8 código de prueba (la 1 es el bit más significativo), 9 CS, 10 WR, 11 RD, 12 a 19 resultado, 20 INTR.
    const WR: usize = 6;

    fn solvers() -> Vec<Option<SolverKind>> {
        let mut v = vec![None, Some(SolverKind::Dense)];
        #[cfg(feature = "faer")]
        v.push(Some(SolverKind::Sparse));
        v
    }

    fn analogico(vin: serde_json::Value, histeresis: f64) -> Vec<serde_json::Value> {
        vec![
            json!({"type":"V","a":1,"b":0,"wave":vin}),
            json!({"type":"V","a":2,"b":0,"wave":{"kind":"dc","v":5}}),
            json!({"type":"R","a":3,"b":0,"ohms":1e6}),
            json!({"type":"ADC","p":1,"n":3,"out":0,"in_low":-LSB / 2.0 - histeresis / 2.0,"in_high":-LSB / 2.0 + histeresis / 2.0,"histeresis":true}),
        ]
    }

    fn dacm() -> serde_json::Value {
        json!({"type":"DACM","modo":"voltaje","out":3,"ret":0,"ref_p":2,"ref_n":0,"bits":[1,2,3,4,5,6,7,8],"t_asentamiento":1.5e-7})
    }

    /// El código de prueba lo fija a mano la prueba con ocho estados lógicos (para medir solo el comparador).
    fn comparador_fijo(vin: serde_json::Value, histeresis: f64) -> Netlist {
        let mut els = analogico(vin, histeresis);
        els.extend((1..=8).map(|r| json!({"type":"LOGIC","out":r,"value":0})));
        els.push(dacm());
        Netlist::from_json(&json!({"nodes":4,"digital_nets":9,"elements":els}).to_string()).unwrap()
    }

    /// El convertidor completo: CS y WR en bajo reinician y la subida de WR arranca (el WR es el elemento 6).
    fn aproximador(vin: serde_json::Value, histeresis: f64) -> Netlist {
        let mut els = analogico(vin, histeresis);
        els.push(dacm());
        els.push(json!({"type":"LOGIC","out":9,"value":0}));
        els.push(json!({"type":"LOGIC","out":10,"value":0}));
        els.push(json!({"type":"LOGIC","out":11,"value":1}));
        let de: Vec<serde_json::Value> = (0..8)
            .rev()
            .map(|b| json!({"tipo":"directa","fuente":{"aux":b}}))
            .chain((0..8).rev().map(|b| json!({"tipo":"directa","fuente":{"bit":b}})))
            .chain([json!({"tipo":"directa","fuente":{"bandera":0},"negada":true})])
            .collect();
        els.push(json!({"type":"MSI","entradas":[9,10,11,0],"salidas":(1..=8).chain(12..=20).collect::<Vec<usize>>(),
            "nucleo":{"tipo":"aproximaciones","bits":8,"cs":{"entrada":0,"bajo":true},"wr":{"entrada":1,"bajo":true},"rd":{"entrada":2,"bajo":true},
                "comparador":3,"reloj":{"tipo":"interno","periodo":0.2e-6},"ciclos_inicio":0,"ciclos_bit":8},
            "de":de,"retardos":vec![[5e-9, 5e-9]; 17]}));
        Netlist::from_json(&json!({"nodes":4,"digital_nets":21,"elements":els}).to_string()).unwrap()
    }

    fn mixto(net: Netlist, solver: Option<SolverKind>) -> Mixto {
        match solver {
            Some(k) => Mixto::with_solver(net, 1e-6, k).unwrap(),
            None => Mixto::new(net, 1e-6).unwrap(),
        }
    }

    fn numero(m: &Mixto, desde: usize) -> u32 {
        (0..8).fold(0, |a, k| a << 1 | u32::from(m.nivel(desde + k) == Nivel::Uno))
    }

    /// Una conversión desde `t0` con el núcleo real; compara cada decisión con la réplica de la aproximación sucesiva con el voltaje
    /// de entrada de su instante. Devuelve el código y el instante en que termina.
    fn convertir(m: &mut Mixto, t0: f64, vin: impl Fn(f64) -> f64) -> (u32, f64) {
        m.advance_to(t0, u32::MAX).unwrap();
        m.set_element(WR, Element::Logic { out: 10, value: 1 }).unwrap();
        m.advance_to(t0 + 0.05e-6, u32::MAX).unwrap();
        let (mut acumulado, mut t) = (0u32, t0);
        for bit in (0..8).rev() {
            let prueba = acumulado | 1 << bit;
            assert_eq!(numero(m, 1), prueba, "el código de prueba del bit {bit} de la conversión desde {t0}");
            t += PERIODO;
            // Un nanosegundo antes de la decisión el comparador ya se asentó con el código de prueba.
            m.advance_to(t - 1e-9, u32::MAX).unwrap();
            let conserva = m.nivel(0) == Nivel::Uno;
            let replica = vin(t) - f64::from(prueba) * LSB >= -LSB / 2.0;
            assert_eq!(conserva, replica, "bit {bit} de la conversión desde {t0}: el comparador dio {conserva} y la réplica {replica}");
            if conserva {
                acumulado = prueba;
            }
            m.advance_to(t + 0.05e-6, u32::MAX).unwrap();
        }
        assert_eq!(numero(m, 12), acumulado, "el resultado que sale por las redes");
        assert_eq!(m.nivel(20), Nivel::Cero, "INTR baja al terminar");
        (acumulado, t)
    }

    #[test]
    fn con_la_entrada_a_0_2_mv_de_cada_umbral_el_codigo_es_el_entero_mas_cercano() {
        // Una entrada en (n - 1/2) LSB cae justo en una transición; a 0.2 mV de cada lado la decisión es la del lado correcto.
        for solver in solvers() {
            for n in [1u32, 2, 17, 64, 127, 128, 129, 200, 254, 255] {
                for (delta, esperado) in [(-0.2e-3, n - 1), (0.2e-3, n)] {
                    let vin = (f64::from(n) - 0.5) * LSB + delta;
                    let mut m = mixto(aproximador(json!({"kind":"dc","v":vin}), HISTERESIS), solver);
                    let (codigo, _) = convertir(&mut m, 1e-6, |_| vin);
                    assert_eq!(codigo, esperado, "entrada {vin} V");
                }
            }
        }
    }

    #[test]
    fn una_entrada_que_cambia_durante_la_conversion_da_el_codigo_de_la_aproximacion_sucesiva() {
        // 50 kV/s: la entrada se mueve unos 32 LSB durante los 12.8 µs de la conversión.
        let rampa = |t: f64| 1.0 + (t / 20e-6).min(1.0);
        let mut distintos = 0;
        for solver in solvers() {
            let mut m = mixto(aproximador(json!({"kind":"pwl","puntos":[[0,1.0],[20e-6,2.0]]}), HISTERESIS), solver);
            let (codigo, fin) = convertir(&mut m, 1e-6, rampa);
            // La réplica completa: el mismo algoritmo en aritmética de coma flotante, bit a bit.
            let mut r = 0u32;
            let mut t = 1e-6;
            for bit in (0..8).rev() {
                if rampa(t + PERIODO) - f64::from(r | 1 << bit) * LSB >= -LSB / 2.0 {
                    r |= 1 << bit;
                }
                t += PERIODO;
            }
            assert_eq!(codigo, r);
            assert!((fin - (1e-6 + 8.0 * PERIODO)).abs() < 1e-12);
            let al_inicio = ((rampa(1e-6) / LSB).round()) as u32;
            distintos += usize::from(codigo != al_inicio);
        }
        assert!(distintos > 0, "la entrada tiene que moverse lo bastante para que el código no sea el del inicio");
    }

    /// Cuántos cambios del comparador hay en 1 s con la entrada sobre el umbral del bit más significativo y 20 µV de pico de ruido de 1 kHz.
    fn cambios_del_comparador(histeresis: f64) -> usize {
        let umbral = 127.5 * LSB;
        let mut net = comparador_fijo(json!({"kind":"sine","offset":umbral,"amp":20e-6,"freq":1000}), histeresis);
        // El código de prueba es 128 desde el arranque: el comparador mide la entrada contra su transición.
        let Element::Logic { value, .. } = &mut net.elements[4] else { panic!("el bit más significativo") };
        *value = 1;
        let mut m = Mixto::new(net, 1e-5).unwrap();
        m.registrar_cambios(true);
        let mut cambios = 0;
        while m.time() < 1.0 {
            m.advance_to(1.0, u32::MAX).unwrap();
            cambios += m.tomar_cambios().iter().filter(|c| c.1 == 0).count();
        }
        cambios
    }

    #[test]
    fn la_entrada_justo_en_un_umbral_durante_1_s_no_arma_una_tormenta_de_eventos() {
        let con = cambios_del_comparador(HISTERESIS);
        assert!(con <= 4, "con histéresis hubo {con} cambios del comparador");
        // Sin histéresis el mismo ruido sí lo hace oscilar: la prueba mide algo.
        let sin = cambios_del_comparador(0.0);
        assert!(sin > 100, "sin histéresis hubo {sin} cambios");
    }

    #[test]
    fn el_nucleo_de_aproximaciones_a_media_conversion_vuelve_a_correr_igual_tras_retroceder() {
        let huella = |m: &Mixto| {
            let mut v = vec![m.time().to_bits()];
            v.extend(m.voltages().iter().map(|x| x.to_bits()));
            v.extend((0..m.digital_count()).map(|r| m.nivel(r).codigo().to_bits()));
            v.extend(m.tiempos_de_islas().iter().map(|t| t.to_bits()));
            v
        };
        for solver in solvers() {
            let mut m = mixto(aproximador(json!({"kind":"dc","v":2.0}), HISTERESIS), solver);
            m.advance_to(1e-6, u32::MAX).unwrap();
            m.set_element(WR, Element::Logic { out: 10, value: 1 }).unwrap();
            // Tres decisiones tomadas y la cuarta pendiente.
            m.advance_to(1e-6 + 3.5 * PERIODO, u32::MAX).unwrap();
            let en_a = huella(&m);
            m.guardar_estado();
            m.advance_to(1e-6 + 9.0 * PERIODO, u32::MAX).unwrap();
            let en_b = huella(&m);
            assert_eq!(numero(&m, 12), (2.0 / LSB).round() as u32);
            m.restaurar_estado().unwrap();
            assert_eq!(huella(&m), en_a);
            m.advance_to(1e-6 + 9.0 * PERIODO, u32::MAX).unwrap();
            assert_eq!(huella(&m), en_b, "volver a correr da lo mismo bit a bit");
        }
    }

    #[test]
    fn la_conversion_en_curso_vuelve_a_correr_igual_tras_retroceder() {
        // Un contador de 4 bits que recorre el convertidor al ritmo de un reloj de 1 MHz, con la entrada entre dos códigos.
        let net = Netlist::from_json(
            &json!({"nodes":5,"digital_nets":8,"elements":[
                {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":1e6}},
                {"type":"ADC","p":1,"n":0,"out":0,"in_low":1.5,"in_high":3.5},
                {"type":"V","a":2,"b":0,"wave":{"kind":"dc","v":5}},
                {"type":"V","a":4,"b":0,"wave":{"kind":"dc","v":2.0}},
                {"type":"R","a":3,"b":0,"ohms":1000},
                {"type":"C","a":3,"b":0,"farads":1e-10},
                {"type":"ADC","p":4,"n":3,"out":7,"in_low":-0.05e-3,"in_high":0.05e-3,"histeresis":true},
                {"type":"LOGIC","out":6,"value":0},
                {"type":"COUNTER","clk":0,"rst":6,"q":[1,2,3,4],"co":5,"modulo":16,"rise_delay":5e-9,"fall_delay":5e-9},
                {"type":"DACM","modo":"voltaje","out":3,"ret":0,"ref_p":2,"ref_n":0,"bits":[4,3,2,1],"t_asentamiento":1.5e-7}]})
            .to_string(),
        )
        .unwrap();
        let huella = |m: &Mixto| {
            let mut v = vec![m.time().to_bits()];
            v.extend(m.voltages().iter().map(|x| x.to_bits()));
            for r in m.readings() {
                v.extend([r.i.to_bits(), r.aux.to_bits(), r.estado.to_bits()]);
            }
            v.extend((0..m.digital_count()).map(|r| m.nivel(r).codigo().to_bits()));
            v.extend(m.tiempos_de_islas().iter().map(|t| t.to_bits()));
            v
        };
        let mut m = Mixto::new(net, 1e-7).unwrap();
        // A 60 ns de un flanco: el convertidor va a media rampa entre dos códigos.
        m.advance_to(20.06e-6, u32::MAX).unwrap();
        let en_a = huella(&m);
        let (a, k) = (m.voltage(3), m.readings()[9].estado);
        assert!(k > 0.0 && a > 0.0, "el convertidor tiene que estar en un código no nulo");
        m.guardar_estado();
        m.advance_to(41.7e-6, u32::MAX).unwrap();
        let en_b = huella(&m);
        assert_ne!(en_a, en_b);
        m.restaurar_estado().unwrap();
        assert_eq!(huella(&m), en_a);
        m.advance_to(41.7e-6, u32::MAX).unwrap();
        assert_eq!(huella(&m), en_b, "volver a correr da lo mismo bit a bit");
    }
}

/// El 4017 con CLK fijo en alto: cada bajada de INH hace subir «CLK y no INH» y cuenta una vez, sin colgarse ni dejar una salida fuera de 0 y 1.
mod contador_johnson {
    use super::*;
    use serde_json::json;

    // Redes digitales: 0 a 9 salidas decodificadas, 10 CO, 11 CLK, 12 INH, 13 RESET. Elementos: 0 CLK, 1 INH, 2 RESET, 3 el 4017.
    fn johnson() -> Netlist {
        let tabla: Vec<u64> = (0..16u64).map(|n| (0..10u64).map(|k| u64::from(n == k) << (2 * k)).sum::<u64>() | u64::from(n < 5) << 20).collect();
        let de: Vec<serde_json::Value> = (0..11).map(|c| json!({"tipo":"tabla","columna":c})).collect();
        let net = json!({"nodes":1,"digital_nets":14,"tablas":[tabla],"elements":[
            {"type":"LOGIC","out":11,"value":1},
            {"type":"LOGIC","out":12,"value":0},
            {"type":"LOGIC","out":13,"value":1},
            {"type":"MSI","entradas":[11,12,13],"salidas":(0..11).collect::<Vec<usize>>(),
                "nucleo":{"tipo":"contador","bits":4,"modulo":10,"reloj":{"senales":[{"entrada":0},{"entrada":1,"bajo":true}],"combina":"Y","flanco":"subida"},"borra":{"senal":{"entrada":2},"sincrona":false}},
                "de":de,"fuentes":[{"bit":3},{"bit":2},{"bit":1},{"bit":0}],"tabla":0,"retardos":vec![[2.75e-7, 2.75e-7]; 11]}]});
        Netlist::from_json(&net.to_string()).unwrap()
    }

    fn salidas(m: &Mixto) -> Vec<Nivel> {
        (0..11).map(|r| m.nivel(r)).collect()
    }

    #[test]
    fn un_4017_contado_por_la_bajada_de_inh_con_clk_en_alto_cuenta_una_vez_por_ciclo() {
        let mut m = Mixto::new(johnson(), 1e-6).unwrap();
        m.advance_to(2e-6, u32::MAX).unwrap();
        m.set_element(2, Element::Logic { out: 13, value: 0 }).unwrap();
        let mut t = 4e-6;
        m.advance_to(t, u32::MAX).unwrap();
        for ciclo in 1..=200usize {
            m.set_element(1, Element::Logic { out: 12, value: 1 }).unwrap();
            t += 1e-6;
            m.advance_to(t, u32::MAX).unwrap();
            m.set_element(1, Element::Logic { out: 12, value: 0 }).unwrap();
            t += 1e-6;
            m.advance_to(t, u32::MAX).unwrap();
            let n = ciclo % 10;
            let s = salidas(&m);
            assert!(s.iter().all(|&x| x == Nivel::Cero || x == Nivel::Uno), "ciclo {ciclo}: una salida quedó fuera de 0 y 1");
            let altas: Vec<usize> = (0..10).filter(|&k| s[k] == Nivel::Uno).collect();
            assert_eq!(altas, vec![n], "ciclo {ciclo}: la salida decodificada en alto");
            assert_eq!(s[10] == Nivel::Uno, n < 5, "ciclo {ciclo}: CO");
        }
        assert!(m.time() >= t, "la simulación llegó al final");
    }

    #[test]
    fn con_inh_en_alto_el_reloj_no_cuenta_y_el_borrado_manda_sobre_el_reloj() {
        let mut m = Mixto::new(johnson(), 1e-6).unwrap();
        m.set_element(2, Element::Logic { out: 13, value: 0 }).unwrap();
        m.set_element(1, Element::Logic { out: 12, value: 1 }).unwrap();
        let mut t = 2e-6;
        for _ in 0..30 {
            m.set_element(0, Element::Logic { out: 11, value: 0 }).unwrap();
            t += 1e-6;
            m.advance_to(t, u32::MAX).unwrap();
            m.set_element(0, Element::Logic { out: 11, value: 1 }).unwrap();
            t += 1e-6;
            m.advance_to(t, u32::MAX).unwrap();
        }
        assert_eq!(m.nivel(0), Nivel::Uno, "inhibido, el contador sigue en 0");
        assert!((1..10).all(|k| m.nivel(k) == Nivel::Cero));
        // Sin inhibición cuenta con cada subida y RESET lo devuelve a 0 sin esperar al reloj. INH baja con CLK en bajo para no contar.
        m.set_element(0, Element::Logic { out: 11, value: 0 }).unwrap();
        t += 1e-6;
        m.advance_to(t, u32::MAX).unwrap();
        m.set_element(1, Element::Logic { out: 12, value: 0 }).unwrap();
        t += 1e-6;
        m.advance_to(t, u32::MAX).unwrap();
        assert_eq!(m.nivel(0), Nivel::Uno, "INH bajando con CLK en bajo no cuenta");
        for _ in 0..3 {
            m.set_element(0, Element::Logic { out: 11, value: 0 }).unwrap();
            t += 1e-6;
            m.advance_to(t, u32::MAX).unwrap();
            m.set_element(0, Element::Logic { out: 11, value: 1 }).unwrap();
            t += 1e-6;
            m.advance_to(t, u32::MAX).unwrap();
        }
        assert_eq!(m.nivel(3), Nivel::Uno, "tres subidas, salida Q3 en alto");
        m.set_element(2, Element::Logic { out: 13, value: 1 }).unwrap();
        t += 1e-6;
        m.advance_to(t, u32::MAX).unwrap();
        assert_eq!(m.nivel(0), Nivel::Uno);
        assert_eq!(m.nivel(3), Nivel::Cero);
    }
}

/// Un 74HC161 cuyo CLR sube despacio (una rampa o un interruptor) sin otra actividad digital: al cruzar la zona X del puente la
/// cuenta debe tomar el valor de CLR ya definido, no quedarse en X.
mod control_asincrono {
    use super::*;
    use serde_json::json;

    // Nodos: 1 alto (4.5 V), 2 CLR, 3 CLK. Redes: 0 a 3 QA a QD, 4 RCO, 5 CLK, 6 ENP, 7 ENT, 8 CLR, 9 LOAD, 10 a 13 A a D.
    // Elementos: 0 alto, 1 CLR, 2 CLK.
    fn c161(clr: serde_json::Value) -> Netlist {
        let adc = |p: usize, out: usize| json!({"type":"ADC","p":p,"n":0,"out":out,"in_low":1.35,"in_high":3.15});
        let mut el = vec![
            json!({"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":4.5}}),
            json!({"type":"V","a":2,"b":0,"wave":clr}),
            json!({"type":"V","a":3,"b":0,"wave":{"kind":"dc","v":0}}),
        ];
        for (p, out) in [(3, 5), (1, 6), (1, 7), (2, 8), (1, 9), (3, 10), (3, 11), (3, 12), (3, 13)] {
            el.push(adc(p, out));
        }
        let tabla: Vec<u64> = (0..32u64).map(|i| u64::from(i == 0b11111)).collect();
        el.push(json!({"type":"MSI","entradas":[5,6,7,8,9,10,11,12,13],"salidas":[0,1,2,3,4],
            "nucleo":{"tipo":"contador","bits":4,"modulo":16,"reloj":{"senales":[{"entrada":0}],"flanco":"subida"},"habilita":[{"entrada":1},{"entrada":2}],
                "borra":{"senal":{"entrada":3,"bajo":true},"sincrona":false},"carga":{"senal":{"entrada":4,"bajo":true},"sincrona":true,"datos":[5,6,7,8]}},
            "de":[{"tipo":"directa","fuente":{"bit":0}},{"tipo":"directa","fuente":{"bit":1}},{"tipo":"directa","fuente":{"bit":2}},{"tipo":"directa","fuente":{"bit":3}},{"tipo":"tabla","columna":0}],
            "fuentes":[{"entrada":2},{"bit":3},{"bit":2},{"bit":1},{"bit":0}],"tabla":0,"retardos":vec![[2.15e-8, 2.15e-8]; 5]}));
        Netlist::from_json(&json!({"nodes":4,"digital_nets":14,"tablas":[tabla],"elements":el}).to_string()).unwrap()
    }

    fn cuenta(m: &Mixto) -> Option<u32> {
        (0..4).try_fold(0u32, |a, k| match m.nivel(k) {
            Nivel::Cero => Some(a),
            Nivel::Uno => Some(a | 1 << k),
            _ => None,
        })
    }

    fn dc(v: f64) -> Wave {
        Wave::Dc { v }
    }

    /// Un pulso de reloj por `set_element`; devuelve el instante siguiente.
    fn pulso(m: &mut Mixto, t: f64) -> f64 {
        m.set_element(2, Element::V { a: 3, b: 0, wave: dc(4.5) }).unwrap();
        m.advance_to(t + 1e-6, u32::MAX).unwrap();
        m.set_element(2, Element::V { a: 3, b: 0, wave: dc(0.0) }).unwrap();
        m.advance_to(t + 2e-6, u32::MAX).unwrap();
        t + 2e-6
    }

    #[test]
    fn un_clr_que_sube_en_rampa_deja_la_cuenta_en_cero_y_el_contador_sigue_contando() {
        let mut m = Mixto::new(c161(json!({"kind":"pwl","puntos":[[0.0,0.0],[1e-6,0.0],[1.1e-6,4.5]]})), 1e-6).unwrap();
        m.advance_to(3e-6, u32::MAX).unwrap();
        assert_eq!(m.nivel(8), Nivel::Uno, "CLR ya está en alto");
        assert_eq!(cuenta(&m), Some(0), "CLR subió y la cuenta quedó en cero");
        let t = pulso(&mut m, 3e-6);
        pulso(&mut m, t);
        assert_eq!(cuenta(&m), Some(2), "dos subidas del reloj");
    }

    #[test]
    fn un_interruptor_en_clr_borra_y_suelta_la_cuenta() {
        let mut m = Mixto::new(c161(json!({"kind":"dc","v":4.5})), 1e-6).unwrap();
        m.advance_to(1e-6, u32::MAX).unwrap();
        let mut t = 1e-6;
        for _ in 0..5 {
            t = pulso(&mut m, t);
        }
        assert_eq!(cuenta(&m), Some(5));
        for ciclo in 0..3 {
            m.set_element(1, Element::V { a: 2, b: 0, wave: dc(0.0) }).unwrap();
            t += 1e-6;
            m.advance_to(t, u32::MAX).unwrap();
            assert_eq!(cuenta(&m), Some(0), "ciclo {ciclo}: CLR en bajo borra");
            m.set_element(1, Element::V { a: 2, b: 0, wave: dc(4.5) }).unwrap();
            t += 1e-6;
            m.advance_to(t, u32::MAX).unwrap();
            assert_eq!(cuenta(&m), Some(0), "ciclo {ciclo}: al soltar CLR la cuenta sigue en cero");
            t = pulso(&mut m, t);
            assert_eq!(cuenta(&m), Some(1), "ciclo {ciclo}: y cuenta con el reloj");
        }
    }
}
