//! JFET nivel 1 de SPICE (jfetload.c a 27 °C): canal de Shichman y Hodges con el parámetro B de Parker y Skellern, dos uniones de compuerta con `is` y `n`, capacitancias de agotamiento con `pb` y `fc`, y resistencias `rd` y `rs` internas.

use super::region::{AMPLIFICA, CORTE, INTERRUPTOR};
use super::{close, depletion, entry, exp_tope, init_charge, init_current, inject, integrate, limexp, pnjlim, predict, stamp_g, terr, volt, Alloc, Ctx, Device, Hist, Mode, Reading, Tol, U, VT};
use crate::netlist::JfetModel;

#[derive(Clone)]
pub struct Jfet {
    d: usize,
    g: usize,
    s: usize,
    /// +1 canal N, -1 canal P.
    tipo: f64,
    m: JfetModel,
    ud: U,
    ug: U,
    us: U,
    udp: U,
    usp: U,
    st: usize,
    /// Voltaje térmico por el coeficiente de emisión.
    vtn: f64,
    vcrit: f64,
    tope: f64,
    /// (1 - b) / (pb - vto), el coeficiente cúbico del canal.
    bfac: f64,
}

// Casillas de estado.
const VGS: usize = 0;
const VGD: usize = 1;
const QGS: usize = 2;
const QGD: usize = 4;
const CG: usize = 6;
const CD: usize = 7;
const CGD: usize = 8;
const GM: usize = 9;
const GDS: usize = 10;
const GGS: usize = 11;
const GGD: usize = 12;
const MODO: usize = 13;
/// 0 hasta la primera carga: ahí se arranca como MODEINITJCT.
const INI: usize = 14;
const IGS: usize = 15;
const IGD: usize = 16;
const NEST: usize = 17;

impl Jfet {
    pub fn new(d: usize, g: usize, s: usize, pjf: bool, m: JfetModel) -> Self {
        let vtn = VT * m.n;
        Self {
            d,
            g,
            s,
            tipo: if pjf { -1.0 } else { 1.0 },
            ud: None,
            ug: None,
            us: None,
            udp: None,
            usp: None,
            st: 0,
            vtn,
            vcrit: vtn * (vtn / (std::f64::consts::SQRT_2 * m.is)).ln(),
            tope: exp_tope(m.is),
            bfac: (1.0 - m.b) / (m.pb - m.vto),
            m,
        }
    }

    /// Unión de compuerta ideal con gmin: corriente y conductancia.
    fn union(&self, v: f64, gmin: f64) -> (f64, f64) {
        if v <= -3.0 * self.vtn {
            let g = -self.m.is / v + gmin;
            (g * v, g)
        } else {
            let (ev, dev) = limexp(v / self.vtn, self.tope);
            (self.m.is * (ev - 1.0) + gmin * v, self.m.is * dev / self.vtn + gmin)
        }
    }

    /// Corriente del canal en modo normal y sus derivadas respecto de `vg` y `vd`; el inverso lo llama con los
    /// terminales intercambiados, como ngspice.
    fn canal(&self, vg: f64, vd: f64) -> (f64, f64, f64) {
        let vgst = vg - self.m.vto;
        if vgst <= 0.0 {
            return (0.0, 0.0, 0.0);
        }
        let b = self.m.b;
        let bf = self.bfac;
        let betap = self.m.beta * (1.0 + self.m.lambda * vd);
        let dbetap = self.m.beta * self.m.lambda;
        let (p, pg, pd) = if vgst >= vd {
            let apart = 2.0 * b + 3.0 * bf * (vgst - vd);
            let q = vd * (bf * vd - b) + vgst * apart;
            let qg = apart + 3.0 * bf * vgst;
            let qd = 2.0 * bf * vd - b - 3.0 * bf * vgst;
            (vd * q, vd * qg, q + vd * qd)
        } else {
            (vgst * vgst * (b + bf * vgst), vgst * (2.0 * b + 3.0 * bf * vgst), 0.0)
        };
        (betap * p, betap * pg, betap * pd + dbetap * p)
    }
}

impl Device for Jfet {
    fn usa_accept(&self) -> bool {
        false
    }

