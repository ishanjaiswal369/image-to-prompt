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
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().default("gemini-flash-latest"),
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
