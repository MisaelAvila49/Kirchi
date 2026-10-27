//! Dispositivos del motor: cada elemento se estampa en la matriz nodal modificada, linealizado en la iteración de Newton. Ecuaciones, limitadores e integración son los de ngspice (dioload.c, bjtload.c, mos1load.c, devsup.c, niinteg.c, cktterr.c) para que las cifras coincidan.

pub mod acople;
pub mod basic;
pub mod bjt;
pub mod controladas;
pub mod dacm;
pub mod diode;
pub mod externa;
pub mod fuente_lab;
pub mod fuse;
pub mod interruptor_canal;
pub mod jfet;
pub mod ldr;
pub mod lamp;
pub mod mos1;
pub mod motor;
pub mod opamp;
pub mod pasos;
pub mod puente;
pub mod quemado;
pub mod region;
pub mod relay;
pub mod termistor;
pub mod zumbador;

use crate::canales::Canales;
use crate::digital::Nivel;
use crate::mna::Stamp;
use crate::error::EngineError;
use crate::netlist::Element;

/// Incógnita del sistema: `None` es la tierra.
pub type U = Option<usize>;

/// Voltaje (o corriente de rama) de la incógnita `u` en la solución `x`.
#[inline]
pub fn volt(x: &[f64], u: U) -> f64 {
    u.map_or(0.0, |i| x[i])
}

/// Voltaje térmico a 27 °C, el de ngspice: CONSTKoverQ (1.38064852e-23 / 1.6021766208e-19) por 300.15 K.
pub const VT: f64 = 1.380_648_52e-23 / 1.602_176_620_8e-19 * 300.15;
/// Conductancia mínima en paralelo con cada unión (la `gmin` de SPICE).
pub const GMIN: f64 = 1e-12;
/// Exponente máximo de `exp` en todas las uniones (diodo y transistor): e^80 = 5.5e34 deja las corrientes y sus
/// productos con las conductancias muy por debajo del desborde (con 709, e^709 · e^709 da infinito y luego NaN).
/// Los estados que alcanza un circuito real (vd menor que 80 vt, unos 2 V) no se tocan.
pub const MAX_EXP_ARG: f64 = 80.0;
/// Corriente de una unión (A) por encima de la cual se la considera empujada a conducir sin nada que la limite.
pub const CORRIENTE_FORZADA: f64 = 1e3;
/// Corriente (A) a la que la exponencial de una unión deja de crecer y sigue en línea recta (misma pendiente): acota la
/// conductancia de la unión a unos 4e7 S y deja la matriz bien condicionada aunque la unión quede forzada.
pub const CORRIENTE_TOPE: f64 = 1e6;

/// Exponente a partir del cual la exponencial de una unión con corriente de saturación `is` se continúa en línea recta.
pub fn exp_tope(is: f64) -> f64 {
    (CORRIENTE_TOPE / is).ln().clamp(1.0, MAX_EXP_ARG)
}

/// Exponencial limitada: `exp(x)` hasta `tope` y, después, su tangente en `tope` (continua y con la misma derivada).
/// Devuelve el valor y la derivada respecto de `x`.
#[inline]
pub fn limexp(x: f64, tope: f64) -> (f64, f64) {
    if x <= tope {
        let e = x.exp();
        (e, e)
    } else {
        let e = tope.exp();
        (e * (1.0 + x - tope), e)
    }
}
/// Pasos aceptados seguidos con una unión forzada para declarar el error.
pub const PASOS_FORZADOS: u32 = 3;
/// Tiempo simulado seguido con una unión forzada (fracción del paso máximo) para declarar el error: un capacitor sin
/// resistencia en serie pide un pico de corriente de pocos nanosegundos al encender, que no cuenta.
pub const PERSISTENCIA_FORZADA: f64 = 0.01;

/// Reparte las incógnitas internas (nodos y corrientes de rama) y las casillas de estado de los dispositivos.
pub struct Alloc {
    /// Incógnitas repartidas hasta ahora; los nodos externos 1..n ocupan las primeras n - 1.
    pub n: usize,
    /// Por incógnita: true si es una corriente (su tolerancia de convergencia es la de corriente).
    pub is_current: Vec<bool>,
    /// Por incógnita: el elemento que la pidió (los nodos externos no tienen dueño único).
    pub owner: Vec<Option<usize>>,
    /// Elemento que se está enlazando.
    pub current: usize,
    pub states: usize,
}

