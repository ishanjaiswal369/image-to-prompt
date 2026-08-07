import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { debitForAnalysis, getBalance, grantCredits, refundForAnalysis } from "../src/lib/ledger.js";

// Runs against the real dev Postgres (DATABASE_URL) — the ledger transaction logic
// is the one path this build must not get sloppy on, so it isn't mocked.
const prisma = new PrismaClient();

async function createTestUser(bonus: number) {
  const user = await prisma.user.create({
    data: {
      googleSub: `test-${crypto.randomUUID()}`,
      email: `${crypto.randomUUID()}@test.local`,
    },
  });
  if (bonus > 0) {
    await prisma.creditLedgerEntry.create({
      data: { userId: user.id, delta: bonus, reason: "signup_bonus", balanceAfter: bonus },
    });
  }
  return user;
}

function debitParams(userId: string, idempotencyKey = crypto.randomUUID()) {
  return {
    userId,
    idempotencyKey,
    sourceType: "screenshot" as const,
    provider: "gemini",
    model: "gemini-2.5-flash",
    languages: ["en"],
  };
}

describe("ledger", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("debits one credit and creates a pending request", async () => {
    const user = await createTestUser(5);
    const { request, replay } = await debitForAnalysis(prisma, debitParams(user.id));

    expect(replay).toBe(false);
    expect(request.status).toBe("pending");
    expect(await getBalance(prisma, user.id)).toBe(4);
  });

  it("rejects a debit when balance is insufficient, without creating a request", async () => {
    const user = await createTestUser(0);

    await expect(debitForAnalysis(prisma, debitParams(user.id))).rejects.toThrow(/insufficient credits/);
    expect(await getBalance(prisma, user.id)).toBe(0);
  });

  it("refunds on provider failure: restores the balance and marks the request failed", async () => {
    const user = await createTestUser(3);
    const { request } = await debitForAnalysis(prisma, debitParams(user.id));
    expect(await getBalance(prisma, user.id)).toBe(2);

    await refundForAnalysis(prisma, request.id, user.id);

    expect(await getBalance(prisma, user.id)).toBe(3);
    const updated = await prisma.analysisRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(updated.status).toBe("failed");

    const refundEntry = await prisma.creditLedgerEntry.findFirst({
      where: { requestId: request.id, reason: "analysis_refund" },
    });
    expect(refundEntry?.delta).toBe(1);
  });

  it("replays an existing request on a retried idempotencyKey instead of double-charging", async () => {
    const user = await createTestUser(5);
    const idempotencyKey = crypto.randomUUID();

    const first = await debitForAnalysis(prisma, debitParams(user.id, idempotencyKey));
    expect(first.replay).toBe(false);
    expect(await getBalance(prisma, user.id)).toBe(4);

    const second = await debitForAnalysis(prisma, debitParams(user.id, idempotencyKey));
    expect(second.replay).toBe(true);
    expect(second.request.id).toBe(first.request.id);
    expect(await getBalance(prisma, user.id)).toBe(4); // unchanged: no double debit
  });

  it("rejects concurrent debits from the same user beyond their balance (no negative balance)", async () => {
    const user = await createTestUser(1);

    const results = await Promise.allSettled([
      debitForAnalysis(prisma, debitParams(user.id)),
      debitForAnalysis(prisma, debitParams(user.id)),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(await getBalance(prisma, user.id)).toBe(0);
  });

  it("grantCredits increases balance and records a ledger entry", async () => {
    const user = await createTestUser(0);
    const balance = await grantCredits(prisma, user.id, 10, "manual_grant");

    expect(balance).toBe(10);
    expect(await getBalance(prisma, user.id)).toBe(10);
  });
});
