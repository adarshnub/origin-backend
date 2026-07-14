import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { providerCostEvents } from "../db/schema/index.js";
import { sendData } from "../lib/api.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceRole } from "../services/access-service.js";

const router = Router();
router.use(requireAuth);

router.get("/summary", async (req, res) => {
  const workspaceId = z.uuid().parse(req.query.workspaceId);
  await requireWorkspaceRole(req.auth!.userId, workspaceId, "owner");
  const rows = await db.select({ providerKey: providerCostEvents.providerKey, estimatedUsd: sql<string>`sum(${providerCostEvents.estimatedUsd})`, actualUsd: sql<string>`sum(coalesce(${providerCostEvents.actualUsd}, ${providerCostEvents.estimatedUsd}))`, events: sql<number>`count(*)::int` })
    .from(providerCostEvents).where(eq(providerCostEvents.workspaceId, workspaceId)).groupBy(providerCostEvents.providerKey);
  return sendData(res, rows);
});

router.get("/events", async (req, res) => {
  const workspaceId = z.uuid().parse(req.query.workspaceId);
  await requireWorkspaceRole(req.auth!.userId, workspaceId, "owner");
  const rows = await db.select().from(providerCostEvents).where(eq(providerCostEvents.workspaceId, workspaceId)).orderBy(desc(providerCostEvents.occurredAt)).limit(250);
  return sendData(res, rows);
});

export const costsRouter = router;
