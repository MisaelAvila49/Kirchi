//! Simulador por eventos: cada red tiene un nivel y cada salida maneja a lo más una red y viceversa (dos salidas unidas las rechaza la netlist). Un instante se procesa en ciclos delta, con salidas programadas con retardo inercial.

use super::cola::{Cola, Evento};
use super::modelos::ModeloDigital;
use super::{a_s, Nivel, Ps, MAX_CICLOS_DELTA, MAX_PASADAS_ARRANQUE};
use crate::error::EngineError;

#[derive(Clone)]
struct Salida {
    red: u32,
    valor: Nivel,
    /// Cambio programado que aún no ocurre: su instante y su nivel.
    pendiente: Option<(Ps, Nivel)>,
    version: u32,
}

/// Lo que se mide de una red para su frecuencia y su ciclo de trabajo.
#[derive(Clone, Copy, Debug, Default)]
struct Medida {
    cambios: u64,
    subida: Option<Ps>,
    bajada: Option<Ps>,
    /// Duración del último periodo completo (de subida a subida) y cuánto estuvo en 1; cero si aún no hay uno.
    periodo: Ps,
    alto: Ps,
}

/// Todo lo que cambia en la lógica con el tiempo (los niveles, las salidas con sus cambios pendientes, el estado de cada modelo,
/// la cola de eventos y el reloj): lo que hace falta para retroceder. Lo que no cambia (las redes, los lectores, el orden)
/// se queda en `Digital`.
pub struct EstadoDigital {
    niveles: Vec<Nivel>,
    medidas: Vec<Medida>,
    salidas: Vec<Salida>,
    modelos: Vec<Box<dyn ModeloDigital>>,
    cola: Cola,
    ahora: Ps,
    marcado: Vec<bool>,
    eventos: u64,
    lazo: Vec<usize>,
    registro: Option<Vec<(Ps, u32, Nivel)>>,
}

impl EstadoDigital {
    /// Bytes que ocupa la copia (aproximado: lo que reservan sus vectores).
    pub fn bytes(&self) -> usize {
        use std::mem::size_of;
        self.niveles.len() * size_of::<Nivel>()
            + self.medidas.len() * size_of::<Medida>()
            + self.salidas.len() * size_of::<Salida>()
            + self.modelos.iter().map(|m| size_of_val(&**m) + 16 + m.bytes_heap()).sum::<usize>()
            + self.cola.bytes()
            + self.marcado.len()
            + self.lazo.len() * size_of::<usize>()
            + self.registro.as_ref().map_or(0, |r| r.len() * size_of::<(Ps, u32, Nivel)>())
    }
}

pub struct Digital {
    niveles: Vec<Nivel>,
    medidas: Vec<Medida>,
    salidas: Vec<Salida>,
    modelos: Vec<Box<dyn ModeloDigital>>,
    /// Primera salida de cada modelo en `salidas`; las de los puentes de entrada van después de las de los modelos.
    primera: Vec<usize>,
    /// Salida de cada puente de entrada.
    puentes: Vec<usize>,
    /// Por red, los modelos que la leen.
    lectores: Vec<Vec<u32>>,
    /// Los modelos en orden topológico (lo que maneja una red antes que lo que la lee), con cada lazo junto: así el
    /// arranque asienta una cadena en una pasada aunque se haya declarado al revés.
    orden: Vec<usize>,
    cola: Cola,
    ahora: Ps,
    marcado: Vec<bool>,
    pendientes: Vec<u32>,
    cambiadas: Vec<u32>,
    ent: Vec<Nivel>,
    act: Vec<Nivel>,
    nuevas: Vec<(usize, Nivel, Ps)>,
    /// Cambios de nivel aplicados desde el principio (para el presupuesto de eventos por llamada).
    pub eventos: u64,
    lazo: Vec<usize>,
    registro: Option<Vec<(Ps, u32, Nivel)>>,
}

