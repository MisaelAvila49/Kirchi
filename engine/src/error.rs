#[derive(Debug, thiserror::Error, PartialEq)]
pub enum EngineError {
    #[error("netlist inválida: {0}")]
    Parse(String),
    #[error("{0}")]
    Invalid(String),
    /// `element`: el elemento dueño de la incógnita donde falló la factorización, si se sabe.
    #[error("matriz singular: revisa nodos sin camino a tierra o fuentes de voltaje en paralelo{}", .element.map(|k| format!(" (elemento {k})")).unwrap_or_default())]
    Singular { element: Option<usize> },
    /// Una unión (diodo, LED, base o colector de un transistor) queda en directo con una corriente absurda.
    #[error("una unión queda en directo sin nada que limite su corriente, agrega una resistencia en serie{}", .element.map(|k| format!(" (elemento {k})")).unwrap_or_default())]
    DiodoSinLimite { element: Option<usize> },
    /// La llamada gastó su presupuesto de iteraciones perdidas: no es un fallo del circuito (el estado queda en el último paso
    /// aceptado y la llamada siguiente continúa), pero si se repite sin avanzar el tiempo es que no converge.
    #[error("se agotó el presupuesto de iteraciones en t = {t:.6e} s{}", .element.map(|k| format!(" (elemento {k})")).unwrap_or_default())]
    Presupuesto { t: f64, element: Option<usize> },
    /// `element`: el elemento sospechoso (el último que limitó su voltaje, o el que toca el nodo que más cambió).
    #[error("no convergió en t = {t:.6e} s{}", .element.map(|k| format!(" (elemento {k})")).unwrap_or_default())]
    NoConvergence { t: f64, element: Option<usize> },
}
