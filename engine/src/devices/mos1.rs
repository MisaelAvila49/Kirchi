//! MOSFET nivel 1 de SPICE (mos1load.c y mos1temp.c a 27 °C) con el sustrato unido a la fuente: el diodo de cuerpo es la unión sustrato-drenador. Sin `tox` no hay capacitancias de Meyer y sin `gamma` no hay efecto de cuerpo.

use super::{close, depletion, entry, exp_tope, limexp, init_charge, init_current, integrate, inject, pnjlim, predict, stamp_g, terr, volt, Alloc, Ctx, Device, Hist, Mode, Reading, Tol, U, VT};
use crate::netlist::MosModel;

#[derive(Clone)]
pub struct Mos1 {
    d: usize,
    g: usize,
    s: usize,
    /// +1 canal N, -1 canal P.
    tipo: f64,
    m: MosModel,
    ud: U,
    ug: U,
    us: U,
    /// Drenador y fuente internos (los externos si su resistencia es cero); el sustrato es la fuente externa.
    udp: U,
    usp: U,
    st: usize,
    vcrit: f64,
    /// Exponente donde la exponencial del diodo de sustrato pasa a línea recta.
    tope: f64,
    beta: f64,
    /// Voltaje de encendido normalizado por la polaridad (vto con su signo de canal N).
    von: f64,
    cgs: f64,
    cgd: f64,
}

// Casillas de estado.
const VBS: usize = 0;
const VBD: usize = 1;
const VGS: usize = 2;
const VDS: usize = 3;
const QGS: usize = 4;
const QGD: usize = 6;
const QBD: usize = 8;
const QBS: usize = 10;
const CD: usize = 12;
const GM: usize = 13;
const GDS: usize = 14;
const GBD: usize = 15;
const GBS: usize = 16;
const CBD: usize = 17;
const CBS: usize = 18;
const MODO: usize = 19;

impl Mos1 {
    pub fn new(d: usize, g: usize, s: usize, pmos: bool, m: MosModel) -> Self {
        let tipo = if pmos { -1.0 } else { 1.0 };
        let vcrit = VT * (VT / (std::f64::consts::SQRT_2 * m.is)).ln();
        Self {
            d,
            g,
            s,
            tipo,
            ud: None,
            ug: None,
            us: None,
            udp: None,
            usp: None,
            st: 0,
            vcrit,
            tope: exp_tope(m.is),
            beta: m.kp * m.w / m.l,
            von: m.vto * tipo,
            cgs: m.cgso * m.w,
            cgd: m.cgdo * m.w,
            m,
        }
    }

    /// Diodo de sustrato ideal (la corriente de saturación es `is`), con gmin.
    fn bulk(&self, v: f64, gmin: f64) -> (f64, f64) {
        if v <= -3.0 * VT {
            (gmin * v - self.m.is, gmin)
        } else {
            let (ev, dev) = limexp(v / VT, self.tope);
            (self.m.is * (ev - 1.0) + gmin * v, self.m.is * dev / VT + gmin)
        }
    }

    /// Corriente del canal y sus derivadas en modo normal (vds ≥ 0) con `vgs` y `vds` ya normalizados.
    fn channel(&self, vgs: f64, vds: f64) -> (f64, f64, f64) {
        let vgst = vgs - self.von;
        if vgst <= 0.0 {
            return (0.0, 0.0, 0.0);
        }
        let l = self.m.lambda;
        let betap = self.beta * (1.0 + l * vds);
        if vgst <= vds {
            (betap * vgst * vgst * 0.5, betap * vgst, l * self.beta * vgst * vgst * 0.5)
        } else {
            (betap * vds * (vgst - 0.5 * vds), betap * vds, betap * (vgst - vds) + l * self.beta * vds * (vgst - 0.5 * vds))
        }
    }
}

