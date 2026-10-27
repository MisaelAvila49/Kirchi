//! Fotorresistencia: la conductancia sigue a la de la luz del canal, g_luz = (E / 10 lx)^gamma / r10 y no menos que 1 / roscuro, con una
//! constante de tiempo al subir y otra al bajar (`tau_sube`, `tau_baja`). El estado es un nodo interno con el valor normalizado
//! s = g · r10, de orden 1, y arranca ya en el régimen de la luz inicial.

use super::{close, entry, init_charge, init_current, inject, integrate, stamp_g, terr, volt, Alloc, Ctx, Device, Hist, Mode, Reading, Tol, U};

#[derive(Clone)]
pub struct Ldr {
    a: usize,
    b: usize,
    r10: f64,
    gamma: f64,
    roscuro: f64,
    tau_sube: f64,
    tau_baja: f64,
    canal: usize,
    ua: U,
    ub: U,
    sn: usize,
    st: usize,
}

// Casillas de estado: el valor normalizado (su carga con capacidad 1) y su corriente; corriente de la última iteración.
const Q: usize = 0;
const IL: usize = 2;

impl Ldr {
    #[allow(clippy::too_many_arguments)]
    pub fn new(a: usize, b: usize, r10: f64, gamma: f64, roscuro: f64, tau_sube: f64, tau_baja: f64, canal: usize) -> Self {
        Self { a, b, r10, gamma, roscuro, tau_sube, tau_baja, canal, ua: None, ub: None, sn: 0, st: 0 }
    }

    /// El valor normalizado al que tiende con la iluminancia `lux`: sin luz queda en la conductancia de oscuridad.
    fn objetivo(&self, lux: f64) -> f64 {
        let luz = if lux.is_finite() && lux > 0.0 { (lux / 10.0).powf(self.gamma) } else { 0.0 };
        luz.max(self.r10 / self.roscuro)
    }
}

impl Device for Ldr {
    /// No redefine `accept`: el motor no se lo pide.
    fn usa_accept(&self) -> bool {
        false
    }

    fn bind(&mut self, a: &mut Alloc) {
        self.ua = a.ext(self.a);
        self.ub = a.ext(self.b);
        self.sn = a.node();
        self.st = a.states(3);
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        let s = self.st;
        let sn = Some(self.sn);
        let objetivo = self.objetivo(c.canales.valor(self.canal, c.t - 0.5 * c.h, c.t));
        // Arranca en el régimen de la luz inicial, no en conductancia cero.
        if c.mode == Mode::InitTran {
            c.s0[s + Q] = objetivo;
            init_charge(c, s + Q);
        } else if c.mode == Mode::Pred {
            c.s0[s + Q] = c.s1[s + Q];
        } else {
            c.s0[s + Q] = c.x[self.sn];
        }
        // La dirección la decide el estado aceptado del paso anterior, no la iteración, para que el Newton no oscile.
        let tau = if objetivo > c.s1[s + Q] { self.tau_sube } else { self.tau_baja };
        let (geq, ceq) = integrate(c, 1.0, s + Q);
        init_current(c, s + Q);
        stamp_g(c.m, sn, None, geq + 1.0 / tau);
        inject(c.rhs, sn, objetivo / tau - ceq);
        // Corriente i = (s / r10) v, bilineal en el voltaje y en el estado.
        let v = volt(c.x, self.ua) - volt(c.x, self.ub);
        let sv = c.x[self.sn];
        let (gv, gs) = (sv / self.r10, v / self.r10);
        stamp_g(c.m, self.ua, self.ub, gv);
        entry(c.m, self.ua, sn, gs);
        entry(c.m, self.ub, sn, -gs);
        let ieq = -gv * v;
        inject(c.rhs, self.ua, -ieq);
        inject(c.rhs, self.ub, ieq);
        c.s0[s + IL] = gv * v;
        false
    }

    fn converged(&self, x: &[f64], s0: &[f64], tol: &Tol) -> bool {
        let i = x[self.sn] / self.r10 * (volt(x, self.ua) - volt(x, self.ub));
        close(i, s0[self.st + IL], tol)
    }

    fn trunc(&self, h: &Hist, dt: &mut f64) {
        terr(h, self.st + Q, dt);
    }

    /// Corriente; en `aux`, la resistencia que tiene ahora (Ω).
    fn reading(&self, x: &[f64], s0: &[f64]) -> Reading {
        Reading { i: s0[self.st + IL], aux: self.r10 / x[self.sn].max(self.r10 / self.roscuro / 1e3), estado: 0.0 }
    }
}

#[cfg(test)]
mod tests {
    use crate::{Netlist, Transient};

    const LDR: &str = r#"{"type":"LDR","a":1,"b":0,"r10":14142,"gamma":0.6,"roscuro":1e6,"tau_sube":0.02,"tau_baja":0.05,"canal":0}"#;

