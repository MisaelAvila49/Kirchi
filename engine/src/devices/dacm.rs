//! Convertidor multiplicador (`DACM`): los `bits` (la red más significativa primero) dan un código y `k` = código / 2^n escala la referencia `ref_p` - `ref_n`.
//! En voltaje, V(out) - V(ret) = k (V(ref_p) - V(ref_n)) con una rama. En corriente, una rama de 0 V mantiene `ref_p` al voltaje de `ref_n` y mide la corriente de referencia; de `out` a `ret` pasa k veces esa corriente.
//! Un cambio de código va en rampa lineal de `t_asentamiento` con quiebres en sus extremos, como la del puente de salida.

use super::{entry, stamp_g, volt, Alloc, Ctx, Device, Event, Reading, U};
use crate::digital::Nivel;
use crate::netlist::ModoDacm;

#[derive(Clone)]
pub struct Dacm {
    modo: ModoDacm,
    out: usize,
    ret: usize,
    ref_p: usize,
    ref_n: usize,
    t_asentamiento: f64,
    /// Resistencia en serie de la salida en voltaje y en paralelo en corriente (cero si no la lleva).
    r_out: f64,
    /// El último nivel de cada bit y el código que dieron cuando todos estaban definidos.
    niveles: Vec<Nivel>,
    codigo: u32,
    /// 2^n: el código máximo más uno.
    escala: f64,
    /// La rampa de `k`: de `s0` en `t0` a `s1` en `t1`.
    s0: f64,
    t0: f64,
    s1: f64,
    t1: f64,
    /// Instante del último paso aceptado (para la lectura).
    t_acept: f64,
    indefinidos: u64,
    uo: U,
    ur: U,
    up: U,
    un: U,
    br: usize,
}

impl Dacm {
    #[allow(clippy::too_many_arguments)]
    pub fn new(modo: ModoDacm, out: usize, ret: usize, ref_p: usize, ref_n: usize, bits: usize, t_asentamiento: f64, r_out: Option<f64>) -> Self {
        Self {
            modo,
            out,
            ret,
            ref_p,
            ref_n,
            t_asentamiento,
            r_out: r_out.unwrap_or(0.0),
            niveles: vec![Nivel::X; bits],
            codigo: 0,
            escala: (1u64 << bits) as f64,
            s0: 0.0,
            t0: 0.0,
            s1: 0.0,
            t1: 0.0,
            t_acept: 0.0,
            indefinidos: 0,
            uo: None,
            ur: None,
            up: None,
            un: None,
            br: 0,
        }
    }

    /// El factor `k` en el instante `t`.
    pub fn k(&self, t: f64) -> f64 {
        if t >= self.t1 {
            self.s1
        } else if t <= self.t0 {
            self.s0
        } else {
            self.s0 + (self.s1 - self.s0) * (t - self.t0) / (self.t1 - self.t0)
        }
    }

    fn conductancia_salida(&self) -> f64 {
        if self.r_out > 0.0 { 1.0 / self.r_out } else { 0.0 }
    }
}

impl Device for Dacm {
    fn bytes_heap(&self) -> usize {
        self.niveles.len() * std::mem::size_of::<Nivel>()
    }

    fn bind(&mut self, a: &mut Alloc) {
        self.uo = a.ext(self.out);
        self.ur = a.ext(self.ret);
        self.up = a.ext(self.ref_p);
        self.un = a.ext(self.ref_n);
        self.br = a.branch();
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        let k = self.k(c.t);
        let br = Some(self.br);
        match self.modo {
            ModoDacm::Voltaje => {
                entry(c.m, self.uo, br, 1.0);
                entry(c.m, self.ur, br, -1.0);
                entry(c.m, br, self.uo, 1.0);
                entry(c.m, br, self.ur, -1.0);
                entry(c.m, br, self.up, -k);
                entry(c.m, br, self.un, k);
                if self.r_out > 0.0 {
                    entry(c.m, br, br, -self.r_out);
                }
            }
            ModoDacm::Corriente => {
                // La rama de 0 V entre las referencias: la corriente que la cruza es la de referencia.
                entry(c.m, self.up, br, 1.0);
                entry(c.m, self.un, br, -1.0);
                entry(c.m, br, self.up, 1.0);
                entry(c.m, br, self.un, -1.0);
                entry(c.m, self.uo, br, k);
                entry(c.m, self.ur, br, -k);
                let g = self.conductancia_salida();
                if g > 0.0 {
                    stamp_g(c.m, self.uo, self.ur, g);
                }
            }
        }
        false
    }

