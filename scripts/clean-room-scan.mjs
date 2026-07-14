import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const skipped = new Set([".git", ".next", "node_modules", "dist", "coverage"]);
const textExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".css", ".html", ".yml", ".yaml", ".sql"]);
const forbidden = [
  "bmV4dXM=",
  "bmV4dXN2Mw==",
  "aW5maW5pdGUgc3R1ZGlvcw==",
  "cmVhY3QtZmxvdw==",
  "QHN1cGFiYXNlL2F1dGg=",
].map((entry) => Buffer.from(entry, "base64").toString("utf8").toLowerCase());

const failures = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(path);
      continue;
    }
    if (!textExtensions.has(extname(entry.name)) && entry.name !== "Dockerfile") continue;
    const content = (await readFile(path, "utf8")).toLowerCase();
    for (const term of forbidden) if (content.includes(term)) failures.push(`${relative(root, path)} contains a forbidden dependency or legacy identifier`);
  }
}
await visit(root);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Clean-room source check passed.");
