/** Erros de domínio com mensagens seguras para exibir ao usuário. */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = "APP_ERROR",
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Registro não encontrado.") {
    super(message, "NOT_FOUND", 404);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Você não tem permissão para esta ação.") {
    super(message, "FORBIDDEN", 403);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Muitas tentativas. Aguarde alguns minutos e tente novamente.") {
    super(message, "RATE_LIMITED", 429);
  }
}

/** Integração externa não configurada — a ação não deve ser simulada. */
export class IntegrationNotConfiguredError extends AppError {
  constructor(public readonly integration: string, message?: string) {
    super(message ?? `Integração "${integration}" não configurada.`, "INTEGRATION_NOT_CONFIGURED", 412);
  }
}

/** Falha em API externa. `retryable` indica se vale tentar novamente mais tarde. */
export class IntegrationError extends AppError {
  constructor(
    public readonly integration: string,
    message: string,
    public readonly retryable: boolean,
    public readonly providerCode?: string,
  ) {
    super(message, "INTEGRATION_ERROR", 502);
  }
}

/** Erro que não deve ser re-tentado pela fila de tarefas. */
export class NonRetryableError extends AppError {
  constructor(message: string, code = "NON_RETRYABLE") {
    super(message, code, 422);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof IntegrationError) return error.retryable;
  if (error instanceof IntegrationNotConfiguredError) return false;
  if (error instanceof NonRetryableError) return false;
  if (error instanceof AppError) return false;
  return true;
}
