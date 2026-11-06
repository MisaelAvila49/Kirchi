// Botones de apoyo de los proveedores que tienen enlace en config.js; los usan la página principal y apoyar.html.
import { aplicar } from "./idioma.js";
const PROVEEDORES = [
  ["paypal", "PayPal", "Aportación única", "One-time contribution"],
  ["mercadoPago", "Mercado Pago", "Desde México", "From Mexico"],
  ["githubSponsors", "GitHub Sponsors", "Única o mensual", "One-time or monthly"],
];
export function pintarProveedores(lista) {
  const apoyo = (window.KIRCHI && window.KIRCHI.APOYO) || {};
  for (const [clave, texto, es, en] of PROVEEDORES) {
    if (!apoyo[clave]) continue;
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.className = "apoyo-op";
    a.href = apoyo[clave];
    a.rel = "noopener";
    const n = document.createElement("span");
    n.className = "apoyo-op-nombre";
    n.textContent = texto;
    const d = document.createElement("span");
    d.className = "apoyo-op-desc mono";
    d.textContent = es;
    d.dataset.en = en;
    const f = document.createElement("span");
    f.className = "apoyo-op-flecha";
    f.setAttribute("aria-hidden", "true");
    f.textContent = "\u2192";
    a.append(n, d, f);
    li.append(a);
    lista.append(li);
  }
  aplicar();
  return lista.children.length;
}
