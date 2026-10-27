//! Núcleo de registro de desplazamiento: entrada serie con Y de señales, carga paralela por nivel o por reloj, borrado y,
//! opcional, un registro de almacenamiento con su propio reloj. El 164, el 165 y el 595 son configuraciones suyas.

use super::{asincronos, borrado, cargado, flanco, Orden, Reg};
use crate::digital::Nivel;
use crate::netlist::{Accion, Carga, Reloj, Senal};

#[derive(Clone)]
pub(crate) struct Desplazamiento {
    bits: u8,
    reloj: Reloj,
    serie: Vec<Senal>,
    borra: Option<Accion>,
    carga: Option<Carga>,
    almacen: Option<Reloj>,
    pub reg: Reg,
    pub aux: Reg,
    /// El registro principal al empezar el instante: el almacén lo copia de aquí aunque el desplazamiento ya haya pasado.
    previo: Reg,
    clk: Nivel,
    clk_almacen: Nivel,
}

impl Desplazamiento {
    pub fn new(bits: u8, reloj: Reloj, serie: Vec<Senal>, borra: Option<Accion>, carga: Option<Carga>, almacen: Option<Reloj>) -> Self {
        Self { bits, reloj, serie, borra, carga, almacen, reg: Reg::default(), aux: Reg::default(), previo: Reg::default(), clk: Nivel::X, clk_almacen: Nivel::X }
    }

    pub fn con_almacen(&self) -> bool {
        self.almacen.is_some()
    }

    pub fn bytes_heap(&self) -> usize {
        let s = std::mem::size_of::<Senal>();
        (self.reloj.senales.capacity() + self.serie.capacity() + self.almacen.as_ref().map_or(0, |r| r.senales.capacity())) * s
            + self.carga.as_ref().map_or(0, |c| c.datos.capacity() * std::mem::size_of::<usize>())
    }

    pub fn congelar(&mut self) {
        self.previo = self.reg;
    }

    pub fn iniciar(&mut self, e: &[Nivel]) {
        self.clk = super::nivel_reloj(e, &self.reloj);
        self.clk_almacen = self.almacen.as_ref().map_or(Nivel::X, |r| super::nivel_reloj(e, r));
        match asincronos(e, &self.borra, &self.carga) {
            Some((r, true)) => self.reg = r,
            Some((r, false)) => self.reg = self.reg.mezcla(r),
            None => {}
        }
    }

    pub fn paso(&mut self, e: &[Nivel]) {
        let (antes, antes_almacen) = (self.clk, self.clk_almacen);
        self.clk = super::nivel_reloj(e, &self.reloj);
        self.clk_almacen = self.almacen.as_ref().map_or(Nivel::X, |r| super::nivel_reloj(e, r));
        // El almacén copia el registro como estaba al empezar el instante, del cambio que lo toque o no en este.
        let copia = self.almacen.as_ref().is_some_and(|r| flanco(antes_almacen, self.clk_almacen, r));
        // El borrado o la carga por nivel en X dejan el registro entre lo que imponen y lo que haría el reloj sin ellos.
        let impuesto = asincronos(e, &self.borra, &self.carga);
        if let Some((r, true)) = impuesto {
            self.reg = r;
        } else {
            if flanco(antes, self.clk, &self.reloj) {
                self.desplazar(e);
            }
            if let Some((r, _)) = impuesto {
                self.reg = self.reg.mezcla(r);
            }
        }
        if copia {
            self.aux = self.previo;
        }
    }

    fn desplazar(&mut self, e: &[Nivel]) {
        if let Some(o) = borrado(e, &self.borra, true) {
            self.reg = if matches!(o, Orden::Hacer) { Reg::default() } else { Reg::indefinido(self.bits) };
            return;
        }
        if let Some((o, c)) = cargado(e, &self.carga, true) {
            self.reg = if matches!(o, Orden::Hacer) { Reg::de_entradas(e, &c.datos) } else { Reg::indefinido(self.bits) };
            return;
        }
        let mascara = (1u32 << self.bits) - 1;
        let (dato, x) = match super::todas_activas(e, &self.serie) {
            Nivel::Uno => (1, 0),
            Nivel::Cero => (0, 0),
            _ => (0, 1),
        };
        self.reg = Reg { v: (self.reg.v << 1 | dato) & mascara, x: (self.reg.x << 1 | x) & mascara };
    }
}

