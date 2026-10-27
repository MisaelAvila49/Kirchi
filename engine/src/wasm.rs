use wasm_bindgen::prelude::*;

use crate::lectura_sondas as ls;
use crate::netlist::{LIMITE_ELEMENTOS, LIMITE_REDES};
use crate::sonda::Columna;
use crate::{Element, Mixto, Netlist};

#[wasm_bindgen]
pub struct Simulator {
    inner: Mixto,
    /// Voltajes del último `voltages_ptr`, para que la interfaz los lea sin copiarlos a un arreglo nuevo.
    vbuf: Vec<f64>,
    /// Corrientes del último `currents_ptr`, con el mismo cuidado.
    ibuf: Vec<f64>,
    /// Segunda lectura y estado de cada elemento (`aux_ptr`, `estado_ptr`).
    abuf: Vec<f64>,
    ebuf: Vec<f64>,
    /// Nivel de cada red digital (`niveles_ptr`) y su frecuencia, ciclo de trabajo y cambios (`medidas_ptr`).
    nbuf: Vec<f64>,
    mbuf: Vec<f64>,
    /// Columnas, muestras o ventana de una sonda (`sonda_*`), y los promedios (`promedios_ptr`).
    sbuf: Vec<f64>,
    /// Las columnas de una pantalla en f32 (`sonda_columnas_pantalla`).
    fbuf: Vec<f32>,
    columnas: Vec<Columna>,
    pbuf: Vec<f64>,
    pv: Vec<f64>,
    pi: Vec<f64>,
    /// Corrientes por terminal (`terminales_ptr`) y potencias medias (`potencias_ptr`).
    tbuf: Vec<f64>,
    tm: Vec<f64>,
    ta: Vec<f64>,
    wbuf: Vec<f64>,
    /// Los cambios que se oyen de la última toma (se reutiliza: no reserva memoria por llamada).
    cbuf: Vec<crate::transient::Cruce>,
    /// Las muestras de la última toma (`tomar_muestras`).
    mubuf: Vec<crate::mixto::Muestra>,
}

#[wasm_bindgen]
impl Simulator {
    /// `h` es el paso más largo; el motor lo acorta donde la señal cambia rápido.
    #[wasm_bindgen(constructor)]
    pub fn new(netlist_json: &str, h: f64) -> Result<Simulator, JsError> {
        let net = Netlist::from_json(netlist_json)?;
        net.check_limits(LIMITE_REDES, LIMITE_ELEMENTOS)?;
        let inner = Mixto::new(net, h)?;
        let vbuf = Vec::with_capacity(inner.node_count());
        let n = inner.element_count();
        let d = inner.digital_count();
        Ok(Simulator {
            inner,
            vbuf,
            ibuf: Vec::with_capacity(n),
            abuf: Vec::with_capacity(n),
            ebuf: Vec::with_capacity(n),
            nbuf: Vec::with_capacity(d),
            mbuf: Vec::with_capacity(3 * d),
            sbuf: Vec::new(),
            fbuf: Vec::new(),
            columnas: Vec::new(),
            pbuf: Vec::new(),
            pv: Vec::new(),
            pi: Vec::new(),
            tbuf: Vec::new(),
            tm: Vec::new(),
            ta: Vec::new(),
            wbuf: Vec::new(),
            cbuf: Vec::new(),
            mubuf: Vec::new(),
        })
    }

    /// Sondas de los instrumentos.
    pub fn sondas(&self) -> usize {
        self.inner.n_sondas()
    }

    /// El instante de la última muestra de la sonda `k` (el tiempo de su isla); NaN si no existe.
    pub fn sonda_tiempo(&self, k: usize) -> f64 {
        self.inner.sonda(k).map_or(f64::NAN, |s| s.tiempo())
    }

    /// El instante de la muestra más vieja que conserva el búfer crudo de la sonda `k`; NaN si no existe.
    pub fn sonda_cubre(&self, k: usize) -> f64 {
        self.inner.sonda(k).map_or(f64::NAN, |s| s.cubre_desde())
    }