impl Device for Mos1 {
    /// No redefine `accept`: el motor no se lo pide.
    fn usa_accept(&self) -> bool {
        false
    }
    fn bind(&mut self, a: &mut Alloc) {
        self.ud = a.ext(self.d);
        self.ug = a.ext(self.g);
        self.us = a.ext(self.s);
        self.udp = a.node_if(self.m.rd > 0.0, self.ud);
        self.usp = a.node_if(self.m.rs > 0.0, self.us);
        self.st = a.states(20);
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        let s = self.st;
        let tipo = self.tipo;
        let x = c.x;
        let ub = self.us;
        let (mut vbs, mut vgs, mut vds) = match c.mode {
            // En el primer paso y al empezar cada uno, ngspice extrapola los voltajes de los dos pasos anteriores.
            Mode::InitTran | Mode::Pred => {
                let r = (predict(c, s + VBS), predict(c, s + VGS), predict(c, s + VDS));
                c.s0[s + VBD] = c.s0[s + VBS] - c.s0[s + VDS];
                r
            }
            Mode::Float => (
                tipo * (volt(x, ub) - volt(x, self.usp)),
                tipo * (volt(x, self.ug) - volt(x, self.usp)),
                tipo * (volt(x, self.udp) - volt(x, self.usp)),
            ),
        };
        let mut vbd = vbs - vds;
        let mut vgd = vgs - vds;
        let vgdo = c.s0[s + VGS] - c.s0[s + VDS];
        // Limitadores de ngspice.
        if c.s0[s + VDS] >= 0.0 {
            vgs = super::fetlim(vgs, c.s0[s + VGS], self.von);
            vds = vgs - vgd;
            vds = super::limvds(vds, c.s0[s + VDS]);
        } else {
            vgd = super::fetlim(vgd, vgdo, self.von);
            vds = vgs - vgd;
            vds = -super::limvds(-vds, -c.s0[s + VDS]);
            vgs = vgd + vds;
        }
        let check = if vds >= 0.0 {
            let (v, l) = pnjlim(vbs, c.s0[s + VBS], VT, self.vcrit);
            vbs = v;
            vbd = vbs - vds;
            l
        } else {
            let (v, l) = pnjlim(vbd, c.s0[s + VBD], VT, self.vcrit);
            vbd = v;
            vbs = vbd + vds;
            l
        };
        vgd = vgs - vds;
        let (mut cbs, mut gbs) = self.bulk(vbs, c.gmin);
        let (mut cbd, mut gbd) = self.bulk(vbd, c.gmin);
        let mode = if vds >= 0.0 { 1.0 } else { -1.0 };
        let (cdrain, gm, gds) = if mode > 0.0 { self.channel(vgs, vds) } else { self.channel(vgd, -vds) };
        let mut cd = mode * cdrain - cbd;
        // Cargas de las uniones de sustrato (el diodo de cuerpo).
        let (q, cap) = depletion(vbd, self.m.cbd, self.m.pb, self.m.mj, self.m.fc);
        c.s0[s + QBD] = q;
        let capbd = cap;
        let (q, capbs) = depletion(vbs, self.m.cbs, self.m.pb, self.m.mj, self.m.fc);
        c.s0[s + QBS] = q;
        init_charge(c, s + QBD);
        init_charge(c, s + QBS);
        let (geq, _) = integrate(c, capbd, s + QBD);
        gbd += geq;
        cbd += c.s0[s + QBD + 1];
        cd -= c.s0[s + QBD + 1];
        let (geq, _) = integrate(c, capbs, s + QBS);
        gbs += geq;
        cbs += c.s0[s + QBS + 1];
        c.s0[s + VBS] = vbs;
        c.s0[s + VBD] = vbd;
        c.s0[s + VGS] = vgs;
        c.s0[s + VDS] = vds;
        // Capacitancias de traslape de la compuerta: carga incremental desde el paso anterior.
        let (vgs1, vgd1) = (c.s1[s + VGS], c.s1[s + VGS] - c.s1[s + VDS]);
        let (mut gcgs, mut ceqgs, mut gcgd, mut ceqgd) = (0.0, 0.0, 0.0, 0.0);
        if c.mode != Mode::Float {
            c.s0[s + QGS] = (1.0 + c.xfact) * c.s1[s + QGS] - c.xfact * c.s2[s + QGS];
            c.s0[s + QGD] = (1.0 + c.xfact) * c.s1[s + QGD] - c.xfact * c.s2[s + QGD];
        } else {
            c.s0[s + QGS] = (vgs - vgs1) * self.cgs + c.s1[s + QGS];
            c.s0[s + QGD] = (vgd - vgd1) * self.cgd + c.s1[s + QGD];
        }
        if c.mode != Mode::InitTran {
            let (g, _) = integrate(c, self.cgs, s + QGS);
            gcgs = g;
            ceqgs = c.s0[s + QGS + 1] - gcgs * vgs;
            let (g, _) = integrate(c, self.cgd, s + QGD);
            gcgd = g;
            ceqgd = c.s0[s + QGD + 1] - gcgd * vgd;
        }
        init_current(c, s + QBD);
        init_current(c, s + QBS);
        c.s0[s + CD] = cd;
        c.s0[s + GM] = gm;
        c.s0[s + GDS] = gds;
        c.s0[s + GBD] = gbd;
        c.s0[s + GBS] = gbs;
        c.s0[s + CBD] = cbd;
        c.s0[s + CBS] = cbs;
        c.s0[s + MODO] = mode;
        // Lado derecho.
        let ceqbs = tipo * (cbs - gbs * vbs);
        let ceqbd = tipo * (cbd - gbd * vbd);
        let (xnrm, xrev) = if mode > 0.0 { (1.0, 0.0) } else { (0.0, 1.0) };
        let cdreq = if mode > 0.0 { tipo * (cdrain - gds * vds - gm * vgs) } else { -tipo * (cdrain - gds * (-vds) - gm * vgd) };
        inject(c.rhs, self.ug, -tipo * (ceqgs + ceqgd));
        inject(c.rhs, ub, -(ceqbs + ceqbd));
        inject(c.rhs, self.udp, ceqbd - cdreq + tipo * ceqgd);
        inject(c.rhs, self.usp, cdreq + ceqbs + tipo * ceqgs);
        // Matriz.
        let (d, g, sx, b, dp, sp) = (self.ud, self.ug, self.us, ub, self.udp, self.usp);
        let mm = &mut *c.m;
        stamp_g(mm, d, dp, if self.m.rd > 0.0 { 1.0 / self.m.rd } else { 0.0 });
        stamp_g(mm, sx, sp, if self.m.rs > 0.0 { 1.0 / self.m.rs } else { 0.0 });
        entry(mm, g, g, gcgd + gcgs);
        entry(mm, b, b, gbd + gbs);
        entry(mm, dp, dp, gds + gbd + xrev * gm + gcgd);
        entry(mm, sp, sp, gds + gbs + xnrm * gm + gcgs);
        entry(mm, g, dp, -gcgd);
        entry(mm, g, sp, -gcgs);
        entry(mm, b, dp, -gbd);
        entry(mm, b, sp, -gbs);
        entry(mm, dp, g, (xnrm - xrev) * gm - gcgd);
        entry(mm, dp, b, -gbd);
        entry(mm, dp, sp, -gds - xnrm * gm);
        entry(mm, sp, g, -(xnrm - xrev) * gm - gcgs);
        entry(mm, sp, b, -gbs);
        entry(mm, sp, dp, -gds - xrev * gm);
        check
    }

