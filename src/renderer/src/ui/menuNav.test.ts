import { describe, expect, it } from 'vitest'
import { porLetra, posicionMenu, posicionSubmenu, primero, siguiente, ultimo } from './menuNav'
import type { EntradaMenu } from './menus'

const it_ = (texto: string, deshabilitado = false): EntradaMenu => ({ tipo: 'item', id: 'girar', texto, deshabilitado })
const sep: EntradaMenu = { tipo: 'separador' }
// 0 Editar, 1 Girar, 2 —, 3 Reflejar (deshabilitado), 4 —, 5 Éxito, 6 Borrar
const entradas = [it_('Editar'), it_('Girar'), sep, it_('Reflejar', true), sep, it_('Éxito'), it_('Borrar')]

describe('navegación del menú', () => {
  it('las flechas saltan separadores, se detienen en los deshabilitados y dan la vuelta', () => {
    expect(siguiente(entradas, 1, 1)).toBe(3)
    expect(siguiente(entradas, 3, 1)).toBe(5)
    expect(siguiente(entradas, 6, 1)).toBe(0)
    expect(siguiente(entradas, 0, -1)).toBe(6)
    expect(siguiente(entradas, 3, -1)).toBe(1)
  })

  it('sin foco, la flecha hacia arriba cae en el último ítem', () => {
    expect(siguiente(entradas, -1, -1)).toBe(6)
    expect(siguiente([it_('Uno'), it_('Dos'), sep], -1, -1)).toBe(1)
    expect(siguiente(entradas, -1, 1)).toBe(0)
  })

  it('Inicio y Fin', () => {
    expect(primero(entradas)).toBe(0)
    expect(ultimo(entradas)).toBe(6)
    expect(primero([sep, it_('Solo')])).toBe(1)
    expect(primero([sep])).toBe(-1)
  })

  it('la primera letra busca después del actual, sin acentos y con vuelta', () => {
    expect(porLetra(entradas, 0, 'e')).toBe(5)
    expect(porLetra(entradas, 5, 'E')).toBe(0)
    expect(porLetra(entradas, 0, 'r')).toBe(3)
    expect(porLetra(entradas, 0, 'z')).toBe(-1)
  })
})

describe('posicionSubmenu', () => {
  it('se abre a la derecha del ítem, a su altura; si no cabe, a la izquierda; nunca fuera de la ventana', () => {
    expect(posicionSubmenu({ left: 100, top: 200, right: 330 }, 200, 300, 1280, 800)).toEqual({ left: 332, top: 195 })
    expect(posicionSubmenu({ left: 1000, top: 200, right: 1230 }, 200, 300, 1280, 800)).toEqual({ left: 798, top: 195 })
    expect(posicionSubmenu({ left: 100, top: 700, right: 330 }, 200, 300, 1280, 800).top).toBe(492)
  })
})

describe('posicionMenu', () => {
  it('abre abajo a la derecha del punto, dos píxeles aparte', () => {
    expect(posicionMenu(100, 100, 240, 300, 1280, 800)).toEqual({ left: 102, top: 102 })
  })

  it('cerca del borde derecho o del inferior se abre del otro lado, sin tapar el punto', () => {
    expect(posicionMenu(1200, 700, 240, 300, 1280, 800)).toEqual({ left: 958, top: 398 })
  })

  it('nunca sale de la ventana aunque no quepa de ningún lado', () => {
    expect(posicionMenu(50, 50, 240, 900, 1280, 800)).toEqual({ left: 52, top: 8 })
    expect(posicionMenu(100, 100, 2000, 100, 1280, 800).left).toBe(8)
  })
})

describe('posicionMenu: el punto del clic queda libre', () => {
  it('si cabe de algún lado, el menú no cubre el punto', () => {
    const vw = 600, vh = 500, margen = 8, hueco = 2
    let revisados = 0
    for (const ancho of [150, 240, 400, 580])
      for (const alto of [100, 300, 480])
        for (let x = 0; x <= vw; x += 25)
          for (let y = 0; y <= vh; y += 25) {
            const cabe =
              x + hueco + ancho <= vw - margen || x - hueco - ancho >= margen || y + hueco + alto <= vh - margen || y - hueco - alto >= margen
            if (!cabe) continue
            revisados++
            const { left, top } = posicionMenu(x, y, ancho, alto, vw, vh, margen, hueco)
            const cubre = x >= left && x <= left + ancho && y >= top && y <= top + alto
            expect(cubre, `x=${x} y=${y} ${ancho}x${alto} -> ${left},${top}`).toBe(false)
            expect(left).toBeGreaterThanOrEqual(margen)
            expect(top).toBeGreaterThanOrEqual(margen)
          }
    expect(revisados).toBeGreaterThan(100)
  })
})
