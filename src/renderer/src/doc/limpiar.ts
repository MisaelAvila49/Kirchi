/** Texto que entra al documento: sin caracteres que XML 1.0 no admite (dejarían ilegible un SVG exportado) y en NFC para
 * que lo escrito y lo reabierto coincidan. */
const INVALIDOS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

export const limpiarTexto = (s: string): string => s.replace(INVALIDOS, '').normalize('NFC')
