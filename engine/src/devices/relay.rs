//! Relé de un polo y dos tiros: bobina `r` con inductancia `l`. El contacto cierra con el normalmente abierto cuando la corriente llega a `ion` y vuelve al cerrado al bajar de `ioff` (histéresis). Cuenta la magnitud: la bobina no tiene polaridad.

use super::fuse::R_ABIERTO;
use super::{entry, init_charge, init_current, integrate, stamp_g, terr, volt, Alloc, Ctx, Device, Event, Hist, Mode, Reading, U};

/// Resistencia del contacto cerrado: la de un interruptor cerrado.
pub const R_CERRADO: f64 = 1e-3;
/// Tiempo mínimo (s) entre dos cambios del contacto: lo que tarda en moverse la armadura (los relés pequeños operan y
/// liberan en 1 a 10 ms). Sin él, un relé que corta su propia bobina conmutaría en cada paso.
pub const TIEMPO_MINIMO_CONTACTO: f64 = 1e-3;

#[derive(Clone)]
pub struct Relay {
    a1: usize,
    a2: usize,
    com: usize,
    na: usize,
    nc: usize,
    r: f64,
    l: f64,
    ion: f64,
    ioff: f64,
    ua1: U,
    ua2: U,
    ucom: U,
    una: U,
    unc: U,
    br: usize,
    st: usize,
    activado: bool,
    /// Instante del último cambio del contacto.
    ultimo_cambio: f64,
    /// Las resistencias de los contactos con que se resolvió el último paso (al aceptarlo el contacto puede cambiar,
    /// y las corrientes por terminal de ese paso son las de la solución) y el cambio que se oye (un clic).
    paso: (f64, f64),
    cambio: Option<(u8, f64)>,
}

impl Relay {
    #[allow(clippy::too_many_arguments)]
    pub fn new(a1: usize, a2: usize, com: usize, na: usize, nc: usize, r: f64, l: f64, ion: f64, ioff: f64) -> Self {
        Self { a1, a2, com, na, nc, r, l, ion, ioff, ua1: None, ua2: None, ucom: None, una: None, unc: None, br: 0, st: 0, activado: false, ultimo_cambio: f64::NEG_INFINITY, paso: (R_ABIERTO, R_CERRADO), cambio: None }
    }

    /// Resistencias de común a normalmente abierto y de común a normalmente cerrado.
    fn contacts(&self) -> (f64, f64) {
        if self.activado { (R_CERRADO, R_ABIERTO) } else { (R_ABIERTO, R_CERRADO) }
    }
}

impl Device for Relay {
    fn bind(&mut self, a: &mut Alloc) {
        self.ua1 = a.ext(self.a1);
        self.ua2 = a.ext(self.a2);
        self.ucom = a.ext(self.com);
        self.una = a.ext(self.na);
        self.unc = a.ext(self.nc);
        self.br = a.branch();
        self.st = a.states(2);
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        let s = self.st;
        let br = Some(self.br);
        if c.mode == Mode::Pred {
            c.s0[s] = c.s1[s];
        } else {
            c.s0[s] = self.l * c.x[self.br];
            init_charge(c, s);
        }
        let (req, veq) = integrate(c, self.l, s);
        init_current(c, s);
        entry(c.m, self.ua1, br, 1.0);
        entry(c.m, self.ua2, br, -1.0);
        entry(c.m, br, self.ua1, 1.0);
        entry(c.m, br, self.ua2, -1.0);
        entry(c.m, br, br, -(self.r + req));
        c.rhs[self.br] += veq;
        let (rna, rnc) = self.contacts();
        self.paso = (rna, rnc);
        stamp_g(c.m, self.ucom, self.una, 1.0 / rna);
        stamp_g(c.m, self.ucom, self.unc, 1.0 / rnc);
        false
    }

    fn trunc(&self, h: &Hist, dt: &mut f64) {
        terr(h, self.st, dt);
    }

    fn linear(&self) -> bool {
        true
    }

    fn accept(&mut self, x: &[f64], _s0: &[f64], t: f64, _h: f64, _ev: &mut Vec<Event>) -> bool {
        let i = x[self.br].abs();
        let quiere = if i >= self.ion {
            true
        } else if i <= self.ioff {
            false
        } else {
            self.activado
        };
        if quiere != self.activado && t - self.ultimo_cambio >= TIEMPO_MINIMO_CONTACTO {
            self.activado = quiere;
            self.ultimo_cambio = t;
            self.cambio = Some((u8::from(quiere), t));
            return true;
        }
        false
    }

    /// Corriente de la bobina; en `aux`, la del contacto que está cerrado (del común hacia él); en `estado`, 1 si el
    /// común está con el normalmente abierto.
    fn reading(&self, x: &[f64], _s0: &[f64]) -> Reading {
        let destino = if self.activado { self.una } else { self.unc };
        let contacto = (volt(x, self.ucom) - volt(x, destino)) / R_CERRADO;
        Reading { i: x[self.br], aux: contacto, estado: if self.activado { 1.0 } else { 0.0 } }
    }

