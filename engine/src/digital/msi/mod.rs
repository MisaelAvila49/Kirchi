//! Un núcleo de estado (contador, desplazamiento, aproximaciones) con una etapa de salida: cada salida es un bit del núcleo o
//! una columna de una tabla cuyas entradas son entradas del chip o bits del núcleo. Con ellos un chip secuencial es un dato.

mod aproximaciones;
mod contador;
mod desplazamiento;

use std::sync::Arc;

use self::aproximaciones::Aproximaciones;
use self::contador::Contador;
use self::desplazamiento::Desplazamiento;
use super::modelos::ModeloDigital;
use super::{a_ps, Nivel, Ps};
use crate::netlist::{Accion, Carga, Combina, FlancoReloj, Fuente, Nucleo, Reloj, SalidaMsi, Senal, TABLA_SALIDAS_MAX};

/// Fuentes de la tabla de salida que se enumeran cuando valen X (2^8 combinaciones); con más, la tabla da X.
const X_MAX: usize = 8;

/// Un registro de hasta 16 bits: el valor y qué bits están sin definir (X).
#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
pub(crate) struct Reg {
    pub v: u32,
    pub x: u32,
}

impl Reg {
    pub fn indefinido(bits: u8) -> Self {
        Self { v: 0, x: (1u32 << bits) - 1 }
    }

    pub fn bit(self, b: u8) -> Nivel {
        if self.x >> b & 1 == 1 {
            Nivel::X
        } else {
            Nivel::de_bool(self.v >> b & 1 == 1)
        }
    }

    /// El número que guarda, o −1 si algún bit está sin definir (lo que informa `lectura`).
    pub fn numero(self) -> f64 {
        if self.x == 0 {
            f64::from(self.v)
        } else {
            -1.0
        }
    }

    /// Lo que se sabe de un registro que vale `self` u `otro`: los bits en que difieren quedan sin definir.
    pub fn mezcla(self, otro: Self) -> Self {
        let x = self.x | otro.x | (self.v ^ otro.v);
        Self { v: self.v & !x, x }
    }

    /// El registro con los niveles de las entradas `datos` (el primero es el bit 0); X y Z quedan sin definir.
    pub fn de_entradas(e: &[Nivel], datos: &[usize]) -> Self {
        let mut r = Self::default();
        for (i, &d) in datos.iter().enumerate() {
            match e[d] {
                Nivel::Uno => r.v |= 1 << i,
                Nivel::Cero => {}
                _ => r.x |= 1 << i,
            }
        }
        r
    }
}

/// Nivel de una señal de control: Uno si está activa (con su polaridad), Cero si no, X si no se sabe.
pub(crate) fn activa(e: &[Nivel], s: &Senal) -> Nivel {
    if s.bajo { e[s.entrada].no() } else { e[s.entrada] }
}

/// Nivel del reloj efectivo: la Y o la O de sus señales con su polaridad.
pub(crate) fn nivel_reloj(e: &[Nivel], r: &Reloj) -> Nivel {
    match r.combina {
        Combina::Y => r.senales.iter().fold(Nivel::Uno, |a, s| a.y(activa(e, s))),
        Combina::O => r.senales.iter().fold(Nivel::Cero, |a, s| a.o(activa(e, s))),
    }
}

/// El nivel al que va el reloj efectivo cuando dispara.
pub(crate) fn nivel_activo(r: &Reloj) -> Nivel {
    if r.flanco == FlancoReloj::Subida { Nivel::Uno } else { Nivel::Cero }
}

/// Dispara al llegar al nivel activo desde cualquier otro, también desde X: un reloj lento pasa por X, igual que en los biestables.
pub(crate) fn flanco(antes: Nivel, ahora: Nivel, r: &Reloj) -> bool {
    ahora == nivel_activo(r) && antes != ahora
}

/// Todas las señales activas: Uno, Cero si alguna no lo está, X si ninguna es Cero pero alguna no se sabe.
pub(crate) fn todas_activas(e: &[Nivel], v: &[Senal]) -> Nivel {
    v.iter().fold(Nivel::Uno, |a, s| a.y(activa(e, s)))
}

/// Lo que pide un control activo sobre un registro: hacerlo, o dejarlo sin definir si el control vale X.
pub(crate) enum Orden {
    Hacer,
    Indefinido,
}

pub(crate) fn orden(nivel: Nivel) -> Option<Orden> {
    match nivel {
        Nivel::Uno => Some(Orden::Hacer),
        Nivel::Cero => None,
        _ => Some(Orden::Indefinido),
    }
}

