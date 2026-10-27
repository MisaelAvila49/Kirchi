//! Núcleo de contador: binario o módulo n, con uno o dos relojes, sentido, habilitaciones, borrado y carga paralela
//! síncronos o asíncronos. El 161, 163, 190, 193 y 4017 son configuraciones suyas.

use super::{asincronos, borrado, cargado, flanco, nivel_activo, nivel_reloj, activa, todas_activas, Orden, Reg};
use crate::digital::Nivel;
use crate::netlist::{Accion, Carga, Reloj, Senal};

#[derive(Clone)]
pub(crate) struct Contador {
    bits: u8,
    modulo: u32,
    reloj: Reloj,
    abajo: Option<Reloj>,
    sentido: Option<Senal>,
    habilita: Vec<Senal>,
    borra: Option<Accion>,
    carga: Option<Carga>,
    pub reg: Reg,
    /// Nivel anterior de cada reloj efectivo, para reconocer el flanco.
    clk: Nivel,
    clk_abajo: Nivel,
}

impl Contador {
    #[allow(clippy::too_many_arguments)]
    pub fn new(bits: u8, modulo: u32, reloj: Reloj, abajo: Option<Reloj>, sentido: Option<Senal>, habilita: Vec<Senal>, borra: Option<Accion>, carga: Option<Carga>) -> Self {
        Self { bits, modulo, reloj, abajo, sentido, habilita, borra, carga, reg: Reg::default(), clk: Nivel::X, clk_abajo: Nivel::X }
    }

    pub fn bytes_heap(&self) -> usize {
        let s = std::mem::size_of::<Senal>();
        (self.reloj.senales.capacity() + self.abajo.as_ref().map_or(0, |r| r.senales.capacity()) + self.habilita.capacity()) * s
            + self.carga.as_ref().map_or(0, |c| c.datos.capacity() * std::mem::size_of::<usize>())
    }

    /// Arranque: el reloj de ahora no es un flanco y los controles asíncronos mandan.
    pub fn iniciar(&mut self, e: &[Nivel]) {
        self.clk = nivel_reloj(e, &self.reloj);
        self.clk_abajo = self.abajo.as_ref().map_or(Nivel::X, |r| nivel_reloj(e, r));
        match asincronos(e, &self.borra, &self.carga) {
            Some((r, true)) => self.reg = r,
            Some((r, false)) => self.reg = self.reg.mezcla(r),
            None => {}
        }
    }

    pub fn paso(&mut self, e: &[Nivel]) {
        let (antes, antes_abajo) = (self.clk, self.clk_abajo);
        self.clk = nivel_reloj(e, &self.reloj);
        self.clk_abajo = self.abajo.as_ref().map_or(Nivel::X, |r| nivel_reloj(e, r));
        // Un control asíncrono seguro manda sobre el reloj; en X, la cuenta queda entre lo que impone y lo que haría sin él.
        match asincronos(e, &self.borra, &self.carga) {
            Some((r, true)) => self.reg = r,
            Some((r, false)) => {
                self.sincrono(e, antes, antes_abajo);
                self.reg = self.reg.mezcla(r);
            }
            None => self.sincrono(e, antes, antes_abajo),
        }
    }