    fn converged(&self, x: &[f64], s0: &[f64], tol: &Tol) -> bool {
        let s = self.st;
        let t = self.tipo;
        let vbs = t * (volt(x, self.us) - volt(x, self.usp));
        let vgs = t * (volt(x, self.ug) - volt(x, self.usp));
        let vds = t * (volt(x, self.udp) - volt(x, self.usp));
        let (vbd, vgd) = (vbs - vds, vgs - vds);
        let vgdo = s0[s + VGS] - s0[s + VDS];
        let (delvbs, delvbd, delvgs, delvds, delvgd) = (vbs - s0[s + VBS], vbd - s0[s + VBD], vgs - s0[s + VGS], vds - s0[s + VDS], vgd - vgdo);
        let (cd, gm, gds, gbd, gbs) = (s0[s + CD], s0[s + GM], s0[s + GDS], s0[s + GBD], s0[s + GBS]);
        let cdhat = if s0[s + MODO] >= 0.0 { cd - gbd * delvbd + gm * delvgs + gds * delvds } else { cd - gbd * delvbd - gm * delvgd + gds * delvds };
        let cb = s0[s + CBS] + s0[s + CBD];
        let cbhat = cb + gbd * delvbd + gbs * delvbs;
        close(cdhat, cd, tol) && close(cbhat, cb, tol)
    }

    fn tiene_union(&self) -> bool {
        true
    }

    fn junction_current(&self, s0: &[f64]) -> f64 {
        s0[self.st + CBD].abs().max(s0[self.st + CBS].abs())
    }

    fn trunc(&self, h: &Hist, dt: &mut f64) {
        if self.cgs > 0.0 {
            terr(h, self.st + QGS, dt);
        }
        if self.cgd > 0.0 {
            terr(h, self.st + QGD, dt);
        }
    }

