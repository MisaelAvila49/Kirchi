//! Amplificador operacional de una etapa, con las ecuaciones del subcircuito `AMPOP` de `engine/referencias/modelos.lib`: entrada `rin`, nodo interno `x` con R1 = 1 MΩ y C1 (gm = a0/R1, polo en gbw/a0, imax = sr · C1) y saturación de `x` entre V- + dlo y V+ − dhi.
//! Salida limitada por ilim · tanh((V(x) − V(sal)) / (rout · ilim)), que sale de V+ al entregar y entra a V- al recibir. Consumo en reposo `rq` entre alimentaciones.

use super::{close, entry, init_charge, init_current, integrate, integrate_euler, inject, stamp_g, terr, volt, Alloc, Ctx, Device, Hist, Mode, Reading, Tol, U};
use crate::netlist::OpampModel;

/// Resistencia del nodo interno.
const R1: f64 = 1e6;
/// Suavizado del reparto de la corriente de salida entre las alimentaciones (A).
const IS_REPARTO: f64 = 1e-6;

#[derive(Clone)]
pub struct Opamp {
    p: usize,
    n: usize,
    out: usize,
    vp: usize,
    vn: usize,
    m: OpampModel,
    up: U,
    un: U,
    uo: U,
    uvp: U,
    uvn: U,
    ux: usize,
    st: usize,
    gm: f64,
    c1: f64,
    imax: f64,
    gc: f64,
    /// C1 con Euler hacia atrás también en los pasos de orden 2 (ver `integrate_euler`).
    euler: bool,
}

// Casillas de estado: carga de C1 y su corriente, y las corrientes de las fuentes en la última iteración.
const QX: usize = 0;
const IG: usize = 2;
const ICL: usize = 3;
const IOUT: usize = 4;

impl Opamp {
    pub fn new(p: usize, n: usize, out: usize, vp: usize, vn: usize, m: OpampModel, euler: bool) -> Self {
        let c1 = m.a0 / (2.0 * std::f64::consts::PI * m.gbw * R1);
        let imax = m.sr * c1;
        Self { p, n, out, vp, vn, up: None, un: None, uo: None, uvp: None, uvn: None, ux: 0, st: 0, gm: m.a0 / R1, c1, imax, gc: 1000.0 * imax, euler, m }
    }

    /// Corriente que la etapa de ganancia mete al nodo interno y su derivada respecto de vd.
    fn gain(&self, vd: f64) -> (f64, f64) {
        let t = (self.gm * vd / self.imax).tanh();
        (self.imax * t, self.gm * (1.0 - t * t))
    }

    /// Exceso del nodo interno sobre los topes: (sobre el de arriba, bajo el de abajo).
    fn excess(&self, x: f64, vp: f64, vn: f64) -> (f64, f64) {
        ((x - vp + self.m.dhi).max(0.0), (x - vn - self.m.dlo).min(0.0))
    }

    /// Corriente de salida (hacia el nodo de salida) y su derivada respecto de V(x) - V(sal).
    fn output(&self, w: f64) -> (f64, f64) {
        let t = (w / (self.m.rout * self.m.ilim)).tanh();
        (self.m.ilim * t, (1.0 - t * t) / self.m.rout)
    }

    /// La corriente de salida `io` repartida entre las alimentaciones: la que sale de V+ (entregando) y la que entra a V-
    /// (recibiendo, negativa), con el mismo suavizado que la estampa.
    fn reparto(io: f64) -> (f64, f64) {
        let raiz = (io * io + IS_REPARTO * IS_REPARTO).sqrt();
        (0.5 * (io + raiz), 0.5 * (io - raiz))
    }

    fn currents(&self, x: &[f64]) -> (f64, f64, f64) {
        let vd = volt(x, self.up) - volt(x, self.un);
        let vx = x[self.ux];
        let (hi, lo) = self.excess(vx, volt(x, self.uvp), volt(x, self.uvn));
        (self.gain(vd).0, self.gc * (hi + lo), self.output(vx - volt(x, self.uo)).0)
    }
}

