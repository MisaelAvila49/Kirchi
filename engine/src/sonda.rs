//! Sondas de los instrumentos: registran lo que miden (voltaje entre dos nodos, corriente de un elemento o nivel digital) en cada paso aceptado de su isla, sin reservar memoria: búfer circular de muestras crudas, rejilla de columnas con mínimo, máximo e integrales, y disparos interpolados. Las arma `Mixto` y las lee el worker por `wasm.rs`.

use serde::Deserialize;

/// Columnas de la rejilla de cada sonda: dos pantallas de 2,048.
pub const COLUMNAS: usize = 4096;
/// La columna de la rejilla mide al menos esto por el paso máximo de la isla (`fijar_columna_minima`): un paso que cruza una
/// columna cuesta tres veces uno que queda dentro (23 contra 8 ns por muestra), y con cuatro pasos por columna solo uno de
/// cada cuatro la cruza.
pub const PASOS_POR_COLUMNA: f64 = 4.0;
/// Instantes de disparo que se recuerdan.
pub const MAX_DISPAROS: usize = 256;
/// Frecuencia de corte del acoplamiento AC (Hz): −3 dB a 10 Hz, como un osciloscopio de banco.
pub const FRECUENCIA_AC: f64 = 10.0;
/// La columna vio una red en X o en Z (sus valores no son finitos y no entran al mínimo, al máximo ni a las integrales).
pub const BANDERA_X: u8 = 1;
pub const BANDERA_Z: u8 = 2;
/// La columna salió de la rejilla y no de las muestras crudas: su mínimo y su máximo abarcan las columnas de la rejilla que
/// la tocan y sus integrales se reparten en proporción al tiempo.
pub const BANDERA_GRUESA: u8 = 4;
/// No hay nada registrado en el intervalo de la columna.
pub const BANDERA_VACIA: u8 = 8;
/// Una columna de la rejilla que la pantalla cubre menos que esta fracción de su ancho solo la toca en el borde.
const BORDE_TOCADO: f64 = 1e-6;

/// Cómo sigue el valor entre dos muestras.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Interpolacion {
    /// En línea recta (lo analógico: así entiende el motor la onda dentro de su tolerancia).
    Lineal,
    /// Se queda en el valor de la muestra anterior hasta la siguiente (una red digital cambia de nivel en el evento).
    Escalon,
}

/// Disparo por flanco: el cruce de `nivel` hacia arriba (`subida`) o hacia abajo, armado al alejarse `histeresis` del nivel.
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Disparo {
    pub nivel: f64,
    pub subida: bool,
    #[serde(default)]
    pub histeresis: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Acople {
    #[default]
    Dc,
    Ac,
}

/// Lo que el worker ajusta de una sonda en caliente: el ancho de la columna de la rejilla, el acoplamiento y el disparo.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConfigSonda {
    pub columna: f64,
    #[serde(default)]
    pub acople: Acople,
    #[serde(default)]
    pub disparo: Option<Disparo>,
}

/// Una columna: lo que pasó en un intervalo de tiempo.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Columna {
    pub min: f64,
    pub max: f64,
    pub primero: f64,
    pub ultimo: f64,
    /// ∫v·dt y ∫v²·dt sobre el intervalo (V·s y V²·s).
    pub iv: f64,
    pub iv2: f64,
    pub banderas: u8,
}

impl Columna {
    pub const VACIA: Columna =
        Columna { min: f64::INFINITY, max: f64::NEG_INFINITY, primero: f64::NAN, ultimo: f64::NAN, iv: 0.0, iv2: 0.0, banderas: BANDERA_VACIA };

    pub fn vacia(&self) -> bool {
        self.banderas & BANDERA_VACIA != 0
    }

    fn marcar(&mut self, v: f64) -> bool {
        if v.is_finite() {
            return true;
        }
        self.banderas |= if v.is_nan() { BANDERA_X } else { BANDERA_Z };
        false
    }

    /// Un valor en un instante (el principio de lo registrado o dos muestras en el mismo instante).
    fn punto(&mut self, v: f64) {
        let finito = self.marcar(v);
        if self.vacia() {
            self.banderas &= !BANDERA_VACIA;
            self.primero = v;
        }
        if finito {
            self.min = self.min.min(v);
            self.max = self.max.max(v);
        }
        self.ultimo = v;
    }

    /// Como `tramo`, cuando la columna ya tiene datos y sus banderas de `va` (el final del tramo anterior, en la misma columna):
    /// lo que hace cada paso aceptado de una sonda casi siempre. `va` ya está en el mínimo y el máximo: es el valor exacto de
    /// la muestra anterior, con el que terminó el tramo anterior (`entre` da el valor de la muestra misma sin interpolar).
    #[inline]
    fn seguir(&mut self, h: f64, va: f64, vb: f64) {
        let fa = va.is_finite();
        let fb = self.marcar(vb);
        if fb {
            self.min = self.min.min(vb);
            self.max = self.max.max(vb);
            if fa {
                self.iv += h * 0.5 * (va + vb);
                self.iv2 += h * (va * va + va * vb + vb * vb) / 3.0;
            }
        }
        self.ultimo = vb;
    }

    /// El tramo de `a` a `b` (dentro de la columna) que va de `va` a `vb`. En un escalón, `vb` es igual a `va`.
    fn tramo(&mut self, a: f64, va: f64, b: f64, vb: f64) {
        self.punto(va);
        let fa = self.marcar(va);
        let fb = self.marcar(vb);
        if fb {
            self.min = self.min.min(vb);
            self.max = self.max.max(vb);
        }
        self.ultimo = vb;
        if fa && fb {
            let h = b - a;
            self.iv += h * 0.5 * (va + vb);
            self.iv2 += h * (va * va + va * vb + vb * vb) / 3.0;
        }
    }

    /// Junta `otra` (la siguiente en el tiempo) a esta: lo que hace una columna de pantalla que abarca varias de la rejilla.
    fn juntar(&mut self, otra: &Columna, fraccion: f64) {
        if otra.vacia() {
            return;
        }
        if self.vacia() {
            self.banderas &= !BANDERA_VACIA;
            self.primero = otra.primero;
        }
        self.min = self.min.min(otra.min);
        self.max = self.max.max(otra.max);
        self.ultimo = otra.ultimo;
        self.iv += fraccion * otra.iv;
        self.iv2 += fraccion * otra.iv2;
        self.banderas |= otra.banderas & (BANDERA_X | BANDERA_Z);
    }
}

/// Integrales y periodos de un intervalo (el multímetro): ver `Sonda::ventana`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Ventana {
    /// Lo que de verdad se midió: la parte del intervalo pedido que el búfer cubre.
    pub desde: f64,
    pub hasta: f64,
    pub iv: f64,
    pub iv2: f64,
    pub min: f64,
    pub max: f64,
    /// Periodos completos entre el primer y el último cruce de subida del promedio, y sus integrales.
    pub periodos: u32,
    pub p0: f64,
    pub p1: f64,
    pub iv_p: f64,
    pub iv2_p: f64,
    /// Tiempo por encima del nivel medio ((mínimo + máximo)/2) dentro de los periodos completos: el ciclo de trabajo.
    pub alto_p: f64,
    /// El tiempo medido sin X ni Z (lo que no entra a las integrales): el denominador de un promedio. Sin X ni Z, el intervalo.
    pub t_valido: f64,
}

impl Ventana {
    /// Las trece cifras en el orden que lee la interfaz (`sonda_ventana` de `wasm.rs`).
    pub fn cifras(&self) -> [f64; 13] {
        [self.desde, self.hasta, self.iv, self.iv2, self.min, self.max, self.periodos as f64, self.p0, self.p1, self.iv_p, self.iv2_p, self.alto_p, self.t_valido]
    }
}

pub struct Sonda {
    interp: Interpolacion,
    mascara: usize,
    t: Vec<f64>,
    v: Vec<f32>,
    /// Muestras empujadas desde el principio (la más vieja que queda es `total - capacidad`).
    total: u64,
    /// La última muestra, exacta en f64 (la rejilla y el filtro la usan).
    ultimo: Option<(f64, f64)>,
    dt: f64,
    /// El ancho de columna que se pidió (`configurar`) y el paso máximo de la isla (`fijar_columna_minima`): `dt` es el mayor.
    columna_pedida: f64,
    columna_min: f64,
    rejilla: Vec<Columna>,
    /// Índice absoluto (`floor(t / dt)`) de la columna más reciente de la rejilla.
    k_max: i64,
    /// La columna de la última muestra (`k_de` de su instante), para no volver a dividir en cada paso; `i64::MIN` sin ella.
    k_ult: i64,
    /// Dónde empieza y dónde termina esa columna: una muestra que cae entre los dos es de la misma columna sin dividir.
    ini_ult: f64,
    fin_ult: f64,
    acople: Acople,
    /// Entrada y salida anteriores del pasa altos.
    x_ant: f64,
    y_ant: f64,
    disparo: Option<Disparo>,
    armado: bool,
    disparos: Vec<f64>,
    n_disparos: u64,
    /// El instante de la primera muestra de la rejilla desde que se vació (NaN si está vacía): su primera columna puede estar
    /// llena solo desde ahí.
    inicio_rejilla: f64,
    /// false en una sonda que solo guarda sus muestras (`quitar_rejilla`).
    con_rejilla: bool,
    /// La rejilla se lleva al día (`revisar_rejilla`): con una sonda que tiene rejilla, mientras el búfer crudo cubra
    /// menos de tres veces lo que abarca la rejilla. Si el búfer cubre más, cualquier columna que la rejilla podría dar
    /// también sale de las muestras crudas, y llevarla al día en cada paso era la mitad del costo de una sonda.
    rejilla_viva: bool,
    /// false mientras nadie la lee (`activar`): no registra.
    activa: bool,
    /// Primera muestra absoluta que todavía vale en el búfer: tras `recortar` en un búfer que ya había dado la vuelta, lo
    /// anterior a `total − capacidad` se sobrescribió con muestras que se descartaron.
    piso: u64,
}

/// Lo que hace falta de una sonda para recortar lo registrado hasta un instante anterior (`Sonda::estado` y `Sonda::recortar`),
/// sin copiar el búfer: cuántas muestras llevaba, la última, el filtro del acoplamiento AC y el disparo.
#[derive(Clone, Copy, Debug)]
pub struct EstadoSonda {
    total: u64,
    ultimo: Option<(f64, f64)>,
    x_ant: f64,
    y_ant: f64,
    armado: bool,
    n_disparos: u64,
}

impl Sonda {
    /// `muestras` es potencia de dos (`Netlist::validate` acota 1,024 a 262,144); `columna`, el ancho de la rejilla (s).
    pub fn new(interp: Interpolacion, muestras: usize, columna: f64) -> Self {
        assert!(muestras.is_power_of_two(), "la capacidad de una sonda es potencia de dos");
        Self {
            interp,
            mascara: muestras - 1,
            t: vec![0.0; muestras],
            v: vec![0.0; muestras],
            total: 0,
            ultimo: None,
            dt: columna,
            columna_pedida: columna,
            columna_min: 0.0,
            rejilla: vec![Columna::VACIA; COLUMNAS],
            k_max: i64::MIN,
            k_ult: i64::MIN,
            ini_ult: f64::NAN,
            fin_ult: f64::NAN,
            acople: Acople::Dc,
            x_ant: 0.0,
            y_ant: 0.0,
            disparo: None,
            armado: false,
            disparos: vec![f64::NAN; MAX_DISPAROS],
            n_disparos: 0,
            inicio_rejilla: f64::NAN,
            con_rejilla: true,
            rejilla_viva: true,
            activa: true,
            piso: 0,
        }
    }

    /// Lo que lleva registrado ahora, para `recortar` después.
    pub fn estado(&self) -> EstadoSonda {
        EstadoSonda { total: self.total, ultimo: self.ultimo, x_ant: self.x_ant, y_ant: self.y_ant, armado: self.armado, n_disparos: self.n_disparos }
    }

    /// Descarta lo registrado después de `e` (retroceder): lo que el búfer circular ya sobrescribió no se recupera, y una sonda vaciada o reconfigurada desde `e` queda vacía.
    pub fn recortar(&mut self, e: &EstadoSonda) {
        let capacidad = self.mascara as u64 + 1;
        let vive_desde = self.total.saturating_sub(capacidad).max(self.piso);
        if e.total > self.total || e.total <= vive_desde {
            // Nada de lo de entonces sobrevive: se empieza de cero.
            self.total = 0;
            self.piso = 0;
            self.ultimo = None;
            self.n_disparos = 0;
            self.armado = false;
            self.vaciar_rejilla();
            return;
        }
        self.piso = vive_desde;
        self.total = e.total;
        self.ultimo = e.ultimo;
        self.x_ant = e.x_ant;
        self.y_ant = e.y_ant;
        self.armado = e.armado;
        // Los disparos del anillo: valen si no se sobrescribió ninguno de los que había.
        self.n_disparos = if self.n_disparos - e.n_disparos.min(self.n_disparos) >= MAX_DISPAROS as u64 { 0 } else { e.n_disparos };
        if self.rejilla_viva && self.con_rejilla {
            self.sembrar_rejilla();
        } else {
            self.vaciar_rejilla();
        }
    }

