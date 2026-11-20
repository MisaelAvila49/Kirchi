// Historias de la página (scrollytelling): figura pegajosa que cambia por paso.
// El paso activo es el que tiene su BLOQUE DE TEXTO (título y párrafo, no el contenedor alto del paso) en el centro de la pantalla:
// un IntersectionObserver vigila un punto en el centro de cada bloque y una franja alrededor de la línea de lectura: el centro del espacio visible bajo la cabecera,
// a unos 30 px del centro de la pantalla.
// Sin listeners de scroll y sin secuestrar el desplazamiento.
// «Sin animación» pone cada figura debajo del texto de su paso, en el flujo normal; en pantallas angostas va siempre así.
import "./video.js";
import "./carrusel.js";

const raiz = document.documentElement;
const ANGOSTO = matchMedia("(max-width: 959px)");
const REDUCIR = matchMedia("(prefers-reduced-motion: reduce)");
const BANDA = 28; // media franja, en px, alrededor de la línea de lectura

// Alto de la barra de arriba y de cada barra de controles: las demás piezas pegajosas cuelgan de estas medidas.
const cab = document.querySelector(".cab");
const alCabecera = [];
if (cab) new ResizeObserver(() => { raiz.style.setProperty("--cab-h", cab.offsetHeight + "px"); alCabecera.forEach((f) => f()); }).observe(cab);
// Línea de lectura: centro del espacio visible bajo la cabecera (a donde llegan los botones).
const linea = () => ((cab ? cab.offsetHeight : 0) + innerHeight) / 2;

