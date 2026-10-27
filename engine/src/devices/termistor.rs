//! Termistor (NTC o PTC) con calentamiento propio: R(Tc) con Tc = temperatura ambiente del canal más θ, y θ (K) un nodo interno con la
//! conductancia `delta` (W/K) y la capacidad `tau`·`delta`, alimentado con la potencia v²/R, la misma forma que el foco.
//! R sale de la fórmula con `beta` o de la tabla R/T interpolada en ln R (fuera de la tabla se queda en el valor del extremo).
//! Al llegar a `tmax` se quema y queda abierto hasta que se repone.

use super::{close, entry, init_charge, init_current, inject, integrate, stamp_g, terr, volt, Alloc, Ctx, Device, Event, Hist, Mode, Reading, Tol, U};
use crate::devices::fuse::R_ABIERTO;
use crate::netlist::TipoTermistor;

/// 25 °C y el cero Celsius, en kelvin.
const T_REF: f64 = 298.15;
const K_CERO: f64 = 273.15;
/// Cotas de la temperatura y de la resistencia que usa la fórmula: más allá, la exponencial desborda.
const T_MIN_K: f64 = 100.0;
const T_MAX_K: f64 = 3000.0;
const R_MIN: f64 = 1e-6;
const R_MAX: f64 = 1e15;

#[derive(Clone)]
pub struct Termistor {
    idx: usize,
    a: usize,
    b: usize,
    tipo: TipoTermistor,
    r25: f64,
    beta: f64,
    /// Tabla R/T como pares (°C, ln R).
    tabla: Option<Vec<(f64, f64)>>,
    delta: f64,
    tau: f64,
    canal: usize,
    tmax: f64,
    ua: U,
    ub: U,
    th: usize,
    st: usize,
    quemado: bool,
    /// Desde cuándo pasa de la mitad del camino entre el ambiente y `tmax`.
    desde: Option<f64>,
    /// Temperatura ambiente de la última estampa (°C).
    amb: f64,
}

// Casillas de estado: carga térmica y su corriente; corriente, potencia y temperatura de la última iteración.
const QT: usize = 0;
const IL: usize = 2;
const IP: usize = 3;
const ITC: usize = 4;

impl Termistor {
    #[allow(clippy::too_many_arguments)]
    pub fn new(idx: usize, a: usize, b: usize, tipo: TipoTermistor, r25: f64, beta: f64, rt: &Option<Vec<[f64; 2]>>, delta: f64, tau: f64, canal: usize, tmax: f64) -> Self {
        let tabla = rt.as_ref().map(|t| t.iter().map(|p| (p[0], p[1].ln())).collect());
        Self { idx, a, b, tipo, r25, beta, tabla, delta, tau, canal, tmax, ua: None, ub: None, th: 0, st: 0, quemado: false, desde: None, amb: 25.0 }
    }

    /// Resistencia a la temperatura `tc` (°C) y su derivada respecto de ella; quemado, la de un circuito abierto.
    fn resistencia(&self, tc: f64) -> (f64, f64) {
        if self.quemado {
            return (R_ABIERTO, 0.0);
        }
        let (ln_r, dln) = match &self.tabla {
            Some(t) => {
                let ult = t.len() - 1;
                if tc <= t[0].0 {
                    (t[0].1, 0.0)
                } else if tc >= t[ult].0 {
                    (t[ult].1, 0.0)
                } else {
                    let k = t.partition_point(|p| p.0 <= tc);
                    let pendiente = (t[k].1 - t[k - 1].1) / (t[k].0 - t[k - 1].0);
                    (t[k - 1].1 + pendiente * (tc - t[k - 1].0), pendiente)
                }
            }
            None => {
                let signo = if self.tipo == TipoTermistor::Ntc { 1.0 } else { -1.0 };
                let tk = tc + K_CERO;
                let (tk, vivo) = if tk <= T_MIN_K {
                    (T_MIN_K, false)
                } else if tk >= T_MAX_K {
                    (T_MAX_K, false)
                } else {
                    (tk, true)
                };
                (self.r25.ln() + signo * self.beta * (1.0 / tk - 1.0 / T_REF), if vivo { -signo * self.beta / (tk * tk) } else { 0.0 })
            }
        };
        let r = ln_r.exp();
        if r <= R_MIN {
            (R_MIN, 0.0)
        } else if r >= R_MAX {
            (R_MAX, 0.0)
        } else {
            (r, dln * r)
        }
    }

