//! Fuente de laboratorio de un canal: entrega por `a` la corriente i = ilim · tanh((v − V(a, b)) / vk), es decir una fuente de voltaje `v` en CV y una de corriente `ilim` en CC, con rodilla suave.
//! El macromodelo con amplificador se descartó midiendo con ngspice (sube a 32.8 V al quitar la carga y aborta cerca del riel). La netlist agrega su capacitor de salida. Apagada es 1 GΩ.

use super::{close, stamp_g, stamp_i, volt, Alloc, Ctx, Device, Event, Mode, Reading, Tol, GMIN, U};
use crate::netlist::Element;

/// Conductancia de la salida apagada (1 GΩ, el abierto del motor).
pub const G_APAGADA: f64 = 1e-9;
/// Lo más que cambia el voltaje entre sus terminales de una iteración de Newton a la siguiente (V): lejos de la rodilla la
/// tanh es casi plana y Newton daría saltos de miles de volts.
const PASO_LIMITE: f64 = 5.0;
/// El ancho de la rodilla para el limitador, en `vk`: tanh(4) = 0.9993, ya en el tramo plano.
const RODILLA: f64 = 4.0;
/// Desde qué fracción del límite la salida se cuenta en corriente constante (el indicador CC).
pub const UMBRAL_CC: f64 = 0.99;
/// Una corriente que cambia de signo de un paso al siguiente por más de esto (relativo y absoluto, A) pide un paso de Euler.
const RELTOL_ALTERNA: f64 = 1e-3;
const ABSTOL_ALTERNA: f64 = 1e-9;

#[derive(Clone)]
pub struct FuenteLab {
    a: usize,
    b: usize,
    v: f64,
    ilim: f64,
    vk: f64,
    encendida: bool,
    ua: U,
    ub: U,
    /// Voltaje entre las terminales, corriente y su derivada con que se estampó la última iteración (el limitador y la
    /// prueba de convergencia).
    vd_ant: f64,
    io_ant: f64,
    g_ant: f64,
    /// El voltaje de la fuente con que se estampó (el de la fuente salvo en el escalamiento de fuentes).
    v_it: f64,
    /// El tramo del último paso aceptado (true en CC); None antes del primero o apagada.
    tramo: Option<bool>,
    /// La corriente del último paso aceptado y cuánto cambió respecto del anterior (para ver si alterna de signo).
    io_acc: Option<f64>,
    d_acc: f64,
}

impl FuenteLab {
    pub fn new(a: usize, b: usize, v: f64, ilim: f64, vk: f64, encendida: bool) -> Self {
        Self { a, b, v, ilim, vk, encendida, ua: None, ub: None, vd_ant: 0.0, io_ant: 0.0, g_ant: 0.0, v_it: v, tramo: None, io_acc: None, d_acc: 0.0 }
    }

    /// La corriente que entrega por `a` con `vd` entre sus terminales, y su derivada respecto de `vd`.
    fn salida(&self, vd: f64) -> (f64, f64) {
        self.salida_con(self.v, vd)
    }

    /// Lo mismo con la fuente en `v` (el escalamiento de fuentes del rescate la baja).
    fn salida_con(&self, v: f64, vd: f64) -> (f64, f64) {
        let th = ((v - vd) / self.vk).tanh();
        (self.ilim * th, -self.ilim / self.vk * (1.0 - th * th))
    }

    /// El limitador de Newton, como `pnjlim` pero para una rodilla con los dos lados planos: un voltaje propuesto que cruza la
    /// rodilla y cae lejos del otro lado (donde la tanh ya casi no cambia y Newton saltaría de un lado al otro sin acercarse)
    /// se deja en la rodilla; cualquier otro cambio de más de `PASO_LIMITE` se acota a ese paso, como antes.
    fn limitar(&self, v: f64, vd: f64) -> (f64, bool) {
        let (nuevo, viejo) = (vd - v, self.vd_ant - v);
        let k = RODILLA * self.vk;
        if nuevo.abs() > k && nuevo.signum() != viejo.signum() {
            // Desde lejos del otro lado, al centro de la rodilla: ahí la pendiente es la mayor y Newton converge (desde
            // `RODILLA` rodillas se pasaría otra vez al otro lado). Desde dentro de la rodilla, a su borde del lado nuevo.
            return (if viejo.abs() > k { v } else { v + k * nuevo.signum() }, true);
        }
        if (vd - self.vd_ant).abs() > PASO_LIMITE {
            return (self.vd_ant + PASO_LIMITE * (vd - self.vd_ant).signum(), true);
        }
        (vd, false)
    }
}

