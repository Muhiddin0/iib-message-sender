export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "TELEGRAM_UNAUTHORIZED"
  | "TELEGRAM_FLOOD_WAIT"
  | "TELEGRAM_PERMISSION_DENIED"
  | "TELEGRAM_TEMPORARY"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
        },
      },
      { status: error.status },
    );
  }

  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Kutilmagan xatolik yuz berdi." } },
    { status: 500 },
  );
}
