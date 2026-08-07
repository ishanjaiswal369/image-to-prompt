import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { grantCredits } from "../lib/ledger.js";
import { NotFoundError, UnauthorizedError, ValidationError } from "../lib/errors.js";

const GrantBody = z.object({
  userId: z.string().uuid(),
  amount: z.number().int().refine((n) => n !== 0, "amount must be non-zero"),
  reason: z.string().min(1).default("manual_grant"),
});

/**
 * Dev-only stand-in for what will later be a Stripe webhook handler. Shape
 * ({userId, amount, reason}) mirrors what that handler will eventually call internally,
 * so wiring up real payments later is additive, not a rewrite of this path.
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.post("/admin/credits/grant", async (req) => {
    const token = req.headers["x-admin-token"];
    if (token !== config.ADMIN_TOKEN) {
      throw new UnauthorizedError("invalid admin token");
    }

    const parsed = GrantBody.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("invalid body", parsed.error.issues);

    const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
    if (!user) throw new NotFoundError("user not found");

    const balance = await grantCredits(prisma, parsed.data.userId, parsed.data.amount, parsed.data.reason);
    return { balance };
  });
}