impl Device for FuenteLab {
    fn bind(&mut self, a: &mut Alloc) {
        self.ua = a.ext(self.a);
        self.ub = a.ext(self.b);
    }

    fn load(&mut self, c: &mut Ctx) -> bool {
        if !self.encendida {
            stamp_g(c.m, self.ua, self.ub, G_APAGADA);
            return false;
        }
        // Con el escalamiento de fuentes del rescate, la fuente variable baja como las demás.
        let v = c.src * self.v;
        let mut vd = volt(c.x, self.ua) - volt(c.x, self.ub);
        let mut limito = false;
        if c.mode != Mode::InitTran {
            (vd, limito) = self.limitar(v, vd);
        }
        let (io, g) = self.salida_con(v, vd);
        (self.vd_ant, self.io_ant, self.g_ant, self.v_it) = (vd, io, g, v);
        // La corriente de `a` hacia `b` por dentro es −io ≈ (−g)·vd + (−io + g·vd), con −g ≥ 0.
        stamp_g(c.m, self.ua, self.ub, -g + GMIN);
        stamp_i(c.rhs, self.ua, self.ub, -io + g * vd);
        limito
    }

    /// Como una fuente B de ngspice: la corriente con la solución nueva debe ser la que predijo la linealización. Con la
    /// rodilla de milivoltios, la tolerancia de los nodos sola dejaría la corriente hasta ilim/vk veces su error.
    fn converged(&self, x: &[f64], _s0: &[f64], tol: &Tol) -> bool {
        if !self.encendida {
            return true;
        }
        let vd = volt(x, self.ua) - volt(x, self.ub);
        close(self.io_ant + self.g_ant * (vd - self.vd_ant), self.salida_con(self.v_it, vd).0, tol)
    }

    fn tiene_dinamica(&self) -> bool {
        false
    }

    /// Pasar de CV a CC o al revés, o una corriente que alterna de signo entre pasos, pide un paso de Euler: el polo de salida en CV (vk/ilim · C, hasta 0.17 ns) es mucho más rápido que el paso y el trapezoidal oscila a la mitad del muestreo.
    fn accept(&mut self, x: &[f64], _s0: &[f64], _t: f64, _h: f64, _ev: &mut Vec<Event>) -> bool {
        if !self.encendida {
            (self.tramo, self.io_acc, self.d_acc) = (None, None, 0.0);
            return false;
        }
        let vd = volt(x, self.ua) - volt(x, self.ub);
        let io = self.salida(vd).0;
        let tramo = Some(io.abs() >= UMBRAL_CC * self.ilim);
        let cambio = self.tramo.is_some() && tramo != self.tramo;
        self.tramo = tramo;
        let mut alterna = false;
        if let Some(previa) = self.io_acc {
            let d = io - previa;
            let umbral = RELTOL_ALTERNA * io.abs().max(previa.abs()) + ABSTOL_ALTERNA;
            alterna = d * self.d_acc < 0.0 && d.abs() > umbral && self.d_acc.abs() > umbral;
            self.d_acc = d;
        }
        self.io_acc = Some(io);
        if cambio || alterna {
            // El paso de Euler cambia la corriente de golpe: ese cambio no cuenta como la mitad de otra alternancia.
            self.d_acc = 0.0;
        }
        cambio || alterna
    }

    /// Corriente (negativa al entregar), en `aux` el voltaje entre sus terminales y en `estado` 1 en CC, 0 en CV y −1
    /// apagada.
    fn reading(&self, x: &[f64], _s0: &[f64]) -> Reading {
        let vd = volt(x, self.ua) - volt(x, self.ub);
        if !self.encendida {
            return Reading { i: G_APAGADA * vd, aux: vd, estado: -1.0 };
        }
        let (io, _) = self.salida(vd);
        Reading { i: -io, aux: vd, estado: if io.abs() >= UMBRAL_CC * self.ilim { 1.0 } else { 0.0 } }
    }

