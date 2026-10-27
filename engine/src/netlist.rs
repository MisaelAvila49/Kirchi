use serde::Deserialize;

use crate::digital::modelos::Funcion;
use crate::digital::Nivel;
use crate::error::EngineError;

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Wave {
    Dc { v: f64 },
    /// `phase`: fracción del ciclo en t = 0 (0 a 1, sin el 1). Con `continua` (el generador de funciones), un
    /// cambio en caliente sigue desde el punto del ciclo en que iba la onda anterior.
    Sine {
        offset: f64,
        amp: f64,
        freq: f64,
        #[serde(default)]
        phase: f64,
        #[serde(default)]
        continua: bool,
    },
    /// Pulso de SPICE (`PULSE`): de `low` sube en `rise` segundos a `high`, se queda `width`, baja en `fall` y se
    /// queda en `low` el resto del periodo. Un tramo de 0 es un flanco ideal; la triangular tiene `width` 0. `phase` y
    /// `continua` como en la senoidal (la fase reemplaza al retardo de SPICE: `td` = (1 − phase)/freq).
    Pulse {
        low: f64,
        high: f64,
        freq: f64,
        rise: f64,
        fall: f64,
        width: f64,
        #[serde(default)]
        phase: f64,
        #[serde(default)]
        continua: bool,
    },
    /// Escalera: `steps` niveles iguales de `low` a `high` en cada periodo (el último llega a `high`),
    /// con saltos ideales. `phase` y `continua` como en el pulso.
    Stair {
        low: f64,
        high: f64,
        freq: f64,
        steps: u32,
        #[serde(default)]
        phase: f64,
        #[serde(default)]
        continua: bool,
    },
    /// Valor por tramos: `puntos` son pares `[t, valor]` con tiempos crecientes desde 0 (hasta 1,000 puntos). Con `repetir`
    /// el periodo es el último tiempo.
    Pwl {
        puntos: Vec<[f64; 2]>,
        #[serde(default)]
        repetir: bool,
    },
    /// `duty`: fracción del periodo en `high` (0 a 1, sin incluirlos); sin él, 0.5.
    Square {
        low: f64,
        high: f64,
        freq: f64,
        #[serde(default = "default_duty")]
        duty: f64,
    },
}

fn default_duty() -> f64 {
    0.5
}

fn encendida() -> bool {
    true
}

/// Cotas de magnitud (razonables para un circuito de escritorio): fuera de ellas la matriz queda mal condicionada y el
/// motor diría «singular» o «no convergió» por un valor que el usuario escribió, en vez de rechazarlo desde el principio.
const R_RANGO: (f64, f64) = (1e-6, 1e12);
const C_RANGO: (f64, f64) = (1e-18, 1e3);
const L_RANGO: (f64, f64) = (1e-12, 1e6);
/// Mayor coeficiente de acoplamiento: con 1 las dos inductancias propias se vuelven una y la matriz de rama es singular.
const XFMR_K_MAX: f64 = 0.9999;
/// Voltaje o corriente de una fuente (V, A).
const FUENTE_MAX: f64 = 1e6;
const FRECUENCIA_RANGO: (f64, f64) = (1e-6, 1e9);
/// Pasos de una escalera (el generador de funciones).
const ESCALERA_MAX_PASOS: u32 = 256;
/// Coeficiente de emisión (`n`, `nf`, `nr`, `ne`, `nc`) y el de la ruptura (`nbv`).
const N_RANGO: (f64, f64) = (0.1, 100.0);
const NBV_RANGO: (f64, f64) = (0.1, 1e3);
/// Corriente de saturación (A): por encima el diodo conduce a 0 V y deja de ser un diodo.
const IS_MAX: f64 = 1e-3;
/// Resistencias en serie de un modelo (Ω) y voltaje de ruptura (V).
const R_SERIE_MAX: f64 = 1e12;
const BV_MAX: f64 = 1e6;
/// Cotas del MOSFET de nivel 1: voltaje de umbral (V), transconductancia (A/V²), modulación de canal (1/V), potencial de
/// unión (V), ancho y largo (m) y capacitancias del modelo (F).
const VTO_MAX: f64 = 100.0;
const MOS_KP_RANGO: (f64, f64) = (1e-9, 1e4);
const LAMBDA_MAX: f64 = 10.0;
const PB_RANGO: (f64, f64) = (0.1, 10.0);
const MOS_GEOMETRIA_RANGO: (f64, f64) = (1e-9, 1e3);
const CAP_MODELO_MAX: f64 = 1e-3;
/// Cotas del amplificador operacional: ganancia (V/V), producto ganancia-ancho de banda (Hz), velocidad de subida (V/s),
/// resistencias de entrada, de salida y entre alimentaciones (Ω), corriente máxima de salida (A) y distancia a las rieles (V).
const OA_GANANCIA_RANGO: (f64, f64) = (1.0, 1e9);
const OA_GBW_RANGO: (f64, f64) = (1e-3, 1e12);
const OA_SR_RANGO: (f64, f64) = (1e-3, 1e15);
const OA_RIN_RANGO: (f64, f64) = (1.0, 1e13);
const OA_ROUT_RANGO: (f64, f64) = (1e-3, 1e9);
const OA_ILIM_RANGO: (f64, f64) = (1e-9, 1e3);
const OA_RQ_RANGO: (f64, f64) = (1.0, 1e12);
const OA_DISTANCIA_MAX: f64 = 100.0;
/// Cotas del foco (aumento de resistencia al calentarse, potencia en W, inercia térmica en s) y del motor DC (constante en
/// V·s/rad, inercia y fricción viscosa en kg·m² y N·m·s/rad).
const LAMP_K_MAX: f64 = 1e3;
const LAMP_P_RANGO: (f64, f64) = (1e-6, 1e6);
const TAU_RANGO: (f64, f64) = (1e-6, 1e6);
const MOTOR_KE_RANGO: (f64, f64) = (1e-6, 1e3);
const MOTOR_INERCIA_RANGO: (f64, f64) = (1e-12, 1e6);
/// Cotas del fusible (corrientes nominal y de fusión, A) y del relé (corriente de cierre, A).
const FUSE_I_RANGO: (f64, f64) = (1e-6, 1e5);
const RELAY_I_RANGO: (f64, f64) = (1e-9, 1e3);
/// Cotas de la fuente de laboratorio: límite de corriente (A) y rodilla (V).
const PSU_I_RANGO: (f64, f64) = (1e-6, 1e3);
const PSU_VK_RANGO: (f64, f64) = (1e-6, 1.0);
/// Esquinas de una fuente por tramos.
const PWL_MAX_PUNTOS: usize = 1000;
/// Canales de valor de una netlist y cota de lo que llevan.
pub const MAX_CANALES: usize = 256;
const CANAL_MAX: f64 = 1e9;
/// Cotas de las fuentes controladas: ganancia de voltaje o corriente (V/V, A/A), transconductancia (S) y transresistencia (Ω).
const GANANCIA_MAX: f64 = 1e9;
const GM_MAX: f64 = 1e6;
const TRANSRESISTENCIA_MAX: f64 = 1e12;
/// Cotas del JFET de nivel 1: transconductancia beta (A/V²) y parámetro B de Parker y Skellern.
const JFET_BETA_RANGO: (f64, f64) = (1e-9, 1e4);
const JFET_B_RANGO: (f64, f64) = (1e-3, 1e3);
/// Cotas del termistor: constante beta (K), disipación (W/K), temperatura de quema (°C) y puntos de la tabla R/T.
const TERM_BETA_RANGO: (f64, f64) = (1.0, 1e5);
const TERM_DELTA_RANGO: (f64, f64) = (1e-6, 1e3);
const TERM_TMAX_RANGO: (f64, f64) = (1.0, 2000.0);
const TERM_MAX_PUNTOS: usize = 256;
/// Cotas de la fotorresistencia: pendiente log-log entre resistencia e iluminancia.
const LDR_GAMMA_RANGO: (f64, f64) = (0.05, 5.0);
/// Cotas del motor a pasos: dientes del rotor, retén (N·m), reducción y coeficiente de acoplamiento entre mitades.
const PASOS_DIENTES_RANGO: (u32, u32) = (1, 1000);
const PASOS_TD_MAX: f64 = 1e3;
const PASOS_REDUCCION_RANGO: (f64, f64) = (1.0, 1e6);
const PASOS_K_MUTUA_MAX: f64 = 0.9999;
/// Paso de tiempo máximo que acepta el motor (s).
pub const PASO_RANGO: (f64, f64) = (1e-15, 1e3);
/// Retardo de un elemento digital (s): de 1 ps (la resolución de la cola de eventos) a 1 ms.
pub const RETARDO_RANGO: (f64, f64) = (1e-12, 1e-3);
/// Umbrales y niveles de los puentes (V), en valor absoluto.
const UMBRAL_MAX: f64 = 1e3;

/// Cómo lee un elemento digital una entrada al aire (en Z): X en CMOS (74HC, CD4000B) y 1 en 74LS, como el chip real
///.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ZComo {
    #[default]
    X,
    Uno,
}

impl ZComo {
    pub fn nivel(self) -> Nivel {
        match self {
            ZComo::X => Nivel::X,
            ZComo::Uno => Nivel::Uno,
        }
    }
}

fn en(v: f64, (lo, hi): (f64, f64)) -> bool {
    v >= lo && v <= hi
}

/// El tramo del pulso (0 subida, 1 alto, 2 bajada, 3 bajo) en `pos` segundos desde el principio del ciclo.
fn tramo_pulso(pos: f64, rise: f64, width: f64, fall: f64) -> u8 {
    if pos < rise {
        0
    } else if pos < rise + width {
        1
    } else if pos < rise + width + fall {
        2
    } else {
        3
    }
}

/// El valor del tramo `tramo` en `pos` (acotado al tramo: un paso nunca cruza una esquina).
fn valor_tramo(tramo: u8, pos: f64, low: f64, high: f64, rise: f64, width: f64, fall: f64) -> f64 {
    match tramo {
        0 => low + (high - low) * (pos / rise).clamp(0.0, 1.0),
        1 => high,
        2 => high - (high - low) * ((pos - rise - width) / fall).clamp(0.0, 1.0),
        _ => low,
    }
}

/// Último tiempo de una onda por tramos (su periodo al repetir); infinito si solo tiene el punto de t = 0.
fn periodo_pwl(puntos: &[[f64; 2]]) -> f64 {
    match puntos.last() {
        Some(p) if p[0] > 0.0 => p[0],
        _ => f64::INFINITY,
    }
}

/// Interpola linealmente entre las esquinas; antes de la primera y después de la última se queda en su valor.
fn valor_pwl(puntos: &[[f64; 2]], t: f64) -> f64 {
    let Some(i) = puntos.iter().position(|p| p[0] >= t) else { return puntos.last().map_or(0.0, |p| p[1]) };
    if i == 0 {
        return puntos[0][1];
    }
    let (a, b) = (puntos[i - 1], puntos[i]);
    a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0])
}

impl Wave {
    fn in_range(&self) -> bool {
        let fase = |p: f64| (0.0..1.0).contains(&p);
        match *self {
            Wave::Dc { v } => v.abs() <= FUENTE_MAX,
            Wave::Sine { offset, amp, freq, phase, .. } => {
                offset.abs() <= FUENTE_MAX && amp.abs() <= FUENTE_MAX && freq.abs() <= FRECUENCIA_RANGO.1 && fase(phase)
            }
            Wave::Square { low, high, freq, .. } => low.abs() <= FUENTE_MAX && high.abs() <= FUENTE_MAX && en(freq, FRECUENCIA_RANGO),
            Wave::Stair { low, high, freq, steps, phase, .. } => {
                low.abs() <= FUENTE_MAX && high.abs() <= FUENTE_MAX && en(freq, FRECUENCIA_RANGO) && (2..=ESCALERA_MAX_PASOS).contains(&steps) && fase(phase)
            }
            Wave::Pwl { ref puntos, .. } => {
                (1..=PWL_MAX_PUNTOS).contains(&puntos.len())
                    && puntos[0][0] == 0.0
                    && puntos.windows(2).all(|w| w[1][0] > w[0][0])
                    && puntos.iter().all(|p| p[1].abs() <= FUENTE_MAX)
            }
            Wave::Pulse { low, high, freq, rise, fall, width, phase, .. } => {
                low.abs() <= FUENTE_MAX
                    && high.abs() <= FUENTE_MAX
                    && en(freq, FRECUENCIA_RANGO)
                    && rise >= 0.0
                    && fall >= 0.0
                    && width >= 0.0
                    && rise + width + fall <= (1.0 + 1e-9) / freq
                    && fase(phase)
            }
        }
    }

    pub fn at(&self, t: f64) -> f64 {
        match *self {
            Wave::Dc { v } => v,
            Wave::Sine { offset, amp, freq, phase, .. } => offset + amp * (2.0 * std::f64::consts::PI * (phase + freq * t)).sin(),
            Wave::Square { low, high, freq, duty } => {
                if (t * freq).fract() < duty { high } else { low }
            }
            Wave::Pulse { low, high, freq, rise, fall, width, phase, .. } => {
                let pos = (phase + t * freq).rem_euclid(1.0) / freq;
                valor_tramo(tramo_pulso(pos, rise, width, fall), pos, low, high, rise, width, fall)
            }
            Wave::Pwl { ref puntos, repetir } => valor_pwl(puntos, if repetir { t.rem_euclid(periodo_pwl(puntos)) } else { t }),
            Wave::Stair { low, high, freq, steps, phase, .. } => {
                let u = (phase + t * freq).rem_euclid(1.0);
                let k = ((u * steps as f64).floor() as u32).min(steps - 1);
                low + (high - low) * k as f64 / (steps - 1) as f64
            }
        }
    }

    /// Valor durante el paso de duración `h` que termina en `t`. Los pasos nunca cruzan un flanco (son puntos de quiebre), así que se lee a la mitad del paso: el que termina en un flanco usa el nivel de antes y el siguiente el de después.
    pub fn during(&self, t: f64, h: f64) -> f64 {
        match *self {
            Wave::Square { .. } | Wave::Stair { .. } => self.at(t - 0.5 * h),
            Wave::Pulse { low, high, freq, rise, fall, width, phase, .. } => {
                let medio = (phase + (t - 0.5 * h) * freq).rem_euclid(1.0) / freq;
                valor_tramo(tramo_pulso(medio, rise, width, fall), medio + 0.5 * h, low, high, rise, width, fall)
            }
            // El tramo se decide por el punto medio del paso: uno que termina justo al cerrar el periodo sigue en el último tramo.
            Wave::Pwl { ref puntos, repetir } => {
                let per = periodo_pwl(puntos);
                let ciclo = if repetir && per.is_finite() { ((t - 0.5 * h) / per).floor() * per } else { 0.0 };
                valor_pwl(puntos, t - ciclo)
            }
            _ => self.at(t),
        }
    }

    /// Primer flanco de la onda cuadrada o esquina del pulso después de `t` (con un margen de una milmillonésima de periodo,
    /// para que un paso que acaba de caer en un flanco no lo vuelva a encontrar). Las demás ondas no tienen.
    pub fn next_edge(&self, t: f64) -> f64 {
        match *self {
            Wave::Square { freq, duty, .. } => {
                let k = (t * freq).floor();
                let margen = 1e-9 / freq;
                [k + duty, k + 1.0, k + 1.0 + duty]
                    .into_iter()
                    .map(|p| p / freq)
                    .find(|&e| e > t + margen)
                    .unwrap_or(f64::INFINITY)
            }
            Wave::Pulse { freq, rise, fall, width, phase, .. } => {
                let per = 1.0 / freq;
                let inicio = ((phase + t * freq).floor() - phase) / freq;
                let margen = 1e-9 * per;
                let esquinas = [0.0, rise, rise + width, rise + width + fall];
                (0..2)
                    .flat_map(|c| esquinas.map(|e| inicio + c as f64 * per + e))
                    .find(|&x| x > t + margen)
                    .unwrap_or(f64::INFINITY)
            }
            Wave::Stair { freq, steps, phase, .. } => {
                let per = 1.0 / freq;
                let inicio = ((phase + t * freq).floor() - phase) / freq;
                let margen = 1e-9 * per;
                (0..2)
                    .flat_map(|c| (0..steps).map(move |j| inicio + c as f64 * per + j as f64 * per / steps as f64))
                    .find(|&x| x > t + margen)
                    .unwrap_or(f64::INFINITY)
            }
            Wave::Pwl { ref puntos, repetir } => {
                let per = periodo_pwl(puntos);
                if !per.is_finite() {
                    return f64::INFINITY;
                }
                let margen = 1e-9 * per;
                let inicio = if repetir { (t / per).floor() * per } else { 0.0 };
                let ciclos = if repetir { 2 } else { 1 };
                (0..ciclos)
                    .flat_map(|c| puntos.iter().map(move |p| inicio + c as f64 * per + p[0]))
                    .find(|&x| x > t + margen)
                    .unwrap_or(f64::INFINITY)
            }
            _ => f64::INFINITY,
        }
    }

    /// El punto del ciclo (0 a 1) en `t` de una onda periódica; None en la continua.
    pub fn ciclo(&self, t: f64) -> Option<f64> {
        match *self {
            Wave::Dc { .. } | Wave::Pwl { .. } => None,
            Wave::Sine { freq, phase, .. } | Wave::Pulse { freq, phase, .. } | Wave::Stair { freq, phase, .. } => Some((phase + freq * t).rem_euclid(1.0)),
            Wave::Square { freq, .. } => Some((freq * t).rem_euclid(1.0)),
        }
    }

    pub fn frecuencia(&self) -> Option<f64> {
        match *self {
            Wave::Dc { .. } | Wave::Pwl { .. } => None,
            Wave::Sine { freq, .. } | Wave::Square { freq, .. } | Wave::Pulse { freq, .. } | Wave::Stair { freq, .. } => Some(freq),
        }
    }

    /// Un cambio en caliente hacia esta onda conserva el punto del ciclo (el generador).
    pub fn continua(&self) -> bool {
        matches!(*self, Wave::Sine { continua: true, .. } | Wave::Pulse { continua: true, .. } | Wave::Stair { continua: true, .. })
    }

    /// Pone la fase de arranque de una senoidal o de un pulso.
    pub fn con_fase(&mut self, nueva: f64) {
        if let Wave::Sine { phase, .. } | Wave::Pulse { phase, .. } | Wave::Stair { phase, .. } = self {
            *phase = nueva;
        }
    }

    fn finite(&self) -> bool {
        match *self {
            Wave::Dc { v } => v.is_finite(),
            Wave::Sine { offset, amp, freq, phase, .. } => offset.is_finite() && amp.is_finite() && freq.is_finite() && phase.is_finite(),
            Wave::Square { low, high, freq, duty } => low.is_finite() && high.is_finite() && freq.is_finite() && duty.is_finite(),
            Wave::Pulse { low, high, freq, rise, fall, width, phase, .. } => {
                [low, high, freq, rise, fall, width, phase].iter().all(|v| v.is_finite())
            }
            Wave::Stair { low, high, freq, phase, .. } => [low, high, freq, phase].iter().all(|v| v.is_finite()),
            Wave::Pwl { ref puntos, .. } => puntos.iter().all(|p| p[0].is_finite() && p[1].is_finite()),
        }
    }
}

/// Parámetros del diodo con los nombres y los valores por omisión de ngspice. `bv` (ruptura inversa) solo en el zener.
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(default)]
pub struct DiodeModel {
    pub is: f64,
    pub n: f64,
    pub rs: f64,
    pub cjo: f64,
    pub vj: f64,
    pub m: f64,
    pub tt: f64,
    pub fc: f64,
    pub bv: Option<f64>,
    pub ibv: f64,
    pub nbv: f64,
}

impl Default for DiodeModel {
    fn default() -> Self {
        Self { is: 1e-14, n: 1.0, rs: 0.0, cjo: 0.0, vj: 1.0, m: 0.5, tt: 0.0, fc: 0.5, bv: None, ibv: 1e-3, nbv: 1.0 }
    }
}

