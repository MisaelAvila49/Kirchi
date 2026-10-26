//! Foco incandescente: R(θ) = rfrio (1 + k θ) con tau dθ/dt = v² / (R(θ) pnom) − θ, donde θ va de 0 (frío) a 1 (potencia nominal) y es un nodo interno con 1 Ω y un capacitor de `tau` faradios. Con k = 9 la corriente al encender es diez veces la nominal.
//! Son las ecuaciones de `foco_encendido.cir`, con θ acotado en cero. Si llega a `THETA_FUNDE` el filamento se funde y queda abierto hasta que se repone.

use super::{close, entry, init_charge, init_current, inject, integrate, stamp_g, terr, volt, Alloc, Ctx, Device, Event, Hist, Mode, Reading, Tol, U};
use crate::devices::fuse::R_ABIERTO;

/// Calentamiento (relativo a la potencia nominal) al que el filamento se funde: el doble de la potencia nominal. Un foco de
/// 12 V a 24 V se asienta en 2.07 y se funde; a 16 V se asienta en 1.36 y aguanta.
pub const THETA_FUNDE: f64 = 2.0;
/// Calentamiento a partir del cual se cuenta la sobrecarga que se avisa en el evento.
const THETA_SOBRECARGA: f64 = 1.05;

#[derive(Clone)]
pub struct Lamp {
    idx: usize,
    a: usize,
    b: usize,
    rfrio: f64,
    k: f64,
    pnom: f64,
    tau: f64,
    ua: U,
    ub: U,
    th: usize,
    st: usize,
    fundido: bool,
    /// Desde cuándo el calentamiento pasa del nominal.
    desde: Option<f64>,
    /// Si estaba fundido al resolver el último paso. La lectura (y las corrientes por terminal) son las de la solución
    /// del paso aunque al aceptarlo se haya fundido, como el fusible y el relé.
    fundido_paso: bool,
}

// Casillas de estado: carga térmica y su corriente; corriente y potencia de la última iteración.
const QT: usize = 0;
const IL: usize = 2;
const IP: usize = 3;

impl Lamp {
    pub fn new(idx: usize, a: usize, b: usize, rfrio: f64, k: f64, pnom: f64, tau: f64) -> Self {
        Self { idx, a, b, rfrio, k, pnom, tau, ua: None, ub: None, th: 0, st: 0, fundido: false, desde: None, fundido_paso: false }
    }

    /// Resistencia con el calentamiento `t` (nunca negativo); fundido, la de un circuito abierto.
    fn resistance(&self, t: f64) -> f64 {
        if self.fundido { R_ABIERTO } else { self.rfrio * (1.0 + self.k * t.max(0.0)) }
    }

    /// Corriente del filamento y potencia relativa (lo que calienta) con el voltaje `v` y el calentamiento `t`.
    fn values(&self, v: f64, t: f64) -> (f64, f64) {
        let r = self.resistance(t);
        (v / r, if self.fundido { 0.0 } else { v * v / (r * self.pnom) })
    }
}

impl Device for Lamp {
    fn bind(&mut self, a: &mut Alloc) {
        self.ua = a.ext(self.a);
        self.ub = a.ext(self.b);
        self.th = a.node();
        self.st = a.states(4);
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        self.fundido_paso = self.fundido;
        let s = self.st;
        let th = Some(self.th);
        let v = volt(c.x, self.ua) - volt(c.x, self.ub);
        let t = c.x[self.th];
        let r = self.resistance(t);
        let (il, ip) = self.values(v, t);
        // Derivadas respecto del voltaje y del calentamiento (sin dependencia de θ si es negativo o si está fundido).
        let dr = if self.fundido || t < 0.0 { 0.0 } else { self.k * self.rfrio };
        let (gv, gt) = (1.0 / r, -v * dr / (r * r));
        let (pv, pt) = if self.fundido { (0.0, 0.0) } else { (2.0 * v / (r * self.pnom), -v * v * dr / (r * r * self.pnom)) };
        // Corriente del filamento de a hacia b.
        stamp_g(c.m, self.ua, self.ub, gv);
        entry(c.m, self.ua, th, gt);
        entry(c.m, self.ub, th, -gt);
        let ieq = il - gv * v - gt * t;
        inject(c.rhs, self.ua, -ieq);
        inject(c.rhs, self.ub, ieq);
        // Calentamiento: potencia hacia el nodo térmico, 1 Ω y la inercia a tierra.
        entry(c.m, th, self.ua, -pv);
        entry(c.m, th, self.ub, pv);
        entry(c.m, th, th, 1.0 - pt);
        inject(c.rhs, th, ip - pv * v - pt * t);
        if c.mode == Mode::Pred {
            c.s0[s + QT] = c.s1[s + QT];
        } else {
            c.s0[s + QT] = self.tau * t;
            init_charge(c, s + QT);
        }
        let (geq, ceq) = integrate(c, self.tau, s + QT);
        init_current(c, s + QT);
        stamp_g(c.m, th, None, geq);
        inject(c.rhs, th, -ceq);
        c.s0[s + IL] = il;
        c.s0[s + IP] = ip;
        false
    }

    fn converged(&self, x: &[f64], s0: &[f64], tol: &Tol) -> bool {
        let (il, ip) = self.values(volt(x, self.ua) - volt(x, self.ub), x[self.th]);
        close(il, s0[self.st + IL], tol) && close(ip, s0[self.st + IP], tol)
    }

    fn trunc(&self, h: &Hist, dt: &mut f64) {
        terr(h, self.st + QT, dt);
    }

