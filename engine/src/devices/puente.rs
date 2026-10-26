//! Puentes entre la lógica y la matriz, como `adc_bridge` y `dac_bridge` de XSPICE. El de entrada lee V(p) − V(n): 0 hasta `in_low`, 1 desde `in_high` y X entre ambos. Antes de aceptar un paso dice en qué fracción cruzó el umbral y el transitorio repite el paso más corto hasta `TOLERANCIA_CRUCE`.
//! El de salida es una fuente de Thévenin con control `s` de 0 a 1 en rampa (0.5 para X): V = (1 − s)(V(lo) + v_lo) + s (V(hi) + v_hi) y R = (1 − s) r_lo + s r_hi. El inicio de la rampa es una discontinuidad en `mixto.rs` y su final un punto de quiebre.

use super::{entry, inject, stamp_g, volt, Alloc, Ctx, Device, Event, Reading, U};
use crate::digital::Nivel;

#[derive(Clone)]
pub struct PuenteEntrada {
    p: usize,
    n: usize,
    up: U,
    un: U,
    in_low: f64,
    in_high: f64,
    /// Conductancia y voltaje interno de una entrada que toma corriente (74LS).
    carga: Option<(f64, f64)>,
    nivel: Nivel,
    cambio: bool,
    /// Voltaje del último paso aceptado y el instante en que se cruzó el umbral del último cambio de nivel (interpolado
    /// dentro del paso: el evento lleva ese instante y no el del final del paso).
    v_acc: f64,
    t_cambio: f64,
}

impl PuenteEntrada {
    pub fn new(p: usize, n: usize, in_low: f64, in_high: f64, r_in: Option<f64>, v_in: f64) -> Self {
        let mut e = Self { p, n, up: None, un: None, in_low, in_high, carga: r_in.map(|r| (1.0 / r, v_in)), nivel: Nivel::X, cambio: false, v_acc: 0.0, t_cambio: 0.0 };
        // En t = 0 todo está descargado (como `uic`): el nivel inicial es el de 0 V.
        e.nivel = e.leer(0.0);
        e
    }

    /// El nivel que corresponde al voltaje `v`.
    pub fn leer(&self, v: f64) -> Nivel {
        if v >= self.in_high {
            Nivel::Uno
        } else if v <= self.in_low {
            Nivel::Cero
        } else {
            Nivel::X
        }
    }

    fn v(&self, x: &[f64]) -> f64 {
        volt(x, self.up) - volt(x, self.un)
    }

    /// El primer umbral que cambia el nivel desde el que tiene, yendo de `v0` a `v1`: subiendo desde 0 es in_low (a X o,
    /// sin zona X, a 1); desde X, in_high. Bajando desde 1 es in_high; desde X, in_low.
    fn primer_umbral(&self, v0: f64, v1: f64) -> f64 {
        if v1 > v0 {
            if self.nivel == Nivel::Cero { self.in_low } else { self.in_high }
        } else if self.nivel == Nivel::Uno {
            self.in_high
        } else {
            self.in_low
        }
    }
}

impl Device for PuenteEntrada {
    fn bind(&mut self, a: &mut Alloc) {
        self.up = a.ext(self.p);
        self.un = a.ext(self.n);
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        if let Some((g, v)) = self.carga {
            stamp_g(c.m, self.up, self.un, g);
            inject(c.rhs, self.up, g * v);
            inject(c.rhs, self.un, -g * v);
        }
        false
    }

    fn linear(&self) -> bool {
        true
    }

    /// Corriente que entra por `p` (la de una entrada 74LS; cero en CMOS); en `estado`, el nivel que lee.
    fn reading(&self, x: &[f64], _s0: &[f64]) -> Reading {
        let i = self.carga.map_or(0.0, |(g, v)| g * (self.v(x) - v));
        Reading { i, aux: 0.0, estado: self.nivel.codigo() }
    }