/// La orden de un borrado del tipo pedido (síncrono o asíncrono), si está activo o no se sabe.
pub(crate) fn borrado(e: &[Nivel], a: &Option<Accion>, sincrona: bool) -> Option<Orden> {
    a.as_ref().filter(|a| a.sincrona == sincrona).and_then(|a| orden(activa(e, &a.senal)))
}

/// La orden de una carga del tipo pedido y la carga misma.
pub(crate) fn cargado<'a>(e: &[Nivel], c: &'a Option<Carga>, sincrona: bool) -> Option<(Orden, &'a Carga)> {
    c.as_ref().filter(|c| c.sincrona == sincrona).and_then(|c| orden(activa(e, &c.senal)).map(|o| (o, c)))
}

/// Lo que imponen el borrado y la carga asíncronos (el borrado manda): el registro y si se impone seguro. Con un control en X
/// no es seguro y el núcleo mezcla lo impuesto con lo que haría sin él: soltar CLR por la zona X no pierde la cuenta en 0.
pub(crate) fn asincronos(e: &[Nivel], borra: &Option<Accion>, carga: &Option<Carga>) -> Option<(Reg, bool)> {
    let duda = match borrado(e, borra, false) {
        Some(Orden::Hacer) => return Some((Reg::default(), true)),
        Some(Orden::Indefinido) => Some(Reg::default()),
        None => None,
    };
    match cargado(e, carga, false) {
        Some((o, c)) => {
            let r = Reg::de_entradas(e, &c.datos);
            Some((duda.map_or(r, |d| d.mezcla(r)), matches!(o, Orden::Hacer)))
        }
        None => duda.map(|d| (d, false)),
    }
}

#[derive(Clone)]
enum Estado {
    Contador(Contador),
    Desplazamiento(Desplazamiento),
    Aproximaciones(Aproximaciones),
}

impl Estado {
    fn nuevo(n: &Nucleo) -> Self {
        match n {
            Nucleo::Contador { bits, modulo, reloj, abajo, sentido, habilita, borra, carga } => {
                Self::Contador(Contador::new(*bits, *modulo, reloj.clone(), abajo.clone(), *sentido, habilita.clone(), *borra, carga.clone()))
            }
            Nucleo::Desplazamiento { bits, reloj, serie, borra, carga, almacen } => {
                Self::Desplazamiento(Desplazamiento::new(*bits, reloj.clone(), serie.clone(), *borra, carga.clone(), almacen.clone()))
            }
            Nucleo::Aproximaciones { bits, cs, wr, rd, comparador, reloj, ciclos_inicio, ciclos_bit } => {
                Self::Aproximaciones(Aproximaciones::new(*bits, *cs, *wr, *rd, *comparador, reloj.clone(), *ciclos_inicio, *ciclos_bit))
            }
        }
    }

    fn iniciar(&mut self, e: &[Nivel]) {
        match self {
            Self::Contador(c) => c.iniciar(e),
            Self::Desplazamiento(d) => d.iniciar(e),
            Self::Aproximaciones(a) => a.iniciar(e),
        }
    }

    /// Guarda lo que otro registro debe leer como estaba al empezar el instante.
    fn congelar(&mut self) {
        if let Self::Desplazamiento(d) = self {
            d.congelar();
        }
    }

    fn paso(&mut self, ahora: Ps, e: &[Nivel]) {
        match self {
            Self::Contador(c) => c.paso(e),
            Self::Desplazamiento(d) => d.paso(e),
            Self::Aproximaciones(a) => a.paso(ahora, e),
        }
    }

    fn fuente(&self, f: Fuente) -> Nivel {
        let (principal, aux, bandera) = match self {
            Self::Contador(c) => (c.reg, Reg::default(), Nivel::Cero),
            Self::Desplazamiento(d) => (d.reg, d.aux, Nivel::Cero),
            Self::Aproximaciones(a) => (a.reg, a.aux, Nivel::de_bool(a.fin)),
        };
        match f {
            Fuente::Bit(b) => principal.bit(b),
            Fuente::Aux(b) => aux.bit(b),
            Fuente::Bandera(_) => bandera,
            Fuente::Entrada(_) => unreachable!("una entrada la lee la etapa de salida"),
        }
    }

    fn despertar(&self) -> Option<Ps> {
        match self {
            Self::Aproximaciones(a) => a.proximo,
            _ => None,
        }
    }

    fn lectura(&self) -> (f64, Option<f64>) {
        match self {
            Self::Contador(c) => (c.reg.numero(), None),
            Self::Desplazamiento(d) => (d.reg.numero(), d.con_almacen().then(|| d.aux.numero())),
            Self::Aproximaciones(a) => (a.reg.numero(), Some(a.aux.numero())),
        }
    }