    /// Lo que hace el reloj sin controles asíncronos activos.
    fn sincrono(&mut self, e: &[Nivel], antes: Nivel, antes_abajo: Nivel) {
        let sube = flanco(antes, self.clk, &self.reloj);
        let baja = self.abajo.as_ref().is_some_and(|r| flanco(antes_abajo, self.clk_abajo, r));
        if !sube && !baja {
            return;
        }
        // Un reloj hacia abajo propio (193) cuenta solo con el otro en su nivel de reposo, que es el activo del reloj.
        let hacia_abajo = if let Some(r) = &self.abajo {
            let (otro, el_otro) = if sube { (self.clk_abajo, r) } else { (self.clk, &self.reloj) };
            match otro {
                n if n == nivel_activo(el_otro) => Some(!sube),
                Nivel::Cero | Nivel::Uno => return,
                _ => None,
            }
        } else {
            match self.sentido.map(|s| activa(e, &s)) {
                Some(Nivel::Uno) => Some(true),
                Some(Nivel::Cero) | None => Some(false),
                Some(_) => None,
            }
        };
        if let Some(o) = borrado(e, &self.borra, true) {
            self.reg = if matches!(o, Orden::Hacer) { Reg::default() } else { Reg::indefinido(self.bits) };
            return;
        }
        if let Some((o, c)) = cargado(e, &self.carga, true) {
            self.reg = if matches!(o, Orden::Hacer) { Reg::de_entradas(e, &c.datos) } else { Reg::indefinido(self.bits) };
            return;
        }
        match todas_activas(e, &self.habilita) {
            Nivel::Uno => {}
            Nivel::Cero => return,
            _ => {
                self.reg = Reg::indefinido(self.bits);
                return;
            }
        }
        let Some(abajo) = hacia_abajo else {
            self.reg = Reg::indefinido(self.bits);
            return;
        };
        if self.reg.x != 0 {
            return;
        }
        let v = self.reg.v;
        let mascara = (1u32 << self.bits) - 1;
        self.reg.v = if abajo {
            if v == 0 { self.modulo - 1 } else { v - 1 }
        } else if v == self.modulo - 1 {
            0
        } else {
            (v + 1) & mascara
        };
    }
}

#[cfg(test)]
mod tests {
    use super::super::banco::*;
    use super::super::*;
    use super::Nivel::{Cero, Uno, X};
    use crate::netlist::{Accion, Carga, Combina, FlancoReloj, Nucleo, Reloj, SalidaMsi, Senal};

    const NS: u64 = 1000;

    fn bits(n: u8) -> Vec<SalidaMsi> {
        (0..n).map(bit).collect()
    }

    fn contador(bits_: u8, modulo: u32, reloj: Reloj, abajo: Option<Reloj>, sentido: Option<Senal>, habilita: Vec<Senal>, borra: Option<Accion>, carga: Option<Carga>) -> Nucleo {
        Nucleo::Contador { bits: bits_, modulo, reloj, abajo, sentido, habilita, borra, carga }
    }

    /// Un pulso de reloj en la entrada `clk` desde el instante `t`; devuelve el instante siguiente.
    fn pulso(b: &mut Banco, t: u64, clk: usize) -> u64 {
        b.pone(t, &[(clk, 1)]);
        b.pone(t + 10 * NS, &[(clk, 0)]);
        t + 20 * NS
    }

    // Entradas del 161: 0 CLK, 1 CLR (bajo), 2 LOAD (bajo), 3 ENP, 4 ENT, 5..8 A a D. Salidas: QA a QD y RCO por tabla.
    fn c161(sincrono: bool) -> Banco {
        let nucleo = contador(
            4,
            16,
            sube(0),
            None,
            None,
            vec![alta(3), alta(4)],
            Some(Accion { senal: baja(1), sincrona: sincrono }),
            Some(Carga { senal: baja(2), sincrona: true, datos: vec![5, 6, 7, 8] }),
        );
        let mut de = bits(4);
        de.push(SalidaMsi::Tabla { columna: 0 });
        // RCO = ENT y estado 15. Fuentes: ENT, Bit(0..3).
        let fuentes = vec![Fuente::Entrada(4), Fuente::Bit(3), Fuente::Bit(2), Fuente::Bit(1), Fuente::Bit(0)];
        let tabla: Vec<u64> = (0..32u64).map(|i| u64::from(i == 0b11111)).collect();
        Banco::new(9, nucleo, de, fuentes, Some(tabla), &[(1, Uno), (2, Uno), (3, Uno), (4, Uno)])
    }

    #[test]
    fn el_161_cuenta_de_0_a_15_da_rco_en_15_y_vuelve_a_0() {
        let mut b = c161(false);
        let mut t = NS;
        for esperado in 1..=15u32 {
            t = pulso(&mut b, t, 0);
            assert_eq!(b.numero(0, 4), Some(esperado));
            assert_eq!(b.s[4], if esperado == 15 { Uno } else { Cero }, "RCO en {esperado}");
        }
        pulso(&mut b, t, 0);
        assert_eq!(b.numero(0, 4), Some(0));
        assert_eq!(b.s[4], Cero);
    }

