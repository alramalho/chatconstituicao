import { generateObject } from "ai";
import { z } from "zod";
import {
  buildExpectedSources,
  citationRecall,
  citationsToArticleIds,
  normalizeArticleIds,
  quoteSupport,
  retrievalF2,
  retrievalPrecision,
  retrievalRecall,
} from "./article-utils.js";
import { benchmarkModel, defaultModel } from "./model.js";
import type { BenchmarkQuestion, JudgeResult, ProviderAnswer } from "./types.js";

const judgeModel = process.env.BENCHMARK_JUDGE_MODEL ?? defaultModel("openai/gpt-5.4-mini");

const JudgeOutput = z.object({
  answerScore: z.number().min(0).max(1),
  explanation: z.string(),
});

export async function judge(question: BenchmarkQuestion, answer: ProviderAnswer): Promise<JudgeResult> {
  const deterministicCitationScore = citationRecall(answer.citations, question.expectedArticles);
  const deterministicQuoteSupport = quoteSupport(answer.citations);
  const selectedSources = normalizeArticleIds(answer.selectedSourceArticles);
  const citedSources = citationsToArticleIds(answer.citations);
  const sourceArticles = selectedSources.length ? selectedSources : citedSources.length ? citedSources : answer.retrievedArticles;
  const deterministicRetrievalRecall = retrievalRecall(sourceArticles, question.expectedArticles);
  const deterministicRetrievalPrecision = retrievalPrecision(sourceArticles, question.expectedArticles);
  const deterministicRetrievalF2 = retrievalF2(sourceArticles, question.expectedArticles);

  const { object } = await generateObject({
    model: benchmarkModel(judgeModel),
    schema: JudgeOutput,
    prompt: `You are judging an answer about the Portuguese Código Civil.

Question:
${question.question}

Ground-truth answer:
${question.expectedAnswer}

Required source articles:
${question.expectedArticles.join(", ")}

Relevant article text from the source of truth:
${buildExpectedSources(question.expectedArticles)}

Candidate answer:
${answer.answer}

Candidate structured citations:
${JSON.stringify(answer.citations ?? [], null, 2)}

Grade factual correctness from 0 to 1:
- 1.0: fully correct and reconciles all required article constraints
- 0.75: substantively correct but misses a minor qualification
- 0.5: partially correct or incomplete
- 0.25: mostly wrong but contains one relevant point
- 0.0: wrong, unsupported, or contradicted by the required articles

Do not reward citations directly in answerScore; citations are scored separately.`,
  });

  const overallScore = 0.7 * object.answerScore + 0.2 * deterministicCitationScore + 0.1 * deterministicQuoteSupport;

  return {
    questionId: question.id,
    provider: answer.provider,
    answerScore: object.answerScore,
    citationScore: deterministicCitationScore,
    quoteSupportScore: deterministicQuoteSupport,
    retrievalRecall: deterministicRetrievalRecall,
    retrievalPrecision: deterministicRetrievalPrecision,
    retrievalF2: deterministicRetrievalF2,
    overallScore,
    explanation: object.explanation,
  };
}
