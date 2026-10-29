// @vitest-environment happy-dom
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ajustesPorOmision } from '../../../compartido/ajustes'
import Configuracion from './Configuracion'

const espera = () => new Promise((r) => setTimeout(r, 0))

describe('Configuración › General › Grabaciones', () => {
  let quitar = () => {}
  afterEach(() => {
    quitar()
    document.body.replaceChildren()
  })
  const montar = (carpetaGrabaciones: string | undefined, grabacion?: { cambiarCarpeta(): Promise<string | null>; restablecerCarpeta(): Promise<void> }) => {
    quitar = render(() => <Configuracion ajustes={{ ...ajustesPorOmision(), carpetaGrabaciones }} onCambiar={() => {}} onCerrar={() => {}} grabacion={grabacion} />, document.body)
  }
  const boton = (texto: string) => [...document.querySelectorAll('button')].find((b) => b.textContent!.trim() === texto)!

  it('sin proceso principal la fila no se muestra', () => {
    montar(undefined)
    expect(document.body.textContent).not.toContain('Carpeta de grabaciones')
  })

  it('muestra la carpeta por omisión y, al cambiarla, el nombre de la elegida; Restablecer vuelve a la de siempre', async () => {
    const api = { cambiarCarpeta: vi.fn(async () => 'D:\\Clases\\Videos'), restablecerCarpeta: vi.fn(async () => {}) }
    montar(undefined, api)
    expect(document.body.textContent).toContain('Carpeta de grabaciones')
    expect(document.getElementById('carpeta-grabaciones')!.textContent).toBe('Videos › Kirchi')
    expect(boton('Restablecer').disabled).toBe(true)
    boton('Cambiar…').click()
    await espera()
    expect(api.cambiarCarpeta).toHaveBeenCalledTimes(1)
    expect(document.getElementById('carpeta-grabaciones')!.textContent).toBe('Videos')
    expect(boton('Restablecer').disabled).toBe(false)
    boton('Restablecer').click()
    await espera()
    expect(api.restablecerCarpeta).toHaveBeenCalledTimes(1)
    expect(document.getElementById('carpeta-grabaciones')!.textContent).toBe('Videos › Kirchi')
  })

  it('si se cancela el diálogo la carpeta no cambia, y un error se dice', async () => {
    const api = { cambiarCarpeta: vi.fn(async (): Promise<string | null> => null), restablecerCarpeta: vi.fn(async () => {}) }
    montar('C:\\Mis videos', api)
    expect(document.getElementById('carpeta-grabaciones')!.textContent).toBe('Mis videos')
    boton('Cambiar…').click()
    await espera()
    expect(document.getElementById('carpeta-grabaciones')!.textContent).toBe('Mis videos')
    api.cambiarCarpeta.mockRejectedValueOnce(new Error('No se pudo usar esa carpeta.'))
    boton('Cambiar…').click()
    await espera()
    expect(document.querySelector('[role="alert"]')!.textContent).toBe('No se pudo usar esa carpeta.')
  })
})

