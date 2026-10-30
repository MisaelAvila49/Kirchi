//! Motor a pasos de dos fases (híbrido o de imán permanente), con ω (rad/s) y el ángulo del rotor como incógnitas:
//!   v_A = R i_A + L di_A/dt − Km ω sen(N θ),  v_B = R i_B + L di_B/dt + Km ω cos(N θ),
//!   Te = Km (−i_A sen(N θ) + i_B cos(N θ)) − Td sen(4 N θ),  J dω/dt = Te − Bm ω − Tc tanh(ω / ω0),  dθ/dt = ω.
//! Bipolar: terminales `[A+, A−, B+, B−]`. Unipolar: `[A+, A−, B+, B−, toma A, toma B]`, con cada fase en dos mitades de resistencia
//! `r`, inductancia `l` y constante `km` propias, acopladas con `k_mutua` y devanadas en sentido contrario (la corriente de la fase es
//! i₁ − i₂, con ambas contadas hacia la toma). La reducción solo escala lo que se lee (velocidad y ángulo de salida) y la carga.

use super::{entry, init_charge, init_current, inject, integrate, stamp_g, terr, Alloc, Ctx, Device, Event, Hist, Mode, Reading, U};

/// Velocidad (rad/s) con que la carga de fricción pasa de cero a su valor completo.
const W_CARGA: f64 = 0.1;
/// El ángulo del rotor no avanza más de este tramo por paso: un octavo de paso completo (π / 2N) del campo.
const FRACCION_DE_PASO: f64 = 1.0 / 8.0;
/// Pasos aceptados seguidos con el voltaje de una rama en zigzag que la pasan a Euler hacia atrás, y cuántos pasos se queda.
const ZIGZAG_PASOS: u8 = 2;
const EULER_PASOS: u8 = 4;
/// Cada vuelta del zigzag debe medir esta fracción de lo mayor del voltaje (y al menos `ZIGZAG_V`) para contar.
const ZIGZAG_FRACCION: f64 = 1e-2;
const ZIGZAG_V: f64 = 1e-6;

#[derive(Clone, Copy)]
struct Rama {
    pos: U,
    neg: U,
    /// 0 para la fase A y 1 para la B.
    fase: usize,
    /// +1 o −1 según el sentido del devanado respecto del campo de la fase.
    signo: f64,
    br: usize,
}

#[derive(Clone)]
pub struct Pasos {
    nodos: [usize; 6],
    unipolar: bool,
    r: f64,
    l: f64,
    mutua: f64,
    km: f64,
    n: f64,
    td: f64,
    j: f64,
    bm: f64,
    canal_carga: Option<usize>,
    reduccion: f64,
    ramas: [Rama; 4],
    nr: usize,
    w: usize,
    th: usize,
    st: usize,
    /// Ángulo del rotor al final del último paso aceptado. La incógnita `th` es lo que avanza dentro del paso, para que la
    /// tolerancia de convergencia se mida sobre un tramo y no sobre vueltas acumuladas.
    theta: f64,
    /// Velocidad al final del último paso aceptado (para el trapecio del ángulo).
    w_acc: f64,
    /// Por rama: el voltaje de su flujo en los tres últimos pasos aceptados (el más reciente primero), los pasos seguidos que
    /// lleva en zigzag y los que le quedan con Euler hacia atrás.
    v_ant: [[f64; 3]; 4],
    zigzag: [u8; 4],
    euler: [u8; 4],
}

impl Pasos {
    #[allow(clippy::too_many_arguments)]
    pub fn new(nodos: &[usize], unipolar: bool, r: f64, l: f64, k_mutua: f64, km: f64, dientes: u32, td: f64, j: f64, bm: f64, canal_carga: Option<usize>, reduccion: f64) -> Self {
        let mut n = [0; 6];
        n[..nodos.len()].copy_from_slice(nodos);
        let vacia = Rama { pos: None, neg: None, fase: 0, signo: 1.0, br: 0 };
        Self {
            nodos: n,
            unipolar,
            r,
            l,
            mutua: -k_mutua * l,
            km,
            n: f64::from(dientes),
            td,
            j,
            bm,
            canal_carga,
            reduccion,
            ramas: [vacia; 4],
            nr: if unipolar { 4 } else { 2 },
            w: 0,
            th: 0,
            st: 0,
            theta: 0.0,
            w_acc: 0.0,
            v_ant: [[0.0; 3]; 4],
            zigzag: [0; 4],
            euler: [0; 4],
        }
    }

