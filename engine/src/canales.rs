//! Canales de valor: números reales que mueve el exterior (una perilla, un emulador) y que leen los elementos `EXT`. Cada canal
//! guarda su valor vigente y una cola ordenada de cambios futuros `(t, valor)`.

use std::collections::VecDeque;

use crate::error::EngineError;
use crate::netlist::{CanalDef, FormaCanal};

/// Cambios pendientes que admite un canal.
pub const MAX_COLA: usize = 4096;

#[derive(Clone, Debug)]
struct Canal {
    forma: FormaCanal,
    /// Último cambio aplicado: desde él se interpola la rampa que lleva al primero de la cola.
    ancla: (f64, f64),
    /// Si `ancla` es un cambio escrito (y no el valor inicial).
    cambiado: bool,
    cola: VecDeque<(f64, f64)>,
}

/// Los canales de una isla (solo los que lee) o de todo el circuito.
#[derive(Clone, Debug, Default)]
pub struct Canales {
    /// Cuántos canales tiene la netlist, para validar índices.
    total: usize,
    /// Los canales que se guardan, ordenados, y su estado en el mismo orden.
    ids: Vec<usize>,
    canales: Vec<Canal>,
}

impl Canales {
    /// Solo los canales `usados` guardan estado: una isla que no lee ninguno queda con la estructura vacía.
    pub fn nuevo(defs: &[CanalDef], usados: &[usize]) -> Self {
        let mut ids: Vec<usize> = usados.iter().copied().filter(|&c| c < defs.len()).collect();
        ids.sort_unstable();
        ids.dedup();
        let canales = ids.iter().map(|&c| Canal { forma: defs[c].forma, ancla: (0.0, defs[c].inicial), cambiado: false, cola: VecDeque::new() }).collect();
        Self { total: defs.len(), ids, canales }
    }

    /// Todos los canales de la netlist.
    pub fn todos(defs: &[CanalDef]) -> Self {
        let usados: Vec<usize> = (0..defs.len()).collect();
        Self::nuevo(defs, &usados)
    }

    pub fn total(&self) -> usize {
        self.total
    }

    pub fn vacio(&self) -> bool {
        self.ids.is_empty()
    }

    fn pos(&self, c: usize) -> Option<usize> {
        self.ids.binary_search(&c).ok()
    }

    pub fn tiene(&self, c: usize) -> bool {
        self.pos(c).is_some()
    }

    /// La cola del canal ya no admite otro cambio.
    pub fn lleno(&self, c: usize) -> bool {
        self.pos(c).is_some_and(|p| self.canales[p].cola.len() >= MAX_COLA)
    }

    /// Encola el cambio a `valor` en `t`. Un `t` anterior al último cambio encolado se lleva a ese (la cola sigue ordenada).
    /// `ahora` es el tiempo de quien lo guarda: con la cola vacía, la rampa parte de ahí y no de un cambio viejo.
    pub fn poner(&mut self, c: usize, t: f64, valor: f64, ahora: f64) -> Result<(), EngineError> {
        let Some(p) = self.pos(c) else { return Ok(()) };
        let ch = &mut self.canales[p];
        if ch.cola.len() >= MAX_COLA {
            return Err(EngineError::Invalid(format!("canal {c}: la cola de cambios está llena ({MAX_COLA})")));
        }
        if ch.cola.is_empty() {
            ch.ancla.0 = ch.ancla.0.max(ahora);
        }
        let ultimo = ch.cola.back().map_or(ch.ancla.0, |u| u.0);
        ch.cola.push_back((t.max(ultimo), valor));
        Ok(())
    }

    /// El valor para un paso que termina en `fin` y cuyo punto medio es `medio`: el tramo lo decide el punto medio (un paso que
    /// termina en un cambio todavía usa el valor de antes) y la rampa se lee al final del paso.
    pub fn valor(&self, c: usize, medio: f64, fin: f64) -> f64 {
        let Some(p) = self.pos(c) else { return f64::NAN };
        let ch = &self.canales[p];
        let mut ancla = ch.ancla;
        let mut siguiente = None;
        for &q in &ch.cola {
            if q.0 <= medio {
                ancla = q;
            } else {
                siguiente = Some(q);
                break;
            }
        }
        match (ch.forma, siguiente) {
            (FormaCanal::Rampa, Some((tn, vn))) => {
                let dt = tn - ancla.0;
                if dt <= 0.0 { vn } else { ancla.1 + (vn - ancla.1) * ((fin - ancla.0) / dt).clamp(0.0, 1.0) }
            }
            _ => ancla.1,
        }
    }

    /// El primer cambio después de `t` (más `eps`) de cualquier canal; infinito si no hay.
    pub fn proximo(&self, t: f64, eps: f64) -> f64 {
        let mut m = f64::INFINITY;
        for ch in &self.canales {
            if let Some(q) = ch.cola.iter().find(|q| q.0 > t + eps) {
                m = m.min(q.0);
            }
        }
        m
    }

    /// Hay cambios pendientes después de `t`.
    pub fn pendientes(&self, t: f64, eps: f64) -> bool {
        self.proximo(t, eps).is_finite()
    }

