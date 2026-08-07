import type { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/auth.js";
import { getBalance } from "../lib/ledger.js";
import { prisma } from "../lib/prisma.js";

export async function creditsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/credits/balance", { preHandler: requireAuth }, async (req) => {
    const balance = await getBalance(prisma, req.userId as string);
    return { balance };
  });
}
