import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { verifyGoogleIdToken } from "../lib/googleAuth.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt.js";
import { UnauthorizedError, ValidationError } from "../lib/errors.js";

const GoogleAuthBody = z.object({ idToken: z.string().min(1) });
const RefreshBody = z.object({ refreshToken: z.string().min(1) });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Exchanges a Google ID token (from chrome.identity.getAuthToken on the extension side)
  // for our own short-lived access JWT + longer-lived refresh JWT. No password flow.
  app.post("/auth/google", async (req) => {
    const parsed = GoogleAuthBody.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("invalid body", parsed.error.issues);

    const identity = await verifyGoogleIdToken(parsed.data.idToken);

    const user = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { googleSub: identity.sub } });
      if (existing) return existing;

      const created = await tx.user.create({
        data: { googleSub: identity.sub, email: identity.email },
      });

      if (config.SIGNUP_BONUS_CREDITS > 0) {
        await tx.creditLedgerEntry.create({
          data: {
            userId: created.id,
            delta: config.SIGNUP_BONUS_CREDITS,
            reason: "signup_bonus",
            balanceAfter: config.SIGNUP_BONUS_CREDITS,
          },
        });
      }

      return created;
    });

    const accessToken = signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = signRefreshToken({ sub: user.id });

    return { accessToken, refreshToken, user: { id: user.id, email: user.email } };
  });

  app.post("/auth/refresh", async (req) => {
    const parsed = RefreshBody.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("invalid body", parsed.error.issues);

    let payload;
    try {
      payload = verifyRefreshToken(parsed.data.refreshToken);
    } catch {
      throw new UnauthorizedError("invalid or expired refresh token");
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedError("user not found");

    const accessToken = signAccessToken({ sub: user.id, email: user.email });
    return { accessToken };
  });
}
