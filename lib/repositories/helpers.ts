type ResponseErrorLike = {
  status?: unknown;
  response?: unknown;
  originalError?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function hasResponseStatus(error: unknown, status: number): boolean {
  if (!isObject(error)) return false;

  const candidate: ResponseErrorLike = error;
  if (candidate.status === status) return true;

  if (isObject(candidate.response) && candidate.response.code === status) return true;
  if (isObject(candidate.originalError) && candidate.originalError.status === status) return true;

  return false;
}

export function isNotFoundError(error: unknown): boolean {
  return hasResponseStatus(error, 404);
}

export function nullable(value: string | undefined | null): string | null {
  return value ? value : null;
}
