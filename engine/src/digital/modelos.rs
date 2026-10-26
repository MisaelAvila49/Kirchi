//! Modelos digitales. Cada uno lee sus redes de entrada (ya leídas: Z según su familia) y dice qué nivel quiere en cada
//! salida y con qué retardo; el simulador aplica el retardo inercial. Los retardos son los de su familia a su
//! alimentación (los calcula `netlist/familias.ts` y llegan en la netlist).

use super::nivel::retardo;
use super::{a_ps, Nivel, Ps};
use crate::netlist::Element;

/// El modelo de un elemento digital de la netlist; None si el elemento no es digital (los puentes y los analógicos van a
/// la matriz). Los retardos llegan en segundos y se guardan en picosegundos, nunca en cero.
pub fn construir(e: &Element) -> Option<Box<dyn ModeloDigital>> {
    let redes = |v: &[usize]| v.iter().map(|&k| k as u32).collect::<Vec<u32>>();
    let ps = |s: f64| a_ps(s).max(1);
    match e {
        Element::Gate { func, inputs, output, rise_delay, fall_delay, z_como } => Some(Box::new(Compuerta {
            f: *func,
            ent: redes(inputs),
            sal: [*output as u32],
            subida: ps(*rise_delay),
            bajada: ps(*fall_delay),
            z: z_como.nivel(),
        })),
        Element::Logic { out, value } => Some(Box::new(EstadoLogico { sal: [*out as u32], valor: if *value == 1 { Nivel::Uno } else { Nivel::Cero } })),
        Element::Dff { d, clk, pre, clr, q, qn, rise_delay, fall_delay, z_como } => Some(Box::new(BiestableD::new(
            [*d as u32, *clk as u32, *pre as u32, *clr as u32],
            [*q as u32, *qn as u32],
            ps(*rise_delay),
            ps(*fall_delay),
            z_como.nivel(),
        ))),
        Element::Jkff { j, k, clk, pre, clr, q, qn, rise_delay, fall_delay, z_como } => Some(Box::new(BiestableJk::new(
            [*j as u32, *k as u32, *clk as u32, *pre as u32, *clr as u32],
            [*q as u32, *qn as u32],
            ps(*rise_delay),
            ps(*fall_delay),
            z_como.nivel(),
        ))),
        Element::Counter { clk, rst, q, co, modulo, rise_delay, fall_delay, z_como } => Some(Box::new(Contador::new(
            [*clk as u32, *rst as u32],
            [q[0] as u32, q[1] as u32, q[2] as u32, q[3] as u32, *co as u32],
            *modulo,
            ps(*rise_delay),
            ps(*fall_delay),
            z_como.nivel(),
        ))),
        Element::Decoder { inputs, outputs, activo_alto, rise_delay, fall_delay, z_como } => Some(Box::new(Decodificador::new(
            inputs.map(|r| r as u32),
            outputs.map(|r| r as u32),
            *activo_alto,
            ps(*rise_delay),
            ps(*fall_delay),
            z_como.nivel(),
        ))),
        Element::Latch555 { trig, thr, res, q, delay } => {
            Some(Box::new(Biestable555 { ent: [*trig as u32, *thr as u32, *res as u32, *q as u32], sal: [*q as u32], retardo: ps(*delay) }))
        }
        _ => None,
    }
}

/// Copia de un modelo con todo su estado (guardar el estado del motor para retroceder).
pub trait ModeloClone {
    fn clonar(&self) -> Box<dyn ModeloDigital>;
}

impl<T: ModeloDigital + Clone + 'static> ModeloClone for T {
    fn clonar(&self) -> Box<dyn ModeloDigital> {
        Box::new(self.clone())
    }
}

pub trait ModeloDigital: ModeloClone {
    /// Bytes que el modelo reserva en el montón además de su estructura (sus `Vec`); la copia del estado los suma al tope de
    /// memoria de Retroceder. Sin vectores propios, 0.
    fn bytes_heap(&self) -> usize {
        0
    }
    /// Redes que lee, en el orden del modelo.
    fn entradas(&self) -> &[u32];
    /// Redes que maneja, en el orden del modelo.
    fn salidas(&self) -> &[u32];
    /// Cómo lee una entrada en Z.
    fn z_como(&self) -> Nivel;
    /// Salidas en el arranque (t = 0) con las entradas `e`, sin retardo y sin flancos: las combinacionales dan su función y
    /// las de estado su estado inicial. Anota el reloj para que el primer evento no parezca un flanco.
    fn iniciar(&mut self, e: &[Nivel], s: &mut [Nivel]);
    /// Con las entradas `e` y las salidas que tiene ahora `a`, el nivel que quiere en cada salida y su retardo
    /// (salida, nivel, retardo). Se pide aunque el nivel no cambie: el retardo inercial necesita saberlo.
    fn evaluar(&mut self, e: &[Nivel], a: &[Nivel], out: &mut Vec<(usize, Nivel, Ps)>);
    /// Segunda lectura y estado (los de `Reading`): lo propio de cada modelo para el inspector. Sin estado propio (None), el
    /// estado es el nivel de su primera salida.
    fn lectura(&self) -> (f64, Option<f64>) {
        (0.0, None)
    }
    /// Cambia el nivel de un estado lógico (lo conmuta el usuario mientras corre); false si el modelo no se fija así.
    fn fijar(&mut self, _n: Nivel) -> bool {
        false
    }
}