    #[test]
    fn el_161_se_detiene_con_enp_o_ent_bajos_y_apaga_rco_sin_ent() {
        let mut b = c161(false);
        let mut t = pulso(&mut b, NS, 0);
        b.pone(t, &[(3, 0)]);
        t = pulso(&mut b, t, 0);
        assert_eq!(b.numero(0, 4), Some(1));
        b.pone(t, &[(3, 1), (4, 0)]);
        t = pulso(&mut b, t, 0);
        assert_eq!(b.numero(0, 4), Some(1));
        b.pone(t, &[(4, 1)]);
        pulso(&mut b, t, 0);
        assert_eq!(b.numero(0, 4), Some(2));
    }

    #[test]
    fn el_161_borra_al_instante_y_el_163_espera_al_reloj() {
        for (sincrono, cuenta_tras_borrar) in [(false, 0), (true, 5)] {
            let mut b = c161(sincrono);
            let mut t = NS;
            for _ in 0..5 {
                t = pulso(&mut b, t, 0);
            }
            assert_eq!(b.numero(0, 4), Some(5));
            b.pone(t, &[(1, 0)]);
            assert_eq!(b.numero(0, 4), Some(cuenta_tras_borrar), "sincrono = {sincrono}");
            t += 5 * NS;
            // Con el reloj, el síncrono también borra.
            pulso(&mut b, t, 0);
            assert_eq!(b.numero(0, 4), Some(0));
        }
    }

    #[test]
    fn la_carga_sincrona_espera_al_reloj_y_manda_sobre_las_habilitaciones() {
        let mut b = c161(false);
        b.pone(NS, &[(5, 1), (7, 1), (2, 0), (3, 0)]);
        assert_eq!(b.numero(0, 4), Some(0), "la carga no actúa sin reloj");
        pulso(&mut b, 2 * NS, 0);
        assert_eq!(b.numero(0, 4), Some(0b0101), "ENP en bajo no impide la carga");
    }

    #[test]
    fn el_borrado_asincrono_manda_sobre_la_carga_y_sobre_el_reloj() {
        let mut b = c161(false);
        b.pone(NS, &[(5, 1), (2, 0)]);
        pulso(&mut b, 2 * NS, 0);
        assert_eq!(b.numero(0, 4), Some(1));
        b.pone(30 * NS, &[(1, 0)]);
        assert_eq!(b.numero(0, 4), Some(0));
        pulso(&mut b, 40 * NS, 0);
        assert_eq!(b.numero(0, 4), Some(0), "con CLR en bajo ni el reloj ni la carga mueven la cuenta");
    }

    #[test]
    fn un_control_en_x_deja_la_cuenta_sin_definir_hasta_que_se_borra() {
        let mut b = c161(false);
        pulso(&mut b, NS, 0);
        b.en(30 * NS, &[(3, X)]);
        pulso(&mut b, 40 * NS, 0);
        assert_eq!(b.numero(0, 4), None);
        assert_eq!(b.s[0], X);
        b.pone(80 * NS, &[(3, 1), (1, 0)]);
        b.pone(81 * NS, &[(1, 1)]);
        assert_eq!(b.numero(0, 4), Some(0));
    }

    #[test]
    fn un_reloj_que_pasa_por_x_dispara_al_salir_de_x() {
        let mut b = c161(false);
        b.en(NS, &[(0, X)]);
        assert_eq!(b.numero(0, 4), Some(0));
        b.en(2 * NS, &[(0, Uno)]);
        assert_eq!(b.numero(0, 4), Some(1));
    }

    #[test]
    fn un_borrado_asincrono_en_x_solo_deja_sin_definir_los_bits_que_cambiaria() {
        let mut b = c161(false);
        let mut t = NS;
        for _ in 0..5 {
            t = pulso(&mut b, t, 0);
        }
        // En 5 (0101) un CLR en X puede borrar o no: QA y QC quedan en X, QB y QD ya valen 0.
        b.en(t, &[(1, X)]);
        assert_eq!(b.s[..4], [X, Cero, X, Cero]);
        b.pone(t + NS, &[(1, 0)]);
        assert_eq!(b.numero(0, 4), Some(0));
        // Soltarlo pasando por X no pierde la cuenta en 0, y el reloj vuelve a contar.
        b.en(t + 2 * NS, &[(1, X)]);
        assert_eq!(b.numero(0, 4), Some(0));
        b.pone(t + 3 * NS, &[(1, 1)]);
        pulso(&mut b, t + 4 * NS, 0);
        assert_eq!(b.numero(0, 4), Some(1));
    }

