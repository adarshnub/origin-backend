import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { providerCostEvents, providerRateVersions } from "../db/schema/index.js";

export async function recordGenerationCost(input: {
  jobId: string; workspaceId: string; projectId: string | null; userId: string; providerKey: string; modelKey: string; quantity: number;
}) {
  const [rate] = await db.select().from(providerRateVersions).where(and(
    eq(providerRateVersions.providerKey, input.providerKey), eq(providerRateVersions.modelKey, input.modelKey),
    lte(providerRateVersions.effectiveAt, new Date()), or(isNull(providerRateVersions.retiredAt), gt(providerRateVersions.retiredAt, new Date())),
  )).orderBy(desc(providerRateVersions.effectiveAt)).limit(1);
  const quantity = Math.max(0, input.quantity);
  const estimatedUsd = (Number(rate?.priceUsd ?? 0) * quantity).toFixed(8);
  await db.insert(providerCostEvents).values({
    workspaceId: input.workspaceId, projectId: input.projectId, userId: input.userId, generationJobId: input.jobId,
    providerKey: input.providerKey, modelKey: input.modelKey, quantity: String(quantity), estimatedUsd,
    rateVersionId: rate?.id ?? null, idempotencyKey: `generation:${input.jobId}`,
  }).onConflictDoNothing({ target: providerCostEvents.idempotencyKey });
}
