import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createProvider, getAvailableProviders } from "./providers/index.js";
import { judge } from "./judge.js";
import { modelProviderLabel } from "./model.js";
import type { BenchmarkQuestion, JudgeResult, ProviderAnswer, RunResult } from "./types.js";

const dataPath = resolve(import.meta.dirname, "../data/codigo-civil.dataset.json");
const runsDir = resolve(import.meta.dirname, "../data/runs");

const maxRetries = 5;
const maxBackoffMs = 30_000;
const defaultConcurrency = Number.parseInt(process.env.BENCHMARK_CONCURRENCY ?? "2", 10);
const defaultJudgeConcurrency = Number.parseInt(process.env.BENCHMARK_JUDGE_CONCURRENCY ?? "3", 10);

async function sourceArticleIds(answer: ProviderAnswer): Promise<string[] | undefined> {
  const { citationsToArticleIds, normalizeArticleIds } = await import("./article-utils.js");
  const selected = normalizeArticleIds(answer.selectedSourceArticles);
  if (selected.length) return selected;

  const cited = citationsToArticleIds(answer.citations);
  if (cited.length) return cited;

  return answer.retrievedArticles;
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      const isRateLimit = err?.status === 429 || err?.statusCode === 429 || msg.includes("429") || msg.includes("rate_limit");
      if (!isRateLimit || attempt === maxRetries) throw err;
      const delay = Math.min(1000 * 2 ** attempt, maxBackoffMs);
      console.log(`    rate-limited in ${label}; retrying in ${Math.round(delay / 1000)}s`);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
    }
  }
  throw new Error("unreachable");
}

function loadQuestions(options: { limit?: number; questionIds?: string[] }): BenchmarkQuestion[] {
  let questions = JSON.parse(readFileSync(dataPath, "utf-8")) as BenchmarkQuestion[];
  if (options.questionIds?.length) {
    const ids = new Set(options.questionIds);
    questions = questions.filter((question) => ids.has(question.id));
  }
  return options.limit ? questions.slice(0, options.limit) : questions;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await fn(items[index], index);
      }
    }),
  );

  return results;
}

async function runProvider(
  providerName: string,
  questions: BenchmarkQuestion[],
  concurrency: number,
): Promise<ProviderAnswer[]> {
  const provider = createProvider(providerName);

  return mapWithConcurrency(questions, concurrency, async (question) => {
    const startedAt = Date.now();
    console.log(`  [${provider.name}] ${question.id}: ${question.question.slice(0, 80)}...`);
    try {
      const result = await withRetry(() => provider.answer(question), provider.name);
      const answer: ProviderAnswer = {
        questionId: question.id,
        provider: provider.name,
        latencyMs: Date.now() - startedAt,
        ...result,
      };
      const expandDebug = result.retrievalDebug?.expand as
        | { indexCount?: number; hybridCount?: number; unionCount?: number; contractedCount?: number; finalCount?: number }
        | undefined;
      const expandLabel = expandDebug
        ? ` index=${expandDebug.indexCount ?? 0} hybrid=${expandDebug.hybridCount ?? 0} union=${expandDebug.unionCount ?? 0} contracted=${expandDebug.contractedCount ?? 0} final=${expandDebug.finalCount ?? 0}`
        : "";
      console.log(`    ok ${Date.now() - startedAt}ms${expandLabel}`);
      return answer;
    } catch (err) {
      const answer: ProviderAnswer = {
        questionId: question.id,
        provider: provider.name,
        latencyMs: Date.now() - startedAt,
        answer: `ERROR: ${err}`,
      };
      console.log(`    error ${err}`);
      return answer;
    }
  });
}

