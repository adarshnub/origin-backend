import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { projectCollaborators, projects, workspaceMembers } from "../db/schema/index.js";
import { AppError } from "../lib/api.js";

export type Role = "owner" | "admin" | "editor" | "viewer";
const rolePower: Record<Role, number> = { owner: 4, admin: 3, editor: 2, viewer: 1 };

export async function requireWorkspaceRole(userId: string, workspaceId: string, minimum: Role) {
  const [membership] = await db.select({ role: workspaceMembers.role }).from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId))).limit(1);
  if (!membership || rolePower[membership.role] < rolePower[minimum]) {
    throw new AppError(403, "FORBIDDEN", "You do not have permission for this workspace.");
  }
  return membership.role;
}

export async function requireProjectRole(userId: string, projectId: string, minimum: Role) {
  const [project] = await db.select({ workspaceId: projects.workspaceId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  const [membership] = await db.select({ role: workspaceMembers.role }).from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, project.workspaceId))).limit(1);
  const [collaborator] = await db.select({ role: projectCollaborators.role }).from(projectCollaborators)
    .where(and(eq(projectCollaborators.userId, userId), eq(projectCollaborators.projectId, projectId))).limit(1);
  const power = Math.max(membership ? rolePower[membership.role] : 0, collaborator ? rolePower[collaborator.role] : 0);
  if (power < rolePower[minimum]) throw new AppError(403, "FORBIDDEN", "You do not have permission for this project.");
  return project;
}

export async function accessibleWorkspaceIds(userId: string) {
  const rows = await db.select({ id: workspaceMembers.workspaceId }).from(workspaceMembers).where(eq(workspaceMembers.userId, userId));
  return rows.map((row) => row.id);
}

export async function assertWorkspaceInList(workspaceId: string, allowedIds: string[]) {
  if (!allowedIds.length || !allowedIds.includes(workspaceId)) throw new AppError(403, "FORBIDDEN", "Workspace access denied.");
  return inArray(workspaceMembers.workspaceId, allowedIds);
}