    // Entradas del 190: 0 CLK, 1 LOAD (bajo), 2 D/U, 3 CTEN (bajo), 4..7 A a D. Salidas: QA a QD y RCO por tabla.
    fn c190() -> Banco {
        let nucleo = contador(4, 10, sube(0), None, Some(alta(2)), vec![baja(3)], None, Some(Carga { senal: baja(1), sincrona: false, datos: vec![4, 5, 6, 7] }));
        let mut de = bits(4);
        // Salida 4: MAX/MIN, 1 en 9 si sube y en 0 si baja. Salida 5: RCO, en bajo con CLK en bajo, CTEN en bajo y MAX/MIN.
        de.push(SalidaMsi::Tabla { columna: 0 });
        de.push(SalidaMsi::Tabla { columna: 1 });
        // Fuentes: CLK, CTEN, D/U, Bit(3..0).
        let fuentes = vec![Fuente::Entrada(0), Fuente::Entrada(3), Fuente::Entrada(2), Fuente::Bit(3), Fuente::Bit(2), Fuente::Bit(1), Fuente::Bit(0)];
        let tabla: Vec<u64> = (0..128u64)
            .map(|i| {
                let (clk, cten, du, n) = (i >> 6 & 1, i >> 5 & 1, i >> 4 & 1, i & 15);
                let maxmin = (du == 0 && n == 9) || (du == 1 && n == 0);
                let rco = !(clk == 0 && cten == 0 && maxmin);
                u64::from(maxmin) | u64::from(rco) << 2
            })
            .collect();
        Banco::new(8, nucleo, de, fuentes, Some(tabla), &[(0, Uno), (1, Uno), (3, Uno)])
    }

    #[test]
    fn el_190_cuenta_en_decada_en_los_dos_sentidos_con_max_min_y_rco() {
        let mut b = c190();
        b.pone(NS, &[(3, 0)]);
        let mut t = 2 * NS;
        // Hacia arriba: 0 a 9 y de nuevo a 0. Los pulsos usan el reloj en alto en reposo, así que el flanco es la subida.
        for esperado in [1u32, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1] {
            b.pone(t, &[(0, 0)]);
            b.pone(t + 5 * NS, &[(0, 1)]);
            t += 20 * NS;
            assert_eq!(b.numero(0, 4), Some(esperado));
        }
        assert_eq!(b.numero(0, 4), Some(1));
        // Hacia abajo desde 1: 0, 9, 8.
        b.pone(t, &[(2, 1)]);
        for esperado in [0u32, 9, 8] {
            b.pone(t, &[(0, 0)]);
            b.pone(t + 5 * NS, &[(0, 1)]);
            t += 20 * NS;
            assert_eq!(b.numero(0, 4), Some(esperado));
        }
        // De 8 a 0 hacia abajo: MAX/MIN vale 1 en la cuenta mínima y RCO sale en bajo solo con CLK en bajo.
        for _ in 0..8 {
            b.pone(t, &[(0, 0)]);
            b.pone(t + 5 * NS, &[(0, 1)]);
            t += 20 * NS;
        }
        assert_eq!(b.numero(0, 4), Some(0));
        b.pone(t, &[(0, 0)]);
        assert_eq!((b.s[4], b.s[5]), (Uno, Cero), "MAX/MIN en 1 y RCO en bajo con CLK en bajo en la cuenta mínima");
        b.pone(t + 5 * NS, &[(0, 1)]);
        assert_eq!(b.s[5], Uno);
    }