impl Digital {
    /// `redes`: cuántas redes digitales hay; `puentes`: la red que maneja cada puente de entrada.
    pub fn new(redes: usize, modelos: Vec<Box<dyn ModeloDigital>>, puentes: &[u32]) -> Result<Self, EngineError> {
        let mut salidas = Vec::new();
        let mut primera = Vec::with_capacity(modelos.len());
        let mut lectores = vec![Vec::new(); redes];
        let mut conductor: Vec<Option<usize>> = vec![None; redes];
        let fuera = |r: u32| (r as usize) >= redes;
        for (k, m) in modelos.iter().enumerate() {
            primera.push(salidas.len());
            for &r in m.entradas() {
                if fuera(r) {
                    return Err(EngineError::Invalid(format!("modelo digital {k}: red {r} fuera de rango")));
                }
                if !lectores[r as usize].contains(&(k as u32)) {
                    lectores[r as usize].push(k as u32);
                }
            }
            for &r in m.salidas() {
                if fuera(r) {
                    return Err(EngineError::Invalid(format!("modelo digital {k}: red {r} fuera de rango")));
                }
                salidas.push(Salida { red: r, valor: Nivel::Z, pendiente: None, version: 0 });
            }
        }
        let mut idx_puentes = Vec::with_capacity(puentes.len());
        for &r in puentes {
            if fuera(r) {
                return Err(EngineError::Invalid(format!("puente de entrada: red {r} fuera de rango")));
            }
            idx_puentes.push(salidas.len());
            salidas.push(Salida { red: r, valor: Nivel::Z, pendiente: None, version: 0 });
        }
        for (s, sal) in salidas.iter().enumerate() {
            let c = &mut conductor[sal.red as usize];
            if c.is_some() {
                return Err(EngineError::Invalid(format!("red digital {}: la manejan dos salidas", sal.red)));
            }
            *c = Some(s);
        }
        let n = modelos.len();
        let adj: Vec<Vec<usize>> = modelos
            .iter()
            .map(|m| {
                let mut a: Vec<usize> = m.salidas().iter().flat_map(|&r| lectores[r as usize].iter().map(|&k| k as usize)).collect();
                a.sort_unstable();
                a.dedup();
                a
            })
            .collect();
        let orden = crate::grafo::componentes_fuertes(&adj).into_iter().flatten().collect();
        Ok(Self {
            niveles: vec![Nivel::Z; redes],
            medidas: vec![Medida::default(); redes],
            salidas,
            modelos,
            primera,
            puentes: idx_puentes,
            lectores,
            orden,
            cola: Cola::default(),
            ahora: 0,
            marcado: vec![false; n],
            pendientes: Vec::new(),
            cambiadas: Vec::new(),
            ent: Vec::new(),
            act: Vec::new(),
            nuevas: Vec::new(),
            eventos: 0,
            lazo: Vec::new(),
            registro: None,
        })
    }

    /// Copia de todo lo que cambia con el tiempo (ver `EstadoDigital`).
    pub fn guardar(&self) -> EstadoDigital {
        EstadoDigital {
            niveles: self.niveles.clone(),
            medidas: self.medidas.clone(),
            salidas: self.salidas.clone(),
            modelos: self.modelos.iter().map(|m| m.clonar()).collect(),
            cola: self.cola.clone(),
            ahora: self.ahora,
            marcado: self.marcado.clone(),
            eventos: self.eventos,
            lazo: self.lazo.clone(),
            registro: self.registro.clone(),
        }
    }

    /// Vuelve al estado guardado. Lo de uso pasajero (las listas de trabajo de un instante) se vacía.
    pub fn restaurar(&mut self, e: &EstadoDigital) {
        self.niveles.clone_from(&e.niveles);
        self.medidas.clone_from(&e.medidas);
        self.salidas.clone_from(&e.salidas);
        self.modelos = e.modelos.iter().map(|m| m.clonar()).collect();
        self.cola = e.cola.clone();
        self.ahora = e.ahora;
        self.marcado.clone_from(&e.marcado);
        self.eventos = e.eventos;
        self.lazo.clone_from(&e.lazo);
        self.registro.clone_from(&e.registro);
        self.pendientes.clear();
        self.cambiadas.clear();
        self.nuevas.clear();
    }

    pub fn redes(&self) -> usize {
        self.niveles.len()
    }

