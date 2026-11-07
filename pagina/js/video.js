// Videos cortos dentro de la pantalla de instrumento: arrancan solo con su paso activo y a la vista, se detienen al salir y con la pausa global,
// quedan en el póster con movimiento reducido y, en «Sin animación», muestran el póster con un botón de reproducir.
// El video cambia de fuente (y de póster) con el idioma, sin perder el punto en que iba. Sin video, se queda el póster.
import { vigilar } from "./medios.js";
import { t, alCambiar } from "./idioma.js";

document.querySelectorAll("[data-video]").forEach((fig) => {
  const v = fig.querySelector("video");
  const boton = fig.querySelector(".video-play");
  let quiere = false, ultimoT = 0, est = { pausado: false, marcha: false, apilado: false };

  const pintar = () => {
    fig.classList.toggle("reproduciendo", !v.paused);
    boton.setAttribute("aria-label", t(v.paused ? "video_play" : "video_pausa"));
    boton.setAttribute("aria-pressed", String(!v.paused));
  };
  const reproducir = () => { quiere = true; v.play().catch(() => {}); };
  const detener = () => { quiere = false; v.pause(); };

  v.addEventListener("timeupdate", () => { ultimoT = v.currentTime; });
  v.addEventListener("play", pintar);
  v.addEventListener("pause", pintar);
  v.addEventListener("emptied", pintar);

  vigilar(fig, (e) => {
    est = e;
    if (e.pausado) detener();
    else if (e.marcha) reproducir();
    else if (!e.apilado) detener();
    // apilado («Sin animación» o pantalla angosta): solo con el botón
  });

  boton.addEventListener("click", () => { if (v.paused) reproducir(); else detener(); });

  // Cambio de idioma: la fuente nueva ya está puesta; si iba reproduciéndose, sigue desde el mismo punto.
  alCambiar(() => {
    pintar();
    if (quiere && !est.pausado) {
      const t0 = ultimoT;
      v.addEventListener("loadedmetadata", () => { try { v.currentTime = t0; } catch (e) {} }, { once: true });
      v.play().catch(() => {});
    }
  });
  pintar();
});