    /// Memoria que reserva (bytes): el criterio 6 suma la de todas las sondas de un circuito.
    pub fn bytes(&self) -> usize {
        Self::bytes_de(self.mascara + 1)
    }

    pub fn bytes_de(muestras: usize) -> usize {
        muestras * 12 + COLUMNAS * std::mem::size_of::<Columna>() + MAX_DISPAROS * 8
    }

    /// Cambia la rejilla, el acoplamiento y el disparo. Una rejilla de otro ancho empieza vacía; otro acoplamiento borra lo
    /// registrado (la sonda guarda el valor acoplado); un disparo nuevo olvida los anteriores.
    pub fn configurar(&mut self, c: &ConfigSonda) {
        self.columna_pedida = c.columna;
        self.poner_columna(c.columna.max(self.columna_min));
        if c.acople != self.acople {
            self.acople = c.acople;
            self.total = 0;
            self.piso = 0;
            self.ultimo = None;
            self.rejilla.fill(Columna::VACIA);
            self.k_max = i64::MIN;
            self.k_ult = i64::MIN;
            self.inicio_rejilla = f64::NAN;
        }
        if c.disparo != self.disparo {
            self.disparo = c.disparo;
            self.armado = false;
            self.n_disparos = 0;
        }
    }

    /// La rejilla nunca es más fina que `PASOS_POR_COLUMNA` pasos máximos `h` de la isla de la sonda: con columnas más chicas que el paso, cada paso
    /// cruzaba varias (lo más caro de registrar un paso) sin agregar nada a lo que dicen las muestras, y donde la rejilla
    /// importa (cuando el búfer crudo no cubre la pantalla) los pasos son mucho más cortos que una columna.
    pub fn fijar_columna_minima(&mut self, h: f64) {
        self.columna_min = PASOS_POR_COLUMNA * h;
        self.poner_columna(self.columna_pedida.max(self.columna_min));
    }

    /// La sonda solo guarda sus muestras: cada paso no actualiza la rejilla y lo que el búfer ya no cubre queda vacío (las del
    /// multímetro, cuya lectura es la ventana sobre las muestras crudas).
    pub fn quitar_rejilla(&mut self) {
        self.con_rejilla = false;
        self.rejilla_viva = false;
    }

    /// Lo que abarca la rejilla (s): sus `COLUMNAS` columnas.
    fn alcance_rejilla(&self) -> f64 {
        COLUMNAS as f64 * self.dt
    }

    /// Cada 1,024 muestras: con el búfer crudo cubriendo tres veces el alcance de la rejilla o más, la rejilla deja de
    /// llevarse al día (se vacía); si con ella apagada lo cubierto baja de dos veces su alcance (pasos más cortos), se
    /// vuelve a armar desde las muestras crudas, que todavía cubren todo lo que ella abarca.
    fn revisar_rejilla(&mut self) {
        if !self.con_rejilla || self.total == 0 {
            return;
        }
        let cubierto = self.tiempo() - self.cubre_desde();
        let alcance = self.alcance_rejilla();
        if self.rejilla_viva && cubierto >= 3.0 * alcance {
            self.rejilla_viva = false;
            self.vaciar_rejilla();
        } else if !self.rejilla_viva && cubierto < 2.0 * alcance {
            self.rejilla_viva = true;
            self.sembrar_rejilla();
        }
    }

    fn vaciar_rejilla(&mut self) {
        self.rejilla.fill(Columna::VACIA);
        self.k_max = i64::MIN;
        self.k_ult = i64::MIN;
        self.inicio_rejilla = f64::NAN;
    }

    /// La rejilla desde las muestras crudas, como si se hubiera llevado al día (con los valores del búfer, en f32).
    fn sembrar_rejilla(&mut self) {
        self.vaciar_rejilla();
        let mut ant: Option<(f64, f64)> = None;
        for j in self.primera()..self.total {
            let (t, v) = self.cruda(j);
            if self.inicio_rejilla.is_nan() {
                self.inicio_rejilla = t;
            }
            self.rejilla_muestra(ant, t, v);
            ant = Some((t, v));
        }
    }

    /// En pausa la sonda no registra (la del multímetro que su modo no lee: cada muestra cuesta en cada paso). Al volver
    /// empieza vacía, como recién creada: lo de antes de la pausa no se une con lo nuevo.
    pub fn activar(&mut self, si: bool) {
        if si && !self.activa {
            self.total = 0;
            self.piso = 0;
            self.ultimo = None;
            self.rejilla.fill(Columna::VACIA);
            self.k_max = i64::MIN;
            self.k_ult = i64::MIN;
            self.inicio_rejilla = f64::NAN;
            (self.x_ant, self.y_ant) = (0.0, 0.0);
            self.armado = false;
            self.n_disparos = 0;
        }
        self.activa = si;
    }

    pub fn activa(&self) -> bool {
        self.activa
    }

    /// El ancho de las columnas de la rejilla (s).
    pub fn ancho_de_columna(&self) -> f64 {
        self.dt
    }

    /// Una rejilla de otro ancho empieza vacía.
    fn poner_columna(&mut self, dt: f64) {
        if dt != self.dt {
            self.dt = dt;
            self.rejilla.fill(Columna::VACIA);
            self.k_max = i64::MIN;
            self.k_ult = i64::MIN;
            self.inicio_rejilla = f64::NAN;
        }
    }

    pub fn interpolacion(&self) -> Interpolacion {
        self.interp
    }

    /// El instante de la última muestra (el tiempo de la isla de la sonda); −∞ sin muestras.
    pub fn tiempo(&self) -> f64 {
        self.ultimo.map_or(f64::NEG_INFINITY, |u| u.0)
    }

    /// Muestras que recibió desde el principio (las que caben en el búfer son las últimas).
    pub fn registradas(&self) -> u64 {
        self.total
    }

    /// El valor de la última muestra (ya acoplado); NaN sin muestras.
    pub fn ultimo_valor(&self) -> f64 {
        self.ultimo.map_or(f64::NAN, |u| u.1)
    }

    /// El instante de la muestra más vieja del búfer crudo; +∞ sin muestras.
    pub fn cubre_desde(&self) -> f64 {
        if self.total == 0 {
            return f64::INFINITY;
        }
        self.t[(self.primera() as usize) & self.mascara]
    }

    fn primera(&self) -> u64 {
        self.total.saturating_sub(self.mascara as u64 + 1).max(self.piso)
    }

    fn cruda(&self, j: u64) -> (f64, f64) {
        let i = (j as usize) & self.mascara;
        (self.t[i], self.v[i] as f64)
    }

    /// El índice absoluto de la primera muestra cruda posterior a `t` (`total` si ninguna lo es).
    fn posterior_a(&self, t: f64) -> u64 {
        let (mut lo, mut hi) = (self.primera(), self.total);
        while lo < hi {
            let m = lo + (hi - lo) / 2;
            if self.cruda(m).0 <= t {
                lo = m + 1;
            } else {
                hi = m;
            }
        }
        lo
    }

    /// Registra el valor `v` en el instante `t` (el final de un paso aceptado). Un instante anterior al último se toma como
    /// el último (una isla nunca retrocede; el reloj de la lógica puede repetir el suyo).
    pub fn empujar(&mut self, t: f64, v: f64) {
        if !self.activa {
            return;
        }
        // Lo de casi todos los pasos, sin más vueltas: lineal, en continua, con rejilla, y la muestra nueva en la columna de la
        // anterior (que ya tiene su valor). La rejilla se vacía solo junto con `k_ult`.
        if let Some((tu, vu)) = self.ultimo {
            if t > tu && self.k_ult != i64::MIN && self.interp == Interpolacion::Lineal && self.acople == Acople::Dc && self.rejilla_viva {
                if t < self.fin_ult {
                    self.rejilla[Self::ranura(self.k_ult)].seguir(t - tu, vu, v);
                    if self.disparo.is_some() {
                        self.buscar_disparo(tu, vu, t, v);
                    }
                    self.guardar(t, v);
                    return;
                }
                // Lo que sigue en frecuencia: el tramo pasa a la columna siguiente (y no más allá). Se parte en el borde
                // como lo haría `rejilla_tramo`, sin buscar las columnas con divisiones.
                let k = self.k_ult + 1;
                let fin = (k + 1) as f64 * self.dt;
                if self.k_ult == self.k_max && t < fin {
                    let b = self.fin_ult;
                    let vb = self.entre(tu, vu, t, v, b);
                    self.rejilla[Self::ranura(self.k_ult)].seguir(b - tu, vu, vb);
                    let c = &mut self.rejilla[Self::ranura(k)];
                    *c = Columna::VACIA;
                    if t > b {
                        c.tramo(b, vb, t, v);
                    } else {
                        c.punto(v);
                    }
                    self.k_max = k;
                    self.k_ult = k;
                    (self.ini_ult, self.fin_ult) = (b, fin);
                    if self.disparo.is_some() {
                        self.buscar_disparo(tu, vu, t, v);
                    }
                    self.guardar(t, v);
                    return;
                }
            }
        }
        let t = self.ultimo.map_or(t, |u| t.max(u.0));
        if self.inicio_rejilla.is_nan() {
            self.inicio_rejilla = t;
        }
        let v = self.acoplar(t, v);
        if !self.rejilla_viva {
            if let Some((tu, vu)) = self.ultimo {
                if t > tu {
                    self.buscar_disparo(tu, vu, t, v);
                }
            }
            self.guardar(t, v);
            return;
        }
        let ultimo = self.ultimo;
        self.rejilla_muestra(ultimo, t, v);
        if let Some((tu, vu)) = ultimo {
            if t > tu {
                self.buscar_disparo(tu, vu, t, v);
            }
        }
        self.guardar(t, v);
    }

    /// La muestra (t, v) en la rejilla, con `ultimo` la anterior: lo de `empujar` sin el búfer ni el disparo.
    fn rejilla_muestra(&mut self, ultimo: Option<(f64, f64)>, t: f64, v: f64) {
        let k = if self.k_ult != i64::MIN && t >= self.ini_ult && t < self.fin_ult { self.k_ult } else { self.k_de(t) };
        match ultimo {
            // Lo de casi todos los pasos: el tramo nuevo queda en la columna de la muestra anterior, que ya tiene su valor.
            Some((tu, vu)) if t > tu && k == self.k_ult && self.interp == Interpolacion::Lineal && k <= self.k_max && !self.rejilla[Self::ranura(k)].vacia() => {
                let vb = self.entre(tu, vu, t, v, t);
                self.rejilla[Self::ranura(k)].seguir(t - tu, vu, vb);
            }
            Some((tu, vu)) if t > tu => {
                self.rejilla_tramo(tu, vu, t, v);
                // En un escalón el tramo sigue con el nivel de antes hasta el evento: el nivel nuevo entra a la columna del
                // evento como un punto (si no, una columna que termina sin otra muestra no lo tendría).
                if self.interp == Interpolacion::Escalon {
                    self.columna_mut(k).punto(v);
                }
            }
            _ => {
                self.columna_mut(k).punto(v);
            }
        }
        if k != self.k_ult {
            // La columna queda al día en la rejilla (un tramo que termina justo en su borde no la tocó): el camino rápido
            // escribe en ella sin preguntar, y con su valor (si el tramo terminó justo en su borde, la columna sigue vacía y
            // `seguir` no le quitaría la bandera).
            let c = self.columna_mut(k);
            if c.vacia() {
                c.punto(v);
            }
            self.k_ult = k;
            (self.ini_ult, self.fin_ult) = (k as f64 * self.dt, (k + 1) as f64 * self.dt);
        }
    }

    /// La muestra en el búfer circular.
    #[inline]
    fn guardar(&mut self, t: f64, v: f64) {
        let i = (self.total as usize) & self.mascara;
        self.t[i] = t;
        self.v[i] = v as f32;
        self.total += 1;
        self.ultimo = Some((t, v));
        if self.total & 1023 == 0 {
            self.revisar_rejilla();
        }
    }

