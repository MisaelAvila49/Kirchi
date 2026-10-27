//! Núcleo de aproximaciones sucesivas (ADC0804): CS y WR en bajo reinician, la subida de WR arranca, y desde el bit más
//! significativo se prueba cada bit en `aux` y se conserva si el comparador dice que la entrada lo alcanza. El reloj interno
//! pide despertar en cada decisión; el externo cuenta flancos.

use super::{activa, flanco, nivel_reloj, Reg};
use crate::digital::{a_ps, Nivel, Ps};
use crate::netlist::{Reloj, RelojConv, Senal};

#[derive(Clone)]
pub(crate) struct Aproximaciones {
    bits: u8,
    cs: Senal,
    wr: Senal,
    rd: Senal,
    comparador: usize,
    reloj: RelojConv,
    ciclos_inicio: u32,
    ciclos_bit: u32,
    /// El código terminado de la última conversión.
    pub reg: Reg,
    /// El código de prueba: lo ya decidido más el bit que se prueba.
    pub aux: Reg,
    /// Qué bits del resultado quedaron sin definir porque el comparador no daba 0 ni 1.
    sin_definir: u32,
    /// Fin de conversión: INTR es su negada.
    pub fin: bool,
    convirtiendo: bool,
    /// Bits ya decididos de la conversión en curso.
    decididos: u8,
    inicio: Ps,
    ciclos: u32,
    pub proximo: Option<Ps>,
    iniciando: Nivel,
    clk: Nivel,
}

impl Aproximaciones {
    #[allow(clippy::too_many_arguments)]
    pub fn new(bits: u8, cs: Senal, wr: Senal, rd: Senal, comparador: usize, reloj: RelojConv, ciclos_inicio: u32, ciclos_bit: u32) -> Self {
        Self {
            bits,
            cs,
            wr,
            rd,
            comparador,
            reloj,
            ciclos_inicio,
            ciclos_bit,
            reg: Reg::default(),
            aux: Reg::default(),
            sin_definir: 0,
            fin: false,
            convirtiendo: false,
            decididos: 0,
            inicio: 0,
            ciclos: 0,
            proximo: None,
            iniciando: Nivel::X,
            clk: Nivel::X,
        }
    }

    pub fn bytes_heap(&self) -> usize {
        match &self.reloj {
            RelojConv::Externo(r) => r.senales.capacity() * std::mem::size_of::<Senal>(),
            RelojConv::Interno { .. } => 0,
        }
    }

    fn reloj_externo(&self) -> Option<&Reloj> {
        match &self.reloj {
            RelojConv::Externo(r) => Some(r),
            RelojConv::Interno { .. } => None,
        }
    }

    /// Los niveles de CS y WR en bajo (reinicio) y de CS y RD en bajo (lectura).
    fn controles(&self, e: &[Nivel]) -> (Nivel, Nivel) {
        let cs = activa(e, &self.cs);
        (cs.y(activa(e, &self.wr)), cs.y(activa(e, &self.rd)))
    }

    pub fn iniciar(&mut self, e: &[Nivel]) {
        let (iniciando, _) = self.controles(e);
        self.iniciando = iniciando;
        self.clk = self.reloj_externo().map_or(Nivel::X, |r| nivel_reloj(e, r));
        if iniciando == Nivel::Uno {
            self.reposo();
        }
    }

    /// CS y WR en bajo: se aborta lo que corría, el código de prueba vuelve a 0 y INTR a 1. El resultado anterior se conserva.
    fn reposo(&mut self) {
        self.convirtiendo = false;
        self.aux = Reg::default();
        self.fin = false;
        self.proximo = None;
    }

    /// Instante de la decisión del bit `decididos`: relativo al arranque, para que los redondeos no se acumulen.
    fn instante_de_decision(&self) -> Option<Ps> {
        let RelojConv::Interno { periodo } = self.reloj else { return None };
        let ciclos = self.ciclos_inicio + (u32::from(self.decididos) + 1) * self.ciclos_bit;
        Some(self.inicio + a_ps(f64::from(ciclos) * periodo))
    }