    pub fn nivel(&self, red: usize) -> Nivel {
        self.niveles[red]
    }

    pub fn ahora(&self) -> Ps {
        self.ahora
    }

    /// Quita de la cabeza de la cola los eventos que ya no valen (su salida se reprogramó o se canceló después): así
    /// `siguiente` y `cabeza` dan el próximo evento que de verdad va a ocurrir.
    fn purgar(&mut self) {
        while let Some((s, v)) = self.cola.version_de_cabeza() {
            let sal = &self.salidas[s as usize];
            if v == sal.version && sal.pendiente.is_some() {
                break;
            }
            self.cola.descartar_cabeza();
        }
    }

    /// Instante del próximo evento programado.
    pub fn siguiente(&self) -> Option<Ps> {
        self.cola.siguiente()
    }

    /// Instante y salida del evento en la cabeza de la cola (puede ser uno cancelado: sirve como cota inferior).
    pub fn cabeza(&self) -> Option<(Ps, u32)> {
        self.cola.cabeza()
    }

    /// Cuántas salidas hay (las de los modelos y las de los puentes de entrada).
    pub fn n_salidas(&self) -> usize {
        self.salidas.len()
    }

    /// La primera salida del modelo `k`.
    pub fn salida_de_modelo(&self, k: usize) -> u32 {
        self.primera[k] as u32
    }

    /// La salida del puente de entrada `k`.
    pub fn salida_de_puente(&self, k: usize) -> u32 {
        self.puentes[k] as u32
    }

    /// Las salidas que manejan las redes marcadas en `redes`.
    pub fn salidas_de(&self, redes: &[bool]) -> Vec<u32> {
        (0..self.salidas.len()).filter(|&s| redes[self.salidas[s].red as usize]).map(|s| s as u32).collect()
    }

    /// Las salidas que maneja cada red (una lista por red), para no recorrer todas las salidas en cada consulta.
    pub fn salidas_por_red(&self) -> Vec<Vec<u32>> {
        let mut v = vec![Vec::new(); self.lectores.len()];
        for (s, sal) in self.salidas.iter().enumerate() {
            v[sal.red as usize].push(s as u32);
        }
        v
    }

    /// El instante más próximo de un cambio pendiente en alguna de las salidas `salidas`.
    pub fn pendiente_en(&self, salidas: &[u32]) -> Option<Ps> {
        salidas.iter().filter_map(|&s| self.salidas[s as usize].pendiente.map(|p| p.0)).min()
    }

    /// Los modelos que no se asentaron en el arranque (un lazo que oscila solo).
    pub fn lazo_de_arranque(&self) -> &[usize] {
        &self.lazo
    }

    /// Segunda lectura y estado del modelo `k`; sin estado propio (una compuerta), el estado es el nivel de su primera
    /// salida.
    pub fn lectura(&self, k: usize) -> (f64, f64) {
        let (aux, estado) = self.modelos[k].lectura();
        (aux, estado.unwrap_or_else(|| self.salidas[self.primera[k]].valor.codigo()))
    }

    /// Frecuencia (Hz), ciclo de trabajo (0 a 1) y número de cambios de la red `red` en el instante `ahora`. Una red que no
    /// completó un periodo, o que dejó de conmutar hace más de dos periodos, da frecuencia y ciclo cero.
    pub fn medida(&self, red: usize, ahora: Ps) -> (f64, f64, f64) {
        let m = &self.medidas[red];
        match m.subida {
            Some(s) if m.periodo > 0 && ahora.saturating_sub(s) <= 2 * m.periodo && m.bajada.is_some_and(|b| ahora.saturating_sub(b) <= 2 * m.periodo) => {
                (1.0 / a_s(m.periodo), m.alto as f64 / m.periodo as f64, m.cambios as f64)
            }
            _ => (0.0, 0.0, m.cambios as f64),
        }
    }

    /// Guarda cada cambio de nivel (instante, red, nivel) para las pruebas contra ngspice.
    pub fn registrar(&mut self, si: bool) {
        self.registro = if si { Some(Vec::new()) } else { None };
    }

