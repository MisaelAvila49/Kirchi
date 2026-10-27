//! Fuentes controladas lineales E, G, H y F (vcvs, vccs, ccvs y cccs de ngspice). Las de control por corriente miden la
//! corriente con una rama de 0 V entre `cp` y `cn`, como las fuentes de voltaje de SPICE.

use super::{entry, stamp_vccs, volt, Alloc, Ctx, Device, Reading, U};
use crate::netlist::Element;

#[derive(Clone, Copy, PartialEq)]
enum Tipo {
    E,
    G,
    H,
    F,
}

#[derive(Clone)]
pub struct Controlada {
    tipo: Tipo,
    p: usize,
    n: usize,
    cp: usize,
    cn: usize,
    /// Ganancia de E y F, transconductancia de G o transresistencia de H.
    k: f64,
    up: U,
    un: U,
    ucp: U,
    ucn: U,
    /// Rama de salida (E y H) y rama de control de 0 V (H y F).
    salida: usize,
    control: usize,
}

impl Controlada {
    pub fn nueva(e: &Element) -> Self {
        let (tipo, p, n, cp, cn, k) = match *e {
            Element::E { p, n, cp, cn, ganancia } => (Tipo::E, p, n, cp, cn, ganancia),
            Element::G { p, n, cp, cn, gm } => (Tipo::G, p, n, cp, cn, gm),
            Element::H { p, n, cp, cn, r } => (Tipo::H, p, n, cp, cn, r),
            Element::F { p, n, cp, cn, ganancia } => (Tipo::F, p, n, cp, cn, ganancia),
            _ => unreachable!("Controlada solo se construye con E, G, H o F"),
        };
        Self { tipo, p, n, cp, cn, k, up: None, un: None, ucp: None, ucn: None, salida: 0, control: 0 }
    }

    fn controla_por_corriente(&self) -> bool {
        matches!(self.tipo, Tipo::H | Tipo::F)
    }

    fn con_rama_de_salida(&self) -> bool {
        matches!(self.tipo, Tipo::E | Tipo::H)
    }

    /// Corriente de salida (de `p` a `n` por dentro) y corriente de control con la solución `x`.
    fn corrientes_de(&self, x: &[f64]) -> (f64, f64) {
        let ic = if self.controla_por_corriente() { x[self.control] } else { 0.0 };
        let i = match self.tipo {
            Tipo::E | Tipo::H => x[self.salida],
            Tipo::G => self.k * (volt(x, self.ucp) - volt(x, self.ucn)),
            Tipo::F => self.k * ic,
        };
        (i, ic)
    }
}

impl Device for Controlada {
    /// No redefine `accept`: el motor no se lo pide.
    fn usa_accept(&self) -> bool {
        false
    }
    fn bind(&mut self, a: &mut Alloc) {
        self.up = a.ext(self.p);
        self.un = a.ext(self.n);
        self.ucp = a.ext(self.cp);
        self.ucn = a.ext(self.cn);
        if self.con_rama_de_salida() {
            self.salida = a.branch();
        }
        if self.controla_por_corriente() {
            self.control = a.branch();
        }
    }
    fn load(&mut self, c: &mut Ctx) -> bool {
        let (up, un, ucp, ucn) = (self.up, self.un, self.ucp, self.ucn);
        if self.controla_por_corriente() {
            let rc = Some(self.control);
            entry(c.m, ucp, rc, 1.0);
            entry(c.m, ucn, rc, -1.0);
            entry(c.m, rc, ucp, 1.0);
            entry(c.m, rc, ucn, -1.0);
        }
        if self.con_rama_de_salida() {
            let rs = Some(self.salida);
            entry(c.m, up, rs, 1.0);
            entry(c.m, un, rs, -1.0);
            entry(c.m, rs, up, 1.0);
            entry(c.m, rs, un, -1.0);
            if self.tipo == Tipo::E {
                entry(c.m, rs, ucp, -self.k);
                entry(c.m, rs, ucn, self.k);
            } else {
                entry(c.m, rs, Some(self.control), -self.k);
            }
        } else if self.tipo == Tipo::G {
            stamp_vccs(c.m, up, un, ucp, ucn, self.k);
        } else {
            let rc = Some(self.control);
            entry(c.m, up, rc, self.k);
            entry(c.m, un, rc, -self.k);
        }
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
        let (i, ic) = self.corrientes_de(x);
        Reading { i, aux: ic, ..Reading::default() }
    }
    /// Entra `i` por `p` y sale por `n`; el control entra por `cp` y sale por `cn`. La casilla de tierra queda en cero.
    fn corrientes_propias(&self) -> bool {
        true
    }
    fn corrientes(&self, x: &[f64], _s0: &[f64], _r: &Reading, out: &mut [f64]) {
        let (i, ic) = self.corrientes_de(x);
        out[0] = i;
        out[1] = -i;
        out[2] = ic;
        out[3] = -ic;
        out[4] = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use crate::{EngineError, Netlist, Transient};

    fn corre(json: &str) -> Result<Transient, EngineError> {
        let mut tr = Transient::new(Netlist::from_json(json).unwrap(), 1e-4)?;
        tr.advance_to(1e-3, u32::MAX)?;
        Ok(tr)
    }

    fn cerca(a: f64, b: f64) {
        assert!((a - b).abs() < 1e-9, "{a} contra {b}");
    }

    #[test]
    fn e_multiplica_el_voltaje_de_control() {
        // V(2) = 3 · 5 V con 1 kΩ de carga: la rama de E entrega 15 mA.
        let tr = corre(r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
            {"type":"E","p":2,"n":0,"cp":1,"cn":0,"ganancia":3},
            {"type":"R","a":2,"b":0,"ohms":1000}]}"#).unwrap();
        cerca(tr.voltage(2), 15.0);
        cerca(tr.readings()[1].i, -0.015);
        cerca(tr.readings()[1].aux, 0.0);
    }