    /// Corriente y potencia con el voltaje `v` y el calentamiento `th` (K).
    fn valores(&self, v: f64, th: f64) -> (f64, f64) {
        let (r, _) = self.resistencia(self.amb + th);
        (v / r, if self.quemado { 0.0 } else { v * v / r })
    }
}

impl Device for Termistor {
    fn bytes_heap(&self) -> usize {
        self.tabla.as_ref().map_or(0, |t| t.capacity() * size_of::<(f64, f64)>())
    }

    fn bind(&mut self, a: &mut Alloc) {
        self.ua = a.ext(self.a);
        self.ub = a.ext(self.b);
        self.th = a.node();
        self.st = a.states(5);
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        let amb = c.canales.valor(self.canal, c.t - 0.5 * c.h, c.t);
        self.amb = if amb.is_finite() { amb } else { 25.0 };
        let s = self.st;
        let th = Some(self.th);
        let v = volt(c.x, self.ua) - volt(c.x, self.ub);
        let t = c.x[self.th];
        let (r, dr) = self.resistencia(self.amb + t);
        let (il, ip) = self.valores(v, t);
        let (gv, gt) = (1.0 / r, -v * dr / (r * r));
        let (pv, pt) = if self.quemado { (0.0, 0.0) } else { (2.0 * v / r, -v * v * dr / (r * r)) };
        stamp_g(c.m, self.ua, self.ub, gv);
        entry(c.m, self.ua, th, gt);
        entry(c.m, self.ub, th, -gt);
        let ieq = il - gv * v - gt * t;
        inject(c.rhs, self.ua, -ieq);
        inject(c.rhs, self.ub, ieq);
        // Calentamiento: la potencia entra al nodo térmico, que pierde `delta` por kelvin y guarda `tau` · `delta` de capacidad.
        entry(c.m, th, self.ua, -pv);
        entry(c.m, th, self.ub, pv);
        entry(c.m, th, th, self.delta - pt);
        inject(c.rhs, th, ip - pv * v - pt * t);
        let cap = self.tau * self.delta;
        if c.mode == Mode::Pred {
            c.s0[s + QT] = c.s1[s + QT];
        } else {
            c.s0[s + QT] = cap * t;
            init_charge(c, s + QT);
        }
        let (geq, ceq) = integrate(c, cap, s + QT);
        init_current(c, s + QT);
        stamp_g(c.m, th, None, geq);
        inject(c.rhs, th, -ceq);
        c.s0[s + IL] = il;
        c.s0[s + IP] = ip;
        c.s0[s + ITC] = self.amb + t;
        false
    }

    fn converged(&self, x: &[f64], s0: &[f64], tol: &Tol) -> bool {
        let (il, ip) = self.valores(volt(x, self.ua) - volt(x, self.ub), x[self.th]);
        close(il, s0[self.st + IL], tol) && close(ip, s0[self.st + IP], tol)
    }

    fn trunc(&self, h: &Hist, dt: &mut f64) {
        terr(h, self.st + QT, dt);
    }

    /// Tras cada paso aceptado: al llegar a `tmax` el termistor se quema y se abre.
    fn accept(&mut self, x: &[f64], s0: &[f64], t: f64, h: f64, ev: &mut Vec<Event>) -> bool {
        if self.quemado {
            return false;
        }
        let tc = self.amb + x[self.th];
        if tc > self.amb + 0.5 * (self.tmax - self.amb) {
            self.desde.get_or_insert(t - h);
        } else {
            self.desde = None;
        }
        if tc >= self.tmax {
            self.quemado = true;
            ev.push(Event { element: self.idx, t, amps: s0[self.st + IL].abs(), seconds: t - self.desde.unwrap_or(t - h) });
            return true;
        }
        false
    }

    fn reset(&mut self) -> bool {
        self.quemado = false;
        self.desde = None;
        true
    }

    /// Corriente; en `aux`, la temperatura (°C); en `estado`, 1 si se quemó.
    fn reading(&self, _x: &[f64], s0: &[f64]) -> Reading {
        Reading { i: s0[self.st + IL], aux: s0[self.st + ITC], estado: if self.quemado { 1.0 } else { 0.0 } }
    }
}

#[cfg(test)]
mod tests {
    use crate::{Netlist, Transient};

