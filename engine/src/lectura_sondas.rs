//! Lo que la API de WASM entrega de las sondas, en arreglos planos que la interfaz lee con un `Float64Array`
//! sobre la memoria del WASM. Vive aparte de `wasm.rs` para probarlo en nativo.

use crate::error::EngineError;
use crate::mixto::Mixto;
use crate::netlist::COLUMNA_SONDA;
use crate::sonda::{resta_columnas, Columna, ConfigSonda, COLUMNAS};

/// Decimales por columna en `columnas_planas`: mínimo, máximo, primero, último, ∫v·dt, ∫v²·dt y banderas.
pub const CIFRAS_COLUMNA: usize = 7;
/// Cifras por columna de `columnas_pantalla` (en f32, como las escribe la memoria de los instrumentos): mínimo, máximo,
/// primero, último y banderas.
pub const CIFRAS_PANTALLA: usize = 5;
/// Muestras que se piden de una vez.
pub const MAX_MUESTRAS: usize = 4096;

fn aplanar(cs: &[Columna], out: &mut Vec<f64>) {
    out.clear();
    for c in cs {
        out.extend_from_slice(&[c.min, c.max, c.primero, c.ultimo, c.iv, c.iv2, c.banderas as f64]);
    }
}

/// Las columnas `i0..i1` (a lo más `COLUMNAS`) de la sonda `k`; vacío si no existe.
pub fn columnas_planas(m: &Mixto, k: usize, t0: f64, dt: f64, i0: usize, i1: usize, tmp: &mut Vec<Columna>, out: &mut Vec<f64>) {
    let i1 = i1.min(i0.saturating_add(COLUMNAS)).max(i0);
    tmp.clear();
    tmp.resize(i1 - i0, Columna::VACIA);
    if let Some(s) = m.sonda(k) {
        s.columnas(t0, dt, i0, i1, tmp);
    }
    aplanar(tmp, out);
}

/// Las columnas `i0..i1` de la sonda `k` como las dibuja la pantalla: cinco cifras en f32 por columna, que el worker copia
/// de una vez a la memoria compartida (sin las integrales, que solo piden las medidas, cuatro veces por segundo).
#[allow(clippy::too_many_arguments)]
pub fn columnas_pantalla(m: &Mixto, k: usize, t0: f64, dt: f64, i0: usize, i1: usize, tmp: &mut Vec<Columna>, out: &mut Vec<f32>) {
    let i1 = i1.min(i0.saturating_add(COLUMNAS)).max(i0);
    let _ = tmp;
    out.clear();
    match m.sonda(k) {
        // Cada columna va directo a sus cinco cifras en f32, sin pasar por un vector de columnas.
        Some(s) => s.columnas_vista_con(t0, dt, i0, i1, |_, c| out.extend_from_slice(&[c.min as f32, c.max as f32, c.primero as f32, c.ultimo as f32, c.banderas as f32])),
        None => {
            let c = Columna::VACIA;
            for _ in i0..i1 {
                out.extend_from_slice(&[c.min as f32, c.max as f32, c.primero as f32, c.ultimo as f32, c.banderas as f32]);
            }
        }
    }
}

/// Las columnas de A − B.
#[allow(clippy::too_many_arguments)]
pub fn resta_planas(m: &Mixto, a: usize, b: usize, t0: f64, dt: f64, i0: usize, i1: usize, tmp: &mut Vec<Columna>, out: &mut Vec<f64>) {
    let i1 = i1.min(i0.saturating_add(COLUMNAS)).max(i0);
    tmp.clear();
    tmp.resize(i1 - i0, Columna::VACIA);
    if let (Some(sa), Some(sb)) = (m.sonda(a), m.sonda(b)) {
        if t0.is_finite() && dt > 0.0 && dt.is_finite() {
            resta_columnas(sa, sb, t0, dt, i0, i1, tmp);
        }
    }
    aplanar(tmp, out);
}

pub fn muestras_planas(m: &Mixto, k: usize, t0: f64, dt: f64, n: usize, out: &mut Vec<f64>) {
    out.clear();
    out.resize(n.min(MAX_MUESTRAS), f64::NAN);
    if let Some(s) = m.sonda(k) {
        // Un origen o un paso que no son números, o un paso que no avanza: NaN.
        if t0.is_finite() && dt > 0.0 && dt.is_finite() {
            s.muestras(t0, dt, out);
        }
    }
}

pub fn ventana_plana(m: &Mixto, k: usize, t0: f64, t1: f64, out: &mut Vec<f64>) {
    out.clear();
    match m.sonda(k) {
        Some(s) => out.extend_from_slice(&s.ventana(t0, t1).cifras()),
        None => out.resize(13, f64::NAN),
    }
}

