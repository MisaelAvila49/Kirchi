//! Fusible: resistencia baja cuyo calentamiento `s` (A²) sigue a i² con tau · ds/dt = i² − s y se funde al llegar a ifusion² (el doble de la nominal). Para un pulso corto s ≈ ∫i²dt / tau, el I²t del fabricante.
//! Se integra fuera de la matriz tras cada paso aceptado con la solución exacta para i² constante. Una isla quieta con fusible salta entre eventos integrando igual (`avanzar_quieto`) y el instante de fusión es un punto de quiebre.

use super::{stamp_g, stamp_i, volt, Alloc, Ctx, Device, Event, Reading, U};
use crate::netlist::Element;

/// Resistencia del fusible abierto: la misma de un interruptor abierto.
pub const R_ABIERTO: f64 = 1e9;
/// Se funde al llegar a esta fracción de ifusion²: el paso que cae en el instante de fusión calculado puede quedarse una
/// fracción de redondeo abajo, y sin margen el siguiente punto de quiebre caería a unos femtosegundos.
const MARGEN_FUSION: f64 = 1e-9;
/// Por encima de este voltaje para fundirlo (ohms por ifusion), un fusible no se funde (`no_se_funde`).
const VOLTAJE_SIN_FUSION: f64 = 1e8;

#[derive(Clone)]
pub struct Fuse {
    idx: usize,
    a: usize,
    b: usize,
    ohms: f64,
    inom: f64,
    ifusion: f64,
    tau: f64,
    /// La fuente en serie de `a` a `b` (V): la de prueba del óhmetro del multímetro; 0 en un fusible.
    emf: f64,
    ua: U,
    ub: U,
    s: f64,
    i_prev: f64,
    fundido: bool,
    /// Desde cuándo la corriente pasa de la nominal (para decir cuánto duró la sobrecarga).
    desde: Option<f64>,
    /// e^(−h/τ) del último paso y su h: el paso casi siempre es el mismo y la exponencial se calculaba en cada uno.
    h_exp: f64,
    f_exp: f64,
    /// Sin carga (el voltímetro ideal): no estampa nada ni lleva corriente; el multímetro es solo su sonda.
    sin_carga: bool,
    /// La resistencia con que se resolvió el último paso (al fundirse en él, las corrientes por terminal siguen siendo
    /// las de la solución).
    r_paso: f64,
}

impl Fuse {
    #[allow(clippy::too_many_arguments)]
    pub fn new(idx: usize, a: usize, b: usize, ohms: f64, inom: f64, ifusion: f64, tau: f64, emf: f64, sin_carga: bool) -> Self {
        Self { idx, a, b, ohms, inom, ifusion, tau, emf, ua: None, ub: None, s: 0.0, i_prev: 0.0, fundido: false, desde: None, h_exp: f64::NAN, f_exp: 0.0, sin_carga, r_paso: ohms }
    }

    /// La corriente de `a` hacia `b` por dentro, con la fuente en serie (cero sin carga).
    fn corriente(&self, x: &[f64]) -> f64 {
        if self.sin_carga {
            return 0.0;
        }
        (volt(x, self.ua) - volt(x, self.ub) - self.emf) / self.r()
    }

    fn r(&self) -> f64 {
        if self.fundido { R_ABIERTO } else { self.ohms }
    }

    /// e^(−h/τ), recordando el último.
    fn decaimiento(&mut self, h: f64) -> f64 {
        if h != self.h_exp {
            (self.h_exp, self.f_exp) = (h, decaer(h / self.tau));
        }
        self.f_exp
    }

    /// Un fusible que necesitaría más de 100 MV para fundirse (el del voltímetro, 10 MΩ por 20 A son 200 MV, contra el
    /// millón de voltios que admite una fuente) no se funde: no calienta, y el motor no le pide `accept` ni quiebres.
    /// Sin carga tampoco. Si cambia en caliente (otro modo del multímetro), el motor vuelve a preguntar.
    fn no_se_funde(&self) -> bool {
        self.sin_carga || self.ohms * self.ifusion > VOLTAJE_SIN_FUSION
    }

    fn umbral(&self) -> f64 {
        self.ifusion * self.ifusion * (1.0 - MARGEN_FUSION)
    }
}