    /// Pasa a ser el valor vigente todo cambio hasta `t`.
    pub fn compactar(&mut self, t: f64, eps: f64) {
        for ch in &mut self.canales {
            while ch.cola.front().is_some_and(|q| q.0 <= t + eps) {
                ch.ancla = ch.cola.pop_front().unwrap();
                ch.cambiado = true;
            }
        }
    }

    /// Algún canal cambió en `t` (ya aplicado o en cola).
    pub fn hay_cambio_en(&self, t: f64, eps: f64) -> bool {
        self.canales.iter().any(|ch| (ch.cambiado && (ch.ancla.0 - t).abs() <= eps) || ch.cola.iter().any(|q| (q.0 - t).abs() <= eps))
    }

    /// Bytes que ocupa (para el tope de memoria de Retroceder).
    pub fn bytes(&self) -> usize {
        self.canales.iter().map(|c| std::mem::size_of::<Canal>() + c.cola.len() * std::mem::size_of::<(f64, f64)>()).sum::<usize>()
            + self.ids.len() * std::mem::size_of::<usize>()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn defs(formas: &[FormaCanal]) -> Vec<CanalDef> {
        formas.iter().map(|&forma| CanalDef { inicial: 1.0, forma }).collect()
    }

    #[test]
    fn el_escalon_salta_en_el_cambio_y_el_paso_que_lo_termina_usa_el_valor_de_antes() {
        let mut c = Canales::todos(&defs(&[FormaCanal::Escalon]));
        c.poner(0, 1.0, 5.0, 0.0).unwrap();
        assert_eq!(c.valor(0, 0.4, 0.5), 1.0);
        // Paso (0.5, 1.0): su punto medio queda antes del cambio.
        assert_eq!(c.valor(0, 0.75, 1.0), 1.0);
        // Paso (1.0, 1.5): el valor nuevo.
        assert_eq!(c.valor(0, 1.25, 1.5), 5.0);
    }

    #[test]
    fn la_rampa_va_en_linea_recta_desde_el_valor_inicial_hasta_el_cambio() {
        let mut c = Canales::todos(&defs(&[FormaCanal::Rampa]));
        c.poner(0, 2.0, 5.0, 0.0).unwrap();
        assert!((c.valor(0, 0.4, 0.5) - 2.0).abs() < 1e-12);
        assert!((c.valor(0, 1.5, 2.0) - 5.0).abs() < 1e-12);
        c.compactar(2.0, 1e-12);
        assert_eq!(c.valor(0, 3.0, 3.5), 5.0);
        // Un segundo cambio parte del primero.
        c.poner(0, 4.0, 9.0, 2.0).unwrap();
        assert!((c.valor(0, 2.9, 3.0) - 7.0).abs() < 1e-12);
    }

    #[test]
    fn la_rampa_de_un_canal_quieto_parte_de_ahora() {
        let mut c = Canales::todos(&defs(&[FormaCanal::Rampa]));
        c.poner(0, 4.0, 5.0, 2.0).unwrap();
        assert_eq!(c.valor(0, 1.0, 1.5), 1.0);
        assert!((c.valor(0, 2.9, 3.0) - 3.0).abs() < 1e-12);
    }

    #[test]
    fn un_cambio_anterior_al_ultimo_encolado_se_lleva_a_ese() {
        let mut c = Canales::todos(&defs(&[FormaCanal::Escalon]));
        c.poner(0, 2.0, 5.0, 0.0).unwrap();
        c.poner(0, 1.0, 7.0, 0.0).unwrap();
        assert_eq!(c.proximo(0.0, 1e-12), 2.0);
        c.compactar(2.0, 1e-12);
        assert_eq!(c.valor(0, 2.5, 3.0), 7.0);
    }

    #[test]
    fn la_cola_tiene_tope_y_los_canales_no_usados_no_guardan_estado() {
        let mut c = Canales::todos(&defs(&[FormaCanal::Escalon]));
        for k in 0..MAX_COLA {
            c.poner(0, k as f64, 0.0, 0.0).unwrap();
        }
        assert!(c.lleno(0));
        assert!(c.poner(0, 1e9, 0.0, 0.0).is_err());
        let vacio = Canales::nuevo(&defs(&[FormaCanal::Escalon, FormaCanal::Rampa]), &[]);
        assert!(vacio.vacio() && vacio.bytes() == 0 && vacio.proximo(0.0, 0.0).is_infinite());
        assert_eq!(vacio.total(), 2);
    }

    #[test]
    fn un_cambio_ya_aplicado_o_en_cola_cuenta_como_cambio_en_su_instante() {
        let mut c = Canales::todos(&defs(&[FormaCanal::Escalon]));
        assert!(!c.hay_cambio_en(0.0, 1e-12));
        c.poner(0, 1.0, 2.0, 0.0).unwrap();
        assert!(c.hay_cambio_en(1.0, 1e-12) && !c.hay_cambio_en(0.5, 1e-12));
        c.compactar(1.0, 1e-12);
        assert!(c.hay_cambio_en(1.0, 1e-12));
    }
}
