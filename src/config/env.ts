import "dotenv/config";
import { z } from "zod";

const emptyToUndefined = (value: unknown) => value === "" ? undefined : value;
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_ORIGIN: z.url().default("http://localhost:3000"),
  API_ORIGIN: z.url().default("http://localhost:4000"),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/origin"),
  SESSION_COOKIE_NAME: z.string().min(1).default("origin_session"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_FROM: z.string().default("Origin Studios <hello@example.com>"),
  SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  SUPABASE_ASSETS_BUCKET: z.string().default("origin-assets"),
  AWS_REGION: optionalString,
  REMOTION_FUNCTION_NAME: optionalString,
  REMOTION_SERVE_URL: optionalString,
  REMOTION_S3_BUCKET: optionalString,
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;