    /// Casilla del flujo de la rama `k` (dos: flujo y su derivada).
    fn flujo(&self, k: usize) -> usize {
        self.st + 2 * k
    }

    /// Casilla de la cantidad de movimiento J ω (dos) y la de la velocidad de la última iteración.
    fn qw(&self) -> usize {
        self.st + 2 * self.nr
    }

    fn wl(&self) -> usize {
        self.qw() + 2
    }

    /// La otra mitad de la misma fase, si el motor es unipolar.
    fn pareja(&self, k: usize) -> Option<usize> {
        self.unipolar.then_some(k ^ 1)
    }

    /// Corriente de cada fase (en el unipolar, la de la fase equivalente).
    fn corriente_fase(&self, x: &[f64], fase: usize) -> f64 {
        self.ramas[..self.nr].iter().filter(|r| r.fase == fase).map(|r| r.signo * x[r.br]).sum()
    }
}

/// Seno y coseno del ángulo eléctrico, y el factor `g` de la fase (−sen para A, cos para B) con su derivada respecto de θ.
fn factor_fase(fase: usize, n: f64, sn: f64, cs: f64) -> (f64, f64) {
    if fase == 0 { (-sn, -n * cs) } else { (cs, -n * sn) }
}

impl Device for Pasos {
    fn bind(&mut self, a: &mut Alloc) {
        let u = |k: usize| a.ext(self.nodos[k]);
        let (a1, a2, b1, b2) = (u(0), u(1), u(2), u(3));
        let (ca, cb) = if self.unipolar { (u(4), u(5)) } else { (None, None) };
        let defs: [(U, U, usize, f64); 4] = if self.unipolar {
            [(a1, ca, 0, 1.0), (a2, ca, 0, -1.0), (b1, cb, 1, 1.0), (b2, cb, 1, -1.0)]
        } else {
            [(a1, a2, 0, 1.0), (b1, b2, 1, 1.0), (None, None, 0, 1.0), (None, None, 0, 1.0)]
        };
        for k in 0..self.nr {
            let (pos, neg, fase, signo) = defs[k];
            self.ramas[k] = Rama { pos, neg, fase, signo, br: a.branch() };
        }
        self.w = a.node();
        self.th = a.node();
        self.st = a.states(2 * self.nr + 2 + 1);
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        let nr = self.nr;
        let (w, th) = (Some(self.w), Some(self.th));
        let w_old = c.x[self.w];
        let u_old = c.x[self.th];
        let fi = self.n * (self.theta + u_old);
        let (sn, cs) = fi.sin_cos();
        // Flujos de las ramas (con el acoplamiento entre mitades) y la inercia.
        let pred = c.mode == Mode::Pred;
        for k in 0..nr {
            let f = self.flujo(k);
            if pred {
                c.s0[f] = c.s1[f];
            } else {
                let i = c.x[self.ramas[k].br];
                let otra = self.pareja(k).map_or(0.0, |p| self.mutua * c.x[self.ramas[p].br]);
                c.s0[f] = self.l * i + otra;
                init_charge(c, f);
            }
        }
        let qw = self.qw();
        if pred {
            c.s0[qw] = c.s1[qw];
        } else {
            c.s0[qw] = self.j * w_old;
            init_charge(c, qw);
        }
        let mut corr_vieja = [0.0; 4];
        for k in 0..nr {
            corr_vieja[k] = c.x[self.ramas[k].br];
        }
        // Ramas eléctricas.
        for k in 0..nr {
            let rama = self.ramas[k];
            let f = self.flujo(k);
            // Una rama bloqueada (la mitad apagada de un unipolar: su corriente casi no puede cambiar) es una restricción
            // algebraica, y ahí el trapecio oscila paso a paso sin amortiguarse: Euler hacia atrás la deja quieta.
            let euler = self.euler[k] > 0 && c.order == 2;
            let (req, veq, ag0) = if euler {
                let ag0 = 1.0 / c.h;
                let ccap = ag0 * (c.s0[f] - c.s1[f]);
                c.s0[f + 1] = ccap;
                (ag0 * self.l, ccap - ag0 * c.s0[f], ag0)
            } else {
                let (req, veq) = integrate(c, self.l, f);
                (req, veq, c.ag0)
            };
            init_current(c, f);
            let br = Some(rama.br);
            let (g, gp) = factor_fase(rama.fase, self.n, sn, cs);
            let e_w = rama.signo * self.km * g;
            let e_th = rama.signo * self.km * w_old * gp;
            entry(c.m, rama.pos, br, 1.0);
            entry(c.m, rama.neg, br, -1.0);
            entry(c.m, br, rama.pos, 1.0);
            entry(c.m, br, rama.neg, -1.0);
            entry(c.m, br, br, -(self.r + req));
            if let Some(p) = self.pareja(k) {
                entry(c.m, br, Some(self.ramas[p].br), -ag0 * self.mutua);
            }
            entry(c.m, br, w, -e_w);
            entry(c.m, br, th, -e_th);
            c.rhs[rama.br] += veq - e_th * u_old;
        }
        // Eje: inercia, fricción, carga y el par del campo.
        let (geq, ceq) = integrate(c, self.j, qw);
        init_current(c, qw);
        let tc = self.canal_carga.map_or(0.0, |ch| {
            let v = c.canales.valor(ch, c.t - 0.5 * c.h, c.t);
            if v.is_finite() { v / self.reduccion } else { 0.0 }
        });
        let tanh = (w_old / W_CARGA).tanh();
        let dtanh = (1.0 - tanh * tanh) / W_CARGA;
        let mut t_theta = -4.0 * self.n * self.td * (4.0 * fi).cos();
        stamp_g(c.m, w, None, geq + self.bm + tc * dtanh);
        for k in 0..nr {
            let rama = self.ramas[k];
            let (g, gp) = factor_fase(rama.fase, self.n, sn, cs);
            entry(c.m, w, Some(rama.br), -self.km * rama.signo * g);
            t_theta += self.km * rama.signo * corr_vieja[k] * gp;
        }
        entry(c.m, w, th, -t_theta);
        inject(c.rhs, w, -ceq - tc * (tanh - dtanh * w_old) - self.td * (4.0 * fi).sin() - t_theta * u_old);
        // Ángulo: trapecio (o Euler tras una discontinuidad) del avance dentro del paso.
        entry(c.m, th, th, c.ag0);
        entry(c.m, th, w, -1.0);
        if c.order == 2 {
            inject(c.rhs, th, self.w_acc);
        }
        c.s0[self.wl()] = w_old;
        false
    }

