// Idioma de la página. La página en inglés (/en/) se genera desde los atributos data-en y data-en-<atributo>
// del HTML en español; aplicar() traduce lo que el JS agrega después. Los textos que pone el JS salen de TEXTOS.
const TEXTOS = {
  es: { pausar_mov: "Pausar movimiento", reanudar_mov: "Reanudar movimiento",
        ampliar: "Ampliar la captura", sigue: "Sigue: ", car_pausar: "Pausar el carrusel", car_reanudar: "Reanudar el carrusel", video_play: "Reproducir el video", video_pausa: "Pausar el video", para: "Descargar para ", tambien: "También para", version: "Versión ",
        os_windows: "Windows 10 y 11 · Microsoft Store", os_macos: "macOS · dmg universal", os_linux: "Linux · AppImage" },
  en: { pausar_mov: "Pause motion", reanudar_mov: "Resume motion",
        ampliar: "Enlarge the screenshot", sigue: "Next: ", car_pausar: "Pause the carousel", car_reanudar: "Resume the carousel", video_play: "Play the video", video_pausa: "Pause the video", para: "Download for ", tambien: "Also for", version: "Version ",
        os_windows: "Windows 10 and 11 · Microsoft Store", os_macos: "macOS · universal dmg", os_linux: "Linux · AppImage" },
};
const raiz = document.documentElement;
const oyentes = [];
const guardados = new WeakMap(); // elemento -> { html, attrs: { nombre: valor } }

export function idioma() { return raiz.lang === "en" ? "en" : "es"; }
export function t(clave) { return TEXTOS[idioma()][clave]; }
export function alCambiar(f) { oyentes.push(f); }

export function aplicar() {
  const en = idioma() === "en";
  document.querySelectorAll("[data-en]").forEach((e) => {
    let g = guardados.get(e);
    if (!g) { g = { html: e.innerHTML, attrs: {} }; guardados.set(e, g); }
    const nuevo = en ? e.dataset.en : g.html;
    if (e.innerHTML !== nuevo) e.innerHTML = nuevo;
  });
  document.querySelectorAll("*").forEach((e) => {
    for (const nombre of e.getAttributeNames()) {
      if (!nombre.startsWith("data-en-")) continue;
      const attr = nombre.slice(8);
      let g = guardados.get(e);
      if (!g) { g = { html: null, attrs: {} }; guardados.set(e, g); }
      if (!(attr in g.attrs)) g.attrs[attr] = e.getAttribute(attr);
      e.setAttribute(attr, en ? e.getAttribute(nombre) : g.attrs[attr]);
    }
  });
  oyentes.forEach((f) => f());
}

// ES y EN son enlaces a la otra página; se recuerda la elección para la próxima visita.
document.querySelectorAll("[data-idioma]").forEach((a) => a.addEventListener("click", () => {
  try { localStorage.setItem("kirchi-idioma", a.dataset.idioma); } catch (e) {}
}));
aplicar();