async function judgeAnswers(
  questions: BenchmarkQuestion[],
  answers: ProviderAnswer[],
  skipJudge: boolean,
  concurrency: number,
): Promise<JudgeResult[]> {
  const questionsById = new Map(questions.map((question) => [question.id, question]));

  if (skipJudge) {
    const { citationRecall, quoteSupport, retrievalF2, retrievalPrecision, retrievalRecall } = await import("./article-utils.js");
    return Promise.all(answers.map(async (answer) => {
      const question = questionsById.get(answer.questionId)!;
      const citationScore = citationRecall(answer.citations, question.expectedArticles);
      const quoteSupportScore = quoteSupport(answer.citations);
      const sourceArticles = await sourceArticleIds(answer);
      return {
        questionId: answer.questionId,
        provider: answer.provider,
        answerScore: 0,
        citationScore,
        quoteSupportScore,
        retrievalRecall: retrievalRecall(sourceArticles, question.expectedArticles),
        retrievalPrecision: retrievalPrecision(sourceArticles, question.expectedArticles),
        retrievalF2: retrievalF2(sourceArticles, question.expectedArticles),
        overallScore: 0.67 * citationScore + 0.33 * quoteSupportScore,
        explanation: "Judge skipped; retrieval metrics use final selected/cited source articles.",
      };
    }));
  }

  return mapWithConcurrency(answers, concurrency, async (answer) => {
    const question = questionsById.get(answer.questionId)!;
    console.log(`  [judge] ${answer.provider}/${question.id}`);
    const result = await withRetry(() => judge(question, answer), "judge");
    console.log(`    score ${(result.overallScore * 100).toFixed(1)}%`);
    return result;
  });
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function groupedAverage(
  questions: BenchmarkQuestion[],
  results: JudgeResult[],
  key: "difficulty" | "reasoningType",
): Record<string, { count: number; avgOverallScore: number }> {
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const grouped: Record<string, number[]> = {};
  for (const result of results) {
    const group = questionsById.get(result.questionId)![key];
    grouped[group] ??= [];
    grouped[group].push(result.overallScore);
  }
  return Object.fromEntries(
    Object.entries(grouped).map(([group, scores]) => [
      group,
      { count: scores.length, avgOverallScore: average(scores) },
    ]),
  );
}

function summarize(questions: BenchmarkQuestion[], answers: ProviderAnswer[], results: JudgeResult[]): RunResult["summary"] {
  const retrievalValues = results
    .map((result) => result.retrievalRecall)
    .filter((value): value is number => value !== undefined);
  const retrievalPrecisionValues = results
    .map((result) => result.retrievalPrecision)
    .filter((value): value is number => value !== undefined);
  const retrievalF2Values = results
    .map((result) => result.retrievalF2)
    .filter((value): value is number => value !== undefined);

  return {
    totalQuestions: results.length,
    averageOverallScore: average(results.map((result) => result.overallScore)),
    averageAnswerScore: average(results.map((result) => result.answerScore)),
    averageCitationScore: average(results.map((result) => result.citationScore)),
    averageQuoteSupportScore: average(results.map((result) => result.quoteSupportScore)),
    averageRetrievalRecall: retrievalValues.length ? average(retrievalValues) : undefined,
    averageRetrievalPrecision: retrievalPrecisionValues.length ? average(retrievalPrecisionValues) : undefined,
    averageRetrievalF2: retrievalF2Values.length ? average(retrievalF2Values) : undefined,
    averageLatencyMs: average(answers.map((answer) => answer.latencyMs)),
    medianLatencyMs: median(answers.map((answer) => answer.latencyMs)),
    byDifficulty: groupedAverage(questions, results, "difficulty"),
    byReasoningType: groupedAverage(questions, results, "reasoningType"),
  };
}

function printSummary(runs: RunResult[]): void {
  console.log("\nCódigo Civil Benchmark");
  console.log("=".repeat(72));
  for (const run of runs) {
    console.log(`\n${run.provider}`);
    console.log(`  overall: ${(run.summary.averageOverallScore * 100).toFixed(1)}%`);
    console.log(`  answer: ${(run.summary.averageAnswerScore * 100).toFixed(1)}%`);
    console.log(`  citations: ${(run.summary.averageCitationScore * 100).toFixed(1)}%`);
    console.log(`  quote support: ${(run.summary.averageQuoteSupportScore * 100).toFixed(1)}%`);
    if (run.summary.averageRetrievalRecall !== undefined) {
      console.log(`  retrieval recall: ${(run.summary.averageRetrievalRecall * 100).toFixed(1)}%`);
    }
    if (run.summary.averageRetrievalPrecision !== undefined) {
      console.log(`  retrieval precision: ${(run.summary.averageRetrievalPrecision * 100).toFixed(1)}%`);
    }
    if (run.summary.averageRetrievalF2 !== undefined) {
      console.log(`  retrieval F2: ${(run.summary.averageRetrievalF2 * 100).toFixed(1)}%`);
    }
    console.log(`  latency avg: ${run.summary.averageLatencyMs.toFixed(0)}ms`);
    console.log(`  latency median: ${run.summary.medianLatencyMs.toFixed(0)}ms`);
  }
  console.log("=".repeat(72));
}

export async function run(options: {
  providers?: string[];
  limit?: number;
  questionIds?: string[];
  skipJudge?: boolean;
  concurrency?: number;
  judgeConcurrency?: number;
}): Promise<void> {
  const providerNames = options.providers ?? getAvailableProviders();
  const questions = loadQuestions({ limit: options.limit, questionIds: options.questionIds });
  const concurrency = options.concurrency ?? defaultConcurrency;
  const judgeConcurrency = options.judgeConcurrency ?? defaultJudgeConcurrency;
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runs: RunResult[] = [];

  mkdirSync(runsDir, { recursive: true });
  console.log(`Código Civil benchmark: ${questions.length} questions; providers: ${providerNames.join(", ")}`);
  console.log(`model provider: ${modelProviderLabel()}`);
  console.log(`concurrency: answers=${concurrency}, judge=${judgeConcurrency}`);

  for (const providerName of providerNames) {
    console.log(`\n--- ${providerName} ---`);
    const answers = await runProvider(providerName, questions, concurrency);
    const results = await judgeAnswers(questions, answers, options.skipJudge ?? false, judgeConcurrency);
    const runResult: RunResult = {
      runId,
      provider: providerName,
      timestamp: new Date().toISOString(),
      answers,
      results,
      summary: summarize(questions, answers, results),
    };
    runs.push(runResult);

    const outPath = resolve(runsDir, `${runId}_${providerName}.json`);
    writeFileSync(outPath, JSON.stringify(runResult, null, 2));
    console.log(`saved ${outPath}`);
  }

  printSummary(runs);
}