/// e^(−x). Con los pasos de casi siempre (h/τ < 1e-3, y cada paso tiene otro h) un polinomio de cuarto grado da la misma
/// cifra que `exp` con la cuarta parte del trabajo: lo que se deja fuera es menor que x⁵/120 ≈ 8e-18.
fn decaer(x: f64) -> f64 {
    if (0.0..1e-3).contains(&x) {
        1.0 - x * (1.0 - x * (0.5 - x * (1.0 / 6.0 - x * (1.0 / 24.0))))
    } else {
        (-x).exp()
    }
}

impl Device for Fuse {
    fn bind(&mut self, a: &mut Alloc) {
        self.ua = a.ext(self.a);
        self.ub = a.ext(self.b);
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        if self.sin_carga {
            return false;
        }
        self.r_paso = self.r();
        let g = 1.0 / self.r_paso;
        stamp_g(c.m, self.ua, self.ub, g);
        // Por dentro va de `a` a `b` la corriente g·(V(a, b) − v): su parte constante es −g·v.
        if self.emf != 0.0 {
            stamp_i(c.rhs, self.ua, self.ub, -g * self.emf);
        }
        false
    }

    fn linear(&self) -> bool {
        true
    }

    fn tiene_dinamica(&self) -> bool {
        false
    }

    /// Su estampa cambia solo al fundirse (una discontinuidad de `accept`), al reponerlo o con `set`.
    fn estampa_fija(&self) -> bool {
        true
    }

    fn tiene_quiebres(&self) -> bool {
        !self.no_se_funde()
    }

    /// Sin calentamiento que integrar si no se puede fundir (`no_se_funde`).
    fn usa_accept(&self) -> bool {
        !self.no_se_funde()
    }

    /// Con sobrecarga (i² del último paso arriba de ifusion²), el instante en que el calentamiento llega a ifusion² con esa
    /// corriente: t + τ·ln((i² − s)/(i² − ifusion²)).
    fn next_break(&self, t: f64) -> f64 {
        // Lo de casi siempre (el motor pregunta en cada paso): sin sobrecarga no hay quiebre.
        if self.fundido || self.i_prev.abs() <= self.ifusion {
            return f64::INFINITY;
        }
        let (i2, f2) = (self.i_prev * self.i_prev, self.ifusion * self.ifusion);
        if i2 <= f2 || self.s >= self.umbral() {
            return f64::INFINITY;
        }
        t + self.tau * ((i2 - self.s) / (i2 - f2)).ln()
    }

    fn avanzar_quieto(&mut self, h: f64) -> bool {
        if self.fundido {
            return false;
        }
        let i2 = self.i_prev * self.i_prev;
        self.s = i2 + (self.s - i2) * (-h / self.tau).exp();
        true
    }

    fn accept(&mut self, x: &[f64], _s0: &[f64], t: f64, h: f64, ev: &mut Vec<Event>) -> bool {
        let i = self.corriente(x);
        if self.fundido {
            return false;
        }
        // Con el calentamiento y la corriente debajo de una billonésima del umbral (el fusible del voltímetro, 10 MΩ), el
        // calentamiento exacto no pasa de ese mismo valor (s' = i² + (s − i²)·e^(−h/τ) ≤ max(s, i²)): no se integra. La lectura
        // y el instante de fusión cambian a lo más en esa billonésima.
        let chico = 1e-12 * self.umbral();
        if self.s <= chico && i * i <= chico && self.i_prev * self.i_prev <= chico {
            self.i_prev = i;
        } else {
            let i2 = 0.5 * (self.i_prev * self.i_prev + i * i);
            self.s = i2 + (self.s - i2) * self.decaimiento(h);
            self.i_prev = i;
        }
        if i.abs() > self.inom {
            self.desde.get_or_insert(t - h);
        } else {
            self.desde = None;
        }
        if self.s >= self.umbral() {
            self.fundido = true;
            let desde = self.desde.unwrap_or(t - h);
            ev.push(Event { element: self.idx, t, amps: i.abs(), seconds: t - desde });
            return true;
        }
        false
    }

    /// Corriente; en `aux`, la fracción del calentamiento que lo funde; en `estado`, 1 si está fundido.
    fn reading(&self, x: &[f64], _s0: &[f64]) -> Reading {
        let i = self.corriente(x);
        Reading { i, aux: self.s / (self.ifusion * self.ifusion), estado: if self.fundido { 1.0 } else { 0.0 } }
    }

    /// La corriente de la solución del paso, con la resistencia con que se resolvió.
    fn corrientes_propias(&self) -> bool {
        true
    }

