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
}

impl Capacitor {
    pub fn new(a: usize, b: usize, farads: f64) -> Self {
        Self { a, b, farads, ua: None, ub: None, q: 0 }
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
            c.s0[q] = self.farads * (volt(c.x, self.ua) - volt(c.x, self.ub));
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
}

impl Inductor {
    pub fn new(a: usize, b: usize, henries: f64) -> Self {
        Self { a, b, henries, ua: None, ub: None, br: 0, flux: 0 }
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
            c.s0[f] = self.henries * c.x[self.br];
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

/// Fuente de corriente: `amps` circulan de `a` hacia `b` por dentro de ella.
#[derive(Clone)]
pub struct ISource {
    a: usize,
    b: usize,
    amps: f64,
    ua: U,
    ub: U,
}

impl ISource {
    pub fn new(a: usize, b: usize, amps: f64) -> Self {
        Self { a, b, amps, ua: None, ub: None }
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
        stamp_i(c.rhs, self.ua, self.ub, c.src * self.amps);
        false
    }
    fn linear(&self) -> bool {
        true
    }
    fn reading(&self, _x: &[f64], _s0: &[f64]) -> Reading {
        Reading { i: self.amps, ..Reading::default() }
    }
    fn tiene_dinamica(&self) -> bool {
        false
    }
    fn set(&mut self, e: &Element) -> bool {
        match *e {
            Element::I { a, b, amps } if a == self.a && b == self.b => {
                self.amps = amps;
                true
            }
            _ => false,
        }
    }
}