impl Alloc {
    pub fn new(nodes: usize) -> Self {
        Self { n: nodes - 1, is_current: vec![false; nodes - 1], owner: vec![None; nodes - 1], current: 0, states: 0 }
    }

    /// Incógnita de un nodo externo de la netlist.
    pub fn ext(&self, k: usize) -> U {
        if k == 0 { None } else { Some(k - 1) }
    }

    /// Nodo interno nuevo (el de una resistencia en serie dentro de un modelo).
    pub fn node(&mut self) -> usize {
        self.is_current.push(false);
        self.owner.push(Some(self.current));
        self.n += 1;
        self.n - 1
    }

    /// Corriente de rama nueva (fuente de voltaje, inductor).
    pub fn branch(&mut self) -> usize {
        self.is_current.push(true);
        self.owner.push(Some(self.current));
        self.n += 1;
        self.n - 1
    }

    /// Nodo interno, salvo que la resistencia en serie no exista: entonces es el nodo `ext` mismo.
    pub fn node_if(&mut self, hay: bool, ext: U) -> U {
        if hay { Some(self.node()) } else { ext }
    }

    /// `k` casillas de estado consecutivas; devuelve la primera.
    pub fn states(&mut self, k: usize) -> usize {
        let b = self.states;
        self.states += k;
        b
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    /// Primera iteración del primer paso: las cargas del instante 0 salen de los voltajes iniciales (MODEINITTRAN).
    InitTran,
    /// Primera iteración de un paso: los voltajes de unión se extrapolan de los dos pasos anteriores (MODEINITPRED).
    Pred,
    /// Las demás iteraciones de Newton (MODEINITFLOAT).
    Float,
}

/// Lo que un dispositivo necesita para estamparse en una iteración.
pub struct Ctx<'a> {
    /// Solución de la iteración anterior (rhsOld).
    pub x: &'a [f64],
    pub m: &'a mut dyn Stamp,
    pub rhs: &'a mut [f64],
    /// Estado del paso que se resuelve.
    pub s0: &'a mut [f64],
    /// Estado de los dos pasos aceptados anteriores.
    pub s1: &'a mut [f64],
    pub s2: &'a [f64],
    pub mode: Mode,
    /// 1: Euler hacia atrás (tras una discontinuidad); 2: trapezoidal.
    pub order: u8,
    pub ag0: f64,
    pub ag1: f64,
    /// Paso actual entre el anterior, para extrapolar.
    pub xfact: f64,
    /// Tiempo al final del paso y su duración.
    pub t: f64,
    pub h: f64,
    pub gmin: f64,
    /// Factor de las fuentes independientes (1 salvo en el escalamiento de fuentes).
    pub src: f64,
    /// Los canales de valor que lee la isla.
    pub canales: &'a Canales,
}

/// Conductancia `g` entre `a` y `b`.
#[inline]
pub fn stamp_g(m: &mut dyn Stamp, a: U, b: U, g: f64) {
    if let Some(i) = a {
        m.add(i, i, g);
    }
    if let Some(j) = b {
        m.add(j, j, g);
    }
    if let (Some(i), Some(j)) = (a, b) {
        m.add(i, j, -g);
        m.add(j, i, -g);
    }
}

/// Una entrada de la matriz, si la fila y la columna no son tierra.
#[inline]
pub fn entry(m: &mut dyn Stamp, r: U, c: U, v: f64) {
    if let (Some(i), Some(j)) = (r, c) {
        m.add(i, j, v);
    }
}

/// Corriente `i` que entra al nodo `u` desde una fuente equivalente.
#[inline]
pub fn inject(rhs: &mut [f64], u: U, i: f64) {
    if let Some(k) = u {
        rhs[k] += i;
    }
}

/// Corriente `i` que circula de `a` hacia `b` por dentro de un elemento: sale de `a` y entra a `b`.
#[inline]
pub fn stamp_i(rhs: &mut [f64], a: U, b: U, i: f64) {
    inject(rhs, a, -i);
    inject(rhs, b, i);
}

/// Transconductancia: corriente de `a` hacia `b` por dentro del elemento que vale `g` por (V(c) - V(d)).
#[inline]
pub fn stamp_vccs(m: &mut dyn Stamp, a: U, b: U, c: U, d: U, g: f64) {
    entry(m, a, c, g);
    entry(m, a, d, -g);
    entry(m, b, c, -g);
    entry(m, b, d, g);
}

