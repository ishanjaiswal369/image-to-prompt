import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError, RateLimitError } from "../lib/errors.js";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof RateLimitError) {
      reply.header("Retry-After", String(err.retryAfterSeconds));
      reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
      return;
    }

    if (err instanceof AppError) {
      reply.code(err.statusCode).send({
        error: { code: err.code, message: err.message, issues: (err as { issues?: unknown }).issues },
      });
      return;
    }

    if (err instanceof ZodError) {
      reply.code(400).send({ error: { code: "validation_error", message: "invalid request", issues: err.issues } });
      return;
    }

    req.log.error({ err }, "unhandled_error");
    reply.code(500).send({ error: { code: "internal_error", message: "internal server error" } });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: { code: "not_found", message: "route not found" } });
  });
}
