// Kirchi, página de descarga: selector de sistema, enlaces directos a los instaladores,
// barra fija en el celular, ampliar capturas y tráiler de fachada. Sin listeners de scroll.
import { t, alCambiar } from "./idioma.js";
import "./trailer.js";

const CFG = window.KIRCHI;
const RELEASES = `https://github.com/${CFG.REPO}/releases/latest`;
const REDUCIR = matchMedia("(prefers-reduced-motion: reduce)").matches;
const raiz = document.documentElement;
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* Versión: un solo lugar (config.js). Cambiar de idioma reescribe los textos, así que se vuelve a poner. */
let versionRelease = CFG.VERSION;
function pintarVersion() {
  $$("[data-version]").forEach((e) => { e.textContent = CFG.VERSION; });
  $$("[data-version-release]").forEach((e) => { e.textContent = versionRelease; });
}

/* Pausa global del movimiento (WCAG 2.2.2): onda y trazas de la portada, figura animada y transiciones. Con movimiento reducido arranca pausado. */
let pausaGlobal = REDUCIR;
const botonMov = document.getElementById("boton-movimiento");
function pintarPausa() {
  botonMov.setAttribute("aria-pressed", String(pausaGlobal));
  botonMov.setAttribute("aria-label", pausaGlobal ? t("reanudar_mov") : t("pausar_mov"));
  raiz.classList.toggle("pausado", pausaGlobal);
  document.dispatchEvent(new Event("kirchi-pausa"));
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
  $$("[data-os]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.os === sistema)));
}
/* Una sola elección de sistema para la portada y para «Descargar»: un estado (sistema) y un evento. */
document.addEventListener("kirchi-sistema", pintarSistema);
$$("[data-os]").forEach((b) => b.addEventListener("click", () => {
  sistema = b.dataset.os;
  document.dispatchEvent(new CustomEvent("kirchi-sistema", { detail: sistema }));
}));

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

function todo() { pintarVersion(); pintarPausa(); pintarSistema(); $$(".ampliar").forEach((b) => b.setAttribute("aria-label", t("ampliar"))); }
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

/* Ampliar una captura: capa propia (no <dialog>) que cierra con el botón visible, con Esc y con un clic fuera de la imagen. */
const lupa = document.getElementById("lupa"), lupaImg = document.getElementById("lupa-img"), lupaCuerpo = document.getElementById("lupa-cuerpo");
const lupaCerrar = document.getElementById("lupa-cerrar");
let origen = null;
function cerrarLupa() {
  if (lupa.hidden) return;
  lupa.hidden = true; lupaImg.removeAttribute("src"); raiz.classList.remove("lupa-abierta");
  lupaVideo.pause(); lupaVideo.removeAttribute("src"); lupaVideo.load();
  if (origen) origen.focus();
}
// Los videos cortos también se amplían: un <video> propio de la lupa, en bucle y sin sonido. Con la pausa global o con movimiento
// reducido no arranca solo y muestra sus controles.
const lupaVideo = document.createElement("video");
lupaVideo.id = "lupa-video"; lupaVideo.muted = true; lupaVideo.loop = true; lupaVideo.playsInline = true; lupaVideo.hidden = true;
lupaCuerpo.append(lupaVideo);
function abrirLupa(img, boton) {
  if (!img) return;
  const esVideo = img.tagName === "VIDEO";
  lupaImg.hidden = esVideo; lupaVideo.hidden = !esVideo;
  if (esVideo) {
    const quieto = raiz.classList.contains("pausado") || matchMedia("(prefers-reduced-motion: reduce)").matches;
    lupaVideo.src = img.currentSrc || img.src; lupaVideo.poster = img.poster || "";
    lupaVideo.setAttribute("aria-label", img.getAttribute("aria-label") || "");
    lupaVideo.controls = quieto;
    if (!quieto) lupaVideo.play().catch(() => { lupaVideo.controls = true; });
    origen = boton; lupa.hidden = false; raiz.classList.add("lupa-abierta"); lupaCerrar.focus();
    return;
  }
  origen = boton; lupaImg.src = img.currentSrc || img.src; lupaImg.alt = img.alt;
  lupa.hidden = false; raiz.classList.add("lupa-abierta");
  lupaCuerpo.scrollTop = 0; lupaCuerpo.scrollLeft = (lupaCuerpo.scrollWidth - lupaCuerpo.clientWidth) / 2;
  lupaCerrar.focus();
}
// Captura sola: el botón envuelve la imagen.
$$(".pant-cuerpo > img").forEach((img) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "ampliar";
  b.setAttribute("aria-label", t("ampliar"));
  img.replaceWith(b); b.append(img);
  b.addEventListener("click", () => abrirLupa(img, b));
});
// Varias capturas en el mismo marco (novedades con acercamiento y láminas del carrusel de exportar): un botón encima de todo el
// marco abre la que se está viendo, completa y sin el acercamiento.
[[".zoom-capa", ".cuadro.activo, .cuadro"], [".car-visor", ".car-lamina.activa, .car-lamina"], [".video-fig", "video"]].forEach(([marco, cual]) => {
  $$(marco).forEach((m) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "ampliar-capa";
    b.setAttribute("aria-label", t("ampliar"));
    (m.classList.contains("zoom-capa") ? m.parentElement : m).append(b);
    b.addEventListener("click", () => abrirLupa(m.querySelector(cual), b));
  });
});
lupaCerrar.addEventListener("click", cerrarLupa);
// Un clic en cualquier parte cierra la lupa, también sobre la imagen; arrastrar para recorrerla no la cierra.
let lupaX = 0, lupaY = 0;
lupa.addEventListener("pointerdown", (e) => { lupaX = e.clientX; lupaY = e.clientY; });
lupa.addEventListener("click", (e) => { if (e.target === lupaCerrar || (e.target === lupaVideo && lupaVideo.controls)) return; if (Math.hypot(e.clientX - lupaX, e.clientY - lupaY) < 6) cerrarLupa(); });
document.addEventListener("keydown", (e) => {
  if (lupa.hidden) return;
  if (e.key === "Escape") { e.preventDefault(); cerrarLupa(); }
  else if (e.key === "Tab") { e.preventDefault(); lupaCerrar.focus(); }
});