    /// La matriz depende de `k`, que cambia con el tiempo en la rampa.
    fn linear(&self) -> bool {
        false
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

    /// Corriente que entra por `out`; en `aux`, el voltaje de salida; en `estado`, el código vigente.
    fn reading(&self, x: &[f64], _s0: &[f64]) -> Reading {
        let vsal = volt(x, self.uo) - volt(x, self.ur);
        let i = match self.modo {
            ModoDacm::Voltaje => x[self.br],
            ModoDacm::Corriente => self.k(self.t_acept) * x[self.br] + self.conductancia_salida() * vsal,
        };
        Reading { i, aux: vsal, estado: f64::from(self.codigo) }
    }

    /// Casillas: out, ret, ref_p, ref_n y la tierra interna (cero).
    fn corrientes_propias(&self) -> bool {
        true
    }

    fn corrientes(&self, x: &[f64], _s0: &[f64], r: &Reading, out: &mut [f64]) {
        out[4] = 0.0;
        match self.modo {
            ModoDacm::Voltaje => {
                (out[0], out[1], out[2], out[3]) = (r.i, -r.i, 0.0, 0.0);
            }
            ModoDacm::Corriente => {
                let iref = x[self.br];
                (out[0], out[1], out[2], out[3]) = (r.i, -r.i, iref, -iref);
            }
        }
    }

    fn fijar_nivel_bit(&mut self, t: f64, bit: usize, n: Nivel, inmediato: bool) -> bool {
        let Some(nivel) = self.niveles.get_mut(bit) else { return false };
        *nivel = n;
        let mut codigo = 0u32;
        let mut definido = true;
        for nv in &self.niveles {
            codigo <<= 1;
            match nv {
                Nivel::Uno => codigo |= 1,
                Nivel::Cero => {}
                _ => definido = false,
            }
        }
        // Con un bit en X o Z se conserva el último código definido.
        if !definido {
            if !inmediato {
                self.indefinidos += 1;
            }
            return false;
        }
        if codigo == self.codigo {
            return false;
        }
        self.codigo = codigo;
        let s1 = f64::from(codigo) / self.escala;
        let s0 = if inmediato { s1 } else { self.k(t) };
        (self.s0, self.t0, self.s1) = (s0, t, s1);
        self.t1 = if inmediato { t } else { t + self.t_asentamiento };
        true
    }

    fn indefinidos(&self) -> u64 {
        self.indefinidos
    }
}

#[cfg(test)]
mod tests {
    use crate::digital::Nivel::{Cero, Uno, X};
    use crate::{Netlist, Transient};

    const BITS: &str = "[0,1,2,3,4,5,6,7]";

