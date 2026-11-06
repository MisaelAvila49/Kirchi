// Kirchi, página de descarga: tema, pausa global, selector de sistema, enlaces directos a los instaladores,
// barra fija en el celular, ampliar capturas y tráiler de fachada. Sin listeners de scroll.
import { t, alCambiar } from "./idioma.js";
import "./trailer.js";

const CFG = window.KIRCHI;
const REDUCIR = matchMedia("(prefers-reduced-motion: reduce)").matches;
const RELEASES = `https://github.com/${CFG.REPO}/releases/latest`;
const raiz = document.documentElement;
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* Versión: un solo lugar (config.js). Cambiar de idioma reescribe los textos, así que se vuelve a poner. */
let versionRelease = CFG.VERSION;
function pintarVersion() {
  $$("[data-version]").forEach((e) => { e.textContent = CFG.VERSION; });
  $$("[data-version-release]").forEach((e) => { e.textContent = versionRelease; });
}

/* Tema claro y oscuro */
const botonTema = document.getElementById("boton-tema");
function pintarTema() {
  const claro = raiz.dataset.tema === "claro";
  botonTema.textContent = claro ? t("tema_oscuro") : t("tema_claro");
  botonTema.setAttribute("aria-pressed", String(claro));
}
botonTema.addEventListener("click", () => {
  raiz.dataset.tema = raiz.dataset.tema === "claro" ? "oscuro" : "claro";
  try { localStorage.setItem("kirchi-tema", raiz.dataset.tema); } catch (e) {}
  pintarTema();
});

/* Pausa global del movimiento (WCAG 2.2.2): trazas de la portada y onda del osciloscopio */
let pausaGlobal = REDUCIR;
const botonMov = document.getElementById("boton-movimiento");
function pintarPausa() {
  botonMov.setAttribute("aria-pressed", String(pausaGlobal));
  botonMov.textContent = pausaGlobal ? t("reanudar_mov") : t("pausar_mov");
  raiz.classList.toggle("pausado", pausaGlobal);
}
botonMov.addEventListener("click", () => { pausaGlobal = !pausaGlobal; pintarPausa(); });

/* Sistema: detectado por el navegador y elegible en el panel de la portada */
const NOMBRE = { windows: "Windows", macos: "macOS", linux: "Linux" };
const SUFIJO = { macos: "-macOS.dmg", linux: "-Linux.AppImage" };
const ua = `${(navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ""} ${navigator.userAgent}`;
let sistema = /Mac/i.test(ua) && !/iPhone|iPad/i.test(ua) ? "macos" : /Linux|X11/i.test(ua) && !/Android/i.test(ua) ? "linux" : "windows";
const tiendaLista = !/^\[/.test(CFG.TIENDA);
let assets = [];
function enlace(so) {
  if (so === "windows") return tiendaLista ? CFG.TIENDA : RELEASES;
  const f = assets.find((a) => a.name.endsWith(SUFIJO[so]));
  return f ? f.browser_download_url : RELEASES;
}
function pintarSistema() {
  $$(".js-dl").forEach((a) => {
    a.href = enlace(sistema);
    const l = a.querySelector(".js-dl-txt"); if (l) l.textContent = t("para") + NOMBRE[sistema];
  });
  $$(".js-dl-dato").forEach((e) => { e.textContent = `${t("version")}${CFG.VERSION} · ${t("os_" + sistema)}`; });
  $$(".js-otros").forEach((c) => {
    c.replaceChildren();
    const s = document.createElement("span"); s.textContent = t("tambien"); c.append(s);
    Object.keys(NOMBRE).filter((o) => o !== sistema).forEach((o) => {
      const a = document.createElement("a"); a.href = enlace(o); a.textContent = NOMBRE[o]; c.append(a);
    });
  });
  $$("[data-os-actual]").forEach((e) => e.classList.toggle("actual", e.dataset.osActual === sistema));
  $$(".canal-os").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.os === sistema)));
}
$$(".canal-os").forEach((b) => b.addEventListener("click", () => { sistema = b.dataset.os; pintarSistema(); }));

/* Enlaces directos a cada instalador desde la API pública de GitHub, con respaldo a la página de versiones */
const botonTienda = document.querySelector("[data-tienda]");
if (botonTienda) {
  if (tiendaLista) botonTienda.href = CFG.TIENDA;
  else botonTienda.dataset.pendiente = "true";
}
function ponerEnlaces() {
  $$("[data-sufijo]").forEach((a) => { const f = assets.find((x) => x.name.endsWith(a.dataset.sufijo)); if (f) a.href = f.browser_download_url; });
  pintarSistema();
}

function todo() { pintarVersion(); pintarTema(); pintarPausa(); pintarSistema(); $$(".ampliar").forEach((b) => b.setAttribute("aria-label", t("ampliar"))); }
todo();
alCambiar(todo);

fetch(`https://api.github.com/repos/${CFG.REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } })
  .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
  .then((j) => {
    assets = j.assets || []; ponerEnlaces();
    // El título de descargas muestra la versión que de verdad se baja.
    if (j.tag_name) { versionRelease = j.tag_name.replace(/^v/, ""); pintarVersion(); }
  })
  .catch(() => { /* sin red o sin límite de la API: los enlaces quedan en la página de versiones */ });

/* Barra fija en el celular al salir de la portada */
const fija = document.getElementById("cta-fija");
let enPortada = true, enDescargas = false;
const actualizarFija = () => { fija.hidden = enPortada || enDescargas; };
new IntersectionObserver(([e]) => { enPortada = e.isIntersecting || e.boundingClientRect.top > 0; actualizarFija(); }).observe(document.getElementById("inicio"));
new IntersectionObserver(([e]) => { enDescargas = e.isIntersecting; actualizarFija(); }).observe(document.getElementById("descargas"));

/* Ampliar una captura: botón sobre cada imagen, diálogo a pantalla completa con Cerrar y Esc */
const lupa = document.getElementById("lupa"), lupaImg = document.getElementById("lupa-img");
let origen = null;
$$(".pant-cuerpo > img").forEach((img) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "ampliar";
  b.setAttribute("aria-label", t("ampliar"));
  img.replaceWith(b); b.append(img);
  b.addEventListener("click", () => {
    origen = b; lupaImg.src = img.currentSrc || img.src; lupaImg.alt = img.alt;
    lupa.showModal();
    const cu = lupa.querySelector(".lupa-cuerpo"); cu.scrollTop = 0; cu.scrollLeft = (cu.scrollWidth - cu.clientWidth) / 2;
  });
});
document.getElementById("lupa-cerrar").addEventListener("click", () => lupa.close());
lupa.addEventListener("click", (e) => { if (e.target === lupa) lupa.close(); });
lupa.addEventListener("close", () => { lupaImg.removeAttribute("src"); if (origen) origen.focus(); });