    fn reading(&self, _x: &[f64], s0: &[f64]) -> Reading {
        let s = self.st;
        let (vgs, vds) = (s0[s + VGS], s0[s + VDS]);
        let (vg, vd) = if vds >= 0.0 { (vgs, vds) } else { (vgs - vds, -vds) };
        let vgst = vg - self.von;
        let region = if vgst <= 0.0 { 0.0 } else if vgst <= vd { 2.0 } else { 1.0 };
        Reading { i: self.tipo * (s0[s + CD] - s0[s + QGD + 1]), aux: 0.0, estado: region }
    }

    /// Entra Id por el drenador (la de su lectura, como `@m[id]` de ngspice) y la de sus capacitancias de traslape
    /// por la compuerta; la suma sale por la fuente, que también es el sustrato.
    fn corrientes_propias(&self) -> bool {
        true
    }

    fn corrientes(&self, _x: &[f64], s0: &[f64], r: &Reading, out: &mut [f64]) {
        let s = self.st;
        let ig = self.tipo * (s0[s + QGS + 1] + s0[s + QGD + 1]);
        out[0] = r.i;
        out[1] = ig;
        out[2] = -(r.i + ig);
        out[3] = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use crate::{Netlist, Transient};

    /// MOSFET con la compuerta a `vg` y 100 Ω al drenador desde 12 V (o -12 V el de canal P).
    fn con_compuerta(vg: f64, pmos: bool) -> Transient {
        let (vdd, vg) = if pmos { (-12.0, -vg) } else { (12.0, vg) };
        let json = format!(r#"{{"nodes":4,"elements":[
            {{"type":"V","a":1,"b":0,"wave":{{"kind":"dc","v":{vdd}}}}},
            {{"type":"V","a":2,"b":0,"wave":{{"kind":"dc","v":{vg}}}}},
            {{"type":"R","a":1,"b":3,"ohms":100}},
            {{"type":"M","d":3,"g":2,"s":0,"pmos":{pmos},"model":{{"vto":{},"kp":0.18,"lambda":0.02,"rd":0.3,"rs":0.2,"cbd":34e-12,"is":1e-15,"cgso":15e-12,"cgdo":5e-12,"w":1,"l":1}}}}]}}"#,
            if pmos { -2.1 } else { 2.1 });
        let mut tr = Transient::new(Netlist::from_json(&json).unwrap(), 1e-6).unwrap();
        tr.advance_to(1e-4, u32::MAX).unwrap();
        tr
    }

    #[test]
    fn regiones_del_mosfet() {
        // Apagado, en saturación (2.6 V: 22 mA, Vds cerca de 10 V) y en la región lineal (10 V: casi 12 V en la R).
        assert_eq!(con_compuerta(1.0, false).readings()[3].estado, 0.0);
        let sat = con_compuerta(2.6, false);
        assert_eq!(sat.readings()[3].estado, 2.0);
        let id = 0.09 * 0.5f64.powi(2);
        assert!((sat.readings()[3].i - id).abs() / id < 0.25, "id = {}", sat.readings()[3].i);
        let lin = con_compuerta(10.0, false);
        assert_eq!(lin.readings()[3].estado, 1.0);
        assert!(lin.voltage(3) < 0.5, "vds = {}", lin.voltage(3));
    }

    #[test]
    fn el_canal_p_es_el_espejo_del_n() {
        let (n, p) = (con_compuerta(2.6, false), con_compuerta(2.6, true));
        assert!((n.voltage(3) + p.voltage(3)).abs() < 1e-9, "{} {}", n.voltage(3), p.voltage(3));
        assert_eq!(p.readings()[3].estado, 2.0);
    }

    #[test]
    fn el_diodo_de_cuerpo_conduce_al_invertir_el_drenador() {
        // Con el drenador 1 mA por debajo de la fuente, conduce el diodo de cuerpo: unos 0.6 V.
        let json = r#"{"nodes":2,"elements":[
            {"type":"I","a":1,"b":0,"amps":1e-3},
            {"type":"M","d":1,"g":0,"s":0,"model":{"vto":2.1,"kp":0.18,"is":1e-15}}]}"#;
        let mut tr = Transient::new(Netlist::from_json(json).unwrap(), 1e-6).unwrap();
        tr.advance_to(1e-4, u32::MAX).unwrap();
        assert!(tr.voltage(1) < -0.5 && tr.voltage(1) > -0.75, "v = {}", tr.voltage(1));
    }
}
