import argon2 from "argon2";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { emailTokens, passwordCredentials, users, workspaceMembers, workspaces, sessions } from "../db/schema/index.js";
import { AppError } from "../lib/api.js";
import { createOpaqueToken, hashToken } from "../lib/crypto.js";
import { slugify } from "../lib/slug.js";
import { sendPasswordResetEmail } from "./email-service.js";

const passwordOptions = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

async function createEmailToken(userId: string, kind: "verify_email" | "reset_password", minutes: number) {
  const token = createOpaqueToken();
  await db.insert(emailTokens).values({
    userId,
    kind,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + minutes * 60_000),
  });
  return token;
}

export async function registerUser(input: { email: string; password: string; displayName: string }) {
  const email = input.email.trim().toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) throw new AppError(409, "ACCOUNT_EXISTS", "An account with this email already exists.");

  const passwordHash = await argon2.hash(input.password, passwordOptions);
  const user = await db.transaction(async (tx) => {
    const [created] = await tx.insert(users).values({
      email,
      displayName: input.displayName.trim(),
      emailVerified: true,
    }).returning();
    if (!created) throw new AppError(500, "ACCOUNT_CREATE_FAILED", "Could not create the account.");
    await tx.insert(passwordCredentials).values({ userId: created.id, passwordHash });
    const [workspace] = await tx.insert(workspaces).values({
      name: `${created.displayName}'s Studio`,
      slug: `${slugify(created.displayName) || "studio"}-${created.id.slice(0, 8)}`,
      kind: "personal",
    }).returning();
    if (!workspace) throw new AppError(500, "WORKSPACE_CREATE_FAILED", "Could not create the workspace.");
    await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: created.id, role: "owner" });
    return created;
  });

  return { id: user.id, email: user.email, displayName: user.displayName, emailVerified: true };
}

export async function authenticateUser(emailInput: string, password: string) {
  const [row] = await db
    .select({ user: users, credential: passwordCredentials })
    .from(users)
    .innerJoin(passwordCredentials, eq(passwordCredentials.userId, users.id))
    .where(and(eq(users.email, emailInput.trim().toLowerCase()), isNull(users.deletedAt)))
    .limit(1);
  if (!row || !(await argon2.verify(row.credential.passwordHash, password))) {
    throw new AppError(401, "INVALID_CREDENTIALS", "The email or password is incorrect.");
  }
  return row.user;
}

export async function verifyEmail(token: string) {
  const [row] = await db.select().from(emailTokens).where(and(
    eq(emailTokens.tokenHash, hashToken(token)), eq(emailTokens.kind, "verify_email"),
    gt(emailTokens.expiresAt, new Date()), isNull(emailTokens.consumedAt),
  )).limit(1);
  if (!row) throw new AppError(400, "TOKEN_INVALID", "The verification link is invalid or expired.");
  await db.transaction(async (tx) => {
    await tx.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, row.userId));
    await tx.update(emailTokens).set({ consumedAt: new Date() }).where(eq(emailTokens.id, row.id));
  });
}

export async function requestPasswordReset(emailInput: string) {
  const [user] = await db.select().from(users).where(eq(users.email, emailInput.trim().toLowerCase())).limit(1);
  if (!user) return;
  const token = await createEmailToken(user.id, "reset_password", 30);
  await sendPasswordResetEmail(user.email, token);
}

export async function resetPassword(token: string, password: string) {
  const [row] = await db.select().from(emailTokens).where(and(
    eq(emailTokens.tokenHash, hashToken(token)), eq(emailTokens.kind, "reset_password"),
    gt(emailTokens.expiresAt, new Date()), isNull(emailTokens.consumedAt),
  )).limit(1);
  if (!row) throw new AppError(400, "TOKEN_INVALID", "The reset link is invalid or expired.");
  const passwordHash = await argon2.hash(password, passwordOptions);
  await db.transaction(async (tx) => {
    await tx.update(passwordCredentials).set({ passwordHash, passwordChangedAt: new Date() }).where(eq(passwordCredentials.userId, row.userId));
    await tx.update(emailTokens).set({ consumedAt: new Date() }).where(eq(emailTokens.id, row.id));
    await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, row.userId));
  });
}