    pub fn tomar_registro(&mut self) -> Vec<(Ps, u32, Nivel)> {
        self.registro.as_mut().map(std::mem::take).unwrap_or_default()
    }

    /// Punto de arranque en t = 0 con el nivel de cada puente de entrada (lo que leen del circuito descargado). Las salidas
    /// de los modelos parten de 0 y se recorren sin retardo hasta que ninguna cambie. Si un lazo no se asienta, se arranca
    /// desde la última pasada y sus modelos se evalúan con su retardo: oscila desde ahí.
    pub fn arrancar(&mut self, puentes: &[Nivel]) {
        for (k, &n) in puentes.iter().enumerate() {
            let s = self.puentes[k];
            self.salidas[s].valor = n;
            self.niveles[self.salidas[s].red as usize] = n;
        }
        for k in 0..self.modelos.len() {
            for j in 0..self.modelos[k].salidas().len() {
                let s = self.primera[k] + j;
                self.salidas[s].valor = Nivel::Cero;
                self.niveles[self.salidas[s].red as usize] = Nivel::Cero;
            }
        }
        let mut nuevas = Vec::new();
        for _ in 0..MAX_PASADAS_ARRANQUE {
            self.lazo.clear();
            for i in 0..self.orden.len() {
                let k = self.orden[i];
                self.leer_entradas(k);
                nuevas.clear();
                nuevas.resize(self.modelos[k].salidas().len(), Nivel::Cero);
                let ent = std::mem::take(&mut self.ent);
                self.modelos[k].iniciar(&ent, &mut nuevas);
                self.ent = ent;
                let mut cambio = false;
                for (j, &n) in nuevas.iter().enumerate() {
                    let s = self.primera[k] + j;
                    if self.salidas[s].valor != n {
                        self.salidas[s].valor = n;
                        self.niveles[self.salidas[s].red as usize] = n;
                        cambio = true;
                    }
                }
                if cambio {
                    self.lazo.push(k);
                }
            }
            if self.lazo.is_empty() {
                return;
            }
        }
        // Se evalúan todos: los que cambiaron en la última pasada no son necesariamente los que quedaron inconsistentes (un
        // anillo declarado en orden inverso se congelaba). Un modelo ya asentado no programa nada.
        for k in 0..self.modelos.len() {
            self.evaluar(k);
            let pendiente = (0..self.modelos[k].salidas().len()).any(|j| self.salidas[self.primera[k] + j].pendiente.is_some());
            if pendiente && !self.lazo.contains(&k) {
                self.lazo.push(k);
            }
        }
        self.lazo.sort_unstable();
        self.purgar();
    }

    /// Invariante de la lógica entre dos instantes: cada salida de un modelo vale lo que el modelo pide con sus entradas de
    /// ahora o tiene un cambio pendiente hacia eso. Evaluar de nuevo con las mismas entradas no cambia el estado de ningún
    /// modelo (el reloj de un biestable ya es el de su entrada), así que la comprobación no altera la simulación.
    pub fn comprobar(&mut self) -> Result<(), String> {
        let mut out = Vec::new();
        for k in 0..self.modelos.len() {
            self.leer_entradas(k);
            let act: Vec<Nivel> = (0..self.modelos[k].salidas().len()).map(|j| self.salidas[self.primera[k] + j].valor).collect();
            out.clear();
            let ent = std::mem::take(&mut self.ent);
            self.modelos[k].evaluar(&ent, &act, &mut out);
            self.ent = ent;
            for &(j, n, _) in &out {
                let s = &self.salidas[self.primera[k] + j];
                if n != s.pendiente.map_or(s.valor, |p| p.1) {
                    return Err(format!("modelo {k}, salida {j}: pide {n:?} y tiene {:?} con {:?} pendiente", s.valor, s.pendiente));
                }
            }
        }
        Ok(())
    }

    /// El puente de entrada `k` pasa a `nivel` en el instante `t` (sin retardo: lo lee el ciclo delta de ese instante).
    pub fn poner_puente(&mut self, k: usize, t: Ps, nivel: Nivel) {
        let s = self.puentes[k];
        self.programar_en(s, t.max(self.ahora), nivel);
        self.purgar();
    }

