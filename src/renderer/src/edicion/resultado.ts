/** Lo que devuelve una orden: lo creado (referencia a id), avisos y, si se rechazó, el motivo en la frase del Registro. */
export type Resultado =
  | { ok: true; creados: Record<string, string>; avisos: string[]; via?: 'cable' | 'etiquetas'; yaUnidas?: true }
  | { ok: false; motivo: string; indice?: number }