/// Las funciones de las compuertas (NOT, AND, OR, NAND, NOR y XOR; BUF queda para el puente de un estado lógico).
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Funcion {
    Not,
    Buf,
    And,
    Or,
    Nand,
    Nor,
    Xor,
}

impl Funcion {
    /// Entradas que admite: una en NOT y BUF; dos o más en las demás.
    pub fn entradas_validas(self, n: usize) -> bool {
        match self {
            Funcion::Not | Funcion::Buf => n == 1,
            _ => (2..=8).contains(&n),
        }
    }

    pub fn calcular(self, e: &[Nivel]) -> Nivel {
        let y = || e.iter().fold(Nivel::Uno, |a, &b| a.y(b));
        let o = || e.iter().fold(Nivel::Cero, |a, &b| a.o(b));
        match self {
            Funcion::Not => e[0].no(),
            Funcion::Buf => e[0].no().no(),
            Funcion::And => y(),
            Funcion::Or => o(),
            Funcion::Nand => y().no(),
            Funcion::Nor => o().no(),
            Funcion::Xor => e.iter().fold(Nivel::Cero, |a, &b| a.ox(b)),
        }
    }
}

#[derive(Clone)]
pub struct Compuerta {
    pub f: Funcion,
    pub ent: Vec<u32>,
    pub sal: [u32; 1],
    pub subida: Ps,
    pub bajada: Ps,
    pub z: Nivel,
}

impl ModeloDigital for Compuerta {
    fn bytes_heap(&self) -> usize {
        self.ent.capacity() * std::mem::size_of::<u32>()
    }
    fn entradas(&self) -> &[u32] {
        &self.ent
    }
    fn salidas(&self) -> &[u32] {
        &self.sal
    }
    fn z_como(&self) -> Nivel {
        self.z
    }
    fn iniciar(&mut self, e: &[Nivel], s: &mut [Nivel]) {
        s[0] = self.f.calcular(e);
    }
    fn evaluar(&mut self, e: &[Nivel], a: &[Nivel], out: &mut Vec<(usize, Nivel, Ps)>) {
        let n = self.f.calcular(e);
        out.push((0, n, retardo(a[0], n, self.subida, self.bajada)));
    }
}

/// Estado lógico (como LOGICSTATE de Proteus): una salida en 0 o 1 que el usuario conmuta. No tiene entradas.
#[derive(Clone)]
pub struct EstadoLogico {
    pub sal: [u32; 1],
    pub valor: Nivel,
}

impl ModeloDigital for EstadoLogico {
    fn entradas(&self) -> &[u32] {
        &[]
    }
    fn salidas(&self) -> &[u32] {
        &self.sal
    }
    fn z_como(&self) -> Nivel {
        Nivel::X
    }
    fn iniciar(&mut self, _e: &[Nivel], s: &mut [Nivel]) {
        s[0] = self.valor;
    }
    fn evaluar(&mut self, _e: &[Nivel], _a: &[Nivel], out: &mut Vec<(usize, Nivel, Ps)>) {
        out.push((0, self.valor, 0));
    }
    fn lectura(&self) -> (f64, Option<f64>) {
        (0.0, Some(self.valor.codigo()))
    }
    fn fijar(&mut self, n: Nivel) -> bool {
        self.valor = n;
        true
    }
}

/// PRE y CLR activos en bajo (74HC74 y 74HC112): con alguno activo, las salidas (Q, Q̄) y la causa para la lectura; None si
/// los dos están inactivos. Con los dos activos Q y Q̄ quedan en 1, como el chip, y al soltarlos Q no está definida (X).
fn asincrono(pre: Nivel, clr: Nivel) -> Option<(Nivel, Nivel, Causa)> {
    match (pre, clr) {
        (Nivel::Uno, Nivel::Uno) => None,
        (Nivel::Cero, Nivel::Cero) => Some((Nivel::Uno, Nivel::Uno, Causa::Ambos)),
        (Nivel::Cero, Nivel::Uno) => Some((Nivel::Uno, Nivel::Cero, Causa::Pre)),
        (Nivel::Uno, Nivel::Cero) => Some((Nivel::Cero, Nivel::Uno, Causa::Clr)),
        _ => Some((Nivel::X, Nivel::X, Causa::Indefinida)),
    }
}

