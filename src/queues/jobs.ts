import { PgBoss } from "pg-boss";
import { env } from "../config/env.js";

let boss: PgBoss | null = null;

export async function getBoss() {
  if (!boss) {
    boss = new PgBoss(env.DATABASE_URL);
    boss.on("error", (error: Error) => console.error("Queue error", error));
    await boss.start();
    await Promise.all(["generation", "render", "email"].map((name) => boss!.createQueue(name)));
  }
  return boss;
}

export async function stopBoss() {
  if (boss) await boss.stop();
  boss = null;
}