    /// Cambia el ancho de la rejilla, el acoplamiento y el disparo de la sonda `k` (`{"columna":…,"acople":"dc","disparo":…}`).
    pub fn configurar_sonda(&mut self, k: usize, config_json: &str) -> Result<(), JsError> {
        Ok(ls::configurar(&mut self.inner, k, config_json)?)
    }

    /// Pone en pausa (`false`) o reanuda la sonda `k`: en pausa no registra; al reanudar empieza vacía (`Sonda::activar`).
    /// Una sonda que no existe no hace nada.
    pub fn sonda_activar(&mut self, k: usize, si: bool) {
        if let Some(s) = self.inner.sonda_mut(k) {
            s.activar(si);
        }
    }

    /// Dirección de 7 decimales por columna (mínimo, máximo, primero, último, ∫v·dt, ∫v²·dt y banderas) de las columnas
    /// `i0..i1` de la pantalla que empieza en `t0` con columnas de `dt`. Vale hasta la siguiente llamada que reserve memoria.
    pub fn sonda_columnas(&mut self, k: usize, t0: f64, dt: f64, i0: usize, i1: usize) -> usize {
        ls::columnas_planas(&self.inner, k, t0, dt, i0, i1, &mut self.columnas, &mut self.sbuf);
        self.sbuf.as_ptr() as usize
    }

    /// Dirección de 5 decimales de 32 bits por columna (mínimo, máximo, primero, último y banderas): lo que dibuja la pantalla,
    /// para copiarlo de una vez a la memoria de los instrumentos.
    pub fn sonda_columnas_pantalla(&mut self, k: usize, t0: f64, dt: f64, i0: usize, i1: usize) -> usize {
        ls::columnas_pantalla(&self.inner, k, t0, dt, i0, i1, &mut self.columnas, &mut self.fbuf);
        self.fbuf.as_ptr() as usize
    }

    /// Lo mismo para la resta de las sondas `a` y `b` (el canal A − B).
    pub fn sonda_resta(&mut self, a: usize, b: usize, t0: f64, dt: f64, i0: usize, i1: usize) -> usize {
        ls::resta_planas(&self.inner, a, b, t0, dt, i0, i1, &mut self.columnas, &mut self.sbuf);
        self.sbuf.as_ptr() as usize
    }

    /// Dirección de `n` (a lo más 4,096) valores interpolados en `t0 + i·dt`; NaN donde el búfer no cubre.
    pub fn sonda_muestras(&mut self, k: usize, t0: f64, dt: f64, n: usize) -> usize {
        ls::muestras_planas(&self.inner, k, t0, dt, n, &mut self.sbuf);
        self.sbuf.as_ptr() as usize
    }

    /// Dirección de las 13 cifras de la ventana de `t0` a `t1` (ver `Ventana::cifras`).
    pub fn sonda_ventana(&mut self, k: usize, t0: f64, t1: f64) -> usize {
        ls::ventana_plana(&self.inner, k, t0, t1, &mut self.sbuf);
        self.sbuf.as_ptr() as usize
    }

    /// El último disparo de la sonda `k` que no pasa de `t_max`; NaN si no hay.
    pub fn sonda_disparo(&self, k: usize, t_max: f64) -> f64 {
        self.inner.sonda(k).and_then(|s| s.ultimo_disparo(t_max)).unwrap_or(f64::NAN)
    }

    /// Bytes que reservan las sondas (el criterio 6).
    pub fn memoria_sondas(&self) -> usize {
        self.inner.memoria_sondas()
    }

    /// Empieza a integrar los voltajes y las corrientes para las lecturas sin parpadeo.
    pub fn activar_promedios(&mut self) {
        self.inner.activar_promedios();
    }

    pub fn reiniciar_promedios(&mut self) {
        self.inner.reiniciar_promedios();
    }

    /// Dirección de 1 + nodos + elementos decimales: la duración integrada y el promedio de cada nodo y de cada corriente.
    pub fn promedios_ptr(&mut self) -> usize {
        ls::promedios_planos(&self.inner, &mut self.pv, &mut self.pi, &mut self.pbuf);
        self.pbuf.as_ptr() as usize
    }

    /// Empieza o deja de integrar la corriente de cada terminal (la corriente animada encendida o apagada).
    pub fn activar_terminales(&mut self, si: bool) {
        self.inner.activar_terminales(si);
    }

