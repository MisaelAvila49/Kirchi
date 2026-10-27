//! Interruptor que sigue a un canal (`INTC`): `r_on` mientras el canal vale más de 0.5 y `r_off` en el resto. Como la fuente de valor externo, lee el canal al final de cada paso y su cambio es un quiebre del motor, así que mover una palanca no rehace la netlist.

use super::{stamp_g, volt, Alloc, Ctx, Device, Reading, U};

#[derive(Clone)]
pub struct InterruptorCanal {
    a: usize,
    b: usize,
    canal: usize,
    r_on: f64,
    r_off: f64,
    ua: U,
    ub: U,
    /// Casilla donde queda la conductancia del último paso (la lectura la necesita y el dispositivo no ve los canales).
    st: usize,
}

impl InterruptorCanal {
    pub fn new(a: usize, b: usize, canal: usize, r_on: f64, r_off: f64) -> Self {
        Self { a, b, canal, r_on, r_off, ua: None, ub: None, st: 0 }
    }
}

impl Device for InterruptorCanal {
    /// No redefine `accept`: el motor no se lo pide.
    fn usa_accept(&self) -> bool {
        false
    }

    fn bind(&mut self, a: &mut Alloc) {
        self.ua = a.ext(self.a);
        self.ub = a.ext(self.b);
        self.st = a.states(1);
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        // El tramo del canal lo decide el punto medio del paso, como en la fuente de valor externo.
        let cerrado = c.canales.valor(self.canal, c.t - 0.5 * c.h, c.t) > 0.5;
        let g = 1.0 / if cerrado { self.r_on } else { self.r_off };
        stamp_g(c.m, self.ua, self.ub, g);
        c.s0[self.st] = g;
        false
    }

    /// Su conductancia depende del canal, que cambia entre pasos sin que cambie el paso.
    fn linear(&self) -> bool {
        false
    }

    /// Lo que cambia con el tiempo es el canal, y el motor ya lo trata como quiebre.
    fn tiene_dinamica(&self) -> bool {
        false
    }

    fn reading(&self, x: &[f64], s0: &[f64]) -> Reading {
        Reading { i: s0[self.st] * (volt(x, self.ua) - volt(x, self.ub)), ..Reading::default() }
    }
}

#[cfg(test)]
mod tests {
    use crate::{Mixto, Netlist, Transient};

    /// 5 V sobre un divisor de 1 kΩ y el interruptor (r_on 1 kΩ, r_off 1 GΩ) hacia tierra.
    fn divisor(inicial: u8) -> String {
        format!(
            r#"{{"nodes":3,"canales":[{{"inicial":{inicial}}}],"lectores":[{{"kind":"v","p":2,"n":0}}],"elements":[
            {{"type":"V","a":1,"b":0,"wave":{{"kind":"dc","v":5}}}},
            {{"type":"R","a":1,"b":2,"ohms":1000}},
            {{"type":"INTC","a":2,"b":0,"canal":0,"r_on":1000,"r_off":1e9}}]}}"#
        )
    }

    #[test]
    fn el_divisor_da_la_mitad_con_el_canal_en_1_y_casi_todo_con_el_canal_en_0() {
        for (canal, esperado) in [(1u8, 2.5), (0, 5.0 * 1e9 / (1e9 + 1000.0))] {
            let mut tr = Transient::new(Netlist::from_json(&divisor(canal)).unwrap(), 1e-5).unwrap();
            tr.advance_to(1e-4, u32::MAX).unwrap();
            assert!((tr.voltage(2) - esperado).abs() < 1e-6, "canal {canal}: {}", tr.voltage(2));
        }
    }

    #[test]
    fn un_cambio_de_canal_en_t_cierra_el_interruptor_en_t_exacto() {
        let mut m = Mixto::new(Netlist::from_json(&divisor(0)).unwrap(), 1e-5).unwrap();
        m.poner_valor(0, 1e-3, 1.0).unwrap();
        for t in [0.5e-3, 0.999e-3, 1.001e-3, 5e-3] {
            m.pedir_muestra(0, t).unwrap();
        }
        m.advance_to(10e-3, u32::MAX).unwrap();
        let mut v = Vec::new();
        m.tomar_muestras(&mut v);
        let v: Vec<f64> = v.iter().map(|s| s.v).collect();
        assert_eq!(v.len(), 4);
        assert!(v[0] > 4.99 && v[1] > 4.99, "{v:?}");
        assert!((v[2] - 2.5).abs() < 1e-6 && (v[3] - 2.5).abs() < 1e-6, "{v:?}");
        // La corriente leída es la del estado vigente.
        assert!((m.readings()[2].i - 2.5e-3).abs() < 1e-9, "{:?}", m.readings()[2]);
    }

    #[test]
    fn retroceder_conserva_el_estado_del_interruptor_sin_descartar_estados() {
        let mut m = Mixto::new(Netlist::from_json(&divisor(0)).unwrap(), 1e-5).unwrap();
        m.advance_to(1e-3, u32::MAX).unwrap();
        m.guardar_estado();
        m.poner_valor(0, 1.5e-3, 1.0).unwrap();
        m.advance_to(2e-3, u32::MAX).unwrap();
        assert!((m.voltage(2) - 2.5).abs() < 1e-6, "{}", m.voltage(2));
        let guardados = m.estados_guardados().0;
        assert_eq!(guardados, 1);
        // Escribir en el canal no tiró el estado guardado; al restaurar el interruptor vuelve a estar abierto.
        assert!(m.restaurar_estado().is_some());
        m.advance_to(2e-3, u32::MAX).unwrap();
        assert!(m.voltage(2) > 4.99, "{}", m.voltage(2));
    }
}