/// NIintegrate de ngspice: con la carga ya escrita en `s0[q]`, calcula la corriente del capacitor en `s0[q + 1]`
/// y devuelve la conductancia y la corriente equivalentes para la capacitancia `cap`.
pub fn integrate(c: &mut Ctx, cap: f64, q: usize) -> (f64, f64) {
    let ccap = if c.order == 1 {
        c.ag0 * c.s0[q] + c.ag1 * c.s1[q]
    } else {
        -c.s1[q + 1] * c.ag1 + c.ag0 * (c.s0[q] - c.s1[q])
    };
    c.s0[q + 1] = ccap;
    (c.ag0 * cap, ccap - c.ag0 * c.s0[q])
}

/// En la primera iteración del primer paso, la carga del instante 0 es la que se acaba de calcular.
#[inline]
pub fn init_charge(c: &mut Ctx, q: usize) {
    if c.mode == Mode::InitTran {
        c.s1[q] = c.s0[q];
    }
}

/// Lo mismo con la corriente del capacitor, después de integrar.
#[inline]
pub fn init_current(c: &mut Ctx, q: usize) {
    if c.mode == Mode::InitTran {
        c.s1[q + 1] = c.s0[q + 1];
    }
}

/// Voltaje extrapolado del estado `k` (la predicción de ngspice para la primera iteración de un paso).
#[inline]
pub fn predict(c: &mut Ctx, k: usize) -> f64 {
    c.s0[k] = c.s1[k];
    (1.0 + c.xfact) * c.s1[k] - c.xfact * c.s2[k]
}

/// Tolerancias de la convergencia y del control del paso (las opciones de ngspice con sus valores por omisión).
#[derive(Clone, Copy, Debug)]
pub struct Tol {
    pub reltol: f64,
    pub abstol: f64,
    pub vntol: f64,
    pub chgtol: f64,
    pub trtol: f64,
}

impl Default for Tol {
    fn default() -> Self {
        Self { reltol: 1e-3, abstol: 1e-12, vntol: 1e-6, chgtol: 1e-14, trtol: 7.0 }
    }
}

/// Lo que necesita la estimación del error de truncamiento: el estado de los últimos cuatro pasos.
pub struct Hist<'a> {
    pub s: [&'a [f64]; 4],
    /// Duración de los pasos: el actual y los tres anteriores.
    pub delta_old: [f64; 4],
    pub order: u8,
    pub tol: Tol,
}

/// CKTterr de ngspice: el paso más largo que respeta el error de truncamiento de la carga `q` (su corriente en `q + 1`).
pub fn terr(h: &Hist, q: usize, dt: &mut f64) {
    let t = &h.tol;
    let delta = h.delta_old[0];
    let volttol = t.abstol + t.reltol * h.s[0][q + 1].abs().max(h.s[1][q + 1].abs());
    let chargetol = t.reltol * h.s[0][q].abs().max(h.s[1][q].abs()).max(t.chgtol) / delta;
    let tol = volttol.max(chargetol);
    let order = h.order as usize;
    let mut diff = [0.0; 4];
    let mut deltmp = [0.0; 4];
    for i in (0..=order + 1).rev() {
        diff[i] = h.s[i][q];
    }
    deltmp[..=order].copy_from_slice(&h.delta_old[..=order]);
    let mut j = order as isize;
    loop {
        for i in 0..=j as usize {
            diff[i] = (diff[i] - diff[i + 1]) / deltmp[i];
        }
        j -= 1;
        if j < 0 {
            break;
        }
        for i in 0..=j as usize {
            deltmp[i] = deltmp[i + 1] + h.delta_old[i];
        }
    }
    let factor = if order == 1 { 0.5 } else { 1.0 / 12.0 };
    let mut del = t.trtol * tol / t.abstol.max(factor * diff[0].abs());
    if order == 2 {
        del = del.sqrt();
    }
    if del < *dt {
        *dt = del;
    }
}

/// Limitación del voltaje de una unión pn (DEVpnjlim de ngspice). Devuelve el voltaje y si limitó.
pub fn pnjlim(vnew: f64, vold: f64, vt: f64, vcrit: f64) -> (f64, bool) {
    if vnew > vcrit && (vnew - vold).abs() > vt + vt {
        let v = if vold > 0.0 {
            let arg = (vnew - vold) / vt;
            if arg > 0.0 { vold + vt * (2.0 + (arg - 2.0).ln()) } else { vold - vt * (2.0 + (2.0 - arg).ln()) }
        } else {
            vt * (vnew / vt).ln()
        };
        (v, true)
    } else if vnew < 0.0 {
        let arg = if vold > 0.0 { -vold - 1.0 } else { 2.0 * vold - 1.0 };
        if vnew < arg { (arg, true) } else { (vnew, false) }
    } else {
        (vnew, false)
    }
}

