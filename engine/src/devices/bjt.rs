//! Transistor bipolar Gummel-Poon de SPICE (bjtload.c y bjttemp.c de ngspice a 27 °C): efecto Early, caída de beta, fugas, resistencias, capacitancias de agotamiento y tiempos de tránsito. Sin sustrato ni exceso de fase.

use super::region::{AMPLIFICA, CORTE, INTERRUPTOR, INVERSA};
use super::{close, depletion, exp_tope, limexp, MAX_EXP_ARG, entry, init_charge, init_current, integrate, inject, pnjlim, predict, stamp_g, terr, volt, Alloc, Ctx, Device, Hist, Mode, Reading, Tol, U, VT};
use crate::netlist::BjtModel;

/// Voltaje de unión (V) a partir del cual se la cuenta en directo para decir la región.
const UMBRAL_REGION: f64 = 0.5;
/// Piso del denominador del efecto Early (1 - vbc/vaf - vbe/var), sin efecto en los estados normales (vale 0.99 o más).
const DENOMINADOR_MIN: f64 = 0.01;

#[derive(Clone)]
pub struct Bjt {
    c: usize,
    b: usize,
    e: usize,
    /// +1 NPN, -1 PNP.
    tipo: f64,
    m: BjtModel,
    uc: U,
    ub: U,
    ue: U,
    /// Colector, base y emisor internos (los mismos externos si su resistencia es cero).
    ucp: U,
    ubp: U,
    uep: U,
    st: usize,
    vcrit: f64,
    gcpr: f64,
    gepr: f64,
    inv_vaf: f64,
    inv_var: f64,
    inv_ikf: f64,
    inv_ikr: f64,
    /// Exponentes donde la exponencial de cada corriente de saturación pasa a línea recta.
    tope_is: f64,
    tope_ise: f64,
    tope_isc: f64,
    /// 1 / (1.44 vtf), o cero si vtf es infinito.
    ovtf: f64,
}

// Casillas de estado.
const VBE: usize = 0;
const VBC: usize = 1;
const QBE: usize = 2;
const QBC: usize = 4;
const QBX: usize = 6;
const CC: usize = 8;
const CB: usize = 9;
const GPI: usize = 10;
const GMU: usize = 11;
const GM: usize = 12;
const GO: usize = 13;

fn inv(v: f64) -> f64 {
    if v != 0.0 { 1.0 / v } else { 0.0 }
}

impl Bjt {
    pub fn new(c: usize, b: usize, e: usize, pnp: bool, m: BjtModel) -> Self {
        let vcrit = VT * (VT / (std::f64::consts::SQRT_2 * m.is)).ln();
        Self {
            c,
            b,
            e,
            tipo: if pnp { -1.0 } else { 1.0 },
            uc: None,
            ub: None,
            ue: None,
            ucp: None,
            ubp: None,
            uep: None,
            st: 0,
            vcrit,
            gcpr: inv(m.rc),
            gepr: inv(m.re),
            inv_vaf: inv(m.vaf),
            inv_var: inv(m.var),
            inv_ikf: inv(m.ikf),
            inv_ikr: inv(m.ikr),
            tope_is: exp_tope(m.is),
            tope_ise: exp_tope(m.ise),
            tope_isc: exp_tope(m.isc),
            ovtf: if m.vtf != 0.0 { 1.0 / (m.vtf * 1.44) } else { 0.0 },
            m,
        }
    }

    /// Corriente y conductancia de una unión con su ley exponencial y la cola cúbica en inversa.
    fn junction(is: f64, vtn: f64, v: f64, tope: f64) -> (f64, f64) {
        if is == 0.0 {
            return (0.0, 0.0);
        }
        if v >= -3.0 * vtn {
            let (ev, dev) = limexp(v / vtn, tope);
            (is * (ev - 1.0), is * dev / vtn)
        } else {
            let arg = 3.0 * vtn / (v * std::f64::consts::E);
            let arg = arg * arg * arg;
            (-is * (1.0 + arg), is * 3.0 * arg / v)
        }
    }

    fn rbm(&self) -> f64 {
        self.m.rbm.unwrap_or(self.m.rb)
    }
}