    fn bind(&mut self, a: &mut Alloc) {
        self.ud = a.ext(self.d);
        self.ug = a.ext(self.g);
        self.us = a.ext(self.s);
        self.udp = a.node_if(self.m.rd > 0.0, self.ud);
        self.usp = a.node_if(self.m.rs > 0.0, self.us);
        self.st = a.states(NEST);
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        let s = self.st;
        let tipo = self.tipo;
        let x = c.x;
        let (mut vgs, mut vgd) = match c.mode {
            Mode::InitTran | Mode::Pred => (predict(c, s + VGS), predict(c, s + VGD)),
            // MODEINITJCT: con las dos uniones a -1 V el canal ya existe y Newton arranca cerca.
            Mode::Float if c.s0[s + INI] == 0.0 => (-1.0, -1.0),
            Mode::Float => (tipo * (volt(x, self.ug) - volt(x, self.usp)), tipo * (volt(x, self.ug) - volt(x, self.udp))),
        };
        let (v, l1) = pnjlim(vgs, c.s0[s + VGS], self.vtn, self.vcrit);
        vgs = v;
        let (v, l2) = pnjlim(vgd, c.s0[s + VGD], self.vtn, self.vcrit);
        vgd = v;
        let check = l1 || l2;
        let vds = vgs - vgd;
        let (igs, ggs0) = self.union(vgs, c.gmin);
        let (igd, ggd0) = self.union(vgd, c.gmin);
        let (mut ggs, mut ggd) = (ggs0, ggd0);
        let mut cg = igs + igd;
        let mut cgd = igd;
        let (cdrain, gm, gds) = if vds >= 0.0 {
            self.canal(vgs, vds)
        } else {
            let (f, f1, f2) = self.canal(vgd, -vds);
            (-f, -f1, f1 + f2)
        };
        let mut cd = cdrain - cgd;
        // Capacidades de agotamiento de las dos uniones.
        let (q, capgs) = depletion(vgs, self.m.cgs, self.m.pb, 0.5, self.m.fc);
        c.s0[s + QGS] = q;
        let (q, capgd) = depletion(vgd, self.m.cgd, self.m.pb, 0.5, self.m.fc);
        c.s0[s + QGD] = q;
        init_charge(c, s + QGS);
        init_charge(c, s + QGD);
        let (gcgs, _) = integrate(c, capgs, s + QGS);
        let (gcgd, _) = integrate(c, capgd, s + QGD);
        init_current(c, s + QGS);
        init_current(c, s + QGD);
        ggs += gcgs;
        ggd += gcgd;
        cg += c.s0[s + QGS + 1] + c.s0[s + QGD + 1];
        cd -= c.s0[s + QGD + 1];
        cgd += c.s0[s + QGD + 1];
        c.s0[s + VGS] = vgs;
        c.s0[s + VGD] = vgd;
        c.s0[s + CG] = cg;
        c.s0[s + CD] = cd;
        c.s0[s + CGD] = cgd;
        c.s0[s + GM] = gm;
        c.s0[s + GDS] = gds;
        c.s0[s + GGS] = ggs;
        c.s0[s + GGD] = ggd;
        c.s0[s + MODO] = if vds >= 0.0 { 1.0 } else { -1.0 };
        c.s0[s + INI] = 1.0;
        c.s0[s + IGS] = igs;
        c.s0[s + IGD] = igd;
        // Lado derecho.
        let ceqgd = tipo * (cgd - ggd * vgd);
        let ceqgs = tipo * ((cg - cgd) - ggs * vgs);
        let cdreq = tipo * ((cd + cgd) - gds * vds - gm * vgs);
        inject(c.rhs, self.ug, -ceqgs - ceqgd);
        inject(c.rhs, self.udp, -cdreq + ceqgd);
        inject(c.rhs, self.usp, cdreq + ceqgs);
        // Matriz.
        let (d, g, sx, dp, sp) = (self.ud, self.ug, self.us, self.udp, self.usp);
        let mm = &mut *c.m;
        stamp_g(mm, d, dp, if self.m.rd > 0.0 { 1.0 / self.m.rd } else { 0.0 });
        stamp_g(mm, sx, sp, if self.m.rs > 0.0 { 1.0 / self.m.rs } else { 0.0 });
        entry(mm, g, g, ggd + ggs);
        entry(mm, dp, dp, gds + ggd);
        entry(mm, sp, sp, gds + gm + ggs);
        entry(mm, g, dp, -ggd);
        entry(mm, g, sp, -ggs);
        entry(mm, dp, g, gm - ggd);
        entry(mm, dp, sp, -gds - gm);
        entry(mm, sp, g, -ggs - gm);
        entry(mm, sp, dp, -gds);
        check
    }