impl DiodeModel {
    fn valid(&self) -> bool {
        let pos = [self.is, self.n, self.vj, self.ibv, self.nbv, self.bv.unwrap_or(1.0)];
        let nonneg = [self.rs, self.cjo, self.tt];
        self.is <= IS_MAX
            && en(self.n, N_RANGO)
            && en(self.nbv, NBV_RANGO)
            && self.rs <= R_SERIE_MAX
            && self.bv.unwrap_or(1.0) <= BV_MAX
            && pos.iter().all(|v| v.is_finite() && *v > 0.0)
            && nonneg.iter().all(|v| v.is_finite() && *v >= 0.0)
            && self.m > 0.0
            && self.m < 1.0
            && self.fc >= 0.0
            && self.fc < 1.0
    }
}

/// Voltaje de Early mínimo (V) que admite un modelo, salvo el cero (infinito).
const VA_MIN: f64 = 1.0;

/// Parámetros del transistor bipolar (Gummel-Poon) con los nombres y los valores por omisión de ngspice. Un valor
/// cero en `vaf`, `var`, `ikf`, `ikr`, `vtf` significa infinito, como en SPICE; sin `rbm`, vale `rb`.
/// Un nombre de parámetro que el motor no lee es un error (`deny_unknown_fields`): una errata en un `pieza.json` no se ignora en silencio.
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct BjtModel {
    pub is: f64,
    pub bf: f64,
    pub nf: f64,
    pub vaf: f64,
    pub ikf: f64,
    pub ise: f64,
    pub ne: f64,
    pub br: f64,
    pub nr: f64,
    pub var: f64,
    pub ikr: f64,
    pub isc: f64,
    pub nc: f64,
    pub rb: f64,
    pub irb: f64,
    pub rbm: Option<f64>,
    pub re: f64,
    pub rc: f64,
    pub cje: f64,
    pub vje: f64,
    pub mje: f64,
    pub tf: f64,
    pub xtf: f64,
    pub vtf: f64,
    pub itf: f64,
    pub cjc: f64,
    pub vjc: f64,
    pub mjc: f64,
    pub xcjc: f64,
    pub tr: f64,
    pub fc: f64,
}

impl Default for BjtModel {
    fn default() -> Self {
        Self {
            is: 1e-16, bf: 100.0, nf: 1.0, vaf: 0.0, ikf: 0.0, ise: 0.0, ne: 1.5, br: 1.0, nr: 1.0, var: 0.0, ikr: 0.0,
            isc: 0.0, nc: 2.0, rb: 0.0, irb: 0.0, rbm: None, re: 0.0, rc: 0.0, cje: 0.0, vje: 0.75, mje: 0.33, tf: 0.0,
            xtf: 0.0, vtf: 0.0, itf: 0.0, cjc: 0.0, vjc: 0.75, mjc: 0.33, xcjc: 1.0, tr: 0.0, fc: 0.5,
        }
    }
}

impl BjtModel {
    fn valid(&self) -> bool {
        let efecto_early = |v: f64| v == 0.0 || v >= VA_MIN;
        let pos = [self.is, self.bf, self.nf, self.ne, self.br, self.nr, self.nc, self.vje, self.vjc];
        let nonneg = [
            self.vaf, self.ikf, self.ise, self.var, self.ikr, self.isc, self.rb, self.irb, self.rbm.unwrap_or(0.0), self.re,
            self.rc, self.cje, self.tf, self.xtf, self.vtf, self.itf, self.cjc, self.tr,
        ];
        // Un voltaje de Early de menos de 1 V vuelve cero o negativo el denominador de la carga de base con una unión
        // en directo (0 es «infinito»).
        efecto_early(self.vaf)
            && efecto_early(self.var)
            && [self.is, self.ise, self.isc].iter().all(|v| *v <= IS_MAX)
            && [self.nf, self.nr, self.ne, self.nc].iter().all(|v| en(*v, N_RANGO))
            && [self.rb, self.rbm.unwrap_or(0.0), self.re, self.rc].iter().all(|v| *v <= R_SERIE_MAX)
            && pos.iter().all(|v| v.is_finite() && *v > 0.0)
            && nonneg.iter().all(|v| v.is_finite() && *v >= 0.0)
            && [self.mje, self.mjc].iter().all(|m| *m > 0.0 && *m < 1.0)
            && (0.0..=1.0).contains(&self.xcjc)
            && self.fc >= 0.0
            && self.fc < 1.0
    }
}

/// Parámetros del MOSFET de nivel 1 con los nombres y los valores por omisión de ngspice. `w` y `l` son de la
/// instancia en SPICE (`M1 d g s s modelo W=1 L=1`): con 1 m cada uno, `kp` es la beta y `cgso`, `cgdo` quedan en F.
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct MosModel {
    pub vto: f64,
    pub kp: f64,
    pub lambda: f64,
    pub rd: f64,
    pub rs: f64,
    pub cbd: f64,
    pub cbs: f64,
    pub is: f64,
    pub pb: f64,
    pub mj: f64,
    pub fc: f64,
    pub cgso: f64,
    pub cgdo: f64,
    pub w: f64,
    pub l: f64,
}

impl Default for MosModel {
    fn default() -> Self {
        Self {
            vto: 0.0, kp: 2e-5, lambda: 0.0, rd: 0.0, rs: 0.0, cbd: 0.0, cbs: 0.0, is: 1e-14, pb: 0.8, mj: 0.5, fc: 0.5,
            cgso: 0.0, cgdo: 0.0, w: 1e-4, l: 1e-4,
        }
    }
}

impl MosModel {
    fn valid(&self) -> bool {
        let pos = [self.kp, self.is, self.pb, self.w, self.l];
        let nonneg = [self.lambda, self.rd, self.rs, self.cbd, self.cbs, self.cgso, self.cgdo];
        self.vto.abs() <= VTO_MAX
            && en(self.kp, MOS_KP_RANGO)
            && self.lambda <= LAMBDA_MAX
            && self.is <= IS_MAX
            && en(self.pb, PB_RANGO)
            && [self.w, self.l].iter().all(|v| en(*v, MOS_GEOMETRIA_RANGO))
            && [self.rd, self.rs].iter().all(|v| *v <= R_SERIE_MAX)
            && [self.cbd, self.cbs, self.cgso, self.cgdo].iter().all(|v| *v <= CAP_MODELO_MAX)
            && pos.iter().all(|v| v.is_finite() && *v > 0.0)
            && nonneg.iter().all(|v| v.is_finite() && *v >= 0.0)
            && self.mj > 0.0
            && self.mj < 1.0
            && self.fc >= 0.0
            && self.fc < 1.0
    }
}

/// Parámetros del amplificador operacional de una etapa (sin equivalente en ngspice: los nombres son de Kirchi). Por
/// omisión, los de un LM741.
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct OpampModel {
    /// Ganancia en continua (V/V).
    pub a0: f64,
    /// Producto ganancia por ancho de banda (Hz).
    pub gbw: f64,
    /// Velocidad de subida (V/s).
    pub sr: f64,
    /// Resistencia de entrada diferencial (Ω).
    pub rin: f64,
    /// Resistencia de salida (Ω).
    pub rout: f64,
    /// Corriente de salida máxima (A).
    pub ilim: f64,
    /// Distancia mínima de la salida a la alimentación positiva y a la negativa (V).
    pub dhi: f64,
    pub dlo: f64,
    /// Resistencia entre las alimentaciones que da el consumo en reposo (Ω).
    pub rq: f64,
}

impl Default for OpampModel {
    fn default() -> Self {
        Self { a0: 2e5, gbw: 1e6, sr: 0.5e6, rin: 2e6, rout: 75.0, ilim: 25e-3, dhi: 1.0, dlo: 1.0, rq: 17.6e3 }
    }
}

impl OpampModel {
    fn valid(&self) -> bool {
        [self.a0, self.gbw, self.sr, self.rin, self.rout, self.ilim, self.rq].iter().all(|v| v.is_finite() && *v > 0.0)
            && [self.dhi, self.dlo].iter().all(|v| v.is_finite() && *v >= 0.0)
            && en(self.a0, OA_GANANCIA_RANGO)
            && en(self.gbw, OA_GBW_RANGO)
            && en(self.sr, OA_SR_RANGO)
            && en(self.rin, OA_RIN_RANGO)
            && en(self.rout, OA_ROUT_RANGO)
            && en(self.ilim, OA_ILIM_RANGO)
            && en(self.rq, OA_RQ_RANGO)
            && self.dhi <= OA_DISTANCIA_MAX
            && self.dlo <= OA_DISTANCIA_MAX
    }
}

/// Parámetros del JFET de nivel 1 con los nombres y los valores por omisión de ngspice.
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct JfetModel {
    pub vto: f64,
    pub beta: f64,
    pub lambda: f64,
    pub is: f64,
    pub n: f64,
    pub cgs: f64,
    pub cgd: f64,
    pub pb: f64,
    pub fc: f64,
    pub rd: f64,
    pub rs: f64,
    pub b: f64,
}

impl Default for JfetModel {
    fn default() -> Self {
        Self { vto: -2.0, beta: 1e-4, lambda: 0.0, is: 1e-14, n: 1.0, cgs: 0.0, cgd: 0.0, pb: 1.0, fc: 0.5, rd: 0.0, rs: 0.0, b: 1.0 }
    }
}

impl JfetModel {
    fn valid(&self) -> bool {
        let todos = [self.vto, self.beta, self.lambda, self.is, self.n, self.cgs, self.cgd, self.pb, self.fc, self.rd, self.rs, self.b];
        todos.iter().all(|v| v.is_finite())
            && self.vto.abs() <= VTO_MAX
            && en(self.beta, JFET_BETA_RANGO)
            && (0.0..=LAMBDA_MAX).contains(&self.lambda)
            && self.is > 0.0
            && self.is <= IS_MAX
            && en(self.n, N_RANGO)
            && [self.cgs, self.cgd].iter().all(|c| (0.0..=CAP_MODELO_MAX).contains(c))
            && en(self.pb, PB_RANGO)
            && (0.0..1.0).contains(&self.fc)
            && [self.rd, self.rs].iter().all(|r| (0.0..=R_SERIE_MAX).contains(r))
            && en(self.b, JFET_B_RANGO)
    }
}

/// Termistor de coeficiente negativo (NTC) o positivo (PTC).
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TipoTermistor {
    Ntc,
    Ptc,
}

/// Cómo entrega su valor un elemento de fuente externa: como voltaje o como corriente.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ModoExt {
    V,
    I,
}

fn k_mutua_omision() -> f64 {
    0.99
}

fn reduccion_omision() -> f64 {
    1.0
}

/// Una señal de control de un `MSI`: la entrada `entrada` (índice en las `entradas` del elemento), activa en bajo si `bajo`.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Senal {
    pub entrada: usize,
    #[serde(default)]
    pub bajo: bool,
}

/// Cómo se combinan las señales de un reloj efectivo.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Default)]
pub enum Combina {
    #[default]
    Y,
    O,
}

/// El flanco del reloj efectivo que dispara.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum FlancoReloj {
    #[default]
    Subida,
    Bajada,
}

/// Reloj efectivo: la Y o la O de sus señales (con su polaridad) y el flanco de ese resultado que dispara.
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Reloj {
    pub senales: Vec<Senal>,
    #[serde(default)]
    pub combina: Combina,
    #[serde(default)]
    pub flanco: FlancoReloj,
}

/// Una acción de control (borrar): su señal y si espera al reloj.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Accion {
    pub senal: Senal,
    #[serde(default)]
    pub sincrona: bool,
}

/// Carga paralela: su señal, si espera al reloj y las entradas (índices en `entradas`) con el dato, bit 0 primero.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Carga {
    pub senal: Senal,
    #[serde(default)]
    pub sincrona: bool,
    pub datos: Vec<usize>,
}

/// Reloj de un convertidor de aproximaciones: uno interno con su periodo (s) o el de una señal externa.
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(tag = "tipo", rename_all = "lowercase")]
pub enum RelojConv {
    Interno { periodo: f64 },
    Externo(Reloj),
}

/// El núcleo de estado de un `MSI`.
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(tag = "tipo", rename_all = "lowercase")]
pub enum Nucleo {
    Contador {
        bits: u8,
        modulo: u32,
        reloj: Reloj,
        #[serde(default)]
        abajo: Option<Reloj>,
        #[serde(default)]
        sentido: Option<Senal>,
        #[serde(default)]
        habilita: Vec<Senal>,
        #[serde(default)]
        borra: Option<Accion>,
        #[serde(default)]
        carga: Option<Carga>,
    },
    Desplazamiento {
        bits: u8,
        reloj: Reloj,
        #[serde(default)]
        serie: Vec<Senal>,
        #[serde(default)]
        borra: Option<Accion>,
        #[serde(default)]
        carga: Option<Carga>,
        #[serde(default)]
        almacen: Option<Reloj>,
    },
    Aproximaciones { bits: u8, cs: Senal, wr: Senal, rd: Senal, comparador: usize, reloj: RelojConv, ciclos_inicio: u32, ciclos_bit: u32 },
}

impl Nucleo {
    /// Bits del registro principal.
    pub fn bits(&self) -> u8 {
        match self {
            Nucleo::Contador { bits, .. } | Nucleo::Desplazamiento { bits, .. } | Nucleo::Aproximaciones { bits, .. } => *bits,
        }
    }

    /// Bits del registro auxiliar: el almacén del desplazamiento y el código de prueba del convertidor.
    fn bits_aux(&self) -> u8 {
        match self {
            Nucleo::Contador { .. } => 0,
            Nucleo::Desplazamiento { bits, almacen, .. } => {
                if almacen.is_some() {
                    *bits
                } else {
                    0
                }
            }
            Nucleo::Aproximaciones { bits, .. } => *bits,
        }
    }

    /// Banderas que expone: el fin de conversión.
    fn banderas(&self) -> u8 {
        u8::from(matches!(self, Nucleo::Aproximaciones { .. }))
    }

    /// Los índices de entrada que el núcleo nombra, para comprobar su rango.
    fn entradas_usadas(&self) -> Vec<usize> {
        let reloj = |r: &Reloj| r.senales.iter().map(|s| s.entrada).collect::<Vec<_>>();
        let carga = |c: &Option<Carga>| c.iter().flat_map(|c| std::iter::once(c.senal.entrada).chain(c.datos.iter().copied())).collect::<Vec<_>>();
        match self {
            Nucleo::Contador { reloj: r, abajo, sentido, habilita, borra, carga: c, .. } => reloj(r)
                .into_iter()
                .chain(abajo.iter().flat_map(reloj))
                .chain(sentido.iter().map(|s| s.entrada))
                .chain(habilita.iter().map(|s| s.entrada))
                .chain(borra.iter().map(|a| a.senal.entrada))
                .chain(carga(c))
                .collect(),
            Nucleo::Desplazamiento { reloj: r, serie, borra, carga: c, almacen, .. } => reloj(r)
                .into_iter()
                .chain(serie.iter().map(|s| s.entrada))
                .chain(borra.iter().map(|a| a.senal.entrada))
                .chain(carga(c))
                .chain(almacen.iter().flat_map(reloj))
                .collect(),
            Nucleo::Aproximaciones { cs, wr, rd, comparador, reloj: r, .. } => [cs.entrada, wr.entrada, rd.entrada, *comparador]
                .into_iter()
                .chain(match r {
                    RelojConv::Externo(r) => reloj(r),
                    RelojConv::Interno { .. } => Vec::new(),
                })
                .collect(),
        }
    }

    /// Lo que el núcleo exige de sí mismo: bits, módulo, relojes con señales, cargas con un dato por bit, periodo.
    fn invalido(&self) -> Option<&'static str> {
        if !(1..=16).contains(&self.bits()) {
            return Some("bits debe estar entre 1 y 16");
        }
        let reloj_vacio = |r: &Reloj| r.senales.is_empty();
        let carga_mala = |c: &Option<Carga>| c.as_ref().is_some_and(|c| c.datos.len() != self.bits() as usize);
        match self {
            Nucleo::Contador { bits, modulo, reloj, abajo, carga, .. } => {
                if !(2..=(1u32 << *bits)).contains(modulo) {
                    Some("modulo debe estar entre 2 y 2^bits")
                } else if reloj_vacio(reloj) || abajo.as_ref().is_some_and(reloj_vacio) {
                    Some("un reloj sin señales")
                } else if carga_mala(carga) {
                    Some("la carga necesita un dato por bit")
                } else {
                    None
                }
            }
            Nucleo::Desplazamiento { reloj, carga, almacen, .. } => {
                if reloj_vacio(reloj) || almacen.as_ref().is_some_and(reloj_vacio) {
                    Some("un reloj sin señales")
                } else if carga_mala(carga) {
                    Some("la carga necesita un dato por bit")
                } else {
                    None
                }
            }
            Nucleo::Aproximaciones { reloj, ciclos_bit, .. } => match reloj {
                RelojConv::Interno { periodo } if !(periodo.is_finite() && *periodo >= 1e-12 && *periodo <= 1e3) => Some("periodo fuera de rango"),
                RelojConv::Externo(r) if reloj_vacio(r) => Some("un reloj sin señales"),
                _ if *ciclos_bit == 0 => Some("ciclos_bit debe ser positivo"),
                _ => None,
            },
        }
    }
}

/// De dónde toma un valor la etapa de salida de un `MSI`: una entrada, un bit del registro principal (`Bit`), del auxiliar
/// (`Aux`) o una bandera del núcleo.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Fuente {
    Entrada(usize),
    Bit(u8),
    Aux(u8),
    Bandera(u8),
}

/// Una salida de un `MSI`: un bit del núcleo (negado o no) o una columna de su tabla de salida.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(tag = "tipo", rename_all = "lowercase")]
pub enum SalidaMsi {
    Directa {
        fuente: Fuente,
        #[serde(default)]
        negada: bool,
    },
    Tabla { columna: usize },
}

/// Una rebanada de un `LUT`: sus entradas y sus salidas (redes digitales).
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Rebanada {
    pub entradas: Vec<usize>,
    pub salidas: Vec<usize>,
}

/// Cómo entrega su corriente o voltaje el convertidor multiplicador.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ModoDacm {
    Voltaje,
    Corriente,
}

/// Tope de bits de índice de una tabla y de salidas por fila (dos bits por salida en un `u64`).
pub const TABLA_BITS_MAX: usize = 14;
pub const TABLA_SALIDAS_MAX: usize = 32;

/// El error de un elemento que el motor aún no sabe simular (lo comparten las fábricas de modelos y de dispositivos).
pub fn aun_no_se_simula(idx: usize) -> EngineError {
    EngineError::Invalid(format!("elemento {idx}: aún no se simula"))
}

