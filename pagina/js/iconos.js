// Íconos de trazo de Kirchi (scripts/datos/iconos-trazo.js de la aplicación) más seis propios en el mismo trazo.
// Uso: <i data-i="osciloscopio"></i> se cambia por <svg class="icono">.
(function(){
const I = {
 "simular": "<path d=\"M5 3.5v9l7-4.5z\" fill=\"currentColor\" stroke=\"none\"/>",
 "pausa": "<path d=\"M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z\" fill=\"currentColor\" stroke=\"none\"/>",
 "osciloscopio": "<path d=\"M1.8 3h12.4v10H1.8zM3.6 8C4.6 4.6 5.8 4.6 6.6 8S8.6 11.4 9.4 8 11.4 4.6 12.4 8\"/>",
 "fabricar": "<path d=\"M2 3h12v10H2zM4.5 10.5h2.5l1.5-3h3M4.5 6.5h2M11.5 10.5h.01M11.5 7.5h.01\"/>",
 "exportar": "<path d=\"M13 9.5V13H3V3h3.5M9 2.5h4.5V7M13.5 2.5 7.5 8.5\"/>",
 "abrir": "<path d=\"M2 4h4l1.5 1.5H14V13H2z\"/>",
 "web": "<path d=\"M2 8h12M8 2c-2.4 2-2.4 10 0 12M8 2c2.4 2 2.4 10 0 12\"/><circle cx=\"8\" cy=\"8\" r=\"6\"/>",
 "grabar": "<circle cx=\"8\" cy=\"8\" r=\"6\"/><path d=\"M5.2 8a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0-5.6 0z\"/>",
 "kirchi": "<path d=\"M4 1.2h8a2.8 2.8 0 0 1 2.8 2.8v8a2.8 2.8 0 0 1-2.8 2.8H4a2.8 2.8 0 0 1-2.8-2.8V4A2.8 2.8 0 0 1 4 1.2zM5.5 3.8v8.4M5.5 9.5l5.3-4.2M7 8.3l4 4.4\"/><circle cx=\"5.5\" cy=\"9.5\" r=\"1.9\"/>",
 "apoyo": "<path d=\"M8 13.4C4.6 11.1 1.8 8.7 1.8 5.9A3.1 3.1 0 0 1 8 4.6a3.1 3.1 0 0 1 6.2 1.3c0 2.8-2.8 5.2-6.2 7.5z\"/>",
 "correo": "<path d=\"M2.5 3.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM2 4.6l6 4.6 6-4.6\"/>",
 "ayuda": "<circle cx=\"8\" cy=\"8\" r=\"6.2\"/><path d=\"M6.2 6.3a1.9 1.9 0 1 1 2.6 1.8c-.6.3-.8.7-.8 1.3v.4M8 11.6h.01\"/>",
 "multimetro": "<path d=\"M3.5 1.8h9v12.4h-9zM5.3 3.8h5.4v3.3H5.3z\"/><circle cx=\"8\" cy=\"10.8\" r=\"1.8\"/>",
 "generador": "<circle cx=\"8\" cy=\"8\" r=\"5.9\"/><path d=\"M4.6 8c.7-2.4 1.8-2.4 2.2 0s1.6 2.4 2.3 0 1.6-2.4 2.3 0\"/>",
 "analisis": "<path d=\"M2 2.5v11h12M3.6 5h4c2 0 3 1.6 4 5l1.4 3\"/>",
 "graficas": "<path d=\"M2.5 2.5v11h11M3.6 10.6c1.8-1.2 3-6 4.6-6s2.2 5.2 4.2 5.2M3.6 7.4c2 0 2.6 4.4 4.6 4.4s2.6-6 4.2-6\"/>",
 "calculadoras": "<path d=\"M5 2h6a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 11 14H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 2zM5.6 4.8h4.8M5.8 8h.01M8 8h.01M10.2 8h.01M5.8 10.6h.01M8 10.6h.01M10.2 10.6h.01\"/>",
 "plantillas": "<path d=\"M5.5 2.5h8v8.5M2.5 5h8v8.5h-8zM4.8 8.2h3.4M4.8 10.6h2.2\"/>",
 "libreria": "<path d=\"M2 8h3l1.5-3 3 6L11 8h3\"/>",
 "cable": "<path d=\"M3.2 12.5V5.5h9.6\"/><circle cx=\"3.2\" cy=\"12.5\" r=\"1.3\"/><circle cx=\"12.8\" cy=\"5.5\" r=\"1.3\"/>",
 "pieza": "<circle cx=\"6.8\" cy=\"6.8\" r=\"4.3\"/><path d=\"M10 10l4 4\"/>",
 "red": "<circle cx=\"3\" cy=\"8\" r=\"1.4\"/><circle cx=\"13\" cy=\"3.8\" r=\"1.4\"/><circle cx=\"13\" cy=\"12.2\" r=\"1.4\"/><path d=\"M4.4 8H8M8 3.8v8.4M8 3.8h3.6M8 12.2h3.6\"/>",
 "sol": "<circle cx=\"8\" cy=\"8\" r=\"3\"/><path d=\"M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5\"/>",
 "luna": "<path d=\"M12 9.5A5 5 0 0 1 6.5 4a5 5 0 1 0 5.5 5.5z\"/>",
 "ejemplos": "<path d=\"M8 4.2C6.6 3 4.5 2.8 2 3.2v9.6c2.5-.4 4.6-.2 6 1 1.4-1.2 3.5-1.4 6-1V3.2c-2.5-.4-4.6-.2-6 1zM8 4.2v9.6\"/>",
 "tutorial": "<path d=\"M3.4 12.6C3.4 9 8 10.6 8 7.4S11.4 4.4 12.4 3.8M12 1.8v6.4M12 2.2l3 1.4-3 1.4z\"/><circle cx=\"3.4\" cy=\"12.6\" r=\"1.7\"/>",
 "acerca": "<circle cx=\"8\" cy=\"8\" r=\"6.2\"/><path d=\"M8 7.3v4M8 4.8h.01\"/>",
 "video": "<path d=\"M2.4 4h7.2A1.4 1.4 0 0 1 11 5.4v5.2A1.4 1.4 0 0 1 9.6 12H2.4A1.4 1.4 0 0 1 1 10.6V5.4A1.4 1.4 0 0 1 2.4 4zM11 7.1l4-2.2v6.2l-4-2.2\"/>",
 "nuevo": "<path d=\"M4 1.8h5.2L12 4.6v9.6H4zM9 1.8v3h3M8 7.6v4M6 9.6h4\"/>",
 "aviso": "<path d=\"M8 2.2 14.3 13H1.7zM8 6.3v3.2M8 11.3h.01\"/>",
 "mediciones": "<circle cx=\"8\" cy=\"8\" r=\"5\"/><path d=\"M8 5v3l2 1.5\"/>",
 "comunidad": "<path d=\"M1 13c0-2.6 2.2-4 4.8-4s4.8 1.4 4.8 4zM11 9.4c2.4-.2 4.2 1 4.2 3.6h-3\"/><circle cx=\"5.8\" cy=\"5\" r=\"2.2\"/><circle cx=\"12.3\" cy=\"6.4\" r=\"1.9\"/>",
 "sugerencia": "<path d=\"M2.5 2.5h11a1 1 0 0 1 1 1v6.4a1 1 0 0 1-1 1H8l-3.2 3v-3H2.5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1zM5 6.7h.01M8 6.7h.01M11 6.7h.01\"/>",
 "configuracion": "<path d=\"M14.31 6.95L14.31 9.05L12.56 9.13L12.03 10.42L13.21 11.72L11.72 13.21L10.42 12.03L9.13 12.56L9.05 14.31L6.95 14.31L6.87 12.56L5.58 12.03L4.28 13.21L2.79 11.72L3.97 10.42L3.44 9.13L1.69 9.05L1.69 6.95L3.44 6.87L3.97 5.58L2.79 4.28L4.28 2.79L5.58 3.97L6.87 3.44L6.95 1.69L9.05 1.69L9.13 3.44L10.42 3.97L11.72 2.79L13.21 4.28L12.03 5.58L12.56 6.87Z\"/><circle cx=\"8\" cy=\"8\" r=\"2\"/>",
 "protoboard": "<path d=\"M1.8 3h12.4v10H1.8zM1.8 8h12.4M4.4 5.2h.01M6.4 5.2h.01M8.4 5.2h.01M10.4 5.2h.01M12 5.2h.01M4.4 10.8h.01M6.4 10.8h.01M8.4 10.8h.01M10.4 10.8h.01M12 10.8h.01\"/>",
 "sinconexion": "<path d=\"M2 6.2a8.6 8.6 0 0 1 12 0M4.2 8.8a5.4 5.4 0 0 1 7.6 0M6.4 11.2a2.2 2.2 0 0 1 3.2 0M8 13.4h.01M2.5 2.5l11 11\"/>",
 "sincuenta": "<circle cx=\"8\" cy=\"5.4\" r=\"2.6\"/><path d=\"M3 13.4c0-2.6 2.2-4 5-4s5 1.4 5 4M2.5 2.5l11 11\"/>",
 "gratis": "<path d=\"M2 8.4V2.8h5.6l6.6 6.6-5.4 5.4zM5.2 5.2h.01\"/>",
 "descargar": "<path d=\"M8 2v8.6M4.4 7.4 8 11l3.6-3.6M2.8 13.6h10.4\"/>",
 "flecha": "<path d=\"M3 8h10M9 4l4 4-4 4\"/>",
 "reproducir": "<path d=\"M5 3.5v9l7-4.5z\" fill=\"currentColor\" stroke=\"none\"/>",
 "importar": "<path d=\"M3 3.5h4M3 3.5v9h10v-6M9.5 2v6.4M6.8 5.8l2.7 2.8 2.7-2.8\"/>"
};
function pintar(raiz){
  (raiz||document).querySelectorAll('i[data-i]').forEach(function(i){
    var d=I[i.dataset.i]; if(!d){console.error('Icono que no existe: '+i.dataset.i);return;}
    var s=document.createElementNS('http://www.w3.org/2000/svg','svg');
    s.setAttribute('class','icono '+(i.className||'')); s.setAttribute('viewBox','0 0 16 16');
    s.setAttribute('aria-hidden','true'); s.setAttribute('focusable','false'); s.innerHTML=d; i.replaceWith(s);
  });
}
window.KI_ICONOS=I; window.pintarIconos=pintar;
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){pintar()}); else pintar();
})();