impl Device for Bjt {
    /// No redefine `accept`: el motor no se lo pide.
    fn usa_accept(&self) -> bool {
        false
    }
    fn bind(&mut self, a: &mut Alloc) {
        self.uc = a.ext(self.c);
        self.ub = a.ext(self.b);
        self.ue = a.ext(self.e);
        self.ucp = a.node_if(self.m.rc > 0.0, self.uc);
        self.ubp = a.node_if(self.m.rb > 0.0, self.ub);
        self.uep = a.node_if(self.m.re > 0.0, self.ue);
        self.st = a.states(14);
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        let s = self.st;
        let m = &self.m;
        let tipo = self.tipo;
        let vt = VT;
        let x = c.x;
        let mut icheck = false;
        let vbx = tipo * (volt(x, self.ub) - volt(x, self.ucp));
        let (vbe, vbc, vbx) = match c.mode {
            // Con `uic`, el instante 0 tiene todo en cero.
            Mode::InitTran => (c.s1[s + VBE], c.s1[s + VBC], 0.0),
            Mode::Pred | Mode::Float => {
                let (vbe, vbc) = if c.mode == Mode::Pred {
                    (predict(c, s + VBE), predict(c, s + VBC))
                } else {
                    (tipo * (volt(x, self.ubp) - volt(x, self.uep)), tipo * (volt(x, self.ubp) - volt(x, self.ucp)))
                };
                let (vbe, l1) = pnjlim(vbe, c.s0[s + VBE], vt, self.vcrit);
                let (vbc, l2) = pnjlim(vbc, c.s0[s + VBC], vt, self.vcrit);
                icheck = l1 || l2;
                (vbe, vbc, vbx)
            }
        };
        // Corrientes de continua y sus derivadas.
        let (mut cbe, mut gbe) = Self::junction(m.is, vt * m.nf, vbe, self.tope_is);
        let (mut cben, mut gben) = Self::junction(m.ise, vt * m.ne, vbe, self.tope_ise);
        gben += c.gmin;
        cben += c.gmin * vbe;
        let (cbc, gbc) = Self::junction(m.is, vt * m.nr, vbc, self.tope_is);
        let (mut cbcn, mut gbcn) = Self::junction(m.isc, vt * m.nc, vbc, self.tope_isc);
        gbcn += c.gmin;
        cbcn += c.gmin * vbc;
        // Carga de base normalizada: Early y alta inyección.
        // El denominador no baja de 0.01: con vaf o var de pocos volts y una unión forzada llegaría a cero o cambiaría de signo.
        let q1 = 1.0 / (1.0 - self.inv_vaf * vbc - self.inv_var * vbe).max(DENOMINADOR_MIN);
        let (qb, dqbdve, dqbdvc) = if self.inv_ikf == 0.0 && self.inv_ikr == 0.0 {
            (q1, q1 * q1 * self.inv_var, q1 * q1 * self.inv_vaf)
        } else {
            let q2 = self.inv_ikf * cbe + self.inv_ikr * cbc;
            let arg = (1.0 + 4.0 * q2).max(0.0);
            let sqarg = if arg != 0.0 { arg.sqrt() } else { 1.0 };
            let qb = q1 * (1.0 + sqarg) / 2.0;
            (qb, q1 * (qb * self.inv_var + self.inv_ikf * gbe / sqarg), q1 * (qb * self.inv_vaf + self.inv_ikr * gbc / sqarg))
        };
        let (cex, gex) = (cbe, gbe);
        let mut cc = (cex - cbc) / qb - cbc / m.br - cbcn;
        let mut cb = cbe / m.bf + cben + cbc / m.br + cbcn;
        let rbm = self.rbm();
        let rbpi = m.rb - rbm;
        let mut gx = rbm + rbpi / qb;
        if m.irb != 0.0 {
            let arg1 = (cb / m.irb).max(1e-9);
            let arg2 = (-1.0 + (1.0 + 14.59025 * arg1).sqrt()) / 2.4317 / arg1.sqrt();
            let arg1 = arg2.tan();
            gx = rbm + 3.0 * rbpi * (arg1 - arg2) / arg2 / arg1 / arg1;
        }
        if gx != 0.0 {
            gx = 1.0 / gx;
        }
        let mut gpi = gbe / m.bf + gben;
        let mut gmu = gbc / m.br + gbcn;
        let go = (gbc + (cex - cbc) * dqbdvc / qb) / qb;
        let gm = (gex - (cex - cbc) * dqbdve / qb) / qb - go;
        // Cargas: tiempo de tránsito directo con su modulación, agotamiento de las uniones.
        let mut geqcb = 0.0;
        if m.tf != 0.0 && vbe > 0.0 {
            let (mut argtf, mut arg2, mut arg3) = (0.0, 0.0, 0.0);
            if m.xtf != 0.0 {
                argtf = m.xtf;
                if self.ovtf != 0.0 {
                    argtf *= (vbc * self.ovtf).min(MAX_EXP_ARG).exp();
                }
                arg2 = argtf;
                if m.itf != 0.0 {
                    let temp = cbe / (cbe + m.itf);
                    argtf = argtf * temp * temp;
                    arg2 = argtf * (3.0 - temp - temp);
                }
                arg3 = cbe * argtf * self.ovtf;
            }
            cbe = cbe * (1.0 + argtf) / qb;
            gbe = (gbe * (1.0 + arg2) - cbe * dqbdve) / qb;
            geqcb = m.tf * (arg3 - cbe * dqbdvc) / qb;
        }
        let czbc = m.cjc * m.xcjc;
        let czbx = m.cjc - czbc;
        let (qd, cd) = depletion(vbe, m.cje, m.vje, m.mje, m.fc);
        c.s0[s + QBE] = m.tf * cbe + qd;
        let capbe = m.tf * gbe + cd;
        let (qd, cd) = depletion(vbc, czbc, m.vjc, m.mjc, m.fc);
        c.s0[s + QBC] = m.tr * cbc + qd;
        let capbc = m.tr * gbc + cd;
        let (qd, capbx) = depletion(vbx, czbx, m.vjc, m.mjc, m.fc);
        c.s0[s + QBX] = qd;
        for q in [QBE, QBC, QBX] {
            init_charge(c, s + q);
        }
        let (geq, _) = integrate(c, capbe, s + QBE);
        geqcb *= c.ag0;
        gpi += geq;
        cb += c.s0[s + QBE + 1];
        let (geq, _) = integrate(c, capbc, s + QBC);
        gmu += geq;
        cb += c.s0[s + QBC + 1];
        cc -= c.s0[s + QBC + 1];
        let (geqbx, _) = integrate(c, capbx, s + QBX);
        for q in [QBE, QBC, QBX] {
            init_current(c, s + q);
        }
        c.s0[s + VBE] = vbe;
        c.s0[s + VBC] = vbc;
        c.s0[s + CC] = cc;
        c.s0[s + CB] = cb;
        c.s0[s + GPI] = gpi;
        c.s0[s + GMU] = gmu;
        c.s0[s + GM] = gm;
        c.s0[s + GO] = go;
        // Lado derecho.
        let ceqbx = tipo * (c.s0[s + QBX + 1] - vbx * geqbx);
        let ceqbe = tipo * (cc + cb - vbe * (gm + go + gpi) + vbc * (go - geqcb));
        let ceqbc = tipo * (-cc + vbe * (gm + go) - vbc * (gmu + go));
        inject(c.rhs, self.ub, -ceqbx);
        inject(c.rhs, self.ucp, ceqbx + ceqbc);
        inject(c.rhs, self.ubp, -ceqbe - ceqbc);
        inject(c.rhs, self.uep, ceqbe);
        // Matriz.
        let (cx, bx, ex, cp, bp, ep) = (self.uc, self.ub, self.ue, self.ucp, self.ubp, self.uep);
        let mm = &mut *c.m;
        stamp_g(mm, cx, cp, self.gcpr);
        stamp_g(mm, ex, ep, self.gepr);
        stamp_g(mm, bx, bp, gx);
        stamp_g(mm, bx, cp, geqbx);
        entry(mm, bp, bp, gpi + gmu + geqcb);
        entry(mm, cp, cp, gmu + go);
        entry(mm, ep, ep, gpi + gm + go);
        entry(mm, cp, bp, -gmu + gm);
        entry(mm, cp, ep, -gm - go);
        entry(mm, bp, cp, -gmu - geqcb);
        entry(mm, bp, ep, -gpi);
        entry(mm, ep, cp, -go + geqcb);
        entry(mm, ep, bp, -gpi - gm - geqcb);
        icheck
    }