    /// Pasa altos de primer orden (Euler hacia atrás) en el acoplamiento AC; las redes digitales no se acoplan.
    fn acoplar(&mut self, t: f64, x: f64) -> f64 {
        if self.acople == Acople::Dc || self.interp == Interpolacion::Escalon || !x.is_finite() {
            return x;
        }
        let y = match self.ultimo {
            None => 0.0,
            Some((tu, _)) => {
                let tau = 1.0 / (2.0 * std::f64::consts::PI * FRECUENCIA_AC);
                let a = tau / (tau + (t - tu));
                a * (self.y_ant + x - self.x_ant)
            }
        };
        self.x_ant = x;
        self.y_ant = y;
        y
    }

    fn k_de(&self, t: f64) -> i64 {
        (t / self.dt).floor() as i64
    }

    fn ranura(k: i64) -> usize {
        k.rem_euclid(COLUMNAS as i64) as usize
    }

    /// La columna `k` de la rejilla; al avanzar a una columna nueva, las que quedan atrás de la ventana se vacían.
    fn columna_mut(&mut self, k: i64) -> &mut Columna {
        if k > self.k_max {
            let desde = if self.k_max == i64::MIN { k } else { (self.k_max + 1).max(k - COLUMNAS as i64 + 1) };
            for j in desde..=k {
                self.rejilla[Self::ranura(j)] = Columna::VACIA;
            }
            self.k_max = k;
        }
        &mut self.rejilla[Self::ranura(k)]
    }

    /// El valor en `x` del tramo que va de (t0, v0) a (t1, v1).
    fn entre(&self, t0: f64, v0: f64, t1: f64, v1: f64, x: f64) -> f64 {
        match self.interp {
            Interpolacion::Escalon => v0,
            Interpolacion::Lineal => {
                // En las muestras mismas (casi todas las llamadas), su valor exacto y sin dividir.
                if x == t1 || t1 == t0 || !v0.is_finite() || !v1.is_finite() {
                    v1
                } else if x == t0 {
                    v0
                } else {
                    v0 + (v1 - v0) * (x - t0) / (t1 - t0)
                }
            }
        }
    }

    /// Reparte el tramo de t0 a t1 en las columnas de la rejilla que toca (a lo más las últimas `COLUMNAS`).
    fn rejilla_tramo(&mut self, t0: f64, v0: f64, t1: f64, v1: f64) {
        let (k0, k1) = (self.k_de(t0), self.k_de(t1));
        let desde = k0.max(k1 - COLUMNAS as i64 + 1);
        // Un tramo constante (un escalón digital entre eventos, una isla quieta que salta) llena las columnas de en medio con
        // el mismo valor: cada una nueva es lo que daría `tramo` sobre una vacía, sin interpolar ni vaciarla antes.
        let constante = self.interp == Interpolacion::Escalon || v0 == v1;
        let mut k = desde;
        while k <= k1 {
            if constante && k > k0 && k < k1 && k > self.k_max && self.k_max != i64::MIN {
                // Las columnas completas de en medio, todas iguales: una de `dt` con el valor constante.
                let mut c = Columna::VACIA;
                c.tramo(0.0, v0, self.dt, v0);
                for j in k..k1 {
                    self.rejilla[Self::ranura(j)] = c;
                }
                self.k_max = k1 - 1;
                k = k1;
                continue;
            }
            let a = t0.max(k as f64 * self.dt);
            let b = t1.min((k + 1) as f64 * self.dt);
            if b > a {
                let (va, vb) = (self.entre(t0, v0, t1, v1, a), self.entre(t0, v0, t1, v1, b));
                self.columna_mut(k).tramo(a, va, b, vb);
            }
            k += 1;
        }
    }

    fn buscar_disparo(&mut self, t0: f64, v0: f64, t1: f64, v1: f64) {
        let Some(d) = self.disparo else { return };
        if !v0.is_finite() || !v1.is_finite() {
            return;
        }
        // De bajada es la subida del valor con el signo cambiado.
        let (s0, s1, nivel) = if d.subida { (v0, v1, d.nivel) } else { (-v0, -v1, -d.nivel) };
        let h = d.histeresis.max(0.0);
        if s0 < nivel - h {
            self.armado = true;
        }
        if self.armado && s0 < nivel && s1 >= nivel {
            let tc = match self.interp {
                Interpolacion::Lineal => t0 + (nivel - s0) / (s1 - s0) * (t1 - t0),
                Interpolacion::Escalon => t1,
            };
            self.disparos[(self.n_disparos as usize) % MAX_DISPAROS] = tc;
            self.n_disparos += 1;
            self.armado = false;
        }
        if s1 < nivel - h {
            self.armado = true;
        }
    }

    /// El disparo más reciente que no pasa de `t_max`. Si el anillo ya se reescribió con disparos posteriores a `t_max` (la isla
    /// del canal va adelante del resto: un generador de 50 kHz da cientos de disparos en unos milisegundos), se busca en el búfer
    /// crudo hacia atrás con la misma regla.
    pub fn ultimo_disparo(&self, t_max: f64) -> Option<f64> {
        let n = self.n_disparos.min(MAX_DISPAROS as u64);
        let en_anillo = (0..n).map(|k| self.disparos[((self.n_disparos - 1 - k) as usize) % MAX_DISPAROS]).find(|&t| t <= t_max);
        if en_anillo.is_some() || self.n_disparos <= MAX_DISPAROS as u64 {
            return en_anillo;
        }
        self.disparo_en_bufer(t_max)
    }

    /// El último disparo que no pasa de `t_max` según las muestras crudas, con la regla del disparo configurado.
    fn disparo_en_bufer(&self, t_max: f64) -> Option<f64> {
        let d = self.disparo?;
        self.ultimo_cruce(t_max, d.nivel, d.histeresis.max(0.0), d.subida)
    }

    /// El último cruce armado de `nivel` (de subida o de bajada) que no pasa de `t_max`, buscado hacia atrás en las muestras
    /// crudas. Un cruce cuenta si estaba armado: si alguna muestra anterior bajó de `nivel − h` sin otro cruce en medio (el otro
    /// cruce lo habría desarmado). Es la regla de `buscar_disparo` y de `cruces` recorrida al revés; un tramo con X o Z no cuenta.
    fn ultimo_cruce(&self, t_max: f64, nivel: f64, h: f64, subida: bool) -> Option<f64> {
        if self.total < 2 || t_max.is_nan() {
            return None;
        }
        let (sg, nivel) = if subida { (1.0, nivel) } else { (-1.0, -nivel) };
        let primera = self.primera();
        // El tramo (j − 1, j) que contiene a `t_max` o, si ya pasó lo registrado, el último.
        let mut j = self.posterior_a(t_max).min(self.total - 1);
        let mut candidato: Option<f64> = None;
        while j > primera {
            let ((t0, v0), (t1, v1)) = (self.cruda(j - 1), self.cruda(j));
            j -= 1;
            if !v0.is_finite() || !v1.is_finite() {
                continue;
            }
            let (s0, s1) = (sg * v0, sg * v1);
            if s0 < nivel && s1 >= nivel {
                let tc = match self.interp {
                    Interpolacion::Lineal => t0 + (nivel - s0) / (s1 - s0) * (t1 - t0),
                    Interpolacion::Escalon => t1,
                };
                // Un cruce antes del candidato sin arme en medio lo invalida: el candidato es ahora este cruce.
                if tc <= t_max {
                    candidato = Some(tc);
                }
            }
            if candidato.is_some() && s0 < nivel - h {
                return candidato;
            }
        }
        None
    }

    /// El valor registrado en `t` (interpolado entre las muestras crudas); NaN fuera de lo que cubre el búfer.
    pub fn valor_en(&self, t: f64) -> f64 {
        self.valor_desde(t, u64::MAX).0
    }

    /// `posterior_a(t)` empezando por `pista` cuando es una cota por debajo (los instantes de una pantalla van en orden: se
    /// avanza muestra por muestra en lugar de buscar en todo el búfer cada vez); si no, la búsqueda binaria.
    fn posterior_desde(&self, t: f64, pista: u64) -> u64 {
        if pista < self.primera() || pista > self.total || (pista > self.primera() && self.cruda(pista - 1).0 > t) {
            return self.posterior_a(t);
        }
        let mut j = pista;
        while j < self.total && self.cruda(j).0 <= t {
            j += 1;
        }
        j
    }

    /// `valor_en(t)` con la pista de `posterior_desde`; devuelve también la pista para el instante siguiente.
    fn valor_desde(&self, t: f64, pista: u64) -> (f64, u64) {
        if self.total == 0 || !t.is_finite() || t < self.cubre_desde() || t > self.tiempo() {
            return (f64::NAN, pista);
        }
        let j = self.posterior_desde(t, pista);
        if j == self.total {
            return (self.ultimo.unwrap().1, j);
        }
        let (t1, v1) = self.cruda(j);
        if j == self.primera() {
            return (v1, j);
        }
        let (t0, v0) = self.cruda(j - 1);
        (self.entre(t0, v0, t1, v1, t), j)
    }

    /// La columna del intervalo [a, b) con lo que hay registrado hasta `tiempo()`: de las muestras crudas si el búfer cubre
    /// `a`; si no, de la rejilla.
    pub fn columna_en(&self, a: f64, b: f64) -> Columna {
        let hasta = self.tiempo();
        let b = b.min(hasta);
        if self.total == 0 || a > hasta || b < a {
            return Columna::VACIA;
        }
        if a >= self.cubre_desde() {
            self.columna_cruda(a, b)
        } else if self.con_rejilla {
            self.columna_de_rejilla_con_integrales(a, b)
        } else {
            Columna::VACIA
        }
    }

    fn columna_cruda(&self, a: f64, b: f64) -> Columna {
        self.columna_cruda_desde(a, b, u64::MAX).0
    }

    /// `columna_cruda(a, b)` con la pista de `posterior_desde`; devuelve también la pista para la columna siguiente.
    fn columna_cruda_desde(&self, a: f64, b: f64, pista: u64) -> (Columna, u64) {
        let mut c = Columna::VACIA;
        let mut j = self.posterior_desde(a, pista);
        let pista = j;
        if j == self.primera() {
            // `a` es la primera muestra exacta: no hay tramo anterior.
            let (t, v) = self.cruda(j);
            if t <= b {
                c.punto(v);
            }
            j += 1;
        }
        // El tramo que contiene `a` empieza en la muestra j - 1.
        let (mut t0, mut v0) = if j > self.primera() { self.cruda(j - 1) } else { (a, f64::NAN) };
        if a == b {
            c.punto(self.entre(t0, v0, t0, v0, a));
            return (c, pista);
        }
        while j < self.total {
            let (t1, v1) = self.cruda(j);
            let (x0, x1) = (t0.max(a), t1.min(b));
            if t1 == t0 {
                if t1 >= a && t1 <= b {
                    c.punto(v1);
                }
            } else if x1 > x0 {
                c.tramo(x0, self.entre(t0, v0, t1, v1, x0), x1, self.entre(t0, v0, t1, v1, x1));
            }
            if t1 >= b {
                break;
            }
            (t0, v0) = (t1, v1);
            j += 1;
        }
        (c, pista)
    }

    /// `columna_cruda(a, b)` para un intervalo largo (la ventana del multímetro): las mismas cuentas de `Columna::tramo` sin sus revisiones de X, Z y vacío. `None` si no es el caso sencillo (escalón, valor no finito, dos muestras en el mismo instante).
    fn columna_larga(&self, a: f64, b: f64) -> Option<Columna> {
        if self.interp != Interpolacion::Lineal || !(a < b) {
            return None;
        }
        let mut j = self.posterior_a(a);
        if j <= self.primera() || j >= self.total {
            return None;
        }
        let (mut t0, mut v0) = self.cruda(j - 1);
        if !v0.is_finite() {
            return None;
        }
        let (mut min, mut max, mut iv, mut iv2) = (f64::INFINITY, f64::NEG_INFINITY, 0.0, 0.0);
        let (mut primero, mut ultimo) = (f64::NAN, f64::NAN);
        loop {
            let (t1, v1) = self.cruda(j);
            if t1 == t0 || !v1.is_finite() {
                return None;
            }
            let (x0, x1) = (t0.max(a), t1.min(b));
            if x1 > x0 {
                let (ya, yb) = (self.entre(t0, v0, t1, v1, x0), self.entre(t0, v0, t1, v1, x1));
                if primero.is_nan() {
                    primero = ya;
                }
                min = min.min(ya).min(yb);
                max = max.max(ya).max(yb);
                ultimo = yb;
                let h = x1 - x0;
                iv += h * 0.5 * (ya + yb);
                iv2 += h * (ya * ya + ya * yb + yb * yb) / 3.0;
            }
            if t1 >= b {
                break;
            }
            (t0, v0) = (t1, v1);
            j += 1;
            if j >= self.total {
                break;
            }
        }
        if primero.is_nan() {
            return None;
        }
        Some(Columna { min, max, primero, ultimo, iv, iv2, banderas: 0 })
    }