    fn accept(&mut self, x: &[f64], _s0: &[f64], t: f64, h: f64, _ev: &mut Vec<Event>) -> bool {
        let (v0, v1) = (self.v_acc, self.v(x));
        self.v_acc = v1;
        let n = self.leer(v1);
        if n != self.nivel {
            // El cruce se interpola en lineal dentro del paso con el mismo umbral que la localización: con el final del paso los eventos llegaban decenas de ps tarde. Si el paso salta ambos umbrales, el primero queda más cerca del salto.
            let theta = if v1 != v0 { ((self.primer_umbral(v0, v1) - v0) / (v1 - v0)).clamp(0.0, 1.0) } else { 1.0 };
            self.t_cambio = t - h + theta * h;
            self.nivel = n;
            self.cambio = true;
        }
        false
    }

    fn cruce(&self, x_ant: &[f64], x: &[f64]) -> Option<f64> {
        let (v0, v1) = (self.v(x_ant), self.v(x));
        if self.leer(v1) == self.nivel || v1 == v0 {
            return None;
        }
        let b = self.primer_umbral(v0, v1);
        Some(((b - v0) / (v1 - v0)).clamp(0.0, 1.0))
    }

    fn nivel_logico(&self) -> Option<Nivel> {
        Some(self.nivel)
    }

    fn instante_cambio(&self) -> Option<f64> {
        Some(self.t_cambio)
    }

    fn tiene_dinamica(&self) -> bool {
        false
    }

    fn tomar_cambio(&mut self) -> bool {
        std::mem::take(&mut self.cambio)
    }
}

#[derive(Clone)]
pub struct PuenteSalida {
    out: usize,
    lo: Option<usize>,
    hi: Option<usize>,
    uo: U,
    ulo: U,
    uhi: U,
    v_lo: f64,
    v_hi: f64,
    r_lo: f64,
    r_hi: f64,
    t_rise: f64,
    t_fall: f64,
    /// La rampa del control: de `s0` en `t0` a `s1` en `t1`.
    s0: f64,
    t0: f64,
    s1: f64,
    t1: f64,
    /// Instante del último paso aceptado (para la lectura).
    t_acept: f64,
}

impl PuenteSalida {
    #[allow(clippy::too_many_arguments)]
    pub fn new(out: usize, lo: Option<usize>, hi: Option<usize>, v_lo: f64, v_hi: f64, r_lo: f64, r_hi: f64, t_rise: f64, t_fall: f64) -> Self {
        Self { out, lo, hi, uo: None, ulo: None, uhi: None, v_lo, v_hi, r_lo, r_hi, t_rise, t_fall, s0: 0.0, t0: 0.0, s1: 0.0, t1: 0.0, t_acept: 0.0 }
    }

    /// El control en el instante `t`.
    pub fn control(&self, t: f64) -> f64 {
        if t >= self.t1 {
            self.s1
        } else if t <= self.t0 {
            self.s0
        } else {
            self.s0 + (self.s1 - self.s0) * (t - self.t0) / (self.t1 - self.t0)
        }
    }

    /// Conductancia y corriente de Thévenin (sin los nodos) con el control `s`.
    fn thevenin(&self, s: f64) -> (f64, f64) {
        let g = 1.0 / ((1.0 - s) * self.r_lo + s * self.r_hi);
        (g, g * ((1.0 - s) * self.v_lo + s * self.v_hi))
    }

    /// Corriente que entrega a `out` con la solución `x` en el instante `t`.
    fn corriente(&self, x: &[f64], t: f64) -> f64 {
        let s = self.control(t);
        let (g, i0) = self.thevenin(s);
        g * ((1.0 - s) * volt(x, self.ulo) + s * volt(x, self.uhi) - volt(x, self.uo)) + i0
    }