    fn converged(&self, x: &[f64], s0: &[f64], tol: &Tol) -> bool {
        let s = self.st;
        let delvbe = self.tipo * (volt(x, self.ubp) - volt(x, self.uep)) - s0[s + VBE];
        let delvbc = self.tipo * (volt(x, self.ubp) - volt(x, self.ucp)) - s0[s + VBC];
        let (cc, cb) = (s0[s + CC], s0[s + CB]);
        let cchat = cc + (s0[s + GM] + s0[s + GO]) * delvbe - (s0[s + GO] + s0[s + GMU]) * delvbc;
        let cbhat = cb + s0[s + GPI] * delvbe + s0[s + GMU] * delvbc;
        close(cchat, cc, tol) && close(cbhat, cb, tol)
    }

    fn trunc(&self, h: &Hist, dt: &mut f64) {
        terr(h, self.st + QBE, dt);
        terr(h, self.st + QBC, dt);
    }

    fn tiene_union(&self) -> bool {
        true
    }

    fn junction_current(&self, s0: &[f64]) -> f64 {
        s0[self.st + CC].abs().max(s0[self.st + CB].abs())
    }

    fn reading(&self, _x: &[f64], s0: &[f64]) -> Reading {
        let s = self.st;
        let cqbx = s0[s + QBX + 1];
        let (vbe, vbc) = (s0[s + VBE], s0[s + VBC]);
        let region = match (vbe >= UMBRAL_REGION, vbc >= UMBRAL_REGION) {
            (false, false) => CORTE,
            (true, false) => AMPLIFICA,
            (true, true) => INTERRUPTOR,
            (false, true) => INVERSA,
        };
        Reading { i: self.tipo * (s0[s + CC] - cqbx), aux: self.tipo * (s0[s + CB] + cqbx), estado: region }
    }

