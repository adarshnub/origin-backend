import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { projects } from "./creation.js";
import { workspaces } from "./teams.js";

export const providerModels = pgTable(
  "provider_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerKey: text("provider_key").notNull(),
    modelKey: text("model_key").notNull(),
    displayName: text("display_name").notNull(),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    allowedRatios: jsonb("allowed_ratios").$type<string[]>().notNull().default([]),
    allowedDurations: jsonb("allowed_durations").$type<number[]>().notNull().default([]),
    configurationSchema: jsonb("configuration_schema").$type<Record<string, unknown>>().notNull().default({}),
    enabled: integer("enabled").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("provider_models_key_idx").on(table.providerKey, table.modelKey)],
);

export const shotDesignRuns = pgTable(
  "shot_design_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    workflow: text("workflow", {
      enum: ["storyboard", "voiceover", "multi_model", "continuity", "relight", "partner", "billboard"],
    }).notNull(),
    prompt: text("prompt").notNull(),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    referenceAssetIds: jsonb("reference_asset_ids").$type<string[]>().notNull().default([]),
    status: text("status", { enum: ["draft", "queued", "running", "succeeded", "failed", "canceled"] }).notNull().default("draft"),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("shot_design_runs_project_idx").on(table.projectId, table.createdAt)],
);

export const shotPlanItems = pgTable("shot_plan_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => shotDesignRuns.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    runId: uuid("run_id").references(() => shotDesignRuns.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    workflow: text("workflow").notNull(),
    providerKey: text("provider_key").notNull(),
    modelKey: text("model_key").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", { enum: ["queued", "running", "retrying", "succeeded", "failed", "canceled"] }).notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    request: jsonb("request").$type<Record<string, unknown>>().notNull(),
    providerRequestId: text("provider_request_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("generation_jobs_idempotency_idx").on(table.workspaceId, table.idempotencyKey),
    index("generation_jobs_status_idx").on(table.status, table.createdAt),
  ],
);

export const generationOutputs = pgTable("generation_outputs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => generationJobs.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id"),
  kind: text("kind", { enum: ["image", "video", "audio", "plan", "text"] }).notNull(),
  uri: text("uri"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providerRateVersions = pgTable("provider_rate_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerKey: text("provider_key").notNull(),
  modelKey: text("model_key").notNull(),
  unit: text("unit").notNull(),
  priceUsd: numeric("price_usd", { precision: 14, scale: 8 }).notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
});

export const providerCostEvents = pgTable(
  "provider_cost_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    projectId: uuid("project_id").references(() => projects.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    generationJobId: uuid("generation_job_id").references(() => generationJobs.id),
    renderJobId: uuid("render_job_id"),
    providerKey: text("provider_key").notNull(),
    modelKey: text("model_key").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(),
    estimatedUsd: numeric("estimated_usd", { precision: 14, scale: 8 }).notNull(),
    actualUsd: numeric("actual_usd", { precision: 14, scale: 8 }),
    currency: text("currency").notNull().default("USD"),
    rateVersionId: uuid("rate_version_id").references(() => providerRateVersions.id),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("provider_cost_workspace_time_idx").on(table.workspaceId, table.occurredAt)],
);