/// Qué fijó el estado de un biestable por última vez (la segunda lectura del inspector).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Causa {
    /// El arranque (estado inicial en 0, como `ic` de XSPICE).
    Arranque = 0,
    /// Un flanco de reloj: en el D tomó el dato; en el JK, J = K = 0 (mantiene).
    Flanco = 1,
    /// JK: J = 1 y K = 0.
    Pone = 2,
    /// JK: J = 0 y K = 1.
    Borra = 3,
    /// JK: J = K = 1.
    Conmuta = 4,
    Pre = 5,
    Clr = 6,
    /// PRE y CLR activos a la vez.
    Ambos = 7,
    /// Un dato o una entrada asíncrona en X.
    Indefinida = 8,
}

/// El flanco que dispara: el reloj llega a 1 (de subida) o a 0 (de bajada) desde cualquier otro nivel. Un reloj lento pasa por
/// X entre los umbrales de su entrada, y el flanco es el paso de X al nivel final, como en XSPICE (medido en ngspice 47 con
/// un reloj de rampas de 100 ns: el D, el JK y `d_state` disparan al salir de X).
fn flanco(antes: Nivel, ahora: Nivel, subida: bool) -> bool {
    let hasta = if subida { Nivel::Uno } else { Nivel::Cero };
    ahora == hasta && antes != hasta
}

/// Biestable D por flanco de subida, como el 74HC74: entradas D, CLK, PRE̅ y CLR̅; salidas Q y Q̄.
#[derive(Clone)]
pub struct BiestableD {
    pub ent: [u32; 4],
    pub sal: [u32; 2],
    pub subida: Ps,
    pub bajada: Ps,
    pub z: Nivel,
    q: Nivel,
    reloj: Nivel,
    causa: Causa,
}

impl BiestableD {
    pub fn new(ent: [u32; 4], sal: [u32; 2], subida: Ps, bajada: Ps, z: Nivel) -> Self {
        Self { ent, sal, subida, bajada, z, q: Nivel::Cero, reloj: Nivel::X, causa: Causa::Arranque }
    }
}

/// Las salidas de un biestable con estado `q` y entradas asíncronas `pre` y `clr`, y su nuevo estado y causa.
fn salidas_de(q: &mut Nivel, causa: &mut Causa, pre: Nivel, clr: Nivel) -> Option<(Nivel, Nivel)> {
    let (sq, sqn, c) = asincrono(pre, clr)?;
    *q = if c == Causa::Ambos { Nivel::X } else { sq };
    *causa = c;
    Some((sq, sqn))
}

fn empujar(out: &mut Vec<(usize, Nivel, Ps)>, a: &[Nivel], q: Nivel, qn: Nivel, subida: Ps, bajada: Ps) {
    out.push((0, q, retardo(a[0], q, subida, bajada)));
    out.push((1, qn, retardo(a[1], qn, subida, bajada)));
}

impl ModeloDigital for BiestableD {
    fn entradas(&self) -> &[u32] {
        &self.ent
    }
    fn salidas(&self) -> &[u32] {
        &self.sal
    }
    fn z_como(&self) -> Nivel {
        self.z
    }
    fn iniciar(&mut self, e: &[Nivel], s: &mut [Nivel]) {
        self.reloj = e[1];
        let (q, qn) = salidas_de(&mut self.q, &mut self.causa, e[2], e[3]).unwrap_or((self.q, self.q.no()));
        s[0] = q;
        s[1] = qn;
    }
    fn evaluar(&mut self, e: &[Nivel], a: &[Nivel], out: &mut Vec<(usize, Nivel, Ps)>) {
        let f = flanco(self.reloj, e[1], true);
        self.reloj = e[1];
        let (q, qn) = match salidas_de(&mut self.q, &mut self.causa, e[2], e[3]) {
            Some(s) => s,
            None => {
                if f {
                    self.q = match e[0] {
                        Nivel::Cero | Nivel::Uno => e[0],
                        _ => Nivel::X,
                    };
                    self.causa = if self.q == Nivel::X { Causa::Indefinida } else { Causa::Flanco };
                }
                (self.q, self.q.no())
            }
        };
        empujar(out, a, q, qn, self.subida, self.bajada);
    }
    /// En `aux`, qué fijó el estado (`Causa`); en `estado`, Q.
    fn lectura(&self) -> (f64, Option<f64>) {
        (self.causa as u8 as f64, Some(self.q.codigo()))
    }
}

