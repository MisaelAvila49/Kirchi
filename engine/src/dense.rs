use crate::error::EngineError;

/// LU densa con pivoteo parcial, guardada por filas.
pub struct DenseLu {
    n: usize,
    a: Vec<f64>,
    perm: Vec<usize>,
    /// Columna donde falló la última factorización.
    pub bad: Option<usize>,
    /// El último fallo fue por un valor que no es finito.
    pub no_finito: bool,
    /// La matriz de las estampas fijas (`LinearSolver::guardar_base`).
    base: Vec<f64>,
    /// Lo mayor de cada columna en la última factorización (se reserva una sola vez).
    colmax: Vec<f64>,
}

/// Pivote absoluto mínimo: solo el cero exacto. Un piso de 1e-13 (el PIVTOL de ngspice) declaraba singular una fuente de
/// voltaje en paralelo con una conductancia mayor que 1e13 S (complemento de Schur de 1/G), que la LU dispersa sí resuelve.
const PIVOTE_ABSOLUTO: f64 = f64::MIN_POSITIVE;
/// Pivote mínimo relativo a lo mayor que había en su columna antes de eliminar: por debajo es ruido de redondeo.
const PIVOTE_RELATIVO: f64 = 1e-14;

/// Lado máximo de la matriz densa (4096² doubles = 128 MB); más allá se necesita el solucionador disperso.
pub const MAX_DENSE: usize = 4096;

impl DenseLu {
    pub fn new(n: usize) -> Self {
        Self::try_new(n).expect("matriz densa demasiado grande")
    }

    /// Como `new`, pero devuelve un error en lugar de abortar si n² no cabe o excede `MAX_DENSE`.
    pub fn try_new(n: usize) -> Result<Self, EngineError> {
        let cells = n.checked_mul(n).filter(|_| n <= MAX_DENSE).ok_or_else(|| {
            EngineError::Invalid(format!("el circuito tiene {n} incógnitas y el solucionador denso admite hasta {MAX_DENSE}"))
        })?;
        Ok(Self { n, a: vec![0.0; cells], perm: (0..n).collect(), bad: None, no_finito: false, base: Vec::new(), colmax: vec![0.0; n] })
    }

    pub fn clear(&mut self) {
        self.a.fill(0.0);
    }

    /// La factorización se hace sobre la misma matriz: la base es una copia (se reserva una sola vez).
    pub fn guardar_base(&mut self) {
        self.base.clear();
        self.base.extend_from_slice(&self.a);
    }

    pub fn restaurar_base(&mut self) {
        self.a.copy_from_slice(&self.base);
    }

    #[inline]
    pub fn add(&mut self, r: usize, c: usize, v: f64) {
        self.a[r * self.n + c] += v;
    }

    pub fn factor(&mut self) -> Result<(), EngineError> {
        let n = self.n;
        for (i, p) in self.perm.iter_mut().enumerate() {
            *p = i;
        }
        self.bad = None;
        self.no_finito = false;
        // Lo mayor de cada columna antes de eliminar: el pivote se juzga contra su propia columna y no contra la
        // matriz entera (un capacitor de 1e4 S de un lado no vuelve singular a un nodo de 1e-12 S del otro).
        let colmax = &mut self.colmax;
        colmax.fill(0.0);
        for fila in self.a.chunks_exact(n.max(1)) {
            for (c, (m, v)) in colmax.iter_mut().zip(fila).enumerate() {
                let v = v.abs();
                if !v.is_finite() {
                    self.bad = Some(c);
                    self.no_finito = true;
                    return Err(EngineError::Singular { element: None });
                }
                *m = m.max(v);
            }
        }
        for k in 0..n {
            let mut p = k;
            let mut max = self.a[k * n + k].abs();
            for r in k + 1..n {
                let v = self.a[r * n + k].abs();
                if v > max {
                    max = v;
                    p = r;
                }
            }
            if !max.is_finite() || max <= PIVOTE_ABSOLUTO.max(PIVOTE_RELATIVO * self.colmax[k]) {
                self.bad = Some(k);
                self.no_finito = !max.is_finite();
                return Err(EngineError::Singular { element: None });
            }
            if p != k {
                for c in 0..n {
                    self.a.swap(k * n + c, p * n + c);
                }
                self.perm.swap(k, p);
            }
            let piv = self.a[k * n + k];
            for r in k + 1..n {
                let f = self.a[r * n + k] / piv;
                self.a[r * n + k] = f;
                if f != 0.0 {
                    for c in k + 1..n {
                        let t = f * self.a[k * n + c];
                        self.a[r * n + c] -= t;
                    }
                }
            }
        }
        Ok(())
    }

