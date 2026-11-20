// «Qué haces con Kirchi»: consola de ocho teclas que se reproduce sola, sin scroll (patrón de pestañas APG).
// Avance: una barra de progreso en la tecla activa (animación CSS); al terminar, pasa a la siguiente. Imágenes 6 s, videos lo que duren
// (tope 14 s, la barra arranca cuando el video corre), Exportar 20 s (lo que tarda su carrusel en dar la vuelta).
// Da una vuelta y se detiene en la primera. La barra se pausa con el ratón encima, con el foco dentro, fuera de pantalla,
// con el botón de pausa y con la pausa global (html.pausado); un clic o una tecla la detienen del todo. Con movimiento reducido no arranca.
// Cada figura recibe «kirchi-fig» (activa, apilado) para que videos y carrusel sigan funcionando.
import "./video.js";
import "./carrusel.js";
import { t, alCambiar } from "./idioma.js";

const raiz = document.documentElement;
const REDUCIR = matchMedia("(prefers-reduced-motion: reduce)");
const ANGOSTO = matchMedia("(max-width: 959px)");
const IMAGEN = 6, TOPE_VIDEO = 14, CARRUSEL = 20.4;

document.querySelectorAll("[data-consola]").forEach((con) => {
  const lista = con.querySelector('[role="tablist"]');
  const tabs = [...lista.querySelectorAll('[role="tab"]')];
  const paneles = tabs.map((b) => document.getElementById(b.getAttribute("aria-controls")));
  const figs = paneles.map((p) => p.querySelector("figure"));
  const lecs = [...con.querySelectorAll(".cons-lec")];
  const lecturas = con.querySelector(".cons-lecturas");
  const pausa = con.querySelector(".cons-pausa");
  const sigue = con.querySelector(".cons-sigue");
  let actual = 0;
  let pedido = 0; // destino ya pedido: con View Transitions el cambio se aplica un momento después
  let corre = !REDUCIR.matches; // avance automático vivo (falso tras un clic, una tecla o la vuelta completa)
  let enPausa = false; // pausado con el botón, sin perder el avance
  let espera = null;

  function duracion(i) {
    const f = figs[i];
    if (f.hasAttribute("data-carrusel")) return CARRUSEL;
    return IMAGEN;
  }

  // Video: la barra espera a que el video corra y dura lo que le queda (tope 14 s). Si no arranca, se usa el tiempo de una imagen.
  function prepararVideo(i) {
    clearTimeout(espera);
    const v = figs[i].querySelector("video");
    if (!v) { con.classList.remove("carga"); return; }
    con.classList.add("carga");
    con.style.setProperty("--dur", TOPE_VIDEO + "s");
    const arrancar = () => {
      if (actual !== i) return;
      const total = Math.min(v.duration || TOPE_VIDEO, TOPE_VIDEO);
      const resto = total - (v.currentTime % (v.duration || Infinity));
      con.style.setProperty("--dur", Math.max(3, resto > 3 ? resto : total).toFixed(2) + "s");
      con.classList.remove("carga");
    };
    if (!v.paused && v.readyState >= 3) { arrancar(); return; }
    v.addEventListener("playing", arrancar, { once: true });
    const revisar = () => {
      if (actual !== i || !con.classList.contains("carga")) return;
      const quieto = raiz.classList.contains("pausado") || con.classList.contains("fuera");
      if (!quieto && (v.error || v.networkState === 3 || v.paused)) { con.style.setProperty("--dur", IMAGEN + "s"); con.classList.remove("carga"); return; }
      espera = setTimeout(revisar, 1000);
    };
    espera = setTimeout(revisar, 5000);
  }

  function pintar() {
    tabs.forEach((b, k) => {
      const si = k === actual;
      b.setAttribute("aria-selected", String(si));
      b.tabIndex = si ? 0 : -1;
    });
    paneles.forEach((p, k) => { p.classList.toggle("activo", k === actual); p.inert = k !== actual; });
    lecs.forEach((l, k) => l.classList.toggle("activa", k === actual));
    figs.forEach((f, k) => f.dispatchEvent(new CustomEvent("kirchi-fig", { detail: { activa: k === actual, apilado: false } })));
    con.style.setProperty("--cc-act", `var(--c${(tabs[actual].className.match(/k(\d)/) || [0, 1])[1]})`);
    pintarEstado();
  }

  function pintarEstado() {
    const vivo = corre && !enPausa;
    con.classList.toggle("corre", corre);
    con.classList.toggle("en-pausa", enPausa);
    pausa.setAttribute("aria-pressed", String(!vivo));
    pausa.setAttribute("aria-label", t(vivo ? "cons_pausar" : "cons_reanudar"));
    lecturas.setAttribute("aria-live", corre ? "off" : "polite");
    sigue.textContent = corre ? t("sigue") + tabs[(actual + 1) % tabs.length].querySelector(".cons-tit").textContent : "";
  }

  // Cambio de función: fundido corto con View Transitions si existe; si no, el fundido de opacidad del CSS. Sin transición con movimiento reducido o con la pausa global.
  function mostrar(i) {
    if (i === pedido) return;
    pedido = i;
    const cambiar = () => {
      actual = i;
      pintar();
      if (corre) {
        if (figs[actual].querySelector("video")) prepararVideo(actual);
        else { clearTimeout(espera); con.classList.remove("carga"); con.style.setProperty("--dur", duracion(actual) + "s"); }
      }
      if (ANGOSTO.matches) centrarTecla();
    };
    const quieto = REDUCIR.matches || raiz.classList.contains("pausado");
    if (!quieto && document.startViewTransition && !document.hidden) {
      raiz.classList.add("vt-consola");
      const vt = document.startViewTransition(cambiar);
      // Si otra tecla llega antes de que termine, la transición anterior se omite: no es un error.
      vt.ready.catch(() => {});
      vt.updateCallbackDone.catch(() => {});
      vt.finished.catch(() => {}).finally(() => raiz.classList.remove("vt-consola"));
    } else cambiar();
  }

  // En el teléfono las teclas van en una fila con desplazamiento propio: se lleva la activa a la vista sin mover la página.
  function centrarTecla() {
    const b = tabs[actual];
    const izq = b.offsetLeft - (lista.clientWidth - b.offsetWidth) / 2;
    lista.scrollTo({ left: Math.max(0, izq), behavior: REDUCIR.matches ? "auto" : "smooth" });
  }

  function detener() {
    if (!corre && !enPausa) return;
    corre = false; enPausa = false; clearTimeout(espera); con.classList.remove("carga");
    pintarEstado();
  }

  // Al terminar la barra de la tecla activa pasa a la siguiente; tras la última vuelve a la primera y se detiene.
  con.addEventListener("animationend", (e) => {
    if (e.animationName !== "cons-barra" || !corre) return;
    if (actual === tabs.length - 1) { corre = false; mostrar(0); pintarEstado(); }
    else mostrar(actual + 1);
  });

  tabs.forEach((b, k) => {
    b.addEventListener("click", () => { detener(); mostrar(k); });
    b.addEventListener("keydown", (e) => {
      const k0 = tabs.indexOf(e.currentTarget);
      const dest = { ArrowDown: k0 + 1, ArrowRight: k0 + 1, ArrowUp: k0 - 1, ArrowLeft: k0 - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (dest === undefined) return;
      e.preventDefault();
      detener();
      const i = (dest + tabs.length) % tabs.length;
      mostrar(i);
      tabs[i].focus();
    });
  });
  // Un clic dentro de la pantalla (ampliar, carrusel, video) también detiene el avance.
  paneles.forEach((p) => p.addEventListener("click", detener));
  pausa.addEventListener("click", () => {
    if (!corre) {
      corre = true; enPausa = false;
      pintarEstado();
      // Reanuda desde la función actual: la barra vuelve a empezar.
      con.classList.remove("corre"); void con.offsetWidth; con.classList.add("corre");
      if (figs[actual].querySelector("video")) prepararVideo(actual);
      else con.style.setProperty("--dur", duracion(actual) + "s");
    } else { enPausa = !enPausa; pintarEstado(); }
  });

  // Fuera de pantalla la barra no corre.
  con.classList.add("fuera");
  new IntersectionObserver((es) => { con.classList.toggle("fuera", !es[es.length - 1].isIntersecting); }, { threshold: 0.4 }).observe(con);

  const orientar = () => lista.setAttribute("aria-orientation", ANGOSTO.matches ? "horizontal" : "vertical");
  ANGOSTO.addEventListener("change", orientar);
  orientar();
  REDUCIR.addEventListener("change", () => { if (REDUCIR.matches) detener(); });
  alCambiar(pintarEstado);

  pintar();
  if (corre) prepararVideo(0);
});