    /// Estampa el Thévenin con el control `s`: entra `I` a `out`, sale `s I` de `hi` y `(1 - s) I` de `lo`.
    pub(crate) fn estampar(&self, c: &mut Ctx, s: f64) {
        let (g, i0) = self.thevenin(s);
        // I = g (-V(out) + (1 - s) V(lo) + s V(hi)) + i0: sus coeficientes por nodo.
        let coef = [(self.uo, -g), (self.ulo, g * (1.0 - s)), (self.uhi, g * s)];
        for (fila, f) in [(self.uo, 1.0), (self.ulo, -(1.0 - s)), (self.uhi, -s)] {
            // Fila de un nodo al que entra f · I: los términos con voltaje pasan a la izquierda con signo contrario.
            for &(col, a) in &coef {
                entry(c.m, fila, col, -f * a);
            }
            inject(c.rhs, fila, f * i0);
        }
    }

    pub(crate) fn tiempo_de_rampa(&self, desde: f64, hasta: f64) -> f64 {
        (hasta - desde).abs() * if hasta > desde { self.t_rise } else { self.t_fall }
    }
}

/// El valor del control para cada nivel.
pub(crate) fn objetivo(n: Nivel) -> f64 {
    match n {
        Nivel::Cero => 0.0,
        Nivel::Uno => 1.0,
        _ => 0.5,
    }
}

impl Device for PuenteSalida {
    fn bind(&mut self, a: &mut Alloc) {
        self.uo = a.ext(self.out);
        self.ulo = self.lo.and_then(|k| a.ext(k));
        self.uhi = self.hi.and_then(|k| a.ext(k));
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        let s = self.control(c.t);
        self.estampar(c, s);
        false
    }

    /// Con los niveles respecto de tierra y la misma resistencia en alto y en bajo, la matriz no cambia con la rampa.
    fn linear(&self) -> bool {
        self.lo.is_none() && self.hi.is_none() && self.r_lo == self.r_hi
    }

    fn tiene_quiebres(&self) -> bool {
        true
    }

    /// Su rampa es un punto de quiebre: fuera de ella no cambia.
    fn tiene_dinamica(&self) -> bool {
        false
    }

    fn next_break(&self, t: f64) -> f64 {
        if self.t1 > t + (t.abs() * 1e-12).max(1e-18) { self.t1 } else { f64::INFINITY }
    }

    fn accept(&mut self, _x: &[f64], _s0: &[f64], t: f64, _h: f64, _ev: &mut Vec<Event>) -> bool {
        self.t_acept = t;
        false
    }

    /// Corriente que entrega a `out`; en `aux`, el control (0 bajo, 1 alto, 0.5 X).
    fn reading(&self, x: &[f64], _s0: &[f64]) -> Reading {
        Reading { i: self.corriente(x, self.t_acept), aux: self.control(self.t_acept), estado: 0.0 }
    }

    /// La corriente `I` que entrega sale del dispositivo por `out`; de ella, la fracción `s` entra por `hi` y el resto
    /// por `lo`, o por la tierra interna los que no están (la alimentación implícita).
    fn corrientes_propias(&self) -> bool {
        true
    }

    fn corrientes(&self, _x: &[f64], _s0: &[f64], r: &Reading, out: &mut [f64]) {
        let (i, s) = (r.i, r.aux);
        out[0] = -i;
        let mut k = 1;
        let mut tierra = 0.0;
        for (nodo, parte) in [(self.lo, (1.0 - s) * i), (self.hi, s * i)] {
            if nodo.is_some() {
                out[k] = parte;
                k += 1;
            } else {
                tierra += parte;
            }
        }
        out[k] = tierra;
    }

    fn fijar_nivel(&mut self, t: f64, n: Nivel, inmediato: bool) -> bool {
        let s1 = objetivo(n);
        let s0 = if inmediato { s1 } else { self.control(t) };
        self.s0 = s0;
        self.t0 = t;
        self.s1 = s1;
        self.t1 = t + self.tiempo_de_rampa(s0, s1);
        true
    }
}

