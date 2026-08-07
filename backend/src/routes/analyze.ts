import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { perUserRateLimit } from "../middleware/rateLimit.js";
import { prisma } from "../lib/prisma.js";
import { debitForAnalysis, getBalance, refundForAnalysis } from "../lib/ledger.js";
import { fetchImageAsBuffer } from "../lib/imageFetch.js";
import { getVisionProvider } from "../services/vision/index.js";
import { SUPPORTED_LANGUAGES } from "../services/vision/provider.js";
import { AppError, UpstreamProviderError, ValidationError } from "../lib/errors.js";

const AnalyzeBody = z
  .object({
    idempotencyKey: z.string().uuid(),
    sourceType: z.enum(["image_url", "screenshot"]),
    imageUrl: z.string().url().optional(),
    screenshotBase64: z.string().min(1).optional(),
    languages: z.array(z.enum(SUPPORTED_LANGUAGES)).min(1).max(SUPPORTED_LANGUAGES.length),
  })
  .refine((b) => (b.sourceType === "image_url" ? !!b.imageUrl : !!b.screenshotBase64), {
    message: "imageUrl is required when sourceType=image_url, screenshotBase64 when sourceType=screenshot",
  });

export async function analyzeRoutes(app: FastifyInstance): Promise<void> {
  app.post("/analyze", { preHandler: [requireAuth, perUserRateLimit] }, async (req, reply) => {
    const parsed = AnalyzeBody.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("invalid body", parsed.error.issues);
    const body = parsed.data;
    const userId = req.userId as string;

    const provider = getVisionProvider();

    // Step 1: check balance, debit, create pending request — all in one transaction.
    // A retried request with the same idempotencyKey lands here too and is handled below
    // instead of debiting again.
    const { request, replay } = await debitForAnalysis(prisma, {
      userId,
      idempotencyKey: body.idempotencyKey,
      sourceType: body.sourceType,
      sourceRef: body.sourceType === "image_url" ? body.imageUrl : undefined,
      provider: provider.name,
      model: provider.model,
      languages: body.languages,
    });

    if (replay) {
      if (request.status === "succeeded") {
        const withResults = await prisma.analysisRequest.findUniqueOrThrow({
          where: { id: request.id },
          include: { results: true },
        });
        return {
          requestId: request.id,
          status: "succeeded",
          replay: true,
          results: Object.fromEntries(
            withResults.results.map((r) => [r.language, { promptText: r.promptText, jsonStructured: r.jsonStructured }])
          ),
        };
      }
      if (request.status === "failed") {
        reply.code(409);
        return {
          requestId: request.id,
          status: "failed",
          replay: true,
          message: "this idempotencyKey already failed and was refunded; retry with a new idempotencyKey",
        };
      }
      // status === "pending": this key was debited but never completed (e.g. the
      // process died mid-flight) — fall through and actually run the analysis now,
      // reusing the existing request instead of debiting again.
    }

    // Step 2: call the vision provider outside the DB transaction — never hold a
    // transaction open across a slow external HTTP call.
    try {
      let imageBuffer: Buffer;
      let mimeType: string;
      if (body.sourceType === "image_url") {
        const fetched = await fetchImageAsBuffer(body.imageUrl as string);
        imageBuffer = fetched.buffer;
        mimeType = fetched.mimeType;
      } else {
        imageBuffer = Buffer.from(body.screenshotBase64 as string, "base64");
        mimeType = "image/png";
      }

      const result = await provider.analyzeImage(imageBuffer, mimeType, body.languages);

      // Step 3: success — persist results and mark succeeded.
      await prisma.$transaction(async (tx) => {
        await tx.analysisRequest.update({
          where: { id: request.id },
          data: { status: "succeeded", costUsd: result.costUsd, latencyMs: result.latencyMs },
        });
        await tx.analysisResult.createMany({
          data: Object.entries(result.resultsByLanguage).map(([language, r]) => ({
            requestId: request.id,
            language,
            promptText: r.promptText,
            jsonStructured: r.jsonStructured as Prisma.InputJsonValue,
          })),
        });
      });

      const balance = await getBalance(prisma, userId);

      req.log.info(
        {
          userId,
          provider: provider.name,
          model: provider.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          costUsd: result.costUsd,
          latencyMs: result.latencyMs,
          outcome: "succeeded",
        },
        "analyze_request"
      );

      return { requestId: request.id, status: "succeeded", replay: false, results: result.resultsByLanguage, balance };
    } catch (err) {
      // Step 4: provider/image-fetch failure or timeout — refund and mark failed.
      // A debited credit with no result is the bug this path exists to prevent.
      await refundForAnalysis(prisma, request.id, userId);

      req.log.warn(
        {
          userId,
          provider: provider.name,
          model: provider.model,
          outcome: "failed",
          error: (err as Error).message,
        },
        "analyze_request"
      );

      if (err instanceof AppError) throw err;
      throw new UpstreamProviderError(`analysis failed: ${(err as Error).message}`);
    }
  });
}
