//! Zumbador activo: una resistencia `ohms` que suena mientras el voltaje llega a `umbral` y calla bajo `umbral` menos su histéresis. El instante del cruce se interpola dentro del paso sin acortarlo, porque para el oído basta.

use super::{stamp_g, volt, Alloc, Ctx, Device, Event, Reading, U};
use crate::netlist::Element;

#[derive(Clone)]
pub struct Zumbador {
    a: usize,
    b: usize,
    ohms: f64,
    umbral: f64,
    ua: U,
    ub: U,
    suena: bool,
    cambio: Option<(u8, f64)>,
    /// El voltaje del paso aceptado anterior (para interpolar el instante del cruce).
    v_prev: f64,
}

/// Fracción del umbral debajo de la cual deja de sonar.
pub const HISTERESIS_ZUMBADOR: f64 = 0.02;

impl Zumbador {
    pub fn new(a: usize, b: usize, ohms: f64, umbral: f64) -> Self {
        Self { a, b, ohms, umbral, ua: None, ub: None, suena: false, cambio: None, v_prev: 0.0 }
    }
}

impl Device for Zumbador {
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
    fn accept(&mut self, x: &[f64], _s0: &[f64], t: f64, h: f64, _ev: &mut Vec<Event>) -> bool {
        let v = volt(x, self.ua) - volt(x, self.ub);
        let nivel = if self.suena { self.umbral * (1.0 - HISTERESIS_ZUMBADOR) } else { self.umbral };
        let cambia = if self.suena { v < nivel } else { v >= nivel };
        if cambia {
            let dv = v - self.v_prev;
            let f = if dv != 0.0 { ((nivel - self.v_prev) / dv).clamp(0.0, 1.0) } else { 1.0 };
            self.suena = !self.suena;
            self.cambio = Some((u8::from(self.suena), t - h + f * h));
        }
        self.v_prev = v;
        false
    }
    /// Corriente de `a` hacia `b`; en `estado`, 1 mientras suena.
    fn reading(&self, x: &[f64], _s0: &[f64]) -> Reading {
        Reading { i: (volt(x, self.ua) - volt(x, self.ub)) / self.ohms, aux: 0.0, estado: if self.suena { 1.0 } else { 0.0 } }
    }
    fn tiene_estado(&self) -> bool {
        true
    }
    fn tomar_estado(&mut self) -> Option<(u8, f64)> {
        self.cambio.take()
    }
    /// Su voltaje nominal cambió en caliente: otra resistencia y otro umbral, sin perder si suena.
    fn set(&mut self, e: &Element) -> bool {
        match *e {
            Element::Buzzer { a, b, ohms, umbral } if a == self.a && b == self.b => {
                (self.ohms, self.umbral) = (ohms, umbral);
                true
            }
            _ => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{Netlist, Transient};

    #[test]
    fn suena_desde_su_umbral_y_avisa_cada_cambio_una_vez() {
        // 5 V nominales (166.7 Ω) con una cuadrada de 0 a 5 V de 10 Hz: suena la mitad de cada periodo.
        let mut tr = Transient::new(Netlist::from_json(r#"{"nodes":2,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":10,"duty":0.5}},
            {"type":"BUZZER","a":1,"b":0,"ohms":166.7,"umbral":3}]}"#).unwrap(), 1e-4).unwrap();
        tr.advance_to(0.19, u32::MAX).unwrap();
        let c = tr.take_cruces();
        let niveles: Vec<u8> = c.iter().map(|x| x.nivel).collect();
        // Enciende en t = 0 (primer paso), apaga a 50 ms, enciende a 100 ms y apaga a 150 ms.
        assert_eq!(niveles, vec![1, 0, 1, 0], "{c:?}");
        for (x, t) in c.iter().zip([0.0, 0.05, 0.1, 0.15]) {
            assert!((x.t - t).abs() < 2e-4, "cruce en {} y no en {t}", x.t);
            assert_eq!(x.element, 1);
        }
        // A 0.19 s sigue en silencio desde los 150 ms.
        assert_eq!(tr.readings()[1].estado, 0.0);
        assert!(tr.take_cruces().is_empty());
    }
}
