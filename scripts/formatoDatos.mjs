// Formato estable de la clave «datos» de pieza.json: objetos y listas chicos en una línea (hasta 160 columnas),
// un renglón por fila de «valores» y por presentación. Mismo contenido, mismos bytes.
const ANCHO = 160
const UNIDAD = '  '

const ORDEN = {
  datos: ['por', 'equivalencias', 'valores'],
  fila: ['virtual', 'fabricante', 'parte', 'hoja', 'aproximada', 'equivalencias', 'presentaciones', 'pendiente', 'comprobado', 'nota'],
  presentacion: ['encapsulado', 'patillas', 'alimentacion', 'sinModelo', 'unidades', 'huella', 'parte', 'lcsc', 'representativa', 'protoboard'],
  equivalencias: ['kicad', 'ltspice', 'falstad', 'proteus', 'fritzing', 'sinVerificar']
}

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function ordenar(obj, orden) {
  const salida = {}
  for (const k of orden) if (k in obj) salida[k] = obj[k]
  for (const k of Object.keys(obj)) if (!(k in salida)) salida[k] = obj[k]
  return salida
}

/** Pone las claves conocidas en su orden fijo, sin tocar el de las patillas ni el de las opciones. */
export function normalizarDatos(datos) {
  const eq = (e) => (esObjeto(e) ? ordenar(e, ORDEN.equivalencias) : e)
  const presentacion = (p) => {
    if (!esObjeto(p)) return p
    const o = ordenar(p, ORDEN.presentacion)
    return o
  }
  const fila = (f) => {
    if (!esObjeto(f)) return f
    const o = ordenar(f, ORDEN.fila)
    if ('equivalencias' in o) o.equivalencias = eq(o.equivalencias)
    if (Array.isArray(o.presentaciones)) o.presentaciones = o.presentaciones.map(presentacion)
    return o
  }
  if (!esObjeto(datos)) return datos
  const d = ordenar(datos, ORDEN.datos)
  if ('equivalencias' in d) d.equivalencias = eq(d.equivalencias)
  if (esObjeto(d.valores)) d.valores = Object.fromEntries(Object.entries(d.valores).map(([k, f]) => [k, fila(f)]))
  return d
}

const enLinea = (v) => {
  if (Array.isArray(v)) return v.length ? `[${v.map(enLinea).join(', ')}]` : '[]'
  if (esObjeto(v)) {
    const e = Object.entries(v)
    return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${enLinea(x)}`).join(', ')} }` : '{}'
  }
  return JSON.stringify(v)
}

// «valores» y «presentaciones» siempre se parten: un renglón por fila y por presentación.
const SIEMPRE_PARTIDAS = new Set(['valores', 'presentaciones'])

function dar(v, nivel, clave, prefijo) {
  if (!Array.isArray(v) && !esObjeto(v)) return JSON.stringify(v)
  const vacio = Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0
  if (vacio) return Array.isArray(v) ? '[]' : '{}'
  const linea = enLinea(v)
  const base = UNIDAD.length * nivel + prefijo.length
  if (!SIEMPRE_PARTIDAS.has(clave) && base + linea.length + 1 <= ANCHO) return linea
  const dentro = UNIDAD.repeat(nivel + 1)
  const cierre = UNIDAD.repeat(nivel)
  if (Array.isArray(v)) return `[\n${v.map((x) => `${dentro}${dar(x, nivel + 1, '', '')}`).join(',\n')}\n${cierre}]`
  const lineas = Object.entries(v).map(([k, x]) => {
    const p = `${JSON.stringify(k)}: `
    return `${dentro}${p}${dar(x, nivel + 1, k, p)}`
  })
  return `{\n${lineas.join(',\n')}\n${cierre}}`
}

/** `sangria`: columnas de la clave «datos» en el archivo (2 en la raíz). El texto usa LF. */
export function formatearDatos(datos, sangria = 2) {
  const nivel = Math.round(sangria / UNIDAD.length)
  return dar(normalizarDatos(datos), nivel, 'datos', '"datos": ')
}

/** Propiedades de la raíz del objeto JSON: clave, inicio de la clave y fin del valor (sin espacios sobrantes). */
export function propiedadesRaiz(texto) {
  let i = texto.indexOf('{')
  if (i < 0) throw new Error('el texto no es un objeto JSON')
  const props = []
  i++
  const saltar = () => {
    while (i < texto.length && /\s/.test(texto[i])) i++
  }
  const cadena = () => {
    const ini = i
    i++
    while (texto[i] !== '"') i += texto.charCodeAt(i) === 92 ? 2 : 1
    i++
    return texto.slice(ini, i)
  }
  for (;;) {
    saltar()
    if (texto[i] === '}') return props
    if (texto[i] === ',') {
      i++
      continue
    }
    const inicio = i
    const clave = JSON.parse(cadena())
    saltar()
    i++ // «:»
    saltar()
    let profundidad = 0
    let fin = i
    while (i < texto.length) {
      const c = texto[i]
      if (c === '"') {
        cadena()
        fin = i
        continue
      }
      if (c === '{' || c === '[') profundidad++
      else if (c === '}' || c === ']') {
        if (profundidad === 0) break
        profundidad--
      } else if (c === ',' && profundidad === 0) break
      i++
      if (!/\s/.test(c)) fin = i
    }
    props.push({ clave, inicio, fin })
  }
}

/** Inserta o reemplaza solo el bloque «datos»; el resto del texto queda igual byte a byte. */
export function reemplazarDatos(texto, datos) {
  const crlf = texto.includes('\r\n')
  const eol = crlf ? '\r\n' : '\n'
  const bloque = `"datos": ${formatearDatos(datos, 2)}`.replace(/\n/g, eol)
  const props = propiedadesRaiz(texto)
  const actual = props.find((p) => p.clave === 'datos')
  if (actual) return texto.slice(0, actual.inicio) + bloque + texto.slice(actual.fin)
  const ancla = props.find((p) => p.clave === 'fuentes') ?? props[props.length - 1]
  if (!ancla) throw new Error('el objeto no tiene propiedades')
  return `${texto.slice(0, ancla.fin)},${eol}${UNIDAD}${bloque}${texto.slice(ancla.fin)}`
}