/// Cambia la rejilla, el acoplamiento y el disparo de la sonda `k` (el JSON de `ConfigSonda`).
pub fn configurar(m: &mut Mixto, k: usize, json: &str) -> Result<(), EngineError> {
    let c: ConfigSonda = serde_json::from_str(json).map_err(|e| EngineError::Invalid(format!("sonda {k}: configuración inválida: {e}")))?;
    if !(c.columna >= COLUMNA_SONDA.0 && c.columna <= COLUMNA_SONDA.1) {
        return Err(EngineError::Invalid(format!("sonda {k}: columna fuera de rango (de 1e-12 a 1e3 s)")));
    }
    if let Some(d) = c.disparo {
        if !(d.nivel.is_finite() && d.nivel.abs() <= 1e6 && d.histeresis.is_finite() && d.histeresis >= 0.0) {
            return Err(EngineError::Invalid(format!("sonda {k}: disparo fuera de rango")));
        }
    }
    let s = m.sonda_mut(k).ok_or_else(|| EngineError::Invalid(format!("sonda {k}: fuera de rango")))?;
    s.configurar(&c);
    Ok(())
}

/// [duración, promedio de cada nodo…, promedio de la corriente de cada elemento…].
pub fn promedios_planos(m: &Mixto, v: &mut Vec<f64>, i: &mut Vec<f64>, out: &mut Vec<f64>) {
    let d = m.promedios_into(v, i);
    out.clear();
    out.push(d);
    out.extend_from_slice(v);
    out.extend_from_slice(i);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::netlist::Netlist;

    fn rc() -> Mixto {
        Mixto::new(
            Netlist::from_json(
                r#"{"nodes":3,"elements":[
                {"type":"V","a":1,"b":0,"wave":{"kind":"sine","offset":0,"amp":1,"freq":1000}},
                {"type":"R","a":1,"b":2,"ohms":1000},
                {"type":"C","a":2,"b":0,"farads":1e-7}],
              "sondas":[{"kind":"v","p":1,"n":0,"muestras":4096,"columna":1e-5},{"kind":"v","p":2,"n":0,"muestras":4096,"columna":1e-5}]}"#,
            )
            .unwrap(),
            1e-5,
        )
        .unwrap()
    }

    #[test]
    fn las_columnas_planas_traen_siete_cifras_y_se_acotan() {
        let mut m = rc();
        m.advance_to(2e-3, u32::MAX).unwrap();
        let (mut tmp, mut out) = (Vec::new(), Vec::new());
        columnas_planas(&m, 0, 0.0, 1e-4, 0, 20, &mut tmp, &mut out);
        assert_eq!(out.len(), 20 * CIFRAS_COLUMNA);
        // La columna de 0.2 a 0.3 ms de una senoidal de 1 kHz: su máximo, en el paso más cercano a 0.25 ms, casi 1.
        assert!((out[2 * CIFRAS_COLUMNA + 1] - 1.0).abs() < 1e-3, "{}", out[2 * CIFRAS_COLUMNA + 1]);
        columnas_planas(&m, 0, 0.0, 1e-9, 0, 10_000, &mut tmp, &mut out);
        assert_eq!(out.len(), COLUMNAS * CIFRAS_COLUMNA);
        columnas_planas(&m, 9, 0.0, 1e-4, 0, 3, &mut tmp, &mut out);
        assert!(out.chunks(CIFRAS_COLUMNA).all(|c| c[6] as u8 & crate::sonda::BANDERA_VACIA != 0));
    }

    #[test]
    fn la_resta_y_las_muestras_salen_planas() {
        let mut m = rc();
        m.advance_to(2e-3, u32::MAX).unwrap();
        let (mut tmp, mut out) = (Vec::new(), Vec::new());
        resta_planas(&m, 0, 1, 1e-3, 0.25e-3, 0, 1, &mut tmp, &mut out);
        // ∫(v1 − v2) dt de 1 a 1.25 ms = R · ∫i dt = R · C · (v2(1.25 ms) − v2(1 ms)): el trapezoidal del motor y las
        // integrales de las columnas son la misma regla; la diferencia (5e-4 en el ensayo) es la de leer v2 entre pasos.
        let s = m.sonda(1).unwrap();
        let carga = 1e3 * 1e-7 * (s.valor_en(1.25e-3) - s.valor_en(1e-3));
        assert!((out[4] - carga).abs() < 1e-3 * carga.abs(), "{} contra {carga}", out[4]);
        muestras_planas(&m, 0, 0.0, 0.25e-3, 5, &mut out);
        assert!((out[1] - 1.0).abs() < 1e-3 && out[2].abs() < 1e-3, "{:?}", &out[..3]);
    }

    #[test]
    fn configurar_rechaza_lo_que_esta_fuera_de_rango() {
        let mut m = rc();
        assert!(configurar(&mut m, 0, r#"{"columna":1e-4,"acople":"ac","disparo":{"nivel":0.5,"subida":true,"histeresis":0.1}}"#).is_ok());
        assert!(matches!(configurar(&mut m, 0, r#"{"columna":0}"#), Err(EngineError::Invalid(t)) if t.contains("columna")));
        assert!(matches!(configurar(&mut m, 0, r#"{"columna":1e-4,"disparo":{"nivel":1e9,"subida":true}}"#), Err(EngineError::Invalid(t)) if t.contains("disparo")));
        assert!(matches!(configurar(&mut m, 5, r#"{"columna":1e-4}"#), Err(EngineError::Invalid(t)) if t.contains("fuera de rango")));
        assert!(configurar(&mut m, 0, r#"{"columna":1e-4,"acople":"rara"}"#).is_err());
    }

    #[test]
    fn los_promedios_planos_empiezan_con_la_duracion() {
        let mut m = rc();
        m.activar_promedios();
        m.advance_to(1e-3, u32::MAX).unwrap();
        let (mut v, mut i, mut out) = (Vec::new(), Vec::new(), Vec::new());
        promedios_planos(&m, &mut v, &mut i, &mut out);
        assert_eq!(out.len(), 1 + 3 + 3);
        assert!((out[0] - 1e-3).abs() < 1e-12);
        // Un periodo completo de la senoidal: promedio casi cero.
        assert!(out[2].abs() < 1e-3);
    }

    #[test]
    fn las_columnas_de_pantalla_son_las_cinco_cifras_de_las_planas_en_f32() {
        let mut m = rc();
        m.advance_to(2e-3, u32::MAX).unwrap();
        let (mut tmp, mut out, mut f) = (Vec::new(), Vec::new(), Vec::new());
        columnas_planas(&m, 0, 0.0, 1e-5, 0, 300, &mut tmp, &mut out);
        columnas_pantalla(&m, 0, 0.0, 1e-5, 0, 300, &mut tmp, &mut f);
        assert_eq!(f.len(), 300 * CIFRAS_PANTALLA);
        for (c, p) in out.chunks(CIFRAS_COLUMNA).zip(f.chunks(CIFRAS_PANTALLA)) {
            let bits = |x: [f32; 5]| x.map(f32::to_bits);
            assert_eq!(bits([c[0] as f32, c[1] as f32, c[2] as f32, c[3] as f32, c[6] as f32]), bits([p[0], p[1], p[2], p[3], p[4]]));
        }
        columnas_pantalla(&m, 9, 0.0, 1e-5, usize::MAX - 1, usize::MAX, &mut tmp, &mut f);
        assert_eq!(f.len(), CIFRAS_PANTALLA);
    }

    #[test]
    fn lo_que_llega_de_afuera_fuera_de_rango_no_rompe_nada() {
        // La API de WASM recibe números de la interfaz: índices enormes, i0 > i1, instantes y anchos que no son números.
        let mut m = rc();
        m.advance_to(1e-3, u32::MAX).unwrap();
        let (mut tmp, mut out) = (Vec::new(), Vec::new());
        columnas_planas(&m, 0, 0.0, 1e-4, usize::MAX - 2, usize::MAX, &mut tmp, &mut out);
        assert_eq!(out.len(), 2 * CIFRAS_COLUMNA);
        columnas_planas(&m, 0, 0.0, 1e-4, 10, 3, &mut tmp, &mut out);
        assert!(out.is_empty());
        for (t0, dt) in [(f64::NAN, 1e-4), (0.0, f64::NAN), (0.0, 0.0), (0.0, -1.0), (f64::INFINITY, 1e-4)] {
            columnas_planas(&m, 0, t0, dt, 0, 4, &mut tmp, &mut out);
            assert!(out.chunks(CIFRAS_COLUMNA).all(|c| c[6] as u8 & crate::sonda::BANDERA_VACIA != 0), "columnas con {t0}, {dt}");
            resta_planas(&m, 0, 1, t0, dt, 0, 4, &mut tmp, &mut out);
            assert!(out.chunks(CIFRAS_COLUMNA).all(|c| c[6] as u8 & crate::sonda::BANDERA_VACIA != 0), "resta con {t0}, {dt}");
            muestras_planas(&m, 0, t0, dt, 4, &mut out);
            assert!(out.iter().all(|v| v.is_nan()), "muestras con {t0}, {dt}: {out:?}");
        }
        resta_planas(&m, 0, 1, 0.0, 1e-4, usize::MAX - 1, usize::MAX, &mut tmp, &mut out);
        assert_eq!(out.len(), CIFRAS_COLUMNA);
        ventana_plana(&m, 0, f64::NAN, 1e-3, &mut out);
        assert_eq!(out.len(), 13);
        ventana_plana(&m, 99, 0.0, 1e-3, &mut out);
        assert_eq!(out.len(), 13);
        assert!(out.iter().all(|v| v.is_nan()));
    }
}