    /// Tras cada paso aceptado: si el calentamiento llega al límite, el filamento se funde y se abre.
    fn accept(&mut self, x: &[f64], _s0: &[f64], t: f64, h: f64, ev: &mut Vec<Event>) -> bool {
        let th = x[self.th];
        if self.fundido {
            return false;
        }
        if th > THETA_SOBRECARGA {
            self.desde.get_or_insert(t - h);
        } else {
            self.desde = None;
        }
        if th >= THETA_FUNDE {
            self.fundido = true;
            let i = (volt(x, self.ua) - volt(x, self.ub)) / self.resistance(th);
            ev.push(Event { element: self.idx, t, amps: i.abs(), seconds: t - self.desde.unwrap_or(t - h) });
            return true;
        }
        false
    }

    fn reset(&mut self) -> bool {
        self.fundido = false;
        self.desde = None;
        true
    }

    /// Corriente; en `aux`, el calentamiento; en `estado`, 1 si el filamento se fundió.
    fn reading(&self, x: &[f64], _s0: &[f64]) -> Reading {
        let t = x[self.th];
        let v = volt(x, self.ua) - volt(x, self.ub);
        let i = if self.fundido_paso { v / R_ABIERTO } else { v / (self.rfrio * (1.0 + self.k * t.max(0.0))) };
        Reading { i, aux: t, estado: if self.fundido { 1.0 } else { 0.0 } }
    }
}

#[cfg(test)]
mod tests {
    use crate::{Netlist, Transient};

    #[test]
    fn el_foco_arranca_con_diez_veces_la_corriente_y_se_asienta_en_la_nominal() {
        // 12 V y 5 W: caliente 28.8 Ω (417 mA), frío 2.88 Ω.
        let mut tr = Transient::new(Netlist::from_json(r#"{"nodes":2,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":12}},
            {"type":"LAMP","a":1,"b":0,"rfrio":2.88,"k":9,"pnom":5,"tau":0.05}]}"#).unwrap(), 1e-4).unwrap();
        tr.advance_to(1e-4, u32::MAX).unwrap();
        let arranque = tr.readings()[1].i;
        assert!(arranque > 3.5 && arranque < 4.2, "arranque {arranque}");
        tr.advance_to(1.0, u32::MAX).unwrap();
        let r = tr.readings()[1];
        assert!((r.i - 5.0 / 12.0).abs() < 1e-3, "corriente {}", r.i);
        assert!((r.aux - 1.0).abs() < 1e-3, "calentamiento {}", r.aux);
    }

    const FOCO_12V: &str = r#"{"nodes":2,"elements":[
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":VOLTS}},
        {"type":"LAMP","a":1,"b":0,"rfrio":2.88,"k":9,"pnom":5,"tau":0.05}]}"#;

    #[test]
    fn al_doble_del_voltaje_nominal_el_filamento_se_funde_y_avisa() {
        // 24 V sobre un foco de 12 V y 5 W: el calentamiento se asienta en 2.07, sobre el límite de 2.
        let mut tr = Transient::new(Netlist::from_json(&FOCO_12V.replace("VOLTS", "24")).unwrap(), 1e-3).unwrap();
        tr.advance_to(2.0, u32::MAX).unwrap();
        let ev = tr.take_events();
        assert_eq!(ev.len(), 1, "{ev:?}");
        assert_eq!(ev[0].element, 1);
        let r = tr.readings()[1];
        assert_eq!(r.estado, 1.0);
        assert!(r.i.abs() < 1e-6, "i = {}", r.i);
        // Y con 16 V (1.33 veces) aguanta.
        let mut tr = Transient::new(Netlist::from_json(&FOCO_12V.replace("VOLTS", "16")).unwrap(), 1e-3).unwrap();
        tr.advance_to(2.0, u32::MAX).unwrap();
        assert!(tr.take_events().is_empty());
        assert_eq!(tr.readings()[1].estado, 0.0);
        // Repuesto, vuelve a encender.
        let mut tr = Transient::new(Netlist::from_json(&FOCO_12V.replace("VOLTS", "24")).unwrap(), 1e-3).unwrap();
        tr.advance_to(2.0, u32::MAX).unwrap();
        tr.set_element(0, crate::Element::V { a: 1, b: 0, wave: crate::Wave::Dc { v: 12.0 } }).unwrap();
        tr.reset_element(1).unwrap();
        tr.advance_to(4.0, u32::MAX).unwrap();
        assert_eq!(tr.readings()[1].estado, 0.0);
        assert!((tr.readings()[1].i - 5.0 / 12.0).abs() < 1e-3);
    }

    #[test]
    fn alimentado_con_corriente_el_filamento_nunca_tiene_resistencia_negativa_ni_se_desboca() {
        // Casos límite: k = 1000 con tau = 1 µs, y k = 9 con 1 A (la resistencia crece con la potencia y la potencia
        // con la resistencia). El filamento debe fundirse, sin θ negativa ni matriz singular.
        for (k, tau, amps) in [("1000", "1e-6", "1"), ("9", "0.05", "1")] {
            let json = format!(r#"{{"nodes":2,"elements":[
                {{"type":"I","a":0,"b":1,"amps":{amps}}},
                {{"type":"LAMP","a":1,"b":0,"rfrio":1,"k":{k},"pnom":5,"tau":{tau}}}]}}"#);
            let mut tr = Transient::new(Netlist::from_json(&json).unwrap(), 1e-4).unwrap();
            tr.advance_to(2.0, u32::MAX).unwrap();
            let r = tr.readings()[1];
            assert!(r.aux >= -1e-9, "θ = {}", r.aux);
            assert!(r.i.is_finite() && tr.voltage(1).is_finite());
            assert_eq!(tr.take_events().len(), 1, "k = {k}");
        }
    }
}
