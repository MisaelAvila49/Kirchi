import { expect, type Page } from '@playwright/test'

/** Elige una pestaña de la franja y la deja abierta antes de leer su texto: un clic en la ya elegida la pliega y Playwright sigue leyendo el texto plegado, así que una prueba pasaría con la franja cerrada. */
export async function verFranja(page: Page, pestaña: 'Osciloscopio' | 'Registro'): Promise<void> {
  const tab = page.getByRole('tab', { name: new RegExp(`^${pestaña}`) })
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click()
  if ((await page.locator('.instrumentos.abierta').count()) === 0) await page.locator('.instrumentos-alternar').click()
  await expect(page.locator('.instrumentos.abierta')).toBeVisible()
}

/** Abre un panel del riel derecho y lo deja abierto: un clic en el icono del panel ya abierto lo pliega. */
async function verDerecho(page: Page, panel: 'inspector' | 'mediciones' | 'proyecto'): Promise<void> {
  const boton = page.locator(`.riel.der .riel-boton[data-panel="${panel}"]`)
  if ((await boton.getAttribute('aria-expanded')) !== 'true') await boton.click()
  await expect(boton).toHaveAttribute('aria-expanded', 'true')
}
export const verInspector = (page: Page) => verDerecho(page, 'inspector')
export const verMediciones = (page: Page) => verDerecho(page, 'mediciones')
export const verProyecto = (page: Page) => verDerecho(page, 'proyecto')