    fn converged(&self, x: &[f64], s0: &[f64], tol: &Tol) -> bool {
        let s = self.st;
        let t = self.tipo;
        let vgs = t * (volt(x, self.ug) - volt(x, self.usp));
        let vgd = t * (volt(x, self.ug) - volt(x, self.udp));
        let (delvgs, delvgd) = (vgs - s0[s + VGS], vgd - s0[s + VGD]);
        let delvds = delvgs - delvgd;
        let (cg, cd, gm, gds, ggs, ggd) = (s0[s + CG], s0[s + CD], s0[s + GM], s0[s + GDS], s0[s + GGS], s0[s + GGD]);
        let cghat = cg + ggd * delvgd + ggs * delvgs;
        let cdhat = cd + gm * delvgs + gds * delvds + ggd * delvgd;
        close(cghat, cg, tol) && close(cdhat, cd, tol)
    }

    fn tiene_union(&self) -> bool {
        true
    }

    fn junction_current(&self, s0: &[f64]) -> f64 {
        s0[self.st + IGS].abs().max(s0[self.st + IGD].abs())
    }

    fn trunc(&self, h: &Hist, dt: &mut f64) {
        if self.m.cgs > 0.0 {
            terr(h, self.st + QGS, dt);
        }
        if self.m.cgd > 0.0 {
            terr(h, self.st + QGD, dt);
        }
    }

    fn reading(&self, _x: &[f64], s0: &[f64]) -> Reading {
        let s = self.st;
        let (vgs, vgd) = (s0[s + VGS], s0[s + VGD]);
        // Con vds negativo el drenador hace de fuente.
        let (vg, vd) = if vgs >= vgd { (vgs, vgs - vgd) } else { (vgd, vgd - vgs) };
        let vgst = vg - self.m.vto;
        let region = if vgst <= 0.0 { CORTE } else if vgst <= vd { AMPLIFICA } else { INTERRUPTOR };
        Reading { i: self.tipo * s0[s + CD], aux: 0.0, estado: region }
    }

    /// Entra Id por el drenador y Ig por la compuerta; la suma sale por la fuente.
    fn corrientes_propias(&self) -> bool {
        true
    }

    fn corrientes(&self, _x: &[f64], s0: &[f64], r: &Reading, out: &mut [f64]) {
        let ig = self.tipo * s0[self.st + CG];
        out[0] = r.i;
        out[1] = ig;
        out[2] = -(r.i + ig);
        out[3] = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Netlist, Transient};

    const N5457: &str = r#"{"vto":-3.05838,"beta":3.04692e-4,"lambda":0.00350877,"pb":1,"cgs":3e-12,"cgd":6e-12,"is":1e-14}"#;
    const CON_SERIE: &str = r#"{"vto":-3.05838,"beta":3.04692e-4,"lambda":0.02,"pb":1,"is":1e-14,"b":0.5,"n":1.5,"rd":50,"rs":30}"#;

