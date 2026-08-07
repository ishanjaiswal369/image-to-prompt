export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly issues?: unknown
  ) {
    super(400, "validation_error", message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "unauthorized") {
    super(401, "unauthorized", message);
  }
}

export class InsufficientCreditsError extends AppError {
  constructor(message = "insufficient credits") {
    super(402, "insufficient_credits", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "not found") {
    super(404, "not_found", message);
  }
}

export class ImageFetchError extends AppError {
  constructor(message: string) {
    super(422, "image_fetch_failed", message);
  }
}

export class UpstreamProviderError extends AppError {
  constructor(message: string) {
    super(502, "provider_error", message);
  }
}

export class RateLimitError extends AppError {
  constructor(
    public readonly retryAfterSeconds: number,
    message = "rate limit exceeded"
  ) {
    super(429, "rate_limited", message);
  }
}
