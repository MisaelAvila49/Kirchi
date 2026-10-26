//! Dos inductores acoplados (transformador), como `K1 L1 L2 k` de ngspice. Cada devanado tiene su corriente como incógnita y su flujo φ1 = L1 i1 + M i2, φ2 = M i1 + L2 i2 con M = k √(L1 L2).
//! La estampa es la del inductor con un término cruzado `-ag0 M` en la columna de la otra rama. El punto de cada devanado es su primer terminal.

use super::{entry, init_charge, init_current, integrate, terr, Alloc, Ctx, Device, Hist, Mode, Reading, U};

#[derive(Clone)]
pub struct Acople {
    a1: usize,
    b1: usize,
    a2: usize,
    b2: usize,
    l1: f64,
    l2: f64,
    m: f64,
    ua1: U,
    ub1: U,
    ua2: U,
    ub2: U,
    br1: usize,
    br2: usize,
    f1: usize,
    f2: usize,
}

impl Acople {
    pub fn new(a1: usize, b1: usize, a2: usize, b2: usize, l1: f64, l2: f64, k: f64) -> Self {
        Self { a1, b1, a2, b2, l1, l2, m: k * (l1 * l2).sqrt(), ua1: None, ub1: None, ua2: None, ub2: None, br1: 0, br2: 0, f1: 0, f2: 0 }
    }
}

impl Device for Acople {
    /// No redefine `accept`: el motor no se lo pide.
    fn usa_accept(&self) -> bool {
        false
    }

    fn bind(&mut self, a: &mut Alloc) {
        self.ua1 = a.ext(self.a1);
        self.ub1 = a.ext(self.b1);
        self.ua2 = a.ext(self.a2);
        self.ub2 = a.ext(self.b2);
        self.br1 = a.branch();
        self.br2 = a.branch();
        self.f1 = a.states(2);
        self.f2 = a.states(2);
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        let (f1, f2) = (self.f1, self.f2);
        if c.mode == Mode::Pred {
            c.s0[f1] = c.s1[f1];
            c.s0[f2] = c.s1[f2];
        } else {
            let (i1, i2) = (c.x[self.br1], c.x[self.br2]);
            c.s0[f1] = self.l1 * i1 + self.m * i2;
            c.s0[f2] = self.m * i1 + self.l2 * i2;
            init_charge(c, f1);
            init_charge(c, f2);
        }
        let (r1, v1) = integrate(c, self.l1, f1);
        let (r2, v2) = integrate(c, self.l2, f2);
        init_current(c, f1);
        init_current(c, f2);
        let rm = c.ag0 * self.m;
        let (b1, b2) = (Some(self.br1), Some(self.br2));
        entry(c.m, self.ua1, b1, 1.0);
        entry(c.m, self.ub1, b1, -1.0);
        entry(c.m, b1, self.ua1, 1.0);
        entry(c.m, b1, self.ub1, -1.0);
        entry(c.m, b1, b1, -r1);
        entry(c.m, b1, b2, -rm);
        c.rhs[self.br1] += v1;
        entry(c.m, self.ua2, b2, 1.0);
        entry(c.m, self.ub2, b2, -1.0);
        entry(c.m, b2, self.ua2, 1.0);
        entry(c.m, b2, self.ub2, -1.0);
        entry(c.m, b2, b2, -r2);
        entry(c.m, b2, b1, -rm);
        c.rhs[self.br2] += v2;
        false
    }

    fn trunc(&self, h: &Hist, dt: &mut f64) {
        terr(h, self.f1, dt);
        terr(h, self.f2, dt);
    }

    fn linear(&self) -> bool {
        true
    }

    /// Corriente del primario (de `a1` a `b1`); en `aux`, la del secundario (de `a2` a `b2`).
    fn reading(&self, x: &[f64], _s0: &[f64]) -> Reading {
        Reading { i: x[self.br1], aux: x[self.br2], ..Reading::default() }
    }

    /// Cada devanado entra por su punto y sale por el otro terminal; la casilla de la tierra queda en cero.
    fn corrientes_propias(&self) -> bool {
        true
    }

    fn corrientes(&self, x: &[f64], _s0: &[f64], _r: &Reading, out: &mut [f64]) {
        let (i1, i2) = (x[self.br1], x[self.br2]);
        out[0] = i1;
        out[1] = -i1;
        out[2] = i2;
        out[3] = -i2;
        out[4] = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use crate::{Netlist, Transient};

    fn red(l2: f64, a2: usize, b2: usize) -> Transient {
        let json = format!(
            r#"{{"nodes":4,"elements":[
            {{"type":"V","a":1,"b":0,"wave":{{"kind":"sine","offset":0,"amp":10,"freq":1000}}}},
            {{"type":"R","a":1,"b":2,"ohms":1}},
            {{"type":"XFMR","a1":2,"b1":0,"a2":{a2},"b2":{b2},"l1":1.0,"l2":{l2},"k":0.9999}},
            {{"type":"R","a":3,"b":0,"ohms":10000}}]}}"#
        );
        Transient::new(Netlist::from_json(&json).unwrap(), 1e-6).unwrap()
    }

    #[test]
    fn la_relacion_de_voltajes_es_la_de_espiras() {
        // 10:1 (L2 = L1 / 100): 10 V de pico en el primario dan 1 V en el secundario.
        let mut tr = red(0.01, 3, 0);
        let mut pico: f64 = 0.0;
        let mut t = 2e-3;
        while t < 4e-3 {
            tr.advance_to(t, u32::MAX).unwrap();
            pico = pico.max(tr.voltage(3).abs());
            t += 2e-6;
        }
        assert!((pico - 1.0).abs() < 0.02, "pico del secundario = {pico}");
    }

    #[test]
    fn el_punto_marca_la_polaridad_del_secundario() {
        // A un cuarto de periodo el primario está en su pico: con los terminales del secundario intercambiados la salida se invierte.
        let leer = |a2: usize, b2: usize| {
            let mut tr = red(1.0, a2, b2);
            tr.advance_to(0.25e-3, u32::MAX).unwrap();
            tr.voltage(3)
        };
        let (directo, invertido) = (leer(3, 0), leer(0, 3));
        assert!(directo > 9.0 && invertido < -9.0, "{directo} {invertido}");
    }
}
