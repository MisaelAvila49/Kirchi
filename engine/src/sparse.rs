use faer::dyn_stack::{MemBuffer, MemStack, StackReq};
use faer::sparse::linalg::cholesky::{factorize_symbolic_cholesky, CholeskySymbolicParams, SymmetricOrdering};
use faer::sparse::linalg::lu::{factorize_symbolic_lu, LuSymbolicParams, NumericLu, SymbolicLu};
use faer::sparse::linalg::SupernodalThreshold;
use faer::sparse::{SparseColMatRef, SymbolicSparseColMat, SymbolicSparseColMatRef};
use faer::{Conj, Mat, Par, Side};

use crate::error::EngineError;
use crate::mna::{LinearSolver, Stamp};

/// Entradas del factor por incógnita desde las cuales conviene la LU supernodal. Medido: una cadena de etapas deja unas 3 (la simplicial es 4 a 40 veces más rápida) y una red al azar deja de 35 a 116 (la supernodal es 6 a 65 veces más rápida). La regla por omisión de faer no los separa.
const RELLENO_SUPERNODAL: f64 = 16.0;

/// El patrón de A + Aᵀ guardado como mitad superior (lo que lee Cholesky con `Side::Upper`): cada entrada (i, j) aporta la
/// (min, max) y la diagonal siempre está. Un circuito no es simétrico (la transconductancia de un transistor solo llena un
/// lado), y leer una sola mitad del patrón de A subestimaría el relleno de las entradas que solo viven en la otra.
fn simetrico(a: SymbolicSparseColMatRef<'_, usize>) -> SymbolicSparseColMat<usize> {
    let n = a.nrows();
    let mut pares: Vec<(usize, usize)> = (0..n).map(|j| (j, j)).collect();
    for j in 0..a.ncols() {
        for &i in a.row_idx_of_col_raw(j) {
            pares.push((j.max(i), j.min(i)));
        }
    }
    pares.sort_unstable();
    pares.dedup();
    let mut col_ptr = vec![0usize; n + 1];
    let mut row_idx = Vec::with_capacity(pares.len());
    for &(col, fila) in &pares {
        col_ptr[col + 1] += 1;
        row_idx.push(fila);
    }
    for j in 0..n {
        col_ptr[j + 1] += col_ptr[j];
    }
    SymbolicSparseColMat::new_checked(n, n, col_ptr, None, row_idx)
}

/// Si la factorización se llena lo bastante para que la supernodal gane. El relleno se estima con la estructura de
/// Cholesky de A + Aᵀ con orden AMD: barato (solo la estructura) y basta para separar un circuito de una red casi densa.
fn supernodal(a: SymbolicSparseColMatRef<'_, usize>) -> bool {
    let sim = simetrico(a);
    let mut p = CholeskySymbolicParams::default();
    p.supernodal_flop_ratio_threshold = SupernodalThreshold::FORCE_SIMPLICIAL;
    match factorize_symbolic_cholesky(sim.as_ref(), Side::Upper, SymmetricOrdering::Amd, p) {
        Ok(l) => l.len_val() as f64 > RELLENO_SUPERNODAL * a.nrows() as f64,
        Err(_) => false,
    }
}

#[cfg(feature = "perfil")]
pub static PERFIL_PRE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
#[cfg(feature = "perfil")]
pub static PERFIL_NUM: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// LU dispersa: guarda la estructura CSC y la factorización simbólica mientras el patrón no cambie,
/// y reutiliza el almacenamiento numérico y los buffers de trabajo.
pub struct SparseLu {
    n: usize,
    rows: Vec<usize>,
    cols: Vec<usize>,
    vals: Vec<f64>,
    /// Cuántas tripletas son de las estampas fijas (`LinearSolver::guardar_base`).
    base: usize,
    // cache
    key: Vec<(usize, usize)>,
    slot: Vec<usize>,
    sym: Option<SymbolicSparseColMat<usize>>,
    csc_vals: Vec<f64>,
    symbolic: Option<SymbolicLu<usize>>,
    numeric: NumericLu<usize, f64>,
    fscratch: MemBuffer,
    sscratch: std::cell::RefCell<MemBuffer>,
    rhs: std::cell::RefCell<Mat<f64>>,
    ok: bool,
    no_finito: bool,
}

impl SparseLu {
    pub fn new(n: usize) -> Self {
        Self {
            n,
            rows: Vec::new(),
            cols: Vec::new(),
            vals: Vec::new(),
            base: 0,
            key: Vec::new(),
            slot: Vec::new(),
            sym: None,
            csc_vals: Vec::new(),
            symbolic: None,
            numeric: NumericLu::new(),
            fscratch: MemBuffer::new(StackReq::EMPTY),
            sscratch: std::cell::RefCell::new(MemBuffer::new(StackReq::EMPTY)),
            rhs: std::cell::RefCell::new(Mat::zeros(n, 1)),
            ok: false,
            no_finito: false,
        }
    }