#[cfg(test)]
mod tests {
    use super::super::banco::*;
    use super::super::*;
    use super::Nivel::{Cero, Uno, X, Z};
    use crate::netlist::{Accion, Carga, Combina, FlancoReloj, Nucleo, Reloj, SalidaMsi, Senal};

    const NS: u64 = 1000;

    fn pulso(b: &mut Banco, t: u64, clk: usize) -> u64 {
        b.pone(t, &[(clk, 1)]);
        b.pone(t + 10 * NS, &[(clk, 0)]);
        t + 20 * NS
    }

    fn nucleo(bits: u8, reloj: Reloj, serie: Vec<Senal>, borra: Option<Accion>, carga: Option<Carga>, almacen: Option<Reloj>) -> Nucleo {
        Nucleo::Desplazamiento { bits, reloj, serie, borra, carga, almacen }
    }

    // Entradas del 164: 0 CLK, 1 A, 2 B, 3 CLR (bajo). Salidas QA a QH.
    fn r164() -> Banco {
        let n = nucleo(8, sube(0), vec![alta(1), alta(2)], Some(Accion { senal: baja(3), sincrona: false }), None, None);
        Banco::new(4, n, (0..8).map(bit).collect(), vec![], None, &[(3, Uno)])
    }

    #[test]
    fn el_164_desplaza_a_y_b_hacia_qh_y_se_borra_al_instante() {
        let mut b = r164();
        b.pone(NS, &[(1, 1), (2, 1)]);
        let mut t = pulso(&mut b, 2 * NS, 0);
        assert_eq!(b.numero(0, 8), Some(0b0000_0001));
        b.pone(t, &[(2, 0)]);
        t = pulso(&mut b, t, 0);
        assert_eq!(b.numero(0, 8), Some(0b0000_0010), "con B en bajo entra un 0 aunque A esté en alto");
        b.pone(t, &[(2, 1)]);
        t = pulso(&mut b, t, 0);
        assert_eq!(b.numero(0, 8), Some(0b0000_0101));
        b.pone(t, &[(3, 0)]);
        assert_eq!(b.numero(0, 8), Some(0));
    }

    #[test]
    fn el_164_recorre_el_dato_de_qa_a_qh_y_lo_saca_al_octavo_pulso() {
        let mut b = r164();
        b.pone(NS, &[(1, 1), (2, 1)]);
        let mut t = pulso(&mut b, 2 * NS, 0);
        b.pone(t, &[(1, 0)]);
        for k in 1..8 {
            assert_eq!(b.numero(0, 8), Some(1 << (k - 1)), "tras {k} pulsos");
            t = pulso(&mut b, t, 0);
        }
        assert_eq!(b.numero(0, 8), Some(0b1000_0000));
        pulso(&mut b, t, 0);
        assert_eq!(b.numero(0, 8), Some(0));
    }

    #[test]
    fn un_dato_serie_en_x_entra_como_x_y_sale_por_qh() {
        let mut b = r164();
        b.en(NS, &[(1, X), (2, Uno)]);
        let mut t = pulso(&mut b, 2 * NS, 0);
        b.pone(t, &[(1, 0)]);
        assert_eq!(b.s[0], X);
        for _ in 0..7 {
            t = pulso(&mut b, t, 0);
        }
        assert_eq!(b.s[7], X);
        pulso(&mut b, t, 0);
        assert_eq!(b.numero(0, 8), Some(0), "el X salió por el extremo");
    }