/// Carga y capacitancia de una unión con agotamiento (`cz` a 0 V, potencial `pb`, gradiente `mj`, coeficiente
/// `fc`), con la continuación lineal de SPICE por encima de `fc * pb`.
pub fn depletion(v: f64, cz: f64, pb: f64, mj: f64, fc: f64) -> (f64, f64) {
    if cz == 0.0 {
        return (0.0, 0.0);
    }
    let fcpb = fc * pb;
    if v < fcpb {
        let arg = 1.0 - v / pb;
        let sarg = (-mj * arg.ln()).exp();
        (pb * cz * (1.0 - arg * sarg) / (1.0 - mj), cz * sarg)
    } else {
        let xfc = (1.0 - fc).ln();
        let f1 = pb * (1.0 - ((1.0 - mj) * xfc).exp()) / (1.0 - mj);
        let f2 = ((1.0 + mj) * xfc).exp();
        let f3 = 1.0 - fc * (1.0 + mj);
        let czf2 = cz / f2;
        (cz * f1 + czf2 * (f3 * (v - fcpb) + (mj / (pb + pb)) * (v * v - fcpb * fcpb)), czf2 * (f3 + mj * v / pb))
    }
}

/// Limitación del voltaje de compuerta de un MOSFET (DEVfetlim de ngspice).
pub fn fetlim(vnew: f64, vold: f64, vto: f64) -> f64 {
    let vtsthi = (2.0 * (vold - vto)).abs() + 2.0;
    let vtstlo = (vold - vto).abs() + 1.0;
    let vtox = vto + 3.5;
    let delv = vnew - vold;
    let mut v = vnew;
    if vold >= vto {
        if vold >= vtox {
            if delv <= 0.0 {
                if vnew >= vtox {
                    if -delv > vtstlo {
                        v = vold - vtstlo;
                    }
                } else {
                    v = vnew.max(vto + 2.0);
                }
            } else if delv >= vtsthi {
                v = vold + vtsthi;
            }
        } else if delv <= 0.0 {
            v = vnew.max(vto - 0.5);
        } else {
            v = vnew.min(vto + 4.0);
        }
    } else if delv <= 0.0 {
        if -delv > vtsthi {
            v = vold - vtsthi;
        }
    } else {
        let vtemp = vto + 0.5;
        if vnew <= vtemp {
            if delv > vtstlo {
                v = vold + vtstlo;
            }
        } else {
            v = vtemp;
        }
    }
    v
}

/// Limitación del voltaje entre drenador y fuente (DEVlimvds de ngspice).
pub fn limvds(vnew: f64, vold: f64) -> f64 {
    if vold >= 3.5 {
        if vnew > vold {
            vnew.min(3.0 * vold + 2.0)
        } else if vnew < 3.5 {
            vnew.max(2.0)
        } else {
            vnew
        }
    } else if vnew > vold {
        vnew.min(4.0)
    } else {
        vnew.max(-0.5)
    }
}

/// Una corriente predicha está cerca de la calculada (la tolerancia de las pruebas de convergencia de ngspice).
#[inline]
pub fn close(hat: f64, i: f64, tol: &Tol) -> bool {
    (hat - i).abs() <= tol.reltol * hat.abs().max(i.abs()) + tol.abstol
}

/// Lo que se lee de un dispositivo tras cada paso aceptado.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Reading {
    /// Corriente principal: de `a` hacia `b` por dentro del elemento; la del colector, el drenador, la salida
    /// o la bobina en los de más terminales.
    pub i: f64,
    /// Segunda cifra: corriente de base, velocidad del motor (rad/s), calentamiento del foco o del fusible.
    pub aux: f64,
    /// Estado discreto: región del transistor, saturación del amplificador, contacto del relé, fusible fundido.
    pub estado: f64,
}

/// Un fusible que se fundió en el último paso: la corriente que lo fundió y cuánto duró la sobrecarga.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Event {
    pub element: usize,
    pub t: f64,
    pub amps: f64,
    pub seconds: f64,
}

/// Copia de un dispositivo con todo su estado (para guardar el estado del motor y retroceder). Se implementa sola para todo
/// dispositivo que sea `Clone`.
pub trait DeviceClone {
    fn clonar(&self) -> Box<dyn Device>;
}

