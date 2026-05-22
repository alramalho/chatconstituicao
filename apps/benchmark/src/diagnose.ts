import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hybridSearchArticles } from "../../api/src/agent/hybrid-search.js";
import { LEGAL_DOCUMENTS } from "../../api/src/data/documents.js";
import type { BenchmarkQuestion, RunResult } from "./types.js";

const dataPath = resolve(import.meta.dirname, "../data/codigo-civil.dataset.json");
const runsDir = resolve(import.meta.dirname, "../data/runs");
const document = LEGAL_DOCUMENTS["codigo-civil"];
const questions = JSON.parse(readFileSync(dataPath, "utf-8")) as BenchmarkQuestion[];
const allArticles = (document.root.children ?? []).flatMap((chunk) => chunk.children ?? []);
const articleIndexById = new Map(allArticles.map((article, index) => [article.id, index]));

function recall(retrieved: string[], expected: string[]): number {
  const retrievedSet = new Set(retrieved);
  const hits = expected.filter((id) => retrievedSet.has(id)).length;
  return hits / expected.length;
}

function precision(retrieved: string[], expected: string[]): number {
  const retrievedSet = new Set(retrieved);
  if (retrievedSet.size === 0) return 0;
  const expectedSet = new Set(expected);
  const hits = [...retrievedSet].filter((id) => expectedSet.has(id)).length;
  return hits / retrievedSet.size;
}

function f2(precisionValue: number, recallValue: number): number {
  if (precisionValue === 0 && recallValue === 0) return 0;
  return (5 * precisionValue * recallValue) / (4 * precisionValue + recallValue);
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function latestPageIndexRun(): RunResult | undefined {
  const explicitPath = process.argv.find((arg) => arg.endsWith(".json"));
  if (explicitPath) {
    return JSON.parse(readFileSync(resolve(explicitPath), "utf-8")) as RunResult;
  }

  const candidates = ["2026-05-21T09-46-51-843Z_page-index.json", "2026-05-21T09-45-41-307Z_page-index.json"];
  for (const file of candidates) {
    try {
      return JSON.parse(readFileSync(resolve(runsDir, file), "utf-8")) as RunResult;
    } catch {
      // Try the next known run.
    }
  }

  return undefined;
}

const run = latestPageIndexRun();
const runAnswers = new Map(run?.answers.map((answer) => [answer.questionId, answer]) ?? []);
const ks = [5, 12, 20, 40];
const hybridScores: Record<number, number[]> = Object.fromEntries(ks.map((k) => [k, []]));
const currentScores: number[] = [];
const currentExpandedScores: number[] = [];
const currentPrecisionScores: number[] = [];
const currentF2Scores: number[] = [];

function expandNeighbors(articleIds: string[], window = 8): string[] {
  const expanded = new Set(articleIds);
  for (const id of articleIds) {
    const index = articleIndexById.get(id);
    if (index === undefined) continue;
    for (let offset = -window; offset <= window; offset++) {
      const article = allArticles[index + offset];
      if (article?.id) expanded.add(article.id);
    }
  }
  return [...expanded];
}

console.log("Código Civil Retrieval Diagnostic");
console.log("=".repeat(96));
console.log("id,current,current+neighbors,hybrid@5,hybrid@12,hybrid@20,hybrid@40,expected,misses@40");

for (const question of questions) {
  const answer = runAnswers.get(question.id);
  const current = answer?.retrievedArticles ? recall(answer.retrievedArticles, question.expectedArticles) : Number.NaN;
  if (!Number.isNaN(current)) {
    const precisionValue = precision(answer!.retrievedArticles!, question.expectedArticles);
    currentScores.push(current);
    currentPrecisionScores.push(precisionValue);
    currentF2Scores.push(f2(precisionValue, current));
  }
  const currentExpanded = answer?.retrievedArticles
    ? recall(expandNeighbors(answer.retrievedArticles), question.expectedArticles)
    : Number.NaN;
  if (!Number.isNaN(currentExpanded)) currentExpandedScores.push(currentExpanded);

  const rowPromises = ks.map((k) => {
    return { k, promise: hybridSearchArticles(document, question.question, k) };
  });
  const rowScores = await Promise.all(
    rowPromises.map(async ({ k, promise }) => {
      const retrieved = (await promise).map((article) => article.id);
      const score = recall(retrieved, question.expectedArticles);
      hybridScores[k].push(score);
      return { k, score, retrieved };
    }),
  );

  const retrievedAt40 = rowScores.find((row) => row.k === 40)?.retrieved ?? [];
  const misses = question.expectedArticles.filter((id) => !retrievedAt40.includes(id));
  console.log(
    [
      question.id,
      Number.isNaN(current) ? "n/a" : current.toFixed(2),
      Number.isNaN(currentExpanded) ? "n/a" : currentExpanded.toFixed(2),
      ...rowScores.map((row) => row.score.toFixed(2)),
      question.expectedArticles.join("|"),
      misses.join("|") || "-",
    ].join(","),
  );
}

console.log("=".repeat(96));
if (currentScores.length) console.log(`current page-index retrieval recall: ${(average(currentScores) * 100).toFixed(1)}%`);
if (currentPrecisionScores.length) {
  console.log(`current page-index retrieval precision: ${(average(currentPrecisionScores) * 100).toFixed(1)}%`);
  console.log(`current page-index retrieval F2: ${(average(currentF2Scores) * 100).toFixed(1)}%`);
}
if (currentExpandedScores.length) {
  console.log(`current page-index + numeric neighbors recall: ${(average(currentExpandedScores) * 100).toFixed(1)}%`);
}
for (const k of ks) {
  console.log(`hybrid@${k} recall: ${(average(hybridScores[k]) * 100).toFixed(1)}%`);
}
