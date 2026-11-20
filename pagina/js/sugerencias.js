// Formulario de sugerencias: manda las respuestas a una hoja de Google por medio de un script de Google (window.KIRCHI.SUGERENCIAS).
// Sin esa dirección, o si el envío falla, ofrece mandarlas por correo con el mismo contenido.
const en = document.documentElement.lang === 'en';
const T = en ? {
  vacio: 'Write at least one suggestion in one of the two text boxes.',
  correo: 'That email does not look right. Check it or leave it empty.',
  enviando: 'Sending…',
  fallo: 'It could not be sent. Check your connection and try again, or write to ',
  sinServicio: 'The form is not active yet. Your email app will open with your suggestion ready to send to ',
} : {
  vacio: 'Escribe al menos una sugerencia en alguno de los dos campos de texto.',
  correo: 'Ese correo no parece válido. Revísalo o déjalo vacío.',
  enviando: 'Enviando…',
  fallo: 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo, o escríbeme a ',
  sinServicio: 'El formulario todavía no está activo. Se abrirá tu correo con la sugerencia lista para mandarla a ',
};
const CONTACTO = 'misaelavila49@gmail.com';

const form = document.getElementById('form-sug');
const estado = document.getElementById('estado');
const enviar = document.getElementById('enviar');
const gracias = document.getElementById('gracias');
const opOtro = document.getElementById('op-otro');
const campoOtro = form.querySelector('.sug-otro');

opOtro.addEventListener('change', () => { campoOtro.hidden = !opOtro.checked; if (opOtro.checked) document.getElementById('otro').focus(); });

function aviso(texto, conCorreo = false) {
  estado.textContent = texto;
  if (conCorreo) { const a = document.createElement('a'); a.href = 'mailto:' + CONTACTO; a.textContent = CONTACTO; estado.append(a, '.'); }
  estado.classList.toggle('error', Boolean(texto) && texto !== T.enviando);
}

function datos() {
  const f = new FormData(form);
  const limpio = (k, n) => String(f.get(k) || '').trim().slice(0, n);
  return {
    idioma: en ? 'en' : 'es',
    programas: f.getAll('programa').join(', '),
    otro: opOtro.checked ? limpio('otro', 120) : '',
    falta: limpio('falta', 2000),
    kirchi: limpio('kirchi', 2000),
    quien: limpio('quien', 60),
    correo: limpio('correo', 200),
    sitio: limpio('sitio', 200),
  };
}

function porCorreo(d) {
  const cuerpo = [
    (en ? 'Programs: ' : 'Programas: ') + [d.programas, d.otro].filter(Boolean).join(', '),
    (en ? 'What they are missing: ' : 'Qué les falta: ') + d.falta,
    (en ? 'What I would like in Kirchi: ' : 'Qué me gustaría en Kirchi: ') + d.kirchi,
    (en ? 'Who I am: ' : 'Quién soy: ') + d.quien,
  ].join('\n\n');
  location.href = `mailto:${CONTACTO}?subject=${encodeURIComponent(en ? 'Suggestion for Kirchi' : 'Sugerencia para Kirchi')}&body=${encodeURIComponent(cuerpo)}`;
}

function listo() {
  form.hidden = true; gracias.hidden = false; gracias.focus();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = datos();
  if (d.sitio) { listo(); return; } // campo trampa: solo lo llenan los robots
  if (!d.falta && !d.kirchi) { aviso(T.vacio); document.getElementById(d.falta ? 'kirchi' : 'falta').focus(); return; }
  const correo = document.getElementById('correo');
  if (d.correo && !correo.checkValidity()) { aviso(T.correo); correo.focus(); return; }
  const url = window.KIRCHI && window.KIRCHI.SUGERENCIAS;
  if (!url) { aviso(T.sinServicio, true); porCorreo(d); return; }
  enviar.disabled = true; aviso(T.enviando);
  try {
    // no-cors: el script de Google responde con una redirección que el navegador no deja leer, pero la respuesta sí se guarda.
    await fetch(url, { method: 'POST', mode: 'no-cors', body: new URLSearchParams(d) });
    aviso(''); form.reset(); campoOtro.hidden = true; listo();
  } catch {
    aviso(T.fallo, true);
  } finally {
    enviar.disabled = false;
  }
});

document.getElementById('otra').addEventListener('click', () => { gracias.hidden = true; form.hidden = false; document.getElementById('falta').focus(); });