    fn rebuild(&mut self) -> Result<(), EngineError> {
        let m = self.rows.len();
        let mut order: Vec<usize> = (0..m).collect();
        order.sort_unstable_by_key(|&k| (self.cols[k], self.rows[k]));
        let mut col_ptr = vec![0usize; self.n + 1];
        let mut row_idx = Vec::with_capacity(m);
        self.slot = vec![0; m];
        let mut last: Option<(usize, usize)> = None;
        for &k in &order {
            let rc = (self.rows[k], self.cols[k]);
            if last != Some(rc) {
                row_idx.push(rc.0);
                col_ptr[rc.1 + 1] += 1;
                last = Some(rc);
            }
            self.slot[k] = row_idx.len() - 1;
        }
        for j in 0..self.n {
            col_ptr[j + 1] += col_ptr[j];
        }
        let nnz = row_idx.len();
        let sym = SymbolicSparseColMat::new_checked(self.n, self.n, col_ptr, None, row_idx);
        let mut params = LuSymbolicParams::default();
        params.supernodal_flop_ratio_threshold =
            if supernodal(sym.as_ref()) { SupernodalThreshold::FORCE_SUPERNODAL } else { SupernodalThreshold::FORCE_SIMPLICIAL };
        let symbolic = factorize_symbolic_lu(sym.as_ref(), params).map_err(|_| EngineError::Singular { element: None })?;
        let par = Par::Seq;
        // Reservar con `try_new`: si no hay memoria el motor da un error en palabras en vez de abortar el proceso.
        let sin_memoria = |_| EngineError::Invalid("no hay memoria suficiente para factorizar el circuito".into());
        self.fscratch = MemBuffer::try_new(symbolic.factorize_numeric_lu_scratch::<f64>(par, Default::default())).map_err(sin_memoria)?;
        *self.sscratch.borrow_mut() = MemBuffer::try_new(symbolic.solve_in_place_scratch::<f64>(1, par)).map_err(sin_memoria)?;
        self.csc_vals = vec![0.0; nnz];
        self.sym = Some(sym);
        self.symbolic = Some(symbolic);
        self.key = self.rows.iter().copied().zip(self.cols.iter().copied()).collect();
        Ok(())
    }
}

impl Stamp for SparseLu {
    fn add(&mut self, r: usize, c: usize, v: f64) {
        self.rows.push(r);
        self.cols.push(c);
        self.vals.push(v);
    }
}

impl LinearSolver for SparseLu {
    fn clear(&mut self) {
        self.rows.clear();
        self.cols.clear();
        self.vals.clear();
    }

    fn guardar_base(&mut self) {
        self.base = self.rows.len();
    }

    fn restaurar_base(&mut self) {
        // Las tripletas de las estampas fijas van primero y quedan; el patrón (y su simbólico) no cambia.
        self.rows.truncate(self.base);
        self.cols.truncate(self.base);
        self.vals.truncate(self.base);
    }

    fn factor(&mut self) -> Result<(), EngineError> {
        self.ok = false;
        self.no_finito = false;
        #[cfg(feature = "perfil")]
        let t0 = std::time::Instant::now();
        let same = self.sym.is_some()
            && self.key.len() == self.rows.len()
            && self.key.iter().zip(self.rows.iter().zip(&self.cols)).all(|(&(r, c), (&r2, &c2))| r == r2 && c == c2);
        if !same {
            self.rebuild()?;
        }
        self.csc_vals.fill(0.0);
        for (k, &v) in self.vals.iter().enumerate() {
            self.csc_vals[self.slot[k]] += v;
        }
        if self.csc_vals.iter().any(|v| !v.is_finite()) {
            self.no_finito = true;
            return Err(EngineError::Singular { element: None });
        }
        #[cfg(feature = "perfil")]
        let t1 = std::time::Instant::now();
        let a = SparseColMatRef::new(self.sym.as_ref().unwrap().as_ref(), &self.csc_vals);
        self.symbolic
            .as_ref()
            .unwrap()
            .factorize_numeric_lu(&mut self.numeric, a, Par::Seq, MemStack::new(&mut self.fscratch), Default::default())
            .map_err(|_| EngineError::Singular { element: None })?;
        #[cfg(feature = "perfil")]
        {
            let t2 = std::time::Instant::now();
            PERFIL_PRE.fetch_add((t1 - t0).as_nanos() as u64, std::sync::atomic::Ordering::Relaxed);
            PERFIL_NUM.fetch_add((t2 - t1).as_nanos() as u64, std::sync::atomic::Ordering::Relaxed);
        }
        self.ok = true;
        Ok(())
    }

    fn non_finite(&self) -> bool {
        self.no_finito
    }

