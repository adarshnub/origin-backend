import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema/index.js";

const requiresSsl =
  env.NODE_ENV === "production" ||
  env.DATABASE_URL.includes("supabase.co") ||
  env.DATABASE_URL.includes("pooler.supabase.com") ||
  env.DATABASE_URL.includes("sslmode=require");

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.NODE_ENV === "production" ? 15 : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