/// Biestable JK por flanco de bajada, como el 74HC112: entradas J, K, CLK, PRE̅ y CLR̅; salidas Q y Q̄.
#[derive(Clone)]
pub struct BiestableJk {
    pub ent: [u32; 5],
    pub sal: [u32; 2],
    pub subida: Ps,
    pub bajada: Ps,
    pub z: Nivel,
    q: Nivel,
    reloj: Nivel,
    causa: Causa,
}

impl BiestableJk {
    pub fn new(ent: [u32; 5], sal: [u32; 2], subida: Ps, bajada: Ps, z: Nivel) -> Self {
        Self { ent, sal, subida, bajada, z, q: Nivel::Cero, reloj: Nivel::X, causa: Causa::Arranque }
    }
}

impl ModeloDigital for BiestableJk {
    fn entradas(&self) -> &[u32] {
        &self.ent
    }
    fn salidas(&self) -> &[u32] {
        &self.sal
    }
    fn z_como(&self) -> Nivel {
        self.z
    }
    fn iniciar(&mut self, e: &[Nivel], s: &mut [Nivel]) {
        self.reloj = e[2];
        let (q, qn) = salidas_de(&mut self.q, &mut self.causa, e[3], e[4]).unwrap_or((self.q, self.q.no()));
        s[0] = q;
        s[1] = qn;
    }
    fn evaluar(&mut self, e: &[Nivel], a: &[Nivel], out: &mut Vec<(usize, Nivel, Ps)>) {
        let f = flanco(self.reloj, e[2], false);
        self.reloj = e[2];
        let (q, qn) = match salidas_de(&mut self.q, &mut self.causa, e[3], e[4]) {
            Some(s) => s,
            None => {
                let (siguiente, causa) = match (e[0], e[1]) {
                    (Nivel::Cero, Nivel::Cero) => (self.q, Causa::Flanco),
                    (Nivel::Uno, Nivel::Cero) => (Nivel::Uno, Causa::Pone),
                    (Nivel::Cero, Nivel::Uno) => (Nivel::Cero, Causa::Borra),
                    (Nivel::Uno, Nivel::Uno) => (self.q.no(), Causa::Conmuta),
                    _ => (Nivel::X, Causa::Indefinida),
                };
                if f {
                    self.q = siguiente;
                    self.causa = causa;
                }
                (self.q, self.q.no())
            }
        };
        empujar(out, a, q, qn, self.subida, self.bajada);
    }
    /// En `aux`, qué hizo el último flanco o qué fijó el estado (`Causa`); en `estado`, Q.
    fn lectura(&self) -> (f64, Option<f64>) {
        (self.causa as u8 as f64, Some(self.q.codigo()))
    }
}

/// Segmentos a, b, c, d, e, f y g de cada dígito, como el CD4511 y el 74LS47: el 6 sin la barra de arriba y el 9 sin la de
/// abajo. Los códigos 10 a 15 apagan todo en las dos polaridades (como el 4511).
pub const SEGMENTOS: [[bool; 7]; 10] = [
    [true, true, true, true, true, true, false],
    [false, true, true, false, false, false, false],
    [true, true, false, true, true, false, true],
    [true, true, true, true, false, false, true],
    [false, true, true, false, false, true, true],
    [true, false, true, true, false, true, true],
    [false, false, true, true, true, true, true],
    [true, true, true, false, false, false, false],
    [true, true, true, true, true, true, true],
    [true, true, true, false, false, true, true],
];

/// Contador de 4 bits por flanco de subida con reinicio asíncrono activo en alto (RST manda sobre el reloj). Cuenta hasta
/// `modulo - 1` (9, como el 74HC390, o 15, como el 74HC393) y CO vale 1 en la última cuenta (como TC del 74HC163). Salidas
/// Q0 a Q3 y CO. Arranca en 0.
#[derive(Clone)]
pub struct Contador {
    pub ent: [u32; 2],
    pub sal: [u32; 5],
    pub modulo: u8,
    pub subida: Ps,
    pub bajada: Ps,
    pub z: Nivel,
    /// None: la cuenta no está definida (un reinicio en X).
    cuenta: Option<u8>,
    reloj: Nivel,
}

impl Contador {
    pub fn new(ent: [u32; 2], sal: [u32; 5], modulo: u8, subida: Ps, bajada: Ps, z: Nivel) -> Self {
        Self { ent, sal, modulo, subida, bajada, z, cuenta: Some(0), reloj: Nivel::X }
    }