    fn columna_de_rejilla(&self, a: f64, b: f64) -> Columna {
        let mut c = Columna::VACIA;
        if self.k_max == i64::MIN {
            return c;
        }
        let (ka, kb) = (self.k_de(a), self.k_de(b));
        let mas_vieja = self.k_max - COLUMNAS as i64 + 1;
        for k in ka.max(mas_vieja)..=kb.min(self.k_max) {
            let (inicio, fin) = (k as f64 * self.dt, (k + 1) as f64 * self.dt);
            // Lo que la columna tiene de verdad: la primera desde la primera muestra y la última hasta la última.
            let (lleno_ini, lleno_fin) = (inicio.max(self.inicio_rejilla), fin.min(self.tiempo()));
            let cubierto = (fin.min(b).min(lleno_fin) - inicio.max(a).max(lleno_ini)).max(0.0);
            let lleno = lleno_fin - lleno_ini;
            // Una columna que la pantalla solo toca en su borde no cuenta: su mínimo y su máximo son de otro intervalo. «Solo toca» incluye
            // el error de redondeo: con `a` un ulp bajo el borde, `k_de(a)` da la columna anterior y esta no aporta nada (en un rodillo,
            // una de cada cinco columnas de la mitad vieja salía con el mínimo y el máximo de su vecina).
            if cubierto <= BORDE_TOCADO * self.dt && (k != ka || b > a) {
                continue;
            }
            c.juntar(&self.rejilla[Self::ranura(k)], if lleno > 0.0 { (cubierto / lleno).min(1.0) } else { 1.0 });
        }
        if !c.vacia() {
            c.banderas |= BANDERA_GRUESA;
        }
        c
    }

    /// Lo de `columna_de_rejilla_para_dibujar` con las integrales de `columna_de_rejilla` (repartidas en proporción al tiempo cubierto).
    fn columna_de_rejilla_con_integrales(&self, a: f64, b: f64) -> Columna {
        let mut c = self.columna_de_rejilla_para_dibujar(a, b);
        if !c.vacia() {
            let g = self.columna_de_rejilla(a, b);
            (c.iv, c.iv2) = (g.iv, g.iv2);
        }
        c
    }

    /// Columna de pantalla [a, b) desde la rejilla, para DIBUJAR. Cada columna de la rejilla pertenece a una sola de pantalla, la que contiene su punto medio: así nada se cuenta dos veces y no salen picos falsos cuando los anchos no coinciden. Una columna más angosta que las de la rejilla interpola.
    fn columna_de_rejilla_para_dibujar(&self, a: f64, b: f64) -> Columna {
        let mut c = Columna::VACIA;
        if self.k_max == i64::MIN {
            return c;
        }
        let hasta = self.tiempo();
        let (ka, kb) = (self.k_de(a), self.k_de(b));
        let mas_vieja = self.k_max - COLUMNAS as i64 + 1;
        // Lo que la columna `k` tiene de verdad (la primera, desde la primera muestra; la última, hasta la última) y su punto medio.
        let lleno = |k: i64| {
            let (inicio, fin) = (k as f64 * self.dt, (k + 1) as f64 * self.dt);
            (inicio.max(self.inicio_rejilla), fin.min(hasta))
        };
        // Una columna de pantalla más angosta que las de la rejilla (pantallas de más columnas que la rejilla, p. ej. a 4× de resolución)
        // no recibe nunca el mínimo y el máximo de una columna de la rejilla: solo la que contiene su punto medio los llevaría y las vecinas
        // saldrían interpoladas, y la cima de cada columna de rejilla se vería como un pico entre columnas más bajas. Todas interpolan.
        let angosta = b - a < self.dt * (1.0 - 1e-9);
        if !angosta {
            for k in ka.max(mas_vieja)..=kb.min(self.k_max) {
                let col = &self.rejilla[Self::ranura(k)];
                let (li, lf) = lleno(k);
                let medio = 0.5 * (li + lf);
                if !col.vacia() && medio >= a && medio < b {
                    c.juntar(col, 0.0);
                }
            }
        }
        if c.vacia() {
            let k = self.k_de(0.5 * (a + b));
            let col = &self.rejilla[Self::ranura(k)];
            if k < mas_vieja || k > self.k_max || col.vacia() {
                return c;
            }
            let (li, lf) = lleno(k);
            let en = |t: f64| if lf > li { col.primero + (col.ultimo - col.primero) * ((t - li) / (lf - li)).clamp(0.0, 1.0) } else { col.primero };
            let (pr, ul) = (en(a.max(li)), en(b.min(lf)));
            c.punto(pr);
            c.punto(ul);
            c.primero = pr;
            c.ultimo = ul;
            c.banderas |= col.banderas & (BANDERA_X | BANDERA_Z);
        }
        c.banderas |= BANDERA_GRUESA;
        c
    }

    /// Las columnas `i0..i1` de la pantalla que empieza en `t0` con columnas de `dt` segundos, en `out[0..i1 - i0]`.
    pub fn columnas(&self, t0: f64, dt: f64, i0: usize, i1: usize, out: &mut [Columna]) {
        // Un origen o un ancho que no son números (la API de WASM los recibe de afuera): columnas vacías.
        if !t0.is_finite() || !(dt > 0.0 && dt.is_finite()) {
            out[..i1.saturating_sub(i0)].fill(Columna::VACIA);
            return;
        }
        // Una pasada por el búfer para toda la pantalla: cada columna sigue desde donde quedó la anterior (antes, una búsqueda
        // binaria en 262,144 muestras por columna).
        let (hasta, cubre) = (self.tiempo(), self.cubre_desde());
        let mut pista = u64::MAX;
        for i in i0..i1 {
            let a = t0 + i as f64 * dt;
            let b = (a + dt).min(hasta);
            out[i - i0] = if self.total == 0 || a > hasta || b < a {
                Columna::VACIA
            } else if a >= cubre {
                let (c, p) = self.columna_cruda_desde(a, b, pista);
                pista = p;
                c
            } else if self.con_rejilla {
                self.columna_de_rejilla_con_integrales(a, b)
            } else {
                Columna::VACIA
            };
        }
    }

    /// Lo que dibuja una pantalla (mínimo, máximo, primero, último y banderas) de las columnas `i0..i1`, sin las integrales
    /// (quedan en cero): lo mismo que `columnas` en esas cinco cifras, con un recorrido más corto en el caso de casi siempre
    /// (lineal, valores finitos, sin dos muestras en el mismo instante). Lo demás pasa por `columna_cruda_desde`.
    pub fn columnas_vista(&self, t0: f64, dt: f64, i0: usize, i1: usize, out: &mut [Columna]) {
        self.columnas_vista_con(t0, dt, i0, i1, |i, c| out[i - i0] = c);
    }

    /// `columnas_vista` entregando cada columna a `f` con su índice (la pantalla las escribe directo en f32).
    pub fn columnas_vista_con(&self, t0: f64, dt: f64, i0: usize, i1: usize, mut f: impl FnMut(usize, Columna)) {
        if !t0.is_finite() || !(dt > 0.0 && dt.is_finite()) {
            for i in i0..i1 {
                f(i, Columna::VACIA);
            }
            return;
        }
        let (hasta, cubre) = (self.tiempo(), self.cubre_desde());
        let mut pista = u64::MAX;
        for i in i0..i1 {
            let a = t0 + i as f64 * dt;
            let b = (a + dt).min(hasta);
            let c = if self.total == 0 || a > hasta || b < a {
                Columna::VACIA
            } else if a >= cubre {
                let rapida = if self.interp == Interpolacion::Lineal && a < b { self.columna_vista_desde(a, b, pista) } else { None };
                let (c, p) = rapida.unwrap_or_else(|| self.columna_cruda_desde(a, b, pista));
                pista = p;
                c
            } else if self.con_rejilla {
                self.columna_de_rejilla_para_dibujar(a, b)
            } else {
                Columna::VACIA
            };
            f(i, c);
        }
    }

    /// La columna de pantalla de [a, b) desde las muestras crudas, o `None` si no es el caso sencillo. Con valores finitos y
    /// sin muestras repetidas, `columna_cruda_desde` junta los tramos que tocan la columna: su primero es el valor en `a`, su
    /// último el valor en `b`, y su mínimo y su máximo los de esos dos y las muestras de en medio; aquí se toman directo.
    fn columna_vista_desde(&self, a: f64, b: f64, pista: u64) -> Option<(Columna, u64)> {
        let primera = self.primera();
        let mut j = if pista > primera && pista <= self.total && self.cruda(pista - 1).0 <= a { pista } else { self.posterior_a(a) };
        while j < self.total && self.cruda(j).0 <= a {
            j += 1;
        }
        if j <= primera || j >= self.total {
            return None;
        }
        let (mut t0, mut v0) = self.cruda(j - 1);
        let (mut t1, mut v1) = self.cruda(j);
        if t1 == t0 || !v0.is_finite() || !v1.is_finite() {
            return None;
        }
        let va = self.entre(t0, v0, t1, v1, a);
        let (mut min, mut max) = (va, va);
        let mut k = j;
        while t1 < b {
            min = min.min(v1);
            max = max.max(v1);
            k += 1;
            if k >= self.total {
                return None;
            }
            (t0, v0) = (t1, v1);
            (t1, v1) = self.cruda(k);
            if t1 == t0 || !v1.is_finite() {
                return None;
            }
        }
        let vb = self.entre(t0, v0, t1, v1, b);
        min = min.min(vb);
        max = max.max(vb);
        Some((Columna { min, max, primero: va, ultimo: vb, iv: 0.0, iv2: 0.0, banderas: 0 }, j))
    }

    /// El valor en `t0 + i·dt` para `i` en 0..out.len() (el CSV de una captura); NaN donde el búfer no cubre.
    pub fn muestras(&self, t0: f64, dt: f64, out: &mut [f64]) {
        let mut pista = u64::MAX;
        for (i, o) in out.iter_mut().enumerate() {
            (*o, pista) = self.valor_desde(t0 + i as f64 * dt, pista);
        }
    }

    /// Los cruces de subida del valor `m` (armados al bajar de `m - h`) entre `a` y `b`: el primero, el penúltimo, el último
    /// y cuántos hubo. Solo para las pruebas: la ventana usa `cruces_e_integrales`.
    #[cfg(test)]
    fn cruces(&self, a: f64, b: f64, m: f64, h: f64) -> (Option<f64>, Option<f64>, Option<f64>, u32) {
        let (mut primero, mut penultimo, mut ultimo, mut n) = (None, None, None, 0u32);
        let mut armado = false;
        let mut j = self.posterior_a(a).max(self.primera() + 1);
        while j < self.total {
            let ((t0, v0), (t1, v1)) = (self.cruda(j - 1), self.cruda(j));
            if t0 > b {
                break;
            }
            if v0.is_finite() && v1.is_finite() {
                if v0 < m - h {
                    armado = true;
                }
                if armado && v0 < m && v1 >= m && t1 > t0 {
                    let tc = match self.interp {
                        Interpolacion::Lineal => t0 + (m - v0) / (v1 - v0) * (t1 - t0),
                        Interpolacion::Escalon => t1,
                    };
                    if tc >= a && tc <= b {
                        primero.get_or_insert(tc);
                        penultimo = ultimo;
                        ultimo = Some(tc);
                        n += 1;
                    }
                    armado = false;
                }
                if v1 < m - h {
                    armado = true;
                }
            }
            j += 1;
        }
        (primero, penultimo, ultimo, n)
    }