describe('Configuración › pestañas, pistas y Asistente', () => {
  let quitar = () => {}
  afterEach(() => {
    quitar()
    document.body.replaceChildren()
  })
  const asistente = () => ({
    estado: { activo: false } as { activo: boolean; cliente?: string },
    onActivar: vi.fn(),
    onCambiarCarpeta: vi.fn(async (): Promise<string | null> => null),
    onRestablecer: vi.fn(async () => {}),
    onDesconectar: vi.fn(),
    onCopiar: vi.fn(async () => {})
  })
  const montar = (extra: Record<string, unknown> = {}) => {
    quitar = render(() => <Configuracion ajustes={ajustesPorOmision()} onCambiar={() => {}} onCerrar={() => {}} {...extra} />, document.body)
  }
  const pestañas = () => [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent)
  const pestaña = (nombre: string) => [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === nombre)!

  it('las pestañas salen en el orden de la maqueta y Asistente solo con su interfaz', async () => {
    montar()
    expect(pestañas()).toEqual(['General', 'Apariencia', 'Simulación'])
    quitar()
    montar({ asistente: asistente() })
    expect(pestañas()).toEqual(['General', 'Apariencia', 'Simulación', 'Asistente'])
  })

  it('una pestaña pedida que ya no existe abre General', () => {
    montar({ seccion: 'archivos' })
    expect(pestaña('General').getAttribute('aria-selected')).toBe('true')
    expect(document.body.textContent).toContain('Serie de valores al escribir')
  })

  it('«Evitar parpadeo del lienzo» vive en Apariencia y es un interruptor', () => {
    const onCambiar = vi.fn()
    quitar = render(() => <Configuracion ajustes={ajustesPorOmision()} onCambiar={onCambiar} onCerrar={() => {}} />, document.body)
    expect(document.body.textContent).not.toContain('Evitar parpadeo del lienzo')
    pestaña('Simulación').click()
    expect(document.body.textContent).not.toContain('Evitar parpadeo del lienzo')
    pestaña('Apariencia').click()
    const sw = [...document.querySelectorAll<HTMLElement>('[role="switch"]')].find((b) => document.getElementById(b.getAttribute('aria-labelledby')!)!.textContent === 'Evitar parpadeo del lienzo')!
    expect(sw.getAttribute('aria-checked')).toBe('true')
    sw.click()
    expect(onCambiar).toHaveBeenCalledWith({ lienzoSincronizado: false })
  })

  it('la columna de pestañas es vertical y se recorre con arriba y abajo', async () => {
    montar()
    expect(document.querySelector('[role="tablist"]')!.getAttribute('aria-orientation')).toBe('vertical')
    pestaña('General').focus()
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    await espera()
    expect(pestaña('Apariencia').getAttribute('aria-selected')).toBe('true')
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
    await espera()
    expect(pestaña('General').getAttribute('aria-selected')).toBe('true')
  })

  it('las series dicen «Sin serie» y el sonido no lleva la tecla en el nombre', () => {
    montar()
    const radios = [...document.querySelectorAll<HTMLInputElement>('input[name="serie-comercial"]')]
    expect(radios.map((r) => r.parentElement!.textContent!.trim())).toEqual(['E6', 'E12', 'E24', 'Sin serie'])
    pestaña('Simulación').click()
    expect(document.body.textContent).toContain('Velocidad de las flechas')
    expect([...document.querySelectorAll('input[name="velocidad-flechas"]')].map((r) => r.parentElement!.textContent!.trim())).toEqual(['×0.25', '×0.5', '×1', '×2', '×4'])
    expect(document.body.textContent).not.toContain('Sonido (M)')
    expect(document.body.textContent).not.toContain('Ahora:')
  })

  it('cada pista tiene el nombre accesible igual al texto de su globo, y Esc cierra el globo', async () => {
    montar()
    const pistas = [...document.querySelectorAll<HTMLButtonElement>('button.info')]
    expect(pistas.length).toBeGreaterThan(0)
    for (const p of pistas) expect(p.getAttribute('aria-label')).toBe(p.querySelector('[role="tooltip"]')!.textContent)
    const p = pistas[0]
    expect(p.hasAttribute('data-visible')).toBe(false)
    p.dispatchEvent(new FocusEvent('focus'))
    await espera()
    expect(p.hasAttribute('data-visible')).toBe(true)
    p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await espera()
    expect(p.hasAttribute('data-visible')).toBe(false)
    expect(document.querySelector('.dialogo')).not.toBeNull()
  })

  it('el control que se explica nombra el globo con aria-describedby', () => {
    montar()
    const radio = document.querySelector('input[name="serie-comercial"]')!
    const id = radio.getAttribute('aria-describedby')!
    expect(document.getElementById(id)!.getAttribute('role')).toBe('tooltip')
  })

  it('General trae el «Texto de las piezas ajustables» con Valores marcado y avisa lo que elija', () => {
    const onCambiar = vi.fn()
    quitar = render(() => <Configuracion ajustes={ajustesPorOmision()} onCambiar={onCambiar} onCerrar={() => {}} />, document.body)
    expect(document.body.textContent).toContain('Texto de las piezas ajustables')
    const radios = [...document.querySelectorAll<HTMLInputElement>('input[name="texto-ajuste"]')]
    expect(radios.map((r) => r.parentElement!.textContent!.trim())).toEqual(['Ajuste (30 %)', 'Valores (3 kΩ)', 'Ambos', 'Nada'])
    expect(radios.find((r) => r.checked)!.value).toBe('Valores')
    radios.find((r) => r.value === 'Ambos')!.click()
    expect(onCambiar).toHaveBeenCalledWith({ textoAjuste: 'Ambos' })
  })

  it('el interruptor del asistente cambia aria-checked y llama a onActivar; el estado dice Sin conectar y luego Esperando', async () => {
    const a = asistente()
    montar({ asistente: a, seccion: 'asistente' })
    const sw = document.querySelector<HTMLElement>('[role="switch"]')!
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(document.body.textContent).toContain('Sin conectar')
    sw.click()
    await espera()
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(a.onActivar).toHaveBeenCalledWith(true)
    expect(document.body.textContent).toContain('Listo. Escríbele al asistente desde tu cliente.')
  })

  it('con cliente conectado se lee su nombre y Desconectar llama a su acción', () => {
    const a = asistente()
    a.estado = { activo: true, cliente: 'Claude Desktop' }
    montar({ asistente: a, seccion: 'asistente' })
    expect(document.body.textContent).toContain('Conectado: Claude Desktop')
    ;[...document.querySelectorAll('button')].find((b) => b.textContent!.trim() === 'Desconectar')!.click()
    expect(a.onDesconectar).toHaveBeenCalledTimes(1)
  })

  it('Copiar configuración llama a onCopiar y avisa', async () => {
    const a = asistente()
    montar({ asistente: a, seccion: 'asistente' })
    ;[...document.querySelectorAll('button')].find((b) => b.textContent!.trim() === 'Copiar configuración del asistente')!.click()
    await espera()
    expect(a.onCopiar).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('Copiada.')
  })

  it('ninguna nota fija del panel es más larga que una línea', () => {
    montar()
    for (const t of ['General', 'Apariencia', 'Simulación']) {
      pestaña(t).click()
      for (const n of document.querySelectorAll('.panel-config .nota-dialogo, .panel-config .pista, .panel-config .cfg-cap')) {
        const visible = [...n.childNodes].filter((c) => !(c instanceof HTMLElement && c.matches('button.info'))).map((c) => c.textContent).join('')
        expect(visible.length, `${t}: ${visible}`).toBeLessThanOrEqual(80)
      }
    }
  })
})
