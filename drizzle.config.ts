import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL ?? "";
const parsedDatabaseUrl = databaseUrl ? new URL(databaseUrl) : null;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./migrations",
  dbCredentials: parsedDatabaseUrl
    ? {
        host: parsedDatabaseUrl.hostname,
        port: Number(parsedDatabaseUrl.port || 5432),
        user: decodeURIComponent(parsedDatabaseUrl.username),
        password: decodeURIComponent(parsedDatabaseUrl.password),
        database: parsedDatabaseUrl.pathname.replace(/^\//, ""),
        ssl: databaseUrl.includes("supabase") ? "require" : false,
      }
    : { url: databaseUrl },
  strict: true,
  verbose: true,
});
