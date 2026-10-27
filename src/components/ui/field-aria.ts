/** Atributos aria para ligar um controle à sua mensagem de ajuda/erro (ver <Field>). */
export function fieldAria(name: string, error?: string | string[]) {
  return {
    id: name,
    name,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${name}-error` : `${name}-hint`,
  } as const;
}