    /// JFET con el drenador a `vd` y la compuerta a `vg` (fuentes ideales, fuente a tierra) en continua.
    fn punto(vd: f64, vg: f64, pjf: bool, modelo: &str) -> Transient {
        let json = format!(r#"{{"nodes":3,"elements":[
            {{"type":"V","a":1,"b":0,"wave":{{"kind":"dc","v":{vd}}}}},
            {{"type":"V","a":2,"b":0,"wave":{{"kind":"dc","v":{vg}}}}},
            {{"type":"J","d":1,"g":2,"s":0,"pjf":{pjf},"model":{modelo}}}]}}"#);
        let mut tr = Transient::new(Netlist::from_json(&json).unwrap(), 1e-6).unwrap();
        tr.advance_to(1e-5, u32::MAX).unwrap();
        tr
    }

    fn id(tr: &Transient) -> f64 {
        tr.readings()[2].i
    }

    fn cerca(a: f64, b: f64, rel: f64) {
        assert!((a - b).abs() <= rel * b.abs(), "{a} contra {b}");
    }

    #[test]
    fn idss_con_vgs_cero_en_saturacion() {
        let tr = punto(15.0, 0.0, false, N5457);
        let idss = 3.04692e-4 * 3.05838f64.powi(2) * (1.0 + 0.00350877 * 15.0);
        cerca(id(&tr), idss, 1e-4);
        // ngspice 47: 2.99999 mA.
        cerca(id(&tr), 2.99999e-3, 1e-4);
        assert_eq!(tr.readings()[2].estado, AMPLIFICA);
    }

    #[test]
    fn la_vgs_tipica_de_la_hoja_da_cien_microamperes() {
        cerca(id(&punto(15.0, -2.5, false, N5457)), 99.9994e-6, 1e-4);
    }

    #[test]
    fn bajo_el_umbral_no_conduce() {
        let tr = punto(15.0, -3.2, false, N5457);
        assert!(id(&tr).abs() < 1e-9, "id = {}", id(&tr));
        assert_eq!(tr.readings()[2].estado, CORTE);
    }

    #[test]
    fn region_lineal_contra_ngspice() {
        let tr = punto(0.5, -1.0, false, N5457);
        cerca(id(&tr), 5.51966e-4, 1e-4);
        assert_eq!(tr.readings()[2].estado, INTERRUPTOR);
    }

    #[test]
    fn con_vds_negativa_el_canal_es_simetrico() {
        // Lineal inverso, saturación inversa y con rd, rs, b y n distintos de los de omisión.
        cerca(id(&punto(-0.5, -1.0, false, N5457)), -7.045789e-4, 1e-4);
        cerca(id(&punto(-4.0, -4.5, false, N5457)), -2.022293e-3, 1e-4);
        cerca(id(&punto(-3.0, -3.5, false, N5457)), -2.015296e-3, 1e-4);
        cerca(id(&punto(6.0, -1.0, false, CON_SERIE)), 1.04951e-3, 1e-4);
        cerca(id(&punto(-4.0, -4.5, false, CON_SERIE)), -1.622159e-3, 1e-4);
    }

    #[test]
    fn la_compuerta_en_directo_conduce_por_la_union() {
        let tr = punto(3.0, 0.6, false, CON_SERIE);
        cerca(id(&tr), 3.65389e-3, 1e-4);
        // Entra por la compuerta lo que ngspice reporta: 3.08 nA.
        let mut c = [0.0; 4];
        tr.corrientes_de(2, &mut c);
        cerca(c[1], 3.08363e-9, 1e-3);
    }

    #[test]
    fn el_canal_p_es_el_n_con_los_signos_invertidos() {
        let n = punto(15.0, 0.0, false, N5457);
        let p = punto(-15.0, 0.0, true, N5457);
        cerca(id(&p), -id(&n), 1e-9);
        let n = punto(-0.5, -1.0, false, N5457);
        let p = punto(0.5, 1.0, true, N5457);
        cerca(id(&p), -id(&n), 1e-9);
        assert_eq!(punto(15.0, 0.0, false, N5457).readings()[2].estado, p_region(15.0, 0.0));
    }

    fn p_region(vd: f64, vg: f64) -> f64 {
        punto(-vd, -vg, true, N5457).readings()[2].estado
    }

    #[test]
    fn las_derivadas_del_canal_coinciden_con_las_diferencias_finitas() {
        let j = Jfet::new(1, 2, 0, false, serde_json::from_str(CON_SERIE).unwrap());
        for (vg, vd) in [(-1.0, 0.5), (-1.0, 6.0), (-0.2, 2.5)] {
            let (_, g1, g2) = j.canal(vg, vd);
            let h = 1e-6;
            let n1 = (j.canal(vg + h, vd).0 - j.canal(vg - h, vd).0) / (2.0 * h);
            let n2 = (j.canal(vg, vd + h).0 - j.canal(vg, vd - h).0) / (2.0 * h);
            assert!((g1 - n1).abs() < 1e-6 * n1.abs().max(1e-6), "gm {g1} contra {n1}");
            assert!((g2 - n2).abs() < 1e-6 * n2.abs().max(1e-6), "gds {g2} contra {n2}");
        }
    }
}