/// Nodo 0 = tierra. `a` y `b` son los extremos; para fuentes, diodos y corriente
/// el sentido positivo va de `a` hacia `b` a través del elemento.
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum Element {
    R { a: usize, b: usize, ohms: f64 },
    C { a: usize, b: usize, farads: f64 },
    L { a: usize, b: usize, henries: f64 },
    V { a: usize, b: usize, wave: Wave },
    I { a: usize, b: usize, amps: f64 },
    D {
        a: usize,
        b: usize,
        #[serde(flatten)]
        model: DiodeModel,
    },
    /// Transistor bipolar: colector, base y emisor; `pnp` invierte las polaridades.
    Q {
        c: usize,
        b: usize,
        e: usize,
        #[serde(default)]
        pnp: bool,
        #[serde(default)]
        model: BjtModel,
    },
    /// MOSFET: drenador, compuerta y fuente (el sustrato va unido a la fuente); `pmos` invierte las polaridades.
    M {
        d: usize,
        g: usize,
        s: usize,
        #[serde(default)]
        pmos: bool,
        #[serde(default)]
        model: MosModel,
    },
    /// Amplificador operacional: entrada no inversora `p`, inversora `n`, salida y alimentaciones.
    OA {
        p: usize,
        n: usize,
        out: usize,
        vp: usize,
        vn: usize,
        #[serde(default)]
        model: OpampModel,
    },
    /// JFET: drenador, compuerta y fuente; `pjf` es el de canal P.
    J {
        d: usize,
        g: usize,
        s: usize,
        #[serde(default)]
        pjf: bool,
        #[serde(default)]
        model: JfetModel,
    },
    /// Fuente de voltaje controlada por voltaje: V(p,n) = `ganancia` V(cp,cn).
    E { p: usize, n: usize, cp: usize, cn: usize, ganancia: f64 },
    /// Fuente de corriente controlada por voltaje: `gm` (S) por V(cp,cn), de `p` a `n` por dentro.
    G { p: usize, n: usize, cp: usize, cn: usize, gm: f64 },
    /// Fuente de voltaje controlada por corriente: V(p,n) = `r` (Ω) por la corriente que entra por `cp` y sale por `cn`.
    H { p: usize, n: usize, cp: usize, cn: usize, r: f64 },
    /// Fuente de corriente controlada por corriente: `ganancia` por la corriente que entra por `cp` y sale por `cn`.
    F { p: usize, n: usize, cp: usize, cn: usize, ganancia: f64 },
    /// Termistor entre `a` y `b`: `r25` a 25 °C con `beta` (K) o con la tabla `rt` de pares `[°C, Ω]`, disipación `delta` (W/K),
    /// constante térmica `tau` (s), temperatura ambiente del `canal` y quema a `tmax` (°C).
    #[serde(rename = "TERM")]
    Term {
        a: usize,
        b: usize,
        tipo: TipoTermistor,
        r25: f64,
        beta: f64,
        #[serde(default)]
        rt: Option<Vec<[f64; 2]>>,
        delta: f64,
        tau: f64,
        canal: usize,
        tmax: f64,
    },
    /// Fotorresistencia: `r10` (Ω) a 10 lx con pendiente `gamma`, tope `roscuro` y constantes `tau_sube` y `tau_baja` (s); la luz sale del `canal`.
    #[serde(rename = "LDR")]
    Ldr { a: usize, b: usize, r10: f64, gamma: f64, roscuro: f64, tau_sube: f64, tau_baja: f64, canal: usize },
    /// Motor a pasos de dos fases: 4 `nodos` (bipolar) o 6 (unipolar, con toma central). `td` es el retén (N·m), `reduccion`
    /// solo escala lo que se muestra y la carga reflejada; `canal_carga` lee el par de carga.
    #[serde(rename = "PASOS")]
    Pasos {
        nodos: Vec<usize>,
        #[serde(default)]
        unipolar: bool,
        r: f64,
        l: f64,
        #[serde(default = "k_mutua_omision")]
        k_mutua: f64,
        km: f64,
        dientes: u32,
        td: f64,
        j: f64,
        bm: f64,
        #[serde(default)]
        canal_carga: Option<usize>,
        #[serde(default = "reduccion_omision")]
        reduccion: f64,
    },
    /// Fuente de valor externo: `k` por el valor del `canal` más `c`, como voltaje o corriente, con resistencia `r` en serie opcional.
    #[serde(rename = "EXT")]
    Ext {
        a: usize,
        b: usize,
        modo: ModoExt,
        canal: usize,
        k: f64,
        c: f64,
        #[serde(default)]
        r: Option<f64>,
    },
    /// Combinacional por tabla de verdad con rebanadas: `comunes` más las entradas de cada rebanada eligen la fila de
    /// `Netlist.tablas[tabla]`, que da dos bits por salida de la rebanada (0, 1, Z, X). `retardos` y `abierta` son por
    /// salida de rebanada; con `abierta` el 1 se vuelve Z (colector abierto).
    #[serde(rename = "LUT")]
    Lut {
        comunes: Vec<usize>,
        rebanadas: Vec<Rebanada>,
        tabla: usize,
        retardos: Vec<[f64; 2]>,
        #[serde(default)]
        abierta: Vec<bool>,
        #[serde(default)]
        z_como: ZComo,
    },
    /// Núcleo de estado con etapa de salida: `entradas` y `salidas` son redes digitales (un pin bidireccional va en las
    /// dos), `de` dice cómo sale cada salida y `fuentes` son las entradas de la tabla de salida `tabla`.
    #[serde(rename = "MSI")]
    Msi {
        entradas: Vec<usize>,
        salidas: Vec<usize>,
        nucleo: Nucleo,
        de: Vec<SalidaMsi>,
        #[serde(default)]
        fuentes: Vec<Fuente>,
        #[serde(default)]
        tabla: Option<usize>,
        retardos: Vec<[f64; 2]>,
        #[serde(default)]
        abierta: Vec<bool>,
        #[serde(default)]
        z_como: ZComo,
    },
    /// Convertidor multiplicador: los `bits` (la red más significativa primero) escalan la referencia `ref_p` - `ref_n` y
    /// la salida va de `out` a `ret`, en `modo` voltaje o corriente, con `t_asentamiento` entre un código y el siguiente.
    #[serde(rename = "DACM")]
    Dacm {
        modo: ModoDacm,
        out: usize,
        ret: usize,
        ref_p: usize,
        ref_n: usize,
        bits: Vec<usize>,
        t_asentamiento: f64,
        #[serde(default)]
        r_out: Option<f64>,
    },
    /// Interruptor que sigue a su `canal`: `r_on` con el valor mayor que 0.5 y `r_off` con el resto.
    #[serde(rename = "INTC")]
    Intc { a: usize, b: usize, canal: usize, r_on: f64, r_off: f64 },
    /// Foco: resistencia fría `rfrio`, caliente `rfrio (1 + k)` a la potencia nominal `pnom` (W), inercia `tau` (s).
    #[serde(rename = "LAMP")]
    Lamp { a: usize, b: usize, rfrio: f64, k: f64, pnom: f64, tau: f64 },
    /// Motor DC: resistencia `r` y inductancia `l` de la bobina, constante `ke` (V·s/rad, N·m/A), inercia `j` (kg·m²)
    /// y fricción viscosa `bm` (N·m·s/rad).
    #[serde(rename = "MOTOR")]
    Motor { a: usize, b: usize, r: f64, l: f64, ke: f64, j: f64, bm: f64 },
    /// Fusible: resistencia `ohms`, corriente nominal `inom`, de fusión `ifusion` (A) y constante térmica `tau` (s). `v` es una
    /// fuente en serie de `a` a `b` (0 por omisión): con ella el multímetro es un solo elemento sin nodos internos (la
    /// fuente de prueba del óhmetro, la resistencia del modo y el fusible).
    #[serde(rename = "FUSE")]
    Fuse {
        a: usize,
        b: usize,
        ohms: f64,
        inom: f64,
        ifusion: f64,
        tau: f64,
        #[serde(default)]
        v: f64,
        /// Sin carga: no estampa nada (el voltímetro ideal). Falso por omisión.
        #[serde(default)]
        sin_carga: bool,
    },
    /// Relé: bobina entre `a1` y `a2` (`r`, `l`), contacto común `com` con normalmente abierto `na` y normalmente
    /// cerrado `nc`; opera con `ion` y libera con `ioff` (A).
    #[serde(rename = "RELAY")]
    Relay { a1: usize, a2: usize, com: usize, na: usize, nc: usize, r: f64, l: f64, ion: f64, ioff: f64 },
    /// Dos inductores acoplados (el transformador), como `L1 a1 b1 l1`, `L2 a2 b2 l2` y `K1 L1 L2 k` de
    /// ngspice: `l1` y `l2` en henrios y `k` el coeficiente de acoplamiento (0 a 0.9999). El punto de cada devanado es `a1` y `a2`.
    #[serde(rename = "XFMR")]
    Xfmr { a1: usize, b1: usize, a2: usize, b2: usize, l1: f64, l2: f64, k: f64 },
    /// Fuente de laboratorio: `v` de `a` (+) a `b` (−) con la corriente limitada a `ilim` (A) y una rodilla de
    /// `vk` (V); `encendida` en false es 1 GΩ.
    #[serde(rename = "PSU")]
    Psu {
        a: usize,
        b: usize,
        v: f64,
        ilim: f64,
        vk: f64,
        #[serde(default = "encendida")]
        encendida: bool,
    },
    /// Zumbador activo: una resistencia que suena desde `umbral` volts entre sus terminales (el motor registra el
    /// instante de cada cruce, `Transient::take_cruces`).
    #[serde(rename = "BUZZER")]
    Buzzer { a: usize, b: usize, ohms: f64, umbral: f64 },
    /// Compuerta: lee las redes digitales `inputs` y maneja `output` con los retardos de su familia (s). Las
    /// redes digitales se numeran aparte de los nodos, de 0 a `digital_nets` - 1. Con `enable` (activo en bajo si
    /// `enable_bajo`) la salida queda en Z mientras no está habilitada y puede compartir su red con otras salidas de tres estados.
    #[serde(rename = "GATE")]
    Gate {
        #[serde(rename = "fn")]
        func: Funcion,
        inputs: Vec<usize>,
        output: usize,
        rise_delay: f64,
        fall_delay: f64,
        #[serde(default)]
        z_como: ZComo,
        #[serde(default)]
        enable: Option<usize>,
        #[serde(default)]
        enable_bajo: bool,
    },
    /// Estado lógico: maneja la red digital `out` con `value` (0 o 1); se conmuta en caliente.
    #[serde(rename = "LOGIC")]
    Logic { out: usize, value: u8 },
    /// Contador de 4 bits por flanco de subida con reinicio asíncrono activo en alto; cuenta hasta `modulo - 1` (10 o 16).
    #[serde(rename = "COUNTER")]
    Counter {
        clk: usize,
        rst: usize,
        q: [usize; 4],
        co: usize,
        modulo: u8,
        rise_delay: f64,
        fall_delay: f64,
        #[serde(default)]
        z_como: ZComo,
    },
    /// Decodificador BCD a 7 segmentos: entradas A a D, salidas a a g, activas en alto (CD4511) o en bajo (74LS47).
    #[serde(rename = "DECODER")]
    Decoder {
        inputs: [usize; 4],
        outputs: [usize; 7],
        activo_alto: bool,
        rise_delay: f64,
        fall_delay: f64,
        #[serde(default)]
        z_como: ZComo,
    },
    /// Biestable del 555: lee los comparadores de disparo, de umbral y de reinicio y su propia salida `q`.
    #[serde(rename = "LATCH555")]
    Latch555 { trig: usize, thr: usize, res: usize, q: usize, delay: f64 },
    /// Salida y descarga del 555: la red digital `q` maneja `out` con niveles respecto de `gnd` (bajo) y `vcc` (alto) y la
    /// descarga entre `dis` y `gnd` (`g_on` en bajo, `g_off` en alto), con la misma rampa.
    #[serde(rename = "OUT555")]
    Out555 {
        q: usize,
        out: usize,
        dis: usize,
        vcc: usize,
        gnd: usize,
        v_lo: f64,
        r_lo: f64,
        v_hi: f64,
        r_hi: f64,
        g_on: f64,
        g_off: f64,
        t_rise: f64,
        t_fall: f64,
    },
    /// Biestable D por flanco de subida con PRE y CLR activos en bajo (como el 74HC74).
    #[serde(rename = "DFF")]
    Dff {
        d: usize,
        clk: usize,
        pre: usize,
        clr: usize,
        q: usize,
        qn: usize,
        rise_delay: f64,
        fall_delay: f64,
        #[serde(default)]
        z_como: ZComo,
    },
    /// Biestable JK por flanco de bajada con PRE y CLR activos en bajo (como el 74HC112).
    #[serde(rename = "JKFF")]
    Jkff {
        j: usize,
        k: usize,
        clk: usize,
        pre: usize,
        clr: usize,
        q: usize,
        qn: usize,
        rise_delay: f64,
        fall_delay: f64,
        #[serde(default)]
        z_como: ZComo,
    },
    /// Puente de entrada: lee V(p) - V(n) contra `in_low` e `in_high` y maneja la red digital `out`. Con `r_in`, la entrada
    /// toma corriente (74LS): `r_in` a un voltaje interno `v_in`. Con `histeresis` (disparador Schmitt) no hay zona X:
    /// sube a 1 al llegar a `in_high` y baja a 0 al llegar a `in_low`, y entre los dos conserva su nivel.
    #[serde(rename = "ADC")]
    Adc {
        p: usize,
        n: usize,
        out: usize,
        in_low: f64,
        in_high: f64,
        #[serde(default)]
        r_in: Option<f64>,
        #[serde(default)]
        v_in: f64,
        #[serde(default)]
        histeresis: bool,
    },
    /// Puente de salida: la red digital `input` maneja el nodo `out` con un Thévenin de `v_lo` y `r_lo` (bajo) a `v_hi` y
    /// `r_hi` (alto), en rampa de `t_rise` o `t_fall`; con `lo` y `hi`, los niveles son respecto de esos nodos.
    #[serde(rename = "DAC")]
    Dac {
        input: usize,
        out: usize,
        #[serde(default)]
        lo: Option<usize>,
        #[serde(default)]
        hi: Option<usize>,
        v_lo: f64,
        v_hi: f64,
        r_lo: f64,
        r_hi: f64,
        t_rise: f64,
        t_fall: f64,
        /// La salida queda en alta impedancia cuando su red digital está en Z (salida de tres estados).
        #[serde(default)]
        z: bool,
    },
}

impl Element {
    /// Los nodos de sus terminales.
    pub fn nodes(&self) -> Vec<usize> {
        match *self {
            Element::R { a, b, .. }
            | Element::C { a, b, .. }
            | Element::L { a, b, .. }
            | Element::V { a, b, .. }
            | Element::I { a, b, .. }
            | Element::D { a, b, .. }
            | Element::Lamp { a, b, .. }
            | Element::Motor { a, b, .. }
            | Element::Fuse { a, b, .. }
            | Element::Psu { a, b, .. }
            | Element::Buzzer { a, b, .. }
            | Element::Term { a, b, .. }
            | Element::Ldr { a, b, .. }
            | Element::Ext { a, b, .. }
            | Element::Intc { a, b, .. } => vec![a, b],
            Element::Dacm { out, ret, ref_p, ref_n, .. } => vec![out, ret, ref_p, ref_n],
            Element::J { d, g, s, .. } => vec![d, g, s],
            Element::E { p, n, cp, cn, .. } | Element::G { p, n, cp, cn, .. } | Element::H { p, n, cp, cn, .. } | Element::F { p, n, cp, cn, .. } => {
                vec![p, n, cp, cn]
            }
            Element::Pasos { ref nodos, .. } => nodos.clone(),
            Element::Relay { a1, a2, com, na, nc, .. } => vec![a1, a2, com, na, nc],
            Element::Xfmr { a1, b1, a2, b2, .. } => vec![a1, b1, a2, b2],
            Element::Q { c, b, e, .. } => vec![c, b, e],
            Element::M { d, g, s, .. } => vec![d, g, s],
            Element::OA { p, n, out, vp, vn, .. } => vec![p, n, out, vp, vn],
            Element::Gate { .. }
            | Element::Logic { .. }
            | Element::Dff { .. }
            | Element::Jkff { .. }
            | Element::Counter { .. }
            | Element::Decoder { .. }
            | Element::Latch555 { .. }
            | Element::Lut { .. }
            | Element::Msi { .. } => vec![],
            Element::Adc { p, n, .. } => vec![p, n],
            Element::Out555 { out, dis, vcc, gnd, .. } => vec![out, dis, vcc, gnd],
            Element::Dac { out, lo, hi, .. } => [Some(out), lo, hi].into_iter().flatten().collect(),
        }
    }

    /// Los canales de valor que lee.
    pub fn canales_usados(&self) -> Vec<usize> {
        match self {
            Element::Term { canal, .. } | Element::Ldr { canal, .. } | Element::Ext { canal, .. } | Element::Intc { canal, .. } => vec![*canal],
            Element::Pasos { canal_carga, .. } => canal_carga.iter().copied().collect(),
            _ => vec![],
        }
    }

    /// Un puente entre la lógica y la matriz: es un dispositivo analógico con un lado digital.
    pub fn es_puente(&self) -> bool {
        matches!(self, Element::Adc { .. } | Element::Dac { .. } | Element::Out555 { .. })
    }

    /// Un elemento solo digital: no tiene nodos analógicos ni entra a una matriz.
    pub fn es_digital(&self) -> bool {
        matches!(
            self,
            Element::Gate { .. }
                | Element::Logic { .. }
                | Element::Dff { .. }
                | Element::Jkff { .. }
                | Element::Counter { .. }
                | Element::Decoder { .. }
                | Element::Latch555 { .. }
                | Element::Lut { .. }
                | Element::Msi { .. }
        )
    }

    /// Si alguna salida puede quedar en Z (una compuerta con habilitación, una salida abierta o una tabla con Z): solo
    /// estas comparten red con una salida fija. `tablas` son las de la netlist.
    pub fn tres_estados(&self, tablas: &[Vec<u64>]) -> bool {
        let con_z = |t: usize, n_sal: usize| {
            tablas.get(t).is_some_and(|f| {
                let campos = n_sal.min(TABLA_SALIDAS_MAX);
                f.iter().any(|&fila| (0..campos).any(|j| (fila >> (2 * j)) & 3 == 2))
            })
        };
        match self {
            Element::Gate { enable, .. } => enable.is_some(),
            Element::Lut { rebanadas, tabla, abierta, .. } => abierta.iter().any(|&a| a) || con_z(*tabla, rebanadas.first().map_or(0, |r| r.salidas.len())),
            Element::Msi { tabla: Some(t), abierta, .. } => abierta.iter().any(|&a| a) || con_z(*t, TABLA_SALIDAS_MAX),
            Element::Msi { abierta, .. } => abierta.iter().any(|&a| a),
            _ => false,
        }
    }

    /// Las redes digitales que lee.
    pub fn entradas_digitales(&self) -> Vec<usize> {
        match self {
            Element::Gate { inputs, enable, .. } => inputs.iter().copied().chain(*enable).collect(),
            Element::Dac { input, .. } => vec![*input],
            Element::Dff { d, clk, pre, clr, .. } => vec![*d, *clk, *pre, *clr],
            Element::Jkff { j, k, clk, pre, clr, .. } => vec![*j, *k, *clk, *pre, *clr],
            Element::Counter { clk, rst, .. } => vec![*clk, *rst],
            Element::Decoder { inputs, .. } => inputs.to_vec(),
            Element::Latch555 { trig, thr, res, q, .. } => vec![*trig, *thr, *res, *q],
            Element::Out555 { q, .. } => vec![*q],
            Element::Lut { comunes, rebanadas, .. } => comunes.iter().copied().chain(rebanadas.iter().flat_map(|r| r.entradas.iter().copied())).collect(),
            Element::Msi { entradas, .. } => entradas.clone(),
            Element::Dacm { bits, .. } => bits.clone(),
            _ => vec![],
        }
    }

    /// Las redes digitales que maneja.
    pub fn salidas_digitales(&self) -> Vec<usize> {
        match self {
            Element::Gate { output, .. } => vec![*output],
            Element::Logic { out, .. } => vec![*out],
            Element::Adc { out, .. } => vec![*out],
            Element::Dff { q, qn, .. } | Element::Jkff { q, qn, .. } => vec![*q, *qn],
            Element::Counter { q, co, .. } => q.iter().copied().chain([*co]).collect(),
            Element::Decoder { outputs, .. } => outputs.to_vec(),
            Element::Latch555 { q, .. } => vec![*q],
            Element::Lut { rebanadas, .. } => rebanadas.iter().flat_map(|r| r.salidas.iter().copied()).collect(),
            Element::Msi { salidas, .. } => salidas.clone(),
            _ => vec![],
        }
    }

    /// Los retardos del elemento con el nombre de su parámetro (los de XSPICE), para validarlos.
    fn retardos(&self) -> Vec<(&'static str, f64)> {
        match self {
            Element::Gate { rise_delay, fall_delay, .. }
            | Element::Dff { rise_delay, fall_delay, .. }
            | Element::Jkff { rise_delay, fall_delay, .. }
            | Element::Counter { rise_delay, fall_delay, .. }
            | Element::Decoder { rise_delay, fall_delay, .. } => {
                vec![("rise_delay", *rise_delay), ("fall_delay", *fall_delay)]
            }
            Element::Dac { t_rise, t_fall, .. } | Element::Out555 { t_rise, t_fall, .. } => vec![("t_rise", *t_rise), ("t_fall", *t_fall)],
            Element::Latch555 { delay, .. } => vec![("delay", *delay)],
            Element::Lut { retardos, .. } | Element::Msi { retardos, .. } => retardos.iter().flat_map(|r| [("retardos", r[0]), ("retardos", r[1])]).collect(),
            Element::Dacm { t_asentamiento, .. } => vec![("t_asentamiento", *t_asentamiento)],
            _ => vec![],
        }
    }

