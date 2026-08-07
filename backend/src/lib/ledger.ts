import type { Prisma, PrismaClient } from "@prisma/client";
import { InsufficientCreditsError, ValidationError } from "./errors.js";

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export interface DebitParams {
  userId: string;
  idempotencyKey: string;
  sourceType: "image_url" | "screenshot";
  sourceRef?: string;
  provider: string;
  model: string;
  languages: string[];
  amount?: number;
}

export async function getBalance(prisma: PrismaClientOrTx, userId: string): Promise<number> {
  const agg = await prisma.creditLedgerEntry.aggregate({
    where: { userId },
    _sum: { delta: true },
  });
  return agg._sum.delta ?? 0;
}

/**
 * Debits one request's worth of credits and creates the pending AnalysisRequest, atomically.
 *
 * The balance is derived from SUM(delta) rather than a mutable column, which makes it
 * race-vulnerable to two concurrent calls both reading the same balance before either
 * commits. `pg_advisory_xact_lock` serializes debits per-user (held only for the
 * transaction's lifetime, released automatically on commit/rollback) without locking
 * the whole ledger table or blocking other users.
 */
export async function debitForAnalysis(
  prisma: PrismaClient,
  params: DebitParams
): Promise<{ request: Prisma.AnalysisRequestGetPayload<object>; replay: boolean }> {
  const amount = params.amount ?? 1;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.userId}))`;

    const existing = await tx.analysisRequest.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) {
      if (existing.userId !== params.userId) {
        throw new ValidationError("idempotencyKey already used by a different user");
      }
      return { request: existing, replay: true };
    }

    const balance = await getBalance(tx, params.userId);
    if (balance < amount) {
      throw new InsufficientCreditsError(`insufficient credits: balance=${balance}, required=${amount}`);
    }

    const request = await tx.analysisRequest.create({
      data: {
        userId: params.userId,
        idempotencyKey: params.idempotencyKey,
        sourceType: params.sourceType,
        sourceRef: params.sourceRef,
        provider: params.provider,
        model: params.model,
        languages: params.languages,
        status: "pending",
      },
    });

    const newBalance = balance - amount;
    await tx.creditLedgerEntry.create({
      data: {
        userId: params.userId,
        delta: -amount,
        reason: "analysis_debit",
        balanceAfter: newBalance,
        requestId: request.id,
      },
    });

    return { request, replay: false };
  });
}

/**
 * Compensating credit for a request that debited but never produced a result
 * (provider failure/timeout/image-fetch failure). Marks the request "failed" —
 * a debited credit with no result and no refund is the bug this exists to prevent.
 */
export async function refundForAnalysis(
  prisma: PrismaClient,
  requestId: string,
  userId: string,
  amount = 1
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

    const balance = await getBalance(tx, userId);
    const newBalance = balance + amount;

    await tx.creditLedgerEntry.create({
      data: {
        userId,
        delta: amount,
        reason: "analysis_refund",
        balanceAfter: newBalance,
        requestId,
      },
    });

    await tx.analysisRequest.update({
      where: { id: requestId },
      data: { status: "failed" },
    });
  });
}

/** Stand-in for what a future Stripe webhook handler would call internally. */
export async function grantCredits(
  prisma: PrismaClient,
  userId: string,
  amount: number,
  reason: string
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const balance = (await getBalance(tx, userId)) + amount;
    await tx.creditLedgerEntry.create({
      data: { userId, delta: amount, reason, balanceAfter: balance },
    });
    return balance;
  });
}
