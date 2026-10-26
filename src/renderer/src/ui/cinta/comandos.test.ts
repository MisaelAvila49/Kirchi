import { describe, expect, it } from 'vitest'
import { nombreBotonTema, NOMBRE_TEMA } from '../tema'
import { COMANDOS, EN_MENUS, esDeMenu, textoMenu, type IdComando } from './comandos'
import { DECISIONES } from './decisiones'
import { TRAZOS } from './trazos'

const ids = Object.keys(COMANDOS) as IdComando[]

describe('comandos de la cinta', () => {
  it('cada uno tiene nombre e icono que existe; ningún texto lleva guion largo', () => {
    for (const id of ids) {
      const c = COMANDOS[id]
      expect(c.texto.trim(), id).not.toBe('')
      expect(TRAZOS, id).toHaveProperty([c.icono])
      for (const t of [c.texto, c.textoMenu ?? '', c.palabras ?? '']) expect(t, id).not.toContain('—')
    }
  })

  it('los ids son cortos, en minúsculas y con guiones, como los del registro de atajos', () => {
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,32}$/)
  })

  it('la tecla sale del registro, salvo las que atiende otro (F11, doble clic)', () => {
    expect(COMANDOS.girar.tecla).toBe('girar')
    expect(COMANDOS['pantalla-completa']).toMatchObject({ teclaFija: 'F11' })
    expect(COMANDOS.pieza).toMatchObject({ teclaFija: 'doble clic' })
    for (const id of ids) expect(COMANDOS[id].tecla && COMANDOS[id].teclaFija, id).toBeFalsy()
  })

  it('el nombre en el menú del clic derecho es el de la cinta salvo donde difiere', () => {
    expect(textoMenu('girar')).toBe('Girar 90° a la derecha')
    expect(textoMenu('girar-izq')).toBe('Girar 90° a la izquierda')
    expect(textoMenu('espejo-x')).toBe('Reflejar horizontal')
    expect(textoMenu('nota')).toBe('Nota de texto')
    expect(textoMenu('encuadrar')).toBe('Encuadrar todo')
    expect(textoMenu('pegar')).toBe('Pegar aquí')
    expect(textoMenu('exportar')).toBe('Exportar imagen')
    expect(textoMenu('copiar')).toBe('Copiar')
  })

  it('las órdenes que el clic derecho comparte con la cinta son comandos de la cinta', () => {
    for (const id of EN_MENUS) expect(COMANDOS[id], id).toBeDefined()
    expect(esDeMenu('girar')).toBe(true)
    expect(esDeMenu('editar-valor')).toBe(false)
    expect(esDeMenu('duplicar')).toBe(false)
  })

  it('el botón de tema se llama con el texto visible dentro (label-content-name-mismatch)', () => {
    expect(nombreBotonTema('claro')).toBe('Tema oscuro, ahora claro')
    expect(nombreBotonTema('oscuro').toLowerCase()).toContain(NOMBRE_TEMA.oscuro.toLowerCase())
  })

  it('las decisiones provisionales son las recomendadas de la especificación', () => {
    expect(DECISIONES).toEqual({ pestañasMayusculas: false, detenerSiempre: true, zoomEn: 'ambos', buscador: true, rotulosGrupo: true, segunSeleccion: true, iconosChicos: 'plano' })
  })
})
