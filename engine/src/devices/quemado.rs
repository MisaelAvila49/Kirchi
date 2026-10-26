//! Pieza quemada: abierta en todos sus terminales. Estampa 1 GΩ de cada terminal al primero (un interruptor abierto que la LU no ve singular) y un 1 en la diagonal de cada incógnita interna del original, o esas filas quedarían vacías.

use super::{stamp_g, volt, Ctx, Device, Reading, U};

/// Conductancia entre los terminales de una pieza quemada: 1 GΩ.
pub const G_QUEMADO: f64 = 1e-9;

#[derive(Clone)]
pub struct Quemado {
    nodos: Vec<U>,
    internas: Vec<usize>,
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn cuenta_sus_vectores_ademas_de_su_estructura() {
        let q = Quemado::new(vec![Some(1), Some(2), None], vec![4, 5, 6, 7]);
        let b = q.bytes_heap();
        assert!(b >= 3 * std::mem::size_of::<U>() + 4 * std::mem::size_of::<usize>());
        assert!(b + std::mem::size_of_val(&q) > std::mem::size_of_val(&q));
    }
}

impl Quemado {
    /// `nodos`: las incógnitas de sus terminales en el orden de `Element::nodes()`; `internas`: las que pidió el original.
    pub fn new(nodos: Vec<U>, internas: Vec<usize>) -> Self {
        Self { nodos, internas }
    }

    /// Corriente que sale del primer terminal hacia el terminal `k` por su 1 GΩ.
    fn hacia(&self, x: &[f64], k: usize) -> f64 {
        G_QUEMADO * (volt(x, self.nodos[0]) - volt(x, self.nodos[k]))
    }
}

impl Device for Quemado {
    fn bytes_heap(&self) -> usize {
        self.nodos.capacity() * std::mem::size_of::<U>() + self.internas.capacity() * std::mem::size_of::<usize>()
    }

    /// Nunca se enlaza: toma las incógnitas que ya tenía el original.
    fn bind(&mut self, _a: &mut super::Alloc) {}

    fn load(&mut self, c: &mut Ctx) -> bool {
        for k in 1..self.nodos.len() {
            stamp_g(c.m, self.nodos[0], self.nodos[k], G_QUEMADO);
        }
        for &i in &self.internas {
            c.m.add(i, i, 1.0);
        }
        false
    }

    fn linear(&self) -> bool {
        true
    }

    fn tiene_dinamica(&self) -> bool {
        false
    }

    /// No redefine `accept`: el motor no se lo pide.
    fn usa_accept(&self) -> bool {
        false
    }

    /// La corriente que entra por el primer terminal y sale por los demás (casi nada).
    fn reading(&self, x: &[f64], _s0: &[f64]) -> Reading {
        Reading { i: (1..self.nodos.len()).map(|k| self.hacia(x, k)).sum(), ..Reading::default() }
    }

    fn corrientes_propias(&self) -> bool {
        true
    }

    fn corrientes(&self, x: &[f64], _s0: &[f64], _r: &Reading, out: &mut [f64]) {
        let n = self.nodos.len();
        out[0] = 0.0;
        for k in 1..n {
            let i = self.hacia(x, k);
            out[0] += i;
            out[k] = -i;
        }
        out[n] = 0.0;
    }
}
