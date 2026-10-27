import { MAX_ANALISIS } from '../../doc/analisis'
import { crear, modificar } from '../../doc/comandos'
import { armarAnalisis } from '../analisisDoc'
import type { Orden } from '../ordenes'
import { rechazo, type Estado, type Plan, type Rechazo } from '../plan'

type Analisis = Extract<Orden, { orden: 'analisis' }>

/** Guarda un análisis en el documento, el mismo que se crea desde el panel Análisis: con el mismo nombre lo reemplaza. */
export function analisisOrden(est: Estado, o: Analisis): Plan | Rechazo {
  const previos = Object.values(est.doc.analisis ?? {})
  const igual = previos.find((a) => a.nombre.trim().toLowerCase() === o.nombre.trim().toLowerCase())
  const r = armarAnalisis(est, { id: igual?.id, nombre: o.nombre, config: o.config, parametro: o.parametro, trazas: o.trazas, corrientes: o.corrientes })
  const verbo = `No se guardó el análisis «${o.nombre}»`
  if (!r.ok) return rechazo(`${verbo}: ${r.motivo}`)
  if (!igual && previos.length >= MAX_ANALISIS) return rechazo(`${verbo}: el documento ya tiene ${MAX_ANALISIS} análisis.`)
  if (igual && JSON.stringify(igual) === JSON.stringify(r.analisis)) return { cmd: { nombre: 'guardar el análisis', cambios: [] }, creados: {}, avisos: r.avisos, yaUnidas: true }
  const cmd = igual ? modificar('guardar el análisis', 'analisis', igual, r.analisis) : crear('guardar el análisis', 'analisis', r.analisis)
  return { cmd, creados: { [r.analisis.nombre]: r.analisis.id }, avisos: r.avisos, verbo }
}
