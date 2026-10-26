//! Valores lógicos de cuatro estados. Las funciones de las compuertas reciben las entradas ya leídas (`leida`), así que
//! nunca ven Z: en CMOS una entrada en Z se lee X y en 74LS se lee 1, como el chip real.

use super::Ps;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Nivel {
    Cero,
    Uno,
    /// Indeterminado: una entrada entre VIL y VIH, una salida en conflicto, un biestable sin definir.
    X,
    /// Alta impedancia: nadie maneja la red.
    Z,
}

impl Nivel {
    /// Código de la memoria compartida y de las lecturas: 0, 1, 2 (X) y 3 (Z).
    pub fn codigo(self) -> f64 {
        match self {
            Nivel::Cero => 0.0,
            Nivel::Uno => 1.0,
            Nivel::X => 2.0,
            Nivel::Z => 3.0,
        }
    }

    pub fn de_bool(b: bool) -> Nivel {
        if b { Nivel::Uno } else { Nivel::Cero }
    }

    /// El nivel que lee una entrada: Z se lee como `z_como` (X en CMOS, 1 en 74LS).
    pub fn leida(self, z_como: Nivel) -> Nivel {
        if self == Nivel::Z { z_como } else { self }
    }

    pub fn no(self) -> Nivel {
        match self {
            Nivel::Cero => Nivel::Uno,
            Nivel::Uno => Nivel::Cero,
            _ => Nivel::X,
        }
    }

    /// Y lógica: un 0 decide aunque la otra entrada sea X.
    pub fn y(self, o: Nivel) -> Nivel {
        if self == Nivel::Cero || o == Nivel::Cero {
            Nivel::Cero
        } else if self == Nivel::Uno && o == Nivel::Uno {
            Nivel::Uno
        } else {
            Nivel::X
        }
    }

    /// O lógica: un 1 decide aunque la otra entrada sea X.
    pub fn o(self, o: Nivel) -> Nivel {
        if self == Nivel::Uno || o == Nivel::Uno {
            Nivel::Uno
        } else if self == Nivel::Cero && o == Nivel::Cero {
            Nivel::Cero
        } else {
            Nivel::X
        }
    }

    /// O exclusiva: con una entrada X no se sabe.
    pub fn ox(self, o: Nivel) -> Nivel {
        match (self, o) {
            (Nivel::Cero, Nivel::Cero) | (Nivel::Uno, Nivel::Uno) => Nivel::Cero,
            (Nivel::Cero, Nivel::Uno) | (Nivel::Uno, Nivel::Cero) => Nivel::Uno,
            _ => Nivel::X,
        }
    }
}

/// Retardo de una salida que pasa de `antes` a `despues`, como en XSPICE: hacia 1 el de subida y hacia 0 el de bajada; hacia
/// X, el de bajada si estaba en 1 y el de subida si no (medido en ngspice 47 con una NAND de 3 y 7 ns, tarea 1).
pub fn retardo(antes: Nivel, despues: Nivel, subida: Ps, bajada: Ps) -> Ps {
    match despues {
        Nivel::Uno => subida,
        Nivel::Cero => bajada,
        _ => {
            if antes == Nivel::Uno {
                bajada
            } else {
                subida
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Nivel::{self, Cero, Uno, X, Z};
    use super::*;

    const TODOS: [Nivel; 4] = [Cero, Uno, X, Z];

    /// Las 16 combinaciones de una función de dos entradas con Z leída como `z`.
    fn tabla(f: fn(Nivel, Nivel) -> Nivel, z: Nivel) -> [[Nivel; 4]; 4] {
        let mut t = [[Cero; 4]; 4];
        for (i, a) in TODOS.iter().enumerate() {
            for (j, b) in TODOS.iter().enumerate() {
                t[i][j] = f(a.leida(z), b.leida(z));
            }
        }
        t
    }

    #[test]
    fn tablas_de_verdad_completas_en_cmos() {
        // Renglón: la primera entrada en 0, 1, X y Z; columna: la segunda. Z se lee como X.
        assert_eq!(tabla(Nivel::y, X), [[Cero, Cero, Cero, Cero], [Cero, Uno, X, X], [Cero, X, X, X], [Cero, X, X, X]]);
        assert_eq!(tabla(Nivel::o, X), [[Cero, Uno, X, X], [Uno, Uno, Uno, Uno], [X, Uno, X, X], [X, Uno, X, X]]);
        assert_eq!(tabla(Nivel::ox, X), [[Cero, Uno, X, X], [Uno, Cero, X, X], [X, X, X, X], [X, X, X, X]]);
        assert_eq!(tabla(|a, b| a.y(b).no(), X), [[Uno, Uno, Uno, Uno], [Uno, Cero, X, X], [Uno, X, X, X], [Uno, X, X, X]]);
        assert_eq!(tabla(|a, b| a.o(b).no(), X), [[Uno, Cero, X, X], [Cero, Cero, Cero, Cero], [X, Cero, X, X], [X, Cero, X, X]]);
        assert_eq!(TODOS.map(|a| a.leida(X).no()), [Uno, Cero, X, X]);
    }

    #[test]
    fn en_74ls_una_entrada_al_aire_se_lee_uno() {
        assert_eq!(tabla(Nivel::y, Uno)[3], [Cero, Uno, X, Uno]);
        assert_eq!(Z.leida(Uno).no(), Cero);
    }

    #[test]
    fn retardos_como_xspice() {
        assert_eq!(retardo(Cero, Uno, 3, 7), 3);
        assert_eq!(retardo(Uno, Cero, 3, 7), 7);
        assert_eq!(retardo(Uno, X, 3, 7), 7);
        assert_eq!(retardo(Cero, X, 3, 7), 3);
        assert_eq!(retardo(X, Uno, 3, 7), 3);
        assert_eq!(retardo(X, Cero, 3, 7), 7);
    }

    #[test]
    fn codigos() {
        assert_eq!(TODOS.map(Nivel::codigo), [0.0, 1.0, 2.0, 3.0]);
    }
}
