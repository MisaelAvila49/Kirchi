// «Cómo ha crecido Kirchi»: recorrido horizontal de la 1.0 a la 3.2 dentro de un contenedor alto con un escenario pegajoso.
// El estado discreto (versión activa, aria-current, punto de la traza, «kirchi-fig» para los videos, paneles inert) sale siempre de
// centinelas con IntersectionObserver: uno por versión, cruzando una línea en el centro del escenario. Con eso la pista se mueve por
// pasos con una transición CSS. Donde hay animaciones dirigidas por scroll, relato.css liga además el desplazamiento continuo de la
// pista y el dibujo de la traza al scroll. Sin listeners de scroll y sin secuestrar el desplazamiento.
// «Sin animación», movimiento reducido y pantallas angostas: lista vertical apilada en orden cronológico.
import "./video.js";
import "./carrusel.js";

const raiz = document.documentElement;
const ANGOSTO = matchMedia("(max-width: 959px)");
const REDUCIR = matchMedia("(prefers-reduced-motion: reduce)");
const PASO = 0.6; // fracción del alto de la ventana que se recorre por versión (60vh, igual que en relato.css)
const ESPERA = 0.4; // tramo quieto al principio y al final (40vh, --espera en relato.css)

document.querySelectorAll(".recorrido").forEach((sec) => {
  const alto = sec.querySelector(".rec-alto");
  const cents = [...sec.querySelectorAll(".rec-cent")];
  const paneles = [...sec.querySelectorAll(".rec-panel")];
  const figs = paneles.map((p) => p.querySelector("figure"));
  const botones = [...sec.querySelectorAll(".rec-ver")];
  const anim = sec.querySelector("[data-anim]");
  const cab = document.querySelector(".cab");
  let actual = 0;
  let elegidoApilar = REDUCIR.matches;
  let apilado = null;

  function pintar() {
    sec.style.setProperty("--i", actual);
    sec.style.setProperty("--y-act", botones[actual].style.getPropertyValue("--y"));
    paneles.forEach((p, i) => {
      const si = i === actual;
      p.classList.toggle("activo", si);
      p.inert = !apilado && !si;
      if (si && !apilado) p.setAttribute("aria-current", "step"); else p.removeAttribute("aria-current");
    });
    botones.forEach((b, i) => { if (i === actual) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current"); });
    sec.dataset.serie = (paneles[actual].className.match(/k(\d)/) || [0, 1])[1];
    figs.forEach((f, i) => f.dispatchEvent(new CustomEvent("kirchi-fig", { detail: { activa: i === actual, apilado: !!apilado } })));
  }

  // Con la pista ligada al scroll (animaciones dirigidas por scroll), manda la POSICIÓN REAL de cada panel: una franja a todo su ancho
  // y una línea vertical en el centro del escenario. Así la versión activa, su brillo y el punto de la traza cambian justo cuando
  // un panel sale y el siguiente llega al centro, sin desfase con lo que se ve. Sin esa técnica la pista se mueve por pasos y manda
  // el centinela vertical (más abajo).
  const escena = sec.querySelector(".rec-escena");
  const centros = paneles.map((p) => { const i = document.createElement("i"); i.className = "rec-centro"; i.setAttribute("aria-hidden", "true"); p.append(i); return i; });
  const continuo = () => CSS.supports("animation-timeline: view()") && !REDUCIR.matches;

  // Línea de lectura: centro del escenario (espacio visible bajo la cabecera). El centinela que la cruza manda.
  let io = null;
  function armar() {
    if (io) io.disconnect();
    if (continuo() && escena) {
      io = new IntersectionObserver((es) => {
        es.forEach((e) => { if (e.isIntersecting) { const i = centros.indexOf(e.target); if (i !== actual) { actual = i; pintar(); } } });
      }, { root: escena, rootMargin: "0px -49.5% 0px -49.5%" });
      centros.forEach((x) => io.observe(x));
      return;
    }
    const c = cab ? cab.offsetHeight : 0;
    const L = c + (innerHeight - c) / 2;
    io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { const i = cents.indexOf(e.target); if (i !== actual) { actual = i; pintar(); } } });
    }, { rootMargin: `-${Math.round(L - 1)}px 0px -${Math.round(innerHeight - L - 1)}px 0px` });
    cents.forEach((x) => io.observe(x));
  }

  function apilar(si) {
    if (si === apilado) return;
    apilado = si;
    sec.classList.toggle("apilado", si);
    pintar();
  }
  const debeApilar = () => elegidoApilar || ANGOSTO.matches;

  // Un botón de versión lleva el scroll al punto en que esa versión queda centrada en el escenario.
  function ir(i, suave = true) {
    const c = cab ? cab.offsetHeight : 0;
    const top = alto.getBoundingClientRect().top + scrollY - c + (i < 0 ? 0 : (ESPERA + i * PASO) * innerHeight);
    scrollTo({ top: Math.round(top), behavior: suave && !REDUCIR.matches ? "smooth" : "auto" });
  }
  botones.forEach((b, i) => b.addEventListener("click", () => ir(i)));
  // El enlace Versiones de la barra (y kirchi.app/versiones) lleva al inicio del escenario pegado (la 1.0 quieta al centro),
  // no al título de la sección, para que el primer giro de la rueda no empiece ya a mover la pista. js/rutas.js avisa con kirchi:ir.
  addEventListener("kirchi:ir", (e) => {
    if (e.detail.id !== sec.id || apilado) return;
    e.preventDefault();
    ir(-1, e.detail.suave);
  });

  if (anim) {
    anim.setAttribute("aria-pressed", String(elegidoApilar));
    anim.addEventListener("click", () => {
      elegidoApilar = !elegidoApilar;
      anim.setAttribute("aria-pressed", String(elegidoApilar));
      const i = actual;
      apilar(debeApilar());
      // El alto cambia: se vuelve a la versión que se estaba viendo.
      requestAnimationFrame(() => {
        if (apilado) paneles[i].scrollIntoView({ behavior: "auto", block: "start" });
        else ir(i);
      });
    });
  }
  ANGOSTO.addEventListener("change", () => apilar(debeApilar()));
  addEventListener("resize", armar);
  if (cab) new ResizeObserver(armar).observe(cab);
  armar();
  apilar(debeApilar());
  pintar();
});
