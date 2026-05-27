import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";
import type { LegalDocumentNode } from "@chatconstituicao/shared";
import type { LegalDocumentConfig } from "../data/documents.js";

const DEFAULT_LIMIT = 12;
const NEIGHBOR_WINDOW = 8;
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_EMBEDDING_BATCH_SIZE = 64;
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
  embeddingDimensions: number;
};

type HybridSearchTables = {
  articlesTable: string;
  ftsTable: string;
  vecTable: string;
  metaTable: string;
};

export type HybridSearchOptions = {
  limit?: number;
  minScore?: number;
};

export type ScoredLegalDocumentArticle = {
  article: LegalDocumentNode;
  score: number;
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

function ftsQuery(question: string): string {
  const tokens = [...new Set(tokenize(question))].slice(0, 10);
  return tokens.map((token) => `${token}*`).join(" OR ");
}

function embeddingBaseUrl(): string {
  const baseUrl =
    process.env.LEGAL_EMBEDDING_BASE_URL ??
    process.env.BENCHMARK_OPENAI_BASE_URL ??
    (process.env.AI_GATEWAY_API_KEY ? "https://ai-gateway.vercel.sh/v1" : undefined);
  if (!baseUrl) {
    throw new Error(
      "Hybrid semantic search requires a real embeddings endpoint. Set LEGAL_EMBEDDING_BASE_URL or BENCHMARK_OPENAI_BASE_URL.",
    );
  }
  return baseUrl.replace(/\/+$/, "");
}

function embeddingModel(): string {
  return (
    process.env.LEGAL_EMBEDDING_MODEL ??
    process.env.BENCHMARK_EMBEDDING_MODEL ??
    (process.env.AI_GATEWAY_API_KEY ? "openai/text-embedding-3-small" : DEFAULT_EMBEDDING_MODEL)
  );
}

function embeddingDimensions(): number {
  const value =
    process.env.LEGAL_EMBEDDING_DIMENSIONS ?? process.env.BENCHMARK_EMBEDDING_DIMENSIONS ?? `${DEFAULT_EMBEDDING_DIMENSIONS}`;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid embedding dimension: ${value}`);
  }
  return parsed;
}

function embeddingBatchSize(): number {
  const value = process.env.LEGAL_EMBEDDING_BATCH_SIZE ?? process.env.BENCHMARK_EMBEDDING_BATCH_SIZE;
  const parsed = value ? Number.parseInt(value, 10) : DEFAULT_EMBEDDING_BATCH_SIZE;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EMBEDDING_BATCH_SIZE;
}

function embeddingApiKey(): string {
  return (
    process.env.LEGAL_EMBEDDING_API_KEY ??
    process.env.BENCHMARK_OPENAI_API_KEY ??
    process.env.AI_GATEWAY_API_KEY ??
    process.env.OPENAI_API_KEY ??
    "vibeproxy"
  );
}

function embeddingConfigKey(articleCount: number): string {
  return JSON.stringify({
    provider: embeddingBaseUrl(),
    model: embeddingModel(),
    dimensions: embeddingDimensions(),
    articleCount,
  });
}

function embeddingToBuffer(vector: number[], expectedDimensions: number): Uint8Array {
  if (vector.length !== expectedDimensions) {
    throw new Error(
      `Embedding endpoint returned ${vector.length} dimensions, but sqlite-vec index expects ${expectedDimensions}. Set LEGAL_EMBEDDING_DIMENSIONS to match the model.`,
    );
  }
  return new Uint8Array(Float32Array.from(vector).buffer);
}

async function fetchEmbeddingBatch(inputs: string[]): Promise<number[][]> {
  const response = await fetch(`${embeddingBaseUrl()}/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${embeddingApiKey()}`,
    },
    body: JSON.stringify({
      model: embeddingModel(),
      input: inputs,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Embedding request failed (${response.status}): ${message.slice(0, 500)}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[]; index?: number }>;
  };
  const rows = payload.data ?? [];
  if (rows.length !== inputs.length) {
    throw new Error(`Embedding endpoint returned ${rows.length} rows for ${inputs.length} inputs.`);
  }

  return rows
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((row) => {
      if (!row.embedding) throw new Error("Embedding endpoint returned a row without an embedding.");
      return row.embedding;
    });
}

async function embedTexts(inputs: string[]): Promise<number[][]> {
  const batchSize = embeddingBatchSize();
  const embeddings: number[][] = [];
  for (let i = 0; i < inputs.length; i += batchSize) {
    embeddings.push(...(await fetchEmbeddingBatch(inputs.slice(i, i + batchSize))));
  }
  return embeddings;
}

function openHybridSearchDb(): DatabaseSync {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH, { allowExtension: true });
  sqliteVec.load(db);
  return db;
}

function hybridSearchTables(document: LegalDocumentConfig): HybridSearchTables {
  const prefix = document.id.replace(/[^a-z0-9_]/gi, "_");
  return {
    articlesTable: `${prefix}_articles`,
    ftsTable: `${prefix}_articles_fts`,
    vecTable: `${prefix}_article_vecs`,
    metaTable: `${prefix}_search_meta`,
  };
}

function createHybridSearchSchema(db: DatabaseSync, tables: HybridSearchTables): void {
  db.exec(`
    create table if not exists ${tables.articlesTable} (
      rowid integer primary key,
      id text not null unique,
      title text not null,
      content text not null
    );
    create virtual table if not exists ${tables.ftsTable}
      using fts5(title, content, content='${tables.articlesTable}', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
    create table if not exists ${tables.metaTable} (
      key text primary key,
      value text not null
    );
  `);
}

function needsHybridSearchRebuild(
  db: DatabaseSync,
  tables: HybridSearchTables,
  articles: LegalDocumentNode[],
  expectedConfig: string,
): boolean {
  const count = db.prepare(`select count(*) as count from ${tables.articlesTable}`).get() as { count: number };
  const storedConfig = db
    .prepare(`select value from ${tables.metaTable} where key = 'embedding_config'`)
    .get() as { value: string } | undefined;

  return count.count !== articles.length || storedConfig?.value !== expectedConfig;
}

function ensureVectorTable(db: DatabaseSync, tables: HybridSearchTables, dimensions: number): void {
  db.exec(`create virtual table if not exists ${tables.vecTable} using vec0(embedding float[${dimensions}]);`);
}

async function rebuildHybridSearchIndex(
  db: DatabaseSync,
  tables: HybridSearchTables,
  articles: LegalDocumentNode[],
  dimensions: number,
  expectedConfig: string,
): Promise<void> {
  const embeddings = await embedTexts(articles.map((article) => `${article.title}\n${article.content ?? ""}`));

  db.exec(`drop table if exists ${tables.vecTable};`);
  db.exec(`create virtual table ${tables.vecTable} using vec0(embedding float[${dimensions}]);`);
  const insertArticle = db.prepare(`insert into ${tables.articlesTable}(rowid, id, title, content) values (?, ?, ?, ?)`);
  const insertFts = db.prepare(`insert into ${tables.ftsTable}(rowid, title, content) values (?, ?, ?)`);
  const insertVec = db.prepare(`insert into ${tables.vecTable}(rowid, embedding) values (?, ?)`);
  const upsertMeta = db.prepare(
    `insert into ${tables.metaTable}(key, value) values ('embedding_config', ?) on conflict(key) do update set value = excluded.value`,
  );

  db.exec("begin");
  try {
    db.exec(`delete from ${tables.articlesTable}; delete from ${tables.ftsTable};`);
    for (let i = 0; i < articles.length; i++) {
      const rowid = i + 1;
      const article = articles[i];
      insertArticle.run(rowid, article.id, article.title, article.content ?? "");
      insertFts.run(rowid, article.title, article.content ?? "");
      insertVec.run(BigInt(rowid), embeddingToBuffer(embeddings[i], dimensions));
    }
    upsertMeta.run(expectedConfig);
    db.exec("commit");
  } catch (err) {
    db.exec("rollback");
    throw err;
  }
}

function buildArticleRowMap(articles: LegalDocumentNode[]): Map<number, LegalDocumentNode> {
  const articleByRowid = new Map<number, LegalDocumentNode>();
  for (let i = 0; i < articles.length; i++) {
    articleByRowid.set(i + 1, articles[i]);
  }
  return articleByRowid;
}

async function ensureHybridSearchIndex(document: LegalDocumentConfig): Promise<IndexedDocument> {
  const existing = indexes.get(document);
  if (existing) return existing;

  const db = openHybridSearchDb();
  const tables = hybridSearchTables(document);
  const dimensions = embeddingDimensions();

  createHybridSearchSchema(db, tables);

  const articles = collectArticles(document.root);
  const expectedConfig = embeddingConfigKey(articles.length);

  if (needsHybridSearchRebuild(db, tables, articles, expectedConfig)) {
    await rebuildHybridSearchIndex(db, tables, articles, dimensions, expectedConfig);
  } else {
    ensureVectorTable(db, tables, dimensions);
  }

  const articleByRowid = buildArticleRowMap(articles);
  const indexed = { db, articleByRowid, embeddingDimensions: dimensions };
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

export async function hybridSearchArticles(
  document: LegalDocumentConfig,
  question: string,
  limit = DEFAULT_LIMIT,
): Promise<LegalDocumentNode[]> {
  return (await hybridSearchArticleCandidates(document, question, { limit })).map((candidate) => candidate.article);
}

export async function hybridSearchArticleCandidates(
  document: LegalDocumentConfig,
  question: string,
  options: HybridSearchOptions = {},
): Promise<ScoredLegalDocumentArticle[]> {
  const { db, articleByRowid, embeddingDimensions: dimensions } = await ensureHybridSearchIndex(document);
  const { ftsTable, vecTable } = hybridSearchTables(document);
  const limit = options.limit ?? DEFAULT_LIMIT;
  const minScore = options.minScore ?? 0;
  const scores = new Map<number, number>();

  const vectorRows = db
    .prepare(`select rowid, distance from ${vecTable} where embedding match ? order by distance limit ?`)
    .all(embeddingToBuffer((await embedTexts([question]))[0], dimensions), limit * 2) as {
    rowid: number;
    distance: number;
  }[];

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
    .filter(([, score]) => score >= minScore)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([rowid, score]) => {
      const article = articleByRowid.get(rowid);
      return article ? { article, score } : null;
    })
    .filter((candidate): candidate is ScoredLegalDocumentArticle => Boolean(candidate));
}
