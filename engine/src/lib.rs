pub mod canales;
pub mod dense;
pub mod devices;
pub mod digital;
pub mod grafo;
pub mod error;
pub mod mna;
pub mod netlist;
pub mod sonda;
pub mod lectura_sondas;

pub use error::EngineError;
pub use netlist::{Element, Netlist, Wave};
pub mod mixto;
pub mod transient;

pub use mixto::Mixto;
pub use transient::Transient;

#[cfg(feature = "faer")]
pub mod sparse;

#[cfg(target_arch = "wasm32")]
mod wasm;