    fn niveles(&self) -> [Nivel; 5] {
        let Some(c) = self.cuenta else { return [Nivel::X; 5] };
        let bit = |b: u8| Nivel::de_bool(c >> b & 1 == 1);
        [bit(0), bit(1), bit(2), bit(3), Nivel::de_bool(c == self.modulo - 1)]
    }
}

impl ModeloDigital for Contador {
    fn entradas(&self) -> &[u32] {
        &self.ent
    }
    fn salidas(&self) -> &[u32] {
        &self.sal
    }
    fn z_como(&self) -> Nivel {
        self.z
    }
    fn iniciar(&mut self, e: &[Nivel], s: &mut [Nivel]) {
        self.reloj = e[0];
        self.cuenta = match e[1] {
            Nivel::Cero | Nivel::Uno => Some(0),
            _ => None,
        };
        s.copy_from_slice(&self.niveles());
    }
    fn evaluar(&mut self, e: &[Nivel], a: &[Nivel], out: &mut Vec<(usize, Nivel, Ps)>) {
        let f = flanco(self.reloj, e[0], true);
        self.reloj = e[0];
        match e[1] {
            Nivel::Uno => self.cuenta = Some(0),
            Nivel::Cero if f => self.cuenta = self.cuenta.map(|c| (c + 1) % self.modulo),
            Nivel::Cero => {}
            _ => self.cuenta = None,
        }
        for (k, n) in self.niveles().into_iter().enumerate() {
            out.push((k, n, retardo(a[k], n, self.subida, self.bajada)));
        }
    }
    /// En `aux`, la cuenta (-1 si no está definida).
    fn lectura(&self) -> (f64, Option<f64>) {
        (self.cuenta.map_or(-1.0, f64::from), None)
    }
}

/// Decodificador BCD a 7 segmentos: entradas A (bit menos significativo) a D, salidas a a g. Activo en alto como el CD4511
/// (para cátodo común) o en bajo como el 74LS47 (para ánodo común). Una entrada en X deja todas las salidas en X.
#[derive(Clone)]
pub struct Decodificador {
    pub ent: [u32; 4],
    pub sal: [u32; 7],
    pub activo_alto: bool,
    pub subida: Ps,
    pub bajada: Ps,
    pub z: Nivel,
    /// El dígito que manda (0 a 9), -1 apagado (10 a 15) o -2 sin definir.
    digito: f64,
}

impl Decodificador {
    pub fn new(ent: [u32; 4], sal: [u32; 7], activo_alto: bool, subida: Ps, bajada: Ps, z: Nivel) -> Self {
        Self { ent, sal, activo_alto, subida, bajada, z, digito: -2.0 }
    }

    fn calcular(&mut self, e: &[Nivel]) -> [Nivel; 7] {
        if e.iter().any(|n| !matches!(n, Nivel::Cero | Nivel::Uno)) {
            self.digito = -2.0;
            return [Nivel::X; 7];
        }
        let codigo = e.iter().enumerate().map(|(k, &n)| usize::from(n == Nivel::Uno) << k).sum::<usize>();
        let encendidos = if codigo < 10 { SEGMENTOS[codigo] } else { [false; 7] };
        self.digito = if codigo < 10 { codigo as f64 } else { -1.0 };
        encendidos.map(|s| Nivel::de_bool(s == self.activo_alto))
    }
}

impl ModeloDigital for Decodificador {
    fn entradas(&self) -> &[u32] {
        &self.ent
    }
    fn salidas(&self) -> &[u32] {
        &self.sal
    }
    fn z_como(&self) -> Nivel {
        self.z
    }
    fn iniciar(&mut self, e: &[Nivel], s: &mut [Nivel]) {
        s.copy_from_slice(&self.calcular(e));
    }
    fn evaluar(&mut self, e: &[Nivel], a: &[Nivel], out: &mut Vec<(usize, Nivel, Ps)>) {
        for (k, n) in self.calcular(e).into_iter().enumerate() {
            out.push((k, n, retardo(a[k], n, self.subida, self.bajada)));
        }
    }
    /// En `aux`, el dígito que manda (-1 apagado, -2 sin definir).
    fn lectura(&self) -> (f64, Option<f64>) {
        (self.digito, None)
    }
}

/// Biestable del 555: con RESET sobre su umbral, Q pasa a 1 con el disparo (TRIG bajo la mitad de CV) aunque el umbral esté activo, y a 0 con el umbral (THR sobre CV). RESET en bajo lo deja en 0 y domina. Mismo retardo en ambos sentidos.
#[derive(Clone)]
pub struct Biestable555 {
    pub ent: [u32; 4],
    pub sal: [u32; 1],
    pub retardo: Ps,
}

