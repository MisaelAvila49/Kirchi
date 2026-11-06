// Página de apoyo: tema y los botones de los proveedores que tienen enlace en config.js.
import { pintarProveedores } from "./proveedores.js";
import { t, alCambiar } from "./idioma.js";
const raiz = document.documentElement;

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
pintarTema();
alCambiar(pintarTema);

const lista = document.getElementById("proveedores");
pintarProveedores(lista);
document.getElementById("sin-proveedores").hidden = lista.children.length > 0;
