//! Diodo de unión (dioload.c y diotemp.c de ngspice): corriente de Shockley con `is` y `n`, la cola cúbica en
//! inversa, la ruptura inversa a `bv` con `ibv` y `nbv` (el zener), la resistencia en serie `rs` y las cargas de
//! agotamiento (`cjo`, `vj`, `m`, `fc`) y de difusión (`tt`).

use super::{close, depletion, exp_tope, limexp, init_charge, init_current, integrate, pnjlim, predict, stamp_g, stamp_i, terr, volt, Alloc, Ctx, Device, Hist, Mode, Reading, Tol, U, VT};
use crate::netlist::DiodeModel;


#[derive(Clone)]
pub struct Diode {
    a: usize,
    b: usize,
    m: DiodeModel,
    ua: U,
    /// Ánodo interno, después de `rs` (el mismo `ua` sin resistencia en serie).
    ap: U,
    ub: U,
    /// Estado: voltaje de la unión, corriente, conductancia, carga y su corriente.
    st: usize,
    vcrit: f64,
    /// Exponente donde la exponencial pasa a línea recta (`exp_tope`).
    tope: f64,
    /// Voltaje de ruptura ajustado para que la corriente en -bv sea ibv (el `tBrkdwnV` de diotemp.c).
    xbv: f64,
}

impl Diode {
    pub fn new(a: usize, b: usize, m: DiodeModel) -> Self {
        let vte = m.n * VT;
        let vcrit = vte * (vte / (std::f64::consts::SQRT_2 * m.is)).ln();
        let xbv = m.bv.map_or(f64::INFINITY, |bv| breakdown(bv, m.ibv, m.nbv, m.is));
        let tope = exp_tope(m.is);
        Self { a, b, m, ua: None, ap: None, ub: None, st: 0, vcrit, tope, xbv }
    }

    /// Corriente y conductancia de la unión a `vd` (sin gmin).
    fn iv(&self, vd: f64) -> (f64, f64) {
        let vte = self.m.n * VT;
        if vd >= -3.0 * vte {
            let (evd, devd) = limexp(vd / vte, self.tope);
            (self.m.is * (evd - 1.0), self.m.is * devd / vte)
        } else if self.m.bv.is_none() || vd >= -self.xbv {
            let arg = 3.0 * vte / (vd * std::f64::consts::E);
            let arg = arg * arg * arg;
            (-self.m.is * (1.0 + arg), self.m.is * 3.0 * arg / vd)
        } else {
            let vtebrk = self.m.nbv * VT;
            let (evrev, devrev) = limexp(-(self.xbv + vd) / vtebrk, self.tope);
            (-self.m.is * evrev, self.m.is * devrev / vtebrk)
        }
    }

    fn has_charge(&self) -> bool {
        self.m.cjo > 0.0 || self.m.tt > 0.0
    }
}

/// El ajuste de diotemp.c: el voltaje `xbv` tal que la corriente de ruptura en -bv sea `ibv`.
fn breakdown(bv: f64, ibv: f64, nbv: f64, is: f64) -> f64 {
    let vt = VT;
    if ibv < is * bv / vt {
        return bv;
    }
    let tol = 1e-6 * ibv;
    let mut xbv = bv - nbv * vt * (1.0 + ibv / is).ln();
    for _ in 0..25 {
        xbv = bv - nbv * vt * (ibv / is + 1.0 - xbv / vt).ln();
        let xcbv = is * (((bv - xbv) / (nbv * vt)).exp() - 1.0 + xbv / vt);
        if (xcbv - ibv).abs() <= tol {
            break;
        }
    }
    xbv
}