    fn trunc(&self, h: &Hist, dt: &mut f64) {
        let h1 = Hist { s: h.s, delta_old: h.delta_old, order: 1, tol: h.tol };
        for k in 0..self.nr {
            terr(if self.euler[k] > 0 && h.order == 2 { &h1 } else { h }, self.flujo(k), dt);
        }
        terr(h, self.qw(), dt);
        // El ángulo no puede saltar posiciones de equilibrio: su avance por paso se acota.
        let w = h.s[0][self.wl()].abs();
        if w > 1e-9 {
            *dt = dt.min(FRACCION_DE_PASO * std::f64::consts::FRAC_PI_2 / (self.n * w));
        }
    }

    /// Tras cada paso aceptado el ángulo avanzado pasa a ser el nuevo origen.
    fn accept(&mut self, x: &[f64], s0: &[f64], _t: f64, _h: f64, _ev: &mut Vec<Event>) -> bool {
        self.theta += x[self.th];
        self.w_acc = x[self.w];
        for k in 0..self.nr {
            let v = s0[self.flujo(k) + 1];
            let [v1, v2, v3] = self.v_ant[k];
            let (e1, e2, e3) = (v - v1, v1 - v2, v2 - v3);
            let mayor = v.abs().max(v1.abs()).max(v2.abs()).max(v3.abs());
            let vuelta = e1.abs().min(e2.abs()).min(e3.abs());
            if e1 * e2 < 0.0 && e2 * e3 < 0.0 && vuelta > (ZIGZAG_FRACCION * mayor).max(ZIGZAG_V) {
                self.zigzag[k] += 1;
            } else {
                self.zigzag[k] = 0;
            }
            if self.zigzag[k] >= ZIGZAG_PASOS {
                self.zigzag[k] = 0;
                self.euler[k] = EULER_PASOS;
            } else {
                self.euler[k] = self.euler[k].saturating_sub(1);
            }
            self.v_ant[k] = [v, v1, v2];
        }
        false
    }

