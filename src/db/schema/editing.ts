import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { projects } from "./creation.js";
import { workspaces } from "./teams.js";

export interface TimelineDocumentRecord {
  schemaVersion: 1;
  durationMs: number;
  tracks: Array<{ id: string; kind: "video" | "audio" | "caption" | "overlay"; name: string; muted?: boolean }>;
  items: Array<Record<string, unknown>>;
  output: { width: number; height: number; fps: number };
}

export const videoProjects = pgTable(
  "video_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    sourceProjectId: uuid("source_project_id").references(() => projects.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    currentVersionId: uuid("current_version_id"),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("video_projects_workspace_idx").on(table.workspaceId, table.updatedAt)],
);

export const videoProjectVersions = pgTable("video_project_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoProjectId: uuid("video_project_id").notNull().references(() => videoProjects.id, { onDelete: "cascade" }),
  parentVersionId: uuid("parent_version_id"),
  timeline: jsonb("timeline").$type<TimelineDocumentRecord>().notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const renderJobs = pgTable(
  "render_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoProjectId: uuid("video_project_id").notNull().references(() => videoProjects.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").notNull().references(() => videoProjectVersions.id),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    status: text("status", { enum: ["queued", "rendering", "succeeded", "failed", "canceled"] }).notNull().default("queued"),
    progress: text("progress").notNull().default("0"),
    lambdaRenderId: text("lambda_render_id"),
    lambdaBucket: text("lambda_bucket"),
    outputStoragePath: text("output_storage_path"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("render_jobs_status_idx").on(table.status, table.createdAt)],
);
