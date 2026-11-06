// Tráiler de YouTube de fachada: miniatura local y botón. El iframe de youtube-nocookie se inserta
// solo al pulsar; antes del clic la página no hace ninguna petición a YouTube. El video cambia con el idioma.
import { idioma, alCambiar } from "./idioma.js";

const IDS = { es: "OSJBYb792Fo", en: "UEJBj35t4yg" };
const TITULOS = { es: "Tráiler de Kirchi", en: "Kirchi trailer" };
const figura = document.getElementById("trailer");
const boton = document.getElementById("trailer-jugar");
let marco = null, idiomaCargado = null;

function quitar() {
  if (marco) { marco.remove(); marco = null; }
  idiomaCargado = null;
  figura.classList.remove("reproduciendo");
}
function poner() {
  const l = idioma();
  marco = document.createElement("iframe");
  marco.src = `https://www.youtube-nocookie.com/embed/${IDS[l]}?autoplay=1&rel=0`;
  marco.title = TITULOS[l];
  marco.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  marco.allowFullscreen = true;
  marco.referrerPolicy = "strict-origin-when-cross-origin";
  figura.append(marco);
  figura.classList.add("reproduciendo");
  idiomaCargado = l;
}
if (figura && boton) {
  // El botón es un enlace a YouTube: sin JavaScript (o abierta desde el disco, donde los módulos no corren)
  // abre el video allá; con JavaScript se queda en la página y lo reproduce aquí.
  boton.addEventListener("click", (e) => { e.preventDefault(); poner(); });
  boton.addEventListener("keydown", (e) => { if (e.key === " ") { e.preventDefault(); poner(); } });
  // Al cambiar de idioma con el video cargado, vuelve la fachada del otro idioma.
  alCambiar(() => { if (marco && idiomaCargado !== idioma()) quitar(); });
}
