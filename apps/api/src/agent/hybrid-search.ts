import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";
import type { LegalDocumentNode } from "@chatconstituicao/shared";
import type { LegalDocumentConfig } from "../data/documents.js";

const VECTOR_DIMENSIONS = 384;
const DEFAULT_LIMIT = 12;
const NEIGHBOR_WINDOW = 8;
const DB_PATH =
  process.env.LEGAL_SEARCH_DB_PATH ?? resolve(import.meta.dirname, "../../.data/legal-search.sqlite");

const stopwords = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "essa",
  "esse",
  "esta",
  "este",
  "eu",
  "foi",
  "me",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "ou",
  "para",
  "por",
  "que",
  "se",
  "sem",
  "um",
  "uma",
]);

type IndexedDocument = {
  db: DatabaseSync;
  articleByRowid: Map<number, LegalDocumentNode>;
};

const indexes = new WeakMap<LegalDocumentConfig, IndexedDocument>();

function collectArticles(node: LegalDocumentNode, out: LegalDocumentNode[] = []): LegalDocumentNode[] {
  if (node.content && node.articleNumber) out.push(node);
  for (const child of node.children ?? []) collectArticles(child, out);
  return out;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopwords.has(token));
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function embedText(value: string): Uint8Array {
  const vector = new Float32Array(VECTOR_DIMENSIONS);
  for (const token of tokenize(value)) {
    const hash = hashToken(token);
    const index = hash % VECTOR_DIMENSIONS;
    vector[index] += hash & 1 ? 1 : -1;
  }

  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vector.length; i++) vector[i] /= norm;

  return new Uint8Array(vector.buffer);
}

function ftsQuery(question: string): string {
  const tokens = [...new Set(tokenize(question))].slice(0, 10);
  return tokens.map((token) => `${token}*`).join(" OR ");
}

function getIndex(document: LegalDocumentConfig): IndexedDocument {
  const existing = indexes.get(document);
  if (existing) return existing;

  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH, { allowExtension: true });
  sqliteVec.load(db);

  const prefix = document.id.replace(/[^a-z0-9_]/gi, "_");
  const articlesTable = `${prefix}_articles`;
  const ftsTable = `${prefix}_articles_fts`;
  const vecTable = `${prefix}_article_vecs`;

  db.exec(`
    create table if not exists ${articlesTable} (
      rowid integer primary key,
      id text not null unique,
      title text not null,
      content text not null
    );
    create virtual table if not exists ${ftsTable}
      using fts5(title, content, content='${articlesTable}', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
    create virtual table if not exists ${vecTable}
      using vec0(embedding float[${VECTOR_DIMENSIONS}]);
  `);

  const count = db.prepare(`select count(*) as count from ${articlesTable}`).get() as { count: number };
  const articles = collectArticles(document.root);
  const articleByRowid = new Map<number, LegalDocumentNode>();

  if (count.count !== articles.length) {
    db.exec(`delete from ${articlesTable}; delete from ${ftsTable}; delete from ${vecTable};`);
    const insertArticle = db.prepare(`insert into ${articlesTable}(rowid, id, title, content) values (?, ?, ?, ?)`);
    const insertFts = db.prepare(`insert into ${ftsTable}(rowid, title, content) values (?, ?, ?)`);
    const insertVec = db.prepare(`insert into ${vecTable}(rowid, embedding) values (?, ?)`);

    db.exec("begin");
    try {
      for (let i = 0; i < articles.length; i++) {
        const rowid = i + 1;
        const article = articles[i];
        insertArticle.run(rowid, article.id, article.title, article.content ?? "");
        insertFts.run(rowid, article.title, article.content ?? "");
        insertVec.run(BigInt(rowid), embedText(`${article.title}\n${article.content ?? ""}`));
      }
      db.exec("commit");
    } catch (err) {
      db.exec("rollback");
      throw err;
    }
  }

  for (let i = 0; i < articles.length; i++) {
    articleByRowid.set(i + 1, articles[i]);
  }

  const indexed = { db, articleByRowid };
  indexes.set(document, indexed);
  return indexed;
}

function addNeighborScores(
  scores: Map<number, number>,
  articleByRowid: Map<number, LegalDocumentNode>,
  seedRowids: number[],
): void {
  for (const rowid of seedRowids) {
    const article = articleByRowid.get(rowid);
    if (!article?.articleNumber) continue;

    for (let offset = -NEIGHBOR_WINDOW; offset <= NEIGHBOR_WINDOW; offset++) {
      if (offset === 0) continue;
      const neighbor = articleByRowid.get(rowid + offset);
      if (!neighbor?.articleNumber) continue;

      const numericDistance = Math.abs(neighbor.articleNumber - article.articleNumber);
      if (numericDistance > NEIGHBOR_WINDOW) continue;

      scores.set(rowid + offset, (scores.get(rowid + offset) ?? 0) + 1 / (90 + numericDistance));
    }
  }
}

export function hybridSearchArticles(
  document: LegalDocumentConfig,
  question: string,
  limit = DEFAULT_LIMIT,
): LegalDocumentNode[] {
  const { db, articleByRowid } = getIndex(document);
  const prefix = document.id.replace(/[^a-z0-9_]/gi, "_");
  const ftsTable = `${prefix}_articles_fts`;
  const vecTable = `${prefix}_article_vecs`;
  const scores = new Map<number, number>();

  const vectorRows = db
    .prepare(`select rowid, distance from ${vecTable} where embedding match ? order by distance limit ?`)
    .all(embedText(question), limit * 2) as { rowid: number; distance: number }[];

  vectorRows.forEach((row, index) => {
    scores.set(row.rowid, (scores.get(row.rowid) ?? 0) + 1 / (60 + index + 1));
  });
  const seedRowids = vectorRows.map((row) => row.rowid);

  const query = ftsQuery(question);
  if (query) {
    try {
      const ftsRows = db
        .prepare(`select rowid, bm25(${ftsTable}) as rank from ${ftsTable} where ${ftsTable} match ? order by rank limit ?`)
        .all(query, limit * 2) as { rowid: number; rank: number }[];
      ftsRows.forEach((row, index) => {
        scores.set(row.rowid, (scores.get(row.rowid) ?? 0) + 1 / (60 + index + 1));
      });
      seedRowids.push(...ftsRows.map((row) => row.rowid));
    } catch {
      // FTS is a recall boost. If the user text cannot be represented as a valid FTS query, keep vector-only results.
    }
  }

  addNeighborScores(scores, articleByRowid, seedRowids);

  const articleNumberMatches = [...question.matchAll(/\b(\d{1,4})\s*(?:\.?\s*º|o)?\b/g)].map((match) => Number(match[1]));
  if (articleNumberMatches.length) {
    for (const [rowid, article] of articleByRowid) {
      if (article.articleNumber && articleNumberMatches.includes(article.articleNumber)) {
        scores.set(rowid, (scores.get(rowid) ?? 0) + 1);
      }
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([rowid]) => articleByRowid.get(rowid))
    .filter((article): article is LegalDocumentNode => Boolean(article));
}
