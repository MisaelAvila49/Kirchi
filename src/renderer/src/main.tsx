import { render } from 'solid-js/web'
// Fuentes incluidas: Mona Sans con sus ejes de peso y ancho, Geist Mono para las cifras y Source Serif
// para las notas; cada una con su cursiva. Si cambian, se vuelve a correr scripts/metricas-fuentes.mjs.
import '@fontsource-variable/mona-sans/wdth.css'
import '@fontsource-variable/mona-sans/wdth-italic.css'
import '@fontsource-variable/geist-mono'
import '@fontsource-variable/geist-mono/wght-italic.css'
import '@fontsource-variable/source-serif-4'
import '@fontsource-variable/source-serif-4/wght-italic.css'
import App from './App'
import { esRutaGraficas } from '../../compartido/graficas'
import { esRutaOsc } from '../../compartido/ventanaOsc'
import VentanaGraficas from './ui/grafica/VentanaGraficas'
import VentanaOsciloscopio from './ui/osciloscopio/VentanaOsciloscopio'
import { ajustesIniciales } from './ajustes/ajustes'
import './styles.css'
// Las reglas de los paneles, la hoja y las figuras: después de styles.css y antes de colores.css.
import './ui/paneles.css'
import './ui/valores.css'
import './ui/calculadoras.css'
import './ui/analisis.css'
import './ui/avisoLienzo.css'
// La pestaña Osciloscopio, también antes de colores.css.
import './ui/osciloscopio/osciloscopio.css'
// La barra del instrumento, compartida por el osciloscopio y las gráficas.
import './ui/instrumento/barra.css'
// El diálogo de exportar con vista previa, también antes de colores.css.
import './ui/exportar/exportar.css'
import './ui/exportar/editor/editor.css'
// Después de styles.css: sus atajos [data-tono] ganan a los valores por omisión de las reglas de styles.css.
import './ui/colores.css'
// El tutorial, solo con variables de color.
import './ui/tutorial/tutorial.css'

// El tema va en <html> antes del primer cuadro: el oscuro elegido nunca parpadea en claro.
document.documentElement.dataset.tema = ajustesIniciales().tema

// La ventana de gráficas es esta misma página con la ruta #graficas: monta solo las gráficas, no el editor.
const raiz = document.getElementById('root')!
if (esRutaGraficas(location.hash)) render(() => <VentanaGraficas api={window.kirchi?.graficas} />, raiz)
else if (esRutaOsc(location.hash)) render(() => <VentanaOsciloscopio api={window.kirchi?.osciloscopio} />, raiz)
else render(() => <App />, raiz)
