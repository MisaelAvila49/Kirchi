// Kirchi, página de descarga: tema, pausa global, titular cinético, carrusel, detección del sistema,
// enlaces directos a los instaladores y CTA fija en móvil. Sin listeners de scroll.
import { carrusel } from "./carrusel.js";

const CFG = window.KIRCHI;
const REDUCIR = matchMedia("(prefers-reduced-motion: reduce)").matches;
const RELEASES = `https://github.com/${CFG.REPO}/releases/latest`;
const raiz = document.documentElement;

/* Versión: un solo lugar (config.js) */
document.querySelectorAll("[data-version], [data-version-release]").forEach((e) => { e.textContent = CFG.VERSION; });

/* Tema claro y oscuro */
const botonTema = document.getElementById("boton-tema");
function pintarTema() {
  const claro = raiz.dataset.tema === "claro";
  botonTema.textContent = claro ? "Tema oscuro" : "Tema claro";
  botonTema.setAttribute("aria-pressed", String(claro));
}
botonTema.addEventListener("click", () => {
  raiz.dataset.tema = raiz.dataset.tema === "claro" ? "oscuro" : "claro";
  try { localStorage.setItem("kirchi-tema", raiz.dataset.tema); } catch (e) {}
  pintarTema();
});
pintarTema();

/* Pausa global del movimiento (WCAG 2.2.2) */
let pausaGlobal = REDUCIR;
const botonMov = document.getElementById("boton-movimiento");
const oyentesPausa = [];
function pintarPausa() {
  botonMov.setAttribute("aria-pressed", String(pausaGlobal));
  botonMov.textContent = pausaGlobal ? "Reanudar movimiento" : "Pausar movimiento";
  raiz.classList.toggle("pausado", pausaGlobal);
}
botonMov.addEventListener("click", () => { pausaGlobal = !pausaGlobal; pintarPausa(); oyentesPausa.forEach((f) => f()); });
pintarPausa();

/* Titular cinético, una sola vez al cargar */
if (window.gsap && window.SplitText) {
  const mm = gsap.matchMedia();
  mm.add({ mov: "(prefers-reduced-motion: no-preference)", quieto: "(prefers-reduced-motion: reduce)" }, (ctx) => {
    gsap.set(".hero-titulo", { visibility: "visible" });
    if (ctx.conditions.quieto) return;
    SplitText.create(".hero-titulo", {
      type: "lines", mask: "lines", autoSplit: true, aria: "auto",
      onSplit: (s) => gsap.from(s.lines, { yPercent: 110, duration: 1, ease: "expo.out", stagger: 0.12, delay: 0.1 }),
    });
    gsap.from([".hero-entrada", ".hero-acciones", ".hero-datos"], { y: 16, opacity: 0, duration: 0.8, ease: "power3.out", stagger: 0.08, delay: 0.5 });
  });
} else {
  document.querySelectorAll(".hero-titulo").forEach((e) => { e.style.visibility = "visible"; });
}

/* Carrusel */
const carr = [...document.querySelectorAll(".carrusel")].map((c) => carrusel(c, { pausaGlobal: () => pausaGlobal }));
oyentesPausa.push(() => carr.forEach((c) => c.sincronizar()));

const tiendaLista = !/^\[/.test(CFG.TIENDA);

/* Enlaces directos desde la API pública de GitHub, con respaldo a la página de versiones */
const enlaces = [...document.querySelectorAll("[data-sufijo]")];
const botonTienda = document.querySelector("[data-tienda]");
if (botonTienda) {
  if (tiendaLista) botonTienda.href = CFG.TIENDA;
  else botonTienda.dataset.pendiente = "true";
}
let assets = [];
function buscar(sufijo) { return assets.find((a) => a.name.endsWith(sufijo)); }
function ponerEnlaces() {
  enlaces.forEach((a) => { const f = buscar(a.dataset.sufijo); if (f) a.href = f.browser_download_url; });
}
fetch(`https://api.github.com/repos/${CFG.REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } })
  .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
  .then((j) => { assets = j.assets || []; ponerEnlaces();
    // El título de descargas muestra la versión que de verdad se baja.
    if (j.tag_name) document.querySelectorAll("[data-version-release]").forEach((e) => { e.textContent = j.tag_name.replace(/^v/, ""); }); })
  .catch(() => { /* sin red o sin límite de la API: los enlaces quedan en la página de versiones */ });

/* CTA fija en móvil al salir de la portada */
const fija = document.getElementById("cta-fija");
let enPortada = true, enDescargas = false;
const actualizarFija = () => { fija.hidden = enPortada || enDescargas; };
new IntersectionObserver(([e]) => { enPortada = e.isIntersecting || e.boundingClientRect.top > 0; actualizarFija(); }).observe(document.getElementById("inicio"));
new IntersectionObserver(([e]) => { enDescargas = e.isIntersecting; actualizarFija(); }).observe(document.getElementById("descargas"));

/* Ampliar una captura: botón sobre cada imagen, diálogo a pantalla completa con Cerrar y Esc */
const lupa = document.getElementById("lupa"), lupaImg = document.getElementById("lupa-img");
let origen = null;
document.querySelectorAll(".panel-c img, .portada-figura img").forEach((img) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "ampliar " + (img.classList.contains("solo-claro") ? "solo-claro" : "solo-oscuro");
  b.setAttribute("aria-label", "Ampliar la captura");
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