impl Device for Opamp {
    /// No redefine `accept`: el motor no se lo pide.
    fn usa_accept(&self) -> bool {
        false
    }
    fn bind(&mut self, a: &mut Alloc) {
        self.up = a.ext(self.p);
        self.un = a.ext(self.n);
        self.uo = a.ext(self.out);
        self.uvp = a.ext(self.vp);
        self.uvn = a.ext(self.vn);
        self.ux = a.node();
        self.st = a.states(5);
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        let s = self.st;
        let x = Some(self.ux);
        let (vd, vx) = (volt(c.x, self.up) - volt(c.x, self.un), c.x[self.ux]);
        let (vvp, vvn, vo) = (volt(c.x, self.uvp), volt(c.x, self.uvn), volt(c.x, self.uo));
        // Entrada, consumo y nodo interno (R1 y C1).
        stamp_g(c.m, self.up, self.un, 1.0 / self.m.rin);
        stamp_g(c.m, self.uvp, self.uvn, 1.0 / self.m.rq);
        stamp_g(c.m, x, None, 1.0 / R1);
        if c.mode == Mode::Pred {
            c.s0[s + QX] = c.s1[s + QX];
        } else {
            c.s0[s + QX] = self.c1 * vx;
            init_charge(c, s + QX);
        }
        let (geq, ceq) = if self.euler { integrate_euler(c, self.c1, s + QX) } else { integrate(c, self.c1, s + QX) };
        init_current(c, s + QX);
        stamp_g(c.m, x, None, geq);
        inject(c.rhs, x, -ceq);
        // Etapa de ganancia: corriente hacia x que depende de vd.
        let (ig, g) = self.gain(vd);
        entry(c.m, x, self.up, -g);
        entry(c.m, x, self.un, g);
        inject(c.rhs, x, ig - g * vd);
        // Topes de x: conductancia gc hacia cada alimentación mientras se pasa.
        let (hi, lo) = self.excess(vx, vvp, vvn);
        let (h1, h2) = (if hi > 0.0 { 1.0 } else { 0.0 }, if lo < 0.0 { 1.0 } else { 0.0 });
        let gc = self.gc;
        entry(c.m, x, x, gc * (h1 + h2));
        entry(c.m, x, self.uvp, -gc * h1);
        entry(c.m, x, self.uvn, -gc * h2);
        inject(c.rhs, x, -gc * (h1 * self.m.dhi - h2 * self.m.dlo));
        // Salida: entra a `sal` desde V+ (entregando) o desde V- (recibiendo).
        let w = vx - vo;
        let (io, go) = self.output(w);
        let raiz = (io * io + IS_REPARTO * IS_REPARTO).sqrt();
        let (ipos, ineg) = Self::reparto(io);
        let (kp, kn) = (0.5 * (1.0 + io / raiz), 0.5 * (1.0 - io / raiz));
        entry(c.m, self.uo, x, -go);
        entry(c.m, self.uo, self.uo, go);
        inject(c.rhs, self.uo, io - go * w);
        entry(c.m, self.uvp, x, kp * go);
        entry(c.m, self.uvp, self.uo, -kp * go);
        inject(c.rhs, self.uvp, -(ipos - kp * go * w));
        entry(c.m, self.uvn, x, kn * go);
        entry(c.m, self.uvn, self.uo, -kn * go);
        inject(c.rhs, self.uvn, -(ineg - kn * go * w));
        c.s0[s + IG] = ig;
        c.s0[s + ICL] = gc * (hi + lo);
        c.s0[s + IOUT] = io;
        false
    }

