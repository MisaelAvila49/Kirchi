//! Elementos lineales: resistencia, capacitor, inductor y fuentes independientes (resload.c, capload.c,
//! indload.c, vsrcload.c e isrcload.c de ngspice).

use super::{init_charge, init_current, integrate, stamp_g, stamp_i, terr, volt, Alloc, Ctx, Device, Hist, Mode, Reading, U};
use crate::netlist::{Element, Wave};

#[derive(Clone)]
pub struct Resistor {
    a: usize,
    b: usize,
    ohms: f64,
    ua: U,
    ub: U,
}

impl Resistor {
    pub fn new(a: usize, b: usize, ohms: f64) -> Self {
        Self { a, b, ohms, ua: None, ub: None }
    }
}

impl Device for Resistor {
    fn sin_estado_propio(&self) -> bool {
        true
    }
    /// No redefine `accept`: el motor no se lo pide.
    fn usa_accept(&self) -> bool {
        false
    }
    fn bind(&mut self, a: &mut Alloc) {
        self.ua = a.ext(self.a);
        self.ub = a.ext(self.b);
    }
    fn load(&mut self, c: &mut Ctx) -> bool {
        stamp_g(c.m, self.ua, self.ub, 1.0 / self.ohms);
        false
    }
    fn linear(&self) -> bool {
        true
    }
    fn tiene_dinamica(&self) -> bool {
        false
    }
    fn estampa_fija(&self) -> bool {
        true
    }
    fn reading(&self, x: &[f64], _s0: &[f64]) -> Reading {
        Reading { i: (volt(x, self.ua) - volt(x, self.ub)) / self.ohms, ..Reading::default() }
    }
    fn set(&mut self, e: &Element) -> bool {
        match *e {
            Element::R { a, b, ohms } if a == self.a && b == self.b => {
                self.ohms = ohms;
                true
            }
            _ => false,
        }
    }
}

#[derive(Clone)]
pub struct Capacitor {
    a: usize,
    b: usize,
    farads: f64,
    ua: U,
    ub: U,
    q: usize,
    /// Voltaje inicial de `a` a `b`.
    ic: Option<f64>,
}

impl Capacitor {
    pub fn new(a: usize, b: usize, farads: f64, ic: Option<f64>) -> Self {
        Self { a, b, farads, ua: None, ub: None, q: 0, ic }
    }
}

impl Device for Capacitor {
    /// No redefine `accept`: el motor no se lo pide.
    fn usa_accept(&self) -> bool {
        false
    }
    fn bind(&mut self, a: &mut Alloc) {
        self.ua = a.ext(self.a);
        self.ub = a.ext(self.b);
        self.q = a.states(2);
    }
    fn load(&mut self, c: &mut Ctx) -> bool {
        let q = self.q;
        if c.mode == Mode::Pred {
            c.s0[q] = c.s1[q];
        } else {
            // Con `ic`, el instante 0 trae esa carga (`uic` de ngspice); las demás iteraciones leen el voltaje.
            let v = match self.ic {
                Some(ic) if c.mode == Mode::InitTran => ic,
                _ => volt(c.x, self.ua) - volt(c.x, self.ub),
            };
            c.s0[q] = self.farads * v;
            init_charge(c, q);
        }
        let (geq, ceq) = integrate(c, self.farads, q);
        init_current(c, q);
        stamp_g(c.m, self.ua, self.ub, geq);
        stamp_i(c.rhs, self.ua, self.ub, ceq);
        false
    }
    fn trunc(&self, h: &Hist, dt: &mut f64) {
        terr(h, self.q, dt);
    }
    fn linear(&self) -> bool {
        true
    }
    fn reading(&self, _x: &[f64], s0: &[f64]) -> Reading {
        Reading { i: s0[self.q + 1], ..Reading::default() }
    }
}

/// Inductor con su corriente como incógnita de rama: V(a) - V(b) = d(L i)/dt.
#[derive(Clone)]
pub struct Inductor {
    a: usize,
    b: usize,
    henries: f64,
    ua: U,
    ub: U,
    br: usize,
    flux: usize,
    /// Corriente inicial de `a` a `b`.
    ic: Option<f64>,
}

impl Inductor {
    pub fn new(a: usize, b: usize, henries: f64, ic: Option<f64>) -> Self {
        Self { a, b, henries, ua: None, ub: None, br: 0, flux: 0, ic }
    }
}