/// Etapa de salida y descarga del 555: un puente de salida respecto de VCC y GND y un interruptor DIS-GND con la misma rampa (`g_on` en bajo, `g_off` en alto). La corriente de salida sale de VCC en alto y entra a GND en bajo.
#[derive(Clone)]
pub struct Salida555 {
    salida: PuenteSalida,
    dis: usize,
    gnd: usize,
    udis: U,
    ugnd: U,
    g_on: f64,
    g_off: f64,
}

impl Salida555 {
    #[allow(clippy::too_many_arguments)]
    pub fn new(out: usize, dis: usize, vcc: usize, gnd: usize, v_lo: f64, r_lo: f64, v_hi: f64, r_hi: f64, g_on: f64, g_off: f64, t_rise: f64, t_fall: f64) -> Self {
        Self { salida: PuenteSalida::new(out, Some(gnd), Some(vcc), v_lo, v_hi, r_lo, r_hi, t_rise, t_fall), dis, gnd, udis: None, ugnd: None, g_on, g_off }
    }

    fn descarga(&self, s: f64) -> f64 {
        (1.0 - s) * self.g_on + s * self.g_off
    }
}

impl Device for Salida555 {
    fn bind(&mut self, a: &mut Alloc) {
        self.salida.bind(a);
        self.udis = a.ext(self.dis);
        self.ugnd = a.ext(self.gnd);
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        let s = self.salida.control(c.t);
        self.salida.estampar(c, s);
        stamp_g(c.m, self.udis, self.ugnd, self.descarga(s));
        false
    }

    fn tiene_quiebres(&self) -> bool {
        true
    }

    fn next_break(&self, t: f64) -> f64 {
        self.salida.next_break(t)
    }

    fn tiene_dinamica(&self) -> bool {
        false
    }

    fn accept(&mut self, x: &[f64], s0: &[f64], t: f64, h: f64, ev: &mut Vec<Event>) -> bool {
        self.salida.accept(x, s0, t, h, ev)
    }

    /// Corriente que entrega la salida; en `aux`, la que entra por DIS; en `estado`, el control (0 bajo, 1 alto).
    fn reading(&self, x: &[f64], s0: &[f64]) -> Reading {
        let r = self.salida.reading(x, s0);
        let g = self.descarga(r.aux);
        Reading { i: r.i, aux: g * (volt(x, self.udis) - volt(x, self.ugnd)), estado: r.aux }
    }

    /// La salida como un puente con los niveles respecto de VCC (alto) y GND (bajo); la descarga entra por DIS y sale
    /// por GND. Casillas: OUT, DIS, VCC, GND y la tierra interna (cero).
    fn corrientes_propias(&self) -> bool {
        true
    }

    fn corrientes(&self, _x: &[f64], _s0: &[f64], r: &Reading, out: &mut [f64]) {
        let (i, idis, s) = (r.i, r.aux, r.estado);
        out[0] = -i;
        out[1] = idis;
        out[2] = s * i;
        out[3] = (1.0 - s) * i - idis;
        out[4] = 0.0;
    }

