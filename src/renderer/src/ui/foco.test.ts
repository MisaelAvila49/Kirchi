// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { filaConFoco, restaurarFoco } from './foco'

function lista(n: number): HTMLUListElement {
  const ul = document.createElement('ul')
  for (let i = 0; i < n; i++) {
    const li = document.createElement('li')
    const b = document.createElement('button')
    b.className = 'entrada'
    b.textContent = `b${i}`
    li.append(b)
    ul.append(li)
  }
  document.body.append(ul)
  return ul
}

describe('restaurarFoco', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('vuelve al mismo lugar de la lista y, si ya no hay tantos, al anterior', () => {
    const ul = lista(3)
    const alt = vi.fn()
    ul.querySelectorAll('button')[1].focus()
    const f = filaConFoco(document.activeElement, 'button.entrada')!
    expect(f.indice).toBe(1)
    f.fila.parentElement!.remove()
    expect(document.activeElement).toBe(document.body)
    restaurarFoco(ul, 'button.entrada', f.indice, alt)
    expect((document.activeElement as HTMLElement).textContent).toBe('b2')
    ul.querySelectorAll('li')[1].remove()
    ;(document.activeElement as HTMLElement).blur()
    restaurarFoco(ul, 'button.entrada', 5, alt)
    expect((document.activeElement as HTMLElement).textContent).toBe('b0')
    expect(alt).not.toHaveBeenCalled()
  })

  it('sin filas enfoca la lista y, si la lista ya no está, usa la alternativa', () => {
    const ul = lista(1)
    const alt = vi.fn()
    ul.querySelector('li')!.remove()
    restaurarFoco(ul, 'button.entrada', 0, alt)
    expect(document.activeElement).toBe(ul)
    ul.remove()
    restaurarFoco(ul, 'button.entrada', 0, alt)
    expect(alt).toHaveBeenCalledTimes(1)
  })

  it('no toca el foco si ya está en un control', () => {
    const ul = lista(2)
    const [a, b] = ul.querySelectorAll('button')
    b.focus()
    restaurarFoco(ul, 'button.entrada', 0, () => {})
    expect(document.activeElement).toBe(b)
    expect(a).not.toBe(document.activeElement)
  })

  it('reconoce filas que cuelgan directo de un grupo (panel Proyecto sin li)', () => {
    const g = document.createElement('div')
    g.setAttribute('role', 'group')
    for (let i = 0; i < 3; i++) {
      const b = document.createElement('button')
      b.className = 'entrada'
      b.textContent = `b${i}`
      g.append(b)
    }
    document.body.append(g)
    g.querySelectorAll('button')[2].focus()
    const f = filaConFoco(document.activeElement, 'button.entrada')!
    expect(f.lista).toBe(g)
    expect(f.indice).toBe(2)
  })
})