    fn set(&mut self, e: &Element) -> bool {
        match *e {
            Element::Psu { a, b, v, ilim, vk, encendida } if a == self.a && b == self.b => {
                (self.v, self.ilim, self.vk, self.encendida) = (v, ilim, vk, encendida);
                true
            }
            _ => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::devices::Tol;
    use crate::{Element, Netlist, Transient};

    /// La fuente de 12 V con su capacitor de 100 nF sobre `carga` ohms, con reltol de 1e-6 (con el 1e-3 de omisión Newton
    /// se detiene a unos 12 mV de la solución y la caída de la rodilla, de décimas de milivolt, no se distingue).
    fn fuente(ilim: f64, carga: f64) -> Transient {
        let json = format!(
            r#"{{"nodes":2,"elements":[
            {{"type":"PSU","a":1,"b":0,"v":12,"ilim":{ilim},"vk":0.005}},
            {{"type":"C","a":1,"b":0,"farads":1e-7}},
            {{"type":"R","a":1,"b":0,"ohms":{carga}}}]}}"#
        );
        let mut tr = Transient::new(Netlist::from_json(&json).unwrap(), 1e-5).unwrap();
        tr.set_tolerances(Tol { reltol: 1e-6, ..Tol::default() });
        tr
    }

    #[test]
    fn en_voltaje_constante_da_su_voltaje_con_la_caida_de_la_rodilla() {
        let mut tr = fuente(0.1, 1000.0);
        tr.advance_to(2e-3, u32::MAX).unwrap();
        // 12 − 5 mV · atanh(12 mA / 100 mA) = 11.9994 V (ngspice: 11.99940).
        assert!((tr.voltage(1) - 11.99940).abs() < 2e-5, "{}", tr.voltage(1));
        assert_eq!(tr.readings()[0].estado, 0.0);
        // La fuente, el capacitor y la carga cumplen la ley de corrientes, y el capacitor ya no lleva corriente: el arranque
        // pasa de CC a CV y el paso de Euler de ese cambio (y el de cualquier alternancia) apaga la oscilación del trapezoidal
        // con el polo de 5 ns de la salida (antes quedaban unos 20 µA alternando a los 3.7 ms).
        let r = tr.readings();
        assert!((r[0].i + r[1].i + r[2].i).abs() < 1e-7, "{} + {} + {}", r[0].i, r[1].i, r[2].i);
        assert!(r[1].i.abs() < 12e-6, "capacitor con {} A", r[1].i);
    }

    #[test]
    fn en_corriente_constante_da_el_limite_y_el_voltaje_baja() {
        let mut tr = fuente(0.1, 10.0);
        tr.advance_to(2e-3, u32::MAX).unwrap();
        assert!((tr.voltage(1) - 1.0).abs() < 1e-4, "{}", tr.voltage(1));
        assert_eq!(tr.readings()[0].estado, 1.0);
    }

    #[test]
    fn con_tres_amperes_arranca_desde_cero_sin_rescate() {
        // Lo que ngspice no resolvía sin el capacitor: 3 A de límite sobre 9.9 Ω, desde t = 0 con todo descargado.
        let mut tr = fuente(3.0, 9.9);
        tr.advance_to(1e-3, u32::MAX).unwrap();
        assert!((tr.voltage(1) - 11.99786).abs() < 1e-4, "{}", tr.voltage(1));
        // Algún intento de Newton se repite con un paso más corto (cinco en el ensayo), sin llegar al rescate.
        assert!(tr.perfil.fallos < 20, "{} fallos", tr.perfil.fallos);
    }

    #[test]
    fn el_limite_y_la_salida_cambian_en_caliente() {
        let mut tr = fuente(0.1, 10.0);
        tr.advance_to(1e-3, u32::MAX).unwrap();
        tr.set_element(0, Element::Psu { a: 1, b: 0, v: 12.0, ilim: 3.0, vk: 0.005, encendida: true }).unwrap();
        tr.advance_to(2e-3, u32::MAX).unwrap();
        assert!((tr.voltage(1) - 12.0).abs() < 0.01, "CV con 3 A: {}", tr.voltage(1));
        tr.set_element(0, Element::Psu { a: 1, b: 0, v: 12.0, ilim: 3.0, vk: 0.005, encendida: false }).unwrap();
        tr.advance_to(4e-3, u32::MAX).unwrap();
        assert!(tr.voltage(1).abs() < 1e-3, "apagada: {}", tr.voltage(1));
        assert_eq!(tr.readings()[0].estado, -1.0);
    }

    #[test]
    fn sin_capacitor_de_salida_converge_al_arrancar_y_al_soltar_la_carga() {
        // Lo que hizo abortar a ngspice (la fuente B sin capacitor, 3 A, desde cero) y el salto de vuelta al soltar la carga:
        // de CC sobre 1 Ω (3 V) a CV sobre 1 kΩ (12 V) en un paso, sin nada que frene el voltaje. Sin un limitador que conozca
        // la rodilla, Newton salta de un lado al otro de la tanh, casi plana a los dos lados.
        for ilim in [1e-3, 0.1, 3.0] {
            let json = format!(r#"{{"nodes":2,"elements":[{{"type":"PSU","a":1,"b":0,"v":12,"ilim":{ilim},"vk":0.005}},{{"type":"R","a":1,"b":0,"ohms":1}}]}}"#);
            let mut tr = Transient::new(Netlist::from_json(&json).unwrap(), 1e-5).unwrap();
            tr.advance_to(1e-4, u32::MAX).unwrap_or_else(|e| panic!("{ilim} A, al arrancar: {e:?}"));
            assert!((tr.voltage(1) - ilim).abs() < 1e-3 * ilim.max(1e-3), "{ilim} A en CC: {}", tr.voltage(1));
            let fallos = tr.perfil.fallos;
            tr.set_element(1, Element::R { a: 1, b: 0, ohms: 1e6 }).unwrap();
            tr.advance_to(2e-4, u32::MAX).unwrap_or_else(|e| panic!("{ilim} A, al soltar la carga: {e:?}"));
            assert!((tr.voltage(1) - 12.0).abs() < 0.01, "{ilim} A en CV: {}", tr.voltage(1));
            assert!(tr.perfil.fallos - fallos < 5, "{ilim} A: {} intentos fallidos al soltar la carga", tr.perfil.fallos - fallos);
        }
    }

    #[test]
    fn en_el_escalamiento_de_fuentes_baja_como_las_demas() {
        // El rescate de convergencia sube las fuentes de 10 % a 100 % (`Ctx::src`): a la cuarta parte, la fuente variable de
        // 12 V es de 3 V. Con 3 V entre sus terminales no entrega corriente (el centro de la rodilla).
        use crate::canales::Canales;
        use crate::dense::DenseLu;
        use crate::devices::{Alloc, Ctx, Device, Mode};
        let mut f = super::FuenteLab::new(1, 0, 12.0, 0.1, 0.005, true);
        f.bind(&mut Alloc::new(2));
        let mut m = DenseLu::new(1);
        let (x, mut rhs) = ([3.0], [0.0]);
        let (mut s0, mut s1, s2) = ([0.0; 0], [0.0; 0], [0.0; 0]);
        let mut c = Ctx { x: &x, m: &mut m, rhs: &mut rhs, s0: &mut s0, s1: &mut s1, s2: &s2, mode: Mode::Float, order: 1, ag0: 0.0, ag1: 0.0, xfact: 1.0, t: 0.0, h: 1e-6, gmin: 1e-12, src: 0.25, canales: &Canales::default() };
        f.load(&mut c);
        // La corriente de `a` a `b` por dentro es −io + g·vd, que entra al lado derecho de `a` con el signo cambiado: io − g·vd,
        // con io = 0 en el centro de la rodilla y g = −ilim/vk: 20 S · 3 V = 60 A. Con la fuente entera (12 V), 3 V está en el
        // tramo plano: io es el límite, g casi cero, y daría 0.1.
        assert!((rhs[0] - 0.1 / 0.005 * 3.0).abs() < 1e-9, "{}", rhs[0]);
    }

    /// La corriente del capacitor de salida en los `n` pasos que siguen a `desde`: en CV quieta debe ser casi cero.
    fn corriente_del_capacitor(tr: &mut Transient, desde: f64, n: usize) -> f64 {
        tr.advance_to(desde, u32::MAX).unwrap();
        let mut peor: f64 = 0.0;
        for _ in 0..n {
            tr.step().unwrap();
            peor = peor.max(tr.readings()[1].i.abs());
        }
        peor
    }

    #[test]
    fn al_pasar_de_corriente_constante_a_voltaje_constante_la_corriente_no_queda_alternando() {
        // Con paso de 1 µs, el cambio de CC a CV sin paso de Euler deja la corriente del capacitor alternando de signo (±1.5 mA sobre 12 mA, y con 3 A durante cientos de ms).
        for (ilim, baja) in [(0.1, 10.0), (3.0, 1.0)] {
            let json = format!(
                r#"{{"nodes":2,"elements":[
                {{"type":"PSU","a":1,"b":0,"v":12,"ilim":{ilim},"vk":0.005}},
                {{"type":"C","a":1,"b":0,"farads":1e-7}},
                {{"type":"R","a":1,"b":0,"ohms":{baja}}}]}}"#
            );
            let mut tr = Transient::new(Netlist::from_json(&json).unwrap(), 1e-6).unwrap();
            tr.advance_to(1e-3, u32::MAX).unwrap();
            assert_eq!(tr.readings()[0].estado, 1.0, "con {ilim} A sobre {baja} Ω debe estar en CC");
            tr.set_element(2, Element::R { a: 1, b: 0, ohms: 1000.0 }).unwrap();
            let peor = corriente_del_capacitor(&mut tr, 2e-3, 200);
            assert_eq!(tr.readings()[0].estado, 0.0);
            assert!(peor < 12e-6, "con {ilim} A el capacitor sigue con {peor} A (la carga lleva 12 mA)");
        }
    }
}