impl Biestable555 {
    fn siguiente(e: &[Nivel]) -> Nivel {
        e[2].y(e[0].o(e[3].y(e[1].no())))
    }
}

impl ModeloDigital for Biestable555 {
    fn entradas(&self) -> &[u32] {
        &self.ent
    }
    fn salidas(&self) -> &[u32] {
        &self.sal
    }
    fn z_como(&self) -> Nivel {
        Nivel::X
    }
    fn iniciar(&mut self, e: &[Nivel], s: &mut [Nivel]) {
        s[0] = Self::siguiente(e);
    }
    fn evaluar(&mut self, e: &[Nivel], _a: &[Nivel], out: &mut Vec<(usize, Nivel, Ps)>) {
        out.push((0, Self::siguiente(e), self.retardo));
    }
}

#[cfg(test)]
mod tests {
    use super::Nivel::{Cero, Uno, X};
    use super::*;

    #[test]
    fn una_compuerta_cuenta_su_vector_de_entradas_ademas_de_su_estructura() {
        let g = Compuerta { f: Funcion::And, ent: vec![1, 2, 3, 4, 5, 6, 7, 8], sal: [9], subida: 0, bajada: 0, z: X };
        assert!(g.bytes_heap() >= 8 * std::mem::size_of::<u32>());
        let sin: &dyn ModeloDigital = &EstadoLogico { sal: [1], valor: Cero };
        assert_eq!(sin.bytes_heap(), 0);
    }

    #[test]
    fn funciones_de_dos_y_mas_entradas() {
        assert_eq!(Funcion::Nand.calcular(&[Uno, Uno]), Cero);
        assert_eq!(Funcion::Nand.calcular(&[Uno, Cero, X]), Uno);
        assert_eq!(Funcion::Nor.calcular(&[Cero, Cero]), Uno);
        assert_eq!(Funcion::Xor.calcular(&[Uno, Uno, Uno]), Uno);
        assert_eq!(Funcion::Buf.calcular(&[X]), X);
        assert!(Funcion::Not.entradas_validas(1) && !Funcion::Not.entradas_validas(2));
        assert!(Funcion::And.entradas_validas(2) && !Funcion::And.entradas_validas(1));
    }

    /// Lo que pide el modelo con las entradas `e` y las salidas actuales `a`: (Q, Q̄).
    fn pide(m: &mut dyn ModeloDigital, e: &[Nivel], a: &[Nivel]) -> (Nivel, Nivel) {
        let mut out = Vec::new();
        m.evaluar(e, a, &mut out);
        (out[0].1, out[1].1)
    }

    fn d() -> BiestableD {
        BiestableD::new([0, 1, 2, 3], [4, 5], 5000, 6000, X)
    }

    #[test]
    fn el_biestable_d_toma_el_dato_en_el_flanco_de_subida() {
        let mut b = d();
        let mut s = [Cero; 2];
        b.iniciar(&[Uno, Cero, Uno, Uno], &mut s);
        assert_eq!(s, [Cero, Uno]);
        // D en 1 y el reloj sube: Q sube con el retardo de subida y Q̄ baja con el de bajada.
        let mut out = Vec::new();
        b.evaluar(&[Uno, Uno, Uno, Uno], &[Cero, Uno], &mut out);
        assert_eq!(out, vec![(0, Uno, 5000), (1, Cero, 6000)]);
        // El reloj baja: nada cambia aunque cambie D.
        assert_eq!(pide(&mut b, &[Cero, Cero, Uno, Uno], &[Uno, Cero]), (Uno, Cero));
        assert_eq!(b.lectura(), (Causa::Flanco as u8 as f64, Some(1.0)));
    }

    #[test]
    fn pre_y_clr_mandan_sobre_el_reloj_y_los_dos_dejan_q_sin_definir() {
        let mut b = d();
        let mut s = [Cero; 2];
        b.iniciar(&[Cero, Cero, Uno, Uno], &mut s);
        assert_eq!(pide(&mut b, &[Cero, Cero, Cero, Uno], &[Cero, Uno]), (Uno, Cero));
        assert_eq!(b.lectura().0, Causa::Pre as u8 as f64);
        // CLR aunque el reloj suba con D en 1.
        assert_eq!(pide(&mut b, &[Uno, Uno, Uno, Cero], &[Uno, Cero]), (Cero, Uno));
        assert_eq!(b.lectura().0, Causa::Clr as u8 as f64);
        assert_eq!(pide(&mut b, &[Cero, Cero, Cero, Cero], &[Cero, Uno]), (Uno, Uno));
        assert_eq!(pide(&mut b, &[Cero, Cero, Uno, Uno], &[Uno, Uno]), (X, X));
        // El siguiente flanco lo vuelve a definir.
        assert_eq!(pide(&mut b, &[Uno, Uno, Uno, Uno], &[X, X]), (Uno, Cero));
    }