impl Device for Inductor {
    /// No redefine `accept`: el motor no se lo pide.
    fn usa_accept(&self) -> bool {
        false
    }
    fn bind(&mut self, a: &mut Alloc) {
        self.ua = a.ext(self.a);
        self.ub = a.ext(self.b);
        self.br = a.branch();
        self.flux = a.states(2);
    }
    fn load(&mut self, c: &mut Ctx) -> bool {
        let f = self.flux;
        if c.mode == Mode::Pred {
            c.s0[f] = c.s1[f];
        } else {
            let i = match self.ic {
                Some(ic) if c.mode == Mode::InitTran => ic,
                _ => c.x[self.br],
            };
            c.s0[f] = self.henries * i;
            init_charge(c, f);
        }
        let (req, veq) = integrate(c, self.henries, f);
        init_current(c, f);
        let br = Some(self.br);
        super::entry(c.m, self.ua, br, 1.0);
        super::entry(c.m, self.ub, br, -1.0);
        super::entry(c.m, br, self.ua, 1.0);
        super::entry(c.m, br, self.ub, -1.0);
        super::entry(c.m, br, br, -req);
        c.rhs[self.br] += veq;
        false
    }
    fn trunc(&self, h: &Hist, dt: &mut f64) {
        terr(h, self.flux, dt);
    }
    fn linear(&self) -> bool {
        true
    }
    fn reading(&self, x: &[f64], _s0: &[f64]) -> Reading {
        Reading { i: x[self.br], ..Reading::default() }
    }
}

/// Fuente de voltaje con `a` positivo; su corriente de rama (de `a` hacia `b` por dentro de ella) es una incógnita.
#[derive(Clone)]
pub struct VSource {
    a: usize,
    b: usize,
    wave: Wave,
    ua: U,
    ub: U,
    br: usize,
}

impl VSource {
    pub fn new(a: usize, b: usize, wave: Wave) -> Self {
        Self { a, b, wave, ua: None, ub: None, br: 0 }
    }
}

impl Device for VSource {
    /// No redefine `accept`: el motor no se lo pide.
    fn usa_accept(&self) -> bool {
        false
    }
    fn bind(&mut self, a: &mut Alloc) {
        self.ua = a.ext(self.a);
        self.ub = a.ext(self.b);
        self.br = a.branch();
    }
    fn load(&mut self, c: &mut Ctx) -> bool {
        let br = Some(self.br);
        super::entry(c.m, self.ua, br, 1.0);
        super::entry(c.m, self.ub, br, -1.0);
        super::entry(c.m, br, self.ua, 1.0);
        super::entry(c.m, br, self.ub, -1.0);
        c.rhs[self.br] += c.src * self.wave.during(c.t, c.h);
        false
    }
    fn linear(&self) -> bool {
        true
    }
    fn reading(&self, x: &[f64], _s0: &[f64]) -> Reading {
        Reading { i: x[self.br], ..Reading::default() }
    }
    fn next_break(&self, t: f64) -> f64 {
        self.wave.next_edge(t)
    }
    fn tiene_quiebres(&self) -> bool {
        true
    }
    fn tiene_dinamica(&self) -> bool {
        !matches!(self.wave, Wave::Dc { .. })
    }
    fn set(&mut self, e: &Element) -> bool {
        self.set_en(e, 0.0)
    }
    /// Una onda nueva con `continua` sigue desde el punto del ciclo en que iba la anterior en `t`.
    fn set_en(&mut self, e: &Element, t: f64) -> bool {
        match e {
            Element::V { a, b, wave } if *a == self.a && *b == self.b => {
                let mut w = wave.clone();
                if w.continua() {
                    if let (Some(u), Some(f)) = (self.wave.ciclo(t), w.frecuencia()) {
                        w.con_fase((u - f * t).rem_euclid(1.0));
                    }
                }
                self.wave = w;
                true
            }
            _ => false,
        }
    }
}

/// Fuente de corriente: `amps` (o su onda) circulan de `a` hacia `b` por dentro de ella.
#[derive(Clone)]
pub struct ISource {
    a: usize,
    b: usize,
    amps: f64,
    wave: Option<Wave>,
    /// Lo que entregó en la última carga, para la lectura.
    ultima: f64,
    ua: U,
    ub: U,
}

impl ISource {
    pub fn new(a: usize, b: usize, amps: f64, wave: Option<Wave>) -> Self {
        Self { a, b, amps, ultima: amps, wave, ua: None, ub: None }
    }
}

