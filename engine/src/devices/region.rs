//! Códigos de región que `reading` publica para los transistores: un solo significado por código en todos los modelos.

/// No conduce (corte).
pub const CORTE: f64 = 0.0;
/// Amplifica como fuente de corriente controlada (activa en el BJT, saturación en el MOSFET y el JFET).
pub const AMPLIFICA: f64 = 1.0;
/// Conduce como interruptor (saturación en el BJT, lineal en el MOSFET y el JFET).
pub const INTERRUPTOR: f64 = 2.0;
/// Al revés (activa inversa del BJT).
pub const INVERSA: f64 = 3.0;