    fn bytes_heap(&self) -> usize {
        match self {
            Self::Contador(c) => c.bytes_heap(),
            Self::Desplazamiento(d) => d.bytes_heap(),
            Self::Aproximaciones(a) => a.bytes_heap(),
        }
    }
}

#[derive(Clone)]
pub struct Msi {
    ent: Vec<u32>,
    sal: Vec<u32>,
    nucleo: Estado,
    de: Vec<SalidaMsi>,
    fuentes: Vec<Fuente>,
    tabla: Option<Arc<[u64]>>,
    retardos: Vec<[Ps; 2]>,
    abierta: Vec<bool>,
    tres: bool,
    z: Nivel,
    /// Instante de la última evaluación: al cambiar se guarda el registro que otros registros leen.
    instante: Ps,
}

impl Msi {
    /// `tres` dice si alguna salida puede quedar en Z (lo calcula `Element::tres_estados`). La primera fuente de la tabla es el
    /// bit más significativo del índice y la primera columna ocupa los dos bits bajos de cada fila.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        entradas: &[usize],
        salidas: &[usize],
        nucleo: &Nucleo,
        de: &[SalidaMsi],
        fuentes: &[Fuente],
        tabla: Option<Arc<[u64]>>,
        retardos: &[[f64; 2]],
        abierta: &[bool],
        tres: bool,
        z: Nivel,
    ) -> Self {
        Self {
            ent: entradas.iter().map(|&k| k as u32).collect(),
            sal: salidas.iter().map(|&k| k as u32).collect(),
            nucleo: Estado::nuevo(nucleo),
            de: de.to_vec(),
            fuentes: fuentes.to_vec(),
            tabla,
            retardos: retardos.iter().map(|d| [a_ps(d[0]).max(1), a_ps(d[1]).max(1)]).collect(),
            abierta: if abierta.is_empty() { vec![false; salidas.len()] } else { abierta.to_vec() },
            tres,
            z,
            instante: 0,
        }
    }

    fn valor(&self, f: Fuente, e: &[Nivel]) -> Nivel {
        match f {
            Fuente::Entrada(i) => e[i],
            _ => self.nucleo.fuente(f),
        }
    }

    /// Las columnas de la tabla de salida para las fuentes de ahora: una fuente en X se enumera en 0 y en 1, y la columna solo
    /// vale algo si todas las combinaciones coinciden.
    fn columnas(&self, e: &[Nivel], fuera: &mut [Nivel; TABLA_SALIDAS_MAX]) {
        let Some(tabla) = &self.tabla else { return };
        let total = self.fuentes.len();
        let (mut base, mut inciertos, mut n) = (0usize, [0usize; X_MAX], 0);
        for (p, &f) in self.fuentes.iter().enumerate() {
            let peso = total - 1 - p;
            match self.valor(f, e) {
                Nivel::Uno => base |= 1 << peso,
                Nivel::Cero => {}
                _ if n < X_MAX => {
                    inciertos[n] = peso;
                    n += 1;
                }
                _ => {
                    fuera.fill(Nivel::X);
                    return;
                }
            }
        }
        let mut vistos = [0u8; TABLA_SALIDAS_MAX];
        for c in 0..1usize << n {
            let mut i = base;
            for (j, &peso) in inciertos[..n].iter().enumerate() {
                if c >> j & 1 == 1 {
                    i |= 1 << peso;
                }
            }
            let fila = tabla[i];
            for (j, v) in vistos.iter_mut().enumerate() {
                *v |= 1 << (fila >> (2 * j) & 3);
            }
        }
        for (j, &v) in vistos.iter().enumerate() {
            fuera[j] = match v {
                1 => Nivel::Cero,
                2 => Nivel::Uno,
                4 => Nivel::Z,
                _ => Nivel::X,
            };
        }
    }

    /// El nivel que quiere cada salida con el estado y las entradas de ahora.
    fn niveles(&self, e: &[Nivel], fuera: &mut Vec<Nivel>) {
        let mut cols = [Nivel::X; TABLA_SALIDAS_MAX];
        if self.de.iter().any(|s| matches!(s, SalidaMsi::Tabla { .. })) {
            self.columnas(e, &mut cols);
        }
        fuera.clear();
        for (j, s) in self.de.iter().enumerate() {
            let n = match *s {
                SalidaMsi::Directa { fuente, negada } => {
                    let n = self.valor(fuente, e);
                    if negada { n.no() } else { n }
                }
                SalidaMsi::Tabla { columna } => cols[columna],
            };
            fuera.push(if self.abierta[j] && n == Nivel::Uno { Nivel::Z } else { n });
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

impl ModeloDigital for Msi {
    fn bytes_heap(&self) -> usize {
        (self.ent.capacity() + self.sal.capacity()) * 4
            + self.de.capacity() * std::mem::size_of::<SalidaMsi>()
            + self.fuentes.capacity() * std::mem::size_of::<Fuente>()
            + self.retardos.capacity() * std::mem::size_of::<[Ps; 2]>()
            + self.abierta.capacity()
            + self.nucleo.bytes_heap()
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
        self.nucleo.iniciar(e);
        self.nucleo.congelar();
        let mut n = Vec::with_capacity(self.de.len());
        self.niveles(e, &mut n);
        s[..n.len()].copy_from_slice(&n);
    }
    fn evaluar(&mut self, ahora: Ps, e: &[Nivel], a: &[Nivel], out: &mut Vec<(usize, Nivel, Ps)>) {
        // Todo registro toma su dato de lo que valía al empezar el instante, lleguen los flancos en el ciclo delta que lleguen.
        if ahora != self.instante {
            self.nucleo.congelar();
            self.instante = ahora;
        }
        self.nucleo.paso(ahora, e);
        let mut n = Vec::with_capacity(self.de.len());
        self.niveles(e, &mut n);
        for (j, &nivel) in n.iter().enumerate() {
            out.push((j, nivel, self.retardo(j, a[j], nivel)));
        }
    }
    fn despertar(&self) -> Option<Ps> {
        self.nucleo.despertar()
    }
    fn lectura(&self) -> (f64, Option<f64>) {
        self.nucleo.lectura()
    }
}

#[cfg(test)]
pub(crate) mod banco {
    //! Un banco para probar un `Msi` sin el simulador: las entradas se ponen por índice, cada evaluación toma las salidas al
    //! instante (sin retardo) y se guardan como niveles.

    use super::*;

    pub struct Banco {
        pub m: Msi,
        pub e: Vec<Nivel>,
        pub s: Vec<Nivel>,
    }

    impl Banco {
        pub fn new(entradas: usize, nucleo: Nucleo, de: Vec<SalidaMsi>, fuentes: Vec<Fuente>, tabla: Option<Vec<u64>>, inicial: &[(usize, Nivel)]) -> Self {
            let mut e = vec![Nivel::Cero; entradas];
            for &(i, n) in inicial {
                e[i] = n;
            }
            let salidas = de.len();
            let ent: Vec<usize> = (0..entradas).collect();
            let sal: Vec<usize> = (entradas..entradas + salidas).collect();
            let mut m = Msi::new(&ent, &sal, &nucleo, &de, &fuentes, tabla.map(Arc::from), &vec![[1e-9, 1e-9]; salidas], &[], false, Nivel::X);
            let mut s = vec![Nivel::Z; salidas];
            m.iniciar(&e, &mut s);
            Self { m, e, s }
        }

        /// Cambia entradas y evalúa en el instante `t` (los niveles de salida quedan al instante).
        pub fn en(&mut self, t: Ps, cambios: &[(usize, Nivel)]) {
            for &(i, n) in cambios {
                self.e[i] = n;
            }
            let mut out = Vec::new();
            self.m.evaluar(t, &self.e, &self.s, &mut out);
            for &(j, n, _) in &out {
                self.s[j] = n;
            }
        }

        pub fn pone(&mut self, t: Ps, cambios: &[(usize, u8)]) {
            let c: Vec<(usize, Nivel)> = cambios.iter().map(|&(i, v)| (i, Nivel::de_bool(v == 1))).collect();
            self.en(t, &c);
        }

        /// Las salidas `desde..desde + n` como número, con la primera en el bit 0; None si alguna no es 0 ni 1.
        pub fn numero(&self, desde: usize, n: usize) -> Option<u32> {
            let mut v = 0;
            for j in 0..n {
                match self.s[desde + j] {
                    Nivel::Uno => v |= 1 << j,
                    Nivel::Cero => {}
                    _ => return None,
                }
            }
            Some(v)
        }
    }

    /// Una señal activa en alto de la entrada `i`.
    pub fn alta(i: usize) -> Senal {
        Senal { entrada: i, bajo: false }
    }

    /// Una señal activa en bajo de la entrada `i`.
    pub fn baja(i: usize) -> Senal {
        Senal { entrada: i, bajo: true }
    }

    /// Un reloj de una sola señal que dispara en la subida.
    pub fn sube(i: usize) -> Reloj {
        Reloj { senales: vec![alta(i)], combina: Combina::Y, flanco: FlancoReloj::Subida }
    }

    pub fn bit(b: u8) -> SalidaMsi {
        SalidaMsi::Directa { fuente: Fuente::Bit(b), negada: false }
    }
}