    /// Casillas de corriente por terminal: por elemento analógico, sus nodos y la tierra interna (los digitales no tienen).
    pub fn casillas_terminales(&self) -> usize {
        self.inner.casillas_terminales()
    }

    /// Dirección de 1 + 2 × casillas decimales: la duración integrada, el promedio de cada corriente por terminal y el de su
    /// valor absoluto. Vale hasta la siguiente llamada que reserve memoria.
    pub fn terminales_ptr(&mut self) -> usize {
        let d = self.inner.terminales_into(&mut self.tm, &mut self.ta);
        self.tbuf.clear();
        self.tbuf.push(d);
        self.tbuf.extend_from_slice(&self.tm);
        self.tbuf.extend_from_slice(&self.ta);
        self.tbuf.as_ptr() as usize
    }

    /// Los elementos cuya potencia media se integra (resistencias, transistores y fusibles que pueden avisar).
    pub fn activar_potencias(&mut self, elementos: &[u32]) -> Result<(), JsError> {
        let v: Vec<usize> = elementos.iter().map(|&k| k as usize).collect();
        Ok(self.inner.activar_potencias(&v)?)
    }

    /// Dirección de la potencia media de cada elemento de `activar_potencias`, en su orden.
    pub fn potencias_ptr(&mut self) -> usize {
        self.inner.potencias_into(&mut self.wbuf);
        self.wbuf.as_ptr() as usize
    }

    /// Los cambios de estado que se oyen desde la última llamada: primero cuántos no cupieron y luego tres números por cada uno
    /// (elemento, instante y nivel: 1 suena u operado, 0 en silencio o en reposo).
    /// Sin cambios ni perdidos devuelve un arreglo vacío (sin reservar memoria).
    pub fn take_cruces(&mut self) -> Vec<f64> {
        let perdidos = self.inner.tomar_cruces(&mut self.cbuf);
        if self.cbuf.is_empty() && perdidos == 0 {
            return Vec::new();
        }
        let mut v = Vec::with_capacity(1 + 3 * self.cbuf.len());
        v.push(perdidos as f64);
        for x in &self.cbuf {
            v.extend([x.element as f64, x.t, x.nivel as f64]);
        }
        v
    }

    /// «Las piezas se queman»: quema o repone el elemento `index` (resistencia, diodo o transistor).
    pub fn quemar(&mut self, index: usize, si: bool) -> Result<(), JsError> {
        Ok(self.inner.quemar(index, si)?)
    }

    /// El paso más corto que da el motor: «Avanzar» llega a su meta con esta precisión.
    pub fn hmin(&self) -> f64 {
        self.inner.hmin()
    }

    /// Retroceder: guarda el estado completo de ahora (antes de un avance en pausa). Se guardan los últimos 200 y a lo más 64 MB;
    /// cualquier edición del circuito los descarta. Ver `Mixto::guardar_estado`.
    pub fn guardar_estado(&mut self) {
        self.inner.guardar_estado();
    }

    /// Vuelve al último estado guardado y devuelve su instante; NaN si no hay ninguno. Las sondas se recortan hasta ese instante.
    pub fn restaurar_estado(&mut self) -> f64 {
        self.inner.restaurar_estado().unwrap_or(f64::NAN)
    }

    /// Olvida los estados guardados.
    pub fn descartar_estados(&mut self) {
        self.inner.descartar_estados();
    }

    /// Cuántos estados hay guardados.
    pub fn estados_guardados(&self) -> usize {
        self.inner.estados_guardados().0
    }

    /// Bytes que ocupan los estados guardados.
    pub fn estados_bytes(&self) -> usize {
        self.inner.estados_guardados().1
    }

    /// Cuántos estados se olvidaron por pasar de la memoria máxima desde la última pregunta (y lo pone en cero).
    pub fn estados_perdidos(&mut self) -> u32 {
        self.inner.estados_perdidos_por_memoria().min(u32::MAX as u64) as u32
    }

    /// Avanza hasta `t_end` o hasta `max_steps` pasos (de una isla o instantes de la lógica); devuelve los pasos dados.
    pub fn advance_to(&mut self, t_end: f64, max_steps: u32) -> Result<u32, JsError> {
        Ok(self.inner.advance_to(t_end, max_steps)?)
    }