    /// Fotorresistencia con 1 V y `lux` iniciales en el canal 0. Elemento 1.
    fn red(lux: f64) -> Transient {
        let json = format!(
            r#"{{"nodes":2,"canales":[{{"inicial":{lux}}}],"elements":[
            {{"type":"V","a":1,"b":0,"wave":{{"kind":"dc","v":1}}}},{LDR}]}}"#
        );
        Transient::new(Netlist::from_json(&json).unwrap(), 1e-3).unwrap()
    }

    fn conductancia_de(lux: f64) -> f64 {
        ((lux / 10.0f64).powf(0.6) / 14142.0).max(1e-6)
    }

    #[test]
    fn en_regimen_la_resistencia_sigue_la_formula_a_1_10_100_y_1000_lx() {
        for lux in [1.0, 10.0, 100.0, 1000.0] {
            let mut tr = red(lux);
            tr.advance_to(0.5, u32::MAX).unwrap();
            let g = tr.readings()[1].i;
            let esperado = conductancia_de(lux);
            assert!((g - esperado).abs() / esperado < 1e-6, "{lux} lx: {g} contra {esperado}");
            assert!((tr.readings()[1].aux - 1.0 / esperado).abs() * esperado < 1e-6);
        }
    }

    #[test]
    fn a_10_lx_la_resistencia_es_r10() {
        let mut tr = red(10.0);
        tr.advance_to(0.1, u32::MAX).unwrap();
        assert!((1.0 / tr.readings()[1].i - 14142.0).abs() < 1e-6);
    }

    #[test]
    fn en_oscuridad_la_resistencia_no_pasa_de_roscuro() {
        // Sin luz y con una luz tan baja que la fórmula daría más de 1 MΩ.
        for lux in [0.0, 1e-3] {
            let mut tr = red(lux);
            tr.advance_to(0.5, u32::MAX).unwrap();
            let r = 1.0 / tr.readings()[1].i;
            assert!((r - 1e6).abs() / 1e6 < 1e-6, "{lux} lx: {r}");
        }
    }

    #[test]
    fn al_subir_la_luz_la_conductancia_sigue_con_tau_sube() {
        // De 10 a 1000 lx en t0: a un tau_sube la conductancia lleva el 63 % del camino.
        let mut tr = red(10.0);
        tr.advance_to(0.5, u32::MAX).unwrap();
        let t0 = tr.time() + 1e-3;
        tr.poner_valor(0, t0, 1000.0).unwrap();
        tr.advance_to(t0 + 0.02, u32::MAX).unwrap();
        let (g0, g1) = (conductancia_de(10.0), conductancia_de(1000.0));
        let esperado = g1 + (g0 - g1) * (-1.0f64).exp();
        let g = tr.readings()[1].i;
        assert!((g - esperado).abs() / esperado < 1e-2, "{g} contra {esperado}");
        tr.advance_to(t0 + 1.0, u32::MAX).unwrap();
        assert!((tr.readings()[1].i - g1).abs() / g1 < 1e-4);
    }

    #[test]
    fn al_bajar_la_luz_la_conductancia_sigue_con_tau_baja() {
        let mut tr = red(1000.0);
        tr.advance_to(0.5, u32::MAX).unwrap();
        let t0 = tr.time() + 1e-3;
        tr.poner_valor(0, t0, 10.0).unwrap();
        tr.advance_to(t0 + 0.05, u32::MAX).unwrap();
        let (g0, g1) = (conductancia_de(1000.0), conductancia_de(10.0));
        let esperado = g1 + (g0 - g1) * (-1.0f64).exp();
        let g = tr.readings()[1].i;
        assert!((g - esperado).abs() / esperado < 1e-2, "{g} contra {esperado}");
        // Y el tau de subida no es el de bajada: a 0.02 s de bajar aún queda más de lo que dejaría tau_sube.
        let mut tr = red(1000.0);
        tr.advance_to(0.5, u32::MAX).unwrap();
        let t0 = tr.time() + 1e-3;
        tr.poner_valor(0, t0, 10.0).unwrap();
        tr.advance_to(t0 + 0.02, u32::MAX).unwrap();
        let con_sube = g1 + (g0 - g1) * (-1.0f64).exp();
        assert!(tr.readings()[1].i > 1.2 * con_sube);
    }

    #[test]
    fn la_resistencia_sobre_una_fuente_de_corriente_sigue_la_ley_de_ohm() {
        // 1 mA a 100 lx por la fotorresistencia: v = i R.
        let json = format!(
            r#"{{"nodes":2,"canales":[{{"inicial":100}}],"elements":[
            {{"type":"I","a":0,"b":1,"amps":1e-3}},{LDR}]}}"#
        );
        let mut tr = Transient::new(Netlist::from_json(&json).unwrap(), 1e-3).unwrap();
        tr.advance_to(0.5, u32::MAX).unwrap();
        let esperado = 1e-3 / conductancia_de(100.0);
        assert!((tr.voltage(1) - esperado).abs() / esperado < 1e-6, "{} contra {esperado}", tr.voltage(1));
    }
}