    /// Lo que mide un multímetro entre `t0` y `t1`: las integrales de la parte que cubre el búfer y, para la alterna, los
    /// periodos completos entre cruces de subida del promedio (histéresis de 5 % del pico a pico). Con menos de dos cruces
    /// en el intervalo, el último periodo completo de todo el búfer (un periodo más largo que la lectura).
    pub fn ventana(&self, t0: f64, t1: f64) -> Ventana {
        let (desde, hasta) = if t0.is_nan() || t1.is_nan() { (f64::NAN, f64::NAN) } else { (t0.max(self.cubre_desde()), t1.min(self.tiempo())) };
        let mut w = Ventana {
            desde, hasta, iv: 0.0, iv2: 0.0, min: f64::NAN, max: f64::NAN, periodos: 0, p0: f64::NAN, p1: f64::NAN, iv_p: 0.0, iv2_p: 0.0, alto_p: 0.0, t_valido: 0.0,
        };
        if !(hasta > desde) {
            return w;
        }
        let c = self.columna_larga(desde, hasta).unwrap_or_else(|| self.columna_cruda(desde, hasta));
        (w.iv, w.iv2, w.min, w.max) = (c.iv, c.iv2, c.min, c.max);
        // Lo que estuvo en X o en Z no entra a las integrales ni al tiempo que las divide.
        w.t_valido = if c.banderas & (BANDERA_X | BANDERA_Z) != 0 { self.tiempo_valido(desde, hasta) } else { hasta - desde };
        if !(w.t_valido > 0.0) {
            return w;
        }
        let m = c.iv / w.t_valido;
        let pp = c.max - c.min;
        if !(pp > 1e-12 * m.abs().max(1.0)) {
            return w;
        }
        let h = 0.05 * pp;
        let nivel = 0.5 * (c.min + c.max);
        // Los cruces y las integrales entre el primero y el último en una sola pasada (antes, dos: los cruces y luego los
        // periodos); el caso de menos de dos cruces sigue buscando hacia atrás.
        let (primero, ultimo, n, entre_cruces) = self.cruces_e_integrales(desde, hasta, m, h, nivel);
        if n >= 2 {
            let (p0, p1) = (primero.unwrap(), ultimo.unwrap());
            (w.periodos, w.p0, w.p1, w.iv_p, w.iv2_p, w.alto_p) = (n - 1, p0, p1, entre_cruces[0], entre_cruces[1], entre_cruces[2]);
            return w;
        }
        let (p0, p1, periodos) = {
            // El último periodo completo del búfer, buscado hacia atrás desde `hasta` (recorrer todo el búfer hacia adelante
            // eran 262,144 muestras en cada lectura).
            let Some(p1) = self.ultimo_cruce(hasta, m, h, true) else { return w };
            let Some(p0) = self.ultimo_cruce(p1 - f64::EPSILON * p1.abs().max(1e-300), m, h, true) else { return w };
            (p0, p1, 1)
        };
        // Las integrales de los periodos y el tiempo sobre el nivel medio en una sola pasada.
        let (iv_p, iv2_p, alto_p) = self.periodos_entre(p0, p1, nivel);
        (w.periodos, w.p0, w.p1, w.iv_p, w.iv2_p, w.alto_p) = (periodos, p0, p1, iv_p, iv2_p, alto_p);
        w
    }

    /// El tiempo entre `a` y `b` en que el valor es un número (sin X ni Z): lo que integra `Columna::tramo`.
    fn tiempo_valido(&self, a: f64, b: f64) -> f64 {
        let mut total = 0.0;
        let mut j = self.posterior_a(a).max(self.primera() + 1);
        while j < self.total {
            let ((t0, v0), (t1, v1)) = (self.cruda(j - 1), self.cruda(j));
            if t0 >= b {
                break;
            }
            let (x0, x1) = (t0.max(a), t1.min(b));
            if x1 > x0 && self.entre(t0, v0, t1, v1, x0).is_finite() && self.entre(t0, v0, t1, v1, x1).is_finite() {
                total += x1 - x0;
            }
            j += 1;
        }
        total
    }

    /// ∫v·dt, ∫v²·dt y el tiempo por encima de `nivel` entre `a` y `b`: lo de `columna_cruda` y `tiempo_sobre` juntos.
    /// Los cruces de `cruces` (el primero, el último y cuántos) y, en la misma pasada, ∫v·dt, ∫v²·dt y el tiempo sobre
    /// `nivel` entre el primero y el último: lo acumulado hasta el último menos lo acumulado hasta el primero.
    fn cruces_e_integrales(&self, a: f64, b: f64, m: f64, h: f64, nivel: f64) -> (Option<f64>, Option<f64>, u32, [f64; 3]) {
        let (mut primero, mut ultimo, mut n) = (None, None, 0u32);
        let mut armado = false;
        let mut acum = [0.0f64; 3];
        let (mut en_primero, mut en_ultimo) = ([0.0f64; 3], [0.0f64; 3]);
        let mut j = self.posterior_a(a).max(self.primera() + 1);
        while j < self.total {
            let ((t0, v0), (t1, v1)) = (self.cruda(j - 1), self.cruda(j));
            if t0 > b {
                break;
            }
            if v0.is_finite() && v1.is_finite() {
                let (x0, x1) = (t0.max(a), t1.min(b));
                let y0 = if x1 > x0 { self.entre(t0, v0, t1, v1, x0) } else { f64::NAN };
                if v0 < m - h {
                    armado = true;
                }
                if armado && v0 < m && v1 >= m && t1 > t0 {
                    let tc = match self.interp {
                        Interpolacion::Lineal => t0 + (m - v0) / (v1 - v0) * (t1 - t0),
                        Interpolacion::Escalon => t1,
                    };
                    if tc >= a && tc <= b {
                        let mut hasta_tc = acum;
                        if x1 > x0 && tc > x0 {
                            let p = Self::pieza(x0, y0, tc.min(x1), self.entre(t0, v0, t1, v1, tc.min(x1)), nivel);
                            (0..3).for_each(|k| hasta_tc[k] += p[k]);
                        }
                        if primero.is_none() {
                            primero = Some(tc);
                            en_primero = hasta_tc;
                        }
                        ultimo = Some(tc);
                        en_ultimo = hasta_tc;
                        n += 1;
                    }
                    armado = false;
                }
                if v1 < m - h {
                    armado = true;
                }
                if x1 > x0 {
                    let p = Self::pieza(x0, y0, x1, self.entre(t0, v0, t1, v1, x1), nivel);
                    (0..3).for_each(|k| acum[k] += p[k]);
                }
            }
            j += 1;
        }
        (primero, ultimo, n, [en_ultimo[0] - en_primero[0], en_ultimo[1] - en_primero[1], en_ultimo[2] - en_primero[2]])
    }

    /// ∫v·dt, ∫v²·dt y el tiempo sobre `nivel` de un tramo lineal de (x0, y0) a (x1, y1): las cuentas de `periodos_entre`.
    #[inline]
    fn pieza(x0: f64, y0: f64, x1: f64, y1: f64, nivel: f64) -> [f64; 3] {
        let h = x1 - x0;
        let alto = if y0 > nivel && y1 > nivel {
            h
        } else if y0 <= nivel && y1 <= nivel {
            0.0
        } else {
            let tc = x0 + (nivel - y0) / (y1 - y0) * h;
            if y1 > nivel { x1 - tc } else { tc - x0 }
        };
        [h * 0.5 * (y0 + y1), h * (y0 * y0 + y0 * y1 + y1 * y1) / 3.0, alto]
    }

    fn periodos_entre(&self, a: f64, b: f64, nivel: f64) -> (f64, f64, f64) {
        let (mut iv, mut iv2, mut alto) = (0.0, 0.0, 0.0);
        let mut j = self.posterior_a(a).max(self.primera() + 1);
        while j < self.total {
            let ((t0, v0), (t1, v1)) = (self.cruda(j - 1), self.cruda(j));
            if t0 >= b {
                break;
            }
            let (x0, x1) = (t0.max(a), t1.min(b));
            if x1 > x0 && v0.is_finite() && v1.is_finite() {
                let (y0, y1) = (self.entre(t0, v0, t1, v1, x0), self.entre(t0, v0, t1, v1, x1));
                let h = x1 - x0;
                iv += h * 0.5 * (y0 + y1);
                iv2 += h * (y0 * y0 + y0 * y1 + y1 * y1) / 3.0;
                alto += if y0 > nivel && y1 > nivel {
                    h
                } else if y0 <= nivel && y1 <= nivel {
                    0.0
                } else {
                    let tc = x0 + (nivel - y0) / (y1 - y0) * h;
                    if y1 > nivel { x1 - tc } else { tc - x0 }
                };
            }
            j += 1;
        }
        (iv, iv2, alto)
    }

}