impl<T: Device + Clone + 'static> DeviceClone for T {
    fn clonar(&self) -> Box<dyn Device> {
        Box::new(self.clone())
    }
}

pub trait Device: DeviceClone {
    /// Bytes que el dispositivo reserva en el montón además de su propia estructura (sus `Vec`): la copia del estado
    /// los cuenta para el tope de memoria de Retroceder. Sin vectores propios, 0.
    fn bytes_heap(&self) -> usize {
        0
    }
    /// Su estado no está más que en las casillas `st` del motor (una resistencia): guardar el estado no la copia.
    fn sin_estado_propio(&self) -> bool {
        false
    }
    /// Pide sus incógnitas internas y sus casillas de estado.
    fn bind(&mut self, a: &mut Alloc);
    /// Se estampa en la matriz y el lado derecho. Devuelve true si algún limitador actuó (la iteración no convergió).
    fn load(&mut self, c: &mut Ctx) -> bool;
    /// La prueba de convergencia de ngspice (DEVconvTest): con la solución nueva `x`, la corriente que predice la
    /// linealización debe quedar cerca de la que se calculó en `s0`. Sin ella, un nodo puede cumplir su tolerancia de
    /// voltaje mientras la corriente de un diodo muy conductor aún está lejos.
    fn converged(&self, _x: &[f64], _s0: &[f64], _tol: &Tol) -> bool {
        true
    }
    /// Reduce `dt` al paso que respeta el error de truncamiento de sus cargas.
    fn trunc(&self, _h: &Hist, _dt: &mut f64) {}
    /// Su estampa en la matriz no depende de la solución: mientras el paso no cambie, la matriz tampoco.
    fn linear(&self) -> bool {
        false
    }
    /// Corriente y lecturas con la solución aceptada `x` y su estado `s0`.
    fn reading(&self, x: &[f64], s0: &[f64]) -> Reading;
    /// Tras aceptar un paso: un cambio de estado discreto (relé, fusible) devuelve true y reinicia la integración.
    fn accept(&mut self, _x: &[f64], _s0: &[f64], _t: f64, _h: f64, _ev: &mut Vec<Event>) -> bool {
        false
    }
    /// Hace algo en `accept`: el motor solo se lo pide a estos (los que no lo redefinen dicen false).
    fn usa_accept(&self) -> bool {
        true
    }
    /// Próximo instante después de `t` en que el dispositivo cambia de golpe (flanco de una onda cuadrada).
    fn next_break(&self, _t: f64) -> f64 {
        f64::INFINITY
    }
    /// Puede tener un flanco (`next_break` distinto de infinito): el motor solo le pregunta a estos.
    fn tiene_quiebres(&self) -> bool {
        false
    }
    /// Tiene una unión que cuenta para `junction_current`: el motor solo le pregunta a estos.
    fn tiene_union(&self) -> bool {
        false
    }
    /// Su estampa puede cambiar con el tiempo aunque no cambien sus entradas (cargas, flujos, temperaturas, una fuente que
    /// varía). Una isla cuyos dispositivos no tienen dinámica no cambia entre eventos y salta a la meta (`advance_hasta_cruce`).
    fn tiene_dinamica(&self) -> bool {
        true
    }
    /// Su estampa (matriz y lado derecho) depende solo de sus valores: no de la solución, del tiempo, del paso, del modo ni del
    /// escalamiento de fuentes. Cambia solo con `set`, `reset` o una discontinuidad de `accept`. El motor la estampa una vez
    /// por isla y empieza cada iteración desde ahí (`LinearSolver::restaurar_base`).
    fn estampa_fija(&self) -> bool {
        false
    }
    /// Una isla sin dinámica saltó `h` segundos sin pasos (nada eléctrico cambia): el dispositivo integra el estado que no
    /// es de la matriz (el calentamiento de un fusible) con las mismas entradas. Devuelve true si cambió su lectura.
    fn avanzar_quieto(&mut self, _h: f64) -> bool {
        false
    }
    /// Cambio en caliente de su valor (resistencia, fuente): false si el elemento no es del mismo tipo y nodos.
    fn set(&mut self, _e: &Element) -> bool {
        false
    }
    /// Como `set`, sabiendo el instante del cambio (la fase continua del generador lo necesita).
    fn set_en(&mut self, e: &Element, _t: f64) -> bool {
        self.set(e)
    }
    /// Puente de entrada: con la solución del último paso aceptado `x_ant` y la del que se propone `x`, la fracción
    /// del paso (0 a 1) en que su voltaje cruza el umbral que lo cambia de nivel; None si no cambia.
    fn cruce(&self, _x_ant: &[f64], _x: &[f64]) -> Option<f64> {
        None
    }
    /// Puente de entrada: el nivel que lee tras el último paso aceptado. None en los demás dispositivos.
    fn nivel_logico(&self) -> Option<Nivel> {
        None
    }
    /// Puente de entrada: el instante (s) en que cambió su nivel por última vez, interpolado dentro del paso. None en los
    /// demás dispositivos.
    fn instante_cambio(&self) -> Option<f64> {
        None
    }
    /// Puente de entrada: si su nivel cambió en el último paso aceptado (y lo olvida).
    fn tomar_cambio(&mut self) -> bool {
        false
    }
    /// Puente de salida: su red digital pasó a `n` en `t`; con `inmediato` (el arranque) el nivel llega sin rampa. false si
    /// el dispositivo no es un puente de salida.
    fn fijar_nivel(&mut self, _t: f64, _n: Nivel, _inmediato: bool) -> bool {
        false
    }
    /// Como `fijar_nivel` para un elemento que lee varias redes digitales: `bit` es la posición de la red en su lista de
    /// entradas. Los puentes de una sola red no lo redefinen.
    fn fijar_nivel_bit(&mut self, t: f64, _bit: usize, n: Nivel, inmediato: bool) -> bool {
        self.fijar_nivel(t, n, inmediato)
    }
    /// Cuántas veces cambió una red de la que depende dejándola sin nivel definido (X o Z): el Registro lo avisa una vez.
    fn indefinidos(&self) -> u64 {
        0
    }
    /// Vuelve a su estado inicial (un fusible nuevo); false si no aplica.
    fn reset(&mut self) -> bool {
        false
    }
    /// La mayor corriente de unión (A, en valor absoluto) con el estado `s0`: sobre `CORRIENTE_FORZADA` durante varios
    /// pasos sin decaer, la unión está empujada a conducir sin nada que la limite. Cero si el dispositivo no tiene uniones.
    fn junction_current(&self, _s0: &[f64]) -> f64 {
        0.0
    }
    /// Corriente (A) que entra por cada terminal, en el orden de `Element::nodes()`, y en la última casilla la que entra desde tierra (alimentación implícita de un puente). Las `nodes + 1` casillas suman cero. Por omisión, dos terminales de `a` a `b`.
    fn corrientes(&self, _x: &[f64], _s0: &[f64], r: &Reading, out: &mut [f64]) {
        out[0] = r.i;
        out[1] = -r.i;
        out[2] = 0.0;
    }
    /// Escribe sus corrientes por terminal con `corrientes` propias (más de dos terminales, o la resistencia con
    /// que se resolvió el paso). Sin esto, uno de dos terminales lleva ±i de su lectura y el motor solo integra i y |i|.
    fn corrientes_propias(&self) -> bool {
        false
    }
    /// Lo registra el motor cuando cambia (`tomar_estado`): el zumbador que suena y el contacto del relé.
    fn tiene_estado(&self) -> bool {
        false
    }
    /// El estado que se oye cambió en el último paso aceptado (1 suena u operado, 0 en silencio o en reposo), con el
    /// instante del cambio; lo olvida. None si no cambió.
    fn tomar_estado(&mut self) -> Option<(u8, f64)> {
        None
    }
}