    /// Un parámetro de un puente fuera de rango, dicho con su nombre.
    fn puente_invalido(&self) -> Option<String> {
        let umbral = |nombre: &str, v: f64| (!(v.is_finite() && v.abs() <= UMBRAL_MAX)).then(|| format!("{nombre} fuera de rango (hasta 1e3 V)"));
        let resistencia = |nombre: &str, r: f64| (!en(r, R_RANGO)).then(|| format!("{nombre} fuera de rango (de 1e-6 a 1e12 Ω)"));
        match *self {
            Element::Adc { in_low, in_high, r_in, v_in, .. } => umbral("in_low", in_low)
                .or_else(|| umbral("in_high", in_high))
                .or_else(|| umbral("v_in", v_in))
                .or_else(|| r_in.and_then(|r| resistencia("r_in", r)))
                .or_else(|| (in_low > in_high).then(|| "in_low debe ser menor o igual que in_high".to_string())),
            Element::Dac { out, v_lo, v_hi, r_lo, r_hi, .. } => (out == 0)
                .then(|| "la salida de un puente no puede ser la tierra".to_string())
                .or_else(|| umbral("v_lo", v_lo))
                .or_else(|| umbral("v_hi", v_hi))
                .or_else(|| resistencia("r_lo", r_lo))
                .or_else(|| resistencia("r_hi", r_hi)),
            Element::Out555 { out, v_lo, v_hi, r_lo, r_hi, g_on, g_off, .. } => {
                let conductancia = |nombre: &str, g: f64| (!en(g, (1e-12, 1e6))).then(|| format!("{nombre} fuera de rango (de 1e-12 a 1e6 S)"));
                (out == 0)
                    .then(|| "la salida de un puente no puede ser la tierra".to_string())
                    .or_else(|| umbral("v_lo", v_lo))
                    .or_else(|| umbral("v_hi", v_hi))
                    .or_else(|| resistencia("r_lo", r_lo))
                    .or_else(|| resistencia("r_hi", r_hi))
                    .or_else(|| conductancia("g_on", g_on))
                    .or_else(|| conductancia("g_off", g_off))
            }
            _ => None,
        }
    }

    /// El mismo elemento con cada nodo analógico `k` cambiado por `f(k)`; las redes digitales no cambian. La netlist de
    /// cada isla numera sus nodos desde 1 (`mixto.rs`).
    pub fn con_nodos(&self, f: impl Fn(usize) -> usize) -> Element {
        let mut e = self.clone();
        match &mut e {
            Element::R { a, b, .. }
            | Element::C { a, b, .. }
            | Element::L { a, b, .. }
            | Element::V { a, b, .. }
            | Element::I { a, b, .. }
            | Element::D { a, b, .. }
            | Element::Lamp { a, b, .. }
            | Element::Motor { a, b, .. }
            | Element::Fuse { a, b, .. }
            | Element::Psu { a, b, .. }
            | Element::Buzzer { a, b, .. }
            | Element::Term { a, b, .. }
            | Element::Ldr { a, b, .. }
            | Element::Ext { a, b, .. }
            | Element::Intc { a, b, .. } => {
                *a = f(*a);
                *b = f(*b);
            }
            Element::Dacm { out, ret, ref_p, ref_n, .. } => {
                for k in [out, ret, ref_p, ref_n] {
                    *k = f(*k);
                }
            }
            Element::J { d, g, s, .. } => {
                for k in [d, g, s] {
                    *k = f(*k);
                }
            }
            Element::E { p, n, cp, cn, .. } | Element::G { p, n, cp, cn, .. } | Element::H { p, n, cp, cn, .. } | Element::F { p, n, cp, cn, .. } => {
                for k in [p, n, cp, cn] {
                    *k = f(*k);
                }
            }
            Element::Pasos { nodos, .. } => {
                for k in nodos.iter_mut() {
                    *k = f(*k);
                }
            }
            Element::Relay { a1, a2, com, na, nc, .. } => {
                for k in [a1, a2, com, na, nc] {
                    *k = f(*k);
                }
            }
            Element::Xfmr { a1, b1, a2, b2, .. } => {
                for k in [a1, b1, a2, b2] {
                    *k = f(*k);
                }
            }
            Element::Q { c, b, e, .. } => {
                for k in [c, b, e] {
                    *k = f(*k);
                }
            }
            Element::M { d, g, s, .. } => {
                for k in [d, g, s] {
                    *k = f(*k);
                }
            }
            Element::OA { p, n, out, vp, vn, .. } => {
                for k in [p, n, out, vp, vn] {
                    *k = f(*k);
                }
            }
            Element::Adc { p, n, .. } => {
                *p = f(*p);
                *n = f(*n);
            }
            Element::Dac { out, lo, hi, .. } => {
                *out = f(*out);
                for k in [lo, hi].into_iter().flatten() {
                    *k = f(*k);
                }
            }
            Element::Out555 { out, dis, vcc, gnd, .. } => {
                for k in [out, dis, vcc, gnd] {
                    *k = f(*k);
                }
            }
            Element::Gate { .. }
            | Element::Logic { .. }
            | Element::Dff { .. }
            | Element::Jkff { .. }
            | Element::Counter { .. }
            | Element::Decoder { .. }
            | Element::Latch555 { .. }
            | Element::Lut { .. }
            | Element::Msi { .. } => {}
        }
        e
    }

    /// Los de dos terminales no pueden tenerlos en el mismo nodo.
    fn two_terminal(&self) -> bool {
        self.nodes().len() == 2
    }

    /// Parámetros que deben ser positivos (y finitos).
    fn positive(&self) -> Vec<f64> {
        match self {
            Element::R { ohms, .. } => vec![*ohms],
            Element::C { farads, .. } => vec![*farads],
            Element::L { henries, .. } => vec![*henries],
            Element::D { model, .. } => vec![model.is, model.n],
            Element::V { wave: Wave::Square { freq, .. }, .. } | Element::V { wave: Wave::Pulse { freq, .. }, .. } | Element::V { wave: Wave::Stair { freq, .. }, .. } => vec![*freq],
            Element::Lamp { rfrio, pnom, tau, .. } => vec![*rfrio, *pnom, *tau],
            Element::Motor { r, l, ke, j, bm, .. } => vec![*r, *l, *ke, *j, *bm],
            Element::Fuse { ohms, inom, ifusion, tau, .. } => vec![*ohms, *inom, *ifusion, *tau],
            Element::Psu { ilim, vk, .. } => vec![*ilim, *vk],
            Element::Buzzer { ohms, umbral, .. } => vec![*ohms, *umbral],
            Element::Relay { r, l, ion, .. } => vec![*r, *l, *ion],
            Element::Xfmr { l1, l2, .. } => vec![*l1, *l2],
            Element::Term { r25, beta, delta, tau, tmax, .. } => vec![*r25, *beta, *delta, *tau, *tmax],
            Element::Ldr { r10, gamma, roscuro, tau_sube, tau_baja, .. } => vec![*r10, *gamma, *roscuro, *tau_sube, *tau_baja],
            Element::Pasos { r, l, km, j, bm, reduccion, .. } => vec![*r, *l, *km, *j, *bm, *reduccion],
            Element::Intc { r_on, r_off, .. } => vec![*r_on, *r_off],
            Element::Dacm { t_asentamiento, .. } => vec![*t_asentamiento],
            Element::J { .. }
            | Element::E { .. }
            | Element::G { .. }
            | Element::H { .. }
            | Element::F { .. }
            | Element::Ext { .. }
            | Element::V { .. }
            | Element::I { .. }
            | Element::Q { .. }
            | Element::M { .. }
            | Element::OA { .. }
            | Element::Gate { .. }
            | Element::Logic { .. }
            | Element::Dff { .. }
            | Element::Jkff { .. }
            | Element::Counter { .. }
            | Element::Decoder { .. }
            | Element::Latch555 { .. }
            | Element::Lut { .. }
            | Element::Msi { .. }
            | Element::Adc { .. }
            | Element::Dac { .. }
            | Element::Out555 { .. } => vec![],
        }
    }

    /// Los demás parámetros de su modelo, dentro de los rangos que admite SPICE.
    fn model_ok(&self) -> bool {
        match self {
            Element::D { model, .. } => model.valid(),
            Element::Q { model, .. } => model.valid(),
            Element::M { model, .. } => model.valid(),
            Element::J { model, .. } => model.valid(),
            Element::Term { rt: Some(rt), .. } => {
                (2..=TERM_MAX_PUNTOS).contains(&rt.len())
                    && rt.windows(2).all(|w| w[1][0] > w[0][0])
                    && rt.iter().all(|p| p[0].is_finite() && p[1].is_finite() && en(p[1], R_RANGO))
            }
            Element::Pasos { nodos, unipolar, k_mutua, td, dientes, .. } => {
                nodos.len() == if *unipolar { 6 } else { 4 }
                    && (0.0..=PASOS_K_MUTUA_MAX).contains(k_mutua)
                    && (0.0..=PASOS_TD_MAX).contains(td)
                    && (PASOS_DIENTES_RANGO.0..=PASOS_DIENTES_RANGO.1).contains(dientes)
            }
            Element::OA { model, .. } => model.valid(),
            Element::Lamp { k, .. } => k.is_finite() && *k >= 0.0,
            Element::Relay { ion, ioff, .. } => ioff.is_finite() && *ioff >= 0.0 && ioff < ion,
            Element::Xfmr { k, .. } => k.is_finite() && *k >= 0.0 && *k <= XFMR_K_MAX,
            _ => true,
        }
    }

    /// Valores dentro de las cotas de magnitud de arriba.
    fn in_range(&self) -> bool {
        match self {
            Element::R { ohms, .. } => en(*ohms, R_RANGO),
            Element::C { farads, .. } => en(*farads, C_RANGO),
            Element::L { henries, .. } => en(*henries, L_RANGO),
            Element::Xfmr { l1, l2, .. } => en(*l1, L_RANGO) && en(*l2, L_RANGO),
            Element::V { wave, .. } => wave.in_range(),
            Element::I { amps, .. } => amps.abs() <= FUENTE_MAX,
            Element::Lamp { rfrio, k, pnom, tau, .. } => en(*rfrio, R_RANGO) && *k <= LAMP_K_MAX && en(*pnom, LAMP_P_RANGO) && en(*tau, TAU_RANGO),
            Element::Motor { r, l, ke, j, bm, .. } => {
                en(*r, R_RANGO) && en(*l, L_RANGO) && en(*ke, MOTOR_KE_RANGO) && en(*j, MOTOR_INERCIA_RANGO) && en(*bm, MOTOR_INERCIA_RANGO)
            }
            Element::Fuse { ohms, inom, ifusion, tau, v, .. } => {
                en(*ohms, R_RANGO) && en(*inom, FUSE_I_RANGO) && en(*ifusion, FUSE_I_RANGO) && en(*tau, TAU_RANGO) && v.abs() <= FUENTE_MAX
            }
            Element::Relay { r, l, ion, ioff, .. } => en(*r, R_RANGO) && en(*l, L_RANGO) && en(*ion, RELAY_I_RANGO) && *ioff <= RELAY_I_RANGO.1,
            Element::Psu { v, ilim, vk, .. } => v.abs() <= FUENTE_MAX && en(*ilim, PSU_I_RANGO) && en(*vk, PSU_VK_RANGO),
            Element::Buzzer { ohms, umbral, .. } => en(*ohms, R_RANGO) && en(*umbral, (1e-6, UMBRAL_MAX)),
            Element::E { ganancia, .. } | Element::F { ganancia, .. } => ganancia.abs() <= GANANCIA_MAX,
            Element::G { gm, .. } => gm.abs() <= GM_MAX,
            Element::H { r, .. } => r.abs() <= TRANSRESISTENCIA_MAX,
            Element::Term { r25, beta, delta, tau, tmax, .. } => {
                en(*r25, R_RANGO) && en(*beta, TERM_BETA_RANGO) && en(*delta, TERM_DELTA_RANGO) && en(*tau, TAU_RANGO) && en(*tmax, TERM_TMAX_RANGO)
            }
            Element::Ldr { r10, gamma, roscuro, tau_sube, tau_baja, .. } => {
                en(*r10, R_RANGO) && en(*gamma, LDR_GAMMA_RANGO) && en(*roscuro, R_RANGO) && en(*tau_sube, TAU_RANGO) && en(*tau_baja, TAU_RANGO)
            }
            Element::Pasos { r, l, km, j, bm, reduccion, .. } => {
                en(*r, R_RANGO)
                    && en(*l, L_RANGO)
                    && en(*km, MOTOR_KE_RANGO)
                    && en(*j, MOTOR_INERCIA_RANGO)
                    && en(*bm, MOTOR_INERCIA_RANGO)
                    && en(*reduccion, PASOS_REDUCCION_RANGO)
            }
            Element::Ext { k, c, r, .. } => k.abs() <= CANAL_MAX && c.abs() <= FUENTE_MAX && r.is_none_or(|r| en(r, R_RANGO)),
            Element::Intc { r_on, r_off, .. } => en(*r_on, R_RANGO) && en(*r_off, R_RANGO),
            Element::Dacm { r_out, .. } => r_out.is_none_or(|r| en(r, R_RANGO)),
            // Los modelos se revisan en `model_ok`.
            _ => true,
        }
    }

    /// La estructura de un `LUT`, un `MSI` o un `DACM` contra las `tablas` de la netlist: tamaños, rangos de índices y
    /// largos de las listas por salida. None si está bien o si el elemento es de otra clase.
    fn estructura_invalida(&self, tablas: &[Vec<u64>]) -> Option<String> {
        let fila_de = |t: usize, bits: usize| -> Option<String> {
            match tablas.get(t) {
                None => Some(format!("la tabla {t} no existe")),
                Some(f) if f.len() != 1usize << bits => Some(format!("la tabla {t} tiene {} filas y se esperaban {}", f.len(), 1usize << bits)),
                _ => None,
            }
        };
        let por_salida = |n: usize, retardos: usize, abierta: usize| -> Option<String> {
            if retardos != n {
                Some(format!("retardos debe tener un par por salida ({n})"))
            } else if abierta != 0 && abierta != n {
                Some(format!("abierta debe tener un valor por salida ({n})"))
            } else {
                None
            }
        };
        match self {
            Element::Lut { comunes, rebanadas, tabla, retardos, abierta, .. } => {
                let Some(primera) = rebanadas.first() else { return Some("necesita al menos una rebanada".into()) };
                let (ne, ns) = (primera.entradas.len(), primera.salidas.len());
                if rebanadas.iter().any(|r| r.entradas.len() != ne || r.salidas.len() != ns) {
                    return Some("las rebanadas deben ser del mismo tamaño".into());
                }
                let bits = comunes.len() + ne;
                if bits > TABLA_BITS_MAX {
                    return Some(format!("la tabla admite hasta {TABLA_BITS_MAX} entradas"));
                }
                if ns == 0 || ns > TABLA_SALIDAS_MAX {
                    return Some(format!("cada rebanada necesita de 1 a {TABLA_SALIDAS_MAX} salidas"));
                }
                por_salida(ns, retardos.len(), abierta.len()).or_else(|| fila_de(*tabla, bits))
            }
            Element::Msi { entradas, salidas, nucleo, de, fuentes, tabla, retardos, abierta, .. } => {
                if let Some(m) = nucleo.invalido() {
                    return Some(m.into());
                }
                if nucleo.entradas_usadas().iter().any(|&i| i >= entradas.len()) {
                    return Some("una señal del núcleo nombra una entrada que no existe".into());
                }
                if fuentes.len() > TABLA_BITS_MAX {
                    return Some(format!("la tabla de salida admite hasta {TABLA_BITS_MAX} fuentes"));
                }
                let fuente_mala = |f: &Fuente| match *f {
                    Fuente::Entrada(i) => i >= entradas.len(),
                    Fuente::Bit(b) => b >= nucleo.bits(),
                    Fuente::Aux(b) => b >= nucleo.bits_aux(),
                    Fuente::Bandera(b) => b >= nucleo.banderas(),
                };
                if fuentes.iter().any(fuente_mala) {
                    return Some("una fuente está fuera de rango".into());
                }
                if de.len() != salidas.len() {
                    return Some(format!("de debe tener una entrada por salida ({})", salidas.len()));
                }
                for s in de {
                    match s {
                        SalidaMsi::Directa { fuente, .. } if fuente_mala(fuente) => return Some("una salida directa nombra una fuente fuera de rango".into()),
                        SalidaMsi::Tabla { columna } if tabla.is_none() || *columna >= TABLA_SALIDAS_MAX => return Some("una salida de tabla sin tabla o con columna fuera de rango".into()),
                        _ => {}
                    }
                }
                por_salida(salidas.len(), retardos.len(), abierta.len()).or_else(|| tabla.and_then(|t| fila_de(t, fuentes.len())))
            }
            Element::Dacm { bits, .. } if !(1..=16).contains(&bits.len()) => Some("bits debe tener de 1 a 16 redes".into()),
            _ => None,
        }
    }

    /// Parámetros que solo deben ser finitos.
    fn finite(&self) -> bool {
        match self {
            Element::V { wave, .. } => wave.finite(),
            Element::I { amps, .. } => amps.is_finite(),
            Element::Psu { v, .. } => v.is_finite(),
            Element::E { ganancia, .. } | Element::F { ganancia, .. } => ganancia.is_finite(),
            Element::G { gm, .. } => gm.is_finite(),
            Element::H { r, .. } => r.is_finite(),
            Element::Ext { k, c, .. } => k.is_finite() && c.is_finite(),
            _ => true,
        }
    }
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Netlist {
    pub nodes: usize,
    /// Redes digitales: no son incógnitas de la matriz. Una netlist no trae el campo y vale 0.
    #[serde(default)]
    pub digital_nets: usize,
    pub elements: Vec<Element>,
    /// Sondas de los instrumentos. Sin el campo, ninguna: la vista previa cuesta lo mismo que antes.
    #[serde(default)]
    pub sondas: Vec<SondaDef>,
    /// Canales de valor que mueve el exterior (la perilla, un emulador). Sin el campo, ninguno.
    #[serde(default)]
    pub canales: Vec<CanalDef>,
    /// Lecturas que el exterior pide en instantes exactos. Sin el campo, ninguna.
    #[serde(default)]
    pub lectores: Vec<LectorDef>,
    /// Tablas de verdad compartidas por los `LUT` y los `MSI`: una fila por combinación de entradas, con dos bits por salida
    /// (0, 1, Z = 2, X = 3). Sin el campo, ninguna.
    #[serde(default, deserialize_with = "leer_tablas")]
    pub tablas: Vec<Vec<u64>>,
}

/// Las filas de una tabla llegan como números o, si no caben en los 53 bits de un número de JavaScript, como texto decimal.
fn leer_tablas<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Vec<Vec<u64>>, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Fila {
        N(u64),
        S(String),
    }
    let tablas = Vec::<Vec<Fila>>::deserialize(d)?;
    tablas
        .into_iter()
        .map(|t| t.into_iter().map(|f| match f { Fila::N(n) => Ok(n), Fila::S(s) => s.parse::<u64>().map_err(|_| serde::de::Error::custom(format!("fila de tabla inválida: {s}"))) }).collect())
        .collect()
}

/// Cómo pasa un canal de un valor al siguiente: salta (retención de orden cero) o va en línea recta.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum FormaCanal {
    #[default]
    Escalon,
    Rampa,
}

/// Un canal de valor: su valor `inicial` y la `forma` de sus cambios.
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CanalDef {
    pub inicial: f64,
    #[serde(default)]
    pub forma: FormaCanal,
}

/// Qué lee un lector: el voltaje de `p` respecto de `n`, o la corriente del elemento `elemento` (de `a` hacia `b`).
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum LectorDef {
    V { p: usize, n: usize },
    I { elemento: usize },
}

/// Una sonda de un instrumento: qué mide, cuántas muestras crudas guarda (potencia de dos) y el ancho de la
/// columna de su rejilla en segundos. La reparte `Mixto` en la isla de lo que mide.
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum SondaDef {
    /// Voltaje de `p` respecto de `n`. `sin_rejilla`: solo guarda sus muestras (la sonda de un multímetro, cuya lectura es la
    /// ventana sobre ellas): cada paso no actualiza la rejilla.
    V {
        p: usize,
        n: usize,
        muestras: usize,
        columna: f64,
        #[serde(default)]
        sin_rejilla: bool,
    },
    /// Corriente del elemento `element` (de `a` hacia `b` por dentro de él) por `signo`, 1 o −1.
    I {
        element: usize,
        signo: f64,
        muestras: usize,
        columna: f64,
        #[serde(default)]
        sin_rejilla: bool,
    },
    /// Nivel de la red digital `red` como voltaje nominal: `bajo` en 0, `alto` en 1; X es NaN y Z, infinito.
    D { red: usize, bajo: f64, alto: f64, muestras: usize, columna: f64 },
}

