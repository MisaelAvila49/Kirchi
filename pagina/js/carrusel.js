// Carrusel de «Exporta para tu reporte» (patrón APG): avanza solo cada 4 s mientras su paso está activo, con barra de progreso por lámina,
// rótulo del formato, «Sigue: …», botón de pausa dentro de la figura (además de la pausa global), pestañas con flechas, Home y End,
// y aria-live apagado mientras rota. Da una vuelta y para; un clic o una tecla lo detienen. El avance lo mueve una animación CSS,
// así que la pausa global y el movimiento reducido lo detienen sin código extra.
import { vigilar } from "./medios.js";
import { t, idioma, alCambiar } from "./idioma.js";

document.querySelectorAll("[data-carrusel]").forEach((fig) => {
  const car = fig.querySelector(".car");
  const tabs = [...car.querySelectorAll('[role="tab"]')];
  const laminas = [...car.querySelectorAll(".car-lamina")];
  const visor = car.querySelector(".car-visor");
  const rotulo = car.querySelector(".car-rotulo");
  const sigue = car.querySelector(".car-sigue");
  const pausa = car.querySelector(".car-pausa");
  let i = 0, parada = false;

  const etiqueta = (k) => tabs[k].dataset[idioma() === "en" ? "lblEn" : "lblEs"];
  function pintar() {
    tabs.forEach((b, k) => {
      b.setAttribute("aria-selected", String(k === i));
      b.tabIndex = k === i ? 0 : -1;
      b.classList.toggle("hecha", k < i);
    });
    laminas.forEach((l, k) => { l.classList.toggle("activa", k === i); l.setAttribute("aria-hidden", String(k !== i)); });
    rotulo.textContent = tabs[i].dataset.fmt;
    sigue.textContent = t("sigue") + etiqueta((i + 1) % tabs.length);
    pausa.setAttribute("aria-pressed", String(parada));
    pausa.setAttribute("aria-label", t(parada ? "car_reanudar" : "car_pausar"));
    visor.setAttribute("aria-live", parada ? "polite" : "off");
    car.classList.toggle("parada", parada);
  }
  function elegir(k, enfocar) {
    i = (k + tabs.length) % tabs.length;
    parada = true; // un clic o una tecla detienen el avance automático
    pintar();
    if (enfocar) tabs[i].focus();
  }

  tabs.forEach((b, k) => {
    b.addEventListener("click", () => elegir(k, false));
    b.addEventListener("keydown", (e) => {
      const k0 = tabs.indexOf(e.currentTarget);
      const tecla = { ArrowRight: k0 + 1, ArrowLeft: k0 - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (tecla === undefined) return;
      e.preventDefault();
      elegir(tecla, true);
    });
  });
  visor.addEventListener("click", () => { if (!parada) { parada = true; pintar(); } });
  pausa.addEventListener("click", () => { parada = !parada; pintar(); });

  // Al terminar la barra de la lámina activa, pasa a la siguiente; tras la última, vuelve a la primera y se detiene (una vuelta).
  car.addEventListener("animationend", (e) => {
    if (e.animationName !== "car-barra" || parada) return;
    if (i === tabs.length - 1) { i = 0; parada = true; } else { i += 1; }
    pintar();
  });

  vigilar(fig, (e) => { car.classList.toggle("corre", e.marcha); });
  alCambiar(pintar);
  pintar();
});
