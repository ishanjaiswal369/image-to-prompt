import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8080),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1),
  EXTENSION_ORIGIN: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_REFRESH_TTL: z.string().default("30d"),
  VISION_PROVIDER: z.string().default("gemini"),
  // Provider API keys are optional here (not every deployment sets both) — the
  // vision provider factory validates that the *selected* provider's key is
  // present when it's actually instantiated, with a clear error if not.
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-flash-latest"),
  OPENROUTER_API_KEY: z.string().optional().default(""),
  // Free, general-purpose vision-language model on OpenRouter as of testing —
  // see docs/ARCHITECTURE.md for how this was verified and why Nemotron's other
  // models (text-only, or the OCR/content-safety specialists) don't fit this use case.
  OPENROUTER_MODEL: z.string().default("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"),
  SIGNUP_BONUS_CREDITS: z.coerce.number().int().default(20),
  ADMIN_TOKEN: z.string().min(1),
  RATE_LIMIT_PER_USER_PER_MINUTE: z.coerce.number().int().default(10),
  RATE_LIMIT_GLOBAL_PER_MINUTE: z.coerce.number().int().default(200),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
