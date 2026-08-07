import type { FastifyRequest } from "fastify";
import { config } from "../config.js";
import { RateLimitError } from "../lib/errors.js";

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const REFILL_WINDOW_MS = 60_000;
const buckets = new Map<string, Bucket>();

/**
 * In-memory per-user token bucket, continuously refilled (not a fixed-window reset).
 * Single-container deployment (per spec's non-goals — no infra beyond Docker) makes
 * this correct; swap for a Redis-backed store if this is ever horizontally scaled.
 */
export async function perUserRateLimit(req: FastifyRequest): Promise<void> {
  const userId = req.userId;
  if (!userId) return; // requireAuth runs first in the preHandler chain and would have thrown already

  const limit = config.RATE_LIMIT_PER_USER_PER_MINUTE;
  const refillRatePerMs = limit / REFILL_WINDOW_MS;
  const now = Date.now();

  const existing = buckets.get(userId) ?? { tokens: limit, lastRefillMs: now };
  const elapsed = now - existing.lastRefillMs;
  const refilledTokens = Math.min(limit, existing.tokens + elapsed * refillRatePerMs);

  if (refilledTokens < 1) {
    const msUntilNextToken = (1 - refilledTokens) / refillRatePerMs;
    buckets.set(userId, { tokens: refilledTokens, lastRefillMs: now });
    throw new RateLimitError(Math.max(1, Math.ceil(msUntilNextToken / 1000)), "per-user rate limit exceeded");
  }

  buckets.set(userId, { tokens: refilledTokens - 1, lastRefillMs: now });
}