    #[test]
    fn g_inyecta_corriente_proporcional_al_voltaje() {
        // 5 mS por 2 V son 10 mA de p a n por dentro: sacan 10 V de la carga de 1 kΩ.
        let tr = corre(r#"{"nodes":3,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":2}},
            {"type":"G","p":2,"n":0,"cp":1,"cn":0,"gm":0.005},
            {"type":"R","a":2,"b":0,"ohms":1000}]}"#).unwrap();
        cerca(tr.voltage(2), -10.0);
        cerca(tr.readings()[1].i, 0.01);
    }

    #[test]
    fn h_da_voltaje_proporcional_a_la_corriente_que_pasa_por_su_control() {
        // 2 V sobre 1 kΩ hacen pasar 2 mA por el control (cp = 2, cn = tierra); H de 1 kΩ da 2 V.
        let tr = corre(r#"{"nodes":4,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":2}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"H","p":3,"n":0,"cp":2,"cn":0,"r":1000},
            {"type":"R","a":3,"b":0,"ohms":1000}]}"#).unwrap();
        cerca(tr.voltage(3), 2.0);
        cerca(tr.voltage(2), 0.0);
        cerca(tr.readings()[2].aux, 0.002);
    }

    #[test]
    fn f_copia_la_corriente_de_control_multiplicada() {
        // 2 mA por el control, ganancia 5: 10 mA que salen del nodo 3 y dejan -10 V sobre 1 kΩ.
        let tr = corre(r#"{"nodes":4,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":2}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"F","p":3,"n":0,"cp":2,"cn":0,"ganancia":5},
            {"type":"R","a":3,"b":0,"ohms":1000}]}"#).unwrap();
        cerca(tr.voltage(3), -10.0);
        cerca(tr.readings()[2].aux, 0.002);
        cerca(tr.readings()[2].i, 0.01);
    }

    #[test]
    fn e_de_ganancia_enorme_es_un_amplificador_ideal() {
        // No inversor con Rf = 9 kΩ y Rg = 1 kΩ: V(3) = A / (1 + A / 10) con A = 1e6.
        let tr = corre(r#"{"nodes":4,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":1}},
            {"type":"E","p":3,"n":0,"cp":1,"cn":2,"ganancia":1e6},
            {"type":"R","a":3,"b":2,"ohms":9000},
            {"type":"R","a":2,"b":0,"ohms":1000}]}"#).unwrap();
        cerca(tr.voltage(3), 1e6 / (1.0 + 1e6 / 10.0));
    }

    #[test]
    fn e_realimentada_a_si_misma_con_ganancia_uno_es_singular() {
        let e = corre(r#"{"nodes":2,"elements":[
            {"type":"R","a":1,"b":0,"ohms":1000},
            {"type":"E","p":1,"n":0,"cp":1,"cn":0,"ganancia":1}]}"#).err().expect("debe fallar");
        assert_eq!(e, EngineError::Singular { element: Some(1) });
    }
}