    #[test]
    fn un_reloj_lento_dispara_al_pasar_de_x_a_1() {
        let mut s = [Cero; 2];
        let mut b = d();
        b.iniciar(&[Uno, Cero, Uno, Uno], &mut s);
        // De 0 a X no dispara; de X a 1, sí (como XSPICE).
        assert_eq!(pide(&mut b, &[Uno, X, Uno, Uno], &[Cero, Uno]), (Cero, Uno));
        assert_eq!(pide(&mut b, &[Uno, Uno, Uno, Uno], &[Cero, Uno]), (Uno, Cero));
        // De 1 a X y de vuelta a 1 es otro flanco.
        assert_eq!(pide(&mut b, &[Cero, X, Uno, Uno], &[Uno, Cero]), (Uno, Cero));
        assert_eq!(pide(&mut b, &[Cero, Uno, Uno, Uno], &[Uno, Cero]), (Cero, Uno));
        // Un dato en X deja Q en X.
        pide(&mut b, &[X, Cero, Uno, Uno], &[Cero, Uno]);
        assert_eq!(pide(&mut b, &[X, Uno, Uno, Uno], &[Cero, Uno]), (X, X));
        assert_eq!(b.lectura().0, Causa::Indefinida as u8 as f64);
    }

    #[test]
    fn el_jk_por_flanco_de_bajada_mantiene_pone_borra_y_conmuta() {
        let mut b = BiestableJk::new([0, 1, 2, 3, 4], [5, 6], 5000, 5000, X);
        let mut s = [Cero; 2];
        b.iniciar(&[Uno, Uno, Uno, Uno, Uno], &mut s);
        assert_eq!(s, [Cero, Uno]);
        // J = K = 1 y el reloj baja: conmuta.
        assert_eq!(pide(&mut b, &[Uno, Uno, Cero, Uno, Uno], &[Cero, Uno]), (Uno, Cero));
        assert_eq!(b.lectura().0, Causa::Conmuta as u8 as f64);
        // La subida no hace nada.
        assert_eq!(pide(&mut b, &[Uno, Uno, Uno, Uno, Uno], &[Uno, Cero]), (Uno, Cero));
        assert_eq!(pide(&mut b, &[Cero, Uno, Cero, Uno, Uno], &[Uno, Cero]), (Cero, Uno));
        assert_eq!(b.lectura().0, Causa::Borra as u8 as f64);
        pide(&mut b, &[Uno, Cero, Uno, Uno, Uno], &[Cero, Uno]);
        assert_eq!(pide(&mut b, &[Uno, Cero, Cero, Uno, Uno], &[Cero, Uno]), (Uno, Cero));
        assert_eq!(b.lectura().0, Causa::Pone as u8 as f64);
        pide(&mut b, &[Cero, Cero, Uno, Uno, Uno], &[Uno, Cero]);
        assert_eq!(pide(&mut b, &[Cero, Cero, Cero, Uno, Uno], &[Uno, Cero]), (Uno, Cero));
        assert_eq!(b.lectura().0, Causa::Flanco as u8 as f64);
        assert_eq!(pide(&mut b, &[Cero, Cero, Cero, Uno, Cero], &[Uno, Cero]), (Cero, Uno));
        assert_eq!(b.lectura().0, Causa::Clr as u8 as f64);
    }

    /// Las salidas que pide un modelo con las entradas `e` (las actuales en 0).
    fn todas(m: &mut dyn ModeloDigital, e: &[Nivel]) -> Vec<Nivel> {
        let mut out = Vec::new();
        let a = vec![Cero; m.salidas().len()];
        m.evaluar(e, &a, &mut out);
        out.into_iter().map(|o| o.1).collect()
    }