    fn corrientes(&self, x: &[f64], _s0: &[f64], _r: &Reading, out: &mut [f64]) {
        let i = if self.sin_carga { 0.0 } else { (volt(x, self.ua) - volt(x, self.ub) - self.emf) / self.r_paso };
        out[0] = i;
        out[1] = -i;
        out[2] = 0.0;
    }

    /// Cambio en caliente de sus valores (el multímetro con «Instrumento ideal»): conserva el calentamiento y si está fundido.
    fn set(&mut self, e: &Element) -> bool {
        match *e {
            Element::Fuse { a, b, ohms, inom, ifusion, tau, v, sin_carga } if a == self.a && b == self.b => {
                (self.ohms, self.inom, self.ifusion, self.tau, self.emf, self.sin_carga) = (ohms, inom, ifusion, tau, v, sin_carga);
                self.h_exp = f64::NAN;
                true
            }
            _ => false,
        }
    }

    fn reset(&mut self) -> bool {
        self.fundido = false;
        self.s = 0.0;
        self.i_prev = 0.0;
        self.desde = None;
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::{Element, Netlist, Transient};

    #[test]
    fn el_fusible_del_voltimetro_no_calienta_y_al_pasar_a_amperimetro_sobre_una_bateria_se_funde() {
        // Con 10 MΩ haría falta más de 100 MV para fundirlo: no se le pide `accept` ni quiebres. Cambiado en caliente a 0.1 Ω
        // (el amperímetro) sobre 5 V con 1 Ω vuelve a calentarse y se funde a los 26.9 ms, como desde frío.
        let voltimetro = FUSIBLE.replace(r#""ohms":0.1,"inom":1,"ifusion":2"#, r#""ohms":1e7,"inom":10,"ifusion":20"#);
        let mut tr = Transient::new(Netlist::from_json(&voltimetro).unwrap(), 1e-5).unwrap();
        assert!(!tr.devs_usan_accept(1));
        tr.advance_to(0.1, u32::MAX).unwrap();
        assert_eq!(tr.readings()[1].aux, 0.0);
        let amperimetro = Netlist::from_json(FUSIBLE).unwrap().elements[1].clone();
        tr.set_element(1, amperimetro).unwrap();
        assert!(tr.devs_usan_accept(1));
        let t0 = tr.time();
        tr.advance_to(t0 + 40e-3, u32::MAX).unwrap();
        let ev = tr.take_events();
        assert_eq!(ev.len(), 1);
        assert!((ev[0].t - t0 - 26.9e-3).abs() < 0.1e-3, "t = {}", ev[0].t - t0);
    }

    #[test]
    fn sin_carga_el_voltimetro_ideal_no_pone_resistencia_y_vuelve_a_ponerla_en_caliente() {
        // el voltímetro ideal es solo la sonda. Sobre 1 MΩ y 1 MΩ con 5 V, el punto medio queda en 2.5 V exactos
        // y el fusible no lleva corriente; con la resistencia del voltímetro (10 MΩ) vuelve a cargarlo.
        let red = |sin_carga: bool| format!(r#"{{"nodes":3,"elements":[
            {{"type":"V","a":1,"b":0,"wave":{{"kind":"dc","v":5}}}},
            {{"type":"R","a":1,"b":2,"ohms":1e6}},
            {{"type":"R","a":2,"b":0,"ohms":1e6}},
            {{"type":"FUSE","a":2,"b":0,"ohms":1e7,"inom":10,"ifusion":20,"tau":0.125,"sin_carga":{sin_carga}}}]}}"#);
        let mut tr = Transient::new(Netlist::from_json(&red(true)).unwrap(), 1e-5).unwrap();
        tr.advance_to(1e-3, u32::MAX).unwrap();
        assert!((tr.voltage(2) - 2.5).abs() < 1e-9, "v = {}", tr.voltage(2));
        assert_eq!(tr.readings()[3].i, 0.0);
        let con = Netlist::from_json(&red(false)).unwrap().elements[3].clone();
        tr.set_element(3, con).unwrap();
        tr.advance_to(2e-3, u32::MAX).unwrap();
        assert!((tr.voltage(2) - 2.381).abs() < 1e-3, "v = {}", tr.voltage(2));
        assert!(tr.readings()[3].i > 0.0);
        // Sin el campo, el fusible carga como siempre (los archivos de antes).
        assert!(matches!(Netlist::from_json(&red(true).replace(r#","sin_carga":true"#, "")).unwrap().elements[3], Element::Fuse { sin_carga: false, .. }));
    }

    #[test]
    fn tras_medio_segundo_con_una_corriente_minima_se_funde_cuando_toca() {
        // Con 0.5 µA (10 MΩ) no se calienta; al bajar la carga a 1 Ω, 4.55 A lo funden 26.9 ms después, como desde frío.
        let mut tr = Transient::new(Netlist::from_json(&FUSIBLE.replace(r#""ohms":1}"#, r#""ohms":1e7}"#)).unwrap(), 1e-5).unwrap();
        tr.advance_to(0.5, u32::MAX).unwrap();
        assert!(tr.readings()[1].aux <= 1e-12, "calentamiento {}", tr.readings()[1].aux);
        tr.set_resistance(2, 1.0).unwrap();
        let t0 = tr.time();
        tr.advance_to(t0 + 40e-3, u32::MAX).unwrap();
        let ev = tr.take_events();
        assert_eq!(ev.len(), 1);
        assert!((ev[0].t - t0 - 26.9e-3).abs() < 0.1e-3, "t = {}", ev[0].t - t0);
    }

    #[test]
    fn el_decaimiento_de_paso_corto_es_la_exponencial_hasta_la_ultima_cifra() {
        // Con h/τ < 1e-3 el polinomio de cuarto grado deja un resto menor que (1e-3)⁵/120 ≈ 8e-18, debajo de la mitad de la
        // última cifra de un número cerca de 1 (1.1e-16).
        let mut x = 0.0f64;
        while x < 2e-3 {
            let (a, b) = (super::decaer(x), (-x).exp());
            assert!((a - b).abs() <= f64::EPSILON * b, "x = {x}: {a} contra {b}");
            x += 1.37e-7;
        }
        assert_eq!(super::decaer(0.0), 1.0);
        assert_eq!(super::decaer(0.5), (-0.5f64).exp());
    }

    const FUSIBLE: &str = r#"{"nodes":3,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
        {"type":"FUSE","a":1,"b":2,"ohms":0.1,"inom":1,"ifusion":2,"tau":0.125},
        {"type":"R","a":2,"b":0,"ohms":1}]}"#;

    #[test]
    fn se_funde_con_cinco_veces_la_nominal_y_lo_avisa() {
        // 4.55 A: s = 20.7 (1 - e^(-t/0.125)) llega a 4 en 26.9 ms.
        let mut tr = Transient::new(Netlist::from_json(FUSIBLE).unwrap(), 1e-5).unwrap();
        tr.advance_to(20e-3, u32::MAX).unwrap();
        assert!(tr.take_events().is_empty());
        assert_eq!(tr.readings()[1].estado, 0.0);
        tr.advance_to(40e-3, u32::MAX).unwrap();
        let ev = tr.take_events();
        assert_eq!(ev.len(), 1);
        assert_eq!(ev[0].element, 1);
        assert!((ev[0].t - 26.9e-3).abs() < 0.1e-3, "t = {}", ev[0].t);
        assert!((ev[0].amps - 5.0 / 1.1).abs() < 1e-3, "i = {}", ev[0].amps);
        assert!((ev[0].seconds - ev[0].t).abs() < 1e-4, "durante {}", ev[0].seconds);
        // Fundido: abierto, sin corriente, y ya no avisa otra vez.
        let r = tr.readings()[1];
        assert_eq!(r.estado, 1.0);
        assert!(r.i.abs() < 1e-8);
        tr.advance_to(60e-3, u32::MAX).unwrap();
        assert!(tr.take_events().is_empty());
    }

    #[test]
    fn reponerlo_lo_deja_entero_y_frio() {
        let mut tr = Transient::new(Netlist::from_json(FUSIBLE).unwrap(), 1e-5).unwrap();
        tr.advance_to(40e-3, u32::MAX).unwrap();
        assert_eq!(tr.readings()[1].estado, 1.0);
        tr.reset_element(1).unwrap();
        tr.advance_to(41e-3, u32::MAX).unwrap();
        let r = tr.readings()[1];
        assert_eq!(r.estado, 0.0);
        assert!((r.i - 5.0 / 1.1).abs() < 1e-3);
        // Vuelve a fundirse 27 ms después de reponerlo, no antes.
        tr.advance_to(60e-3, u32::MAX).unwrap();
        assert_eq!(tr.readings()[1].estado, 0.0);
        tr.advance_to(70e-3, u32::MAX).unwrap();
        assert_eq!(tr.readings()[1].estado, 1.0);
        assert!(tr.reset_element(0).is_err(), "una fuente no se repone");
    }

    #[test]
    fn a_la_corriente_nominal_no_se_funde() {
        let json = FUSIBLE.replace(r#""ohms":1}"#, r#""ohms":4.9}"#);
        let mut tr = Transient::new(Netlist::from_json(&json).unwrap(), 1e-4).unwrap();
        tr.advance_to(2.0, u32::MAX).unwrap();
        assert_eq!(tr.readings()[1].estado, 0.0);
        assert!((tr.readings()[1].aux - 0.25).abs() < 0.01, "calentamiento {}", tr.readings()[1].aux);
    }

    #[test]
    fn un_fusible_no_le_quita_a_su_isla_el_salto_entre_eventos() {
        // El multímetro es un fusible: sobre el LED que maneja un inversor (una isla quieta, que salta entre los
        // flancos de 1 kHz), la isla debe seguir saltando en vez de dar un paso cada 10 µs (le costaba 19 % de capacidad al
        // 555 con display).
        let circuito = |con_fusible: bool| {
            let fusible = if con_fusible { r#",{"type":"FUSE","a":3,"b":0,"ohms":1e7,"inom":10,"ifusion":20,"tau":0.125}"# } else { "" };
            format!(
                r#"{{"nodes":4,"digital_nets":2,"elements":[
                {{"type":"V","a":1,"b":0,"wave":{{"kind":"square","low":0,"high":5,"freq":1000}}}},
                {{"type":"ADC","p":1,"n":0,"out":0,"in_low":1.5,"in_high":3.5}},
                {{"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":5e-9,"fall_delay":5e-9}},
                {{"type":"DAC","input":1,"out":2,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":7e-9,"t_fall":7e-9}},
                {{"type":"R","a":2,"b":3,"ohms":330}},
                {{"type":"D","a":3,"b":0,"is":1.5e-17,"n":2}}{fusible}]}}"#
            )
        };
        let pasos = |json: String| {
            let mut m = crate::Mixto::new(Netlist::from_json(&json).unwrap(), 1e-5).unwrap();
            m.advance_to(0.1, u32::MAX).unwrap()
        };
        let (sin, con) = (pasos(circuito(false)), pasos(circuito(true)));
        assert!(con as f64 <= 1.1 * sin as f64, "{con} pasos con el fusible contra {sin} sin él");
    }

    #[test]
    fn en_el_salto_el_calentamiento_sigue_la_formula_exacta() {
        // A la corriente nominal (1 A con 2 A de fusión) el calentamiento tras t es (i/ifusion)² (1 − e^(−t/τ)), dé la isla
        // los pasos que dé.
        let json = FUSIBLE.replace(r#""ohms":1}"#, r#""ohms":4.9}"#);
        let mut m = crate::Mixto::new(Netlist::from_json(&json).unwrap(), 1e-5).unwrap();
        for t in [0.05, 0.1, 0.3] {
            m.advance_to(t, u32::MAX).unwrap();
            let exacto = 0.25 * (1.0 - (-t / 0.125f64).exp());
            let aux = m.readings()[1].aux;
            assert!((aux - exacto).abs() < 1e-4, "en {t} s: {aux} contra {exacto}");
        }
    }

    #[test]
    fn con_sobrecarga_en_una_isla_quieta_se_funde_en_su_instante() {
        // 4.55 A: el instante de fusión (26.9 ms) es un punto de quiebre, y el paso cae justo en él (una isla quieta tampoco
        // salta más allá: con un quiebre pendiente no salta).
        let mut m = crate::Mixto::new(Netlist::from_json(FUSIBLE).unwrap(), 1e-5).unwrap();
        let pasos = m.advance_to(1.0, u32::MAX).unwrap();
        let ev = m.take_events();
        assert_eq!(ev.len(), 1);
        let i: f64 = 5.0 / 1.1;
        let exacto = 0.125 * (i * i / (i * i - 4.0)).ln();
        assert!((ev[0].t - exacto).abs() < 1e-8, "se fundió en {} contra {exacto}", ev[0].t);
        assert!(pasos > 0);
    }
}