    /// Como las fuentes B de ngspice: cada corriente con la solución nueva debe ser casi la de la iteración anterior.
    fn converged(&self, x: &[f64], s0: &[f64], tol: &Tol) -> bool {
        let (ig, icl, io) = self.currents(x);
        let s = self.st;
        close(ig, s0[s + IG], tol) && close(icl, s0[s + ICL], tol) && close(io, s0[s + IOUT], tol)
    }

    fn trunc(&self, h: &Hist, dt: &mut f64) {
        let h1 = Hist { order: 1, ..*h };
        terr(if self.euler && h.order == 2 { &h1 } else { h }, self.st + QX, dt);
    }

    /// Corriente que entrega la salida y si el nodo interno está detenido contra una alimentación (1 contra V+, -1
    /// contra V-); en `aux`, el voltaje del nodo interno.
    fn reading(&self, x: &[f64], _s0: &[f64]) -> Reading {
        let vx = x[self.ux];
        let (hi, lo) = self.excess(vx, volt(x, self.uvp), volt(x, self.uvn));
        let estado = if hi > 0.0 { 1.0 } else if lo < 0.0 { -1.0 } else { 0.0 };
        Reading { i: self.output(vx - volt(x, self.uo)).0, aux: vx, estado }
    }

    /// Por las entradas, la de `rin`; por la salida sale la que entrega (su lectura); por las alimentaciones, la del
    /// consumo `rq` más la parte de la salida que toma cada una. La etapa de ganancia y el nodo interno van de la tierra a la
    /// tierra (sus corrientes suman cero en el nodo interno), así que la casilla de la tierra queda en cero.
    fn corrientes_propias(&self) -> bool {
        true
    }

