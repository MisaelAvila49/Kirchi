use crate::dense::DenseLu;
use crate::error::EngineError;

pub trait Stamp {
    fn add(&mut self, r: usize, c: usize, v: f64);
}

pub trait LinearSolver: Stamp {
    fn clear(&mut self);
    fn factor(&mut self) -> Result<(), EngineError>;
    fn solve(&self, b: &[f64], x: &mut [f64]);
    /// Guarda lo estampado desde el último `clear` como base: las estampas fijas de una isla (resistencias, fusibles), que las
    /// iteraciones siguientes no vuelven a estampar.
    fn guardar_base(&mut self);
    /// Vuelve a la base guardada en lugar de empezar de cero (`clear`).
    fn restaurar_base(&mut self);
    /// La incógnita donde falló la última factorización, si el solucionador lo sabe.
    fn bad_unknown(&self) -> Option<usize> {
        None
    }
    /// La última factorización falló porque la matriz tenía valores que no son finitos.
    fn non_finite(&self) -> bool {
        false
    }
}

impl Stamp for DenseLu {
    #[inline]
    fn add(&mut self, r: usize, c: usize, v: f64) {
        DenseLu::add(self, r, c, v)
    }
}

impl LinearSolver for DenseLu {
    fn clear(&mut self) {
        DenseLu::clear(self)
    }
    fn factor(&mut self) -> Result<(), EngineError> {
        DenseLu::factor(self)
    }
    fn solve(&self, b: &[f64], x: &mut [f64]) {
        DenseLu::solve(self, b, x)
    }
    fn guardar_base(&mut self) {
        DenseLu::guardar_base(self)
    }
    fn restaurar_base(&mut self) {
        DenseLu::restaurar_base(self)
    }
    fn bad_unknown(&self) -> Option<usize> {
        self.bad
    }
    fn non_finite(&self) -> bool {
        self.no_finito
    }
}
