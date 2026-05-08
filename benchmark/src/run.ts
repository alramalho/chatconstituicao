import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { createProvider, getAvailableProviders } from "./providers/index.js";
import { judge } from "./judge.js";
import type { Question, ProviderAnswer, JudgeResult, RunResult } from "./types.js";

const DATA_PATH = resolve(import.meta.dirname, "../data/questions.json");
const RUNS_DIR = resolve(import.meta.dirname, "../data/runs");

const MAX_RETRIES = 5;
const MAX_BACKOFF_MS = 30_000;

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const is429 = err?.statusCode === 429 || err?.status === 429 ||
        String(err).includes("429") || String(err).includes("rate_limit");
      if (!is429 || attempt === MAX_RETRIES) throw err;
      const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
      console.log(`    ⏳ ${label} rate-limited, retrying in ${(delay / 1000).toFixed(0)}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

function loadQuestions(opts: { limit?: number; questionIds?: string[] }): Question[] {
  const raw = readFileSync(DATA_PATH, "utf-8");
  let questions: Question[] = JSON.parse(raw);
  if (opts.questionIds) {
    questions = questions.filter((q) => opts.questionIds!.includes(q.id));
  }
  return opts.limit ? questions.slice(0, opts.limit) : questions;
}

async function runProvider(
  providerName: string,
  questions: Question[]
): Promise<ProviderAnswer[]> {
  const provider = createProvider(providerName);
  const answers: ProviderAnswer[] = [];

  for (const q of questions) {
    const start = Date.now();
    console.log(`  [${provider.name}] ${q.id}: ${q.question.slice(0, 60)}...`);
    try {
      const answer = await withRetry(() => provider.answer(q.question), provider.name);
      answers.push({
        questionId: q.id,
        answer,
        provider: provider.name,
        latencyMs: Date.now() - start,
      });
      console.log(`    ✓ ${Date.now() - start}ms`);
    } catch (err) {
      console.error(`    ✗ Error: ${err}`);
      answers.push({
        questionId: q.id,
        answer: `ERROR: ${err}`,
        provider: provider.name,
        latencyMs: Date.now() - start,
      });
    }
  }

  return answers;
}

async function evaluateAnswers(
  questions: Question[],
  answers: ProviderAnswer[]
): Promise<JudgeResult[]> {
  const results: JudgeResult[] = [];
  const questionsMap = new Map(questions.map((q) => [q.id, q]));

  for (const ans of answers) {
    const q = questionsMap.get(ans.questionId)!;
    console.log(`  [judge] ${ans.provider}/${q.id}...`);
    const result = await withRetry(() => judge(
      q.id,
      ans.provider,
      q.question,
      q.expected_answer,
      ans.answer
    ), "judge");
    results.push(result);
    console.log(`    → ${result.score} (${result.explanation.slice(0, 80)})`);
  }

  return results;
}

function buildSummary(
  questions: Question[],
  results: JudgeResult[],
  answers: ProviderAnswer[]
): RunResult["summary"] {
  const questionsMap = new Map(questions.map((q) => [q.id, q]));
  const answersMap = new Map(answers.map((a) => [`${a.provider}/${a.questionId}`, a]));

  const byCategory: Record<string, { total: number; sum: number }> = {};
  const byDifficulty: Record<string, { total: number; sum: number }> = {};
  let totalLatency = 0;

  for (const r of results) {
    const q = questionsMap.get(r.questionId)!;
    const ans = answersMap.get(`${r.provider}/${r.questionId}`);

    if (!byCategory[q.category]) byCategory[q.category] = { total: 0, sum: 0 };
    byCategory[q.category].total++;
    byCategory[q.category].sum += r.score;

    if (!byDifficulty[q.difficulty]) byDifficulty[q.difficulty] = { total: 0, sum: 0 };
    byDifficulty[q.difficulty].total++;
    byDifficulty[q.difficulty].sum += r.score;

    totalLatency += ans?.latencyMs ?? 0;
  }

  return {
    totalQuestions: results.length,
    averageScore: results.reduce((s, r) => s + r.score, 0) / results.length,
    averageLatencyMs: totalLatency / results.length,
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [
        k,
        { count: v.total, avgScore: v.sum / v.total },
      ])
    ),
    byDifficulty: Object.fromEntries(
      Object.entries(byDifficulty).map(([k, v]) => [
        k,
        { count: v.total, avgScore: v.sum / v.total },
      ])
    ),
  };
}

function printComparison(runResults: RunResult[]) {
  console.log("\n" + "=".repeat(60));
  console.log("CONSTITUIÇÃO EVAL — RESULTS");
  console.log("=".repeat(60));

  for (const run of runResults) {
    console.log(`\n▸ Provider: ${run.provider}`);
    console.log(`  Score: ${(run.summary.averageScore * 100).toFixed(1)}%`);
    console.log(`  Avg latency: ${run.summary.averageLatencyMs.toFixed(0)}ms`);
    console.log(`  Questions: ${run.summary.totalQuestions}`);

    console.log("  By difficulty:");
    for (const [diff, stats] of Object.entries(run.summary.byDifficulty)) {
      console.log(`    ${diff}: ${(stats.avgScore * 100).toFixed(1)}% (n=${stats.count})`);
    }
  }

  if (runResults.length === 2) {
    const [a, b] = runResults;
    const diff = a.summary.averageScore - b.summary.averageScore;
    console.log("\n" + "-".repeat(60));
    console.log(
      `Delta (${a.provider} vs ${b.provider}): ${diff > 0 ? "+" : ""}${(diff * 100).toFixed(1)}pp`
    );
  }

  console.log("=".repeat(60) + "\n");
}

export async function run(options: {
  providers?: string[];
  limit?: number;
  questionIds?: string[];
}) {
  const providerNames = options.providers ?? getAvailableProviders();
  const questions = loadQuestions({ limit: options.limit, questionIds: options.questionIds });

  console.log(
    `\nConstituiçãoEval: ${questions.length} questions, providers: [${providerNames.join(", ")}]\n`
  );

  mkdirSync(RUNS_DIR, { recursive: true });
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const allRunResults: RunResult[] = [];

  for (const providerName of providerNames) {
    console.log(`\n--- Running provider: ${providerName} ---`);
    const answers = await runProvider(providerName, questions);
    console.log(`\n--- Evaluating: ${providerName} ---`);
    const results = await evaluateAnswers(questions, answers);

    const summary = buildSummary(questions, results, answers);
    const runResult: RunResult = {
      runId,
      provider: providerName,
      timestamp: new Date().toISOString(),
      results,
      summary,
    };
    allRunResults.push(runResult);

    const outPath = resolve(RUNS_DIR, `${runId}_${providerName}.json`);
    writeFileSync(outPath, JSON.stringify(runResult, null, 2));
    console.log(`Saved: ${outPath}`);
  }

  printComparison(allRunResults);
}