    fn solve(&self, b: &[f64], x: &mut [f64]) {
        assert!(self.ok, "factor() antes de solve()");
        let mut rhs = self.rhs.borrow_mut();
        for i in 0..self.n {
            rhs[(i, 0)] = b[i];
        }
        let lu = faer::sparse::linalg::lu::LuRef::new_unchecked(self.symbolic.as_ref().unwrap(), &self.numeric);
        lu.solve_in_place_with_conj(Conj::No, rhs.as_mut(), Par::Seq, MemStack::new(&mut self.sscratch.borrow_mut()));
        for i in 0..self.n {
            x[i] = rhs[(i, 0)];
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::transient::SolverKind;
    use crate::{Netlist, Transient};

    #[test]
    fn par_flotante_es_singular() {
        // fuente de 1 mA entre 1 y 2 con solo R entre ellos: sin camino a tierra
        let net = Netlist::from_json(r#"{"nodes":3,"elements":[
            {"type":"I","a":1,"b":2,"amps":0.001},
            {"type":"R","a":1,"b":2,"ohms":1000}]}"#).unwrap();
        let mut s = Transient::with_solver(net, 1e-6, SolverKind::Sparse).unwrap();
        assert!(matches!(s.step().unwrap_err(), crate::EngineError::Singular { .. }));
    }

    #[test]
    fn una_fuente_en_paralelo_con_una_conductancia_enorme_no_es_singular_ni_en_la_densa_ni_en_la_dispersa() {
        // [[G, 1], [1, 0]] con G = 1e12 S: la fuente de voltaje (fila 2) fija x0 = 5 V y su corriente es b0 - G x0. El complemento
        // de Schur vale -1e-12, bien planteado (con el piso absoluto de 1e-13 de antes, G = 1e13 ya se declaraba singular): ninguna de las dos factorizaciones debe declararla singular.
        use crate::dense::DenseLu;
        use crate::mna::{LinearSolver, Stamp};
        let mut d = DenseLu::new(2);
        let mut s = super::SparseLu::new(2);
        for m in [&mut d as &mut dyn LinearSolver, &mut s as &mut dyn LinearSolver] {
            m.clear();
            m.add(0, 0, 1e12);
            m.add(0, 1, 1.0);
            m.add(1, 0, 1.0);
            m.factor().unwrap();
        }
        let (mut xd, mut xs) = ([0.0_f64; 2], [0.0_f64; 2]);
        d.solve(&[0.0, 5.0], &mut xd);
        s.solve(&[0.0, 5.0], &mut xs);
        assert!((xd[0] - 5.0).abs() < 1e-9 && (xs[0] - 5.0).abs() < 1e-9, "{xd:?} {xs:?}");
        assert!((xd[1] - xs[1]).abs() <= 1e-6 * xd[1].abs(), "{xd:?} {xs:?}");
    }

    /// Patrón simétrico de `n` incógnitas con la diagonal y las parejas `(i, j)` dadas.
    fn patron(n: usize, parejas: &[(usize, usize)]) -> faer::sparse::SymbolicSparseColMat<usize> {
        let mut cols: Vec<Vec<usize>> = (0..n).map(|j| vec![j]).collect();
        for &(i, j) in parejas {
            cols[j].push(i);
            cols[i].push(j);
        }
        let mut col_ptr = vec![0];
        let mut row_idx = Vec::new();
        for c in &mut cols {
            c.sort_unstable();
            c.dedup();
            row_idx.extend_from_slice(c);
            col_ptr.push(row_idx.len());
        }
        faer::sparse::SymbolicSparseColMat::new_checked(n, n, col_ptr, None, row_idx)
    }

    #[test]
    fn supernodal_solo_cuando_la_factorizacion_se_llena() {
        // Un circuito real (etapas en cadena con alimentación común) rellena poco: la simplicial es 4 a 40 veces más rápida.
        let mut cadena: Vec<(usize, usize)> = (1..1000).map(|k| (k - 1, k)).collect();
        cadena.extend((2..1000).step_by(4).map(|k| (0, k)));
        assert!(!super::supernodal(patron(1000, &cadena).as_ref()));
        // Conexiones al azar entre 256 incógnitas: la factorización se vuelve casi densa y la supernodal es 6 veces más rápida.
        let mut semilla: u64 = 1;
        let mut azar = |m: usize| {
            semilla = (semilla * 1103515245 + 12345) % 2147483648;
            (semilla as f64 / 2147483648.0 * m as f64) as usize
        };
        // Como el peor caso de las pruebas de tiempo: una cadena de 256 nodos y 768 conexiones más al azar.
        let mut azarosas: Vec<(usize, usize)> = (1..256).map(|k| (k - 1, k)).collect();
        azarosas.extend((0..768).map(|_| (azar(256), azar(256))).filter(|(i, j)| i != j));
        assert!(super::supernodal(patron(256, &azarosas).as_ref()));
    }

    #[test]
    fn el_relleno_se_estima_con_a_mas_a_transpuesta_aunque_el_patron_no_sea_simetrico() {
        // Un patrón guardado solo con su mitad inferior (o solo con la superior) es el mismo circuito: Cholesky con `Side::Upper`
        // leería solo una mitad y vería menos entradas, así que se simetriza antes de estimar.
        let mut semilla: u64 = 7;
        let mut azar = |m: usize| {
            semilla = (semilla * 1103515245 + 12345) % 2147483648;
            (semilla as f64 / 2147483648.0 * m as f64) as usize
        };
        let mut azarosas: Vec<(usize, usize)> = (1..256).map(|k| (k - 1, k)).collect();
        azarosas.extend((0..768).map(|_| (azar(256), azar(256))).filter(|(i, j)| i != j));
        let solo = |inferior: bool| {
            let mut cols: Vec<Vec<usize>> = (0..256).map(|j| vec![j]).collect();
            for &(i, j) in &azarosas {
                let (a, b) = if inferior { (i.max(j), i.min(j)) } else { (i.min(j), i.max(j)) };
                cols[b].push(a);
            }
            let mut col_ptr = vec![0];
            let mut row_idx = Vec::new();
            for c in &mut cols {
                c.sort_unstable();
                c.dedup();
                row_idx.extend_from_slice(c);
                col_ptr.push(row_idx.len());
            }
            faer::sparse::SymbolicSparseColMat::new_checked(256, 256, col_ptr, None, row_idx)
        };
        assert!(super::supernodal(solo(true).as_ref()));
        assert!(super::supernodal(solo(false).as_ref()));
    }

    #[test]
    fn una_malla_que_se_llena_usa_la_supernodal_y_da_lo_mismo_que_la_densa() {
        // 120 nodos con 4 resistencias a otros nodos al azar cada uno (más de 40 incógnitas, factorización casi llena) desde una
        // fuente senoidal con un capacitor y un diodo de carga: la LU dispersa elige la supernodal y debe coincidir con la densa.
        let mut semilla: u64 = 3;
        let mut azar = |m: usize| {
            semilla = (semilla * 1103515245 + 12345) % 2147483648;
            (semilla as f64 / 2147483648.0 * m as f64) as usize
        };
        let n = 120;
        let mut el = vec![r#"{"type":"V","a":1,"b":0,"wave":{"kind":"sine","offset":0,"amp":5,"freq":1000}}"#.to_string()];
        for k in 1..n {
            el.push(format!(r#"{{"type":"R","a":{k},"b":{},"ohms":{}}}"#, k + 1, 100 + 10 * (k % 7)));
        }
        for _ in 0..4 * n {
            let (a, b) = (1 + azar(n), azar(n + 1));
            if a != b {
                el.push(format!(r#"{{"type":"R","a":{a},"b":{b},"ohms":{}}}"#, 1000 + azar(9000)));
            }
        }
        el.push(format!(r#"{{"type":"C","a":{n},"b":0,"farads":1e-6}}"#));
        el.push(format!(r#"{{"type":"D","a":{n},"b":0}}"#));
        let json = format!(r#"{{"nodes":{},"elements":[{}]}}"#, n + 1, el.join(","));
        let net = || Netlist::from_json(&json).unwrap();
        // El patrón de esta malla se llena: la heurística la manda a la supernodal.
        let mut s = Transient::with_solver(net(), 5e-6, SolverKind::Sparse).unwrap();
        let mut d = Transient::with_solver(net(), 5e-6, SolverKind::Dense).unwrap();
        s.advance_to(3e-4, u32::MAX).unwrap();
        d.advance_to(3e-4, u32::MAX).unwrap();
        for k in 0..=n {
            let (a, b) = (s.voltage(k), d.voltage(k));
            assert!((a - b).abs() <= 1e-6 * (1.0 + b.abs()), "nodo {k}: {a} contra {b}");
        }
    }

    #[test]
    fn coincide_con_la_densa_en_el_rectificador() {
        let json = include_str!("../fixtures/rectificador.json");
        let mut d = Transient::with_solver(Netlist::from_json(json).unwrap(), 5e-6, SolverKind::Dense).unwrap();
        let mut s = Transient::with_solver(Netlist::from_json(json).unwrap(), 5e-6, SolverKind::Sparse).unwrap();
        d.advance_to(0.05, u32::MAX).unwrap();
        s.advance_to(0.05, u32::MAX).unwrap();
        let (vd, vs) = (d.voltages(), s.voltages());
        for k in 0..vd.len() {
            assert!((vd[k] - vs[k]).abs() < 1e-9, "nodo {k}");
        }
    }
}
