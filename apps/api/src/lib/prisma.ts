import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client.js";

function databaseUrl(): string {
  return process.env.DATABASE_URL ?? `file:${resolve(import.meta.dirname, "../../.data/app.sqlite")}`;
}

function ensureSqliteDir(url: string): void {
  if (!url.startsWith("file:") || url === "file::memory:") return;
  const dbPath = url.replace(/^file:/, "");
  if (dbPath && dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
}

const url = databaseUrl();
ensureSqliteDir(url);

export const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url }),
});
