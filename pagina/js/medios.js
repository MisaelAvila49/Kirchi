// Ayuda común de los videos y del carrusel: avisa cuando una figura debe estar en marcha (su paso activo y la figura a la vista, no apilada).
// La pausa global (clase «pausado» en <html>) la leen quienes lo necesiten; aquí solo se reevalúa cuando cambia.
const raiz = document.documentElement;
export const pausado = () => raiz.classList.contains("pausado");

export function vigilar(fig, alCambio) {
  const e = { activa: false, visible: false, apilado: false };
  const evaluar = () => alCambio({ ...e, marcha: e.activa && e.visible && !e.apilado, pausado: pausado() });
  fig.addEventListener("kirchi-fig", (ev) => { e.activa = ev.detail.activa; e.apilado = ev.detail.apilado; evaluar(); });
  new IntersectionObserver((es) => { e.visible = es[es.length - 1].isIntersecting; evaluar(); }, { threshold: 0.35 }).observe(fig);
  document.addEventListener("kirchi-pausa", evaluar);
  evaluar();
}