    /// Iteraciones de Newton por intento (50 por omisión): solo las pruebas la bajan, para forzar el rescate de convergencia.
    pub fn set_max_newton_iterations(&mut self, n: u32) {
        self.inner.set_max_iter(n as usize);
    }

    /// Iteraciones perdidas que gastó la última llamada a `advance_to`.
    pub fn lost_iterations(&self) -> u32 {
        self.inner.lost_iterations() as u32
    }

    /// Cambia cuántas iteraciones de Newton perdidas gasta una llamada a `advance_to` antes de devolver el error (20,000 por omisión).
    pub fn set_iteration_budget(&mut self, n: u32) {
        self.inner.set_iteration_budget(n as usize);
    }

    /// Cambia cuántos eventos digitales procesa una llamada a `advance_to` antes de devolver el control (100,000 por omisión).
    pub fn set_event_budget(&mut self, n: u32) {
        self.inner.set_event_budget(n as u64);
    }

    /// Cambia en caliente la resistencia del elemento `index` sin reiniciar el tiempo ni los capacitores.
    pub fn set_resistance(&mut self, index: usize, ohms: f64) -> Result<(), JsError> {
        Ok(self.inner.set_resistance(index, ohms)?)
    }

    /// Cambia en caliente el elemento `index` por otro del mismo tipo y con los mismos nodos (una resistencia, una fuente o
    /// un estado lógico, en el JSON de la netlist): el tiempo y el estado de capacitores, inductores y dispositivos siguen.
    pub fn set_element(&mut self, index: usize, element_json: &str) -> Result<(), JsError> {
        let e: Element = serde_json::from_str(element_json).map_err(|e| JsError::new(&format!("netlist inválida: {e}")))?;
        Ok(self.inner.set_element(index, e)?)
    }

    /// Tolerancias de convergencia y del paso (las de ngspice; por omisión reltol 1e-3, abstol 1e-12 y vntol 1e-6).
    pub fn set_tolerances(&mut self, reltol: f64, abstol: f64, vntol: f64) {
        let t = crate::devices::Tol::default();
        self.inner.set_tolerances(crate::devices::Tol { reltol, abstol, vntol, ..t });
    }

    /// Cambia el paso máximo sin perder el tiempo ni el estado (la frecuencia de una fuente cambió en caliente).
    pub fn set_max_step(&mut self, h: f64) -> Result<(), JsError> {
        Ok(self.inner.set_max_step(h)?)
    }

    /// Repone el elemento `index` (un fusible fundido queda entero).
    pub fn reset_element(&mut self, index: usize) -> Result<(), JsError> {
        Ok(self.inner.reset_element(index)?)
    }

    /// Fusibles que se fundieron desde la última llamada: cuatro números por cada uno (elemento, instante, corriente
    /// que lo fundió y duración de la sobrecarga en segundos).
    pub fn take_events(&mut self) -> Vec<f64> {
        self.inner.take_events().iter().flat_map(|e| [e.element as f64, e.t, e.amps, e.seconds]).collect()
    }

    pub fn time(&self) -> f64 {
        self.inner.time()
    }

    /// Pone el canal de valor `canal` en `valor` desde `t` (segundos). Un rechazo (número no finito, canal fuera de rango, cola
    /// llena) vuelve como error y no deja rastro.
    pub fn poner_valor(&mut self, canal: usize, t: f64, valor: f64) -> Result<(), JsError> {
        Ok(self.inner.poner_valor(canal, t, valor)?)
    }

    /// El valor del canal en el tiempo del simulador; NaN si no existe.
    pub fn valor_canal(&self, canal: usize) -> f64 {
        self.inner.valor_canal(canal)
    }

    /// Cuántos cambios de canal llegaron con un tiempo anterior al de su isla (como número: sin BigInt).
    pub fn tardios(&self) -> f64 {
        self.inner.tardios() as f64
    }

    /// Programa la lectura del lector `lector` en `t` (segundos).
    pub fn pedir_muestra(&mut self, lector: usize, t: f64) -> Result<(), JsError> {
        Ok(self.inner.pedir_muestra(lector, t)?)
    }

