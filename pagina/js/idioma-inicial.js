// Elige el idioma antes de pintar: lo guardado, si no el del navegador (en* = inglés), si no español.
(function () {
  var l = "";
  try { l = localStorage.getItem("kirchi-idioma") || ""; } catch (e) {}
  if (l !== "es" && l !== "en") l = /^en/i.test(navigator.language || "") ? "en" : "es";
  document.documentElement.lang = l;
})();
