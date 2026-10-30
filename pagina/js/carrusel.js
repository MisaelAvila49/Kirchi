// Pestañas que avanzan solas con barra de progreso (patrón APG de carrusel con pestañas).
// Reglas: pausa con el botón y al pasar el mouse; el foco del teclado o un clic detienen el
// avance para siempre; recorre un ciclo completo y se detiene; solo corre a la vista; sin
// avance con movimiento reducido. aria-live apagado mientras rota, cortés cuando se detiene.

const REDUCIR = matchMedia("(prefers-reduced-motion: reduce)");

export function carrusel(raiz, {pausaGlobal = () => false} = {}) {
  const tabs = [...raiz.querySelectorAll('[role="tab"]')];
  const paneles = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")));
  const boton = raiz.querySelector(".carrusel-pausa");
  const vivo = raiz.querySelector(".carrusel-paneles");
  const vertical = raiz.querySelector('[aria-orientation="vertical"]');
  const barrasVisor = [...raiz.querySelectorAll(".visor-barras span")];
  const siguiente = raiz.querySelector(".visor-siguiente");
  let i = 0, detenido = REDUCIR.matches, encima = false, visible = false, vueltas = 0;

  function sincronizar() {
    const corre = !detenido && !encima && visible && !pausaGlobal();
    raiz.dataset.estado = detenido ? "detenido" : corre ? "corre" : "pausa";
    if (siguiente && detenido) siguiente.textContent = "";
    vivo.setAttribute("aria-live", corre ? "off" : "polite");
    if (boton) {
      (boton.querySelector(".txt") || boton).textContent = detenido ? "Reanudar" : "Pausar";
      boton.setAttribute("aria-pressed", String(detenido));
    }
  }
  function elegir(n, enfocar) {
    i = (n + tabs.length) % tabs.length;
    tabs.forEach((t, k) => { const on = k === i; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; paneles[k].hidden = !on; });
    const barra = tabs[i].querySelector(".barra i");
    barra.style.animation = "none"; void barra.offsetWidth; barra.style.animation = "";
    // Visor de fotos: barras tipo historias y aviso de lo que sigue.
    barrasVisor.forEach((b, k) => {
      b.classList.toggle("hecha", k < i);
      b.classList.toggle("activa", k === i);
      const relleno = b.querySelector("i"); relleno.style.animation = "none"; void relleno.offsetWidth; relleno.style.animation = "";
    });
    if (siguiente) siguiente.textContent = i < tabs.length - 1 ? `Sigue: ${tabs[i + 1].textContent.trim()}` : "";
    if (enfocar) tabs[i].focus();
    sincronizar();
  }
  tabs.forEach((t, k) => {
    t.addEventListener("click", () => { detenido = true; elegir(k); });
    t.querySelector(".barra i").addEventListener("animationend", () => {
      if (k !== i || detenido) return;
      if (i === tabs.length - 1) { vueltas++; if (vueltas >= 1) { detenido = true; sincronizar(); return; } }
      elegir(i + 1);
    });
  });
  raiz.querySelector('[role="tablist"]').addEventListener("keydown", (e) => {
    const sig = vertical ? "ArrowDown" : "ArrowRight", ant = vertical ? "ArrowUp" : "ArrowLeft";
    const m = {[sig]: i + 1, [ant]: i - 1, Home: 0, End: tabs.length - 1}[e.key];
    if (m !== undefined) { e.preventDefault(); detenido = true; elegir(m, true); }
  });
  raiz.addEventListener("focusin", (e) => { if (e.target !== boton) { detenido = true; sincronizar(); } });
  raiz.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { encima = true; sincronizar(); } });
  raiz.addEventListener("pointerleave", () => { encima = false; sincronizar(); });
  if (boton) boton.addEventListener("click", () => { detenido = !detenido; if (!detenido) { vueltas = 0; elegir(i); } else sincronizar(); });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; sincronizar(); }, {threshold: 0.35}).observe(raiz);
  REDUCIR.addEventListener("change", () => { detenido = REDUCIR.matches; sincronizar(); });
  raiz.style.setProperty("--dur", raiz.dataset.duracion || "7s");
  elegir(0);
  return {sincronizar};
}
