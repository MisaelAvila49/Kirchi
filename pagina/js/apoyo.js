// Página de apoyo: los botones de los proveedores que tienen enlace en config.js.
import { pintarProveedores } from "./proveedores.js";
const lista = document.getElementById("proveedores");
pintarProveedores(lista);
document.getElementById("sin-proveedores").hidden = lista.children.length > 0;