    // Entradas del 165: 0 CLK, 1 INH, 2 SH/LD (bajo), 3 SER, 4..11 A a H. Salidas QH y su negada.
    fn r165() -> Banco {
        let reloj = Reloj { senales: vec![alta(0), alta(1)], combina: Combina::O, flanco: FlancoReloj::Subida };
        let n = nucleo(8, reloj, vec![alta(3)], None, Some(Carga { senal: baja(2), sincrona: false, datos: (4..12).collect() }), None);
        let de = vec![bit(7), SalidaMsi::Directa { fuente: Fuente::Bit(7), negada: true }];
        Banco::new(12, n, de, vec![], None, &[(2, Uno)])
    }

    #[test]
    fn el_165_carga_por_nivel_manda_sobre_el_reloj_y_sigue_a_los_datos() {
        let mut b = r165();
        b.pone(NS, &[(4, 1), (11, 1), (2, 0)]);
        assert_eq!((b.s[0], b.s[1]), (Uno, Cero), "H en alto sale por QH de inmediato");
        pulso(&mut b, 2 * NS, 0);
        assert_eq!(b.s[0], Uno, "con la carga activa el reloj no desplaza");
        b.pone(40 * NS, &[(11, 0)]);
        assert_eq!((b.s[0], b.s[1]), (Cero, Uno), "los datos cambian mientras la carga está activa");
    }

    #[test]
    fn el_165_desplaza_hacia_qh_con_ser_y_el_reloj_se_inhibe_con_inh() {
        let mut b = r165();
        // Se carga 0b1000_0001 (A y H), se suelta la carga y se desplaza.
        b.pone(NS, &[(4, 1), (11, 1), (2, 0)]);
        b.pone(2 * NS, &[(2, 1), (3, 0)]);
        assert_eq!(b.s[0], Uno);
        let t = pulso(&mut b, 10 * NS, 0);
        assert_eq!(b.s[0], Cero, "el 1 de H se fue y entró el 0 de A hacia B");
        // INH en alto con CLK en bajo ya subió el reloj efectivo: un desplazamiento propio de la combinación O.
        b.pone(t, &[(1, 1)]);
        let tras_inh = b.m.lectura().0;
        b.pone(t + 5 * NS, &[(0, 1)]);
        b.pone(t + 10 * NS, &[(0, 0)]);
        assert_eq!(b.m.lectura().0, tras_inh, "con INH en alto el reloj no desplaza");
        b.pone(t + 15 * NS, &[(1, 0)]);
        assert_eq!(b.m.lectura().0, tras_inh, "INH baja con CLK en bajo: el reloj efectivo baja y no desplaza");
    }

    // Entradas del 595: 0 SRCLK, 1 RCLK, 2 SER, 3 SRCLR (bajo), 4 OE (bajo). Salidas Q0 a Q7 (tres estados) y QH'.
    fn r595() -> Banco {
        let n = nucleo(8, sube(0), vec![alta(2)], Some(Accion { senal: baja(3), sincrona: false }), None, Some(sube(1)));
        let mut de: Vec<SalidaMsi> = (0..8).map(|c| SalidaMsi::Tabla { columna: c }).collect();
        de.push(bit(7));
        // Qk = OE bajo ? Aux(k) : Z. Fuentes: OE, Aux(0..7); la tabla lleva 9 bits.
        let fuentes: Vec<Fuente> = std::iter::once(Fuente::Entrada(4)).chain((0..8).map(Fuente::Aux)).collect();
        let tabla: Vec<u64> = (0..512u64)
            .map(|i| {
                let oe = i >> 8 & 1;
                (0..8u64).map(|k| (if oe == 1 { 2 } else { i >> (7 - k) & 1 }) << (2 * k)).sum()
            })
            .collect();
        Banco::new(5, n, de, fuentes, Some(tabla), &[(3, Uno)])
    }

    fn q595(b: &Banco) -> String {
        (0..8).map(|k| match b.s[k] { Uno => '1', Cero => '0', Z => 'z', _ => 'x' }).collect()
    }

