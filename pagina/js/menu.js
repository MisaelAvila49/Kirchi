// Menú de secciones del celular (<details class="menu-movil">): se cierra al elegir una sección, al tocar fuera o con Escape.
(function () {
  const cerrar = (foco) => document.querySelectorAll('.menu-movil[open]').forEach((d) => { d.open = false; if (foco) d.querySelector('summary').focus(); });
  document.addEventListener('click', (e) => {
    if (e.target.closest('.menu-lista a')) cerrar(false);
    else if (!e.target.closest('.menu-movil')) cerrar(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.querySelector('.menu-movil[open]')) cerrar(true); });
})();
