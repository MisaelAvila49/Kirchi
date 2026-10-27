//! Combinacional por tabla de verdad con rebanadas: las entradas comunes y las de cada rebanada eligen una fila de la tabla
//! compartida y cada salida de la rebanada toma sus dos bits (0, 1, Z, X). Con ella un chip combinacional es un dato.

use std::sync::Arc;

use super::modelos::ModeloDigital;
use super::{a_ps, Nivel, Ps};
use crate::netlist::Rebanada;

/// Entradas en X por rebanada que se enumeran (2^8 combinaciones); con más, las salidas de esa rebanada quedan en X.
const X_MAX: usize = 8;

#[derive(Clone)]
pub struct Lut {
    /// Comunes y, a continuación, las entradas de cada rebanada.
    ent: Vec<u32>,
    /// Las salidas de cada rebanada, una detrás de otra.
    sal: Vec<u32>,
    comunes: usize,
    entradas: usize,
    salidas: usize,
    tabla: Arc<[u64]>,
    /// Retardo `[subida, bajada]` por salida de rebanada (el mismo en todas las rebanadas).
    retardos: Vec<[Ps; 2]>,
    abierta: Vec<bool>,
    tres: bool,
    z: Nivel,
}

impl Lut {
    /// `tres` dice si alguna salida puede quedar en Z (lo calcula `Element::tres_estados`). El primer dato del índice es el
    /// bit más significativo, como se lee una fila de la hoja.
    pub fn new(comunes: &[usize], rebanadas: &[Rebanada], tabla: Arc<[u64]>, retardos: &[[f64; 2]], abierta: &[bool], tres: bool, z: Nivel) -> Self {
        let r = |v: &[usize]| v.iter().map(|&k| k as u32).collect::<Vec<u32>>();
        let mut ent = r(comunes);
        let mut sal = Vec::new();
        for reb in rebanadas {
            ent.extend(r(&reb.entradas));
            sal.extend(r(&reb.salidas));
        }
        let ns = rebanadas.first().map_or(0, |b| b.salidas.len());
        Self {
            ent,
            sal,
            comunes: comunes.len(),
            entradas: rebanadas.first().map_or(0, |b| b.entradas.len()),
            salidas: ns,
            tabla,
            retardos: retardos.iter().map(|d| [a_ps(d[0]).max(1), a_ps(d[1]).max(1)]).collect(),
            abierta: if abierta.is_empty() { vec![false; ns] } else { abierta.to_vec() },
            tres,
            z,
        }
    }

    /// Los niveles de salida de la rebanada `k` con las entradas `e`: una X en las entradas se enumera en 0 y en 1, y la
    /// salida solo vale algo si todas las combinaciones coinciden.
    fn rebanada(&self, k: usize, e: &[Nivel], fuera: &mut [Nivel]) {
        let ini = self.comunes + k * self.entradas;
        let bits = e[..self.comunes].iter().chain(&e[ini..ini + self.entradas]);
        let (mut base, mut inciertos) = (0usize, [0usize; X_MAX]);
        let (mut n, mut de_mas) = (0, false);
        let total = self.comunes + self.entradas;
        for (p, b) in bits.enumerate() {
            let peso = total - 1 - p;
            match b {
                Nivel::Uno => base |= 1 << peso,
                Nivel::Cero => {}
                _ if n < X_MAX => {
                    inciertos[n] = peso;
                    n += 1;
                }
                _ => de_mas = true,
            }
        }
        if de_mas {
            fuera[..self.salidas].fill(Nivel::X);
            return;
        }
        // Qué valores vio cada salida entre las combinaciones (un bit por valor de la tabla).
        let mut vistos = [0u8; 32];
        for c in 0..1usize << n {
            let mut i = base;
            for (j, &peso) in inciertos[..n].iter().enumerate() {
                if c >> j & 1 == 1 {
                    i |= 1 << peso;
                }
            }
            let fila = self.tabla[i];
            for (j, v) in vistos[..self.salidas].iter_mut().enumerate() {
                *v |= 1 << (fila >> (2 * j) & 3);
            }
        }
        for (j, &v) in vistos[..self.salidas].iter().enumerate() {
            let nivel = match v {
                1 => Nivel::Cero,
                2 => Nivel::Uno,
                4 => Nivel::Z,
                _ => Nivel::X,
            };
            fuera[j] = if self.abierta[j] && nivel == Nivel::Uno { Nivel::Z } else { nivel };
        }
    }

    /// Retardo de una salida: la de subida si pasa a Z o sale de Z, como `d_tristate`.
    fn retardo(&self, j: usize, antes: Nivel, despues: Nivel) -> Ps {
        let [subida, bajada] = self.retardos[j];
        if antes == Nivel::Z || despues == Nivel::Z {
            subida
        } else {
            super::nivel::retardo(antes, despues, subida, bajada)
        }
    }
}