    /// Corriente de la fase A; en `aux`, la velocidad del eje de salida (rad/s); en `estado`, su ángulo (rad).
    fn reading(&self, x: &[f64], _s0: &[f64]) -> Reading {
        Reading { i: self.corriente_fase(x, 0), aux: x[self.w] / self.reduccion, estado: self.theta / self.reduccion }
    }

    fn corrientes_propias(&self) -> bool {
        true
    }

    /// Cada devanado entra por su primer terminal y sale por el segundo (o por la toma); la última casilla es la tierra interna.
    fn corrientes(&self, x: &[f64], _s0: &[f64], _r: &Reading, out: &mut [f64]) {
        out.fill(0.0);
        if self.unipolar {
            let i: [f64; 4] = std::array::from_fn(|k| x[self.ramas[k].br]);
            out[..4].copy_from_slice(&i);
            out[4] = -(i[0] + i[1]);
            out[5] = -(i[2] + i[3]);
        } else {
            let (ia, ib) = (x[self.ramas[0].br], x[self.ramas[1].br]);
            out[..4].copy_from_slice(&[ia, -ia, ib, -ib]);
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{Element, Netlist, Transient};
    use std::f64::consts::{FRAC_PI_2, PI};

    // 17HS4401: 1.5 Ω, 2.8 mH, 50 pares de polos, 54 g·cm², con una fricción que lo asienta en milisegundos.
    const KM: f64 = 0.1664;
    const J: f64 = 5.4e-6;
    const N: f64 = 50.0;
    const I: f64 = 1.7;

    fn bipolar(bm: f64, reduccion: f64, carga: f64) -> Transient {
        let json = format!(
            r#"{{"nodes":3,"canales":[{{"inicial":{carga}}}],"elements":[
            {{"type":"I","a":0,"b":1,"amps":0}},{{"type":"I","a":0,"b":2,"amps":0}},
            {{"type":"PASOS","nodos":[1,0,2,0],"r":1.5,"l":2.8e-3,"km":{KM},"dientes":50,"td":0,"j":{J},"bm":{bm},"canal_carga":0,"reduccion":{reduccion}}}]}}"#
        );
        Transient::new(Netlist::from_json(&json).unwrap(), 1e-4).unwrap()
    }

    fn corrientes(tr: &mut Transient, ia: f64, ib: f64) {
        tr.set_element(0, Element::I { a: 0, b: 1, amps: ia, wave: None }).unwrap();
        tr.set_element(1, Element::I { a: 0, b: 2, amps: ib, wave: None }).unwrap();
    }

    /// Mueve el campo y espera a que el rotor se asiente; devuelve (ángulo de salida, velocidad de salida).
    fn paso_a(tr: &mut Transient, ia: f64, ib: f64, espera: f64) -> (f64, f64) {
        corrientes(tr, ia, ib);
        tr.advance_to(tr.time() + espera, u32::MAX).unwrap();
        let r = tr.readings()[2];
        (r.estado, r.aux)
    }

    #[test]
    fn un_paso_completo_llega_al_angulo_esperado_y_se_detiene() {
        let mut tr = bipolar(0.02, 1.0, 0.0);
        let (a0, _) = paso_a(&mut tr, I, 0.0, 0.02);
        assert!(a0.abs() < 1e-6, "ángulo inicial {a0}");
        let (ang, w) = paso_a(&mut tr, 0.0, I, 0.02);
        assert!((ang - FRAC_PI_2 / N).abs() < 1e-5, "ángulo {ang} contra {}", FRAC_PI_2 / N);
        assert!(w.abs() < 1e-3, "velocidad {w}");
        // La corriente de la fase A sigue a su fuente.
        assert!(tr.readings()[2].i.abs() < 1e-6);
    }

    #[test]
    fn ocho_medios_pasos_dan_una_vuelta_electrica() {
        let mut tr = bipolar(0.02, 1.0, 0.0);
        let campo = [(I, 0.0), (I, I), (0.0, I), (-I, I), (-I, 0.0), (-I, -I), (0.0, -I), (I, -I), (I, 0.0)];
        paso_a(&mut tr, campo[0].0, campo[0].1, 0.02);
        for (k, (ia, ib)) in campo.iter().enumerate().skip(1) {
            let (ang, _) = paso_a(&mut tr, *ia, *ib, 0.02);
            let esperado = k as f64 * PI / (4.0 * N);
            assert!((ang - esperado).abs() < 1e-5, "medio paso {k}: {ang} contra {esperado}");
        }
        let (ang, _) = paso_a(&mut tr, I, 0.0, 0.02);
        assert!((ang - 2.0 * PI / N).abs() < 1e-5);
    }

    #[test]
    fn con_ambas_fases_a_la_corriente_nominal_el_par_pico_es_raiz_de_2_km_i() {
        // Sin fricción, el rotor sale del reposo en el campo (I, 0) hacia (I, I): la energía magnética que gana al llegar al equilibrio
        // es (km I / N)(√2 − 1) y fija la velocidad máxima.
        let mut tr = bipolar(1e-9, 1.0, 0.0);
        corrientes(&mut tr, I, I);
        let mut pico = 0.0f64;
        let mut t = 0.0;
        while t < 0.01 {
            t += 2e-5;
            tr.advance_to(t, u32::MAX).unwrap();
            pico = pico.max(tr.readings()[2].aux);
        }
        let esperado = (2.0 * (KM * I / N) * (2.0f64.sqrt() - 1.0) / J).sqrt();
        assert!((pico - esperado).abs() / esperado < 0.01, "velocidad máxima {pico} contra {esperado}");
    }

    #[test]
    fn la_aceleracion_inicial_es_el_par_de_una_fase_entre_la_inercia() {
        // Con solo la fase B al arrancar, Te = km I cos(0): en 20 µs la velocidad es km I t / J.
        let mut tr = bipolar(1e-9, 1.0, 0.0);
        corrientes(&mut tr, 0.0, I);
        tr.advance_to(2e-5, u32::MAX).unwrap();
        let esperado = KM * I * 2e-5 / J;
        let w = tr.readings()[2].aux;
        assert!((w - esperado).abs() / esperado < 0.01, "ω = {w} contra {esperado}");
    }

    #[test]
    fn la_reduccion_escala_el_angulo_y_la_carga_reflejada_pero_no_el_rotor() {
        // Una carga de 0.1 N·m en un eje con reducción 10 pesa en el rotor lo mismo que 0.01 N·m sin reducción.
        let pico = |reduccion: f64, carga: f64| {
            let mut tr = bipolar(1e-9, reduccion, carga);
            corrientes(&mut tr, I, I);
            let (mut pico, mut t) = (0.0f64, 0.0);
            while t < 0.01 {
                t += 2e-5;
                tr.advance_to(t, u32::MAX).unwrap();
                pico = pico.max(tr.readings()[2].aux * reduccion);
            }
            pico
        };
        let (libre, reducido, directo) = (pico(1.0, 0.0), pico(10.0, 0.1), pico(1.0, 0.01));
        assert!(directo < 0.97 * libre, "{directo} contra {libre}");
        assert!((reducido - directo).abs() / directo < 0.005, "{reducido} contra {directo}");
        // Y el ángulo de salida es el del rotor entre la reducción.
        let mut tr = bipolar(0.02, 10.0, 0.0);
        paso_a(&mut tr, I, 0.0, 0.02);
        let (ang, _) = paso_a(&mut tr, 0.0, I, 0.02);
        assert!((ang - FRAC_PI_2 / N / 10.0).abs() < 1e-6, "{ang}");
    }

    /// Unipolar de 6 terminales con las tomas a tierra y una fuente de corriente en cada mitad (elementos 0 a 3).
    fn unipolar(reduccion: f64) -> Transient {
        let json = format!(
            r#"{{"nodes":5,"elements":[
            {{"type":"I","a":0,"b":1,"amps":0}},{{"type":"I","a":0,"b":2,"amps":0}},
            {{"type":"I","a":0,"b":3,"amps":0}},{{"type":"I","a":0,"b":4,"amps":0}},
            {{"type":"PASOS","nodos":[1,2,3,4,0,0],"unipolar":true,"r":50,"l":0.03,"k_mutua":0.99,"km":0.005,"dientes":8,"td":0,"j":2e-7,"bm":3e-5,"reduccion":{reduccion}}}]}}"#
        );
        Transient::new(Netlist::from_json(&json).unwrap(), 1e-4).unwrap()
    }

    fn mitad(tr: &mut Transient, cual: usize, amps: f64) {
        for k in 0..4 {
            tr.set_element(k, Element::I { a: 0, b: k + 1, amps: if k == cual { amps } else { 0.0 }, wave: None }).unwrap();
        }
    }

    #[test]
    fn el_unipolar_gira_un_paso_completo_por_mitad_energizada() {
        // A+, B+, A−, B− y A+ otra vez: cuatro pasos completos son una vuelta eléctrica (2π / 8 del rotor).
        let mut tr = unipolar(63.68395);
        for (k, cual) in [0usize, 2, 1, 3, 0].into_iter().enumerate() {
            mitad(&mut tr, cual, 0.1);
            tr.advance_to(0.2 * (k + 1) as f64, u32::MAX).unwrap();
            let r = tr.readings()[4];
            let esperado = k as f64 * FRAC_PI_2 / 8.0 / 63.68395;
            assert!((r.estado - esperado).abs() < 2e-6, "paso {k}: {} contra {esperado}", r.estado);
            // La fase A lleva +i con su primera mitad y −i con la segunda.
            let ia = match cual { 0 => 0.1, 1 => -0.1, _ => 0.0 };
            assert!((r.i - ia).abs() < 1e-6, "paso {k}: i_A = {}", r.i);
        }
    }

    #[test]
    fn las_corrientes_por_terminal_suman_cero_y_la_toma_recibe_la_suma_de_las_mitades() {
        let mut tr = unipolar(1.0);
        tr.activar_terminales(true);
        mitad(&mut tr, 0, 0.1);
        tr.advance_to(0.05, u32::MAX).unwrap();
        let (a, b) = tr.casillas_de(4);
        assert_eq!(b - a, 7);
        let c: Vec<f64> = (a..b).map(|j| tr.promedio_terminal(j).0).collect();
        assert!(c.iter().sum::<f64>().abs() < 1e-9, "{c:?}");
        assert!(c[0] > 0.05 && c[1].abs() < 1e-3, "{c:?}");
        assert!((c[4] + c[0] + c[1]).abs() < 1e-9, "{c:?}");
    }

    #[test]
    fn sin_corriente_el_reten_lleva_el_rotor_a_un_minimo_multiplo_de_un_paso_completo() {
        // En el medio paso el reten es un máximo: al soltar el campo el rotor cae a un paso completo, nunca se queda entre dos.
        let json = format!(
            r#"{{"nodes":3,"elements":[
            {{"type":"I","a":0,"b":1,"amps":0}},{{"type":"I","a":0,"b":2,"amps":0}},
            {{"type":"PASOS","nodos":[1,0,2,0],"r":1.5,"l":2.8e-3,"km":{KM},"dientes":50,"td":0.022,"j":{J},"bm":0.02}}]}}"#
        );
        let mut tr = Transient::new(Netlist::from_json(&json).unwrap(), 1e-4).unwrap();
        corrientes(&mut tr, I, 0.0);
        tr.advance_to(0.05, u32::MAX).unwrap();
        paso_a(&mut tr, I, 0.8 * I, 0.05);
        let (ang, w) = paso_a(&mut tr, 0.0, 0.0, 0.3);
        let paso = FRAC_PI_2 / N;
        let resto = (ang / paso - (ang / paso).round()).abs() * paso;
        assert!(resto < 1e-4 && w.abs() < 1e-3, "ángulo {ang}, velocidad {w}");
    }
}
