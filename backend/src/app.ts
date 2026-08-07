import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { registerErrorHandler } from "./middleware/errorHandler.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { analyzeRoutes } from "./routes/analyze.js";
import { creditsRoutes } from "./routes/credits.js";
import { adminRoutes } from "./routes/admin.js";
import { historyRoutes } from "./routes/history.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: config.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
    },
  });

  // Restricted to the extension's own origin, never "*" — chrome-extension://<id>.
  await app.register(cors, { origin: [config.EXTENSION_ORIGIN] });

  // Global cap, on top of the per-user token bucket applied to /analyze specifically.
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_GLOBAL_PER_MINUTE,
    timeWindow: "1 minute",
    errorResponseBuilder: (_req, context) => ({
      error: {
        code: "rate_limited",
        message: `global rate limit exceeded, retry after ${String(context.after)}`,
      },
    }),
  });

  registerErrorHandler(app);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(analyzeRoutes);
  await app.register(creditsRoutes);
  await app.register(adminRoutes);
  await app.register(historyRoutes);

  return app;
}