function historia(sec) {
  const pasos = [...sec.querySelectorAll(".paso")];
  const figs = [...sec.querySelectorAll(".esc-fig")];
  const lienzo = sec.querySelector(".esc-lienzo");
  const estado = sec.querySelector("[data-estado]");
  const prev = sec.querySelector("[data-prev]");
  const next = sec.querySelector("[data-next]");
  const anim = sec.querySelector("[data-anim]");
  const ctl = sec.querySelector(".ctl");
  const canales = [...sec.querySelectorAll("[data-ir]")];
  const textos = pasos.map((p) => p.querySelector(".paso-txt"));
  let actual = 0;
  let bloqueo = null; // paso al que se va con un botón: se ignora el observador hasta llegar
  let elegidoApilar = REDUCIR.matches;
  let apilado = null;

  if (ctl) new ResizeObserver(() => sec.style.setProperty("--ctl-h", ctl.offsetHeight + "px")).observe(ctl);

  // Punto en el centro de cada bloque de texto: cuando entra a la franja, ese paso pasa a ser el activo.
  const puntos = textos.map((t) => { const i = document.createElement("i"); i.className = "punto-centro"; i.setAttribute("aria-hidden", "true"); t.append(i); return i; });
  let ioBanda = null;
  function armarBanda() {
    if (ioBanda) ioBanda.disconnect();
    const L = linea();
    const arriba = Math.max(0, Math.round(L - BANDA)), abajo = Math.max(0, Math.round(innerHeight - L - BANDA));
    ioBanda = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) entrar(puntos.indexOf(e.target)); });
    }, { rootMargin: `-${arriba}px 0px -${abajo}px 0px` });
    puntos.forEach((p) => ioBanda.observe(p));
  }
  function entrar(i) {
    if (bloqueo !== null) { if (i !== bloqueo) return; bloqueo = null; }
    if (i !== actual) { actual = i; pintar(); }
  }

  const debeApilar = () => elegidoApilar || ANGOSTO.matches;

  function apilar(si) {
    if (si === apilado) return;
    apilado = si;
    sec.classList.toggle("apilado", si);
    figs.forEach((f, i) => {
      (si ? pasos[i].querySelector(".paso-slot") : lienzo).append(f);
      f.removeAttribute("aria-hidden");
    });
    pintar();
  }

  function pintar() {
    pasos.forEach((p, i) => {
      p.classList.toggle("activo", i === actual);
      if (i === actual) p.setAttribute("aria-current", "step"); else p.removeAttribute("aria-current");
    });
    figs.forEach((f, i) => {
      f.classList.toggle("activa", i === actual);
      if (apilado) f.removeAttribute("aria-hidden"); else f.setAttribute("aria-hidden", String(i !== actual));
    });
    figs.forEach((f, i) => f.dispatchEvent(new CustomEvent("kirchi-fig", { detail: { activa: i === actual, apilado: !!apilado } })));
    canales.forEach((c, i) => { if (i === actual) c.setAttribute("aria-current", "step"); else c.removeAttribute("aria-current"); });
    // El nombre del paso sale del botón de su canal, que ya viene traducido; data-etq queda de respaldo.
    if (estado) estado.textContent = `${(canales[actual] && canales[actual].textContent.trim()) || pasos[actual].dataset.etq} · ${actual + 1} / ${pasos.length}`;
    if (prev) prev.disabled = actual === 0;
    if (next) next.disabled = actual === pasos.length - 1;
    // Lado de la tarjeta del paso activo: la pantalla se va al lado contrario (relato.css).
    if (pasos[actual].dataset.lado) sec.dataset.lado = pasos[actual].dataset.lado;
    enfocar();
  }

  // Acercamiento de cada figura a la parte de la captura que cuenta su paso (data-foco = centro x, centro y, escala).
  // El punto enfocado se lleva al lado contrario de la tarjeta, sin dejar ver el borde de la captura.
  // El marco ocupa todo el escenario y la captura lo cubre a lo ancho: lo que sobra arriba y abajo se recorta.
  // Apilado («Sin animación» o teléfono): cada figura es su propio marco y el acercamiento queda fijo y centrado.
  function enfocar() {
    if (!lienzo) return;
    figs.forEach((f, i) => {
      const capa = f.querySelector(".zoom-capa");
      if (!capa || !pasos[i].dataset.foco) return;
      const marco = apilado ? f.querySelector(".pant-cuerpo") : lienzo;
      const W = marco.clientWidth, H = marco.clientHeight;
      if (!W || !H) return;
      const [fx, fy, s] = pasos[i].dataset.foco.split(" ").map(Number);
      const cw = capa.offsetWidth, ch = capa.offsetHeight;
      const tx = 0.5; // la tarjeta va al lado de la pantalla, no encima
      const lim = (v, marco, tam) => Math.min(0, Math.max(marco - s * tam, v));
      capa.style.setProperty("--zx", lim(tx * W - fx * s * cw, W, cw).toFixed(1) + "px");
      capa.style.setProperty("--zy", lim(0.5 * H - fy * s * ch, H, ch).toFixed(1) + "px");
      capa.style.setProperty("--zs", String(s));
    });
  }
  if (lienzo && sec.querySelector(".zoom-capa")) {
    const ro = new ResizeObserver(() => enfocar());
    ro.observe(lienzo);
    figs.forEach((f) => ro.observe(f.querySelector(".pant-cuerpo")));
  }

  // Figuras con varios cuadros (cables uno por uno, redes bajo el ratón): avanzan cada 1.6 s solo con el paso activo a la vista,
  // sin «Sin animación», sin la pausa global y sin movimiento reducido.
  let aLaVista = false;
  new IntersectionObserver((es) => { aLaVista = es[0].isIntersecting; }).observe(sec);
  setInterval(() => {
    if (!aLaVista || apilado || REDUCIR.matches || raiz.classList.contains("pausado")) return;
    const f = figs[actual];
    if (!f || !f.hasAttribute("data-cuadros")) return;
    const cs = [...f.querySelectorAll(".cuadro")];
    const k = cs.findIndex((c) => c.classList.contains("activo"));
    cs.forEach((c, j) => c.classList.toggle("activo", j === (k + 1) % cs.length));
  }, 1600);

  // Respaldo para saltos de scroll que se salten la franja: si el paso activo quedó a más de un paso de distancia, manda el bloque más cercano al centro.
  function centros() { return textos.map((t) => { const r = t.getBoundingClientRect(); return (r.top + r.bottom) / 2; }); }
  function repara() {
    if (bloqueo !== null) return;
    const vc = linea(), c = centros();
    let k = 0;
    c.forEach((x, i) => { if (Math.abs(x - vc) < Math.abs(c[k] - vc)) k = i; });
    const paso = pasos[0].offsetHeight || 1;
    if (Math.abs(c[k] - vc) <= BANDA || Math.abs(c[actual] - vc) > paso * 0.9) entrar(k);
  }

  function ir(i, desplazar) {
    actual = Math.max(0, Math.min(pasos.length - 1, i));
    pintar();
    if (desplazar) {
      bloqueo = actual;
      setTimeout(() => { bloqueo = null; }, REDUCIR.matches ? 150 : 1400);
      textos[actual].scrollIntoView({ behavior: REDUCIR.matches ? "auto" : "smooth", block: "center" });
    }
  }

  armarBanda();
  addEventListener("resize", armarBanda);
  const io = new IntersectionObserver(repara, { rootMargin: "-45% 0px -45% 0px" });
  pasos.forEach((p) => io.observe(p));

  prev && prev.addEventListener("click", () => ir(actual - 1, true));
  next && next.addEventListener("click", () => ir(actual + 1, true));
  canales.forEach((c, i) => c.addEventListener("click", () => ir(i, true)));
  if (anim) {
    anim.setAttribute("aria-pressed", String(elegidoApilar));
    anim.addEventListener("click", () => {
      elegidoApilar = !elegidoApilar;
      anim.setAttribute("aria-pressed", String(elegidoApilar));
      apilar(debeApilar());
      // El diseño cambia de alto: se regresa al paso activo para no perder el lugar.
      requestAnimationFrame(() => { bloqueo = actual; textos[actual].scrollIntoView({ behavior: "auto", block: "center" }); setTimeout(() => { bloqueo = null; }, 150); });
    });
  }
  ANGOSTO.addEventListener("change", () => { apilar(debeApilar()); repara(); });
  apilar(debeApilar());
  // Al cargar: el bloque más cercano al centro (el primero, si la página está arriba).
  alCabecera.push(armarBanda);
  { const vc = linea(), c = centros(); actual = c.reduce((k, x, i) => (Math.abs(x - vc) < Math.abs(c[k] - vc) ? i : k), 0); }
  pintar();
}

document.querySelectorAll("[data-historia]").forEach(historia);
