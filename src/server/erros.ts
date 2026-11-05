/** Erro com mensagem pronta para mostrar ao usuário. */
export class ErroDeUsuario extends Error {}

/** Falha numa fonte externa. `temporario` indica que vale tentar de novo mais tarde. */
export class ErroDeFonte extends ErroDeUsuario {
  constructor(
    message: string,
    public readonly temporario: boolean,
  ) {
    super(message);
  }
}

export function mensagemDeErro(error: unknown): string {
  if (error instanceof ErroDeUsuario) return error.message;
  return "Algo deu errado. Tente de novo em instantes.";
}