    #[test]
    fn el_190_carga_de_golpe_y_cten_alto_lo_detiene() {
        let mut b = c190();
        b.pone(NS, &[(4, 1), (5, 0), (6, 0), (7, 1), (1, 0)]);
        assert_eq!(b.numero(0, 4), Some(9));
        b.pone(2 * NS, &[(1, 1)]);
        b.pone(3 * NS, &[(0, 0)]);
        b.pone(4 * NS, &[(0, 1)]);
        assert_eq!(b.numero(0, 4), Some(9), "CTEN en alto no cuenta");
    }

    // Entradas del 193: 0 UP, 1 DOWN, 2 CLR (alto, asíncrono), 3 LOAD (bajo, asíncrono), 4..7 A a D. Salidas: QA a QD, CO y BO.
    fn c193() -> Banco {
        let nucleo = contador(
            4,
            16,
            sube(0),
            Some(sube(1)),
            None,
            vec![],
            Some(Accion { senal: alta(2), sincrona: false }),
            Some(Carga { senal: baja(3), sincrona: false, datos: vec![4, 5, 6, 7] }),
        );
        let mut de = bits(4);
        de.push(SalidaMsi::Tabla { columna: 0 });
        de.push(SalidaMsi::Tabla { columna: 1 });
        // CO en bajo con UP en bajo en 15 y BO en bajo con DOWN en bajo en 0. Fuentes: UP, DOWN, Bit(3..0).
        let fuentes = vec![Fuente::Entrada(0), Fuente::Entrada(1), Fuente::Bit(3), Fuente::Bit(2), Fuente::Bit(1), Fuente::Bit(0)];
        let tabla: Vec<u64> = (0..64u64)
            .map(|i| {
                let (up, down, n) = (i >> 5 & 1, i >> 4 & 1, i & 15);
                u64::from(!(up == 0 && n == 15)) | u64::from(!(down == 0 && n == 0)) << 2
            })
            .collect();
        Banco::new(8, nucleo, de, fuentes, Some(tabla), &[(0, Uno), (1, Uno), (3, Uno)])
    }

    #[test]
    fn el_193_sigue_la_secuencia_de_la_hoja_con_clear_preset_cuenta_arriba_y_abajo() {
        // Figura de la hoja: clear, preset a 13, tres subidas de UP (14, 15, 0, 1, 2), luego tres de DOWN.
        let mut b = c193();
        b.pone(NS, &[(2, 1)]);
        assert_eq!((b.numero(0, 4), b.s[4], b.s[5]), (Some(0), Uno, Uno), "clear: cuenta 0 y los dos acarreos en 1 con los relojes en alto");
        b.pone(2 * NS, &[(2, 0), (4, 1), (6, 1), (7, 1)]);
        b.pone(3 * NS, &[(3, 0)]);
        assert_eq!(b.numero(0, 4), Some(13));
        b.pone(4 * NS, &[(3, 1)]);
        let mut t = 10 * NS;
        for (esperado, co) in [(14u32, Uno), (15, Uno), (0, Uno), (1, Uno), (2, Uno)] {
            b.pone(t, &[(0, 0)]);
            b.pone(t + 5 * NS, &[(0, 1)]);
            t += 20 * NS;
            assert_eq!((b.numero(0, 4), b.s[4]), (Some(esperado), co));
        }
        for esperado in [1u32, 0, 15, 14] {
            b.pone(t, &[(1, 0)]);
            b.pone(t + 5 * NS, &[(1, 1)]);
            t += 20 * NS;
            assert_eq!(b.numero(0, 4), Some(esperado), "cuenta hacia abajo");
        }
    }

    #[test]
    fn el_193_da_co_y_bo_en_bajo_con_su_reloj_en_bajo_en_los_extremos() {
        let mut b = c193();
        b.pone(NS, &[(4, 1), (5, 1), (6, 1), (7, 1), (3, 0)]);
        b.pone(2 * NS, &[(3, 1)]);
        assert_eq!(b.numero(0, 4), Some(15));
        b.pone(3 * NS, &[(0, 0)]);
        assert_eq!((b.s[4], b.s[5]), (Cero, Uno), "CO en bajo con UP en bajo y cuenta 15");
        b.pone(4 * NS, &[(0, 1)]);
        assert_eq!(b.numero(0, 4), Some(0));
        b.pone(5 * NS, &[(1, 0)]);
        assert_eq!((b.s[4], b.s[5]), (Uno, Cero), "BO en bajo con DOWN en bajo y cuenta 0");
    }