    /// Entran Ic por el colector e Ib por la base (las de su lectura, como `@q[ic]` e `@q[ib]` de ngspice) y sale
    /// su suma por el emisor.
    fn corrientes_propias(&self) -> bool {
        true
    }

    fn corrientes(&self, _x: &[f64], _s0: &[f64], r: &Reading, out: &mut [f64]) {
        out[0] = r.i;
        out[1] = r.aux;
        out[2] = -(r.i + r.aux);
        out[3] = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use crate::{Netlist, Transient};

    /// 2N2222 con la base alimentada por `rb` desde 5 V y 1 kΩ en el colector a 10 V.
    fn con_base(rb: f64, pnp: bool) -> Transient {
        let (v1, v2) = if pnp { (-10.0, -5.0) } else { (10.0, 5.0) };
        let json = format!(r#"{{"nodes":5,"elements":[
            {{"type":"V","a":1,"b":0,"wave":{{"kind":"dc","v":{v1}}}}},
            {{"type":"V","a":2,"b":0,"wave":{{"kind":"dc","v":{v2}}}}},
            {{"type":"R","a":1,"b":3,"ohms":1000}},
            {{"type":"R","a":2,"b":4,"ohms":{rb}}},
            {{"type":"Q","c":3,"b":4,"e":0,"pnp":{pnp},"model":{{"is":14.34e-15,"bf":255.9,"vaf":74.03,"ikf":0.2847,"ise":14.34e-15,"ne":1.307,"br":6.092,"rb":10,"rc":1}}}}]}}"#);
        let mut tr = Transient::new(Netlist::from_json(&json).unwrap(), 1e-6).unwrap();
        tr.advance_to(1e-4, u32::MAX).unwrap();
        tr
    }

    #[test]
    fn lecturas_y_regiones_del_npn() {
        // Activa: 1 MΩ en la base (4.3 µA), el colector lejos de la saturación.
        let tr = con_base(1e6, false);
        let r = tr.readings()[4];
        assert_eq!(r.estado, 1.0, "{r:?}");
        let beta = r.i / r.aux;
        assert!(r.aux > 4e-6 && r.aux < 4.5e-6, "ib = {}", r.aux);
        assert!(beta > 150.0 && beta < 400.0, "beta = {beta}");
        // La corriente de colector es la de la resistencia de 1 kΩ.
        assert!((r.i - (10.0 - tr.voltage(3)) / 1000.0).abs() < 1e-9);
        // Saturación: 1 kΩ en la base, el colector a unas décimas de volt.
        let tr = con_base(1e3, false);
        assert_eq!(tr.readings()[4].estado, 2.0);
        assert!(tr.voltage(3) < 0.3, "vce = {}", tr.voltage(3));
    }

    #[test]
    fn el_pnp_es_el_espejo_del_npn() {
        let (n, p) = (con_base(1e6, false), con_base(1e6, true));
        assert!((n.voltage(3) + p.voltage(3)).abs() < 1e-9, "{} {}", n.voltage(3), p.voltage(3));
        assert!((n.readings()[4].i + p.readings()[4].i).abs() < 1e-12);
        assert_eq!(p.readings()[4].estado, 1.0);
    }

    #[test]
    fn en_corte_no_conduce() {
        let json = r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":10}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"Q","c":2,"b":0,"e":0}]}"#;
        let mut tr = Transient::new(Netlist::from_json(json).unwrap(), 1e-6).unwrap();
        tr.advance_to(1e-4, u32::MAX).unwrap();
        assert_eq!(tr.readings()[2].estado, 0.0);
        assert!(tr.readings()[2].i.abs() < 1e-9);
    }
}