    /// Fija la salida del estado lógico `k` en el instante `t` (lo conmutó el usuario); false si el modelo no se fija.
    pub fn fijar(&mut self, k: usize, t: Ps, nivel: Nivel) -> bool {
        if !self.modelos[k].fijar(nivel) {
            return false;
        }
        let s = self.primera[k];
        self.programar_en(s, t.max(self.ahora), nivel);
        self.purgar();
        true
    }

    /// Procesa todos los eventos del instante `t` y devuelve las redes que cambiaron.
    pub fn procesar(&mut self, t: Ps) -> Result<&[u32], EngineError> {
        self.ahora = self.ahora.max(t);
        self.cambiadas.clear();
        for _ in 0..MAX_CICLOS_DELTA {
            while let Some(e) = self.cola.sacar_en(t) {
                self.aplicar(e);
            }
            if self.pendientes.is_empty() {
                self.purgar();
                return Ok(&self.cambiadas);
            }
            let pendientes = std::mem::take(&mut self.pendientes);
            for &k in &pendientes {
                self.marcado[k as usize] = false;
            }
            for &k in &pendientes {
                self.evaluar(k as usize);
            }
            self.pendientes = pendientes;
            self.pendientes.clear();
        }
        Err(EngineError::Invalid(format!("la lógica no se asienta en t = {:.6e} s: más de {MAX_CICLOS_DELTA} ciclos delta", a_s(t))))
    }

    fn aplicar(&mut self, e: Evento) {
        let sal = &mut self.salidas[e.salida as usize];
        if e.version != sal.version {
            return;
        }
        sal.pendiente = None;
        if sal.valor == e.nivel {
            return;
        }
        sal.valor = e.nivel;
        let red = sal.red;
        self.eventos += 1;
        let antes = self.niveles[red as usize];
        self.niveles[red as usize] = e.nivel;
        let m = &mut self.medidas[red as usize];
        m.cambios += 1;
        if antes != Nivel::Uno && e.nivel == Nivel::Uno {
            if let Some(s0) = m.subida {
                m.periodo = e.t - s0;
                m.alto = match m.bajada {
                    Some(b) if b > s0 => b - s0,
                    _ => 0,
                };
            }
            m.subida = Some(e.t);
        } else if antes == Nivel::Uno && e.nivel != Nivel::Uno {
            m.bajada = Some(e.t);
        }
        if let Some(r) = self.registro.as_mut() {
            r.push((e.t, red, e.nivel));
        }
        self.cambiadas.push(red);
        for &k in &self.lectores[red as usize] {
            if !self.marcado[k as usize] {
                self.marcado[k as usize] = true;
                self.pendientes.push(k);
            }
        }
    }

    fn leer_entradas(&mut self, k: usize) {
        let z = self.modelos[k].z_como();
        self.ent.clear();
        for &r in self.modelos[k].entradas() {
            self.ent.push(self.niveles[r as usize].leida(z));
        }
    }

    fn evaluar(&mut self, k: usize) {
        self.leer_entradas(k);
        self.act.clear();
        for j in 0..self.modelos[k].salidas().len() {
            self.act.push(self.salidas[self.primera[k] + j].valor);
        }
        self.nuevas.clear();
        let (ent, act) = (std::mem::take(&mut self.ent), std::mem::take(&mut self.act));
        let mut nuevas = std::mem::take(&mut self.nuevas);
        self.modelos[k].evaluar(&ent, &act, &mut nuevas);
        for &(j, n, ret) in &nuevas {
            self.programar(self.primera[k] + j, n, ret);
        }
        self.ent = ent;
        self.act = act;
        self.nuevas = nuevas;
    }