    pub fn solve(&self, b: &[f64], x: &mut [f64]) {
        let n = self.n;
        for i in 0..n {
            x[i] = b[self.perm[i]];
        }
        for i in 0..n {
            let mut s = x[i];
            for j in 0..i {
                s -= self.a[i * n + j] * x[j];
            }
            x[i] = s;
        }
        for i in (0..n).rev() {
            let mut s = x[i];
            for j in i + 1..n {
                s -= self.a[i * n + j] * x[j];
            }
            x[i] = s / self.a[i * n + i];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solve(rows: &[[f64; 3]; 3], b: [f64; 3]) -> Result<[f64; 3], EngineError> {
        let mut lu = DenseLu::new(3);
        for (r, row) in rows.iter().enumerate() {
            for (c, v) in row.iter().enumerate() {
                lu.add(r, c, *v);
            }
        }
        lu.factor()?;
        let mut x = [0.0; 3];
        lu.solve(&b, &mut x);
        Ok(x)
    }

    #[test]
    fn resuelve_sistema_3x3() {
        // 2x + y = 5, x + 3y + z = 9.25, y + 4z = 9  →  x=1.5, y=2, z=1.75
        let x = solve(&[[2.0, 1.0, 0.0], [1.0, 3.0, 1.0], [0.0, 1.0, 4.0]], [5.0, 9.25, 9.0]).unwrap();
        assert!((x[0] - 1.5).abs() < 1e-12 && (x[1] - 2.0).abs() < 1e-12 && (x[2] - 1.75).abs() < 1e-12);
    }

    #[test]
    fn necesita_pivoteo() {
        // primer pivote en cero: y = 2, x = 3, z = 1
        let x = solve(&[[0.0, 1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0]], [2.0, 3.0, 1.0]).unwrap();
        assert_eq!(x, [3.0, 2.0, 1.0]);
    }

    #[test]
    fn detecta_singular() {
        let e = solve(&[[1.0, 1.0, 0.0], [1.0, 1.0, 0.0], [0.0, 0.0, 1.0]], [1.0, 1.0, 1.0]).unwrap_err();
        assert_eq!(e, EngineError::Singular { element: None });
    }

    #[test]
    fn un_nodo_de_1e_12_siemens_junto_a_un_capacitor_de_1e4_no_es_singular() {
        // El pivote se juzga contra su columna, no contra lo mayor de toda la matriz.
        let x = solve(&[[1e4, 0.0, 0.0], [0.0, 1e-12, 0.0], [0.0, 0.0, 1.0]], [1e4, 1e-12, 2.0]).unwrap();
        assert!((x[0] - 1.0).abs() < 1e-12 && (x[1] - 1.0).abs() < 1e-9 && (x[2] - 2.0).abs() < 1e-12);
        // Y lo que es ruido de redondeo de una columna grande sigue siendo singular.
        let e = solve(&[[1e4, 1e4, 0.0], [1e4, 1e4 * (1.0 + 1e-16), 0.0], [0.0, 0.0, 1.0]], [1.0, 1.0, 1.0]).unwrap_err();
        assert_eq!(e, EngineError::Singular { element: None });
    }

    #[test]
    fn rechaza_valores_no_finitos() {
        let e = solve(&[[1.0, f64::NAN, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]], [1.0, 1.0, 1.0]).unwrap_err();
        assert_eq!(e, EngineError::Singular { element: None });
    }

    #[test]
    fn pivotea_despues_de_guardar_multiplicadores() {
        let a = [[1.0, 1.0, 1.0], [2.0, 2.0, 5.0], [4.0, 6.0, 8.0]];
        let b = [1.0, 2.0, 3.0];
        let x = solve(&a, b).unwrap();
        for r in 0..3 {
            let ax: f64 = (0..3).map(|c| a[r][c] * x[c]).sum();
            assert!((ax - b[r]).abs() < 1e-12);
        }
    }

    #[test]
    fn try_new_rechaza_tamanos_que_no_caben() {
        assert!(matches!(DenseLu::try_new(usize::MAX), Err(EngineError::Invalid(_))));
        assert!(matches!(DenseLu::try_new(MAX_DENSE + 1), Err(EngineError::Invalid(_))));
        assert!(DenseLu::try_new(8).is_ok());
    }

    #[test]
    fn clear_permite_refactorizar() {
        let mut lu = DenseLu::new(1);
        lu.add(0, 0, 2.0);
        lu.factor().unwrap();
        lu.clear();
        lu.add(0, 0, 4.0);
        lu.factor().unwrap();
        let mut x = [0.0];
        lu.solve(&[8.0], &mut x);
        assert_eq!(x[0], 2.0);
    }
}
