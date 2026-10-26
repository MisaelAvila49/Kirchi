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