/// Casillas de corriente por terminal de un elemento: las de sus nodos y la de la tierra interna (5 + 1 en el relé y en el
/// amplificador operacional, los de más terminales).
pub const CASILLAS_MAX: usize = 7;

/// Construye el dispositivo de un elemento de la netlist; `idx` es su posición (para los eventos).
pub fn build(e: &Element, idx: usize) -> Result<Box<dyn Device>, EngineError> {
    Ok(construir(e, idx))
}

fn construir(e: &Element, idx: usize) -> Box<dyn Device> {
    match e {
        Element::R { a, b, ohms } => Box::new(basic::Resistor::new(*a, *b, *ohms)),
        Element::C { a, b, farads } => Box::new(basic::Capacitor::new(*a, *b, *farads)),
        Element::L { a, b, henries } => Box::new(basic::Inductor::new(*a, *b, *henries)),
        Element::V { a, b, wave } => Box::new(basic::VSource::new(*a, *b, wave.clone())),
        Element::I { a, b, amps } => Box::new(basic::ISource::new(*a, *b, *amps)),
        Element::D { a, b, model } => Box::new(diode::Diode::new(*a, *b, model.clone())),
        Element::Q { c, b, e, pnp, model } => Box::new(bjt::Bjt::new(*c, *b, *e, *pnp, model.clone())),
        Element::J { d, g, s, pjf, model } => Box::new(jfet::Jfet::new(*d, *g, *s, *pjf, model.clone())),
        Element::M { d, g, s, pmos, model } => Box::new(mos1::Mos1::new(*d, *g, *s, *pmos, model.clone())),
        Element::OA { p, n, out, vp, vn, model } => Box::new(opamp::Opamp::new(*p, *n, *out, *vp, *vn, model.clone())),
        Element::Xfmr { a1, b1, a2, b2, l1, l2, k } => Box::new(acople::Acople::new(*a1, *b1, *a2, *b2, *l1, *l2, *k)),
        Element::Lamp { a, b, rfrio, k, pnom, tau } => Box::new(lamp::Lamp::new(idx, *a, *b, *rfrio, *k, *pnom, *tau)),
        Element::Motor { a, b, r, l, ke, j, bm } => Box::new(motor::Motor::new(*a, *b, *r, *l, *ke, *j, *bm)),
        Element::Fuse { a, b, ohms, inom, ifusion, tau, v, sin_carga } => Box::new(fuse::Fuse::new(idx, *a, *b, *ohms, *inom, *ifusion, *tau, *v, *sin_carga)),
        Element::Psu { a, b, v, ilim, vk, encendida } => Box::new(fuente_lab::FuenteLab::new(*a, *b, *v, *ilim, *vk, *encendida)),
        Element::Buzzer { a, b, ohms, umbral } => Box::new(zumbador::Zumbador::new(*a, *b, *ohms, *umbral)),
        Element::Relay { a1, a2, com, na, nc, r, l, ion, ioff } => {
            Box::new(relay::Relay::new(*a1, *a2, *com, *na, *nc, *r, *l, *ion, *ioff))
        }
        Element::Adc { p, n, in_low, in_high, r_in, v_in, histeresis, .. } => Box::new(puente::PuenteEntrada::new(*p, *n, *in_low, *in_high, *r_in, *v_in).con_histeresis(*histeresis)),
        Element::Dac { out, lo, hi, v_lo, v_hi, r_lo, r_hi, t_rise, t_fall, z, .. } => {
            Box::new(puente::PuenteSalida::new(*out, *lo, *hi, *v_lo, *v_hi, *r_lo, *r_hi, *t_rise, *t_fall).con_z(*z))
        }
        Element::Out555 { out, dis, vcc, gnd, v_lo, r_lo, v_hi, r_hi, g_on, g_off, t_rise, t_fall, .. } => {
            Box::new(puente::Salida555::new(*out, *dis, *vcc, *gnd, *v_lo, *r_lo, *v_hi, *r_hi, *g_on, *g_off, *t_rise, *t_fall))
        }
        // `Transient` rechaza los elementos digitales antes de construir sus dispositivos: los simula `digital`.
        Element::Gate { .. }
        | Element::Logic { .. }
        | Element::Dff { .. }
        | Element::Jkff { .. }
        | Element::Counter { .. }
        | Element::Decoder { .. }
        | Element::Latch555 { .. }
        | Element::Lut { .. }
        | Element::Msi { .. } => unreachable!("un elemento digital no es un dispositivo analógico"),
        Element::Dacm { modo, out, ret, ref_p, ref_n, bits, t_asentamiento, r_out } => {
            Box::new(dacm::Dacm::new(*modo, *out, *ret, *ref_p, *ref_n, bits.len(), *t_asentamiento, *r_out))
        }
        Element::Intc { a, b, canal, r_on, r_off } => Box::new(interruptor_canal::InterruptorCanal::new(*a, *b, *canal, *r_on, *r_off)),
        Element::E { .. } | Element::G { .. } | Element::H { .. } | Element::F { .. } => Box::new(controladas::Controlada::nueva(e)),
        Element::Ext { a, b, modo, canal, k, c, r } => Box::new(externa::Externa::new(*a, *b, *modo, *canal, *k, *c, *r)),
        Element::Term { a, b, tipo, r25, beta, rt, delta, tau, canal, tmax } => {
            Box::new(termistor::Termistor::new(idx, *a, *b, *tipo, *r25, *beta, rt, *delta, *tau, *canal, *tmax))
        }
        Element::Ldr { a, b, r10, gamma, roscuro, tau_sube, tau_baja, canal } => Box::new(ldr::Ldr::new(*a, *b, *r10, *gamma, *roscuro, *tau_sube, *tau_baja, *canal)),
        Element::Pasos { nodos, unipolar, r, l, k_mutua, km, dientes, td, j, bm, canal_carga, reduccion } => {
            Box::new(pasos::Pasos::new(nodos, *unipolar, *r, *l, *k_mutua, *km, *dientes, *td, *j, *bm, *canal_carga, *reduccion))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vt_es_el_de_ngspice() {
        assert!((VT - 0.0258649).abs() < 1e-7, "VT = {VT}");
    }

    #[test]
    fn limitacion_de_ngspice() {
        // Subida desde 0.6 V: vold + vt (2 + ln(arg - 2)) con arg = (1.0 - 0.6) / vt.
        let (v, l) = pnjlim(1.0, 0.6, VT, 0.6);
        assert!(l);
        assert!((v - (0.6 + VT * (2.0 + (0.4 / VT - 2.0).ln()))).abs() < 1e-12, "v = {v}");
        // Desde cero se toma el logaritmo, y en inversa no baja de 2 vold - 1.
        assert!((pnjlim(1.0, 0.0, VT, 0.6).0 - VT * (1.0 / VT).ln()).abs() < 1e-12);
        assert_eq!(pnjlim(-5.0, -1.0, VT, 0.6), (-3.0, true));
        assert_eq!(pnjlim(0.3, 0.29, VT, 0.6), (0.3, false));
        assert!(pnjlim(50.0, 0.0, VT, 0.6).0.is_finite());
    }

    #[test]
    fn limitacion_del_mosfet() {
        // Apagado y subiendo mucho: no pasa de vto + 0.5.
        assert_eq!(fetlim(10.0, 0.0, 2.0), 2.5);
        // Encendido de sobra y subiendo: a lo más 2 |vold - vto| + 2 por iteración.
        assert_eq!(fetlim(20.0, 6.0, 2.0), 6.0 + 10.0);
        assert_eq!(limvds(10.0, 1.0), 4.0);
        assert_eq!(limvds(-3.0, 1.0), -0.5);
        assert_eq!(limvds(30.0, 5.0), 17.0);
    }

    #[test]
    fn carga_de_agotamiento_continua_en_fc_pb() {
        let (pb, mj, fc, cz) = (0.75, 0.33, 0.5, 1e-12);
        let (q1, c1) = depletion(fc * pb - 1e-9, cz, pb, mj, fc);
        let (q2, c2) = depletion(fc * pb + 1e-9, cz, pb, mj, fc);
        assert!((q1 - q2).abs() < 1e-20 && (c1 - c2).abs() / c1 < 1e-6, "q {q1} {q2}, c {c1} {c2}");
        // A 0 V: carga nula y la capacitancia de cero volts; en inversa la capacitancia baja.
        assert_eq!(depletion(0.0, cz, pb, mj, fc), (0.0, cz));
        assert!(depletion(-5.0, cz, pb, mj, fc).1 < cz);
    }

    #[test]
    fn error_de_truncamiento_de_una_parabola() {
        // q(t) = t² con pasos de 1: la segunda diferencia dividida vale 1 y con orden 1 el paso es trtol tol / (0.5 · 1).
        let s: Vec<Vec<f64>> = [3.0f64, 2.0, 1.0, 0.0].iter().map(|t| vec![t * t, 2.0 * t]).collect();
        let tol = Tol::default();
        let h = Hist { s: [&s[0], &s[1], &s[2], &s[3]], delta_old: [1.0; 4], order: 1, tol };
        let mut dt = f64::INFINITY;
        terr(&h, 0, &mut dt);
        let esperado = tol.trtol * (tol.abstol + tol.reltol * 6.0f64).max(tol.reltol * 9.0) / 0.5;
        assert!((dt - esperado).abs() < 1e-12, "dt = {dt} contra {esperado}");
        // Una parábola no tiene tercera derivada: con orden 2 no limita (solo el piso de abstol).
        let h2 = Hist { order: 2, ..h };
        let mut dt2 = f64::INFINITY;
        terr(&h2, 0, &mut dt2);
        assert!(dt2 > 1e3, "dt2 = {dt2}");
    }
}
