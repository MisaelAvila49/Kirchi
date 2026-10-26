//! Lógica por eventos: redes digitales con un nivel de cuatro valores, modelos que programan sus salidas con un
//! retardo inercial y una cola de eventos en picosegundos enteros, como el modo mixto de XSPICE. La parte analógica se
//! comunica con ella por los puentes de `devices/puente.rs` y la sincroniza `mixto.rs`.

pub mod cola;
pub mod modelos;
pub mod nivel;
pub mod simulador;

pub use nivel::Nivel;
pub use simulador::Digital;

/// Tiempo de la lógica: picosegundos enteros (el diseño general pide un entero; u64 alcanza para 18 millones de segundos).
pub type Ps = u64;

/// Un tiempo en segundos como picosegundos, redondeado al más cercano (los retardos).
pub fn a_ps(s: f64) -> Ps {
    (s * 1e12).round().max(0.0) as Ps
}

/// Un instante en segundos como picosegundos, redondeado hacia arriba: un evento que nace de un cruce de umbral nunca
/// queda antes del instante analógico donde se detectó. Una millonésima de picosegundo de holgura evita que el error de
/// redondeo de 1e-9 · 1e12 (1000.0000000000001) lo mande al picosegundo siguiente.
pub fn a_ps_arriba(s: f64) -> Ps {
    (s * 1e12 - 1e-6).ceil().max(0.0) as Ps
}

/// Picosegundos como segundos.
pub fn a_s(p: Ps) -> f64 {
    p as f64 * 1e-12
}

/// Pasadas sin retardo del arranque antes de dar por hecho que hay un lazo que no se asienta.
pub const MAX_PASADAS_ARRANQUE: usize = 20;
/// Ciclos delta en un mismo instante antes de detener la simulación (con retardos positivos no se llega: es una defensa).
pub const MAX_CICLOS_DELTA: usize = 1000;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conversiones_de_tiempo() {
        assert_eq!(a_ps(5e-9), 5000);
        assert_eq!(a_ps(1e-12), 1);
        assert_eq!(a_ps_arriba(1.0000001e-9), 1001);
        assert_eq!(a_ps_arriba(1e-9), 1000);
        assert!((a_s(1500) - 1.5e-9).abs() < 1e-24);
    }
}
