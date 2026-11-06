// Selector ES/EN. El español vive en el HTML; el inglés, en atributos data-en (contenido) y
// data-en-<atributo> (alt, aria-label, content). Los textos que pone el JS salen de TEXTOS.
const TEXTOS = {
  es: { tema_claro: "Tema claro", tema_oscuro: "Tema oscuro", pausar_mov: "Pausar movimiento", reanudar_mov: "Reanudar movimiento",
        pausar: "Pausar", reanudar: "Reanudar", sigue: "Sigue:", ampliar: "Ampliar la captura" },
  en: { tema_claro: "Light theme", tema_oscuro: "Dark theme", pausar_mov: "Pause motion", reanudar_mov: "Resume motion",
        pausar: "Pause", reanudar: "Resume", sigue: "Next:", ampliar: "Enlarge the screenshot" },
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
  document.querySelectorAll("[data-idioma]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.idioma === idioma())));
  oyentes.forEach((f) => f());
}

function elegir(l) {
  raiz.lang = l;
  try { localStorage.setItem("kirchi-idioma", l); } catch (e) {}
  aplicar();
}
document.querySelectorAll("[data-idioma]").forEach((b) => b.addEventListener("click", () => elegir(b.dataset.idioma)));
aplicar();
