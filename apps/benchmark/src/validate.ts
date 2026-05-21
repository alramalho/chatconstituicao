import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getArticle } from "./article-utils.js";
import type { BenchmarkQuestion } from "./types.js";

const dataPath = resolve(import.meta.dirname, "../data/codigo-civil.dataset.json");
const questions = JSON.parse(readFileSync(dataPath, "utf-8")) as BenchmarkQuestion[];

const ids = new Set<string>();

if (questions.length !== 10) {
  throw new Error(`Expected exactly 10 manually approved questions, found ${questions.length}`);
}

for (const question of questions) {
  if (ids.has(question.id)) throw new Error(`Duplicate question id: ${question.id}`);
  ids.add(question.id);

  if (!question.question.trim()) throw new Error(`Empty question: ${question.id}`);
  if (!question.expectedAnswer.trim()) throw new Error(`Empty expectedAnswer: ${question.id}`);
  if (!question.expectedArticles.length) throw new Error(`No expectedArticles: ${question.id}`);

  for (const articleId of question.expectedArticles) {
    getArticle(articleId);
  }
}

console.log(`Validated ${questions.length} Código Civil benchmark questions.`);