impl ModeloDigital for Lut {
    fn bytes_heap(&self) -> usize {
        // La tabla es compartida: solo cuenta lo propio.
        self.ent.capacity() * 4 + self.sal.capacity() * 4 + self.retardos.capacity() * std::mem::size_of::<[Ps; 2]>() + self.abierta.capacity()
    }
    fn entradas(&self) -> &[u32] {
        &self.ent
    }
    fn salidas(&self) -> &[u32] {
        &self.sal
    }
    fn tres_estados(&self) -> bool {
        self.tres
    }
    fn z_como(&self) -> Nivel {
        self.z
    }
    fn iniciar(&mut self, e: &[Nivel], s: &mut [Nivel]) {
        for k in 0..self.sal.len() / self.salidas.max(1) {
            self.rebanada(k, e, &mut s[k * self.salidas..]);
        }
    }
    fn evaluar(&mut self, _ahora: Ps, e: &[Nivel], a: &[Nivel], out: &mut Vec<(usize, Nivel, Ps)>) {
        let mut nivel = [Nivel::X; 32];
        for k in 0..self.sal.len() / self.salidas.max(1) {
            self.rebanada(k, e, &mut nivel);
            for j in 0..self.salidas {
                let s = k * self.salidas + j;
                out.push((s, nivel[j], self.retardo(j, a[s], nivel[j])));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::modelos::{Compuerta, Funcion};
    use super::Nivel::{Cero, Uno, X, Z};
    use super::*;

    const TODOS: [Nivel; 4] = [Cero, Uno, X, Z];

    fn dos_bits(n: Nivel) -> u64 {
        match n {
            Cero => 0,
            Uno => 1,
            Z => 2,
            X => 3,
        }
    }

    fn reb(entradas: &[usize], salidas: &[usize]) -> Rebanada {
        Rebanada { entradas: entradas.to_vec(), salidas: salidas.to_vec() }
    }

    /// La salida de una evaluación con las entradas `e` (ya leídas, sin Z para una familia CMOS).
    fn evaluar(m: &mut dyn ModeloDigital, e: &[Nivel], antes: &[Nivel]) -> Vec<(usize, Nivel, Ps)> {
        let leidas: Vec<Nivel> = e.iter().map(|n| n.leida(m.z_como())).collect();
        let mut out = Vec::new();
        m.evaluar(0, &leidas, antes, &mut out);
        out
    }

    #[test]
    fn una_nand_como_tabla_da_lo_mismo_que_la_compuerta_en_las_16_combinaciones() {
        let tabla: Arc<[u64]> = Arc::from(vec![1, 1, 1, 0]);
        for z in [X, Uno] {
            let mut lut = Lut::new(&[], &[reb(&[0, 1], &[2])], tabla.clone(), &[[5e-9, 7e-9]], &[], false, z);
            let mut nand = Compuerta { f: Funcion::Nand, ent: vec![0, 1], sal: [2], subida: 5000, bajada: 7000, z, hab: None };
            for a in TODOS {
                for b in TODOS {
                    // Una NAND nunca da Z: la salida anterior es uno de los otros tres (el retardo de Z es aparte).
                    for antes in [Cero, Uno, X] {
                        assert_eq!(evaluar(&mut lut, &[a, b], &[antes]), evaluar(&mut nand, &[a, b], &[antes]), "{a:?} {b:?} desde {antes:?} con z = {z:?}");
                    }
                }
            }
        }
    }

    /// Multiplexor de 8 a 1: comunes S2 S1 S0 (la primera es el bit más significativo), una rebanada con D0 a D7.
    fn mux8() -> Lut {
        let filas: Vec<u64> = (0..2048usize).map(|i| (i >> (7 - (i >> 8))) as u64 & 1).collect();
        Lut::new(&[0, 1, 2], &[reb(&[3, 4, 5, 6, 7, 8, 9, 10], &[11])], Arc::from(filas), &[[1e-9, 1e-9]], &[], false, X)
    }

    fn seleccion(s: usize, d: [Nivel; 8]) -> Vec<Nivel> {
        let mut e = vec![de_bool(s & 4 != 0), de_bool(s & 2 != 0), de_bool(s & 1 != 0)];
        e.extend(d);
        e
    }

    fn de_bool(b: bool) -> Nivel {
        Nivel::de_bool(b)
    }

    #[test]
    fn un_multiplexor_ignora_las_x_que_no_elige_y_da_x_si_la_seleccion_es_incierta() {
        let mut m = mux8();
        // Tres entradas en X que no son la elegida: el dato sale limpio.
        let e = seleccion(5, [X, Cero, X, Cero, Cero, Uno, X, Cero]);
        assert_eq!(evaluar(&mut m, &e, &[Z])[0].1, Uno);
        // Una X en S0 (elige D4 o D5 = 0 y 1): X. Con D4 = D5 = 1 el dato sale aunque no se sepa cuál.
        let mut e = seleccion(4, [Cero, Cero, Cero, Cero, Cero, Uno, Cero, Cero]);
        e[2] = X;
        assert_eq!(evaluar(&mut m, &e, &[Z])[0].1, X);
        let mut e = seleccion(4, [Cero, Cero, Cero, Cero, Uno, Uno, Cero, Cero]);
        e[2] = X;
        assert_eq!(evaluar(&mut m, &e, &[Z])[0].1, Uno);
    }

    #[test]
    fn se_enumeran_hasta_ocho_entradas_en_x_y_con_mas_las_salidas_quedan_en_x() {
        // Nueve entradas y una tabla que siempre da 1: con ocho en X se enumera y sale 1, con nueve no se intenta.
        let mut m = Lut::new(&[], &[reb(&(0..9).collect::<Vec<_>>(), &[9])], Arc::from(vec![1u64; 512]), &[[1e-9, 1e-9]], &[], false, X);
        let mut e = vec![X; 9];
        e[8] = Cero;
        assert_eq!(evaluar(&mut m, &e, &[Z])[0].1, Uno);
        assert_eq!(evaluar(&mut m, &[X; 9], &[Z])[0].1, X);
    }

    #[test]
    fn las_rebanadas_comparten_los_comunes_y_cada_una_usa_sus_entradas() {
        // 2 a 1 doble: S común, y por rebanada A, B → Y (Y = S ? B : A).
        let filas: Vec<u64> = (0..8usize).map(|i| if i >> 2 & 1 == 1 { i as u64 & 1 } else { (i >> 1) as u64 & 1 }).collect();
        let mut m = Lut::new(&[0], &[reb(&[1, 2], &[5]), reb(&[3, 4], &[6])], Arc::from(filas), &[[1e-9, 2e-9]], &[], false, X);
        assert_eq!(m.entradas(), &[0, 1, 2, 3, 4]);
        assert_eq!(m.salidas(), &[5, 6]);
        let o = evaluar(&mut m, &[Uno, Uno, Cero, Cero, Uno], &[Z, Z]);
        assert_eq!((o[0].0, o[0].1, o[1].0, o[1].1), (0, Cero, 1, Uno));
        let o = evaluar(&mut m, &[Cero, Uno, Cero, Cero, Uno], &[Z, Z]);
        assert_eq!((o[0].1, o[1].1), (Uno, Cero));
    }

    #[test]
    fn z_de_la_tabla_y_colector_abierto() {
        // Una entrada de habilitación: 0 → Z, 1 → 1 en la salida 0; la salida 1 repite la habilitación (0 → 0, 1 → 1) con
        // colector abierto.
        let filas = vec![2 | (0 << 2), 1 | (1 << 2)];
        let mut m = Lut::new(&[], &[reb(&[0], &[1, 2])], Arc::from(filas), &[[3e-9, 4e-9], [5e-9, 6e-9]], &[false, true], true, X);
        assert!(m.tres_estados());
        let o = evaluar(&mut m, &[Cero], &[Uno, Uno]);
        // Pasar a Z usa el retardo de subida; el cero abierto sigue siendo cero con el de bajada.
        assert_eq!((o[0].1, o[0].2, o[1].1, o[1].2), (Z, 3000, Cero, 6000));
        let o = evaluar(&mut m, &[Uno], &[Z, Cero]);
        // Salir de Z también usa el de subida; el uno abierto es Z con el de subida.
        assert_eq!((o[0].1, o[0].2, o[1].1, o[1].2), (Uno, 3000, Z, 5000));
    }

    #[test]
    fn una_x_en_la_tabla_sale_x_y_cada_salida_tiene_su_retardo() {
        let filas = vec![dos_bits(Cero) | dos_bits(X) << 2, dos_bits(Uno) | dos_bits(Uno) << 2];
        let mut m = Lut::new(&[], &[reb(&[0], &[1, 2])], Arc::from(filas), &[[3e-9, 7e-9], [5e-9, 11e-9]], &[], false, X);
        assert!(!m.tres_estados());
        let o = evaluar(&mut m, &[Cero], &[Uno, Uno]);
        assert_eq!((o[0].1, o[0].2, o[1].1, o[1].2), (Cero, 7000, X, 11000));
        let o = evaluar(&mut m, &[Uno], &[Cero, Cero]);
        assert_eq!((o[0].1, o[0].2, o[1].1, o[1].2), (Uno, 3000, Uno, 5000));
    }

    #[test]
    fn la_tabla_compartida_no_cuenta_en_la_memoria_propia() {
        let tabla: Arc<[u64]> = Arc::from(vec![0u64; 1 << 14]);
        let m = Lut::new(&[], &[reb(&(0..14).collect::<Vec<_>>(), &[14])], tabla.clone(), &[[1e-9, 1e-9]], &[], false, X);
        assert!(m.bytes_heap() < 1024, "{}", m.bytes_heap());
        assert_eq!(Arc::strong_count(&tabla), 2);
    }

    #[test]
    fn el_arranque_da_la_funcion_con_las_entradas_de_inicio() {
        let mut m = Lut::new(&[], &[reb(&[0, 1], &[2])], Arc::from(vec![1, 1, 1, 0]), &[[1e-9, 1e-9]], &[], false, X);
        let mut s = [Z];
        m.iniciar(&[Uno, Uno], &mut s);
        assert_eq!(s, [Cero]);
    }
}