    /// Retardo inercial: un cambio que aún no ocurre se reemplaza si se pide otro nivel y se cancela si la salida vuelve al
    /// que tiene (el pulso duró menos que el retardo y no sale).
    fn programar(&mut self, s: usize, nivel: Nivel, ret: Ps) {
        let t = self.ahora + ret;
        let sal = &mut self.salidas[s];
        if let Some((_, vp)) = sal.pendiente {
            if vp == nivel {
                return;
            }
            sal.version = sal.version.wrapping_add(1);
            sal.pendiente = None;
            if nivel == sal.valor {
                return;
            }
        } else if nivel == sal.valor {
            return;
        }
        sal.pendiente = Some((t, nivel));
        let version = sal.version;
        self.cola.programar(Evento { t, salida: s as u32, version, nivel });
    }

    /// Un cambio sin retardo inercial en el instante `t` (puentes de entrada y estados lógicos).
    fn programar_en(&mut self, s: usize, t: Ps, nivel: Nivel) {
        let sal = &mut self.salidas[s];
        if sal.pendiente.is_none() && sal.valor == nivel {
            return;
        }
        sal.version = sal.version.wrapping_add(1);
        sal.pendiente = Some((t, nivel));
        let version = sal.version;
        self.cola.programar(Evento { t, salida: s as u32, version, nivel });
    }
}

#[cfg(test)]
mod tests {
    use super::super::modelos::{Compuerta, EstadoLogico, Funcion};
    use super::Nivel::{Cero, Uno, X};
    use super::*;

    fn compuerta(f: Funcion, ent: &[u32], sal: u32, ret: Ps) -> Box<dyn ModeloDigital> {
        Box::new(Compuerta { f, ent: ent.to_vec(), sal: [sal], subida: ret, bajada: ret, z: X })
    }

    /// Procesa los eventos hasta `hasta` (ps) y devuelve los cambios (instante, red, nivel).
    fn correr(d: &mut Digital, hasta: Ps) -> Vec<(Ps, u32, Nivel)> {
        d.registrar(true);
        while let Some(t) = d.siguiente() {
            if t > hasta {
                break;
            }
            d.procesar(t).unwrap();
        }
        d.tomar_registro()
    }

    #[test]
    fn dos_inversores_en_cadena_con_su_retardo() {
        // Puente → red 0 → NOT → red 1 → NOT → red 2, con 5 ns por compuerta.
        let mut d = Digital::new(3, vec![compuerta(Funcion::Not, &[0], 1, 5000), compuerta(Funcion::Not, &[1], 2, 5000)], &[0]).unwrap();
        d.arrancar(&[Cero]);
        assert_eq!((d.nivel(0), d.nivel(1), d.nivel(2)), (Cero, Uno, Cero));
        assert!(d.lazo_de_arranque().is_empty());
        d.poner_puente(0, 1000, Uno);
        assert_eq!(correr(&mut d, 1_000_000), vec![(1000, 0, Uno), (6000, 1, Cero), (11000, 2, Uno)]);
    }

    #[test]
    fn el_estado_de_un_biestable_en_cero_es_su_q_y_no_la_salida_que_aun_no_cambia() {
        use super::super::modelos::BiestableD;
        // Redes: 0 D, 1 CLK, 2 PRE (puente), 3 CLR (puente), 4 Q, 5 Q̄. PRE en bajo pone Q en 1; luego CLR en bajo la borra.
        let b = BiestableD::new([0, 1, 2, 3], [4, 5], 5000, 5000, X);
        let mut d = Digital::new(6, vec![Box::new(b)], &[0, 1, 2, 3]).unwrap();
        d.arrancar(&[Cero, Cero, Cero, Uno]);
        correr(&mut d, 1_000_000);
        assert_eq!((d.nivel(4), d.lectura(0).1), (Uno, 1.0));
        d.poner_puente(2, 2_000_000, Uno);
        d.poner_puente(3, 2_000_000, Cero);
        d.procesar(2_000_000).unwrap();
        // El modelo ya está en Q = 0; la salida baja 5 ns después. El estado es el del modelo (0), no el de la salida (1).
        assert_eq!(d.nivel(4), Uno);
        assert_eq!(d.lectura(0).1, 0.0);
    }