/// Las columnas de A − B (el canal de matemáticas) entre dos sondas lineales, quizá de islas distintas: en los
/// instantes de las dos, con cada una interpolada en los de la otra, así la diferencia es exacta entre muestras. Solo
/// donde los dos búferes cubren la columna; si no, la columna queda vacía.
pub fn resta_columnas(a: &Sonda, b: &Sonda, t0: f64, dt: f64, i0: usize, i1: usize, out: &mut [Columna]) {
    let hasta = a.tiempo().min(b.tiempo());
    let cubre = a.cubre_desde().max(b.cubre_desde());
    for i in i0..i1 {
        let x = t0 + i as f64 * dt;
        let y = (x + dt).min(hasta);
        let mut c = Columna::VACIA;
        if x >= cubre && y >= x {
            let (mut ja, mut jb) = (a.posterior_a(x), b.posterior_a(x));
            let mut u = x;
            let mut du = a.valor_en(u) - b.valor_en(u);
            c.punto(du);
            loop {
                let ta = if ja < a.total { a.cruda(ja).0 } else { f64::INFINITY };
                let tb = if jb < b.total { b.cruda(jb).0 } else { f64::INFINITY };
                let w = ta.min(tb).min(y);
                if w > u {
                    let dw = a.valor_en(w) - b.valor_en(w);
                    c.tramo(u, du, w, dw);
                    (u, du) = (w, dw);
                }
                if w >= y {
                    break;
                }
                if ta <= w {
                    ja += 1;
                }
                if tb <= w {
                    jb += 1;
                }
            }
        }
        out[i - i0] = c;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Generador congruencial (las pruebas no dependen de una biblioteca de azar).
    struct Azar(u64);
    impl Azar {
        fn sig(&mut self) -> f64 {
            self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            (self.0 >> 11) as f64 / (1u64 << 53) as f64
        }
    }

    /// Fuerza bruta de una columna [a, b) sobre las muestras `ts`, `vs` (lineales).
    fn bruta(ts: &[f64], vs: &[f64], a: f64, b: f64) -> (f64, f64, f64, f64) {
        let (mut min, mut max, mut iv, mut iv2) = (f64::INFINITY, f64::NEG_INFINITY, 0.0, 0.0);
        for k in 1..ts.len() {
            let (t0, t1, v0, v1) = (ts[k - 1], ts[k], vs[k - 1], vs[k]);
            let (x0, x1) = (t0.max(a), t1.min(b));
            if x1 <= x0 {
                continue;
            }
            // En una muestra, su valor; entre dos, la recta.
            let f = |x: f64| if x == t1 { v1 } else if x == t0 { v0 } else { v0 + (v1 - v0) * (x - t0) / (t1 - t0) };
            let (y0, y1) = (f(x0), f(x1));
            min = min.min(y0).min(y1);
            max = max.max(y0).max(y1);
            iv += (x1 - x0) * 0.5 * (y0 + y1);
            iv2 += (x1 - x0) * (y0 * y0 + y0 * y1 + y1 * y1) / 3.0;
        }
        (min, max, iv, iv2)
    }

    fn cerca(a: f64, b: f64, rel: f64) -> bool {
        (a - b).abs() <= rel * a.abs().max(b.abs()).max(1e-30)
    }

    /// Un millón de muestras al azar con paso variable (de 0.1 a 10 µs).
    fn al_azar(n: usize) -> (Vec<f64>, Vec<f64>) {
        let mut r = Azar(7);
        let (mut ts, mut vs) = (vec![0.0], vec![0.0]);
        for _ in 1..n {
            ts.push(ts.last().unwrap() + 1e-7 + 9.9e-6 * r.sig());
            vs.push(2.0 * r.sig() - 1.0);
        }
        (ts, vs)
    }

    #[test]
    fn las_columnas_crudas_conservan_minimo_maximo_e_integrales_contra_la_fuerza_bruta() {
        // Criterio 3: un millón de muestras de paso variable en un búfer que las cubre todas.
        let (ts, vs) = al_azar(1_000_000);
        let mut s = Sonda::new(Interpolacion::Lineal, 1 << 20, 1e-3);
        for (t, v) in ts.iter().zip(&vs) {
            s.empujar(*t, *v);
        }
        // El búfer guarda f32: la fuerza bruta usa los mismos valores.
        let vs32: Vec<f64> = vs.iter().map(|v| *v as f32 as f64).collect();
        let (t0, dt) = (0.37e-3, 2.71e-3);
        let mut out = vec![Columna::VACIA; 1000];
        s.columnas(t0, dt, 0, 1000, &mut out);
        for (i, c) in out.iter().enumerate() {
            let a = t0 + i as f64 * dt;
            let (min, max, iv, iv2) = bruta(&ts, &vs32, a, a + dt);
            assert_eq!((c.min, c.max), (min, max), "columna {i}");
            assert!(cerca(c.iv, iv, 1e-9) && cerca(c.iv2, iv2, 1e-9), "columna {i}: {} {} contra {iv} {iv2}", c.iv, c.iv2);
            assert_eq!(c.banderas & BANDERA_GRUESA, 0);
        }
    }

    #[test]
    fn la_rejilla_conserva_minimo_maximo_e_integrales_con_los_valores_exactos() {
        // La rejilla se llena al empujar con los valores en f64: la misma prueba con las columnas de la rejilla misma.
        let (ts, vs) = al_azar(200_000);
        let dt = 1e-3;
        let mut s = Sonda::new(Interpolacion::Lineal, 1024, dt);
        for (t, v) in ts.iter().zip(&vs) {
            s.empujar(*t, *v);
        }
        let k_max = s.k_max;
        for k in (k_max - 300)..k_max {
            let c = &s.rejilla[Sonda::ranura(k)];
            let (a, b) = (k as f64 * dt, (k + 1) as f64 * dt);
            let (min, max, iv, iv2) = bruta(&ts, &vs, a, b);
            assert_eq!((c.min, c.max), (min, max), "columna {k}");
            assert!(cerca(c.iv, iv, 1e-9) && cerca(c.iv2, iv2, 1e-9), "columna {k}");
        }
        // Una columna de pantalla de tres de la rejilla, ya fuera del búfer crudo: mínimo y máximo exactos, integrales
        // en proporción (aquí exactas porque cubre columnas completas) y la bandera gruesa.
        let a = (k_max - 200) as f64 * dt;
        let c = s.columna_en(a, a + 3.0 * dt);
        let (min, max, iv, _) = bruta(&ts, &vs, a, a + 3.0 * dt);
        assert!(a < s.cubre_desde());
        assert_eq!((c.min, c.max), (min, max));
        assert!(cerca(c.iv, iv, 1e-9));
        assert_ne!(c.banderas & BANDERA_GRUESA, 0);
    }

    #[test]
    fn el_bufer_circular_da_la_vuelta_y_olvida_lo_mas_viejo() {
        let mut s = Sonda::new(Interpolacion::Lineal, 1024, 1e-3);
        for k in 0..3000 {
            s.empujar(k as f64 * 1e-6, k as f64);
        }
        assert_eq!(s.cubre_desde(), 1976e-6);
        assert!(s.valor_en(1000e-6).is_nan());
        assert!((s.valor_en(2500.5e-6) - 2500.5).abs() < 1e-3);
        assert_eq!(s.valor_en(2999e-6), 2999.0);
    }

    #[test]
    fn el_disparo_se_interpola_y_queda_quieto_en_cien_barridos() {
        // Senoidal de 1 kHz muestreada con pasos irregulares de 5 a 15 µs: el instante del cruce de 0.3 V en subida, menos el
        // múltiplo del periodo, se mueve menos de 1e-3 periodos (media columna de una pantalla de dos periodos en 1,000).
        let mut r = Azar(3);
        let mut s = Sonda::new(Interpolacion::Lineal, 1 << 16, 1e-4);
        s.configurar(&ConfigSonda { columna: 1e-4, acople: Acople::Dc, disparo: Some(Disparo { nivel: 0.3, subida: true, histeresis: 0.02 }) });
        let (mut t, mut fases) = (0.0, Vec::new());
        let mut vistos = 0;
        while fases.len() < 100 {
            t += 5e-6 + 10e-6 * r.sig();
            s.empujar(t, (2.0 * std::f64::consts::PI * 1000.0 * t).sin());
            if s.n_disparos > vistos {
                vistos = s.n_disparos;
                let tc = s.ultimo_disparo(f64::INFINITY).unwrap();
                fases.push((tc * 1000.0).fract());
            }
        }
        let exacta = 0.3f64.asin() / (2.0 * std::f64::consts::PI);
        let (lo, hi) = fases.iter().fold((f64::INFINITY, f64::NEG_INFINITY), |(a, b), &f| (a.min(f), b.max(f)));
        assert!(hi - lo < 1e-3, "el disparo se movió {} periodos", hi - lo);
        assert!((lo - exacta).abs() < 1e-3, "fase {lo} contra {exacta}");
    }

    #[test]
    fn la_histeresis_no_dispara_dos_veces_con_el_ruido_de_un_flanco() {
        let mut s = Sonda::new(Interpolacion::Lineal, 1024, 1e-3);
        s.configurar(&ConfigSonda { columna: 1e-3, acople: Acople::Dc, disparo: Some(Disparo { nivel: 2.5, subida: true, histeresis: 0.5 }) });
        // Sube de 0 a 5 V y oscila ±0.1 V alrededor de 2.5 V antes de llegar: un solo disparo.
        let v = [0.0, 2.45, 2.55, 2.45, 2.55, 2.45, 5.0, 5.0];
        for (k, x) in v.iter().enumerate() {
            s.empujar(k as f64 * 1e-6, *x);
        }
        assert_eq!(s.n_disparos, 1);
        assert!((s.ultimo_disparo(1.0).unwrap() - 1.5e-6).abs() < 1e-12);
    }

    #[test]
    fn la_ventana_da_el_promedio_y_el_valor_eficaz_de_la_alterna_sobre_periodos_completos() {
        // 0.5 + sen(2π·1000·t) muestreada a 100 pasos por periodo durante 0.25 s, con una ventana que no cae en un periodo
        // entero: promedio 0.5, eficaz de la alterna 1/√2 y 1 kHz.
        let mut s = Sonda::new(Interpolacion::Lineal, 1 << 15, 1e-3);
        let h = 1e-5;
        for k in 0..25_001 {
            let t = k as f64 * h;
            s.empujar(t, 0.5 + (2.0 * std::f64::consts::PI * 1000.0 * t).sin());
        }
        let w = s.ventana(0.0123, 0.2401);
        let t_p = w.p1 - w.p0;
        let prom = w.iv_p / t_p;
        let eficaz = (w.iv2_p / t_p - prom * prom).sqrt();
        let f = w.periodos as f64 / t_p;
        assert!((prom - 0.5).abs() < 1e-3, "promedio {prom}");
        assert!((eficaz - 0.5f64.sqrt()).abs() / 0.5f64.sqrt() < 5e-3, "eficaz {eficaz}");
        assert!((f - 1000.0).abs() < 1.0, "f {f}");
        assert!(w.periodos >= 220);
    }

    #[test]
    fn el_tiempo_en_alto_de_una_cuadrada_da_su_ciclo_de_trabajo() {
        // Cuadrada de 1 kHz al 25 % entre 0 y 5 V muestreada cada µs: entre muestras, rampas de 1 µs que el nivel medio corta
        // por la mitad.
        let mut s = Sonda::new(Interpolacion::Lineal, 1 << 17, 1e-3);
        for k in 0..100_000 {
            let t = k as f64 * 1e-6;
            s.empujar(t, if (t * 1000.0 + 1e-9).fract() < 0.25 { 5.0 } else { 0.0 });
        }
        let w = s.ventana(0.0123, 0.0987);
        let ciclo = w.alto_p / (w.p1 - w.p0);
        assert!((ciclo - 0.25).abs() < 0.25 * 5e-3, "ciclo {ciclo}");
    }

    #[test]
    fn con_un_periodo_mas_largo_que_la_lectura_usa_el_ultimo_periodo_completo() {
        // Senoidal de 1 Hz y una lectura de 250 ms: no caben dos cruces; se toma el último periodo del búfer.
        let mut s = Sonda::new(Interpolacion::Lineal, 1 << 15, 1e-3);
        for k in 0..30_001 {
            let t = k as f64 * 1e-4;
            s.empujar(t, (2.0 * std::f64::consts::PI * t).sin());
        }
        let w = s.ventana(2.75, 3.0);
        assert_eq!(w.periodos, 1);
        assert!((w.p1 - w.p0 - 1.0).abs() < 1e-3);
        let eficaz = (w.iv2_p / (w.p1 - w.p0)).sqrt();
        assert!((eficaz - 0.5f64.sqrt()).abs() < 1e-3);
    }

    #[test]
    fn un_escalon_digital_integra_exacto_y_marca_x_y_z() {
        let mut s = Sonda::new(Interpolacion::Escalon, 1024, 1e-3);
        s.empujar(0.0, 0.0);
        s.empujar(0.25e-3, 5.0); // sube a los 0.25 ms
        s.empujar(0.75e-3, f64::NAN); // X a los 0.75 ms
        s.empujar(0.8e-3, 0.0);
        s.empujar(1e-3, 0.0);
        let c = s.columna_en(0.0, 1e-3);
        assert!((c.iv - 5.0 * 0.5e-3).abs() < 1e-15, "iv {}", c.iv);
        assert_eq!((c.min, c.max), (0.0, 5.0));
        assert_ne!(c.banderas & BANDERA_X, 0);
        assert_eq!(s.valor_en(0.5e-3), 5.0);
    }

    #[test]
    fn el_acoplamiento_ac_quita_la_componente_continua() {
        // Cuadrada de 1 kHz entre 2 y 4 V: tras 1 s acoplada en AC, el promedio de un segundo más es casi cero.
        let mut s = Sonda::new(Interpolacion::Lineal, 1 << 18, 1e-3);
        s.configurar(&ConfigSonda { columna: 1e-3, acople: Acople::Ac, disparo: None });
        let h = 1e-5;
        for k in 0..200_001 {
            let t = k as f64 * h;
            s.empujar(t, if (t * 1000.0).fract() < 0.5 { 4.0 } else { 2.0 });
        }
        let w = s.ventana(1.0, 2.0);
        assert!((w.iv / (w.hasta - w.desde)).abs() < 0.02, "promedio {}", w.iv / (w.hasta - w.desde));
    }

    #[test]
    fn un_salto_de_mas_de_cuatro_mil_columnas_no_se_cuelga_y_llena_las_ultimas() {
        // Una isla quieta salta 100 s de una vez con columnas de 1 ms: solo se tocan las últimas 4,096.
        let mut s = Sonda::new(Interpolacion::Lineal, 1024, 1e-3);
        s.empujar(0.0, 1.0);
        s.empujar(100.0, 1.0);
        let c = s.columna_en(99.5, 99.501);
        assert!(!c.vacia() && c.min == 1.0);
        assert!(s.columna_de_rejilla(10.0, 10.001).vacia());
    }

    #[test]
    fn la_resta_de_dos_sondas_con_instantes_distintos_es_exacta_entre_muestras() {
        // A = t (pasos de 1 µs) y B = 2t (pasos de 1.5 µs): A − B = −t; la columna de 0 a 10 µs integra −50e-12.
        let (mut a, mut b) = (Sonda::new(Interpolacion::Lineal, 1024, 1e-3), Sonda::new(Interpolacion::Lineal, 1024, 1e-3));
        for k in 0..=20 {
            a.empujar(k as f64 * 1e-6, k as f64 * 1e-6);
        }
        for k in 0..=14 {
            b.empujar(k as f64 * 1.5e-6, 2.0 * k as f64 * 1.5e-6);
        }
        let mut out = [Columna::VACIA];
        resta_columnas(&a, &b, 0.0, 10e-6, 0, 1, &mut out);
        // El búfer guarda los valores en f32: siete cifras.
        assert!(cerca(out[0].iv, -50e-12, 1e-6), "iv {}", out[0].iv);
        assert!(cerca(out[0].min, -10e-6, 1e-6));
    }

    #[test]
    fn la_memoria_de_un_canal_es_la_de_la_especificacion() {
        // 262,144 muestras de 12 bytes y la rejilla: unos 3.3 MB por canal.
        let b = Sonda::bytes_de(262_144);
        assert!(b > 3_000_000 && b < 3_400_000, "{b} bytes");
    }

    /// Los disparos de la regla de `buscar_disparo` sobre las muestras dadas, hacia adelante (la referencia).
    fn disparos_adelante(ts: &[f64], vs: &[f64], d: Disparo) -> Vec<f64> {
        let (mut armado, mut out) = (false, Vec::new());
        let sg = if d.subida { 1.0 } else { -1.0 };
        let (nivel, h) = (sg * d.nivel, d.histeresis);
        for k in 1..ts.len() {
            let (s0, s1) = (sg * vs[k - 1], sg * vs[k]);
            if s0 < nivel - h {
                armado = true;
            }
            if armado && s0 < nivel && s1 >= nivel {
                out.push(ts[k - 1] + (nivel - s0) / (s1 - s0) * (ts[k] - ts[k - 1]));
                armado = false;
            }
            if s1 < nivel - h {
                armado = true;
            }
        }
        out
    }

    #[test]
    fn las_columnas_y_las_muestras_de_una_pantalla_son_las_de_pedirlas_una_por_una() {
        // `columnas` y `muestras` recorren el búfer una vez para toda la pantalla; cada columna y cada muestra deben ser las que
        // da `columna_en` o `valor_en` sola: con instantes repetidos, columnas más chicas que el paso, la frontera entre lo
        // crudo y la rejilla, y en escalón.
        let mut r = Azar(5);
        for interp in [Interpolacion::Lineal, Interpolacion::Escalon] {
            let mut s = Sonda::new(interp, 1024, 2e-6);
            let mut t = 0.0;
            for _ in 0..3000 {
                t += if r.sig() < 0.1 { 0.0 } else { 1e-7 + 2e-6 * r.sig() };
                s.empujar(t, if r.sig() < 0.02 { f64::NAN } else { 2.0 * r.sig() - 1.0 });
            }
            for (t0, dt, n) in [(s.cubre_desde() - 50e-6, 0.37e-6, 900), (s.cubre_desde(), 3.1e-6, 300), (s.cubre_desde() + 1e-4, 1e-8, 500), (0.0, 1e-3, 5)] {
                let mut out = vec![Columna::VACIA; n];
                s.columnas(t0, dt, 0, n, &mut out);
                for (i, c) in out.iter().enumerate() {
                    let a = t0 + i as f64 * dt;
                    let sola = s.columna_en(a, a + dt);
                    let iguales = |x: f64, y: f64| x == y || (x.is_nan() && y.is_nan());
                    assert!(
                        iguales(c.min, sola.min) && iguales(c.max, sola.max) && iguales(c.primero, sola.primero) && iguales(c.ultimo, sola.ultimo)
                            && iguales(c.iv, sola.iv) && iguales(c.iv2, sola.iv2) && c.banderas == sola.banderas,
                        "{interp:?}, columna {i} de ({t0}, {dt}): {c:?} contra {sola:?}"
                    );
                }
                let mut m = vec![0.0; n];
                s.muestras(t0, dt, &mut m);
                for (i, v) in m.iter().enumerate() {
                    let sola = s.valor_en(t0 + i as f64 * dt);
                    assert!(*v == sola || (v.is_nan() && sola.is_nan()), "{interp:?}, muestra {i} de ({t0}, {dt}): {v} contra {sola}");
                }
            }
        }
    }

    #[test]
    fn la_rejilla_no_es_mas_fina_que_el_paso_maximo_de_su_isla() {
        // Una pantalla de 1 ms/div pide columnas de 4.9 µs, pero con pasos de 10 µs cada paso cruzaba dos o tres columnas de
        // la rejilla (lo más caro de cada paso aceptado de una sonda) sin agregar nada a lo que dicen las muestras: la rejilla
        // mide al menos cuatro pasos. Las columnas que se piden de la rejilla siguen saliendo, con la bandera gruesa.
        let mut s = Sonda::new(Interpolacion::Lineal, 1024, 1e-2 / 2048.0);
        s.fijar_columna_minima(1e-5);
        assert_eq!(s.ancho_de_columna(), 4e-5);
        s.configurar(&ConfigSonda { columna: 2e-6, acople: Acople::Dc, disparo: None });
        assert_eq!(s.ancho_de_columna(), 4e-5);
        s.configurar(&ConfigSonda { columna: 1e-4, acople: Acople::Dc, disparo: None });
        assert_eq!(s.ancho_de_columna(), 1e-4);
        s.fijar_columna_minima(1e-7);
        s.configurar(&ConfigSonda { columna: 2e-6, acople: Acople::Dc, disparo: None });
        assert_eq!(s.ancho_de_columna(), 2e-6);
    }

    #[test]
    fn un_escalon_deja_su_nivel_nuevo_en_la_columna_de_la_rejilla_del_evento() {
        // La red sube a 5 V a la mitad de la columna y la columna termina sin otra muestra: su máximo es 5, no el nivel de antes.
        let mut s = Sonda::new(Interpolacion::Escalon, 1024, 1e-3);
        s.empujar(0.0, 0.0);
        s.empujar(0.5e-3, 5.0);
        let c = s.columna_de_rejilla(0.0, 1e-3);
        assert_eq!((c.min, c.max, c.ultimo), (0.0, 5.0, 5.0));
    }

    #[test]
    fn los_cruces_y_las_integrales_en_una_pasada_dan_lo_de_las_dos_pasadas() {
        let mut r = Azar(23);
        for caso in 0..60 {
            let interp = if caso % 6 == 5 { Interpolacion::Escalon } else { Interpolacion::Lineal };
            let mut s = Sonda::new(interp, 8192, 1e-4);
            let mut t = 0.0;
            for k in 0..6000 {
                let x = r.sig();
                t += if caso % 3 == 0 && x < 0.01 { 0.0 } else { 2e-6 + 3e-5 * r.sig() };
                let v = if caso % 4 == 1 && x > 0.998 { f64::NAN } else { (k as f64 * 0.05).sin() * 2.0 + 0.3 * r.sig() };
                s.empujar(t, v);
            }
            let a = s.cubre_desde() + r.sig() * 0.2 * (s.tiempo() - s.cubre_desde());
            let b = a + (0.5 + 0.5 * r.sig()) * (s.tiempo() - a);
            let (m, h, nivel) = (0.15, 0.2, 0.1);
            let (p0, _, p1, n) = s.cruces(a, b, m, h);
            let (q0, q1, nq, w) = s.cruces_e_integrales(a, b, m, h, nivel);
            assert_eq!((p0, p1, n), (q0, q1, nq), "caso {caso}");
            if n >= 2 {
                let (iv, iv2, alto) = s.periodos_entre(p0.unwrap(), p1.unwrap(), nivel);
                let tol = 1e-12 * (p1.unwrap() - p0.unwrap()) * 4.0;
                assert!((w[0] - iv).abs() <= tol && (w[1] - iv2).abs() <= 4.0 * tol && (w[2] - alto).abs() <= tol, "caso {caso}: {w:?} contra {:?}", (iv, iv2, alto));
            }
        }
    }

    #[test]
    fn la_columna_larga_es_la_columna_cruda_hasta_la_ultima_cifra() {
        let mut r = Azar(11);
        for caso in 0..60 {
            let mut s = Sonda::new(Interpolacion::Lineal, 4096, 1e-4);
            let mut t = 0.0;
            for k in 0..5000 {
                let x = r.sig();
                t += if caso % 3 == 0 && x < 0.01 { 0.0 } else { 2e-6 + 3e-5 * r.sig() };
                let v = if caso % 4 == 1 && x > 0.998 { f64::NAN } else { (k as f64 * 0.013).sin() * 4.0 + r.sig() };
                s.empujar(t, v);
            }
            let a = s.cubre_desde() + r.sig() * 0.3 * (s.tiempo() - s.cubre_desde());
            let b = a + r.sig() * (s.tiempo() - a);
            let general = s.columna_cruda(a, b);
            if let Some(c) = s.columna_larga(a, b) {
                assert_eq!(c, general, "caso {caso}");
            } else {
                assert!(caso % 3 == 0 || caso % 4 == 1, "caso {caso}: sin repetidas ni X no debía hacer falta el camino general");
            }
        }
    }

    #[test]
    fn las_columnas_de_pantalla_dan_las_mismas_cinco_cifras_que_las_columnas_completas() {
        // Pasos al azar, con muestras repetidas, X y Z de vez en cuando, pantallas que empiezan antes del búfer (rejilla), que
        // pasan de lo registrado y columnas más chicas y más grandes que los pasos.
        let mut r = Azar(7);
        for caso in 0..40 {
            let interp = if caso % 5 == 4 { Interpolacion::Escalon } else { Interpolacion::Lineal };
            let mut s = Sonda::new(interp, 1024, 1e-4);
            let mut t = 0.0;
            for k in 0..3000 {
                let x = r.sig();
                t += if x < 0.03 { 0.0 } else { 2e-6 + 3e-5 * r.sig() };
                let v = if x > 0.995 { f64::NAN } else if x > 0.99 { f64::INFINITY } else { (k as f64 * 0.01).sin() * 3.0 + r.sig() };
                s.empujar(t, v);
            }
            let dt = [1e-6, 7e-6, 3e-5, 2e-4][caso % 4];
            let t0 = s.cubre_desde() - 50.0 * dt + r.sig() * 1e-5;
            let (mut a, mut b) = (vec![Columna::VACIA; 600], vec![Columna::VACIA; 600]);
            s.columnas(t0, dt, 0, 600, &mut a);
            s.columnas_vista(t0, dt, 0, 600, &mut b);
            let igual = |x: f64, y: f64| x == y || (x.is_nan() && y.is_nan());
            for (i, (x, y)) in a.iter().zip(&b).enumerate() {
                assert!(
                    igual(x.min, y.min) && igual(x.max, y.max) && igual(x.primero, y.primero) && igual(x.ultimo, y.ultimo) && x.banderas == y.banderas,
                    "caso {caso}, columna {i}: {x:?} contra {y:?}"
                );
            }
        }
    }

    #[test]
    fn un_tramo_constante_llena_las_columnas_de_en_medio_como_muestras_en_cada_una() {
        // Un escalón digital que cambia cada 1.37 columnas y una sonda lineal que salta con el valor quieto: la rejilla es la
        // misma que con una muestra más a la mitad de cada columna (lo que hace el camino de siempre, columna por columna).
        for interp in [Interpolacion::Escalon, Interpolacion::Lineal] {
            let dt = 1e-3;
            let (mut a, mut b) = (Sonda::new(interp, 1024, dt), Sonda::new(interp, 1 << 16, dt));
            let mut t = 0.0;
            let mut medio = 0.5 * dt;
            for k in 0..40 {
                let v = if interp == Interpolacion::Escalon { [0.0, 5.0, f64::NAN, 5.0][k % 4] } else { 2.0 };
                let t1 = t + 13.7 * dt;
                // En la lineal, el valor quieto en cada tramo: la sonda densa recibe el mismo valor en medio.
                while medio < t1 {
                    if medio > t {
                        b.empujar(medio, if interp == Interpolacion::Escalon { b.ultimo_valor() } else { v });
                    }
                    medio += dt;
                }
                a.empujar(t1, v);
                b.empujar(t1, v);
                t = t1;
            }
            assert_eq!(a.k_max, b.k_max);
            for k in (a.k_max - 400)..=a.k_max {
                let (x, y) = (a.rejilla[Sonda::ranura(k)], b.rejilla[Sonda::ranura(k)]);
                assert_eq!((x.min, x.max, x.banderas), (y.min, y.max, y.banderas), "{interp:?} columna {k}");
                assert!(x.primero == y.primero || (x.primero.is_nan() && y.primero.is_nan()), "{interp:?} columna {k}");
                assert!(x.ultimo == y.ultimo || (x.ultimo.is_nan() && y.ultimo.is_nan()), "{interp:?} columna {k}");
                assert!((x.iv - y.iv).abs() <= 1e-15 && (x.iv2 - y.iv2).abs() <= 1e-14, "{interp:?} columna {k}: {} contra {}", x.iv, y.iv);
            }
        }
    }

    #[test]
    fn la_rejilla_se_apaga_si_el_bufer_cubre_tres_veces_su_alcance_y_vuelve_armada_desde_las_muestras() {
        // 1,024 muestras y columnas de 1 µs (la rejilla abarca 4.096 ms). Con pasos de 20 µs el búfer cubre 20 ms: la rejilla
        // se apaga y la pantalla sale de las muestras crudas. Con pasos de 1 µs el búfer cubre 1 ms: la rejilla vuelve, armada
        // desde las muestras, y da lo mismo que una sonda con un búfer que lo cubre todo.
        let (mut a, mut b) = (Sonda::new(Interpolacion::Lineal, 1024, 1e-6), Sonda::new(Interpolacion::Lineal, 1 << 16, 1e-6));
        let onda = |t: f64| (t * 2.0e3 * std::f64::consts::PI).sin();
        let mut t = 0.0;
        for _ in 0..4096 {
            t += 20e-6;
            a.empujar(t, onda(t));
            b.empujar(t, onda(t));
        }
        assert!(!a.rejilla_viva, "con 20 ms cubiertos la rejilla de 4 ms no hace falta");
        let (mut x, mut y) = (vec![Columna::VACIA; 400], vec![Columna::VACIA; 400]);
        a.columnas(t - 4e-3, 1e-5, 0, 400, &mut x);
        b.columnas(t - 4e-3, 1e-5, 0, 400, &mut y);
        assert_eq!(x, y);
        for _ in 0..3072 {
            t += 1e-6;
            a.empujar(t, onda(t));
            b.empujar(t, onda(t));
        }
        assert!(a.rejilla_viva, "con 1 ms cubierto la rejilla vuelve");
        // Las columnas que el búfer de `a` ya no cubre salen de su rejilla, con los extremos de las muestras (una columna de
        // pantalla dentro de cada columna de la rejilla, para que la rejilla no junte la de al lado).
        let k0 = ((a.cubre_desde() - 2e-3) / 1e-6).floor() as i64;
        for i in 0..1500 {
            let k = (k0 + i) as f64;
            let (c0, c1) = ((k + 1e-6) * 1e-6, (k + 1.0 - 1e-6) * 1e-6);
            let (ca, cb) = (a.columna_en(c0, c1), b.columna_en(c0, c1));
            assert!(ca.banderas & BANDERA_GRUESA != 0, "columna {i} de la rejilla");
            assert!((ca.min - cb.min).abs() < 1e-6 && (ca.max - cb.max).abs() < 1e-6, "columna {i}: {ca:?} contra {cb:?}");
        }
    }

    #[test]
    fn una_sonda_en_pausa_no_registra_y_al_volver_empieza_de_cero() {
        // La sonda del multímetro que su modo no lee (la de corriente en V y en Ω, la de voltaje en A) no registra nada; al
        // volver, lo de antes de la pausa no se une con lo nuevo (una recta sobre el hueco sería un valor inventado).
        let mut s = Sonda::new(Interpolacion::Lineal, 1024, 1e-3);
        for k in 0..10 {
            s.empujar(k as f64 * 1e-3, 1.0);
        }
        s.activar(false);
        assert!(!s.activa());
        for k in 10..20 {
            s.empujar(k as f64 * 1e-3, 5.0);
        }
        assert_eq!(s.registradas(), 10);
        assert_eq!(s.tiempo(), 9.0 * 1e-3);
        s.activar(true);
        assert_eq!(s.registradas(), 0);
        assert_eq!(s.tiempo(), f64::NEG_INFINITY);
        for k in 20..30 {
            s.empujar(k as f64 * 1e-3, 2.0);
        }
        assert_eq!(s.cubre_desde(), 20.0 * 1e-3);
        let w = s.ventana(0.0, 1.0);
        assert_eq!((w.desde, w.hasta), (20.0 * 1e-3, 29.0 * 1e-3));
        assert!((w.iv / (w.hasta - w.desde) - 2.0).abs() < 1e-12);
        assert!(s.columna_en(0.0, 15e-3).vacia());
        // Activar una sonda que ya registra no borra nada.
        s.activar(true);
        assert_eq!(s.registradas(), 10);
    }

    #[test]
    fn una_columna_de_pantalla_sobre_una_columna_a_medio_llenar_de_la_rejilla_integra_lo_que_cubre() {
        // 1 V desde 0.5 ms: la columna 0 de la rejilla solo tiene datos de 0.5 a 1 ms. Una pantalla de 0.7 a 1.2 ms integra
        // 0.5 ms · 1 V (0.3 de la columna 0 y 0.2 de la 1), no 0.3/1 de la columna 0 como si estuviera llena.
        let mut s = Sonda::new(Interpolacion::Lineal, 1024, 1e-3);
        for k in 0..=100 {
            s.empujar(0.5e-3 + k as f64 * 1e-4, 1.0);
        }
        let c = s.columna_de_rejilla(0.7e-3, 1.2e-3);
        assert!((c.iv - 0.5e-3).abs() < 1e-12, "iv {}", c.iv);
        // Y la última columna, llena hasta 10.5 ms: de 10.2 a 10.5 ms.
        let c = s.columna_de_rejilla(10.2e-3, 10.9e-3);
        assert!((c.iv - 0.3e-3).abs() < 1e-12, "iv {}", c.iv);
    }

    #[test]
    fn la_ventana_no_cuenta_el_tiempo_en_x() {
        // 5 V salvo 0.5 ms en X: el tiempo medido es 1.5 ms y el promedio, 5 V.
        let mut s = Sonda::new(Interpolacion::Escalon, 1024, 1e-3);
        for (t, v) in [(0.0, 5.0), (0.5e-3, f64::NAN), (1e-3, 5.0), (2e-3, 5.0)] {
            s.empujar(t, v);
        }
        let w = s.ventana(0.0, 2e-3);
        assert!((w.t_valido - 1.5e-3).abs() < 1e-15, "{}", w.t_valido);
        assert!((w.iv / w.t_valido - 5.0).abs() < 1e-12);
        assert_eq!(w.cifras().len(), 13);
        assert_eq!(w.cifras()[12], w.t_valido);
        // Sin X, el tiempo medido es el intervalo.
        let mut s = Sonda::new(Interpolacion::Lineal, 1024, 1e-3);
        s.empujar(0.0, 1.0);
        s.empujar(1e-3, 1.0);
        assert_eq!(s.ventana(0.0, 1e-3).t_valido, 1e-3);
    }

    #[test]
    fn un_instante_que_no_es_numero_no_da_valores() {
        let mut s = Sonda::new(Interpolacion::Lineal, 1024, 1e-3);
        for k in 0..10 {
            s.empujar(k as f64 * 1e-4, 1.0);
        }
        assert!(s.valor_en(f64::NAN).is_nan());
        let mut out = [Columna::VACIA; 3];
        for (t0, dt) in [(f64::NAN, 1e-4), (0.0, 0.0), (0.0, -1e-4), (0.0, f64::INFINITY)] {
            s.columnas(t0, dt, 0, 3, &mut out);
            assert!(out.iter().all(|c| c.vacia()), "t0 {t0}, dt {dt}");
        }
        let w = s.ventana(f64::NAN, 1e-3);
        assert_eq!((w.iv, w.periodos), (0.0, 0));
        assert!(s.ultimo_disparo(f64::NAN).is_none());
    }

    #[test]
    fn con_la_isla_adelantada_el_disparo_de_un_instante_viejo_sale_del_bufer() {
        // Una senoidal de 50 kHz con rizado de 900 kHz en 10 ms da unos 500 disparos, el doble de los que guarda el anillo. Pedir el último disparo antes de un instante de hace más de 256 disparos debe dar el de la regla hacia adelante, no None.
        let mut r = Azar(11);
        let (mut ts, mut vs) = (vec![0.0], vec![0.0]);
        while *ts.last().unwrap() < 10e-3 {
            let t = ts.last().unwrap() + 0.5e-6 + 1e-6 * r.sig();
            ts.push(t);
            vs.push((2.0 * std::f64::consts::PI * 5e4 * t).sin() + 0.05 * (2.0 * std::f64::consts::PI * 9e5 * t).sin());
        }
        for d in [Disparo { nivel: 0.3, subida: true, histeresis: 0.1 }, Disparo { nivel: -0.2, subida: false, histeresis: 0.1 }] {
            let mut s = Sonda::new(Interpolacion::Lineal, 1 << 14, 1e-5);
            s.configurar(&ConfigSonda { columna: 1e-5, acople: Acople::Dc, disparo: Some(d) });
            for (t, v) in ts.iter().zip(&vs) {
                s.empujar(*t, *v);
            }
            assert!(s.n_disparos > MAX_DISPAROS as u64 + 200, "{} disparos", s.n_disparos);
            // El búfer guarda f32: la referencia usa los mismos valores.
            let vs32: Vec<f64> = vs.iter().map(|v| *v as f32 as f64).collect();
            let todos = disparos_adelante(&ts, &vs32, d);
            for k in 0..200 {
                let t_max = 0.2e-3 + k as f64 * 0.0487e-3;
                let esperado = todos.iter().rev().find(|&&t| t <= t_max).copied();
                let dado = s.ultimo_disparo(t_max);
                match (esperado, dado) {
                    (Some(a), Some(b)) => assert!((a - b).abs() < 1e-11, "t_max {t_max}: {b} contra {a}"),
                    (a, b) => assert_eq!(a.is_some(), b.is_some(), "t_max {t_max}: {b:?} contra {a:?}"),
                }
            }
        }
    }

    #[test]
    fn la_mitad_vieja_del_rodillo_sale_sin_picos_aunque_la_columna_de_pantalla_no_coincida_con_la_de_la_rejilla() {
        // Rodante con una senoidal de 1 Hz en 10 s por pantalla y un búfer crudo corto: la mitad vieja sale de la rejilla (de 2,048
        // columnas) y la pantalla tiene 850 columnas, como el ancho de un panel. Una columna de pantalla no debe sumar enteras las
        // de la rejilla que toca a medias: su mínimo y su máximo saldrían fuera de los extremos y habría picos en la traza.
        let mut r = Azar(5);
        let (span, f) = (10.0, 1.0);
        let (n, dt_rejilla) = (850usize, span / 2048.0);
        let dt = span / n as f64;
        let mut corto = Sonda::new(Interpolacion::Lineal, 1024, dt_rejilla);
        let mut largo = Sonda::new(Interpolacion::Lineal, 1 << 20, dt_rejilla);
        let mut t = 0.0;
        while t < 30.0 {
            t += 1e-3 + 9e-3 * r.sig();
            let v = (2.0 * std::f64::consts::PI * f * t).sin();
            corto.empujar(t, v);
            largo.empujar(t, v);
        }
        let t0 = ((corto.tiempo() - span) / dt).floor() * dt;
        let (mut a, mut b) = (vec![Columna::VACIA; n], vec![Columna::VACIA; n]);
        corto.columnas_vista(t0, dt, 0, n, &mut a);
        largo.columnas_vista(t0, dt, 0, n, &mut b);
        assert!(corto.cubre_desde() > t0 + 0.3 * span, "la mitad vieja debe salir de la rejilla");
        let omega = 2.0 * std::f64::consts::PI * f;
        let mut gruesas = 0;
        for i in 0..n {
            let (x, y) = (a[i], b[i]);
            assert!(!x.vacia(), "columna {i} vacía");
            if x.banderas & BANDERA_GRUESA == 0 {
                continue;
            }
            gruesas += 1;
            // La traza dibuja un pico cuando el máximo o el mínimo salen de los extremos de la columna: en un tramo sin cima
            // (la derivada no cambia de signo) no debe haberlo; con 1e-3 V de holgura sobra (el dibujo tolera 0.01).
            let ta = t0 + i as f64 * dt;
            let cima = (omega * ta).cos() * (omega * (ta + dt)).cos() <= 0.0 || (omega * ta).cos().abs() < 5e-3 || (omega * (ta + dt)).cos().abs() < 5e-3;
            if !cima {
                assert!(x.max <= x.primero.max(x.ultimo) + 1e-3 && x.min >= x.primero.min(x.ultimo) - 1e-3, "columna {i}: {:?}", (x.min, x.max, x.primero, x.ultimo));
            }
            // Y se parece a la de las muestras crudas: la diferencia es el corrimiento de media columna de rejilla, no una columna entera.
            let tol = omega * dt_rejilla * 1.01 + 1e-3;
            assert!((x.primero - y.primero).abs() <= tol && (x.ultimo - y.ultimo).abs() <= tol, "columna {i}: extremos {:?} contra {:?}", (x.primero, x.ultimo), (y.primero, y.ultimo));
            // Cada valor de la rejilla cae en una sola columna: la última de una es la primera de la siguiente.
            if i + 1 < n && b[i + 1].banderas & BANDERA_GRUESA == 0 {
                assert!((x.ultimo - a[i + 1].primero).abs() <= 1e-9 || a[i + 1].banderas & BANDERA_GRUESA == 0, "columna {i}: salto con la siguiente");
            }
        }
        assert!(gruesas > 200, "{gruesas} columnas de la rejilla");
    }

    #[test]
    fn con_columnas_de_pantalla_mas_angostas_que_las_de_la_rejilla_las_cimas_no_salen_como_picos() {
        // La pantalla a 4× tiene más columnas (3,944) que las 2,048 de la rejilla en su ancho: cada columna de la rejilla abarca dos de
        // pantalla. Una lleva el mínimo y el máximo de la rejilla y la vecina sale interpolada, sin que las cimas se alternen.
        let mut r = Azar(7);
        let (span, f) = (10.0, 1.0);
        let (n, dt_rejilla) = (3944usize, span / 2048.0);
        let dt = span / n as f64;
        let mut corto = Sonda::new(Interpolacion::Lineal, 1024, dt_rejilla);
        let mut t = 0.0;
        while t < 30.0 {
            t += 1e-3 + 9e-3 * r.sig();
            corto.empujar(t, (2.0 * std::f64::consts::PI * f * t).sin());
        }
        let t0 = ((corto.tiempo() - span) / dt).floor() * dt;
        let mut a = vec![Columna::VACIA; n];
        corto.columnas_vista(t0, dt, 0, n, &mut a);
        assert!(corto.cubre_desde() > t0 + 0.3 * span);
        let mut gruesas = 0;
        for x in a.iter().filter(|x| x.banderas & BANDERA_GRUESA != 0) {
            gruesas += 1;
            assert!(x.max <= x.primero.max(x.ultimo) + 1e-9 && x.min >= x.primero.min(x.ultimo) - 1e-9, "{:?}", (x.min, x.max, x.primero, x.ultimo));
        }
        assert!(gruesas > 500, "{gruesas} columnas de la rejilla");
    }
}