    #[test]
    fn el_contador_da_la_vuelta_en_9_y_en_15_y_el_reinicio_manda() {
        for (modulo, ultima) in [(10u8, 9u8), (16, 15)] {
            let mut c = Contador::new([0, 1], [2, 3, 4, 5, 6], modulo, 5000, 5000, X);
            let mut s = [X; 5];
            c.iniciar(&[Cero, Cero], &mut s);
            assert_eq!(s, [Cero, Cero, Cero, Cero, Cero]);
            for k in 1..=u16::from(modulo) {
                todas(&mut c, &[Uno, Cero]);
                let q = todas(&mut c, &[Cero, Cero]);
                let esperado = (k % u16::from(modulo)) as u8;
                assert_eq!(c.lectura().0, f64::from(esperado), "módulo {modulo}, flanco {k}");
                assert_eq!(q[4], Nivel::de_bool(esperado == ultima));
                assert_eq!(q[0], Nivel::de_bool(esperado & 1 == 1));
                assert_eq!(q[3], Nivel::de_bool(esperado & 8 == 8));
            }
        }
        // RST en alto: cero aunque suba el reloj.
        let mut c = Contador::new([0, 1], [2, 3, 4, 5, 6], 10, 5000, 5000, X);
        let mut s = [X; 5];
        c.iniciar(&[Cero, Cero], &mut s);
        todas(&mut c, &[Uno, Cero]);
        assert_eq!(c.lectura().0, 1.0);
        todas(&mut c, &[Cero, Uno]);
        todas(&mut c, &[Uno, Uno]);
        assert_eq!(c.lectura().0, 0.0);
        // Un reloj lento cuenta una vez, al pasar de X a 1.
        todas(&mut c, &[Cero, Cero]);
        todas(&mut c, &[X, Cero]);
        assert_eq!(c.lectura().0, 0.0);
        todas(&mut c, &[Uno, Cero]);
        assert_eq!(c.lectura().0, 1.0);
        // Un reinicio en X deja la cuenta sin definir hasta el siguiente reinicio.
        assert_eq!(todas(&mut c, &[Uno, X]), vec![X; 5]);
        todas(&mut c, &[Cero, Cero]);
        todas(&mut c, &[Uno, Cero]);
        assert_eq!(c.lectura().0, -1.0);
        todas(&mut c, &[Uno, Uno]);
        assert_eq!(c.lectura().0, 0.0);
    }

    #[test]
    fn el_decodificador_en_sus_16_codigos_y_sus_dos_polaridades() {
        for activo_alto in [true, false] {
            let mut d = Decodificador::new([0, 1, 2, 3], [4, 5, 6, 7, 8, 9, 10], activo_alto, 5000, 5000, X);
            for codigo in 0..16usize {
                let e: Vec<Nivel> = (0..4).map(|b| Nivel::de_bool(codigo >> b & 1 == 1)).collect();
                let s = todas(&mut d, &e);
                let encendidos: Vec<bool> = s.iter().map(|&n| (n == Uno) == activo_alto).collect();
                if codigo < 10 {
                    assert_eq!(encendidos, SEGMENTOS[codigo].to_vec(), "código {codigo}");
                    assert_eq!(d.lectura().0, codigo as f64);
                } else {
                    assert!(encendidos.iter().all(|&b| !b), "código {codigo}");
                    assert_eq!(d.lectura().0, -1.0);
                }
            }
            assert_eq!(todas(&mut d, &[Uno, X, Cero, Cero]), vec![X; 7]);
            assert_eq!(d.lectura().0, -2.0);
        }
        // El 7: a, b y c.
        assert_eq!(SEGMENTOS[7], [true, true, true, false, false, false, false]);
    }

    #[test]
    fn el_biestable_del_555_con_el_reinicio_dominante_y_el_disparo_sobre_el_umbral() {
        let mut b = Biestable555 { ent: [0, 1, 2, 3], sal: [3], retardo: 100_000 };
        // Entradas: disparo, umbral, reinicio y Q.
        let pide = |b: &mut Biestable555, e: [Nivel; 4]| {
            let mut out = Vec::new();
            b.evaluar(&e, &[e[3]], &mut out);
            assert_eq!(out[0].2, 100_000);
            out[0].1
        };
        assert_eq!(pide(&mut b, [Uno, Cero, Uno, Cero]), Uno);
        assert_eq!(pide(&mut b, [Uno, Uno, Uno, Cero]), Uno);
        assert_eq!(pide(&mut b, [Cero, Uno, Uno, Uno]), Cero);
        assert_eq!(pide(&mut b, [Cero, Cero, Uno, Uno]), Uno);
        assert_eq!(pide(&mut b, [Cero, Cero, Uno, Cero]), Cero);
        assert_eq!(pide(&mut b, [Uno, Cero, Cero, Uno]), Cero);
    }

    #[test]
    fn la_compuerta_pide_su_nivel_con_el_retardo_que_toca() {
        let mut g = Compuerta { f: Funcion::Nand, ent: vec![0, 1], sal: [2], subida: 3000, bajada: 7000, z: X };
        let mut out = Vec::new();
        g.evaluar(&[Uno, Uno], &[Uno], &mut out);
        assert_eq!(out, vec![(0, Cero, 7000)]);
        out.clear();
        g.evaluar(&[X, Uno], &[Cero], &mut out);
        assert_eq!(out, vec![(0, X, 3000)]);
    }
}