    #[test]
    fn un_evento_cancelado_no_queda_como_el_siguiente() {
        let mut d = Digital::new(2, vec![compuerta(Funcion::Buf, &[0], 1, 9000)], &[0]).unwrap();
        d.arrancar(&[Cero]);
        d.poner_puente(0, 20_000, Uno);
        d.procesar(20_000).unwrap();
        assert_eq!(d.siguiente(), Some(29_000));
        // El pulso de 5 ns cancela la salida de 29 ns: no queda nada pendiente, y la cabeza de la cola no es ese evento.
        d.poner_puente(0, 25_000, Cero);
        d.procesar(25_000).unwrap();
        assert_eq!(d.siguiente(), None);
        assert_eq!(d.cabeza(), None);
    }

    #[test]
    fn un_pulso_mas_corto_que_el_retardo_no_sale() {
        let mut d = Digital::new(2, vec![compuerta(Funcion::Buf, &[0], 1, 9000)], &[0]).unwrap();
        d.arrancar(&[Cero]);
        // 5 ns en una compuerta de 9 ns: se lo traga (como XSPICE con inertial_delay=true, tarea 1).
        d.poner_puente(0, 20_000, Uno);
        correr(&mut d, 21_000);
        d.poner_puente(0, 25_000, Cero);
        let c = correr(&mut d, 1_000_000);
        assert!(c.iter().all(|&(_, red, _)| red == 0), "{c:?}");
        // 12 ns sí pasa, con 9 ns de retardo en cada flanco.
        d.poner_puente(0, 100_000, Uno);
        correr(&mut d, 101_000);
        d.poner_puente(0, 112_000, Cero);
        let c: Vec<_> = correr(&mut d, 1_000_000).into_iter().filter(|c| c.1 == 1).collect();
        assert_eq!(c, vec![(109_000, 1, Uno), (121_000, 1, Cero)]);
    }

    #[test]
    fn un_anillo_de_tres_inversores_no_se_asienta_y_oscila() {
        let ret = 5000;
        let mut d = Digital::new(3, vec![compuerta(Funcion::Not, &[2], 0, ret), compuerta(Funcion::Not, &[0], 1, ret), compuerta(Funcion::Not, &[1], 2, ret)], &[]).unwrap();
        d.arrancar(&[]);
        assert!(!d.lazo_de_arranque().is_empty());
        correr(&mut d, 1_000_000);
        // Periodo de seis retardos: 30 ns, 33.3 MHz, con la mitad del tiempo en 1.
        let (f, ciclo, cambios) = d.medida(0, d.ahora());
        assert!((f - 1.0 / 30e-9).abs() / f < 1e-9, "f = {f}");
        assert!((ciclo - 0.5).abs() < 1e-9, "ciclo = {ciclo}");
        assert!(cambios > 60.0);
    }

    #[test]
    fn un_anillo_declarado_en_orden_inverso_tambien_oscila() {
        // m0: n0 = NOT(n1), m1: n1 = NOT(n2), m2: n2 = NOT(n0). Tras las pasadas del arranque, los modelos que cambiaron en la
        // última no son los que quedaron inconsistentes: hay que evaluarlos todos o el anillo se congela.
        let ret = 5000;
        let mut d = Digital::new(3, vec![compuerta(Funcion::Not, &[1], 0, ret), compuerta(Funcion::Not, &[2], 1, ret), compuerta(Funcion::Not, &[0], 2, ret)], &[]).unwrap();
        d.arrancar(&[]);
        assert!(!d.lazo_de_arranque().is_empty());
        assert!(d.siguiente().is_some(), "el anillo quedó sin eventos");
        correr(&mut d, 1_000_000);
        let (f, ciclo, _) = d.medida(0, d.ahora());
        assert!((f - 1.0 / 30e-9).abs() / f < 1e-9, "f = {f}");
        assert!((ciclo - 0.5).abs() < 1e-9, "ciclo = {ciclo}");
    }