impl SondaDef {
    pub fn muestras(&self) -> usize {
        match *self {
            SondaDef::V { muestras, .. } | SondaDef::I { muestras, .. } | SondaDef::D { muestras, .. } => muestras,
        }
    }

    pub fn sin_rejilla(&self) -> bool {
        matches!(*self, SondaDef::V { sin_rejilla: true, .. } | SondaDef::I { sin_rejilla: true, .. })
    }

    pub fn columna(&self) -> f64 {
        match *self {
            SondaDef::V { columna, .. } | SondaDef::I { columna, .. } | SondaDef::D { columna, .. } => columna,
        }
    }
}

/// Muestras crudas de una sonda: de 1,024 a 262,144, potencia de dos.
pub const MUESTRAS_SONDA: (usize, usize) = (1024, 262_144);
/// Ancho de una columna de la rejilla (s).
pub const COLUMNA_SONDA: (f64, f64) = (1e-12, 1e3);
/// Memoria de todas las sondas de un circuito: 16 MiB.
pub const MEMORIA_SONDAS: usize = 16 * 1024 * 1024;

/// Cotas de la netlist: con ellas ninguna reserva de memoria de un solucionador puede abortar el proceso.
pub const MAX_NODES: usize = 100_000;
pub const MAX_ELEMENTS: usize = 1_000_000;

/// Lo que admite la vista previa (los mismos números que `MAX_NODES` y `MAX_ELEMENTS` de `sim/protocol.ts`).
pub const LIMITE_REDES: usize = 1024;
pub const LIMITE_ELEMENTOS: usize = 4096;
/// Redes digitales que admite la vista previa (`MAX_REDES_DIGITALES` de `sim/protocol.ts`).
pub const LIMITE_REDES_DIGITALES: usize = 4096;

impl Netlist {
    /// Rechaza, con el mismo texto que la interfaz, una netlist con más redes o piezas de las que admite la vista previa:
    /// así una que llega por otro camino no reserva una matriz enorme.
    pub fn check_limits(&self, max_nodes: usize, max_elements: usize) -> Result<(), EngineError> {
        if self.nodes > max_nodes {
            return Err(EngineError::Invalid(format!("La vista previa admite hasta {max_nodes} redes y este circuito tiene {}.", self.nodes)));
        }
        if self.elements.len() > max_elements {
            return Err(EngineError::Invalid(format!(
                "La vista previa admite hasta {max_elements} piezas simuladas y este circuito tiene {}.",
                self.elements.len()
            )));
        }
        if self.digital_nets > LIMITE_REDES_DIGITALES {
            return Err(EngineError::Invalid(format!(
                "La vista previa admite hasta {LIMITE_REDES_DIGITALES} redes digitales y este circuito tiene {}.",
                self.digital_nets
            )));
        }
        Ok(())
    }

    pub fn from_json(s: &str) -> Result<Self, EngineError> {
        let n: Netlist = serde_json::from_str(s).map_err(|e| EngineError::Parse(e.to_string()))?;
        n.validate()?;
        Ok(n)
    }