    /// Las muestras cumplidas, en tríos (lector, instante pedido, valor).
    pub fn tomar_muestras(&mut self) -> Vec<f64> {
        self.mubuf.clear();
        self.inner.tomar_muestras(&mut self.mubuf);
        self.mubuf.iter().flat_map(|m| [m.lector as f64, m.t, m.v]).collect()
    }

    /// El tiempo de la isla del lector y su lectura vigente, sin programar nada: (t, valor); NaN en el valor si no existe.
    pub fn leer_ahora(&self, lector: usize) -> Vec<f64> {
        let (t, v) = self.inner.leer_ahora(lector);
        vec![t, v]
    }

    pub fn node_count(&self) -> usize {
        self.inner.node_count()
    }

    pub fn voltages(&self) -> Vec<f64> {
        self.inner.voltages()
    }

    pub fn element_count(&self) -> usize {
        self.inner.element_count()
    }

    /// Redes digitales de la netlist.
    pub fn digital_count(&self) -> usize {
        self.inner.digital_count()
    }

    /// Los elementos de un lazo de compuertas que no se asentó al arrancar (oscila solo).
    pub fn lazo_de_arranque(&self) -> Vec<u32> {
        self.inner.lazo_de_arranque().into_iter().map(|k| k as u32).collect()
    }

    /// Las redes digitales que entraron en conflicto de bus desde la última llamada.
    pub fn take_conflictos(&mut self) -> Vec<u32> {
        self.inner.tomar_conflictos()
    }

    /// Corriente de cada elemento, en el orden de la netlist, de `a` hacia `b` a través del elemento.
    pub fn currents(&self) -> Vec<f64> {
        self.inner.currents()
    }

    /// Dirección en la memoria de WASM de los voltajes recién calculados (`node_count` decimales). Vale
    /// hasta la siguiente llamada que reserve memoria; se lee de inmediato con `new Float64Array(memory.buffer, ptr, n)`.
    pub fn voltages_ptr(&mut self) -> usize {
        self.inner.voltages_into(&mut self.vbuf);
        self.vbuf.as_ptr() as usize
    }

    /// Dirección de las corrientes del último paso (`element_count` decimales), con el mismo cuidado.
    pub fn currents_ptr(&mut self) -> usize {
        self.ibuf.clear();
        self.ibuf.extend(self.inner.readings().iter().map(|r| r.i));
        self.ibuf.as_ptr() as usize
    }

    /// Dirección de la segunda lectura de cada elemento: corriente de base, velocidad del motor (rad/s), voltaje del
    /// nodo interno del amplificador, calentamiento del foco o del fusible, corriente del contacto del relé, lo propio de
    /// cada modelo digital.
    pub fn aux_ptr(&mut self) -> usize {
        self.abuf.clear();
        self.abuf.extend(self.inner.readings().iter().map(|r| r.aux));
        self.abuf.as_ptr() as usize
    }

    /// Dirección del estado de cada elemento: región del transistor, saturación del amplificador (1 contra V+, -1
    /// contra V-), contacto del relé (1 operado), fusible (1 fundido), nivel de la salida de un modelo digital.
    pub fn estado_ptr(&mut self) -> usize {
        self.ebuf.clear();
        self.ebuf.extend(self.inner.readings().iter().map(|r| r.estado));
        self.ebuf.as_ptr() as usize
    }

    /// Dirección del nivel de cada red digital (`digital_count` decimales: 0, 1, 2 para X y 3 para Z).
    pub fn niveles_ptr(&mut self) -> usize {
        self.nbuf.clear();
        self.nbuf.extend((0..self.inner.digital_count()).map(|r| self.inner.nivel(r).codigo()));
        self.nbuf.as_ptr() as usize
    }

    /// Dirección de tres decimales por red digital: frecuencia (Hz, cero si no conmuta), ciclo de trabajo (0 a 1) y cuántas
    /// veces cambió desde el principio.
    pub fn medidas_ptr(&mut self) -> usize {
        self.mbuf.clear();
        for r in 0..self.inner.digital_count() {
            let (f, c, n) = self.inner.medida(r);
            self.mbuf.extend([f, c, n]);
        }
        self.mbuf.as_ptr() as usize
    }
}