    fn arrancar(&mut self, ahora: Ps) {
        self.convirtiendo = true;
        self.fin = false;
        self.decididos = 0;
        self.inicio = ahora;
        self.ciclos = 0;
        self.sin_definir = 0;
        self.aux = Reg { v: 1 << (self.bits - 1), x: 0 };
        self.proximo = self.instante_de_decision();
    }

    /// Lee el comparador: conserva el bit de prueba si la entrada lo alcanza y prueba el siguiente; al terminar copia el código.
    fn decidir(&mut self, comparador: Nivel) {
        let b = self.bits - 1 - self.decididos;
        match comparador {
            Nivel::Uno => {}
            Nivel::Cero => self.aux.v &= !(1 << b),
            _ => {
                self.aux.v &= !(1 << b);
                self.sin_definir |= 1 << b;
            }
        }
        self.decididos += 1;
        if self.decididos == self.bits {
            self.convirtiendo = false;
            self.reg = Reg { v: self.aux.v, x: self.sin_definir };
            self.aux = Reg::default();
            self.fin = true;
            self.proximo = None;
        } else {
            self.aux.v |= 1 << (b - 1);
            self.proximo = self.instante_de_decision();
        }
    }

    pub fn paso(&mut self, ahora: Ps, e: &[Nivel]) {
        let (iniciando, leyendo) = self.controles(e);
        let arranca = self.iniciando == Nivel::Uno && iniciando == Nivel::Cero;
        self.iniciando = iniciando;
        if iniciando == Nivel::Uno {
            self.reposo();
        } else if arranca {
            self.arrancar(ahora);
        }
        // Leer el dato baja la bandera de fin.
        if leyendo == Nivel::Uno {
            self.fin = false;
        }
        let comparador = e[self.comparador];
        if let Some(r) = self.reloj_externo() {
            let clk = nivel_reloj(e, r);
            let sube = flanco(self.clk, clk, r);
            self.clk = clk;
            if sube && self.convirtiendo {
                self.ciclos += 1;
                while self.convirtiendo && self.ciclos >= self.ciclos_inicio + (u32::from(self.decididos) + 1) * self.ciclos_bit {
                    self.decidir(comparador);
                }
            }
        } else {
            while self.convirtiendo && self.proximo.is_some_and(|t| ahora >= t) {
                self.decidir(comparador);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::banco::*;
    use super::super::*;
    use super::Nivel::{Cero, Uno, X};
    use crate::netlist::{Nucleo, RelojConv, SalidaMsi};

    const US: u64 = 1_000_000;

    // Entradas: 0 CS (bajo), 1 WR (bajo), 2 RD (bajo), 3 COMP, 4 CLK. Salidas: prueba Aux(7..0) (la más significativa primero),
    // resultado Bit(7..0) y INTR (negada de la bandera de fin).
    fn adc(reloj: RelojConv, bits: u8, ciclos_inicio: u32, ciclos_bit: u32) -> Banco {
        let n = Nucleo::Aproximaciones { bits, cs: baja(0), wr: baja(1), rd: baja(2), comparador: 3, reloj, ciclos_inicio, ciclos_bit };
        let mut de: Vec<SalidaMsi> = (0..bits).rev().map(|b| SalidaMsi::Directa { fuente: Fuente::Aux(b), negada: false }).collect();
        de.extend((0..bits).rev().map(|b| SalidaMsi::Directa { fuente: Fuente::Bit(b), negada: false }));
        de.push(SalidaMsi::Directa { fuente: Fuente::Bandera(0), negada: true });
        Banco::new(5, n, de, vec![], None, &[(0, Uno), (1, Uno), (2, Uno)])
    }

    fn interno(periodo: f64) -> RelojConv {
        RelojConv::Interno { periodo }
    }

    fn prueba(b: &Banco, bits: usize) -> u32 {
        (0..bits).fold(0, |a, k| a << 1 | u32::from(b.s[k] == Uno))
    }

    fn resultado(b: &Banco, bits: usize) -> u32 {
        (0..bits).fold(0, |a, k| a << 1 | u32::from(b.s[bits + k] == Uno))
    }

    fn intr(b: &Banco, bits: usize) -> Nivel {
        b.s[2 * bits]
    }

    /// Una conversión de un comparador ideal con la entrada en el código `vin`; devuelve los instantes de decisión y los códigos de prueba.
    fn convertir(b: &mut Banco, bits: usize, t0: u64, vin: u32) -> (Vec<u64>, Vec<u32>) {
        b.pone(t0 - US, &[(0, 0), (1, 0)]);
        b.pone(t0, &[(1, 1)]);
        let (mut instantes, mut codigos) = (Vec::new(), Vec::new());
        while let Some(t) = b.m.despertar() {
            codigos.push(prueba(b, bits));
            let alcanza = codigos.last().is_some_and(|&c| c <= vin);
            b.en(t, &[(3, Nivel::de_bool(alcanza))]);
            instantes.push(t);
        }
        (instantes, codigos)
    }

    #[test]
    fn ocho_decisiones_en_sus_instantes_con_el_arranque_de_la_hoja() {
        // 2 ciclos de arranque y 8 por bit de 1 µs: la conversión dura 2 + 8 · 8 = 66 µs desde la subida de WR.
        let mut b = adc(interno(1e-6), 8, 2, 8);
        let t0 = 100 * US;
        let (instantes, _) = convertir(&mut b, 8, t0, 77);
        let esperados: Vec<u64> = (1..=8).map(|k| t0 + (2 + 8 * k) * US).collect();
        assert_eq!(instantes, esperados);
        assert_eq!(resultado(&b, 8), 77);
        assert_eq!(intr(&b, 8), Cero, "INTR baja al terminar");
        assert_eq!(prueba(&b, 8), 0);
    }

    #[test]
    fn el_codigo_de_prueba_recorre_la_aproximacion_sucesiva_desde_el_bit_mas_significativo() {
        let mut b = adc(interno(1e-6), 8, 1, 8);
        let (_, codigos) = convertir(&mut b, 8, 10 * US, 0xA5);
        assert_eq!(codigos, vec![0x80, 0xC0, 0xA0, 0xB0, 0xA8, 0xA4, 0xA6, 0xA5]);
        assert_eq!(resultado(&b, 8), 0xA5);
    }

    #[test]
    fn el_codigo_es_el_de_la_entrada_en_todo_el_rango() {
        for vin in [0u32, 1, 2, 127, 128, 129, 200, 254, 255] {
            let mut b = adc(interno(1e-6), 8, 1, 8);
            convertir(&mut b, 8, 10 * US, vin);
            assert_eq!(resultado(&b, 8), vin, "entrada {vin}");
        }
    }

    #[test]
    fn intr_sube_al_reiniciar_baja_al_terminar_y_la_lectura_la_sube() {
        let mut b = adc(interno(1e-6), 8, 1, 8);
        assert_eq!(intr(&b, 8), Uno, "en reposo INTR está en alto");
        convertir(&mut b, 8, 10 * US, 5);
        assert_eq!(intr(&b, 8), Cero);
        // CS y RD en bajo suben INTR y conservan el dato.
        b.pone(200 * US, &[(2, 0)]);
        assert_eq!((intr(&b, 8), resultado(&b, 8)), (Uno, 5));
        b.pone(201 * US, &[(2, 1)]);
        // CS y WR en bajo con una conversión a medias la aborta: el dato anterior queda y INTR sube.
        b.pone(300 * US, &[(1, 0)]);
        b.pone(301 * US, &[(1, 1)]);
        assert!(b.m.despertar().is_some());
        b.pone(310 * US, &[(1, 0)]);
        assert_eq!((b.m.despertar(), intr(&b, 8), prueba(&b, 8), resultado(&b, 8)), (None, Uno, 0, 5));
    }

    #[test]
    fn una_conversion_abortada_a_mitad_no_deja_decisiones_pendientes_y_la_siguiente_empieza_de_cero() {
        let mut b = adc(interno(1e-6), 8, 1, 8);
        b.pone(US, &[(0, 0), (1, 0)]);
        b.pone(2 * US, &[(1, 1)]);
        let primera = b.m.despertar().unwrap();
        b.en(primera, &[(3, Uno)]);
        assert_eq!(prueba(&b, 8), 0xC0);
        b.pone(primera + US, &[(1, 0)]);
        assert_eq!(b.m.despertar(), None);
        let (_, codigos) = convertir(&mut b, 8, 500 * US, 3);
        assert_eq!(codigos[0], 0x80);
        assert_eq!(resultado(&b, 8), 3);
    }

    #[test]
    fn la_conversion_no_arranca_hasta_que_wr_sube_ni_con_cs_en_alto() {
        let mut b = adc(interno(1e-6), 8, 1, 8);
        b.pone(US, &[(1, 0)]);
        assert_eq!(b.m.despertar(), None, "WR en bajo con CS en alto no hace nada");
        b.pone(2 * US, &[(0, 0)]);
        assert_eq!(b.m.despertar(), None, "CS y WR en bajo reinician pero no arrancan");
        b.pone(3 * US, &[(1, 1)]);
        assert!(b.m.despertar().is_some());
    }

    #[test]
    fn el_modo_libre_no_arranca_solo_y_arranca_con_un_pulso_de_wr() {
        // CS a tierra y WR unido a INTR: en reposo INTR está en alto y WR con él, sin flanco que arranque.
        let mut b = adc(interno(1e-6), 8, 1, 8);
        b.pone(US, &[(0, 0)]);
        assert_eq!(b.m.despertar(), None);
        b.pone(2 * US, &[(1, 0)]);
        assert_eq!(b.m.despertar(), None, "WR en bajo solo reinicia");
        b.pone(3 * US, &[(1, 1)]);
        assert!(b.m.despertar().is_some(), "la subida del pulso arranca");
    }

    #[test]
    fn el_modo_libre_sigue_convirtiendo_conversion_tras_conversion() {
        let mut b = adc(interno(1e-6), 8, 1, 8);
        b.pone(US, &[(0, 0), (1, 0)]);
        b.pone(2 * US, &[(1, 1)]);
        let mut terminadas = 0;
        while terminadas < 3 {
            let t = b.m.despertar().expect("sigue convirtiendo");
            b.en(t, &[(3, Uno)]);
            if b.m.despertar().is_none() {
                terminadas += 1;
                assert_eq!((intr(&b, 8), resultado(&b, 8)), (Cero, 255));
                b.pone(t + 300_000, &[(1, 0)]);
                assert_eq!(intr(&b, 8), Uno);
                b.pone(t + 600_000, &[(1, 1)]);
            }
        }
    }

    #[test]
    fn con_reloj_externo_decide_al_contar_flancos() {
        // 3 bits, 1 ciclo de arranque y 2 por bit: decisiones en los flancos 3, 5 y 7.
        let reloj = RelojConv::Externo(sube(4));
        let mut b = adc(reloj, 3, 1, 2);
        b.pone(US, &[(0, 0), (1, 0)]);
        b.pone(2 * US, &[(1, 1)]);
        assert_eq!(b.m.despertar(), None, "el reloj externo no pide despertar");
        let mut t = 3 * US;
        let vin = 0b101;
        let mut codigos = Vec::new();
        for flanco in 1..=8u32 {
            codigos.push(prueba(&b, 3));
            let alcanza = prueba(&b, 3) <= vin;
            b.en(t, &[(3, Nivel::de_bool(alcanza)), (4, Uno)]);
            b.pone(t + US / 2, &[(4, 0)]);
            t += US;
            if flanco == 7 {
                break;
            }
        }
        assert_eq!(resultado(&b, 3), 0b101);
        assert_eq!(intr(&b, 3), Cero);
        assert_eq!(codigos[..3], [0b100, 0b100, 0b100], "el código de prueba no cambia entre decisiones");
    }

    #[test]
    fn un_comparador_en_x_deja_el_bit_sin_definir_en_el_resultado() {
        let mut b = adc(interno(1e-6), 2, 0, 1);
        b.pone(US, &[(0, 0), (1, 0)]);
        b.pone(2 * US, &[(1, 1)]);
        let t = b.m.despertar().unwrap();
        b.en(t, &[(3, X)]);
        let t = b.m.despertar().unwrap();
        b.en(t, &[(3, Uno)]);
        assert_eq!(b.s[2], X, "el bit decidido con X queda sin definir");
        assert_eq!(b.s[3], Uno);
        assert_eq!(b.m.lectura().0, -1.0);
    }
}
