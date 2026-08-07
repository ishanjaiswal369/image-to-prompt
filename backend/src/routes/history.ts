import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { ValidationError } from "../lib/errors.js";

const HistoryQuery = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function historyRoutes(app: FastifyInstance): Promise<void> {
  app.get("/history", { preHandler: requireAuth }, async (req) => {
    const parsed = HistoryQuery.safeParse(req.query);
    if (!parsed.success) throw new ValidationError("invalid query", parsed.error.issues);
    const { cursor, limit } = parsed.data;
    const userId = req.userId as string;

    const requests = await prisma.analysisRequest.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { results: true },
    });

    const hasMore = requests.length > limit;
    const page = hasMore ? requests.slice(0, limit) : requests;
    const last = page[page.length - 1];

    return {
      items: page.map((r) => ({
        id: r.id,
        sourceType: r.sourceType,
        status: r.status,
        languages: r.languages,
        createdAt: r.createdAt,
        results: Object.fromEntries(
          r.results.map((res) => [res.language, { promptText: res.promptText, jsonStructured: res.jsonStructured }])
        ),
      })),
      nextCursor: hasMore && last ? last.id : null,
    };
  });
}
