// Cada página tiene su idioma (la raíz en español, /en/ en inglés). Si la persona eligió el otro, se le lleva a su página.
(function () {
  var r = document.documentElement, l = "";
  try { l = localStorage.getItem("kirchi-idioma") || ""; } catch (e) {}
  var otra = r.getAttribute("data-otra-pagina");
  if ((l === "es" || l === "en") && l !== r.lang && otra) location.replace(otra + location.hash);
})();