    pub fn validate(&self) -> Result<(), EngineError> {
        if self.nodes > MAX_NODES {
            return Err(EngineError::Invalid(format!("el circuito excede el límite de {MAX_NODES} nodos")));
        }
        if self.elements.len() > MAX_ELEMENTS {
            return Err(EngineError::Invalid(format!("el circuito excede el límite de {MAX_ELEMENTS} elementos")));
        }
        if self.digital_nets > MAX_NODES {
            return Err(EngineError::Invalid(format!("el circuito excede el límite de {MAX_NODES} redes digitales")));
        }
        // Un circuito solo digital tiene la tierra y ninguna red analógica.
        if self.nodes == 0 || (self.nodes < 2 && self.digital_nets == 0) {
            return Err(EngineError::Invalid(
                "se necesitan al menos 2 nodos (tierra y uno más)".into(),
            ));
        }
        // Quién maneja cada red digital: a lo más una salida fija, más las de tres estados que haya.
        let mut conductor: Vec<Option<usize>> = vec![None; self.digital_nets];
        for (i, e) in self.elements.iter().enumerate() {
            let entradas = e.entradas_digitales();
            let salidas = e.salidas_digitales();
            if entradas.iter().chain(&salidas).any(|&r| r >= self.digital_nets) {
                return Err(EngineError::Invalid(format!("elemento {i}: red digital fuera de rango")));
            }
            if let Some(m) = e.estructura_invalida(&self.tablas) {
                return Err(EngineError::Invalid(format!("elemento {i}: {m}")));
            }
            let tres = e.tres_estados(&self.tablas);
            for r in salidas {
                if !tres {
                    if let Some(j) = conductor[r] {
                        return Err(EngineError::Invalid(format!("elemento {i}: la red digital {r} ya la maneja el elemento {j}")));
                    }
                    conductor[r] = Some(i);
                }
            }
            for (nombre, v) in e.retardos() {
                if !en(v, RETARDO_RANGO) {
                    return Err(EngineError::Invalid(format!("elemento {i}: {nombre} fuera de rango (de 1e-12 a 1e-3 s)")));
                }
            }
            if let Some(m) = e.puente_invalido() {
                return Err(EngineError::Invalid(format!("elemento {i}: {m}")));
            }
            match e {
                Element::Gate { func, inputs, .. } if !func.entradas_validas(inputs.len()) => {
                    let nombre = format!("{func:?}").to_lowercase();
                    return Err(EngineError::Invalid(format!("elemento {i}: la compuerta {nombre} no admite {} entradas", inputs.len())));
                }
                Element::Logic { value, .. } if *value > 1 => {
                    return Err(EngineError::Invalid(format!("elemento {i}: value debe ser 0 o 1")));
                }
                Element::Counter { modulo, .. } if *modulo != 10 && *modulo != 16 => {
                    return Err(EngineError::Invalid(format!("elemento {i}: modulo debe ser 10 o 16")));
                }
                _ => {}
            }
            if e.canales_usados().iter().any(|&c| c >= self.canales.len()) {
                return Err(EngineError::Invalid(format!("elemento {i}: canal fuera de rango")));
            }
            let nodos = e.nodes();
            if nodos.iter().any(|&k| k >= self.nodes) {
                return Err(EngineError::Invalid(format!("elemento {i}: nodo fuera de rango")));
            }
            if e.two_terminal() && nodos[0] == nodos[1] {
                return Err(EngineError::Invalid(format!(
                    "elemento {i}: ambos extremos en el mismo nodo"
                )));
            }
            if let Element::V { wave: Wave::Square { duty, .. }, .. } = e {
                if !(*duty > 0.0 && *duty < 1.0) {
                    return Err(EngineError::Invalid(format!(
                        "elemento {i}: el ciclo de trabajo debe estar entre 0 y 1"
                    )));
                }
            }
            if !e.positive().iter().all(|v| v.is_finite() && *v > 0.0) {
                return Err(EngineError::Invalid(format!(
                    "elemento {i}: el valor debe ser positivo"
                )));
            }
            if !e.finite() {
                return Err(EngineError::Invalid(format!("elemento {i}: un valor no es finito")));
            }
            if !e.in_range() {
                return Err(EngineError::Invalid(format!("elemento {i}: un valor está fuera del rango admitido")));
            }
            if !e.model_ok() {
                return Err(EngineError::Invalid(format!("elemento {i}: un parámetro del modelo está fuera de rango")));
            }
        }
        if self.canales.len() > MAX_CANALES {
            return Err(EngineError::Invalid(format!("el circuito excede el límite de {MAX_CANALES} canales")));
        }
        for (k, c) in self.canales.iter().enumerate() {
            if !(c.inicial.is_finite() && c.inicial.abs() <= CANAL_MAX) {
                return Err(EngineError::Invalid(format!("canal {k}: inicial fuera de rango (hasta 1e9)")));
            }
        }
        for (k, l) in self.lectores.iter().enumerate() {
            match *l {
                LectorDef::V { p, n } if p >= self.nodes || n >= self.nodes => {
                    return Err(EngineError::Invalid(format!("lector {k}: nodo fuera de rango")));
                }
                LectorDef::V { p, n } if p == n => {
                    return Err(EngineError::Invalid(format!("lector {k}: sus dos nodos son el mismo")));
                }
                LectorDef::I { elemento } if self.elements.get(elemento).is_none_or(Element::es_digital) => {
                    return Err(EngineError::Invalid(format!("lector {k}: el elemento no existe o es digital")));
                }
                _ => {}
            }
        }
        let mut memoria = 0usize;
        for (k, s) in self.sondas.iter().enumerate() {
            let m = s.muestras();
            if !(m.is_power_of_two() && m >= MUESTRAS_SONDA.0 && m <= MUESTRAS_SONDA.1) {
                return Err(EngineError::Invalid(format!(
                    "sonda {k}: muestras debe ser una potencia de dos de {} a {}",
                    MUESTRAS_SONDA.0, MUESTRAS_SONDA.1
                )));
            }
            if !en(s.columna(), COLUMNA_SONDA) {
                return Err(EngineError::Invalid(format!("sonda {k}: columna fuera de rango (de 1e-12 a 1e3 s)")));
            }
            match *s {
                SondaDef::V { p, n, .. } => {
                    if p >= self.nodes || n >= self.nodes {
                        return Err(EngineError::Invalid(format!("sonda {k}: nodo fuera de rango")));
                    }
                    if p == n {
                        return Err(EngineError::Invalid(format!("sonda {k}: sus dos nodos son el mismo")));
                    }
                }
                SondaDef::I { element, signo, .. } => {
                    if self.elements.get(element).is_none_or(Element::es_digital) {
                        return Err(EngineError::Invalid(format!("sonda {k}: el elemento no existe o es digital")));
                    }
                    if signo != 1.0 && signo != -1.0 {
                        return Err(EngineError::Invalid(format!("sonda {k}: signo debe ser 1 o -1")));
                    }
                }
                SondaDef::D { red, bajo, alto, .. } => {
                    if red >= self.digital_nets {
                        return Err(EngineError::Invalid(format!("sonda {k}: red digital fuera de rango")));
                    }
                    if !(bajo.is_finite() && alto.is_finite() && bajo.abs() <= UMBRAL_MAX && alto.abs() <= UMBRAL_MAX) {
                        return Err(EngineError::Invalid(format!("sonda {k}: bajo o alto fuera de rango (hasta 1e3 V)")));
                    }
                }
            }
            memoria += crate::sonda::Sonda::bytes_de(m);
        }
        if memoria > MEMORIA_SONDAS {
            return Err(EngineError::Invalid(format!(
                "las sondas de los instrumentos piden {:.1} MiB y el tope es 16 MiB",
                memoria as f64 / (1024.0 * 1024.0)
            )));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lee_el_rectificador() {
        let n = Netlist::from_json(include_str!("../fixtures/rectificador.json")).unwrap();
        assert_eq!(n.nodes, 4);
        assert_eq!(n.elements.len(), 5);
    }

    #[test]
    fn diodo_usa_valores_por_omision() {
        let n = Netlist::from_json(r#"{"nodes":2,"elements":[{"type":"D","a":1,"b":0}]}"#).unwrap();
        assert_eq!(n.elements[0], Element::D { a: 1, b: 0, model: DiodeModel::default() });
        let n = Netlist::from_json(r#"{"nodes":2,"elements":[{"type":"D","a":1,"b":0,"is":1.5e-17,"n":2}]}"#).unwrap();
        assert_eq!(n.elements[0], Element::D { a: 1, b: 0, model: DiodeModel { is: 1.5e-17, n: 2.0, ..DiodeModel::default() } });
    }

    #[test]
    fn lee_un_zener_y_rechaza_parametros_fuera_de_rango() {
        let n = Netlist::from_json(r#"{"nodes":2,"elements":[{"type":"D","a":0,"b":1,"is":2.5e-15,"rs":6.47,"bv":4.78,"ibv":0.049,"cjo":1e-10,"vj":0.75,"m":0.33}]}"#).unwrap();
        assert!(matches!(&n.elements[0], Element::D { model, .. } if model.bv == Some(4.78) && model.rs == 6.47));
        for malo in [r#""bv":-1"#, r#""m":1"#, r#""fc":1"#, r#""rs":-1"#, r#""ibv":0"#, r#""vj":0"#] {
            let json = format!(r#"{{"nodes":2,"elements":[{{"type":"D","a":0,"b":1,{malo}}}]}}"#);
            assert!(Netlist::from_json(&json).is_err(), "{malo}");
        }
    }

    #[test]
    fn lee_un_inductor() {
        let n = Netlist::from_json(r#"{"nodes":2,"elements":[{"type":"L","a":1,"b":0,"henries":1e-3}]}"#).unwrap();
        assert_eq!(n.elements[0], Element::L { a: 1, b: 0, henries: 1e-3 });
        let e = Netlist::from_json(r#"{"nodes":2,"elements":[{"type":"L","a":1,"b":0,"henries":0}]}"#).unwrap_err();
        assert_eq!(e, EngineError::Invalid("elemento 0: el valor debe ser positivo".into()));
    }

    #[test]
    fn lee_un_transistor_con_sus_parametros_y_los_de_omision() {
        let n = Netlist::from_json(r#"{"nodes":4,"elements":[{"type":"Q","c":1,"b":2,"e":0,"pnp":true,"model":{"is":1.4e-14,"bf":255.9,"vaf":74.03}}]}"#).unwrap();
        match &n.elements[0] {
            Element::Q { c: 1, b: 2, e: 0, pnp: true, model } => {
                assert_eq!((model.is, model.bf, model.vaf, model.br, model.mje), (1.4e-14, 255.9, 74.03, 1.0, 0.33));
            }
            otro => panic!("{otro:?}"),
        }
        // Base y colector en el mismo nodo es un transistor conectado como diodo: se admite.
        assert!(Netlist::from_json(r#"{"nodes":3,"elements":[{"type":"Q","c":1,"b":1,"e":0}]}"#).is_ok());
        let e = Netlist::from_json(r#"{"nodes":3,"elements":[{"type":"Q","c":1,"b":2,"e":0,"model":{"bf":0}}]}"#).unwrap_err();
        assert_eq!(e, EngineError::Invalid("elemento 0: un parámetro del modelo está fuera de rango".into()));
    }

    #[test]
    fn rechaza_valores_finitos_pero_extremos_con_un_error_de_validacion() {
        for malo in [
            r#"{"type":"R","a":1,"b":0,"ohms":1e-12}"#, r#"{"type":"R","a":1,"b":0,"ohms":1e20}"#,
            r#"{"type":"C","a":1,"b":0,"farads":1e-30}"#, r#"{"type":"C","a":1,"b":0,"farads":1e9}"#,
            r#"{"type":"L","a":1,"b":0,"henries":1e-20}"#, r#"{"type":"L","a":1,"b":0,"henries":1e12}"#,
            r#"{"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":1e300}}"#,
            r#"{"type":"V","a":1,"b":0,"wave":{"kind":"sine","offset":0,"amp":1,"freq":1e300}}"#,
            r#"{"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":1,"freq":1e-300}}"#,
            r#"{"type":"I","a":1,"b":0,"amps":1e300}"#,
            r#"{"type":"D","a":1,"b":0,"n":1e6}"#, r#"{"type":"D","a":1,"b":0,"is":1}"#,
            r#"{"type":"D","a":1,"b":0,"bv":5,"nbv":1e6}"#, r#"{"type":"D","a":1,"b":0,"rs":1e300}"#,
            r#"{"type":"Q","c":1,"b":1,"e":0,"model":{"vaf":0.5}}"#, r#"{"type":"Q","c":1,"b":1,"e":0,"model":{"var":0.001}}"#,
            r#"{"type":"Q","c":1,"b":1,"e":0,"model":{"is":1}}"#, r#"{"type":"Q","c":1,"b":1,"e":0,"model":{"nf":1e6}}"#,
        ] {
            let json = format!(r#"{{"nodes":2,"elements":[{malo}]}}"#);
            let e = Netlist::from_json(&json).unwrap_err();
            assert!(matches!(e, EngineError::Invalid(_)), "{malo}: {e:?}");
        }
        // Los valores normales y los extremos razonables siguen entrando, y vaf = 0 es «infinito».
        for bueno in [
            r#"{"type":"R","a":1,"b":0,"ohms":1e-3}"#, r#"{"type":"R","a":1,"b":0,"ohms":1e9}"#, r#"{"type":"C","a":1,"b":0,"farads":1e-12}"#,
            r#"{"type":"D","a":1,"b":0,"is":1.83e-28,"n":2}"#, r#"{"type":"Q","c":1,"b":1,"e":0,"model":{"vaf":0,"var":0}}"#,
            r#"{"type":"Q","c":1,"b":1,"e":0,"model":{"vaf":74.03,"var":25.9}}"#,
        ] {
            let json = format!(r#"{{"nodes":2,"elements":[{bueno}]}}"#);
            assert!(Netlist::from_json(&json).is_ok(), "{bueno}");
        }
    }

    #[test]
    fn lee_un_mosfet() {
        let n = Netlist::from_json(r#"{"nodes":4,"elements":[{"type":"M","d":1,"g":2,"s":0,"pmos":true,"model":{"vto":-2.1,"kp":0.0115,"w":1,"l":1}}]}"#).unwrap();
        assert!(matches!(&n.elements[0], Element::M { d: 1, g: 2, s: 0, pmos: true, model } if model.vto == -2.1 && model.pb == 0.8));
        let e = Netlist::from_json(r#"{"nodes":4,"elements":[{"type":"M","d":1,"g":2,"s":0,"model":{"l":0}}]}"#).unwrap_err();
        assert_eq!(e, EngineError::Invalid("elemento 0: un parámetro del modelo está fuera de rango".into()));
    }

    #[test]
    fn rechaza_un_mosfet_con_parametros_extremos() {
        for malo in [
            r#""vto":1000"#, r#""kp":1e-20"#, r#""kp":1e20"#, r#""lambda":100"#, r#""rd":1e300"#, r#""rs":1e300"#,
            r#""cbd":1"#, r#""cbs":1"#, r#""cgso":1"#, r#""cgdo":1"#, r#""is":1"#, r#""pb":100"#, r#""w":1e-30"#, r#""l":1e30"#,
        ] {
            let json = format!(r#"{{"nodes":3,"elements":[{{"type":"M","d":1,"g":2,"s":0,"model":{{{malo}}}}}]}}"#);
            let e = Netlist::from_json(&json).unwrap_err();
            assert!(matches!(e, EngineError::Invalid(_)), "{malo}: {e:?}");
        }
        let bueno = r#"{"nodes":3,"elements":[{"type":"M","d":1,"g":2,"s":0,"model":{"vto":3,"kp":18,"lambda":0.01,"rd":4e-3,"rs":2e-3,"cbd":1.55e-9,"is":2e-14,"cgso":1.38e-9,"cgdo":88e-12,"w":1,"l":1}}]}"#;
        assert!(Netlist::from_json(bueno).is_ok());
    }

    #[test]
    fn lee_un_amplificador_operacional() {
        let n = Netlist::from_json(r#"{"nodes":6,"elements":[{"type":"OA","p":1,"n":2,"out":3,"vp":4,"vn":5,"model":{"sr":13e6}}]}"#).unwrap();
        assert!(matches!(&n.elements[0], Element::OA { out: 3, model, .. } if model.sr == 13e6 && model.a0 == 2e5));
        let e = Netlist::from_json(r#"{"nodes":6,"elements":[{"type":"OA","p":1,"n":2,"out":3,"vp":4,"vn":5,"model":{"ilim":0}}]}"#).unwrap_err();
        assert_eq!(e, EngineError::Invalid("elemento 0: un parámetro del modelo está fuera de rango".into()));
    }

    #[test]
    fn rechaza_un_amplificador_con_parametros_extremos() {
        for malo in [
            r#""a0":1e-3"#, r#""a0":1e20"#, r#""gbw":1e-9"#, r#""gbw":1e20"#, r#""sr":1e-9"#, r#""sr":1e30"#, r#""rin":0.001"#,
            r#""rin":1e30"#, r#""rout":1e-12"#, r#""rout":1e20"#, r#""ilim":1e-15"#, r#""ilim":1e9"#, r#""dhi":1e6"#, r#""dlo":1e6"#,
            r#""rq":0.001"#, r#""rq":1e30"#,
        ] {
            let json = format!(r#"{{"nodes":6,"elements":[{{"type":"OA","p":1,"n":2,"out":3,"vp":4,"vn":5,"model":{{{malo}}}}}]}}"#);
            let e = Netlist::from_json(&json).unwrap_err();
            assert!(matches!(e, EngineError::Invalid(_)), "{malo}: {e:?}");
        }
        let tl081 = r#"{"nodes":6,"elements":[{"type":"OA","p":1,"n":2,"out":3,"vp":4,"vn":5,"model":{"a0":2e5,"gbw":3e6,"sr":13e6,"rin":1e12,"rout":100,"ilim":40e-3,"dhi":1.5,"dlo":1.5,"rq":21.4e3}}]}"#;
        assert!(Netlist::from_json(tl081).is_ok());
    }

    #[test]
    fn lee_un_foco_y_un_motor() {
        let n = Netlist::from_json(r#"{"nodes":2,"elements":[
            {"type":"LAMP","a":1,"b":0,"rfrio":2.88,"k":9,"pnom":5,"tau":0.05},
            {"type":"MOTOR","a":1,"b":0,"r":3,"l":1.5e-3,"ke":6.05e-3,"j":2.4e-7,"bm":6.4e-7}]}"#).unwrap();
        assert!(matches!(n.elements[0], Element::Lamp { k, .. } if k == 9.0));
        assert!(matches!(n.elements[1], Element::Motor { ke, .. } if ke == 6.05e-3));
        let e = Netlist::from_json(r#"{"nodes":2,"elements":[{"type":"MOTOR","a":1,"b":0,"r":3,"l":0,"ke":6e-3,"j":2e-7,"bm":6e-7}]}"#).unwrap_err();
        assert_eq!(e, EngineError::Invalid("elemento 0: el valor debe ser positivo".into()));
    }

    #[test]
    fn rechaza_un_foco_con_parametros_extremos() {
        let base = |campo: &str, v: &str| {
            let mut c = vec![("rfrio", "2.88"), ("k", "9"), ("pnom", "5"), ("tau", "0.05")];
            c.iter_mut().for_each(|(n, x)| if *n == campo { *x = v });
            let cuerpo: Vec<String> = c.iter().map(|(n, x)| format!(r#""{n}":{x}"#)).collect();
            format!(r#"{{"nodes":2,"elements":[{{"type":"LAMP","a":1,"b":0,{}}}]}}"#, cuerpo.join(","))
        };
        for (campo, malo) in [("rfrio", "1e-12"), ("rfrio", "1e20"), ("k", "1e9"), ("k", "-1"), ("pnom", "1e-12"), ("pnom", "1e12"), ("tau", "1e-12"), ("tau", "1e12")] {
            let e = Netlist::from_json(&base(campo, malo)).unwrap_err();
            assert!(matches!(e, EngineError::Invalid(_)), "{campo} = {malo}: {e:?}");
        }
        assert!(Netlist::from_json(&base("rfrio", "2.88")).is_ok());
    }

    #[test]
    fn rechaza_un_motor_con_parametros_extremos() {
        let base = |campo: &str, v: &str| {
            let mut c = vec![("r", "3"), ("l", "1.5e-3"), ("ke", "6.05e-3"), ("j", "2.4e-7"), ("bm", "6.4e-7")];
            c.iter_mut().for_each(|(n, x)| if *n == campo { *x = v });
            let cuerpo: Vec<String> = c.iter().map(|(n, x)| format!(r#""{n}":{x}"#)).collect();
            format!(r#"{{"nodes":2,"elements":[{{"type":"MOTOR","a":1,"b":0,{}}}]}}"#, cuerpo.join(","))
        };
        for (campo, malo) in [("r", "1e-12"), ("r", "1e20"), ("l", "1e-20"), ("l", "1e12"), ("ke", "1e-12"), ("ke", "1e9"), ("j", "1e-20"), ("j", "1e12"), ("bm", "1e-20"), ("bm", "1e12")] {
            let e = Netlist::from_json(&base(campo, malo)).unwrap_err();
            assert!(matches!(e, EngineError::Invalid(_)), "{campo} = {malo}: {e:?}");
        }
        assert!(Netlist::from_json(&base("r", "3")).is_ok());
    }

    #[test]
    fn lee_un_fusible_y_un_rele() {
        let n = Netlist::from_json(r#"{"nodes":6,"elements":[
            {"type":"FUSE","a":1,"b":0,"ohms":0.1,"inom":1,"ifusion":2,"tau":0.125},
            {"type":"RELAY","a1":1,"a2":0,"com":2,"na":3,"nc":4,"r":69.4,"l":0.2,"ion":0.054,"ioff":0.0072}]}"#).unwrap();
        assert!(matches!(n.elements[0], Element::Fuse { ifusion, .. } if ifusion == 2.0));
        assert_eq!(n.elements[1].nodes(), vec![1, 0, 2, 3, 4]);
        // La liberación debe quedar por debajo de la operación.
        let e = Netlist::from_json(r#"{"nodes":6,"elements":[
            {"type":"RELAY","a1":1,"a2":0,"com":2,"na":3,"nc":4,"r":69.4,"l":0.2,"ion":0.05,"ioff":0.06}]}"#).unwrap_err();
        assert_eq!(e, EngineError::Invalid("elemento 0: un parámetro del modelo está fuera de rango".into()));
    }

    #[test]
    fn rechaza_un_fusible_con_parametros_extremos() {
        let base = |campo: &str, v: &str| {
            let mut c = vec![("ohms", "0.1"), ("inom", "1"), ("ifusion", "2"), ("tau", "0.125")];
            c.iter_mut().for_each(|(n, x)| if *n == campo { *x = v });
            let cuerpo: Vec<String> = c.iter().map(|(n, x)| format!(r#""{n}":{x}"#)).collect();
            format!(r#"{{"nodes":2,"elements":[{{"type":"FUSE","a":1,"b":0,{}}}]}}"#, cuerpo.join(","))
        };
        for (campo, malo) in [("ohms", "1e-12"), ("ohms", "1e20"), ("inom", "1e-12"), ("inom", "1e9"), ("ifusion", "1e9"), ("tau", "1e-12"), ("tau", "1e12")] {
            let e = Netlist::from_json(&base(campo, malo)).unwrap_err();
            assert!(matches!(e, EngineError::Invalid(_)), "{campo} = {malo}: {e:?}");
        }
        assert!(Netlist::from_json(&base("ohms", "0.1")).is_ok());
    }

    #[test]
    fn rechaza_un_rele_con_parametros_extremos() {
        let base = |campo: &str, v: &str| {
            let mut c = vec![("r", "69.4"), ("l", "0.2"), ("ion", "0.054"), ("ioff", "0.0072")];
            c.iter_mut().for_each(|(n, x)| if *n == campo { *x = v });
            let cuerpo: Vec<String> = c.iter().map(|(n, x)| format!(r#""{n}":{x}"#)).collect();
            format!(r#"{{"nodes":5,"elements":[{{"type":"RELAY","a1":1,"a2":0,"com":2,"na":3,"nc":4,{}}}]}}"#, cuerpo.join(","))
        };
        for (campo, malo) in [("r", "1e-12"), ("r", "1e20"), ("l", "1e-20"), ("l", "1e12"), ("ion", "1e-15"), ("ion", "1e9"), ("ioff", "1e9")] {
            let e = Netlist::from_json(&base(campo, malo)).unwrap_err();
            assert!(matches!(e, EngineError::Invalid(_)), "{campo} = {malo}: {e:?}");
        }
        assert!(Netlist::from_json(&base("r", "69.4")).is_ok());
    }

    #[test]
    fn los_limites_de_la_vista_previa_se_aplican_antes_de_construir_el_motor() {
        let n = Netlist::from_json(r#"{"nodes":1100,"elements":[{"type":"R","a":1,"b":0,"ohms":10}]}"#).unwrap();
        assert_eq!(
            n.check_limits(LIMITE_REDES, LIMITE_ELEMENTOS),
            Err(EngineError::Invalid("La vista previa admite hasta 1024 redes y este circuito tiene 1100.".into()))
        );
        let muchos = format!(r#"{{"nodes":2,"elements":[{}]}}"#, vec![r#"{"type":"R","a":1,"b":0,"ohms":10}"#; 4097].join(","));
        let n = Netlist::from_json(&muchos).unwrap();
        assert_eq!(
            n.check_limits(LIMITE_REDES, LIMITE_ELEMENTOS),
            Err(EngineError::Invalid("La vista previa admite hasta 4096 piezas simuladas y este circuito tiene 4097.".into()))
        );
        let ok = Netlist::from_json(r#"{"nodes":1024,"elements":[{"type":"R","a":1,"b":0,"ohms":10}]}"#).unwrap();
        assert!(ok.check_limits(LIMITE_REDES, LIMITE_ELEMENTOS).is_ok());
    }

    #[test]
    fn lee_una_compuerta_y_un_estado_logico() {
        let n = Netlist::from_json(r#"{"nodes":1,"digital_nets":3,"elements":[
            {"type":"LOGIC","out":0,"value":1},
            {"type":"LOGIC","out":1,"value":0},
            {"type":"GATE","fn":"nand","inputs":[0,1],"output":2,"rise_delay":5e-9,"fall_delay":7e-9}]}"#).unwrap();
        assert_eq!(n.digital_nets, 3);
        assert_eq!(
            n.elements[2],
            Element::Gate { func: Funcion::Nand, inputs: vec![0, 1], output: 2, rise_delay: 5e-9, fall_delay: 7e-9, z_como: ZComo::X, enable: None, enable_bajo: false }
        );
        assert!(n.elements.iter().all(Element::es_digital));
        assert_eq!(n.elements[2].entradas_digitales(), vec![0, 1]);
        assert_eq!(n.elements[2].salidas_digitales(), vec![2]);
        assert!(n.elements[2].nodes().is_empty());
        // En 74LS una entrada al aire se lee 1.
        let ls = Netlist::from_json(r#"{"nodes":1,"digital_nets":2,"elements":[{"type":"GATE","fn":"not","inputs":[0],"output":1,"rise_delay":3e-9,"fall_delay":7e-9,"z_como":"uno"}]}"#).unwrap();
        assert!(matches!(ls.elements[0], Element::Gate { z_como: ZComo::Uno, .. }));
        // Una netlist, sin `digital_nets`, sigue leyéndose igual.
        assert_eq!(Netlist::from_json(include_str!("../fixtures/rectificador.json")).unwrap().digital_nets, 0);
    }

    #[test]
    fn rechaza_elementos_digitales_invalidos_con_el_nombre_del_parametro() {
        let caso = |redes: usize, e: &str| Netlist::from_json(&format!(r#"{{"nodes":1,"digital_nets":{redes},"elements":[{e}]}}"#));
        let g = |extra: &str| format!(r#"{{"type":"GATE","fn":"nand","inputs":[0,1],"output":2,"rise_delay":5e-9,"fall_delay":5e-9{extra}}}"#);
        assert_eq!(caso(2, &g("")).unwrap_err(), EngineError::Invalid("elemento 0: red digital fuera de rango".into()));
        assert_eq!(
            caso(3, r#"{"type":"GATE","fn":"nand","inputs":[0,1],"output":2,"rise_delay":0,"fall_delay":5e-9}"#).unwrap_err(),
            EngineError::Invalid("elemento 0: rise_delay fuera de rango (de 1e-12 a 1e-3 s)".into())
        );
        assert_eq!(
            caso(3, r#"{"type":"GATE","fn":"nand","inputs":[0,1],"output":2,"rise_delay":5e-9,"fall_delay":1}"#).unwrap_err(),
            EngineError::Invalid("elemento 0: fall_delay fuera de rango (de 1e-12 a 1e-3 s)".into())
        );
        assert_eq!(
            caso(3, r#"{"type":"GATE","fn":"not","inputs":[0,1],"output":2,"rise_delay":5e-9,"fall_delay":5e-9}"#).unwrap_err(),
            EngineError::Invalid("elemento 0: la compuerta not no admite 2 entradas".into())
        );
        assert_eq!(caso(1, r#"{"type":"LOGIC","out":0,"value":2}"#).unwrap_err(), EngineError::Invalid("elemento 0: value debe ser 0 o 1".into()));
        assert!(caso(3, r#"{"type":"GATE","fn":"xxor","inputs":[0,1],"output":2,"rise_delay":5e-9,"fall_delay":5e-9}"#).is_err());
        // Dos salidas en la misma red.
        let e = Netlist::from_json(r#"{"nodes":1,"digital_nets":1,"elements":[{"type":"LOGIC","out":0,"value":1},{"type":"LOGIC","out":0,"value":0}]}"#).unwrap_err();
        assert_eq!(e, EngineError::Invalid("elemento 1: la red digital 0 ya la maneja el elemento 0".into()));
        // Sin redes digitales ni analógicas no hay circuito.
        assert!(Netlist::from_json(r#"{"nodes":1,"elements":[]}"#).is_err());
    }

    #[test]
    fn lee_los_puentes_y_rechaza_sus_parametros_invalidos() {
        let n = Netlist::from_json(r#"{"nodes":3,"digital_nets":2,"elements":[
            {"type":"ADC","p":1,"n":0,"out":0,"in_low":0.8,"in_high":2.0,"r_in":5500,"v_in":2.6},
            {"type":"DAC","input":1,"out":2,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":7e-9,"t_fall":7e-9}]}"#).unwrap();
        assert_eq!(n.elements[0].nodes(), vec![1, 0]);
        assert_eq!(n.elements[0].salidas_digitales(), vec![0]);
        assert_eq!(n.elements[1].entradas_digitales(), vec![1]);
        assert!(n.elements.iter().all(|e| e.es_puente() && !e.es_digital()));
        let caso = |e: &str| Netlist::from_json(&format!(r#"{{"nodes":3,"digital_nets":2,"elements":[{e}]}}"#)).unwrap_err();
        assert_eq!(
            caso(r#"{"type":"ADC","p":1,"n":0,"out":0,"in_low":3,"in_high":2}"#),
            EngineError::Invalid("elemento 0: in_low debe ser menor o igual que in_high".into())
        );
        assert_eq!(
            caso(r#"{"type":"ADC","p":1,"n":0,"out":0,"in_low":0,"in_high":1e9}"#),
            EngineError::Invalid("elemento 0: in_high fuera de rango (hasta 1e3 V)".into())
        );
        assert_eq!(caso(r#"{"type":"ADC","p":1,"n":1,"out":0,"in_low":1,"in_high":2}"#), EngineError::Invalid("elemento 0: ambos extremos en el mismo nodo".into()));
        assert_eq!(
            caso(r#"{"type":"DAC","input":1,"out":2,"v_lo":0,"v_hi":5,"r_lo":0,"r_hi":55,"t_rise":7e-9,"t_fall":7e-9}"#),
            EngineError::Invalid("elemento 0: r_lo fuera de rango (de 1e-6 a 1e12 Ω)".into())
        );
        assert_eq!(
            caso(r#"{"type":"DAC","input":1,"out":2,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":7e-9,"t_fall":0}"#),
            EngineError::Invalid("elemento 0: t_fall fuera de rango (de 1e-12 a 1e-3 s)".into())
        );
        assert_eq!(
            caso(r#"{"type":"DAC","input":1,"out":0,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":7e-9,"t_fall":7e-9}"#),
            EngineError::Invalid("elemento 0: la salida de un puente no puede ser la tierra".into())
        );
        let r = Element::Dac { input: 1, out: 2, lo: Some(0), hi: Some(1), v_lo: 0.0, v_hi: 0.0, r_lo: 1.0, r_hi: 1.0, t_rise: 1e-9, t_fall: 1e-9, z: false };
        assert_eq!(r.con_nodos(|k| k + 10).nodes(), vec![12, 10, 11]);
    }

    #[test]
    fn lee_los_biestables() {
        let n = Netlist::from_json(r#"{"nodes":1,"digital_nets":7,"elements":[
            {"type":"LOGIC","out":0,"value":1},
            {"type":"DFF","d":1,"clk":2,"pre":0,"clr":0,"q":3,"qn":4,"rise_delay":5e-9,"fall_delay":5e-9},
            {"type":"JKFF","j":0,"k":0,"clk":2,"pre":0,"clr":0,"q":5,"qn":6,"rise_delay":5e-9,"fall_delay":5e-9}]}"#).unwrap();
        assert_eq!(n.elements[1].entradas_digitales(), vec![1, 2, 0, 0]);
        assert_eq!(n.elements[2].entradas_digitales(), vec![0, 0, 2, 0, 0]);
        assert_eq!(n.elements[2].salidas_digitales(), vec![5, 6]);
        assert!(n.elements[1].es_digital());
        let e = Netlist::from_json(r#"{"nodes":1,"digital_nets":3,"elements":[{"type":"DFF","d":0,"clk":0,"pre":0,"clr":0,"q":1,"qn":1,"rise_delay":5e-9,"fall_delay":5e-9}]}"#).unwrap_err();
        assert_eq!(e, EngineError::Invalid("elemento 0: la red digital 1 ya la maneja el elemento 0".into()));
        let e = Netlist::from_json(r#"{"nodes":1,"digital_nets":3,"elements":[{"type":"JKFF","j":0,"k":0,"clk":0,"pre":0,"clr":0,"q":1,"qn":2,"rise_delay":5e-9,"fall_delay":2e-3}]}"#).unwrap_err();
        assert_eq!(e, EngineError::Invalid("elemento 0: fall_delay fuera de rango (de 1e-12 a 1e-3 s)".into()));
    }

    #[test]
    fn lee_el_contador_y_el_decodificador() {
        let n = Netlist::from_json(r#"{"nodes":1,"digital_nets":13,"elements":[
            {"type":"LOGIC","out":0,"value":0},
            {"type":"COUNTER","clk":0,"rst":0,"q":[1,2,3,4],"co":5,"modulo":10,"rise_delay":5e-9,"fall_delay":5e-9},
            {"type":"DECODER","inputs":[1,2,3,4],"outputs":[6,7,8,9,10,11,12],"activo_alto":false,"rise_delay":5e-9,"fall_delay":5e-9}]}"#).unwrap();
        assert_eq!(n.elements[1].salidas_digitales(), vec![1, 2, 3, 4, 5]);
        assert_eq!(n.elements[2].entradas_digitales(), vec![1, 2, 3, 4]);
        assert!(n.elements[2].es_digital());
        let e = Netlist::from_json(r#"{"nodes":1,"digital_nets":6,"elements":[{"type":"COUNTER","clk":0,"rst":0,"q":[1,2,3,4],"co":5,"modulo":12,"rise_delay":5e-9,"fall_delay":5e-9}]}"#).unwrap_err();
        assert_eq!(e, EngineError::Invalid("elemento 0: modulo debe ser 10 o 16".into()));
    }

    #[test]
    fn el_limite_de_redes_digitales_de_la_vista_previa() {
        let n = Netlist::from_json(&format!(r#"{{"nodes":1,"digital_nets":{},"elements":[]}}"#, LIMITE_REDES_DIGITALES + 1)).unwrap();
        assert_eq!(
            n.check_limits(LIMITE_REDES, LIMITE_ELEMENTOS),
            Err(EngineError::Invalid(format!("La vista previa admite hasta {LIMITE_REDES_DIGITALES} redes digitales y este circuito tiene {}.", LIMITE_REDES_DIGITALES + 1)))
        );
        let e = Netlist::from_json(&format!(r#"{{"nodes":1,"digital_nets":{},"elements":[]}}"#, MAX_NODES + 1)).unwrap_err();
        assert_eq!(e, EngineError::Invalid(format!("el circuito excede el límite de {MAX_NODES} redes digitales")));
    }

    #[test]
    fn con_nodos_cambia_solo_los_nodos_analogicos() {
        let r = Element::R { a: 3, b: 0, ohms: 10.0 };
        assert_eq!(r.con_nodos(|k| if k == 0 { 0 } else { k - 2 }), Element::R { a: 1, b: 0, ohms: 10.0 });
        let q = Netlist::from_json(r#"{"nodes":8,"elements":[{"type":"Q","c":7,"b":6,"e":5}]}"#).unwrap().elements.remove(0);
        assert_eq!(q.con_nodos(|k| k + 1).nodes(), vec![8, 7, 6]);
        let g = Element::Gate { func: Funcion::Not, inputs: vec![0], output: 1, rise_delay: 1e-9, fall_delay: 1e-9, z_como: ZComo::X, enable: None, enable_bajo: false };
        assert_eq!(g.con_nodos(|k| k + 1), g);
    }

    #[test]
    fn rechaza_nodo_fuera_de_rango() {
        let e = Netlist::from_json(r#"{"nodes":2,"elements":[{"type":"R","a":1,"b":5,"ohms":10}]}"#).unwrap_err();
        assert_eq!(e, EngineError::Invalid("elemento 0: nodo fuera de rango".into()));
    }

    #[test]
    fn rechaza_resistencia_no_positiva() {
        let e = Netlist::from_json(r#"{"nodes":2,"elements":[{"type":"R","a":1,"b":0,"ohms":0}]}"#).unwrap_err();
        assert_eq!(e, EngineError::Invalid("elemento 0: el valor debe ser positivo".into()));
    }

    #[test]
    fn rechaza_elemento_con_extremos_iguales() {
        let e = Netlist::from_json(r#"{"nodes":2,"elements":[{"type":"R","a":1,"b":1,"ohms":10}]}"#).unwrap_err();
        assert_eq!(e, EngineError::Invalid("elemento 0: ambos extremos en el mismo nodo".into()));
    }

    #[test]
    fn rechaza_netlists_que_exceden_los_limites_sin_reservar_memoria() {
        let e = Netlist::from_json(r#"{"nodes":70000000,"elements":[
            {"type":"R","a":1,"b":0,"ohms":10}]}"#).unwrap_err();
        assert_eq!(e, EngineError::Invalid(format!("el circuito excede el límite de {MAX_NODES} nodos")));
        let e = Netlist::from_json(r#"{"nodes":18446744073709551615,"elements":[]}"#).unwrap_err();
        assert!(matches!(e, EngineError::Invalid(_)));
        let muchos = format!(r#"{{"nodes":2,"elements":[{}]}}"#, vec![r#"{"type":"R","a":1,"b":0,"ohms":10}"#; MAX_ELEMENTS + 1].join(","));
        let e = Netlist::from_json(&muchos).unwrap_err();
        assert_eq!(e, EngineError::Invalid(format!("el circuito excede el límite de {MAX_ELEMENTS} elementos")));
    }

    #[test]
    fn cuadrada_sin_ciclo_usa_la_mitad() {
        let n = Netlist::from_json(r#"{"nodes":2,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":50}},
            {"type":"R","a":1,"b":0,"ohms":10}]}"#).unwrap();
        assert!(matches!(n.elements[0], Element::V { wave: Wave::Square { duty, .. }, .. } if duty == 0.5));
    }

    #[test]
    fn cuadrada_con_ciclo_de_trabajo() {
        let sq = Wave::Square { low: 0.0, high: 5.0, freq: 1000.0, duty: 0.25 };
        assert_eq!(sq.at(0.0002), 5.0);
        assert_eq!(sq.at(0.0003), 0.0);
        assert_eq!(sq.at(0.0012), 5.0);
    }

    #[test]
    fn flancos_de_la_cuadrada() {
        let sq = Wave::Square { low: 0.0, high: 5.0, freq: 1000.0, duty: 0.25 };
        assert!((sq.next_edge(0.0) - 0.25e-3).abs() < 1e-15);
        assert!((sq.next_edge(0.25e-3) - 1e-3).abs() < 1e-15, "{}", sq.next_edge(0.25e-3));
        assert!((sq.next_edge(1e-3) - 1.25e-3).abs() < 1e-15);
        assert_eq!(Wave::Dc { v: 1.0 }.next_edge(0.0), f64::INFINITY);
        // El paso que termina en el flanco de bajada usa el nivel alto; el siguiente, el bajo.
        assert_eq!(sq.during(0.25e-3, 1e-5), 5.0);
        assert_eq!(sq.during(0.25e-3 + 1e-5, 1e-5), 0.0);
    }

    #[test]
    fn rechaza_ciclo_fuera_de_rango() {
        let e = Netlist::from_json(r#"{"nodes":2,"elements":[
            {"type":"V","a":1,"b":0,"wave":{"kind":"square","low":0,"high":5,"freq":50,"duty":1}}]}"#).unwrap_err();
        assert_eq!(e, EngineError::Invalid("elemento 0: el ciclo de trabajo debe estar entre 0 y 1".into()));
    }

    #[test]
    fn rechaza_valores_que_no_son_numeros_finitos() {
        // JSON no tiene NaN ni infinito, pero 1e999 se lee como infinito.
        let e = Netlist::from_json(r#"{"nodes":2,"elements":[{"type":"R","a":1,"b":0,"ohms":1e999}]}"#);
        assert!(e.is_err());
        let e = Netlist::from_json(r#"{"nodes":2,"elements":[{"type":"I","a":1,"b":0,"amps":-1e999}]}"#);
        assert!(e.is_err());
    }

    #[test]
    fn onda_cuadrada_y_senoidal() {
        let sq = Wave::Square { low: 0.0, high: 5.0, freq: 50.0, duty: 0.5 };
        assert_eq!(sq.at(0.001), 5.0);
        assert_eq!(sq.at(0.011), 0.0);
        let s = Wave::Sine { offset: 1.0, amp: 2.0, freq: 1.0, phase: 0.0, continua: false };
        assert!((s.at(0.25) - 3.0).abs() < 1e-12);
    }

    fn lee(elementos: &str, extra: &str) -> Result<Netlist, EngineError> {
        Netlist::from_json(&format!(r#"{{"nodes":6,{extra}"elements":[{elementos}]}}"#))
    }

    const UN_CANAL: &str = r#""canales":[{"inicial":25}],"#;

    #[test]
    fn lee_cada_variante_nueva() {
        let n = lee(r#"{"type":"J","d":1,"g":2,"s":0,"pjf":true,"model":{"vto":-1.5,"beta":2e-3}}"#, "").unwrap();
        assert!(matches!(&n.elements[0], Element::J { d: 1, g: 2, s: 0, pjf: true, model } if model.vto == -1.5 && model.beta == 2e-3 && model.b == 1.0));
        let n = lee(r#"{"type":"J","d":1,"g":2,"s":0}"#, "").unwrap();
        assert_eq!(n.elements[0], Element::J { d: 1, g: 2, s: 0, pjf: false, model: JfetModel::default() });
        let n = lee(r#"{"type":"E","p":1,"n":0,"cp":2,"cn":0,"ganancia":1e6}"#, "").unwrap();
        assert_eq!(n.elements[0], Element::E { p: 1, n: 0, cp: 2, cn: 0, ganancia: 1e6 });
        let n = lee(r#"{"type":"G","p":1,"n":0,"cp":2,"cn":0,"gm":0.01}"#, "").unwrap();
        assert_eq!(n.elements[0], Element::G { p: 1, n: 0, cp: 2, cn: 0, gm: 0.01 });
        let n = lee(r#"{"type":"H","p":1,"n":0,"cp":2,"cn":3,"r":1000}"#, "").unwrap();
        assert_eq!(n.elements[0].nodes(), vec![1, 0, 2, 3]);
        let n = lee(r#"{"type":"F","p":1,"n":0,"cp":2,"cn":3,"ganancia":-2}"#, "").unwrap();
        assert_eq!(n.elements[0], Element::F { p: 1, n: 0, cp: 2, cn: 3, ganancia: -2.0 });
        let n = lee(r#"{"type":"TERM","a":1,"b":0,"tipo":"ntc","r25":10000,"beta":3950,"delta":0.002,"tau":10,"canal":0,"tmax":150}"#, UN_CANAL).unwrap();
        assert!(matches!(&n.elements[0], Element::Term { tipo: TipoTermistor::Ntc, rt: None, canal: 0, .. }));
        let n = lee(r#"{"type":"TERM","a":1,"b":0,"tipo":"ptc","r25":100,"beta":3000,"rt":[[0,300],[25,100],[80,900]],"delta":0.002,"tau":10,"canal":0,"tmax":150}"#, UN_CANAL).unwrap();
        assert!(matches!(&n.elements[0], Element::Term { tipo: TipoTermistor::Ptc, rt: Some(rt), .. } if rt.len() == 3));
        let n = lee(r#"{"type":"LDR","a":1,"b":0,"r10":10000,"gamma":0.7,"roscuro":1e6,"tau_sube":0.02,"tau_baja":0.03,"canal":0}"#, UN_CANAL).unwrap();
        assert!(matches!(&n.elements[0], Element::Ldr { canal: 0, gamma, .. } if *gamma == 0.7));
        let pasos = r#"{"type":"PASOS","nodos":[1,2,3,4],"r":10,"l":0.01,"km":0.1,"dientes":50,"td":0.001,"j":1e-5,"bm":1e-4}"#;
        let n = lee(pasos, "").unwrap();
        assert!(matches!(&n.elements[0], Element::Pasos { unipolar: false, k_mutua, reduccion, canal_carga: None, .. } if *k_mutua == 0.99 && *reduccion == 1.0));
        assert_eq!(n.elements[0].nodes(), vec![1, 2, 3, 4]);
        let n = lee(r#"{"type":"EXT","a":1,"b":0,"modo":"v","canal":0,"k":0.01,"c":0.5,"r":100}"#, UN_CANAL).unwrap();
        assert_eq!(n.elements[0], Element::Ext { a: 1, b: 0, modo: ModoExt::V, canal: 0, k: 0.01, c: 0.5, r: Some(100.0) });
        let n = lee(r#"{"type":"V","a":1,"b":0,"wave":{"kind":"pwl","puntos":[[0,0],[1e-3,5],[2e-3,0]],"repetir":true}}"#, "").unwrap();
        assert!(matches!(&n.elements[0], Element::V { wave: Wave::Pwl { puntos, repetir: true }, .. } if puntos.len() == 3 && puntos[1] == [1e-3, 5.0]));
    }

    #[test]
    fn con_nodos_mueve_todos_los_terminales_nuevos() {
        let n = lee(r#"{"type":"PASOS","nodos":[1,2,3,4,5,0],"unipolar":true,"r":10,"l":0.01,"km":0.1,"dientes":50,"td":0.001,"j":1e-5,"bm":1e-4}"#, "").unwrap();
        assert_eq!(n.elements[0].con_nodos(|k| k + 10).nodes(), vec![11, 12, 13, 14, 15, 10]);
        let n = lee(r#"{"type":"E","p":1,"n":0,"cp":2,"cn":3,"ganancia":2}"#, "").unwrap();
        assert_eq!(n.elements[0].con_nodos(|k| k + 1).nodes(), vec![2, 1, 3, 4]);
        let n = lee(r#"{"type":"J","d":1,"g":2,"s":3}"#, "").unwrap();
        assert_eq!(n.elements[0].con_nodos(|k| k + 1).nodes(), vec![2, 3, 4]);
    }

    #[test]
    fn rechaza_cada_rango_de_los_elementos_nuevos() {
        let term = |extra: &str| format!(r#"{{"type":"TERM","a":1,"b":0,"tipo":"ntc","r25":10000,"beta":3950,"delta":0.002,"tau":10,"canal":0,"tmax":150{extra}}}"#);
        let ldr = |campo: &str, v: &str| {
            let mut j = serde_json::json!({"type":"LDR","a":1,"b":0,"r10":10000,"gamma":0.7,"roscuro":1e6,"tau_sube":0.02,"tau_baja":0.03,"canal":0});
            j[campo] = serde_json::from_str(v).unwrap();
            j.to_string()
        };
        let pasos = |campo: &str, v: &str| {
            let mut j = serde_json::json!({"type":"PASOS","nodos":[1,2,3,4],"r":10,"l":0.01,"km":0.1,"dientes":50,"td":0.001,"j":1e-5,"bm":1e-4});
            j[campo] = serde_json::from_str(v).unwrap();
            j.to_string()
        };
        let malos: Vec<String> = vec![
            r#"{"type":"J","d":1,"g":2,"s":0,"model":{"beta":0}}"#.into(),
            r#"{"type":"J","d":1,"g":2,"s":0,"model":{"vto":-500}}"#.into(),
            r#"{"type":"J","d":1,"g":2,"s":0,"model":{"lambda":-1}}"#.into(),
            r#"{"type":"J","d":1,"g":2,"s":0,"model":{"fc":1}}"#.into(),
            r#"{"type":"J","d":1,"g":2,"s":0,"model":{"rd":-1}}"#.into(),
            r#"{"type":"J","d":1,"g":2,"s":0,"model":{"b":0}}"#.into(),
            r#"{"type":"J","d":1,"g":2,"s":0,"model":{"desconocido":1}}"#.into(),
            r#"{"type":"E","p":1,"n":0,"cp":2,"cn":0,"ganancia":1e999}"#.into(),
            r#"{"type":"E","p":1,"n":0,"cp":2,"cn":0,"ganancia":1e12}"#.into(),
            r#"{"type":"F","p":1,"n":0,"cp":2,"cn":3,"ganancia":-1e12}"#.into(),
            r#"{"type":"G","p":1,"n":0,"cp":2,"cn":0,"gm":1e7}"#.into(),
            r#"{"type":"H","p":1,"n":0,"cp":2,"cn":3,"r":1e13}"#.into(),
            r#"{"type":"E","p":1,"n":0,"cp":2,"cn":9,"ganancia":1}"#.into(),
            term(r#","delta":0"#),
            term(r#","r25":0"#),
            term(r#","beta":1e9"#),
            term(r#","tau":0"#),
            term(r#","tmax":0.5"#),
            term(r#","canal":3"#),
            term(r#","rt":[[25,100]]"#),
            term(r#","rt":[[25,100],[25,200]]"#),
            term(r#","rt":[[0,100],[25,0]]"#),
            ldr("r10", "0"),
            ldr("gamma", "9"),
            ldr("roscuro", "1e15"),
            ldr("tau_sube", "0"),
            ldr("tau_baja", "-1"),
            ldr("canal", "1"),
            pasos("nodos", "[1,2,3]"),
            pasos("unipolar", "true"),
            pasos("k_mutua", "1"),
            pasos("dientes", "0"),
            pasos("dientes", "5000"),
            pasos("reduccion", "0.5"),
            pasos("td", "-1"),
            pasos("canal_carga", "4"),
            pasos("nodos", "[1,2,3,9]"),
            r#"{"type":"EXT","a":1,"b":0,"modo":"i","canal":0,"k":1e12,"c":0}"#.into(),
            r#"{"type":"EXT","a":1,"b":0,"modo":"v","canal":0,"k":1,"c":0,"r":0}"#.into(),
            r#"{"type":"EXT","a":1,"b":1,"modo":"v","canal":0,"k":1,"c":0}"#.into(),
            r#"{"type":"EXT","a":1,"b":0,"modo":"v","canal":1,"k":1,"c":0}"#.into(),
            r#"{"type":"V","a":1,"b":0,"wave":{"kind":"pwl","puntos":[]}}"#.into(),
            r#"{"type":"V","a":1,"b":0,"wave":{"kind":"pwl","puntos":[[0.1,0],[1,1]]}}"#.into(),
            r#"{"type":"V","a":1,"b":0,"wave":{"kind":"pwl","puntos":[[0,0],[1,1],[1,2]]}}"#.into(),
            r#"{"type":"V","a":1,"b":0,"wave":{"kind":"pwl","puntos":[[0,0],[1,1e9]]}}"#.into(),
        ];
        for malo in malos {
            assert!(lee(&malo, UN_CANAL).is_err(), "{malo}");
        }
        let muchos: Vec<String> = (0..1001).map(|k| format!("[{},0]", k)).collect();
        let largo = format!(r#"{{"type":"V","a":1,"b":0,"wave":{{"kind":"pwl","puntos":[{}]}}}}"#, muchos.join(","));
        assert!(lee(&largo, "").is_err());
        let justo = format!(r#"{{"type":"V","a":1,"b":0,"wave":{{"kind":"pwl","puntos":[{}]}}}}"#, muchos[..1000].join(","));
        assert!(lee(&justo, "").is_ok());
    }

    #[test]
    fn valida_los_canales_y_los_lectores() {
        let r = r#"{"type":"R","a":1,"b":0,"ohms":1}"#;
        assert!(lee(r, r#""canales":[{"inicial":1,"forma":"rampa"},{"inicial":-3}],"#).is_ok());
        for malo in [
            r#""canales":[{"inicial":1e999}],"#.to_string(),
            r#""canales":[{"inicial":1e12}],"#.to_string(),
            r#""canales":[{"inicial":1,"forma":"curva"}],"#.to_string(),
            format!(r#""canales":[{}],"#, vec![r#"{"inicial":0}"#; MAX_CANALES + 1].join(",")),
            r#""lectores":[{"kind":"v","p":1,"n":9}],"#.to_string(),
            r#""lectores":[{"kind":"v","p":2,"n":2}],"#.to_string(),
            r#""lectores":[{"kind":"i","elemento":4}],"#.to_string(),
        ] {
            assert!(lee(r, &malo).is_err(), "{malo}");
        }
        let n = lee(r, r#""canales":[{"inicial":1,"forma":"rampa"}],"lectores":[{"kind":"v","p":1,"n":0},{"kind":"i","elemento":0}],"#).unwrap();
        assert_eq!(n.canales, vec![CanalDef { inicial: 1.0, forma: FormaCanal::Rampa }]);
        assert_eq!(n.lectores, vec![LectorDef::V { p: 1, n: 0 }, LectorDef::I { elemento: 0 }]);
    }

    #[test]
    fn una_netlist_sin_canales_ni_lectores_los_deja_vacios() {
        let n = Netlist::from_json(include_str!("../fixtures/rectificador.json")).unwrap();
        assert!(n.canales.is_empty() && n.lectores.is_empty());
    }

    /// Un ejemplo de cada elemento analógico (los digitales no son dispositivos).
    const UN_DE_CADA: &str = r#"[
        {"type":"R","a":1,"b":0,"ohms":1000},{"type":"C","a":1,"b":0,"farads":1e-6},{"type":"L","a":1,"b":0,"henries":1e-3},
        {"type":"V","a":1,"b":0,"wave":{"kind":"dc","v":5}},{"type":"I","a":0,"b":1,"amps":1e-3},{"type":"D","a":1,"b":0},
        {"type":"Q","c":1,"b":2,"e":0},{"type":"M","d":1,"g":2,"s":0},{"type":"OA","p":1,"n":2,"out":3,"vp":4,"vn":0},
        {"type":"J","d":1,"g":2,"s":0},{"type":"E","p":1,"n":0,"cp":2,"cn":0,"ganancia":2},{"type":"G","p":1,"n":0,"cp":2,"cn":0,"gm":1e-3},
        {"type":"H","p":1,"n":0,"cp":2,"cn":3,"r":100},{"type":"F","p":1,"n":0,"cp":2,"cn":3,"ganancia":2},
        {"type":"TERM","a":1,"b":0,"tipo":"ntc","r25":10000,"beta":3950,"delta":0.002,"tau":10,"canal":0,"tmax":150},
        {"type":"LDR","a":1,"b":0,"r10":10000,"gamma":0.7,"roscuro":1e6,"tau_sube":0.02,"tau_baja":0.03,"canal":0},
        {"type":"PASOS","nodos":[1,2,3,4],"r":10,"l":0.01,"km":0.1,"dientes":50,"td":0.001,"j":1e-5,"bm":1e-4},
        {"type":"PASOS","nodos":[1,2,3,4,5,0],"unipolar":true,"r":10,"l":0.01,"km":0.1,"dientes":8,"td":0.001,"j":1e-5,"bm":1e-4},
        {"type":"EXT","a":1,"b":0,"modo":"v","canal":0,"k":1,"c":0},{"type":"LAMP","a":1,"b":0,"rfrio":2.88,"k":9,"pnom":5,"tau":0.05},
        {"type":"MOTOR","a":1,"b":0,"r":3,"l":1.5e-3,"ke":6.05e-3,"j":2.4e-7,"bm":6.4e-7},
        {"type":"FUSE","a":1,"b":0,"ohms":0.1,"inom":1,"ifusion":2,"tau":0.125},{"type":"PSU","a":1,"b":0,"v":12,"ilim":1,"vk":0.005},
        {"type":"BUZZER","a":1,"b":0,"ohms":100,"umbral":3},
        {"type":"RELAY","a1":1,"a2":0,"com":2,"na":3,"nc":4,"r":69.444,"l":0.20833,"ion":0.054,"ioff":0.0072},
        {"type":"XFMR","a1":1,"b1":0,"a2":2,"b2":0,"l1":1,"l2":1,"k":0.99},
        {"type":"ADC","p":1,"n":0,"out":0,"in_low":1.5,"in_high":3.5},
        {"type":"DAC","input":1,"out":2,"v_lo":0,"v_hi":5,"r_lo":55,"r_hi":55,"t_rise":7e-9,"t_fall":7e-9},
        {"type":"OUT555","q":0,"out":2,"dis":3,"vcc":1,"gnd":0,"v_lo":0.025,"r_lo":7.5,"v_hi":-1.4,"r_hi":3,"g_on":0.0667,"g_off":1e-9,"t_rise":1e-7,"t_fall":1e-7}
    ]"#;

    /// Una netlist con un LUT de una NAND (dos entradas, una salida) y su tabla: 00, 01, 10 dan 1 y 11 da 0.
    const LUT_NAND: &str = r#"{"nodes":1,"digital_nets":3,"tablas":[[1,1,1,0]],"elements":[
        {"type":"LUT","comunes":[],"rebanadas":[{"entradas":[0,1],"salidas":[2]}],"tabla":0,"retardos":[[1e-8,1e-8]]}]}"#;

    #[test]
    fn lee_un_lut_y_una_netlist_de_hoy_no_trae_tablas() {
        let n = Netlist::from_json(LUT_NAND).unwrap();
        let Element::Lut { comunes, rebanadas, tabla, retardos, abierta, z_como } = &n.elements[0] else { panic!("{:?}", n.elements[0]) };
        assert_eq!((comunes.len(), rebanadas.len(), *tabla, retardos.clone(), abierta.len(), *z_como), (0, 1, 0, vec![[1e-8, 1e-8]], 0, ZComo::X));
        assert_eq!(n.tablas, vec![vec![1, 1, 1, 0]]);
        assert!(n.elements[0].es_digital() && n.elements[0].nodes().is_empty());
        assert_eq!((n.elements[0].entradas_digitales(), n.elements[0].salidas_digitales()), (vec![0, 1], vec![2]));
        let hoy = Netlist::from_json(include_str!("../fixtures/rectificador.json")).unwrap();
        assert!(hoy.tablas.is_empty());
    }

    #[test]
    fn lee_un_msi_de_contador_con_su_tabla_de_salida() {
        let json = r#"{"nodes":1,"digital_nets":9,"tablas":[[0,1]],"elements":[{"type":"MSI","entradas":[0,1],"salidas":[2,3,4],
            "nucleo":{"tipo":"contador","bits":2,"modulo":4,"reloj":{"senales":[{"entrada":0}]},"borra":{"senal":{"entrada":1,"bajo":true}}},
            "de":[{"tipo":"directa","fuente":{"bit":0},"negada":false},{"tipo":"directa","fuente":{"bit":1}},{"tipo":"tabla","columna":0}],
            "fuentes":[{"bit":1}],"tabla":0,"retardos":[[1e-8,1e-8],[1e-8,1e-8],[2e-8,2e-8]]}]}"#;
        let n = Netlist::from_json(json).unwrap();
        let Element::Msi { nucleo, de, fuentes, .. } = &n.elements[0] else { panic!() };
        assert_eq!((nucleo.bits(), de.len(), fuentes.clone()), (2, 3, vec![Fuente::Bit(1)]));
        assert_eq!(de[0], SalidaMsi::Directa { fuente: Fuente::Bit(0), negada: false });
        assert!(matches!(nucleo, Nucleo::Contador { modulo: 4, reloj: Reloj { combina: Combina::Y, flanco: FlancoReloj::Subida, .. }, .. }));
    }

    #[test]
    fn lee_un_msi_de_aproximaciones_y_uno_de_desplazamiento() {
        let aprox = r#"{"nodes":1,"digital_nets":6,"elements":[{"type":"MSI","entradas":[0,1,2,3],"salidas":[4],
            "nucleo":{"tipo":"aproximaciones","bits":8,"cs":{"entrada":0,"bajo":true},"wr":{"entrada":1,"bajo":true},"rd":{"entrada":2,"bajo":true},
                "comparador":3,"reloj":{"tipo":"interno","periodo":1.65e-6},"ciclos_inicio":1,"ciclos_bit":8},
            "de":[{"tipo":"directa","fuente":{"bandera":0},"negada":true}],"retardos":[[1e-7,1e-7]]}]}"#;
        assert!(Netlist::from_json(aprox).is_ok());
        let desp = r#"{"nodes":1,"digital_nets":5,"elements":[{"type":"MSI","entradas":[0,1],"salidas":[2],
            "nucleo":{"tipo":"desplazamiento","bits":8,"reloj":{"senales":[{"entrada":0}]},"serie":[{"entrada":1}],"almacen":{"senales":[{"entrada":0}]}},
            "de":[{"tipo":"directa","fuente":{"aux":7}}],"retardos":[[1e-8,1e-8]]}]}"#;
        assert!(Netlist::from_json(desp).is_ok());
    }

    #[test]
    fn las_filas_de_una_tabla_llegan_como_numero_o_como_texto_si_no_caben_en_53_bits() {
        let json = r#"{"nodes":1,"digital_nets":3,"tablas":[[1,1,1,"18446744073709551615"]],"elements":[
            {"type":"LUT","comunes":[],"rebanadas":[{"entradas":[0,1],"salidas":[2]}],"tabla":0,"retardos":[[1e-8,1e-8]]}]}"#;
        assert_eq!(Netlist::from_json(json).unwrap().tablas, vec![vec![1, 1, 1, u64::MAX]]);
        assert!(Netlist::from_json(&json.replace("18446744073709551615", "mucho")).is_err());
    }

    #[test]
    fn un_msi_de_aproximaciones_con_reloj_externo_lee_el_reloj_junto_a_su_tipo() {
        let json = r#"{"nodes":1,"digital_nets":6,"elements":[{"type":"MSI","entradas":[0,1,2,3,4],"salidas":[5],
            "nucleo":{"tipo":"aproximaciones","bits":8,"cs":{"entrada":0},"wr":{"entrada":1},"rd":{"entrada":2},"comparador":3,
                "reloj":{"tipo":"externo","senales":[{"entrada":4}],"flanco":"bajada"},"ciclos_inicio":1,"ciclos_bit":8},
            "de":[{"tipo":"directa","fuente":{"bandera":0}}],"retardos":[[1e-7,1e-7]]}]}"#;
        let n = Netlist::from_json(json).unwrap();
        let Element::Msi { nucleo: Nucleo::Aproximaciones { reloj: RelojConv::Externo(r), .. }, .. } = &n.elements[0] else { panic!() };
        assert_eq!((r.senales.len(), r.flanco), (1, FlancoReloj::Bajada));
    }

    #[test]
    fn lee_un_dacm_y_un_interruptor_de_canal() {
        let json = r#"{"nodes":5,"digital_nets":3,"canales":[{"inicial":0}],"elements":[
            {"type":"DACM","modo":"corriente","out":1,"ret":0,"ref_p":2,"ref_n":0,"bits":[0,1,2],"t_asentamiento":1.5e-7},
            {"type":"INTC","a":3,"b":4,"canal":0,"r_on":0.1,"r_off":1e9}]}"#;
        let n = Netlist::from_json(json).unwrap();
        assert_eq!((n.elements[0].nodes(), n.elements[0].entradas_digitales()), (vec![1, 0, 2, 0], vec![0, 1, 2]));
        assert_eq!((n.elements[1].nodes(), n.elements[1].canales_usados()), (vec![3, 4], vec![0]));
        assert!(!n.elements[0].es_digital() && !n.elements[1].es_digital());
        // Los nodos de una isla se renumeran; las redes digitales no.
        let Element::Dacm { out, ref_p, bits, .. } = n.elements[0].con_nodos(|k| k + 10) else { panic!() };
        assert_eq!((out, ref_p, bits), (11, 12, vec![0, 1, 2]));
    }

    #[test]
    fn rechaza_un_lut_mal_formado_con_su_texto() {
        let lut = |extra: &str, tablas: &str, ent: &str, sal: &str, ret: &str| {
            format!(r#"{{"nodes":1,"digital_nets":20,"tablas":{tablas},"elements":[{{"type":"LUT","comunes":[],"rebanadas":[{{"entradas":{ent},"salidas":{sal}}}{extra}],"tabla":0,"retardos":{ret}}}]}}"#)
        };
        assert!(Netlist::from_json(&lut("", "[[1,1,1,0]]", "[0,1]", "[2]", "[[1e-8,1e-8]]")).is_ok());
        let casos = [
            (lut("", "[]", "[0,1]", "[2]", "[[1e-8,1e-8]]"), "la tabla 0 no existe"),
            (lut("", "[[1,1,1]]", "[0,1]", "[2]", "[[1e-8,1e-8]]"), "la tabla 0 tiene 3 filas y se esperaban 4"),
            (lut(r#",{"entradas":[3],"salidas":[4]}"#, "[[1,1,1,0]]", "[0,1]", "[2]", "[[1e-8,1e-8]]"), "las rebanadas deben ser del mismo tamaño"),
            (lut("", "[[1,1,1,0]]", "[0,1]", "[2]", "[]"), "retardos debe tener un par por salida (1)"),
            (lut("", "[[1,1,1,0]]", "[0,1]", "[2]", "[[0,1e-8]]"), "retardos fuera de rango"),
            (lut("", "[[1,1,1,0]]", "[0,1]", "[25]", "[[1e-8,1e-8]]"), "red digital fuera de rango"),
            (lut("", "[[1,1,1,0]]", "[0,1,3,4,5,6,7,8,9,10,11,12,13,14,15]", "[2]", "[[1e-8,1e-8]]"), "la tabla admite hasta 14 entradas"),
        ];
        for (json, texto) in casos {
            let e = Netlist::from_json(&json).unwrap_err().to_string();
            assert!(e.contains(texto), "{texto}: {e}");
        }
        // Más de 32 salidas por rebanada, con tantas redes como haga falta.
        let salidas: Vec<String> = (0..33).map(|k| (k + 2).to_string()).collect();
        let json = format!(r#"{{"nodes":1,"digital_nets":40,"tablas":[[1,1,1,0]],"elements":[{{"type":"LUT","comunes":[],"rebanadas":[{{"entradas":[0,1],"salidas":[{}]}}],"tabla":0,"retardos":[]}}]}}"#, salidas.join(","));
        assert!(Netlist::from_json(&json).unwrap_err().to_string().contains("de 1 a 32 salidas"));
    }

    #[test]
    fn rechaza_un_msi_con_fuentes_senales_o_modulo_fuera_de_rango() {
        let msi = |nucleo: &str, de: &str, fuentes: &str, tabla: &str| {
            format!(r#"{{"nodes":1,"digital_nets":6,"tablas":[[0,1,1,0]],"elements":[{{"type":"MSI","entradas":[0,1],"salidas":[2],"nucleo":{nucleo},"de":{de},"fuentes":{fuentes},"tabla":{tabla},"retardos":[[1e-8,1e-8]]}}]}}"#)
        };
        let cont = |bits: u32, modulo: u32, entrada: u32| format!(r#"{{"tipo":"contador","bits":{bits},"modulo":{modulo},"reloj":{{"senales":[{{"entrada":{entrada}}}]}}}}"#);
        let directa = r#"[{"tipo":"directa","fuente":{"bit":0}}]"#;
        let de_tabla = r#"[{"tipo":"tabla","columna":0}]"#;
        assert!(Netlist::from_json(&msi(&cont(2, 4, 0), directa, "[]", "null")).is_ok());
        let casos = [
            (msi(&cont(2, 5, 0), directa, "[]", "null"), "modulo debe estar entre 2 y 2^bits"),
            (msi(&cont(2, 1, 0), directa, "[]", "null"), "modulo debe estar entre 2 y 2^bits"),
            (msi(&cont(17, 4, 0), directa, "[]", "null"), "bits debe estar entre 1 y 16"),
            (msi(&cont(2, 4, 7), directa, "[]", "null"), "una señal del núcleo nombra una entrada que no existe"),
            (msi(&cont(2, 4, 0), r#"[{"tipo":"directa","fuente":{"bit":2}}]"#, "[]", "null"), "una salida directa nombra una fuente fuera de rango"),
            (msi(&cont(2, 4, 0), r#"[{"tipo":"directa","fuente":{"aux":0}}]"#, "[]", "null"), "una salida directa nombra una fuente fuera de rango"),
            (msi(&cont(2, 4, 0), de_tabla, "[]", "null"), "sin tabla"),
            (msi(&cont(2, 4, 0), de_tabla, r#"[{"bit":0},{"entrada":9}]"#, "0"), "una fuente está fuera de rango"),
            (msi(&cont(2, 4, 0), de_tabla, r#"[{"bit":0}]"#, "0"), "la tabla 0 tiene 4 filas y se esperaban 2"),
            (msi(&cont(2, 4, 0), "[]", "[]", "null"), "de debe tener una entrada por salida (1)"),
        ];
        for (json, texto) in casos {
            let e = Netlist::from_json(&json).unwrap_err().to_string();
            assert!(e.contains(texto), "{texto}: {e}");
        }
        assert!(Netlist::from_json(&msi(&cont(2, 4, 0), de_tabla, r#"[{"bit":0},{"bit":1}]"#, "0")).is_ok());
    }

    #[test]
    fn rechaza_un_dacm_o_un_intc_fuera_de_rango() {
        let dac = |bits: &str, t: &str| format!(r#"{{"nodes":4,"digital_nets":20,"elements":[{{"type":"DACM","modo":"voltaje","out":1,"ret":0,"ref_p":2,"ref_n":0,"bits":{bits},"t_asentamiento":{t}}}]}}"#);
        assert!(Netlist::from_json(&dac("[0,1]", "1e-7")).is_ok());
        assert!(Netlist::from_json(&dac("[]", "1e-7")).unwrap_err().to_string().contains("de 1 a 16 redes"));
        assert!(Netlist::from_json(&dac("[0,1]", "0")).unwrap_err().to_string().contains("t_asentamiento fuera de rango"));
        assert!(Netlist::from_json(&dac("[0,99]", "1e-7")).unwrap_err().to_string().contains("red digital fuera de rango"));
        let intc = |canal: u32, r_on: &str| format!(r#"{{"nodes":3,"canales":[{{"inicial":0}}],"elements":[{{"type":"INTC","a":1,"b":2,"canal":{canal},"r_on":{r_on},"r_off":1e9}}]}}"#);
        assert!(Netlist::from_json(&intc(0, "0.1")).is_ok());
        assert!(Netlist::from_json(&intc(1, "0.1")).unwrap_err().to_string().contains("canal fuera de rango"));
        assert!(Netlist::from_json(&intc(0, "0")).unwrap_err().to_string().contains("positivo"));
    }

    #[test]
    fn una_salida_fija_comparte_red_con_las_de_tres_estados_pero_no_con_otra_fija() {
        let puerta = |extra: &str| format!(r#"{{"type":"GATE","fn":"buf","inputs":[0],"output":2,"rise_delay":1e-9,"fall_delay":1e-9{extra}}}"#);
        let red = |a: &str, b: &str| format!(r#"{{"nodes":1,"digital_nets":3,"elements":[{{"type":"LOGIC","out":0,"value":1}},{{"type":"LOGIC","out":1,"value":0}},{a},{b}]}}"#);
        let (fija, tres) = (puerta(""), puerta(r#","enable":1"#));
        // Una fija y una de tres estados, o varias de tres estados.
        assert!(Netlist::from_json(&red(&fija, &tres)).is_ok());
        assert!(Netlist::from_json(&red(&tres, &tres)).is_ok());
        // Dos fijas, con una de tres estados en medio o sin ella.
        assert!(Netlist::from_json(&red(&fija, &fija)).unwrap_err().to_string().contains("ya la maneja el elemento"));
        let con_tres = format!(r#"{{"nodes":1,"digital_nets":3,"elements":[{{"type":"LOGIC","out":0,"value":1}},{{"type":"LOGIC","out":1,"value":0}},{fija},{tres},{fija}]}}"#);
        assert!(Netlist::from_json(&con_tres).unwrap_err().to_string().contains("ya la maneja el elemento"));
    }

    #[test]
    fn un_lut_con_z_en_su_tabla_o_con_salida_abierta_cuenta_como_de_tres_estados() {
        let n = Netlist::from_json(
            r#"{"nodes":1,"digital_nets":4,"tablas":[[1,2],[1,0]],"elements":[
            {"type":"LUT","comunes":[],"rebanadas":[{"entradas":[0],"salidas":[1]}],"tabla":0,"retardos":[[1e-8,1e-8]]},
            {"type":"LUT","comunes":[],"rebanadas":[{"entradas":[0],"salidas":[2]}],"tabla":1,"retardos":[[1e-8,1e-8]],"abierta":[true]},
            {"type":"LUT","comunes":[],"rebanadas":[{"entradas":[0],"salidas":[3]}],"tabla":1,"retardos":[[1e-8,1e-8]]}]}"#,
        )
        .unwrap();
        let tres: Vec<bool> = n.elements.iter().map(|e| e.tres_estados(&n.tablas)).collect();
        assert_eq!(tres, vec![true, true, false]);
    }

    #[test]
    fn la_fabrica_construye_cada_variante_analogica() {
        let json = format!(r#"{{"nodes":6,"digital_nets":2,"canales":[{{"inicial":25}}],"elements":{UN_DE_CADA}}}"#);
        let net = Netlist::from_json(&json).unwrap();
        // Una variante nueva rompe este `match` y obliga a agregarle su ejemplo a `UN_DE_CADA`.
        let mut vistas = std::collections::BTreeSet::new();
        for (k, e) in net.elements.iter().enumerate() {
            let nombre = match e {
                Element::R { .. } => "R",
                Element::C { .. } => "C",
                Element::L { .. } => "L",
                Element::V { .. } => "V",
                Element::I { .. } => "I",
                Element::D { .. } => "D",
                Element::Q { .. } => "Q",
                Element::M { .. } => "M",
                Element::OA { .. } => "OA",
                Element::J { .. } => "J",
                Element::E { .. } => "E",
                Element::G { .. } => "G",
                Element::H { .. } => "H",
                Element::F { .. } => "F",
                Element::Term { .. } => "TERM",
                Element::Ldr { .. } => "LDR",
                Element::Pasos { .. } => "PASOS",
                Element::Ext { .. } => "EXT",
                Element::Lamp { .. } => "LAMP",
                Element::Motor { .. } => "MOTOR",
                Element::Fuse { .. } => "FUSE",
                Element::Psu { .. } => "PSU",
                Element::Buzzer { .. } => "BUZZER",
                Element::Relay { .. } => "RELAY",
                Element::Xfmr { .. } => "XFMR",
                Element::Adc { .. } => "ADC",
                Element::Dac { .. } => "DAC",
                Element::Out555 { .. } => "OUT555",
                Element::Gate { .. }
                | Element::Logic { .. }
                | Element::Dff { .. }
                | Element::Jkff { .. }
                | Element::Counter { .. }
                | Element::Decoder { .. }
                | Element::Latch555 { .. }
                | Element::Lut { .. }
                | Element::Msi { .. } => {
                    unreachable!("el ejemplo no incluye elementos digitales")
                }
                // Su dispositivo llega con su bloque; entonces pasan a `UN_DE_CADA`.
                Element::Dacm { .. } | Element::Intc { .. } => unreachable!("el ejemplo no los incluye todavía"),
            };
            vistas.insert(nombre);
            assert!(crate::devices::build(e, k).is_ok(), "{nombre}");
        }
        assert_eq!(vistas.len(), 28, "{vistas:?}");
        assert!(!include_str!("devices/mod.rs").contains(&["aún no", "se simula"].join(" ")));
    }
}