    #[test]
    fn el_193_no_cuenta_si_el_otro_reloj_esta_en_bajo() {
        let mut b = c193();
        b.pone(NS, &[(1, 0)]);
        b.pone(2 * NS, &[(0, 0)]);
        b.pone(3 * NS, &[(0, 1)]);
        assert_eq!(b.numero(0, 4), Some(0), "una subida de UP con DOWN en 0 no cuenta");
        b.pone(4 * NS, &[(1, 1)]);
        assert_eq!(b.numero(0, 4), Some(15), "y la subida de DOWN con UP en 1 cuenta hacia abajo");
    }

    // Entradas del 4017: 0 CLK, 1 INH, 2 RESET. Salidas: Q0 a Q9 y CO por tabla.
    fn c4017() -> Banco {
        let nucleo = contador(
            4,
            10,
            Reloj { senales: vec![alta(0), baja(1)], combina: Combina::Y, flanco: FlancoReloj::Subida },
            None,
            None,
            vec![],
            Some(Accion { senal: alta(2), sincrona: false }),
            None,
        );
        let de: Vec<SalidaMsi> = (0..11).map(|c| SalidaMsi::Tabla { columna: c }).collect();
        let fuentes = vec![Fuente::Bit(3), Fuente::Bit(2), Fuente::Bit(1), Fuente::Bit(0)];
        let tabla: Vec<u64> = (0..16u64).map(|n| (0..10u64).map(|k| u64::from(n == k) << (2 * k)).sum::<u64>() | u64::from(n < 5) << 20).collect();
        Banco::new(3, nucleo, de, fuentes, Some(tabla), &[(2, Uno)])
    }

    fn cuenta_4017(b: &Banco) -> (Option<usize>, Nivel) {
        let altas: Vec<usize> = (0..10).filter(|&k| b.s[k] == Uno).collect();
        (if altas.len() == 1 { Some(altas[0]) } else { None }, b.s[10])
    }

    #[test]
    fn el_4017_sigue_la_figura_de_la_hoja_con_inh_y_co_en_la_mitad() {
        // Figura: CLK en alto antes del primer flanco, RESET baja en -1; cuenta 1 a 9, 0, 1; INH alto 10.75 a 12.25.
        let mut b = c4017();
        b.pone(0, &[(0, 1)]);
        b.pone(NS, &[(2, 0)]);
        assert_eq!(cuenta_4017(&b), (Some(0), Uno));
        let mut t = 10 * NS;
        for (esperado, co) in [(1usize, Uno), (2, Uno), (3, Uno), (4, Uno), (5, Cero), (6, Cero), (7, Cero), (8, Cero), (9, Cero), (0, Uno), (1, Uno)] {
            b.pone(t, &[(0, 0)]);
            b.pone(t + 5 * NS, &[(0, 1)]);
            t += 10 * NS;
            assert_eq!(cuenta_4017(&b), (Some(esperado), co));
        }
        // INH alto con CLK en alto: no pasa nada. El ciclo siguiente no cuenta.
        b.pone(t, &[(1, 1)]);
        b.pone(t + 2 * NS, &[(0, 0)]);
        b.pone(t + 5 * NS, &[(0, 1)]);
        assert_eq!(cuenta_4017(&b).0, Some(1), "con INH alto el reloj no cuenta");
        // Al bajar INH con CLK en alto, la combinación CLK y no INH sube y cuenta, como la hoja.
        b.pone(t + 8 * NS, &[(1, 0)]);
        assert_eq!(cuenta_4017(&b).0, Some(2));
    }

    #[test]
    fn el_reset_del_4017_manda_sobre_el_reloj() {
        let mut b = c4017();
        b.pone(NS, &[(2, 0)]);
        pulso(&mut b, 10 * NS, 0);
        assert_eq!(cuenta_4017(&b).0, Some(1));
        b.pone(40 * NS, &[(2, 1)]);
        assert_eq!(cuenta_4017(&b).0, Some(0));
        pulso(&mut b, 50 * NS, 0);
        assert_eq!(cuenta_4017(&b).0, Some(0));
    }
}
