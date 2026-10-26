//! Motor de CD de imán permanente: V(a) − V(b) = r i + l di/dt + ke ω y j dω/dt + bm ω = ke i, con la corriente como incógnita de rama y la velocidad (rad/s) como nodo interno.
//! Es lineal, como `motor_arranque.cir` de las referencias.

use super::{entry, init_charge, init_current, inject, integrate, stamp_g, terr, Alloc, Ctx, Device, Hist, Mode, Reading, U};

#[derive(Clone)]
pub struct Motor {
    a: usize,
    b: usize,
    r: f64,
    l: f64,
    ke: f64,
    j: f64,
    bm: f64,
    ua: U,
    ub: U,
    br: usize,
    w: usize,
    st: usize,
}

// Casillas de estado: flujo de la bobina y su voltaje; momento angular y su par.
const FLUJO: usize = 0;
const QW: usize = 2;

impl Motor {
    pub fn new(a: usize, b: usize, r: f64, l: f64, ke: f64, j: f64, bm: f64) -> Self {
        Self { a, b, r, l, ke, j, bm, ua: None, ub: None, br: 0, w: 0, st: 0 }
    }
}

impl Device for Motor {
    /// No redefine `accept`: el motor no se lo pide.
    fn usa_accept(&self) -> bool {
        false
    }
    fn bind(&mut self, a: &mut Alloc) {
        self.ua = a.ext(self.a);
        self.ub = a.ext(self.b);
        self.br = a.branch();
        self.w = a.node();
        self.st = a.states(4);
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        let s = self.st;
        let (br, w) = (Some(self.br), Some(self.w));
        // Bobina: la ecuación de rama con la resistencia, el inductor integrado y la fuerza contraelectromotriz.
        if c.mode == Mode::Pred {
            c.s0[s + FLUJO] = c.s1[s + FLUJO];
            c.s0[s + QW] = c.s1[s + QW];
        } else {
            c.s0[s + FLUJO] = self.l * c.x[self.br];
            c.s0[s + QW] = self.j * c.x[self.w];
            init_charge(c, s + FLUJO);
            init_charge(c, s + QW);
        }
        let (req, veq) = integrate(c, self.l, s + FLUJO);
        let (geq, ceq) = integrate(c, self.j, s + QW);
        init_current(c, s + FLUJO);
        init_current(c, s + QW);
        entry(c.m, self.ua, br, 1.0);
        entry(c.m, self.ub, br, -1.0);
        entry(c.m, br, self.ua, 1.0);
        entry(c.m, br, self.ub, -1.0);
        entry(c.m, br, br, -(self.r + req));
        entry(c.m, br, w, -self.ke);
        c.rhs[self.br] += veq;
        // Eje: inercia, fricción y el par de la corriente.
        stamp_g(c.m, w, None, geq + self.bm);
        entry(c.m, w, br, -self.ke);
        inject(c.rhs, w, -ceq);
        false
    }

    fn trunc(&self, h: &Hist, dt: &mut f64) {
        terr(h, self.st + FLUJO, dt);
        terr(h, self.st + QW, dt);
    }

    fn linear(&self) -> bool {
        true
    }

    /// Corriente de la bobina y velocidad del eje en rad/s.
    fn reading(&self, x: &[f64], _s0: &[f64]) -> Reading {
        Reading { i: x[self.br], aux: x[self.w], estado: 0.0 }
    }
}

#[cfg(test)]
mod tests {
    use crate::{Netlist, Transient};

    #[test]
    fn el_motor_de_6_v_llega_a_su_velocidad_sin_carga() {
        // En régimen: i = bm ω / ke y 6 = r i + ke ω, con r = 3, ke = 6.05e-3 y bm = 6.4e-7.
        let mut tr = Transient::new(Netlist::from_json(r#"{"nodes":2,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":6}},
            {"type":"MOTOR","a":1,"b":0,"r":3,"l":1.5e-3,"ke":6.05e-3,"j":2.4e-7,"bm":6.4e-7}]}"#).unwrap(), 1e-4).unwrap();
        tr.advance_to(1e-3, u32::MAX).unwrap();
        // Al arrancar casi no gira: a 1 ms la corriente sigue cerca de 6 V / 3 Ω = 2 A.
        assert!(tr.readings()[1].i > 1.6, "arranque {}", tr.readings()[1].i);
        tr.advance_to(0.5, u32::MAX).unwrap();
        let (ke, bm, r) = (6.05e-3, 6.4e-7, 3.0);
        let w = 6.0 / (ke + r * bm / ke);
        let m = tr.readings()[1];
        assert!((m.aux - w).abs() / w < 1e-3, "ω = {} contra {w}", m.aux);
        assert!((m.i - bm * w / ke).abs() < 1e-5, "i = {}", m.i);
    }
}