    /// Termistor alimentado con `v` volts, con el ambiente `amb` (°C) en el canal 0. Elemento 1.
    fn red(v: f64, amb: f64, term: &str) -> Transient {
        let json = format!(
            r#"{{"nodes":2,"canales":[{{"inicial":{amb}}}],"elements":[
            {{"type":"V","a":1,"b":0,"wave":{{"kind":"dc","v":{v}}}}},{term}]}}"#
        );
        Transient::new(Netlist::from_json(&json).unwrap(), 1e-2).unwrap()
    }

    const NTC_10K: &str = r#"{"type":"TERM","a":1,"b":0,"tipo":"ntc","r25":10000,"beta":3977,"delta":0.007,"tau":15,"canal":0,"tmax":150}"#;
    const NTC_100: &str = r#"{"type":"TERM","a":1,"b":0,"tipo":"ntc","r25":100,"beta":3500,"delta":0.01,"tau":1,"canal":0,"tmax":150}"#;

    #[test]
    fn la_resistencia_sigue_la_formula_de_beta_de_menos_20_a_100_grados() {
        for t in [-20.0f64, 0.0, 25.0, 50.0, 100.0] {
            // Voltaje mínimo para que el autocalentamiento no mueva la resistencia.
            let mut tr = red(1e-4, t, NTC_10K);
            tr.advance_to(1e-3, u32::MAX).unwrap();
            let tk = t + 273.15;
            let esperado = 10000.0 * (3977.0 * (1.0 / tk - 1.0 / 298.15)).exp();
            let medido = 1e-4 / tr.readings()[1].i;
            assert!((medido - esperado).abs() / esperado < 1e-9, "{t} °C: {medido} contra {esperado}");
        }
    }

    #[test]
    fn la_tabla_se_interpola_en_ln_r_y_vale_lo_de_la_hoja_en_sus_puntos() {
        let tabla = r#"{"type":"TERM","a":1,"b":0,"tipo":"ntc","r25":10000,"beta":3977,"rt":[[20,12488],[25,10000],[85,1070]],"delta":0.007,"tau":15,"canal":0,"tmax":150}"#;
        let medio = |a: f64, b: f64| (a * b).sqrt();
        for (t, esperado) in [(20.0, 12488.0), (25.0, 10000.0), (85.0, 1070.0), (22.5, medio(12488.0, 10000.0)), (55.0, medio(10000.0, 1070.0)), (-40.0, 12488.0), (100.0, 1070.0)] {
            let mut tr = red(1e-4, t, tabla);
            tr.advance_to(1e-3, u32::MAX).unwrap();
            let medido = 1e-4 / tr.readings()[1].i;
            assert!((medido - esperado).abs() / esperado < 1e-9, "{t} °C: {medido} contra {esperado}");
        }
    }

    #[test]
    fn en_regimen_el_calentamiento_es_la_potencia_entre_la_disipacion() {
        // 3 V sobre 10 kΩ: unos 0.9 mW y 0.13 K de calentamiento con delta de 7 mW/K.
        let mut tr = red(3.0, 25.0, NTC_10K);
        tr.advance_to(15.0 * 20.0, u32::MAX).unwrap();
        let r = tr.readings()[1];
        let p = 3.0 * r.i;
        let th = r.aux - 25.0;
        assert!(th > 0.05, "calentamiento {th}");
        assert!((th - p / 0.007).abs() / th < 1e-6, "θ = {th} contra P/δ = {}", p / 0.007);
    }

    #[test]
    fn el_calentamiento_sube_con_la_constante_termica() {
        // A un tau el calentamiento llega al 63 % de su valor final (la resistencia casi no cambia con 0.13 K).
        let mut tr = red(3.0, 25.0, NTC_10K);
        tr.advance_to(15.0, u32::MAX).unwrap();
        let a_tau = tr.readings()[1].aux - 25.0;
        tr.advance_to(15.0 * 20.0, u32::MAX).unwrap();
        let final_ = tr.readings()[1].aux - 25.0;
        assert!((a_tau / final_ - (1.0 - (-1.0f64).exp())).abs() < 0.01, "{}", a_tau / final_);
    }

    #[test]
    fn el_ntc_sin_resistencia_en_serie_se_desboca_hasta_tmax_y_se_quema_con_evento() {
        // 24 V sobre 100 Ω a 25 °C: 5.8 W contra 10 mW/K, la temperatura sube y la resistencia baja hasta quemarlo.
        let mut tr = red(24.0, 25.0, NTC_100);
        tr.advance_to(30.0, u32::MAX).unwrap();
        let ev = tr.take_events();
        assert_eq!(ev.len(), 1, "{ev:?}");
        assert_eq!(ev[0].element, 1);
        assert!(ev[0].seconds > 0.0 && ev[0].amps > 0.2, "{:?}", ev[0]);
        let r = tr.readings()[1];
        assert_eq!(r.estado, 1.0);
        assert!(r.i.abs() < 1e-6, "i = {}", r.i);
        // Con una fuente que no lo calienta tanto aguanta.
        let mut tr = red(1.0, 25.0, NTC_100);
        tr.advance_to(30.0, u32::MAX).unwrap();
        assert!(tr.take_events().is_empty());
        assert_eq!(tr.readings()[1].estado, 0.0);
    }

    #[test]
    fn un_termistor_repuesto_vuelve_a_conducir() {
        let mut tr = red(24.0, 25.0, NTC_100);
        tr.advance_to(30.0, u32::MAX).unwrap();
        assert_eq!(tr.readings()[1].estado, 1.0);
        tr.set_element(0, crate::Element::V { a: 1, b: 0, wave: crate::Wave::Dc { v: 1.0 } }).unwrap();
        tr.reset_element(1).unwrap();
        tr.advance_to(90.0, u32::MAX).unwrap();
        let r = tr.readings()[1];
        assert_eq!(r.estado, 0.0);
        assert!(r.i > 0.005, "i = {}", r.i);
    }

    #[test]
    fn el_ptc_por_tramos_se_autolimita_en_la_rampa() {
        // Meseta de 100 Ω hasta 80 °C, sube 2 décadas hasta 120 °C y 2 más hasta 200 °C.
        let ptc = r#"{"type":"TERM","a":1,"b":0,"tipo":"ptc","r25":100,"beta":3000,"rt":[[0,100],[80,100],[120,10000],[200,1000000]],"delta":0.01,"tau":2,"canal":0,"tmax":250}"#;
        // Sin autocalentamiento: 100 °C está a media rampa, a 1 kΩ.
        let mut tr = red(1e-4, 100.0, ptc);
        tr.advance_to(1e-3, u32::MAX).unwrap();
        assert!((1e-4 / tr.readings()[1].i - 1000.0).abs() < 1e-6);
        // Con 12 V: 1.44 W en frío contra 10 mW/K; se asienta en la rampa donde P = delta θ.
        let mut tr = red(12.0, 25.0, ptc);
        tr.advance_to(60.0, u32::MAX).unwrap();
        let r = tr.readings()[1];
        let th = r.aux - 25.0;
        assert!(r.aux > 80.0 && r.aux < 200.0, "temperatura {}", r.aux);
        assert!((th * 0.01 - 12.0 * r.i).abs() / (12.0 * r.i) < 1e-4, "θ δ = {} contra P = {}", th * 0.01, 12.0 * r.i);
        assert!(tr.take_events().is_empty());
    }

    #[test]
    fn el_ptc_por_beta_sube_con_la_temperatura() {
        let ptc = r#"{"type":"TERM","a":1,"b":0,"tipo":"ptc","r25":100,"beta":3000,"delta":0.01,"tau":2,"canal":0,"tmax":250}"#;
        let medir = |t: f64| {
            let mut tr = red(1e-4, t, ptc);
            tr.advance_to(1e-3, u32::MAX).unwrap();
            1e-4 / tr.readings()[1].i
        };
        let (frio, caliente) = (medir(25.0), medir(100.0));
        assert!((frio - 100.0).abs() < 1e-6 && caliente > frio, "{frio} {caliente}");
        let esperado = 100.0 * (-3000.0f64 * (1.0 / 373.15 - 1.0 / 298.15)).exp();
        assert!((caliente - esperado).abs() / esperado < 1e-9);
    }

    #[test]
    fn el_ambiente_del_canal_mueve_la_resistencia_en_marcha() {
        let mut tr = red(1e-4, 25.0, NTC_10K);
        tr.advance_to(1e-3, u32::MAX).unwrap();
        tr.poner_valor(0, 1.0, 60.0).unwrap();
        tr.advance_to(2.0, u32::MAX).unwrap();
        let esperado = 10000.0 * (3977.0f64 * (1.0 / 333.15 - 1.0 / 298.15)).exp();
        let medido = 1e-4 / tr.readings()[1].i;
        assert!((medido - esperado).abs() / esperado < 1e-9, "{medido} contra {esperado}");
    }
}