impl Device for ISource {
    /// No redefine `accept`: el motor no se lo pide.
    fn usa_accept(&self) -> bool {
        false
    }
    fn bind(&mut self, a: &mut Alloc) {
        self.ua = a.ext(self.a);
        self.ub = a.ext(self.b);
    }
    fn load(&mut self, c: &mut Ctx) -> bool {
        let i = self.wave.as_ref().map_or(self.amps, |w| w.during(c.t, c.h));
        self.ultima = i;
        stamp_i(c.rhs, self.ua, self.ub, c.src * i);
        false
    }
    fn linear(&self) -> bool {
        true
    }
    fn reading(&self, _x: &[f64], _s0: &[f64]) -> Reading {
        Reading { i: self.ultima, ..Reading::default() }
    }
    fn next_break(&self, t: f64) -> f64 {
        self.wave.as_ref().map_or(f64::INFINITY, |w| w.next_edge(t))
    }
    fn tiene_quiebres(&self) -> bool {
        self.wave.is_some()
    }
    fn tiene_dinamica(&self) -> bool {
        self.wave.as_ref().is_some_and(|w| !matches!(w, Wave::Dc { .. }))
    }
    fn set(&mut self, e: &Element) -> bool {
        self.set_en(e, 0.0)
    }
    /// Una onda nueva con `continua` sigue desde el punto del ciclo en que iba la anterior en `t`.
    fn set_en(&mut self, e: &Element, t: f64) -> bool {
        match e {
            Element::I { a, b, amps, wave } if *a == self.a && *b == self.b => {
                let mut w = wave.clone();
                if let Some(w) = w.as_mut().filter(|w| w.continua()) {
                    if let (Some(u), Some(f)) = (self.wave.as_ref().and_then(|v| v.ciclo(t)), w.frecuencia()) {
                        w.con_fase((u - f * t).rem_euclid(1.0));
                    }
                }
                self.amps = *amps;
                self.wave = w;
                self.ultima = *amps;
                true
            }
            _ => false,
        }
    }
}

#[cfg(test)]
mod tests_pwl {
    use crate::netlist::Wave;
    use crate::{Netlist, Transient};

    fn pwl(puntos: &[[f64; 2]], repetir: bool) -> Wave {
        Wave::Pwl { puntos: puntos.to_vec(), repetir }
    }

    #[test]
    fn pwl_vale_lo_esperado_en_esquinas_y_a_mitad_de_tramo() {
        let w = pwl(&[[0.0, 0.0], [1e-3, 5.0], [3e-3, 1.0]], false);
        assert_eq!(w.at(0.0), 0.0);
        assert!((w.at(0.5e-3) - 2.5).abs() < 1e-12);
        assert_eq!(w.at(1e-3), 5.0);
        assert!((w.at(2e-3) - 3.0).abs() < 1e-12);
        assert_eq!(w.at(3e-3), 1.0);
        // Pasado el último punto se queda en su valor.
        assert_eq!(w.at(1.0), 1.0);
    }

    #[test]
    fn pwl_tiene_un_quiebre_en_cada_esquina_y_ninguno_despues() {
        let w = pwl(&[[0.0, 0.0], [1e-3, 5.0], [3e-3, 1.0]], false);
        assert_eq!(w.next_edge(0.0), 1e-3);
        assert_eq!(w.next_edge(1e-3), 3e-3);
        assert_eq!(w.next_edge(0.5e-3), 1e-3);
        assert_eq!(w.next_edge(3e-3), f64::INFINITY);
    }

    #[test]
    fn pwl_repite_con_el_ultimo_tiempo_como_periodo() {
        let w = pwl(&[[0.0, 0.0], [1e-3, 5.0], [2e-3, 0.0]], true);
        assert!((w.at(2.5e-3) - 2.5).abs() < 1e-9);
        assert!((w.at(7.5e-3) - 2.5).abs() < 1e-9);
        assert!((w.next_edge(2e-3) - 3e-3).abs() < 1e-12);
        assert!((w.next_edge(5.5e-3) - 6e-3).abs() < 1e-12);
        // Con un salto al cerrar el periodo, el paso que termina en él todavía lee el final del último tramo.
        let salto = pwl(&[[0.0, 0.0], [1e-3, 4.0]], true);
        assert_eq!(salto.during(1e-3, 1e-4), 4.0);
        assert!((salto.during(1.5e-3, 1e-4) - 2.0).abs() < 1e-9);
    }

    #[test]
    fn pwl_de_un_solo_punto_es_constante() {
        for repetir in [false, true] {
            let w = pwl(&[[0.0, 3.3]], repetir);
            assert_eq!(w.at(0.0), 3.3);
            assert_eq!(w.at(5.0), 3.3);
            assert_eq!(w.next_edge(0.0), f64::INFINITY);
        }
    }

    #[test]
    fn una_fuente_pwl_alimenta_el_circuito_con_sus_esquinas_exactas() {
        let mut tr = Transient::new(Netlist::from_json(r#"{"nodes":2,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"pwl","puntos":[[0,0],[1e-3,5],[2e-3,5],[3e-3,0]]}},
            {"type":"R","a":1,"b":0,"ohms":1000}]}"#).unwrap(), 1e-3).unwrap();
        tr.advance_to(0.5e-3, u32::MAX).unwrap();
        assert!((tr.voltage(1) - 2.5).abs() < 1e-9, "{}", tr.voltage(1));
        tr.advance_to(1.5e-3, u32::MAX).unwrap();
        assert!((tr.voltage(1) - 5.0).abs() < 1e-9);
        tr.advance_to(2.5e-3, u32::MAX).unwrap();
        assert!((tr.voltage(1) - 2.5).abs() < 1e-9, "{}", tr.voltage(1));
    }
}