impl Device for Diode {
    /// No redefine `accept`: el motor no se lo pide.
    fn usa_accept(&self) -> bool {
        false
    }
    fn bind(&mut self, a: &mut Alloc) {
        self.ua = a.ext(self.a);
        self.ub = a.ext(self.b);
        self.ap = a.node_if(self.m.rs > 0.0, self.ua);
        self.st = a.states(5);
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        let (sv, sc, sg, sq) = (self.st, self.st + 1, self.st + 2, self.st + 3);
        let vte = self.m.n * VT;
        let mut limito = false;
        let vd = match c.mode {
            Mode::InitTran => c.s1[sv],
            Mode::Pred | Mode::Float => {
                let raw = if c.mode == Mode::Pred { predict(c, sv) } else { volt(c.x, self.ap) - volt(c.x, self.ub) };
                let vold = c.s0[sv];
                let vtebrk = self.m.nbv * VT;
                let (v, l) = if self.m.bv.is_some() && raw < (-self.xbv + 10.0 * vtebrk).min(0.0) {
                    let (t, l) = pnjlim(-(raw + self.xbv), -(vold + self.xbv), vtebrk, self.vcrit);
                    (-(t + self.xbv), l)
                } else {
                    pnjlim(raw, vold, vte, self.vcrit)
                };
                limito = l;
                v
            }
        };
        let (mut cd, mut gd) = self.iv(vd);
        cd += c.gmin * vd;
        gd += c.gmin;
        if self.has_charge() {
            let (qd, capd) = depletion(vd, self.m.cjo, self.m.vj, self.m.m, self.m.fc);
            c.s0[sq] = qd + self.m.tt * cd;
            init_charge(c, sq);
            let (geq, _) = integrate(c, capd + self.m.tt * gd, sq);
            init_current(c, sq);
            gd += geq;
            cd += c.s0[sq + 1];
        }
        c.s0[sv] = vd;
        c.s0[sc] = cd;
        c.s0[sg] = gd;
        if self.m.rs > 0.0 {
            stamp_g(c.m, self.ua, self.ap, 1.0 / self.m.rs);
        }
        stamp_g(c.m, self.ap, self.ub, gd);
        stamp_i(c.rhs, self.ap, self.ub, cd - gd * vd);
        limito
    }

    fn converged(&self, x: &[f64], s0: &[f64], tol: &Tol) -> bool {
        let delvd = volt(x, self.ap) - volt(x, self.ub) - s0[self.st];
        close(s0[self.st + 1] + s0[self.st + 2] * delvd, s0[self.st + 1], tol)
    }

    fn trunc(&self, h: &Hist, dt: &mut f64) {
        if self.has_charge() {
            terr(h, self.st + 3, dt);
        }
    }

    /// La corriente de la unión con la solución aceptada (así cumple la ley de Kirchhoff con el resto del circuito)
    /// más la de su carga.
    fn reading(&self, x: &[f64], s0: &[f64]) -> Reading {
        let vd = volt(x, self.ap) - volt(x, self.ub);
        let carga = if self.has_charge() { s0[self.st + 4] } else { 0.0 };
        Reading { i: self.iv(vd).0 + super::GMIN * vd + carga, ..Reading::default() }
    }

    fn tiene_union(&self) -> bool {
        true
    }

    /// Sin capacitancia de unión ni tiempo de tránsito (el LED y el diodo de la librería) no tiene carga que evolucione.
    fn tiene_dinamica(&self) -> bool {
        self.has_charge()
    }

    fn junction_current(&self, s0: &[f64]) -> f64 {
        s0[self.st + 1].abs()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_ruptura_ajustada_da_ibv_en_menos_bv() {
        // 1N4733A: 5.1 V a 49 mA con nbv 11.4.
        let (bv, ibv, nbv, is) = (5.1, 0.049, 11.4, 2.5e-15);
        let xbv = breakdown(bv, ibv, nbv, is);
        let d = Diode::new(1, 0, DiodeModel { bv: Some(bv), ibv, nbv, is, ..DiodeModel::default() });
        let (i, _) = d.iv(-bv);
        assert!((i + ibv).abs() / ibv < 1e-3, "i(-bv) = {i}, xbv = {xbv}");
    }

    #[test]
    fn sin_ruptura_la_inversa_es_la_cola_cubica() {
        let d = Diode::new(1, 0, DiodeModel::default());
        let (i, _) = d.iv(-50.0);
        assert!(i < 0.0 && i > -2e-14, "i = {i}");
    }
}
