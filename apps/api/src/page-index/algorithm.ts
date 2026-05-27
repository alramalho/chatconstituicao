import { generateObject } from "ai";
import { z } from "zod";
import { hybridSearchArticleCandidates } from "../agent/hybrid-search.js";
import { retrieveLegalDocumentCandidates } from "../agent/navigate.js";
import {
  buildAnswerSystemWithContext,
  buildAnswerUserPrompt,
  buildRerankPrompt,
} from "./prompts.js";
import {
  buildArticleContext,
  collectArticleRefs,
  expandWithDocumentNeighbors,
  mergeArticleRefs,
} from "./articles.js";
import { resolvePageIndexSettings, pageIndexSettingsFromEnv } from "./settings.js";
import { timeStage, withTimeout } from "./runtime.js";
import type {
  PageIndexAnswer,
  PageIndexArticleRef,
  PageIndexContextResult,
  PageIndexFetchResult,
  PageIndexInput,
} from "./types.js";

const AnswerOutput = z.object({
  answer: z.string(),
  citations: z.array(
    z.object({
      articleId: z.string(),
      articleNumber: z.string(),
      sourceQuote: z.string(),
    }),
  ),
});

const RerankOutput = z.object({
  selectedArticleIds: z.array(z.string()),
  rejectedArticleIds: z.array(z.string()),
  reasoning: z.string(),
});

export { pageIndexSettingsFromEnv };

export async function fetchCandidates(input: PageIndexInput): Promise<PageIndexFetchResult> {
  const settings = resolvePageIndexSettings(input.settings);
  const indexEnabled = settings.expandSource === "index" || settings.expandSource === "index-hybrid";
  const hybridEnabled = settings.expandSource === "hybrid" || settings.expandSource === "index-hybrid";
  let indexTimedOut = false;
  let indexError: string | undefined;

  input.logger?.info({ stage: "fetch", expandSource: settings.expandSource }, "starting candidate fetch");

  const indexPromise = indexEnabled
    ? withTimeout(
        retrieveLegalDocumentCandidates(input.document, input.question, {
          model: input.models.index,
          expandNeighborWindow: settings.expandNeighborWindow,
          maxExpandedArticles: settings.maxExpandedArticles,
          localSeedLimit: settings.localSeedLimit,
        }),
        settings.indexTimeoutMs,
        "index expansion",
      )
    : undefined;

  const hybridPromise = hybridEnabled
    ? hybridSearchArticleCandidates(input.document, input.question, {
        limit: settings.hybridCandidateLimit,
        minScore: settings.hybridLambda,
      })
    : undefined;

  const [indexResult, hybridResult] = await Promise.allSettled([indexPromise, hybridPromise]);
  const indexCandidates = indexResult.status === "fulfilled" && indexResult.value ? indexResult.value.articleRefs : [];
  if (indexResult.status === "rejected") {
    indexError = indexResult.reason instanceof Error ? indexResult.reason.message : String(indexResult.reason);
    indexTimedOut = indexError.includes("timed out");
  }

  const hybridCandidates =
    hybridResult.status === "fulfilled" && hybridResult.value
      ? hybridResult.value.map((candidate) => candidate.article)
      : [];
  if (hybridResult.status === "rejected") throw hybridResult.reason;

  const candidates = mergeArticleRefs(indexCandidates, hybridCandidates);
  input.logger?.info(
    {
      stage: "fetch",
      indexCount: indexCandidates.length,
      hybridCount: hybridCandidates.length,
      unionCount: candidates.length,
      indexTimedOut,
      indexError,
    },
    "finished candidate fetch",
  );

  return {
    candidates,
    indexCandidates,
    hybridCandidates: mergeArticleRefs(hybridCandidates),
    indexTimedOut,
    indexError,
  };
}

export async function rerankCandidates(
  input: PageIndexInput,
  candidates: PageIndexArticleRef[],
): Promise<PageIndexArticleRef[]> {
  const settings = resolvePageIndexSettings(input.settings);
  if (candidates.length <= settings.rerankLimit) return candidates;

  input.logger?.info({ stage: "rerank", candidateCount: candidates.length }, "starting candidate rerank");
  const { object } = await generateObject({
    model: input.models.rerank,
    schema: RerankOutput,
    prompt: buildRerankPrompt({
      question: input.question,
      candidates,
      limit: settings.rerankLimit,
    }),
  });

  const byId = new Map(candidates.map((article) => [article.id, article]));
  const selected = object.selectedArticleIds
    .map((id) => byId.get(id))
    .filter((article): article is PageIndexArticleRef => Boolean(article));

  const result = selected.length ? selected : candidates.slice(0, settings.rerankLimit);
  input.logger?.info({ stage: "rerank", selectedCount: result.length }, "finished candidate rerank");
  return result;
}

export function injectCandidates(input: PageIndexInput, reranked: PageIndexArticleRef[]): PageIndexArticleRef[] {
  const settings = resolvePageIndexSettings(input.settings);
  const allArticles = collectArticleRefs(input.document.root);
  const answerArticleRefs = expandWithDocumentNeighbors(reranked, allArticles, settings.finalNeighborWindow);
  input.logger?.info({ stage: "inject", finalCount: answerArticleRefs.length }, "prepared answer context");
  return answerArticleRefs;
}

export async function preparePageIndexContext(input: PageIndexInput): Promise<PageIndexContextResult> {
  const timings: Record<string, number> = {};
  const fetched = await timeStage(timings, "fetchMs", () => fetchCandidates(input));
  const rerankedArticleRefs = await timeStage(timings, "rerankMs", () => rerankCandidates(input, fetched.candidates));
  const answerArticleRefs = await timeStage(timings, "injectMs", async () => injectCandidates(input, rerankedArticleRefs));
  const context = buildArticleContext(answerArticleRefs);

  return {
    context,
    answerArticleRefs,
    fetched,
    rerankedArticleRefs,
    timings,
  };
}

export async function answerWithPageIndex(input: PageIndexInput): Promise<PageIndexAnswer> {
  const contextResult = await preparePageIndexContext(input);

  const { object } = await timeStage(contextResult.timings, "answerMs", () =>
    generateObject({
      model: input.models.answer,
      schema: AnswerOutput,
      system: buildAnswerSystemWithContext({
        document: input.document,
        context: contextResult.context,
      }),
      messages: [
        {
          role: "user",
          content: buildAnswerUserPrompt(input.question),
        },
      ],
    }),
  );

  return {
    answer: object.answer,
    citations: object.citations,
    retrievedArticles: contextResult.answerArticleRefs.map((article) => article.id),
    selectedSourceArticles: object.citations.map((citation) => citation.articleId).filter(Boolean),
    retrievalDebug: {
      expand: {
        source: resolvePageIndexSettings(input.settings).expandSource,
        indexCount: contextResult.fetched.indexCandidates.length,
        hybridCount: contextResult.fetched.hybridCandidates.length,
        unionCount: contextResult.fetched.candidates.length,
        contractedCount: contextResult.rerankedArticleRefs.length,
        finalCount: contextResult.answerArticleRefs.length,
        indexArticleIds: contextResult.fetched.indexCandidates.map((article) => article.id),
        hybridArticleIds: contextResult.fetched.hybridCandidates.map((article) => article.id),
        contractedArticleIds: contextResult.rerankedArticleRefs.map((article) => article.id),
        finalArticleIds: contextResult.answerArticleRefs.map((article) => article.id),
        indexTimedOut: contextResult.fetched.indexTimedOut,
        indexError: contextResult.fetched.indexError,
      },
      timings: contextResult.timings,
    },
  };
}
