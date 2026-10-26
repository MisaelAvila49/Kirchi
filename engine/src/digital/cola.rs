//! Cola de eventos de la lógica: un evento es un nivel nuevo para una salida en un instante. Los de un mismo instante
//! salen en el orden en que se programaron. Cada evento lleva la versión de su salida: si la salida se reprogramó
//! después (retardo inercial), el evento viejo ya no vale y el simulador lo descarta al sacarlo.

use std::cmp::Reverse;
use std::collections::BinaryHeap;

use super::{Nivel, Ps};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Evento {
    pub t: Ps,
    pub salida: u32,
    pub version: u32,
    pub nivel: Nivel,
}

fn codigo(n: Nivel) -> u8 {
    match n {
        Nivel::Cero => 0,
        Nivel::Uno => 1,
        Nivel::X => 2,
        Nivel::Z => 3,
    }
}

fn nivel(c: u8) -> Nivel {
    match c {
        0 => Nivel::Cero,
        1 => Nivel::Uno,
        2 => Nivel::X,
        _ => Nivel::Z,
    }
}

#[derive(Default, Clone)]
pub struct Cola {
    /// (instante, orden de llegada, salida, versión, nivel): el montón de mínimos ordena por instante y luego por llegada.
    monton: BinaryHeap<Reverse<(Ps, u64, u32, u32, u8)>>,
    orden: u64,
}

impl Cola {
    /// Bytes que ocupan sus eventos.
    pub fn bytes(&self) -> usize {
        self.monton.len() * std::mem::size_of::<Reverse<(Ps, u64, u32, u32, u8)>>()
    }

    pub fn programar(&mut self, e: Evento) {
        self.monton.push(Reverse((e.t, self.orden, e.salida, e.version, codigo(e.nivel))));
        self.orden += 1;
    }

    /// Instante del evento más próximo (puede ser uno vencido por versión; el simulador lo descarta al sacarlo).
    pub fn siguiente(&self) -> Option<Ps> {
        self.monton.peek().map(|Reverse(e)| e.0)
    }

    /// Saca el evento más próximo si es del instante `t`.
    pub fn sacar_en(&mut self, t: Ps) -> Option<Evento> {
        match self.monton.peek() {
            Some(Reverse(e)) if e.0 == t => {}
            _ => return None,
        }
        let Reverse((t, _, salida, version, n)) = self.monton.pop()?;
        Some(Evento { t, salida, version, nivel: nivel(n) })
    }

    /// Instante y salida del evento más próximo (puede ser uno vencido por versión).
    pub fn cabeza(&self) -> Option<(Ps, u32)> {
        self.monton.peek().map(|Reverse(e)| (e.0, e.2))
    }

    /// Salida y versión del evento más próximo.
    pub fn version_de_cabeza(&self) -> Option<(u32, u32)> {
        self.monton.peek().map(|Reverse(e)| (e.2, e.3))
    }

    /// Quita el evento más próximo (el simulador lo hace con los que ya no valen).
    pub fn descartar_cabeza(&mut self) {
        self.monton.pop();
    }

    pub fn len(&self) -> usize {
        self.monton.len()
    }

    pub fn is_empty(&self) -> bool {
        self.monton.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn por_instante_y_en_orden_de_llegada() {
        let mut c = Cola::default();
        let e = |t, salida| Evento { t, salida, version: 0, nivel: Nivel::Uno };
        c.programar(e(20, 1));
        c.programar(e(10, 2));
        c.programar(e(10, 3));
        assert_eq!(c.siguiente(), Some(10));
        assert_eq!(c.sacar_en(20), None);
        assert_eq!(c.sacar_en(10).unwrap().salida, 2);
        assert_eq!(c.sacar_en(10).unwrap().salida, 3);
        assert_eq!(c.sacar_en(10), None);
        assert_eq!(c.siguiente(), Some(20));
        assert_eq!(c.sacar_en(20).unwrap(), Evento { t: 20, salida: 1, version: 0, nivel: Nivel::Uno });
        assert!(c.is_empty());
    }
}