    /// La bobina entra por A1 y sale por A2; el común da lo que pasa por los dos contactos, con las resistencias con
    /// que se resolvió el paso (no las del contacto que el paso acaba de mover).
    fn corrientes_propias(&self) -> bool {
        true
    }

    fn corrientes(&self, x: &[f64], _s0: &[f64], _r: &Reading, out: &mut [f64]) {
        let ib = x[self.br];
        let vc = volt(x, self.ucom);
        let (ina, inc) = ((vc - volt(x, self.una)) / self.paso.0, (vc - volt(x, self.unc)) / self.paso.1);
        out[0] = ib;
        out[1] = -ib;
        out[2] = ina + inc;
        out[3] = -ina;
        out[4] = -inc;
        out[5] = 0.0;
    }

    fn tiene_estado(&self) -> bool {
        true
    }

    fn tomar_estado(&mut self) -> Option<(u8, f64)> {
        self.cambio.take()
    }
}

#[cfg(test)]
mod tests {
    use crate::{Netlist, Transient};

    /// Relé de 5 V (69.4 Ω, 208 mH: opera con 54 mA y libera con 7.2 mA) con la bobina en `v` voltios y 100 Ω en
    /// cada contacto desde el común a 5 V.
    fn rele(v: f64) -> Transient {
        let json = format!(r#"{{"nodes":5,"elements":[
            {{"type":"V","a":1,"b":0,"wave":{{"kind":"dc","v":5}}}},
            {{"type":"V","a":2,"b":0,"wave":{{"kind":"dc","v":{v}}}}},
            {{"type":"RELAY","a1":2,"a2":0,"com":1,"na":3,"nc":4,"r":69.444,"l":0.20833,"ion":0.054,"ioff":0.0072}},
            {{"type":"R","a":3,"b":0,"ohms":100}},
            {{"type":"R","a":4,"b":0,"ohms":100}}]}}"#);
        let mut tr = Transient::new(Netlist::from_json(&json).unwrap(), 1e-5).unwrap();
        tr.advance_to(50e-3, u32::MAX).unwrap();
        tr
    }

    #[test]
    fn un_rele_que_se_corta_su_propia_bobina_no_conmuta_en_cada_paso() {
        // La bobina cuelga de su propio contacto normalmente cerrado y casi sin inductancia: al operar abre la
        // alimentación, al liberar vuelve a cerrarla, y sin un tiempo mínimo entre cambios del contacto conmutaría en
        // cada paso (200,000 pasos para 1.4e-7 s). Con el tiempo mínimo da un cambio por milisegundo.
        let json = r#"{"nodes":4,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
            {"type":"RELAY","a1":2,"a2":0,"com":1,"na":3,"nc":2,"r":69.444,"l":1e-12,"ion":0.054,"ioff":0.0072},
            {"type":"R","a":3,"b":0,"ohms":100}]}"#;
        let mut tr = Transient::new(Netlist::from_json(json).unwrap(), 1e-5).unwrap();
        tr.advance_to(0.05, u32::MAX).unwrap();
        assert!(tr.steps() < 20_000, "pasos = {}", tr.steps());
    }

    #[test]
    fn opera_con_el_voltaje_nominal() {
        let tr = rele(5.0);
        assert_eq!(tr.readings()[2].estado, 1.0);
        assert!((tr.voltage(3) - 5.0).abs() < 1e-3 && tr.voltage(4).abs() < 1e-3);
        assert!((tr.readings()[2].i - 5.0 / 69.444).abs() < 1e-4);
    }

    #[test]
    fn no_opera_por_debajo_del_voltaje_de_operacion() {
        // 3 V dan 43 mA: menos de los 54 mA de operación; sigue en normalmente cerrado.
        let tr = rele(3.0);
        assert_eq!(tr.readings()[2].estado, 0.0);
        assert!((tr.voltage(4) - 5.0).abs() < 1e-3);
    }

    #[test]
    fn la_histeresis_lo_deja_operado_entre_liberacion_y_operacion() {
        let mut tr = rele(5.0);
        // Con 2 V (29 mA) no vuelve: está entre los 7.2 mA de liberación y los 54 de operación.
        tr.set_element(1, crate::Element::V { a: 2, b: 0, wave: crate::Wave::Dc { v: 2.0 } }).unwrap();
        tr.advance_to(100e-3, u32::MAX).unwrap();
        assert_eq!(tr.readings()[2].estado, 1.0);
        // Con 0.3 V (4.3 mA) libera.
        tr.set_element(1, crate::Element::V { a: 2, b: 0, wave: crate::Wave::Dc { v: 0.3 } }).unwrap();
        tr.advance_to(150e-3, u32::MAX).unwrap();
        assert_eq!(tr.readings()[2].estado, 0.0);
    }
}
