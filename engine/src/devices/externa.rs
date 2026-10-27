//! Fuente de valor externo (`EXT`): `k` por el valor de un canal más `c`, como voltaje o como corriente. El valor lo mueve el exterior
//! (una perilla, un emulador, un bloque) y se lee al final de cada paso, así que la fuente no necesita estado propio.

use super::{entry, stamp_i, Alloc, Ctx, Device, Reading, U};
use crate::netlist::{Element, ModoExt};

#[derive(Clone)]
pub struct Externa {
    a: usize,
    b: usize,
    modo: ModoExt,
    canal: usize,
    k: f64,
    c: f64,
    /// Resistencia en serie de la fuente de voltaje (cero si no la lleva). En modo corriente no tiene efecto.
    r: f64,
    ua: U,
    ub: U,
    br: usize,
    /// Casilla donde queda la corriente de la fuente de corriente del último paso.
    st: usize,
}

impl Externa {
    pub fn new(a: usize, b: usize, modo: ModoExt, canal: usize, k: f64, c: f64, r: Option<f64>) -> Self {
        Self { a, b, modo, canal, k, c, r: r.unwrap_or(0.0), ua: None, ub: None, br: 0, st: 0 }
    }
}

impl Device for Externa {
    /// No redefine `accept`: el motor no se lo pide.
    fn usa_accept(&self) -> bool {
        false
    }
    fn bind(&mut self, a: &mut Alloc) {
        self.ua = a.ext(self.a);
        self.ub = a.ext(self.b);
        match self.modo {
            ModoExt::V => self.br = a.branch(),
            ModoExt::I => self.st = a.states(1),
        }
    }
    fn load(&mut self, c: &mut Ctx) -> bool {
        // El tramo del canal lo decide el punto medio del paso, como en las ondas por tramos.
        let valor = self.k * c.canales.valor(self.canal, c.t - 0.5 * c.h, c.t) + self.c;
        match self.modo {
            ModoExt::V => {
                let br = Some(self.br);
                entry(c.m, self.ua, br, 1.0);
                entry(c.m, self.ub, br, -1.0);
                entry(c.m, br, self.ua, 1.0);
                entry(c.m, br, self.ub, -1.0);
                if self.r > 0.0 {
                    entry(c.m, br, br, -self.r);
                }
                c.rhs[self.br] += c.src * valor;
            }
            ModoExt::I => {
                stamp_i(c.rhs, self.ua, self.ub, c.src * valor);
                c.s0[self.st] = valor;
            }
        }
        false
    }
    fn linear(&self) -> bool {
        true
    }
    /// Lo que cambia con el tiempo es el canal, y el motor ya lo trata como quiebre.
    fn tiene_dinamica(&self) -> bool {
        false
    }
    fn reading(&self, x: &[f64], s0: &[f64]) -> Reading {
        match self.modo {
            ModoExt::V => Reading { i: x[self.br], ..Reading::default() },
            ModoExt::I => Reading { i: s0[self.st], ..Reading::default() },
        }
    }
    fn set(&mut self, e: &Element) -> bool {
        match *e {
            Element::Ext { a, b, modo, canal, k, c, r } if a == self.a && b == self.b && modo == self.modo && canal == self.canal => {
                self.k = k;
                self.c = c;
                self.r = r.unwrap_or(0.0);
                true
            }
            _ => false,
        }
    }
}
