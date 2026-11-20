// Direcciones limpias para las secciones de la principal: kirchi.app/funciones en vez de kirchi.app/#uso.
// Cada dirección es una copia de la principal (la genera scripts/pagina-idiomas.mjs) con data-seccion; al abrirla se baja a su sección.
// Dentro de la página, los enlaces a esas direcciones bajan sin recargar y cambian la dirección con history.pushState.
// Los enlaces viejos con # siguen funcionando y se cambian a la dirección limpia.
const en = document.documentElement.lang === 'en';
const RUTAS = en
  ? { '': 'inicio', trailer: 'trailer-sec', features: 'uso', 'whats-new': 'nuevo', versions: 'crecimiento', download: 'descargas' }
  : { '': 'inicio', trailer: 'trailer-sec', funciones: 'uso', novedades: 'nuevo', versiones: 'crecimiento', descargar: 'descargas' };
const DE_SECCION = Object.fromEntries(Object.entries(RUTAS).map(([r, id]) => [id, r]));
const REDUCIR = matchMedia('(prefers-reduced-motion: reduce)');

const ultimo = (ruta) => ruta.replace(/\/$/, '').split('/').pop().replace(/\.html$/, '').replace(/^index$/, '');
const carpeta = (u) => u.pathname.replace(/[^/]*$/, '');

// Lleva a la sección. Otro módulo puede encargarse de una sección (el recorrido de Versiones) cancelando el evento kirchi:ir.
function ir(id, suave) {
  const libre = dispatchEvent(new CustomEvent('kirchi:ir', { cancelable: true, detail: { id, suave } }));
  if (!libre) return;
  const comportamiento = suave && !REDUCIR.matches ? 'smooth' : 'auto';
  const el = document.getElementById(id);
  if (id === 'inicio' || !el) scrollTo({ top: 0, behavior: comportamiento });
  else el.scrollIntoView({ behavior: comportamiento, block: 'start' });
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || a.target || e.defaultPrevented || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin || carpeta(u) !== carpeta(location) || u.hash) return;
  const id = RUTAS[ultimo(u.pathname)];
  if (!id || (id !== 'inicio' && !document.getElementById(id))) return;
  e.preventDefault();
  ir(id, true);
  if (u.pathname !== location.pathname) history.pushState(null, '', u.pathname);
});

// Al ir atrás o adelante, la sección la pone este script; si el navegador también restaurara su posición, las dos chocan.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
addEventListener('popstate', () => { const id = RUTAS[ultimo(location.pathname)]; if (id) ir(id, true); });

// Enlace viejo con # (kirchi.app/#uso): se queda donde el navegador ya bajó y la dirección pasa a la limpia.
function limpiarHash() {
  const viejo = location.hash.slice(1);
  if (viejo && DE_SECCION[viejo] !== undefined) history.replaceState(null, '', carpeta(location) + DE_SECCION[viejo]);
}
const hashInicial = location.hash.slice(1);
limpiarHash();
addEventListener('hashchange', limpiarHash);

// Copia de una sección (kirchi.app/funciones): baja a ella al abrir y otra vez cuando ya cargaron imágenes y fuentes,
// mientras la persona no se haya movido por su cuenta.
// Lo mismo con un enlace viejo con #, que ya perdió el # y el navegador dejó de seguir.
const inicial = document.documentElement.dataset.seccion || (DE_SECCION[hashInicial] !== undefined ? hashInicial : '');
if (inicial && (!location.hash || location.hash === '#' + inicial)) {
  let movio = false;
  const marcar = () => { movio = true; };
  ir(inicial, false);
  addEventListener('wheel', marcar, { once: true, passive: true });
  addEventListener('touchstart', marcar, { once: true, passive: true });
  addEventListener('keydown', marcar, { once: true });
  const otraVez = () => { if (!movio) ir(inicial, false); };
  if (document.readyState === 'complete') requestAnimationFrame(otraVez); else addEventListener('load', otraVez, { once: true });
  if (document.fonts) document.fonts.ready.then(otraVez);
}