    /// Referencia de 2.5 V; la salida (nodo 1) carga 1 kΩ.
    fn voltaje(t_asentamiento: f64, r_out: &str) -> Transient {
        let json = format!(
            r#"{{"nodes":3,"digital_nets":8,"elements":[
            {{"type":"V","a":2,"b":0,"wave":{{"kind":"dc","v":2.5}}}},
            {{"type":"R","a":1,"b":0,"ohms":1000}},
            {{"type":"DACM","modo":"voltaje","out":1,"ret":0,"ref_p":2,"ref_n":0,"bits":{BITS},"t_asentamiento":{t_asentamiento}{r_out}}}]}}"#
        );
        Transient::new(Netlist::from_json(&json).unwrap(), 1e-6).unwrap()
    }

    /// 5 V sobre 2.5 kΩ dan 2 mA de referencia; la salida (nodo 1) cuelga de 5 V por 1 kΩ y la corriente del convertidor baja su voltaje.
    fn corriente(t_asentamiento: f64) -> Transient {
        let json = format!(
            r#"{{"nodes":5,"digital_nets":8,"elements":[
            {{"type":"V","a":2,"b":0,"wave":{{"kind":"dc","v":5}}}},
            {{"type":"R","a":2,"b":3,"ohms":2500}},
            {{"type":"V","a":4,"b":0,"wave":{{"kind":"dc","v":5}}}},
            {{"type":"R","a":4,"b":1,"ohms":1000}},
            {{"type":"DACM","modo":"corriente","out":1,"ret":0,"ref_p":3,"ref_n":0,"bits":{BITS},"t_asentamiento":{t_asentamiento}}}]}}"#
        );
        Transient::new(Netlist::from_json(&json).unwrap(), 1e-6).unwrap()
    }

    fn poner(tr: &mut Transient, elem: usize, codigo: u32, inmediato: bool) {
        for b in 0..8 {
            let n = if codigo >> (7 - b) & 1 == 1 { Uno } else { Cero };
            tr.fijar_nivel_bit(elem, b, n, inmediato);
        }
    }

    #[test]
    fn en_voltaje_los_256_codigos_dan_k_por_la_referencia() {
        let mut tr = voltaje(1e-12, "");
        for codigo in 0..256u32 {
            poner(&mut tr, 2, codigo, true);
            let t = tr.time() + 1e-6;
            tr.advance_to(t, u32::MAX).unwrap();
            let esperado = f64::from(codigo) / 256.0 * 2.5;
            assert!((tr.voltage(1) - esperado).abs() < 1e-9, "código {codigo}: {} contra {esperado}", tr.voltage(1));
        }
    }

    #[test]
    fn en_corriente_los_256_codigos_dan_k_por_la_corriente_de_referencia() {
        let mut tr = corriente(1e-12);
        for codigo in 0..256u32 {
            poner(&mut tr, 4, codigo, true);
            let t = tr.time() + 1e-6;
            tr.advance_to(t, u32::MAX).unwrap();
            let io = f64::from(codigo) / 256.0 * 2e-3;
            assert!((tr.voltage(1) - (5.0 - io * 1000.0)).abs() < 1e-9, "código {codigo}: {}", tr.voltage(1));
            assert!((tr.voltage(3)).abs() < 1e-9, "la rama de referencia mantiene ref_p en el voltaje de ref_n");
            let r = tr.readings()[4];
            assert!((r.i - io).abs() < 1e-12 && (r.estado - f64::from(codigo)).abs() < 1e-12, "lectura {r:?}");
        }
    }

    #[test]
    fn el_cambio_de_codigo_va_en_rampa_lineal_y_se_asienta_en_su_tiempo() {
        let mut tr = voltaje(150e-9, "");
        tr.advance_to(1e-6, u32::MAX).unwrap();
        assert!(tr.voltage(1).abs() < 1e-12);
        poner(&mut tr, 2, 0xFF, false);
        for (dt, fraccion) in [(37.5e-9, 0.25), (75e-9, 0.5), (112.5e-9, 0.75), (150e-9, 1.0), (400e-9, 1.0)] {
            tr.advance_to(1e-6 + dt, u32::MAX).unwrap();
            let esperado = fraccion * 255.0 / 256.0 * 2.5;
            assert!((tr.voltage(1) - esperado).abs() < 1e-9, "a {dt} s: {} contra {esperado}", tr.voltage(1));
        }
    }

    #[test]
    fn un_cambio_a_media_rampa_parte_de_donde_va() {
        let mut tr = voltaje(100e-9, "");
        tr.advance_to(1e-6, u32::MAX).unwrap();
        poner(&mut tr, 2, 0x80, false);
        tr.advance_to(1e-6 + 50e-9, u32::MAX).unwrap();
        assert!((tr.voltage(1) - 0.25 * 2.5).abs() < 1e-9, "{}", tr.voltage(1));
        poner(&mut tr, 2, 0x00, false);
        tr.advance_to(1e-6 + 100e-9, u32::MAX).unwrap();
        assert!((tr.voltage(1) - 0.125 * 2.5).abs() < 1e-9, "{}", tr.voltage(1));
        tr.advance_to(1e-6 + 200e-9, u32::MAX).unwrap();
        assert!(tr.voltage(1).abs() < 1e-9, "{}", tr.voltage(1));
    }

    #[test]
    fn un_bit_en_x_o_z_conserva_el_ultimo_codigo_y_se_cuenta() {
        let mut tr = voltaje(1e-12, "");
        poner(&mut tr, 2, 0xC0, true);
        tr.advance_to(1e-6, u32::MAX).unwrap();
        let esperado = 192.0 / 256.0 * 2.5;
        assert!((tr.voltage(1) - esperado).abs() < 1e-9);
        // El bit menos significativo pasa a X y luego otro a Z: el código no se mueve.
        tr.fijar_nivel_bit(2, 7, X, false);
        tr.fijar_nivel_bit(2, 3, crate::digital::Nivel::Z, false);
        tr.advance_to(2e-6, u32::MAX).unwrap();
        assert!((tr.voltage(1) - esperado).abs() < 1e-9, "{}", tr.voltage(1));
        assert_eq!(tr.indefinidos(2), 2);
        // Al definirse de nuevo con el mismo código no hay cambio.
        tr.fijar_nivel_bit(2, 7, Cero, false);
        tr.fijar_nivel_bit(2, 3, Cero, false);
        tr.advance_to(3e-6, u32::MAX).unwrap();
        assert!((tr.voltage(1) - esperado).abs() < 1e-9);
        assert_eq!(tr.readings()[2].estado, 192.0);
    }

    #[test]
    fn la_resistencia_de_salida_en_voltaje_queda_en_serie() {
        let mut tr = voltaje(1e-12, r#","r_out":1000"#);
        poner(&mut tr, 2, 0x80, true);
        tr.advance_to(1e-6, u32::MAX).unwrap();
        // 1.25 V a través de 1 kΩ en serie con la carga de 1 kΩ.
        assert!((tr.voltage(1) - 0.625).abs() < 1e-9, "{}", tr.voltage(1));
    }

    /// Un flanco de 0 a 5 V en 1.3 µs cruza 2.5 V medio nanosegundo después; un búfer de 10 ns sube el bit más significativo.
    fn reloj_a_bit() -> crate::Mixto {
        let mut els = vec![
            r#"{"type":"V","a":1,"b":0,"wave":{"kind":"pwl","puntos":[[0,0],[1.3e-6,0],[1.301e-6,5]]}}"#.to_string(),
            r#"{"type":"ADC","p":1,"n":0,"out":0,"in_low":2.5,"in_high":2.5}"#.to_string(),
            r#"{"type":"GATE","fn":"buf","inputs":[0],"output":1,"rise_delay":1e-8,"fall_delay":1e-8}"#.to_string(),
            r#"{"type":"V","a":2,"b":0,"wave":{"kind":"dc","v":2.5}}"#.to_string(),
            r#"{"type":"R","a":3,"b":0,"ohms":1000}"#.to_string(),
        ];
        els.extend((2..9).map(|r| format!(r#"{{"type":"LOGIC","out":{r},"value":0}}"#)));
        els.push(r#"{"type":"DACM","modo":"voltaje","out":3,"ret":0,"ref_p":2,"ref_n":0,"bits":[1,2,3,4,5,6,7,8],"t_asentamiento":1e-7}"#.to_string());
        let json = format!(r#"{{"nodes":4,"digital_nets":9,"lectores":[{{"kind":"v","p":3,"n":0}}],"elements":[{}]}}"#, els.join(","));
        crate::Mixto::new(Netlist::from_json(&json).unwrap(), 1e-6).unwrap()
    }

    #[test]
    fn la_isla_del_convertidor_se_detiene_exactamente_en_el_cambio_de_codigo() {
        // La isla del convertidor no tiene dinámica: sin horizonte saltaría de una vez a la meta y la rampa empezaría tarde.
        let mut m = reloj_a_bit();
        let te = 1.3e-6 + 0.5e-9 + 1e-8;
        for dt in [-50e-9, 50e-9, 200e-9] {
            m.pedir_muestra(0, te + dt).unwrap();
        }
        m.advance_to(5e-6, u32::MAX).unwrap();
        let mut v = Vec::new();
        m.tomar_muestras(&mut v);
        let v: Vec<f64> = v.iter().map(|s| s.v).collect();
        assert_eq!(v.len(), 3);
        for (leido, esperado) in v.iter().zip([0.0, 0.625, 1.25]) {
            assert!((leido - esperado).abs() < 2e-3, "{v:?}");
        }
    }
}