    fn fijar_nivel(&mut self, t: f64, n: Nivel, inmediato: bool) -> bool {
        self.salida.fijar_nivel(t, n, inmediato)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::digital::Nivel::{Cero, Uno, X};

    #[test]
    fn el_puente_de_entrada_lee_cero_x_y_uno() {
        let p = PuenteEntrada::new(1, 0, 1.5, 3.5, None, 0.0);
        assert_eq!([p.leer(0.0), p.leer(1.5), p.leer(1.6), p.leer(3.49), p.leer(3.5), p.leer(5.0)], [Cero, Cero, X, X, Uno, Uno]);
        // Un comparador sin zona X: lo que no llega al umbral es 0.
        let c = PuenteEntrada::new(1, 2, 0.0, 0.0, None, 0.0);
        assert_eq!([c.leer(-1e-9), c.leer(0.0), c.leer(1e-9)], [Cero, Uno, Uno]);
        assert_eq!(c.nivel_logico(), Some(Uno));
    }

    #[test]
    fn el_cruce_es_la_fraccion_del_paso_donde_cambia_el_nivel() {
        let mut p = PuenteEntrada::new(1, 0, 1.5, 3.5, None, 0.0);
        p.bind(&mut Alloc::new(2));
        // De 0 V a 5 V en el paso: desde 0, lo primero que cambia el nivel es pasar de in_low (a X).
        assert_eq!(p.cruce(&[0.0], &[5.0]), Some(0.3));
        // Sin cambio de nivel no hay cruce.
        assert_eq!(p.cruce(&[0.0], &[1.0]), None);
        p.nivel = X;
        assert_eq!(p.cruce(&[2.0], &[4.0]), Some(0.75));
        p.nivel = Uno;
        assert_eq!(p.cruce(&[5.0], &[3.0]), Some(0.75));
    }

    #[test]
    fn la_salida_del_555_sigue_a_su_vcc_y_su_descarga_conduce_en_bajo() {
        use crate::{Netlist, Transient};
        let red = |n: Nivel| {
            let mut tr = Transient::new(
                Netlist::from_json(r#"{"nodes":4,"digital_nets":1,"elements":[
                    {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},
                    {"type":"R","a":1,"b":3,"ohms":1000},
                    {"type":"R","a":2,"b":0,"ohms":10000},
                    {"type":"OUT555","q":0,"out":2,"dis":3,"vcc":1,"gnd":0,"v_lo":0.025,"r_lo":7.5,"v_hi":-1.4,"r_hi":3,"g_on":0.06666666666666667,"g_off":1e-9,"t_rise":1e-7,"t_fall":1e-7}]}"#)
                .unwrap(),
                1e-6,
            )
            .unwrap();
            assert!(tr.fijar_nivel(3, n, true));
            tr.advance_to(1e-4, u32::MAX).unwrap();
            tr
        };
        let alto = red(Uno);
        assert!((alto.voltage(2) - 3.6 * 10000.0 / 10003.0).abs() < 1e-6, "salida {}", alto.voltage(2));
        assert!((alto.voltage(3) - 5.0).abs() < 1e-5, "descarga abierta: {}", alto.voltage(3));
        let bajo = red(Cero);
        assert!((bajo.voltage(2) - 0.025 * 10000.0 / 10007.5).abs() < 1e-6, "salida {}", bajo.voltage(2));
        assert!((bajo.voltage(3) - 5.0 * 15.0 / 1015.0).abs() < 1e-6, "descarga cerrada: {}", bajo.voltage(3));
        assert!((bajo.readings()[3].aux - (5.0 - bajo.voltage(3)) / 1000.0).abs() < 1e-9);
    }

    #[test]
    fn el_puente_de_salida_sube_en_rampa_desde_donde_va() {
        let mut s = PuenteSalida::new(1, None, None, 0.0, 5.0, 55.0, 55.0, 10e-9, 5e-9);
        assert!(s.fijar_nivel(0.0, Cero, true));
        assert_eq!(s.control(1.0), 0.0);
        assert!(s.fijar_nivel(100e-9, Uno, false));
        assert_eq!(s.control(100e-9), 0.0);
        assert!((s.control(105e-9) - 0.5).abs() < 1e-12);
        assert_eq!(s.control(111e-9), 1.0);
        assert!((s.next_break(100e-9) - 110e-9).abs() < 1e-20);
        assert_eq!(s.next_break(111e-9), f64::INFINITY);
        // Bajar desde la mitad de una subida: del 0.5 que lleva a 0 en la mitad del tiempo de bajada.
        s.fijar_nivel(200e-9, Cero, true);
        s.fijar_nivel(300e-9, Uno, false);
        assert!((s.control(305e-9) - 0.5).abs() < 1e-9);
        s.fijar_nivel(305e-9, Cero, false);
        assert!((s.next_break(305e-9) - (305e-9 + 2.5e-9)).abs() < 1e-20);
        // X va a la mitad.
        s.fijar_nivel(1e-6, X, true);
        assert_eq!(s.control(2e-6), 0.5);
    }
}