    #[test]
    fn el_595_almacena_aparte_y_saca_en_tres_estados_con_oe() {
        let mut b = r595();
        // Un 1 por SER, ocho pulsos de SRCLK: el almacén no cambia hasta RCLK.
        b.pone(NS, &[(2, 1)]);
        let mut t = pulso(&mut b, 2 * NS, 0);
        b.pone(t, &[(2, 0)]);
        t = pulso(&mut b, t, 0);
        assert_eq!(q595(&b), "00000000", "el almacén no se mueve con SRCLK");
        t = pulso(&mut b, t, 1);
        assert_eq!(q595(&b), "01000000", "RCLK copia el desplazamiento: el 1 ya pasó a QB");
        b.pone(t, &[(4, 1)]);
        assert_eq!(q595(&b), "zzzzzzzz", "OE en alto deja las ocho salidas en alta impedancia");
        assert_eq!(b.s[8], Cero, "QH' no depende de OE");
        b.pone(t + NS, &[(4, 0)]);
        assert_eq!(q595(&b), "01000000");
    }

    #[test]
    fn el_595_saca_qh_prima_del_registro_de_desplazamiento_sin_esperar_al_almacen() {
        let mut b = r595();
        b.pone(NS, &[(2, 1)]);
        let mut t = pulso(&mut b, 2 * NS, 0);
        b.pone(t, &[(2, 0)]);
        for _ in 0..6 {
            t = pulso(&mut b, t, 0);
        }
        assert_eq!(b.s[8], Cero);
        t = pulso(&mut b, t, 0);
        assert_eq!(b.s[8], Uno, "el octavo flanco de SRCLK sube QH'");
        assert_eq!(q595(&b), "00000000");
        pulso(&mut b, t, 0);
        assert_eq!(b.s[8], Cero);
    }

    #[test]
    fn el_595_con_los_dos_relojes_unidos_deja_el_almacen_un_pulso_atras() {
        // Un solo pulso de la red común: el almacén copia lo de antes del flanco, no lo que el desplazamiento acaba de recibir.
        let mut b = r595();
        b.pone(NS, &[(2, 1)]);
        b.pone(2 * NS, &[(0, 1), (1, 1)]);
        b.pone(3 * NS, &[(0, 0), (1, 0)]);
        assert_eq!(q595(&b), "00000000", "tras el primer pulso el almacén tiene el desplazamiento de antes");
        b.pone(4 * NS, &[(0, 1), (1, 1)]);
        b.pone(5 * NS, &[(0, 0), (1, 0)]);
        assert_eq!(q595(&b), "10000000", "y tras el segundo el del primero");
    }

    #[test]
    fn el_595_con_los_flancos_en_ciclos_delta_distintos_del_mismo_instante_da_lo_mismo_en_cualquier_orden() {
        // Los dos relojes suben en el mismo instante pero en evaluaciones separadas, en un orden o en el otro.
        for primero in [0usize, 1] {
            let mut b = r595();
            b.pone(NS, &[(2, 1)]);
            // Una evaluación en el instante 2 con el primero, otra en el mismo instante con el segundo.
            b.pone(2 * NS, &[(primero, 1)]);
            b.pone(2 * NS, &[(1 - primero, 1)]);
            assert_eq!(q595(&b), "00000000", "orden {primero}");
            b.pone(3 * NS, &[(0, 0), (1, 0)]);
            b.pone(4 * NS, &[(primero, 1)]);
            b.pone(4 * NS, &[(1 - primero, 1)]);
            assert_eq!(q595(&b), "10000000", "orden {primero}");
        }
    }

    #[test]
    fn el_srclr_del_595_borra_el_desplazamiento_y_no_el_almacen() {
        let mut b = r595();
        b.pone(NS, &[(2, 1)]);
        let mut t = pulso(&mut b, 2 * NS, 0);
        t = pulso(&mut b, t, 1);
        assert_eq!(q595(&b), "10000000");
        b.pone(t, &[(3, 0)]);
        assert_eq!(q595(&b), "10000000", "el almacén no se borra");
        b.pone(t + NS, &[(3, 1)]);
        pulso(&mut b, t + 2 * NS, 1);
        assert_eq!(q595(&b), "00000000", "el desplazamiento borrado llega al almacén");
    }
}