    #[test]
    fn un_latch_declarado_en_orden_inverso_oscila_igual() {
        // Q̄ primero y Q después: el mismo latch de dos NAND soltado a la vez.
        let mut d = Digital::new(3, vec![compuerta(Funcion::Nand, &[0, 1], 2, 5000), compuerta(Funcion::Nand, &[0, 2], 1, 5000)], &[0]).unwrap();
        d.arrancar(&[Cero]);
        assert_eq!((d.nivel(1), d.nivel(2)), (Uno, Uno));
        d.poner_puente(0, 50_000, Uno);
        let c: Vec<_> = correr(&mut d, 80_000).into_iter().filter(|c| c.1 == 1).collect();
        assert_eq!(c, vec![(55_000, 1, Cero), (60_000, 1, Uno), (65_000, 1, Cero), (70_000, 1, Uno), (75_000, 1, Cero), (80_000, 1, Uno)]);
    }

    #[test]
    fn un_latch_de_dos_nand_soltado_a_la_vez_oscila_como_en_xspice() {
        // red 0: S̄ y R̄ juntas (puente); red 1: Q; red 2: Q̄.
        let mut d = Digital::new(3, vec![compuerta(Funcion::Nand, &[0, 2], 1, 5000), compuerta(Funcion::Nand, &[0, 1], 2, 5000)], &[0]).unwrap();
        d.arrancar(&[Cero]);
        assert_eq!((d.nivel(1), d.nivel(2)), (Uno, Uno));
        d.poner_puente(0, 50_000, Uno);
        let c: Vec<_> = correr(&mut d, 80_000).into_iter().filter(|c| c.1 == 1).collect();
        assert_eq!(c, vec![(55_000, 1, Cero), (60_000, 1, Uno), (65_000, 1, Cero), (70_000, 1, Uno), (75_000, 1, Cero), (80_000, 1, Uno)]);
    }

    #[test]
    fn dos_salidas_en_la_misma_red_se_rechazan() {
        let e = Digital::new(2, vec![compuerta(Funcion::Not, &[0], 1, 1), compuerta(Funcion::Not, &[0], 1, 1)], &[]).err().unwrap();
        assert_eq!(e, EngineError::Invalid("red digital 1: la manejan dos salidas".into()));
        assert!(Digital::new(2, vec![compuerta(Funcion::Not, &[5], 1, 1)], &[]).is_err());
    }

    #[test]
    fn una_red_sin_salidas_queda_en_z_y_la_entrada_cmos_lee_x() {
        let mut d = Digital::new(2, vec![compuerta(Funcion::Not, &[0], 1, 1000)], &[]).unwrap();
        d.arrancar(&[]);
        assert_eq!((d.nivel(0), d.nivel(1)), (Nivel::Z, X));
    }

    #[test]
    fn frecuencia_y_ciclo_de_trabajo() {
        let mut d = Digital::new(1, vec![], &[0]).unwrap();
        d.arrancar(&[Cero]);
        // 100 kHz (10 µs) con 3 µs en alto.
        for k in 0..5u64 {
            d.poner_puente(0, k * 10_000_000, Uno);
            correr(&mut d, k * 10_000_000);
            d.poner_puente(0, k * 10_000_000 + 3_000_000, Cero);
            correr(&mut d, k * 10_000_000 + 3_000_000);
        }
        let (f, ciclo, cambios) = d.medida(0, 45_000_000);
        assert!((f - 1e5).abs() < 1e-6, "f = {f}");
        assert!((ciclo - 0.3).abs() < 1e-12);
        assert_eq!(cambios, 10.0);
        // Quieta más de dos periodos: ya no conmuta.
        assert_eq!(d.medida(0, 80_000_000).0, 0.0);
    }

    #[test]
    fn el_estado_logico_se_fija_en_el_instante_pedido() {
        let mut d = Digital::new(2, vec![Box::new(EstadoLogico { sal: [0], valor: Cero }), compuerta(Funcion::Not, &[0], 1, 2000)], &[]).unwrap();
        d.arrancar(&[]);
        assert_eq!(d.nivel(1), Uno);
        assert!(d.fijar(0, 7000, Uno));
        assert!(!d.fijar(1, 7000, Uno));
        assert_eq!(correr(&mut d, 1_000_000), vec![(7000, 0, Uno), (9000, 1, Cero)]);
        assert_eq!(d.lectura(0), (0.0, 1.0));
        assert_eq!(d.lectura(1), (0.0, 0.0));
    }
}