    fn corrientes(&self, x: &[f64], _s0: &[f64], r: &Reading, out: &mut [f64]) {
        let ient = (volt(x, self.up) - volt(x, self.un)) / self.m.rin;
        let iq = (volt(x, self.uvp) - volt(x, self.uvn)) / self.m.rq;
        let (ipos, ineg) = Self::reparto(r.i);
        out[0] = ient;
        out[1] = -ient;
        out[2] = -r.i;
        out[3] = iq + ipos;
        out[4] = -iq + ineg;
        out[5] = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use crate::{Netlist, Transient};

    const LM741: &str = r#"{"a0":2e5,"gbw":1e6,"sr":0.5e6,"rin":2e6,"rout":75,"ilim":25e-3,"dhi":1,"dlo":1,"rq":17.6e3}"#;

    /// Inversor de ganancia -10 con ±15 V y la entrada en `vin`.
    fn inversor(vin: f64) -> Transient {
        let json = format!(r#"{{"nodes":6,"elements":[
            {{"type":"V","a":1,"b":0,"wave":{{"kind":"dc","v":15}}}},
            {{"type":"V","a":2,"b":0,"wave":{{"kind":"dc","v":-15}}}},
            {{"type":"V","a":3,"b":0,"wave":{{"kind":"dc","v":{vin}}}}},
            {{"type":"R","a":3,"b":4,"ohms":1000}},
            {{"type":"R","a":4,"b":5,"ohms":10000}},
            {{"type":"OA","p":0,"n":4,"out":5,"vp":1,"vn":2,"model":{LM741}}}]}}"#);
        let mut tr = Transient::new(Netlist::from_json(&json).unwrap(), 1e-5).unwrap();
        tr.advance_to(5e-3, u32::MAX).unwrap();
        tr
    }

    #[test]
    fn el_inversor_da_menos_diez_veces_la_entrada() {
        let tr = inversor(0.5);
        assert!((tr.voltage(5) + 5.0).abs() < 1e-3, "salida {}", tr.voltage(5));
        assert_eq!(tr.readings()[5].estado, 0.0);
        // La tierra virtual queda a unos microvolts.
        assert!(tr.voltage(4).abs() < 1e-4);
    }

    #[test]
    fn satura_a_un_volt_de_la_alimentacion() {
        let tr = inversor(-2.0);
        let v = tr.voltage(5);
        assert!(v > 13.8 && v < 14.0, "salida {v}");
        assert_eq!(tr.readings()[5].estado, 1.0);
        let tr = inversor(2.0);
        assert_eq!(tr.readings()[5].estado, -1.0);
    }

    #[test]
    fn la_corriente_de_salida_se_limita() {
        // Seguidor con 10 Ω de carga: 5 V pedirían 500 mA, el LM741 da 25 mA.
        let json = format!(r#"{{"nodes":5,"elements":[
            {{"type":"V","a":1,"b":0,"wave":{{"kind":"dc","v":15}}}},
            {{"type":"V","a":2,"b":0,"wave":{{"kind":"dc","v":-15}}}},
            {{"type":"V","a":3,"b":0,"wave":{{"kind":"dc","v":5}}}},
            {{"type":"R","a":4,"b":0,"ohms":10}},
            {{"type":"OA","p":3,"n":4,"out":4,"vp":1,"vn":2,"model":{LM741}}}]}}"#);
        let mut tr = Transient::new(Netlist::from_json(&json).unwrap(), 1e-5).unwrap();
        tr.advance_to(5e-3, u32::MAX).unwrap();
        let i = tr.readings()[4].i;
        assert!(i > 0.0249 && i < 0.0251, "corriente {i}");
        // La corriente sale de la alimentación positiva.
        assert!(tr.readings()[0].i < -0.025);
    }

    #[test]
    fn un_lazo_mucho_mas_rapido_que_el_paso_no_se_queda_oscilando() {
        // Referencia en derivación (un amplificador lento que maneja un NPN de K a tierra) con pasos de 250 µs: el lazo cruza
        // cerca de 200 kHz y el trapecio saltaba entre 1.55 V y 3.5 V; a 10 ms leía 2.818 V en lugar de 2.495 V.
        let json = r#"{"nodes":6,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":12}},
            {"type":"R","a":1,"b":2,"ohms":1000},
            {"type":"OA","p":2,"n":3,"out":4,"vp":2,"vn":5,"model":{"a0":20000,"gbw":500,"sr":15000,"rin":1e12,"rout":500,"ilim":0.005,"dhi":0.8,"dlo":0.01,"rq":1e12}},
            {"type":"V","a":3,"b":5,"wave":{"kind":"dc","v":2.493}},
            {"type":"Q","c":2,"b":4,"e":5,"model":{"is":1e-14,"bf":150}},
            {"type":"R","a":5,"b":0,"ohms":0.2}]}"#;
        let mut tr = Transient::new(Netlist::from_json(json).unwrap(), 2.5e-4).unwrap();
        for fin in [1e-3, 2e-3, 5e-3, 1e-2] {
            tr.advance_to(fin, u32::MAX).unwrap();
            assert!((tr.voltage(2) - 2.4949).abs() < 1e-3, "a {fin} s: {}", tr.voltage(2));
        }
    }

    #[test]
    fn el_escalon_sube_con_la_velocidad_de_subida() {
        // Seguidor con 0 a 5 V: a 0.5 V/µs tarda unos 10 µs.
        let json = format!(r#"{{"nodes":5,"elements":[
            {{"type":"V","a":1,"b":0,"wave":{{"kind":"dc","v":15}}}},
            {{"type":"V","a":2,"b":0,"wave":{{"kind":"dc","v":-15}}}},
            {{"type":"V","a":3,"b":0,"wave":{{"kind":"dc","v":5}}}},
            {{"type":"R","a":4,"b":0,"ohms":10000}},
            {{"type":"OA","p":3,"n":4,"out":4,"vp":1,"vn":2,"model":{LM741}}}]}}"#);
        let mut tr = Transient::new(Netlist::from_json(&json).unwrap(), 1e-7).unwrap();
        tr.advance_to(4e-6, u32::MAX).unwrap();
        let v = tr.voltage(4);
        assert!((v - 2.0).abs() < 0.1, "a los 4 µs: {v}");
    }
}
